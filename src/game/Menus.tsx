import { useEffect, useRef, useState } from 'react'
import { useGameStore, type FinalRank } from './GameState'
import '../styles/game.css'

const LOADING_TIPS = [
  'Heavy attacks interrupt most enemies',
  'Dodging briefly prevents damage',
  'Wick Surge increases damage for six seconds'
]

const CONTROLS = [
  ['WASD', 'Move'],
  ['Mouse', 'Camera'],
  ['Shift', 'Sprint'],
  ['Left Mouse', 'Light Attack'],
  ['Right Mouse', 'Heavy Attack'],
  ['Space', 'Dodge'],
  ['F', 'Wick Surge'],
  ['Q', 'Use Medkit'],
  ['E', 'Interact'],
  ['Esc', 'Pause']
]

const formatTime = (seconds: number | null) => {
  if (seconds === null || !Number.isFinite(seconds)) return '--:--'
  const wholeSeconds = Math.max(0, Math.floor(seconds))
  const minutes = Math.floor(wholeSeconds / 60)
  return `${String(minutes).padStart(2, '0')}:${String(wholeSeconds % 60).padStart(2, '0')}`
}

function WickMark() {
  return (
    <svg className="game-wick-mark" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <path className="game-wick-mark__paper" d="M7 10 22 3l12 5 18-3 6 15-5 13 5 18-20 9-13-4-17 3-3-17 5-12-3-20Z" />
      <path className="game-wick-mark__wick" d="M30 7h4v12h-4zM30 46h4v11h-4z" />
      <path className="game-wick-mark__candle" d="M22 18h20v29H22z" />
      <path className="game-wick-mark__edge" d="m22 18 5 4v20l-5 5zM42 18l-5 4v20l5 5z" />
    </svg>
  )
}

function SignalCorners() {
  return (
    <span className="game-signal-corners" aria-hidden="true">
      <i /><i /><i /><i />
    </span>
  )
}

function SettingsPanel() {
  const graphicsMode = useGameStore((state) => state.graphicsMode)
  const volume = useGameStore((state) => state.volume)
  const muted = useGameStore((state) => state.muted)
  const setGraphicsMode = useGameStore((state) => state.setGraphicsMode)
  const setVolume = useGameStore((state) => state.setVolume)
  const toggleMuted = useGameStore((state) => state.toggleMuted)

  return (
    <div className="game-settings" aria-label="Game settings">
      <fieldset className="game-settings__mode">
        <legend>GRAPHICS</legend>
        <button
          type="button"
          className={graphicsMode === 'PERFORMANCE' ? 'is-selected' : ''}
          aria-pressed={graphicsMode === 'PERFORMANCE'}
          onClick={() => setGraphicsMode('PERFORMANCE')}
        >
          PERFORMANCE
        </button>
        <button
          type="button"
          className={graphicsMode === 'QUALITY' ? 'is-selected' : ''}
          aria-pressed={graphicsMode === 'QUALITY'}
          onClick={() => setGraphicsMode('QUALITY')}
        >
          QUALITY
        </button>
      </fieldset>
      <div className="game-settings__audio">
        <label htmlFor="paperbane-volume">VOLUME <span>{muted ? 0 : Math.round(volume * 100)}</span></label>
        <input
          id="paperbane-volume"
          type="range"
          min="0"
          max="100"
          step="1"
          value={Math.round(volume * 100)}
          onChange={(event) => setVolume(Number(event.currentTarget.value) / 100)}
          aria-label="Game volume"
        />
        <button type="button" className="game-settings__mute" onClick={toggleMuted} aria-pressed={muted}>
          {muted ? 'UNMUTE' : 'MUTE'}
        </button>
      </div>
    </div>
  )
}

function useFocusTrap(active: boolean, ref: React.RefObject<HTMLElement>, close?: () => void) {
  useEffect(() => {
    if (!active || !ref.current) return
    const root = ref.current
    const selector = 'button:not([disabled]), a[href], input:not([disabled]), [tabindex]:not([tabindex="-1"])'
    const getFocusable = () => Array.from(root.querySelectorAll<HTMLElement>(selector))
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    window.setTimeout(() => getFocusable()[0]?.focus(), 0)

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && close) {
        event.preventDefault()
        event.stopPropagation()
        close()
        return
      }
      if (event.key !== 'Tab') return
      const focusable = getFocusable()
      if (!focusable.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      previous?.focus()
    }
  }, [active, close, ref])
}

