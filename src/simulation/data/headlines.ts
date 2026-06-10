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
    text: 'Bakery in {district} unveils a bread so good two weddings were postponed.',
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
    text: 'Lost umbrella reunited with owner after three years and one minor prophecy.',
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
    text: 'Child in {district} asks excellent question; entire council quietly reconsiders policy.',
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
    text: 'Local cobbler repairs a boot so well it walks home by itself.',
    tone: 'good',
    weight: 8,
  },
  {
    text: 'Suggestion box outside city hall found full of compliments; officials deeply suspicious.',
    tone: 'neutral',
    weight: 8,
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
    condition: { maxStats: { wealth: 25 } },
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
    condition: { maxStats: { happiness: 30 } },
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
    condition: { maxStats: { food: 30 } },
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
    condition: { maxStats: { safety: 30 } },
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
    condition: { maxStats: { housing: 30 } },
  },
  {
    text: 'A pothole in {district} grows large enough to be issued its own street name.',
    tone: 'bad',
    weight: 10,
    condition: { maxStats: { infrastructure: 30 } },
  },
  {
    text: 'New roads in {city} so smooth that locals have taken up competitive strolling.',
    tone: 'good',
    weight: 9,
    condition: { minStats: { infrastructure: 75 } },
  },
];
