import { GraphState } from '../core/ast.js';

export interface SchemaDriver {
    readonly id: string;
    readonly name: string;
    readonly extension: string;
    
    /**
     * Parses a binary buffer of the schema file into a GraphState.
     */
    importSchema(buffer: Buffer): Promise<GraphState>;
    
    /**
     * Serializes the GraphState into a binary file buffer.
     */
    exportSchema(graph: GraphState): Promise<Buffer>;
}
