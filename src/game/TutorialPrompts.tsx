import { type MutableRefObject, useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useGameStore } from './GameState'

type Vector3Tuple = [number, number, number]

type TutorialPromptDefinition = {
  id: string
  phase: 'intro' | 'terminal'
  keyLabel: string
  action: string
  position: Vector3Tuple
  rotation?: Vector3Tuple
  width: number
  revealDistance: number
  completionZ?: number
  radialReveal?: boolean
  color?: string
}

export type TutorialPromptsProps = {
  playerPosition: MutableRefObject<THREE.Vector3>
  reducedMotion?: boolean
}

const PROMPTS: TutorialPromptDefinition[] = [
  {
    id: 'move-look',
    phase: 'intro',
    keyLabel: 'WASD',
    action: 'MOVE / MOUSE LOOK',
    position: [7.94, 1.82, 18.5],
    rotation: [0, -Math.PI / 2, 0],
    width: 2.5,
    revealDistance: 8,
    completionZ: 13
  },
  {
    id: 'combat',
    phase: 'intro',
    keyLabel: 'LMB / RMB',
    action: 'LIGHT / HEAVY',
    position: [-7.94, 1.82, 4.5],
    rotation: [0, Math.PI / 2, 0],
    width: 2.55,
    revealDistance: 8.5,
    completionZ: -2
  },
  {
    id: 'survival',
    phase: 'intro',
    keyLabel: 'SPACE / Q',
    action: 'DODGE / MEDKIT',
    position: [7.94, 1.82, -8],
    rotation: [0, -Math.PI / 2, 0],
    width: 2.55,
    revealDistance: 8.5,
    completionZ: -14
  },
  {
    id: 'terminal',
    phase: 'terminal',
    keyLabel: 'E',
    action: 'RESTORE SIGNAL',
    position: [0, 2.86, -60.48],
    width: 2.2,
    revealDistance: 9,
    radialReveal: true,
    color: '#32e6cf'
  }
]

function fitText(context: CanvasRenderingContext2D, text: string, maxWidth: number, initialSize: number) {
  let size = initialSize
  do {
    context.font = `800 ${size}px "Arial Narrow", Arial, sans-serif`
    if (context.measureText(text).width <= maxWidth) return size
    size -= 2
  } while (size > 20)
  return size
}

