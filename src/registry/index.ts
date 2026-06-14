import { NodeRegistry } from './types.js';
import { PinType, NodeState, NodeMode, BlockStatement } from '../core/ast.js';
import { pythonScript } from './python.js';

// ============================================================================
// THE STANDARD REGISTRY EXPORT
// ============================================================================
// The execution engine matches AST node types to this dictionary 
// to resolve the pure mathematical logic required for evaluation.

export const StandardNodes: NodeRegistry = Object.freeze({
    'node/unconfigured': {
        namespace: 'node',
        category: 'node',
        name: 'unconfigured',
        requires: {},
        provides: {},
        dynamicInputs: true,
        dynamicOutputs: true,
        execute: async () => ({})
    },
    'node/generic': {
        namespace: 'node',
        category: 'node',
        name: 'generic',
        requires: {},
        provides: {},
        dynamicInputs: true,
        dynamicOutputs: true,
        execute: async (inputs, params) => {
            return { ...inputs, ...params };
        }
    },
    'node/formula': {
        namespace: 'node',
        category: 'node',
        name: 'formula',
        requires: {},
        provides: { out0: 'any' },
        dynamicInputs: true,
        dynamicOutputs: true,
        execute: async () => ({ out0: 0 })
    },
    'node/blocks': {
        namespace: 'node',
        category: 'node',
        name: 'blocks',
        requires: {},
        provides: { out0: 'any' },
        dynamicInputs: true,
        dynamicOutputs: true,
        execute: async () => ({ out0: 0 })
    },
    'node/python': {
        namespace: 'node',
        category: 'node',
        name: 'python',
        requires: { code: 'string' },
        provides: { out: 'any' },
        dynamicInputs: true,
        dynamicOutputs: true,
        execute: pythonScript.execute
    },
    'system/input': {
        namespace: 'system',
        category: 'system',
        name: 'input',
        requires: { value: 'any' },
        provides: { out: 'any' },
        dynamicInputs: true,
        dynamicOutputs: true,
        execute: async (inputs, params) => {
            const raw = inputs.value !== undefined ? inputs.value : (params.value ?? '');
            if (typeof raw === 'string') {
                const trimmed = raw.trim();
                if (trimmed === 'true') return { out: true };
                if (trimmed === 'false') return { out: false };
                if (trimmed === 'null') return { out: null };
                if (trimmed !== '' && !isNaN(Number(trimmed))) return { out: Number(trimmed) };
                if ((trimmed.startsWith('[') && trimmed.endsWith(']')) || (trimmed.startsWith('{') && trimmed.endsWith('}'))) {
                    try {
                        return { out: JSON.parse(trimmed) };
                    } catch (e) {
                        // ignore
                    }
                }
                return { out: raw };
            }
            return { out: raw };
        }
    },
    'system/delay': {
        namespace: 'system',
        category: 'system',
        name: 'delay',
        requires: { in0: 'any', ms: 'number' },
        provides: { out: 'any' },
        dynamicInputs: true,
        dynamicOutputs: true,
        execute: async (inputs, params, signal) => {
            const ms = Number(inputs.ms ?? params.delayMs ?? 1000);
            await new Promise((resolve, reject) => {
                const t = setTimeout(resolve, ms);
                signal?.addEventListener('abort', () => {
                    clearTimeout(t);
                    reject(new Error('Aborted'));
                });
            });
            return { out: inputs.in0 };
        }
    },
    'system/state': {
        namespace: 'system',
        category: 'system',
        name: 'state',
        requires: { value: 'any', defaultValue: 'any', nextValue: 'any' },
        provides: { value: 'any' },
        dynamicInputs: true,
        dynamicOutputs: true,
        execute: async (inputs, params) => {
            return { value: inputs.value ?? inputs.defaultValue };
        }
    },
    'system/log': {
        namespace: 'system',
        category: 'system',
        name: 'log',
        requires: { msg: 'any' },
        provides: {},
        dynamicInputs: true,
        dynamicOutputs: true,
        execute: async (inputs) => {
            console.log('LOG NODE OUTPUT:', inputs.msg);
            return {
                $commands: [{
                    type: 'CONSOLE_LOG',
                    payload: { message: inputs.msg !== undefined ? String(inputs.msg) : '' }
                }]
            };
        }
    }
});

