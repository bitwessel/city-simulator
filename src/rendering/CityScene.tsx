import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { Bloom, EffectComposer, N8AO, FXAA, ToneMapping, Vignette } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import { ACESFilmicToneMapping, Color, Fog, type Scene, type WebGLRenderer } from 'three';
import type { City } from '../types';
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

export function CityScene({ city, selectedDistrictId, onSelectDistrict, clockRate }: CitySceneProps) {
  const moodKey = city.mood as keyof typeof MOOD_THEMES;
  const theme = MOOD_THEMES[moodKey] ?? MOOD_THEMES.serene;

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
      gl={{ antialias: true }}
      onCreated={({ gl }) => {
        if (isSoftwareRenderer(gl)) gl.toneMapping = ACESFilmicToneMapping;
      }}
      onPointerMissed={() => onSelectDistrict(null)}
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
      <Scenery city={city} theme={theme} />
      <StaticCity
        city={city}
        selectedDistrictId={selectedDistrictId}
        onSelectDistrict={onSelectDistrict}
        moodKey={moodKey}
      />
      <Lanterns city={city} />
      <EdictProps city={city} />
      <ChimneySmoke city={city} />
      <Citizens city={city} />
      <Celebration city={city} center={center} extent={extent} />
      <OrbitControls
        enablePan
        enableDamping
        dampingFactor={0.08}
        minDistance={30}
        maxDistance={260}
        minPolarAngle={0.2}
        maxPolarAngle={Math.PI / 2.3}
        target={[center.x, targetY, center.z]}
      />
      <PostFX />
    </Canvas>
  );
}
