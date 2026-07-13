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
const BODY_RIB_GEOMETRY = new RoundedBoxGeometry(0.038, 1.06, 0.034, 1, 0.009)
const END_CAP_GEOMETRY = new RoundedBoxGeometry(0.375, 0.105, 0.335, 1, 0.026)
const CAP_INSET_GEOMETRY = new THREE.CylinderGeometry(0.072, 0.087, 0.055, 8)
const GRIP_GEOMETRY = new THREE.CylinderGeometry(0.09, 0.105, 0.46, 7)
const GRIP_STOP_GEOMETRY = new THREE.CylinderGeometry(0.135, 0.11, 0.085, 8)
const POMMEL_GEOMETRY = new THREE.CylinderGeometry(0.135, 0.115, 0.12, 7)
const WICK_GEOMETRY = new THREE.CylinderGeometry(0.027, 0.027, 0.42, 6)
const LOWER_WICK_GEOMETRY = new THREE.CylinderGeometry(0.027, 0.027, 0.18, 6)
const GRIP_RING_GEOMETRY = new THREE.TorusGeometry(0.1, 0.018, 4, 7)
const WEAR_CHIP_GEOMETRY = (() => {
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    -0.5, -0.46, 0,
    0.42, -0.3, 0,
    0.2, 0.5, 0,
    -0.34, 0.25, 0
  ], 3))
  geometry.setIndex([0, 1, 2, 0, 2, 3])
  geometry.computeVertexNormals()
  return geometry
})()

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
      color: '#1d3820',
      roughness: 0.58,
      metalness: 0.38,
      flatShading: true
    }),
    edgeHighlight: new THREE.MeshStandardMaterial({
      color: '#62bd38',
      emissive: '#214f1c',
      emissiveIntensity: 0.34,
      roughness: 0.48,
      metalness: 0.24,
      flatShading: true
    }),
    rearFace: new THREE.MeshStandardMaterial({
      color: '#3f832b',
      emissive: '#225a1d',
      emissiveIntensity: 0.34,
      roughness: 0.52,
      metalness: 0.16,
      flatShading: true
    }),
    grip: new THREE.MeshStandardMaterial({
      color: '#2b2d2b',
      roughness: 0.86,
      metalness: 0.2,
      flatShading: true
    }),
    gripBand: new THREE.MeshStandardMaterial({
      color: '#604080',
      roughness: 0.62,
      metalness: 0.3,
      flatShading: true
    }),
    wickSocket: new THREE.MeshStandardMaterial({
      color: '#17221a',
      roughness: 0.44,
      metalness: 0.62,
      flatShading: true
    }),
    wick: new THREE.MeshStandardMaterial({
      color: '#7ed94d',
      emissive: '#3c9d28',
      emissiveIntensity: 1.15,
      roughness: 0.46,
      toneMapped: false,
      flatShading: true
    }),
    wear: new THREE.MeshStandardMaterial({
      color: '#17351e',
      roughness: 0.94,
      metalness: 0.05,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      flatShading: true
    }),
    scrape: new THREE.MeshStandardMaterial({
      color: '#8bbd62',
      roughness: 0.72,
      metalness: 0.18,
      polygonOffset: true,
      polygonOffsetFactor: -2,
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
    if (bodyMaterial.current) bodyMaterial.current.emissiveIntensity = (surge ? 1.34 : 0.36) * pulse
    if (coreMaterial.current) coreMaterial.current.emissiveIntensity = (surge ? 2.25 : 0.82) * pulse

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
    <group ref={localRef} name="paperbane-candlestick" dispose={null}>
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
          color="#438e2b"
          emissive="#286f20"
          emissiveIntensity={0.36}
          roughness={0.54}
          metalness={0.2}
          flatShading
        />
      </mesh>
      {[0.145, -0.145].flatMap((x) => [0.126, -0.126].map((z) => (
        <mesh
          key={`${x}-${z}`}
          geometry={BODY_RIB_GEOMETRY}
          position={[x, 0.72, z]}
          castShadow
          material={staticMaterials.edgeHighlight}
        />
      )))}
      {[0.105, 1.335].map((y, index) => (
        <group key={y} position={[0, y, 0]}>
          <mesh geometry={END_CAP_GEOMETRY} castShadow material={index === 0 ? staticMaterials.edge : staticMaterials.edgeHighlight} />
          <mesh
            geometry={CAP_INSET_GEOMETRY}
            position={[0, index === 0 ? -0.075 : 0.075, 0]}
            material={staticMaterials.wickSocket}
          />
        </group>
      ))}
      <mesh geometry={BODY_INSET_GEOMETRY} position={[0, 0.72, 0.164]}>
        <meshStandardMaterial
          ref={coreMaterial}
          color="#65bd38"
          emissive="#49bd2b"
          emissiveIntensity={0.82}
          roughness={0.36}
          metalness={0.08}
          flatShading
        />
      </mesh>
      <mesh
        geometry={BODY_INSET_GEOMETRY}
        position={[0, 0.72, -0.164]}
        rotation={[0, Math.PI, 0]}
        material={staticMaterials.rearFace}
      />
      {[
        { position: [-0.075, 0.47, 0.178] as [number, number, number], scale: [0.09, 0.16, 1] as [number, number, number], rotation: -0.34, material: staticMaterials.wear },
        { position: [0.08, 0.91, 0.178] as [number, number, number], scale: [0.055, 0.1, 1] as [number, number, number], rotation: 0.48, material: staticMaterials.wear },
        { position: [-0.02, 1.16, 0.179] as [number, number, number], scale: [0.035, 0.11, 1] as [number, number, number], rotation: -0.14, material: staticMaterials.scrape },
        { position: [0.07, 0.55, -0.178] as [number, number, number], scale: [0.06, 0.13, 1] as [number, number, number], rotation: Math.PI + 0.27, material: staticMaterials.wear }
      ].map((chip, index) => (
        <mesh
          key={`wear-${index}`}
          geometry={WEAR_CHIP_GEOMETRY}
          position={chip.position}
          rotation={[0, chip.position[2] < 0 ? Math.PI : 0, chip.rotation]}
          scale={chip.scale}
          material={chip.material}
        />
      ))}
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
