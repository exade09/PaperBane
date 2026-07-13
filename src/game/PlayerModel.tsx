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
  leftLegZ: number
  rightLegZ: number
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
  leftLegZ: -0.025,
  rightLegZ: 0.025,
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

const blendPoses = (from: AnimationPose, to: AnimationPose, amount: number): AnimationPose => {
  const result = { ...BASE_POSE }
  poseChannels.forEach((channel) => {
    result[channel] = THREE.MathUtils.lerp(from[channel], to[channel], amount)
  })
  return result
}

interface GaitLegPose {
  hip: number
  knee: number
  foot: number
  stance: boolean
}

/**
 * A gait cycle with a deliberately longer, near-linear support phase. Keeping
 * the supporting hip moving back at a steady rate and counter-rotating the
 * ankle holds the boot visually level while the other leg clears the ground.
 */
const sampleGaitLeg = (
  cycle: number,
  stride: number,
  kneeLift: number,
  running: number
): GaitLegPose => {
  const normalized = ((cycle % 1) + 1) % 1
  const stanceEnd = THREE.MathUtils.lerp(0.63, 0.54, running)
  const baseKnee = THREE.MathUtils.lerp(0.055, 0.09, running)

  if (normalized < stanceEnd) {
    const stanceProgress = normalized / stanceEnd
    const hip = THREE.MathUtils.lerp(stride, -stride, stanceProgress)
    const heelLoad = Math.sin(Math.min(1, stanceProgress / 0.22) * Math.PI) * (1 - Math.min(1, stanceProgress / 0.22))
    const push = ease(THREE.MathUtils.clamp((stanceProgress - 0.7) / 0.3, 0, 1))
    const knee = baseKnee + heelLoad * THREE.MathUtils.lerp(0.13, 0.2, running) + push * THREE.MathUtils.lerp(0.12, 0.2, running)
    const heelStrike = THREE.MathUtils.lerp(-0.19, 0, ease(Math.min(1, stanceProgress / 0.16)))
    const toeOff = THREE.MathUtils.lerp(0, THREE.MathUtils.lerp(0.3, 0.42, running), push)
    const groundPitch = stanceProgress < 0.2 ? heelStrike : toeOff
    return { hip, knee, foot: groundPitch - hip - knee, stance: true }
  }

  const swingProgress = (normalized - stanceEnd) / (1 - stanceEnd)
  const swingEase = ease(swingProgress)
  const hip = THREE.MathUtils.lerp(-stride, stride, swingEase)
  const knee = baseKnee + Math.sin(swingProgress * Math.PI) * kneeLift
  const toeClearance = -Math.sin(swingProgress * Math.PI) * THREE.MathUtils.lerp(0.13, 0.2, running)
  return { hip, knee, foot: toeClearance - hip - knee, stance: false }
}

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
const FACE_PLANE_GEOMETRY = new THREE.DodecahedronGeometry(0.5, 0)
const JOINT_GEOMETRY = new THREE.DodecahedronGeometry(0.5, 1)
const HAND_GEOMETRY = new THREE.IcosahedronGeometry(0.5, 2)
const FINGER_GEOMETRY = new THREE.CapsuleGeometry(0.035, 0.1, 3, 7)
const HAIR_GEOMETRY = new THREE.DodecahedronGeometry(0.5, 0)
const HAIR_LOCK_GEOMETRY = makeTaperedPrismGeometry(0.55, 0.16, 1, 0.4, 0.15)
const NOSE_GEOMETRY = new THREE.ConeGeometry(0.065, 0.19, 7)
const NOSE_BRIDGE_GEOMETRY = makeTaperedPrismGeometry(0.075, 0.12, 0.28, 0.07, 0.13)
const EAR_GEOMETRY = new THREE.SphereGeometry(0.5, 8, 6)
const EYE_GEOMETRY = new THREE.SphereGeometry(0.5, 9, 6)
const BROW_GEOMETRY = new RoundedBoxGeometry(0.18, 0.042, 0.042, 2, 0.016)
const EYELID_GEOMETRY = new RoundedBoxGeometry(0.17, 0.024, 0.025, 2, 0.01)
const MOUTH_GEOMETRY = new RoundedBoxGeometry(0.19, 0.025, 0.025, 2, 0.01)
const LINE_GEOMETRY = new THREE.CapsuleGeometry(0.035, 0.5, 2, 5)
const CUFF_GEOMETRY = new THREE.CylinderGeometry(0.17, 0.16, 0.095, 9, 2)
const NECK_GEOMETRY = makeTaperedPrismGeometry(0.29, 0.38, 0.38, 0.25, 0.34)
const COLLAR_BACK_GEOMETRY = makeTaperedPrismGeometry(0.62, 0.76, 0.3, 0.1, 0.15)
const COLLAR_WING_GEOMETRY = makeTaperedPrismGeometry(0.18, 0.29, 0.45, 0.12, 0.09)
const LAPEL_GEOMETRY = makeTaperedPrismGeometry(0.14, 0.27, 0.58, 0.055, 0.05)
const SHIRT_NECK_GEOMETRY = new THREE.TorusGeometry(0.225, 0.026, 5, 12, Math.PI)
const SHIRT_PANEL_GEOMETRY = new RoundedBoxGeometry(0.52, 0.76, 0.035, 2, 0.035)
const FRONT_PANEL_GEOMETRY = new RoundedBoxGeometry(0.24, 0.73, 0.04, 2, 0.028)
const BACK_PANEL_GEOMETRY = new RoundedBoxGeometry(0.69, 0.72, 0.04, 2, 0.035)
const BACK_YOKE_GEOMETRY = new RoundedBoxGeometry(0.78, 0.24, 0.05, 2, 0.045)
const BACK_SIDE_PANEL_GEOMETRY = makeTaperedPrismGeometry(0.22, 0.27, 0.61, 0.05, 0.045)
const POCKET_GEOMETRY = new RoundedBoxGeometry(0.2, 0.27, 0.035, 3, 0.025)
const POCKET_FLAP_GEOMETRY = new RoundedBoxGeometry(0.22, 0.075, 0.045, 2, 0.02)
const MEDKIT_GEOMETRY = new RoundedBoxGeometry(0.25, 0.31, 0.13, 2, 0.035)
const MEDKIT_CROSS_GEOMETRY = new RoundedBoxGeometry(0.055, 0.18, 0.018, 1, 0.012)
const BOOT_GEOMETRY = new RoundedBoxGeometry(0.39, 0.25, 0.59, 3, 0.055)
const SOLE_GEOMETRY = new RoundedBoxGeometry(0.42, 0.085, 0.63, 3, 0.025)
const BOOT_SHAFT_GEOMETRY = makeTaperedPrismGeometry(0.34, 0.39, 0.3, 0.34, 0.42)
const BOOT_HEEL_GEOMETRY = new RoundedBoxGeometry(0.34, 0.13, 0.25, 2, 0.035)
const BOOT_TOE_GEOMETRY = makeTaperedPrismGeometry(0.34, 0.41, 0.16, 0.27, 0.38)
const SHOULDER_GEOMETRY = makeTaperedPrismGeometry(0.29, 0.23, 0.3, 0.33, 0.28)
const TROUSER_FOLD_GEOMETRY = new THREE.CapsuleGeometry(0.025, 0.22, 2, 5)
const PATCH_GEOMETRY = new THREE.CircleGeometry(0.5, 6)

