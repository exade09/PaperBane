import { Instance, Instances } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'

type Vec3 = [number, number, number]

interface BuildingDefinition {
  x: number
  z: number
  width: number
  depth: number
  height: number
  tone: string
  accent: string
  seed: number
  damage: number
}

const BUILDINGS: BuildingDefinition[] = [
  { x: -12.2, z: 22, width: 6.1, depth: 9.2, height: 10.4, tone: '#313633', accent: '#6e745e', seed: 1, damage: 2 },
  { x: 12.6, z: 20, width: 6.8, depth: 10.8, height: 13.2, tone: '#292e2d', accent: '#5d665d', seed: 2, damage: 3 },
  { x: -12.6, z: 10.3, width: 7.4, depth: 10.1, height: 8.8, tone: '#363430', accent: '#765443', seed: 3, damage: 3 },
  { x: 12.1, z: 7.8, width: 5.8, depth: 8.7, height: 10.7, tone: '#2b302f', accent: '#425f56', seed: 4, damage: 2 },
  { x: -12.5, z: -1.4, width: 6.7, depth: 9.8, height: 12.7, tone: '#302f2d', accent: '#635346', seed: 5, damage: 4 },
  { x: 12.4, z: -5.6, width: 6.5, depth: 11.2, height: 9.3, tone: '#2d3330', accent: '#4d6659', seed: 6, damage: 2 },
  { x: -16.8, z: -23.8, width: 6.9, depth: 10.4, height: 9.7, tone: '#333532', accent: '#66705f', seed: 7, damage: 3 },
  { x: 16.9, z: -27.5, width: 7.8, depth: 11.8, height: 13.5, tone: '#292e2c', accent: '#63514c', seed: 8, damage: 4 },
  { x: -16.7, z: -47.8, width: 7.2, depth: 11.4, height: 12.1, tone: '#303431', accent: '#536258', seed: 9, damage: 2 },
  { x: 16.6, z: -56.8, width: 6.5, depth: 10.6, height: 10.8, tone: '#342f2d', accent: '#765044', seed: 10, damage: 3 },
  { x: -9.9, z: -73.2, width: 6.7, depth: 8.7, height: 11.4, tone: '#2c302e', accent: '#655a50', seed: 11, damage: 4 },
  { x: 9.8, z: -78.4, width: 6.4, depth: 10.2, height: 12.8, tone: '#292e2d', accent: '#485e5a', seed: 12, damage: 3 },
  { x: -19.5, z: -98.2, width: 8.8, depth: 12.5, height: 14.5, tone: '#282c2b', accent: '#5d4c4f', seed: 13, damage: 4 },
  { x: 19.2, z: -102.8, width: 7.9, depth: 11.4, height: 11.6, tone: '#2c302e', accent: '#465f58', seed: 14, damage: 3 },
  { x: -19.2, z: -114.2, width: 9.2, depth: 12.4, height: 12.7, tone: '#2f2d2d', accent: '#65464c', seed: 15, damage: 3 },
  { x: 19.6, z: -116.5, width: 8.4, depth: 10.6, height: 15.2, tone: '#292d2d', accent: '#405e58', seed: 16, damage: 4 }
]

const PUDDLES: Array<[number, number, number, number]> = [
  [-2.6, 17.5, 2.8, 0.18], [3.9, 9, 2.1, -0.22], [-4.6, -4.5, 2.6, 0.3],
  [4.2, -21.5, 3.4, -0.1], [-2.9, -36.5, 4.4, 0.12], [6.4, -51.5, 2.7, -0.34],
  [-3.2, -62.5, 2.2, 0.22], [1.9, -74.2, 2.8, -0.16], [-5.7, -96.2, 4.5, 0.09],
  [5.4, -109.4, 3.7, -0.25]
]

const PAPER_DEBRIS: Array<[number, number, number, number]> = Array.from({ length: 56 }, (_, index) => [
  ((index * 7.17) % 23) - 11.5,
  24 - ((index * 13.43) % 142),
  0.22 + (index % 4) * 0.09,
  index * 0.73
])

function useSurfaceNoise() {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 96
    canvas.height = 96
    const context = canvas.getContext('2d')
    if (context) {
      const image = context.createImageData(canvas.width, canvas.height)
      let noise = 1847
      for (let index = 0; index < image.data.length; index += 4) {
        noise = (noise * 16807) % 2147483647
        const coarse = 105 + (noise % 96)
        const x = (index / 4) % canvas.width
        const y = Math.floor(index / 4 / canvas.width)
        const scar = (x * 13 + y * 7) % 37 < 2 ? 58 : 0
        const value = Math.max(24, coarse - scar)
        image.data[index] = value
        image.data[index + 1] = value
        image.data[index + 2] = value
        image.data[index + 3] = 255
      }
      context.putImageData(image, 0, 0)
    }
    const result = new THREE.CanvasTexture(canvas)
    result.wrapS = THREE.RepeatWrapping
    result.wrapT = THREE.RepeatWrapping
    result.repeat.set(4, 7)
    result.colorSpace = THREE.NoColorSpace
    result.minFilter = THREE.LinearMipmapLinearFilter
    result.magFilter = THREE.LinearFilter
    return result
  }, [])
  useEffect(() => () => texture.dispose(), [texture])
  return texture
}

