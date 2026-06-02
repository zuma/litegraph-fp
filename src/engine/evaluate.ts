import { GraphState, NodeID, Edge } from '../core/ast.js';
import { ExecutionState, EngineConfig, ExecutionResult, Middleware, NodeExecuteFn } from './types.js';
import { NodeRegistry } from '../registry/types.js';
import { Command } from '../events/types.js';
import { sortTopologically } from './topology.js';
import { getGraphValidationErrors } from './validation.js';

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

// ============================================================================
// ENGINE MIDDLEWARE UTILITIES
// ============================================================================

const isEqual = (a: any, b: any): boolean => {
    if (a === b) return true;
    if (typeof a !== 'object' || a === null || typeof b !== 'object' || b === null) return false;
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (keysA.length !== keysB.length) return false;
    for (const key of keysA) {
        const valA = a[key];
        const valB = b[key];
        if (typeof valA === 'object' && valA !== null && typeof valB === 'object' && valB !== null) {
            if (valA.type === 'tensor' && valB.type === 'tensor') {
                if (valA.dtype !== valB.dtype) return false;
                if (valA.shape.length !== valB.shape.length) return false;
                for (let i = 0; i < valA.shape.length; i++) {
                    if (valA.shape[i] !== valB.shape[i]) return false;
                }
                continue;
            }
        }
        if (valA !== valB) return false;
    }
    return true;
};

export const createWatchdogMiddleware = (timeoutMs: number): Middleware => {
    return (nodeId, nodeType, next) => {
        return async (inputs, params, signal) => {
            const controller = new AbortController();
            if (signal) {
                if (signal.aborted) {
                    controller.abort();
                } else {
                    signal.addEventListener('abort', () => controller.abort());
                }
            }
            const executionPromise = next(inputs, params, controller.signal);
            let timerId: ReturnType<typeof setTimeout>;
            const timeoutPromise = new Promise<never>((_, reject) => {
                timerId = setTimeout(() => {
                    controller.abort();
                    reject(new Error(`Timeout: Node exceeded ${timeoutMs}ms watchdog limit.`));
                }, timeoutMs);
            });
            try {
                return await Promise.race([executionPromise, timeoutPromise]);
            } finally {
                clearTimeout(timerId!);
            }
        };
    };
};

export const createCacheMiddleware = (cache: Map<string, { inputs: any; params: any; outputs: any }>): Middleware => {
    return (nodeId, nodeType, next) => {
        return async (inputs, params, signal) => {
            if (nodeType === 'system/state' || nodeType === 'system/delay') {
                return next(inputs, params, signal);
            }
            const cached = cache.get(nodeId);
            if (cached && isEqual(cached.inputs, inputs) && isEqual(cached.params, params)) {
                return cached.outputs;
            }
            const outputs = await next(inputs, params, signal);
            cache.set(nodeId, { inputs, params, outputs });
            return outputs;
        };
    };
};

