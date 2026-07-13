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

const KING_GEOMETRY = {
  high: new THREE.IcosahedronGeometry(1, 3),
  medium: new THREE.DodecahedronGeometry(1, 2),
  low: new THREE.DodecahedronGeometry(1, 1),
  limb: new THREE.CylinderGeometry(0.82, 1, 2, 7, 2),
  pipe: new THREE.CylinderGeometry(1, 1, 1, 7),
  crown: new THREE.ConeGeometry(1, 1, 4, 1),
  plane: new THREE.PlaneGeometry(1, 1)
}

const material = (color: string, roughness: number, metalness = 0) => new THREE.MeshStandardMaterial({
  color,
  roughness,
  metalness,
  flatShading: true
})

const KING_MATERIALS = {
  coat: material('#20231f', 0.94, 0.03),
  coatPanel: material('#30332e', 0.9, 0.04),
  shirt: material('#77756b', 1),
  trousers: material('#292925', 0.97, 0.02),
  boots: material('#171713', 0.86, 0.18),
  sole: material('#0d0e0c', 0.94, 0.12),
  skin: material('#756f63', 1),
  damagedSkin: material('#51463f', 1),
  hair: material('#161815', 0.96),
  paper: material('#aaa493', 0.98),
  rust: material('#62443a', 0.9, 0.1),
  metal: material('#454941', 0.68, 0.55),
  green: new THREE.MeshStandardMaterial({ color: '#62b53d', emissive: '#285f20', emissiveIntensity: 0.45, roughness: 0.68, metalness: 0.12, flatShading: true }),
  purple: new THREE.MeshStandardMaterial({ color: '#76509a', emissive: '#36214e', emissiveIntensity: 0.36, roughness: 0.74, flatShading: true }),
  blood: new THREE.MeshStandardMaterial({ color: '#5e2526', roughness: 0.88, flatShading: true })
}

function KingInsignia({ rear = false }: { rear?: boolean }) {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 512
    canvas.height = 640
    const context = canvas.getContext('2d')
    if (context) {
      context.fillStyle = '#252823'
      context.fillRect(0, 0, canvas.width, canvas.height)
      for (let index = 0; index < 52; index += 1) {
        const x = (index * 97) % canvas.width
        const y = (index * 163) % canvas.height
        context.fillStyle = index % 5 === 0 ? 'rgba(103,76,55,.4)' : 'rgba(8,10,8,.28)'
        context.fillRect(x, y, 12 + index % 4 * 9, 4 + index % 3 * 5)
      }
      context.textAlign = 'center'
      context.textBaseline = 'middle'
      context.font = '900 82px Impact, Arial Narrow, sans-serif'
      context.fillStyle = '#b9b2a0'
      context.fillText(rear ? 'PAPER' : 'PAPER', 256, 145)
      context.fillText(rear ? 'CROWN' : 'KING', 256, 232)
      context.strokeStyle = rear ? '#8a5bb1' : '#70c947'
      context.lineWidth = 20
      context.beginPath()
      context.moveTo(256, 304)
      context.lineTo(256, 514)
      context.moveTo(196, 350)
      context.lineTo(316, 350)
      context.moveTo(216, 468)
      context.lineTo(296, 468)
      context.stroke()
      context.fillStyle = rear ? '#715091' : '#568e3d'
      context.fillRect(216, 350, 80, 118)
      context.strokeStyle = '#171a16'
      context.lineWidth = 8
      context.strokeRect(216, 350, 80, 118)
    }
    const result = new THREE.CanvasTexture(canvas)
    result.colorSpace = THREE.SRGBColorSpace
    result.minFilter = THREE.LinearMipmapLinearFilter
    result.anisotropy = 4
    return result
  }, [rear])
  useEffect(() => () => texture.dispose(), [texture])
  return (
    <mesh geometry={KING_GEOMETRY.plane}>
      <meshStandardMaterial map={texture} roughness={0.93} metalness={0.02} />
    </mesh>
  )
}

