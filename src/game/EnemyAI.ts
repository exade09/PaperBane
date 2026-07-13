import * as THREE from 'three'
import { EnemyKind, GAME_CONFIG } from './GameConfig'

export type EnemyState =
  | 'IDLE'
  | 'PATROL'
  | 'DETECT'
  | 'CHASE'
  | 'ATTACK'
  | 'RECOVER'
  | 'STAGGER'
  | 'DEAD'

export interface EnemyTiming {
  idleDuration: number
  patrolDuration: number
  patrolSpeedMultiplier: number
  detectDuration: number
  attackDuration: number
  activeStart: number
  activeEnd: number
  recoveryOnHit: number
  recoveryOnMiss: number
  followupDelay: number
  staggerDuration: number
  attackStartRange: number
}

export const ENEMY_TIMINGS: Record<EnemyKind, EnemyTiming> = {
  walker: {
    idleDuration: 1.15,
    patrolDuration: 2.6,
    patrolSpeedMultiplier: 0.38,
    detectDuration: 0.44,
    attackDuration: 0.88,
    activeStart: 0.48,
    activeEnd: 0.68,
    recoveryOnHit: 0.5,
    recoveryOnMiss: 0.7,
    followupDelay: 0.18,
    staggerDuration: 0.36,
    attackStartRange: GAME_CONFIG.enemies.walker.attackRange
  },
  runner: {
    idleDuration: 0.72,
    patrolDuration: 1.8,
    patrolSpeedMultiplier: 0.34,
    detectDuration: 0.28,
    attackDuration: 1.02,
    activeStart: 0.38,
    activeEnd: 0.94,
    recoveryOnHit: 0.72,
    recoveryOnMiss: 1.18,
    followupDelay: 0.24,
    staggerDuration: 0.42,
    attackStartRange: 5.4
  }
}

export interface EnemyDecisionInput {
  kind: EnemyKind
  state: EnemyState
  distance: number
  canSeePlayer: boolean
  stateTime: number
  attackCooldown: number
  recoveryDuration: number
}

export const decideEnemyState = ({
  kind,
  state,
  distance,
  canSeePlayer,
  stateTime,
  attackCooldown,
  recoveryDuration
}: EnemyDecisionInput): EnemyState => {
  if (state === 'DEAD') return 'DEAD'
  const config = GAME_CONFIG.enemies[kind]
  const timing = ENEMY_TIMINGS[kind]
  const playerDetected = canSeePlayer && distance <= config.detectionRange

  if (state === 'STAGGER') {
    if (stateTime < timing.staggerDuration) return 'STAGGER'
    return playerDetected ? 'CHASE' : 'PATROL'
  }
  if (state === 'ATTACK') {
    return stateTime >= timing.attackDuration ? 'RECOVER' : 'ATTACK'
  }
  if (state === 'RECOVER') {
    if (stateTime < recoveryDuration) return 'RECOVER'
    return playerDetected ? 'CHASE' : 'PATROL'
  }
  if (state === 'DETECT') {
    if (stateTime < timing.detectDuration) return 'DETECT'
    if (!playerDetected) return 'PATROL'
    if (distance <= timing.attackStartRange && attackCooldown <= 0) return 'ATTACK'
    return 'CHASE'
  }
  if (state === 'IDLE') {
    if (playerDetected) return 'DETECT'
    return stateTime >= timing.idleDuration ? 'PATROL' : 'IDLE'
  }
  if (state === 'PATROL') {
    if (playerDetected) return 'DETECT'
    return stateTime >= timing.patrolDuration ? 'IDLE' : 'PATROL'
  }
  if (!playerDetected) {
    return 'PATROL'
  }
  if (distance <= timing.attackStartRange && attackCooldown <= 0) return 'ATTACK'
  return 'CHASE'
}

export const separationForce = (
  selfId: string,
  position: THREE.Vector3,
  neighbors: Iterable<{ id: string; position: THREE.Vector3; alive: boolean }>
) => {
  const force = new THREE.Vector3()
  for (const neighbor of neighbors) {
    if (neighbor.id === selfId || !neighbor.alive) continue
    const offset = position.clone().sub(neighbor.position).setY(0)
    const distanceSq = offset.lengthSq()
    if (distanceSq < 0.001 || distanceSq > 2.3) continue
    force.add(offset.normalize().multiplyScalar((1.55 - Math.sqrt(distanceSq)) * 0.9))
  }
  return force
}

export const faceDirection = (currentYaw: number, direction: THREE.Vector3, delta: number, speed = 8) => {
  const desiredYaw = Math.atan2(direction.x, direction.z)
  let difference = desiredYaw - currentYaw
  while (difference > Math.PI) difference -= Math.PI * 2
  while (difference < -Math.PI) difference += Math.PI * 2
  return currentYaw + difference * Math.min(1, delta * speed)
}
