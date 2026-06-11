import { useEffect, useMemo, useRef } from 'react';
import {
  BufferGeometry,
  CatmullRomCurve3,
  Float32BufferAttribute,
  Object3D,
  Vector3,
  type InstancedMesh,
  type MeshStandardMaterial,
} from 'three';
import { useFrame } from '@react-three/fiber';
import type { City, TerrainData } from '../types';
import {
  RIVER_BED,
  WATER_LEVEL,
  roadSurfaceHeightAt,
  terrainHeightAt,
} from '../generation/terrain';
import { mixHex, scaleHex, type MoodTheme } from './palette';
import { hashFloat } from './hash';

// ---------------------------------------------------------------------------
// Roads — warm-stone ribbons that follow the terrain between districts and
// BRIDGE the river where they must cross: the deck stays level above the
// water (wooden rails + posts sunk into the bed) while the approaches slope
// down the banks. Dressed with low stone edge posts and tiny lamp posts that
// warm up at dusk.
//
// Geometry depends only on district positions + the terrain (stable per
// city). We build flat ribbon strips per road, memoized by the city's seed so
// day ticks that only change stats/mood never rebuild road geometry.
//
// IMPORTANT: the quadratic-bezier bow math below is load-bearing — citizens &
// carts reproduce it to stay on the ribbon. It is copied verbatim and must not
// change.
// ---------------------------------------------------------------------------

interface RoadsProps {
  city: City;
  theme: MoodTheme;
}

export interface RoadSample {
  x: number;
  z: number;
  /** Unit 2D normal (left of travel). */
  nx: number;
  nz: number;
  /** Road deck height here (terrain, floored at the bridge deck). */
  deck: number;
  /** True where the road spans the river channel. */
  bridge: boolean;
}

interface RoadGeo {
  key: string;
  edge: BufferGeometry;
  main: BufferGeometry;
  trim: BufferGeometry;
  /** Rail ribbons for each bridge span (left + right per span). */
  rails: BufferGeometry[];
  samples: RoadSample[];
  /** Bridge support posts: position + deck height. */
  bridgePosts: { x: number; z: number; deck: number }[];
}

/** Build a flat ribbon strip along the samples (width, vertical lift, and an
 *  optional lateral offset for bridge rails). Exported for the intra-district
 *  path spokes in Districts.tsx, which ribbon the same way. */
