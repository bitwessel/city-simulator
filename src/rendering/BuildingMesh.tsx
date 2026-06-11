import { useMemo, useRef, type ReactElement } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Group } from 'three';
import type { Building, BuildingKind } from '../types';
import {
  UNIT_BOX,
  UNIT_CONE,
  UNIT_CONE_SMOOTH,
  UNIT_CYLINDER,
  UNIT_CYLINDER_LOW,
  UNIT_DISC,
  UNIT_SPHERE,
  LOWPOLY_SPHERE,
  TOWER_BODY,
  UNIT_TORUS,
} from './shared';
import { hashFloat } from './hash';
import { shiftHSL } from './palette';

// ---------------------------------------------------------------------------
// BuildingMesh — a distinct low-poly silhouette per BuildingKind (21 kinds).
//
// Each building is a small <group> that owns its full transform (the parent
// places it at world coords + PLATFORM_HEIGHT). Geometry comes from the shared
// module-level cache; only lightweight materials (3-5 colors) are created,
// memoized per building id + kind + palette so day ticks don't rebuild them.
//
// Tall "skyscraper era" kinds (apartment, skyscraper, arcane-spire, grand-hall)
// derive their height from `building.floors`. Per-building HSL variation keeps
// a district cohesive-but-alive instead of monochrome, and emissive windows
// brighten (`glowI`) in dusky moods so skylines glitter.
// ---------------------------------------------------------------------------

export interface BuildingPalette {
  /** Wall / body color (mood-tinted district base). */
  wall: string;
  /** Roof / accent color (district accent). */
  accent: string;
  /** Secondary structural color (slightly darker wall). */
  trim: string;
  /** Emissive glow used for magical / lit elements. */
  glow: string;
  /** Window/lamp emissive intensity for this mood (rises at dusk). */
  glowI: number;
}

interface BuildingMeshProps {
  building: Building;
  palette: BuildingPalette;
  /** Whether the chaos wobble effect is active for this building. */
  wobble?: boolean;
  /**
   * Y rotation override: districts orient buildings toward the nearest
   * path/road (plus jitter) so clusters read as neighborhoods. Falls back to
   * the building's generated random rotation when absent.
   */
  facing?: number;
}

// Standard material props for the toy-diorama look: flat, matte, a touch of
// roughness. We disable specular highlights for the low-poly feel.
const MAT = { roughness: 0.85, metalness: 0.05 } as const;

/** World units of body height per storey (before the parent's scale*1.5). */
const FLOOR_HEIGHT = 0.62;

/**
 * A row of emissive "windows" rendered as a single thin emissive box strip per
 * face — cheap (a few boxes), not hundreds of meshes. `n` faces get strips.
 */
function windowStrip(
  key: string,
  bodyH: number,
  halfW: number,
  halfD: number,
  rows: number,
  glow: string,
  glowI: number,
) {
  const strips: ReactElement[] = [];
  // Cap the number of window bands so very tall towers don't explode the mesh
  // count (a 16-floor tower draws at most 8 bands per face, not 16). The bands
  // still read as a glittering grid from any camera distance.
  rows = Math.max(1, Math.min(8, rows));
  const rowGap = bodyH / (rows + 1);
  // 4 faces; offset alternate faces a touch so the grid reads.
  const faces: [number, number, number, number, number][] = [
    [0, 0, halfD + 0.01, 0, 0], //  +z  (x,z,offsetZ,rotY,axis)
    [0, 0, -halfD - 0.01, Math.PI, 0],
    [halfW + 0.01, 0, 0, Math.PI / 2, 1],
    [-halfW - 0.01, 0, 0, -Math.PI / 2, 1],
  ];
  for (let f = 0; f < faces.length; f++) {
    const [fx, , fz, ry, axis] = faces[f];
    const faceW = axis === 0 ? halfW * 1.5 : halfD * 1.5;
    for (let r = 0; r < rows; r++) {
      const y = rowGap * (r + 1);
      // Slight per-row, per-face flicker of which windows are lit (cheap: one
      // strip whose emissive intensity varies a touch deterministically).
      const lit = 0.55 + hashFloat(key, f * 17 + r * 3 + 1) * 0.9;
      strips.push(
        <mesh
          key={`w-${f}-${r}`}
          geometry={UNIT_BOX}
          position={[fx, y, fz]}
          rotation={[0, ry, 0]}
          scale={[faceW, rowGap * 0.42, 0.04]}
        >
          <meshStandardMaterial
            color={'#fff2c4'}
            emissive={glow}
            emissiveIntensity={glowI * lit}
            userData={{
              glowDay: glowI * lit,
              glowNight: Math.min(3, glowI * lit * 2.2 + 1.1),
            }}
            toneMapped={false}
            roughness={0.5}
            metalness={0}
          />
        </mesh>,
      );
    }
  }
  return strips;
}

// Rough footprint half-extent per landmark kind, so the matching scaffolding
// site can be sized to the building it will become. Landmarks are bigger than
// roster buildings, so these run larger than a house. Keyed by kind; unknown
// kinds fall back to a medium pad.
const LANDMARK_FOOTPRINT: Partial<Record<BuildingKind, number>> = {
  grove: 1.7,
  'fountain-plaza': 1.9,
  lighthouse: 1.0,
  observatory: 1.3,
  bathhouse: 1.7,
  amphitheater: 2.0,
  menagerie: 1.8,
  'bell-tower': 0.9,
  'hedge-maze': 1.8,
  'hot-springs': 1.7,
  aviary: 1.2,
  moondial: 1.6,
};

/**
 * Scaffolding / works site rendered while `building.construction === true`,
 * replacing the finished landmark for several in-game days. Charming and a
 * little busy: a raw-timber frame around a half-poured footing, a swinging
 * crane arm carrying a stone block, a few crates and a ladder. Sized to roughly
 * match the landmark's eventual footprint. Cosmetic jitter is hash-driven so it
 * never twitches between frames. The crane arm is tagged so the parent can swing
 * it gently.
 */
function buildScaffold(building: Building, p: BuildingPalette) {
  const id = building.id;
  const half = LANDMARK_FOOTPRINT[building.kind] ?? 1.3;
  // Warm bare-timber tones, independent of district palette so every site reads
  // as "under construction" regardless of where it stands.
  const timber = '#9c6b3f';
  const timberDark = '#7c5230';
  const stone = p.trim;
  const crate = '#b07a44';
  // Corner posts of the frame, inset a touch from the footprint edge.
  const px = half * 0.82;
  const postH = 1.0 + hashFloat(id, 71) * 0.5;
  const corners: [number, number][] = [
    [px, px],
    [-px, px],
    [px, -px],
    [-px, -px],
  ];
  // Crane mast sits at one back corner; its arm reaches over the footing.
  const mastH = postH + 0.9 + hashFloat(id, 72) * 0.4;
  const craneSign = hashFloat(id, 73) < 0.5 ? 1 : -1;
  return (
    <group>
      {/* half-poured stone footing / foundation pad */}
      <mesh geometry={UNIT_CYLINDER_LOW} position={[0, 0.12, 0]} scale={[half * 1.5, 0.24, half * 1.5]}>
        <meshStandardMaterial color={stone} {...MAT} />
      </mesh>
      <mesh geometry={UNIT_BOX} position={[half * 0.2, 0.32, -half * 0.1]} scale={[half * 0.7, 0.4, half * 0.6]}>
        <meshStandardMaterial color={p.wall} {...MAT} />
      </mesh>
      {/* corner posts */}
      {corners.map(([cx, cz], i) => (
        <mesh
          key={`post-${i}`}
          geometry={UNIT_BOX}
          position={[cx, postH / 2, cz]}
          scale={[0.12, postH, 0.12]}
          castShadow
        >
          <meshStandardMaterial color={timber} {...MAT} />
        </mesh>
      ))}
      {/* top rails linking the posts into a frame (two sides + cross brace) */}
      <mesh geometry={UNIT_BOX} position={[0, postH, px]} scale={[px * 2, 0.1, 0.1]}>
        <meshStandardMaterial color={timberDark} {...MAT} />
      </mesh>
      <mesh geometry={UNIT_BOX} position={[0, postH, -px]} scale={[px * 2, 0.1, 0.1]}>
        <meshStandardMaterial color={timberDark} {...MAT} />
      </mesh>
      <mesh geometry={UNIT_BOX} position={[px, postH * 0.55, 0]} rotation={[Math.PI / 5, 0, 0]} scale={[0.08, 0.08, postH * 1.3]}>
        <meshStandardMaterial color={timber} {...MAT} />
      </mesh>
      {/* a leaning ladder against one post */}
      <mesh geometry={UNIT_BOX} position={[-px, postH * 0.5, px * 0.4]} rotation={[0.18, 0, 0.22]} scale={[0.07, postH * 1.05, 0.07]}>
        <meshStandardMaterial color={timberDark} {...MAT} />
      </mesh>
      {/* crane: a mast at one corner with a swinging arm + hanging block */}
      <group position={[-px, 0, -px]}>
        <mesh geometry={UNIT_BOX} position={[0, mastH / 2, 0]} scale={[0.14, mastH, 0.14]} castShadow>
          <meshStandardMaterial color={timberDark} {...MAT} />
        </mesh>
        <group name="crane-arm" position={[0, mastH - 0.1, 0]} rotation={[0, craneSign * 0.5, 0]}>
          {/* the jib reaching out over the footing */}
          <mesh geometry={UNIT_BOX} position={[half * 0.55, 0, 0]} scale={[half * 1.3, 0.09, 0.09]}>
            <meshStandardMaterial color={timber} {...MAT} />
          </mesh>
          {/* cable + suspended stone block */}
          <mesh geometry={UNIT_BOX} position={[half * 1.05, -0.28, 0]} scale={[0.02, 0.55, 0.02]}>
            <meshStandardMaterial color={'#3b3b3b'} {...MAT} />
          </mesh>
          <mesh geometry={UNIT_BOX} position={[half * 1.05, -0.62, 0]} scale={[0.28, 0.24, 0.28]}>
            <meshStandardMaterial color={stone} {...MAT} />
          </mesh>
        </group>
      </group>
      {/* a small stack of crates + a couple of loose stones */}
      <mesh geometry={UNIT_BOX} position={[px * 0.7, 0.18, px * 0.8]} rotation={[0, hashFloat(id, 74) * 0.6, 0]} scale={[0.3, 0.3, 0.3]}>
        <meshStandardMaterial color={crate} {...MAT} />
      </mesh>
      <mesh geometry={UNIT_BOX} position={[px * 0.95, 0.16, px * 0.5]} rotation={[0, hashFloat(id, 75) * 0.6, 0]} scale={[0.26, 0.26, 0.26]}>
        <meshStandardMaterial color={crate} {...MAT} />
      </mesh>
      <mesh geometry={UNIT_BOX} position={[px * 0.72, 0.46, px * 0.82]} rotation={[0, hashFloat(id, 76) * 0.6, 0]} scale={[0.24, 0.24, 0.24]}>
        <meshStandardMaterial color={crate} {...MAT} />
      </mesh>
      <mesh geometry={LOWPOLY_SPHERE} position={[-px * 0.6, 0.12, px * 0.9]} scale={[0.3, 0.2, 0.3]}>
        <meshStandardMaterial color={stone} {...MAT} />
      </mesh>
      {/* a faint lantern on the frame so the site reads at dusk */}
      <mesh geometry={UNIT_SPHERE} position={[px, postH + 0.12, px]} scale={[0.12, 0.14, 0.12]}>
        <meshStandardMaterial
          color={'#ffe6a8'}
          emissive={'#ffcf6b'}
          emissiveIntensity={0.4 + p.glowI * 0.6}
          userData={{ glowDay: 0.4 + p.glowI * 0.6, glowNight: 2.0 }}
          toneMapped={false}
          {...MAT}
        />
      </mesh>
    </group>
  );
}

