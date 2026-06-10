import type {
  ActiveEvent,
  City,
  GameEventDef,
  HeadlineTemplate,
  NewsItem,
  RiskKind,
  SimulationTickResult,
} from '../types';
import { BOUNDED_STAT_KEYS } from '../types';
import { Rng, hashSeed } from '../utils/rng';
import { clamp, clampStat } from '../utils/math';
import {
  applyChoiceToCity,
  conditionMet,
  instantiateEvent,
  resolveTokens,
  selectRandomEvent,
} from '../events/system';
import { EVENT_POOL } from '../events/data/events';
import { HEADLINE_POOL } from './data/headlines';
import { checkOutcomes } from './outcomes';
import { deriveCityMood } from './mood';

// ---------------------------------------------------------------------------
// The simulation engine. `simulateDay` is a pure function: given a city it
// returns a new city advanced by one day. All randomness derives from the
// city's seed plus the day number, so identical histories replay identically.
// ---------------------------------------------------------------------------

// Council memos are an occasional treat, not a treadmill: no event fires for
// at least this many days after the last one. At Normal speed (1 day/sec)
// the ramp below works out to roughly one event per real-time minute.
const EVENT_MIN_GAP_DAYS = 45;

/** Days the player has to answer a memo before the council shrugs it off. */
export const EVENT_RESPONSE_WINDOW_DAYS = 30;

function dayRng(city: City, label: string): Rng {
  return new Rng(hashSeed(`${city.seed.raw}:${label}:${city.day}`));
}

export interface SimulateDayOptions {
  eventPool?: GameEventDef[];
  headlinePool?: HeadlineTemplate[];
  /** Skip event triggering entirely (used while a memo already awaits the player). */
  suppressEvents?: boolean;
}

export function simulateDay(
  input: City,
  options: SimulateDayOptions = {},
): SimulationTickResult {
  const eventPool = options.eventPool ?? EVENT_POOL;
  const headlinePool = options.headlinePool ?? HEADLINE_POOL;

  const city: City = structuredClone(input);
  city.day += 1;
  city.daysSinceEvent += 1;
  const rng = dayRng(city, 'tick');
  const headlines: NewsItem[] = [];

  applyQuirkDrift(city);
  updateResources(city);
  updateCityStats(city, rng);
  updatePopulation(city, rng);
  updateDistricts(city, rng);
  updateFactions(city);
  updateCitizenGroups(city);
  updateRisks(city, rng);
  rollDisasters(city, rng, headlines);
  rollHeadline(city, rng, headlinePool, headlines);

  const triggeredEvent = options.suppressEvents
    ? null
    : maybeTriggerEvent(city, rng, eventPool);

  city.mood = deriveCityMood(city.stats);
  city.news.push(...headlines);
  trimLog(city.news, 120);
  city.history.push({ day: city.day, stats: { ...city.stats } });
  trimLog(city.history, 365);

  const outcome = checkOutcomes(city, city.outcomeStreaks);
  if (outcome) {
    city.outcome = outcome;
  }

  return { day: city.day, city, headlines, triggeredEvent, outcome };
}

/**
 * Apply the player's chosen response to an event. Returns the new city.
 * Deterministic: the dice for chance outcomes derive from seed+day+choice.
 */
export function applyEventChoice(
  input: City,
  event: ActiveEvent,
  choiceId: string,
): { city: City; news: NewsItem[] } {
  const city = structuredClone(input);
  const choice = event.choices.find((c) => c.id === choiceId);
  if (!choice) throw new Error(`Unknown choice '${choiceId}' for event '${event.defId}'`);
  const rng = new Rng(hashSeed(`${city.seed.raw}:choice:${city.day}:${choiceId}`));
  const { news } = applyChoiceToCity(city, event, choice, rng);
  city.news.push(...news);
  trimLog(city.news, 120);
  city.mood = deriveCityMood(city.stats);
  return { city, news };
}

// ----- Daily systems ---------------------------------------------------------

function applyQuirkDrift(city: City): void {
  for (const quirk of city.quirks) {
    if (!quirk.dailyEffects) continue;
    for (const [key, value] of Object.entries(quirk.dailyEffects)) {
      if (key === 'population') {
        city.stats.population = Math.max(0, Math.round(city.stats.population + value));
      } else {
        const k = key as (typeof BOUNDED_STAT_KEYS)[number];
        city.stats[k] = clampStat(city.stats[k] + value);
      }
    }
  }
}

