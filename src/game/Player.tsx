import { type MutableRefObject, useCallback, useEffect, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { GAME_CONFIG } from './GameConfig'
import { useGameStore } from './GameState'
import { useCombatSystem } from './CombatSystem'
import { PlayerModel, type PlayerAnimation } from './PlayerModel'
import { resolveWorldMovement, type WorldBox } from './WorldCollision'

type ActionKind = 'LIGHT' | 'HEAVY' | 'DODGE' | 'HIT'

interface PlayerAction {
  kind: ActionKind
  elapsed: number
  duration: number
  hitDone: boolean
  hitTargets: Set<string>
  comboStep: number
  direction: THREE.Vector3
}

interface PlayerProps {
  playerRef: MutableRefObject<THREE.Group | null>
  playerPosition: MutableRefObject<THREE.Vector3>
  cameraYaw: MutableRefObject<number>
  combatZoom: MutableRefObject<number>
  spawn: [number, number, number]
  extraColliders: WorldBox[]
  onInteract: () => void
}

const actionAnimation = (action: PlayerAction): PlayerAnimation => {
  if (action.kind === 'LIGHT') return `ATTACK_${action.comboStep + 1}` as PlayerAnimation
  if (action.kind === 'HEAVY') return 'HEAVY'
  if (action.kind === 'DODGE') return 'DODGE'
  return 'HIT'
}

export function Player({
  playerRef,
  playerPosition,
  cameraYaw,
  combatZoom,
  spawn,
  extraColliders,
  onInteract
}: PlayerProps) {
  const combat = useCombatSystem()
  const keys = useRef(new Set<string>())
  const action = useRef<PlayerAction | null>(null)
  const bufferedLight = useRef(false)
  const comboStep = useRef(-1)
  const lastLightEnd = useRef(-10)
  const lastDodge = useRef(-10)
  const lastStaminaUse = useRef(-10)
  const invulnerableUntil = useRef(-10)
  const lastFootstep = useRef(-10)
  const [animation, setAnimation] = useState<PlayerAnimation>('IDLE')
  const [damageFlash, setDamageFlash] = useState(false)
  const flashTimer = useRef<number | null>(null)
  const facingYaw = useRef(Math.PI)
  const desiredMove = useRef(new THREE.Vector3())
  const damagePush = useRef(new THREE.Vector3())
  const position = playerPosition

  const beginLight = useCallback(() => {
    const state = useGameStore.getState()
    if (state.status !== 'PLAYING') return
    const current = action.current
    if (current) {
      if (current.kind === 'LIGHT' && current.elapsed >= 0.14) bufferedLight.current = true
      return
    }
    const now = performance.now() / 1000
    facingYaw.current = cameraYaw.current + Math.PI
    comboStep.current = now - lastLightEnd.current <= GAME_CONFIG.combat.comboWindow ? (comboStep.current + 1) % 3 : 0
    const speed = state.surgeTime > 0 ? GAME_CONFIG.surge.attackSpeedMultiplier : 1
    action.current = {
      kind: 'LIGHT',
      elapsed: 0,
      duration: 0.5 / speed,
      hitDone: false,
      hitTargets: new Set(),
      comboStep: comboStep.current,
      direction: new THREE.Vector3()
    }
    bufferedLight.current = false
    setAnimation(`ATTACK_${comboStep.current + 1}` as PlayerAnimation)
    combat.emitSound('light-swing', 0.72)
  }, [combat])

  const beginHeavy = useCallback(() => {
    const state = useGameStore.getState()
    if (state.status !== 'PLAYING' || action.current) return
    if (!state.spendStamina(GAME_CONFIG.combat.heavyStaminaCost)) {
      combat.emitSound('empty-stamina', 0.45)
      return
    }
    lastStaminaUse.current = performance.now() / 1000
    facingYaw.current = cameraYaw.current + Math.PI
    const speed = state.surgeTime > 0 ? GAME_CONFIG.surge.attackSpeedMultiplier : 1
    action.current = {
      kind: 'HEAVY',
      elapsed: 0,
      duration: 0.86 / speed,
      hitDone: false,
      hitTargets: new Set(),
      comboStep: 0,
      direction: new THREE.Vector3()
    }
    bufferedLight.current = false
    setAnimation('HEAVY')
    combat.emitSound('heavy-swing', 1)
  }, [combat])

  const getInputDirection = useCallback(() => {
    const forward = new THREE.Vector3(Math.sin(cameraYaw.current), 0, -Math.cos(cameraYaw.current))
    const right = new THREE.Vector3(Math.cos(cameraYaw.current), 0, Math.sin(cameraYaw.current))
    const direction = new THREE.Vector3()
    if (keys.current.has('KeyW')) direction.add(forward)
    if (keys.current.has('KeyS')) direction.sub(forward)
    if (keys.current.has('KeyD')) direction.add(right)
    if (keys.current.has('KeyA')) direction.sub(right)
    return direction.lengthSq() > 0 ? direction.normalize() : direction
  }, [cameraYaw])

  const beginDodge = useCallback(() => {
    const state = useGameStore.getState()
    const now = performance.now() / 1000
    if (state.status !== 'PLAYING' || action.current || now - lastDodge.current < GAME_CONFIG.player.dodgeCooldown) return
    if (!state.spendStamina(GAME_CONFIG.player.dodgeCost)) {
      combat.emitSound('empty-stamina', 0.45)
      return
    }
    let direction = getInputDirection()
    if (direction.lengthSq() === 0) {
      direction = new THREE.Vector3(-Math.sin(facingYaw.current), 0, -Math.cos(facingYaw.current))
    }
    action.current = {
      kind: 'DODGE',
      elapsed: 0,
      duration: GAME_CONFIG.player.dodgeDuration,
      hitDone: false,
      hitTargets: new Set(),
      comboStep: 0,
      direction
    }
    lastDodge.current = now
    lastStaminaUse.current = now
    invulnerableUntil.current = now + GAME_CONFIG.player.dodgeDuration
    setAnimation('DODGE')
    combat.emitSound('dodge', 0.72)
  }, [combat, getInputDirection])

  useEffect(() => {
    position.current.set(spawn[0], spawn[1], spawn[2])
    if (playerRef.current) playerRef.current.position.copy(position.current)
  }, [playerRef, position, spawn])

  useEffect(() => {
    const keyDown = (event: KeyboardEvent) => {
      keys.current.add(event.code)
      if (event.repeat) return
      const state = useGameStore.getState()
      if (event.code === 'Escape' && (state.status === 'PLAYING' || state.status === 'BOSS_INTRO')) {
        state.pause()
        if (document.pointerLockElement) document.exitPointerLock()
      } else if (event.code === 'Space') {
        event.preventDefault()
        beginDodge()
      } else if (event.code === 'KeyQ') {
        state.useMedkit()
      } else if (event.code === 'KeyF') {
        if (state.activateSurge()) {
          combat.addShake(0.28)
        }
      } else if (event.code === 'KeyE' && state.status === 'PLAYING') {
        onInteract()
      }
    }
    const keyUp = (event: KeyboardEvent) => keys.current.delete(event.code)
    const mouseDown = (event: MouseEvent) => {
      if (!document.pointerLockElement || useGameStore.getState().status !== 'PLAYING') return
      if (event.button === 0) beginLight()
      if (event.button === 2) beginHeavy()
    }
    const clear = () => keys.current.clear()
    window.addEventListener('keydown', keyDown)
    window.addEventListener('keyup', keyUp)
    window.addEventListener('mousedown', mouseDown)
    window.addEventListener('blur', clear)
    return () => {
      window.removeEventListener('keydown', keyDown)
      window.removeEventListener('keyup', keyUp)
      window.removeEventListener('mousedown', mouseDown)
      window.removeEventListener('blur', clear)
    }
  }, [beginDodge, beginHeavy, beginLight, combat, onInteract])

  useEffect(() => {
    const receiver = {
      position,
      damage: (amount: number, source: THREE.Vector3) => {
        const state = useGameStore.getState()
        const now = performance.now() / 1000
        if (
          state.status !== 'PLAYING' ||
          now < invulnerableUntil.current ||
          action.current?.kind === 'DODGE'
        ) return false
        invulnerableUntil.current = now + GAME_CONFIG.player.damageInvulnerability
        state.damagePlayer(amount)
        const away = position.current.clone().sub(source).setY(0)
        if (away.lengthSq() > 0.001) damagePush.current.add(away.normalize().multiplyScalar(1.15))
        combat.addShake(0.48)
        setDamageFlash(true)
        if (flashTimer.current !== null) window.clearTimeout(flashTimer.current)
        flashTimer.current = window.setTimeout(() => setDamageFlash(false), 190)
        if (useGameStore.getState().hp <= 0) {
          action.current = null
          setAnimation('DEATH')
        } else {
          action.current = {
            kind: 'HIT',
            elapsed: 0,
            duration: 0.38,
            hitDone: true,
            hitTargets: new Set(),
            comboStep: 0,
            direction: away
          }
          setAnimation('HIT')
        }
        return true
      }
    }
    combat.setPlayerReceiver(receiver)
    return () => combat.setPlayerReceiver(null)
  }, [combat, position])

  useEffect(() => {
    const unsubscribe = useGameStore.subscribe((state, previous) => {
      if (state.status === previous.status) return
      if (state.status === 'PLAYER_DEAD') {
        action.current = null
        setAnimation('DEATH')
      } else if (state.status === 'VICTORY') {
        action.current = null
        setAnimation('VICTORY')
      } else if (state.status === 'BOSS_INTRO') {
        action.current = null
        setAnimation('IDLE')
      } else if (state.status === 'PLAYING' && previous.status !== 'PAUSED' && previous.status !== 'BOSS_INTRO') {
        action.current = null
        setAnimation('IDLE')
      }
    })
    return unsubscribe
  }, [])

  useEffect(() => () => {
    if (flashTimer.current !== null) window.clearTimeout(flashTimer.current)
  }, [])

  useFrame((_, delta) => {
    const group = playerRef.current
    if (!group) return
    const state = useGameStore.getState()
    if (state.status === 'PLAYER_DEAD' || state.status === 'VICTORY') return
    if (state.status !== 'PLAYING' || combat.isFrozen()) return
    const now = performance.now() / 1000
    const currentAction = action.current
    const surgeActive = state.surgeTime > 0
    combatZoom.current = THREE.MathUtils.lerp(
      combatZoom.current,
      currentAction?.kind === 'LIGHT' || currentAction?.kind === 'HEAVY' ? 1 : 0,
      1 - Math.exp(-10 * delta)
    )

    if (currentAction) {
      const previousElapsed = currentAction.elapsed
      currentAction.elapsed += delta
      if (currentAction.kind === 'DODGE') {
        const desired = position.current.clone().addScaledVector(currentAction.direction, delta * 12.4)
        position.current.copy(resolveWorldMovement(position.current, desired, 0.46, extraColliders))
      }
      const activeTime = currentAction.kind === 'HEAVY' ? currentAction.duration * 0.47 : currentAction.duration * 0.38
      const activeEnd = activeTime + currentAction.duration * (currentAction.kind === 'HEAVY' ? 0.2 : 0.18)
      const inActiveWindow = currentAction.elapsed >= activeTime && previousElapsed <= activeEnd
      if ((currentAction.kind === 'LIGHT' || currentAction.kind === 'HEAVY') && inActiveWindow) {
        facingYaw.current = cameraYaw.current + Math.PI
        const forward = new THREE.Vector3(Math.sin(facingYaw.current), 0, Math.cos(facingYaw.current)).normalize()
        const heavy = currentAction.kind === 'HEAVY'
        const baseDamage = heavy
          ? GAME_CONFIG.combat.heavyDamage
          : GAME_CONFIG.combat.lightDamage[currentAction.comboStep]
        const damage = baseDamage * (surgeActive ? GAME_CONFIG.surge.damageMultiplier : 1)
        const hits = combat.strike(
          position.current.clone().add(new THREE.Vector3(0, 1.05, 0)),
          forward,
          heavy ? GAME_CONFIG.combat.heavyRange : GAME_CONFIG.combat.lightRange,
          heavy ? GAME_CONFIG.combat.heavyArc : GAME_CONFIG.combat.lightArc,
          {
            damage,
            heavy,
            knockback: (heavy ? 2.9 : 1.05) * (surgeActive ? GAME_CONFIG.surge.knockbackMultiplier : 1)
          },
          currentAction.hitTargets
        )
        if (hits.length > 0) {
          for (const hitTarget of hits) {
            currentAction.hitTargets.add(hitTarget.id)
            if (hitTarget.kind !== 'crate') state.registerHit(damage)
          }
          combat.freeze(GAME_CONFIG.combat.hitStop)
          combat.addShake(heavy ? 0.72 : 0.28)
          if (heavy) combat.emitSound('heavy-impact', 1)
        }
      }
      if (currentAction.elapsed > activeEnd) currentAction.hitDone = true
      if (currentAction.elapsed >= currentAction.duration) {
        if (currentAction.kind === 'LIGHT') {
          lastLightEnd.current = now
          if (bufferedLight.current) {
            action.current = null
            bufferedLight.current = false
            beginLight()
          } else {
            action.current = null
            setAnimation('IDLE')
          }
        } else {
          action.current = null
          setAnimation('IDLE')
        }
      }
    } else {
      const direction = getInputDirection()
      desiredMove.current.copy(direction)
      const moving = direction.lengthSq() > 0
      const wantsSprint = moving && (keys.current.has('ShiftLeft') || keys.current.has('ShiftRight'))
      let sprinting = false
      let speed: number = GAME_CONFIG.player.moveSpeed
      if (wantsSprint && state.stamina > 0.5) {
        sprinting = true
        speed = GAME_CONFIG.player.sprintSpeed
        const drain = GAME_CONFIG.player.sprintDrain * delta
        state.setStamina(state.stamina - drain)
        lastStaminaUse.current = now
      }
      if (moving) {
        const desired = position.current.clone().addScaledVector(direction, speed * delta)
        position.current.copy(resolveWorldMovement(position.current, desired, 0.46, extraColliders))
        const targetYaw = Math.atan2(direction.x, direction.z)
        let difference = targetYaw - facingYaw.current
        while (difference > Math.PI) difference -= Math.PI * 2
        while (difference < -Math.PI) difference += Math.PI * 2
        facingYaw.current += difference * Math.min(1, delta * 12)
        const nextAnimation: PlayerAnimation = sprinting ? 'RUN' : 'WALK'
        if (animation !== nextAnimation) setAnimation(nextAnimation)
        if (now - lastFootstep.current >= (sprinting ? 0.27 : 0.43)) {
          lastFootstep.current = now
          combat.emitSound('footstep', sprinting ? 0.86 : 0.58)
        }
      } else if (animation !== 'IDLE') {
        setAnimation('IDLE')
      }
    }

    if (damagePush.current.lengthSq() > 0.002) {
      const desired = position.current.clone().addScaledVector(damagePush.current, delta)
      position.current.copy(resolveWorldMovement(position.current, desired, 0.46, extraColliders))
      damagePush.current.multiplyScalar(Math.exp(-7 * delta))
    }

    if (
      now - lastStaminaUse.current >= GAME_CONFIG.player.staminaRegenDelay &&
      state.stamina < GAME_CONFIG.player.maxStamina
    ) {
      state.setStamina(state.stamina + GAME_CONFIG.player.staminaRegen * delta)
    }

    group.position.copy(position.current)
    group.rotation.y = facingYaw.current
  })

  return (
    <group ref={playerRef} position={spawn}>
      <PlayerModel animation={animation} surge={useGameStore((state) => state.surgeTime > 0)} damageFlash={damageFlash} />
      <pointLight position={[0.55, 1.1, 0]} color="#7dff48" intensity={0.52} distance={3.8} decay={2} />
    </group>
  )
}

export default Player
