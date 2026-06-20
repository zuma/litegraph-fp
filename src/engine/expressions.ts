import { BlockStatement } from '../core/ast.js';

export function tryNumberCoerce(val: any): any {
    if (typeof val === 'string') {
        const trimmed = val.trim();
        if (trimmed !== '' && !isNaN(Number(trimmed))) {
            return Number(trimmed);
        }
    }
    return val;
}

export function getDefaultFormulaForType(type: string): string {
    return '';
}

export function extractVariablesFromFormula(formula: string): string[] {
    const mathBuiltins = new Set([
        'sin', 'cos', 'tan', 'abs', 'round', 'min', 'max', 'pow', 'sqrt', 'log', 'exp', 'pi', 'e',
        'true', 'false', 'null', 'undefined', 'not', 'and', 'or', 'xor', 'concat', 'split'
    ]);
    const matches = formula.match(/[a-zA-Z_][a-zA-Z0-9_]*/g) || [];
    const vars = new Set<string>();
    matches.forEach(m => {
        const lower = m.toLowerCase();
        if (!mathBuiltins.has(lower)) {
            vars.add(m);
        }
    });
    return Array.from(vars);
}

export function evaluateFormulaExpression(formula: string, inputs: Record<string, any>): any {
    let pos = 0;
    const cleanFormula = formula.trim();
    if (!cleanFormula) return 0;

    function peek() {
        return cleanFormula[pos] || '';
    }

    // consume a single char
    function consume(char: string) {
        if (peek() === char) {
            pos++;
            return true;
        }
        return false;
    }

    function skipWhitespace() {
        while (pos < cleanFormula.length && /\s/.test(cleanFormula[pos])) {
            pos++;
        }
    }

    function parsePrimary(): any {
        skipWhitespace();
        
        if (consume('(')) {
            const val = parseExpression();
            skipWhitespace();
            if (!consume(')')) {
                throw new Error("Missing closing parenthesis");
            }
            return val;
        }

        const start = pos;
        if (/[a-zA-Z_]/.test(peek())) {
            while (pos < cleanFormula.length && /[a-zA-Z0-9_]/.test(peek())) {
                pos++;
            }
            const word = cleanFormula.substring(start, pos);
            skipWhitespace();
            
            if (peek() === '(') {
                consume('(');
                const args: any[] = [];
                if (peek() !== ')') {
                    args.push(parseExpression());
                    skipWhitespace();
                    while (consume(',')) {
                        args.push(parseExpression());
                        skipWhitespace();
                    }
                }
                if (!consume(')')) {
                    throw new Error(`Missing closing parenthesis in function call '${word}'`);
                }
                
                const fn = word.toLowerCase();
                switch (fn) {
                    case 'sin': return Math.sin(args[0]);
                    case 'cos': return Math.cos(args[0]);
                    case 'tan': return Math.tan(args[0]);
                    case 'abs': return Math.abs(args[0]);
                    case 'round': return Math.round(args[0]);
                    case 'sqrt': return Math.sqrt(args[0]);
                    case 'min': return Math.min(...args);
                    case 'max': return Math.max(...args);
                    case 'concat': return args.join('');
                    case 'split': return String(args[0]).split(args[1]);
                    default:
                        throw new Error(`Unknown function: ${word}`);
                }
            }
            
            if (word === 'true') return true;
            if (word === 'false') return false;
            
            if (word in inputs) {
                return inputs[word];
            }
            if (word.toLowerCase() === 'pi') return Math.PI;
            if (word.toLowerCase() === 'e') return Math.E;
            
            return 0;
        }

        if (/[0-9.]/.test(peek())) {
            while (pos < cleanFormula.length && /[0-9.]/.test(peek())) {
                pos++;
            }
            return parseFloat(cleanFormula.substring(start, pos));
        }

        if (consume('-')) {
            return -parsePrimary();
        }
        if (consume('+')) {
            return parsePrimary();
        }

        throw new Error(`Unexpected character: '${peek()}' at position ${pos}`);
    }

    function parseMultiplicative(): any {
        let val = parsePrimary();
        skipWhitespace();
        while (true) {
            if (consume('*')) {
                val = Number(tryNumberCoerce(val)) * Number(tryNumberCoerce(parsePrimary()));
            } else if (consume('/')) {
                val = Number(tryNumberCoerce(val)) / Number(tryNumberCoerce(parsePrimary()));
            } else if (consume('%')) {
                val = Number(tryNumberCoerce(val)) % Number(tryNumberCoerce(parsePrimary()));
            } else {
                break;
            }
            skipWhitespace();
        }
        return val;
    }

    function parseAdditive(): any {
        let val = parseMultiplicative();
        skipWhitespace();
        while (true) {
            if (consume('+')) {
                const nextVal = parseMultiplicative();
                const cVal = tryNumberCoerce(val);
                const cNext = tryNumberCoerce(nextVal);
                if (typeof cVal === 'number' && typeof cNext === 'number') {
                    val = cVal + cNext;
                } else {
                    val = String(val) + String(nextVal);
                }
            } else if (consume('-')) {
                val = Number(tryNumberCoerce(val)) - Number(tryNumberCoerce(parseMultiplicative()));
            } else {
                break;
            }
            skipWhitespace();
        }
        return val;
    }

    function parseComparison(): any {
        let val = parseAdditive();
        skipWhitespace();
        if (consume('=')) {
            consume('=');
            const nextVal = parseAdditive();
            const cVal = tryNumberCoerce(val);
            const cNext = tryNumberCoerce(nextVal);
            val = (cVal == cNext);
        } else if (consume('<')) {
            if (consume('=')) {
                const nextVal = parseAdditive();
                const cVal = tryNumberCoerce(val);
                const cNext = tryNumberCoerce(nextVal);
                val = (cVal <= cNext);
            } else {
                const nextVal = parseAdditive();
                const cVal = tryNumberCoerce(val);
                const cNext = tryNumberCoerce(nextVal);
                val = (cVal < cNext);
            }
        } else if (consume('>')) {
            if (consume('=')) {
                const nextVal = parseAdditive();
                const cVal = tryNumberCoerce(val);
                const cNext = tryNumberCoerce(nextVal);
                val = (cVal >= cNext);
            } else {
                const nextVal = parseAdditive();
                const cVal = tryNumberCoerce(val);
                const cNext = tryNumberCoerce(nextVal);
                val = (cVal > cNext);
            }
        }
        return val;
    }

    function parseExpression(): any {
        return parseComparison();
    }

    const result = parseExpression();
    skipWhitespace();
    if (pos < cleanFormula.length) {
        throw new Error(`Unexpected trailing characters starting at position ${pos}`);
    }
    return result;
}

