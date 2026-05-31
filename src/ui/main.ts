import { GraphState, NodeState, Edge, NodeID, PinType } from '../core/ast.js';
import { RenderingContext, DraggingConnection, Viewport } from './types.js';
import { evaluateGraph } from '../engine/evaluate.js';
import { isCompatible } from '../engine/validation.js';
import { StandardNodes } from '../registry/index.js';
import { createDispatcher } from '../events/dispatcher.js';
import { createRenderer } from './renderer.js';

// ============================================================================
// INITIAL DATA & GRAPH CONFIGURATION
// ============================================================================

// A beautiful pre-configured default graph state
let currentGraph: GraphState = {
    nodes: {
        'nodeA': {
            id: 'nodeA',
            type: 'math/add',
            params: { a: 10, b: 20 },
            ui: { x: 100, y: 80, title: 'Input Adder' }
        },
        'nodeB': {
            id: 'nodeB',
            type: 'math/multiply',
            params: { b: 5 },
            ui: { x: 380, y: 150, title: 'Scaling Node' }
        },
        'nodeLog': {
            id: 'nodeLog',
            type: 'system/log',
            params: {},
            ui: { x: 650, y: 180, title: 'Output Logger' }
        },
        'nodeRogue': {
            id: 'nodeRogue',
            type: 'system/delay',
            params: { ms: 999999 }, // High delay to demonstrate watchdog cull!
            ui: { x: 100, y: 350, title: 'Rogue Delayer' }
        }
    },
    edges: [
        { id: 'edge1', sourceNodeId: 'nodeA', sourcePinId: 'out', targetNodeId: 'nodeB', targetPinId: 'a' },
        { id: 'edge2', sourceNodeId: 'nodeB', sourcePinId: 'out', targetNodeId: 'nodeLog', targetPinId: 'msg' }
    ]
};

// ============================================================================
// UI STATE VARIABLES
// ============================================================================

let viewport: Viewport = { x: 0, y: 0, zoom: 1.0 };
let selectedNodeId: string | null = null;
let hoveredNodeId: string | null = null;
let hoveredPin: { nodeId: string; pinId: string; isInput: boolean } | null = null;
let draggingConnection: DraggingConnection | null = null;
let nodeErrors: Record<string, string> = {};
let latestExecutionState: Record<string, any> = {};

let isPanning = false;
let panStartX = 0;
let panStartY = 0;
let viewportStartX = 0;
let viewportStartY = 0;

let draggedNodeId: string | null = null;
let dragOffsetX = 0;
let dragOffsetY = 0;

let spawnX = 0;
let spawnY = 0;

// Module-level rendering context object
let renderingContext: RenderingContext;

// Dynamic Dom elements
let canvas: HTMLCanvasElement;
let ctx: CanvasRenderingContext2D;

// Helper to translate screen pixels to world coordinates
function screenToWorld(sx: number, sy: number) {
    return {
        x: (sx - viewport.x) / viewport.zoom,
        y: (sy - viewport.y) / viewport.zoom
    };
}

// ============================================================================
// UNDO/REDO HISTORY STACKS
// ============================================================================

const undoStack: GraphState[] = [];
const redoStack: GraphState[] = [];

// Track transient states to prevent flooding the history stack
let preDragGraphState: GraphState | null = null;
let dragHasMoved = false;
let dragNodeOriginalX = 0;
let dragNodeOriginalY = 0;

let preEditGraphState: GraphState | null = null;

function pushToHistory() {
    const cloned = JSON.parse(JSON.stringify(currentGraph)) as GraphState;
    undoStack.push(cloned);
    
    // Enforce history threshold size
    if (undoStack.length > 50) {
        undoStack.shift();
    }
    
    // Clear redo history when a new structural action occurs
    redoStack.length = 0;
    updateUndoRedoButtons();
}

function undo() {
    if (undoStack.length === 0) return;
    
    const currentCloned = JSON.parse(JSON.stringify(currentGraph)) as GraphState;
    redoStack.push(currentCloned);

    const prev = undoStack.pop()!;
    currentGraph = prev;

    // Deselect if node no longer exists in history
    if (selectedNodeId && !currentGraph.nodes[selectedNodeId]) {
        selectedNodeId = null;
    }
    syncContextState();

    logToTerminal(`Undo action performed`, 'system-msg');
    updateUndoRedoButtons();
    updateInspector();
    runExecutionPipeline().catch(console.error);
}

function redo() {
    if (redoStack.length === 0) return;

    const currentCloned = JSON.parse(JSON.stringify(currentGraph)) as GraphState;
    undoStack.push(currentCloned);

    const next = redoStack.pop()!;
    currentGraph = next;

    // Deselect if node no longer exists in history
    if (selectedNodeId && !currentGraph.nodes[selectedNodeId]) {
        selectedNodeId = null;
    }
    syncContextState();

    logToTerminal(`Redo action performed`, 'system-msg');
    updateUndoRedoButtons();
    updateInspector();
    runExecutionPipeline().catch(console.error);
}

