import { RenderingContext } from './types.js';
import { NodeState, Edge, PinType } from '../core/ast.js';
import { NodeDefinition } from '../registry/types.js';
import { getNodeInputs, getNodeOutputs } from '../registry/index.js';

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
export function getNodeHeight(
    node: NodeState, 
    resolvedInputs?: Record<string, Record<string, PinType>>, 
    resolvedOutputs?: Record<string, Record<string, PinType>>
): number {
    const numInputs = Object.keys(getNodeInputs(node, resolvedInputs)).length;
    const numOutputs = Object.keys(getNodeOutputs(node, resolvedOutputs)).length;
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
    
    // Clear screen with custom background color or theme default
    const canvasBg = renderingCtx.backgroundColor || computedStyle.getPropertyValue('--bg-obsidian').trim() || '#090a0f';
    ctx.fillStyle = canvasBg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Apply grid spacing (60px - chosen as a highly composite multiple of 3)
    const gridSize = 60;
    const scaledGrid = gridSize * zoom;

    // Align start grid position with viewport pan offset
    const startX = ((x % scaledGrid) + scaledGrid) % scaledGrid;
    const startY = ((y % scaledGrid) + scaledGrid) % scaledGrid;

    const isLight = document.body.classList.contains('light-theme');
    
    if (renderingCtx.gridStyle === 'line') {
        // Draw grid lines
        ctx.lineWidth = 1 * Math.max(0.3, zoom);
        ctx.strokeStyle = isLight ? 'rgba(0, 0, 0, 0.05)' : 'rgba(255, 255, 255, 0.03)';
        
        // Vertical lines
        for (let gx = startX - scaledGrid; gx < canvas.width + scaledGrid; gx += scaledGrid) {
            ctx.beginPath();
            ctx.moveTo(gx, 0);
            ctx.lineTo(gx, canvas.height);
            ctx.stroke();
        }
        
        // Horizontal lines
        for (let gy = startY - scaledGrid; gy < canvas.height + scaledGrid; gy += scaledGrid) {
            ctx.beginPath();
            ctx.moveTo(0, gy);
            ctx.lineTo(canvas.width, gy);
            ctx.stroke();
        }
    } else {
        // Draw grid dots (default)
        ctx.fillStyle = isLight ? 'rgba(0, 0, 0, 0.07)' : 'rgba(255, 255, 255, 0.04)';
        for (let gx = startX - scaledGrid; gx < canvas.width + scaledGrid; gx += scaledGrid) {
            for (let gy = startY - scaledGrid; gy < canvas.height + scaledGrid; gy += scaledGrid) {
                ctx.beginPath();
                ctx.arc(gx, gy, 1.2 * Math.max(0.5, zoom), 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }
    
    ctx.restore();
}

export function drawNode(ctx: RenderingContext, node: NodeState, nodeDef: NodeDefinition | undefined, computedStyle: CSSStyleDeclaration) {
    if (node.ui?.isMorphing) return;
    const context = ctx.ctx;
    const x = node.ui?.x ?? 0;
    const y = node.ui?.y ?? 0;
    const w = node.ui?.width ?? NODE_WIDTH;
    const h = getNodeHeight(node, ctx.resolvedInputs, ctx.resolvedOutputs);

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

    // 1. Draw Glowing Backing Shadow
    if (hasError) {
        context.shadowColor = isLight ? 'rgba(255, 0, 80, 0.25)' : 'rgba(255, 0, 80, 0.4)';
        context.shadowBlur = 15;
        context.shadowOffsetY = 4;
    } else if (isSelected) {
        context.shadowColor = isLight ? 'rgba(0, 100, 255, 0.2)' : 'rgba(0, 240, 255, 0.3)';
        context.shadowBlur = 15;
        context.shadowOffsetY = 4;
    } else {
        // Normal or Hovered state - use category-dependent ambient drop shadow (spilling content color)
        let shadowVar = '--node-default-shadow';
        if (nodeDef?.category === 'math') {
            shadowVar = '--node-math-shadow';
        } else if (nodeDef?.category === 'logic') {
            shadowVar = '--node-logic-shadow';
        } else if (nodeDef?.category === 'state') {
            shadowVar = '--node-state-shadow';
        }
        context.shadowColor = computedStyle.getPropertyValue(shadowVar).trim() || (isLight ? 'rgba(0, 0, 0, 0.08)' : 'rgba(0, 0, 0, 0.45)');
        context.shadowBlur = isHovered ? 24 : 16;
        context.shadowOffsetY = isHovered ? 8 : 4;
    }

    // 1.5 Draw Rounded Backdrop Blur (simulates CSS backdrop-filter on Canvas)
    context.save();
    context.beginPath();
    context.roundRect(x, y, w, h, 10);
    context.clip();

    // Grab corresponding area from the raw canvas element and paint it back with blur filter
    context.filter = 'blur(12px) saturate(140%)';
    const dpr = window.devicePixelRatio || 1;
    const zoom = ctx.viewport.zoom;
    const screenX = (x * zoom + ctx.viewport.x) * dpr;
    const screenY = (y * zoom + ctx.viewport.y) * dpr;
    const screenW = (w * zoom) * dpr;
    const screenH = (h * zoom) * dpr;
    try {
        if (screenW > 0 && screenH > 0) {
            context.drawImage(ctx.canvas, screenX, screenY, screenW, screenH, x, y, w, h);
        }
    } catch (e) {
        // Fallback gracefully if canvas copying is temporarily out of bounds
    }
    context.restore();

    // 2. Draw Card Body (Glassmorphism card - Full size)
    context.fillStyle = computedStyle.getPropertyValue('--bg-card').trim() || 'rgba(20, 24, 33, 0.85)';
    context.beginPath();
    context.roundRect(x, y, w, h, 10);
    context.fill();

    // Reset shadow for subsequent drawings
    context.shadowBlur = 0;

    // 4. Draw Header Bar (Suspended chip / Nested titlebar layout)
    const INFILL_PADDING = 4;
    const insetX = x + INFILL_PADDING;
    const insetY = y + INFILL_PADDING;
    const insetW = w - 2 * INFILL_PADDING;
    const insetH = HEADER_HEIGHT - 2 * INFILL_PADDING;
    const insetR = 6;

    context.beginPath();
    context.roundRect(insetX, insetY, insetW, insetH, insetR);
    
    // Resolve header color gradient based on category and theme
    let headerGrad = context.createLinearGradient(insetX, insetY, insetX + insetW, insetY);
    
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

    // 5. Draw Title text
    context.fillStyle = textPrimary;
    context.font = 'bold 12px "Outfit", sans-serif';
    context.textAlign = 'left';
    context.textBaseline = 'middle';
    const maxTitleWidth = w - 12 - (hasError ? 34 : 12);
    context.fillText(node.ui?.title ?? nodeDef?.name ?? node.type, x + 12, y + HEADER_HEIGHT / 2, maxTitleWidth);

    // 5.5 Draw Status Warning Badge if node is in error state
    if (hasError) {
        const badgeX = x + w - 18;
        const badgeY = y + HEADER_HEIGHT / 2;
        const badgeRadius = 7.5;

        // Draw amber yellow badge background circle
        context.beginPath();
        context.arc(badgeX, badgeY, badgeRadius, 0, Math.PI * 2);
        context.fillStyle = '#f59e0b';
        context.fill();

        // Draw centered black exclamation mark
        context.fillStyle = '#090a0f';
        context.font = 'bold 11px "Outfit", sans-serif';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText('!', badgeX, badgeY);
    }

    // 6. Draw Pins and Labels
    if (nodeDef) {
        // Draw Inputs (Left side)
        const inputs = Object.entries(getNodeInputs(node, ctx.resolvedInputs));
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
        const outputs = Object.entries(getNodeOutputs(node, ctx.resolvedOutputs));
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

    // 7. Draw Mini Parameters Preview at bottom of node body (if any)
    if (true) {
        const paramKeys = Object.keys(node.params);
        const hasParams = paramKeys.length > 0;
        if (hasParams) {
            context.fillStyle = computedStyle.getPropertyValue('--text-muted').trim() || 'hsl(220, 10%, 46%)';
            context.font = '8px "Fira Code", monospace';
            context.textAlign = 'center';
            context.textBaseline = 'bottom';
            const preview = paramKeys.map(k => `${k}:${node.params[k]}`).join(' | ');
            context.fillText(preview.length > 25 ? preview.slice(0, 22) + '...' : preview, x + w / 2, y + h - 8);
        }

        // 8. Expandable Node ID Drawer (Dynamo style)
        const isEllipsisHovered = ctx.hoveredEllipsisNodeId === node.id;
        const isPinned = ctx.pinnedDrawerNodeIds?.has(node.id) ?? false;
        const isDrawerOpen = ctx.hoveredDrawerNodeId === node.id || isPinned;

        // Draw ellipsis button at the bottom right corner of the node body
        context.save();
        context.beginPath();
        
        const btnW = 20;
        const btnH = 12;
        const btnX = x + w - btnW - 6;
        const btnY = y + h - btnH - 6;
        
        context.roundRect(btnX, btnY, btnW, btnH, 6);
        context.fillStyle = computedStyle.getPropertyValue('--bg-card').trim() || 'rgba(20, 24, 33, 0.85)';
        context.fill();
        
        context.lineWidth = 1;
        context.strokeStyle = isEllipsisHovered || isPinned 
            ? (computedStyle.getPropertyValue('--accent-cyan').trim() || 'hsl(190, 100%, 50%)')
            : (computedStyle.getPropertyValue('--border-panel').trim() || 'rgba(255, 255, 255, 0.08)');
        context.stroke();
        
        // Draw ellipsis dots text
        context.fillStyle = isEllipsisHovered || isPinned
            ? (computedStyle.getPropertyValue('--accent-cyan').trim() || 'hsl(190, 100%, 50%)')
            : (computedStyle.getPropertyValue('--text-muted').trim() || 'hsl(220, 10%, 46%)');
        context.font = 'bold 10px "Outfit", sans-serif';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText('...', btnX + btnW / 2, btnY + btnH / 2 - 1);
        context.restore();

        // Draw the drawer if open
        if (isDrawerOpen) {
            context.save();
            
            const drawerW = 144;
            const drawerH = 24;
            const drawerX = x + w / 2 - drawerW / 2;
            const drawerY = y + h + 6;
            
            // Draw drawer body (glassmorphism)
            context.beginPath();
            context.roundRect(drawerX, drawerY, drawerW, drawerH, 6);
            context.fillStyle = computedStyle.getPropertyValue('--bg-obsidian').trim() || '#090a0f';
            context.globalAlpha = 0.95;
            context.fill();
            context.globalAlpha = 1.0;
            
            context.lineWidth = 1;
            context.strokeStyle = isPinned 
                ? (computedStyle.getPropertyValue('--accent-cyan').trim() || 'hsl(190, 100%, 50%)')
                : (computedStyle.getPropertyValue('--border-panel').trim() || 'rgba(255, 255, 255, 0.08)');
            context.stroke();
            
            // Draw Node ID text
            context.fillStyle = computedStyle.getPropertyValue('--text-primary').trim() || '#ffffff';
            context.font = '9px "Fira Code", monospace';
            context.textAlign = 'left';
            context.textBaseline = 'middle';
            context.fillText(node.id, drawerX + 10, drawerY + drawerH / 2);
            
            // Draw Thumbtack/Pin button area
            const pinCX = drawerX + drawerW - 18;
            const pinCY = drawerY + drawerH / 2;
            const isPinHovered = ctx.hoveredPinNodeId === node.id;
            
            if (isPinHovered) {
                context.beginPath();
                context.arc(pinCX, pinCY, 8, 0, Math.PI * 2);
                context.fillStyle = 'rgba(255, 255, 255, 0.08)';
                context.fill();
            }
            
            // Draw thumbtack icon
            const pinColor = isPinned 
                ? (computedStyle.getPropertyValue('--accent-cyan').trim() || 'hsl(190, 100%, 50%)')
                : (isPinHovered ? '#ffffff' : (computedStyle.getPropertyValue('--text-muted').trim() || 'hsl(220, 10%, 46%)'));
                
            context.strokeStyle = pinColor;
            context.fillStyle = pinColor;
            context.lineWidth = 1.5;
            
            context.translate(pinCX, pinCY);
            if (!isPinned) {
                context.rotate(Math.PI / 4); // Rotated 45 degrees when unpinned
            }
            
            // Draw cap
            context.beginPath();
            context.moveTo(-4, -4);
            context.lineTo(4, -4);
            context.stroke();
            
            // Draw body
            context.beginPath();
            context.moveTo(-3, -4);
            context.lineTo(-3, 1);
            context.lineTo(3, 1);
            context.lineTo(3, -4);
            context.closePath();
            if (isPinned) {
                context.fill();
            } else {
                context.stroke();
            }
            
            // Draw needle point
            context.beginPath();
            context.moveTo(0, 1);
            context.lineTo(0, 6);
            context.stroke();
            
            context.restore();
        }
    }
    // 9. Draw Card Border Outline last (only on selection or error state to declutter the canvas)
    if (isSelected || hasError || node.type === 'node/unconfigured') {
        context.beginPath();
        context.roundRect(x, y, w, h, 10);
        context.lineWidth = node.type === 'node/unconfigured' ? 1.5 : 2.5;
        if (node.type === 'node/unconfigured') {
            context.setLineDash([4, 4]);
            context.strokeStyle = isLight ? 'rgba(0, 0, 0, 0.24)' : 'rgba(255, 255, 255, 0.24)';
        } else if (hasError) {
            context.setLineDash([]);
            let borderGrad = context.createLinearGradient(x, y, x, y + h);
            borderGrad.addColorStop(0, 'rgba(255, 0, 80, 1.0)');
            borderGrad.addColorStop(1, 'rgba(255, 0, 80, 0.7)');
            context.strokeStyle = borderGrad;
        } else if (isSelected) {
            context.setLineDash([]);
            let borderGrad = context.createLinearGradient(x, y, x, y + h);
            borderGrad.addColorStop(0, isLight ? 'rgba(0, 100, 255, 1.0)' : 'rgba(0, 145, 255, 1.0)');
            borderGrad.addColorStop(1, isLight ? 'rgba(0, 60, 255, 0.7)' : 'rgba(0, 100, 255, 0.7)');
            context.strokeStyle = borderGrad;
        }
        context.stroke();
        context.setLineDash([]);
    }

    // 9.5 Specular Top Catch-Light Highlight (Adopting Liquid Glass reflection)
    if (!hasError && !isSelected) {
        let specularVar = '--node-default-specular';
        if (nodeDef?.category === 'math') {
            specularVar = '--node-math-specular';
        } else if (nodeDef?.category === 'logic') {
            specularVar = '--node-logic-specular';
        } else if (nodeDef?.category === 'state') {
            specularVar = '--node-state-specular';
        }
        const specularColor = computedStyle.getPropertyValue(specularVar).trim() || (isLight ? 'rgba(255, 255, 255, 0.65)' : 'rgba(255, 255, 255, 0.16)');

        context.beginPath();
        context.arc(x + 10, y + 10, 10, Math.PI, Math.PI * 1.5);
        context.lineTo(x + w - 10, y);
        context.arc(x + w - 10, y + 10, 10, Math.PI * 1.5, Math.PI * 2);
        context.strokeStyle = specularColor;
        context.lineWidth = 1;
        context.stroke();
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

    const color = getPinColor(pinType, computedStyle);
    const isLight = document.body.classList.contains('light-theme');
    const edgeStyle = ctx.edgeStyle || 'spline';

    const buildPath = () => {
        context.beginPath();
        context.moveTo(sourcePos.x, sourcePos.y);
        if (edgeStyle === 'orthogonal') {
            const midX = (sourcePos.x + targetPos.x) / 2;
            context.lineTo(midX, sourcePos.y);
            context.lineTo(midX, targetPos.y);
            context.lineTo(targetPos.x, targetPos.y);
        } else {
            const dx = Math.abs(targetPos.x - sourcePos.x);
            const cpOffset = Math.max(40, dx * 0.4);
            context.bezierCurveTo(sourcePos.x + cpOffset, sourcePos.y, targetPos.x - cpOffset, targetPos.y, targetPos.x, targetPos.y);
        }
    };

    const isEdgeSelected = ctx.selectedEdgeId === edge.id || (ctx.selectedEdgeIds && ctx.selectedEdgeIds.has(edge.id));

    // Dynamic styling values for distinct selection vs normal states
    let glowWidth = 4;
    let glowOpacity = isLight ? 0.35 : 0.25;
    let coreWidth = 2;
    let coreOpacity = 0.85;

    if (isEdgeSelected) {
        glowWidth = 7;
        glowOpacity = isLight ? 0.7 : 0.6;
        coreWidth = 3.5;
        coreOpacity = 1.0;
    }

    // 1. Draw main glowing conduit line background (semi-transparent)
    buildPath();
    context.strokeStyle = color;
    context.globalAlpha = glowOpacity;
    context.lineWidth = glowWidth;
    context.stroke();

    // 2. Draw sharp internal edge path
    buildPath();
    context.strokeStyle = color;
    context.globalAlpha = coreOpacity;
    context.lineWidth = coreWidth;
    context.stroke();

    context.restore();
}


