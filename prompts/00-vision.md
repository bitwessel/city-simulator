# 00 — Vision & Working Agreement

> **Read this file first in every Claude Code session on this project.** Then read the
> phase file you were asked to work on. The phase files assume you know everything here.

## What Mythic Mayor is becoming

Mythic Mayor is a procedural, warm, slightly funny fantasy city simulation for the
browser. Today it is mostly a *watching* game: the simulation drifts, memos arrive,
numbers change. The overhaul described in these prompt files turns it into a **relaxed
diorama-gardening game**: you steer a living, beautiful, randomly-generated-but-structured
world, and the things you decide *visibly appear in the world*.

### The core diagnosis (why this overhaul exists)

Two problems, both fixed across these phases:

1. **The doom spiral.** The stat spirals in `src/simulation/engine.ts` make decay the
   default trajectory. A relaxed game must not punish you for relaxing. A neglected city
   should drift toward *modest mediocrity*, not collapse. (Fixed in phase 02.)
2. **Invisible agency.** The player's only verb is "answer memos," and answers change
   *numbers*, never the *picture*. Nothing the player decides ever physically appears in
   the 3D world. (Fixed in phases 03–06.)

### Visual north star

Five reference images live in the repo root: `hunters.png`, `farm.png`, `medieval.png`,
`industry.png`, `future.png`. They show one city across ages — hunter-gatherer camp to
hyper-advanced metropolis — in a dense, painterly isometric style. **We are not copying
them 1:1.** What we take from them:

- **Continuous terrain**, not floating district discs. Every reference has a river
  anchoring the composition, hills, waterfalls, rocks.
- **Dense negative space**: forests, fields, scattered props between buildings. The
  current renderer is mostly empty plain.
- **Warm, directional lighting** — golden-hour sun, soft shadows, depth.
- **An age progression** as the spine of the experience (their bottom bar: Hunter-Gatherer
  → Neolithic → ... → Modern). Phase 04 builds our fantasy version of this.

We keep the low-poly aesthetic. The references' charm comes from density, terrain, and
lighting — not texture fidelity. Low-poly + good light + full world beats detailed + flat.

## Design pillars

Every feature decision is tested against these. If a proposed mechanic violates one,
don't build it.

1. **Relaxed authorship.** No fail-pressure, no timers, no punishing for stepping away.
   The player gardens; the game never demands. Doom requires *sustained* bad choices.
2. **Visible consequence.** Player decisions should change the 3D world, not just stat
   bars. If a feature only moves numbers, find its visual expression.
3. **Structured randomness.** Every seed grows a *different but coherent* world. The fun
   is "what did I get this time?" — never noise, never sameness.
4. **Determinism is sacred.** Same seed + same player inputs = the exact same run,
   forever. This enables shareable seeds, the test suite, and the worldsmith pipeline.
5. **The city remembers.** Names, choices, and history resurface. Attachment over
   mechanics.
6. **No calendar fail state.** A city is not supposed to die because a clock hit a
   fixed day count. Runs may end from outcomes, but there is no built-in 99/100-day
   ceiling on how long a city can continue.

## Roadmap (build order matters)

Each phase makes the next one more visible. Do them in order unless told otherwise.

| Phase | File | What | Why this order |
|---|---|---|---|
| 01 | `01-living-world-graphics.md` | Terrain, river, scenery, lighting overhaul | Biggest visual leap; everything later renders into this world |
| 02 | `02-relaxed-balance.md` | Retune spirals so relaxing is safe | Cheap, independent; makes the game pleasant to test everything else in |
| 03 | `03-mayor-projects.md` | Placeable projects — the new core verb | Agency on top of the new world |
| 04 | `04-ages-progression.md` | Era system with visual transformation | Long-arc progression; needs the building/mesh systems from 01 |
| 05 | `05-edicts-and-founding.md` | Standing edicts + founding ritual | Steering between memos; founding shows off the 01 terrain |
| 06 | `06-citizens-and-chronicle.md` | Named citizens, photo mode, chronicle | Attachment layer; benefits from everything above existing |
| 07 | `07-worldsmith-pipeline.md` | World-file schema, loader, curated world picker | Engineering for authored worlds |
| 08 | `08-worldsmith-session.md` | Reusable prompt: author a world with agents | Not a code phase — the recurring authoring workflow |

## Architecture rules (non-negotiable)

These already hold throughout the codebase and every phase must preserve them:

- **Simulation is pure TypeScript.** Nothing under `src/simulation/`, `src/generation/`,
  `src/events/`, or `src/types/` may import React, three.js, or anything from
  `src/rendering/`, `src/components/`, or `src/state/`. The Zustand store
  (`src/state/store.ts`) is the only bridge.
- **All randomness flows through the seeded RNG** (`src/utils/rng.ts`, xmur3 +
  mulberry32). New random decisions get their own hashed sub-stream, following the
  existing patterns: the day tick uses `hash(seed + ':tick:' + day)`, choice resolution
  uses `hash(seed + ':choice:' + day + ':' + choiceId)`, expansion uses
  `hash(seed + ':tick:found:' + day)`. Never call `Math.random()` in simulation,
  generation, or anything that affects game state. (Pure cosmetic renderer jitter uses
  `src/rendering/hash.ts`.)
- **Player inputs are replayable.** Every new kind of player input (project starts,
  edicts, founding choices...) must be recorded in the city state the way `eventLog` is,
  so a run can be reproduced from seed + input log. Extend the determinism tests in
  `tests/engine.test.ts` to cover each new input type.
- **New `City` fields are optional** (`?`) so older in-memory states don't crash, and
  everything stays plain serializable data — no class instances, no functions in state.
- **Domain types live in `src/types/index.ts`** and stay UI-free.

## Quality bar & verification ritual

Run this before declaring any phase done:

```bash
npm test                         # full Vitest suite — must pass
npm run build                    # typecheck + production build — must pass
npm run dev                      # then, with the dev server running:
node scripts/smoke.mjs           # headless playthrough — no console errors allowed
node scripts/visual-check.mjs    # screenshots into scripts/shots/ — LOOK at them
```

**Actually read the screenshots** with the Read tool after `visual-check.mjs`. Visual
phases are not done because the code compiles; they are done when the screenshots look
right. Compare against the reference images. If a phase touches visuals, capture at
least 3 different seeds and check: composition, density, lighting, nothing floating,
nothing intersecting badly.

Performance bar: the scene must stay smooth (60fps-ish on a mid-range machine) with the
largest cities (13 districts, late-game building counts). Use `InstancedMesh` for
anything repeated (trees, rocks, citizens already are). Prefer vertex colors and cheap
materials over textures.

Dev environment: Windows 11, PowerShell. Vite + React 19 + TypeScript + React Three
Fiber + Zustand + Vitest + Playwright (already in `package.json`).

## Writing style for game content

Warm, slightly funny, fantasy-flavored. Goblin unions, polite revolutions, suspicious
cheese. Read `src/events/data/events.ts` and `src/simulation/data/headlines.ts` for the
voice before writing any new player-facing text. Never grimdark, never sarcastic at the
player's expense.
