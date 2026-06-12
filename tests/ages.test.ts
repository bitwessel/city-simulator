import { describe, expect, it } from 'vitest';
import type { ActiveEvent, AgeId, City } from '../src/types';
import { AGE_ORDER, WONDER_BUILDING_KINDS } from '../src/types';
import {
  AGE_DEFS,
  ageIndex,
  ageProgress,
  currentAge,
  getAgeDef,
  nextAgeDef,
} from '../src/simulation/ages';
import { WONDER_POOL } from '../src/projects/data/wonders';
import {
  getWonderDef,
  wonderHostDistrict,
  wonderTotalDays,
} from '../src/projects/wonders';
import { EVENT_POOL } from '../src/events/data/events';
import { HEADLINE_POOL } from '../src/simulation/data/headlines';
import { PROJECT_POOL } from '../src/projects/data/projects';
import {
  WONDER_COUNCIL_EVENT_ID,
  applyEventChoice,
  simulateDay,
} from '../src/simulation/engine';
import { eventIsEligible } from '../src/events/system';
import { runHandsOff } from './balance-helpers';
import { freshCity } from './helpers';

// ---------------------------------------------------------------------------
// Phase 04 — ages & progression. Covers: the age catalog's shape, deterministic
// monotone advancement (ages never regress), hands-off runs growing up on
// their own (requirement 8), minAge gating integrity (requirement 10), and the
// wonder lifecycle through to its triumphant ending (requirement 9).
// ---------------------------------------------------------------------------

/** Drive a city for `days` days with events suppressed, recording each age. */
function agesOverRun(seed: string, days: number): AgeId[] {
  let city = freshCity(seed);
  const seen: AgeId[] = [currentAge(city)];
  for (let i = 0; i < days; i++) {
    if (city.outcome) break;
    city = simulateDay(city, { suppressEvents: true }).city;
    const age = currentAge(city);
    if (age !== seen[seen.length - 1]) seen.push(age);
  }
  return seen;
}

/**
 * Pin milestones generously and run until the city reaches the target age (or
 * the day budget runs out). Pinning development/population mirrors how the
 * ending-reachability tests pin stats — a scripted "very good run".
 */
function fastForwardToAge(city: City, target: AgeId, maxDays: number): City {
  let current = city;
  for (let i = 0; i < maxDays; i++) {
    if (ageIndex(currentAge(current)) >= ageIndex(target)) break;
    for (const d of current.districts) d.development = 95;
    current.stats.population = Math.round(
      (current.foundingPopulation ?? current.stats.population) * 1.5,
    );
    // Keep the run comfortably alive and away from other endings.
    current.stats.happiness = 60;
    current.stats.magic = 50;
    current.stats.chaos = 20;
    current = simulateDay(current, { suppressEvents: true }).city;
  }
  return current;
}

describe('age catalog integrity', () => {
  it('defines the five ages in canonical order', () => {
    expect(AGE_DEFS.map((a) => a.id)).toEqual(AGE_ORDER);
    expect(AGE_DEFS).toHaveLength(5);
  });

  it('only the founding settlement lacks requirements', () => {
    expect(AGE_DEFS[0].requires).toBeNull();
    for (const def of AGE_DEFS.slice(1)) {
      expect(def.requires, def.id).not.toBeNull();
      expect(def.requires!.needed, def.id).toBeGreaterThan(0);
      const axes = Object.keys(def.requires!.milestones).length;
      expect(def.requires!.needed, def.id).toBeLessThanOrEqual(axes);
      // Every transition keeps the patience axis so progression stays
      // inevitable-ish for surviving cities.
      expect(def.requires!.milestones.daysInAge, def.id).toBeGreaterThan(0);
    }
  });

  it('has warm copy for every age (name, title, flavor, dream)', () => {
    for (const def of AGE_DEFS) {
      expect(def.name.length, def.id).toBeGreaterThan(0);
      expect(def.title.length, def.id).toBeGreaterThan(0);
      expect(def.flavor.length, def.id).toBeGreaterThan(10);
      expect(def.dream.length, def.id).toBeGreaterThan(10);
    }
  });
});

