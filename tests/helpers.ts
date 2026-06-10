import type { City } from '../src/types';
import { BOUNDED_STAT_KEYS } from '../src/types';
import { generateCity } from '../src/generation/generator';
import { applyEventChoice, simulateDay } from '../src/simulation/engine';

/**
 * Run the simulation for up to `days` days, automatically answering every
 * event with its first choice. Stops early if the city reaches an outcome.
 */
export function autoplay(city: City, days: number): City {
  let current = city;
  for (let i = 0; i < days; i++) {
    if (current.outcome) break;
    const result = simulateDay(current);
    current = result.city;
    if (result.triggeredEvent) {
      const choice = result.triggeredEvent.choices[0];
      current = applyEventChoice(current, result.triggeredEvent, choice.id).city;
    }
  }
  return current;
}

export function freshCity(seed = 'test-seed'): City {
  return generateCity(seed);
}

export function expectStatsValid(city: City): void {
  for (const key of BOUNDED_STAT_KEYS) {
    const value = city.stats[key];
    if (!(value >= 0 && value <= 100)) {
      throw new Error(`Stat ${key} out of range on day ${city.day}: ${value}`);
    }
    if (Number.isNaN(value)) {
      throw new Error(`Stat ${key} is NaN on day ${city.day}`);
    }
  }
  if (!(city.stats.population >= 0)) {
    throw new Error(`Population negative on day ${city.day}: ${city.stats.population}`);
  }
}
