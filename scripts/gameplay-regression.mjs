const endpoint = process.env.CDP_ENDPOINT ?? 'http://127.0.0.1:9222'
const baseUrl = process.env.TEST_URL ?? 'http://127.0.0.1:5173'

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))

const assert = (condition, message) => {
  if (!condition) throw new Error(message)
}

const pageResponse = await fetch(`${endpoint}/json/new?${encodeURIComponent(`${baseUrl}/play`)}`, { method: 'PUT' })
if (!pageResponse.ok) throw new Error(`Unable to create browser page ${pageResponse.status}`)
const page = await pageResponse.json()
const socket = new WebSocket(page.webSocketDebuggerUrl)
const pending = new Map()
let nextId = 0

await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true })
  socket.addEventListener('error', reject, { once: true })
})

socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data)
  if (!message.id) return
  const task = pending.get(message.id)
  if (!task) return
  pending.delete(message.id)
  if (message.error) task.reject(new Error(message.error.message))
  else task.resolve(message.result)
})

const command = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++nextId
  pending.set(id, { resolve, reject })
  socket.send(JSON.stringify({ id, method, params }))
})

const evaluate = async (expression) => {
  const result = await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text)
  return result.result.value
}

await command('Page.enable')
await command('Runtime.enable')
await command('Page.bringToFront')
await command('Page.navigate', { url: `${baseUrl}/play` })
let startButtonAvailable = false
for (let attempt = 0; attempt < 90 && !startButtonAvailable; attempt += 1) {
  await delay(500)
  startButtonAvailable = await evaluate(`Boolean(Array.from(document.querySelectorAll('button')).find((button) => button.textContent.trim() === 'START GAME'))`)
}
assert(startButtonAvailable, 'Game main menu did not finish loading')
await evaluate(`Array.from(document.querySelectorAll('button')).find((button) => button.textContent.trim() === 'START GAME').click()`)
await delay(500)
const cameraChecks = await evaluate(`(async () => {
  const gameStateUrl = performance.getEntriesByType('resource')
    .map((entry) => entry.name)
    .filter((name) => name.includes('/src/game/GameState.ts'))
    .at(-1)
  if (!gameStateUrl) throw new Error('Unable to locate the running GameState module')
  const { useGameStore } = await import(gameStateUrl)
  const { applyCameraPointerDelta } = await import('/src/game/ThirdPersonCamera.tsx')
  const { cameraYawToFacingYaw } = await import('/src/game/Player.tsx')
  const {
    PLAYER_ANIMATION_TIMING,
    getPlayerAnimationWindowSeconds
  } = await import('/src/game/PlayerAnimationConfig.ts')
  const right = applyCameraPointerDelta(0, 0.18, 100, 0)
  const left = applyCameraPointerDelta(0, 0.18, -100, 0)
  const up = applyCameraPointerDelta(0, 0.18, 0, -100)
  const down = applyCameraPointerDelta(0, 0.18, 0, 100)
  const testYaw = 0.4
  const facing = cameraYawToFacingYaw(testYaw)
  const movementForward = { x: Math.sin(testYaw), z: -Math.cos(testYaw) }
  const attackForward = { x: Math.sin(facing), z: Math.cos(facing) }
  globalThis.__paperbaneStore = useGameStore
  globalThis.__paperbaneProgressionTransitions = []
  useGameStore.setState({ hp: 100000 })
  globalThis.__paperbaneUnsubscribe = useGameStore.subscribe((state, previous) => {
    if (
      state.objective !== previous.objective ||
      state.status !== previous.status ||
      state.progression !== previous.progression
    ) {
      globalThis.__paperbaneProgressionTransitions.push({
        elapsed: Math.round(performance.now()),
        objective: state.objective,
        progression: state.progression,
        status: state.status
      })
    }
  })
  useGameStore.getState().completeIntro()
  return {
    rightYaw: right.yaw,
    leftYaw: left.yaw,
    upPitch: up.pitch,
    downPitch: down.pitch,
    movementAttackAlignment:
      movementForward.x * attackForward.x + movementForward.z * attackForward.z,
    animationChecks: {
      overheadDuration: PLAYER_ANIMATION_TIMING.OVERHEAD_STRIKE.duration,
      overheadPhaseCount: PLAYER_ANIMATION_TIMING.OVERHEAD_STRIKE.phases.length,
      overheadDamage: getPlayerAnimationWindowSeconds('OVERHEAD_STRIKE', 'damage'),
      dodgeDuration: PLAYER_ANIMATION_TIMING.DODGE_ROLL.duration,
      dodgePhaseCount: PLAYER_ANIMATION_TIMING.DODGE_ROLL.phases.length,
      dodgeInvulnerability: getPlayerAnimationWindowSeconds('DODGE_ROLL', 'invulnerability'),
      medkitDuration: PLAYER_ANIMATION_TIMING.MEDKIT_USE.duration,
      surgeDuration: PLAYER_ANIMATION_TIMING.WICK_SURGE.duration
    }
  }
})()`)

