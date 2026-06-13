// ---------------------------------------------------------------------------
// Cast-follow bridge (phase 06).
//
// A tiny shared registry that lets the citizen layer (which knows where each
// named cast member is walking, frame by frame) hand live world positions to
// the follow camera (which lives elsewhere in the Canvas tree). Both sides hold
// the same mutable Map via a ref created in CityScene — no store round-trips in
// the hot loop, zero per-frame allocation, and absolutely no simulation impact.
// ---------------------------------------------------------------------------

/** Live world position of a bound cast member, written each frame. */
export interface CastPos {
  x: number;
  y: number;
  z: number;
}

/** castId -> current world position. Owned by CityScene, written by Citizens. */
export type CastPositions = Map<string, CastPos>;
