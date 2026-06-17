import { getDriver } from '../dist/src/io/index.js';
import { DatabaseSync } from 'node:sqlite';
import fs from 'fs';
import path from 'path';

const tempDbPath = path.resolve('scratch/test_source.db');
const outputDbPath = path.resolve('scratch/test_output.db');

// Ensure scratch dir
if (!fs.existsSync('scratch')) {
    fs.mkdirSync('scratch');
}

async function runTest() {
    // 1. Create source database
    if (fs.existsSync(tempDbPath)) fs.unlinkSync(tempDbPath);
    const db = new DatabaseSync(tempDbPath);
    db.exec(`
        CREATE TABLE users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL,
            email TEXT UNIQUE
        );
        
        CREATE TABLE posts (
            id INTEGER PRIMARY KEY,
            author_id INTEGER,
            title TEXT NOT NULL,
            FOREIGN KEY (author_id) REFERENCES users (id)
        );
    `);
    db.close();

    console.log("🚀 Running integration test for SQLite Bridge...");
    const driver = getDriver('sqlite');
    if (!driver) {
        console.error("❌ Test failed: sqlite driver not found in registry.");
        process.exit(1);
    }

    // 2. Parse binary db to graph
    const buffer = fs.readFileSync(tempDbPath);
    const graph = await driver.importSchema(buffer);
    console.log("📦 Parsed GraphState representation:");
    console.log(JSON.stringify(graph, null, 2));

    // Assertions on parsed graph
    const tableNames = Object.values(graph.nodes).map(n => n.params.tableName);
    if (tableNames.length !== 2 || !tableNames.includes('users') || !tableNames.includes('posts')) {
        console.error("❌ Test failed: Table nodes count or names are incorrect.");
        process.exit(1);
    }

    const usersNode = Object.values(graph.nodes).find(n => n.params.tableName === 'users');
    if (!usersNode.outputs.id || !usersNode.outputs.username || !usersNode.outputs.email) {
        console.error("❌ Test failed: Users table columns are not correctly listed as outputs.");
        process.exit(1);
    }

    if (graph.edges.length !== 1 || graph.edges[0].sourcePinId !== 'id' || graph.edges[0].targetPinId !== 'author_id') {
        console.error("❌ Test failed: Foreign key edge not correctly created.");
        process.exit(1);
    }
    console.log("✅ Parsing checked successfully.");

    // 3. Serialize graph back to SQLite binary db
    const outBuffer = await driver.exportSchema(graph);
    fs.writeFileSync(outputDbPath, outBuffer);

    // Verify output database structure
    const outDb = new DatabaseSync(outputDbPath);
    const outTables = outDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_litegraph_%'").all();
    console.log("📦 Output DB tables:", outTables);
    if (outTables.length !== 2) {
        console.error("❌ Test failed: Serialized database lacks tables.");
        process.exit(1);
    }
    outDb.close();

    console.log("✅ Serialization checked successfully.");

    // Clean up
    fs.unlinkSync(tempDbPath);
    fs.unlinkSync(outputDbPath);

    console.log("🎉 SUCCESS: SQLite Bridge integration test passed perfectly!");
}

runTest().catch(err => {
    console.error("❌ Test encountered runtime error:", err);
    process.exit(1);
});
