import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Object3D, type InstancedMesh } from 'three';
import type { City } from '../types';
import { terrainHeightAt } from '../generation/terrain';
import { LOWPOLY_SPHERE } from './shared';
import { hashFloat } from './hash';

// ---------------------------------------------------------------------------
// ChimneySmoke — cozy puffs rising from hearths, campfires and workshops.
//
// A deterministic subset of visible buildings gets a little column of
// low-poly smoke: every workshop and tavern (the stew is always on), about
// half the houses, most tents (campfires). A few instanced spheres per
// chimney loop upward with a light wind drift, growing as they rise and
// thinning out at the top. One InstancedMesh, one transparent material,
// capped instance count — cheap at any city size.
//
// This is separate from (and composes with) the pollution smog in
// Atmosphere.tsx, which reacts to the pollution stat.
// ---------------------------------------------------------------------------

const MAX_CHIMNEYS = 36;
const PUFFS_PER_CHIMNEY = 4;
/** How far puffs rise above the chimney before recycling. */
const RISE = 2.9;

const dummy = new Object3D();

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

interface SmokeSource {
  x: number;
  /** World height of the chimney mouth. */
  y: number;
  z: number;
  /** Loop speed (rise duration ~6-9s) + phase, hashed per building. */
  speed: number;
  phase: number;
}

export function ChimneySmoke({ city }: { city: City }) {
  const meshRef = useRef<InstancedMesh>(null);
  const terrain = city.terrain;

  // Track development coarsely so the source list only rebuilds when new
  // buildings actually appear, not on every day tick.
  const devKey = city.districts
    .map((d) => `${d.id}:${Math.floor(d.development / 10)}`)
    .join('|');

  const sources = useMemo(() => {
    const candidates: (SmokeSource & { r: number })[] = [];
    for (const d of city.districts) {
      for (const b of d.buildings) {
        if (b.appearAt > d.development / 100) continue;
        // Hearth probability + chimney-mouth height (in local pre-scale units)
        // per kind; anything not listed never smokes.
        let lit: number;
        let mouth: number;
        switch (b.kind) {
          case 'workshop':
          case 'tavern':
            lit = 1;
            mouth = b.kind === 'tavern' ? 1.8 : 1.5;
            break;
          case 'house':
            lit = 0.5;
            mouth = 1.4;
            break;
          case 'tent':
            lit = 0.65;
            mouth = 1.45;
            break;
          default:
            continue;
        }
        const r = hashFloat(b.id, 91);
        if (r > lit) continue;
        const ground = terrainHeightAt(terrain, b.position.x, b.position.z) - 0.12;
        candidates.push({
          x: b.position.x,
          y: ground + b.scale * 1.5 * mouth,
          z: b.position.z,
          speed: 1 / (6 + hashFloat(b.id, 92) * 3),
          phase: hashFloat(b.id, 93),
          r,
        });
      }
    }
    // Deterministic cap: keep the same chimneys as the city grows.
    candidates.sort((a, b) => a.r - b.r);
    return candidates.slice(0, MAX_CHIMNEYS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [city.seed.value, devKey, terrain?.flats.length]);

  const count = sources.length * PUFFS_PER_CHIMNEY;

  useFrame((state) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const t = state.clock.elapsedTime;
    for (let i = 0; i < sources.length; i++) {
      const src = sources[i];
      for (let j = 0; j < PUFFS_PER_CHIMNEY; j++) {
        // Each puff loops 0..1 up the column, staggered around the cycle.
        const u = (t * src.speed + src.phase + j / PUFFS_PER_CHIMNEY) % 1;
        const sway = Math.sin(t * 0.5 + src.phase * 6.28 + j) * 0.12;
        dummy.position.set(
          src.x + sway + u * 0.85, // light easterly wind drift
          src.y + u * RISE,
          src.z + sway * 0.6,
        );
        // Grow while rising, thin out near the top, fade in at the mouth.
        const s =
          0.34 *
          (0.45 + u * 1.15) *
          smoothstep(0, 0.08, u) *
          (1 - smoothstep(0.72, 1, u));
        dummy.scale.set(s * 1.15, s, s * 1.1);
        dummy.updateMatrix();
        mesh.setMatrixAt(i * PUFFS_PER_CHIMNEY + j, dummy.matrix);
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
  });

  if (count === 0) return null;

  return (
    // Keyed on count: InstancedMesh capacity is fixed at construction.
    <instancedMesh
      key={count}
      ref={meshRef}
      args={[undefined, undefined, count]}
      geometry={LOWPOLY_SPHERE}
      frustumCulled={false}
    >
      <meshStandardMaterial
        color={'#b9b3a8'}
        transparent
        opacity={0.55}
        depthWrite={false}
        roughness={1}
        metalness={0}
      />
    </instancedMesh>
  );
}
