// Phase-05 founding-ritual check: walks the founding screen with real choices
// (site, patron quirk, custom name), screenshots the terrain flyover and the
// founded city, and confirms the briefing reacts to the chosen site.
// Usage: node scripts/founding-check.mjs [seed]   (dev server on :5173)
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const SHOTS = 'scripts/shots';
mkdirSync(SHOTS, { recursive: true });

try {
  await fetch('http://localhost:5173', { signal: AbortSignal.timeout(3000) });
} catch {
  console.error('[founding] FAIL: no dev server on http://localhost:5173 — run `npm run dev` in a separate terminal first');
  process.exit(1);
}

const seed = process.argv[2] ?? 'founding-check-1';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push(msg.text());
});

console.log(`[founding] loading ${seed}...`);
await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });
await page.locator('input').first().fill(seed);
await page.locator('button', { hasText: /create new city/i }).click();
await page.waitForSelector('button:has-text("Surprise me")', { timeout: 10000 });

// Let the terrain mount, shaders compile, and the orbit start before shooting.
await page.waitForTimeout(6000);
await page.screenshot({ path: `${SHOTS}/founding-${seed}-1-flyover.png` });
console.log(`[founding] captured founding-${seed}-1-flyover.png (terrain flyover)`);

// Make all three choices: second site, second patron, custom name. The
// founding panel renders sites then patrons as two .founding__cards groups.
const cardGroups = page.locator('.founding__cards');
await cardGroups.nth(0).locator('.founding__card').nth(1).click();
await cardGroups.nth(1).locator('.founding__card').nth(1).click();
await page.locator('.founding__name-input').fill('Verifyburg');
await page.waitForTimeout(600);
await page.screenshot({ path: `${SHOTS}/founding-${seed}-2-choices.png` });
console.log(`[founding] captured founding-${seed}-2-choices.png (choices made)`);

await page.locator('button', { hasText: /found the city/i }).click();
await page.waitForSelector('canvas', { timeout: 15000 });
await page.waitForSelector('text=/Day/i', { timeout: 15000 });
await page.waitForTimeout(3500);

// The custom name must be on the HUD, and the briefing must react to the site.
const hudHasName = (await page.locator('text=Verifyburg').count()) > 0;
if (!hudHasName) errors.push('custom city name "Verifyburg" not found on the game HUD');
const briefingReacts =
  (await page
    .locator('text=/first stones by the water|chose the hilltop|forest.s edge/i')
    .count()) > 0;
if (!briefingReacts) errors.push('briefing does not reference the founding site choice');

await page.keyboard.press('Space');
await page.waitForTimeout(600);
await page.screenshot({ path: `${SHOTS}/founding-${seed}-3-city.png` });
console.log(`[founding] captured founding-${seed}-3-city.png (founded city + briefing)`);

if (errors.length > 0) {
  console.error(`[founding] FAIL: ${errors.length} problem(s):`);
  for (const e of errors) console.error('  ' + e);
  await browser.close();
  process.exit(1);
}

console.log('[founding] PASS: flyover rendered, choices accepted, name + briefing react');
await browser.close();
