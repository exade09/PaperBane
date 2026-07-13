import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { Weapon } from './Weapon'
import { useGameStore } from './GameState'
import {
  getPlayerAnimationProgress,
  PLAYER_ANIMATION_TIMING
} from './PlayerAnimationConfig'

export type PlayerAnimation =
  | 'IDLE'
  | 'WALK'
  | 'RUN'
  | 'ATTACK_1'
  | 'ATTACK_2'
  | 'ATTACK_3'
  | 'HEAVY'
  | 'OVERHEAD_STRIKE'
  | 'DODGE'
  | 'DODGE_ROLL'
  | 'MEDKIT_USE'
  | 'WICK_SURGE'
  | 'HIT'
  | 'DEATH'
  | 'VICTORY'

interface PlayerModelProps {
  animation: PlayerAnimation
  surge: boolean
  damageFlash: boolean
}

const damp = (current: number, target: number, delta: number, speed = 14) =>
  THREE.MathUtils.lerp(current, target, 1 - Math.exp(-speed * delta))

const ease = (value: number) => value * value * (3 - 2 * value)

const stagedValue = (
  progress: number,
  rest: number,
  windup: number,
  strike: number,
  windupEnd = 0.34,
  strikeEnd = 0.62
) => {
  if (progress <= windupEnd) return THREE.MathUtils.lerp(rest, windup, ease(progress / windupEnd))
  if (progress <= strikeEnd) {
    return THREE.MathUtils.lerp(windup, strike, ease((progress - windupEnd) / (strikeEnd - windupEnd)))
  }
  return THREE.MathUtils.lerp(strike, rest, ease((progress - strikeEnd) / (1 - strikeEnd)))
}

interface AnimationPose {
  leftArmX: number
  rightArmX: number
  leftArmZ: number
  rightArmZ: number
  leftElbowX: number
  rightElbowX: number
  leftElbowZ: number
  rightElbowZ: number
  leftLegX: number
  rightLegX: number
  leftKneeX: number
  rightKneeX: number
  leftFootX: number
  rightFootX: number
  torsoX: number
  torsoY: number
  torsoZ: number
  rootY: number
  rootX: number
  rootZ: number
  headX: number
  headY: number
  headZ: number
  weaponY: number
  weaponZ: number
  rollX: number
  rollLift: number
}

interface PoseKeyframe {
  at: number
  pose: AnimationPose
}

const IDLE_WEAPON_Z = -0.43

const BASE_POSE: AnimationPose = {
  leftArmX: 0.08,
  rightArmX: -0.18,
  leftArmZ: 0.07,
  rightArmZ: -0.09,
  leftElbowX: -0.08,
  rightElbowX: -0.3,
  leftElbowZ: 0,
  rightElbowZ: 0,
  leftLegX: 0,
  rightLegX: 0,
  leftKneeX: 0.04,
  rightKneeX: 0.04,
  leftFootX: 0,
  rightFootX: 0,
  torsoX: 0,
  torsoY: 0,
  torsoZ: 0,
  rootY: 0,
  rootX: 0,
  rootZ: 0,
  headX: 0.025,
  headY: 0,
  headZ: 0,
  weaponY: 0,
  weaponZ: IDLE_WEAPON_Z,
  rollX: 0,
  rollLift: 0
}

const pose = (overrides: Partial<AnimationPose> = {}): AnimationPose => ({ ...BASE_POSE, ...overrides })

const overheadPhases = PLAYER_ANIMATION_TIMING.OVERHEAD_STRIKE.phases
const dodgePhases = PLAYER_ANIMATION_TIMING.DODGE_ROLL.phases
const medkitPhases = PLAYER_ANIMATION_TIMING.MEDKIT_USE.phases
const surgePhases = PLAYER_ANIMATION_TIMING.WICK_SURGE.phases

const OVERHEAD_STRIKE_KEY_POSES: readonly PoseKeyframe[] = [
  { at: overheadPhases[0].start, pose: pose() },
  {
    at: overheadPhases[0].end,
    pose: pose({
      rightArmX: -0.62, rightArmZ: -0.34, rightElbowX: -0.62,
      leftArmX: -0.42, leftArmZ: 0.38, leftElbowX: -0.72, leftElbowZ: 0.28,
      leftLegX: -0.12, rightLegX: 0.12, leftKneeX: 0.2, rightKneeX: 0.2,
      torsoX: 0.12, torsoY: -0.16, rootY: -0.035, headX: -0.04,
      weaponY: -0.08, weaponZ: -0.18
    })
  },
  {
    at: overheadPhases[1].end,
    pose: pose({
      rightArmX: -2.78, rightArmZ: -0.28, rightElbowX: -0.42, rightElbowZ: -0.08,
      leftArmX: -2.26, leftArmZ: 0.4, leftElbowX: -0.58, leftElbowZ: 0.32,
      leftLegX: -0.16, rightLegX: 0.18, leftKneeX: 0.28, rightKneeX: 0.24,
      torsoX: -0.23, torsoY: -0.28, rootY: 0.025, headX: -0.15, headY: 0.08,
      weaponY: -0.12, weaponZ: -0.24
    })
  },
  {
    at: overheadPhases[2].end,
    pose: pose({
      rightArmX: -2.92, rightArmZ: -0.22, rightElbowX: -0.36, rightElbowZ: -0.08,
      leftArmX: -2.38, leftArmZ: 0.38, leftElbowX: -0.5, leftElbowZ: 0.3,
      leftLegX: -0.18, rightLegX: 0.2, leftKneeX: 0.32, rightKneeX: 0.28,
      torsoX: -0.3, torsoY: -0.34, rootY: 0.035, headX: -0.18, headY: 0.1,
      weaponY: -0.14, weaponZ: -0.28
    })
  },
  {
    at: overheadPhases[3].end,
    pose: pose({
      rightArmX: 0.82, rightArmZ: 0.28, rightElbowX: 0.18, rightElbowZ: 0.06,
      leftArmX: 0.58, leftArmZ: 0.18, leftElbowX: -0.08, leftElbowZ: 0.12,
      leftLegX: 0.15, rightLegX: -0.16, leftKneeX: 0.42, rightKneeX: 0.36,
      torsoX: 0.62, torsoY: 0.35, rootY: -0.13, headX: 0.18, headY: -0.08,
      weaponY: 0.1, weaponZ: 0.28
    })
  },
  { at: overheadPhases[4].end, pose: pose() }
]

