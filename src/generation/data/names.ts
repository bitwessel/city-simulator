import type {
  BoundedStatKey,
  BuildingKind,
  DistrictType,
  FactionArchetype,
} from '../../types';

// ----- City names -----------------------------------------------------------

export const CITY_PREFIXES = [
  'Ember', 'Thorn', 'Gold', 'Mist', 'Bramble', 'Copper', 'Wander', 'Glimmer',
  'Salt', 'Moss', 'Star', 'Pudding', 'Raven', 'Drift', 'Honey', 'Fable',
  'Cinder', 'Willow', 'Marrow', 'Tangle', 'Whisper', 'Snail', 'Lantern', 'Barrel',
];

export const CITY_SUFFIXES = [
  'vale', 'wick', 'holm', 'mere', 'gate', 'hollow', 'march', 'ford',
  'shore', 'spire', 'fell', 'burrow', 'haven', 'cross', 'bell', 'reach',
];

export const CITY_TAGLINES = [
  'Probably cursed, definitely charming',
  'Founded by accident, governed on purpose (mostly)',
  'Home of the award-winning sewers',
  'Where the pigeons outrank the clerks',
  'A nice place, considering everything',
  'Twinned with a city nobody can find on a map',
  'Voted "Most Improved" by its own council, twice',
  'The bread is good. Ask about nothing else',
  'Built on ruins, optimism, and load-bearing ivy',
  'Population: enthusiastic',
  'Three taverns per temple, as the founders intended',
  'Officially not haunted since last spring',
  'Where every alley leads somewhere interesting or damp',
  'Proud host of the Annual Shouting Festival',
  'The clocktower is always right twice a day',
  'Smells better than the rumors suggest',
];

// ----- Districts --------------------------------------------------------------

export interface DistrictArchetype {
  type: DistrictType;
  /** Display-name templates; {name} is a flavor word picked per city. */
  names: string[];
  baseColor: string;
  accentColor: string;
  buildingKinds: BuildingKind[];
  /** Stat tilts this district contributes to the city's starting stats. */
  statTilt: Partial<Record<BoundedStatKey, number>>;
  wealthRange: [number, number];
  citizenArchetypes: string[];
  /**
   * Whether this is an "urban" district that enters a skyscraper era once
   * highly developed. Urban districts plan tall buildings (apartments,
   * skyscrapers, grand halls, arcane spires) at high `appearAt`; non-urban
   * types (garden, forest-edge, ruins, festival, plain magical) stay low.
   * Optional: absent means non-urban.
   */
  urban?: boolean;
  /**
   * Tall building kinds this district may grow in its skyscraper era, listed
   * in roughly ascending height. Only consulted when `urban` is true (or for
   * arcane-spire in academy/magical). Empty/absent ⇒ no tall buildings.
   */
  tallKinds?: BuildingKind[];
}

