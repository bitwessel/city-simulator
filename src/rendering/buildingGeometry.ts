import {
  BufferAttribute,
  Color,
  Euler,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  Vector3,
  type BufferGeometry,
  type WebGLProgramParametersWithUniforms,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Building, BuildingKind } from '../types';
import type { BuildingPalette } from './BuildingMesh';
import {
  LOWPOLY_SPHERE,
  UNIT_BOX,
  UNIT_CONE,
  UNIT_CONE_SMOOTH,
  UNIT_CYLINDER,
  UNIT_SPHERE,
} from './shared';
import { hashFloat } from './hash';
import { shiftHSL } from './palette';

// ---------------------------------------------------------------------------
// buildingGeometry — a *data* mirror of the static, matte roster cases in
// BuildingMesh.buildKind, used to collapse a district's many small per-building
// meshes into one merged matte mesh + one merged emissive mesh per district
// (the building draw-call reduction pass — see HANDOFF-building-instancing.md).
//
// Each eligible kind is emitted here as two part lists (matte / emissive)
// instead of JSX. A part is a shared unit geometry + a local transform + a
// baked color. `mergeDistrictBuildings` bakes each building's own group
// transform (world X/Z, terrain Y, facing rotation, scale) and per-building
// HSL variation into the parts, then merges everything into two BufferGeometrys.
//
// IMPORTANT — keep in lockstep with BuildingMesh.buildKind: the same kind must
// look identical whether it renders merged (the common case, here) or as an
// individual <BuildingMesh> (wobble buildings, and any future per-building
// path). Only the kinds in MERGEABLE_KINDS are emitted here; everything else
// (animated, construction, wonders, metallic/transparent/cool-glow landmarks)
// stays on BuildingMesh. Renderer-only: no RNG, no sim imports.
// ---------------------------------------------------------------------------

// Standard matte look, mirroring BuildingMesh's MAT (flat, matte diorama).
const MAT = { roughness: 0.85, metalness: 0.05 } as const;

/** World units of body height per storey (mirrors BuildingMesh.FLOOR_HEIGHT). */
const FLOOR_HEIGHT = 0.62;

/** A single primitive to bake into a district merge. Transform is *local* to
 *  the building group (the same space buildKind's JSX meshes live in). */
interface MergePart {
  geo: BufferGeometry;
  pos: readonly [number, number, number];
  /** Local euler rotation (XYZ, radians). Omitted = identity. */
  rot?: readonly [number, number, number];
  /** Local scale — uniform or per-axis. */
  scale: readonly [number, number, number] | number;
  /** Baked color (sRGB hex). Matte: diffuse. Emissive: the glow/emissive tint. */
  color: string;
  /** Multiply the baked color (emissive only): preserves per-window relative
   *  brightness across the district's single, uniform emissive intensity. */
  mul?: number;
}

/** Per-kind layout split by material family. */
interface KindGeometry {
  matte: MergePart[];
  emissive: MergePart[];
}

/**
 * Kinds whose buildKind silhouette is pure matte + warm-emissive accents (no
 * metallic sheen, no transparency, no animated sub-part) and so can be folded
 * into the per-district merge. Anything not in this set falls through to an
 * individual <BuildingMesh>. Must match the cases emitted in buildKindGeometry.
 */
export const MERGEABLE_KINDS: ReadonlySet<BuildingKind> = new Set<BuildingKind>([
  'house',
  'tower',
  'workshop',
  'warehouse',
  'market-stall',
  'temple',
  'tavern',
  'mansion',
  'library',
  'apartment',
  'dock',
  'tent',
  'ruin',
]);

export function isMergeableKind(kind: BuildingKind): boolean {
  return MERGEABLE_KINDS.has(kind);
}

// --- small builders to keep the emitter terse -------------------------------
const m = (
  geo: BufferGeometry,
  pos: readonly [number, number, number],
  scale: readonly [number, number, number] | number,
  color: string,
  rot?: readonly [number, number, number],
): MergePart => ({ geo, pos, scale, color, rot });

/** Emissive part: a glow tint + optional relative-brightness multiplier. */
const e = (
  geo: BufferGeometry,
  pos: readonly [number, number, number],
  scale: readonly [number, number, number] | number,
  color: string,
  mul?: number,
  rot?: readonly [number, number, number],
): MergePart => ({ geo, pos, scale, color, rot, mul });

