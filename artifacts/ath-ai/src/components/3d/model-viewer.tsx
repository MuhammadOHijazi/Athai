import React, { Suspense, useRef } from "react";
import { Canvas, useFrame, useLoader } from "@react-three/fiber";
import { OrbitControls, Stage, Environment } from "@react-three/drei";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader";
import * as THREE from "three";

// ─── Placeholder ──────────────────────────────────────────────────────────────

function PlaceholderChair() {
  const group = useRef<THREE.Group>(null);
  useFrame((state) => {
    if (group.current) group.current.rotation.y = state.clock.elapsedTime * 0.2;
  });
  return (
    <group ref={group}>
      <mesh position={[0, 0.5, 0]} castShadow receiveShadow>
        <boxGeometry args={[1, 0.1, 1]} />
        <meshStandardMaterial color="#333" roughness={0.7} metalness={0.2} />
      </mesh>
      <mesh position={[0, 1, -0.45]} castShadow receiveShadow>
        <boxGeometry args={[1, 1, 0.1]} />
        <meshStandardMaterial color="#333" roughness={0.7} metalness={0.2} />
      </mesh>
      {[[-0.45, -0.45], [0.45, -0.45], [-0.45, 0.45], [0.45, 0.45]].map(([x, z], i) => (
        <mesh key={i} position={[x, 0.25, z]} castShadow receiveShadow>
          <cylinderGeometry args={[0.05, 0.05, 0.5]} />
          <meshStandardMaterial color="#666" roughness={0.4} metalness={0.8} />
        </mesh>
      ))}
    </group>
  );
}

// ─── GLB / GLTF model ─────────────────────────────────────────────────────────

function GltfModel({ url }: { url: string }) {
  const gltf = useLoader(GLTFLoader, url);
  return <primitive object={gltf.scene} />;
}

// ─── OBJ model ────────────────────────────────────────────────────────────────

function ObjModel({ url }: { url: string }) {
  const obj = useLoader(OBJLoader, url);
  // Apply a default material so untextured OBJ files render visibly
  obj.traverse((child) => {
    if (child instanceof THREE.Mesh && !child.material) {
      child.material = new THREE.MeshStandardMaterial({ color: "#aaa", roughness: 0.6, metalness: 0.1 });
    }
  });
  return <primitive object={obj} />;
}

// ─── Smart model loader ────────────────────────────────────────────────────────

function ModelAsset({ url }: { url: string }) {
  // Determine format from content type or URL pattern
  const isObj = url.includes("application/octet-stream") === false &&
    (url.toLowerCase().includes(".obj") ||
     url.includes("text/plain") ||
     (url.startsWith("data:") && url.slice(5, 30).includes("text")));
  return isObj ? <ObjModel url={url} /> : <GltfModel url={url} />;
}

// ─── Export ───────────────────────────────────────────────────────────────────

export function ModelViewer({ glbUrl }: { glbUrl: string | null }) {
  return (
    <div className="w-full h-full bg-[#111] rounded-lg overflow-hidden relative">
      <Canvas shadows dpr={[1, 2]} camera={{ position: [3, 2, 3], fov: 45 }}>
        <Suspense fallback={null}>
          <Environment preset="city" />
          <ambientLight intensity={0.5} />
          <directionalLight castShadow position={[5, 5, 5]} intensity={1} shadow-mapSize={[1024, 1024]} />
          <directionalLight position={[-5, 5, -5]} intensity={0.5} />
          <Stage environment="city" intensity={0.5} adjustCamera={false}>
            {glbUrl ? <ModelAsset url={glbUrl} /> : <PlaceholderChair />}
          </Stage>
          <OrbitControls
            autoRotate={!glbUrl}
            autoRotateSpeed={0.5}
            enablePan={false}
            minDistance={2}
            maxDistance={10}
            maxPolarAngle={Math.PI / 2 + 0.1}
          />
        </Suspense>
      </Canvas>
      {!glbUrl && (
        <div className="absolute bottom-4 left-0 right-0 flex justify-center pointer-events-none">
          <div className="bg-black/50 backdrop-blur-md px-4 py-2 rounded-full border border-white/10 text-xs text-white/70">
            Previewing Placeholder
          </div>
        </div>
      )}
    </div>
  );
}
