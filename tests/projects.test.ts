import { describe, expect, it } from 'vitest';
import type { City, DistrictType } from '../src/types';
import { BOUNDED_STAT_KEYS, LANDMARK_BUILDING_KINDS } from '../src/types';
import { PROJECT_POOL } from '../src/projects/data/projects';
import {
  FAVOR_CAP,
  START_FAVOR,
  canStartProject,
  commissionProject,
  getProjectDef,
  projectAllowsDistrict,
} from '../src/projects/projects';
import { simulateDay } from '../src/simulation/engine';
import { distance } from '../src/utils/math';
import { riverDistanceAt, terrainHeightAt, WATER_LEVEL } from '../src/generation/terrain';
import { freshCity } from './helpers';

// Every DistrictType the generator can produce. Each must have >=2 eligible
// projects so any city composition has options.
const ALL_DISTRICT_TYPES: DistrictType[] = [
  'old-town',
  'market',
  'harbor',
  'forest-edge',
  'academy',
  'industrial',
  'noble-hill',
  'workers',
  'garden',
  'ruins',
  'festival',
  'magical',
];

/** Run a city forward `days` days with events suppressed (no memos to answer). */
function advance(city: City, days: number): City {
  let c = city;
  for (let i = 0; i < days; i++) {
    c = simulateDay(c, { suppressEvents: true }).city;
  }
  return c;
}

/** Find a district whose type allows the given project. */
function districtFor(city: City, defId: string) {
  const def = getProjectDef(defId)!;
  return city.districts.find((d) => projectAllowsDistrict(def, d));
}

describe('project pool integrity', () => {
  it('ships exactly one project per landmark kind', () => {
    expect(PROJECT_POOL.length).toBe(LANDMARK_BUILDING_KINDS.length);
    const kinds = PROJECT_POOL.map((p) => p.building);
    expect(new Set(kinds).size).toBe(kinds.length);
    expect(new Set(kinds)).toEqual(new Set(LANDMARK_BUILDING_KINDS));
  });

  it('has unique ids', () => {
    const ids = PROJECT_POOL.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has sane costs, build times, names and flavor', () => {
    for (const def of PROJECT_POOL) {
      expect(def.cost, def.id).toBeGreaterThan(0);
      expect(def.cost, def.id).toBeLessThanOrEqual(FAVOR_CAP);
      expect(def.buildDays, def.id).toBeGreaterThanOrEqual(4);
      expect(def.buildDays, def.id).toBeLessThanOrEqual(12);
      expect(def.name.length, def.id).toBeGreaterThan(0);
      expect(def.flavor.length, def.id).toBeGreaterThan(20);
    }
  });

  it('has valid district types', () => {
    for (const def of PROJECT_POOL) {
      if (def.districtTypes === 'any') continue;
      expect(def.districtTypes.length, def.id).toBeGreaterThan(0);
      for (const t of def.districtTypes) {
        expect(ALL_DISTRICT_TYPES, `${def.id} -> ${t}`).toContain(t);
      }
    }
  });

  it('keeps completion effects modest (within +/-6) and daily effects tiny', () => {
    for (const def of PROJECT_POOL) {
      const completion = Object.entries(def.completionEffects);
      expect(completion.length, def.id).toBeGreaterThan(0);
      for (const [key, value] of completion) {
        expect(BOUNDED_STAT_KEYS as readonly string[], `${def.id} ${key}`).toContain(key);
        expect(Math.abs(value as number), `${def.id} ${key}`).toBeLessThanOrEqual(6);
      }
      for (const [key, value] of Object.entries(def.dailyEffects ?? {})) {
        const v = Math.abs(value as number);
        expect(v, `${def.id} daily ${key}`).toBeGreaterThanOrEqual(0.05 - 1e-9);
        expect(v, `${def.id} daily ${key}`).toBeLessThanOrEqual(0.2 + 1e-9);
      }
    }
  });

  it('gives every district type at least 2 eligible projects', () => {
    for (const type of ALL_DISTRICT_TYPES) {
      const eligible = PROJECT_POOL.filter(
        (def) => def.districtTypes === 'any' || def.districtTypes.includes(type),
      );
      expect(eligible.length, `district type ${type}`).toBeGreaterThanOrEqual(2);
    }
  });

  it('offers at least one `any` crowd-pleaser', () => {
    expect(PROJECT_POOL.some((p) => p.districtTypes === 'any')).toBe(true);
  });
});

