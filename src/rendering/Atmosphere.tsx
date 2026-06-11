import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type {
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  Object3D,
  Points,
  Sprite,
  SpriteMaterial,
} from 'three';
import {
  BufferGeometry,
  CanvasTexture,
  Float32BufferAttribute,
  Object3D as Obj3D,
  type InstancedMesh,
} from 'three';
import { LOWPOLY_SPHERE } from './shared';
import { hashFloat } from './hash';
import { DAYLIGHT } from './daylight';
import type { MoodTheme } from './palette';
import type { CityMood, CityStats } from '../types';

// ---------------------------------------------------------------------------
// Atmosphere — the state-driven showpiece.
//
//   * Lighting follows the DAYLIGHT snapshot (mood theme modulated by the
//     day/night cycle): the sun wheels across the sky, dusk warms, night hands
//     over to cool moonlight. The arcane/chaotic pulses ride on top.
//   * Drifting low-poly clouds + a handful of instanced circling birds + a
//     sun-glow sprite (which tracks the sun and pales into a moon at night).
//   * Smog puffs (pollution > 55) and magic sparkles (magic > 55) react to
//     stats.
//
// All animations are cheap per-frame transforms; geometry/particles are
// allocated once and reused. No per-frame allocation in the hot loops.
// ---------------------------------------------------------------------------

interface AtmosphereProps {
  mood: CityMood;
  stats: CityStats;
  theme: MoodTheme;
  /** World extent the effects should cover (roughly the city bounds). */
  extent: number;
  /** Center of the city bounding box; smog/sparkles anchor here. */
  center: { x: number; z: number };
}

// ----- Smog ----------------------------------------------------------------

interface SmogProps {
  pollution: number;
  extent: number;
}

function Smog({ pollution, extent }: SmogProps) {
  const groupRef = useRef<Group>(null);

  // Count ramps from 0 (at 55) to ~14 (at 100).
  const count = Math.min(14, Math.round((pollution - 55) / 3.2));
  const opacity = Math.min(0.42, 0.14 + (pollution - 55) / 240);

  const puffs = useMemo(() => {
    const arr: { x: number; y: number; z: number; s: number; speed: number; phase: number }[] = [];
    for (let i = 0; i < count; i++) {
      const k = `smog-${i}`;
      arr.push({
        x: (hashFloat(k, 1) - 0.5) * extent * 1.6,
        y: 7 + hashFloat(k, 2) * 11,
        z: (hashFloat(k, 3) - 0.5) * extent * 1.6,
        s: 5 + hashFloat(k, 4) * 7,
        speed: 0.4 + hashFloat(k, 5) * 0.5,
        phase: hashFloat(k, 6) * Math.PI * 2,
      });
    }
    return arr;
  }, [count, extent]);

  useFrame((state) => {
    const g = groupRef.current;
    if (!g) return;
    const t = state.clock.elapsedTime;
    for (let i = 0; i < g.children.length; i++) {
      const child = g.children[i] as Mesh;
      const p = puffs[i];
      if (!p) continue;
      const span = extent * 1.6;
      let x = p.x + ((t * p.speed) % span);
      if (x > span / 2) x -= span;
      child.position.x = x;
      child.position.y = p.y + Math.sin(t * 0.3 + p.phase) * 0.6;
    }
  });

  if (count <= 0) return null;

  return (
    <group ref={groupRef}>
      {puffs.map((p, i) => (
        <mesh key={i} geometry={LOWPOLY_SPHERE} position={[p.x, p.y, p.z]} scale={p.s}>
          <meshStandardMaterial
            color={'#8a8a76'}
            transparent
            opacity={opacity}
            depthWrite={false}
            roughness={1}
            metalness={0}
          />
        </mesh>
      ))}
    </group>
  );
}

// ----- Clouds --------------------------------------------------------------
// A few soft low-poly cloud clusters drifting overhead. Each cloud is a small
// group of squashed spheres; only a handful of meshes total.

