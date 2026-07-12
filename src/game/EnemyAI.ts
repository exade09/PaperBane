import * as THREE from 'three'
import { EnemyKind, GAME_CONFIG } from './GameConfig'

export type EnemyState = 'IDLE' | 'CHASE' | 'ATTACK' | 'STAGGER' | 'DEAD'

export interface EnemyDecisionInput {
  kind: EnemyKind
  state: EnemyState
  distance: number
  canSeePlayer: boolean
  stateTime: number
  attackCooldown: number
}

export const decideEnemyState = ({
  kind,
  state,
  distance,
  canSeePlayer,
  stateTime,
  attackCooldown
}: EnemyDecisionInput): EnemyState => {
  if (state === 'DEAD' || state === 'STAGGER') return state
  const config = GAME_CONFIG.enemies[kind]
  if (!canSeePlayer || distance > config.detectionRange) return 'IDLE'
  if (state === 'ATTACK') {
    const duration = kind === 'runner' ? 1.55 : 1.18
    return stateTime >= duration ? 'CHASE' : 'ATTACK'
  }
  const attackStartRange = kind === 'runner' ? 5.4 : config.attackRange
  if (distance <= attackStartRange && attackCooldown <= 0) return 'ATTACK'
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
