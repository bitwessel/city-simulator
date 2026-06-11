// Mobile layout spot-check: load a city at phone size and screenshot the HUD in
// its three states — bare view, panel popup open, vitals popover open.
// Usage: node scripts/mobile-check.mjs [seed]   (dev server on :5173)
import { chromium, devices } from 'playwright';
import { mkdirSync } from 'node:fs';

const SHOTS = 'scripts/shots';
mkdirSync(SHOTS, { recursive: true });

try {
  await fetch('http://localhost:5173', { signal: AbortSignal.timeout(3000) });
} catch {
  console.error('[mobile] FAIL: no dev server on http://localhost:5173 — run `npm run dev` first');
  process.exit(1);
}

const seed = process.argv[2] || 'emberwick';
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ ...devices['iPhone 13'] });
const page = await context.newPage();

await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });
await page.locator('input').first().fill(seed);
await page.locator('button', { hasText: /create new city/i }).click();
await page.waitForSelector('canvas', { timeout: 15000 });
await page.waitForTimeout(3000);

// Dismiss any memo modal so the HUD is clean, then pause the clock.
const choice = page.locator('.modal-backdrop button.choice');
if ((await choice.count()) > 0) await choice.first().click();
await page.keyboard.press('Space');
await page.waitForTimeout(600);

await page.screenshot({ path: `${SHOTS}/mobile-1-view.png` });
console.log('[mobile] captured mobile-1-view.png (bare city)');

// Open the panel popup via the top-bar menu button.
await page.locator('.topbar__menu').click();
await page.waitForTimeout(500);
await page.screenshot({ path: `${SHOTS}/mobile-2-panel.png` });
console.log('[mobile] captured mobile-2-panel.png (panel sheet)');

// Close it, then open the City Vitals popover.
await page.locator('.leftpanel__collapse').click();
await page.waitForTimeout(400);
await page.locator('.vitals-toggle').click();
await page.waitForTimeout(400);
await page.screenshot({ path: `${SHOTS}/mobile-3-vitals.png` });
console.log('[mobile] captured mobile-3-vitals.png (vitals popover)');

await browser.close();
