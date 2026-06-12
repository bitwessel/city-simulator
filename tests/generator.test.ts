import { describe, expect, it } from 'vitest';
import type { BuildingKind, DistrictType } from '../src/types';
import { generateCity, foundingSiteCandidates, foundingPatronOptions, DISTRICT_MIN_GAP } from '../src/generation/generator';
import { generateTerrain, isDistrictSiteOnLand } from '../src/generation/terrain';
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

// =============================================================================
// Slice 2 — Founding Ritual
// =============================================================================

/** Compact structural snapshot for a city (avoids snapshot-unfriendly fields). */
function citySnapshot(seed: string) {
  const c = generateCity(seed);
  return {
    name: c.name,
    districts: c.districts.map((d) => [d.type, d.position] as const),
    quirks: c.quirks.map((q) => q.id),
    stats: JSON.stringify(c.stats),
  };
}

describe('founding — default-path snapshot guard', () => {
  const SEEDS = ['ember-42', 'smoke-test-city', 'invariant-17'];

  it('default path is byte-identical across seeds (snapshot)', () => {
    for (const seed of SEEDS) {
      const snap = citySnapshot(seed);
      expect(snap).toMatchSnapshot(seed);
    }
  });

  it('generateCity(seed) === generateCity(seed, undefined) for several seeds', () => {
    for (const seed of SEEDS) {
      expect(JSON.stringify(generateCity(seed))).toBe(
        JSON.stringify(generateCity(seed, undefined)),
      );
    }
  });
});

describe('founding — same seed + same choices = identical city', () => {
  it('two calls with identical choices produce identical output', () => {
    const seed = 'test-founding-42';
    const choices = { siteId: 'b' as const, patronQuirkId: 'talking-statues', name: 'Testburg' };
    const a = generateCity(seed, choices);
    const b = generateCity(seed, choices);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe('founding — choices shape the city', () => {
  it('site choice moves old-town position', () => {
    const seed = 'shape-test-7';
    const terrain = generateTerrain(seed);
    const sites = foundingSiteCandidates(seed, terrain);

    const cityA = generateCity(seed, { siteId: 'a' });
    const cityB = generateCity(seed, { siteId: 'b' });
    const oldTownA = cityA.districts.find((d) => d.type === 'old-town')!;
    const oldTownB = cityB.districts.find((d) => d.type === 'old-town')!;

    // Old-town should land near (within ~DISTRICT_MIN_GAP) its chosen site.
    expect(distance(oldTownA.position, sites[0].position)).toBeLessThan(DISTRICT_MIN_GAP);
    expect(distance(oldTownB.position, sites[1].position)).toBeLessThan(DISTRICT_MIN_GAP);

    // Different sites → different old-town positions.
    expect(distance(oldTownA.position, oldTownB.position)).toBeGreaterThan(0.5);
  });

  it('patronQuirkId X → city.quirks contains X exactly once', () => {
    const city = generateCity('patron-test-3', {
      patronQuirkId: 'singing-river',
    });
    const hits = city.quirks.filter((q) => q.id === 'singing-river');
    expect(hits.length).toBe(1);
  });

  it('name override is respected', () => {
    const city = generateCity('name-test-1', { name: 'Testburg' });
    expect(city.name).toBe('Testburg');
  });

  it('founding choices are stored on city.founding', () => {
    const choices = { siteId: 'c' as const, name: 'Stored' };
    const city = generateCity('store-test', choices);
    expect(city.founding).toEqual(choices);
  });
});

describe('founding — candidate site validity', () => {
  it('returns exactly 3 sites for ~20 seeds, on-land, pairwise spaced', () => {
    for (let i = 0; i < 20; i++) {
      const seed = `candidate-${i}`;
      const terrain = generateTerrain(seed);
      const sites = foundingSiteCandidates(seed, terrain);
      expect(sites.length).toBe(3);
      expect(new Set(sites.map((s) => s.id)).size).toBe(3);
      for (const site of sites) {
        expect(isDistrictSiteOnLand(terrain, site.position, 10)).toBe(true);
      }
      for (let a = 0; a < sites.length; a++) {
        for (let b = a + 1; b < sites.length; b++) {
          const d = distance(sites[a].position, sites[b].position);
          expect(d).toBeGreaterThanOrEqual(DISTRICT_MIN_GAP - 1e-6);
        }
      }
    }
  });
});

describe('founding — patron options', () => {
  it('returns 3 quirks from the pool', () => {
    const patrons = foundingPatronOptions('patron-opts-1');
    expect(patrons.length).toBe(3);
    for (const p of patrons) {
      expect(typeof p.id).toBe('string');
      expect(typeof p.title).toBe('string');
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
