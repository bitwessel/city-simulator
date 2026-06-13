import type {
  Building,
  City,
  CityQuirk,
  CompletedProject,
  District,
  GameEventDef,
  NotableCitizen,
  TerrainData,
  WorldDef,
  WorldDistrictPin,
  WorldFactionPin,
  WorldLandmark,
} from '../types';
import { Rng, hashSeed } from '../utils/rng';
import { clampStat } from '../utils/math';
import {
  generateCity,
  makeDistrict,
  nextDistrictPosition,
} from '../generation/generator';
import { DISTRICT_ARCHETYPES } from '../generation/data/names';
import { QUIRK_POOL } from '../generation/data/quirks';
import { placeLandmarkSite } from '../projects/projects';
import { PROJECT_POOL } from '../projects/data/projects';
import { addDistrictFlat } from '../generation/terrain';
import { deriveCityMood } from '../simulation/mood';

// ---------------------------------------------------------------------------
// Curated-world loader (phase 07). A world file *post-processes* the city the
// generator grows from `world.baseSeed` — it never reaches into the generator's
// internals, so the random-seed path (and the generator snapshot guard in
// tests/generator.test.ts) stays byte-identical to today.
//
// Precedence: world file > generator. The loader applies overrides in a fixed
// order (lore → terrain → districts → landmarks → factions → cast → quirks →
// events), re-derives mood, and re-stamps history[0] consistent with the final
// stats. Determinism is sacred: any RNG the overrides need draws from a
// dedicated sub-stream keyed off `world/<id>:<variationSeed>:<purpose>`, so:
//   - omitted variationSeed  ⇒ the baseSeed city plus deterministic overrides
//   - a variationSeed        ⇒ salts ONLY the generator-filled / unspecified
//                              parts the author left room for.
// ---------------------------------------------------------------------------

/** A purpose-keyed sub-stream for world placement/overrides — never the main rng. */
function worldRng(world: WorldDef, variationSeed: string | undefined, purpose: string): Rng {
  return new Rng(hashSeed(`world/${world.id}:${variationSeed ?? ''}:${purpose}`));
}

/**
 * Grow a curated world's `City`. Starts from `generateCity(world.baseSeed)` and
 * layers the world's overrides on top. With `variationSeed` omitted the result
 * is the baseSeed city plus the (deterministic) overrides; a `variationSeed`
 * salts only the parts the author left to the generator.
 */
export function generateCityFromWorld(world: WorldDef, variationSeed?: string): City {
  const city = generateCity(world.baseSeed);

  applyLore(city, world);
  applyTerrain(city, world);
  applyDistricts(city, world, variationSeed);
  applyLandmarks(city, world, variationSeed);
  applyFactions(city, world);
  applyCast(city, world);
  applyQuirks(city, world);
  applyEvents(city, world);

  city.worldId = world.id;

  // Salt the city's seed with the variationSeed so the FORWARD simulation —
  // events, disasters, expansion, mid-run casting (all keyed off seed.raw) —
  // diverges between playthroughs, while the generated start-state stays pinned
  // to baseSeed ("the harbor is always here; the forest folk change"). Omitted
  // (or empty) ⇒ seed stays baseSeed exactly, so the no-variation path is the
  // pure baseSeed city plus deterministic overrides.
  if (variationSeed && variationSeed.length > 0) {
    const raw = `${world.baseSeed}~${variationSeed}`;
    city.seed = { raw, value: hashSeed(raw) };
  }

  // Re-derive mood unless the author pinned a lean (lore wins).
  city.mood = world.lore?.moodLean ?? deriveCityMood(city.stats);

  // Keep the day-1 history snapshot consistent with the final (possibly
  // override-nudged) stats so the timeline opens on the real founding numbers.
  if (city.history.length > 0) {
    city.history[0] = { day: 1, stats: { ...city.stats } };
  }

  return city;
}

// ----- Lore -----------------------------------------------------------------

function applyLore(city: City, world: WorldDef): void {
  // The world name is required and is the city's name (overwriting the seed's
  // generated name). Tagline/briefing override only when the author supplied them.
  city.name = world.name;
  const lore = world.lore;
  if (lore?.tagline !== undefined) city.tagline = lore.tagline;
  if (lore?.briefing !== undefined) city.briefing = lore.briefing;

  // Re-stamp the opening news line with the world name (the generator wrote it
  // with the seed's generated name). Trivially safe text rewrite, no RNG.
  if (city.news.length > 0 && city.news[0].day === 1) {
    city.news[0] = {
      day: 1,
      text: `You take office in ${city.name}. The welcome banner is only slightly misspelled.`,
      tone: 'good',
    };
  }
  // Likewise the founding chronicle entry, if present.
  const founding = (city.chronicle ?? []).find((e) => e.kind === 'founding' && e.day === 1);
  if (founding) {
    founding.title = `${city.name} Is Founded`;
    founding.text = `On this day, the first stones of ${city.name} were laid and a banner — only slightly misspelled — was raised. The city begins, as all good cities do, with optimism and an unresolved argument.`;
  }
}