export const DISTRICT_ARCHETYPES: DistrictArchetype[] = [
  {
    type: 'old-town',
    names: ['Old Town', 'The Cobbles', 'Founders’ Rest', 'The Crooked Quarter'],
    baseColor: '#b09a7a', accentColor: '#8a6f4d',
    buildingKinds: ['house', 'tavern', 'temple', 'fountain', 'statue'],
    statTilt: { culture: 4, beauty: 2, infrastructure: -2 },
    wealthRange: [35, 60],
    citizenArchetypes: ['longtime locals', 'retired adventurers', 'nosy historians'],
    urban: true,
    tallKinds: ['apartment', 'grand-hall', 'skyscraper'],
  },
  {
    type: 'market',
    names: ['Coin Row', 'The Bazaar', 'Penny Lanes', 'The Haggling Grounds'],
    baseColor: '#d4a24e', accentColor: '#a8762e',
    buildingKinds: ['market-stall', 'warehouse', 'tavern', 'house', 'fountain'],
    statTilt: { wealth: 5, chaos: 2 },
    wealthRange: [45, 75],
    citizenArchetypes: ['stall keepers', 'traveling traders', 'professional hagglers'],
    urban: true,
    tallKinds: ['apartment', 'grand-hall', 'skyscraper'],
  },
  {
    type: 'harbor',
    names: ['Saltside', 'The Docklands', 'Brinewatch', 'Gullhaven'],
    baseColor: '#5e8aa8', accentColor: '#3d6480',
    buildingKinds: ['dock', 'warehouse', 'tavern', 'house', 'mill'],
    statTilt: { wealth: 3, food: 4, pollution: 2 },
    wealthRange: [30, 55],
    citizenArchetypes: ['fisherfolk', 'dockhands', 'superstitious sailors'],
    urban: true,
    tallKinds: ['apartment', 'skyscraper'],
  },
  {
    type: 'forest-edge',
    names: ['Greenfringe', 'The Bramblemark', 'Rootward', 'The Mossgate'],
    baseColor: '#6b8f5a', accentColor: '#48663a',
    buildingKinds: ['house', 'mill', 'greenhouse', 'tent', 'statue'],
    statTilt: { beauty: 4, food: 3, infrastructure: -2 },
    wealthRange: [25, 45],
    citizenArchetypes: ['foragers', 'woodcutters', 'suspiciously calm druids'],
  },
  {
    type: 'academy',
    names: ['Scholar’s Rise', 'The Inkworks', 'Quillton', 'The Thinking Quarter'],
    baseColor: '#8a7fb5', accentColor: '#5f5590',
    buildingKinds: ['library', 'tower', 'house', 'temple', 'statue'],
    statTilt: { culture: 5, magic: 3, wealth: 2 },
    wealthRange: [40, 70],
    citizenArchetypes: ['students', 'absent-minded professors', 'competitive librarians'],
    urban: true,
    tallKinds: ['apartment', 'grand-hall', 'arcane-spire'],
  },
  {
    type: 'industrial',
    names: ['The Smokeworks', 'Gearside', 'Forgeham', 'The Clatteryards'],
    baseColor: '#9c7b66', accentColor: '#6e523f',
    buildingKinds: ['workshop', 'warehouse', 'mill', 'house', 'tower'],
    statTilt: { wealth: 4, infrastructure: 4, pollution: 6, beauty: -3 },
    wealthRange: [30, 55],
    citizenArchetypes: ['machinists', 'soot-covered apprentices', 'proud foremen'],
    urban: true,
    tallKinds: ['apartment', 'skyscraper'],
  },
  {
    type: 'noble-hill',
    names: ['Highcrest', 'The Velvet Hill', 'Peacock Heights', 'Manor Rise'],
    baseColor: '#c9b27c', accentColor: '#9a8350',
    buildingKinds: ['mansion', 'statue', 'fountain', 'temple', 'house'],
    statTilt: { wealth: 6, beauty: 3, trust: -2 },
    wealthRange: [65, 95],
    citizenArchetypes: ['minor nobles', 'ambitious socialites', 'extremely formal butlers'],
    urban: true,
    tallKinds: ['apartment', 'grand-hall', 'skyscraper'],
  },
  {
    type: 'workers',
    names: ['The Brickrows', 'Hardyside', 'The Honest Quarter', 'Calloway'],
    baseColor: '#a88f78', accentColor: '#7d6753',
    buildingKinds: ['house', 'workshop', 'tavern', 'market-stall', 'mill'],
    statTilt: { infrastructure: 3, housing: 4, culture: -1 },
    wealthRange: [20, 40],
    citizenArchetypes: ['builders', 'union regulars', 'tired but cheerful parents'],
    urban: true,
    tallKinds: ['apartment', 'skyscraper'],
  },
  {
    type: 'garden',
    names: ['The Blooming Ward', 'Petalfield', 'The Hanging Gardens', 'Verdant Row'],
    baseColor: '#7fae6a', accentColor: '#557f43',
    buildingKinds: ['greenhouse', 'house', 'fountain', 'statue', 'tent'],
    statTilt: { beauty: 6, happiness: 3, food: 2 },
    wealthRange: [35, 60],
    citizenArchetypes: ['gardeners', 'bee enthusiasts', 'flower-arranging rivals'],
  },
  {
    type: 'ruins',
    names: ['The Old Bones', 'Fallowmark', 'The Sunken Ward', 'Echo Fields'],
    baseColor: '#8d8678', accentColor: '#5f594d',
    buildingKinds: ['ruin', 'statue', 'tent', 'house', 'temple'],
    statTilt: { magic: 4, safety: -3, beauty: -2, culture: 2 },
    wealthRange: [5, 25],
    citizenArchetypes: ['treasure hunters', 'squatters with style', 'polite ghosts (allegedly)'],
  },
  {
    type: 'festival',
    names: ['The Revelry Grounds', 'Jubilee Way', 'The Confetti Quarter', 'Merriment Square'],
    baseColor: '#cf7fa0', accentColor: '#a34f72',
    buildingKinds: ['tent', 'tavern', 'market-stall', 'fountain', 'statue'],
    statTilt: { happiness: 5, culture: 4, chaos: 3, wealth: -1 },
    wealthRange: [25, 50],
    citizenArchetypes: ['street performers', 'festival planners', 'off-duty jesters'],
  },
  {
    type: 'magical',
    names: ['The Shimmer', 'Hexside', 'The Peculiar Quarter', 'Glyphgate'],
    baseColor: '#9b6fc2', accentColor: '#6c4396',
    buildingKinds: ['wizard-tower', 'library', 'house', 'fountain', 'statue'],
    statTilt: { magic: 8, chaos: 3, culture: 2, safety: -2 },
    wealthRange: [40, 70],
    citizenArchetypes: ['hedge wizards', 'enchanted-object owners', 'apprentice mages'],
    // Magical districts only grow upward as arcane spires — no profane
    // skyscrapers or apartment blocks among the floating staircases.
    urban: true,
    tallKinds: ['arcane-spire'],
  },
];

