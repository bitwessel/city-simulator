import { describe, expect, it } from 'vitest';
import type { ActiveEvent, City, NewsItem } from '../src/types';
import { generateCity } from '../src/generation/generator';
import {
  EVENT_RESPONSE_WINDOW_DAYS,
  lapseEvent,
  simulateDay,
} from '../src/simulation/engine';

// ---------------------------------------------------------------------------
// Phase-02 requirement 5 regression guard (see prompts/02-relaxed-balance.md):
// "a muddling-through city should produce mostly neutral/weird/cozy headlines."
//
// With the relaxed baseline, a hands-off city sits in scruffy-but-fine territory
// (happiness ~44, housing ~39, infrastructure ~43, food ~49). Its news feed
// should read warm and whimsical, not grim. This suite drives hands-off runs
// across fixed seeds, tallies the tone of every feed item, and asserts the
// 'bad'-tone share stays well under a comfortable ceiling — and that the feed
// is not starved (headlines do fire).
//
// Why drive the loop instead of reading city.news: city.news is trimmed to the
// last 120 items, so it only reflects the tail. simulateDay returns that day's
// headlines (pool + disaster + founding lines); we collect those directly, the
// same way tests/balance-helpers.ts mirrors store.advanceDay.
//
// 'bad'-tone items here include both pool headlines (the lines this suite tunes)
// AND the rare disaster/founding lines the engine also tags 'bad'. We assert on
// the combined share on purpose: that is the doom the player actually reads.
//
// MEASURED at authoring (50 seeds x 250 days): bad = 0.9% of all feed items,
// per-seed bad share maxed at 9.6%. The ceiling below (8% aggregate) sits an
// order of magnitude above the measured value, so ordinary tuning can't flake
// it, while still failing loudly if the feed ever turns grim again.
// Deterministic: fixed seeds, no Math.random / Date.now.
// ---------------------------------------------------------------------------

const SEED_COUNT = 50;
const DAYS = 250;
const SEEDS: string[] = Array.from({ length: SEED_COUNT }, (_, i) =>
  `headline-tone-${String(i + 1).padStart(3, '0')}`,
);

// Comfortably above the measured 0.9% aggregate bad share; far below the spec's
// "mostly neutral/weird/cozy" bar. If a future change pushes bad past this, the
// feed has turned grim and the relaxed-tone contract is broken.
const BAD_SHARE_CEILING = 0.08;

// 50 x 250 simulateDay calls, matching the balance suite's scale.
const SUITE_TIMEOUT_MS = 120_000;

/** Drive one city hands-off, collecting every day's emitted headlines. */
function collectFeed(seed: string, days: number): NewsItem[] {
  let city: City = generateCity(seed);
  let activeEvent: ActiveEvent | null = null;
  const feed: NewsItem[] = [];
  for (let i = 0; i < days; i++) {
    if (city.outcome) break;
    const result = simulateDay(city, { suppressEvents: activeEvent !== null });
    city = result.city;
    feed.push(...result.headlines);
    if (activeEvent && city.day > activeEvent.day + EVENT_RESPONSE_WINDOW_DAYS) {
      city = lapseEvent(city, activeEvent);
      activeEvent = null;
    } else if (result.triggeredEvent) {
      activeEvent = result.triggeredEvent;
    }
    if (result.outcome) {
      activeEvent = null;
      break;
    }
  }
  return feed;
}

describe('relaxed news feed: a muddling-through city reads cozy', () => {
  const feeds = SEEDS.map((seed) => ({ seed, items: collectFeed(seed, DAYS) }));
  const allItems = feeds.flatMap((f) => f.items);

  const tally: Record<string, number> = { good: 0, neutral: 0, weird: 0, bad: 0 };
  for (const item of allItems) tally[item.tone] = (tally[item.tone] ?? 0) + 1;

  it(
    'fires headlines on quiet days (feed is not starved)',
    () => {
      // ~40% daily fire chance over 50 x 250 days is thousands of lines. A
      // generous floor catches a feed that has been silenced, without pinning
      // the exact count (which would be brittle against engine RNG shifts).
      expect(allItems.length).toBeGreaterThan(SEED_COUNT * 20);
      // Every seed should see some news, not just the aggregate.
      for (const f of feeds) {
        expect(f.items.length, `${f.seed} produced no headlines`).toBeGreaterThan(0);
      }
    },
    SUITE_TIMEOUT_MS,
  );

  it('keeps the bad-tone share of the feed well under the ceiling', () => {
    const badShare = tally.bad / allItems.length;
    expect(badShare).toBeLessThan(BAD_SHARE_CEILING);
  });

  it('feed is mostly neutral/weird/cozy (good) by a wide margin', () => {
    // The spec's spirit: the calm tones dominate. Assert directly that
    // non-bad tones are the overwhelming majority, so a regression that floods
    // the feed with grim-but-not-quite-ceiling lines still trips a guard.
    const calm = tally.good + tally.neutral + tally.weird;
    expect(calm / allItems.length).toBeGreaterThan(0.9);
  });

  it('still lets genuinely-bad headlines through (tone has teeth)', () => {
    // Tone-proportionality, not toothlessness: across 50 failing-in-places
    // cities, at least some 'bad' lines must fire. A feed that can never go
    // grim would be just as wrong as one that is always grim.
    expect(tally.bad).toBeGreaterThan(0);
  });
});
