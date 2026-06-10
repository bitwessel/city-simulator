import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Color, Object3D, type InstancedMesh } from 'three';
import type { City, District } from '../types';
import { hashFloat } from './hash';

// ---------------------------------------------------------------------------
// Citizens — little low-poly townsfolk living their day.
//
// Two instanced meshes (cone bodies + sphere heads) animate every frame:
//   * wanderers stroll between spots on their district's platform, pausing to
//     chat or admire the fountain;
//   * travelers walk the exposed stretch of road between two districts and
//     back, following the same gentle curve the road ribbon uses.
//
// Counts scale with district population and development, so a growing city
// visibly fills with people. All of this is pure rendering state — nothing
// here touches the simulation model.
// ---------------------------------------------------------------------------

const PLATFORM_TOP = 1.0; // matches DistrictPlatform's PLATFORM_HEIGHT
const ROAD_TOP = 0.08;
const MAX_CITIZENS = 90;
const BODY_HEIGHT = 0.5;

/** Simple wardrobe; each citizen picks a coat deterministically by id. */
const CLOTHES = [
  '#c96f4a',
  '#7fa75c',
  '#5c84a7',
  '#b08bc9',
  '#c9a24b',
  '#a75c5c',
  '#5ca78f',
  '#8a795c',
  '#c9c0a3',
  '#6b5ca7',
];
const SKIN = ['#e8c39e', '#d9a878', '#b07b4f', '#8a5a33', '#c9d9a3'];

interface WanderSpec {
  kind: 'wander';
  id: string;
  center: { x: number; z: number };
  radius: number;
}

interface TravelSpec {
  kind: 'travel';
  id: string;
  /** Bezier through start / mid / end, mirroring the road ribbon's bow. */
  start: { x: number; z: number };
  control: { x: number; z: number };
  end: { x: number; z: number };
  /** Walkable param range (the stretch not hidden under either platform). */
  tMin: number;
  tMax: number;
}

type CitizenSpec = WanderSpec | TravelSpec;

/** Per-citizen runtime state, kept across re-renders and growth rebuilds. */
interface AgentState {
  x: number;
  z: number;
  // Wanderers walk toward (tx, tz); travelers track a road param t/dir.
  tx: number;
  tz: number;
  t: number;
  dir: 1 | -1;
  speed: number;
  heading: number;
  idleUntil: number;
}

function wandererCount(d: District): number {
  if (d.development < 6) return 0;
  const byPopulation = Math.floor(d.population / 220);
  const scaled = Math.round(byPopulation * (0.25 + (0.75 * d.development) / 100));
  return Math.max(1, Math.min(8, scaled));
}

function buildSpecs(city: City): CitizenSpec[] {
  const specs: CitizenSpec[] = [];

  for (const district of city.districts) {
    const n = wandererCount(district);
    for (let i = 0; i < n; i++) {
      specs.push({
        kind: 'wander',
        id: `cit-${district.id}-${i}`,
        center: district.position,
        radius: Math.max(2, district.radius - 2.5),
      });
    }
  }

  const byId = new Map(city.districts.map((d) => [d.id, d]));
  for (const road of city.roads) {
    const a = byId.get(road.from);
    const b = byId.get(road.to);
    if (!a || !b) continue;

    const dx = b.position.x - a.position.x;
    const dz = b.position.z - a.position.z;
    const len = Math.hypot(dx, dz);
    // Walk only the stretch of road that pokes out from under the platforms.
    const tMin = (a.radius + 0.8) / len;
    const tMax = 1 - (b.radius + 0.8) / len;
    if (tMax - tMin < 0.1) continue;

    // Same deterministic bow as Roads.tsx so walkers stay on the ribbon.
    const bow = ((a.position.x + b.position.z) % 7) - 3.5;
    const offset = bow * 0.06 * Math.min(len, 40) * 0.15;
    const mid = {
      x: (a.position.x + b.position.x) / 2 + (-dz / len) * offset,
      z: (a.position.z + b.position.z) / 2 + (dx / len) * offset,
    };
    // Control point of the quadratic bezier that passes through `mid` at t=0.5.
    const control = {
      x: 2 * mid.x - (a.position.x + b.position.x) / 2,
      z: 2 * mid.z - (a.position.z + b.position.z) / 2,
    };

    const travelers = (a.development + b.development) / 2 > 25 ? 2 : 1;
    for (let i = 0; i < travelers; i++) {
      specs.push({
        kind: 'travel',
        id: `walk-${road.from}-${road.to}-${i}`,
        start: a.position,
        control,
        end: b.position,
        tMin,
        tMax,
      });
    }
  }

  return specs.slice(0, MAX_CITIZENS);
}

