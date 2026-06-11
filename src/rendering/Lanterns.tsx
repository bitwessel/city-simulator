import { useLayoutEffect, useMemo, useRef } from 'react';
import { Object3D, type InstancedMesh } from 'three';
import type { City } from '../types';
import { terrainHeightAt } from '../generation/terrain';
import { districtPathSpokes } from './sceneryLayout';
import { UNIT_CYLINDER, UNIT_SPHERE } from './shared';
import { hashFloat } from './hash';

// ---------------------------------------------------------------------------
// Lanterns — street lights for developed districts.
//
// Districts that have grown past a development threshold plant a few lantern
// posts beside their dirt-path spokes (deterministic per district id via
// hash.ts). Two InstancedMeshes for the whole city: iron poles + warm bulbs.
// The bulbs barely read by day and bloom after dusk — their material opts
// into the DaylightRig night-glow sweep via userData (see daylight.ts).
// ---------------------------------------------------------------------------

/** Development needed before a district lights its paths at all. */
const LANTERN_DEV = 30;
/** Development at which each spoke gets a second lantern. */
const LANTERN_DEV_DENSE = 70;
const MAX_LANTERNS = 140;

const dummy = new Object3D();

interface LanternSpot {
  x: number;
  y: number;
  z: number;
}

export function Lanterns({ city }: { city: City }) {
  const poleRef = useRef<InstancedMesh>(null);
  const bulbRef = useRef<InstancedMesh>(null);
  const terrain = city.terrain;

  // Recompute only when a district crosses a lantern threshold (the city
  // object itself is referentially new every day tick).
  const devKey = city.districts
    .map((d) => `${d.id}:${d.development >= LANTERN_DEV_DENSE ? 2 : d.development >= LANTERN_DEV ? 1 : 0}`)
    .join('|');

  const spots = useMemo(() => {
    const out: LanternSpot[] = [];
    for (const d of city.districts) {
      if (d.development < LANTERN_DEV) continue;
      const perSpoke = d.development >= LANTERN_DEV_DENSE ? 2 : 1;
      const spokes = districtPathSpokes(d);
      for (let s = 0; s < spokes.length; s++) {
        const pts = spokes[s];
        if (pts.length === 0) continue;
        for (let j = 0; j < perSpoke; j++) {
          const f = perSpoke === 1 ? 0.55 : 0.35 + j * 0.4;
          const p = pts[Math.min(pts.length - 1, Math.round(f * (pts.length - 1)))];
          // Nudge off the path so posts stand beside it, not on it.
          const x = p.x + (hashFloat(`lant:${d.id}`, s * 11 + j * 3) - 0.5) * 1.8;
          const z = p.z + (hashFloat(`lant:${d.id}`, s * 11 + j * 3 + 1) - 0.5) * 1.8;
          out.push({ x, y: terrainHeightAt(terrain, x, z), z });
          if (out.length >= MAX_LANTERNS) return out;
        }
      }
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [city.seed.value, devKey, terrain?.flats.length]);

  useLayoutEffect(() => {
    const poles = poleRef.current;
    const bulbs = bulbRef.current;
    if (!poles || !bulbs) return;
    for (let i = 0; i < spots.length; i++) {
      const s = spots[i];
      dummy.position.set(s.x, s.y + 0.62, s.z);
      dummy.scale.set(0.09, 1.24, 0.09);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      poles.setMatrixAt(i, dummy.matrix);
      dummy.position.set(s.x, s.y + 1.32, s.z);
      dummy.scale.set(0.21, 0.21, 0.21);
      dummy.updateMatrix();
      bulbs.setMatrixAt(i, dummy.matrix);
    }
    poles.instanceMatrix.needsUpdate = true;
    bulbs.instanceMatrix.needsUpdate = true;
  }, [spots]);

  if (spots.length === 0) return null;

  return (
    // Keyed on count: InstancedMesh capacity is fixed at construction.
    <group key={spots.length}>
      {/* frustumCulled off: an InstancedMesh culls by its unit geometry's
          bounding sphere at the origin, not by where the instances sit. */}
      <instancedMesh ref={poleRef} args={[undefined, undefined, spots.length]} geometry={UNIT_CYLINDER} frustumCulled={false}>
        <meshStandardMaterial color={'#4a4036'} roughness={1} metalness={0} />
      </instancedMesh>
      <instancedMesh ref={bulbRef} args={[undefined, undefined, spots.length]} geometry={UNIT_SPHERE} frustumCulled={false}>
        <meshStandardMaterial
          color={'#ffe2a0'}
          emissive={'#ffb84d'}
          emissiveIntensity={0.12}
          userData={{ glowDay: 0.12, glowNight: 2.6 }}
          toneMapped={false}
          roughness={0.5}
          metalness={0}
        />
      </instancedMesh>
    </group>
  );
}
