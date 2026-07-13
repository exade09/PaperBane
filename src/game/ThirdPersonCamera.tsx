import { type MutableRefObject, useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useGameStore } from './GameState'
import { useCombatSystem } from './CombatSystem'
import { cameraObstacleBoxes, type WorldBox } from './WorldCollision'
import { useReducedMotion } from './useReducedMotion'

interface ThirdPersonCameraProps {
  target: MutableRefObject<THREE.Group | null>
  yaw: MutableRefObject<number>
  pitch: MutableRefObject<number>
  combatZoom: MutableRefObject<number>
  extraColliders: WorldBox[]
}

const CAMERA_YAW_SENSITIVITY = 0.00245
const CAMERA_PITCH_SENSITIVITY = 0.00195
const CAMERA_MIN_PITCH = -0.2
const CAMERA_MAX_PITCH = 0.62

export const applyCameraPointerDelta = (
  currentYaw: number,
  currentPitch: number,
  movementX: number,
  movementY: number,
  invertHorizontal = false
) => ({
  yaw: currentYaw + movementX * CAMERA_YAW_SENSITIVITY * (invertHorizontal ? -1 : 1),
  pitch: THREE.MathUtils.clamp(
    currentPitch + movementY * CAMERA_PITCH_SENSITIVITY,
    CAMERA_MIN_PITCH,
    CAMERA_MAX_PITCH
  )
})

export function ThirdPersonCamera({ target, yaw, pitch, combatZoom, extraColliders }: ThirdPersonCameraProps) {
  const { camera, gl } = useThree()
  const combat = useCombatSystem()
  const reducedMotion = useReducedMotion()
  const hadPointerLock = useRef(false)
  const smoothedLook = useRef(new THREE.Vector3(0, 1.4, 20))
  const ray = useMemo(() => new THREE.Ray(), [])
  const collisionPoint = useMemo(() => new THREE.Vector3(), [])
  const boxes = useMemo(() => cameraObstacleBoxes(extraColliders), [extraColliders])

  useEffect(() => {
    const canvas = gl.domElement
    const onMouseMove = (event: MouseEvent) => {
      if (document.pointerLockElement !== canvas || useGameStore.getState().status !== 'PLAYING') return
      const nextLook = applyCameraPointerDelta(
        yaw.current,
        pitch.current,
        event.movementX,
        event.movementY
      )
      yaw.current = nextLook.yaw
      pitch.current = nextLook.pitch
    }
    const requestLock = () => {
      if (useGameStore.getState().status === 'PLAYING' && document.pointerLockElement !== canvas) {
        const request = canvas.requestPointerLock()
        if (request && typeof request.catch === 'function') void request.catch(() => undefined)
      }
    }
    const lockChanged = () => {
      if (document.pointerLockElement === canvas) {
        hadPointerLock.current = true
      } else if (hadPointerLock.current) {
        hadPointerLock.current = false
        const state = useGameStore.getState()
        if (state.status === 'PLAYING' || state.status === 'BOSS_INTRO') state.pause()
      }
    }
    canvas.addEventListener('click', requestLock)
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('pointerlockchange', lockChanged)
    const unsubscribe = useGameStore.subscribe((state, previous) => {
      if (
        state.status === 'PLAYING' &&
        previous.status !== 'PLAYING' &&
        previous.status !== 'BOSS_INTRO'
      ) {
        requestLock()
      }
      if (
        previous.status === 'PLAYING' &&
        state.status !== 'PLAYING' &&
        state.status !== 'BOSS_INTRO' &&
        document.pointerLockElement === canvas
      ) document.exitPointerLock()
    })
    return () => {
      canvas.removeEventListener('click', requestLock)
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('pointerlockchange', lockChanged)
      unsubscribe()
    }
  }, [gl, pitch, yaw])

  useFrame((_, delta) => {
    const player = target.current
    if (!player) return
    const status = useGameStore.getState().status
    if (status === 'PAUSED') return
    const follow = player.position.clone().add(new THREE.Vector3(0, 1.35, 0))

    if (status === 'BOSS_INTRO') {
      const introPosition = new THREE.Vector3(6.5, 4.5, -98)
      camera.position.lerp(introPosition, 1 - Math.exp(-2.2 * delta))
      smoothedLook.current.lerp(new THREE.Vector3(0, 2.2, -105), 1 - Math.exp(-3.1 * delta))
      camera.lookAt(smoothedLook.current)
      return
    }

    const distance = 5.25 - combatZoom.current * 0.65
    const cosPitch = Math.cos(pitch.current)
    const offset = new THREE.Vector3(
      -Math.sin(yaw.current) * cosPitch * distance,
      1.25 + Math.sin(pitch.current) * distance,
      Math.cos(yaw.current) * cosPitch * distance
    )
    const desired = follow.clone().add(offset)
    const direction = desired.clone().sub(follow)
    const fullDistance = direction.length()
    direction.normalize()
    ray.set(follow, direction)
    let allowedDistance = fullDistance
    for (const box of boxes) {
      const hit = ray.intersectBox(box, collisionPoint)
      if (!hit) continue
      const hitDistance = follow.distanceTo(hit)
      if (hitDistance < allowedDistance) allowedDistance = Math.max(1.1, hitDistance - 0.28)
    }
    desired.copy(follow).addScaledVector(direction, allowedDistance)

    const shake = combat.cameraShake.current
    if (shake > 0 && !reducedMotion) {
      const amount = shake * shake * 0.16
      desired.x += Math.sin(performance.now() * 0.087) * amount
      desired.y += Math.cos(performance.now() * 0.111) * amount
      desired.z += Math.sin(performance.now() * 0.071) * amount
    }
    camera.position.lerp(desired, 1 - Math.exp(-11 * delta))
    const lookAhead = new THREE.Vector3(Math.sin(yaw.current), 0, -Math.cos(yaw.current)).multiplyScalar(1.1)
    const desiredLook = follow.clone().add(lookAhead).add(new THREE.Vector3(0, 0.14, 0))
    smoothedLook.current.lerp(desiredLook, 1 - Math.exp(-15 * delta))
    camera.lookAt(smoothedLook.current)

    if (camera instanceof THREE.PerspectiveCamera) {
      const targetFov = 54 - combatZoom.current * 3
      camera.fov = THREE.MathUtils.lerp(camera.fov, targetFov, 1 - Math.exp(-8 * delta))
      camera.updateProjectionMatrix()
    }
  })

  return null
}

export default ThirdPersonCamera
