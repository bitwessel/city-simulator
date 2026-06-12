import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  type Points,
  type PointsMaterial,
} from 'three';
import type { City } from '../types';
import { currentAge } from '../simulation/ages';
import { hashFloat } from './hash';

// ---------------------------------------------------------------------------
// Celebration (phase 04) — a joyful, skippable, non-blocking firework volley
// over the city the moment it enters a new age. Purely cosmetic: positions and
// colors derive from the renderer hash (never the simulation RNG), and the
// whole thing unmounts itself a few seconds later.
// ---------------------------------------------------------------------------

const BURST_PARTICLES = 90;
const BURST_LIFETIME = 2.6; // seconds per burst
const VOLLEY_BURSTS = 7;
const VOLLEY_STAGGER = 0.55; // seconds between launches

const FIREWORK_COLORS = ['#ffd86b', '#ff9ed2', '#8be8ff', '#b6ff9e', '#ffb36b', '#d9b3ff'];

interface BurstSpec {
  key: string;
  position: [number, number, number];
  color: string;
  delay: number;
}

/** One expanding, falling, fading shell of points. */
function FireworkBurst({ spec, bornAt }: { spec: BurstSpec; bornAt: number }) {
  const pointsRef = useRef<Points>(null);

  // Static unit directions + speeds per particle; positions are integrated
  // cheaply in useFrame from t alone (no per-frame allocations).
  const { geometry, dirs, speeds } = useMemo(() => {
    const dirs = new Float32Array(BURST_PARTICLES * 3);
    const speeds = new Float32Array(BURST_PARTICLES);
    for (let i = 0; i < BURST_PARTICLES; i++) {
      // Roughly uniform directions from hash trios (cosmetic — wonky is fine).
      const u = hashFloat(spec.key, i * 3 + 1) * 2 - 1;
      const a = hashFloat(spec.key, i * 3 + 2) * Math.PI * 2;
      const r = Math.sqrt(Math.max(0, 1 - u * u));
      dirs[i * 3] = Math.cos(a) * r;
      dirs[i * 3 + 1] = u;
      dirs[i * 3 + 2] = Math.sin(a) * r;
      speeds[i] = 4.5 + hashFloat(spec.key, i * 3 + 3) * 5.5;
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(BURST_PARTICLES * 3), 3));
    return { geometry, dirs, speeds };
  }, [spec.key]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  useFrame((state) => {
    const points = pointsRef.current;
    if (!points) return;
    const t = state.clock.elapsedTime - bornAt - spec.delay;
    const mat = points.material as PointsMaterial;
    if (t < 0 || t > BURST_LIFETIME) {
      points.visible = false;
      return;
    }
    points.visible = true;
    const pos = points.geometry.getAttribute('position') as BufferAttribute;
    const arr = pos.array as Float32Array;
    // Shell expansion eases out; gravity gently bends the trails down.
    const e = 1 - Math.pow(1 - Math.min(1, t / BURST_LIFETIME), 2.2);
    const drop = 2.6 * t * t;
    for (let i = 0; i < BURST_PARTICLES; i++) {
      const d = speeds[i] * e;
      arr[i * 3] = dirs[i * 3] * d;
      arr[i * 3 + 1] = dirs[i * 3 + 1] * d - drop;
      arr[i * 3 + 2] = dirs[i * 3 + 2] * d;
    }
    pos.needsUpdate = true;
    mat.opacity = Math.max(0, 1 - t / BURST_LIFETIME);
    mat.size = 0.55 + e * 0.35;
  });

  return (
    <points ref={pointsRef} position={spec.position} geometry={geometry} visible={false}>
      <pointsMaterial
        color={spec.color}
        size={0.6}
        transparent
        opacity={0}
        depthWrite={false}
        blending={AdditiveBlending}
        toneMapped={false}
        sizeAttenuation
      />
    </points>
  );
}

export interface CelebrationProps {
  city: City;
  center: { x: number; z: number };
  extent: number;
}

/**
 * Watches the city's age and fires a volley of bursts over the rooftops when
 * it changes. Initial mount is silent (loading a mid-age city is not a party).
 */
export function Celebration({ city, center, extent }: CelebrationProps) {
  const age = currentAge(city);
  const prevAge = useRef(age);
  const [volley, setVolley] = useState<{ specs: BurstSpec[]; bornAt: number } | null>(null);
  const clockNow = useRef(0);
  useFrame((state) => {
    clockNow.current = state.clock.elapsedTime;
  });

  useEffect(() => {
    if (prevAge.current === age) return;
    prevAge.current = age;
    const spread = Math.min(extent * 0.55, 46);
    const specs: BurstSpec[] = Array.from({ length: VOLLEY_BURSTS }, (_, i) => {
      const key = `${age}-${i}`;
      return {
        key,
        position: [
          center.x + (hashFloat(key, 11) - 0.5) * 2 * spread,
          16 + hashFloat(key, 12) * 14,
          center.z + (hashFloat(key, 13) - 0.5) * 2 * spread,
        ],
        color: FIREWORK_COLORS[Math.floor(hashFloat(key, 14) * FIREWORK_COLORS.length)],
        delay: i * VOLLEY_STAGGER,
      };
    });
    setVolley({ specs, bornAt: clockNow.current });
    const total = (VOLLEY_BURSTS - 1) * VOLLEY_STAGGER + BURST_LIFETIME + 0.5;
    const timer = setTimeout(() => setVolley(null), total * 1000);
    return () => clearTimeout(timer);
  }, [age, center.x, center.z, extent]);

  if (!volley) return null;
  return (
    <>
      {volley.specs.map((spec) => (
        <FireworkBurst key={spec.key} spec={spec} bornAt={volley.bornAt} />
      ))}
    </>
  );
}
