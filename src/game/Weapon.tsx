import { forwardRef, type MutableRefObject, useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { useReducedMotion } from './useReducedMotion'
import {
  getPlayerAnimationProgress,
  isNormalizedWindowActive,
  PLAYER_ANIMATION_TIMING
} from './PlayerAnimationConfig'

interface WeaponProps {
  trail?: boolean
  heavy?: boolean
  surge?: boolean
  /** Optional action clock used to keep the trail inside the combat hit window. */
  actionTime?: MutableRefObject<number>
}

const BODY_GEOMETRY = new RoundedBoxGeometry(0.34, 1.28, 0.3, 2, 0.045)
const BODY_INSET_GEOMETRY = new RoundedBoxGeometry(0.2, 1.08, 0.025, 1, 0.012)
const GRIP_GEOMETRY = new THREE.CylinderGeometry(0.09, 0.105, 0.46, 7)
const GRIP_STOP_GEOMETRY = new THREE.CylinderGeometry(0.135, 0.11, 0.085, 8)
const POMMEL_GEOMETRY = new THREE.CylinderGeometry(0.135, 0.115, 0.12, 7)
const WICK_GEOMETRY = new THREE.CylinderGeometry(0.027, 0.027, 0.42, 6)
const LOWER_WICK_GEOMETRY = new THREE.CylinderGeometry(0.027, 0.027, 0.18, 6)
const GRIP_RING_GEOMETRY = new THREE.TorusGeometry(0.1, 0.018, 4, 7)

const makeTrailGeometry = (depth: number) => {
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    -0.02, -0.05, depth,
    -0.02, 1.48, depth,
    -0.74, 1.18, depth,
    -0.48, 0.17, depth
  ], 3))
  geometry.setIndex([0, 1, 2, 0, 2, 3])
  geometry.computeVertexNormals()
  return geometry
}

const TRAIL_GEOMETRY = makeTrailGeometry(-0.17)
const TRAIL_CROSS_GEOMETRY = makeTrailGeometry(0)