// ----- Terrain --------------------------------------------------------------

function applyTerrain(city: City, world: WorldDef): void {
  if (!world.terrain || !city.terrain) return;
  // Shallow merge: the author's top-level terrain fields win; everything else
  // (notably the generated `flats` for the district plateaus) is preserved.
  city.terrain = { ...city.terrain, ...world.terrain } as TerrainData;
}

// ----- Districts ------------------------------------------------------------

function applyDistricts(
  city: City,
  world: WorldDef,
  variationSeed: string | undefined,
): void {
  const pins = world.districts ?? [];
  pins.forEach((pin, i) => applyDistrictPin(city, world, pin, i, variationSeed));
}

function applyDistrictPin(
  city: City,
  world: WorldDef,
  pin: WorldDistrictPin,
  index: number,
  variationSeed: string | undefined,
): void {
  const arch = DISTRICT_ARCHETYPES.find((a) => a.type === pin.type);
  if (!arch) return; // validator already rejected unknown types; defensive.

  // Reuse a generated district of this type that hasn't been claimed by an
  // earlier pin of the same type; otherwise add a fresh one beside the layout.
  const claimed = new Set<string>(
    (city.districts as (District & { __pinned?: boolean })[])
      .filter((d) => d.__pinned)
      .map((d) => d.id),
  );
  let target = city.districts.find((d) => d.type === pin.type && !claimed.has(d.id));

  if (!target) {
    target = addPinnedDistrict(city, world, pin, arch.type, index, variationSeed);
  }
  // Tag the district so a second same-type pin reuses a different one.
  (target as District & { __pinned?: boolean }).__pinned = true;

  if (pin.name !== undefined) target.name = pin.name;
  if (pin.palette !== undefined) {
    target.visualStyle = { ...pin.palette };
  }
  if (pin.wealthTilt !== undefined) {
    target.wealth = clampStat(target.wealth + pin.wealthTilt);
  }
  if (pin.position !== undefined) {
    // A pinned position always wins. Translate the district's buildings by the
    // same delta so they keep their generated layout around the new centre
    // (rather than scattering), then level the terrain under the new spot so
    // buildings sit flush. Deterministic — no RNG.
    const dx = pin.position.x - target.position.x;
    const dz = pin.position.z - target.position.z;
    target.position = { ...pin.position };
    for (const b of target.buildings) {
      b.position = { x: b.position.x + dx, z: b.position.z + dz };
    }
    if (city.terrain) addDistrictFlat(city.terrain, target.position, target.radius);
  }
}

/**
 * Add a brand-new district for a pin whose type the seed didn't generate. Uses
 * a dedicated sub-stream so it never perturbs the generator. A pinned position
 * wins; otherwise the district is placed beside the existing layout on the same
 * spacing grid the generator uses.
 */
function addPinnedDistrict(
  city: City,
  world: WorldDef,
  pin: WorldDistrictPin,
  type: District['type'],
  index: number,
  variationSeed: string | undefined,
): District {
  const arch = DISTRICT_ARCHETYPES.find((a) => a.type === type)!;
  const rng = worldRng(world, variationSeed, `district:${index}:${type}`);
  const existing = city.districts.map((d) => d.position);
  const position =
    pin.position ??
    nextDistrictPosition(rng, existing, city.districts.length, {
      terrain: city.terrain,
      radius: 11,
      nearRiver: type === 'harbor',
    });
  const radius = 11;
  if (city.terrain) addDistrictFlat(city.terrain, position, radius);
  const district = makeDistrict(rng, arch, `district-world-${index}-${type}`, position, {
    radius,
    wealth: clampStat((arch.wealthRange[0] + arch.wealthRange[1]) / 2),
    population: rng.int(300, 1400),
    development: rng.range(8, 20),
    name: pin.name ?? rng.pick(arch.names),
  });
  city.districts.push(district);
  // Connect the new district to its nearest neighbour by road so the graph
  // stays connected (mirrors the engine's expansion behaviour).
  if (city.districts.length > 1) {
    let best: District | null = null;
    let bestDist = Infinity;
    for (const d of city.districts) {
      if (d.id === district.id) continue;
      const dd = Math.hypot(d.position.x - position.x, d.position.z - position.z);
      if (dd < bestDist) {
        bestDist = dd;
        best = d;
      }
    }
    if (best) city.roads.push({ from: district.id, to: best.id });
  }
  return district;
}

// ----- Landmarks ------------------------------------------------------------

/** Reverse lookup: a completed-landmark project def for a building kind, if any. */
function projectForBuilding(building: Building['kind']) {
  return PROJECT_POOL.find((p) => p.building === building);
}

