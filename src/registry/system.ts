import { NodeDefinition } from './types.js';

export const delaySim: NodeDefinition = {
    namespace: 'system',
    category: 'simulation',
    name: 'delay',
    requires: { a: 'any' },
    provides: { out: 'any' },
    execute: async (inputs, params, signal?) => {
        const delayMs = (params.ms as number) ?? 1000;
        const a = inputs.a;
        
        await new Promise<void>((resolve, reject) => {
            const timerId = setTimeout(resolve, delayMs);
            signal?.addEventListener('abort', () => {
                clearTimeout(timerId);
                reject(new Error('Aborted by engine watchdog.'));
            });
        });
        
        return { out: a };
    }
};

export const logToConsole: NodeDefinition = {
    namespace: 'system',
    category: 'debug',
    name: 'log',
    requires: { msg: 'any' },
    provides: { out: 'any' },
    execute: (inputs) => {
        const message = inputs.msg ?? "undefined";
        return {
            out: message,
            $commands: [
                { type: 'CONSOLE_LOG', payload: { message } }
            ]
        };
    }
};

export const state: NodeDefinition = {
    namespace: 'system',
    category: 'state',
    name: 'state',
    requires: { nextValue: 'any' },
    provides: { value: 'any' },
    execute: (inputs, params) => {
        // The state node outputs its current 'value'.
        // If no value is provided in inputs (meaning it's the first tick or not set),
        // it falls back to the defaultValue param.
        return { value: inputs.value ?? params.defaultValue };
    }
};