function Clouds({ theme, extent }: { theme: MoodTheme; extent: number }) {
  const groupRef = useRef<Group>(null);
  const span = Math.max(220, extent * 3);

  const clouds = useMemo(() => {
    const out: { x: number; y: number; z: number; s: number; speed: number; puffs: { dx: number; dy: number; dz: number; ps: number }[] }[] = [];
    const n = 8;
    for (let i = 0; i < n; i++) {
      const k = `cloud-${i}`;
      const puffN = 3 + Math.floor(hashFloat(k, 9) * 3);
      const puffs: { dx: number; dy: number; dz: number; ps: number }[] = [];
      for (let j = 0; j < puffN; j++) {
        puffs.push({
          dx: (hashFloat(k, 20 + j * 3) - 0.5) * 2.4,
          dy: (hashFloat(k, 21 + j * 3) - 0.5) * 0.5,
          dz: (hashFloat(k, 22 + j * 3) - 0.5) * 1.4,
          ps: 0.7 + hashFloat(k, 23 + j * 3) * 0.7,
        });
      }
      // Keep clouds high and ringed out toward the horizon so they never sit
      // as giant blobs over the city center.
      const a = (i / n) * Math.PI * 2 + hashFloat(k, 7) * 0.6;
      const ringR = span * (0.42 + hashFloat(k, 8) * 0.22);
      out.push({
        x: Math.cos(a) * ringR,
        y: 64 + hashFloat(k, 2) * 26,
        z: Math.sin(a) * ringR,
        s: 4 + hashFloat(k, 4) * 4,
        speed: 0.4 + hashFloat(k, 5) * 0.6,
        puffs,
      });
    }
    return out;
  }, [span]);

  useFrame((state) => {
    const g = groupRef.current;
    if (!g) return;
    const t = state.clock.elapsedTime;
    for (let i = 0; i < g.children.length; i++) {
      const child = g.children[i];
      const c = clouds[i];
      if (!c) continue;
      // Gentle local drift around the cloud's resting spot (stays near the
      // horizon ring, never marches across the whole sky).
      child.position.x = c.x + Math.sin(t * c.speed * 0.25 + i) * 14;
      child.position.z = c.z + Math.cos(t * c.speed * 0.2 + i) * 10;
    }
  });

  return (
    <group ref={groupRef}>
      {clouds.map((c, i) => (
        <group key={i} position={[c.x, c.y, c.z]} scale={c.s}>
          {c.puffs.map((p, j) => (
            <mesh key={j} geometry={LOWPOLY_SPHERE} position={[p.dx, p.dy, p.dz]} scale={[p.ps * 1.4, p.ps, p.ps * 1.2]}>
              <meshStandardMaterial
                color={'#ffffff'}
                emissive={theme.fog}
                emissiveIntensity={0.25}
                userData={{ glowDay: 0.25, glowNight: 0.05 }}
                transparent
                opacity={0.85}
                depthWrite={false}
                roughness={1}
                metalness={0}
                fog={false}
              />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}

// ----- Birds ---------------------------------------------------------------
// A handful of instanced V-shaped birds circling slowly above the city.

const BIRD_COUNT = 10;

function Birds({ extent }: { extent: number }) {
  const meshRef = useRef<InstancedMesh>(null);
  const dummy = useMemo<Object3D>(() => new Obj3D(), []);
  const meta = useMemo(() => {
    const arr: { r: number; y: number; speed: number; phase: number; flap: number }[] = [];
    for (let i = 0; i < BIRD_COUNT; i++) {
      const k = `bird-${i}`;
      arr.push({
        r: extent * (0.5 + hashFloat(k, 1) * 0.7),
        y: 26 + hashFloat(k, 2) * 18,
        speed: 0.12 + hashFloat(k, 3) * 0.16,
        phase: hashFloat(k, 4) * Math.PI * 2,
        flap: 4 + hashFloat(k, 5) * 4,
      });
    }
    return arr;
  }, [extent]);

  useFrame((state) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const t = state.clock.elapsedTime;
    for (let i = 0; i < BIRD_COUNT; i++) {
      const m = meta[i];
      const a = m.phase + t * m.speed;
      const x = Math.cos(a) * m.r;
      const z = Math.sin(a) * m.r;
      const y = m.y + Math.sin(t * 0.4 + m.phase) * 1.5;
      dummy.position.set(x, y, z);
      // Face direction of travel; gentle flap via Z scale.
      dummy.rotation.set(0, -a + Math.PI / 2, Math.sin(t * m.flap + m.phase) * 0.4);
      const flap = 0.8 + Math.abs(Math.sin(t * m.flap + m.phase)) * 0.5;
      dummy.scale.set(1, 1, flap);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, BIRD_COUNT]} frustumCulled={false}>
      {/* a flat, wide shallow cone reads as a little V-bird at distance */}
      <coneGeometry args={[0.6, 0.12, 4]} />
      <meshStandardMaterial color={'#4a4a55'} roughness={1} metalness={0} fog />
    </instancedMesh>
  );
}

// ----- Sun glow sprite -----------------------------------------------------

function makeGlowTexture(): CanvasTexture {
  const size = 128;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,244,214,0.8)');
  g.addColorStop(0.6, 'rgba(255,228,170,0.25)');
  g.addColorStop(1, 'rgba(255,228,170,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return new CanvasTexture(c);
}

function SunGlow({ theme, extent }: { theme: MoodTheme; extent: number }) {
  const spriteRef = useRef<Sprite>(null);
  const tex = useMemo(() => makeGlowTexture(), []);
  useEffect(() => () => tex.dispose(), [tex]);

  const dist = Math.max(220, extent * 3.2);
  const size = Math.max(120, extent * 1.6);

  // The glow rides the animated sun: low and huge at golden hour, high at
  // noon, and at night it shrinks into a pale moon-glow along the moon dir.
  useFrame((state) => {
    const sprite = spriteRef.current;
    if (!sprite) return;
    const t = state.clock.elapsedTime;
    const night = DAYLIGHT.nightness;
    const s =
      size *
      (1 + Math.sin(t * 0.4) * 0.04) *
      (1 + DAYLIGHT.golden * 0.25) *
      (1 - night * 0.55);
    sprite.scale.set(s, s, 1);
    sprite.position.set(
      DAYLIGHT.sunDir.x * dist,
      Math.max(DAYLIGHT.sunDir.y * dist * 0.9, 12),
      DAYLIGHT.sunDir.z * dist,
    );
    const mat = sprite.material as SpriteMaterial;
    mat.color.copy(DAYLIGHT.sunColor);
    mat.opacity = 0.7 * Math.max(0.35 + 0.65 * DAYLIGHT.dayness, night * 0.55);
  });

  return (
    <sprite ref={spriteRef} scale={[size, size, 1]}>
      <spriteMaterial
        map={tex}
        color={theme.sun}
        transparent
        depthWrite={false}
        depthTest={false}
        opacity={0.7}
        fog={false}
        toneMapped={false}
      />
    </sprite>
  );
}

// ----- Magic sparkles -------------------------------------------------------

interface SparklesProps {
  magic: number;
  extent: number;
}

function MagicSparkles({ magic, extent }: SparklesProps) {
  const pointsRef = useRef<Points>(null);

  const count = Math.min(360, Math.round((magic - 55) * 7));
  const size = 0.5 + (magic - 55) / 60;
  const opacity = Math.min(0.95, 0.45 + (magic - 55) / 120);

  const { geometry, meta } = useMemo(() => {
    const positions = new Float32Array(count * 3);
    const m: { baseY: number; speed: number; phase: number }[] = [];
    for (let i = 0; i < count; i++) {
      const k = `spark-${i}`;
      const x = (hashFloat(k, 1) - 0.5) * extent * 1.5;
      const z = (hashFloat(k, 2) - 0.5) * extent * 1.5;
      const baseY = 1 + hashFloat(k, 3) * 14;
      positions[i * 3] = x;
      positions[i * 3 + 1] = baseY;
      positions[i * 3 + 2] = z;
      m.push({
        baseY,
        speed: 0.4 + hashFloat(k, 4) * 0.8,
        phase: hashFloat(k, 5) * Math.PI * 2,
      });
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(positions, 3));
    return { geometry: g, meta: m };
  }, [count, extent]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  useFrame((state) => {
    const pts = pointsRef.current;
    if (!pts) return;
    const t = state.clock.elapsedTime;
    const attr = pts.geometry.getAttribute('position') as Float32BufferAttribute;
    const ceiling = 16;
    for (let i = 0; i < meta.length; i++) {
      const m = meta[i];
      let y = m.baseY + ((t * m.speed) % ceiling);
      if (y > ceiling) y -= ceiling;
      attr.setY(i, y + Math.sin(t + m.phase) * 0.2);
    }
    attr.needsUpdate = true;
  });

  if (count <= 0) return null;

  return (
    <points ref={pointsRef} geometry={geometry}>
      <pointsMaterial
        color={'#d8c4ff'}
        size={size}
        sizeAttenuation
        transparent
        opacity={opacity}
        depthWrite={false}
        toneMapped={false}
      />
    </points>
  );
}

// ----- Lights (day/night driven, with arcane pulse) -------------------------

function MoodLights({ mood, theme }: { mood: CityMood; theme: MoodTheme }) {
  const sunRef = useRef<DirectionalLight>(null);
  const fillRef = useRef<DirectionalLight>(null);
  const hemiRef = useRef<HemisphereLight>(null);

  // Every frame: copy the DAYLIGHT snapshot (theme already folded in by the
  // rig) onto the lights, then layer the mood pulses on the sun.
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    let pulse = 1;
    if (mood === 'arcane') {
      pulse = 1 + Math.sin(t * 0.8) * 0.12;
    } else if (mood === 'chaotic') {
      pulse = 1 + Math.sin(t * 5.3) * 0.05 + Math.sin(t * 11.7) * 0.025;
    }

    const sun = sunRef.current;
    if (sun) {
      sun.position.copy(DAYLIGHT.sunDir).multiplyScalar(140);
      sun.color.copy(DAYLIGHT.sunColor);
      sun.intensity = DAYLIGHT.sunIntensity * pulse;
    }
    const fill = fillRef.current;
    if (fill) {
      fill.position.set(
        -DAYLIGHT.sunDir.x * 140,
        Math.max(DAYLIGHT.sunDir.y, 0.35) * 84,
        -DAYLIGHT.sunDir.z * 140,
      );
      fill.color.copy(DAYLIGHT.ambientColor);
      fill.intensity = DAYLIGHT.fillIntensity;
    }
    const hemi = hemiRef.current;
    if (hemi) {
      hemi.color.copy(DAYLIGHT.ambientColor);
      hemi.groundColor.copy(DAYLIGHT.groundColor);
      hemi.intensity = DAYLIGHT.ambientIntensity;
    }
  });

  return (
    <>
      <hemisphereLight
        ref={hemiRef}
        color={theme.ambient}
        groundColor={theme.groundTint}
        intensity={theme.ambientIntensity}
      />
      <directionalLight
        ref={sunRef}
        color={theme.sun}
        intensity={theme.sunIntensity}
        position={theme.sunPosition}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-bias={-0.0004}
        shadow-radius={4}
        shadow-camera-near={1}
        shadow-camera-far={400}
        shadow-camera-left={-140}
        shadow-camera-right={140}
        shadow-camera-top={140}
        shadow-camera-bottom={-140}
      />
      {/* Cool fill from the opposite side keeps shadows from going pure black. */}
      <directionalLight
        ref={fillRef}
        color={theme.ambient}
        intensity={theme.sunIntensity * 0.35}
        position={[-theme.sunPosition[0], theme.sunPosition[1] * 0.6, -theme.sunPosition[2]]}
      />
    </>
  );
}

export function Atmosphere({ mood, stats, theme, extent, center }: AtmosphereProps) {
  // Fog + background are driven imperatively in CityScene's SceneFog so mood
  // changes don't remount the scene graph. Here we own the lights + effects.
  return (
    <>
      <MoodLights mood={mood} theme={theme} />
      <SunGlow theme={theme} extent={extent} />
      <group position={[center.x, 0, center.z]}>
        <Clouds theme={theme} extent={extent} />
        <Birds extent={extent} />
        {stats.pollution > 55 && <Smog pollution={stats.pollution} extent={extent} />}
        {stats.magic > 55 && <MagicSparkles magic={stats.magic} extent={extent} />}
      </group>
    </>
  );
}
