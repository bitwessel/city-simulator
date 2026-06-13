import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { Billboard, Text } from '@react-three/drei';
import type { Mesh } from 'three';
import type { City, District } from '../types';
import { terrainHeightAt } from '../generation/terrain';
import { BuildingMesh, type BuildingPalette } from './BuildingMesh';
import { Decorations } from './Decorations';
import { SELECT_RING } from './shared';
import { ribbonGeometry, type RoadSample } from './Roads';
import {
  buildingFacings,
  districtPathSpokes,
  districtPathTargets,
} from './sceneryLayout';
import { districtMoodTintHex, scaleHex, mixHex, type MoodTheme } from './palette';
import { applyEraToPalette } from './eras';
import { currentAge } from '../simulation/ages';
import { hashFloat } from './hash';

// ---------------------------------------------------------------------------
// Districts — organic building clusters sitting directly on the terrain.
//
// This replaces the retired DistrictPlatform discs. The terrain mesh carries
// the ownership color cue (a faint vertex-color blend toward each district's
// base color); here each district keeps its interactive behavior alive via an
// invisible picking cylinder: click-to-select, hover ring + name label, and
// the pulsing selection ring, all at the district's plateau height.
//
// Buildings sink a touch (-0.12) into the ground so gentle slopes never leave
// a corner floating. Each cluster reads as a neighborhood: light dirt-path
// spokes radiate from the district heart (deterministic per district id), and
// buildings orient toward the nearest path/through-road (with hash jitter)
// instead of facing random directions.
// ---------------------------------------------------------------------------

/** How far buildings sink into the ground (hides slope gaps under edges). */
const BUILDING_SINK = 0.12;

interface DistrictAreaProps {
  city: City;
  district: District;
  theme: MoodTheme;
  selected: boolean;
  beauty: number;
  chaos: number;
  onSelect: (id: string) => void;
}

