import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Color, Object3D, type InstancedMesh } from 'three';
import type { City } from '../types';
import { buildSpecs, type CartSpec, type CitizenSpec, type Vec2 } from './citizens/specs';
import {
  makeInitialState,
  stepAgent,
  type AgentPose,
  type AgentState,
  type CrowdMods,
} from './citizens/runtime';
import { makeCartState, stepCart, type CartPose, type CartState } from './citizens/carts';
import {
  BODY_HEIGHT,
  type Hat,
  type PropKind,
  moodSpeedMultiplier,
} from './citizens/constants';
import { roadSurfaceHeightAt, terrainHeightAt } from '../generation/terrain';
import { EmoteSprites, type EmotePool } from './citizens/Emotes';

// ---------------------------------------------------------------------------
// Citizens — a charming crowd of little lives.
//
// The crowd is fully instanced and capped (~270-300 townsfolk + carts + props
// + emotes), so even a heavily developed late-game city stays at 60fps. Every
// agent runs a small activity state machine (errands, market, work hauling,
// fishing, lounging, socializing, night-watch patrol, kids, plus mood-driven
// dance circles and protest clusters) and occasionally pops a billboard emote.
//
// Structure (who/where/what/wardrobe) is deterministic via hashFloat so it's
// stable across re-renders and the frequent whole-city replacement on day
// ticks; moment-to-moment wandering uses Math.random. Runtime state survives in
// refs keyed by stable spec ids. Instanced meshes only remount when a count
// changes. Nothing here mutates the simulation — pure rendering.
//
// This component is the orchestrator; the heavy lifting lives in
// src/rendering/citizens/* (spec builder, agent/cart runtime, emote pool).
// ---------------------------------------------------------------------------

/** Hat geometries we draw as separate instanced meshes (uniform per mesh). */
const HAT_KINDS: Hat[] = ['wizard', 'scholar', 'watch', 'sunhat'];
/** Prop kinds drawn as separate instanced meshes; only carried ones render. */
const PROP_KINDS: PropKind[] = ['crate', 'sack', 'rod', 'staff'];
/** Cart wheel positions in cart-local space (front/back, left/right). */
const WHEEL_OFFSETS: ReadonlyArray<readonly [number, number]> = [
  [0.42, 0.6],
  [-0.42, 0.6],
  [0.42, -0.6],
  [-0.42, -0.6],
];

interface BufferLayout {
  citizens: CitizenSpec[];
  carts: CartSpec[];
  /** spec index lists grouped by hat kind (for per-kind instanced meshes). */
  hatIndices: Record<Hat, number[]>;
  /** spec index lists grouped by prop kind. */
  propIndices: Record<PropKind, number[]>;
  /** Resolved group membership: groupKey -> member spec indices. */
  groups: Map<string, number[]>;
  /** A signature that changes only when instance counts change (for remount). */
  countKey: string;
}

function emptyHatIndices(): Record<Hat, number[]> {
  return { none: [], wizard: [], scholar: [], watch: [], sunhat: [] };
}
function emptyPropIndices(): Record<PropKind, number[]> {
  return { none: [], crate: [], sack: [], rod: [], staff: [] };
}

function layoutBuffers(city: City): BufferLayout {
  const { citizens, carts } = buildSpecs(city);
  const hatIndices = emptyHatIndices();
  const propIndices = emptyPropIndices();
  const groups = new Map<string, number[]>();

  citizens.forEach((spec, i) => {
    if (spec.hat !== 'none') hatIndices[spec.hat].push(i);
    if (spec.prop !== 'none') propIndices[spec.prop].push(i);
    if (spec.group) {
      const arr = groups.get(spec.group);
      if (arr) arr.push(i);
      else groups.set(spec.group, [i]);
    }
  });

  const countKey = [
    citizens.length,
    carts.length,
    ...HAT_KINDS.map((h) => hatIndices[h].length),
    ...PROP_KINDS.map((p) => propIndices[p].length),
  ].join('-');

  return { citizens, carts, hatIndices, propIndices, groups, countKey };
}

