import type {
  BoundedStatKey,
  Building,
  BuildingKind,
  City,
  CityQuirk,
  CityStats,
  CitizenGroup,
  District,
  Faction,
  Resource,
  Risk,
  RiskKind,
  Road,
  TerrainData,
  WorldSeed,
} from '../types';
import { BOUNDED_STAT_KEYS } from '../types';
import { Rng, hashSeed } from '../utils/rng';
import { clampStat, distance } from '../utils/math';
import {
  MAX_DISTRICT_RADIUS,
  addDistrictFlat,
  generateTerrain,
  isDistrictSiteOnLand,
  isDistrictSiteRiverside,
} from './terrain';
import {
  BRIEFING_OPENERS,
  BRIEFING_PROBLEMS,
  CITY_PREFIXES,
  CITY_SUFFIXES,
  CITY_TAGLINES,
  DISTRICT_ARCHETYPES,
  FACTION_FRIENDSHIPS,
  FACTION_RIVALRIES,
  FACTION_TEMPLATES,
  RESOURCE_POOL,
  type DistrictArchetype,
} from './data/names';
import { QUIRK_POOL } from './data/quirks';
import { deriveCityMood } from '../simulation/mood';

/** Generate a random human-friendly seed string (for the "surprise me" button). */
export function randomSeedString(): string {
  const rng = new Rng(Math.floor(Math.random() * 0xffffffff));
  return `${rng.pick(CITY_PREFIXES).toLowerCase()}-${rng.int(100, 9999)}`;
}

export function generateCity(seedRaw: string): City {
  const seed: WorldSeed = { raw: seedRaw, value: hashSeed(seedRaw) };
  const rng = new Rng(seed.value);

  const name = generateCityName(rng);
  const tagline = rng.pick(CITY_TAGLINES);

  // Terrain first: districts are placed onto it. Its own hashed sub-stream
  // keeps the main rng sequence independent of terrain tuning.
  const terrain = generateTerrain(seedRaw);
  const districts = generateDistricts(rng, terrain);
  const roads = generateRoads(rng, districts);
  const factions = generateFactions(rng, districts);
  assignDominantFactions(districts, factions);
  const citizenGroups = generateCitizenGroups(rng, districts);
  const quirks = rng.pickMany(QUIRK_POOL, rng.int(2, 4));
  const resources = generateResources(rng);
  const stats = generateStartingStats(rng, districts, citizenGroups);
  const risks = deriveStartingRisks(rng, stats, districts);
  const briefing = generateBriefing(rng, name, quirks, factions, risks);

  const city: City = {
    seed,
    name,
    tagline,
    day: 1,
    stats,
    districts,
    roads,
    factions,
    citizenGroups,
    quirks,
    resources,
    risks,
    briefing,
    news: [
      {
        day: 1,
        text: `You take office in ${name}. The welcome banner is only slightly misspelled.`,
        tone: 'good',
      },
    ],
    history: [],
    eventLog: [],
    queuedEvents: [],
    firedEventIds: [],
    daysSinceEvent: 0,
    outcomeStreaks: {},
    outcome: null,
    mood: 'serene',
    foundingPopulation: stats.population,
    lastDistrictFoundedDay: 0,
    terrain,
  };
  city.history.push({ day: 1, stats: { ...stats } });
  city.mood = deriveCityMood(city.stats);
  return city;
}

function generateCityName(rng: Rng): string {
  const prefix = rng.pick(CITY_PREFIXES);
  let suffix = rng.pick(CITY_SUFFIXES);
  // Avoid awkward doubled letters like "Saltt..." or "Mossshore".
  while (prefix[prefix.length - 1].toLowerCase() === suffix[0]) {
    suffix = rng.pick(CITY_SUFFIXES);
  }
  return prefix + suffix;
}

// ----- Districts -------------------------------------------------------------