type ControlsOverlayProps = {
  open: boolean
  onClose: () => void
}

function ControlsOverlay({ open, onClose }: ControlsOverlayProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  useFocusTrap(open, panelRef, onClose)

  if (!open) return null

  return (
    <div className="game-modal-layer" role="presentation">
      <div className="game-controls-panel" ref={panelRef} role="dialog" aria-modal="true" aria-labelledby="game-controls-title">
        <SignalCorners />
        <header>
          <span>FIELD MANUAL 01</span>
          <h2 id="game-controls-title">CONTROLS</h2>
        </header>
        <div className="game-controls-grid">
          {CONTROLS.map(([key, action]) => (
            <div className="game-control-row" key={key}>
              <kbd>{key}</kbd>
              <span>{action}</span>
            </div>
          ))}
        </div>
        <div className="game-controls-notes">
          <p>Heavy attacks interrupt most enemies</p>
          <p>Dodging briefly prevents damage</p>
          <p>Wick Surge increases damage for six seconds</p>
        </div>
        <button type="button" className="game-menu-button game-menu-button--primary" onClick={onClose}>BACK</button>
      </div>
    </div>
  )
}

function LoadingScreen({ progress }: { progress: number }) {
  const [tipIndex, setTipIndex] = useState(0)

  useEffect(() => {
    const timer = window.setInterval(() => setTipIndex((index) => (index + 1) % LOADING_TIPS.length), 3200)
    return () => window.clearInterval(timer)
  }, [])

  const safeProgress = Math.max(0, Math.min(100, progress))

  return (
    <div className="game-loading" role="status" aria-live="polite" aria-label={`Entering Blackwick ${Math.round(safeProgress)} percent loaded`}>
      <img src="/assets/paperbane-avatar.png" alt="The Holder carrying the green candlestick weapon in Blackwick" />
      <div className="game-loading__shade" aria-hidden="true" />
      <div className="game-loading__scanlines" aria-hidden="true" />
      <div className="game-loading__content">
        <WickMark />
        <p className="game-loading__eyebrow">BLACKWICK SIGNAL 77</p>
        <h1>ENTERING BLACKWICK</h1>
        <div className="game-loading__bar" aria-hidden="true">
          <span style={{ width: `${safeProgress}%` }} />
        </div>
        <div className="game-loading__progress">
          <span>WORLD STREAM</span>
          <strong>{Math.round(safeProgress)}%</strong>
        </div>
        <p className="game-loading__tip"><span>FIELD NOTE</span>{LOADING_TIPS[tipIndex]}</p>
      </div>
    </div>
  )
}

function MenuBrand({ section }: { section: string }) {
  return (
    <div className="game-menu-brand">
      <WickMark />
      <span className="game-menu-brand__section">{section}</span>
      <h1>PAPERBANE</h1>
      <p>HOLD THE WICK</p>
    </div>
  )
}

function MainMenu({ onControls }: { onControls: () => void }) {
  const checkpoint = useGameStore((state) => state.checkpoint)
  const bestTime = useGameStore((state) => state.bestTime)
  const bestRank = useGameStore((state) => state.bestRank)
  const startGame = useGameStore((state) => state.startGame)
  const continueGame = useGameStore((state) => state.continueGame)

  return (
    <div className="game-menu-screen game-menu-screen--main" role="main">
      <div className="game-menu-backdrop" aria-hidden="true">
        <img src="/assets/paper-city.png" alt="" />
        <span className="game-menu-backdrop__fog" />
        <span className="game-menu-backdrop__figure game-menu-backdrop__figure--one" />
        <span className="game-menu-backdrop__figure game-menu-backdrop__figure--two" />
      </div>
      <div className="game-menu-frame">
        <SignalCorners />
        <MenuBrand section="BLACKWICK ACCESS" />
        <nav className="game-menu-actions" aria-label="Game menu">
          <button type="button" className="game-menu-button game-menu-button--primary" onClick={() => startGame(false)} autoFocus>START GAME</button>
          {checkpoint && <button type="button" className="game-menu-button" onClick={continueGame}>CONTINUE</button>}
          <button type="button" className="game-menu-button" onClick={onControls}>CONTROLS</button>
          <a className="game-menu-button" href="/">RETURN TO SITE</a>
        </nav>
        <SettingsPanel />
        {(bestTime !== null || bestRank !== null) && (
          <div className="game-record" aria-label="Best signal record">
            <span>BEST SIGNAL</span>
            <strong>{formatTime(bestTime)}</strong>
            <b>{bestRank ?? 'D'}</b>
          </div>
        )}
        <p className="game-menu-build">PBANE // SOLANA // GAME ONLINE</p>
      </div>
    </div>
  )
}

