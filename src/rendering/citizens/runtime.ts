// ---------------------------------------------------------------------------
// Per-agent runtime + the state-machine step.
//
// Runtime (moment-to-moment) state lives in refs keyed by stable spec ids so it
// survives the frequent whole-city replacement on day ticks. `stepAgent`
// advances one agent for `dt` seconds and reports back the world pose plus
// occasional emote requests. It performs ZERO allocations: scratch outputs are
// passed in and reused by the caller across the whole instance buffer.
//
// Wandering / pausing here may use Math.random (it's cosmetic and need not be
// deterministic); structural decisions already happened in the spec builder.
// ---------------------------------------------------------------------------

import { hashFloat } from '../hash';
import {
  type Activity,
  EMOTE_BANG,
  EMOTE_HEART,
  EMOTE_NOTE,
  EMOTE_QUESTION,
  EMOTE_ZZZ,
} from './constants';
import type { CitizenSpec, Vec2 } from './specs';

export interface AgentState {
  x: number;
  z: number;
  /** Current target (the point we're walking toward). */
  tx: number;
  tz: number;
  /** Index into spec.points we're heading to / cycling through. */
  pointIndex: number;
  heading: number;
  /** Walking until... vs idling until... clocks (sim seconds). */
  idleUntil: number;
  /** Next time this agent is allowed to emit an emote. */
  nextEmote: number;
  /** Per-agent phase so bobs/jitter desync. */
  phase: number;
  /** One-time cough timer for polluted mood (sim seconds), -1 = not coughing. */
  coughUntil: number;
}

/** Output pose for one agent, filled by stepAgent (reused, no alloc). */
export interface AgentPose {
  x: number;
  y: number;
  z: number;
  heading: number;
  /** Extra vertical bob already folded into y for the body; head adds headLift. */
  bob: number;
  /** Side waddle (rotation z) while walking. */
  waddle: number;
  /** Lowers the whole agent for sit-ish lounging / fishing. */
  sit: number;
  /** Spin applied around Y for dancers (added to heading at draw time). */
  spin: number;
  /** True while actively moving (drives walk cycle in the caller). */
  moving: boolean;
  /** If >= 0, an emote glyph index to spawn this frame above the head. */
  emote: number;
}

/** Crowd-wide modifiers derived once per frame from city mood/stats. */
export interface CrowdMods {
  speedMul: number;
  /** Pollution 0..100 — drives cough probability. */
  pollution: number;
  /** True when chaotic mood (protesters agitate harder). */
  chaotic: boolean;
  /** True when festive (dancers + more chatter). */
  festive: boolean;
}

export function makeInitialState(spec: CitizenSpec): AgentState {
  const p0 = spec.points[0];
  const phase = hashFloat(spec.id, 5) * Math.PI * 2;
  return {
    x: p0.x,
    z: p0.z,
    tx: p0.x,
    tz: p0.z,
    pointIndex: 0,
    heading: hashFloat(spec.id, 6) * Math.PI * 2,
    idleUntil: 0,
    nextEmote: -1, // scheduled relative to `now` on the first step
    phase,
    coughUntil: -1,
  };
}

/** Ease heading toward target (shortest way around), bounded by dt. */
function turnTo(agent: AgentState, dx: number, dz: number, dt: number) {
  const target = Math.atan2(dx, dz);
  let diff = target - agent.heading;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  agent.heading += diff * Math.min(1, dt * 7);
}

/** Walk toward (tx,tz); returns true on arrival (within `arrive`). */
function walkToward(
  agent: AgentState,
  speed: number,
  dt: number,
  arrive: number,
): boolean {
  const dx = agent.tx - agent.x;
  const dz = agent.tz - agent.z;
  const dist = Math.hypot(dx, dz);
  if (dist < arrive) return true;
  turnTo(agent, dx, dz, dt);
  const move = Math.min(dist, speed * dt);
  agent.x += (dx / dist) * move;
  agent.z += (dz / dist) * move;
  return false;
}

/** Pick the next point in the agent's list, advancing the cursor. */
function advancePoint(agent: AgentState, points: Vec2[]) {
  agent.pointIndex = (agent.pointIndex + 1) % points.length;
  const p = points[agent.pointIndex];
  agent.tx = p.x;
  agent.tz = p.z;
}

const TWO_PI = Math.PI * 2;

