import { GraphState, NodeState, PinType } from '../core/ast.js';
import { createNodeState } from '../core/factory.js';
import { RenderingContext, Viewport } from './types.js';
import { NODE_WIDTH, ROW_HEIGHT, HEADER_HEIGHT, BOTTOM_PADDING } from './canvas.js';
import { StandardNodes, getNodeInputs, getNodeOutputs, CustomRegistry } from '../registry/index.js';
import { loadSettings } from './settings.js';
import { resolveGraphTypes } from '../engine/validation.js';
import { evaluateGraph } from '../engine/evaluate.js';

// ============================================================================
// GRID CONSTANT
// ============================================================================
// GRID_SIZE is local — layout constants (NODE_WIDTH, ROW_HEIGHT, HEADER_HEIGHT) are imported from canvas.ts
export const GRID_SIZE = 30;        // Grid spacing for snapping (half the 60px visible grid)

// ============================================================================
// DEFAULT GRAPH STATE
// ============================================================================
export const defaultGraph: GraphState = {
    nodes: {
        'node_4012': createNodeState({
            id: 'node_4012',
            type: 'node',
            inputs: { in0: 'any', in1: 'any' },
            outputs: { out0: 'any' },
            params: {},
            ui: { x: 100, y: 80, title: 'Input Adder' },
            nodes: {
                'pin_4012_in0': createNodeState({
                    id: 'pin_4012_in0',
                    type: 'composite/input',
                    inputs: { value: 'any' },
                    outputs: { out: 'any' },
                    params: { name: 'in0', value: 10 },
                    ui: { x: 50, y: 100, title: 'in0' }
                }),
                'pin_4012_in1': createNodeState({
                    id: 'pin_4012_in1',
                    type: 'composite/input',
                    inputs: { value: 'any' },
                    outputs: { out: 'any' },
                    params: { name: 'in1', value: 20 },
                    ui: { x: 50, y: 250, title: 'in1' }
                }),
                'action_4012_formula': createNodeState({
                    id: 'action_4012_formula',
                    type: 'formula',
                    inputs: { in0: 'any', in1: 'any' },
                    outputs: { out0: 'any' },
                    params: { formula: 'in0 + in1' },
                    ui: { x: 300, y: 150, title: 'Adder Core' }
                }),
                'pin_4012_out0': createNodeState({
                    id: 'pin_4012_out0',
                    type: 'composite/output',
                    inputs: { in: 'any' },
                    outputs: {},
                    params: { name: 'out0' },
                    ui: { x: 550, y: 180, title: 'out0' }
                })
            },
            edges: [
                { id: 'node_4012_e1', sourceNodeId: 'pin_4012_in0', sourcePinId: 'out', targetNodeId: 'action_4012_formula', targetPinId: 'in0' },
                { id: 'node_4012_e2', sourceNodeId: 'pin_4012_in1', sourcePinId: 'out', targetNodeId: 'action_4012_formula', targetPinId: 'in1' },
                { id: 'node_4012_e3', sourceNodeId: 'action_4012_formula', sourcePinId: 'out0', targetNodeId: 'pin_4012_out0', targetPinId: 'in' }
            ]
        }),
        'action_8930': createNodeState({
            id: 'action_8930',
            type: 'formula',
            inputs: { in0: 'any', in1: 'any' },
            outputs: { out0: 'any' },
            params: { formula: 'in0 * in1', in1: 5 },
            ui: { x: 380, y: 150, title: 'Scaling Node' }
        }),
        'action_1052': createNodeState({
            id: 'action_1052',
            type: 'system/log',
            inputs: { msg: 'any' },
            params: {},
            ui: { x: 650, y: 180, title: 'Output Logger' }
        }),
        'action_7701': createNodeState({
            id: 'action_7701',
            type: 'system/delay',
            inputs: { in0: 'any', ms: 'number' },
            outputs: { out: 'any' },
            params: { delayMs: 999999 },
            ui: { x: 100, y: 350, title: 'Rogue Delayer' }
        })
    },
    edges: [
        { id: 'edge1', sourceNodeId: 'node_4012', sourcePinId: 'out0', targetNodeId: 'action_8930', targetPinId: 'in0' },
        { id: 'edge2', sourceNodeId: 'action_8930', sourcePinId: 'out0', targetNodeId: 'action_1052', targetPinId: 'msg' }
    ]
};

