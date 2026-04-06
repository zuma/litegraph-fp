import { NodeFunction } from './types.js';

export const invertBoolean: NodeFunction = (inputs, params) => {
    const a = (inputs.a as boolean) ?? false;
    return { out: !a };
};