const composeMiddlewares = (
    middlewares: ReadonlyArray<Middleware>,
    coreExecute: NodeExecuteFn,
    nodeId: NodeID,
    nodeType: string
): NodeExecuteFn => {
    let execute = coreExecute;
    for (let i = middlewares.length - 1; i >= 0; i--) {
        execute = middlewares[i](nodeId, nodeType, execute);
    }
    return execute;
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
    // 1. Pre-flight static validation check
    const validationErrors = getGraphValidationErrors(graph, registry);
    if (Object.keys(validationErrors).length > 0) {
        return {
            state: Object.freeze({ ...initialInputs }) as ExecutionState,
            errors: Object.freeze(validationErrors),
            commands: Object.freeze({})
        };
    }

    // 2. Calculate our Tiered topological order maps with circular dependency protection
    let executionTiers: NodeID[][];
    try {
        executionTiers = sortTopologically(graph);
    } catch (cycleError: any) {
        return {
            state: Object.freeze({ ...initialInputs }) as ExecutionState,
            errors: Object.freeze({ __global__: cycleError?.message || "Circular dependency detected in graph." }),
            commands: Object.freeze({})
        };
    }

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

        // Upstream failure check (short-circuit / propagate skip status)
        const failedUpstreamEdge = incomingEdges.find(edge => edge.sourceNodeId in runtimeErrors);
        if (failedUpstreamEdge) {
            throw new Error(`Skipped: Upstream dependency '${failedUpstreamEdge.sourceNodeId}' failed.`);
        }

        const resolvedInputs: Record<string, unknown> = {};
        
        // 1. Initialize strictly with any root inputs from active global state (like manually typed values) (Fix #3)
        Object.keys(nodeDef.requires).forEach(pinName => {
            const stateKey = `${nodeId}.${pinName}`;
            if (stateKey in activeState) {
                resolvedInputs[pinName] = activeState[stateKey];
            }
        });

        // For system/state nodes, also initialize inputs with the previous 'value' from activeState
        if (node.type === 'system/state') {
            const stateKey = `${nodeId}.value`;
            if (stateKey in activeState) {
                resolvedInputs['value'] = activeState[stateKey];
            }
        }

        // 2. Override with live Edge Data (Cables always win over typed values)
        incomingEdges.forEach(edge => {
            const stateKey = `${edge.sourceNodeId}.${edge.sourcePinId}`;
            resolvedInputs[edge.targetPinId] = activeState[stateKey];
        });

        const coreExecute: NodeExecuteFn = async (inputs, params, signal) => {
            return nodeDef.execute(inputs, params, signal) as Promise<Record<string, unknown>>;
        };

        const pipeline: Middleware[] = [];
        if (config.middlewares) {
            pipeline.push(...config.middlewares);
        }
        if (config.cache) {
            pipeline.push(createCacheMiddleware(config.cache));
        }
        const timeoutMs = config.nodeTimeoutMs ?? 5000;
        pipeline.push(createWatchdogMiddleware(timeoutMs));

        const composedExecute = composeMiddlewares(pipeline, coreExecute, nodeId, node.type);
        const computedOutput = await composedExecute(resolvedInputs, node.params);

        if (!computedOutput || typeof computedOutput !== 'object') {
            throw new Error(`Node execution returned invalid value: expected an object, got ${typeof computedOutput}`);
        }

        if (Array.isArray((computedOutput as any).$commands)) {
            collectedCommands[nodeId] = (computedOutput as any).$commands as Command[];
        }

        Object.keys(nodeDef.provides).forEach(outputPin => {
            const value = (computedOutput as any)[outputPin] !== undefined ? (computedOutput as any)[outputPin] : null;
            activeState[`${nodeId}.${outputPin}`] = value;
        });
    };

    // Helper to safely wrap execution and catch isolated node explosion
    const executeSafely = async (nodeId: NodeID) => {
        try {
            await evaluateNode(nodeId);
        } catch (error: any) {
            // Graceful Degradation: Flag error without crashing topological layer
            let errorMessage = "Unknown fatal error occurred.";
            if (error instanceof Error) {
                errorMessage = error.message;
            } else if (typeof error === 'string') {
                errorMessage = error;
            } else if (error && typeof error === 'object') {
                errorMessage = error.message || JSON.stringify(error);
            }
            runtimeErrors[nodeId] = errorMessage;
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

    // 5. Phase 2: Atomic State Commitment
    // Iterate through all nodes looking for system/state types to commit nextValue -> value
    Object.keys(graph.nodes).forEach(nodeId => {
        const node = graph.nodes[nodeId];
        if (node.type === 'system/state') {
            const nextValuePin = 'nextValue';
            const valueKey = `${nodeId}.value`;
            
            // Find edges targeting our nextValue pin
            const incomingEdges = edgeIndex.get(nodeId) ?? [];
            const nextValueEdge = incomingEdges.find(e => e.targetPinId === nextValuePin);
            
            if (nextValueEdge) {
                // The value "received" at nextValue is the output value of the source pin
                const sourceKey = `${nextValueEdge.sourceNodeId}.${nextValueEdge.sourcePinId}`;
                if (sourceKey in activeState) {
                    activeState[valueKey] = activeState[sourceKey];
                }
            } else {
                // If NO edge is connected to nextValue, we might want to check if it was 
                // manually provided in initialInputs, though this is rare for feedback loops.
                const nextValueKey = `${nodeId}.nextValue`;
                if (nextValueKey in activeState) {
                    activeState[valueKey] = activeState[nextValueKey];
                }
            }
        }
    });

    // Garbage Collection of Stale State Keys
    const validKeys = new Set<string>();
    Object.entries(graph.nodes).forEach(([nodeId, node]) => {
        const def = registry[node.type];
        if (def) {
            Object.keys(def.provides).forEach(pin => validKeys.add(`${nodeId}.${pin}`));
            Object.keys(def.requires).forEach(pin => validKeys.add(`${nodeId}.${pin}`));
        }
    });

    const cleanedState: Record<string, unknown> = {};
    Object.entries(activeState).forEach(([key, value]) => {
        if (validKeys.has(key)) {
            cleanedState[key] = value;
        }
    });

    // Return frozen execution outputs, separated error log, and extracted commands
    return {
        state: Object.freeze(cleanedState) as ExecutionState,
        errors: Object.freeze(runtimeErrors),
        commands: Object.freeze(collectedCommands)
    };
};
