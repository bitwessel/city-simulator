import type {
  ActiveWonder,
  Building,
  City,
  District,
  NewsItem,
  WonderDef,
} from '../types';
import { Rng, hashSeed } from '../utils/rng';
import { clampStat } from '../utils/math';
import { applyStatDelta, resolveTokens } from '../events/system';
import { placeLandmarkSite } from './projects';
import { WONDER_POOL } from './data/wonders';

// ---------------------------------------------------------------------------
// Wonders (phase 04) — the Wonder Age mega-project, reusing the phase-03
// landmark machinery at a grander scale. One wonder per run, chosen via the
// wonder-council event; it rises in visible stages over many days, and
// completing it is a triumphant ending (see src/simulation/outcomes.ts).
//
// Determinism: placement derives from `hash(seed + ':wonder:' + day + ':' +
// defId)`, mirroring the `:project:` pattern; stage progression is pure
// day-count arithmetic with no RNG at all.
// ---------------------------------------------------------------------------

/** Look up a wonder definition by id, or undefined if unknown. */
export function getWonderDef(id: string): WonderDef | undefined {
  return WONDER_POOL.find((w) => w.id === id);
}

/** Total construction time of a wonder across all stages. */
export function wonderTotalDays(def: WonderDef): number {
  return def.stages.reduce((s, stage) => s + stage.days, 0);
}

/**
 * The district a wonder rises in: the roomiest district of a preferred type,
 * falling back to the roomiest district overall (a wonder always finds ground).
 * Deterministic — largest radius wins, ties broken by array order.
 */
export function wonderHostDistrict(city: City, def: WonderDef): District | null {
  if (city.districts.length === 0) return null;
  const preferred =
    def.districtTypes === 'any'
      ? city.districts
      : city.districts.filter((d) => def.districtTypes.includes(d.type));
  const pool = preferred.length > 0 ? preferred : city.districts;
  let best = pool[0];
  for (const d of pool) {
    if (d.radius > best.radius) best = d;
  }
  return best;
}

/**
 * Begin construction of a wonder. Mutates the (already-cloned) city in place —
 * this is called from the engine when a wonder-council choice carries
 * `startsWonderId`, the same way other choice consequences mutate. Places the
 * staged building NOW, records the ActiveWonder, and announces the
 * groundbreaking. A no-op (returning undefined) if the wonder is unknown or
 * one already exists; otherwise returns the new ActiveWonder record.
 */
export function startWonder(
  city: City,
  defId: string,
  news: NewsItem[],
): ActiveWonder | undefined {
  const def = getWonderDef(defId);
  if (!def || city.activeWonder || city.completedWonder) return undefined;
  const district = wonderHostDistrict(city, def);
  if (!district) return undefined;

  const rng = new Rng(hashSeed(`${city.seed.raw}:wonder:${city.day}:${def.id}`));
  const { position, rotation } = placeLandmarkSite(city, district, rng);
  const buildingId = `wonder-${def.building}-${district.id}`;
  const building: Building = {
    id: buildingId,
    kind: def.building,
    position,
    rotation,
    scale: 1.5,
    appearAt: 0,
    construction: true,
    wonderStage: 0,
  };
  district.buildings.push(building);

  city.activeWonder = {
    defId: def.id,
    districtId: district.id,
    buildingId,
    startDay: city.day,
    stage: 0,
    stageCompleteDay: city.day + def.stages[0].days,
  };

  news.push({
    day: city.day,
    text: `Ground is broken on ${def.name} in ${district.name}! The whole city turns out to watch the first stone. It is, everyone agrees, an excellent stone.`,
    tone: 'good',
  });
  return city.activeWonder;
}

/**
 * Advance wonder construction by the daily tick. On each stage's completion
 * day: bump the stage (the renderer shows the next silhouette) and push that
 * stage's progress headline; on the final stage, clear the scaffolding flag,
 * apply completion effects, and record the CompletedWonder — the outcome
 * check picks it up from there. Pure day arithmetic, no RNG.
 */
export function tickWonder(city: City, headlines: NewsItem[]): void {
  const active = city.activeWonder;
  if (!active || city.day < active.stageCompleteDay) return;
  const def = getWonderDef(active.defId);
  const district = city.districts.find((d) => d.id === active.districtId);
  if (!def || !district) {
    // The def or district has gone missing; drop the orphaned record.
    city.activeWonder = undefined;
    return;
  }
  const building = district.buildings.find((b) => b.id === active.buildingId);
  const finishedStage = def.stages[active.stage];

  headlines.push({
    day: city.day,
    text: resolveTokens(finishedStage.headline, city, district.name, null),
    tone: 'good',
  });

  const nextStage = active.stage + 1;
  if (nextStage < def.stages.length) {
    active.stage = nextStage;
    active.stageCompleteDay = city.day + def.stages[nextStage].days;
    if (building) building.wonderStage = nextStage;
    return;
  }

  // The final stage has landed: the wonder is complete.
  if (building) {
    building.construction = false;
    building.wonderStage = def.stages.length;
  }
  applyStatDelta(city, def.completionEffects);
  district.mood = clampStat(district.mood + 10);
  city.completedWonder = {
    defId: def.id,
    districtId: district.id,
    day: city.day,
  };
  city.activeWonder = undefined;
  headlines.push({
    day: city.day,
    text: `${def.name} is COMPLETE! ${district.name} weeps openly, the bells ring themselves hoarse, and somewhere a historian starts a very long book about you.`,
    tone: 'good',
  });
}

/**
 * Tiny ongoing daily drift from the finished wonder, applied by the engine
 * next to the project drift it mirrors.
 */
export function applyWonderDrift(city: City): void {
  if (!city.completedWonder) return;
  const def = getWonderDef(city.completedWonder.defId);
  if (def?.dailyEffects) applyStatDelta(city, def.dailyEffects);
}
