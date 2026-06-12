import { useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { Color, Fog } from 'three';
import { useThree } from '@react-three/fiber';
import { useEffect } from 'react';
import { useGameStore } from '../state/store';
import type { City, FoundingChoices } from '../types';
import {
  generateCity,
  foundingSiteCandidates,
  foundingPatronOptions,
  type FoundingSite,
} from '../generation/generator';
import { generateTerrain, terrainHeightAt } from '../generation/terrain';
import { Terrain } from '../rendering/Terrain';
import { Scenery } from '../rendering/Scenery';
import { DaylightRig } from '../rendering/DaylightRig';
import { Atmosphere } from '../rendering/Atmosphere';
import { MOOD_THEMES } from '../rendering/palette';
import '../styles/founding.css';

// ---------------------------------------------------------------------------
// FoundingSiteMarkers — small glowing pins at each candidate site.
// ---------------------------------------------------------------------------

interface MarkersProps {
  sites: FoundingSite[];
  selectedId: FoundingSite['id'] | null;
  terrain: ReturnType<typeof generateTerrain>;
  onSelect: (id: FoundingSite['id']) => void;
}

function FoundingSiteMarkers({ sites, selectedId, terrain, onSelect }: MarkersProps) {
  return (
    <group>
      {sites.map((site) => {
        const y = terrainHeightAt(terrain, site.position.x, site.position.z) + 0.3;
        const selected = site.id === selectedId;
        return (
          <group key={site.id} position={[site.position.x, y, site.position.z]}>
            {/* Pin stem */}
            <mesh
              onClick={(e) => { e.stopPropagation(); onSelect(site.id); }}
            >
              <cylinderGeometry args={[0.22, 0.22, 3.5, 8]} />
              <meshStandardMaterial
                color={selected ? '#e0aa4a' : '#c8a86a'}
                emissive={selected ? '#f0c75e' : '#a07830'}
                emissiveIntensity={selected ? 0.8 : 0.25}
              />
            </mesh>
            {/* Pin head */}
            <mesh
              position={[0, 2.5, 0]}
              onClick={(e) => { e.stopPropagation(); onSelect(site.id); }}
            >
              <sphereGeometry args={[selected ? 1.1 : 0.8, 12, 12]} />
              <meshStandardMaterial
                color={selected ? '#f0c75e' : '#d4a855'}
                emissive={selected ? '#ffe090' : '#b88830'}
                emissiveIntensity={selected ? 1.2 : 0.4}
                transparent
                opacity={0.92}
              />
            </mesh>
            {/* Glow ring for selected */}
            {selected && (
              <mesh position={[0, 0.2, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                <ringGeometry args={[2.2, 3.2, 24]} />
                <meshStandardMaterial
                  color="#f0c75e"
                  emissive="#f0c75e"
                  emissiveIntensity={0.6}
                  transparent
                  opacity={0.35}
                  side={2}
                />
              </mesh>
            )}
          </group>
        );
      })}
    </group>
  );
}

// ---------------------------------------------------------------------------
// SceneSetup — imperatively sets fog + background.
// ---------------------------------------------------------------------------

function SceneSetup({ extent }: { extent: number }) {
  const { scene } = useThree();
  const theme = MOOD_THEMES.serene;
  useEffect(() => {
    const prevBg = scene.background;
    const prevFog = scene.fog;
    scene.background = new Color(theme.sky);
    scene.fog = new Fog(theme.fog, Math.max(theme.fogNear, extent * 1.1), Math.max(theme.fogFar, extent * 5.5));
    return () => {
      scene.background = prevBg;
      scene.fog = prevFog;
    };
  }, [scene, theme, extent]);
  return null;
}

// ---------------------------------------------------------------------------
// OrbitAutoRotate — gentle automatic yaw that stops when user drags.
// ---------------------------------------------------------------------------

function OrbitAutoRotate({ controlsRef }: { controlsRef: React.RefObject<OrbitControlsImpl | null> }) {
  useFrame(() => {
    const ctrl = controlsRef.current;
    if (!ctrl) return;
    // Only auto-rotate when the user isn't actively using the controls.
    // Three-stdlib's OrbitControls exposes _state: 0 = NONE.
    const state = (ctrl as unknown as { _state: number })._state;
    if (state === 0) {
      ctrl.autoRotate = true;
      ctrl.autoRotateSpeed = 0.4;
    } else {
      ctrl.autoRotate = false;
    }
    ctrl.update();
  });
  return null;
}

// ---------------------------------------------------------------------------
// FoundingScene — the Canvas content.
// ---------------------------------------------------------------------------

interface FoundingSceneProps {
  previewCity: City;
  sites: FoundingSite[];
  selectedSiteId: FoundingSite['id'] | null;
  onSelectSite: (id: FoundingSite['id']) => void;
}

function FoundingScene({ previewCity, sites, selectedSiteId, onSelectSite }: FoundingSceneProps) {
  const terrain = previewCity.terrain!;
  const theme = MOOD_THEMES.serene;
  const controlsRef = useRef<OrbitControlsImpl | null>(null);

  // Camera framing: center on map origin, generous extent.
  const extent = 52;
  const frame = 65;
  const targetY = terrainHeightAt(terrain, 0, 0);

  return (
    <>
      <SceneSetup extent={extent} />
      <DaylightRig theme={theme} clockRate={0.3} initialDay={1} />
      <Atmosphere
        mood="serene"
        stats={previewCity.stats}
        theme={theme}
        extent={extent}
        center={{ x: 0, z: 0 }}
      />
      <Terrain city={previewCity} theme={theme} extent={extent} />
      <Scenery city={previewCity} theme={theme} />
      <FoundingSiteMarkers
        sites={sites}
        selectedId={selectedSiteId}
        terrain={terrain}
        onSelect={onSelectSite}
      />
      <OrbitControls
        ref={controlsRef}
        enablePan={false}
        enableDamping
        dampingFactor={0.08}
        minDistance={30}
        maxDistance={180}
        minPolarAngle={0.2}
        maxPolarAngle={Math.PI / 2.3}
        target={[0, targetY, 0]}
      />
      <OrbitAutoRotate controlsRef={controlsRef} />
    </>
  );
}

// ---------------------------------------------------------------------------
// FoundingScreen — the full screen component.
// ---------------------------------------------------------------------------

export function FoundingScreen() {
  const pendingSeed = useGameStore((s) => s.pendingSeed);
  const confirmFounding = useGameStore((s) => s.confirmFounding);
  const seed = pendingSeed ?? 'default';

  const { terrain, sites, patrons, previewCity } = useMemo(() => {
    const terrain = generateTerrain(seed);
    const sites = foundingSiteCandidates(seed, terrain);
    const patrons = foundingPatronOptions(seed);
    // Preview city: full terrain but empty districts/roads/citizens for the flyover.
    const full = generateCity(seed);
    const previewCity: City = {
      ...full,
      districts: [],
      roads: [],
      citizenGroups: [],
      activeProjects: [],
      completedProjects: [],
    };
    return { terrain, sites, patrons, previewCity };
  }, [seed]);

  const [selectedSiteId, setSelectedSiteId] = useState<FoundingSite['id'] | null>(null);
  const [selectedPatronId, setSelectedPatronId] = useState<string | null>(null);
  const [nameValue, setNameValue] = useState(previewCity.name);

  // Sync name when seed changes.
  const prevSeedRef = useRef(seed);
  if (prevSeedRef.current !== seed) {
    prevSeedRef.current = seed;
    setNameValue(previewCity.name);
    setSelectedSiteId(null);
    setSelectedPatronId(null);
  }

  const handleFound = () => {
    const choices: FoundingChoices = {};
    if (selectedSiteId) choices.siteId = selectedSiteId;
    if (selectedPatronId) choices.patronQuirkId = selectedPatronId;
    if (nameValue.trim() && nameValue.trim() !== previewCity.name) {
      choices.name = nameValue.trim();
    }
    confirmFounding(choices);
  };

  const handleSurprise = () => {
    confirmFounding();
  };

  return (
    <div className="founding">
      <div className="founding__scene">
        <Canvas
          shadows
          flat
          camera={{ position: [0, 68, 88], fov: 42 }}
          gl={{ antialias: true }}
          style={{ position: 'absolute', inset: 0 }}
        >
          <FoundingScene
            previewCity={previewCity}
            sites={sites}
            selectedSiteId={selectedSiteId}
            onSelectSite={setSelectedSiteId}
          />
        </Canvas>
      </div>

      <aside className="founding__panel mm-scroll">
        <div>
          <h1 className="founding__title">Found Your City</h1>
          <p className="founding__subtitle">Three choices before the first stone is laid.</p>
        </div>

        {/* Site selection */}
        <section className="founding__section">
          <p className="founding__section-label">First District Site</p>
          <div className="founding__cards">
            {sites.map((site) => (
              <button
                key={site.id}
                className={`founding__card${selectedSiteId === site.id ? ' founding__card--selected' : ''}`}
                onClick={() => setSelectedSiteId(selectedSiteId === site.id ? null : site.id)}
              >
                <span className="founding__card-name">
                  {site.id === 'a' ? 'Site A' : site.id === 'b' ? 'Site B' : 'Site C'}
                </span>
                <span className="founding__card-desc">{site.vibe}</span>
              </button>
            ))}
          </div>
        </section>

        {/* Patron quirk selection */}
        <section className="founding__section">
          <p className="founding__section-label">Patron Quirk</p>
          <div className="founding__cards">
            {patrons.map((q) => (
              <button
                key={q.id}
                className={`founding__card${selectedPatronId === q.id ? ' founding__card--selected' : ''}`}
                onClick={() => setSelectedPatronId(selectedPatronId === q.id ? null : q.id)}
              >
                <span className="founding__card-name">{q.title}</span>
                <span className="founding__card-desc">{q.description}</span>
              </button>
            ))}
          </div>
        </section>

        {/* City name */}
        <section className="founding__section">
          <p className="founding__section-label">City Name</p>
          <input
            className="founding__name-input"
            type="text"
            value={nameValue}
            maxLength={48}
            onChange={(e) => setNameValue(e.target.value)}
          />
        </section>

        <div className="founding__actions">
          <button className="mm-btn mm-btn--brass" onClick={handleFound}>
            Found the City
          </button>
          <button className="mm-btn" onClick={handleSurprise}>
            Surprise me
          </button>
        </div>
      </aside>
    </div>
  );
}
