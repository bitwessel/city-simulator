import { useEffect } from 'react';
import type { BoundedStatKey, City } from '../types';
import { STAT_DISPLAY_ORDER, STAT_META } from './statMeta';
import { formatSigned, statTrend, trendArrow } from './format';

/** Friendly word for where a 0..100 stat sits, by polarity. */
function statWord(key: BoundedStatKey, value: number): string {
  const polarity = STAT_META[key].polarity;
  // For "bad" stats a high value is alarming; flip the wording.
  const v = polarity === 'bad' ? 100 - value : value;
  if (v >= 80) return polarity === 'bad' ? 'Calm' : 'Glorious';
  if (v >= 62) return polarity === 'bad' ? 'Settled' : 'Healthy';
  if (v >= 42) return 'Fair';
  if (v >= 24) return polarity === 'bad' ? 'Rising' : 'Strained';
  return polarity === 'bad' ? 'Severe' : 'Dire';
}

/**
 * The expandable City Vitals popover: the full twelve-stat grid with soft
 * meters, friendly words, trend arrows, and exact numbers in the tooltip.
 * Lives behind the "City Vitals" toggle in the top bar to keep the HUD calm.
 */
export function CityVitals({ city, onClose }: { city: City; onClose: () => void }) {
  // Esc closes the drawer.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="vitals-pop mm-panel mm-panel--gloss" role="dialog" aria-label="City vitals">
      <div className="vitals-pop__head">
        <h3 className="vitals-pop__title">City Vitals</h3>
        <button className="vitals-pop__close" onClick={onClose} aria-label="Close vitals">
          ✕
        </button>
      </div>
      <div className="vitals-grid">
        {STAT_DISPLAY_ORDER.map((key) => {
          const meta = STAT_META[key];
          const value = city.stats[key];
          const rounded = Math.round(value);
          const delta = statTrend(city, key);
          const deltaGood = meta.polarity === 'bad' ? delta < 0 : delta > 0;
          const deltaClass =
            delta === 0 ? 'vstat__trend--flat' : deltaGood ? 'vstat__trend--up' : 'vstat__trend--down';
          const pct = Math.max(0, Math.min(100, value));
          return (
            <div
              className={`vstat${meta.polarity === 'weird' ? ' vstat--weird' : ''}`}
              key={key}
              title={`${meta.label}: ${rounded}/100${
                delta === 0 ? '' : ` (${formatSigned(delta)} vs ~3 days ago)`
              }`}
            >
              <div className="vstat__head">
                <span className="vstat__name">
                  <span className="vstat__icon">{meta.icon}</span>
                  {meta.label}
                </span>
                <span className={`vstat__trend ${deltaClass}`}>
                  {trendArrow(delta)}
                  {delta === 0 ? '' : ` ${formatSigned(delta)}`}
                </span>
              </div>
              <div className="mm-meter vstat__meter">
                <div
                  className="mm-meter__fill"
                  style={{ width: `${pct}%`, background: meta.color }}
                />
              </div>
              <div className="vstat__foot">
                <span className="vstat__word">{statWord(key, value)}</span>
                <span className="vstat__num">{rounded}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
