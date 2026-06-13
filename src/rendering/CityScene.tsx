import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { Bloom, EffectComposer, N8AO, FXAA, ToneMapping, Vignette } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import {
  ACESFilmicToneMapping,
  Color,
  Fog,
  Raycaster,
  Vector2,
  Vector3,
  type Scene,
  type WebGLRenderer,
} from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import type { City } from '../types';
import { useGameStore } from '../state/store';
import type { CastPositions } from './castFollow';
import { CitizenBioCard } from '../components/CitizenBioCard';
import { CanvasProbe, GoldenHourOverride } from './PhotoCapture';
import { DAYLIGHT } from './daylight';
import { Districts } from './Districts';
import { Roads } from './Roads';
import { Terrain } from './Terrain';
import { Scenery } from './Scenery';
import { Atmosphere } from './Atmosphere';
import { Citizens } from './Citizens';
import { Lanterns } from './Lanterns';
import { EdictProps } from './EdictProps';
import { ChimneySmoke } from './ChimneySmoke';
import { Celebration } from './Celebration';
import { DaylightRig } from './DaylightRig';
import { terrainHeightAt } from '../generation/terrain';
import { MOOD_THEMES } from './palette';

export interface CitySceneProps {
  city: City;
  selectedDistrictId: string | null;
  onSelectDistrict: (id: string | null) => void;
  /** In-game days per real second (0 while paused/reading/ended) — drives the
   *  day/night cycle so the sun freezes exactly when the simulation does. */
  clockRate: number;
  /** Phase 06 photo mode: when true, override lighting with golden-hour preset. */
  goldenHour?: boolean;
}

// ---------------------------------------------------------------------------
// CityScene — entry point. Renders the full <Canvas>. The DOM UI overlays
// panels on top; clicking empty ground deselects (onPointerMissed).
//
// Architecture:
//   * Terrain: the continuous generated heightfield + river + horizon.
//   * Scenery: instanced forests/bushes/rocks/fields filling the negative
//     space between districts (recedes as districts develop).
//   * Districts + Roads: building clusters and terrain-following ribbons.
//     Their geometry depends only on generated data (stable for the life of a
//     city); colors/effects depend on mood/stats and recompute cheaply.
//   * Citizens: instanced townsfolk wandering the land and walking the roads.
//   * Atmosphere: lights, fog driver, pollution smog, magic sparkles.
//   * SceneFog: imperatively syncs scene.fog + background to the mood theme so
//     mood changes don't remount the graph.
// All useFrame hooks live in components rendered inside <Canvas>.
// ---------------------------------------------------------------------------

/** Imperatively applies mood-driven background + fog to the three Scene. The
 *  fog far distance scales generously with the city extent so big late-game
 *  cities aren't swallowed by haze (the horizon ring still fades softly). */
function SceneFog({ moodKey, extent }: { moodKey: keyof typeof MOOD_THEMES; extent: number }) {
  const { scene } = useThree() as { scene: Scene };
  const theme = MOOD_THEMES[moodKey];
  // Push the far plane out past the whole city + horizon ring.
  const fogFar = Math.max(theme.fogFar, extent * 5.5);
  const fogNear = Math.max(theme.fogNear, extent * 1.1);

  useEffect(() => {
    const prevBg = scene.background;
    const prevFog = scene.fog;
    scene.background = new Color(theme.sky);
    scene.fog = new Fog(theme.fog, fogNear, fogFar);
    return () => {
      scene.background = prevBg;
      scene.fog = prevFog;
    };
  }, [scene, theme.sky, theme.fog, fogNear, fogFar]);

  return null;
}

/** True when WebGL is software-emulated (SwiftShader/llvmpipe — headless CI,
 *  GPU-less VMs). The post chain is unusably slow there, so PostFX skips it
 *  and tone mapping falls back to the renderer. */
function isSoftwareRenderer(gl: WebGLRenderer): boolean {
  try {
    const ctx = gl.getContext();
    const ext = ctx.getExtension('WEBGL_debug_renderer_info');
    const name = String(
      ctx.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : ctx.RENDERER),
    );
    return /swiftshader|llvmpipe|software/i.test(name);
  } catch {
    return false;
  }
}

/** Post chain: AO grounds the low-poly shapes, bloom lifts emissives (windows
 *  at night, magic, lanterns), a soft vignette frames the diorama, ACES
 *  tone-maps the HDR result and FXAA smooths the edges. Skipped entirely on
 *  software renderers (`?nofx` in the URL forces the same for A/B checks). */
