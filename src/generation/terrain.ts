import type { TerrainData, TerrainOctave } from '../types';
import { Rng, hashSeed } from '../utils/rng';
import { clamp, lerp } from '../utils/math';

// ---------------------------------------------------------------------------
// Terrain — the generated landscape the whole world sits on.
//
// `generateTerrain` produces plain serializable data (stored as `city.terrain`)
// from its own seeded sub-stream (`hash(seed + ':terrain')`), so it never
// perturbs the main generation RNG sequence. `terrainHeightAt` is the single
// source of truth for ground height: building placement, road ribbons,
// citizens and scenery all query it — no renderer-side duplication.
//
// Shape of the land: a few low-frequency sine octaves (gentle rolling hills,
// ~3-6 units of total variation), faded down toward the map edge, flattened
// into subtle plateaus under district sites, with a meandering river carved
// below grade across the whole map.
// ---------------------------------------------------------------------------

/** Water surface height of the river (world units). */
export const WATER_LEVEL = -0.5;
/** Bottom of the carved river channel. */
export const RIVER_BED = -1.5;
/** Lowest interior land height — meadow pans never dip underwater. */
const LAND_FLOOR = 0.45;
/** Height the land relaxes toward at the map edge (meets the backdrop). */
const EDGE_HEIGHT = 0.3;
/**
 * Minimum road deck height. Roads ride `max(terrain, BRIDGE_DECK)`, which is
 * what turns a river crossing into a bridge instead of a dip underwater.
 */
export const BRIDGE_DECK = 0.55;

/** The largest district radius the generator ever rolls (placement margin). */
export const MAX_DISTRICT_RADIUS = 14;

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Generate the deterministic terrain for a seed (its own sub-stream). */
export function generateTerrain(seedRaw: string): TerrainData {
  const rng = new Rng(hashSeed(`${seedRaw}:terrain`));
  const size = 175;

  // ----- Heightfield octaves: 3 directional sine waves, big to small --------
  const octaves: TerrainOctave[] = [];
  const amps = [rng.range(1.3, 1.9), rng.range(0.7, 1.1), rng.range(0.35, 0.6)];
  const wavelengths = [rng.range(110, 160), rng.range(55, 80), rng.range(26, 40)];
  for (let i = 0; i < amps.length; i++) {
    const angle = rng.range(0, Math.PI * 2);
    const k = (Math.PI * 2) / wavelengths[i];
    octaves.push({
      ax: Math.cos(angle) * k,
      az: Math.sin(angle) * k,
      phase: rng.range(0, Math.PI * 2),
      amp: amps[i],
    });
  }
  const baseHeight = rng.range(1.4, 2.0);

  // ----- River: a meandering line crossing the whole map --------------------
  // Centerline = dir * s + perp * (offsetBase + meander(s)). The base offset
  // is chosen so the channel always keeps clear of the origin, where the
  // founding district (old town) prefers to sit.
  const angle = rng.range(0, Math.PI * 2);
  const dirX = Math.cos(angle);
  const dirZ = Math.sin(angle);
  const perpX = -dirZ;
  const perpZ = dirX;

  const amp1 = rng.range(10, 22);
  const wl1 = rng.range(90, 150);
  const phase1 = rng.range(0, Math.PI * 2);
  const amp2 = rng.range(4, 9);
  const wl2 = rng.range(36, 70);
  const phase2 = rng.range(0, Math.PI * 2);
  const meander = (s: number) =>
    amp1 * Math.sin((s / wl1) * Math.PI * 2 + phase1) +
    amp2 * Math.sin((s / wl2) * Math.PI * 2 + phase2);

  const side = rng.chance(0.5) ? 1 : -1;
  const clearance = rng.range(34, 60);
  const offsetBase = side * clearance - meander(0);

  const points: { x: number; z: number }[] = [];
  const reach = size * 1.45; // extend past the edge so the river exits the map
  const step = 12;
  for (let s = -reach; s <= reach + 0.001; s += step) {
    const off = offsetBase + meander(s);
    points.push({ x: dirX * s + perpX * off, z: dirZ * s + perpZ * off });
  }

  return {
    size,
    baseHeight,
    octaves,
    river: { points, width: rng.range(7, 10) },
    flats: [],
  };
}

/**
 * Distance from (x, z) to the river centerline polyline. Returns Infinity for
 * missing terrain so "far from any river" falls out naturally.
 */
export function riverDistanceAt(
  terrain: TerrainData | undefined,
  x: number,
  z: number,
): number {
  if (!terrain || terrain.river.points.length < 2) return Infinity;
  const pts = terrain.river.points;
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const abx = b.x - a.x;
    const abz = b.z - a.z;
    const lenSq = abx * abx + abz * abz || 1;
    let t = ((x - a.x) * abx + (z - a.z) * abz) / lenSq;
    t = clamp(t, 0, 1);
    const dx = x - (a.x + abx * t);
    const dz = z - (a.z + abz * t);
    const d = dx * dx + dz * dz;
    if (d < best) best = d;
  }
  return Math.sqrt(best);
}

/**
 * Ground height at (x, z) — THE height query everything uses (placement,
 * roads, citizens, scenery, meshes). Pure, deterministic, renderer-free.
 * Returns 0 when terrain is absent (older in-memory states render flat).
 */
