# Mythic Mayor

Before any work: read `prompts/00-vision.md` — the project vision, design pillars,
architecture rules (pure-TS simulation, seeded RNG determinism), and the verification
ritual every change must pass.

Feature work follows the phase specs in `prompts/` (build order and an index are in
`00-vision.md`). To author a curated world, follow `prompts/08-worldsmith-session.md`.

## Where the project is

- **Phases 01–05 — shipped:** living-world graphics + day/night, relaxed balance,
  mayor projects, ages & progression (five ages, era skins, age bar, the wonder arc),
  edicts & founding (standing edicts with prop layers, the founding ritual).
- **Phase 06 — next:** citizens & chronicle. Spec: `prompts/06-citizens-and-chronicle.md`.
- **Phases 07–08 — not started:** worldsmith pipeline & session.

The roadmap table in `00-vision.md` is the source of truth for build order and rationale.

## Where to read deeper

- **Code map & how the systems work** — `README.md` ("Architecture" onward) is canonical:
  what lives in each `src/` folder, the determinism scheme, and the generation /
  simulation / events / outcomes designs. Read it before navigating the tree; don't
  rediscover it by grepping.
- **Why we're building this way** — `prompts/00-vision.md` (design pillars, visual
  north star, the reference images in the repo root).
- **What a given phase must deliver** — the matching `prompts/0N-*.md` spec.

## Non-negotiables (full text in `00-vision.md`)

- **Pure-TS simulation boundary.** `src/simulation`, `src/generation`, `src/events`,
  `src/types` must never import React, three.js, or anything from `src/rendering`,
  `src/components`, `src/state`. The Zustand store (`src/state/store.ts`) is the only bridge.
- **Determinism is sacred.** All randomness flows through the seeded RNG
  (`src/utils/rng.ts`); each new random decision gets its own `hash(seed + ':...')`
  sub-stream. Never `Math.random()` in sim/generation. Cosmetic renderer jitter uses
  `src/rendering/hash.ts`.
- **Player inputs are replayable.** Every new input type (projects, and now ages/edicts)
  is recorded in `City` state and covered by the determinism tests in `tests/engine.test.ts`.
- **New `City` fields are optional (`?`)** and stay plain serializable data — no classes,
  no functions in state. Domain types live in `src/types/index.ts`, UI-free.

## Commands

The dev server runs on **:5173** — assume one is already running; don't spawn another.
All Playwright scripts below require it (`npm run dev` in a separate terminal).

```bash
npm test                          # full Vitest suite — must pass
npm run build                     # typecheck + production build — must pass
node scripts/smoke.mjs            # headless playthrough; fails on any console error
                                  #   (waits 20–60s for a memo to arrive — by design)
node scripts/visual-check.mjs [seeds...]   # screenshots into scripts/shots/ — LOOK at them
```

Per-phase checks that have accreted (use the one matching what you touched):

```bash
node scripts/project-check.mjs    # phase 03 mayor-projects end-to-end
node scripts/age-check.mjs [seed] # phase 04: forces all five era skins + the wonder
                                  #   stages (dev-only window.__mmDebug bridge) and
                                  #   screenshots each — LOOK at them
node scripts/daynight-check.mjs [seed]     # day/night-cycle screenshots
node scripts/edict-check.mjs [seed]   # phase 05: declares all five edicts through the
                                  #   real UI (steps 11 days between to clear the
                                  #   cooldown), screenshots each prop layer + a
                                  #   lifted-edict control shot — LOOK at them
node scripts/founding-check.mjs [seed]     # phase 05: founding ritual with real choices
                                  #   (site/patron/name); asserts the briefing reacts
node scripts/fps-probe.mjs [seed] [?nofx]  # headed FPS probe — headless = SwiftShader,
                                  #   ~1fps and useless; PostFX auto-degrades, sample
                                  #   early AND late. `?nofx` disables the post chain.
```

Visual phases (01, 04, 06) are done when the **screenshots** look right, not when the
code compiles — actually Read them and compare against the reference images.
