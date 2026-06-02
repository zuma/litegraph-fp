import { GraphState, NodeState } from '../core/ast.js';
import { RenderingContext, Viewport } from './types.js';
import { NODE_WIDTH, ROW_HEIGHT, HEADER_HEIGHT } from './canvas.js';
import { StandardNodes } from '../registry/index.js';

// ============================================================================
// GRID CONSTANT
// ============================================================================
// GRID_SIZE is local — layout constants (NODE_WIDTH, ROW_HEIGHT, HEADER_HEIGHT) are imported from canvas.ts
export const GRID_SIZE = 30;        // Grid spacing for snapping (half the 60px visible grid)

// ============================================================================
// DEFAULT GRAPH STATE
// ============================================================================
const defaultGraph: GraphState = {
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
// APP STATE SINGLETON
// ============================================================================
export const appState = {
    currentGraph: defaultGraph as GraphState,
    viewport: { x: 0, y: 0, zoom: 1.0 } as Viewport,
    selectedNodeId: null as string | null,
    selectedNodeIds: new Set<string>(),

    hoveredNodeId: null as string | null,
    hoveredPin: null as { nodeId: string; pinId: string; isInput: boolean } | null,
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

export function syncContextState() {
    if (appState.renderingContext) {
        appState.renderingContext.selectedNodeId = appState.selectedNodeId;
        appState.renderingContext.selectedNodeIds = appState.selectedNodeIds;
        appState.renderingContext.nodeErrors = appState.nodeErrors;
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

    // 5. Hovering a pin
    if (appState.hoveredPin) {
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

export function getNodeHeight(node: NodeState): number {
    const nodeDef = StandardNodes[node.type];
    if (!nodeDef) return 75; // Default to 1-row node height (30 + 15 + 30)
    const numInputs = Object.keys(nodeDef.requires).length;
    const numOutputs = Object.keys(nodeDef.provides).length;
    return HEADER_HEIGHT + (Math.max(numInputs, numOutputs, 1) * ROW_HEIGHT) + 30; // 30px bottom padding
}

export function getInputPinCoords(node: NodeState, pinId: string): { x: number, y: number } {
    const nodeDef = StandardNodes[node.type];
    const inputs = nodeDef ? Object.keys(nodeDef.requires) : [];
    const idx = inputs.indexOf(pinId);
    const nx = node.ui?.x ?? 0;
    const ny = node.ui?.y ?? 0;
    return {
        x: nx,
        y: ny + HEADER_HEIGHT + 30 + Math.max(0, idx) * ROW_HEIGHT // Pins at ny + 60 + idx * 15
    };
}

export function getOutputPinCoords(node: NodeState, pinId: string): { x: number, y: number } {
    const nodeDef = StandardNodes[node.type];
    const outputs = nodeDef ? Object.keys(nodeDef.provides) : [];
    const idx = outputs.indexOf(pinId);
    const nx = node.ui?.x ?? 0;
    const ny = node.ui?.y ?? 0;
    const nw = node.ui?.width ?? NODE_WIDTH;
    return {
        x: nx + nw,
        y: ny + HEADER_HEIGHT + 30 + Math.max(0, idx) * ROW_HEIGHT // Pins at ny + 60 + idx * 15
    };
}
