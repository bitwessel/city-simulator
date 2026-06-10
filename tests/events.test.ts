import { describe, expect, it } from 'vitest';
import { EVENT_POOL } from '../src/events/data/events';
import { QUIRK_POOL } from '../src/generation/data/quirks';
import { HEADLINE_POOL } from '../src/simulation/data/headlines';
import {
  conditionMet,
  eventIsEligible,
  eventWeight,
  selectRandomEvent,
} from '../src/events/system';
import { Rng } from '../src/utils/rng';
import { freshCity } from './helpers';

describe('event pool integrity', () => {
  it('has enough content to stay fresh', () => {
    expect(EVENT_POOL.length).toBeGreaterThanOrEqual(25);
    expect(QUIRK_POOL.length).toBeGreaterThanOrEqual(20);
    expect(HEADLINE_POOL.length).toBeGreaterThanOrEqual(10);
  });

  it('has unique event and quirk ids', () => {
    const eventIds = EVENT_POOL.map((e) => e.id);
    expect(new Set(eventIds).size).toBe(eventIds.length);
    const quirkIds = QUIRK_POOL.map((q) => q.id);
    expect(new Set(quirkIds).size).toBe(quirkIds.length);
  });

  it('every event has 2-4 choices with effects and result text', () => {
    for (const event of EVENT_POOL) {
      expect(event.choices.length, `event ${event.id}`).toBeGreaterThanOrEqual(2);
      expect(event.choices.length, `event ${event.id}`).toBeLessThanOrEqual(4);
      const choiceIds = event.choices.map((c) => c.id);
      expect(new Set(choiceIds).size, `event ${event.id}`).toBe(choiceIds.length);
      for (const choice of event.choices) {
        expect(choice.resultText.length, `event ${event.id} choice ${choice.id}`).toBeGreaterThan(0);
        expect(choice.effects, `event ${event.id} choice ${choice.id}`).toBeDefined();
      }
    }
  });

  it('every chain reference points to a real event', () => {
    const ids = new Set(EVENT_POOL.map((e) => e.id));
    for (const event of EVENT_POOL) {
      for (const choice of event.choices) {
        if (choice.unlocksEventId) {
          expect(ids.has(choice.unlocksEventId), `${event.id} -> ${choice.unlocksEventId}`).toBe(true);
        }
        for (const outcome of choice.outcomes ?? []) {
          expect(outcome.chance).toBeGreaterThan(0);
          expect(outcome.chance).toBeLessThanOrEqual(1);
          if (outcome.queueEventId) {
            expect(ids.has(outcome.queueEventId), `${event.id} -> ${outcome.queueEventId}`).toBe(true);
          }
        }
      }
    }
  });

  it('chain-only events are never selected randomly', () => {
    const city = freshCity('chain-only-test');
    for (const event of EVENT_POOL.filter((e) => e.chainOnly)) {
      expect(eventIsEligible(event, city)).toBe(false);
    }
  });

  it('once-events do not repeat', () => {
    const city = freshCity('once-test');
    const onceEvent = EVENT_POOL.find((e) => e.once && !e.chainOnly);
    if (!onceEvent) return; // pool may legitimately have none outside chains
    city.firedEventIds.push(onceEvent.id);
    expect(eventIsEligible(onceEvent, city)).toBe(false);
  });
});

describe('event mechanics', () => {
  it('respects stat conditions', () => {
    const city = freshCity('condition-test');
    city.stats.pollution = 20;
    expect(conditionMet({ minStats: { pollution: 60 } }, city)).toBe(false);
    city.stats.pollution = 70;
    expect(conditionMet({ minStats: { pollution: 60 } }, city)).toBe(true);
    expect(conditionMet({ maxStats: { pollution: 50 } }, city)).toBe(false);
    expect(conditionMet(undefined, city)).toBe(true);
  });

  it('quirk tag bias multiplies event weight', () => {
    const city = freshCity('bias-test');
    city.quirks = [
      {
        id: 'test-quirk',
        title: 'Test',
        description: 'Test',
        eventTagBias: { goblin: 2 },
      },
    ];
    const goblinEvent = EVENT_POOL.find((e) => e.tags.includes('goblin') && !e.chainOnly);
    expect(goblinEvent).toBeDefined();
    const biased = eventWeight(goblinEvent!, city);
    city.quirks = [];
    const unbiased = eventWeight(goblinEvent!, city);
    expect(biased).toBeCloseTo(unbiased * 2, 5);
  });

  it('only selects events whose faction/district requirements the city meets', () => {
    const city = freshCity('selection-test');
    const rng = new Rng(123);
    for (let i = 0; i < 50; i++) {
      const def = selectRandomEvent(EVENT_POOL, city, rng);
      expect(def).not.toBeNull();
      if (def!.involvedFaction) {
        expect(city.factions.some((f) => f.archetype === def!.involvedFaction)).toBe(true);
      }
      if (def!.involvedDistrictType) {
        expect(city.districts.some((d) => d.type === def!.involvedDistrictType)).toBe(true);
      }
    }
  });
});
