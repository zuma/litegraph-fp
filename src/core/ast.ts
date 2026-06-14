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

export type NodeMode = 'python' | 'formula' | 'blocks' | 'state' | 'delay' | 'input' | 'log';

export interface BlockStatement {
    readonly id: string;
    readonly targetVar: string;
    readonly operand1: string;
    readonly operator: '+' | '-' | '*' | '/' | 'and' | 'or' | '==';
    readonly operand2: string;
}

/**
 * Represents the pure, visual and declarative state of a single node.
 */
export interface NodeState {
    readonly id: NodeID;
    readonly type: string; // The functional identifier string (e.g., 'math/add' or 'generic')
    readonly mode?: NodeMode; // The execution mode of the stem cell node
    
    // Internal constants/parameters for the node logic (e.g. static values, code or formula)
    readonly params: Readonly<{
        readonly code?: string;
        readonly formula?: string;
        readonly blocks?: ReadonlyArray<BlockStatement>;
        readonly delayMs?: number;
        readonly defaultValue?: unknown;
        readonly value?: unknown;
        readonly [key: string]: unknown;
    }>;
    
    // Dynamic runtime overrides/additions to the node definition inputs and outputs
    readonly inputs?: Readonly<Record<string, PinType>>;
    readonly outputs?: Readonly<Record<string, PinType>>;
    
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
