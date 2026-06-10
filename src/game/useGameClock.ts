import { useEffect } from 'react';
import { SPEED_OPTIONS, useGameStore } from '../state/store';

/**
 * Drives day progression. Runs while on the game screen with a nonzero speed.
 * A pending memo notification does NOT stop time — only actually reading the
 * memo (modal open) or the run ending holds the clock.
 */
export function useGameClock(): void {
  const speed = useGameStore((s) => s.speed);
  const screen = useGameStore((s) => s.screen);
  const reading = useGameStore((s) => s.eventOpen);
  const ended = useGameStore((s) => s.city?.outcome != null);

  useEffect(() => {
    if (screen !== 'game' || reading || ended) return;
    const daysPerSecond = SPEED_OPTIONS[speed];
    if (daysPerSecond <= 0) return;
    const interval = setInterval(() => {
      useGameStore.getState().advanceDay();
    }, 1000 / daysPerSecond);
    return () => clearInterval(interval);
  }, [speed, screen, reading, ended]);
}
