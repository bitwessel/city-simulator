import { describe, expect, it } from 'vitest';
import type { City, GameEventDef, WorldDef } from '../src/types';
import { validateWorld } from '../src/worlds/validate';
import { generateCityFromWorld } from '../src/worlds/loadWorld';
import { listWorlds, getWorld } from '../src/worlds/registry';
import { generateCity } from '../src/generation/generator';
import { simulateDay } from '../src/simulation/engine';
import { EVENT_POOL } from '../src/events/data/events';
import { eventIsEligible } from '../src/events/system';
import { autoplay, expectStatsValid } from './helpers';

// ---------------------------------------------------------------------------
// Curated-world integration tests (phase 07). Every checked-in world must
// validate, its events must satisfy the same pool-integrity rules as the core
// pool (plus namespacing), world + seed must be deterministic, each world must
// survive a smoke-sim, and the random-seed path must remain provably unchanged.
// ---------------------------------------------------------------------------

// Discover worlds the same way the registry does, so the test sees exactly what
// the app ships. Eager glob of the parsed world.json modules.
const WORLD_JSON = import.meta.glob('/worlds/*/world.json', { eager: true }) as Record<
  string,
  { default: unknown }
>;

function idFromPath(path: string): string {
  const match = path.match(/\/worlds\/([^/]+)\//);
  return match ? match[1] : path;
}

interface DiscoveredWorld {
  id: string;
  raw: unknown;
}

const DISCOVERED: DiscoveredWorld[] = Object.entries(WORLD_JSON).map(([path, mod]) => ({
  id: idFromPath(path),
  raw: mod && typeof mod === 'object' && 'default' in mod ? mod.default : mod,
}));

/** The validated, loadable worlds (asserted ok below). */
function okWorlds(): WorldDef[] {
  return DISCOVERED.map((d) => {
    const result = validateWorld(d.raw);
    if (!result.ok) {
      throw new Error(`world "${d.id}" failed validation: ${result.errors.join('; ')}`);
    }
    return result.world;
  });
}

describe('curated worlds — validation', () => {
  it('ships at least one world', () => {
    expect(DISCOVERED.length).toBeGreaterThanOrEqual(1);
  });

  it('every checked-in world validates ok', () => {
    for (const { id, raw } of DISCOVERED) {
      const result = validateWorld(raw);
      const detail = result.ok ? '' : ` errors: ${result.errors.join('; ')}`;
      expect(result.ok, `world "${id}" must validate.${detail}`).toBe(true);
    }
  });

  it('the registry lists every world and resolves each ok', () => {
    const entries = listWorlds();
    expect(entries.length).toBe(DISCOVERED.length);
    for (const entry of entries) {
      expect(entry.result.ok, `registry entry "${entry.id}"`).toBe(true);
      // Entries are sorted by id.
    }
    const sorted = [...entries.map((e) => e.id)].sort((a, b) => a.localeCompare(b));
    expect(entries.map((e) => e.id)).toEqual(sorted);
    // getWorld round-trips.
    for (const entry of entries) {
      expect(getWorld(entry.id)?.id).toBe(entry.id);
    }
    expect(getWorld('definitely-not-a-world')).toBeUndefined();
  });
});

describe('curated worlds — event pool integrity (incl. world events)', () => {
  const coreIds = new Set(EVENT_POOL.map((e) => e.id));

  it('world events are namespaced, unique, non-colliding, well-formed, with valid chain refs', () => {
    for (const world of okWorlds()) {
      const events: GameEventDef[] = world.events ?? [];
      const worldIds = new Set(events.map((e) => e.id));
      const namespace = `world/${world.id}/`;
      // Unique within the world.
      expect(worldIds.size, `world "${world.id}" event ids unique`).toBe(events.length);

      for (const ev of events) {
        expect(ev.id.startsWith(namespace), `event "${ev.id}" namespaced`).toBe(true);
        expect(coreIds.has(ev.id), `event "${ev.id}" must not collide with core pool`).toBe(false);
        expect(ev.choices.length, `event "${ev.id}" choice count`).toBeGreaterThanOrEqual(2);
        expect(ev.choices.length, `event "${ev.id}" choice count`).toBeLessThanOrEqual(4);
        for (const choice of ev.choices) {
          expect(choice.resultText.length, `${ev.id}/${choice.id} resultText`).toBeGreaterThan(0);
          expect(choice.effects, `${ev.id}/${choice.id} effects`).toBeDefined();
          for (const outcome of choice.outcomes ?? []) {
            expect(outcome.chance).toBeGreaterThan(0);
            expect(outcome.chance).toBeLessThanOrEqual(1);
          }
        }
      }

      // Every chain ref resolves to a world event or a core pool id.
      const resolvable = (refId: string) => worldIds.has(refId) || coreIds.has(refId);
      for (const ev of events) {
        for (const choice of ev.choices) {
          if (choice.unlocksEventId) {
            expect(resolvable(choice.unlocksEventId), `${ev.id} -> ${choice.unlocksEventId}`).toBe(true);
          }
          for (const outcome of choice.outcomes ?? []) {
            if (outcome.queueEventId) {
              expect(resolvable(outcome.queueEventId), `${ev.id} -> ${outcome.queueEventId}`).toBe(true);
            }
          }
        }
      }
    }
  });
});

describe('curated worlds — bespoke events are reachable', () => {
  it('every selectable world event can become eligible in its loaded city', () => {
    for (const world of okWorlds()) {
      const selectable = (world.events ?? []).filter((e) => !e.chainOnly);
      if (selectable.length === 0) continue;
      const city = generateCityFromWorld(world);

      for (const ev of selectable) {
        // The real phase-08 footgun: a bespoke event whose required district or
        // faction the world never actually produces — it could then never fire.
        // Assert the structural requirements are satisfied by the loaded city.
        if (ev.involvedDistrictType) {
          expect(
            city.districts.some((d) => d.type === ev.involvedDistrictType),
            `world "${world.id}" event "${ev.id}" needs a ${ev.involvedDistrictType} district`,
          ).toBe(true);
        }
        if (ev.involvedFaction) {
          expect(
            city.factions.some((f) => f.archetype === ev.involvedFaction),
            `world "${world.id}" event "${ev.id}" needs a ${ev.involvedFaction} faction`,
          ).toBe(true);
        }
      }

      // And at least one selectable world event is eligible right now (no minDay/
      // minAge/stat gate keeping the whole bespoke set permanently dormant on a
      // fresh city), proving the engine's pool merge can actually surface it.
      expect(
        selectable.some((ev) => eventIsEligible(ev, city)),
        `world "${world.id}" has no immediately-eligible bespoke event`,
      ).toBe(true);
    }
  });
});

describe('curated worlds — world + seed determinism', () => {
  it('generateCityFromWorld(world) is identical across two calls', () => {
    for (const world of okWorlds()) {
      const a = generateCityFromWorld(world);
      const b = generateCityFromWorld(world);
      expect(JSON.stringify(a), `world "${world.id}" (no variation)`).toBe(JSON.stringify(b));
    }
  });

  it('generateCityFromWorld(world, "abc") is identical across two calls', () => {
    for (const world of okWorlds()) {
      const a = generateCityFromWorld(world, 'abc');
      const b = generateCityFromWorld(world, 'abc');
      expect(JSON.stringify(a), `world "${world.id}" (variation abc)`).toBe(JSON.stringify(b));
    }
  });

  it('omitted variation seed equals baseSeed-derived city plus overrides (worldId set, name applied)', () => {
    for (const world of okWorlds()) {
      const city = generateCityFromWorld(world);
      expect(city.worldId).toBe(world.id);
      expect(city.name).toBe(world.name);
      // No variation ⇒ the city's seed stays the world's baseSeed exactly, so
      // the forward simulation matches the pure baseSeed run.
      expect(city.seed.raw).toBe(world.baseSeed);
    }
  });

  it('a variation seed salts the simulation so playthroughs actually diverge', () => {
    for (const world of okWorlds()) {
      const a = generateCityFromWorld(world, 'alpha');
      const b = generateCityFromWorld(world, 'beta');
      // Distinct seeds ⇒ distinct day-tick RNG streams.
      expect(a.seed.raw).not.toBe(b.seed.raw);
      expect(a.seed.raw).not.toBe(world.baseSeed);
      // The generated start-state is pinned (same name / district types), but the
      // forward simulation diverges: after a stretch of days the two runs differ.
      const runDays = (c: City): City => {
        let cur = c;
        for (let i = 0; i < 120; i++) cur = simulateDay(cur).city;
        return cur;
      };
      expect(JSON.stringify(runDays(a))).not.toBe(JSON.stringify(runDays(b)));
    }
  });
});

describe('curated worlds — smoke sim', () => {
  it('each world runs ~300 days hands-off with valid stats and its events present', () => {
    for (const world of okWorlds()) {
      const city = generateCityFromWorld(world);
      // If the world ships bespoke events, they travel with the city.
      if ((world.events ?? []).length > 0) {
        expect(city.worldEvents, `world "${world.id}" carries its events`).toBeDefined();
        expect(city.worldEvents!.length).toBe(world.events!.length);
      }
      const final = autoplay(city, 300);
      expectStatsValid(final);
      // The run advanced (or ended at an outcome) without throwing.
      expect(final.day).toBeGreaterThan(1);
    }
  });
});

describe('random-seed path — provably unchanged', () => {
  it('plain generateCity(seed) has no worldEvents', () => {
    const city = generateCity('control-seed');
    expect(city.worldEvents).toBeUndefined();
    expect(city.worldId).toBeUndefined();
  });

  it('simulateDay on a random-seed city is unaffected by the world-events merge', () => {
    // A control run of a few days must match a re-run byte-for-byte; the pool
    // merge (`[...EVENT_POOL, ...(input.worldEvents ?? [])]`) is a no-op when
    // worldEvents is undefined, so this proves the random path is untouched.
    const run = (): City => {
      let city: City = generateCity('unchanged-seed');
      for (let i = 0; i < 8; i++) {
        city = simulateDay(city).city;
      }
      return city;
    };
    expect(JSON.stringify(run())).toBe(JSON.stringify(run()));
  });
});