describe('project lifecycle', () => {
  it('commission places a scaffolded building, deducts favor, logs the order', () => {
    let city = freshCity('lifecycle-commission');
    city.favor = 20;
    const def = getProjectDef('fountain-plaza')!;
    const district = districtFor(city, def.id)!;
    const buildingsBefore = district.buildings.length;

    city = commissionProject(city, district.id, def.id);

    const d = city.districts.find((x) => x.id === district.id)!;
    expect(d.buildings.length).toBe(buildingsBefore + 1);
    const scaffold = d.buildings.find((b) => b.kind === def.building)!;
    expect(scaffold).toBeDefined();
    expect(scaffold.construction).toBe(true);
    expect(scaffold.appearAt).toBe(0);

    expect(city.favor).toBe(20 - def.cost);
    expect(city.projectLog).toHaveLength(1);
    expect(city.projectLog![0]).toMatchObject({ districtId: district.id, defId: def.id });
    expect(city.activeProjects).toHaveLength(1);
    expect(city.activeProjects![0].completeDay).toBe(city.day + def.buildDays);
    expect(city.news.at(-1)!.text).toContain(def.name);
  });

  it('completes after buildDays: scaffolding cleared, effects applied, headline emitted', () => {
    let city = freshCity('lifecycle-complete');
    city.favor = 24;
    const def = getProjectDef('public-bathhouse')!;
    const district = districtFor(city, def.id)!;
    city = commissionProject(city, district.id, def.id);

    const happinessBefore = city.stats.happiness;
    const buildingId = city.activeProjects![0].buildingId;
    const completeDay = city.activeProjects![0].completeDay;

    // Advance until the completion day inclusive.
    city = advance(city, completeDay - city.day);

    // Active project moved to completed.
    expect(city.activeProjects ?? []).toHaveLength(0);
    expect(city.completedProjects).toHaveLength(1);
    expect(city.completedProjects![0].defId).toBe(def.id);

    // Scaffolding cleared on the actual building.
    const d = city.districts.find((x) => x.id === district.id)!;
    const building = d.buildings.find((b) => b.id === buildingId)!;
    expect(building.construction).toBeFalsy();

    // Completion effect raised happiness (bathhouse: +5 happiness on completion).
    expect(city.stats.happiness).toBeGreaterThan(happinessBefore);

    // Celebratory headline naming the landmark.
    expect(
      city.news.some((n) => n.tone === 'good' && n.text.includes(def.name) && n.text.includes('finished')),
    ).toBe(true);
  });

  it('ongoing daily drift from a completed landmark moves stats over time', () => {
    // The grove pulls pollution down a touch every day once it stands.
    let city = freshCity('lifecycle-drift');
    city.favor = 24;
    city.stats.pollution = 60;
    const def = getProjectDef('whispering-grove')!;
    const district = districtFor(city, def.id)!;
    city = commissionProject(city, district.id, def.id);
    city = advance(city, def.buildDays); // finish it
    const pollutionAtCompletion = city.stats.pollution;
    city.stats.pollution = pollutionAtCompletion; // re-pin to isolate the drift
    const before = city.stats.pollution;
    city = advance(city, 10);
    expect(city.stats.pollution).toBeLessThan(before);
  });

  it('rejects invalid commissions with a human-readable reason', () => {
    const city = freshCity('lifecycle-validate');
    const def = getProjectDef('harbor-lighthouse')!; // harbor only
    const wrong = city.districts.find((d) => d.type !== 'harbor');
    if (wrong) {
      const res = canStartProject(city, wrong.id, def.id);
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.reason.length).toBeGreaterThan(0);
    }

    // Not enough favor.
    const poor = freshCity('lifecycle-poor');
    poor.favor = 0;
    const cheap = getProjectDef('fountain-plaza')!;
    const anyDistrict = poor.districts[0];
    const res = canStartProject(poor, anyDistrict.id, cheap.id);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toContain('favor');
  });

  it('enforces the per-district project cap and rejects duplicates', () => {
    let city = freshCity('lifecycle-cap');
    city.favor = 100;
    // A mature city so phase-04 age gates don't mask the cap/duplicate checks.
    city.age = 'city';
    // fountain-plaza is `any`; pick a district and load it up with distinct
    // projects until the cap, all of which must allow that district type.
    const district = city.districts[0];
    const allowed = PROJECT_POOL.filter((def) => projectAllowsDistrict(def, district));
    expect(allowed.length).toBeGreaterThanOrEqual(2);

    // Duplicate rejection: commission one, then the same again.
    const first = allowed[0];
    city = commissionProject(city, district.id, first.id);
    expect(canStartProject(city, district.id, first.id).ok).toBe(false);

    // Fill to the cap (3) with distinct allowed projects, then the next is rejected.
    let placed = 1;
    for (const def of allowed.slice(1)) {
      if (placed >= 3) break;
      city = commissionProject(city, district.id, def.id);
      placed++;
    }
    if (placed >= 3 && allowed.length > 3) {
      const extra = allowed[3];
      const res = canStartProject(city, district.id, extra.id);
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.reason).toContain('projects');
    }
  });

  it('treats undefined favor as the starting amount', () => {
    const city = freshCity('lifecycle-undefined-favor');
    expect(city.favor).toBeUndefined();
    // A cheap project the starting favor can afford.
    const cheap = PROJECT_POOL.filter((p) => p.cost <= START_FAVOR);
    expect(cheap.length).toBeGreaterThan(0);
    const def = cheap[0];
    const district = districtFor(city, def.id)!;
    expect(canStartProject(city, district.id, def.id).ok).toBe(true);
  });

  it('regenerates favor over time, capped', () => {
    let city = freshCity('lifecycle-regen');
    city.favor = START_FAVOR;
    city = advance(city, 1);
    expect(city.favor!).toBeGreaterThan(START_FAVOR);
    city.favor = FAVOR_CAP;
    city = advance(city, 5);
    expect(city.favor!).toBeLessThanOrEqual(FAVOR_CAP);
  });
});