function generateDistricts(rng: Rng, terrain: TerrainData): District[] {
  const count = rng.int(5, 8);
  // Old town is always present; the rest are drawn without replacement.
  const oldTown = DISTRICT_ARCHETYPES.find((d) => d.type === 'old-town')!;
  const others = rng.shuffle(
    DISTRICT_ARCHETYPES.filter((d) => d.type !== 'old-town'),
  ).slice(0, count - 1);
  const picked = [oldTown, ...others];

  // Radii are rolled before layout: river clearance depends on the footprint.
  const radii = picked.map(() => rng.range(9, 14));

  // Lay districts out around the center with minimum spacing, off the river
  // (harbors instead hug it) and away from steep patches.
  const positions = layoutPositions(rng, picked, radii, terrain);

  return picked.map((arch, i) => {
    const radius = radii[i];
    // Level the site so the cluster sits on a subtle plateau (flats are
    // appended in district order — deterministic for a given seed).
    addDistrictFlat(terrain, positions[i], radius);
    const wealth = rng.range(arch.wealthRange[0], arch.wealthRange[1]);
    const population = rng.int(300, 1400);
    // Cities start as young settlements and build up over the run. Old town
    // is the founding district, so it begins noticeably more established.
    const development =
      arch.type === 'old-town' ? rng.range(28, 40) : rng.range(8, 20);
    return makeDistrict(rng, arch, `district-${i}-${arch.type}`, positions[i], {
      radius,
      wealth: clampStat(wealth),
      population,
      development,
      name: rng.pick(arch.names),
    });
  });
}

/**
 * The minimum centre-to-centre spacing between district footprints. Exported
 * so the engine can place mid-run districts on the same grid the generator uses.
 */
export const DISTRICT_MIN_GAP = 24;

/**
 * Build a single district from an archetype at a given position. Shared by the
 * initial generator and the engine's mid-run city expansion so both produce
 * structurally identical districts (radius, building roster, risks...).
 */
export function makeDistrict(
  rng: Rng,
  arch: DistrictArchetype,
  id: string,
  position: { x: number; z: number },
  opts: {
    radius: number;
    wealth: number;
    population: number;
    development: number;
    name: string;
  },
): District {
  const mood = clampStat(rng.range(45, 70));
  const risks = startingDistrictRisks(rng, arch.type);
  // Buildings draw from a dedicated forked sub-stream keyed off the district id,
  // so the (now much denser) building layout doesn't perturb the RNG sequence
  // the rest of generation (stats, factions...) depends on. Still fully
  // deterministic: same seed ⇒ same fork seed ⇒ same buildings.
  const buildRng = rng.fork(`buildings:${id}`);
  return {
    id,
    name: opts.name,
    type: arch.type,
    position,
    radius: opts.radius,
    population: opts.population,
    wealth: clampStat(opts.wealth),
    mood,
    development: opts.development,
    risks,
    buildings: generateBuildings(buildRng, arch, position, opts.radius, id),
    dominantFactionId: null,
    visualStyle: { baseColor: arch.baseColor, accentColor: arch.accentColor },
    quirks: [],
  };
}

function layoutPositions(
  rng: Rng,
  picked: DistrictArchetype[],
  radii: number[],
  terrain: TerrainData,
): { x: number; z: number }[] {
  const positions: { x: number; z: number }[] = [
    firstDistrictPosition(terrain, radii[0]),
  ];
  for (let i = 1; i < picked.length; i++) {
    positions.push(
      nextDistrictPosition(rng, positions, i, {
        terrain,
        radius: radii[i],
        nearRiver: picked[i].type === 'harbor',
      }),
    );
  }
  return positions;
}

/**
 * The founding district (old town) prefers the map origin. The river is
 * generated to keep clear of it, but if the origin still fails the land check
 * (a steep patch, an unlucky meander) walk a deterministic golden-angle
 * spiral outward until a valid site appears. No rng: pure from the terrain.
 */
