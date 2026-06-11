import type { ActiveEvent, City, EventChoice } from '../types';
import { useGameStore } from '../state/store';
import { DISTRICT_TYPE_META, FACTION_META } from './statMeta';
import { EffectChips, buildEffectChips } from './EffectChips';

/** Build the preview chips for a single choice from its stat & faction effects. */
function effectChips(choice: EventChoice) {
  return buildEffectChips({
    effects: choice.effects,
    districtEffects: choice.districtEffects,
    factionEffects: choice.factionEffects,
    hasChance: (choice.outcomes?.length ?? 0) > 0,
  });
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
                <EffectChips chips={chips} />
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