describe('project placement', () => {
  it('lands landmarks inside the district, dry, off the river, not colliding', () => {
    const seeds = Array.from({ length: 30 }, (_, i) => `place-${i}`);
    let commissioned = 0;
    for (const seed of seeds) {
      let city = freshCity(seed);
      city.favor = FAVOR_CAP;
      // Commission the `any` fountain in every district that has room.
      const def = getProjectDef('fountain-plaza')!;
      for (const district of city.districts) {
        if (!canStartProject(city, district.id, def.id).ok) continue;
        const before = district.buildings.length;
        city = commissionProject(city, district.id, def.id);
        const d = city.districts.find((x) => x.id === district.id)!;
        if (d.buildings.length === before) continue; // (shouldn't happen)
        commissioned++;
        const landmark = d.buildings[d.buildings.length - 1];

        // Inside the district footprint.
        expect(distance(landmark.position, d.position), `${seed}/${d.id} radius`).toBeLessThanOrEqual(
          d.radius + 0.01,
        );

        // Above water and off the river channel.
        const terrain = city.terrain;
        if (terrain) {
          const h = terrainHeightAt(terrain, landmark.position.x, landmark.position.z);
          expect(h, `${seed}/${d.id} height`).toBeGreaterThan(WATER_LEVEL);
          const riverDist = riverDistanceAt(terrain, landmark.position.x, landmark.position.z);
          expect(riverDist, `${seed}/${d.id} river`).toBeGreaterThan(terrain.river.width * 0.5);
        }

        // Not colliding with the other buildings already in the district.
        for (const other of d.buildings) {
          if (other.id === landmark.id) continue;
          expect(
            distance(landmark.position, other.position),
            `${seed}/${d.id} collide ${other.id}`,
          ).toBeGreaterThan(1.0);
        }
        // Refund favor so we can keep commissioning across districts.
        city.favor = FAVOR_CAP;
      }
    }
    expect(commissioned).toBeGreaterThan(0);
  });

  it('commissioning the same order from the same seed places it identically', () => {
    const make = () => {
      let city = freshCity('place-determinism');
      city.favor = FAVOR_CAP;
      const def = getProjectDef('fountain-plaza')!;
      const district = districtFor(city, def.id)!;
      return commissionProject(city, district.id, def.id);
    };
    const a = make();
    const b = make();
    const la = a.districts.flatMap((d) => d.buildings).find((bld) => bld.construction);
    const lb = b.districts.flatMap((d) => d.buildings).find((bld) => bld.construction);
    expect(la!.position).toEqual(lb!.position);
    expect(la!.rotation).toEqual(lb!.rotation);
  });
});