function PauseMenu({ onControls, trapActive }: { onControls: () => void; trapActive: boolean }) {
  const resume = useGameStore((state) => state.resume)
  const restartCheckpoint = useGameStore((state) => state.restartCheckpoint)
  const returnToMenu = useGameStore((state) => state.returnToMenu)
  const panelRef = useRef<HTMLDivElement>(null)
  useFocusTrap(trapActive, panelRef, resume)

  return (
    <div className="game-overlay game-overlay--pause" role="dialog" aria-modal="true" aria-labelledby="pause-title">
      <div className="game-overlay__panel" ref={panelRef}>
        <SignalCorners />
        <span className="game-overlay__code">SIGNAL SUSPENDED</span>
        <h1 id="pause-title">PAUSED</h1>
        <nav className="game-menu-actions" aria-label="Pause menu">
          <button type="button" className="game-menu-button game-menu-button--primary" onClick={resume} autoFocus>RESUME</button>
          <button type="button" className="game-menu-button" onClick={onControls}>CONTROLS</button>
          <button type="button" className="game-menu-button" onClick={restartCheckpoint}>RESTART CHECKPOINT</button>
          <button type="button" className="game-menu-button" onClick={returnToMenu}>RETURN TO MAIN MENU</button>
          <a className="game-menu-button" href="/">RETURN TO SITE</a>
        </nav>
        <SettingsPanel />
      </div>
    </div>
  )
}

function DeathScreen() {
  const checkpoint = useGameStore((state) => state.checkpoint)
  const restartCheckpoint = useGameStore((state) => state.restartCheckpoint)
  const returnToMenu = useGameStore((state) => state.returnToMenu)
  const panelRef = useRef<HTMLDivElement>(null)
  useFocusTrap(true, panelRef)

  return (
    <div className="game-overlay game-overlay--death" role="dialog" aria-modal="true" aria-labelledby="death-title">
      <div className="game-death-fog" aria-hidden="true" />
      <div className="game-overlay__panel" ref={panelRef}>
        <span className="game-overlay__code">GREEN SIGNAL LOST</span>
        <h1 id="death-title">YOUR HANDS TURNED TO PAPER</h1>
        <p>{checkpoint ? 'THE CHECKPOINT SIGNAL REMAINS' : 'THE FOG RETURNS YOU TO THE STREET'}</p>
        <nav className="game-menu-actions" aria-label="Death menu">
          <button type="button" className="game-menu-button game-menu-button--primary" onClick={restartCheckpoint} autoFocus>RETRY FROM CHECKPOINT</button>
          <button type="button" className="game-menu-button" onClick={returnToMenu}>RETURN TO MENU</button>
        </nav>
      </div>
    </div>
  )
}

type VictoryStatProps = {
  label: string
  value: string | number
}

