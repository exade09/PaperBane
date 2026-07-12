import { type MutableRefObject, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { Boss } from './Boss'
import { CombatSystem, type CombatTarget, type HitPayload, useCombatSystem } from './CombatSystem'
import { Enemy } from './Enemy'
import { GAME_CONFIG, OBJECTIVES } from './GameConfig'
import { useGameStore } from './GameState'
import { Player } from './Player'
import { ThirdPersonCamera } from './ThirdPersonCamera'
import type { WorldBox } from './WorldCollision'
import { useReducedMotion } from './useReducedMotion'

function WorldLabel({
  text,
  position,
  rotation = [0, 0, 0],
  color = '#7dff48',
  width = 3.4,
  height = 0.85,
  fontSize = 58
}: {
  text: string
  position: [number, number, number]
  rotation?: [number, number, number]
  color?: string
  width?: number
  height?: number
  fontSize?: number
}) {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 768
    canvas.height = 192
    const context = canvas.getContext('2d')
    if (context) {
      context.clearRect(0, 0, canvas.width, canvas.height)
      context.fillStyle = 'rgba(9,11,10,0.88)'
      context.fillRect(7, 7, canvas.width - 14, canvas.height - 14)
      context.strokeStyle = color
      context.lineWidth = 7
      context.beginPath()
      context.moveTo(8, 30)
      context.lineTo(40, 8)
      context.lineTo(canvas.width - 8, 8)
      context.lineTo(canvas.width - 8, canvas.height - 36)
      context.lineTo(canvas.width - 45, canvas.height - 8)
      context.lineTo(8, canvas.height - 8)
      context.closePath()
      context.stroke()
      context.font = `900 ${fontSize}px monospace`
      context.textAlign = 'center'
      context.textBaseline = 'middle'
      context.fillStyle = color
      context.shadowBlur = 18
      context.shadowColor = color
      context.fillText(text, canvas.width / 2, canvas.height / 2 + 2, canvas.width - 70)
    }
    const result = new THREE.CanvasTexture(canvas)
    result.colorSpace = THREE.SRGBColorSpace
    result.minFilter = THREE.LinearFilter
    return result
  }, [color, fontSize, text])

  useEffect(() => () => texture.dispose(), [texture])

  return (
    <mesh position={position} rotation={rotation}>
      <planeGeometry args={[width, height]} />
      <meshBasicMaterial map={texture} transparent alphaTest={0.08} toneMapped={false} />
    </mesh>
  )
}

function FlickerLamp({
  position,
  color = '#7dff48',
  seed = 0,
  broken = false,
  reducedMotion = false
}: {
  position: [number, number, number]
  color?: string
  seed?: number
  broken?: boolean
  reducedMotion?: boolean
}) {
  const light = useRef<THREE.PointLight>(null)
  const bulb = useRef<THREE.MeshStandardMaterial>(null)
  useFrame(({ clock }) => {
    const time = clock.elapsedTime
    const noise = reducedMotion ? 0 : Math.sin(time * (8.2 + seed) + seed * 3.1) + Math.sin(time * 19.7 + seed)
    const cut = broken && noise < -1.05
    const intensity = cut ? 0.03 : 0.75 + noise * 0.12
    if (light.current) light.current.intensity = Math.max(0, intensity)
    if (bulb.current) bulb.current.emissiveIntensity = cut ? 0.08 : 2.4
  })
  return (
    <group position={position}>
      <mesh position={[0, 2.4, 0]} castShadow>
        <cylinderGeometry args={[0.075, 0.1, 4.8, 6]} />
        <meshStandardMaterial color="#242824" roughness={0.5} metalness={0.72} />
      </mesh>
      <mesh position={[0.42, 4.72, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.055, 0.07, 0.84, 6]} />
        <meshStandardMaterial color="#252a25" metalness={0.7} roughness={0.5} />
      </mesh>
      <mesh position={[0.84, 4.67, 0]} rotation={[0, 0, -0.12]}>
        <boxGeometry args={[0.36, 0.18, 0.25]} />
        <meshStandardMaterial ref={bulb} color={color} emissive={color} emissiveIntensity={2.4} toneMapped={false} />
      </mesh>
      <pointLight ref={light} position={[0.84, 4.55, 0]} color={color} intensity={0.8} distance={8} decay={2} />
    </group>
  )
}

function BrokenCar({ position, rotation = 0, color = '#313733' }: {
  position: [number, number, number]
  rotation?: number
  color?: string
}) {
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <mesh position={[0, 0.62, 0]} castShadow receiveShadow>
        <boxGeometry args={[2.6, 0.65, 4.3]} />
        <meshStandardMaterial color={color} roughness={0.82} metalness={0.2} />
      </mesh>
      <mesh position={[0, 1.18, -0.15]} castShadow>
        <boxGeometry args={[2.25, 0.67, 2.25]} />
        <meshStandardMaterial color="#292e2b" roughness={0.7} metalness={0.25} />
      </mesh>
      <mesh position={[0, 1.23, 1.01]} rotation={[0.2, 0, 0]}>
        <planeGeometry args={[1.9, 0.52]} />
        <meshStandardMaterial color="#101514" emissive="#18342e" emissiveIntensity={0.2} roughness={0.2} />
      </mesh>
      {[-1, 1].flatMap((x) => [-1.35, 1.35].map((z) => (
        <mesh key={`${x}-${z}`} position={[x * 1.12, 0.42, z]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.38, 0.38, 0.2, 8]} />
          <meshStandardMaterial color="#0c0e0d" roughness={0.95} />
        </mesh>
      )))}
      <mesh position={[-0.68, 0.63, 2.18]}>
        <boxGeometry args={[0.46, 0.18, 0.08]} />
        <meshStandardMaterial color="#7dff48" emissive="#285d20" emissiveIntensity={0.4} />
      </mesh>
    </group>
  )
}

