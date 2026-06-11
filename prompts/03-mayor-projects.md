# 03 — Mayor Projects: The New Core Verb

> Prerequisite reading: `prompts/00-vision.md`. Builds on phase 01 (landmarks render
> into the new terrain world) and phase 02 (a calm baseline makes building feel safe).

## Goal

Give the player a verb beyond "answer memos": **commission projects that physically
appear in the world.** Pick a district, pick a project (grove, fountain plaza,
lighthouse, observatory...), spend slowly-recharging *City Favor*, watch scaffolding go
up over several in-game days, and then the finished landmark stands there permanently,
nudging stats and pleasing factions. This converts the game from "watch numbers drift"
to "garden a diorama."

Design pillar check: relaxed authorship (no time pressure, no fail state — a project
can never be destroyed or wasted), visible consequence (every project is a mesh).

## Current state

- Player inputs today: event choices only, recorded in `city.eventLog` and replayed
  deterministically (`hash(seed + ':choice:' + day + ':' + choiceId)`).
- `src/state/store.ts` — the Zustand bridge; UI dispatches, simulation stays pure.
- Buildings: `Building` in `src/types/index.ts` (kind, position, rotation, scale,
  `appearAt`, optional `floors`), rendered by `src/rendering/BuildingMesh.tsx`,
  district rosters planned by `src/generation/generator.ts`.
- District UI: `src/components/DistrictsTab.tsx`, `LeftPanel.tsx`; top bar:
  `src/components/TopBar.tsx`; event flow: `EventModal.tsx`.

## Requirements

### Data & simulation

1. **`ProjectDef` catalog** — pure data, validated by tests like the event pool. Lives
   in something like `src/projects/data/projects.ts`. Each def: id, name, flavor text
   (funny, warm — match the event voice), favor cost, build time in days, one or more
   allowed district types (or `any`), a `BuildingKind` (add new kinds to the union:
   e.g. `grove`, `fountain-plaza`, `lighthouse`, `observatory`, `bathhouse`,
   `amphitheater`, `menagerie`...), stat effects on completion (`StatDelta`, modest —
   ±2..6), optional ongoing daily drift (tiny, ±0.05..0.2, applied like quirk
   `dailyEffects`), optional faction satisfaction effects, optional district
   mood/wealth effects. Ship **10–14 projects** with personality, spread across
   district types so every city composition has options.
2. **City Favor** — a single resource on `City` (optional field), starting ~modest,
   regenerating slowly per day (slightly faster when trust/happiness are high — the
   city *wants* to build for a loved mayor), capped (~enough for 1–2 projects banked).
   Shown in the TopBar. Costs roughly sized so a project every ~10–20 days feels right.
3. **Lifecycle**: a store action `startProject(districtId, projectDefId)` validates
   (enough favor, district type allowed, no duplicate of the same project in the same
   district, maybe a per-district cap of ~3) and records the order. The engine ticks
   construction progress each day; on completion it appends a permanent `Building` to
   the district, applies completion effects, and emits a celebratory headline. While
   under construction, the renderer shows a scaffolding/works state at the site.
4. **Determinism**: project orders are player inputs — record them in a log on the
   city (like `eventLog`, e.g. `projectLog: { day, districtId, defId }[]`) and derive
   placement position/rotation from a dedicated sub-stream, e.g.
   `hash(seed + ':project:' + day + ':' + defId)`. Placement uses the same
   terrain/collision rules as generated buildings (phase 01's height helper; avoid
   river, roads, existing buildings).
5. **Engine integration**: ongoing project drifts join the daily tick near quirk drift.
   Completed projects can also gate flavor — at least a few headlines and one or two
   events that reference an existing landmark (`condition` extension or tags).

### Rendering & UI

6. **Meshes**: each new `BuildingKind` gets a distinct low-poly silhouette in
   `BuildingMesh.tsx` — landmarks should read as *special* (bigger, distinctive shape,
   slight emissive accent) compared to roster buildings. Scaffolding state: simple
   frame + crane/poles, fun to watch.
7. **UI flow**: in the district panel (`DistrictsTab.tsx` / selected-district view), a
   "Commission a project" section listing eligible projects with cost, build time, and
   effect chips (reuse the effect-chip presentation from `EventModal.tsx` for
   consistency). Disabled-with-reason when unaffordable. Confirm → toast/news item →
   scaffolding appears. City Favor with a small tooltip in `TopBar.tsx`.
8. **No pressure UX**: no countdowns in your face, no penalties for never building.
   Projects are pull, not push. (A *gentle* once-in-a-while memo suggesting a project
   is fine flavor.)

### Tests

9. Pool-integrity tests for `ProjectDef`s (unique ids, valid district types, costs > 0,
   effects within sane bounds) — mirror the event pool tests.
10. Lifecycle test: start → N days → completed building exists in the district, effects
    applied, favor deducted.
11. Determinism test: extend `tests/engine.test.ts` so a run including project orders
    replays identically (same seed + same eventLog + same projectLog).
12. Placement test over many seeds: project buildings land inside their district, on
    valid terrain, not colliding.

## Acceptance criteria

- [ ] Can commission a project from the district panel; scaffolding visible during
      construction; landmark visible and permanent after; headline celebrates it.
- [ ] City Favor regenerates, displays in TopBar, gates commissioning.
- [ ] 10–14 projects shipped, each with distinct mesh + flavor text in the game's voice.
- [ ] All new tests pass; `npm test`, `npm run build`, `node scripts/smoke.mjs` pass.
- [ ] Screenshot check (`node scripts/visual-check.mjs` + manual): landmarks read as
      special at the default camera distance.

## Out of scope

- Free-form placement (the engine picks the spot inside the chosen district — keeps it
  relaxed and deterministic; revisit only if it feels bad in play).
- Demolition/moving, project upgrades, wonder-scale megaprojects (phase 04's Wonder Age
  builds on this system).
