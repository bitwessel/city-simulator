import { useState } from 'react';
import type { AgeId, City } from '../types';
import {
  AGE_DEFS,
  ageIndex,
  ageProgress,
  currentAge,
  nextAgeDef,
} from '../simulation/ages';

// ---------------------------------------------------------------------------
// Age progression bar (phase 04) — the bottom strip from the reference
// mockups: all five ages, finished ones marked, the current one aglow, future
// ones waiting. Hover/tap an age for soft words about it (the next age shows
// its "dream" — never a checklist of numbers). Sits above the control pill
// without crowding it.
// ---------------------------------------------------------------------------

const AGE_ICONS: Record<AgeId, string> = {
  settlement: '🏕️',
  village: '🏡',
  town: '🏘️',
  city: '🏛️',
  wonder: '✨',
};

/** The soft tooltip line for an age, relative to where the city stands. */
function ageHint(city: City, ageId: AgeId): string {
  const def = AGE_DEFS[ageIndex(ageId)];
  const curIdx = ageIndex(currentAge(city));
  const idx = ageIndex(ageId);
  if (idx < curIdx) {
    const entry = (city.ageLog ?? []).find((e) => e.age === ageId);
    const since = entry ? `Begun on day ${entry.day}. ` : '';
    return `${since}${def.flavor}`;
  }
  if (idx === curIdx) {
    const entry = (city.ageLog ?? []).find((e) => e.age === ageId);
    const since = entry ? ` Begun on day ${entry.day}.` : '';
    return `${def.flavor}${since}`;
  }
  if (idx === curIdx + 1) return def.dream;
  return 'A distant dream, for now — every age opens the road to the next.';
}

export function AgeBar({ city }: { city: City }) {
  const [openTip, setOpenTip] = useState<AgeId | null>(null);
  const cur = currentAge(city);
  const curIdx = ageIndex(cur);
  const next = nextAgeDef(city);
  const progress = next ? ageProgress(city) : 1;

  return (
    <div className="agebar mm-panel mm-panel--gloss" role="group" aria-label="Age progression">
      {AGE_DEFS.map((def, i) => {
        const state = i < curIdx ? 'past' : i === curIdx ? 'current' : 'future';
        return (
          <div className="agebar__step" key={def.id}>
            {i > 0 && (
              <div className={`agebar__link agebar__link--${i <= curIdx ? 'done' : 'todo'}`}>
                {/* soft progress fill on the segment leading to the next age */}
                {i === curIdx + 1 && (
                  <div
                    className="agebar__link-fill"
                    style={{ width: `${Math.round(progress * 100)}%` }}
                  />
                )}
              </div>
            )}
            <button
              className={`agebar__age agebar__age--${state}`}
              onMouseEnter={() => setOpenTip(def.id)}
              onMouseLeave={() => setOpenTip((t) => (t === def.id ? null : t))}
              onClick={() => setOpenTip((t) => (t === def.id ? null : def.id))}
              aria-label={`${def.name}${state === 'current' ? ' (current age)' : ''}`}
            >
              <span className="agebar__icon" aria-hidden>
                {state === 'past' ? '✓' : AGE_ICONS[def.id]}
              </span>
              <span className="agebar__name">{def.name}</span>
              {openTip === def.id && (
                <span className="agebar__tip" role="tooltip">
                  <span className="agebar__tip-title">
                    {AGE_ICONS[def.id]} {def.title}
                  </span>
                  {ageHint(city, def.id)}
                </span>
              )}
            </button>
          </div>
        );
      })}
    </div>
  );
}
