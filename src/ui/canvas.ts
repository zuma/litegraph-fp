import { RenderingContext } from './types.js';
import { NodeState, Edge, PinType } from '../core/ast.js';
import { NodeDefinition } from '../registry/types.js';

// ============================================================================
// CANVAS DRAWING CONSTANTS
// ============================================================================

export const NODE_WIDTH = 180;
export const ROW_HEIGHT = 15;      // Spaced by 15px (divisor of 30 and 60) for compact connection points
export const HEADER_HEIGHT = 30;    // Changed to align input/output pins on 60px grid
export const PIN_RADIUS = 6;

// Color maps based on PinType (reads dynamically from active theme CSS variables)
export function getPinColor(type: PinType, computedStyle?: CSSStyleDeclaration): string {
    const style = computedStyle || (typeof document !== 'undefined' ? getComputedStyle(document.body) : null);
    
    const getVar = (varName: string, fallback: string) => {
        return style ? style.getPropertyValue(varName).trim() : fallback;
    };
    
    if (type === 'number') return getVar('--accent-cyan', 'hsl(190, 100%, 50%)');
    if (type === 'boolean') return getVar('--accent-emerald', 'hsl(145, 100%, 50%)');
    if (type === 'string') return getVar('--accent-orange', 'hsl(32, 100%, 55%)');
    if (type === 'any') return getVar('--accent-purple', 'hsl(275, 100%, 65%)');
    
    // Fallback if type is TensorType or other string
    if (typeof type === 'object' && type !== null && type.type === 'tensor') {
        return getVar('--accent-red', 'hsl(355, 100%, 60%)');
    }
    return getVar('--text-muted', 'hsl(220, 10%, 60%)');
}

// Calculate the dimensions of a node based on its registry definition
export function getNodeHeight(nodeDef?: NodeDefinition): number {
    if (!nodeDef) return 75; // Default to 1-row node height (30 + 15 + 30)
    const numInputs = Object.keys(nodeDef.requires).length;
    const numOutputs = Object.keys(nodeDef.provides).length;
    const maxRows = Math.max(numInputs, numOutputs, 1);
    return HEADER_HEIGHT + (maxRows * ROW_HEIGHT) + 30; // 30px bottom padding to snap total height to multiple of 15
}

// Get the coordinates for an input pin relative to the node
export function getInputPinPos(node: NodeState, pinIndex: number): { x: number, y: number } {
    const nx = node.ui?.x ?? 0;
    const ny = node.ui?.y ?? 0;
    return {
        x: nx,
        y: ny + HEADER_HEIGHT + 30 + pinIndex * ROW_HEIGHT // Pins placed at ny + 60 + pinIndex * 15
    };
}

// Get the coordinates for an output pin relative to the node
export function getOutputPinPos(node: NodeState, nodeDef: NodeDefinition | undefined, pinIndex: number): { x: number, y: number } {
    const nx = node.ui?.x ?? 0;
    const ny = node.ui?.y ?? 0;
    const nw = node.ui?.width ?? NODE_WIDTH;
    return {
        x: nx + nw,
        y: ny + HEADER_HEIGHT + 30 + pinIndex * ROW_HEIGHT // Pins placed at ny + 60 + pinIndex * 15
    };
}

// ============================================================================
// CORE DRAWING ROUTINES
// ============================================================================

