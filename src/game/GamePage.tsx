import { Component, type ErrorInfo, type ReactNode, useEffect } from 'react'
import { Canvas } from '@react-three/fiber'
import GameWorld from './GameWorld'
import { HUD } from './HUD'
import { Menus } from './Menus'
import { AudioSystem } from './AudioSystem'
import { useGameStore } from './GameState'
import '../styles/game.css'

interface BoundaryState {
  failed: boolean
}

class GameBoundary extends Component<{ children: ReactNode }, BoundaryState> {
  state: BoundaryState = { failed: false }

  static getDerivedStateFromError(): BoundaryState {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (import.meta.env.DEV) console.error('PaperBane scene failed', error, info)
  }

  render() {
    if (this.state.failed) {
      return (
        <main className="game-fallback">
          <div className="game-fallback__panel">
            <span>GREEN SIGNAL LOST</span>
            <h1>WEBGL REQUIRED</h1>
            <p>Enable hardware acceleration in a modern desktop browser to enter Blackwick</p>
            <a href="/">RETURN TO SITE</a>
          </div>
        </main>
      )
    }
    return this.props.children
  }
}

export default function GamePage() {
  const graphicsMode = useGameStore((state) => state.graphicsMode)
  const status = useGameStore((state) => state.status)
  const setLoadingProgress = useGameStore((state) => state.setLoadingProgress)
  const showMainMenu = useGameStore((state) => state.showMainMenu)

  useEffect(() => {
    document.body.classList.add('game-active')
    return () => document.body.classList.remove('game-active')
  }, [])

  useEffect(() => {
    if (status !== 'LOADING') return
    let progress = 0
    const interval = window.setInterval(() => {
      progress = Math.min(100, progress + 7 + Math.random() * 10)
      setLoadingProgress(progress)
      if (progress >= 100) {
        window.clearInterval(interval)
        window.setTimeout(showMainMenu, 280)
      }
    }, 115)
    return () => window.clearInterval(interval)
  }, [setLoadingProgress, showMainMenu, status])

  return (
    <GameBoundary>
      <main
        className={`game-page game-page--${graphicsMode.toLowerCase()}`}
        onContextMenu={(event) => event.preventDefault()}
      >
        <Canvas
          shadows={graphicsMode === 'QUALITY'}
          dpr={graphicsMode === 'QUALITY' ? [1, 1.5] : 1}
          gl={{ antialias: graphicsMode === 'QUALITY', powerPreference: 'high-performance', alpha: false }}
          camera={{ fov: 54, near: 0.1, far: 155, position: [0, 5, 30] }}
        >
          <GameWorld />
        </Canvas>
        <div className="game-postfx" aria-hidden="true" />
        <HUD />
        <Menus />
        <AudioSystem />
      </main>
    </GameBoundary>
  )
}
