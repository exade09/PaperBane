import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Float } from '@react-three/drei'
import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'

const buildings = [
  { x: -6.4, z: -3, width: 4.6, height: 7.5, depth: 5, color: '#161a18' },
  { x: -7.1, z: -10, width: 5.4, height: 10, depth: 5, color: '#101311' },
  { x: -6.3, z: -18, width: 4.5, height: 8.4, depth: 5, color: '#191c1a' },
  { x: 6.6, z: -3, width: 4.2, height: 8.7, depth: 5, color: '#171917' },
  { x: 7.1, z: -11, width: 5, height: 6.5, depth: 5, color: '#111411' },
  { x: 6.2, z: -18, width: 4.3, height: 10.5, depth: 5, color: '#151816' },
]

const debris = [
  [-3.5, 0.12, -2.2, 0.8, 0.2, 0.45, 0.2],
  [2.9, 0.14, -4.6, 1.1, 0.26, 0.5, -0.4],
  [-2.7, 0.1, -9.5, 0.7, 0.16, 0.35, 0.6],
  [3.8, 0.13, -13, 1.2, 0.22, 0.45, 0.1],
  [-1.8, 0.1, -16, 0.8, 0.14, 0.34, -0.8],
] as const

function useReducedMotion() {
  const [reduced, setReduced] = useState(false)

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReduced(query.matches)
    update()
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])

  return reduced
}

function CinematicCamera({ reducedMotion }: { reducedMotion: boolean }) {
  const { camera } = useThree()
  const target = useMemo(() => new THREE.Vector3(), [])

  useFrame(({ clock }, delta) => {
    const time = reducedMotion ? 0 : clock.elapsedTime
    target.set(Math.sin(time * 0.12) * 0.32, 4.7 + Math.cos(time * 0.15) * 0.08, 11.5)
    camera.position.lerp(target, 1 - Math.exp(-delta * 1.8))
    camera.lookAt(Math.sin(time * 0.1) * 0.18, 2.15, -6.2)
  })

  return null
}

function Building({
  x,
  z,
  width,
  height,
  depth,
  color,
}: (typeof buildings)[number]) {
  const windowRows = Math.max(2, Math.floor(height / 2.5))
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, height / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[width, height, depth]} />
        <meshStandardMaterial color={color} roughness={0.95} flatShading />
      </mesh>
      <mesh position={[width * (x < 0 ? 0.49 : -0.49), height * 0.84, 0.3]} rotation={[0, 0, x < 0 ? -0.08 : 0.08]}>
        <boxGeometry args={[0.18, 1.5, depth * 0.84]} />
        <meshStandardMaterial color="#242826" roughness={1} />
      </mesh>
      {Array.from({ length: windowRows }, (_, row) => (
        <group key={row} position={[x < 0 ? width / 2 + 0.011 : -width / 2 - 0.011, 1.5 + row * 2.05, 0]}>
          {[-1.25, 0, 1.25].map((windowZ, index) => (
            <mesh key={index} rotation={[0, Math.PI / 2, 0]} position={[0, 0, windowZ]}>
              <planeGeometry args={[0.7, 0.8]} />
              <meshBasicMaterial
                color={row === 1 && index === 1 ? (x < 0 ? '#32E6CF' : '#985CFF') : '#343a37'}
                transparent
                opacity={row === 1 && index === 1 ? 0.42 : 0.2}
              />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  )
}

function BrokenCar({ position, rotation = 0 }: { position: [number, number, number]; rotation?: number }) {
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <mesh position={[0, 0.52, 0]} castShadow>
        <boxGeometry args={[2.2, 0.55, 1.05]} />
        <meshStandardMaterial color="#202522" roughness={0.8} metalness={0.35} flatShading />
      </mesh>
      <mesh position={[-0.2, 0.92, 0]} rotation={[0, 0, -0.06]}>
        <boxGeometry args={[1.18, 0.48, 0.92]} />
        <meshStandardMaterial color="#151917" roughness={0.9} flatShading />
      </mesh>
      {[-0.72, 0.74].map((x) =>
        [-0.52, 0.52].map((z) => (
          <mesh key={`${x}-${z}`} position={[x, 0.32, z]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.27, 0.27, 0.16, 8]} />
            <meshStandardMaterial color="#080a09" roughness={1} />
          </mesh>
        )),
      )}
    </group>
  )
}

function StreetLight({ x, z, color = '#7DFF48' }: { x: number; z: number; color?: string }) {
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 2.4, 0]}>
        <cylinderGeometry args={[0.06, 0.09, 4.8, 6]} />
        <meshStandardMaterial color="#252a27" metalness={0.65} roughness={0.6} />
      </mesh>
      <mesh position={[x < 0 ? 0.36 : -0.36, 4.75, 0]} rotation={[0, 0, x < 0 ? -Math.PI / 2 : Math.PI / 2]}>
        <cylinderGeometry args={[0.05, 0.05, 0.72, 6]} />
        <meshStandardMaterial color="#252a27" metalness={0.65} />
      </mesh>
      <mesh position={[x < 0 ? 0.69 : -0.69, 4.68, 0]}>
        <boxGeometry args={[0.38, 0.16, 0.28]} />
        <meshBasicMaterial color={color} />
      </mesh>
    </group>
  )
}

