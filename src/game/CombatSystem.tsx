import {
  createContext,
  type MutableRefObject,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState
} from 'react'
import { Html } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { emitGameAudio, type GameAudioCue } from './AudioSystem'
import { useGameStore } from './GameState'

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
  id: number
  point: THREE.Vector3
  color: string
  damage: number
  power: number
}

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

function ImpactEffect({ effect, remove }: { effect: ImpactDescriptor; remove: (id: number) => void }) {
  const group = useRef<THREE.Group>(null)
  const elapsed = useRef(0)
  const shards = useMemo(
    () =>
      Array.from({ length: effect.power > 1 ? 8 : 5 }, (_, index) => ({
        angle: (index / (effect.power > 1 ? 8 : 5)) * Math.PI * 2 + (index % 2) * 0.24,
        speed: 1.6 + (index % 3) * 0.55,
        lift: 0.55 + (index % 2) * 0.45,
        scale: 0.035 + (index % 3) * 0.018
      })),
    [effect.power]
  )

  useFrame((_, delta) => {
    if (useGameStore.getState().status === 'PAUSED') return
    elapsed.current += delta
    if (group.current) {
      group.current.children.forEach((child, index) => {
        if (index >= shards.length) return
        const shard = shards[index]
        child.position.set(
          Math.cos(shard.angle) * shard.speed * elapsed.current,
          shard.lift * elapsed.current - elapsed.current * elapsed.current * 1.7,
          Math.sin(shard.angle) * shard.speed * elapsed.current
        )
        child.rotation.x += delta * 7
        child.rotation.z += delta * 5
      })
    }
    if (elapsed.current > 0.7) remove(effect.id)
  })

  return (
    <group ref={group} position={effect.point}>
      {shards.map((shard, index) => (
        <mesh key={index} scale={shard.scale}>
          <boxGeometry />
          <meshBasicMaterial color={effect.color} toneMapped={false} />
        </mesh>
      ))}
      <Html center position={[0, 0.8, 0]} zIndexRange={[4, 0]}>
        <span
          style={{
            color: effect.color,
            fontFamily: 'monospace',
            fontSize: effect.power > 1 ? '18px' : '14px',
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

export function CombatSystem({ children }: { children: ReactNode }) {
  const targets = useRef(new Map<string, CombatTarget>())
  const playerReceiver = useRef<PlayerReceiver | null>(null)
  const hitStop = useRef(0)
  const cameraShake = useRef(0)
  const effectId = useRef(0)
  const [effects, setEffects] = useState<ImpactDescriptor[]>([])

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
      const id = ++effectId.current
      setEffects((current) => [
        ...current.slice(-13),
        { id, point, color: hit.heavy ? '#b5ff75' : '#7dff48', damage: hit.damage, power: hit.heavy ? 1.6 : 1 }
      ])
    }
    return hits
  }, [])

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
      damagePlayer: (amount, source) => playerReceiver.current?.damage(amount, source) ?? false,
      addShake: (amount) => {
        cameraShake.current = Math.max(cameraShake.current, amount)
      },
      freeze: (seconds) => {
        hitStop.current = Math.max(hitStop.current, seconds)
      },
      isFrozen: () => hitStop.current > 0,
      emitSound: emitSoundEvent
    }),
    [registerTarget, strike]
  )

  return (
    <CombatContext.Provider value={runtime}>
      {children}
      {effects.map((effect) => (
        <ImpactEffect key={effect.id} effect={effect} remove={removeEffect} />
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
