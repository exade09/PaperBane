import { type MutableRefObject, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { EnemyKind, GAME_CONFIG } from './GameConfig'
import { useGameStore } from './GameState'
import { type CombatTarget, type HitPayload, useCombatSystem } from './CombatSystem'
import { decideEnemyState, type EnemyState, faceDirection, separationForce } from './EnemyAI'
import { hasLineOfSight, resolveWorldMovement, type WorldBox } from './WorldCollision'

interface EnemyProps {
  id: string
  kind: EnemyKind
  spawn: [number, number, number]
  active: boolean
  playerPosition: MutableRefObject<THREE.Vector3>
  extraColliders: WorldBox[]
  onDeath?: (id: string) => void
}

interface EnemyModelProps {
  kind: EnemyKind
  state: EnemyState
  stateTime: MutableRefObject<number>
  flash: boolean
}

const damp = (value: number, target: number, delta: number, speed = 13) =>
  THREE.MathUtils.lerp(value, target, 1 - Math.exp(-speed * delta))

const ease = (value: number) => value * value * (3 - 2 * value)

const stagedValue = (
  progress: number,
  rest: number,
  windup: number,
  strike: number,
  windupEnd: number,
  strikeEnd: number
) => {
  if (progress <= windupEnd) return THREE.MathUtils.lerp(rest, windup, ease(progress / windupEnd))
  if (progress <= strikeEnd) {
    return THREE.MathUtils.lerp(windup, strike, ease((progress - windupEnd) / (strikeEnd - windupEnd)))
  }
  return THREE.MathUtils.lerp(strike, rest, ease((progress - strikeEnd) / (1 - strikeEnd)))
}

const TORSO_GEOMETRY = new THREE.CylinderGeometry(0.52, 0.43, 0.94, 7, 2)
const LIMB_GEOMETRY = new THREE.CapsuleGeometry(0.34, 0.32, 2, 6)
const JOINT_GEOMETRY = new THREE.DodecahedronGeometry(0.5, 0)
const HEAD_GEOMETRY = new THREE.IcosahedronGeometry(0.5, 1)
const JAW_GEOMETRY = new THREE.DodecahedronGeometry(0.5, 0)
const HAND_GEOMETRY = new THREE.IcosahedronGeometry(0.5, 0)
const FINGER_GEOMETRY = new THREE.CapsuleGeometry(0.035, 0.15, 2, 5)
const NOSE_GEOMETRY = new THREE.ConeGeometry(0.055, 0.17, 5)
const EYE_GEOMETRY = new THREE.SphereGeometry(0.5, 7, 4)
const HAIR_GEOMETRY = new THREE.TetrahedronGeometry(0.5, 0)
const PATCH_GEOMETRY = new THREE.CircleGeometry(0.5, 5)
const TEAR_GEOMETRY = new THREE.CircleGeometry(0.5, 3)
const SHIRT_GRAPHIC_GEOMETRY = new THREE.PlaneGeometry(0.62, 0.7)
const SHOE_GEOMETRY = new RoundedBoxGeometry(0.37, 0.2, 0.55, 1, 0.045)
const SOLE_GEOMETRY = new RoundedBoxGeometry(0.4, 0.065, 0.58, 1, 0.02)
const SLEEVE_GEOMETRY = new THREE.CylinderGeometry(0.17, 0.145, 0.34, 7)
const LINE_GEOMETRY = new THREE.CapsuleGeometry(0.03, 0.45, 2, 5)
const CHAIN_GEOMETRY = new THREE.TorusGeometry(0.055, 0.012, 4, 7)

const ENEMY_HAIR = [
  { p: [-0.19, 0.28, 0.02], s: [0.28, 0.29, 0.28], r: [0.4, 0.1, -0.25] },
  { p: [0.02, 0.32, 0], s: [0.32, 0.3, 0.32], r: [0.2, 0.45, 0.08] },
  { p: [0.21, 0.26, 0.01], s: [0.28, 0.27, 0.28], r: [0.25, -0.3, 0.22] },
  { p: [-0.29, 0.12, 0.02], s: [0.23, 0.3, 0.26], r: [-0.15, 0.2, -0.4] },
  { p: [0.29, 0.12, 0.01], s: [0.23, 0.29, 0.25], r: [0.08, -0.2, 0.38] },
  { p: [-0.15, 0.18, 0.25], s: [0.22, 0.35, 0.2], r: [-0.3, 0.25, -0.15] },
  { p: [0.08, 0.21, 0.27], s: [0.25, 0.37, 0.2], r: [-0.38, -0.2, 0.12] },
  { p: [0.24, 0.12, 0.21], s: [0.18, 0.31, 0.18], r: [-0.25, 0.2, 0.25] }
] as const

const createPaperHandTexture = (kind: EnemyKind, rear: boolean) => {
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  canvas.width = 320
  canvas.height = 384
  const context = canvas.getContext('2d')
  if (!context) return null

  context.fillStyle = kind === 'runner' ? '#242326' : '#2c2b27'
  context.fillRect(0, 0, 320, 384)
  context.fillStyle = 'rgba(116, 93, 71, .24)'
  for (let index = 0; index < 40; index += 1) {
    const x = (index * 83 + 17) % 310
    const y = (index * 61 + 29) % 374
    const size = 4 + (index % 6) * 4
    context.beginPath()
    context.moveTo(x, y)
    context.lineTo(x + size, y + (index % 3) * 3)
    context.lineTo(x + size * 0.45, y + size * 1.4)
    context.lineTo(x - 2, y + size * 0.6)
    context.fill()
  }

  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillStyle = '#c7c0ad'
  if (rear) {
    context.font = '700 27px Arial, sans-serif'
    context.fillText('PUMP.FUN', 160, 278)
    context.fillText('SOLANA', 160, 315)
  } else {
    context.font = '900 58px Arial Black, Arial, sans-serif'
    context.fillText('PAPER', 160, 120)
    context.fillText('HAND', 160, 185)
  }

  context.save()
  context.translate(160, rear ? 126 : 275)
  context.rotate(-0.58)
  context.fillStyle = '#d6d3c6'
  context.beginPath()
  context.roundRect(-51, -22, 102, 44, 21)
  context.fill()
  context.fillStyle = '#4a9d68'
  context.beginPath()
  context.roundRect(-51, -22, 54, 44, [21, 0, 0, 21])
  context.fill()
  context.fillStyle = 'rgba(23, 27, 25, .65)'
  context.fillRect(-3, -22, 6, 44)
  context.restore()

  context.fillStyle = 'rgba(31, 27, 24, .42)'
  for (let index = 0; index < 14; index += 1) {
    const x = (index * 97 + 11) % 300
    const y = (index * 47 + 23) % 360
    context.fillRect(x, y, 7 + index % 4 * 4, 3 + index % 3)
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  return texture
}

const shirtTextureCache = new Map<string, THREE.CanvasTexture | null>()

const getPaperHandTexture = (kind: EnemyKind, rear: boolean) => {
  const key = `${kind}-${rear ? 'rear' : 'front'}`
  if (!shirtTextureCache.has(key)) shirtTextureCache.set(key, createPaperHandTexture(kind, rear))
  return shirtTextureCache.get(key) ?? null
}

function ZombieHand({ material, mirror = false }: { material: THREE.Material; mirror?: boolean }) {
  return (
    <group>
      <mesh geometry={HAND_GEOMETRY} scale={[0.2, 0.24, 0.16]} material={material} castShadow />
      {[-0.095, -0.032, 0.032, 0.095].map((x, index) => (
        <mesh
          key={x}
          geometry={FINGER_GEOMETRY}
          position={[x, -0.19 - Math.abs(index - 1.5) * 0.012, 0.03 + Math.abs(index - 1.5) * 0.015]}
          rotation={[0.22 + index * 0.06, 0, (mirror ? -1 : 1) * (x * 2.7)]}
          scale={[0.74, 0.84 + (index % 2) * 0.16, 0.74]}
          material={material}
          castShadow
        />
      ))}
    </group>
  )
}

function EnemyModel({ kind, state, stateTime, flash }: EnemyModelProps) {
  const root = useRef<THREE.Group>(null)
  const torso = useRef<THREE.Group>(null)
  const head = useRef<THREE.Group>(null)
  const leftArm = useRef<THREE.Group>(null)
  const rightArm = useRef<THREE.Group>(null)
  const leftForearm = useRef<THREE.Group>(null)
  const rightForearm = useRef<THREE.Group>(null)
  const leftLeg = useRef<THREE.Group>(null)
  const rightLeg = useRef<THREE.Group>(null)
  const leftShin = useRef<THREE.Group>(null)
  const rightShin = useRef<THREE.Group>(null)
  const leftFoot = useRef<THREE.Group>(null)
  const rightFoot = useRef<THREE.Group>(null)

  const textures = useMemo(() => ({
    front: getPaperHandTexture(kind, false),
    rear: getPaperHandTexture(kind, true)
  }), [kind])
  const materials = useMemo(() => ({
    shirt: new THREE.MeshStandardMaterial({
      color: kind === 'runner' ? '#272529' : '#302f2b',
      emissive: '#a34444',
      emissiveIntensity: 0,
      roughness: 1,
      flatShading: true
    }),
    frontGraphic: new THREE.MeshStandardMaterial({ map: textures.front, roughness: 1, flatShading: true }),
    rearGraphic: new THREE.MeshStandardMaterial({ map: textures.rear, roughness: 1, flatShading: true }),
    skin: new THREE.MeshStandardMaterial({
      color: kind === 'runner' ? '#736b68' : '#77756b',
      emissive: '#c44242',
      emissiveIntensity: 0,
      roughness: 1,
      flatShading: true
    }),
    skinDark: new THREE.MeshStandardMaterial({ color: '#4f4c47', roughness: 1, flatShading: true }),
    wound: new THREE.MeshStandardMaterial({ color: '#5f302d', roughness: 1, flatShading: true }),
    hair: new THREE.MeshStandardMaterial({ color: '#171819', roughness: 1, flatShading: true }),
    socket: new THREE.MeshStandardMaterial({ color: '#201b1b', roughness: 1, flatShading: true }),
    eye: new THREE.MeshStandardMaterial({
      color: kind === 'runner' ? '#c59d91' : '#aaa99f',
      emissive: kind === 'runner' ? '#552b2a' : '#393a35',
      emissiveIntensity: 0.22,
      roughness: 0.82,
      flatShading: true
    }),
    mouth: new THREE.MeshStandardMaterial({ color: '#241313', roughness: 1, flatShading: true }),
    teeth: new THREE.MeshStandardMaterial({ color: '#b9ad91', roughness: 1, flatShading: true }),
    trousers: new THREE.MeshStandardMaterial({ color: kind === 'runner' ? '#2b2a2d' : '#32322f', roughness: 1, flatShading: true }),
    trousersWear: new THREE.MeshStandardMaterial({ color: '#4b4037', roughness: 1, flatShading: true }),
    shoe: new THREE.MeshStandardMaterial({ color: '#242523', roughness: 0.92, flatShading: true }),
    sole: new THREE.MeshStandardMaterial({ color: '#111310', roughness: 1, flatShading: true }),
    green: new THREE.MeshStandardMaterial({ color: '#54a86c', emissive: '#285a37', emissiveIntensity: 0.35, roughness: 0.76 }),
    purple: new THREE.MeshStandardMaterial({ color: '#77539c', roughness: 0.75, flatShading: true }),
    cyan: new THREE.MeshStandardMaterial({ color: '#52a9a2', roughness: 0.75, flatShading: true }),
    chain: new THREE.MeshStandardMaterial({ color: '#6e685c', roughness: 0.48, metalness: 0.55, flatShading: true })
  }), [kind, textures])

  useEffect(() => () => {
    Object.values(materials).forEach((material) => material.dispose())
  }, [materials, textures])

  useFrame(({ clock }, delta) => {
    const gameStatus = useGameStore.getState().status
    if (gameStatus !== 'PLAYING' && state !== 'DEAD') return
    const time = clock.elapsedTime
    const runner = kind === 'runner'
    let leftArmX = runner ? 0.38 : 0.24
    let rightArmX = runner ? -0.12 : -0.2
    let leftArmZ = runner ? 0.18 : 0.13
    let rightArmZ = runner ? -0.12 : -0.13
    let leftElbowX = runner ? -0.42 : -0.12
    let rightElbowX = runner ? -0.55 : -0.18
    let leftLegX = 0
    let rightLegX = 0
    let leftKneeX = 0.06
    let rightKneeX = 0.06
    let leftFootX = 0
    let rightFootX = 0
    let torsoX = runner ? 0.32 : 0.2
    let torsoY = 0
    let torsoZ = Math.sin(time * (runner ? 2.7 : 1.7)) * (runner ? 0.035 : 0.07)
    let headX = runner ? -0.08 : 0.08
    let headY = Math.sin(time * 0.68 + (runner ? 1 : 0)) * 0.09
    let headZ = -torsoZ * 0.45
    let rootY = Math.sin(time * 2 + (runner ? 1 : 0)) * 0.018
    let rootX = 0
    let rootZ = 0

    if (state === 'CHASE') {
      const rate = runner ? 11.4 : 5.25
      const stride = runner ? 0.76 : 0.48
      const phase = Math.sin(time * rate)
      const leg = phase * stride
      leftLegX = leg
      rightLegX = -leg
      leftKneeX = Math.max(0, -phase) * (runner ? 0.92 : 0.52) + 0.06
      rightKneeX = Math.max(0, phase) * (runner ? 0.92 : 0.52) + 0.06
      leftFootX = -leftLegX * 0.2 - leftKneeX * 0.55
      rightFootX = -rightLegX * 0.2 - rightKneeX * 0.55
      if (runner) {
        leftArmX = -leg * 0.64 + 0.2
        rightArmX = leg * 0.64 - 0.22
        leftElbowX = -0.62
        rightElbowX = -0.7
        torsoX = 0.5
        torsoY = -phase * 0.1
        headX = -0.13
      } else {
        leftArmX = -leg * 0.92 + 0.3
        rightArmX = leg * 0.84 - 0.18
        leftElbowX = -0.08 + Math.max(0, phase) * 0.2
        rightElbowX = -0.14 + Math.max(0, -phase) * 0.2
        torsoX = 0.24
        torsoY = -phase * 0.055
        headY = phase * -0.05
      }
      rootY = Math.abs(Math.sin(time * rate)) * (runner ? 0.075 : 0.04)
    } else if (state === 'ATTACK') {
      const duration = runner ? 1.55 : 1.18
      const progress = Math.min(1, stateTime.current / duration)
      if (runner) {
        leftArmX = stagedValue(progress, 0.38, 0.95, -0.5, 0.3, 0.68)
        rightArmX = stagedValue(progress, -0.12, 1.05, -0.62, 0.3, 0.68)
        leftArmZ = stagedValue(progress, 0.18, 0.36, 0.5, 0.3, 0.68)
        rightArmZ = -leftArmZ
        leftElbowX = stagedValue(progress, -0.42, -0.18, -0.62, 0.3, 0.68)
        rightElbowX = stagedValue(progress, -0.55, -0.22, -0.7, 0.3, 0.68)
        torsoX = stagedValue(progress, 0.32, -0.28, 0.7, 0.3, 0.68)
        headX = stagedValue(progress, -0.08, 0.1, -0.2, 0.3, 0.68)
        if (progress > 0.31 && progress < 0.68) {
          const phase = Math.sin(time * 15)
          leftLegX = phase * 0.82
          rightLegX = -leftLegX
          leftKneeX = Math.max(0, -phase) * 0.9
          rightKneeX = Math.max(0, phase) * 0.9
          rootY = Math.abs(phase) * 0.06
        }
      } else {
        rightArmX = stagedValue(progress, -0.2, -1.9, 0.88, 0.42, 0.58)
        rightArmZ = stagedValue(progress, -0.13, -0.32, -0.48, 0.42, 0.58)
        rightElbowX = stagedValue(progress, -0.18, -0.58, 0.25, 0.42, 0.58)
        leftArmX = stagedValue(progress, 0.24, -0.9, 0.65, 0.42, 0.58)
        leftArmZ = stagedValue(progress, 0.13, 0.46, 0.25, 0.42, 0.58)
        leftElbowX = stagedValue(progress, -0.12, -0.5, 0.12, 0.42, 0.58)
        torsoX = stagedValue(progress, 0.2, -0.15, 0.5, 0.42, 0.58)
        torsoY = stagedValue(progress, 0, -0.22, 0.3, 0.42, 0.58)
        headX = stagedValue(progress, 0.08, -0.12, 0.2, 0.42, 0.58)
      }
    } else if (state === 'STAGGER') {
      const recoil = Math.sin(Math.min(1, stateTime.current / (runner ? 0.42 : 0.36)) * Math.PI)
      torsoX = -recoil * 0.5
      torsoZ = recoil * (runner ? -0.26 : 0.24)
      rootZ = recoil * (runner ? 0.11 : -0.09)
      leftArmX = recoil * 0.92
      rightArmX = recoil * 0.78
      leftElbowX = 0.15
      rightElbowX = 0.12
      headX = -recoil * 0.28
      headZ = recoil * -0.16
    } else if (state === 'DEAD') {
      const fall = ease(Math.min(1, stateTime.current / (runner ? 0.72 : 0.9)))
      rootX = fall * Math.PI * 0.48
      rootZ = fall * (runner ? 0.18 : -0.13)
      rootY = -fall * 0.05
      torsoX = 0.18
      leftArmX = 1.15
      rightArmX = 0.92
      leftElbowX = 0.28
      rightElbowX = 0.2
      leftLegX = -0.24
      rightLegX = 0.18
      leftKneeX = 0.16
      rightKneeX = 0.12
      headX = 0.24
    }

    if (root.current) {
      root.current.rotation.x = damp(root.current.rotation.x, rootX, delta, state === 'DEAD' ? 3.6 : 12)
      root.current.rotation.z = damp(root.current.rotation.z, rootZ, delta)
      root.current.position.y = damp(root.current.position.y, rootY, delta)
    }
    if (torso.current) {
      torso.current.rotation.x = damp(torso.current.rotation.x, torsoX, delta)
      torso.current.rotation.y = damp(torso.current.rotation.y, torsoY, delta)
      torso.current.rotation.z = damp(torso.current.rotation.z, torsoZ, delta)
    }
    if (head.current) {
      head.current.rotation.x = damp(head.current.rotation.x, headX, delta, 10)
      head.current.rotation.y = damp(head.current.rotation.y, headY, delta, 9)
      head.current.rotation.z = damp(head.current.rotation.z, headZ, delta, 10)
    }
    if (leftArm.current) {
      leftArm.current.rotation.x = damp(leftArm.current.rotation.x, leftArmX, delta, 14)
      leftArm.current.rotation.z = damp(leftArm.current.rotation.z, leftArmZ, delta, 14)
    }
    if (rightArm.current) {
      rightArm.current.rotation.x = damp(rightArm.current.rotation.x, rightArmX, delta, 14)
      rightArm.current.rotation.z = damp(rightArm.current.rotation.z, rightArmZ, delta, 14)
    }
    if (leftForearm.current) leftForearm.current.rotation.x = damp(leftForearm.current.rotation.x, leftElbowX, delta, 15)
    if (rightForearm.current) rightForearm.current.rotation.x = damp(rightForearm.current.rotation.x, rightElbowX, delta, 15)
    if (leftLeg.current) leftLeg.current.rotation.x = damp(leftLeg.current.rotation.x, leftLegX, delta)
    if (rightLeg.current) rightLeg.current.rotation.x = damp(rightLeg.current.rotation.x, rightLegX, delta)
    if (leftShin.current) leftShin.current.rotation.x = damp(leftShin.current.rotation.x, leftKneeX, delta, 15)
    if (rightShin.current) rightShin.current.rotation.x = damp(rightShin.current.rotation.x, rightKneeX, delta, 15)
    if (leftFoot.current) leftFoot.current.rotation.x = damp(leftFoot.current.rotation.x, leftFootX, delta, 14)
    if (rightFoot.current) rightFoot.current.rotation.x = damp(rightFoot.current.rotation.x, rightFootX, delta, 14)
    materials.skin.emissiveIntensity = flash ? 1.35 : 0
    materials.shirt.emissiveIntensity = flash ? 0.9 : 0
  })

  const runner = kind === 'runner'
  const scale: [number, number, number] = runner ? [0.91, 1.03, 0.9] : [1, 1, 1]
  const torsoZ = runner ? 0.3 : 0.326
  return (
    <group ref={root} scale={scale} dispose={null}>
      <group ref={torso} position={[0, 1.48, 0]}>
        <mesh
          geometry={TORSO_GEOMETRY}
          scale={[runner ? 0.77 : 0.88, 1, runner ? 0.58 : 0.63]}
          material={materials.shirt}
          castShadow
        />
        <mesh geometry={SHIRT_GRAPHIC_GEOMETRY} position={[0, 0.015, torsoZ + 0.005]} material={materials.frontGraphic} />
        <mesh geometry={SHIRT_GRAPHIC_GEOMETRY} position={[0, 0.015, -torsoZ - 0.005]} rotation={[0, Math.PI, 0]} material={materials.rearGraphic} />
        {[-0.27, -0.09, 0.1, 0.28].map((x, index) => (
          <mesh
            key={x}
            geometry={TEAR_GEOMETRY}
            position={[x, -0.5 + (index % 2) * 0.025, index % 2 === 0 ? torsoZ * 0.76 : -torsoZ * 0.78]}
            rotation={[index % 2 === 0 ? 0 : Math.PI, 0, index * 0.35]}
            scale={[0.11 + index % 2 * 0.03, 0.16, 1]}
            material={materials.shirt}
          />
        ))}
        <mesh geometry={PATCH_GEOMETRY} position={[0.31, -0.16, torsoZ + 0.012]} rotation={[0, 0, -0.3]} scale={[0.08, 0.17, 1]} material={materials.wound} />

        <group ref={leftArm} position={[-(runner ? 0.44 : 0.5), 0.29, 0]}>
          <mesh geometry={SLEEVE_GEOMETRY} position={[0, -0.17, 0]} material={materials.shirt} castShadow />
          {[-0.09, 0, 0.09].map((y, index) => (
            <mesh
              key={y}
              geometry={LINE_GEOMETRY}
              position={[-0.16, -0.11 + y, 0]}
              rotation={[0, 0, Math.PI / 2]}
              scale={[0.38, 0.15, 0.38]}
              material={[materials.green, materials.purple, materials.cyan][index]}
            />
          ))}
          <group ref={leftForearm} position={[0, -0.34, 0]} rotation={[0.05, 0, 0]}>
            <mesh geometry={JOINT_GEOMETRY} scale={[0.19, 0.18, 0.2]} material={materials.skinDark} />
            <mesh geometry={LIMB_GEOMETRY} position={[0, -0.29, 0]} scale={[0.3, runner ? 0.62 : 0.59, 0.33]} material={materials.skin} castShadow />
            <mesh geometry={PATCH_GEOMETRY} position={[-0.105, -0.25, 0.075]} rotation={[0, -1.05, 0.2]} scale={[0.06, 0.16, 1]} material={materials.wound} />
            <group position={[0, -0.62, 0.02]}>
              <ZombieHand material={materials.skinDark} mirror />
            </group>
          </group>
        </group>

        <group ref={rightArm} position={[runner ? 0.44 : 0.5, 0.29, 0]}>
          <mesh geometry={SLEEVE_GEOMETRY} position={[0, -0.17, 0]} material={materials.shirt} castShadow />
          <group ref={rightForearm} position={[0, -0.34, 0]} rotation={[-0.06, 0, 0]}>
            <mesh geometry={JOINT_GEOMETRY} scale={[0.19, 0.18, 0.2]} material={materials.skinDark} />
            <mesh geometry={LIMB_GEOMETRY} position={[0, -0.3, 0]} scale={[0.3, runner ? 0.65 : 0.61, 0.33]} material={materials.skin} castShadow />
            <mesh geometry={PATCH_GEOMETRY} position={[0.105, -0.18, 0.06]} rotation={[0, 1.05, -0.15]} scale={[0.07, 0.13, 1]} material={materials.wound} />
            <group position={[0, -0.64, 0.02]}>
              <ZombieHand material={materials.skinDark} />
            </group>
          </group>
        </group>
      </group>

      <mesh geometry={LIMB_GEOMETRY} position={[0, 2.06, runner ? 0.04 : 0]} scale={[0.22, 0.3, 0.22]} material={materials.skinDark} />
      <group ref={head} position={[0, 2.31, runner ? 0.09 : 0.025]}>
        <mesh geometry={HEAD_GEOMETRY} scale={[0.6, 0.74, 0.58]} material={materials.skin} castShadow />
        <mesh geometry={JAW_GEOMETRY} position={[0, -0.2, 0.035]} scale={[0.47, 0.36, 0.47]} material={materials.skinDark} castShadow />
        <mesh geometry={NOSE_GEOMETRY} position={[0, -0.025, 0.31]} rotation={[Math.PI / 2, 0, 0]} material={materials.skinDark} />
        {[-1, 1].map((side) => (
          <group key={side}>
            <mesh geometry={EYE_GEOMETRY} position={[side * 0.125, 0.055, 0.285]} scale={[0.17, 0.11, 0.055]} material={materials.socket} />
            <mesh geometry={EYE_GEOMETRY} position={[side * 0.125, 0.055, 0.315]} scale={[0.058, 0.036, 0.028]} material={materials.eye} />
          </group>
        ))}
        <mesh geometry={PATCH_GEOMETRY} position={[0, -0.205, 0.275]} scale={[0.18, runner ? 0.13 : 0.08, 1]} material={materials.mouth} />
        {[-0.07, 0, 0.07].map((x, index) => (
          <mesh key={x} geometry={TEAR_GEOMETRY} position={[x, -0.17 - index % 2 * 0.012, 0.283]} scale={[0.035, 0.045, 1]} material={materials.teeth} />
        ))}
        <mesh geometry={PATCH_GEOMETRY} position={[-0.2, -0.055, 0.277]} rotation={[0, 0, 0.3]} scale={[0.105, 0.065, 1]} material={materials.wound} />
        <mesh geometry={PATCH_GEOMETRY} position={[0.21, -0.09, 0.268]} rotation={[0, 0, -0.25]} scale={[0.06, 0.12, 1]} material={materials.skinDark} />
        {ENEMY_HAIR.map((clump, index) => (
          <mesh
            key={index}
            geometry={HAIR_GEOMETRY}
            position={clump.p}
            rotation={[clump.r[0], clump.r[1], clump.r[2]]}
            scale={clump.s}
            material={materials.hair}
            castShadow
          />
        ))}
      </group>

      {Array.from({ length: 6 }, (_, index) => (
        <mesh
          key={index}
          geometry={CHAIN_GEOMETRY}
          position={[-0.34 - Math.sin(index * 0.62) * 0.06, 1.03 - index * 0.075, 0.05]}
          rotation={[0, Math.PI / 2, index * 0.25]}
          material={materials.chain}
        />
      ))}

      <group ref={leftLeg} position={[-0.2, 1.04, 0.01]}>
        <mesh geometry={LIMB_GEOMETRY} position={[0, -0.24, 0]} scale={[runner ? 0.42 : 0.48, 0.49, runner ? 0.46 : 0.52]} material={materials.trousers} castShadow />
        <group ref={leftShin} position={[0, -0.49, 0]}>
          <mesh geometry={JOINT_GEOMETRY} scale={[0.23, 0.2, 0.25]} material={materials.skinDark} />
          <mesh geometry={PATCH_GEOMETRY} position={[0, 0.01, 0.205]} scale={[0.13, 0.11, 1]} material={materials.wound} />
          <mesh geometry={LIMB_GEOMETRY} position={[0, -0.22, 0]} scale={[runner ? 0.39 : 0.43, 0.44, runner ? 0.45 : 0.49]} material={materials.trousers} castShadow />
          <mesh geometry={PATCH_GEOMETRY} position={[-0.12, -0.19, 0.12]} rotation={[0, -0.75, 0.15]} scale={[0.07, 0.15, 1]} material={materials.trousersWear} />
          <group ref={leftFoot} position={[0, -0.45, 0.1]} rotation={[0, -0.04, 0.02]}>
            <mesh geometry={SHOE_GEOMETRY} position={[0, 0.02, 0.07]} material={materials.shoe} castShadow />
            <mesh geometry={SOLE_GEOMETRY} position={[0, -0.09, 0.07]} material={materials.sole} />
            <mesh geometry={LINE_GEOMETRY} position={[0, 0.07, 0.18]} rotation={[Math.PI / 2, 0, 0]} scale={[0.42, 0.3, 0.42]} material={materials.purple} />
          </group>
        </group>
      </group>

      <group ref={rightLeg} position={[0.2, 1.04, -0.015]} rotation={[0, 0, runner ? -0.035 : 0.025]}>
        <mesh geometry={LIMB_GEOMETRY} position={[0, -0.24, 0]} scale={[runner ? 0.42 : 0.48, 0.49, runner ? 0.46 : 0.52]} material={materials.trousers} castShadow />
        <group ref={rightShin} position={[0, -0.49, 0]}>
          <mesh geometry={JOINT_GEOMETRY} scale={[0.23, 0.2, 0.25]} material={materials.skinDark} />
          <mesh geometry={PATCH_GEOMETRY} position={[0.01, 0.005, 0.205]} scale={[0.11, 0.09, 1]} material={materials.wound} />
          <mesh geometry={LIMB_GEOMETRY} position={[0, -0.22, 0]} scale={[runner ? 0.39 : 0.43, 0.44, runner ? 0.45 : 0.49]} material={materials.trousers} castShadow />
          <mesh geometry={PATCH_GEOMETRY} position={[0.12, -0.13, 0.1]} rotation={[0, 0.75, -0.2]} scale={[0.075, 0.12, 1]} material={materials.trousersWear} />
          <group ref={rightFoot} position={[0, -0.45, 0.1]} rotation={[0, 0.06, -0.02]}>
            <mesh geometry={SHOE_GEOMETRY} position={[0, 0.02, 0.07]} material={materials.shoe} castShadow />
            <mesh geometry={SOLE_GEOMETRY} position={[0, -0.09, 0.07]} material={materials.sole} />
            <mesh geometry={LINE_GEOMETRY} position={[0, 0.07, 0.18]} rotation={[Math.PI / 2, 0, 0]} scale={[0.42, 0.3, 0.42]} material={materials.green} />
          </group>
        </group>
      </group>
    </group>
  )
}

export function Enemy({ id, kind, spawn, active, playerPosition, extraColliders, onDeath }: EnemyProps) {
  const combat = useCombatSystem()
  const group = useRef<THREE.Group>(null)
  const position = useRef(new THREE.Vector3(...spawn))
  const hp = useRef<number>(GAME_CONFIG.enemies[kind].hp)
  const alive = useRef(true)
  const stateRef = useRef<EnemyState>('IDLE')
  const stateTime = useRef(0)
  const attackCooldown = useRef(0.25 + (id.charCodeAt(id.length - 1) % 4) * 0.16)
  const attackHit = useRef(false)
  const chargeDirection = useRef(new THREE.Vector3(0, 0, 1))
  const knockVelocity = useRef(new THREE.Vector3())
  const facing = useRef(0)
  const [modelState, setModelState] = useState<EnemyState>('IDLE')
  const [flash, setFlash] = useState(false)
  const flashTimer = useRef<number | null>(null)

  const transition = useCallback((next: EnemyState) => {
    if (stateRef.current === next) return
    stateRef.current = next
    stateTime.current = 0
    attackHit.current = false
    if (next === 'ATTACK' && kind === 'runner') {
      chargeDirection.current.copy(playerPosition.current).sub(position.current).setY(0).normalize()
    }
    setModelState(next)
  }, [kind, playerPosition])

  const receiveHit = useCallback((hit: HitPayload) => {
    if (!alive.current) return false
    hp.current -= hit.damage
    knockVelocity.current.addScaledVector(hit.direction, hit.knockback)
    setFlash(true)
    if (flashTimer.current !== null) window.clearTimeout(flashTimer.current)
    flashTimer.current = window.setTimeout(() => setFlash(false), 115)
    if (hp.current <= 0) {
      alive.current = false
      transition('DEAD')
      useGameStore.getState().registerKill()
      onDeath?.(id)
      combat.emitSound(kind === 'runner' ? 'runner-death' : 'walker-death', 0.82)
    } else {
      transition('STAGGER')
      combat.emitSound('enemy-stagger', hit.heavy ? 0.9 : 0.64)
    }
    return true
  }, [combat, id, kind, onDeath, transition])

  const target = useMemo<CombatTarget>(() => ({
    id,
    kind,
    position: position.current,
    radius: kind === 'runner' ? 0.48 : 0.54,
    get alive() {
      return alive.current
    },
    receiveHit
  }), [id, kind, receiveHit])

  useEffect(() => combat.registerTarget(target), [combat, target])
  useEffect(() => () => {
    if (flashTimer.current !== null) window.clearTimeout(flashTimer.current)
  }, [])

  useFrame((_, delta) => {
    const mesh = group.current
    if (!mesh) return
    const status = useGameStore.getState().status
    if (stateRef.current === 'DEAD') {
      stateTime.current = Math.min(2, stateTime.current + delta)
      return
    }
    if (!active || status !== 'PLAYING' || combat.isFrozen()) return
    stateTime.current += delta
    attackCooldown.current = Math.max(0, attackCooldown.current - delta)

    if (stateRef.current === 'STAGGER') {
      const desired = position.current.clone().addScaledVector(knockVelocity.current, delta)
      position.current.copy(resolveWorldMovement(position.current, desired, 0.5, extraColliders))
      knockVelocity.current.multiplyScalar(Math.exp(-6 * delta))
      if (stateTime.current >= (kind === 'runner' ? 0.42 : 0.36)) transition('CHASE')
      mesh.position.copy(position.current)
      return
    }

    const toPlayer = playerPosition.current.clone().sub(position.current).setY(0)
    const distance = toPlayer.length()
    const direction = distance > 0.001 ? toPlayer.clone().divideScalar(distance) : new THREE.Vector3(0, 0, 1)
    const canSee = hasLineOfSight(
      position.current.clone().add(new THREE.Vector3(0, 1.1, 0)),
      playerPosition.current.clone().add(new THREE.Vector3(0, 1, 0)),
      extraColliders
    )
    const previousState = stateRef.current
    const next = decideEnemyState({
      kind,
      state: stateRef.current,
      distance,
      canSeePlayer: canSee,
      stateTime: stateTime.current,
      attackCooldown: attackCooldown.current
    })
    if (previousState === 'ATTACK' && next === 'CHASE') {
      attackCooldown.current = kind === 'runner' ? 1.55 : 0.82
    }
    transition(next)

    if (stateRef.current === 'CHASE') {
      const separation = separationForce(id, position.current, combat.targets.current.values())
      const movement = direction.add(separation).normalize()
      const desired = position.current.clone().addScaledVector(movement, GAME_CONFIG.enemies[kind].speed * delta)
      position.current.copy(resolveWorldMovement(position.current, desired, 0.5, extraColliders))
      facing.current = faceDirection(facing.current, movement, delta, kind === 'runner' ? 13 : 7)
    } else if (stateRef.current === 'ATTACK') {
      if (kind === 'walker') {
        facing.current = faceDirection(facing.current, direction, delta, 9)
        if (!attackHit.current && stateTime.current >= 0.62) {
          attackHit.current = true
          if (distance <= GAME_CONFIG.enemies.walker.attackRange + 0.45 && canSee) {
            combat.damagePlayer(GAME_CONFIG.enemies.walker.damage, position.current)
          }
          combat.emitSound('walker-attack', 0.7)
        }
      } else {
        if (stateTime.current < 0.48) {
          facing.current = faceDirection(facing.current, chargeDirection.current, delta, 12)
        } else if (stateTime.current < 1.02) {
          const desired = position.current.clone().addScaledVector(chargeDirection.current, 8.2 * delta)
          position.current.copy(resolveWorldMovement(position.current, desired, 0.48, extraColliders))
          const clearChargeHit = hasLineOfSight(
            position.current.clone().add(new THREE.Vector3(0, 1, 0)),
            playerPosition.current.clone().add(new THREE.Vector3(0, 1, 0)),
            extraColliders
          )
          if (!attackHit.current && position.current.distanceTo(playerPosition.current) < 1.35 && clearChargeHit) {
            attackHit.current = true
            combat.damagePlayer(GAME_CONFIG.enemies.runner.damage, position.current)
            combat.emitSound('runner-impact', 0.85)
          }
        }
      }
    }

    mesh.position.copy(position.current)
    mesh.rotation.y = facing.current
  })

  return (
    <group ref={group} position={spawn}>
      <EnemyModel kind={kind} state={modelState} stateTime={stateTime} flash={flash} />
    </group>
  )
}

export default Enemy
