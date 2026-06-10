import { useGameStore } from '../state/store';
import { useGameClock } from '../game/useGameClock';
import { StartScreen } from '../components/StartScreen';
import { GameScreen } from '../components/GameScreen';
import { OutcomeScreen } from '../components/OutcomeScreen';
import '../styles/theme.css';

/**
 * Root shell for Mythic Mayor. Runs the game clock once and routes between the
 * three screens. All game logic lives in the store/simulation; this only reads
 * state and renders the matching screen.
 */
export default function App() {
  useGameClock();
  const screen = useGameStore((s) => s.screen);
  const city = useGameStore((s) => s.city);

  // Start screen (also the safe fallback whenever there is no city yet).
  if (screen === 'start' || !city) {
    return <StartScreen />;
  }

  // Full chronicle screen once the player dismisses the end-of-run banner.
  if (screen === 'outcome') {
    return <OutcomeScreen city={city} />;
  }

  // Main game: 3D city with overlaid panels, event modal, outcome banner.
  return <GameScreen city={city} />;
}
