import { NodeID } from '../core/ast.js';

/**
 * Represents an impure side-effect requested by a pure node.
 */
export interface Command {
    readonly type: string;
    readonly payload: Readonly<Record<string, unknown>>;
}

/**
 * A handler function executed by the impure edge-layer when a command is caught.
 */
export type SideEffectHandler = (command: Command, sourceNodeId: NodeID) => void | Promise<void>;
