import { GraphState, NodeID } from '../core/ast.js';
import { getNodeMode } from '../registry/index.js';
import { NodeRegistry } from '../registry/types.js';

// ============================================================================
// TOPOLOGY & GRAPH ANALYSIS (Execution Preparation)
// ============================================================================

/**
 * Pure function that performs a tiered topological sort on the graph.
 * Nodes are gathered into "Execution Tiers" (NodeID[][]). Every node within a specific 
 * tier is guaranteed to have NO dependencies on each other, allowing the engine to 
 * evaluate the entire tier concurrently (e.g. via Promise.all).
 * 
 * Throws an error if a circular dependency is detected.
 * 
 * @param graph The immutable graph state
 * @param registry The node registry to resolve dynamic node modes
 * @returns 2D Array of NodeIDs representing sequential tiers of concurrent execution
 */
export const sortTopologically = (graph: GraphState, registry?: NodeRegistry): NodeID[][] => {
    const { nodes, edges } = graph;
    
    // Track in-degrees (number of incoming edges) for each node
    const inDegree = new Map<NodeID, number>();
    
    // Graph adjacency list: Map of NodeID to array of dependent NodeIDs
    const adjList = new Map<NodeID, NodeID[]>();

    // Initialize tracking structures
    const nodeIds = Object.keys(nodes);
    nodeIds.forEach(nodeId => {
        inDegree.set(nodeId, 0);
        adjList.set(nodeId, []);
    });

    // Populate adjacency list and in-degrees based on edges
    edges.forEach(edge => {
        const source = edge.sourceNodeId;
        const target = edge.targetNodeId;
        
        // Safety check if an edge references a deleted node
        if (!nodes[source] || !nodes[target]) return; 

        // CRITICAL: Ignore edges targeting the state node feedback pin (nextValue)
        // to prevent circular dependency errors. Feedback loops are resolved 
        // across execution ticks by the engine.
        if (getNodeMode(nodes[target], registry) === 'state' && edge.targetPinId === 'nextValue') {
            return;
        }


        adjList.get(source)!.push(target);
        inDegree.set(target, inDegree.get(target)! + 1);
    });

    // Initial Tier: Nodes with mathematically 0 incoming dependencies
    let currentTier: NodeID[] = [];
    inDegree.forEach((degree, nodeId) => {
        if (degree === 0) {
            currentTier.push(nodeId);
        }
    });

    const executionTiers: NodeID[][] = [];
    let processedNodesCount = 0;

    // Process nodes in synchronized parallel tiers
    while (currentTier.length > 0) {
        // Add the current batch of parallel-safe nodes to our master plan
        executionTiers.push(currentTier);
        processedNodesCount += currentTier.length;

        const nextTier: NodeID[] = [];

        // For every node in the current parallel batch, discover what unlocks next
        currentTier.forEach(current => {
            const neighbors = adjList.get(current) ?? [];
            neighbors.forEach(neighbor => {
                const updatedDegree = inDegree.get(neighbor)! - 1;
                inDegree.set(neighbor, updatedDegree);
                // Once a neighbor has all its blocking dependencies met, it joins the NEXT tier
                if (updatedDegree === 0) {
                    nextTier.push(neighbor);
                }
            });
        });

        // Advance the evaluation window
        currentTier = nextTier;
    }

    // Safety constraint: If we didn't crunch every node, there is a looping cycle.
    if (processedNodesCount !== nodeIds.length) {
        throw new Error("Graph Execution Error: Circular dependency detected in graph. Pure evaluation halted.");
    }

    return executionTiers;
};