/**
 * A row of emissive "window" strips per face — a data mirror of
 * BuildingMesh.windowStrip (used by the tall residential kinds). Bands cap at 8
 * per face. The per-strip hash flicker (`lit`) is baked into `mul` so the merged
 * windows keep their alive-grid variation under one uniform emissive intensity.
 */
function windowStripParts(
  key: string,
  yOffset: number,
  bodyH: number,
  halfW: number,
  halfD: number,
  rows: number,
  tint: string,
): MergePart[] {
  const out: MergePart[] = [];
  rows = Math.max(1, Math.min(8, rows));
  const rowGap = bodyH / (rows + 1);
  // [fx, fz, rotY, axis]
  const faces: [number, number, number, number][] = [
    [0, halfD + 0.01, 0, 0],
    [0, -halfD - 0.01, Math.PI, 0],
    [halfW + 0.01, 0, Math.PI / 2, 1],
    [-halfW - 0.01, 0, -Math.PI / 2, 1],
  ];
  for (let f = 0; f < faces.length; f++) {
    const [fx, fz, ry, axis] = faces[f];
    const faceW = axis === 0 ? halfW * 1.5 : halfD * 1.5;
    for (let r = 0; r < rows; r++) {
      const y = rowGap * (r + 1);
      const lit = 0.55 + hashFloat(key, f * 17 + r * 3 + 1) * 0.9;
      out.push(
        e(UNIT_BOX, [fx, yOffset + y, fz], [faceW, rowGap * 0.42, 0.04], tint, lit, [0, ry, 0]),
      );
    }
  }
  return out;
}

/**
 * Per-kind static layout as data. Returns null for kinds not in the merge set
 * (callers fall back to <BuildingMesh>). Mirrors buildKind exactly for the
 * kinds it handles — edit both together.
 */