export function ribbonGeometry(
  samples: RoadSample[],
  width: number,
  lift: number,
  lateral = 0,
): BufferGeometry {
  const half = width / 2;
  const positions = new Float32Array(samples.length * 2 * 3);
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    const cx = s.x + s.nx * lateral;
    const cz = s.z + s.nz * lateral;
    const y = s.deck + lift;
    positions[i * 6] = cx + s.nx * half;
    positions[i * 6 + 1] = y;
    positions[i * 6 + 2] = cz + s.nz * half;
    positions[i * 6 + 3] = cx - s.nx * half;
    positions[i * 6 + 4] = y;
    positions[i * 6 + 5] = cz - s.nz * half;
  }
  const indices: number[] = [];
  for (let i = 0; i < samples.length - 1; i++) {
    const a = i * 2;
    // Wound so faces point UP (+Y) — the strip is viewed from above.
    indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function buildRoadGeometries(city: City): RoadGeo[] {
  const byId = new Map(city.districts.map((d) => [d.id, d]));
  const terrain: TerrainData | undefined = city.terrain;
  const out: RoadGeo[] = [];

  for (const road of city.roads) {
    const a = byId.get(road.from);
    const b = byId.get(road.to);
    if (!a || !b) continue;

    const start = new Vector3(a.position.x, 0, a.position.z);
    const end = new Vector3(b.position.x, 0, b.position.z);

    // Perpendicular offset for a subtle scenic curve.
    const mid = start.clone().add(end).multiplyScalar(0.5);
    const dir = end.clone().sub(start);
    const len = dir.length();
    dir.normalize();
    const perp = new Vector3(-dir.z, 0, dir.x);
    // Deterministic, small bow based on endpoints. (DO NOT CHANGE — citizens
    // and carts reproduce this exact construction.)
    const bow = ((a.position.x + b.position.z) % 7) - 3.5;
    mid.add(perp.multiplyScalar(bow * 0.06 * Math.min(len, 40) * 0.15));

    const curve = new CatmullRomCurve3([start, mid, end]);

    // Sample the centerline densely enough to hug the terrain.
    const count = Math.max(16, Math.round(len / 2.5));
    const samples: RoadSample[] = [];
    const p = new Vector3();
    const tangent = new Vector3();
    for (let i = 0; i <= count; i++) {
      const t = i / count;
      curve.getPoint(t, p);
      curve.getTangent(t, tangent);
      const nLen = Math.hypot(tangent.x, tangent.z) || 1;
      const ground = terrainHeightAt(terrain, p.x, p.z);
      samples.push({
        x: p.x,
        z: p.z,
        nx: -tangent.z / nLen,
        nz: tangent.x / nLen,
        deck: roadSurfaceHeightAt(terrain, p.x, p.z),
        bridge: ground < WATER_LEVEL + 0.18,
      });
    }

    // Bridge spans: contiguous runs of bridge samples (pad one sample out so
    // rails reach the banks).
    const rails: BufferGeometry[] = [];
    const bridgePosts: { x: number; z: number; deck: number }[] = [];
    let runStart = -1;
    for (let i = 0; i <= samples.length; i++) {
      const isBridge = i < samples.length && samples[i].bridge;
      if (isBridge && runStart < 0) runStart = i;
      if (!isBridge && runStart >= 0) {
        const from = Math.max(0, runStart - 1);
        const to = Math.min(samples.length - 1, i);
        const span = samples.slice(from, to + 1);
        if (span.length >= 2) {
          rails.push(ribbonGeometry(span, 0.16, 0.5, 1.78));
          rails.push(ribbonGeometry(span, 0.16, 0.5, -1.78));
          for (const s of span) {
            bridgePosts.push({ x: s.x + s.nx * 1.78, z: s.z + s.nz * 1.78, deck: s.deck });
            bridgePosts.push({ x: s.x - s.nx * 1.78, z: s.z - s.nz * 1.78, deck: s.deck });
          }
        }
        runStart = -1;
      }
    }

    out.push({
      key: `${road.from}->${road.to}`,
      edge: ribbonGeometry(samples, 4.1, 0.035),
      main: ribbonGeometry(samples, 3.4, 0.07),
      trim: ribbonGeometry(samples, 0.42, 0.095),
      rails,
      samples,
      bridgePosts,
    });
  }
  return out;
}

export function Roads({ city, theme }: RoadsProps) {
  // Rebuild only when the city identity (seed) or its roads/districts change.
  const roads = useMemo(
    () => buildRoadGeometries(city),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [city.seed.value, city.districts.length, city.roads.length],
  );

  // Dispose ribbon buffers when the set is rebuilt (new city) / unmounts.
  useEffect(
    () => () => {
      for (const r of roads) {
        r.edge.dispose();
        r.main.dispose();
        r.trim.dispose();
        for (const rail of r.rails) rail.dispose();
      }
    },
    [roads],
  );

  const roadColor = useMemo(() => mixHex('#cbb893', theme.groundTint, 0.3), [theme]);
  const edgeColor = useMemo(() => scaleHex(roadColor, 0.82), [roadColor]);
  const trimColor = useMemo(() => scaleHex(roadColor, 1.12), [roadColor]);
  const postColor = useMemo(() => mixHex('#8a7a5c', theme.groundTint, 0.2), [theme]);
  const woodColor = useMemo(() => mixHex('#7a5a3a', theme.groundTint, 0.15), [theme]);
  const lampGlow = theme.windowGlow;

  // ----- Lamp + stone-edge-post + bridge-post instances ---------------------
  // Spread tiny lamp posts + low stone posts along each road (skipping bridge
  // decks, which get wooden rails instead). Counts are bounded so even a
  // 13-district city stays cheap.
  const { lamps, posts, bridgePosts } = useMemo(() => {
    const lampsArr: { x: number; z: number; y: number }[] = [];
    const postsArr: { x: number; z: number; y: number }[] = [];
    const bridgeArr: { x: number; z: number; deck: number }[] = [];
    for (const r of roads) {
      bridgeArr.push(...r.bridgePosts);
      // Old cadence: stone posts every ~5 units, lamps every ~9, alternating.
      r.samples.forEach((s, i) => {
        if (s.bridge || i === 0 || i === r.samples.length - 1) return;
        if (i % 2 === 0) {
          postsArr.push({ x: s.x + s.nx * 1.85, z: s.z + s.nz * 1.85, y: s.deck });
          postsArr.push({ x: s.x - s.nx * 1.85, z: s.z - s.nz * 1.85, y: s.deck });
        }
        if (i % 4 === 0) {
          const side = i % 8 === 0 ? 1 : -1;
          lampsArr.push({ x: s.x + s.nx * 2.1 * side, z: s.z + s.nz * 2.1 * side, y: s.deck });
        }
      });
    }
    return {
      lamps: lampsArr.slice(0, 220),
      posts: postsArr.slice(0, 360),
      bridgePosts: bridgeArr.slice(0, 160),
    };
  }, [roads]);

  const lampHeadRef = useRef<InstancedMesh>(null);
  const lampPostRef = useRef<InstancedMesh>(null);
  const stonePostRef = useRef<InstancedMesh>(null);
  const bridgePostRef = useRef<InstancedMesh>(null);
  const lampMatRef = useRef<MeshStandardMaterial>(null);
  const dummy = useMemo(() => new Object3D(), []);

  // Place all instances once per layout change.
  useEffect(() => {
    const head = lampHeadRef.current;
    const post = lampPostRef.current;
    const stone = stonePostRef.current;
    const bridge = bridgePostRef.current;
    if (head && post) {
      lamps.forEach((l, i) => {
        dummy.position.set(l.x, l.y + 1.05, l.z);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        head.setMatrixAt(i, dummy.matrix);
        dummy.position.set(l.x, l.y + 0.5, l.z);
        dummy.updateMatrix();
        post.setMatrixAt(i, dummy.matrix);
      });
      head.instanceMatrix.needsUpdate = true;
      post.instanceMatrix.needsUpdate = true;
    }
    if (stone) {
      posts.forEach((pst, i) => {
        const h = 0.18 + hashFloat(`${pst.x}-${pst.z}`, 1) * 0.12;
        dummy.position.set(pst.x, pst.y + h / 2, pst.z);
        dummy.rotation.set(0, hashFloat(`${pst.x}-${pst.z}`, 2) * Math.PI, 0);
        dummy.scale.set(0.16, h, 0.16);
        dummy.updateMatrix();
        stone.setMatrixAt(i, dummy.matrix);
      });
      stone.instanceMatrix.needsUpdate = true;
    }
    if (bridge) {
      bridgePosts.forEach((bp, i) => {
        // From buried in the riverbed up to the rail top.
        const top = bp.deck + 0.55;
        const bottom = RIVER_BED - 0.3;
        dummy.position.set(bp.x, (top + bottom) / 2, bp.z);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(0.18, top - bottom, 0.18);
        dummy.updateMatrix();
        bridge.setMatrixAt(i, dummy.matrix);
      });
      bridge.instanceMatrix.needsUpdate = true;
    }
  }, [lamps, posts, bridgePosts, dummy]);

  // Lamp heads breathe gently at dusk-ish moods.
  useFrame((state) => {
    if (lampMatRef.current) {
      const t = state.clock.elapsedTime;
      lampMatRef.current.emissiveIntensity = (1.0 + lampGlow * 2.2) * (1 + Math.sin(t * 1.5) * 0.08);
    }
  });

  return (
    <group>
      {roads.map((r) => (
        <group key={r.key}>
          {/* slightly wider darker edge */}
          <mesh geometry={r.edge} receiveShadow>
            <meshStandardMaterial color={edgeColor} roughness={1} metalness={0} />
          </mesh>
          {/* main warm paving ribbon */}
          <mesh geometry={r.main} receiveShadow>
            <meshStandardMaterial color={roadColor} roughness={0.95} metalness={0} />
          </mesh>
          {/* light center trim line */}
          <mesh geometry={r.trim}>
            <meshStandardMaterial color={trimColor} roughness={0.9} metalness={0} />
          </mesh>
          {/* wooden bridge rails over river spans */}
          {r.rails.map((rail, i) => (
            <mesh key={`rail-${i}`} geometry={rail} castShadow>
              <meshStandardMaterial color={woodColor} roughness={0.9} metalness={0} />
            </mesh>
          ))}
        </group>
      ))}

      {/* Low stone edge posts (instanced). */}
      {posts.length > 0 && (
        <instancedMesh
          ref={stonePostRef}
          args={[undefined, undefined, posts.length]}
          castShadow
          frustumCulled={false}
        >
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial color={postColor} roughness={1} metalness={0} />
        </instancedMesh>
      )}

      {/* Bridge support posts, sunk into the riverbed (instanced). */}
      {bridgePosts.length > 0 && (
        <instancedMesh
          ref={bridgePostRef}
          args={[undefined, undefined, bridgePosts.length]}
          castShadow
          frustumCulled={false}
        >
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial color={woodColor} roughness={0.95} metalness={0} />
        </instancedMesh>
      )}

      {/* Lamp posts (instanced): thin pole + glowing head. */}
      {lamps.length > 0 && (
        <>
          <instancedMesh
            ref={lampPostRef}
            args={[undefined, undefined, lamps.length]}
            castShadow
            frustumCulled={false}
          >
            <cylinderGeometry args={[0.05, 0.06, 1.0, 6]} />
            <meshStandardMaterial color={'#4a4136'} roughness={0.9} metalness={0.2} />
          </instancedMesh>
          <instancedMesh
            ref={lampHeadRef}
            args={[undefined, undefined, lamps.length]}
            frustumCulled={false}
          >
            <sphereGeometry args={[0.13, 8, 6]} />
            <meshStandardMaterial
              ref={lampMatRef}
              color={'#ffe8b0'}
              emissive={'#ffcf6b'}
              emissiveIntensity={1.0 + lampGlow * 2.2}
              toneMapped={false}
              roughness={0.4}
            />
          </instancedMesh>
        </>
      )}
    </group>
  );
}
