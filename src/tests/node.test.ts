import { describe, it, expect } from 'vitest';
import { GraphState } from '../core/ast.js';
import { evaluateGraph } from '../engine/evaluate.js';

describe('Stem Cell Node Modes', () => {
    it('should evaluate nodes in formula mode with auto-derived pins', async () => {
        const graph: GraphState = {
            nodes: {
                'node1': {
                    id: 'node1',
                    type: 'node/formula',
                    mode: 'formula',
                    params: {
                        formula: '(a + b) * c'
                    }
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

    it('should evaluate nodes in blocks mode (Scratch-like statements)', async () => {
        const graph: GraphState = {
            nodes: {
                'node1': {
                    id: 'node1',
                    type: 'node/blocks',
                    mode: 'blocks',
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
});