const WORKSPACES_STATE_KEY = 'litegraph_fp_workspaces_list';
const ACTIVE_WORKSPACE_KEY = 'litegraph_fp_active_workspace_id';

/**
 * Represents a single independent visual workspace.
 * 
 * ============================================================================
 * MULTI-WORKSPACE DATA STRUCTURE (AI & HUMAN NOTES)
 * ============================================================================
 * Each workspace maintains its own independent:
 * 1. Graph State (`graph`): Nodes, edges, parameters, and dynamic custom pins.
 * 2. Viewport Camera (`camera`): Pan offsets (x, y) and zoom scaling coefficient.
 * This structure allows users to tab between different contexts seamlessly.
 * ============================================================================
 */
export interface Workspace {
    id: string;
    name: string;
    graph: GraphState;
    camera: Viewport;
}

export function findNodeStateById(workspaces: Workspace[], nodeId: string): NodeState | null {
    for (const ws of workspaces) {
        // Safe access as ws.graph could be a getter
        const graph = ws.graph;
        if (graph && graph.nodes) {
            const node = graph.nodes[nodeId];
            if (node) return node;
            const found = findNodeInNodes(graph.nodes, nodeId);
            if (found) return found;
        }
    }
    return null;
}

function findNodeInNodes(nodes: Record<string, NodeState>, nodeId: string): NodeState | null {
    for (const node of Object.values(nodes)) {
        if (node.nodes) {
            const found = node.nodes[nodeId];
            if (found) return found;
            const nested = findNodeInNodes(node.nodes, nodeId);
            if (nested) return nested;
        }
    }
    return null;
}

const initialSettings = loadSettings();

/**
 * Loads workspaces list from localStorage, with silent error fallback.
 * Migrates old legacy single-graph state if it exists.
 */
function loadWorkspaces(): { workspaces: Workspace[], activeId: string } {
    try {
        const rawList = localStorage.getItem(WORKSPACES_STATE_KEY);
        const rawActive = localStorage.getItem(ACTIVE_WORKSPACE_KEY);
        if (rawList && rawActive) {
            const list = JSON.parse(rawList);
            if (Array.isArray(list) && list.length > 0) {
                // Restore getter/setter bindings by reference for all nested block editor workspaces
                list.forEach(ws => {
                    if (ws.id.startsWith('block_editor_')) {
                        const nodeId = ws.id.replace('block_editor_', '');
                        const parentNode = findNodeStateById(list, nodeId);
                        if (parentNode) {
                            Object.defineProperty(ws, 'graph', {
                                get() {
                                    if (!parentNode.nodes) (parentNode as any).nodes = {};
                                    if (!parentNode.edges) (parentNode as any).edges = [];
                                    return {
                                        nodes: parentNode.nodes,
                                        edges: parentNode.edges
                                    };
                                },
                                set(g) {
                                    (parentNode as any).nodes = g.nodes;
                                    (parentNode as any).edges = g.edges;
                                },
                                configurable: true,
                                enumerable: true
                            });
                        }
                    }
                });
                return { workspaces: list, activeId: rawActive };
            }
        }
    } catch (e) {
        // fail silently
    }
    
    // Migration fallback: check if old currentGraph exists
    let oldGraph = defaultGraph;
    try {
        const raw = localStorage.getItem('litegraph_fp_current_graph_state');
        if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === 'object' && parsed.nodes && parsed.edges) {
                oldGraph = parsed;
            }
        }
    } catch (e) {}

    const defaultWs: Workspace = {
        id: 'ws_default',
        name: 'Workspace 1',
        graph: oldGraph,
        camera: { ...initialSettings.canvas.camera }
    };
    return { workspaces: [defaultWs], activeId: 'ws_default' };
}

// ============================================================================
// APP STATE SINGLETON
// ============================================================================
// Contains all UI state and virtualization properties for active workspace data routing.
const loadedState = loadWorkspaces();

