import { describe, expect, it } from 'vitest';
import { generateCity } from '../src/generation/generator';
import { riverDistanceAt, terrainHeightAt, WATER_LEVEL } from '../src/generation/terrain';
import {
  FACING_JITTER,
  FACING_RANGE,
  buildFieldPlots,
  buildFlowerPatches,
  buildRoadPolylines,
  buildStaticScenery,
  buildingFacings,
  clearingRadius,
  districtPathSpokes,
  districtPathTargets,
  filterScenery,
  plotClearance,
} from '../src/rendering/sceneryLayout';
import type { City } from '../src/types';

// ---------------------------------------------------------------------------
// Scenery placement (milestone B): the instanced layer that fills the negative
// space must be deterministic from the seed and must respect the world —
// no trees in the river, on roads, inside district clearings, or under farm
// plots; plots and flowers stay on dry land outside the building footprint.
// ---------------------------------------------------------------------------

function sceneryFor(city: City) {
  const statics = buildStaticScenery(city.seed.raw, city.terrain);
  const roads = buildRoadPolylines(city);
  const plots = buildFieldPlots(city, roads);
  const flowers = buildFlowerPatches(city);
  return { statics, roads, plots, flowers, visible: filterScenery(statics, plots, flowers, city, roads) };
}

describe('scenery placement', () => {
  it('is deterministic: same seed produces identical scenery', () => {
    const a = sceneryFor(generateCity('glimmershore-7'));
    const b = sceneryFor(generateCity('glimmershore-7'));
    expect(JSON.stringify(a.statics)).toBe(JSON.stringify(b.statics));
    expect(JSON.stringify(a.plots)).toBe(JSON.stringify(b.plots));
    expect(JSON.stringify(a.flowers)).toBe(JSON.stringify(b.flowers));
    expect(JSON.stringify(a.visible)).toBe(JSON.stringify(b.visible));
  });

  it('different seeds produce meaningfully different forests', () => {
    const seeds = ['alpha', 'bravo', 'charlie'];
    const signatures = new Set(
      seeds.map((s) => {
        const city = generateCity(s);
        const { statics } = sceneryFor(city);
        return statics.trees
          .slice(0, 8)
          .map((t) => `${Math.round(t.x)},${Math.round(t.z)},${t.variant}`)
          .join('|');
      }),
    );
    expect(signatures.size).toBe(seeds.length);
  });

  it('grows a substantial forest with all three tree variants', () => {
    for (const seed of ['woods-1', 'woods-2', 'woods-3']) {
      const { statics } = sceneryFor(generateCity(seed));
      expect(statics.trees.length).toBeGreaterThan(800);
      const variants = new Set(statics.trees.map((t) => t.variant));
      expect(variants.size).toBe(3);
      expect(statics.bushes.length).toBeGreaterThan(40);
      expect(statics.rocks.length).toBeGreaterThan(20);
    }
  });

  it('keeps trees out of the river, off roads, and out of district clearings', () => {
    for (const seed of ['clear-1', 'clear-2', 'clear-3']) {
      const city = generateCity(seed);
      const terrain = city.terrain!;
      const halfW = terrain.river.width / 2;
      const { roads, visible } = sceneryFor(city);

      // One expect per category (per-pair expects would be ~375k calls).
      const violations: string[] = [];
      for (const t of visible.trees) {
        if (terrainHeightAt(terrain, t.x, t.z) <= WATER_LEVEL) {
          violations.push(`underwater tree at ${t.x},${t.z}`);
        }
        if (riverDistanceAt(terrain, t.x, t.z) <= halfW * 1.05) {
          violations.push(`tree in river channel at ${t.x},${t.z}`);
        }
        for (const d of city.districts) {
          const dist = Math.hypot(t.x - d.position.x, t.z - d.position.z);
          if (dist < clearingRadius(d)) violations.push(`tree inside ${d.id}`);
        }
        for (const pts of roads) {
          for (const p of pts) {
            if (Math.hypot(t.x - p.x, t.z - p.z) < 3.2 - 1e-9) {
              violations.push(`tree on road at ${t.x},${t.z}`);
              break;
            }
          }
        }
      }
      expect(violations, `${seed}: ${violations.slice(0, 5).join('; ')}`).toHaveLength(0);
    }
  });

  it('the forest recedes as districts develop', () => {
    const city = generateCity('recede-1');
    const { statics, roads, plots, flowers } = sceneryFor(city);
    const before = filterScenery(statics, plots, flowers, city, roads).trees.length;
    for (const d of city.districts) d.development = 95;
    const after = filterScenery(statics, plots, flowers, city, roads).trees.length;
    expect(after).toBeLessThan(before);
  });

  it('plants farm plots outside the district footprint, on dry flat land', () => {
    for (const seed of ['farm-1', 'farm-2']) {
      const city = generateCity(seed);
      const terrain = city.terrain!;
      const { plots } = sceneryFor(city);
      expect(plots.length).toBeGreaterThan(0);
      for (const p of plots) {
        expect(terrainHeightAt(terrain, p.x, p.z)).toBeGreaterThan(WATER_LEVEL);
        const home = city.districts.find((d) => d.id === p.districtId)!;
        const dist = Math.hypot(p.x - home.position.x, p.z - home.position.z);
        expect(dist).toBeGreaterThan(home.radius);
        expect(p.showFrom).toBeLessThan(p.hideAt);
      }
    }
  });

  it('stages fields by development: young districts farm, urban ones build over', () => {
    const city = generateCity('stage-1');
    const { statics, roads, plots, flowers } = sceneryFor(city);
    for (const d of city.districts) d.development = 8;
    const young = filterScenery(statics, plots, flowers, city, roads).plots;
    for (const d of city.districts) d.development = 99;
    const urban = filterScenery(statics, plots, flowers, city, roads).plots;
    expect(young.length).toBeGreaterThan(0);
    expect(urban.length).toBe(0);
  });

  it('never hides scenery under a farm plot (no popping as plots stage)', () => {
    const city = generateCity('plotclear-1');
    const { plots, visible } = sceneryFor(city);
    for (const t of visible.trees) {
      for (const p of plots) {
        expect(Math.hypot(t.x - p.x, t.z - p.z)).toBeGreaterThanOrEqual(plotClearance(p) - 1e-9);
      }
    }
  });

  it('gives each district 2-4 path spokes inside its footprint', () => {
    const city = generateCity('spokes-1');
    for (const d of city.districts) {
      const spokes = districtPathSpokes(d);
      expect(spokes.length).toBeGreaterThanOrEqual(2);
      expect(spokes.length).toBeLessThanOrEqual(4);
      for (const pts of spokes) {
        expect(pts.length).toBeGreaterThanOrEqual(4);
        for (const p of pts) {
          const dist = Math.hypot(p.x - d.position.x, p.z - d.position.z);
          expect(dist).toBeLessThanOrEqual(d.radius);
        }
      }
      // Deterministic per district id.
      expect(JSON.stringify(districtPathSpokes(d))).toBe(JSON.stringify(spokes));
    }
  });

  it('orients buildings toward the nearest path, within the jitter bound', () => {
    const city = generateCity('facing-1');
    for (const d of city.districts) {
      const targets = districtPathTargets(d, city.districts, city.roads);
      expect(targets.length).toBeGreaterThan(0);
      const facings = buildingFacings(d, targets);
      // Deterministic.
      expect(buildingFacings(d, targets)).toEqual(facings);

      for (const b of d.buildings) {
        const rot = facings.get(b.id)!;
        expect(rot).toBeTypeOf('number');
        // Recover the intended target: nearest path point, else the heart.
        let tx = d.position.x;
        let tz = d.position.z;
        let best = Infinity;
        for (const p of targets) {
          const dSq = (p.x - b.position.x) ** 2 + (p.z - b.position.z) ** 2;
          if (dSq < best) {
            best = dSq;
            tx = p.x;
            tz = p.z;
          }
        }
        if (best > FACING_RANGE * FACING_RANGE) {
          tx = d.position.x;
          tz = d.position.z;
        }
        const want = Math.atan2(tx - b.position.x, tz - b.position.z);
        let diff = Math.abs(rot - want) % (Math.PI * 2);
        if (diff > Math.PI) diff = Math.PI * 2 - diff;
        expect(diff).toBeLessThanOrEqual(FACING_JITTER + 1e-9);
      }
    }
  });
});
