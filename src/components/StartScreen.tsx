import { useState } from 'react';
import { useGameStore } from '../state/store';
import '../styles/start.css';

/** A handful of drifting lanterns, each with randomized timing/offset. */
const LANTERNS = [
  { left: '12%', delay: 0, dur: 17, drift: 30 },
  { left: '28%', delay: 6, dur: 21, drift: -24 },
  { left: '45%', delay: 11, dur: 19, drift: 18 },
  { left: '63%', delay: 3, dur: 23, drift: -34 },
  { left: '79%', delay: 9, dur: 18, drift: 22 },
  { left: '90%', delay: 14, dur: 25, drift: -16 },
];

export function StartScreen() {
  const beginFounding = useGameStore((s) => s.beginFounding);
  const [seed, setSeed] = useState('');

  const create = () => beginFounding(seed);

  return (
    <div className="start">
      <div className="start__stars" />
      <div className="start__stars start__stars--slow" />
      {LANTERNS.map((l, i) => (
        <div
          key={i}
          className="start__lantern"
          style={{
            left: l.left,
            animationDelay: `${l.delay}s`,
            animationDuration: `${l.dur}s`,
            // @ts-expect-error custom property consumed by keyframes
            '--drift': `${l.drift}px`,
          }}
        />
      ))}

      <main className="start__card mm-panel--gloss">
        <div className="start__crest" aria-hidden>🏰</div>
        <h1 className="start__title">Mythic Mayor</h1>
        <p className="start__subtitle">Every great city begins as a rumor.</p>
        <p className="start__desc">
          You are about to become mayor of a city that does not exist yet. Sign here, and the
          surveyors, goblins, and over-enthusiastic wizards will conjure one around you. Govern it
          one day at a time and see what it becomes.
        </p>

        <label className="start__seed">
          <span className="start__seed-label">City Seed</span>
          <input
            className="start__seed-input"
            type="text"
            value={seed}
            placeholder="Leave blank for a surprise…"
            onChange={(e) => setSeed(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') create();
            }}
            maxLength={48}
          />
        </label>

        <button className="mm-btn mm-btn--brass start__create" onClick={create}>
          Create New City
        </button>
        <p className="start__hint">The same seed always grows the same city.</p>
      </main>
    </div>
  );
}
