import type {
  ActiveProject,
  Building,
  City,
  District,
  ProjectDef,
} from '../types';
import { Rng, hashSeed } from '../utils/rng';
import { sampleBuildingPosition } from '../generation/generator';
import { riverDistanceAt, terrainHeightAt, WATER_LEVEL } from '../generation/terrain';
import { ageAtLeast, getAgeDef } from '../simulation/ages';
import { PROJECT_POOL } from './data/projects';

// ---------------------------------------------------------------------------
// Mayor projects — the pure simulation helpers. Validation and commissioning
// live here (no React, no three.js); the store and engine call into them.
//
// Determinism is sacred: placement position/rotation come from a dedicated
// hashed sub-stream `hash(seed + ':project:' + day + ':' + defId)`, mirroring
// the existing `:tick:`/`:choice:` patterns. Never Math.random().
// ---------------------------------------------------------------------------

// ----- City Favor ----------------------------------------------------------

/** Favor a new mayor starts with — enough to bank toward a first project. */
export const START_FAVOR = 10;
/** Favor cap — roughly one to two projects banked. */
export const FAVOR_CAP = 24;
/** Base favor regenerated per day. */
export const FAVOR_REGEN_BASE = 0.5;
/**
 * Extra regen per day when the city loves its mayor: scales up to this on top
 * of the base when trust *and* happiness are both high, so a well-run city
 * builds a little faster (base 0.5 → up to ~0.9/day). Sized so a ~10-16 favor
 * project lands every ~10-20 days.
 */
export const FAVOR_REGEN_BONUS = 0.4;
/** Per-district cap on how many projects (active + completed) one can host. */
export const PROJECTS_PER_DISTRICT = 3;

/** Treat undefined favor as the starting amount (older states load cleanly). */
export function getFavor(city: City): number {
  return city.favor ?? START_FAVOR;
}

/**
 * Favor regenerated this day. Base regen, plus a bonus that ramps in as trust
 * and happiness climb past the middle of the range — the city wants to build
 * for a loved mayor. Never overfills the cap.
 */
export function favorRegen(city: City): number {
  const trustT = Math.max(0, Math.min(1, (city.stats.trust - 50) / 50));
  const happyT = Math.max(0, Math.min(1, (city.stats.happiness - 50) / 50));
  // Geometric-ish blend: both must be high to earn the full bonus.
  const loveT = trustT * happyT;
  return FAVOR_REGEN_BASE + FAVOR_REGEN_BONUS * loveT;
}

// ----- Catalog lookup ------------------------------------------------------

/** Look up a project definition by id, or undefined if unknown. */
export function getProjectDef(id: string): ProjectDef | undefined {
  return PROJECT_POOL.find((p) => p.id === id);
}

/** Whether a project may be commissioned in a district of this type. */
export function projectAllowsDistrict(def: ProjectDef, district: District): boolean {
  return def.districtTypes === 'any' || def.districtTypes.includes(district.type);
}

/** All projects eligible for a given district (type allowed, not at cap, not duplicated). */
export function eligibleProjects(city: City, district: District): ProjectDef[] {
  return PROJECT_POOL.filter(
    (def) => canStartProject(city, district.id, def.id).ok,
  );
}

/** How many projects (under construction or finished) a district already hosts. */
export function districtProjectCount(city: City, districtId: string): number {
  const active = (city.activeProjects ?? []).filter((p) => p.districtId === districtId).length;
  const done = (city.completedProjects ?? []).filter((p) => p.districtId === districtId).length;
  return active + done;
}

/** Whether this exact project already stands (or is rising) in this district. */
export function districtHasProject(
  city: City,
  districtId: string,
  defId: string,
): boolean {
  const active = (city.activeProjects ?? []).some(
    (p) => p.districtId === districtId && p.defId === defId,
  );
  const done = (city.completedProjects ?? []).some(
    (p) => p.districtId === districtId && p.defId === defId,
  );
  return active || done;
}

// ----- Validation ----------------------------------------------------------

export type CanStartResult = { ok: true } | { ok: false; reason: string };

/**
 * Whether the player can commission `defId` in district `districtId` right now.
 * Reasons are human-readable — the UI shows them on disabled buttons.
 */
export function canStartProject(
  city: City,
  districtId: string,
  defId: string,
): CanStartResult {
  const def = getProjectDef(defId);
  if (!def) return { ok: false, reason: 'Unknown project.' };
  const district = city.districts.find((d) => d.id === districtId);
  if (!district) return { ok: false, reason: 'No such district.' };
  if (!projectAllowsDistrict(def, district)) {
    return { ok: false, reason: `Cannot be built in a ${district.type.replace('-', ' ')} district.` };
  }
  if (def.minAge && !ageAtLeast(city, def.minAge)) {
    return {
      ok: false,
      reason: `A dream for a grander age — arrives with ${getAgeDef(def.minAge).title}.`,
    };
  }
  if (districtHasProject(city, districtId, defId)) {
    return { ok: false, reason: `${district.name} already has this landmark.` };
  }
  if (districtProjectCount(city, districtId) >= PROJECTS_PER_DISTRICT) {
    return { ok: false, reason: `${district.name} already has ${PROJECTS_PER_DISTRICT} projects.` };
  }
  if (getFavor(city) < def.cost) {
    return { ok: false, reason: `Needs ${def.cost} favor (you have ${Math.floor(getFavor(city))}).` };
  }
  return { ok: true };
}

// ----- Placement -----------------------------------------------------------

/** Keep landmarks this far inside the district edge (a generous landmark margin). */
const LANDMARK_EDGE_MARGIN = 3.4;
/** A landmark site this clear of its neighbours is comfortably standalone. */
const LANDMARK_CLEARANCE_RADIUS = 3.4;

