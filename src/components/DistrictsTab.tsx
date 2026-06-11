import type { City, District } from '../types';
import { useGameStore } from '../state/store';
import { DISTRICT_TYPE_META, RISK_META } from './statMeta';
import { LabeledMeter, Meter } from './Meter';
import { formatCount } from './format';

function moodColor(mood: number): string {
  if (mood >= 60) return 'var(--mm-good)';
  if (mood >= 40) return 'var(--mm-warn)';
  return 'var(--mm-bad)';
}

function DistrictDetail({ city, district }: { city: City; district: District }) {
  const typeMeta = DISTRICT_TYPE_META[district.type];
  const dominant = district.dominantFactionId
    ? city.factions.find((f) => f.id === district.dominantFactionId)
    : null;
  const localRisks = (Object.entries(district.risks) as [keyof typeof district.risks, number][])
    .filter(([, level]) => level != null && level > 0)
    .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0));
  const builtCount = district.buildings.filter(
    (b) => b.appearAt <= district.development / 100,
  ).length;

  return (
    <div className="detail">
      <h3 className="detail__name">
        {typeMeta.icon} {district.name}
      </h3>
      <div className="detail__type">{typeMeta.label}</div>

      <div className="detail__grid">
        <div className="kv">
          <span className="kv__k">Population</span>
          <span className="kv__v">{formatCount(district.population)}</span>
        </div>
        <div className="kv">
          <span className="kv__k">Buildings</span>
          <span className="kv__v">
            {builtCount} / {district.buildings.length}
          </span>
        </div>
        <div className="kv">
          <span className="kv__k">Dominant Faction</span>
          <span className="kv__v">{dominant ? dominant.name : 'Contested / none'}</span>
        </div>
      </div>

      <LabeledMeter label="Wealth" value={district.wealth} color="var(--mm-honey)" />
      <LabeledMeter label="Mood" value={district.mood} color={moodColor(district.mood)} />
      <LabeledMeter label="Built up" value={district.development} color="var(--mm-brass)" />

      {district.quirks.length > 0 && (
        <p className="card__desc" style={{ margin: '8px 0' }}>
          {district.quirks.join(' · ')}
        </p>
      )}

      <h4 className="section__title" style={{ marginTop: 10 }}>
        Local Risks
      </h4>
      {localRisks.length === 0 ? (
        <p className="empty-note">Calm streets, for now.</p>
      ) : (
        localRisks.map(([kind, level]) => {
          const meta = RISK_META[kind as keyof typeof RISK_META];
          return (
            <div className="labeled-meter" key={kind}>
              <div className="labeled-meter__head">
                <span>
                  {meta.icon} {meta.label}
                </span>
                <span>{Math.round(level ?? 0)}</span>
              </div>
              <Meter
                value={level ?? 0}
                color={(level ?? 0) >= 60 ? 'var(--mm-bad)' : 'var(--mm-warn)'}
              />
            </div>
          );
        })
      )}
    </div>
  );
}

export function DistrictsTab({ city }: { city: City }) {
  const selectedDistrictId = useGameStore((s) => s.selectedDistrictId);
  const selectDistrict = useGameStore((s) => s.selectDistrict);
  const selected = selectedDistrictId
    ? city.districts.find((d) => d.id === selectedDistrictId)
    : null;

  return (
    <div>
      <section className="section">
        <h3 className="section__title">Districts ({city.districts.length})</h3>
        {city.districts.map((d) => {
          const typeMeta = DISTRICT_TYPE_META[d.type];
          const isSel = d.id === selectedDistrictId;
          return (
            <button
              key={d.id}
              className={`district-row${isSel ? ' district-row--selected' : ''}`}
              onClick={() => selectDistrict(isSel ? null : d.id)}
            >
              <div className="district-row__top">
                <span className="district-row__name">
                  {typeMeta.icon} {d.name}
                </span>
                <span className="district-row__type">{typeMeta.label}</span>
              </div>
              <div className="district-row__meta">
                <span>🧑 {formatCount(d.population)}</span>
                <span className="district-row__mood">
                  <Meter value={d.mood} color={moodColor(d.mood)} title={`Mood ${Math.round(d.mood)}`} />
                </span>
              </div>
            </button>
          );
        })}
      </section>

      {selected && <DistrictDetail city={city} district={selected} />}
    </div>
  );
}
