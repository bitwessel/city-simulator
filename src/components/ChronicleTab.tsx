import type { ChronicleEntry, ChronicleKind, City } from '../types';
import '../styles/chronicle.css';

// ---------------------------------------------------------------------------
// Per-kind glyph and accent colour — drives the spine bubbles on the timeline.
// ---------------------------------------------------------------------------

const KIND_ICON: Record<ChronicleKind, string> = {
  founding: '📜',
  'age-up': '⭐',
  district: '🏘️',
  disaster: '⚡',
  project: '🏗️',
  edict: '📣',
  event: '🗞️',
  ending: '🏆',
};

// ---------------------------------------------------------------------------
// Tiny SVG sparkline — pure inline SVG, no deps.
// Draws a polyline from an array of 0..100 values in a 140×28 viewBox.
// ---------------------------------------------------------------------------

function Sparkline({ values, color }: { values: number[]; color: string }) {
  if (values.length < 2) return null;

  const W = 140;
  const H = 28;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const points = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * W;
      const y = H - ((v - min) / range) * (H - 4) - 2;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <svg
      className="ctab__sparkline"
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.8"
        strokeLinejoin="round"
        strokeLinecap="round"
        opacity="0.7"
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Pick happiness values from city.history that bracket a chronicle entry's
// day — gives a small "mood at this moment" decoration. We sample at most
// 14 data points in a ±30-day window around the entry day.
// ---------------------------------------------------------------------------

function sparklineForEntry(
  entry: ChronicleEntry,
  history: City['history'],
): number[] | null {
  if (history.length < 4) return null;
  const radius = 30;
  const window = history.filter(
    (h) => h.day >= entry.day - radius && h.day <= entry.day + radius,
  );
  if (window.length < 3) return null;
  // Downsample to ~14 pts so the line isn't noisy.
  const step = Math.max(1, Math.floor(window.length / 14));
  return window.filter((_, i) => i % step === 0).map((h) => h.stats.happiness);
}

// ---------------------------------------------------------------------------
// Single timeline entry
// ---------------------------------------------------------------------------

function Entry({ entry, history }: { entry: ChronicleEntry; history: City['history'] }) {
  const icon = KIND_ICON[entry.kind];
  const spark = sparklineForEntry(entry, history);

  return (
    <li className={`ctab__entry ctab__entry--${entry.kind}`}>
      <div className="ctab__kind-icon" aria-label={entry.kind}>
        {icon}
      </div>
      <div className="ctab__day">Day {entry.day}</div>
      <h4 className="ctab__title">{entry.title}</h4>
      <p className="ctab__text">
        {entry.text}
        {(entry.districtName || entry.citizenName) && (
          <span className="ctab__ref">
            {' '}
            {[entry.districtName, entry.citizenName].filter(Boolean).join(' · ')}
          </span>
        )}
      </p>
      {spark && (
        <Sparkline values={spark} color="var(--mm-brass)" />
      )}
    </li>
  );
}

// ---------------------------------------------------------------------------
// The tab root
// ---------------------------------------------------------------------------

export function ChronicleTab({ city }: { city: City }) {
  const entries = city.chronicle;

  if (!entries || entries.length === 0) {
    return (
      <div className="ctab">
        <div className="ctab__empty">
          <span className="ctab__empty-glyph">📜</span>
          The chronicle awaits its first entry.<br />
          Great (and merely interesting) deeds will be recorded here as they unfold.
        </div>
      </div>
    );
  }

  // Newest first — easiest to reach and reads as a living document.
  const reversed = [...entries].reverse();

  return (
    <div className="ctab">
      <ol className="ctab__timeline" aria-label="City chronicle">
        {reversed.map((entry, i) => (
          <Entry
            key={`${entry.day}-${entry.kind}-${i}`}
            entry={entry}
            history={city.history}
          />
        ))}
      </ol>
    </div>
  );
}
