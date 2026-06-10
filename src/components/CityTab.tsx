import { useEffect, useState } from 'react';
import type { City } from '../types';
import { RISK_META } from './statMeta';
import { Meter } from './Meter';
import { formatCount } from './format';

function riskColor(level: number): string {
  if (level >= 60) return '#d97a6c';
  if (level >= 35) return '#e0b341';
  return '#7fb389';
}

function resourceTrend(trend: number): { arrow: string; color: string } {
  if (trend > 0.05) return { arrow: `▲ +${trend}`, color: '#7fb389' };
  if (trend < -0.05) return { arrow: `▼ ${trend}`, color: '#d97a6c' };
  return { arrow: '– steady', color: '#8a7d63' };
}

export function CityTab({ city }: { city: City }) {
  // Briefing starts expanded on day 1, collapses thereafter; the player can toggle.
  const [open, setOpen] = useState(city.day <= 1);
  // Re-open the briefing automatically when a brand new game starts on day 1.
  useEffect(() => {
    if (city.day <= 1) setOpen(true);
  }, [city.seed.raw, city.day]);

  return (
    <div>
      <section className="section">
        <div className="briefing">
          <button className="briefing__head" onClick={() => setOpen((v) => !v)}>
            <span>📜 Mayoral Briefing</span>
            <span className={`briefing__chevron${open ? ' briefing__chevron--open' : ''}`}>▶</span>
          </button>
          {open && <div className="briefing__body">{city.briefing}</div>}
        </div>
      </section>

      <section className="section">
        <h3 className="section__title">City Quirks</h3>
        {city.quirks.length === 0 ? (
          <p className="empty-note">A suspiciously ordinary city. For now.</p>
        ) : (
          city.quirks.map((q) => (
            <div className="card" key={q.id}>
              <p className="card__title">✨ {q.title}</p>
              <p className="card__desc">{q.description}</p>
            </div>
          ))
        )}
      </section>

      <section className="section">
        <h3 className="section__title">Resources</h3>
        {city.resources.length === 0 ? (
          <p className="empty-note">No resources of note. Concerning.</p>
        ) : (
          <div className="card">
            {city.resources.map((r) => {
              const t = resourceTrend(r.trend);
              return (
                <div className="resource-row" key={r.id}>
                  <span className="resource-row__name">{r.name}</span>
                  <span className="resource-row__amt">{formatCount(r.amount)}</span>
                  <span className="resource-row__trend" style={{ color: t.color }}>
                    {t.arrow}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="section">
        <h3 className="section__title">Active Risks</h3>
        {city.risks.length === 0 ? (
          <p className="empty-note">No looming threats. The council remains suspicious.</p>
        ) : (
          city.risks.map((risk) => {
            const meta = RISK_META[risk.kind];
            return (
              <div className="card" key={risk.kind}>
                <div className="risk__head">
                  <span className="risk__name">
                    {meta.icon} {meta.label}
                  </span>
                  <span className="risk__level">{Math.round(risk.level)}/100</span>
                </div>
                <Meter value={risk.level} color={riskColor(risk.level)} />
                <p className="card__desc" style={{ marginTop: 6 }}>
                  {risk.description}
                </p>
              </div>
            );
          })
        )}
      </section>
    </div>
  );
}
