import { type MutableRefObject, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { EnemyKind, GAME_CONFIG } from './GameConfig'
import { useGameStore } from './GameState'
import { type CombatTarget, type HitPayload, useCombatSystem } from './CombatSystem'
import {
  decideEnemyState,
  ENEMY_TIMINGS,
  type EnemyState,
  faceDirection,
  personalSpaceCorrection,
  separationForce
} from './EnemyAI'
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
  variantSeed: number
  state: EnemyState
  stateTime: MutableRefObject<number>
  recoveryDuration: MutableRefObject<number>
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

const TORSO_GEOMETRY = new THREE.CylinderGeometry(0.52, 0.43, 0.94, 12, 5, false, -Math.PI / 2, Math.PI * 2)
const UNDERSHIRT_GEOMETRY = new THREE.CylinderGeometry(0.44, 0.39, 0.84, 10, 3, false, -Math.PI / 2, Math.PI * 2)
const LIMB_GEOMETRY = new THREE.CapsuleGeometry(0.34, 0.32, 4, 8)
const JOINT_GEOMETRY = new THREE.DodecahedronGeometry(0.5, 1)
const HEAD_GEOMETRY = new THREE.IcosahedronGeometry(0.5, 2)
const JAW_GEOMETRY = new THREE.DodecahedronGeometry(0.5, 1)
const HAND_GEOMETRY = new THREE.IcosahedronGeometry(0.5, 1)
const FINGER_GEOMETRY = new THREE.CapsuleGeometry(0.035, 0.15, 2, 5)
const NOSE_GEOMETRY = new THREE.ConeGeometry(0.055, 0.17, 7)
const EYE_GEOMETRY = new THREE.SphereGeometry(0.5, 9, 6)
const HAIR_GEOMETRY = new THREE.IcosahedronGeometry(0.5, 1)
const PATCH_GEOMETRY = new THREE.CircleGeometry(0.5, 6)
const TEAR_GEOMETRY = new THREE.CircleGeometry(0.5, 3)
const SHOE_GEOMETRY = new RoundedBoxGeometry(0.37, 0.2, 0.55, 2, 0.045)
const SOLE_GEOMETRY = new RoundedBoxGeometry(0.4, 0.065, 0.58, 1, 0.02)
const TOE_GEOMETRY = new RoundedBoxGeometry(0.35, 0.16, 0.27, 1, 0.055)
const HEEL_GEOMETRY = new RoundedBoxGeometry(0.32, 0.18, 0.19, 1, 0.035)
const TREAD_GEOMETRY = new THREE.BoxGeometry(0.31, 0.026, 0.055)
const SHOULDER_GEOMETRY = new THREE.CapsuleGeometry(0.18, 0.56, 4, 10)
const COLLAR_GEOMETRY = new THREE.TorusGeometry(0.19, 0.032, 6, 12)
const SLEEVE_GEOMETRY = new THREE.CylinderGeometry(0.17, 0.145, 0.34, 9, 2)
const LINE_GEOMETRY = new THREE.CapsuleGeometry(0.03, 0.45, 2, 5)
const CHAIN_GEOMETRY = new THREE.TorusGeometry(0.055, 0.012, 5, 9)
const BROW_GEOMETRY = new THREE.CapsuleGeometry(0.035, 0.16, 3, 7)
const CHEEK_GEOMETRY = new THREE.DodecahedronGeometry(0.5, 1)
const EAR_GEOMETRY = new THREE.DodecahedronGeometry(0.5, 0)
const WORLD_UP = new THREE.Vector3(0, 1, 0)

const createRaggedFlapGeometry = () => {
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    -0.5, 0.5, 0.08, 0.5, 0.5, 0.08, 0.08, -0.5, 0.08,
    -0.5, 0.5, -0.08, 0.08, -0.5, -0.08, 0.5, 0.5, -0.08,
    -0.5, 0.5, 0.08, -0.5, 0.5, -0.08, 0.5, 0.5, -0.08,
    -0.5, 0.5, 0.08, 0.5, 0.5, -0.08, 0.5, 0.5, 0.08,
    0.5, 0.5, 0.08, 0.5, 0.5, -0.08, 0.08, -0.5, -0.08,
    0.5, 0.5, 0.08, 0.08, -0.5, -0.08, 0.08, -0.5, 0.08,
    0.08, -0.5, 0.08, 0.08, -0.5, -0.08, -0.5, 0.5, -0.08,
    0.08, -0.5, 0.08, -0.5, 0.5, -0.08, -0.5, 0.5, 0.08
  ], 3))
  geometry.computeVertexNormals()
  return geometry
}

const RAGGED_FLAP_GEOMETRY = createRaggedFlapGeometry()

const ENEMY_HAIR = [
  { p: [-0.19, 0.28, 0.02], s: [0.28, 0.29, 0.28], r: [0.4, 0.1, -0.25] },
  { p: [0.02, 0.32, 0], s: [0.32, 0.3, 0.32], r: [0.2, 0.45, 0.08] },
  { p: [0.21, 0.26, 0.01], s: [0.28, 0.27, 0.28], r: [0.25, -0.3, 0.22] },
  { p: [-0.29, 0.12, 0.02], s: [0.23, 0.3, 0.26], r: [-0.15, 0.2, -0.4] },
  { p: [0.29, 0.12, 0.01], s: [0.23, 0.29, 0.25], r: [0.08, -0.2, 0.38] },
  { p: [-0.15, 0.18, 0.25], s: [0.22, 0.35, 0.2], r: [-0.3, 0.25, -0.15] },
  { p: [0.08, 0.21, 0.27], s: [0.25, 0.37, 0.2], r: [-0.38, -0.2, 0.12] },
  { p: [0.24, 0.12, 0.21], s: [0.18, 0.31, 0.18], r: [-0.25, 0.2, 0.25] },
  { p: [-0.25, 0.08, -0.17], s: [0.2, 0.33, 0.2], r: [0.18, -0.1, -0.42] },
  { p: [0.02, 0.19, -0.25], s: [0.25, 0.36, 0.22], r: [-0.12, 0.36, 0.05] },
  { p: [0.25, 0.07, -0.17], s: [0.19, 0.31, 0.19], r: [0.25, -0.25, 0.4] },
  { p: [-0.04, 0.33, 0.17], s: [0.2, 0.32, 0.17], r: [-0.5, 0.08, -0.12] }
] as const

