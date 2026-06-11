import type { City } from '../types';
import { useGameStore } from '../state/store';
import { FACTION_META } from './statMeta';
import { LabeledMeter } from './Meter';

function satisfactionColor(value: number): string {
  if (value < 25) return 'var(--mm-bad)';
  if (value < 45) return 'var(--mm-warn)';
  if (value > 60) return 'var(--mm-good)';
  return 'var(--mm-brass)';
}

export function FactionsTab({ city }: { city: City }) {
  const selectedFactionId = useGameStore((s) => s.selectedFactionId);
  const selectFaction = useGameStore((s) => s.selectFaction);

  return (
    <div>
      <section className="section">
        <h3 className="section__title">Factions ({city.factions.length})</h3>
        {city.factions.map((f) => {
          const meta = FACTION_META[f.archetype];
          const home = f.homeDistrictId
            ? city.districts.find((d) => d.id === f.homeDistrictId)
            : null;
          const isSel = f.id === selectedFactionId;
          return (
            <button
              key={f.id}
              className={`faction${isSel ? ' faction--selected' : ''}`}
              onClick={() => selectFaction(isSel ? null : f.id)}
            >
              <div className="faction__name">
                {meta.icon} {f.name}
                <span className="faction__arch">· {meta.label}</span>
              </div>
              <p className="faction__agenda">{f.agenda}</p>
              <p className="faction__flavor">“{f.flavor}”</p>
              <LabeledMeter label="Influence" value={f.influence} color="var(--mm-wood)" />
              <LabeledMeter
                label="Satisfaction"
                value={f.satisfaction}
                color={satisfactionColor(f.satisfaction)}
              />
              <p className="faction__home">🏠 Home: {home ? home.name : 'Nomadic'}</p>
            </button>
          );
        })}
      </section>
    </div>
  );
}