function updateResources(city: City): void {
  for (const resource of city.resources) {
    resource.amount = Math.max(0, Math.round((resource.amount + resource.trend) * 10) / 10);
  }
}

/**
 * The spiral rules. Each stat drifts according to the others, so good cities
 * compound and troubled cities slide — but slowly enough to steer.
 */
function updateCityStats(city: City, rng: Rng): void {
  const s = city.stats;
  const has = (type: string) => city.districts.some((d) => d.type === type);
  const countOf = (type: string) => city.districts.filter((d) => d.type === type).length;
  const factionHappy = (archetype: string) =>
    city.factions.some((f) => f.archetype === archetype && f.satisfaction > 60);
  const unhappyFactions = city.factions.filter((f) => f.satisfaction < 25).length;

  // Happiness drifts toward a target implied by living conditions.
  const happinessTarget =
    50 +
    (s.food - 50) * 0.25 +
    (s.housing - 50) * 0.2 +
    (s.safety - 50) * 0.2 +
    (s.beauty - 50) * 0.15 +
    (s.culture - 50) * 0.15 -
    (s.pollution - 50) * 0.25 -
    (s.chaos - 50) * 0.3;
  const happiness = s.happiness + (clamp(happinessTarget, 0, 100) - s.happiness) * 0.08;

  // Trust follows happiness slowly; chaos erodes it.
  let trust = s.trust + (s.happiness - s.trust) * 0.04;
  if (s.chaos > 70) trust -= 0.5;

  // Chaos decays naturally but feeds on neglect.
  let chaos = s.chaos - 0.4;
  if (s.safety < 35) chaos += 0.6;
  if (s.housing < 30) chaos += 0.4;
  if (s.food < 25) chaos += 0.7;
  if (s.magic > 75) chaos += 0.3;
  chaos += Math.min(0.8, unhappyFactions * 0.4);

  // Pollution: industry produces it, greenery absorbs it.
  let pollution = s.pollution - 0.25;
  pollution += countOf('industrial') * 0.45;
  if (has('garden')) pollution -= 0.2;
  if (has('forest-edge')) pollution -= 0.15;
  if (factionHappy('gardeners')) pollution -= 0.15;

  // Beauty suffers under smog, blooms with care.
  let beauty = s.beauty + (50 - s.beauty) * 0.01;
  if (s.pollution > 50) beauty -= (s.pollution - 50) * 0.03;
  if (factionHappy('gardeners')) beauty += 0.25;
  if (has('garden')) beauty += 0.1;
  if (s.chaos > 70) beauty -= 0.2;

  // Safety tracks infrastructure, trust and (inverted) chaos.
  const safetyTarget = s.infrastructure * 0.4 + s.trust * 0.3 + (100 - s.chaos) * 0.3;
  let safety = s.safety + (safetyTarget - s.safety) * 0.06;
  if (factionHappy('night-watch')) safety += 0.2;

  // Magic wanders; magical districts leak it.
  let magic = s.magic + rng.range(-0.5, 0.5);
  magic += countOf('magical') * 0.3;
  if (factionHappy('mages')) magic += 0.15;

  // Food from productive districts versus mouths to feed.
  let food = s.food;
  food += countOf('harbor') * 0.25 + countOf('forest-edge') * 0.2 + countOf('garden') * 0.2;
  food += 0.15; // baseline farms outside the walls
  food -= s.population / 9000;
  if (s.pollution > 70) food -= 0.3;

  // Housing decays with growth, improves with infrastructure.
  let housing = s.housing - s.population / 22000;
  if (s.infrastructure > 60) housing += 0.25;
  if (factionHappy('workers')) housing += 0.1;

  // Infrastructure rusts unless someone maintains it.
  let infrastructure = s.infrastructure - 0.18;
  if (factionHappy('engineers')) infrastructure += 0.3;
  if (s.wealth > 65) infrastructure += 0.15;
  if (s.chaos > 70) infrastructure -= 0.3;

  // Culture grows around festivals and academies.
  let culture = s.culture + (40 - s.culture) * 0.008;
  culture += countOf('festival') * 0.2 + countOf('academy') * 0.15;
  if (factionHappy('street-performers')) culture += 0.15;

  // Wealth: trade districts earn, beauty/culture attract spenders, chaos costs.
  let wealth = s.wealth;
  wealth += countOf('market') * 0.25 + countOf('harbor') * 0.2;
  const tourism = (s.culture + s.beauty - 100) * 0.008;
  if (tourism > 0) wealth += tourism;
  if (s.chaos > 60) wealth -= 0.4;
  if (s.infrastructure < 30) wealth -= 0.3;
  if (factionHappy('merchants')) wealth += 0.15;

  s.happiness = clampStat(happiness);
  s.trust = clampStat(trust);
  s.chaos = clampStat(chaos);
  s.pollution = clampStat(pollution);
  s.beauty = clampStat(beauty);
  s.safety = clampStat(safety);
  s.magic = clampStat(magic);
  s.food = clampStat(food);
  s.housing = clampStat(housing);
  s.infrastructure = clampStat(infrastructure);
  s.culture = clampStat(culture);
  s.wealth = clampStat(wealth);
}

