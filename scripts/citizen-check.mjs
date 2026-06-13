// Phase-06 citizen check: notable citizens are listed in the panel, open a bio
// card, exist in the 3D world, Follow tracks them smoothly at street level and
// releases cleanly (Esc, no camera teleport), and the Chronicle tab fills with
// entries over a run. Uses the dev-only window.__mmCitizens bridge (camera +
// cast positions) for the motion assertions and the deterministic 3D click.
// Usage: node scripts/citizen-check.mjs [seed]   (dev server on :5173)
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const SHOTS = 'scripts/shots';
mkdirSync(SHOTS, { recursive: true });

try {
  await fetch('http://localhost:5173', { signal: AbortSignal.timeout(3000) });
} catch {
  console.error('[citizens] FAIL: no dev server on http://localhost:5173 — run `npm run dev` in a separate terminal first');
  process.exit(1);
}

const seed = process.argv[2] ?? 'citizen-check-1';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message ?? e}`));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(`console.error: ${m.text()}`);
});

const log = (m) => console.log(`[citizens] ${m}`);
const shot = async (name) => {
  const buf = await page.screenshot({ path: `${SHOTS}/${name}` });
  log(`captured ${name}`);
  return buf;
};
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
/** Snapshot of the dev bridge (camera pos, follow flag, cast positions). */
const bridge = () =>
  page.evaluate(() => {
    const b = window.__mmCitizens;
    return b ? JSON.parse(JSON.stringify(b)) : null;
  });

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

try {
  // ----- Start a city ------------------------------------------------------
  log(`loading ${seed}...`);
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });
  await page.locator('input').first().fill(seed);
  await page.locator('button', { hasText: /create new city/i }).click();
  await page.waitForSelector('button:has-text("Surprise me")', { timeout: 10000 });
  await page.locator('button', { hasText: /surprise me/i }).click();
  await page.waitForSelector('canvas', { timeout: 15000 });
  await page.waitForSelector('text=/Day/i', { timeout: 15000 });
  await page.waitForTimeout(3000);
  // Pause the clock so the run is fully script-driven and the shots stable.
  await page.keyboard.press('Space');

  // Develop the districts a little so every starting cast member is bound to a
  // 3D instance (binding requires district development >= 5, like the crowd).
  await stepDays(12);

  // ----- 1. Roster in the City tab -----------------------------------------
  const sectionTitle = page.locator('.section__title', { hasText: /notable citizens/i });
  if ((await sectionTitle.count()) === 0) {
    throw new Error('no "Notable Citizens" section in the City tab');
  }
  const rows = page.locator('.citizen-row');
  const rosterCount = await rows.count();
  if (rosterCount < 6) {
    throw new Error(`expected >= 6 notable citizens in the roster, found ${rosterCount}`);
  }
  await sectionTitle.scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await shot('citizen-1-roster.png');
  log(`roster ok: ${rosterCount} notable citizens listed`);

  // ----- 2. Bio card from the roster ----------------------------------------
  const rosterName = (await rows.first().locator('.citizen-row__name').textContent())?.trim();
  await rows.first().click();
  await page.waitForSelector('.biocard', { timeout: 5000 });
  const bioName = (await page.locator('.biocard__name').textContent())?.trim();
  if (!bioName || bioName !== rosterName) {
    throw new Error(`bio card name "${bioName}" does not match roster entry "${rosterName}"`);
  }
  const archetype = (await page.locator('.biocard__archetype').textContent())?.trim();
  const personality = (await page.locator('.biocard__personality').textContent())?.trim();
  if (!archetype) throw new Error('bio card has no archetype line');
  if (!personality) throw new Error('bio card has no personality line');
  if ((await page.locator('.biocard__district').count()) === 0) {
    throw new Error('bio card has no home-district link');
  }
  if ((await page.locator('.biocard__follow').count()) === 0) {
    throw new Error('bio card has no Follow button');
  }
  await shot('citizen-2-bio.png');
  log(`bio card ok: ${bioName} — ${archetype}`);

  // ----- 3. Follow mode ------------------------------------------------------
  await page.locator('.biocard__follow').click();
  await page.waitForTimeout(3000); // glide in + a bit of tracking
  const b1 = await bridge();
  if (!b1) throw new Error('dev bridge window.__mmCitizens missing (dev server not in DEV mode?)');
  if (!b1.followed) throw new Error('followedCastId not set after clicking Follow');
  const followedId = b1.followed;
  if ((await page.locator('.biocard__follow--on').count()) === 0) {
    throw new Error('Follow button did not enter its active state');
  }
  const tracked = b1.cast[followedId];
  if (!tracked) throw new Error(`no live world position for followed citizen ${followedId}`);
  const standoff = dist(b1.cam, { x: tracked.wx, y: tracked.wy, z: tracked.wz });
  if (standoff > 16) {
    throw new Error(`follow camera is ${standoff.toFixed(1)} units from the citizen — not street level`);
  }
  const bufA = await shot('citizen-3-follow-a.png');
  await page.waitForTimeout(2000);
  const b2 = await bridge();
  const bufB = await shot('citizen-3-follow-b.png');
  const moved = dist(b1.cam, b2.cam);
  if (moved < 1) {
    throw new Error(`follow camera barely moved over 2s (${moved.toFixed(2)} units) — not tracking`);
  }
  if (bufA.equals(bufB)) throw new Error('the two follow frames are pixel-identical');
  log(`follow ok: street-level standoff ${standoff.toFixed(1)}u, camera moved ${moved.toFixed(1)}u over 2s`);

  // ----- 4. Esc releases without a jump --------------------------------------
  await page.keyboard.press('Escape');
  // Sample the camera through the handback: a smooth pull-back moves a few
  // units per 150ms; a radius-clamp teleport would show a ~20-unit step.
  let prev = (await bridge()).cam;
  let maxStep = 0;
  for (let i = 0; i < 15; i++) {
    await page.waitForTimeout(150);
    const cur = (await bridge()).cam;
    maxStep = Math.max(maxStep, dist(prev, cur));
    prev = cur;
  }
  if (maxStep > 8) {
    throw new Error(`camera jumped ${maxStep.toFixed(1)} units in one ~150ms step after release`);
  }
  const b3 = await bridge();
  if (b3.followed) throw new Error('followedCastId still set after Esc');
  if ((await page.locator('.biocard__follow--on').count()) > 0) {
    throw new Error('Follow button still in active state after Esc');
  }
  // After the handback settles the camera must be still (orbit owns it again).
  const c1 = (await bridge()).cam;
  await page.waitForTimeout(700);
  const c2 = (await bridge()).cam;
  const drift = dist(c1, c2);
  if (drift > 0.5) {
    throw new Error(`camera still drifting ${drift.toFixed(2)} units 3s after release`);
  }
  await shot('citizen-4-released.png');
  log(`release ok: max step ${maxStep.toFixed(1)}u (smooth), settled drift ${drift.toFixed(3)}u`);

  // ----- Bonus: click the citizen in the 3D world ----------------------------
  // After release the camera still frames the released citizen, so their pick
  // sphere is large and near screen center — click it via the bridge's live
  // projected position and the bio card must reopen.
  await page.locator('.biocard__close').click();
  await page.waitForTimeout(300);
  if ((await page.locator('.biocard').count()) > 0) {
    throw new Error('bio card did not close via its ✕ button');
  }
  // The cast walk continuously (the renderer animates regardless of the paused
  // sim clock), so a single snapshot->click can drift off the small pick sphere
  // and fall through to the district behind it. Retry against a fresh live
  // position each attempt; the pick sphere is reachable, so this converges fast.
  let opened3d = false;
  let everOnScreen = false;
  for (let attempt = 0; attempt < 12 && !opened3d; attempt++) {
    const sp = (await bridge()).cast[followedId];
    if (sp && sp.visible && sp.x > 360 && sp.x < 1550 && sp.y > 120 && sp.y < 700) {
      everOnScreen = true;
      await page.mouse.click(Math.round(sp.x), Math.round(sp.y));
      await page.waitForTimeout(250);
      if ((await page.locator('.biocard').count()) > 0) opened3d = true;
    } else {
      await page.waitForTimeout(200);
    }
  }
  if (opened3d) {
    const clickedName = (await page.locator('.biocard__name').textContent())?.trim();
    await shot('citizen-2b-3dclick.png');
    log(`3D click ok: opened bio card for ${clickedName}`);
    await page.locator('.biocard__close').click();
    await page.waitForTimeout(200);
  } else if (everOnScreen) {
    // Reachable but never opened => a real regression (e.g. the pick sphere's
    // bounding sphere going stale again), not just a flaky miss.
    throw new Error('clicking the on-screen cast citizen never opened the bio card over 12 attempts');
  } else {
    log('3D click skipped: citizen stayed off-screen / behind UI chrome (panel-roster path already verified)');
  }

  // ----- 5. Chronicle tab after a stretch of days ----------------------------
  await stepDays(35);
  await page.locator('button.tab', { hasText: /chronicle/i }).click();
  await page.waitForSelector('.ctab', { timeout: 5000 });
  const entryCount = await page.locator('.ctab__entry').count();
  if (entryCount < 1) {
    throw new Error('chronicle has no entries after ~47 days (founding alone should be there)');
  }
  await page.waitForTimeout(300);
  await shot('citizen-5-chronicle.png');
  log(`chronicle ok: ${entryCount} entr${entryCount === 1 ? 'y' : 'ies'} on the timeline`);

  // ----- Console-error gate ---------------------------------------------------
  const fatal = errors.filter((e) => !e.includes('favicon') && !e.includes('DevTools'));
  if (fatal.length > 0) {
    console.error(`[citizens] FAIL: ${fatal.length} console/page error(s):`);
    for (const e of fatal) console.error('  ' + e);
    process.exitCode = 1;
  } else {
    log('PASS: roster, bio card, follow + clean release, 3D presence and chronicle all verified with no console errors');
  }
} catch (err) {
  console.error('[citizens] FAIL:', err.message);
  await page.screenshot({ path: `${SHOTS}/citizen-fail.png` }).catch(() => {});
  process.exitCode = 1;
} finally {
  await browser.close();
}
