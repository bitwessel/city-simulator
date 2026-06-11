# Relaxed-Balance Diagnosis — Hands-Off Runs

> Empirical diagnosis for phase 02 (`prompts/02-relaxed-balance.md`, requirement 3:
> *diagnose before turning any levers*). Method: 40 hands-off simulations of 250 days
> on fixed seeds `diag-001`…`diag-040`, mirroring the real loop in `src/state/store.ts`
> exactly (each day `simulateDay(city, { suppressEvents: activeEvent !== null })`; memos
> lapse stat-neutrally after `EVENT_RESPONSE_WINDOW_DAYS` = 30; zero player choices;
> stop on `city.outcome`). Instrumentation was a temporary vitest file, now deleted.
> Determinism: fixed seeds, no `Math.random`.

---

## 1. Findings

### Outcome distribution (40 runs, 250 days)

| Outcome | Runs | % | Ends (median day) |
|---|---|---|---|
| **magical-singularity** | 24 | **60%** | 69 (min 25, max 213) |
| **golden-age** | 10 | **25%** | 52 (min 34, max 97) |
| collapse | 3 | 8% | 162 (min 90, max 196) |
| survived to 250 | 2 | 5% | — |
| **utopia** | 1 | 3% | 74 |

- **CATASTROPHIC** (collapse / ghost-town / pollution-wasteland / revolution): **3/40 = 8%** — already inside the `<10%` target.
- **TRIUMPHANT** (utopia / golden-age): **11/40 = 28%** — target is **0%**. This is the single biggest miss.
- **Survived neutrally to day 250: only 2/40 = 5%.** The relaxed-game ideal ("muddle through to a fine, scruffy mediocrity") almost never happens. Runs don't doom-spiral — they *escape upward* into an ending, usually a weird/triumphant one, long before day 250.

### The real story: this is NOT a doom spiral. It's a *runaway-to-ending* problem.

The vision (`00-vision.md`) and the spec assume the default trajectory is decay. **The data says the opposite.** A neglected city does not rot; it drifts *up and out* of the neutral band into an outcome, because three stats have no mean-reversion and climb monotonically from district counts:

1. **Magic is the dominant first-dragger of endings.** `updateCityStats` does:
   `magic += rng.range(-0.5, 0.5)` (zero-mean jitter, no pull toward 50) `+ countOf('magical') * 0.3` `+ (mages happy ? 0.15)`. Any city with a magical district gains a relentless **+0.3/day** floor with nothing to oppose it. Magic ends at **median 91** across runs (q1 75.5, max 94.7) and **24/40 runs hit `magic > 90` for 4 days → magical-singularity**, median end day 69. This is by far the most common way a run ends, and it ends *fast*.
2. **Wealth ratchets to the ceiling.** `wealth += countOf('market')*0.25 + countOf('harbor')*0.2 + tourism + (merchants happy?0.15)`, with the only drags being `chaos>60` (−0.4) and `infrastructure<30` (−0.3) — neither common early. Wealth ends at **median 85, with 17/40 runs pinned at 100**. Combined with culture climbing (below), this triggers **golden-age** (`wealth>80 && culture>65 && happiness>60`) in 10 runs, median end day 52.
3. **Culture only rises.** `culture += (40 − culture)*0.008` (a weak pull toward *40*, easily overwhelmed) `+ countOf('festival')*0.2 + countOf('academy')*0.15`. It ends **median 67.8, max 100, never below 50**. Culture is the second half of the golden-age trigger and never falls back.

So the typical "doom" trajectory is actually a **prosperity-overshoot**: stats start ~50, magic/wealth/culture climb without a counterweight, and within ~50–70 days the city trips a triumphant or weird ending. The spec's feared negative spirals (chaos, trust death-loop) are real but *secondary* — they only dominate the handful of seeds that happen to start with a magical-heavy / low-safety layout.

### Happiness over time (the band we actually want to control)

| Day | n | min | q1 | median | q3 | max |
|---|---|---|---|---|---|---|
| 25 | 40 | 44.6 | 51.0 | 55.0 | 57.6 | 63.9 |
| 50 | 40 | 39.6 | 49.0 | 57.0 | 60.5 | 72.8 |
| 100 | 40 | 22.8 | 45.0 | 59.3 | 62.8 | 82.3 |
| 150 | 40 | 22.8 | 44.9 | 59.3 | 62.8 | 82.3 |
| 200 | 40 | 22.0 | 44.9 | 55.2 | 62.2 | 82.3 |
| 250 | 40 | 22.0 | 44.3 | **53.1** | 62.2 | 82.3 |

