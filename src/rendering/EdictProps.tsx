import { useLayoutEffect, useMemo, useRef } from 'react';
import { Object3D, type InstancedMesh } from 'three';
import type { City } from '../types';
import { terrainHeightAt } from '../generation/terrain';
import { districtPathSpokes } from './sceneryLayout';
import { UNIT_CYLINDER, UNIT_CYLINDER_LOW, UNIT_BOX, LOWPOLY_SPHERE } from './shared';
import { hashFloat } from './hash';
import { mixHex } from './palette';
import { EDICT_POOL } from '../simulation/data/edicts';

// ---------------------------------------------------------------------------
// EdictProps — instanced prop layer for the active standing edict.
//
// Each edict type scatters a different set of deterministic props near district
// paths (lanterns, planters, crates, scaffolds). Props appear and disappear
// with the edict; positions are stable per seed+edict+district.
//
// Two InstancedMeshes per prop variant (base + top detail), keyed on count so
// InstancedMesh capacity is re-established when the edict changes.
// ---------------------------------------------------------------------------

const EDICT_DEV_MIN = 25;
const MAX_EDICT_PROPS = 160;

const dummy = new Object3D();

interface PropSpot {
  x: number;
  y: number;
  z: number;
}

function buildSpots(city: City, edictId: string): PropSpot[] {
  const spots: PropSpot[] = [];
  const terrain = city.terrain;
  for (const d of city.districts) {
    if (d.development < EDICT_DEV_MIN) continue;
    const spokes = districtPathSpokes(d);
    for (let s = 0; s < spokes.length; s++) {
      const pts = spokes[s];
      if (pts.length === 0) continue;
      const f = 0.5;
      const p = pts[Math.min(pts.length - 1, Math.round(f * (pts.length - 1)))];
      // Offset deterministically from the path (unique per edict so each has a
      // different scatter, but stable within the same edict).
      const salt = s * 17 + 100;
      const x = p.x + (hashFloat(`edict:${edictId}:${d.id}`, salt) - 0.5) * 3.2;
      const z = p.z + (hashFloat(`edict:${edictId}:${d.id}`, salt + 1) - 0.5) * 3.2;
      spots.push({ x, y: terrainHeightAt(terrain, x, z), z });
      if (spots.length >= MAX_EDICT_PROPS) return spots;
    }
  }
  return spots;
}

export function EdictProps({ city }: { city: City }) {
  const { activeEdict, terrain } = city;
  if (!activeEdict) return null;

  const def = EDICT_POOL.find((e) => e.id === activeEdict);
  if (!def) return null;

  // Memoize positions: rebuild only when the edict changes, a district crosses
  // the dev threshold, or the terrain changes.
  const devKey = city.districts
    .map((d) => `${d.id}:${d.development >= EDICT_DEV_MIN ? 1 : 0}`)
    .join('|');

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const spots = useMemo(
    () => buildSpots(city, activeEdict),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [city.seed.value, activeEdict, devKey, terrain?.flats.length],
  );

  if (spots.length === 0) return null;

  return (
    <group key={`${activeEdict}:${spots.length}`}>
      {def.visual.prop === 'lanterns' && (
        <LanternProps spots={spots} paletteLean={def.visual.paletteLean} />
      )}
      {def.visual.prop === 'planters' && (
        <PlanterProps spots={spots} paletteLean={def.visual.paletteLean} />
      )}
      {def.visual.prop === 'crates' && (
        <CrateProps spots={spots} paletteLean={def.visual.paletteLean} />
      )}
      {def.visual.prop === 'scaffolds' && (
        <ScaffoldProps spots={spots} paletteLean={def.visual.paletteLean} />
      )}
    </group>
  );
}

// ----- Lanterns (warm glow poles — same pattern as Lanterns.tsx) ------------

function LanternProps({
  spots,
  paletteLean,
}: {
  spots: PropSpot[];
  paletteLean?: string;
}) {
  const poleRef = useRef<InstancedMesh>(null);
  const bulbRef = useRef<InstancedMesh>(null);

  const poleColor = paletteLean ? mixHex('#4a4036', paletteLean, 0.3) : '#4a4036';
  const bulbColor = paletteLean ? mixHex('#ffe2a0', paletteLean, 0.3) : '#ffe2a0';
  const bulbEmissive = paletteLean ? mixHex('#ffb84d', paletteLean, 0.3) : '#ffb84d';

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

  return (
    <>
      <instancedMesh ref={poleRef} args={[undefined, undefined, spots.length]} geometry={UNIT_CYLINDER} frustumCulled={false}>
        <meshStandardMaterial color={poleColor} roughness={1} metalness={0} />
      </instancedMesh>
      <instancedMesh ref={bulbRef} args={[undefined, undefined, spots.length]} geometry={LOWPOLY_SPHERE} frustumCulled={false}>
        <meshStandardMaterial
          color={bulbColor}
          emissive={bulbEmissive}
          emissiveIntensity={0.12}
          userData={{ glowDay: 0.12, glowNight: 2.6 }}
          toneMapped={false}
          roughness={0.5}
          metalness={0}
        />
      </instancedMesh>
    </>
  );
}

// ----- Planters (short base + leafy canopy) ----------------------------------

