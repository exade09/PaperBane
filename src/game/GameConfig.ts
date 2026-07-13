export const GAME_CONFIG = {
  player: {
    maxHp: 100,
    maxStamina: 100,
    maxWick: 100,
    maxMedkits: 2,
    startMedkits: 1,
    moveSpeed: 5.2,
    sprintSpeed: 8.2,
    sprintDrain: 20,
    staminaRegen: 30,
    staminaRegenDelay: 1,
    dodgeCost: 30,
    dodgeDuration: 0.75,
    dodgeDistance: 4.1,
    dodgeInvulnerabilityStart: 0.18,
    dodgeInvulnerabilityEnd: 0.48,
    dodgeCooldown: 0.92,
    damageInvulnerability: 0.72,
    healAmount: 40
  },
  combat: {
    lightDamage: [14, 18, 24] as const,
    heavyDamage: 36,
    heavyStaminaCost: 25,
    comboWindow: 0.72,
    lightRange: 2.35,
    heavyRange: 2.9,
    lightArc: 1.7,
    heavyArc: 2.15,
    wickGainMultiplier: 0.82,
    hitStop: 0.05
  },
  surge: {
    duration: 6,
    damageMultiplier: 1.35,
    attackSpeedMultiplier: 1.18,
    knockbackMultiplier: 1.5
  },
  enemies: {
    walker: { hp: 45, damage: 10, speed: 1.35, attackRange: 1.55, detectionRange: 13 },
    runner: { hp: 28, damage: 8, speed: 3.7, attackRange: 1.45, detectionRange: 16 },
    boss: { hp: 300, damage: 18, speed: 1.65, attackRange: 2.55, detectionRange: 30 }
  },
  world: {
    startZ: 23,
    pumpEntranceZ: -18,
    terminalZ: -61,
    checkpointZ: -71,
    bossTriggerZ: -88,
    bossCenterZ: -105,
    minZ: -119,
    maxZ: 27,
    streetHalfWidth: 8.5,
    pumpHalfWidth: 13,
    arenaHalfWidth: 15
  }
} as const

export const OBJECTIVES = {
  street: 'REACH THE PUMP STATION',
  pumpApproach: 'ENTER THE PUMP STATION',
  pumpFight: 'DESTROY THE PAPER HANDS',
  terminal: 'RESTORE THE GREEN SIGNAL',
  exchange: 'ENTER THE OLD EXCHANGE',
  boss: 'DESTROY THE PAPER KING',
  final: 'THE SIGNAL IS RESTORED'
} as const

export type GraphicsMode = 'PERFORMANCE' | 'QUALITY'
export type GameStatus =
  | 'LOADING'
  | 'MAIN_MENU'
  | 'PLAYING'
  | 'PAUSED'
  | 'PLAYER_DEAD'
  | 'BOSS_INTRO'
  | 'VICTORY'

export type EnemyKind = 'walker' | 'runner'
