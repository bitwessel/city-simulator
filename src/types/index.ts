// ---------------------------------------------------------------------------
// Mythic Mayor — core domain model.
// The simulation, generator, events, rendering and UI all share these types.
// Everything here is plain data: serializable, deterministic, UI-free.
// ---------------------------------------------------------------------------

// ----- Stats ---------------------------------------------------------------

/** Stats bounded to the 0..100 range. */
export type BoundedStatKey =
  | 'happiness'
  | 'wealth'
  | 'chaos'
  | 'beauty'
  | 'pollution'
  | 'safety'
  | 'magic'
  | 'infrastructure'
  | 'food'
  | 'housing'
  | 'trust'
  | 'culture';

export const BOUNDED_STAT_KEYS: BoundedStatKey[] = [
  'happiness',
  'wealth',
  'chaos',
  'beauty',
  'pollution',
  'safety',
  'magic',
  'infrastructure',
  'food',
  'housing',
  'trust',
  'culture',
];

export type StatKey = BoundedStatKey | 'population';

export interface CityStats extends Record<BoundedStatKey, number> {
  /** Absolute head count (well, heads of various shapes). Never below 0. */
  population: number;
}

/** A sparse set of stat changes. Population deltas are absolute people. */
export type StatDelta = Partial<Record<StatKey, number>>;

// ----- Seed ----------------------------------------------------------------

export interface WorldSeed {
  /** The seed text as typed (or randomly generated). */
  raw: string;
  /** Numeric hash derived from `raw`; drives all RNG. */
  value: number;
}

// ----- Districts & buildings ------------------------------------------------

export type DistrictType =
  | 'old-town'
  | 'market'
  | 'harbor'
  | 'forest-edge'
  | 'academy'
  | 'industrial'
  | 'noble-hill'
  | 'workers'
  | 'garden'
  | 'ruins'
  | 'festival'
  | 'magical';

export type BuildingKind =
  | 'house'
  | 'tower'
  | 'market-stall'
  | 'workshop'
  | 'temple'
  | 'tavern'
  | 'warehouse'
  | 'mansion'
  | 'library'
  | 'wizard-tower'
  | 'statue'
  | 'mill'
  | 'dock'
  | 'greenhouse'
  | 'ruin'
  | 'fountain'
  | 'tent';

export interface Building {
  id: string;
  kind: BuildingKind;
  /** World position (y is derived by the renderer). */
  position: { x: number; z: number };
  /** Rotation around Y in radians. */
  rotation: number;
  /** Uniform footprint/height multiplier, roughly 0.6..1.8. */
  scale: number;
  /**
   * District development level (0..1) at which this building is built.
   * 0 = part of the founding settlement. The renderer shows a building once
   * its district's development/100 reaches this threshold.
   */
  appearAt: number;
}

export type RiskKind =
  | 'fire'
  | 'flood'
  | 'crime'
  | 'unrest'
  | 'plague'
  | 'magical-surge'
  | 'economic-bust'
  | 'monster';

export interface Risk {
  kind: RiskKind;
  /** 0..100. Above ~60 the engine may roll disasters. */
  level: number;
  description: string;
}

export interface District {
  id: string;
  name: string;
  type: DistrictType;
  /** Center in world coordinates (the map is roughly -50..50 on each axis). */
  position: { x: number; z: number };
  /** Footprint radius in world units. */
  radius: number;
  population: number;
  /** 0..100 */
  wealth: number;
  /** 0..100 */
  mood: number;
  /**
   * 0..100 — how built-up the district is. Starts low (a young settlement)
   * and grows with livability; buildings appear as it climbs.
   */
  development: number;
  /** Sparse per-district risk levels, 0..100. */
  risks: Partial<Record<RiskKind, number>>;
  buildings: Building[];
  dominantFactionId: string | null;
  /** Base color hint for the renderer (hex like '#7a9e6b'). */
  visualStyle: { baseColor: string; accentColor: string };
  /** Short flavor lines local to this district. */
  quirks: string[];
}