function VictoryStat({ label, value }: VictoryStatProps) {
  return (
    <div className="game-victory-stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function VictoryScreen() {
  const gameTime = useGameStore((state) => state.gameTime)
  const killCount = useGameStore((state) => state.killCount)
  const damageTaken = useGameStore((state) => state.damageTaken)
  const medkitsUsed = useGameStore((state) => state.medkitsUsed)
  const maxCombo = useGameStore((state) => state.maxCombo)
  const finalRank = useGameStore((state) => state.finalRank)
  const bestTime = useGameStore((state) => state.bestTime)
  const bestRank = useGameStore((state) => state.bestRank)
  const startGame = useGameStore((state) => state.startGame)
  const panelRef = useRef<HTMLDivElement>(null)
  useFocusTrap(true, panelRef)

  return (
    <div className="game-overlay game-overlay--victory" role="dialog" aria-modal="true" aria-labelledby="victory-title">
      <div className="game-victory-rays" aria-hidden="true" />
      <div className="game-overlay__panel game-overlay__panel--victory" ref={panelRef}>
        <WickMark />
        <span className="game-overlay__code">GREEN SIGNAL 100</span>
        <h1 id="victory-title">THE SIGNAL IS RESTORED</h1>
        <p className="game-victory-subtitle">THE MARKET IS STILL WATCHING</p>
        <div className="game-victory-layout">
          <div className="game-victory-stats" aria-label="Final statistics">
            <VictoryStat label="COMPLETION TIME" value={formatTime(gameTime)} />
            <VictoryStat label="PAPER HANDS DEFEATED" value={killCount} />
            <VictoryStat label="DAMAGE TAKEN" value={Math.round(damageTaken)} />
            <VictoryStat label="MEDKITS USED" value={medkitsUsed} />
            <VictoryStat label="MAXIMUM COMBO" value={maxCombo} />
          </div>
          <div className="game-final-rank" aria-label={`Final rank ${finalRank}`}>
            <span>FINAL RANK</span>
            <strong data-rank={finalRank satisfies FinalRank}>{finalRank}</strong>
            <small>BEST {bestRank ?? finalRank} // {formatTime(bestTime)}</small>
          </div>
        </div>
        <nav className="game-menu-actions game-menu-actions--horizontal" aria-label="Victory menu">
          <button type="button" className="game-menu-button game-menu-button--primary" onClick={() => startGame(false)} autoFocus>PLAY AGAIN</button>
          <a className="game-menu-button" href="/">RETURN TO SITE</a>
          <a className="game-menu-button" href="https://t.me" target="_blank" rel="noopener noreferrer">JOIN THE COMMUNITY</a>
        </nav>
      </div>
    </div>
  )
}

function BossIntro() {
  return (
    <div className="game-boss-intro" role="status" aria-live="assertive">
      <span>OLD SOLANA EXCHANGE</span>
      <h1>THE PAPER KING</h1>
      <p>SELL SIGNAL CORRUPTED</p>
    </div>
  )
}

function TouchGate({ open, onTryGame }: { open: boolean; onTryGame: () => void }) {
  const panelRef = useRef<HTMLDivElement>(null)
  useFocusTrap(open, panelRef)

  if (!open) return null

  return (
    <div className="game-touch-gate" role="dialog" aria-modal="true" aria-labelledby="touch-gate-title">
      <div className="game-touch-gate__panel" ref={panelRef}>
        <WickMark />
        <span>INPUT SIGNAL WARNING</span>
        <h1 id="touch-gate-title">DESKTOP RECOMMENDED</h1>
        <p>PaperBane is designed for keyboard and mouse</p>
        <div className="game-menu-actions">
          <a className="game-menu-button" href="/">CONTINUE TO SITE</a>
          <button type="button" className="game-menu-button game-menu-button--primary" onClick={onTryGame}>TRY GAME ANYWAY</button>
        </div>
      </div>
    </div>
  )
}

export function Menus() {
  const status = useGameStore((state) => state.status)
  const loadingProgress = useGameStore((state) => state.loadingProgress)
  const [controlsOpen, setControlsOpen] = useState(false)
  const [touchGateOpen, setTouchGateOpen] = useState(false)

  useEffect(() => {
    const coarsePointer = window.matchMedia('(pointer: coarse)').matches
    if (coarsePointer || navigator.maxTouchPoints > 0) setTouchGateOpen(true)
  }, [])

  useEffect(() => {
    setControlsOpen(false)
  }, [status])

  return (
    <>
      {status === 'LOADING' && <LoadingScreen progress={loadingProgress} />}
      {status === 'MAIN_MENU' && <MainMenu onControls={() => setControlsOpen(true)} />}
      {status === 'PAUSED' && <PauseMenu onControls={() => setControlsOpen(true)} trapActive={!controlsOpen} />}
      {status === 'PLAYER_DEAD' && <DeathScreen />}
      {status === 'BOSS_INTRO' && <BossIntro />}
      {status === 'VICTORY' && <VictoryScreen />}
      <ControlsOverlay open={controlsOpen} onClose={() => setControlsOpen(false)} />
      <TouchGate open={touchGateOpen} onTryGame={() => setTouchGateOpen(false)} />
    </>
  )
}

export default Menus
