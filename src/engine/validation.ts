import { GraphState, PinType } from '../core/ast.js';
import { NodeRegistry } from '../registry/types.js';
import { getNodeInputs, getNodeOutputs } from '../registry/index.js';

/**
 * Checks if a source PinType is compatible with a target PinType.
 * 'any' is compatible with everything.
 * For basic types (string), they must match exactly.
 * For Tensor types, dtype must match and shapes must match exactly (length and elements).
 */
export const isCompatible = (source: PinType, target: PinType): boolean => {
    // Crucial rule: 'any' is compatible with all types. Return true if source fits in target.
    if (source === 'any' || target === 'any') {
        return true;
    }

    if (typeof source === 'string' && typeof target === 'string') {
        return source === target;
    }

    if (typeof source === 'object' && typeof target === 'object') {
        if (source.type === 'tensor' && target.type === 'tensor') {
            if (source.dtype !== target.dtype) {
                return false;
            }
            if (source.shape.length !== target.shape.length) {
                return false;
            }
            for (let i = 0; i < source.shape.length; i++) {
                const sDim = source.shape[i];
                const tDim = target.shape[i];
                const isDynamicSource = sDim === -1 || sDim === null || sDim === undefined;
                const isDynamicTarget = tDim === -1 || tDim === null || tDim === undefined;
                if (!isDynamicSource && !isDynamicTarget && sDim !== tDim) {
                    return false;
                }
            }
            return true;
        }
    }

    return false;
};

/**
 * Static graph validation.
 * Performs deep checks for node existence, pin existence, single-source connections, and type safety.
 * Returns a dictionary of errors mapped to NodeIDs.
 */
export function resolveGraphTypes(graph: GraphState, registry?: NodeRegistry): {
    inputs: Record<string, Record<string, PinType>>;
    outputs: Record<string, Record<string, PinType>>;
} {
    const resolvedInputs: Record<string, Record<string, PinType>> = {};
    const resolvedOutputs: Record<string, Record<string, PinType>> = {};

    // 1. Initialize with base types
    for (const nodeId in graph.nodes) {
        const node = graph.nodes[nodeId];
        resolvedInputs[node.id] = { ...getNodeInputs(node, undefined, registry) };
        resolvedOutputs[node.id] = { ...getNodeOutputs(node, undefined, registry) };
    }

    // 2. Perform forward/backward propagation passes (3 iterations)
    for (let iter = 0; iter < 3; iter++) {
        let changed = false;

        graph.edges.forEach(edge => {
            const sourceOutputs = resolvedOutputs[edge.sourceNodeId];
            const targetInputs = resolvedInputs[edge.targetNodeId];

            if (!sourceOutputs || !targetInputs) return;

            const sourceType = sourceOutputs[edge.sourcePinId];
            const targetType = targetInputs[edge.targetPinId];

            if (sourceType === 'any' && targetType !== 'any' && targetType !== undefined) {
                sourceOutputs[edge.sourcePinId] = targetType;
                changed = true;
            }
            if (targetType === 'any' && sourceType !== 'any' && sourceType !== undefined) {
                targetInputs[edge.targetPinId] = sourceType;
                changed = true;
            }
        });

        if (!changed) break;
    }

    return { inputs: resolvedInputs, outputs: resolvedOutputs };
}

export const getGraphValidationErrors = (
    graph: GraphState,
    registry: NodeRegistry
): Record<string, string> => {
    const errors: Record<string, string> = {};
    const seenTargets = new Set<string>();
    
    // Resolve all wildcard types first!
    const resolved = resolveGraphTypes(graph, registry);

    for (const edge of graph.edges) {
        const sourceNode = graph.nodes[edge.sourceNodeId];
        const targetNode = graph.nodes[edge.targetNodeId];

        if (!sourceNode) {
            errors[edge.sourceNodeId] = `Invalid edge ${edge.id}: Source node not found.`;
            continue;
        }
        if (!targetNode) {
            errors[edge.targetNodeId] = `Invalid edge ${edge.id}: Target node not found.`;
            continue;
        }

        if (sourceNode.type === 'molecule/unconfigured' || targetNode.type === 'molecule/unconfigured') {
            continue;
        }

        // Check for multiple inputs to the same pin (single-source dataflow invariant)
        const targetPinKey = `${edge.targetNodeId}.${edge.targetPinId}`;
        if (seenTargets.has(targetPinKey)) {
            errors[edge.targetNodeId] = `Conflict: Input pin '${edge.targetPinId}' has multiple incoming connections.`;
            continue;
        }
        seenTargets.add(targetPinKey);

        const sourceType = getNodeOutputs(sourceNode, resolved.outputs, registry)[edge.sourcePinId];
        const targetType = getNodeInputs(targetNode, resolved.inputs, registry)[edge.targetPinId];

        if (sourceType === undefined) {
            errors[edge.sourceNodeId] = `Invalid edge ${edge.id}: Source pin '${edge.sourcePinId}' does not exist on definition '${sourceNode.type}'.`;
            continue;
        }
        if (targetType === undefined) {
            errors[edge.targetNodeId] = `Invalid edge ${edge.id}: Target pin '${edge.targetPinId}' does not exist on definition '${targetNode.type}'.`;
            continue;
        }

        if (!isCompatible(sourceType, targetType)) {
            errors[edge.targetNodeId] = `Type validation failed at edge ${edge.id}: Source pin '${edge.sourcePinId}' (${JSON.stringify(sourceType)}) is incompatible with target pin '${edge.targetPinId}' (${JSON.stringify(targetType)}).`;
        }
    }

    return errors;
};

/**
 * Validates the graph edges based on pin types using isCompatible.
 * Throws an error if any edge connects incompatible pins.
 */
export const validateGraph = (graph: GraphState, registry: NodeRegistry): void => {
    const errors = getGraphValidationErrors(graph, registry);
    const firstError = Object.values(errors)[0];
    if (firstError) {
        throw new Error(firstError);
    }
};
