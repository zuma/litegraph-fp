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
                    type: 'math/add',
                    params: { b: 1 } // Adding 1 every tick
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
                    sourcePinId: 'out',
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
                'add1': { id: 'add1', type: 'math/add', params: {} }
            },
            edges: [
                { id: 'e1', sourceNodeId: 'state1', sourcePinId: 'value', targetNodeId: 'add1', targetPinId: 'a' },
                { id: 'e2', sourceNodeId: 'add1', sourcePinId: 'out', targetNodeId: 'state1', targetPinId: 'nextValue' }
            ]
        };

        // If this throws, the test fails. 
        // We are checking that sortTopologically finds a valid order.
        await expect(evaluateGraph(graph, {}, StandardNodes, { executionMode: 'serial', nodeTimeoutMs: 1000 }))
            .resolves.not.toThrow();
    });
});
