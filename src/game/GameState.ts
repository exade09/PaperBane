import { create } from 'zustand'
import { GAME_CONFIG, GameStatus, GraphicsMode, OBJECTIVES } from './GameConfig'

const CHECKPOINT_KEY = 'paperbane-checkpoint'
const CHECKPOINT_STATS_KEY = 'paperbane-checkpoint-stats'
const BEST_TIME_KEY = 'paperbane-best-time'
const BEST_RANK_KEY = 'paperbane-best-rank'

const getStorage = () => {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage
  } catch {
    return null
  }
}

const readStorage = (key: string) => {
  try {
    return getStorage()?.getItem(key) ?? null
  } catch {
    return null
  }
}

const writeStorage = (key: string, value: string) => {
  try {
    getStorage()?.setItem(key, value)
  } catch {
    return
  }
}

const removeStorage = (key: string) => {
  try {
    getStorage()?.removeItem(key)
  } catch {
    return
  }
}

const storedCheckpoint = () => readStorage(CHECKPOINT_KEY) === 'true'
const storedNumber = (key: string) => {
  const value = Number(readStorage(key))
  return Number.isFinite(value) && value > 0 ? value : null
}

export type FinalRank = 'D' | 'C' | 'B' | 'A' | 'S'

export interface CheckpointStats {
  gameTime: number
  killCount: number
  damageTaken: number
  medkitsUsed: number
  maxCombo: number
}

const isFinalRank = (value: string | null): value is FinalRank =>
  value !== null && ['D', 'C', 'B', 'A', 'S'].includes(value)

const storedRank = () => {
  const value = readStorage(BEST_RANK_KEY)
  return isFinalRank(value) ? value : null
}

const storedCheckpointStats = (): CheckpointStats | null => {
  const value = readStorage(CHECKPOINT_STATS_KEY)
  if (!value) return null
  try {
    const parsed = JSON.parse(value) as Partial<CheckpointStats>
    const fields: Array<keyof CheckpointStats> = ['gameTime', 'killCount', 'damageTaken', 'medkitsUsed', 'maxCombo']
    if (!fields.every((field) => Number.isFinite(parsed[field]) && Number(parsed[field]) >= 0)) return null
    return {
      gameTime: Number(parsed.gameTime),
      killCount: Number(parsed.killCount),
      damageTaken: Number(parsed.damageTaken),
      medkitsUsed: Number(parsed.medkitsUsed),
      maxCombo: Number(parsed.maxCombo)
    }
  } catch {
    return null
  }
}

const rankScore = (rank: FinalRank) => ['D', 'C', 'B', 'A', 'S'].indexOf(rank)

const getRank = (time: number, damage: number, medkits: number, combo: number): FinalRank => {
  let score = 0
  if (time <= 360) score += 2
  else if (time <= 480) score += 1
  if (damage <= 35) score += 2
  else if (damage <= 80) score += 1
  if (medkits === 0) score += 1
  if (combo >= 5) score += 1
  if (score >= 6) return 'S'
  if (score >= 4) return 'A'
  if (score >= 3) return 'B'
  if (score >= 2) return 'C'
  return 'D'
}

export interface GameStore {
  status: GameStatus
  loadingProgress: number
  hp: number
  stamina: number
  wick: number
  medkits: number
  objective: string
  checkpoint: boolean
  checkpointStats: CheckpointStats | null
  terminalRestored: boolean
  bossActive: boolean
  bossHp: number
  bossMaxHp: number
  gameTime: number
  killCount: number
  damageTaken: number
  medkitsUsed: number
  combo: number
  maxCombo: number
  comboTimer: number
  surgeTime: number
  graphicsMode: GraphicsMode
  volume: number
  muted: boolean
  sessionId: number
  interactionPrompt: string
  message: string
  bestTime: number | null
  bestRank: FinalRank | null
  finalRank: FinalRank
  setLoadingProgress: (progress: number) => void
  showMainMenu: () => void
  startGame: (fromCheckpoint?: boolean) => void
  continueGame: () => void
  pause: () => void
  resume: () => void
  restartCheckpoint: () => void
  returnToMenu: () => void
  damagePlayer: (amount: number) => void
  useMedkit: () => boolean
  spendStamina: (amount: number) => boolean
  setStamina: (value: number) => void
  addWick: (amount: number) => void
  activateSurge: () => boolean
  registerHit: (damage: number) => void
  registerKill: () => void
  setObjective: (objective: string) => void
  setInteractionPrompt: (prompt: string) => void
  setMessage: (message: string) => void
  restoreTerminal: () => void
  startBoss: () => void
  finishBossIntro: () => void
  damageBoss: (amount: number) => void
  completeGame: () => void
  tick: (delta: number) => void
  setGraphicsMode: (mode: GraphicsMode) => void
  setVolume: (volume: number) => void
  toggleMuted: () => void
  clearCheckpoint: () => void
}