function firstDistrictPosition(
  terrain: TerrainData,
  radius: number,
): { x: number; z: number } {
  for (let k = 0; k < 80; k++) {
    const r = k * 3;
    const a = k * 2.39996; // golden angle
    const candidate = { x: Math.cos(a) * r, z: Math.sin(a) * r };
    if (isDistrictSiteOnLand(terrain, candidate, radius)) return candidate;
  }
  return { x: 0, z: 0 };
}

/** Optional terrain constraints for `nextDistrictPosition`. */
export interface SiteOptions {
  terrain?: TerrainData;
  /** Footprint radius of the district being placed (clearance margin). */
  radius?: number;
  /** Prefer a riverside site (harbors hug the water). */
  nearRiver?: boolean;
}

/**
 * Find the next district centre on the noisy outward spiral, keeping at least
 * `DISTRICT_MIN_GAP` from every existing position and (when terrain is given)
 * off the river channel and steep ground — harbors instead *seek* the bank.
 * Exported so the engine can place newly-founded districts adjacent to the
 * current layout deterministically. `ring` controls how far out the candidate
 * starts (use the current district count for natural outward growth).
 */
export function nextDistrictPosition(
  rng: Rng,
  existing: { x: number; z: number }[],
  ring: number,
  opts: SiteOptions = {},
): { x: number; z: number } {
  const { terrain, nearRiver = false } = opts;
  const radius = opts.radius ?? MAX_DISTRICT_RADIUS;
  let angle = rng.range(0, Math.PI * 2);
  let candidate = { x: 0, z: 0 };
  // Fallbacks, best first: a spacing-respecting land site (a harbor that found
  // no bank settles for dry land), then any spacing-respecting candidate.
  let landFallback: { x: number; z: number } | null = null;
  let spacedFallback: { x: number; z: number } | null = null;
  for (let attempt = 0; attempt < 70; attempt++) {
    angle += rng.range(1.4, 2.6);
    // Push progressively further out on later attempts so a clear, spacing-
    // respecting spot is found even for a crowded, well-expanded layout.
    const dist = 22 + ring * 6 + attempt * 1.2 + rng.range(-4, 8);
    candidate = {
      x: Math.cos(angle) * dist,
      z: Math.sin(angle) * dist * 0.8, // slightly squashed: looks better on screen
    };
    if (!existing.every((p) => distance(p, candidate) >= DISTRICT_MIN_GAP)) {
      continue;
    }
    if (!terrain) return candidate;
    if (!spacedFallback) spacedFallback = candidate;
    if (nearRiver) {
      if (isDistrictSiteRiverside(terrain, candidate, radius)) return candidate;
      if (!landFallback && isDistrictSiteOnLand(terrain, candidate, radius)) {
        landFallback = candidate;
      }
    } else if (isDistrictSiteOnLand(terrain, candidate, radius)) {
      return candidate;
    }
  }
  return landFallback ?? spacedFallback ?? candidate;
}

function startingDistrictRisks(
  rng: Rng,
  type: District['type'],
): Partial<Record<RiskKind, number>> {
  const base: Partial<Record<RiskKind, number>> = {};
  const bump = (kind: RiskKind, amount: number) => {
    base[kind] = clampStat((base[kind] ?? 0) + amount + rng.range(0, 10));
  };
  if (type === 'industrial') bump('fire', 25);
  if (type === 'harbor') bump('flood', 25);
  if (type === 'ruins') {
    bump('monster', 20);
    bump('crime', 15);
  }
  if (type === 'magical') bump('magical-surge', 30);
  if (type === 'workers') bump('unrest', 15);
  if (type === 'market') bump('crime', 15);
  if (type === 'festival') bump('fire', 10);
  if (rng.chance(0.4)) bump(rng.pick(['fire', 'crime', 'unrest'] as RiskKind[]), 8);
  return base;
}

/** Minimum centre-to-centre spacing between buildings in a district. */
const BUILDING_MIN_GAP = 2.65;

