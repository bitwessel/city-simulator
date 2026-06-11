import { describe, expect, it } from 'vitest';
import type { ActiveEvent, City } from '../src/types';
import { applyEventChoice, lapseEvent, simulateDay } from '../src/simulation/engine';
import { OUTCOME_DEFS } from '../src/simulation/outcomes';
import { MAX_DISTRICTS } from '../src/simulation/expansion';
import { autoplay, expectStatsValid, freshCity } from './helpers';
import { distance } from '../src/utils/math';

/**
 * Drive a city for `days` days under conditions favourable to expansion
 * (thriving but kept below ending thresholds, with housing pressure), pinning
 * stats each tick before simulating. Events are suppressed for stability.
 * Returns the final city. Deterministic for a given seed.
 */
function growWithPressure(seed: string, days: number): City {
  let city = freshCity(seed);
  for (let i = 0; i < days; i++) {
    if (city.outcome) break;
    city.stats.happiness = 66;
    city.stats.wealth = 68;
    city.stats.infrastructure = 62;
    city.stats.food = 62;
    city.stats.chaos = 24;
    city.stats.housing = 42; // overcrowded → triggers founding
    city = simulateDay(city, { suppressEvents: true }).city;
  }
  return city;
}

function isConnected(city: City): boolean {
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
  return visited.size === city.districts.length;
}

