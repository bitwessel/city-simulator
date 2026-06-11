import type { FactionArchetype, StatKey } from '../types';
import { FACTION_META, deltaIsPositive, metaForStat } from './statMeta';
import { formatSigned } from './format';

// ---------------------------------------------------------------------------
// Shared effect-chip presentation. Originally the preview chips inside
// EventModal; extracted so the mayor-project commission flow shows the exact
// same little stat/faction pills (consistency was a phase-03 requirement).
// Pure presentation — it only reads effect data and renders pills.
// ---------------------------------------------------------------------------

export interface ChipData {
  label: string;
  good: boolean | null; // null = neutral
}

function chipClass(good: boolean | null): string {
  if (good === null) return 'chip chip--neutral';
  return good ? 'chip chip--good' : 'chip chip--bad';
}

/** District-level nudges; higher is good for mood, wealth and population alike. */
export interface DistrictNudges {
  mood?: number;
  wealth?: number;
  population?: number;
}

export interface EffectChipsInput {
  /** Bounded stats + population deltas. */
  effects?: Partial<Record<StatKey, number>>;
  /** Mood / wealth / population nudges to a district. */
  districtEffects?: DistrictNudges;
  /** Faction satisfaction deltas (higher = that faction is happier). */
  factionEffects?: Partial<Record<FactionArchetype, number>>;
  /** A chancy follow-up hangs in the air — adds an "uncertain outcome" chip. */
  hasChance?: boolean;
}

/** Build the preview chips for a bundle of effects (stats, district, factions). */
export function buildEffectChips(input: EffectChipsInput): ChipData[] {
  const chips: ChipData[] = [];

  // Bounded stats + population.
  for (const [k, v] of Object.entries(input.effects ?? {}) as [StatKey, number][]) {
    if (!v) continue;
    const meta = metaForStat(k);
    chips.push({
      label: `${meta.icon} ${meta.label} ${formatSigned(v)}`,
      good: deltaIsPositive(k, v),
    });
  }

  // District nudges (mood / wealth / population). Higher is good for all three.
  const de = input.districtEffects;
  if (de) {
    if (de.mood) chips.push({ label: `🏙️ Mood ${formatSigned(de.mood)}`, good: de.mood > 0 });
    if (de.wealth) chips.push({ label: `🏙️ Wealth ${formatSigned(de.wealth)}`, good: de.wealth > 0 });
    if (de.population)
      chips.push({ label: `🏙️ Pop ${formatSigned(de.population)}`, good: de.population > 0 });
  }

  // Faction satisfaction nudges (higher = that faction is happier).
  if (input.factionEffects) {
    for (const [arch, v] of Object.entries(input.factionEffects) as [FactionArchetype, number][]) {
      if (!v) continue;
      const meta = FACTION_META[arch];
      chips.push({ label: `${meta.icon} ${meta.label} ${formatSigned(v)}`, good: v > 0 });
    }
  }

  if (input.hasChance) {
    chips.push({ label: '🎲 Chance of consequences', good: null });
  }

  return chips;
}

/** Render a row of effect chips. Renders nothing when there are no effects. */
export function EffectChips({ chips }: { chips: ChipData[] }) {
  if (chips.length === 0) return null;
  return (
    <div className="choice__chips">
      {chips.map((c, i) => (
        <span key={i} className={chipClass(c.good)}>
          {c.label}
        </span>
      ))}
    </div>
  );
}