// ----- Factions -------------------------------------------------------------------

export interface FactionTemplate {
  archetype: FactionArchetype;
  names: string[];
  agendas: string[];
  flavors: string[];
  preferredStats: BoundedStatKey[];
  hatedStats: BoundedStatKey[];
  /** District types they like to call home. */
  homeDistricts: DistrictType[];
}

export const FACTION_TEMPLATES: FactionTemplate[] = [
  {
    archetype: 'merchants',
    names: ['The Gilded Ledger', 'The Coinwise Compact', 'The Honest-ish Traders'],
    agendas: ['Lower tariffs, higher foot traffic, and absolutely no questions about the third warehouse.'],
    flavors: ['They can smell a discount three districts away.'],
    preferredStats: ['wealth', 'infrastructure', 'safety'],
    hatedStats: ['chaos', 'pollution'],
    homeDistricts: ['market', 'harbor'],
  },
  {
    archetype: 'gardeners',
    names: ['The Green Thumb Circle', 'The Order of the Eternal Hedge', 'Root & Bloom Society'],
    agendas: ['More parks, fewer pavements, and a formal apology to the old oak on Mill Street.'],
    flavors: ['Their meetings are 10% agenda, 90% compost tips.'],
    preferredStats: ['beauty', 'food', 'happiness'],
    hatedStats: ['pollution', 'chaos'],
    homeDistricts: ['garden', 'forest-edge'],
  },
  {
    archetype: 'engineers',
    names: ['The Cogwright Guild', 'The Society of Sensible Bridges', 'The Brass Hat Collective'],
    agendas: ['Fix the aqueduct, reinforce the bridges, and ban decorative load-bearing columns.'],
    flavors: ['They rate taverns by structural integrity.'],
    preferredStats: ['infrastructure', 'wealth', 'safety'],
    hatedStats: ['chaos', 'magic'],
    homeDistricts: ['industrial', 'workers'],
  },
  {
    archetype: 'mages',
    names: ['The Luminous Conclave', 'The Slightly Secret Circle', 'The Order of the Raised Eyebrow'],
    agendas: ['More funding for magical research, fewer questions about the glowing sinkhole.'],
    flavors: ['Their newsletter occasionally predicts the future, badly.'],
    preferredStats: ['magic', 'culture'],
    hatedStats: ['safety'],
    homeDistricts: ['magical', 'academy'],
  },
  {
    archetype: 'workers',
    names: ['The Honest Hands Union', 'The Brick & Barrel Brotherhood', 'The Nine-Bell Union'],
    agendas: ['Fair wages, safe scaffolding, and one extra public holiday (they have suggestions).'],
    flavors: ['Their strikes are famously well-organized and weirdly festive.'],
    preferredStats: ['housing', 'food', 'trust'],
    hatedStats: ['wealth'],
    homeDistricts: ['workers', 'industrial'],
  },
  {
    archetype: 'nobles',
    names: ['The Peacock Court', 'The Old Names', 'The Velvet Assembly'],
    agendas: ['Preserve tradition, host more galas, and keep the riffraff charming but distant.'],
    flavors: ['They duel with insurance clauses now, mostly.'],
    preferredStats: ['wealth', 'beauty', 'culture'],
    hatedStats: ['chaos', 'trust'],
    homeDistricts: ['noble-hill', 'old-town'],
  },
  {
    archetype: 'goblin-union',
    names: ['The Goblin Union, Local 7', 'The Underfoot Collective', 'The Goblin Chamber of Commerce'],
    agendas: ['Goblin-sized infrastructure, fair tunnel rents, and softer benches. Much softer.'],
    flavors: ['Surprisingly good at paperwork. Terrifyingly good at potlucks.'],
    preferredStats: ['housing', 'happiness', 'chaos'],
    hatedStats: ['beauty'],
    homeDistricts: ['ruins', 'workers', 'market'],
  },
  {
    archetype: 'street-performers',
    names: ['The Gutter Stage Guild', 'The Everywhere Theatre', 'The Unlicensed Opera'],
    agendas: ['Busking rights on every corner and a statue of someone fun for once.'],
    flavors: ['Their union meetings end in standing ovations, always.'],
    preferredStats: ['culture', 'happiness', 'chaos'],
    hatedStats: ['safety'],
    homeDistricts: ['festival', 'market', 'old-town'],
  },
  {
    archetype: 'archivists',
    names: ['The Keepers of the Stacks', 'The Dust Covenant', 'The Marginalia Society'],
    agendas: ['Catalog everything, digitize nothing, and silence in the reading room, please.'],
    flavors: ['They know where every body is buried. It’s indexed.'],
    preferredStats: ['culture', 'safety', 'trust'],
    hatedStats: ['chaos', 'magic'],
    homeDistricts: ['academy', 'old-town'],
  },
  {
    archetype: 'fishermen',
    names: ['The Tideline Fellowship', 'The Brine Brotherhood', 'The Lucky Hook Lodge'],
    agendas: ['Cleaner waters, better docks, and an official ruling on what that thing in the bay is.'],
    flavors: ['They have nineteen words for fog and use all of them daily.'],
    preferredStats: ['food', 'safety'],
    hatedStats: ['pollution', 'magic'],
    homeDistricts: ['harbor'],
  },
  {
    archetype: 'inventors',
    names: ['The Tinkers’ Parliament', 'The Combustion Club', 'The Patent-Pending Society'],
    agendas: ['Looser testing regulations and a dedicated explosion district (small one).'],
    flavors: ['Their demonstrations are mandatory-evacuation popular.'],
    preferredStats: ['infrastructure', 'wealth', 'chaos'],
    hatedStats: ['trust'],
    homeDistricts: ['industrial', 'academy'],
  },
  {
    archetype: 'night-watch',
    names: ['The Lantern Watch', 'The Quiet Boots', 'The Order of the Third Shift'],
    agendas: ['More lanterns, fewer mysterious fogs, and hazard pay for anything with tentacles.'],
    flavors: ['They drink their tea cold and their rumors fresh.'],
    preferredStats: ['safety', 'trust', 'infrastructure'],
    hatedStats: ['chaos', 'magic'],
    homeDistricts: ['old-town', 'workers', 'harbor'],
  },
];