function updatePopulation(city: City, rng: Rng): void {
  const s = city.stats;
  // Daily growth in fractions of a percent, driven by livability.
  let ratePct =
    (s.happiness - 50) * 0.004 +
    (s.housing - 50) * 0.002 +
    (s.beauty + s.culture - 100) * 0.001;
  if (s.food < 25) ratePct -= 0.3;
  if (s.chaos > 75) ratePct -= 0.2;
  if (s.pollution > 75) ratePct -= 0.15;
  ratePct += rng.range(-0.03, 0.03);

  const delta = Math.round(city.stats.population * (ratePct / 100));
  city.stats.population = Math.max(0, city.stats.population + delta);

  // Distribute the change across districts proportionally.
  const totalDistrictPop = city.districts.reduce((sum, d) => sum + d.population, 0) || 1;
  for (const district of city.districts) {
    const share = district.population / totalDistrictPop;
    district.population = Math.max(0, Math.round(district.population + delta * share));
  }
}

function updateDistricts(city: City, rng: Rng): void {
  for (const district of city.districts) {
    // District mood drifts toward city happiness, tinted by local conditions.
    let target = city.stats.happiness;
    target += (district.wealth - 50) * 0.15;
    const dominant = city.factions.find((f) => f.id === district.dominantFactionId);
    if (dominant) target += (dominant.satisfaction - 50) * 0.2;
    const localRisk = Math.max(0, ...Object.values(district.risks).map((v) => v ?? 0));
    if (localRisk > 60) target -= 8;
    district.mood = clampStat(district.mood + (clamp(target, 0, 100) - district.mood) * 0.1);

    // Local wealth gravitates gently toward the city's economy.
    district.wealth = clampStat(
      district.wealth + (city.stats.wealth - district.wealth) * 0.01 + rng.range(-0.2, 0.2),
    );

    // Districts build up while life is good — new buildings appear as
    // development climbs — and slowly crumble under sustained misery.
    const vitality =
      (city.stats.happiness + city.stats.wealth + city.stats.infrastructure + district.mood) / 4;
    let growth = (vitality - 32) * 0.012;
    if (city.stats.chaos > 75) growth -= 0.15;
    growth = clamp(growth, -0.2, 0.45);
    district.development = clamp(district.development + growth, 5, 100);
  }
}

function updateFactions(city: City): void {
  for (const faction of city.factions) {
    const preferredAvg =
      faction.preferredStats.reduce((sum, k) => sum + city.stats[k], 0) /
      Math.max(1, faction.preferredStats.length);
    const hatedAvg =
      faction.hatedStats.length > 0
        ? faction.hatedStats.reduce((sum, k) => sum + city.stats[k], 0) /
          faction.hatedStats.length
        : 50;
    // Satisfaction drifts toward how well the city matches their tastes.
    const target = clamp(50 + (preferredAvg - 50) * 0.9 - (hatedAvg - 50) * 0.7, 0, 100);
    faction.satisfaction = clampStat(
      faction.satisfaction + (target - faction.satisfaction) * 0.05,
    );
    // Influence creeps up while they're organized and content.
    const influenceDrift = faction.satisfaction > 60 ? 0.1 : faction.satisfaction < 30 ? 0.15 : -0.05;
    faction.influence = clampStat(faction.influence + influenceDrift);
  }
}

