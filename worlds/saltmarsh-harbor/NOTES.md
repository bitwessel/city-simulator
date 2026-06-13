# Saltmarsh Harbor — authoring notes

Reference world for the curated-world pipeline (phase 07) and the worldsmith
session reference (phase 08). It deliberately stays *tight*: it sculpts the
interesting 20% (a port identity, one lighthouse, one bespoke chain, one named
local) and lets the generator fill the rest.

## Concept

A tide-haunted little port where the marsh meets the sea. Warm, briny, slightly
funny — the punctual tides keep office hours, the gulls keep secrets, and
something enormous naps beneath the docks. Never grimdark: the "monster" is a
big, contented, grateful sleeper, and the worst outcome is bad manners from the
tides, not horror.

## baseSeed

`saltmarsh-harbor-gull`. Chosen because the plain generated city for this seed
*already* contains all three district types we pin — harbor, forest-edge, and
market — so every pin retitles/recolors an existing generated district in place
rather than spawning a floating `district-world-*`. (Other candidate seeds
spawned a detached harbor; this one grows it naturally.)

## Pinned vs generator-filled

Pinned (sculpted):
- **harbor → "Saltside Docks"** — the heart of the town. `wealthTilt: +6`,
  teal/driftwood palette. Hosts the lighthouse and the bespoke chain.
- **forest-edge → "The Reedwalk"** — the marshy fringe. `wealthTilt: -4`,
  reed-green palette. Gives the town its salt-marsh half.
- **market → "The Fishgate Market"** — a quick name pin to make commerce feel
  like a fish market; otherwise left to the generator.

Generator-filled (left alone on purpose): old-town, workers, ruins, festival —
plus all factions, terrain, the rest of the cast, risks, and headlines. The
generated city already rolls a `fishermen` faction, which the bespoke chain
leans on for `factionEffects`.

## Landmark

One commissioned **lighthouse** (`lighthouse` is in `LANDMARK_BUILDING_KINDS`),
targeted at `districtType: "harbor"` so it stands at founding on Saltside Docks
and is recorded as a completed project (there is a `ProjectDef` for it).

## The bespoke chain — "The Big Snore"

A 3-event chain, all namespaced `world/saltmarsh-harbor/...`:

1. **`the-big-snore`** (selectable, `weight: 12`, `involvedDistrictType: harbor`).
   The sleeper beneath the docks starts snoring and rattling the pilings. Three
   meaty choices with real trade-offs:
   - *Lullaby patrol* (warm path) — pay the dock crews to sing it back to sleep;
     55% chance to queue **`the-deep-says-thanks`**.
   - *Engineers survey* — measure it; safe, no chain, just a payoff outcome.
   - *Evict the sleeper* (the mistake) — drive it out; 60% chance to queue
     **`the-deep-departs`**.
2. **`the-deep-says-thanks`** (`chainOnly`, `weight: 0`, `once`). The grateful
   sleeper leaves singing pearls on the dock. Sell them (wealth) or build a
   thank-you shrine (magic/beauty).
3. **`the-deep-departs`** (`chainOnly`, `weight: 0`, `once`). Without the sleeper
   the tides go feral and flood the harbor on an unscheduled Tuesday. Send the
   citizen to apologize (60% chance it comes home and tides go punctual again)
   or build seawalls (durable but less magical).

Triggering: chain links use `choice.outcomes[].queueEventId` (chance-gated), the
same mechanism the core dragon/comet chains use. So the follow-up is earned, not
guaranteed — a player who waves it off doesn't always get the payoff.

`{citizen}` and `{district}` tokens are used throughout. Because event 1 has
`involvedDistrictType: harbor`, the engine's citizen resolver prefers a cast
member whose `homeDistrictId` is the harbor — so our named local is cast in, and
the chain reuses her name via `citizenInvolvements`.

## Named citizen

**Old Pernilla Tarr**, harbor-master of Saltside Docks — runs the docks, fears
nothing afloat, and sings the tide to sleep nightly. She's the warm anchor of
the chain (her lullaby is the good path; her I-told-you-so is the bad one).

GOTCHA — `homeDistrictId` is bound to the literal id **`district-1-harbor`**.
District ids are generated deterministically from `baseSeed` (format
`district-<n>-<type>`), and for `saltmarsh-harbor-gull` the harbor lands at
index 1. This was confirmed by a throwaway test that logged
`city.districts.map(d => [d.id, d.type, d.name])` via `generateCityFromWorld`,
then deleted. If the `baseSeed` ever changes, re-derive this id the same way —
a stale `homeDistrictId` won't crash (the resolver falls back to the whole cast)
but Pernilla would no longer be preferentially cast into the harbor chain.

## Quirk

`punctual-tides` from `QUIRK_POOL` — "The tides keep strict office hours."
A perfect thematic fit (it *is* the tagline) and it biases `nature`/`economy`
events, which suits a port. It also makes the "evict the sleeper → tides go
feral" beat land harder: the town's defining quirk is exactly what gets broken.

## Mood / palette

`moodLean: "serene"` so the town opens calm and foggy rather than letting the
derived mood pick something busier; `paletteLean` is a free-form hint for the
renderer (foggy teal + driftwood + lamp-amber).
