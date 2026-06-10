import { useEffect, useMemo } from 'react';
import {
  CatmullRomCurve3,
  TubeGeometry,
  Vector3,
  type BufferGeometry,
} from 'three';
import type { City } from '../types';
import { mixHex, scaleHex, type MoodTheme } from './palette';

// ---------------------------------------------------------------------------
// Roads — gently curved flat stone ribbons connecting district platforms.
//
// Geometry depends only on district positions (stable per city). We build one
// flattened tube per road, memoized by the city's seed so day ticks that only
// change stats/mood never rebuild road geometry.
// ---------------------------------------------------------------------------

const ROAD_Y = 0.06; // just above the ground plane

interface RoadsProps {
  city: City;
  theme: MoodTheme;
}

interface RoadGeo {
  key: string;
  geometry: BufferGeometry;
}

function buildRoadGeometries(city: City): RoadGeo[] {
  const byId = new Map(city.districts.map((d) => [d.id, d]));
  const out: RoadGeo[] = [];

  for (const road of city.roads) {
    const a = byId.get(road.from);
    const b = byId.get(road.to);
    if (!a || !b) continue;

    const start = new Vector3(a.position.x, ROAD_Y, a.position.z);
    const end = new Vector3(b.position.x, ROAD_Y, b.position.z);

    // Perpendicular offset for a subtle scenic curve.
    const mid = start.clone().add(end).multiplyScalar(0.5);
    const dir = end.clone().sub(start);
    const len = dir.length();
    dir.normalize();
    const perp = new Vector3(-dir.z, 0, dir.x);
    // Deterministic, small bow based on endpoints.
    const bow = ((a.position.x + b.position.z) % 7) - 3.5;
    mid.add(perp.multiplyScalar(bow * 0.06 * Math.min(len, 40) * 0.15));

    const curve = new CatmullRomCurve3([start, mid, end]);
    // Flattened tube => ribbon. radius ~1.4, then we squash Y in the mesh.
    const tubular = Math.max(8, Math.round(len / 4));
    const geo = new TubeGeometry(curve, tubular, 1.4, 5, false);
    out.push({ key: `${road.from}->${road.to}`, geometry: geo });
  }
  return out;
}

export function Roads({ city, theme }: RoadsProps) {
  // Rebuild only when the city identity (seed) or its roads/districts change.
  const roads = useMemo(
    () => buildRoadGeometries(city),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [city.seed.value, city.districts, city.roads],
  );

  // Dispose road tube buffers when the set is rebuilt (new city) / unmounts.
  useEffect(
    () => () => {
      for (const r of roads) r.geometry.dispose();
    },
    [roads],
  );

  const roadColor = useMemo(() => mixHex('#b9a884', theme.groundTint, 0.35), [theme]);
  const edgeColor = useMemo(() => scaleHex(roadColor, 0.78), [roadColor]);

  return (
    <group>
      {roads.map((r) => (
        <group key={r.key}>
          {/* slightly wider darker edge */}
          <mesh geometry={r.geometry} scale={[1, 0.02, 1.18]} position={[0, -0.005, 0]}>
            <meshStandardMaterial color={edgeColor} roughness={1} metalness={0} />
          </mesh>
          {/* main ribbon, squashed flat */}
          <mesh geometry={r.geometry} scale={[1, 0.02, 1]}>
            <meshStandardMaterial color={roadColor} roughness={1} metalness={0} />
          </mesh>
        </group>
      ))}
    </group>
  );
}