function applyLandmarks(
  city: City,
  world: WorldDef,
  variationSeed: string | undefined,
): void {
  const landmarks = world.landmarks ?? [];
  landmarks.forEach((lm, i) => applyLandmark(city, world, lm, i, variationSeed));
}

function applyLandmark(
  city: City,
  world: WorldDef,
  lm: WorldLandmark,
  index: number,
  variationSeed: string | undefined,
): void {
  if (city.districts.length === 0) return;
  const host =
    (lm.districtType
      ? city.districts.find((d) => d.type === lm.districtType)
      : undefined) ?? city.districts[0];

  const rng = worldRng(world, variationSeed, `landmark:${index}:${lm.building}`);
  const { position, rotation } = placeLandmarkSite(city, host, rng);

  const buildingId = `world-landmark-${world.id}-${index}-${lm.building}`;
  const building: Building = {
    id: buildingId,
    kind: lm.building,
    position,
    rotation,
    scale: 1.2,
    appearAt: 0, // a completed landmark stands from founding
  };
  host.buildings.push(building);

  // Record it as a completed project when the kind maps to a ProjectDef, so
  // events/headlines that reference completed landmarks find it (and the run
  // reads as already having that landmark).
  const def = projectForBuilding(lm.building);
  if (def) {
    const completed: CompletedProject = { defId: def.id, districtId: host.id, day: 1 };
    city.completedProjects = [...(city.completedProjects ?? []), completed];
  }
}

// ----- Factions -------------------------------------------------------------

function applyFactions(city: City, world: WorldDef): void {
  for (const pin of world.factions ?? []) {
    applyFactionPin(city, pin);
  }
}

function applyFactionPin(city: City, pin: WorldFactionPin): void {
  let faction = city.factions.find((f) => f.archetype === pin.archetype);
  if (!faction) {
    // The seed didn't roll this archetype; add a minimal pinned faction. It
    // homes in a district if one of the right kind exists, else the first.
    const home = city.districts[0]?.id ?? null;
    faction = {
      id: `faction-world-${pin.archetype}`,
      archetype: pin.archetype,
      name: pin.name ?? pin.archetype.replace('-', ' '),
      agenda: pin.agenda ?? 'pursue their interests, politely',
      flavor: 'A faction the world author insisted upon.',
      influence: clampStat(pin.influence ?? 50),
      satisfaction: clampStat(pin.satisfaction ?? 55),
      relationships: {},
      preferredStats: [],
      hatedStats: [],
      homeDistrictId: home,
    };
    city.factions.push(faction);
  }
  if (pin.name !== undefined) faction.name = pin.name;
  if (pin.agenda !== undefined) faction.agenda = pin.agenda;
  if (pin.satisfaction !== undefined) faction.satisfaction = clampStat(pin.satisfaction);
  if (pin.influence !== undefined) faction.influence = clampStat(pin.influence);
  if (pin.relationshipOverrides) {
    for (const [archetype, value] of Object.entries(pin.relationshipOverrides)) {
      const other = city.factions.find((f) => f.archetype === archetype);
      if (other && other.id !== faction.id) {
        faction.relationships[other.id] = clampRelationship(value as number);
      }
    }
  }
}

function clampRelationship(v: number): number {
  return Math.max(-100, Math.min(100, Math.round(v)));
}

// ----- Cast -----------------------------------------------------------------

function applyCast(city: City, world: WorldDef): void {
  if (!world.cast || world.cast.length === 0) return;
  const cast: NotableCitizen[] = [...(city.cast ?? [])];
  for (const member of world.cast) {
    const idx = cast.findIndex((c) => c.id === member.id);
    if (idx >= 0) cast[idx] = { ...member };
    else cast.push({ ...member });
  }
  city.cast = cast;
}

// ----- Quirks ---------------------------------------------------------------

function applyQuirks(city: City, world: WorldDef): void {
  if (!world.quirks || world.quirks.length === 0) return;
  const quirks: CityQuirk[] = [...city.quirks];
  for (const entry of world.quirks) {
    const def: CityQuirk | undefined =
      typeof entry === 'string' ? QUIRK_POOL.find((q) => q.id === entry) : entry;
    if (!def) continue; // validator already rejected unknown ids; defensive.
    const idx = quirks.findIndex((q) => q.id === def.id);
    if (idx >= 0) quirks[idx] = def;
    else quirks.push(def);
  }
  city.quirks = quirks;
}

// ----- Events ---------------------------------------------------------------

function applyEvents(city: City, world: WorldDef): void {
  if (!world.events || world.events.length === 0) return;
  // Deep-clone so the city owns its own copy (it travels with the save and a
  // mutating engine never reaches into the shared world def).
  city.worldEvents = structuredClone(world.events) as GameEventDef[];
}
