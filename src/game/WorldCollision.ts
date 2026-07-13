import * as THREE from 'three'
import { GAME_CONFIG } from './GameConfig'
import type { ProgressionState } from './GameState'

export interface WorldBox {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
  minY?: number
  maxY?: number
}

export const WORLD_COLLIDERS: WorldBox[] = [
  { minX: -6.8, maxX: -3.7, minZ: 4.8, maxZ: 10.8, maxY: 2.2 },
  { minX: 3.1, maxX: 6.2, minZ: -7.8, maxZ: -2.6, maxY: 2.2 },
  { minX: -7.9, maxX: -5.1, minZ: -15.8, maxZ: -12.2, maxY: 1.5 },
  { minX: -12.6, maxX: -8.2, minZ: -35.6, maxZ: -22.4, maxY: 4.8 },
  { minX: 8.1, maxX: 12.5, minZ: -55.2, maxZ: -44.2, maxY: 4.8 },
  { minX: -7.1, maxX: -5.2, minZ: -48.4, maxZ: -43.5, maxY: 2.1 },
  { minX: 5.0, maxX: 6.9, minZ: -35.3, maxZ: -30.4, maxY: 2.1 },
  { minX: -0.78, maxX: 0.78, minZ: -61.52, maxZ: -60.48, maxY: 2.6 },
  { minX: -5.9, maxX: -3.8, minZ: -79.8, maxZ: -75.6, maxY: 1.5 },
  { minX: 7.2, maxX: 11.7, minZ: -114.2, maxZ: -107.9, maxY: 2.5 },
  { minX: -13.2, maxX: -9.2, minZ: -100.4, maxZ: -94.4, maxY: 2.4 },
  { minX: 7.78, maxX: 10.72, minZ: -26.5, maxZ: -22.28, maxY: 1.9 },
  { minX: 10.72, maxX: 12.18, minZ: -21.78, maxZ: -21.22, maxY: 4 },
  { minX: -7.99, maxX: -7.45, minZ: 20.23, maxZ: 20.77, maxY: 6.5 },
  { minX: -7.97, maxX: -7.43, minZ: 1.23, maxZ: 1.77, maxY: 6.5 },
  { minX: 7.41, maxX: 7.95, minZ: 11.23, maxZ: 11.77, maxY: 6.5 },
  { minX: 7.45, maxX: 7.99, minZ: -8.77, maxZ: -8.23, maxY: 6.5 },
  { minX: -11.99, maxX: -11.45, minZ: -25.27, maxZ: -24.73, maxY: 6.5 },
  { minX: -11.97, maxX: -11.43, minZ: -47.77, maxZ: -47.23, maxY: 6.5 },
  { minX: 11.41, maxX: 11.95, minZ: -35.27, maxZ: -34.73, maxY: 6.5 },
  { minX: 11.43, maxX: 11.97, minZ: -57.27, maxZ: -56.73, maxY: 6.5 }
]

export const INTRO_GATE_COLLIDER: WorldBox = {
  minX: -GAME_CONFIG.world.streetHalfWidth,
  maxX: GAME_CONFIG.world.streetHalfWidth,
  minZ: GAME_CONFIG.world.pumpEntranceZ - 0.35,
  maxZ: GAME_CONFIG.world.pumpEntranceZ + 0.35,
  maxY: 5
}

export const TERMINAL_GATE_COLLIDER: WorldBox = {
  minX: -6.4,
  maxX: 6.4,
  minZ: -67.2,
  maxZ: -65.7,
  maxY: 5
}

export const ARENA_GATE_COLLIDER: WorldBox = {
  minX: -6.35,
  maxX: 6.35,
  minZ: -89.1,
  maxZ: -87.7,
  maxY: 5
}

export const progressionColliders = (progression: ProgressionState): WorldBox[] => {
  const colliders: WorldBox[] = []
  if (progression === 'INTRO_COMBAT') colliders.push(INTRO_GATE_COLLIDER)
  if (
    progression === 'INTRO_COMBAT' ||
    progression === 'INTRO_COMPLETE' ||
    progression === 'PUMP_STATION_ACTIVE' ||
    progression === 'TERMINAL_READY'
  ) colliders.push(TERMINAL_GATE_COLLIDER)
  if (progression === 'BOSS_ACTIVE') colliders.push(ARENA_GATE_COLLIDER)
  return colliders
}

