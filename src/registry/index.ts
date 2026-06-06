import { NodeRegistry } from './types.js';
import { PinType, NodeState, NodeMode, BlockStatement } from '../core/ast.js';
import { add, multiply, subtract, divide, modulo, sin, cos, tan, abs, round } from './math.js';
import { invertBoolean, logicAnd, logicOr, logicXor } from './logic.js';
import { delaySim, logToConsole, state } from './system.js';
import { concat as stringConcat, split as stringSplit, replace as stringReplace, length as stringLength } from './strings.js';
import { getField as objectGet, setField as objectSet, parseJson as objectParse, stringifyJson as objectStringify } from './objects.js';
import { arrayLength, arraySlice } from './arrays.js';
import { pythonScript } from './python.js';

// ============================================================================
// THE STANDARD REGISTRY EXPORT
// ============================================================================
// The execution engine matches AST node types to this dictionary 
// to resolve the pure mathematical logic required for evaluation.

export const StandardNodes: NodeRegistry = Object.freeze({
    'math/add': add,
    'math/multiply': multiply,
    'math/subtract': subtract,
    'math/divide': divide,
    'math/modulo': modulo,
    'math/sin': sin,
    'math/cos': cos,
    'math/tan': tan,
    'math/abs': abs,
    'math/round': round,
    
    'logic/not': invertBoolean,
    'logic/and': logicAnd,
    'logic/or': logicOr,
    'logic/xor': logicXor,

    'string/concat': stringConcat,
    'string/split': stringSplit,
    'string/replace': stringReplace,
    'string/length': stringLength,

    'object/get': objectGet,
    'object/set': objectSet,
    'object/parse': objectParse,
    'object/stringify': objectStringify,

    'array/length': arrayLength,
    'array/slice': arraySlice,

    'python/script': pythonScript,

    'system/delay': delaySim,
    'system/log': logToConsole,
    'system/state': state,

    'molecule/unconfigured': {
        namespace: 'molecule',
        category: 'molecule',
        name: 'unconfigured',
        requires: {},
        provides: {},
        dynamicInputs: true,
        dynamicOutputs: true,
        execute: async () => ({})
    },
    'molecule/formula': {
        namespace: 'molecule',
        category: 'molecule',
        name: 'formula',
        requires: { a: 'any', b: 'any' },
        provides: { out: 'any' },
        dynamicInputs: true,
        dynamicOutputs: true,
        execute: async () => ({ out: 0 })
    },
    'molecule/blocks': {
        namespace: 'molecule',
        category: 'molecule',
        name: 'blocks',
        requires: {},
        provides: { out: 'any' },
        dynamicInputs: true,
        dynamicOutputs: true,
        execute: async () => ({ out: 0 })
    },
    'molecule/python': {
        namespace: 'molecule',
        category: 'molecule',
        name: 'python',
        requires: { a: 'any', b: 'any', code: 'string' },
        provides: { out: 'any' },
        dynamicInputs: true,
        dynamicOutputs: true,
        execute: pythonScript.execute
    }
});

export function getNodeMode(node: { type: string; mode?: NodeMode }, registry?: NodeRegistry): NodeMode {
    if (node.mode) return node.mode;
    const isRegistered = (registry && node.type in registry) || (node.type in StandardNodes);
    if (isRegistered) {
        if (node.type === 'system/delay') return 'delay';
        if (node.type === 'system/state') return 'state';
        return 'python';
    }
    return 'formula'; // Default for legacy/all standard math/logic nodes
}

export function getDefaultFormulaForType(type: string): string {
    switch (type) {
        case 'math/add': return 'a + b';
        case 'math/multiply': return 'a * b';
        case 'math/subtract': return 'a - b';
        case 'math/divide': return 'a / b';
        case 'math/modulo': return 'a % b';
        case 'math/sin': return 'sin(a)';
        case 'math/cos': return 'cos(a)';
        case 'math/tan': return 'tan(a)';
        case 'math/abs': return 'abs(a)';
        case 'math/round': return 'round(a)';
        case 'logic/not': return 'not a';
        case 'logic/and': return 'a and b';
        case 'logic/or': return 'a or b';
        case 'logic/xor': return 'a xor b';
        case 'strings/concat': return 'concat(a, b)';
        case 'strings/split': return 'split(a, b)';
        case 'system/log': return 'msg';
        default: return '';
    }
}

