import { describe, it, expect } from 'vitest';
import { GraphState } from '../core/ast.js';
import { evaluateGraph } from '../engine/evaluate.js';
import { StandardNodes } from '../registry/index.js';
import { Middleware } from '../engine/types.js';

describe('Engine Middleware Pipeline', () => {
    it('should invoke custom middlewares in order', async () => {
        const trace: string[] = [];

        const loggerMiddleware: Middleware = (nodeId, nodeType, next) => {
            return async (inputs, params, signal) => {
                trace.push(`enter:${nodeId}`);
                const outputs = await next(inputs, params, signal);
                trace.push(`exit:${nodeId}`);
                return outputs;
            };
        };

        const graph: GraphState = {
            nodes: {
                'add1': { id: 'add1', type: 'node/generic', params: {} }
            },
            edges: []
        };

        const config = {
            executionMode: 'serial' as const,
            nodeTimeoutMs: 1000,
            middlewares: [loggerMiddleware]
        };

        await evaluateGraph(graph, { 'add1.a': 5, 'add1.b': 10 }, StandardNodes, config);

        expect(trace).toEqual(['enter:add1', 'exit:add1']);
    });

    it('should bypass node execution and return cached value when inputs match', async () => {
        let executions = 0;
        const customRegistry = {
            'custom/counter': {
                namespace: 'custom',
                category: 'test',
                name: 'counter',
                requires: { a: 'number' },
                provides: { out: 'number' },
                execute: async (inputs: any) => {
                    executions++;
                    return { out: (inputs.a ?? 0) * 2 };
                }
            }
        };

        const graph: GraphState = {
            nodes: {
                'c1': { id: 'c1', type: 'custom/counter', params: {} }
            },
            edges: []
        };

        const cache = new Map();
        const config = {
            executionMode: 'serial' as const,
            nodeTimeoutMs: 1000,
            cache
        };

        // First run: executes node logic
        const res1 = await evaluateGraph(graph, { 'c1.a': 10 }, customRegistry, config);
        expect(res1.state['c1.out']).toBe(20);
        expect(executions).toBe(1);

        // Second run with identical inputs: retrieves from cache
        const res2 = await evaluateGraph(graph, { 'c1.a': 10 }, customRegistry, config);
        expect(res2.state['c1.out']).toBe(20);
        expect(executions).toBe(1); // Counter did not increment!

        // Third run with different inputs: executes node logic and updates cache
        const res3 = await evaluateGraph(graph, { 'c1.a': 15 }, customRegistry, config);
        expect(res3.state['c1.out']).toBe(30);
        expect(executions).toBe(2); // Counter incremented!
    });
});
