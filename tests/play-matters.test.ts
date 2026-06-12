import { describe, expect, it } from 'vitest';
import {
  happinessOnDay,
  isCatastrophic,
  isTriumphant,
  median,
  runHandsOff,
  type HandsOffRun,
} from './balance-helpers';
import { runScriptedPlay, type PlayRun } from './play-helpers';

// ---------------------------------------------------------------------------
// Phase-02 requirement 4: "keep play mattering". The sibling suite
// tests/balance.test.ts proves the relaxed direction — a city you IGNORE
// muddles through to scruffy mediocrity and never wins or loses on its own.
// This suite proves the OTHER direction across the same kind of fixed seed
// list: a city you actively STEER does measurably better, can reach a
// triumphant ending a hands-off city never does, and a city you steer BADLY
// can still be driven into doom.
//
// The two runners are byte-for-byte the same day loop (mirroring advanceDay in
// src/state/store.ts); the only difference is the memo branch — hands-off lets
// every memo lapse stat-neutrally, scripted play answers each one the day it
// fires with a deterministic best/worst-choice policy (see tests/play-helpers.ts).
//
// MARGINS: these assertions use comfortable slack, not the exact measured
// values. Content phases keep growing the event pool, and every new event
// reshuffles which memo fires on which day — so the precise outcome on any
// single seed shifts whenever the pool changes. We therefore assert PAIRWISE
// per-seed comparisons (same seed, same world, only the steering differs) and
// "at least one" reachability, never a specific seed's specific ending, and
// never a bare aggregate of alive runs (that one quietly measures pool
// composition: a golden-age exit removes good play's BEST run from the
// median — phase 04's pool additions exposed exactly that failure mode).
//
// Measured at the time of writing (CHOICE_EFFECT_SCALE = 2.8, 24 seeds x 250d,
// magic-aware good policy, phase-04 pool):
//   pairwise good-vs-off day-250 happiness (both alive, n=16): median +1.4,
//     11 seeds improved vs 5 worsened, big wins +6.0/+9.9/+10.9/+21.1
//   good reaches golden-age x1 | hands-off triumphant 0
//   bad  reaches pollution-wasteland x4 + revolution x2
// ---------------------------------------------------------------------------

const SEED_COUNT = 24;
const DAYS = 250;
const TARGET_DAY = 250;

// Fixed, deterministic seed list: play-001 .. play-024. No randomness anywhere.
const SEEDS: string[] = Array.from({ length: SEED_COUNT }, (_, i) =>
  `play-${String(i + 1).padStart(3, '0')}`,
);

// 24 seeds x 3 policies x 250 days. Comfortably under a minute; generous ceiling
// so a slow CI box doesn't flake.
const SUITE_TIMEOUT_MS = 120_000;

// Median day-250 happiness across the runs still alive at the target day — the
// same apples-to-apples measure tests/balance.test.ts uses for hands-off. An
// ended run has no meaningful day-250 stat, so it is excluded from the median.
function aliveMedianHappiness(runs: { survived: boolean; city: HandsOffRun['city'] }[]): number {
  const vals = runs
    .filter((r) => r.survived)
    .map((r) => happinessOnDay(r.city, TARGET_DAY))
    .filter((h): h is number => h != null);
  return median(vals);
}

// Computed once, shared across assertions.
let good: PlayRun[] = [];
let bad: PlayRun[] = [];
let off: HandsOffRun[] = [];