describe('simulation engine', () => {
  it('advances the day and keeps stats valid', () => {
    const city = freshCity('tick-test');
    const result = simulateDay(city);
    expect(result.day).toBe(city.day + 1);
    expect(result.city.day).toBe(city.day + 1);
    expectStatsValid(result.city);
    // Input city is not mutated.
    expect(city.day).toBe(1);
  });

  it('survives a 300-day run across several seeds without invalid state', () => {
    for (const seed of ['marathon-1', 'marathon-2', 'marathon-3']) {
      let city = freshCity(seed);
      for (let i = 0; i < 300; i++) {
        if (city.outcome) break;
        const result = simulateDay(city);
        city = result.city;
        expectStatsValid(city);
        if (result.triggeredEvent) {
          const choice = result.triggeredEvent.choices[0];
          city = applyEventChoice(city, result.triggeredEvent, choice.id).city;
          expectStatsValid(city);
        }
      }
      expect(city.history.length).toBeGreaterThan(0);
      expect(city.news.length).toBeGreaterThan(1);
    }
  });

  it('is deterministic: same seed and same choices replay identically', () => {
    const runA = autoplay(freshCity('determinism'), 120);
    const runB = autoplay(freshCity('determinism'), 120);
    expect(runA.day).toBe(runB.day);
    expect(runA.stats).toEqual(runB.stats);
    expect(runA.eventLog).toEqual(runB.eventLog);
    expect(runA.news).toEqual(runB.news);
    expect(runA.outcome?.kind).toBe(runB.outcome?.kind);
  });

  it('different seeds diverge over time', () => {
    const runA = autoplay(freshCity('diverge-a'), 60);
    const runB = autoplay(freshCity('diverge-b'), 60);
    expect(JSON.stringify(runA.stats)).not.toBe(JSON.stringify(runB.stats));
  });

  it('applies event choice effects to stats and factions', () => {
    const city = freshCity('choice-test');
    // Full trust so positive effects are not dampened.
    city.stats.trust = 80;
    city.stats.wealth = 50;
    city.stats.happiness = 50;
    const faction = city.factions[0];
    faction.satisfaction = 50;

    const event: ActiveEvent = {
      defId: 'synthetic-test-event',
      day: city.day,
      title: 'Test',
      description: 'Test',
      districtId: null,
      factionId: faction.id,
      choices: [
        {
          id: 'do-it',
          label: 'Do it',
          effects: { wealth: -6, happiness: 5 },
          factionEffects: { [faction.archetype]: 10 },
          resultText: 'It is done.',
        },
      ],
    };

    const { city: next, news } = applyEventChoice(city, event, 'do-it');
    expect(next.stats.wealth).toBeCloseTo(44, 5);
    expect(next.stats.happiness).toBeCloseTo(55, 5);
    expect(next.factions[0].satisfaction).toBeCloseTo(60, 5);
    expect(news.some((n) => n.text === 'It is done.')).toBe(true);
    expect(next.eventLog).toHaveLength(1);
    expect(next.eventLog[0].choiceId).toBe('do-it');
    expect(next.daysSinceEvent).toBe(0);
    // Original untouched.
    expect(city.stats.wealth).toBe(50);
  });

  it('dampens positive (but not negative) effects when trust is low', () => {
    const city = freshCity('dampen-test');
    city.stats.trust = 0; // dampen factor floors at 0.5 (phase-02 play-matters cap)
    city.stats.happiness = 50;
    city.stats.wealth = 50;
    const event: ActiveEvent = {
      defId: 'synthetic-dampen',
      day: city.day,
      title: 'Test',
      description: 'Test',
      districtId: null,
      factionId: null,
      choices: [
        {
          id: 'c',
          label: 'c',
          effects: { happiness: 10, wealth: -10 },
          resultText: 'ok',
        },
      ],
    };
    const { city: next } = applyEventChoice(city, event, 'c');
    // Floor raised 0.4 → 0.5 in phase 02 so the player's hand always retains at
    // least half effect even in a fully distrustful city (50 + 10 * 0.5).
    expect(next.stats.happiness).toBeCloseTo(55, 5); // 10 * 0.5
    expect(next.stats.wealth).toBeCloseTo(40, 5); // negatives bite in full
  });

  it('keeps stats clamped even under extreme effects', () => {
    const city = freshCity('clamp-test');
    city.stats.trust = 100;
    const event: ActiveEvent = {
      defId: 'synthetic-clamp',
      day: city.day,
      title: 'Test',
      description: 'Test',
      districtId: null,
      factionId: null,
      choices: [
        {
          id: 'c',
          label: 'c',
          effects: { happiness: 500, wealth: -500, population: -10_000_000 },
          resultText: 'ok',
        },
      ],
    };
    const { city: next } = applyEventChoice(city, event, 'c');
    expect(next.stats.happiness).toBe(100);
    expect(next.stats.wealth).toBe(0);
    expect(next.stats.population).toBe(0);
  });

  it('reaches the magical singularity outcome when magic saturates', () => {
    let city = freshCity('outcome-magic');
    city.day = 25;
    // Pin magic at the ceiling; the streak should complete within a week.
    let outcomeKind: string | null = null;
    for (let i = 0; i < 15; i++) {
      city.stats.magic = 95;
      const result = simulateDay(city);
      city = result.city;
      if (result.triggeredEvent) {
        city = applyEventChoice(
          city,
          result.triggeredEvent,
          result.triggeredEvent.choices[0].id,
        ).city;
      }
      if (result.outcome) {
        outcomeKind = result.outcome.kind;
        break;
      }
    }
    expect(outcomeKind).toBe('magical-singularity');
  });

  it('reaches the ghost town outcome when everyone leaves', () => {
    let city = freshCity('outcome-ghost');
    city.day = 20;
    let outcomeKind: string | null = null;
    for (let i = 0; i < 10; i++) {
      city.stats.population = 50;
      const result = simulateDay(city);
      city = result.city;
      if (result.triggeredEvent) {
        city = applyEventChoice(
          city,
          result.triggeredEvent,
          result.triggeredEvent.choices[0].id,
        ).city;
      }
      if (result.outcome) {
        outcomeKind = result.outcome.kind;
        break;
      }
    }
    expect(outcomeKind).toBe('ghost-town');
  });

  it('defines at least 6 distinct endings', () => {
    expect(OUTCOME_DEFS.length).toBeGreaterThanOrEqual(6);
    const kinds = new Set(OUTCOME_DEFS.map((d) => d.kind));
    expect(kinds.size).toBe(OUTCOME_DEFS.length);
  });

  it('paces events sparsely: only a handful of memos across 300 days', () => {
    for (const seed of ['pacing-1', 'pacing-2', 'pacing-3']) {
      let city = freshCity(seed);
      let events = 0;
      for (let i = 0; i < 300; i++) {
        if (city.outcome) break;
        const result = simulateDay(city);
        city = result.city;
        if (result.triggeredEvent) {
          events++;
          city = applyEventChoice(
            city,
            result.triggeredEvent,
            result.triggeredEvent.choices[0].id,
          ).city;
        }
      }
      // ~45+ day minimum gap => at most ~7 random memos (plus rare chains).
      expect(events, seed).toBeGreaterThanOrEqual(1);
      expect(events, seed).toBeLessThanOrEqual(10);
    }
  });

  it('suppressEvents stops memos from firing and leaves the queue alone', () => {
    let city = freshCity('suppress-test');
    city.daysSinceEvent = 200; // way past the minimum gap
    city.queuedEvents.push({ defId: 'synthetic-chain', day: city.day + 1 });
    for (let i = 0; i < 60; i++) {
      const result = simulateDay(city, { suppressEvents: true });
      expect(result.triggeredEvent).toBeNull();
      city = result.city;
    }
    expect(city.queuedEvents).toHaveLength(1);
  });

  it('lapseEvent adds a news line without touching stats', () => {
    const city = freshCity('lapse-test');
    const event: ActiveEvent = {
      defId: 'synthetic-lapse',
      day: city.day,
      title: 'The Pigeon Question',
      description: 'Test',
      districtId: null,
      factionId: null,
      choices: [],
    };
    const next = lapseEvent(city, event);
    expect(next.news).toHaveLength(city.news.length + 1);
    expect(next.news.at(-1)!.text).toContain('The Pigeon Question');
    expect(next.stats).toEqual(city.stats);
    // Original untouched.
    expect(city.news.at(-1)!.text).not.toContain('The Pigeon Question');
  });

  it('districts develop over time while life is good', () => {
    let city = freshCity('develop-test');
    const before = city.districts.map((d) => d.development);
    for (let i = 0; i < 60; i++) {
      // Pin comfortable conditions so development climbs.
      city.stats.happiness = 70;
      city.stats.wealth = 65;
      city.stats.infrastructure = 65;
      city.stats.chaos = 20;
      city = simulateDay(city, { suppressEvents: true }).city;
    }
    city.districts.forEach((d, i) => {
      expect(d.development).toBeGreaterThan(before[i]);
      expect(d.development).toBeLessThanOrEqual(100);
    });
  });

  it('spirals: sustained high pollution drags beauty and happiness down', () => {
    const city = freshCity('spiral-pollution');
    const start = { beauty: 60, happiness: 60 };
    city.stats.beauty = start.beauty;
    city.stats.happiness = start.happiness;
    let current: City = city;
    for (let i = 0; i < 30; i++) {
      current.stats.pollution = 90; // keep it pinned high
      const result = simulateDay(current);
      current = result.city;
      if (result.triggeredEvent) {
        current = applyEventChoice(
          current,
          result.triggeredEvent,
          result.triggeredEvent.choices[0].id,
        ).city;
      }
    }
    expect(current.stats.beauty).toBeLessThan(start.beauty);
    expect(current.stats.happiness).toBeLessThan(start.happiness);
  });
});

