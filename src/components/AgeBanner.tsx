import { useEffect, useRef, useState } from 'react';
import type { City } from '../types';
import { currentAge, getAgeDef, type AgeDef } from '../simulation/ages';

// ---------------------------------------------------------------------------
// Age-up toast (phase 04) — a short, joyful banner naming the new age the
// moment the city grows up. Non-blocking (the clock keeps running), skippable
// (click to dismiss), and it excuses itself after a few seconds. The fireworks
// over the city come from the renderer's Celebration component.
// ---------------------------------------------------------------------------

const BANNER_MS = 8000;

export function AgeBanner({ city }: { city: City }) {
  const age = currentAge(city);
  const prev = useRef(age);
  const [shown, setShown] = useState<AgeDef | null>(null);

  useEffect(() => {
    if (prev.current === age) return;
    prev.current = age;
    setShown(getAgeDef(age));
    const timer = setTimeout(() => setShown(null), BANNER_MS);
    return () => clearTimeout(timer);
  }, [age]);

  if (!shown) return null;
  return (
    <button className="age-banner" onClick={() => setShown(null)} title="Dismiss">
      <span className="age-banner__burst" aria-hidden>
        🎆
      </span>
      <span className="age-banner__body">
        <span className="age-banner__title">{shown.title} begins!</span>
        <span className="age-banner__flavor">{shown.flavor}</span>
      </span>
    </button>
  );
}