/** Per-kind floor ranges for the tall "skyscraper era" building kinds. */
const TALL_FLOOR_RANGE: Partial<Record<BuildingKind, [number, number]>> = {
  apartment: [3, 5],
  'grand-hall': [4, 9],
  'arcane-spire': [6, 14],
  skyscraper: [6, 16],
};

/** The minimum development at which a given tall kind is allowed to appear. */
function tallAppearFloor(kind: BuildingKind): number {
  if (kind === 'skyscraper') return 0.82;
  if (kind === 'arcane-spire') return 0.8;
  if (kind === 'grand-hall') return 0.74;
  return 0.7; // apartment (mid-rise)
}

/**
 * Rejection-sample a building position inside a disc of radius `maxR` around
 * `center` that is at least `BUILDING_MIN_GAP` from every already-placed
 * building. Returns null if no clear spot is found within `attempts` tries,
 * so callers can skip rather than overlap (avoids z-fighting piles).
 *
 * Exported so the mayor-projects system reuses the exact same terrain/collision
 * sampler when placing commissioned landmarks (it adds its own river/land
 * guard on top via the terrain helpers).
 */
export function sampleBuildingPosition(
  rng: Rng,
  center: { x: number; z: number },
  maxR: number,
  placed: Building[],
  attempts: number,
): { x: number; z: number } | null {
  for (let attempt = 0; attempt < attempts; attempt++) {
    const a = rng.range(0, Math.PI * 2);
    const r = Math.sqrt(rng.next()) * maxR;
    const candidate = { x: center.x + Math.cos(a) * r, z: center.z + Math.sin(a) * r };
    if (placed.every((b) => distance(b.position, candidate) >= BUILDING_MIN_GAP)) {
      return candidate;
    }
  }
  return null;
}

/**
 * Generate the district's *fully grown* building layout. Each building gets an
 * `appearAt` development threshold; the renderer only shows buildings the
 * district has "built" so far, so the city visibly grows over a run.
 *
 * The roster is dense (≈22-34, scaled by radius) with `appearAt` spread across
 * the full 0..1 range, so a late-game urban district looks genuinely built up.
 * Urban districts additionally plan a handful of tall buildings (apartments,
 * skyscrapers, grand halls, arcane spires) at high `appearAt` — the
 * "skyscraper era" that only arrives once a district is heavily developed.
 * Exported so the engine can pre-plan rosters for mid-run founded districts.
 */
export function generateBuildings(
  rng: Rng,
  arch: DistrictArchetype,
  center: { x: number; z: number },
  radius: number,
  /**
   * Prefix for building ids; defaults to the district type. Pass the district
   * id when districts of the same type can coexist (mid-run founded duplicates)
   * so building ids stay globally unique for the renderer.
   */
  idPrefix: string = arch.type,
): Building[] {
  const buildings: Building[] = [];

  // ----- Skyscraper era: plan tall buildings FIRST so they claim prime,
  // central spots before the low-rise sprawl packs the district full. Their
  // (high) appearAt is assigned here; the distance-based ramp below skips them.
  if (arch.urban && arch.tallKinds && arch.tallKinds.length > 0) {
    planTallBuildings(rng, arch, center, radius, buildings, idPrefix);
  }
  const tallCount = buildings.length;

  // ----- Low-rise roster, dense and scaled by footprint (a small district
  // gets ~22, a big one ~34). Skip any building that can't find a clear spot
  // rather than piling it on (which would give the renderer z-fighting heaps).
  const radiusT = clampStat(((radius - 9) / 5) * 100) / 100; // 0..1 over 9..14
  const count = Math.round(rng.range(22, 26) + radiusT * 8 + rng.range(0, 2));
  for (let i = 0; i < count; i++) {
    // Margin 2.2 (was 2.5 in the platform-disc era — clusters on open terrain
    // don't need a cliff-edge buffer) + 40 attempts: small districts pack
    // tightly and need both to reliably reach their dense roster.
    const pos = sampleBuildingPosition(rng, center, radius - 2.2, buildings, 40);
    if (!pos) continue;
    buildings.push({
      id: `b-${idPrefix}-${i}`,
      kind: rng.pick(arch.buildingKinds),
      position: pos,
      rotation: rng.range(0, Math.PI * 2),
      scale: rng.range(0.7, 1.5),
      appearAt: 0, // assigned below once positions are known
    });
  }

  // Growth spreads outward from the district heart: the few low-rise buildings
  // closest to the center form the founding cluster, the rest fill in by
  // distance across the full 0..1 range with a little jitter so rings don't
  // complete too neatly. Tall buildings keep their own high appearAt.
  const lowRise = buildings.slice(tallCount);
  const byDistance = [...lowRise].sort(
    (a, b) => distance(a.position, center) - distance(b.position, center),
  );
  byDistance.forEach((b, rank) => {
    if (rank < 3) {
      b.appearAt = 0;
    } else {
      const t = (rank - 2) / Math.max(1, byDistance.length - 2); // 0..1
      b.appearAt = Math.min(1, Math.max(0.05, t + rng.range(-0.05, 0.05)));
    }
  });

  return buildings;
}