function PumpSign({ reducedMotion }: { reducedMotion: boolean }) {
  const light = useRef<THREE.PointLight>(null)

  useFrame(({ clock }) => {
    if (!light.current || reducedMotion) return
    const pulse = Math.sin(clock.elapsedTime * 7.2) > 0.88 ? 0.75 : 1
    light.current.intensity = 2.1 * pulse
  })

  return (
    <group position={[4.65, 3.7, -4.1]} rotation={[0, -0.1, -0.035]}>
      <mesh>
        <boxGeometry args={[2.8, 1.35, 0.22]} />
        <meshStandardMaterial color="#111512" roughness={0.92} metalness={0.2} />
      </mesh>
      <mesh position={[0, 0, 0.13]}>
        <planeGeometry args={[2.55, 1.12]} />
        <meshBasicMaterial color="#142319" />
      </mesh>
      <group position={[-0.76, 0, 0.145]} rotation={[0, 0, -0.68]}>
        <mesh>
          <boxGeometry args={[0.68, 0.34, 0.05]} />
          <meshBasicMaterial color="#7DFF48" />
        </mesh>
        <mesh position={[0.25, 0, 0.01]}>
          <boxGeometry args={[0.34, 0.34, 0.06]} />
          <meshBasicMaterial color="#C5C8C4" />
        </mesh>
      </group>
      {[-0.1, 0.25, 0.6, 0.95].map((x, index) => (
        <mesh key={x} position={[x, index % 2 ? 0.12 : -0.12, 0.145]}>
          <boxGeometry args={[0.22, 0.13, 0.04]} />
          <meshBasicMaterial color="#7DFF48" />
        </mesh>
      ))}
      <pointLight ref={light} position={[0, 0, 0.8]} color="#7DFF48" intensity={2.1} distance={5.5} />
    </group>
  )
}

function BrokenFence({ position, rotation = 0 }: { position: [number, number, number]; rotation?: number }) {
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      {[-1.25, 0, 1.25].map((x, index) => (
        <mesh key={x} position={[x, 1.1 - index * 0.05, 0]} rotation={[0, 0, index === 2 ? 0.08 : -0.025]}>
          <cylinderGeometry args={[0.055, 0.07, 2.25, 5]} />
          <meshStandardMaterial color="#3a3e39" metalness={0.6} roughness={0.78} />
        </mesh>
      ))}
      {[0.55, 1.55].map((y, index) => (
        <mesh key={y} position={[index ? 0.14 : -0.08, y, 0]} rotation={[0, 0, index ? 0.04 : -0.03]}>
          <boxGeometry args={[2.65, 0.055, 0.055]} />
          <meshStandardMaterial color="#444943" metalness={0.65} roughness={0.74} />
        </mesh>
      ))}
    </group>
  )
}

