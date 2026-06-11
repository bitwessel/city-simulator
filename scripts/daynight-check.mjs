// Ad-hoc Milestone C verification: zoomed day view + dusk + night screenshots.
// Usage: node scripts/daynight-check.mjs [seed]   (dev server on :5173, headed)
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const SHOTS = 'scripts/shots';
mkdirSync(SHOTS, { recursive: true });
const seed = process.argv[2] ?? 'emberwick';

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });

async function newCity() {
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });
  await page.locator('input').first().fill(seed);
  await page.locator('button', { hasText: /create new city/i }).click();
  await page.waitForSelector('canvas', { timeout: 15000 });
}

// --- 1. Zoomed-in day shot (judge AO, smoke, buildings up close) -----------
await newCity();
await page.waitForTimeout(2500);
await page.keyboard.press('Space'); // pause
await page.mouse.move(800, 450);
for (let i = 0; i < 6; i++) {
  await page.mouse.wheel(0, -400);
  await page.waitForTimeout(150);
}
await page.waitForTimeout(1200);
await page.screenshot({ path: `${SHOTS}/dn-1-day-close.png` });
console.log('captured dn-1-day-close.png');

// --- 2. Dusk + night (Brisk: phase 0.68 night start ≈ 7.4s from launch) ----
await newCity();
await page.locator('button[title^="Brisk"]').click();
await page.waitForTimeout(6200); // ~dusk
await page.keyboard.press('Space');
await page.waitForTimeout(600);
await page.screenshot({ path: `${SHOTS}/dn-2-dusk.png` });
console.log('captured dn-2-dusk.png');

await page.keyboard.press('Space'); // resume (back to Brisk? Space toggles pause)
await page.waitForTimeout(3500); // into the night
await page.keyboard.press('Space');
await page.waitForTimeout(600);
await page.screenshot({ path: `${SHOTS}/dn-3-night.png` });
console.log('captured dn-3-night.png');

// Zoom into the night city for window/lantern glow.
await page.mouse.move(800, 450);
for (let i = 0; i < 6; i++) {
  await page.mouse.wheel(0, -400);
  await page.waitForTimeout(150);
}
await page.waitForTimeout(1000);
await page.screenshot({ path: `${SHOTS}/dn-4-night-close.png` });
console.log('captured dn-4-night-close.png');

await browser.close();
