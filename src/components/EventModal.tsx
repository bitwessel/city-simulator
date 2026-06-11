import type { ActiveEvent, City, EventChoice, FactionArchetype, StatKey } from '../types';
import { useGameStore } from '../state/store';
import { DISTRICT_TYPE_META, FACTION_META, deltaIsPositive, metaForStat } from './statMeta';
import { formatSigned } from './format';

interface ChipData {
  label: string;
  good: boolean | null; // null = neutral
}

function chipClass(good: boolean | null): string {
  if (good === null) return 'chip chip--neutral';
  return good ? 'chip chip--good' : 'chip chip--bad';
}

/** Build the preview chips for a single choice from its stat & faction effects. */
function effectChips(choice: EventChoice): ChipData[] {
  const chips: ChipData[] = [];

  // Bounded stats + population.
  const effects = choice.effects ?? {};
  for (const [k, v] of Object.entries(effects) as [StatKey, number][]) {
    if (!v) continue;
    const meta = metaForStat(k);
    chips.push({
      label: `${meta.icon} ${meta.label} ${formatSigned(v)}`,
      good: deltaIsPositive(k, v),
    });
  }

  // District nudges (mood / wealth / population). Higher is good for all three.
  if (choice.districtEffects) {
    const de = choice.districtEffects;
    if (de.mood) chips.push({ label: `🏙️ Mood ${formatSigned(de.mood)}`, good: de.mood > 0 });
    if (de.wealth) chips.push({ label: `🏙️ Wealth ${formatSigned(de.wealth)}`, good: de.wealth > 0 });
    if (de.population)
      chips.push({ label: `🏙️ Pop ${formatSigned(de.population)}`, good: de.population > 0 });
  }

  // Faction satisfaction nudges (higher = that faction is happier).
  if (choice.factionEffects) {
    for (const [arch, v] of Object.entries(choice.factionEffects) as [FactionArchetype, number][]) {
      if (!v) continue;
      const meta = FACTION_META[arch];
      chips.push({ label: `${meta.icon} ${meta.label} ${formatSigned(v)}`, good: v > 0 });
    }
  }

  // A chancy follow-up hangs in the air — flag it as an uncertain outcome.
  if (choice.outcomes && choice.outcomes.length > 0) {
    chips.push({ label: '🎲 Chance of consequences', good: null });
  }

  return chips;
}

export function EventModal({ city, event }: { city: City; event: ActiveEvent }) {
  const chooseEventOption = useGameStore((s) => s.chooseEventOption);
  const closeEvent = useGameStore((s) => s.closeEvent);

  const district = event.districtId
    ? city.districts.find((d) => d.id === event.districtId)
    : null;
  const faction = event.factionId
    ? city.factions.find((f) => f.id === event.factionId)
    : null;

  return (
    <div className="modal-backdrop" onClick={closeEvent}>
      <div
        className="memo mm-parchment-surface"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="memo__seal" aria-hidden title="Sealed by the city council">
          ✦
        </span>
        <span className="memo__stamp">Day {event.day}</span>
        <div className="memo__kicker">Council Memorandum</div>
        <h2 className="memo__title">{event.title}</h2>

        {(district || faction) && (
          <p className="memo__involves">
            {district && (
              <>
                Concerns{' '}
                <strong>
                  {DISTRICT_TYPE_META[district.type].icon} {district.name}
                </strong>
              </>
            )}
            {district && faction && ' · '}
            {faction && (
              <>
                Petitioned by{' '}
                <strong>
                  {FACTION_META[faction.archetype].icon} {faction.name}
                </strong>
              </>
            )}
          </p>
        )}

        <p className="memo__desc">{event.description}</p>

        <div className="memo__choices mm-scroll">
          {event.choices.map((choice) => {
            const chips = effectChips(choice);
            return (
              <button
                key={choice.id}
                className="choice"
                onClick={() => chooseEventOption(choice.id)}
              >
                <div className="choice__label">{choice.label}</div>
                {choice.description && <div className="choice__desc">{choice.description}</div>}
                {chips.length > 0 && (
                  <div className="choice__chips">
                    {chips.map((c, i) => (
                      <span key={i} className={chipClass(c.good)}>
                        {c.label}
                      </span>
                    ))}
                  </div>
                )}
              </button>
            );
          })}
        </div>

        <button
          className="memo__later"
          onClick={closeEvent}
          title="Close the memo — it stays in your tray until it lapses"
        >
          Decide later
        </button>
      </div>
    </div>
  );
}
