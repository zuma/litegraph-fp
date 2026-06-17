import { chromium } from 'playwright';

async function main() {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    
    page.on('console', msg => console.log(`[Browser Log] ${msg.text()}`));
    page.on('pageerror', err => console.log(`[Browser Error] ${err.message}`));

    await page.goto('http://localhost:3000/');
    await page.waitForTimeout(500);

    const getCanvasDimensions = async () => {
        return await page.evaluate(() => {
            const c = document.getElementById('graph-canvas');
            const rect = c.getBoundingClientRect();
            return {
                styleWidth: c.style.width,
                styleHeight: c.style.height,
                clientW: c.clientWidth,
                clientH: c.clientHeight,
                rectW: rect.width,
                rectH: rect.height,
                bufferW: c.width,
                bufferH: c.height
            };
        });
    };

    console.log("Initial dimensions:", await getCanvasDimensions());

    console.log("Resizing window to 800x600...");
    await page.setViewportSize({ width: 800, height: 600 });
    // Dispatch resize event manually to be sure
    await page.evaluate(() => window.dispatchEvent(new Event('resize')));
    await page.waitForTimeout(500);

    console.log("Dimensions after resize:", await getCanvasDimensions());

    await browser.close();
}

main().catch(console.error);
