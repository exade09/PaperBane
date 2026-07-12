import { type MutableRefObject, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
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

function EnemyModel({ kind, state, stateTime, flash }: EnemyModelProps) {
  const root = useRef<THREE.Group>(null)
  const torso = useRef<THREE.Group>(null)
  const leftArm = useRef<THREE.Group>(null)
  const rightArm = useRef<THREE.Group>(null)
  const leftLeg = useRef<THREE.Group>(null)
  const rightLeg = useRef<THREE.Group>(null)
  const skin = useRef<THREE.MeshStandardMaterial>(null)
  const shirt = useRef<THREE.MeshStandardMaterial>(null)

  useFrame(({ clock }, delta) => {
    const gameStatus = useGameStore.getState().status
    if (gameStatus !== 'PLAYING' && state !== 'DEAD') return
    const time = clock.elapsedTime
    let armX = 0.25
    let armZ = 0.12
    let leg = 0
    let torsoX = 0.14
    let torsoZ = kind === 'runner' ? -0.08 : 0.05
    let rootY = Math.sin(time * 2 + (kind === 'runner' ? 1 : 0)) * 0.018
    let rootX = 0
    let rootZ = 0

    if (state === 'CHASE') {
      const rate = kind === 'runner' ? 11 : 5.4
      const stride = kind === 'runner' ? 0.76 : 0.43
      leg = Math.sin(time * rate) * stride
      armX = -leg * 0.7 + 0.22
      rootY = Math.abs(Math.sin(time * rate)) * (kind === 'runner' ? 0.08 : 0.04)
      torsoX = kind === 'runner' ? 0.48 : 0.2
    } else if (state === 'ATTACK') {
      const p = kind === 'runner'
        ? Math.min(1, stateTime.current / 1.55)
        : Math.min(1, stateTime.current / 1.18)
      if (kind === 'runner') {
        torsoX = p < 0.3 ? -0.2 : 0.67
        armX = p < 0.3 ? -0.8 : 1.05
        armZ = 0.38
        leg = p > 0.3 && p < 0.72 ? Math.sin(time * 15) * 0.8 : 0
      } else {
        const swing = Math.sin(p * Math.PI)
        armX = -1.65 + swing * 2.5
        armZ = 0.35
        torsoX = 0.1 + swing * 0.38
      }
    } else if (state === 'STAGGER') {
      torsoX = -Math.sin(Math.min(1, stateTime.current / 0.38) * Math.PI) * 0.48
      torsoZ = 0.23
      armX = 0.9
    } else if (state === 'DEAD') {
      rootX = Math.min(Math.PI * 0.48, stateTime.current * 1.8)
      rootZ = kind === 'runner' ? 0.18 : -0.12
      rootY = -Math.min(0.96, stateTime.current * 0.75)
      armX = 1.2
      leg = -0.25
    }

    if (root.current) {
      root.current.rotation.x = damp(root.current.rotation.x, rootX, delta, state === 'DEAD' ? 4.2 : 12)
      root.current.rotation.z = damp(root.current.rotation.z, rootZ, delta)
      root.current.position.y = damp(root.current.position.y, rootY, delta)
    }
    if (torso.current) {
      torso.current.rotation.x = damp(torso.current.rotation.x, torsoX, delta)
      torso.current.rotation.z = damp(torso.current.rotation.z, torsoZ, delta)
    }
    if (leftArm.current) {
      leftArm.current.rotation.x = damp(leftArm.current.rotation.x, armX, delta)
      leftArm.current.rotation.z = damp(leftArm.current.rotation.z, armZ, delta)
    }
    if (rightArm.current) {
      rightArm.current.rotation.x = damp(rightArm.current.rotation.x, state === 'ATTACK' ? armX - 0.25 : -armX, delta)
      rightArm.current.rotation.z = damp(rightArm.current.rotation.z, -armZ, delta)
    }
    if (leftLeg.current) leftLeg.current.rotation.x = damp(leftLeg.current.rotation.x, leg, delta)
    if (rightLeg.current) rightLeg.current.rotation.x = damp(rightLeg.current.rotation.x, -leg, delta)
    if (skin.current) skin.current.emissiveIntensity = flash ? 1.35 : 0
    if (shirt.current) shirt.current.emissiveIntensity = flash ? 0.85 : 0
  })

  const scale = kind === 'runner' ? 0.94 : 1
  return (
    <group ref={root} scale={[scale, scale, scale]}>
      <group ref={torso} position={[0, 1.45, 0]}>
        <mesh castShadow scale={[1.02, 1, 0.62]}>
          <boxGeometry args={[0.82, 0.94, 0.45]} />
          <meshStandardMaterial ref={shirt} color="#a09e90" emissive="#7dff48" emissiveIntensity={0} roughness={1} />
        </mesh>
        <mesh position={[0, 0.05, 0.245]}>
          <boxGeometry args={[0.5, 0.42, 0.025]} />
          <meshStandardMaterial color="#272b28" roughness={1} />
        </mesh>
        <mesh position={[0, 0.05, 0.268]} rotation={[0, 0, 0.22]}>
          <capsuleGeometry args={[0.055, 0.21, 3, 5]} />
          <meshStandardMaterial color="#7dff48" emissive="#346f24" emissiveIntensity={0.48} />
        </mesh>
        <mesh position={[0.2, 0.22, 0.269]} rotation={[0, 0, -0.55]}>
          <boxGeometry args={[0.17, 0.05, 0.025]} />
          <meshStandardMaterial color="#985cff" emissive="#54269b" emissiveIntensity={0.7} />
        </mesh>
        <mesh position={[-0.2, -0.26, 0.269]} rotation={[0, 0, 0.5]}>
          <boxGeometry args={[0.2, 0.035, 0.025]} />
          <meshStandardMaterial color="#343834" />
        </mesh>
        <group ref={leftArm} position={[-0.5, 0.27, 0]} rotation={[0.2, 0, 0.12]}>
          <mesh position={[0, -0.4, 0]} castShadow>
            <boxGeometry args={[0.27, 0.84, 0.28]} />
            <meshStandardMaterial color="#8f8b7e" roughness={1} />
          </mesh>
          <mesh position={[0, -0.87, 0]} castShadow>
            <boxGeometry args={[0.2, 0.3, 0.21]} />
            <meshStandardMaterial ref={skin} color="#777b70" emissive="#c63f3f" emissiveIntensity={0} roughness={1} />
          </mesh>
        </group>
        <group ref={rightArm} position={[0.5, 0.27, 0]} rotation={[-0.15, 0, -0.12]}>
          <mesh position={[0, -0.4, 0]} castShadow>
            <boxGeometry args={[0.27, 0.84, 0.28]} />
            <meshStandardMaterial color="#8c897c" roughness={1} />
          </mesh>
          <mesh position={[0, -0.88, 0]} castShadow>
            <boxGeometry args={[0.22, 0.34, 0.23]} />
            <meshStandardMaterial color="#74786d" roughness={1} />
          </mesh>
        </group>
      </group>
      <group position={[0, 2.27, kind === 'runner' ? 0.09 : 0]} rotation={[kind === 'runner' ? -0.18 : 0.06, 0, 0.04]}>
        <mesh castShadow>
          <dodecahedronGeometry args={[0.34, 0]} />
          <meshStandardMaterial color="#72766c" roughness={1} />
        </mesh>
        <mesh position={[0, 0.21, -0.02]} rotation={[0.1, 0, 0]}>
          <dodecahedronGeometry args={[0.31, 0]} />
          <meshStandardMaterial color={kind === 'runner' ? '#2a2527' : '#363a35'} roughness={1} />
        </mesh>
        <mesh position={[-0.12, 0.02, 0.31]}>
          <boxGeometry args={[0.07, 0.035, 0.025]} />
          <meshBasicMaterial color={kind === 'runner' ? '#c63f3f' : '#322624'} />
        </mesh>
        <mesh position={[0.12, 0.02, 0.31]}>
          <boxGeometry args={[0.07, 0.035, 0.025]} />
          <meshBasicMaterial color={kind === 'runner' ? '#c63f3f' : '#322624'} />
        </mesh>
      </group>
      <group ref={leftLeg} position={[-0.2, 1, 0]}>
        <mesh position={[0, -0.43, 0]} castShadow>
          <boxGeometry args={[0.32, 0.86, 0.36]} />
          <meshStandardMaterial color="#333531" roughness={1} />
        </mesh>
        <mesh position={[0, -0.91, 0.08]}>
          <boxGeometry args={[0.35, 0.22, 0.5]} />
          <meshStandardMaterial color="#151815" roughness={1} />
        </mesh>
      </group>
      <group ref={rightLeg} position={[0.2, 1, 0]}>
        <mesh position={[0, -0.43, 0]} castShadow>
          <boxGeometry args={[0.32, 0.86, 0.36]} />
          <meshStandardMaterial color="#383631" roughness={1} />
        </mesh>
        <mesh position={[0, -0.91, 0.08]}>
          <boxGeometry args={[0.35, 0.22, 0.5]} />
          <meshStandardMaterial color="#151815" roughness={1} />
        </mesh>
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
