import { NodeRegistry } from './types.js';
import { PinType, NodeState, BlockStatement } from '../core/ast.js';
import { pythonScript } from './python.js';
import { 
    evaluateFormulaExpression, 
    evaluateBlockExpression, 
    extractVariablesFromFormula,
    getDefaultFormulaForType
} from '../engine/expressions.js';

export { extractVariablesFromFormula, getDefaultFormulaForType } from '../engine/expressions.js';

export interface ActionDefinition {
    readonly requires: Record<string, PinType>;
    readonly provides: Record<string, PinType>;
    readonly execute: (inputs: Record<string, any>, params: Record<string, any>, signal?: AbortSignal) => any;
}

// ============================================================================
// THE STANDARD ACTIONS REGISTRY
// ============================================================================
export const StandardActions: Record<string, ActionDefinition> = {
    'formula': {
        requires: {},
        provides: { out0: 'any' },
        execute: async (inputs, params) => {
            const formula = (params.formula as string | undefined) || '';
            const result = evaluateFormulaExpression(formula, inputs);
            return { out0: result };
        }
    },
    'blocks': {
        requires: {},
        provides: { out0: 'any' },
        execute: async (inputs, params) => {
            const result = evaluateBlockExpression((params.blocks as ReadonlyArray<BlockStatement> | undefined) || [], inputs);
            return { out0: result };
        }
    },
    'python': {
        requires: { code: 'string' },
        provides: { out: 'any' },
        execute: async (inputs, params, signal) => {
            return pythonScript.execute(inputs, params as any, signal);
        }
    },
    'system/input': {
        requires: { value: 'any' },
        provides: { out: 'any' },
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
        requires: { in0: 'any', ms: 'number' },
        provides: { out: 'any' },
        execute: async (inputs, params, signal) => {
            const ms = Number(inputs.ms ?? params.delayMs ?? params.ms ?? 1000);
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
        requires: { value: 'any', defaultValue: 'any', nextValue: 'any' },
        provides: { value: 'any' },
        execute: async (inputs, params) => {
            return { value: inputs.value ?? inputs.defaultValue };
        }
    },
    'system/log': {
        requires: { msg: 'any' },
        provides: {},
        execute: async (inputs) => {
            console.log('LOG NODE OUTPUT:', inputs.msg);
            return {
                $commands: [{
                    type: 'CONSOLE_LOG',
                    payload: { message: inputs.msg !== undefined ? String(inputs.msg) : '' }
                }]
            };
        }
    },
    'database/table': {
        requires: {},
        provides: {},
        execute: async (inputs, params) => {
            return { rows: params.rows || [] };
        }
    },
    'database/filter': {
        requires: { dataset: 'any' },
        provides: { dataset: 'any' },
        execute: async (inputs, params) => {
            const rows = (inputs.dataset || []) as any[];
            const col = params.column as string;
            const op = (params.operator || '=') as string;
            const val = params.value;

            if (!col) return { dataset: rows };

            const filtered = rows.filter((row: any) => {
                const rowVal = row[col];
                if (rowVal === undefined) return false;
                
                switch (op) {
                    case '=': return String(rowVal) === String(val);
                    case '!=': return String(rowVal) !== String(val);
                    case '>': return Number(rowVal) > Number(val);
                    case '<': return Number(rowVal) < Number(val);
                    case 'LIKE': return String(rowVal).toLowerCase().includes(String(val).toLowerCase());
                    default: return false;
                }
            });

            return { dataset: filtered };
        }
    }
};

// ============================================================================
// THE STANDARD NODES REGISTRY (Nodes are holders of actions)
// ============================================================================
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
    'node': {
        namespace: 'node',
        category: 'node',
        name: 'generic',
        requires: {},
        provides: {},
        dynamicInputs: true,
        dynamicOutputs: true,
        execute: async (
            inputs: Record<string, unknown>, 
            params: Record<string, unknown>, 
            signal?: AbortSignal, 
            context?: { actions?: ReadonlyArray<any> }
        ) => {
            const actions = context?.actions || [];
            let currentScope = { ...inputs };
            let collectedCommands: any[] = [];
            
            for (const action of actions) {
                let actionDef = StandardActions[action.type];
                
                // Fallback to workspace execution or custom registry
                if (!actionDef && action.type.startsWith('workspace/')) {
                    const customDef = CustomRegistry[action.type];
                    if (customDef) {
                        actionDef = {
                            requires: customDef.requires,
                            provides: customDef.provides,
                            execute: customDef.execute
                        };
                    }
                }
                
                if (actionDef) {
                    const actionParams = action.params || {};
                    const actionOutputs = await actionDef.execute(currentScope, actionParams, signal);
                    
                    if (actionOutputs && typeof actionOutputs === 'object') {
                        if (Array.isArray(actionOutputs.$commands)) {
                            collectedCommands.push(...actionOutputs.$commands);
                        }
                        currentScope = { ...currentScope, ...actionOutputs };
                    }
                }
            }
            if (collectedCommands.length > 0) {
                currentScope.$commands = collectedCommands;
            }
            return currentScope;
        }
    },
    'composite/input': {
        namespace: 'composite',
        category: 'composite',
        name: 'input',
        requires: {},
        provides: { out: 'any' },
        dynamicInputs: true,
        dynamicOutputs: true,
        execute: async (inputs, params) => {
            return { out: inputs.value ?? params.value ?? null };
        }
    },
    'composite/output': {
        namespace: 'composite',
        category: 'composite',
        name: 'output',
        requires: { in: 'any' },
        provides: { value: 'any' },
        dynamicInputs: true,
        dynamicOutputs: true,
        execute: async (inputs) => {
            return { value: inputs.in };
        }
    },
    'formula': {
        namespace: 'node',
        category: 'action',
        name: 'formula',
        requires: {},
        provides: { out0: 'any' },
        dynamicInputs: true,
        dynamicOutputs: true,
        execute: async (inputs, params) => {
            const formula = (params.formula as string | undefined) || '';
            const result = evaluateFormulaExpression(formula, inputs);
            return { out0: result };
        }
    },
    'blocks': {
        namespace: 'node',
        category: 'action',
        name: 'blocks',
        requires: {},
        provides: { out0: 'any' },
        dynamicInputs: true,
        dynamicOutputs: true,
        execute: async (inputs, params) => {
            const result = evaluateBlockExpression((params.blocks as ReadonlyArray<BlockStatement> | undefined) || [], inputs);
            return { out0: result };
        }
    },
    'python': {
        namespace: 'node',
        category: 'action',
        name: 'python',
        requires: { code: 'string' },
        provides: { out: 'any' },
        dynamicInputs: true,
        dynamicOutputs: true,
        execute: async (inputs, params, signal) => {
            return pythonScript.execute(inputs, params as any, signal);
        }
    },
    'system/input': {
        namespace: 'system',
        category: 'action',
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
        category: 'action',
        name: 'delay',
        requires: { in0: 'any', ms: 'number' },
        provides: { out: 'any' },
        dynamicInputs: true,
        dynamicOutputs: true,
        execute: async (inputs, params, signal) => {
            const ms = Number(inputs.ms ?? params.delayMs ?? params.ms ?? 1000);
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
        category: 'action',
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
        category: 'action',
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
    },
    'database/table': {
        namespace: 'database',
        category: 'action',
        name: 'table',
        requires: {},
        provides: {},
        dynamicInputs: true,
        dynamicOutputs: true,
        execute: async (inputs, params) => {
            return { rows: params.rows || [] };
        }
    },
    'database/filter': {
        namespace: 'database',
        category: 'action',
        name: 'filter',
        requires: { dataset: 'any' },
        provides: { dataset: 'any' },
        dynamicInputs: true,
        dynamicOutputs: true,
        execute: async (inputs, params) => {
            const rows = (inputs.dataset || []) as any[];
            const col = params.column as string;
            const op = (params.operator || '=') as string;
            const val = params.value;

            if (!col) return { dataset: rows };

            const filtered = rows.filter((row: any) => {
                const rowVal = row[col];
                if (rowVal === undefined) return false;
                
                switch (op) {
                    case '=': return String(rowVal) === String(val);
                    case '!=': return String(rowVal) !== String(val);
                    case '>': return Number(rowVal) > Number(val);
                    case '<': return Number(rowVal) < Number(val);
                    case 'LIKE': return String(rowVal).toLowerCase().includes(String(val).toLowerCase());
                    default: return false;
                }
            });

            return { dataset: filtered };
        }
    }
});