function PlanterProps({
  spots,
  paletteLean,
}: {
  spots: PropSpot[];
  paletteLean?: string;
}) {
  const baseRef = useRef<InstancedMesh>(null);
  const canopyRef = useRef<InstancedMesh>(null);

  const baseColor = paletteLean ? mixHex('#7a6a4e', paletteLean, 0.3) : '#7a6a4e';
  const canopyColor = paletteLean ? mixHex('#4f9a52', paletteLean, 0.3) : '#4f9a52';

  useLayoutEffect(() => {
    const bases = baseRef.current;
    const canopies = canopyRef.current;
    if (!bases || !canopies) return;
    for (let i = 0; i < spots.length; i++) {
      const s = spots[i];
      dummy.position.set(s.x, s.y + 0.2, s.z);
      dummy.scale.set(0.55, 0.4, 0.55);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      bases.setMatrixAt(i, dummy.matrix);
      dummy.position.set(s.x, s.y + 0.62, s.z);
      dummy.scale.set(0.52, 0.52, 0.52);
      dummy.updateMatrix();
      canopies.setMatrixAt(i, dummy.matrix);
    }
    bases.instanceMatrix.needsUpdate = true;
    canopies.instanceMatrix.needsUpdate = true;
  }, [spots]);

  return (
    <>
      <instancedMesh ref={baseRef} args={[undefined, undefined, spots.length]} geometry={UNIT_CYLINDER_LOW} frustumCulled={false}>
        <meshStandardMaterial color={baseColor} roughness={1} metalness={0} />
      </instancedMesh>
      <instancedMesh ref={canopyRef} args={[undefined, undefined, spots.length]} geometry={LOWPOLY_SPHERE} frustumCulled={false}>
        <meshStandardMaterial color={canopyColor} roughness={0.85} metalness={0} />
      </instancedMesh>
    </>
  );
}

// ----- Crates (two stacked boxes for variety) --------------------------------

function CrateProps({
  spots,
  paletteLean,
}: {
  spots: PropSpot[];
  paletteLean?: string;
}) {
  const bigRef = useRef<InstancedMesh>(null);
  const smallRef = useRef<InstancedMesh>(null);

  const bigColor = paletteLean ? mixHex('#8a6a3a', paletteLean, 0.3) : '#8a6a3a';
  const smallColor = paletteLean ? mixHex('#a07840', paletteLean, 0.3) : '#a07840';

  useLayoutEffect(() => {
    const bigs = bigRef.current;
    const smalls = smallRef.current;
    if (!bigs || !smalls) return;
    for (let i = 0; i < spots.length; i++) {
      const s = spots[i];
      dummy.position.set(s.x, s.y + 0.22, s.z);
      dummy.scale.set(0.52, 0.44, 0.52);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      bigs.setMatrixAt(i, dummy.matrix);
      dummy.position.set(s.x + 0.14, s.y + 0.56, s.z - 0.1);
      dummy.scale.set(0.32, 0.32, 0.32);
      dummy.rotation.set(0, 0.4, 0);
      dummy.updateMatrix();
      smalls.setMatrixAt(i, dummy.matrix);
    }
    bigs.instanceMatrix.needsUpdate = true;
    smalls.instanceMatrix.needsUpdate = true;
  }, [spots]);

  return (
    <>
      <instancedMesh ref={bigRef} args={[undefined, undefined, spots.length]} geometry={UNIT_BOX} frustumCulled={false}>
        <meshStandardMaterial color={bigColor} roughness={1} metalness={0} />
      </instancedMesh>
      <instancedMesh ref={smallRef} args={[undefined, undefined, spots.length]} geometry={UNIT_BOX} frustumCulled={false}>
        <meshStandardMaterial color={smallColor} roughness={1} metalness={0} />
      </instancedMesh>
    </>
  );
}

// ----- Scaffolds (vertical post + diagonal brace) ----------------------------

function ScaffoldProps({
  spots,
  paletteLean,
}: {
  spots: PropSpot[];
  paletteLean?: string;
}) {
  const postRef = useRef<InstancedMesh>(null);
  const braceRef = useRef<InstancedMesh>(null);

  const postColor = paletteLean ? mixHex('#c8b87a', paletteLean, 0.3) : '#c8b87a';
  const braceColor = paletteLean ? mixHex('#b8a46a', paletteLean, 0.3) : '#b8a46a';

  useLayoutEffect(() => {
    const posts = postRef.current;
    const braces = braceRef.current;
    if (!posts || !braces) return;
    for (let i = 0; i < spots.length; i++) {
      const s = spots[i];
      dummy.position.set(s.x, s.y + 0.7, s.z);
      dummy.scale.set(0.07, 1.4, 0.07);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      posts.setMatrixAt(i, dummy.matrix);
      dummy.position.set(s.x + 0.18, s.y + 0.55, s.z);
      dummy.scale.set(0.06, 0.9, 0.06);
      dummy.rotation.set(0, 0, Math.PI / 5);
      dummy.updateMatrix();
      braces.setMatrixAt(i, dummy.matrix);
    }
    posts.instanceMatrix.needsUpdate = true;
    braces.instanceMatrix.needsUpdate = true;
  }, [spots]);

  return (
    <>
      <instancedMesh ref={postRef} args={[undefined, undefined, spots.length]} geometry={UNIT_CYLINDER} frustumCulled={false}>
        <meshStandardMaterial color={postColor} roughness={1} metalness={0} />
      </instancedMesh>
      <instancedMesh ref={braceRef} args={[undefined, undefined, spots.length]} geometry={UNIT_CYLINDER} frustumCulled={false}>
        <meshStandardMaterial color={braceColor} roughness={1} metalness={0} />
      </instancedMesh>
    </>
  );
}
