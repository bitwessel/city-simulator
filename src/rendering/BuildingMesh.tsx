import { useMemo, useRef } from 'react';
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
} from './shared';
import { hashFloat } from './hash';

// ---------------------------------------------------------------------------
// BuildingMesh — a distinct low-poly silhouette per BuildingKind (17 kinds).
//
// Each building is a small <group> placed/rotated/scaled by the parent at the
// district level we instead pass position/rotation/scale here so the building
// owns its full transform. Geometry comes from the shared module-level cache;
// only lightweight materials (3-4 colors) are created, memoized per building
// kind+palette so day ticks don't rebuild them.
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
}

interface BuildingMeshProps {
  building: Building;
  palette: BuildingPalette;
  /** Whether the chaos wobble effect is active for this building. */
  wobble?: boolean;
}

// Standard material props for the toy-diorama look: flat, matte, a touch of
// roughness. We disable specular highlights for the low-poly feel.
const MAT = { roughness: 0.85, metalness: 0.05 } as const;

/**
 * Per-kind static sub-scene. Returned as JSX built from shared geometry +
 * inline materials. Materials use the palette so memoization happens at the
 * BuildingMesh level (keyed by kind + palette).
 */
function buildKind(kind: BuildingKind, p: BuildingPalette) {
  const wall = p.wall;
  const accent = p.accent;
  const trim = p.trim;
  const glow = p.glow;

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
          {/* hanging sign */}
          <mesh geometry={UNIT_BOX} position={[0.7, 0.7, 0.5]} scale={[0.3, 0.3, 0.05]}>
            <meshStandardMaterial color={accent} emissive={glow} emissiveIntensity={0.2} {...MAT} />
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
            <meshStandardMaterial color={glow} emissive={glow} emissiveIntensity={2.2} roughness={0.3} />
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
      // static body + a marked sub-group the animator spins. We tag the blade
      // group with userData so BuildingMesh can find it.
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
            <meshStandardMaterial
              color={'#bfe9d2'}
              transparent
              opacity={0.4}
              roughness={0.1}
              metalness={0.0}
            />
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
      // The water disc is tagged so the parent can bob it.
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
const ANIMATED_KINDS = new Set<BuildingKind>(['mill', 'fountain']);

export function BuildingMesh({ building, palette, wobble = false }: BuildingMeshProps) {
  const groupRef = useRef<Group>(null);
  const bladesRef = useRef<Group | null>(null);
  const waterRef = useRef<Group | null>(null);

  // Memoize the static sub-scene per kind + palette. Day ticks that only change
  // stats/mood pass a new palette object, so we key on its primitive contents.
  const content = useMemo(
    () => buildKind(building.kind, palette),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [building.kind, palette.wall, palette.accent, palette.trim, palette.glow],
  );

  const needsAnim = ANIMATED_KINDS.has(building.kind) || wobble;

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
      bladesRef.current =
        (groupRef.current.getObjectByName('mill-blades') as Group) ?? null;
    }
    if (building.kind === 'fountain' && groupRef.current && waterRef.current === null) {
      waterRef.current =
        (groupRef.current.getObjectByName('fountain-water') as Group) ?? null;
    }

    if (bladesRef.current) {
      bladesRef.current.rotation.z = t * 0.6 + phase;
    }
    if (waterRef.current) {
      waterRef.current.position.y = Math.sin(t * 1.6 + phase) * 0.04;
    }
    if (wobble && groupRef.current) {
      // Gentle, tasteful chaos sway around the building's base rotation.
      groupRef.current.rotation.y =
        building.rotation + Math.sin(t * 1.1 + phase) * 0.06;
      groupRef.current.rotation.z = Math.sin(t * 0.8 + phase) * 0.025;
    }
  });

  return (
    <group
      ref={groupRef}
      position={[building.position.x, 0, building.position.z]}
      rotation={[0, building.rotation, 0]}
      scale={building.scale * 1.5}
    >
      {content}
    </group>
  );
}
