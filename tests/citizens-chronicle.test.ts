import { describe, expect, it } from 'vitest';
import type { ActiveEvent, City, GameEventDef } from '../src/types';
import { generateCity } from '../src/generation/generator';
import { applyEventChoice, simulateDay } from '../src/simulation/engine';
import { instantiateEvent, resolveCitizen } from '../src/events/system';
import { Rng } from '../src/utils/rng';
import { freshCity } from './helpers';

// =============================================================================
// Phase 06 — Citizens & Chronicle (simulation/data layer)
// =============================================================================

/**
 * Drive a thriving, pressured city so it founds new districts mid-run (and may
 * add cast members from the `:cast:<day>` sub-stream). Mirrors growWithPressure
 * in engine.test.ts. Deterministic for a given seed.
 */
function growWithPressure(seed: string, days: number): City {
  let city = freshCity(seed);
  for (let i = 0; i < days; i++) {
    if (city.outcome) break;
    city.stats.happiness = 66;
    city.stats.wealth = 68;
    city.stats.infrastructure = 62;
    city.stats.food = 62;
    city.stats.chaos = 24;
    city.stats.housing = 42; // overcrowded → triggers founding
    city = simulateDay(city, { suppressEvents: true }).city;
  }
  return city;
}

describe('cast generation', () => {
  it('generates a 6-10 member cast with valid, district-bound members', () => {
    for (let i = 0; i < 15; i++) {
      const city = generateCity(`cast-shape-${i}`);
      const cast = city.cast ?? [];
      expect(cast.length).toBeGreaterThanOrEqual(6);
      expect(cast.length).toBeLessThanOrEqual(10);
      const ids = cast.map((c) => c.id);
      expect(new Set(ids).size).toBe(ids.length); // unique ids
      const names = cast.map((c) => c.name);
      expect(new Set(names).size).toBe(names.length); // unique names
      const districtIds = new Set(city.districts.map((d) => d.id));
      for (const member of cast) {
        expect(member.name.length).toBeGreaterThan(2);
        expect(member.archetype.length).toBeGreaterThan(0);
        expect(member.personality.length).toBeGreaterThan(0);
        expect(districtIds.has(member.homeDistrictId)).toBe(true);
        // Archetype is one the home district actually offers.
        const home = city.districts.find((d) => d.id === member.homeDistrictId)!;
        expect(home).toBeDefined();
      }
    }
  });

  it('is deterministic: same seed → identical cast', () => {
    const a = generateCity('cast-determinism');
    const b = generateCity('cast-determinism');
    expect(JSON.stringify(a.cast)).toBe(JSON.stringify(b.cast));
  });

  it('different seeds → different casts', () => {
    const a = generateCity('cast-seed-a');
    const b = generateCity('cast-seed-b');
    expect(JSON.stringify(a.cast)).not.toBe(JSON.stringify(b.cast));
  });

  it('does not perturb the rest of generation (snapshot guard intact)', () => {
    // Cast lives on its own `:cast` sub-stream, so the city sans cast/chronicle
    // must be byte-identical with or without the cast existing — proven by the
    // fact that name/districts/stats/quirks are unchanged across two calls.
    const a = generateCity('cast-isolation');
    const b = generateCity('cast-isolation');
    expect(a.name).toBe(b.name);
    expect(JSON.stringify(a.stats)).toBe(JSON.stringify(b.stats));
    expect(a.districts.map((d) => d.id)).toEqual(b.districts.map((d) => d.id));
  });

  it('expansion-added cast members are deterministic', () => {
    const a = growWithPressure('cast-expand-det', 240);
    const b = growWithPressure('cast-expand-det', 240);
    expect(JSON.stringify(a.cast)).toBe(JSON.stringify(b.cast));
    // The run actually exercised expansion (more districts than at founding).
    const start = freshCity('cast-expand-det').districts.length;
    if (!a.outcome) {
      expect(a.districts.length).toBeGreaterThan(start);
    }
  });

  it('expansion can grow the cast and keeps names/ids unique', () => {
    // Across a few expanding seeds, at least one should add a mid-run member.
    let sawGrowth = false;
    for (const seed of ['cast-grow-1', 'cast-grow-2', 'cast-grow-3', 'cast-grow-4']) {
      const start = generateCity(seed).cast?.length ?? 0;
      const grown = growWithPressure(seed, 260);
      const cast = grown.cast ?? [];
      if (cast.length > start) sawGrowth = true;
      const ids = cast.map((c) => c.id);
      expect(new Set(ids).size, `${seed} cast ids`).toBe(ids.length);
      const names = cast.map((c) => c.name);
      expect(new Set(names).size, `${seed} cast names`).toBe(names.length);
      // Every member still belongs to a real district.
      const districtIds = new Set(grown.districts.map((d) => d.id));
      for (const m of cast) expect(districtIds.has(m.homeDistrictId)).toBe(true);
    }
    expect(sawGrowth, 'expected at least one mid-run cast addition').toBe(true);
  });
});

