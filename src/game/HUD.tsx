import { useEffect, useRef, useState } from 'react'
import { useGameStore } from './GameState'
import { GAME_CONFIG } from './GameConfig'
import '../styles/game.css'

type MeterProps = {
  label: string
  value: number
  max: number
  tone: 'hp' | 'stamina' | 'wick' | 'boss'
  compact?: boolean
}

const clampPercent = (value: number, max: number) => Math.max(0, Math.min(100, (value / max) * 100))

function Meter({ label, value, max, tone, compact = false }: MeterProps) {
  const percent = clampPercent(value, max)

  return (
    <div
      className={`game-meter game-meter--${tone}${compact ? ' game-meter--compact' : ''}`}
      aria-label={`${label} ${Math.ceil(value)} of ${max}`}
    >
      <div className="game-meter__copy" aria-hidden="true">
        <span>{label}</span>
        <span>{Math.ceil(value)}</span>
      </div>
      <div className="game-meter__track">
        <span className="game-meter__ghost" style={{ width: `${percent}%` }} />
        <span className="game-meter__fill" style={{ width: `${percent}%` }} />
        <span className="game-meter__ticks" />
      </div>
    </div>
  )
}

function MedkitIcon() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <path d="M7 8h18l3 5-2 14H6L4 13l3-5Z" />
      <path d="M12 8V5h8v3M13 14h6v3h3v6h-3v3h-6v-3h-3v-6h3v-3Z" />
    </svg>
  )
}

function WickIcon() {
  return (
    <svg viewBox="0 0 36 36" aria-hidden="true" focusable="false">
      <path d="M17 2h2v7h-2zM17 27h2v7h-2z" />
      <path d="M11 9h14v18H11z" />
      <path d="m8 13 3-4v18l-3-4zM28 13l-3-4v18l3-4z" />
    </svg>
  )
}

export function HUD() {
  const status = useGameStore((state) => state.status)
  const hp = useGameStore((state) => state.hp)
  const stamina = useGameStore((state) => state.stamina)
  const wick = useGameStore((state) => state.wick)
  const medkits = useGameStore((state) => state.medkits)
  const objective = useGameStore((state) => state.objective)
  const interactionPrompt = useGameStore((state) => state.interactionPrompt)
  const message = useGameStore((state) => state.message)
  const bossActive = useGameStore((state) => state.bossActive)
  const bossHp = useGameStore((state) => state.bossHp)
  const bossMaxHp = useGameStore((state) => state.bossMaxHp)
  const combo = useGameStore((state) => state.combo)
  const surgeTime = useGameStore((state) => state.surgeTime)
  const previousHp = useRef(hp)
  const [damagePulse, setDamagePulse] = useState(false)

  useEffect(() => {
    if (hp < previousHp.current) {
      setDamagePulse(true)
      const timer = window.setTimeout(() => setDamagePulse(false), 420)
      previousHp.current = hp
      return () => window.clearTimeout(timer)
    }
    previousHp.current = hp
  }, [hp])

  if (status !== 'PLAYING' && status !== 'BOSS_INTRO') return null

  const hpCritical = hp <= 25
  const wickReady = wick >= GAME_CONFIG.player.maxWick
  const surgeActive = surgeTime > 0

  return (
    <div className={`game-hud${hpCritical ? ' game-hud--critical' : ''}`}>
      <div className="game-hud__noise" aria-hidden="true" />

      <section className="game-vitals" aria-label="Player status">
        <div className="game-vitals__identity">
          <span className="game-vitals__signal"><WickIcon /></span>
          <span>
            <strong>THE HOLDER</strong>
            <small>GREEN SIGNAL CARRIER</small>
          </span>
        </div>
        <Meter label="HP" value={hp} max={GAME_CONFIG.player.maxHp} tone="hp" />
        <Meter label="STAMINA" value={stamina} max={GAME_CONFIG.player.maxStamina} tone="stamina" />
        <div className={wickReady || surgeActive ? 'game-vitals__wick game-vitals__wick--active' : 'game-vitals__wick'}>
          <Meter label="WICK ENERGY" value={surgeActive ? GAME_CONFIG.player.maxWick : wick} max={GAME_CONFIG.player.maxWick} tone="wick" />
          {wickReady && !surgeActive && <kbd>F</kbd>}
          {surgeActive && <span className="game-vitals__surge-time">{surgeTime.toFixed(1)} SEC</span>}
        </div>
        <div className="game-medkits" aria-label={`${medkits} medkits remaining`}>
          <span className="game-medkits__icon"><MedkitIcon /></span>
          <span className="game-medkits__label">MEDKIT</span>
          <strong>{medkits}</strong>
          <kbd>Q</kbd>
        </div>
      </section>

      <section className="game-objective" aria-label="Current objective">
        <span>CURRENT OBJECTIVE</span>
        <strong>{objective}</strong>
      </section>

      {bossActive && (
        <section className="game-boss" aria-label={`The Paper King health ${Math.ceil(bossHp)} of ${bossMaxHp}`}>
          <div className="game-boss__title">
            <span>OLD SOLANA EXCHANGE</span>
            <strong>THE PAPER KING</strong>
          </div>
          <Meter label="BOSS HP" value={bossHp} max={bossMaxHp} tone="boss" compact />
        </section>
      )}

      {interactionPrompt && status === 'PLAYING' && (
        <div className="game-interaction" role="status">
          <span>{interactionPrompt}</span>
        </div>
      )}

      {message && (
        <div className={`game-signal-message${message === 'GREEN WICK ACTIVE' ? ' game-signal-message--surge' : ''}`} role="status">
          <WickIcon />
          <strong>{message}</strong>
        </div>
      )}

      {combo >= 2 && status === 'PLAYING' && (
        <div className="game-combo" aria-label={`${combo} hit combo`}>
          <strong>{combo}</strong>
          <span>HIT SIGNAL</span>
        </div>
      )}

      {(hpCritical || damagePulse) && (
        <div className={`game-damage-vignette${damagePulse ? ' game-damage-vignette--hit' : ''}`} aria-hidden="true" />
      )}
    </div>
  )
}

export default HUD
