import { RenderingContext } from './types.js';
import { GraphState, NodeState, Edge } from '../core/ast.js';

export function clearCanvas(ctx: RenderingContext) {
    const { canvas, ctx: context } = ctx;
    context.clearRect(0, 0, canvas.width, canvas.height);
}

export function drawNode(ctx: RenderingContext, node: NodeState) {
    // Pure function to draw a single node given its state
    // To be implemented via strict HTML5 Canvas instructions
}

export function drawEdge(ctx: RenderingContext, edge: Edge, sourcePos: {x: number, y: number}, targetPos: {x: number, y: number}) {
    // Pure function to trace Bezier curves between pins
}
