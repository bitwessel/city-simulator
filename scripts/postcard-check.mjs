// Phase-06 postcard check: enters photo mode, verifies HUD is hidden, captures
// a postcard, intercepts the download, saves it to scripts/shots/, and fails
// if the PNG is essentially black OR visibly desaturated vs the on-screen view
// (the capture must bake tone mapping in — see PhotoCapture's CanvasProbe).
// Usage: node scripts/postcard-check.mjs [seed] [--headed]   (dev server on :5173)
//   --headed runs on the real GPU. Headless Chromium = SwiftShader, where the
//   renderer tone-maps anyway (PostFX skips itself), so only a headed run
//   exercises the composer/flat-canvas path the tone-mapping capture fix
//   exists for. Use it when touching the capture pipeline.
import { chromium } from 'playwright';
import { mkdirSync, readFileSync } from 'node:fs';

const SHOTS = 'scripts/shots';
mkdirSync(SHOTS, { recursive: true });

try {
  await fetch('http://localhost:5173', { signal: AbortSignal.timeout(3000) });
} catch {
  console.error(
    '[postcard] FAIL: no dev server on http://localhost:5173 — run `npm run dev` in a separate terminal first',
  );
  process.exit(1);
}

const args = process.argv.slice(2);
const headed = args.includes('--headed');
const seed = args.find((a) => !a.startsWith('--')) ?? 'postcard-check-1';
const browser = await chromium.launch({ headless: !headed });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (msg) => {
  // Resource-fetch noise (e.g. headed Chromium 404ing /favicon.ico, which
  // headless never requests) is not an app error.
  if (msg.type() === 'error' && !/Failed to load resource/.test(msg.text())) {
    errors.push(msg.text());
  }
});

console.log(`[postcard] loading ${seed}...`);
await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });
await page.locator('input').first().fill(seed);
await page.locator('button', { hasText: /create new city/i }).click();
// Founding screen: skip the ritual with "Surprise me".
await page.waitForSelector('button:has-text("Surprise me")', { timeout: 10000 });
await page.locator('button', { hasText: /surprise me/i }).click();
await page.waitForSelector('canvas', { timeout: 15000 });
// Wait for the scene to fully render.
await page.waitForTimeout(3500);
// Pause so the shots are stable.
await page.keyboard.press('Space');
await page.waitForTimeout(400);

// ---- 1. Verify the camera button exists and enter photo mode ----
const camBtn = page.locator('[data-testid="photo-mode-btn"]');
if ((await camBtn.count()) === 0) {
  errors.push('Camera button (data-testid="photo-mode-btn") not found in ControlBar');
} else {
  await camBtn.click();
  await page.waitForTimeout(600);
  console.log('[postcard] entered photo mode');
}

// ---- 2. Verify HUD is hidden ----
const gameHasPhotoClass = await page.evaluate(() => {
  return document.querySelector('.game')?.classList.contains('game--photo') ?? false;
});
if (!gameHasPhotoClass) {
  errors.push('.game element does not have .game--photo class — HUD may not be hidden');
}

const overlayHidden = await page.evaluate(() => {
  const el = document.querySelector('.game__overlay');
  if (!el) return false;
  return getComputedStyle(el).display === 'none';
});
if (!overlayHidden) {
  errors.push('.game__overlay is not hidden in photo mode');
} else {
  console.log('[postcard] HUD hidden correctly');
}

const toolbarVisible = (await page.locator('.photo-toolbar').count()) > 0;
if (!toolbarVisible) {
  errors.push('.photo-toolbar not found while in photo mode');
} else {
  console.log('[postcard] photo toolbar visible');
}

// Take a screenshot of the clean framing view.
await page.screenshot({ path: `${SHOTS}/postcard-${seed}-framing.png` });
console.log(`[postcard] captured postcard-${seed}-framing.png`);

// ---- 3. Intercept the PNG download ----
let downloadedPath = null;
const downloadPromise = page.waitForEvent('download', { timeout: 15000 }).catch(() => null);

// Click the capture button.
const captureBtn = page.locator('[data-testid="photo-capture-btn"]');
if ((await captureBtn.count()) === 0) {
  errors.push('Capture button (data-testid="photo-capture-btn") not found in photo toolbar');
} else {
  await captureBtn.click();
  console.log('[postcard] capture button clicked — waiting for download...');
}

