import { NodeID } from '../core/ast.js';
import { Command } from '../events/types.js';

// ============================================================================
// 2. EXECUTION & STATE DICTIONARIES
// ============================================================================

export type NodeExecuteFn = (
    inputs: Record<string, unknown>,
    params: Record<string, unknown>,
    signal?: AbortSignal
) => Promise<Record<string, unknown>>;

export type Middleware = (
    nodeId: NodeID,
    nodeType: string,
    next: NodeExecuteFn,
    context?: { readonly mode?: string }
) => NodeExecuteFn;

/**
 * Configuration options for the graph evaluation engine.
 */
export interface EngineConfig {
    readonly executionMode: 'serial' | 'parallel';
    readonly nodeTimeoutMs?: number; // Mars-grade timeout watchdog
    readonly middlewares?: ReadonlyArray<Middleware>;
    readonly cache?: Map<string, { inputs: any; params: any; outputs: any }>;
}

/**
 * The temporary dictionary holding the propagated values 
 * passing through cables during execution.
 */
export type ExecutionState = Readonly<Record<string, unknown>>;

/**
 * Payload returned by the engine after a full topological evaluation.
 * Contains the frozen state, a strict dictionary of nodes that critically failed,
 * and any side-effect commands extracted from node outputs.
 */
export interface ExecutionResult {
    readonly state: ExecutionState;
    readonly errors: Readonly<Record<NodeID, string>>;
    readonly commands: Readonly<Record<NodeID, Command[]>>;
}
