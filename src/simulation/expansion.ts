import type { City, CitizenGroup, NewsItem, Road } from '../types';
import { Rng } from '../utils/rng';
import { clampStat, distance } from '../utils/math';
import {
  DISTRICT_ARCHETYPES,
  type DistrictArchetype,
} from '../generation/data/names';
import {
  makeDistrict,
  nearestDistrict,
  nextDistrictPosition,
} from '../generation/generator';
import { addDistrictFlat } from '../generation/terrain';

// ---------------------------------------------------------------------------
// Mid-run city expansion. A thriving city periodically breaks ground on a
// brand-new district. All randomness flows from the caller's tick RNG so the
// whole thing stays deterministic: same seed + same choices ⇒ same districts.
// ---------------------------------------------------------------------------

/** Hard cap on total districts a city can ever reach. */
export const MAX_DISTRICTS = 13;
/** No new district is founded before this day. */
export const FOUNDING_MIN_DAY = 30;
/** Minimum days between successive foundings. */
export const FOUNDING_MIN_GAP_DAYS = 28;
/** Population must have grown at least this fraction over the recorded start. */
export const FOUNDING_POP_GROWTH = 0.25;
/** Or housing must have dropped below this (overcrowding pressure). */
export const FOUNDING_HOUSING_PRESSURE = 45;

/**
 * Founding headline templates. {district} is filled with the new district name.
 */
const FOUNDING_HEADLINES = [
  'Ground breaks on {district}! Surveyors pronounce the site "barely cursed".',
  '{district} is founded today; the ribbon-cutting scissors were ceremonially oversized.',
  'The city expands: {district} opens for settlement, complete with one (1) very proud signpost.',
  'A new district, {district}, joins the city. The pigeons have already claimed the rooftops.',
  '{district} breaks ground! Early residents are mostly optimists and one suspiciously eager landlord.',
];

/**
 * Decide whether to found a new district this tick and, if so, do it. Returns
 * true if a district was founded (headlines is appended to). Pure aside from
 * mutating the passed-in `city` (the engine already cloned it for this tick).
 */
export function maybeFoundDistrict(
  city: City,
  rng: Rng,
  headlines: NewsItem[],
): boolean {
  if (!foundingConditionsMet(city)) return false;

  // Small per-day chance once eligible, so founding feels organic rather than
  // clockwork — but still fully determined by the tick RNG.
  if (!rng.chance(0.18)) return false;

  foundDistrict(city, rng, headlines);
  return true;
}

/** Whether the city currently qualifies to break ground on a new district. */
export function foundingConditionsMet(city: City): boolean {
  if (city.day < FOUNDING_MIN_DAY) return false;
  if (city.districts.length >= MAX_DISTRICTS) return false;

  const lastFounding = city.lastDistrictFoundedDay ?? 0;
  if (city.day - lastFounding < FOUNDING_MIN_GAP_DAYS) return false;

  // Decent civic health: an unhappy, broke city does not expand.
  if (city.stats.happiness < 45) return false;
  if (city.stats.wealth < 45) return false;

  // Population pressure: either crowded housing or meaningful population growth
  // over the recorded founding population.
  const startPop = city.foundingPopulation ?? city.stats.population;
  const grown =
    startPop > 0 && city.stats.population >= startPop * (1 + FOUNDING_POP_GROWTH);
  const crowded = city.stats.housing < FOUNDING_HOUSING_PRESSURE;
  return grown || crowded;
}

/** Found a new district and wire it into the city (districts, roads, people). */
function foundDistrict(city: City, rng: Rng, headlines: NewsItem[]): void {
  const arch = pickArchetype(city, rng);

  // Place adjacent to the existing layout, respecting the district min
  // spacing and the same terrain rules the generator uses (off the river and
  // steep ground; harbors hug the bank). Radius rolls first: river clearance
  // depends on the footprint.
  const radius = rng.range(9, 13);
  const existing = city.districts.map((d) => d.position);
  const position = nextDistrictPosition(rng, existing, city.districts.length, {
    terrain: city.terrain,
    radius,
    nearRiver: arch.type === 'harbor',
  });
  // Level the new site so its buildings sit on a subtle plateau.
  addDistrictFlat(city.terrain, position, radius);

  const name = pickDistrictName(city, arch, rng);
  const wealth = clampStat(
    rng.range(arch.wealthRange[0], arch.wealthRange[1]) * 0.85,
  );
  // New districts seed a small starting population *transferred* from existing
  // districts (people moving across town), so the city total is unchanged.
  const seedPop = rng.int(180, 360);
  const id = `district-${city.day}-${arch.type}-${city.districts.length}`;
  const district = makeDistrict(rng, arch, id, position, {
    radius,
    wealth,
    population: seedPop,
    development: rng.range(6, 12), // a fresh young settlement
    name,
  });

  city.districts.push(district);
  transferPopulation(city, district, seedPop);
  city.citizenGroups.push(...makeStartingGroups(rng, arch, district.id, seedPop));

  // Connect by road to the nearest existing district, plus occasionally a
  // second road to its next-nearest for a small loop.
  connectNewDistrict(city, district, rng);

  city.lastDistrictFoundedDay = city.day;
  headlines.push({
    day: city.day,
    text: rng.pick(FOUNDING_HEADLINES).replace('{district}', district.name),
    tone: 'good',
  });
}

