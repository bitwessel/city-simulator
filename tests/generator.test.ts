import { describe, expect, it } from 'vitest';
import { generateCity } from '../src/generation/generator';
import { BOUNDED_STAT_KEYS } from '../src/types';
import { distance } from '../src/utils/math';

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