export function drawGrid(renderingCtx: RenderingContext, computedStyle: CSSStyleDeclaration) {
    const { ctx, canvas, viewport } = renderingCtx;
    const { x, y, zoom } = viewport;

    ctx.save();
    
    // Clear screen with theme background color
    const canvasBg = computedStyle.getPropertyValue('--bg-obsidian').trim() || '#090a0f';
    ctx.fillStyle = canvasBg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Apply grid spacing (60px - chosen as a highly composite multiple of 3)
    const gridSize = 60;
    const scaledGrid = gridSize * zoom;

    // Align start grid position with viewport pan offset
    const startX = ((x % scaledGrid) + scaledGrid) % scaledGrid;
    const startY = ((y % scaledGrid) + scaledGrid) % scaledGrid;

    // Adjust grid dot opacity and color based on theme
    const isLight = document.body.classList.contains('light-theme');
    ctx.fillStyle = isLight ? 'rgba(0, 0, 0, 0.07)' : 'rgba(255, 255, 255, 0.04)';
    
    for (let gx = startX - scaledGrid; gx < canvas.width + scaledGrid; gx += scaledGrid) {
        for (let gy = startY - scaledGrid; gy < canvas.height + scaledGrid; gy += scaledGrid) {
            ctx.beginPath();
            ctx.arc(gx, gy, 1.2 * Math.max(0.5, zoom), 0, Math.PI * 2);
            ctx.fill();
        }
    }
    
    ctx.restore();
}