function PaperFinger({ x, z, length, bend = 0 }: { x: number; z: number; length: number; bend?: number }) {
  return (
    <group position={[x, 0, z]} rotation={[bend * 0.3, 0, bend]}>
      <mesh geometry={KING_GEOMETRY.low} material={KING_MATERIALS.paper} position={[0, -length * 0.28, 0]} scale={[0.075, length * 0.3, 0.075]} castShadow />
      <mesh geometry={KING_GEOMETRY.low} material={KING_MATERIALS.paper} position={[bend * 0.06, -length * 0.72, 0.025]} rotation={[bend * 0.55, 0, bend * 0.18]} scale={[0.064, length * 0.25, 0.064]} castShadow />
      <mesh geometry={KING_GEOMETRY.plane} material={KING_MATERIALS.damagedSkin} position={[bend * 0.08, -length * 0.98, 0.08]} rotation={[0, 0, bend * 0.2]} scale={[0.065, 0.12, 1]} />
    </group>
  )
}

function GiantPaperHand({ mirror = false }: { mirror?: boolean }) {
  const direction = mirror ? -1 : 1
  return (
    <group>
      <mesh geometry={KING_GEOMETRY.medium} material={KING_MATERIALS.paper} scale={[0.34, 0.34, 0.18]} castShadow />
      <mesh geometry={KING_GEOMETRY.low} material={KING_MATERIALS.damagedSkin} position={[direction * 0.24, -0.02, 0]} rotation={[0.1, 0, direction * 0.72]} scale={[0.12, 0.26, 0.11]} castShadow />
      <PaperFinger x={-0.23} z={0.015} length={0.75} bend={-0.08} />
      <PaperFinger x={-0.075} z={0.06} length={0.92} bend={-0.025} />
      <PaperFinger x={0.085} z={0.055} length={0.88} bend={0.03} />
      <PaperFinger x={0.235} z={0} length={0.72} bend={0.1} />
    </group>
  )
}