const download = await downloadPromise;
if (!download) {
  errors.push('No file download triggered by the capture button within 15 s');
} else {
  downloadedPath = `${SHOTS}/postcard-${seed}-capture.png`;
  await download.saveAs(downloadedPath);
  console.log(`[postcard] download saved to ${downloadedPath}`);

  // ---- 4. Verify the PNG is not essentially black ----
  // Strategy: load the PNG file bytes and look at the raw IDAT compressed
  // data. A truly black/empty PNG will have a very small IDAT chunk (nearly
  // all zeros compress to almost nothing); a real scene will have a much
  // larger IDAT chunk. We also do a simple byte-entropy scan of the whole file.
  //
  // More accurately: read the file, find the IDAT chunk, and check that the
  // compressed data is larger than a threshold (black 1600x900 PNG compresses
  // to under ~3 KB; a real scene should be > 100 KB).
  //
  // Even simpler: if the file is over 50 KB, we know it's not black.
  // (A fully-black 1600x900 PNG with caption strip ≈ 2–5 KB;
  //  a real rendered scene ≈ 500 KB–3 MB.)

  let fileSize = 0;
  try {
    const { statSync } = await import('node:fs');
    const stat = statSync(downloadedPath);
    fileSize = stat.size;
    console.log(`[postcard] downloaded PNG size: ${fileSize} bytes`);
  } catch {
    errors.push(`Could not stat downloaded PNG at ${downloadedPath}`);
  }

  if (fileSize > 0 && fileSize < 20_000) {
    errors.push(
      `Downloaded PNG is ${fileSize} bytes — likely black or empty (expected > 20 KB for a real scene)`,
    );
  } else if (fileSize >= 20_000) {
    console.log(`[postcard] PNG file size looks good (${(fileSize / 1024).toFixed(0)} KB)`);

    // Additional check: sample bytes from the middle of the file. A black PNG
    // has very low entropy in the pixel data region. We look for the presence
    // of varied bytes (high byte variety = real image content).
    try {
      const buf = readFileSync(downloadedPath);
      // Sample 256 bytes from ~1/3 through the file
      const offset = Math.floor(buf.length / 3);
      const sample = buf.slice(offset, offset + 256);
      const uniqueBytes = new Set(sample).size;
      if (uniqueBytes < 8) {
        errors.push(
          `PNG data appears to have very low entropy (${uniqueBytes} unique byte values in sample) — may be black`,
        );
      } else {
        console.log(
          `[postcard] PNG entropy check passed (${uniqueBytes} unique byte values in sample)`,
        );
      }
    } catch {
      // Non-fatal — file size check already passed
      console.log('[postcard] skipping entropy check (could not read file)');
    }

    // ---- 4b. Verify the capture isn't desaturated (tone mapping baked in) --
    // Compare mean pixel saturation of the downloaded postcard against the
    // viewport screenshot taken moments earlier from the same camera pose.
    // An un-tone-mapped (linear) capture reads pale/washed-out — markedly
    // lower saturation than the tone-mapped on-screen frame. Decoding happens
    // in the page (canvas + getImageData on a 64x64 downsample); minor
    // differences (toolbar in the screenshot, caption strip in the capture)
    // are noise at this scale, so the threshold is generous.
    const meanSaturation = (b64) =>
      page.evaluate(async (data) => {
        const img = new Image();
        await new Promise((res, rej) => {
          img.onload = res;
          img.onerror = rej;
          img.src = 'data:image/png;base64,' + data;
        });
        const c = document.createElement('canvas');
        c.width = 64;
        c.height = 64;
        const ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0, 64, 64);
        const d = ctx.getImageData(0, 0, 64, 64).data;
        let sat = 0;
        let n = 0;
        for (let i = 0; i < d.length; i += 4) {
          const mx = Math.max(d[i], d[i + 1], d[i + 2]);
          const mn = Math.min(d[i], d[i + 1], d[i + 2]);
          sat += mx > 0 ? (mx - mn) / mx : 0;
          n++;
        }
        return sat / n;
      }, b64);

    try {
      const screenB64 = readFileSync(`${SHOTS}/postcard-${seed}-framing.png`).toString('base64');
      const captureB64 = readFileSync(downloadedPath).toString('base64');
      const screenSat = await meanSaturation(screenB64);
      const captureSat = await meanSaturation(captureB64);
      console.log(
        `[postcard] mean saturation — screen: ${screenSat.toFixed(3)}, capture: ${captureSat.toFixed(3)}`,
      );
      if (captureSat < screenSat * 0.6) {
        errors.push(
          `Capture is desaturated vs the screen (capture ${captureSat.toFixed(3)} < 60% of screen ${screenSat.toFixed(3)}) — tone mapping likely missing from the capture render`,
        );
      } else {
        console.log('[postcard] saturation check passed — capture matches on-screen color');
      }
    } catch (e) {
      errors.push(`Saturation comparison failed to run: ${e}`);
    }
  }
}

// ---- 5. Verify Esc exits photo mode ----
await page.keyboard.press('Escape');
await page.waitForTimeout(400);
const stillInPhotoMode = await page.evaluate(() => {
  return document.querySelector('.game')?.classList.contains('game--photo') ?? false;
});
if (stillInPhotoMode) {
  errors.push('Esc did not exit photo mode');
} else {
  console.log('[postcard] Esc exited photo mode correctly');
}

const overlayBack = await page.evaluate(() => {
  const el = document.querySelector('.game__overlay');
  if (!el) return false;
  return getComputedStyle(el).display !== 'none';
});
if (!overlayBack) {
  errors.push('.game__overlay is still hidden after exiting photo mode');
} else {
  console.log('[postcard] HUD restored after exit');
}

await page.screenshot({ path: `${SHOTS}/postcard-${seed}-after-exit.png` });
console.log(`[postcard] captured postcard-${seed}-after-exit.png`);

// ---- Final result ----
if (errors.length > 0) {
  console.error(`[postcard] FAIL: ${errors.length} problem(s):`);
  for (const e of errors) console.error('  ' + e);
  await browser.close();
  process.exit(1);
}

console.log('[postcard] PASS: photo mode, HUD hide, capture, Esc exit all verified');
await browser.close();
