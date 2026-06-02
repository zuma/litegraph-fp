// ============================================================================
// 1. GRAPH ABSTRACT SYNTAX TREE (AST)
// ============================================================================

export type NodeID = string;

/**
 * Definition for a Tensor Type.
 */
export interface TensorType {
    type: 'tensor';
    dtype: string;
    shape: (number | null | undefined)[];
}

/**
 * Valid pin data schemas.
 */
export type PinType = 'any' | 'number' | 'string' | 'boolean' | TensorType | string;

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
