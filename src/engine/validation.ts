import { GraphState, PinType } from '../core/ast.js';
import { NodeRegistry } from '../registry/types.js';

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
                if (source.shape[i] !== target.shape[i]) {
                    return false;
                }
            }
            return true;
        }
    }

    return false;
};

/**
 * Validates the graph edges based on pin types using isCompatible.
 * Throws an error if any edge connects incompatible pins.
 */
export const validateGraph = (graph: GraphState, registry: NodeRegistry): void => {
    // Check all edges for type compatibility
    for (const edge of graph.edges) {
        const sourceNode = graph.nodes[edge.sourceNodeId];
        const targetNode = graph.nodes[edge.targetNodeId];

        if (!sourceNode || !targetNode) {
            throw new Error(`Invalid edge ${edge.id}: Node not found.`);
        }

        const sourceDef = registry[sourceNode.type];
        const targetDef = registry[targetNode.type];

        if (!sourceDef || !targetDef) {
            throw new Error(`Invalid edge ${edge.id}: Node definition missing from registry.`);
        }

        const sourceType = sourceDef.provides[edge.sourcePinId];
        const targetType = targetDef.requires[edge.targetPinId];

        if (sourceType === undefined) {
            throw new Error(
                `Type validation failed at edge ${edge.id}: Source pin '${edge.sourcePinId}' does not exist on node definition '${sourceNode.type}'.`
            );
        }
        if (targetType === undefined) {
            throw new Error(
                `Type validation failed at edge ${edge.id}: Target pin '${edge.targetPinId}' does not exist on node definition '${targetNode.type}'.`
            );
        }

        if (!isCompatible(sourceType, targetType)) {
            throw new Error(
                `Type validation failed at edge ${edge.id}: Source pin '${edge.sourcePinId}' (${JSON.stringify(sourceType)}) is incompatible with target pin '${edge.targetPinId}' (${JSON.stringify(targetType)}).`
            );
        }
    }
};
