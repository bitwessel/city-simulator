// Ad-hoc: GPU string + rAF FPS sample + full-res center clip (smoke check).
// Usage: node scripts/fps-probe.mjs [seed]   (dev server on :5173, headed)
import { chromium } from 'playwright';

const seed = process.argv[2] ?? 'emberwick';
const query = process.argv[3] ?? ''; // e.g. "?nofx"
const browser = await chromium.launch({ headless: false });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });

await page.goto(`http://localhost:5173/${query}`, { waitUntil: 'networkidle' });
await page.locator('input').first().fill(seed);
await page.locator('button', { hasText: /create new city/i }).click();
await page.waitForSelector('canvas', { timeout: 15000 });
await page.waitForTimeout(2500);

const gpu = await page.evaluate(() => {
  const c = document.querySelector('canvas');
  const g = c.getContext('webgl2') || c.getContext('webgl');
  const ext = g.getExtension('WEBGL_debug_renderer_info');
  return String(g.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : g.RENDERER));
});
console.log('GPU:', gpu);

const sample = (ms) =>
  page.evaluate(
    (dur) =>
      new Promise((res) => {
        let frames = 0;
        const t0 = performance.now();
        const tick = () => {
          frames++;
          const dt = performance.now() - t0;
          if (dt < dur) requestAnimationFrame(tick);
          else res((frames / dt) * 1000);
        };
        requestAnimationFrame(tick);
      }),
    ms,
  );

page.on('console', (m) => {
  if (m.text().includes('[postfx]')) console.log('PAGE:', m.text());
});
const early = await sample(5000);
console.log('FPS early (0-5s):', early.toFixed(1));
await page.waitForTimeout(7000); // let the adaptive budget settle
const late = await sample(5000);
console.log('FPS late (12-17s):', late.toFixed(1));

// Zoom in on the town and grab a full-res clip for smoke/AO inspection.
await page.keyboard.press('Space');
await page.mouse.move(800, 430);
for (let i = 0; i < 8; i++) {
  await page.mouse.wheel(0, -400);
  await page.waitForTimeout(120);
}
await page.waitForTimeout(1000);
await page.screenshot({
  path: 'scripts/shots/dn-5-closeup-clip.png',
  clip: { x: 450, y: 150, width: 800, height: 560 },
});
console.log('captured dn-5-closeup-clip.png');

await browser.close();
