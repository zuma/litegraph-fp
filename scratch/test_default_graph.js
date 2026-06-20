import { defaultGraph } from '../dist/src/ui/state.js';
import { evaluateGraph } from '../dist/src/engine/evaluate.js';
import { StandardNodes } from '../dist/src/registry/index.js';

async function test() {
    console.log("Evaluating defaultGraph...");
    // Let's print the sub-graph nodes details
    const parentNode = defaultGraph.nodes['node_4012'];
    console.log("Parent Node nodes:", Object.keys(parentNode.nodes || {}));
    console.log("Parent Node edges:", parentNode.edges);

    const result = await evaluateGraph(
        defaultGraph,
        {},
        StandardNodes,
        { 
            executionMode: 'serial',
            // Let's add a custom logging middleware
            middlewares: [
                (nodeId, nodeType, next) => {
                    return async (inputs, params, signal) => {
                        console.log(`[EXECUTE START] node="${nodeId}" type="${nodeType}" inputs=`, inputs, `params=`, params);
                        const outputs = await next(inputs, params, signal);
                        console.log(`[EXECUTE END] node="${nodeId}" outputs=`, outputs);
                        return outputs;
                    };
                }
            ]
        }
    );
    console.log("Result State:", result.state);
    console.log("Errors:", result.errors);
}

test().catch(console.error);
