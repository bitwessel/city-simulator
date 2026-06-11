# 01 — Living World: Terrain, Scenery & Light

> Prerequisite reading: `prompts/00-vision.md`. This is the biggest visual phase and the
> foundation for everything after it. Reference images: `medieval.png`, `farm.png`,
> `hunters.png` in the repo root — study them before writing code.

## Goal

Replace the current "floating colored discs on an empty plain" look with a **continuous,
generated landscape**: gentle terrain, a river, forests and fields filling the negative
space, buildings sitting *on* the land and facing paths, all under warm directional
light with real depth. Different every seed, coherent every seed.

This closes roughly 70% of the gap between the current renderer and the reference images.

## Current state

- `src/rendering/CityScene.tsx` — Canvas entry; mood-driven fog/background; OrbitControls.
- `src/rendering/DistrictPlatform.tsx` — **the discs. This component's visual concept is
  being retired**, though district selection/hover behavior must survive.
- `src/rendering/Ground.tsx` — flat vertex-colored terrain disc, a water plane below
  platform level, a horizon ring of low-poly hills/cone-forests. Good instincts, will be
  superseded by real terrain.
- `src/rendering/Roads.tsx`, `BuildingMesh.tsx`, `Citizens.tsx` + `src/rendering/citizens/`
  — all currently assume y≈0 / platform height.
- `src/generation/generator.ts` — districts on a noisy spiral (positions in roughly
  -50..50 world units, min spacing 24), buildings placed by rejection sampling inside
  district radii, roads as an MST + extras.
- `src/simulation/expansion.ts` — mid-run district founding; new districts must also
  land correctly on the terrain.
- Mood themes in `src/rendering/palette.ts` drive sky/fog/tint per `CityMood` — keep
  this system working; it's one of the game's best features.

## Requirements

Work in the milestone order below; each milestone leaves the game playable and the
test suite green.

### Milestone A — Terrain & river (the structural change)

1. **Generated terrain data.** The generator produces a deterministic terrain description
   stored on the city (new optional field, e.g. `city.terrain`): a seeded heightfield
   (sum of a few low-frequency noise octaves — gentle rolling hills, nothing dramatic;
   max height variation around 3–6 world units across the map) plus a **river**: a
   spline of control points crossing the map, with width, carved slightly below grade.
   Derive it from its own sub-stream (e.g. `hash(seed + ':terrain')`). Plain data only —
   the renderer builds meshes from it; the simulation can query it.
2. **Height query helper.** A pure function `terrainHeightAt(terrain, x, z)` in
   `src/generation/` or `src/utils/` (UI-free) that everything uses: building placement,
   road ribbons, citizens, scenery. One source of truth, no renderer-side duplication.
3. **Terrain-aware generation.** Districts and buildings must respect the land:
   district sites avoid the river channel and steep patches; harbor districts hug the
   river/water; buildings sit on terrain height; roads become ribbons that follow the
   terrain and **bridge** the river where they must cross. `src/simulation/expansion.ts`
   uses the same placement rules for mid-run districts.
4. **Retire the discs.** Districts render as organic building clusters on the terrain.
   Keep a *subtle* ownership cue (a faint ground-color blend toward
   `district.visualStyle.baseColor` in the terrain vertex colors, or a soft boundary)
   and keep click-to-select + hover + the selected highlight working — an invisible
   picking mesh per district is fine.
5. **Water that reads as a river**: animated surface in the carved channel (the existing
   `Water` shimmer approach is a good base), banks slightly darker/sandier. A small
   waterfall where the river exits the map edge is a lovely stretch goal (every
   reference image has one).

### Milestone B — Filling the negative space

6. **Instanced scenery layer**: trees (2–3 silhouette variants), bushes, rocks, and
   near-district details (farm plots near the edge of town, flower patches in garden
   districts). Distribution by seeded noise: forest clumps between districts, clearings
   where buildings/roads/river are (poisson-ish rejection against those). All
   `InstancedMesh`, deterministic from the seed, mood-tinted via the palette.
7. **Buildings face paths.** Orient buildings toward the nearest road/district center
   instead of random rotation, with small jitter so it stays organic. Add light
   intra-district ground paths (decals or thin ribbons) so clusters read as neighborhoods.
8. **Scale with development**: scenery respects city growth — forest recedes slightly
   where a district's `development` is high, fields appear around young districts. Tie
   into the existing `appearAt` staging so the world visibly matures with the city.

### Milestone C — Light, post-processing & life

9. **Lighting**: one warm directional sun at a low-ish angle (golden hour default) with
   soft shadows over the whole city, plus mood-tinted ambient/hemisphere fill. Enable
   ACES tone mapping on the renderer.
10. **Post-processing**: add `@react-three/postprocessing` (new dependency — and its
    `postprocessing` peer). Use **N8AO** (ambient occlusion — this single effect makes
    low-poly stop looking like it floats), subtle **bloom** (windows, magic, water
    glints), and a gentle **vignette**. Budget-check on a large city before tuning up.
11. **Day/night cycle** tied to the game clock (`src/game/useGameClock.ts` drives days):
    sun arcs across each in-game day, dusk warms, night cools and dims, windows glow
    after dusk (emissive on building meshes), street/lantern points in developed
    districts. Must compose with mood themes: mood picks the palette, time of day
    modulates it. Pause respects the cycle (frozen sun is fine).
12. **Life details** (cheap, high-charm): drifting low-poly clouds, chimney smoke on
    houses/workshops (existing pollution smog logic in `Atmosphere.tsx` is separate —
    keep both), occasional birds. All cosmetic randomness through `src/rendering/hash.ts`.

## Constraints

- All generation-side randomness through seeded sub-streams; terrain identical for
  identical seeds. Add a test: same seed → identical terrain data; different seeds →
  meaningfully different rivers/heightfields.
- Existing structural tests (`tests/generator.test.ts`: buildings inside districts,
  connected roads, etc.) must keep passing — update their assumptions where the platform
  model baked itself in, don't delete them.
- `City` stays serializable; `terrain` is plain data and optional.
- Performance: heightfield mesh resolution modest (vertex-colored, no textures);
  scenery instanced; shadow map sized sanely. Test with a 13-district late-game city.
- Camera: keep OrbitControls feel, but re-tune min/max distance and polar angle so the
  default framing resembles the references (slightly raised isometric-ish view).

## Acceptance criteria

- [ ] No floating discs anywhere; city sits on continuous terrain with a river.
- [ ] District click/hover/selection still works in the new model.
- [ ] 5+ seeds screenshotted via `node scripts/visual-check.mjs`: each shows a visibly
      different river course + terrain, dense scenery, no empty-plain feeling, no
      buildings floating above or sunk into the ground, no scenery inside buildings.
- [ ] Roads follow terrain and bridge the river; citizens walk at terrain height.
- [ ] AO + bloom + vignette active; golden-hour default reads warm; night shows glowing
      windows; mood themes still clearly shift the look (compare a `polluted` vs
      `thriving` vs `arcane` seed).
- [ ] `npm test`, `npm run build`, `node scripts/smoke.mjs` all pass.
- [ ] Smooth framerate on the largest cities.

## Out of scope (later phases or never)

- Textures / painterly shaders — evaluate only after this phase ships; low-poly + light
  may be enough.
- Age-based building mesh swaps (phase 04).
- Any simulation/balance changes (phase 02).