function PaintedSign({
  text,
  position,
  rotation = [0, 0, 0],
  width = 4.8,
  height = 1.2,
  color = '#7dff48',
  secondary = '#985cff'
}: {
  text: string
  position: Vec3
  rotation?: Vec3
  width?: number
  height?: number
  color?: string
  secondary?: string
}) {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 1024
    canvas.height = 256
    const context = canvas.getContext('2d')
    if (context) {
      const gradient = context.createLinearGradient(0, 0, canvas.width, canvas.height)
      gradient.addColorStop(0, '#111512')
      gradient.addColorStop(0.52, '#1a1e1b')
      gradient.addColorStop(1, '#0a0d0b')
      context.fillStyle = gradient
      context.fillRect(0, 0, canvas.width, canvas.height)
      context.strokeStyle = '#40473f'
      context.lineWidth = 18
      context.strokeRect(10, 10, canvas.width - 20, canvas.height - 20)
      context.strokeStyle = color
      context.lineWidth = 5
      context.beginPath()
      context.moveTo(28, 42)
      context.lineTo(28, 22)
      context.lineTo(canvas.width * 0.43, 22)
      context.moveTo(canvas.width - 28, canvas.height - 42)
      context.lineTo(canvas.width - 28, canvas.height - 22)
      context.lineTo(canvas.width * 0.57, canvas.height - 22)
      context.stroke()
      context.font = '900 104px Impact, Arial Narrow, sans-serif'
      context.letterSpacing = '8px'
      context.textAlign = 'center'
      context.textBaseline = 'middle'
      context.fillStyle = color
      context.shadowColor = color
      context.shadowBlur = 18
      context.fillText(text, canvas.width / 2, canvas.height / 2 + 7, canvas.width - 88)
      context.shadowBlur = 0
      context.globalAlpha = 0.42
      context.fillStyle = secondary
      for (let index = 0; index < 18; index += 1) {
        const x = 34 + ((index * 149) % 930)
        const y = 24 + ((index * 67) % 210)
        context.fillRect(x, y, 18 + (index % 4) * 13, 3 + (index % 2) * 2)
      }
      context.globalAlpha = 1
    }
    const result = new THREE.CanvasTexture(canvas)
    result.colorSpace = THREE.SRGBColorSpace
    result.minFilter = THREE.LinearMipmapLinearFilter
    result.anisotropy = 4
    return result
  }, [color, secondary, text])

  useEffect(() => () => texture.dispose(), [texture])

  return (
    <group position={position} rotation={rotation}>
      <mesh castShadow>
        <boxGeometry args={[width + 0.14, height + 0.14, 0.14]} />
        <meshStandardMaterial color="#171b18" roughness={0.68} metalness={0.54} />
      </mesh>
      <mesh position={[0, 0, 0.078]}>
        <planeGeometry args={[width, height]} />
        <meshStandardMaterial map={texture} emissive={color} emissiveMap={texture} emissiveIntensity={0.25} roughness={0.5} toneMapped={false} />
      </mesh>
    </group>
  )
}