export const appState = {
    workspaces: loadedState.workspaces as Workspace[],
    activeWorkspaceId: loadedState.activeId as string,

    // Virtualized current graph targeting the active tab workspace
    get currentGraph(): GraphState {
        const active = this.workspaces.find(w => w.id === this.activeWorkspaceId);
        return active ? active.graph : defaultGraph;
    },
    set currentGraph(g: GraphState) {
        const active = this.workspaces.find(w => w.id === this.activeWorkspaceId);
        if (active) {
            active.graph = g;
        }
    },

    get viewport(): Viewport {
        const active = this.workspaces.find(w => w.id === this.activeWorkspaceId);
        return active ? active.camera : { x: 0, y: 0, zoom: 1.0 };
    },
    set viewport(v: Viewport) {
        const active = this.workspaces.find(w => w.id === this.activeWorkspaceId);
        if (active) {
            active.camera = v;
        }
    },

    selectedNodeId: null as string | null,
    selectedNodeIds: new Set<string>(),
    selectedEdgeId: null as string | null,
    selectedEdgeIds: new Set<string>(),

    hoveredNodeId: null as string | null,
    hoveredPin: null as { nodeId: string; pinId: string; isInput: boolean } | null,
    hoveredEdgeId: null as string | null,
    hoveredEdgePos: null as { x: number; y: number } | null,
    nodeErrors: {} as Record<string, string>,
    latestExecutionState: {} as Record<string, any>,

    isPanning: false,
    panStartX: 0,
    panStartY: 0,
    viewportStartX: 0,
    viewportStartY: 0,

    draggedNodeId: null as string | null,
    dragOffsetX: 0,
    dragOffsetY: 0,

    spawnX: 0,
    spawnY: 0,
    isShiftPressed: false,

    // Rendering references (set during init)
    renderingContext: null as RenderingContext | null,
    canvas: null as HTMLCanvasElement | null,
    ctx: null as CanvasRenderingContext2D | null,

    // Undo/redo transient tracking (shared across interactions + inspector + history)
    preDragGraphState: null as GraphState | null,
    dragHasMoved: false,
    dragNodeOriginalX: 0,
    dragNodeOriginalY: 0,
    dragNodesOriginalPositions: new Map<string, { x: number, y: number }>(),
    preEditGraphState: null as GraphState | null,
    pinnedDrawerNodeIds: new Set<string>(),
    hoveredDrawerNodeId: null as string | null,
    hoveredEllipsisNodeId: null as string | null,
    hoveredPinNodeId: null as string | null,
    mouseDownClientX: 0,
    mouseDownClientY: 0,
    mouseDownTime: 0,
    activePlaceholderId: null as string | null,
    resolvedInputs: {} as Record<string, Record<string, PinType>>,
    resolvedOutputs: {} as Record<string, Record<string, PinType>>,
};

// ============================================================================
// COORDINATE UTILITIES
// ============================================================================

// Helper to translate screen pixels to world coordinates
export function screenToWorld(sx: number, sy: number) {
    return {
        x: (sx - appState.viewport.x) / appState.viewport.zoom,
        y: (sy - appState.viewport.y) / appState.viewport.zoom
    };
}

// ============================================================================
// RENDERING CONTEXT SYNC
// ============================================================================

let lastSavedTime = Date.now();

export function updateSavedTimeLabel() {
    const badge = document.getElementById('autosave-badge');
    if (!badge) return;
    const text = badge.querySelector('.badge-text');
    if (!text) return;
    
    if (!navigator.onLine) {
        badge.classList.add('offline');
        text.textContent = 'Offline (Saved)';
        return;
    }
    
    badge.classList.remove('offline');
    const diffMs = Date.now() - lastSavedTime;
    const diffSec = Math.floor(diffMs / 1000);
    
    if (diffSec < 5) {
        text.textContent = 'Saved';
    } else if (diffSec < 60) {
        text.textContent = `Saved ${diffSec}s ago`;
    } else {
        const diffMin = Math.floor(diffSec / 60);
        text.textContent = `Saved ${diffMin}m ago`;
    }
}

export function updateOnlineStatus() {
    updateSavedTimeLabel();
}

