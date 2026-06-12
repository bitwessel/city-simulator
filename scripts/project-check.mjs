// End-to-end check for mayor projects (phase 03): commissions a landmark
// through the real UI, watches the scaffolding go up, fast-forwards to
// completion, and confirms the landmark stands + the feed celebrates it.
// Usage: node scripts/project-check.mjs   (dev server must be running on :5173)
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = 'http://localhost:5173';
const SHOTS = 'scripts/shots';
mkdirSync(SHOTS, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(`console.error: ${m.text()}`);
});

const log = (msg) => console.log(`[project] ${msg}`);

try {
  try {
    await fetch(BASE, { signal: AbortSignal.timeout(3000) });
  } catch {
    throw new Error(`No dev server on ${BASE} — run \`npm run dev\` in a separate terminal first`);
  }

  // 1. New city with a fixed seed.
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('text=Mythic Mayor', { timeout: 15000 });
  await page.locator('input').first().fill('project-check-1');
  await page.locator('button', { hasText: /create new city/i }).click();
  // Founding screen: skip the ritual with the defaults.
  await page.waitForSelector('button:has-text("Surprise me")', { timeout: 10000 });
  await page.locator('button', { hasText: /surprise me/i }).click();
  await page.waitForSelector('canvas', { timeout: 15000 });
  await page.waitForTimeout(2500);
  // Pause the clock so commissioning happens on a stable early day (the build
  // is only a few in-game days; at running speed it would complete mid-check).
  await page.locator('button[title^="Pause"]').click();
  log('city created (clock paused)');

  // 2. Favor chip is visible in the top bar.
  const favorChip = page.locator('.favor-chip');
  if ((await favorChip.count()) === 0) throw new Error('No .favor-chip in the TopBar');
  log(`favor chip shows: "${(await favorChip.first().textContent())?.trim()}"`);

  // 3. Open Districts tab, select the first district, find the commission list.
  await page.locator('button[role="tab"]', { hasText: 'Districts' }).first().click();
  await page.locator('.district-row').first().click();
  await page.waitForSelector('.commission', { timeout: 5000 });
  const districtName = (await page.locator('.detail__name').textContent())?.trim();
  log(`district panel open: ${districtName}`);

  // 4. Commission the first affordable project (day-1 favor covers the cheap
  //    ones), or a specific one by name: node scripts/project-check.mjs Bathhouse
  const wanted = process.argv[2];
  const candidates = page.locator('.project-opt', {
    has: page.locator('.project-opt__start:not([disabled])'),
  });
  const option = wanted ? candidates.filter({ hasText: wanted }) : candidates;
  if ((await option.count()) === 0) {
    throw new Error(
      wanted
        ? `Project matching "${wanted}" is not commissionable here on day 1`
        : 'No commissionable project on day 1',
    );
  }
  const optName = (await option.first().locator('.project-opt__name').textContent())?.trim();
  await option.first().locator('.project-opt__start').click();
  await page.waitForSelector('.project-opt__go', { timeout: 5000 });
  await page.locator('.project-opt__go').click();
  log(`commissioned: ${optName}`);

  // 5. Under-construction entry + groundbreaking news + scaffolding screenshot.
  //    Dolly the camera in first so the site is actually inspectable in shots.
  await page.mouse.move(800, 450);
  await page.mouse.wheel(0, -2000);
  await page.waitForSelector('.project-live--building', { timeout: 5000 });
  log(
    `under construction: "${(await page.locator('.project-live--building').textContent())?.trim()}"`,
  );
  await page.waitForTimeout(1200); // a few frames so the scaffold mesh is visible
  await page.screenshot({ path: `${SHOTS}/6-project-scaffolding.png` });

  // 6. Resume at Brisk to completion (resolve any memos that pop via first choice).
  await page.locator('button[title^="Play"]').click();
  await page.locator('button[title^="Brisk"]').click();
  let done = false;
  for (let i = 0; i < 80; i++) {
    if ((await page.locator('.project-live--done').count()) > 0) {
      done = true;
      break;
    }
    if ((await page.locator('.modal-backdrop').count()) > 0) {
      await page.locator('.modal-backdrop button.choice').first().click().catch(() => {});
    }
    await page.waitForTimeout(500);
  }
  if (!done) throw new Error('Project never completed (no .project-live--done within ~40s)');
  const doneLine = (await page.locator('.project-live--done').textContent())?.trim();
  log(`completed: "${doneLine}"`);

  // 7. The chronicle should mention the landmark: a groundbreaking item at
  //    commission and a celebratory headline at completion.
  await page.locator('button[title^="Gentle"]').click(); // slow down for stable reads
  const plainName = (optName ?? '').replace(/^the\s+/i, '');
  await page.locator('.chronicle-btn').click();
  await page.waitForSelector('.newsdrawer', { timeout: 5000 });
  const mentions = page.locator('.news-item', { hasText: plainName });
  const feedHits = await mentions.count();
  if (feedHits === 0) {
    throw new Error(`No chronicle mention of "${plainName}" found after completion`);
  }
  for (let i = 0; i < Math.min(feedHits, 3); i++) {
    log(`chronicle: ${(await mentions.nth(i).textContent())?.trim()}`);
  }
  await page.screenshot({ path: `${SHOTS}/7b-project-chronicle.png` });
  await page.locator('.newsdrawer__close').click();

  await page.waitForTimeout(800);
  await page.screenshot({ path: `${SHOTS}/7-project-complete.png` });

  const fatal = errors.filter((e) => !e.includes('favicon') && !e.includes('DevTools'));
  if (fatal.length > 0) {
    console.error('[project] console/page errors detected:');
    for (const e of fatal) console.error('  ' + e);
    process.exitCode = 1;
  } else {
    log('PASS — commission → scaffolding → landmark → headline, no console errors');
  }
} catch (err) {
  console.error('[project] FAIL:', err.message);
  await page.screenshot({ path: `${SHOTS}/project-fail.png` }).catch(() => {});
  process.exitCode = 1;
} finally {
  await browser.close();
}