function RecessedWindows({ building }: { building: BuildingDefinition }) {
  const streetSide = building.x < 0 ? 1 : -1
  const faceX = streetSide * (building.width / 2 + 0.046)
  const rotationY = streetSide > 0 ? Math.PI / 2 : -Math.PI / 2
  const floors = Math.max(2, Math.floor((building.height - 2.4) / 1.65))
  const columns = building.depth > 10 ? 4 : 3
  const windows = useMemo(() => {
    const result: Array<{ position: Vec3; lit: boolean; broken: boolean; color: string }> = []
    for (let floor = 0; floor < floors; floor += 1) {
      for (let column = 0; column < columns; column += 1) {
        const pattern = building.seed * 11 + floor * 7 + column * 5
        if (pattern % 9 === 0) continue
        result.push({
          position: [faceX, 2.25 + floor * 1.62, -building.depth * 0.34 + column * (building.depth * 0.68 / (columns - 1))],
          lit: pattern % 11 === 0 || pattern % 17 === 0,
          broken: pattern % 6 === 0,
          color: pattern % 2 ? '#7dff48' : pattern % 3 ? '#32e6cf' : '#985cff'
        })
      }
    }
    return result
  }, [building, columns, faceX, floors])
  const dark = windows.filter((window) => !window.lit)
  const lit = windows.filter((window) => window.lit)

  return (
    <group>
      <Instances limit={dark.length} range={dark.length}>
        <planeGeometry args={[0.72, 0.92]} />
        <meshStandardMaterial color="#101413" roughness={0.31} metalness={0.28} />
        {dark.map((window, index) => (
          <Instance
            key={index}
            position={window.position}
            rotation={[0, rotationY, window.broken ? (index % 2 ? 0.07 : -0.09) : 0]}
            scale={window.broken ? [0.84, 0.74, 1] : [1, 1, 1]}
          />
        ))}
      </Instances>
      <Instances limit={lit.length} range={lit.length}>
        <planeGeometry args={[0.72, 0.92]} />
        <meshStandardMaterial color="#8bb8a2" emissive="#1d4b3c" emissiveIntensity={0.78} roughness={0.35} toneMapped={false} />
        {lit.map((window, index) => (
          <Instance key={index} color={window.color} position={window.position} rotation={[0, rotationY, 0]} />
        ))}
      </Instances>
      {Array.from({ length: floors }, (_, floor) => (
        <mesh key={floor} position={[faceX + streetSide * 0.018, 2.78 + floor * 1.62, 0]}>
          <boxGeometry args={[0.11, 0.1, building.depth * 0.82]} />
          <meshStandardMaterial color="#1e2320" roughness={0.94} />
        </mesh>
      ))}
    </group>
  )
}

function RuinedBuilding({ building, surfaceMap }: { building: BuildingDefinition; surfaceMap: THREE.Texture }) {
  const streetSide = building.x < 0 ? 1 : -1
  const faceX = streetSide * (building.width / 2 + 0.06)
  const roofPieces = 5 + (building.seed % 3)
  const stainColor = building.seed % 3 === 0 ? '#322522' : building.seed % 2 === 0 ? '#20372e' : '#35352c'
  return (
    <group position={[building.x, 0, building.z]} rotation={[0, (building.seed % 3 - 1) * 0.018, 0]}>
      <mesh position={[0, building.height / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[building.width, building.height, building.depth]} />
        <meshStandardMaterial color={building.tone} roughness={0.97} metalness={0.035} bumpMap={surfaceMap} bumpScale={0.075} flatShading />
      </mesh>
      <mesh position={[-streetSide * building.width * 0.32, building.height * 0.34, building.depth * 0.38]} castShadow>
        <boxGeometry args={[building.width * 0.58, building.height * 0.68, building.depth * 0.4]} />
        <meshStandardMaterial color={building.accent} roughness={0.99} metalness={0.02} bumpMap={surfaceMap} bumpScale={0.055} flatShading />
      </mesh>
      <mesh position={[faceX, building.height * 0.48, 0]}>
        <boxGeometry args={[0.12, building.height * 0.84, building.depth * 0.92]} />
        <meshStandardMaterial color={building.accent} roughness={0.98} bumpMap={surfaceMap} bumpScale={0.045} flatShading />
      </mesh>
      <RecessedWindows building={building} />

      <group position={[faceX + streetSide * 0.08, 0, -building.depth * 0.29]}>
        <mesh position={[0, 1.04, 0]} castShadow>
          <boxGeometry args={[0.18, 2.08, 1.24]} />
          <meshStandardMaterial color="#111613" roughness={0.75} metalness={0.32} />
        </mesh>
        <mesh position={[streetSide * 0.03, 1.24, 0]}>
          <boxGeometry args={[0.2, 0.06, 0.88]} />
          <meshStandardMaterial color={building.seed % 2 ? '#2f6941' : '#573a65'} emissive={building.seed % 2 ? '#183b24' : '#2c1938'} emissiveIntensity={0.32} />
        </mesh>
        <mesh position={[streetSide * 0.16, 2.18, 0]} rotation={[0, 0, streetSide * -0.05]} castShadow>
          <boxGeometry args={[0.18, 0.18, 1.54]} />
          <meshStandardMaterial color="#3c4039" roughness={0.78} metalness={0.38} />
        </mesh>
      </group>

      <mesh position={[faceX + streetSide * 0.08, building.height * 0.54, building.depth * 0.34]}>
        <circleGeometry args={[0.54 + building.damage * 0.05, 7]} />
        <meshStandardMaterial color="#101311" roughness={1} side={THREE.DoubleSide} />
      </mesh>
      {Array.from({ length: building.damage }, (_, index) => (
        <mesh
          key={`scar-${index}`}
          position={[faceX + streetSide * 0.09, 1.3 + ((index * 2.17 + building.seed) % Math.max(2, building.height - 2)), -building.depth * 0.38 + ((index * 2.8) % (building.depth * 0.72))]}
          rotation={[0, 0, index % 2 ? 0.48 : -0.6]}
        >
          <boxGeometry args={[0.08, 0.56 + (index % 2) * 0.42, 0.055]} />
          <meshStandardMaterial color={stainColor} roughness={1} />
        </mesh>
      ))}

      {Array.from({ length: roofPieces }, (_, index) => {
        const missing = (index + building.seed) % 5 === 0
        if (missing) return null
        return (
          <mesh
            key={`roof-${index}`}
            position={[-building.width * 0.38 + index * (building.width * 0.76 / (roofPieces - 1)), building.height + 0.32 + (index % 2) * 0.08, building.depth * 0.35]}
            rotation={[0.04 * (index % 2), 0, (index % 3 - 1) * 0.09]}
            castShadow
          >
            <boxGeometry args={[building.width / roofPieces * 0.86, 0.72 + (index % 2) * 0.16, 0.46]} />
            <meshStandardMaterial color="#202421" roughness={0.97} flatShading />
          </mesh>
        )
      })}
      <mesh position={[-streetSide * building.width * 0.18, building.height + 0.65, -building.depth * 0.22]} rotation={[0, 0, 0.04]} castShadow>
        <boxGeometry args={[building.width * 0.24, 1.3, building.depth * 0.22]} />
        <meshStandardMaterial color="#252a27" roughness={0.96} />
      </mesh>
      <mesh position={[faceX + streetSide * 0.12, building.height * 0.44, -building.depth * 0.44]} castShadow>
        <cylinderGeometry args={[0.075, 0.09, building.height * 0.62, 7]} />
        <meshStandardMaterial color="#4a443a" roughness={0.8} metalness={0.48} />
      </mesh>
      <mesh position={[faceX + streetSide * 0.16, building.height * 0.72, -building.depth * 0.15]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.045, 0.055, building.depth * 0.55, 6]} />
        <meshStandardMaterial color="#373b36" roughness={0.72} metalness={0.58} />
      </mesh>
      <mesh position={[0, 0.18, 0]}>
        <boxGeometry args={[building.width * 1.05, 0.36, building.depth * 1.03]} />
        <meshStandardMaterial color="#171a18" roughness={1} />
      </mesh>
    </group>
  )
}

