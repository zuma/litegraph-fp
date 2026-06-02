import { NodeRegistry } from './types.js';
import { add, multiply, subtract, divide, modulo, sin, cos, tan, abs, round } from './math.js';
import { invertBoolean } from './logic.js';
import { delaySim, logToConsole, state } from './system.js';

// ============================================================================
// THE STANDARD REGISTRY EXPORT
// ============================================================================
// The execution engine matches AST node types to this dictionary 
// to resolve the pure mathematical logic required for evaluation.

export const StandardNodes: NodeRegistry = Object.freeze({
    'math/add': add,
    'math/multiply': multiply,
    'math/subtract': subtract,
    'math/divide': divide,
    'math/modulo': modulo,
    'math/sin': sin,
    'math/cos': cos,
    'math/tan': tan,
    'math/abs': abs,
    'math/round': round,
    'logic/not': invertBoolean,
    'system/delay': delaySim,
    'system/log': logToConsole,
    'system/state': state
});
