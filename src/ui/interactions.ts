import { GraphState, NodeState, Edge, NodeMode } from '../core/ast.js';
import { createNodeState } from '../core/factory.js';
import { appState, screenToWorld, syncContextState, updateCursor, getNodeHeight, getInputPinCoords, getOutputPinCoords, GRID_SIZE } from './state.js';
import { pushToHistory, undoStack, redoStack, updateUndoRedoButtons, undo, redo } from './history.js';
import { updateInspector } from './inspector.js';
import { runExecutionPipeline, triggerAutoRun, logToTerminal } from './execution.js';
import { NODE_WIDTH, ROW_HEIGHT, HEADER_HEIGHT, getInputPinPos, getOutputPinPos } from './canvas.js';
import { StandardNodes, getNodeInputs, getNodeOutputs } from '../registry/index.js';
import { isCompatible } from '../engine/validation.js';
import { updateSetting, loadSettings } from './settings.js';

// ============================================================================
// DELETE SELECTED NODES
// ============================================================================

export function deleteSelectedNodes() {
    const idsToDelete = new Set<string>(appState.selectedNodeIds);
    if (appState.selectedNodeId) {
        idsToDelete.add(appState.selectedNodeId);
    }
    
    if (idsToDelete.size === 0) return;
    
    const executeDeletion = () => {
        pushToHistory();

        const updatedNodes = { ...appState.currentGraph.nodes };
        idsToDelete.forEach(id => {
            delete (updatedNodes as any)[id];
        });

        const updatedEdges = appState.currentGraph.edges.filter(
            e => !idsToDelete.has(e.sourceNodeId) && !idsToDelete.has(e.targetNodeId)
        );

        appState.currentGraph = {
            nodes: updatedNodes,
            edges: updatedEdges
        };

        appState.selectedNodeId = null;
        appState.selectedNodeIds.clear();
        syncContextState();
        
        logToTerminal(`Deleted ${idsToDelete.size} selected node(s)`, 'system-msg');
        
        updateInspector();
        triggerAutoRun();
    };

    const settings = loadSettings();
    if (settings.canvas.warnOnDelete ?? true) {
        showConfirmDeleteDialog(executeDeletion);
    } else {
        executeDeletion();
    }
}

function showConfirmDeleteDialog(onConfirm: () => void) {
    if (document.querySelector('.top-alert-card')) {
        return;
    }
    const card = document.createElement('div');
    card.className = 'top-alert-card glass-panel';
    
    card.innerHTML = `
        <div class="top-alert-content">
            <span class="top-alert-icon">⚠️</span>
            <div class="top-alert-text">
                <p class="top-alert-title">Delete Node?</p>
                <p class="top-alert-desc">Delete selected node(s) and connected wires?</p>
            </div>
        </div>
        <div class="top-alert-actions">
            <label class="top-alert-chk">
                <input type="checkbox" id="modal-chk-dont-ask-again">
                <span>Don't ask again</span>
            </label>
            <button class="btn btn-secondary btn-sm" id="modal-btn-cancel" style="padding: 4px 10px; font-size: 11px;">Cancel</button>
            <button class="btn btn-danger btn-sm" id="modal-btn-delete" style="padding: 4px 10px; font-size: 11px;">Delete</button>
        </div>
    `;
    
    document.body.appendChild(card);
    
    const btnCancel = card.querySelector('#modal-btn-cancel');
    const btnDelete = card.querySelector('#modal-btn-delete');
    const chkDontAsk = card.querySelector('#modal-chk-dont-ask-again') as HTMLInputElement | null;
    
    btnCancel?.addEventListener('click', () => {
        document.body.removeChild(card);
    });
    
    btnDelete?.addEventListener('click', () => {
        if (chkDontAsk?.checked) {
            updateSetting('canvas', 'warnOnDelete', false);
            const menuChkWarnDelete = document.getElementById('menu-chk-warn-delete') as HTMLInputElement | null;
            if (menuChkWarnDelete) menuChkWarnDelete.checked = false;
        }
        document.body.removeChild(card);
        onConfirm();
    });
}

function isEditingText(): boolean {
    const activeEl = document.activeElement;
    return !!(activeEl && (
        activeEl.tagName === 'INPUT' || 
        activeEl.tagName === 'TEXTAREA' || 
        activeEl.getAttribute('contenteditable') === 'true'
    ));
}

export async function copySelectedNodes() {
    const selectedIds = appState.selectedNodeIds;
    if (selectedIds.size === 0) return;

    const nodesToCopy: Record<string, any> = {};
    selectedIds.forEach(id => {
        const node = appState.currentGraph.nodes[id];
        if (node) {
            nodesToCopy[id] = node;
        }
    });

    const edgesToCopy = appState.currentGraph.edges.filter(
        edge => selectedIds.has(edge.sourceNodeId) && selectedIds.has(edge.targetNodeId)
    );

    const payload = {
        type: 'litegraph-fp-subgraph',
        nodes: nodesToCopy,
        edges: edgesToCopy
    };

    try {
        await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
        logToTerminal(`Copied ${Object.keys(nodesToCopy).length} node(s) to clipboard.`, 'system-msg');
    } catch (err) {
        logToTerminal(`Failed to copy to clipboard: ${err}`, 'terminal-line effect-msg');
    }
}

