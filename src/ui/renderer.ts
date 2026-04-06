import { GraphState } from '../core/ast.js';
import { RenderingContext } from './types.js';
import { clearCanvas, drawNode } from './canvas.js';

/**
 * Impure rendering loop that binds Graph State to a Canvas.
 * This is a pure state→pixels subscriber: it reads state and draws.
 * It has no knowledge of the execution engine or side-effect dispatch.
 */
export const createRenderer = (
    context: RenderingContext,
    getGraphState: () => GraphState
) => {
    let isRunning = false;

    const renderFrame = () => {
        clearCanvas(context);
        const state = getGraphState();

        // Pass 1: Edges (TODO)
        // Pass 2: Nodes
        for (const nodeId in state.nodes) {
            drawNode(context, state.nodes[nodeId]);
        }
    };

    const renderLoop = () => {
        if (!isRunning) return;
        renderFrame();
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
        }
    };
};