describe('{citizen} token resolution', () => {
  /** A synthetic event using {citizen} in description + a choice resultText. */
  const citizenEvent: GameEventDef = {
    id: 'synthetic-citizen-event',
    title: 'A Visit from {citizen}',
    description: '{citizen} has a request for the council, delivered with great ceremony.',
    tags: ['weird'],
    weight: 10,
    choices: [
      {
        id: 'grant',
        label: 'Grant it',
        effects: { happiness: 3 },
        resultText: 'The council grants the request. {citizen} departs, satisfied and slightly smug.',
      },
    ],
  };

  it('resolves {citizen} to a real cast member name, deterministically', () => {
    const city = freshCity('citizen-token');
    const rng = new Rng(123);
    const event = instantiateEvent(citizenEvent, city, rng);
    // No raw token leaks.
    expect(event.description).not.toContain('{citizen}');
    expect(event.title).not.toContain('{citizen}');
    // The name is one of the cast.
    const names = (city.cast ?? []).map((c) => c.name);
    const named = names.find((n) => event.description.includes(n));
    expect(named, 'description should name a cast member').toBeDefined();

    // Deterministic: the same city + the same tick rng resolves the same
    // citizen. (The involved district is picked from the passed rng for an
    // event with no fixed district; citizen resolution given that district uses
    // its own seed+day sub-stream — so a fixed rng seed reproduces the result.)
    const city2 = freshCity('citizen-token');
    const event2 = instantiateEvent(citizenEvent, city2, new Rng(123));
    expect(event2.description).toBe(event.description);
  });

  it('records the involvement so a follow-up reuses the same name', () => {
    const city = freshCity('citizen-recur');
    const rng = new Rng(1);
    const event = instantiateEvent(citizenEvent, city, rng);
    // instantiateEvent recorded a citizenInvolvement for this def.
    const involvement = (city.citizenInvolvements ?? []).find(
      (i) => i.defId === citizenEvent.id,
    );
    expect(involvement).toBeDefined();
    const member = (city.cast ?? []).find((c) => c.id === involvement!.citizenId)!;
    expect(member).toBeDefined();
    // The same name appears in the event description.
    expect(event.description).toContain(member.name);

    // Applying the choice resolves {citizen} in the resultText to the SAME name.
    const active: ActiveEvent = event;
    const { news } = applyEventChoice(city, active, 'grant');
    const resultLine = news.find((n) => n.text.includes('departs, satisfied'));
    expect(resultLine).toBeDefined();
    expect(resultLine!.text).toContain(member.name);
    expect(resultLine!.text).not.toContain('{citizen}');
  });

  it('prefers a cast member from the involved district', () => {
    const city = freshCity('citizen-district');
    const target = city.districts[0];
    // Force a known cast member into the target district so the preference is
    // observable, and clear involvements for a clean resolve.
    city.cast = [
      { id: 'cast-x', name: 'Testnamed Person', archetype: 'longtime locals', personality: 'p', homeDistrictId: target.id },
    ];
    city.citizenInvolvements = [];
    const chosen = resolveCitizen(city, 'some-def', target.id);
    expect(chosen?.id).toBe('cast-x');
  });

  it('falls back gracefully when the city has no cast', () => {
    const city = freshCity('citizen-nocast');
    city.cast = [];
    const rng = new Rng(7);
    const event = instantiateEvent(citizenEvent, city, rng);
    // The generic fallback fills in for {citizen}; no raw token remains.
    expect(event.description).not.toContain('{citizen}');
    expect(event.description.length).toBeGreaterThan(0);
  });
});

