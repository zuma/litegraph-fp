export interface Viewport {
    x: number;
    y: number;
    zoom: number;
}

export interface RenderingContext {
    canvas: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D;
    viewport: Viewport;
}
