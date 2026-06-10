import type { CityOutcome } from '../types';
import { useGameStore } from '../state/store';
import { OUTCOME_KIND_ICON, OUTCOME_TONE_COLOR } from './statMeta';

export function OutcomeOverlay({ outcome }: { outcome: CityOutcome }) {
  const dismissOutcome = useGameStore((s) => s.dismissOutcome);
  const color = OUTCOME_TONE_COLOR[outcome.tone];
  const icon = OUTCOME_KIND_ICON[outcome.kind];

  return (
    <div className="outcome-overlay">
      <div className="outcome-banner" style={{ borderColor: color }}>
        <div className="outcome-banner__icon">{icon}</div>
        <div className="outcome-banner__kicker" style={{ color }}>
          The City's Story Ends — Day {outcome.day}
        </div>
        <h2 className="outcome-banner__title" style={{ color }}>
          {outcome.title}
        </h2>
        <button className="mm-btn mm-btn--brass" onClick={dismissOutcome}>
          See the chronicle →
        </button>
      </div>
    </div>
  );
}
