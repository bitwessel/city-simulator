import { describe, expect, it } from 'vitest';
import type { City } from '../src/types';
import {
  RIVER_BED,
  WATER_LEVEL,
  generateTerrain,
  riverDistanceAt,
  terrainHeightAt,
  terrainSlopeAt,
} from '../src/generation/terrain';
import { generateCity } from '../src/generation/generator';
import { simulateDay } from '../src/simulation/engine';
import { freshCity } from './helpers';

/** Drive a city under expansion-friendly pressure (mirrors engine tests). */
function growWithPressure(seed: string, days: number): City {
  let city = freshCity(seed);
  for (let i = 0; i < days; i++) {
    if (city.outcome) break;
    city.stats.happiness = 66;
    city.stats.wealth = 68;
    city.stats.infrastructure = 62;
    city.stats.food = 62;
    city.stats.chaos = 24;
    city.stats.housing = 42;
    city = simulateDay(city, { suppressEvents: true }).city;
  }
  return city;
}

describe('terrain generation', () => {
  it('is deterministic: same seed produces identical terrain', () => {
    const a = generateTerrain('emberwick-42');
    const b = generateTerrain('emberwick-42');
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));

    // And the city carries it.
    const cityA = generateCity('emberwick-42');
    const cityB = generateCity('emberwick-42');
    expect(JSON.stringify(cityA.terrain)).toBe(JSON.stringify(cityB.terrain));
  });

  it('different seeds produce meaningfully different rivers and heightfields', () => {
    const seeds = ['alpha', 'bravo', 'charlie', 'delta', 'echo'];
    const terrains = seeds.map((s) => generateTerrain(s));

    // River courses differ (compare a few sampled control points).
    const riverSignatures = new Set(
      terrains.map((t) =>
        t.river.points
          .slice(0, 5)
          .map((p) => `${Math.round(p.x)},${Math.round(p.z)}`)
          .join('|'),
      ),
    );
    expect(riverSignatures.size).toBe(seeds.length);

    // Heightfields differ at fixed sample points.
    const heightSignatures = new Set(
      terrains.map((t) =>
        [terrainHeightAt(t, 30, 30), terrainHeightAt(t, -50, 20), terrainHeightAt(t, 10, -60)]
          .map((h) => h.toFixed(3))
          .join('|'),
      ),
    );
    expect(heightSignatures.size).toBeGreaterThan(3);
  });

  it('produces gentle rolling hills within the documented bounds', () => {
    for (const seed of ['hills-1', 'hills-2', 'hills-3']) {
      const t = generateTerrain(seed);
      let min = Infinity;
      let max = -Infinity;
      for (let x = -160; x <= 160; x += 8) {
        for (let z = -160; z <= 160; z += 8) {
          const h = terrainHeightAt(t, x, z);
          min = Math.min(min, h);
          max = Math.max(max, h);
          expect(h).toBeGreaterThanOrEqual(RIVER_BED - 0.01);
          expect(h).toBeLessThanOrEqual(7);
        }
      }
      // Some variation (hills exist), nothing dramatic (max ~3-6 units).
      expect(max - min).toBeGreaterThanOrEqual(2);
      expect(max - min).toBeLessThanOrEqual(8);
    }
  });

  it('carves the river channel below the water line', () => {
    for (const seed of ['river-1', 'river-2', 'river-3']) {
      const t = generateTerrain(seed);
      const interior = t.river.points.filter(
        (p) => Math.hypot(p.x, p.z) < t.size * 0.7,
      );
      expect(interior.length).toBeGreaterThan(3);
      for (const p of interior) {
        expect(terrainHeightAt(t, p.x, p.z)).toBeLessThan(WATER_LEVEL);
      }
    }
  });

  it('height query is continuous (no jumps; river banks are the steepest)', () => {
    const t = generateTerrain('continuity');
    for (let x = -120; x <= 120; x += 3.7) {
      for (let z = -120; z <= 120; z += 3.7) {
        const h0 = terrainHeightAt(t, x, z);
        const h1 = terrainHeightAt(t, x + 0.5, z);
        // Banks slope by design (~50 degrees at the carve's steepest point);
        // anything sharper than that over half a unit would be a real seam.
        expect(Math.abs(h1 - h0)).toBeLessThan(1.0);
      }
    }
  });
});

describe('terrain-aware city generation', () => {
  it('keeps district sites on buildable land (harbors may hug the bank)', () => {
    for (let i = 0; i < 30; i++) {
      const city = generateCity(`site-${i}`);
      const terrain = city.terrain!;
      expect(terrain).toBeDefined();
      const halfW = terrain.river.width / 2;
      for (const d of city.districts) {
        const dRiver = riverDistanceAt(terrain, d.position.x, d.position.z);
        if (d.type === 'harbor') {
          // Hugging the river but with every building above the waterline.
          expect(dRiver).toBeGreaterThanOrEqual(d.radius + halfW - 1e-6);
        } else {
          // Whole footprint clear of the channel + banks.
          expect(dRiver).toBeGreaterThanOrEqual(d.radius + halfW * 1.9 - 1e-6);
        }
        // Sites avoid steep patches (plateau flats level them anyway).
        expect(terrainSlopeAt(terrain, d.position.x, d.position.z)).toBeLessThan(0.45);
      }
    }
  });

  it('never places a building underwater', () => {
    for (let i = 0; i < 20; i++) {
      const city = generateCity(`dry-${i}`);
      for (const d of city.districts) {
        for (const b of d.buildings) {
          const h = terrainHeightAt(city.terrain, b.position.x, b.position.z);
          expect(h, `${b.id} in ${d.type}`).toBeGreaterThan(WATER_LEVEL);
        }
      }
    }
  });

  it('records one plateau flat per district, at the district center', () => {
    const city = generateCity('flats-test');
    const terrain = city.terrain!;
    expect(terrain.flats.length).toBe(city.districts.length);
    city.districts.forEach((d, i) => {
      expect(terrain.flats[i].x).toBe(d.position.x);
      expect(terrain.flats[i].z).toBe(d.position.z);
      expect(terrain.flats[i].height).toBeGreaterThan(WATER_LEVEL);
    });
  });

  it('mid-run founded districts follow the same terrain rules', () => {
    for (const seed of ['grow-1', 'grow-2']) {
      const city = growWithPressure(seed, 250);
      const terrain = city.terrain!;
      const halfW = terrain.river.width / 2;
      // A flat exists for every district, including founded ones.
      expect(terrain.flats.length).toBe(city.districts.length);
      for (const d of city.districts) {
        const dRiver = riverDistanceAt(terrain, d.position.x, d.position.z);
        expect(dRiver, `${d.id} (${d.type})`).toBeGreaterThanOrEqual(
          d.radius + halfW - 1e-6,
        );
        for (const b of d.buildings) {
          const h = terrainHeightAt(terrain, b.position.x, b.position.z);
          expect(h, `${b.id} in ${d.type}`).toBeGreaterThan(WATER_LEVEL);
        }
      }
    }
  });

  it('terrain stays serializable plain data through simulation', () => {
    let city = freshCity('serialize-terrain');
    for (let i = 0; i < 5; i++) {
      city = simulateDay(city, { suppressEvents: true }).city;
    }
    const roundTripped = JSON.parse(JSON.stringify(city)) as City;
    expect(roundTripped.terrain).toEqual(city.terrain);
  });
});
