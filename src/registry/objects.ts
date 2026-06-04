import { NodeDefinition } from './types.js';

export const getField: NodeDefinition = {
    namespace: 'core',
    category: 'object',
    name: 'get',
    requires: { obj: 'any', path: 'string' },
    provides: { value: 'any' },
    execute: (inputs) => {
        const obj = inputs.obj;
        const path = (inputs.path as string) || '';
        if (obj === null || obj === undefined) return { value: null };
        if (!path) return { value: obj };

        try {
            const parts = path.split('.');
            let current = obj as any;
            for (const part of parts) {
                if (current === null || current === undefined) {
                    current = null;
                    break;
                }
                current = current[part];
            }
            return { value: current === undefined ? null : current };
        } catch (e) {
            return { value: null };
        }
    }
};

function setPath(obj: any, pathParts: string[], value: any): any {
    if (pathParts.length === 0) return value;
    const [head, ...tail] = pathParts;
    const isArray = !isNaN(Number(head));
    
    let cloned: any;
    if (obj && typeof obj === 'object') {
        cloned = Array.isArray(obj) ? [...obj] : { ...obj };
    } else {
        cloned = isArray ? [] : {};
    }
    
    cloned[head] = setPath(cloned[head], tail, value);
    return cloned;
}

export const setField: NodeDefinition = {
    namespace: 'core',
    category: 'object',
    name: 'set',
    requires: { obj: 'any', path: 'string', value: 'any' },
    provides: { out: 'any' },
    execute: (inputs) => {
        const obj = inputs.obj;
        const path = (inputs.path as string) || '';
        const value = inputs.value;
        
        if (!path) return { out: value };
        
        try {
            const parts = path.split('.');
            const result = setPath(obj, parts, value);
            return { out: result };
        } catch (e) {
            return { out: obj };
        }
    }
};

export const parseJson: NodeDefinition = {
    namespace: 'core',
    category: 'object',
    name: 'parse',
    requires: { json: 'string' },
    provides: { out: 'any' },
    execute: (inputs) => {
        const json = (inputs.json as string) ?? '';
        if (!json) return { out: null };
        try {
            return { out: JSON.parse(json) };
        } catch (e) {
            return { out: null };
        }
    }
};

export const stringifyJson: NodeDefinition = {
    namespace: 'core',
    category: 'object',
    name: 'stringify',
    requires: { obj: 'any' },
    provides: { out: 'string' },
    execute: (inputs) => {
        const obj = inputs.obj;
        if (obj === undefined) return { out: 'undefined' };
        try {
            return { out: JSON.stringify(obj) };
        } catch (e) {
            return { out: '' };
        }
    }
};