/** Archetype pairs with natural friction; relationship starts negative. */
export const FACTION_RIVALRIES: [FactionArchetype, FactionArchetype][] = [
  ['workers', 'nobles'],
  ['mages', 'engineers'],
  ['mages', 'night-watch'],
  ['goblin-union', 'nobles'],
  ['inventors', 'archivists'],
  ['fishermen', 'mages'],
  ['street-performers', 'night-watch'],
  ['merchants', 'goblin-union'],
];

/** Archetype pairs that get along; relationship starts positive. */
export const FACTION_FRIENDSHIPS: [FactionArchetype, FactionArchetype][] = [
  ['gardeners', 'fishermen'],
  ['workers', 'goblin-union'],
  ['mages', 'archivists'],
  ['merchants', 'inventors'],
  ['street-performers', 'goblin-union'],
  ['engineers', 'workers'],
];

// ----- Resources ----------------------------------------------------------------

export const RESOURCE_POOL: { name: string; range: [number, number]; trend: [number, number] }[] = [
  { name: 'Grain', range: [120, 300], trend: [-2, 4] },
  { name: 'Timber', range: [80, 220], trend: [-3, 3] },
  { name: 'Fish', range: [60, 260], trend: [-4, 4] },
  { name: 'Mana crystals', range: [10, 60], trend: [-1, 2] },
  { name: 'Honey', range: [30, 90], trend: [-1, 3] },
  { name: 'Cobblestones', range: [100, 400], trend: [-2, 2] },
  { name: 'Rumors', range: [200, 600], trend: [1, 8] },
  { name: 'Decorative gourds', range: [5, 50], trend: [-1, 1] },
];

// ----- Briefing fragments ----------------------------------------------------------

export const BRIEFING_OPENERS = [
  'Congratulations on your election, Mayor. The previous mayor left in a hurry and took most of the good pens.',
  'Welcome to office, Mayor. Your desk has three drawers: paperwork, emergencies, and snacks. Choose wisely.',
  'The council extends its warmest welcome and its longest list of unresolved complaints.',
  'You won by a landslide, which the engineers assure us was a metaphor this time.',
];

export const BRIEFING_PROBLEMS = [
  'The treasury is technically a treasury, in the sense that it is a room.',
  'Several districts are feuding over a fountain that may or may not grant wishes.',
  'The road budget was spent on a single, magnificent road. It is very nice. It goes nowhere.',
  'Someone has been re-labeling the sewer maps as "dungeon content" and selling tours.',
  'The city’s official bird is overdue for renegotiation and the pigeons know it.',
];
