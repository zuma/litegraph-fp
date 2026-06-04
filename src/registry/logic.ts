import { NodeDefinition } from './types.js';

export const invertBoolean: NodeDefinition = {
    namespace: 'core',
    category: 'logic',
    name: 'invertBoolean',
    requires: { a: 'boolean' },
    provides: { out: 'boolean' },
    execute: (inputs, params) => {
        const a = (inputs.a as boolean) ?? false;
        return { out: !a };
    }
};

export const logicAnd: NodeDefinition = {
    namespace: 'core',
    category: 'logic',
    name: 'and',
    requires: { a: 'boolean', b: 'boolean' },
    provides: { out: 'boolean' },
    execute: (inputs) => {
        const a = (inputs.a as boolean) ?? false;
        const b = (inputs.b as boolean) ?? false;
        return { out: a && b };
    }
};

export const logicOr: NodeDefinition = {
    namespace: 'core',
    category: 'logic',
    name: 'or',
    requires: { a: 'boolean', b: 'boolean' },
    provides: { out: 'boolean' },
    execute: (inputs) => {
        const a = (inputs.a as boolean) ?? false;
        const b = (inputs.b as boolean) ?? false;
        return { out: a || b };
    }
};

export const logicXor: NodeDefinition = {
    namespace: 'core',
    category: 'logic',
    name: 'xor',
    requires: { a: 'boolean', b: 'boolean' },
    provides: { out: 'boolean' },
    execute: (inputs) => {
        const a = (inputs.a as boolean) ?? false;
        const b = (inputs.b as boolean) ?? false;
        return { out: a !== b };
    }
};


