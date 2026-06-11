import { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Color, Fog } from 'three';
import type { MoodTheme } from './palette';
import {
  DAYLIGHT,
  DAYS_PER_CYCLE,
  START_PHASE,
  applyNightGlow,
  updateDaylight,
} from './daylight';

// ---------------------------------------------------------------------------
// DaylightRig — advances the day/night phase and publishes the DAYLIGHT
// snapshot every frame, before any consumer's useFrame runs (priority -10).
//
//   * `clockRate` is days-per-real-second from the game clock; 0 while paused,
//     reading a memo, or after the run ends — the sun freezes exactly like the
//     simulation does.
//   * Sky + fog colors are pushed imperatively onto the scene (SceneFog owns
//     the Fog object + distances; we only modulate its colors), so the cycle
//     composes with mood themes instead of fighting them.
//   * Window/lantern emissives are refreshed on a throttled sweep — see
//     applyNightGlow in daylight.ts.
// ---------------------------------------------------------------------------

export interface DaylightRigProps {
  theme: MoodTheme;
  /** In-game days advanced per real second (0 = the clock is held). */
  clockRate: number;
  /** City day at mount, so reloading mid-run resumes a sensible sun. */
  initialDay: number;
}

export function DaylightRig({ theme, clockRate, initialDay }: DaylightRigProps) {
  const { scene } = useThree();
  const phaseRef = useRef(
    (START_PHASE + (initialDay % DAYS_PER_CYCLE) / DAYS_PER_CYCLE) % 1,
  );
  const glowTimer = useRef(1); // start past the threshold: sweep on frame one

  useFrame((_, delta) => {
    // Clamp tab-restore spikes so the sun never teleports across the sky.
    const dt = Math.min(delta, 0.25);
    phaseRef.current = (phaseRef.current + (dt * clockRate) / DAYS_PER_CYCLE) % 1;
    updateDaylight(theme, phaseRef.current);

    if (scene.fog instanceof Fog) scene.fog.color.copy(DAYLIGHT.fogColor);
    if (scene.background instanceof Color) scene.background.copy(DAYLIGHT.skyColor);

    glowTimer.current += dt;
    if (glowTimer.current >= 0.25) {
      glowTimer.current = 0;
      applyNightGlow(scene);
    }
  }, -10);

  return null;
}