function updateCitizenGroups(city: City): void {
  for (const group of city.citizenGroups) {
    const district = city.districts.find((d) => d.id === group.districtId);
    const target = district ? district.mood : city.stats.happiness;
    group.happiness = clampStat(group.happiness + (target - group.happiness) * 0.08);
    if (district) {
      // Keep group counts roughly in line with their district's population.
      const groupsHere = city.citizenGroups.filter((g) => g.districtId === district.id);
      const totalHere = groupsHere.reduce((sum, g) => sum + g.count, 0) || 1;
      group.count = Math.max(
        0,
        Math.round((group.count / totalHere) * district.population),
      );
    }
  }
}

const RISK_FLAVOR: Record<RiskKind, { rise: string; disaster: string; effects: Record<string, number> }> = {
  fire: {
    rise: 'Fire wardens report "spicy air" downtown.',
    disaster:
      'A fire tears through {district}! The bucket brigade performs heroically; the buckets, less so.',
    effects: { infrastructure: -8, beauty: -5, happiness: -6, housing: -5 },
  },
  flood: {
    rise: 'The river is practicing being taller.',
    disaster:
      'Flooding in {district}! Several basements are now grottos. One is charging admission.',
    effects: { infrastructure: -7, food: -5, happiness: -4 },
  },
  crime: {
    rise: 'Pickpockets have introduced a loyalty program.',
    disaster:
      'A brazen heist ring strikes {district}! They left thank-you notes. Beautifully written ones.',
    effects: { safety: -8, wealth: -6, trust: -4 },
  },
  unrest: {
    rise: 'Someone is printing pamphlets. The angry kind, not the bake-sale kind.',
    disaster:
      'Protests erupt in {district}! The chanting is off-key but the grievances are organized.',
    effects: { chaos: 8, trust: -6, safety: -4 },
  },
  plague: {
    rise: 'The apothecaries are sold out of the good herbs.',
    disaster:
      'A nasty pox sweeps {district}! Symptoms include spots, chills, and brutal honesty.',
    effects: { population: -150, happiness: -8, food: -4 },
  },
  'magical-surge': {
    rise: 'Cats in the magical quarter are walking on the ceiling again.',
    disaster:
      'A magical surge hits {district}! Three houses are briefly upside down. One prefers it.',
    effects: { magic: 6, chaos: 7, infrastructure: -5 },
  },
  'economic-bust': {
    rise: 'Merchants are hoarding coins and looking nervous.',
    disaster:
      'Market crash! The price of everything is wrong and the merchants are openly weeping.',
    effects: { wealth: -10, happiness: -5, trust: -3 },
  },
  monster: {
    rise: 'Something large has been borrowing livestock. Politely, but still.',
    disaster:
      'A creature emerges near {district}! It is enormous, confused, and surprisingly apologetic.',
    effects: { safety: -8, chaos: 6, happiness: -4 },
  },
};

function updateRisks(city: City, rng: Rng): void {
  const s = city.stats;
  const adjust = (kind: RiskKind, delta: number) => {
    const existing = city.risks.find((r) => r.kind === kind);
    if (existing) {
      existing.level = clampStat(existing.level + delta);
    } else if (delta > 0.5) {
      city.risks.push({
        kind,
        level: clampStat(delta * 4),
        description: RISK_FLAVOR[kind].rise,
      });
    }
  };

  adjust('crime', s.safety < 40 ? 0.8 : -0.6);
  adjust('unrest', (s.trust < 30 ? 0.7 : -0.5) + (s.housing < 30 ? 0.4 : 0) + (s.food < 25 ? 0.6 : 0));
  adjust('plague', s.pollution > 65 ? 0.6 : -0.5);
  adjust('magical-surge', s.magic > 70 ? 0.8 : -0.6);
  adjust('fire', (s.chaos > 65 ? 0.4 : -0.3) + (s.infrastructure < 30 ? 0.3 : 0));
  adjust('flood', s.infrastructure < 35 ? 0.4 : -0.3);
  adjust('economic-bust', s.wealth < 25 ? 0.7 : -0.5);
  adjust('monster', (s.magic > 80 ? 0.5 : -0.3) + (s.chaos > 80 ? 0.3 : 0));

  // Prune risks that have faded to nothing.
  city.risks = city.risks.filter((r) => r.level > 2);

  // District risks lean toward their matching city risk.
  for (const district of city.districts) {
    for (const key of Object.keys(district.risks) as RiskKind[]) {
      const cityRisk = city.risks.find((r) => r.kind === key);
      const target = cityRisk ? cityRisk.level : 0;
      const current = district.risks[key] ?? 0;
      district.risks[key] = clampStat(current + (target - current) * 0.05 + rng.range(-0.5, 0.5));
    }
  }
}

