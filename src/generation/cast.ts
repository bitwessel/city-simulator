import type { City, District, NotableCitizen } from '../types';
import { Rng, hashSeed } from '../utils/rng';
import { DISTRICT_ARCHETYPES } from './data/names';

// ---------------------------------------------------------------------------
// Named citizens (phase 06). A small cast (~6-10) of named townsfolk, generated
// deterministically from a dedicated `:cast` sub-stream so the existing
// generateCity / expansion RNG sequences are never perturbed. Pure data: the
// renderer binds each to a citizen instance, the text layer drops their names
// in via the `{citizen}` token, and the chronicle name-drops them.
// ---------------------------------------------------------------------------

/**
 * Given-name pool. Warm, a little fantastical, never grim. Picked freely (with
 * a uniqueness pass at assembly time) so two cities feel populated, not cloned.
 */
const CITIZEN_GIVEN_NAMES = [
  'Marta', 'Bram', 'Pell', 'Odo', 'Fenna', 'Gust', 'Liry', 'Toval',
  'Nessa', 'Corbin', 'Wynn', 'Sable', 'Hodge', 'Pim', 'Esca', 'Rook',
  'Tilda', 'Garr', 'Mirel', 'Ondry', 'Bex', 'Halla', 'Quill', 'Doral',
  'Senna', 'Yarrow', 'Mab', 'Cresswell', 'Lune', 'Padrig', 'Vesper', 'Wren',
];

/**
 * Surname / epithet pool. Either a plain family name or a "the X" trade epithet
 * that pairs nicely with an archetype. Assembled with the given name.
 */
const CITIZEN_SURNAMES = [
  'Quill', 'Brambleshank', 'Underbough', 'Ashworth', 'Tallow', 'Greenwattle',
  'Pennywhistle', 'Hollowell', 'Marsh', 'Cobblethwaite', 'Dunnock', 'Sleet',
  'Farrow', 'Goodbarrow', 'Inkfoot', 'Mossbank', 'Ravenell', 'Saltcoat',
  'Thistledown', 'Wickbridge', 'Yarrowgate', 'Pottage', 'Drumble', 'Larkspur',
];

/**
 * Personality lines, deliberately archetype-agnostic so any cast member can
 * draw one. Warm, slightly funny, fantasy-flavoured; never grimdark.
 */
const CITIZEN_PERSONALITIES = [
  'Keeps a list of every dog in the district and their preferred greetings.',
  'Believes the river is sulking and brings it small gifts on Fridays.',
  'Has strong, well-rehearsed opinions about the correct way to stack bread.',
  'Once won an argument with a goose and has never been the same since.',
  'Collects rumors the way others collect coins, and tips generously.',
  'Insists the statue in the square winked at them, and is probably right.',
  'Famously calm in a crisis; famously not calm about queue-jumping.',
  'Names every pigeon, then loses track, then names them again.',
  'Carries spare buttons for strangers and a spare opinion for everyone.',
  'Can predict the weather by how the cobbles smell. Annoyingly accurate.',
  'Hums the same six notes all day and the whole district hums them back by dusk.',
  'Maintains an unofficial lost-and-found that is mostly umbrellas and one boot.',
  'Treats every festival as a personal project and every Tuesday as a small festival.',
  'Knows a shortcut. It is never actually shorter, but the view is lovely.',
  'Writes very long letters of complaint that always end with a recipe.',
  'Has befriended the night, the fog, and at least one suspicious cat.',
];

/** How many cast members a city of `districtCount` districts gets (6-10). */
function castSizeFor(rng: Rng, districtCount: number): number {
  // Roughly one per district, clamped to the 6-10 band the spec asks for.
  const base = Math.min(10, Math.max(6, districtCount + rng.int(0, 2)));
  return base;
}

/** Assemble a display name, preferring an unused given name + surname pair. */
function buildName(rng: Rng, used: Set<string>): string {
  for (let attempt = 0; attempt < 24; attempt++) {
    const given = rng.pick(CITIZEN_GIVEN_NAMES);
    const surname = rng.pick(CITIZEN_SURNAMES);
    const name = `${given} ${surname}`;
    if (!used.has(name)) {
      used.add(name);
      return name;
    }
  }
  // Extremely unlikely fallback: tack on a numeral so names stay unique.
  const given = rng.pick(CITIZEN_GIVEN_NAMES);
  const name = `${given} ${rng.pick(CITIZEN_SURNAMES)} ${used.size}`;
  used.add(name);
  return name;
}

/** Pick an archetype for a citizen from their home district's roster. */
function archetypeFor(rng: Rng, district: District): string {
  const arch = DISTRICT_ARCHETYPES.find((a) => a.type === district.type);
  const pool = arch?.citizenArchetypes ?? ['longtime locals'];
  return rng.pick(pool);
}

/**
 * Build one notable citizen for a home district from the given rng + used-name
 * set. Shared by initial generation and mid-run expansion so both produce the
 * same shape. `id` is supplied by the caller (globally unique).
 */
export function makeNotableCitizen(
  rng: Rng,
  id: string,
  district: District,
  used: Set<string>,
): NotableCitizen {
  return {
    id,
    name: buildName(rng, used),
    archetype: archetypeFor(rng, district),
    personality: rng.pick(CITIZEN_PERSONALITIES),
    homeDistrictId: district.id,
  };
}

/**
 * Generate the city's starting cast from a dedicated `:cast` sub-stream. Called
 * by generateCity AFTER districts exist; never touches the main generation rng,
 * so the generateCity snapshot guard is unaffected. Spreads members across
 * districts (each district gets at least one until the cast is full).
 */
export function generateCast(seedRaw: string, districts: District[]): NotableCitizen[] {
  if (districts.length === 0) return [];
  const rng = new Rng(hashSeed(`${seedRaw}:cast`));
  const size = castSizeFor(rng, districts.length);
  const used = new Set<string>();
  const cast: NotableCitizen[] = [];
  for (let i = 0; i < size; i++) {
    // Round-robin districts so every district has a face, then wrap.
    const district = districts[i % districts.length];
    cast.push(makeNotableCitizen(rng, `cast-${i}`, district, used));
  }
  return cast;
}

/**
 * Build a deterministic sub-stream for adding a cast member when a district is
 * founded mid-run on `day`. Its own `:cast:<day>` stream keeps the existing
 * expansion draws (and thus expansion determinism) untouched.
 */
export function castExpansionRng(seedRaw: string, day: number): Rng {
  return new Rng(hashSeed(`${seedRaw}:cast:${day}`));
}

/** The set of cast names already in use, so expansion keeps names unique. */
export function usedCastNames(city: City): Set<string> {
  return new Set((city.cast ?? []).map((c) => c.name));
}