function createPromptTexture(keyLabel: string, action: string, color: string) {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 128
  const context = canvas.getContext('2d')

  if (context) {
    context.clearRect(0, 0, canvas.width, canvas.height)

    context.beginPath()
    context.moveTo(17, 8)
    context.lineTo(495, 8)
    context.lineTo(504, 17)
    context.lineTo(504, 103)
    context.lineTo(479, 120)
    context.lineTo(8, 120)
    context.lineTo(8, 25)
    context.closePath()
    context.fillStyle = 'rgba(8, 11, 9, 0.76)'
    context.fill()
    context.globalAlpha = 0.62
    context.strokeStyle = color
    context.lineWidth = 2
    context.stroke()
    context.globalAlpha = 1

    const keyWidth = Math.min(178, Math.max(78, keyLabel.length * 18 + 32))
    context.fillStyle = 'rgba(197, 200, 196, 0.07)'
    context.fillRect(21, 24, keyWidth, 80)
    context.strokeStyle = 'rgba(197, 200, 196, 0.22)'
    context.lineWidth = 2
    context.strokeRect(21, 24, keyWidth, 80)

    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.font = `900 ${fitText(context, keyLabel, keyWidth - 22, 34)}px "Arial Narrow", Arial, sans-serif`
    context.fillStyle = color
    context.shadowColor = color
    context.shadowBlur = 3
    context.fillText(keyLabel, 21 + keyWidth / 2, 65)
    context.shadowBlur = 0

    const actionStart = 34 + keyWidth
    const actionWidth = canvas.width - actionStart - 28
    context.font = `800 ${fitText(context, action, actionWidth, 32)}px "Arial Narrow", Arial, sans-serif`
    context.fillStyle = 'rgba(224, 230, 222, 0.9)'
    context.fillText(action, actionStart + actionWidth / 2, 65)

    context.strokeStyle = 'rgba(197, 200, 196, 0.09)'
    context.lineWidth = 1
    const scratches = [
      [238, 20, 267, 20],
      [310, 109, 355, 109],
      [406, 29, 475, 29],
      [119, 112, 164, 112]
    ]
    scratches.forEach(([x1, y1, x2, y2]) => {
      context.beginPath()
      context.moveTo(x1, y1)
      context.lineTo(x2, y2)
      context.stroke()
    })
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.generateMipmaps = false
  texture.minFilter = THREE.LinearFilter
  texture.magFilter = THREE.LinearFilter
  texture.needsUpdate = true
  return texture
}

function LocalPrompt({
  definition,
  active,
  playerPosition,
  reducedMotion
}: {
  definition: TutorialPromptDefinition
  active: boolean
  playerPosition: MutableRefObject<THREE.Vector3>
  reducedMotion: boolean
}) {
  const mesh = useRef<THREE.Mesh>(null)
  const material = useRef<THREE.MeshBasicMaterial>(null)
  const passed = useRef(false)
  const opacity = useRef(0)
  const color = definition.color ?? '#7dff48'
  const texture = useMemo(
    () => createPromptTexture(definition.keyLabel, definition.action, color),
    [color, definition.action, definition.keyLabel]
  )

  useEffect(() => () => texture.dispose(), [texture])

  useFrame(({ clock }, delta) => {
    if (definition.completionZ !== undefined && playerPosition.current.z < definition.completionZ) {
      passed.current = true
    }

    const zDistance = playerPosition.current.z - definition.position[2]
    const xDistance = playerPosition.current.x - definition.position[0]
    const distanceAlongRoute = definition.radialReveal
      ? Math.hypot(xDistance, zDistance)
      : Math.abs(zDistance)
    const fullVisibilityDistance = definition.revealDistance * 0.48
    const proximity = 1 - THREE.MathUtils.smoothstep(
      distanceAlongRoute,
      fullVisibilityDistance,
      definition.revealDistance
    )
    const targetOpacity = active && !passed.current ? proximity * 0.68 : 0
    const response = targetOpacity > opacity.current ? 6.5 : 4.2
    opacity.current = THREE.MathUtils.lerp(
      opacity.current,
      targetOpacity,
      1 - Math.exp(-response * Math.min(delta, 0.1))
    )

    if (material.current) {
      material.current.opacity = opacity.current
      material.current.visible = opacity.current > 0.006
    }
    if (mesh.current) {
      mesh.current.position.y = definition.position[1] + (
        reducedMotion ? 0 : Math.sin(clock.elapsedTime * 1.35 + definition.position[2] * 0.1) * 0.018
      )
    }
  })

  return (
    <mesh
      ref={mesh}
      position={definition.position}
      rotation={definition.rotation ?? [0, 0, 0]}
      renderOrder={3}
    >
      <planeGeometry args={[definition.width, definition.width / 4]} />
      <meshBasicMaterial
        ref={material}
        map={texture}
        transparent
        opacity={0}
        alphaTest={0.025}
        depthWrite={false}
        toneMapped
      />
    </mesh>
  )
}

export function TutorialPrompts({ playerPosition, reducedMotion = false }: TutorialPromptsProps) {
  const status = useGameStore((state) => state.status)
  const progression = useGameStore((state) => state.progression)
  const terminalRestored = useGameStore((state) => state.terminalRestored)
  const sessionId = useGameStore((state) => state.sessionId)
  const introActive = status === 'PLAYING' && progression === 'INTRO_COMBAT'
  const terminalActive = status === 'PLAYING' && progression === 'TERMINAL_READY' && !terminalRestored

  return (
    <group name="tutorial-prompts">
      {PROMPTS.map((definition) => (
        <LocalPrompt
          key={`${sessionId}-${definition.id}`}
          definition={definition}
          active={definition.phase === 'intro' ? introActive : terminalActive}
          playerPosition={playerPosition}
          reducedMotion={reducedMotion}
        />
      ))}
    </group>
  )
}

export default TutorialPrompts