/**
 * Plan a district's tall buildings. Wealthier/larger districts get more of
 * them. Each is placed (preferring open spots near the centre) and assigned a
 * high `appearAt` so it only rises once the district is heavily developed.
 */
function planTallBuildings(
  rng: Rng,
  arch: DistrictArchetype,
  center: { x: number; z: number },
  radius: number,
  buildings: Building[],
  idPrefix: string,
): void {
  const tallKinds = arch.tallKinds!;
  // Wealth/size scale the count. The wealthRange midpoint stands in for the
  // district's prosperity (the actual wealth is rolled separately but tracks it).
  const wealthMid = (arch.wealthRange[0] + arch.wealthRange[1]) / 2;
  const wealthT = clampStat(wealthMid) / 100; // 0..1
  const radiusT = clampStat(((radius - 9) / 5) * 100) / 100;
  const base = 2 + Math.round(wealthT * 4 + radiusT * 3); // ~2..9
  const tallCount = base + rng.int(0, 2);

  for (let i = 0; i < tallCount; i++) {
    const kind = rng.pick(tallKinds);
    // Place the tall building, biased toward the dense heart of the district.
    // Skip if there's no clear spot — better a few fewer towers than overlap.
    const pos = sampleBuildingPosition(
      rng,
      center,
      (radius - 2.5) * 0.85,
      buildings,
      26,
    );
    if (!pos) continue;
    const floorRange = TALL_FLOOR_RANGE[kind] ?? [3, 6];
    const floors = rng.int(floorRange[0], floorRange[1]);
    const floor = tallAppearFloor(kind);
    // High appearAt, spread a little so they don't all rise on the same day.
    const appearAt = Math.min(0.99, floor + rng.range(0, 1 - floor) * 0.7);
    buildings.push({
      id: `b-${idPrefix}-tall-${i}`,
      kind,
      position: pos,
      rotation: rng.range(0, Math.PI * 2),
      scale: rng.range(0.9, 1.3),
      appearAt,
      floors,
    });
  }
}

/**
 * Find the existing district nearest to `from` (excluding itself). Exported for
 * the engine, which connects each newly-founded district to its closest
 * neighbour by road. Returns null only if there is no other district.
 */
export function nearestDistrict(
  from: District,
  districts: District[],
): District | null {
  let best: District | null = null;
  let bestDist = Infinity;
  for (const d of districts) {
    if (d.id === from.id) continue;
    const dist = distance(from.position, d.position);
    if (dist < bestDist) {
      bestDist = dist;
      best = d;
    }
  }
  return best;
}