export function drawNode(ctx: RenderingContext, node: NodeState, nodeDef: NodeDefinition | undefined, computedStyle: CSSStyleDeclaration) {
    const context = ctx.ctx;
    const x = node.ui?.x ?? 0;
    const y = node.ui?.y ?? 0;
    const w = node.ui?.width ?? NODE_WIDTH;
    const h = getNodeHeight(nodeDef);

    const isSelected = ctx.selectedNodeId === node.id || (ctx.selectedNodeIds && ctx.selectedNodeIds.has(node.id));
    const isHovered = ctx.hoveredNodeId === node.id;
    const hasError = ctx.nodeErrors && node.id in ctx.nodeErrors;
    const isLight = document.body.classList.contains('light-theme');
    
    const bgObsidian = computedStyle.getPropertyValue('--bg-obsidian').trim() || '#090a0f';
    const accentCyan = computedStyle.getPropertyValue('--accent-cyan').trim() || 'hsl(190, 100%, 50%)';
    const accentRed = computedStyle.getPropertyValue('--accent-red').trim() || 'hsl(355, 100%, 60%)';
    const textPrimary = computedStyle.getPropertyValue('--text-primary').trim() || '#ffffff';
    const textSecondary = computedStyle.getPropertyValue('--text-secondary').trim() || '#b5bac1';

    context.save();

    // 1. Draw Glowing Backing Shadow for Selection or Error states
    if (hasError) {
        context.shadowColor = isLight ? 'rgba(255, 0, 80, 0.25)' : 'rgba(255, 0, 80, 0.4)';
        context.shadowBlur = 15;
    } else if (isSelected) {
        context.shadowColor = isLight ? 'rgba(0, 100, 255, 0.2)' : 'rgba(0, 240, 255, 0.3)';
        context.shadowBlur = 15;
    } else if (isHovered) {
        context.shadowColor = isLight ? 'rgba(0, 0, 0, 0.05)' : 'rgba(255, 255, 255, 0.05)';
        context.shadowBlur = 8;
    }

    // 2. Draw Card Body (Glassmorphism card)
    context.fillStyle = computedStyle.getPropertyValue('--bg-card').trim() || 'rgba(20, 24, 33, 0.85)';
    
    // Draw rounded rect path
    context.beginPath();
    context.roundRect(x, y, w, h, 10);
    context.fill();

    // Reset shadow for subsequent drawings
    context.shadowBlur = 0;

    // 3. Draw Card Border Outline
    context.lineWidth = isSelected || hasError ? 2 : 1;
    if (hasError) {
        context.strokeStyle = accentRed;
    } else if (isSelected) {
        context.strokeStyle = accentCyan;
    } else {
        context.strokeStyle = computedStyle.getPropertyValue('--border-panel').trim() || 'rgba(255, 255, 255, 0.08)';
    }
    context.stroke();

    // 4. Draw Header Bar
    context.beginPath();
    context.roundRect(x, y, w, HEADER_HEIGHT, [10, 10, 0, 0]);
    
    // Resolve header color gradient based on category and theme
    let headerGrad = context.createLinearGradient(x, y, x + w, y);
    
    let startVar = '--node-default-header-start';
    let endVar = '--node-default-header-end';
    if (nodeDef?.category === 'math') {
        startVar = '--node-math-header-start';
        endVar = '--node-math-header-end';
    } else if (nodeDef?.category === 'logic') {
        startVar = '--node-logic-header-start';
        endVar = '--node-logic-header-end';
    } else if (nodeDef?.category === 'state') {
        startVar = '--node-state-header-start';
        endVar = '--node-state-header-end';
    }
    
    const headerStart = computedStyle.getPropertyValue(startVar).trim() || 'hsla(190, 80%, 30%, 0.4)';
    const headerEnd = computedStyle.getPropertyValue(endVar).trim() || 'hsla(190, 80%, 15%, 0.1)';
    
    headerGrad.addColorStop(0, headerStart);
    headerGrad.addColorStop(1, headerEnd);
    
    context.fillStyle = headerGrad;
    context.fill();
    
    // Draw header separator line
    context.beginPath();
    context.moveTo(x, y + HEADER_HEIGHT);
    context.lineTo(x + w, y + HEADER_HEIGHT);
    context.strokeStyle = computedStyle.getPropertyValue('--border-panel').trim() || 'rgba(255, 255, 255, 0.06)';
    context.lineWidth = 1;
    context.stroke();

    // 5. Draw Title text
    context.fillStyle = textPrimary;
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
            context.fillStyle = getPinColor(pinType, computedStyle);
            context.fill();
            context.strokeStyle = bgObsidian;
            context.lineWidth = 1.5;
            context.stroke();

            // Label text
            context.fillStyle = isPinHovered ? (isLight ? '#000000' : '#ffffff') : textSecondary;
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
            context.fillStyle = getPinColor(pinType, computedStyle);
            context.fill();
            context.strokeStyle = bgObsidian;
            context.lineWidth = 1.5;
            context.stroke();

            // Label text
            context.fillStyle = isPinHovered ? (isLight ? '#000000' : '#ffffff') : textSecondary;
            context.font = '500 10px "Fira Code", monospace';
            context.textAlign = 'right';
            context.textBaseline = 'middle';
            context.fillText(pinId, pos.x - 12, pos.y);
        });
    }

    // 7. Draw Mini Parameters / Value Preview at bottom
    const paramKeys = Object.keys(node.params);
    if (paramKeys.length > 0) {
        context.fillStyle = computedStyle.getPropertyValue('--text-muted').trim() || 'hsl(220, 10%, 46%)';
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
    pinType: PinType,
    computedStyle: CSSStyleDeclaration
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
    const color = getPinColor(pinType, computedStyle);
    const isLight = document.body.classList.contains('light-theme');

    // 1. Draw main glowing conduit line background (semi-transparent)
    context.beginPath();
    context.moveTo(sourcePos.x, sourcePos.y);
    context.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, targetPos.x, targetPos.y);
    context.strokeStyle = color;
    context.globalAlpha = isLight ? 0.35 : 0.25;
    context.lineWidth = 4;
    context.stroke();

    // 2. Draw sharp internal edge path
    context.globalAlpha = 0.85;
    context.lineWidth = 2;
    context.stroke();

    // 3. Flowing Pulse Animation
    // Create animated dash offsets shifting with the epoch timestamp to show active signal transmission
    const isSelected = ctx.selectedNodeId === edge.sourceNodeId || 
                       ctx.selectedNodeId === edge.targetNodeId || 
                       (ctx.selectedNodeIds && (ctx.selectedNodeIds.has(edge.sourceNodeId) || ctx.selectedNodeIds.has(edge.targetNodeId)));
    context.lineWidth = 2.5;

    context.strokeStyle = isLight ? 'rgba(15, 23, 42, 0.7)' : '#ffffff';
    context.globalAlpha = isSelected ? 0.9 : 0.6;
    context.setLineDash([8, 12]);
    context.lineDashOffset = -(Date.now() / 24) % 20; // Flow direction left-to-right
    context.stroke();

    context.restore();
}


