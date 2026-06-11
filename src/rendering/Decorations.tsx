import { useMemo } from 'react';
import type { Building, District } from '../types';
import {
  UNIT_CYLINDER,
  UNIT_CONE_SMOOTH,
  LOWPOLY_SPHERE,
} from './shared';
import { hashFloat, hashRange } from './hash';
import { distance } from '../utils/math';

// ---------------------------------------------------------------------------
// Decorations — procedural greenery scattered on district platforms when the
// city is beautiful (stats.beauty > 60). Counts scale with beauty.
//
// Placement is fully deterministic: derived from district.id + index via
// hashing, never Math.random, so trees/flowers stay put across frames and
// re-renders (the city object is replaced every simulated day).
// ---------------------------------------------------------------------------

interface DecorationsProps {
  district: District;
  beauty: number;
  /** Foliage tint (leans on mood-tinted greens). */
  leaf: string;
  trunk: string;
  flower: string;
  /** Ground height query (terrain) so greenery sits on the land. */
  groundAt: (x: number, z: number) => number;
}

interface Placed {
  x: number;
  z: number;
  s: number;
  kind: 'tree' | 'flower';
  rot: number;
}

/** Distance² from a building, to avoid dropping trees on rooftops. */
function tooCloseToBuilding(
  x: number,
  z: number,
  buildings: Building[],
  minDist: number,
): boolean {
  for (const b of buildings) {
    if (distance({ x, z }, b.position) < minDist) return true;
  }
  return false;
}

export function Decorations({ district, beauty, leaf, trunk, flower, groundAt }: DecorationsProps) {
  const placed = useMemo<Placed[]>(() => {
    if (beauty <= 60) return [];
    // 0 at beauty=60, ramping up to ~16 decorations near beauty=100.
    const intensity = (beauty - 60) / 40; // 0..1
    const count = Math.round(4 + intensity * 12);
    const out: Placed[] = [];
    const cx = district.position.x;
    const cz = district.position.z;
    const usableR = district.radius - 1.5;

    for (let i = 0; i < count; i++) {
      const key = district.id;
      const angle = hashFloat(key, i * 3 + 11) * Math.PI * 2;
      // Bias toward the platform edge where buildings are sparser.
      const r = (0.45 + hashFloat(key, i * 3 + 12) * 0.5) * usableR;
      const x = cx + Math.cos(angle) * r;
      const z = cz + Math.sin(angle) * r;
      if (tooCloseToBuilding(x, z, district.buildings, 2.4)) continue;
      const isFlower = hashFloat(key, i * 3 + 13) < 0.35;
      out.push({
        x,
        z,
        s: hashRange(key, i * 3 + 14, 0.6, 1.15),
        kind: isFlower ? 'flower' : 'tree',
        rot: hashFloat(key, i * 3 + 15) * Math.PI * 2,
      });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [district.id, district.radius, district.position.x, district.position.z, beauty]);

  if (placed.length === 0) return null;

  return (
    <group>
      {placed.map((d, i) =>
        d.kind === 'tree' ? (
          <group key={i} position={[d.x, groundAt(d.x, d.z) - 0.05, d.z]} rotation={[0, d.rot, 0]} scale={d.s}>
            {/* trunk */}
            <mesh geometry={UNIT_CYLINDER} position={[0, 0.3, 0]} scale={[0.12, 0.6, 0.12]}>
              <meshStandardMaterial color={trunk} roughness={0.9} />
            </mesh>
            {/* layered low-poly canopy */}
            <mesh geometry={UNIT_CONE_SMOOTH} position={[0, 0.85, 0]} scale={[0.7, 0.8, 0.7]}>
              <meshStandardMaterial color={leaf} roughness={0.85} />
            </mesh>
            <mesh geometry={UNIT_CONE_SMOOTH} position={[0, 1.2, 0]} scale={[0.5, 0.6, 0.5]}>
              <meshStandardMaterial color={leaf} roughness={0.85} />
            </mesh>
          </group>
        ) : (
          <group key={i} position={[d.x, groundAt(d.x, d.z) - 0.02, d.z]} scale={d.s}>
            {/* stem */}
            <mesh geometry={UNIT_CYLINDER} position={[0, 0.15, 0]} scale={[0.04, 0.3, 0.04]}>
              <meshStandardMaterial color={'#4f8a3d'} roughness={0.9} />
            </mesh>
            {/* bloom */}
            <mesh geometry={LOWPOLY_SPHERE} position={[0, 0.34, 0]} scale={[0.16, 0.16, 0.16]}>
              <meshStandardMaterial color={flower} emissive={flower} emissiveIntensity={0.12} roughness={0.7} />
            </mesh>
          </group>
        ),
      )}
    </group>
  );
}