function PostFX() {
  const gl = useThree((s) => s.gl);
  const enabled = useMemo(
    () => !isSoftwareRenderer(gl) && !new URLSearchParams(location.search).has('nofx'),
    [gl],
  );
  // Adaptive budget, degrade-only: stage 0 = full chain, 1 = no AO (N8AO
  // re-renders the scene for depth/normals — a fixed ~15ms on weak iGPUs no
  // matter the sample counts), 2 = no AO and no FXAA. Whenever two consecutive
  // 3s windows can't hold ~30fps, step down a stage; capable GPUs never
  // trigger this. Bloom/vignette/tonemap measured ~free, so they always stay.
  const [stage, setStage] = useState(0);
  const probe = useRef({ warmup: 2, t: 0, frames: 0, slow: 0 });

  useFrame((_, delta) => {
    if (!enabled || stage >= 2) return;
    const p = probe.current;
    if (p.warmup > 0) {
      p.warmup -= delta;
      return;
    }
    p.t += delta;
    p.frames += 1;
    if (p.t < 3) return;
    const fps = p.frames / p.t;
    p.t = 0;
    p.frames = 0;
    if (fps < 30) {
      p.slow += 1;
      if (p.slow >= 2) {
        p.slow = 0;
        p.warmup = 1; // let the lighter chain settle before judging again
        setStage((s) => s + 1);
        console.info(
          `[postfx] stepping down post-processing (sustained ~${fps.toFixed(0)}fps)`,
        );
      }
    } else {
      p.slow = 0;
    }
  });

  if (!enabled) return null;
  // Built as an array: EffectComposer's children type forbids conditional
  // holes (and even JSX comments). Bloom's threshold is in pre-tonemap linear
  // space — sunlit walls already reach ~1, so anything below ~1.5 veils the
  // whole scene in haze.
  const effects = [
    <Bloom key="bloom" mipmapBlur intensity={0.4} luminanceThreshold={1.6} luminanceSmoothing={0.3} />,
    <Vignette key="vignette" eskil={false} offset={0.26} darkness={0.33} />,
    <ToneMapping key="tonemap" mode={ToneMappingMode.ACES_FILMIC} />,
  ];
  if (stage < 2) effects.push(<FXAA key="fxaa" />);
  if (stage < 1) {
    effects.unshift(
      <N8AO key="ao" quality="performance" halfRes aoRadius={2} distanceFalloff={1} intensity={2.4} />,
    );
  }
  return <EffectComposer multisampling={0}>{effects}</EffectComposer>;
}

// ---------------------------------------------------------------------------
// ShadowThrottle — the sun's shadow map is the single most expensive pass:
// every shadow-casting building, citizen and tree is re-rendered from the
// light's point of view. three.js refreshes it EVERY frame by default, but
// nothing in this scene moves fast — buildings are static, the sun only drifts
// with the game clock, and citizens shuffle at walking pace. So we drive the
// shadow map ourselves (autoUpdate is switched off in onCreated): refresh it on
// a fixed ~20fps cadence, plus immediately whenever the sun has swung far
// enough that a stale shadow would visibly lag (fast-forward time-lapse). The
// citizen-shadow lag this introduces is well under a pixel at walking speed.
// ---------------------------------------------------------------------------
/** Shadow map refreshes at most every Nth rendered frame (~20fps at 60fps). */
const SHADOW_REFRESH_FRAMES = 3;
/** ...or sooner if the sun direction moved more than this (squared distance). */
const SUN_MOVE_EPS_SQ = 0.0001;

function ShadowThrottle() {
  const gl = useThree((s) => s.gl);
  const frame = useRef(0);
  const lastSun = useRef(new Vector3().copy(DAYLIGHT.sunDir));
  useFrame(() => {
    frame.current += 1;
    const moved = lastSun.current.distanceToSquared(DAYLIGHT.sunDir) > SUN_MOVE_EPS_SQ;
    if (moved || frame.current % SHADOW_REFRESH_FRAMES === 0) {
      gl.shadowMap.needsUpdate = true;
      lastSun.current.copy(DAYLIGHT.sunDir);
    }
  });
  return null;
}

