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

export interface RenderingContext {
    canvas: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D;
    viewport: Viewport;
    selectedNodeId: string | null;
    hoveredNodeId: string | null;
    hoveredPin: { nodeId: string; pinId: string; isInput: boolean } | null;
    draggingConnection: DraggingConnection | null;
    nodeErrors?: Readonly<Record<string, string>>;
}
