import { GraphState, NodeID, ExecutionState, EngineConfig, NodeRegistry, ExecutionResult } from './types.js'; // Use .js extension for ES modules

// ============================================================================
// 1. CORE EXECUTION ENGINE (Primary Entry Point)
// ============================================================================

/**
 * The core Functional Execution Reducer.
 * Maps over the topological graph sequence and resolves nodes concurrently or sequentially
 * based on the provided configuration.
 * 
 * @param graph The immutable representation of the node graph
 * @param initialInputs Any predefined starting variables injected globally
 * @param registry The dictionary of pure functions for node logic
 * @param config Controls whether evaluation uses Promises in parallel or awaits serially
 * @returns A fresh dictionary containing the final computed state of all node outputs
 */
export const evaluateGraph = async (
    graph: GraphState,
    initialInputs: ExecutionState,
    registry: NodeRegistry,
    config: EngineConfig
): Promise<ExecutionResult> => {
    // 1. Calculate our Tiered topological order maps
    const executionTiers = sortTopologically(graph);
    
    // 2. Setup isolated execution dictionary (clone to avoid mutating the original input)
    const activeState: Record<string, unknown> = { ...initialInputs };
    const runtimeErrors: Record<NodeID, string> = {};

    // --- EXECUTION HELPERS ---

    // Helper: Evaluates a single, mathematically pure node with Mars-Grade Resilience
    const evaluateNode = async (nodeId: NodeID) => {
        const node = graph.nodes[nodeId];
        const pureLogic = registry[node.type];
        
        if (!pureLogic) {
            throw new Error(`Engine Error: Missing functional logic for node type "${node.type}"`);
        }

        // Pull required inputs via edge definitions
        const incomingEdges = graph.edges.filter(edge => edge.targetNodeId === nodeId);
        const resolvedInputs: Record<string, unknown> = {};
        
        // 1. Initialize strictly with any root inputs from active global state (like manually typed values)
        Object.keys(activeState).forEach(stateKey => {
            if (stateKey.startsWith(`${nodeId}.`)) {
                const pinName = stateKey.split('.')[1];
                resolvedInputs[pinName] = activeState[stateKey];
            }
        });

        // 2. Override with live Edge Data (Cables always win over typed values)
        incomingEdges.forEach(edge => {
            const stateKey = `${edge.sourceNodeId}.${edge.sourcePinId}`;
            resolvedInputs[edge.targetPinId] = activeState[stateKey];
        });

        // Mars-Grade Watchdog: Timeout Protection
        const executionPromise = pureLogic(resolvedInputs, node.params);
        const timeoutMs = config.nodeTimeoutMs ?? 5000;
        
        const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error(`Timeout: Node exceeded ${timeoutMs}ms watchdog limit.`)), timeoutMs);
        });

        // Race the raw logic against the hard watchdog limit
        const computedOutput = await Promise.race([executionPromise, timeoutPromise]) as Record<string, unknown>;

        // Map output values globally into the execution dictionary
        Object.entries(computedOutput).forEach(([outputPin, value]) => {
            activeState[`${nodeId}.${outputPin}`] = value;
        });
    };

    // Helper to safely wrap execution and catch isolated node explosion
    const executeSafely = async (nodeId: NodeID) => {
        try {
            await evaluateNode(nodeId);
        } catch (error: any) {
            // Graceful Degradation: Flag error without crashing topological layer
            runtimeErrors[nodeId] = error?.message || "Unknown fatal error occurred.";
        }
    };

    // --- PIPELINE MATRIX ---

    // 3. Execution Pipeline Matrix
    if (config.executionMode === 'serial') {
        const flatSequence = executionTiers.flat();
        for (const nodeId of flatSequence) {
             await executeSafely(nodeId);
        }
    } else {
        // Scalable Dataflow Mode: Process tiers sequentially, slam nodes inside tiers concurrently 
        for (const tier of executionTiers) {
            // Promise.allSettled guarantees one failing node won't nuke sibling logic
            await Promise.allSettled(tier.map(nodeId => executeSafely(nodeId)));
        }
    }

    // Return frozen deep copy of execution outputs AND the separated error log
    return {
        state: Object.freeze(activeState) as ExecutionState,
        errors: Object.freeze(runtimeErrors)
    };
};

// ============================================================================
// 2. TOPOLOGY & GRAPH ANALYSIS (Execution Preparation)
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
