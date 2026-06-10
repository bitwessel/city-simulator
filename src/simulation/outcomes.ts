import type { City, CityOutcome } from '../types';

// End-state detection. Outcomes are checked each day after stats settle.
// Most need a streak of qualifying days so a single spike doesn't end a run,
// and none can fire before a minimum day so every city gets a fair start.

interface OutcomeDef {
  kind: CityOutcome['kind'];
  title: string;
  tone: CityOutcome['tone'];
  minDay: number;
  /** Days in a row the condition must hold. */
  streak: number;
  qualifies: (city: City) => boolean;
  describe: (city: City) => string;
}

export const OUTCOME_DEFS: OutcomeDef[] = [
  {
    kind: 'utopia',
    title: 'The Shining City',
    tone: 'triumphant',
    minDay: 30,
    streak: 5,
    qualifies: (c) =>
      c.stats.happiness > 80 &&
      c.stats.beauty > 70 &&
      c.stats.trust > 70 &&
      c.stats.chaos < 30,
    describe: (c) =>
      `${c.name} has become the city other cities write jealous letters about. Citizens are happy, streets are beautiful, and the complaints office has been converted into a soup salon. Historians will argue about how you managed it. You will never tell.`,
  },
  {
    kind: 'golden-age',
    title: 'The Golden Age',
    tone: 'triumphant',
    minDay: 30,
    streak: 5,
    qualifies: (c) =>
      c.stats.wealth > 80 && c.stats.culture > 65 && c.stats.happiness > 60,
    describe: (c) =>
      `Trade roars, art flourishes, and ${c.name}'s mint has hired a second shift just to keep up. The city enters a golden age — gilded, prosperous, and only slightly smug about it.`,
  },
  {
    kind: 'collapse',
    title: 'The Great Unraveling',
    tone: 'catastrophic',
    minDay: 12,
    streak: 4,
    qualifies: (c) =>
      (c.stats.chaos > 85 && c.stats.trust < 25) ||
      (c.stats.food < 10 && c.stats.happiness < 25),
    describe: (c) =>
      `${c.name} has come apart like a cheap festival tent in a gale. The council fled, the granaries echo, and the last city record simply reads "no". It was a good run. Briefly.`,
  },
  {
    kind: 'ghost-town',
    title: 'The Quiet End',
    tone: 'bittersweet',
    minDay: 15,
    streak: 3,
    qualifies: (c) => c.stats.population < 200,
    describe: (c) =>
      `One by one, the citizens of ${c.name} packed their carts and left. The wind now holds council in the empty squares. The statues, at least, still give advice — to no one in particular.`,
  },
  {
    kind: 'magical-singularity',
    title: 'The Shimmering',
    tone: 'weird',
    minDay: 20,
    streak: 4,
    qualifies: (c) => c.stats.magic > 90,
    describe: (c) =>
      `Magic saturated every brick, every kettle, every pigeon. At dawn, ${c.name} gently lifted off the ground and folded itself into a more interesting dimension. Residents report excellent views and confusing plumbing. You are now mayor of a concept.`,
  },
  {
    kind: 'pollution-wasteland',
    title: 'The Long Smog',
    tone: 'catastrophic',
    minDay: 20,
    streak: 5,
    qualifies: (c) => c.stats.pollution > 88 && c.stats.beauty < 20,
    describe: (c) =>
      `The sky over ${c.name} settled into a permanent shade of regret. The river is flammable, the gardens surrendered, and the tourism board's new slogan is "Please Stop Asking". The city survives, technically.`,
  },
  {
    kind: 'revolution',
    title: 'The People’s Banquet',
    tone: 'bittersweet',
    minDay: 15,
    streak: 3,
    qualifies: (c) =>
      c.stats.trust < 15 &&
      c.factions.filter((f) => f.satisfaction < 25).length >= 2,
    describe: (c) =>
      `The factions of ${c.name} finally agreed on something: you. A remarkably polite revolution swept city hall, and your mayoral sash was repurposed as bunting. The new council sends its regards and a fruit basket.`,
  },
  {
    kind: 'wild-reclamation',
    title: 'The Green Tide',
    tone: 'weird',
    minDay: 25,
    streak: 5,
    qualifies: (c) =>
      c.stats.beauty > 85 && c.stats.infrastructure < 20,
    describe: (c) =>
      `The gardens won. Ivy took the clocktower, moss took the mint, and a very large rose bush took the mayor's office (you were out). ${c.name} is now the most beautiful place no one can find the roads in. The bees are thriving.`,
  },
];

/**
 * Track qualifying streaks and return an outcome when one completes.
 * `streaks` is the city's own `outcomeStreaks` record (already copied by the
 * engine for this tick) and is updated in place.
 */
export function checkOutcomes(
  city: City,
  streaks: Record<string, number>,
): CityOutcome | null {
  for (const def of OUTCOME_DEFS) {
    if (city.day < def.minDay) {
      streaks[def.kind] = 0;
      continue;
    }
    if (def.qualifies(city)) {
      streaks[def.kind] = (streaks[def.kind] ?? 0) + 1;
      if (streaks[def.kind] >= def.streak) {
        return {
          kind: def.kind,
          title: def.title,
          description: def.describe(city),
          tone: def.tone,
          day: city.day,
        };
      }
    } else {
      streaks[def.kind] = 0;
    }
  }
  return null;
}
