import { NodeRegistry } from './types.js';
import { add, multiply } from './math.js';
import { invertBoolean } from './logic.js';
import { delaySim, logToConsole } from './system.js';

// ============================================================================
// THE STANDARD REGISTRY EXPORT
// ============================================================================
// The execution engine matches AST node types to this dictionary 
// to resolve the pure mathematical logic required for evaluation.

export const StandardNodes: NodeRegistry = Object.freeze({
    'math/add': add,
    'math/multiply': multiply,
    'logic/not': invertBoolean,
    'system/delay': delaySim,
    'system/log': logToConsole
});