export const CustomRegistry: Record<string, any> = {};

export function getNodeInputs(node: NodeState, resolvedInputs?: Record<string, Record<string, PinType>>, registry?: NodeRegistry): Record<string, PinType> {
    if (resolvedInputs && resolvedInputs[node.id]) {
        return resolvedInputs[node.id];
    }
    
    if (node.type === 'composite/input' || node.type === 'composite/output') {
        const def = registry ? registry[node.type] : (StandardNodes[node.type] || CustomRegistry[node.type]);
        return { ...(def ? def.requires : {}), ...(node.inputs ?? {}) };
    }

    // Generic node containing actions: derive inputs from consumed action variables
    const localVars = new Set<string>();
    const externalInputs: Record<string, PinType> = {};
    
    const actions = node.actions || [];
    actions.forEach(action => {
        let actionDef = StandardActions[action.type];
        if (!actionDef && action.type.startsWith('workspace/')) {
            const customDef = CustomRegistry[action.type];
            if (customDef) {
                actionDef = {
                    requires: customDef.requires,
                    provides: customDef.provides,
                    execute: customDef.execute
                };
            }
        }

        let actionRequired: string[] = [];

        if (action.type === 'formula') {
            const formula = (action.params && action.params.formula) || '';
            actionRequired = extractVariablesFromFormula(formula);
        } else if (action.type === 'blocks') {
            const defined = new Set<string>();
            const inputs = new Set<string>();
            ((action.params && action.params.blocks) || []).forEach((block: any) => {
                const op1 = block.operand1?.trim();
                const op2 = block.operand2?.trim();
                if (op1 && isNaN(Number(op1)) && !defined.has(op1)) { inputs.add(op1); }
                if (op2 && isNaN(Number(op2)) && !defined.has(op2)) { inputs.add(op2); }
                if (block.targetVar?.trim()) { defined.add(block.targetVar.trim()); }
            });
            actionRequired = Array.from(inputs);
        } else if (actionDef) {
            actionRequired = Object.keys(actionDef.requires);
        }

        actionRequired.forEach(v => {
            if (!localVars.has(v)) {
                externalInputs[v] = 'any';
            }
        });

        // Accumulate outputs
        let actionProvided: string[] = [];
        if (action.type === 'formula' || action.type === 'blocks') {
            actionProvided = ['out0'];
        } else if (action.type === 'python') {
            actionProvided = ['out'];
        } else if (actionDef) {
            actionProvided = Object.keys(actionDef.provides);
        }
        actionProvided.forEach(v => localVars.add(v));
    });

    return { ...externalInputs, ...(node.inputs ?? {}) };
}

