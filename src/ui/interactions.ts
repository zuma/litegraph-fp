import { GraphState, NodeState, Edge } from '../core/ast.js';
import { appState, screenToWorld, syncContextState, updateCursor, getNodeHeight, getInputPinCoords, getOutputPinCoords, GRID_SIZE } from './state.js';
import { pushToHistory, undoStack, redoStack, updateUndoRedoButtons, undo, redo } from './history.js';
import { updateInspector } from './inspector.js';
import { runExecutionPipeline, triggerAutoRun, logToTerminal } from './execution.js';
import { NODE_WIDTH, ROW_HEIGHT, HEADER_HEIGHT } from './canvas.js';
import { StandardNodes } from '../registry/index.js';
import { isCompatible } from '../engine/validation.js';
import { updateSetting } from './settings.js';

// ============================================================================
// DELETE SELECTED NODES
// ============================================================================

export function deleteSelectedNodes() {
    const idsToDelete = new Set<string>(appState.selectedNodeIds);
    if (appState.selectedNodeId) {
        idsToDelete.add(appState.selectedNodeId);
    }
    
    if (idsToDelete.size === 0) return;
    
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
        if (e.key === 'Shift') {
            appState.isShiftPressed = true;
            updateCursor();
        }

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
                // Find and click sidebar button
                const btnSidebar = document.getElementById('btn-sidebar-toggle');
                btnSidebar?.click();
            }
        } else {
            if (e.key === 'Delete') {
                // Ignore if user is editing inside a form field or textbox
                const activeEl = document.activeElement;
                if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.getAttribute('contenteditable') === 'true')) {
                    return;
                }
                const idsToDeleteCount = appState.selectedNodeIds.size + (appState.selectedNodeId && !appState.selectedNodeIds.has(appState.selectedNodeId) ? 1 : 0);
                if (idsToDeleteCount > 0) {
                    e.preventDefault();
                    deleteSelectedNodes();
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
        
        for (const nodeId in appState.currentGraph.nodes) {
            const node = appState.currentGraph.nodes[nodeId];
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
            const outputs = Object.keys(nodeDef.provides);
            for (let i = 0; i < outputs.length; i++) {
                const pos = getOutputPinCoords(node, outputs[i]);
                const dist = Math.hypot(worldPos.x - pos.x, worldPos.y - pos.y);
                if (dist <= 12) {
                    pinClicked = true;
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
            if (pinClicked) break;
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
            // Toggle or set selection
            if (e.shiftKey) {
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
            document.getElementById('node-adder')?.classList.add('hidden');
            updateInspector();
            updateCursor();
            return;
        }

        // 3. Fallback: Clicked empty canvas space. Start panning or selection box.
        document.getElementById('node-adder')?.classList.add('hidden');

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
            // Panning: deselect all
            appState.selectedNodeId = null;
            appState.selectedNodeIds.clear();
            syncContextState();
            updateInspector();

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
            
            // Snap to grid if Shift is held down
            if (e.shiftKey) {
                newX = Math.round(newX / GRID_SIZE) * GRID_SIZE;
                newY = Math.round(newY / GRID_SIZE) * GRID_SIZE;
            }
            
            // Check if node has actually shifted position
            if (newX !== appState.dragNodeOriginalX || newY !== appState.dragNodeOriginalY) {
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

        // D. Calculate pin / node hover states
        let hNodeId: string | null = null;
        let hPin: typeof appState.hoveredPin = null;

        for (const nodeId in appState.currentGraph.nodes) {
            const node = appState.currentGraph.nodes[nodeId];
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

        appState.hoveredNodeId = hNodeId;
        appState.hoveredPin = hPin;
        
        if (appState.renderingContext) {
            appState.renderingContext.hoveredNodeId = appState.hoveredNodeId;
            appState.renderingContext.hoveredPin = appState.hoveredPin;
        }
        updateCursor();
        if (appState.renderingContext) {
            appState.renderingContext.needsRedraw = true;
        }
    });

    canvas.addEventListener('mouseup', (e) => {
        // A. Resolve Edge linkages on connection release
        if (appState.renderingContext?.draggingConnection) {
            const drag = appState.renderingContext.draggingConnection;
            
            // Check if released over a matching opposite pin
            if (appState.hoveredPin && appState.hoveredPin.nodeId !== drag.sourceNodeId && appState.hoveredPin.isInput !== drag.isInput) {
                const sourceNodeId = drag.isInput ? appState.hoveredPin.nodeId : drag.sourceNodeId;
                const sourcePinId = drag.isInput ? appState.hoveredPin.pinId : drag.sourcePinId;
                const targetNodeId = drag.isInput ? drag.sourceNodeId : appState.hoveredPin.nodeId;
                const targetPinId = drag.isInput ? drag.sourcePinId : appState.hoveredPin.pinId;

                const sourceNode = appState.currentGraph.nodes[sourceNodeId];
                const targetNode = appState.currentGraph.nodes[targetNodeId];
                
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
            appState.renderingContext.draggingConnection = null;
        }

        // B. Resolve Node Drag completion
        if (appState.draggedNodeId) {
            // Click-without-drag selection resolution
            if (!appState.dragHasMoved && !e.shiftKey) {
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
                } else {
                    appState.selectedNodeIds.clear();
                    selectedFromBox.forEach(id => appState.selectedNodeIds.add(id));
                }

                appState.selectedNodeId = appState.selectedNodeIds.size > 0 ? Array.from(appState.selectedNodeIds)[0] : null;
            } else {
                // Click on empty space: clear selection
                appState.selectedNodeIds.clear();
                appState.selectedNodeId = null;
            }

            appState.renderingContext.selectionBox = null;
            syncContextState();
            updateInspector();
        }

        appState.draggedNodeId = null;
        appState.isPanning = false;
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

    // Double-click to open Node Adder
    canvas.addEventListener('dblclick', (e) => {
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        const worldPos = screenToWorld(mouseX, mouseY);

        // Store spawn coordinates in world space
        appState.spawnX = worldPos.x;
        appState.spawnY = worldPos.y;

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
            appState.selectedNodeId = clickedNodeId;
            if (appState.renderingContext) {
                appState.renderingContext.selectedNodeId = appState.selectedNodeId;
            }
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
            
            appState.spawnX = worldPos.x;
            appState.spawnY = worldPos.y;
            showNodeAdder(mouseX, mouseY);
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

export function showNodeAdder(screenX: number, screenY: number) {
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

export function filterNodeAdderList(query: string) {
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

export function addNewNode(type: string) {
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
            x: Math.round(appState.spawnX - NODE_WIDTH / 2),
            y: Math.round(appState.spawnY - 20),
            title: uniqueId.toUpperCase()
        }
    };

    appState.currentGraph = {
        ...appState.currentGraph,
        nodes: {
            ...appState.currentGraph.nodes,
            [uniqueId]: newNode
        }
    };

    logToTerminal(`Spawned node ${uniqueId} of type '${type}'`, 'system-msg');
    
    appState.selectedNodeId = uniqueId;
    syncContextState();
    
    updateInspector();
    triggerAutoRun();
}
