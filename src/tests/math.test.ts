import { describe, it, expect } from 'vitest';
import { add, subtract, divide, modulo, sin, cos, tan, abs, round } from '../registry/math.js';



describe('Math Nodes', () => {
    it('should correctly add two numbers', () => {
        const result = add.execute({ a: 5, b: 10 }, {});
        expect(result).toEqual({ out: 15 });
    });

    it('should fall back to 0 when inputs are missing', () => {
        const result = add.execute({}, {});
        expect(result).toEqual({ out: 0 });
    });

    it('should correctly subtract two numbers', () => {
        expect(subtract.execute({ a: 10, b: 3 }, {})).toEqual({ out: 7 });
        expect(subtract.execute({ a: 3, b: 10 }, {})).toEqual({ out: -7 });
    });

    it('should correctly divide two numbers and handle zero division', () => {
        expect(divide.execute({ a: 10, b: 2 }, {})).toEqual({ out: 5 });
        expect(divide.execute({ a: 10, b: 0 }, {})).toEqual({ out: 0 });
        expect(divide.execute({ a: -10, b: 2 }, {})).toEqual({ out: -5 });
    });

    it('should correctly calculate modulo', () => {
        expect(modulo.execute({ a: 10, b: 3 }, {})).toEqual({ out: 1 });
        expect(modulo.execute({ a: 10, b: 2 }, {})).toEqual({ out: 0 });
    });

    it('should correctly calculate trigonometry', () => {
        expect(sin.execute({ a: Math.PI / 2 }, {})).toEqual({ out: 1 });
        expect(cos.execute({ a: 0 }, {})).toEqual({ out: 1 });
        expect(tan.execute({ a: 0 }, {})).toEqual({ out: 0 });
    });

    it('should correctly calculate abs and round', () => {
        expect(abs.execute({ a: -5 }, {})).toEqual({ out: 5 });
        expect(round.execute({ a: 5.5 }, {})).toEqual({ out: 6 });
        expect(round.execute({ a: 5.4 }, {})).toEqual({ out: 5 });
    });
});



