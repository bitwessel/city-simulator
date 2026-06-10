# Mythic Mayor

A procedural, warm, slightly funny fantasy city simulation for the browser. You are the
mayor of a city that didn't exist a moment ago. Every seed grows a different city —
different districts, factions, quirks, and problems. Time passes day by day, the city
drifts according to its own internal logic, and every few days something happens that
only you can decide. Steer it toward a shining utopia, a golden age, a magical
singularity, or a remarkably polite revolution. The city remembers.

Built with Vite, React 19, TypeScript, React Three Fiber (Three.js), Zustand, and Vitest.

## Running it

```bash
npm install
npm run dev        # start the dev server (URL printed in the terminal)
npm test           # run the simulation test suite
npm run build      # typecheck + production build into dist/
npm run preview    # serve the production build
```

No backend, no accounts, no telemetry. Everything runs in the browser.

## How to play

1. On the start screen, optionally type a seed (any text) or leave it blank for a surprise.
2. Click **Create New City**. Read your mayor's briefing — it contains real hints.
3. Watch the days roll by. Use the speed controls, or pause and step day by day. Your
   city starts as a young settlement: districts construct new buildings as their
   development climbs, and citizens stroll the plazas and walk the roads between them.
4. Every minute or so a **council memo** arrives as a notification — the game keeps
   running. Click it to read and pick a response (every option has trade-offs; the
   effect chips show the immediate stat impact, but chance outcomes and follow-up
   chains are where the fun lives). Or ignore it: dismissed and lapsed memos are
   settled by the council without you.
5. Click districts on the map (or in the panel) to inspect them. Keep an eye on faction
   satisfaction — two furious factions plus broken trust is how revolutions start.
6. Play until the city reaches one of its endings, then do it again with a new seed.
   Same seed + same choices = the exact same story, so you can share seeds.

## Architecture

The simulation is completely separated from the UI. The UI reads state and dispatches
actions; all game logic lives in pure TypeScript modules that never import React.

```
src/
  types/        Domain model: City, District, Faction, GameEventDef, CityStats, ...
  utils/        Seeded RNG (xmur3 + mulberry32), math helpers
  generation/   Procedural city generator + name/faction/quirk data
  simulation/   The day-tick engine: stat spirals, risks, disasters, headlines,
                outcome detection, visual mood derivation
  events/       Event mechanics (conditions, weighting, token resolution,
                consequence application) + the data-driven event pool
  state/        Zustand store — the only bridge between simulation and UI
  game/         The game clock hook (drives day progression)
  rendering/    React Three Fiber low-poly city scene
  components/   UI panels: stats bar, side panel, news feed, event modal, controls
  app/          Screens: start, game, outcome
  styles/       CSS
tests/          Vitest suites for generator, engine, and event pool integrity
```

### Determinism

Every random decision flows through a seeded RNG. The day tick derives its RNG from
`hash(seed + ':tick:' + day)` and choice resolution from
`hash(seed + ':choice:' + day + ':' + choiceId)`, so a given seed plus a given
sequence of choices always replays the exact same city, events, dice and headlines.
`tests/engine.test.ts` enforces this.

### Procedural generation (`src/generation`)

`generateCity(seedString)` builds the whole world:

- **Name + tagline** from component pools (24 prefixes × 16 suffixes, 16 taglines).
- **Districts**: 5–8 of 12 types (old town always present), laid out on a noisy spiral
  with minimum spacing, each with buildings (placed by rejection sampling), wealth,
  mood, local risks, and a visual palette.
- **Roads**: a minimum spanning tree over district positions plus a few scenic extras,
  so the map is always connected.
- **Factions**: 4–6 of 12 archetypes, biased toward ones whose home district exists.
  Each gets a name, agenda, influence, satisfaction, preferred/hated stats, and a
  relationship matrix seeded from rivalry/friendship tables (workers vs nobles,
  mages vs engineers, ...).