export function reconcileBoundaryPinsAndNodes(workspaces: Workspace[]) {
    workspaces.forEach(ws => {
        if (ws.id.startsWith('block_editor_')) {
            const nodeId = ws.id.replace('block_editor_', '');
            const parentNode = findNodeStateById(workspaces, nodeId);
            if (!parentNode) return;

            // 1. Collect all boundary nodes from the sub-graph
            const subNodes = Object.values(ws.graph.nodes);
            
            // If the sub-graph nodes dictionary is completely empty, we pre-populate boundary nodes first
            if (subNodes.length === 0) {
                const subNodesMap = { ...ws.graph.nodes };
                let initialized = false;
                if (parentNode.inputs) {
                    Object.keys(parentNode.inputs).forEach((name, idx) => {
                        const newSubId = `input_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
                        subNodesMap[newSubId] = {
                            id: newSubId,
                            type: 'composite/input',
                            params: {},
                            ui: { x: 50, y: 100 + idx * 120, title: name }
                        };
                        initialized = true;
                    });
                }
                if (parentNode.outputs) {
                    Object.keys(parentNode.outputs).forEach((name, idx) => {
                        const newSubId = `output_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
                        subNodesMap[newSubId] = {
                            id: newSubId,
                            type: 'composite/output',
                            params: {},
                            ui: { x: 800, y: 100 + idx * 120, title: name }
                        };
                        initialized = true;
                    });
                }
                if (initialized) {
                    ws.graph = {
                        nodes: subNodesMap,
                        edges: ws.graph.edges
                    };
                    return;
                }
            }

            const inputNodes = subNodes.filter(n => n.type === 'composite/input');
            const outputNodes = subNodes.filter(n => n.type === 'composite/output');

            const subInputPinNames = new Set(inputNodes.map(n => n.ui?.title || n.id));
            const subOutputPinNames = new Set(outputNodes.map(n => n.ui?.title || n.id));

            // Get current parent pins
            const parentInputs = parentNode.inputs ? { ...parentNode.inputs } : {};
            const parentOutputs = parentNode.outputs ? { ...parentNode.outputs } : {};

            const isActiveEditor = appState.activeWorkspaceId === ws.id;

            if (isActiveEditor) {
                // If the user is actively editing this nested sub-graph,
                // the sub-graph is the source of truth!
                // We sync: Sub-graph boundary nodes -> Parent pins
                let parentChanged = false;

                // Add any pins that exist in sub-graph but not in parent
                subInputPinNames.forEach(name => {
                    if (!(name in parentInputs)) {
                        parentInputs[name] = 'any';
                        parentChanged = true;
                    }
                });
                subOutputPinNames.forEach(name => {
                    if (!(name in parentOutputs)) {
                        parentOutputs[name] = 'any';
                        parentChanged = true;
                    }
                });

                // Remove any pins that exist in parent but not in sub-graph (meaning boundary node was deleted!)
                Object.keys(parentInputs).forEach(name => {
                    if (!subInputPinNames.has(name)) {
                        delete parentInputs[name];
                        parentChanged = true;
                        deleteExternalEdges(workspaces, nodeId, name, true);
                    }
                });
                Object.keys(parentOutputs).forEach(name => {
                    if (!subOutputPinNames.has(name)) {
                        delete parentOutputs[name];
                        parentChanged = true;
                        deleteExternalEdges(workspaces, nodeId, name, false);
                    }
                });

                if (parentChanged) {
                    (parentNode as any).inputs = parentInputs;
                    (parentNode as any).outputs = parentOutputs;
                }
            } else {
                // If the user is NOT actively editing this nested sub-graph,
                // the parent pins are the source of truth!
                // We sync: Parent pins -> Sub-graph boundary nodes
                const subNodesMap = { ...ws.graph.nodes };
                const subEdgesList = [ ...ws.graph.edges ];
                let subChanged = false;

                // Sync inputs
                Object.keys(parentInputs).forEach((name, idx) => {
                    const hasNode = inputNodes.some(n => (n.ui?.title || n.id) === name);
                    if (!hasNode) {
                        const newSubId = `input_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
                        subNodesMap[newSubId] = {
                            id: newSubId,
                            type: 'composite/input',
                            params: {},
                            ui: { x: 50, y: 100 + idx * 120, title: name }
                        };
                        subChanged = true;
                    }
                });

                // Sync outputs
                Object.keys(parentOutputs).forEach((name, idx) => {
                    const hasNode = outputNodes.some(n => (n.ui?.title || n.id) === name);
                    if (!hasNode) {
                        const newSubId = `output_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
                        subNodesMap[newSubId] = {
                            id: newSubId,
                            type: 'composite/output',
                            params: {},
                            ui: { x: 800, y: 100 + idx * 120, title: name }
                        };
                        subChanged = true;
                    }
                });

                // Remove boundary nodes for any pins that do not exist in parent anymore (deleted externally)
                inputNodes.forEach(n => {
                    const name = n.ui?.title || n.id;
                    if (!(name in parentInputs)) {
                        delete subNodesMap[n.id];
                        subChanged = true;
                    }
                });
                outputNodes.forEach(n => {
                    const name = n.ui?.title || n.id;
                    if (!(name in parentOutputs)) {
                        delete subNodesMap[n.id];
                        subChanged = true;
                    }
                });

                if (subChanged) {
                    ws.graph = {
                        nodes: subNodesMap,
                        edges: subEdgesList
                    };
                }
            }
        }
    });
}

