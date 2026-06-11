import { Color } from 'three';
import type { CityMood } from '../types';

// ---------------------------------------------------------------------------
// Visual palette + mood mapping for the city renderer.
// All color/lighting/fog choices flow through here so the whole scene shifts
// cohesively as the simulation's mood changes day to day.
//
// BRIGHTNESS PHILOSOPHY (post-overhaul): every mood is a *luminous, colorful*
// time of day — moods change HUE and CHARACTER, never readability. There are
// no near-black themes anymore. Ambient floors are generous (>= 0.85) and the
// gloomier moods (arcane, declining, gritty, chaotic, polluted) are restyled
// as stylized bright twilights / overcasts where you can still clearly read
// every building's color. `windowGlow` rises in the darker/duskier moods so
// skylines glitter at dusk without the world going dim.
// ---------------------------------------------------------------------------

export interface MoodTheme {
  /** Sky / canvas background. */
  sky: string;
  /** Fog color (usually a touch lighter/hazier than the sky). */
  fog: string;
  /** Linear fog near / far distances. Lower far = thicker haze. */
  fogNear: number;
  fogFar: number;
  /** Hemisphere/ambient fill light. */
  ambient: string;
  ambientIntensity: number;
  /** Key directional ("sun") light. */
  sun: string;
  sunIntensity: number;
  /** Direction the sun comes from (world units, will be normalized in scene). */
  sunPosition: [number, number, number];
  /** Ground tint multiplied into each district's base color and the plane. */
  groundTint: string;
  /** How strongly the mood desaturates the world (0 = none, 1 = gray). */
  desaturate: number;
  /** Overall warmth/coolness multiplier applied to district colors. */
  colorShift: string;
  /**
   * Base emissive intensity for lit windows / lamps. Higher in dusky / moody
   * themes so a darker-feeling skyline still glitters (added field; older code
   * that ignores it is unaffected).
   */
  windowGlow: number;
  /** A warm-or-cool tint for the horizon hills, for depth (added field). */
  horizon: string;
}

// Each of the 8 moods gets a distinct, bright, colorful atmosphere. The
// gloomier moods are stylized twilights/overcasts, not darkness — ambient
// floors are kept high so building colors always read.
export const MOOD_THEMES: Record<CityMood, MoodTheme> = {
  thriving: {
    sky: '#ffe2ad',
    fog: '#fbeccb',
    fogNear: 150,
    fogFar: 620,
    ambient: '#fff4dc',
    ambientIntensity: 1.15,
    sun: '#ffe7b4',
    sunIntensity: 1.7,
    sunPosition: [60, 78, 34],
    groundTint: '#fff6e2',
    desaturate: 0,
    colorShift: '#fff6e4',
    windowGlow: 0.5,
    horizon: '#cfe6a8',
  },
  serene: {
    sky: '#cfeaf7',
    fog: '#e6f4fb',
    fogNear: 160,
    fogFar: 660,
    ambient: '#f1f9ff',
    ambientIntensity: 1.2,
    sun: '#fff7ee',
    sunIntensity: 1.45,
    sunPosition: [44, 82, 44],
    groundTint: '#f4faf0',
    desaturate: 0,
    colorShift: '#ffffff',
    windowGlow: 0.45,
    horizon: '#bfe0c4',
  },
  festive: {
    sky: '#ffc890',
    fog: '#ffd9ad',
    fogNear: 140,
    fogFar: 560,
    ambient: '#ffe7cb',
    ambientIntensity: 1.1,
    sun: '#ffc27e',
    sunIntensity: 1.85,
    sunPosition: [72, 46, 30],
    groundTint: '#ffeed3',
    desaturate: 0,
    colorShift: '#ffe1bd',
    windowGlow: 0.75,
    horizon: '#f3c89a',
  },
  gritty: {
    // A bright, blustery overcast — silvery, cool, but fully readable.
    sky: '#b8c6d2',
    fog: '#c8d4de',
    fogNear: 140,
    fogFar: 560,
    ambient: '#dde6ee',
    ambientIntensity: 1.1,
    sun: '#e4ebf2',
    sunIntensity: 1.25,
    sunPosition: [34, 64, 38],
    groundTint: '#cdd4cf',
    desaturate: 0.22,
    colorShift: '#e4ebf0',
    windowGlow: 0.6,
    horizon: '#b3c1c0',
  },
  declining: {
    // A wistful, hazy golden-grey dusk — muted but warm and clearly lit.
    sky: '#cdbfb0',
    fog: '#d8ccbe',
    fogNear: 140,
    fogFar: 540,
    ambient: '#e4dac9',
    ambientIntensity: 1.05,
    sun: '#e7d4b4',
    sunIntensity: 1.2,
    sunPosition: [30, 56, 32],
    groundTint: '#c9bda9',
    desaturate: 0.28,
    colorShift: '#e6dcc8',
    windowGlow: 0.75,
    horizon: '#c2b297',
  },
  chaotic: {
    // A dramatic warm sunset — fiery sky, but the streets stay bright & vivid.
    sky: '#ff9d6b',
    fog: '#ffb488',
    fogNear: 150,
    fogFar: 560,
    ambient: '#ffd2ad',
    ambientIntensity: 1.05,
    sun: '#ff9a5c',
    sunIntensity: 1.75,
    sunPosition: [26, 44, -28],
    groundTint: '#f0c19a',
    desaturate: 0.05,
    colorShift: '#ffcca0',
    windowGlow: 0.8,
    horizon: '#e8956a',
  },
  arcane: {
    // A luminous magical twilight — violet/teal, NOT near-black. Building
    // colors read clearly; the magic comes from glow, not from darkness.
    sky: '#9a8fd6',
    fog: '#b1a6e4',
    fogNear: 150,
    fogFar: 600,
    ambient: '#d9d0ff',
    ambientIntensity: 1.2,
    sun: '#e7dcff',
    sunIntensity: 1.4,
    sunPosition: [-34, 70, 38],
    groundTint: '#b7add8',
    desaturate: 0,
    colorShift: '#ded3ff',
    windowGlow: 0.95,
    horizon: '#a99fe0',
  },
  polluted: {
    // A hazy sulphur-amber smog day — characterful but bright enough to read.
    sky: '#d9c98a',
    fog: '#cfc081',
    fogNear: 130,
    fogFar: 480,
    ambient: '#e4d8a6',
    ambientIntensity: 1.05,
    sun: '#e4d489',
    sunIntensity: 1.3,
    sunPosition: [34, 52, 28],
    groundTint: '#c6c08a',
    desaturate: 0.2,
    colorShift: '#e2da9f',
    windowGlow: 0.7,
    horizon: '#c3bd84',
  },
};

