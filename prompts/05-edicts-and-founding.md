# 05 — Edicts & The Founding Ritual

> Prerequisite reading: `prompts/00-vision.md`. Two medium-sized features that share a
> theme: *steering*. Edicts give continuous gentle steering between memos; the founding
> ritual gives the run's first and most personal steering moment. Builds on phase 01
> (the founding screen shows off the terrain) and phase 02 (drift biases assume the
> calm baseline).

## Part 1 — Standing Edicts

### Goal

One always-available dial: the mayor declares a **season** — a standing posture the
city leans into until changed. It gently biases the daily drift, tints the visuals, and
flavors which events appear. This fills the agency gap *between* memos: the player can
always express an intention, without micromanagement and without pressure (never
declaring an edict is completely fine).

### Requirements

1. **4–6 edicts as pure data** (e.g. `src/simulation/data/edicts.ts`), each with: id,
   name, proclamation flavor text (the town crier announces it), small `dailyEffects`
   (`StatDelta`, ±0.1..0.4/day — quirk-sized, a lean not a lever), `eventTagBias`
   (reuse the quirk mechanism), faction reactions (small one-time satisfaction nudges on
   declaration — merchants love a Trade Push, gardeners grumble), and a **visual
   signature**. Starting set:
   - **Festival Season** — happiness/culture up, wealth drains a little; lanterns and
     bunting appear on buildings; more festival/weird events.
   - **Conservation Drive** — beauty/pollution improve, wealth slows; extra greenery
     sprouts, planters, vines.
   - **Trade Push** — wealth up, chaos creeps; market stalls and crates appear, more
     carts on the roads (`src/rendering/citizens/carts.ts` exists).
   - **Quiet Rebuilding** — infrastructure/safety up, culture dips; scaffolding
     accents, tidy stacked materials.
   - Optional extras: Arcane Studies (magic/academy), Harvest Home (food/garden).
2. **Mechanics**: at most one active edict (stored on `City`, optional field). Switching
   has a soft cooldown (~10 days) so it's a posture, not a spam lever — communicated
   gently ("The council is still hanging the bunting from your last proclamation").
   Drift applies in the daily tick alongside quirk drift. Declarations are player input:
   log them (like `eventLog`) for deterministic replay, and extend the determinism
   tests.
3. **Visual signature**: each edict adds a deterministic instanced prop layer near
   buildings/roads (lanterns, planters, crates, scaffolds) plus an optional subtle
   palette lean composed with the mood theme. Props appear/disappear with the edict.
4. **UI**: a small "Proclamations" control (TopBar or ControlBar) — current edict, the
   options with effect chips, cooldown state, and the proclamation text on declare.
   News feed announces declarations.
5. **Tests**: edict data integrity; drift applies; cooldown enforced; replay
   determinism including edict switches.

## Part 2 — The Founding Ritual

### Goal

Thirty seconds of input before day 1 that makes the run *yours*: see the generated
land, choose where the first stones go, choose the city's patron quirk, name the city.
It is also the showcase moment for phase 01's terrain.

### Requirements

6. **Flow**: Start screen → seed entry (unchanged) → **founding screen** (new, between
   start and game in `src/app/App.tsx`): the camera slowly orbits the *empty* generated
   terrain (river, hills, forests — no buildings yet). The player makes three choices:
   - **First district site**: 3 candidate sites the generator proposes (deterministic
     from the seed), each a marker on the terrain with a one-line vibe ("riverside —
     trade will come to you", "hilltop — defensible and beautiful", "forest edge —
     mushrooms, probably"). The choice biases the starting layout: where old-town
     lands, which district types are favored nearby, harbor placement.
   - **Patron quirk**: 3 quirk options drawn from the quirk pool (also seeded);
     replaces one of the rolled city quirks.
   - **Name**: accept the generated name or type one.
   A "Surprise me" button skips all three with the generated defaults — the current
   behavior must remain one click away.
7. **Determinism**: founding choices are inputs to generation — thread them into
   `generateCity` (e.g. `generateCity(seed, foundingChoices?)`) so seed + choices is
   fully reproducible and stored on the city. The no-choice path must produce **exactly
   what the generator produces today** for the same seed (don't burn RNG stream draws
   for the candidate sites in a way that shifts the default city — derive candidates
   from a separate sub-stream like `hash(seed + ':founding')`).
8. **The briefing reacts**: the generated mayor briefing references the founding
   choices ("You chose the hilltop. The nobles approve. The fishermen are filing a
   complaint.").
9. **Tests**: same seed + same founding choices = identical city; same seed + default
   path = identical to pre-feature generation; candidate sites valid (on terrain, off
   the river, properly spaced).

## Acceptance criteria

- [ ] Edicts declarable in-game with visible prop layers per edict (screenshot each via
      the dev server + `scripts/visual-check.mjs` or manual capture).
- [ ] Cooldown, drift, faction nudges, and news announcements all working.
- [ ] Founding screen: terrain flyover, three choices, "Surprise me" skip; choices
      visibly shape the starting city; briefing references them.
- [ ] Determinism tests extended for both features and passing.
- [ ] `npm test`, `npm run build`, `node scripts/smoke.mjs` (update the smoke script to
      pass through the founding screen) all green.

## Out of scope

- Multiple simultaneous edicts, edict upgrade trees.
- Free-form district painting at founding — three curated sites keep it relaxed and
  deterministic.
