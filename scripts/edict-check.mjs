// Phase-05 edict check: declares each standing edict through the real
// Proclamations UI and screenshots its prop layer (lanterns / planters /
// crates / scaffolds), stepping 11 days between declarations to clear the
// cooldown. Ends by lifting the edict to confirm the props disappear.
// Usage: node scripts/edict-check.mjs [seed]   (dev server on :5173)
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const SHOTS = 'scripts/shots';
mkdirSync(SHOTS, { recursive: true });

try {
  await fetch('http://localhost:5173', { signal: AbortSignal.timeout(3000) });
} catch {
  console.error('[edicts] FAIL: no dev server on http://localhost:5173 — run `npm run dev` in a separate terminal first');
  process.exit(1);
}

const seed = process.argv[2] ?? 'edict-check-1';
const EDICTS = [
  'Festival Season',
  'Conservation Drive',
  'Trade Push',
  'Quiet Rebuilding',
  'Arcane Studies',
];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push(msg.text());
});

console.log(`[edicts] loading ${seed}...`);
await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });
await page.locator('input').first().fill(seed);
await page.locator('button', { hasText: /create new city/i }).click();
// Founding screen: skip the ritual with the defaults.
await page.waitForSelector('button:has-text("Surprise me")', { timeout: 10000 });
await page.locator('button', { hasText: /surprise me/i }).click();
await page.waitForSelector('canvas', { timeout: 15000 });
await page.waitForTimeout(3000);
// Pause the clock so the shots are stable.
await page.keyboard.press('Space');

async function dismissModal() {
  const choice = page.locator('.modal-backdrop button.choice');
  if ((await choice.count()) > 0) {
    await choice.first().click();
    await page.waitForTimeout(400);
  }
}

async function stepDays(n) {
  await page.evaluate((count) => {
    for (let i = 0; i < count; i++) {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'n' }));
    }
  }, n);
  await page.waitForTimeout(600);
  await dismissModal();
}

// Develop the districts so the prop layers have somewhere to land
// (props only appear past development 25).
await stepDays(40);

// Zoom in close so the props read in the shots. OrbitControls dollies a fixed
// ~0.95x per wheel EVENT (delta size is irrelevant), so it takes many steps.
await page.mouse.move(800, 450);
for (let i = 0; i < 24; i++) {
  await page.mouse.wheel(0, -400);
  await page.waitForTimeout(120);
}
await page.waitForTimeout(800);

async function declare(name) {
  await dismissModal();
  await page.locator('button[title="Open Proclamations"]').click();
  await page.waitForSelector('.proclamations', { timeout: 5000 });
  const item = page.locator('.proclamations__item', { hasText: name });
  const btn = item.locator('.proclamations__declare-btn');
  if (await btn.isDisabled()) {
    const reason = await btn.getAttribute('title');
    throw new Error(`Declare "${name}" is disabled: ${reason}`);
  }
  await btn.click();
  await page.keyboard.press('Escape'); // close the popup for a clean shot
  await page.waitForTimeout(1200); // let the prop layer mount
}

for (const name of EDICTS) {
  await declare(name);
  const slug = name.toLowerCase().replaceAll(' ', '-');
  await page.screenshot({ path: `${SHOTS}/edict-${seed}-${slug}.png` });
  console.log(`[edicts] captured edict-${seed}-${slug}.png`);
  // Clear the 10-day switch cooldown before the next declaration.
  await stepDays(11);
}

// Lift the last edict and confirm the props vanish.
await dismissModal();
await page.locator('button[title="Open Proclamations"]').click();
await page.waitForSelector('.proclamations', { timeout: 5000 });
await page.locator('.proclamations__lift-btn').click();
await page.keyboard.press('Escape');
await page.waitForTimeout(1200);
await page.screenshot({ path: `${SHOTS}/edict-${seed}-lifted.png` });
console.log(`[edicts] captured edict-${seed}-lifted.png`);

if (errors.length > 0) {
  console.error(`[edicts] FAIL: ${errors.length} console error(s):`);
  for (const e of errors) console.error('  ' + e);
  await browser.close();
  process.exit(1);
}

console.log('[edicts] PASS: all five edicts declared, screenshotted, and lifted with no console errors');
await browser.close();
