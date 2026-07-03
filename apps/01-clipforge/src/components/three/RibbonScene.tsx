"use client";

/**
 * "The Ribbon" — ClipForge's signature 3D moment (DESIGN.md).
 * A continuous film strip flows in a lazy S-curve through the dark; a cyan
 * laser scanline sweeps it, and floating 9:16 shards drift around it.
 *
 * Pure three + @react-three/fiber (no drei). ~2k triangles, one shader,
 * capped DPR — comfortably 60fps. A poster fallback is rendered by the parent.
 */

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

/** Build a flat ribbon geometry that follows a 3D curve (Frenet frames). */
function useRibbonGeometry() {
  return useMemo(() => {
    const curve = new THREE.CatmullRomCurve3(
      [
        new THREE.Vector3(-6.5, -2.4, -1.5),
        new THREE.Vector3(-3.2, 1.4, 0.8),
        new THREE.Vector3(-0.2, -1.2, -0.6),
        new THREE.Vector3(2.8, 1.8, 0.9),
        new THREE.Vector3(6.4, -0.6, -1.2),
      ],
      false,
      "catmullrom",
      0.5,
    );

    const segments = 220;
    const halfWidth = 0.62;
    const frames = curve.computeFrenetFrames(segments, false);
    const positions: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];

    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const p = curve.getPointAt(t);
      const n = frames.binormals[i];
      const left = p.clone().addScaledVector(n, halfWidth);
      const right = p.clone().addScaledVector(n, -halfWidth);
      positions.push(left.x, left.y, left.z, right.x, right.y, right.z);
      uvs.push(t, 0, t, 1);
      if (i < segments) {
        const a = i * 2;
        indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return geo;
  }, []);
}

const ribbonVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const ribbonFragment = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform float uTime;
  uniform float uScan;      // 0..1 laser position along the strip
  uniform vec3 uBrand;      // violet
  uniform vec3 uBrand2;     // lavender
  uniform vec3 uAccent;     // cyan

  void main() {
    // Base emissive gradient violet -> lavender along the strip length.
    vec3 base = mix(uBrand, uBrand2, smoothstep(0.0, 1.0, vUv.x));

    // Film frames: repeating bright cells with dark separators along length.
    float cells = fract(vUv.x * 46.0);
    float frame = smoothstep(0.06, 0.12, cells) * smoothstep(0.06, 0.12, 1.0 - cells);

    // Sprocket holes along both edges.
    float edge = step(vUv.y, 0.12) + step(0.88, vUv.y);
    float holes = fract(vUv.x * 92.0);
    float sprocket = edge * step(0.5, holes);
    float perf = mix(1.0, 0.15, sprocket);

    // Emissive frame content, brighter toward center band.
    float band = smoothstep(0.5, 0.16, abs(vUv.y - 0.5));
    vec3 col = base * (0.28 + 0.9 * frame * band);

    // Cyan laser scanline sweep with soft glow; cleave-brighten at the edge.
    float d = abs(vUv.x - uScan);
    float laser = smoothstep(0.045, 0.0, d);
    float glow = smoothstep(0.16, 0.0, d) * 0.5;
    col += uAccent * (laser * 1.6 + glow);

    // Subtle scroll of light along the strip.
    col += uAccent * 0.05 * sin(vUv.x * 40.0 - uTime * 2.0) * band;

    float alpha = perf * (0.35 + 0.65 * band);
    gl_FragColor = vec4(col, alpha);
  }
`;

function Ribbon() {
  const geo = useRibbonGeometry();
  const groupRef = useRef<THREE.Group>(null);

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: ribbonVertex,
        fragmentShader: ribbonFragment,
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: {
          uTime: { value: 0 },
          uScan: { value: 0 },
          uBrand: { value: new THREE.Color("#6d5efc") },
          uBrand2: { value: new THREE.Color("#a78bfa") },
          uAccent: { value: new THREE.Color("#22d3ee") },
        },
      }),
    [],
  );

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    material.uniforms.uTime.value = t;
    // Laser sweeps left→right every ~6s, then resets (the cleave rhythm).
    material.uniforms.uScan.value = (t % 6) / 6;
    if (groupRef.current) {
      // Idle drift.
      groupRef.current.rotation.z = Math.sin(t * 0.15) * 0.04;
      groupRef.current.rotation.y = Math.sin(t * 0.1) * 0.08;
    }
  });

  return (
    <group ref={groupRef}>
      <mesh geometry={geo} material={material} />
    </group>
  );
}

/** Floating 9:16 shards that drift and rotate to face camera (cleaved clips). */
function Shards() {
  const ref = useRef<THREE.Group>(null);
  const shards = useMemo(
    () =>
      Array.from({ length: 5 }, (_, i) => ({
        pos: new THREE.Vector3(
          -4 + i * 2 + (i % 2 === 0 ? 0.4 : -0.4),
          (i % 2 === 0 ? 1 : -1) * (1.1 + (i % 3) * 0.3),
          0.6 + (i % 2) * 0.5,
        ),
        speed: 0.4 + i * 0.12,
        phase: i * 1.3,
      })),
    [],
  );

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (!ref.current) return;
    ref.current.children.forEach((child, i) => {
      const s = shards[i];
      child.position.y = s.pos.y + Math.sin(t * s.speed + s.phase) * 0.18;
      child.rotation.y = Math.sin(t * 0.3 + s.phase) * 0.35;
      child.rotation.z = Math.cos(t * 0.2 + s.phase) * 0.06;
    });
  });

  return (
    <group ref={ref}>
      {shards.map((s, i) => (
        <group key={i} position={s.pos}>
          <mesh>
            <planeGeometry args={[0.62, 1.1]} />
            <meshBasicMaterial
              color={i % 2 === 0 ? "#1a2234" : "#141b2c"}
              transparent
              opacity={0.92}
            />
          </mesh>
          {/* caption bars */}
          <mesh position={[0, -0.34, 0.01]}>
            <planeGeometry args={[0.42, 0.07]} />
            <meshBasicMaterial color="#22d3ee" transparent opacity={0.85} />
          </mesh>
          <mesh position={[-0.06, -0.44, 0.01]}>
            <planeGeometry args={[0.3, 0.05]} />
            <meshBasicMaterial color="#a78bfa" transparent opacity={0.7} />
          </mesh>
          {/* frame edge glow */}
          <mesh position={[0, 0, -0.01]}>
            <planeGeometry args={[0.7, 1.18]} />
            <meshBasicMaterial color="#6d5efc" transparent opacity={0.12} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function ParallaxRig() {
  const { camera } = useThree();
  useFrame((state) => {
    // Gentle mouse parallax (clamped).
    const x = state.pointer.x * 0.4;
    const y = state.pointer.y * 0.25;
    camera.position.x += (x - camera.position.x) * 0.04;
    camera.position.y += (y - camera.position.y) * 0.04;
    camera.lookAt(0, 0, 0);
  });
  return null;
}

export default function RibbonScene() {
  return (
    <Canvas
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      camera={{ position: [0, 0, 8], fov: 42 }}
      style={{ background: "transparent" }}
    >
      <color attach="background" args={["#0b0f17"]} />
      <fog attach="fog" args={["#0b0f17", 9, 16]} />
      <Ribbon />
      <Shards />
      <ParallaxRig />
    </Canvas>
  );
}
