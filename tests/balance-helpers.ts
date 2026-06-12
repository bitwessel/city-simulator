import type { ActiveEvent, City, CityOutcome, OutcomeKind } from '../src/types';
import { BOUNDED_STAT_KEYS } from '../src/types';
import { generateCity } from '../src/generation/generator';
import {
  EVENT_RESPONSE_WINDOW_DAYS,
  lapseEvent,
  simulateDay,
} from '../src/simulation/engine';

// ---------------------------------------------------------------------------
// The canonical "hands-off" runner for the phase-02 relaxed-balance suite
// (see prompts/02-relaxed-balance.md). It drives a city for N days with ZERO
// player input, exactly the way the real game loop would if the player never
// touched a memo: memos appear, sit unanswered, and lapse to the council
// default (a stat-neutral news line). This is the trajectory the balance
// targets are defined against — "what happens to someone who just watches".
//
// This loop MUST stay byte-for-byte faithful to `advanceDay` in
// src/state/store.ts, because the balance suite is only meaningful if it
// measures the same simulation the player actually experiences. The mirrored
// pieces:
//   - each day: simulateDay(city, { suppressEvents: activeEvent !== null })
//   - lapse a waiting memo once result.city.day > activeEvent.day + WINDOW
//   - a freshly triggered event becomes the new activeEvent
//   - a reached outcome clears any lingering memo and stops the run
// ---------------------------------------------------------------------------

/** Stat snapshot the engine records once per day in `city.history`. */
export type DaySnapshot = { day: number; stats: City['stats'] };

export interface HandsOffRun {
  seed: string;
  /** The final city state (outcome set iff the run ended early). */
  city: City;
  /** The ending the run reached, or null if it survived all `days`. */
  outcome: CityOutcome | null;
  /** The day the outcome fired, or null if it survived. */
  outcomeDay: number | null;
  /** True if the run was still going (no outcome) at the requested horizon. */
  survived: boolean;
  /**
   * Per-day happiness, indexed straight off `city.history`. Cheap derived view
   * so tests don't re-walk history. One entry per simulated day still in the
   * 365-day window the engine keeps.
   */
  happinessTrajectory: { day: number; happiness: number }[];
}

/**
 * Run a city hands-off for up to `days` days. Returns a summary the balance
 * suite asserts against. Deterministic: same seed + same `days` → same result,
 * no Math.random / Date.now anywhere in the loop.
 */
export function runHandsOff(seed: string, days: number): HandsOffRun {
  let city = generateCity(seed);
  let activeEvent: ActiveEvent | null = null;

  for (let i = 0; i < days; i++) {
    if (city.outcome) break;

    // Mirror store.advanceDay: while a memo waits, no new memo fires.
    const result = simulateDay(city, { suppressEvents: activeEvent !== null });
    city = result.city;

    // A waiting memo lapses once it has sat past the response window. The
    // council settles it offscreen (stat-neutral; lapseEvent only adds news).
    // Order matches the store: lapse-check first, then adopt a new memo.
    if (activeEvent && city.day > activeEvent.day + EVENT_RESPONSE_WINDOW_DAYS) {
      city = lapseEvent(city, activeEvent);
      activeEvent = null;
    } else if (result.triggeredEvent) {
      // No memo was waiting (suppressEvents would have returned null otherwise),
      // so a freshly triggered one becomes the memo the player is ignoring.
      activeEvent = result.triggeredEvent;
    }

    if (result.outcome) {
      // The run is over; a lingering memo no longer matters.
      activeEvent = null;
      break;
    }
  }

  return {
    seed,
    city,
    outcome: city.outcome,
    outcomeDay: city.outcome ? city.outcome.day : null,
    survived: !city.outcome,
    happinessTrajectory: city.history.map((h) => ({
      day: h.day,
      happiness: h.stats.happiness,
    })),
  };
}

// ----- Outcome buckets (per prompts/02-relaxed-balance.md requirement 2) -----
// Bucketed by `kind`, deliberately NOT by `tone`. The spec names ghost-town and
// revolution as catastrophic even though outcomes.ts gives them tone
// 'bittersweet'; the weird endings sit in neither bucket.

export const CATASTROPHIC_OUTCOMES: ReadonlySet<OutcomeKind> = new Set<OutcomeKind>([
  'collapse',
  'ghost-town',
  'pollution-wasteland',
  'revolution',
]);

export const TRIUMPHANT_OUTCOMES: ReadonlySet<OutcomeKind> = new Set<OutcomeKind>([
  'utopia',
  'golden-age',
  // Phase 04: completing a wonder. Safe for the hands-off contract — the
  // wonder only exists if the player answers the wonder-council memo, which a
  // hands-off run never does.
  'wonder',
]);

export function isCatastrophic(kind: OutcomeKind | undefined | null): boolean {
  return kind != null && CATASTROPHIC_OUTCOMES.has(kind);
}

export function isTriumphant(kind: OutcomeKind | undefined | null): boolean {
  return kind != null && TRIUMPHANT_OUTCOMES.has(kind);
}

// ----- Pinned-stat (death-spiral) predicate ----------------------------------
// A "death-spiralled & pinned" stat is one that sat at an extreme *bad* value
// for the entire tail of the run — the despair we are tuning away. We read it
// off `city.history` (the engine keeps the last 365 daily snapshots), looking
// at the final `window` days:
//   - any bounded stat sitting <= 2 continuously (e.g. food/safety/happiness
//     bottomed out), OR
//   - chaos or pollution sitting >= 98 continuously (the two stats where HIGH
//     is the bad extreme).
// "Continuously" = every one of the last `window` snapshots qualifies, so a
// brief dip doesn't count — only a stat that fell in and never climbed back.

const LOW_PIN_THRESHOLD = 2;
const HIGH_PIN_THRESHOLD = 98;
/** Stats whose *high* end is the bad extreme. */
const HIGH_IS_BAD = new Set(['chaos', 'pollution']);

export interface PinnedStatResult {
  /** True if at least one stat was pinned at a bad extreme for the tail window. */
  pinned: boolean;
  /** Which stats were pinned (empty if none). */
  stats: string[];
}

/**
 * Detect stats pinned at a bad extreme for the last `window` days of the run.
 * For runs that ended early (outcome before `window` days), uses whatever tail
 * history exists. A run with too little history to judge is treated as not
 * pinned (it ended fast for a real reason the outcome buckets already catch).
 */
export function pinnedStats(city: City, window = 50): PinnedStatResult {
  const tail = city.history.slice(-window);
  if (tail.length < Math.min(window, 10)) {
    return { pinned: false, stats: [] };
  }
  const stats: string[] = [];
  for (const key of BOUNDED_STAT_KEYS) {
    const high = HIGH_IS_BAD.has(key);
    const allPinned = tail.every((snap) => {
      const v = snap.stats[key];
      return high ? v >= HIGH_PIN_THRESHOLD : v <= LOW_PIN_THRESHOLD;
    });
    if (allPinned) stats.push(key);
  }
  return { pinned: stats.length > 0, stats };
}

/**
 * Happiness recorded on (or nearest before) a target day, read from history.
 * Returns null if the run had no snapshot at/under that day. Used for the
 * "median day-250 happiness" assertion across runs still alive at 250.
 */
export function happinessOnDay(city: City, targetDay: number): number | null {
  let best: number | null = null;
  for (const snap of city.history) {
    if (snap.day <= targetDay) best = snap.stats.happiness;
    else break;
  }
  return best;
}

/** Median of a numeric list (sorted copy; average of the two middles if even). */
export function median(values: number[]): number {
  if (values.length === 0) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}
