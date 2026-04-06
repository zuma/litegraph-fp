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
 * A registry linking node typestrings (e.g., "math/add") to pure NodeFunctions.
 */
export type NodeRegistry = Readonly<Record<string, NodeFunction>>;