describe('age advancement', () => {
  it('a fresh city starts as a settlement with empty log', () => {
    const city = freshCity('age-fresh');
    expect(currentAge(city)).toBe('settlement');
    expect(city.ageLog ?? []).toHaveLength(0);
    expect(nextAgeDef(city)?.id).toBe('village');
    expect(ageProgress(city)).toBeGreaterThanOrEqual(0);
    expect(ageProgress(city)).toBeLessThanOrEqual(1);
  });

  it('ages only advance, never regress, across long runs', () => {
    for (const seed of ['age-mono-1', 'age-mono-2', 'age-mono-3']) {
      const seen = agesOverRun(seed, 300);
      // Each recorded change must move strictly forward in the canonical order.
      for (let i = 1; i < seen.length; i++) {
        expect(ageIndex(seen[i]), `${seed}: ${seen.join('→')}`).toBe(
          ageIndex(seen[i - 1]) + 1,
        );
      }
    }
  });

  it('advancement is deterministic: same seed, same age history', () => {
    const run = (seed: string) => {
      let city = freshCity(seed);
      for (let i = 0; i < 200; i++) {
        if (city.outcome) break;
        city = simulateDay(city, { suppressEvents: true }).city;
      }
      return city.ageLog ?? [];
    };
    expect(run('age-determinism')).toEqual(run('age-determinism'));
  });

  it('age-ups announce themselves in the news', () => {
    let city = freshCity('age-news');
    for (let i = 0; i < 120 && (city.ageLog ?? []).length === 0; i++) {
      city = simulateDay(city, { suppressEvents: true }).city;
    }
    expect((city.ageLog ?? []).length).toBeGreaterThan(0);
    const villageTitle = getAgeDef('village').title;
    expect(
      city.news.some((n) => n.tone === 'good' && n.text.includes(villageTitle)),
    ).toBe(true);
  });

  it('hands-off runs grow up: all reach Village, most reach Town by day 250', () => {
    const seeds = Array.from({ length: 12 }, (_, i) =>
      `balance-${String(i + 1).padStart(3, '0')}`,
    );
    let villages = 0;
    let towns = 0;
    for (const seed of seeds) {
      const run = runHandsOff(seed, 250);
      const idx = ageIndex(currentAge(run.city));
      if (idx >= ageIndex('village')) villages++;
      if (idx >= ageIndex('town')) towns++;
    }
    // Requirement 8: at least Village/Town by late game across most seeds.
    expect(villages, 'every surviving hands-off run becomes a village').toBe(seeds.length);
    expect(towns, 'most hands-off runs reach Town').toBeGreaterThanOrEqual(
      Math.ceil(seeds.length * 0.7),
    );
  }, 120_000);
});

describe('minAge gating integrity (requirement 10)', () => {
  it('every event/headline/project minAge is a valid age id', () => {
    for (const e of EVENT_POOL) {
      if (e.minAge !== undefined) {
        expect(AGE_ORDER, `event ${e.id}`).toContain(e.minAge);
      }
    }
    for (const h of HEADLINE_POOL) {
      if (h.minAge !== undefined) {
        expect(AGE_ORDER, `headline "${h.text.slice(0, 40)}"`).toContain(h.minAge);
      }
    }
    for (const p of PROJECT_POOL) {
      if (p.minAge !== undefined) {
        expect(AGE_ORDER, `project ${p.id}`).toContain(p.minAge);
      }
    }
  });

  it('ships age-specific events for the growing city', () => {
    const gated = EVENT_POOL.filter((e) => e.minAge !== undefined && !e.chainOnly);
    expect(gated.length).toBeGreaterThanOrEqual(3);
    const gatedAges = new Set(gated.map((e) => e.minAge));
    expect(gatedAges.size).toBeGreaterThanOrEqual(3);
  });

  it('minAge events are ineligible before their age and eligible after', () => {
    const def = EVENT_POOL.find((e) => e.id === 'village-tavern-brawl')!;
    const city = freshCity('age-gate-test');
    expect(currentAge(city)).toBe('settlement');
    expect(eventIsEligible(def, city)).toBe(false);
    city.age = 'village';
    expect(eventIsEligible(def, city)).toBe(true);
    city.age = 'wonder'; // later ages keep earlier events
    expect(eventIsEligible(def, city)).toBe(true);
  });
});

