import type { AgeId, AgeLogEntry, City, NewsItem } from '../types';
import { AGE_ORDER } from '../types';
import { ageUpChronicleEntry, pushChronicle } from './chronicle';

// ---------------------------------------------------------------------------
// Ages (phase 04) — the city's growth formalized into five named ages:
// Settlement → Village → Town → City → Wonder Age. Pure data + pure functions;
// the engine calls `checkAgeUp` once per tick (no RNG — advancement is a
// deterministic function of the city's milestones, so replays are exact).
//
// Advancement is *earned but inevitable-ish*: each transition asks for a
// handful of soft milestones (population vs founding, average district
// development, district count, landmarks built, days spent in the age) and
// advances when ENOUGH of them hold — days-in-age is itself a milestone, so a
// surviving, functioning city always progresses eventually, while a city in
// genuine decline simply stays in its age (ages never regress). Thresholds are
// tuned against measured hands-off trajectories (avg development ~22 at day 25
// → ~58 median at day 250; population often *shrinks* hands-off, so it is
// never a required axis): a typical run sees Town around the midgame and has a
// shot at the Wonder Age by the late game.
// ---------------------------------------------------------------------------

/** Soft milestone thresholds for advancing INTO an age. All optional axes. */
export interface AgeMilestones {
  /** Average district development (0..100) at or above this. */
  avgDevelopment?: number;
  /** Population at or above this multiple of the founding population. */
  popRatio?: number;
  /** At least this many districts. */
  districts?: number;
  /** At least this many completed mayor projects. */
  landmarks?: number;
  /** At least this many days spent in the current age (the patience axis). */
  daysInAge?: number;
}

export interface AgeRequirements {
  /** Hard pacing gate: days spent in the previous age before any advance. */
  minDaysInAge: number;
  /** How many of the milestones must hold. */
  needed: number;
  milestones: AgeMilestones;
}

export interface AgeDef {
  id: AgeId;
  /** Short display name ('Village'). */
  name: string;
  /** Celebration title ('The Village Age'). */
  title: string;
  /** Warm one-liner shown in the age bar / celebration banner. */
  flavor: string;
  /**
   * Soft, hopeful hint about what carries a city toward THIS age — shown on
   * the age bar for the next age. Never a checklist of exact numbers.
   */
  dream: string;
  /** Requirements to advance INTO this age; null for the founding settlement. */
  requires: AgeRequirements | null;
}

export const AGE_DEFS: AgeDef[] = [
  {
    id: 'settlement',
    name: 'Settlement',
    title: 'The Settlement',
    flavor: 'A brave little camp with big plans and one very optimistic banner.',
    dream: 'Every city starts somewhere — usually with tents and enthusiasm.',
    requires: null,
  },
  {
    id: 'village',
    name: 'Village',
    title: 'The Village Age',
    flavor: 'Timber frames, garden fences, and a tavern that knows everyone by name.',
    dream:
      'Your settlement dreams of becoming a Village. A little time, a little growth, and homes rising where the tents stood will get it there.',
    requires: {
      minDaysInAge: 10,
      needed: 2,
      milestones: {
        avgDevelopment: 24,
        popRatio: 1.02,
        districts: 6,
        daysInAge: 25,
      },
    },
  },
  {
    id: 'town',
    name: 'Town',
    title: 'The Town Age',
    flavor: 'Stone walls, tiled roofs, and a market square with opinions.',
    dream:
      'Your village dreams of becoming a Town. Growing population, thriving districts, and a landmark or two will get it there.',
    requires: {
      minDaysInAge: 15,
      needed: 2,
      milestones: {
        avgDevelopment: 42,
        popRatio: 1.05,
        districts: 7,
        landmarks: 1,
        daysInAge: 55,
      },
    },
  },
  {
    id: 'city',
    name: 'City',
    title: 'The City Age',
    flavor: 'Brick and ornament, lantern-lit avenues, and paperwork with its own paperwork.',
    dream:
      'Your town dreams of becoming a City. Bustling districts, new neighborhoods breaking ground, and proud landmarks will get it there.',
    requires: {
      minDaysInAge: 20,
      needed: 2,
      milestones: {
        avgDevelopment: 60,
        popRatio: 1.15,
        districts: 8,
        landmarks: 2,
        daysInAge: 80,
      },
    },
  },
  {
    id: 'wonder',
    name: 'Wonder Age',
    title: 'The Wonder Age',
    flavor: 'Banners and gilded rooftops — a city ready to raise something eternal.',
    dream:
      'Your city dreams of a Wonder Age. A flourishing, well-built metropolis — grand districts, beloved landmarks, patient years — will open the way.',
    requires: {
      minDaysInAge: 25,
      needed: 2,
      milestones: {
        avgDevelopment: 75,
        popRatio: 1.3,
        districts: 9,
        landmarks: 3,
        daysInAge: 110,
      },
    },
  },
];

