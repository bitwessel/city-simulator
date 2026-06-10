import type { CityQuirk } from '../../types';

// The pool of possible city quirks. Each generated city gets 2–4 of these.
// dailyEffects apply as small per-day stat drift; eventTagBias multiplies the
// selection weight of events carrying matching tags.

export const QUIRK_POOL: CityQuirk[] = [
  {
    id: 'talking-statues',
    title: 'All statues occasionally give advice',
    description:
      'The advice is unsolicited, oddly specific, and right about 60% of the time.',
    dailyEffects: { culture: 0.2, magic: 0.1 },
    eventTagBias: { magic: 1.5, culture: 1.3 },
  },
  {
    id: 'dragon-bones',
    title: 'The city was built on sleepy dragon bones',
    description: 'Mostly harmless. The ground purrs during thunderstorms.',
    dailyEffects: { magic: 0.3 },
    eventTagBias: { magic: 1.6, disaster: 1.3 },
  },
  {
    id: 'political-sewers',
    title: 'The sewers are politically active',
    description: 'They have a manifesto. It is surprisingly well-drafted.',
    dailyEffects: { chaos: 0.2 },
    eventTagBias: { weird: 1.5, infrastructure: 1.4, goblin: 1.4 },
  },
  {
    id: 'market-day-traffic',
    title: 'Market day brings the city to a standstill',
    description:
      'Every third day, commerce booms and absolutely nothing else moves an inch.',
    dailyEffects: { wealth: 0.3, chaos: 0.2 },
    eventTagBias: { economy: 1.7, festival: 1.3 },
  },
  {
    id: 'mood-clocktower',
    title: 'The clocktower sets the city’s mood',
    description:
      'Whatever tune it chimes, the citizens feel it. The clockkeeper takes requests, nervously.',
    dailyEffects: { happiness: 0.2, culture: 0.1 },
    eventTagBias: { culture: 1.4, weird: 1.4 },
  },
  {
    id: 'pigeon-post',
    title: 'Pigeons deliver official documents, badly',
    description:
      'Speedy, sincere, and approximately 70% accurate about which window is yours.',
    dailyEffects: { infrastructure: -0.2, happiness: 0.1 },
    eventTagBias: { weird: 1.5, crime: 1.2 },
  },
  {
    id: 'perpetual-festival',
    title: 'There is always, somewhere, a festival',
    description:
      'No one schedules them. They simply occur, like weather, only with more bunting.',
    dailyEffects: { happiness: 0.2, culture: 0.2, wealth: -0.1 },
    eventTagBias: { festival: 1.8, culture: 1.4 },
  },
  {
    id: 'helpful-fog',
    title: 'The morning fog is mildly helpful',
    description:
      'It rolls in, tidies a little, points lost travelers the right way, and rolls out.',
    dailyEffects: { safety: 0.2, magic: 0.1 },
    eventTagBias: { weird: 1.4, nature: 1.3 },
  },
  {
    id: 'opinionated-weather',
    title: 'The weather has strong opinions',
    description:
      'It rains on unpopular speeches and beams on weddings. The forecast is basically gossip.',
    dailyEffects: { chaos: 0.1, beauty: 0.1 },
    eventTagBias: { weird: 1.5, nature: 1.4 },
  },
  {
    id: 'thrifty-ghosts',
    title: 'The city’s ghosts are frugal and useful',
    description:
      'They haunt economically, mostly turning off lamps and judging your spending.',
    dailyEffects: { wealth: 0.2, magic: 0.1 },
    eventTagBias: { weird: 1.4, economy: 1.3, magic: 1.2 },
  },
  {
    id: 'singing-river',
    title: 'The river hums in the evenings',
    description:
      'It carries a low, tuneful melody downstream. Nobody taught it. Everybody hums along.',
    dailyEffects: { happiness: 0.2, beauty: 0.1 },
    eventTagBias: { nature: 1.5, culture: 1.3 },
  },
  {
    id: 'overzealous-gardens',
    title: 'The plants grow with alarming enthusiasm',
    description:
      'Leave a chair outside overnight and by morning it is a charming trellis.',
    dailyEffects: { beauty: 0.3, infrastructure: -0.2 },
    eventTagBias: { nature: 1.7, magic: 1.2 },
  },
  {
    id: 'tavern-democracy',
    title: 'Real policy is decided in the taverns',
    description:
      'Council chambers are for show. The actual governing happens over the third round.',
    dailyEffects: { trust: 0.2, chaos: 0.1 },
    eventTagBias: { economy: 1.3, culture: 1.3, crime: 1.2 },
  },
  {
    id: 'lucky-cats',
    title: 'The stray cats are conspicuously lucky',
    description:
      'Where they nap, good fortune follows. They nap on the treasury most days.',
    dailyEffects: { wealth: 0.2, safety: 0.1 },
    eventTagBias: { economy: 1.3, weird: 1.3 },
  },
  {
    id: 'echoing-old-town',
    title: 'The old town remembers everything',
    description:
      'Walls replay old conversations on quiet nights. Historians love it; gossips fear it.',
    dailyEffects: { culture: 0.3 },
    eventTagBias: { culture: 1.6, magic: 1.2 },
  },
  {
    id: 'industrious-rats',
    title: 'The rats run a small, efficient courier service',
    description:
      'Reliable, discreet, and they accept payment in cheese rinds and respect.',
    dailyEffects: { infrastructure: 0.2, pollution: 0.1 },
    eventTagBias: { goblin: 1.3, infrastructure: 1.3, crime: 1.2 },
  },
  {
    id: 'wishing-wells',
    title: 'The wishing wells occasionally deliver',
    description:
      'Roughly one wish in fifty comes true, which is just often enough to be a problem.',
    dailyEffects: { magic: 0.2, happiness: 0.1 },
    eventTagBias: { magic: 1.5, weird: 1.3 },
  },
  {
    id: 'gourmet-pigeons',
    title: 'The pigeons have refined palates',
    description:
      'They reject ordinary crumbs and have been spotted reviewing bakeries.',
    dailyEffects: { culture: 0.1, food: -0.1 },
    eventTagBias: { festival: 1.3, weird: 1.3, economy: 1.2 },
  },
  {
    id: 'self-cleaning-streets',
    title: 'The streets tidy themselves overnight',
    description:
      'Nobody knows how. Litterbugs report a creeping sense of being gently watched.',
    dailyEffects: { beauty: 0.2, pollution: -0.2 },
    eventTagBias: { infrastructure: 1.3, weird: 1.3 },
  },
  {
    id: 'restless-cobblestones',
    title: 'The cobblestones rearrange themselves',
    description:
      'Mostly into pleasing patterns. Occasionally into rude words aimed at the nobility.',
    dailyEffects: { chaos: 0.2, beauty: 0.1 },
    eventTagBias: { weird: 1.4, infrastructure: 1.3 },
  },
  {
    id: 'bureaucratic-bees',
    title: 'The bees file paperwork',
    description:
      'They have a stamp. The honey is excellent and comes with a notarized certificate.',
    dailyEffects: { food: 0.2, infrastructure: 0.1 },
    eventTagBias: { weird: 1.4, nature: 1.3, economy: 1.2 },
  },
  {
    id: 'arcane-streetlamps',
    title: 'The streetlamps light themselves and judge you',
    description:
      'They glow brighter for the virtuous and gutter resentfully for the late-night schemer.',
    dailyEffects: { safety: 0.2, magic: 0.1 },
    eventTagBias: { magic: 1.4, crime: 1.3 },
  },
  {
    id: 'migratory-monuments',
    title: 'The monuments wander a little',
    description:
      'Statues drift between plazas overnight, chasing the best light and the best gossip.',
    dailyEffects: { culture: 0.2, chaos: 0.1 },
    eventTagBias: { weird: 1.5, culture: 1.3 },
  },
  {
    id: 'punctual-tides',
    title: 'The tides keep strict office hours',
    description:
      'High water at nine sharp, low at five, weekends off. The harbor adores it.',
    dailyEffects: { food: 0.2, infrastructure: 0.1 },
    eventTagBias: { nature: 1.4, economy: 1.2 },
  },
  {
    id: 'contagious-laughter',
    title: 'Laughter is faintly contagious here',
    description:
      'One genuine giggle can clear a whole market square of bad moods in seconds.',
    dailyEffects: { happiness: 0.3, chaos: 0.1 },
    eventTagBias: { festival: 1.4, culture: 1.3 },
  },
];
