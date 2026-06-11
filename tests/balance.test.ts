import { describe, expect, it } from 'vitest';
import { expectStatsValid } from './helpers';
import {
  happinessOnDay,
  isCatastrophic,
  isTriumphant,
  median,
  pinnedStats,
  runHandsOff,
  type HandsOffRun,
} from './balance-helpers';
import type { OutcomeKind } from '../src/types';

// ---------------------------------------------------------------------------
// Phase-02 relaxed-balance regression guard. See prompts/02-relaxed-balance.md.
//
// This suite is the "measurement first" deliverable: it encodes, as permanent
// assertions, what "relaxed" means for a player who does nothing. A neglected
// city should drift toward modest, slightly-scruffy mediocrity — not collapse,
// and not utopia. The engine is then tuned until this suite passes; afterward
// it stays as the regression guard so future changes can't quietly reintroduce
// the doom spiral.
//
// IMPORTANT: this suite is EXPECTED TO FAIL against the pre-tuning engine. That
// is correct. The numbers below are the *targets* from the spec, not a fit to
// current behaviour. Do not weaken them to make the suite green — tune the
// engine instead.
//
// The target bands (requirement 2 of the spec):
//   - Median day-250 happiness (across runs alive at 250) in 40..60
//     ("fine, not great" — the relaxed baseline).
//   - < 10% of runs end catastrophically by day 250
//     (collapse / ghost-town / pollution-wasteland / revolution — bucketed by
//     KIND per the spec, not by tone).
//   - 0% of runs end triumphantly (utopia / golden-age) — doing nothing is
//     safe, never rewarded.
//   - Death-spiral guard: no more than ~5 / 50 seeds may have a stat pinned at
//     a bad extreme for the whole final-50-day tail (see pinnedStats()).
// ---------------------------------------------------------------------------

const SEED_COUNT = 50;
const DAYS = 250;
const TARGET_DAY = 250;

// Fixed, deterministic seed list: balance-001 .. balance-050. No randomness.
const SEEDS: string[] = Array.from({ length: SEED_COUNT }, (_, i) =>
  `balance-${String(i + 1).padStart(3, '0')}`,
);

// 50 x 250 simulateDay calls (each structuredClones a city) is the bulk of the
// cost; the harness adds no extra deep copies. Comfortably under ~90s, but give
// a generous ceiling so a slow CI box doesn't flake.
const SUITE_TIMEOUT_MS = 120_000;

// Run every seed once and share the results across assertions. Computed lazily
// inside the describe so the work happens when the suite runs, not at import.
let runs: HandsOffRun[] = [];

