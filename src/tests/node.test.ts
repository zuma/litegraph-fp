import { describe, it, expect } from 'vitest';
import { GraphState } from '../core/ast.js';
import { evaluateGraph } from '../engine/evaluate.js';

describe('Generic Node Action Containers', () => {
    it('should evaluate nodes in formula action with auto-derived pins', async () => {
        const graph: GraphState = {
            nodes: {
                'node1': {
                    id: 'node1',
                    type: 'formula',
                    inputs: { a: 'any', b: 'any', c: 'any' },
                    outputs: { out0: 'any' },
                    params: { formula: '(a + b) * c' }
                }
            },
            edges: []
        };

        // Inputs provided directly as activeState values
        const inputs = {
            'node1.a': 10,
            'node1.b': 20,
            'node1.c': 3
        };

        const result = await evaluateGraph(graph, inputs, {}, { executionMode: 'serial' });
        
        // Expected: (10 + 20) * 3 = 90
        expect(result.state['node1.out0']).toBe(90);
    });

    it('should evaluate nodes in blocks action (Scratch-like statements)', async () => {
        const graph: GraphState = {
            nodes: {
                'node1': {
                    id: 'node1',
                    type: 'blocks',
                    inputs: { a: 'any', b: 'any', c: 'any' },
                    outputs: { out0: 'any' },
                    params: {
                        blocks: [
                            { id: 'b1', targetVar: 'temp', operand1: 'a', operator: '+', operand2: 'b' },
                            { id: 'b2', targetVar: 'out0', operand1: 'temp', operator: '*', operand2: 'c' }
                        ]
                    }
                }
            },
            edges: []
        };

        const inputs = {
            'node1.a': 5,
            'node1.b': 3,
            'node1.c': 10
        };

        const result = await evaluateGraph(graph, inputs, {}, { executionMode: 'serial' });

        // Expected: (5 + 3) * 10 = 80
        expect(result.state['node1.out0']).toBe(80);
    });

    it('should expose interactive actions on action registry definitions', async () => {
        const { StandardActions } = await import('../registry/index.js');
        const stateActionDef = StandardActions['system/state'];
        expect(stateActionDef).toBeDefined();

        const logActionDef = StandardActions['system/log'];
        expect(logActionDef).toBeDefined();

        const tableActionDef = StandardActions['database/table'];
        expect(tableActionDef).toBeDefined();
    });
});
