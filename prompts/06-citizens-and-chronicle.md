# 06 — A City You Can Love: Citizens, Chronicle & Photo Mode

> Prerequisite reading: `prompts/00-vision.md`. The attachment layer — it works best
> when phases 01–05 exist, but only hard-requires the current citizen renderer
> (`src/rendering/Citizens.tsx`, `src/rendering/citizens/`). Pillar: **the city
> remembers** — and the player remembers the city.

## Goal

Make the inhabitants and the history feel like *yours*: named citizens you can follow
around, a chronicle that writes the story of the run as it happens, and a postcard mode
to capture and share the diorama. None of this adds mechanical pressure; all of it adds
reasons to keep watching.

## Part 1 — Named citizens

1. **Generation**: the generator names a small cast (~6–10 citizens: name, archetype
   drawn from their district's `CitizenGroup` archetypes, one-line personality, home
   district), deterministic from a sub-stream (`hash(seed + ':cast')`). Stored on the
   city (optional field). New districts founded mid-run (`src/simulation/expansion.ts`)
   may add a cast member.
2. **They appear in the text layer**: a `{citizen}` token alongside the existing
   `{city}`/`{district}`/`{faction}` tokens (resolved in `src/events/system.ts`),
   usable in headlines and events. Write/retrofit a handful of headlines and 2–3 events
   to use it. Resolution prefers a cast member from the involved district, remembers
   who was involved (so follow-up texts can reuse the same name — "Marta the baker,
   who you may remember from the bread incident"). Deterministic, of course.
3. **They exist in the 3D world**: each cast member is bound to one of the instanced
   citizens of their home district (a stable instance index — the citizen system in
   `src/rendering/citizens/` already has specs/runtime structure to hang this on).
   Slightly distinct look (a hat, a color) so they're findable.
4. **Click to meet**: clicking a cast citizen (or their entry in a small "Notable
   citizens" list in the city/district panel) opens a tiny bio card and offers
   **Follow** — the camera smoothly tracks them at street level while they walk their
   routes; any input or Esc releases the camera back to orbit. This is a pure renderer
   feature — no simulation impact.

## Part 2 — The City Chronicle

5. **Auto-journal**: the run writes its own storybook. Chronicle entries (plain data on
   the city, appended by the engine/store) for: founding (+ founding choices), age-ups,
   district foundings, disasters survived, projects completed, edicts declared, event
   choices with major outcomes, ending reached. Each entry: day, title, a sentence or
   two in the game's voice, and references (district/citizen names).
6. **Chronicle view**: a tab or overlay (alongside City/Districts/Factions in
   `src/components/`) showing the chronicle as a scrollable illustrated timeline —
   simple, pretty, readable. The existing `history` stat snapshots can decorate it
   (tiny sparklines), but the chronicle is *narrative*, not analytics.
7. **On the outcome screen** (`src/components/OutcomeScreen.tsx`): the chronicle is the
   run's epitaph — show it (or its highlights) when the city reaches an ending, with
   the seed prominently copyable so the story is shareable.

## Part 3 — Postcard mode

8. **Capture**: a camera button in the ControlBar hides all UI, lets the player frame
   the shot (orbit still active), and captures the WebGL canvas to a PNG download.
   Composite a small caption strip onto the image (offscreen 2D canvas): city name,
   day, age (if phase 04 exists), and seed — so every shared postcard is also a
   shareable seed. Note: the `<Canvas>` needs `preserveDrawingBuffer` or a
   render-then-read capture path — verify the screenshot isn't black.
9. **Postcard flair** (small, optional): a frame/border choice or two, and a
   golden-hour lighting preset toggle for the shot if the day/night cycle (phase 01)
   exists. Keep it tiny — this is a charm feature, not a photo editor.
10. **Chronicle integration**: milestone moments (age-ups, wonder completion, endings)
    auto-capture a small snapshot thumbnail into the chronicle entry if cheaply
    possible; skip if it complicates state (thumbnails are ephemeral UI sugar, NOT
    simulation state — they must not enter the deterministic city data).

## Constraints

- Cast generation/usage deterministic; camera-follow and postcards are pure
  renderer/UI features with zero simulation impact.
- Chronicle entries are plain serializable data; writing them must not alter any RNG
  stream (no draws — derive text from already-decided facts).
- Keep `tests/` green; add: cast determinism, `{citizen}` token resolution, chronicle
  entries appear for engine-driven milestones (founding, disaster, ending).

## Acceptance criteria

- [ ] Notable citizens exist, are findable in the world and the panel, and have bio
      cards; Follow mode tracks them smoothly and exits cleanly.
- [ ] `{citizen}` names appear in headlines/events and recur consistently within a run.
- [ ] Chronicle fills up over a long run and is shown on the outcome screen.
- [ ] Postcard button produces a non-black PNG with the caption strip; UI fully hidden
      in the shot.
- [ ] `npm test`, `npm run build`, `node scripts/smoke.mjs` pass.

## Out of scope

- Citizen needs/jobs simulation, citizen deaths (cast members may *retire* via flavor
  text if an event demands drama — never grim).
- Video/GIF capture; cloud sharing. A PNG and a seed is the whole share story.