export const useGameStore = create<GameStore>((set, get) => ({
  status: 'LOADING',
  loadingProgress: 0,
  hp: GAME_CONFIG.player.maxHp,
  stamina: GAME_CONFIG.player.maxStamina,
  wick: 0,
  medkits: GAME_CONFIG.player.startMedkits,
  objective: OBJECTIVES.street,
  checkpoint: storedCheckpoint(),
  checkpointStats: storedCheckpointStats(),
  terminalRestored: false,
  bossActive: false,
  bossHp: GAME_CONFIG.enemies.boss.hp,
  bossMaxHp: GAME_CONFIG.enemies.boss.hp,
  gameTime: 0,
  killCount: 0,
  damageTaken: 0,
  medkitsUsed: 0,
  combo: 0,
  maxCombo: 0,
  comboTimer: 0,
  surgeTime: 0,
  graphicsMode: 'QUALITY',
  volume: 0.65,
  muted: false,
  sessionId: 0,
  interactionPrompt: '',
  message: '',
  bestTime: storedNumber(BEST_TIME_KEY),
  bestRank: storedRank(),
  finalRank: 'D',

  setLoadingProgress: (loadingProgress) => set({ loadingProgress: Math.min(100, Math.max(0, loadingProgress)) }),
  showMainMenu: () => set({ status: 'MAIN_MENU', loadingProgress: 100 }),
  startGame: (fromCheckpoint = false) => {
    const checkpointStats = fromCheckpoint ? get().checkpointStats ?? storedCheckpointStats() : null
    if (!fromCheckpoint) {
      removeStorage(CHECKPOINT_KEY)
      removeStorage(CHECKPOINT_STATS_KEY)
    }
    set((state) => ({
      status: 'PLAYING',
      hp: fromCheckpoint ? 70 : GAME_CONFIG.player.maxHp,
      stamina: GAME_CONFIG.player.maxStamina,
      wick: 0,
      medkits: fromCheckpoint ? 1 : GAME_CONFIG.player.startMedkits,
      objective: fromCheckpoint ? OBJECTIVES.exchange : OBJECTIVES.street,
      checkpoint: fromCheckpoint,
      checkpointStats,
      terminalRestored: fromCheckpoint,
      bossActive: false,
      bossHp: GAME_CONFIG.enemies.boss.hp,
      gameTime: checkpointStats?.gameTime ?? 0,
      killCount: checkpointStats?.killCount ?? 0,
      damageTaken: checkpointStats?.damageTaken ?? 0,
      medkitsUsed: checkpointStats?.medkitsUsed ?? 0,
      combo: 0,
      maxCombo: checkpointStats?.maxCombo ?? 0,
      comboTimer: 0,
      surgeTime: 0,
      interactionPrompt: '',
      message: '',
      sessionId: state.sessionId + 1
    }))
  },
  continueGame: () => get().startGame(true),
  pause: () => {
    if (get().status === 'PLAYING' || get().status === 'BOSS_INTRO') set({ status: 'PAUSED', interactionPrompt: '' })
  },
  resume: () => {
    if (get().status === 'PAUSED') set({ status: 'PLAYING' })
  },
  restartCheckpoint: () => get().startGame(get().checkpoint),
  returnToMenu: () => set({ status: 'MAIN_MENU', interactionPrompt: '', message: '' }),
  damagePlayer: (amount) => set((state) => {
    if (state.status !== 'PLAYING') return state
    const hp = Math.max(0, state.hp - amount)
    return {
      hp,
      damageTaken: state.damageTaken + amount,
      combo: 0,
      comboTimer: 0,
      status: hp <= 0 ? 'PLAYER_DEAD' : state.status,
      message: hp <= 0 ? '' : state.message
    }
  }),
  useMedkit: () => {
    const state = get()
    if (state.status !== 'PLAYING' || state.hp >= GAME_CONFIG.player.maxHp || state.medkits <= 0) return false
    set({
      hp: Math.min(GAME_CONFIG.player.maxHp, state.hp + GAME_CONFIG.player.healAmount),
      medkits: state.medkits - 1,
      medkitsUsed: state.medkitsUsed + 1,
      message: 'MEDKIT USED'
    })
    window.setTimeout(() => get().message === 'MEDKIT USED' && set({ message: '' }), 1100)
    return true
  },
  spendStamina: (amount) => {
    const stamina = get().stamina
    if (stamina < amount) return false
    set({ stamina: stamina - amount })
    return true
  },
  setStamina: (stamina) => set({ stamina: Math.min(GAME_CONFIG.player.maxStamina, Math.max(0, stamina)) }),
  addWick: (amount) => set((state) => ({ wick: Math.min(GAME_CONFIG.player.maxWick, state.wick + amount) })),
  activateSurge: () => {
    if (get().wick < GAME_CONFIG.player.maxWick || get().status !== 'PLAYING') return false
    set({ wick: 0, surgeTime: GAME_CONFIG.surge.duration, message: 'GREEN WICK ACTIVE' })
    return true
  },
  registerHit: (damage) => set((state) => ({
    wick: Math.min(GAME_CONFIG.player.maxWick, state.wick + damage * GAME_CONFIG.combat.wickGainMultiplier),
    combo: state.combo + 1,
    maxCombo: Math.max(state.maxCombo, state.combo + 1),
    comboTimer: GAME_CONFIG.combat.comboWindow
  })),
  registerKill: () => set((state) => ({ killCount: state.killCount + 1 })),
  setObjective: (objective) => set({ objective }),
  setInteractionPrompt: (interactionPrompt) => set({ interactionPrompt }),
  setMessage: (message) => set({ message }),
  restoreTerminal: () => {
    const state = get()
    const checkpointStats: CheckpointStats = {
      gameTime: state.gameTime,
      killCount: state.killCount,
      damageTaken: state.damageTaken,
      medkitsUsed: state.medkitsUsed,
      maxCombo: state.maxCombo
    }
    writeStorage(CHECKPOINT_KEY, 'true')
    writeStorage(CHECKPOINT_STATS_KEY, JSON.stringify(checkpointStats))
    set({
      terminalRestored: true,
      checkpoint: true,
      checkpointStats,
      objective: OBJECTIVES.exchange,
      message: 'SIGNAL RESTORED',
      interactionPrompt: ''
    })
    window.setTimeout(() => get().message === 'SIGNAL RESTORED' && set({ message: '' }), 2200)
  },
  startBoss: () => set({
    status: 'BOSS_INTRO',
    bossActive: true,
    bossHp: GAME_CONFIG.enemies.boss.hp,
    objective: OBJECTIVES.boss,
    interactionPrompt: ''
  }),
  finishBossIntro: () => {
    if (get().status === 'BOSS_INTRO') set({ status: 'PLAYING' })
  },
  damageBoss: (amount) => set((state) => ({ bossHp: Math.max(0, state.bossHp - amount) })),
  completeGame: () => {
    const state = get()
    const finalRank = getRank(state.gameTime, state.damageTaken, state.medkitsUsed, state.maxCombo)
    const bestTime = state.bestTime === null ? state.gameTime : Math.min(state.bestTime, state.gameTime)
    const bestRank = state.bestRank === null || rankScore(finalRank) > rankScore(state.bestRank) ? finalRank : state.bestRank
    writeStorage(BEST_TIME_KEY, String(bestTime))
    writeStorage(BEST_RANK_KEY, bestRank)
    set({ status: 'VICTORY', objective: OBJECTIVES.final, finalRank, bestTime, bestRank, bossHp: 0, message: '' })
  },
  tick: (delta) => set((state) => {
    if (state.status !== 'PLAYING') return state
    const surgeTime = Math.max(0, state.surgeTime - delta)
    const comboTimer = Math.max(0, state.comboTimer - delta)
    return {
      gameTime: state.gameTime + delta,
      surgeTime,
      comboTimer,
      combo: comboTimer <= 0 ? 0 : state.combo,
      message: state.message === 'GREEN WICK ACTIVE' && surgeTime <= GAME_CONFIG.surge.duration - 1.4 ? '' : state.message
    }
  }),
  setGraphicsMode: (graphicsMode) => set({ graphicsMode }),
  setVolume: (volume) => set({ volume: Math.min(1, Math.max(0, volume)) }),
  toggleMuted: () => set((state) => ({ muted: !state.muted })),
  clearCheckpoint: () => {
    removeStorage(CHECKPOINT_KEY)
    removeStorage(CHECKPOINT_STATS_KEY)
    set({ checkpoint: false, checkpointStats: null })
  }
}))
