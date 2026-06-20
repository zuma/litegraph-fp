// ============================================================================
// 3. NODE LOGIC REGISTRY
// ============================================================================

/**
 * A pure Node execution function signature.
 * It takes the resolved inputs from previous edges and internal parameters.
 * Must be completely pure and return a Promise or primitive Record.
 *
 * An optional AbortSignal is provided by the engine's watchdog. Async nodes
 * should check signal.aborted and clean up internal work (timers, fetches)
 * when the engine cancels them due to timeout.
 */
export type NodeFunction = (
    inputs: Record<string, unknown>, 
    params: Record<string, unknown>,
    signal?: AbortSignal,
    context?: { actions?: ReadonlyArray<any> }
) => Promise<Record<string, unknown>> | Record<string, unknown>;

import { PinType } from '../core/ast.js';

export interface NodeActionContext {
    readonly pushToHistory: () => void;
    readonly commitPreEditToHistory: () => void;
    readonly triggerAutoRun: () => void;
    readonly updateInspector: () => void;
    readonly logToTerminal: (msg: string, type?: 'system-msg' | 'error' | 'user-input') => void;
    readonly updateNodeParam: (nodeId: string, paramKey: string, val: any) => void;
    readonly appState: any;
}

export interface NodeAction {
    readonly id: string;
    readonly label: string;
    readonly handler: (node: { id: string; params: Record<string, any>; type: string }, context: NodeActionContext) => void | Promise<void>;
}

/**
 * Metadata surrounding a node executor, placing it within the strict ecosystem taxonomy.
 */
export interface NodeDefinition {
    /** The top-level tier (e.g., "core", "io", "cad", "custom") */
    namespace: string;
    /** The specific domain group (e.g., "math", "logic", "scripting") */
    category: string;
    /** The actual node name (e.g., "add", "python_script") */
    name: string;
    /** Describes what the node does */
    description?: string;
    
    /** Static analysis mappings defining required input keys and their types */
    requires: Record<string, PinType>;
    /** Static analysis mappings defining provided output keys and their types */
    provides: Record<string, PinType>;
    
    /** Indicates if the node type supports custom input slots added by the user */
    dynamicInputs?: boolean;
    /** Indicates if the node type supports custom output slots added by the user */
    dynamicOutputs?: boolean;

    /** Interactive buttons or callbacks that can be run on the node */
    readonly actions?: ReadonlyArray<NodeAction>;

    /** The pure execution block */
    execute: NodeFunction;
}

/**
 * A registry linking node identifiers (e.g., "core/math/add") to full NodeDefinitions.
 */
export type NodeRegistry = Readonly<Record<string, NodeDefinition>>;
