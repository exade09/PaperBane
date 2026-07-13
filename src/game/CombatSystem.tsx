import {
  createContext,
  type MutableRefObject,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react'
import { Html } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { emitGameAudio, type GameAudioCue } from './AudioSystem'
import { useGameStore } from './GameState'
import { useReducedMotion } from './useReducedMotion'

export type CombatTargetKind = 'walker' | 'runner' | 'boss' | 'crate'

export interface HitPayload {
  damage: number
  heavy: boolean
  knockback: number
  direction: THREE.Vector3
  point: THREE.Vector3
}

export interface CombatTarget {
  id: string
  kind: CombatTargetKind
  position: THREE.Vector3
  radius: number
  alive: boolean
  receiveHit: (hit: HitPayload) => boolean
}

export interface PlayerReceiver {
  position: MutableRefObject<THREE.Vector3>
  damage: (amount: number, source: THREE.Vector3) => boolean
}

interface ImpactDescriptor {
  kind: 'impact'
  id: number
  point: THREE.Vector3
  direction: THREE.Vector3
  color: string
  damage: number
  power: number
}

interface DodgeDescriptor {
  kind: 'dodge'
  id: number
  point: THREE.Vector3
  direction: THREE.Vector3
}

type CombatEffectDescriptor = ImpactDescriptor | DodgeDescriptor

interface CombatRuntime {
  targets: MutableRefObject<Map<string, CombatTarget>>
  hitStop: MutableRefObject<number>
  cameraShake: MutableRefObject<number>
  registerTarget: (target: CombatTarget) => () => void
  strike: (
    origin: THREE.Vector3,
    direction: THREE.Vector3,
    range: number,
    arc: number,
    hit: Omit<HitPayload, 'direction' | 'point'>,
    ignoredIds?: ReadonlySet<string>
  ) => CombatTarget[]
  setPlayerReceiver: (receiver: PlayerReceiver | null) => void
  damagePlayer: (amount: number, source: THREE.Vector3) => boolean
  addShake: (amount: number) => void
  freeze: (seconds: number) => void
  isFrozen: () => boolean
  emitSound: (name: string, strength?: number) => void
  addDodgeBurst: (point: THREE.Vector3, direction: THREE.Vector3) => void
}

const CombatContext = createContext<CombatRuntime | null>(null)

const audioCueAliases: Record<string, GameAudioCue> = {
  'light-swing': 'light-attack',
  'heavy-swing': 'heavy-attack',
  'light-impact': 'impact',
  'empty-stamina': 'ui-click',
  medkit: 'pickup',
  'wick-surge': 'surge',
  'player-death': 'death',
  'walker-death': 'enemy',
  'runner-death': 'enemy',
  'enemy-stagger': 'enemy',
  'walker-attack': 'enemy',
  'runner-impact': 'impact',
  'boss-hit': 'enemy',
  'boss-death': 'death',
  'paper-slam': 'heavy-impact'
}

const emitSoundEvent = (name: string, strength = 1) => {
  const cue = audioCueAliases[name] ?? name as GameAudioCue
  emitGameAudio(cue, strength)
}

const IMPACT_SHARD_GEOMETRY = new THREE.TetrahedronGeometry(0.1, 0)
const PAPER_FRAGMENT_GEOMETRY = new THREE.PlaneGeometry(0.13, 0.19)
const DUST_GEOMETRY = new THREE.CircleGeometry(0.085, 6)
const IMPACT_CORE_GEOMETRY = new THREE.IcosahedronGeometry(0.14, 1)
const SHOCK_RING_GEOMETRY = new THREE.RingGeometry(0.26, 0.34, 18)
const DODGE_RING_GEOMETRY = new THREE.RingGeometry(0.35, 0.47, 20)
const WORLD_UP = new THREE.Vector3(0, 1, 0)
const WORLD_FORWARD = new THREE.Vector3(0, 0, 1)

const SHARED_EFFECT_MATERIALS = {
  greenShard: new THREE.MeshBasicMaterial({ color: '#7dff48', toneMapped: false }),
  heavyShard: new THREE.MeshBasicMaterial({ color: '#c7ff91', toneMapped: false }),
  dangerShard: new THREE.MeshBasicMaterial({ color: '#ff6c55', toneMapped: false }),
  paper: new THREE.MeshBasicMaterial({ color: '#aaa590', side: THREE.DoubleSide, toneMapped: false }),
  paperDark: new THREE.MeshBasicMaterial({ color: '#514d43', side: THREE.DoubleSide }),
  dust: new THREE.MeshBasicMaterial({
    color: '#9a9281',
    transparent: true,
    opacity: 0.38,
    depthWrite: false,
    side: THREE.DoubleSide
  }),
  dodgeDust: new THREE.MeshBasicMaterial({
    color: '#6f786c',
    transparent: true,
    opacity: 0.32,
    depthWrite: false,
    side: THREE.DoubleSide
  })
}

interface BurstParticle {
  velocity: THREE.Vector3
  scale: number
  spin: THREE.Vector3
  material: THREE.Material
  dust: boolean
}

function ImpactEffect({
  effect,
  remove,
  reducedMotion
}: {
  effect: ImpactDescriptor
  remove: (id: number) => void
  reducedMotion: boolean
}) {
  const particleGroup = useRef<THREE.Group>(null)
  const core = useRef<THREE.Mesh>(null)
  const shockRing = useRef<THREE.Mesh>(null)
  const light = useRef<THREE.PointLight>(null)
  const elapsed = useRef(0)
  const heavy = effect.power > 1
  const materials = useMemo(() => ({
    core: new THREE.MeshStandardMaterial({
      color: '#1a2118',
      emissive: effect.color,
      emissiveIntensity: heavy ? 4.2 : 2.8,
      roughness: 0.28,
      transparent: true,
      opacity: 0.92,
      depthWrite: false,
      toneMapped: false,
      blending: THREE.AdditiveBlending
    }),
    ring: new THREE.MeshBasicMaterial({
      color: effect.color,
      transparent: true,
      opacity: 0.78,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
      blending: THREE.AdditiveBlending
    })
  }), [effect.color, heavy])
  useEffect(() => () => {
    materials.core.dispose()
    materials.ring.dispose()
  }, [materials])

  const direction = useMemo(() => {
    const normalized = effect.direction.clone().setY(effect.direction.y * 0.35)
    return normalized.lengthSq() > 0.001 ? normalized.normalize() : WORLD_FORWARD.clone()
  }, [effect.direction])
  const ringQuaternion = useMemo(
    () => new THREE.Quaternion().setFromUnitVectors(WORLD_FORWARD, direction),
    [direction]
  )
  const particles = useMemo<BurstParticle[]>(() => {
    const right = new THREE.Vector3().crossVectors(WORLD_UP, direction)
    if (right.lengthSq() < 0.001) right.set(1, 0, 0)
    else right.normalize()
    const list: BurstParticle[] = []
    const shardCount = reducedMotion ? (heavy ? 4 : 3) : (heavy ? 8 : 6)
    for (let index = 0; index < shardCount; index += 1) {
      const spread = (index / Math.max(1, shardCount - 1) - 0.5) * (heavy ? 2.1 : 1.55)
      const velocity = direction.clone().multiplyScalar((heavy ? 2.5 : 1.8) + index % 3 * 0.38)
        .addScaledVector(right, spread)
        .addScaledVector(WORLD_UP, 0.65 + index % 4 * 0.25)
      list.push({
        velocity,
        scale: 0.58 + index % 3 * 0.18,
        spin: new THREE.Vector3(6 + index % 3 * 2, 4 + index % 4, 7 - index % 2),
        material: effect.color === '#ff6c55'
          ? SHARED_EFFECT_MATERIALS.dangerShard
          : heavy ? SHARED_EFFECT_MATERIALS.heavyShard : SHARED_EFFECT_MATERIALS.greenShard,
        dust: false
      })
    }
    const paperCount = reducedMotion ? 1 : heavy ? 4 : 2
    for (let index = 0; index < paperCount; index += 1) {
      const side = index % 2 === 0 ? -1 : 1
      list.push({
        velocity: direction.clone().multiplyScalar(0.8 + index * 0.18)
          .addScaledVector(right, side * (0.5 + index * 0.16))
          .addScaledVector(WORLD_UP, 0.9 + index % 3 * 0.22),
        scale: 0.65 + index % 2 * 0.18,
        spin: new THREE.Vector3(5 + index, 8 - index, 4 + index * 0.7),
        material: index % 2 ? SHARED_EFFECT_MATERIALS.paperDark : SHARED_EFFECT_MATERIALS.paper,
        dust: false
      })
    }
    const dustCount = reducedMotion ? 1 : heavy ? 3 : 2
    for (let index = 0; index < dustCount; index += 1) {
      list.push({
        velocity: direction.clone().multiplyScalar(0.35 + index * 0.16)
          .addScaledVector(right, (index - 1) * 0.38)
          .addScaledVector(WORLD_UP, 0.28 + index * 0.1),
        scale: 0.8 + index * 0.16,
        spin: new THREE.Vector3(0, 0, index % 2 ? 2.2 : -2.2),
        material: SHARED_EFFECT_MATERIALS.dust,
        dust: true
      })
    }
    return list
  }, [direction, effect.color, heavy, reducedMotion])

  useFrame((_, delta) => {
    if (useGameStore.getState().status === 'PAUSED') return
    elapsed.current += delta
    const duration = reducedMotion ? 0.27 : heavy ? 0.58 : 0.48
    const progress = Math.min(1, elapsed.current / duration)
    if (particleGroup.current) {
      particleGroup.current.children.forEach((child, index) => {
        const particle = particles[index]
        if (!particle) return
        child.position.copy(particle.velocity).multiplyScalar(elapsed.current)
        child.position.y -= elapsed.current * elapsed.current * (particle.dust ? 0.75 : 2.15)
        child.rotation.x += delta * particle.spin.x
        child.rotation.y += delta * particle.spin.y
        child.rotation.z += delta * particle.spin.z
        const fadeScale = particle.dust
          ? particle.scale * (0.45 + progress * 1.4) * (1 - progress * 0.72)
          : particle.scale * Math.max(0.08, 1 - progress * 0.82)
        child.scale.setScalar(fadeScale)
      })
    }
    if (core.current) {
      const coreScale = (heavy ? 1.35 : 1) * Math.max(0.01, 1 - progress) * (0.9 + Math.sin(progress * Math.PI) * 0.55)
      core.current.scale.setScalar(coreScale)
      materials.core.opacity = (1 - progress) * 0.9
      materials.core.emissiveIntensity = (1 - progress) * (heavy ? 4.2 : 2.8)
    }
    if (shockRing.current) {
      const ringScale = 0.45 + progress * (heavy ? 2.3 : 1.45)
      shockRing.current.scale.setScalar(ringScale)
      materials.ring.opacity = (1 - progress) * (heavy ? 0.75 : 0.42)
    }
    if (light.current) light.current.intensity = (1 - progress) * (heavy ? 2.2 : 1.1)
    if (elapsed.current > duration) remove(effect.id)
  })

  return (
    <group position={effect.point}>
      <group ref={particleGroup}>
        {particles.map((particle, index) => (
          <mesh
            key={index}
            geometry={particle.dust ? DUST_GEOMETRY : particle.material === SHARED_EFFECT_MATERIALS.paper || particle.material === SHARED_EFFECT_MATERIALS.paperDark
              ? PAPER_FRAGMENT_GEOMETRY
              : IMPACT_SHARD_GEOMETRY}
            material={particle.material}
            scale={particle.scale}
          />
        ))}
      </group>
      <mesh ref={core} geometry={IMPACT_CORE_GEOMETRY} material={materials.core} />
      <mesh
        ref={shockRing}
        geometry={SHOCK_RING_GEOMETRY}
        material={materials.ring}
        quaternion={ringQuaternion}
      />
      {heavy && <pointLight ref={light} color={effect.color} intensity={2.2} distance={3} decay={2} />}
      <Html center position={[0, 0.72, 0]} zIndexRange={[4, 0]}>
        <span
          style={{
            color: effect.color,
            fontFamily: 'monospace',
            fontSize: heavy ? '18px' : '14px',
            fontWeight: 900,
            textShadow: '0 0 8px #090b0a',
            pointerEvents: 'none'
          }}
        >
          {Math.round(effect.damage)}
        </span>
      </Html>
    </group>
  )
}

function DodgeEffect({
  effect,
  remove,
  reducedMotion
}: {
  effect: DodgeDescriptor
  remove: (id: number) => void
  reducedMotion: boolean
}) {
  const group = useRef<THREE.Group>(null)
  const ring = useRef<THREE.Mesh>(null)
  const elapsed = useRef(0)
  const ringMaterial = useMemo(() => new THREE.MeshBasicMaterial({
    color: '#7dff48',
    transparent: true,
    opacity: 0.28,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
    blending: THREE.AdditiveBlending
  }), [])
  useEffect(() => () => ringMaterial.dispose(), [ringMaterial])
  const particles = useMemo<BurstParticle[]>(() => {
    const forward = effect.direction.clone().setY(0)
    if (forward.lengthSq() < 0.001) forward.copy(WORLD_FORWARD)
    else forward.normalize()
    const right = new THREE.Vector3().crossVectors(WORLD_UP, forward).normalize()
    return Array.from({ length: reducedMotion ? 2 : 6 }, (_, index) => ({
      velocity: forward.clone().multiplyScalar(-0.6 - index % 3 * 0.22)
        .addScaledVector(right, (index / (reducedMotion ? 1 : 5) - 0.5) * 1.45)
        .addScaledVector(WORLD_UP, 0.16 + index % 2 * 0.12),
      scale: 0.62 + index % 3 * 0.14,
      spin: new THREE.Vector3(0, 0, index % 2 ? 2.2 : -2.2),
      material: index % 3 === 0 ? SHARED_EFFECT_MATERIALS.paperDark : SHARED_EFFECT_MATERIALS.dodgeDust,
      dust: index % 3 !== 0
    }))
  }, [effect.direction, reducedMotion])

  useFrame((_, delta) => {
    if (useGameStore.getState().status === 'PAUSED') return
    elapsed.current += delta
    const duration = reducedMotion ? 0.2 : 0.36
    const progress = Math.min(1, elapsed.current / duration)
    group.current?.children.forEach((child, index) => {
      const particle = particles[index]
      if (!particle) return
      child.position.copy(particle.velocity).multiplyScalar(elapsed.current)
      child.position.y = Math.max(0.01, child.position.y - elapsed.current * elapsed.current * 0.6)
      child.rotation.z += delta * particle.spin.z
      child.scale.setScalar(particle.scale * (0.5 + progress) * (1 - progress * 0.8))
    })
    if (ring.current) {
      ring.current.scale.setScalar(0.55 + progress * 1.6)
      ringMaterial.opacity = (1 - progress) * 0.28
    }
    if (elapsed.current > duration) remove(effect.id)
  })

  return (
    <group position={[effect.point.x, effect.point.y + 0.035, effect.point.z]}>
      <group ref={group}>
        {particles.map((particle, index) => (
          <mesh
            key={index}
            geometry={particle.dust ? DUST_GEOMETRY : PAPER_FRAGMENT_GEOMETRY}
            material={particle.material}
            rotation={[-Math.PI / 2, 0, 0]}
          />
        ))}
      </group>
      <mesh
        ref={ring}
        geometry={DODGE_RING_GEOMETRY}
        material={ringMaterial}
        rotation={[-Math.PI / 2, 0, 0]}
      />
    </group>
  )
}

export function CombatSystem({ children }: { children: ReactNode }) {
  const targets = useRef(new Map<string, CombatTarget>())
  const playerReceiver = useRef<PlayerReceiver | null>(null)
  const hitStop = useRef(0)
  const cameraShake = useRef(0)
  const effectId = useRef(0)
  const [effects, setEffects] = useState<CombatEffectDescriptor[]>([])
  const reducedMotion = useReducedMotion()

  useFrame((_, delta) => {
    if (useGameStore.getState().status === 'PAUSED') return
    hitStop.current = Math.max(0, hitStop.current - delta)
    cameraShake.current = Math.max(0, cameraShake.current - delta * 1.8)
  }, -100)

  const registerTarget = useCallback((target: CombatTarget) => {
    targets.current.set(target.id, target)
    return () => {
      if (targets.current.get(target.id) === target) targets.current.delete(target.id)
    }
  }, [])

  const removeEffect = useCallback((id: number) => {
    setEffects((current) => current.filter((effect) => effect.id !== id))
  }, [])

  const queueImpact = useCallback((
    point: THREE.Vector3,
    direction: THREE.Vector3,
    color: string,
    damage: number,
    power: number
  ) => {
    const id = ++effectId.current
    setEffects((current) => [
      ...current.slice(-8),
      {
        kind: 'impact',
        id,
        point: point.clone(),
        direction: direction.clone(),
        color,
        damage,
        power
      }
    ])
  }, [])

  const addDodgeBurst = useCallback((point: THREE.Vector3, direction: THREE.Vector3) => {
    const id = ++effectId.current
    setEffects((current) => [
      ...current.slice(-8),
      { kind: 'dodge', id, point: point.clone(), direction: direction.clone() }
    ])
  }, [])

  const strike = useCallback<CombatRuntime['strike']>((origin, direction, range, arc, hit, ignoredIds) => {
    const flatDirection = direction.clone().setY(0).normalize()
    const hits: CombatTarget[] = []
    const sorted = [...targets.current.values()].sort(
      (a, b) => a.position.distanceToSquared(origin) - b.position.distanceToSquared(origin)
    )
    for (const target of sorted) {
      if (!target.alive || ignoredIds?.has(target.id)) continue
      const offset = target.position.clone().sub(origin)
      offset.y = 0
      const distance = offset.length()
      if (distance > range + target.radius || distance < 0.05) continue
      const targetDirection = offset.divideScalar(distance)
      if (flatDirection.dot(targetDirection) < Math.cos(arc * 0.5)) continue
      const point = target.position.clone().add(new THREE.Vector3(0, target.kind === 'boss' ? 1.8 : 1, 0))
      const payload: HitPayload = {
        ...hit,
        direction: targetDirection,
        point
      }
      if (!target.receiveHit(payload)) continue
      hits.push(target)
      queueImpact(
        point,
        targetDirection,
        hit.heavy ? '#b5ff75' : '#7dff48',
        hit.damage,
        hit.heavy ? 1.6 : 1
      )
    }
    return hits
  }, [queueImpact])

  const damagePlayer = useCallback((amount: number, source: THREE.Vector3) => {
    const receiver = playerReceiver.current
    if (!receiver || !receiver.damage(amount, source)) return false
    const direction = receiver.position.current.clone().sub(source).setY(0)
    queueImpact(
      receiver.position.current.clone().add(new THREE.Vector3(0, 1.05, 0)),
      direction,
      '#ff6c55',
      amount,
      0.86
    )
    return true
  }, [queueImpact])

  const runtime = useMemo<CombatRuntime>(
    () => ({
      targets,
      hitStop,
      cameraShake,
      registerTarget,
      strike,
      setPlayerReceiver: (receiver) => {
        playerReceiver.current = receiver
      },
      damagePlayer,
      addShake: (amount) => {
        cameraShake.current = Math.max(cameraShake.current, amount)
      },
      freeze: (seconds) => {
        hitStop.current = Math.max(hitStop.current, seconds)
      },
      isFrozen: () => hitStop.current > 0,
      emitSound: emitSoundEvent,
      addDodgeBurst
    }),
    [addDodgeBurst, damagePlayer, registerTarget, strike]
  )

  return (
    <CombatContext.Provider value={runtime}>
      {children}
      {effects.map((effect) => (
        effect.kind === 'impact'
          ? <ImpactEffect key={effect.id} effect={effect} remove={removeEffect} reducedMotion={reducedMotion} />
          : <DodgeEffect key={effect.id} effect={effect} remove={removeEffect} reducedMotion={reducedMotion} />
      ))}
    </CombatContext.Provider>
  )
}

export const useCombatSystem = () => {
  const context = useContext(CombatContext)
  if (!context) throw new Error('Combat components must be inside CombatSystem')
  return context
}

export default CombatSystem
