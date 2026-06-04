import { NodeDefinition } from './types.js';

export const arrayLength: NodeDefinition = {
    namespace: 'core',
    category: 'array',
    name: 'length',
    requires: { array: 'any' },
    provides: { out: 'number' },
    execute: (inputs) => {
        const arr = inputs.array;
        if (Array.isArray(arr)) {
            return { out: arr.length };
        }
        return { out: 0 };
    }
};

export const arraySlice: NodeDefinition = {
    namespace: 'core',
    category: 'array',
    name: 'slice',
    requires: { array: 'any', start: 'number', end: 'number' },
    provides: { out: 'any' },
    execute: (inputs) => {
        const arr = inputs.array;
        const start = (inputs.start as number) ?? 0;
        const end = (inputs.end as number) ?? undefined;
        if (Array.isArray(arr)) {
            return { out: arr.slice(start, end) };
        }
        return { out: [] };
    }
};
