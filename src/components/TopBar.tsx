import type { City } from '../types';
import { MOOD_META, STAT_DISPLAY_ORDER, STAT_META, POPULATION_META } from './statMeta';
import { formatCount, formatSigned, statTrend, trendArrow } from './format';

interface StatChipProps {
  icon: string;
  label: string;
  value: string;
  delta: number;
  /** Whether the delta is good news (drives arrow color), undefined = neutral. */
  deltaGood?: boolean;
  weird?: boolean;
  pop?: boolean;
}

function StatChip({ icon, label, value, delta, deltaGood, weird, pop }: StatChipProps) {
  const deltaClass =
    delta === 0
      ? 'statchip__delta--flat'
      : deltaGood
        ? 'statchip__delta--up'
        : 'statchip__delta--down';
  const deltaTitle =
    delta === 0 ? 'no change vs ~3 days ago' : `${formatSigned(delta)} vs ~3 days ago`;
  return (
    <div
      className={`statchip${weird ? ' statchip--weird' : ''}${pop ? ' statchip--pop' : ''}`}
      title={`${label} — ${deltaTitle}`}
    >
      <span className="statchip__icon">{icon}</span>
      <span className="statchip__body">
        <span className="statchip__value">{value}</span>
        <span className={`statchip__delta ${deltaClass}`}>
          {trendArrow(delta)} {delta === 0 ? '' : formatSigned(delta)}
        </span>
      </span>
    </div>
  );
}

export function TopBar({ city }: { city: City }) {
  const mood = MOOD_META[city.mood];
  const popDelta = statTrend(city, 'population');

  return (
    <header className="topbar mm-panel">
      <div className="topbar__identity">
        <span className="topbar__city">{city.name}</span>
        <span className="topbar__tagline">{city.tagline}</span>
      </div>

      <div className="topbar__center">
        <div className="topbar__day">
          <span className="topbar__day-num">{city.day}</span>
          <span className="topbar__day-label">Day</span>
        </div>
        <span
          className="mood-badge"
          style={{ color: mood.color, borderColor: mood.color, background: `${mood.color}22` }}
          title={`City mood: ${mood.label}`}
        >
          <span className="mood-badge__icon">{mood.icon}</span>
          {mood.label}
        </span>
      </div>

      <div className="statstrip">
        <StatChip
          pop
          icon={POPULATION_META.icon}
          label={POPULATION_META.label}
          value={formatCount(city.stats.population)}
          delta={popDelta}
          deltaGood={popDelta > 0}
        />
        {STAT_DISPLAY_ORDER.map((key) => {
          const meta = STAT_META[key];
          const delta = statTrend(city, key);
          // Good news = delta improves the city. For "bad" stats, down is good.
          const deltaGood = meta.polarity === 'bad' ? delta < 0 : delta > 0;
          return (
            <StatChip
              key={key}
              icon={meta.icon}
              label={meta.label}
              value={`${Math.round(city.stats[key])}`}
              delta={delta}
              deltaGood={deltaGood}
              weird={meta.polarity === 'weird'}
            />
          );
        })}
      </div>
    </header>
  );
}
