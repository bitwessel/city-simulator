import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  PlaneGeometry,
  type Mesh,
  type MeshStandardMaterial,
} from 'three';
import type { City, District, TerrainData } from '../types';
import {
  WATER_LEVEL,
  riverDistanceAt,
  terrainHeightAt,
} from '../generation/terrain';
import { mixHex, scaleHex, type MoodTheme } from './palette';
import { LOWPOLY_SPHERE, UNIT_CONE_SMOOTH } from './shared';
import { hashFloat } from './hash';

// ---------------------------------------------------------------------------
// Terrain — the continuous generated landscape (supersedes the old flat
// Ground disc and the district platform islands):
//   * a vertex-colored heightfield built from `city.terrain` via the shared
//     `terrainHeightAt` query (one source of truth — no renderer-side noise),
//     with mood-tinted grass, sandy river banks, a dark riverbed, dry
//     hilltops and a faint ownership tint toward each district's base color,
//   * an animated river water ribbon lying in the carved channel,
//   * the low backdrop plain + horizon ring of hills/forests kept for depth.
//
// Geometry is built once per city (and again when expansion adds a plateau);
// only the color attribute is rewritten when the mood theme changes.
// ---------------------------------------------------------------------------

/** Heightfield grid segments per side (~25k vertices — modest, no textures). */
const SEGMENTS = 156;
/** The backdrop plain sits just under the river surface at the map edge. */
const BACKDROP_Y = -0.55;

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

interface Heightfield {
  geometry: BufferGeometry;
  /** Cached per-vertex height + river distance so repaints stay cheap. */
  heights: Float32Array;
  riverDist: Float32Array;
}

function buildHeightfield(terrain: TerrainData): Heightfield {
  const geo = new PlaneGeometry(
    terrain.size * 2,
    terrain.size * 2,
    SEGMENTS,
    SEGMENTS,
  );
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const heights = new Float32Array(pos.count);
  const riverDist = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const h = terrainHeightAt(terrain, x, z);
    pos.setY(i, h);
    heights[i] = h;
    riverDist[i] = riverDistanceAt(terrain, x, z);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return { geometry: geo, heights, riverDist };
}

/**
 * (Re)write the heightfield's vertex colors: grass with patchy hash noise,
 * dry hilltops, sandy wet banks, dark riverbed, and a soft blend toward each
 * district's base color as the ownership cue that replaced the platform discs.
 */
function paintHeightfield(
  field: Heightfield,
  terrain: TerrainData,
  districts: District[],
  theme: MoodTheme,
): void {
  const pos = field.geometry.attributes.position;
  const existing = field.geometry.getAttribute('color') as
    | Float32BufferAttribute
    | undefined;
  const colors =
    existing && existing.count === pos.count
      ? (existing.array as Float32Array)
      : new Float32Array(pos.count * 3);

  const grass = new Color(mixHex('#6a9a55', theme.groundTint, 0.4));
  const dark = grass.clone().multiplyScalar(0.8);
  const light = grass.clone().multiplyScalar(1.14);
  const sand = new Color(mixHex('#cfbb8d', theme.groundTint, 0.25));
  const bed = new Color(mixHex('#55645c', theme.groundTint, 0.2));
  const dry = new Color(mixHex('#a3a878', theme.groundTint, 0.3));
  const tmp = new Color();

  const sites = districts.map((d) => ({
    x: d.position.x,
    z: d.position.z,
    r: d.radius,
    color: new Color(mixHex(d.visualStyle.baseColor, '#ffffff', 0.12)),
  }));
  const halfW = terrain.river.width / 2;

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const h = field.heights[i];
    const dRiver = field.riverDist[i];

    // Patchy meadow noise from two hashed bands (stable across repaints).
    const n =
      hashFloat('terrain', Math.round(x * 0.14) * 131 + Math.round(z * 0.14)) * 0.6 +
      hashFloat('terrain2', Math.round(x * 0.45) * 71 + Math.round(z * 0.45)) * 0.4;
    tmp.copy(dark).lerp(light, n);

    // High ground dries out a touch.
    if (h > 2.7) tmp.lerp(dry, Math.min(1, (h - 2.7) / 2.3) * 0.5);

    // Faint district ownership blend (replaces the retired platform discs).
    for (const s of sites) {
      const dx = x - s.x;
      const dz = z - s.z;
      const reach = s.r * 1.35;
      if (Math.abs(dx) > reach || Math.abs(dz) > reach) continue;
      const d = Math.hypot(dx, dz);
      if (d >= reach) continue;
      const t = 1 - smoothstep(s.r * 0.75, reach, d);
      tmp.lerp(s.color, t * 0.3);
    }

    // Banks go sandy, the channel floor goes dark and wet. Applied last.
    if (dRiver < halfW * 2.3) {
      const t = 1 - smoothstep(halfW * 1.0, halfW * 2.3, dRiver);
      tmp.lerp(sand, t * 0.8);
    }
    if (h < WATER_LEVEL + 0.12) tmp.lerp(bed, 0.75);

    colors[i * 3] = tmp.r;
    colors[i * 3 + 1] = tmp.g;
    colors[i * 3 + 2] = tmp.b;
  }

  if (existing && existing.count === pos.count) {
    existing.needsUpdate = true;
  } else {
    field.geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  }
}

