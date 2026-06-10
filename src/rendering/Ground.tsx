import { useMemo } from 'react';
import { mixHex, scaleHex, type MoodTheme } from './palette';

// ---------------------------------------------------------------------------
// Ground — a large pleasant grass-toned plane, mood-tinted, with a darker
// outer disc beyond the city for a soft vignette / "edge of the world" feel.
// ---------------------------------------------------------------------------

interface GroundProps {
  theme: MoodTheme;
}

export function Ground({ theme }: GroundProps) {
  // A grassy base blended toward the mood ground tint.
  const grass = useMemo(() => mixHex('#5f8c4e', theme.groundTint, 0.5), [theme]);
  const outer = useMemo(() => scaleHex(grass, 0.55), [grass]);

  return (
    <group>
      {/* Far backdrop disc (darker, sits below the main plane). */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.4, 0]} receiveShadow={false}>
        <circleGeometry args={[420, 64]} />
        <meshStandardMaterial color={outer} roughness={1} metalness={0} />
      </mesh>
      {/* Main near plane the city sits on. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 0]} receiveShadow>
        <circleGeometry args={[150, 64]} />
        <meshStandardMaterial color={grass} roughness={1} metalness={0} />
      </mesh>
      {/* Soft brighter inner patch where the districts cluster. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow>
        <circleGeometry args={[78, 48]} />
        <meshStandardMaterial
          color={scaleHex(grass, 1.12)}
          roughness={1}
          metalness={0}
          transparent
          opacity={0.55}
        />
      </mesh>
    </group>
  );
}