describe('the Wonder Age and its wonder (requirement 9)', () => {
  it('wonder catalog: one def per wonder kind, staged, with sane copy', () => {
    expect(WONDER_POOL.length).toBe(WONDER_BUILDING_KINDS.length);
    const kinds = WONDER_POOL.map((w) => w.building);
    expect(new Set(kinds)).toEqual(new Set(WONDER_BUILDING_KINDS));
    const ids = WONDER_POOL.map((w) => w.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const w of WONDER_POOL) {
      expect(w.stages.length, w.id).toBeGreaterThanOrEqual(3);
      expect(w.flavor.length, w.id).toBeGreaterThan(20);
      for (const s of w.stages) {
        expect(s.days, `${w.id}/${s.name}`).toBeGreaterThan(0);
        expect(s.headline.length, `${w.id}/${s.name}`).toBeGreaterThan(10);
      }
      expect(wonderTotalDays(w), w.id).toBeGreaterThanOrEqual(25);
      expect(Object.keys(w.completionEffects).length, w.id).toBeGreaterThan(0);
    }
  });

  it('the wonder-council event offers every wonder exactly once', () => {
    const council = EVENT_POOL.find((e) => e.id === WONDER_COUNCIL_EVENT_ID)!;
    expect(council).toBeDefined();
    expect(council.chainOnly).toBe(true);
    const offered = council.choices
      .map((c) => c.startsWonderId)
      .filter((id): id is string => id != null);
    expect(new Set(offered)).toEqual(new Set(WONDER_POOL.map((w) => w.id)));
    for (const id of offered) {
      expect(getWonderDef(id), id).toBeDefined();
    }
  });

  it('entering the Wonder Age queues the council question (and re-asks politely)', () => {
    let city = freshCity('wonder-ask');
    city = fastForwardToAge(city, 'wonder', 400);
    expect(currentAge(city)).toBe('wonder');
    expect(city.wonderAskDay).toBeDefined();
    // The question is queued (or has already fired into the due list).
    const queued = city.queuedEvents.some((q) => q.defId === WONDER_COUNCIL_EVENT_ID);
    expect(queued || city.wonderAskDay! <= city.day).toBe(true);
  });

  it('the full wonder arc: choice → staged construction → triumphant ending', () => {
    let city = freshCity('wonder-arc');
    city = fastForwardToAge(city, 'wonder', 400);
    expect(currentAge(city)).toBe('wonder');

    // Let the queued council question fire.
    let council: ActiveEvent | null = null;
    for (let i = 0; i < 10 && !council; i++) {
      const result = simulateDay(city, { suppressEvents: false });
      city = result.city;
      if (result.triggeredEvent?.defId === WONDER_COUNCIL_EVENT_ID) {
        council = result.triggeredEvent;
      }
    }
    expect(council, 'the wonder-council memo should fire').not.toBeNull();

    // Choose the Great Garden.
    const choice = council!.choices.find((c) => c.startsWonderId === 'great-garden')!;
    city = applyEventChoice(city, council!, choice.id).city;
    expect(city.activeWonder?.defId).toBe('great-garden');
    const def = getWonderDef('great-garden')!;

    // The staged building stands in the host district, scaffolded at stage 0.
    const district = city.districts.find((d) => d.id === city.activeWonder!.districtId)!;
    const building = district.buildings.find(
      (b) => b.id === city.activeWonder!.buildingId,
    )!;
    expect(building.kind).toBe('wonder-garden');
    expect(building.construction).toBe(true);
    expect(building.wonderStage).toBe(0);

    // Stages advance on schedule, each with a progress headline.
    const seenStages = new Set<number>([0]);
    const totalDays = wonderTotalDays(def);
    for (let i = 0; i <= totalDays + 2 && !city.completedWonder; i++) {
      // Hold the city steady so no other ending sneaks in mid-build.
      city.stats.magic = 50;
      city.stats.chaos = 20;
      city.stats.happiness = 60;
      city = simulateDay(city, { suppressEvents: true }).city;
      const b = city.districts
        .flatMap((d) => d.buildings)
        .find((bb) => bb.kind === 'wonder-garden')!;
      seenStages.add(b.wonderStage ?? 0);
    }
    expect(city.completedWonder?.defId).toBe('great-garden');
    // Every intermediate stage was visible at some point.
    for (let s = 0; s < def.stages.length; s++) {
      expect(seenStages.has(s), `stage ${s} visible`).toBe(true);
    }
    const finished = city.districts
      .flatMap((d) => d.buildings)
      .find((b) => b.kind === 'wonder-garden')!;
    expect(finished.construction).toBeFalsy();
    expect(
      city.news.some((n) => n.text.includes(def.name) && n.text.includes('COMPLETE')),
    ).toBe(true);

    // The triumphant ending follows within the outcome streak.
    let outcomeKind: string | null = city.outcome?.kind ?? null;
    for (let i = 0; i < 10 && !outcomeKind; i++) {
      city.stats.magic = 50;
      city.stats.chaos = 20;
      const result = simulateDay(city, { suppressEvents: true });
      city = result.city;
      if (result.outcome) outcomeKind = result.outcome.kind;
    }
    expect(outcomeKind).toBe('wonder');
    expect(city.outcome?.tone).toBe('triumphant');
  }, 60_000);

  it('wonder choice + placement replays identically (determinism)', () => {
    const make = () => {
      let city = freshCity('wonder-replay');
      city = fastForwardToAge(city, 'wonder', 400);
      let council: ActiveEvent | null = null;
      for (let i = 0; i < 10 && !council; i++) {
        const result = simulateDay(city, { suppressEvents: false });
        city = result.city;
        if (result.triggeredEvent?.defId === WONDER_COUNCIL_EVENT_ID) {
          council = result.triggeredEvent;
        }
      }
      const choice = council!.choices.find((c) => c.startsWonderId === 'everforge')!;
      return applyEventChoice(city, council!, choice.id).city;
    };
    const a = make();
    const b = make();
    expect(a.activeWonder).toEqual(b.activeWonder);
    const wonderOf = (c: City) =>
      c.districts.flatMap((d) => d.buildings).find((bb) => bb.kind === 'wonder-forge');
    expect(wonderOf(a)).toEqual(wonderOf(b));
    expect(wonderOf(a)).toBeDefined();
  }, 60_000);

  it('hands-off runs never build a wonder (the memo lapses unanswered)', () => {
    // Belt and braces for the balance contract: even a hands-off city that
    // somehow reaches the Wonder Age cannot raise a wonder without answering.
    const run = runHandsOff('balance-010', 250);
    expect(run.city.activeWonder).toBeUndefined();
    expect(run.city.completedWonder).toBeUndefined();
  }, 60_000);

  it('every wonder finds a host district on any seed', () => {
    for (const seed of ['host-1', 'host-2', 'host-3']) {
      const city = freshCity(seed);
      for (const def of WONDER_POOL) {
        const host = wonderHostDistrict(city, def);
        expect(host, `${seed}/${def.id}`).not.toBeNull();
      }
    }
  });
});
