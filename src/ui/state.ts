import { GraphState, NodeState, PinType } from '../core/ast.js';
import { createNodeState } from '../core/factory.js';
import { RenderingContext, Viewport } from './types.js';
import { NODE_WIDTH, ROW_HEIGHT, HEADER_HEIGHT, BOTTOM_PADDING } from './canvas.js';
import { StandardNodes, getNodeInputs, getNodeOutputs } from '../registry/index.js';
import { loadSettings } from './settings.js';
import { resolveGraphTypes } from '../engine/validation.js';

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
        'add_4012': createNodeState({
            id: 'add_4012',
            type: 'node/generic',
            mode: 'formula',
            inputs: { in0: 'any', in1: 'any' },
            outputs: { out0: 'any' },
            params: { formula: 'in0 + in1', in0: 10, in1: 20 },
            ui: { x: 100, y: 80, title: 'Input Adder' }
        }),
        'multiply_8930': createNodeState({
            id: 'multiply_8930',
            type: 'node/generic',
            mode: 'formula',
            inputs: { in0: 'any', in1: 'any' },
            outputs: { out0: 'any' },
            params: { formula: 'in0 * in1', in1: 5 },
            ui: { x: 380, y: 150, title: 'Scaling Node' }
        }),
        'log_1052': createNodeState({
            id: 'log_1052',
            type: 'system/log',
            inputs: { msg: 'any' },
            params: {},
            ui: { x: 650, y: 180, title: 'Output Logger' }
        }),
        'delay_7701': createNodeState({
            id: 'delay_7701',
            type: 'system/delay',
            inputs: { in0: 'any', ms: 'number' },
            outputs: { out: 'any' },
            params: { delayMs: 999999 }, // High delay to demonstrate watchdog cull!
            ui: { x: 100, y: 350, title: 'Rogue Delayer' }
        })
    },
    edges: [
        { id: 'edge1', sourceNodeId: 'add_4012', sourcePinId: 'out0', targetNodeId: 'multiply_8930', targetPinId: 'in0' },
        { id: 'edge2', sourceNodeId: 'multiply_8930', sourcePinId: 'out0', targetNodeId: 'log_1052', targetPinId: 'msg' }
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

export function syncContextState() {
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
        y: ny + HEADER_HEIGHT + 30 + Math.max(0, idx) * ROW_HEIGHT // Pins at ny + 60 + idx * 15
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
        y: ny + HEADER_HEIGHT + 30 + Math.max(0, idx) * ROW_HEIGHT // Pins at ny + 60 + idx * 15
    };
}
