import { NodeFunction, NodeRegistry } from './types.js';

// ============================================================================
// 1. PURE FUNCTIONAL NODE IMPLEMENTATIONS
// ============================================================================
// Every function must be 100% deterministic, completely stateless, 
// and cause zero side-effects.

const add: NodeFunction = (inputs, params) => {
    const a = (inputs.a as number) ?? 0;
    const b = (inputs.b as number) ?? 0;
    return { out: a + b };
};

const multiply: NodeFunction = (inputs, params) => {
    const a = (inputs.a as number) ?? 1;
    const b = (inputs.b as number) ?? 1;
    return { out: a * b };
};

const invertBoolean: NodeFunction = (inputs, params) => {
    const a = (inputs.a as boolean) ?? false;
    return { out: !a };
};

const delaySim: NodeFunction = async (inputs, params) => {
    const delayMs = (params.ms as number) ?? 1000;
    const a = inputs.a;
    
    // Simulate an async computational/API delay
    await new Promise(resolve => setTimeout(resolve, delayMs));
    
    return { out: a };
};

// ============================================================================
// 2. THE STANDARD REGISTRY EXPORT
// ============================================================================
// The execution engine matches AST node types to this dictionary 
// to resolve the pure mathematical logic required for evaluation.

export const StandardNodes: NodeRegistry = Object.freeze({
    'math/add': add,
    'math/multiply': multiply,
    'logic/not': invertBoolean,
    'system/delay': delaySim
});