const createPaperHandTexture = (kind: EnemyKind, variant: number) => {
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  canvas.width = 1024
  canvas.height = 512
  const context = canvas.getContext('2d')
  if (!context) return null

  const base = kind === 'runner' ? '#242326' : '#2c2b27'
  context.fillStyle = base
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.fillStyle = 'rgba(123, 96, 70, .25)'
  for (let index = 0; index < 96; index += 1) {
    const x = (index * 173 + 37 + variant * 71) % 1010
    const y = (index * 97 + 29 + variant * 41) % 500
    const size = 5 + (index % 7) * 4
    context.beginPath()
    context.moveTo(x, y)
    context.lineTo(x + size, y + (index % 3) * 3)
    context.lineTo(x + size * 0.45, y + size * 1.4)
    context.lineTo(x - 2, y + size * 0.6)
    context.fill()
  }

  const drawPill = (x: number, y: number, scale = 1) => {
    context.save()
    context.translate(x, y)
    context.rotate(-0.58)
    context.fillStyle = '#d2cec0'
    context.beginPath()
    context.roundRect(-48 * scale, -20 * scale, 96 * scale, 40 * scale, 20 * scale)
    context.fill()
    context.fillStyle = '#4b9d68'
    context.beginPath()
    context.roundRect(-48 * scale, -20 * scale, 50 * scale, 40 * scale, [20 * scale, 0, 0, 20 * scale])
    context.fill()
    context.fillStyle = 'rgba(25, 28, 25, .72)'
    context.fillRect(-2 * scale, -20 * scale, 5 * scale, 40 * scale)
    context.restore()
  }

  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.strokeStyle = 'rgba(25, 23, 21, .75)'
  context.lineWidth = 7
  context.fillStyle = '#c8c0ac'
  context.font = '900 68px Arial Black, Arial, sans-serif'
  context.strokeText('PAPER', 256, 155)
  context.fillText('PAPER', 256, 155)
  context.strokeText('HAND', 256, 226)
  context.fillText('HAND', 256, 226)
  drawPill(256, 352, 0.78)

  drawPill(768, 137, 0.94)
  context.font = '800 35px Arial, sans-serif'
  context.strokeText('PUMP.FUN', 768, 300)
  context.fillText('PUMP.FUN', 768, 300)
  context.strokeText('SOLANA', 768, 345)
  context.fillText('SOLANA', 768, 345)

  context.fillStyle = 'rgba(24, 22, 20, .48)'
  for (let index = 0; index < 32; index += 1) {
    const x = (index * 211 + 23 + variant * 53) % 1000
    const y = (index * 79 + 31) % 490
    context.fillRect(x, y, 9 + index % 5 * 5, 3 + index % 4)
  }

  context.globalCompositeOperation = 'destination-out'
  context.fillStyle = 'rgba(0, 0, 0, .7)'
  for (let index = 0; index < 18; index += 1) {
    const center = index % 2 === 0 ? 256 : 768
    const x = center - 150 + ((index * 73 + variant * 29) % 300)
    const y = 80 + ((index * 61 + variant * 17) % 340)
    context.save()
    context.translate(x, y)
    context.rotate((index % 5 - 2) * 0.18)
    context.fillRect(-2, -10, 4 + index % 3 * 2, 20 + index % 4 * 5)
    context.restore()
  }
  context.globalCompositeOperation = 'source-over'

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  texture.wrapS = THREE.RepeatWrapping
  return texture
}

const shirtTextureCache = new Map<string, THREE.CanvasTexture | null>()

const getPaperHandTexture = (kind: EnemyKind, variant: number) => {
  const key = `${kind}-${variant}`
  if (!shirtTextureCache.has(key)) shirtTextureCache.set(key, createPaperHandTexture(kind, variant))
  return shirtTextureCache.get(key) ?? null
}

