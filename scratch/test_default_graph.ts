import { defaultGraph } from '../src/ui/state.js';
import { evaluateGraph } from '../src/engine/evaluate.js';
import { StandardNodes } from '../src/registry/index.js';

async function test() {
    console.log("Evaluating defaultGraph...");
    const result = await evaluateGraph(
        defaultGraph,
        {},
        StandardNodes,
        { executionMode: 'serial' }
    );
    console.log("Result State:", result.state);
    console.log("Errors:", result.errors);
}

test().catch(console.error);
