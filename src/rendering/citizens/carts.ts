// ---------------------------------------------------------------------------
// Cart runtime.
//
// Carts trundle back and forth along a road ribbon. State (param t + direction)
// lives in refs keyed by cart id so it survives day ticks. Stepping is
// allocation-free; the caller composes the world matrices from the returned
// pose for the cart body, its wheels and the draft-animal blob.
// ---------------------------------------------------------------------------

import { hashFloat } from '../hash';
import { bezierAt } from './bezier';
import type { CartSpec } from './specs';

export interface CartState {
  t: number;
  dir: 1 | -1;
  heading: number;
  /** Pause clock when reaching an endpoint. */
  idleUntil: number;
  /** Rolling wheel angle. */
  wheel: number;
}

export interface CartPose {
  x: number;
  z: number;
  heading: number;
  /** Wheel spin angle (radians). */
  wheel: number;
  moving: boolean;
}

export function makeCartState(spec: CartSpec): CartState {
  const r = hashFloat(spec.id, 1);
  return {
    t: spec.tMin + r * (spec.tMax - spec.tMin),
    dir: r > 0.5 ? 1 : -1,
    heading: 0,
    idleUntil: 0,
    wheel: 0,
  };
}

const scratch = { x: 0, z: 0 };
const prev = { x: 0, z: 0 };

export function stepCart(
  spec: CartSpec,
  state: CartState,
  now: number,
  dt: number,
  speedMul: number,
  out: CartPose,
): void {
  bezierAt(spec.curve, state.t, prev);

  let moving = false;
  if (now >= state.idleUntil) {
    moving = true;
    const len =
      Math.hypot(
        spec.curve.end.x - spec.curve.start.x,
        spec.curve.end.z - spec.curve.start.z,
      ) || 1;
    state.t += (state.dir * spec.speed * speedMul * dt) / len;
    if (state.t >= spec.tMax) {
      state.t = spec.tMax;
      state.dir = -1;
      state.idleUntil = now + 1.5 + Math.random() * 2.5;
    } else if (state.t <= spec.tMin) {
      state.t = spec.tMin;
      state.dir = 1;
      state.idleUntil = now + 1.5 + Math.random() * 2.5;
    }
  }

  bezierAt(spec.curve, state.t, scratch);
  const hx = scratch.x - prev.x;
  const hz = scratch.z - prev.z;
  if (moving && Math.hypot(hx, hz) > 1e-5) {
    state.heading = Math.atan2(hx, hz);
    state.wheel += (Math.hypot(hx, hz) / 0.18); // wheel radius ~0.18
  }

  out.x = scratch.x;
  out.z = scratch.z;
  out.heading = state.heading;
  out.wheel = state.wheel;
  out.moving = moving;
}
