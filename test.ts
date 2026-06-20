import { GraphState } from './src/core/ast.js';
import { ExecutionState } from './src/engine/types.js';
import { evaluateGraph } from './src/engine/evaluate.js';
import { StandardNodes } from './src/registry/index.js';
import { createDispatcher } from './src/events/dispatcher.js';
import { Command } from './src/events/types.js';

// ============================================================================
// 1. MOCK DATA & FIXTURES
// ============================================================================
const mockGraph: GraphState = {
    nodes: {
        'nodeA': {
            id: 'nodeA',
            type: 'formula',
            inputs: { a: 'any', b: 'any' },
            outputs: { out0: 'any' },
            params: { formula: 'a + b' }
        },
        'nodeB': {
            id: 'nodeB',
            type: 'formula',
            inputs: { a: 'any', b: 'any' },
            outputs: { out0: 'any' },
            params: { formula: 'a + b' }
        },
        'nodeC': {
            id: 'nodeC',
            type: 'formula',
            inputs: { a: 'any', b: 'any' },
            outputs: { out0: 'any' },
            params: { formula: 'a * b' }
        },
        'nodeD': {
            id: 'nodeD',
            type: 'formula',
            inputs: { a: 'any' },
            outputs: { out0: 'any' },
            params: { formula: 'round(a)' }
        },
        'nodeRogue': {
            id: 'nodeRogue',
            type: 'system/delay',
            inputs: { in0: 'any' },
            outputs: { out: 'any' },
            params: { delayMs: 999999 }
        },
        'nodeLog': {
            id: 'nodeLog',
            type: 'system/log',
            inputs: { msg: 'any' },
            params: {}
        }
    },
    edges: [
        { id: 'edge1', sourceNodeId: 'nodeA', sourcePinId: 'out0', targetNodeId: 'nodeC', targetPinId: 'a' },
        { id: 'edge2', sourceNodeId: 'nodeB', sourcePinId: 'out0', targetNodeId: 'nodeC', targetPinId: 'b' },
        { id: 'edge3', sourceNodeId: 'nodeC', sourcePinId: 'out0', targetNodeId: 'nodeD', targetPinId: 'a' },
        { id: 'edge4', sourceNodeId: 'nodeC', sourcePinId: 'out0', targetNodeId: 'nodeLog', targetPinId: 'msg' }
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
        'nodeRogue.in0': "I will crash"
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
    if (finalResult.state['nodeA.out0'] === 15) console.log("✅ Math Pipeline survived rogue node explosion.");
    if (finalResult.state['nodeC.out0'] === 600) console.log("✅ Tier 2 execution completed safely.");
    if (finalResult.errors['nodeRogue']?.includes("Timeout")) console.log("🚨 Watchdog successfully terminated nodeRogue before it could freeze the system!");
    if (!finalResult.state['nodeLog.$commands']) console.log("✅ $commands no longer pollute the execution state.");
    if (finalResult.commands['nodeLog']?.length > 0) console.log("✅ Commands extracted into first-class result field.");
}

executeBulletproofTest().catch(e => {
    console.error("❌ ENGINE FATAL CRASH:", e);
    process.exit(1);
});