function updateUndoRedoButtons() {
    const btnUndo = document.getElementById('btn-undo') as HTMLButtonElement;
    const btnRedo = document.getElementById('btn-redo') as HTMLButtonElement;
    if (btnUndo) btnUndo.disabled = undoStack.length === 0;
    if (btnRedo) btnRedo.disabled = redoStack.length === 0;
}

function syncContextState() {
    if (renderingContext) {
        renderingContext.selectedNodeId = selectedNodeId;
        renderingContext.nodeErrors = nodeErrors;
    }
}

// ============================================================================
// CANVAS PIN POSITION LOOKUPS
// ============================================================================
// Import layout constants from canvas.js
const NODE_WIDTH = 180;
const ROW_HEIGHT = 22;
const HEADER_HEIGHT = 32;

function getNodeHeight(node: NodeState): number {
    const nodeDef = StandardNodes[node.type];
    if (!nodeDef) return 70;
    const numInputs = Object.keys(nodeDef.requires).length;
    const numOutputs = Object.keys(nodeDef.provides).length;
    return HEADER_HEIGHT + (Math.max(numInputs, numOutputs, 1) * ROW_HEIGHT) + 12;
}

function getInputPinCoords(node: NodeState, pinId: string): { x: number, y: number } {
    const nodeDef = StandardNodes[node.type];
    const inputs = nodeDef ? Object.keys(nodeDef.requires) : [];
    const idx = inputs.indexOf(pinId);
    const nx = node.ui?.x ?? 0;
    const ny = node.ui?.y ?? 0;
    return {
        x: nx,
        y: ny + HEADER_HEIGHT + 12 + Math.max(0, idx) * ROW_HEIGHT
    };
}

function getOutputPinCoords(node: NodeState, pinId: string): { x: number, y: number } {
    const nodeDef = StandardNodes[node.type];
    const outputs = nodeDef ? Object.keys(nodeDef.provides) : [];
    const idx = outputs.indexOf(pinId);
    const nx = node.ui?.x ?? 0;
    const ny = node.ui?.y ?? 0;
    const nw = node.ui?.width ?? NODE_WIDTH;
    return {
        x: nx + nw,
        y: ny + HEADER_HEIGHT + 12 + Math.max(0, idx) * ROW_HEIGHT
    };
}

// ============================================================================
// CORE EVALUATION CONTROLLER
// ============================================================================

async function runExecutionPipeline() {
    const statusDot = document.getElementById('engine-status-dot');
    const statusText = document.getElementById('engine-status-text');
    const timeValue = document.getElementById('execution-time-value');
    
    if (statusDot && statusText) {
        statusDot.className = 'status-dot running';
        statusText.textContent = 'Engine: Running...';
    }

    const tStart = performance.now();
    const globalInputs = {
        // Optional globally injected starting states could go here
    };

    // Evaluate purely functional graph
    const result = await evaluateGraph(
        currentGraph,
        globalInputs,
        StandardNodes,
        { executionMode: 'parallel', nodeTimeoutMs: 1500 }
    );

    const tEnd = performance.now();
    
    // Save state
    latestExecutionState = result.state;
    nodeErrors = { ...result.errors };
    syncContextState();

    // Update controls UI
    if (timeValue) {
        timeValue.textContent = `${Math.round(tEnd - tStart)}ms`;
    }

    if (statusDot && statusText) {
        const errorCount = Object.keys(result.errors).length;
        if (errorCount > 0) {
            statusDot.className = 'status-dot error';
            statusText.textContent = `Engine: Error (${errorCount} culled)`;
        } else {
            statusDot.className = 'status-dot idle';
            statusText.textContent = 'Engine: Success';
        }
    }

    // Dispatch side effects to terminal logger
    const dispatcher = createDispatcher();
    dispatcher.on('CONSOLE_LOG', async (cmd, sourceNodeId) => {
        logToTerminal(`[Node ${sourceNodeId} CONSOLE_LOG]: ${cmd.payload.message}`, 'log-output');
    });

    logToTerminal(`System starting command execution dispatcher...`, 'system-msg');
    await dispatcher.dispatchFromExecution(result);
    logToTerminal(`Execution completed.`, 'system-msg');

    // Update inspector contents
    updateInspector();

    // Render AST Preview
    const astJson = document.getElementById('ast-json-preview');
    if (astJson) {
        astJson.textContent = JSON.stringify(currentGraph, null, 2);
    }
}

function triggerAutoRun() {
    const chkAuto = document.getElementById('chk-auto-run') as HTMLInputElement;
    if (chkAuto && chkAuto.checked) {
        runExecutionPipeline().catch(console.error);
    }
}

// ============================================================================
// CONSOLE LOGGER UTILITY
// ============================================================================

function logToTerminal(message: string, className: string = '') {
    const consoleView = document.getElementById('terminal-console');
    if (!consoleView) return;

    const line = document.createElement('div');
    line.className = `terminal-line ${className}`;
    line.textContent = `> ${message}`;

    consoleView.appendChild(line);
    consoleView.scrollTop = consoleView.scrollHeight;
}

// ============================================================================
// DYNAMIC INSPECTOR BUILDER
// ============================================================================

