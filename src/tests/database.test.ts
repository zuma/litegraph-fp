import { describe, test, expect } from 'vitest';
import { evaluateGraph } from '../engine/evaluate.js';
import { GraphState } from '../core/ast.js';
import { StandardNodes } from '../registry/index.js';

describe('Database Table & Filter Actions', () => {
    test('should load database table rows and filter them correctly', async () => {
        const mockRows = [
            { id: 1, name: 'Alice', age: 25 },
            { id: 2, name: 'Bob', age: 17 },
            { id: 3, name: 'Charlie', age: 30 }
        ];

        const graph: GraphState = {
            nodes: {
                'table_1': {
                    id: 'table_1',
                    type: 'node',
                    actions: [{
                        id: 'act_table',
                        type: 'database/table',
                        params: {
                            tableName: 'users',
                            rows: mockRows
                        }
                    }],
                    inputs: {},
                    outputs: {
                        rows: 'any'
                    },
                    params: {}
                },
                'filter_1': {
                    id: 'filter_1',
                    type: 'node',
                    actions: [{
                        id: 'act_filter',
                        type: 'database/filter',
                        params: {
                            column: 'age',
                            operator: '>',
                            value: '18'
                        }
                    }],
                    inputs: {
                        dataset: 'any'
                    },
                    outputs: {
                        dataset: 'any'
                    },
                    params: {}
                }
            },
            edges: [
                {
                    id: 'edge_1',
                    sourceNodeId: 'table_1',
                    sourcePinId: 'rows',
                    targetNodeId: 'filter_1',
                    targetPinId: 'dataset'
                }
            ]
        };

        const result = await evaluateGraph(
            graph,
            {},
            StandardNodes,
            { executionMode: 'serial' }
        );

        // Check if no execution errors occurred
        expect(result.errors).toEqual({});

        // Verify the filtered output dataset
        const outputRows = result.state['filter_1.dataset'] as any[];
        expect(outputRows).toBeDefined();
        expect(outputRows.length).toBe(2);

        const names = outputRows.map(r => r.name);
        expect(names).toContain('Alice');
        expect(names).toContain('Charlie');
        expect(names).not.toContain('Bob');
    });
});
