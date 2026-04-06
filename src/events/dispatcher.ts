import { ExecutionResult } from '../engine/types.js';
import { Command, SideEffectHandler } from './types.js';

// ============================================================================
// IMPURE BOUNDARY (Side-Effect Dispatch)
// ============================================================================

/**
 * The shape of a dispatcher instance. Kept as a plain interface
 * rather than a class to stay consistent with the project's POJO philosophy.
 */
export interface Dispatcher {
    on: (type: string, handler: SideEffectHandler) => void;
    dispatchFromExecution: (result: ExecutionResult) => Promise<void>;
}

/**
 * Factory function that creates an impure side-effect dispatcher.
 * Uses a closure over a Map instead of a class with private mutable state,
 * keeping the impure boundary explicit while staying true to the project's
 * functional, no-class architecture (see system_rules.md Rule 3).
 */
export const createDispatcher = (): Dispatcher => {
    const handlers = new Map<string, SideEffectHandler[]>();

    const on = (type: string, handler: SideEffectHandler) => {
        const existing = handlers.get(type);
        if (existing) {
            existing.push(handler);
        } else {
            handlers.set(type, [handler]);
        }
    };

    const executeCommand = async (command: Command, sourceNodeId: string) => {
        const typeHandlers = handlers.get(command.type) ?? [];
        for (const handler of typeHandlers) {
            try {
                await handler(command, sourceNodeId);
            } catch (e) {
                console.error(`SideEffect Error [${command.type}] from Node ${sourceNodeId}:`, e);
            }
        }
    };

    /**
     * Reads the first-class `commands` dictionary from ExecutionResult
     * and dispatches each command to its registered handlers.
     */
    const dispatchFromExecution = async (result: ExecutionResult) => {
        for (const [nodeId, commands] of Object.entries(result.commands)) {
            if (Array.isArray(commands)) {
                for (const cmd of commands) {
                    await executeCommand(cmd, nodeId);
                }
            }
        }
    };

    return { on, dispatchFromExecution };
};