function rollDisasters(city: City, rng: Rng, headlines: NewsItem[]): void {
  for (const risk of city.risks) {
    if (risk.level < 60) continue;
    const probability = (risk.level - 60) / 350; // up to ~11% per day at level 100
    if (!rng.chance(probability)) continue;

    const flavor = RISK_FLAVOR[risk.kind];
    const district = rng.pick(city.districts);
    headlines.push({
      day: city.day,
      text: resolveTokens(flavor.disaster, city, district.name, null),
      tone: 'bad',
    });
    for (const [key, value] of Object.entries(flavor.effects)) {
      if (key === 'population') {
        city.stats.population = Math.max(0, city.stats.population + value);
      } else {
        const k = key as (typeof BOUNDED_STAT_KEYS)[number];
        city.stats[k] = clampStat(city.stats[k] + value);
      }
    }
    district.mood = clampStat(district.mood - 10);
    risk.level = clampStat(risk.level - 35); // pressure released
  }
}

function rollHeadline(
  city: City,
  rng: Rng,
  pool: HeadlineTemplate[],
  headlines: NewsItem[],
): void {
  if (!rng.chance(0.4)) return;
  const eligible = pool.filter((h) => conditionMet(h.condition, city));
  if (eligible.length === 0) return;
  const headline = rng.weighted(eligible, (h) => h.weight);
  const district = city.districts.length > 0 ? rng.pick(city.districts) : null;
  const faction = city.factions.length > 0 ? rng.pick(city.factions) : null;
  headlines.push({
    day: city.day,
    text: resolveTokens(headline.text, city, district?.name ?? null, faction?.name ?? null),
    tone: headline.tone,
  });
}

function maybeTriggerEvent(
  city: City,
  rng: Rng,
  eventPool: GameEventDef[],
): ActiveEvent | null {
  // Queued chain events fire on schedule (and take priority).
  const dueIndex = city.queuedEvents.findIndex((q) => q.day <= city.day);
  if (dueIndex >= 0) {
    const due = city.queuedEvents[dueIndex];
    city.queuedEvents.splice(dueIndex, 1);
    const def = eventPool.find((d) => d.id === due.defId);
    if (def) {
      city.daysSinceEvent = 0;
      return instantiateEvent(def, city, rng);
    }
  }

  if (city.daysSinceEvent < EVENT_MIN_GAP_DAYS) return null;
  // Slow ramp past the gap: most memos land within ~10-20 days of eligibility,
  // i.e. around a minute of real time at Normal speed.
  const probability = 0.02 + (city.daysSinceEvent - EVENT_MIN_GAP_DAYS) * 0.012;
  if (!rng.chance(Math.min(0.5, probability))) return null;

  const def = selectRandomEvent(eventPool, city, rng);
  if (!def) return null;
  // The gap counts from when a memo *appears*, so an ignored memo that lapses
  // doesn't cause the next one to fire immediately after.
  city.daysSinceEvent = 0;
  return instantiateEvent(def, city, rng);
}

/**
 * The player let a memo sit unanswered past its response window. The council
 * muddles through on its own; nothing changes except a wry headline.
 */
export function lapseEvent(input: City, event: ActiveEvent): City {
  const city = structuredClone(input);
  city.news.push({
    day: city.day,
    text: `The council quietly settles "${event.title}" without you. They assure you it went fine. Probably.`,
    tone: 'neutral',
  });
  trimLog(city.news, 120);
  return city;
}

function trimLog<T>(log: T[], max: number): void {
  if (log.length > max) log.splice(0, log.length - max);
}
