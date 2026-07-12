import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { Weapon } from './Weapon'
import { useGameStore } from './GameState'

export type PlayerAnimation =
  | 'IDLE'
  | 'WALK'
  | 'RUN'
  | 'ATTACK_1'
  | 'ATTACK_2'
  | 'ATTACK_3'
  | 'HEAVY'
  | 'DODGE'
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

export function PlayerModel({ animation, surge, damageFlash }: PlayerModelProps) {
  const root = useRef<THREE.Group>(null)
  const torso = useRef<THREE.Group>(null)
  const head = useRef<THREE.Group>(null)
  const leftArm = useRef<THREE.Group>(null)
  const rightArm = useRef<THREE.Group>(null)
  const leftLeg = useRef<THREE.Group>(null)
  const rightLeg = useRef<THREE.Group>(null)
  const jacketMaterial = useRef<THREE.MeshStandardMaterial>(null)
  const skinMaterial = useRef<THREE.MeshStandardMaterial>(null)
  const actionTime = useRef(0)

  useEffect(() => {
    actionTime.current = 0
  }, [animation])

  useFrame(({ clock }, delta) => {
    const status = useGameStore.getState().status
    if (status === 'PAUSED' || status === 'BOSS_INTRO') return
    actionTime.current += delta
    const time = actionTime.current
    const worldTime = clock.elapsedTime
    let leftArmX = 0.06
    let rightArmX = -0.14
    let leftArmZ = 0.04
    let rightArmZ = -0.08
    let leftLegX = 0
    let rightLegX = 0
    let torsoX = 0
    let torsoY = 0
    let torsoZ = 0
    let rootY = Math.sin(worldTime * 1.7) * 0.014
    let rootX = 0
    let rootZ = 0

    if (animation === 'WALK' || animation === 'RUN') {
      const rate = animation === 'RUN' ? 10.5 : 7
      const stride = animation === 'RUN' ? 0.72 : 0.48
      const swing = Math.sin(worldTime * rate) * stride
      leftLegX = swing
      rightLegX = -swing
      leftArmX = -swing * 0.75
      rightArmX = swing * 0.68 - 0.2
      torsoY = Math.sin(worldTime * rate) * 0.035
      rootY = Math.abs(Math.sin(worldTime * rate)) * 0.06
      torsoX = animation === 'RUN' ? 0.13 : 0.045
    } else if (animation.startsWith('ATTACK')) {
      const p = Math.min(1, time / 0.5)
      const wind = p < 0.32 ? p / 0.32 : 1 - (p - 0.32) / 0.68
      const direction = animation === 'ATTACK_2' ? -1 : 1
      rightArmX = -1.35 + Math.sin(p * Math.PI) * 1.7
      rightArmZ = direction * (-1.05 + wind * 1.65)
      leftArmX = -0.45 + wind * 0.5
      torsoY = direction * (-0.48 + wind * 0.95)
      torsoX = 0.12
      if (animation === 'ATTACK_3') {
        rightArmX = -2.15 + Math.sin(p * Math.PI) * 2.55
        rightArmZ = 0.25
        torsoX = 0.3
      }
    } else if (animation === 'HEAVY') {
      const p = Math.min(1, time / 0.84)
      const strike = Math.sin(Math.min(1, p * 1.2) * Math.PI)
      rightArmX = -2.75 + strike * 2.95
      rightArmZ = -0.42 + strike * 0.74
      leftArmX = -1.2 + strike * 0.9
      leftArmZ = 0.45
      torsoX = -0.18 + strike * 0.62
      torsoY = -0.35 + strike * 0.62
    } else if (animation === 'DODGE') {
      rootX = 0.42
      torsoZ = Math.sin(Math.min(1, time / 0.3) * Math.PI) * 0.16
      leftArmX = 0.8
      rightArmX = 0.62
      leftLegX = -0.54
      rightLegX = 0.58
      rootY = -Math.sin(Math.min(1, time / 0.3) * Math.PI) * 0.15
    } else if (animation === 'HIT') {
      torsoX = -Math.sin(Math.min(1, time / 0.38) * Math.PI) * 0.34
      torsoZ = Math.sin(Math.min(1, time / 0.38) * Math.PI) * 0.14
      leftArmX = 0.82
      rightArmX = 0.64
    } else if (animation === 'DEATH') {
      rootX = Math.min(Math.PI * 0.47, time * 1.5)
      rootY = -Math.min(1.05, time * 0.72)
      leftArmX = 1.1
      rightArmX = 0.9
    } else if (animation === 'VICTORY') {
      rightArmX = -2.9
      rightArmZ = -0.08
      leftArmX = -0.6
      torsoX = -0.08
      rootY = Math.sin(worldTime * 2.3) * 0.02
    }

    if (root.current) {
      root.current.rotation.x = damp(root.current.rotation.x, rootX, delta, animation === 'DEATH' ? 4 : 13)
      root.current.rotation.z = damp(root.current.rotation.z, rootZ, delta)
      root.current.position.y = damp(root.current.position.y, rootY, delta)
    }
    if (torso.current) {
      torso.current.rotation.x = damp(torso.current.rotation.x, torsoX, delta)
      torso.current.rotation.y = damp(torso.current.rotation.y, torsoY, delta)
      torso.current.rotation.z = damp(torso.current.rotation.z, torsoZ, delta)
    }
    if (head.current) {
      head.current.rotation.y = Math.sin(worldTime * 0.55) * 0.045
      head.current.rotation.x = animation === 'RUN' ? -0.08 : 0.03
    }
    if (leftArm.current) {
      leftArm.current.rotation.x = damp(leftArm.current.rotation.x, leftArmX, delta)
      leftArm.current.rotation.z = damp(leftArm.current.rotation.z, leftArmZ, delta)
    }
    if (rightArm.current) {
      rightArm.current.rotation.x = damp(rightArm.current.rotation.x, rightArmX, delta, 18)
      rightArm.current.rotation.z = damp(rightArm.current.rotation.z, rightArmZ, delta, 18)
    }
    if (leftLeg.current) leftLeg.current.rotation.x = damp(leftLeg.current.rotation.x, leftLegX, delta)
    if (rightLeg.current) rightLeg.current.rotation.x = damp(rightLeg.current.rotation.x, rightLegX, delta)
    if (jacketMaterial.current) jacketMaterial.current.emissiveIntensity = damageFlash ? 1.7 : 0
    if (skinMaterial.current) skinMaterial.current.emissiveIntensity = damageFlash ? 1.1 : 0
  })

  const attacking = animation.startsWith('ATTACK') || animation === 'HEAVY'

  return (
    <group ref={root}>
      <group ref={torso} position={[0, 1.55, 0]}>
        <mesh castShadow scale={[0.88, 1, 0.58]}>
          <boxGeometry args={[0.92, 1.08, 0.52]} />
          <meshStandardMaterial
            ref={jacketMaterial}
            color="#242925"
            emissive="#c63f3f"
            emissiveIntensity={0}
            roughness={0.94}
          />
        </mesh>
        <mesh position={[0, -0.02, 0.285]} scale={[0.58, 0.82, 1]}>
          <boxGeometry args={[0.9, 0.9, 0.035]} />
          <meshStandardMaterial color="#646861" roughness={1} />
        </mesh>
        <mesh position={[-0.38, 0.03, -0.31]} scale={[1, 1, 1]}>
          <boxGeometry args={[0.045, 0.93, 0.045]} />
          <meshStandardMaterial color="#7dff48" emissive="#3f9e28" emissiveIntensity={0.75} toneMapped={false} />
        </mesh>
        <mesh position={[0.38, 0.03, -0.31]}>
          <boxGeometry args={[0.045, 0.93, 0.045]} />
          <meshStandardMaterial color="#7dff48" emissive="#3f9e28" emissiveIntensity={0.75} toneMapped={false} />
        </mesh>
        <mesh position={[0, 0.49, -0.33]}>
          <boxGeometry args={[0.78, 0.06, 0.05]} />
          <meshStandardMaterial color="#7dff48" emissive="#397c2b" emissiveIntensity={0.7} toneMapped={false} />
        </mesh>
        <mesh position={[0.3, 0.3, 0.31]} rotation={[0, 0, -0.18]}>
          <boxGeometry args={[0.14, 0.28, 0.035]} />
          <meshStandardMaterial color="#985cff" emissive="#54299e" emissiveIntensity={0.6} />
        </mesh>
        <group ref={leftArm} position={[-0.55, 0.38, 0]}>
          <mesh position={[0, -0.4, 0]} castShadow>
            <boxGeometry args={[0.3, 0.84, 0.34]} />
            <meshStandardMaterial color="#202421" roughness={0.95} />
          </mesh>
          <mesh position={[0, -0.86, 0.03]} castShadow>
            <boxGeometry args={[0.23, 0.27, 0.25]} />
            <meshStandardMaterial color="#82796c" roughness={1} />
          </mesh>
        </group>
        <group ref={rightArm} position={[0.55, 0.38, 0]}>
          <mesh position={[0, -0.4, 0]} castShadow>
            <boxGeometry args={[0.3, 0.84, 0.34]} />
            <meshStandardMaterial color="#202421" roughness={0.95} />
          </mesh>
          <mesh position={[0, -0.86, 0.03]} castShadow>
            <boxGeometry args={[0.23, 0.27, 0.25]} />
            <meshStandardMaterial color="#82796c" roughness={1} />
          </mesh>
          <group position={[0, -0.88, 0]} rotation={[0.08, 0, -0.08]}>
            <Weapon trail={attacking} heavy={animation === 'HEAVY'} surge={surge} />
          </group>
        </group>
      </group>
      <group ref={head} position={[0, 2.48, 0.02]}>
        <mesh castShadow>
          <dodecahedronGeometry args={[0.36, 0]} />
          <meshStandardMaterial ref={skinMaterial} color="#8c8171" emissive="#c63f3f" emissiveIntensity={0} roughness={1} />
        </mesh>
        <mesh position={[0, 0.2, -0.025]} rotation={[0.12, 0, 0]} castShadow>
          <dodecahedronGeometry args={[0.34, 0]} />
          <meshStandardMaterial color="#151815" roughness={0.95} />
        </mesh>
        <mesh position={[-0.12, 0.03, 0.32]}>
          <boxGeometry args={[0.06, 0.035, 0.025]} />
          <meshBasicMaterial color="#17110f" />
        </mesh>
        <mesh position={[0.12, 0.03, 0.32]}>
          <boxGeometry args={[0.06, 0.035, 0.025]} />
          <meshBasicMaterial color="#17110f" />
        </mesh>
      </group>
      <group ref={leftLeg} position={[-0.23, 1.02, 0]}>
        <mesh position={[0, -0.46, 0]} castShadow>
          <boxGeometry args={[0.35, 0.92, 0.4]} />
          <meshStandardMaterial color="#242624" roughness={1} />
        </mesh>
        <mesh position={[0, -0.96, 0.1]} castShadow>
          <boxGeometry args={[0.39, 0.25, 0.57]} />
          <meshStandardMaterial color="#111411" roughness={0.8} />
        </mesh>
      </group>
      <group ref={rightLeg} position={[0.23, 1.02, 0]}>
        <mesh position={[0, -0.46, 0]} castShadow>
          <boxGeometry args={[0.35, 0.92, 0.4]} />
          <meshStandardMaterial color="#222522" roughness={1} />
        </mesh>
        <mesh position={[0, -0.96, 0.1]} castShadow>
          <boxGeometry args={[0.39, 0.25, 0.57]} />
          <meshStandardMaterial color="#111411" roughness={0.8} />
        </mesh>
      </group>
    </group>
  )
}

export default PlayerModel
