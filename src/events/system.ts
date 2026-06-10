import type {
  ActiveEvent,
  BoundedStatKey,
  ChanceOutcome,
  City,
  EventChoice,
  EventCondition,
  GameEventDef,
  NewsItem,
  StatDelta,
  StatKey,
} from '../types';
import type { Rng } from '../utils/rng';
import { clampStat } from '../utils/math';

// Event mechanics: condition checks, weighted selection, token resolution and
// applying choice consequences. Event *content* lives in src/events/data.

// ----- Conditions -----------------------------------------------------------

export function conditionMet(condition: EventCondition | undefined, city: City): boolean {
  if (!condition) return true;
  if (condition.minStats) {
    for (const [key, value] of Object.entries(condition.minStats)) {
      if (city.stats[key as StatKey] < (value as number)) return false;
    }
  }
  if (condition.maxStats) {
    for (const [key, value] of Object.entries(condition.maxStats)) {
      if (city.stats[key as StatKey] > (value as number)) return false;
    }
  }
  if (condition.requiresQuirkId) {
    if (!city.quirks.some((q) => q.id === condition.requiresQuirkId)) return false;
  }
  if (condition.factionUnhappy) {
    const f = city.factions.find(
      (fa) => fa.archetype === condition.factionUnhappy!.archetype,
    );
    if (!f || f.satisfaction > condition.factionUnhappy.below) return false;
  }
  return true;
}

export function eventIsEligible(def: GameEventDef, city: City): boolean {
  if (def.chainOnly) return false;
  if (def.once && city.firedEventIds.includes(def.id)) return false;
  if (def.minDay !== undefined && city.day < def.minDay) return false;
  if (def.involvedFaction && !city.factions.some((f) => f.archetype === def.involvedFaction)) {
    return false;
  }
  if (
    def.involvedDistrictType &&
    !city.districts.some((d) => d.type === def.involvedDistrictType)
  ) {
    return false;
  }
  return conditionMet(def.condition, city);
}

/** Effective selection weight: base weight times any quirk tag biases. */
export function eventWeight(def: GameEventDef, city: City): number {
  let weight = def.weight;
  for (const quirk of city.quirks) {
    if (!quirk.eventTagBias) continue;
    for (const tag of def.tags) {
      const bias = quirk.eventTagBias[tag];
      if (bias !== undefined) weight *= bias;
    }
  }
  return weight;
}

// ----- Selection & instantiation ------------------------------------------------

export function selectRandomEvent(
  pool: GameEventDef[],
  city: City,
  rng: Rng,
): GameEventDef | null {
  const eligible = pool.filter((def) => eventIsEligible(def, city));
  if (eligible.length === 0) return null;
  return rng.weighted(eligible, (def) => eventWeight(def, city));
}

export function resolveTokens(
  text: string,
  city: City,
  districtName: string | null,
  factionName: string | null,
): string {
  return text
    .replaceAll('{city}', city.name)
    .replaceAll('{district}', districtName ?? 'the city')
    .replaceAll('{faction}', factionName ?? 'a concerned citizen group');
}

export function instantiateEvent(
  def: GameEventDef,
  city: City,
  rng: Rng,
): ActiveEvent {
  const faction = def.involvedFaction
    ? city.factions.find((f) => f.archetype === def.involvedFaction) ?? null
    : null;
  const district = def.involvedDistrictType
    ? city.districts.find((d) => d.type === def.involvedDistrictType) ?? null
    : faction?.homeDistrictId
      ? city.districts.find((d) => d.id === faction.homeDistrictId) ?? null
      : city.districts.length > 0
        ? rng.pick(city.districts)
        : null;

  const districtName = district?.name ?? null;
  const factionName = faction?.name ?? null;
  return {
    defId: def.id,
    day: city.day,
    title: resolveTokens(def.title, city, districtName, factionName),
    description: resolveTokens(def.description, city, districtName, factionName),
    districtId: district?.id ?? null,
    factionId: faction?.id ?? null,
    choices: def.choices.map((choice) => ({
      ...choice,
      label: resolveTokens(choice.label, city, districtName, factionName),
      description: choice.description
        ? resolveTokens(choice.description, city, districtName, factionName)
        : undefined,
      resultText: resolveTokens(choice.resultText, city, districtName, factionName),
    })),
  };
}

