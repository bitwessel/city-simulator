import { create } from 'zustand';
import type { ActiveEvent, ActiveWonder, AgeId, City, CompletedWonder, FoundingChoices } from '../types';
import { AGE_ORDER } from '../types';
import { generateCity, randomSeedString } from '../generation/generator';
import {
  EVENT_RESPONSE_WINDOW_DAYS,
  applyEventChoice,
  lapseEvent,
  simulateDay,
} from '../simulation/engine';
import { commissionProject } from '../projects/projects';
import { declareEdict } from '../simulation/edicts';

// The single source of truth for the UI. All game logic stays in the
// simulation/generation modules; the store just routes actions to them.

export type Screen = 'start' | 'founding' | 'game' | 'outcome';

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
  /**
   * Phase 06 — the notable citizen whose bio card is open (null = none). Pure
   * UI state; never part of City. The renderer/panel set this on click.
   */
  selectedCastId: string | null;
  /**
   * Phase 06 — the notable citizen the camera is following at street level
   * (null = orbit). Pure renderer/UI state; zero simulation impact.
   */
  followedCastId: string | null;
  /**
   * Phase 06 — postcard/photo mode: hides UI chrome so the player can frame and
   * capture the diorama. Pure UI state.
   */
  photoMode: boolean;
  /**
   * Mobile only: whether the city/districts/factions panel popup is open. On
   * desktop the panel is always docked, so this flag is ignored there.
   */
  panelOpen: boolean;
  /** Bumped on every new game so the 3D scene fully remounts. */
  runId: number;
  /** Resolved seed waiting for founding ritual confirmation. */
  pendingSeed: string | null;

  newGame: (seedInput?: string) => void;
  /** Resolve the seed and transition to the founding screen. */
  beginFounding: (seedInput?: string) => void;
  /** Apply founding choices and enter the game. Pass no argument for "Surprise me". */
  confirmFounding: (choices?: FoundingChoices) => void;
  advanceDay: () => void;
  setSpeed: (speed: SpeedIndex) => void;
  openEvent: () => void;
  /** Close the modal without deciding; the notification stays available. */
  closeEvent: () => void;
  /** Wave the memo away entirely — the council handles it offscreen. */
  dismissEvent: () => void;
  chooseEventOption: (choiceId: string) => void;
  /**
   * Commission a mayor project in a district. No-op when it isn't allowed
   * (the pure helper holds all the validation logic).
   */
  startProject: (districtId: string, defId: string) => void;
  /** Declare (or lift, when edictId is null) a standing edict. No-op when invalid. */
  declareEdict: (edictId: string | null) => void;
  selectDistrict: (id: string | null) => void;
  selectFaction: (id: string | null) => void;
  /** Phase 06: open (or close, with null) a notable citizen's bio card. */
  selectCast: (id: string | null) => void;
  /** Phase 06: follow (or release, with null) a notable citizen with the camera. */
  followCast: (id: string | null) => void;
  /** Phase 06: toggle postcard/photo mode (hides UI for framing a shot). */
  setPhotoMode: (on: boolean) => void;
  /** Mobile only: open/close the panel popup. */
  setPanelOpen: (open: boolean) => void;
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
  selectedCastId: null,
  followedCastId: null,
  photoMode: false,
  panelOpen: false,
  runId: 0,
  pendingSeed: null,

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
      selectedCastId: null,
      followedCastId: null,
      photoMode: false,
      panelOpen: false,
      runId: s.runId + 1,
    }));
  },

  beginFounding: (seedInput) => {
    const seed = seedInput && seedInput.trim().length > 0 ? seedInput.trim() : randomSeedString();
    set({ pendingSeed: seed, screen: 'founding' });
  },

  confirmFounding: (choices) => {
    const { pendingSeed } = get();
    const seed = pendingSeed ?? randomSeedString();
    // Only pass choices when at least one field is set; otherwise default path.
    const hasChoices = choices && (choices.siteId || choices.patronQuirkId || (choices.name && choices.name.trim().length > 0));
    const city = hasChoices ? generateCity(seed, choices) : generateCity(seed);
    set((s) => ({
      screen: 'game',
      city,
      speed: 2,
      activeEvent: null,
      eventOpen: false,
      selectedDistrictId: null,
      selectedFactionId: null,
      selectedCastId: null,
      followedCastId: null,
      photoMode: false,
      panelOpen: false,
      pendingSeed: null,
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

  startProject: (districtId, defId) => {
    const { city } = get();
    if (!city || city.outcome) return;
    // commissionProject is pure and returns the same city when the order is
    // invalid, so this set is a harmless no-op in that case.
    set({ city: commissionProject(city, districtId, defId) });
  },

  declareEdict: (edictId) => {
    const { city } = get();
    if (!city || city.outcome) return;
    set({ city: declareEdict(city, edictId) });
  },

  selectDistrict: (id) =>
    set({
      selectedDistrictId: id,
      selectedFactionId: id ? null : get().selectedFactionId,
      // On mobile, picking a district on the map pops the panel open to it.
      panelOpen: id ? true : get().panelOpen,
    }),

  selectFaction: (id) =>
    set({
      selectedFactionId: id,
      selectedDistrictId: id ? null : get().selectedDistrictId,
      panelOpen: id ? true : get().panelOpen,
    }),

  selectCast: (id) =>
    set({
      selectedCastId: id,
      // Opening a bio card pops the panel on mobile, like district/faction.
      panelOpen: id ? true : get().panelOpen,
    }),

  followCast: (id) => set({ followedCastId: id }),

  setPhotoMode: (on) => set({ photoMode: on }),

  setPanelOpen: (open) => set({ panelOpen: open }),

  dismissOutcome: () => set({ screen: 'outcome' }),

  backToStart: () =>
    set({
      screen: 'start',
      city: null,
      activeEvent: null,
      eventOpen: false,
      selectedDistrictId: null,
      selectedFactionId: null,
      selectedCastId: null,
      followedCastId: null,
      photoMode: false,
      panelOpen: false,
      speed: 2,
    }),
}));

// Dev-only debug bridge for scripts/age-check.mjs and manual era previews:
// forces the running city into an age (or a wonder into a construction stage)
// so each era skin / wonder silhouette can be screenshotted without simulating
// hundreds of days. Never part of a real run (the sim's own age-ups flow
// through simulateDay); stripped from production builds.
if (import.meta.env.DEV && typeof window !== 'undefined') {
  (window as unknown as { __mmDebug?: object }).__mmDebug = {
    forceAge: (age: AgeId) => {
      if (!AGE_ORDER.includes(age)) return;
      const { city } = useGameStore.getState();
      if (!city) return;
      const next = structuredClone(city);
      next.age = age;
      next.ageLog = [...(next.ageLog ?? []), { age, day: next.day }];
      useGameStore.setState({ city: next });
    },
    /** Place (or restage) a wonder; stage >= stage count = complete. */
    forceWonder: async (defId: string, stage: number) => {
      const { startWonder, getWonderDef } = await import('../projects/wonders');
      const { city } = useGameStore.getState();
      const def = getWonderDef(defId);
      if (!city || !def) return;
      const next = structuredClone(city);
      // Clear any previously forced wonder so each can be previewed in turn.
      for (const d of next.districts) {
        d.buildings = d.buildings.filter((b) => !b.id.startsWith('wonder-'));
      }
      next.activeWonder = undefined;
      next.completedWonder = undefined;
      const active = startWonder(next, defId, next.news);
      if (active && active.defId === defId) {
        const district = next.districts.find((d) => d.id === active.districtId);
        const building = district?.buildings.find((b) => b.id === active.buildingId);
        if (building) {
          if (stage >= def.stages.length) {
            building.construction = false;
            building.wonderStage = def.stages.length;
            next.completedWonder = {
              defId,
              districtId: active.districtId,
              day: next.day,
            };
            next.activeWonder = undefined;
          } else {
            building.wonderStage = stage;
            active.stage = stage;
          }
        }
      }
      useGameStore.setState({ city: next });
      // The host district's center, so scripts can aim the camera at it.
      const placed: CompletedWonder | ActiveWonder | undefined =
        next.completedWonder ?? next.activeWonder;
      const host = next.districts.find((d) => d.id === placed?.districtId);
      return host ? { x: host.position.x, z: host.position.z } : undefined;
    },
  };
}
