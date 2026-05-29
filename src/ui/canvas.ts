import { RenderingContext } from './types.js';
import { NodeState, Edge, PinType } from '../core/ast.js';
import { NodeDefinition } from '../registry/types.js';

// ============================================================================
// CANVAS DRAWING CONSTANTS
// ============================================================================

export const NODE_WIDTH = 180;
export const ROW_HEIGHT = 22;
export const HEADER_HEIGHT = 32;
export const PIN_RADIUS = 5;

// Color maps based on PinType
export function getPinColor(type: PinType): string {
    if (type === 'number') return 'hsl(190, 100%, 50%)';   // Cyber Cyan
    if (type === 'boolean') return 'hsl(145, 100%, 50%)';  // Emerald Green
    if (type === 'string') return 'hsl(32, 100%, 55%)';    // Golden Orange
    if (type === 'any') return 'hsl(275, 100%, 65%)';      // Neon Purple
    
    // Fallback if type is TensorType or other string
    if (typeof type === 'object' && type !== null && type.type === 'tensor') {
        return 'hsl(355, 100%, 60%)'; // Coral Pink for tensors
    }
    return 'hsl(220, 10%, 60%)'; // Slate Gray fallback
}

// Calculate the dimensions of a node based on its registry definition
export function getNodeHeight(nodeDef?: NodeDefinition): number {
    if (!nodeDef) return 70;
    const numInputs = Object.keys(nodeDef.requires).length;
    const numOutputs = Object.keys(nodeDef.provides).length;
    const maxRows = Math.max(numInputs, numOutputs, 1);
    return HEADER_HEIGHT + (maxRows * ROW_HEIGHT) + 12; // Extra padding at bottom
}

// Get the coordinates for an input pin relative to the node
export function getInputPinPos(node: NodeState, pinIndex: number): { x: number, y: number } {
    const nx = node.ui?.x ?? 0;
    const ny = node.ui?.y ?? 0;
    return {
        x: nx,
        y: ny + HEADER_HEIGHT + 12 + pinIndex * ROW_HEIGHT
    };
}

// Get the coordinates for an output pin relative to the node
export function getOutputPinPos(node: NodeState, nodeDef: NodeDefinition | undefined, pinIndex: number): { x: number, y: number } {
    const nx = node.ui?.x ?? 0;
    const ny = node.ui?.y ?? 0;
    const nw = node.ui?.width ?? NODE_WIDTH;
    return {
        x: nx + nw,
        y: ny + HEADER_HEIGHT + 12 + pinIndex * ROW_HEIGHT
    };
}

// ============================================================================
// CORE DRAWING ROUTINES
// ============================================================================

export function drawGrid(renderingCtx: RenderingContext) {
    const { ctx, canvas, viewport } = renderingCtx;
    const { x, y, zoom } = viewport;

    ctx.save();
    
    // Clear screen with solid obsidian
    ctx.fillStyle = '#090a0f';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Apply grid spacing
    const gridSize = 40;
    const scaledGrid = gridSize * zoom;

    // Align start grid position with viewport pan offset
    const startX = (x * zoom) % scaledGrid;
    const startY = (y * zoom) % scaledGrid;

    ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
    
    for (let gx = startX - scaledGrid; gx < canvas.width + scaledGrid; gx += scaledGrid) {
        for (let gy = startY - scaledGrid; gy < canvas.height + scaledGrid; gy += scaledGrid) {
            ctx.beginPath();
            ctx.arc(gx, gy, 1.2 * Math.max(0.5, zoom), 0, Math.PI * 2);
            ctx.fill();
        }
    }
    
    ctx.restore();
}

