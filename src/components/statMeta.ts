import type {
  BoundedStatKey,
  CityMood,
  DistrictType,
  FactionArchetype,
  NewsTone,
  OutcomeKind,
  RiskKind,
  StatKey,
} from '../types';

// ---------------------------------------------------------------------------
// Display metadata used across the UI: top bar, event-effect chips, district
// and faction panels, and the outcome chronicle. Pure presentation — no logic.
// ---------------------------------------------------------------------------

/** How a stat reads morally: higher is good, higher is bad, or it's just weird. */
export type StatPolarity = 'good' | 'bad' | 'weird';

export interface StatMeta {
  label: string;
  icon: string;
  polarity: StatPolarity;
  /** Accent color for meters/chips associated with this stat. */
  color: string;
}

/** Per-stat display metadata, keyed by bounded stat. */
export const STAT_META: Record<BoundedStatKey, StatMeta> = {
  happiness: { label: 'Happiness', icon: '😊', polarity: 'good', color: '#f2c14e' },
  wealth: { label: 'Wealth', icon: '💰', polarity: 'good', color: '#e0b341' },
  chaos: { label: 'Chaos', icon: '🌀', polarity: 'bad', color: '#d96c4f' },
  beauty: { label: 'Beauty', icon: '🌸', polarity: 'good', color: '#e58bb0' },
  pollution: { label: 'Pollution', icon: '🏭', polarity: 'bad', color: '#8a8f5a' },
  safety: { label: 'Safety', icon: '🛡️', polarity: 'good', color: '#6fa3c7' },
  magic: { label: 'Magic', icon: '✨', polarity: 'weird', color: '#b07fd6' },
  infrastructure: { label: 'Infrastructure', icon: '🏗️', polarity: 'good', color: '#b08a5e' },
  food: { label: 'Food', icon: '🍞', polarity: 'good', color: '#d6a35c' },
  housing: { label: 'Housing', icon: '🏠', polarity: 'good', color: '#c39b6a' },
  trust: { label: 'Trust', icon: '🤝', polarity: 'good', color: '#7fb389' },
  culture: { label: 'Culture', icon: '🎭', polarity: 'good', color: '#9d8ad6' },
};

/** Display order for the top-bar stat strip (population handled separately). */
export const STAT_DISPLAY_ORDER: BoundedStatKey[] = [
  'happiness',
  'wealth',
  'trust',
  'safety',
  'food',
  'housing',
  'infrastructure',
  'culture',
  'beauty',
  'magic',
  'chaos',
  'pollution',
];

export const POPULATION_META = {
  label: 'Population',
  icon: '🧑‍🤝‍🧑',
} as const;

/** Convenience: meta for any stat key, including population. */
export function metaForStat(
  key: StatKey,
): { label: string; icon: string; polarity?: StatPolarity; color?: string } {
  if (key === 'population') return { label: POPULATION_META.label, icon: POPULATION_META.icon };
  return STAT_META[key];
}

/**
 * Whether a raw stat delta should read as "good news" for the player.
 * For population, more is good. For bounded stats it depends on polarity
 * (weird stats are treated as neutral-leaning-good for chip coloring).
 */
export function deltaIsPositive(key: StatKey, delta: number): boolean {
  if (delta === 0) return false;
  if (key === 'population') return delta > 0;
  const polarity = STAT_META[key].polarity;
  if (polarity === 'bad') return delta < 0;
  return delta > 0; // good + weird
}

// ----- News tone styling ----------------------------------------------------

export const NEWS_TONE_COLOR: Record<NewsTone, string> = {
  good: '#7fb389',
  bad: '#d97a6c',
  weird: '#b07fd6',
  neutral: '#cdbf9f',
};

// ----- City mood ------------------------------------------------------------

export interface MoodMeta {
  label: string;
  icon: string;
  color: string;
}

