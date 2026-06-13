import { useState } from 'react';
import type { City } from '../types';
import { SPEED_OPTIONS, useGameStore } from '../state/store';
import { CityScene } from '../rendering/CityScene';
import { PhotoToolbar } from '../rendering/PhotoCapture';
import { TopBar } from './TopBar';
import { LeftPanel } from './LeftPanel';
import { NewsFeed } from './NewsFeed';
import { ControlBar } from './ControlBar';
import { AgeBar } from './AgeBar';
import { AgeBanner } from './AgeBanner';
import { EventModal } from './EventModal';
import { EventNotification } from './EventNotification';
import { OutcomeOverlay } from './OutcomeOverlay';
import '../styles/game.css';

export function GameScreen({ city }: { city: City }) {
  const runId = useGameStore((s) => s.runId);
  const activeEvent = useGameStore((s) => s.activeEvent);
  const eventOpen = useGameStore((s) => s.eventOpen);
  const speed = useGameStore((s) => s.speed);
  const selectedDistrictId = useGameStore((s) => s.selectedDistrictId);
  const selectDistrict = useGameStore((s) => s.selectDistrict);
  const photoMode = useGameStore((s) => s.photoMode);

  // Golden-hour is purely local UI state — it only lives while photo mode is
  // active and has zero sim impact. Reset it whenever photo mode exits so the
  // next session starts fresh.
  const [goldenHour, setGoldenHour] = useState(false);

  // Mirrors useGameClock's hold conditions so the day/night sun freezes
  // exactly when the simulation clock does.
  const clockRate = eventOpen || city.outcome ? 0 : SPEED_OPTIONS[speed];

  return (
    <div className={`game${photoMode ? ' game--photo' : ''}`}>
      {/* The 3D scene fills the viewport and sits beneath the DOM overlays. */}
      <div className="game__scene">
        <CityScene
          key={runId}
          city={city}
          selectedDistrictId={selectedDistrictId}
          onSelectDistrict={selectDistrict}
          clockRate={clockRate}
          goldenHour={photoMode && goldenHour}
        />
      </div>

      {/* Photo mode: show only the minimal photo toolbar. The CSS class on
          .game--photo hides all other HUD elements. */}
      {photoMode && (
        <PhotoToolbar
          city={city}
          goldenActive={goldenHour}
          onGoldenToggle={() => setGoldenHour((v) => !v)}
        />
      )}

      {/* Overlay grid — click-through except on its interactive children.
          The center column stays empty so the 3D map is draggable.
          Hidden in photo mode via .game--photo CSS. */}
      <div className="game__overlay">
        <TopBar city={city} />
        <LeftPanel city={city} />
        {/* Bottom stack: the age progression strip rides above the controls. */}
        <div className="bottombar">
          <AgeBar city={city} />
          <ControlBar />
        </div>
      </div>

      {/* A short celebratory toast when the city grows up an age. */}
      <AgeBanner city={city} />

      {/* News surfaces as a self-positioning fading ticker + chronicle drawer. */}
      <NewsFeed city={city} />

      {/* A waiting memo shows as an optional notification; the modal only
          opens when the player clicks it. */}
      {activeEvent && !eventOpen && !city.outcome && (
        <EventNotification event={activeEvent} day={city.day} />
      )}
      {activeEvent && eventOpen ? (
        <EventModal city={city} event={activeEvent} />
      ) : (
        city.outcome && <OutcomeOverlay outcome={city.outcome} />
      )}
    </div>
  );
}
