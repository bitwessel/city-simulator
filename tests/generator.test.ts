import { describe, expect, it } from 'vitest';
import type { BuildingKind, DistrictType } from '../src/types';
import { generateCity } from '../src/generation/generator';
import { BOUNDED_STAT_KEYS } from '../src/types';
import { DISTRICT_ARCHETYPES } from '../src/generation/data/names';
import { distance } from '../src/utils/math';

// The tall "skyscraper era" kinds and their documented invariants.
const TALL_KINDS = new Set<BuildingKind>([
  'apartment',
  'grand-hall',
  'arcane-spire',
  'skyscraper',
]);
const TALL_MIN_APPEAR: Record<string, number> = {
  apartment: 0.7,
  'grand-hall': 0.74,
  'arcane-spire': 0.8,
  skyscraper: 0.82,
};
const TALL_FLOOR_RANGE: Record<string, [number, number]> = {
  apartment: [3, 5],
  'grand-hall': [4, 9],
  'arcane-spire': [6, 14],
  skyscraper: [6, 16],
};
const URBAN_TYPES = new Set<DistrictType>(
  DISTRICT_ARCHETYPES.filter((a) => a.urban).map((a) => a.type),
);
// Minimum building spacing the generator promises (slightly relaxed for FP).
const MIN_BUILDING_GAP = 2.6;