// Colors chosen to read as a word chip over the light frosted panels (used as
// text on a faint tint), so they lean a touch deeper than the renderer hues.
export const MOOD_META: Record<CityMood, MoodMeta> = {
  thriving: { label: 'Thriving', icon: '🌟', color: '#b9821f' },
  serene: { label: 'Serene', icon: '🕊️', color: '#3f86a3' },
  gritty: { label: 'Gritty', icon: '⚒️', color: '#8a6238' },
  chaotic: { label: 'Chaotic', icon: '🌀', color: '#c45236' },
  arcane: { label: 'Arcane', icon: '🔮', color: '#8a52c0' },
  polluted: { label: 'Polluted', icon: '🌫️', color: '#73773f' },
  festive: { label: 'Festive', icon: '🎉', color: '#c25b87' },
  declining: { label: 'Declining', icon: '🥀', color: '#8a5f4a' },
};

// ----- District types -------------------------------------------------------

export const DISTRICT_TYPE_META: Record<DistrictType, { label: string; icon: string }> = {
  'old-town': { label: 'Old Town', icon: '🏛️' },
  market: { label: 'Market', icon: '🛒' },
  harbor: { label: 'Harbor', icon: '⚓' },
  'forest-edge': { label: "Forest's Edge", icon: '🌲' },
  academy: { label: 'Academy', icon: '📚' },
  industrial: { label: 'Industrial', icon: '🏭' },
  'noble-hill': { label: 'Noble Hill', icon: '👑' },
  workers: { label: 'Workers Quarter', icon: '🔨' },
  garden: { label: 'Gardens', icon: '🌷' },
  ruins: { label: 'Ruins', icon: '🏚️' },
  festival: { label: 'Festival Grounds', icon: '🎪' },
  magical: { label: 'Magical Quarter', icon: '🪄' },
};

export function districtTypeLabel(type: DistrictType): string {
  return DISTRICT_TYPE_META[type]?.label ?? type;
}

// ----- Faction archetypes ---------------------------------------------------

export const FACTION_META: Record<FactionArchetype, { label: string; icon: string }> = {
  merchants: { label: 'Merchants', icon: '⚖️' },
  gardeners: { label: 'Gardeners', icon: '🌿' },
  engineers: { label: 'Engineers', icon: '⚙️' },
  mages: { label: 'Mages', icon: '🪄' },
  workers: { label: 'Workers', icon: '🔧' },
  nobles: { label: 'Nobles', icon: '👑' },
  'goblin-union': { label: 'Goblin Union', icon: '👺' },
  'street-performers': { label: 'Street Performers', icon: '🎻' },
  archivists: { label: 'Archivists', icon: '📜' },
  fishermen: { label: 'Fisherfolk', icon: '🎣' },
  inventors: { label: 'Inventors', icon: '🧪' },
  'night-watch': { label: 'Night Watch', icon: '🏮' },
};

export function factionArchetypeLabel(archetype: FactionArchetype): string {
  return FACTION_META[archetype]?.label ?? archetype;
}

// ----- Risks ----------------------------------------------------------------

export const RISK_META: Record<RiskKind, { label: string; icon: string }> = {
  fire: { label: 'Fire', icon: '🔥' },
  flood: { label: 'Flood', icon: '🌊' },
  crime: { label: 'Crime', icon: '🗡️' },
  unrest: { label: 'Unrest', icon: '✊' },
  plague: { label: 'Plague', icon: '🤧' },
  'magical-surge': { label: 'Magical Surge', icon: '⚡' },
  'economic-bust': { label: 'Economic Bust', icon: '📉' },
  monster: { label: 'Monster', icon: '🐉' },
};

export function riskLabel(kind: RiskKind): string {
  return RISK_META[kind]?.label ?? kind;
}

// ----- Outcomes -------------------------------------------------------------

export type OutcomeTone = 'triumphant' | 'bittersweet' | 'catastrophic' | 'weird';

// Used as title/kicker text and panel borders over light parchment, so these
// run a little deeper than the pure renderer accents to stay legible.
export const OUTCOME_TONE_COLOR: Record<OutcomeTone, string> = {
  triumphant: '#b9821f',
  bittersweet: '#9159b8',
  catastrophic: '#c0503a',
  weird: '#2f9d86',
};

export const OUTCOME_KIND_ICON: Record<OutcomeKind, string> = {
  utopia: '🌟',
  'golden-age': '🏆',
  collapse: '💥',
  'ghost-town': '👻',
  'magical-singularity': '🔮',
  'pollution-wasteland': '☠️',
  revolution: '⚔️',
  'wild-reclamation': '🌿',
};
