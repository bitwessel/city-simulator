import type { CityMood, CityStats } from '../types';

/**
 * Derive the city's visual mood from its stats. The renderer maps this to
 * lighting, sky color and ambient effects; the UI uses it for flavor.
 * Checked in priority order — the loudest problem wins.
 */
export function deriveCityMood(stats: CityStats): CityMood {
  if (stats.chaos > 70) return 'chaotic';
  if (stats.pollution > 65) return 'polluted';
  if (stats.magic > 75) return 'arcane';
  if (stats.happiness < 30 || stats.trust < 25) return 'declining';
  if (stats.happiness > 72 && stats.culture > 60) return 'festive';
  if (stats.happiness > 62 && stats.beauty > 58 && stats.wealth > 55) return 'thriving';
  if (stats.safety < 35 || stats.infrastructure < 30) return 'gritty';
  return 'serene';
}