function Fence({ position, length = 6, rotation = 0 }: {
  position: [number, number, number]
  length?: number
  rotation?: number
}) {
  const posts = Math.max(2, Math.floor(length / 1.5))
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      {Array.from({ length: posts + 1 }, (_, index) => (
        <mesh key={index} position={[-length / 2 + (index / posts) * length, 1.15, 0]} castShadow>
          <cylinderGeometry args={[0.045, 0.055, 2.3, 5]} />
          <meshStandardMaterial color="#4b4a42" metalness={0.68} roughness={0.72} />
        </mesh>
      ))}
      {Array.from({ length: 4 }, (_, index) => (
        <mesh key={index} position={[0, 0.45 + index * 0.48, 0]} rotation={[0, 0, index % 2 ? 0.018 : -0.018]}>
          <boxGeometry args={[length, 0.025, 0.025]} />
          <meshStandardMaterial color="#504f46" metalness={0.75} roughness={0.7} />
        </mesh>
      ))}
      {Array.from({ length: posts * 2 }, (_, index) => (
        <mesh key={`d-${index}`} position={[-length / 2 + (index / (posts * 2)) * length, 1.14, 0]} rotation={[0, 0, index % 2 ? 0.72 : -0.72]}>
          <boxGeometry args={[0.022, 2.25, 0.022]} />
          <meshStandardMaterial color="#44463f" metalness={0.7} roughness={0.8} />
        </mesh>
      ))}
    </group>
  )
}

function CandlestickScreen({ position, rotation = [0, 0, 0], red = false }: {
  position: [number, number, number]
  rotation?: [number, number, number]
  red?: boolean
}) {
  const bars = [0.45, 0.9, 0.55, 1.25, 0.72]
  return (
    <group position={position} rotation={rotation}>
      <mesh>
        <boxGeometry args={[3.2, 2, 0.16]} />
        <meshStandardMaterial color="#101411" emissive={red ? '#371313' : '#102d22'} emissiveIntensity={0.45} roughness={0.28} />
      </mesh>
      {bars.map((height, index) => {
        const color = red && index % 2 === 0 ? '#c63f3f' : '#7dff48'
        return (
          <group key={index} position={[-1.14 + index * 0.56, -0.12 + (index % 2) * 0.24, 0.11]}>
            <mesh>
              <boxGeometry args={[0.22, height, 0.06]} />
              <meshBasicMaterial color={color} toneMapped={false} />
            </mesh>
            <mesh>
              <boxGeometry args={[0.035, height + 0.48, 0.045]} />
              <meshBasicMaterial color={color} toneMapped={false} />
            </mesh>
          </group>
        )
      })}
    </group>
  )
}

function FogBanks({ quality, reducedMotion }: { quality: boolean; reducedMotion: boolean }) {
  const group = useRef<THREE.Group>(null)
  const count = quality ? 13 : 7
  const data = useMemo(() => Array.from({ length: count }, (_, index) => ({
    x: ((index * 7.3) % 23) - 11.5,
    z: 24 - ((index * 13.7) % 142),
    y: 0.45 + (index % 3) * 0.45,
    speed: 0.17 + (index % 4) * 0.05,
    scale: 4.5 + (index % 5) * 1.1
  })), [count])
  useFrame((_, delta) => {
    if (reducedMotion) return
    group.current?.children.forEach((child, index) => {
      const cloud = data[index]
      child.position.x += cloud.speed * delta
      child.position.z += Math.sin(performance.now() * 0.00018 + index) * delta * 0.06
      if (child.position.x > 14) child.position.x = -14
      child.rotation.y += delta * 0.015
    })
  })
  return (
    <group ref={group}>
      {data.map((cloud, index) => (
        <mesh key={index} position={[cloud.x, cloud.y, cloud.z]} scale={[cloud.scale, 0.28, cloud.scale * 0.72]}>
          <sphereGeometry args={[1, 8, 5]} />
          <meshBasicMaterial color="#777b75" transparent opacity={0.055} depthWrite={false} />
        </mesh>
      ))}
    </group>
  )
}