// ---------------------------------------------------------------------------
// PerfGovernor — a second, gentler line of defence after PostFX. PostFX sheds
// the expensive AO/FXAA passes first; if frames still can't hold ~30fps once
// that's done, this thins the crowd and forest — the next-heaviest costs
// (shadow casters + the per-citizen frame loop). Degrade-only, like PostFX, so
// it never oscillates; capable GPUs never trip it. The chosen density factor is
// fed back to Citizens + Scenery, which re-lay their instances once per step.
// ---------------------------------------------------------------------------
/** Density factors stepped through as FPS sustains low (1 = full). */
const QUALITY_TIERS = [1, 0.7, 0.5];

function PerfGovernor({ onQuality }: { onQuality: (q: number) => void }) {
  const tier = useRef(0);
  // Longer warmup + more slow windows than PostFX, so post-processing degrades
  // before we start removing content.
  const probe = useRef({ warmup: 5, t: 0, frames: 0, slow: 0 });
  useFrame((_, delta) => {
    if (tier.current >= QUALITY_TIERS.length - 1) return;
    const p = probe.current;
    if (p.warmup > 0) {
      p.warmup -= delta;
      return;
    }
    p.t += delta;
    p.frames += 1;
    if (p.t < 3) return;
    const fps = p.frames / p.t;
    p.t = 0;
    p.frames = 0;
    if (fps < 30) {
      p.slow += 1;
      if (p.slow >= 3) {
        p.slow = 0;
        p.warmup = 3; // let the lighter scene settle before judging again
        tier.current += 1;
        onQuality(QUALITY_TIERS[tier.current]);
        console.info(`[perf] thinning crowd/scenery (sustained ~${fps.toFixed(0)}fps)`);
      }
    } else {
      p.slow = 0;
    }
  });
  return null;
}

/** Stock OrbitControls dolly floor. Shared with the follow handback, which
 *  temporarily lowers it: re-enabling controls with the camera at street level
 *  (~10 units out) would otherwise hit the radius clamp and teleport the view
 *  out to this distance in a single frame. */
const ORBIT_MIN_DISTANCE = 30;