function generateRoads(rng: Rng, districts: District[]): Road[] {
  // Minimum spanning tree (Prim's) so every district is reachable...
  const roads: Road[] = [];
  if (districts.length < 2) return roads;
  const connected = new Set<number>([0]);
  while (connected.size < districts.length) {
    let best: { from: number; to: number; dist: number } | null = null;
    for (const i of connected) {
      for (let j = 0; j < districts.length; j++) {
        if (connected.has(j)) continue;
        const d = distance(districts[i].position, districts[j].position);
        if (!best || d < best.dist) best = { from: i, to: j, dist: d };
      }
    }
    if (!best) break;
    roads.push({ from: districts[best.from].id, to: districts[best.to].id });
    connected.add(best.to);
  }
  // ...plus a couple of scenic extras for loops.
  const extras = rng.int(1, 2);
  for (let e = 0; e < extras; e++) {
    const i = rng.int(0, districts.length - 1);
    const j = rng.int(0, districts.length - 1);
    if (i === j) continue;
    const exists = roads.some(
      (r) =>
        (r.from === districts[i].id && r.to === districts[j].id) ||
        (r.from === districts[j].id && r.to === districts[i].id),
    );
    if (!exists) roads.push({ from: districts[i].id, to: districts[j].id });
  }
  return roads;
}

// ----- Factions -----------------------------------------------------------------

function generateFactions(rng: Rng, districts: District[]): Faction[] {
  const count = rng.int(4, 6);
  // Prefer factions whose home districts exist in this city.
  const districtTypes = new Set(districts.map((d) => d.type));
  const scored = FACTION_TEMPLATES.map((t) => ({
    template: t,
    weight: t.homeDistricts.some((h) => districtTypes.has(h)) ? 10 : 3,
  }));
  const chosen: typeof FACTION_TEMPLATES = [];
  const pool = [...scored];
  while (chosen.length < count && pool.length > 0) {
    const pick = rng.weighted(pool, (p) => p.weight);
    chosen.push(pick.template);
    pool.splice(pool.indexOf(pick), 1);
  }

  const factions: Faction[] = chosen.map((t, i) => {
    const home =
      districts.find((d) => t.homeDistricts.includes(d.type)) ?? rng.pick(districts);
    return {
      id: `faction-${i}-${t.archetype}`,
      archetype: t.archetype,
      name: rng.pick(t.names),
      agenda: rng.pick(t.agendas),
      flavor: rng.pick(t.flavors),
      influence: clampStat(rng.range(30, 75)),
      satisfaction: clampStat(rng.range(45, 65)),
      relationships: {},
      preferredStats: t.preferredStats,
      hatedStats: t.hatedStats,
      homeDistrictId: home.id,
    };
  });

  // Relationship matrix from rivalry/friendship tables plus noise.
  for (const a of factions) {
    for (const b of factions) {
      if (a.id === b.id) continue;
      let rel = rng.range(-15, 15);
      if (
        FACTION_RIVALRIES.some(
          ([x, y]) =>
            (x === a.archetype && y === b.archetype) ||
            (x === b.archetype && y === a.archetype),
        )
      ) {
        rel -= rng.range(30, 55);
      }
      if (
        FACTION_FRIENDSHIPS.some(
          ([x, y]) =>
            (x === a.archetype && y === b.archetype) ||
            (x === b.archetype && y === a.archetype),
        )
      ) {
        rel += rng.range(25, 50);
      }
      a.relationships[b.id] = Math.round(Math.max(-100, Math.min(100, rel)));
    }
  }
  return factions;
}

function assignDominantFactions(districts: District[], factions: Faction[]): void {
  for (const faction of factions) {
    const home = districts.find((d) => d.id === faction.homeDistrictId);
    if (home && home.dominantFactionId === null) {
      home.dominantFactionId = faction.id;
    }
  }
}

// ----- Citizens -------------------------------------------------------------------