function Puddle({ x, z, scale, rotation }: { x: number; z: number; scale: number; rotation: number }) {
  return (
    <group position={[x, 0.008, z]} rotation={[0, rotation, 0]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} scale={[scale, scale * 0.52, 1]} receiveShadow>
        <circleGeometry args={[0.7, 18]} />
        <meshStandardMaterial color="#293c39" roughness={0.07} metalness={0.54} transparent opacity={0.78} />
      </mesh>
      <mesh position={[0.18, 0.005, -0.06]} rotation={[-Math.PI / 2, 0, 0.22]} scale={[scale * 0.52, scale * 0.05, 1]}>
        <circleGeometry args={[0.68, 16]} />
        <meshBasicMaterial color="#8ba89d" transparent opacity={0.12} depthWrite={false} />
      </mesh>
    </group>
  )
}

function WetStreet({ surfaceMap }: { surfaceMap: THREE.Texture }) {
  const segments: Array<[number, number, number]> = [[4.5, 17, 45], [-42, 26, 48], [-77.5, 12.2, 23], [-103.5, 30, 31]]
  const sidewalks: Array<[number, number, number]> = [[4.5, 9.1, 45], [-42, 13.6, 48], [-77.5, 6.75, 23], [-103.5, 15.6, 31]]
  return (
    <group>
      {segments.map(([z, width, depth], index) => (
        <mesh key={z} position={[0, -0.17, z]} receiveShadow>
          <boxGeometry args={[width, 0.32, depth]} />
          <meshStandardMaterial color={index % 2 ? '#252c29' : '#222925'} roughness={0.29 + index * 0.025} roughnessMap={surfaceMap} bumpMap={surfaceMap} bumpScale={0.035} metalness={0.24} flatShading />
        </mesh>
      ))}
      {sidewalks.flatMap(([z, halfWidth, depth], segment) => [-1, 1].map((side) => (
        <group key={`${z}-${side}`} position={[side * halfWidth, 0, z]}>
          <mesh position={[0, -0.02, 0]} receiveShadow>
            <boxGeometry args={[1.0, 0.24, depth]} />
            <meshStandardMaterial color={segment % 2 ? '#3a3c37' : '#343833'} roughness={0.94} />
          </mesh>
          <mesh position={[-side * 0.56, -0.04, 0]}>
            <boxGeometry args={[0.16, 0.28, depth]} />
            <meshStandardMaterial color="#505149" roughness={0.92} />
          </mesh>
        </group>
      )))}
      {PUDDLES.map(([x, z, scale, rotation], index) => <Puddle key={index} x={x} z={z} scale={scale} rotation={rotation} />)}
      {Array.from({ length: 22 }, (_, index) => (
        <mesh
          key={`crack-${index}`}
          position={[((index * 5.3) % 15) - 7.5, 0.012, 22 - ((index * 8.21) % 138)]}
          rotation={[-Math.PI / 2, 0, (index % 5 - 2) * 0.31]}
        >
          <planeGeometry args={[0.035 + (index % 2) * 0.025, 0.8 + (index % 4) * 0.32]} />
          <meshBasicMaterial color="#0a0e0c" transparent opacity={0.78} />
        </mesh>
      ))}
      {Array.from({ length: 9 }, (_, index) => (
        <mesh
          key={`hole-${index}`}
          position={[((index * 4.9) % 13) - 6.5, 0.014, 15 - index * 15.4]}
          rotation={[-Math.PI / 2, 0, index * 0.41]}
          scale={[1 + (index % 3) * 0.28, 0.56, 1]}
        >
          <circleGeometry args={[0.42, 8]} />
          <meshStandardMaterial color="#111613" roughness={0.98} />
        </mesh>
      ))}
      <Instances limit={PAPER_DEBRIS.length} range={PAPER_DEBRIS.length}>
        <planeGeometry args={[0.42, 0.26]} />
        <meshStandardMaterial color="#8b8b80" roughness={1} side={THREE.DoubleSide} />
        {PAPER_DEBRIS.map(([x, z, scale, rotation], index) => (
          <Instance key={index} position={[x, 0.03 + (index % 2) * 0.012, z]} rotation={[-Math.PI / 2, 0, rotation]} scale={scale} color={index % 9 === 0 ? '#62467d' : index % 13 === 0 ? '#668f6a' : '#77786f'} />
        ))}
      </Instances>
    </group>
  )
}