export function terrainHeightAt(
  terrain: TerrainData | undefined,
  x: number,
  z: number,
): number {
  if (!terrain) return 0;

  // Rolling hills.
  let h = terrain.baseHeight;
  for (const o of terrain.octaves) {
    h += o.amp * Math.sin(x * o.ax + z * o.az + o.phase);
  }
  if (h < LAND_FLOOR) h = LAND_FLOOR;

  // Fade toward the map edge so the terrain meets the backdrop plain.
  const r = Math.hypot(x, z);
  const edge = smoothstep(terrain.size * 0.72, terrain.size * 0.98, r);
  if (edge > 0) h = lerp(h, EDGE_HEIGHT, edge);

  // District plateaus (fully flat inside radius, blended back out by 1.8x).
  for (const f of terrain.flats) {
    const d = Math.hypot(x - f.x, z - f.z);
    if (d < f.radius * 1.8) {
      const t = 1 - smoothstep(f.radius, f.radius * 1.8, d);
      h = lerp(h, f.height, t);
    }
  }

  // River carve wins over everything: channel at bed depth, banks blending
  // back up to grade. The water surface (WATER_LEVEL) crosses the bank slope
  // right around the channel half-width, so the river reads its stated width.
  const halfW = terrain.river.width / 2;
  const dRiver = riverDistanceAt(terrain, x, z);
  if (dRiver < halfW * 1.9) {
    const carve = 1 - smoothstep(halfW * 0.55, halfW * 1.9, dRiver);
    h = lerp(h, RIVER_BED, carve);
  }

  return h;
}

/** Approximate slope (rise per unit run) at (x, z), by finite differences. */
export function terrainSlopeAt(
  terrain: TerrainData | undefined,
  x: number,
  z: number,
): number {
  if (!terrain) return 0;
  const d = 2;
  const hx = terrainHeightAt(terrain, x + d, z) - terrainHeightAt(terrain, x - d, z);
  const hz = terrainHeightAt(terrain, x, z + d) - terrainHeightAt(terrain, x, z - d);
  return Math.hypot(hx, hz) / (2 * d);
}

/**
 * Height of a road deck at (x, z): the terrain, but never below the bridge
 * deck — so roads crossing the river become bridges instead of diving in.
 * Shared by the road ribbon renderer and everything that rides roads (carts).
 */
export function roadSurfaceHeightAt(
  terrain: TerrainData | undefined,
  x: number,
  z: number,
): number {
  return Math.max(terrainHeightAt(terrain, x, z), BRIDGE_DECK);
}

/**
 * Unit direction from (x, z) toward the nearest point on the river, or null
 * when there is no terrain. Used to aim docks/fishing toward the water.
 */
export function riverDirectionFrom(
  terrain: TerrainData | undefined,
  x: number,
  z: number,
): { x: number; z: number } | null {
  if (!terrain || terrain.river.points.length === 0) return null;
  let best = Infinity;
  let bx = 0;
  let bz = 0;
  for (const p of terrain.river.points) {
    const d = (p.x - x) * (p.x - x) + (p.z - z) * (p.z - z);
    if (d < best) {
      best = d;
      bx = p.x;
      bz = p.z;
    }
  }
  const len = Math.sqrt(best) || 1;
  return { x: (bx - x) / len, z: (bz - z) / len };
}

/**
 * Record a district plateau so the site sits level. Sampled from the current
 * terrain (including earlier flats), clamped safely above the water line.
 * Called in founding order, so it is deterministic for a given seed + inputs.
 */
export function addDistrictFlat(
  terrain: TerrainData | undefined,
  position: { x: number; z: number },
  radius: number,
): void {
  if (!terrain) return;
  const height = clamp(terrainHeightAt(terrain, position.x, position.z), 0.6, 6);
  terrain.flats.push({ x: position.x, z: position.z, radius, height });
}

/**
 * Whether a district of `radius` centred at `position` sits on buildable land:
 * inside the map, off the river channel and its banks, and not on a steep
 * patch. Shared by the initial generator and mid-run expansion.
 */
export function isDistrictSiteOnLand(
  terrain: TerrainData,
  position: { x: number; z: number },
  radius: number,
): boolean {
  if (Math.hypot(position.x, position.z) > terrain.size * 0.88) return false;
  if (terrainSlopeAt(terrain, position.x, position.z) > 0.32) return false;
  // The whole footprint must clear the carve zone (banks included).
  return (
    riverDistanceAt(terrain, position.x, position.z) >=
    radius + terrain.river.width * 0.95 + 2
  );
}

/**
 * Whether the site *hugs* the river — close enough that the district's edge
 * runs down to the waterline (harbors), without flooding its buildings.
 */
export function isDistrictSiteRiverside(
  terrain: TerrainData,
  position: { x: number; z: number },
  radius: number,
): boolean {
  if (Math.hypot(position.x, position.z) > terrain.size * 0.88) return false;
  const d = riverDistanceAt(terrain, position.x, position.z);
  const min = radius + terrain.river.width * 0.55;
  return d >= min && d <= min + 11;
}
