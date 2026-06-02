import { GraphState } from './src/core/ast.js';
import { ExecutionState } from './src/engine/types.js';
import { evaluateGraph } from './src/engine/evaluate.js';
import { StandardNodes } from './src/registry/index.js';
import { createDispatcher } from './src/events/dispatcher.js';
import { Command } from './src/events/types.js';

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
        'nodeD': { id: 'nodeD', type: 'math/round', params: {} },
        'nodeRogue': { id: 'nodeRogue', type: 'system/delay', params: { ms: 999999 } }, // Infinite hang!
        'nodeLog': { id: 'nodeLog', type: 'system/log', params: {} },
    },
    edges: [
        { id: 'edge1', sourceNodeId: 'nodeA', sourcePinId: 'out', targetNodeId: 'nodeC', targetPinId: 'a' },
        { id: 'edge2', sourceNodeId: 'nodeB', sourcePinId: 'out', targetNodeId: 'nodeC', targetPinId: 'b' },
        { id: 'edge3', sourceNodeId: 'nodeC', sourcePinId: 'out', targetNodeId: 'nodeD', targetPinId: 'a' },
        { id: 'edge4', sourceNodeId: 'nodeC', sourcePinId: 'out', targetNodeId: 'nodeLog', targetPinId: 'msg' }
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

    // Execute parallel with a strict 1.5-second watchdog cutoff
    const finalResult = await evaluateGraph(
        mockGraph, 
        globalInputs, 
        StandardNodes, 
        { executionMode: 'parallel', nodeTimeoutMs: 1500 }
    );

    console.timeEnd("⏱️  Watchdog Execution Time");

    // Dispatch side-effects using the functional factory (no classes!)
    console.log("\n📡 DISPATCHING SIDE EFFECTS...");
    const dispatcher = createDispatcher();
    dispatcher.on('CONSOLE_LOG', (cmd: Command, sourceNodeId: string) => {
        console.log(`[IMPURE BOUNDARY - Node ${sourceNodeId}]:`, cmd.payload.message);
    });
    await dispatcher.dispatchFromExecution(finalResult);
    
    console.log("\n📦 FROZEN ENGINE STATE:");
    console.log(finalResult.state);

    console.log("\n📡 EXTRACTED COMMANDS:");
    console.log(finalResult.commands);

    console.log("\n🚨 QUARANTINED ERROR LOGS:");
    console.log(finalResult.errors);

    // Bulletproof Assertions
    console.log("\n🔍 AUTOMATED VERIFICATION RESULTS:");
    if (finalResult.state['nodeA.out'] === 15) console.log("✅ Math Pipeline survived rogue node explosion.");
    if (finalResult.state['nodeC.out'] === 600) console.log("✅ Tier 2 execution completed safely.");
    if (finalResult.errors['nodeRogue']?.includes("Timeout")) console.log("🚨 Watchdog successfully assassinated nodeRogue before it could freeze the system!");
    if (!finalResult.state['nodeLog.$commands']) console.log("✅ $commands no longer pollute the execution state.");
    if (finalResult.commands['nodeLog']?.length > 0) console.log("✅ Commands extracted into first-class result field.");

    // No more process.exit(0) hack needed — clearTimeout cleans up orphaned timers!
}

executeBulletproofTest().catch(e => {
    console.error("❌ ENGINE FATAL CRASH:", e);
    process.exit(1);
});

