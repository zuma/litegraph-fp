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
    signal?: AbortSignal
) => Promise<Record<string, unknown>> | Record<string, unknown>;

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
    
    /** Static analysis arrays defining required input keys and provided output keys */
    requires: string[];
    provides: string[];

    /** The pure execution block */
    execute: NodeFunction;
}

/**
 * A registry linking node identifiers (e.g., "core/math/add") to full NodeDefinitions.
 */
export type NodeRegistry = Readonly<Record<string, NodeDefinition>>;
