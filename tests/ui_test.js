import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

// Artifact directory path passed from environment / user context
const ARTIFACT_DIR = '/usr/local/google/home/lebrian/.gemini/jetski/brain/550f6694-8672-4c44-a535-57d3d972c9cf';
const SCREENSHOT_PATH = path.join(ARTIFACT_DIR, 'screenshot_e2e.png');

async function runE2ETests() {
    console.log("==================================================");
    console.log("🚀 STARTING E2E UI TEST SUITE USING PLAYWRIGHT");
    console.log("==================================================");

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        viewport: { width: 1280, height: 800 }
    });
    const page = await context.newPage();

    let uncaughtErrors = [];
    let consoleLogs = [];

    // Capture browser console logs
    page.on('console', msg => {
        const text = msg.text();
        consoleLogs.push({ type: msg.type(), text });
        if (msg.type() === 'error') {
            console.log(`🔴 [BROWSER ERROR] ${text}`);
        } else {
            console.log(`ℹ️ [BROWSER LOG] ${text}`);
        }
    });

    // Capture browser exceptions
    page.on('pageerror', err => {
        console.log(`🔴 [UNCAUGHT EXCEPTION] ${err.message}`);
        uncaughtErrors.push(err);
    });

    // Handle dialog triggers (Prompts & Confirms)
    page.on('dialog', async dialog => {
        console.log(`💬 [DIALOG] Type: "${dialog.type()}" | Message: "${dialog.message()}"`);
        if (dialog.type() === 'prompt') {
            const defaultValue = dialog.defaultValue();
            if (dialog.message().includes('Enter new workspace name')) {
                await dialog.accept('Lego Base');
                console.log("✅ Dialog accepted with 'Lego Base'.");
            } else {
                await dialog.accept(defaultValue);
            }
        } else if (dialog.type() === 'confirm') {
            await dialog.accept();
            console.log("✅ Confirm dialog accepted.");
        } else {
            await dialog.dismiss();
        }
    });

    const url = 'http://localhost:3000/';
    console.log(`📡 Navigating to ${url}...`);
    await page.goto(url, { waitUntil: 'networkidle' });

    // Step 1: Verify title
    const title = await page.title();
    console.log(`📝 Page Title: "${title}"`);
    if (title !== "Litegraph-FP Designer") {
        throw new Error(`Unexpected page title: "${title}"`);
    }
    console.log("✅ Step 1: Page Title verified.");

    // Step 2: Rename Workspace 1 to 'Lego Base'
    console.log("✍️ Step 2: Double-clicking Workspace 1 tab to rename...");
    const wsTab = page.locator('.workspace-tab').first();
    await wsTab.dblclick();
    await page.waitForTimeout(500); // Allow dialog interaction to process

    const renamedTabs = await page.$$eval('.workspace-tab', tabs => tabs.map(t => t.textContent.trim()));
    console.log("📂 Tabs after rename:", renamedTabs);
    // Note: The text has close button '&times;' inside it, so we clean it up or match prefix
    if (!renamedTabs[0].startsWith('Lego Base')) {
        throw new Error(`Workspace tab failed to rename. Expected 'Lego Base...', got: '${renamedTabs[0]}'`);
    }
    console.log("✅ Step 2: Tab renamed successfully.");

    // Step 3: Select 'Input Adder' node on canvas
    console.log("🖱️ Step 3: Clicking canvas to select 'Input Adder' node...");
    const canvas = page.locator('#graph-canvas');
    // Default position coordinate click on canvas (corresponds to ui x:100, y:80)
    await canvas.click({ position: { x: 180, y: 110 } });
    await page.waitForTimeout(500);

    // Verify Inspector opens
    const isPlaceholderHidden = await page.locator('#inspector-placeholder').isHidden();
    const isContentVisible = await page.locator('#inspector-content').isVisible();
    if (!isPlaceholderHidden || !isContentVisible) {
        throw new Error("Inspector did not show up upon clicking node.");
    }

    const inspectedId = await page.locator('#inspect-node-id').textContent();
    const inspectedTitle = await page.locator('#inspect-node-title').inputValue();
    console.log(`🔍 Inspected Node ID: "${inspectedId}" | Title: "${inspectedTitle}"`);
    if (inspectedTitle !== "Input Adder") {
        throw new Error(`Expected inspected node title to be 'Input Adder', got '${inspectedTitle}'`);
    }
    console.log("✅ Step 3: Selected node inspected successfully.");

    // Step 4: Modify parameter
    console.log("✍️ Step 4: Changing parameter 'in0' value to '999'...");
    const in0Input = page.locator('input[data-pin-id="in0"]');
    console.log("Input HTML:", await in0Input.evaluate(el => el.outerHTML));
    console.log("Input value before:", await in0Input.inputValue());
    
    await in0Input.focus();
    await in0Input.fill('999');
    await in0Input.evaluate(el => el.dispatchEvent(new Event('input', { bubbles: true })));
    await in0Input.blur();
    
    console.log("Input value after:", await in0Input.inputValue());
    console.log("Auto-run checked state:", await page.locator('#chk-auto-run').isChecked());
    await page.waitForTimeout(1500); // Wait for auto-run evaluation

    // Verify console log output contains computed formula value (999 + 20) * 5 = 5095
    const logsText = await page.locator('#terminal-console').textContent();
    console.log("📋 Terminal Console Output:\n", logsText);
    if (!logsText.includes('CONSOLE_LOG]: 5095')) {
        throw new Error("Terminal logs do not contain the expected execution result (5095)!");
    }
    console.log("✅ Step 4: Parameter modification and execution verification passed.");

    // Step 5: Click "+ New Tab" to create Workspace 2
    console.log('➕ Step 5: Clicking "+ New Tab" button...');
    const newTabBtn = page.locator('#btn-new-workspace-tab');
    await newTabBtn.click();
    await page.waitForTimeout(500);

    const updatedTabs = await page.$$eval('.workspace-tab', tabs => tabs.map(t => t.textContent.trim()));
    console.log("📂 Tabs list:", updatedTabs);
    if (updatedTabs.length !== 2) {
        throw new Error(`Expected 2 tabs, found ${updatedTabs.length}`);
    }
    console.log("✅ Step 5: New tab created.");

    // Step 6: Switch back to Workspace 2 (which is the active one now)
    console.log("📂 Step 6: Verifying Workspace 2 is active and right-clicking canvas...");
    // Workspace 2 is active, right click canvas to open Node Adder
    await canvas.click({ button: 'right', position: { x: 400, y: 300 } });
    await page.waitForTimeout(500);

    const nodeAdderVisible = await page.locator('#node-adder').isVisible();
    console.log("🔍 Node Adder panel visible?", nodeAdderVisible);
    if (!nodeAdderVisible) {
        throw new Error("Node Adder panel did not open on right-click.");
    }

    // Search and select "Time Delay"
    console.log("✍️ Searching for 'Time Delay' in Node Adder...");
    const searchInput = page.locator('#node-search-input');
    await searchInput.fill('Time Delay');
    await page.waitForTimeout(300);

    console.log("🔌 Selecting node item...");
    const nodeItem = page.locator('.node-item-btn').first();
    await nodeItem.click();
    await page.waitForTimeout(500);

    // Verify delay node is added by inspecting AST preview in Workspace 2
    const astPreview = await page.locator('#ast-json-preview').textContent();
    if (!astPreview.includes('"type": "system/delay"') && !astPreview.includes('"mode": "delay"')) {
        throw new Error("Delay node was not found in the workspace AST!");
    }
    console.log("✅ Step 6: Node Adder right-click flow successfully verified.");

    // Step 7: Zoom controls check
    console.log("🔍 Step 7: Testing zoom toolbar buttons...");
    await page.locator('#btn-zoom-in').click();
    await page.waitForTimeout(100);
    await page.locator('#btn-zoom-out').click();
    await page.waitForTimeout(100);
    await page.locator('#btn-zoom-reset').click();
    await page.waitForTimeout(100);
    console.log("✅ Step 7: Zoom controls checked.");

    // Step 7.5: Resize window check
    console.log("🔍 Step 7.5: Testing window resize rendering...");
    await page.setViewportSize({ width: 800, height: 600 });
    await page.waitForTimeout(300);
    await page.evaluate(() => window.dispatchEvent(new Event('resize')));
    await page.waitForTimeout(300);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.waitForTimeout(300);
    await page.evaluate(() => window.dispatchEvent(new Event('resize')));
    await page.waitForTimeout(500);
    console.log("✅ Step 7.5: Window resize rendering checked.");

    // Step 8: Close Workspace 2 (confirm dialog handles it)
    console.log("🗑️ Step 8: Closing Workspace 2...");
    const closeWs2Btn = page.locator('.workspace-tab').nth(1).locator('.workspace-tab-close');
    await closeWs2Btn.click();
    await page.waitForTimeout(500);

    const finalTabs = await page.$$eval('.workspace-tab', tabs => tabs.map(t => t.textContent.trim()));
    console.log("📂 Final Tabs list after closing Workspace 2:", finalTabs);
    if (finalTabs.length !== 1 || !finalTabs[0].startsWith('Lego Base')) {
        throw new Error("Failed to close Workspace 2 or switch back cleanly to Lego Base.");
    }
    console.log("✅ Step 8: Workspace closing verified.");

    // Step 8.5: Open and verify Node Editor tab
    console.log("⚙️ Step 8.5: Click node 'Input Adder' to select it and show Inspector...");
    await canvas.click({ position: { x: 180, y: 110 } });
    await page.waitForTimeout(300);

    console.log("➕ Adding input pin via inspector...");
    const addInputBtn = page.locator('#btn-add-input');
    if (!await addInputBtn.isVisible()) {
        throw new Error("Add Input Pin button not visible in Inspector!");
    }
    await addInputBtn.click();
    await page.waitForTimeout(400);

    console.log("⚙️ Right-clicking 'Input Adder' node to open Node Editor...");
    await canvas.click({ button: 'right', position: { x: 180, y: 110 } });
    await page.waitForTimeout(300);

    const editNodeBtn = page.locator('#ctx-edit-nested');
    if (!await editNodeBtn.isVisible()) {
        throw new Error("Edit Node context menu item is not visible!");
    }
    await editNodeBtn.click();
    await page.waitForTimeout(500);

    const tabsWithNode = await page.$$eval('.workspace-tab', tabs => tabs.map(t => t.textContent.trim()));
    console.log("📂 Tabs after opening Node Editor:", tabsWithNode);
    if (tabsWithNode.length !== 2 || !tabsWithNode[1].startsWith('Node: Input Adder')) {
        throw new Error(`Expected Node Editor tab to open, got: ${JSON.stringify(tabsWithNode)}`);
    }

    const subNodesCount = await page.evaluate(() => {
        const blockEditor = appState.workspaces.find(w => w.id === 'block_editor_add_4012');
        if (!blockEditor) return 0;
        return Object.values(blockEditor.graph.nodes).length;
    });
    console.log(`🔍 Number of boundary nodes created (expect 4 since we added a pin): ${subNodesCount}`);
    if (subNodesCount !== 4) {
        throw new Error(`Expected exactly 4 boundary nodes in block editor, found ${subNodesCount}`);
    }

    console.log("🗑️ Closing Node Editor tab (expect no confirm dialog)...");
    const closeNodeBtn = page.locator('.workspace-tab').nth(1).locator('.workspace-tab-close');
    await closeNodeBtn.click();
    await page.waitForTimeout(500);

    const finalTabsPostNode = await page.$$eval('.workspace-tab', tabs => tabs.map(t => t.textContent.trim()));
    console.log("📂 Tabs after closing Node Editor:", finalTabsPostNode);
    if (finalTabsPostNode.length !== 1 || !finalTabsPostNode[0].startsWith('Lego Base')) {
        throw new Error("Node Editor tab failed to close or revert back to Lego Base.");
    }
    console.log("✅ Step 8.5: Node Editor E2E flow verified successfully.");

    // Step 8.6: Test Tab Drag Reordering
    console.log("↔️ Step 8.6: Testing workspace tab drag-and-drop reordering...");
    await newTabBtn.click();
    await page.waitForTimeout(500);

    const tabsBeforeDrag = await page.$$eval('.workspace-tab', tabs => tabs.map(t => t.textContent.trim()));
    console.log("📂 Tabs before drag reordering:", tabsBeforeDrag);

    const tabSource = page.locator('.workspace-tab').first();
    const tabTarget = page.locator('.workspace-tab').nth(1);

    await tabSource.dragTo(tabTarget);
    await page.waitForTimeout(500);

    const tabsAfterDrag = await page.$$eval('.workspace-tab', tabs => tabs.map(t => t.textContent.trim()));
    console.log("📂 Tabs after drag reordering:", tabsAfterDrag);
    if (tabsAfterDrag[0] === tabsBeforeDrag[0]) {
        throw new Error("Tabs failed to swap positions after drag-and-drop!");
    }
    console.log("✅ Step 8.6: Tab drag-and-drop reordering verified.");

    const closeWsBtn = page.locator('.workspace-tab').first().locator('.workspace-tab-close');
    await closeWsBtn.click();
    await page.waitForTimeout(500);

    // Step 8.7: Test edge detaching behavior on dragging from a connected input pin
    console.log("🔌 Step 8.7: Testing edge detaching from connected input pin...");
    const pinCoords = await page.evaluate(() => {
        const node = appState.currentGraph.nodes['multiply_8930'];
        const worldPos = getInputPinCoords(node, 'in0');
        const canvasEl = document.getElementById('graph-canvas');
        const rect = canvasEl.getBoundingClientRect();
        return {
            x: rect.left + (worldPos.x * appState.viewport.zoom + appState.viewport.x),
            y: rect.top + (worldPos.y * appState.viewport.zoom + appState.viewport.y)
        };
    });

    console.log(`🔌 Dragging from pin coords: x=${pinCoords.x}, y=${pinCoords.y}`);
    await page.mouse.move(pinCoords.x, pinCoords.y);
    await page.mouse.down();
    // Drag out slightly to trigger the drag event
    await page.mouse.move(pinCoords.x - 100, pinCoords.y);
    await page.waitForTimeout(200);

    const edgeExists = await page.evaluate(() => {
        return appState.currentGraph.edges.some(e => e.targetNodeId === 'multiply_8930' && e.targetPinId === 'in0');
    });
    console.log(`🔌 Is edge present in state? ${edgeExists}`);
    if (edgeExists) {
        throw new Error("Edge was NOT detached when dragging off the connected input pin!");
    }

    // Release mouse
    await page.mouse.up();
    await page.waitForTimeout(200);
    console.log("✅ Step 8.7: Edge detaching verified successfully.");

    // Step 9: Save screenshot to artifact folder
    console.log(`📸 Step 9: Saving screenshot to: ${SCREENSHOT_PATH}`);
    // Create artifact folder if it doesn't exist (should exist though)
    fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
    await page.screenshot({ path: SCREENSHOT_PATH });
    console.log("✅ Step 9: Screenshot captured.");

    // Final checks for errors
    if (uncaughtErrors.length > 0) {
        throw new Error(`Test failed with ${uncaughtErrors.length} uncaught page exceptions.`);
    }

    console.log("==================================================");
    console.log("🎉 SUCCESS: ALL E2E UI TESTS PASSED PERFECTLY!");
    console.log("==================================================");

    await browser.close();
    process.exit(0);
}

runE2ETests().catch(err => {
    console.error("❌ E2E UI TEST RUNNER FATAL FAILURE:", err);
    process.exit(1);
});
