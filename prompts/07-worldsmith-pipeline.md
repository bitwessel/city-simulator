# 07 — Worldsmith Pipeline: Engineering for Authored Worlds

> Prerequisite reading: `prompts/00-vision.md`. This phase is the *engineering* that
> makes hand-crafted worlds possible. The recurring *authoring workflow* (the fun part —
> building worlds with Claude Code agents) is `prompts/08-worldsmith-session.md` and
> depends on this phase being done. Best after phase 01 (terrain in the schema) but the
> schema should anticipate all phases.

## Goal

A **hybrid world system**: the deterministic runtime generator keeps powering "random
seed" mode (structure, replayability, shareable seeds), and a new **world file format**
lets curated, agent-authored worlds layer on top of it. A world file overrides what it
specifies and lets the generator fill everything else — so authoring a world means
sculpting the interesting 20%, not hand-placing every bush.

The end state: the Start screen offers *Random seed* (today's flow) and *Curated
Worlds* (a gallery of checked-in worlds built in Claude Code sessions).

## Requirements

### The world file

1. **Format**: `worlds/<world-id>/world.json` (a folder per world, so authoring notes
   and a `preview.png` can live next to it). Versioned schema (`"schemaVersion": 1`).
   Everything optional except `id`, `name`, and `baseSeed`:
   - `baseSeed` — the seed handed to the generator for everything not overridden. This
     is the heart of the hybrid: an author can start from a seed they like and sculpt.
   - **Terrain**: heightfield parameters and/or river control points (phase 01's
     terrain data shape), or omitted to use the generated terrain.
   - **Districts**: full or partial — pin some districts (type, name, position,
     wealth tilt, palette) and let the generator place the rest around them.
   - **Landmarks**: pre-built buildings/projects placed at founding.
   - **Factions**: pinned archetypes/names/agendas/relationship overrides.
   - **Cast**: named citizens (phase 06 shape).
   - **Quirks**: from the pool by id, or bespoke inline quirk definitions.
   - **Events**: bespoke `GameEventDef`s and chains, validated exactly like the core
     pool (unique ids — namespace them `world/<world-id>/...` — valid chain refs).
   - **Lore**: name, tagline, briefing text, palette/mood lean, blurb for the picker.
2. **Validation**: a Zod-style (or hand-rolled — no new dependency needed if hand-rolled
   is clean) validator with *good error messages*, exposed two ways: at load time in
   the app (a broken world file shows a friendly error, never a crash) and as a CLI
   `node scripts/validate-world.mjs worlds/<id>` for the authoring loop.
3. **Loader semantics**: `generateCity(seed)` gains a sibling like
   `generateCityFromWorld(worldDef, seedString?)`. Precedence: world file > generator.
   The optional extra seed salts the *unspecified* parts so a curated world can still
   vary between playthroughs where the author left room ("the harbor is always here;
   the forest folk change"). Omitted → `baseSeed` exactly. Determinism: world file +
   seed = identical city, enforced by test.

### The game side

4. **Start screen**: a *Curated Worlds* section — cards with `preview.png`, name,
   blurb. Selecting one starts that world (plus optional variation seed input).
   Discovery: a generated manifest (`worlds/index.json`, rebuilt by the validate
   script) or Vite glob import — keep it dead simple.
5. **Runtime**: after loading, a curated world is a normal `City` — the engine, events,
   outcomes, and (if present) phases 03–06 features all just work. World-defined events
   join the pool for that run only.
6. **Ship one example world**, hand-made during this phase (small — a pinned harbor
   town with one bespoke event chain and a named citizen). It proves the schema,
   seeds the gallery, and gives phase 08 sessions a reference.

### Authoring support (consumed by phase 08)

7. **Visual loop**: extend `scripts/visual-check.mjs` (or add `scripts/world-shots.mjs`)
   to screenshot a *world* by id — several angles + one overview — into
   `scripts/shots/world-<id>/`. This is how authoring agents *see* their work.
8. **Headless playtest**: a script (`scripts/playtest-world.mjs` or a Vitest helper)
   that runs N hands-off simulations of a world and reports: outcome distribution,
   stat trajectories, whether bespoke events fired, days survived. This is how
   authoring agents know the world *plays* well, not just looks good.
9. **Test integration**: all checked-in worlds are validated in `npm test` (schema,
   event pool integrity including world events, determinism, and a smoke-sim of each).

## Constraints

- Zero new runtime dependencies unless genuinely needed; world files are static JSON
  served with the app — no backend, ever.
- The random-seed path must remain byte-identical to today for the same seed (world
  support must not disturb the existing generator streams).
- Schema designed for forward-compat: unknown fields warn, `schemaVersion` gates.

## Acceptance criteria

- [ ] World schema + validator + CLI exist; broken files fail friendly, in app and CLI.
- [ ] Example world appears in the Start screen gallery with preview image, loads, and
      plays normally end-to-end.
- [ ] World + seed determinism test passes; random-seed mode provably unchanged.
- [ ] `world-shots` and `playtest-world` scripts work against the example world.
- [ ] `npm test`, `npm run build`, `node scripts/smoke.mjs` pass.

## Out of scope

- In-game world editor (authoring happens in Claude Code sessions — that's the point).
- Downloading worlds from the internet; sharing is "send the folder / commit it".
