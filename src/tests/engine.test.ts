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
                    type: 'node',
                    actions: [{ id: 'a1', type: 'system/state', params: { defaultValue: 0 } }],
                    params: {}
                },
                'add1': {
                    id: 'add1',
                    type: 'node',
                    actions: [{ id: 'a2', type: 'formula', params: { formula: 'a + 1' } }],
                    params: {}
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
                'state1': { 
                    id: 'state1', 
                    type: 'node', 
                    actions: [{ id: 'a1', type: 'system/state', params: { defaultValue: 100 } }],
                    params: {} 
                },
                'add1': { 
                    id: 'add1', 
                    type: 'node', 
                    actions: [{ id: 'a2', type: 'formula', params: { formula: 'a + 1' } }],
                    params: {} 
                }
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
                'state1': { 
                    id: 'state1', 
                    type: 'node', 
                    actions: [{ id: 'a1', type: 'system/state', params: { defaultValue: 100 } }],
                    params: {} 
                },
                'add1': { 
                    id: 'add1', 
                    type: 'node', 
                    actions: [{ id: 'a2', type: 'formula', params: { formula: 'a + 1' } }],
                    params: {} 
                }
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
    });

    it('should garbage collect stale activeState keys of deleted/renamed elements', async () => {
        const graph: GraphState = {
            nodes: {
                'nodeA': {
                    id: 'nodeA',
                    type: 'node',
                    actions: [],
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
                    type: 'node',
                    actions: [{ id: 'a1', type: 'formula', params: { formula: 'x + y', x: '10', y: '20' } }],
                    params: {}
                },
                'blocksNode': {
                    id: 'blocksNode',
                    type: 'node',
                    actions: [{
                        id: 'a2',
                        type: 'blocks',
                        params: {
                            blocks: [
                                { id: '1', targetVar: 'out0', operand1: 'a', operator: '+', operand2: 'b' }
                            ],
                            a: '100',
                            b: '200'
                        }
                    }],
                    params: {}
                }
            },
            edges: []
        };

        const result = await evaluateGraph(graph, {}, StandardNodes, { executionMode: 'serial' });
        
        expect(result.state['formulaNode.out0']).toBe(30);  // 10 + 20 = 30 (not '1020')
        expect(result.state['blocksNode.out0']).toBe(300); // 100 + 200 = 300 (not '100200')
    });
});