function CandlestickWeapon() {
  return (
    <group position={[0.92, 1.8, 0.24]} rotation={[0.15, 0.06, -0.68]}>
      <mesh castShadow>
        <boxGeometry args={[0.3, 1.72, 0.3]} />
        <meshStandardMaterial color="#7DFF48" emissive="#55FF25" emissiveIntensity={1.8} roughness={0.35} flatShading />
      </mesh>
      <mesh position={[0, -1.04, 0]}>
        <cylinderGeometry args={[0.09, 0.09, 0.48, 6]} />
        <meshStandardMaterial color="#151917" roughness={0.8} />
      </mesh>
      <mesh position={[0, 1.08, 0]}>
        <cylinderGeometry args={[0.045, 0.045, 0.46, 5]} />
        <meshBasicMaterial color="#A8FF87" />
      </mesh>
      <pointLight color="#7DFF48" intensity={2.6} distance={4.5} />
    </group>
  )
}

function Holder({ reducedMotion }: { reducedMotion: boolean }) {
  const group = useRef<THREE.Group>(null)

  useFrame(({ clock }) => {
    if (!group.current || reducedMotion) return
    group.current.position.y = Math.sin(clock.elapsedTime * 1.35) * 0.025
  })

  return (
    <group ref={group} position={[0, 0, 2.25]} rotation={[0, Math.PI + 0.03, 0]}>
      <mesh position={[0, 3.48, 0]} castShadow>
        <dodecahedronGeometry args={[0.48, 0]} />
        <meshStandardMaterial color="#6c5748" roughness={1} flatShading />
      </mesh>
      {[-0.23, 0, 0.22].map((x, index) => (
        <mesh key={x} position={[x, 3.83 + (index === 1 ? 0.07 : 0), -0.03]} rotation={[0.2, 0, x * 0.5]}>
          <dodecahedronGeometry args={[0.3, 0]} />
          <meshStandardMaterial color="#111311" roughness={1} flatShading />
        </mesh>
      ))}
      <mesh position={[0, 2.48, 0]} castShadow>
        <boxGeometry args={[1.18, 1.58, 0.58]} />
        <meshStandardMaterial color="#242725" roughness={0.96} flatShading />
      </mesh>
      <mesh position={[0, 3.22, -0.32]} rotation={[0.18, 0, 0]}>
        <boxGeometry args={[0.74, 0.16, 0.08]} />
        <meshStandardMaterial color="#7DFF48" emissive="#2D6A35" emissiveIntensity={0.85} />
      </mesh>
      <mesh position={[0, 1.72, -0.31]}>
        <boxGeometry args={[1.08, 0.12, 0.08]} />
        <meshStandardMaterial color="#7DFF48" emissive="#2D6A35" emissiveIntensity={0.75} />
      </mesh>
      {[-0.48, 0.48].map((x) => (
        <mesh key={x} position={[x, 2.45, -0.315]}>
          <boxGeometry args={[0.09, 1.3, 0.08]} />
          <meshStandardMaterial color="#58b93f" emissive="#2D6A35" emissiveIntensity={0.55} />
        </mesh>
      ))}
      <mesh position={[-0.18, 2.65, -0.325]}>
        <boxGeometry args={[0.16, 0.16, 0.07]} />
        <meshBasicMaterial color="#985CFF" />
      </mesh>
      <mesh position={[-0.72, 2.45, 0]} rotation={[0, 0, -0.08]} castShadow>
        <cylinderGeometry args={[0.17, 0.21, 1.5, 6]} />
        <meshStandardMaterial color="#202321" roughness={1} flatShading />
      </mesh>
      <mesh position={[0.73, 2.45, 0]} rotation={[0, 0, 0.15]} castShadow>
        <cylinderGeometry args={[0.17, 0.21, 1.5, 6]} />
        <meshStandardMaterial color="#202321" roughness={1} flatShading />
      </mesh>
      {[-0.33, 0.33].map((x) => (
        <group key={x} position={[x, 0.9, 0]}>
          <mesh position={[0, 0.18, 0]} castShadow>
            <cylinderGeometry args={[0.24, 0.28, 1.55, 6]} />
            <meshStandardMaterial color="#191c1a" roughness={1} flatShading />
          </mesh>
          <mesh position={[0, -0.72, 0.08]} castShadow>
            <boxGeometry args={[0.52, 0.42, 0.82]} />
            <meshStandardMaterial color="#171511" roughness={1} flatShading />
          </mesh>
        </group>
      ))}
      <CandlestickWeapon />
    </group>
  )
}