export const areaHalfWidth = (z: number) => {
  if (z > GAME_CONFIG.world.pumpEntranceZ) return GAME_CONFIG.world.streetHalfWidth
  if (z > -67) return GAME_CONFIG.world.pumpHalfWidth
  if (z > GAME_CONFIG.world.bossTriggerZ) return 6.2
  return GAME_CONFIG.world.arenaHalfWidth
}

export const circleIntersectsBox = (x: number, z: number, radius: number, box: WorldBox) => {
  const closestX = Math.max(box.minX, Math.min(x, box.maxX))
  const closestZ = Math.max(box.minZ, Math.min(z, box.maxZ))
  const dx = x - closestX
  const dz = z - closestZ
  return dx * dx + dz * dz < radius * radius
}

export const isWorldPositionFree = (
  x: number,
  z: number,
  radius: number,
  extraColliders: WorldBox[] = []
) => {
  const halfWidth = areaHalfWidth(z) - radius
  if (Math.abs(x) > halfWidth) return false
  if (z < GAME_CONFIG.world.minZ + radius || z > GAME_CONFIG.world.maxZ - radius) return false
  return ![...WORLD_COLLIDERS, ...extraColliders].some((box) => circleIntersectsBox(x, z, radius, box))
}

export const resolveWorldMovement = (
  current: THREE.Vector3,
  desired: THREE.Vector3,
  radius: number,
  extraColliders: WorldBox[] = []
) => {
  const resolved = current.clone()
  if (isWorldPositionFree(desired.x, current.z, radius, extraColliders)) resolved.x = desired.x
  if (isWorldPositionFree(resolved.x, desired.z, radius, extraColliders)) resolved.z = desired.z
  return resolved
}

const segmentHitsBox = (from: THREE.Vector3, to: THREE.Vector3, box: WorldBox) => {
  const direction = to.clone().sub(from)
  const length = direction.length()
  if (length < 0.001) return false
  direction.divideScalar(length)
  const ray = new THREE.Ray(from, direction)
  const bounds = new THREE.Box3(
    new THREE.Vector3(box.minX, box.minY ?? 0, box.minZ),
    new THREE.Vector3(box.maxX, box.maxY ?? 5, box.maxZ)
  )
  const hit = ray.intersectBox(bounds, new THREE.Vector3())
  return Boolean(hit && hit.distanceTo(from) < length)
}

export const hasLineOfSight = (
  from: THREE.Vector3,
  to: THREE.Vector3,
  extraColliders: WorldBox[] = []
) => ![...WORLD_COLLIDERS, ...extraColliders].some((box) => segmentHitsBox(from, to, box))

export const cameraObstacleBoxes = (extraColliders: WorldBox[] = []) =>
  [
    ...WORLD_COLLIDERS,
    ...extraColliders,
    { minX: -12, maxX: -8.5, minZ: -18, maxZ: 27, maxY: 10 },
    { minX: 8.5, maxX: 12, minZ: -18, maxZ: 27, maxY: 10 },
    { minX: -17, maxX: -13, minZ: -67, maxZ: -18, maxY: 10 },
    { minX: 13, maxX: 17, minZ: -67, maxZ: -18, maxY: 10 },
    { minX: -9, maxX: -6.2, minZ: -88, maxZ: -67, maxY: 10 },
    { minX: 6.2, maxX: 9, minZ: -88, maxZ: -67, maxY: 10 },
    { minX: -19, maxX: -15, minZ: -119, maxZ: -88, maxY: 10 },
    { minX: 15, maxX: 19, minZ: -119, maxZ: -88, maxY: 10 }
  ].map(
    (box) =>
      new THREE.Box3(
        new THREE.Vector3(box.minX, box.minY ?? 0, box.minZ),
        new THREE.Vector3(box.maxX, box.maxY ?? 5, box.maxZ)
      )
  )
