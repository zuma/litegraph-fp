import { GraphState, NodeID, Edge } from '../core/ast.js';
import { ExecutionState, EngineConfig, ExecutionResult } from './types.js';
import { NodeRegistry } from '../registry/types.js';
import { Command } from '../events/types.js';
import { sortTopologically } from './topology.js';

// ============================================================================
// CORE EXECUTION ENGINE (Primary Entry Point)
// ============================================================================

/**
 * Pre-computes a lookup index mapping each NodeID to its incoming edges.
 * Called once before the tier loop to avoid O(E) scans per node evaluation.
 */
const buildEdgeIndex = (edges: ReadonlyArray<Edge>): Map<NodeID, Edge[]> => {
    const index = new Map<NodeID, Edge[]>();
    for (const edge of edges) {
        const existing = index.get(edge.targetNodeId);
        if (existing) {
            existing.push(edge);
        } else {
            index.set(edge.targetNodeId, [edge]);
        }
    }
    return index;
};

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

    // 2. Pre-compute the edge index (single O(E) pass, all future lookups are O(1))
    const edgeIndex = buildEdgeIndex(graph.edges);
    
    // 3. Setup isolated execution dictionary.
    //    PRAGMATIC NOTE: We use local mutation (spreading into a mutable Record) here
    //    intentionally. Spreading a potentially massive state object on every single
    //    node evaluation would create enormous GC pressure in large graphs. This is an
    //    accepted trade-off: the function remains externally pure (no visible side-effects
    //    to callers), while internally using mutation for performance. Rich Hickey calls
    //    this "transient" mutation — it's contained and invisible to the outside world.
    const activeState: Record<string, unknown> = { ...initialInputs };
    const runtimeErrors: Record<NodeID, string> = {};
    const collectedCommands: Record<NodeID, Command[]> = {};

    // --- EXECUTION HELPERS ---

    // Helper: Evaluates a single, mathematically pure node with Mars-Grade Resilience
    const evaluateNode = async (nodeId: NodeID) => {
        const node = graph.nodes[nodeId];
        const nodeDef = registry[node.type];
        
        if (!nodeDef) {
            throw new Error(`Engine Error: Missing functional logic for node type "${node.type}"`);
        }

        // Pull required inputs via the pre-computed edge index (O(1) lookup)
        const incomingEdges = edgeIndex.get(nodeId) ?? [];
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

        // Mars-Grade Watchdog: Timeout Protection with AbortController.
        // The AbortController serves two purposes:
        //   1. clearTimeout prevents the watchdog timer from leaking
        //   2. controller.abort() signals the node function to clean up its own
        //      internal async work (timers, fetch requests, etc.)
        const controller = new AbortController();
        const executionPromise = nodeDef.execute(resolvedInputs, node.params, controller.signal);
        const timeoutMs = config.nodeTimeoutMs ?? 5000;
        
        let timerId: ReturnType<typeof setTimeout>;
        const timeoutPromise = new Promise<never>((_, reject) => {
            timerId = setTimeout(() => {
                controller.abort(); // Signal the node to clean up
                reject(new Error(`Timeout: Node exceeded ${timeoutMs}ms watchdog limit.`));
            }, timeoutMs);
        });

        try {
            // Race the raw logic against the hard watchdog limit
            const computedOutput = await Promise.race([executionPromise, timeoutPromise]) as Record<string, unknown>;

            // Extract $commands into the dedicated commands dictionary (keeps state clean)
            if (Array.isArray(computedOutput.$commands)) {
                collectedCommands[nodeId] = computedOutput.$commands as Command[];
            }

            // Map output values globally into the execution dictionary (excluding $commands)
            Object.entries(computedOutput).forEach(([outputPin, value]) => {
                if (outputPin !== '$commands') {
                    activeState[`${nodeId}.${outputPin}`] = value;
                }
            });
        } finally {
            // Always clean up the timer — whether the node succeeded, failed, or timed out.
            clearTimeout(timerId!);
        }
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

    // 4. Execution Pipeline Matrix
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

    // Return frozen execution outputs, separated error log, and extracted commands
    return {
        state: Object.freeze(activeState) as ExecutionState,
        errors: Object.freeze(runtimeErrors),
        commands: Object.freeze(collectedCommands)
    };
};
