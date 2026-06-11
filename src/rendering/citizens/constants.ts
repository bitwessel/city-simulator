// ---------------------------------------------------------------------------
// Shared constants for the citizen layer.
//
// These tune the look + performance envelope of the crowd. They live in one
// place so the spec builder, the frame loop and the cart layer all agree.
// Ground heights come from the terrain (`terrainHeightAt` / road deck) — the
// platform-era height constants are gone.
// ---------------------------------------------------------------------------

import type { CityMood, DistrictType } from '../../types';

/** Cone body height of a townsperson (kept from the original look). */
export const BODY_HEIGHT = 0.5;

// ----- Instance budgets ----------------------------------------------------
// Everything is instanced and capped so a heavily developed late-game city
// stays smooth. The townsfolk cap is the headline number the brief asked for.

/** Hard cap on townsfolk instances (bodies == heads). */
export const MAX_CITIZENS = 300;
/** Soft target the spec builder aims for before the hard cap clamps. */
export const TARGET_CITIZENS = 270;
/** Max carts trundling the road ribbons. */
export const MAX_CARTS = 14;
/** Max concurrent held props (crates/sacks + fishing rods + staffs). */
export const MAX_PROPS = 110;
/** Max concurrent floating emotes. */
export const MAX_EMOTES = 12;

// ----- Wardrobe ------------------------------------------------------------
// Expanded clothing palette + skin tones. Picked deterministically by id so a
// citizen keeps the same coat across re-renders and day ticks.

export const CLOTHES = [
  '#c96f4a', // terracotta
  '#7fa75c', // moss
  '#5c84a7', // slate blue
  '#b08bc9', // lilac
  '#c9a24b', // ochre
  '#a75c5c', // brick
  '#5ca78f', // teal
  '#8a795c', // taupe
  '#c9c0a3', // linen
  '#6b5ca7', // indigo
  '#d98c6a', // salmon
  '#9ab06a', // olive
  '#4f7d9e', // deep cyan
  '#c76b94', // rose
  '#d4b24c', // gold
  '#7a6f99', // dusk
  '#b5503f', // rust
  '#6fa39b', // sage
];

export const SKIN = ['#e8c39e', '#d9a878', '#b07b4f', '#8a5a33', '#c9d9a3', '#e0b48c'];

/** Robe colors for mages / wizards (jewel tones). */
export const ROBE_COLORS = ['#5b3a99', '#324a99', '#7a2f8a', '#2f6a8a', '#3a2f7a'];
/** Scholar gown colors (sober). */
export const SCHOLAR_COLORS = ['#3a3f4a', '#4a3f3a', '#2f3a3f', '#46414b'];
/** Night-watch livery (dark + a hint of badge). */
export const WATCH_COLOR = '#2c3550';
/** Kid clothing (bright candy colors). */
export const KID_COLORS = ['#e36a8a', '#5cb4e3', '#e3c14a', '#6ad98f', '#e38a4a', '#b06ae3'];

// ----- Activities ----------------------------------------------------------

export type Activity =
  | 'errands' //   building -> building, brief pause at the door
  | 'market' //    short hops stall-to-stall
  | 'social' //    converge, face each other, talk-bob, disperse
  | 'work' //      loop two points hauling a crate/sack
  | 'fishing' //   stand at platform edge, rod, occasional flick
  | 'lounge' //    sit-ish near fountain/statue/garden, no walk bob
  | 'patrol' //    night-watch pair, slow circuit
  | 'kid' //       small fast agent running loops / chasing
  | 'dance' //     festive: orbit + bounce + spin around a landmark
  | 'protest'; //  chaotic: tight cluster, fist-pump, agitated jitter

/** Hat / accessory variety. */
export type Hat = 'none' | 'wizard' | 'scholar' | 'watch' | 'sunhat';

/** Held prop kinds (only the carrying ones render a prop instance). */
export type PropKind = 'none' | 'crate' | 'sack' | 'rod' | 'staff';

// ----- Emotes --------------------------------------------------------------
// Sprite-sheet cell order. Used both by the texture builder and the picker.

export const EMOTE_HEART = 0; // chat / social
export const EMOTE_NOTE = 1; //  music / dance
export const EMOTE_BANG = 2; //  protest / alarm
export const EMOTE_ZZZ = 3; //   lounging
export const EMOTE_QUESTION = 4; // lost
export const EMOTE_COUNT = 5;

// ----- District helpers ----------------------------------------------------

/** District types where hauling work reads well (carts of crates, sacks). */
export const WORK_DISTRICTS: ReadonlySet<DistrictType> = new Set([
  'industrial',
  'harbor',
  'workers',
]);

/** District types that get market browsing. */
export const MARKET_DISTRICTS: ReadonlySet<DistrictType> = new Set(['market', 'festival']);

/** District types that lean magical (wizard hats + staffs more common). */
export const MAGICAL_DISTRICTS: ReadonlySet<DistrictType> = new Set(['magical', 'academy']);

/** Moods that put more people on the street. */
export function moodCrowdMultiplier(mood: CityMood): number {
  switch (mood) {
    case 'festive':
      return 1.35;
    case 'thriving':
      return 1.15;
    case 'serene':
      return 1.0;
    case 'arcane':
      return 1.0;
    case 'gritty':
      return 0.82;
    case 'polluted':
      return 0.8;
    case 'chaotic':
      return 0.9; // still busy, but agitated
    case 'declining':
      return 0.62;
    default:
      return 1.0;
  }
}

/** Base walking-speed multiplier per mood (thriving bustles, declining drags). */
export function moodSpeedMultiplier(mood: CityMood): number {
  switch (mood) {
    case 'thriving':
      return 1.2;
    case 'festive':
      return 1.15;
    case 'chaotic':
      return 1.1;
    case 'gritty':
      return 0.85;
    case 'polluted':
      return 0.82;
    case 'declining':
      return 0.7;
    default:
      return 1.0;
  }
}
