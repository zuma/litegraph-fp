import { NodeState, PinType, ActionState, Edge } from './ast.js';

export interface CreateNodeOptions {
    readonly id: string;
    readonly type: string;
    readonly actions?: ReadonlyArray<ActionState>;
    readonly params?: Record<string, unknown>;
    readonly inputs?: Record<string, PinType>;
    readonly outputs?: Record<string, PinType>;
    readonly nodes?: Record<string, NodeState>;
    readonly edges?: ReadonlyArray<Edge>;
    readonly ui?: {
        readonly x: number;
        readonly y: number;
        readonly width?: number;
        readonly height?: number;
        readonly title?: string;
        readonly isMorphing?: boolean;
    };
}

/**
 * Functional factory to instantiate a clean, default-filled, and deep-frozen NodeState boilerplate.
 * Enforces the immutability directive and provides structural commonality across all node instances.
 */
export function createNodeState(options: CreateNodeOptions): NodeState {
    return {
        id: options.id,
        type: options.type,
        actions: Object.freeze(options.actions ? [...options.actions] : []),
        params: Object.freeze({ ...options.params }),
        inputs: Object.freeze({ ...options.inputs }),
        outputs: Object.freeze({ ...options.outputs }),
        nodes: options.nodes ? Object.freeze({ ...options.nodes }) : undefined,
        edges: options.edges ? Object.freeze([...options.edges]) : undefined,
        ui: Object.freeze({
            x: options.ui?.x ?? 0,
            y: options.ui?.y ?? 0,
            width: options.ui?.width,
            height: options.ui?.height,
            title: options.ui?.title ?? options.type.split('/')[1]?.toUpperCase() ?? 'NODE',
            isMorphing: options.ui?.isMorphing ?? false
        })
    };
}