export async function pasteNodes() {
    try {
        const text = await navigator.clipboard.readText();
        let payload: any;
        try {
            payload = JSON.parse(text);
        } catch (e) {
            return;
        }

        if (payload?.type !== 'litegraph-fp-subgraph' || !payload.nodes || !payload.edges) {
            return;
        }

        pushToHistory();

        const idMap = new Map<string, string>();
        const updatedNodes = { ...appState.currentGraph.nodes } as Record<string, any>;
        const offset = 60; 

        Object.entries(payload.nodes).forEach(([oldId, node]: [string, any]) => {
            const baseId = node.type.split('/')[1] || 'node';
            const newId = `${baseId}_${Date.now().toString().slice(-4)}_${Math.floor(Math.random() * 100)}`;
            idMap.set(oldId, newId);

            const snapEnabled = loadSettings().canvas.snapToGrid;
            let px = (node.ui?.x ?? 0) + offset;
            let py = (node.ui?.y ?? 0) + offset;
            if (snapEnabled) {
                px = Math.round(px / GRID_SIZE) * GRID_SIZE;
                py = Math.round(py / GRID_SIZE) * GRID_SIZE;
            }

            updatedNodes[newId] = {
                ...node,
                id: newId,
                ui: {
                    ...(node.ui ?? {}),
                    x: px,
                    y: py
                }
            };
        });

        const newEdges = payload.edges.map((edge: any) => {
            const newSourceId = idMap.get(edge.sourceNodeId);
            const newTargetId = idMap.get(edge.targetNodeId);
            if (newSourceId && newTargetId) {
                return {
                    id: `edge_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
                    sourceNodeId: newSourceId,
                    sourcePinId: edge.sourcePinId,
                    targetNodeId: newTargetId,
                    targetPinId: edge.targetPinId
                };
            }
            return null;
        }).filter((e: any) => e !== null);

        appState.currentGraph = {
            nodes: updatedNodes,
            edges: [...appState.currentGraph.edges, ...newEdges]
        };

        appState.selectedNodeIds.clear();
        idMap.forEach(newId => appState.selectedNodeIds.add(newId));
        appState.selectedNodeId = Array.from(idMap.values())[0] || null;

        syncContextState();
        updateInspector();
        triggerAutoRun();
        logToTerminal(`Pasted ${idMap.size} node(s) successfully.`, 'system-msg');
    } catch (err) {
        logToTerminal(`Failed to paste from clipboard: ${err}`, 'terminal-line effect-msg');
    }
}


export function zoomExtents() {
    const canvas = appState.canvas;
    if (!canvas) return;

    const nodes = Object.values(appState.currentGraph.nodes);
    if (nodes.length === 0) {
        appState.viewport.zoom = 1.0;
        appState.viewport.x = 0;
        appState.viewport.y = 0;
        if (appState.renderingContext) {
            appState.renderingContext.viewport = { ...appState.viewport };
            appState.renderingContext.needsRedraw = true;
        }
        updateSetting('canvas', 'camera', { x: appState.viewport.x, y: appState.viewport.y, zoom: appState.viewport.zoom });
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

    const rect = canvas.getBoundingClientRect();
    const canvasWidth = rect.width;
    const canvasHeight = rect.height;

    const padding = 60;
    const availableWidth = canvasWidth - padding * 2;
    const availableHeight = canvasHeight - padding * 2;

    let targetZoom = Math.min(availableWidth / graphWidth, availableHeight / graphHeight);
    targetZoom = Math.max(0.05, Math.min(3.0, targetZoom));

    const centerX = minX + graphWidth / 2;
    const centerY = minY + graphHeight / 2;

    appState.viewport.zoom = targetZoom;
    appState.viewport.x = canvasWidth / 2 - centerX * targetZoom;
    appState.viewport.y = canvasHeight / 2 - centerY * targetZoom;

    if (appState.renderingContext) {
        appState.renderingContext.viewport = { ...appState.viewport };
        appState.renderingContext.needsRedraw = true;
    }
    updateSetting('canvas', 'camera', { x: appState.viewport.x, y: appState.viewport.y, zoom: appState.viewport.zoom });
}

export function bringNodeToFront(nodeId: string) {
    const nodes = appState.currentGraph.nodes;
    if (nodes[nodeId]) {
        const updatedNodes = { ...nodes };
        const node = updatedNodes[nodeId];
        delete (updatedNodes as any)[nodeId];
        (updatedNodes as any)[nodeId] = node;
        appState.currentGraph = {
            ...appState.currentGraph,
            nodes: updatedNodes
        };
        syncContextState();
    }
}

export function sendNodeToBack(nodeId: string) {
    const nodes = appState.currentGraph.nodes;
    if (nodes[nodeId]) {
        const updatedNodes = { [nodeId]: nodes[nodeId] }; // Put target node first
        for (const id in nodes) {
            if (id !== nodeId) {
                (updatedNodes as any)[id] = nodes[id];
            }
        }
        appState.currentGraph = {
            ...appState.currentGraph,
            nodes: updatedNodes as any
        };
        syncContextState();
    }
}

function isPinHit(worldPos: { x: number; y: number }, pos: { x: number; y: number }, isInput: boolean): boolean {
    const dx = worldPos.x - pos.x;
    const dy = worldPos.y - pos.y;
    return Math.hypot(dx, dy) <= 6;
}

function configureContextMenuForNode() {
    const deleteNode = document.getElementById('ctx-delete-node');
    const disconnect = document.getElementById('ctx-disconnect-node');
    const divider = document.querySelector('.context-menu-divider') as HTMLElement;
    const bringFront = document.getElementById('ctx-bring-to-front');
    const sendBack = document.getElementById('ctx-send-to-back');
    const deleteConn = document.getElementById('ctx-delete-connection');

    if (deleteNode) deleteNode.style.display = 'block';
    if (disconnect) disconnect.style.display = 'block';
    if (divider) divider.style.display = 'block';
    if (bringFront) bringFront.style.display = 'block';
    if (sendBack) sendBack.style.display = 'block';
    if (deleteConn) deleteConn.style.display = 'none';
}

function configureContextMenuForEdge() {
    const deleteNode = document.getElementById('ctx-delete-node');
    const disconnect = document.getElementById('ctx-disconnect-node');
    const divider = document.querySelector('.context-menu-divider') as HTMLElement;
    const bringFront = document.getElementById('ctx-bring-to-front');
    const sendBack = document.getElementById('ctx-send-to-back');
    const deleteConn = document.getElementById('ctx-delete-connection');

    if (deleteNode) deleteNode.style.display = 'none';
    if (disconnect) disconnect.style.display = 'none';
    if (divider) divider.style.display = 'none';
    if (bringFront) bringFront.style.display = 'none';
    if (sendBack) sendBack.style.display = 'none';
    if (deleteConn) deleteConn.style.display = 'block';
}

let rightClickedEdgeId: string | null = null;

function lineSegmentsIntersect(
    x1: number, y1: number, x2: number, y2: number,
    x3: number, y3: number, x4: number, y4: number
): boolean {
    const det = (x2 - x1) * (y4 - y3) - (y2 - y1) * (x4 - x3);
    if (det === 0) return false; // Parallel

    const lambda = ((y4 - y3) * (x4 - x1) + (x3 - x4) * (y4 - y1)) / det;
    const gamma = ((y1 - y2) * (x4 - x1) + (x2 - x1) * (y4 - y1)) / det;

    return (0 <= lambda && lambda <= 1) && (0 <= gamma && gamma <= 1);
}

function isLineIntersectingBox(
    x1: number, y1: number, x2: number, y2: number,
    bx: number, by: number, bw: number, bh: number
): boolean {
    // 1. Check if either endpoint is inside
    const inside = (x: number, y: number) => x >= bx && x <= bx + bw && y >= by && y <= by + bh;
    if (inside(x1, y1) || inside(x2, y2)) return true;

    // 2. Check intersection with 4 sides of the box
    return lineSegmentsIntersect(x1, y1, x2, y2, bx, by, bx + bw, by) || // Top
           lineSegmentsIntersect(x1, y1, x2, y2, bx, by + bh, bx + bw, by + bh) || // Bottom
           lineSegmentsIntersect(x1, y1, x2, y2, bx, by, bx, by + bh) || // Left
           lineSegmentsIntersect(x1, y1, x2, y2, bx + bw, by, bx + bw, by + bh); // Right
}

// ============================================================================
// INTERACTIONS INITIALIZATION
// ============================================================================

export function setupInteractions() {
    const canvas = appState.canvas;
    if (!canvas) return;

    // ========================================================================
    // KEYBOARD SHORTCUTS BINDING (Undo / Redo / Delete Listener)
    // ========================================================================
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeNodeAdder();
            document.getElementById('context-menu')?.classList.add('hidden');
            appState.selectedNodeId = null;
            appState.selectedNodeIds.clear();
            appState.selectedEdgeId = null;
            appState.selectedEdgeIds.clear();
            syncContextState();
            updateInspector();
        }

        if (e.key === 'Shift') {
            appState.isShiftPressed = true;
            updateCursor();
        }

        const isMac = /Mac|iPod|iPhone|iPad/.test(navigator.platform) || (navigator.userAgent && /Mac/.test(navigator.userAgent));
        const isShortcutModifier = isMac ? e.metaKey : e.ctrlKey;
        
        if (isShortcutModifier) {
            if (e.key === 'z' || e.key === 'Z') {
                e.preventDefault();
                if (e.shiftKey) {
                    redo(); // Cmd/Ctrl+Shift+Z = Redo
                } else {
                    undo(); // Cmd/Ctrl+Z = Undo
                }
            } else if (e.key === 'y' || e.key === 'Y') {
                e.preventDefault();
                redo(); // Cmd/Ctrl+Y = Redo
            } else if (e.key === 'b' || e.key === 'B') {
                e.preventDefault();
                // Find and click sidebar button
                const btnSidebar = document.getElementById('btn-sidebar-toggle');
                btnSidebar?.click();
            } else if (e.key === 'c' || e.key === 'C') {
                if (!isEditingText()) {
                    e.preventDefault();
                    copySelectedNodes();
                }
            } else if (e.key === 'v' || e.key === 'V') {
                if (!isEditingText()) {
                    e.preventDefault();
                    pasteNodes();
                }
            }
        } else {
            if (e.key === 'Delete') {
                // Ignore if user is editing inside a form field or textbox
                const activeEl = document.activeElement;
                if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.getAttribute('contenteditable') === 'true')) {
                    return;
                }
                const idsToDeleteCount = appState.selectedNodeIds.size + (appState.selectedNodeId && !appState.selectedNodeIds.has(appState.selectedNodeId) ? 1 : 0);
                const edgesToDeleteCount = appState.selectedEdgeIds.size + (appState.selectedEdgeId && !appState.selectedEdgeIds.has(appState.selectedEdgeId) ? 1 : 0);

                if (idsToDeleteCount > 0 || edgesToDeleteCount > 0 || appState.hoveredEdgeId) {
                    e.preventDefault();
                    pushToHistory();

                    // 1. Delete nodes if any selected
                    const nodeIdsDeleted = new Set<string>();
                    let updatedNodes = { ...appState.currentGraph.nodes };
                    if (idsToDeleteCount > 0) {
                        appState.selectedNodeIds.forEach(id => nodeIdsDeleted.add(id));
                        if (appState.selectedNodeId) nodeIdsDeleted.add(appState.selectedNodeId);

                        nodeIdsDeleted.forEach(id => {
                            delete (updatedNodes as any)[id];
                        });

                        appState.selectedNodeId = null;
                        appState.selectedNodeIds.clear();

                        logToTerminal(`Deleted ${nodeIdsDeleted.size} selected node(s)`, 'system-msg');
                    }

                    // 2. Delete edges (connected to deleted nodes, or explicitly selected/hovered)
                    const edgesToDelete = new Set<string>();
                    appState.selectedEdgeIds.forEach(id => edgesToDelete.add(id));
                    if (appState.selectedEdgeId) edgesToDelete.add(appState.selectedEdgeId);

                    // Fallback to hovered edge if no explicit selection
                    if (idsToDeleteCount === 0 && edgesToDeleteCount === 0 && appState.hoveredEdgeId) {
                        edgesToDelete.add(appState.hoveredEdgeId);
                    }

                    const updatedEdges = appState.currentGraph.edges.filter(
                        edge => !nodeIdsDeleted.has(edge.sourceNodeId) &&
                                 !nodeIdsDeleted.has(edge.targetNodeId) &&
                                 !edgesToDelete.has(edge.id)
                    );

                    appState.currentGraph = {
                        nodes: updatedNodes,
                        edges: updatedEdges
                    };

                    if (edgesToDelete.size > 0 && idsToDeleteCount === 0) {
                        logToTerminal(`Deleted ${edgesToDelete.size} connection(s)`, 'system-msg');
                    }

                    // Clear edge selections
                    appState.selectedEdgeId = null;
                    appState.selectedEdgeIds.clear();
                    appState.hoveredEdgeId = null;

                    syncContextState();
                    updateInspector();
                    triggerAutoRun();
                }
            }
        }
    });

    window.addEventListener('keyup', (e) => {
        if (e.key === 'Shift') {
            appState.isShiftPressed = false;
            updateCursor();
        }
    });

    // ========================================================================
    // MOUSE INTERACTION EVENT LISTENERS
    // ========================================================================

    // Global click-away handler to dismiss context menu and close/clean up unconfigured node adder
    document.addEventListener('mousedown', (e) => {
        const target = e.target as HTMLElement;

        // Dismiss context menu if clicking outside of it
        const ctxMenu = document.getElementById('context-menu');
        if (ctxMenu && !ctxMenu.classList.contains('hidden')) {
            if (!ctxMenu.contains(target)) {
                ctxMenu.classList.add('hidden');
            }
        }

        // Close and delete unconfigured node if clicking outside of the search adder
        const adder = document.getElementById('node-adder');
        if (adder && !adder.classList.contains('hidden')) {
            const isClickInsideAdder = adder.contains(target);
            const isClickInsideSidebar = document.getElementById('sidebar')?.contains(target);
            const isRightClickOnCanvas = e.button === 2 && target.id === 'graph-canvas';
            if (!isClickInsideAdder && !isRightClickOnCanvas) {
                if (isClickInsideSidebar) {
                    closeNodeAdder(false);
                } else {
                    closeNodeAdder(true);
                }
            }
        }
    });

    // Search element coordinate bounds
    canvas.addEventListener('mousedown', (e) => {
        // Hide context menu if showing
        document.getElementById('context-menu')?.classList.add('hidden');

        // Ignore right-clicks to prevent panning and drag-state interference
        if (e.button === 2) return;

        appState.mouseDownClientX = e.clientX;
        appState.mouseDownClientY = e.clientY;
        appState.mouseDownTime = Date.now();

        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        const worldPos = screenToWorld(mouseX, mouseY);

        // Check if clicked the ellipsis button, drawer body, or thumbtack button of any node
        const nodesReversedClick = Object.values(appState.currentGraph.nodes).reverse(); // Topmost first
        for (const node of nodesReversedClick) {
            const w = node.ui?.width ?? NODE_WIDTH;
            const h = getNodeHeight(node);
            const nx = node.ui?.x ?? 0;
            const ny = node.ui?.y ?? 0;

            const isPinned = appState.pinnedDrawerNodeIds.has(node.id);
            const isDrawerOpen = appState.hoveredDrawerNodeId === node.id || isPinned;

            if (isDrawerOpen) {
                // Check click on thumbtack button
                const pinCX = nx + w / 2 + 54;
                const pinCY = ny + h + 18;
                if (Math.hypot(worldPos.x - pinCX, worldPos.y - pinCY) <= 10) {
                    if (isPinned) {
                        appState.pinnedDrawerNodeIds.delete(node.id);
                    } else {
                        appState.pinnedDrawerNodeIds.add(node.id);
                    }
                    syncContextState();
                    updateCursor();
                    if (appState.renderingContext) {
                        appState.renderingContext.needsRedraw = true;
                    }
                    return;
                }

                // Check click inside the drawer body (to prevent node dragging or background panning)
                const drawerW = 144;
                const drawerH = 24;
                const drawerX = nx + w / 2 - drawerW / 2;
                const drawerY = ny + h + 6;
                if (worldPos.x >= drawerX && worldPos.x <= drawerX + drawerW && worldPos.y >= drawerY && worldPos.y <= drawerY + drawerH) {
                    return;
                }
            }

            // Check click on ellipsis button
            const btnW = 20;
            const btnH = 12;
            const btnX = nx + w - btnW - 6;
            const btnY = ny + h - btnH - 6;
            if (worldPos.x >= btnX && worldPos.x <= btnX + btnW && worldPos.y >= btnY && worldPos.y <= btnY + btnH) {
                if (isPinned) {
                    appState.pinnedDrawerNodeIds.delete(node.id);
                } else {
                    appState.pinnedDrawerNodeIds.add(node.id);
                }
                syncContextState();
                updateCursor();
                if (appState.renderingContext) {
                    appState.renderingContext.needsRedraw = true;
                }
                return;
            }
        }

        // 1. Check if clicked a pin dot
        let pinClicked = false;
        
        for (const nodeId in appState.currentGraph.nodes) {
            const node = appState.currentGraph.nodes[nodeId];
            const nodeDef = StandardNodes[node.type];
            if (!nodeDef) continue;

            // Inputs
            const inputs = Object.keys(getNodeInputs(node, appState.resolvedInputs));
            for (let i = 0; i < inputs.length; i++) {
                const pos = getInputPinCoords(node, inputs[i]);
                if (isPinHit(worldPos, pos, true)) {
                    pinClicked = true;
                    if (loadSettings().canvas.autoBringToFront) {
                        bringNodeToFront(node.id);
                    }
                    // Start dragging from an input pin (reversing connection or link dragging)
                    if (appState.renderingContext) {
                        appState.renderingContext.draggingConnection = {
                            sourceNodeId: node.id,
                            sourcePinId: inputs[i],
                            isInput: true,
                            x: pos.x,
                            y: pos.y,
                            cursorX: worldPos.x,
                            cursorY: worldPos.y
                        };
                    }
                    break;
                }
            }
            if (pinClicked) break;

            // Outputs
            const outputs = Object.keys(getNodeOutputs(node, appState.resolvedOutputs));
            for (let i = 0; i < outputs.length; i++) {
                const pos = getOutputPinCoords(node, outputs[i]);
                if (isPinHit(worldPos, pos, false)) {
                    pinClicked = true;
                    if (loadSettings().canvas.autoBringToFront) {
                        bringNodeToFront(node.id);
                    }
                    if (appState.renderingContext) {
                        appState.renderingContext.draggingConnection = {
                            sourceNodeId: node.id,
                            sourcePinId: outputs[i],
                            isInput: false,
                            x: pos.x,
                            y: pos.y,
                            cursorX: worldPos.x,
                            cursorY: worldPos.y
                        };
                    }
                    break;
                }
            }
        }

        if (!pinClicked) {
            for (const nodeId in appState.currentGraph.nodes) {
                const node = appState.currentGraph.nodes[nodeId];
                const nodeDef = StandardNodes[node.type];
                if (!nodeDef) continue;

                const nx = node.ui?.x ?? 0;
                const ny = node.ui?.y ?? 0;
                const nw = node.ui?.width ?? NODE_WIDTH;
                const nh = getNodeHeight(node);

                // Right edge zone (for outputs)
                const rightX = nx + nw;
                const rightDistX = Math.abs(worldPos.x - rightX);
                const rightDistY = worldPos.y - (ny + HEADER_HEIGHT);
                
                if (rightDistX <= 12 && rightDistY >= 0 && rightDistY <= nh - HEADER_HEIGHT) {
                    if (nodeDef.dynamicOutputs) {
                        pushToHistory();
                        
                        const currentOutputs = getNodeOutputs(node);
                        let nextIdx = 0;
                        let pinName = `output${nextIdx}`;
                        while (pinName in currentOutputs) {
                            nextIdx++;
                            pinName = `output${nextIdx}`;
                        }

                        const updatedOutputs = { ...currentOutputs, [pinName]: 'any' as const };
                        
                        appState.currentGraph = {
                            ...appState.currentGraph,
                            nodes: {
                                ...appState.currentGraph.nodes,
                                [node.id]: {
                                    ...node,
                                    outputs: updatedOutputs
                                }
                            }
                        };
                        
                        const pinIndex = Object.keys(updatedOutputs).length - 1;
                        const pinY = ny + HEADER_HEIGHT + 30 + pinIndex * ROW_HEIGHT;

                        if (appState.renderingContext) {
                            appState.renderingContext.draggingConnection = {
                                sourceNodeId: node.id,
                                sourcePinId: pinName,
                                isInput: false,
                                x: rightX,
                                y: pinY,
                                cursorX: worldPos.x,
                                cursorY: worldPos.y
                            };
                        }
                        
                        pinClicked = true;
                        logToTerminal(`Created output pin '${pinName}' on Node ${node.id} via border drag`, 'system-msg');
                        updateInspector();
                        break;
                    }
                }

                // Left edge zone (for inputs)
                const leftX = nx;
                const leftDistX = Math.abs(worldPos.x - leftX);
                const leftDistY = worldPos.y - (ny + HEADER_HEIGHT);
                
                if (leftDistX <= 12 && leftDistY >= 0 && leftDistY <= nh - HEADER_HEIGHT) {
                    if (nodeDef.dynamicInputs) {
                        pushToHistory();
                        
                        const currentInputs = getNodeInputs(node);
                        let nextIdx = 0;
                        let pinName = `input${nextIdx}`;
                        while (pinName in currentInputs) {
                            nextIdx++;
                            pinName = `input${nextIdx}`;
                        }

                        const updatedInputs = { ...currentInputs, [pinName]: 'any' as const };
                        
                        appState.currentGraph = {
                            ...appState.currentGraph,
                            nodes: {
                                ...appState.currentGraph.nodes,
                                [node.id]: {
                                    ...node,
                                    inputs: updatedInputs
                                }
                            }
                        };
                        
                        const pinIndex = Object.keys(updatedInputs).length - 1;
                        const pinY = ny + HEADER_HEIGHT + 30 + pinIndex * ROW_HEIGHT;

                        if (appState.renderingContext) {
                            appState.renderingContext.draggingConnection = {
                                sourceNodeId: node.id,
                                sourcePinId: pinName,
                                isInput: true,
                                x: leftX,
                                y: pinY,
                                cursorX: worldPos.x,
                                cursorY: worldPos.y
                            };
                        }
                        
                        pinClicked = true;
                        logToTerminal(`Created input pin '${pinName}' on Node ${node.id} via border drag`, 'system-msg');
                        updateInspector();
                        break;
                    }
                }
            }
        }

        if (pinClicked) {
            updateCursor();
            return;
        }

        // 2. Check if clicked on a node body
        let clickedNodeId: string | null = null;
        const nodesReversed = Object.values(appState.currentGraph.nodes).reverse(); // Topmost first
        
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
            if (!(e.shiftKey || e.ctrlKey || e.metaKey)) {
                appState.selectedEdgeId = null;
                appState.selectedEdgeIds.clear();
            }
            // Bring clicked node to front
            if (loadSettings().canvas.autoBringToFront) {
                bringNodeToFront(clickedNodeId);
            }

            // Toggle or set selection
            if (e.shiftKey || e.ctrlKey || e.metaKey) {
                if (appState.selectedNodeIds.has(clickedNodeId)) {
                    appState.selectedNodeIds.delete(clickedNodeId);
                    if (appState.selectedNodeId === clickedNodeId) {
                        appState.selectedNodeId = appState.selectedNodeIds.size > 0 ? Array.from(appState.selectedNodeIds)[0] : null;
                    }
                } else {
                    appState.selectedNodeIds.add(clickedNodeId);
                    appState.selectedNodeId = clickedNodeId; // primary selection
                }
            } else {
                // If not holding shift, and the node is NOT already in selectedNodeIds,
                // we set this node as the sole selection.
                // If it IS already selected, we keep the selection so all selected nodes can be dragged together.
                if (!appState.selectedNodeIds.has(clickedNodeId)) {
                    appState.selectedNodeIds.clear();
                    appState.selectedNodeIds.add(clickedNodeId);
                    appState.selectedNodeId = clickedNodeId;
                }
            }
            syncContextState();
            
            appState.draggedNodeId = clickedNodeId;
            
            const node = appState.currentGraph.nodes[clickedNodeId];
            appState.dragOffsetX = worldPos.x - (node.ui?.x ?? 0);
            appState.dragOffsetY = worldPos.y - (node.ui?.y ?? 0);
            
            // Save starting positions of all selected nodes for relative drag movement
            appState.dragNodesOriginalPositions.clear();
            appState.selectedNodeIds.forEach(id => {
                const n = appState.currentGraph.nodes[id];
                if (n && n.ui) {
                    appState.dragNodesOriginalPositions.set(id, { x: n.ui.x, y: n.ui.y });
                }
            });
            // Ensure the clicked node itself is in original positions
            if (node && node.ui) {
                appState.dragNodesOriginalPositions.set(clickedNodeId, { x: node.ui.x, y: node.ui.y });
            }
            
            // Record pre-drag details to handle undo cleanly upon mouseup
            appState.preDragGraphState = structuredClone(appState.currentGraph);
            appState.dragHasMoved = false;
            appState.dragNodeOriginalX = node.ui?.x ?? 0;
            appState.dragNodeOriginalY = node.ui?.y ?? 0;
            
            // Hide node adder if showing
            closeNodeAdder();
            updateInspector();
            updateCursor();
            return;
        }

        // 3. Check if clicked an edge
        if (appState.hoveredEdgeId) {
            const clickedEdgeId = appState.hoveredEdgeId;
            if (!(e.shiftKey || e.ctrlKey || e.metaKey)) {
                appState.selectedNodeId = null;
                appState.selectedNodeIds.clear();
            }

            if (e.shiftKey || e.ctrlKey || e.metaKey) {
                if (appState.selectedEdgeIds.has(clickedEdgeId)) {
                    appState.selectedEdgeIds.delete(clickedEdgeId);
                    if (appState.selectedEdgeId === clickedEdgeId) {
                        appState.selectedEdgeId = appState.selectedEdgeIds.size > 0 ? Array.from(appState.selectedEdgeIds)[0] : null;
                    }
                } else {
                    appState.selectedEdgeIds.add(clickedEdgeId);
                    appState.selectedEdgeId = clickedEdgeId;
                }
            } else {
                if (!appState.selectedEdgeIds.has(clickedEdgeId)) {
                    appState.selectedEdgeIds.clear();
                    appState.selectedEdgeIds.add(clickedEdgeId);
                    appState.selectedEdgeId = clickedEdgeId;
                }
            }

            syncContextState();
            updateInspector();
            updateCursor();
            if (appState.renderingContext) {
                appState.renderingContext.needsRedraw = true;
            }
            return;
        }

        // 4. Fallback: Clicked empty canvas space. Start panning or selection box.
        closeNodeAdder();

        if (e.shiftKey) {
            // Start Selection Box (CAD-style crossing/enclosing selection window)
            appState.isPanning = false;
            if (appState.renderingContext) {
                appState.renderingContext.selectionBox = {
                    startX: worldPos.x,
                    startY: worldPos.y,
                    currentX: worldPos.x,
                    currentY: worldPos.y,
                    active: true
                };
            }
        } else {
            // Panning: start pan without clearing selections
            appState.isPanning = true;
            appState.panStartX = e.clientX;
            appState.panStartY = e.clientY;
            appState.viewportStartX = appState.viewport.x;
            appState.viewportStartY = appState.viewport.y;
        }
        updateCursor();
        if (appState.renderingContext) {
            appState.renderingContext.needsRedraw = true;
        }
    });

    canvas.addEventListener('mousemove', (e) => {
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        const worldPos = screenToWorld(mouseX, mouseY);

        // A. Handle active dragging connection wire
        if (appState.renderingContext?.draggingConnection) {
            appState.renderingContext.draggingConnection.cursorX = worldPos.x;
            appState.renderingContext.draggingConnection.cursorY = worldPos.y;
        }

        // B. Handle node moving (potentially multiple nodes together)
        else if (appState.draggedNodeId && appState.currentGraph.nodes[appState.draggedNodeId]) {
            const mainNode = appState.currentGraph.nodes[appState.draggedNodeId];
            const origPos = appState.dragNodesOriginalPositions.get(appState.draggedNodeId) || { x: mainNode.ui?.x ?? 0, y: mainNode.ui?.y ?? 0 };

            let newX = Math.round(worldPos.x - appState.dragOffsetX);
            let newY = Math.round(worldPos.y - appState.dragOffsetY);
            
            // Snap to grid if Shift is held down or if snap-to-grid setting is enabled
            const snapEnabled = loadSettings().canvas.snapToGrid || e.shiftKey;
            if (snapEnabled) {
                newX = Math.round(newX / GRID_SIZE) * GRID_SIZE;
                newY = Math.round(newY / GRID_SIZE) * GRID_SIZE;
            }
            
            // Check if node has actually shifted position (by grid snap or client pixel drift)
            const screenDrift = Math.hypot(e.clientX - appState.mouseDownClientX, e.clientY - appState.mouseDownClientY);
            if (screenDrift > 6 || newX !== appState.dragNodeOriginalX || newY !== appState.dragNodeOriginalY) {
                appState.dragHasMoved = true;
            }

            const dx = newX - origPos.x;
            const dy = newY - origPos.y;

            let updatedNodes = { ...appState.currentGraph.nodes };
            appState.dragNodesOriginalPositions.forEach((pos, id) => {
                const node = appState.currentGraph.nodes[id];
                if (node) {
                    (updatedNodes as any)[id] = {
                        ...node,
                        ui: {
                            ...(node.ui ?? { x: 0, y: 0 }),
                            x: pos.x + dx,
                            y: pos.y + dy
                        }
                    };
                }
            });

            appState.currentGraph = {
                ...appState.currentGraph,
                nodes: updatedNodes
            };
        }

        // C. Handle selection box resizing
        else if (appState.renderingContext?.selectionBox && appState.renderingContext.selectionBox.active) {
            appState.renderingContext.selectionBox.currentX = worldPos.x;
            appState.renderingContext.selectionBox.currentY = worldPos.y;
        }

        // D. Handle canvas panning
        else if (appState.isPanning) {
            const dx = e.clientX - appState.panStartX;
            const dy = e.clientY - appState.panStartY;
            appState.viewport.x = appState.viewportStartX + dx;
            appState.viewport.y = appState.viewportStartY + dy;
            if (appState.renderingContext) {
                appState.renderingContext.viewport = { ...appState.viewport };
            }
        }

        // D. Calculate pin / node hover states (and drawer/ellipsis/pin states)
        let hNodeId: string | null = null;
        let hPin: typeof appState.hoveredPin = null;
        let hEllipsisNodeId: string | null = null;
        let hPinNodeId: string | null = null;
        let hDrawerNodeId: string | null = null;

        const nodesReversedHover = Object.values(appState.currentGraph.nodes).reverse(); // Topmost first
        for (const node of nodesReversedHover) {
            const nodeDef = StandardNodes[node.type];
            if (!nodeDef) continue;

            const w = node.ui?.width ?? NODE_WIDTH;
            const h = getNodeHeight(node);
            const nx = node.ui?.x ?? 0;
            const ny = node.ui?.y ?? 0;

            const isPinned = appState.pinnedDrawerNodeIds.has(node.id);
            const isDrawerOpen = appState.hoveredDrawerNodeId === node.id || isPinned;

            if (isDrawerOpen) {
                // Check if hovering thumbtack button
                const pinCX = nx + w / 2 + 54;
                const pinCY = ny + h + 18;
                if (Math.hypot(worldPos.x - pinCX, worldPos.y - pinCY) <= 10) {
                    hPinNodeId = node.id;
                    hDrawerNodeId = node.id;
                    break;
                }

                // Check if hovering drawer body
                const drawerW = 144;
                const drawerH = 24;
                const drawerX = nx + w / 2 - drawerW / 2;
                const drawerY = ny + h + 6;
                if (worldPos.x >= drawerX && worldPos.x <= drawerX + drawerW && worldPos.y >= drawerY && worldPos.y <= drawerY + drawerH) {
                    hDrawerNodeId = node.id;
                    break;
                }
            }

            // Check if hovering ellipsis button
            const btnW = 20;
            const btnH = 12;
            const btnX = nx + w - btnW - 6;
            const btnY = ny + h - btnH - 6;
            if (worldPos.x >= btnX && worldPos.x <= btnX + btnW && worldPos.y >= btnY && worldPos.y <= btnY + btnH) {
                hEllipsisNodeId = node.id;
                hDrawerNodeId = node.id;
                break;
            }

            // Inputs
            const inputs = Object.keys(getNodeInputs(node, appState.resolvedInputs));
            for (let i = 0; i < inputs.length; i++) {
                const pos = getInputPinCoords(node, inputs[i]);
                if (isPinHit(worldPos, pos, true)) {
                    hPin = { nodeId: node.id, pinId: inputs[i], isInput: true };
                    break;
                }
            }

            // Outputs
            if (!hPin) {
                const outputs = Object.keys(getNodeOutputs(node, appState.resolvedOutputs));
                for (let i = 0; i < outputs.length; i++) {
                    const pos = getOutputPinCoords(node, outputs[i]);
                    if (isPinHit(worldPos, pos, false)) {
                        hPin = { nodeId: node.id, pinId: outputs[i], isInput: false };
                        break;
                    }
                }
            }

            if (hPin) {
                break;
            }

            // Check if hovering node body
            if (worldPos.x >= nx && worldPos.x <= nx + w && worldPos.y >= ny && worldPos.y <= ny + h) {
                hNodeId = node.id;
                break;
            }
        }

        // E. Calculate edge hover state
        let hEdgeId: string | null = null;
        let hEdgePos: { x: number; y: number } | null = null;

        if (!hNodeId && !hPin && !hEllipsisNodeId && !hPinNodeId && !hDrawerNodeId) {
            const edgeStyle = loadSettings().canvas.edgeStyle || 'spline';
            let minDistance = Infinity;

            for (const edge of appState.currentGraph.edges) {
                const sourceNode = appState.currentGraph.nodes[edge.sourceNodeId];
                const targetNode = appState.currentGraph.nodes[edge.targetNodeId];
                if (!sourceNode || !targetNode) continue;

                const sourceDef = StandardNodes[sourceNode.type];
                const targetDef = StandardNodes[targetNode.type];
                if (!sourceDef || !targetDef) continue;

                const outPinNames = Object.keys(getNodeOutputs(sourceNode));
                const inPinNames = Object.keys(getNodeInputs(targetNode));
                const outIndex = outPinNames.indexOf(edge.sourcePinId);
                const inIndex = inPinNames.indexOf(edge.targetPinId);

                if (outIndex === -1 || inIndex === -1) continue;

                const sourcePos = getOutputPinCoords(sourceNode, edge.sourcePinId);
                const targetPos = getInputPinCoords(targetNode, edge.targetPinId);

                const { distance, midpoint } = getDistanceToEdge(worldPos.x, worldPos.y, sourcePos, targetPos, edgeStyle);
                if (distance <= 12 && distance < minDistance) {
                    minDistance = distance;
                    hEdgeId = edge.id;
                    hEdgePos = midpoint;
                }
            }
        }

        appState.hoveredEdgeId = hEdgeId;
        appState.hoveredEdgePos = hEdgePos;

        appState.hoveredNodeId = hNodeId;
        appState.hoveredPin = hPin;
        appState.hoveredEllipsisNodeId = hEllipsisNodeId;
        appState.hoveredPinNodeId = hPinNodeId;
        appState.hoveredDrawerNodeId = hDrawerNodeId;
        
        if (appState.renderingContext) {
            appState.renderingContext.hoveredNodeId = appState.hoveredNodeId;
            appState.renderingContext.hoveredPin = appState.hoveredPin;
            appState.renderingContext.hoveredEllipsisNodeId = appState.hoveredEllipsisNodeId;
            appState.renderingContext.hoveredPinNodeId = appState.hoveredPinNodeId;
            appState.renderingContext.hoveredDrawerNodeId = appState.hoveredDrawerNodeId;
        }
        updateCursor();
        if (appState.renderingContext) {
            appState.renderingContext.needsRedraw = true;
        }
    });

    canvas.addEventListener('mouseup', (e) => {
        if (e.button === 2) return;
        const rect = canvas.getBoundingClientRect();
        const screenX = e.clientX - rect.left;
        const screenY = e.clientY - rect.top;
        const worldPos = screenToWorld(screenX, screenY);

        // A. Resolve Edge linkages on connection release
        if (appState.renderingContext?.draggingConnection) {
            const drag = appState.renderingContext.draggingConnection;
            
            // 1. Released over a specific hovered pin
            if (appState.hoveredPin && appState.hoveredPin.nodeId !== drag.sourceNodeId && appState.hoveredPin.isInput !== drag.isInput) {
                const sourceNodeId = drag.isInput ? appState.hoveredPin.nodeId : drag.sourceNodeId;
                const sourcePinId = drag.isInput ? appState.hoveredPin.pinId : drag.sourcePinId;
                const targetNodeId = drag.isInput ? drag.sourceNodeId : appState.hoveredPin.nodeId;
                const targetPinId = drag.isInput ? drag.sourcePinId : appState.hoveredPin.pinId;

                const sourceNode = appState.currentGraph.nodes[sourceNodeId];
                const targetNode = appState.currentGraph.nodes[targetNodeId];
                
                logToTerminal(`mouseup: hoveredPin={nodeId: ${appState.hoveredPin.nodeId}, pinId: ${appState.hoveredPin.pinId}, isInput: ${appState.hoveredPin.isInput}}`, 'system-msg');
                logToTerminal(`mouseup: sourceNode=${sourceNode?.id} (${sourceNode?.type}), targetNode=${targetNode?.id} (${targetNode?.type})`, 'system-msg');

                if (sourceNode && targetNode) {
                    const sourceDef = StandardNodes[sourceNode.type];
                    const targetDef = StandardNodes[targetNode.type];
                    
                    logToTerminal(`mouseup: sourceDef=${!!sourceDef}, targetDef=${!!targetDef}`, 'system-msg');

                    if (sourceDef && targetDef) {
                        const sourceType = getNodeOutputs(sourceNode, appState.resolvedOutputs)[sourcePinId];
                        const targetType = getNodeInputs(targetNode, appState.resolvedInputs)[targetPinId];
                        
                        logToTerminal(`mouseup: sourcePin=${sourcePinId} (${sourceType}), targetPin=${targetPinId} (${targetType})`, 'system-msg');

                        if (isCompatible(sourceType, targetType)) {
                            pushToHistory();

                            const cleanedEdges = appState.currentGraph.edges.filter(
                                edge => !(edge.targetNodeId === targetNodeId && edge.targetPinId === targetPinId)
                            );

                            const newEdge: Edge = {
                                id: `edge_${Date.now()}`,
                                sourceNodeId,
                                sourcePinId,
                                targetNodeId,
                                targetPinId
                            };

                            appState.currentGraph = {
                                ...appState.currentGraph,
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
            // 2. Released over a node body (supporting dynamic pin addition on drop)
            else if (!appState.hoveredPin) {
                let hitNode: NodeState | null = null;
                for (const nodeId in appState.currentGraph.nodes) {
                    const node = appState.currentGraph.nodes[nodeId];
                    const x = node.ui?.x ?? 0;
                    const y = node.ui?.y ?? 0;
                    const w = node.ui?.width ?? NODE_WIDTH;
                    const nodeDef = StandardNodes[node.type];
                    const h = getNodeHeight(node);

                    if (worldPos.x >= x && worldPos.x <= x + w && worldPos.y >= y && worldPos.y <= y + h) {
                        hitNode = node;
                        break;
                    }
                }

                if (hitNode && hitNode.id !== drag.sourceNodeId) {
                    const hitDef = StandardNodes[hitNode.type];
                    
                    if (drag.isInput === false && hitDef?.dynamicInputs) {
                        // Dragged from output -> drop on hitNode body -> Add Input Pin!
                        pushToHistory();

                        const currentInputs = getNodeInputs(hitNode);
                        let nextIdx = 0;
                        let newPinId = `input${nextIdx}`;
                        while (newPinId in currentInputs) {
                            nextIdx++;
                            newPinId = `input${nextIdx}`;
                        }

                        const updatedInputs = { ...currentInputs, [newPinId]: 'any' as const };
                        
                        const newEdge: Edge = {
                            id: `edge_${Date.now()}`,
                            sourceNodeId: drag.sourceNodeId,
                            sourcePinId: drag.sourcePinId,
                            targetNodeId: hitNode.id,
                            targetPinId: newPinId
                        };

                        appState.currentGraph = {
                            ...appState.currentGraph,
                            nodes: {
                                ...appState.currentGraph.nodes,
                                [hitNode.id]: {
                                    ...hitNode,
                                    inputs: updatedInputs
                                }
                            },
                            edges: [...appState.currentGraph.edges, newEdge]
                        };

                        logToTerminal(`Added input pin '${newPinId}' and connected to [Node ${drag.sourceNodeId}].${drag.sourcePinId}`, 'system-msg');
                        updateInspector();
                        triggerAutoRun();
                    }
                    else if (drag.isInput === true && hitDef?.dynamicOutputs) {
                        // Dragged from input -> drop on hitNode body -> Add Output Pin!
                        pushToHistory();

                        const currentOutputs = getNodeOutputs(hitNode);
                        let nextIdx = 0;
                        let newPinId = `output${nextIdx}`;
                        while (newPinId in currentOutputs) {
                            nextIdx++;
                            newPinId = `output${nextIdx}`;
                        }

                        const updatedOutputs = { ...currentOutputs, [newPinId]: 'any' as const };

                        const newEdge: Edge = {
                            id: `edge_${Date.now()}`,
                            sourceNodeId: hitNode.id,
                            sourcePinId: newPinId,
                            targetNodeId: drag.sourceNodeId,
                            targetPinId: drag.sourcePinId
                        };

                        const cleanedEdges = appState.currentGraph.edges.filter(
                            edge => !(edge.targetNodeId === drag.sourceNodeId && edge.targetPinId === drag.sourcePinId)
                        );

                        appState.currentGraph = {
                            ...appState.currentGraph,
                            nodes: {
                                ...appState.currentGraph.nodes,
                                [hitNode.id]: {
                                    ...hitNode,
                                    outputs: updatedOutputs
                                }
                            },
                            edges: [...cleanedEdges, newEdge]
                        };

                        logToTerminal(`Added output pin '${newPinId}' and connected to [Node ${drag.sourceNodeId}].${drag.sourcePinId}`, 'system-msg');
                        updateInspector();
                        triggerAutoRun();
                    }
                }
            }
            
            appState.renderingContext.draggingConnection = null;
        }

        // B. Resolve Node Drag completion
        if (appState.draggedNodeId) {
            // Click-without-drag selection resolution
            if (!appState.dragHasMoved && !(e.shiftKey || e.ctrlKey || e.metaKey)) {
                appState.selectedNodeIds.clear();
                appState.selectedNodeIds.add(appState.draggedNodeId);
                appState.selectedNodeId = appState.draggedNodeId;
                syncContextState();
                updateInspector();
            }

            // Push history snapshot ONLY if the node was actually moved to avoid empty history pushes
            if (appState.preDragGraphState && appState.dragHasMoved) {
                undoStack.push(appState.preDragGraphState);
                if (undoStack.length > 50) undoStack.shift();
                redoStack.length = 0;
                updateUndoRedoButtons();
                triggerAutoRun();
            }
            appState.preDragGraphState = null;
            appState.dragHasMoved = false;
        }

        // C. Resolve Selection Box completion
        if (appState.renderingContext?.selectionBox && appState.renderingContext.selectionBox.active) {
            const box = appState.renderingContext.selectionBox;
            const bx = Math.min(box.startX, box.currentX);
            const by = Math.min(box.startY, box.currentY);
            const bw = Math.abs(box.currentX - box.startX);
            const bh = Math.abs(box.currentY - box.startY);
            const isEnclosing = box.currentX >= box.startX;

            if (bw >= 2 || bh >= 2) {
                const selectedFromBox: string[] = [];
                const selectedEdgesFromBox: string[] = [];

                for (const nodeId in appState.currentGraph.nodes) {
                    const node = appState.currentGraph.nodes[nodeId];
                    const nx = node.ui?.x ?? 0;
                    const ny = node.ui?.y ?? 0;
                    const nw = node.ui?.width ?? NODE_WIDTH;
                    const nh = getNodeHeight(node);

                    if (isEnclosing) {
                        // Enclosing Window (left-to-right): Node must be fully enclosed
                        if (nx >= bx && (nx + nw) <= (bx + bw) && ny >= by && (ny + nh) <= (by + bh)) {
                            selectedFromBox.push(nodeId);
                        }
                    } else {
                        // Crossing Window (right-to-left): Node must intersect/touch
                        if (nx <= (bx + bw) && (nx + nw) >= bx && ny <= (by + bh) && (ny + nh) >= by) {
                            selectedFromBox.push(nodeId);
                        }
                    }
                }

                // Resolve Edges selection from box
                appState.currentGraph.edges.forEach(edge => {
                    const sourceNode = appState.currentGraph.nodes[edge.sourceNodeId];
                    const targetNode = appState.currentGraph.nodes[edge.targetNodeId];
                    if (sourceNode && targetNode) {
                        const sourceDef = StandardNodes[sourceNode.type];
                        const targetDef = StandardNodes[targetNode.type];
                        if (sourceDef && targetDef) {
                            const outPinNames = Object.keys(getNodeOutputs(sourceNode, appState.resolvedOutputs));
                            const inPinNames = Object.keys(getNodeInputs(targetNode, appState.resolvedInputs));
                            const outIndex = outPinNames.indexOf(edge.sourcePinId);
                            const inIndex = inPinNames.indexOf(edge.targetPinId);

                            if (outIndex !== -1 && inIndex !== -1) {
                                const sourcePos = getOutputPinPos(sourceNode, sourceDef, outIndex);
                                const targetPos = getInputPinPos(targetNode, inIndex);

                                let isEdgeSelected = false;
                                if (isEnclosing) {
                                    // Enclosing: both endpoints must be inside
                                    const sxIn = sourcePos.x >= bx && sourcePos.x <= bx + bw && sourcePos.y >= by && sourcePos.y <= by + bh;
                                    const txIn = targetPos.x >= bx && targetPos.x <= bx + bw && targetPos.y >= by && targetPos.y <= by + bh;
                                    isEdgeSelected = sxIn && txIn;
                                } else {
                                    // Crossing: line segment intersects the selection box
                                    isEdgeSelected = isLineIntersectingBox(sourcePos.x, sourcePos.y, targetPos.x, targetPos.y, bx, by, bw, bh);
                                }

                                if (isEdgeSelected) {
                                    selectedEdgesFromBox.push(edge.id);
                                }
                            }
                        }
                    }
                });

                // If Ctrl/Cmd is held down, toggle/add to existing selection.
                // Otherwise, replace the selection.
                if (e.ctrlKey || e.metaKey) {
                    selectedFromBox.forEach(id => {
                        if (appState.selectedNodeIds.has(id)) {
                            appState.selectedNodeIds.delete(id);
                        } else {
                            appState.selectedNodeIds.add(id);
                        }
                    });

                    selectedEdgesFromBox.forEach(id => {
                        if (appState.selectedEdgeIds.has(id)) {
                            appState.selectedEdgeIds.delete(id);
                        } else {
                            appState.selectedEdgeIds.add(id);
                        }
                    });
                } else {
                    appState.selectedNodeIds.clear();
                    selectedFromBox.forEach(id => appState.selectedNodeIds.add(id));

                    appState.selectedEdgeIds.clear();
                    selectedEdgesFromBox.forEach(id => appState.selectedEdgeIds.add(id));
                }

                appState.selectedNodeId = appState.selectedNodeIds.size > 0 ? Array.from(appState.selectedNodeIds)[0] : null;
                appState.selectedEdgeId = appState.selectedEdgeIds.size > 0 ? Array.from(appState.selectedEdgeIds)[0] : null;
            } else {
                // Click on empty space: clear selection
                appState.selectedNodeIds.clear();
                appState.selectedNodeId = null;
                appState.selectedEdgeIds.clear();
                appState.selectedEdgeId = null;
            }

            appState.renderingContext.selectionBox = null;
            syncContextState();
            updateInspector();
        }

        // D. Resolve Pan completion
        if (appState.isPanning) {
            const dx = e.clientX - appState.panStartX;
            const dy = e.clientY - appState.panStartY;
            const dist = Math.hypot(dx, dy);
            if (dist < 3) {
                appState.selectedNodeId = null;
                appState.selectedNodeIds.clear();
                appState.selectedEdgeId = null;
                appState.selectedEdgeIds.clear();
                syncContextState();
                updateInspector();
            }
            appState.isPanning = false;
        }

        appState.draggedNodeId = null;
        updateCursor();
        if (appState.renderingContext) {
            appState.renderingContext.needsRedraw = true;
        }
        updateSetting('canvas', 'camera', {
            x: appState.viewport.x,
            y: appState.viewport.y,
            zoom: appState.viewport.zoom
        });
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
        appState.viewport.zoom = Math.max(0.05, Math.min(3.0, appState.viewport.zoom * zoomFactor));

        // Shift Pan offset dynamically to preserve pointer center focal point
        appState.viewport.x = mouseX - worldPos.x * appState.viewport.zoom;
        appState.viewport.y = mouseY - worldPos.y * appState.viewport.zoom;

        if (appState.renderingContext) {
            appState.renderingContext.viewport = { ...appState.viewport };
            appState.renderingContext.needsRedraw = true;
        }
        updateSetting('canvas', 'camera', {
            x: appState.viewport.x,
            y: appState.viewport.y,
            zoom: appState.viewport.zoom
        });
    }, { passive: false });

    // Double-click to zoom extents
    canvas.addEventListener('dblclick', (e) => {
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        const worldPos = screenToWorld(mouseX, mouseY);

        // Check if clicked on a node
        let clickedNodeId: string | null = null;
        const nodesReversed = Object.values(appState.currentGraph.nodes).reverse();
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

        if (!clickedNodeId) {
            zoomExtents();
        }
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
        const nodesReversed = Object.values(appState.currentGraph.nodes).reverse();
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
            configureContextMenuForNode();
            if (loadSettings().canvas.autoBringToFront) {
                bringNodeToFront(clickedNodeId);
            }
            appState.selectedNodeId = clickedNodeId;
            if (appState.renderingContext) {
                appState.renderingContext.selectedNodeId = appState.selectedNodeId;
            }
            updateInspector();

            closeNodeAdder();
            
            if (ctxMenu) {
                const rect = canvas.getBoundingClientRect();
                const menuWidth = 180;
                const menuHeight = 160;
                const posX = Math.max(10, Math.min(mouseX, rect.width - menuWidth - 10));
                const posY = Math.max(10, Math.min(mouseY, rect.height - menuHeight - 10));
                ctxMenu.style.left = `${posX}px`;
                ctxMenu.style.top = `${posY}px`;
                ctxMenu.classList.remove('hidden');
            }
        } else if (appState.hoveredEdgeId) {
            // Right-clicked an edge: configure context menu and show it
            rightClickedEdgeId = appState.hoveredEdgeId;
            closeNodeAdder();
            configureContextMenuForEdge();
            
            if (ctxMenu) {
                const rect = canvas.getBoundingClientRect();
                const menuWidth = 180;
                const menuHeight = 50;
                const posX = Math.max(10, Math.min(mouseX, rect.width - menuWidth - 10));
                const posY = Math.max(10, Math.min(mouseY, rect.height - menuHeight - 10));
                ctxMenu.style.left = `${posX}px`;
                ctxMenu.style.top = `${posY}px`;
                ctxMenu.classList.remove('hidden');
            }
        } else {
            // Right-clicked empty canvas: hide context menu, show node adder
            if (ctxMenu) ctxMenu.classList.add('hidden');
            
            const snapEnabled = loadSettings().canvas.snapToGrid;
            let spawnX = worldPos.x;
            let spawnY = worldPos.y;
            if (snapEnabled) {
                spawnX = Math.round(spawnX / GRID_SIZE) * GRID_SIZE;
                spawnY = Math.round(spawnY / GRID_SIZE) * GRID_SIZE;
            }

            appState.spawnX = spawnX;
            appState.spawnY = spawnY;

            // Map snapped coordinates back to screen pixels
            const screenX = spawnX * appState.viewport.zoom + appState.viewport.x;
            const screenY = spawnY * appState.viewport.zoom + appState.viewport.y;

            showNodeAdder(screenX, screenY);
        }
    });

    // Context Menu action listeners
    document.getElementById('ctx-delete-node')?.addEventListener('click', () => {
        deleteSelectedNodes();
        document.getElementById('context-menu')?.classList.add('hidden');
    });

    document.getElementById('ctx-disconnect-node')?.addEventListener('click', () => {
        if (!appState.selectedNodeId) return;

        const idToDisconnect = appState.selectedNodeId;
        pushToHistory();

        const updatedEdges = appState.currentGraph.edges.filter(
            e => e.sourceNodeId !== idToDisconnect && e.targetNodeId !== idToDisconnect
        );

        appState.currentGraph = {
            ...appState.currentGraph,
            edges: updatedEdges
        };

        logToTerminal(`Disconnected all links for node [${idToDisconnect}]`, 'system-msg');
        document.getElementById('context-menu')?.classList.add('hidden');
        
        updateInspector();
        triggerAutoRun();
    });

    document.getElementById('ctx-bring-to-front')?.addEventListener('click', () => {
        if (appState.selectedNodeId) {
            bringNodeToFront(appState.selectedNodeId);
        }
        document.getElementById('context-menu')?.classList.add('hidden');
    });

    document.getElementById('ctx-send-to-back')?.addEventListener('click', () => {
        if (appState.selectedNodeId) {
            sendNodeToBack(appState.selectedNodeId);
        }
        document.getElementById('context-menu')?.classList.add('hidden');
    });

    document.getElementById('ctx-delete-connection')?.addEventListener('click', () => {
        if (!rightClickedEdgeId) return;

        pushToHistory();

        const edgeToDelete = appState.currentGraph.edges.find(e => e.id === rightClickedEdgeId);
        appState.currentGraph = {
            ...appState.currentGraph,
            edges: appState.currentGraph.edges.filter(e => e.id !== rightClickedEdgeId)
        };

        if (edgeToDelete) {
            logToTerminal(`Deleted connection [Node ${edgeToDelete.sourceNodeId}].${edgeToDelete.sourcePinId} ➡️ [Node ${edgeToDelete.targetNodeId}].${edgeToDelete.targetPinId}`, 'system-msg');
        }

        rightClickedEdgeId = null;
        document.getElementById('context-menu')?.classList.add('hidden');
        syncContextState();
        triggerAutoRun();
    });

    // Node search input listener
    const searchInput = document.getElementById('node-search-input');
    searchInput?.addEventListener('input', (e) => {
        const target = e.target as HTMLInputElement;
        filterNodeAdderList(target.value);
    });
}

// ========================================================================
// NODE ADDER PANEL & SEARCH FILTER
// ========================================================================

export function closeNodeAdder(shouldDelete: boolean = true) {
    const adder = document.getElementById('node-adder');
    if (adder && !adder.classList.contains('hidden')) {
        adder.classList.add('hidden');
        
        // Clean up unconfigured node if creation was cancelled
        if (shouldDelete && appState.selectedNodeId) {
            const selectedNode = appState.currentGraph.nodes[appState.selectedNodeId];
            if (selectedNode && selectedNode.type === 'node/unconfigured') {
                const nodesCopy = { ...appState.currentGraph.nodes };
                delete nodesCopy[appState.selectedNodeId];
                appState.currentGraph = {
                    ...appState.currentGraph,
                    nodes: nodesCopy
                };
                appState.selectedNodeId = null;
                syncContextState();
                updateInspector();
            }
        }
    }
}

export function showNodeAdder(screenX: number, screenY: number) {
    const adder = document.getElementById('node-adder');
    const searchInput = document.getElementById('node-search-input') as HTMLInputElement;
    
    if (!adder || !searchInput) return;

    // 1. Immediately instantiate unconfigured node in graph
    const uniqueId = `unconfigured_${Date.now().toString().slice(-4)}`;
    const newNode = createNodeState({
        id: uniqueId,
        type: 'node/unconfigured',
        params: {},
        ui: {
            x: appState.spawnX,
            y: appState.spawnY,
            title: 'NEW NODE'
        }
    });

    appState.currentGraph = {
        ...appState.currentGraph,
        nodes: {
            ...appState.currentGraph.nodes,
            [uniqueId]: newNode
        }
    };

    appState.selectedNodeId = uniqueId;
    appState.selectedNodeIds.clear();
    appState.selectedNodeIds.add(uniqueId);
    syncContextState();
    updateInspector();

    // 2. Position HTML search adder below the newly created node so it doesn't cover it
    const nodeH = getNodeHeight(newNode);
    const sx = newNode.ui!.x * appState.viewport.zoom + appState.viewport.x;
    const sy = (newNode.ui!.y + nodeH + 8) * appState.viewport.zoom + appState.viewport.y;

    adder.style.left = `${sx}px`;
    adder.style.top = `${sy}px`;
    adder.classList.remove('hidden');
    
    searchInput.value = '';
    filterNodeAdderList('');
    searchInput.focus();
}

export function filterNodeAdderList(query: string) {
    const listContainer = document.getElementById('node-type-list');
    if (!listContainer) return;

    listContainer.replaceChildren();

    const lowerQuery = query.toLowerCase();
    
    Object.entries(StandardNodes).forEach(([nodeType, nodeDef]) => {
        // Only allow node/unconfigured from the node/* namespace to be spawned directly.
        // Other types must be reached via morphing/configuring a neutral node.
        if (nodeType.startsWith('node/') && nodeType !== 'node/unconfigured') {
            return;
        }

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
        });

        listContainer.appendChild(btn);
    });
}

export function addNewNode(type: string) {
    // Capture snapshot before spawning node
    pushToHistory();

    const baseId = type.split('/')[1] || 'node';
    const uniqueId = `${baseId}_${Date.now().toString().slice(-4)}`;
    
    const nodeDef = StandardNodes[type];
    
    let mode: NodeMode | undefined = undefined;
    if (type.startsWith('node/')) {
        mode = type === 'node/blocks' ? 'blocks' : (type === 'node/python' ? 'python' : 'formula');
    }
    
    // Prepare initial parameter fields based on required pins
    const initialParams: Record<string, any> = {};
    if (mode === 'formula') {
        initialParams.formula = 'a + b';
    } else if (mode === 'blocks') {
        initialParams.blocks = [
            { id: `b_${Math.random().toString(36).substr(2, 4)}`, targetVar: 'out', operand1: 'a', operator: '+', operand2: 'b' }
        ];
    } else if (mode === 'python') {
        initialParams.code = 'def execute(inputs):\n    # inputs: dict\n    # return dict\n    return { "out": inputs.get("a", 0) + inputs.get("b", 0) }';
    } else if (nodeDef) {
        const requires = getNodeInputs({ type } as any);
        Object.keys(requires).forEach(pin => {
            initialParams[pin] = pin === 'ms' ? 1000 : (pin === 'code' ? 'def execute(inputs):\n    # inputs: dict, e.g. {"a": 10, "b": 20}\n    # return a dict with output pin values\n    a = inputs.get("a", 0)\n    b = inputs.get("b", 0)\n    return { "out": a + b }' : (requires[pin] === 'number' ? 0 : ''));
        });
        if (type === 'system/state') {
            initialParams['defaultValue'] = 0;
        }
    }

    const unconfiguredNode = appState.selectedNodeId ? appState.currentGraph.nodes[appState.selectedNodeId] : null;
    const isMorphing = unconfiguredNode && unconfiguredNode.type === 'node/unconfigured';

    let spawnX = 0;
    let spawnY = 0;

    const nodesCopy = { ...appState.currentGraph.nodes };

    if (isMorphing && unconfiguredNode) {
        spawnX = unconfiguredNode.ui!.x;
        spawnY = unconfiguredNode.ui!.y;
        delete nodesCopy[unconfiguredNode.id];
    } else {
        const snapEnabled = loadSettings().canvas.snapToGrid;
        spawnX = Math.round(appState.spawnX - NODE_WIDTH / 2);
        spawnY = Math.round(appState.spawnY - 20);
        if (snapEnabled) {
            spawnX = Math.round(spawnX / GRID_SIZE) * GRID_SIZE;
            spawnY = Math.round(spawnY / GRID_SIZE) * GRID_SIZE;
        }
    }

    const newNode = createNodeState({
        id: uniqueId,
        type,
        mode,
        params: initialParams,
        inputs: (isMorphing && unconfiguredNode) ? (unconfiguredNode.inputs as any) : undefined,
        outputs: (isMorphing && unconfiguredNode) ? (unconfiguredNode.outputs as any) : undefined,
        ui: {
            x: spawnX,
            y: spawnY,
            title: baseId.toUpperCase(),
            isMorphing: true
        }
    });

    appState.currentGraph = {
        ...appState.currentGraph,
        nodes: {
            ...nodesCopy,
            [uniqueId]: newNode
        }
    };

    logToTerminal(`Spawned node ${uniqueId} of type '${type}'`, 'system-msg');
    
    appState.selectedNodeId = uniqueId;
    appState.selectedNodeIds.clear();
    appState.selectedNodeIds.add(uniqueId);

    const adder = document.getElementById('node-adder');
    const adderContent = document.getElementById('node-adder-content');

    if (adder && adderContent && !adder.classList.contains('hidden')) {
        const nodeH = getNodeHeight(newNode);
        const nodeW = newNode.ui?.width ?? NODE_WIDTH;

        const screenW = nodeW * appState.viewport.zoom;
        const screenH = nodeH * appState.viewport.zoom;

        const sx = newNode.ui!.x * appState.viewport.zoom + appState.viewport.x;
        const sy = newNode.ui!.y * appState.viewport.zoom + appState.viewport.y;

        const category = nodeDef?.category || 'system';
        let accentColor = 'var(--accent-cyan)';
        let glowColor = 'var(--accent-cyan-glow)';
        if (category === 'math') {
            accentColor = 'var(--accent-red)';
            glowColor = 'var(--accent-red-glow)';
        } else if (category === 'logic') {
            accentColor = 'var(--accent-cyan)';
            glowColor = 'var(--accent-cyan-glow)';
        } else if (category === 'system') {
            accentColor = 'var(--accent-purple)';
            glowColor = 'var(--accent-purple-glow)';
        } else if (category === 'node') {
            accentColor = 'var(--accent-orange)';
            glowColor = 'var(--accent-orange-glow)';
        } else if (category === 'string' || category === 'array' || category === 'object') {
            accentColor = 'var(--accent-emerald)';
            glowColor = 'var(--accent-emerald-glow)';
        }

        adder.style.transition = 'width 0.22s cubic-bezier(0.19, 1, 0.22, 1), height 0.22s cubic-bezier(0.19, 1, 0.22, 1), left 0.22s cubic-bezier(0.19, 1, 0.22, 1), top 0.22s cubic-bezier(0.19, 1, 0.22, 1), opacity 0.22s ease';
        adder.style.left = `${sx}px`;
        adder.style.top = `${sy}px`;
        adder.style.width = `${screenW}px`;
        adder.style.height = `${screenH}px`;
        
        // Dynamically style background/border/shadow to match theme/category
        adder.style.borderColor = accentColor;
        adder.style.boxShadow = `0 0 20px ${glowColor}`;

        adder.classList.add('morphing');
        adderContent.style.opacity = '0';

        setTimeout(() => {
            adder.classList.add('hidden');
            adder.classList.remove('morphing');
            adder.style.transition = '';
            adder.style.width = '';
            adder.style.height = '';
            adder.style.borderColor = '';
            adder.style.boxShadow = '';
            adderContent.style.opacity = '1';

            const updatedNode = {
                ...newNode,
                ui: {
                    ...newNode.ui!,
                    isMorphing: false
                }
            };
            appState.currentGraph = {
                ...appState.currentGraph,
                nodes: {
                    ...appState.currentGraph.nodes,
                    [uniqueId]: updatedNode
                }
            };

            syncContextState();
            updateInspector();
            triggerAutoRun();
        }, 220);
    } else {
        const updatedNode = {
            ...newNode,
            ui: {
                ...newNode.ui!,
                isMorphing: false
            }
        };
        appState.currentGraph = {
            ...appState.currentGraph,
            nodes: {
                ...appState.currentGraph.nodes,
                [uniqueId]: updatedNode
            }
        };

        syncContextState();
        updateInspector();
        triggerAutoRun();
    }
}

function distToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
    const dx = bx - ax;
    const dy = by - ay;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return Math.hypot(px - ax, py - ay);
    
    let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

export function getDistanceToEdge(
    px: number,
    py: number,
    sourcePos: { x: number; y: number },
    targetPos: { x: number; y: number },
    edgeStyle: 'spline' | 'orthogonal'
): { distance: number; midpoint: { x: number; y: number } } {
    if (edgeStyle === 'orthogonal') {
        const midX = (sourcePos.x + targetPos.x) / 2;
        const d1 = distToSegment(px, py, sourcePos.x, sourcePos.y, midX, sourcePos.y);
        const d2 = distToSegment(px, py, midX, sourcePos.y, midX, targetPos.y);
        const d3 = distToSegment(px, py, midX, targetPos.y, targetPos.x, targetPos.y);
        
        const minDistance = Math.min(d1, d2, d3);
        const midpoint = { x: midX, y: (sourcePos.y + targetPos.y) / 2 };
        return { distance: minDistance, midpoint };
    } else {
        const dx = Math.abs(targetPos.x - sourcePos.x);
        const cpOffset = Math.max(40, dx * 0.4);
        const P0 = sourcePos;
        const P1 = { x: sourcePos.x + cpOffset, y: sourcePos.y };
        const P2 = { x: targetPos.x - cpOffset, y: targetPos.y };
        const P3 = targetPos;

        const numPoints = 20;
        let minDistance = Infinity;
        let prevPoint = P0;
        
        let midX = 0;
        let midY = 0;

        for (let i = 1; i < numPoints; i++) {
            const t = i / (numPoints - 1);
            const mt = 1 - t;
            
            const x = mt * mt * mt * P0.x + 3 * mt * mt * t * P1.x + 3 * mt * t * t * P2.x + t * t * t * P3.x;
            const y = mt * mt * mt * P0.y + 3 * mt * mt * t * P1.y + 3 * mt * t * t * P2.y + t * t * t * P3.y;
            const currentPoint = { x, y };

            const dist = distToSegment(px, py, prevPoint.x, prevPoint.y, currentPoint.x, currentPoint.y);
            if (dist < minDistance) {
                minDistance = dist;
            }
            
            if (i === Math.floor(numPoints / 2)) {
                midX = x;
                midY = y;
            }
            
            prevPoint = currentPoint;
        }

        return { distance: minDistance, midpoint: { x: midX, y: midY } };
    }
}