// Reusable scratch colors so we don't allocate while deriving palettes.
const scratchA = new Color();
const scratchB = new Color();
const scratchHSL = { h: 0, s: 0, l: 0 };
const GRAY = new Color('#8c8c8c');

/**
 * Lower district mood (0..100) darkens + desaturates the platform a touch,
 * independent of the global city mood. Returns a hex string.
 */
export function districtMoodTintHex(
  baseHex: string,
  theme: MoodTheme,
  districtMood: number,
): string {
  scratchA.set(baseHex);
  // Global mood shift first.
  if (theme.desaturate > 0) scratchA.lerp(GRAY, theme.desaturate);
  scratchB.set(theme.colorShift);
  scratchA.multiply(scratchB);
  // Then local mood: 50 = neutral, low mood dims & desaturates — but gently,
  // we never let a district drop into mud.
  const m = Math.max(0, Math.min(100, districtMood)) / 100;
  if (m < 0.5) {
    const grim = (0.5 - m) * 2; // 0..1
    scratchA.lerp(GRAY, grim * 0.32);
    scratchA.multiplyScalar(1 - grim * 0.18);
  } else {
    // High mood: gently brighten.
    scratchA.multiplyScalar(1 + (m - 0.5) * 0.16);
  }
  return '#' + scratchA.getHexString();
}

/** Multiply a hex color by a scalar brightness (clamped). For roofs/accents. */
export function scaleHex(hex: string, factor: number): string {
  scratchA.set(hex).multiplyScalar(factor);
  return '#' + scratchA.getHexString();
}

/** Blend two hex colors by t (0..1). */
export function mixHex(a: string, b: string, t: number): string {
  scratchA.set(a).lerp(scratchB.set(b), Math.max(0, Math.min(1, t)));
  return '#' + scratchA.getHexString();
}

/**
 * Nudge a hex color in HSL space by signed deltas (h in turns, s/l in 0..1).
 * Used for *per-building variation*: small hash-driven shifts so buildings in a
 * district read cohesive but alive instead of monochrome. Clamps s/l to a
 * pleasant band so nothing goes pure-gray or blown-out.
 */
export function shiftHSL(hex: string, dh: number, ds: number, dl: number): string {
  scratchA.set(hex);
  scratchA.getHSL(scratchHSL);
  let h = (scratchHSL.h + dh) % 1;
  if (h < 0) h += 1;
  const s = Math.max(0.05, Math.min(0.95, scratchHSL.s + ds));
  const l = Math.max(0.18, Math.min(0.9, scratchHSL.l + dl));
  scratchA.setHSL(h, s, l);
  return '#' + scratchA.getHexString();
}
