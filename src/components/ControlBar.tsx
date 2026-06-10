import { useEffect } from 'react';
import { SPEED_OPTIONS, useGameStore, type SpeedIndex } from '../state/store';

// Labels for each speed index. 0 = paused.
const SPEED_LABELS: Record<SpeedIndex, string> = {
  0: '⏸',
  1: '▶',
  2: '▶▶',
  3: '⏩',
};

const SPEED_TITLES: Record<SpeedIndex, string> = {
  0: 'Paused',
  1: `Slow — ${SPEED_OPTIONS[1]} days/sec`,
  2: `Normal — ${SPEED_OPTIONS[2]} day/sec`,
  3: `Fast — ${SPEED_OPTIONS[3]} days/sec`,
};

/** True when focus is in a text input so global keys don't hijack typing. */
function typingInField(): boolean {
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || (el as HTMLElement).isContentEditable;
}

export function ControlBar() {
  const speed = useGameStore((s) => s.speed);
  const setSpeed = useGameStore((s) => s.setSpeed);
  const advanceDay = useGameStore((s) => s.advanceDay);
  const eventOpen = useGameStore((s) => s.eventOpen);
  const hasOutcome = useGameStore((s) => s.city?.outcome != null);

  // Blocked while the memo modal is open or the run has ended (clock is held
  // too). A memo merely waiting in the notification tray does not block play.
  const blocked = eventOpen || hasOutcome;
  const paused = speed === 0;

  // Toggle between paused (0) and the last "play" speed. We keep it simple and
  // resume at Normal (2) from a paused state.
  const togglePause = () => setSpeed(paused ? 2 : 0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (typingInField()) return;
      if (e.code === 'Space') {
        e.preventDefault();
        if (!blocked) togglePause();
      } else if (e.key === 'n' || e.key === 'N') {
        if (!blocked) advanceDay();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocked, paused]);

  return (
    <div className="controls mm-panel">
      <div className="controls__group">
        <button
          className={`mm-btn speedbtn${paused ? ' mm-btn--active' : ''}`}
          onClick={() => setSpeed(0)}
          disabled={blocked}
          title="Pause (Space)"
          aria-label="Pause"
        >
          ⏸
        </button>
        {([1, 2, 3] as SpeedIndex[]).map((idx) => (
          <button
            key={idx}
            className={`mm-btn speedbtn${speed === idx ? ' mm-btn--active' : ''}`}
            onClick={() => setSpeed(idx)}
            disabled={blocked}
            title={SPEED_TITLES[idx]}
            aria-label={SPEED_TITLES[idx]}
          >
            {SPEED_LABELS[idx]}
          </button>
        ))}
      </div>

      <div className="controls__sep" />

      <button
        className="mm-btn"
        onClick={advanceDay}
        disabled={blocked}
        title="Advance one day (N)"
      >
        Next Day ⤳
      </button>

      <div className="controls__sep" />

      <span
        className={`controls__status ${paused ? 'controls__status--paused' : 'controls__status--playing'}`}
      >
        {blocked
          ? eventOpen
            ? '📜 Reading memo'
            : '⏳ Run ended'
          : paused
            ? '⏸ Paused'
            : `▶ ${SPEED_OPTIONS[speed]}/sec`}
      </span>
    </div>
  );
}
