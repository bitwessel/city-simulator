import type { EdictDef } from '../../types';

// The standing-edict catalog. Each city can have at most one active edict at a
// time; switching carries a soft cooldown so the mechanic is a posture, not a
// spam lever.

export const EDICT_POOL: EdictDef[] = [
  {
    id: 'festival-season',
    name: 'Festival Season',
    proclamation:
      'By proclamation of the Mayor, {city} declares a Festival Season. Bunting is to be hung, lanterns lit, and at least one goose is to be solemnly crowned. Productivity is now optional; merriment is not.',
    blurb: 'Happiness and culture rise; the treasury takes a gentle hit.',
    dailyEffects: { happiness: 0.3, culture: 0.2, wealth: -0.2 },
    eventTagBias: { festival: 1.8, culture: 1.3 },
    factionReactions: { 'street-performers': 12, merchants: 4, nobles: -4 },
    visual: { prop: 'lanterns', paletteLean: '#ffc890' },
  },
  {
    id: 'conservation-drive',
    name: 'Conservation Drive',
    proclamation:
      'By order of the Mayor, {city} enters a Conservation Drive. Trees are not to be argued with. Hedgerows have rights. Composting is encouraged, and the river has asked for a moment of your time.',
    blurb: 'Beauty blooms and pollution eases; commerce slows a little.',
    dailyEffects: { beauty: 0.3, pollution: -0.3, wealth: -0.1 },
    eventTagBias: { nature: 1.6 },
    factionReactions: { gardeners: 12, engineers: -4, merchants: -4 },
    visual: { prop: 'planters', paletteLean: '#bfe0c4' },
  },
  {
    id: 'trade-push',
    name: 'Trade Push',
    proclamation:
      'The Mayor hereby declares a Trade Push. Merchants are encouraged to trade vigorously. Caravans shall be waved through, paperwork expedited, and the toll-bridge argument resolved in favour of commerce. Briefly.',
    blurb: 'Wealth flows in; a touch of chaos comes along for the ride.',
    dailyEffects: { wealth: 0.3, chaos: 0.2 },
    eventTagBias: { economy: 1.7 },
    factionReactions: { merchants: 12, gardeners: -6, 'night-watch': -3 },
    visual: { prop: 'crates', paletteLean: '#d4a24e' },
  },
  {
    id: 'quiet-rebuilding',
    name: 'Quiet Rebuilding',
    proclamation:
      'The Mayor calls for a season of Quiet Rebuilding. The scaffolding will go up, the hammers will ring at reasonable hours, and the bridges will be fixed before anyone else falls through one. Culture can wait.',
    blurb: 'Infrastructure and safety improve; the arts take a breather.',
    dailyEffects: { infrastructure: 0.3, safety: 0.2, culture: -0.1 },
    eventTagBias: { infrastructure: 1.5 },
    factionReactions: { engineers: 12, workers: 6, 'street-performers': -6 },
    visual: { prop: 'scaffolds', paletteLean: '#cdd4cf' },
  },
  {
    id: 'arcane-studies',
    name: 'Arcane Studies',
    proclamation:
      'By mayoral decree, {city} enters a period of Arcane Studies. The academies are to be generously funded, the strange lights over the north quarter investigated rather than ignored, and all glowing cats reported (but not interfered with). Safety briefings will be provided.',
    blurb: 'Magic and culture deepen; safety relaxes somewhat.',
    dailyEffects: { magic: 0.3, culture: 0.1, safety: -0.1 },
    eventTagBias: { magic: 1.6, weird: 1.2 },
    factionReactions: { mages: 12, archivists: 6, 'night-watch': -4 },
    visual: { prop: 'lanterns', paletteLean: '#b1a6e4' },
  },
];
