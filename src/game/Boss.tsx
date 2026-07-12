import { type MutableRefObject, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { GAME_CONFIG } from './GameConfig'
import { useGameStore } from './GameState'
import { type CombatTarget, type HitPayload, useCombatSystem } from './CombatSystem'
import { faceDirection } from './EnemyAI'
import { hasLineOfSight, resolveWorldMovement, type WorldBox } from './WorldCollision'
import { useReducedMotion } from './useReducedMotion'

type BossState = 'IDLE' | 'CHASE' | 'SLAM' | 'CHARGE' | 'WAVE' | 'STAGGER' | 'DEAD'

interface BossProps {
  playerPosition: MutableRefObject<THREE.Vector3>
  extraColliders: WorldBox[]
}

interface BossModelProps {
  state: BossState
  stateTime: MutableRefObject<number>
  enraged: boolean
  flash: boolean
}

const damp = (value: number, target: number, delta: number, speed = 10) =>
  THREE.MathUtils.lerp(value, target, 1 - Math.exp(-speed * delta))

function BossModel({ state, stateTime, enraged, flash }: BossModelProps) {
  const reducedMotion = useReducedMotion()
  const root = useRef<THREE.Group>(null)
  const torso = useRef<THREE.Group>(null)
  const leftArm = useRef<THREE.Group>(null)
  const rightArm = useRef<THREE.Group>(null)
  const leftLeg = useRef<THREE.Group>(null)
  const rightLeg = useRef<THREE.Group>(null)
  const chest = useRef<THREE.MeshStandardMaterial>(null)
  const shirt = useRef<THREE.MeshStandardMaterial>(null)

  useFrame(({ clock }, delta) => {
    const gameStatus = useGameStore.getState().status
    if (gameStatus !== 'PLAYING' && gameStatus !== 'BOSS_INTRO' && state !== 'DEAD') return
    const time = clock.elapsedTime
    const attackTime = stateTime.current
    let leftArmX = 0.22
    let rightArmX = -0.18
    let armZ = 0.22
    let leg = 0
    let torsoX = 0.13
    let torsoY = 0
    let rootY = Math.sin(time * 1.3) * 0.025
    let rootX = 0
    let rootZ = 0

    if (state === 'CHASE') {
      leg = Math.sin(time * (enraged ? 6.6 : 5.2)) * 0.52
      leftArmX = -leg * 0.65
      rightArmX = leg * 0.65
      torsoX = 0.25
      rootY = Math.abs(Math.sin(time * 5.2)) * 0.045
    } else if (state === 'SLAM') {
      const p = Math.min(1, attackTime / 1.48)
      if (p < 0.58) {
        leftArmX = -2.65 * (p / 0.58)
        rightArmX = -2.65 * (p / 0.58)
        torsoX = -0.2
      } else {
        const slam = Math.min(1, (p - 0.58) / 0.18)
        leftArmX = -2.65 + slam * 4.05
        rightArmX = -2.65 + slam * 4.05
        torsoX = -0.2 + slam * 0.86
      }
    } else if (state === 'CHARGE') {
      const prep = Math.min(1, attackTime / 0.65)
      torsoX = -0.35 + prep * 1.04
      leftArmX = 0.5 + prep * 0.8
      rightArmX = 0.5 + prep * 0.8
      leg = attackTime > 0.65 && attackTime < 1.35 ? Math.sin(time * 14) * 0.82 : 0
    } else if (state === 'WAVE') {
      const rise = Math.min(1, attackTime / 0.88)
      leftArmX = -2.4 * rise
      rightArmX = -2.4 * rise
      armZ = 0.65
      torsoX = -0.12
      torsoY = Math.sin(time * 5) * 0.1
    } else if (state === 'STAGGER') {
      torsoX = -Math.sin(Math.min(1, attackTime / 0.3) * Math.PI) * 0.25
      rootZ = 0.12
      leftArmX = 0.75
      rightArmX = 0.75
    } else if (state === 'DEAD') {
      rootX = Math.min(Math.PI * 0.46, attackTime * 0.95)
      rootZ = -0.16
      rootY = -Math.min(1.4, attackTime * 0.62)
      leftArmX = 1.35
      rightArmX = 0.95
      leg = -0.2
    }

    if (root.current) {
      root.current.rotation.x = damp(root.current.rotation.x, rootX, delta, state === 'DEAD' ? 2.8 : 10)
      root.current.rotation.z = damp(root.current.rotation.z, rootZ, delta)
      root.current.position.y = damp(root.current.position.y, rootY, delta)
    }
    if (torso.current) {
      torso.current.rotation.x = damp(torso.current.rotation.x, torsoX, delta)
      torso.current.rotation.y = damp(torso.current.rotation.y, torsoY, delta)
    }
    if (leftArm.current) {
      leftArm.current.rotation.x = damp(leftArm.current.rotation.x, leftArmX, delta, 14)
      leftArm.current.rotation.z = damp(leftArm.current.rotation.z, armZ, delta)
    }
    if (rightArm.current) {
      rightArm.current.rotation.x = damp(rightArm.current.rotation.x, rightArmX, delta, 14)
      rightArm.current.rotation.z = damp(rightArm.current.rotation.z, -armZ, delta)
    }
    if (leftLeg.current) leftLeg.current.rotation.x = damp(leftLeg.current.rotation.x, leg, delta)
    if (rightLeg.current) rightLeg.current.rotation.x = damp(rightLeg.current.rotation.x, -leg, delta)
    if (chest.current) {
      const fade = state === 'DEAD' ? Math.max(0, 1 - attackTime / 2.15) : 1
      chest.current.emissiveIntensity = ((enraged ? 4.4 : 2.8) + (reducedMotion ? 0 : Math.sin(time * 7) * 0.5)) * fade
    }
    if (shirt.current) shirt.current.emissiveIntensity = flash ? 0.95 : 0
  })

  const Finger = ({ x, z, length }: { x: number; z: number; length: number }) => (
    <mesh position={[x, -1.28 - length * 0.5, z]} rotation={[0.08, 0, x * 0.2]} castShadow>
      <boxGeometry args={[0.075, length, 0.075]} />
      <meshStandardMaterial color="#8b887e" roughness={1} />
    </mesh>
  )

  return (
    <group ref={root} scale={[1.22, 1.22, 1.22]}>
      <group ref={torso} position={[0, 1.75, 0]}>
        <mesh castShadow scale={[1.18, 1, 0.7]}>
          <boxGeometry args={[1.15, 1.38, 0.65]} />
          <meshStandardMaterial ref={shirt} color="#b0ab99" emissive="#7dff48" emissiveIntensity={0} roughness={1} />
        </mesh>
        <mesh position={[0, 0.06, 0.36]}>
          <boxGeometry args={[0.68, 0.68, 0.035]} />
          <meshStandardMaterial color="#272a27" roughness={1} />
        </mesh>
        <mesh position={[0, 0.06, 0.39]}>
          <boxGeometry args={[0.21, 0.62, 0.11]} />
          <meshStandardMaterial
            ref={chest}
            color="#c63f3f"
            emissive="#c63f3f"
            emissiveIntensity={3}
            toneMapped={false}
          />
        </mesh>
        <mesh position={[0, 0.48, 0.39]}>
          <cylinderGeometry args={[0.025, 0.025, 0.27, 5]} />
          <meshStandardMaterial color="#ff5353" emissive="#c63f3f" emissiveIntensity={3} toneMapped={false} />
        </mesh>
        <mesh position={[0, -0.36, 0.39]}>
          <cylinderGeometry args={[0.025, 0.025, 0.27, 5]} />
          <meshStandardMaterial color="#ff5353" emissive="#c63f3f" emissiveIntensity={3} toneMapped={false} />
        </mesh>
        <mesh position={[0.34, 0.35, 0.39]} rotation={[0, 0, -0.6]}>
          <boxGeometry args={[0.28, 0.055, 0.03]} />
          <meshStandardMaterial color="#985cff" emissive="#713fc9" emissiveIntensity={0.85} />
        </mesh>
        <group ref={leftArm} position={[-0.78, 0.44, 0]}>
          <mesh position={[0, -0.56, 0]} castShadow>
            <boxGeometry args={[0.4, 1.2, 0.43]} />
            <meshStandardMaterial color="#9a9687" roughness={1} />
          </mesh>
          <Finger x={-0.14} z={0.04} length={0.72} />
          <Finger x={-0.045} z={0.08} length={0.88} />
          <Finger x={0.055} z={0.04} length={0.82} />
          <Finger x={0.15} z={0} length={0.68} />
        </group>
        <group ref={rightArm} position={[0.78, 0.44, 0]}>
          <mesh position={[0, -0.56, 0]} castShadow>
            <boxGeometry args={[0.4, 1.2, 0.43]} />
            <meshStandardMaterial color="#999587" roughness={1} />
          </mesh>
          <Finger x={-0.14} z={0.04} length={0.68} />
          <Finger x={-0.045} z={0.08} length={0.82} />
          <Finger x={0.055} z={0.04} length={0.88} />
          <Finger x={0.15} z={0} length={0.72} />
        </group>
      </group>
      <group position={[0, 2.94, 0.02]} rotation={[0.09, 0, 0]}>
        <mesh castShadow scale={[0.88, 1.16, 0.86]}>
          <dodecahedronGeometry args={[0.48, 0]} />
          <meshStandardMaterial color="#73776f" roughness={1} />
        </mesh>
        <mesh position={[0, 0.3, -0.05]} scale={[1.04, 0.75, 1]}>
          <dodecahedronGeometry args={[0.45, 0]} />
          <meshStandardMaterial color="#191c19" roughness={1} />
        </mesh>
        <mesh position={[-0.16, 0.05, 0.43]}>
          <boxGeometry args={[0.09, 0.045, 0.025]} />
          <meshBasicMaterial color="#ff4b4b" toneMapped={false} />
        </mesh>
        <mesh position={[0.16, 0.05, 0.43]}>
          <boxGeometry args={[0.09, 0.045, 0.025]} />
          <meshBasicMaterial color="#ff4b4b" toneMapped={false} />
        </mesh>
      </group>
      <group ref={leftLeg} position={[-0.31, 1.12, 0]}>
        <mesh position={[0, -0.54, 0]} castShadow>
          <boxGeometry args={[0.48, 1.12, 0.52]} />
          <meshStandardMaterial color="#302e2c" roughness={1} />
        </mesh>
        <mesh position={[0, -1.16, 0.13]}>
          <boxGeometry args={[0.53, 0.29, 0.7]} />
          <meshStandardMaterial color="#101210" roughness={0.85} />
        </mesh>
      </group>
      <group ref={rightLeg} position={[0.31, 1.12, 0]}>
        <mesh position={[0, -0.54, 0]} castShadow>
          <boxGeometry args={[0.48, 1.12, 0.52]} />
          <meshStandardMaterial color="#302e2c" roughness={1} />
        </mesh>
        <mesh position={[0, -1.16, 0.13]}>
          <boxGeometry args={[0.53, 0.29, 0.7]} />
          <meshStandardMaterial color="#101210" roughness={0.85} />
        </mesh>
      </group>
    </group>
  )
}

function PaperBurst() {
  const group = useRef<THREE.Group>(null)
  const pieces = useMemo(() => Array.from({ length: 18 }, (_, index) => ({
    angle: (index / 18) * Math.PI * 2,
    speed: 1.8 + (index % 5) * 0.42,
    lift: 1.8 + (index % 4) * 0.38,
    size: 0.16 + (index % 3) * 0.08
  })), [])
  const time = useRef(0)
  useFrame((_, delta) => {
    if (time.current >= 2.5) return
    time.current = Math.min(2.5, time.current + delta)
    group.current?.children.forEach((child, index) => {
      const piece = pieces[index]
      child.position.set(
        Math.cos(piece.angle) * piece.speed * time.current,
        2.2 + piece.lift * time.current - time.current * time.current * 2,
        Math.sin(piece.angle) * piece.speed * time.current
      )
      child.rotation.x += delta * (4 + index % 4)
      child.rotation.y += delta * (3 + index % 3)
    })
  })
  return (
    <group ref={group}>
      {pieces.map((piece, index) => (
        <mesh key={index} scale={[piece.size, piece.size * 1.35, 0.025]}>
          <planeGeometry />
          <meshStandardMaterial color={index % 4 === 0 ? '#c63f3f' : '#a7a495'} side={THREE.DoubleSide} />
        </mesh>
      ))}
    </group>
  )
}

export function Boss({ playerPosition, extraColliders }: BossProps) {
  const combat = useCombatSystem()
  const bossHp = useGameStore((state) => state.bossHp)
  const group = useRef<THREE.Group>(null)
  const waveMesh = useRef<THREE.Mesh>(null)
  const waveWarning = useRef<THREE.Mesh>(null)
  const bossLight = useRef<THREE.PointLight>(null)
  const position = useRef(new THREE.Vector3(0, 0, GAME_CONFIG.world.bossCenterZ))
  const alive = useRef(true)
  const completed = useRef(false)
  const stateRef = useRef<BossState>('IDLE')
  const stateTime = useRef(0)
  const attackCooldown = useRef(1.1)
  const attackIndex = useRef(0)
  const attackHit = useRef(false)
  const chargeDirection = useRef(new THREE.Vector3())
  const facing = useRef(0)
  const [modelState, setModelState] = useState<BossState>('IDLE')
  const [flash, setFlash] = useState(false)
  const flashTimer = useRef<number | null>(null)
  const enraged = bossHp <= GAME_CONFIG.enemies.boss.hp * 0.5

  const transition = useCallback((next: BossState) => {
    if (stateRef.current === next) return
    stateRef.current = next
    stateTime.current = 0
    attackHit.current = false
    if (next === 'CHARGE') chargeDirection.current.copy(playerPosition.current).sub(position.current).setY(0).normalize()
    setModelState(next)
  }, [playerPosition])

  const receiveHit = useCallback((hit: HitPayload) => {
    if (!alive.current || useGameStore.getState().status !== 'PLAYING') return false
    const state = useGameStore.getState()
    const remaining = Math.max(0, state.bossHp - hit.damage)
    state.damageBoss(hit.damage)
    setFlash(true)
    if (flashTimer.current !== null) window.clearTimeout(flashTimer.current)
    flashTimer.current = window.setTimeout(() => setFlash(false), 105)
    if (remaining <= 0) {
      alive.current = false
      transition('DEAD')
      state.registerKill()
      combat.freeze(0.13)
      combat.addShake(1.4)
      combat.emitSound('boss-death', 1)
    } else {
      combat.emitSound('boss-hit', hit.heavy ? 0.9 : 0.65)
    }
    return true
  }, [combat, transition])

  const target = useMemo<CombatTarget>(() => ({
    id: 'paper-king',
    kind: 'boss',
    position: position.current,
    radius: 0.95,
    get alive() {
      return alive.current
    },
    receiveHit
  }), [receiveHit])

  useEffect(() => combat.registerTarget(target), [combat, target])
  useEffect(() => () => {
    if (flashTimer.current !== null) window.clearTimeout(flashTimer.current)
  }, [])

  useFrame((_, delta) => {
    const mesh = group.current
    if (!mesh) return
    const status = useGameStore.getState().status
    if (stateRef.current === 'DEAD') {
      if (status !== 'PLAYING') return
      stateTime.current = Math.min(2.5, stateTime.current + delta)
      if (bossLight.current) bossLight.current.intensity = THREE.MathUtils.lerp(bossLight.current.intensity, 0, 1 - Math.exp(-2.4 * delta))
      if (!completed.current && stateTime.current >= 2.35) {
        completed.current = true
        useGameStore.getState().completeGame()
      }
      return
    }
    if (status !== 'PLAYING' || combat.isFrozen()) return
    stateTime.current += delta
    attackCooldown.current = Math.max(0, attackCooldown.current - delta)
    const toPlayer = playerPosition.current.clone().sub(position.current).setY(0)
    const distance = toPlayer.length()
    const direction = distance > 0.001 ? toPlayer.clone().divideScalar(distance) : new THREE.Vector3(0, 0, 1)
    const canHitPlayer = hasLineOfSight(
      position.current.clone().add(new THREE.Vector3(0, 1, 0)),
      playerPosition.current.clone().add(new THREE.Vector3(0, 1, 0)),
      extraColliders
    )
    if (bossLight.current) bossLight.current.intensity = enraged ? 3.2 : 1.8

    if (stateRef.current === 'IDLE' || stateRef.current === 'CHASE') {
      if (attackCooldown.current <= 0) {
        const sequence = attackIndex.current++ % 3
        if (sequence === 0 && distance < 4.6) {
          transition('SLAM')
          combat.emitSound('boss-warning', 1)
        } else if (sequence === 2) {
          transition('WAVE')
          combat.emitSound('boss-warning', 1)
        } else {
          transition('CHARGE')
          combat.emitSound('boss-warning', 1)
        }
      } else {
        transition('CHASE')
        const speed = GAME_CONFIG.enemies.boss.speed * (enraged ? 1.24 : 1)
        const desired = position.current.clone().addScaledVector(direction, speed * delta)
        position.current.copy(resolveWorldMovement(position.current, desired, 0.9, extraColliders))
        facing.current = faceDirection(facing.current, direction, delta, enraged ? 8 : 6)
      }
    } else if (stateRef.current === 'SLAM') {
      facing.current = faceDirection(facing.current, direction, delta, 7)
      if (!attackHit.current && stateTime.current >= 0.9) {
        attackHit.current = true
        const forward = new THREE.Vector3(Math.sin(facing.current), 0, Math.cos(facing.current))
        if (distance <= 4.35 && forward.dot(direction) > 0.15 && canHitPlayer) {
          combat.damagePlayer(GAME_CONFIG.enemies.boss.damage + 4, position.current)
        }
        combat.addShake(1.05)
        combat.emitSound('paper-slam', 1)
      }
      if (stateTime.current >= 1.48) {
        attackCooldown.current = enraged ? 1.05 : 1.4
        transition('CHASE')
      }
    } else if (stateRef.current === 'CHARGE') {
      if (stateTime.current < 0.65) {
        facing.current = faceDirection(facing.current, chargeDirection.current, delta, 10)
      } else if (stateTime.current < 1.35) {
        const desired = position.current.clone().addScaledVector(chargeDirection.current, (enraged ? 12.4 : 10.7) * delta)
        const moved = resolveWorldMovement(position.current, desired, 0.9, extraColliders)
        const blocked = moved.distanceToSquared(position.current) < 0.0001
        position.current.copy(moved)
        if (!attackHit.current && position.current.distanceTo(playerPosition.current) < 1.65 && canHitPlayer) {
          attackHit.current = true
          combat.damagePlayer(GAME_CONFIG.enemies.boss.damage + 2, position.current)
          combat.addShake(0.72)
        }
        if (blocked) stateTime.current = 1.36
      }
      if (stateTime.current >= 2.05) {
        attackCooldown.current = enraged ? 0.9 : 1.35
        transition('CHASE')
      }
    } else if (stateRef.current === 'WAVE') {
      const waveProgress = THREE.MathUtils.clamp((stateTime.current - 0.88) / 0.82, 0, 1)
      const radius = waveProgress * 9
      if (waveWarning.current) waveWarning.current.visible = stateTime.current < 0.88
      if (waveMesh.current) {
        waveMesh.current.visible = waveProgress > 0 && waveProgress < 1
        waveMesh.current.scale.setScalar(Math.max(0.01, radius))
      }
      if (!attackHit.current && waveProgress > 0) {
        const playerDistance = position.current.distanceTo(playerPosition.current)
        if (Math.abs(playerDistance - radius) < 0.62 && canHitPlayer) {
          attackHit.current = true
          combat.damagePlayer(GAME_CONFIG.enemies.boss.damage, position.current)
          combat.addShake(0.5)
        }
      }
      if (stateTime.current >= 1.72) {
        attackCooldown.current = enraged ? 1 : 1.45
        if (waveMesh.current) waveMesh.current.visible = false
        transition('CHASE')
      }
    }

    mesh.position.copy(position.current)
    mesh.rotation.y = facing.current
  })

  return (
    <group ref={group} position={[0, 0, GAME_CONFIG.world.bossCenterZ]}>
      <BossModel state={modelState} stateTime={stateTime} enraged={enraged} flash={flash} />
      {(modelState === 'SLAM' || modelState === 'CHARGE') && (
        <mesh position={[0, 0.035, modelState === 'SLAM' ? 2.4 : 4.4]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={modelState === 'SLAM' ? [4.8, 5.2] : [2.1, 9]} />
          <meshBasicMaterial color="#c63f3f" transparent opacity={0.2} depthWrite={false} />
        </mesh>
      )}
      <mesh ref={waveMesh} visible={false} position={[0, 0.08, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.86, 1, 32]} />
        <meshBasicMaterial color="#ff4b4b" transparent opacity={0.74} depthWrite={false} toneMapped={false} />
      </mesh>
      {modelState === 'WAVE' && (
        <mesh ref={waveWarning} position={[0, 0.055, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[1.4, 4.2, 32]} />
          <meshBasicMaterial color="#c63f3f" transparent opacity={0.18} depthWrite={false} />
        </mesh>
      )}
      {modelState === 'DEAD' && <PaperBurst />}
      <pointLight
        ref={bossLight}
        position={[0, 2.1, 0.5]}
        color="#c63f3f"
        intensity={enraged ? 3.2 : 1.8}
        distance={enraged ? 9 : 6}
        decay={2}
      />
    </group>
  )
}

export default Boss
