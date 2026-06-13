import type { HeadlineTemplate } from '../../types';

// Minor flavor headlines, rolled on quiet days. Tokens {city}, {district}
// and {faction} are resolved by the engine. Conditions gate stat-specific
// headlines so high-pollution cities get smog jokes, etc.

export const HEADLINE_POOL: HeadlineTemplate[] = [
  // ----- Unconditioned whimsy -------------------------------------------------
  {
    text: 'Local pigeon delivers tax forms to the wrong district. Again.',
    tone: 'weird',
    weight: 10,
  },
  {
    text: '{citizen} of {district} unveils a bread so good two weddings were postponed.',
    tone: 'good',
    weight: 10,
  },
  {
    text: 'Council of {city} debates official spelling of "{city}" for fourth straight week.',
    tone: 'neutral',
    weight: 9,
  },
  {
    text: 'Cat declared honorary alderman of {district}; promises nothing, delivers less.',
    tone: 'weird',
    weight: 9,
  },
  {
    text: '{citizen} is reunited with a lost umbrella after three years and one minor prophecy.',
    tone: 'good',
    weight: 8,
  },
  {
    text: '{faction} hold meeting; minutes describe it as "tense but ultimately about snacks".',
    tone: 'neutral',
    weight: 9,
  },
  {
    text: 'A duck has been elected to lead the queue at the {district} fountain. Nobody objects.',
    tone: 'weird',
    weight: 8,
  },
  {
    text: 'Festival committee announces festival to celebrate the success of last festival.',
    tone: 'neutral',
    weight: 9,
  },
  {
    text: 'Statue in {district} caught winking; historians "investigating, cautiously".',
    tone: 'weird',
    weight: 8,
  },
  {
    text: '{citizen} of {district} asks an excellent question; the entire council quietly reconsiders policy.',
    tone: 'good',
    weight: 8,
  },
  {
    text: 'Town crier loses voice; news delivered today via interpretive dance. Reviews mixed.',
    tone: 'weird',
    weight: 8,
  },
  {
    text: 'Beloved tavern in {district} renames itself for the third time this season.',
    tone: 'neutral',
    weight: 9,
  },
  {
    text: 'A small, well-organized parade passes through {district}; nobody knows what it celebrates.',
    tone: 'weird',
    weight: 8,
  },
  {
    text: '{citizen} repairs a boot so well it walks home by itself.',
    tone: 'good',
    weight: 8,
  },
  {
    text: 'Suggestion box outside city hall found full of compliments; officials deeply suspicious.',
    tone: 'neutral',
    weight: 8,
  },
  {
    text: 'A wheel of cheese in {district} has been placed under gentle observation. It has done nothing wrong yet.',
    tone: 'weird',
    weight: 8,
  },
  {
    text: 'Two rival knitting circles in {district} merge after a heartfelt and slightly tearful summit.',
    tone: 'good',
    weight: 8,
  },
  {
    text: '{faction} pass a motion thanking the weather for "a really very acceptable week".',
    tone: 'neutral',
    weight: 8,
  },
  {
    text: 'A revolution is declared in {district} and politely concluded by teatime; demands met, biscuits shared.',
    tone: 'weird',
    weight: 7,
  },
  {
    text: 'Elderly tortoise of {district} completes its annual lap of the square; crowd moved to quiet applause.',
    tone: 'good',
    weight: 8,
  },
  {
    text: 'Map-makers of {city} add a new shortcut; three families promptly get lost in delightful new ways.',
    tone: 'neutral',
    weight: 8,
  },
  {
    text: '{citizen} is strongly suspected of leaving soup on doorsteps across {district}. Investigations have been quietly abandoned.',
    tone: 'good',
    weight: 8,
  },
  {
    text: 'The {city} library reports its overdue books are "coming home slowly, like geese".',
    tone: 'neutral',
    weight: 8,
  },
  {
    text: 'A goblin in {district} files paperwork to officially adopt a very large, very confused goose.',
    tone: 'weird',
    weight: 8,
  },
  {
    text: 'Neighbours in {district} spend the afternoon repainting a fence together for no reason anyone can name.',
    tone: 'good',
    weight: 8,
  },
  {
    text: 'Town clock in {district} runs four minutes fast; residents agree to simply be four minutes early forever.',
    tone: 'weird',
    weight: 7,
  },

  // ----- Pollution ------------------------------------------------------------
  {
    text: 'Smog over {city} now thick enough to lean on, residents report.',
    tone: 'bad',
    weight: 12,
    condition: { minStats: { pollution: 65 } },
  },
  {
    text: 'Air in {district} so murky that lanterns are now lit at noon, for company.',
    tone: 'bad',
    weight: 10,
    condition: { minStats: { pollution: 75 } },
  },
  {
    text: 'The air over {city} is crisp and clear; visiting birds extend their stay.',
    tone: 'good',
    weight: 10,
    condition: { maxStats: { pollution: 25 } },
  },

  // ----- Chaos ----------------------------------------------------------------
  {
    text: 'Three separate riots in {district} merge, hold vote, disband over disagreement on snacks.',
    tone: 'bad',
    weight: 11,
    condition: { minStats: { chaos: 65 } },
  },
  {
    text: 'Order reigns in {city}; the most exciting event today was a very tidy queue.',
    tone: 'good',
    weight: 9,
    condition: { maxStats: { chaos: 20 } },
  },

  // ----- Magic ----------------------------------------------------------------
  {
    text: 'Three houses in {district} float gently above their foundations; tenants unbothered.',
    tone: 'weird',
    weight: 11,
    condition: { minStats: { magic: 70 } },
  },
  {
    text: 'Cats in {city} reported walking on ceilings; residents adjust expectations downward.',
    tone: 'weird',
    weight: 10,
    condition: { minStats: { magic: 80 } },
  },
  {
    text: 'Local wizard complains spells "just don’t feel like working" lately.',
    tone: 'neutral',
    weight: 9,
    condition: { maxStats: { magic: 20 } },
  },

  // ----- Beauty ---------------------------------------------------------------
  {
    text: '{city} declared "almost unbearably picturesque" by visiting painters.',
    tone: 'good',
    weight: 10,
    condition: { minStats: { beauty: 70 } },
  },
  {
    text: 'Visitor describes {district} as "characterful", which everyone knows means ugly.',
    tone: 'bad',
    weight: 9,
    condition: { maxStats: { beauty: 25 } },
  },

  // ----- Wealth ---------------------------------------------------------------
  {
    text: 'Merchants in {district} report profits so high they have run out of jars.',
    tone: 'good',
    weight: 10,
    condition: { minStats: { wealth: 75 } },
  },
  {
    text: 'Local economy described as "frugal" by optimists and "broke" by everyone else.',
    tone: 'bad',
    weight: 10,
    condition: { maxStats: { wealth: 22 } },
  },

  // ----- Happiness ------------------------------------------------------------
  {
    text: 'Citizens of {city} caught smiling for no reason; officials baffled but pleased.',
    tone: 'good',
    weight: 10,
    condition: { minStats: { happiness: 75 } },
  },
  {
    text: 'A general air of glumness settles over {district}; even the dogs seem pensive.',
    tone: 'bad',
    weight: 10,
    condition: { maxStats: { happiness: 22 } },
  },

  // ----- Food -----------------------------------------------------------------
  {
    text: 'Granaries in {city} so full that mice have filed a formal complaint about clutter.',
    tone: 'good',
    weight: 9,
    condition: { minStats: { food: 75 } },
  },
  {
    text: 'Bread prices in {district} climb again; loaves now sold by the slice and the sigh.',
    tone: 'bad',
    weight: 11,
    condition: { maxStats: { food: 22 } },
  },

  // ----- Safety ---------------------------------------------------------------
  {
    text: 'Night Watch in {district} reports a "boring shift", their highest possible praise.',
    tone: 'good',
    weight: 9,
    condition: { minStats: { safety: 75 } },
  },
  {
    text: 'Pickpockets in {district} announce a customer loyalty program; the Watch is not amused.',
    tone: 'bad',
    weight: 10,
    condition: { maxStats: { safety: 22 } },
  },

  // ----- Trust ----------------------------------------------------------------
  {
    text: 'Citizens leave doors unlocked and ledgers open; trust in {city} runs unusually high.',
    tone: 'good',
    weight: 9,
    condition: { minStats: { trust: 75 } },
  },
  {
    text: 'Three new secret societies form in {district} to investigate the other secret societies.',
    tone: 'weird',
    weight: 10,
    condition: { maxStats: { trust: 30 } },
  },

  // ----- Culture --------------------------------------------------------------
  {
    text: '{district} hosts its ninth poetry duel of the month; the runner-up wept beautifully.',
    tone: 'good',
    weight: 9,
    condition: { minStats: { culture: 70 } },
  },

  // ----- Housing & infrastructure ---------------------------------------------
  {
    text: 'Family in {district} reportedly subletting a stairwell; landlord calls it "cozy".',
    tone: 'bad',
    weight: 10,
    condition: { maxStats: { housing: 22 } },
  },
  {
    text: 'A pothole in {district} grows large enough to be issued its own street name.',
    tone: 'weird',
    weight: 9,
    condition: { maxStats: { infrastructure: 35 } },
  },
  {
    text: 'Half the lanterns in {district} have gone dark and the bridges are held up mostly by optimism.',
    tone: 'bad',
    weight: 10,
    condition: { maxStats: { infrastructure: 22 } },
  },
  {
    text: 'New roads in {city} so smooth that locals have taken up competitive strolling.',
    tone: 'good',
    weight: 9,
    condition: { minStats: { infrastructure: 75 } },
  },

  // ----- Completed mayor-project landmarks ------------------------------------
  // Gated on a finished project so the headline only appears once the landmark
  // actually stands. Tone weights kept modest so they don't crowd the feed.
  {
    text: 'The fountain in {city} has been adopted by a colony of ducks who now charge a toll in breadcrumbs.',
    tone: 'good',
    weight: 7,
    condition: { requiresCompletedProjectId: 'fountain-plaza' },
  },
  {
    text: 'Visitors to the Whispering Grove report the trees are "definitely talking about us", and seem flattered.',
    tone: 'weird',
    weight: 7,
    condition: { requiresCompletedProjectId: 'whispering-grove' },
  },
  {
    text: 'The lighthouse keeper of {city} files a report reading simply: "All ships home. Lovely evening."',
    tone: 'good',
    weight: 7,
    condition: { requiresCompletedProjectId: 'harbor-lighthouse' },
  },
  {
    text: 'Scholars at the observatory announce the discovery of a new star; it turns out to be a very high lantern, but spirits remain high.',
    tone: 'good',
    weight: 6,
    condition: { requiresCompletedProjectId: 'starlit-observatory' },
  },
  {
    text: 'The bathhouse in {city} has settled three lawsuits, one feud, and a marriage proposal this week, all before noon.',
    tone: 'good',
    weight: 7,
    condition: { requiresCompletedProjectId: 'public-bathhouse' },
  },
  {
    text: 'The philosophical goat at the menagerie has refused another interview, deepening its mystique and its fan club.',
    tone: 'weird',
    weight: 6,
    condition: { requiresCompletedProjectId: 'curious-menagerie' },
  },
  {
    text: 'The moondial of {city} read the wrong time last night; the mages insist the moon was simply early.',
    tone: 'weird',
    weight: 6,
    condition: { requiresCompletedProjectId: 'great-moondial' },
  },

  // ----- Age-flavored headlines (phase 04) -------------------------------------
  // Gated on the city's age so the feed grows up with the skyline: village
  // pride, town bustle, city sophistication, wonder-age awe.
  {
    text: 'A traveling merchant calls {city} "a proper village now"; the compliment is framed and hung in the tavern.',
    tone: 'good',
    weight: 8,
    minAge: 'village',
  },
  {
    text: 'The new timber houses of {district} smell so pleasantly of cedar that walking tours have formed unprompted.',
    tone: 'good',
    weight: 7,
    minAge: 'village',
  },
  {
    text: 'Town status has gone to the pigeons of {city}; witnesses report they now queue for fountains.',
    tone: 'weird',
    weight: 7,
    minAge: 'town',
  },
  {
    text: 'The stonemasons of {district} have run out of things to pave and are eyeing the river speculatively.',
    tone: 'neutral',
    weight: 7,
    minAge: 'town',
  },
  {
    text: '{city} now has rush hour. Opinions are divided on whether this counts as progress, but everyone is in the queue to discuss it.',
    tone: 'neutral',
    weight: 7,
    minAge: 'city',
  },
  {
    text: 'A visiting dignitary calls {city} "a true city at last", then gets lost for five hours. The council takes both as compliments.',
    tone: 'good',
    weight: 7,
    minAge: 'city',
  },
  {
    text: 'Lantern-lighters of {district} unionize, citing "more lanterns than stars these days". Demands include taller ladders and shorter poems.',
    tone: 'weird',
    weight: 6,
    minAge: 'city',
  },
  {
    text: 'Cartographers redraw the regional map with {city} in larger letters. The neighboring towns pretend not to notice.',
    tone: 'good',
    weight: 7,
    minAge: 'wonder',
  },
  {
    text: 'A bard arrives in {city} to write the definitive ballad of the Wonder Age, and is immediately scooped by three local children with a drum.',
    tone: 'weird',
    weight: 6,
    minAge: 'wonder',
  },
];
