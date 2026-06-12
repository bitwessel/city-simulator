// Phase-04 era-skin check: one seed, all five ages, screenshotted for
// eyeballing. Uses the dev-only window.__mmDebug.forceAge bridge so each era
// skin (thatch → timber → stone → brick → gilt) can be captured without
// simulating hundreds of days. The age-up banner + fireworks fire on each
// force, so this doubles as a celebration smoke test.
// Usage: node scripts/age-check.mjs [seed]   (dev server on :5173)
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const SHOTS = 'scripts/shots';
mkdirSync(SHOTS, { recursive: true });

try {
  await fetch('http://localhost:5173', { signal: AbortSignal.timeout(3000) });
} catch {
  console.error('[ages] FAIL: no dev server on http://localhost:5173 — run `npm run dev` in a separate terminal first');
  process.exit(1);
}

const seed = process.argv[2] ?? 'age-check-1';
const AGES = ['settlement', 'village', 'town', 'city', 'wonder'];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push(msg.text());
});

console.log(`[ages] loading ${seed}...`);
await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });
await page.locator('input').first().fill(seed);
await page.locator('button', { hasText: /create new city/i }).click();
await page.waitForSelector('canvas', { timeout: 15000 });
await page.waitForTimeout(3000);
// Pause the clock so the developed-city snapshot is stable across ages.
await page.keyboard.press('Space');

// Develop the districts so plenty of buildings stand in every era shot.
await page.evaluate(() => {
  for (let i = 0; i < 120; i++) window.dispatchEvent(new KeyboardEvent('keydown', { key: 'n' }));
});
await page.waitForTimeout(1200);

for (const age of AGES) {
  const ok = await page.evaluate((a) => {
    const dbg = window.__mmDebug;
    if (!dbg) return false;
    dbg.forceAge(a);
    return true;
  }, age);
  if (!ok) {
    console.error('[ages] FAIL: window.__mmDebug missing (not a dev build?)');
    process.exit(1);
  }
  // Let the re-dress poof settle and the celebration play a moment.
  await page.waitForTimeout(2600);
  await page.screenshot({ path: `${SHOTS}/age-${seed}-${age}.png` });
  console.log(`[ages] captured age-${seed}-${age}.png`);
}

// ----- Wonder silhouettes: one wonder through its stages, the rest complete.
// forceWonder returns the host district center; zoom the camera toward it by
// double-clicking the canvas center after panning is impractical headless, so
// we rely on the wonder's size + a wheel zoom-in for legibility.
const wonderShots = [
  ['grand-academy', 0],
  ['grand-academy', 1],
  ['grand-academy', 2],
  ['grand-academy', 99], // complete
  ['great-garden', 99],
  ['everforge', 99],
  ['festival-eternal', 99],
];
// Lean in before the wonder close-ups. Stepped wheel events: OrbitControls
// drops a single huge delta headless, but small spaced steps register.
await page.mouse.move(800, 450);
for (let i = 0; i < 6; i++) {
  await page.mouse.wheel(0, -300);
  await page.waitForTimeout(150);
}
await page.waitForTimeout(700);
for (const [defId, stage] of wonderShots) {
  await page.evaluate(
    ([d, s]) => window.__mmDebug.forceWonder(d, s),
    [defId, stage],
  );
  await page.waitForTimeout(1400);
  const label = stage === 99 ? 'done' : `s${stage}`;
  await page.screenshot({ path: `${SHOTS}/wonder-${seed}-${defId}-${label}.png` });
  console.log(`[ages] captured wonder-${seed}-${defId}-${label}.png`);
}

await browser.close();
if (errors.length > 0) {
  console.error(`[ages] FAIL: ${errors.length} console error(s):`);
  for (const e of errors.slice(0, 10)) console.error('  ' + e);
  process.exit(1);
}
console.log('[ages] OK — compare the shots: each era must be unmistakable.');