/**
 * Resolves the functional execution mode of a node.
 * 
 * ============================================================================
 * LEGO BASE PLATE / BREADBOARD ARCHITECTURE (AI & HUMAN NOTES)
 * ============================================================================
 * In this system, user-spawned nodes are unified under a single structural type:
 * `node/generic`. The specialization of a node (e.g. math formula, state cell, 
 * python script) is determined solely by its `mode` parameter.
 * 
 * Resolution Priority:
 * 1. Node Mode Override: If `node.mode` is explicitly set, we return it.
 * 2. Type-based defaults: Legacy/built-in type names map directly to modes.
 * 3. Registry Lookup: Registered custom nodes default to 'python' unless 
 *    explicitly mapping to system behaviors like delay or state.
 * 4. General Default: Falls back to 'formula'.
 * ============================================================================
 */
export function getNodeMode(node: { type: string; mode?: NodeMode }, registry?: NodeRegistry): NodeMode {
    if (node.mode) return node.mode;

    // Map default modes based on node type
    if (node.type === 'node/formula') return 'formula';
    if (node.type === 'node/blocks') return 'blocks';
    if (node.type === 'node/python') return 'python';
    if (node.type === 'node/unconfigured') return 'formula';
    if (node.type === 'node/generic') return 'formula';

    const isRegistered = (registry && node.type in registry) || (node.type in StandardNodes);
    if (isRegistered) {
        if (node.type === 'system/delay') return 'delay';
        if (node.type === 'system/state') return 'state';
        return 'python';
    }
    return 'formula'; // Default for legacy/all standard math/logic nodes
}

export function getDefaultFormulaForType(type: string): string {
    return '';
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

export function getModeBaseInputs(mode: NodeMode, node: NodeState, registry?: NodeRegistry): Record<string, PinType> {
    switch (mode) {
        case 'delay':
            return { in0: 'any', ms: 'number' };
        case 'state':
            return { value: 'any', defaultValue: 'any', nextValue: 'any' };
        case 'formula': {
            const formula = (node.params && node.params.formula) ?? getDefaultFormulaForType(node.type);
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
            ((node.params && node.params.blocks) || []).forEach(block => {
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
            if (node.type === 'node/generic') {
                return {};
            }
            if (node.type === 'node/python') {
                return { code: 'string' };
            }
            {
                const def = registry ? registry[node.type] : StandardNodes[node.type];
                return def ? def.requires : {};
            }
        case 'input':
            return { value: 'any' };
        case 'log':
            return { msg: 'any' };
        default: {
            const def = registry ? registry[node.type] : StandardNodes[node.type];
            return def ? def.requires : {};
        }
    }
}

export function getBaseNodeInputs(node: NodeState, registry?: NodeRegistry): Record<string, PinType> {
    const mode = getNodeMode(node, registry);
    const base = getModeBaseInputs(mode, node, registry);
    return { ...base, ...(node.inputs ?? {}) };
}

export function getNodeInputs(node: NodeState, resolvedInputs?: Record<string, Record<string, PinType>>, registry?: NodeRegistry): Record<string, PinType> {
    if (resolvedInputs && resolvedInputs[node.id]) {
        return resolvedInputs[node.id];
    }
    return getBaseNodeInputs(node, registry);
}

export function getModeBaseOutputs(mode: NodeMode, nodeType: string, registry?: NodeRegistry): Record<string, PinType> {
    switch (mode) {
        case 'delay':
            return { out: 'any' };
        case 'state':
            return { value: 'any' };
        case 'formula':
            return { out0: 'any' };
        case 'blocks':
            return { out0: 'any' };
        case 'python':
            if (nodeType === 'node/generic' || nodeType === 'node/python') {
                return { out: 'any' };
            }
            {
                const def = registry ? registry[nodeType] : StandardNodes[nodeType];
                return def ? def.provides : {};
            }
        case 'input':
            return { out: 'any' };
        case 'log':
            return {};
        default: {
            const def = registry ? registry[nodeType] : StandardNodes[nodeType];
            return def ? def.provides : {};
        }
    }
}

export function getBaseNodeOutputs(node: NodeState, registry?: NodeRegistry): Record<string, PinType> {
    const mode = getNodeMode(node, registry);
    const base = getModeBaseOutputs(mode, node.type, registry);
    return { ...base, ...(node.outputs ?? {}) };
}

export function getNodeOutputs(node: NodeState, resolvedOutputs?: Record<string, Record<string, PinType>>, registry?: NodeRegistry): Record<string, PinType> {
    if (resolvedOutputs && resolvedOutputs[node.id]) {
        return resolvedOutputs[node.id];
    }
    return getBaseNodeOutputs(node, registry);
}

