import { GraphState, NodeID, Edge } from '../core/ast.js';
import { ExecutionState, EngineConfig, ExecutionResult, Middleware, NodeExecuteFn } from './types.js';
import { NodeRegistry } from '../registry/types.js';
import { Command } from '../events/types.js';
import { sortTopologically } from './topology.js';
import { getGraphValidationErrors, resolveGraphTypes } from './validation.js';
import { getNodeInputs, getNodeOutputs, getNodeMode, getDefaultFormulaForType } from '../registry/index.js';

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

    // Resolve dynamic types across connections
    const resolvedTypes = resolveGraphTypes(graph, registry);
    
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
        if (node.type === 'node/unconfigured') {
            return;
        }
        const mode = getNodeMode(node, registry);
        const nodeDef = registry[node.type];
        
        if (!nodeDef && (mode === 'python' || mode === 'delay' || mode === 'state')) {
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
        
        // 1. Initialize with manually typed values from node.params
        Object.keys(getNodeInputs(node, resolvedTypes.inputs, registry)).forEach(pinName => {
            if (node.params && node.params[pinName] !== undefined) {
                resolvedInputs[pinName] = node.params[pinName];
            }
        });

        // 2. Override with any root inputs from active global state (like manually typed values) (Fix #3)
        Object.keys(getNodeInputs(node, resolvedTypes.inputs, registry)).forEach(pinName => {
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
            switch (mode) {
                case 'python':
                case 'delay':
                case 'state': {
                    return nodeDef!.execute(inputs, params, signal) as Promise<Record<string, unknown>>;
                }
                case 'formula': {
                    const formula = ((params as any).formula as string | undefined) ?? getDefaultFormulaForType(node.type);
                    const result = evaluateFormulaExpression(formula, inputs);
                    return { out0: result };
                }
                case 'blocks': {
                    const result = evaluateBlockExpression(((params as any).blocks as ReadonlyArray<any> | undefined) ?? [], inputs);
                    return { out0: result };
                }
                default: {
                    if (nodeDef && typeof nodeDef.execute === 'function') {
                        return nodeDef.execute(inputs, params, signal) as Promise<Record<string, unknown>>;
                    }
                    throw new Error(`Engine Error: Unsupported mode "${mode}"`);
                }
            }
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

        Object.keys(getNodeOutputs(node, resolvedTypes.outputs, registry)).forEach(outputPin => {
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
        Object.keys(getNodeOutputs(node, resolvedTypes.outputs, registry)).forEach(pin => validKeys.add(`${nodeId}.${pin}`));
        Object.keys(getNodeInputs(node, resolvedTypes.inputs, registry)).forEach(pin => validKeys.add(`${nodeId}.${pin}`));
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

function tryNumberCoerce(val: any): any {
    if (typeof val === 'string') {
        const trimmed = val.trim();
        if (trimmed !== '' && !isNaN(Number(trimmed))) {
            return Number(trimmed);
        }
    }
    return val;
}

export function evaluateFormulaExpression(formula: string, inputs: Record<string, any>): any {
    let pos = 0;
    const cleanFormula = formula.trim();

    function peek() {
        return cleanFormula[pos] || '';
    }

    function consume(char: string) {
        if (peek() === char) {
            pos++;
            return true;
        }
        return false;
    }

    function skipWhitespace() {
        while (pos < cleanFormula.length && /\s/.test(cleanFormula[pos])) {
            pos++;
        }
    }

    function parsePrimary(): any {
        skipWhitespace();
        
        if (consume('(')) {
            const val = parseExpression();
            skipWhitespace();
            if (!consume(')')) {
                throw new Error("Missing closing parenthesis");
            }
            return val;
        }

        const start = pos;
        if (/[a-zA-Z_]/.test(peek())) {
            while (pos < cleanFormula.length && /[a-zA-Z0-9_]/.test(peek())) {
                pos++;
            }
            const word = cleanFormula.substring(start, pos);
            skipWhitespace();
            
            if (peek() === '(') {
                consume('(');
                const args: any[] = [];
                if (peek() !== ')') {
                    args.push(parseExpression());
                    skipWhitespace();
                    while (consume(',')) {
                        args.push(parseExpression());
                        skipWhitespace();
                    }
                }
                if (!consume(')')) {
                    throw new Error(`Missing closing parenthesis in function call '${word}'`);
                }
                
                const fn = word.toLowerCase();
                switch (fn) {
                    case 'sin': return Math.sin(args[0]);
                    case 'cos': return Math.cos(args[0]);
                    case 'tan': return Math.tan(args[0]);
                    case 'abs': return Math.abs(args[0]);
                    case 'round': return Math.round(args[0]);
                    case 'sqrt': return Math.sqrt(args[0]);
                    case 'min': return Math.min(...args);
                    case 'max': return Math.max(...args);
                    case 'concat': return args.join('');
                    case 'split': return String(args[0]).split(args[1]);
                    default:
                        throw new Error(`Unknown function: ${word}`);
                }
            }
            
            if (word === 'true') return true;
            if (word === 'false') return false;
            
            if (word in inputs) {
                return inputs[word];
            }
            if (word.toLowerCase() === 'pi') return Math.PI;
            if (word.toLowerCase() === 'e') return Math.E;
            
            return 0;
        }

        if (/[0-9.]/.test(peek())) {
            while (pos < cleanFormula.length && /[0-9.]/.test(peek())) {
                pos++;
            }
            return parseFloat(cleanFormula.substring(start, pos));
        }

        if (consume('-')) {
            return -parsePrimary();
        }
        if (consume('+')) {
            return parsePrimary();
        }

        throw new Error(`Unexpected character: '${peek()}' at position ${pos}`);
    }

    function parseMultiplicative(): any {
        let val = parsePrimary();
        skipWhitespace();
        while (true) {
            if (consume('*')) {
                val = Number(tryNumberCoerce(val)) * Number(tryNumberCoerce(parsePrimary()));
            } else if (consume('/')) {
                val = Number(tryNumberCoerce(val)) / Number(tryNumberCoerce(parsePrimary()));
            } else if (consume('%')) {
                val = Number(tryNumberCoerce(val)) % Number(tryNumberCoerce(parsePrimary()));
            } else {
                break;
            }
            skipWhitespace();
        }
        return val;
    }

    function parseAdditive(): any {
        let val = parseMultiplicative();
        skipWhitespace();
        while (true) {
            if (consume('+')) {
                const nextVal = parseMultiplicative();
                const cVal = tryNumberCoerce(val);
                const cNext = tryNumberCoerce(nextVal);
                if (typeof cVal === 'number' && typeof cNext === 'number') {
                    val = cVal + cNext;
                } else {
                    val = String(val) + String(nextVal);
                }
            } else if (consume('-')) {
                val = Number(tryNumberCoerce(val)) - Number(tryNumberCoerce(parseMultiplicative()));
            } else {
                break;
            }
            skipWhitespace();
        }
        return val;
    }

    function parseComparison(): any {
        let val = parseAdditive();
        skipWhitespace();
        if (consume('=')) {
            consume('=');
            const nextVal = parseAdditive();
            const cVal = tryNumberCoerce(val);
            const cNext = tryNumberCoerce(nextVal);
            val = (cVal == cNext);
        } else if (consume('<')) {
            if (consume('=')) {
                const nextVal = parseAdditive();
                const cVal = tryNumberCoerce(val);
                const cNext = tryNumberCoerce(nextVal);
                val = (cVal <= cNext);
            } else {
                const nextVal = parseAdditive();
                const cVal = tryNumberCoerce(val);
                const cNext = tryNumberCoerce(nextVal);
                val = (cVal < cNext);
            }
        } else if (consume('>')) {
            if (consume('=')) {
                const nextVal = parseAdditive();
                const cVal = tryNumberCoerce(val);
                const cNext = tryNumberCoerce(nextVal);
                val = (cVal >= cNext);
            } else {
                const nextVal = parseAdditive();
                const cVal = tryNumberCoerce(val);
                const cNext = tryNumberCoerce(nextVal);
                val = (cVal > cNext);
            }
        }
        return val;
    }

    function parseExpression(): any {
        return parseComparison();
    }

    const result = parseExpression();
    skipWhitespace();
    if (pos < cleanFormula.length) {
        throw new Error(`Unexpected trailing characters starting at position ${pos}`);
    }
    return result;
}

export function evaluateBlockExpression(blocks: ReadonlyArray<any>, inputs: Record<string, any>): any {
    const scope: Record<string, any> = { ...inputs };
    let lastTargetVar = '';
    
    for (const block of blocks) {
        const target = block.targetVar.trim();
        if (!target) continue;
        
        const op1Str = block.operand1.trim();
        const op2Str = block.operand2.trim();
        
        const val1Raw = isNaN(Number(op1Str)) ? (scope[op1Str] ?? 0) : Number(op1Str);
        const val2Raw = isNaN(Number(op2Str)) ? (scope[op2Str] ?? 0) : Number(op2Str);
        
        const val1 = tryNumberCoerce(val1Raw);
        const val2 = tryNumberCoerce(val2Raw);
        
        let res: any = 0;
        switch (block.operator) {
            case '+': 
                if (typeof val1 === 'number' && typeof val2 === 'number') {
                    res = val1 + val2;
                } else {
                    res = String(val1) + String(val2);
                }
                break;
            case '-': res = Number(val1) - Number(val2); break;
            case '*': res = Number(val1) * Number(val2); break;
            case '/': res = Number(val1) / Number(val2); break;
            case 'and': res = Boolean(val1) && Boolean(val2); break;
            case 'or': res = Boolean(val1) || Boolean(val2); break;
            case '==': res = val1 == val2; break;
            default: res = 0;
        }
        scope[target] = res;
        lastTargetVar = target;
    }
    
    return scope['out'] !== undefined ? scope['out'] : (lastTargetVar ? scope[lastTargetVar] : 0);
}
