import type { GameEventDef } from '../../types';

// The full event pool. Random events are selected from here by weight,
// filtered by conditions; chain events (chainOnly) fire only when queued
// by a previous choice or chance outcome.
//
// Chains in this pool:
//   goblin-benches -> goblin-park-opening
//   dragon-awakens -> dragon-negotiation -> dragon-resident
//   comet-prophecy -> comet-arrival
//   clocktower-haunting -> clocktower-resolution
//   sewer-election -> sewer-inauguration
//
// Every queueEventId / unlocksEventId below references an id defined in this file.

export const EVENT_POOL: GameEventDef[] = [
  // -------------------------------------------------------------------------
  // CHAIN 1 — The Goblin Union (starter events; polished)
  // -------------------------------------------------------------------------
  {
    id: 'goblin-benches',
    title: 'The Goblin Union Demands Softer Benches',
    description:
      '{faction} claims the city’s public benches are anti-goblin architecture. Their protest has blocked three market streets and one very confused fountain.',
    tags: ['goblin', 'faction', 'infrastructure'],
    weight: 12,
    involvedFaction: 'goblin-union',
    choices: [
      {
        id: 'fund-benches',
        label: 'Fund goblin-friendly benches',
        description: 'Plush, low, and surprisingly tasteful.',
        effects: { wealth: -6, happiness: 5, trust: 4, chaos: -3 },
        factionEffects: { 'goblin-union': 15 },
        resultText:
          'The new benches are a hit. Several non-goblins have been caught napping on them.',
      },
      {
        id: 'ignore',
        label: 'Ignore them',
        description: 'Benches are benches. Probably.',
        effects: { chaos: 6, trust: -5 },
        factionEffects: { 'goblin-union': -15 },
        outcomes: [
          {
            chance: 0.4,
            description:
              'The Goblin Union has gone on strike. The sewers are eerily tidy and deeply passive-aggressive.',
            effects: { infrastructure: -5, chaos: 4 },
          },
        ],
        resultText: 'The protest disbands, muttering. The benches remain firm in every sense.',
      },
      {
        id: 'standing-tables',
        label: 'Replace all benches with standing tables',
        description: 'A bold compromise that satisfies no one.',
        effects: { wealth: 2, happiness: -4, culture: 3 },
        factionEffects: { 'goblin-union': -5 },
        resultText:
          'The standing tables are declared "a statement". Nobody is sure of what.',
      },
      {
        id: 'goblin-park',
        label: 'Invite them to design a public park',
        description: 'What could possibly go wrong below ground level?',
        effects: { wealth: -8, beauty: 6, culture: 5 },
        factionEffects: { 'goblin-union': 12 },
        outcomes: [
          {
            chance: 0.5,
            description:
              'Goblin landscaping plans have been approved. The blueprints are mostly tunnels.',
            queueEventId: 'goblin-park-opening',
            delayDays: [3, 5],
          },
        ],
        resultText: 'The Goblin Union accepts, producing blueprints with suspicious enthusiasm.',
      },
    ],
  },
  {
    id: 'goblin-park-opening',
    title: 'The Goblin Garden Opens',
    description:
      'The goblin-designed park is finished. It is beautiful, half-subterranean, and the mushrooms glow after dark. Attendance is enormous.',
    tags: ['goblin', 'culture'],
    weight: 0,
    chainOnly: true,
    once: true,
    involvedFaction: 'goblin-union',
    choices: [
      {
        id: 'embrace',
        label: 'Declare it a city landmark',
        effects: { beauty: 6, culture: 6, happiness: 4, magic: 2 },
        factionEffects: { 'goblin-union': 10 },
        resultText:
          'The Goblin Garden becomes the city’s pride. The glowing mushrooms are now on postcards.',
      },
      {
        id: 'regulate',
        label: 'Add safety railings everywhere',
        effects: { safety: 4, beauty: -2, wealth: -3 },
        factionEffects: { 'goblin-union': -5 },
        resultText:
          'The railings are sturdy and deeply unpopular with the under-three-foot demographic.',
      },
    ],
  },

  // -------------------------------------------------------------------------
  // CHAIN 2 — The Sleepy Dragon (3 events, minDay 12, once)
  // -------------------------------------------------------------------------
  {
    id: 'dragon-awakens',
    title: 'The Dragon Under the Hill Has Rolled Over',
    description:
      'The dragon everyone assured you was a geological feature has rolled over in its sleep. Half the cobblestones in {city} are now subtly diagonal, and the bells rang themselves.',
    tags: ['magic', 'disaster', 'weird'],
    weight: 9,
    minDay: 12,
    once: true,
    choices: [
      {
        id: 'send-envoy',
        label: 'Send a polite envoy down the chimney that just opened',
        description: 'Bring a gift. Dragons remember rudeness for centuries.',
        effects: { magic: 4, trust: 3 },
        outcomes: [
          {
            chance: 0.5,
            description: 'The dragon would like to discuss the noise complaints. It has a list.',
            queueEventId: 'dragon-negotiation',
            delayDays: [2, 4],
          },
        ],
        resultText: 'The envoy descends with a wheel of cheese and admirable composure.',
      },
      {
        id: 'reinforce',
        label: 'Quietly reinforce every building over the hill',
        description: 'Say nothing. Hope it goes back to sleep.',
        effects: { wealth: -7, infrastructure: 6, safety: 3 },
        factionEffects: { engineers: 8 },
        resultText: 'The engineers shore up the hill and agree never to speak of the snoring.',
      },
      {
        id: 'wake-it',
        label: 'Wake it fully and ask what it wants',
        description: 'Bold. Possibly the last bold thing you ever do.',
        effects: { chaos: 7, magic: 6, beauty: 3 },
        outcomes: [
          {
            chance: 0.45,
            description:
              'The dragon is awake, articulate, and surprisingly reasonable about real estate.',
            queueEventId: 'dragon-negotiation',
            delayDays: [2, 3],
          },
        ],
        resultText: 'The dragon opens one enormous eye. The whole city holds its breath.',
      },
    ],
  },
  {
    id: 'dragon-negotiation',
    title: 'The Dragon Tables Its Demands',
    description:
      'The dragon has woken properly and turns out to be a stickler for paperwork. It wants tenancy rights to the hill, in writing, with a clause about being read bedtime stories.',
    tags: ['magic', 'weird', 'faction'],
    weight: 0,
    chainOnly: true,
    once: true,
    choices: [
      {
        id: 'grant-lease',
        label: 'Grant it a formal 900-year lease',
        description: 'A long-term tenant who deters monsters and never throws parties.',
        effects: { magic: 5, safety: 6, beauty: 4, wealth: -4 },
        outcomes: [
          {
            chance: 0.6,
            description: 'The dragon signs with a claw and immediately requests a library card.',
            queueEventId: 'dragon-resident',
            delayDays: [3, 5],
          },
        ],
        resultText: 'The lease is signed. The dragon insists on a housewarming, which is just a fire.',
      },
      {
        id: 'haggle',
        label: 'Haggle hard on the rent',
        description: 'It is a dragon. It respects a shrewd negotiator. Probably.',
        effects: { wealth: 6, chaos: 4, trust: -3 },
        factionEffects: { merchants: 8, nobles: -4 },
        resultText: 'You squeeze a fair rent out of it. It calls you "refreshingly avaricious".',
      },
      {
        id: 'evict',
        label: 'Politely request it relocate',
        description: 'There are other hills. Surely.',
        effects: { magic: -5, chaos: 8, safety: -5 },
        outcomes: [
          {
            chance: 0.4,
            description:
              'The dragon leaves in a huff, taking the hill’s good luck and most of the warm weather.',
            effects: { beauty: -5, happiness: -4 },
          },
        ],
        resultText: 'The dragon departs with wounded dignity and a forwarding address.',
      },
    ],
  },
  {
    id: 'dragon-resident',
    title: 'The Dragon Settles In',
    description:
      'The dragon is now a registered resident of {city}. It pays its rent in gemstones, complains about the post, and has opinions about the school curriculum.',
    tags: ['magic', 'culture', 'weird'],
    weight: 0,
    chainOnly: true,
    once: true,
    choices: [
      {
        id: 'tourism',
        label: 'Open the hill to (very supervised) tourism',
        effects: { wealth: 8, culture: 5, beauty: 3, safety: -2 },
        factionEffects: { merchants: 10, 'street-performers': 6 },
        resultText: 'The dragon poses for sketches and charges by the scale. Tourism booms.',
      },
      {
        id: 'guardian',
        label: 'Appoint it Honorary Guardian of the City',
        effects: { safety: 8, magic: 4, happiness: 4, chaos: -4 },
        factionEffects: { 'night-watch': 10, nobles: 5 },
        resultText: 'Crime drops to nearly nothing. Nobody wants to be the cautionary tale.',
      },
    ],
  },

  // -------------------------------------------------------------------------
  // CHAIN 3 — The Comet Prophecy (2 events, mages, minDay 10)
  // -------------------------------------------------------------------------
  {
    id: 'comet-prophecy',
    title: 'The Mages Have Read the Sky and It Read Back',
    description:
      '{faction} report that a comet is due over {city} in a few days. Half of them say it brings a golden age. The other half are quietly packing.',
    tags: ['magic', 'culture', 'weird'],
    weight: 10,
    involvedFaction: 'mages',
    minDay: 10,
    choices: [
      {
        id: 'festival',
        label: 'Throw a comet-watching festival',
        description: 'If the world ends, at least there will be snacks.',
        effects: { wealth: -5, happiness: 6, culture: 5 },
        factionEffects: { mages: 8, 'street-performers': 8 },
        outcomes: [
          {
            chance: 0.5,
            description: 'The comet is dazzling and the city stays up all night, enchanted.',
            queueEventId: 'comet-arrival',
            delayDays: [3, 5],
          },
        ],
        resultText: 'Banners go up, telescopes go out, and the bakeries declare a comet-bun shortage.',
      },
      {
        id: 'ward',
        label: 'Commission protective wards "just in case"',
        description: 'Expensive, embarrassing if nothing happens, lifesaving if something does.',
        effects: { wealth: -8, magic: 5, safety: 4 },
        factionEffects: { mages: 10 },
        outcomes: [
          {
            chance: 0.5,
            description: 'The wards hum on the appointed night and something large bounces off them.',
            queueEventId: 'comet-arrival',
            delayDays: [3, 5],
          },
        ],
        resultText: 'The mages chalk the rooftops with sigils and pronounce themselves "fairly sure".',
      },
      {
        id: 'debunk',
        label: 'Declare it superstition and move on',
        description: 'Comets are just space gravel. Everyone knows that.',
        effects: { trust: -3, culture: -3, chaos: 3 },
        factionEffects: { mages: -10, archivists: -4 },
        outcomes: [
          {
            chance: 0.5,
            description:
              'The comet arrives anyway, ignoring your official position on the matter.',
            queueEventId: 'comet-arrival',
            delayDays: [3, 5],
          },
        ],
        resultText: 'You issue a calming proclamation. The mages frame it for later.',
      },
    ],
  },
  {
    id: 'comet-arrival',
    title: 'The Comet Arrives',
    description:
      'The comet sweeps low over {city}, trailing light the color of old coins. It sheds a fine glittering dust over every rooftop, and the dust is, alarmingly, slightly warm.',
    tags: ['magic', 'weird', 'disaster'],
    weight: 0,
    chainOnly: true,
    once: true,
    choices: [
      {
        id: 'collect-dust',
        label: 'Have the mages collect and study the comet-dust',
        effects: { magic: 7, wealth: 5, culture: 4 },
        factionEffects: { mages: 10, inventors: 6 },
        outcomes: [
          {
            chance: 0.35,
            description:
              'A handful of pigeons that rolled in the dust now glow gently and refuse to land.',
            effects: { magic: 3, chaos: 3 },
          },
        ],
        resultText: 'The comet-dust proves valuable, volatile, and excellent for fireworks.',
      },
      {
        id: 'sweep-away',
        label: 'Sweep it all into the river before anything weird happens',
        effects: { magic: -4, pollution: 4, safety: 3 },
        factionEffects: { mages: -6, gardeners: -4 },
        outcomes: [
          {
            chance: 0.4,
            description: 'The river now sparkles ominously and the fish have learned to argue.',
            effects: { magic: 3, chaos: 2 },
          },
        ],
        resultText: 'The streets are swept clean. The river takes it personally.',
      },
    ],
  },

  // -------------------------------------------------------------------------
  // CHAIN 4 — The Haunted Clocktower (2 events)
  // -------------------------------------------------------------------------
  {
    id: 'clocktower-haunting',
    title: 'The Clocktower Has Started Striking Thirteen',
    description:
      'The great clock of {city} has begun striking thirteen at noon. Citizens who hear it report a sudden, urgent need to apologize to their mothers. The clockkeeper has barricaded the stairs.',
    tags: ['weird', 'magic', 'culture'],
    weight: 9,
    choices: [
      {
        id: 'investigate',
        label: 'Send the archivists to investigate',
        description: 'Someone who can read very old, very smug inscriptions.',
        effects: { culture: 4, magic: 3, wealth: -3 },
        factionEffects: { archivists: 8 },
        outcomes: [
          {
            chance: 0.55,
            description: 'The archivists found a bricked-up room behind the clock face. It has a door now.',
            queueEventId: 'clocktower-resolution',
            delayDays: [2, 4],
          },
        ],
        resultText: 'The archivists ascend, notebooks ready, and do not come down for supper.',
      },
      {
        id: 'silence-it',
        label: 'Order the clock silenced and the tower sealed',
        description: 'No clock, no thirteen. Airtight logic.',
        effects: { chaos: 4, culture: -4, trust: -3 },
        factionEffects: { archivists: -6 },
        resultText: 'The clock falls silent. The city now runs forty minutes late, collectively.',
      },
      {
        id: 'embrace-it',
        label: 'Declare the thirteenth hour an official civic moment',
        description: 'A minute each day for apologizing to one’s mother. It’s nice, actually.',
        effects: { culture: 6, happiness: 4, magic: 2 },
        factionEffects: { 'street-performers': 5 },
        outcomes: [
          {
            chance: 0.4,
            description:
              'Postal volume to mothers has tripled. The carriers want a raise and they have a point.',
            queueEventId: 'clocktower-resolution',
            delayDays: [3, 5],
          },
        ],
        resultText: 'The thirteenth hour becomes a beloved, faintly tearful daily tradition.',
      },
    ],
  },
  {
    id: 'clocktower-resolution',
    title: 'Inside the Thirteenth Hour',
    description:
      'Behind the clock face lies a small room and a very old, very patient ghost who simply wants someone to take over its shift. It has been keeping time for four hundred years and is, frankly, exhausted.',
    tags: ['weird', 'magic', 'culture'],
    weight: 0,
    chainOnly: true,
    once: true,
    choices: [
      {
        id: 'pension',
        label: 'Grant the ghost an honorable pension and a successor',
        effects: { culture: 6, happiness: 5, magic: 3, wealth: -4 },
        factionEffects: { archivists: 8 },
        resultText: 'The ghost retires to the river to watch sunsets. The clock keeps perfect time again.',
      },
      {
        id: 'apprentice',
        label: 'Apprentice a young clockkeeper to learn its secrets',
        effects: { culture: 5, magic: 5, infrastructure: 3 },
        factionEffects: { archivists: 6, engineers: 5 },
        resultText: 'The apprentice learns to keep both the hours and the thirteenth one. The city sleeps easier.',
      },
    ],
  },

  // -------------------------------------------------------------------------
  // CHAIN 5 — The Sewer Election (2 events, quirk-biased)
  // -------------------------------------------------------------------------
  {
    id: 'sewer-election',
    title: 'The Sewers Are Holding an Election',
    description:
      'A coalition of goblins, civic-minded rats, and one extremely committed catfish have organized a democratic election to govern the under-city. They have invited you to ratify the results. There are pamphlets.',
    tags: ['goblin', 'weird', 'infrastructure', 'crime'],
    weight: 8,
    choices: [
      {
        id: 'recognize',
        label: 'Officially recognize the Sewer Council',
        description: 'A second tier of government, slightly damper than the first.',
        effects: { trust: 5, infrastructure: 5, chaos: -3 },
        factionEffects: { 'goblin-union': 12 },
        outcomes: [
          {
            chance: 0.5,
            description: 'The Sewer Council has scheduled an inauguration. RSVP requested. Boots advised.',
            queueEventId: 'sewer-inauguration',
            delayDays: [3, 5],
          },
        ],
        resultText: 'The Sewer Council is sworn in. The drains have never run so smoothly or so smugly.',
      },
      {
        id: 'co-opt',
        label: 'Co-opt the winner as a city official',
        description: 'Bring the catfish into the cabinet. It has good ideas about flooding.',
        effects: { infrastructure: 6, wealth: -3, culture: 3 },
        factionEffects: { 'goblin-union': 6, engineers: 5 },
        resultText: 'The catfish accepts a junior ministry and a very large fishbowl with a view.',
      },
      {
        id: 'dissolve',
        label: 'Declare the election invalid',
        description: 'One government per city. House rules.',
        effects: { chaos: 6, trust: -4, infrastructure: -3 },
        factionEffects: { 'goblin-union': -12 },
        outcomes: [
          {
            chance: 0.4,
            description: 'The under-city stages a strike. Strange smells rise in protest.',
            effects: { pollution: 4, happiness: -3 },
          },
        ],
        resultText: 'You veto the under-city. It begins drafting a strongly worded constitution.',
      },
    ],
  },
  {
    id: 'sewer-inauguration',
    title: 'The Sewer Council Inauguration',
    description:
      'The newly elected Sewer Council requests your presence at their inauguration, held in the grand confluence chamber. There is bunting made of recovered shopping lists. It is, against all odds, rather moving.',
    tags: ['goblin', 'weird', 'culture', 'infrastructure'],
    weight: 0,
    chainOnly: true,
    once: true,
    choices: [
      {
        id: 'attend',
        label: 'Attend in person and give a warm speech',
        effects: { trust: 6, happiness: 5, infrastructure: 4, culture: 3 },
        factionEffects: { 'goblin-union': 12 },
        resultText: 'Your speech brings the catfish to tears. Surface-sewer relations enter a golden age.',
      },
      {
        id: 'send-gift',
        label: 'Send a generous civic gift instead',
        description: 'You are extremely busy and also the chamber smells.',
        effects: { wealth: -4, trust: 2, infrastructure: 3 },
        factionEffects: { 'goblin-union': 5 },
        resultText: 'The gift is appreciated; your absence is noted, politely, in the minutes.',
      },
    ],
  },

  // -------------------------------------------------------------------------
  // FACTION EVENTS
  // -------------------------------------------------------------------------
  {
    id: 'merchant-guild-tax',
    title: 'The Merchants Propose a "Convenience Fee"',
    description:
      '{faction} have drafted a citywide convenience fee that applies to nearly everything, including, somehow, walking past their stalls.',
    tags: ['economy', 'faction'],
    weight: 11,
    involvedFaction: 'merchants',
    choices: [
      {
        id: 'approve',
        label: 'Approve a modest version of the fee',
        effects: { wealth: 7, happiness: -4, trust: -3 },
        factionEffects: { merchants: 12, workers: -6 },
        resultText: 'The coffers swell. Citizens have begun walking the long way around.',
      },
      {
        id: 'reject',
        label: 'Reject it firmly',
        effects: { wealth: -3, happiness: 4, trust: 4 },
        factionEffects: { merchants: -10, workers: 6 },
        resultText: 'The fee is dead. The merchants sulk; everyone else walks normally again.',
      },
      {
        id: 'redirect',
        label: 'Allow it, but earmark the funds for public works',
        effects: { wealth: 3, infrastructure: 5, trust: 2 },
        factionEffects: { merchants: 4, engineers: 6 },
        resultText: 'The fee funds new roads. The merchants grumble that this was not the plan.',
      },
    ],
  },
  {
    id: 'gardener-festival',
    title: 'The Gardeners Want to Plant the Whole City',
    description:
      '{faction} have submitted a proposal to convert every flat surface in {city} into a garden. They have already started on the rooftops. And one alderman’s hat.',
    tags: ['nature', 'culture', 'faction'],
    weight: 10,
    involvedFaction: 'gardeners',
    choices: [
      {
        id: 'green-roofs',
        label: 'Fund a green-roof program',
        effects: { wealth: -5, beauty: 7, pollution: -5 },
        factionEffects: { gardeners: 12 },
        resultText: 'Rooftops bloom across {city}. The bees have filed a thank-you note.',
      },
      {
        id: 'gardens-only',
        label: 'Limit it to designated garden districts',
        effects: { beauty: 3, pollution: -2, trust: 2 },
        factionEffects: { gardeners: 3, merchants: 3 },
        resultText: 'A sensible compromise. The alderman gets his hat back, mostly.',
      },
      {
        id: 'reject-greening',
        label: 'Decline — the city has buildings for a reason',
        effects: { beauty: -3, chaos: 3 },
        factionEffects: { gardeners: -10 },
        resultText: 'The proposal is shelved. A suspicious vine is now growing toward city hall.',
      },
    ],
  },
  {
    id: 'engineer-bridge',
    title: 'The Engineers Have Drawn a Magnificent, Terrifying Bridge',
    description:
      '{faction} present plans for a bridge so ambitious it loops twice for no structural reason. They describe this as "the fun part". The budget is described as "flexible".',
    tags: ['infrastructure', 'faction'],
    weight: 10,
    involvedFaction: 'engineers',
    choices: [
      {
        id: 'build-grand',
        label: 'Build the grand looping bridge',
        effects: { wealth: -9, infrastructure: 8, beauty: 5, culture: 3 },
        factionEffects: { engineers: 14 },
        outcomes: [
          {
            chance: 0.3,
            description: 'The loops, it turns out, are excellent for sledding. Injuries are minor and frequent.',
            effects: { happiness: 3, safety: -3 },
          },
        ],
        resultText: 'The bridge is finished and genuinely glorious. Nobody fully understands it.',
      },
      {
        id: 'build-practical',
        label: 'Approve a sensible, loop-free bridge',
        effects: { wealth: -5, infrastructure: 6 },
        factionEffects: { engineers: 3 },
        resultText: 'A perfectly good bridge is built. The engineers call it "adequate" with visible pain.',
      },
      {
        id: 'no-bridge',
        label: 'No bridge. We have boats.',
        effects: { wealth: 2, infrastructure: -2 },
        factionEffects: { engineers: -8, fishermen: 5 },
        resultText: 'The bridge is cancelled. The ferryfolk send you a fruit basket.',
      },
    ],
  },
  {
    id: 'mage-experiment',
    title: 'The Mages Request a Permit for "A Small Experiment"',
    description:
      '{faction} want to attempt a controlled rip in reality, purely for research. They assure you the word "small" is doing a great deal of work in that sentence.',
    tags: ['magic', 'faction', 'weird'],
    weight: 10,
    involvedFaction: 'mages',
    choices: [
      {
        id: 'permit',
        label: 'Grant the permit, with strict oversight',
        effects: { magic: 7, culture: 4, chaos: 4 },
        factionEffects: { mages: 12 },
        outcomes: [
          {
            chance: 0.35,
            description: 'The experiment opened a small door to elsewhere. A polite breeze keeps coming through.',
            effects: { magic: 4, chaos: 3, beauty: 2 },
          },
        ],
        resultText: 'The experiment proceeds. Tuesday happened twice this week, but only in one alley.',
      },
      {
        id: 'deny',
        label: 'Deny the permit',
        effects: { magic: -3, safety: 3, trust: 2 },
        factionEffects: { mages: -10 },
        resultText: 'Permit denied. The mages go back to setting things on fire the normal way.',
      },
      {
        id: 'fund-safe',
        label: 'Fund a properly shielded laboratory instead',
        effects: { wealth: -7, magic: 5, safety: 4 },
        factionEffects: { mages: 8, engineers: 4 },
        resultText: 'A reinforced lab rises on the edge of town. Reality stays put, mostly.',
      },
    ],
  },
  {
    id: 'workers-housing',
    title: 'The Workers Want Their Stairwells to Stop Being Optional',
    description:
      '{faction} point out, correctly, that several tenements in the workers’ quarter have stairs that exist only on the architect’s drawings. They would like the real kind.',
    tags: ['infrastructure', 'faction'],
    weight: 11,
    involvedFaction: 'workers',
    choices: [
      {
        id: 'fund-repairs',
        label: 'Fund a full repair program',
        effects: { wealth: -7, housing: 8, happiness: 5, trust: 4 },
        factionEffects: { workers: 14 },
        resultText: 'The stairs are real now. Residents climb them with cautious delight.',
      },
      {
        id: 'patch',
        label: 'Patch the worst cases only',
        effects: { wealth: -3, housing: 3, trust: 1 },
        factionEffects: { workers: 3 },
        resultText: 'The most dangerous stairwells get fixed. The rest get optimistic signage.',
      },
      {
        id: 'defer',
        label: 'Defer it to next year’s budget',
        effects: { wealth: 2, housing: -3, trust: -5 },
        factionEffects: { workers: -12 },
        outcomes: [
          {
            chance: 0.4,
            description: 'A stairwell has gone fully theoretical. The workers are organizing.',
            effects: { chaos: 4, happiness: -3 },
          },
        ],
        resultText: 'The repairs are deferred. The workers begin keeping a list, and it is long.',
      },
    ],
  },
  {
    id: 'noble-ball',
    title: 'The Nobles Demand a Grander Ball Than Last Year',
    description:
      '{faction} insist this season’s ball must outshine the last, which already featured a chandelier that required its own apartment. They have hinted that anything less reflects poorly on you.',
    tags: ['culture', 'economy', 'faction'],
    weight: 10,
    involvedFaction: 'nobles',
    choices: [
      {
        id: 'lavish',
        label: 'Fund a truly lavish ball',
        effects: { wealth: -8, culture: 6, beauty: 4, happiness: 3 },
        factionEffects: { nobles: 12, workers: -5 },
        resultText: 'The ball is the event of the decade. Three marriages and one duel result.',
      },
      {
        id: 'public-ball',
        label: 'Throw it, but open the gates to everyone',
        effects: { wealth: -6, happiness: 6, culture: 5, trust: 4 },
        factionEffects: { nobles: -6, 'street-performers': 8, workers: 6 },
        resultText: 'The commoners crash the ball delightfully. The nobles are scandalized and secretly thrilled.',
      },
      {
        id: 'modest',
        label: 'Host a tasteful, modest evening',
        effects: { wealth: -2, culture: 2 },
        factionEffects: { nobles: -8 },
        resultText: 'The evening is lovely and restrained. The nobles describe it, witheringly, as "adequate".',
      },
    ],
  },
  {
    id: 'performers-permit',
    title: 'The Street Performers Want the Whole City to Be a Stage',
    description:
      '{faction} have applied for a permit to perform anywhere, anytime, including, they specify, during council meetings and "emotionally significant moments".',
    tags: ['culture', 'festival', 'faction'],
    weight: 10,
    involvedFaction: 'street-performers',
    choices: [
      {
        id: 'open-permit',
        label: 'Grant the open permit',
        effects: { culture: 7, happiness: 5, chaos: 4 },
        factionEffects: { 'street-performers': 12 },
        resultText: 'Music breaks out everywhere. Commerce slows; spirits soar; juggling incidents rise.',
      },
      {
        id: 'zones',
        label: 'Designate performance zones',
        effects: { culture: 4, happiness: 2, trust: 2 },
        factionEffects: { 'street-performers': 4, merchants: 4 },
        resultText: 'Performances cluster in cheerful pockets. The fire-breather is firmly relocated.',
      },
      {
        id: 'deny-permit',
        label: 'Require auditions and licensing',
        effects: { culture: -3, chaos: 2 },
        factionEffects: { 'street-performers': -10 },
        resultText: 'The bureaucracy is thorough. A mime protests, very quietly.',
      },
    ],
  },
  {
    id: 'archivist-discovery',
    title: 'The Archivists Found a Map to Something',
    description:
      '{faction} have unearthed an ancient map in the city archives. It clearly marks a treasure beneath {city}, though the legend is written in a language that argues with itself.',
    tags: ['culture', 'magic', 'faction'],
    weight: 10,
    involvedFaction: 'archivists',
    choices: [
      {
        id: 'fund-dig',
        label: 'Fund an official excavation',
        effects: { wealth: -6, culture: 5, magic: 3 },
        factionEffects: { archivists: 12 },
        outcomes: [
          {
            chance: 0.5,
            description: 'The dig found a vault of old coins and one very offended skeleton librarian.',
            effects: { wealth: 8, magic: 3 },
          },
          {
            chance: 0.25,
            description: 'The dig found a tunnel system that was definitely supposed to stay sealed.',
            effects: { chaos: 5, safety: -4 },
          },
        ],
        resultText: 'The excavation begins. The archivists pack snacks and several centuries of expectation.',
      },
      {
        id: 'study-first',
        label: 'Translate the map fully before digging',
        effects: { culture: 4, wealth: -2, trust: 2 },
        factionEffects: { archivists: 6 },
        resultText: 'The translation reveals the "treasure" is a warning. The archivists are oddly relieved.',
      },
      {
        id: 'seal-it',
        label: 'Reseal the archive and forget you saw it',
        effects: { safety: 4, culture: -3, magic: -2 },
        factionEffects: { archivists: -8 },
        resultText: 'The map goes back in the box. Somewhere beneath you, something settles back to sleep.',
      },
    ],
  },
  {
    id: 'fishermen-catch',
    title: 'The Fisherfolk Have Caught Something That Is Talking',
    description:
      '{faction} pulled up a fish in the harbor that speaks four languages and has opinions about the harbor’s management. It is requesting an audience, and possibly a lawyer.',
    tags: ['weird', 'nature', 'faction'],
    weight: 9,
    involvedFaction: 'fishermen',
    involvedDistrictType: 'harbor',
    choices: [
      {
        id: 'consult-fish',
        label: 'Consult the fish on harbor policy',
        effects: { food: 5, infrastructure: 4, culture: 3 },
        factionEffects: { fishermen: 10 },
        resultText: 'The fish’s advice doubles the catch. It now has a stipend and a small wet office.',
      },
      {
        id: 'release',
        label: 'Release it with ceremony',
        effects: { happiness: 4, magic: 3, beauty: 2 },
        factionEffects: { fishermen: 6, gardeners: 4 },
        resultText: 'The fish is freed to applause. It surfaces weekly to wave, which is unsettling and nice.',
      },
      {
        id: 'aquarium',
        label: 'Build a grand civic aquarium around it',
        effects: { wealth: -6, culture: 5, beauty: 4, happiness: 3 },
        factionEffects: { fishermen: -5, 'street-performers': 5 },
        resultText: 'The aquarium draws crowds. The fish charges for autographs and is not entirely happy.',
      },
    ],
  },
  {
    id: 'inventor-machine',
    title: 'The Inventors Have Built a Machine and Lost the Manual',
    description:
      '{faction} unveil a magnificent brass device that does something. They are confident it does something good. The lever is currently labeled "DO NOT, probably".',
    tags: ['infrastructure', 'weird', 'faction'],
    weight: 10,
    involvedFaction: 'inventors',
    choices: [
      {
        id: 'pull-lever',
        label: 'Pull the lever',
        description: 'For science. For glory. For the lack of a better idea.',
        effects: { chaos: 5, magic: 3 },
        factionEffects: { inventors: 10 },
        outcomes: [
          {
            chance: 0.5,
            description: 'The machine cleans every street in the city in eleven seconds flat.',
            effects: { infrastructure: 6, beauty: 5, pollution: -4 },
          },
          {
            chance: 0.3,
            description: 'The machine has gently rotated three buildings to face the sunrise.',
            effects: { beauty: 3, chaos: 4, infrastructure: -3 },
          },
        ],
        resultText: 'The lever is pulled. There is a hum, a glow, and a deeply pregnant pause.',
      },
      {
        id: 'study-machine',
        label: 'Fund a careful study before activation',
        effects: { wealth: -5, infrastructure: 4, safety: 3 },
        factionEffects: { inventors: 5, engineers: 5 },
        resultText: 'The machine is studied thoroughly. It turns out to be a very advanced toaster.',
      },
      {
        id: 'crate-it',
        label: 'Crate it and store it "until further notice"',
        effects: { safety: 4, trust: -2 },
        factionEffects: { inventors: -8 },
        resultText: 'The machine is crated. It hums to itself in the warehouse, patiently.',
      },
    ],
  },
  {
    id: 'nightwatch-curfew',
    title: 'The Night Watch Requests a Curfew',
    description:
      '{faction} report a rise in "after-dark nonsense" and propose a citywide curfew. The tavern owners have already drafted a counter-petition, which they delivered after dark.',
    tags: ['crime', 'faction'],
    weight: 10,
    involvedFaction: 'night-watch',
    choices: [
      {
        id: 'impose-curfew',
        label: 'Impose the curfew',
        effects: { safety: 7, chaos: -5, happiness: -5, culture: -3 },
        factionEffects: { 'night-watch': 12, 'street-performers': -8, merchants: -5 },
        resultText: 'The streets are quiet and safe by night. They are also very, very boring.',
      },
      {
        id: 'patrols',
        label: 'Fund more night patrols instead',
        effects: { wealth: -5, safety: 5, chaos: -3 },
        factionEffects: { 'night-watch': 8 },
        resultText: 'More lanterns bob through the dark. Nonsense levels fall to merely whimsical.',
      },
      {
        id: 'lantern-festival',
        label: 'Light the streets and lean into the nightlife',
        effects: { wealth: -4, culture: 5, happiness: 5, safety: 2 },
        factionEffects: { 'night-watch': -4, 'street-performers': 8, merchants: 6 },
        resultText: 'The city glows after dark. Crime drops because everyone is too busy having fun.',
      },
    ],
  },

  // -------------------------------------------------------------------------
  // DISTRICT EVENTS
  // -------------------------------------------------------------------------
  {
    id: 'old-town-preservation',
    title: 'The Cobblestones of {district} Are Falling Out',
    description:
      'The historic cobbles of {district} are working loose and tripping dignitaries. A developer offers to pave it all in smooth, modern, soul-crushing stone.',
    tags: ['infrastructure', 'culture'],
    weight: 10,
    involvedDistrictType: 'old-town',
    choices: [
      {
        id: 'restore-cobbles',
        label: 'Restore the original cobblestones',
        effects: { wealth: -5, beauty: 5, culture: 4 },
        districtEffects: { mood: 6 },
        resultText: 'The old stones are lovingly relaid. Dignitaries trip with a sense of heritage.',
      },
      {
        id: 'modern-paving',
        label: 'Accept the developer’s smooth paving',
        effects: { wealth: 4, beauty: -4, culture: -4 },
        districtEffects: { mood: -5, wealth: 4 },
        resultText: '{district} is now perfectly smooth and perfectly forgettable.',
      },
      {
        id: 'compromise-paths',
        label: 'Pave the main paths, keep the side streets historic',
        effects: { wealth: -2, beauty: 2, infrastructure: 3 },
        districtEffects: { mood: 2 },
        resultText: 'A tidy compromise. {district} keeps its charm and loses its worst ankle-traps.',
      },
    ],
  },
  {
    id: 'market-day-chaos',
    title: 'Market Day in {district} Has Become a Stampede',
    description:
      'Market day in {district} now draws such crowds that three stalls have merged by accident and a cheese wheel achieved low orbit. Vendors want order; shoppers want the cheese.',
    tags: ['economy', 'festival'],
    weight: 11,
    involvedDistrictType: 'market',
    choices: [
      {
        id: 'expand-market',
        label: 'Expand the market grounds',
        effects: { wealth: 5, infrastructure: 3, chaos: -3 },
        districtEffects: { wealth: 6, mood: 4 },
        factionEffects: { merchants: 8 },
        resultText: 'The market spreads out and breathes. The orbital cheese is recovered, mostly intact.',
      },
      {
        id: 'ticketed',
        label: 'Introduce timed entry tickets',
        effects: { wealth: 4, happiness: -4, trust: -2 },
        districtEffects: { wealth: 3, mood: -3 },
        factionEffects: { merchants: 4, workers: -4 },
        resultText: 'Crowds thin and queues form. The market is orderly and faintly resentful.',
      },
      {
        id: 'embrace-chaos',
        label: 'Declare it a festival and lean in',
        effects: { culture: 5, happiness: 5, chaos: 4 },
        districtEffects: { mood: 6, wealth: 3 },
        factionEffects: { 'street-performers': 8, merchants: 3 },
        resultText: 'Market day is now a glorious, chaotic festival. The cheese has its own fan club.',
      },
    ],
  },
  {
    id: 'harbor-leviathan',
    title: 'Something Is Sleeping in {district} Harbor',
    description:
      'A shape the size of a warehouse has settled on the harbor floor of {district}. It is breathing, slowly, and the tide now arrives strictly on schedule out of apparent politeness.',
    tags: ['nature', 'weird', 'disaster'],
    weight: 9,
    involvedDistrictType: 'harbor',
    choices: [
      {
        id: 'leave-alone',
        label: 'Let it sleep and route ships around it',
        effects: { infrastructure: -3, magic: 4, safety: 2 },
        districtEffects: { mood: 2 },
        resultText: 'Ships give the shape a wide, respectful berth. The fishing has never been better.',
      },
      {
        id: 'study-leviathan',
        label: 'Have the mages study it',
        effects: { wealth: -4, magic: 5, culture: 3 },
        factionEffects: { mages: 8, fishermen: -4 },
        outcomes: [
          {
            chance: 0.35,
            description: 'It turned out to be an egg. {district} is now the proud, terrified guardian of an egg.',
            effects: { magic: 5, chaos: 4 },
          },
        ],
        resultText: 'The mages take measurements from a respectful distance and a very long boat.',
      },
      {
        id: 'evict-leviathan',
        label: 'Drive it out with noise and nets',
        effects: { chaos: 6, magic: -4, safety: -3 },
        districtEffects: { mood: -5 },
        outcomes: [
          {
            chance: 0.4,
            description: 'It left, taking the orderly tides with it. The harbor floods twice a fortnight now.',
            effects: { infrastructure: -4, food: -3 },
          },
        ],
        resultText: 'The shape stirs, sighs, and relocates. {district} immediately misses it.',
      },
    ],
  },
  {
    id: 'forest-edge-treaty',
    title: 'The Forest Beside {district} Has Sent a Delegate',
    description:
      'The woods bordering {district} have dispatched a delegate — a tall, mossy figure who walks with the unhurried confidence of something three centuries old. It wishes to discuss the boundary.',
    tags: ['nature', 'faction', 'weird'],
    weight: 9,
    involvedDistrictType: 'forest-edge',
    choices: [
      {
        id: 'sign-treaty',
        label: 'Sign a boundary treaty with the forest',
        effects: { beauty: 5, pollution: -4, magic: 3, wealth: -3 },
        factionEffects: { gardeners: 10 },
        resultText: 'The treaty is signed in sap and goodwill. The forest stops creeping into the bakery.',
      },
      {
        id: 'expand-logging',
        label: 'Negotiate expanded logging rights',
        effects: { wealth: 6, beauty: -4, pollution: 3 },
        factionEffects: { gardeners: -10, merchants: 6 },
        outcomes: [
          {
            chance: 0.4,
            description: 'The forest has quietly reclaimed a sawmill overnight. The saws are now saplings.',
            effects: { beauty: 3, infrastructure: -3 },
          },
        ],
        resultText: 'The logging deal is struck. The delegate signs it slowly, and meaningfully.',
      },
      {
        id: 'cultural-exchange',
        label: 'Propose a cultural exchange instead',
        effects: { culture: 5, magic: 4, beauty: 3 },
        factionEffects: { gardeners: 6, archivists: 5 },
        resultText: 'A young scholar goes to live among the trees. A young birch enrolls at the academy.',
      },
    ],
  },
  {
    id: 'academy-prodigy',
    title: 'A Prodigy at the {district} Academy Has Outgrown It',
    description:
      'A student at the {district} academy has, in one term, learned everything the faculty knows and started correcting the textbooks. The textbooks are correcting back. It is getting heated.',
    tags: ['culture', 'magic'],
    weight: 10,
    involvedDistrictType: 'academy',
    choices: [
      {
        id: 'fund-research',
        label: 'Fund an independent research wing for them',
        effects: { wealth: -6, culture: 6, magic: 4 },
        factionEffects: { mages: 6, archivists: 6 },
        resultText: 'The prodigy gets a wing, three assistants, and a sign reading "knock first, loudly".',
      },
      {
        id: 'send-abroad',
        label: 'Sponsor them to study in a distant city',
        effects: { wealth: -4, culture: 3, trust: 2 },
        factionEffects: { archivists: -3 },
        outcomes: [
          {
            chance: 0.3,
            description: 'The prodigy writes home with a discovery that earns {city} a tidy royalty.',
            effects: { wealth: 7, culture: 3 },
          },
        ],
        resultText: 'The prodigy departs to dazzle a rival city. The faculty exhales for the first time in weeks.',
      },
      {
        id: 'tenure',
        label: 'Just give them tenure already',
        effects: { culture: 4, chaos: 3 },
        factionEffects: { archivists: -5, mages: 4 },
        resultText: 'The prodigy is now the youngest professor on record and insufferable about it.',
      },
    ],
  },
  {
    id: 'industrial-smog',
    title: 'The Factories of {district} Are Producing Weather',
    description:
      'The smokestacks of {district} have grown so industrious they have generated a small, permanent cloud that follows shift workers home. It rains on Mondays out of solidarity.',
    tags: ['infrastructure', 'disaster', 'economy'],
    weight: 10,
    involvedDistrictType: 'industrial',
    choices: [
      {
        id: 'install-filters',
        label: 'Mandate smoke filters',
        effects: { wealth: -6, pollution: -7, happiness: 4 },
        districtEffects: { mood: 4 },
        factionEffects: { engineers: 6, workers: 5 },
        resultText: 'The filters go in. The cloud thins to a wisp that now only sulks on rainy days.',
      },
      {
        id: 'boost-output',
        label: 'Lean into output and boost production',
        effects: { wealth: 7, pollution: 6, happiness: -4 },
        districtEffects: { wealth: 6, mood: -4 },
        factionEffects: { merchants: 6, gardeners: -8 },
        resultText: '{district} roars with productivity. The cloud now has a name and a grudge.',
      },
      {
        id: 'relocate-worst',
        label: 'Relocate the worst factories outside the walls',
        effects: { wealth: -3, pollution: -4, infrastructure: 2 },
        districtEffects: { mood: 2 },
        factionEffects: { workers: -3 },
        resultText: 'The dirtiest works move beyond the walls. The cloud follows them, loyal to the end.',
      },
    ],
  },
  {
    id: 'noble-hill-secession',
    title: '{district} Threatens to Become Its Own Country',
    description:
      'The wealthy residents of {district} have drafted articles of independence, citing "an unacceptable proximity to ordinary people". They have already designed a flag. It is very gold.',
    tags: ['economy', 'crime'],
    weight: 9,
    involvedDistrictType: 'noble-hill',
    choices: [
      {
        id: 'call-bluff',
        label: 'Call their bluff',
        effects: { trust: 4, happiness: 4, wealth: -4 },
        factionEffects: { nobles: -10, workers: 8 },
        resultText: 'The secession collapses by teatime. The flag is quietly repurposed as a picnic blanket.',
      },
      {
        id: 'grant-autonomy',
        label: 'Grant them limited self-governance',
        effects: { wealth: 5, chaos: 3, trust: -3 },
        factionEffects: { nobles: 10, workers: -6 },
        resultText: '{district} gets its own little council. It immediately argues about the flag.',
      },
      {
        id: 'tax-the-flag',
        label: 'Recognize the country, then tax it heavily',
        effects: { wealth: 8, chaos: 4 },
        factionEffects: { nobles: -4, merchants: 5 },
        resultText: 'The new nation lasts nine days before petitioning, sheepishly, to rejoin {city}.',
      },
    ],
  },
  {
    id: 'workers-district-mural',
    title: 'A Mural in {district} Is Becoming a Movement',
    description:
      'A painter in {district} began a mural of the city’s founding. It has grown to cover four blocks, gained subplots, and now depicts several living officials in unflattering but accurate detail.',
    tags: ['culture', 'crime'],
    weight: 10,
    involvedDistrictType: 'workers',
    choices: [
      {
        id: 'commission-mural',
        label: 'Officially commission the mural',
        effects: { culture: 6, happiness: 5, beauty: 4 },
        districtEffects: { mood: 6 },
        factionEffects: { workers: 8, 'street-performers': 6 },
        resultText: 'The mural becomes a beloved landmark. The unflattering bits are deemed "character".',
      },
      {
        id: 'whitewash',
        label: 'Order it whitewashed',
        effects: { culture: -5, trust: -5, chaos: 5 },
        districtEffects: { mood: -6 },
        factionEffects: { workers: -10, 'street-performers': -6 },
        resultText: 'The wall is painted over. By morning, the mural has returned, larger and angrier.',
      },
      {
        id: 'edit-mural',
        label: 'Fund it, but negotiate the unflattering parts',
        effects: { culture: 3, wealth: -3, trust: 1 },
        districtEffects: { mood: 2 },
        factionEffects: { workers: 3, nobles: 3 },
        resultText: 'The mural stays; the worst caricatures gain tasteful hats. Everyone calls it a win.',
      },
    ],
  },
  {
    id: 'garden-bloom',
    title: 'The Gardens of {district} Have Bloomed Out of Season',
    description:
      'Every flower in {district} has bloomed at once, months early, in colors that do not strictly exist. The bees are ecstatic. The pollen is rendering passersby briefly, harmlessly poetic.',
    tags: ['nature', 'magic', 'festival'],
    weight: 10,
    involvedDistrictType: 'garden',
    choices: [
      {
        id: 'bloom-festival',
        label: 'Hold a bloom festival',
        effects: { wealth: -3, beauty: 6, happiness: 6, culture: 4 },
        districtEffects: { mood: 6, wealth: 3 },
        factionEffects: { gardeners: 10, 'street-performers': 6 },
        resultText: 'The festival is intoxicating. Poetry production reaches dangerous levels.',
      },
      {
        id: 'harvest-pollen',
        label: 'Have the mages harvest the strange pollen',
        effects: { wealth: 5, magic: 4, beauty: -3 },
        factionEffects: { mages: 6, gardeners: -6 },
        resultText: 'The pollen sells for a fortune as inspiration-in-a-jar. The gardens look briefly bare.',
      },
      {
        id: 'protect-bloom',
        label: 'Cordon off the gardens to protect the bloom',
        effects: { beauty: 4, magic: 2, happiness: -2 },
        districtEffects: { mood: -2 },
        factionEffects: { gardeners: 6 },
        resultText: 'The bloom is preserved behind ropes. Citizens admire it wistfully from a distance.',
      },
    ],
  },
  {
    id: 'ruins-awakening',
    title: 'The Ruins of {district} Have Lit Up',
    description:
      'The ancient ruins in {district}, long thought to be merely scenic, have begun glowing at dusk and humming a tune nobody can place but everybody hums back. Scholars are very excited and a little nervous.',
    tags: ['magic', 'culture', 'weird'],
    weight: 9,
    involvedDistrictType: 'ruins',
    choices: [
      {
        id: 'excavate-ruins',
        label: 'Fund a careful excavation',
        effects: { wealth: -6, magic: 5, culture: 5 },
        factionEffects: { archivists: 8, mages: 6 },
        outcomes: [
          {
            chance: 0.45,
            description: 'The ruins were a library. A very patient one. It has been waiting to be read.',
            effects: { culture: 6, magic: 4 },
          },
          {
            chance: 0.2,
            description: 'The ruins were a prison. Something inside is now extremely awake.',
            effects: { chaos: 6, safety: -5 },
          },
        ],
        resultText: 'The dig begins under floodlight and folklore. The humming gets noticeably louder.',
      },
      {
        id: 'seal-ruins',
        label: 'Seal the ruins and post guards',
        effects: { safety: 4, magic: -3, culture: -2 },
        factionEffects: { 'night-watch': 6, archivists: -6 },
        resultText: 'The ruins are sealed. The humming continues, muffled, like a kettle that knows things.',
      },
      {
        id: 'shrine',
        label: 'Build a small shrine and leave offerings',
        effects: { magic: 4, culture: 4, happiness: 3, wealth: -2 },
        factionEffects: { mages: 4, archivists: 3 },
        resultText: 'Offerings appear; the glow softens to something almost grateful. The tune turns lullaby.',
      },
    ],
  },
  {
    id: 'festival-district-runaway',
    title: 'The Festival in {district} Refuses to End',
    description:
      'The annual festival in {district} was scheduled for three days. It is now on day eleven. Nobody declared it over, and now everyone is afraid to be the one who does.',
    tags: ['festival', 'culture'],
    weight: 10,
    involvedDistrictType: 'festival',
    choices: [
      {
        id: 'let-it-run',
        label: 'Let the festival run its natural course',
        effects: { happiness: 6, culture: 5, wealth: -4, chaos: 3 },
        districtEffects: { mood: 6 },
        factionEffects: { 'street-performers': 10, merchants: 5 },
        resultText: 'The festival becomes legend, ending only when the last musician falls asleep mid-note.',
      },
      {
        id: 'official-close',
        label: 'Officially and ceremonially close it',
        effects: { trust: 3, happiness: -3, infrastructure: 2 },
        districtEffects: { mood: -3 },
        factionEffects: { 'street-performers': -5 },
        resultText: 'You close the festival with a gentle speech. There is sniffling, and then relief.',
      },
      {
        id: 'make-it-annual',
        label: 'Make the eleven-day festival permanent next year',
        effects: { culture: 5, wealth: 3, happiness: 4 },
        districtEffects: { mood: 4, wealth: 4 },
        factionEffects: { 'street-performers': 8, merchants: 6 },
        resultText: 'The eleven-day festival is now official. Tourism planners weep with joy and exhaustion.',
      },
    ],
  },
  {
    id: 'magical-district-leak',
    title: 'The Magic in {district} Is Leaking Into the Plumbing',
    description:
      'Spellwork in {district} has seeped into the water system. Taps now occasionally dispense prophecy, lemonade, or small startled frogs. Residents have stopped being surprised, which is its own kind of worrying.',
    tags: ['magic', 'infrastructure', 'weird'],
    weight: 10,
    involvedDistrictType: 'magical',
    choices: [
      {
        id: 'reroute-magic',
        label: 'Fund a proper magical plumbing overhaul',
        effects: { wealth: -7, magic: -3, infrastructure: 6, safety: 4 },
        factionEffects: { engineers: 8, mages: 4 },
        resultText: 'The pipes are warded and separated. Taps dispense water again, only slightly smug.',
      },
      {
        id: 'bottle-prophecy',
        label: 'Bottle and sell the prophecy-water',
        effects: { wealth: 7, magic: 4, chaos: 3 },
        factionEffects: { merchants: 8, mages: 6 },
        outcomes: [
          {
            chance: 0.35,
            description: 'A customer’s tap-water foretold the lottery. Civic trust in plumbing soars.',
            effects: { happiness: 3, trust: 3 },
          },
        ],
        resultText: 'Prophecy-water becomes the city’s strangest export. The frogs are sold separately.',
      },
      {
        id: 'embrace-leak',
        label: 'Leave it — the lemonade is genuinely good',
        effects: { magic: 4, happiness: 4, chaos: 3, infrastructure: -3 },
        factionEffects: { mages: 6 },
        resultText: 'The city embraces its enchanted plumbing. Visitors are warned never to drink before bad news.',
      },
    ],
  },

  // -------------------------------------------------------------------------
  // STAT-CRISIS EVENTS (gated by condition)
  // -------------------------------------------------------------------------
  {
    id: 'smog-hearings',
    title: 'Emergency Smog Hearings',
    description:
      'The air over {city} has thickened to the point that birds are walking. An emergency public hearing has been convened, and even the back row is coughing pointedly.',
    tags: ['disaster', 'infrastructure'],
    weight: 12,
    condition: { minStats: { pollution: 60 } },
    choices: [
      {
        id: 'clean-air-act',
        label: 'Pass a sweeping clean-air act',
        effects: { wealth: -8, pollution: -10, happiness: 5, trust: 4 },
        factionEffects: { gardeners: 10, merchants: -6 },
        resultText: 'Sweeping reforms pass. The birds resume flying, smugly, within the week.',
      },
      {
        id: 'subsidize-filters',
        label: 'Subsidize cleaner methods gradually',
        effects: { wealth: -5, pollution: -5, trust: 2 },
        factionEffects: { engineers: 6, merchants: 2 },
        resultText: 'A gradual cleanup begins. Progress is steady; the coughing, slightly less so.',
      },
      {
        id: 'free-masks',
        label: 'Hand out free masks and call it managed',
        effects: { wealth: -3, happiness: -3, trust: -4 },
        factionEffects: { gardeners: -8 },
        outcomes: [
          {
            chance: 0.4,
            description: 'The masks become a grim fashion statement. The smog remains, fashionably.',
            effects: { pollution: 2, chaos: 3 },
          },
        ],
        resultText: 'Masks are distributed. The hearings end; the smog does not.',
      },
    ],
  },
  {
    id: 'granary-crisis',
    title: 'The Granaries of {city} Are Echoing',
    description:
      'A bad season and worse luck have left the city’s granaries alarmingly hollow. The price of bread has doubled, and the pigeons have started eyeing the citizens with new, calculating interest.',
    tags: ['disaster', 'economy'],
    weight: 12,
    condition: { maxStats: { food: 30 } },
    choices: [
      {
        id: 'import-grain',
        label: 'Spend big to import grain',
        effects: { wealth: -9, food: 10, happiness: 5, trust: 4 },
        factionEffects: { merchants: 5, workers: 6 },
        resultText: 'Grain caravans roll in. The bread is back; the pigeons stand down, for now.',
      },
      {
        id: 'ration',
        label: 'Impose strict rationing',
        effects: { food: 5, happiness: -5, chaos: 3, trust: -2 },
        factionEffects: { workers: -4, nobles: -6 },
        resultText: 'Rationing buys time. Everyone is hungry, equal, and extremely irritable about it.',
      },
      {
        id: 'fishing-push',
        label: 'Launch an emergency fishing and foraging drive',
        effects: { food: 6, wealth: -3, culture: 2 },
        factionEffects: { fishermen: 8, gardeners: 6 },
        outcomes: [
          {
            chance: 0.4,
            description: 'The foraging drive discovers a hidden valley of mushrooms. Some glow. All are edible.',
            effects: { food: 4, magic: 2 },
          },
        ],
        resultText: 'Boats and baskets go out in force. The city eats stranger but eats well enough.',
      },
    ],
  },
  {
    id: 'magic-weirdness',
    title: 'Reality Over {city} Is Getting Loose',
    description:
      'Ambient magic has saturated {city} to the point that shadows fall the wrong way, mirrors gossip, and Thursday has been optional for two weeks running. Something must be done, ideally before Friday.',
    tags: ['magic', 'weird', 'disaster'],
    weight: 12,
    condition: { minStats: { magic: 70 } },
    choices: [
      {
        id: 'ground-magic',
        label: 'Build grounding rods to bleed off excess magic',
        effects: { wealth: -7, magic: -10, safety: 5, chaos: -4 },
        factionEffects: { engineers: 8, mages: -6 },
        resultText: 'The rods hum and the world settles. Thursday returns, slightly embarrassed.',
      },
      {
        id: 'channel-magic',
        label: 'Channel the surplus into civic enchantments',
        effects: { magic: -4, beauty: 6, culture: 5, infrastructure: 4 },
        factionEffects: { mages: 8 },
        outcomes: [
          {
            chance: 0.4,
            description: 'The enchantments hold. Streetlamps now relight themselves and judge your choices.',
            effects: { safety: 3, beauty: 2 },
          },
        ],
        resultText: 'The surplus is woven into the city itself. {city} shimmers, usefully, for once.',
      },
      {
        id: 'ride-it-out',
        label: 'Issue advisories and ride it out',
        effects: { magic: 3, chaos: 5, trust: -3 },
        factionEffects: { mages: 3, 'night-watch': -4 },
        outcomes: [
          {
            chance: 0.45,
            description: 'A street folded into a Tuesday and had to be retrieved by a very brave surveyor.',
            effects: { chaos: 4, infrastructure: -3 },
          },
        ],
        resultText: 'Advisories go out. The city muddles through, mostly in the correct number of dimensions.',
      },
    ],
  },
  {
    id: 'unrest-uprising',
    title: 'The Streets of {city} Are Boiling',
    description:
      'Chaos has reached a rolling boil. Three separate mobs have formed, lost track of their grievances, merged, and are now a single confused crowd demanding either lower taxes or more festivals or possibly lunch.',
    tags: ['crime', 'disaster'],
    weight: 12,
    condition: { minStats: { chaos: 65 } },
    choices: [
      {
        id: 'concessions',
        label: 'Make swift public concessions',
        effects: { wealth: -6, chaos: -8, happiness: 5, trust: 5 },
        factionEffects: { workers: 8, nobles: -5 },
        resultText: 'You meet the crowd halfway. The mob becomes a queue, then a picnic. Order returns.',
      },
      {
        id: 'crackdown',
        label: 'Send in the Night Watch to restore order',
        effects: { chaos: -6, safety: 4, trust: -6, happiness: -5 },
        factionEffects: { 'night-watch': 8, workers: -10 },
        outcomes: [
          {
            chance: 0.4,
            description: 'The crackdown works but leaves a sullen quiet that will cost you later.',
            effects: { trust: -3 },
          },
        ],
        resultText: 'The streets are cleared. They are quiet now, in the way held breath is quiet.',
      },
      {
        id: 'town-hall',
        label: 'Hold an open, all-night town hall',
        effects: { chaos: -5, trust: 6, culture: 3, happiness: 3 },
        factionEffects: { workers: 6, 'street-performers': 4 },
        resultText: 'You talk until dawn. The crowd disperses, hoarse, heard, and weirdly fond of you.',
      },
    ],
  },
  {
    id: 'wealth-boom',
    title: 'The Coffers of {city} Are Overflowing',
    description:
      'A run of good fortune has left {city} embarrassingly rich. The treasury is full, the vaults are full, and one accountant has started stacking coins into a small, unauthorized fort.',
    tags: ['economy', 'festival'],
    weight: 11,
    condition: { minStats: { wealth: 75 } },
    minDay: 8,
    choices: [
      {
        id: 'invest-public',
        label: 'Invest heavily in public works',
        effects: { wealth: -10, infrastructure: 8, beauty: 5, happiness: 5 },
        factionEffects: { engineers: 8, workers: 8 },
        resultText: 'The surplus becomes roads, parks, and pride. The coin fort is dismantled and missed.',
      },
      {
        id: 'tax-holiday',
        label: 'Declare a tax holiday',
        effects: { wealth: -8, happiness: 8, trust: 6 },
        factionEffects: { merchants: 6, workers: 6, nobles: 4 },
        resultText: 'The tax holiday delights everyone. The treasury shrinks; the city beams.',
      },
      {
        id: 'hoard-it',
        label: 'Save it for a rainy day',
        effects: { wealth: 4, happiness: -3, trust: -2 },
        factionEffects: { nobles: 6, workers: -4 },
        outcomes: [
          {
            chance: 0.3,
            description: 'Word of the hoard spreads. Ambitious thieves are now studying maps of the vault.',
            effects: { safety: -3, chaos: 3 },
          },
        ],
        resultText: 'The surplus is locked away. Prudent, unloved, and faintly tempting to everyone.',
      },
    ],
  },
  {
    id: 'conspiracy-fever',
    title: 'Nobody in {city} Trusts Anybody',
    description:
      'Trust has collapsed so thoroughly that citizens have begun forming secret societies to investigate the other secret societies. Three of these turned out to be the same eleven people.',
    tags: ['crime', 'weird'],
    weight: 12,
    condition: { maxStats: { trust: 30 } },
    choices: [
      {
        id: 'transparency',
        label: 'Open the city ledgers to public inspection',
        effects: { trust: 8, wealth: -3, chaos: -4 },
        factionEffects: { workers: 8, archivists: 6, nobles: -5 },
        resultText: 'You bare the books. The conspiracies, finding nothing hidden, take up gardening instead.',
      },
      {
        id: 'scapegoat',
        label: 'Blame a convenient scapegoat',
        effects: { trust: 3, chaos: -3, happiness: 3 },
        factionEffects: { 'night-watch': 4 },
        outcomes: [
          {
            chance: 0.45,
            description: 'The scapegoat turns out to be innocent, beloved, and now very loud about it.',
            effects: { trust: -6, chaos: 4 },
          },
        ],
        resultText: 'A culprit is named. The mood lifts briefly, on a foundation of damp sand.',
      },
      {
        id: 'truth-commission',
        label: 'Convene a public truth commission',
        effects: { wealth: -4, trust: 6, culture: 3 },
        factionEffects: { archivists: 8, workers: 5 },
        resultText: 'The commission airs old grievances at length. It is exhausting, and it works.',
      },
    ],
  },
  {
    id: 'beauty-tourism',
    title: '{city} Is Suddenly the Place to Be Seen',
    description:
      'Word of the city’s loveliness has spread, and now visitors arrive by the cartload to stand around being impressed. The innkeepers are thrilled. The locals are running out of "yes, it is lovely, thank you".',
    tags: ['economy', 'culture'],
    weight: 10,
    condition: { minStats: { beauty: 70 } },
    minDay: 8,
    choices: [
      {
        id: 'tourism-board',
        label: 'Establish a tourism board to manage the crowds',
        effects: { wealth: 7, infrastructure: 3, happiness: -2 },
        factionEffects: { merchants: 8, nobles: 4 },
        resultText: 'Tourism is organized and lucrative. The locals are issued official sighing breaks.',
      },
      {
        id: 'tourist-tax',
        label: 'Levy a gentle tourist tax for the locals’ benefit',
        effects: { wealth: 6, happiness: 4, trust: 3 },
        factionEffects: { workers: 6, merchants: -3 },
        resultText: 'Visitors pay a little extra; locals get new fountains. Everyone is, briefly, satisfied.',
      },
      {
        id: 'keep-quiet',
        label: 'Quietly discourage the attention',
        effects: { wealth: -4, happiness: 4, culture: -2 },
        factionEffects: { merchants: -6 },
        resultText: 'The signs come down and the crowds thin. The city exhales and keeps its charm to itself.',
      },
    ],
  },
  {
    id: 'housing-squeeze',
    title: 'There Is Nowhere Left to Live in {city}',
    description:
      'Housing has grown so scarce that families are subletting stairwells and one enterprising landlord is renting out "a very spacious idea". The Workers have stopped finding it funny.',
    tags: ['infrastructure', 'economy'],
    weight: 11,
    condition: { maxStats: { housing: 30 } },
    choices: [
      {
        id: 'build-housing',
        label: 'Fund a major housing program',
        effects: { wealth: -9, housing: 10, happiness: 5, trust: 4 },
        factionEffects: { workers: 12, engineers: 6 },
        resultText: 'New blocks rise across the city. The stairwell families get actual doors. Joy ensues.',
      },
      {
        id: 'rent-control',
        label: 'Impose strict rent controls',
        effects: { housing: 3, happiness: 4, wealth: -4 },
        factionEffects: { workers: 8, nobles: -8, merchants: -5 },
        resultText: 'Rents are capped. Tenants cheer; landlords discover urgent business elsewhere.',
      },
      {
        id: 'convert-warehouses',
        label: 'Convert empty warehouses into homes',
        effects: { wealth: -4, housing: 6, infrastructure: 3 },
        factionEffects: { workers: 6, merchants: -3 },
        resultText: 'The warehouses become lofts. They are drafty, enormous, and instantly beloved.',
      },
    ],
  },
  {
    id: 'safety-crime-wave',
    title: 'A Polite Crime Wave Sweeps {city}',
    description:
      'Safety has slipped, and a wave of unusually courteous crime has followed. Burglars leave receipts. Pickpockets return the wallets, minus a "convenience fee". It is theft with excellent manners, and it is everywhere.',
    tags: ['crime'],
    weight: 11,
    condition: { maxStats: { safety: 30 } },
    choices: [
      {
        id: 'hire-watch',
        label: 'Hire and equip more Night Watch',
        effects: { wealth: -7, safety: 8, chaos: -4 },
        factionEffects: { 'night-watch': 12 },
        resultText: 'The Watch swells in number and lamplight. The polite burglars apply for honest jobs.',
      },
      {
        id: 'amnesty',
        label: 'Offer an amnesty for returned goods',
        effects: { safety: 4, trust: 4, wealth: -2 },
        factionEffects: { 'goblin-union': 4, workers: 4 },
        outcomes: [
          {
            chance: 0.45,
            description: 'The amnesty pile overflows the courthouse. Half the city quietly returns "borrowed" spoons.',
            effects: { happiness: 3, safety: 2 },
          },
        ],
        resultText: 'Goods are returned by the wagonload, often with apology notes. Trust ticks upward.',
      },
      {
        id: 'community-watch',
        label: 'Organize neighborhood community watches',
        effects: { safety: 5, trust: 3, culture: 2, chaos: -3 },
        factionEffects: { workers: 6, 'night-watch': -3 },
        resultText: 'Neighbors watch out for neighbors. Crime drops; the gossip network becomes formidable.',
      },
    ],
  },
  {
    id: 'happiness-malaise',
    title: 'A Great Gloom Has Settled Over {city}',
    description:
      'Nobody can say quite why, but a low, grey mood has crept over the city. Conversations trail off. The fountains seem to be sighing. Even the dogs look thoughtful.',
    tags: ['culture', 'weird'],
    weight: 11,
    condition: { maxStats: { happiness: 30 } },
    choices: [
      {
        id: 'public-holiday',
        label: 'Declare a surprise public holiday',
        effects: { wealth: -5, happiness: 8, culture: 4, chaos: 2 },
        factionEffects: { workers: 8, 'street-performers': 8 },
        resultText: 'The surprise holiday lands like sunshine. The fountains perk up; the dogs play again.',
      },
      {
        id: 'commission-art',
        label: 'Commission public art and music',
        effects: { wealth: -4, culture: 6, beauty: 4, happiness: 4 },
        factionEffects: { 'street-performers': 8, gardeners: 3 },
        resultText: 'Color and song return to the streets. Slowly, the city remembers how to smile.',
      },
      {
        id: 'stoic-message',
        label: 'Address the city honestly about hard times',
        effects: { trust: 6, happiness: 3, chaos: -2 },
        factionEffects: { workers: 5, nobles: 3 },
        resultText: 'Your candor lands well. The gloom lifts not because times are good, but because they are shared.',
      },
    ],
  },

  // -------------------------------------------------------------------------
  // PURE-WHIMSY EVENTS
  // -------------------------------------------------------------------------
  {
    id: 'pigeon-strike',
    title: 'The Messenger Pigeons Have Unionized',
    description:
      'The city’s messenger pigeons have downed wings and presented a list of demands, chief among them better crumbs, shorter routes, and a formal apology from a statue that has been "looking at them funny".',
    tags: ['weird', 'crime'],
    weight: 11,
    choices: [
      {
        id: 'meet-demands',
        label: 'Meet the pigeons’ demands',
        effects: { wealth: -3, infrastructure: 4, happiness: 3 },
        resultText: 'The pigeons return to work, fat and triumphant. The mail arrives early for the first time ever.',
      },
      {
        id: 'use-crows',
        label: 'Bring in crows as strikebreakers',
        effects: { chaos: 4, infrastructure: 2, trust: -2 },
        outcomes: [
          {
            chance: 0.45,
            description: 'The crows are efficient, terrifying, and have started reading the mail.',
            effects: { infrastructure: 3, chaos: 3, safety: -2 },
          },
        ],
        resultText: 'The crows take over the routes. The pigeons watch from the rooftops, plotting.',
      },
      {
        id: 'apologize-statue',
        label: 'Make the statue formally apologize',
        effects: { culture: 3, happiness: 4, magic: 2 },
        resultText: 'A small ceremony is held. The statue apologizes through a hired interpreter. Honor is restored.',
      },
    ],
  },
  {
    id: 'wandering-house',
    title: 'A House Has Wandered Off',
    description:
      'A modest cottage on the edge of {city} has pulled up its own foundations and gone for a walk. It is currently three streets over, admiring a view, and refuses to discuss the matter.',
    tags: ['weird', 'magic', 'infrastructure'],
    weight: 10,
    choices: [
      {
        id: 'let-it-roam',
        label: 'Issue it a roaming permit',
        effects: { magic: 3, culture: 4, happiness: 3, infrastructure: -2 },
        resultText: 'The cottage is now a registered nomad. The postal service files a strongly worded memo.',
      },
      {
        id: 'anchor-it',
        label: 'Have the engineers anchor it permanently',
        effects: { wealth: -3, infrastructure: 4, safety: 2 },
        factionEffects: { engineers: 5 },
        resultText: 'The cottage is firmly anchored. It sulks for a week, then settles, then grows a lovely garden.',
      },
      {
        id: 'follow-it',
        label: 'Follow it and see where it goes',
        effects: { culture: 3, chaos: 2, magic: 2 },
        outcomes: [
          {
            chance: 0.4,
            description: 'The cottage led a parade of curious citizens to a hilltop with the best view in the realm.',
            effects: { beauty: 4, happiness: 3 },
          },
        ],
        resultText: 'A small crowd trails the wandering house. It seems pleased by the company.',
      },
    ],
  },
  {
    id: 'mayor-statue-feud',
    title: 'The Founder’s Statue Disapproves of You',
    description:
      'The statue of {city}’s founder, which has stood in stoic silence for two centuries, has begun audibly sighing whenever you pass and pointedly turning its stone head away during speeches.',
    tags: ['weird', 'culture', 'magic'],
    weight: 10,
    choices: [
      {
        id: 'win-it-over',
        label: 'Try to win the statue’s approval',
        effects: { culture: 4, trust: 3, wealth: -2 },
        outcomes: [
          {
            chance: 0.45,
            description: 'The statue now nods approvingly. Citizens have started checking its mood like a weather vane.',
            effects: { happiness: 3, trust: 3 },
          },
        ],
        resultText: 'You court the founder’s good opinion with small civic gestures. The sighing softens.',
      },
      {
        id: 'ignore-statue',
        label: 'Ignore the statue entirely',
        effects: { trust: -3, chaos: 2 },
        resultText: 'You ignore the statue. It escalates to dramatic sighing. The pigeons have taken sides.',
      },
      {
        id: 'relocate-statue',
        label: 'Quietly relocate it to a nice park',
        effects: { culture: -3, beauty: 3, happiness: 2 },
        factionEffects: { archivists: -6 },
        resultText: 'The statue is moved to a leafy corner. It seems happier, and so, frankly, are you.',
      },
    ],
  },
  {
    id: 'cheese-incident',
    title: 'The Great Cheese of {city}',
    description:
      '{citizen} has produced a wheel of cheese so large and so aromatic that it has been declared a navigational landmark. Ships use it to find the harbor. It is, by all accounts, magnificent.',
    tags: ['festival', 'economy', 'weird'],
    weight: 10,
    choices: [
      {
        id: 'cheese-festival',
        label: 'Build a festival around the Great Cheese',
        effects: { wealth: 4, culture: 5, happiness: 5, beauty: -2 },
        factionEffects: { merchants: 6, 'street-performers': 6 },
        resultText: 'The Cheese Festival is born, with {citizen} as its reluctant guest of honor. The wheel is now a beloved, faintly alarming civic mascot.',
      },
      {
        id: 'export-cheese',
        label: 'Cut it up and export it at a premium',
        effects: { wealth: 8, happiness: -3, culture: -2 },
        factionEffects: { merchants: 8 },
        resultText: 'The Great Cheese is sold off in slices for a small fortune. Ships now get lost again.',
      },
      {
        id: 'preserve-cheese',
        label: 'Preserve it intact as a monument',
        effects: { wealth: -3, culture: 4, beauty: -3 },
        outcomes: [
          {
            chance: 0.3,
            description: 'The monument cheese has developed a small ecosystem. A naturalist has moved in.',
            effects: { magic: 2, culture: 2 },
          },
        ],
        resultText: 'The Great Cheese is enshrined. Visitors are advised to stand upwind and be moved.',
      },
    ],
  },
  {
    id: 'lost-and-found-portal',
    title: 'The Lost-and-Found Has Become a Portal',
    description:
      'The city’s lost-and-found office, after decades of accumulating umbrellas, has quietly become a small portal to somewhere with very different umbrellas. Things are coming back changed.',
    tags: ['weird', 'magic'],
    weight: 9,
    choices: [
      {
        id: 'study-portal',
        label: 'Have the mages study the portal',
        effects: { magic: 5, culture: 3, wealth: -3 },
        factionEffects: { mages: 8, archivists: 5 },
        outcomes: [
          {
            chance: 0.4,
            description: 'A returned umbrella now grants whoever holds it a single, mildly useful premonition.',
            effects: { magic: 3, happiness: 2 },
          },
        ],
        resultText: 'The mages catalogue the portal carefully. Lost property has never been so interesting.',
      },
      {
        id: 'close-portal',
        label: 'Have it sealed for safety',
        effects: { magic: -3, safety: 4, culture: -2 },
        factionEffects: { mages: -5, 'night-watch': 4 },
        resultText: 'The portal is sealed. A great many umbrellas are now, sadly, permanently elsewhere.',
      },
      {
        id: 'open-shop',
        label: 'Open a curiosity shop around it',
        effects: { wealth: 6, culture: 4, chaos: 2 },
        factionEffects: { merchants: 6 },
        resultText: 'The shop thrives on the strange and the returned. Reviews are excellent, if confusing.',
      },
    ],
  },
  {
    id: 'moon-too-close',
    title: 'The Moon Is Hanging Around',
    description:
      'For three nights running, the moon has risen far too large and far too low over {city}, close enough that the more athletic cats have begun making attempts. It seems to want something. Astronomers are baffled and a little starstruck.',
    tags: ['weird', 'magic', 'nature'],
    weight: 8,
    minDay: 10,
    once: true,
    choices: [
      {
        id: 'greet-moon',
        label: 'Hold a festival to welcome the moon',
        effects: { culture: 6, magic: 5, happiness: 5, wealth: -4 },
        factionEffects: { mages: 8, 'street-performers': 6 },
        resultText: 'The city throws the moon a party. It lingers a while, satisfied, then drifts politely back up.',
      },
      {
        id: 'study-moon',
        label: 'Mount an expedition to investigate',
        effects: { magic: 4, culture: 4, chaos: 3 },
        factionEffects: { mages: 6, inventors: 6 },
        outcomes: [
          {
            chance: 0.35,
            description: 'A balloon expedition returned with moonstone and stories that improve with each telling.',
            effects: { wealth: 5, magic: 3 },
          },
        ],
        resultText: 'Brave souls ascend in balloons. The moon, it turns out, is shy but friendly.',
      },
      {
        id: 'ward-moon',
        label: 'Ward the city and wait it out',
        effects: { magic: -3, safety: 3, happiness: -2 },
        factionEffects: { mages: -4 },
        resultText: 'The wards go up; the moon takes the hint and retreats. The cats are deeply disappointed.',
      },
    ],
  },
  {
    id: 'rival-mayor-visit',
    title: 'A Rival Mayor Comes to Gloat',
    description:
      'The mayor of a neighboring city has arrived on a "friendly visit", which mostly involves loudly comparing your fountains unfavorably to theirs and asking pointed questions about your drainage.',
    tags: ['culture', 'economy'],
    weight: 11,
    choices: [
      {
        id: 'out-host',
        label: 'Out-host them lavishly',
        effects: { wealth: -6, culture: 4, happiness: 4, beauty: 3 },
        factionEffects: { nobles: 8, merchants: 4 },
        resultText: 'The rival mayor leaves impressed and quietly furious. A great civic victory.',
      },
      {
        id: 'be-gracious',
        label: 'Be disarmingly gracious',
        effects: { trust: 4, culture: 3, wealth: -2 },
        outcomes: [
          {
            chance: 0.4,
            description: 'The rival mayor proposes a trade pact, charmed against their will.',
            effects: { wealth: 6, culture: 2 },
          },
        ],
        resultText: 'You meet every jab with warmth. The rival mayor departs confused and oddly fond of you.',
      },
      {
        id: 'sabotage-fountain',
        label: 'Quietly tamper with their carriage’s comfort',
        effects: { happiness: 3, chaos: 3, trust: -3 },
        factionEffects: { 'goblin-union': 5, nobles: -4 },
        resultText: 'The rival mayor’s carriage develops a mysterious squeak and a worse smell. Petty. Satisfying.',
      },
    ],
  },
  {
    id: 'philosophical-frogs',
    title: 'The Pond Frogs Have Taken Up Philosophy',
    description:
      'The frogs in the city pond have, overnight, begun croaking in what scholars confirm is rigorous moral philosophy. They are currently debating the ethics of flies, loudly, at all hours.',
    tags: ['weird', 'culture', 'nature'],
    weight: 9,
    choices: [
      {
        id: 'fund-symposium',
        label: 'Fund a frog philosophy symposium',
        effects: { culture: 6, magic: 3, wealth: -3 },
        factionEffects: { archivists: 8, mages: 4 },
        resultText: 'The symposium is a triumph, chaired with great dignity by {citizen}. The keynote frog receives a standing ovation and a fly buffet.',
      },
      {
        id: 'relocate-frogs',
        label: 'Quietly relocate them to a distant marsh',
        effects: { happiness: 2, culture: -3, chaos: -2 },
        factionEffects: { archivists: -5, gardeners: -4 },
        resultText: 'The frogs are moved. The pond is peaceful again, and noticeably less profound.',
      },
      {
        id: 'ignore-frogs',
        label: 'Let them croak — it’s rather soothing',
        effects: { culture: 3, happiness: 3, magic: 2 },
        resultText: 'The city grows fond of its philosopher frogs. Insomniacs report unexpectedly good sleep.',
      },
    ],
  },
  {
    id: 'time-slips',
    title: 'Tuesdays Are Behaving Strangely',
    description:
      'For reasons no one can pin down, Tuesdays in {city} have begun lasting either ninety minutes or thirty hours, with no warning and no pattern. Appointments have become an act of faith.',
    tags: ['weird', 'magic'],
    weight: 9,
    minDay: 8,
    choices: [
      {
        id: 'consult-mages-time',
        label: 'Consult the mages about the time-slips',
        effects: { wealth: -4, magic: 4, infrastructure: 3 },
        factionEffects: { mages: 6, archivists: 5 },
        outcomes: [
          {
            chance: 0.45,
            description: 'The mages stabilized Tuesday. As thanks, they ask to keep one for experiments. You agree.',
            effects: { magic: 3, chaos: 2 },
          },
        ],
        resultText: 'The mages knit Tuesday back into a reasonable shape. Appointments resume, warily.',
      },
      {
        id: 'embrace-time',
        label: 'Reschedule the whole city around it',
        effects: { culture: 4, chaos: 3, happiness: 3 },
        resultText: 'The city adopts flexible Tuesdays. Productivity is chaotic; naps have never been better.',
      },
      {
        id: 'ban-tuesday',
        label: 'Officially abolish Tuesday',
        effects: { chaos: -3, happiness: -2, culture: 2 },
        outcomes: [
          {
            chance: 0.3,
            description: 'Wednesday, now overworked, has begun showing the same alarming symptoms.',
            effects: { chaos: 4 },
          },
        ],
        resultText: 'Tuesday is struck from the calendar. The week is shorter and everyone pretends not to notice.',
      },
    ],
  },
  {
    id: 'civic-orchestra',
    title: 'An Orchestra Has Formed in the Sewers',
    description:
      'The peculiar acoustics of {city}’s drains have given rise to an underground orchestra of remarkable quality. Their concerts rise up through the gratings at midnight, and they are, against all reason, sublime.',
    tags: ['culture', 'festival', 'weird'],
    weight: 10,
    choices: [
      {
        id: 'fund-orchestra',
        label: 'Fund the Sewer Orchestra officially',
        effects: { wealth: -4, culture: 6, happiness: 5 },
        factionEffects: { 'street-performers': 8, 'goblin-union': 6 },
        resultText: 'The Sewer Orchestra gets robes, rosin, and a season. Midnight concerts become a city treasure.',
      },
      {
        id: 'surface-venue',
        label: 'Build them a proper surface concert hall',
        effects: { wealth: -7, culture: 5, beauty: 4 },
        factionEffects: { 'street-performers': 5, nobles: 4 },
        outcomes: [
          {
            chance: 0.4,
            description: 'The music, it turns out, only worked in the drains. The hall now hosts a very good choir instead.',
            effects: { culture: 2, happiness: 2 },
          },
        ],
        resultText: 'A handsome hall rises. The orchestra performs there, missing the echo but enjoying the seats.',
      },
      {
        id: 'noise-complaint',
        label: 'Side with the midnight noise complaints',
        effects: { happiness: -3, culture: -4, chaos: 2 },
        factionEffects: { 'street-performers': -8, nobles: 4 },
        resultText: 'The concerts are silenced after eleven. The city sleeps soundly and dreams of music it can no longer hear.',
      },
    ],
  },
  {
    id: 'apologetic-monster',
    title: 'A Monster Has Moved In and Feels Awful About It',
    description:
      'A genuinely enormous creature has settled in a meadow just outside {city}. It has eaten three fences and one very surprised scarecrow, and it has been leaving anxious, beautifully lettered apology notes ever since.',
    tags: ['weird', 'nature', 'disaster'],
    weight: 9,
    minDay: 6,
    choices: [
      {
        id: 'befriend-monster',
        label: 'Send a delegation to befriend it',
        effects: { safety: 4, magic: 4, happiness: 3, wealth: -3 },
        factionEffects: { gardeners: 6, 'night-watch': 4 },
        outcomes: [
          {
            chance: 0.4,
            description: 'The monster now patrols the city border at night, apologizing to bandits as it removes them.',
            effects: { safety: 5, chaos: -3 },
          },
        ],
        resultText: 'The delegation returns with a friend the size of a barn and a stack of thank-you notes.',
      },
      {
        id: 'pay-fences',
        label: 'Compensate the farmers and let it be',
        effects: { wealth: -4, happiness: 3, trust: 3 },
        factionEffects: { workers: 4, gardeners: 4 },
        resultText: 'The farmers are paid; the monster is left in peace. It mows the meadow flat in gratitude.',
      },
      {
        id: 'drive-off-monster',
        label: 'Drive it away with the Night Watch',
        effects: { safety: -3, chaos: 5, happiness: -3 },
        factionEffects: { 'night-watch': 4, gardeners: -6 },
        outcomes: [
          {
            chance: 0.4,
            description: 'The monster left a final, heartbroken note. The meadow feels emptier than it should.',
            effects: { happiness: -4, beauty: -3 },
          },
        ],
        resultText: 'The creature is driven off. It goes quietly, apologizing the whole way.',
      },
    ],
  },
  {
    id: 'mysterious-benefactor',
    title: 'An Anonymous Benefactor Has Left {city} a Gift',
    description:
      'A crate has appeared on the steps of city hall, wrapped in ribbon and addressed simply "To the City, with affection". It is heavy, it is humming faintly, and there is no note explaining either.',
    tags: ['weird', 'economy', 'magic'],
    weight: 10,
    minDay: 5,
    choices: [
      {
        id: 'open-gift',
        label: 'Open the crate in a public ceremony',
        effects: { culture: 3, happiness: 4, magic: 2 },
        outcomes: [
          {
            chance: 0.5,
            description: 'Inside: a self-tending fountain that dispenses excellent coffee. The city weeps with joy.',
            effects: { wealth: 4, happiness: 4, beauty: 3 },
          },
          {
            chance: 0.25,
            description: 'Inside: a great many bees. Organized, friendly, civic-minded bees. The honey is extraordinary.',
            effects: { food: 4, chaos: 3, beauty: 2 },
          },
        ],
        resultText: 'The crate is opened to a held breath and a small drumroll provided by an eager child.',
      },
      {
        id: 'cautious-open',
        label: 'Have the mages open it carefully and privately',
        effects: { wealth: -2, magic: 3, safety: 3 },
        factionEffects: { mages: 5 },
        resultText: 'The mages open it behind wards. Whatever is inside, they pronounce it "lovely, and quite safe".',
      },
      {
        id: 'return-gift',
        label: 'Refuse the gift on principle',
        effects: { trust: 2, safety: 3, happiness: -3 },
        resultText: 'The crate is sent away unopened, to general disappointment and one official’s lasting regret.',
      },
    ],
  },
  {
    id: 'great-bake-off',
    title: 'The Bakers of {city} Have Declared War',
    description:
      'A rivalry between two beloved bakeries — one of them {citizen}\'s — has escalated into an all-out pastry arms race. The streets smell incredible. Tensions are high. Someone has weaponized a croissant.',
    tags: ['festival', 'economy', 'culture'],
    weight: 11,
    choices: [
      {
        id: 'official-contest',
        label: 'Channel it into an official baking contest',
        effects: { culture: 5, happiness: 6, wealth: 3 },
        factionEffects: { merchants: 6, 'street-performers': 4 },
        resultText: 'The Great Bake-Off becomes an instant institution. The croissant is retired with honors.',
      },
      {
        id: 'mediate-bakers',
        label: 'Mediate a truce between the bakeries',
        effects: { trust: 4, happiness: 3, chaos: -3 },
        resultText: 'The bakers shake hands and open a joint shop. The pastries are now collaborative and dangerous.',
      },
      {
        id: 'pick-side',
        label: 'Publicly endorse your favorite',
        effects: { happiness: 2, chaos: 4, trust: -2 },
        outcomes: [
          {
            chance: 0.4,
            description: 'The losing bakery has founded a rival district. With pastries. It is escalating deliciously.',
            effects: { chaos: 3, culture: 3 },
          },
        ],
        resultText: 'You declare a winner. Half the city celebrates; the other half boycotts your breakfast.',
      },
    ],
  },

  // -------------------------------------------------------------------------
  // MAYOR-PROJECT EVENTS — gated on a completed landmark (phase 03).
  // These only become eligible once the named project actually stands, so the
  // city's history resurfaces in its events. Plus one gentle, rare memo that
  // simply *suggests* building something — pure flavor, no pressure.
  // -------------------------------------------------------------------------
  {
    id: 'observatory-comet-watch',
    title: 'The Observatory Has Spotted Something',
    description:
      'The astronomers at the observatory have trained their great brass telescope on a smudge of light and cannot agree what it is. Half call it a comet of fortune; the other half call it "a smudge". They request a public viewing night either way.',
    tags: ['magic', 'culture'],
    weight: 9,
    condition: { requiresCompletedProjectId: 'starlit-observatory' },
    choices: [
      {
        id: 'host-viewing',
        label: 'Host a grand public viewing night',
        description: 'Blankets, hot cider, and a great deal of pointing upward.',
        effects: { culture: 5, happiness: 4, magic: 2 },
        factionEffects: { archivists: 8, 'street-performers': 5 },
        resultText: 'The whole city tilts its head back for an evening. The smudge waves back, possibly.',
      },
      {
        id: 'quiet-study',
        label: 'Let the scholars study it quietly first',
        effects: { magic: 4, culture: 2, trust: 2 },
        factionEffects: { archivists: 6, mages: 4 },
        resultText: 'The astronomers keep their vigil. They will tell you what it is, eventually, in a very long paper.',
      },
      {
        id: 'name-it',
        label: 'Name it after the city and move on',
        effects: { culture: 3, happiness: 2 },
        factionEffects: { nobles: 4 },
        resultText: 'The smudge is now officially "{city}\'s Star". It remains a smudge, but a patriotic one.',
      },
    ],
  },
  {
    id: 'bathhouse-summit',
    title: 'A Feud Is Being Settled at the Bathhouse',
    description:
      'Two guilds that have not spoken in years have, against all odds, ended up in the same warm pool at the bathhouse. Steam, it turns out, is a powerful diplomat. They are *this close* to an accord, and they would like a witness.',
    tags: ['culture', 'faction'],
    weight: 9,
    condition: { requiresCompletedProjectId: 'public-bathhouse' },
    choices: [
      {
        id: 'preside',
        label: 'Preside over the bathhouse accord in person',
        description: 'Bring a robe. Bring gravitas. Bring a robe.',
        effects: { trust: 5, happiness: 4, chaos: -3 },
        factionEffects: { workers: 8, merchants: 6 },
        resultText: 'The accord is signed on a damp towel and holds beautifully. Surface tension, resolved.',
      },
      {
        id: 'send-clerk',
        label: 'Send a clerk to formalize it',
        effects: { trust: 2, infrastructure: 2 },
        factionEffects: { workers: 3 },
        resultText: 'The clerk does an admirable job and is now, inexplicably, very relaxed about everything.',
      },
    ],
  },

  // -------------------------------------------------------------------------
  // AGE EVENTS (phase 04) — unlocked as the city grows up. Each age brings its
  // own brand of trouble: a village's first proper tavern brawl, a town's
  // charter pedantry, a city's bureaucracy achieving sentience. Plus the
  // wonder-council question itself (chain-only; queued by the engine the day
  // after the city enters the Wonder Age).
  // -------------------------------------------------------------------------
  {
    id: 'village-tavern-brawl',
    title: 'The Village’s First Proper Tavern Brawl',
    description:
      'It finally happened: a disagreement at the tavern in {district} about whose grandmother makes the better stew escalated into what witnesses proudly call "a real one, like in the songs". Two chairs are casualties. Everyone is weirdly delighted.',
    tags: ['culture', 'weird'],
    weight: 10,
    minAge: 'village',
    once: true,
    choices: [
      {
        id: 'mediate-stew',
        label: 'Settle it with a public stew tasting',
        description: 'Both grandmothers. One podium. No survivors among the doubters.',
        effects: { happiness: 5, culture: 4, wealth: -2 },
        factionEffects: { 'street-performers': 6 },
        resultText:
          'The tasting ends in a diplomatic tie and one new annual holiday. Both grandmothers are insufferable now, as is right.',
      },
      {
        id: 'fine-them',
        label: 'Fine everyone involved a chair',
        description: 'The tavern needs chairs. Justice can be practical.',
        effects: { safety: 3, trust: 2, happiness: -2 },
        resultText:
          'The tavern now has a "Brawl Corner" furnished entirely with confiscated chairs. It is the most popular corner.',
      },
      {
        id: 'commemorate',
        label: 'Commission a small plaque',
        description: 'Every village needs founding legends. This one has stew.',
        effects: { culture: 5, chaos: 2 },
        factionEffects: { archivists: 5 },
        resultText:
          'The plaque reads "On this spot, opinions were exchanged." Visitors photograph it daily.',
      },
    ],
  },
  {
    id: 'town-charter-dispute',
    title: 'The Town Charter Dispute',
    description:
      'Now that {city} is officially a Town, somebody actually read the new charter. Clause 12 names an "Official Town Bird" but the space after it is blank, and three factions have arrived with candidates. One of the candidates is, technically, a bat.',
    tags: ['faction', 'culture', 'weird'],
    weight: 10,
    minAge: 'town',
    once: true,
    choices: [
      {
        id: 'public-vote',
        label: 'Put it to a public vote',
        description: 'Democracy, but with feathers.',
        effects: { trust: 5, culture: 3, chaos: 2 },
        resultText:
          'After a spirited campaign season, the bat wins by a wing. The charter is amended to say "Bird (honorary)".',
      },
      {
        id: 'council-decides',
        label: 'Let the council pick something neutral',
        description: 'The pigeon is right there. It already acts elected.',
        effects: { trust: 2, infrastructure: 2, happiness: -2 },
        resultText:
          'The council selects the pigeon. The pigeon accepts the honor by stealing a sandwich at the ceremony.',
      },
      {
        id: 'leave-blank',
        label: 'Declare the blank space a tradition',
        description: 'Every town needs a mystery. Ours is ornithological.',
        effects: { culture: 4, magic: 2 },
        factionEffects: { archivists: 6 },
        resultText:
          'Clause 12 now officially reads "______ (beloved)". Scholars call it the most honest law ever written.',
      },
    ],
  },
  {
    id: 'city-bureaucracy',
    title: 'The Department of Departments',
    description:
      'With cityhood came paperwork, and with paperwork came the Department of Departments — founded to coordinate the other departments, which immediately required a Sub-Department of Coordination. They have requested a bigger office, in triplicate, with a form for requesting forms.',
    tags: ['economy', 'weird', 'infrastructure'],
    weight: 10,
    minAge: 'city',
    once: true,
    choices: [
      {
        id: 'streamline',
        label: 'Streamline the whole thing ruthlessly',
        description: 'One form. ONE.',
        effects: { infrastructure: 5, trust: 4, wealth: -3 },
        factionEffects: { engineers: 6, merchants: 5 },
        resultText:
          'The Great Simplification takes a week and produces one form, which fits on a card. Clerks weep with what is probably relief.',
      },
      {
        id: 'embrace-it',
        label: 'Fund it — order has its charms',
        description: 'Stamps for everyone. The good brass ones.',
        effects: { infrastructure: 3, chaos: -4, happiness: -2, wealth: -3 },
        factionEffects: { archivists: 8 },
        resultText:
          'The Department flourishes. Everything in {city} is now filed, including, somehow, the weather.',
      },
      {
        id: 'goblin-audit',
        label: 'Hire goblins to audit it',
        description: 'They find every loophole. Usually by living in it.',
        effects: { wealth: 4, chaos: 3, trust: 2 },
        factionEffects: { 'goblin-union': 10, archivists: -5 },
        resultText:
          'The goblin auditors recover a fortune in lost fees and one intern who had been filed under "Misc" since spring.',
      },
    ],
  },
  {
    id: 'wonder-pilgrim-influx',
    title: 'Pilgrims of the Wonder Age',
    description:
      'Word has spread that {city} has entered a Wonder Age, and travelers are arriving to see it with their own eyes — scholars, painters, one suspiciously well-dressed dragon enthusiast. The inns are full and the bakers are running drills.',
    tags: ['economy', 'culture'],
    weight: 9,
    minAge: 'wonder',
    choices: [
      {
        id: 'welcome-all',
        label: 'Throw the gates wide',
        description: 'A great city greets the world.',
        effects: { wealth: 5, culture: 4, housing: -3, chaos: 2 },
        factionEffects: { merchants: 8, 'street-performers': 6 },
        resultText:
          'The pilgrims spend generously and applaud everything, including a door. {city} has never felt so admired.',
      },
      {
        id: 'guided-tours',
        label: 'Organize official guided tours',
        description: 'Orderly wonder. Ticketed awe.',
        effects: { wealth: 3, trust: 3, culture: 2 },
        factionEffects: { archivists: 5 },
        resultText:
          'The tours run like clockwork. The guides’ script describes the city as "humble", which gets a laugh every time.',
      },
      {
        id: 'quiet-season',
        label: 'Politely cap the crowds for now',
        description: 'The city is for the citizens first.',
        effects: { happiness: 3, housing: 2, wealth: -2 },
        resultText:
          'A waiting list is established. Being on it becomes, instantly, fashionable.',
      },
    ],
  },
  {
    id: 'wonder-council',
    title: 'The Council Asks: What Wonder Shall We Raise?',
    description:
      'The council chamber is packed to the rafters. {city} has entered its Wonder Age, and the question on the table is the biggest one a city ever asks: what shall we build that outlives us all? Four proposals lie on the table, each with its own delegation holding its breath.',
    tags: ['wonder', 'culture'],
    weight: 0,
    chainOnly: true,
    choices: [
      {
        id: 'choose-garden',
        label: 'Raise the Great Garden',
        description: 'Terraces of green stacked to the sky — a living monument.',
        effects: { beauty: 3, happiness: 2 },
        factionEffects: { gardeners: 12 },
        startsWonderId: 'great-garden',
        resultText:
          'The gardeners’ delegation faints in relays. The Great Garden will rise — terrace by terrace, root by root.',
      },
      {
        id: 'choose-academy',
        label: 'Raise the Grand Academy',
        description: 'A dome of learning visible from three districts away.',
        effects: { culture: 3, magic: 2 },
        factionEffects: { archivists: 10, mages: 8 },
        startsWonderId: 'grand-academy',
        resultText:
          'The scholars immediately begin arguing about the library’s sorting system. The Grand Academy will rise.',
      },
      {
        id: 'choose-everforge',
        label: 'Raise the Everforge',
        description: 'A fire that never goes out, and a city that never stops making.',
        effects: { infrastructure: 3, wealth: 2 },
        factionEffects: { engineers: 12, workers: 8 },
        startsWonderId: 'everforge',
        resultText:
          'The engineers unroll blueprints longer than the council table. The Everforge will rise, and then it will never stop.',
      },
      {
        id: 'choose-festival',
        label: 'Raise the Festival Eternal',
        description: 'A celebration with no closing ceremony. Ever.',
        effects: { happiness: 3, culture: 2 },
        factionEffects: { 'street-performers': 12, merchants: 6 },
        startsWonderId: 'festival-eternal',
        resultText:
          'The street performers begin rehearsing on the spot. The Festival Eternal will rise — and it will never, ever end.',
      },
    ],
  },
];