const HAIR_CLUMPS = [
  { p: [-0.19, 0.28, -0.02], s: [0.34, 0.23, 0.34], r: [0.18, 0.1, -0.28] },
  { p: [0.01, 0.3, -0.015], s: [0.37, 0.25, 0.36], r: [0.08, 0.35, 0.05] },
  { p: [0.21, 0.27, -0.01], s: [0.33, 0.24, 0.34], r: [0.16, -0.26, 0.28] },
  { p: [-0.29, 0.18, -0.03], s: [0.27, 0.29, 0.3], r: [0.02, 0.16, -0.38] },
  { p: [0.29, 0.17, -0.025], s: [0.28, 0.28, 0.3], r: [0.04, -0.18, 0.36] },
  { p: [-0.205, 0.155, 0.245], s: [0.25, 0.31, 0.22], r: [-0.08, 0.18, -0.2] },
  { p: [-0.075, 0.15, 0.275], s: [0.24, 0.34, 0.21], r: [-0.12, -0.12, -0.06] },
  { p: [0.075, 0.165, 0.272], s: [0.23, 0.31, 0.21], r: [-0.1, 0.14, 0.1] },
  { p: [0.21, 0.15, 0.235], s: [0.23, 0.3, 0.22], r: [-0.05, -0.18, 0.22] },
  { p: [-0.29, 0.075, 0.17], s: [0.2, 0.36, 0.2], r: [-0.05, 0.04, -0.24] },
  { p: [0.29, 0.07, 0.17], s: [0.2, 0.34, 0.2], r: [-0.04, -0.04, 0.24] },
  { p: [-0.2, 0.24, -0.22], s: [0.32, 0.3, 0.32], r: [0.12, -0.14, -0.24] },
  { p: [0.015, 0.28, -0.255], s: [0.36, 0.32, 0.34], r: [0.1, 0.22, 0.03] },
  { p: [0.22, 0.22, -0.22], s: [0.32, 0.3, 0.32], r: [0.14, -0.2, 0.25] },
  { p: [-0.3, 0.07, -0.15], s: [0.23, 0.32, 0.24], r: [0.04, 0.18, -0.34] },
  { p: [0.3, 0.06, -0.145], s: [0.23, 0.31, 0.24], r: [0.05, -0.17, 0.34] }
] as const

