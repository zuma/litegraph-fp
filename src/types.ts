/**
 * Core Data Structures for litegraph-fp
 * All structures must be purely representational, serializable POJOs.
 * No methods, no classes, no mutations.
 */

export type NodeID = string;

/**
 * Represents a directed link between an output of one node to the input of another.
 */
export interface Edge {
    readonly id: string;
    readonly sourceNodeId: NodeID;
    readonly sourcePinId: string;
    readonly targetNodeId: NodeID;
    readonly targetPinId: string;
}

/**
 * Represents the pure, visual and declarative state of a single node.
 */
export interface NodeState {
    readonly id: NodeID;
    readonly type: string; // The functional identifier string (e.g., 'math/add')
    
    // Internal constants/parameters for the node logic (e.g. static multiplier value)
    readonly params: Readonly<Record<string, unknown>>;
    
    // Purely for the rendering layer. The execution engine must ignore this.
    readonly ui?: Readonly<{
        x: number;
        y: number;
        width?: number;
        height?: number;
        title?: string;
    }>;
}

/**
 * The root immutable Abstract Syntax Tree of the entire graph logic.
 */
export interface GraphState {
    readonly nodes: Readonly<Record<NodeID, NodeState>>;
    readonly edges: ReadonlyArray<Edge>;
}

/**
 * The temporary dictionary holding the propagated values 
 * passing through cables during execution.
 */
export type ExecutionState = Readonly<Record<string, unknown>>;

/**
 * Configuration options for the graph evaluation engine.
 */
export interface EngineConfig {
    readonly executionMode: 'serial' | 'parallel';
    readonly nodeTimeoutMs?: number; // Mars-grade timeout watchdog
}

/**
 * Payload returned by the engine after a full topological evaluation.
 * Contains the frozen state, alongside a strict dictionary of nodes that critically failed.
 */
export interface ExecutionResult {
    readonly state: ExecutionState;
    readonly errors: Readonly<Record<NodeID, string>>;
}

/**
 * A pure Node execution function signature.
 * It takes the resolved inputs from previous edges and internal parameters.
 * Must be completely pure and return a Promise or primitive Record.
 */
export type NodeFunction = (
    inputs: Record<string, unknown>, 
    params: Record<string, unknown>
) => Promise<Record<string, unknown>> | Record<string, unknown>;

/**
 * A registry linking node typestrings (e.g., "math/add") to pure NodeFunctions.
 */
export type NodeRegistry = Readonly<Record<string, NodeFunction>>;