assert(cameraChecks.rightYaw > 0, 'Right pointer movement did not increase right-facing camera yaw')
assert(cameraChecks.leftYaw < 0, 'Left pointer movement did not decrease camera yaw')
assert(cameraChecks.upPitch < 0.18, 'Up pointer movement did not rotate the view upward')
assert(cameraChecks.downPitch > 0.18, 'Down pointer movement did not rotate the view downward')
assert(cameraChecks.movementAttackAlignment > 0.999, 'Player attacks are not aligned with camera-relative forward movement')
assert(cameraChecks.animationChecks.overheadDuration === 1, 'Overhead strike duration drifted from 1.0 seconds')
assert(cameraChecks.animationChecks.overheadPhaseCount === 5, 'Overhead strike is missing one of its five reference poses')
assert(cameraChecks.animationChecks.overheadDamage[0] === 0.54 && cameraChecks.animationChecks.overheadDamage[1] === 0.68, 'Overhead damage window is not synchronized')
assert(cameraChecks.animationChecks.dodgeDuration === 0.75, 'Dodge roll duration drifted from 0.75 seconds')
assert(cameraChecks.animationChecks.dodgePhaseCount === 5, 'Dodge roll is missing one of its five reference poses')
assert(Math.abs(cameraChecks.animationChecks.dodgeInvulnerability[0] - 0.18) < 0.0001, 'Dodge invulnerability does not start at 0.18 seconds')
assert(Math.abs(cameraChecks.animationChecks.dodgeInvulnerability[1] - 0.48) < 0.0001, 'Dodge invulnerability does not end at 0.48 seconds')
assert(cameraChecks.animationChecks.medkitDuration === 1.2, 'Medkit animation timing is missing')
assert(cameraChecks.animationChecks.surgeDuration === 0.9, 'Wick Surge animation timing is missing')

await evaluate(`globalThis.__paperbaneStore.setState({ hp: 50, medkits: 1, wick: 100, surgeTime: 0 })`)
const medkitBeforeCommit = await evaluate(`(() => {
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyQ', key: 'q' }))
  const state = globalThis.__paperbaneStore.getState()
  const snapshot = { hp: state.hp, medkits: state.medkits }
  window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyQ', key: 'q' }))
  return snapshot
})()`)
assert(medkitBeforeCommit.hp === 50 && medkitBeforeCommit.medkits === 1, 'Medkit effect fired before the animation commit point')
await delay(900)
const medkitAfterCommit = await evaluate(`(() => { const state = globalThis.__paperbaneStore.getState(); return { hp: state.hp, medkits: state.medkits } })()`)
assert(medkitAfterCommit.hp === 90 && medkitAfterCommit.medkits === 0, 'Medkit effect did not fire from MEDKIT_USE')
await delay(360)
const surgeBeforeCommit = await evaluate(`(() => {
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyF', key: 'f' }))
  const surgeTime = globalThis.__paperbaneStore.getState().surgeTime
  window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyF', key: 'f' }))
  return surgeTime
})()`)
assert(surgeBeforeCommit === 0, 'Wick Surge activated before the animation commit point')
await delay(650)
const surgeAfterCommit = await evaluate(`globalThis.__paperbaneStore.getState().surgeTime`)
assert(surgeAfterCommit > 0, 'Wick Surge did not activate from WICK_SURGE')
await evaluate(`globalThis.__paperbaneStore.setState({ hp: 100000, surgeTime: 0 })`)