export function drawNode(ctx: RenderingContext, node: NodeState, nodeDef?: NodeDefinition) {
    const context = ctx.ctx;
    const x = node.ui?.x ?? 0;
    const y = node.ui?.y ?? 0;
    const w = node.ui?.width ?? NODE_WIDTH;
    const h = getNodeHeight(nodeDef);

    const isSelected = ctx.selectedNodeId === node.id;
    const isHovered = ctx.hoveredNodeId === node.id;
    const hasError = ctx.nodeErrors && node.id in ctx.nodeErrors;

    context.save();

    // 1. Draw Glowing Backing Shadow for Selection or Error states
    if (hasError) {
        context.shadowColor = 'rgba(255, 0, 80, 0.4)';
        context.shadowBlur = 15;
    } else if (isSelected) {
        context.shadowColor = 'rgba(0, 240, 255, 0.3)';
        context.shadowBlur = 15;
    } else if (isHovered) {
        context.shadowColor = 'rgba(255, 255, 255, 0.05)';
        context.shadowBlur = 8;
    }

    // 2. Draw Card Body (Glassmorphism card)
    context.fillStyle = 'rgba(20, 24, 33, 0.85)';
    
    // Draw rounded rect path
    context.beginPath();
    context.roundRect(x, y, w, h, 10);
    context.fill();

    // Reset shadow for subsequent drawings
    context.shadowBlur = 0;

    // 3. Draw Card Border Outline
    context.lineWidth = isSelected || hasError ? 2 : 1;
    if (hasError) {
        context.strokeStyle = 'hsl(355, 100%, 60%)';
    } else if (isSelected) {
        context.strokeStyle = 'hsl(190, 100%, 50%)';
    } else {
        context.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    }
    context.stroke();

    // 4. Draw Header Bar
    context.beginPath();
    context.roundRect(x, y, w, HEADER_HEIGHT, [10, 10, 0, 0]);
    
    // Resolve header color gradient based on category
    let headerGrad = context.createLinearGradient(x, y, x + w, y);
    if (nodeDef?.category === 'math') {
        headerGrad.addColorStop(0, 'hsla(275, 80%, 40%, 0.4)');
        headerGrad.addColorStop(1, 'hsla(275, 80%, 20%, 0.1)');
    } else if (nodeDef?.category === 'logic') {
        headerGrad.addColorStop(0, 'hsla(145, 80%, 30%, 0.4)');
        headerGrad.addColorStop(1, 'hsla(145, 80%, 15%, 0.1)');
    } else if (nodeDef?.category === 'state') {
        headerGrad.addColorStop(0, 'hsla(32, 80%, 40%, 0.4)');
        headerGrad.addColorStop(1, 'hsla(32, 80%, 20%, 0.1)');
    } else { // system / debug / simulation / default
        headerGrad.addColorStop(0, 'hsla(190, 80%, 30%, 0.4)');
        headerGrad.addColorStop(1, 'hsla(190, 80%, 15%, 0.1)');
    }
    context.fillStyle = headerGrad;
    context.fill();
    
    // Draw header separator line
    context.beginPath();
    context.moveTo(x, y + HEADER_HEIGHT);
    context.lineTo(x + w, y + HEADER_HEIGHT);
    context.strokeStyle = 'rgba(255, 255, 255, 0.06)';
    context.lineWidth = 1;
    context.stroke();

    // 5. Draw Title text
    context.fillStyle = '#ffffff';
    context.font = 'bold 12px "Outfit", sans-serif';
    context.textAlign = 'left';
    context.textBaseline = 'middle';
    context.fillText(node.ui?.title ?? nodeDef?.name ?? node.type, x + 12, y + HEADER_HEIGHT / 2);

    // 6. Draw Pins and Labels
    if (nodeDef) {
        // Draw Inputs (Left side)
        const inputs = Object.entries(nodeDef.requires);
        inputs.forEach(([pinId, pinType], idx) => {
            const pos = getInputPinPos(node, idx);
            
            // Check if pin is hovered
            const isPinHovered = ctx.hoveredPin?.nodeId === node.id && ctx.hoveredPin?.pinId === pinId && ctx.hoveredPin?.isInput;
            
            // Draw pin dot
            context.beginPath();
            context.arc(pos.x, pos.y, isPinHovered ? PIN_RADIUS + 1.5 : PIN_RADIUS, 0, Math.PI * 2);
            context.fillStyle = getPinColor(pinType);
            context.fill();
            context.strokeStyle = '#090a0f';
            context.lineWidth = 1.5;
            context.stroke();

            // Label text
            context.fillStyle = isPinHovered ? '#ffffff' : 'var(--text-secondary)';
            context.font = '500 10px "Fira Code", monospace';
            context.textAlign = 'left';
            context.textBaseline = 'middle';
            context.fillText(pinId, pos.x + 12, pos.y);
        });

        // Draw Outputs (Right side)
        const outputs = Object.entries(nodeDef.provides);
        outputs.forEach(([pinId, pinType], idx) => {
            const pos = getOutputPinPos(node, nodeDef, idx);
            
            // Check if pin is hovered
            const isPinHovered = ctx.hoveredPin?.nodeId === node.id && ctx.hoveredPin?.pinId === pinId && !ctx.hoveredPin?.isInput;

            // Draw pin dot
            context.beginPath();
            context.arc(pos.x, pos.y, isPinHovered ? PIN_RADIUS + 1.5 : PIN_RADIUS, 0, Math.PI * 2);
            context.fillStyle = getPinColor(pinType);
            context.fill();
            context.strokeStyle = '#090a0f';
            context.lineWidth = 1.5;
            context.stroke();

            // Label text
            context.fillStyle = isPinHovered ? '#ffffff' : 'var(--text-secondary)';
            context.font = '500 10px "Fira Code", monospace';
            context.textAlign = 'right';
            context.textBaseline = 'middle';
            context.fillText(pinId, pos.x - 12, pos.y);
        });
    }

    // 7. Draw Mini Parameters / Value Preview at bottom
    const paramKeys = Object.keys(node.params);
    if (paramKeys.length > 0) {
        context.fillStyle = 'var(--text-muted)';
        context.font = '9px "Fira Code", monospace';
        context.textAlign = 'center';
        context.textBaseline = 'bottom';
        const preview = paramKeys.map(k => `${k}:${node.params[k]}`).join(' | ');
        context.fillText(preview.length > 25 ? preview.slice(0, 22) + '...' : preview, x + w / 2, y + h - 6);
    }

    context.restore();
}

