import { useEffect, useMemo, useRef } from 'react';
import { Color, Object3D, type InstancedMesh } from 'three';
import type { City } from '../types';
import {
  buildFieldPlots,
  buildFlowerPatches,
  buildRoadPolylines,
  buildStaticScenery,
  filterScenery,
  type FieldPlot,
  type SceneryVisible,
} from './sceneryLayout';
import {
  SCENERY_BLOB,
  SCENERY_CONE,
  SCENERY_TRUNK,
  UNIT_BOX,
  UNIT_CYLINDER,
} from './shared';
import { mixHex, scaleHex, type MoodTheme } from './palette';

// ---------------------------------------------------------------------------
// Scenery — the instanced layer that fills the negative space: forests between
// districts, bushes, rocks (extra along the riverbanks), farm plots ringing
// young districts, and wildflower patches at garden/festival edges.
//
// Placement is computed in `scenery.ts` (pure, deterministic via hash.ts);
// this component only owns the InstancedMeshes. Draw calls stay fixed (~9
// meshes) no matter how big the forest gets. The whole group remounts when an
// instance count changes (same pattern as Citizens) so buffers resize
// correctly; matrices are written once per layout change, colors once per
// layout/mood change.
//
// Development staging: `filterScenery` re-runs when districts/roads change or
// quantized development moves, so the forest recedes as districts grow and
// fields appear/yield with development.
// ---------------------------------------------------------------------------

/** Crop-row strips per farm plot. */
const ROWS_PER_PLOT = 4;

interface SceneryProps {
  city: City;
  theme: MoodTheme;
  /** 0..1 density factor from the adaptive perf governor (default 1). Thins the
   *  shadow-casting forest on struggling GPUs. */
  quality?: number;
}

/** Keep a deterministic prefix of `arr` scaled by quality (1 = whole array). */
function thin<T>(arr: T[], quality: number): T[] {
  if (quality >= 1) return arr;
  return arr.slice(0, Math.max(0, Math.ceil(arr.length * quality)));
}

/** Bloom color palette, picked per-instance by tint. */
const BLOOM_COLORS = ['#e98fb4', '#e8d27a', '#b88fe9', '#f0eee2'];

/** Field base color by tint band: wheat / greens / tilled soil. */
function plotBaseColor(plot: FieldPlot): string {
  if (plot.tint < 0.36) return '#c2a95e';
  if (plot.tint < 0.68) return '#8fae5a';
  return '#a9854f';
}