export interface Road {
  from: string; // district id
  to: string; // district id
}

// ----- Citizens & factions ---------------------------------------------------

export interface CitizenGroup {
  id: string;
  /** e.g. 'fisherfolk', 'apprentice mages', 'retired adventurers' */
  archetype: string;
  count: number;
  /** 0..100 */
  happiness: number;
  districtId: string;
}

export type FactionArchetype =
  | 'merchants'
  | 'gardeners'
  | 'engineers'
  | 'mages'
  | 'workers'
  | 'nobles'
  | 'goblin-union'
  | 'street-performers'
  | 'archivists'
  | 'fishermen'
  | 'inventors'
  | 'night-watch';

export interface Faction {
  id: string;
  archetype: FactionArchetype;
  name: string;
  agenda: string;
  /** Short funny descriptor for panels. */
  flavor: string;
  /** 0..100 — how much weight their opinion carries. */
  influence: number;
  /** 0..100 — below ~25 they start causing trouble. */
  satisfaction: number;
  /** factionId -> -100..100 */
  relationships: Record<string, number>;
  /** Stats they want high; raising these pleases them. */
  preferredStats: BoundedStatKey[];
  /** Stats they want low; raising these angers them. */
  hatedStats: BoundedStatKey[];
  homeDistrictId: string | null;
}

// ----- Quirks & resources -----------------------------------------------------

export interface CityQuirk {
  id: string;
  title: string;
  description: string;
  /** Small per-day stat drift while this quirk is active. */
  dailyEffects?: StatDelta;
  /** Multiplies the weight of events carrying these tags (e.g. { goblin: 2 }). */
  eventTagBias?: Record<string, number>;
}

export interface Resource {
  id: string;
  name: string;
  /** Arbitrary units; flavor + headline fodder. */
  amount: number;
  /** Per-day drift. */
  trend: number;
}

// ----- Events -------------------------------------------------------------------

/**
 * Data-driven precondition. All present clauses must hold.
 * Stat clauses compare against city stats (population uses absolute count).
 */
export interface EventCondition {
  minStats?: StatDelta;
  maxStats?: StatDelta;
  /** Requires this quirk to be present in the city. */
  requiresQuirkId?: string;
  /** Requires a faction of this archetype with satisfaction <= value. */
  factionUnhappy?: { archetype: FactionArchetype; below: number };
}

/** A chance-based follow-up rolled after a choice is made. */
export interface ChanceOutcome {
  /** 0..1 probability. */
  chance: number;
  /** Headline text shown if it fires (tokens allowed). */
  description: string;
  effects?: StatDelta;
  /** Satisfaction deltas keyed by faction archetype. */
  factionEffects?: Partial<Record<FactionArchetype, number>>;
  /** Schedule a chain event to fire after `delayDays`. */
  queueEventId?: string;
  /** Inclusive range; defaults to [2, 4]. */
  delayDays?: [number, number];
}

export interface EventChoice {
  id: string;
  /** Short button label, e.g. 'Fund goblin-friendly benches'. */
  label: string;
  /** Optional second line of flavor under the label. */
  description?: string;
  effects: StatDelta;
  /** Satisfaction deltas keyed by faction archetype. */
  factionEffects?: Partial<Record<FactionArchetype, number>>;
  /** Mood/wealth nudges to the involved district (if any). */
  districtEffects?: { mood?: number; wealth?: number; population?: number };
  /** Rolled after applying effects. */
  outcomes?: ChanceOutcome[];
  /** Immediately queue a chain event (fires in a few days). */
  unlocksEventId?: string;
  /** One-line aftermath shown in the news feed (tokens allowed). */
  resultText: string;
}

/**
 * An event definition. Text fields may contain tokens which the engine
 * resolves when the event triggers:
 *   {city}     — city name
 *   {district} — involved district name
 *   {faction}  — involved faction name
 */
