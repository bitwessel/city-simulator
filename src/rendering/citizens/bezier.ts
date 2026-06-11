// ---------------------------------------------------------------------------
// Road-ribbon math.
//
// Roads.tsx draws each road as a CatmullRom curve through start / mid / end
// with a deterministic perpendicular "bow". To keep walkers and carts glued to
// that ribbon we reproduce the exact bow and approximate the curve with a
// quadratic bezier whose midpoint lands on the same bowed mid-point. (The two
// are visually indistinguishable at this scale and a quadratic is allocation-
// free to sample in the hot loop.)
//
// IMPORTANT: the bow construction is copied verbatim from Roads.tsx /
// Citizens.tsx — do not "improve" it or walkers drift off the road.
// ---------------------------------------------------------------------------

export interface RoadCurve {
  start: { x: number; z: number };
  control: { x: number; z: number };
  end: { x: number; z: number };
}

/** Build the bowed quadratic for the road between two district centers. */
export function roadCurve(
  a: { x: number; z: number },
  b: { x: number; z: number },
): RoadCurve {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const len = Math.hypot(dx, dz) || 1;

  // Same deterministic bow as Roads.tsx so we stay on the ribbon.
  const bow = ((a.x + b.z) % 7) - 3.5;
  const offset = bow * 0.06 * Math.min(len, 40) * 0.15;
  const mid = {
    x: (a.x + b.x) / 2 + (-dz / len) * offset,
    z: (a.z + b.z) / 2 + (dx / len) * offset,
  };
  // Control point of the quadratic bezier that passes through `mid` at t=0.5.
  const control = {
    x: 2 * mid.x - (a.x + b.x) / 2,
    z: 2 * mid.z - (a.z + b.z) / 2,
  };
  return { start: a, control, end: b };
}

/** Sample the curve at parameter t in [0,1], writing into `out` (no alloc). */
export function bezierAt(curve: RoadCurve, t: number, out: { x: number; z: number }): void {
  const u = 1 - t;
  out.x = u * u * curve.start.x + 2 * u * t * curve.control.x + t * t * curve.end.x;
  out.z = u * u * curve.start.z + 2 * u * t * curve.control.z + t * t * curve.end.z;
}