// ----- Applying consequences ---------------------------------------------------------

/**
 * Apply a stat delta to the city (in place — callers pass an already-copied
 * city). Low trust dampens the *positive* part of player-driven effects:
 * a city that doesn't believe in you doesn't respond to your policies.
 */
export function applyStatDelta(
  city: City,
  delta: StatDelta,
  options: { trustDampened?: boolean } = {},
): void {
  const dampen = options.trustDampened
    ? Math.max(0.4, Math.min(1, city.stats.trust / 60))
    : 1;
  for (const [key, raw] of Object.entries(delta)) {
    const statKey = key as StatKey;
    let amount = raw as number;
    if (amount > 0) amount *= dampen;
    if (statKey === 'population') {
      city.stats.population = Math.max(0, Math.round(city.stats.population + amount));
    } else {
      city.stats[statKey as BoundedStatKey] = clampStat(
        city.stats[statKey as BoundedStatKey] + amount,
      );
    }
  }
}

export function applyFactionEffects(
  city: City,
  effects: ChanceOutcome['factionEffects'],
): void {
  if (!effects) return;
  for (const [archetype, delta] of Object.entries(effects)) {
    const faction = city.factions.find((f) => f.archetype === archetype);
    if (faction) {
      faction.satisfaction = clampStat(faction.satisfaction + (delta as number));
    }
  }
}

export interface ChoiceApplication {
  news: NewsItem[];
}

/**
 * Apply a chosen event response to the city (city must be a fresh copy).
 * Rolls chance outcomes and queues any chain events.
 */
export function applyChoiceToCity(
  city: City,
  event: ActiveEvent,
  choice: EventChoice,
  rng: Rng,
): ChoiceApplication {
  const news: NewsItem[] = [];
  const district = event.districtId
    ? city.districts.find((d) => d.id === event.districtId) ?? null
    : null;
  const districtName = district?.name ?? null;
  const factionName = event.factionId
    ? city.factions.find((f) => f.id === event.factionId)?.name ?? null
    : null;

  applyStatDelta(city, choice.effects, { trustDampened: true });
  applyFactionEffects(city, choice.factionEffects);

  if (choice.districtEffects && district) {
    if (choice.districtEffects.mood !== undefined) {
      district.mood = clampStat(district.mood + choice.districtEffects.mood);
    }
    if (choice.districtEffects.wealth !== undefined) {
      district.wealth = clampStat(district.wealth + choice.districtEffects.wealth);
    }
    if (choice.districtEffects.population !== undefined) {
      district.population = Math.max(
        0,
        Math.round(district.population + choice.districtEffects.population),
      );
    }
  }

  news.push({
    day: city.day,
    text: resolveTokens(choice.resultText, city, districtName, factionName),
    tone: 'neutral',
  });

  for (const outcome of choice.outcomes ?? []) {
    if (!rng.chance(outcome.chance)) continue;
    if (outcome.effects) applyStatDelta(city, outcome.effects);
    applyFactionEffects(city, outcome.factionEffects);
    news.push({
      day: city.day,
      text: resolveTokens(outcome.description, city, districtName, factionName),
      tone: 'weird',
    });
    if (outcome.queueEventId) {
      const [lo, hi] = outcome.delayDays ?? [2, 4];
      city.queuedEvents.push({
        defId: outcome.queueEventId,
        day: city.day + rng.int(lo, hi),
      });
    }
  }

  if (choice.unlocksEventId) {
    city.queuedEvents.push({
      defId: choice.unlocksEventId,
      day: city.day + rng.int(2, 4),
    });
  }

  city.eventLog.push({ day: city.day, defId: event.defId, choiceId: choice.id });
  if (!city.firedEventIds.includes(event.defId)) {
    city.firedEventIds.push(event.defId);
  }
  city.daysSinceEvent = 0;
  return { news };
}
