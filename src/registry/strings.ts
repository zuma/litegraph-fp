import { NodeDefinition } from './types.js';

export const concat: NodeDefinition = {
    namespace: 'core',
    category: 'string',
    name: 'concat',
    requires: { a: 'string', b: 'string' },
    provides: { out: 'string' },
    execute: (inputs) => {
        const a = (inputs.a as string) ?? '';
        const b = (inputs.b as string) ?? '';
        return { out: a + b };
    }
};

export const split: NodeDefinition = {
    namespace: 'core',
    category: 'string',
    name: 'split',
    requires: { text: 'string', separator: 'string' },
    provides: { array: 'any' },
    execute: (inputs) => {
        const text = (inputs.text as string) ?? '';
        const separator = (inputs.separator as string) ?? '';
        return { array: text.split(separator) };
    }
};

export const replace: NodeDefinition = {
    namespace: 'core',
    category: 'string',
    name: 'replace',
    requires: { text: 'string', search: 'string', replace: 'string' },
    provides: { out: 'string' },
    execute: (inputs) => {
        const text = (inputs.text as string) ?? '';
        const search = (inputs.search as string) ?? '';
        const rep = (inputs.replace as string) ?? '';
        return { out: text.replace(search, rep) };
    }
};

export const length: NodeDefinition = {
    namespace: 'core',
    category: 'string',
    name: 'length',
    requires: { text: 'string' },
    provides: { out: 'number' },
    execute: (inputs) => {
        const text = (inputs.text as string) ?? '';
        return { out: text.length };
    }
};