function DebrisCluster({ position, seed }: { position: Vec3; seed: number }) {
  return (
    <group position={position} rotation={[0, seed * 0.3, 0]}>
      {Array.from({ length: 7 }, (_, index) => (
        <mesh
          key={index}
          position={[-0.7 + (index % 4) * 0.42, 0.12 + (index % 3) * 0.08, -0.46 + ((index * 3) % 5) * 0.22]}
          rotation={[index * 0.31, index * 0.47, index * 0.19]}
          castShadow
        >
          {index % 3 === 0 ? <dodecahedronGeometry args={[0.24 + (index % 2) * 0.08, 0]} /> : <boxGeometry args={[0.32 + (index % 2) * 0.18, 0.16, 0.46]} />}
          <meshStandardMaterial color={index % 4 === 0 ? '#5c4638' : '#464943'} roughness={0.94} metalness={index % 4 === 0 ? 0.4 : 0.08} flatShading />
        </mesh>
      ))}
      <mesh position={[0.18, 0.38, 0.15]} rotation={[0.2, 0.1, -0.15]} castShadow>
        <dodecahedronGeometry args={[0.42, 1]} />
        <meshStandardMaterial color="#111613" roughness={0.88} flatShading />
      </mesh>
    </group>
  )
}

function RustContainer({ position, rotation = 0, color = '#4b3830' }: { position: Vec3; rotation?: number; color?: string }) {
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <mesh position={[0, 1.2, 0]} castShadow receiveShadow>
        <boxGeometry args={[2.35, 2.4, 5.2]} />
        <meshStandardMaterial color={color} roughness={0.86} metalness={0.48} flatShading />
      </mesh>
      {[-0.92, -0.46, 0, 0.46, 0.92].map((x) => (
        <mesh key={x} position={[x, 1.2, 2.62]}>
          <boxGeometry args={[0.1, 2.22, 0.08]} />
          <meshStandardMaterial color="#282b27" roughness={0.76} metalness={0.7} />
        </mesh>
      ))}
      <mesh position={[0.54, 0.8, 2.69]} rotation={[0, 0, -0.36]}>
        <boxGeometry args={[0.11, 1.25, 0.06]} />
        <meshStandardMaterial color="#86563b" roughness={0.86} metalness={0.4} />
      </mesh>
    </group>
  )
}

