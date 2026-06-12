import { describe, expect, it } from 'vitest';
import { BOUNDED_STAT_KEYS } from '../src/types';
import type { FactionArchetype } from '../src/types';
import { EDICT_POOL } from '../src/simulation/data/edicts';
import {
  EDICT_COOLDOWN_DAYS,
  canDeclareEdict,
  declareEdict,
  edictCooldownRemaining,
} from '../src/simulation/edicts';
import { EVENT_POOL } from '../src/events/data/events';
import { simulateDay } from '../src/simulation/engine';
import { freshCity } from './helpers';

const VALID_PROPS = ['lanterns', 'planters', 'crates', 'scaffolds'] as const;

const ALL_FACTION_ARCHETYPES: FactionArchetype[] = [
  'merchants',
  'gardeners',
  'engineers',
  'mages',
  'workers',
  'nobles',
  'goblin-union',
  'street-performers',
  'archivists',
  'fishermen',
  'inventors',
  'night-watch',
];

describe('edict pool integrity', () => {
  it('has unique ids', () => {
    const ids = EDICT_POOL.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has non-empty name, proclamation, and blurb on every entry', () => {
    for (const def of EDICT_POOL) {
      expect(def.name.length, def.id).toBeGreaterThan(0);
      expect(def.proclamation.length, def.id).toBeGreaterThan(20);
      expect(def.blurb.length, def.id).toBeGreaterThan(0);
    }
  });

  it('pool size is in the 4-6 range', () => {
    expect(EDICT_POOL.length).toBeGreaterThanOrEqual(4);
    expect(EDICT_POOL.length).toBeLessThanOrEqual(6);
  });

  it('every dailyEffects key is a valid stat and magnitude is in [0.1, 0.4]', () => {
    const allKeys = [...BOUNDED_STAT_KEYS, 'population'];
    for (const def of EDICT_POOL) {
      for (const [key, value] of Object.entries(def.dailyEffects)) {
        expect(allKeys, `${def.id} key=${key}`).toContain(key);
        const mag = Math.abs(value as number);
        expect(mag, `${def.id} magnitude ${key}`).toBeGreaterThanOrEqual(0.1 - 1e-9);
        expect(mag, `${def.id} magnitude ${key}`).toBeLessThanOrEqual(0.4 + 1e-9);
      }
    }
  });

  it('factionReactions keys are all valid FactionArchetypes', () => {
    for (const def of EDICT_POOL) {
      if (!def.factionReactions) continue;
      for (const arch of Object.keys(def.factionReactions)) {
        expect(ALL_FACTION_ARCHETYPES, `${def.id} arch=${arch}`).toContain(arch);
      }
    }
  });

  it('eventTagBias values are all > 0', () => {
    for (const def of EDICT_POOL) {
      if (!def.eventTagBias) continue;
      for (const [tag, bias] of Object.entries(def.eventTagBias)) {
        expect(bias, `${def.id} tag=${tag}`).toBeGreaterThan(0);
      }
    }
  });

  it('visual.prop is one of the four allowed values', () => {
    for (const def of EDICT_POOL) {
      expect(VALID_PROPS as readonly string[], def.id).toContain(def.visual.prop);
    }
  });

  it('every eventTagBias tag appears on at least one event in EVENT_POOL', () => {
    const allTags = new Set(EVENT_POOL.flatMap((e) => e.tags));
    for (const def of EDICT_POOL) {
      if (!def.eventTagBias) continue;
      for (const tag of Object.keys(def.eventTagBias)) {
        expect(allTags, `${def.id} tag="${tag}" not found in event pool`).toContain(tag);
      }
    }
  });
});

describe('edict drift', () => {
  it('declaring festival-season raises happiness above an un-edicted run', () => {
    const DAYS = 30;
    // Base run — no edict.
    let base = freshCity('edict-drift-base');
    for (let i = 0; i < DAYS; i++) {
      base = simulateDay(base, { suppressEvents: true }).city;
    }

    // Edicted run.
    let edicted = freshCity('edict-drift-base');
    edicted = declareEdict(edicted, 'festival-season');
    for (let i = 0; i < DAYS; i++) {
      edicted = simulateDay(edicted, { suppressEvents: true }).city;
    }

    expect(edicted.stats.happiness).toBeGreaterThan(base.stats.happiness);
  });

  it('lifting an edict stops the drift advantage within a few extra days', () => {
    const DECLARE_DAYS = 20;
    const EXTRA_DAYS = 15; // past the cooldown

    // Run with edict declared then lifted.
    let lifted = freshCity('edict-lift-test');
    lifted = declareEdict(lifted, 'festival-season');
    for (let i = 0; i < DECLARE_DAYS; i++) {
      lifted = simulateDay(lifted, { suppressEvents: true }).city;
    }

    // Force cooldown to zero so we can lift.
    lifted.edictDeclaredDay = lifted.day - EDICT_COOLDOWN_DAYS;
    lifted = declareEdict(lifted, null);
    for (let i = 0; i < EXTRA_DAYS; i++) {
      lifted = simulateDay(lifted, { suppressEvents: true }).city;
    }

    // A run that stayed edicted the whole time.
    let stayed = freshCity('edict-lift-test');
    stayed = declareEdict(stayed, 'festival-season');
    for (let i = 0; i < DECLARE_DAYS + EXTRA_DAYS; i++) {
      stayed = simulateDay(stayed, { suppressEvents: true }).city;
    }

    // The stayed run should be happier (the drift kept compounding).
    expect(stayed.stats.happiness).toBeGreaterThan(lifted.stats.happiness);
  });
});

describe('edict cooldown', () => {
  it('immediately after declaring, canDeclareEdict for another edict is false with bunting message', () => {
    let city = freshCity('edict-cool-1');
    city = declareEdict(city, 'festival-season');
    const result = canDeclareEdict(city, 'trade-push');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason.toLowerCase()).toContain('bunting');
    }
  });

  it('after simulating enough days the cooldown clears', () => {
    let city = freshCity('edict-cool-2');
    city = declareEdict(city, 'festival-season');
    for (let i = 0; i < EDICT_COOLDOWN_DAYS; i++) {
      city = simulateDay(city, { suppressEvents: true }).city;
    }
    expect(canDeclareEdict(city, 'trade-push').ok).toBe(true);
  });

  it('edictCooldownRemaining returns 0 when no edict declared', () => {
    const city = freshCity('edict-cool-3');
    expect(edictCooldownRemaining(city)).toBe(0);
  });
});

describe('edict faction nudge', () => {
  it('faction satisfaction jumps on declaration but does not keep moving from it', () => {
    let city = freshCity('edict-faction-1');
    // Ensure a street-performers faction exists.
    const performersBefore = city.factions.find((f) => f.archetype === 'street-performers');
    if (!performersBefore) return; // skip if this seed didn't roll them

    const satBefore = performersBefore.satisfaction;
    city = declareEdict(city, 'festival-season');
    const performersAfter = city.factions.find((f) => f.archetype === 'street-performers')!;
    expect(performersAfter.satisfaction).toBeGreaterThan(satBefore);

    // Simulate one day (suppressEvents so the edict drift runs but no event nudges land).
    const satAfterDeclaration = performersAfter.satisfaction;
    const advancedCity = simulateDay(city, { suppressEvents: true }).city;
    const performersFinal = advancedCity.factions.find((f) => f.archetype === 'street-performers')!;
    // The declaration nudge was one-time; drift from the faction system alone
    // should not increase by another +12 in a single tick (it converges slowly).
    expect(Math.abs(performersFinal.satisfaction - satAfterDeclaration)).toBeLessThan(12);
  });
});