function DistrictArea({
  city,
  district,
  theme,
  selected,
  beauty,
  chaos,
  onSelect,
}: DistrictAreaProps) {
  const [hovered, setHovered] = useState(false);
  const ringRef = useRef<Mesh>(null);
  const terrain = city.terrain;

  // Plateau height at the district center (flats keep the site level).
  const groundY = useMemo(
    () => terrainHeightAt(terrain, district.position.x, district.position.z),
    // Terrain content is stable per seed (+ founding count, which district
    // lists already reflect); the clone each tick is referentially new only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [city.seed.value, district.id, terrain?.flats.length],
  );

  // Building palette derived once per district (color-only). `glowI` carries
  // the mood's window-glow so skylines glitter at dusk. The city's age then
  // re-dresses the whole palette (thatch → timber → stone → brick → gilt) so
  // every district visibly grows up together (phase 04).
  const era = currentAge(city);
  const buildingPalette = useMemo<BuildingPalette>(() => {
    const wall = districtMoodTintHex(district.visualStyle.baseColor, theme, district.mood);
    return applyEraToPalette(
      {
        wall: scaleHex(wall, 1.12),
        accent: district.visualStyle.accentColor,
        trim: scaleHex(wall, 0.78),
        glow: mixHex(district.visualStyle.accentColor, '#ffffff', 0.3),
        glowI: theme.windowGlow,
      },
      era,
    );
  }, [district.visualStyle.baseColor, district.visualStyle.accentColor, theme, district.mood, era]);

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

  // Each building sits at its own terrain height (minus a small sink).
  const buildingHeights = useMemo(() => {
    const out = new Map<string, number>();
    for (const b of visibleBuildings) {
      out.set(b.id, terrainHeightAt(terrain, b.position.x, b.position.z) - BUILDING_SINK);
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleBuildings, city.seed.value, terrain?.flats.length]);

  // Light dirt-path spokes radiating from the district heart (stable per id).
  const spokes = useMemo(
    () => districtPathSpokes(district),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [district.id],
  );

  // Buildings face the nearest path/through-road point with hash jitter so
  // the cluster reads as a neighborhood (pure helpers in sceneryLayout.ts).
  const facings = useMemo(
    () =>
      buildingFacings(
        district,
        districtPathTargets(district, city.districts, city.roads),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [district.buildings, district.id, city.roads.length, city.districts.length],
  );

  // Ribbon the spokes over the terrain (between the road edge band at 0.035
  // and the main paving at 0.07, so crossings layer sanely).
  const spokeGeometries = useMemo(
    () =>
      spokes.map((pts) => {
        const samples: RoadSample[] = pts.map((p, i) => {
          const prev = pts[Math.max(0, i - 1)];
          const next = pts[Math.min(pts.length - 1, i + 1)];
          let nx = -(next.z - prev.z);
          let nz = next.x - prev.x;
          const len = Math.hypot(nx, nz) || 1;
          nx /= len;
          nz /= len;
          return {
            x: p.x,
            z: p.z,
            nx,
            nz,
            deck: terrainHeightAt(terrain, p.x, p.z),
            bridge: false,
          };
        });
        return ribbonGeometry(samples, 1.1, 0.045);
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [spokes, city.seed.value, terrain?.flats.length],
  );
  useEffect(
    () => () => spokeGeometries.forEach((g) => g.dispose()),
    [spokeGeometries],
  );

  const pathColor = useMemo(() => mixHex('#c8b18a', theme.groundTint, 0.3), [theme]);

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
      ringRef.current.scale.set(s * district.radius, s * district.radius, 1);
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
    // The picking cylinder is an invisible volume: when the same ray also hit
    // a notable-citizen pick sphere (phase 06), the citizen is the visible,
    // intended target — yield without stopping propagation so the click
    // reaches it (R3F delivers hits nearest-first, and the cylinder wall is
    // usually in front of a citizen standing inside the district).
    if (e.intersections.some((h) => h.object.userData?.castPick === true)) return;
    e.stopPropagation();
    onSelect(district.id);
  };

  const cx = district.position.x;
  const cz = district.position.z;

  return (
    <group>
      {/* Invisible picking volume: keeps click/hover alive without a disc. */}
      <mesh
        position={[cx, groundY + 2.2, cz]}
        onPointerOver={handleOver}
        onPointerOut={handleOut}
        onClick={handleClick}
      >
        <cylinderGeometry args={[district.radius, district.radius, 7, 16]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      {/* Soft hover ring hugging the ground. */}
      {hovered && !selected && (
        <mesh
          geometry={SELECT_RING}
          position={[cx, groundY + 0.22, cz]}
          rotation={[-Math.PI / 2, 0, 0]}
          scale={[district.radius * 1.02, district.radius * 1.02, 1]}
        >
          <meshStandardMaterial
            color={'#ffffff'}
            emissive={'#ffffff'}
            emissiveIntensity={0.5}
            transparent
            opacity={0.5}
            roughness={0.5}
          />
        </mesh>
      )}

      {/* Pulsing selection ring. */}
      {selected && (
        <mesh
          ref={ringRef}
          geometry={SELECT_RING}
          position={[cx, groundY + 0.26, cz]}
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

      {/* Intra-district dirt paths so the cluster reads as a neighborhood. */}
      {spokeGeometries.map((g, i) => (
        <mesh key={`path-${i}`} geometry={g} receiveShadow raycast={() => null}>
          <meshStandardMaterial
            color={pathColor}
            roughness={1}
            metalness={0}
            transparent
            opacity={0.85}
          />
        </mesh>
      ))}

      {/* Buildings, each grounded at its own terrain height, facing the
          nearest path. */}
      {visibleBuildings.map((b) => (
        <group key={b.id} position={[0, buildingHeights.get(b.id) ?? groundY, 0]}>
          <BuildingMesh
            building={b}
            palette={buildingPalette}
            wobble={wobbleSet.has(b.id)}
            facing={facings.get(b.id)}
          />
        </group>
      ))}
      <Decorations
        district={district}
        beauty={beauty}
        leaf={decoColors.leaf}
        trunk={decoColors.trunk}
        flower={decoColors.flower}
        groundAt={(x, z) => terrainHeightAt(terrain, x, z)}
      />

      {/* District name label on hover or when selected. The Suspense boundary
          matters: Text suspends while its font loads, and without it the whole
          Canvas subtree would blank out for the first label shown. */}
      {(hovered || selected) && (
        <Suspense fallback={null}>
          <Billboard position={[cx, groundY + district.radius * 0.55 + 4, cz]}>
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

export interface DistrictsProps {
  city: City;
  theme: MoodTheme;
  selectedDistrictId: string | null;
  onSelectDistrict: (id: string | null) => void;
}

export function Districts({
  city,
  theme,
  selectedDistrictId,
  onSelectDistrict,
}: DistrictsProps) {
  const { beauty, chaos } = city.stats;
  return (
    <>
      {city.districts.map((district) => (
        <DistrictArea
          key={district.id}
          city={city}
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