function PumpUnit({ position, accent }: { position: Vec3; accent: string }) {
  return (
    <group position={position}>
      <mesh position={[0, 1.05, 0]} castShadow>
        <boxGeometry args={[1.18, 2.1, 1.08]} />
        <meshStandardMaterial color="#4d493d" roughness={0.73} metalness={0.46} flatShading />
      </mesh>
      <mesh position={[0, 1.35, 0.56]}>
        <boxGeometry args={[0.74, 0.52, 0.07]} />
        <meshStandardMaterial color="#111713" emissive={accent} emissiveIntensity={0.58} roughness={0.28} toneMapped={false} />
      </mesh>
      <mesh position={[0, 0.72, 0.58]}>
        <capsuleGeometry args={[0.12, 0.34, 3, 8]} />
        <meshStandardMaterial color="#7dff48" emissive="#326526" emissiveIntensity={0.62} />
      </mesh>
      <mesh position={[0.75, 1.4, 0]} rotation={[0, 0, 0.22]} castShadow>
        <torusGeometry args={[0.54, 0.055, 6, 16, Math.PI * 1.42]} />
        <meshStandardMaterial color="#252a26" roughness={0.68} metalness={0.72} />
      </mesh>
    </group>
  )
}

function PumpStationSet() {
  return (
    <group>
      <group position={[0, 0, -37]}>
        <mesh position={[0, 4.55, 0]} castShadow receiveShadow>
          <boxGeometry args={[18.6, 0.64, 13.6]} />
          <meshStandardMaterial color="#373832" roughness={0.78} metalness={0.3} flatShading />
        </mesh>
        <mesh position={[-5.7, 4.92, 0.6]} rotation={[0.03, 0, -0.025]} castShadow>
          <boxGeometry args={[6.6, 0.38, 11.8]} />
          <meshStandardMaterial color="#252a27" roughness={0.92} />
        </mesh>
        <mesh position={[5.2, 4.86, -1.1]} rotation={[-0.02, 0, 0.035]} castShadow>
          <boxGeometry args={[6.8, 0.28, 9.6]} />
          <meshStandardMaterial color="#2a2e2b" roughness={0.9} />
        </mesh>
        {[-8.15, 8.15].flatMap((x) => [-5.25, 5.25].map((z) => (
          <group key={`${x}-${z}`} position={[x, 0, z]}>
            <mesh position={[0, 2.1, 0]} castShadow>
              <cylinderGeometry args={[0.2, 0.28, 4.2, 8]} />
              <meshStandardMaterial color="#5a5549" roughness={0.75} metalness={0.54} flatShading />
            </mesh>
            <mesh position={[0, 0.15, 0]}>
              <cylinderGeometry args={[0.42, 0.52, 0.3, 8]} />
              <meshStandardMaterial color="#292c28" roughness={0.94} />
            </mesh>
          </group>
        )))}
        <mesh position={[0, 4.42, 6.86]} castShadow>
          <boxGeometry args={[18.5, 0.88, 0.24]} />
          <meshStandardMaterial color="#171b18" roughness={0.7} metalness={0.48} />
        </mesh>
        <PaintedSign text="PUMP.FUN" position={[0, 4.46, 7.01]} width={6.4} height={1.02} />
      </group>

      <PumpUnit position={[-5.5, 0, -32.5]} accent="#7dff48" />
      <PumpUnit position={[5.6, 0, -32.7]} accent="#32e6cf" />
      <PumpUnit position={[-5.4, 0, -44.8]} accent="#985cff" />
      <PumpUnit position={[5.7, 0, -45.1]} accent="#7dff48" />

      <group position={[-10.8, 0, -43.5]}>
        <mesh position={[0, 2.7, 0]} castShadow receiveShadow>
          <boxGeometry args={[4.4, 5.4, 15]} />
          <meshStandardMaterial color="#343932" roughness={0.92} flatShading />
        </mesh>
        <mesh position={[2.24, 2.05, 3.5]}>
          <boxGeometry args={[0.08, 3.45, 5.4]} />
          <meshStandardMaterial color="#111512" roughness={0.85} />
        </mesh>
        {[-1.65, 0, 1.65].map((z, index) => (
          <group key={z} position={[2.35, 0, 3.5 + z]}>
            <mesh position={[0, 1.15, 0]}>
              <boxGeometry args={[0.12, 2.15, 1.25]} />
              <meshStandardMaterial color="#202620" roughness={0.74} metalness={0.34} />
            </mesh>
            <mesh position={[0.08, 1.45, 0]}>
              <planeGeometry args={[0.95, 0.62]} />
              <meshStandardMaterial color="#13201a" emissive={index === 1 ? '#7dff48' : '#25493c'} emissiveIntensity={0.5} />
            </mesh>
          </group>
        ))}
        <mesh position={[2.35, 1.15, -3.35]} rotation={[0, 0, 0.12]}>
          <boxGeometry args={[0.14, 2.35, 2.2]} />
          <meshStandardMaterial color="#1a1d1b" roughness={0.8} metalness={0.25} />
        </mesh>
      </group>
      <PaintedSign text="NEXT LAUNCH // UNKNOWN" position={[11.8, 3.3, -26]} rotation={[0, -Math.PI / 2, 0]} width={4.7} height={1.12} color="#7dff48" />
      <pointLight position={[0, 4.1, -37]} color="#8dff63" intensity={1.05} distance={14} decay={2} />
    </group>
  )
}

