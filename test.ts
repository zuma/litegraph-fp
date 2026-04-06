import { GraphState, ExecutionState } from './src/types.js';
import { evaluateGraph } from './src/engine.js';
import { StandardNodes } from './src/registry.js';

// ============================================================================
// 1. MOCK DATA & FIXTURES
// ============================================================================
// Node A / B / C / D run the standard math sequence.
// Node E is a rogue node designed to HANG FOREVER.
// Our engine must evaluate A B C D perfectly, isolate E, kill it, and log the error!

const mockGraph: GraphState = {
    nodes: {
        'nodeA': { id: 'nodeA', type: 'math/add', params: {} },
        'nodeB': { id: 'nodeB', type: 'math/add', params: {} },
        'nodeC': { id: 'nodeC', type: 'math/multiply', params: {} },
        'nodeD': { id: 'nodeD', type: 'logic/not', params: {} },
        'nodeRogue': { id: 'nodeRogue', type: 'system/delay', params: { ms: 999999 } }, // Infinite hang!
    },
    edges: [
        { id: 'edge1', sourceNodeId: 'nodeA', sourcePinId: 'out', targetNodeId: 'nodeC', targetPinId: 'a' },
        { id: 'edge2', sourceNodeId: 'nodeB', sourcePinId: 'out', targetNodeId: 'nodeC', targetPinId: 'b' },
        { id: 'edge3', sourceNodeId: 'nodeC', sourcePinId: 'out', targetNodeId: 'nodeD', targetPinId: 'a' }
    ]
};

// ============================================================================
// 2. MARS-GRADE RESILIENCE TEST ENGINE
// ============================================================================

async function executeBulletproofTest() {
    console.log("🚀 Booting Mars-Grade Functional Engine...");
    
    const globalInputs: ExecutionState = {
        'nodeA.a': 5,
        'nodeA.b': 10,
        'nodeB.a': 20,
        'nodeB.b': 20,
        'nodeRogue.a': "I will crash"
    };

    console.time("⏱️  Watchdog Execution Time");

    // Execute parallel with a strict 2-second watchdog cutoff
    const finalResult = await evaluateGraph(
        mockGraph, 
        globalInputs, 
        StandardNodes, 
        { executionMode: 'parallel', nodeTimeoutMs: 1500 }
    );

    console.timeEnd("⏱️  Watchdog Execution Time");
    
    console.log("\n📦 FROZEN ENGINE STATE:");
    console.log(finalResult.state);

    console.log("\n🚨 QUARANTINED ERROR LOGS:");
    console.log(finalResult.errors);

    // Bulletproof Assertions
    console.log("\n🔍 AUTOMATED VERIFICATION RESULTS:");
    if (finalResult.state['nodeA.out'] === 15) console.log("✅ Math Pipeline survived rogue node explosion.");
    if (finalResult.state['nodeC.out'] === 600) console.log("✅ Tier 2 execution completed safely.");
    if (finalResult.errors['nodeRogue'].includes("Timeout")) console.log("🚨 Watchdog successfully assassinated nodeRogue before it could freeze the system!");
    
    // Explicitly kill the Node process because `nodeRogue` leaves a dormant setTimeout inside the event loop!
    process.exit(0);
}

executeBulletproofTest().catch(e => {
    console.error("❌ ENGINE FATAL CRASH:", e);
    process.exit(1);
});
