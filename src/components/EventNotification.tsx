import type { ActiveEvent } from '../types';
import { useGameStore } from '../state/store';
import { EVENT_RESPONSE_WINDOW_DAYS } from '../simulation/engine';

/**
 * A council memo waiting for the mayor. The game keeps running; clicking opens
 * the decision modal, the ✕ hands the matter back to the council, and after
 * the response window it lapses on its own.
 */
export function EventNotification({ event, day }: { event: ActiveEvent; day: number }) {
  const openEvent = useGameStore((s) => s.openEvent);
  const dismissEvent = useGameStore((s) => s.dismissEvent);
  const daysLeft = Math.max(0, event.day + EVENT_RESPONSE_WINDOW_DAYS - day);

  return (
    <div className="event-toast mm-parchment-surface" role="status">
      <button className="event-toast__main" onClick={openEvent} title="Read the memo">
        <span className="event-toast__icon">📜</span>
        <span className="event-toast__body">
          <span className="event-toast__kicker">Council memorandum</span>
          <span className="event-toast__title">{event.title}</span>
          <span className="event-toast__hint">
            Click to respond · lapses in {daysLeft} day{daysLeft === 1 ? '' : 's'}
          </span>
        </span>
      </button>
      <button
        className="event-toast__dismiss"
        onClick={dismissEvent}
        title="Let the council sort it out"
        aria-label="Dismiss memo"
      >
        ✕
      </button>
    </div>
  );
}
