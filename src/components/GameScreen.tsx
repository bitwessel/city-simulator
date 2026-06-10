import type { City } from '../types';
import { useGameStore } from '../state/store';
import { CityScene } from '../rendering/CityScene';
import { TopBar } from './TopBar';
import { LeftPanel } from './LeftPanel';
import { NewsFeed } from './NewsFeed';
import { ControlBar } from './ControlBar';
import { EventModal } from './EventModal';
import { EventNotification } from './EventNotification';
import { OutcomeOverlay } from './OutcomeOverlay';
import '../styles/game.css';

export function GameScreen({ city }: { city: City }) {
  const runId = useGameStore((s) => s.runId);
  const activeEvent = useGameStore((s) => s.activeEvent);
  const eventOpen = useGameStore((s) => s.eventOpen);
  const selectedDistrictId = useGameStore((s) => s.selectedDistrictId);
  const selectDistrict = useGameStore((s) => s.selectDistrict);

  return (
    <div className="game">
      {/* The 3D scene fills the viewport and sits beneath the DOM overlays. */}
      <div className="game__scene">
        <CityScene
          key={runId}
          city={city}
          selectedDistrictId={selectedDistrictId}
          onSelectDistrict={selectDistrict}
        />
      </div>

      {/* Overlay grid — click-through except on its interactive children. */}
      <div className="game__overlay">
        <TopBar city={city} />
        <LeftPanel city={city} />
        <div className="game__spacer" />
        <NewsFeed city={city} />
        <ControlBar />
      </div>

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
