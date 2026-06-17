import { chromium } from 'playwright';

async function main() {
    console.log("🚀 Launching Chromium in headful mode (headless: false)...");
    const browser = await chromium.launch({ 
        headless: false,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const context = await browser.newContext({ viewport: null });
    const page = await context.newPage();
    
    // Capture browser console logs and uncaught errors
    page.on('console', msg => {
        if (msg.type() === 'error') {
            console.log(`🔴 [BROWSER ERROR] ${msg.text()}`);
        } else {
            console.log(`ℹ️ [BROWSER LOG] ${msg.text()}`);
        }
    });

    page.on('pageerror', err => {
        console.log(`🔴 [BROWSER UNCAUGHT EXCEPTION] ${err.message}\nStack:\n${err.stack}`);
    });
    
    const url = 'http://localhost:3000/';
    console.log(`📡 Navigating to ${url}...`);
    await page.goto(url);
    
    console.log("✨ Browser is open! Press Ctrl+C in the terminal to close it.");
    
    // Keep process alive
    await new Promise(() => {});
}

main().catch(err => {
    console.error("❌ Failed to launch browser:", err);
    process.exit(1);
});