function bezier(spec: TravelSpec, t: number): { x: number; z: number } {
  const u = 1 - t;
  return {
    x: u * u * spec.start.x + 2 * u * t * spec.control.x + t * t * spec.end.x,
    z: u * u * spec.start.z + 2 * u * t * spec.control.z + t * t * spec.end.z,
  };
}

function initialState(spec: CitizenSpec): AgentState {
  const r1 = hashFloat(spec.id, 11);
  const r2 = hashFloat(spec.id, 12);
  if (spec.kind === 'wander') {
    const a = r1 * Math.PI * 2;
    const r = Math.sqrt(r2) * spec.radius;
    return {
      x: spec.center.x + Math.cos(a) * r,
      z: spec.center.z + Math.sin(a) * r,
      tx: spec.center.x,
      tz: spec.center.z,
      t: 0,
      dir: 1,
      speed: 0.9 + r2 * 0.7,
      heading: a,
      idleUntil: 0,
    };
  }
  const t = spec.tMin + r1 * (spec.tMax - spec.tMin);
  const pos = bezier(spec, t);
  return {
    x: pos.x,
    z: pos.z,
    tx: pos.x,
    tz: pos.z,
    t,
    dir: r2 > 0.5 ? 1 : -1,
    speed: 1.1 + r1 * 0.8,
    heading: 0,
    idleUntil: 0,
  };
}

