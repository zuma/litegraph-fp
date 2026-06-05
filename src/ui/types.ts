export interface Viewport {
    x: number;
    y: number;
    zoom: number;
}

export interface DraggingConnection {
    sourceNodeId: string;
    sourcePinId: string;
    isInput: boolean;
    x: number;       // Start position (pin X in world coordinates)
    y: number;       // Start position (pin Y in world coordinates)
    cursorX: number; // Current cursor position (in world coordinates)
    cursorY: number; // Current cursor position (in world coordinates)
}

export interface SelectionBox {
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
    active: boolean;
}

export interface RenderingContext {
    canvas: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D;
    viewport: Viewport;
    backgroundColor?: string;
    selectedNodeId: string | null;
    selectedNodeIds: Set<string>;
    hoveredNodeId: string | null;
    hoveredPin: { nodeId: string; pinId: string; isInput: boolean } | null;
    draggingConnection: DraggingConnection | null;
    nodeErrors?: Readonly<Record<string, string>>;
    selectionBox: SelectionBox | null;
    lastExecutionTime?: number;
    needsRedraw?: boolean;
    pinnedDrawerNodeIds?: Set<string>;
    hoveredDrawerNodeId?: string | null;
    hoveredEllipsisNodeId?: string | null;
    hoveredPinNodeId?: string | null;
    hoveredEdgeId?: string | null;
    hoveredEdgePos?: { x: number; y: number } | null;
    edgeStyle?: 'spline' | 'orthogonal';
    activePlaceholderId?: string | null;
}

