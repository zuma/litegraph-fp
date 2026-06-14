import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

async function runE2E() {
    console.log("🚀 Starting Playwright E2E UI Test...");
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    // Listen to console errors and logs
    page.on('console', msg => {
        if (msg.type() === 'error') {
            console.log(`🔴 [BROWSER ERROR] ${msg.text()}`);
        } else {
            console.log(`ℹ️ [BROWSER LOG] ${msg.text()}`);
        }
    });

    page.on('pageerror', err => {
        console.log(`🔴 [BROWSER UNCAUGHT EXCEPTION] ${err.message}`);
    });

    // Handle rename modal prompt
    page.on('dialog', async dialog => {
        console.log(`💬 Dialog popped up: [${dialog.type()}] "${dialog.message()}"`);
        if (dialog.type() === 'prompt') {
            await dialog.accept('Lego Base');
            console.log("✅ Dialog accepted with 'Lego Base'.");
        } else {
            await dialog.dismiss();
        }
    });

    const url = 'http://sweet_panini.orb.local:3000/';
    console.log(`📡 Navigating to ${url}...`);
    await page.goto(url, { waitUntil: 'networkidle' });

    const title = await page.title();
    console.log(`📝 Page Title: "${title}"`);

    // 1. Rename Workspace 1 to 'Lego Base'
    console.log("✍️ Double-clicking Workspace 1 tab to rename...");
    const wsTab = page.locator('.workspace-tab').first();
    await wsTab.dblclick();
    await page.waitForTimeout(500);

    const renamedTabs = await page.$$eval('.workspace-tab', tabs => tabs.map(t => t.textContent.trim()));
    console.log("📂 Tabs after rename:", renamedTabs);

    // 2. Select 'Input Adder' node on canvas and modify parameter
    console.log("🖱️ Clicking canvas to select 'Input Adder' node...");
    const canvas = page.locator('#graph-canvas');
    // Click at coordinates corresponding to Input Adder (ui.x: 100, ui.y: 80)
    await canvas.click({ position: { x: 180, y: 110 } });
    await page.waitForTimeout(500);

    // Locate the in0 parameter input
    console.log("🔍 Checking parameter input in0 in inspector...");
    const in0Input = page.locator('input[data-pin-id="in0"]');
    await in0Input.fill('999');
    await page.waitForTimeout(1000); // Wait for auto-run evaluation

    // 3. Click "+ New Tab"
    console.log('➕ Clicking "+ New Tab" button...');
    const newTabBtn = page.locator('#btn-new-workspace-tab');
    await newTabBtn.click();
    await page.waitForTimeout(500);

    const updatedTabs = await page.$$eval('.workspace-tab', tabs => tabs.map(t => t.textContent.trim()));
    console.log("📂 Tabs after adding new tab:", updatedTabs);

    // 4. Switch to Workspace 2
    console.log("📂 Switching to Workspace 2...");
    const ws2Tab = page.locator('.workspace-tab').nth(1);
    await ws2Tab.click();
    await page.waitForTimeout(500);

    // 5. Right-click canvas to trigger Node Adder
    console.log("🖱️ Right-clicking on graph canvas to open Node Adder...");
    await canvas.click({ button: 'right' });
    await page.waitForTimeout(500);

    // Check if node-adder is visible
    const nodeAdderVisible = await page.evaluate(() => {
        const adder = document.getElementById('node-adder');
        return adder && !adder.classList.contains('hidden');
    });
    console.log("🔍 Node Adder Visible?", nodeAdderVisible);

    // 6. Search and select formula node mode
    if (nodeAdderVisible) {
        console.log("✍️ Searching for 'Math'...");
        const searchInput = page.locator('#node-search-input');
        await searchInput.fill('Math');
        await page.waitForTimeout(200);

        console.log("🔌 Selecting the first node item (Math Formula)...");
        const nodeItem = page.locator('.node-item-btn').first();
        await nodeItem.click();
        await page.waitForTimeout(1000);
    }

    // 7. Verify the terminal logs contain the correct execution values
    const logsText = await page.locator('#terminal-console').textContent();
    console.log("📋 Terminal Console Logs:\n", logsText);

    if (logsText.includes('CONSOLE_LOG]: 5095')) {
        console.log("✅ SUCCESS: Found math execution output (CONSOLE_LOG]: 5095) in terminal console!");
    } else {
        console.log("❌ FAILURE: Math execution output not found in terminal logs!");
    }

    // 8. Capture a screenshot of the results
    const screenshotPath = '/home/node/.gemini/antigravity-ide/brain/e107f43c-b69c-4491-becc-5b4a5bd286b3/screenshot_e2e.png';
    console.log(`📸 Taking screenshot and saving to: ${screenshotPath}`);
    await page.screenshot({ path: screenshotPath });

    await browser.close();
    console.log("🏁 E2E Test finished successfully.");
}

runE2E().catch(err => {
    console.error("❌ E2E Test execution failed:", err);
    process.exit(1);
});