/**
 * Per-kind static sub-scene. Returned as JSX built from shared geometry +
 * inline materials. Tall kinds read `building.floors` for height. Per-building
 * variation is already baked into the palette passed in (HSL-shifted by id).
 *
 * Mayor-project landmarks (`grove`, `lighthouse`, ...) render bigger, more
 * detailed silhouettes than roster buildings with a slight emissive accent so
 * they read as *special* at the default camera distance. While a landmark is a
 * construction site (`building.construction`), `buildScaffold` replaces it.
 */
function buildKind(building: Building, p: BuildingPalette) {
  if (building.construction) {
    return buildScaffold(building, p);
  }

  const kind = building.kind;
  const wall = p.wall;
  const accent = p.accent;
  const trim = p.trim;
  const glow = p.glow;
  const glowI = p.glowI;
  const id = building.id;
  const floors = building.floors ?? 4;

  switch (kind) {
    case 'house':
      return (
        <group>
          <mesh geometry={UNIT_BOX} position={[0, 0.45, 0]} scale={[1.1, 0.9, 1]} castShadow>
            <meshStandardMaterial color={wall} {...MAT} />
          </mesh>
          <mesh geometry={UNIT_CONE} position={[0, 1.15, 0]} rotation={[0, Math.PI / 6, 0]} scale={[1.5, 0.7, 1.35]}>
            <meshStandardMaterial color={accent} {...MAT} />
          </mesh>
          <mesh geometry={UNIT_BOX} position={[0, 0.25, 0.52]} scale={[0.22, 0.4, 0.1]}>
            <meshStandardMaterial color={trim} {...MAT} />
          </mesh>
          {/* a small hearth window that lights up after dusk */}
          <mesh geometry={UNIT_BOX} position={[0.3, 0.5, 0.51]} scale={[0.2, 0.22, 0.04]}>
            <meshStandardMaterial
              color={'#ffe6a8'}
              emissive={'#ffcf6b'}
              emissiveIntensity={glowI * 0.3}
              userData={{ glowDay: glowI * 0.3, glowNight: 1.9 }}
              toneMapped={false}
              {...MAT}
            />
          </mesh>
        </group>
      );

    case 'tower':
      return (
        <group>
          <mesh geometry={UNIT_BOX} position={[0, 0.9, 0]} scale={[0.85, 1.8, 0.85]} castShadow>
            <meshStandardMaterial color={wall} {...MAT} />
          </mesh>
          <mesh geometry={UNIT_BOX} position={[0, 1.85, 0]} scale={[1, 0.18, 1]}>
            <meshStandardMaterial color={trim} {...MAT} />
          </mesh>
          <mesh geometry={UNIT_CONE} position={[0, 2.25, 0]} scale={[1.05, 0.85, 1.05]}>
            <meshStandardMaterial color={accent} {...MAT} />
          </mesh>
        </group>
      );

    case 'market-stall':
      return (
        <group>
          <mesh geometry={UNIT_BOX} position={[0, 0.3, 0]} scale={[1.3, 0.55, 0.9]}>
            <meshStandardMaterial color={trim} {...MAT} />
          </mesh>
          {/* striped awning */}
          <mesh geometry={UNIT_BOX} position={[0, 0.78, 0]} scale={[1.5, 0.08, 1.1]} rotation={[0.12, 0, 0]}>
            <meshStandardMaterial color={accent} {...MAT} />
          </mesh>
          <mesh geometry={UNIT_BOX} position={[-0.6, 0.45, -0.4]} scale={[0.08, 0.7, 0.08]}>
            <meshStandardMaterial color={wall} {...MAT} />
          </mesh>
          <mesh geometry={UNIT_BOX} position={[0.6, 0.45, -0.4]} scale={[0.08, 0.7, 0.08]}>
            <meshStandardMaterial color={wall} {...MAT} />
          </mesh>
        </group>
      );

    case 'workshop':
      return (
        <group>
          <mesh geometry={UNIT_BOX} position={[0, 0.4, 0]} scale={[1.3, 0.8, 1]} castShadow>
            <meshStandardMaterial color={wall} {...MAT} />
          </mesh>
          {/* sawtooth roof */}
          <mesh geometry={UNIT_BOX} position={[-0.3, 0.95, 0]} rotation={[0, 0, 0.5]} scale={[0.55, 0.45, 1.05]}>
            <meshStandardMaterial color={accent} {...MAT} />
          </mesh>
          <mesh geometry={UNIT_BOX} position={[0.4, 0.95, 0]} rotation={[0, 0, 0.5]} scale={[0.55, 0.45, 1.05]}>
            <meshStandardMaterial color={accent} {...MAT} />
          </mesh>
          {/* chimney */}
          <mesh geometry={UNIT_CYLINDER} position={[0.5, 1.1, -0.3]} scale={[0.18, 0.7, 0.18]}>
            <meshStandardMaterial color={trim} {...MAT} />
          </mesh>
        </group>
      );

    case 'temple':
      return (
        <group>
          {/* stepped base */}
          <mesh geometry={UNIT_BOX} position={[0, 0.18, 0]} scale={[1.5, 0.36, 1.2]}>
            <meshStandardMaterial color={trim} {...MAT} />
          </mesh>
          <mesh geometry={UNIT_BOX} position={[0, 0.7, 0]} scale={[1.1, 0.7, 0.85]} castShadow>
            <meshStandardMaterial color={wall} {...MAT} />
          </mesh>
          {/* columns */}
          {[-0.42, 0.42].map((x) => (
            <mesh key={x} geometry={UNIT_CYLINDER} position={[x, 0.6, 0.45]} scale={[0.12, 0.7, 0.12]}>
              <meshStandardMaterial color={trim} {...MAT} />
            </mesh>
          ))}
          {/* pediment */}
          <mesh geometry={UNIT_CONE} position={[0, 1.3, 0]} rotation={[0, Math.PI / 4, 0]} scale={[1.4, 0.55, 1.1]}>
            <meshStandardMaterial color={accent} {...MAT} />
          </mesh>
        </group>
      );

    case 'tavern':
      return (
        <group>
          <mesh geometry={UNIT_BOX} position={[0, 0.4, 0]} scale={[1.2, 0.8, 1]} castShadow>
            <meshStandardMaterial color={wall} {...MAT} />
          </mesh>
          {/* upper jettied storey */}
          <mesh geometry={UNIT_BOX} position={[0, 1.0, 0]} scale={[1.35, 0.5, 1.15]}>
            <meshStandardMaterial color={trim} {...MAT} />
          </mesh>
          <mesh geometry={UNIT_CONE} position={[0, 1.55, 0]} rotation={[0, Math.PI / 6, 0]} scale={[1.7, 0.6, 1.5]}>
            <meshStandardMaterial color={accent} {...MAT} />
          </mesh>
          {/* hanging sign — lit */}
          <mesh geometry={UNIT_BOX} position={[0.7, 0.7, 0.5]} scale={[0.3, 0.3, 0.05]}>
            <meshStandardMaterial
              color={accent}
              emissive={glow}
              emissiveIntensity={0.2 + glowI * 0.5}
              userData={{ glowDay: 0.2 + glowI * 0.5, glowNight: 1.7 }}
              {...MAT}
            />
          </mesh>
          {/* warm window glows */}
          <mesh geometry={UNIT_BOX} position={[-0.3, 0.45, 0.51]} scale={[0.22, 0.26, 0.04]}>
            <meshStandardMaterial
              color={'#ffe6a8'}
              emissive={'#ffcf6b'}
              emissiveIntensity={glowI * 0.8}
              userData={{ glowDay: glowI * 0.8, glowNight: 2.3 }}
              toneMapped={false}
              {...MAT}
            />
          </mesh>
          <mesh geometry={UNIT_BOX} position={[0.25, 0.45, 0.51]} scale={[0.22, 0.26, 0.04]}>
            <meshStandardMaterial
              color={'#ffe6a8'}
              emissive={'#ffcf6b'}
              emissiveIntensity={glowI * 0.8}
              userData={{ glowDay: glowI * 0.8, glowNight: 2.3 }}
              toneMapped={false}
              {...MAT}
            />
          </mesh>
        </group>
      );

    case 'warehouse':
      return (
        <group>
          <mesh geometry={UNIT_BOX} position={[0, 0.5, 0]} scale={[1.6, 1, 1.2]} castShadow>
            <meshStandardMaterial color={wall} {...MAT} />
          </mesh>
          {/* barrel roof */}
          <mesh geometry={UNIT_CYLINDER} position={[0, 1.05, 0]} rotation={[0, 0, Math.PI / 2]} scale={[0.6, 1.65, 1.25]}>
            <meshStandardMaterial color={accent} {...MAT} />
          </mesh>
          <mesh geometry={UNIT_BOX} position={[0, 0.4, 0.61]} scale={[0.5, 0.6, 0.05]}>
            <meshStandardMaterial color={trim} {...MAT} />
          </mesh>
        </group>
      );

    case 'mansion':
      return (
        <group>
          <mesh geometry={UNIT_BOX} position={[0, 0.55, 0]} scale={[1.7, 1.1, 1.2]} castShadow>
            <meshStandardMaterial color={wall} {...MAT} />
          </mesh>
          {/* wings */}
          <mesh geometry={UNIT_BOX} position={[-0.95, 0.4, 0]} scale={[0.5, 0.8, 1]}>
            <meshStandardMaterial color={wall} {...MAT} />
          </mesh>
          <mesh geometry={UNIT_BOX} position={[0.95, 0.4, 0]} scale={[0.5, 0.8, 1]}>
            <meshStandardMaterial color={wall} {...MAT} />
          </mesh>
          <mesh geometry={UNIT_BOX} position={[0, 1.2, 0]} scale={[1.8, 0.18, 1.3]}>
            <meshStandardMaterial color={trim} {...MAT} />
          </mesh>
          {/* tall parlor windows that light up after dusk */}
          {[-0.45, 0.45].map((x) => (
            <mesh key={`mw-${x}`} geometry={UNIT_BOX} position={[x, 0.6, 0.61]} scale={[0.24, 0.42, 0.04]}>
              <meshStandardMaterial
                color={'#ffe6a8'}
                emissive={'#ffcf6b'}
                emissiveIntensity={glowI * 0.35}
                userData={{ glowDay: glowI * 0.35, glowNight: 2.0 }}
                toneMapped={false}
                {...MAT}
              />
            </mesh>
          ))}
          {/* hipped roof + dome */}
          <mesh geometry={UNIT_CONE} position={[0, 1.55, 0]} rotation={[0, Math.PI / 4, 0]} scale={[2, 0.5, 1.5]}>
            <meshStandardMaterial color={accent} {...MAT} />
          </mesh>
          <mesh geometry={UNIT_SPHERE} position={[0, 1.45, 0]} scale={[0.4, 0.4, 0.4]}>
            <meshStandardMaterial color={accent} metalness={0.4} roughness={0.4} />
          </mesh>
        </group>
      );

    case 'library':
      return (
        <group>
          <mesh geometry={UNIT_BOX} position={[0, 0.6, 0]} scale={[1.5, 1.2, 1.1]} castShadow>
            <meshStandardMaterial color={wall} {...MAT} />
          </mesh>
          {/* tall arched windows hinted with trim strips */}
          {[-0.45, 0, 0.45].map((x) => (
            <mesh key={x} geometry={UNIT_BOX} position={[x, 0.65, 0.56]} scale={[0.18, 0.8, 0.05]}>
              <meshStandardMaterial color={trim} {...MAT} />
            </mesh>
          ))}
          <mesh geometry={UNIT_BOX} position={[0, 1.25, 0]} scale={[1.6, 0.2, 1.2]}>
            <meshStandardMaterial color={accent} {...MAT} />
          </mesh>
          {/* small cupola */}
          <mesh geometry={UNIT_CYLINDER} position={[0, 1.5, 0]} scale={[0.35, 0.3, 0.35]}>
            <meshStandardMaterial color={trim} {...MAT} />
          </mesh>
          <mesh geometry={UNIT_CONE_SMOOTH} position={[0, 1.78, 0]} scale={[0.45, 0.4, 0.45]}>
            <meshStandardMaterial color={accent} {...MAT} />
          </mesh>
        </group>
      );

    case 'wizard-tower':
      return (
        <group>
          <mesh geometry={TOWER_BODY} position={[0, 1.2, 0]} scale={[0.7, 2.4, 0.7]} castShadow>
            <meshStandardMaterial color={wall} {...MAT} />
          </mesh>
          {/* crooked upper section */}
          <mesh geometry={TOWER_BODY} position={[0.12, 2.55, 0.05]} rotation={[0.08, 0, -0.06]} scale={[0.5, 0.9, 0.5]}>
            <meshStandardMaterial color={trim} {...MAT} />
          </mesh>
          {/* glowing conical roof tip */}
          <mesh geometry={UNIT_CONE_SMOOTH} position={[0.16, 3.3, 0.08]} rotation={[0.08, 0, -0.06]} scale={[0.6, 1.1, 0.6]}>
            <meshStandardMaterial color={accent} emissive={glow} emissiveIntensity={0.9} {...MAT} />
          </mesh>
          {/* orb */}
          <mesh geometry={UNIT_SPHERE} position={[0.16, 3.95, 0.08]} scale={[0.22, 0.22, 0.22]}>
            <meshStandardMaterial color={glow} emissive={glow} emissiveIntensity={2.2} roughness={0.3} toneMapped={false} />
          </mesh>
        </group>
      );

    case 'statue':
      return (
        <group>
          {/* plinth */}
          <mesh geometry={UNIT_BOX} position={[0, 0.25, 0]} scale={[0.7, 0.5, 0.7]}>
            <meshStandardMaterial color={trim} {...MAT} />
          </mesh>
          {/* figure: stacked body + head */}
          <mesh geometry={UNIT_CYLINDER} position={[0, 0.8, 0]} scale={[0.28, 0.7, 0.28]}>
            <meshStandardMaterial color={accent} metalness={0.3} roughness={0.5} />
          </mesh>
          <mesh geometry={UNIT_SPHERE} position={[0, 1.25, 0]} scale={[0.26, 0.3, 0.26]}>
            <meshStandardMaterial color={accent} metalness={0.3} roughness={0.5} />
          </mesh>
          {/* outstretched arm */}
          <mesh geometry={UNIT_BOX} position={[0.22, 1.0, 0]} rotation={[0, 0, -0.6]} scale={[0.35, 0.1, 0.1]}>
            <meshStandardMaterial color={accent} metalness={0.3} roughness={0.5} />
          </mesh>
        </group>
      );

    case 'mill':
      // Blades are animated by the parent group via a ref; here we lay out the
      // static body + a marked sub-group the animator spins.
      return (
        <group>
          <mesh geometry={UNIT_CYLINDER} position={[0, 0.85, 0]} scale={[0.85, 1.7, 0.85]} castShadow>
            <meshStandardMaterial color={wall} {...MAT} />
          </mesh>
          <mesh geometry={UNIT_CONE} position={[0, 1.95, 0]} scale={[1.05, 0.7, 1.05]}>
            <meshStandardMaterial color={accent} {...MAT} />
          </mesh>
          {/* hub */}
          <mesh geometry={UNIT_CYLINDER} position={[0, 1.3, 0.5]} rotation={[Math.PI / 2, 0, 0]} scale={[0.16, 0.3, 0.16]}>
            <meshStandardMaterial color={trim} {...MAT} />
          </mesh>
          {/* spinning blades */}
          <group name="mill-blades" position={[0, 1.3, 0.62]}>
            {[0, 1, 2, 3].map((i) => (
              <mesh
                key={i}
                geometry={UNIT_BOX}
                rotation={[0, 0, (i * Math.PI) / 2]}
                position={[Math.cos((i * Math.PI) / 2) * 0.55, Math.sin((i * Math.PI) / 2) * 0.55, 0]}
                scale={[0.9, 0.18, 0.04]}
              >
                <meshStandardMaterial color={accent} {...MAT} />
              </mesh>
            ))}
          </group>
        </group>
      );

    case 'dock':
      return (
        <group>
          {/* planked platform */}
          <mesh geometry={UNIT_BOX} position={[0, 0.15, 0]} scale={[1.6, 0.16, 0.9]}>
            <meshStandardMaterial color={trim} {...MAT} />
          </mesh>
          {/* posts */}
          {[-0.6, 0, 0.6].map((x) => (
            <mesh key={x} geometry={UNIT_CYLINDER} position={[x, 0.0, 0.4]} scale={[0.1, 0.6, 0.1]}>
              <meshStandardMaterial color={wall} {...MAT} />
            </mesh>
          ))}
          {/* small hut */}
          <mesh geometry={UNIT_BOX} position={[-0.5, 0.5, -0.1]} scale={[0.55, 0.5, 0.6]}>
            <meshStandardMaterial color={wall} {...MAT} />
          </mesh>
          <mesh geometry={UNIT_CONE} position={[-0.5, 0.9, -0.1]} rotation={[0, Math.PI / 4, 0]} scale={[0.8, 0.4, 0.85]}>
            <meshStandardMaterial color={accent} {...MAT} />
          </mesh>
          {/* crate */}
          <mesh geometry={UNIT_BOX} position={[0.55, 0.35, 0.0]} scale={[0.3, 0.3, 0.3]}>
            <meshStandardMaterial color={accent} {...MAT} />
          </mesh>
        </group>
      );

    case 'greenhouse':
      return (
        <group>
          {/* low brick base */}
          <mesh geometry={UNIT_BOX} position={[0, 0.18, 0]} scale={[1.3, 0.36, 0.95]}>
            <meshStandardMaterial color={trim} {...MAT} />
          </mesh>
          {/* translucent glass body */}
          <mesh geometry={UNIT_BOX} position={[0, 0.7, 0]} scale={[1.2, 0.7, 0.85]}>
            <meshStandardMaterial color={'#bfe9d2'} transparent opacity={0.4} roughness={0.1} metalness={0.0} />
          </mesh>
          {/* gabled glass roof */}
          <mesh geometry={UNIT_CONE} position={[0, 1.2, 0]} rotation={[0, Math.PI / 4, 0]} scale={[1.6, 0.5, 1.1]}>
            <meshStandardMaterial color={'#cdeedd'} transparent opacity={0.45} roughness={0.1} />
          </mesh>
          {/* frame ridges */}
          <mesh geometry={UNIT_BOX} position={[0, 1.05, 0]} scale={[1.25, 0.05, 0.05]}>
            <meshStandardMaterial color={accent} {...MAT} />
          </mesh>
          {/* a hint of green inside */}
          <mesh geometry={LOWPOLY_SPHERE} position={[0, 0.55, 0]} scale={[0.5, 0.4, 0.4]}>
            <meshStandardMaterial color={'#4f9d54'} {...MAT} />
          </mesh>
        </group>
      );

    case 'ruin':
      return (
        <group>
          {/* broken, tilted wall fragments */}
          <mesh geometry={UNIT_BOX} position={[-0.3, 0.45, 0]} rotation={[0, 0, 0.12]} scale={[0.4, 0.9, 0.8]}>
            <meshStandardMaterial color={wall} {...MAT} />
          </mesh>
          <mesh geometry={UNIT_BOX} position={[0.35, 0.3, 0.1]} rotation={[0.1, 0.3, -0.18]} scale={[0.45, 0.6, 0.7]}>
            <meshStandardMaterial color={wall} {...MAT} />
          </mesh>
          {/* fallen column */}
          <mesh geometry={UNIT_CYLINDER} position={[0.1, 0.18, 0.6]} rotation={[0, 0, Math.PI / 2]} scale={[0.18, 0.9, 0.18]}>
            <meshStandardMaterial color={trim} {...MAT} />
          </mesh>
          {/* standing column stub */}
          <mesh geometry={UNIT_CYLINDER} position={[-0.45, 0.35, -0.4]} scale={[0.16, 0.7, 0.16]}>
            <meshStandardMaterial color={trim} {...MAT} />
          </mesh>
          {/* rubble */}
          <mesh geometry={LOWPOLY_SPHERE} position={[0.0, 0.1, -0.1]} scale={[0.3, 0.2, 0.3]}>
            <meshStandardMaterial color={trim} {...MAT} />
          </mesh>
        </group>
      );

    case 'fountain':
      return (
        <group>
          {/* basin */}
          <mesh geometry={UNIT_CYLINDER_LOW} position={[0, 0.18, 0]} scale={[1.3, 0.36, 1.3]}>
            <meshStandardMaterial color={trim} {...MAT} />
          </mesh>
          <mesh geometry={UNIT_CYLINDER_LOW} position={[0, 0.3, 0]} scale={[1.0, 0.18, 1.0]}>
            <meshStandardMaterial color={wall} {...MAT} />
          </mesh>
          {/* center pillar */}
          <mesh geometry={UNIT_CYLINDER} position={[0, 0.55, 0]} scale={[0.18, 0.6, 0.18]}>
            <meshStandardMaterial color={wall} {...MAT} />
          </mesh>
          <mesh geometry={UNIT_SPHERE} position={[0, 0.9, 0]} scale={[0.22, 0.22, 0.22]}>
            <meshStandardMaterial color={accent} {...MAT} />
          </mesh>
          {/* animated water disc */}
          <group name="fountain-water">
            <mesh geometry={UNIT_DISC} position={[0, 0.4, 0]} scale={[1.7, 1, 1.7]}>
              <meshStandardMaterial
                color={'#7ec8e3'}
                transparent
                opacity={0.7}
                roughness={0.15}
                metalness={0.2}
                emissive={'#2b6f8c'}
                emissiveIntensity={0.15}
              />
            </mesh>
          </group>
        </group>
      );

    case 'tent':
      return (
        <group>
          <mesh geometry={UNIT_CONE} position={[0, 0.7, 0]} rotation={[0, Math.PI / 6, 0]} scale={[1.5, 1.4, 1.5]} castShadow>
            <meshStandardMaterial color={accent} {...MAT} />
          </mesh>
          {/* door flap */}
          <mesh geometry={UNIT_CONE} position={[0, 0.4, 0.55]} rotation={[Math.PI, 0, 0]} scale={[0.45, 0.7, 0.3]}>
            <meshStandardMaterial color={trim} {...MAT} />
          </mesh>
          {/* finial */}
          <mesh geometry={UNIT_SPHERE} position={[0, 1.42, 0]} scale={[0.14, 0.18, 0.14]}>
            <meshStandardMaterial color={wall} {...MAT} />
          </mesh>
        </group>
      );

    // ===== Tall, late-game "skyscraper era" kinds ===========================

    case 'apartment': {
      // Mid-rise residential block: stacked storeys + window rows + flat or
      // mansard roof + a rooftop water tank.
      const bodyH = floors * FLOOR_HEIGHT;
      const halfW = 0.62;
      const halfD = 0.5;
      const mansard = hashFloat(id, 21) < 0.5;
      return (
        <group>
          {/* plinth */}
          <mesh geometry={UNIT_BOX} position={[0, 0.12, 0]} scale={[halfW * 2.2, 0.24, halfD * 2.2]}>
            <meshStandardMaterial color={trim} {...MAT} />
          </mesh>
          {/* body */}
          <mesh geometry={UNIT_BOX} position={[0, bodyH / 2 + 0.2, 0]} scale={[halfW * 2, bodyH, halfD * 2]} castShadow>
            <meshStandardMaterial color={wall} {...MAT} />
          </mesh>
          {/* horizontal floor banding */}
          {Array.from({ length: floors - 1 }, (_, r) => (
            <mesh
              key={`band-${r}`}
              geometry={UNIT_BOX}
              position={[0, 0.2 + FLOOR_HEIGHT * (r + 1), 0]}
              scale={[halfW * 2.05, 0.05, halfD * 2.05]}
            >
              <meshStandardMaterial color={trim} {...MAT} />
            </mesh>
          ))}
          <group position={[0, 0.2, 0]}>{windowStrip(id, bodyH, halfW, halfD, floors, '#ffdf9c', glowI * 0.9)}</group>
          {/* roof */}
          {mansard ? (
            <mesh geometry={UNIT_CONE} position={[0, bodyH + 0.42, 0]} rotation={[0, Math.PI / 4, 0]} scale={[halfW * 3, 0.5, halfD * 3]}>
              <meshStandardMaterial color={accent} {...MAT} />
            </mesh>
          ) : (
            <mesh geometry={UNIT_BOX} position={[0, bodyH + 0.27, 0]} scale={[halfW * 2.1, 0.12, halfD * 2.1]}>
              <meshStandardMaterial color={accent} {...MAT} />
            </mesh>
          )}
          {/* rooftop water tank */}
          <mesh geometry={UNIT_CYLINDER} position={[halfW * 0.4, bodyH + 0.62, -halfD * 0.3]} scale={[0.26, 0.4, 0.26]}>
            <meshStandardMaterial color={trim} {...MAT} />
          </mesh>
        </group>
      );
    }

    case 'skyscraper': {
      // High-rise with a hash-picked setback silhouette + emissive window grid
      // + a rooftop garnish. The tallest profane building.
      const variant = Math.floor(hashFloat(id, 31) * 3); // 0 box, 1 stepped, 2 tapered
      const garnish = Math.floor(hashFloat(id, 32) * 4); // tank / antenna / spire / roof garden
      const h1 = floors * FLOOR_HEIGHT;
      const halfW = 0.7;
      const halfD = 0.6;
      const seg = (
        sy: number,
        sh: number,
        sw: number,
        sd: number,
        wRows: number,
        key: string,
      ) => (
        <group key={key} position={[0, sy, 0]}>
          <mesh geometry={UNIT_BOX} position={[0, sh / 2, 0]} scale={[sw * 2, sh, sd * 2]} castShadow>
            <meshStandardMaterial color={wall} {...MAT} />
          </mesh>
          {windowStrip(`${id}-${key}`, sh, sw, sd, wRows, '#bfe0ff', glowI)}
        </group>
      );
      const segs: ReactElement[] = [];
      if (variant === 1) {
        // Stepped / setback: three shrinking tiers.
        const t1 = h1 * 0.55;
        const t2 = h1 * 0.3;
        const t3 = h1 * 0.18;
        segs.push(seg(0.1, t1, halfW, halfD, Math.max(2, Math.round(floors * 0.5)), 's1'));
        segs.push(seg(0.1 + t1, t2, halfW * 0.78, halfD * 0.78, Math.max(2, Math.round(floors * 0.3)), 's2'));
        segs.push(seg(0.1 + t1 + t2, t3, halfW * 0.55, halfD * 0.55, Math.max(1, Math.round(floors * 0.18)), 's3'));
      } else if (variant === 2) {
        // Tapered: a slightly narrower crown.
        segs.push(seg(0.1, h1 * 0.7, halfW, halfD, Math.max(3, Math.round(floors * 0.65)), 't1'));
        segs.push(seg(0.1 + h1 * 0.7, h1 * 0.34, halfW * 0.7, halfD * 0.7, Math.max(2, Math.round(floors * 0.32)), 't2'));
      } else {
        segs.push(seg(0.1, h1, halfW, halfD, floors, 'b'));
      }
      const topY = 0.1 + (variant === 1 ? h1 : variant === 2 ? h1 * 1.04 : h1);
      return (
        <group>
          {/* plinth */}
          <mesh geometry={UNIT_BOX} position={[0, 0.06, 0]} scale={[halfW * 2.3, 0.12, halfD * 2.3]}>
            <meshStandardMaterial color={trim} {...MAT} />
          </mesh>
          {segs}
          {/* rooftop garnish */}
          {garnish === 0 && (
            <mesh geometry={UNIT_CYLINDER} position={[0.18, topY + 0.28, -0.12]} scale={[0.3, 0.45, 0.3]}>
              <meshStandardMaterial color={trim} {...MAT} />
            </mesh>
          )}
          {garnish === 1 && (
            <group>
              <mesh geometry={UNIT_CYLINDER} position={[0, topY + 0.5, 0]} scale={[0.04, 1.0, 0.04]}>
                <meshStandardMaterial color={trim} {...MAT} />
              </mesh>
              <mesh geometry={UNIT_SPHERE} position={[0, topY + 1.0, 0]} scale={[0.1, 0.1, 0.1]}>
                <meshStandardMaterial color={'#ff5b5b'} emissive={'#ff3b3b'} emissiveIntensity={1.6 + glowI} toneMapped={false} />
              </mesh>
            </group>
          )}
          {garnish === 2 && (
            <mesh geometry={UNIT_CONE_SMOOTH} position={[0, topY + 0.6, 0]} scale={[0.32, 1.2, 0.32]}>
              <meshStandardMaterial color={accent} {...MAT} />
            </mesh>
          )}
          {garnish === 3 && (
            <group position={[0, topY + 0.1, 0]}>
              <mesh geometry={UNIT_BOX} position={[0, 0.04, 0]} scale={[halfW * 1.6, 0.08, halfD * 1.6]}>
                <meshStandardMaterial color={'#4f9d54'} {...MAT} />
              </mesh>
              <mesh geometry={UNIT_CONE_SMOOTH} position={[0.18, 0.22, 0.1]} scale={[0.22, 0.35, 0.22]}>
                <meshStandardMaterial color={'#3f8f48'} {...MAT} />
              </mesh>
              <mesh geometry={UNIT_CONE_SMOOTH} position={[-0.16, 0.2, -0.12]} scale={[0.18, 0.3, 0.18]}>
                <meshStandardMaterial color={'#57a85f'} {...MAT} />
              </mesh>
            </group>
          )}
        </group>
      );
    }

    case 'arcane-spire': {
      // Twisting, tapered fantasy high-rise with a glowing tip + floating ring.
      const bodyH = floors * FLOOR_HEIGHT;
      const twist = (hashFloat(id, 41) - 0.5) * 0.5;
      const tiers = Math.max(3, Math.min(6, Math.round(floors / 2)));
      const tierH = bodyH / tiers;
      const segs: ReactElement[] = [];
      for (let t = 0; t < tiers; t++) {
        const frac = t / tiers;
        const r = 0.6 * (1 - frac * 0.6);
        segs.push(
          <mesh
            key={`tier-${t}`}
            geometry={TOWER_BODY}
            position={[0, 0.2 + tierH * (t + 0.5), 0]}
            rotation={[0, twist * t, 0]}
            scale={[r * 2, tierH * 1.02, r * 2]}
            castShadow
          >
            <meshStandardMaterial color={t % 2 === 0 ? wall : trim} {...MAT} />
          </mesh>,
        );
        // glowing window band per tier
        segs.push(
          <mesh
            key={`glowband-${t}`}
            geometry={TOWER_BODY}
            position={[0, 0.2 + tierH * (t + 0.5), 0]}
            rotation={[0, twist * t, 0]}
            scale={[r * 2.06, tierH * 0.28, r * 2.06]}
          >
            <meshStandardMaterial color={glow} emissive={glow} emissiveIntensity={0.6 + glowI * 1.2} toneMapped={false} roughness={0.4} />
          </mesh>,
        );
      }
      const tipY = 0.2 + bodyH;
      return (
        <group>
          {segs}
          {/* glowing crystalline tip */}
          <mesh geometry={UNIT_CONE_SMOOTH} position={[0, tipY + 0.5, 0]} scale={[0.34, 1.1, 0.34]}>
            <meshStandardMaterial color={accent} emissive={glow} emissiveIntensity={1.2 + glowI} toneMapped={false} {...MAT} />
          </mesh>
          <mesh geometry={UNIT_SPHERE} position={[0, tipY + 1.15, 0]} scale={[0.2, 0.2, 0.2]}>
            <meshStandardMaterial color={glow} emissive={glow} emissiveIntensity={2.6} roughness={0.2} toneMapped={false} />
          </mesh>
          {/* floating ring (tagged so the parent can spin it) */}
          <group name="spire-ring" position={[0, tipY * 0.62, 0]}>
            <mesh geometry={UNIT_TORUS} rotation={[Math.PI / 2, 0, 0]} scale={[1.2, 1.2, 1.2]}>
              <meshStandardMaterial color={glow} emissive={glow} emissiveIntensity={1.0 + glowI} toneMapped={false} roughness={0.3} />
            </mesh>
          </group>
          {/* a couple of floating orbs */}
          <group name="spire-orbs">
            <mesh geometry={UNIT_SPHERE} position={[0.9, tipY * 0.5, 0]} scale={[0.12, 0.12, 0.12]}>
              <meshStandardMaterial color={glow} emissive={glow} emissiveIntensity={2.2} toneMapped={false} roughness={0.2} />
            </mesh>
            <mesh geometry={UNIT_SPHERE} position={[-0.7, tipY * 0.7, 0.4]} scale={[0.1, 0.1, 0.1]}>
              <meshStandardMaterial color={glow} emissive={glow} emissiveIntensity={2.2} toneMapped={false} roughness={0.2} />
            </mesh>
          </group>
        </group>
      );
    }

    case 'grand-hall': {
      // Wide civic landmark: colonnaded base + central block + dome + a clock
      // tower off to one side.
      const bodyH = floors * FLOOR_HEIGHT;
      const halfW = 1.0;
      const halfD = 0.75;
      const cols = 6;
      return (
        <group>
          {/* broad stepped base */}
          <mesh geometry={UNIT_BOX} position={[0, 0.16, 0]} scale={[halfW * 2.4, 0.32, halfD * 2.4]}>
            <meshStandardMaterial color={trim} {...MAT} />
          </mesh>
          {/* main block */}
          <mesh geometry={UNIT_BOX} position={[0, bodyH / 2 + 0.3, 0]} scale={[halfW * 2, bodyH, halfD * 2]} castShadow>
            <meshStandardMaterial color={wall} {...MAT} />
          </mesh>
          {/* colonnade across the front */}
          {Array.from({ length: cols }, (_, c) => {
            const x = (c / (cols - 1) - 0.5) * halfW * 1.9;
            return (
              <mesh key={`col-${c}`} geometry={UNIT_CYLINDER} position={[x, 0.3 + bodyH * 0.42, halfD + 0.04]} scale={[0.13, bodyH * 0.84, 0.13]}>
                <meshStandardMaterial color={trim} {...MAT} />
              </mesh>
            );
          })}
          {/* window rows behind the columns */}
          {Array.from({ length: floors }, (_, r) => (
            <mesh key={`gw-${r}`} geometry={UNIT_BOX} position={[0, 0.3 + FLOOR_HEIGHT * (r + 0.5), halfD - 0.02]} scale={[halfW * 1.7, FLOOR_HEIGHT * 0.4, 0.04]}>
              <meshStandardMaterial
                color={'#ffe8b8'}
                emissive={'#ffce78'}
                emissiveIntensity={glowI * 0.85}
                userData={{ glowDay: glowI * 0.85, glowNight: 2.4 }}
                toneMapped={false}
                {...MAT}
              />
            </mesh>
          ))}
          {/* entablature */}
          <mesh geometry={UNIT_BOX} position={[0, bodyH + 0.36, 0]} scale={[halfW * 2.2, 0.2, halfD * 2.2]}>
            <meshStandardMaterial color={accent} {...MAT} />
          </mesh>
          {/* central dome */}
          <mesh geometry={UNIT_SPHERE} position={[0, bodyH + 0.62, 0]} scale={[halfW * 0.9, halfW * 0.7, halfD * 1.1]}>
            <meshStandardMaterial color={accent} metalness={0.3} roughness={0.45} />
          </mesh>
          <mesh geometry={UNIT_SPHERE} position={[0, bodyH + 0.95, 0]} scale={[0.14, 0.18, 0.14]}>
            <meshStandardMaterial color={glow} emissive={glow} emissiveIntensity={1.2 + glowI} toneMapped={false} roughness={0.3} />
          </mesh>
          {/* clock tower off to one side */}
          <group position={[halfW * 0.85, 0, -halfD * 0.4]}>
            <mesh geometry={UNIT_BOX} position={[0, bodyH * 0.7 + 0.5, 0]} scale={[0.42, bodyH * 1.4 + 1, 0.42]} castShadow>
              <meshStandardMaterial color={wall} {...MAT} />
            </mesh>
            {/* clock face */}
            <mesh geometry={UNIT_CYLINDER} position={[0, bodyH * 1.4 + 1.1, 0.22]} rotation={[Math.PI / 2, 0, 0]} scale={[0.26, 0.04, 0.26]}>
              <meshStandardMaterial
                color={'#fff4d8'}
                emissive={'#ffe6a0'}
                emissiveIntensity={glowI * 1.0}
                userData={{ glowDay: glowI * 1.0, glowNight: 2.2 }}
                toneMapped={false}
              />
            </mesh>
            <mesh geometry={UNIT_CONE} position={[0, bodyH * 1.4 + 1.6, 0]} scale={[0.6, 0.6, 0.6]}>
              <meshStandardMaterial color={accent} {...MAT} />
            </mesh>
          </group>
        </group>
      );
    }

    // ===== Mayor-project landmarks (phase 03) ===============================
    // Each is bigger and more distinctive than a roster building, with a small
    // emissive accent so it reads as commissioned and special.

    case 'grove': {
      // A ring of tall sculpted trees around a small glowing standing stone.
      const trees = 7;
      const ringR = 1.45;
      return (
        <group>
          {/* mossy ground disc */}
          <mesh geometry={UNIT_CYLINDER_LOW} position={[0, 0.08, 0]} scale={[ringR * 2.1, 0.16, ringR * 2.1]}>
            <meshStandardMaterial color={'#5a7d44'} {...MAT} />
          </mesh>
          {Array.from({ length: trees }, (_, i) => {
            const a = (i / trees) * Math.PI * 2 + hashFloat(id, 80 + i) * 0.2;
            const tx = Math.cos(a) * ringR;
            const tz = Math.sin(a) * ringR;
            const th = 1.9 + hashFloat(id, 90 + i) * 0.7;
            return (
              <group key={`tree-${i}`} position={[tx, 0, tz]}>
                <mesh geometry={UNIT_CYLINDER} position={[0, th * 0.4, 0]} scale={[0.16, th * 0.8, 0.16]} castShadow>
                  <meshStandardMaterial color={'#6b4a2f'} {...MAT} />
                </mesh>
                <mesh geometry={LOWPOLY_SPHERE} position={[0, th * 0.92, 0]} scale={[0.85, 1.0, 0.85]}>
                  <meshStandardMaterial color={'#3f8f48'} {...MAT} />
                </mesh>
                <mesh geometry={LOWPOLY_SPHERE} position={[0.2, th * 0.7, 0.1]} scale={[0.55, 0.6, 0.55]}>
                  <meshStandardMaterial color={'#4f9d54'} {...MAT} />
                </mesh>
              </group>
            );
          })}
          {/* central standing stone with a faint glow at its crown */}
          <mesh geometry={UNIT_BOX} position={[0, 0.7, 0]} rotation={[0, 0.3, 0.04]} scale={[0.4, 1.4, 0.32]} castShadow>
            <meshStandardMaterial color={trim} {...MAT} />
          </mesh>
          <mesh geometry={UNIT_SPHERE} position={[0, 1.5, 0]} scale={[0.2, 0.2, 0.2]}>
            <meshStandardMaterial color={glow} emissive={glow} emissiveIntensity={1.4 + glowI} toneMapped={false} roughness={0.3} />
          </mesh>
        </group>
      );
    }

    case 'fountain-plaza': {
      // A broad paved disc with a central multi-tier fountain and corner
      // lanterns. Bigger and grander than the roster `fountain`.
      const discR = 1.9;
      return (
        <group>
          {/* paved plaza */}
          <mesh geometry={UNIT_CYLINDER_LOW} position={[0, 0.07, 0]} scale={[discR * 2, 0.14, discR * 2]}>
            <meshStandardMaterial color={trim} {...MAT} />
          </mesh>
          <mesh geometry={UNIT_CYLINDER_LOW} position={[0, 0.12, 0]} scale={[discR * 1.3, 0.1, discR * 1.3]}>
            <meshStandardMaterial color={wall} {...MAT} />
          </mesh>
          {/* tiered fountain: wide basin, mid basin, pillar, finial */}
          <mesh geometry={UNIT_CYLINDER_LOW} position={[0, 0.3, 0]} scale={[1.3, 0.3, 1.3]}>
            <meshStandardMaterial color={wall} {...MAT} />
          </mesh>
          <group name="fountain-water">
            <mesh geometry={UNIT_DISC} position={[0, 0.42, 0]} scale={[2.2, 1, 2.2]}>
              <meshStandardMaterial color={'#7ec8e3'} transparent opacity={0.7} roughness={0.15} metalness={0.2} emissive={'#2b6f8c'} emissiveIntensity={0.2} />
            </mesh>
          </group>
          <mesh geometry={UNIT_CYLINDER} position={[0, 0.65, 0]} scale={[0.4, 0.5, 0.4]}>
            <meshStandardMaterial color={trim} {...MAT} />
          </mesh>
          <mesh geometry={UNIT_CYLINDER_LOW} position={[0, 0.9, 0]} scale={[0.8, 0.18, 0.8]}>
            <meshStandardMaterial color={wall} {...MAT} />
          </mesh>
          <mesh geometry={UNIT_DISC} position={[0, 0.96, 0]} scale={[1.0, 1, 1.0]}>
            <meshStandardMaterial color={'#7ec8e3'} transparent opacity={0.7} roughness={0.15} metalness={0.2} />
          </mesh>
          <mesh geometry={UNIT_CYLINDER} position={[0, 1.15, 0]} scale={[0.16, 0.5, 0.16]}>
            <meshStandardMaterial color={trim} {...MAT} />
          </mesh>
          <mesh geometry={UNIT_SPHERE} position={[0, 1.5, 0]} scale={[0.22, 0.24, 0.22]}>
            <meshStandardMaterial color={accent} emissive={glow} emissiveIntensity={0.5 + glowI * 0.6} toneMapped={false} roughness={0.3} />
          </mesh>
          {/* corner lanterns */}
          {[0, 1, 2, 3].map((i) => {
            const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
            const lx = Math.cos(a) * discR * 0.82;
            const lz = Math.sin(a) * discR * 0.82;
            return (
              <group key={`lan-${i}`} position={[lx, 0, lz]}>
                <mesh geometry={UNIT_CYLINDER} position={[0, 0.5, 0]} scale={[0.08, 1.0, 0.08]}>
                  <meshStandardMaterial color={trim} {...MAT} />
                </mesh>
                <mesh geometry={UNIT_SPHERE} position={[0, 1.05, 0]} scale={[0.16, 0.18, 0.16]}>
                  <meshStandardMaterial
                    color={'#ffe6a8'}
                    emissive={'#ffcf6b'}
                    emissiveIntensity={0.6 + glowI * 0.8}
                    userData={{ glowDay: 0.6 + glowI * 0.8, glowNight: 2.3 }}
                    toneMapped={false}
                  />
                </mesh>
              </group>
            );
          })}
        </group>
      );
    }

    case 'lighthouse': {
      // A tall tapered banded tower with a glowing lamp room and gallery rail.
      const towerH = 3.4;
      return (
        <group>
          {/* rocky base */}
          <mesh geometry={LOWPOLY_SPHERE} position={[0, 0.18, 0]} scale={[1.4, 0.5, 1.4]}>
            <meshStandardMaterial color={trim} {...MAT} />
          </mesh>
          {/* tapered shaft */}
          <mesh geometry={TOWER_BODY} position={[0, towerH * 0.5 + 0.3, 0]} scale={[1.0, towerH, 1.0]} castShadow>
            <meshStandardMaterial color={wall} {...MAT} />
          </mesh>
          {/* painted bands */}
          {[0.3, 0.55, 0.8].map((f, i) => (
            <mesh
              key={`band-${i}`}
              geometry={TOWER_BODY}
              position={[0, 0.3 + towerH * f, 0]}
              scale={[1.02 - f * 0.3, towerH * 0.12, 1.02 - f * 0.3]}
            >
              <meshStandardMaterial color={accent} {...MAT} />
            </mesh>
          ))}
          {/* gallery rail platform */}
          <mesh geometry={UNIT_CYLINDER_LOW} position={[0, towerH + 0.3, 0]} scale={[0.95, 0.12, 0.95]}>
            <meshStandardMaterial color={trim} {...MAT} />
          </mesh>
          {/* glowing lamp room */}
          <mesh geometry={UNIT_CYLINDER} position={[0, towerH + 0.6, 0]} scale={[0.62, 0.5, 0.62]}>
            <meshStandardMaterial
              color={'#fff2c4'}
              emissive={glow}
              emissiveIntensity={1.6 + glowI * 1.4}
              userData={{ glowDay: 1.6 + glowI * 1.4, glowNight: 3 }}
              toneMapped={false}
              roughness={0.3}
            />
          </mesh>
          {/* cap */}
          <mesh geometry={UNIT_CONE_SMOOTH} position={[0, towerH + 1.0, 0]} scale={[0.78, 0.55, 0.78]}>
            <meshStandardMaterial color={accent} {...MAT} />
          </mesh>
          <mesh geometry={UNIT_SPHERE} position={[0, towerH + 1.35, 0]} scale={[0.12, 0.14, 0.12]}>
            <meshStandardMaterial color={glow} emissive={glow} emissiveIntensity={2.2} toneMapped={false} roughness={0.2} />
          </mesh>
        </group>
      );
    }

    case 'observatory': {
      // A cylindrical base with a hemispheric dome (open slit) and an angled
      // telescope tube poking through it.
      const baseH = 1.5;
      return (
        <group>
          {/* stepped base */}
          <mesh geometry={UNIT_CYLINDER} position={[0, 0.14, 0]} scale={[1.7, 0.28, 1.7]}>
            <meshStandardMaterial color={trim} {...MAT} />
          </mesh>
          <mesh geometry={UNIT_CYLINDER} position={[0, baseH * 0.5 + 0.28, 0]} scale={[1.3, baseH, 1.3]} castShadow>
            <meshStandardMaterial color={wall} {...MAT} />
          </mesh>
          {/* lit window band */}
          <mesh geometry={UNIT_CYLINDER} position={[0, baseH * 0.5 + 0.28, 0]} scale={[1.33, baseH * 0.22, 1.33]}>
            <meshStandardMaterial
              color={'#ffe8b8'}
              emissive={'#ffce78'}
              emissiveIntensity={glowI * 0.8}
              userData={{ glowDay: glowI * 0.8, glowNight: 2.2 }}
              toneMapped={false}
            />
          </mesh>
          {/* hemispheric dome */}
          <mesh geometry={UNIT_SPHERE} position={[0, baseH + 0.28, 0]} scale={[1.4, 1.0, 1.4]}>
            <meshStandardMaterial color={accent} metalness={0.3} roughness={0.45} />
          </mesh>
          {/* dome slit (a dark recessed strip) */}
          <mesh geometry={UNIT_BOX} position={[0, baseH + 0.75, 0.0]} rotation={[0, 0, 0]} scale={[0.22, 0.95, 1.45]}>
            <meshStandardMaterial color={'#2b2f3a'} {...MAT} />
          </mesh>
          {/* angled telescope tube emerging from the slit */}
          <mesh geometry={UNIT_CYLINDER} position={[0, baseH + 0.95, 0.2]} rotation={[Math.PI / 3.2, 0, 0]} scale={[0.22, 1.5, 0.22]}>
            <meshStandardMaterial color={trim} metalness={0.4} roughness={0.4} />
          </mesh>
          <mesh geometry={UNIT_SPHERE} position={[0, baseH + 1.55, 0.75]} scale={[0.2, 0.2, 0.2]}>
            <meshStandardMaterial color={glow} emissive={glow} emissiveIntensity={1.2 + glowI} toneMapped={false} roughness={0.3} />
          </mesh>
        </group>
      );
    }

    case 'bathhouse': {
      // Low domed halls with arched entrance and steamy chimneys.
      const domes: [number, number, number][] = [
        [0, 0, 0.95],
        [-0.95, 0.1, 0.62],
        [0.95, 0.1, 0.62],
      ];
      return (
        <group>
          {/* broad low base */}
          <mesh geometry={UNIT_BOX} position={[0, 0.35, 0]} scale={[2.6, 0.7, 2.0]} castShadow>
            <meshStandardMaterial color={wall} {...MAT} />
          </mesh>
          <mesh geometry={UNIT_BOX} position={[0, 0.72, 0]} scale={[2.7, 0.12, 2.1]}>
            <meshStandardMaterial color={trim} {...MAT} />
          </mesh>
          {/* domed halls */}
          {domes.map(([dx, , dr], i) => (
            <mesh key={`dome-${i}`} geometry={UNIT_SPHERE} position={[dx, 0.78, 0]} scale={[dr, dr * 0.8, dr]}>
              <meshStandardMaterial color={accent} metalness={0.25} roughness={0.5} />
            </mesh>
          ))}
          {/* arched entrance */}
          <mesh geometry={UNIT_CYLINDER_LOW} position={[0, 0.5, 1.02]} rotation={[Math.PI / 2, 0, 0]} scale={[0.6, 0.3, 0.9]}>
            <meshStandardMaterial color={trim} {...MAT} />
          </mesh>
          <mesh geometry={UNIT_BOX} position={[0, 0.28, 1.06]} scale={[0.6, 0.55, 0.1]}>
            <meshStandardMaterial
              color={'#ffe6c0'}
              emissive={'#ffcf8b'}
              emissiveIntensity={0.3 + glowI * 0.7}
              userData={{ glowDay: 0.3 + glowI * 0.7, glowNight: 2.1 }}
              toneMapped={false}
            />
          </mesh>
          {/* steamy chimneys (small cones of "steam" above stacks) */}
          {[-0.6, 0.6].map((cx, i) => (
            <group key={`chim-${i}`} position={[cx, 0, -0.7]}>
              <mesh geometry={UNIT_CYLINDER} position={[0, 1.0, 0]} scale={[0.16, 0.7, 0.16]}>
                <meshStandardMaterial color={trim} {...MAT} />
              </mesh>
              <mesh geometry={LOWPOLY_SPHERE} position={[0, 1.5 + hashFloat(id, 60 + i) * 0.1, 0]} scale={[0.4, 0.5, 0.4]}>
                <meshStandardMaterial color={'#eef2f4'} transparent opacity={0.5} roughness={1} />
              </mesh>
            </group>
          ))}
        </group>
      );
    }

    case 'amphitheater': {
      // Stepped semicircular tiers wrapping a small stage.
      const tiers = 4;
      return (
        <group>
          {/* ground / orchestra */}
          <mesh geometry={UNIT_CYLINDER_LOW} position={[0, 0.06, 0]} scale={[3.0, 0.12, 3.0]}>
            <meshStandardMaterial color={trim} {...MAT} />
          </mesh>
          {/* concentric seating rings, rear half only (rotated so the gap faces
              the stage) — built from full low rings stacked & shrunk; the stage
              block in front reads the opening. */}
          {Array.from({ length: tiers }, (_, t) => {
            const r = 2.6 - t * 0.45;
            const y = 0.12 + t * 0.32;
            return (
              <mesh key={`tier-${t}`} geometry={UNIT_CYLINDER_LOW} position={[0, y, -0.2]} scale={[r, 0.3, r]}>
                <meshStandardMaterial color={t % 2 === 0 ? wall : accent} {...MAT} />
              </mesh>
            );
          })}
          {/* hollow the center so it reads as tiers, not a solid cone */}
          <mesh geometry={UNIT_CYLINDER_LOW} position={[0, 0.2 + tiers * 0.16, -0.2]} scale={[0.8, tiers * 0.5, 0.8]}>
            <meshStandardMaterial color={trim} {...MAT} />
          </mesh>
          {/* stage at the front opening */}
          <mesh geometry={UNIT_BOX} position={[0, 0.22, 1.4]} scale={[1.8, 0.3, 0.8]}>
            <meshStandardMaterial color={accent} {...MAT} />
          </mesh>
          {/* scene wall behind the stage with lit niches */}
          <mesh geometry={UNIT_BOX} position={[0, 0.7, 1.75]} scale={[1.9, 1.0, 0.18]} castShadow>
            <meshStandardMaterial color={wall} {...MAT} />
          </mesh>
          {[-0.5, 0, 0.5].map((nx) => (
            <mesh key={`niche-${nx}`} geometry={UNIT_BOX} position={[nx, 0.7, 1.66]} scale={[0.24, 0.5, 0.06]}>
              <meshStandardMaterial
                color={'#ffe6a8'}
                emissive={glow}
                emissiveIntensity={0.4 + glowI * 0.7}
                userData={{ glowDay: 0.4 + glowI * 0.7, glowNight: 2.0 }}
                toneMapped={false}
              />
            </mesh>
          ))}
        </group>
      );
    }

    case 'menagerie': {
      // A cluster of fenced pens around a striped big-top pavilion.
      const pens: [number, number][] = [
        [-1.3, 0.7],
        [1.3, 0.6],
        [-0.9, -1.1],
        [1.0, -1.0],
      ];
      return (
        <group>
          {/* trodden ground */}
          <mesh geometry={UNIT_CYLINDER_LOW} position={[0, 0.05, 0]} scale={[3.2, 0.1, 3.2]}>
            <meshStandardMaterial color={'#9a8a5e'} {...MAT} />
          </mesh>
          {/* central big-top: striped via two stacked cones in alternating colors */}
          <mesh geometry={UNIT_CYLINDER} position={[0, 0.5, 0]} scale={[1.2, 1.0, 1.2]} castShadow>
            <meshStandardMaterial color={wall} {...MAT} />
          </mesh>
          <mesh geometry={UNIT_CONE} position={[0, 1.35, 0]} rotation={[0, Math.PI / 6, 0]} scale={[1.8, 1.0, 1.8]}>
            <meshStandardMaterial color={accent} {...MAT} />
          </mesh>
          <mesh geometry={UNIT_CONE} position={[0, 1.15, 0]} rotation={[0, Math.PI / 6, 0]} scale={[1.85, 0.5, 1.85]}>
            <meshStandardMaterial color={wall} {...MAT} />
          </mesh>
          {/* pennant */}
          <mesh geometry={UNIT_CYLINDER} position={[0, 2.0, 0]} scale={[0.04, 0.5, 0.04]}>
            <meshStandardMaterial color={trim} {...MAT} />
          </mesh>
          <mesh geometry={UNIT_BOX} position={[0.12, 2.15, 0]} scale={[0.24, 0.16, 0.02]}>
            <meshStandardMaterial color={glow} emissive={glow} emissiveIntensity={0.4 + glowI * 0.6} toneMapped={false} {...MAT} />
          </mesh>
          {/* fenced pens: a low ring fence + a little creature blob inside */}
          {pens.map(([px2, pz2], i) => (
            <group key={`pen-${i}`} position={[px2, 0, pz2]}>
              <mesh geometry={UNIT_TORUS} position={[0, 0.22, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[1.1, 1.1, 0.5]}>
                <meshStandardMaterial color={trim} {...MAT} />
              </mesh>
              <mesh geometry={LOWPOLY_SPHERE} position={[0, 0.28, 0]} scale={[0.4, 0.34, 0.5]}>
                <meshStandardMaterial color={i % 2 === 0 ? '#b5743f' : '#6f7f55'} {...MAT} />
              </mesh>
            </group>
          ))}
        </group>
      );
    }

    case 'bell-tower': {
      // A slender campanile with an open belfry, a visible bell, and a pointed
      // cap.
      const shaftH = 3.2;
      return (
        <group>
          {/* base */}
          <mesh geometry={UNIT_BOX} position={[0, 0.2, 0]} scale={[1.1, 0.4, 1.1]}>
            <meshStandardMaterial color={trim} {...MAT} />
          </mesh>
          {/* tall shaft */}
          <mesh geometry={UNIT_BOX} position={[0, shaftH * 0.5 + 0.4, 0]} scale={[0.8, shaftH, 0.8]} castShadow>
            <meshStandardMaterial color={wall} {...MAT} />
          </mesh>
          {/* string-course bands */}
          {[0.35, 0.65].map((f, i) => (
            <mesh key={`sc-${i}`} geometry={UNIT_BOX} position={[0, 0.4 + shaftH * f, 0]} scale={[0.86, 0.1, 0.86]}>
              <meshStandardMaterial color={trim} {...MAT} />
            </mesh>
          ))}
          {/* open belfry: four corner piers framing a dark opening */}
          <group position={[0, shaftH + 0.4, 0]}>
            {[[-0.32, -0.32], [0.32, -0.32], [-0.32, 0.32], [0.32, 0.32]].map(([cx, cz], i) => (
              <mesh key={`pier-${i}`} geometry={UNIT_BOX} position={[cx, 0.4, cz]} scale={[0.14, 0.8, 0.14]}>
                <meshStandardMaterial color={wall} {...MAT} />
              </mesh>
            ))}
            <mesh geometry={UNIT_BOX} position={[0, 0.4, 0]} scale={[0.5, 0.7, 0.5]}>
              <meshStandardMaterial color={'#2b2f3a'} {...MAT} />
            </mesh>
            {/* the bell (tagged so it can swing) */}
            <group name="bell-swing" position={[0, 0.78, 0]}>
              <mesh geometry={UNIT_CONE_SMOOTH} position={[0, -0.2, 0]} scale={[0.34, 0.42, 0.34]}>
                <meshStandardMaterial color={accent} metalness={0.5} roughness={0.4} emissive={glow} emissiveIntensity={0.25 + glowI * 0.4} toneMapped={false} />
              </mesh>
              <mesh geometry={UNIT_SPHERE} position={[0, -0.4, 0]} scale={[0.08, 0.08, 0.08]}>
                <meshStandardMaterial color={trim} metalness={0.5} roughness={0.4} />
              </mesh>
            </group>
            {/* belfry roof */}
            <mesh geometry={UNIT_BOX} position={[0, 0.82, 0]} scale={[0.85, 0.12, 0.85]}>
              <meshStandardMaterial color={trim} {...MAT} />
            </mesh>
            <mesh geometry={UNIT_CONE_SMOOTH} position={[0, 1.4, 0]} scale={[0.95, 1.2, 0.95]}>
              <meshStandardMaterial color={accent} {...MAT} />
            </mesh>
            <mesh geometry={UNIT_SPHERE} position={[0, 2.05, 0]} scale={[0.12, 0.14, 0.12]}>
              <meshStandardMaterial color={glow} emissive={glow} emissiveIntensity={1.6 + glowI} toneMapped={false} roughness={0.3} />
            </mesh>
          </group>
        </group>
      );
    }

    case 'hedge-maze': {
      // A low square of maze walls with gaps and a central topiary ornament.
      const half = 1.8;
      const wallC = '#3f7a3a';
      // A handful of inner wall segments forming maze-y corridors. Positions are
      // fixed (not random) so the maze reads as a designed shape, with a touch
      // of hash jitter on heights only.
      const segs: [number, number, number, number][] = [
        // [x, z, lenX, lenZ]
        [-0.6, 0.6, 1.6, 0.18],
        [0.7, 0.0, 0.18, 1.4],
        [-0.2, -0.7, 1.2, 0.18],
        [0.0, 0.5, 0.18, 0.9],
      ];
      const wallH = 0.55;
      return (
        <group>
          {/* ground */}
          <mesh geometry={UNIT_BOX} position={[0, 0.05, 0]} scale={[half * 2.1, 0.1, half * 2.1]}>
            <meshStandardMaterial color={'#6e8a4a'} {...MAT} />
          </mesh>
          {/* outer walls with gap entrances on two sides */}
          {[
            [0, half, half * 1.4, 0.22, 0], // back full
            [-half * 0.55, -half, half * 0.7, 0.22, 0], // front-left (gap in middle)
            [half * 0.55, -half, half * 0.7, 0.22, 0], // front-right
            [-half, 0, 0.22, half * 1.4, 0], // left
            [half, -half * 0.3, 0.22, half * 1.0, 0], // right (gap)
          ].map(([x, z, sx, sz], i) => (
            <mesh key={`outer-${i}`} geometry={UNIT_BOX} position={[x, wallH * 0.5 + 0.1, z]} scale={[sx, wallH, sz]} castShadow>
              <meshStandardMaterial color={wallC} {...MAT} />
            </mesh>
          ))}
          {/* inner walls */}
          {segs.map(([x, z, lx, lz], i) => (
            <mesh
              key={`inner-${i}`}
              geometry={UNIT_BOX}
              position={[x, wallH * 0.5 + 0.1, z]}
              scale={[lx, wallH * (0.9 + hashFloat(id, 40 + i) * 0.2), lz]}
            >
              <meshStandardMaterial color={'#4a8a44'} {...MAT} />
            </mesh>
          ))}
          {/* central topiary ornament */}
          <mesh geometry={LOWPOLY_SPHERE} position={[0, 0.55, -0.1]} scale={[0.5, 0.6, 0.5]}>
            <meshStandardMaterial color={'#3f8f48'} {...MAT} />
          </mesh>
          <mesh geometry={LOWPOLY_SPHERE} position={[0, 0.95, -0.1]} scale={[0.34, 0.4, 0.34]}>
            <meshStandardMaterial color={'#4f9d54'} {...MAT} />
          </mesh>
          <mesh geometry={UNIT_SPHERE} position={[0, 1.25, -0.1]} scale={[0.14, 0.14, 0.14]}>
            <meshStandardMaterial color={glow} emissive={glow} emissiveIntensity={0.8 + glowI} toneMapped={false} roughness={0.3} />
          </mesh>
        </group>
      );
    }

    case 'hot-springs': {
      // Terraced glowing pools among rocks, with rising steam wisps.
      const pools: [number, number, number, number][] = [
        // [x, z, radius, y]
        [0, 0, 1.1, 0.18],
        [-1.0, 0.6, 0.7, 0.34],
        [0.9, 0.7, 0.6, 0.42],
        [0.3, -1.0, 0.55, 0.3],
      ];
      return (
        <group>
          {/* rocky terrace base */}
          <mesh geometry={LOWPOLY_SPHERE} position={[0, 0.1, 0]} scale={[2.6, 0.5, 2.4]}>
            <meshStandardMaterial color={trim} {...MAT} />
          </mesh>
          {pools.map(([px2, pz2, r, py], i) => (
            <group key={`pool-${i}`} position={[px2, py, pz2]}>
              {/* rock rim */}
              <mesh geometry={UNIT_CYLINDER_LOW} position={[0, 0, 0]} scale={[r * 2.2, 0.22, r * 2.2]}>
                <meshStandardMaterial color={'#7d736a'} {...MAT} />
              </mesh>
              {/* glowing mineral water */}
              <mesh geometry={UNIT_DISC} position={[0, 0.12, 0]} scale={[r * 2, 1, r * 2]}>
                <meshStandardMaterial
                  color={'#9be8d2'}
                  emissive={'#3fb59a'}
                  emissiveIntensity={0.5 + glowI * 0.8}
                  userData={{ glowDay: 0.5 + glowI * 0.8, glowNight: 1.8 }}
                  transparent
                  opacity={0.85}
                  toneMapped={false}
                  roughness={0.2}
                  metalness={0.1}
                />
              </mesh>
              {/* steam wisp */}
              <mesh geometry={LOWPOLY_SPHERE} position={[0.1, 0.55 + hashFloat(id, 30 + i) * 0.2, 0]} scale={[r * 0.9, r * 1.1, r * 0.9]}>
                <meshStandardMaterial color={'#eef6f4'} transparent opacity={0.42} roughness={1} />
              </mesh>
            </group>
          ))}
          {/* a couple of scattered rocks */}
          <mesh geometry={LOWPOLY_SPHERE} position={[-1.6, 0.2, -0.6]} scale={[0.5, 0.4, 0.5]}>
            <meshStandardMaterial color={'#6f655c'} {...MAT} />
          </mesh>
          <mesh geometry={LOWPOLY_SPHERE} position={[1.5, 0.2, -0.5]} scale={[0.4, 0.32, 0.4]}>
            <meshStandardMaterial color={'#7d736a'} {...MAT} />
          </mesh>
        </group>
      );
    }

    case 'aviary': {
      // A tall domed birdcage of thin ribs with perches and a couple of birds.
      const cageR = 1.2;
      const cageH = 3.0;
      const ribs = 8;
      return (
        <group>
          {/* base ring / planter */}
          <mesh geometry={UNIT_CYLINDER_LOW} position={[0, 0.16, 0]} scale={[cageR * 2.2, 0.32, cageR * 2.2]}>
            <meshStandardMaterial color={trim} {...MAT} />
          </mesh>
          <mesh geometry={UNIT_CYLINDER_LOW} position={[0, 0.34, 0]} scale={[cageR * 1.7, 0.12, cageR * 1.7]}>
            <meshStandardMaterial color={'#4f9d54'} {...MAT} />
          </mesh>
          {/* vertical ribs, bent inward at top by scaling a tilted box ring */}
          {Array.from({ length: ribs }, (_, i) => {
            const a = (i / ribs) * Math.PI * 2;
            const rx = Math.cos(a) * cageR;
            const rz = Math.sin(a) * cageR;
            return (
              <mesh
                key={`rib-${i}`}
                geometry={UNIT_CYLINDER}
                position={[rx * 0.6, cageH * 0.5 + 0.3, rz * 0.6]}
                rotation={[Math.sin(a) * 0.35, 0, -Math.cos(a) * 0.35]}
                scale={[0.05, cageH, 0.05]}
              >
                <meshStandardMaterial color={accent} metalness={0.4} roughness={0.4} />
              </mesh>
            );
          })}
          {/* cage cap ring + finial */}
          <mesh geometry={UNIT_TORUS} position={[0, cageH + 0.2, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[0.7, 0.7, 0.7]}>
            <meshStandardMaterial color={accent} metalness={0.4} roughness={0.4} />
          </mesh>
          <mesh geometry={UNIT_CONE_SMOOTH} position={[0, cageH + 0.6, 0]} scale={[0.4, 0.6, 0.4]}>
            <meshStandardMaterial color={trim} {...MAT} />
          </mesh>
          <mesh geometry={UNIT_SPHERE} position={[0, cageH + 1.0, 0]} scale={[0.12, 0.12, 0.12]}>
            <meshStandardMaterial color={glow} emissive={glow} emissiveIntensity={1.2 + glowI} toneMapped={false} roughness={0.3} />
          </mesh>
          {/* an inner perch + two little birds */}
          <mesh geometry={UNIT_CYLINDER} position={[0, cageH * 0.5, 0]} rotation={[0, 0, Math.PI / 2]} scale={[0.04, cageR * 1.2, 0.04]}>
            <meshStandardMaterial color={'#6b4a2f'} {...MAT} />
          </mesh>
          {[[-0.35, 0.05], [0.4, -0.1]].map(([bx, bz], i) => (
            <mesh key={`bird-${i}`} geometry={LOWPOLY_SPHERE} position={[bx, cageH * 0.5 + 0.12, bz]} scale={[0.14, 0.13, 0.18]}>
              <meshStandardMaterial color={i % 2 === 0 ? '#ffce5e' : '#e87a7a'} {...MAT} />
            </mesh>
          ))}
        </group>
      );
    }

    case 'moondial': {
      // A giant tilted dial disc with a gnomon and crescent motif, glowing at
      // night. The dial face is tagged so the parent can drift it slowly.
      const dialR = 1.7;
      return (
        <group>
          {/* low plinth */}
          <mesh geometry={UNIT_CYLINDER_LOW} position={[0, 0.14, 0]} scale={[1.3, 0.28, 1.3]}>
            <meshStandardMaterial color={trim} {...MAT} />
          </mesh>
          {/* support struts */}
          {[-0.5, 0.5].map((sx, i) => (
            <mesh key={`strut-${i}`} geometry={UNIT_BOX} position={[sx, 0.7, 0]} rotation={[0, 0, sx > 0 ? -0.2 : 0.2]} scale={[0.16, 1.2, 0.16]}>
              <meshStandardMaterial color={trim} {...MAT} />
            </mesh>
          ))}
          {/* the tilted dial face (tagged for slow rotation) */}
          <group name="moondial-face" position={[0, 1.4, 0]} rotation={[Math.PI / 2.6, 0, 0]}>
            <mesh geometry={UNIT_DISC} scale={[dialR * 2, 1, dialR * 2]}>
              <meshStandardMaterial color={wall} metalness={0.3} roughness={0.5} />
            </mesh>
            {/* ring rim */}
            <mesh geometry={UNIT_TORUS} rotation={[Math.PI / 2, 0, 0]} scale={[dialR * 2, dialR * 2, dialR * 2]}>
              <meshStandardMaterial color={accent} emissive={glow} emissiveIntensity={0.5 + glowI * 0.9} toneMapped={false} roughness={0.3} />
            </mesh>
            {/* hour pips around the face */}
            {Array.from({ length: 8 }, (_, i) => {
              const a = (i / 8) * Math.PI * 2;
              return (
                <mesh key={`pip-${i}`} geometry={UNIT_BOX} position={[Math.cos(a) * dialR * 0.82, 0.04, Math.sin(a) * dialR * 0.82]} scale={[0.1, 0.04, 0.1]}>
                  <meshStandardMaterial color={accent} {...MAT} />
                </mesh>
              );
            })}
            {/* crescent moon motif at the center, emissive */}
            <mesh geometry={UNIT_TORUS} position={[0, 0.06, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[0.7, 0.7, 0.7]}>
              <meshStandardMaterial color={glow} emissive={glow} emissiveIntensity={1.0 + glowI * 1.2} toneMapped={false} roughness={0.2} />
            </mesh>
          </group>
          {/* gnomon: a vertical pin casting the "shadow" */}
          <mesh geometry={UNIT_CONE_SMOOTH} position={[0, 1.7, -0.1]} rotation={[Math.PI / 2.6, 0, 0]} scale={[0.12, 0.9, 0.12]}>
            <meshStandardMaterial color={trim} metalness={0.4} roughness={0.4} />
          </mesh>
        </group>
      );
    }

    default:
      // Exhaustiveness guard: any unhandled kind renders a plain box so the
      // scene never crashes if a new BuildingKind is added upstream.
      return (
        <mesh geometry={UNIT_BOX} position={[0, 0.45, 0]} scale={[0.9, 0.9, 0.9]}>
          <meshStandardMaterial color={wall} {...MAT} />
        </mesh>
      );
  }
}

/** Kinds that own an animated sub-part. */
const ANIMATED_KINDS = new Set<BuildingKind>([
  'mill',
  'fountain',
  'arcane-spire',
  // Mayor-project landmarks with a moving accent.
  'fountain-plaza', // shimmering water disc (reuses the `fountain-water` tag)
  'bell-tower', // the belfry bell sways
  'moondial', // the dial face drifts very slowly
]);

/**
 * Per-building HSL variation so a district reads cohesive but alive instead of
 * monochrome: a subtle hash-driven hue/sat/light shift per building id, plus the
 * occasional roof-accent pop. Cheap — runs once per building per palette change.
 */
function varyPalette(building: Building, base: BuildingPalette): BuildingPalette {
  const id = building.id;
  const dh = (hashFloat(id, 51) - 0.5) * 0.05; //  ±~18° hue
  const ds = (hashFloat(id, 52) - 0.5) * 0.18; //  ±sat
  const dl = (hashFloat(id, 53) - 0.5) * 0.16; //  ±light (~±8%)
  const wall = shiftHSL(base.wall, dh, ds, dl);
  // Roof accent: mostly the district accent, occasionally a small harmony pop.
  const accentPop = hashFloat(id, 54);
  const accent =
    accentPop < 0.18
      ? shiftHSL(base.accent, (hashFloat(id, 55) - 0.5) * 0.12, 0.06, 0.04)
      : shiftHSL(base.accent, dh * 0.5, ds * 0.4, dl * 0.4);
  const trim = shiftHSL(base.trim, dh, ds * 0.5, dl * 0.6);
  return { wall, accent, trim, glow: base.glow, glowI: base.glowI };
}

export function BuildingMesh({ building, palette, wobble = false, facing }: BuildingMeshProps) {
  const rotY = facing ?? building.rotation;
  const groupRef = useRef<Group>(null);
  const bladesRef = useRef<Group | null>(null);
  const waterRef = useRef<Group | null>(null);
  const ringRef = useRef<Group | null>(null);
  const orbsRef = useRef<Group | null>(null);
  const bellRef = useRef<Group | null>(null);
  const dialRef = useRef<Group | null>(null);
  const craneRef = useRef<Group | null>(null);

  // Per-building varied palette (keyed on id + the base palette strings).
  const vp = useMemo(
    () => varyPalette(building, palette),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [building.id, palette.wall, palette.accent, palette.trim, palette.glow, palette.glowI],
  );

  // Memoize the static sub-scene per kind + varied palette. `construction` is a
  // dependency so the mesh swaps from scaffolding to the finished landmark on
  // the day the project completes (same id/kind, only the flag clears).
  const content = useMemo(
    () => buildKind(building, vp),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      building.id,
      building.kind,
      building.floors,
      building.construction,
      vp.wall,
      vp.accent,
      vp.trim,
      vp.glow,
      vp.glowI,
    ],
  );

  const isSpire = building.kind === 'arcane-spire';
  // Construction sites always animate (the crane swings) regardless of kind.
  const needsAnim = ANIMATED_KINDS.has(building.kind) || building.construction === true || wobble;

  // Per-building deterministic phase offsets so animations don't sync up.
  const phase = useMemo(() => hashFloat(building.id, 1) * Math.PI * 2, [building.id]);

  // Pop-in: newly constructed buildings scale up from the ground with a small
  // overshoot. Runs once per mount (i.e. when the building first appears).
  const spawnStart = useRef<number | null>(null);
  const spawnDone = useRef(false);

  useFrame((state) => {
    const t = state.clock.elapsedTime;

    if (!spawnDone.current && groupRef.current) {
      if (spawnStart.current === null) spawnStart.current = t;
      const p = Math.min(1, (t - spawnStart.current) / 0.7);
      // easeOutBack: starts at 0, overshoots slightly, settles at 1.
      const c = 1.70158;
      const e = 1 + (c + 1) * Math.pow(p - 1, 3) + c * Math.pow(p - 1, 2);
      groupRef.current.scale.setScalar(building.scale * 1.5 * Math.max(0, e));
      if (p >= 1) {
        groupRef.current.scale.setScalar(building.scale * 1.5);
        spawnDone.current = true;
      }
    }

    if (!needsAnim) return;

    // Lazily resolve tagged sub-groups once.
    if (building.kind === 'mill' && groupRef.current && bladesRef.current === null) {
      bladesRef.current = (groupRef.current.getObjectByName('mill-blades') as Group) ?? null;
    }
    // Both the roster `fountain` and the `fountain-plaza` landmark tag their
    // water disc with the same name.
    if (
      (building.kind === 'fountain' || building.kind === 'fountain-plaza') &&
      groupRef.current &&
      waterRef.current === null
    ) {
      waterRef.current = (groupRef.current.getObjectByName('fountain-water') as Group) ?? null;
    }
    if (isSpire && groupRef.current && ringRef.current === null) {
      ringRef.current = (groupRef.current.getObjectByName('spire-ring') as Group) ?? null;
      orbsRef.current = (groupRef.current.getObjectByName('spire-orbs') as Group) ?? null;
    }
    if (building.kind === 'bell-tower' && groupRef.current && bellRef.current === null) {
      bellRef.current = (groupRef.current.getObjectByName('bell-swing') as Group) ?? null;
    }
    if (building.kind === 'moondial' && groupRef.current && dialRef.current === null) {
      dialRef.current = (groupRef.current.getObjectByName('moondial-face') as Group) ?? null;
    }
    if (building.construction && groupRef.current && craneRef.current === null) {
      craneRef.current = (groupRef.current.getObjectByName('crane-arm') as Group) ?? null;
    }

    if (bladesRef.current) {
      bladesRef.current.rotation.z = t * 0.6 + phase;
    }
    if (waterRef.current) {
      waterRef.current.position.y = Math.sin(t * 1.6 + phase) * 0.04;
    }
    if (ringRef.current) {
      ringRef.current.rotation.y = t * 0.4 + phase;
      ringRef.current.rotation.z = Math.sin(t * 0.5 + phase) * 0.12;
    }
    if (orbsRef.current) {
      orbsRef.current.rotation.y = -t * 0.7 + phase;
      orbsRef.current.position.y = Math.sin(t * 0.9 + phase) * 0.15;
    }
    if (bellRef.current) {
      // A slow, gentle pendulum swing about the bell's hanger.
      bellRef.current.rotation.z = Math.sin(t * 1.3 + phase) * 0.18;
    }
    if (dialRef.current) {
      // The dial face drifts very slowly, like a sundial tracking time. The
      // base tilt is baked into the group's rotation.x, so we only spin Y.
      dialRef.current.rotation.y = t * 0.05 + phase;
    }
    if (craneRef.current) {
      // The crane arm swings the suspended block lazily back and forth.
      craneRef.current.rotation.y = Math.sin(t * 0.5 + phase) * 0.5;
    }
    if (wobble && groupRef.current) {
      // Gentle, tasteful chaos sway around the building's base rotation.
      groupRef.current.rotation.y = rotY + Math.sin(t * 1.1 + phase) * 0.06;
      groupRef.current.rotation.z = Math.sin(t * 0.8 + phase) * 0.025;
    }
  });

  return (
    <group
      ref={groupRef}
      position={[building.position.x, 0, building.position.z]}
      rotation={[0, rotY, 0]}
      scale={building.scale * 1.5}
    >
      {content}
    </group>
  );
}