/** Build the river water surface: a ribbon following the centerline. */
function buildRiverGeometry(terrain: TerrainData): BufferGeometry {
  const pts = terrain.river.points;
  // Slightly past the channel half-width so the edges tuck under the banks.
  const half = terrain.river.width * 0.59;
  const positions = new Float32Array(pts.length * 2 * 3);
  for (let i = 0; i < pts.length; i++) {
    const prev = pts[Math.max(0, i - 1)];
    const next = pts[Math.min(pts.length - 1, i + 1)];
    let nx = -(next.z - prev.z);
    let nz = next.x - prev.x;
    const len = Math.hypot(nx, nz) || 1;
    nx /= len;
    nz /= len;
    positions[i * 6] = pts[i].x + nx * half;
    positions[i * 6 + 1] = 0;
    positions[i * 6 + 2] = pts[i].z + nz * half;
    positions[i * 6 + 3] = pts[i].x - nx * half;
    positions[i * 6 + 4] = 0;
    positions[i * 6 + 5] = pts[i].z - nz * half;
  }
  const indices: number[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = i * 2;
    // Wound so faces point UP (+Y) — the surface is viewed from above.
    indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/** The shimmering river surface lying in the carved channel. */
function RiverWater({ city, theme }: { city: City; theme: MoodTheme }) {
  const matRef = useRef<MeshStandardMaterial>(null);
  const meshRef = useRef<Mesh>(null);
  const waterColor = useMemo(() => mixHex('#3f86b5', theme.groundTint, 0.25), [theme]);
  const waterEmissive = useMemo(() => mixHex('#1d5a82', theme.colorShift, 0.2), [theme]);

  const geometry = useMemo(
    () => (city.terrain ? buildRiverGeometry(city.terrain) : null),
    // The river never changes for a given seed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [city.seed.value],
  );
  useEffect(() => () => geometry?.dispose(), [geometry]);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (matRef.current) {
      // Gentle emissive shimmer.
      matRef.current.emissiveIntensity = 0.16 + Math.sin(t * 0.5) * 0.06;
    }
    if (meshRef.current) {
      // Barely-there bob so the surface feels alive.
      meshRef.current.position.y = WATER_LEVEL + Math.sin(t * 0.4) * 0.02;
    }
  });

  if (!geometry) return null;
  return (
    <mesh ref={meshRef} geometry={geometry} position={[0, WATER_LEVEL, 0]}>
      <meshStandardMaterial
        ref={matRef}
        color={waterColor}
        emissive={waterEmissive}
        emissiveIntensity={0.18}
        roughness={0.22}
        metalness={0.35}
        transparent
        opacity={0.92}
      />
    </mesh>
  );
}