function generateCitizenGroups(rng: Rng, districts: District[]): CitizenGroup[] {
  const groups: CitizenGroup[] = [];
  for (const district of districts) {
    const arch = DISTRICT_ARCHETYPES.find((a) => a.type === district.type)!;
    const archetypes = rng.pickMany(arch.citizenArchetypes, 2);
    let remaining = district.population;
    archetypes.forEach((archetype, i) => {
      const count =
        i === archetypes.length - 1 ? remaining : Math.round(remaining * rng.range(0.35, 0.65));
      remaining -= count;
      groups.push({
        id: `cg-${district.id}-${i}`,
        archetype,
        count,
        happiness: clampStat(rng.range(40, 70)),
        districtId: district.id,
      });
    });
  }
  return groups;
}

// ----- Resources, stats, risks ------------------------------------------------------

function generateResources(rng: Rng): Resource[] {
  return rng.pickMany(RESOURCE_POOL, rng.int(3, 5)).map((r, i) => ({
    id: `resource-${i}`,
    name: r.name,
    amount: Math.round(rng.range(r.range[0], r.range[1])),
    trend: Math.round(rng.range(r.trend[0], r.trend[1]) * 10) / 10,
  }));
}

function generateStartingStats(
  rng: Rng,
  districts: District[],
  citizenGroups: CitizenGroup[],
): CityStats {
  const stats = {} as CityStats;
  for (const key of BOUNDED_STAT_KEYS) {
    stats[key] = rng.range(42, 58);
  }
  // District composition tilts the starting situation.
  for (const district of districts) {
    const arch = DISTRICT_ARCHETYPES.find((a) => a.type === district.type)!;
    for (const [key, tilt] of Object.entries(arch.statTilt)) {
      stats[key as BoundedStatKey] += tilt;
    }
  }
  for (const key of BOUNDED_STAT_KEYS) {
    stats[key] = clampStat(stats[key]);
  }
  stats.population = citizenGroups.reduce((sum, g) => sum + g.count, 0);
  return stats;
}

function deriveStartingRisks(
  rng: Rng,
  stats: CityStats,
  districts: District[],
): Risk[] {
  const risks: Risk[] = [];
  const add = (kind: RiskKind, level: number, description: string) => {
    risks.push({ kind, level: clampStat(level), description });
  };
  if (stats.safety < 50) {
    add('crime', 65 - stats.safety + rng.range(0, 10), 'Pickpockets are unionizing informally.');
  }
  if (stats.pollution > 50) {
    add('plague', stats.pollution - 30 + rng.range(0, 10), 'The river has opinions, and a smell.');
  }
  if (stats.magic > 55) {
    add('magical-surge', stats.magic - 30 + rng.range(0, 15), 'Reality is wobbly near the fountains.');
  }
  if (districts.some((d) => d.type === 'industrial')) {
    add('fire', 30 + rng.range(0, 15), 'The Smokeworks insists everything is fine. Loudly.');
  }
  if (districts.some((d) => d.type === 'harbor')) {
    add('flood', 25 + rng.range(0, 15), 'High tide keeps getting more ambitious.');
  }
  if (risks.length === 0) {
    add('unrest', 20 + rng.range(0, 10), 'Suspicious calm. The council does not trust it.');
  }
  return risks;
}

// ----- Briefing -------------------------------------------------------------------------

function generateBriefing(
  rng: Rng,
  name: string,
  quirks: CityQuirk[],
  factions: Faction[],
  risks: Risk[],
): string {
  const opener = rng.pick(BRIEFING_OPENERS);
  const problem = rng.pick(BRIEFING_PROBLEMS);
  const quirk = rng.pick(quirks);
  const faction = rng.pick(factions);
  const risk = risks.length > 0 ? rng.pick(risks) : null;
  const lines = [
    opener,
    `A note on ${name}: ${quirk.title.toLowerCase()}. ${quirk.description}`,
    `${faction.name} would like a word — their agenda: ${faction.agenda.toLowerCase()}`,
    problem,
  ];
  if (risk) lines.push(`Also: ${risk.description}`);
  lines.push('Good luck, Mayor. The city is watching. Some of it literally.');
  return lines.join('\n\n');
}
