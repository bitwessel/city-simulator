import { useEffect, useMemo, useRef } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { Color, Fog, type Scene } from 'three';
import type { City } from '../types';
import { DistrictPlatform } from './DistrictPlatform';
import { Roads } from './Roads';
import { Ground } from './Ground';
import { Atmosphere } from './Atmosphere';
import { Citizens } from './Citizens';
import { MOOD_THEMES } from './palette';

export interface CitySceneProps {
  city: City;
  selectedDistrictId: string | null;
  onSelectDistrict: (id: string | null) => void;
}

// ---------------------------------------------------------------------------
// CityScene — entry point. Renders the full <Canvas>. The DOM UI overlays
// panels on top; clicking empty ground deselects (onPointerMissed).
//
// Architecture:
//   * StaticCity: district platforms + roads. Their geometry depends only on
//     generated data (stable for the life of a city); colors/effects depend on
//     mood/stats and recompute cheaply.
//   * Citizens: instanced townsfolk wandering platforms and walking the roads.
//   * Atmosphere: lights, fog driver, pollution smog, magic sparkles.
//   * SceneFog: imperatively syncs scene.fog + background to the mood theme so
//     mood changes don't remount the graph.
// All useFrame hooks live in components rendered inside <Canvas>.
// ---------------------------------------------------------------------------

/** Imperatively applies mood-driven background + fog to the three Scene. */
function SceneFog({ moodKey }: { moodKey: keyof typeof MOOD_THEMES }) {
  const { scene } = useThree() as { scene: Scene };
  const theme = MOOD_THEMES[moodKey];

  useEffect(() => {
    const prevBg = scene.background;
    const prevFog = scene.fog;
    scene.background = new Color(theme.sky);
    scene.fog = new Fog(theme.fog, theme.fogNear, theme.fogFar);
    return () => {
      scene.background = prevBg;
      scene.fog = prevFog;
    };
  }, [scene, theme.sky, theme.fog, theme.fogNear, theme.fogFar]);

  return null;
}

interface StaticCityProps {
  city: City;
  selectedDistrictId: string | null;
  onSelectDistrict: (id: string | null) => void;
  moodKey: keyof typeof MOOD_THEMES;
}

function StaticCity({ city, selectedDistrictId, onSelectDistrict, moodKey }: StaticCityProps) {
  const theme = MOOD_THEMES[moodKey];
  const { beauty, chaos } = city.stats;

  return (
    <>
      <Roads city={city} theme={theme} />
      {city.districts.map((district) => (
        <DistrictPlatform
          key={district.id}
          district={district}
          theme={theme}
          selected={selectedDistrictId === district.id}
          beauty={beauty}
          chaos={chaos}
          onSelect={onSelectDistrict}
        />
      ))}
    </>
  );
}

export function CityScene({ city, selectedDistrictId, onSelectDistrict }: CitySceneProps) {
  const moodKey = city.mood as keyof typeof MOOD_THEMES;
  const theme = MOOD_THEMES[moodKey] ?? MOOD_THEMES.serene;

  // City bounding box: the camera frames its center (districts spiral outward
  // from district 0, so the centroid is usually off-origin), and atmosphere
  // effects size themselves from the extent.
  const { center, extent } = useMemo(() => {
    if (city.districts.length === 0) {
      return { center: { x: 0, z: 0 }, extent: 52 };
    }
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const d of city.districts) {
      minX = Math.min(minX, d.position.x - d.radius);
      maxX = Math.max(maxX, d.position.x + d.radius);
      minZ = Math.min(minZ, d.position.z - d.radius);
      maxZ = Math.max(maxZ, d.position.z + d.radius);
    }
    return {
      center: { x: (minX + maxX) / 2, z: (minZ + maxZ) / 2 },
      extent: Math.max(40, (maxX - minX) / 2, (maxZ - minZ) / 2) + 12,
    };
  }, [city.districts]);

  // Reset cursor when the scene unmounts so a lingering pointer style from a
  // hovered platform doesn't stick.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      document.body.style.cursor = 'auto';
    };
  }, []);

  return (
    <Canvas
      shadows
      camera={{
        position: [center.x, extent * 1.15, center.z + extent * 1.4],
        fov: 42,
      }}
      gl={{ antialias: true }}
      onPointerMissed={() => onSelectDistrict(null)}
      style={{ position: 'absolute', inset: 0 }}
    >
      <SceneFog moodKey={moodKey} />
      <Atmosphere
        mood={city.mood}
        stats={city.stats}
        theme={theme}
        extent={extent}
        center={center}
      />
      <Ground theme={theme} />
      <StaticCity
        city={city}
        selectedDistrictId={selectedDistrictId}
        onSelectDistrict={onSelectDistrict}
        moodKey={moodKey}
      />
      <Citizens city={city} />
      <OrbitControls
        enablePan
        enableDamping
        dampingFactor={0.08}
        minDistance={30}
        maxDistance={160}
        minPolarAngle={0.2}
        maxPolarAngle={Math.PI / 2.25}
        target={[center.x, 0, center.z]}
      />
    </Canvas>
  );
}