/**
 * Pick a deterministic spot inside the district for a commissioned landmark,
 * reusing the generator's terrain/collision sampler so it avoids existing
 * buildings (the sampler enforces the same min-gap as roster buildings), then
 * guarding against the river/water on top. The sub-stream is
 * `hash(seed + ':project:' + day + ':' + defId)` so an order replays identically.
 */
export function placeProject(
  city: City,
  district: District,
  def: ProjectDef,
): { position: { x: number; z: number }; rotation: number } {
  const rng = new Rng(hashSeed(`${city.seed.raw}:project:${city.day}:${def.id}`));
  return placeLandmarkSite(city, district, rng);
}

/**
 * The shared landmark placement loop, driven by a caller-provided rng stream
 * (projects use `:project:`, wonders `:wonder:` — see the determinism rules).
 *
 * Returns the chosen position and a rotation. The disc is shrunk generously at
 * first (so landmarks stand clear of the edge) and relaxed over later rounds in
 * case the district is packed tight, keeping the dry candidate with the most
 * elbow room. Falls back to the district centre only if no dry sample exists
 * at all (a landmark always lands).
 */
export function placeLandmarkSite(
  city: City,
  district: District,
  rng: Rng,
): { position: { x: number; z: number }; rotation: number } {
  const terrain = city.terrain;

  const placed = district.buildings;
  const clearanceOf = (p: { x: number; z: number }): number => {
    let min = Infinity;
    for (const b of placed) {
      const d = Math.hypot(b.position.x - p.x, b.position.z - p.z);
      if (d < min) min = d;
    }
    return min;
  };
  const dryEnough = (p: { x: number; z: number }): boolean => {
    if (!terrain) return true;
    // Off the river channel and its banks, and above the water surface.
    if (riverDistanceAt(terrain, p.x, p.z) < terrain.river.width * 0.9 + LANDMARK_EDGE_MARGIN) {
      return false;
    }
    return terrainHeightAt(terrain, p.x, p.z) > WATER_LEVEL + 0.2;
  };

  // Each round asks the shared sampler for a building-clear, dry spot. The disc
  // starts well inside the edge and is relaxed toward the full footprint over
  // later rounds so even a packed district yields a spot. The sampler is
  // deterministic given the rng, so this fixed loop replays identically. We
  // keep the dry candidate with the most elbow room — never the crowded heart.
  let position: { x: number; z: number } | null = null;
  let bestClearance = -Infinity;
  for (let round = 0; round < 14; round++) {
    // Margin shrinks from LANDMARK_EDGE_MARGIN toward ~1.4 over the rounds.
    const margin = Math.max(1.4, LANDMARK_EDGE_MARGIN - round * 0.25);
    const candidate = sampleBuildingPosition(
      rng,
      district.position,
      Math.max(2, district.radius - margin),
      placed,
      40,
    );
    if (!candidate || !dryEnough(candidate)) continue;
    const clearance = clearanceOf(candidate);
    if (clearance > bestClearance) {
      bestClearance = clearance;
      position = candidate;
    }
    // Good enough: comfortably clear of every neighbour.
    if (clearance >= LANDMARK_CLEARANCE_RADIUS) break;
  }

  // Saturated district (e.g. a packed harbor hugging the river): the gap-
  // enforcing sampler found nothing. Fall back to the dry point with the most
  // elbow room from a fixed sweep of random candidates — never the crowded
  // centre, which can collide. Deterministic: continues the same rng stream.
  if (!position) {
    for (let i = 0; i < 120; i++) {
      const a = rng.range(0, Math.PI * 2);
      const r = Math.sqrt(rng.next()) * Math.max(2, district.radius - 1.4);
      const candidate = {
        x: district.position.x + Math.cos(a) * r,
        z: district.position.z + Math.sin(a) * r,
      };
      if (!dryEnough(candidate)) continue;
      const clearance = clearanceOf(candidate);
      if (clearance > bestClearance) {
        bestClearance = clearance;
        position = candidate;
      }
    }
  }

  return {
    position: position ?? { x: district.position.x, z: district.position.z },
    rotation: rng.range(0, Math.PI * 2),
  };
}

// ----- Commissioning -------------------------------------------------------

/**
 * Commission a project: validate, deduct favor, place a scaffolded Building in
 * the world NOW, record the order + an ActiveProject, and announce the
 * groundbreaking in the news. Returns a NEW city (input is not mutated). A
 * no-op clone is returned if validation fails (the store relies on this).
 */
export function commissionProject(
  city: City,
  districtId: string,
  defId: string,
): City {
  const check = canStartProject(city, districtId, defId);
  if (!check.ok) return city;

  const def = getProjectDef(defId)!;
  const next: City = structuredClone(city);
  const district = next.districts.find((d) => d.id === districtId)!;

  next.favor = getFavor(next) - def.cost;

  const { position, rotation } = placeProject(next, district, def);
  const buildingId = `proj-${def.building}-${districtId}-${next.day}`;
  const building: Building = {
    id: buildingId,
    kind: def.building,
    position,
    rotation,
    scale: 1.2,
    appearAt: 0,
    construction: true,
  };
  district.buildings.push(building);

  const order = { day: next.day, districtId, defId };
  next.projectLog = [...(next.projectLog ?? []), order];

  const active: ActiveProject = {
    defId,
    districtId,
    buildingId,
    startDay: next.day,
    completeDay: next.day + def.buildDays,
  };
  next.activeProjects = [...(next.activeProjects ?? []), active];

  next.news.push({
    day: next.day,
    text: `Ground is broken on ${def.name} in ${district.name}. The works will take about ${def.buildDays} days, plus the usual ceremonial standing-around.`,
    tone: 'good',
  });

  return next;
}