describe('play matters: active steering beats (and can underperform) hands-off', () => {
  it(
    `runs ${SEED_COUNT} seeds x 250 days under good / bad / hands-off deterministically`,
    () => {
      good = SEEDS.map((s) => runScriptedPlay(s, DAYS, 'good'));
      bad = SEEDS.map((s) => runScriptedPlay(s, DAYS, 'bad'));
      off = SEEDS.map((s) => runHandsOff(s, DAYS));

      // Determinism spot-check: re-running a scripted seed yields an identical
      // ending and identical final stats (same seed + same policy = same run).
      const repeat = runScriptedPlay(SEEDS[0], DAYS, 'good');
      expect(repeat.outcome?.kind).toBe(good[0].outcome?.kind);
      expect(repeat.city.stats).toEqual(good[0].city.stats);

      // Active play actually fires more memos than hands-off: answering a memo
      // the day it lands lets the next one come sooner, where a hands-off run
      // sits on a pending memo for the full 30-day window. That asymmetry is the
      // mechanism by which playing can move a city watching leaves alone.
      const totalAnswered = good.reduce((s, r) => s + r.eventsAnswered, 0);
      expect(totalAnswered, 'good play should answer real memos').toBeGreaterThan(SEED_COUNT);
    },
    SUITE_TIMEOUT_MS,
  );

  it('good play beats hands-off on the same seeds (pairwise day-250 happiness)', () => {
    // Per-seed pairing controls for seed difficulty and for runs leaving the
    // alive pool: only seeds where BOTH runs reached day 250 are compared.
    const diffs: number[] = [];
    for (let i = 0; i < SEED_COUNT; i++) {
      if (!good[i].survived || !off[i].survived) continue;
      const g = happinessOnDay(good[i].city, TARGET_DAY);
      const o = happinessOnDay(off[i].city, TARGET_DAY);
      if (g == null || o == null) continue;
      diffs.push(g - o);
    }
    // Measured n=16; demand a healthy comparable sample.
    expect(diffs.length, 'need both-alive pairs to compare').toBeGreaterThanOrEqual(10);

    // Steering helps on net: the median seed improves (measured +1.4), and
    // clearly more seeds improve than worsen (measured 11 vs 5).
    const med = median(diffs);
    expect(med, `pairwise diffs ${diffs.map((d) => d.toFixed(1)).join(',')}`).toBeGreaterThan(0.4);
    const improved = diffs.filter((d) => d > 0).length;
    const worsened = diffs.filter((d) => d < 0).length;
    expect(improved - worsened, `improved ${improved} vs worsened ${worsened}`).toBeGreaterThanOrEqual(2);

    // And steering can help a LOT: a real tail of big wins (measured 4 seeds
    // at +5 or better, up to +21).
    const bigWins = diffs.filter((d) => d >= 5).length;
    expect(bigWins, 'expect at least a couple of decisive wins').toBeGreaterThanOrEqual(2);
  });

  it('good play makes a triumphant ending reachable (hands-off never does)', () => {
    // The headline play-matters claim: utopia / golden-age are things you steer
    // INTO. Measured: 2 golden-age endings under good play, 0 under hands-off.
    const goodTriumphant = good.filter((r) => isTriumphant(r.outcome?.kind));
    expect(goodTriumphant.length, 'good play should reach >=1 triumphant ending').toBeGreaterThanOrEqual(1);
    // And the milestone-A contract direction must still hold on this seed list:
    // doing nothing never wins.
    const offTriumphant = off.filter((r) => isTriumphant(r.outcome?.kind));
    expect(offTriumphant.length, 'hands-off must never end triumphantly').toBe(0);
  });

  it('good play never has MORE catastrophes than hands-off', () => {
    // Steering well must not make collapse/ghost-town/wasteland/revolution more
    // likely than ignoring the city. Measured: good 4, hands-off 5.
    const goodCat = good.filter((r) => isCatastrophic(r.outcome?.kind)).length;
    const offCat = off.filter((r) => isCatastrophic(r.outcome?.kind)).length;
    expect(goodCat, `good ${goodCat} vs hands-off ${offCat}`).toBeLessThanOrEqual(offCat);
  });

  it('bad play can still steer a city into doom', () => {
    // The dark mirror: a mayor who picks the worst option every time should be
    // able to reach a catastrophic ending somewhere in the list. Measured: bad
    // play reaches revolution (~day 146) and an early pollution-wasteland.
    const badDoom = bad.filter((r) => isCatastrophic(r.outcome?.kind));
    expect(badDoom.length, 'bad play should reach >=1 catastrophic ending').toBeGreaterThanOrEqual(1);
    // Specifically: at least one collapse OR revolution is reachable by bad play
    // (the spec names these two as the "scripted bad choices reach doom" proof).
    const badCollapseOrRevolt = bad.filter(
      (r) => r.outcome?.kind === 'collapse' || r.outcome?.kind === 'revolution',
    );
    expect(
      badCollapseOrRevolt.length,
      'bad play should reach >=1 collapse or revolution',
    ).toBeGreaterThanOrEqual(1);
  });

  it('reports the measured good / bad / hands-off distribution', () => {
    // Not an assertion — a deterministic snapshot surfaced in the test output so
    // future tuners can see where play-matters sits. Always passes.
    const summarize = (label: string, runs: { outcome: { kind: string } | null; survived: boolean; city: HandsOffRun['city'] }[]) => {
      const byKind: Record<string, number> = {};
      for (const r of runs) {
        const k = r.outcome?.kind ?? 'survived';
        byKind[k] = (byKind[k] ?? 0) + 1;
      }
      const med = aliveMedianHappiness(runs);
      const kinds = Object.entries(byKind)
        .sort((a, b) => b[1] - a[1])
        .map(([k, n]) => `${k}:${n}`)
        .join(' ');
      return `  ${label}: median-day250-happiness(alive)=${med.toFixed(1)} | ${kinds}`;
    };
    const lines = [
      '--- play-matters measured distribution (24 seeds x 250 days) ---',
      summarize('good ', good),
      summarize('off  ', off),
      summarize('bad  ', bad),
      '----------------------------------------------------------------',
    ];
    // eslint-disable-next-line no-console
    console.log(lines.join('\n'));
    expect(good.length).toBe(SEED_COUNT);
  });
});
