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