(Checkpoints carry forward the last recorded value for runs that already ended, so the late rows include cities frozen at their ending state.) **Day-250 median happiness 53.1 is already inside the 40–60 target band.** Happiness itself is well-behaved — `happinessTarget` is a sensible weighted average and the 0.08 lerp is gentle. Happiness is *not* the problem; it is a follower, not a leader.

### Which stat crosses into the bad zone first (<30, or >70 for chaos/pollution)

Dominant first-mover, across the runs where anything goes bad at all:

| First bad stat | Runs |
|---|---|
| **housing** | 11 |
| food | 6 |
| infrastructure | 5 |
| chaos | 1 |
| pollution | 1 |

Median day each stat first crosses bad (and how many of 40 runs ever do):

| Stat | runs ever bad | median first day |
|---|---|---|
| **housing** | 17/40 | 77 |
| infrastructure | 8/40 | 60 |
| food | 7/40 | 44 |
| chaos | 11/40 | 122 |
| trust | 5/40 | 139 |
| safety | 4/40 | 139 |
| happiness | 3/40 | 129 |
| beauty | 2/40 | 39 |
| pollution | 1/40 | 25 |
| wealth / magic / culture | 0/40 | never |

**The negative-side first-dragger is housing**, followed by infrastructure and food — all three are slow monotonic bleeds:
- `housing -= s.population/22000` every day, repaid only by `infrastructure>60` (+0.25) or happy workers (+0.1). As population grows (median end pop 5218), the drain grows with it, so housing sinks: ends **median 32.5, q1 25.9, 2 runs pinned at 0**. Housing < 25/30 then feeds chaos and population outflow.
- `infrastructure -= 0.18` flat every day, repaid only by happy engineers (+0.3), wealth>65 (+0.15). That's **−45 over 250 days** if uncompensated. Ends **median 44.6, q1 34.2, 3 runs at 0**. Low infra (<30/35) then drags safety, wealth, and feeds fire/flood risk.
- `food` has a thin positive base (`+0.15` + district bonuses) minus `population/9000`; it slips under load. Ends median 49.7 but **7 runs cross below 30**, and food<25 is a hard population/chaos penalty.

These three are the *engine of the catastrophic 8%*: housing→chaos and infra→safety/wealth are the chains that, on an unlucky seed, build into collapse (chaos>85 & trust<25, seen in the 3 collapse runs, e.g. seed `diag-003`: infra 0, safety 11, chaos 100, food 10 at day 250).

### Per-stat end state (final value across all 40 runs)

| Stat | min | q1 | median | q3 | max | #pinned ≤2 | #pinned ≥98 |
|---|---|---|---|---|---|---|---|
| happiness | 22.0 | 44.3 | 53.1 | 62.2 | 82.3 | 0 | 0 |
| **wealth** | 41.5 | 78.9 | **85.2** | 100.0 | 100.0 | 0 | **17** |
| chaos | 16.0 | 40.2 | 53.3 | 70.6 | 100.0 | 0 | 4 |
| beauty | 0.0 | 44.2 | 54.2 | 67.0 | 93.3 | 1 | 0 |
| pollution | 0.0 | 15.6 | 33.1 | 54.0 | 71.1 | 5 | 0 |
| safety | 10.5 | 40.4 | 49.5 | 54.1 | 77.4 | 0 | 0 |
| **magic** | 54.0 | 75.5 | **91.2** | 92.3 | 94.7 | 0 | 0 |
| infrastructure | 0.0 | 34.2 | 44.6 | 50.2 | 95.6 | 3 | 0 |
| food | 7.7 | 35.0 | 49.7 | 59.0 | 96.3 | 0 | 0 |
| **housing** | 0.0 | 25.9 | **32.5** | 40.6 | 51.6 | 2 | 0 |
| trust | 19.1 | 48.2 | 52.8 | 58.1 | 71.8 | 0 | 0 |
| culture | 50.3 | 60.5 | 67.8 | 77.6 | 100.0 | 0 | 1 |