const ENEMY_STATIC_MATERIALS = {
  undershirt: new THREE.MeshStandardMaterial({ color: '#1a1b1b', roughness: 1, flatShading: true }),
  shirtWalker: ['#2c2b27', '#302b27', '#292c29'].map((color) =>
    new THREE.MeshStandardMaterial({ color, roughness: 1, flatShading: true })),
  shirtRunner: ['#242326', '#282329', '#222628'].map((color) =>
    new THREE.MeshStandardMaterial({ color, roughness: 1, flatShading: true })),
  skinDark: new THREE.MeshStandardMaterial({ color: '#4a4642', roughness: 1, flatShading: true }),
  wound: new THREE.MeshStandardMaterial({ color: '#61302c', roughness: 1, flatShading: true }),
  hair: new THREE.MeshStandardMaterial({ color: '#151617', roughness: 0.98, flatShading: true }),
  socket: new THREE.MeshStandardMaterial({ color: '#1d1818', roughness: 1, flatShading: true }),
  mouth: new THREE.MeshStandardMaterial({ color: '#1c0e0e', roughness: 1, flatShading: true }),
  teeth: new THREE.MeshStandardMaterial({ color: '#b8aa8c', roughness: 1, flatShading: true }),
  trousersWear: new THREE.MeshStandardMaterial({ color: '#4c4036', roughness: 1, flatShading: true }),
  shoe: new THREE.MeshStandardMaterial({ color: '#222321', roughness: 0.94, flatShading: true }),
  sole: new THREE.MeshStandardMaterial({ color: '#0f110f', roughness: 1, flatShading: true }),
  green: new THREE.MeshStandardMaterial({ color: '#54a86c', emissive: '#285a37', emissiveIntensity: 0.35, roughness: 0.76 }),
  purple: new THREE.MeshStandardMaterial({ color: '#77539c', roughness: 0.75, flatShading: true }),
  cyan: new THREE.MeshStandardMaterial({ color: '#52a9a2', roughness: 0.75, flatShading: true }),
  chain: new THREE.MeshStandardMaterial({ color: '#6e685c', roughness: 0.48, metalness: 0.55, flatShading: true }),
  trousersWalker: ['#32322f', '#34302d', '#2d3230'].map((color) =>
    new THREE.MeshStandardMaterial({ color, roughness: 1, flatShading: true })),
  trousersRunner: ['#2b2a2d', '#30292e', '#282e30'].map((color) =>
    new THREE.MeshStandardMaterial({ color, roughness: 1, flatShading: true }))
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

function EnemyModel({ kind, variantSeed, state, stateTime, recoveryDuration, flash }: EnemyModelProps) {
  const root = useRef<THREE.Group>(null)
  const torso = useRef<THREE.Group>(null)
  const head = useRef<THREE.Group>(null)
  const jaw = useRef<THREE.Mesh>(null)
  const mouth = useRef<THREE.Mesh>(null)
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

  const variant = variantSeed % 3
  const shirtTexture = useMemo(() => getPaperHandTexture(kind, variant), [kind, variant])
  const materials = useMemo(() => ({
    shirt: new THREE.MeshStandardMaterial({
      color: '#ffffff',
      map: shirtTexture,
      emissive: '#a34444',
      emissiveIntensity: 0,
      roughness: 1,
      flatShading: true
    }),
    skin: new THREE.MeshStandardMaterial({
      color: kind === 'runner'
        ? ['#706765', '#766b68', '#6f6863'][variant]
        : ['#77756b', '#74736b', '#7a756a'][variant],
      emissive: '#c44242',
      emissiveIntensity: 0,
      roughness: 1,
      flatShading: true
    }),
    eye: new THREE.MeshStandardMaterial({
      color: kind === 'runner' ? '#c59d91' : '#aaa99f',
      emissive: kind === 'runner' ? '#7f2925' : '#555545',
      emissiveIntensity: 0.22,
      roughness: 0.82,
      flatShading: true
    }),
    attackTell: new THREE.MeshStandardMaterial({
      color: '#241313',
      emissive: kind === 'runner' ? '#db3f30' : '#a65331',
      emissiveIntensity: 0,
      roughness: 0.92,
      flatShading: true
    }),
    ...ENEMY_STATIC_MATERIALS,
    shirtHem: kind === 'runner'
      ? ENEMY_STATIC_MATERIALS.shirtRunner[variant]
      : ENEMY_STATIC_MATERIALS.shirtWalker[variant],
    trousers: kind === 'runner'
      ? ENEMY_STATIC_MATERIALS.trousersRunner[variant]
      : ENEMY_STATIC_MATERIALS.trousersWalker[variant]
  }), [kind, shirtTexture, variant])

  useEffect(() => () => {
    materials.shirt.dispose()
    materials.skin.dispose()
    materials.eye.dispose()
    materials.attackTell.dispose()
  }, [materials])

  useFrame(({ clock }, delta) => {
    const gameStatus = useGameStore.getState().status
    if (gameStatus !== 'PLAYING' && state !== 'DEAD') return
    const time = clock.elapsedTime
    const runner = kind === 'runner'
    const timing = ENEMY_TIMINGS[kind]
    let leftArmX = runner ? -0.3 : 0.18
    let rightArmX = runner ? -0.44 : -0.24
    let leftArmZ = runner ? 0.23 : 0.15
    let rightArmZ = runner ? -0.2 : -0.13
    let leftElbowX = runner ? -0.68 : -0.14
    let rightElbowX = runner ? -0.74 : -0.22
    let leftLegX = 0
    let rightLegX = 0
    let leftKneeX = runner ? 0.12 : 0.07
    let rightKneeX = runner ? 0.15 : 0.07
    let leftFootX = 0
    let rightFootX = 0
    let torsoX = runner ? 0.46 : 0.24
    let torsoY = 0
    let torsoZ = Math.sin(time * (runner ? 2.7 : 1.7)) * (runner ? 0.035 : 0.07)
    let headX = runner ? -0.16 : 0.1
    let headY = Math.sin(time * 0.68 + (runner ? 1 : 0)) * 0.09
    let headZ = -torsoZ * 0.45
    let rootY = Math.sin(time * 2 + (runner ? 1 : 0)) * 0.018
    let rootX = 0
    let rootZ = 0
    let attackTell = 0
    let jawDrop = runner ? 0.018 : 0
    let jawOpen = runner ? -0.08 : 0

    if (state === 'PATROL') {
      const rate = runner ? 4.8 : 3.15
      const phase = Math.sin(time * rate)
      const leg = phase * (runner ? 0.28 : 0.22)
      leftLegX = leg
      rightLegX = -leg
      leftKneeX = Math.max(0, -phase) * 0.3 + (runner ? 0.12 : 0.07)
      rightKneeX = Math.max(0, phase) * 0.3 + (runner ? 0.15 : 0.07)
      leftFootX = -leftLegX * 0.25 - leftKneeX * 0.42
      rightFootX = -rightLegX * 0.25 - rightKneeX * 0.42
      leftArmX = -leg * 0.56 + (runner ? -0.3 : 0.18)
      rightArmX = leg * 0.52 + (runner ? -0.44 : -0.24)
      rootY = Math.abs(phase) * 0.018
    } else if (state === 'DETECT') {
      const progress = Math.min(1, stateTime.current / timing.detectDuration)
      const reaction = Math.sin(progress * Math.PI)
      rootY = reaction * (runner ? 0.07 : 0.045)
      torsoX = (runner ? 0.46 : 0.24) - reaction * (runner ? 0.48 : 0.34)
      torsoY = reaction * (runner ? -0.16 : 0.11)
      leftArmX = (runner ? -0.3 : 0.18) - reaction * (runner ? 0.86 : 0.72)
      rightArmX = (runner ? -0.44 : -0.24) - reaction * (runner ? 0.92 : 0.68)
      leftElbowX -= reaction * 0.3
      rightElbowX -= reaction * 0.34
      headX = (runner ? -0.16 : 0.1) - reaction * 0.26
      headY *= 1 - progress
      attackTell = reaction * (runner ? 0.85 : 0.48)
      jawDrop += reaction * (runner ? 0.045 : 0.025)
      jawOpen -= reaction * (runner ? 0.16 : 0.09)
    } else if (state === 'CHASE') {
      const rate = runner ? 11.4 : 5.25
      const stride = runner ? 0.76 : 0.48
      const phase = Math.sin(time * rate)
      const leg = phase * stride
      leftLegX = leg
      rightLegX = -leg
      leftKneeX = Math.max(0, -phase) * (runner ? 0.92 : 0.52) + (runner ? 0.12 : 0.07)
      rightKneeX = Math.max(0, phase) * (runner ? 0.92 : 0.52) + (runner ? 0.15 : 0.07)
      leftFootX = -leftLegX * 0.2 - leftKneeX * 0.55
      rightFootX = -rightLegX * 0.2 - rightKneeX * 0.55
      if (runner) {
        leftArmX = -leg * 0.64 - 0.28
        rightArmX = leg * 0.64 - 0.42
        leftElbowX = -0.62
        rightElbowX = -0.7
        torsoX = 0.62
        torsoY = -phase * 0.1
        headX = -0.2
      } else {
        leftArmX = -leg * 0.92 + 0.22
        rightArmX = leg * 0.84 - 0.24
        leftElbowX = -0.08 + Math.max(0, phase) * 0.2
        rightElbowX = -0.14 + Math.max(0, -phase) * 0.2
        torsoX = 0.24
        torsoY = -phase * 0.055
        headY = phase * -0.05
      }
      rootY = Math.abs(Math.sin(time * rate)) * (runner ? 0.075 : 0.04)
    } else if (state === 'ATTACK') {
      const progress = Math.min(1, stateTime.current / timing.attackDuration)
      const windupEnd = timing.activeStart / timing.attackDuration
      const strikeEnd = timing.activeEnd / timing.attackDuration
      const telegraphProgress = Math.min(1, progress / windupEnd)
      const recoveryProgress = progress <= strikeEnd ? 0 : (progress - strikeEnd) / (1 - strikeEnd)
      attackTell = progress <= windupEnd
        ? 0.35 + ease(telegraphProgress) * (runner ? 1.65 : 1.15)
        : (1 - ease(recoveryProgress)) * (runner ? 1.55 : 1.05)
      jawDrop += attackTell * (runner ? 0.038 : 0.026)
      jawOpen -= attackTell * (runner ? 0.13 : 0.09)
      if (runner) {
        leftArmX = stagedValue(progress, -0.3, 1.08, -0.72, windupEnd, strikeEnd)
        rightArmX = stagedValue(progress, -0.44, 1.18, -0.8, windupEnd, strikeEnd)
        leftArmZ = stagedValue(progress, 0.23, 0.5, 0.58, windupEnd, strikeEnd)
        rightArmZ = -leftArmZ
        leftElbowX = stagedValue(progress, -0.68, -0.12, -0.78, windupEnd, strikeEnd)
        rightElbowX = stagedValue(progress, -0.74, -0.16, -0.86, windupEnd, strikeEnd)
        torsoX = stagedValue(progress, 0.46, -0.36, 0.82, windupEnd, strikeEnd)
        torsoY = stagedValue(progress, 0, -0.2, 0.12, windupEnd, strikeEnd)
        headX = stagedValue(progress, -0.16, 0.16, -0.28, windupEnd, strikeEnd)
        rootY = progress <= windupEnd ? -Math.sin(telegraphProgress * Math.PI * 0.5) * 0.075 : rootY
        leftLegX = progress <= windupEnd ? -0.24 * telegraphProgress : leftLegX
        rightLegX = progress <= windupEnd ? 0.28 * telegraphProgress : rightLegX
        leftKneeX = 0.12 + telegraphProgress * 0.46
        rightKneeX = 0.15 + telegraphProgress * 0.5
        if (progress > windupEnd && progress < strikeEnd) {
          const phase = Math.sin(time * 15)
          leftLegX = phase * 0.82
          rightLegX = -leftLegX
          leftKneeX = Math.max(0, -phase) * 0.9
          rightKneeX = Math.max(0, phase) * 0.9
          rootY = Math.abs(phase) * 0.06
        }
      } else {
        rightArmX = stagedValue(progress, -0.24, -2.12, 0.96, windupEnd, strikeEnd)
        rightArmZ = stagedValue(progress, -0.13, -0.42, -0.54, windupEnd, strikeEnd)
        rightElbowX = stagedValue(progress, -0.22, -0.72, 0.3, windupEnd, strikeEnd)
        leftArmX = stagedValue(progress, 0.18, -1.2, 0.74, windupEnd, strikeEnd)
        leftArmZ = stagedValue(progress, 0.15, 0.58, 0.3, windupEnd, strikeEnd)
        leftElbowX = stagedValue(progress, -0.14, -0.64, 0.18, windupEnd, strikeEnd)
        torsoX = stagedValue(progress, 0.24, -0.24, 0.58, windupEnd, strikeEnd)
        torsoY = stagedValue(progress, 0, -0.3, 0.36, windupEnd, strikeEnd)
        torsoZ += Math.sin(telegraphProgress * Math.PI) * 0.12
        headX = stagedValue(progress, 0.1, -0.18, 0.24, windupEnd, strikeEnd)
        rootY = progress <= windupEnd ? -Math.sin(telegraphProgress * Math.PI * 0.5) * 0.045 : rootY
        rootZ = progress <= windupEnd ? -Math.sin(telegraphProgress * Math.PI) * 0.055 : rootZ
        leftKneeX = 0.07 + telegraphProgress * 0.28
        rightKneeX = 0.07 + telegraphProgress * 0.18
      }
    } else if (state === 'RECOVER') {
      const fatigue = 1 - ease(Math.min(1, stateTime.current / recoveryDuration.current))
      torsoX = (runner ? 0.46 : 0.24) + fatigue * (runner ? 0.62 : 0.34)
      torsoY = fatigue * (runner ? 0.18 : -0.1)
      headX = (runner ? -0.16 : 0.1) + fatigue * 0.34
      leftArmX = (runner ? -0.3 : 0.18) + fatigue * 0.58
      rightArmX = (runner ? -0.44 : -0.24) + fatigue * 0.52
      leftElbowX = -0.08 + fatigue * 0.28
      rightElbowX = -0.12 + fatigue * 0.24
      rootY = -fatigue * 0.025
    } else if (state === 'STAGGER') {
      const recoil = Math.sin(Math.min(1, stateTime.current / timing.staggerDuration) * Math.PI)
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
    if (jaw.current) {
      jaw.current.position.y = damp(jaw.current.position.y, (runner ? -0.235 : -0.2) - jawDrop, delta, 16)
      jaw.current.rotation.x = damp(jaw.current.rotation.x, (runner ? -0.08 : 0) + jawOpen, delta, 16)
    }
    if (mouth.current) {
      const baseMouthScale = runner ? 0.155 : 0.09
      mouth.current.scale.y = damp(
        mouth.current.scale.y,
        baseMouthScale * (1 + Math.min(1.8, attackTell) * (runner ? 0.58 : 0.42)),
        delta,
        18
      )
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
    materials.eye.emissiveIntensity = (runner ? 0.22 : 0.16) + attackTell * (runner ? 1.45 : 0.85)
    materials.attackTell.emissiveIntensity = attackTell * (runner ? 2.1 : 1.35)
  })

  const runner = kind === 'runner'
  const scale: [number, number, number] = runner ? [0.84, 1.08, 0.86] : [1.04, 0.99, 1.02]
  const torsoZ = runner ? 0.285 : 0.34
  const shoeAccents = [materials.green, materials.purple, materials.cyan] as const
  return (
    <group ref={root} scale={scale} dispose={null}>
      <group ref={torso} position={[(variant - 1) * 0.016, runner ? 1.51 : 1.47, runner ? 0.045 : 0]}>
        <mesh
          geometry={UNDERSHIRT_GEOMETRY}
          position={[0, -0.025, 0]}
          scale={[runner ? 0.68 : 0.88, runner ? 1.02 : 0.98, runner ? 0.52 : 0.63]}
          material={materials.undershirt}
          castShadow
        />
        <mesh
          geometry={TORSO_GEOMETRY}
          scale={[runner ? 0.7 : 0.93, runner ? 1.04 : 1, runner ? 0.54 : 0.66]}
          material={materials.shirt}
          castShadow
        />
        <mesh
          geometry={SHOULDER_GEOMETRY}
          position={[0, 0.35, 0]}
          rotation={[0, 0, Math.PI / 2]}
          scale={[runner ? 0.76 : 0.86, runner ? 0.82 : 1.08, runner ? 0.5 : 0.65]}
          material={materials.shirtHem}
          castShadow
        />
        <mesh
          geometry={COLLAR_GEOMETRY}
          position={[0, 0.455, 0.04]}
          rotation={[Math.PI / 2, 0, 0]}
          scale={[1, runner ? 0.8 : 0.9, 1]}
          material={materials.undershirt}
        />
        {[-0.31, -0.14, 0.04, 0.23].map((x, index) => (
          <mesh
            key={`front-${x}`}
            geometry={RAGGED_FLAP_GEOMETRY}
            position={[x, -0.47 - (index % 2) * 0.018, torsoZ * 0.88]}
            rotation={[0.06, 0, (index - 1.5) * 0.08]}
            scale={[0.17 + index % 2 * 0.025, 0.18 + ((index + variant) % 3) * 0.025, 0.13]}
            material={materials.shirtHem}
            castShadow
          />
        ))}
        {[-0.29, -0.1, 0.1, 0.29].map((x, index) => (
          <mesh
            key={`rear-${x}`}
            geometry={RAGGED_FLAP_GEOMETRY}
            position={[x, -0.47 - ((index + 1) % 2) * 0.02, -torsoZ * 0.88]}
            rotation={[-0.06, Math.PI, (1.5 - index) * 0.07]}
            scale={[0.16 + (index + 1) % 2 * 0.025, 0.19 + ((index + variant + 1) % 3) * 0.02, 0.13]}
            material={materials.shirtHem}
            castShadow
          />
        ))}
        <mesh geometry={PATCH_GEOMETRY} position={[0.31, -0.16, torsoZ + 0.012]} rotation={[0, 0, -0.3]} scale={[0.08, 0.17, 1]} material={materials.wound} />

        <group ref={leftArm} position={[-(runner ? 0.43 : 0.54), runner ? 0.3 : 0.31, 0]}>
          <mesh geometry={SLEEVE_GEOMETRY} position={[0, -0.17, 0]} scale={runner ? [0.82, 0.9, 0.82] : [1.05, 1, 1.05]} material={materials.shirtHem} castShadow />
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
            <mesh geometry={LIMB_GEOMETRY} position={[0, runner ? -0.32 : -0.29, 0]} scale={[runner ? 0.27 : 0.32, runner ? 0.7 : 0.61, runner ? 0.3 : 0.35]} material={materials.skin} castShadow />
            <mesh geometry={PATCH_GEOMETRY} position={[-0.105, -0.25, 0.075]} rotation={[0, -1.05, 0.2]} scale={[0.06, 0.16, 1]} material={materials.wound} />
            <group position={[0, runner ? -0.68 : -0.62, 0.02]}>
              <ZombieHand material={materials.skinDark} mirror />
            </group>
          </group>
        </group>

        <group ref={rightArm} position={[runner ? 0.43 : 0.54, runner ? 0.27 : 0.29, 0]}>
          <mesh geometry={SLEEVE_GEOMETRY} position={[0, -0.17, 0]} scale={runner ? [0.78, 0.86, 0.78] : [1.04, 1, 1.04]} material={materials.shirtHem} castShadow />
          <group ref={rightForearm} position={[0, -0.34, 0]} rotation={[-0.06, 0, 0]}>
            <mesh geometry={JOINT_GEOMETRY} scale={[0.19, 0.18, 0.2]} material={materials.skinDark} />
            <mesh geometry={LIMB_GEOMETRY} position={[0, runner ? -0.34 : -0.3, 0]} scale={[runner ? 0.26 : 0.32, runner ? 0.74 : 0.63, runner ? 0.29 : 0.35]} material={materials.skin} castShadow />
            <mesh geometry={PATCH_GEOMETRY} position={[0.105, -0.18, 0.06]} rotation={[0, 1.05, -0.15]} scale={[0.07, 0.13, 1]} material={materials.wound} />
            <group position={[0, runner ? -0.72 : -0.64, 0.02]}>
              <ZombieHand material={materials.skinDark} />
            </group>
          </group>
        </group>
      </group>

      <mesh geometry={LIMB_GEOMETRY} position={[0, runner ? 2.09 : 2.04, runner ? 0.08 : 0]} scale={[runner ? 0.19 : 0.23, runner ? 0.34 : 0.29, runner ? 0.19 : 0.23]} material={materials.skinDark} />
      <group ref={head} position={[(variant - 1) * 0.012, runner ? 2.36 : 2.29, runner ? 0.13 : 0.035]}>
        <mesh geometry={HEAD_GEOMETRY} scale={[runner ? 0.53 : 0.61, runner ? 0.8 : 0.74, runner ? 0.55 : 0.59]} material={materials.skin} castShadow />
        <mesh
          ref={jaw}
          geometry={JAW_GEOMETRY}
          position={[(variant - 1) * 0.018, runner ? -0.235 : -0.2, runner ? 0.065 : 0.035]}
          rotation={[runner ? -0.08 : 0, 0, (variant - 1) * 0.055]}
          scale={[runner ? 0.43 : 0.47, runner ? 0.4 : 0.36, 0.47]}
          material={materials.skinDark}
          castShadow
        />
        <mesh geometry={NOSE_GEOMETRY} position={[(variant - 1) * 0.01, -0.025, 0.31]} rotation={[Math.PI / 2, 0, (variant - 1) * 0.08]} material={materials.skinDark} />
        {[-1, 1].map((side) => (
          <group key={side}>
            <mesh geometry={CHEEK_GEOMETRY} position={[side * 0.205, -0.08, 0.205]} rotation={[0.12, 0, side * 0.18]} scale={[0.18, 0.12, 0.15]} material={materials.skinDark} />
            <mesh geometry={EAR_GEOMETRY} position={[side * (runner ? 0.3 : 0.315), -0.01, 0]} scale={[0.13, 0.22, 0.1]} material={materials.skinDark} />
            <mesh geometry={EYE_GEOMETRY} position={[side * 0.125, 0.055, 0.285]} scale={[0.18, 0.115, 0.055]} material={materials.socket} />
            <mesh geometry={EYE_GEOMETRY} position={[side * 0.125, 0.055, 0.315]} scale={[0.055, 0.032, 0.028]} material={materials.eye} />
            <mesh
              geometry={BROW_GEOMETRY}
              position={[side * 0.13, 0.145, 0.302]}
              rotation={[Math.PI / 2, 0, Math.PI / 2 + side * (runner ? 0.2 : 0.13)]}
              scale={[0.78, 0.95, 0.68]}
              material={materials.hair}
            />
          </group>
        ))}
        <mesh
          ref={mouth}
          geometry={PATCH_GEOMETRY}
          position={[(variant - 1) * 0.016, runner ? -0.245 : -0.205, 0.285]}
          rotation={[0, 0, (variant - 1) * 0.08]}
          scale={[runner ? 0.2 : 0.18, runner ? 0.155 : 0.09, 1]}
          material={materials.attackTell}
        />
        {[-0.07, 0, 0.07].map((x, index) => (
          <mesh
            key={x}
            geometry={TEAR_GEOMETRY}
            position={[x + (variant - 1) * 0.014, (runner ? -0.19 : -0.17) - index % 2 * 0.012, 0.294]}
            rotation={[0, 0, (index - 1) * 0.12]}
            scale={[0.035, runner ? 0.06 : 0.045, 1]}
            material={materials.teeth}
          />
        ))}
        <mesh geometry={PATCH_GEOMETRY} position={[variant === 2 ? 0.2 : -0.2, -0.055, 0.277]} rotation={[0, 0, variant === 2 ? -0.3 : 0.3]} scale={[0.105, 0.065, 1]} material={materials.wound} />
        <mesh geometry={PATCH_GEOMETRY} position={[variant === 0 ? 0.21 : -0.21, -0.09, 0.268]} rotation={[0, 0, variant === 0 ? -0.25 : 0.25]} scale={[0.06, 0.12, 1]} material={materials.skinDark} />
        {ENEMY_HAIR.map((clump, index) => (
          <mesh
            key={index}
            geometry={HAIR_GEOMETRY}
            position={[
              clump.p[0] + (index % 4 === variant ? (variant - 1) * 0.018 : 0),
              clump.p[1] + (index % 3 === variant ? 0.018 : 0),
              clump.p[2]
            ]}
            rotation={[clump.r[0], clump.r[1] + (variant - 1) * 0.045, clump.r[2]]}
            scale={[
              clump.s[0] * (index % 3 === variant ? 1.12 : 0.94),
              clump.s[1] * (index % 3 === variant ? 1.1 : 0.96),
              clump.s[2]
            ]}
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

      <group ref={leftLeg} position={[-(runner ? 0.18 : 0.22), runner ? 1.07 : 1.03, runner ? 0.035 : 0.01]} rotation={[0, 0, runner ? 0.025 : -0.018]}>
        <mesh geometry={LIMB_GEOMETRY} position={[0, -0.24, 0]} scale={[runner ? 0.38 : 0.5, runner ? 0.52 : 0.49, runner ? 0.42 : 0.54]} material={materials.trousers} castShadow />
        <mesh geometry={LINE_GEOMETRY} position={[-0.15, -0.24, 0.02]} scale={[0.28, 0.62, 0.28]} material={materials.trousersWear} />
        <group ref={leftShin} position={[0, -0.49, 0]}>
          <mesh geometry={JOINT_GEOMETRY} scale={[0.23, 0.2, 0.25]} material={materials.skinDark} />
          <mesh geometry={PATCH_GEOMETRY} position={[0, 0.01, 0.205]} scale={[0.13, 0.11, 1]} material={materials.wound} />
          {[-0.11, 0, 0.11].map((x, index) => (
            <mesh
              key={`left-knee-${x}`}
              geometry={RAGGED_FLAP_GEOMETRY}
              position={[x, 0.015 + index % 2 * 0.018, 0.2]}
              rotation={[0.1, 0, (index - 1) * 1.5]}
              scale={[0.09, 0.1 + ((index + variant) % 2) * 0.025, 0.1]}
              material={materials.trousersWear}
            />
          ))}
          <mesh geometry={LIMB_GEOMETRY} position={[0, -0.22, 0]} scale={[runner ? 0.35 : 0.45, runner ? 0.48 : 0.44, runner ? 0.4 : 0.51]} material={materials.trousers} castShadow />
          <mesh geometry={PATCH_GEOMETRY} position={[-0.12, -0.19, 0.12]} rotation={[0, -0.75, 0.15]} scale={[0.07, 0.15, 1]} material={materials.trousersWear} />
          <group ref={leftFoot} position={[0, -0.45, 0.1]} rotation={[0, -0.04, 0.02]}>
            <mesh geometry={SHOE_GEOMETRY} position={[0, 0.02, 0.07]} material={materials.shoe} castShadow />
            <mesh geometry={TOE_GEOMETRY} position={[0, 0.015, 0.265]} rotation={[-0.045, 0, 0]} material={materials.shoe} castShadow />
            <mesh geometry={HEEL_GEOMETRY} position={[0, 0.025, -0.205]} material={materials.shoe} castShadow />
            <mesh geometry={SOLE_GEOMETRY} position={[0, -0.09, 0.07]} material={materials.sole} />
            {[0.1, 0.17, 0.24].map((z, index) => (
              <mesh
                key={`left-lace-${z}`}
                geometry={LINE_GEOMETRY}
                position={[0, 0.125 + index * 0.004, z]}
                rotation={[0, 0, Math.PI / 2]}
                scale={[0.26, 0.24 - index * 0.025, 0.26]}
                material={index === 1 ? shoeAccents[variant] : materials.chain}
              />
            ))}
            {[-0.17, -0.03, 0.11, 0.25].map((z) => (
              <mesh key={`left-tread-${z}`} geometry={TREAD_GEOMETRY} position={[0, -0.128, z]} material={materials.sole} />
            ))}
          </group>
        </group>
      </group>

      <group ref={rightLeg} position={[runner ? 0.18 : 0.22, runner ? 1.07 : 1.03, runner ? -0.025 : -0.015]} rotation={[0, 0, runner ? -0.055 : 0.035]}>
        <mesh geometry={LIMB_GEOMETRY} position={[0, -0.24, 0]} scale={[runner ? 0.38 : 0.5, runner ? 0.52 : 0.49, runner ? 0.42 : 0.54]} material={materials.trousers} castShadow />
        <mesh geometry={LINE_GEOMETRY} position={[0.15, -0.24, 0.02]} scale={[0.28, 0.62, 0.28]} material={materials.trousersWear} />
        <group ref={rightShin} position={[0, -0.49, 0]}>
          <mesh geometry={JOINT_GEOMETRY} scale={[0.23, 0.2, 0.25]} material={materials.skinDark} />
          <mesh geometry={PATCH_GEOMETRY} position={[0.01, 0.005, 0.205]} scale={[0.11, 0.09, 1]} material={materials.wound} />
          {[-0.1, 0.01, 0.12].map((x, index) => (
            <mesh
              key={`right-knee-${x}`}
              geometry={RAGGED_FLAP_GEOMETRY}
              position={[x, 0.008 + (index + 1) % 2 * 0.018, 0.2]}
              rotation={[0.1, 0, (index - 1) * 1.45]}
              scale={[0.085, 0.09 + ((index + variant + 1) % 2) * 0.03, 0.1]}
              material={materials.trousersWear}
            />
          ))}
          <mesh geometry={LIMB_GEOMETRY} position={[0, -0.22, 0]} scale={[runner ? 0.35 : 0.45, runner ? 0.48 : 0.44, runner ? 0.4 : 0.51]} material={materials.trousers} castShadow />
          <mesh geometry={PATCH_GEOMETRY} position={[0.12, -0.13, 0.1]} rotation={[0, 0.75, -0.2]} scale={[0.075, 0.12, 1]} material={materials.trousersWear} />
          <group ref={rightFoot} position={[0, -0.45, 0.1]} rotation={[0, 0.06, -0.02]}>
            <mesh geometry={SHOE_GEOMETRY} position={[0, 0.02, 0.07]} material={materials.shoe} castShadow />
            <mesh geometry={TOE_GEOMETRY} position={[0, 0.015, 0.265]} rotation={[-0.045, 0, 0]} material={materials.shoe} castShadow />
            <mesh geometry={HEEL_GEOMETRY} position={[0, 0.025, -0.205]} material={materials.shoe} castShadow />
            <mesh geometry={SOLE_GEOMETRY} position={[0, -0.09, 0.07]} material={materials.sole} />
            {[0.1, 0.17, 0.24].map((z, index) => (
              <mesh
                key={`right-lace-${z}`}
                geometry={LINE_GEOMETRY}
                position={[0, 0.125 + index * 0.004, z]}
                rotation={[0, 0, Math.PI / 2]}
                scale={[0.26, 0.24 - index * 0.025, 0.26]}
                material={index === 1 ? shoeAccents[(variant + 1) % shoeAccents.length] : materials.chain}
              />
            ))}
            {[-0.17, -0.03, 0.11, 0.25].map((z) => (
              <mesh key={`right-tread-${z}`} geometry={TREAD_GEOMETRY} position={[0, -0.128, z]} material={materials.sole} />
            ))}
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
  const attackWindowStarted = useRef(false)
  const recoveryDuration = useRef(ENEMY_TIMINGS[kind].recoveryOnMiss)
  const chargeDirection = useRef(new THREE.Vector3(0, 0, 1))
  const knockVelocity = useRef(new THREE.Vector3())
  const facing = useRef(0)
  const patrolOrigin = useRef(new THREE.Vector3(...spawn))
  const patrolSeed = useMemo(
    () => Array.from(id).reduce((total, character) => total + character.charCodeAt(0), 0),
    [id]
  )
  const patrolDirection = useRef(new THREE.Vector3(
    Math.sin(patrolSeed * 0.71),
    0,
    Math.cos(patrolSeed * 0.71)
  ))
  const patrolTurn = useRef(patrolSeed % 2 === 0 ? 1 : -1)
  const [modelState, setModelState] = useState<EnemyState>('IDLE')
  const [flash, setFlash] = useState(false)
  const flashTimer = useRef<number | null>(null)

  const transition = useCallback((next: EnemyState) => {
    if (stateRef.current === next) return
    stateRef.current = next
    stateTime.current = 0
    attackHit.current = false
    attackWindowStarted.current = false
    if (next === 'ATTACK' && kind === 'runner') {
      chargeDirection.current.copy(playerPosition.current).sub(position.current).setY(0).normalize()
    }
    if (next === 'DEAD') knockVelocity.current.set(0, 0, 0)
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
    const timing = ENEMY_TIMINGS[kind]
    const bodyRadius = kind === 'runner' ? 0.48 : 0.54
    stateTime.current += delta
    attackCooldown.current = Math.max(0, attackCooldown.current - delta)

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
      attackCooldown: attackCooldown.current,
      recoveryDuration: recoveryDuration.current
    })
    if (previousState === 'ATTACK' && next === 'RECOVER') {
      recoveryDuration.current = attackHit.current
        ? timing.recoveryOnHit
        : timing.recoveryOnMiss
      attackCooldown.current = recoveryDuration.current + timing.followupDelay
    }
    transition(next)

    if (stateRef.current === 'STAGGER') {
      const desired = position.current.clone().addScaledVector(knockVelocity.current, delta)
      position.current.copy(resolveWorldMovement(position.current, desired, 0.5, extraColliders))
      knockVelocity.current.multiplyScalar(Math.exp(-6 * delta))
    } else if (stateRef.current === 'PATROL') {
      const fromHome = position.current.clone().sub(patrolOrigin.current).setY(0)
      if (fromHome.lengthSq() > (kind === 'runner' ? 5.3 : 7.3)) {
        patrolDirection.current.copy(fromHome).multiplyScalar(-1).normalize()
      } else {
        patrolDirection.current.applyAxisAngle(
          WORLD_UP,
          patrolTurn.current * delta * (kind === 'runner' ? 0.42 : 0.28)
        )
      }
      const separation = separationForce(id, position.current, combat.targets.current.values(), bodyRadius)
      const movement = patrolDirection.current.clone().addScaledVector(separation, 0.58).normalize()
      const desired = position.current.clone().addScaledVector(
        movement,
        GAME_CONFIG.enemies[kind].speed * timing.patrolSpeedMultiplier * delta
      )
      const moved = resolveWorldMovement(position.current, desired, kind === 'runner' ? 0.48 : 0.5, extraColliders)
      if (moved.distanceToSquared(position.current) < 0.000001) {
        patrolDirection.current.applyAxisAngle(
          WORLD_UP,
          patrolTurn.current * Math.PI * 0.72
        )
        patrolTurn.current *= -1
      }
      position.current.copy(moved)
      facing.current = faceDirection(facing.current, movement, delta, kind === 'runner' ? 8 : 5)
    } else if (stateRef.current === 'DETECT') {
      if (canSee) facing.current = faceDirection(facing.current, direction, delta, kind === 'runner' ? 15 : 10)
    } else if (stateRef.current === 'CHASE') {
      const separation = separationForce(id, position.current, combat.targets.current.values(), bodyRadius)
      const preferredRange = kind === 'runner' ? 1.08 : 1.24
      const approachWeight = THREE.MathUtils.clamp((distance - preferredRange) / 0.82, 0, 1)
      const movement = direction.clone().multiplyScalar(approachWeight)
        .addScaledVector(separation, kind === 'runner' ? 0.82 : 1.08)
      if (movement.lengthSq() > 0.0001) {
        movement.normalize()
        const desired = position.current.clone().addScaledVector(
          movement,
          GAME_CONFIG.enemies[kind].speed * delta * (0.62 + approachWeight * 0.38)
        )
        position.current.copy(resolveWorldMovement(position.current, desired, bodyRadius, extraColliders))
      }
      facing.current = faceDirection(facing.current, direction, delta, kind === 'runner' ? 13 : 7)
    } else if (stateRef.current === 'ATTACK') {
      const inActiveWindow = stateTime.current >= timing.activeStart && stateTime.current <= timing.activeEnd
      if (inActiveWindow && !attackWindowStarted.current) {
        attackWindowStarted.current = true
        combat.emitSound('walker-attack', kind === 'runner' ? 0.58 : 0.7)
      }
      if (kind === 'walker') {
        facing.current = faceDirection(facing.current, direction, delta, 9)
        if (
          inActiveWindow &&
          !attackHit.current &&
          distance <= GAME_CONFIG.enemies.walker.attackRange + 0.45 &&
          canSee
        ) {
          attackHit.current = true
          combat.damagePlayer(GAME_CONFIG.enemies.walker.damage, position.current)
        }
      } else {
        if (stateTime.current < timing.activeStart) {
          facing.current = faceDirection(facing.current, chargeDirection.current, delta, 12)
        } else if (inActiveWindow) {
          const separation = separationForce(id, position.current, combat.targets.current.values(), bodyRadius)
          const chargeMovement = chargeDirection.current.clone().addScaledVector(separation, 0.62).normalize()
          const desired = position.current.clone().addScaledVector(chargeMovement, 8.2 * delta)
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

    const playerCorrection = personalSpaceCorrection(
      position.current,
      playerPosition.current,
      kind === 'runner' ? 0.94 : 1.02,
      patrolSeed
    )
    if (playerCorrection.lengthSq() > 0.000001) {
      const desired = position.current.clone().addScaledVector(playerCorrection, Math.min(1, delta * 18))
      position.current.copy(resolveWorldMovement(position.current, desired, bodyRadius, extraColliders))
    }
    const crowdCorrection = separationForce(
      id,
      position.current,
      combat.targets.current.values(),
      bodyRadius
    )
    if (crowdCorrection.lengthSq() > 0.000001) {
      const desired = position.current.clone().addScaledVector(crowdCorrection, Math.min(0.24, delta * 3.8))
      position.current.copy(resolveWorldMovement(position.current, desired, bodyRadius, extraColliders))
    }

    mesh.position.copy(position.current)
    mesh.rotation.y = facing.current
  })

  return (
    <group ref={group} name={`paper-hand-${kind}-${id}`} position={spawn}>
      <EnemyModel
        kind={kind}
        variantSeed={patrolSeed}
        state={modelState}
        stateTime={stateTime}
        recoveryDuration={recoveryDuration}
        flash={flash}
      />
    </group>
  )
}

export default Enemy