export interface GameEventDef {
  id: string;
  title: string;
  description: string;
  /** Free-form tags; quirks can bias these (e.g. 'goblin', 'magic', 'economy'). */
  tags: string[];
  /** Base selection weight; 10 is typical. */
  weight: number;
  /** If set, the city must contain a faction of this archetype. */
  involvedFaction?: FactionArchetype;
  /** If set, the city must contain a district of this type. */
  involvedDistrictType?: DistrictType;
  condition?: EventCondition;
  /** Earliest day this can fire randomly. */
  minDay?: number;
  /** Fire at most once per run. */
  once?: boolean;
  /** Never picked randomly — only via queueEventId/unlocksEventId chains. */
  chainOnly?: boolean;
  /** 2..4 choices. */
  choices: EventChoice[];
}

/** A triggered event instance with tokens resolved, awaiting a player choice. */
export interface ActiveEvent {
  defId: string;
  day: number;
  title: string;
  description: string;
  districtId: string | null;
  factionId: string | null;
  choices: EventChoice[];
}

// ----- News & headlines ------------------------------------------------------------

export type NewsTone = 'good' | 'bad' | 'weird' | 'neutral';

export interface NewsItem {
  day: number;
  text: string;
  tone: NewsTone;
}

/** Minor flavor headline template; tokens {city}/{district}/{faction} allowed. */
export interface HeadlineTemplate {
  text: string;
  tone: NewsTone;
  weight: number;
  condition?: EventCondition;
}

// ----- Outcomes ----------------------------------------------------------------------

export type OutcomeKind =
  | 'utopia'
  | 'golden-age'
  | 'collapse'
  | 'ghost-town'
  | 'magical-singularity'
  | 'pollution-wasteland'
  | 'revolution'
  | 'wild-reclamation';

export interface CityOutcome {
  kind: OutcomeKind;
  title: string;
  description: string;
  tone: 'triumphant' | 'bittersweet' | 'catastrophic' | 'weird';
  day: number;
}

// ----- Visual mood --------------------------------------------------------------------

/** Derived each tick from stats; drives lighting/palette in the renderer. */
export type CityMood =
  | 'thriving'
  | 'serene'
  | 'gritty'
  | 'chaotic'
  | 'arcane'
  | 'polluted'
  | 'festive'
  | 'declining';

// ----- City ------------------------------------------------------------------------------

export interface City {
  seed: WorldSeed;
  name: string;
  tagline: string;
  day: number;
  stats: CityStats;
  districts: District[];
  roads: Road[];
  factions: Faction[];
  citizenGroups: CitizenGroup[];
  quirks: CityQuirk[];
  resources: Resource[];
  risks: Risk[];
  /** The opening briefing handed to the new mayor. */
  briefing: string;
  /** Rolling news log, newest last. */
  news: NewsItem[];
  /** Stat snapshots for the timeline (sampled every day). */
  history: { day: number; stats: CityStats }[];
  /** Choices made so far. */
  eventLog: { day: number; defId: string; choiceId: string }[];
  /** Chain events scheduled to fire on a given day. */
  queuedEvents: { defId: string; day: number }[];
  /** Definitions already fired (enforces `once`). */
  firedEventIds: string[];
  daysSinceEvent: number;
  /** Consecutive qualifying days per outcome kind (endings need a streak). */
  outcomeStreaks: Record<string, number>;
  outcome: CityOutcome | null;
  mood: CityMood;
}

// ----- Engine results -----------------------------------------------------------------------

export interface SimulationTickResult {
  day: number;
  city: City;
  /** Headlines generated this tick (already appended to city.news). */
  headlines: NewsItem[];
  /** Event awaiting a player decision, if one triggered. */
  triggeredEvent: ActiveEvent | null;
  /** Non-null means the run ended this tick. */
  outcome: CityOutcome | null;
}