Pinning is concentrated: **wealth (17 runs ≥98)** and **magic (median 91, the singularity trigger)** at the top; **pollution (5 ≤2), infrastructure (3 ≤2), housing (2 at 0)** at the bottom. Note pollution is *fine on average* (median 33) — the 5 zeros are clean cities, not a problem. Housing is the most consistently depressed positive stat.

### Disasters

- **disasters/run: median 0** (min 0, max 3); total 9 across 40 runs.
- **first disaster day: median 76** (earliest 22); only 7/40 runs ever had a disaster.
- By kind: magical-surge ×5, plague ×4 (nothing else fired). Both ride the magic/pollution climbs.

Disasters are already rare and never inevitable — the spec's "make big disasters rarer" goal is essentially **already met** in hands-off play. The only adjustment worth making is the explicit **no-disaster grace period** the spec asks for (one surge fired as early as day 22): `rollDisasters` currently has no day floor.

### Risk accumulation

| Day | median max-risk | median #risks |
|---|---|---|
| 10 | 34 | 3 |
| 20 | 31 | 3 |
| 30 | 29 | 2 |
| 50 | 29 | 2 |
| 100 | 44 | 2 |

Risks seed at generation (≈30) and *decay* over the first ~50 days before slowly rebuilding — accumulation is already slow and stays well under the disaster threshold (60) on the median. Risk speed is **not** a problem; risks are healthy. (A grace-period floor on disasters is still worth adding for the rare early surge, but the accumulation rates do not need softening.)

### Factions (zero player choices)

- **14/40 runs have ≥1 faction go furious (<25) at some point**; first-furious median day 74.
- Median (across runs) of the *lowest* faction satisfaction: day 25 → 45.7, day 50 → 38.8, day 100 → 37.4, settling ~36.5. So the worst faction in a typical city sits in the high-30s — grumpy, not furious — but a third of runs do tip one faction into fury **purely from the passage of time**, exactly as the spec suspected.
- End satisfaction by archetype (median): **workers 19.8** (lowest by far), night-watch 37.6, archivists 45.4, …, mages 69.5, gardeners 68.3, merchants 66.4.

The mechanism: `updateFactions` pulls satisfaction toward `50 + (preferredAvg−50)*0.9 − (hatedAvg−50)*0.7`. **Workers prefer `housing`** (among others), and housing reliably decays to ~32 (above) — so workers' target drifts into the 20s with no player input at all. This is the spec's "furious from time alone" effect, and it is **downstream of the housing bleed**, not an independent faction problem. Fix housing and most of the worker fury disappears; the `*0.9 / *0.7` coefficients are otherwise reasonable and need only a mild softening.

### Event cadence

- **memos/run: median 1** (min 0, max 4). With `EVENT_MIN_GAP_DAYS` = 45 and a slow ramp, hands-off cities see very few memos. They all lapse harmlessly. Each pending memo suppresses other events for up to 30 days, but with so few memos this has negligible effect on a 250-day run. **No change needed.**

### Trust dampening (the spec's headline "doom loop")

