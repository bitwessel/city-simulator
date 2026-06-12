import type { WonderDef } from '../../types';

// ---------------------------------------------------------------------------
// The wonder catalog (phase 04) — pure data, validated by tests/ages.test.ts.
// Exactly one WonderDef per kind in WONDER_BUILDING_KINDS. The wonder-council
// event offers these when the city enters the Wonder Age; one is raised per
// run, in visible stages, and completing it is a triumphant ending.
//
// Each wonder aligns with a playstyle: gardens & beauty, learning & magic,
// industry & craft, joy & festival. Voice: warm, slightly funny, fantasy.
// ---------------------------------------------------------------------------

export const WONDER_POOL: WonderDef[] = [
  {
    id: 'great-garden',
    name: 'The Great Garden',
    flavor:
      'A mountain of terraces stacked toward the sky, green from root to crown, with one tree at the top old enough to remember why. Birds emigrate here. On purpose.',
    building: 'wonder-garden',
    districtTypes: ['garden', 'forest-edge', 'noble-hill'],
    stages: [
      {
        name: 'the terraces',
        days: 12,
        headline:
          'The Great Garden rises: the first terraces are cut, and the topsoil arrives by the heroic cartload.',
      },
      {
        name: 'the plantings',
        days: 12,
        headline:
          'The Great Garden takes root: ten thousand saplings go in, and the gardeners have stopped sleeping out of joy.',
      },
      {
        name: 'the crowning tree',
        days: 10,
        headline:
          'The Great Garden nears its crown: the eldest tree is hoisted to the summit with ropes, prayers, and one very calm ox.',
      },
    ],
    completionEffects: { beauty: 8, happiness: 6, pollution: -6 },
    dailyEffects: { beauty: 0.15, pollution: -0.1 },
  },
  {
    id: 'grand-academy',
    name: 'The Grand Academy',
    flavor:
      'A dome you can see from three districts away, libraries that go down as far as the towers go up, and an entrance exam that is mostly a riddle about geese.',
    building: 'wonder-academy',
    districtTypes: ['academy', 'magical', 'old-town'],
    stages: [
      {
        name: 'the foundations',
        days: 12,
        headline:
          'The Grand Academy begins: the foundations are dug deep enough that the archivists have already shelved three things down there.',
      },
      {
        name: 'the great dome',
        days: 12,
        headline:
          'The Grand Academy ascends: the great dome closes over the reading hall, and the echo is declared "academically significant".',
      },
      {
        name: 'the spires',
        days: 10,
        headline:
          'The Grand Academy nears completion: the four spires are capped, each by a scholar who insisted on doing it personally.',
      },
    ],
    completionEffects: { culture: 8, magic: 6, trust: 4 },
    dailyEffects: { culture: 0.15, magic: 0.08 },
  },
  {
    id: 'everforge',
    name: 'The Everforge',
    flavor:
      'A forge whose fire, once lit, never goes out — tended in shifts, sung to on holidays, and capable of mending anything from a horseshoe to a friendship.',
    building: 'wonder-forge',
    districtTypes: ['industrial', 'workers', 'old-town'],
    stages: [
      {
        name: 'the great hearth',
        days: 12,
        headline:
          'The Everforge begins: the great hearth is laid, stone by stone, each one tested by the most suspicious mason in {city}.',
      },
      {
        name: 'the machinery',
        days: 12,
        headline:
          'The Everforge takes shape: the great wheels and bellows go in, and the engineers have started referring to it as "she".',
      },
      {
        name: 'the first lighting',
        days: 10,
        headline:
          'The Everforge nears its moment: kindling is stacked for the first lighting, and arguments over who strikes the spark turn ceremonial.',
      },
    ],
    completionEffects: { infrastructure: 8, wealth: 6, safety: 4 },
    dailyEffects: { infrastructure: 0.15, wealth: 0.08 },
  },
  {
    id: 'festival-eternal',
    name: 'The Festival Eternal',
    flavor:
      'A festival ground built so the celebration never has to end: a great wheel, a thousand lanterns, and a stage that has never once been empty. The city dances in shifts.',
    building: 'wonder-festival',
    districtTypes: ['festival', 'market', 'harbor'],
    stages: [
      {
        name: 'the grounds',
        days: 12,
        headline:
          'The Festival Eternal begins: the grounds are leveled and lantern posts raised, each one blessed by a different grandmother.',
      },
      {
        name: 'the great wheel',
        days: 12,
        headline:
          'The Festival Eternal turns: the great wheel is assembled, tested, and immediately occupied by the street performers.',
      },
      {
        name: 'the thousand lanterns',
        days: 10,
        headline:
          'The Festival Eternal glows: the thousand lanterns are hung, and {city} runs out of the word "ooh".',
      },
    ],
    completionEffects: { happiness: 8, culture: 6, beauty: 4 },
    dailyEffects: { happiness: 0.15, culture: 0.08 },
  },
];
