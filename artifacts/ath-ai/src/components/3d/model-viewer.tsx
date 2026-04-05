import React, { Suspense, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Stage, useGLTF, Environment } from "@react-three/drei";
import * as THREE from "three";

// A sophisticated placeholder geometry for when there's no GLB URL
function PlaceholderChair() {
  const group = useRef<THREE.Group>(null);
  
  useFrame((state) => {
    if (group.current) {
      group.current.rotation.y = state.clock.elapsedTime * 0.2;
    }
  });

  return (
    <group ref={group}>
      {/* Seat */}
      <mesh position={[0, 0.5, 0]} castShadow receiveShadow>
        <boxGeometry args={[1, 0.1, 1]} />
        <meshStandardMaterial color="#333" roughness={0.7} metalness={0.2} />
      </mesh>
      
      {/* Backrest */}
      <mesh position={[0, 1, -0.45]} castShadow receiveShadow>
        <boxGeometry args={[1, 1, 0.1]} />
        <meshStandardMaterial color="#333" roughness={0.7} metalness={0.2} />
      </mesh>
      
      {/* Legs */}
      <mesh position={[-0.45, 0.25, -0.45]} castShadow receiveShadow>
        <cylinderGeometry args={[0.05, 0.05, 0.5]} />
        <meshStandardMaterial color="#666" roughness={0.4} metalness={0.8} />
      </mesh>
      <mesh position={[0.45, 0.25, -0.45]} castShadow receiveShadow>
        <cylinderGeometry args={[0.05, 0.05, 0.5]} />
        <meshStandardMaterial color="#666" roughness={0.4} metalness={0.8} />
      </mesh>
      <mesh position={[-0.45, 0.25, 0.45]} castShadow receiveShadow>
        <cylinderGeometry args={[0.05, 0.05, 0.5]} />
        <meshStandardMaterial color="#666" roughness={0.4} metalness={0.8} />
      </mesh>
      <mesh position={[0.45, 0.25, 0.45]} castShadow receiveShadow>
        <cylinderGeometry args={[0.05, 0.05, 0.5]} />
        <meshStandardMaterial color="#666" roughness={0.4} metalness={0.8} />
      </mesh>
    </group>
  );
}

function Model({ url }: { url: string }) {
  const { scene } = useGLTF(url);
  return <primitive object={scene} />;
}

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
            {glbUrl ? <Model url={glbUrl} /> : <PlaceholderChair />}
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
