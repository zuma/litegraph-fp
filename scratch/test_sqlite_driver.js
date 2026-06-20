import { SqliteDriver } from '../dist/src/io/drivers/sqlite.js';
import { DatabaseSync } from 'node:sqlite';
import fs from 'fs';
import path from 'path';

async function runTest() {
    const tempDbPath = './scratch/test_source.db';
    if (fs.existsSync(tempDbPath)) {
        fs.unlinkSync(tempDbPath);
    }

    console.log("Creating test SQLite database with a 'users' table...");
    const db = new DatabaseSync(tempDbPath);
    db.exec(`
        CREATE TABLE users (
            id INTEGER PRIMARY KEY,
            username TEXT NOT NULL,
            email TEXT
        );
    `);
    db.close();

    const buffer = fs.readFileSync(tempDbPath);
    console.log("Running SqliteDriver.importSchema...");
    const graph = await SqliteDriver.importSchema(buffer);
    console.log("Imported Graph AST:", JSON.stringify(graph, null, 2));

    console.log("Running SqliteDriver.exportSchema...");
    const exportedBuffer = await SqliteDriver.exportSchema(graph);
    console.log("Export successful. Exported buffer length:", exportedBuffer.length);

    const reimportedGraph = await SqliteDriver.importSchema(exportedBuffer);
    console.log("Re-imported Graph AST from exported database:", JSON.stringify(reimportedGraph, null, 2));

    // Cleanup
    fs.unlinkSync(tempDbPath);
}

runTest().catch(console.error);