describe('procedural city generator', () => {
  it('produces an identical city for the same seed', () => {
    const a = generateCity('emberwick-42');
    const b = generateCity('emberwick-42');
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('produces meaningfully different cities for different seeds', () => {
    const seeds = ['alpha', 'bravo', 'charlie', 'delta', 'echo'];
    const cities = seeds.map((s) => generateCity(s));

    const names = new Set(cities.map((c) => c.name));
    expect(names.size).toBeGreaterThan(2);

    // District compositions should differ across seeds.
    const compositions = new Set(
      cities.map((c) =>
        c.districts
          .map((d) => d.type)
          .sort()
          .join(','),
      ),
    );
    expect(compositions.size).toBeGreaterThan(2);

    // Faction line-ups should differ too.
    const lineups = new Set(
      cities.map((c) =>
        c.factions
          .map((f) => f.archetype)
          .sort()
          .join(','),
      ),
    );
    expect(lineups.size).toBeGreaterThan(1);
  });

  it('respects structural invariants for many seeds', () => {
    for (let i = 0; i < 30; i++) {
      const city = generateCity(`invariant-${i}`);

      expect(city.districts.length).toBeGreaterThanOrEqual(5);
      expect(city.districts.length).toBeLessThanOrEqual(8);
      expect(city.districts.some((d) => d.type === 'old-town')).toBe(true);

      expect(city.factions.length).toBeGreaterThanOrEqual(4);
      expect(city.factions.length).toBeLessThanOrEqual(6);

      expect(city.quirks.length).toBeGreaterThanOrEqual(2);
      expect(city.quirks.length).toBeLessThanOrEqual(4);

      expect(city.resources.length).toBeGreaterThanOrEqual(3);
      expect(city.name.length).toBeGreaterThan(3);
      expect(city.tagline.length).toBeGreaterThan(0);
      expect(city.briefing.length).toBeGreaterThan(50);

      for (const key of BOUNDED_STAT_KEYS) {
        expect(city.stats[key]).toBeGreaterThanOrEqual(0);
        expect(city.stats[key]).toBeLessThanOrEqual(100);
      }

      // Population bookkeeping is consistent.
      const groupTotal = city.citizenGroups.reduce((sum, g) => sum + g.count, 0);
      expect(city.stats.population).toBe(groupTotal);
      expect(city.stats.population).toBeGreaterThan(0);

      // Every district has buildings inside (roughly) its footprint, with
      // growth thresholds: a founding cluster plus later construction phases.
      for (const district of city.districts) {
        expect(district.buildings.length).toBeGreaterThan(0);
        expect(district.development).toBeGreaterThanOrEqual(8);
        expect(district.development).toBeLessThanOrEqual(40);
        const founding = district.buildings.filter((b) => b.appearAt === 0);
        expect(founding.length).toBeGreaterThanOrEqual(3);
        for (const building of district.buildings) {
          expect(building.appearAt).toBeGreaterThanOrEqual(0);
          expect(building.appearAt).toBeLessThanOrEqual(1);
          expect(distance(building.position, district.position)).toBeLessThanOrEqual(
            district.radius + 0.01,
          );
        }
      }
      // Old town is the founding district and starts more established.
      const oldTown = city.districts.find((d) => d.type === 'old-town')!;
      expect(oldTown.development).toBeGreaterThanOrEqual(28);

      // Roads connect every district (graph is connected).
      const adjacency = new Map<string, string[]>();
      for (const road of city.roads) {
        adjacency.set(road.from, [...(adjacency.get(road.from) ?? []), road.to]);
        adjacency.set(road.to, [...(adjacency.get(road.to) ?? []), road.from]);
      }
      const visited = new Set<string>();
      const queue = [city.districts[0].id];
      while (queue.length > 0) {
        const id = queue.pop()!;
        if (visited.has(id)) continue;
        visited.add(id);
        queue.push(...(adjacency.get(id) ?? []));
      }
      expect(visited.size).toBe(city.districts.length);

      // Faction relationships are mutual entries within range.
      for (const faction of city.factions) {
        for (const [otherId, value] of Object.entries(faction.relationships)) {
          expect(value).toBeGreaterThanOrEqual(-100);
          expect(value).toBeLessThanOrEqual(100);
          expect(city.factions.some((f) => f.id === otherId)).toBe(true);
        }
        if (faction.homeDistrictId) {
          expect(city.districts.some((d) => d.id === faction.homeDistrictId)).toBe(true);
        }
      }
    }
  });
});

describe('district density and the skyscraper era', () => {
  it('plans dense rosters with appearAt spread across the full range', () => {
    for (let i = 0; i < 25; i++) {
      const city = generateCity(`density-${i}`);
      for (const district of city.districts) {
        // Dense rosters with late-game construction near development 1.0. The
        // floor is the radius-9 worst case: with the promised 2.65 building
        // gap, the smallest footprint geometrically saturates around 14-17.
        expect(district.buildings.length).toBeGreaterThanOrEqual(14);
        const maxAppear = Math.max(...district.buildings.map((b) => b.appearAt));
        expect(maxAppear).toBeGreaterThan(0.8);

        // Buildings keep a reasonable minimum spacing (no z-fighting piles).
        for (let a = 0; a < district.buildings.length; a++) {
          for (let b = a + 1; b < district.buildings.length; b++) {
            const gap = distance(
              district.buildings[a].position,
              district.buildings[b].position,
            );
            expect(gap).toBeGreaterThanOrEqual(MIN_BUILDING_GAP);
          }
        }
      }
    }
  });

  it('only plans tall buildings in urban districts, late, with valid floors', () => {
    let sawTall = false;
    for (let i = 0; i < 40; i++) {
      const city = generateCity(`tall-${i}`);
      for (const district of city.districts) {
        for (const b of district.buildings) {
          if (TALL_KINDS.has(b.kind)) {
            sawTall = true;
            // Tall kinds only in urban district types.
            expect(URBAN_TYPES.has(district.type), `${b.kind} in ${district.type}`).toBe(true);
            // arcane-spire is the only tall kind allowed in magical districts,
            // and only appears in academy/magical.
            if (b.kind === 'arcane-spire') {
              expect(['academy', 'magical']).toContain(district.type);
            }
            if (district.type === 'magical') {
              expect(b.kind).toBe('arcane-spire');
            }
            // High appearAt — the skyscraper era only arrives once developed.
            expect(b.appearAt).toBeGreaterThanOrEqual(TALL_MIN_APPEAR[b.kind] - 1e-9);
            expect(b.appearAt).toBeLessThanOrEqual(1);
            // Floors present and within the documented range for the kind.
            const range = TALL_FLOOR_RANGE[b.kind];
            expect(b.floors).toBeDefined();
            expect(b.floors!).toBeGreaterThanOrEqual(range[0]);
            expect(b.floors!).toBeLessThanOrEqual(range[1]);
          } else {
            // Classic low-rise kinds never carry a floor count.
            expect(b.floors).toBeUndefined();
          }
        }
      }
    }
    expect(sawTall, 'expected at least one tall building across seeds').toBe(true);
  });

  it('plans tall buildings for every urban district type that appears', () => {
    // Across many seeds, every urban archetype should eventually grow talls.
    const sawTallFor = new Set<DistrictType>();
    for (let i = 0; i < 60; i++) {
      const city = generateCity(`urban-${i}`);
      for (const d of city.districts) {
        if (d.buildings.some((b) => TALL_KINDS.has(b.kind))) sawTallFor.add(d.type);
      }
    }
    for (const type of URBAN_TYPES) {
      expect(sawTallFor.has(type), `no tall buildings ever planned for ${type}`).toBe(true);
    }
  });
});