export const Weapon = forwardRef<THREE.Group, WeaponProps>(function Weapon(
  { trail = false, heavy = false, surge = false, actionTime },
  forwardedRef
) {
  const localRef = useRef<THREE.Group>(null)
  const bodyMaterial = useRef<THREE.MeshStandardMaterial>(null)
  const coreMaterial = useRef<THREE.MeshStandardMaterial>(null)
  const trailMaterial = useRef<THREE.MeshBasicMaterial>(null)
  const trailCrossMaterial = useRef<THREE.MeshBasicMaterial>(null)
  const reducedMotion = useReducedMotion()

  const staticMaterials = useMemo(() => ({
    edge: new THREE.MeshStandardMaterial({
      color: '#244a22',
      roughness: 0.52,
      metalness: 0.32,
      flatShading: true
    }),
    rearFace: new THREE.MeshStandardMaterial({
      color: '#4c9d30',
      emissive: '#2f791f',
      emissiveIntensity: 0.58,
      roughness: 0.4,
      metalness: 0.12,
      flatShading: true
    }),
    grip: new THREE.MeshStandardMaterial({
      color: '#2b2d2b',
      roughness: 0.86,
      metalness: 0.2,
      flatShading: true
    }),
    gripBand: new THREE.MeshStandardMaterial({
      color: '#7541a6',
      roughness: 0.55,
      metalness: 0.38,
      flatShading: true
    }),
    wick: new THREE.MeshStandardMaterial({
      color: '#a0ff68',
      emissive: '#55d72f',
      emissiveIntensity: 2.4,
      roughness: 0.38,
      toneMapped: false,
      flatShading: true
    })
  }), [])

  useEffect(() => {
    if (typeof forwardedRef === 'function') forwardedRef(localRef.current)
    else if (forwardedRef) forwardedRef.current = localRef.current
  }, [forwardedRef])

  useEffect(() => () => {
    Object.values(staticMaterials).forEach((material) => material.dispose())
  }, [staticMaterials])

  useFrame(({ clock }, delta) => {
    const pulse = reducedMotion ? 0.92 : 0.84 + Math.sin(clock.elapsedTime * (surge ? 10 : 4.5)) * 0.14
    if (bodyMaterial.current) bodyMaterial.current.emissiveIntensity = (surge ? 1.85 : 0.78) * pulse
    if (coreMaterial.current) coreMaterial.current.emissiveIntensity = (surge ? 2.8 : 1.35) * pulse

    const timeline = heavy ? 'OVERHEAD_STRIKE' : 'LIGHT_ATTACK'
    const speed = surge ? 1.18 : 1
    const fallbackElapsed = PLAYER_ANIMATION_TIMING[timeline].duration * 0.5 / speed
    const progress = getPlayerAnimationProgress(timeline, actionTime?.current ?? fallbackElapsed, speed)
    const active = trail && isNormalizedWindowActive(progress, PLAYER_ANIMATION_TIMING[timeline].events.trail)
    const target = active ? (heavy ? 0.44 : 0.3) : 0
    const targetCross = active ? (heavy ? 0.22 : 0.12) : 0
    const response = 1 - Math.exp(-(active ? 30 : 18) * delta)
    if (trailMaterial.current) {
      trailMaterial.current.opacity = THREE.MathUtils.lerp(trailMaterial.current.opacity, target, response)
    }
    if (trailCrossMaterial.current) {
      trailCrossMaterial.current.opacity = THREE.MathUtils.lerp(trailCrossMaterial.current.opacity, targetCross, response)
    }
  })

  return (
    <group ref={localRef} dispose={null}>
      <mesh geometry={GRIP_GEOMETRY} position={[0, -0.12, 0]} castShadow material={staticMaterials.grip} />
      <mesh geometry={GRIP_STOP_GEOMETRY} position={[0, 0.12, 0]} castShadow material={staticMaterials.edge} />
      {[-0.25, -0.13, -0.01].map((y, index) => (
        <mesh
          key={y}
          geometry={GRIP_RING_GEOMETRY}
          position={[0, y, 0]}
          rotation={[Math.PI / 2, 0, index % 2 === 0 ? 0.1 : -0.1]}
          material={staticMaterials.gripBand}
        />
      ))}
      <mesh geometry={POMMEL_GEOMETRY} position={[0, -0.39, 0]} castShadow material={staticMaterials.edge} />
      <mesh geometry={BODY_GEOMETRY} position={[0, 0.72, 0]} castShadow>
        <meshStandardMaterial
          ref={bodyMaterial}
          color="#4aa927"
          emissive="#43bd26"
          emissiveIntensity={0.78}
          roughness={0.46}
          metalness={0.18}
          flatShading
        />
      </mesh>
      <mesh geometry={BODY_INSET_GEOMETRY} position={[0, 0.72, 0.164]}>
        <meshStandardMaterial
          ref={coreMaterial}
          color="#72d83e"
          emissive="#63ee37"
          emissiveIntensity={1.35}
          roughness={0.25}
        />
      </mesh>
      <mesh
        geometry={BODY_INSET_GEOMETRY}
        position={[0, 0.72, -0.164]}
        rotation={[0, Math.PI, 0]}
        material={staticMaterials.rearFace}
      />
      <mesh geometry={LOWER_WICK_GEOMETRY} position={[0, -0.54, 0]} castShadow material={staticMaterials.wick} />
      <mesh geometry={WICK_GEOMETRY} position={[0, 1.57, 0]} castShadow material={staticMaterials.wick} />
      <mesh geometry={TRAIL_GEOMETRY} scale={heavy ? [1.25, 1.1, 1] : [1, 1, 1]}>
        <meshBasicMaterial
          ref={trailMaterial}
          color="#72ff45"
          transparent
          opacity={0}
          depthWrite={false}
          side={THREE.DoubleSide}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </mesh>
      <mesh
        geometry={TRAIL_CROSS_GEOMETRY}
        rotation={[0, Math.PI / 2, 0]}
        scale={heavy ? [1.08, 1.1, 1.25] : [0.82, 1, 1]}
      >
        <meshBasicMaterial
          ref={trailCrossMaterial}
          color="#b4ff79"
          transparent
          opacity={0}
          depthWrite={false}
          side={THREE.DoubleSide}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </mesh>
      {surge && (
        <pointLight position={[0, 0.75, 0]} color="#76ff45" intensity={1.15} distance={3.6} decay={2} />
      )}
    </group>
  )
})

export default Weapon