describe('relaxed balance: hands-off runs muddle through', () => {
  it(
    `runs ${SEED_COUNT} hands-off seeds for ${DAYS} days deterministically`,
    () => {
      runs = SEEDS.map((seed) => runHandsOff(seed, DAYS));
      // Determinism spot-check: re-running a seed yields an identical ending.
      const repeat = runHandsOff(SEEDS[0], DAYS);
      expect(repeat.outcome?.kind).toBe(runs[0].outcome?.kind);
      expect(repeat.city.stats).toEqual(runs[0].city.stats);
      expect(runs).toHaveLength(SEED_COUNT);
    },
    SUITE_TIMEOUT_MS,
  );

  it('keeps every stat valid in every run, every day', () => {
    for (const run of runs) {
      expectStatsValid(run.city);
      // History snapshots must also be in-range (catches transient blowups
      // that recovered before the final day).
      for (const snap of run.city.history) {
        for (const [key, value] of Object.entries(snap.stats)) {
          if (key === 'population') {
            expect(value, `${run.seed} pop day ${snap.day}`).toBeGreaterThanOrEqual(0);
          } else {
            expect(value, `${run.seed} ${key} day ${snap.day}`).toBeGreaterThanOrEqual(0);
            expect(value, `${run.seed} ${key} day ${snap.day}`).toBeLessThanOrEqual(100);
          }
        }
      }
    }
  });

  it('median day-250 happiness lands in the relaxed band (40..60)', () => {
    // Median across runs still alive at the target day (an ended run has no
    // meaningful day-250 stat). Per spec requirement 2.
    const aliveHappiness = runs
      .filter((r) => r.survived)
      .map((r) => happinessOnDay(r.city, TARGET_DAY))
      .filter((h): h is number => h != null);

    expect(aliveHappiness.length, 'need surviving runs to take a median').toBeGreaterThan(0);
    const med = median(aliveHappiness);
    expect(med).toBeGreaterThanOrEqual(40);
    expect(med).toBeLessThanOrEqual(60);
  });

  it('fewer than 10% of runs end catastrophically by day 250', () => {
    const catastrophic = runs.filter((r) => isCatastrophic(r.outcome?.kind));
    // < 10% of 50 = fewer than 5 runs (so at most 4).
    expect(catastrophic.length).toBeLessThan(SEED_COUNT * 0.1);
  });

  it('no run ends triumphantly (doing nothing is safe, not rewarded)', () => {
    const triumphant = runs.filter((r) => isTriumphant(r.outcome?.kind));
    expect(triumphant.length).toBe(0);
  });

  it('at most 5 of 50 seeds death-spiral a stat pinned at a bad extreme', () => {
    // Pinned = a bounded stat at <=2 (or chaos/pollution >=98) for the entire
    // final-50-day tail of the run. This is the "pinned at 0/100 for the rest
    // of the run" despair the spec caps at a handful of seeds.
    const pinned = runs
      .map((r) => ({ seed: r.seed, ...pinnedStats(r.city, 50) }))
      .filter((p) => p.pinned);
    expect(pinned.length).toBeLessThanOrEqual(5);
  });

  it('once the catastrophe cap holds, at least 90% of runs reach day 250', () => {
    // With catastrophes capped and triumphs impossible, almost everything
    // should still be running at the horizon. The only early endings left are
    // the rare weird ones (magical-singularity / wild-reclamation), which are
    // acceptable colour, not failures — so we allow up to 10% non-survivors.
    const survivors = runs.filter((r) => r.survived);
    expect(survivors.length).toBeGreaterThanOrEqual(Math.ceil(SEED_COUNT * 0.9));
  });

  it('reports the current measured distribution for the tuner', () => {
    // Not a balance assertion — a deterministic snapshot of where the engine
    // currently sits, surfaced in the test output so the tuning task has the
    // numbers. Always passes; read the console line when the suite runs.
    const byKind: Record<string, { count: number; days: number[] }> = {};
    for (const run of runs) {
      const kind: OutcomeKind | 'survived' = run.outcome?.kind ?? 'survived';
      const entry = (byKind[kind] ??= { count: 0, days: [] });
      entry.count += 1;
      if (run.outcomeDay != null) entry.days.push(run.outcomeDay);
    }

    const aliveHappiness = runs
      .filter((r) => r.survived)
      .map((r) => happinessOnDay(r.city, TARGET_DAY))
      .filter((h): h is number => h != null);
    const med = aliveHappiness.length ? median(aliveHappiness) : NaN;

    const pinned = runs
      .map((r) => ({ seed: r.seed, ...pinnedStats(r.city, 50) }))
      .filter((p) => p.pinned);

    const lines = [
      '--- relaxed-balance measured distribution (hands-off, 50 seeds x 250 days) ---',
      `median day-250 happiness (alive=${aliveHappiness.length}): ${med.toFixed(1)}`,
      'outcomes by kind (count @ days):',
      ...Object.entries(byKind)
        .sort((a, b) => b[1].count - a[1].count)
        .map(([kind, e]) =>
          `  ${kind}: ${e.count}` +
          (e.days.length ? ` @ [${e.days.sort((x, y) => x - y).join(', ')}]` : ''),
        ),
      `pinned-stat seeds (${pinned.length}): ` +
        (pinned.length
          ? pinned.map((p) => `${p.seed}(${p.stats.join('+')})`).join(', ')
          : 'none'),
      '-----------------------------------------------------------------------------',
    ];
    // eslint-disable-next-line no-console
    console.log(lines.join('\n'));
    expect(runs.length).toBe(SEED_COUNT);
  });
});