/** Pick an archetype: prefer types not yet present, else allow a duplicate. */
function pickArchetype(city: City, rng: Rng): DistrictArchetype {
  const present = new Set(city.districts.map((d) => d.type));
  // Don't found a second old-town (it's the founding district).
  const fresh = DISTRICT_ARCHETYPES.filter(
    (a) => a.type !== 'old-town' && !present.has(a.type),
  );
  if (fresh.length > 0) return rng.pick(fresh);
  const dupable = DISTRICT_ARCHETYPES.filter((a) => a.type !== 'old-town');
  return rng.pick(dupable);
}

/** Pick a name not already used by another district of the same type. */
function pickDistrictName(
  city: City,
  arch: DistrictArchetype,
  rng: Rng,
): string {
  const used = new Set(city.districts.map((d) => d.name));
  const free = arch.names.filter((n) => !used.has(n));
  if (free.length > 0) return rng.pick(free);
  // All base names taken (duplicate district) — qualify with a suffix.
  const base = rng.pick(arch.names);
  const ordinals = ['the Second', 'the New', 'the Lesser', 'Annex', 'Reach'];
  return `${base}, ${rng.pick(ordinals)}`;
}

/**
 * Move `amount` people into the new district by drawing proportionally from the
 * other districts, keeping the city's total population (and the sum of district
 * populations) unchanged.
 */
function transferPopulation(
  city: City,
  newDistrict: City['districts'][number],
  amount: number,
): void {
  const others = city.districts.filter((d) => d.id !== newDistrict.id);
  const total = others.reduce((sum, d) => sum + d.population, 0) || 1;
  let drawn = 0;
  for (const d of others) {
    const take = Math.min(d.population, Math.round((d.population / total) * amount));
    d.population -= take;
    drawn += take;
  }
  // Any rounding shortfall: the new district simply gets what was actually drawn
  // so the district-population sum is exactly preserved.
  newDistrict.population = drawn;
}

/** Build citizen groups for a freshly founded district summing to `pop`. */
function makeStartingGroups(
  rng: Rng,
  arch: DistrictArchetype,
  districtId: string,
  pop: number,
): CitizenGroup[] {
  const archetypes = rng.pickMany(arch.citizenArchetypes, 2);
  const groups: CitizenGroup[] = [];
  let remaining = pop;
  archetypes.forEach((archetype, i) => {
    const count =
      i === archetypes.length - 1
        ? remaining
        : Math.round(remaining * rng.range(0.35, 0.65));
    remaining -= count;
    groups.push({
      id: `cg-${districtId}-${i}`,
      archetype,
      count: Math.max(0, count),
      happiness: clampStat(rng.range(45, 65)),
      districtId,
    });
  });
  return groups;
}

/** Add a road from the new district to its nearest neighbour (+ maybe one more). */
function connectNewDistrict(
  city: City,
  district: City['districts'][number],
  rng: Rng,
): void {
  const nearest = nearestDistrict(district, city.districts);
  if (!nearest) return;
  addRoad(city.roads, district.id, nearest.id);

  // Occasionally add a second road to the next-nearest for a loop.
  if (rng.chance(0.4)) {
    const second = city.districts
      .filter((d) => d.id !== district.id && d.id !== nearest.id)
      .sort(
        (a, b) =>
          distance(district.position, a.position) -
          distance(district.position, b.position),
      )[0];
    if (second) addRoad(city.roads, district.id, second.id);
  }
}

function addRoad(roads: Road[], from: string, to: string): void {
  const exists = roads.some(
    (r) =>
      (r.from === from && r.to === to) || (r.from === to && r.to === from),
  );
  if (!exists) roads.push({ from, to });
}