const DODGE_ROLL_KEY_POSES: readonly PoseKeyframe[] = [
  { at: dodgePhases[0].start, pose: pose() },
  {
    at: dodgePhases[0].end,
    pose: pose({
      leftArmX: 0.32, rightArmX: 0.2, leftArmZ: 0.25, rightArmZ: -0.22,
      leftElbowX: -0.48, rightElbowX: -0.56,
      leftLegX: -0.2, rightLegX: 0.22, leftKneeX: 0.32, rightKneeX: 0.32,
      torsoX: 0.28, rootY: -0.04, headX: -0.1, weaponZ: -0.2,
      rollX: 0.04, rollLift: -0.03
    })
  },
  {
    at: dodgePhases[1].end,
    pose: pose({
      leftArmX: 0.72, rightArmX: 0.62, leftArmZ: 0.46, rightArmZ: -0.42,
      leftElbowX: -0.75, rightElbowX: -0.82,
      leftLegX: -0.48, rightLegX: 0.5, leftKneeX: 1.08, rightKneeX: 1.04,
      leftFootX: -0.4, rightFootX: -0.38,
      torsoX: 0.68, rootY: -0.1, headX: -0.24, weaponZ: -0.35,
      rollX: 0.34, rollLift: -0.16
    })
  },
  {
    at: dodgePhases[2].end,
    pose: pose({
      leftArmX: 0.95, rightArmX: 0.88, leftArmZ: 0.52, rightArmZ: -0.48,
      leftElbowX: -0.92, rightElbowX: -0.96,
      leftLegX: -0.68, rightLegX: 0.7, leftKneeX: 1.42, rightKneeX: 1.38,
      leftFootX: -0.62, rightFootX: -0.6,
      torsoX: 0.72, headX: -0.3, weaponZ: -0.42,
      rollX: 4.82, rollLift: 0.18
    })
  },
  {
    at: dodgePhases[3].end,
    pose: pose({
      leftArmX: 0.46, rightArmX: 0.36, leftArmZ: 0.3, rightArmZ: -0.28,
      leftElbowX: -0.58, rightElbowX: -0.64,
      leftLegX: 0.38, rightLegX: -0.32, leftKneeX: 0.68, rightKneeX: 0.58,
      leftFootX: -0.24, rightFootX: -0.2,
      torsoX: 0.44, rootY: -0.08, headX: -0.12, weaponZ: -0.24,
      rollX: 6.04, rollLift: -0.1
    })
  },
  { at: dodgePhases[4].end, pose: pose({ rollX: Math.PI * 2 }) }
]

const MEDKIT_KEY_POSES: readonly PoseKeyframe[] = [
  { at: medkitPhases[0].start, pose: pose() },
  { at: medkitPhases[0].end, pose: pose({ leftArmX: 0.18, leftArmZ: 0.55, leftElbowX: -0.8, leftElbowZ: 0.38, rightArmX: 0.2, rightElbowX: -0.36, torsoY: -0.08, headX: 0.08, headY: -0.12, weaponZ: -0.5 }) },
  { at: medkitPhases[1].end, pose: pose({ leftArmX: -0.32, leftArmZ: 0.92, leftElbowX: -1.05, leftElbowZ: 0.44, rightArmX: 0.38, rightArmZ: -0.16, rightElbowX: -0.3, torsoX: 0.08, torsoY: -0.16, headX: 0.18, headY: -0.18, weaponZ: -0.58 }) },
  { at: medkitPhases[2].end, pose: pose({ leftArmX: -0.42, leftArmZ: 1.02, leftElbowX: -1.16, leftElbowZ: 0.48, rightArmX: 0.46, rightArmZ: -0.18, rightElbowX: -0.26, torsoX: 0.1, torsoY: -0.2, headX: 0.22, headY: -0.2, weaponZ: -0.62 }) },
  { at: medkitPhases[3].end, pose: pose({ leftArmX: 0.12, leftArmZ: 0.5, leftElbowX: -0.72, leftElbowZ: 0.28, rightArmX: 0.18, rightElbowX: -0.32, torsoY: -0.06, headX: 0.08, weaponZ: -0.5 }) },
  { at: medkitPhases[4].end, pose: pose() }
]

const WICK_SURGE_KEY_POSES: readonly PoseKeyframe[] = [
  { at: surgePhases[0].start, pose: pose() },
  { at: surgePhases[0].end, pose: pose({ leftArmX: 0.48, rightArmX: 0.62, leftElbowX: -0.52, rightElbowX: -0.58, leftKneeX: 0.32, rightKneeX: 0.32, torsoX: 0.3, rootY: -0.08, headX: -0.12, weaponZ: -0.3 }) },
  { at: surgePhases[1].end, pose: pose({ leftArmX: -1.1, leftArmZ: 0.46, leftElbowX: -0.72, leftElbowZ: 0.25, rightArmX: -1.35, rightArmZ: -0.24, rightElbowX: -0.52, torsoX: -0.08, torsoY: -0.18, headX: -0.08, weaponZ: -0.22 }) },
  { at: surgePhases[2].end, pose: pose({ leftArmX: -2.14, leftArmZ: 0.38, leftElbowX: -0.48, leftElbowZ: 0.24, rightArmX: -2.7, rightArmZ: -0.2, rightElbowX: -0.34, torsoX: -0.24, torsoY: -0.22, rootY: 0.04, headX: -0.16, weaponZ: -0.2 }) },
  { at: surgePhases[3].end, pose: pose({ leftArmX: -2.08, leftArmZ: 0.4, leftElbowX: -0.5, leftElbowZ: 0.24, rightArmX: -2.64, rightArmZ: -0.18, rightElbowX: -0.36, torsoX: -0.2, torsoY: 0.12, rootY: 0.03, headX: -0.12, weaponZ: -0.18 }) },
  { at: surgePhases[4].end, pose: pose() }
]

const poseChannels = Object.keys(BASE_POSE) as Array<keyof AnimationPose>

const samplePose = (keyframes: readonly PoseKeyframe[], progress: number): AnimationPose => {
  const clamped = THREE.MathUtils.clamp(progress, 0, 1)
  let nextIndex = keyframes.findIndex((keyframe) => clamped <= keyframe.at)
  if (nextIndex <= 0) return { ...keyframes[0].pose }
  if (nextIndex < 0) nextIndex = keyframes.length - 1
  const previous = keyframes[nextIndex - 1]
  const next = keyframes[nextIndex]
  const span = Math.max(0.0001, next.at - previous.at)
  const blend = ease((clamped - previous.at) / span)
  const result = { ...BASE_POSE }
  poseChannels.forEach((channel) => {
    result[channel] = THREE.MathUtils.lerp(previous.pose[channel], next.pose[channel], blend)
  })
  return result
}

const makeTaperedPrismGeometry = (
  topWidth: number,
  bottomWidth: number,
  height: number,
  topDepth: number,
  bottomDepth: number
) => {
  const geometry = new THREE.BufferGeometry()
  const topY = height * 0.5
  const bottomY = -topY
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    -topWidth * 0.5, topY, -topDepth * 0.5,
    topWidth * 0.5, topY, -topDepth * 0.5,
    topWidth * 0.5, topY, topDepth * 0.5,
    -topWidth * 0.5, topY, topDepth * 0.5,
    -bottomWidth * 0.5, bottomY, -bottomDepth * 0.5,
    bottomWidth * 0.5, bottomY, -bottomDepth * 0.5,
    bottomWidth * 0.5, bottomY, bottomDepth * 0.5,
    -bottomWidth * 0.5, bottomY, bottomDepth * 0.5
  ], 3))
  geometry.setIndex([
    0, 2, 1, 0, 3, 2,
    4, 5, 6, 4, 6, 7,
    0, 1, 5, 0, 5, 4,
    1, 2, 6, 1, 6, 5,
    2, 3, 7, 2, 7, 6,
    3, 0, 4, 3, 4, 7
  ])
  geometry.computeVertexNormals()
  return geometry
}