export function buildKindGeometry(building: Building, p: BuildingPalette): KindGeometry | null {
  if (!MERGEABLE_KINDS.has(building.kind)) return null;

  const wall = p.wall;
  const accent = p.accent;
  const trim = p.trim;
  const glow = p.glow;
  const id = building.id;
  const era = p.era ?? 'village';
  const matte: MergePart[] = [];
  const emissive: MergePart[] = [];

  switch (building.kind) {
    case 'house': {
      if (era === 'settlement') {
        matte.push(m(UNIT_CYLINDER, [0, 0.3, 0], [0.95, 0.6, 0.95], wall));
        matte.push(m(UNIT_CONE_SMOOTH, [0, 0.95, 0], [1.5, 0.95, 1.5], accent));
        matte.push(m(UNIT_BOX, [0, 0.22, 0.48], [0.22, 0.38, 0.1], trim));
        // firepit ember glow by the entrance
        emissive.push(e(UNIT_SPHERE, [0.55, 0.08, 0.55], [0.14, 0.08, 0.14], '#ff8a3c', 1.5));
        break;
      }
      const grand = era === 'city' || era === 'wonder';
      const bodyH = grand ? 1.25 : 0.9;
      matte.push(m(UNIT_BOX, [0, bodyH / 2, 0], [1.1, bodyH, 1], wall));
      if (grand) matte.push(m(UNIT_BOX, [0, 0.62, 0], [1.16, 0.07, 1.06], trim));
      matte.push(m(UNIT_CONE, [0, bodyH + 0.25, 0], [1.5, 0.7, 1.35], accent, [0, Math.PI / 6, 0]));
      if (era === 'town' || grand) {
        matte.push(m(UNIT_BOX, [0.42, bodyH + 0.42, -0.2], [0.16, 0.55, 0.16], trim));
      }
      if (era === 'wonder') {
        // pennant: pole (matte) + flag (emissive glow), group offset folded in
        matte.push(m(UNIT_CYLINDER, [0, bodyH + 0.75, 0], [0.04, 0.45, 0.04], trim));
        emissive.push(e(UNIT_BOX, [0.13, bodyH + 0.89, 0], [0.24, 0.13, 0.02], glow, 1.5));
      }
      matte.push(m(UNIT_BOX, [0, 0.25, 0.52], [0.22, 0.4, 0.1], trim));
      // hearth window that lights up after dusk (dim — relative mul 0.5)
      emissive.push(e(UNIT_BOX, [0.3, 0.5, 0.51], [0.2, 0.22, 0.04], '#ffcf6b', 0.5));
      break;
    }

    case 'tower': {
      matte.push(m(UNIT_BOX, [0, 0.9, 0], [0.85, 1.8, 0.85], wall));
      matte.push(m(UNIT_BOX, [0, 1.85, 0], [1, 0.18, 1], trim));
      matte.push(m(UNIT_CONE, [0, 2.25, 0], [1.05, 0.85, 1.05], accent));
      if (era === 'wonder') {
        matte.push(m(UNIT_CYLINDER, [0, 2.9, 0], [0.04, 0.55, 0.04], trim));
        emissive.push(e(UNIT_BOX, [0.15, 3.07, 0], [0.28, 0.15, 0.02], glow, 1.5));
      }
      break;
    }

    case 'workshop': {
      matte.push(m(UNIT_BOX, [0, 0.4, 0], [1.3, 0.8, 1], wall));
      matte.push(m(UNIT_BOX, [-0.3, 0.95, 0], [0.55, 0.45, 1.05], accent, [0, 0, 0.5]));
      matte.push(m(UNIT_BOX, [0.4, 0.95, 0], [0.55, 0.45, 1.05], accent, [0, 0, 0.5]));
      matte.push(m(UNIT_CYLINDER, [0.5, 1.1, -0.3], [0.18, 0.7, 0.18], trim));
      break;
    }

    case 'warehouse': {
      matte.push(m(UNIT_BOX, [0, 0.5, 0], [1.6, 1, 1.2], wall));
      matte.push(m(UNIT_CYLINDER, [0, 1.05, 0], [0.6, 1.65, 1.25], accent, [0, 0, Math.PI / 2]));
      matte.push(m(UNIT_BOX, [0, 0.4, 0.61], [0.5, 0.6, 0.05], trim));
      break;
    }

    case 'market-stall': {
      matte.push(m(UNIT_BOX, [0, 0.3, 0], [1.3, 0.55, 0.9], trim));
      matte.push(m(UNIT_BOX, [0, 0.78, 0], [1.5, 0.08, 1.1], accent, [0.12, 0, 0]));
      matte.push(m(UNIT_BOX, [-0.6, 0.45, -0.4], [0.08, 0.7, 0.08], wall));
      matte.push(m(UNIT_BOX, [0.6, 0.45, -0.4], [0.08, 0.7, 0.08], wall));
      break;
    }

    case 'temple': {
      matte.push(m(UNIT_BOX, [0, 0.18, 0], [1.5, 0.36, 1.2], trim));
      matte.push(m(UNIT_BOX, [0, 0.7, 0], [1.1, 0.7, 0.85], wall));
      matte.push(m(UNIT_CYLINDER, [-0.42, 0.6, 0.45], [0.12, 0.7, 0.12], trim));
      matte.push(m(UNIT_CYLINDER, [0.42, 0.6, 0.45], [0.12, 0.7, 0.12], trim));
      matte.push(m(UNIT_CONE, [0, 1.3, 0], [1.4, 0.55, 1.1], accent, [0, Math.PI / 4, 0]));
      break;
    }

    case 'tavern': {
      matte.push(m(UNIT_BOX, [0, 0.4, 0], [1.2, 0.8, 1], wall));
      matte.push(m(UNIT_BOX, [0, 1.0, 0], [1.35, 0.5, 1.15], trim));
      matte.push(m(UNIT_CONE, [0, 1.55, 0], [1.7, 0.6, 1.5], accent, [0, Math.PI / 6, 0]));
      // hanging sign (lit) + two warm window glows
      emissive.push(e(UNIT_BOX, [0.7, 0.7, 0.5], [0.3, 0.3, 0.05], glow, 0.7));
      emissive.push(e(UNIT_BOX, [-0.3, 0.45, 0.51], [0.22, 0.26, 0.04], '#ffcf6b', 1.3));
      emissive.push(e(UNIT_BOX, [0.25, 0.45, 0.51], [0.22, 0.26, 0.04], '#ffcf6b', 1.3));
      break;
    }

    case 'mansion': {
      matte.push(m(UNIT_BOX, [0, 0.55, 0], [1.7, 1.1, 1.2], wall));
      matte.push(m(UNIT_BOX, [-0.95, 0.4, 0], [0.5, 0.8, 1], wall));
      matte.push(m(UNIT_BOX, [0.95, 0.4, 0], [0.5, 0.8, 1], wall));
      matte.push(m(UNIT_BOX, [0, 1.2, 0], [1.8, 0.18, 1.3], trim));
      matte.push(m(UNIT_CONE, [0, 1.55, 0], [2, 0.5, 1.5], accent, [0, Math.PI / 4, 0]));
      // dome — metallic in the individual path; flattens to matte here (small,
      // an accepted PBR-flatten tradeoff for the merge).
      matte.push(m(UNIT_SPHERE, [0, 1.45, 0], [0.4, 0.4, 0.4], accent));
      emissive.push(e(UNIT_BOX, [-0.45, 0.6, 0.61], [0.24, 0.42, 0.04], '#ffcf6b', 0.6));
      emissive.push(e(UNIT_BOX, [0.45, 0.6, 0.61], [0.24, 0.42, 0.04], '#ffcf6b', 0.6));
      break;
    }

    case 'library': {
      matte.push(m(UNIT_BOX, [0, 0.6, 0], [1.5, 1.2, 1.1], wall));
      // trim-colored arched window hints (decorative, not emissive)
      matte.push(m(UNIT_BOX, [-0.45, 0.65, 0.56], [0.18, 0.8, 0.05], trim));
      matte.push(m(UNIT_BOX, [0, 0.65, 0.56], [0.18, 0.8, 0.05], trim));
      matte.push(m(UNIT_BOX, [0.45, 0.65, 0.56], [0.18, 0.8, 0.05], trim));
      matte.push(m(UNIT_BOX, [0, 1.25, 0], [1.6, 0.2, 1.2], accent));
      matte.push(m(UNIT_CYLINDER, [0, 1.5, 0], [0.35, 0.3, 0.35], trim));
      matte.push(m(UNIT_CONE_SMOOTH, [0, 1.78, 0], [0.45, 0.4, 0.45], accent));
      break;
    }

    case 'apartment': {
      const floors = building.floors ?? 4;
      const bodyH = floors * FLOOR_HEIGHT;
      const halfW = 0.62;
      const halfD = 0.5;
      const mansard = hashFloat(id, 21) < 0.5;
      matte.push(m(UNIT_BOX, [0, 0.12, 0], [halfW * 2.2, 0.24, halfD * 2.2], trim));
      matte.push(m(UNIT_BOX, [0, bodyH / 2 + 0.2, 0], [halfW * 2, bodyH, halfD * 2], wall));
      for (let r = 0; r < floors - 1; r++) {
        matte.push(
          m(UNIT_BOX, [0, 0.2 + FLOOR_HEIGHT * (r + 1), 0], [halfW * 2.05, 0.05, halfD * 2.05], trim),
        );
      }
      for (const w of windowStripParts(id, 0.2, bodyH, halfW, halfD, floors, '#ffdf9c')) {
        emissive.push(w);
      }
      if (mansard) {
        matte.push(m(UNIT_CONE, [0, bodyH + 0.42, 0], [halfW * 3, 0.5, halfD * 3], accent, [0, Math.PI / 4, 0]));
      } else {
        matte.push(m(UNIT_BOX, [0, bodyH + 0.27, 0], [halfW * 2.1, 0.12, halfD * 2.1], accent));
      }
      matte.push(m(UNIT_CYLINDER, [halfW * 0.4, bodyH + 0.62, -halfD * 0.3], [0.26, 0.4, 0.26], trim));
      break;
    }

    case 'dock': {
      matte.push(m(UNIT_BOX, [0, 0.15, 0], [1.6, 0.16, 0.9], trim));
      matte.push(m(UNIT_CYLINDER, [-0.6, 0.0, 0.4], [0.1, 0.6, 0.1], wall));
      matte.push(m(UNIT_CYLINDER, [0, 0.0, 0.4], [0.1, 0.6, 0.1], wall));
      matte.push(m(UNIT_CYLINDER, [0.6, 0.0, 0.4], [0.1, 0.6, 0.1], wall));
      matte.push(m(UNIT_BOX, [-0.5, 0.5, -0.1], [0.55, 0.5, 0.6], wall));
      matte.push(m(UNIT_CONE, [-0.5, 0.9, -0.1], [0.8, 0.4, 0.85], accent, [0, Math.PI / 4, 0]));
      matte.push(m(UNIT_BOX, [0.55, 0.35, 0.0], [0.3, 0.3, 0.3], accent));
      break;
    }

    case 'tent': {
      matte.push(m(UNIT_CONE, [0, 0.7, 0], [1.5, 1.4, 1.5], accent, [0, Math.PI / 6, 0]));
      matte.push(m(UNIT_CONE, [0, 0.4, 0.55], [0.45, 0.7, 0.3], trim, [Math.PI, 0, 0]));
      matte.push(m(UNIT_SPHERE, [0, 1.42, 0], [0.14, 0.18, 0.14], wall));
      break;
    }

    case 'ruin': {
      matte.push(m(UNIT_BOX, [-0.3, 0.45, 0], [0.4, 0.9, 0.8], wall, [0, 0, 0.12]));
      matte.push(m(UNIT_BOX, [0.35, 0.3, 0.1], [0.45, 0.6, 0.7], wall, [0.1, 0.3, -0.18]));
      matte.push(m(UNIT_CYLINDER, [0.1, 0.18, 0.6], [0.18, 0.9, 0.18], trim, [0, 0, Math.PI / 2]));
      matte.push(m(UNIT_CYLINDER, [-0.45, 0.35, -0.4], [0.16, 0.7, 0.16], trim));
      matte.push(m(LOWPOLY_SPHERE, [0.0, 0.1, -0.1], [0.3, 0.2, 0.3], trim));
      break;
    }
  }

  return { matte, emissive };
}

