import { useState } from 'react';
import type { City } from '../types';
import { MOOD_META, POPULATION_META, STAT_META } from './statMeta';
import { formatCount, formatSigned, seasonFlavor, statTrend, trendArrow } from './format';
import { CityVitals } from './CityVitals';
import { FAVOR_CAP, getFavor } from '../projects/projects';

interface VitalChipProps {
  icon: string;
  label: string;
  value: string;
  delta: number;
  /** Whether the delta is good news (drives arrow color), undefined = neutral. */
  deltaGood?: boolean;
  accent?: string;
}

/** A single friendly vital: icon + value + trend arrow. Number lives in tooltip. */
function VitalChip({ icon, label, value, delta, deltaGood, accent }: VitalChipProps) {
  const deltaClass =
    delta === 0 ? 'vital__trend--flat' : deltaGood ? 'vital__trend--up' : 'vital__trend--down';
  const deltaTitle =
    delta === 0 ? 'steady over the last few days' : `${formatSigned(delta)} vs ~3 days ago`;
  return (
    <div className="vital" title={`${label}: ${value} — ${deltaTitle}`}>
      <span className="vital__icon" style={accent ? { color: accent } : undefined}>
        {icon}
      </span>
      <span className="vital__body">
        <span className="vital__value">{value}</span>
        <span className="vital__label">{label}</span>
      </span>
      <span className={`vital__trend ${deltaClass}`} aria-hidden>
        {trendArrow(delta)}
      </span>
    </div>
  );
}

/**
 * City Favor: the slow-recharging resource spent on mayor projects. Shown as a
 * warm current/cap pill with a tooltip — no countdown, no pressure, just a
 * gentle "you have some saved up" cue.
 */
function FavorChip({ city }: { city: City }) {
  const favor = Math.floor(getFavor(city));
  const full = favor >= FAVOR_CAP;
  return (
    <div
      className="vital favor-chip"
      title={
        'City Favor — the goodwill you spend to commission projects. ' +
        'It recharges on its own, a little faster when the city loves you' +
        (full ? '. The coffers are brimming — go build something!' : '.')
      }
    >
      <span className="vital__icon favor-chip__icon" aria-hidden>
        ✦
      </span>
      <span className="vital__body">
        <span className="vital__value">
          {favor}
          <span className="favor-chip__cap">/{FAVOR_CAP}</span>
        </span>
        <span className="vital__label">Favor</span>
      </span>
    </div>
  );
}

export function TopBar({ city }: { city: City }) {
  const [vitalsOpen, setVitalsOpen] = useState(false);
  const mood = MOOD_META[city.mood];
  const season = seasonFlavor(city.day);

  const popDelta = statTrend(city, 'population');
  const happyDelta = statTrend(city, 'happiness');
  const wealthDelta = statTrend(city, 'wealth');

  return (
    <header className="topbar mm-panel mm-panel--gloss">
      <div className="topbar__identity">
        <span className="topbar__city">{city.name}</span>
        <span className="topbar__meta">
          <span className="topbar__season" title="A new season turns roughly every twelve days">
            {season.icon} {season.label}
          </span>
          <span className="topbar__dot">·</span>
          <span className="topbar__day">Day {city.day}</span>
        </span>
      </div>

      <div className="topbar__vitals">
        <VitalChip
          icon={POPULATION_META.icon}
          label="Folk"
          value={formatCount(city.stats.population)}
          delta={popDelta}
          deltaGood={popDelta > 0}
        />
        <VitalChip
          icon={STAT_META.wealth.icon}
          label="Wealth"
          value={`${Math.round(city.stats.wealth)}`}
          delta={wealthDelta}
          deltaGood={wealthDelta > 0}
          accent={STAT_META.wealth.color}
        />
        <VitalChip
          icon={STAT_META.happiness.icon}
          label="Mood"
          value={`${Math.round(city.stats.happiness)}`}
          delta={happyDelta}
          deltaGood={happyDelta > 0}
          accent={STAT_META.happiness.color}
        />
        <FavorChip city={city} />
      </div>

      <div className="topbar__right">
        <span
          className="mood-badge"
          style={{ color: mood.color, borderColor: `${mood.color}88`, background: `${mood.color}22` }}
          title={`The city feels ${mood.label.toLowerCase()}`}
        >
          <span className="mood-badge__icon">{mood.icon}</span>
          {mood.label}
        </span>
        <button
          className={`vitals-toggle${vitalsOpen ? ' vitals-toggle--open' : ''}`}
          onClick={() => setVitalsOpen((v) => !v)}
          aria-expanded={vitalsOpen}
          title="Open the full City Vitals"
        >
          <span className="vitals-toggle__icon">📊</span>
          <span className="vitals-toggle__label">City Vitals</span>
          <span className="vitals-toggle__chev">{vitalsOpen ? '▴' : '▾'}</span>
        </button>
      </div>

      {vitalsOpen && <CityVitals city={city} onClose={() => setVitalsOpen(false)} />}
    </header>
  );
}