const TORSO_GEOMETRY = new THREE.CylinderGeometry(0.53, 0.45, 1, 9, 3)
const LIMB_GEOMETRY = new THREE.CapsuleGeometry(0.34, 0.32, 4, 8)
const HEAD_GEOMETRY = new THREE.IcosahedronGeometry(0.5, 2)
const JAW_GEOMETRY = new THREE.DodecahedronGeometry(0.5, 1)
const JOINT_GEOMETRY = new THREE.DodecahedronGeometry(0.5, 1)
const HAND_GEOMETRY = new THREE.IcosahedronGeometry(0.5, 2)
const FINGER_GEOMETRY = new THREE.CapsuleGeometry(0.035, 0.1, 3, 7)
const HAIR_GEOMETRY = new THREE.ConeGeometry(0.5, 1, 5)
const HAIR_LOCK_GEOMETRY = new THREE.ConeGeometry(0.5, 1, 5)
const NOSE_GEOMETRY = new THREE.ConeGeometry(0.065, 0.19, 7)
const EAR_GEOMETRY = new THREE.SphereGeometry(0.5, 8, 6)
const EYE_GEOMETRY = new THREE.SphereGeometry(0.5, 9, 6)
const LINE_GEOMETRY = new THREE.CapsuleGeometry(0.035, 0.5, 2, 5)
const CUFF_GEOMETRY = new THREE.CylinderGeometry(0.17, 0.16, 0.095, 9, 2)
const COLLAR_GEOMETRY = new THREE.CylinderGeometry(0.43, 0.4, 0.34, 9, 2, true)
const COLLAR_RIM_GEOMETRY = new THREE.TorusGeometry(0.415, 0.025, 5, 9)
const SHIRT_PANEL_GEOMETRY = new RoundedBoxGeometry(0.52, 0.76, 0.035, 2, 0.035)
const BACK_PANEL_GEOMETRY = new RoundedBoxGeometry(0.69, 0.72, 0.04, 2, 0.035)
const BACK_YOKE_GEOMETRY = new RoundedBoxGeometry(0.78, 0.24, 0.05, 2, 0.045)
const BACK_SIDE_PANEL_GEOMETRY = makeTaperedPrismGeometry(0.22, 0.27, 0.61, 0.05, 0.045)
const POCKET_GEOMETRY = new RoundedBoxGeometry(0.2, 0.27, 0.035, 3, 0.025)
const MEDKIT_GEOMETRY = new RoundedBoxGeometry(0.25, 0.31, 0.13, 2, 0.035)
const MEDKIT_CROSS_GEOMETRY = new RoundedBoxGeometry(0.055, 0.18, 0.018, 1, 0.012)
const BOOT_GEOMETRY = new RoundedBoxGeometry(0.39, 0.25, 0.59, 3, 0.055)
const SOLE_GEOMETRY = new RoundedBoxGeometry(0.42, 0.085, 0.63, 3, 0.025)
const BOOT_SHAFT_GEOMETRY = makeTaperedPrismGeometry(0.34, 0.39, 0.3, 0.34, 0.42)
const BOOT_HEEL_GEOMETRY = new RoundedBoxGeometry(0.34, 0.13, 0.25, 2, 0.035)
const BOOT_TOE_GEOMETRY = makeTaperedPrismGeometry(0.34, 0.41, 0.16, 0.27, 0.38)
const SHOULDER_GEOMETRY = makeTaperedPrismGeometry(0.34, 0.25, 0.34, 0.38, 0.31)
const TROUSER_FOLD_GEOMETRY = new THREE.CapsuleGeometry(0.025, 0.22, 2, 5)
const PATCH_GEOMETRY = new THREE.CircleGeometry(0.5, 6)

const HAIR_CLUMPS = [
  { p: [-0.2, 0.29, 0.02], s: [0.31, 0.3, 0.31], r: [0.4, 0.1, -0.2] },
  { p: [0.02, 0.34, 0.01], s: [0.34, 0.31, 0.34], r: [0.2, 0.5, 0.1] },
  { p: [0.23, 0.27, 0.01], s: [0.29, 0.28, 0.3], r: [0.3, -0.3, 0.25] },
  { p: [-0.3, 0.16, 0.02], s: [0.24, 0.31, 0.28], r: [-0.1, 0.2, -0.42] },
  { p: [0.31, 0.14, 0.02], s: [0.25, 0.3, 0.27], r: [0.1, -0.2, 0.4] },
  { p: [-0.18, 0.2, 0.25], s: [0.25, 0.37, 0.23], r: [-0.25, 0.25, -0.15] },
  { p: [0.02, 0.24, 0.28], s: [0.28, 0.4, 0.22], r: [-0.35, -0.25, 0.1] },
  { p: [0.2, 0.2, 0.24], s: [0.24, 0.35, 0.22], r: [-0.2, 0.3, 0.25] },
  { p: [-0.27, 0.02, 0.22], s: [0.17, 0.33, 0.18], r: [-0.4, 0, -0.18] },
  { p: [0.29, 0.03, 0.21], s: [0.17, 0.3, 0.18], r: [-0.35, 0, 0.2] },
  { p: [-0.22, 0.22, -0.2], s: [0.3, 0.32, 0.3], r: [0.22, -0.2, -0.28] },
  { p: [0.02, 0.28, -0.24], s: [0.34, 0.34, 0.32], r: [0.18, 0.35, 0.05] },
  { p: [0.23, 0.2, -0.2], s: [0.29, 0.31, 0.29], r: [0.25, -0.25, 0.3] },
  { p: [-0.3, 0.03, -0.15], s: [0.22, 0.3, 0.24], r: [0.08, 0.25, -0.38] },
  { p: [0.3, 0.02, -0.14], s: [0.22, 0.29, 0.24], r: [0.12, -0.2, 0.36] }
] as const

const NAPE_LOCKS = [
  { p: [-0.24, -0.1, -0.2], s: [0.18, 0.25, 0.17], r: [-0.18, 0.15, -0.28] },
  { p: [-0.08, -0.14, -0.27], s: [0.2, 0.29, 0.19], r: [-0.1, -0.2, -0.12] },
  { p: [0.1, -0.14, -0.27], s: [0.2, 0.28, 0.19], r: [-0.12, 0.22, 0.13] },
  { p: [0.25, -0.09, -0.19], s: [0.18, 0.24, 0.17], r: [-0.2, -0.16, 0.3] }
] as const