export function Citizens({ city }: { city: City }) {
  const bodyRef = useRef<InstancedMesh>(null);
  const headRef = useRef<InstancedMesh>(null);
  const agentsRef = useRef(new Map<string, AgentState>());
  const dummy = useMemo(() => new Object3D(), []);

  // Day ticks hand us a fresh city object; rebuilding this small spec list is
  // cheap. Runtime walking state survives in agentsRef, keyed by citizen id.
  const specs = useMemo(() => buildSpecs(city), [city]);
  const count = specs.length;

  // Per-citizen colors, assigned once per instanced-mesh incarnation.
  useEffect(() => {
    const body = bodyRef.current;
    const head = headRef.current;
    if (!body || !head) return;
    const color = new Color();
    specs.forEach((spec, i) => {
      color.set(CLOTHES[Math.floor(hashFloat(spec.id, 3) * CLOTHES.length)]);
      body.setColorAt(i, color);
      color.set(SKIN[Math.floor(hashFloat(spec.id, 4) * SKIN.length)]);
      head.setColorAt(i, color);
    });
    if (body.instanceColor) body.instanceColor.needsUpdate = true;
    if (head.instanceColor) head.instanceColor.needsUpdate = true;
  }, [specs, count]);

  useFrame((state, delta) => {
    const body = bodyRef.current;
    const head = headRef.current;
    if (!body || !head) return;
    const now = state.clock.elapsedTime;
    const step = Math.min(delta, 0.1); // tab-switch hiccups shouldn't teleport anyone

    for (let i = 0; i < specs.length; i++) {
      const spec = specs[i];
      let agent = agentsRef.current.get(spec.id);
      if (!agent) {
        agent = initialState(spec);
        agentsRef.current.set(spec.id, agent);
      }

      let moving = false;
      let y: number;

      if (spec.kind === 'wander') {
        y = PLATFORM_TOP;
        const dx = agent.tx - agent.x;
        const dz = agent.tz - agent.z;
        const dist = Math.hypot(dx, dz);
        if (now < agent.idleUntil) {
          // Standing around: chatting, judging the architecture.
        } else if (dist < 0.25) {
          // Arrived — usually pause, then pick a new spot on the platform.
          agent.idleUntil = now + 0.8 + Math.random() * 2.8;
          const a = Math.random() * Math.PI * 2;
          const r = Math.sqrt(Math.random()) * spec.radius;
          agent.tx = spec.center.x + Math.cos(a) * r;
          agent.tz = spec.center.z + Math.sin(a) * r;
        } else {
          moving = true;
          const target = Math.atan2(dx, dz);
          // Ease heading toward the target direction (shortest way around).
          let diff = target - agent.heading;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          agent.heading += diff * Math.min(1, step * 6);
          const move = Math.min(dist, agent.speed * step);
          agent.x += (dx / dist) * move;
          agent.z += (dz / dist) * move;
        }
      } else {
        y = ROAD_TOP;
        if (now >= agent.idleUntil) {
          moving = true;
          const roadLen = Math.hypot(spec.end.x - spec.start.x, spec.end.z - spec.start.z);
          agent.t += (agent.dir * agent.speed * step) / roadLen;
          if (agent.t >= spec.tMax) {
            agent.t = spec.tMax;
            agent.dir = -1;
            agent.idleUntil = now + 1 + Math.random() * 3;
          } else if (agent.t <= spec.tMin) {
            agent.t = spec.tMin;
            agent.dir = 1;
            agent.idleUntil = now + 1 + Math.random() * 3;
          }
        }
        const prev = { x: agent.x, z: agent.z };
        const pos = bezier(spec, agent.t);
        agent.x = pos.x;
        agent.z = pos.z;
        if (moving) {
          const hx = agent.x - prev.x;
          const hz = agent.z - prev.z;
          if (Math.hypot(hx, hz) > 1e-5) agent.heading = Math.atan2(hx, hz);
        }
      }

      // Walk cycle: a quick bob and a tiny waddle while moving; a slow
      // breathing bob while idling.
      const phase = hashFloat(spec.id, 5) * Math.PI * 2;
      const bob = moving
        ? Math.abs(Math.sin(now * 9 + phase)) * 0.06
        : Math.sin(now * 1.8 + phase) * 0.012;
      const waddle = moving ? Math.sin(now * 9 + phase) * 0.08 : 0;

      dummy.position.set(agent.x, y + BODY_HEIGHT / 2 + bob, agent.z);
      dummy.rotation.set(0, agent.heading, waddle);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      body.setMatrixAt(i, dummy.matrix);

      dummy.position.set(agent.x, y + BODY_HEIGHT + 0.1 + bob, agent.z);
      dummy.updateMatrix();
      head.setMatrixAt(i, dummy.matrix);
    }

    body.instanceMatrix.needsUpdate = true;
    head.instanceMatrix.needsUpdate = true;
  });

  if (count === 0) return null;

  return (
    // Remount when the population of walkers changes so instance buffers resize.
    <group key={count}>
      <instancedMesh
        ref={bodyRef}
        args={[undefined, undefined, count]}
        castShadow
        raycast={() => null}
        frustumCulled={false}
      >
        <coneGeometry args={[0.18, BODY_HEIGHT, 7]} />
        <meshStandardMaterial roughness={0.9} metalness={0} />
      </instancedMesh>
      <instancedMesh
        ref={headRef}
        args={[undefined, undefined, count]}
        raycast={() => null}
        frustumCulled={false}
      >
        <sphereGeometry args={[0.13, 10, 8]} />
        <meshStandardMaterial roughness={0.85} metalness={0} />
      </instancedMesh>
    </group>
  );
}
