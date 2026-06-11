import type { City, District, Road, TerrainData } from '../types';
import {
  WATER_LEVEL,
  riverDistanceAt,
  terrainHeightAt,
  terrainSlopeAt,
} from '../generation/terrain';
import { clamp } from '../utils/math';
import { hashFloat } from './hash';
import { roadCurve } from './citizens/bezier';

// ---------------------------------------------------------------------------
// Scenery placement — the pure-data half of the instanced scenery layer that
// fills the negative space between districts (trees, bushes, rocks, farm
// plots, flower patches) plus the light intra-district path spokes buildings
// orient toward.
//
// Everything here is deterministic from stable keys via `hash.ts` (the blessed
// cosmetic-randomness path — no Math.random, no RNG-stream perturbation), so
// the forest is identical for identical seeds and stable across re-renders.
// Placement splits in two phases the component composes:
//   1. `buildStaticScenery`  — seed-only candidates (forest clump noise on a
//      jittered grid, rejected against the river and map edge). Built once
//      per city.
//   2. `filterScenery`       — the dynamic clearing pass (districts grow,
//      roads appear, plots claim ground), re-run only when the city layout
//      or quantized development levels change. Forest *recedes* as districts
//      develop because `clearingRadius` grows with `development`.
// `Scenery.tsx` turns the result into InstancedMeshes.
// ---------------------------------------------------------------------------

export interface SceneryInstance {
  x: number;
  z: number;
  /** Terrain height at (x, z), precomputed so the renderer never queries. */
  y: number;
  /** Uniform scale. */
  s: number;
  /** Rotation around Y. */
  rot: number;
  /** 0..1 per-instance color variation (renderer maps it onto a palette). */
  tint: number;
}

/** 0 conifer (stacked cones), 1 broadleaf (blob canopy), 2 slim poplar. */
export type TreeVariant = 0 | 1 | 2;

export interface TreeInstance extends SceneryInstance {
  variant: TreeVariant;
}

export interface SceneryStatic {
  trees: TreeInstance[];
  bushes: SceneryInstance[];
  rocks: SceneryInstance[];
}

/** A rectangular farm plot just outside a district's edge. */
export interface FieldPlot {
  x: number;
  z: number;
  y: number;
  /** Half extents of the plot rectangle. */
  halfW: number;
  halfD: number;
  rot: number;
  tint: number;
  /**
   * Development staging (fractions of 0..1, like building `appearAt`):
   * the plot exists while showFrom <= development/100 < hideAt — fields ring
   * a young settlement, then yield ground as it urbanizes.
   */
  showFrom: number;
  hideAt: number;
  districtId: string;
}

