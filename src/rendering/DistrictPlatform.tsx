import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { Billboard, Text } from '@react-three/drei';
import { CylinderGeometry, type Mesh } from 'three';
import type { District } from '../types';
import { BuildingMesh, type BuildingPalette } from './BuildingMesh';
import { Decorations } from './Decorations';
import { SELECT_RING } from './shared';
import {
  districtMoodTintHex,
  scaleHex,
  mixHex,
  type MoodTheme,
} from './palette';
import { hashFloat } from './hash';

// ---------------------------------------------------------------------------
// DistrictPlatform — a raised low-poly island per district.
//
// Static geometry (the platform shape + buildings) depends only on the
// district's generated data, which never changes after generation. Colors and
// effects depend on mood/stats and are recomputed cheaply per render.
// ---------------------------------------------------------------------------

const PLATFORM_HEIGHT = 1.0;

interface DistrictPlatformProps {
  district: District;
  theme: MoodTheme;
  selected: boolean;
  beauty: number;
  chaos: number;
  onSelect: (id: string) => void;
}

/**
 * Build a slightly irregular low-poly cylinder for the platform so islands
 * read as hand-made rather than perfectly round. Memoized per district id +
 * radius (both stable for the life of a city).
 */
function makePlatformGeometry(id: string, radius: number): CylinderGeometry {
  const segments = 11; // odd, low-poly faceted look
  const geo = new CylinderGeometry(radius, radius * 0.92, PLATFORM_HEIGHT, segments);
  // Jitter the top-rim vertices outward a touch for an organic silhouette.
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    if (y > 0) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const ang = Math.atan2(z, x);
      const jitter = 1 + (hashFloat(id, Math.round(ang * 50) + 100) - 0.5) * 0.12;
      pos.setX(i, x * jitter);
      pos.setZ(i, z * jitter);
    }
  }
  geo.computeVertexNormals();
  return geo;
}