export function Scenery({ city, theme, quality = 1 }: SceneryProps) {
  const flatsLen = city.terrain?.flats.length ?? 0;

  // Seed-only candidates. Re-derived when a founding adds a plateau flat,
  // because ground heights near the new district shift (same trigger the
  // terrain mesh rebuilds on).
  const statics = useMemo(
    () => buildStaticScenery(city.seed.raw, city.terrain),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [city.seed.value, flatsLen],
  );

  const roadPolylines = useMemo(
    () => buildRoadPolylines(city),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [city.seed.value, city.districts.length, city.roads.length],
  );
  const plots = useMemo(
    () => buildFieldPlots(city, roadPolylines),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [city.seed.value, city.districts.length, roadPolylines],
  );
  const flowers = useMemo(
    () => buildFlowerPatches(city),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [city.seed.value, city.districts.length, flatsLen],
  );

  // Quantized development signature: the dynamic filter only re-runs when a
  // district crosses a ~6-point development band (or the layout changes), not
  // on every daily tick.
  const devKey = city.districts
    .map((d) => `${d.id}:${Math.floor(d.development / 6)}`)
    .join('|');

  const visible: SceneryVisible = useMemo(
    () => filterScenery(statics, plots, flowers, city, roadPolylines),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [statics, plots, flowers, roadPolylines, devKey],
  );

  // Thin the shadow-casting greenery on weak GPUs (deterministic prefix slice).
  const trees = useMemo(() => thin(visible.trees, quality), [visible.trees, quality]);
  const bushes = useMemo(() => thin(visible.bushes, quality), [visible.bushes, quality]);
  const rocks = useMemo(() => thin(visible.rocks, quality), [visible.rocks, quality]);
  const conifers = useMemo(() => trees.filter((t) => t.variant === 0), [trees]);
  const broadleafs = useMemo(() => trees.filter((t) => t.variant === 1), [trees]);
  const poplars = useMemo(() => trees.filter((t) => t.variant === 2), [trees]);

  // Instance counts per mesh (cones/blobs are shared across variants).
  const coneCount = conifers.length * 2 + poplars.length;
  const blobCount = broadleafs.length * 2 + bushes.length;
  const rowCount = visible.plots.length * ROWS_PER_PLOT;
  const countKey = [
    trees.length,
    coneCount,
    blobCount,
    rocks.length,
    visible.plots.length,
    visible.flowers.length,
  ].join('-');

  const trunkRef = useRef<InstancedMesh>(null);
  const coneRef = useRef<InstancedMesh>(null);
  const blobRef = useRef<InstancedMesh>(null);
  const rockRef = useRef<InstancedMesh>(null);
  const plotRef = useRef<InstancedMesh>(null);
  const rowRef = useRef<InstancedMesh>(null);
  const stemRef = useRef<InstancedMesh>(null);
  const bloomRef = useRef<InstancedMesh>(null);
  const dummy = useMemo(() => new Object3D(), []);

  // ----- Matrices: written once per layout change ---------------------------
  useEffect(() => {
    const trunk = trunkRef.current;
    const cone = coneRef.current;
    const blob = blobRef.current;

    if (trunk) {
      trees.forEach((t, i) => {
        const trunkH = t.variant === 1 ? 0.8 : t.variant === 2 ? 0.7 : 0.6;
        const trunkR = t.variant === 2 ? 0.14 : 0.17;
        dummy.position.set(t.x, t.y + (trunkH / 2 - 0.06) * t.s, t.z);
        dummy.rotation.set(0, t.rot, 0);
        dummy.scale.set(trunkR * t.s, trunkH * t.s, trunkR * t.s);
        dummy.updateMatrix();
        trunk.setMatrixAt(i, dummy.matrix);
      });
      trunk.instanceMatrix.needsUpdate = true;
    }

    if (cone) {
      let ci = 0;
      for (const t of conifers) {
        // Two stacked cones (unit cone is centered, apex up).
        dummy.position.set(t.x, t.y + 1.2 * t.s, t.z);
        dummy.rotation.set(0, t.rot, 0);
        dummy.scale.set(1.5 * t.s, 1.5 * t.s, 1.5 * t.s);
        dummy.updateMatrix();
        cone.setMatrixAt(ci++, dummy.matrix);
        dummy.position.set(t.x, t.y + 1.95 * t.s, t.z);
        dummy.scale.set(1.05 * t.s, 1.15 * t.s, 1.05 * t.s);
        dummy.updateMatrix();
        cone.setMatrixAt(ci++, dummy.matrix);
      }
      for (const t of poplars) {
        // One tall narrow cone.
        dummy.position.set(t.x, t.y + 1.75 * t.s, t.z);
        dummy.rotation.set(0, t.rot, 0);
        dummy.scale.set(0.72 * t.s, 2.3 * t.s, 0.72 * t.s);
        dummy.updateMatrix();
        cone.setMatrixAt(ci++, dummy.matrix);
      }
      cone.instanceMatrix.needsUpdate = true;
    }

    if (blob) {
      let bi = 0;
      for (const t of broadleafs) {
        // Main canopy blob + a smaller offset blob for silhouette.
        dummy.position.set(t.x, t.y + 1.3 * t.s, t.z);
        dummy.rotation.set(0, t.rot, 0);
        dummy.scale.set(1.5 * t.s, 1.25 * t.s, 1.5 * t.s);
        dummy.updateMatrix();
        blob.setMatrixAt(bi++, dummy.matrix);
        const ox = Math.cos(t.rot) * 0.45 * t.s;
        const oz = -Math.sin(t.rot) * 0.45 * t.s;
        dummy.position.set(t.x + ox, t.y + 1.65 * t.s, t.z + oz);
        dummy.scale.set(0.9 * t.s, 0.75 * t.s, 0.9 * t.s);
        dummy.updateMatrix();
        blob.setMatrixAt(bi++, dummy.matrix);
      }
      for (const b of bushes) {
        dummy.position.set(b.x, b.y + 0.24 * b.s, b.z);
        dummy.rotation.set(0, b.rot, 0);
        dummy.scale.set(0.95 * b.s, 0.6 * b.s, 0.95 * b.s);
        dummy.updateMatrix();
        blob.setMatrixAt(bi++, dummy.matrix);
      }
      blob.instanceMatrix.needsUpdate = true;
    }

    if (rockRef.current) {
      rocks.forEach((r, i) => {
        dummy.position.set(r.x, r.y + 0.13 * r.s, r.z);
        dummy.rotation.set(0, r.rot, 0);
        dummy.scale.set(0.8 * r.s, 0.42 * r.s, 1.0 * r.s);
        dummy.updateMatrix();
        rockRef.current!.setMatrixAt(i, dummy.matrix);
      });
      rockRef.current.instanceMatrix.needsUpdate = true;
    }

    if (plotRef.current && rowRef.current) {
      visible.plots.forEach((p, i) => {
        dummy.position.set(p.x, p.y, p.z);
        dummy.rotation.set(0, p.rot, 0);
        dummy.scale.set(p.halfW * 2, 0.55, p.halfD * 2);
        dummy.updateMatrix();
        plotRef.current!.setMatrixAt(i, dummy.matrix);
        // Crop rows across the plot depth, rotated with the plot.
        const cos = Math.cos(p.rot);
        const sin = Math.sin(p.rot);
        for (let r = 0; r < ROWS_PER_PLOT; r++) {
          const lz = -p.halfD + ((r + 0.5) * (p.halfD * 2)) / ROWS_PER_PLOT;
          dummy.position.set(p.x + sin * lz, p.y + 0.31, p.z + cos * lz);
          dummy.rotation.set(0, p.rot, 0);
          dummy.scale.set(p.halfW * 2 * 0.86, 0.14, 0.34);
          dummy.updateMatrix();
          rowRef.current!.setMatrixAt(i * ROWS_PER_PLOT + r, dummy.matrix);
        }
      });
      plotRef.current.instanceMatrix.needsUpdate = true;
      rowRef.current.instanceMatrix.needsUpdate = true;
    }

    if (stemRef.current && bloomRef.current) {
      visible.flowers.forEach((f, i) => {
        dummy.position.set(f.x, f.y + 0.16 * f.s, f.z);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(0.035 * f.s, 0.32 * f.s, 0.035 * f.s);
        dummy.updateMatrix();
        stemRef.current!.setMatrixAt(i, dummy.matrix);
        dummy.position.set(f.x, f.y + 0.36 * f.s, f.z);
        dummy.scale.set(0.15 * f.s, 0.13 * f.s, 0.15 * f.s);
        dummy.updateMatrix();
        bloomRef.current!.setMatrixAt(i, dummy.matrix);
      });
      stemRef.current.instanceMatrix.needsUpdate = true;
      bloomRef.current.instanceMatrix.needsUpdate = true;
    }
  }, [visible, conifers, broadleafs, poplars, trees, bushes, rocks, dummy, countKey]);

  // ----- Per-instance colors: layout or mood change --------------------------
  useEffect(() => {
    const color = new Color();
    const tinted = (base: string, tint: number, mood = 0.25) =>
      color.set(scaleHex(mixHex(base, theme.groundTint, mood), 0.82 + tint * 0.34));

    const cone = coneRef.current;
    if (cone) {
      let ci = 0;
      for (const t of conifers) {
        tinted('#3e7c47', t.tint);
        cone.setColorAt(ci++, color);
        cone.setColorAt(ci++, color);
      }
      for (const t of poplars) {
        tinted('#73ab59', t.tint);
        cone.setColorAt(ci++, color);
      }
      if (cone.instanceColor) cone.instanceColor.needsUpdate = true;
    }

    const blob = blobRef.current;
    if (blob) {
      let bi = 0;
      for (const t of broadleafs) {
        tinted('#5d9a4e', t.tint);
        blob.setColorAt(bi++, color);
        blob.setColorAt(bi++, color);
      }
      for (const b of bushes) {
        tinted('#557f43', b.tint);
        blob.setColorAt(bi++, color);
      }
      if (blob.instanceColor) blob.instanceColor.needsUpdate = true;
    }

    const rock = rockRef.current;
    if (rock) {
      rocks.forEach((r, i) => {
        tinted('#8b877c', r.tint, 0.3);
        rock.setColorAt(i, color);
      });
      if (rock.instanceColor) rock.instanceColor.needsUpdate = true;
    }

    const plot = plotRef.current;
    const row = rowRef.current;
    if (plot && row) {
      visible.plots.forEach((p, i) => {
        const base = mixHex(plotBaseColor(p), theme.groundTint, 0.18);
        color.set(scaleHex(base, 0.9 + p.tint * 0.18));
        plot.setColorAt(i, color);
        color.set(scaleHex(base, 0.72));
        for (let r = 0; r < ROWS_PER_PLOT; r++) {
          row.setColorAt(i * ROWS_PER_PLOT + r, color);
        }
      });
      if (plot.instanceColor) plot.instanceColor.needsUpdate = true;
      if (row.instanceColor) row.instanceColor.needsUpdate = true;
    }

    const bloom = bloomRef.current;
    if (bloom) {
      visible.flowers.forEach((f, i) => {
        const pick = BLOOM_COLORS[Math.floor(f.tint * BLOOM_COLORS.length) % BLOOM_COLORS.length];
        color.set(mixHex(pick, theme.colorShift, 0.15));
        bloom.setColorAt(i, color);
      });
      if (bloom.instanceColor) bloom.instanceColor.needsUpdate = true;
    }
  }, [visible, conifers, broadleafs, poplars, bushes, rocks, theme, countKey]);

  const trunkColor = useMemo(() => mixHex('#6b4a2e', theme.groundTint, 0.12), [theme]);
  const stemColor = useMemo(() => mixHex('#4f8a3d', theme.groundTint, 0.2), [theme]);

  return (
    // Remount only when an instance count changes so buffers resize correctly.
    <group key={countKey}>
      {/* Trunks/rocks skip the shadow pass: a trunk's shadow hides inside its
          canopy's and rocks sit too low to read — canopies carry the forest
          shadow at half the caster count. */}
      {trees.length > 0 && (
        <instancedMesh
          ref={trunkRef}
          geometry={SCENERY_TRUNK}
          args={[undefined, undefined, trees.length]}
          raycast={() => null}
          frustumCulled={false}
        >
          <meshStandardMaterial color={trunkColor} roughness={0.95} metalness={0} />
        </instancedMesh>
      )}
      {coneCount > 0 && (
        <instancedMesh
          ref={coneRef}
          geometry={SCENERY_CONE}
          args={[undefined, undefined, coneCount]}
          castShadow
          raycast={() => null}
          frustumCulled={false}
        >
          <meshStandardMaterial roughness={0.9} metalness={0} />
        </instancedMesh>
      )}
      {blobCount > 0 && (
        <instancedMesh
          ref={blobRef}
          geometry={SCENERY_BLOB}
          args={[undefined, undefined, blobCount]}
          castShadow
          raycast={() => null}
          frustumCulled={false}
        >
          <meshStandardMaterial roughness={0.9} metalness={0} />
        </instancedMesh>
      )}
      {rocks.length > 0 && (
        <instancedMesh
          ref={rockRef}
          geometry={SCENERY_BLOB}
          args={[undefined, undefined, rocks.length]}
          raycast={() => null}
          frustumCulled={false}
        >
          <meshStandardMaterial roughness={1} metalness={0} />
        </instancedMesh>
      )}
      {visible.plots.length > 0 && (
        <>
          <instancedMesh
            ref={plotRef}
            geometry={UNIT_BOX}
            args={[undefined, undefined, visible.plots.length]}
            receiveShadow
            raycast={() => null}
            frustumCulled={false}
          >
            <meshStandardMaterial roughness={1} metalness={0} />
          </instancedMesh>
          <instancedMesh
            ref={rowRef}
            geometry={UNIT_BOX}
            args={[undefined, undefined, rowCount]}
            raycast={() => null}
            frustumCulled={false}
          >
            <meshStandardMaterial roughness={1} metalness={0} />
          </instancedMesh>
        </>
      )}
      {visible.flowers.length > 0 && (
        <>
          <instancedMesh
            ref={stemRef}
            geometry={UNIT_CYLINDER}
            args={[undefined, undefined, visible.flowers.length]}
            raycast={() => null}
            frustumCulled={false}
          >
            <meshStandardMaterial color={stemColor} roughness={0.9} metalness={0} />
          </instancedMesh>
          <instancedMesh
            ref={bloomRef}
            geometry={SCENERY_BLOB}
            args={[undefined, undefined, visible.flowers.length]}
            raycast={() => null}
            frustumCulled={false}
          >
            <meshStandardMaterial roughness={0.7} metalness={0} />
          </instancedMesh>
        </>
      )}
    </group>
  );
}
