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

export interface BlockStatement {
    readonly id: string;
    readonly targetVar: string;
    readonly operand1: string;
    readonly operator: '+' | '-' | '*' | '/' | 'and' | 'or' | '==';
    readonly operand2: string;
}

export interface ActionState {
    readonly id: string;
    readonly type: string; // e.g. 'formula', 'blocks', 'python', 'system/delay', 'system/state', etc.
    readonly params: Readonly<Record<string, any>>;
}

/**
 * Represents the pure, visual and declarative state of a single node.
 */
export interface NodeState {
    readonly id: NodeID;
    readonly type: string; // 'node/generic' or composite boundaries 'composite/input', 'composite/output'
    readonly actions?: ReadonlyArray<ActionState>;
    
    // Internal constants/parameters for the node logic
    readonly params: Readonly<{
        [key: string]: unknown;
    }>;
    
    // Dynamic runtime overrides/additions to the node definition inputs and outputs
    readonly inputs?: Readonly<Record<string, PinType>>;
    readonly outputs?: Readonly<Record<string, PinType>>;
    
    // Recursive Nesting: A node can act as a breadboard containing sub-nodes and sub-edges
    readonly nodes?: Readonly<Record<NodeID, NodeState>>;
    readonly edges?: ReadonlyArray<Edge>;
    
    // Boundary mappings (maps outer exposed pins to the inner components)
    readonly interfaceInputs?: ReadonlyArray<{ externalPinId: string; targetNodeId: NodeID; targetPinId: string }>;
    readonly interfaceOutputs?: ReadonlyArray<{ externalPinId: string; sourceNodeId: NodeID; sourcePinId: string }>;

    // Purely for the rendering layer. The execution engine must ignore this.
    readonly ui?: Readonly<{
        x: number;
        y: number;
        width?: number;
        height?: number;
        title?: string;
        isMorphing?: boolean;
    }>;
}

/**
 * The root immutable Abstract Syntax Tree of the entire graph logic.
 */
export interface GraphState {
    readonly nodes: Readonly<Record<NodeID, NodeState>>;
    readonly edges: ReadonlyArray<Edge>;
}