/** Look up an age definition (always exists for a valid AgeId). */
export function getAgeDef(id: AgeId): AgeDef {
  return AGE_DEFS.find((a) => a.id === id)!;
}

/** Index of an age in the canonical order (settlement = 0). */
export function ageIndex(id: AgeId): number {
  return AGE_ORDER.indexOf(id);
}

/** The city's current age; undefined state reads as the founding settlement. */
export function currentAge(city: City): AgeId {
  return city.age ?? 'settlement';
}

/** Whether the city has reached at least the given age. */
export function ageAtLeast(city: City, age: AgeId): boolean {
  return ageIndex(currentAge(city)) >= ageIndex(age);
}

/** The next age def, or null in the Wonder Age. */
export function nextAgeDef(city: City): AgeDef | null {
  const idx = ageIndex(currentAge(city));
  return idx < AGE_DEFS.length - 1 ? AGE_DEFS[idx + 1] : null;
}

/** The day the city entered its current age (founding settlement = day 1). */
export function ageEnteredDay(city: City): number {
  const log = city.ageLog ?? [];
  return log.length > 0 ? log[log.length - 1].day : 1;
}

/** Average district development, 0..100. */
function avgDevelopment(city: City): number {
  if (city.districts.length === 0) return 0;
  return city.districts.reduce((s, d) => s + d.development, 0) / city.districts.length;
}

/** How many of a transition's milestones currently hold. */
export function milestonesMet(city: City, req: AgeRequirements): number {
  const m = req.milestones;
  const daysInAge = city.day - ageEnteredDay(city);
  const founding = city.foundingPopulation ?? city.stats.population;
  const landmarks = (city.completedProjects ?? []).length;
  let met = 0;
  if (m.avgDevelopment !== undefined && avgDevelopment(city) >= m.avgDevelopment) met++;
  if (m.popRatio !== undefined && city.stats.population >= founding * m.popRatio) met++;
  if (m.districts !== undefined && city.districts.length >= m.districts) met++;
  if (m.landmarks !== undefined && landmarks >= m.landmarks) met++;
  if (m.daysInAge !== undefined && daysInAge >= m.daysInAge) met++;
  return met;
}

/**
 * Soft progress (0..1) toward the next age, for the age bar's gentle fill.
 * Each milestone contributes its capped fraction; never shown as numbers.
 */
export function ageProgress(city: City): number {
  const next = nextAgeDef(city);
  if (!next || !next.requires) return 1;
  const m = next.requires.milestones;
  const daysInAge = city.day - ageEnteredDay(city);
  const founding = city.foundingPopulation ?? city.stats.population;
  const landmarks = (city.completedProjects ?? []).length;
  const parts: number[] = [];
  const frac = (value: number, threshold: number) =>
    Math.max(0, Math.min(1, value / threshold));
  if (m.avgDevelopment !== undefined) parts.push(frac(avgDevelopment(city), m.avgDevelopment));
  if (m.popRatio !== undefined) {
    parts.push(frac(city.stats.population / Math.max(1, founding), m.popRatio));
  }
  if (m.districts !== undefined) parts.push(frac(city.districts.length, m.districts));
  if (m.landmarks !== undefined) parts.push(frac(landmarks, m.landmarks));
  if (m.daysInAge !== undefined) parts.push(frac(daysInAge, m.daysInAge));
  if (parts.length === 0) return 0;
  // The `needed` best axes carry the progress (matching how advancement works).
  parts.sort((a, b) => b - a);
  const take = parts.slice(0, next.requires.needed);
  return take.reduce((s, v) => s + v, 0) / take.length;
}

/**
 * Daily advancement check, called by the engine after districts/expansion have
 * settled. Mutates the city (age, ageLog) and pushes the celebration headline.
 * Deterministic — no RNG. At most one age-up per tick (the pacing gates make
 * back-to-back advances impossible in normal play anyway).
 */
export function checkAgeUp(city: City, headlines: NewsItem[]): AgeDef | null {
  const next = nextAgeDef(city);
  if (!next || !next.requires) return null;
  const req = next.requires;
  const daysInAge = city.day - ageEnteredDay(city);
  if (daysInAge < req.minDaysInAge) return null;
  if (milestonesMet(city, req) < req.needed) return null;

  city.age = next.id;
  const entry: AgeLogEntry = { age: next.id, day: city.day };
  city.ageLog = [...(city.ageLog ?? []), entry];
  headlines.push({
    day: city.day,
    text: `${city.name} enters ${next.title}! ${next.flavor} Fireworks are deployed; the committee responsible takes a bow.`,
    tone: 'good',
  });
  pushChronicle(city, ageUpChronicleEntry(city, next.id, next.title, next.flavor));
  return next;
}
