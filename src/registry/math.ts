import { NodeFunction } from './types.js';

export const add: NodeFunction = (inputs, params) => {
    const a = (inputs.a as number) ?? 0;
    const b = (inputs.b as number) ?? 0;
    return { out: a + b };
};

export const multiply: NodeFunction = (inputs, params) => {
    const a = (inputs.a as number) ?? 1;
    const b = (inputs.b as number) ?? 1;
    return { out: a * b };
};
