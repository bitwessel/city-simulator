import {
  BoxGeometry,
  ConeGeometry,
  CylinderGeometry,
  SphereGeometry,
  TorusGeometry,
  type BufferGeometry,
} from 'three';

// ---------------------------------------------------------------------------
// Module-level shared geometry cache.
//
// Buildings, trees and decorations reuse a small set of unit primitives that
// are scaled/positioned per instance via the mesh transform. Creating these
// once (not per frame, not per building) keeps ~100+ meshes cheap.
//
// Materials are NOT shared globally because they carry per-district colors;
// those are memoized per-district in the components that own them.
// ---------------------------------------------------------------------------

// Unit primitives (centered at origin, ~1 unit). Components scale them.
export const UNIT_BOX = new BoxGeometry(1, 1, 1);
export const UNIT_SPHERE = new SphereGeometry(0.5, 16, 12);
export const LOWPOLY_SPHERE = new SphereGeometry(0.5, 10, 8);

// Cone with apex up; height 1, base radius 0.5. Used for roofs, trees, tents.
export const UNIT_CONE = new ConeGeometry(0.5, 1, 6);
export const UNIT_CONE_SMOOTH = new ConeGeometry(0.5, 1, 12);

// Cylinder height 1, radius 0.5.
export const UNIT_CYLINDER = new CylinderGeometry(0.5, 0.5, 1, 14);
export const UNIT_CYLINDER_LOW = new CylinderGeometry(0.5, 0.5, 1, 8);

// A flat thin disc (for water, fountain pools, decals).
export const UNIT_DISC = new CylinderGeometry(0.5, 0.5, 0.06, 24);

// A slightly tapered cylinder for towers (wider base).
export const TOWER_BODY = new CylinderGeometry(0.42, 0.5, 1, 12);

// Thin ring for selection halos.
export const SELECT_RING = new TorusGeometry(1, 0.045, 8, 48);

// A chunkier torus for arcane-spire floating rings / decorative haloes.
export const UNIT_TORUS = new TorusGeometry(0.5, 0.07, 8, 24);

// ----- Scenery primitives ----------------------------------------------------
// The instanced scenery layer draws thousands of trees/bushes/rocks twice
// (main + shadow pass), so its primitives are as cheap as silhouettes allow:
// a 6x4 sphere (~36 tris vs 160 for LOWPOLY_SPHERE), an open-ended 8-seg cone
// and an open-ended 5-seg trunk (their hidden caps never read at game angles).
export const SCENERY_BLOB = new SphereGeometry(0.5, 6, 4);
export const SCENERY_CONE = new ConeGeometry(0.5, 1, 8, 1, true);
export const SCENERY_TRUNK = new CylinderGeometry(0.5, 0.5, 1, 5, 1, true);

/** Geometry registry keyed by name, in case a consumer wants lookups. */
export const SHARED_GEOMETRY: Record<string, BufferGeometry> = {
  box: UNIT_BOX,
  sphere: UNIT_SPHERE,
  lowSphere: LOWPOLY_SPHERE,
  cone: UNIT_CONE,
  coneSmooth: UNIT_CONE_SMOOTH,
  cylinder: UNIT_CYLINDER,
  cylinderLow: UNIT_CYLINDER_LOW,
  disc: UNIT_DISC,
  tower: TOWER_BODY,
  ring: SELECT_RING,
  torus: UNIT_TORUS,
};
