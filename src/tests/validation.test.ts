import { describe, it, expect } from 'vitest';
import { isCompatible, validateGraph } from '../engine/validation.js';
import { GraphState, PinType } from '../core/ast.js';
import { NodeRegistry } from '../registry/types.js';

describe('Type Validation', () => {
    describe('isCompatible', () => {
        it('should allow any to target anything', () => {
            expect(isCompatible('any', 'number')).toBe(true);
            expect(isCompatible('any', 'string')).toBe(true);
            expect(isCompatible('any', { type: 'tensor', dtype: 'float32', shape: [2, 2] })).toBe(true);
        });

        it('should allow anything to target any', () => {
            expect(isCompatible('number', 'any')).toBe(true);
            expect(isCompatible('string', 'any')).toBe(true);
            expect(isCompatible({ type: 'tensor', dtype: 'float32', shape: [2, 2] }, 'any')).toBe(true);
        });

        it('should allow matching basic types', () => {
            expect(isCompatible('number', 'number')).toBe(true);
            expect(isCompatible('boolean', 'boolean')).toBe(true);
        });

        it('should allow non-matching basic types', () => {
            expect(isCompatible('number', 'boolean')).toBe(true);
            expect(isCompatible('string', 'number')).toBe(true);
        });

        it('should match identical tensors', () => {
            const t1: PinType = { type: 'tensor', dtype: 'uint8', shape: [512, 512, 4] };
            const t2: PinType = { type: 'tensor', dtype: 'uint8', shape: [512, 512, 4] };
            expect(isCompatible(t1, t2)).toBe(true);
        });

        it('should allow tensors with mismatched dtypes', () => {
            const t1: PinType = { type: 'tensor', dtype: 'uint8', shape: [512, 512, 4] };
            const t2: PinType = { type: 'tensor', dtype: 'float32', shape: [512, 512, 4] };
            expect(isCompatible(t1, t2)).toBe(true);
        });

        it('should allow tensors with mismatched shapes', () => {
            const t1: PinType = { type: 'tensor', dtype: 'float32', shape: [100, 10] };
            const t2: PinType = { type: 'tensor', dtype: 'float32', shape: [100, 5] };
            expect(isCompatible(t1, t2)).toBe(true);
        });

        it('should match dynamic tensor dimensions using wildcards (-1, null, undefined)', () => {
            const tDynamic: PinType = { type: 'tensor', dtype: 'float32', shape: [-1, null, undefined, 256] };
            const tConcrete: PinType = { type: 'tensor', dtype: 'float32', shape: [32, 100, 50, 256] };
            expect(isCompatible(tDynamic, tConcrete)).toBe(true);
            expect(isCompatible(tConcrete, tDynamic)).toBe(true);
        });
    });

    describe('validateGraph', () => {
        const mockRegistry: NodeRegistry = {
            'mock/producer': {
                namespace: 'mock',
                category: 'test',
                name: 'producer',
                requires: {},
                provides: { out_num: 'number', out_bool: 'boolean', out_any: 'any' },
                execute: () => ({ out_num: 1, out_bool: true, out_any: 'val' })
            },
            'mock/consumer': {
                namespace: 'mock',
                category: 'test',
                name: 'consumer',
                requires: { in_num: 'number' },
                provides: {},
                execute: () => ({})
            }
        };

        it('should pass valid graphs', () => {
            const graph: GraphState = {
                nodes: {
                    'n1': { id: 'n1', type: 'mock/producer', params: {} },
                    'n2': { id: 'n2', type: 'mock/consumer', params: {} }
                },
                edges: [
                    { id: 'e1', sourceNodeId: 'n1', sourcePinId: 'out_num', targetNodeId: 'n2', targetPinId: 'in_num' }
                ]
            };

            expect(() => validateGraph(graph, mockRegistry)).not.toThrow();
        });

        it('should allow incompatible types because the canvas is permissive', () => {
            const graph: GraphState = {
                nodes: {
                    'n1': { id: 'n1', type: 'mock/producer', params: {} },
                    'n2': { id: 'n2', type: 'mock/consumer', params: {} }
                },
                edges: [
                    { id: 'e1', sourceNodeId: 'n1', sourcePinId: 'out_bool', targetNodeId: 'n2', targetPinId: 'in_num' }
                ]
            };

            expect(() => validateGraph(graph, mockRegistry)).not.toThrow();
        });

        it('should allow any to satisfy requirements', () => {
            const graph: GraphState = {
                nodes: {
                    'n1': { id: 'n1', type: 'mock/producer', params: {} },
                    'n2': { id: 'n2', type: 'mock/consumer', params: {} }
                },
                edges: [
                    { id: 'e1', sourceNodeId: 'n1', sourcePinId: 'out_any', targetNodeId: 'n2', targetPinId: 'in_num' }
                ]
            };

            expect(() => validateGraph(graph, mockRegistry)).not.toThrow();
        });
    });
});