const NAPE_LOCKS = [
  { p: [-0.23, -0.08, -0.22], s: [0.2, 0.28, 0.18], r: [-0.06, 0.12, -0.24] },
  { p: [-0.08, -0.12, -0.275], s: [0.21, 0.32, 0.19], r: [-0.04, -0.16, -0.08] },
  { p: [0.09, -0.12, -0.275], s: [0.21, 0.31, 0.19], r: [-0.05, 0.16, 0.09] },
  { p: [0.24, -0.075, -0.21], s: [0.2, 0.27, 0.18], r: [-0.07, -0.12, 0.25] }
] as const

const STUBBLE_PATCHES = [
  { p: [-0.14, -0.16, 0.307], s: [0.12, 0.1, 1], r: 0.18 },
  { p: [0.14, -0.16, 0.307], s: [0.12, 0.1, 1], r: -0.18 },
  { p: [-0.105, -0.265, 0.285], s: [0.115, 0.085, 1], r: 0.08 },
  { p: [0.105, -0.265, 0.285], s: [0.115, 0.085, 1], r: -0.08 },
  { p: [0, -0.31, 0.285], s: [0.15, 0.08, 1], r: 0 }
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
  const locomotionPhase = useRef(0)
  const gaitMix = useRef(0)
  const previousAnimation = useRef<PlayerAnimation>(animation)
  const transitionFromPose = useRef<AnimationPose | null>(null)
  const transitionDuration = useRef(0)

  const shirtTexture = useMemo(createDirtyShirtTexture, [])
  const materials = useMemo(() => ({
    jacket: new THREE.MeshStandardMaterial({
      color: '#3c3d44', emissive: '#18191e', emissiveIntensity: 0.38, roughness: 0.92, metalness: 0.03, flatShading: true
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
      color: '#8c6d55', emissive: '#2b1d16', emissiveIntensity: 0.13, roughness: 1, flatShading: true
    }),
    skinDark: new THREE.MeshStandardMaterial({ color: '#5d4638', emissive: '#1c120e', emissiveIntensity: 0.08, roughness: 1, flatShading: true }),
    skinPlane: new THREE.MeshStandardMaterial({ color: '#765946', roughness: 1, flatShading: true }),
    skinHighlight: new THREE.MeshStandardMaterial({ color: '#9b765a', roughness: 0.98, flatShading: true }),
    stubble: new THREE.MeshStandardMaterial({ color: '#3b332f', roughness: 1, transparent: true, opacity: 0.36, depthWrite: false, flatShading: true }),
    lip: new THREE.MeshStandardMaterial({ color: '#4e302d', roughness: 0.96, flatShading: true }),
    damage: new THREE.MeshStandardMaterial({ color: '#713b32', roughness: 1, flatShading: true }),
    hair: new THREE.MeshStandardMaterial({ color: '#111216', emissive: '#090a0d', emissiveIntensity: 0.1, roughness: 0.96, flatShading: true }),
    hairEdge: new THREE.MeshStandardMaterial({ color: '#343035', emissive: '#1a161c', emissiveIntensity: 0.24, roughness: 0.98, flatShading: true }),
    eyeSocket: new THREE.MeshStandardMaterial({ color: '#241c1a', roughness: 1, flatShading: true }),
    eye: new THREE.MeshStandardMaterial({ color: '#73736d', emissive: '#151512', emissiveIntensity: 0.025, roughness: 0.82, flatShading: true }),
    pupil: new THREE.MeshBasicMaterial({ color: '#10100f' }),
    trousers: new THREE.MeshStandardMaterial({ color: '#424349', emissive: '#1c1d21', emissiveIntensity: 0.24, roughness: 1, flatShading: true }),
    trousersWear: new THREE.MeshStandardMaterial({ color: '#403b37', roughness: 1, flatShading: true }),
    boot: new THREE.MeshStandardMaterial({
      color: '#2d2924', emissive: '#12110f', emissiveIntensity: 0.16, roughness: 0.83, metalness: 0.08, flatShading: true
    }),
    sole: new THREE.MeshStandardMaterial({ color: '#090a09', roughness: 0.92, flatShading: true })
  }), [shirtTexture])

  useEffect(() => {
    transitionFromPose.current = {
      leftArmX: leftArm.current?.rotation.x ?? BASE_POSE.leftArmX,
      rightArmX: rightArm.current?.rotation.x ?? BASE_POSE.rightArmX,
      leftArmZ: leftArm.current?.rotation.z ?? BASE_POSE.leftArmZ,
      rightArmZ: rightArm.current?.rotation.z ?? BASE_POSE.rightArmZ,
      leftElbowX: leftForearm.current?.rotation.x ?? BASE_POSE.leftElbowX,
      rightElbowX: rightForearm.current?.rotation.x ?? BASE_POSE.rightElbowX,
      leftElbowZ: leftForearm.current?.rotation.z ?? BASE_POSE.leftElbowZ,
      rightElbowZ: rightForearm.current?.rotation.z ?? BASE_POSE.rightElbowZ,
      leftLegX: leftLeg.current?.rotation.x ?? BASE_POSE.leftLegX,
      rightLegX: rightLeg.current?.rotation.x ?? BASE_POSE.rightLegX,
      leftLegZ: leftLeg.current?.rotation.z ?? BASE_POSE.leftLegZ,
      rightLegZ: rightLeg.current?.rotation.z ?? BASE_POSE.rightLegZ,
      leftKneeX: leftShin.current?.rotation.x ?? BASE_POSE.leftKneeX,
      rightKneeX: rightShin.current?.rotation.x ?? BASE_POSE.rightKneeX,
      leftFootX: leftFoot.current?.rotation.x ?? BASE_POSE.leftFootX,
      rightFootX: rightFoot.current?.rotation.x ?? BASE_POSE.rightFootX,
      torsoX: torso.current?.rotation.x ?? BASE_POSE.torsoX,
      torsoY: torso.current?.rotation.y ?? BASE_POSE.torsoY,
      torsoZ: torso.current?.rotation.z ?? BASE_POSE.torsoZ,
      rootY: root.current?.position.y ?? BASE_POSE.rootY,
      rootX: root.current?.rotation.x ?? BASE_POSE.rootX,
      rootZ: root.current?.rotation.z ?? BASE_POSE.rootZ,
      headX: head.current?.rotation.x ?? BASE_POSE.headX,
      headY: head.current?.rotation.y ?? BASE_POSE.headY,
      headZ: head.current?.rotation.z ?? BASE_POSE.headZ,
      weaponY: weaponMount.current?.rotation.y ?? BASE_POSE.weaponY,
      weaponZ: weaponMount.current?.rotation.z ?? BASE_POSE.weaponZ,
      rollX: rollRig.current?.rotation.x ?? BASE_POSE.rollX,
      rollLift: (rollRig.current?.position.y ?? 1.3) - 1.3
    }

    const previousWasDodge = previousAnimation.current === 'DODGE' || previousAnimation.current === 'DODGE_ROLL'
    const isDodge = animation === 'DODGE' || animation === 'DODGE_ROLL'
    if (previousWasDodge && !isDodge && rollRig.current) {
      // Six radians and zero are nearly the same visible orientation. Normalize
      // before damping so roll recovery cannot unwind backward through a full turn.
      rollRig.current.rotation.x = THREE.MathUtils.euclideanModulo(
        rollRig.current.rotation.x + Math.PI,
        Math.PI * 2
      ) - Math.PI
    }

    const wasLocomoting = previousAnimation.current === 'WALK' || previousAnimation.current === 'RUN'
    const isLocomoting = animation === 'WALK' || animation === 'RUN'
    const urgentReaction = animation === 'HIT' || animation === 'DEATH' || animation === 'DODGE' || animation === 'DODGE_ROLL'
    transitionDuration.current = urgentReaction ? 0.055 : (wasLocomoting || isLocomoting ? 0.18 : 0.1)
    previousAnimation.current = animation
    actionTime.current = 0
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
    let leftLegZ = BASE_POSE.leftLegZ
    let rightLegZ = BASE_POSE.rightLegZ
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
      leftLegZ = nextPose.leftLegZ
      rightLegZ = nextPose.rightLegZ
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

    if (animation === 'IDLE') {
      gaitMix.current = damp(gaitMix.current, 0, delta, 3.5)
      const weightShift = Math.sin(worldTime * 0.72)
      const delayedBreath = Math.sin(worldTime * 1.8 - 0.42)
      leftLegZ = -0.035 - Math.max(0, weightShift) * 0.01
      rightLegZ = 0.035 + Math.max(0, -weightShift) * 0.01
      leftKneeX = 0.045 + Math.max(0, -weightShift) * 0.055
      rightKneeX = 0.045 + Math.max(0, weightShift) * 0.055
      leftFootX = -leftKneeX * 0.42
      rightFootX = -rightKneeX * 0.42
      rootY = breathing * 0.009 - Math.abs(weightShift) * 0.004
      rootZ = weightShift * 0.009
      torsoX = breathing * 0.016
      torsoY = Math.sin(worldTime * 0.38) * 0.018
      torsoZ = -weightShift * 0.021
      leftArmX = 0.08 + delayedBreath * 0.014
      rightArmX = -0.18 - delayedBreath * 0.011
      leftArmZ = 0.07 + weightShift * 0.008
      rightArmZ = -0.09 + weightShift * 0.006
      leftElbowX = -0.08 - breathing * 0.012
      rightElbowX = -0.3 - breathing * 0.015
      headX = 0.025 - breathing * 0.008
      headY = -torsoY * 0.72 + Math.sin(worldTime * 0.29) * 0.014
      headZ = -torsoZ * 0.68
      weaponY = Math.sin(worldTime * 0.64 - 0.35) * 0.008
      weaponZ = IDLE_WEAPON_Z + delayedBreath * 0.006 - weightShift * 0.004
    } else if (animation === 'WALK' || animation === 'RUN') {
      gaitMix.current = damp(gaitMix.current, animation === 'RUN' ? 1 : 0, delta, 4.8)
      const running = gaitMix.current
      const rate = THREE.MathUtils.lerp(7.25, 11.55, running)
      locomotionPhase.current = (locomotionPhase.current + delta * rate) % (Math.PI * 2)
      const phase = locomotionPhase.current
      const cycle = phase / (Math.PI * 2)
      const stride = THREE.MathUtils.lerp(0.46, 0.7, running)
      const kneeLift = THREE.MathUtils.lerp(0.62, 0.98, running)
      const leftGait = sampleGaitLeg(cycle, stride, kneeLift, running)
      const rightGait = sampleGaitLeg(cycle + 0.5, stride, kneeLift, running)
      const lead = (leftGait.hip - rightGait.hip) / Math.max(0.001, stride * 2)
      const supportBias = leftGait.stance === rightGait.stance
        ? Math.cos(phase)
        : (leftGait.stance ? 1 : -1)
      const impact = Math.max(0, Math.cos(phase * 2))

      leftLegX = leftGait.hip
      rightLegX = rightGait.hip
      leftLegZ = THREE.MathUtils.lerp(-0.042, -0.022, running) - supportBias * 0.006
      rightLegZ = THREE.MathUtils.lerp(0.042, 0.022, running) - supportBias * 0.006
      leftKneeX = leftGait.knee
      rightKneeX = rightGait.knee
      leftFootX = leftGait.foot
      rightFootX = rightGait.foot

      leftArmX = 0.08 - leftGait.hip * THREE.MathUtils.lerp(0.58, 0.72, running)
      rightArmX = -0.18 - rightGait.hip * THREE.MathUtils.lerp(0.31, 0.42, running)
      leftArmZ = 0.07 + supportBias * THREE.MathUtils.lerp(0.012, 0.024, running)
      rightArmZ = -0.09 + supportBias * THREE.MathUtils.lerp(0.008, 0.016, running)
      leftElbowX = THREE.MathUtils.lerp(-0.13, -0.36, running) - Math.max(0, leftArmX) * 0.14
      rightElbowX = THREE.MathUtils.lerp(-0.34, -0.52, running) - Math.max(0, rightArmX) * 0.08

      torsoX = THREE.MathUtils.lerp(0.05, 0.145, running) - impact * THREE.MathUtils.lerp(0.008, 0.018, running)
      torsoY = -lead * THREE.MathUtils.lerp(0.105, 0.155, running)
      torsoZ = supportBias * THREE.MathUtils.lerp(0.018, 0.032, running)
      rootY = -Math.cos(phase * 2) * THREE.MathUtils.lerp(0.018, 0.036, running) + running * 0.012
      rootZ = supportBias * THREE.MathUtils.lerp(0.006, 0.012, running)
      headX = -torsoX * 0.32 + impact * 0.009
      headY = -torsoY * 0.78
      headZ = -torsoZ * 0.74

      const weaponLag = Math.sin(phase - 0.38)
      weaponY = -torsoY * 0.18 + weaponLag * THREE.MathUtils.lerp(0.012, 0.026, running)
      weaponZ = IDLE_WEAPON_Z - THREE.MathUtils.lerp(0.035, 0.065, running) + weaponLag * THREE.MathUtils.lerp(0.012, 0.025, running)
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

    const targetPose: AnimationPose = {
      leftArmX, rightArmX, leftArmZ, rightArmZ,
      leftElbowX, rightElbowX, leftElbowZ, rightElbowZ,
      leftLegX, rightLegX, leftLegZ, rightLegZ,
      leftKneeX, rightKneeX, leftFootX, rightFootX,
      torsoX, torsoY, torsoZ, rootY, rootX, rootZ,
      headX, headY, headZ, weaponY, weaponZ, rollX, rollLift
    }
    const transitionPose = transitionFromPose.current
    if (transitionPose) {
      const transitionProgress = THREE.MathUtils.clamp(time / Math.max(0.001, transitionDuration.current), 0, 1)
      applyPose(blendPoses(transitionPose, targetPose, ease(transitionProgress)))
      if (transitionProgress >= 1) transitionFromPose.current = null
    }

    const locomoting = animation === 'WALK' || animation === 'RUN'
    const bodyDamping = locomoting ? 11 : 14

    if (root.current) {
      root.current.rotation.x = damp(root.current.rotation.x, rootX, delta, animation === 'DEATH' ? 3.8 : bodyDamping)
      root.current.rotation.z = damp(root.current.rotation.z, rootZ, delta, bodyDamping)
      root.current.position.y = damp(root.current.position.y, rootY, delta, locomoting ? 15 : bodyDamping)
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
      const breathingLift = animation === 'IDLE' ? breathing * 0.009 : 0
      torso.current.position.y = damp(torso.current.position.y, 1.56 + breathingLift, delta, 8)
      torso.current.rotation.x = damp(torso.current.rotation.x, torsoX, delta, bodyDamping)
      torso.current.rotation.y = damp(torso.current.rotation.y, torsoY, delta, bodyDamping)
      torso.current.rotation.z = damp(torso.current.rotation.z, torsoZ, delta, bodyDamping)
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
    if (leftLeg.current) {
      leftLeg.current.rotation.x = damp(leftLeg.current.rotation.x, leftLegX, delta, locomoting ? 18 : bodyDamping)
      leftLeg.current.rotation.z = damp(leftLeg.current.rotation.z, leftLegZ, delta, bodyDamping)
    }
    if (rightLeg.current) {
      rightLeg.current.rotation.x = damp(rightLeg.current.rotation.x, rightLegX, delta, locomoting ? 18 : bodyDamping)
      rightLeg.current.rotation.z = damp(rightLeg.current.rotation.z, rightLegZ, delta, bodyDamping)
    }
    if (leftShin.current) leftShin.current.rotation.x = damp(leftShin.current.rotation.x, leftKneeX, delta, locomoting ? 19 : 16)
    if (rightShin.current) rightShin.current.rotation.x = damp(rightShin.current.rotation.x, rightKneeX, delta, locomoting ? 19 : 16)
    if (leftFoot.current) leftFoot.current.rotation.x = damp(leftFoot.current.rotation.x, leftFootX, delta, locomoting ? 22 : 15)
    if (rightFoot.current) rightFoot.current.rotation.x = damp(rightFoot.current.rotation.x, rightFootX, delta, locomoting ? 22 : 15)
    if (weaponMount.current) {
      weaponMount.current.rotation.y = damp(weaponMount.current.rotation.y, weaponY, delta, 18)
      weaponMount.current.rotation.z = damp(weaponMount.current.rotation.z, weaponZ, delta, 18)
    }
    if (medkitProp.current) medkitProp.current.visible = animation === 'MEDKIT_USE'

    materials.jacket.emissive.set(damageFlash ? '#c33a3a' : '#18191e')
    materials.jacket.emissiveIntensity = damageFlash ? 1.65 : 0.38
    materials.skin.emissive.set(damageFlash ? '#c33a3a' : '#2b1d16')
    materials.skin.emissiveIntensity = damageFlash ? 1.05 : 0.13
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
        <mesh geometry={FRONT_PANEL_GEOMETRY} position={[-0.37, -0.03, 0.337]} rotation={[0, -0.035, -0.02]} material={materials.jacketDark} castShadow />
        <mesh geometry={FRONT_PANEL_GEOMETRY} position={[0.37, -0.03, 0.337]} rotation={[0, 0.035, 0.02]} material={materials.jacketDark} castShadow />
        <mesh geometry={SHIRT_PANEL_GEOMETRY} position={[0, -0.02, 0.342]} material={materials.shirt} />
        <mesh
          geometry={SHIRT_NECK_GEOMETRY}
          position={[0, 0.35, 0.372]}
          rotation={[0, 0, Math.PI]}
          material={materials.jacketWear}
        />
        <mesh geometry={COLLAR_BACK_GEOMETRY} position={[0, 0.52, -0.315]} rotation={[-0.08, 0, 0]} material={materials.jacketDark} castShadow />
        <mesh geometry={LINE_GEOMETRY} position={[0, 0.655, -0.392]} rotation={[0, 0, Math.PI / 2]} scale={[0.62, 1.45, 0.62]} material={materials.trim} />
        {[-1, 1].map((side) => (
          <group key={`collar-${side}`}>
            <mesh
              geometry={COLLAR_WING_GEOMETRY}
              position={[side * 0.265, 0.47, 0.16]}
              rotation={[-0.13, side * -0.16, side * 0.16]}
              material={materials.jacketDark}
              castShadow
            />
            <mesh
              geometry={LAPEL_GEOMETRY}
              position={[side * 0.285, 0.17, 0.375]}
              rotation={[0, side * -0.04, side * 0.22]}
              material={materials.jacketWear}
              castShadow
            />
            <mesh
              geometry={LINE_GEOMETRY}
              position={[side * 0.357, 0.2, 0.411]}
              rotation={[0, 0, side * 0.22]}
              scale={[0.6, 1.16, 0.6]}
              material={materials.trim}
            />
          </group>
        ))}
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
              geometry={POCKET_GEOMETRY}
              position={[side * 0.35, -0.09, 0.374]}
              rotation={[0, 0, side * -0.08]}
              material={materials.jacketDark}
            />
            <mesh
              geometry={POCKET_FLAP_GEOMETRY}
              position={[side * 0.35, 0.055, 0.401]}
              rotation={[0, 0, side * -0.08]}
              material={materials.trim}
            />
            <mesh geometry={POCKET_FLAP_GEOMETRY} position={[side * 0.35, 0.015, 0.399]} scale={[0.82, 0.38, 1]} material={materials.purple} />
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
          <mesh geometry={SHOULDER_GEOMETRY} position={[0.015, -0.075, 0]} rotation={[0, 0, -0.19]} material={materials.jacketDark} castShadow />
          <mesh geometry={LIMB_GEOMETRY} position={[0, -0.285, 0]} scale={[0.4, 0.58, 0.44]} material={materials.jacket} castShadow />
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
          <mesh geometry={SHOULDER_GEOMETRY} position={[-0.015, -0.075, 0]} rotation={[0, 0, 0.19]} material={materials.jacketDark} castShadow />
          <mesh geometry={LIMB_GEOMETRY} position={[0, -0.285, 0]} scale={[0.4, 0.58, 0.44]} material={materials.jacket} castShadow />
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

      <group position={[0, 2.18, -0.015]}>
        <mesh geometry={NECK_GEOMETRY} material={materials.skinPlane} castShadow />
        {[-1, 1].map((side) => (
          <mesh
            key={`neck-${side}`}
            geometry={LINE_GEOMETRY}
            position={[side * 0.09, -0.01, 0.16]}
            rotation={[0.04, 0, side * 0.18]}
            scale={[0.48, 0.52, 0.48]}
            material={materials.skinDark}
          />
        ))}
      </group>
      <group ref={head} position={[0, 2.49, 0.015]}>
        <mesh geometry={HEAD_GEOMETRY} scale={[0.535, 0.76, 0.54]} material={materials.skin} castShadow />
        <mesh geometry={FACE_PLANE_GEOMETRY} position={[0, 0.115, 0.265]} scale={[0.46, 0.37, 0.12]} material={materials.skinHighlight} />
        {[-1, 1].map((side) => (
          <group key={`face-plane-${side}`}>
            <mesh
              geometry={FACE_PLANE_GEOMETRY}
              position={[side * 0.23, 0.055, 0.16]}
              rotation={[0, side * -0.38, 0]}
              scale={[0.12, 0.3, 0.18]}
              material={materials.skinPlane}
            />
            <mesh
              geometry={FACE_PLANE_GEOMETRY}
              position={[side * 0.155, -0.055, 0.282]}
              rotation={[0.05, side * -0.16, side * -0.05]}
              scale={[0.21, 0.17, 0.12]}
              material={materials.skinHighlight}
            />
            <mesh
              geometry={FACE_PLANE_GEOMETRY}
              position={[side * 0.17, -0.205, 0.235]}
              rotation={[0.03, side * -0.25, side * 0.08]}
              scale={[0.17, 0.27, 0.12]}
              material={materials.skinPlane}
            />
          </group>
        ))}
        <mesh geometry={JAW_GEOMETRY} position={[0, -0.205, 0.035]} scale={[0.46, 0.44, 0.45]} material={materials.skin} castShadow />
        <mesh geometry={FACE_PLANE_GEOMETRY} position={[0, -0.315, 0.255]} scale={[0.25, 0.17, 0.13]} material={materials.skinPlane} />
        <mesh geometry={HEAD_GEOMETRY} position={[0, 0.15, -0.085]} scale={[0.54, 0.43, 0.54]} material={materials.hair} castShadow />
        {[-1, 1].map((side) => (
          <group key={`ear-${side}`}>
            <mesh geometry={EAR_GEOMETRY} position={[side * 0.286, -0.015, -0.005]} scale={[0.1, 0.2, 0.09]} material={materials.skinPlane} />
            <mesh geometry={EAR_GEOMETRY} position={[side * 0.291, -0.018, 0.026]} scale={[0.045, 0.105, 0.046]} material={materials.damage} />
          </group>
        ))}
        <mesh geometry={NOSE_BRIDGE_GEOMETRY} position={[0, 0.055, 0.305]} material={materials.skinPlane} castShadow />
        <mesh geometry={NOSE_GEOMETRY} position={[0, -0.045, 0.365]} rotation={[Math.PI / 2, 0, 0]} scale={[1.08, 1.08, 0.82]} material={materials.skinDark} castShadow />
        <mesh geometry={FACE_PLANE_GEOMETRY} position={[0, -0.072, 0.353]} scale={[0.18, 0.095, 0.12]} material={materials.skinHighlight} />
        {[-1, 1].map((side) => (
          <group key={`eye-${side}`}>
            <mesh geometry={EYE_GEOMETRY} position={[side * 0.115, 0.047, 0.3]} scale={[0.18, 0.058, 0.05]} material={materials.eyeSocket} />
            <mesh geometry={EYE_GEOMETRY} position={[side * 0.115, 0.042, 0.327]} scale={[0.122, 0.025, 0.036]} material={materials.eye} />
            <mesh geometry={EYE_GEOMETRY} position={[side * 0.115, 0.039, 0.348]} scale={[0.026, 0.023, 0.018]} material={materials.pupil} />
            <mesh
              geometry={BROW_GEOMETRY}
              position={[side * 0.115, 0.112, 0.326]}
              rotation={[0, side * -0.05, side * 0.14]}
              material={materials.hair}
            />
            <mesh geometry={EYELID_GEOMETRY} position={[side * 0.115, 0.057, 0.349]} rotation={[0, 0, side * 0.045]} scale={[0.84, 0.75, 1]} material={materials.skinDark} />
            <mesh geometry={EYELID_GEOMETRY} position={[side * 0.115, 0.008, 0.329]} rotation={[0, 0, side * -0.055]} scale={[0.78, 0.62, 1]} material={materials.damage} />
          </group>
        ))}
        <mesh geometry={MOUTH_GEOMETRY} position={[0, -0.215, 0.323]} material={materials.lip} />
        <mesh geometry={MOUTH_GEOMETRY} position={[0.012, -0.238, 0.316]} scale={[0.72, 0.62, 0.9]} material={materials.skinDark} />
        <mesh geometry={PATCH_GEOMETRY} position={[0, -0.162, 0.326]} scale={[0.19, 0.045, 1]} material={materials.stubble} />
        {STUBBLE_PATCHES.map((patch, index) => (
          <mesh
            key={`stubble-${index}`}
            geometry={PATCH_GEOMETRY}
            position={patch.p}
            rotation={[0, 0, patch.r]}
            scale={patch.s}
            material={materials.stubble}
          />
        ))}
        <mesh geometry={PATCH_GEOMETRY} position={[-0.18, -0.07, 0.326]} rotation={[-0.05, 0, 0.2]} scale={[0.115, 0.075, 1]} material={materials.damage} />
        <mesh geometry={PATCH_GEOMETRY} position={[0.18, -0.135, 0.31]} rotation={[-0.05, 0, -0.18]} scale={[0.075, 0.04, 1]} material={materials.damage} />
        <mesh geometry={LINE_GEOMETRY} position={[-0.165, 0.025, 0.346]} rotation={[0, 0, 0.26]} scale={[0.31, 0.21, 0.31]} material={materials.damage} />
        <mesh geometry={LINE_GEOMETRY} position={[0.18, -0.08, 0.333]} rotation={[0, 0, -0.18]} scale={[0.24, 0.18, 0.24]} material={materials.skinDark} />
        {HAIR_CLUMPS.map((clump, index) => (
          <mesh
            key={index}
            geometry={index >= 5 && index <= 10 ? HAIR_LOCK_GEOMETRY : HAIR_GEOMETRY}
            position={clump.p}
            rotation={[clump.r[0], clump.r[1], clump.r[2]]}
            scale={clump.s}
            material={index % 3 === 0 ? materials.hairEdge : materials.hair}
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