export function evaluateBlockExpression(blocks: ReadonlyArray<BlockStatement>, inputs: Record<string, any>): any {
    const scope: Record<string, any> = { ...inputs };
    let lastTargetVar = '';
    
    for (const block of blocks) {
        const target = block.targetVar.trim();
        if (!target) continue;
        
        const op1Str = block.operand1.trim();
        const op2Str = block.operand2.trim();
        
        const val1Raw = isNaN(Number(op1Str)) ? (scope[op1Str] ?? 0) : Number(op1Str);
        const val2Raw = isNaN(Number(op2Str)) ? (scope[op2Str] ?? 0) : Number(op2Str);
        
        const val1 = tryNumberCoerce(val1Raw);
        const val2 = tryNumberCoerce(val2Raw);
        
        let res: any = 0;
        switch (block.operator) {
            case '+': 
                if (typeof val1 === 'number' && typeof val2 === 'number') {
                    res = val1 + val2;
                } else {
                    res = String(val1) + String(val2);
                }
                break;
            case '-': res = Number(val1) - Number(val2); break;
            case '*': res = Number(val1) * Number(val2); break;
            case '/': res = Number(val1) / Number(val2); break;
            case 'and': res = Boolean(val1) && Boolean(val2); break;
            case 'or': res = Boolean(val1) || Boolean(val2); break;
            case '==': res = val1 == val2; break;
            default: res = 0;
        }
        scope[target] = res;
        lastTargetVar = target;
    }
    
    return scope['out'] !== undefined ? scope['out'] : (lastTargetVar ? scope[lastTargetVar] : 0);
}