`applyStatDelta(..., { trustDampened: true })` (`src/events/system.ts:147`) floors at `Math.max(0.4, trust/60)`. **This never engages in hands-off runs** — it only touches *player choice* effects, and there are zero choices. It is a **play-matters lever, not a hands-off lever.** Trust itself stays healthy hands-off (ends median 52.8, min 19.1), so the "struggling → trust falls → help stops working → more struggle" loop is not what drags hands-off cities. Raising the floor 0.4→0.5 is still worth doing for requirement 4 ("keep play mattering" — the player's hand should always work), but it will not move any hands-off metric.

### Root spirals vs. followers

- **Root spiral #1 (dominant): unbounded magic climb → magical-singularity (60% of runs).** No mean-reversion + flat +0.3/day per magical district.
- **Root spiral #2: unbounded wealth + culture climb → golden-age/utopia (28% triumphant).** No ceiling-side reversion.
- **Root spiral #3 (the catastrophic tail): housing & infrastructure flat bleeds → chaos/safety chains → the 8% collapses, and the faction fury.**
- **Followers:** happiness (well-behaved target-follower), trust, safety, chaos, faction satisfaction (worker fury is just the housing bleed wearing a hat).

---

## 2. Recommended levers (ranked by expected impact)

All are inline constants in `src/simulation/engine.ts` unless noted. Numbers are derived from the measured per-day rates above.

### Lever 1 — Add ceiling mean-reversion to **magic** (kills the 60% singularity) — HIGHEST IMPACT
- **File/function:** `engine.ts` → `updateCityStats`, line 195.
- **Current:** `let magic = s.magic + rng.range(-0.5, 0.5);` then `magic += countOf('magical') * 0.3;`
- **Proposed:** add a pull toward a neutral baseline and halve the leak:
  `let magic = s.magic + (50 - s.magic) * 0.01 + rng.range(-0.5, 0.5);`
  and change the district leak `* 0.3` → `* 0.15`.
- **Rationale:** at magic 90 a `(50−90)*0.01 = −0.4/day` pull roughly cancels one magical district's reduced `+0.15` plus jitter, parking magic in the 70s–80s instead of ratcheting past 90. Magic ends median 91 today with the singularity threshold at 90 (streak 4); pulling the steady state below ~85 removes nearly all 24 singularity endings.
- **Predicted effect:** magical-singularity drops from 60% toward single digits; magic end-median ~78–82.

### Lever 2 — Add ceiling reversion to **wealth** and **culture** (kills the 28% triumphant) — HIGH IMPACT
- **File/function:** `engine.ts` → `updateCityStats`, lines 223–229 (wealth) and 218 (culture).
- **Current wealth:** earns from markets/harbors/tourism with drags only at chaos>60 / infra<30. **Current culture:** `culture + (40 − culture) * 0.008 + …` (weak pull toward 40, easily overcome).
- **Proposed:**
  - Wealth: add `wealth += (60 - wealth) * 0.015;` at the top of the wealth block (gentle pull toward a comfortable 60; at wealth 100 that is −0.6/day, enough to offset 2 markets). Optionally trim `countOf('market') * 0.25` → `* 0.2`.
  - Culture: raise the reversion weight and target slightly — `(50 - culture) * 0.012` instead of `(40 - culture) * 0.008` — so culture settles ~55–60 rather than climbing to 80+.
- **Rationale:** golden-age needs `wealth>80 && culture>65 && happiness>60` for 5 days; utopia needs `happiness>80 && beauty>70 && trust>70 && chaos<30`. Wealth pinned at 100 in 17 runs and culture median 68 are what satisfy the golden-age gate. Capping wealth's steady state near 60–70 and culture near 55–60 makes triumphant endings something you must *steer into* (build markets/festivals and answer events well), not the default.
- **Predicted effect:** triumphant outcomes 28% → near 0%; wealth end-median ~65, culture ~58.

### Lever 3 — Stop the **housing** bleed (fixes the dominant negative first-mover *and* worker fury) — HIGH IMPACT
- **File/function:** `engine.ts` → `updateCityStats`, lines 207–209.
- **Current:** `let housing = s.housing - s.population/22000;` repaid only by infra>60 (+0.25) / happy workers (+0.1).
- **Proposed:** soften the population drain and add a gentle floor-reversion:
  `let housing = s.housing - s.population/40000 + (45 - s.housing) * 0.01;`
  (the `(45−housing)*0.01` term self-arrests the decline: at housing 20 it adds +0.25/day, a recovery floor; near 45 it fades out). Keep the infra/worker bonuses.
- **Rationale:** housing is the #1 first-bad stat (11/40), 17/40 cross below 30, ends median 32.5. At median end-pop ~5200, the old drain is `5200/22000 ≈ −0.24/day` and *growing with population*. Halving it to `/40000` (≈ −0.13) plus the reversion term parks housing in the high-30s/low-40s. Because **workers' satisfaction target tracks housing**, this also lifts worker satisfaction out of the fury zone (median 19.8 → ~35+), addressing the spec's "factions furious from time alone."
- **Predicted effect:** housing end-median ~40, near-zero pinning; worker fury largely gone; fewer chaos chains feeding the catastrophic tail.

### Lever 4 — Slow & floor the **infrastructure** rust (recovery floor; trims the collapse tail) — MEDIUM IMPACT
- **File/function:** `engine.ts` → `updateCityStats`, line 212.
- **Current:** `let infrastructure = s.infrastructure - 0.18;`
- **Proposed:** `let infrastructure = s.infrastructure - 0.12 + (40 - s.infrastructure) * 0.01;`
- **Rationale:** flat −0.18/day = −45 over 250 days uncompensated; infra ends median 44.6 with 3 runs at 0, and low infra (<30/35) drags safety, wealth, and feeds fire/flood risk — the spine of the 3 collapse runs. Cutting to −0.12 and adding a reversion-toward-40 floor (at infra 10 → +0.30/day) prevents the pinned-at-zero infra that powers collapse, while still rewarding engineer-friendly play (the +0.3 happy-engineers bonus still clearly wins).
- **Predicted effect:** infra end-median ~40, no zeros; catastrophic share well under 10% with margin.

### Lever 5 — Disaster grace period before day 20 (spec-requested; cheap) — LOW IMPACT but explicitly asked for
- **File/function:** `engine.ts` → `rollDisasters`, line 430.
- **Current:** no day floor; one surge fired as early as day 22 in the data, and the threshold can be met earlier on magical-heavy seeds.
- **Proposed:** add at the top of `rollDisasters`: `if (city.day < 20) return;`
- **Rationale:** matches `prompts/02` ("no disasters before ~day 20") and `outcomes.ts`'s "fair start" philosophy. Risk accumulation is already slow (median max-risk <44 through day 100), so this is a guarantee rather than a rebalance.
- **Predicted effect:** zero disasters in the first 20 days; negligible change to the aggregate disaster rate (already median 0/run).

### Also recommended (requirement 4, not a hands-off lever)
- **Trust-dampen floor `0.4 → 0.5`** in `src/events/system.ts:147` (`Math.max(0.4, …)` → `Math.max(0.5, …)`). Pure play-matters: it guarantees the player's positive choices retain ≥50% effect even in a low-trust city. **No effect on any hands-off metric** (no choices fire) — listed for completeness against the spec's lever list.
- **Faction coefficients:** after Lever 3, leave `updateFactions` (lines 314) mostly alone — worker fury is downstream of housing. If any worker fury remains, soften the hated/preferred weights from `*0.9 / *0.7` to `*0.8 / *0.6`, which compresses faction satisfaction toward 50 (grumpy, not furious) without flattening it. Low priority.

### Levers the data says to **leave alone**
- **Happiness spiral coefficients** — already produces median 53 at day 250, squarely in band. Don't touch the `happinessTarget` weights or the 0.08 lerp.
- **Risk accumulation rates** — already slow; risks decay early and stay under threshold. Only add the grace period (Lever 5), don't soften the `adjust(...)` deltas.
- **Event cadence / `EVENT_MIN_GAP_DAYS`** — median 1 memo/run; no treadmill exists hands-off.
- **Chaos/trust/safety/pollution/beauty spirals** — all well-behaved followers; they only misbehave downstream of housing/infra, which Levers 3–4 fix at the source.

---

## 3. Target (restated) & how these levers hit it

| Target (`prompts/02`) | Current hands-off | After recommended levers (predicted) |
|---|---|---|
| Day-250 median happiness 40–60 | **53.1 ✓** (already met) | ~50–55, still in band |
| <10% catastrophic | **8% ✓** (already met, thin margin) | <5% (Levers 3–4 cut the housing/infra collapse spine) |
| **0% triumphant** | **28% ✗** | ~0–3% (Levers 1–2 remove the magic/wealth/culture runaways) |
| Few stats pinned at 0/100 | wealth 17×100, magic→singularity, infra/housing/pollution zeros | ≤handful (Levers 1–4 add reversion at both ends) |
| Cities *muddle through* to 250 | only **5%** reach 250 neutrally | majority reach 250 in the scruffy-mediocre band |

**The headline for the tuner:** this is not a doom-spiral fix, it's a *runaway-ending* fix. Priority order is **Lever 1 (magic) → Lever 2 (wealth+culture) → Lever 3 (housing) → Lever 4 (infra) → Lever 5 (grace period)**. Levers 1–2 convert the 28% triumphant + 60% singularity into surviving-to-250 cities; Levers 3–4 keep the bottom from falling out and dissolve the worker-fury side effect. Verify against a regenerated `tests/balance.test.ts` after each change; the magic and wealth reversion terms are the two that move the outcome distribution the most, so tune those first and re-measure before touching the rest.