function BossModel({ state, stateTime, enraged, flash }: BossModelProps) {
  const reducedMotion = useReducedMotion()
  const root = useRef<THREE.Group>(null)
  const torso = useRef<THREE.Group>(null)
  const leftArm = useRef<THREE.Group>(null)
  const rightArm = useRef<THREE.Group>(null)
  const leftForearm = useRef<THREE.Group>(null)
  const rightForearm = useRef<THREE.Group>(null)
  const leftHand = useRef<THREE.Group>(null)
  const rightHand = useRef<THREE.Group>(null)
  const leftLeg = useRef<THREE.Group>(null)
  const rightLeg = useRef<THREE.Group>(null)
  const head = useRef<THREE.Group>(null)
  const coatTails = useRef<THREE.Group>(null)
  const chest = useRef<THREE.MeshStandardMaterial>(null)
  const shirt = useRef<THREE.MeshStandardMaterial>(null)

  useFrame(({ clock }, delta) => {
    const gameStatus = useGameStore.getState().status
    if (gameStatus !== 'PLAYING' && gameStatus !== 'BOSS_INTRO' && state !== 'DEAD') return
    const time = clock.elapsedTime
    const attackTime = stateTime.current
    let leftArmX = 0.16
    let rightArmX = -0.12
    let armZ = 0.3
    let elbowX = -0.22
    let wristZ = 0
    let leg = 0
    let torsoX = 0.1
    let torsoY = 0
    let rootY = Math.sin(time * 1.3) * 0.025
    let rootX = 0
    let rootZ = 0
    let headX = 0.04
    let headY = Math.sin(time * 0.72) * 0.045
    let tailX = -0.04

    if (state === 'CHASE') {
      leg = Math.sin(time * (enraged ? 6.8 : 5.4)) * 0.5
      leftArmX = -leg * 0.58 + 0.1
      rightArmX = leg * 0.58 - 0.1
      elbowX = -0.34 + Math.abs(leg) * 0.18
      torsoX = 0.22
      torsoY = leg * 0.07
      headY = -leg * 0.05
      tailX = -0.12 - Math.abs(leg) * 0.08
      rootY = Math.abs(Math.sin(time * 5.4)) * 0.04
    } else if (state === 'SLAM') {
      if (attackTime < 0.22) {
        const brace = attackTime / 0.22
        leftArmX = 0.16 + brace * 0.42
        rightArmX = -0.12 + brace * 0.7
        torsoX = 0.1 + brace * 0.23
        rootY = -brace * 0.1
        headX = -brace * 0.1
      } else if (attackTime < 0.8) {
        const windup = (attackTime - 0.22) / 0.58
        leftArmX = 0.58 - windup * 3.3
        rightArmX = 0.58 - windup * 3.3
        elbowX = -0.25 - windup * 0.48
        armZ = 0.3 - windup * 0.16
        torsoX = 0.33 - windup * 0.5
        rootY = -0.1 + windup * 0.1
        headX = -0.1 + windup * 0.2
        tailX = -0.12 + windup * 0.22
      } else if (attackTime < 0.98) {
        const slam = (attackTime - 0.8) / 0.18
        leftArmX = -2.72 + slam * 4.0
        rightArmX = -2.72 + slam * 4.0
        elbowX = -0.73 + slam * 0.96
        torsoX = -0.17 + slam * 1.03
        rootY = -slam * 0.16
        headX = 0.1 + slam * 0.32
        tailX = 0.1 - slam * 0.42
      } else {
        const recover = Math.min(1, (attackTime - 0.98) / 0.5)
        leftArmX = 1.28 - recover * 1.12
        rightArmX = 1.28 - recover * 1.4
        elbowX = 0.23 - recover * 0.45
        torsoX = 0.86 - recover * 0.76
        rootY = -0.16 + recover * 0.16
        headX = 0.42 - recover * 0.38
        tailX = -0.32 + recover * 0.28
      }
    } else if (state === 'CHARGE') {
      const prep = Math.min(1, attackTime / 0.65)
      torsoX = 0.1 + prep * 0.62
      leftArmX = 0.16 - prep * 1.28
      rightArmX = -0.12 - prep * 0.98
      armZ = 0.3 + prep * 0.2
      elbowX = -0.22 - prep * 0.58
      rootY = -prep * 0.12
      headX = -prep * 0.24
      tailX = -0.04 - prep * 0.5
      if (attackTime > 0.65 && attackTime < 1.35) {
        leg = Math.sin(time * 14) * 0.78
        torsoY = leg * 0.08
        headY = -leg * 0.07
        wristZ = Math.sin(time * 14) * 0.12
      } else if (attackTime >= 1.35) {
        const skid = Math.min(1, (attackTime - 1.35) / 0.7)
        torsoX = 0.72 - skid * 0.62
        leftArmX = -1.12 + skid * 1.28
        rightArmX = -1.1 + skid * 0.98
        rootY = -0.12 + skid * 0.12
      }
    } else if (state === 'WAVE') {
      const rise = Math.min(1, attackTime / 0.88)
      const release = THREE.MathUtils.clamp((attackTime - 0.88) / 0.84, 0, 1)
      leftArmX = -2.35 * rise + release * 1.55
      rightArmX = -2.35 * rise + release * 1.55
      elbowX = -0.22 - rise * 0.46 + release * 0.62
      armZ = 0.35 + rise * 0.42 - release * 0.25
      wristZ = Math.sin(time * 5.2) * 0.13 * (1 - release)
      torsoX = -0.12 + release * 0.58
      torsoY = Math.sin(time * 5) * 0.08 * (1 - release)
      headX = 0.08 - rise * 0.18 + release * 0.32
      rootY = -release * 0.1
      tailX = 0.12 - release * 0.38
    } else if (state === 'STAGGER') {
      const recoil = Math.sin(Math.min(1, attackTime / 0.36) * Math.PI)
      torsoX = -recoil * 0.48
      torsoY = recoil * 0.16
      rootZ = 0.16
      leftArmX = 0.7 + recoil * 0.45
      rightArmX = 0.6 + recoil * 0.3
      elbowX = 0.1
      headX = -recoil * 0.34
      headY = recoil * 0.2
      tailX = recoil * 0.25
    } else if (state === 'DEAD') {
      const fall = Math.min(1, attackTime / 1.65)
      rootX = fall * Math.PI * 0.48
      rootZ = -0.18 * Math.sin(fall * Math.PI)
      rootY = -Math.min(1.36, attackTime * 0.6)
      leftArmX = 1.25 + fall * 0.4
      rightArmX = 0.8 + fall * 0.25
      elbowX = 0.32
      wristZ = 0.24
      leg = -0.18
      headX = -0.2 + fall * 0.55
      headY = 0.22
      tailX = -0.5
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
    if (leftForearm.current) leftForearm.current.rotation.x = damp(leftForearm.current.rotation.x, elbowX, delta, 13)
    if (rightForearm.current) rightForearm.current.rotation.x = damp(rightForearm.current.rotation.x, elbowX, delta, 13)
    if (leftHand.current) leftHand.current.rotation.z = damp(leftHand.current.rotation.z, wristZ, delta, 12)
    if (rightHand.current) rightHand.current.rotation.z = damp(rightHand.current.rotation.z, -wristZ, delta, 12)
    if (leftLeg.current) leftLeg.current.rotation.x = damp(leftLeg.current.rotation.x, leg, delta)
    if (rightLeg.current) rightLeg.current.rotation.x = damp(rightLeg.current.rotation.x, -leg, delta)
    if (head.current) {
      head.current.rotation.x = damp(head.current.rotation.x, headX, delta, 9)
      head.current.rotation.y = damp(head.current.rotation.y, headY, delta, 8)
    }
    if (coatTails.current) coatTails.current.rotation.x = damp(coatTails.current.rotation.x, tailX, delta, 8)
    if (chest.current) {
      const fade = state === 'DEAD' ? Math.max(0, 1 - attackTime / 2.15) : 1
      chest.current.emissiveIntensity = ((enraged ? 4.4 : 2.8) + (reducedMotion ? 0 : Math.sin(time * 7) * 0.5)) * fade
    }
    if (shirt.current) shirt.current.emissiveIntensity = flash ? 0.95 : 0
  })

  return (
    <group ref={root} scale={[1.16, 1.16, 1.16]} dispose={null}>
      <group ref={torso} position={[0, 1.88, 0]}>
        <mesh geometry={KING_GEOMETRY.medium} material={KING_MATERIALS.coat} scale={[0.83, 0.77, 0.49]} castShadow receiveShadow />
        <mesh geometry={KING_GEOMETRY.medium} position={[0, -0.72, -0.02]} scale={[0.68, 0.38, 0.45]} castShadow>
          <meshStandardMaterial ref={shirt} color="#30332e" emissive="#7dff48" emissiveIntensity={0} roughness={0.92} flatShading />
        </mesh>
        <mesh geometry={KING_GEOMETRY.medium} material={KING_MATERIALS.shirt} position={[0, 0.01, 0.36]} scale={[0.49, 0.61, 0.12]} castShadow />

        <mesh geometry={KING_GEOMETRY.crown} material={KING_MATERIALS.coatPanel} position={[-0.42, 0.13, 0.5]} rotation={[0.06, 0, -0.3]} scale={[0.28, 0.82, 0.16]} castShadow />
        <mesh geometry={KING_GEOMETRY.crown} material={KING_MATERIALS.coatPanel} position={[0.42, 0.13, 0.5]} rotation={[0.06, 0, 0.3]} scale={[0.28, 0.82, 0.16]} castShadow />
        <mesh geometry={KING_GEOMETRY.pipe} material={KING_MATERIALS.green} position={[-0.67, 0.02, 0.43]} rotation={[0, 0, -0.04]} scale={[0.045, 0.78, 0.045]} />
        <mesh geometry={KING_GEOMETRY.pipe} material={KING_MATERIALS.purple} position={[0.67, 0.02, 0.43]} rotation={[0, 0, 0.04]} scale={[0.045, 0.78, 0.045]} />
        <mesh position={[0, 0.02, 0.505]} scale={[0.6, 0.67, 1]}>
          <KingInsignia />
        </mesh>
        <mesh position={[0, 0.01, -0.505]} rotation={[0, Math.PI, 0]} scale={[0.68, 0.74, 1]}>
          <KingInsignia rear />
        </mesh>

        <mesh position={[0, -0.07, 0.55]}>
          <boxGeometry args={[0.18, 0.5, 0.06]} />
          <meshStandardMaterial ref={chest} color="#b83b3b" emissive="#c63f3f" emissiveIntensity={3} roughness={0.48} toneMapped={false} />
        </mesh>
        <mesh geometry={KING_GEOMETRY.pipe} material={KING_MATERIALS.green} position={[0, 0.31, 0.58]} scale={[0.025, 0.24, 0.025]} />
        <mesh geometry={KING_GEOMETRY.pipe} material={KING_MATERIALS.green} position={[0, -0.45, 0.58]} scale={[0.025, 0.24, 0.025]} />

        <group ref={coatTails} position={[0, -0.61, -0.08]}>
          {[-0.48, -0.16, 0.16, 0.48].map((x, index) => (
            <mesh key={x} geometry={KING_GEOMETRY.crown} material={index % 2 ? KING_MATERIALS.coat : KING_MATERIALS.coatPanel} position={[x, -0.52 - (index % 2) * 0.08, index % 2 ? 0.04 : -0.02]} rotation={[0, 0, (index - 1.5) * 0.08]} scale={[0.31, 1.06 + (index % 2) * 0.12, 0.24]} castShadow />
          ))}
          <mesh geometry={KING_GEOMETRY.pipe} material={KING_MATERIALS.green} position={[0, -1.02, 0.04]} rotation={[0, 0, Math.PI / 2]} scale={[0.035, 0.62, 0.035]} />
        </group>

        <group ref={leftArm} position={[-0.82, 0.45, 0]} rotation={[0, 0, 0.3]}>
          <mesh geometry={KING_GEOMETRY.low} material={KING_MATERIALS.coatPanel} scale={[0.34, 0.3, 0.32]} castShadow />
          <mesh geometry={KING_GEOMETRY.limb} material={KING_MATERIALS.coat} position={[0, -0.48, 0]} scale={[0.25, 0.48, 0.25]} castShadow />
          <mesh geometry={KING_GEOMETRY.pipe} material={KING_MATERIALS.green} position={[0, -0.86, 0]} scale={[0.27, 0.045, 0.27]} />
          <group ref={leftForearm} position={[0, -0.86, 0.02]} rotation={[-0.22, 0, 0]}>
            <mesh geometry={KING_GEOMETRY.limb} material={KING_MATERIALS.damagedSkin} position={[0, -0.4, 0]} scale={[0.21, 0.41, 0.21]} castShadow />
            <mesh geometry={KING_GEOMETRY.low} material={KING_MATERIALS.rust} position={[0.12, -0.29, 0.16]} scale={[0.08, 0.22, 0.035]} />
            <group ref={leftHand} position={[0, -0.84, 0.04]}>
              <GiantPaperHand />
            </group>
          </group>
        </group>

        <group ref={rightArm} position={[0.82, 0.45, 0]} rotation={[0, 0, -0.3]}>
          <mesh geometry={KING_GEOMETRY.low} material={KING_MATERIALS.coatPanel} scale={[0.34, 0.3, 0.32]} castShadow />
          <mesh geometry={KING_GEOMETRY.limb} material={KING_MATERIALS.coat} position={[0, -0.48, 0]} scale={[0.25, 0.48, 0.25]} castShadow />
          <mesh geometry={KING_GEOMETRY.pipe} material={KING_MATERIALS.purple} position={[0, -0.86, 0]} scale={[0.27, 0.045, 0.27]} />
          <group ref={rightForearm} position={[0, -0.86, 0.02]} rotation={[-0.22, 0, 0]}>
            <mesh geometry={KING_GEOMETRY.limb} material={KING_MATERIALS.damagedSkin} position={[0, -0.4, 0]} scale={[0.21, 0.41, 0.21]} castShadow />
            <mesh geometry={KING_GEOMETRY.low} material={KING_MATERIALS.rust} position={[-0.12, -0.29, 0.16]} scale={[0.08, 0.22, 0.035]} />
            <group ref={rightHand} position={[0, -0.84, 0.04]}>
              <GiantPaperHand mirror />
            </group>
          </group>
        </group>
      </group>

      <group ref={head} position={[0, 3.13, 0.04]} rotation={[0.04, 0, 0]}>
        <mesh geometry={KING_GEOMETRY.pipe} material={KING_MATERIALS.damagedSkin} position={[0, -0.42, 0]} scale={[0.22, 0.35, 0.22]} castShadow />
        <mesh geometry={KING_GEOMETRY.high} material={KING_MATERIALS.skin} scale={[0.42, 0.52, 0.4]} castShadow />
        <mesh geometry={KING_GEOMETRY.medium} material={KING_MATERIALS.damagedSkin} position={[0, -0.25, 0.16]} scale={[0.31, 0.24, 0.28]} castShadow />
        <mesh geometry={KING_GEOMETRY.medium} material={KING_MATERIALS.skin} position={[-0.25, -0.03, 0.23]} rotation={[0, 0, -0.1]} scale={[0.18, 0.15, 0.17]} castShadow />
        <mesh geometry={KING_GEOMETRY.medium} material={KING_MATERIALS.skin} position={[0.25, -0.03, 0.23]} rotation={[0, 0, 0.1]} scale={[0.18, 0.15, 0.17]} castShadow />
        <mesh geometry={KING_GEOMETRY.crown} material={KING_MATERIALS.damagedSkin} position={[0, -0.05, 0.48]} rotation={[Math.PI / 2, 0, 0]} scale={[0.1, 0.24, 0.12]} castShadow />
        <mesh geometry={KING_GEOMETRY.low} material={KING_MATERIALS.damagedSkin} position={[-0.4, 0, 0]} scale={[0.1, 0.17, 0.08]} />
        <mesh geometry={KING_GEOMETRY.low} material={KING_MATERIALS.damagedSkin} position={[0.4, 0, 0]} scale={[0.1, 0.17, 0.08]} />
        <mesh geometry={KING_GEOMETRY.plane} material={KING_MATERIALS.blood} position={[0, -0.28, 0.395]} scale={[0.24, 0.075, 1]} />
        {[-0.17, 0.17].map((x) => (
          <group key={x} position={[x, 0.02, 0.39]}>
            <mesh geometry={KING_GEOMETRY.low} material={KING_MATERIALS.damagedSkin} scale={[0.12, 0.08, 0.06]} />
            <mesh geometry={KING_GEOMETRY.plane} position={[0, 0, 0.068]} scale={[0.11, 0.045, 1]}>
              <meshBasicMaterial color="#ff4b4b" toneMapped={false} />
            </mesh>
          </group>
        ))}
        <mesh geometry={KING_GEOMETRY.plane} material={KING_MATERIALS.blood} position={[-0.22, -0.12, 0.405]} rotation={[0, 0, -0.5]} scale={[0.035, 0.3, 1]} />

        {Array.from({ length: 12 }, (_, index) => {
          const angle = index / 12 * Math.PI * 2
          return (
            <mesh
              key={`hair-${index}`}
              geometry={KING_GEOMETRY.medium}
              material={KING_MATERIALS.hair}
              position={[Math.sin(angle) * 0.33, 0.31 + (index % 3) * 0.07, Math.cos(angle) * 0.27 - 0.06]}
              rotation={[angle * 0.08, angle, (index % 3 - 1) * 0.19]}
              scale={[0.18 + (index % 2) * 0.04, 0.24 + (index % 3) * 0.025, 0.15]}
              castShadow
            />
          )
        })}
        <group position={[0, 0.63, -0.02]}>
          <mesh geometry={KING_GEOMETRY.pipe} material={KING_MATERIALS.rust} position={[0, -0.05, 0]} scale={[0.45, 0.12, 0.45]} />
          {[-0.34, -0.17, 0, 0.17, 0.34].map((x, index) => (
            <mesh key={x} geometry={KING_GEOMETRY.crown} material={index === 1 ? KING_MATERIALS.green : index === 3 ? KING_MATERIALS.purple : KING_MATERIALS.paper} position={[x, 0.26 + (index % 2) * 0.08, 0]} rotation={[0, 0, (index - 2) * -0.09]} scale={[0.13, 0.56 + (index % 2) * 0.14, 0.13]} castShadow />
          ))}
        </group>
      </group>

      {[-1, 1].map((side) => {
        const legRef = side < 0 ? leftLeg : rightLeg
        return (
          <group key={side} ref={legRef} position={[side * 0.34, 1.55, 0]}>
            <mesh geometry={KING_GEOMETRY.medium} material={KING_MATERIALS.trousers} position={[0, -0.38, 0]} scale={[0.31, 0.46, 0.32]} castShadow />
            <mesh geometry={KING_GEOMETRY.low} material={KING_MATERIALS.coatPanel} position={[0, -0.8, 0.03]} scale={[0.29, 0.22, 0.3]} castShadow />
            <mesh geometry={KING_GEOMETRY.medium} material={KING_MATERIALS.trousers} position={[0, -1.12, 0]} rotation={[side * 0.03, 0, side * 0.035]} scale={[0.27, 0.42, 0.28]} castShadow />
            <mesh geometry={KING_GEOMETRY.low} material={side < 0 ? KING_MATERIALS.green : KING_MATERIALS.purple} position={[side * 0.12, -1.1, 0.25]} rotation={[0, 0, side * -0.2]} scale={[0.08, 0.22, 0.035]} />
            <group position={[0, -1.53, 0.13]} rotation={[0.02, side * 0.03, 0]}>
              <mesh geometry={KING_GEOMETRY.medium} material={KING_MATERIALS.boots} scale={[0.35, 0.22, 0.47]} castShadow />
              <mesh geometry={KING_GEOMETRY.low} material={KING_MATERIALS.boots} position={[0, -0.03, 0.34]} scale={[0.34, 0.18, 0.38]} castShadow />
              <mesh geometry={KING_GEOMETRY.low} material={KING_MATERIALS.sole} position={[0, -0.19, 0.12]} scale={[0.39, 0.07, 0.55]} />
              {[-0.2, 0, 0.2].map((x) => (
                <mesh key={x} geometry={KING_GEOMETRY.pipe} material={KING_MATERIALS.metal} position={[x, 0.08, 0.46]} rotation={[Math.PI / 2, 0, 0]} scale={[0.025, 0.21, 0.025]} />
              ))}
            </group>
          </group>
        )
      })}
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
    <group ref={group} name="paperbane-paper-king" position={[0, 0, GAME_CONFIG.world.bossCenterZ]}>
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