/** One bloom in a flower patch near a garden/festival district. */
export interface FlowerInstance extends SceneryInstance {
  showFrom: number;
  districtId: string;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

// ----- Clearings --------------------------------------------------------------

/**
 * How far a district pushes the forest back. Grows with development so the
 * woods visibly recede as a district urbanizes (and a freshly founded district
 * immediately claims its footprint).
 */
export function clearingRadius(district: District): number {
  return district.radius * (1.08 + 0.4 * (district.development / 100)) + 1.0;
}

// ----- Road polylines -----------------------------------------------------------

/**
 * Sampled centerline per road, on the exact bowed curve the road ribbons,
 * citizens and carts use (via `roadCurve`). Scenery rejects against these so
 * trees never sprout in the paving.
 */
export function buildRoadPolylines(city: City): { x: number; z: number }[][] {
  const byId = new Map(city.districts.map((d) => [d.id, d]));
  const out: { x: number; z: number }[][] = [];
  for (const road of city.roads) {
    const a = byId.get(road.from);
    const b = byId.get(road.to);
    if (!a || !b) continue;
    const { start, control, end } = roadCurve(a.position, b.position);
    const len = Math.hypot(end.x - start.x, end.z - start.z);
    const count = Math.max(6, Math.round(len / 3));
    const pts: { x: number; z: number }[] = [];
    for (let i = 0; i <= count; i++) {
      const t = i / count;
      const u = 1 - t;
      pts.push({
        x: u * u * start.x + 2 * u * t * control.x + t * t * end.x,
        z: u * u * start.z + 2 * u * t * control.z + t * t * end.z,
      });
    }
    out.push(pts);
  }
  return out;
}

function nearPolylines(
  polylines: { x: number; z: number }[][],
  x: number,
  z: number,
  dist: number,
): boolean {
  const dSq = dist * dist;
  for (const pts of polylines) {
    for (const p of pts) {
      const dx = x - p.x;
      const dz = z - p.z;
      if (dx * dx + dz * dz < dSq) return true;
    }
  }
  return false;
}

// ----- Static candidates (seed-only) ----------------------------------------------

/**
 * Build the seed-only scenery candidates: a jittered grid over the whole map,
 * thinned by low-frequency "forest clump" noise (dense woods between
 * districts, open meadow elsewhere), with riverbank rocks along the water.
 * Rejected here: the river channel, underwater spots, steep banks, map edge.
 * District/road/plot clearing happens later in `filterScenery` because those
 * change mid-run.
 */
export function buildStaticScenery(
  seedRaw: string,
  terrain: TerrainData | undefined,
): SceneryStatic {
  const key = `scenery:${seedRaw}`;
  const trees: TreeInstance[] = [];
  const bushes: SceneryInstance[] = [];
  const rocks: SceneryInstance[] = [];

  // Two directional sine bands make the forest clump (same trick as the
  // terrain octaves, independent stream).
  const a1 = hashFloat(key, 1) * Math.PI * 2;
  const wl1 = 42 + hashFloat(key, 2) * 30; // 42..72
  const a2 = hashFloat(key, 3) * Math.PI * 2;
  const wl2 = 17 + hashFloat(key, 4) * 13; // 17..30
  const k1x = (Math.cos(a1) * Math.PI * 2) / wl1;
  const k1z = (Math.sin(a1) * Math.PI * 2) / wl1;
  const k2x = (Math.cos(a2) * Math.PI * 2) / wl2;
  const k2z = (Math.sin(a2) * Math.PI * 2) / wl2;
  const p1 = hashFloat(key, 5) * Math.PI * 2;
  const p2 = hashFloat(key, 6) * Math.PI * 2;
  const clumpNoise = (x: number, z: number) =>
    Math.sin(x * k1x + z * k1z + p1) * 0.62 + Math.sin(x * k2x + z * k2z + p2) * 0.38;

  const bound = (terrain?.size ?? 160) * 0.95;
  const halfRiver = (terrain?.river.width ?? 8) / 2;
  const step = 3.0;
  const cells = Math.ceil((bound * 2) / step);

  for (let iz = 0; iz < cells; iz++) {
    for (let ix = 0; ix < cells; ix++) {
      const base = (iz * 4096 + ix) * 16;
      const x = -bound + (ix + 0.5) * step + (hashFloat(key, base + 1) - 0.5) * step * 0.9;
      const z = -bound + (iz + 0.5) * step + (hashFloat(key, base + 2) - 0.5) * step * 0.9;
      if (Math.hypot(x, z) > bound) continue;

      const dRiver = riverDistanceAt(terrain, x, z);
      const h = terrainHeightAt(terrain, x, z);
      const roll = hashFloat(key, base + 3);

      // Riverbank band: only the occasional rock or scrubby bush, never trees
      // (the carve zone is steep + sandy).
      if (dRiver < halfRiver * 2.2) {
        if (dRiver > halfRiver * 1.05 && h > WATER_LEVEL + 0.08 && roll < 0.22) {
          const item: SceneryInstance = {
            x,
            z,
            y: h,
            s: 0.35 + hashFloat(key, base + 4) * 0.5,
            rot: hashFloat(key, base + 5) * Math.PI * 2,
            tint: hashFloat(key, base + 6),
          };
          if (roll < 0.13) rocks.push(item);
          else bushes.push(item);
        }
        continue;
      }
      if (h <= WATER_LEVEL + 0.15) continue;

      // Forest density 0..1 from the clump noise. Generous: the references
      // are *dense* — open meadow is the exception, not the default.
      const forest = smoothstep(-0.38, 0.42, clumpNoise(x, z));

      if (roll < forest * 0.92) {
        if (terrainSlopeAt(terrain, x, z) > 0.5) continue;
        // Variant mix shifts with density: conifers dominate deep woods,
        // broadleaf takes the fringes, poplars are scattered accents.
        const v = hashFloat(key, base + 7);
        const variant: TreeVariant =
          v < 0.12 ? 2 : v < (forest > 0.6 ? 0.42 : 0.62) ? 1 : 0;
        trees.push({
          x,
          z,
          y: h,
          s: 0.8 + hashFloat(key, base + 8) * 0.8,
          rot: hashFloat(key, base + 9) * Math.PI * 2,
          tint: hashFloat(key, base + 10),
          variant,
        });
      } else if (roll < forest * 0.92 + 0.05) {
        bushes.push({
          x,
          z,
          y: h,
          s: 0.5 + hashFloat(key, base + 11) * 0.6,
          rot: hashFloat(key, base + 12) * Math.PI * 2,
          tint: hashFloat(key, base + 13),
        });
      } else if (roll < forest * 0.92 + 0.072) {
        rocks.push({
          x,
          z,
          y: h,
          s: 0.45 + hashFloat(key, base + 14) * 0.75,
          rot: hashFloat(key, base + 15) * Math.PI * 2,
          tint: hashFloat(key, base + 13),
        });
      }
    }
  }

  return {
    trees: trees.slice(0, 5600),
    bushes: bushes.slice(0, 1100),
    rocks: rocks.slice(0, 650),
  };
}

// ----- Farm plots ----------------------------------------------------------------

/** Largest reach of a plot from its center (for clearing trees around it). */
export function plotClearance(plot: FieldPlot): number {
  return Math.hypot(plot.halfW, plot.halfD) + 0.8;
}

/**
 * Plan every district's farm plots: small rectangles in the annulus just
 * outside the building footprint, oriented loosely toward town. Deterministic
 * per district id. Visibility is staged by development (see `FieldPlot`), so
 * fields ring young districts and give way as they urbanize.
 */
export function buildFieldPlots(
  city: City,
  roadPolylines: { x: number; z: number }[][],
): FieldPlot[] {
  const terrain = city.terrain;
  const halfRiver = (terrain?.river.width ?? 8) / 2;
  const out: FieldPlot[] = [];

  for (const d of city.districts) {
    const key = `fields:${d.id}`;
    const want = 2 + Math.floor(hashFloat(key, 0) * 3.99); // 2..5 plots
    const placed: FieldPlot[] = [];
    for (let i = 0; i < want; i++) {
      for (let attempt = 0; attempt < 10; attempt++) {
        const salt = i * 40 + attempt * 4;
        const angle = hashFloat(key, salt + 1) * Math.PI * 2;
        const dist = d.radius * (1.18 + hashFloat(key, salt + 2) * 0.45);
        const x = d.position.x + Math.cos(angle) * dist;
        const z = d.position.z + Math.sin(angle) * dist;
        const halfW = 1.8 + hashFloat(key, salt + 3) * 1.5;
        const halfD = 1.4 + hashFloat(key, salt + 4) * 1.2;
        const reach = Math.hypot(halfW, halfD);

        const h = terrainHeightAt(terrain, x, z);
        if (h <= WATER_LEVEL + 0.2) continue;
        if (riverDistanceAt(terrain, x, z) < halfRiver * 1.9 + reach) continue;
        if (terrainSlopeAt(terrain, x, z) > 0.22) continue;
        if (nearPolylines(roadPolylines, x, z, reach + 2.2)) continue;
        // Stay out of every district footprint (including the home one).
        if (
          city.districts.some(
            (o) => Math.hypot(x - o.position.x, z - o.position.z) < o.radius * 1.08 + reach * 0.5,
          )
        ) {
          continue;
        }
        // Don't stack plots on each other.
        if (placed.some((p) => Math.hypot(x - p.x, z - p.z) < reach + Math.hypot(p.halfW, p.halfD))) {
          continue;
        }

        placed.push({
          x,
          z,
          y: h,
          halfW,
          halfD,
          // Face town, with a little shear so the patchwork stays organic.
          rot: Math.atan2(d.position.x - x, d.position.z - z) + (hashFloat(key, salt + 5) - 0.5) * 0.6,
          tint: hashFloat(key, salt + 6),
          showFrom: 0.02 + hashFloat(key, salt + 7) * 0.1,
          hideAt: 0.5 + hashFloat(key, salt + 8) * 0.38,
          districtId: d.id,
        });
        break;
      }
    }
    out.push(...placed);
  }
  return out;
}

// ----- Flower patches ----------------------------------------------------------------

/** District types that grow wildflower patches around their edges. */
const FLOWER_DISTRICTS = new Set(['garden', 'festival']);

/**
 * Wildflower patches hugging garden/festival district edges: a few cluster
 * centers, each scattering a handful of blooms. Staged lightly by development
 * so they arrive with the district's first growth spurt.
 */
export function buildFlowerPatches(city: City): FlowerInstance[] {
  const terrain = city.terrain;
  const halfRiver = (terrain?.river.width ?? 8) / 2;
  const out: FlowerInstance[] = [];

  for (const d of city.districts) {
    if (!FLOWER_DISTRICTS.has(d.type)) continue;
    const key = `flowers:${d.id}`;
    const patches = 2 + Math.floor(hashFloat(key, 0) * 2); // 2..3
    for (let p = 0; p < patches; p++) {
      const angle = hashFloat(key, p * 50 + 1) * Math.PI * 2;
      const dist = d.radius * (1.05 + hashFloat(key, p * 50 + 2) * 0.3);
      const cx = d.position.x + Math.cos(angle) * dist;
      const cz = d.position.z + Math.sin(angle) * dist;
      if (riverDistanceAt(terrain, cx, cz) < halfRiver * 1.9 + 2) continue;
      const blooms = 9 + Math.floor(hashFloat(key, p * 50 + 3) * 8);
      const showFrom = 0.04 + hashFloat(key, p * 50 + 4) * 0.12;
      for (let b = 0; b < blooms; b++) {
        const salt = p * 50 + 5 + b * 4;
        const a = hashFloat(key, salt) * Math.PI * 2;
        const r = Math.sqrt(hashFloat(key, salt + 1)) * 2.2;
        const x = cx + Math.cos(a) * r;
        const z = cz + Math.sin(a) * r;
        const h = terrainHeightAt(terrain, x, z);
        if (h <= WATER_LEVEL + 0.15) continue;
        out.push({
          x,
          z,
          y: h,
          s: 0.7 + hashFloat(key, salt + 2) * 0.6,
          rot: hashFloat(key, salt + 3) * Math.PI * 2,
          tint: hashFloat(key, salt + 3),
          showFrom,
          districtId: d.id,
        });
      }
    }
  }
  return out.slice(0, 400);
}

// ----- Dynamic filter -------------------------------------------------------------------

export interface SceneryVisible {
  trees: TreeInstance[];
  bushes: SceneryInstance[];
  rocks: SceneryInstance[];
  plots: FieldPlot[];
  flowers: FlowerInstance[];
}

/**
 * The dynamic clearing pass: drop static candidates inside district clearings
 * (which grow with development — the forest recedes as the city matures),
 * along roads, and under farm plots; stage plots/flowers by development.
 * Re-run when districts/roads change or quantized development moves.
 */
export function filterScenery(
  statics: SceneryStatic,
  plots: FieldPlot[],
  flowers: FlowerInstance[],
  city: City,
  roadPolylines: { x: number; z: number }[][],
): SceneryVisible {
  const clearings = city.districts.map((d) => ({
    x: d.position.x,
    z: d.position.z,
    r: clearingRadius(d),
  }));
  const devOf = new Map(city.districts.map((d) => [d.id, d.development / 100]));

  const clearOf = (x: number, z: number, shrink: number): boolean => {
    for (const c of clearings) {
      if (Math.hypot(x - c.x, z - c.z) < c.r - shrink) return true;
    }
    return false;
  };
  // Plots suppress scenery whether currently visible or not, so trees don't
  // pop in and out as a district's development crosses plot thresholds.
  const onPlot = (x: number, z: number): boolean =>
    plots.some((p) => Math.hypot(x - p.x, z - p.z) < plotClearance(p));

  const visiblePlot = (p: FieldPlot): boolean => {
    const dev = devOf.get(p.districtId) ?? 0;
    return dev >= p.showFrom && dev < p.hideAt;
  };

  return {
    trees: statics.trees.filter(
      (t) =>
        !clearOf(t.x, t.z, 0) &&
        !nearPolylines(roadPolylines, t.x, t.z, 3.2) &&
        !onPlot(t.x, t.z),
    ),
    // Bushes and rocks may hug the town edge a little closer than trees.
    bushes: statics.bushes.filter(
      (b) =>
        !clearOf(b.x, b.z, 1.2) &&
        !nearPolylines(roadPolylines, b.x, b.z, 2.6) &&
        !onPlot(b.x, b.z),
    ),
    rocks: statics.rocks.filter(
      (r) =>
        !clearOf(r.x, r.z, 1.2) &&
        !nearPolylines(roadPolylines, r.x, r.z, 2.6) &&
        !onPlot(r.x, r.z),
    ),
    plots: plots.filter(visiblePlot),
    flowers: flowers.filter((f) => (devOf.get(f.districtId) ?? 0) >= f.showFrom),
  };
}

// ----- Intra-district path spokes ------------------------------------------------------

/**
 * Light dirt-path spokes radiating from a district's heart, so building
 * clusters read as neighborhoods. Deterministic per district id. Returns
 * sampled 2D polylines; the renderer ribbons them over the terrain and
 * buildings orient toward them (plus the through-roads).
 */
export function districtPathSpokes(district: District): { x: number; z: number }[][] {
  const key = `paths:${district.id}`;
  const count = 2 + Math.floor(hashFloat(key, 0) * 2.99); // 2..4 spokes
  const baseAngle = hashFloat(key, 1) * Math.PI * 2;
  const spokes: { x: number; z: number }[][] = [];

  for (let i = 0; i < count; i++) {
    const angle =
      baseAngle + (i / count) * Math.PI * 2 + (hashFloat(key, i * 8 + 2) - 0.5) * 0.9;
    const len = district.radius * (0.55 + hashFloat(key, i * 8 + 3) * 0.3);
    // Gentle lateral curve so the spokes don't read as a starburst.
    const bow = (hashFloat(key, i * 8 + 4) - 0.5) * 3.2;
    const dirX = Math.cos(angle);
    const dirZ = Math.sin(angle);
    const perpX = -dirZ;
    const perpZ = dirX;

    const pts: { x: number; z: number }[] = [];
    const steps = Math.max(4, Math.round(len / 1.6));
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const r = 1.2 + t * (len - 1.2);
      const lateral = bow * Math.sin(t * Math.PI);
      pts.push({
        x: district.position.x + dirX * r + perpX * lateral,
        z: district.position.z + dirZ * r + perpZ * lateral,
      });
    }
    spokes.push(pts);
  }
  return spokes;
}