/**
 * Advance one agent and write its pose into `out`. `now` is sim-clock seconds,
 * `dt` already clamped by the caller. `groupCenter`, when provided, is the live
 * averaged position of the agent's social/dance/protest/patrol group (so they
 * converge); pass null to skip.
 */
export function stepAgent(
  spec: CitizenSpec,
  agent: AgentState,
  now: number,
  dt: number,
  mods: CrowdMods,
  out: AgentPose,
  groupCenter: Vec2 | null,
): void {
  const speed = spec.speed * mods.speedMul;
  const phase = agent.phase;
  let moving = false;
  let sit = 0;
  let spin = 0;
  let emote = -1;
  const act: Activity = spec.activity;

  switch (act) {
    case 'errands':
    case 'market': {
      if (now >= agent.idleUntil) {
        const hops = act === 'market' ? 0.5 : 0.85; // markets pause less, hop more
        if (walkToward(agent, speed, dt, 0.3)) {
          // Brief pause at the "door"/stall.
          agent.idleUntil = now + (act === 'market' ? 0.5 : 0.9) + Math.random() * (hops + 1.2);
          advancePoint(agent, spec.points);
        } else {
          moving = true;
        }
      }
      break;
    }
    case 'work': {
      // Loop between the two haul endpoints, brief pause to load/unload.
      if (now >= agent.idleUntil) {
        if (walkToward(agent, speed, dt, 0.3)) {
          agent.idleUntil = now + 0.6 + Math.random() * 0.8;
          advancePoint(agent, spec.points);
        } else {
          moving = true;
        }
      }
      break;
    }
    case 'fishing': {
      // Stand at the edge point, face outward (away from center).
      const p = spec.points[0];
      agent.x += (p.x - agent.x) * Math.min(1, dt * 3);
      agent.z += (p.z - agent.z) * Math.min(1, dt * 3);
      const outAng = Math.atan2(p.x - spec.center.x, p.z - spec.center.z);
      agent.heading += angleDelta(agent.heading, outAng) * Math.min(1, dt * 4);
      sit = 0.05;
      break;
    }
    case 'lounge': {
      const p = spec.points[0];
      agent.x += (p.x - agent.x) * Math.min(1, dt * 3);
      agent.z += (p.z - agent.z) * Math.min(1, dt * 3);
      sit = 0.22; // lower body, no walk bob
      break;
    }
    case 'social': {
      // Converge on the group center, then face it and talk-bob.
      const tgt = groupCenter ?? spec.points[0];
      const dist = Math.hypot(tgt.x - agent.x, tgt.z - agent.z);
      if (dist > 1.3) {
        agent.tx = tgt.x;
        agent.tz = tgt.z;
        walkToward(agent, speed, dt, 0.4);
        moving = true;
      } else {
        // Face the center and bob gently as if chatting.
        const faceAng = Math.atan2(tgt.x - agent.x, tgt.z - agent.z);
        agent.heading += angleDelta(agent.heading, faceAng) * Math.min(1, dt * 4);
      }
      break;
    }
    case 'patrol': {
      // Slow circuit through the ring waypoints.
      if (walkToward(agent, speed, dt, 0.5)) {
        advancePoint(agent, spec.points);
      } else {
        moving = true;
      }
      break;
    }
    case 'kid': {
      // Run fast loops, retarget often, tiny pauses.
      if (now >= agent.idleUntil) {
        if (walkToward(agent, speed, dt, 0.4)) {
          agent.idleUntil = now + Math.random() * 0.4;
          advancePoint(agent, spec.points);
        } else {
          moving = true;
        }
      }
      break;
    }
    case 'dance': {
      // Orbit the landmark + bounce + spin.
      const c = spec.points[0];
      const orbitR = 2.2 + (phase % 1) * 1.2;
      const ang = now * 0.9 + phase;
      agent.x = c.x + Math.cos(ang) * orbitR;
      agent.z = c.z + Math.sin(ang) * orbitR;
      agent.heading = -ang + Math.PI / 2;
      spin = now * 4 + phase;
      moving = true; // drives a bouncy walk cycle
      break;
    }
    case 'protest': {
      // Tight cluster around the rally point, agitated jitter + fist pump.
      const c = groupCenter ?? spec.points[0];
      const jitter = mods.chaotic ? 0.5 : 0.3;
      const tx = c.x + Math.sin(now * 2.3 + phase) * jitter;
      const tz = c.z + Math.cos(now * 2.1 + phase * 1.3) * jitter;
      agent.x += (tx - agent.x) * Math.min(1, dt * 5);
      agent.z += (tz - agent.z) * Math.min(1, dt * 5);
      // Face the rally center.
      const faceAng = Math.atan2(c.x - agent.x, c.z - agent.z);
      agent.heading += angleDelta(agent.heading, faceAng) * Math.min(1, dt * 6);
      break;
    }
    default:
      break;
  }

  // ----- Cough stutter under pollution (any walking activity) ---------------
  if (mods.pollution > 55 && agent.coughUntil < 0 && now >= agent.idleUntil) {
    if (Math.random() < dt * 0.04 * ((mods.pollution - 55) / 45)) {
      agent.coughUntil = now + 0.5; // just a stutter, no emote
    }
  }
  const coughing = agent.coughUntil > now;
  if (agent.coughUntil >= 0 && !coughing) agent.coughUntil = -1;

  // ----- Walk cycle + activity bobs ----------------------------------------
  let bob: number;
  let waddle: number;
  if (act === 'dance') {
    bob = Math.abs(Math.sin(now * 7 + phase)) * 0.22; // big bounce
    waddle = Math.sin(now * 7 + phase) * 0.12;
  } else if (act === 'protest') {
    // Synchronized-ish fist pump (group sync via shared low-freq term).
    const pump = Math.abs(Math.sin(now * 3.4 + phase * 0.2));
    bob = pump * 0.12;
    waddle = Math.sin(now * 9 + phase) * 0.04; // agitated micro-jitter
  } else if (coughing) {
    // Stop-and-cough stutter: quick double hunch.
    bob = -Math.abs(Math.sin((now - agent.coughUntil + 0.5) * 30)) * 0.07;
    waddle = 0;
  } else if (act === 'social') {
    bob = Math.sin(now * 4.5 + phase) * 0.03; // talk-bob
    waddle = 0;
  } else if (moving) {
    const f = act === 'kid' ? 13 : 9;
    bob = Math.abs(Math.sin(now * f + phase)) * (act === 'kid' ? 0.09 : 0.06);
    waddle = Math.sin(now * f + phase) * (act === 'kid' ? 0.12 : 0.08);
  } else {
    bob = Math.sin(now * 1.8 + phase) * 0.012; // idle breathing
    waddle = 0;
  }

  // ----- Emote scheduling ---------------------------------------------------
  if (agent.nextEmote < 0) {
    // First step for this agent: stagger the initial cooldown off `now` so a
    // freshly spawned crowd doesn't all emote on the same frame.
    agent.nextEmote = now + 2 + hashFloat(spec.id, 7) * 14;
  } else if (now >= agent.nextEmote && emote < 0) {
    emote = pickEmote(act, mods);
    // Rate-limit: long, jittered cooldown so it stays charming not noisy.
    agent.nextEmote = now + 9 + Math.random() * 16;
  }

  out.x = agent.x;
  // Ground height is the caller's job (it queries the terrain at x/z); the
  // runtime stays pure 2D.
  out.y = 0;
  out.z = agent.z;
  out.heading = (agent.heading + spin) % TWO_PI;
  out.bob = bob;
  out.waddle = waddle;
  out.sit = sit;
  out.spin = spin;
  out.moving = moving;
  out.emote = emote;
}

/** Choose an emote glyph appropriate to the activity / mood. */
function pickEmote(act: Activity, mods: CrowdMods): number {
  switch (act) {
    case 'dance':
      return EMOTE_NOTE;
    case 'protest':
      return EMOTE_BANG;
    case 'lounge':
    case 'fishing':
      return EMOTE_ZZZ;
    case 'social':
      return EMOTE_HEART;
    case 'errands':
      // Occasionally "lost".
      return Math.random() < 0.25 ? EMOTE_QUESTION : EMOTE_HEART;
    default:
      if (mods.festive && Math.random() < 0.5) return EMOTE_NOTE;
      return Math.random() < 0.4 ? EMOTE_HEART : -1;
  }
}

/** Signed shortest angular delta from `from` to `to`. */
function angleDelta(from: number, to: number): number {
  let d = to - from;
  while (d > Math.PI) d -= TWO_PI;
  while (d < -Math.PI) d += TWO_PI;
  return d;
}