function BuildingRows() {
  const buildings = useMemo(() => {
    const rows: Array<{ x: number; z: number; w: number; h: number; d: number; color: string }> = []
    for (let i = 0; i < 9; i += 1) {
      const z = 25 - i * 9.5
      const half = z > -18 ? 9.6 : z > -66 ? 14.3 : z > -88 ? 7.5 : 16.2
      for (const side of [-1, 1]) {
        rows.push({
          x: side * (half + 2.1 + (i % 2) * 0.5),
          z,
          w: 5.2 + (i % 3),
          h: 6.5 + ((i + (side > 0 ? 1 : 0)) % 4) * 1.7,
          d: 8.2,
          color: i % 2 ? '#252a27' : '#202421'
        })
      }
    }
    for (let i = 0; i < 4; i += 1) {
      const z = -93 - i * 9
      for (const side of [-1, 1]) rows.push({
        x: side * (17.5 + (i % 2)), z, w: 7.5, h: 8 + (i % 3) * 2, d: 8.4, color: '#202322'
      })
    }
    return rows
  }, [])
  return (
    <group>
      {buildings.map((building, index) => (
        <group key={index} position={[building.x, 0, building.z]} rotation={[0, (index % 3 - 1) * 0.025, 0]}>
          <mesh position={[0, building.h / 2, 0]} castShadow receiveShadow>
            <boxGeometry args={[building.w, building.h, building.d]} />
            <meshStandardMaterial color={building.color} roughness={0.98} />
          </mesh>
          {Array.from({ length: 3 }, (_, row) => Array.from({ length: 2 }, (_, col) => {
            const lit = (index + row * 2 + col) % 5 === 0
            return (
              <mesh key={`${row}-${col}`} position={[
                building.x > 0 ? -building.w / 2 - 0.01 : building.w / 2 + 0.01,
                2 + row * 1.55,
                -1.8 + col * 3.6
              ]} rotation={[0, building.x > 0 ? -Math.PI / 2 : Math.PI / 2, 0]}>
                <planeGeometry args={[0.72, 0.9]} />
                <meshStandardMaterial
                  color={lit ? '#315342' : '#111411'}
                  emissive={lit ? (index % 2 ? '#7dff48' : '#985cff') : '#000000'}
                  emissiveIntensity={lit ? 0.55 : 0}
                  roughness={0.45}
                />
              </mesh>
            )
          }))}
          <mesh position={[0, building.h + 0.25, 0]} rotation={[0, 0, (index % 2 ? 1 : -1) * 0.035]}>
            <boxGeometry args={[building.w * 0.94, 0.5, building.d * 0.94]} />
            <meshStandardMaterial color="#171a18" roughness={1} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

function WetGround() {
  return (
    <group>
      <mesh position={[0, -0.16, 4.5]} receiveShadow>
        <boxGeometry args={[17, 0.28, 45]} />
        <meshStandardMaterial color="#171b18" roughness={0.34} metalness={0.2} />
      </mesh>
      <mesh position={[0, -0.16, -42]} receiveShadow>
        <boxGeometry args={[26, 0.28, 48]} />
        <meshStandardMaterial color="#1a1e1b" roughness={0.38} metalness={0.2} />
      </mesh>
      <mesh position={[0, -0.16, -77.5]} receiveShadow>
        <boxGeometry args={[12.2, 0.28, 23]} />
        <meshStandardMaterial color="#151917" roughness={0.42} metalness={0.18} />
      </mesh>
      <mesh position={[0, -0.16, -103.5]} receiveShadow>
        <boxGeometry args={[30, 0.28, 31]} />
        <meshStandardMaterial color="#191c1b" roughness={0.32} metalness={0.22} />
      </mesh>
      {[
        [-1.8, 0.006, 14, 2.2, 5.4], [3.2, 0.008, -1, 2.8, 4], [-2.8, 0.008, -27, 4.2, 2.2],
        [4, 0.008, -53, 3, 5.4], [-1.5, 0.008, -78, 2.3, 5], [4.5, 0.008, -100, 4.2, 2.5],
        [-5.5, 0.008, -111, 3.1, 4.8]
      ].map(([x, y, z, sx, sz], index) => (
        <mesh key={index} position={[x, y, z]} rotation={[-Math.PI / 2, 0, index * 0.28]} scale={[sx, sz, 1]}>
          <circleGeometry args={[0.5, 12]} />
          <meshStandardMaterial color="#202d29" roughness={0.08} metalness={0.42} transparent opacity={0.78} />
        </mesh>
      ))}
      {Array.from({ length: 34 }, (_, index) => (
        <mesh key={index} position={[((index * 4.7) % 19) - 9.5, 0.018, 24 - ((index * 11.3) % 142)]} rotation={[-Math.PI / 2, 0, index * 0.91]}>
          <planeGeometry args={[0.24 + (index % 3) * 0.12, 0.4 + (index % 4) * 0.17]} />
          <meshStandardMaterial color={index % 7 === 0 ? '#5a366e' : '#6f7068'} side={THREE.DoubleSide} roughness={1} />
        </mesh>
      ))}
    </group>
  )
}

function PumpStation() {
  return (
    <group>
      <group position={[0, 0, -35]}>
        <mesh position={[0, 4.5, 0]} castShadow>
          <boxGeometry args={[18, 0.7, 13]} />
          <meshStandardMaterial color="#30332e" roughness={0.8} metalness={0.25} />
        </mesh>
        {[-8, 8].flatMap((x) => [-5, 5].map((z) => (
          <mesh key={`${x}-${z}`} position={[x, 2.1, z]} castShadow>
            <boxGeometry args={[0.42, 4.2, 0.42]} />
            <meshStandardMaterial color="#4a493f" roughness={0.78} metalness={0.48} />
          </mesh>
        )))}
        <WorldLabel text="PUMP STATION" position={[0, 4.45, 6.55]} color="#7dff48" width={5.4} height={1.05} />
      </group>
      {[-6, 6].flatMap((x, outer) => [-32.5, -45.8].map((z, inner) => (
        <group key={`${x}-${z}`} position={[x, 0, z]} rotation={[0, (outer + inner) * 0.08, 0]}>
          <mesh position={[0, 1.1, 0]} castShadow>
            <boxGeometry args={[1.45, 2.2, 1.3]} />
            <meshStandardMaterial color="#504b3e" roughness={0.8} metalness={0.42} />
          </mesh>
          <mesh position={[0, 1.45, 0.67]}>
            <planeGeometry args={[0.78, 0.52]} />
            <meshStandardMaterial color="#101512" emissive={inner ? '#985cff' : '#7dff48'} emissiveIntensity={0.8} />
          </mesh>
          <mesh position={[0, 0.78, 0.69]}>
            <capsuleGeometry args={[0.14, 0.36, 3, 8]} />
            <meshStandardMaterial color="#7dff48" emissive="#387a27" emissiveIntensity={0.7} />
          </mesh>
          <mesh position={[0.82, 1.55, 0]} rotation={[0, 0, 0.4]}>
            <cylinderGeometry args={[0.045, 0.055, 1.1, 6]} />
            <meshStandardMaterial color="#332d2b" metalness={0.55} roughness={0.75} />
          </mesh>
        </group>
      )))}
      <mesh position={[-10.35, 2.4, -29]} castShadow>
        <boxGeometry args={[4.2, 4.8, 12]} />
        <meshStandardMaterial color="#29302c" roughness={0.9} metalness={0.25} />
      </mesh>
      <mesh position={[10.3, 2.3, -49.5]} castShadow>
        <boxGeometry args={[4.3, 4.6, 10.6]} />
        <meshStandardMaterial color="#342f2c" roughness={0.88} metalness={0.32} />
      </mesh>
      <CandlestickScreen position={[-8.08, 2.4, -30]} rotation={[0, Math.PI / 2, 0]} />
      <CandlestickScreen position={[8.08, 2.4, -49]} rotation={[0, -Math.PI / 2, 0]} red />
      <Fence position={[-9, 0, -59]} length={7} rotation={0.08} />
      <Fence position={[9.2, 0, -20.2]} length={6.5} rotation={-0.05} />
      <WorldLabel text="HOLD THE WICK" position={[12.55, 3.25, -38]} rotation={[0, -Math.PI / 2, 0]} width={4.4} />
    </group>
  )
}

function SolanaExchange() {
  return (
    <group>
      <group position={[0, 0, -91]}>
        <mesh position={[-6.2, 3.2, 0]} rotation={[0, 0, -0.16]} castShadow>
          <boxGeometry args={[1.05, 6.4, 1.2]} />
          <meshStandardMaterial color="#292d2b" roughness={0.82} metalness={0.28} />
        </mesh>
        <mesh position={[6.2, 3.2, 0]} rotation={[0, 0, 0.14]} castShadow>
          <boxGeometry args={[1.05, 6.4, 1.2]} />
          <meshStandardMaterial color="#292d2b" roughness={0.82} metalness={0.28} />
        </mesh>
        <mesh position={[-3.1, 6.1, 0]} rotation={[0, 0, 0.1]}>
          <boxGeometry args={[6.4, 0.66, 1.15]} />
          <meshStandardMaterial color="#985cff" emissive="#532b91" emissiveIntensity={1.3} toneMapped={false} />
        </mesh>
        <mesh position={[3.1, 6.1, 0]} rotation={[0, 0, -0.1]}>
          <boxGeometry args={[6.4, 0.66, 1.15]} />
          <meshStandardMaterial color="#32e6cf" emissive="#18796f" emissiveIntensity={1.2} toneMapped={false} />
        </mesh>
        <WorldLabel text="OLD SOLANA EXCHANGE" position={[0, 5.2, 0.66]} color="#32e6cf" width={6.6} />
      </group>
      <CandlestickScreen position={[-12.3, 2.5, -103]} rotation={[0, Math.PI / 2, 0]} red />
      <CandlestickScreen position={[12.3, 2.5, -108]} rotation={[0, -Math.PI / 2, 0]} />
      <BrokenCar position={[-11, 0, -97.5]} rotation={0.3} color="#312a2b" />
      <BrokenCar position={[9.5, 0, -111]} rotation={-0.62} color="#29322f" />
      {[-1, 1].map((side) => (
        <group key={side} position={[side * 7.8, 3.8, -116]}>
          <mesh castShadow>
            <boxGeometry args={[6.2, 7.6, 2.2]} />
            <meshStandardMaterial color="#242725" roughness={0.95} />
          </mesh>
          <mesh position={[-side * 0.6, 0.2, 1.12]} rotation={[0, 0, side * 0.08]}>
            <planeGeometry args={[3.8, 3.1]} />
            <meshStandardMaterial color="#101312" emissive={side > 0 ? '#183d38' : '#2e1c43'} emissiveIntensity={0.55} />
          </mesh>
        </group>
      ))}
      {Array.from({ length: 7 }, (_, index) => (
        <mesh key={index} position={[-9 + index * 3, 5.2 + (index % 2), -99 - (index % 3) * 5]} rotation={[0.1, 0, index % 2 ? 0.14 : -0.12]}>
          <cylinderGeometry args={[0.035, 0.035, 8 + (index % 3), 5]} />
          <meshStandardMaterial color={index % 2 ? '#985cff' : '#32e6cf'} emissive={index % 2 ? '#4a277b' : '#176b61'} emissiveIntensity={0.55} />
        </mesh>
      ))}
    </group>
  )
}

function SignalTerminal({ reducedMotion }: { reducedMotion: boolean }) {
  const restored = useGameStore((state) => state.terminalRestored)
  const ring = useRef<THREE.Group>(null)
  const light = useRef<THREE.PointLight>(null)
  useFrame(({ clock }, delta) => {
    if (ring.current && !reducedMotion) ring.current.rotation.y += delta * (restored ? 1.8 : 0.35)
    if (light.current) light.current.intensity = restored ? 1.4 + (reducedMotion ? 0 : Math.sin(clock.elapsedTime * 6) * 0.2) : 0.3
  })
  return (
    <group position={[0, 0, GAME_CONFIG.world.terminalZ]}>
      <mesh position={[0, 0.7, 0]} castShadow>
        <boxGeometry args={[1.4, 1.4, 0.9]} />
        <meshStandardMaterial color="#262b27" roughness={0.7} metalness={0.42} />
      </mesh>
      <mesh position={[0, 1.45, 0]} castShadow>
        <boxGeometry args={[1.05, 0.25, 0.72]} />
        <meshStandardMaterial color="#42463f" roughness={0.62} metalness={0.55} />
      </mesh>
      <mesh position={[0, 0.9, 0.47]}>
        <planeGeometry args={[0.87, 0.63]} />
        <meshStandardMaterial
          color={restored ? '#7dff48' : '#1d2820'}
          emissive={restored ? '#7dff48' : '#17351c'}
          emissiveIntensity={restored ? 2.3 : 0.45}
          toneMapped={false}
        />
      </mesh>
      <group ref={ring} position={[0, 2.15, 0]}>
        {[0, Math.PI / 2].map((rotation) => (
          <mesh key={rotation} rotation={[0, rotation, 0]}>
            <torusGeometry args={[0.48, 0.035, 5, 18]} />
            <meshStandardMaterial color={restored ? '#7dff48' : '#5e625e'} emissive={restored ? '#4bbd2d' : '#000'} emissiveIntensity={1.2} />
          </mesh>
        ))}
      </group>
      <pointLight ref={light} position={[0, 1.3, 0.6]} color="#7dff48" intensity={0.3} distance={7} decay={2} />
    </group>
  )
}

function SlidingGate({ z, open, color = '#7dff48' }: { z: number; open: boolean; color?: string }) {
  const bars = useRef<THREE.Group>(null)
  useFrame((_, delta) => {
    if (bars.current) bars.current.position.y = THREE.MathUtils.lerp(
      bars.current.position.y,
      open ? 5 : 0,
      1 - Math.exp(-3.4 * delta)
    )
  })
  return (
    <group position={[0, 0, z]}>
      <mesh position={[-6.15, 2.2, 0]}>
        <boxGeometry args={[0.42, 4.4, 0.55]} />
        <meshStandardMaterial color="#333832" metalness={0.58} roughness={0.65} />
      </mesh>
      <mesh position={[6.15, 2.2, 0]}>
        <boxGeometry args={[0.42, 4.4, 0.55]} />
        <meshStandardMaterial color="#333832" metalness={0.58} roughness={0.65} />
      </mesh>
      <group ref={bars}>
        {Array.from({ length: 13 }, (_, index) => (
          <mesh key={index} position={[-5.5 + index * 0.92, 2.15, 0]}>
            <boxGeometry args={[0.11, 4.3, 0.2]} />
            <meshStandardMaterial color={index % 3 === 0 ? color : '#4c5049'} emissive={index % 3 === 0 ? color : '#000'} emissiveIntensity={0.45} metalness={0.65} roughness={0.58} />
          </mesh>
        ))}
      </group>
    </group>
  )
}

function CheckpointBeacon({ reducedMotion }: { reducedMotion: boolean }) {
  const restored = useGameStore((state) => state.terminalRestored)
  const beam = useRef<THREE.Mesh>(null)
  useFrame(({ clock }) => {
    if (beam.current) {
      beam.current.scale.x = reducedMotion ? 0.8 : 0.8 + Math.sin(clock.elapsedTime * 3) * 0.1
      beam.current.scale.z = beam.current.scale.x
    }
  })
  if (!restored) return null
  return (
    <group position={[0, 0, GAME_CONFIG.world.checkpointZ]}>
      <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[1.1, 1.35, 24]} />
        <meshBasicMaterial color="#7dff48" transparent opacity={0.55} toneMapped={false} />
      </mesh>
      <mesh ref={beam} position={[0, 1.7, 0]}>
        <cylinderGeometry args={[0.55, 1.1, 3.4, 10, 1, true]} />
        <meshBasicMaterial color="#7dff48" transparent opacity={0.055} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
    </group>
  )
}

type CrateDrop = 'medkit' | 'wick' | 'none'

function BreakableCrate({
  id,
  position,
  drop,
  playerPosition
}: {
  id: string
  position: [number, number, number]
  drop: CrateDrop
  playerPosition: MutableRefObject<THREE.Vector3>
}) {
  const combat = useCombatSystem()
  const cratePosition = useRef(new THREE.Vector3(...position))
  const hp = useRef(20)
  const alive = useRef(true)
  const [broken, setBroken] = useState(false)
  const [collected, setCollected] = useState(false)
  const fragments = useRef<THREE.Group>(null)
  const fragmentTime = useRef(0)

  const receiveHit = useCallback((hit: HitPayload) => {
    if (!alive.current) return false
    hp.current -= hit.damage
    if (hp.current <= 0) {
      alive.current = false
      setBroken(true)
      combat.emitSound('crate', 0.8)
    }
    return true
  }, [combat])
  const target = useMemo<CombatTarget>(() => ({
    id,
    kind: 'crate',
    position: cratePosition.current,
    radius: 0.72,
    get alive() { return alive.current },
    receiveHit
  }), [id, receiveHit])
  useEffect(() => combat.registerTarget(target), [combat, target])

  useFrame((_, delta) => {
    if (useGameStore.getState().status !== 'PLAYING') return
    if (broken && fragmentTime.current < 1.2) {
      fragmentTime.current += delta
      fragments.current?.children.forEach((child, index) => {
        child.position.x += Math.cos(index * 1.7) * delta * (0.8 + index * 0.1)
        child.position.z += Math.sin(index * 1.7) * delta * (0.8 + index * 0.1)
        child.position.y += delta * (0.7 - fragmentTime.current * 1.6)
        child.rotation.x += delta * 5
      })
    }
    if (!broken || collected || drop === 'none') return
    if (cratePosition.current.distanceTo(playerPosition.current) > 1.25) return
    const store = useGameStore.getState()
    if (drop === 'medkit') {
      if (store.medkits >= GAME_CONFIG.player.maxMedkits) return
      useGameStore.setState({ medkits: Math.min(GAME_CONFIG.player.maxMedkits, store.medkits + 1), message: 'MEDKIT ACQUIRED' })
    } else {
      store.addWick(28)
      store.setMessage('WICK ENERGY ACQUIRED')
    }
    setCollected(true)
    combat.emitSound('pickup', 0.75)
    window.setTimeout(() => {
      const current = useGameStore.getState()
      if (current.message === 'MEDKIT ACQUIRED' || current.message === 'WICK ENERGY ACQUIRED') current.setMessage('')
    }, 1300)
  })

  return (
    <group position={position}>
      {!broken && (
        <group>
          <mesh position={[0, 0.62, 0]} castShadow>
            <boxGeometry args={[1.25, 1.25, 1.25]} />
            <meshStandardMaterial color="#494536" roughness={0.88} metalness={0.12} />
          </mesh>
          {[0, Math.PI / 2].map((rotation) => (
            <mesh key={rotation} position={[0, 0.62, 0]} rotation={[0, rotation, 0]}>
              <boxGeometry args={[1.34, 0.12, 1.34]} />
              <meshStandardMaterial color="#292d29" metalness={0.58} roughness={0.65} />
            </mesh>
          ))}
          <mesh position={[0, 0.65, 0.64]} rotation={[0, 0, 0.55]}>
            <boxGeometry args={[0.16, 0.72, 0.045]} />
            <meshStandardMaterial color="#7dff48" emissive="#336f25" emissiveIntensity={0.45} />
          </mesh>
        </group>
      )}
      {broken && (
        <group ref={fragments}>
          {Array.from({ length: 7 }, (_, index) => (
            <mesh key={index} position={[0, 0.35 + (index % 3) * 0.18, 0]} scale={[0.25 + (index % 2) * 0.13, 0.16, 0.32]}>
              <boxGeometry />
              <meshStandardMaterial color={index % 3 === 0 ? '#292d29' : '#494536'} roughness={0.9} />
            </mesh>
          ))}
        </group>
      )}
      {broken && !collected && drop !== 'none' && (
        <group position={[0, 0.48, 0]}>
          {drop === 'medkit' ? (
            <>
              <mesh>
                <boxGeometry args={[0.72, 0.42, 0.56]} />
                <meshStandardMaterial color="#d3d5ce" emissive="#7dff48" emissiveIntensity={0.25} roughness={0.72} />
              </mesh>
              <mesh position={[0, 0, 0.3]}>
                <boxGeometry args={[0.14, 0.3, 0.03]} />
                <meshBasicMaterial color="#2d6a35" />
              </mesh>
              <mesh position={[0, 0, 0.31]}>
                <boxGeometry args={[0.32, 0.13, 0.03]} />
                <meshBasicMaterial color="#2d6a35" />
              </mesh>
            </>
          ) : (
            <>
              <mesh>
                <boxGeometry args={[0.2, 0.72, 0.2]} />
                <meshStandardMaterial color="#7dff48" emissive="#7dff48" emissiveIntensity={2.4} toneMapped={false} />
              </mesh>
              <pointLight color="#7dff48" intensity={0.7} distance={3} />
            </>
          )}
        </group>
      )}
    </group>
  )
}

function WorldSession() {
  const combat = useCombatSystem()
  const status = useGameStore((state) => state.status)
  const terminalRestored = useGameStore((state) => state.terminalRestored)
  const bossActive = useGameStore((state) => state.bossActive)
  const bossHp = useGameStore((state) => state.bossHp)
  const graphicsMode = useGameStore((state) => state.graphicsMode)
  const reducedMotion = useReducedMotion()
  const playerRef = useRef<THREE.Group | null>(null)
  const playerPosition = useRef(new THREE.Vector3())
  const cameraYaw = useRef(0)
  const cameraPitch = useRef(0.18)
  const combatZoom = useRef(0)
  const [activeZone, setActiveZone] = useState<'street' | 'pump' | 'exchange'>('street')
  const [pumpAlive, setPumpAlive] = useState(() => new Set(['pump-w1', 'pump-w2', 'pump-w3', 'pump-r1', 'pump-r2']))
  const lastPrompt = useRef('')
  const bossTriggered = useRef(false)

  const extraColliders = useMemo<WorldBox[]>(() => {
    const colliders: WorldBox[] = []
    if (!terminalRestored) colliders.push({ minX: -6.4, maxX: 6.4, minZ: -67.2, maxZ: -65.7, maxY: 5 })
    if (bossActive) colliders.push({ minX: -6.35, maxX: 6.35, minZ: -89.1, maxZ: -87.7, maxY: 5 })
    return colliders
  }, [bossActive, terminalRestored])

  const spawn: [number, number, number] = terminalRestored
    ? [0, 0, GAME_CONFIG.world.checkpointZ - 1]
    : [0, 0, GAME_CONFIG.world.startZ]

  const onPumpDeath = useCallback((id: string) => {
    setPumpAlive((current) => {
      if (!current.has(id)) return current
      const next = new Set(current)
      next.delete(id)
      if (next.size === 0) useGameStore.getState().setObjective(OBJECTIVES.terminal)
      return next
    })
  }, [])

  const onInteract = useCallback(() => {
    const state = useGameStore.getState()
    if (
      state.status === 'PLAYING' &&
      !state.terminalRestored &&
      pumpAlive.size === 0 &&
      playerPosition.current.distanceTo(new THREE.Vector3(0, 0, GAME_CONFIG.world.terminalZ)) <= 2.65
    ) {
      state.restoreTerminal()
      combat.addShake(0.22)
    }
  }, [combat, pumpAlive])

  useEffect(() => {
    if (status !== 'BOSS_INTRO') return
    const timer = window.setTimeout(() => useGameStore.getState().finishBossIntro(), 2250)
    return () => window.clearTimeout(timer)
  }, [combat, status])

  useFrame((_, delta) => {
    const state = useGameStore.getState()
    if (state.status === 'PLAYING') state.tick(delta)
    const z = playerPosition.current.z
    const nextZone = z > GAME_CONFIG.world.pumpEntranceZ ? 'street' : z > -68 ? 'pump' : 'exchange'
    if (nextZone !== activeZone) setActiveZone(nextZone)

    if (state.status === 'PLAYING') {
      let objective = state.objective
      if (!state.terminalRestored) {
        if (z > GAME_CONFIG.world.pumpEntranceZ) objective = OBJECTIVES.street
        else objective = pumpAlive.size > 0 ? OBJECTIVES.pumpFight : OBJECTIVES.terminal
      } else if (!state.bossActive) {
        objective = OBJECTIVES.exchange
      }
      if (objective !== state.objective) state.setObjective(objective)

      const terminalDistance = playerPosition.current.distanceTo(new THREE.Vector3(0, 0, GAME_CONFIG.world.terminalZ))
      const prompt = !state.terminalRestored && pumpAlive.size === 0 && terminalDistance <= 2.65
        ? 'PRESS E TO RESTORE SIGNAL'
        : ''
      if (prompt !== lastPrompt.current) {
        lastPrompt.current = prompt
        state.setInteractionPrompt(prompt)
      }

      if (
        state.terminalRestored &&
        !state.bossActive &&
        !bossTriggered.current &&
        z < GAME_CONFIG.world.bossTriggerZ - 1.7
      ) {
        bossTriggered.current = true
        state.startBoss()
      }
    } else if (lastPrompt.current) {
      lastPrompt.current = ''
      state.setInteractionPrompt('')
    }
  })

  const bossInArena = bossActive && bossHp > 0
  const arenaDanger = bossInArena && bossHp <= GAME_CONFIG.enemies.boss.hp * 0.5
  const arenaAmbient = arenaDanger ? '#5b1717' : bossInArena ? '#28213d' : '#89958a'
  const arenaSky = arenaDanger ? '#4b1d25' : bossInArena ? '#3c3866' : '#65736b'
  const keyLight = arenaDanger ? '#c63f3f' : bossInArena ? '#32e6cf' : '#a8b1a9'

  return (
    <>
      <ambientLight intensity={arenaDanger ? 0.18 : bossInArena ? 0.22 : 0.28} color={arenaAmbient} />
      <hemisphereLight args={[arenaSky, '#090b0a', arenaDanger ? 0.38 : bossInArena ? 0.42 : 0.48]} />
      <directionalLight
        position={[-9, 16, 8]}
        color={keyLight}
        intensity={arenaDanger ? 0.7 : bossInArena ? 0.64 : 0.58}
        castShadow={graphicsMode === 'QUALITY'}
        shadow-mapSize-width={graphicsMode === 'QUALITY' ? 1024 : 512}
        shadow-mapSize-height={graphicsMode === 'QUALITY' ? 1024 : 512}
        shadow-camera-left={-18}
        shadow-camera-right={18}
        shadow-camera-top={25}
        shadow-camera-bottom={-25}
        shadow-camera-far={48}
      />
      <WetGround />
      <BuildingRows />
      <PumpStation />
      <SolanaExchange />
      <FogBanks quality={graphicsMode === 'QUALITY'} reducedMotion={reducedMotion} />
      <BrokenCar position={[-5.2, 0, 7.8]} rotation={0.08} />
      <BrokenCar position={[4.6, 0, -5.1]} rotation={-0.2} color="#342e2c" />
      <group position={[-4.85, 0, -77.7]} rotation={[0, -0.08, 0]}>
        <mesh position={[0, 0.55, 0]} castShadow>
          <boxGeometry args={[2.05, 1.1, 4.1]} />
          <meshStandardMaterial color="#555850" roughness={1} />
        </mesh>
        <mesh position={[0, 1.13, 0]}>
          <boxGeometry args={[1.72, 0.12, 3.8]} />
          <meshStandardMaterial color="#272b28" roughness={0.86} />
        </mesh>
        <mesh position={[1.03, 0.62, 0]}>
          <boxGeometry args={[0.035, 0.34, 3.45]} />
          <meshStandardMaterial color="#7dff48" emissive="#315e27" emissiveIntensity={0.35} />
        </mesh>
      </group>
      <Fence position={[-7.1, 0, -13.7]} length={6.5} rotation={0.08} />
      <Fence position={[7.4, 0, 14]} length={5.4} rotation={-0.05} />
      <FlickerLamp position={[-6.8, 0, 18]} seed={1} broken reducedMotion={reducedMotion} />
      <FlickerLamp position={[6.6, 0, -12]} seed={2} reducedMotion={reducedMotion} />
      <FlickerLamp position={[-10.5, 0, -39]} seed={3} broken reducedMotion={reducedMotion} />
      <FlickerLamp position={[5.6, 0, -76]} color="#985cff" seed={4} reducedMotion={reducedMotion} />
      <WorldLabel text="PAPER HANDS" position={[-8.48, 3.2, 1]} rotation={[0, Math.PI / 2, -0.08]} color="#c5c8c4" width={4.2} />
      <WorldLabel text="WASD MOVE" position={[7.95, 2.1, 18]} rotation={[0, -Math.PI / 2, 0]} width={2.8} height={0.7} fontSize={48} />
      <WorldLabel text="MOUSE LOOK" position={[-7.95, 2.1, 13]} rotation={[0, Math.PI / 2, 0]} width={2.8} height={0.7} fontSize={48} />
      <WorldLabel text="LEFT CLICK LIGHT ATTACK" position={[7.95, 2.1, 6]} rotation={[0, -Math.PI / 2, 0]} width={4.2} height={0.7} fontSize={43} />
      <WorldLabel text="RIGHT CLICK HEAVY ATTACK" position={[-7.95, 2.1, -1]} rotation={[0, Math.PI / 2, 0]} width={4.4} height={0.7} fontSize={42} />
      <WorldLabel text="SPACE DODGE  Q MEDKIT" position={[7.95, 2.1, -9]} rotation={[0, -Math.PI / 2, 0]} width={4.2} height={0.7} fontSize={42} />
      <SignalTerminal reducedMotion={reducedMotion} />
      <SlidingGate z={-66.4} open={terminalRestored} />
      <SlidingGate z={-88.4} open={!bossActive} color="#c63f3f" />
      <CheckpointBeacon reducedMotion={reducedMotion} />
      <BreakableCrate id="crate-medkit" position={[3.3, 0, -41.5]} drop="medkit" playerPosition={playerPosition} />
      <BreakableCrate id="crate-wick" position={[-3.8, 0, -52]} drop="wick" playerPosition={playerPosition} />
      <BreakableCrate id="crate-empty" position={[7.3, 0, -27]} drop="none" playerPosition={playerPosition} />

      {!terminalRestored && (
        <>
          <Enemy id="street-w1" kind="walker" spawn={[-2.1, 0, 4]} active={activeZone === 'street'} playerPosition={playerPosition} extraColliders={extraColliders} />
          <Enemy id="street-w2" kind="walker" spawn={[2.2, 0, -10.5]} active={activeZone === 'street'} playerPosition={playerPosition} extraColliders={extraColliders} />
          <Enemy id="pump-w1" kind="walker" spawn={[3, 0, -26]} active={activeZone === 'pump'} playerPosition={playerPosition} extraColliders={extraColliders} onDeath={onPumpDeath} />
          <Enemy id="pump-w2" kind="walker" spawn={[-2, 0, -39]} active={activeZone === 'pump'} playerPosition={playerPosition} extraColliders={extraColliders} onDeath={onPumpDeath} />
          <Enemy id="pump-w3" kind="walker" spawn={[1.5, 0, -53.5]} active={activeZone === 'pump'} playerPosition={playerPosition} extraColliders={extraColliders} onDeath={onPumpDeath} />
          <Enemy id="pump-r1" kind="runner" spawn={[-4, 0, -33]} active={activeZone === 'pump'} playerPosition={playerPosition} extraColliders={extraColliders} onDeath={onPumpDeath} />
          <Enemy id="pump-r2" kind="runner" spawn={[6.5, 0, -55.8]} active={activeZone === 'pump'} playerPosition={playerPosition} extraColliders={extraColliders} onDeath={onPumpDeath} />
        </>
      )}

      {bossActive && <Boss playerPosition={playerPosition} extraColliders={extraColliders} />}
      <Player
        playerRef={playerRef}
        playerPosition={playerPosition}
        cameraYaw={cameraYaw}
        combatZoom={combatZoom}
        spawn={spawn}
        extraColliders={extraColliders}
        onInteract={onInteract}
      />
      <ThirdPersonCamera
        target={playerRef}
        yaw={cameraYaw}
        pitch={cameraPitch}
        combatZoom={combatZoom}
        extraColliders={extraColliders}
      />
    </>
  )
}

export default function GameWorld() {
  const sessionId = useGameStore((state) => state.sessionId)
  const status = useGameStore((state) => state.status)
  const victory = status === 'VICTORY'
  const dead = status === 'PLAYER_DEAD'
  return (
    <>
      <color attach="background" args={[victory ? '#18231b' : '#090b0a']} />
      <fog
        attach="fog"
        args={[victory ? '#626c62' : dead ? '#5e625e' : '#4e534f', dead ? 5 : 10, victory ? 74 : dead ? 34 : 52]}
      />
      <CombatSystem>
        <WorldSession key={sessionId} />
      </CombatSystem>
    </>
  )
}