function updateInspector() {
    const placeholder = document.getElementById('inspector-placeholder');
    const content = document.getElementById('inspector-content');
    
    if (!content || !placeholder) return;

    if (!selectedNodeId || !currentGraph.nodes[selectedNodeId]) {
        content.classList.add('hidden');
        placeholder.classList.remove('hidden');
        return;
    }

    placeholder.classList.add('hidden');
    content.classList.remove('hidden');

    const node = currentGraph.nodes[selectedNodeId];
    const nodeDef = StandardNodes[node.type];

    // Node details textContent insertion
    const nodeIdText = document.getElementById('inspect-node-id');
    const nodeTypeText = document.getElementById('inspect-node-type');
    
    if (nodeIdText) nodeIdText.textContent = node.id;
    if (nodeTypeText) {
        nodeTypeText.textContent = node.type;
        nodeTypeText.className = `inspector-value badge`;
    }

    // 1. Rebuild Parameter Editor Container
    const paramsContainer = document.getElementById('inspect-parameters-container');
    if (paramsContainer && nodeDef) {
        paramsContainer.replaceChildren();

        // Parameter inputs: Draw form input fields for requires pins that are NOT connected
        const requires = Object.entries(nodeDef.requires);
        const incomingEdges = currentGraph.edges.filter(e => e.targetNodeId === node.id);

        requires.forEach(([pinId, pinType]) => {
            const isConnected = incomingEdges.some(e => e.targetPinId === pinId);
            const row = document.createElement('div');
            row.className = 'param-input-row';

            const label = document.createElement('label');
            label.textContent = `${pinId} (${pinType})`;
            row.appendChild(label);

            if (isConnected) {
                const badgeText = document.createElement('span');
                badgeText.className = 'badge';
                badgeText.style.alignSelf = 'flex-start';
                badgeText.style.borderColor = 'rgba(255,255,255,0.05)';
                badgeText.style.background = 'rgba(255,255,255,0.02)';
                badgeText.style.color = 'var(--text-muted)';
                badgeText.textContent = '🔌 Wired Link';
                row.appendChild(badgeText);
            } else {
                // Not connected, display editor input
                const currentVal = node.params[pinId] ?? '';
                
                if (pinType === 'boolean') {
                    const checkLabel = document.createElement('label');
                    checkLabel.className = 'input-field-checkbox';
                    const checkbox = document.createElement('input');
                    checkbox.type = 'checkbox';
                    checkbox.checked = !!currentVal;
                    checkbox.addEventListener('change', () => {
                        // Capture snapshot on toggle action
                        pushToHistory();
                        updateNodeParam(node.id, pinId, checkbox.checked);
                    });
                    checkLabel.appendChild(checkbox);
                    checkLabel.appendChild(document.createTextNode(' Enabled'));
                    row.appendChild(checkLabel);
                } else {
                    const textInput = document.createElement('input');
                    textInput.type = pinType === 'number' ? 'number' : 'text';
                    textInput.className = 'input-field';
                    textInput.value = currentVal.toString();
                    textInput.autocomplete = 'off';
                    
                    // Capture snapshot once upon focusing the input
                    textInput.addEventListener('focus', () => {
                        preEditGraphState = JSON.parse(JSON.stringify(currentGraph));
                    });

                    textInput.addEventListener('input', () => {
                        // If we have a pending pre-edit snapshot, push it to history before saving the first keystroke
                        if (preEditGraphState) {
                            undoStack.push(preEditGraphState);
                            if (undoStack.length > 50) undoStack.shift();
                            redoStack.length = 0;
                            updateUndoRedoButtons();
                            preEditGraphState = null; // Only push once per focus session
                        }

                        let parsedVal: any = textInput.value;
                        if (pinType === 'number') {
                            parsedVal = parseFloat(textInput.value);
                            if (isNaN(parsedVal)) parsedVal = 0;
                        }
                        updateNodeParam(node.id, pinId, parsedVal);
                    });
                    row.appendChild(textInput);
                }
            }
            paramsContainer.appendChild(row);
        });

        if (requires.length === 0) {
            const noParams = document.createElement('span');
            noParams.style.fontSize = '12px';
            noParams.style.color = 'var(--text-muted)';
            noParams.textContent = 'None';
            paramsContainer.appendChild(noParams);
        }
    }

    // 2. Rebuild Outputs Container
    const outputsContainer = document.getElementById('inspect-outputs-container');
    if (outputsContainer && nodeDef) {
        outputsContainer.replaceChildren();

        const provides = Object.keys(nodeDef.provides);
        provides.forEach(pinId => {
            const row = document.createElement('div');
            row.className = 'pin-status-row';

            const nameSpan = document.createElement('span');
            nameSpan.className = 'pin-name';
            nameSpan.textContent = pinId;
            row.appendChild(nameSpan);

            const valSpan = document.createElement('span');
            valSpan.className = 'pin-val';
            
            const stateKey = `${node.id}.${pinId}`;
            const val = latestExecutionState[stateKey];
            valSpan.textContent = val !== undefined ? JSON.stringify(val) : 'undefined';
            row.appendChild(valSpan);

            outputsContainer.appendChild(row);
        });

        if (provides.length === 0) {
            const noOutputs = document.createElement('span');
            noOutputs.style.fontSize = '12px';
            noOutputs.style.color = 'var(--text-muted)';
            noOutputs.textContent = 'None';
            outputsContainer.appendChild(noOutputs);
        }
    }

    // 3. Rebuild Error Container
    const errorsContainer = document.getElementById('inspect-errors-container');
    if (errorsContainer) {
        if (nodeErrors[node.id]) {
            errorsContainer.classList.remove('hidden');
            errorsContainer.textContent = nodeErrors[node.id];
        } else {
            errorsContainer.classList.add('hidden');
            errorsContainer.textContent = '';
        }
    }
}

