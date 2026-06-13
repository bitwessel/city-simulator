import type {
  AgeId,
  ChronicleEntry,
  ChronicleKind,
  City,
  CityOutcome,
  District,
  FoundingChoices,
} from '../types';

// ---------------------------------------------------------------------------
// The City Chronicle (phase 06). The run writes its own storybook: founding,
// age-ups, district foundings, disasters survived, projects completed, edicts
// declared, major event choices, and the ending. Entries are plain serializable
// data appended to `city.chronicle`.
//
// HARD RULE: writing a chronicle entry must NOT draw RNG. Every entry is derived
// from already-decided facts (names, days, choices) so it never perturbs a
// simulation stream and replays reproduce the chronicle exactly. These helpers
// are therefore pure string assembly + an in-place push.
// ---------------------------------------------------------------------------

/** Append an entry to the city's chronicle (creating the array if absent). */
export function pushChronicle(city: City, entry: ChronicleEntry): void {
  if (!city.chronicle) city.chronicle = [];
  city.chronicle.push(entry);
}

/** Minimal shape of a chosen founding site (avoids a generator import cycle). */
export interface FoundingSiteHint {
  vibe: string;
}

/**
 * The opening chronicle entries: the founding itself, plus a beat for each
 * ritual choice the player made (site / patron / name). Called by the generator
 * right after the city object is assembled. Pure text — no RNG.
 */
export function foundingChronicleEntries(
  city: City,
  chosenSite?: FoundingSiteHint,
): ChronicleEntry[] {
  const entries: ChronicleEntry[] = [];
  const founding: FoundingChoices | undefined = city.founding;

  entries.push({
    day: 1,
    title: `${city.name} Is Founded`,
    text: `On this day, the first stones of ${city.name} were laid and a banner — only slightly misspelled — was raised. The city begins, as all good cities do, with optimism and an unresolved argument.`,
    kind: 'founding',
  });

  if (chosenSite) {
    entries.push({
      day: 1,
      title: 'A Site Is Chosen',
      text: `The founders settled on ground that is ${chosenSite.vibe}. History, if asked, will insist this was always the obvious choice.`,
      kind: 'founding',
    });
  }

  if (founding?.patronQuirkId) {
    const patron = city.quirks.find((q) => q.id === founding.patronQuirkId);
    if (patron) {
      entries.push({
        day: 1,
        title: 'A Patron Is Named',
        text: `${city.name} takes ${patron.title.toLowerCase()} as its founding charm. ${patron.description}`,
        kind: 'founding',
      });
    }
  }

  return entries;
}

/** Chronicle an age-up. Called from ages.ts after the age advances. */
export function ageUpChronicleEntry(
  city: City,
  ageId: AgeId,
  title: string,
  flavor: string,
): ChronicleEntry {
  return {
    day: city.day,
    title,
    text: `${city.name} grows into ${title.toLowerCase().startsWith('the ') ? title : `the ${title}`}. ${flavor}`,
    kind: 'age-up',
  };
}

/** Chronicle a newly-founded district. Called from expansion.ts. */
export function districtFoundedChronicleEntry(
  city: City,
  district: District,
): ChronicleEntry {
  return {
    day: city.day,
    title: `${district.name} Breaks Ground`,
    text: `${city.name} expands: ${district.name} is founded, complete with one very proud signpost and a population of optimists.`,
    kind: 'district',
    districtId: district.id,
    districtName: district.name,
  };
}

/**
 * Chronicle a disaster the city survived. Called from rollDisasters. The text
 * leans on "survived" — the chronicle is warm, never grim.
 */
export function disasterChronicleEntry(
  city: City,
  districtName: string,
  riskTitle: string,
): ChronicleEntry {
  return {
    day: city.day,
    title: `${riskTitle} in ${districtName}`,
    text: `${districtName} weathered ${riskTitle.toLowerCase()} and came out the other side, shaken, sooty, and quietly proud. The city remembers the helpers.`,
    kind: 'disaster',
    districtName,
  };
}

/** Chronicle a completed mayor project. Called from tickConstruction. */
export function projectChronicleEntry(
  city: City,
  projectName: string,
  district: District,
): ChronicleEntry {
  return {
    day: city.day,
    title: `${projectName} Is Finished`,
    text: `After much hammering and at least one ribbon, ${projectName} now stands in ${district.name}. ${city.name} gathers to admire it and pretend it was never in doubt.`,
    kind: 'project',
    districtId: district.id,
    districtName: district.name,
  };
}

/** Chronicle a declared (or lifted) standing edict. Called from declareEdict. */
export function edictChronicleEntry(
  city: City,
  edictName: string | null,
): ChronicleEntry {
  if (edictName === null) {
    return {
      day: city.day,
      title: 'A Proclamation Is Lifted',
      text: `The mayor quietly set aside the standing proclamation, and ${city.name} resumed its ordinary, comfortable shape.`,
      kind: 'edict',
    };
  }
  return {
    day: city.day,
    title: `Edict: ${edictName}`,
    text: `The mayor declared ${edictName} over ${city.name}. The bunting goes up; opinions, as ever, are mixed but loud.`,
    kind: 'edict',
  };
}

/**
 * Chronicle a notable event choice. Recorded for choices the engine flags as
 * "major" (a queued chain, a wonder start, or a large stat swing). Optionally
 * name-drops the cast member the event involved.
 */
export function eventChronicleEntry(
  city: City,
  title: string,
  resultText: string,
  refs: { districtId?: string; districtName?: string; citizenId?: string; citizenName?: string } = {},
): ChronicleEntry {
  return {
    day: city.day,
    title,
    text: resultText,
    kind: 'event',
    ...refs,
  };
}

/** Chronicle the run's ending. Called from simulateDay once an outcome lands. */
export function endingChronicleEntry(city: City, outcome: CityOutcome): ChronicleEntry {
  return {
    day: outcome.day,
    title: outcome.title,
    text: `${outcome.description} So ends the story of ${city.name} — seed and all, ready to be told again.`,
    kind: 'ending',
  };
}

/** Whether a chronicle already holds an entry of `kind` on `day` (idempotency). */
export function hasChronicleEntry(city: City, kind: ChronicleKind, day: number): boolean {
  return (city.chronicle ?? []).some((e) => e.kind === kind && e.day === day);
}