export function extractVariablesFromFormula(formula: string): string[] {
    const mathBuiltins = new Set([
        'sin', 'cos', 'tan', 'abs', 'round', 'min', 'max', 'pow', 'sqrt', 'log', 'exp', 'pi', 'e',
        'true', 'false', 'null', 'undefined', 'not', 'and', 'or', 'xor', 'concat', 'split'
    ]);
    const matches = formula.match(/[a-zA-Z_][a-zA-Z0-9_]*/g) || [];
    const vars = new Set<string>();
    matches.forEach(m => {
        const lower = m.toLowerCase();
        if (!mathBuiltins.has(lower)) {
            vars.add(m);
        }
    });
    return Array.from(vars);
}

export function getBaseNodeInputs(node: NodeState, registry?: NodeRegistry): Record<string, PinType> {
    if (node.inputs) return node.inputs;
    const mode = getNodeMode(node, registry);
    switch (mode) {
        case 'delay':
            return { a: 'any', ms: 'number' };
        case 'state':
            return { value: 'any', defaultValue: 'any', nextValue: 'any' };
        case 'formula': {
            const formula = node.params.formula ?? getDefaultFormulaForType(node.type);
            const vars = extractVariablesFromFormula(formula);
            const pins: Record<string, PinType> = {};
            vars.forEach(v => {
                pins[v] = 'any';
            });
            return pins;
        }
        case 'blocks': {
            const defined = new Set<string>();
            const inputs = new Set<string>();
            (node.params.blocks || []).forEach(block => {
                const op1 = block.operand1.trim();
                const op2 = block.operand2.trim();
                if (op1 && isNaN(Number(op1)) && !defined.has(op1)) {
                    inputs.add(op1);
                }
                if (op2 && isNaN(Number(op2)) && !defined.has(op2)) {
                    inputs.add(op2);
                }
                if (block.targetVar.trim()) {
                    defined.add(block.targetVar.trim());
                }
            });
            const pins: Record<string, PinType> = {};
            inputs.forEach(v => {
                pins[v] = 'any';
            });
            return pins;
        }
        case 'python':
        default: {
            if (node.inputs) return node.inputs;
            const def = registry ? registry[node.type] : StandardNodes[node.type];
            return def ? def.requires : {};
        }
    }
}

export function getNodeInputs(node: NodeState, resolvedInputs?: Record<string, Record<string, PinType>>, registry?: NodeRegistry): Record<string, PinType> {
    if (resolvedInputs && resolvedInputs[node.id]) {
        return resolvedInputs[node.id];
    }
    return getBaseNodeInputs(node, registry);
}

export function getBaseNodeOutputs(node: NodeState, registry?: NodeRegistry): Record<string, PinType> {
    if (node.outputs) return node.outputs;
    const mode = getNodeMode(node, registry);
    switch (mode) {
        case 'delay':
            return { out: 'any' };
        case 'state':
            return { value: 'any' };
        case 'formula':
            return { out: 'any' };
        case 'blocks':
            return { out: 'any' };
        case 'python':
        default: {
            if (node.outputs) return node.outputs;
            const def = registry ? registry[node.type] : StandardNodes[node.type];
            return def ? def.provides : {};
        }
    }
}

export function getNodeOutputs(node: NodeState, resolvedOutputs?: Record<string, Record<string, PinType>>, registry?: NodeRegistry): Record<string, PinType> {
    if (resolvedOutputs && resolvedOutputs[node.id]) {
        return resolvedOutputs[node.id];
    }
    return getBaseNodeOutputs(node, registry);
}

