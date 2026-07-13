import { GAME_CONFIG } from './GameConfig'

export type NormalizedAnimationWindow = readonly [start: number, end: number]

export interface PlayerAnimationPhase<Name extends string = string> {
  name: Name
  /** Normalized inclusive start in the 0..1 animation timeline. */
  start: number
  /** Normalized inclusive end in the 0..1 animation timeline. */
  end: number
}

export interface PlayerAnimationEvents {
  damage?: NormalizedAnimationWindow
  trail?: NormalizedAnimationWindow
  movement?: NormalizedAnimationWindow
  invulnerability?: NormalizedAnimationWindow
  inputBuffer?: NormalizedAnimationWindow
  effect?: NormalizedAnimationWindow
}

export interface PlayerAnimationMarkers {
  commit?: number
  sound?: number
}

interface PlayerAnimationTimeline<Phase extends string = string> {
  /** Unmodified duration. Attack-speed multipliers divide this value. */
  duration: number
  phases: readonly PlayerAnimationPhase<Phase>[]
  events: Readonly<PlayerAnimationEvents>
  markers: Readonly<PlayerAnimationMarkers>
}

const timeline = <Phase extends string>(value: PlayerAnimationTimeline<Phase>) => value

const dodgeDuration = GAME_CONFIG.player.dodgeDuration

/**
 * Single source of normalized player-action timing.
 *
 * Gameplay code should derive duration and event seconds through the helpers
 * below instead of duplicating percentages. Model key poses use the same phase
 * boundaries, so anticipation, hit, trail, invulnerability, and recovery stay
 * synchronized when a duration or attack-speed multiplier changes.
 */
export const PLAYER_ANIMATION_TIMING = {
  LIGHT_ATTACK: timeline({
    duration: 0.5,
    phases: [
      { name: 'ANTICIPATION', start: 0, end: 0.2 },
      { name: 'WINDUP', start: 0.2, end: 0.34 },
      { name: 'STRIKE', start: 0.34, end: 0.6 },
      { name: 'FOLLOW_THROUGH', start: 0.6, end: 0.76 },
      { name: 'RECOVERY', start: 0.76, end: 1 }
    ],
    events: {
      damage: [0.38, 0.56],
      trail: [0.31, 0.62],
      inputBuffer: [0.28, 0.92]
    },
    markers: { sound: 0.3 }
  }),
  OVERHEAD_STRIKE: timeline({
    duration: 1,
    phases: [
      { name: 'ANTICIPATION', start: 0, end: 0.12 },
      { name: 'WINDUP', start: 0.12, end: 0.42 },
      { name: 'APEX_HOLD', start: 0.42, end: 0.5 },
      { name: 'ACTIVE_STRIKE', start: 0.5, end: 0.68 },
      { name: 'RECOVERY', start: 0.68, end: 1 }
    ],
    events: {
      damage: [0.54, 0.68],
      trail: [0.48, 0.7],
      movement: [0.46, 0.7],
      inputBuffer: [0.72, 0.94]
    },
    markers: { sound: 0.46 }
  }),
  DODGE_ROLL: timeline({
    duration: dodgeDuration,
    phases: [
      { name: 'BRACE', start: 0, end: 0.1 },
      { name: 'DROP', start: 0.1, end: 0.22 },
      { name: 'ROLL', start: 0.22, end: 0.5 },
      { name: 'LAND', start: 0.5, end: 0.66 },
      { name: 'RECOVER', start: 0.66, end: 1 }
    ],
    events: {
      movement: [0, 1],
      invulnerability: [
        GAME_CONFIG.player.dodgeInvulnerabilityStart / dodgeDuration,
        GAME_CONFIG.player.dodgeInvulnerabilityEnd / dodgeDuration
      ],
      inputBuffer: [0.78, 1]
    },
    markers: { sound: 0.08 }
  }),
  MEDKIT_USE: timeline({
    duration: 1.2,
    phases: [
      { name: 'REACH', start: 0, end: 0.22 },
      { name: 'RAISE', start: 0.22, end: 0.42 },
      { name: 'APPLY', start: 0.42, end: 0.68 },
      { name: 'STOW', start: 0.68, end: 0.86 },
      { name: 'RECOVER', start: 0.86, end: 1 }
    ],
    events: { effect: [0.58, 0.66], inputBuffer: [0.88, 1] },
    markers: { commit: 0.62, sound: 0.42 }
  }),
  WICK_SURGE: timeline({
    duration: 0.9,
    phases: [
      { name: 'GROUND', start: 0, end: 0.16 },
      { name: 'DRAW_IN', start: 0.16, end: 0.36 },
      { name: 'IGNITE', start: 0.36, end: 0.56 },
      { name: 'HOLD', start: 0.56, end: 0.72 },
      { name: 'RELEASE', start: 0.72, end: 1 }
    ],
    events: { effect: [0.38, 0.64], inputBuffer: [0.8, 1] },
    markers: { commit: 0.44, sound: 0.36 }
  })
} as const

export type PlayerAnimationTimelineName = keyof typeof PLAYER_ANIMATION_TIMING
export type PlayerAnimationWindowEvent = keyof PlayerAnimationEvents
export type PlayerAnimationMarker = keyof PlayerAnimationMarkers

export const getPlayerAnimationDuration = (
  name: PlayerAnimationTimelineName,
  speedMultiplier = 1
) => PLAYER_ANIMATION_TIMING[name].duration / Math.max(0.01, speedMultiplier)

export const getPlayerAnimationProgress = (
  name: PlayerAnimationTimelineName,
  elapsed: number,
  speedMultiplier = 1
) => Math.min(1, Math.max(0, elapsed / getPlayerAnimationDuration(name, speedMultiplier)))

export const isNormalizedWindowActive = (
  progress: number,
  window: NormalizedAnimationWindow | undefined
) => Boolean(window && progress >= window[0] && progress <= window[1])

export const getPlayerAnimationWindowSeconds = (
  name: PlayerAnimationTimelineName,
  event: PlayerAnimationWindowEvent,
  speedMultiplier = 1
): NormalizedAnimationWindow | null => {
  const events = PLAYER_ANIMATION_TIMING[name].events as PlayerAnimationEvents
  const window = events[event]
  if (!window) return null
  const duration = getPlayerAnimationDuration(name, speedMultiplier)
  return [window[0] * duration, window[1] * duration]
}

export const getPlayerAnimationMarkerSeconds = (
  name: PlayerAnimationTimelineName,
  marker: PlayerAnimationMarker,
  speedMultiplier = 1
) => {
  const markers = PLAYER_ANIMATION_TIMING[name].markers as PlayerAnimationMarkers
  const normalized = markers[marker]
  return normalized === undefined ? null : normalized * getPlayerAnimationDuration(name, speedMultiplier)
}
