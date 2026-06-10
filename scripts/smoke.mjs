// End-to-end smoke test: drives the real app in headless Chromium.
// Usage: node scripts/smoke.mjs   (dev server must be running on :5173)
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

const log = (msg) => console.log(`[smoke] ${msg}`);
const modal = () => page.locator('.modal-backdrop');
const choices = () => page.locator('.modal-backdrop button.choice');

try {
  // 1. Start screen
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('text=Mythic Mayor', { timeout: 15000 });
  await page.screenshot({ path: `${SHOTS}/1-start.png` });
  log('start screen rendered');

  // 2. Create a city with a fixed seed for reproducibility
  await page.locator('input').first().fill('smoke-test-city');
  await page.locator('button', { hasText: /create new city/i }).click();

  // 3. Game screen: wait for the day counter and canvas
  await page.waitForSelector('canvas', { timeout: 15000 });
  await page.waitForSelector('text=/Day/i', { timeout: 15000 });
  await page.waitForTimeout(2500); // let the 3D scene render a few frames
  await page.screenshot({ path: `${SHOTS}/2-game.png` });
  log('game screen + 3D canvas rendered');

  // 4. Events are rare (~once a minute at Normal speed), so run at Fast and
  //    wait for the memo *notification* — the game keeps running meanwhile.
  await page.locator('button[title^="Fast"]').click();
  const toast = () => page.locator('.event-toast');
  let eventSeen = false;
  for (let i = 0; i < 200; i++) {
    if ((await toast().count()) > 0) {
      eventSeen = true;
      break;
    }
    await page.waitForTimeout(500);
  }
  if (!eventSeen) throw new Error('No event notification appeared within ~100s');
  await page.screenshot({ path: `${SHOTS}/3-event.png` });
  log('event notification appeared');

  // 5. Open the memo from the notification, pick the first choice, and
  //    confirm both the modal and the notification clear.
  await toast().locator('.event-toast__main').click();
  await page.waitForSelector('.modal-backdrop', { timeout: 5000 });
  const title = await page.locator('.memo__title').textContent();
  log(`memo opened: "${title?.trim()}"`);
  await page.screenshot({ path: `${SHOTS}/3b-memo.png` });
  await choices().first().click();
  await page.waitForTimeout(400);
  if ((await modal().count()) > 0) throw new Error('Modal did not close after choice');
  if ((await toast().count()) > 0) throw new Error('Notification did not clear after choice');
  await page.screenshot({ path: `${SHOTS}/4-after-choice.png` });
  log('choice applied, modal closed');

  // 6. Let the simulation run; resolve any events; confirm days advance.
  const readDay = async () => {
    const text = await page.locator('text=/Day\\s*\\d+/i').first().textContent();
    return parseInt(text?.match(/\d+/)?.[0] ?? '0', 10);
  };
  const dayBefore = await readDay();
  for (let i = 0; i < 20; i++) {
    if ((await modal().count()) > 0) await choices().first().click().catch(() => {});
    await page.waitForTimeout(500);
  }
  const dayAfter = await readDay();
  if (dayAfter <= dayBefore) {
    throw new Error(`Day did not advance (${dayBefore} -> ${dayAfter})`);
  }
  log(`simulation running: day ${dayBefore} -> ${dayAfter}`);

  // 7. Click a district in the 3D view (center of canvas area) to test selection.
  await page.mouse.click(800, 480);
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${SHOTS}/5-running.png` });

  const fatal = errors.filter(
    (e) => !e.includes('favicon') && !e.includes('DevTools'),
  );
  if (fatal.length > 0) {
    console.error('[smoke] console/page errors detected:');
    for (const e of fatal) console.error('  ' + e);
    process.exitCode = 1;
  } else {
    log('PASS — no console errors');
  }
} catch (err) {
  console.error('[smoke] FAIL:', err.message);
  await page.screenshot({ path: `${SHOTS}/fail.png` }).catch(() => {});
  process.exitCode = 1;
} finally {
  await browser.close();
}
