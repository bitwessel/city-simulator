import { useEffect, type CSSProperties } from 'react';
import { SPEED_OPTIONS, useGameStore, type SpeedIndex } from '../state/store';
import '../styles/postcard.css';

// Glyph + title for each play speed (0 = paused, handled separately).
const SPEED_LABELS: Record<1 | 2 | 3, string> = {
  1: '▶',
  2: '▶▶',
  3: '⏩',
};

const SPEED_TITLES: Record<SpeedIndex, string> = {
  0: 'Paused',
  1: `Gentle — ${SPEED_OPTIONS[1]} days/sec`,
  2: `Steady — ${SPEED_OPTIONS[2]} day/sec`,
  3: `Brisk — ${SPEED_OPTIONS[3]} days/sec`,
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
  const day = useGameStore((s) => s.city?.day ?? 0);
  const hasOutcome = useGameStore((s) => s.city?.outcome != null);
  const setPhotoMode = useGameStore((s) => s.setPhotoMode);

  // Blocked while the memo modal is open or the run has ended (clock is held
  // too). A memo merely waiting in the notification tray does not block play.
  const blocked = eventOpen || hasOutcome;
  const paused = speed === 0;

  // Resume at Steady (2) from a paused state.
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

  // CSS-driven "until next day" sweep. Duration matches the clock interval
  // (1 / days-per-second). Restarting the animation whenever the day changes
  // keeps it roughly in sync without touching the store. Paused → no sweep.
  const dayDuration = !paused && !blocked ? 1 / SPEED_OPTIONS[speed] : 0;
  const progressStyle: CSSProperties =
    dayDuration > 0
      ? { animationDuration: `${dayDuration}s` }
      : { animationName: 'none', width: paused ? '0%' : undefined };

  return (
    <div className="controls mm-panel mm-panel--gloss" role="toolbar" aria-label="Time controls">
      <button
        className={`ctrl-btn ctrl-btn--play${paused ? '' : ' ctrl-btn--on'}`}
        onClick={togglePause}
        disabled={blocked}
        title={paused ? 'Play (Space)' : 'Pause (Space)'}
        aria-label={paused ? 'Play' : 'Pause'}
      >
        {paused ? '▶' : '⏸'}
      </button>

      <div className="ctrl-sep" />

      <div className="ctrl-speeds">
        {([1, 2, 3] as const).map((idx) => (
          <button
            key={idx}
            className={`ctrl-btn ctrl-speed${speed === idx ? ' ctrl-btn--on' : ''}`}
            onClick={() => setSpeed(idx)}
            disabled={blocked}
            title={SPEED_TITLES[idx]}
            aria-label={SPEED_TITLES[idx]}
          >
            {SPEED_LABELS[idx]}
          </button>
        ))}
      </div>

      <div className="ctrl-sep" />

      <button
        className="ctrl-btn ctrl-btn--next"
        onClick={advanceDay}
        disabled={blocked}
        title="Advance one day (N)"
      >
        <span className="ctrl-btn--next__label">Next day</span>
        <span className="ctrl-btn--next__icon">⤳</span>
      </button>

      <div className="ctrl-day">
        <span className="ctrl-day__num">Day {day}</span>
        <div className="ctrl-day__track">
          <div
            key={`${day}-${speed}-${blocked}`}
            className={`ctrl-day__fill${dayDuration > 0 ? ' ctrl-day__fill--run' : ''}`}
            style={progressStyle}
          />
        </div>
        <span className="ctrl-day__status">
          {blocked
            ? eventOpen
              ? 'Reading memo'
              : 'Run ended'
            : paused
              ? 'Paused'
              : `${SPEED_OPTIONS[speed]}/sec`}
        </span>
      </div>

      <div className="ctrl-sep" />

      <button
        className="ctrl-btn ctrl-btn--camera"
        onClick={() => setPhotoMode(true)}
        title="Enter photo mode — hide UI and capture a postcard"
        aria-label="Photo mode"
        data-testid="photo-mode-btn"
      >
        📷
      </button>
    </div>
  );
}
