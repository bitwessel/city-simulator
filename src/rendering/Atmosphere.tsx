import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type {
  DirectionalLight,
  Group,
  Mesh,
  Points,
} from 'three';
import { BufferGeometry, Float32BufferAttribute } from 'three';
import { LOWPOLY_SPHERE } from './shared';
import { hashFloat } from './hash';
import type { MoodTheme } from './palette';
import type { CityMood, CityStats } from '../types';

// ---------------------------------------------------------------------------
// Atmosphere — the state-driven showpiece.
//
//   * Lighting & fog come from the mood theme (set in CityScene; the arcane
//     pulse lives here on the directional light ref).
//   * Smog puffs: drifting translucent gray spheres when pollution > 55,
//     count + opacity scaling with pollution.
//   * Magic sparkles: glowing points drifting upward when magic > 55, more &
//     brighter as magic rises.
//
// All animations are cheap per-frame transforms; geometry/particles are
// allocated once and reused.
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
  const opacity = Math.min(0.5, 0.18 + (pollution - 55) / 200);

  const puffs = useMemo(() => {
    const arr: { x: number; y: number; z: number; s: number; speed: number; phase: number }[] = [];
    for (let i = 0; i < count; i++) {
      const k = `smog-${i}`;
      arr.push({
        x: (hashFloat(k, 1) - 0.5) * extent * 1.6,
        y: 6 + hashFloat(k, 2) * 10,
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
      // Drift slowly and wrap around the city extent.
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
            color={'#6b6b5e'}
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

// ----- Magic sparkles -------------------------------------------------------

interface SparklesProps {
  magic: number;
  extent: number;
}

function MagicSparkles({ magic, extent }: SparklesProps) {
  const pointsRef = useRef<Points>(null);

  const count = Math.min(360, Math.round((magic - 55) * 7));
  const size = 0.5 + (magic - 55) / 60; // bigger/brighter with more magic
  const opacity = Math.min(0.95, 0.45 + (magic - 55) / 120);

  // Static base positions + per-particle speed/phase. Y is animated each frame.
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

  // Dispose the GPU buffers when this geometry instance is replaced (magic
  // crossing thresholds across day ticks) or the component unmounts.
  useEffect(() => () => geometry.dispose(), [geometry]);

  useFrame((state) => {
    const pts = pointsRef.current;
    if (!pts) return;
    const t = state.clock.elapsedTime;
    const attr = pts.geometry.getAttribute('position') as Float32BufferAttribute;
    const ceiling = 16;
    for (let i = 0; i < meta.length; i++) {
      const m = meta[i];
      // Drift upward and wrap to the floor; gentle horizontal shimmer via Y only.
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
        color={'#c9b3ff'}
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

// ----- Lights (with arcane pulse) ------------------------------------------

function MoodLights({ mood, theme }: { mood: CityMood; theme: MoodTheme }) {
  const sunRef = useRef<DirectionalLight>(null);
  const baseIntensity = theme.sunIntensity;

  useFrame((state) => {
    const sun = sunRef.current;
    if (!sun) return;
    if (mood === 'arcane') {
      // Slow, dreamy ambient pulse for the arcane twilight.
      const t = state.clock.elapsedTime;
      sun.intensity = baseIntensity * (1 + Math.sin(t * 0.8) * 0.18);
    } else if (mood === 'chaotic') {
      // Restless flicker.
      const t = state.clock.elapsedTime;
      sun.intensity = baseIntensity * (1 + Math.sin(t * 5.3) * 0.06 + Math.sin(t * 11.7) * 0.03);
    } else if (sun.intensity !== baseIntensity) {
      sun.intensity = baseIntensity;
    }
  });

  return (
    <>
      <hemisphereLight
        color={theme.ambient}
        groundColor={theme.groundTint}
        intensity={theme.ambientIntensity}
      />
      <directionalLight
        ref={sunRef}
        color={theme.sun}
        intensity={baseIntensity}
        position={theme.sunPosition}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-near={1}
        shadow-camera-far={250}
        shadow-camera-left={-90}
        shadow-camera-right={90}
        shadow-camera-top={90}
        shadow-camera-bottom={-90}
      />
      {/* Cool fill from the opposite side keeps shadows from going pure black. */}
      <directionalLight
        color={theme.ambient}
        intensity={baseIntensity * 0.25}
        position={[-theme.sunPosition[0], theme.sunPosition[1] * 0.6, -theme.sunPosition[2]]}
      />
    </>
  );
}

export function Atmosphere({ mood, stats, theme, extent, center }: AtmosphereProps) {
  // Fog + background are driven imperatively in CityScene's SceneFog so mood
  // changes don't remount the scene graph. Here we own the lights + effects.
  // Smog/sparkles are anchored on the city's center (lights stay put so the
  // shadow frustum keeps covering the world origin area).
  return (
    <>
      <MoodLights mood={mood} theme={theme} />
      <group position={[center.x, 0, center.z]}>
        {stats.pollution > 55 && <Smog pollution={stats.pollution} extent={extent} />}
        {stats.magic > 55 && <MagicSparkles magic={stats.magic} extent={extent} />}
      </group>
    </>
  );
}
