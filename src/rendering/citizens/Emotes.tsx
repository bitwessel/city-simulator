import { useEffect, useMemo, useRef } from 'react';
import {
  DoubleSide,
  InstancedBufferAttribute,
  Object3D,
  type Camera,
  type InstancedMesh,
} from 'three';
import { MAX_EMOTES, EMOTE_COUNT } from './constants';
import { getEmoteTexture } from './emoteTexture';

// ---------------------------------------------------------------------------
// Emote pool.
//
// A single instanced plane mesh draws up to MAX_EMOTES floating glyphs at once.
// Each live emote rises a little and fades over its lifetime. The glyph is
// selected per instance by an `aCell` attribute the shader uses to offset into
// the shared sprite-sheet (EMOTE_COUNT cells in a horizontal strip).
//
// The pool exposes spawn()/update() to the Citizens frame loop. spawn() is
// rate-limited by the caller (per-agent cooldown) and additionally capped here
// by pool size, so the effect stays charming, never spammy. Billboarding is
// done by copying the camera quaternion each frame — cheap for ~12 quads.
// ---------------------------------------------------------------------------

const LIFETIME = 1.8; // seconds
const RISE = 0.9; // world units risen over the lifetime

interface Slot {
  active: boolean;
  x: number;
  y: number;
  z: number;
  cell: number;
  born: number;
}

export interface EmotePool {
  /** Request an emote glyph `cell` at world (x,y,z); ignored if pool is full. */
  spawn(x: number, y: number, z: number, cell: number, now: number): void;
  /** Advance fades + billboard toward the camera; writes instance matrices. */
  update(now: number, camera: Camera): void;
}

export function EmoteSprites({ assign }: { assign: (pool: EmotePool | null) => void }) {
  const meshRef = useRef<InstancedMesh>(null);
  const dummy = useMemo(() => new Object3D(), []);
  const slots = useMemo<Slot[]>(
    () =>
      Array.from({ length: MAX_EMOTES }, () => ({
        active: false,
        x: 0,
        y: 0,
        z: 0,
        cell: 0,
        born: 0,
      })),
    [],
  );
  const cursor = useRef(0);

  const tex = useMemo(() => getEmoteTexture(), []);

  // Per-instance attributes: which sprite-sheet cell + current opacity.
  const cellAttr = useMemo(
    () => new InstancedBufferAttribute(new Float32Array(MAX_EMOTES), 1),
    [],
  );
  const alphaAttr = useMemo(
    () => new InstancedBufferAttribute(new Float32Array(MAX_EMOTES), 1),
    [],
  );

  useEffect(() => {
    const pool: EmotePool = {
      spawn(x, y, z, cell, now) {
        // Find a free slot; round-robin so we recycle the oldest if full.
        let idx = -1;
        for (let i = 0; i < slots.length; i++) {
          if (!slots[i].active) {
            idx = i;
            break;
          }
        }
        if (idx === -1) {
          idx = cursor.current;
          cursor.current = (cursor.current + 1) % slots.length;
        }
        const s = slots[idx];
        s.active = true;
        s.x = x;
        s.y = y;
        s.z = z;
        s.cell = cell;
        s.born = now;
      },
      update(now, camera) {
        const mesh = meshRef.current;
        if (!mesh) return;
        for (let i = 0; i < slots.length; i++) {
          const s = slots[i];
          if (!s.active) {
            alphaAttr.setX(i, 0);
            // Park inactive instances out of view (scale 0).
            dummy.position.set(0, -1000, 0);
            dummy.scale.setScalar(0.0001);
            dummy.updateMatrix();
            mesh.setMatrixAt(i, dummy.matrix);
            continue;
          }
          const age = (now - s.born) / LIFETIME;
          if (age >= 1) {
            s.active = false;
            alphaAttr.setX(i, 0);
            dummy.position.set(0, -1000, 0);
            dummy.scale.setScalar(0.0001);
            dummy.updateMatrix();
            mesh.setMatrixAt(i, dummy.matrix);
            continue;
          }
          // Ease-out rise + fade. Pop in quickly, linger, fade out.
          const alpha = age < 0.15 ? age / 0.15 : 1 - (age - 0.15) / 0.85;
          alphaAttr.setX(i, Math.max(0, alpha));
          cellAttr.setX(i, s.cell);
          dummy.position.set(s.x, s.y + age * RISE, s.z);
          dummy.quaternion.copy(camera.quaternion); // billboard
          const scale = 0.5 * (0.7 + age * 0.3);
          dummy.scale.set(scale, scale, scale);
          dummy.updateMatrix();
          mesh.setMatrixAt(i, dummy.matrix);
        }
        mesh.instanceMatrix.needsUpdate = true;
        cellAttr.needsUpdate = true;
        alphaAttr.needsUpdate = true;
      },
    };
    assign(pool);
    return () => assign(null);
  }, [slots, dummy, cellAttr, alphaAttr, assign]);

  // Inject per-instance sprite-sheet cell + fade alpha into the basic material.
  // We offset the map UV into the right cell and fold the per-instance alpha
  // into diffuseColor.a, so the stock <opaque_fragment> emits the faded glyph.
  const onBeforeCompile = useMemo(() => {
    return (shader: { vertexShader: string; fragmentShader: string }) => {
      shader.vertexShader =
        'attribute float aCell;\nattribute float aAlpha;\nvarying float vCell;\nvarying float vAlpha;\n' +
        shader.vertexShader.replace(
          '#include <uv_vertex>',
          '#include <uv_vertex>\n  vCell = aCell;\n  vAlpha = aAlpha;',
        );
      shader.fragmentShader =
        'varying float vCell;\nvarying float vAlpha;\n' +
        shader.fragmentShader.replace(
          '#include <map_fragment>',
          `#ifdef USE_MAP
             vec2 cellUv = vec2( (vMapUv.x + vCell) / ${EMOTE_COUNT.toFixed(1)}, vMapUv.y );
             vec4 sampledDiffuseColor = texture2D( map, cellUv );
             diffuseColor *= sampledDiffuseColor;
           #endif
           diffuseColor.a *= vAlpha;`,
        );
    };
  }, []);

  if (!tex) return null;

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, MAX_EMOTES]}
      raycast={() => null}
      frustumCulled={false}
    >
      <planeGeometry args={[1, 1]}>
        <primitive object={cellAttr} attach="attributes-aCell" />
        <primitive object={alphaAttr} attach="attributes-aAlpha" />
      </planeGeometry>
      <meshBasicMaterial
        map={tex.texture}
        transparent
        depthWrite={false}
        side={DoubleSide}
        color="#ffffff"
        toneMapped={false}
        onBeforeCompile={onBeforeCompile}
      />
    </instancedMesh>
  );
}