// ---------------------------------------------------------------------------
// Per-building variation (moved here from BuildingMesh so the merge and the
// individual path share one source). A subtle hash-driven HSL shift per id so a
// district reads cohesive-but-alive instead of monochrome.
// ---------------------------------------------------------------------------

export function varyPalette(building: Building, base: BuildingPalette): BuildingPalette {
  const id = building.id;
  const dh = (hashFloat(id, 51) - 0.5) * 0.05; //  ±~18° hue
  const ds = (hashFloat(id, 52) - 0.5) * 0.18; //  ±sat
  const dl = (hashFloat(id, 53) - 0.5) * 0.16; //  ±light (~±8%)
  const wall = shiftHSL(base.wall, dh, ds, dl);
  const accentPop = hashFloat(id, 54);
  const accent =
    accentPop < 0.18
      ? shiftHSL(base.accent, (hashFloat(id, 55) - 0.5) * 0.12, 0.06, 0.04)
      : shiftHSL(base.accent, dh * 0.5, ds * 0.4, dl * 0.4);
  const trim = shiftHSL(base.trim, dh, ds * 0.5, dl * 0.6);
  return { wall, accent, trim, glow: base.glow, glowI: base.glowI, era: base.era };
}

// ---------------------------------------------------------------------------
// Merge — bake each building's group transform + per-building varied colors
// into its parts and merge into one matte + one emissive BufferGeometry per
// district. Parts are baked *relative to the district origin* so a per-district
// group-scale "poof" on era change pivots around the district, not the world.
// ---------------------------------------------------------------------------

