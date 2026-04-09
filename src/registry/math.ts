import { NodeDefinition } from './types.js';

export const add: NodeDefinition = {
    namespace: 'core',
    category: 'math',
    name: 'add',
    description: 'Adds two numbers together',
    requires: { a: 'number', b: 'number' },
    provides: { out: 'number' },
    execute: (inputs, params) => {
        const a = (inputs.a ?? params.a ?? 0) as number;
        const b = (inputs.b ?? params.b ?? 0) as number;
        return { out: a + b };
    }
};

export const multiply: NodeDefinition = {
    namespace: 'core',
    category: 'math',
    name: 'multiply',
    description: 'Multiplies two numbers together',
    requires: { a: 'number', b: 'number' },
    provides: { out: 'number' },
    execute: (inputs, params) => {
        const a = (inputs.a ?? params.a ?? 1) as number;
        const b = (inputs.b ?? params.b ?? 1) as number;
        return { out: a * b };
    }
};

export const subtract: NodeDefinition = {
    namespace: 'core',
    category: 'math',
    name: 'subtract',
    requires: { a: 'number', b: 'number' },
    provides: { out: 'number' },
    execute: (inputs, params) => {
        const a = (inputs.a ?? params.a ?? 0) as number;
        const b = (inputs.b ?? params.b ?? 0) as number;
        return { out: a - b };
    }
};

export const divide: NodeDefinition = {
    namespace: 'core',
    category: 'math',
    name: 'divide',
    requires: { a: 'number', b: 'number' },
    provides: { out: 'number' },
    execute: (inputs, params) => {
        const a = (inputs.a as number) ?? 0;
        const b = (inputs.b as number) ?? 1;
        if (b === 0) return { out: 0 };
        return { out: a / b };
    }
};

export const modulo: NodeDefinition = {
    namespace: 'core',
    category: 'math',
    name: 'modulo',
    requires: { a: 'number', b: 'number' },
    provides: { out: 'number' },
    execute: (inputs, params) => {
        const a = (inputs.a as number) ?? 0;
        const b = (inputs.b as number) ?? 1;
        return { out: a % b };
    }
};

export const sin: NodeDefinition = {
    namespace: 'core',
    category: 'math',
    name: 'sin',
    requires: { a: 'number' },
    provides: { out: 'number' },
    execute: (inputs, params) => {
        const a = (inputs.a as number) ?? 0;
        return { out: Math.sin(a) };
    }
};

export const cos: NodeDefinition = {
    namespace: 'core',
    category: 'math',
    name: 'cos',
    requires: { a: 'number' },
    provides: { out: 'number' },
    execute: (inputs, params) => {
        const a = (inputs.a as number) ?? 0;
        return { out: Math.cos(a) };
    }
};

export const tan: NodeDefinition = {
    namespace: 'core',
    category: 'math',
    name: 'tan',
    requires: { a: 'number' },
    provides: { out: 'number' },
    execute: (inputs, params) => {
        const a = (inputs.a as number) ?? 0;
        return { out: Math.tan(a) };
    }
};

export const abs: NodeDefinition = {
    namespace: 'core',
    category: 'math',
    name: 'abs',
    requires: { a: 'number' },
    provides: { out: 'number' },
    execute: (inputs, params) => {
        const a = (inputs.a as number) ?? 0;
        return { out: Math.abs(a) };
    }
};

export const round: NodeDefinition = {
    namespace: 'core',
    category: 'math',
    name: 'round',
    requires: { a: 'number' },
    provides: { out: 'number' },
    execute: (inputs, params) => {
        const a = (inputs.a as number) ?? 0;
        return { out: Math.round(a) };
    }
};





