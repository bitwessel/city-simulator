import type { City, CityOutcome, EventChoice } from '../src/types';
import { generateCity } from '../src/generation/generator';
import { applyEventChoice, simulateDay } from '../src/simulation/engine';

// ---------------------------------------------------------------------------
// Scripted-play runners for the phase-02 "keep play mattering" deliverable
// (prompts/02-relaxed-balance.md requirement 4). These are the mirror image of
// runHandsOff in tests/balance-helpers.ts: the same day loop, faithful to
// `advanceDay` in src/state/store.ts, EXCEPT that when a memo fires the runner
// answers it immediately with applyEventChoice instead of letting it lapse.
//
// Answering immediately is exactly what an attentive player does, and it has a
// real, intended consequence on cadence: a hands-off run leaves a memo pending
// for the full 30-day response window (suppressing every other memo while it
// waits), whereas a scripted-play run clears the memo the same day, so the next
// one can fire sooner. More memos fire under active play. That asymmetry is the
// whole point — it is the mechanism by which "playing" can move a city that
// "watching" leaves alone. We keep it.
//
// Determinism: same seed + same policy = identical run. The policy is a pure
// deterministic function of the choice's declared effects; choice resolution
// uses the engine's existing seed+day+choiceId RNG sub-stream. No Math.random,
// no Date.now anywhere in this file.
// ---------------------------------------------------------------------------

/** Which way the scripted mayor steers: best choices, or worst. */
export type PlayPolicy = 'good' | 'bad';

// Stats where a *higher* value is bad for the city, so a positive effect on
// them should count against a choice's score (and vice-versa).
const HIGH_IS_BAD = new Set(['chaos', 'pollution']);

// Magic is good in moderation and an ending above 90 (the Shimmering). An
// attentive mayor enjoys it low, goes neutral as it climbs, and actively
// avoids feeding it near the singularity threshold — without this the "good"
// policy happily amplifies +magic choices (x2.8) straight into a weird ending,
// and the play-matters medians end up measuring survivorship composition
// instead of steering quality. Thresholds sit well under the outcome's 90 gate.
function magicWeight(city: City | undefined): number {
  const magic = city?.stats.magic ?? 50;
  if (magic < 60) return 1;
  if (magic <= 75) return 0;
  return -1;
}

// Faction satisfaction matters, but a single faction's mood is worth less than
// a point of a city-wide stat — weight it modestly so stat effects dominate the
// ranking (a choice that floods the treasury shouldn't be called "good" just
// because one guild liked it).
const FACTION_WEIGHT = 0.3;

// Population deltas are denominated in people, not 0..100 points, so a raw +150
// would swamp every stat term. Scale it down to roughly stat-sized units.
const POPULATION_WEIGHT = 0.02;

/**
 * Deterministic desirability score for one choice, from its DECLARED effects
 * (no dice are rolled to score — scoring must be pure so the policy is
 * stable). Higher = better for the city.
 *
 *   - stat effects: added as-is, except chaos/pollution which are inverted
 *     (raising them is bad), magic which flips sign as the city nears the
 *     singularity (see magicWeight), and population which is scaled to
 *     stat-sized units;
 *   - faction effects: summed and weighted modestly;
 *   - chance outcomes: counted at their expected value (chance * effect), since
 *     over many runs that is what they contribute on average.
 *
 * The 'good' policy picks the highest score, 'bad' the lowest; ties break by
 * choice order (the caller relies on a stable scan, so equal scores keep their
 * original ordering). Deterministic function of (choice, city stats).
 */
export function scoreChoice(choice: EventChoice, city?: City): number {
  const magicW = magicWeight(city);
  let score = 0;
  score += scoreEffects(choice.effects, magicW);

  if (choice.factionEffects) {
    for (const delta of Object.values(choice.factionEffects)) {
      score += (delta as number) * FACTION_WEIGHT;
    }
  }

  // District nudges: mood/wealth are city-flavoured goods; population is people.
  if (choice.districtEffects) {
    const de = choice.districtEffects;
    if (de.mood !== undefined) score += de.mood;
    if (de.wealth !== undefined) score += de.wealth;
    if (de.population !== undefined) score += de.population * POPULATION_WEIGHT;
  }

  // Chance follow-ups contribute their expected value.
  for (const outcome of choice.outcomes ?? []) {
    if (outcome.effects) score += scoreEffects(outcome.effects, magicW) * outcome.chance;
    if (outcome.factionEffects) {
      for (const delta of Object.values(outcome.factionEffects)) {
        score += (delta as number) * FACTION_WEIGHT * outcome.chance;
      }
    }
  }

  return score;
}

function scoreEffects(
  effects: { [k: string]: number | undefined },
  magicW: number,
): number {
  let sum = 0;
  for (const [key, raw] of Object.entries(effects)) {
    const v = raw as number;
    if (key === 'population') sum += v * POPULATION_WEIGHT;
    else if (key === 'magic') sum += v * magicW;
    else if (HIGH_IS_BAD.has(key)) sum -= v;
    else sum += v;
  }
  return sum;
}

/**
 * Pick a choice per the policy. 'good' = highest score, 'bad' = lowest, with
 * deterministic tie-breaking by choice order (the first choice that achieves
 * the best/worst score wins). Deterministic in (choices, city stats).
 */
export function pickChoice(
  choices: EventChoice[],
  policy: PlayPolicy,
  city?: City,
): EventChoice {
  let best = choices[0];
  let bestScore = scoreChoice(best, city);
  for (let i = 1; i < choices.length; i++) {
    const score = scoreChoice(choices[i], city);
    const better = policy === 'good' ? score > bestScore : score < bestScore;
    if (better) {
      best = choices[i];
      bestScore = score;
    }
  }
  return best;
}

export interface PlayRun {
  seed: string;
  policy: PlayPolicy;
  /** The final city state (outcome set iff the run ended early). */
  city: City;
  outcome: CityOutcome | null;
  outcomeDay: number | null;
  survived: boolean;
  /** Number of memos the scripted mayor actually answered. */
  eventsAnswered: number;
}

/**
 * Run a city for up to `days` days, answering every memo immediately with the
 * scripted policy. Mirrors runHandsOff's loop exactly, except the memo branch:
 * instead of waiting for a memo to lapse, the mayor resolves it the same day it
 * fires via applyEventChoice. Deterministic.
 */
export function runScriptedPlay(seed: string, days: number, policy: PlayPolicy): PlayRun {
  let city = generateCity(seed);
  let eventsAnswered = 0;

  // Unlike runHandsOff, an attentive mayor never leaves a memo pending, so the
  // suppressEvents / lapse machinery the hands-off loop needs is never engaged
  // here: every memo is resolved the day it fires. That is also why active play
  // sees more memos overall — clearing a memo lets the next one come sooner,
  // where a hands-off run sits on one for the full 30-day response window.
  for (let i = 0; i < days; i++) {
    if (city.outcome) break;

    const result = simulateDay(city);
    city = result.city;

    if (result.triggeredEvent) {
      const choice = pickChoice(result.triggeredEvent.choices, policy, city);
      city = applyEventChoice(city, result.triggeredEvent, choice.id).city;
      eventsAnswered += 1;
      // Answering can itself complete an outcome streak (e.g. a choice that
      // tips a stat over the line), so re-check before the next day.
      if (city.outcome) break;
    }

    if (result.outcome) break;
  }

  return {
    seed,
    policy,
    city,
    outcome: city.outcome,
    outcomeDay: city.outcome ? city.outcome.day : null,
    survived: !city.outcome,
    eventsAnswered,
  };
}
