import { NodeRegistry } from './types.js';
import { add, multiply, subtract, divide, modulo, sin, cos, tan, abs, round } from './math.js';
import { invertBoolean, logicAnd, logicOr, logicXor } from './logic.js';
import { delaySim, logToConsole, state } from './system.js';
import { concat as stringConcat, split as stringSplit, replace as stringReplace, length as stringLength } from './strings.js';
import { getField as objectGet, setField as objectSet, parseJson as objectParse, stringifyJson as objectStringify } from './objects.js';
import { arrayLength, arraySlice } from './arrays.js';
import { pythonScript } from './python.js';

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
    'logic/and': logicAnd,
    'logic/or': logicOr,
    'logic/xor': logicXor,

    'string/concat': stringConcat,
    'string/split': stringSplit,
    'string/replace': stringReplace,
    'string/length': stringLength,

    'object/get': objectGet,
    'object/set': objectSet,
    'object/parse': objectParse,
    'object/stringify': objectStringify,

    'array/length': arrayLength,
    'array/slice': arraySlice,

    'python/script': pythonScript,

    'system/delay': delaySim,
    'system/log': logToConsole,
    'system/state': state
});

