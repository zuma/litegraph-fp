import { GraphState, NodeID, NodeState } from '../core/ast.js';
import { sortTopologically } from '../engine/topology.js';
import { getNodeHeight } from './state.js';
import { GRID_SIZE } from './state.js';
import { NODE_WIDTH } from './canvas.js';

/**
 * Arranges nodes topologically in columns.
 * Snaps all positions to the GRID_SIZE grid.
 */
export function autoLayoutGraph(graph: GraphState): GraphState {
    let tiers: NodeID[][];
    try {
        tiers = sortTopologically(graph);
    } catch (e) {
        // If there's a circular dependency, we can't perform topological layout cleanly.
        // Fall back to layout by simple heuristic or return unmodified.
        return graph;
    }

    const colWidth = 300; // Multiples of GRID_SIZE (30px * 10)
    const rowSpacing = 90; // Multiples of GRID_SIZE (30px * 3)
    const startX = 100;

    const updatedNodes = { ...graph.nodes } as Record<NodeID, NodeState>;

    // We want to center columns vertically.
    // First, calculate node heights.
    const tierHeights = tiers.map(tier => {
        return tier.reduce((sum, nodeId) => {
            const node = graph.nodes[nodeId];
            return sum + getNodeHeight(node) + rowSpacing;
        }, 0) - rowSpacing;
    });

    const maxTierHeight = Math.max(...tierHeights, 0);

    tiers.forEach((tier, colIdx) => {
        const colX = Math.round((startX + colIdx * colWidth) / GRID_SIZE) * GRID_SIZE;
        const tierHeight = tierHeights[colIdx];
        
        let currentY = -tierHeight / 2 + 150; // offset a bit vertically
        currentY = Math.round(currentY / GRID_SIZE) * GRID_SIZE;

        tier.forEach(nodeId => {
            const node = graph.nodes[nodeId];
            const nodeHeight = getNodeHeight(node);

            updatedNodes[nodeId] = {
                ...node,
                ui: {
                    ...(node.ui ?? { title: nodeId.toUpperCase() }),
                    x: colX,
                    y: currentY
                }
            };

            currentY += nodeHeight + rowSpacing;
            currentY = Math.round(currentY / GRID_SIZE) * GRID_SIZE;
        });
    });

    return {
        ...graph,
        nodes: updatedNodes
    };
}