function updateNodeParam(nodeId: string, paramKey: string, value: any) {
    const node = currentGraph.nodes[nodeId];
    if (!node) return;

    // Immutable update
    const updatedParams = { ...node.params, [paramKey]: value };
    const updatedNode = { ...node, params: updatedParams };
    currentGraph = {
        ...currentGraph,
        nodes: {
            ...currentGraph.nodes,
            [nodeId]: updatedNode
        }
    };
    triggerAutoRun();
}

// ============================================================================
// INITIALIZATION AND EVENT BINDING
// ============================================================================

window.addEventListener('DOMContentLoaded', () => {
    canvas = document.getElementById('graph-canvas') as HTMLCanvasElement;
    ctx = canvas.getContext('2d') as CanvasRenderingContext2D;

    // Handle resize
    const resizeCanvas = () => {
        const rect = canvas.getBoundingClientRect();
        canvas.width = rect.width;
        canvas.height = rect.height;
    };
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // Initialize rendering context object
    renderingContext = {
        canvas,
        ctx,
        viewport,
        selectedNodeId,
        hoveredNodeId,
        hoveredPin,
        draggingConnection,
        nodeErrors
    };

    // Instantiate and start renderer
    const renderer = createRenderer(renderingContext, () => currentGraph, StandardNodes);
    renderer.start();

    // Sidebar Collapsible Management
    const sidebar = document.getElementById('sidebar');
    const btnSidebar = document.getElementById('btn-sidebar-toggle');
    
    const toggleSidebar = () => {
        if (!sidebar) return;
        const isCollapsed = sidebar.classList.toggle('collapsed');
        if (btnSidebar) {
            btnSidebar.textContent = isCollapsed ? '📋 Panel' : '❌ Panel';
        }
        
        // Animate resize smoothly over transition
        let startTime = Date.now();
        const animateResize = () => {
            resizeCanvas();
            renderer.triggerSingleFrame();
            if (Date.now() - startTime < 350) {
                requestAnimationFrame(animateResize);
            }
        };
        animateResize();
    };
    
    btnSidebar?.addEventListener('click', toggleSidebar);

    // Theme Management initialization and click handler
    const savedTheme = localStorage.getItem('theme') || 'dark';
    const btnTheme = document.getElementById('btn-theme-toggle');
    if (savedTheme === 'light') {
        document.body.classList.add('light-theme');
        if (btnTheme) btnTheme.textContent = '🌙 Dark Mode';
    } else {
        document.body.classList.remove('light-theme');
        if (btnTheme) btnTheme.textContent = '☀️ Light Mode';
    }

    btnTheme?.addEventListener('click', () => {
        const isCurrentlyLight = document.body.classList.contains('light-theme');
        if (isCurrentlyLight) {
            document.body.classList.remove('light-theme');
            localStorage.setItem('theme', 'dark');
            if (btnTheme) btnTheme.textContent = '☀️ Light Mode';
        } else {
            document.body.classList.add('light-theme');
            localStorage.setItem('theme', 'light');
            if (btnTheme) btnTheme.textContent = '🌙 Dark Mode';
        }
        renderer.triggerSingleFrame();
    });

    // Trigger initial run
    runExecutionPipeline().catch(console.error);

    // ========================================================================
    // KEYBOARD SHORTCUTS BINDING (Undo / Redo Listener)
    // ========================================================================
    window.addEventListener('keydown', (e) => {
        const isCtrlCmd = e.ctrlKey || e.metaKey;
        
        if (isCtrlCmd) {
            if (e.key === 'z' || e.key === 'Z') {
                e.preventDefault();
                if (e.shiftKey) {
                    redo(); // Ctrl+Shift+Z = Redo
                } else {
                    undo(); // Ctrl+Z = Undo
                }
            } else if (e.key === 'y' || e.key === 'Y') {
                e.preventDefault();
                redo(); // Ctrl+Y = Redo
            } else if (e.key === 'b' || e.key === 'B') {
                e.preventDefault();
                toggleSidebar();
            }
        }
    });

    // ========================================================================
    // MOUSE INTERACTION EVENT LISTENERS
    // ========================================================================

    // Search element coordinate bounds
    canvas.addEventListener('mousedown', (e) => {
        // Hide context menu if showing
        document.getElementById('context-menu')?.classList.add('hidden');

        // Ignore right-clicks to prevent panning and drag-state interference
        if (e.button === 2) return;

        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        const worldPos = screenToWorld(mouseX, mouseY);

        // 1. Check if clicked a pin dot
        let pinClicked = false;
        
        for (const nodeId in currentGraph.nodes) {
            const node = currentGraph.nodes[nodeId];
            const nodeDef = StandardNodes[node.type];
            if (!nodeDef) continue;

            // Inputs
            const inputs = Object.keys(nodeDef.requires);
            for (let i = 0; i < inputs.length; i++) {
                const pos = getInputPinCoords(node, inputs[i]);
                const dist = Math.hypot(worldPos.x - pos.x, worldPos.y - pos.y);
                if (dist <= 12) {
                    pinClicked = true;
                    // Start dragging from an input pin (reversing connection or link dragging)
                    renderingContext.draggingConnection = {
                        sourceNodeId: node.id,
                        sourcePinId: inputs[i],
                        isInput: true,
                        x: pos.x,
                        y: pos.y,
                        cursorX: worldPos.x,
                        cursorY: worldPos.y
                    };
                    break;
                }
            }
            if (pinClicked) break;

            // Outputs
            const outputs = Object.keys(nodeDef.provides);
            for (let i = 0; i < outputs.length; i++) {
                const pos = getOutputPinCoords(node, outputs[i]);
                const dist = Math.hypot(worldPos.x - pos.x, worldPos.y - pos.y);
                if (dist <= 12) {
                    pinClicked = true;
                    renderingContext.draggingConnection = {
                        sourceNodeId: node.id,
                        sourcePinId: outputs[i],
                        isInput: false,
                        x: pos.x,
                        y: pos.y,
                        cursorX: worldPos.x,
                        cursorY: worldPos.y
                    };
                    break;
                }
            }
            if (pinClicked) break;
        }

        if (pinClicked) return;

        // 2. Check if clicked on a node body
        let clickedNodeId: string | null = null;
        const nodesReversed = Object.values(currentGraph.nodes).reverse(); // Topmost first
        
        for (const node of nodesReversed) {
            const w = node.ui?.width ?? NODE_WIDTH;
            const h = getNodeHeight(node);
            const nx = node.ui?.x ?? 0;
            const ny = node.ui?.y ?? 0;

            if (worldPos.x >= nx && worldPos.x <= nx + w && worldPos.y >= ny && worldPos.y <= ny + h) {
                clickedNodeId = node.id;
                break;
            }
        }

        if (clickedNodeId) {
            selectedNodeId = clickedNodeId;
            renderingContext.selectedNodeId = selectedNodeId;
            draggedNodeId = clickedNodeId;
            
            const node = currentGraph.nodes[clickedNodeId];
            dragOffsetX = worldPos.x - (node.ui?.x ?? 0);
            dragOffsetY = worldPos.y - (node.ui?.y ?? 0);
            
            // Record pre-drag details to handle undo cleanly upon mouseup
            preDragGraphState = JSON.parse(JSON.stringify(currentGraph));
            dragHasMoved = false;
            dragNodeOriginalX = node.ui?.x ?? 0;
            dragNodeOriginalY = node.ui?.y ?? 0;
            
            // Hide node adder if showing
            document.getElementById('node-adder')?.classList.add('hidden');
            updateInspector();
            return;
        }

        // 3. Fallback: Clicked empty canvas space. Start panning or deselect.
        selectedNodeId = null;
        renderingContext.selectedNodeId = null;
        updateInspector();

        document.getElementById('node-adder')?.classList.add('hidden');

        isPanning = true;
        panStartX = e.clientX;
        panStartY = e.clientY;
        viewportStartX = viewport.x;
        viewportStartY = viewport.y;
    });

    canvas.addEventListener('mousemove', (e) => {
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        const worldPos = screenToWorld(mouseX, mouseY);

        // A. Handle active dragging connection wire
        if (renderingContext.draggingConnection) {
            renderingContext.draggingConnection.cursorX = worldPos.x;
            renderingContext.draggingConnection.cursorY = worldPos.y;
        }

        // B. Handle node moving
        else if (draggedNodeId && currentGraph.nodes[draggedNodeId]) {
            const node = currentGraph.nodes[draggedNodeId];
            const newX = Math.round(worldPos.x - dragOffsetX);
            const newY = Math.round(worldPos.y - dragOffsetY);
            
            // Check if node has actually shifted position
            if (newX !== dragNodeOriginalX || newY !== dragNodeOriginalY) {
                dragHasMoved = true;
            }

            const updatedUi = {
                ...(node.ui ?? { x: 0, y: 0 }),
                x: newX,
                y: newY
            };
            currentGraph = {
                ...currentGraph,
                nodes: {
                    ...currentGraph.nodes,
                    [draggedNodeId]: { ...node, ui: updatedUi }
                }
            };
        }

        // C. Handle canvas panning
        else if (isPanning) {
            const dx = e.clientX - panStartX;
            const dy = e.clientY - panStartY;
            viewport.x = viewportStartX + dx;
            viewport.y = viewportStartY + dy;
            renderingContext.viewport = { ...viewport };
        }

        // D. Calculate pin / node hover states
        let hNodeId: string | null = null;
        let hPin: typeof hoveredPin = null;

        for (const nodeId in currentGraph.nodes) {
            const node = currentGraph.nodes[nodeId];
            const nodeDef = StandardNodes[node.type];
            if (!nodeDef) continue;

            const w = node.ui?.width ?? NODE_WIDTH;
            const h = getNodeHeight(node);
            const nx = node.ui?.x ?? 0;
            const ny = node.ui?.y ?? 0;

            if (worldPos.x >= nx && worldPos.x <= nx + w && worldPos.y >= ny && worldPos.y <= ny + h) {
                hNodeId = nodeId;

                // Inputs
                const inputs = Object.keys(nodeDef.requires);
                for (let i = 0; i < inputs.length; i++) {
                    const pos = getInputPinCoords(node, inputs[i]);
                    if (Math.hypot(worldPos.x - pos.x, worldPos.y - pos.y) <= 12) {
                        hPin = { nodeId, pinId: inputs[i], isInput: true };
                        break;
                    }
                }

                // Outputs
                if (!hPin) {
                    const outputs = Object.keys(nodeDef.provides);
                    for (let i = 0; i < outputs.length; i++) {
                        const pos = getOutputPinCoords(node, outputs[i]);
                        if (Math.hypot(worldPos.x - pos.x, worldPos.y - pos.y) <= 12) {
                            hPin = { nodeId, pinId: outputs[i], isInput: false };
                            break;
                        }
                    }
                }
                break;
            }
        }

        hoveredNodeId = hNodeId;
        hoveredPin = hPin;
        
        renderingContext.hoveredNodeId = hoveredNodeId;
        renderingContext.hoveredPin = hoveredPin;
    });

    canvas.addEventListener('mouseup', (e) => {
        // A. Resolve Edge linkages on connection release
        if (renderingContext.draggingConnection) {
            const drag = renderingContext.draggingConnection;
            
            // Check if released over a matching opposite pin
            if (hoveredPin && hoveredPin.nodeId !== drag.sourceNodeId && hoveredPin.isInput !== drag.isInput) {
                const sourceNodeId = drag.isInput ? hoveredPin.nodeId : drag.sourceNodeId;
                const sourcePinId = drag.isInput ? hoveredPin.pinId : drag.sourcePinId;
                const targetNodeId = drag.isInput ? drag.sourceNodeId : hoveredPin.nodeId;
                const targetPinId = drag.isInput ? drag.sourcePinId : hoveredPin.pinId;

                const sourceNode = currentGraph.nodes[sourceNodeId];
                const targetNode = currentGraph.nodes[targetNodeId];
                
                if (sourceNode && targetNode) {
                    const sourceDef = StandardNodes[sourceNode.type];
                    const targetDef = StandardNodes[targetNode.type];
                    
                    if (sourceDef && targetDef) {
                        const sourceType = sourceDef.provides[sourcePinId];
                        const targetType = targetDef.requires[targetPinId];

                        // 1. Perform strict schema type-checking validation
                        if (isCompatible(sourceType, targetType)) {
                            // Capture snapshot before modifying graph edges
                            pushToHistory();

                            // Clear any existing connection leading to targetPin (since inputs can have only 1 source)
                            const cleanedEdges = currentGraph.edges.filter(
                                edge => !(edge.targetNodeId === targetNodeId && edge.targetPinId === targetPinId)
                            );

                            const newEdge: Edge = {
                                id: `edge_${Date.now()}`,
                                sourceNodeId,
                                sourcePinId,
                                targetNodeId,
                                targetPinId
                            };

                            currentGraph = {
                                ...currentGraph,
                                edges: [...cleanedEdges, newEdge]
                            };
                            
                            logToTerminal(`Connected [Node ${sourceNodeId}].${sourcePinId} ➡️ [Node ${targetNodeId}].${targetPinId}`, 'system-msg');
                            triggerAutoRun();
                        } else {
                            logToTerminal(`Link rejected: Incompatible types. Cannot connect '${sourceType}' to '${targetType}'`, 'terminal-line effect-msg');
                        }
                    }
                }
            }
            renderingContext.draggingConnection = null;
        }

        // B. Resolve Node Drag completion
        if (draggedNodeId) {
            // Push history snapshot ONLY if the node was actually moved to avoid empty history pushes
            if (preDragGraphState && dragHasMoved) {
                undoStack.push(preDragGraphState);
                if (undoStack.length > 50) undoStack.shift();
                redoStack.length = 0;
                updateUndoRedoButtons();
                triggerAutoRun();
            }
            preDragGraphState = null;
            dragHasMoved = false;
        }

        draggedNodeId = null;
        isPanning = false;
    });

    // Zooming handler
    canvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        const worldPos = screenToWorld(mouseX, mouseY);
        
        const clampedDelta = Math.max(-120, Math.min(120, e.deltaY));
        const zoomFactor = Math.exp(-clampedDelta * 0.0007);
        viewport.zoom = Math.max(0.05, Math.min(3.0, viewport.zoom * zoomFactor));

        // Shift Pan offset dynamically to preserve pointer center focal point
        viewport.x = mouseX - worldPos.x * viewport.zoom;
        viewport.y = mouseY - worldPos.y * viewport.zoom;

        renderingContext.viewport = { ...viewport };
    }, { passive: false });

    // Double-click to open Node Adder
    canvas.addEventListener('dblclick', (e) => {
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        const worldPos = screenToWorld(mouseX, mouseY);

        // Store spawn coordinates in world space
        spawnX = worldPos.x;
        spawnY = worldPos.y;

        showNodeAdder(mouseX, mouseY);
    });

    // Right-click to open Node context menu or Node Adder
    canvas.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        const worldPos = screenToWorld(mouseX, mouseY);

        // Check if clicked on a node
        let clickedNodeId: string | null = null;
        const nodesReversed = Object.values(currentGraph.nodes).reverse();
        for (const node of nodesReversed) {
            const w = node.ui?.width ?? NODE_WIDTH;
            const h = getNodeHeight(node);
            const nx = node.ui?.x ?? 0;
            const ny = node.ui?.y ?? 0;

            if (worldPos.x >= nx && worldPos.x <= nx + w && worldPos.y >= ny && worldPos.y <= ny + h) {
                clickedNodeId = node.id;
                break;
            }
        }

        const ctxMenu = document.getElementById('context-menu');
        const nodeAdder = document.getElementById('node-adder');

        if (clickedNodeId) {
            // Right-clicked a node: select it, hide node adder, show context menu
            selectedNodeId = clickedNodeId;
            renderingContext.selectedNodeId = selectedNodeId;
            updateInspector();

            if (nodeAdder) nodeAdder.classList.add('hidden');
            
            if (ctxMenu) {
                ctxMenu.style.left = `${mouseX}px`;
                ctxMenu.style.top = `${mouseY}px`;
                ctxMenu.classList.remove('hidden');
            }
        } else {
            // Right-clicked empty canvas: hide context menu, show node adder
            if (ctxMenu) ctxMenu.classList.add('hidden');
            
            spawnX = worldPos.x;
            spawnY = worldPos.y;
            showNodeAdder(mouseX, mouseY);
        }
    });

    // Context Menu action listeners
    document.getElementById('ctx-delete-node')?.addEventListener('click', () => {
        document.getElementById('btn-delete-node')?.click();
        document.getElementById('context-menu')?.classList.add('hidden');
    });

    document.getElementById('ctx-disconnect-node')?.addEventListener('click', () => {
        if (!selectedNodeId) return;

        const idToDisconnect = selectedNodeId;
        pushToHistory();

        const updatedEdges = currentGraph.edges.filter(
            e => e.sourceNodeId !== idToDisconnect && e.targetNodeId !== idToDisconnect
        );

        currentGraph = {
            ...currentGraph,
            edges: updatedEdges
        };

        logToTerminal(`Disconnected all links for node [${idToDisconnect}]`, 'system-msg');
        document.getElementById('context-menu')?.classList.add('hidden');
        
        updateInspector();
        triggerAutoRun();
    });

    // ========================================================================
    // HEADER AND GLOBAL CONTROL HOOKS
    // ========================================================================

    document.getElementById('btn-run')?.addEventListener('click', () => {
        runExecutionPipeline().catch(console.error);
    });

    document.getElementById('btn-zoom-in')?.addEventListener('click', () => {
        viewport.zoom = Math.min(3.0, viewport.zoom * 1.2);
        renderingContext.viewport = { ...viewport };
    });

    document.getElementById('btn-zoom-out')?.addEventListener('click', () => {
        viewport.zoom = Math.max(0.05, viewport.zoom / 1.2);
        renderingContext.viewport = { ...viewport };
    });

    document.getElementById('btn-zoom-reset')?.addEventListener('click', () => {
        viewport.zoom = 1.0;
        viewport.x = 0;
        viewport.y = 0;
        renderingContext.viewport = { ...viewport };
    });

    document.getElementById('btn-zoom-fit')?.addEventListener('click', () => {
        const nodes = Object.values(currentGraph.nodes);
        if (nodes.length === 0) {
            viewport.zoom = 1.0;
            viewport.x = 0;
            viewport.y = 0;
            renderingContext.viewport = { ...viewport };
            return;
        }

        // Calculate bounding box in world space
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;

        nodes.forEach(node => {
            const x = node.ui?.x ?? 0;
            const y = node.ui?.y ?? 0;
            const w = node.ui?.width ?? NODE_WIDTH;
            const h = getNodeHeight(node);

            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x + w);
            maxY = Math.max(maxY, y + h);
        });

        const graphWidth = maxX - minX;
        const graphHeight = maxY - minY;

        const canvasWidth = canvas.width;
        const canvasHeight = canvas.height;

        const padding = 60;
        const availableWidth = canvasWidth - padding * 2;
        const availableHeight = canvasHeight - padding * 2;

        let targetZoom = Math.min(availableWidth / graphWidth, availableHeight / graphHeight);
        targetZoom = Math.max(0.05, Math.min(3.0, targetZoom));

        const centerX = minX + graphWidth / 2;
        const centerY = minY + graphHeight / 2;

        viewport.zoom = targetZoom;
        viewport.x = canvasWidth / 2 - centerX * targetZoom;
        viewport.y = canvasHeight / 2 - centerY * targetZoom;

        renderingContext.viewport = { ...viewport };
    });

    // Undo/Redo Button clicks
    document.getElementById('btn-undo')?.addEventListener('click', undo);
    document.getElementById('btn-redo')?.addEventListener('click', redo);

    // ========================================================================
    // SIDEBAR HOOKS
    // ========================================================================

    document.getElementById('btn-delete-node')?.addEventListener('click', () => {
        if (!selectedNodeId) return;

        const idToDelete = selectedNodeId;
        
        // Capture snapshot before deleting node
        pushToHistory();

        // Remove node
        const updatedNodes = { ...currentGraph.nodes };
        delete updatedNodes[idToDelete];

        // Remove linked edges
        const updatedEdges = currentGraph.edges.filter(
            e => e.sourceNodeId !== idToDelete && e.targetNodeId !== idToDelete
        );

        currentGraph = {
            nodes: updatedNodes,
            edges: updatedEdges
        };

        selectedNodeId = null;
        renderingContext.selectedNodeId = null;
        
        logToTerminal(`Deleted node [${idToDelete}]`, 'system-msg');
        
        updateInspector();
        triggerAutoRun();
    });

    document.getElementById('btn-clear-logs')?.addEventListener('click', () => {
        const consoleView = document.getElementById('terminal-console');
        if (consoleView) {
            consoleView.replaceChildren();
            logToTerminal(`Console cleared.`, 'system-msg');
        }
    });

    // Toggle AST JSON Collapsible block
    const astHeader = document.getElementById('ast-header');
    const astSection = document.getElementById('ast-section');
    astHeader?.addEventListener('click', () => {
        astSection?.classList.toggle('expanded');
    });

    // Close Adder
    document.getElementById('btn-close-adder')?.addEventListener('click', () => {
        document.getElementById('node-adder')?.classList.add('hidden');
    });

    // ========================================================================
    // NODE ADDER PANEL & SEARCH FILTER
    // ========================================================================

    function showNodeAdder(screenX: number, screenY: number) {
        const adder = document.getElementById('node-adder');
        const searchInput = document.getElementById('node-search-input') as HTMLInputElement;
        
        if (!adder || !searchInput) return;

        adder.style.left = `${screenX}px`;
        adder.style.top = `${screenY}px`;
        adder.classList.remove('hidden');
        
        searchInput.value = '';
        filterNodeAdderList('');
        searchInput.focus();
    }

    function filterNodeAdderList(query: string) {
        const listContainer = document.getElementById('node-type-list');
        if (!listContainer) return;

        listContainer.replaceChildren();

        const lowerQuery = query.toLowerCase();
        
        Object.entries(StandardNodes).forEach(([nodeType, nodeDef]) => {
            if (query && !nodeType.toLowerCase().includes(lowerQuery)) {
                return; // Skips filtered node type
            }

            const btn = document.createElement('button');
            btn.className = 'node-item-btn';
            
            // Name label text
            const nameLabel = document.createElement('span');
            nameLabel.textContent = nodeType;
            btn.appendChild(nameLabel);

            // Category badge
            const catBadge = document.createElement('span');
            catBadge.className = `node-item-category ${nodeDef.category}`;
            catBadge.textContent = nodeDef.category;
            btn.appendChild(catBadge);

            btn.addEventListener('click', () => {
                addNewNode(nodeType);
                document.getElementById('node-adder')?.classList.add('hidden');
            });

            listContainer.appendChild(btn);
        });
    }

    const searchInput = document.getElementById('node-search-input');
    searchInput?.addEventListener('input', (e) => {
        const target = e.target as HTMLInputElement;
        filterNodeAdderList(target.value);
    });

    function addNewNode(type: string) {
        // Capture snapshot before spawning node
        pushToHistory();

        const baseId = type.split('/')[1] || 'node';
        const uniqueId = `${baseId}_${Date.now().toString().slice(-4)}`;
        
        const nodeDef = StandardNodes[type];
        
        // Prepare initial parameter fields based on required pins
        const initialParams: Record<string, any> = {};
        if (nodeDef) {
            Object.keys(nodeDef.requires).forEach(pin => {
                initialParams[pin] = pin === 'ms' ? 1000 : (nodeDef.requires[pin] === 'number' ? 0 : '');
            });
            if (type === 'system/state') {
                initialParams['defaultValue'] = 0;
            }
        }

        const newNode: NodeState = {
            id: uniqueId,
            type,
            params: initialParams,
            ui: {
                x: Math.round(spawnX - NODE_WIDTH / 2),
                y: Math.round(spawnY - 20),
                title: uniqueId.toUpperCase()
            }
        };

        currentGraph = {
            ...currentGraph,
            nodes: {
                ...currentGraph.nodes,
                [uniqueId]: newNode
            }
        };

        logToTerminal(`Spawned node ${uniqueId} of type '${type}'`, 'system-msg');
        
        selectedNodeId = uniqueId;
        syncContextState();
        
        updateInspector();
        triggerAutoRun();
    }
});
