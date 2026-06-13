// Screenshot a curated world from several angles + one overview.
// Usage: node scripts/world-shots.mjs <id> [--headed]
//
// Dev server must be running on http://localhost:5173.
// Writes scripts/shots/world-<id>/ (angle-1..4, overview) and
//         worlds/<id>/preview.png.

import { chromium } from 'playwright';
import { mkdirSync, copyFileSync } from 'node:fs';
import { resolve } from 'node:path';

const BASE = 'http://localhost:5173';
const ROOT = resolve(import.meta.dirname, '..');

const argv = process.argv.slice(2);
if (argv.filter((a) => !a.startsWith('--')).length === 0) {
  console.error('[world-shots] FAIL: usage: node scripts/world-shots.mjs <id> [--headed]');
  process.exit(1);
}

const id = argv.find((a) => !a.startsWith('--'));
const headed = argv.includes('--headed');

const SHOTS = `scripts/shots/world-${id}`;
mkdirSync(SHOTS, { recursive: true });

// ---- Dev-server guard -------------------------------------------------------

try {
  await fetch(BASE, { signal: AbortSignal.timeout(3000) });
} catch {
  console.error('[world-shots] FAIL: no dev server on http://localhost:5173 — run `npm run dev` first');
  process.exit(1);
}

// ---- Launch browser ---------------------------------------------------------

const browser = await chromium.launch({ headless: !headed });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });

const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(`console.error: ${m.text()}`);
});

const log = (msg) => console.log(`[world-shots] ${msg}`);

try {
  // 1. Navigate to the app.
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('text=Mythic Mayor', { timeout: 15000 });

  // 2. Load the world through the dev bridge if it is available; otherwise fall
  //    back to clicking the gallery card. We give the bridge a moment to register.
  const bridgeReady = await page.waitForFunction(
    () => typeof window.__mmWorld?.load === 'function',
    { timeout: 8000 },
  ).then(() => true).catch(() => false);

  if (bridgeReady) {
    log(`loading world "${id}" via __mmWorld bridge…`);
    await page.evaluate((worldId) => window.__mmWorld.load(worldId), id);
  } else {
    // Fallback: click the gallery card whose text matches the world id.
    log(`bridge not found; clicking gallery card for "${id}"…`);
    await page.locator(`[data-world-id="${id}"], text=${id}`).first().click();
  }

  // 3. Wait for the canvas (the game scene is now loading).
  await page.waitForSelector('canvas', { timeout: 20000 });
  log('canvas ready, settling 3s…');
  await page.waitForTimeout(3000);

  // 4. Dismiss any opening modal (founding briefing / memo) and pause the clock.
  const backdrop = page.locator('.modal-backdrop');
  if ((await backdrop.count()) > 0) {
    const choiceBtn = backdrop.locator('button.choice');
    if ((await choiceBtn.count()) > 0) {
      await choiceBtn.first().click();
      log('dismissed opening modal');
      await page.waitForTimeout(400);
    }
  }
  await page.keyboard.press('Space');
  await page.waitForTimeout(500);

  // 4b. Enter photo mode so the HUD is hidden — gallery/authoring frames want a
  //     clean cityscape, not the panels. Also hide the photo toolbar so the
  //     frame is pure scene. Falls back to HUD-visible capture if unavailable.
  const photoBtn = page.locator('[data-testid="photo-mode-btn"]');
  if ((await photoBtn.count()) > 0) {
    await photoBtn.click();
    await page.waitForTimeout(500);
    await page.addStyleTag({ content: '.photo-toolbar{display:none !important}' });
    log('entered photo mode (HUD hidden)');
  } else {
    log('photo-mode button not found; capturing with HUD visible');
  }

  // Helper: dispatch stepped wheel events to OrbitControls (one event = one dolly step).
  async function scrollSteps(deltaY, steps) {
    const box = await page.locator('canvas').boundingBox();
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    for (let i = 0; i < steps; i++) {
      await page.mouse.move(cx, cy);
      await page.evaluate(({ x, y, dy }) => {
        const el = document.elementFromPoint(x, y);
        if (el) {
          el.dispatchEvent(new WheelEvent('wheel', {
            bubbles: true, cancelable: true,
            clientX: x, clientY: y,
            deltaY: dy, deltaMode: 0,
          }));
        }
      }, { x: cx, y: cy, dy: deltaY });
      await page.waitForTimeout(30);
    }
  }

  // Helper: drag on the canvas centre to rotate the OrbitControls camera.
  async function dragRotate(dx, dy) {
    const box = await page.locator('canvas').boundingBox();
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + dx, cy + dy, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(400);
  }

  // 5. Angle 1 — default view.
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${SHOTS}/angle-1.png` });
  log('captured angle-1.png');

  // 6. Angle 2 — rotate left.
  await dragRotate(-180, 0);
  await page.screenshot({ path: `${SHOTS}/angle-2.png` });
  log('captured angle-2.png');

  // 7. Angle 3 — rotate right and slightly tilted.
  await dragRotate(300, -60);
  await page.screenshot({ path: `${SHOTS}/angle-3.png` });
  log('captured angle-3.png');

  // 8. Angle 4 — swing around the other side.
  await dragRotate(-220, 40);
  await page.screenshot({ path: `${SHOTS}/angle-4.png` });
  log('captured angle-4.png');

  // 9. Overview — zoom out with stepped wheel events so the whole city is visible.
  await scrollSteps(120, 18);
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${SHOTS}/overview.png` });
  log('captured overview.png');

  // 10. Copy the best framing to worlds/<id>/preview.png. angle-1 is the app's
  //     default-load camera pose — a reliably flattering 3/4 aerial — which
  //     reads far better on a gallery card than the over-rotated zoom-out.
  const previewDest = resolve(ROOT, 'worlds', id, 'preview.png');
  copyFileSync(`${SHOTS}/angle-1.png`, previewDest);
  log(`preview.png → worlds/${id}/preview.png`);

  // 11. Console-error check (non-fatal: log and exit 1 but don't skip cleanup).
  const fatal = errors.filter(
    (e) => !e.includes('favicon') && !e.includes('DevTools'),
  );
  if (fatal.length > 0) {
    console.error('[world-shots] Console/page errors detected:');
    for (const e of fatal) console.error('  ' + e);
    process.exitCode = 1;
  } else {
    log('PASS — no console errors');
  }

  log(`Done. Screenshots in ${SHOTS}/ and worlds/${id}/preview.png`);
} catch (err) {
  console.error('[world-shots] FAIL:', err.message);
  await page.screenshot({ path: `${SHOTS}/fail.png` }).catch(() => {});
  process.exitCode = 1;
} finally {
  await browser.close();
}
