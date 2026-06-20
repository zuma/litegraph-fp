import { chromium } from 'playwright';
import { DatabaseSync } from 'node:sqlite';
import fs from 'fs';
import path from 'path';

async function runImportE2ETest() {
    const tempDbPath = path.resolve('./scratch/test_source_import.db');
    if (fs.existsSync(tempDbPath)) {
        fs.unlinkSync(tempDbPath);
    }

    console.log("1. Creating source database...");
    const db = new DatabaseSync(tempDbPath);
    db.exec(`
        CREATE TABLE customers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT UNIQUE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `);
    db.close();

    console.log("2. Launching Playwright browser...");
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();

    page.on('console', msg => {
        if (msg.type() === 'error') {
            console.log(`🔴 [BROWSER ERROR] ${msg.text()}`);
        } else {
            console.log(`ℹ️ [BROWSER LOG] ${msg.text()}`);
        }
    });

    page.on('pageerror', err => {
        console.log(`🔴 [UNCAUGHT EXCEPTION] ${err.message}`);
    });

    console.log("3. Navigating to designer page...");
    await page.goto('http://localhost:3000/');
    await page.waitForTimeout(1000);

    console.log("4. Clearing all nodes to make the workspace truly blank...");
    await page.evaluate(() => {
        window.appState.currentGraph = { nodes: {}, edges: [] };
        window.appState.renderingContext.needsRedraw = true;
    });
    await page.waitForTimeout(500);

    // Get current graph nodes count before import
    const initialGraph = await page.evaluate(() => {
        return window.appState.currentGraph;
    });
    console.log("Initial Graph nodes before import (expect empty):", Object.keys(initialGraph.nodes));

    console.log("5. Triggering SQLite import...");
    const [fileChooser] = await Promise.all([
        page.waitForEvent('filechooser'),
        page.click('#btn-import-sqlite')
    ]);

    await fileChooser.setFiles(tempDbPath);
    await page.waitForTimeout(2000);

    console.log("6. Inspecting graph state in browser after import...");
    const { postImportGraph, nodeErrors } = await page.evaluate(() => {
        return {
            postImportGraph: window.appState.currentGraph,
            nodeErrors: window.appState.nodeErrors
        };
    });
    console.log("Post Import Graph:", JSON.stringify(postImportGraph, null, 2));
    console.log("Node Errors:", JSON.stringify(nodeErrors, null, 2));

    const screenshotPath = path.resolve('./scratch/screenshot_sqlite_import.png');
    console.log(`7. Saving E2E screenshot to: ${screenshotPath}`);
    await page.screenshot({ path: screenshotPath });

    await browser.close();
    fs.unlinkSync(tempDbPath);
}

runImportE2ETest().catch(console.error);
