import type {
  BoundedStatKey,
  Building,
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
  WorldSeed,
} from '../types';
import { BOUNDED_STAT_KEYS } from '../types';
import { Rng, hashSeed } from '../utils/rng';
import { clampStat, distance } from '../utils/math';
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

  const districts = generateDistricts(rng);
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

function generateDistricts(rng: Rng): District[] {
  const count = rng.int(5, 8);
  // Old town is always present; the rest are drawn without replacement.
  const oldTown = DISTRICT_ARCHETYPES.find((d) => d.type === 'old-town')!;
  const others = rng.shuffle(
    DISTRICT_ARCHETYPES.filter((d) => d.type !== 'old-town'),
  ).slice(0, count - 1);
  const picked = [oldTown, ...others];

  // Lay districts out around the center with minimum spacing.
  const positions = layoutPositions(rng, picked.length);

  return picked.map((arch, i) => {
    const radius = rng.range(9, 14);
    const wealth = rng.range(arch.wealthRange[0], arch.wealthRange[1]);
    const population = rng.int(300, 1400);
    // Cities start as young settlements and build up over the run. Old town
    // is the founding district, so it begins noticeably more established.
    const development =
      arch.type === 'old-town' ? rng.range(28, 40) : rng.range(8, 20);
    const district: District = {
      id: `district-${i}-${arch.type}`,
      name: rng.pick(arch.names),
      type: arch.type,
      position: positions[i],
      radius,
      population,
      wealth: clampStat(wealth),
      mood: clampStat(rng.range(45, 70)),
      development,
      risks: startingDistrictRisks(rng, arch.type),
      buildings: generateBuildings(rng, arch, positions[i], radius),
      dominantFactionId: null,
      visualStyle: { baseColor: arch.baseColor, accentColor: arch.accentColor },
      quirks: [],
    };
    return district;
  });
}

function layoutPositions(rng: Rng, count: number): { x: number; z: number }[] {
  const positions: { x: number; z: number }[] = [{ x: 0, z: 0 }];
  const minGap = 24;
  let angle = rng.range(0, Math.PI * 2);
  for (let i = 1; i < count; i++) {
    // Walk outward on a noisy spiral until we find a clear spot.
    for (let attempt = 0; attempt < 40; attempt++) {
      angle += rng.range(1.4, 2.6);
      const dist = 22 + i * 6 + rng.range(-4, 8);
      const candidate = {
        x: Math.cos(angle) * dist,
        z: Math.sin(angle) * dist * 0.8, // slightly squashed: looks better on screen
      };
      if (positions.every((p) => distance(p, candidate) >= minGap)) {
        positions.push(candidate);
        break;
      }
      if (attempt === 39) positions.push(candidate);
    }
  }
  return positions;
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

/**
 * Generate the district's *fully grown* building layout. Each building gets an
 * `appearAt` development threshold; the renderer only shows buildings the
 * district has "built" so far, so the city visibly grows over a run.
 */
function generateBuildings(
  rng: Rng,
  arch: DistrictArchetype,
  center: { x: number; z: number },
  radius: number,
): Building[] {
  const count = rng.int(14, 20);
  const buildings: Building[] = [];
  for (let i = 0; i < count; i++) {
    // Rejection-sample positions so buildings cluster but do not overlap much.
    let pos = center;
    for (let attempt = 0; attempt < 18; attempt++) {
      const a = rng.range(0, Math.PI * 2);
      const r = Math.sqrt(rng.next()) * (radius - 2.5);
      const candidate = { x: center.x + Math.cos(a) * r, z: center.z + Math.sin(a) * r };
      if (buildings.every((b) => distance(b.position, candidate) >= 2.8)) {
        pos = candidate;
        break;
      }
      pos = candidate;
    }
    buildings.push({
      id: `b-${arch.type}-${i}`,
      kind: rng.pick(arch.buildingKinds),
      position: pos,
      rotation: rng.range(0, Math.PI * 2),
      scale: rng.range(0.7, 1.5),
      appearAt: 0, // assigned below once positions are known
    });
  }

  // Growth spreads outward from the district heart: the few buildings closest
  // to the center form the founding cluster, the rest fill in by distance with
  // a little jitter so rings don't complete too neatly.
  const byDistance = [...buildings].sort(
    (a, b) => distance(a.position, center) - distance(b.position, center),
  );
  byDistance.forEach((b, rank) => {
    if (rank < 3) {
      b.appearAt = 0;
    } else {
      const t = (rank - 2) / (byDistance.length - 2);
      b.appearAt = Math.min(1, Math.max(0.05, t * 0.92 + rng.range(-0.06, 0.06)));
    }
  });
  return buildings;
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
