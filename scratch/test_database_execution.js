import { evaluateGraph } from '../dist/src/engine/evaluate.js';
import { StandardNodes } from '../dist/src/registry/index.js';

async function runDatabaseTest() {
    console.log("🚀 Running Database Table & Filter node evaluation test...");

    const mockRows = [
        { id: 1, name: 'Alice', age: 25 },
        { id: 2, name: 'Bob', age: 17 },
        { id: 3, name: 'Charlie', age: 30 }
    ];

    const graph = {
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
                }
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
                }
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

    if (Object.keys(result.errors).length > 0) {
        console.error("❌ Test failed: execution errors occurred:", result.errors);
        process.exit(1);
    }

    const outputRows = result.state['filter_1.dataset'];
    console.log("📦 Output Dataset rows:", outputRows);

    if (!outputRows || outputRows.length !== 2) {
        console.error("❌ Test failed: expected 2 rows, got", outputRows ? outputRows.length : 0);
        process.exit(1);
    }

    const names = outputRows.map(r => r.name);
    if (!names.includes('Alice') || !names.includes('Charlie') || names.includes('Bob')) {
        console.error("❌ Test failed: filter logic did not select correct rows. Got names:", names);
        process.exit(1);
    }

    console.log("🎉 SUCCESS: Database nodes executed and filtered perfectly!");
}

runDatabaseTest().catch(err => {
    console.error("❌ Fatal Test Error:", err);
    process.exit(1);
});
