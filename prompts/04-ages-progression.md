# 04 — Ages: A City That Grows Up

> Prerequisite reading: `prompts/00-vision.md`. Builds on phase 01 (mesh/palette
> systems) and phase 03 (projects; the Wonder Age extends them). The reference images
> (`hunters.png` → `farm.png` → `medieval.png` → `industry.png` → `future.png`) are the
> direct inspiration — especially their bottom age-progression bar.

## Goal

Formalize the city's growth into **named ages with visible transformation**:
**Settlement → Village → Town → City → Wonder Age.** Each age re-skins the world
(thatch → timber → stone → grand), unlocks new memo/event types, and arrives with a
celebration. Progression-toward-something is the relaxed game's replacement for
difficulty: even a hands-off player watches their camp become a civilization.

The generator already has the bones: buildings carry `appearAt` development thresholds,
districts have `development` 0..100, and tall "skyscraper era" kinds only appear late.
Ages give this existing staging a *name, a face, and a UI*.

## Current state

- `Building.appearAt` staging + tall kinds (`apartment`, `skyscraper`, `arcane-spire`,
  `grand-hall` with `floors`) — see `src/types/index.ts` and the README's generation
  section.
- `District.development` grows with livability in `src/simulation/engine.ts`.
- Events support `minDay`; mood themes drive palette (`src/rendering/palette.ts`).
- Projects + City Favor from phase 03.

## Requirements

### Simulation

1. **Age model**: an ordered list of age defs (pure data): id, name, flavor blurb,
   entry requirements, palette/mesh era key, unlocks. The city stores its current age
   (optional field) — **ages only advance, never regress** (a city in decline stays in
   its age and just looks scruffier via mood; regression would feel punishing).
2. **Advancement** is *earned but inevitable-ish*: driven by milestones (population
   thresholds, average district development, total districts, landmarks built, days
   survived) rather than razor-edge stat checks, so every surviving run eventually
   progresses. A relaxed pace: a typical run should see Town around the midgame and
   have a shot at the Wonder Age by the late game. Advancement check joins the daily
   tick deterministically. There is no intended hard day cap; the city should be able
   to keep living and growing indefinitely unless an outcome ends the run.
3. **Unlocks per age**: events gain an optional `minAge` (analogous to `minDay`);
   some projects become age-gated; new headlines per age. Write a handful of
   age-specific events (a Village's first tavern brawl; a Town charter dispute; City
   bureaucracy comedy).
4. **The Wonder Age**: entering the final age triggers a special event: the council
   asks *which wonder* the city will raise (3–4 options aligned with different
   playstyles — a Great Garden, a Grand Academy, an Everforge, a Festival Eternal...).
   The chosen wonder is a multi-stage mega-project (reuses phase 03 machinery, several
   construction stages over many days, visible at each stage) and completing it is a
   new triumphant outcome alongside utopia/golden-age in `src/simulation/outcomes.ts`.

### Rendering

5. **Era skins**: building meshes/palettes keyed by age era — same `BuildingKind`,
   different dress: Settlement (tents, thatch, raw wood) → Village (timber frames) →
   Town (stone, tile roofs) → City (brick, ornament, lanterns) → Wonder (banners,
   gilded accents). Implementation freedom: swap geometry variants and/or material
   palettes in `BuildingMesh.tsx` — but the change must be *obvious* in a screenshot.
   Existing buildings re-dress on age change (it's a diorama, not a history sim — a
   brief sparkle/poof transition makes it charming rather than jarring).
6. **Celebration**: age-up moment = headline + fireworks/confetti burst over the city +
   a short toast/banner naming the new age. Joyful, skippable, non-blocking.

### UI

7. **Age progression bar**, inspired directly by the reference images' bottom bar:
   all five ages with the current one highlighted, finished ones marked, future ones
   visible (locked). Hover/tap shows what drives progress toward the next age (soft
   language — "Your city dreams of becoming a Town. Growing population and thriving
   districts will get it there." — not a checklist of exact numbers). Lives at the
   bottom of the game screen (`src/components/GameScreen.tsx` / `ControlBar.tsx` area)
   without crowding the existing controls.

### Tests

8. Hands-off runs (phase 02's balance suite style) reach at least Village/Town by
   late game across most seeds; ages never regress; advancement is deterministic.
9. Wonder outcome reachable in a scripted good-play run (extend ending-reachability
   tests).
10. Event/project pool integrity extended for `minAge` validity.

## Acceptance criteria

- [ ] Five ages; screenshots of the same seed in different ages look unmistakably
      different (capture via `scripts/visual-check.mjs` with forced ages or a long run).
- [ ] Age bar in the UI matching the spirit of the reference mockups.
- [ ] Age-up celebration feels like a reward; news feed announces it.
- [ ] Wonder Age choice event works; wonder builds in visible stages; wonder completion
      is a triumphant ending.
- [ ] All tests pass; `npm test`, `npm run build`, `node scripts/smoke.mjs` green.

## Out of scope

- Real historical eras / technology trees — this stays fantasy and light.
- The hyper-futuristic look of `future.png` — our final age is "fantasy wonder," not
  sci-fi. (If a `magical` district wants floating bits in the Wonder Age, that's taste,
  not scope creep — keep it subtle.)
- Per-district age divergence (the *city* has one age; districts express it through
  development as they already do).