function PaperHand({
  position,
  scale = 1,
  runner = false,
  reducedMotion,
}: {
  position: [number, number, number]
  scale?: number
  runner?: boolean
  reducedMotion: boolean
}) {
  const group = useRef<THREE.Group>(null)

  useFrame(({ clock }) => {
    if (!group.current || reducedMotion) return
    group.current.rotation.z = Math.sin(clock.elapsedTime * (runner ? 1.6 : 0.7) + position[0]) * 0.025
  })

  return (
    <group ref={group} position={position} scale={scale} rotation={[0, runner ? -0.15 : 0.1, 0]}>
      <mesh position={[0, 2.75, 0]}>
        <dodecahedronGeometry args={[0.38, 0]} />
        <meshStandardMaterial color="#575d57" roughness={1} flatShading />
      </mesh>
      <mesh position={[0, 1.9, 0]} rotation={[0, 0, runner ? 0.18 : -0.08]}>
        <boxGeometry args={[0.92, 1.3, 0.45]} />
        <meshStandardMaterial color="#272b28" roughness={1} flatShading />
      </mesh>
      <mesh position={[0, 2, 0.24]}>
        <planeGeometry args={[0.54, 0.15]} />
        <meshBasicMaterial color="#C5C8C4" transparent opacity={0.46} />
      </mesh>
      <mesh position={[-0.62, 1.82, 0]} rotation={[0.1, 0, -0.28]}>
        <cylinderGeometry args={[0.11, 0.14, 1.28, 5]} />
        <meshStandardMaterial color="#4b504b" roughness={1} flatShading />
      </mesh>
      <mesh position={[0.63, 1.95, 0]} rotation={[0, 0, runner ? -0.55 : 0.22]}>
        <cylinderGeometry args={[0.11, 0.14, 1.4, 5]} />
        <meshStandardMaterial color="#4b504b" roughness={1} flatShading />
      </mesh>
      {[-0.24, 0.24].map((x) => (
        <group key={x} position={[x, 0.7, 0]} rotation={[0, 0, x * (runner ? 0.7 : 0.15)]}>
          <mesh>
            <cylinderGeometry args={[0.15, 0.18, 1.45, 5]} />
            <meshStandardMaterial color="#1c1f1d" roughness={1} flatShading />
          </mesh>
          <mesh position={[0, -0.75, 0.12]}>
            <boxGeometry args={[0.36, 0.25, 0.66]} />
            <meshStandardMaterial color="#101211" roughness={1} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

function MovingFog({ reducedMotion }: { reducedMotion: boolean }) {
  const group = useRef<THREE.Group>(null)
  const wisps = useMemo(
    () => [
      [-3.8, 1.2, -1, 3.6],
      [3, 1.6, -5, 4.7],
      [-1, 2.3, -9, 5.5],
      [4, 1.1, -13, 3.8],
      [-4, 2, -16, 5],
      [0, 1, -20, 6],
    ] as const,
    [],
  )

  useFrame(({ clock }) => {
    if (!group.current || reducedMotion) return
    group.current.position.x = Math.sin(clock.elapsedTime * 0.11) * 1.2
  })

  return (
    <group ref={group}>
      {wisps.map(([x, y, z, size], index) => (
        <mesh key={index} position={[x, y, z]} scale={[size, size * 0.32, size * 0.7]}>
          <sphereGeometry args={[1, 8, 5]} />
          <meshBasicMaterial color="#788078" transparent opacity={0.035 + index * 0.004} depthWrite={false} />
        </mesh>
      ))}
    </group>
  )
}

function Scene({ reducedMotion }: { reducedMotion: boolean }) {
  return (
    <>
      <color attach="background" args={['#090b0a']} />
      <fog attach="fog" args={['#5E625E', 8, 38]} />
      <ambientLight intensity={0.45} color="#8a918a" />
      <directionalLight position={[-4, 10, 8]} color="#b9c2b8" intensity={1.4} castShadow shadow-mapSize={[512, 512]} />
      <pointLight position={[-4, 4.5, -6]} color="#32E6CF" intensity={3.2} distance={12} />
      <pointLight position={[5, 4, -11]} color="#985CFF" intensity={3.8} distance={13} />
      <CinematicCamera reducedMotion={reducedMotion} />

      <mesh position={[0, -0.04, -10]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[12, 34, 2, 8]} />
        <meshStandardMaterial color="#151917" roughness={0.27} metalness={0.34} flatShading />
      </mesh>
      <mesh position={[0, 0.001, -6]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.13, 24]} />
        <meshBasicMaterial color="#616761" transparent opacity={0.18} />
      </mesh>
      {[-2.5, 2.3, -0.8].map((x, index) => (
        <mesh key={x} position={[x, 0.012, -2 - index * 5.5]} rotation={[-Math.PI / 2, 0, 0]} scale={[1.8, 0.55 + index * 0.2, 1]}>
          <circleGeometry args={[1, 12]} />
          <meshBasicMaterial color={index === 1 ? '#392d54' : '#17362f'} transparent opacity={0.35} />
        </mesh>
      ))}
      {buildings.map((building) => <Building key={`${building.x}-${building.z}`} {...building} />)}
      {debris.map(([x, y, z, width, height, depth, rotation], index) => (
        <mesh key={index} position={[x, y, z]} rotation={[0, rotation, 0]} castShadow>
          <boxGeometry args={[width, height, depth]} />
          <meshStandardMaterial color="#30342f" roughness={1} flatShading />
        </mesh>
      ))}
      <BrokenCar position={[-3.2, 0, -6.8]} rotation={0.23} />
      <BrokenCar position={[3.15, 0, -15]} rotation={-0.34} />
      <StreetLight x={-4.25} z={-1.2} />
      <StreetLight x={4.15} z={-9} color="#985CFF" />
      <PumpSign reducedMotion={reducedMotion} />
      <BrokenFence position={[-4.55, 0, -11.8]} rotation={Math.PI / 2} />
      <BrokenFence position={[4.5, 0, -2.2]} rotation={Math.PI / 2} />
      <Holder reducedMotion={reducedMotion} />
      <PaperHand position={[-1.75, 0, -7.2]} scale={0.92} reducedMotion={reducedMotion} />
      <PaperHand position={[1.7, 0, -9.4]} scale={1.05} runner reducedMotion={reducedMotion} />
      <PaperHand position={[0.15, 0, -14]} scale={1.18} reducedMotion={reducedMotion} />
      <MovingFog reducedMotion={reducedMotion} />
      <Float speed={reducedMotion ? 0 : 0.8} floatIntensity={reducedMotion ? 0 : 0.18} rotationIntensity={0.05}>
        <mesh position={[4.15, 1.1, -5]} rotation={[0.2, 0.4, 0.7]}>
          <planeGeometry args={[0.3, 0.42]} />
          <meshBasicMaterial color="#9da29c" side={THREE.DoubleSide} transparent opacity={0.38} />
        </mesh>
      </Float>
    </>
  )
}

export default function CinematicHeroScene() {
  const reducedMotion = useReducedMotion()

  return (
    <div className="pb-hero-scene" aria-hidden="true">
      <Canvas
        camera={{ fov: 45, near: 0.1, far: 60, position: [0, 4.7, 11.5] }}
        dpr={[1, 1.45]}
        shadows
        gl={{ antialias: false, alpha: false, powerPreference: 'high-performance' }}
      >
        <Suspense fallback={null}>
          <Scene reducedMotion={reducedMotion} />
        </Suspense>
      </Canvas>
    </div>
  )
}
