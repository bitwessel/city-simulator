import { create } from 'zustand';
import type { ActiveEvent, City } from '../types';
import { generateCity, randomSeedString } from '../generation/generator';
import {
  EVENT_RESPONSE_WINDOW_DAYS,
  applyEventChoice,
  lapseEvent,
  simulateDay,
} from '../simulation/engine';

// The single source of truth for the UI. All game logic stays in the
// simulation/generation modules; the store just routes actions to them.

export type Screen = 'start' | 'game' | 'outcome';

/** Days advanced per second at each speed setting (0 = paused). */
export const SPEED_OPTIONS = [0, 0.5, 1, 2.5] as const;
export type SpeedIndex = 0 | 1 | 2 | 3;

export interface GameStore {
  screen: Screen;
  city: City | null;
  speed: SpeedIndex;
  /** A memo awaiting the player. Shown as a notification; the game keeps running. */
  activeEvent: ActiveEvent | null;
  /** True while the memo's decision modal is open (the clock holds then). */
  eventOpen: boolean;
  selectedDistrictId: string | null;
  selectedFactionId: string | null;
  /** Bumped on every new game so the 3D scene fully remounts. */
  runId: number;

  newGame: (seedInput?: string) => void;
  advanceDay: () => void;
  setSpeed: (speed: SpeedIndex) => void;
  openEvent: () => void;
  /** Close the modal without deciding; the notification stays available. */
  closeEvent: () => void;
  /** Wave the memo away entirely — the council handles it offscreen. */
  dismissEvent: () => void;
  chooseEventOption: (choiceId: string) => void;
  selectDistrict: (id: string | null) => void;
  selectFaction: (id: string | null) => void;
  dismissOutcome: () => void;
  backToStart: () => void;
}

export const useGameStore = create<GameStore>((set, get) => ({
  screen: 'start',
  city: null,
  speed: 2,
  activeEvent: null,
  eventOpen: false,
  selectedDistrictId: null,
  selectedFactionId: null,
  runId: 0,

  newGame: (seedInput) => {
    const seed = seedInput && seedInput.trim().length > 0 ? seedInput.trim() : randomSeedString();
    const city = generateCity(seed);
    set((s) => ({
      screen: 'game',
      city,
      // Normal speed (1 day/sec): memos land about once a real-time minute.
      speed: 2,
      activeEvent: null,
      eventOpen: false,
      selectedDistrictId: null,
      selectedFactionId: null,
      runId: s.runId + 1,
    }));
  },

  advanceDay: () => {
    const { city, activeEvent } = get();
    if (!city || city.outcome) return;
    // Days keep flowing while a memo waits; no new event fires meanwhile.
    const result = simulateDay(city, { suppressEvents: activeEvent !== null });

    let nextCity = result.city;
    let nextEvent = activeEvent ?? result.triggeredEvent;
    if (activeEvent && nextCity.day > activeEvent.day + EVENT_RESPONSE_WINDOW_DAYS) {
      nextCity = lapseEvent(nextCity, activeEvent);
      nextEvent = null;
    }
    if (result.outcome) {
      // The run is over; a lingering memo no longer matters.
      nextEvent = null;
    }
    set({ city: nextCity, activeEvent: nextEvent, eventOpen: nextEvent ? get().eventOpen : false });
    if (result.outcome) {
      // Stop the clock; the UI shows the outcome overlay over the city.
      set({ speed: 0 });
    }
  },

  setSpeed: (speed) => set({ speed }),

  openEvent: () => {
    if (get().activeEvent) set({ eventOpen: true });
  },

  closeEvent: () => set({ eventOpen: false }),

  dismissEvent: () => {
    const { city, activeEvent } = get();
    if (!city || !activeEvent) return;
    set({ city: lapseEvent(city, activeEvent), activeEvent: null, eventOpen: false });
  },

  chooseEventOption: (choiceId) => {
    const { city, activeEvent } = get();
    if (!city || !activeEvent) return;
    const { city: next } = applyEventChoice(city, activeEvent, choiceId);
    set({ city: next, activeEvent: null, eventOpen: false });
  },

  selectDistrict: (id) =>
    set({ selectedDistrictId: id, selectedFactionId: id ? null : get().selectedFactionId }),

  selectFaction: (id) =>
    set({ selectedFactionId: id, selectedDistrictId: id ? null : get().selectedDistrictId }),

  dismissOutcome: () => set({ screen: 'outcome' }),

  backToStart: () =>
    set({
      screen: 'start',
      city: null,
      activeEvent: null,
      eventOpen: false,
      selectedDistrictId: null,
      selectedFactionId: null,
      speed: 2,
    }),
}));