// Scratch reused across calls (merge runs rarely — only when a building appears
// or the era/mood changes — but still: zero churn).
const _mBuilding = new Matrix4();
const _mPart = new Matrix4();
const _mWorld = new Matrix4();
const _pos = new Vector3();
const _quat = new Quaternion();
const _scl = new Vector3();
const _euler = new Euler();
const _col = new Color();

function bakePart(part: MergePart, mBuilding: Matrix4): BufferGeometry {
  const g = part.geo.clone();
  _euler.set(part.rot?.[0] ?? 0, part.rot?.[1] ?? 0, part.rot?.[2] ?? 0);
  _quat.setFromEuler(_euler);
  _pos.set(part.pos[0], part.pos[1], part.pos[2]);
  if (typeof part.scale === 'number') _scl.set(part.scale, part.scale, part.scale);
  else _scl.set(part.scale[0], part.scale[1], part.scale[2]);
  _mPart.compose(_pos, _quat, _scl);
  _mWorld.multiplyMatrices(mBuilding, _mPart);
  g.applyMatrix4(_mWorld);

  // Bake the (varied) color into a per-vertex color attribute. Color() stores
  // linear-sRGB (ColorManagement default), matching how material.color works,
  // so the merged vertexColors material renders identically to the per-mesh one.
  // `mul` (emissive only) scales the tint to preserve per-window relative glow.
  _col.set(part.color);
  if (part.mul !== undefined && part.mul !== 1) _col.multiplyScalar(part.mul);
  const n = g.attributes.position.count;
  const colors = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    colors[i * 3] = _col.r;
    colors[i * 3 + 1] = _col.g;
    colors[i * 3 + 2] = _col.b;
  }
  g.setAttribute('color', new BufferAttribute(colors, 3));
  return g;
}