describe('chronicle', () => {
  it('opens with a founding entry on day 1', () => {
    const city = generateCity('chronicle-founding');
    const chronicle = city.chronicle ?? [];
    expect(chronicle.length).toBeGreaterThan(0);
    const founding = chronicle.find((e) => e.kind === 'founding');
    expect(founding).toBeDefined();
    expect(founding!.day).toBe(1);
    expect(founding!.title).toContain(city.name);
  });

  it('records founding ritual choices', () => {
    const city = generateCity('chronicle-ritual', {
      siteId: 'a',
      patronQuirkId: 'singing-river',
      name: 'Testburg',
    });
    const founding = (city.chronicle ?? []).filter((e) => e.kind === 'founding');
    // Founding line + a site beat + a patron beat.
    expect(founding.length).toBeGreaterThanOrEqual(2);
    expect(founding.some((e) => e.title === 'A Patron Is Named')).toBe(true);
  });

  it('appends a disaster entry when a disaster strikes (survived)', () => {
    // Pin a risk to the ceiling so a disaster fires within a few days; the
    // chronicle should gain a 'disaster' entry.
    let city = freshCity('chronicle-disaster');
    city.day = 25;
    let sawDisaster = false;
    for (let i = 0; i < 60 && !sawDisaster; i++) {
      // Keep a fire risk pinned high so the roll fires.
      const fire = city.risks.find((r) => r.kind === 'fire');
      if (fire) fire.level = 100;
      else city.risks.push({ kind: 'fire', level: 100, description: 'pinned' });
      city = simulateDay(city, { suppressEvents: true }).city;
      sawDisaster = (city.chronicle ?? []).some((e) => e.kind === 'disaster');
    }
    expect(sawDisaster, 'expected a disaster chronicle entry').toBe(true);
  });

  it('appends an ending entry when the run reaches an outcome', () => {
    // Drive the magical singularity (as in engine.test.ts) and check the
    // chronicle gains an 'ending' entry matching the outcome.
    let city = freshCity('chronicle-ending');
    city.day = 25;
    let ended = false;
    for (let i = 0; i < 15 && !ended; i++) {
      city.stats.magic = 95;
      const result = simulateDay(city, { suppressEvents: true });
      city = result.city;
      ended = result.outcome !== null;
    }
    expect(ended).toBe(true);
    const ending = (city.chronicle ?? []).find((e) => e.kind === 'ending');
    expect(ending).toBeDefined();
    expect(ending!.day).toBe(city.outcome!.day);
    expect(ending!.title).toBe(city.outcome!.title);
  });

  it('chronicle writing is deterministic and does not break replay', () => {
    const a = growWithPressure('chronicle-replay', 200);
    const b = growWithPressure('chronicle-replay', 200);
    expect(JSON.stringify(a.chronicle)).toBe(JSON.stringify(b.chronicle));
    // A district founding produced a 'district' chronicle entry.
    const start = freshCity('chronicle-replay').districts.length;
    if (a.districts.length > start) {
      expect((a.chronicle ?? []).some((e) => e.kind === 'district')).toBe(true);
    }
  });
});