/** A ring of low-poly hills + forest blobs around the horizon (kept). */
function HorizonRing({ theme, extent }: { theme: MoodTheme; extent: number }) {
  const ringR = Math.max(230, extent * 2.4);
  const hillColor = useMemo(() => mixHex(theme.horizon, theme.groundTint, 0.4), [theme]);
  const forestColor = useMemo(() => mixHex('#3f6f3c', theme.horizon, 0.45), [theme]);

  const items = useMemo(() => {
    const out: { x: number; z: number; s: number; h: number; forest: boolean }[] = [];
    const n = 46;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + (hashFloat('horizon', i) - 0.5) * 0.12;
      const r = ringR * (0.92 + hashFloat('horizon', i + 200) * 0.18);
      const forest = hashFloat('horizon', i + 400) < 0.45;
      out.push({
        x: Math.cos(a) * r,
        z: Math.sin(a) * r,
        s: 16 + hashFloat('horizon', i + 600) * 26,
        h: 10 + hashFloat('horizon', i + 800) * 22,
        forest,
      });
    }
    return out;
  }, [ringR]);

  return (
    <group>
      {items.map((it, i) =>
        it.forest ? (
          <mesh
            key={i}
            geometry={UNIT_CONE_SMOOTH}
            position={[it.x, it.h * 0.3, it.z]}
            scale={[it.s, it.h, it.s]}
          >
            <meshStandardMaterial color={forestColor} roughness={1} metalness={0} fog />
          </mesh>
        ) : (
          <mesh
            key={i}
            geometry={LOWPOLY_SPHERE}
            position={[it.x, -it.h * 0.35, it.z]}
            scale={[it.s, it.h, it.s]}
          >
            <meshStandardMaterial color={hillColor} roughness={1} metalness={0} fog />
          </mesh>
        ),
      )}
    </group>
  );
}

export interface TerrainProps {
  city: City;
  theme: MoodTheme;
  /** City extent so the horizon ring scales out past the largest cities. */
  extent: number;
}

export function Terrain({ city, theme, extent }: TerrainProps) {
  const terrain = city.terrain;
  const flatsLen = terrain?.flats.length ?? 0;

  // Heightfield geometry: rebuilt only for a new city or a newly founded
  // district plateau — never on plain day ticks (the cloned terrain object is
  // referentially new each day, so we key on stable values instead).
  const field = useMemo(
    () => (terrain ? buildHeightfield(terrain) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [city.seed.value, flatsLen],
  );
  useEffect(() => () => field?.geometry.dispose(), [field]);

  // Repaint vertex colors when the mood theme shifts or districts appear.
  useEffect(() => {
    if (field && terrain) paintHeightfield(field, terrain, city.districts, theme);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [field, theme, city.districts.length]);

  const backdrop = useMemo(
    () => scaleHex(mixHex('#6a9a55', theme.groundTint, 0.4), 0.7),
    [theme],
  );

  return (
    <group>
      {/* Far backdrop plain (frames the edge of the world, meets the river). */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, BACKDROP_Y, 0]}>
        <circleGeometry args={[Math.max(440, extent * 4), 64]} />
        <meshStandardMaterial color={backdrop} roughness={1} metalness={0} fog />
      </mesh>

      {/* The heightfield the whole city sits on. */}
      {field ? (
        <mesh geometry={field.geometry} receiveShadow>
          <meshStandardMaterial vertexColors roughness={1} metalness={0} />
        </mesh>
      ) : (
        // Older in-memory cities without terrain data: flat ground at y=0.
        <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <circleGeometry args={[Math.max(150, extent * 1.7), 72]} />
          <meshStandardMaterial
            color={mixHex('#6a9a55', theme.groundTint, 0.4)}
            roughness={1}
            metalness={0}
          />
        </mesh>
      )}

      <RiverWater city={city} theme={theme} />

      {/* Distant hills + forest for depth. */}
      <HorizonRing theme={theme} extent={extent} />
    </group>
  );
}