/** Max jitter (radians) applied to a building's path-facing rotation. */
export const FACING_JITTER = 0.25;
/** Beyond this distance from any path point, buildings face the district heart. */
export const FACING_RANGE = 9;

/**
 * Everything a building can orient toward: the district's spoke samples plus
 * the through-road centerline points inside its footprint (the same bowed
 * curve the road ribbons use, via `roadCurve`).
 */
export function districtPathTargets(
  district: District,
  districts: District[],
  roads: Road[],
): { x: number; z: number }[] {
  const pts: { x: number; z: number }[] = districtPathSpokes(district).flat();
  const byId = new Map(districts.map((d) => [d.id, d]));
  for (const road of roads) {
    if (road.from !== district.id && road.to !== district.id) continue;
    const a = byId.get(road.from);
    const b = byId.get(road.to);
    if (!a || !b) continue;
    const { start, control, end } = roadCurve(a.position, b.position);
    const len = Math.hypot(end.x - start.x, end.z - start.z);
    const n = Math.max(6, Math.round(len / 2.5));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const u = 1 - t;
      const x = u * u * start.x + 2 * u * t * control.x + t * t * end.x;
      const z = u * u * start.z + 2 * u * t * control.z + t * t * end.z;
      if (
        Math.hypot(x - district.position.x, z - district.position.z) <=
        district.radius * 1.05
      ) {
        pts.push({ x, z });
      }
    }
  }
  return pts;
}

/**
 * Y rotation per building id: face the nearest path/road point (doors are on
 * local +Z), with hash jitter so the neighborhood stays organic; buildings far
 * from any path face the district heart instead.
 */
export function buildingFacings(
  district: District,
  targets: { x: number; z: number }[],
): Map<string, number> {
  const out = new Map<string, number>();
  for (const b of district.buildings) {
    let tx = district.position.x;
    let tz = district.position.z;
    let best = Infinity;
    for (const p of targets) {
      const dx = p.x - b.position.x;
      const dz = p.z - b.position.z;
      const dSq = dx * dx + dz * dz;
      if (dSq < best) {
        best = dSq;
        tx = p.x;
        tz = p.z;
      }
    }
    if (best > FACING_RANGE * FACING_RANGE) {
      tx = district.position.x;
      tz = district.position.z;
    }
    const jitter = (hashFloat(b.id, 61) - 0.5) * 2 * FACING_JITTER;
    out.set(b.id, Math.atan2(tx - b.position.x, tz - b.position.z) + jitter);
  }
  return out;
}
