import { NodeState, PinType } from './ast.js';

export interface CreateNodeOptions {
    readonly id: string;
    readonly type: string;
    readonly mode?: NodeState['mode'];
    readonly params?: Record<string, unknown>;
    readonly inputs?: Record<string, PinType>;
    readonly outputs?: Record<string, PinType>;
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
        mode: options.mode,
        params: Object.freeze({ ...options.params }),
        inputs: Object.freeze({ ...options.inputs }),
        outputs: Object.freeze({ ...options.outputs }),
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
