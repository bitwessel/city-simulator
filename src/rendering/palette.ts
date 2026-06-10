import { Color } from 'three';
import type { CityMood } from '../types';

// ---------------------------------------------------------------------------
// Visual palette + mood mapping for the city renderer.
// All color/lighting/fog choices flow through here so the whole scene shifts
// cohesively as the simulation's mood changes day to day.
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
}

// Each of the 8 moods gets a distinct, readable atmosphere.
export const MOOD_THEMES: Record<CityMood, MoodTheme> = {
  thriving: {
    sky: '#fcd9a0',
    fog: '#f6e3bd',
    fogNear: 120,
    fogFar: 420,
    ambient: '#fff2d6',
    ambientIntensity: 0.85,
    sun: '#ffe2a8',
    sunIntensity: 1.55,
    sunPosition: [50, 70, 30],
    groundTint: '#ffffff',
    desaturate: 0,
    colorShift: '#fff4dd',
  },
  serene: {
    sky: '#bfe0f2',
    fog: '#dff0f7',
    fogNear: 130,
    fogFar: 450,
    ambient: '#eef6ff',
    ambientIntensity: 0.95,
    sun: '#fff6ec',
    sunIntensity: 1.3,
    sunPosition: [40, 75, 40],
    groundTint: '#f2f7ee',
    desaturate: 0.05,
    colorShift: '#ffffff',
  },
  festive: {
    sky: '#ffb877',
    fog: '#ffcf9b',
    fogNear: 110,
    fogFar: 380,
    ambient: '#ffe0bf',
    ambientIntensity: 0.8,
    sun: '#ffb066',
    sunIntensity: 1.7,
    sunPosition: [70, 38, 28],
    groundTint: '#ffe9cf',
    desaturate: 0,
    colorShift: '#ffd9a8',
  },
  gritty: {
    sky: '#8a98a6',
    fog: '#9aa6b1',
    fogNear: 90,
    fogFar: 310,
    ambient: '#aeb8c2',
    ambientIntensity: 0.7,
    sun: '#c4ccd4',
    sunIntensity: 0.85,
    sunPosition: [30, 55, 35],
    groundTint: '#9fa9a0',
    desaturate: 0.45,
    colorShift: '#cdd4da',
  },
  declining: {
    sky: '#6f6e73',
    fog: '#79787d',
    fogNear: 80,
    fogFar: 290,
    ambient: '#8c8a90',
    ambientIntensity: 0.6,
    sun: '#9a9690',
    sunIntensity: 0.7,
    sunPosition: [25, 48, 30],
    groundTint: '#807e78',
    desaturate: 0.6,
    colorShift: '#b8b4ad',
  },
  chaotic: {
    sky: '#7d3324',
    fog: '#9c4226',
    fogNear: 75,
    fogFar: 280,
    ambient: '#c9603a',
    ambientIntensity: 0.7,
    sun: '#ff6b35',
    sunIntensity: 1.25,
    sunPosition: [20, 35, -25],
    groundTint: '#b56542',
    desaturate: 0.15,
    colorShift: '#ff8a5c',
  },
  arcane: {
    sky: '#352a6b',
    fog: '#473a85',
    fogNear: 85,
    fogFar: 300,
    ambient: '#8f7ad6',
    ambientIntensity: 0.75,
    sun: '#b69cff',
    sunIntensity: 1.0,
    sunPosition: [-30, 60, 35],
    groundTint: '#6c5ca8',
    desaturate: 0.1,
    colorShift: '#c9b8ff',
  },
  polluted: {
    sky: '#7a7a4a',
    fog: '#6d6e44',
    fogNear: 65,
    fogFar: 240,
    ambient: '#9a9a64',
    ambientIntensity: 0.6,
    sun: '#c9c47a',
    sunIntensity: 0.8,
    sunPosition: [30, 45, 25],
    groundTint: '#7f8253',
    desaturate: 0.4,
    colorShift: '#c4c08a',
  },
};

// Reusable scratch colors so we don't allocate while deriving palettes.
const scratchA = new Color();
const scratchB = new Color();
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
  // Then local mood: 50 = neutral, low mood dims & desaturates.
  const m = Math.max(0, Math.min(100, districtMood)) / 100;
  if (m < 0.5) {
    const grim = (0.5 - m) * 2; // 0..1
    scratchA.lerp(GRAY, grim * 0.45);
    scratchA.multiplyScalar(1 - grim * 0.3);
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
