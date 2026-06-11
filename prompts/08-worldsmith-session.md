# 08 — Worldsmith Session: Authoring a World with Claude Code

> **This is not a build phase — it is a reusable session prompt.** Run it any time you
> want to craft a new curated world. Requires phase 07 (world schema, loader, scripts)
> to be complete. Prerequisite reading: `prompts/00-vision.md` for voice and pillars.
>
> Usage: start a Claude Code session with something like
> *"Read prompts/08-worldsmith-session.md and build me a world: <one-line brief>"* —
> e.g. "a misty harbor city ruled by an uneasy truce between fishermen and mages."
> No brief? Invent one worth building.

## What a worldsmith session produces

A new folder `worlds/<world-id>/` containing `world.json` (valid against the schema),
`preview.png`, and `notes.md` (the design intent, for future sessions) — committed only
when it passes the full quality gate below. The deliverable is a world that is
*beautiful from the default camera, mechanically alive over a 250-day run, and written
in the game's voice*.

## The crew

Orchestrate as one session with subagents (Agent tool), or play all roles yourself in
sequence for small worlds. Roles, in working order:

1. **Surveyor** (terrain & composition) — owns `terrain`, district positions, river
   course. Goal: a composition where the river anchors the frame, landmarks are visible
   from the default camera, and district silhouettes don't mush together. Starts by
   exploring `baseSeed` candidates: generate screenshots of a handful of raw seeds
   (`scripts/world-shots.mjs` against a minimal world file that only sets `baseSeed`)
   and pick the best bones to sculpt rather than overriding everything.
2. **Culturist** (lore & people) — owns name, tagline, briefing, factions, cast,
   quirks. Goal: a place with one clear *tension* (the brief) expressed through 2–3
   factions and named citizens on different sides of it. Reads
   `src/generation/data/names.ts` and existing quirks first; reuses pools where they
   fit, writes bespoke where the brief demands.
3. **Dramatist** (events) — owns the bespoke event chains. Goal: 4–8 events including
   at least one 2–3 step chain that pays off the world's central tension, in the game's
   voice (study `src/events/data/events.ts` first), namespaced
   `world/<world-id>/...`, mechanically balanced (effects within the bounds the core
   pool uses; phase 02's calm baseline must survive them).
4. **Critic** (the loop-closer) — does not create; *judges*. Runs the gates below,
   reads the screenshots with the Read tool, and sends concrete revision notes back to
   the other roles ("the river exits behind the noble hill — invisible from camera;
   bend it east", "the second chain event can fire before its setup — add minDay").
   The Critic signs off, nobody else.

## The loop (iterate until the Critic signs off — expect 2–4 rounds)

```bash
node scripts/validate-world.mjs worlds/<id>     # schema + event integrity — fix before anything else
npm run dev                                      # then, server running:
node scripts/world-shots.mjs <id>                # screenshots → scripts/shots/world-<id>/
# READ the screenshots. Judge composition against the checklist below.
node scripts/playtest-world.mjs <id>             # hands-off sim report
npm test                                         # whole suite, including world validation
```

**Reading the screenshots is the heart of the loop.** A worldsmith session that never
looks at its own world has failed regardless of what the validators say.

### Visual checklist (Critic judges every round)

- The river anchors the composition; it enters and exits the frame visibly.
- From the default camera: at least one landmark silhouette reads instantly; districts
  are distinguishable clusters; no dead empty quadrant; no clipping/floating geometry.
- Color palette is harmonious with the world's mood lean; check at least one alternate
  mood if the world's stats make moodshifts likely.
- Compare against `medieval.png` / `farm.png` for density-feel — not style-copying,
  density-feel.

### Playtest checklist

- Hands-off runs survive past day 200 in the large majority of sims (phase 02 spirit
  holds *in this world* — pinned districts and bespoke quirks can break it).
- Every bespoke event fires in at least some runs; chains complete in order; no
  bespoke event dominates the feed.
- At least two different endings observed across the report's runs (a world railroaded
  into one ending is a cutscene, not a world).
- The briefing's promises are true (if it warns about the harbor faction, the harbor
  faction should actually matter).

## Hard rules

- **Never touch engine/generator code to make a world work.** A world that needs code
  changes has found either a world bug (fix the world) or a real engine gap (stop, fix
  it as its own change with tests, then resume).
- Everything in `world.json` is plain data validated by the schema; event ids
  namespaced; no duplicate ids with the core pool (`npm test` enforces).
- Voice: warm, funny, fantasy. The Culturist and Dramatist must read existing content
  before writing. No grimdark, no lore dumps — tension expressed through events and
  agendas, not essays.
- `notes.md` records: the brief, the chosen `baseSeed` and why, what was pinned vs
  left to the generator, the central tension, and anything a future session editing
  this world must not break.
- `preview.png`: the best overview shot from the final round, copied into the world
  folder.

## Done means

- [ ] `validate-world`, `playtest-world`, `world-shots`, and `npm test` all clean.
- [ ] Critic's visual + playtest checklists pass, with the final screenshots read and
      judged in the session.
- [ ] `worlds/<id>/` contains `world.json`, `preview.png`, `notes.md`; the world
      appears in the Start screen gallery and plays end-to-end (`node scripts/smoke.mjs`
      or a manual run through founding → a memo → a saved postcard if those phases
      exist).
- [ ] A human gets a one-paragraph pitch of the world and its central tension, plus
      the preview image, as the session's closing message.