function SolanaGateSet() {
  return (
    <group position={[0, 0, -91]}>
      {[-1, 1].map((side) => (
        <group key={side} position={[side * 6.55, 0, 0]} rotation={[0, 0, side * 0.045]}>
          <mesh position={[0, 3.4, 0]} castShadow receiveShadow>
            <boxGeometry args={[1.35, 6.8, 2.1]} />
            <meshStandardMaterial color="#333733" roughness={0.9} flatShading />
          </mesh>
          <mesh position={[-side * 0.1, 5.6, 0.1]} rotation={[0.1, 0, side * 0.08]} castShadow>
            <boxGeometry args={[2, 1.2, 2.35]} />
            <meshStandardMaterial color="#252926" roughness={0.94} />
          </mesh>
          <mesh position={[-side * 0.7, 2.2, 1.08]}>
            <planeGeometry args={[0.72, 3.4]} />
            <meshStandardMaterial color="#111512" emissive={side > 0 ? '#32e6cf' : '#985cff'} emissiveIntensity={0.38} roughness={0.36} />
          </mesh>
        </group>
      ))}
      <mesh position={[0, 6.35, 0]} rotation={[0, 0, -0.018]} castShadow>
        <boxGeometry args={[13.2, 1.45, 2.15]} />
        <meshStandardMaterial color="#282c29" roughness={0.87} flatShading />
      </mesh>
      <mesh position={[-3.25, 6.38, 1.12]} rotation={[0, 0, 0.08]}>
        <boxGeometry args={[5.6, 0.32, 0.1]} />
        <meshStandardMaterial color="#985cff" emissive="#6337a3" emissiveIntensity={1.2} toneMapped={false} />
      </mesh>
      <mesh position={[3.25, 6.38, 1.12]} rotation={[0, 0, -0.08]}>
        <boxGeometry args={[5.6, 0.32, 0.1]} />
        <meshStandardMaterial color="#32e6cf" emissive="#1e897e" emissiveIntensity={1.15} toneMapped={false} />
      </mesh>
      <PaintedSign text="SOLANA" position={[0, 6.4, 1.24]} width={5.5} height={1.08} color="#d5ded9" secondary="#985cff" />
      <pointLight position={[0, 5.9, 1.8]} color="#72e7d8" intensity={0.72} distance={11} decay={2} />
    </group>
  )
}

function HangingCables() {
  const curves = useMemo(() => [
    new THREE.CatmullRomCurve3([new THREE.Vector3(-8.7, 7.8, 15), new THREE.Vector3(0, 5.7, 11), new THREE.Vector3(8.8, 8.3, 7)]),
    new THREE.CatmullRomCurve3([new THREE.Vector3(-13, 8.5, -29), new THREE.Vector3(0, 6.2, -35), new THREE.Vector3(13.2, 8.1, -42)]),
    new THREE.CatmullRomCurve3([new THREE.Vector3(-6.5, 8.2, -73), new THREE.Vector3(0, 5.4, -78), new THREE.Vector3(6.5, 8.7, -82)]),
    new THREE.CatmullRomCurve3([new THREE.Vector3(-15, 9.5, -101), new THREE.Vector3(0, 6.8, -107), new THREE.Vector3(15, 9, -111)])
  ], [])
  return (
    <group>
      {curves.map((curve, index) => (
        <mesh key={index} castShadow>
          <tubeGeometry args={[curve, 24, 0.026 + (index % 2) * 0.01, 5, false]} />
          <meshStandardMaterial color="#171b18" roughness={0.6} metalness={0.64} />
        </mesh>
      ))}
    </group>
  )
}

