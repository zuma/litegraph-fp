import { NodeFunction } from './types.js';

export const delaySim: NodeFunction = async (inputs, params, signal?) => {
    const delayMs = (params.ms as number) ?? 1000;
    const a = inputs.a;
    
    // Simulate an async computational/API delay.
    // Uses AbortSignal so the engine's watchdog can cancel this cleanly.
    await new Promise<void>((resolve, reject) => {
        const timerId = setTimeout(resolve, delayMs);
        signal?.addEventListener('abort', () => {
            clearTimeout(timerId);
            reject(new Error('Aborted by engine watchdog.'));
        });
    });
    
    return { out: a };
};

export const logToConsole: NodeFunction = (inputs) => {
    const message = inputs.msg ?? "undefined";
    return {
        // Echo out the message on the normal pin
        out: message,
        // Push an explicit side-effect command
        $commands: [
            { type: 'CONSOLE_LOG', payload: { message } }
        ]
    };
};
