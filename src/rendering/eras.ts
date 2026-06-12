import type { AgeId } from '../types';
import type { BuildingPalette } from './BuildingMesh';
import { mixHex } from './palette';

// ---------------------------------------------------------------------------
// Era skins (phase 04) — the same BuildingKind in different dress per age.
// Each age re-tints the building palette toward an era material story:
//   Settlement: raw wood walls + straw thatch roofs
//   Village:    warm timber frames + wooden shingles
//   Town:       dressed stone + terracotta tile
//   City:       warm brick + slate, ornament, brighter lanterns
//   Wonder:     cream marble + gilded rooftops, banners
// The roof (accent) blend is the loudest lever — strong mixes make the era
// unmistakable in a screenshot while a whisper of the district hue survives so
// districts stay tellable-apart. BuildingMesh adds per-era geometry on top
// (huts in the settlement, chimneys/pennants later).
// ---------------------------------------------------------------------------

export interface EraTheme {
  /** Wall blend target + strength (0..1). */
  wall: string;
  wallMix: number;
  /** Roof/accent blend target + strength — the era's signature material. */
  roof: string;
  roofMix: number;
  /** Trim blend target + strength. */
  trim: string;
  trimMix: number;
  /** Multiplier on the mood's window glow (lantern-lit avenues arrive late). */
  glowBoost: number;
}

export const ERA_THEMES: Record<AgeId, EraTheme> = {
  settlement: {
    wall: '#8d6f4c', // raw wood
    wallMix: 0.55,
    roof: '#c8a55a', // straw thatch
    roofMix: 0.78,
    trim: '#6e5638',
    trimMix: 0.55,
    glowBoost: 0.75,
  },
  village: {
    wall: '#c2a87e', // wattle & timber
    wallMix: 0.32,
    roof: '#996a3d', // wooden shingles
    roofMix: 0.55,
    trim: '#7c5e3c',
    trimMix: 0.35,
    glowBoost: 0.9,
  },
  town: {
    wall: '#b3a896', // dressed stone
    wallMix: 0.4,
    roof: '#b56548', // terracotta tile
    roofMix: 0.6,
    trim: '#8e857a',
    trimMix: 0.4,
    glowBoost: 1,
  },
  city: {
    wall: '#a8705a', // warm brick
    wallMix: 0.32,
    roof: '#5e6b80', // slate
    roofMix: 0.58,
    trim: '#d8cdb8', // pale ornament
    trimMix: 0.35,
    glowBoost: 1.35,
  },
  wonder: {
    wall: '#e6d9bf', // cream marble
    wallMix: 0.42,
    roof: '#d4a345', // gilded
    roofMix: 0.66,
    trim: '#c9b27a',
    trimMix: 0.4,
    glowBoost: 1.55,
  },
};

/**
 * Re-dress a district's building palette for the city's age. Cheap (a few hex
 * blends) and memoized by the caller alongside the mood palette.
 */
export function applyEraToPalette(base: BuildingPalette, era: AgeId): BuildingPalette {
  const t = ERA_THEMES[era];
  return {
    ...base,
    era,
    wall: mixHex(base.wall, t.wall, t.wallMix),
    accent: mixHex(base.accent, t.roof, t.roofMix),
    trim: mixHex(base.trim, t.trim, t.trimMix),
    glowI: base.glowI * t.glowBoost,
  };
}
