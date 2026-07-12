import { forwardRef, useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useReducedMotion } from './useReducedMotion'

interface WeaponProps {
  trail?: boolean
  heavy?: boolean
  surge?: boolean
}

export const Weapon = forwardRef<THREE.Group, WeaponProps>(function Weapon(
  { trail = false, heavy = false, surge = false },
  forwardedRef
) {
  const localRef = useRef<THREE.Group>(null)
  const glow = useRef<THREE.MeshStandardMaterial>(null)
  const trailMaterial = useRef<THREE.MeshBasicMaterial>(null)
  const reducedMotion = useReducedMotion()

  useEffect(() => {
    if (typeof forwardedRef === 'function') forwardedRef(localRef.current)
    else if (forwardedRef) forwardedRef.current = localRef.current
  }, [forwardedRef])

  useFrame(({ clock }) => {
    const pulse = reducedMotion ? 0.92 : 0.82 + Math.sin(clock.elapsedTime * (surge ? 10 : 4)) * 0.16
    if (glow.current) glow.current.emissiveIntensity = (surge ? 3.8 : 2.15) * pulse
    if (trailMaterial.current) {
      const target = trail ? (heavy ? 0.4 : 0.25) : 0
      trailMaterial.current.opacity = THREE.MathUtils.lerp(trailMaterial.current.opacity, target, 0.24)
    }
  })

  return (
    <group ref={localRef}>
      <mesh position={[0, -0.18, 0]} castShadow>
        <cylinderGeometry args={[0.09, 0.105, 0.42, 6]} />
        <meshStandardMaterial color="#171b18" roughness={0.78} metalness={0.45} />
      </mesh>
      <mesh position={[0, -0.42, 0]} castShadow>
        <cylinderGeometry args={[0.13, 0.13, 0.11, 6]} />
        <meshStandardMaterial color="#090b0a" metalness={0.72} roughness={0.38} />
      </mesh>
      <mesh position={[0, 0.58, 0]} castShadow>
        <boxGeometry args={[0.3, 1.22, 0.3]} />
        <meshStandardMaterial
          ref={glow}
          color="#7dff48"
          emissive="#4fd526"
          emissiveIntensity={2.2}
          roughness={0.28}
          metalness={0.22}
          toneMapped={false}
        />
      </mesh>
      <mesh position={[0, -0.16, 0]} castShadow>
        <cylinderGeometry args={[0.032, 0.032, 0.38, 5]} />
        <meshStandardMaterial color="#7dff48" emissive="#7dff48" emissiveIntensity={2.8} toneMapped={false} />
      </mesh>
      <mesh position={[0, 1.39, 0]} castShadow>
        <cylinderGeometry args={[0.032, 0.032, 0.4, 5]} />
        <meshStandardMaterial color="#7dff48" emissive="#7dff48" emissiveIntensity={2.8} toneMapped={false} />
      </mesh>
      <mesh position={[0, 0.58, -0.13]} scale={[heavy ? 2.9 : 2.1, heavy ? 1.45 : 1.2, 1]}>
        <boxGeometry args={[0.22, 1.6, 0.025]} />
        <meshBasicMaterial
          ref={trailMaterial}
          color="#7dff48"
          transparent
          opacity={0}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </mesh>
      {surge && (
        <pointLight position={[0, 0.62, 0]} color="#7dff48" intensity={1.4} distance={4.2} decay={2} />
      )}
    </group>
  )
})

export default Weapon
