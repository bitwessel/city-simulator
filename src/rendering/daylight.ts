import { Color, Vector3, type Material, type Mesh, type Object3D, type Scene } from 'three';
import type { MoodTheme } from './palette';

// ---------------------------------------------------------------------------
// Daylight — the day/night cycle's single source of truth.
//
// The mood theme picks the palette; time of day modulates it. DaylightRig
// advances `phase` from the game clock (frozen while paused / reading a memo /
// after the run ends) and calls `updateDaylight` once per frame to fill the
// mutable DAYLIGHT snapshot below. Everything else (lights, sun glow sprite,
// fog/background, window glow) just *reads* DAYLIGHT in its own useFrame —
// no React state, no per-frame allocation, no re-renders.
//
// A full cycle spans DAYS_PER_CYCLE in-game days: at Steady (1 day/sec) the
// sun wheels across the sky in ~20 real seconds and night lasts ~7 — a slow
// breathing rhythm rather than a strobe. Brisk fast-forwards the heavens too,
// which reads as honest time-lapse.
// ---------------------------------------------------------------------------

/** In-game days per full day/night cycle. */
export const DAYS_PER_CYCLE = 30;
/** Cycle position at day 0 — a golden morning shortly after sunrise. */
export const START_PHASE = 0.06;
/** Fraction of the cycle the sun is up; the rest is night. */
const NIGHT_START = 0.68;

const GOLD = new Color('#ffaa5e');
const MOON = new Color('#a7bce8');
const NIGHT_SKY = new Color('#1e2a4e');
const NIGHT_FOG = new Color('#2b3760');
const NIGHT_AMBIENT = new Color('#7585b5');
const NIGHT_GROUND = new Color('#39426b');
const DUSK_SKY = new Color('#ffb37a');

export interface DaylightSnapshot {
  /** Cycle phase 0..1 (0 = sunrise, NIGHT_START = sunset). */
  phase: number;
  /** Sun elevation factor: 1 high noon, 0 at the horizon. */
  dayness: number;
  /** 0 by day, 1 in deep night. */
  nightness: number;
  /** Warm golden-hour band near sunrise/sunset. */
  golden: number;
  /** 0..1 lerp for window/lantern emissives (userData.glowDay -> glowNight). */
  glowT: number;
  /** Normalized direction toward the sun (or moon, after dusk). */
  sunDir: Vector3;
  sunColor: Color;
  sunIntensity: number;
  fillIntensity: number;
  ambientColor: Color;
  ambientIntensity: number;
  groundColor: Color;
  skyColor: Color;
  fogColor: Color;
}

/** Mutable singleton snapshot, refreshed once per frame by DaylightRig. */
export const DAYLIGHT: DaylightSnapshot = {
  phase: START_PHASE,
  dayness: 1,
  nightness: 0,
  golden: 0,
  glowT: 0,
  sunDir: new Vector3(0.5, 0.8, 0.3).normalize(),
  sunColor: new Color('#fff7ee'),
  sunIntensity: 1.5,
  fillIntensity: 0.5,
  ambientColor: new Color('#f1f9ff'),
  ambientIntensity: 1.2,
  groundColor: new Color('#f4faf0'),
  skyColor: new Color('#cfeaf7'),
  fogColor: new Color('#e6f4fb'),
};

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

const sunVec = new Vector3();
const moonVec = new Vector3();