export function Citizens({ city }: { city: City }) {
  const bodyRef = useRef<InstancedMesh>(null);
  const headRef = useRef<InstancedMesh>(null);
  const hatRefs = useRef<Record<Hat, InstancedMesh | null>>({
    none: null,
    wizard: null,
    scholar: null,
    watch: null,
    sunhat: null,
  });
  const propRefs = useRef<Record<PropKind, InstancedMesh | null>>({
    none: null,
    crate: null,
    sack: null,
    rod: null,
    staff: null,
  });
  const cartBodyRef = useRef<InstancedMesh>(null);
  const cartWheelRef = useRef<InstancedMesh>(null);
  const cartAnimalRef = useRef<InstancedMesh>(null);
  const emotePoolRef = useRef<EmotePool | null>(null);

  const agentsRef = useRef(new Map<string, AgentState>());
  const cartsRef = useRef(new Map<string, CartState>());
  const dummy = useMemo(() => new Object3D(), []);

  // Day ticks hand us a fresh city; rebuilding this layout is cheap. Runtime
  // walking state survives in agentsRef/cartsRef, keyed by stable ids.
  const layout = useMemo(() => layoutBuffers(city), [city]);
  const { citizens, carts, hatIndices, propIndices, groups, countKey } = layout;

  // Scratch buffers reused every frame — zero per-frame allocation in the loop.
  const pose = useMemo<AgentPose>(
    () => ({ x: 0, y: 0, z: 0, heading: 0, bob: 0, waddle: 0, sit: 0, spin: 0, moving: false, emote: -1 }),
    [],
  );
  const cartPose = useMemo<CartPose>(() => ({ x: 0, z: 0, heading: 0, wheel: 0, moving: false }), []);
  // Per-citizen resolved world position, written each frame so group centers
  // and prop/hat placement can read fresh positions without recomputing.
  const posBuf = useRef<{ x: number; z: number; y: number; heading: number; bob: number; sit: number; spin: number }[]>([]);
  const groupCenters = useMemo(() => new Map<string, Vec2>(), []);

  // Resize the per-citizen position buffer when the crowd size changes, and
  // prune runtime state for ids that no longer exist (a new city/seed produces
  // fresh district ids — without this the maps would grow unbounded over a long
  // session of restarts). Surviving ids keep their walking state.
  useEffect(() => {
    posBuf.current = citizens.map(() => ({ x: 0, z: 0, y: 0, heading: 0, bob: 0, sit: 0, spin: 0 }));

    const liveAgents = new Set(citizens.map((s) => s.id));
    for (const id of agentsRef.current.keys()) {
      if (!liveAgents.has(id)) agentsRef.current.delete(id);
    }
    const liveCarts = new Set(carts.map((s) => s.id));
    for (const id of cartsRef.current.keys()) {
      if (!liveCarts.has(id)) cartsRef.current.delete(id);
    }
  }, [citizens, carts]);

  // Per-citizen colors (body coat + skin), assigned once per mesh incarnation.
  useEffect(() => {
    const body = bodyRef.current;
    const head = headRef.current;
    if (!body || !head) return;
    const color = new Color();
    citizens.forEach((spec, i) => {
      color.set(spec.bodyColor);
      body.setColorAt(i, color);
      color.set(spec.skinColor);
      head.setColorAt(i, color);
    });
    if (body.instanceColor) body.instanceColor.needsUpdate = true;
    if (head.instanceColor) head.instanceColor.needsUpdate = true;
  }, [citizens, countKey]);

  // Cart body colors.
  useEffect(() => {
    const cb = cartBodyRef.current;
    if (!cb) return;
    const color = new Color();
    carts.forEach((spec, i) => {
      color.set(spec.bodyColor);
      cb.setColorAt(i, color);
    });
    if (cb.instanceColor) cb.instanceColor.needsUpdate = true;
  }, [carts, countKey]);

  useFrame((state, delta) => {
    const body = bodyRef.current;
    const head = headRef.current;
    if (!body || !head) return;
    const now = state.clock.elapsedTime;
    const dt = Math.min(delta, 0.1); // tab-switch hiccups shouldn't teleport anyone

    const mods: CrowdMods = {
      speedMul: moodSpeedMultiplier(city.mood),
      pollution: city.stats.pollution,
      chaotic: city.mood === 'chaotic',
      festive: city.mood === 'festive',
    };

    const buf = posBuf.current;

    // ----- Pass 1: compute live group centers (social/dance/protest/patrol) --
    // Cheap: averages members' last-known positions. Vec2s are reused in place
    // (allocated once per group, never per frame). First frame averages the
    // spec anchors written below, settling within a frame.
    for (const [key, members] of groups) {
      let sx = 0;
      let sz = 0;
      let n = 0;
      for (const i of members) {
        const a = agentsRef.current.get(citizens[i].id);
        if (a) {
          sx += a.x;
          sz += a.z;
          n++;
        }
      }
      let center = groupCenters.get(key);
      if (!center) {
        center = { x: 0, z: 0 };
        groupCenters.set(key, center);
      }
      if (n > 0) {
        center.x = sx / n;
        center.z = sz / n;
      }
    }

    // ----- Pass 2: step every agent and write body + head matrices -----------
    for (let i = 0; i < citizens.length; i++) {
      const spec = citizens[i];
      let agent = agentsRef.current.get(spec.id);
      if (!agent) {
        agent = makeInitialState(spec);
        agentsRef.current.set(spec.id, agent);
      }

      const gc = spec.group ? groupCenters.get(spec.group) ?? null : null;
      stepAgent(spec, agent, now, dt, mods, pose, gc);
      // Stand on the land: the runtime is pure 2D, the terrain owns height.
      pose.y = terrainHeightAt(city.terrain, pose.x, pose.z);

      const baseY = pose.y + (BODY_HEIGHT / 2) * spec.scale - pose.sit;
      const y = baseY + pose.bob;

      dummy.position.set(pose.x, y, pose.z);
      dummy.rotation.set(0, pose.heading, pose.waddle);
      dummy.scale.set(spec.scale, spec.scale, spec.scale);
      dummy.updateMatrix();
      body.setMatrixAt(i, dummy.matrix);

      const headY = pose.y + (BODY_HEIGHT + 0.1) * spec.scale - pose.sit + pose.bob;
      dummy.position.set(pose.x, headY, pose.z);
      dummy.rotation.set(0, pose.heading, 0);
      dummy.scale.set(spec.scale, spec.scale, spec.scale);
      dummy.updateMatrix();
      head.setMatrixAt(i, dummy.matrix);

      // Cache resolved pose for hats / props / emotes.
      const slot = buf[i];
      if (slot) {
        slot.x = pose.x;
        slot.z = pose.z;
        slot.y = pose.y;
        slot.heading = pose.heading;
        slot.bob = pose.bob;
        slot.sit = pose.sit;
        slot.spin = pose.spin;
      }

      // Emote requests (rate-limited inside stepAgent).
      if (pose.emote >= 0 && emotePoolRef.current) {
        const topY = pose.y + (BODY_HEIGHT + 0.45) * spec.scale - pose.sit;
        emotePoolRef.current.spawn(pose.x, topY, pose.z, pose.emote, now);
      }
    }
    body.instanceMatrix.needsUpdate = true;
    head.instanceMatrix.needsUpdate = true;

    // ----- Pass 3: hats (per kind) -------------------------------------------
    for (const kind of HAT_KINDS) {
      const mesh = hatRefs.current[kind];
      const idxs = hatIndices[kind];
      if (!mesh) continue;
      for (let j = 0; j < idxs.length; j++) {
        const i = idxs[j];
        const spec = citizens[i];
        const slot = buf[i];
        if (!slot) continue;
        const headY = slot.y + (BODY_HEIGHT + 0.18) * spec.scale - slot.sit + slot.bob;
        placeHat(kind, dummy, slot.x, headY, slot.z, slot.heading, spec.scale);
        mesh.setMatrixAt(j, dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
    }

    // ----- Pass 4: props (per kind) ------------------------------------------
    for (const kind of PROP_KINDS) {
      const mesh = propRefs.current[kind];
      const idxs = propIndices[kind];
      if (!mesh) continue;
      for (let j = 0; j < idxs.length; j++) {
        const i = idxs[j];
        const spec = citizens[i];
        const slot = buf[i];
        if (!slot) continue;
        placeProp(kind, dummy, slot, spec.scale, now);
        mesh.setMatrixAt(j, dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
    }

    // ----- Pass 5: carts (body + 4 wheels + draft animal) --------------------
    const cb = cartBodyRef.current;
    const cw = cartWheelRef.current;
    const ca = cartAnimalRef.current;
    if (cb && cw && ca) {
      for (let i = 0; i < carts.length; i++) {
        const spec = carts[i];
        let cstate = cartsRef.current.get(spec.id);
        if (!cstate) {
          cstate = makeCartState(spec);
          cartsRef.current.set(spec.id, cstate);
        }
        stepCart(spec, cstate, now, dt, mods.speedMul, cartPose);

        const bx = cartPose.x;
        const bz = cartPose.z;
        const h = cartPose.heading;
        const cos = Math.cos(h);
        const sin = Math.sin(h);

        // Carts ride the road deck (terrain-following, bridge over the river).
        const deck = roadSurfaceHeightAt(city.terrain, bx, bz);
        // Body.
        dummy.position.set(bx, deck + 0.42, bz);
        dummy.rotation.set(0, h, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        cb.setMatrixAt(i, dummy.matrix);

        // 4 wheels: offsets in cart-local space, rotated into world.
        for (let w = 0; w < 4; w++) {
          const lx = WHEEL_OFFSETS[w][0];
          const lz = WHEEL_OFFSETS[w][1];
          const wx = bx + lx * cos + lz * sin;
          const wz = bz - lx * sin + lz * cos;
          dummy.position.set(wx, deck + 0.18, wz);
          // Lay the cylinder on its side (axle along cart-local X) and yaw to
          // the cart heading; roll the disc about its axle as it travels.
          dummy.rotation.set(cartPose.wheel, h, Math.PI / 2);
          dummy.scale.set(1, 1, 1);
          dummy.updateMatrix();
          cw.setMatrixAt(i * 4 + w, dummy.matrix);
        }

        // Draft-animal blob ~1.3 units ahead of the cart along its heading.
        const ax = bx + Math.sin(h) * 1.3;
        const az = bz + Math.cos(h) * 1.3;
        const plod = Math.abs(Math.sin(now * 6 + i)) * (cartPose.moving ? 0.05 : 0);
        const deckA = roadSurfaceHeightAt(city.terrain, ax, az);
        dummy.position.set(ax, deckA + 0.32 + plod, az);
        // Capsule axis is vertical by default; lay it horizontal along travel.
        dummy.rotation.set(Math.PI / 2, h, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        ca.setMatrixAt(i, dummy.matrix);
      }
      cb.instanceMatrix.needsUpdate = true;
      cw.instanceMatrix.needsUpdate = true;
      ca.instanceMatrix.needsUpdate = true;
    }

    // ----- Pass 6: emotes (billboarded, fading) ------------------------------
    emotePoolRef.current?.update(now, state.camera);
  });

  if (citizens.length === 0 && carts.length === 0) return null;

  return (
    // Remount only when an instance count changes so buffers resize correctly.
    <group key={countKey}>
      {/* Bodies + heads */}
      {citizens.length > 0 && (
        <>
          <instancedMesh
            ref={bodyRef}
            args={[undefined, undefined, citizens.length]}
            castShadow
            raycast={() => null}
            frustumCulled={false}
          >
            <coneGeometry args={[0.18, BODY_HEIGHT, 7]} />
            <meshStandardMaterial roughness={0.9} metalness={0} />
          </instancedMesh>
          <instancedMesh
            ref={headRef}
            args={[undefined, undefined, citizens.length]}
            raycast={() => null}
            frustumCulled={false}
          >
            <sphereGeometry args={[0.13, 10, 8]} />
            <meshStandardMaterial roughness={0.85} metalness={0} />
          </instancedMesh>
        </>
      )}

      {/* Hats — one instanced mesh per kind, sized to that subset. */}
      {HAT_KINDS.map((kind) =>
        hatIndices[kind].length > 0 ? (
          <HatMesh
            key={kind}
            kind={kind}
            count={hatIndices[kind].length}
            assign={(m) => {
              hatRefs.current[kind] = m;
            }}
          />
        ) : null,
      )}

      {/* Props — crate / sack / rod / staff, only while carried. */}
      {PROP_KINDS.map((kind) =>
        propIndices[kind].length > 0 ? (
          <PropMesh
            key={kind}
            kind={kind}
            count={propIndices[kind].length}
            assign={(m) => {
              propRefs.current[kind] = m;
            }}
          />
        ) : null,
      )}

      {/* Carts: body box, 4 wheels (count*4), draft animal blob. */}
      {carts.length > 0 && (
        <>
          <instancedMesh
            ref={cartBodyRef}
            args={[undefined, undefined, carts.length]}
            castShadow
            raycast={() => null}
            frustumCulled={false}
          >
            <boxGeometry args={[0.7, 0.5, 1.1]} />
            <meshStandardMaterial color="#ffffff" roughness={0.9} metalness={0} />
          </instancedMesh>
          <instancedMesh
            ref={cartWheelRef}
            args={[undefined, undefined, carts.length * 4]}
            raycast={() => null}
            frustumCulled={false}
          >
            <cylinderGeometry args={[0.18, 0.18, 0.08, 8]} />
            <meshStandardMaterial color="#5a4324" roughness={0.95} metalness={0} />
          </instancedMesh>
          <instancedMesh
            ref={cartAnimalRef}
            args={[undefined, undefined, carts.length]}
            castShadow
            raycast={() => null}
            frustumCulled={false}
          >
            <capsuleGeometry args={[0.22, 0.5, 4, 8]} />
            <meshStandardMaterial color="#6b5640" roughness={0.95} metalness={0} />
          </instancedMesh>
        </>
      )}

      {/* Floating emotes (shared CanvasTexture sprite-sheet, small pool). */}
      <EmoteSprites
        assign={(p) => {
          emotePoolRef.current = p;
        }}
      />
    </group>
  );
}

// ---------------------------------------------------------------------------
// Hat + prop placement (allocation-free; reuse the shared Object3D `dummy`).
// ---------------------------------------------------------------------------

function placeHat(
  kind: Hat,
  dummy: Object3D,
  x: number,
  y: number,
  z: number,
  heading: number,
  scale: number,
) {
  dummy.position.set(x, y, z);
  dummy.rotation.set(0, heading, 0);
  // Per-kind size baked into scale; geometry is unit-ish in HatMesh.
  switch (kind) {
    case 'wizard':
      dummy.scale.set(0.16 * scale, 0.4 * scale, 0.16 * scale);
      dummy.position.y = y + 0.12 * scale;
      break;
    case 'scholar':
      dummy.scale.set(0.34 * scale, 0.05 * scale, 0.34 * scale);
      break;
    case 'watch':
      dummy.scale.set(0.18 * scale, 0.22 * scale, 0.18 * scale);
      dummy.position.y = y + 0.05 * scale;
      break;
    case 'sunhat':
      dummy.scale.set(0.32 * scale, 0.08 * scale, 0.32 * scale);
      break;
    default:
      dummy.scale.set(0.001, 0.001, 0.001);
  }
  dummy.updateMatrix();
}

interface PoseSlot {
  x: number;
  z: number;
  y: number;
  heading: number;
  bob: number;
  sit: number;
  spin: number;
}

function placeProp(
  kind: PropKind,
  dummy: Object3D,
  slot: PoseSlot,
  scale: number,
  now: number,
) {
  const cos = Math.cos(slot.heading);
  const sin = Math.sin(slot.heading);
  // Hands roughly in front of the body.
  const fwd = 0.22 * scale;
  switch (kind) {
    case 'crate': {
      const hx = slot.x + Math.sin(slot.heading) * fwd;
      const hz = slot.z + Math.cos(slot.heading) * fwd;
      dummy.position.set(hx, slot.y + 0.34 * scale - slot.sit + slot.bob, hz);
      dummy.rotation.set(0, slot.heading, 0);
      dummy.scale.set(0.26 * scale, 0.26 * scale, 0.26 * scale);
      break;
    }
    case 'sack': {
      // Slung on the back (behind the heading).
      const hx = slot.x - Math.sin(slot.heading) * (0.14 * scale);
      const hz = slot.z - Math.cos(slot.heading) * (0.14 * scale);
      dummy.position.set(hx, slot.y + 0.42 * scale - slot.sit + slot.bob, hz);
      dummy.rotation.set(0.2, slot.heading, 0);
      dummy.scale.set(0.22 * scale, 0.3 * scale, 0.22 * scale);
      break;
    }
    case 'rod': {
      // Fishing rod angled out toward the water (forward + up), with a slow
      // hook-flick wobble.
      const flick = Math.sin(now * 0.6) * 0.15 + (Math.sin(now * 5) > 0.96 ? 0.4 : 0);
      const hx = slot.x + Math.sin(slot.heading) * (0.2 * scale);
      const hz = slot.z + Math.cos(slot.heading) * (0.2 * scale);
      dummy.position.set(hx, slot.y + 0.5 * scale - slot.sit, hz);
      dummy.rotation.set(0.7 + flick, slot.heading, 0);
      dummy.scale.set(0.03 * scale, 1.0 * scale, 0.03 * scale);
      break;
    }
    case 'staff': {
      // Held upright at the side.
      const hx = slot.x + cos * (0.18 * scale);
      const hz = slot.z - sin * (0.18 * scale);
      dummy.position.set(hx, slot.y + 0.55 * scale - slot.sit + slot.bob * 0.5, hz);
      dummy.rotation.set(0, slot.heading, 0.05);
      dummy.scale.set(0.04 * scale, 1.1 * scale, 0.04 * scale);
      break;
    }
    default:
      dummy.position.set(slot.x, -10, slot.z);
      dummy.scale.set(0.001, 0.001, 0.001);
  }
  dummy.updateMatrix();
}

// ---------------------------------------------------------------------------
// Small wrapper meshes so each hat / prop kind owns a uniform geometry.
// ---------------------------------------------------------------------------

function HatMesh({
  kind,
  count,
  assign,
}: {
  kind: Hat;
  count: number;
  assign: (m: InstancedMesh | null) => void;
}) {
  const color =
    kind === 'wizard'
      ? '#3a2f6a'
      : kind === 'scholar'
        ? '#2a2a30'
        : kind === 'watch'
          ? '#202636'
          : '#d8c27a'; // sunhat straw
  return (
    <instancedMesh
      ref={assign}
      args={[undefined, undefined, count]}
      raycast={() => null}
      frustumCulled={false}
    >
      {kind === 'wizard' ? (
        <coneGeometry args={[0.5, 1, 7]} />
      ) : kind === 'watch' ? (
        <cylinderGeometry args={[0.5, 0.55, 1, 8]} />
      ) : (
        // flat disc for scholar mortarboard + sunhat brim
        <cylinderGeometry args={[0.5, 0.5, 1, 12]} />
      )}
      <meshStandardMaterial color={color} roughness={0.9} metalness={0} />
    </instancedMesh>
  );
}

function PropMesh({
  kind,
  count,
  assign,
}: {
  kind: PropKind;
  count: number;
  assign: (m: InstancedMesh | null) => void;
}) {
  const color =
    kind === 'crate'
      ? '#9c7440'
      : kind === 'sack'
        ? '#b8a067'
        : kind === 'rod'
          ? '#6b4a2e'
          : '#7a5a3a'; // staff
  return (
    <instancedMesh
      ref={assign}
      args={[undefined, undefined, count]}
      raycast={() => null}
      frustumCulled={false}
    >
      {kind === 'crate' ? (
        <boxGeometry args={[1, 1, 1]} />
      ) : kind === 'sack' ? (
        <sphereGeometry args={[0.5, 8, 6]} />
      ) : (
        // thin rod / staff
        <cylinderGeometry args={[0.5, 0.5, 1, 6]} />
      )}
      <meshStandardMaterial color={color} roughness={0.95} metalness={0} />
    </instancedMesh>
  );
}