for (const code of ['KeyW', 'ShiftLeft']) {
  await command('Input.dispatchKeyEvent', { type: 'keyDown', code, key: code === 'KeyW' ? 'w' : 'Shift' })
}
await delay(12500)
for (const code of ['ShiftLeft', 'KeyW']) {
  await command('Input.dispatchKeyEvent', { type: 'keyUp', code, key: code === 'KeyW' ? 'w' : 'Shift' })
}
await delay(250)

const result = await evaluate(`(async () => {
  globalThis.__paperbaneUnsubscribe?.()
  return {
    state: globalThis.__paperbaneStore.getState(),
    transitions: globalThis.__paperbaneProgressionTransitions,
    pageText: document.body.innerText
  }
})()`)

assert(result.state.status === 'PLAYING', `Gameplay stopped unexpectedly with ${result.state.status}`)
assert(result.state.progression === 'PUMP_STATION_ACTIVE', `Expected PUMP_STATION_ACTIVE, received ${result.state.progression}`)
assert(result.state.objective === 'DESTROY THE PAPER HANDS', `Unexpected objective: ${result.state.objective}`)
assert(
  !result.transitions.some((transition, index) =>
    index > 0 && transition.progression === 'INTRO_COMPLETE'
  ),
  'Progression returned to the intro after entering the Pump Station'
)

const stateMachineChecks = await evaluate(`(async () => {
  const { progressionColliders } = await import('/src/game/WorldCollision.ts')
  const store = globalThis.__paperbaneStore
  const phases = []
  const snapshot = () => {
    const state = store.getState()
    phases.push({ progression: state.progression, status: state.status, objective: state.objective })
  }
  snapshot()
  store.getState().readyTerminal()
  snapshot()
  store.getState().restoreTerminal()
  snapshot()
  store.getState().readyBoss()
  snapshot()
  store.getState().startBoss()
  snapshot()
  store.getState().finishBossIntro()
  snapshot()
  store.getState().completeGame()
  snapshot()
  return {
    phases,
    colliderCounts: {
      introCombat: progressionColliders('INTRO_COMBAT').length,
      introComplete: progressionColliders('INTRO_COMPLETE').length,
      terminalReady: progressionColliders('TERMINAL_READY').length,
      terminalComplete: progressionColliders('TERMINAL_COMPLETE').length,
      bossActive: progressionColliders('BOSS_ACTIVE').length
    }
  }
})()`)

const expectedPhases = [
  ['PUMP_STATION_ACTIVE', 'PLAYING'],
  ['TERMINAL_READY', 'PLAYING'],
  ['TERMINAL_COMPLETE', 'PLAYING'],
  ['BOSS_READY', 'PLAYING'],
  ['BOSS_ACTIVE', 'BOSS_INTRO'],
  ['BOSS_ACTIVE', 'PLAYING'],
  ['VICTORY', 'VICTORY']
]
assert(
  stateMachineChecks.phases.every((phase, index) =>
    phase.progression === expectedPhases[index][0] && phase.status === expectedPhases[index][1]
  ),
  `Invalid progression sequence: ${JSON.stringify(stateMachineChecks.phases)}`
)
assert(stateMachineChecks.colliderCounts.introCombat === 2, 'Intro combat gates are incomplete')
assert(stateMachineChecks.colliderCounts.introComplete === 1, 'Tutorial gate remained after intro completion')
assert(stateMachineChecks.colliderCounts.terminalReady === 1, 'Terminal gate opened before restoration')
assert(stateMachineChecks.colliderCounts.terminalComplete === 0, 'Terminal gate remained after restoration')
assert(stateMachineChecks.colliderCounts.bossActive === 1, 'Arena did not close during the boss fight')

socket.close()
console.log(JSON.stringify({
  status: result.state.status,
  objective: result.state.objective,
  progression: result.state.progression,
  hp: result.state.hp,
  cameraChecks,
  utilityChecks: { medkitBeforeCommit, medkitAfterCommit, surgeBeforeCommit, surgeAfterCommit },
  stateMachineChecks,
  transitions: result.transitions,
  hudShowsStreetObjective: result.pageText.includes('REACH THE PUMP STATION'),
  hudShowsPumpObjective: result.pageText.includes('DESTROY THE PAPER HANDS')
}, null, 2))
