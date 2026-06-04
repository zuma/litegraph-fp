import { GraphState } from '../core/ast.js';
import { RenderingContext } from './types.js';
import { drawGrid, drawNode, drawEdge, getInputPinPos, getOutputPinPos } from './canvas.js';
import { NodeRegistry } from '../registry/types.js';
import { appState } from './state.js';

/**
 * Impure rendering loop that binds Graph State to a Canvas.
 * This is a pure state→pixels subscriber: it reads state and draws.
 * It has no knowledge of the execution engine or side-effect dispatch.
 */
export const createRenderer = (
    context: RenderingContext,
    getGraphState: () => GraphState,
    registry: NodeRegistry
) => {
    let isRunning = false;

    const renderFrame = () => {
        const { ctx, canvas, viewport } = context;
        
        const computedStyle = getComputedStyle(document.body);

        // 1. Draw background and grid in screen space
        drawGrid(context, computedStyle);

        const state = getGraphState();

        // 2. Apply Viewport pan and zoom (World Space translation matrix)
        ctx.save();
        ctx.translate(viewport.x, viewport.y);
        ctx.scale(viewport.zoom, viewport.zoom);

        // 3. Draw All Edges
        state.edges.forEach(edge => {
            const sourceNode = state.nodes[edge.sourceNodeId];
            const targetNode = state.nodes[edge.targetNodeId];
            
            if (!sourceNode || !targetNode) return;
            
            const sourceDef = registry[sourceNode.type];
            const targetDef = registry[targetNode.type];
            
            if (!sourceDef || !targetDef) return;

            // Find indexes of connected pins to calculate coordinates
            const outPinNames = Object.keys(sourceDef.provides);
            const inPinNames = Object.keys(targetDef.requires);
            
            const outIndex = outPinNames.indexOf(edge.sourcePinId);
            const inIndex = inPinNames.indexOf(edge.targetPinId);
            
            if (outIndex === -1 || inIndex === -1) return;

            const sourcePos = getOutputPinPos(sourceNode, sourceDef, outIndex);
            const targetPos = getInputPinPos(targetNode, inIndex);
            const pinType = sourceDef.provides[edge.sourcePinId];

            drawEdge(context, edge, sourcePos, targetPos, pinType, computedStyle);
        });

        // 4. Draw Dragging Connection Line
        if (context.draggingConnection) {
            const drag = context.draggingConnection;
            ctx.save();
            ctx.beginPath();
            ctx.moveTo(drag.x, drag.y);
            
            const edgeStyle = context.edgeStyle || 'spline';
            if (edgeStyle === 'orthogonal') {
                const midX = (drag.x + drag.cursorX) / 2;
                ctx.lineTo(midX, drag.y);
                ctx.lineTo(midX, drag.cursorY);
                ctx.lineTo(drag.cursorX, drag.cursorY);
            } else {
                // Draw smooth Bezier curve to cursor
                const dx = Math.abs(drag.cursorX - drag.x);
                const cpOffset = Math.max(40, dx * 0.4);
                const cp1x = drag.isInput ? drag.x - cpOffset : drag.x + cpOffset;
                const cp1y = drag.y;
                const cp2x = drag.isInput ? drag.cursorX + cpOffset : drag.cursorX - cpOffset;
                const cp2y = drag.cursorY;
                ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, drag.cursorX, drag.cursorY);
            }
            
            ctx.strokeStyle = drag.isInput ? 'hsl(275, 100%, 65%)' : 'hsl(190, 100%, 50%)'; // Purple or Cyan
            ctx.lineWidth = 2;
            ctx.stroke();
            
            // Draw temporary end dot
            ctx.beginPath();
            ctx.arc(drag.cursorX, drag.cursorY, 4, 0, Math.PI * 2);
            ctx.fillStyle = '#ffffff';
            ctx.fill();
            ctx.restore();
        }

        // 5. Draw All Nodes
        for (const nodeId in state.nodes) {
            const node = state.nodes[nodeId];
            const nodeDef = registry[node.type];
            drawNode(context, node, nodeDef, computedStyle);
        }

        // 5.5. Draw Hovered Edge Telemetry Tooltip
        if (context.hoveredEdgeId && context.hoveredEdgePos) {
            const edge = state.edges.find(e => e.id === context.hoveredEdgeId);
            if (edge) {
                const pos = context.hoveredEdgePos;
                const valueKey = `${edge.sourceNodeId}.${edge.sourcePinId}`;
                const value = appState.latestExecutionState[valueKey];
                
                let valueStr = 'undefined';
                if (value !== undefined) {
                    if (value === null) {
                        valueStr = 'null';
                    } else if (typeof value === 'object') {
                        try {
                            valueStr = JSON.stringify(value);
                            if (valueStr.length > 30) {
                                valueStr = valueStr.slice(0, 27) + '...';
                            }
                        } catch (e) {
                            valueStr = '[Object]';
                        }
                    } else {
                        valueStr = String(value);
                        if (valueStr.length > 25) {
                            valueStr = valueStr.slice(0, 22) + '...';
                        }
                    }
                }

                ctx.save();
                
                ctx.font = '500 10px "Fira Code", monospace';
                const textWidth = ctx.measureText(valueStr).width;
                const paddingX = 8;
                const paddingY = 4;
                const tooltipW = textWidth + paddingX * 2;
                const tooltipH = 16 + paddingY * 2;
                
                const tx = pos.x - tooltipW / 2;
                const ty = pos.y - tooltipH - 8;
                
                ctx.beginPath();
                ctx.roundRect(tx, ty, tooltipW, tooltipH, 6);
                ctx.fillStyle = computedStyle.getPropertyValue('--bg-card').trim() || 'rgba(20, 24, 33, 0.95)';
                ctx.fill();
                
                ctx.strokeStyle = computedStyle.getPropertyValue('--accent-cyan').trim() || 'hsl(190, 100%, 50%)';
                ctx.lineWidth = 1;
                ctx.stroke();
                
                ctx.fillStyle = computedStyle.getPropertyValue('--text-primary').trim() || '#ffffff';
                ctx.textAlign = 'left';
                ctx.textBaseline = 'top';
                ctx.fillText(valueStr, tx + paddingX, ty + paddingY + 3);
                
                ctx.restore();
            }
        }

        // 6. Draw Selection Box (if active)
        if (context.selectionBox && context.selectionBox.active) {
            const box = context.selectionBox;
            const startX = box.startX;
            const startY = box.startY;
            const currX = box.currentX;
            const currY = box.currentY;

            const bx = Math.min(startX, currX);
            const by = Math.min(startY, currY);
            const bw = Math.abs(currX - startX);
            const bh = Math.abs(currY - startY);

            ctx.save();
            if (currX >= startX) {
                // Enclosing Window: Blue background, solid blue border
                ctx.fillStyle = 'rgba(0, 120, 255, 0.15)';
                ctx.strokeStyle = 'rgba(0, 120, 255, 0.8)';
                ctx.lineWidth = 1.5 / viewport.zoom;
                ctx.fillRect(bx, by, bw, bh);
                ctx.strokeRect(bx, by, bw, bh);
            } else {
                // Crossing Window: Green background, dashed green border
                ctx.fillStyle = 'rgba(16, 185, 129, 0.15)';
                ctx.strokeStyle = 'rgba(16, 185, 129, 0.8)';
                ctx.lineWidth = 1.5 / viewport.zoom;
                ctx.setLineDash([5 / viewport.zoom, 5 / viewport.zoom]);
                ctx.fillRect(bx, by, bw, bh);
                ctx.beginPath();
                ctx.rect(bx, by, bw, bh);
                ctx.stroke();
            }
            ctx.restore();
        }

        ctx.restore();
    };

    const renderLoop = () => {
        if (!isRunning) return;

        const lastExec = context.lastExecutionTime ?? 0;
        const isAnimatingPulse = (Date.now() - lastExec) < 1500;

        if (context.needsRedraw || isAnimatingPulse) {
            context.needsRedraw = false;
            renderFrame();
        }

        requestAnimationFrame(renderLoop);
    };

    return {
        start: () => {
            if (isRunning) return;
            isRunning = true;
            renderLoop();
        },
        stop: () => {
            isRunning = false;
        },
        triggerSingleFrame: () => {
            renderFrame();
        }
    };
};