export function drawEdge(
    ctx: RenderingContext,
    edge: Edge,
    sourcePos: { x: number, y: number },
    targetPos: { x: number, y: number },
    pinType: PinType
) {
    const context = ctx.ctx;
    context.save();

    // Create a smooth horizontal Bezier curve between outputs and inputs
    const dx = Math.abs(targetPos.x - sourcePos.x);
    const cpOffset = Math.max(40, dx * 0.4);

    const cp1x = sourcePos.x + cpOffset;
    const cp1y = sourcePos.y;
    const cp2x = targetPos.x - cpOffset;
    const cp2y = targetPos.y;

    const color = getPinColor(pinType);

    // 1. Draw main glowing conduit line background (semi-transparent)
    context.beginPath();
    context.moveTo(sourcePos.x, sourcePos.y);
    context.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, targetPos.x, targetPos.y);
    context.strokeStyle = color;
    context.globalAlpha = 0.25;
    context.lineWidth = 4;
    context.stroke();

    // 2. Draw sharp internal edge path
    context.globalAlpha = 0.85;
    context.lineWidth = 2;
    context.stroke();

    // 3. Flowing Pulse Animation
    // Create animated dash offsets shifting with the epoch timestamp to show active signal transmission
    const isSelected = ctx.selectedNodeId === edge.sourceNodeId || ctx.selectedNodeId === edge.targetNodeId;
    context.lineWidth = 2.5;
    context.strokeStyle = '#ffffff';
    context.globalAlpha = isSelected ? 0.9 : 0.6;
    context.setLineDash([8, 12]);
    context.lineDashOffset = -(Date.now() / 24) % 20; // Flow direction left-to-right
    context.stroke();

    context.restore();
}

export function drawDraggingConnection(ctx: RenderingContext) {
    if (!ctx.draggingConnection) return;
    const context = ctx.ctx;
    
    const drag = ctx.draggingConnection;
    // We need to resolve the pin coordinate to drag from
    // This is handled in main.ts and fed into draggingConnection as start coordinates.
    // So we just draw from drag.x/y to the cursor position!
    context.save();
    
    // Draw Bezier to mouse cursor
    const sourceX = drag.x;
    const sourceY = drag.y;
    // Current coordinate is updated in mousemove events and stored in draggingConnection.x/y or elsewhere
    // Wait! Since drag is updated with mouse movements, drag.x/y will be the start position,
    // and we can store the current cursor coordinate in a secondary field. Let's make sure we draw to cursor!
    context.restore();
}