/** Recompute the DAYLIGHT snapshot for a mood theme + cycle phase. */
export function updateDaylight(theme: MoodTheme, phase: number): void {
  phase = ((phase % 1) + 1) % 1;
  DAYLIGHT.phase = phase;

  // Sun elevation factor: a sine hump over the daylight window, dipping
  // negative (below the horizon) through the night window.
  const day = phase < NIGHT_START;
  const u = day ? phase / NIGHT_START : 0;
  const e = day
    ? Math.sin(u * Math.PI)
    : -Math.sin(((phase - NIGHT_START) / (1 - NIGHT_START)) * Math.PI);

  const dayness = Math.max(0, e);
  const nightness = smoothstep(0, 0.2, -e);
  const golden = (1 - smoothstep(0.12, 0.5, Math.abs(e))) * (1 - nightness);
  DAYLIGHT.dayness = dayness;
  DAYLIGHT.nightness = nightness;
  DAYLIGHT.golden = golden;
  // Windows warm up through dusk and burn through the night.
  DAYLIGHT.glowT = Math.min(1, golden * 0.45 + nightness);

  // --- Sun / moon direction -------------------------------------------------
  // The mood's sunPosition anchors the azimuth; the sun sweeps ~105° around it
  // across the day. The moon hangs high near where the sun set, and the
  // direction crossfades through dusk while the light is dim (no shadow pop).
  const base = theme.sunPosition;
  const az0 = Math.atan2(base[2], base[0]);
  const az = az0 + (0.5 - u) * 1.85;
  const elev = 0.18 + dayness * 0.62; // radians: horizon-hugging .. ~46°
  sunVec.set(
    Math.cos(elev) * Math.cos(az),
    Math.sin(elev),
    Math.cos(elev) * Math.sin(az),
  );
  moonVec.set(
    Math.cos(0.78) * Math.cos(az0 - 1.15),
    Math.sin(0.78),
    Math.cos(0.78) * Math.sin(az0 - 1.15),
  );
  const moonMix = smoothstep(0.35, 0.8, nightness);
  DAYLIGHT.sunDir.copy(sunVec).lerp(moonVec, moonMix).normalize();

  // --- Light colors & intensities -------------------------------------------
  DAYLIGHT.sunColor
    .set(theme.sun)
    .lerp(GOLD, golden * 0.7)
    .lerp(MOON, nightness);
  const dayI = theme.sunIntensity * (0.55 + 0.55 * dayness);
  DAYLIGHT.sunIntensity = dayI * (1 - nightness) + theme.sunIntensity * 0.2 * nightness;
  DAYLIGHT.fillIntensity = theme.sunIntensity * 0.35 * (1 - nightness * 0.6);

  DAYLIGHT.ambientColor.set(theme.ambient).lerp(NIGHT_AMBIENT, nightness * 0.85);
  // Night dims but never goes black — the palette's readability promise holds.
  DAYLIGHT.ambientIntensity = theme.ambientIntensity * (1 - nightness * 0.45);
  DAYLIGHT.groundColor.set(theme.groundTint).lerp(NIGHT_GROUND, nightness * 0.7);

  // --- Sky & fog: dusk warms, night cools and dims ---------------------------
  DAYLIGHT.skyColor
    .set(theme.sky)
    .lerp(DUSK_SKY, golden * 0.3)
    .lerp(NIGHT_SKY, nightness * 0.85);
  DAYLIGHT.fogColor
    .set(theme.fog)
    .lerp(DUSK_SKY, golden * 0.25)
    .lerp(NIGHT_FOG, nightness * 0.8);
}

// ---------------------------------------------------------------------------
// Night-glow registry-by-userData: any material that should brighten after
// dusk declares `userData={{ glowDay, glowNight }}` and the rig lerps its
// emissiveIntensity between the two by DAYLIGHT.glowT on a throttled scene
// traversal. Materials opt in at creation; no registration bookkeeping, no
// leaks, and palette-change rebuilds are picked up on the next sweep.
// ---------------------------------------------------------------------------

function applyGlowToMaterial(mat: Material, glowT: number): void {
  const ud = mat.userData as { glowDay?: number; glowNight?: number };
  if (ud.glowDay === undefined || ud.glowNight === undefined) return;
  (mat as Material & { emissiveIntensity?: number }).emissiveIntensity =
    ud.glowDay + (ud.glowNight - ud.glowDay) * glowT;
}

/** Sweep the scene, applying the current glow lerp to opted-in materials. */
export function applyNightGlow(scene: Scene): void {
  const glowT = DAYLIGHT.glowT;
  scene.traverse((obj: Object3D) => {
    const mesh = obj as Mesh;
    if (!mesh.isMesh) return;
    const material = mesh.material;
    if (Array.isArray(material)) {
      for (const m of material) applyGlowToMaterial(m, glowT);
    } else if (material) {
      applyGlowToMaterial(material, glowT);
    }
  });
}
