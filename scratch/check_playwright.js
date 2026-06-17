import { chromium } from 'playwright';

async function main() {
    console.log("Launching chromium...");
    const browser = await chromium.launch({ headless: true });
    console.log("Chromium launched successfully!");
    await browser.close();
    console.log("Chromium closed successfully!");
}

main().catch(err => {
    console.error("Failed to launch chromium:", err);
    process.exit(1);
});