// ---------------------------------------------------------------------------
// Follow camera (phase 06). When a cast member is followed, this smoothly
// chases them at street level while OrbitControls is parked; any canvas input
// or Esc releases follow (handled in CityScene's pointer/key handlers calling
// followCast(null)). The handback is jump-free: the controls target trails the
// citizen the whole time, and on release the dolly-floor clamp is softened to
// the current street-level radius and eased back to stock — OrbitControls'
// own clamp then pulls the view out gently while player input stays live.
// Pure renderer — reads positions from the shared registry, writes none.
// ---------------------------------------------------------------------------
function FollowCamera({
  followedId,
  positions,
  controlsRef,
  onLost,
}: {
  followedId: string | null;
  positions: CastPositions;
  controlsRef: React.RefObject<OrbitControlsImpl | null>;
  /** Called when a followed citizen vanishes (district culled) so we release. */
  onLost: () => void;
}) {
  // Scratch vectors reused every frame (no per-frame allocation).
  const desiredPos = useMemo(() => new Vector3(), []);
  const desiredLook = useMemo(() => new Vector3(), []);
  const lookAt = useMemo(() => new Vector3(), []);
  /** idle: orbit owns the camera. follow: we drive it. handback: orbit owns it
   *  again while we ease its dolly floor back up to stock. */
  const phase = useRef<'idle' | 'follow' | 'handback'>('idle');
  // A slowly-rotating orbit offset around the followed citizen for a lively,
  // non-locked street-level chase.
  const orbit = useRef(0);
  const lostFrames = useRef(0);
  // First frame of a new follow snaps the look target rather than lerping from
  // wherever it last sat (avoids an initial swing across the map).
  const fresh = useRef(false);

  // Park / hand back OrbitControls as follow toggles.
  useEffect(() => {
    const controls = controlsRef.current;
    if (followedId) {
      phase.current = 'follow';
      fresh.current = true;
      if (controls) controls.enabled = false;
      orbit.current = 0;
      lostFrames.current = 0;
    } else if (phase.current === 'follow') {
      if (controls) {
        // No-jump handback: the target already trails the citizen; soften the
        // radius clamp to the current (street-level) distance, then hand the
        // camera straight back. The frame loop below eases the clamp up to
        // stock, which gently dollies the view out while input works
        // immediately.
        const r = controls.object.position.distanceTo(controls.target);
        controls.minDistance = Math.min(ORBIT_MIN_DISTANCE, Math.max(1, r));
        controls.enabled = true;
        phase.current = 'handback';
      } else {
        phase.current = 'idle';
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [followedId]);

  useFrame((state, delta) => {
    const controls = controlsRef.current;
    const dt = Math.min(delta, 0.1);

    if (phase.current === 'handback') {
      // Ease the dolly floor back to stock; OrbitControls' own radius clamp
      // turns that into a smooth pull-back the player can interrupt freely.
      if (!controls) {
        phase.current = 'idle';
        return;
      }
      const eased =
        controls.minDistance +
        (ORBIT_MIN_DISTANCE - controls.minDistance) * (1 - Math.pow(0.25, dt)) +
        4 * dt;
      controls.minDistance = Math.min(ORBIT_MIN_DISTANCE, eased);
      if (controls.minDistance >= ORBIT_MIN_DISTANCE) phase.current = 'idle';
      return;
    }

    if (phase.current !== 'follow' || !followedId) return;
    const target = positions.get(followedId);
    if (!target) {
      // The citizen isn't in the world this frame — could be a transient cull.
      // Give it a moment, then release cleanly rather than freeze the camera.
      lostFrames.current += 1;
      if (lostFrames.current > 30) onLost();
      return;
    }
    lostFrames.current = 0;
    // Make sure orbit is parked even if controls mounted after follow began.
    if (controls && controls.enabled) controls.enabled = false;

    // A gentle, continuous orbit so the follow feels alive, not bolted on.
    orbit.current += dt * 0.25;
    const radius = 9;
    const height = 4.2;
    desiredLook.set(target.x, target.y + 0.7, target.z);
    desiredPos.set(
      target.x + Math.sin(orbit.current) * radius,
      target.y + height,
      target.z + Math.cos(orbit.current) * radius,
    );

    if (fresh.current) {
      // Snap onto the citizen on the first follow frame, then ease afterwards.
      fresh.current = false;
      lookAt.copy(desiredLook);
      // Don't teleport the camera body — let it glide in from its orbit pose —
      // but start the look from the citizen so the framing reads immediately.
    }

    // Critically-damped-ish lerp: smooth, never locked, frame-rate aware.
    const posK = 1 - Math.pow(0.0015, dt);
    const lookK = 1 - Math.pow(0.0008, dt);
    state.camera.position.lerp(desiredPos, posK);
    lookAt.lerp(desiredLook, lookK);
    state.camera.lookAt(lookAt);

    // Keep the parked controls' target trailing the citizen so the handback on
    // release continues from here with no snap.
    if (controls) controls.target.copy(desiredLook);
  });

  return null;
}

// ---------------------------------------------------------------------------
// Dev-only bridge for scripts/citizen-check.mjs (mirrors the window.__mmDebug
// pattern in the store): publishes the live camera position, the follow flag,
// and each bound cast member's world + projected screen position (CSS px) so
// the E2E can assert smooth street-level tracking, jump-free release, and
// click a citizen in the 3D scene deterministically. Never mounted in
// production builds; objects are reused in place (no per-frame garbage).
// ---------------------------------------------------------------------------
interface CastBridgeEntry {
  /** Projected screen position in CSS pixels + whether it's on-screen. */
  x: number;
  y: number;
  visible: boolean;
  /** World position. */
  wx: number;
  wy: number;
  wz: number;
}
interface CastBridgeState {
  cam: { x: number; y: number; z: number };
  followed: string | null;
  cast: Record<string, CastBridgeEntry>;
}

function DevCastBridge({
  followedId,
  positions,
}: {
  followedId: string | null;
  positions: CastPositions;
}) {
  const proj = useMemo(() => new Vector3(), []);

  // A manual hit-test for the E2E (and debugging): what would a click at CSS
  // pixel (px, py) hit? Reports every raycastable object along the ray so the
  // check script can verify the citizen pick sphere is actually reachable.
  const three = useThree();
  useEffect(() => {
    const w = window as unknown as {
      __mmPick?: (px: number, py: number) => unknown;
    };
    w.__mmPick = (px: number, py: number) => {
      const { scene, camera, size } = three.get();
      const ray = new Raycaster();
      ray.setFromCamera(
        new Vector2((px / size.width) * 2 - 1, -(py / size.height) * 2 + 1),
        camera,
      );
      return ray.intersectObjects(scene.children, true).slice(0, 8).map((h) => ({
        type: h.object.type,
        castPick: h.object.userData?.castPick === true,
        distance: Math.round(h.distance * 100) / 100,
        instanceId: h.instanceId ?? null,
      }));
    };
    return () => {
      delete w.__mmPick;
    };
  }, [three]);

  useFrame((state) => {
    const w = window as unknown as { __mmCitizens?: CastBridgeState };
    let b = w.__mmCitizens;
    if (!b) {
      b = { cam: { x: 0, y: 0, z: 0 }, followed: null, cast: {} };
      w.__mmCitizens = b;
    }
    b.cam.x = state.camera.position.x;
    b.cam.y = state.camera.position.y;
    b.cam.z = state.camera.position.z;
    b.followed = followedId;
    for (const [id, p] of positions) {
      let s = b.cast[id];
      if (!s) {
        s = { x: 0, y: 0, visible: false, wx: 0, wy: 0, wz: 0 };
        b.cast[id] = s;
      }
      s.wx = p.x;
      s.wy = p.y;
      s.wz = p.z;
      proj.set(p.x, p.y + 0.35, p.z).project(state.camera);
      s.x = (proj.x * 0.5 + 0.5) * state.size.width;
      s.y = (-proj.y * 0.5 + 0.5) * state.size.height;
      s.visible = proj.z < 1 && Math.abs(proj.x) <= 1 && Math.abs(proj.y) <= 1;
    }
    for (const id of Object.keys(b.cast)) {
      if (!positions.has(id)) delete b.cast[id];
    }
  });
  return null;
}

interface StaticCityProps {
  city: City;
  selectedDistrictId: string | null;
  onSelectDistrict: (id: string | null) => void;
  moodKey: keyof typeof MOOD_THEMES;
}

function StaticCity({ city, selectedDistrictId, onSelectDistrict, moodKey }: StaticCityProps) {
  const theme = MOOD_THEMES[moodKey];

  return (
    <>
      <Roads city={city} theme={theme} />
      <Districts
        city={city}
        theme={theme}
        selectedDistrictId={selectedDistrictId}
        onSelectDistrict={onSelectDistrict}
      />
    </>
  );
}

export function CityScene({ city, selectedDistrictId, onSelectDistrict, clockRate, goldenHour = false }: CitySceneProps) {
  const moodKey = city.mood as keyof typeof MOOD_THEMES;
  const theme = MOOD_THEMES[moodKey] ?? MOOD_THEMES.serene;

  // Phase 06 — notable-citizen state. GameScreen doesn't thread these through
  // (it predates the feature and is off-limits), so the scene reads the store
  // itself, the same way the UI panels do. The store is the sim/UI bridge; this
  // is pure presentation and never touches City data.
  const selectCast = useGameStore((s) => s.selectCast);
  const followedCastId = useGameStore((s) => s.followedCastId);
  const followCast = useGameStore((s) => s.followCast);

  // Adaptive crowd/scenery density, lowered by PerfGovernor when a weak GPU
  // can't hold frame rate even after PostFX has shed its heavy passes.
  const [quality, setQuality] = useState(1);

  // Shared registry the citizen layer writes cast positions into and the follow
  // camera reads from. Stable for the life of the scene; pruned by Citizens.
  const castPositions = useRef<CastPositions>(new Map()).current;
  // A handle on OrbitControls so the follow camera can park / re-seat it.
  const controlsRef = useRef<OrbitControlsImpl | null>(null);

  // Release follow on Esc (canvas pointer/wheel release is wired on the Canvas
  // element below). Guarded so it only acts while actually following.
  useEffect(() => {
    if (!followedCastId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') followCast(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [followedCastId, followCast]);

  // Any direct manipulation of the camera (drag or zoom) hands control back to
  // orbit. We only release if we're actually following so normal orbiting is
  // untouched. Pointer-down from the cast pick mesh still selects (it fires
  // onClick), but the act of starting a drag/zoom means "let me look around".
  const releaseFollowOnInput = () => {
    if (useGameStore.getState().followedCastId) followCast(null);
  };

  // City bounding box: the camera frames its center (districts spiral outward
  // from district 0, so the centroid is usually off-origin), and atmosphere
  // effects size themselves from the extent.
  const { center, extent } = useMemo(() => {
    if (city.districts.length === 0) {
      return { center: { x: 0, z: 0 }, extent: 52 };
    }
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const d of city.districts) {
      minX = Math.min(minX, d.position.x - d.radius);
      maxX = Math.max(maxX, d.position.x + d.radius);
      minZ = Math.min(minZ, d.position.z - d.radius);
      maxZ = Math.max(maxZ, d.position.z + d.radius);
    }
    return {
      center: { x: (minX + maxX) / 2, z: (minZ + maxZ) / 2 },
      extent: Math.max(40, (maxX - minX) / 2, (maxZ - minZ) / 2) + 12,
    };
  }, [city.districts]);

  // The camera orbits a point at roughly the city's ground height so the
  // framing stays centered on the diorama rather than under it.
  const targetY = useMemo(
    () => terrainHeightAt(city.terrain, center.x, center.z),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [city.seed.value, center.x, center.z],
  );

  // Reset cursor when the scene unmounts so a lingering pointer style from a
  // hovered district doesn't stick.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      document.body.style.cursor = 'auto';
    };
  }, []);

  // Default framing: a raised isometric-ish view like the reference images.
  // Sprawling late-game layouts cap the framing distance instead of pushing
  // the camera into orbit — the player can always zoom/pan out.
  const frame = Math.min(extent, 80);

  return (
    <>
    <Canvas
      shadows
      // `flat` defers tone mapping to the composer's ACES pass, so the scene
      // reaches the effects in linear HDR (bloom needs the headroom). On
      // software renderers PostFX is skipped and onCreated restores ACES at
      // the renderer instead.
      flat
      camera={{
        position: [center.x, frame * 1.05, center.z + frame * 1.35],
        fov: 42,
      }}
      // MSAA on the default framebuffer is wasted here: the scene renders into
      // the EffectComposer's render targets and FXAA smooths the final edges.
      // (On software renderers PostFX is skipped — but those are CI-only.)
      gl={{ antialias: false }}
      onCreated={({ gl }) => {
        if (isSoftwareRenderer(gl)) gl.toneMapping = ACESFilmicToneMapping;
        // We refresh the shadow map ourselves on a throttle (see ShadowThrottle)
        // instead of every frame. Render it once now so frame one has shadows.
        gl.shadowMap.autoUpdate = false;
        gl.shadowMap.needsUpdate = true;
      }}
      onPointerMissed={() => onSelectDistrict(null)}
      // Phase 06 — a drag or zoom on the canvas while following hands the camera
      // back to orbit. (Clicking a cast marker selects via its own onClick.)
      onPointerDown={releaseFollowOnInput}
      onWheel={releaseFollowOnInput}
      style={{ position: 'absolute', inset: 0 }}
    >
      <SceneFog moodKey={moodKey} extent={extent} />
      <DaylightRig theme={theme} clockRate={clockRate} initialDay={city.day} />
      <Atmosphere
        mood={city.mood}
        stats={city.stats}
        theme={theme}
        extent={extent}
        center={center}
      />
      <Terrain city={city} theme={theme} extent={extent} />
      <Scenery city={city} theme={theme} quality={quality} />
      <StaticCity
        city={city}
        selectedDistrictId={selectedDistrictId}
        onSelectDistrict={onSelectDistrict}
        moodKey={moodKey}
      />
      <Lanterns city={city} />
      <EdictProps city={city} />
      <ChimneySmoke city={city} />
      <Citizens city={city} castPositions={castPositions} onSelectCast={selectCast} quality={quality} />
      <FollowCamera
        followedId={followedCastId}
        positions={castPositions}
        controlsRef={controlsRef}
        onLost={() => followCast(null)}
      />
      {import.meta.env.DEV && (
        <DevCastBridge followedId={followedCastId} positions={castPositions} />
      )}
      <Celebration city={city} center={center} extent={extent} />
      {/* Phase 06 photo mode: golden-hour lighting override + capture probe. */}
      <GoldenHourOverride active={goldenHour} />
      <CanvasProbe />
      <OrbitControls
        ref={controlsRef}
        enablePan
        enableDamping
        dampingFactor={0.08}
        minDistance={ORBIT_MIN_DISTANCE}
        maxDistance={260}
        minPolarAngle={0.2}
        maxPolarAngle={Math.PI / 2.3}
        target={[center.x, targetY, center.z]}
      />
      <PostFX />
      <ShadowThrottle />
      <PerfGovernor onQuality={setQuality} />
    </Canvas>
    {/* Phase 06 — the bio card is a DOM overlay over the canvas (the Canvas
        can't host DOM). It reads selection/cast from the store itself. */}
    <CitizenBioCard city={city} />
    </>
  );
}
