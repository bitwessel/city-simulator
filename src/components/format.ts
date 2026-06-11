import type { City, StatKey } from '../types';

// ---------------------------------------------------------------------------
// Small presentation helpers shared by the UI components. No game logic here:
// these only read existing city state to format it for display.
// ---------------------------------------------------------------------------

/** Compact human number: 1234 -> "1.2k", 950 -> "950". */
export function formatCount(n: number): string {
  const rounded = Math.round(n);
  if (Math.abs(rounded) >= 1_000_000) return `${(rounded / 1_000_000).toFixed(1)}M`;
  if (Math.abs(rounded) >= 1000) return `${(rounded / 1000).toFixed(1)}k`;
  return `${rounded}`;
}

/** "+5" / "-6" / "0", rounding to nearest integer. */
export function formatSigned(n: number): string {
  const r = Math.round(n);
  return r > 0 ? `+${r}` : `${r}`;
}

/**
 * Compare a stat to its value ~`lookback` days ago in city.history.
 * Returns the rounded delta (positive = increased). Falls back gracefully
 * when history is short or absent.
 */
export function statTrend(city: City, key: StatKey, lookback = 3): number {
  const history = city.history;
  if (!history || history.length < 2) return 0;
  const current = city.stats[key];
  // Find the latest snapshot at or before `lookback` days ago. If none qualify
  // (early game), `past` stays as the oldest snapshot we have.
  const targetDay = city.day - lookback;
  let past = history[0];
  for (const snap of history) {
    if (snap.day <= targetDay) past = snap;
    else break;
  }
  return Math.round(current - past.stats[key]);
}

/** Up/down/flat arrow glyph for a trend value. */
export function trendArrow(delta: number): string {
  if (delta > 0) return '▲';
  if (delta < 0) return '▼';
  return '–';
}

// A gentle, purely-cosmetic "season" cycle so the HUD has warm flavor next to
// the day counter. The simulation has no calendar, so we derive one from the
// day number (a season every ~12 days, looping through the year).
const SEASONS = [
  { label: 'Early Spring', icon: '🌱' },
  { label: 'High Spring', icon: '🌸' },
  { label: 'Early Summer', icon: '☀️' },
  { label: 'High Summer', icon: '🌻' },
  { label: 'Harvest', icon: '🍂' },
  { label: 'Late Autumn', icon: '🍁' },
  { label: 'First Frost', icon: '❄️' },
  { label: 'Deep Winter', icon: '⛄' },
] as const;

export function seasonFlavor(day: number): { label: string; icon: string } {
  const idx = Math.floor((Math.max(1, day) - 1) / 12) % SEASONS.length;
  return SEASONS[idx];
}