function deleteExternalEdges(workspaces: Workspace[], nodeId: string, pinId: string, isInput: boolean) {
    workspaces.forEach(ws => {
        if (ws.id.startsWith('block_editor_')) return;
        
        const edges = ws.graph.edges;
        const filtered = edges.filter(e => {
            if (isInput) {
                return !(e.targetNodeId === nodeId && e.targetPinId === pinId);
            } else {
                return !(e.sourceNodeId === nodeId && e.sourcePinId === pinId);
            }
        });
        if (filtered.length !== edges.length) {
            (ws.graph as any).edges = filtered;
        }
    });
}

export function syncWorkspaceNodeRegistrations() {
    appState.workspaces.forEach(ws => {
        const typeName = `workspace/${ws.id}`;
        
        // Find inputs (composite/input nodes)
        const inputsSchema: Record<string, PinType> = {};
        const inputNodeIds: Record<string, string> = {};
        Object.values(ws.graph.nodes).forEach(n => {
            if (n.type === 'composite/input') {
                const pinName = String(n.params.name || n.ui?.title || n.id);
                inputsSchema[pinName] = 'any';
                inputNodeIds[pinName] = n.id;
            }
        });

        // Find outputs (composite/output nodes)
        const outputsSchema: Record<string, PinType> = {};
        const outputNodeIds: Record<string, string> = {};
        Object.values(ws.graph.nodes).forEach(n => {
            if (n.type === 'composite/output') {
                const pinName = String(n.params.name || n.ui?.title || n.id);
                outputsSchema[pinName] = 'any';
                outputNodeIds[pinName] = n.id;
            }
        });

        CustomRegistry[typeName] = {
            namespace: 'workspace',
            category: 'workspace',
            name: ws.name,
            requires: inputsSchema,
            provides: outputsSchema,
            execute: async (inputs: Record<string, any>) => {
                const initialInputs: Record<string, any> = {};
                Object.entries(inputs).forEach(([pinName, val]) => {
                    const nodeId = inputNodeIds[pinName];
                    if (nodeId) {
                        initialInputs[`${nodeId}.value`] = val;
                    }
                });

                const res = await evaluateGraph(ws.graph, initialInputs, { ...StandardNodes, ...CustomRegistry }, { executionMode: 'serial' });
                
                const outputsResult: Record<string, any> = {};
                Object.entries(outputNodeIds).forEach(([pinName, nodeId]) => {
                    outputsResult[pinName] = res.state[`${nodeId}.value`] ?? res.state[`${nodeId}.in`] ?? null;
                });

                return outputsResult;
            }
        };
    });
}

export function syncContextState() {
    syncWorkspaceNodeRegistrations();
    reconcileBoundaryPinsAndNodes(appState.workspaces);

    const { inputs, outputs } = resolveGraphTypes(appState.currentGraph);
    appState.resolvedInputs = inputs;
    appState.resolvedOutputs = outputs;

    try {
        localStorage.setItem(WORKSPACES_STATE_KEY, JSON.stringify(appState.workspaces));
        localStorage.setItem(ACTIVE_WORKSPACE_KEY, appState.activeWorkspaceId);
        lastSavedTime = Date.now();
        updateSavedTimeLabel();
    } catch (e) {
        // fail silently
    }

    if (appState.renderingContext) {
        appState.renderingContext.selectedNodeId = appState.selectedNodeId;
        appState.renderingContext.selectedNodeIds = appState.selectedNodeIds;
        appState.renderingContext.selectedEdgeId = appState.selectedEdgeId;
        appState.renderingContext.selectedEdgeIds = appState.selectedEdgeIds;
        appState.renderingContext.nodeErrors = appState.nodeErrors;
        appState.renderingContext.pinnedDrawerNodeIds = appState.pinnedDrawerNodeIds;
        appState.renderingContext.hoveredDrawerNodeId = appState.hoveredDrawerNodeId;
        appState.renderingContext.hoveredEllipsisNodeId = appState.hoveredEllipsisNodeId;
        appState.renderingContext.hoveredPinNodeId = appState.hoveredPinNodeId;
        appState.renderingContext.hoveredEdgeId = appState.hoveredEdgeId;
        appState.renderingContext.hoveredEdgePos = appState.hoveredEdgePos;
        appState.renderingContext.edgeStyle = loadSettings().canvas.edgeStyle || 'spline';
        appState.renderingContext.activePlaceholderId = appState.activePlaceholderId;
        appState.renderingContext.resolvedInputs = inputs;
        appState.renderingContext.resolvedOutputs = outputs;
        appState.renderingContext.needsRedraw = true;
    }
}

