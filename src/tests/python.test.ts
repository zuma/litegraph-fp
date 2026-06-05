import { describe, it, expect } from 'vitest';
import { GraphState } from '../core/ast.js';
import { evaluateGraph } from '../engine/evaluate.js';
import { StandardNodes } from '../registry/index.js';

describe('Python Script Node', () => {
    it('should execute python code and return calculated outputs', async () => {
        const graph: GraphState = {
            nodes: {
                'py1': {
                    id: 'py1',
                    type: 'python/script',
                    params: {
                        code: `
def execute(inputs):
    a = inputs.get('a', 0)
    b = inputs.get('b', 0)
    return { 'out': a * b + 10 }
`
                    }
                }
            },
            edges: []
        };

        const initialInputs = {
            'py1.a': 5,
            'py1.b': 6
        };

        const config = { executionMode: 'serial' as const, nodeTimeoutMs: 2000 };
        const result = await evaluateGraph(graph, initialInputs, StandardNodes, config);

        expect(result.errors['py1']).toBeUndefined();
        expect(result.state['py1.out']).toBe(40); // 5 * 6 + 10 = 40
    });

    it('should capture compilation/execution errors in python script', async () => {
        const graph: GraphState = {
            nodes: {
                'py1': {
                    id: 'py1',
                    type: 'python/script',
                    params: {
                        code: `
def execute(inputs):
    # Syntax error / NameError
    return { 'out': undefined_variable }
`
                    }
                }
            },
            edges: []
        };

        const config = { executionMode: 'serial' as const, nodeTimeoutMs: 2000 };
        const result = await evaluateGraph(graph, {}, StandardNodes, config);

        expect(result.errors['py1']).toBeDefined();
        expect(result.errors['py1']).toContain('name \'undefined_variable\' is not defined');
    });
});