function DistantSkyline() {
  return (
    <group>
      {Array.from({ length: 13 }, (_, index) => {
        const x = -38 + index * 6.3
        const height = 10 + ((index * 7) % 13)
        const z = -132 - (index % 3) * 5
        return (
          <group key={index} position={[x, 0, z]}>
            <mesh position={[0, height / 2, 0]}>
              <boxGeometry args={[5.2 + (index % 2) * 1.4, height, 5.5]} />
              <meshStandardMaterial color={index % 2 ? '#222827' : '#252928'} roughness={1} flatShading />
            </mesh>
            {Array.from({ length: Math.floor(height / 2.4) }, (_, floor) => (
              <mesh key={floor} position={[0, 1.8 + floor * 2.1, 2.78]}>
                <planeGeometry args={[2.5, 0.11]} />
                <meshBasicMaterial color={index % 4 === 0 ? '#32e6cf' : index % 5 === 0 ? '#985cff' : '#7dff48'} transparent opacity={0.18 + (floor % 2) * 0.09} toneMapped={false} />
              </mesh>
            ))}
          </group>
        )
      })}
      <group position={[0, 0, -143]}>
        <mesh position={[0, 12, 0]}>
          <cylinderGeometry args={[2.2, 3.4, 24, 7]} />
          <meshStandardMaterial color="#232a28" roughness={0.95} flatShading />
        </mesh>
        <mesh position={[0, 24.6, 0]}>
          <coneGeometry args={[1.5, 4.5, 7]} />
          <meshStandardMaterial color="#2a3230" emissive="#174c42" emissiveIntensity={0.35} flatShading />
        </mesh>
        <mesh position={[0, 27.7, 0]}>
          <cylinderGeometry args={[0.12, 0.2, 3.4, 6]} />
          <meshBasicMaterial color="#7dff48" toneMapped={false} />
        </mesh>
        {['#985cff', '#32e6cf', '#7dff48'].map((color, index) => (
          <mesh key={color} position={[0, 17 + index * 2.15, 2.45]}>
            <boxGeometry args={[3.2 - index * 0.42, 0.23, 0.12]} />
            <meshBasicMaterial color={color} transparent opacity={0.58} toneMapped={false} />
          </mesh>
        ))}
      </group>
    </group>
  )
}

function Rain({ quality, reducedMotion }: { quality: boolean; reducedMotion: boolean }) {
  const count = quality ? 68 : 28
  const mesh = useRef<THREE.InstancedMesh>(null)
  const drops = useMemo(() => Array.from({ length: count }, (_, index) => ({
    x: ((index * 7.71) % 29) - 14.5,
    y: 1 + ((index * 3.37) % 12),
    z: 26 - ((index * 13.17) % 148),
    speed: 9 + (index % 5) * 1.3,
    length: 0.55 + (index % 4) * 0.16
  })), [count])
  const dummy = useMemo(() => new THREE.Object3D(), [])

  useFrame((_, delta) => {
    if (!mesh.current || reducedMotion) return
    drops.forEach((drop, index) => {
      drop.y -= drop.speed * delta
      if (drop.y < 0.18) drop.y = 9 + ((index * 1.77) % 5)
      dummy.position.set(drop.x, drop.y, drop.z)
      dummy.scale.set(1, drop.length, 1)
      dummy.updateMatrix()
      mesh.current?.setMatrixAt(index, dummy.matrix)
    })
    mesh.current.instanceMatrix.needsUpdate = true
  })

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, count]} frustumCulled={false}>
      <cylinderGeometry args={[0.006, 0.009, 1, 3]} />
      <meshBasicMaterial color="#a8b8b1" transparent opacity={0.14} depthWrite={false} />
    </instancedMesh>
  )
}

export function CityEnvironment({ quality, reducedMotion }: { quality: boolean; reducedMotion: boolean }) {
  const surfaceMap = useSurfaceNoise()
  return (
    <group>
      <WetStreet surfaceMap={surfaceMap} />
      {BUILDINGS.map((building) => <RuinedBuilding key={building.seed} building={building} surfaceMap={surfaceMap} />)}
      <PumpStationSet />
      <SolanaGateSet />
      <HangingCables />
      <DistantSkyline />
      <RustContainer position={[-9.7, 0, -58]} rotation={0.08} />
      <RustContainer position={[12.8, 0, -101]} rotation={-0.26} color="#334842" />
      <RustContainer position={[-13.4, 0, -107]} rotation={0.52} color="#4c3436" />
      {[
        [-7.2, 0, 12, 1], [7.3, 0, 1.5, 2], [-11.1, 0, -24, 3], [10.7, 0, -52, 4],
        [-5.8, 0, -72, 5], [8.1, 0, -83, 6], [-12, 0, -96, 7], [11.8, 0, -116, 8]
      ].map(([x, y, z, seed]) => <DebrisCluster key={seed} position={[x, y, z]} seed={seed} />)}
      <PaintedSign text="TRADE // LAUNCH // SURVIVE" position={[-8.15, 3.1, 2]} rotation={[0, Math.PI / 2, -0.03]} width={5.1} height={1.05} />
      <PaintedSign text="PAPER HANDS" position={[8.15, 2.8, -8]} rotation={[0, -Math.PI / 2, 0.04]} width={4.5} height={1.05} color="#c9cec8" secondary="#985cff" />
      <Rain quality={quality} reducedMotion={reducedMotion} />
    </group>
  )
}

export default CityEnvironment