// ============================================================================
// CURSOR STATE MANAGEMENT
// ============================================================================

export function updateCursor() {
    if (appState.renderingContext) {
        appState.renderingContext.needsRedraw = true;
    }
    if (!appState.canvas) return;

    // 1. Connection drag
    if (appState.renderingContext && appState.renderingContext.draggingConnection) {
        appState.canvas.style.cursor = 'cell';
        return;
    }

    // 2. Node drag
    if (appState.draggedNodeId) {
        appState.canvas.style.cursor = 'grabbing';
        return;
    }

    // 3. Canvas panning
    if (appState.isPanning) {
        appState.canvas.style.cursor = 'grabbing';
        return;
    }

    // 4. Selection box active or Shift is held down (ready for selection box)
    const isSelecting = (appState.renderingContext && appState.renderingContext.selectionBox && appState.renderingContext.selectionBox.active) || appState.isShiftPressed;
    if (isSelecting) {
        // CAD-style custom crosshair with a small selection indicator
        appState.canvas.style.cursor = "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'><line x1='16' y1='4' x2='16' y2='28' stroke='%23888888' stroke-width='1'/><line x1='4' y1='16' x2='28' y2='16' stroke='%23888888' stroke-width='1'/><rect x='13' y='13' width='6' height='6' fill='none' stroke='%23888888' stroke-width='1'/><rect x='20' y='20' width='8' height='6' fill='rgba(0,120,255,0.25)' stroke='%230078ff' stroke-width='1' stroke-dasharray='2,2'/></svg>\") 16 16, crosshair";
        return;
    }

    // 5. Hovering a pin or ellipsis or thumbtack button or edge
    if (appState.hoveredPin || appState.hoveredEllipsisNodeId || appState.hoveredPinNodeId || appState.hoveredEdgeId) {
        appState.canvas.style.cursor = 'pointer';
        return;
    }

    // 6. Hovering a node (ready to drag/select)
    if (appState.hoveredNodeId) {
        appState.canvas.style.cursor = 'grab';
        return;
    }

    // 7. Hovering background (ready to pan)
    appState.canvas.style.cursor = 'grab';
}

// ============================================================================
// CANVAS PIN POSITION LOOKUPS
// ============================================================================

/**
 * Calculates node height using appState's resolved inputs/outputs.
 * This is a convenience wrapper around the canonical formula in canvas.ts,
 * using the global appState for resolved pin lookups.
 */
export function getNodeHeight(node: NodeState): number {
    const numInputs = Object.keys(getNodeInputs(node, appState.resolvedInputs)).length;
    const numOutputs = Object.keys(getNodeOutputs(node, appState.resolvedOutputs)).length;
    return HEADER_HEIGHT + (Math.max(numInputs, numOutputs, 1) * ROW_HEIGHT) + BOTTOM_PADDING;
}

export function getInputPinCoords(node: NodeState, pinId: string): { x: number, y: number } {
    const inputs = Object.keys(getNodeInputs(node, appState.resolvedInputs));
    const idx = inputs.indexOf(pinId);
    const nx = node.ui?.x ?? 0;
    const ny = node.ui?.y ?? 0;
    return {
        x: nx,
        y: ny + HEADER_HEIGHT + 30 + Math.max(0, idx) * ROW_HEIGHT
    };
}

export function getOutputPinCoords(node: NodeState, pinId: string): { x: number, y: number } {
    const outputs = Object.keys(getNodeOutputs(node, appState.resolvedOutputs));
    const idx = outputs.indexOf(pinId);
    const nx = node.ui?.x ?? 0;
    const ny = node.ui?.y ?? 0;
    const nw = node.ui?.width ?? NODE_WIDTH;
    return {
        x: nx + nw,
        y: ny + HEADER_HEIGHT + 30 + Math.max(0, idx) * ROW_HEIGHT
    };
}