describe('city expansion: founding new districts mid-run', () => {
  it('a thriving, pressured city founds new districts over time', () => {
    const city = growWithPressure('expand-test', 250);
    const start = freshCity('expand-test').districts.length;
    // It should have grown (unless it hit an ending first), but never shrink.
    expect(city.districts.length).toBeGreaterThanOrEqual(start);
    if (!city.outcome) {
      expect(city.districts.length).toBeGreaterThan(start);
    }
  });

  it('district founding is deterministic for the same seed and choices', () => {
    const a = growWithPressure('expand-determinism', 220);
    const b = growWithPressure('expand-determinism', 220);
    expect(a.districts.length).toBe(b.districts.length);
    expect(a.districts.map((d) => `${d.type}:${d.name}`)).toEqual(
      b.districts.map((d) => `${d.type}:${d.name}`),
    );
    expect(a.districts.map((d) => d.position)).toEqual(
      b.districts.map((d) => d.position),
    );
    expect(a.roads).toEqual(b.roads);
    expect(a.lastDistrictFoundedDay).toBe(b.lastDistrictFoundedDay);
  });

  it('never exceeds the hard district cap', () => {
    for (const seed of ['cap-1', 'cap-2', 'cap-3']) {
      const city = growWithPressure(seed, 400);
      expect(city.districts.length).toBeLessThanOrEqual(MAX_DISTRICTS);
    }
  });

  it('founded districts respect spacing and keep the road graph connected', () => {
    for (const seed of ['inv-1', 'inv-2', 'inv-3', 'inv-4']) {
      const city = growWithPressure(seed, 300);
      // Min 24-unit centre-to-centre spacing holds across all districts.
      for (let i = 0; i < city.districts.length; i++) {
        for (let j = i + 1; j < city.districts.length; j++) {
          const gap = distance(
            city.districts[i].position,
            city.districts[j].position,
          );
          expect(gap).toBeGreaterThanOrEqual(24 - 1e-6);
        }
      }
      // Every district is still reachable by road.
      expect(isConnected(city), seed).toBe(true);
      // Every road references a real district.
      const ids = new Set(city.districts.map((d) => d.id));
      for (const road of city.roads) {
        expect(ids.has(road.from)).toBe(true);
        expect(ids.has(road.to)).toBe(true);
      }
    }
  });

  it('founded districts start undeveloped with their own building roster', () => {
    const city = growWithPressure('young-districts', 250);
    const start = freshCity('young-districts').districts.length;
    const founded = city.districts.slice(start);
    for (const d of founded) {
      expect(d.buildings.length).toBeGreaterThan(0);
      // Founding cluster exists.
      expect(d.buildings.some((b) => b.appearAt === 0)).toBe(true);
      // Buildings sit inside the footprint.
      for (const b of d.buildings) {
        expect(distance(b.position, d.position)).toBeLessThanOrEqual(d.radius + 0.01);
      }
    }
  });

  it('transferring population keeps the district-population sum stable', () => {
    // A founded district draws people from existing ones, so the sum of
    // district populations is not inflated by the founding itself.
    let city = freshCity('pop-transfer');
    let prevSum = city.districts.reduce((s, d) => s + d.population, 0);
    let prevCount = city.districts.length;
    for (let i = 0; i < 200; i++) {
      if (city.outcome) break;
      city.stats.happiness = 66;
      city.stats.wealth = 68;
      city.stats.housing = 42;
      city.stats.food = 62;
      city.stats.chaos = 24;
      const before = city.districts.reduce((s, d) => s + d.population, 0);
      city = simulateDay(city, { suppressEvents: true }).city;
      const after = city.districts.reduce((s, d) => s + d.population, 0);
      if (city.districts.length > prevCount) {
        // On a founding tick, the district-pop sum changes only by the day's
        // normal growth, not by a sudden injection of the seed population.
        expect(Math.abs(after - before)).toBeLessThan(before * 0.05 + 50);
        prevCount = city.districts.length;
      }
      prevSum = after;
    }
    expect(prevSum).toBeGreaterThan(0);
  });

  it('keeps district and building ids globally unique even with duplicates', () => {
    // This seed founds enough districts to exhaust the fresh archetypes and
    // reuse a type, so the duplicate-name/id path is genuinely exercised.
    const city = growWithPressure('dupseek-14', 400);
    const types = city.districts.map((d) => d.type);
    const hasDuplicateType = types.some((t, i) => types.indexOf(t) !== i);
    expect(hasDuplicateType, 'expected a duplicate district type at the cap').toBe(true);

    const districtIds = city.districts.map((d) => d.id);
    expect(new Set(districtIds).size).toBe(districtIds.length);
    // Duplicate-type districts still get distinct display names.
    const names = city.districts.map((d) => d.name);
    expect(new Set(names).size).toBe(names.length);
    // Building ids are globally unique across the whole city.
    const buildingIds = city.districts.flatMap((d) => d.buildings.map((b) => b.id));
    expect(new Set(buildingIds).size).toBe(buildingIds.length);
  });

  it('long pressured runs keep every stat valid', () => {
    for (const seed of ['long-1', 'long-2', 'long-3']) {
      let city = freshCity(seed);
      for (let i = 0; i < 300; i++) {
        if (city.outcome) break;
        city.stats.happiness = 64;
        city.stats.wealth = 66;
        city.stats.housing = 44;
        city.stats.food = 60;
        city = simulateDay(city, { suppressEvents: true }).city;
        expectStatsValid(city);
        expect(city.districts.length).toBeLessThanOrEqual(MAX_DISTRICTS);
      }
    }
  });
});