export function DistrictPlatform({
  district,
  theme,
  selected,
  beauty,
  chaos,
  onSelect,
}: DistrictPlatformProps) {
  const [hovered, setHovered] = useState(false);
  const ringRef = useRef<Mesh>(null);

  // Static platform geometry — built once per district.
  const platformGeo = useMemo(
    () => makePlatformGeometry(district.id, district.radius),
    [district.id, district.radius],
  );
  // Free the GPU buffer if the district (and thus its geometry) is replaced.
  useEffect(() => () => platformGeo.dispose(), [platformGeo]);

  // Platform color: district base, shifted by global mood + local district mood.
  const platformColor = useMemo(
    () => districtMoodTintHex(district.visualStyle.baseColor, theme, district.mood),
    [district.visualStyle.baseColor, theme, district.mood],
  );
  // Side/cliff color is a darker variant.
  const sideColor = useMemo(() => scaleHex(platformColor, 0.72), [platformColor]);

  // Building palette derived once per district (color-only). Memoized so the
  // child buildings' own useMemo on these strings stays stable across frames.
  const buildingPalette = useMemo<BuildingPalette>(() => {
    const wall = districtMoodTintHex(district.visualStyle.baseColor, theme, district.mood);
    return {
      wall: scaleHex(wall, 1.12),
      accent: district.visualStyle.accentColor,
      trim: scaleHex(wall, 0.78),
      glow: mixHex(district.visualStyle.accentColor, '#ffffff', 0.3),
    };
  }, [district.visualStyle.baseColor, district.visualStyle.accentColor, theme, district.mood]);

  // Decoration colors (greenery), nudged by mood.
  const decoColors = useMemo(
    () => ({
      leaf: mixHex('#4f9d54', theme.groundTint, 0.25),
      trunk: '#6b4a2e',
      flower: mixHex(district.visualStyle.accentColor, '#ffd0e8', 0.4),
    }),
    [theme, district.visualStyle.accentColor],
  );

  // Only buildings the district has developed far enough to construct exist
  // yet — the city visibly grows (and can decay) as development moves.
  const visibleBuildings = useMemo(
    () => district.buildings.filter((b) => b.appearAt <= district.development / 100),
    [district.buildings, district.development],
  );

  // Which buildings get the chaos wobble: only a couple per district, chosen
  // deterministically, and only above the chaos threshold.
  const wobbleSet = useMemo(() => {
    const set = new Set<string>();
    if (chaos <= 65) return set;
    const sorted = visibleBuildings
      .map((b) => ({ id: b.id, r: hashFloat(b.id, 7) }))
      .sort((a, b) => a.r - b.r);
    const n = Math.min(2, sorted.length);
    for (let i = 0; i < n; i++) set.add(sorted[i].id);
    return set;
  }, [visibleBuildings, chaos]);

  // Pulse the selection ring.
  useFrame((state) => {
    if (selected && ringRef.current) {
      const t = state.clock.elapsedTime;
      const s = 1 + Math.sin(t * 2.5) * 0.03;
      ringRef.current.scale.set(s, s, 1);
      const mat = ringRef.current.material as { emissiveIntensity?: number };
      if (mat && typeof mat.emissiveIntensity === 'number') {
        mat.emissiveIntensity = 1.4 + Math.sin(t * 2.5) * 0.5;
      }
    }
  });

  const handleOver = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    setHovered(true);
    document.body.style.cursor = 'pointer';
  };
  const handleOut = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    setHovered(false);
    document.body.style.cursor = 'auto';
  };
  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    onSelect(district.id);
  };

  const cx = district.position.x;
  const cz = district.position.z;

  return (
    <group position={[cx, 0, cz]}>
      {/* Platform (interactive). Side color via second material isn't trivial
          with one mesh, so we layer a thin rim cap of the base color on top. */}
      <mesh
        geometry={platformGeo}
        position={[0, PLATFORM_HEIGHT / 2, 0]}
        onPointerOver={handleOver}
        onPointerOut={handleOut}
        onClick={handleClick}
        receiveShadow
        castShadow
      >
        <meshStandardMaterial color={sideColor} roughness={0.95} metalness={0} />
      </mesh>
      {/* Top cap so the walkable surface reads brighter than the cliff sides. */}
      <mesh
        position={[0, PLATFORM_HEIGHT + 0.005, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        onPointerOver={handleOver}
        onPointerOut={handleOut}
        onClick={handleClick}
        receiveShadow
      >
        <circleGeometry args={[district.radius * 0.99, 11]} />
        <meshStandardMaterial
          color={platformColor}
          roughness={0.92}
          metalness={0}
          emissive={hovered && !selected ? '#ffffff' : '#000000'}
          emissiveIntensity={hovered && !selected ? 0.12 : 0}
        />
      </mesh>

      {/* Selection ring just above the platform top. */}
      {selected && (
        <mesh
          ref={ringRef}
          geometry={SELECT_RING}
          position={[0, PLATFORM_HEIGHT + 0.08, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          scale={[district.radius * 1.02, district.radius * 1.02, 1]}
        >
          <meshStandardMaterial
            color={'#fff4c2'}
            emissive={'#ffd86b'}
            emissiveIntensity={1.6}
            toneMapped={false}
            roughness={0.4}
          />
        </mesh>
      )}

      {/* Buildings + greenery sit on top of the platform. This whole group is
          translated by (-cx, -cz) so that children using world-space building /
          decoration coordinates land at the correct spot inside the platform
          group (which is itself at world [cx, 0, cz]). The net effect places a
          building stored at world (bx, bz) at world (bx, PLATFORM_HEIGHT, bz). */}
      <group position={[-cx, 0, -cz]}>
        {visibleBuildings.map((b) => (
          <group key={b.id} position={[0, PLATFORM_HEIGHT, 0]}>
            <BuildingMesh
              building={b}
              palette={buildingPalette}
              wobble={wobbleSet.has(b.id)}
            />
          </group>
        ))}
        <Decorations
          district={district}
          beauty={beauty}
          leaf={decoColors.leaf}
          trunk={decoColors.trunk}
          flower={decoColors.flower}
        />
      </group>

      {/* District name label on hover or when selected. The Suspense boundary
          matters: Text suspends while its font loads, and without it the whole
          Canvas subtree would blank out for the first label shown. */}
      {(hovered || selected) && (
        <Suspense fallback={null}>
          <Billboard position={[0, PLATFORM_HEIGHT + district.radius * 0.55 + 3.5, 0]}>
            <Text
              fontSize={2.1}
              color={'#ffffff'}
              outlineWidth={0.16}
              outlineColor={'#1a1622'}
              anchorX="center"
              anchorY="middle"
            >
              {district.name}
            </Text>
          </Billboard>
        </Suspense>
      )}
    </group>
  );
}
