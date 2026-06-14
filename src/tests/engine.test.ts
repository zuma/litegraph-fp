import { describe, it, expect } from 'vitest';
import { GraphState } from '../core/ast.js';
import { evaluateGraph } from '../engine/evaluate.js';
import { StandardNodes } from '../registry/index.js';

describe('Engine Feedback Loops', () => {
    it('should support feedback loops via system/state nodes', async () => {
        // Simple counter graph:
        // stateNode (value) -> addNode(1) -> stateNode (nextValue)
        const graph: GraphState = {
            nodes: {
                'state1': {
                    id: 'state1',
                    type: 'system/state',
                    params: { defaultValue: 0 }
                },
                'add1': {
                    id: 'add1',
                    type: 'node/formula',
                    mode: 'formula',
                    params: { formula: 'a + 1' }
                }
            },
            edges: [
                {
                    id: 'e1',
                    sourceNodeId: 'state1',
                    sourcePinId: 'value',
                    targetNodeId: 'add1',
                    targetPinId: 'a'
                },
                {
                    id: 'e2',
                    sourceNodeId: 'add1',
                    sourcePinId: 'out0',
                    targetNodeId: 'state1',
                    targetPinId: 'nextValue'
                }
            ]
        };

        const config = { executionMode: 'serial' as const, nodeTimeoutMs: 1000 };
        const registry = StandardNodes;

        // Tick 1
        let result = await evaluateGraph(graph, {}, registry, config);
        // add1.a = state1.value (0)
        // add1.out = 0 + 1 = 1
        // state1.nextValue = 1
        // Phase 2: state1.value = 1
        expect(result.state['state1.value']).toBe(1);

        // Tick 2 (feed the state back in)
        result = await evaluateGraph(graph, result.state, registry, config);
        expect(result.state['state1.value']).toBe(2);

        // Tick 3
        result = await evaluateGraph(graph, result.state, registry, config);
        expect(result.state['state1.value']).toBe(3);
    });

    it('should not throw circular dependency error for state node nextValue edges', async () => {
        const graph: GraphState = {
            nodes: {
                'state1': { id: 'state1', type: 'system/state', params: { defaultValue: 100 } },
                'add1': { id: 'add1', type: 'node/formula', mode: 'formula', params: { formula: 'a + 1' } }
            },
            edges: [
                { id: 'e1', sourceNodeId: 'state1', sourcePinId: 'value', targetNodeId: 'add1', targetPinId: 'a' },
                { id: 'e2', sourceNodeId: 'add1', sourcePinId: 'out0', targetNodeId: 'state1', targetPinId: 'nextValue' }
            ]
        };

        const result = await evaluateGraph(graph, {}, StandardNodes, { executionMode: 'serial', nodeTimeoutMs: 1000 });
        expect(result.errors['__global__']).toBeUndefined();
    });

    it('should not throw circular dependency error for generic state mode node nextValue edges and accumulate state', async () => {
        const graph: GraphState = {
            nodes: {
                'state1': { id: 'state1', type: 'node/generic', mode: 'state', params: { defaultValue: 100 } },
                'add1': { id: 'add1', type: 'node/generic', mode: 'formula', params: { formula: 'a + 1' } }
            },
            edges: [
                { id: 'e1', sourceNodeId: 'state1', sourcePinId: 'value', targetNodeId: 'add1', targetPinId: 'a' },
                { id: 'e2', sourceNodeId: 'add1', sourcePinId: 'out0', targetNodeId: 'state1', targetPinId: 'nextValue' }
            ]
        };

        const config = { executionMode: 'serial' as const, nodeTimeoutMs: 1000 };
        const registry = StandardNodes;

        // Tick 1
        let result = await evaluateGraph(graph, {}, registry, config);
        expect(result.errors['__global__']).toBeUndefined();
        expect(result.state['state1.value']).toBe(101);

        // Tick 2
        result = await evaluateGraph(graph, result.state, registry, config);
        expect(result.state['state1.value']).toBe(102);

        // Tick 3
        result = await evaluateGraph(graph, result.state, registry, config);
        expect(result.state['state1.value']).toBe(103);
    });



    it('should not throw on mismatching types during static validation', async () => {
        const customRegistry = {
            'custom/prod': {
                namespace: 'custom',
                category: 'test',
                name: 'prod',
                requires: {},
                provides: { out: 'number' },
                execute: () => ({ out: 1 })
            },
            'custom/cons': {
                namespace: 'custom',
                category: 'test',
                name: 'cons',
                requires: { a: 'boolean' },
                provides: {},
                execute: () => ({})
            }
        };
        const graph: GraphState = {
            nodes: {
                'nodeC': { id: 'nodeC', type: 'custom/prod', params: {} },
                'nodeD': { id: 'nodeD', type: 'custom/cons', params: {} }
            },
            edges: [
                { id: 'edge3', sourceNodeId: 'nodeC', sourcePinId: 'out', targetNodeId: 'nodeD', targetPinId: 'a' }
            ]
        };

        const result = await evaluateGraph(graph, {}, customRegistry, { executionMode: 'serial' });
        expect(result.errors['nodeD']).toBeUndefined();
    });

    it('should catch circular dependency cycle errors and place them under __global__', async () => {
        const graph: GraphState = {
            nodes: {
                'nodeA': {
                    id: 'nodeA',
                    type: 'node/generic',
                    inputs: { a: 'any' },
                    outputs: { out: 'any' },
                    params: {}
                },
                'nodeB': {
                    id: 'nodeB',
                    type: 'node/generic',
                    inputs: { a: 'any' },
                    outputs: { out: 'any' },
                    params: {}
                }
            },
            edges: [
                { id: 'e1', sourceNodeId: 'nodeA', sourcePinId: 'out', targetNodeId: 'nodeB', targetPinId: 'a' },
                { id: 'e2', sourceNodeId: 'nodeB', sourcePinId: 'out', targetNodeId: 'nodeA', targetPinId: 'a' }
            ]
        };

        const result = await evaluateGraph(graph, {}, StandardNodes, { executionMode: 'serial' });
        expect(result.errors['__global__']).toContain('Circular dependency detected');
    });

    it('should propagate upstream failures and skip downstream evaluations', async () => {
        const faultyRegistry = {
            'custom/faulty': {
                namespace: 'custom',
                category: 'test',
                name: 'faulty',
                requires: {},
                provides: { out: 'any' },
                execute: () => { throw new Error('Exploded!'); }
            },
            'custom/generic': {
                namespace: 'custom',
                category: 'test',
                name: 'generic',
                requires: { a: 'any' },
                provides: { out: 'any' },
                execute: async (inputs: any) => ({ out: inputs.a })
            }
        };

        const graph: GraphState = {
            nodes: {
                'nodeA': { id: 'nodeA', type: 'custom/faulty', params: {} },
                'nodeB': { id: 'nodeB', type: 'custom/generic', params: {} }
            },
            edges: [
                { id: 'e1', sourceNodeId: 'nodeA', sourcePinId: 'out', targetNodeId: 'nodeB', targetPinId: 'a' }
            ]
        };

        const result = await evaluateGraph(graph, {}, faultyRegistry, { executionMode: 'serial' });
        expect(result.errors['nodeA']).toBe('Exploded!');
        expect(result.errors['nodeB']).toContain("Skipped: Upstream dependency 'nodeA' failed");
    });

    it('should default missing provides pins to null and throw on non-object returns', async () => {
        const customRegistry = {
            'custom/faulty': {
                namespace: 'custom',
                category: 'test',
                name: 'faulty',
                requires: {},
                provides: { val1: 'number', val2: 'string' },
                execute: () => ({ val1: 42 }) as any
            },
            'custom/invalid': {
                namespace: 'custom',
                category: 'test',
                name: 'invalid',
                requires: {},
                provides: { val: 'any' },
                execute: () => ("not an object" as any)
            }
        };

        const graph1: GraphState = {
            nodes: { 'n1': { id: 'n1', type: 'custom/faulty', params: {} } },
            edges: []
        };
        const result1 = await evaluateGraph(graph1, {}, customRegistry, { executionMode: 'serial' });
        expect(result1.state['n1.val1']).toBe(42);
        expect(result1.state['n1.val2']).toBeNull();

        const graph2: GraphState = {
            nodes: { 'n2': { id: 'n2', type: 'custom/invalid', params: {} } },
            edges: []
        };
        const result2 = await evaluateGraph(graph2, {}, customRegistry, { executionMode: 'serial' });
        expect(result2.errors['n2']).toContain('returned invalid value');
    });

    it('should garbage collect stale activeState keys of deleted/renamed elements', async () => {
        const graph: GraphState = {
            nodes: {
                'nodeA': {
                    id: 'nodeA',
                    type: 'node/generic',
                    inputs: { a: 'any', b: 'any' },
                    params: {}
                }
            },
            edges: []
        };

        const initialInputs = {
            'nodeA.a': 5,
            'nodeA.b': 10,
            'nodeDeleted.out': 99
        };

        const result = await evaluateGraph(graph, initialInputs, StandardNodes, { executionMode: 'serial' });
        
        expect(result.state['nodeA.a']).toBe(5);
        expect(result.state['nodeA.b']).toBe(10);
        expect(result.state['nodeDeleted.out']).toBeUndefined();
    });

    it('should coerce string numbers to numeric type in formula and block evaluation', async () => {
        const graph: GraphState = {
            nodes: {
                'formulaNode': {
                    id: 'formulaNode',
                    type: 'node/formula',
                    params: { formula: 'x + y', x: '10', y: '20' }
                },
                'blocksNode': {
                    id: 'blocksNode',
                    type: 'node/blocks',
                    params: {
                        blocks: [
                            { id: '1', targetVar: 'out0', operand1: 'a', operator: '+', operand2: 'b' }
                        ],
                        a: '100',
                        b: '200'
                    }
                }
            },
            edges: []
        };

        const result = await evaluateGraph(graph, {}, StandardNodes, { executionMode: 'serial' });
        
        expect(result.state['formulaNode.out0']).toBe(30);  // 10 + 20 = 30 (not '1020')
        expect(result.state['blocksNode.out0']).toBe(300); // 100 + 200 = 300 (not '100200')
    });
});
