# 02 — Relaxed Balance: Neglect Must Not Mean Doom

> Prerequisite reading: `prompts/00-vision.md`. Independent of the graphics phase; can
> be done in parallel with it. Small in code, large in feel.

## Goal

Retune the simulation so that **a player who just watches has a pleasant time**. Today,
the default trajectory of most seeds is decay — "you watch a city go to shit every
time." After this phase: a neglected city drifts toward *modest, slightly scruffy
mediocrity*; catastrophe requires sustained bad choices, ignored warnings, or rare
disaster chains; and good endings are reachable by gentle, attentive play.

This is a cozy game. The default ending should be "pleasant." Utopia and collapse are
both things you *steer into*, not things that happen to you.

## Current state

- `src/simulation/engine.ts` — `simulateDay`: quirk drift → resources → stat spirals →
  population → district moods → expansion → faction satisfaction → citizen groups →
  risk levels → disaster rolls → headlines → events → mood → outcomes. The spiral rules
  are the heart: happiness drifts toward a target implied by
  food/housing/safety/beauty/culture minus pollution/chaos; chaos decays but feeds on
  low safety, hunger, and furious factions; trust follows happiness and erodes under
  chaos; **low trust dampens the positive half of event choices** (a doom loop:
  struggling city → trust falls → your help stops working → more struggle).
- `src/simulation/outcomes.ts` — eight endings, each needing its condition to hold for
  a streak of days.
- `tests/engine.test.ts` — determinism, 300-day stat-range runs, ending reachability.
  Note: determinism tests compare a seed against itself, so retuning constants does not
  break them.

## Requirements

1. **Write the measurement first.** Add a new Vitest suite (e.g.
   `tests/balance.test.ts`) that runs **hands-off simulations** — 50+ random seeds,
   250+ days, all events resolved the way lapsed memos are (council default), zero
   player input — and asserts the target distribution below. This suite is the
   definition of done; tune the engine until it passes, then leave it as a permanent
   regression guard. Keep runtime reasonable (it's pure TS, hundreds of runs are fine).
2. **Target distribution for hands-off runs** (tune exact numbers in review, but in
   this spirit):
   - Median happiness at day 250 lands in a "fine, not great" band (~40–60).
   - **< 10%** of hands-off runs end in a catastrophic outcome (collapse, ghost-town,
     pollution-wasteland, revolution) by day 250.
   - **0%** of hands-off runs end in a triumphant outcome (utopia, golden-age) — doing
     nothing should be safe, not rewarded.
   - No stat death-spirals to 0/100 and pinned there for the rest of the run in more
     than a handful of seeds.
3. **Likely levers** (diagnose before turning any of them — instrument a few hands-off
   runs and *look at which spiral drags first*):
   - Soften negative spiral coefficients and/or add gentle mean-reversion toward a
     neutral baseline ("cities muddle through").
   - Add a recovery floor: when a stat is very low, its decay slows (people adapt) —
     avoids pinned-at-zero despair.
   - **Cap the trust death loop**: trust dampening of positive choice effects should
     bottom out (e.g. never below ~50% effectiveness) so the player's hand always works.
   - Make council-default resolutions for lapsed memos *mildly* mediocre rather than
     harmful — the council is boring, not malicious.
   - Slow risk accumulation; make big disasters rarer but keep them dramatic when they
     land (drama is fine, inevitability is not). Consider a grace period: no disasters
     before ~day 20.
   - Re-check faction satisfaction decay — furious factions should be the result of
     repeatedly choosing against them, not the passage of time.
4. **Keep play mattering.** After retuning, verify the other direction: a few scripted
   "actively good choices" runs should clearly beat hands-off runs (happier endings
   reachable), and a scripted "actively bad choices" run should still be able to reach
   collapse/revolution. The existing ending-reachability tests must keep passing —
   extend them if they only cover doom endings.
5. **Tone the news feed accordingly.** With a calmer baseline, check headline frequency
   and tone weights in `src/simulation/data/headlines.ts` so the feed isn't all doom
   either — a muddling-through city should produce mostly neutral/weird/cozy headlines.

## Constraints

- Pure-data/constants changes preferred; restructure spiral code only where a clean
  lever is impossible otherwise.
- Determinism untouched: same seed + same inputs = same run. All existing tests pass
  (update any that asserted the *old* balance on purpose, with a comment saying why).
- No UI changes in this phase.

## Acceptance criteria

- [ ] New `tests/balance.test.ts` encodes the hands-off target distribution and passes.
- [ ] Manual check: play 2–3 seeds at high speed doing nothing — the city wobbles but
      survives past day 200 with the feed mostly non-grim.
- [ ] Scripted good-play runs clearly outperform hands-off runs; bad-play runs can
      still reach doom endings.
- [ ] `npm test` and `npm run build` pass; `node scripts/smoke.mjs` passes.
