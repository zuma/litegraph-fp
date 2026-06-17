import { chromium } from 'playwright';
import path from 'path';

async function main() {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.setViewportSize({ width: 1280, height: 800 });
    
    await page.goto('http://localhost:3000/');
    await page.waitForTimeout(1000);
    
    // Right click on the first node (Input Adder) to open its editor
    const canvas = page.locator('#graph-canvas');
    await canvas.click({ button: 'right', position: { x: 180, y: 110 } });
    await page.waitForTimeout(300);
    
    await page.locator('#ctx-edit-nested').click();
    await page.waitForTimeout(1000);

    const workspacesJson = await page.evaluate(() => JSON.stringify(appState.workspaces, null, 2));
    console.log("=== WORKSPACES STATE FROM BROWSER ===");
    console.log(workspacesJson);
    console.log("=====================================");
    
    const screenshotPath = '/usr/local/google/home/lebrian/.gemini/jetski/brain/550f6694-8672-4c44-a535-57d3d972c9cf/screenshot_node_editor.png';
    await page.screenshot({ path: screenshotPath });
    console.log(`📸 Screenshot saved to: ${screenshotPath}`);
    
    await browser.close();
}

main().catch(console.error);
