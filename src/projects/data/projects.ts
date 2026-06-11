import type { ProjectDef } from '../../types';

// ---------------------------------------------------------------------------
// The mayor-project catalog — pure data, validated by tests/projects.test.ts
// the way the event pool is. Exactly one ProjectDef per landmark kind in
// LANDMARK_BUILDING_KINDS (12 of them). Commission one through the projects
// system and it physically appears in the world: scaffolding first, then a
// permanent landmark that nudges stats and pleases factions.
//
// Voice: warm, slightly funny, fantasy — match src/events/data/events.ts.
//
// Coverage rule (enforced by tests): every DistrictType has >=2 eligible
// projects. `fountain-plaza` is the cheap `'any'` crowd-pleaser that covers
// every district on its own; the rest spread across types so each one has at
// least one *other* option too.
//
// Budgeting (favor): START_FAVOR 10, FAVOR_CAP 24, regen ~0.5-0.9/day (see
// src/projects/projects.ts). Costs 8-16 are sized so a project lands roughly
// every 10-20 days.
// ---------------------------------------------------------------------------

export const PROJECT_POOL: ProjectDef[] = [
  {
    id: 'whispering-grove',
    name: 'The Whispering Grove',
    flavor:
      'A stand of old, patient trees planted where the city can hear them. They filter the air, shade the benches, and — gardeners insist — gossip politely after dark.',
    cost: 10,
    buildDays: 6,
    districtTypes: ['forest-edge', 'garden', 'ruins', 'industrial'],
    building: 'grove',
    completionEffects: { beauty: 5, pollution: -4, happiness: 3 },
    dailyEffects: { pollution: -0.12, beauty: 0.06 },
    factionEffects: { gardeners: 12 },
    districtEffects: { mood: 5 },
  },
  {
    id: 'fountain-plaza',
    name: 'The Fountain Plaza',
    flavor:
      'A broad open square around a fountain that does three respectable jets and, on holidays, one show-off. Everyone agrees a city is not a city until it has somewhere pointless and lovely to loiter.',
    cost: 8,
    buildDays: 4,
    districtTypes: 'any',
    building: 'fountain-plaza',
    completionEffects: { happiness: 4, beauty: 3, culture: 2 },
    dailyEffects: { happiness: 0.06 },
    factionEffects: { 'street-performers': 8 },
    districtEffects: { mood: 6 },
  },
  {
    id: 'harbor-lighthouse',
    name: 'The Steadfast Lighthouse',
    flavor:
      'A tall white tower with a lamp that never sulks. Ships find their way home, the fisherfolk sleep easier, and one retired sea captain has already applied to live in the top.',
    cost: 14,
    buildDays: 9,
    districtTypes: ['harbor'],
    building: 'lighthouse',
    completionEffects: { safety: 5, wealth: 4, trust: 3 },
    dailyEffects: { safety: 0.08, wealth: 0.05 },
    factionEffects: { fishermen: 12, merchants: 6 },
    districtEffects: { wealth: 5 },
  },
  {
    id: 'starlit-observatory',
    name: 'The Starlit Observatory',
    flavor:
      'A domed hall with a brass telescope longer than a cart and a roof that opens with a satisfying clunk. The scholars chart the heavens; the rest of the city mostly comes to argue about the moon.',
    cost: 15,
    buildDays: 11,
    districtTypes: ['academy', 'noble-hill', 'magical'],
    building: 'observatory',
    completionEffects: { culture: 5, magic: 4, trust: 2 },
    dailyEffects: { culture: 0.1, magic: 0.05 },
    factionEffects: { archivists: 12, mages: 6 },
    districtEffects: { mood: 4 },
  },
  {
    id: 'public-bathhouse',
    name: 'The Public Bathhouse',
    flavor:
      'Steam, warm tile, and the firm civic conviction that everyone deserves a good soak. Disputes are settled here more often than at city hall, and far more pleasantly.',
    cost: 11,
    buildDays: 7,
    districtTypes: ['old-town', 'noble-hill', 'workers', 'industrial'],
    building: 'bathhouse',
    completionEffects: { happiness: 5, safety: 2, culture: 2 },
    dailyEffects: { happiness: 0.08 },
    factionEffects: { workers: 10, nobles: 4 },
    districtEffects: { mood: 6 },
  },
  {
    id: 'grand-amphitheater',
    name: 'The Grand Amphitheater',
    flavor:
      'A great curved bowl of seats around a stage with acoustics so good a whisper reaches the back row. The street performers wept when the plans were unveiled. They are still weeping, but now professionally.',
    cost: 15,
    buildDays: 10,
    districtTypes: ['festival', 'market', 'old-town'],
    building: 'amphitheater',
    completionEffects: { culture: 6, happiness: 4, beauty: 2 },
    dailyEffects: { culture: 0.12 },
    factionEffects: { 'street-performers': 14, merchants: 4 },
    districtEffects: { mood: 5, wealth: 3 },
  },
  {
    id: 'curious-menagerie',
    name: 'The Curious Menagerie',
    flavor:
      'A garden of enclosures for creatures that are mostly friendly and entirely interesting. The two-headed tortoise is the star; the philosophical goat has its own following and refuses interviews.',
    cost: 13,
    buildDays: 9,
    districtTypes: ['garden', 'festival', 'noble-hill'],
    building: 'menagerie',
    completionEffects: { happiness: 5, culture: 3, beauty: 2 },
    dailyEffects: { happiness: 0.08, culture: 0.05 },
    factionEffects: { gardeners: 8, 'street-performers': 6 },
    districtEffects: { mood: 6 },
  },
  {
    id: 'bell-tower',
    name: 'The Bell Tower',
    flavor:
      'A handsome tower of seven bells that ring the hours, the festivals, and — once, memorably and never explained — a wedding nobody had planned. The city sets its day by it and its mood, too.',
    cost: 12,
    buildDays: 8,
    districtTypes: ['old-town', 'market', 'academy'],
    building: 'bell-tower',
    completionEffects: { culture: 4, trust: 4, happiness: 2 },
    dailyEffects: { trust: 0.06, culture: 0.05 },
    factionEffects: { archivists: 8, nobles: 4 },
    districtEffects: { mood: 4 },
  },
  {
    id: 'hedge-maze',
    name: 'The Hedge Maze',
    flavor:
      'An elegant labyrinth of clipped green walls with a bench at the centre and a small, smug fountain. Children solve it in minutes; aldermen have been known to take the scenic route for an afternoon.',
    cost: 10,
    buildDays: 6,
    districtTypes: ['garden', 'noble-hill', 'forest-edge'],
    building: 'hedge-maze',
    completionEffects: { beauty: 5, happiness: 3, culture: 2 },
    dailyEffects: { beauty: 0.08 },
    factionEffects: { gardeners: 10, nobles: 4 },
    districtEffects: { mood: 5 },
  },
  {
    id: 'hot-springs',
    name: 'The Hot Springs',
    flavor:
      'Naturally warm pools coaxed up from somewhere obliging underground, ringed with smooth stones and steam. The water is faintly mineral, faintly magical, and entirely the best place in town on a cold morning.',
    cost: 13,
    buildDays: 8,
    districtTypes: ['ruins', 'magical', 'forest-edge'],
    building: 'hot-springs',
    completionEffects: { happiness: 5, magic: 3, beauty: 2 },
    dailyEffects: { happiness: 0.1, magic: 0.05 },
    factionEffects: { mages: 6, gardeners: 6 },
    districtEffects: { mood: 7 },
  },
  {
    id: 'grand-aviary',
    name: 'The Grand Aviary',
    flavor:
      'A great domed cage of light and birdsong, home to songbirds, a council of opinionated parrots, and one heron who considers himself management. The dawn chorus is now a civic event.',
    cost: 12,
    buildDays: 7,
    districtTypes: ['garden', 'academy', 'harbor'],
    building: 'aviary',
    completionEffects: { beauty: 4, happiness: 4, culture: 2 },
    dailyEffects: { beauty: 0.06, happiness: 0.05 },
    factionEffects: { gardeners: 8, archivists: 6 },
    districtEffects: { mood: 5 },
  },
  {
    id: 'great-moondial',
    name: 'The Great Moondial',
    flavor:
      'A sundial for the night, etched with silver and read by moonlight. It is gorgeously useless on cloudy weeks and uncannily accurate the rest, and the mages have stopped pretending they understand it.',
    cost: 14,
    buildDays: 10,
    districtTypes: ['magical', 'ruins', 'academy'],
    building: 'moondial',
    completionEffects: { magic: 5, culture: 4, beauty: 2 },
    dailyEffects: { magic: 0.1, culture: 0.05 },
    factionEffects: { mages: 12, archivists: 6 },
    districtEffects: { mood: 4 },
  },
];