export interface DistrictMerge {
  matte: BufferGeometry | null;
  emissive: BufferGeometry | null;
}

/**
 * Build the merged geometries for one district's mergeable buildings. All parts
 * are expressed relative to (originX, originY, originZ) — pass the district
 * center + plateau height so the rendered group can sit there and scale-pop.
 */
export function mergeDistrictBuildings(
  buildings: Building[],
  basePalette: BuildingPalette,
  originX: number,
  originY: number,
  originZ: number,
  heightOf: (id: string) => number,
  facingOf: (id: string) => number | undefined,
): DistrictMerge {
  const matteGeos: BufferGeometry[] = [];
  const emisGeos: BufferGeometry[] = [];

  for (const b of buildings) {
    const kg = buildKindGeometry(b, varyPalette(b, basePalette));
    if (!kg) continue;
    const s = b.scale * 1.5;
    const rotY = facingOf(b.id) ?? b.rotation;
    _euler.set(0, rotY, 0);
    _quat.setFromEuler(_euler);
    _pos.set(b.position.x - originX, heightOf(b.id) - originY, b.position.z - originZ);
    _scl.set(s, s, s);
    _mBuilding.compose(_pos, _quat, _scl);
    for (const part of kg.matte) matteGeos.push(bakePart(part, _mBuilding));
    for (const part of kg.emissive) emisGeos.push(bakePart(part, _mBuilding));
  }

  const matte = matteGeos.length ? mergeGeometries(matteGeos, false) : null;
  const emissive = emisGeos.length ? mergeGeometries(emisGeos, false) : null;
  return { matte, emissive };
}

// ---------------------------------------------------------------------------
// Materials. The matte merge carries no per-district state (color comes from
// vertex colors) so one module-level material is shared by every district's
// merged mesh. The emissive merge drives its tint from vertex colors too, via a
// tiny shader patch that routes vColor into the emissive term (stock three only
// multiplies vColor into diffuse), so one material reproduces warm windows,
// firepits, banners, etc. Its emissiveIntensity is swept day↔night by
// applyNightGlow through the glowDay/glowNight userData, just like the per-mesh
// window materials it replaces.
// ---------------------------------------------------------------------------

export const MATTE_MERGE_MATERIAL = new MeshStandardMaterial({
  vertexColors: true,
  roughness: MAT.roughness,
  metalness: MAT.metalness,
});

/** Representative night-glow ceiling for merged emissive accents. */
const EMISSIVE_GLOW_NIGHT = 2.4;

export function createEmissiveMergeMaterial(glowDay: number): MeshStandardMaterial {
  const mat = new MeshStandardMaterial({
    color: 0x000000, // diffuse off — only the emissive term lights these
    emissive: 0xffffff, // intensity-scaled, then tinted per-vertex below
    emissiveIntensity: glowDay,
    vertexColors: true,
    toneMapped: false,
    roughness: 0.5,
    metalness: 0,
  });
  // applyNightGlow lerps emissiveIntensity between these on its 4Hz sweep.
  mat.userData = { glowDay, glowNight: EMISSIVE_GLOW_NIGHT };
  // Route the per-vertex color into the emissive term (it normally only tints
  // diffuse). totalEmissiveRadiance is `emissive * emissiveIntensity` here.
  mat.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    // `.rgb` swizzle: three declares vColor as vec4 when color alpha is in play
    // and vec3 otherwise — .rgb is valid either way and keeps the multiply vec3.
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      '#include <emissivemap_fragment>\n\ttotalEmissiveRadiance *= vColor.rgb;',
    );
  };
  // Distinct cache key so this patched program never aliases a stock standard
  // material's compiled program (three keys by params, not by onBeforeCompile).
  mat.customProgramCacheKey = () => 'mm-emissive-merge';
  return mat;
}