const createDirtyShirtTexture = () => {
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 384
  const context = canvas.getContext('2d')
  if (!context) return null
  context.fillStyle = '#65665f'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.fillStyle = 'rgba(35, 29, 25, .28)'
  for (let index = 0; index < 34; index += 1) {
    const x = (index * 73 + 19) % 246
    const y = (index * 109 + 31) % 368
    const width = 5 + (index % 5) * 5
    const height = 8 + (index % 4) * 8
    context.beginPath()
    context.moveTo(x, y)
    context.lineTo(x + width, y + 3)
    context.lineTo(x + width * 0.55, y + height)
    context.lineTo(x - 3, y + height * 0.58)
    context.fill()
  }
  context.strokeStyle = 'rgba(195, 188, 173, .12)'
  context.lineWidth = 2
  for (let index = 0; index < 12; index += 1) {
    const y = 18 + index * 31
    context.beginPath()
    context.moveTo(0, y)
    context.lineTo(256, y + (index % 3) * 5)
    context.stroke()
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  return texture
}

function PlayerHand({
  material,
  mirror = false,
  gripping = false
}: {
  material: THREE.Material
  mirror?: boolean
  gripping?: boolean
}) {
  return (
    <group>
      <mesh geometry={HAND_GEOMETRY} scale={[0.22, gripping ? 0.22 : 0.25, 0.18]} material={material} castShadow />
      {[-0.07, 0, 0.07].map((x, index) => (
        <mesh
          key={x}
          geometry={FINGER_GEOMETRY}
          position={[x, gripping ? -0.105 : -0.17 - index * 0.008, gripping ? 0.085 : 0.035]}
          rotation={[gripping ? 1.15 : 0.35, 0, (mirror ? -1 : 1) * (x * 1.2)]}
          scale={[0.8, (1 - index * 0.08) * (gripping ? 0.88 : 1), 0.85]}
          material={material}
          castShadow
        />
      ))}
      <mesh
        geometry={FINGER_GEOMETRY}
        position={[mirror ? 0.13 : -0.13, gripping ? -0.01 : -0.075, 0.06]}
        rotation={[gripping ? 0.9 : 0.35, 0, mirror ? -0.72 : 0.72]}
        scale={[0.92, 0.72, 0.92]}
        material={material}
        castShadow
      />
    </group>
  )
}

export function PlayerModel({ animation, surge, damageFlash }: PlayerModelProps) {
  const root = useRef<THREE.Group>(null)
  const rollRig = useRef<THREE.Group>(null)
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
  const weaponMount = useRef<THREE.Group>(null)
  const medkitProp = useRef<THREE.Group>(null)
  const actionTime = useRef(0)

  const shirtTexture = useMemo(createDirtyShirtTexture, [])
  const materials = useMemo(() => ({
    jacket: new THREE.MeshStandardMaterial({
      color: '#484950', emissive: '#202128', emissiveIntensity: 0.48, roughness: 0.91, metalness: 0.03, flatShading: true
    }),
    jacketDark: new THREE.MeshStandardMaterial({ color: '#30323a', emissive: '#16171b', emissiveIntensity: 0.26, roughness: 0.95, flatShading: true }),
    jacketWear: new THREE.MeshStandardMaterial({ color: '#48424b', roughness: 1, flatShading: true }),
    trim: new THREE.MeshStandardMaterial({
      color: '#72e53c', emissive: '#357f24', emissiveIntensity: 0.38, roughness: 0.58, flatShading: true
    }),
    purple: new THREE.MeshStandardMaterial({
      color: '#7f4aaa', emissive: '#4c246f', emissiveIntensity: 0.45, roughness: 0.67, flatShading: true
    }),
    medkit: new THREE.MeshStandardMaterial({ color: '#27312b', roughness: 0.82, metalness: 0.08, flatShading: true }),
    medkitCross: new THREE.MeshStandardMaterial({
      color: '#78ed43', emissive: '#3b9b24', emissiveIntensity: 0.72, roughness: 0.52, flatShading: true, toneMapped: false
    }),
    shirt: new THREE.MeshStandardMaterial({
      map: shirtTexture, color: '#b0b0a8', emissive: '#252622', emissiveIntensity: 0.16, roughness: 1, flatShading: true
    }),
    skin: new THREE.MeshStandardMaterial({
      color: '#806b58', emissive: '#c33a3a', emissiveIntensity: 0, roughness: 1, flatShading: true
    }),
    skinDark: new THREE.MeshStandardMaterial({ color: '#564438', roughness: 1, flatShading: true }),
    damage: new THREE.MeshStandardMaterial({ color: '#67372f', roughness: 1, flatShading: true }),
    hair: new THREE.MeshStandardMaterial({ color: '#111216', roughness: 0.96, flatShading: true }),
    eyeSocket: new THREE.MeshStandardMaterial({ color: '#241c1a', roughness: 1, flatShading: true }),
    eye: new THREE.MeshStandardMaterial({ color: '#b7b2a1', roughness: 0.75, flatShading: true }),
    pupil: new THREE.MeshBasicMaterial({ color: '#10100f' }),
    trousers: new THREE.MeshStandardMaterial({ color: '#424349', emissive: '#1c1d21', emissiveIntensity: 0.24, roughness: 1, flatShading: true }),
    trousersWear: new THREE.MeshStandardMaterial({ color: '#403b37', roughness: 1, flatShading: true }),
    boot: new THREE.MeshStandardMaterial({
      color: '#2d2924', emissive: '#12110f', emissiveIntensity: 0.16, roughness: 0.83, metalness: 0.08, flatShading: true
    }),
    sole: new THREE.MeshStandardMaterial({ color: '#090a09', roughness: 0.92, flatShading: true })
  }), [shirtTexture])

  useEffect(() => {
    actionTime.current = 0
    if (animation !== 'DODGE' && animation !== 'DODGE_ROLL' && rollRig.current) {
      rollRig.current.rotation.set(0, 0, 0)
      rollRig.current.position.set(0, 1.3, 0)
    }
  }, [animation])

  useEffect(() => () => {
    Object.values(materials).forEach((material) => material.dispose())
    shirtTexture?.dispose()
  }, [materials, shirtTexture])

  useFrame(({ clock }, delta) => {
    const status = useGameStore.getState().status
    if (status === 'PAUSED' || status === 'BOSS_INTRO') return
    actionTime.current += delta
    const time = actionTime.current
    const worldTime = clock.elapsedTime
    const breathing = Math.sin(worldTime * 1.8)
    let leftArmX = 0.08
    let rightArmX = -0.18
    let leftArmZ = 0.07
    let rightArmZ = -0.09
    let leftElbowX = -0.08
    let rightElbowX = -0.3
    let leftElbowZ = 0
    let rightElbowZ = 0
    let leftLegX = 0
    let rightLegX = 0
    let leftKneeX = 0.04
    let rightKneeX = 0.04
    let leftFootX = 0
    let rightFootX = 0
    let torsoX = breathing * 0.012
    let torsoY = 0
    let torsoZ = 0
    let rootY = breathing * 0.012
    let rootX = 0
    let rootZ = 0
    let headX = 0.025
    let headY = Math.sin(worldTime * 0.47) * 0.04
    let headZ = 0
    let weaponY = 0
    let weaponZ = IDLE_WEAPON_Z
    let rollX = 0
    let rollLift = 0

    const applyPose = (nextPose: AnimationPose) => {
      leftArmX = nextPose.leftArmX
      rightArmX = nextPose.rightArmX
      leftArmZ = nextPose.leftArmZ
      rightArmZ = nextPose.rightArmZ
      leftElbowX = nextPose.leftElbowX
      rightElbowX = nextPose.rightElbowX
      leftElbowZ = nextPose.leftElbowZ
      rightElbowZ = nextPose.rightElbowZ
      leftLegX = nextPose.leftLegX
      rightLegX = nextPose.rightLegX
      leftKneeX = nextPose.leftKneeX
      rightKneeX = nextPose.rightKneeX
      leftFootX = nextPose.leftFootX
      rightFootX = nextPose.rightFootX
      torsoX = nextPose.torsoX
      torsoY = nextPose.torsoY
      torsoZ = nextPose.torsoZ
      rootY = nextPose.rootY
      rootX = nextPose.rootX
      rootZ = nextPose.rootZ
      headX = nextPose.headX
      headY = nextPose.headY
      headZ = nextPose.headZ
      weaponY = nextPose.weaponY
      weaponZ = nextPose.weaponZ
      rollX = nextPose.rollX
      rollLift = nextPose.rollLift
    }

    if (animation === 'WALK' || animation === 'RUN') {
      const running = animation === 'RUN'
      const rate = running ? 10.4 : 6.7
      const stride = running ? 0.72 : 0.48
      const phase = Math.sin(worldTime * rate)
      const swing = phase * stride
      leftLegX = swing
      rightLegX = -swing
      leftKneeX = Math.max(0, -phase) * (running ? 0.82 : 0.48) + 0.04
      rightKneeX = Math.max(0, phase) * (running ? 0.82 : 0.48) + 0.04
      leftFootX = -leftLegX * 0.18 - leftKneeX * 0.55
      rightFootX = -rightLegX * 0.18 - rightKneeX * 0.55
      leftArmX = -swing * (running ? 0.62 : 0.5) + 0.08
      rightArmX = swing * (running ? 0.48 : 0.38) - 0.2
      leftElbowX = running ? -0.3 : -0.12
      rightElbowX = running ? -0.48 : -0.34
      torsoX = running ? 0.15 : 0.055
      torsoY = -phase * (running ? 0.1 : 0.07)
      torsoZ = phase * (running ? 0.025 : 0.018)
      headX = running ? -0.07 : 0.015
      headY = phase * -0.04
      rootY = Math.abs(Math.sin(worldTime * rate)) * (running ? 0.065 : 0.038)
      weaponZ = IDLE_WEAPON_Z - 0.04 + phase * 0.035
    } else if (animation.startsWith('ATTACK')) {
      const progress = getPlayerAnimationProgress('LIGHT_ATTACK', time, surge ? 1.18 : 1)
      if (animation === 'ATTACK_1') {
        rightArmX = stagedValue(progress, -0.18, -0.72, 0.34)
        rightArmZ = stagedValue(progress, -0.09, -1.08, 0.92)
        rightElbowX = stagedValue(progress, -0.3, -0.62, 0.08)
        leftArmX = stagedValue(progress, 0.08, -0.46, 0.28)
        leftArmZ = stagedValue(progress, 0.07, -0.35, 0.45)
        leftElbowX = stagedValue(progress, -0.08, -0.72, -0.35)
        torsoY = stagedValue(progress, 0, -0.48, 0.64)
        torsoX = stagedValue(progress, 0, -0.08, 0.18)
        weaponY = stagedValue(progress, 0, -0.22, 0.2)
        weaponZ = stagedValue(progress, IDLE_WEAPON_Z, -0.42, 0.32)
      } else if (animation === 'ATTACK_2') {
        rightArmX = stagedValue(progress, -0.18, -0.48, 0.42, 0.3, 0.57)
        rightArmZ = stagedValue(progress, -0.09, 0.92, -1.04, 0.3, 0.57)
        rightElbowX = stagedValue(progress, -0.3, -0.78, 0.02, 0.3, 0.57)
        leftArmX = stagedValue(progress, 0.08, -0.35, 0.38, 0.3, 0.57)
        leftArmZ = stagedValue(progress, 0.07, 0.42, -0.32, 0.3, 0.57)
        leftElbowX = stagedValue(progress, -0.08, -0.66, -0.28, 0.3, 0.57)
        torsoY = stagedValue(progress, 0, 0.52, -0.62, 0.3, 0.57)
        torsoX = stagedValue(progress, 0, -0.04, 0.2, 0.3, 0.57)
        weaponY = stagedValue(progress, 0, 0.18, -0.22, 0.3, 0.57)
        weaponZ = stagedValue(progress, IDLE_WEAPON_Z, 0.28, -0.35, 0.3, 0.57)
      } else {
        rightArmX = stagedValue(progress, -0.18, -2.55, 0.68, 0.38, 0.66)
        rightArmZ = stagedValue(progress, -0.09, -0.18, 0.28, 0.38, 0.66)
        rightElbowX = stagedValue(progress, -0.3, -0.54, 0.16, 0.38, 0.66)
        leftArmX = stagedValue(progress, 0.08, -1.72, 0.45, 0.38, 0.66)
        leftArmZ = stagedValue(progress, 0.07, 0.42, 0.18, 0.38, 0.66)
        leftElbowX = stagedValue(progress, -0.08, -0.7, -0.12, 0.38, 0.66)
        torsoX = stagedValue(progress, 0, -0.16, 0.42, 0.38, 0.66)
        torsoY = stagedValue(progress, 0, -0.22, 0.3, 0.38, 0.66)
        rootY = stagedValue(progress, 0, 0.025, -0.08, 0.38, 0.66)
        weaponZ = stagedValue(progress, IDLE_WEAPON_Z, -0.18, 0.2, 0.38, 0.66)
      }
      headY = -torsoY * 0.22
      headX = torsoX * -0.18
    } else if (animation === 'HEAVY' || animation === 'OVERHEAD_STRIKE') {
      const progress = getPlayerAnimationProgress('OVERHEAD_STRIKE', time, surge ? 1.18 : 1)
      applyPose(samplePose(OVERHEAD_STRIKE_KEY_POSES, progress))
    } else if (animation === 'DODGE' || animation === 'DODGE_ROLL') {
      const progress = getPlayerAnimationProgress('DODGE_ROLL', time)
      applyPose(samplePose(DODGE_ROLL_KEY_POSES, progress))
    } else if (animation === 'MEDKIT_USE') {
      const progress = getPlayerAnimationProgress('MEDKIT_USE', time)
      applyPose(samplePose(MEDKIT_KEY_POSES, progress))
    } else if (animation === 'WICK_SURGE') {
      const progress = getPlayerAnimationProgress('WICK_SURGE', time)
      applyPose(samplePose(WICK_SURGE_KEY_POSES, progress))
    } else if (animation === 'HIT') {
      const recoil = Math.sin(Math.min(1, time / 0.38) * Math.PI)
      torsoX = -recoil * 0.34
      torsoZ = recoil * 0.19
      rootZ = recoil * -0.08
      leftArmX = recoil * 0.84
      rightArmX = recoil * 0.68
      leftElbowX = -0.2
      rightElbowX = -0.25
      headX = -recoil * 0.22
      headZ = recoil * 0.12
    } else if (animation === 'DEATH') {
      const fall = ease(Math.min(1, time / 1.15))
      rootX = fall * Math.PI * 0.48
      rootZ = -fall * 0.08
      rootY = -fall * 0.06
      leftArmX = 0.92
      rightArmX = 0.72
      leftElbowX = 0.2
      rightElbowX = 0.28
      leftLegX = -0.18
      rightLegX = 0.2
      headX = 0.18
    } else if (animation === 'VICTORY') {
      rightArmX = -2.8
      rightArmZ = -0.18
      rightElbowX = -0.18
      leftArmX = -1.1
      leftArmZ = 0.28
      leftElbowX = -0.58
      torsoX = -0.09
      torsoY = Math.sin(worldTime * 1.8) * 0.06
      rootY = Math.sin(worldTime * 2.3) * 0.018
      headX = -0.05
      headY = -0.12
    }

    if (root.current) {
      root.current.rotation.x = damp(root.current.rotation.x, rootX, delta, animation === 'DEATH' ? 3.8 : 13)
      root.current.rotation.z = damp(root.current.rotation.z, rootZ, delta)
      root.current.position.y = damp(root.current.position.y, rootY, delta)
    }
    if (rollRig.current) {
      if (animation === 'DODGE' || animation === 'DODGE_ROLL') {
        rollRig.current.rotation.x = rollX
        rollRig.current.position.y = 1.3 + rollLift
      } else {
        rollRig.current.rotation.x = damp(rollRig.current.rotation.x, 0, delta, 18)
        rollRig.current.position.y = damp(rollRig.current.position.y, 1.3, delta, 18)
      }
    }
    if (torso.current) {
      torso.current.position.y = damp(torso.current.position.y, 1.56 + breathing * 0.009, delta, 8)
      torso.current.rotation.x = damp(torso.current.rotation.x, torsoX, delta)
      torso.current.rotation.y = damp(torso.current.rotation.y, torsoY, delta)
      torso.current.rotation.z = damp(torso.current.rotation.z, torsoZ, delta)
    }
    if (head.current) {
      head.current.rotation.x = damp(head.current.rotation.x, headX, delta, 10)
      head.current.rotation.y = damp(head.current.rotation.y, headY, delta, 10)
      head.current.rotation.z = damp(head.current.rotation.z, headZ, delta, 10)
    }
    if (leftArm.current) {
      leftArm.current.rotation.x = damp(leftArm.current.rotation.x, leftArmX, delta, 16)
      leftArm.current.rotation.z = damp(leftArm.current.rotation.z, leftArmZ, delta, 16)
    }
    if (rightArm.current) {
      rightArm.current.rotation.x = damp(rightArm.current.rotation.x, rightArmX, delta, 18)
      rightArm.current.rotation.z = damp(rightArm.current.rotation.z, rightArmZ, delta, 18)
    }
    if (leftForearm.current) {
      leftForearm.current.rotation.x = damp(leftForearm.current.rotation.x, leftElbowX, delta, 17)
      leftForearm.current.rotation.z = damp(leftForearm.current.rotation.z, leftElbowZ, delta, 17)
    }
    if (rightForearm.current) {
      rightForearm.current.rotation.x = damp(rightForearm.current.rotation.x, rightElbowX, delta, 17)
      rightForearm.current.rotation.z = damp(rightForearm.current.rotation.z, rightElbowZ, delta, 17)
    }
    if (leftLeg.current) leftLeg.current.rotation.x = damp(leftLeg.current.rotation.x, leftLegX, delta)
    if (rightLeg.current) rightLeg.current.rotation.x = damp(rightLeg.current.rotation.x, rightLegX, delta)
    if (leftShin.current) leftShin.current.rotation.x = damp(leftShin.current.rotation.x, leftKneeX, delta, 16)
    if (rightShin.current) rightShin.current.rotation.x = damp(rightShin.current.rotation.x, rightKneeX, delta, 16)
    if (leftFoot.current) leftFoot.current.rotation.x = damp(leftFoot.current.rotation.x, leftFootX, delta, 15)
    if (rightFoot.current) rightFoot.current.rotation.x = damp(rightFoot.current.rotation.x, rightFootX, delta, 15)
    if (weaponMount.current) {
      weaponMount.current.rotation.y = damp(weaponMount.current.rotation.y, weaponY, delta, 18)
      weaponMount.current.rotation.z = damp(weaponMount.current.rotation.z, weaponZ, delta, 18)
    }
    if (medkitProp.current) medkitProp.current.visible = animation === 'MEDKIT_USE'

    materials.jacket.emissive.set(damageFlash ? '#c33a3a' : '#202128')
    materials.jacket.emissiveIntensity = damageFlash ? 1.65 : 0.48
    materials.skin.emissiveIntensity = damageFlash ? 1.05 : 0
    materials.trim.emissiveIntensity = surge || animation === 'WICK_SURGE'
      ? 1.3 + Math.sin(worldTime * 8) * 0.25
      : 0.38
  })

  const overheadStrike = animation === 'HEAVY' || animation === 'OVERHEAD_STRIKE'
  const attacking = animation.startsWith('ATTACK') || overheadStrike
  const surgeVisual = surge || animation === 'WICK_SURGE'

  return (
    <group ref={root} dispose={null}>
      <group ref={rollRig} position={[0, 1.3, 0]}>
        <group position={[0, -1.3, 0]}>
      <group ref={torso} position={[0, 1.56, 0]}>
        <mesh geometry={TORSO_GEOMETRY} scale={[0.93, 1, 0.67]} castShadow material={materials.jacket} />
        <mesh geometry={COLLAR_GEOMETRY} position={[0, 0.48, -0.015]} scale={[1, 1, 0.73]} castShadow material={materials.jacketDark} />
        <mesh
          geometry={COLLAR_RIM_GEOMETRY}
          position={[0, 0.645, -0.015]}
          rotation={[Math.PI / 2, 0, 0]}
          scale={[1, 0.73, 1]}
          material={materials.trim}
        />
        <mesh geometry={SHIRT_PANEL_GEOMETRY} position={[0, -0.02, 0.342]} material={materials.shirt} />
        <mesh geometry={BACK_PANEL_GEOMETRY} position={[0, -0.04, -0.348]} material={materials.jacket} castShadow />
        <mesh geometry={BACK_YOKE_GEOMETRY} position={[0, 0.29, -0.374]} material={materials.jacketWear} castShadow />
        {[-1, 1].map((side) => (
          <group key={`back-${side}`}>
            <mesh
              geometry={BACK_SIDE_PANEL_GEOMETRY}
              position={[side * 0.3, -0.08, -0.377]}
              rotation={[0, 0, side * -0.045]}
              material={materials.jacketDark}
            />
            <mesh
              geometry={LINE_GEOMETRY}
              position={[side * 0.2, 0.16, -0.401]}
              rotation={[0, 0, side * 0.5]}
              scale={[0.34, 0.46, 0.34]}
              material={materials.jacketDark}
            />
          </group>
        ))}
        {[-1, 1].map((side) => (
          <group key={side}>
            <mesh
              geometry={LINE_GEOMETRY}
              position={[side * 0.29, 0.16, 0.37]}
              rotation={[0, 0, side * -0.27]}
              scale={[0.62, 1.05, 0.62]}
              material={materials.trim}
            />
            <mesh
              geometry={POCKET_GEOMETRY}
              position={[side * 0.31, -0.2, 0.35]}
              rotation={[0, 0, side * -0.08]}
              material={materials.jacketDark}
            />
            <mesh
              geometry={LINE_GEOMETRY}
              position={[side * 0.31, -0.06, 0.375]}
              rotation={[0, 0, Math.PI / 2]}
              scale={[0.55, 0.28, 0.55]}
              material={materials.trim}
            />
          </group>
        ))}
        <mesh
          geometry={LINE_GEOMETRY}
          position={[0, -0.48, 0.33]}
          rotation={[0, 0, Math.PI / 2]}
          scale={[0.7, 1.7, 0.68]}
          material={materials.trim}
        />
        <mesh
          geometry={LINE_GEOMETRY}
          position={[0, -0.48, -0.33]}
          rotation={[0, 0, Math.PI / 2]}
          scale={[0.7, 1.7, 0.68]}
          material={materials.trim}
        />
        <mesh geometry={PATCH_GEOMETRY} position={[-0.27, 0.12, -0.407]} rotation={[0, Math.PI, 0.25]} scale={[0.1, 0.17, 1]} material={materials.jacketWear} />
        <mesh geometry={PATCH_GEOMETRY} position={[0.3, -0.12, -0.407]} rotation={[0, Math.PI, -0.3]} scale={[0.08, 0.14, 1]} material={materials.purple} />
        <mesh geometry={LINE_GEOMETRY} position={[0, -0.04, -0.405]} scale={[0.32, 1.18, 0.32]} material={materials.jacketDark} />
        <mesh geometry={PATCH_GEOMETRY} position={[0, -0.39, -0.411]} rotation={[0, Math.PI, Math.PI]} scale={[0.075, 0.12, 1]} material={materials.jacketDark} />

        <group ref={leftArm} position={[-0.56, 0.37, 0]}>
          <mesh geometry={SHOULDER_GEOMETRY} position={[0, -0.08, 0]} rotation={[0, 0, -0.12]} material={materials.jacket} castShadow />
          <mesh geometry={LIMB_GEOMETRY} position={[0, -0.28, 0]} scale={[0.43, 0.58, 0.47]} material={materials.jacket} castShadow />
          <mesh geometry={PATCH_GEOMETRY} position={[-0.145, -0.14, 0]} rotation={[0, -Math.PI / 2, 0]} scale={[0.11, 0.18, 1]} material={materials.purple} />
          <group ref={leftForearm} position={[0, -0.55, 0]}>
            <mesh geometry={JOINT_GEOMETRY} scale={[0.23, 0.21, 0.23]} material={materials.jacketDark} />
            <mesh geometry={LIMB_GEOMETRY} position={[0, -0.25, 0]} scale={[0.36, 0.51, 0.4]} material={materials.jacket} castShadow />
            <mesh geometry={CUFF_GEOMETRY} position={[0, -0.49, 0]} material={materials.trim} />
            <group position={[0, -0.59, 0.015]} rotation={[0.08, 0, 0.04]}>
              <PlayerHand material={materials.skin} mirror />
              <group ref={medkitProp} visible={false} position={[0, -0.01, 0.2]} rotation={[0.08, 0, 0.04]}>
                <mesh geometry={MEDKIT_GEOMETRY} material={materials.medkit} castShadow />
                <mesh geometry={MEDKIT_CROSS_GEOMETRY} position={[0, 0, 0.075]} material={materials.medkitCross} />
                <mesh geometry={MEDKIT_CROSS_GEOMETRY} position={[0, 0, 0.077]} rotation={[0, 0, Math.PI / 2]} material={materials.medkitCross} />
              </group>
            </group>
          </group>
        </group>

        <group ref={rightArm} position={[0.56, 0.37, 0]}>
          <mesh geometry={SHOULDER_GEOMETRY} position={[0, -0.08, 0]} rotation={[0, 0, 0.12]} material={materials.jacket} castShadow />
          <mesh geometry={LIMB_GEOMETRY} position={[0, -0.28, 0]} scale={[0.43, 0.58, 0.47]} material={materials.jacket} castShadow />
          <mesh geometry={PATCH_GEOMETRY} position={[0.145, -0.13, 0]} rotation={[0, Math.PI / 2, 0]} scale={[0.11, 0.18, 1]} material={materials.purple} />
          <group ref={rightForearm} position={[0, -0.55, 0]}>
            <mesh geometry={JOINT_GEOMETRY} scale={[0.23, 0.21, 0.23]} material={materials.jacketDark} />
            <mesh geometry={LIMB_GEOMETRY} position={[0, -0.25, 0]} scale={[0.36, 0.51, 0.4]} material={materials.jacket} castShadow />
            <mesh geometry={CUFF_GEOMETRY} position={[0, -0.49, 0]} material={materials.trim} />
            <group position={[0, -0.59, 0.015]} rotation={[0.08, 0, -0.04]}>
              <PlayerHand material={materials.skin} gripping />
              <group ref={weaponMount} rotation={[0, 0, IDLE_WEAPON_Z]}>
                <Weapon
                  trail={attacking}
                  heavy={overheadStrike}
                  surge={surgeVisual}
                  actionTime={actionTime}
                />
              </group>
            </group>
          </group>
        </group>
      </group>

      <mesh geometry={LIMB_GEOMETRY} position={[0, 2.19, -0.02]} scale={[0.25, 0.34, 0.25]} material={materials.skinDark} castShadow />
      <group ref={head} position={[0, 2.49, 0.015]}>
        <mesh geometry={HEAD_GEOMETRY} scale={[0.59, 0.76, 0.57]} material={materials.skin} castShadow />
        <mesh geometry={HEAD_GEOMETRY} position={[0, 0.12, -0.075]} scale={[0.61, 0.55, 0.6]} material={materials.hair} castShadow />
        <mesh geometry={JAW_GEOMETRY} position={[0, -0.2, 0.045]} scale={[0.45, 0.4, 0.46]} material={materials.skinDark} castShadow />
        <mesh geometry={EAR_GEOMETRY} position={[-0.315, -0.015, -0.005]} scale={[0.1, 0.19, 0.09]} material={materials.skinDark} />
        <mesh geometry={EAR_GEOMETRY} position={[0.315, -0.015, -0.005]} scale={[0.1, 0.19, 0.09]} material={materials.skinDark} />
        <mesh geometry={NOSE_GEOMETRY} position={[0, -0.01, 0.34]} rotation={[Math.PI / 2, 0, 0]} scale={[1, 1, 0.78]} material={materials.skinDark} castShadow />
        {[-1, 1].map((side) => (
          <group key={side}>
            <mesh geometry={EYE_GEOMETRY} position={[side * 0.13, 0.058, 0.294]} scale={[0.135, 0.067, 0.05]} material={materials.eyeSocket} />
            <mesh geometry={EYE_GEOMETRY} position={[side * 0.13, 0.06, 0.322]} scale={[0.072, 0.033, 0.035]} material={materials.eye} />
            <mesh geometry={EYE_GEOMETRY} position={[side * 0.13, 0.06, 0.341]} scale={[0.022, 0.026, 0.016]} material={materials.pupil} />
            <mesh
              geometry={LINE_GEOMETRY}
              position={[side * 0.13, 0.125, 0.31]}
              rotation={[0, 0, side * -1.42]}
              scale={[0.44, 0.16, 0.44]}
              material={materials.hair}
            />
          </group>
        ))}
        <mesh geometry={LINE_GEOMETRY} position={[0, -0.21, 0.276]} rotation={[0, 0, Math.PI / 2]} scale={[0.34, 0.34, 0.3]} material={materials.eyeSocket} />
        <mesh geometry={PATCH_GEOMETRY} position={[-0.21, -0.055, 0.292]} rotation={[-0.05, 0, 0.22]} scale={[0.11, 0.075, 1]} material={materials.damage} />
        <mesh geometry={PATCH_GEOMETRY} position={[0.2, -0.13, 0.283]} rotation={[-0.05, 0, -0.2]} scale={[0.07, 0.035, 1]} material={materials.damage} />
        {HAIR_CLUMPS.map((clump, index) => (
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
        {NAPE_LOCKS.map((clump, index) => (
          <mesh
            key={`nape-${index}`}
            geometry={HAIR_LOCK_GEOMETRY}
            position={clump.p}
            rotation={[clump.r[0], clump.r[1], clump.r[2]]}
            scale={clump.s}
            material={materials.hair}
            castShadow
          />
        ))}
      </group>

      <group ref={leftLeg} position={[-0.23, 1.08, 0]}>
        <mesh geometry={LIMB_GEOMETRY} position={[0, -0.25, 0]} scale={[0.53, 0.5, 0.57]} material={materials.trousers} castShadow />
        <mesh geometry={TROUSER_FOLD_GEOMETRY} position={[-0.09, -0.24, -0.195]} rotation={[0.08, 0, -0.16]} scale={[0.7, 0.72, 0.7]} material={materials.trousersWear} />
        <mesh geometry={TROUSER_FOLD_GEOMETRY} position={[0.08, -0.31, -0.196]} rotation={[0.08, 0, 0.2]} scale={[0.58, 0.5, 0.58]} material={materials.trousersWear} />
        <mesh geometry={PATCH_GEOMETRY} position={[-0.18, -0.22, 0.06]} rotation={[0, -Math.PI / 2, 0]} scale={[0.11, 0.17, 1]} material={materials.trousersWear} />
        <group ref={leftShin} position={[0, -0.5, 0]}>
          <mesh geometry={JOINT_GEOMETRY} scale={[0.26, 0.22, 0.28]} material={materials.trousersWear} />
          <mesh geometry={LIMB_GEOMETRY} position={[0, -0.23, 0]} scale={[0.47, 0.46, 0.52]} material={materials.trousers} castShadow />
          <mesh geometry={TROUSER_FOLD_GEOMETRY} position={[0.07, -0.21, -0.178]} rotation={[0.05, 0, 0.22]} scale={[0.62, 0.62, 0.62]} material={materials.trousersWear} />
          <mesh geometry={PATCH_GEOMETRY} position={[0.01, -0.19, 0.19]} scale={[0.1, 0.16, 1]} material={materials.trousersWear} />
          <group ref={leftFoot} position={[0, -0.48, 0.11]}>
            <mesh geometry={BOOT_SHAFT_GEOMETRY} position={[0, 0.16, -0.045]} material={materials.boot} castShadow />
            <mesh geometry={BOOT_GEOMETRY} position={[0, 0.02, 0.08]} material={materials.boot} castShadow />
            <mesh geometry={BOOT_HEEL_GEOMETRY} position={[0, -0.045, -0.15]} material={materials.sole} castShadow />
            <mesh geometry={BOOT_TOE_GEOMETRY} position={[0, -0.005, 0.265]} material={materials.boot} castShadow />
            <mesh geometry={SOLE_GEOMETRY} position={[0, -0.105, 0.08]} material={materials.sole} />
            {[-0.09, 0, 0.09].map((z) => (
              <mesh key={z} geometry={LINE_GEOMETRY} position={[0, 0.075, 0.18 + z]} rotation={[Math.PI / 2, 0, 0]} scale={[0.45, 0.22, 0.45]} material={materials.trousersWear} />
            ))}
          </group>
        </group>
      </group>

      <group ref={rightLeg} position={[0.23, 1.08, 0]}>
        <mesh geometry={LIMB_GEOMETRY} position={[0, -0.25, 0]} scale={[0.53, 0.5, 0.57]} material={materials.trousers} castShadow />
        <mesh geometry={TROUSER_FOLD_GEOMETRY} position={[0.09, -0.23, -0.195]} rotation={[0.08, 0, 0.16]} scale={[0.7, 0.72, 0.7]} material={materials.trousersWear} />
        <mesh geometry={TROUSER_FOLD_GEOMETRY} position={[-0.08, -0.32, -0.196]} rotation={[0.08, 0, -0.2]} scale={[0.58, 0.5, 0.58]} material={materials.trousersWear} />
        <mesh geometry={PATCH_GEOMETRY} position={[0.18, -0.16, 0.04]} rotation={[0, Math.PI / 2, 0]} scale={[0.1, 0.15, 1]} material={materials.trousersWear} />
        <group ref={rightShin} position={[0, -0.5, 0]}>
          <mesh geometry={JOINT_GEOMETRY} scale={[0.26, 0.22, 0.28]} material={materials.trousersWear} />
          <mesh geometry={LIMB_GEOMETRY} position={[0, -0.23, 0]} scale={[0.47, 0.46, 0.52]} material={materials.trousers} castShadow />
          <mesh geometry={TROUSER_FOLD_GEOMETRY} position={[-0.07, -0.2, -0.178]} rotation={[0.05, 0, -0.22]} scale={[0.62, 0.62, 0.62]} material={materials.trousersWear} />
          <mesh geometry={PATCH_GEOMETRY} position={[-0.02, -0.16, 0.19]} rotation={[0, 0, -0.15]} scale={[0.08, 0.13, 1]} material={materials.trousersWear} />
          <group ref={rightFoot} position={[0, -0.48, 0.11]}>
            <mesh geometry={BOOT_SHAFT_GEOMETRY} position={[0, 0.16, -0.045]} material={materials.boot} castShadow />
            <mesh geometry={BOOT_GEOMETRY} position={[0, 0.02, 0.08]} material={materials.boot} castShadow />
            <mesh geometry={BOOT_HEEL_GEOMETRY} position={[0, -0.045, -0.15]} material={materials.sole} castShadow />
            <mesh geometry={BOOT_TOE_GEOMETRY} position={[0, -0.005, 0.265]} material={materials.boot} castShadow />
            <mesh geometry={SOLE_GEOMETRY} position={[0, -0.105, 0.08]} material={materials.sole} />
            {[-0.09, 0, 0.09].map((z) => (
              <mesh key={z} geometry={LINE_GEOMETRY} position={[0, 0.075, 0.18 + z]} rotation={[Math.PI / 2, 0, 0]} scale={[0.45, 0.22, 0.45]} material={materials.trousersWear} />
            ))}
          </group>
        </group>
      </group>
        </group>
      </group>
    </group>
  )
}

export default PlayerModel
