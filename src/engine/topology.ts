import { GraphState, NodeID } from '../core/ast.js';

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
 * @returns 2D Array of NodeIDs representing sequential tiers of concurrent execution
 */
export const sortTopologically = (graph: GraphState): NodeID[][] => {
    const { nodes, edges } = graph;
    
    // Track in-degrees (number of incoming edges) for each node
    const inDegree: Record<NodeID, number> = {};
    
    // Graph adjacency list: Map of NodeID to array of dependent NodeIDs
    const adjList: Record<NodeID, NodeID[]> = {};

    // Initialize tracking structures
    Object.keys(nodes).forEach(nodeId => {
        inDegree[nodeId] = 0;
        adjList[nodeId] = [];
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
        if (nodes[target].type === 'system/state' && edge.targetPinId === 'nextValue') {
            return;
        }

        adjList[source].push(target);
        inDegree[target] += 1;
    });

    // Initial Tier: Nodes with mathematically 0 incoming dependencies
    let currentTier: NodeID[] = Object.keys(inDegree).filter(nodeId => inDegree[nodeId] === 0);
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
            const neighbors = adjList[current] || [];
            neighbors.forEach(neighbor => {
                inDegree[neighbor] -= 1;
                // Once a neighbor has all its blocking dependencies met, it joins the NEXT tier
                if (inDegree[neighbor] === 0) {
                    nextTier.push(neighbor);
                }
            });
        });

        // Advance the evaluation window
        currentTier = nextTier;
    }

    // Safety constraint: If we didn't crunch every node, there is a looping cycle.
    if (processedNodesCount !== Object.keys(nodes).length) {
        throw new Error("Graph Execution Error: Circular dependency detected in graph. Pure evaluation halted.");
    }

    return executionTiers;
};