export function getNodeOutputs(node: NodeState, resolvedOutputs?: Record<string, Record<string, PinType>>, registry?: NodeRegistry): Record<string, PinType> {
    if (resolvedOutputs && resolvedOutputs[node.id]) {
        return resolvedOutputs[node.id];
    }
    
    if (node.type === 'composite/input' || node.type === 'composite/output') {
        const def = registry ? registry[node.type] : (StandardNodes[node.type] || CustomRegistry[node.type]);
        return { ...(def ? def.provides : {}), ...(node.outputs ?? {}) };
    }

    // Generic node containing actions: union of all outputs produced by actions
    const outputs: Record<string, PinType> = {};
    const actions = node.actions || [];
    actions.forEach(action => {
        let actionDef = StandardActions[action.type];
        if (!actionDef && action.type.startsWith('workspace/')) {
            const customDef = CustomRegistry[action.type];
            if (customDef) {
                actionDef = {
                    requires: customDef.requires,
                    provides: customDef.provides,
                    execute: customDef.execute
                };
            }
        }

        if (action.type === 'formula' || action.type === 'blocks') {
            outputs['out0'] = 'any';
        } else if (action.type === 'python') {
            outputs['out'] = 'any';
        } else if (actionDef) {
            Object.keys(actionDef.provides).forEach(pin => {
                outputs[pin] = actionDef.provides[pin];
            });
        }
    });

    return { ...outputs, ...(node.outputs ?? {}) };
}
