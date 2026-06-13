import { useCallback, useEffect, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { ACESFilmicToneMapping, Color, Vector3 } from 'three';
import type { Material, Object3D, Scene } from 'three';
import { useGameStore } from '../state/store';
import { DAYLIGHT } from './daylight';
import { currentAge, getAgeDef } from '../simulation/ages';
import type { City } from '../types';

// ---------------------------------------------------------------------------
// PhotoCapture — the postcard / photo-mode feature (Phase 06, Part 3).
//
// Architecture:
//   GoldenHourOverride — a tiny R3F component rendered INSIDE the Canvas.
//     When active, it overwrites the DAYLIGHT snapshot each frame so every
//     consumer (MoodLights, SunGlow, fog, background) sees warm golden light.
//     DaylightRig runs at priority -10 and GoldenHourOverride at default
//     priority 0, so GoldenHourOverride always fires after DaylightRig in the
//     same frame. On exit, GoldenHourOverride stops writing — DaylightRig
//     resumes ownership on its next tick and the scene snaps back within one
//     frame. Pure renderer, zero sim impact.
//
//   CanvasProbe — a tiny R3F component inside the Canvas that handles the
//     capture trigger. The capture path is render-then-read:
//       1. When the DOM toolbar calls triggerCapture(), it sets a pending
//          capture request (module-level, so it crosses the React context
//          boundary between inside/outside Canvas).
//       2. On the next useFrame tick, CanvasProbe calls gl.render(scene,camera)
//          synchronously, then immediately reads gl.domElement.toDataURL().
//          This bypasses the EffectComposer (PostFX) render targets and writes
//          directly into the WebGL canvas back-buffer. The toDataURL() call
//          happens in the same JS task right after the gl.render() call, so
//          the back-buffer is guaranteed to contain the freshly drawn frame
//          (the GPU flush is synchronous from the JS side; the browser cannot
//          clear the back-buffer until the current task finishes and the
//          compositor runs). This is consistent across Chromium / Firefox /
//          Safari without needing preserveDrawingBuffer.
//       Tone mapping: on the hardware path the Canvas is `flat` and ACES
//       lives in the PostFX composer, so a naive direct gl.render would come
//       out linear/washed-out. The capture therefore temporarily sets
//       gl.toneMapping = ACESFilmicToneMapping (with a needsUpdate sweep —
//       three.js bakes tone mapping into compiled programs) and restores it
//       in the same frame. Software/`?nofx` renderers already tone-map at the
//       renderer (onCreated), so no switch happens there.
//       Note: PostFX bloom/vignette are NOT in the captured image because we
//       bypass the EffectComposer — acceptable for a postcard; color/exposure
//       fidelity is what matters, and that now matches the screen.
//
//   PhotoToolbar — a DOM component rendered OUTSIDE the Canvas (in
//     GameScreen). It owns the flair state (frame choice, golden toggle) and
//     the capture action. It calls triggerCapture() which resolves once
//     CanvasProbe handles it on the next frame.
//
// Esc interaction:
//   CityScene's Esc handler (window keydown, added BEFORE ours) fires first
//   when followedCastId is truthy and clears the follow. Our handler fires on
//   the same event (Esc) and also clears photo mode. The net result:
//   - No follow active: one Esc exits photo mode.
//   - Follow active: Esc releases follow AND exits photo mode in the same event.
//   Both states leave no broken state.
// ---------------------------------------------------------------------------

// ---- Golden-hour palette ---------------------------------------------------
// Late-afternoon low sun, ~15° elevation. Values match the DaylightSnapshot
// unit system (same fields as updateDaylight's output).

const GOLDEN_SUN_COLOR = new Color('#ffb060');
const GOLDEN_AMBIENT_COLOR = new Color('#ffe8c0');
const GOLDEN_GROUND_COLOR = new Color('#d4a870');
const GOLDEN_SKY_COLOR = new Color('#ffcf8a');
const GOLDEN_FOG_COLOR = new Color('#ffba70');
const GOLDEN_SUN_DIR = new Vector3(-0.72, 0.22, 0.65).normalize();

/** R3F component (inside Canvas) — overrides DAYLIGHT each frame when active.
 *  DaylightRig (priority -10) runs first; this component (priority 0) writes
 *  over it, so the override wins cleanly every frame. */
export function GoldenHourOverride({ active }: { active: boolean }) {
  useFrame(() => {
    if (!active) return;
    DAYLIGHT.phase = 0.08;
    DAYLIGHT.dayness = 0.45;
    DAYLIGHT.nightness = 0;
    DAYLIGHT.golden = 0.95;
    DAYLIGHT.glowT = 0.55;
    DAYLIGHT.sunDir.copy(GOLDEN_SUN_DIR);
    DAYLIGHT.sunColor.copy(GOLDEN_SUN_COLOR);
    DAYLIGHT.sunIntensity = 1.8;
    DAYLIGHT.fillIntensity = 0.38;
    DAYLIGHT.ambientColor.copy(GOLDEN_AMBIENT_COLOR);
    DAYLIGHT.ambientIntensity = 1.0;
    DAYLIGHT.groundColor.copy(GOLDEN_GROUND_COLOR);
    DAYLIGHT.skyColor.copy(GOLDEN_SKY_COLOR);
    DAYLIGHT.fogColor.copy(GOLDEN_FOG_COLOR);
  });
  return null;
}

// ---- Frame borders ---------------------------------------------------------

type FrameChoice = 'plain' | 'ornate';

const FRAME_OPTIONS: { id: FrameChoice; label: string }[] = [
  { id: 'plain', label: 'Plain' },
  { id: 'ornate', label: 'Ornate' },
];

/** Composite the WebGL canvas + optional border + caption strip into a PNG
 *  data-URL. Returns the data-URL string. */
function compositePostcard(
  glCanvas: HTMLCanvasElement,
  city: City,
  frame: FrameChoice,
): string {
  const W = glCanvas.width;
  const H = glCanvas.height;
  // Caption strip: ~7% of image height, minimum 32px so text is legible.
  const STRIP = Math.max(32, Math.round(H * 0.072));
  const TOTAL_H = H + STRIP;

  const out = document.createElement('canvas');
  out.width = W;
  out.height = TOTAL_H;
  const ctx = out.getContext('2d')!;

  // 1. WebGL scene
  ctx.drawImage(glCanvas, 0, 0, W, H);

  // 2. Optional ornate border (composited on top of the scene)
  if (frame === 'ornate') {
    const b = Math.max(2, Math.round(Math.min(W, H) * 0.012));
    // Outer dark frame
    ctx.strokeStyle = 'rgba(80,50,10,0.80)';
    ctx.lineWidth = b * 2.5;
    ctx.strokeRect(0, 0, W, H);
    // Inner gold line
    ctx.strokeStyle = 'rgba(220,160,50,0.78)';
    ctx.lineWidth = b;
    ctx.strokeRect(b * 3, b * 3, W - b * 6, H - b * 6);
    // Corner cross ornaments
    const co = b * 4;
    const cl = b * 9;
    const corners: [number, number][] = [
      [co, co],
      [W - co, co],
      [co, H - co],
      [W - co, H - co],
    ];
    ctx.strokeStyle = 'rgba(220,160,50,0.72)';
    ctx.lineWidth = b;
    for (const [cx, cy] of corners) {
      ctx.beginPath();
      ctx.moveTo(cx - cl, cy); ctx.lineTo(cx + cl, cy);
      ctx.moveTo(cx, cy - cl); ctx.lineTo(cx, cy + cl);
      ctx.stroke();
    }
  }

  // 3. Caption strip (parchment tone)
  const stripY = H;
  const grad = ctx.createLinearGradient(0, stripY, 0, stripY + STRIP);
  grad.addColorStop(0, 'rgba(255,242,200,0.97)');
  grad.addColorStop(1, 'rgba(238,210,155,0.97)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, stripY, W, STRIP);
  // Top hairline separator
  ctx.fillStyle = 'rgba(170,120,35,0.45)';
  ctx.fillRect(0, stripY, W, 1);

  const baseSize = Math.max(9, Math.round(STRIP * 0.28));
  const lgSize = Math.max(11, Math.round(STRIP * 0.38));
  const midY = stripY + STRIP / 2;

  const cityName = city.name ?? 'Unknown City';
  // The real ages table (src/simulation/ages.ts) owns display names —
  // currentAge reads an unset city.age as the founding 'settlement'.
  const ageName = getAgeDef(currentAge(city)).name;
  const dayStr = `Day ${city.day}`;
  const sub = `${dayStr} · ${ageName}`;
  const seedStr = `Seed: ${city.seed.raw}`;

  // Left: city name (large) + sub-line (day · age)
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#3a2200';
  ctx.font = `700 ${lgSize}px serif`;
  ctx.textAlign = 'left';
  ctx.fillText(cityName, 14, midY - Math.round(STRIP * 0.13));

  ctx.font = `500 ${baseSize}px sans-serif`;
  ctx.fillStyle = '#7a5020';
  ctx.fillText(sub, 14, midY + Math.round(STRIP * 0.18));

  // Center: "Mythic Mayor" watermark
  ctx.font = `700 italic ${Math.max(7, Math.round(baseSize * 0.78))}px serif`;
  ctx.fillStyle = 'rgba(155,95,18,0.50)';
  ctx.textAlign = 'center';
  ctx.fillText('Mythic Mayor', W / 2, midY);

  // Right: seed string (shareable)
  ctx.font = `500 ${Math.max(7, Math.round(baseSize * 0.82))}px monospace`;
  ctx.fillStyle = '#9a6e2a';
  ctx.textAlign = 'right';
  ctx.fillText(seedStr, W - 14, midY);

  return out.toDataURL('image/png');
}

// ---- Module-level capture rendezvous ---------------------------------------
// This object crosses the React context boundary: the DOM toolbar sets a
// pending request; the R3F useFrame (inside Canvas) resolves it.

type CaptureResolver = (url: string | null) => void;
let pendingCapture: { city: City; frame: FrameChoice; resolve: CaptureResolver } | null = null;

/** Called from the DOM toolbar. Resolves after CanvasProbe handles the next
 *  useFrame tick. */
function triggerCapture(city: City, frame: FrameChoice): Promise<string | null> {
  return new Promise<string | null>((resolve) => {
    pendingCapture = { city, frame, resolve };
  });
}

/** Flag every material in the scene for recompilation. three.js bakes the
 *  renderer's tone mapping into compiled programs, so toggling gl.toneMapping
 *  only takes effect after a needsUpdate sweep. Programs are cached by key,
 *  so flipping back and forth re-links cached shaders rather than recompiling
 *  from source — only the first capture pays the real compile cost. */
function invalidateSceneMaterials(scene: Scene): void {
  scene.traverse((obj: Object3D) => {
    const material = (obj as { material?: Material | Material[] }).material;
    if (!material) return;
    if (Array.isArray(material)) {
      for (const m of material) m.needsUpdate = true;
    } else {
      material.needsUpdate = true;
    }
  });
}

/** Rendered inside the Canvas — performs the actual gl.render + toDataURL.
 *  Must be a sibling of DaylightRig / PostFX inside <Canvas>. */
export function CanvasProbe() {
  const { gl, scene, camera } = useThree();

  useFrame(() => {
    if (!pendingCapture) return;
    const { city, frame, resolve } = pendingCapture;
    pendingCapture = null;

    // On the hardware path the Canvas is `flat` (gl.toneMapping is
    // NoToneMapping) and ACES lives in the PostFX composer — which our direct
    // gl.render below bypasses. Rendering as-is would capture washed-out
    // linear colors. So: temporarily tone-map at the renderer for the capture,
    // then restore. On software renderers / `?nofx`, onCreated already set
    // gl.toneMapping = ACES, so this is a no-op (no double-apply, no sweep).
    const prevToneMapping = gl.toneMapping;
    const switchToneMapping = prevToneMapping !== ACESFilmicToneMapping;
    try {
      if (switchToneMapping) {
        gl.toneMapping = ACESFilmicToneMapping;
        invalidateSceneMaterials(scene);
      }
      // Reset render target so we write to the WebGL canvas back-buffer,
      // not a post-processing render target.
      gl.setRenderTarget(null);
      // gl.render writes into the canvas's back-buffer synchronously.
      gl.render(scene, camera);
      // toDataURL() called immediately in the same JS task reads those pixels
      // before the browser compositor can clear the back-buffer on commit.
      // This is reliable without preserveDrawingBuffer in all major browsers.
      const url = compositePostcard(gl.domElement, city, frame);
      resolve(url);
    } catch (err) {
      console.error('[postcard] capture failed', err);
      resolve(null);
    } finally {
      if (switchToneMapping) {
        // Hand the un-tone-mapped pipeline back to the composer before it
        // renders this same frame (it runs at a later useFrame priority).
        gl.toneMapping = prevToneMapping;
        invalidateSceneMaterials(scene);
      }
    }
  });

  return null;
}

// ---- Capture hook ----------------------------------------------------------
// Used by PhotoToolbar to dispatch a capture request and handle the download.

function useCapture(cityRef: React.RefObject<City | null>, frameRef: React.RefObject<FrameChoice>) {
  const [capturing, setCapturing] = useState(false);
  const capturingRef = useRef(false);

  const capture = useCallback(async () => {
    if (capturingRef.current || !cityRef.current) return;
    capturingRef.current = true;
    setCapturing(true);
    try {
      const url = await triggerCapture(cityRef.current, frameRef.current);
      if (url) {
        const a = document.createElement('a');
        a.href = url;
        const safeName = (cityRef.current.name ?? 'city')
          .replace(/[^a-z0-9]/gi, '-')
          .toLowerCase();
        a.download = `mythic-mayor-${safeName}-day${cityRef.current.day}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
    } finally {
      capturingRef.current = false;
      setCapturing(false);
    }
  }, [cityRef, frameRef]);

  return { capture, capturing };
}

// ---- PhotoToolbar (DOM, outside Canvas) ------------------------------------

export interface PhotoToolbarProps {
  city: City | null;
  goldenActive: boolean;
  onGoldenToggle: () => void;
}

export function PhotoToolbar({ city, goldenActive, onGoldenToggle }: PhotoToolbarProps) {
  const setPhotoMode = useGameStore((s) => s.setPhotoMode);
  const followCast = useGameStore((s) => s.followCast);
  const followedCastId = useGameStore((s) => s.followedCastId);

  const [frame, setFrame] = useState<FrameChoice>('plain');

  // Stable refs so useCapture callback never goes stale.
  const cityRef = useRef<City | null>(city);
  const frameRef = useRef<FrameChoice>(frame);
  cityRef.current = city;
  frameRef.current = frame;

  const { capture, capturing } = useCapture(cityRef, frameRef);

  const exitPhotoMode = useCallback(() => {
    if (followedCastId) followCast(null);
    setPhotoMode(false);
  }, [followedCastId, followCast, setPhotoMode]);

  // Esc exits photo mode (and follow if active).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') exitPhotoMode();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [exitPhotoMode]);

  return (
    <>
      {/* Subtle framing hint at the top */}
      <div className="photo-hint" aria-live="polite">
        Photo Mode — orbit to frame · Esc to exit
      </div>

      {/* Main toolbar */}
      <div className="photo-toolbar" role="toolbar" aria-label="Photo mode controls">
        {/* Frame picker */}
        <div className="photo-flair">
          <span className="photo-flair__label">Frame</span>
          {FRAME_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              className={`photo-frame-btn${frame === opt.id ? ' photo-frame-btn--active' : ''}`}
              onClick={() => setFrame(opt.id)}
              title={`${opt.label} border`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <div className="photo-toolbar__sep" />

        {/* Golden-hour toggle */}
        <button
          className={`photo-golden-btn${goldenActive ? ' photo-golden-btn--active' : ''}`}
          onClick={onGoldenToggle}
          title={goldenActive ? 'Restore normal lighting' : 'Switch to golden-hour lighting'}
        >
          {goldenActive ? '☀' : '🌅'} Golden hour
        </button>

        <div className="photo-toolbar__sep" />

        {/* Capture */}
        <button
          className="photo-capture-btn"
          onClick={capture}
          disabled={capturing || !city}
          title="Capture postcard (PNG download)"
          data-testid="photo-capture-btn"
        >
          <span className="photo-capture-btn__icon">📸</span>
          {capturing ? 'Saving…' : 'Capture'}
        </button>

        <div className="photo-toolbar__sep" />

        {/* Exit */}
        <button
          className="photo-exit-btn"
          onClick={exitPhotoMode}
          title="Exit photo mode (Esc)"
        >
          ✕ Exit
        </button>
      </div>
    </>
  );
}
