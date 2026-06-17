import { SchemaDriver } from '../types.js';
import { GraphState, PinType } from '../../core/ast.js';
import { DatabaseSync } from 'node:sqlite';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SCRATCH_DIR = path.resolve(__dirname, '../../../../scratch');

export const SqliteDriver: SchemaDriver = {
    id: 'sqlite',
    name: 'SQLite Database',
    extension: '.db',

    async importSchema(buffer: Buffer): Promise<GraphState> {
        fs.mkdirSync(SCRATCH_DIR, { recursive: true });
        const tempPath = path.join(SCRATCH_DIR, `import_${Date.now()}_${Math.floor(Math.random() * 1000)}.db`);
        fs.writeFileSync(tempPath, buffer);

        const db = new DatabaseSync(tempPath);
        
        // 1. Get layout metadata if exists
        let layoutMetadata: Record<string, { x: number; y: number; title?: string }> | null = null;
        try {
            const row = db.prepare("SELECT value FROM _litegraph_metadata WHERE key = 'canvas_layout'").get() as { value: string } | undefined;
            if (row) {
                layoutMetadata = JSON.parse(row.value);
            }
        } catch (e) {
            // Table doesn't exist, ignore
        }

        // 2. Parse standard SQLite tables
        const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_litegraph_%'").all() as { name: string }[];
        
        const nodes: Record<string, any> = {};
        const edges: any[] = [];
        
        const tableNodeIds: Record<string, string> = {};
        tables.forEach(t => {
            tableNodeIds[t.name] = `table_${t.name}`;
        });

        tables.forEach(t => {
            const tableName = t.name;
            const nodeId = tableNodeIds[tableName];
            
            const columns = db.prepare(`PRAGMA table_info(${tableName})`).all() as { name: string; type: string; pk: number; notnull: number; dflt_value: any }[];
            const fks = db.prepare(`PRAGMA foreign_key_list(${tableName})`).all() as { table: string; from: string; to: string }[];
            
            const inputs: Record<string, PinType> = {};
            const outputs: Record<string, PinType> = {};
            const columnsSchema: Record<string, string> = {};
            
            columns.forEach(col => {
                let typeDef = col.type || 'TEXT';
                if (col.pk === 1) {
                    typeDef += ' PRIMARY KEY';
                }
                if (col.notnull === 1) {
                    typeDef += ' NOT NULL';
                }
                if (col.dflt_value !== null) {
                    typeDef += ` DEFAULT ${col.dflt_value}`;
                }
                columnsSchema[col.name] = typeDef;
                outputs[col.name] = 'any';
            });

            fks.forEach(fk => {
                inputs[fk.from] = 'any';
            });

            // Restore position from layoutMetadata if present, otherwise default to spawn grid
            const metadata = layoutMetadata ? layoutMetadata[nodeId] : null;
            const ui = {
                x: metadata ? metadata.x : 100,
                y: metadata ? metadata.y : 100,
                title: metadata?.title || tableName
            };

            nodes[nodeId] = {
                id: nodeId,
                type: 'database/table',
                mode: 'generic',
                params: {
                    tableName: tableName,
                    columns: columnsSchema
                },
                inputs,
                outputs,
                ui
            };

            fks.forEach((fk, idx) => {
                const sourceTableNodeId = tableNodeIds[fk.table];
                if (sourceTableNodeId) {
                    edges.push({
                        id: `edge_fk_${tableName}_${fk.from}_${idx}`,
                        sourceNodeId: sourceTableNodeId,
                        sourcePinId: fk.to,
                        targetNodeId: nodeId,
                        targetPinId: fk.from
                    });
                }
            });
        });

        db.close();
        try {
            fs.unlinkSync(tempPath);
        } catch (e) {
            // ignore
        }

        return { nodes, edges };
    },

    async exportSchema(graph: GraphState): Promise<Buffer> {
        fs.mkdirSync(SCRATCH_DIR, { recursive: true });
        const tempPath = path.join(SCRATCH_DIR, `export_${Date.now()}_${Math.floor(Math.random() * 1000)}.db`);

        const db = new DatabaseSync(tempPath);
        
        // 1. Export tables
        const tableNodes = Object.values(graph.nodes).filter(n => n.type === 'database/table');
        
        tableNodes.forEach(node => {
            const tableName = node.params.tableName as string;
            const columnsSchema = (node.params.columns as Record<string, string>) || {};
            
            const fks = graph.edges.filter(e => e.targetNodeId === node.id);
            
            const columnDefinitions: string[] = [];
            Object.entries(columnsSchema).forEach(([colName, colType]) => {
                columnDefinitions.push(`"${colName}" ${colType}`);
            });

            fks.forEach(edge => {
                const sourceNode = graph.nodes[edge.sourceNodeId];
                if (sourceNode && sourceNode.params && sourceNode.params.tableName) {
                    const targetTable = sourceNode.params.tableName as string;
                    columnDefinitions.push(`FOREIGN KEY ("${edge.targetPinId}") REFERENCES "${targetTable}" ("${edge.sourcePinId}")`);
                }
            });

            const ddl = `CREATE TABLE "${tableName}" (\n  ${columnDefinitions.join(',\n  ')}\n);`;
            db.exec(ddl);
        });

        // 2. Export metadata table with canvas coordinates
        db.exec("CREATE TABLE _litegraph_metadata (key TEXT PRIMARY KEY, value TEXT);");
        
        const layoutMap: Record<string, { x: number; y: number; title?: string }> = {};
        Object.values(graph.nodes).forEach(n => {
            layoutMap[n.id] = {
                x: n.ui?.x ?? 100,
                y: n.ui?.y ?? 100,
                title: n.ui?.title
            };
        });

        const insertStmt = db.prepare("INSERT INTO _litegraph_metadata (key, value) VALUES (?, ?)");
        insertStmt.run('canvas_layout', JSON.stringify(layoutMap));

        db.close();

        const buffer = fs.readFileSync(tempPath);
        try {
            fs.unlinkSync(tempPath);
        } catch (e) {
            // ignore
        }

        return buffer;
    }
};