- **Citizen groups**, **starting stats** (tilted by district composition: industry
  raises pollution, gardens raise beauty...), **2–4 city quirks**, **resources**,
  **starting risks**, and a generated **mayor briefing** that stitches it together.

### The simulation (`src/simulation/engine.ts`)

`simulateDay(city)` is a pure function returning a new city one day older. Each tick:

quirk drift → resources → stat spirals → population → district moods → faction
satisfaction → citizen groups → risk levels → disaster rolls → headlines → maybe
trigger an event → derive visual mood → check outcomes.

The spiral rules are the heart of it: happiness drifts toward a target implied by
food/housing/safety/beauty/culture minus pollution/chaos; chaos decays but feeds on
low safety, hunger and furious factions; pollution accumulates from industry and is
absorbed by greenery; trust follows happiness and erodes under chaos — and **low trust
dampens the positive half of your event choices**, so a city that doesn't believe in
you stops responding to policy. Risks (fire, flood, crime, unrest, plague, magical
surge...) build under matching conditions and can release as disasters.

### Events (`src/events`)

Events are pure data (`GameEventDef`) validated by tests:

- Selected by weight from the eligible pool every ~3–6 days; eligibility uses
  data-driven conditions (`minStats`/`maxStats`, required faction/district/quirk).
- City quirks bias selection by tag (a city built on dragon bones sees more magic
  events).
- Choices carry stat effects, faction satisfaction effects, district effects,
  chance-based follow-ups, and can queue **chain events** days later.
- Text supports `{city}`, `{district}`, `{faction}` tokens, resolved on trigger.

### Outcomes (`src/simulation/outcomes.ts`)

Eight endings (utopia, golden age, collapse, ghost town, magical singularity,
pollution wasteland, revolution, wild reclamation). Each requires its condition to
hold for a streak of consecutive days past a minimum day, so one bad spike doesn't
end a run — sustained trajectories do.

## Adding content

- **An event**: add a `GameEventDef` to `src/events/data/events.ts`. Give it a unique
  id, 2–4 choices with `effects`/`resultText`, tags for quirk bias, and optionally
  `condition`, `involvedFaction`, `involvedDistrictType`, `minDay`, `once`. For a
  chain, add follow-ups with `chainOnly: true, weight: 0` and reference them via
  `unlocksEventId` or a `ChanceOutcome.queueEventId`. Run `npm test` — pool
  integrity (unique ids, valid chain references, choice counts) is enforced.
- **A quirk**: add to `src/generation/data/quirks.ts` with small `dailyEffects`
  (±0.1–0.4) and/or `eventTagBias`.
- **A headline**: add to `src/simulation/data/headlines.ts`, optionally gated by a
  stat condition.
- **A district type / faction archetype**: extend the union in `src/types/index.ts`,
  then add an entry to `DISTRICT_ARCHETYPES` / `FACTION_TEMPLATES` in
  `src/generation/data/names.ts` (colors, building kinds, stat tilts, agendas...).
  The generator, renderer and UI pick it up from there.
- **An ending**: add an `OutcomeDef` to `src/simulation/outcomes.ts` with a
  `qualifies` predicate, `minDay` and `streak`.

## Testing

`npm test` runs Vitest suites covering: identical seeds produce identical cities;
different seeds produce meaningfully different ones; structural invariants over many
seeds (connected roads, buildings inside districts, population bookkeeping); 300-day
runs across seeds with stats always in range; full determinism of long runs including
events; choice effects and trust dampening; clamping under extreme effects;
reachability of endings; and event pool integrity.

Two Playwright helper scripts drive the real app in headless Chromium (dev server
must be running): `node scripts/smoke.mjs` plays through the start screen → city
creation → an event decision → continued simulation and fails on any console error;
`node scripts/visual-check.mjs [seeds...]` captures screenshots of generated cities
into `scripts/shots/` for eyeballing the renderer.
