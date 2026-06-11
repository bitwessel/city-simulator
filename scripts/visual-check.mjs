// Visual spot-check: generate a few seeded cities and screenshot the 3D view.
// Usage: node scripts/visual-check.mjs   (dev server on :5173)
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const SHOTS = 'scripts/shots';
mkdirSync(SHOTS, { recursive: true });

// Fail fast (with a useful message) if the dev server isn't up — a plain
// goto would otherwise sit on a 30s navigation timeout per seed.
try {
  await fetch('http://localhost:5173', { signal: AbortSignal.timeout(3000) });
} catch {
  console.error('[visual] FAIL: no dev server on http://localhost:5173 — run `npm run dev` in a separate terminal first');
  process.exit(1);
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });

const seeds = process.argv.slice(2);
const list = seeds.length > 0 ? seeds : ['smoke-test-city', 'emberwick', 'dragon-99'];

for (const seed of list) {
  console.log(`[visual] capturing ${seed} (~6-9s)...`);
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });
  await page.locator('input').first().fill(seed);
  await page.locator('button', { hasText: /create new city/i }).click();
  await page.waitForSelector('canvas', { timeout: 15000 });
  await page.waitForTimeout(3000);
  // Pause the clock so the shot is stable (Space) and close any modal.
  const choice = page.locator('.modal-backdrop button.choice');
  if ((await choice.count()) > 0) await choice.first().click();
  await page.keyboard.press('Space');
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${SHOTS}/city-${seed}.png` });
  console.log(`[visual] captured city-${seed}.png`);
}

await browser.close();
