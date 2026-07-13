import { mkdir, writeFile } from 'node:fs/promises'

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
const browserErrors = []
let nextId = 0

await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true })
  socket.addEventListener('error', reject, { once: true })
})
socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data)
  if (message.id) {
    const task = pending.get(message.id)
    if (!task) return
    pending.delete(message.id)
    if (message.error) task.reject(new Error(message.error.message))
    else task.resolve(message.result)
    return
  }
  if (message.method === 'Runtime.exceptionThrown') browserErrors.push(message.params.exceptionDetails.text)
  if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error') browserErrors.push(message.params.entry.text)
})
const command = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++nextId
  pending.set(id, { resolve, reject })
  socket.send(JSON.stringify({ id, method, params }))
})
const evaluate = async (expression) => {
  const result = await command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text)
  return result.result.value
}
const key = async (type, code, value) => command('Input.dispatchKeyEvent', { type, code, key: value })
const tapKey = async (code, value) => {
  await key('keyDown', code, value)
  await key('keyUp', code, value)
}
const click = async (button = 'left') => {
  await command('Input.dispatchMouseEvent', { type: 'mousePressed', x: 720, y: 500, button, clickCount: 1 })
  await command('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 720, y: 500, button, clickCount: 1 })
}
const move = async (milliseconds, direction = 'KeyW', sprint = true) => {
  const keyValue = { KeyW: 'w', KeyS: 's', KeyA: 'a', KeyD: 'd' }[direction]
  await key('keyDown', direction, keyValue)
  if (sprint) await key('keyDown', 'ShiftLeft', 'Shift')
  await delay(milliseconds)
  if (sprint) await key('keyUp', 'ShiftLeft', 'Shift')
  await key('keyUp', direction, keyValue)
  await delay(180)
}

await command('Page.enable')
await command('Runtime.enable')
await command('Log.enable')
await command('Page.bringToFront')
await command('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false })
await command('Page.navigate', { url: `${baseUrl}/play` })

let menuReady = false
for (let attempt = 0; attempt < 90 && !menuReady; attempt += 1) {
  await delay(500)
  menuReady = await evaluate(`Boolean(Array.from(document.querySelectorAll('button')).find((button) => button.textContent.trim() === 'START GAME'))`)
}
assert(menuReady, 'Main menu did not load')
await evaluate(`Array.from(document.querySelectorAll('button')).find((button) => button.textContent.trim() === 'START GAME').click()`)
await delay(800)

await evaluate(`(async () => {
  const gameStateUrl = performance.getEntriesByType('resource')
    .map((entry) => entry.name)
    .filter((name) => name.includes('/src/game/GameState.ts'))
    .at(-1)
  if (!gameStateUrl) throw new Error('Unable to locate the running GameState module')
  const { useGameStore } = await import(gameStateUrl)
  const fiberUrl = performance.getEntriesByType('resource')
    .map((entry) => entry.name)
    .find((name) => name.includes('@react-three_fiber.js'))
  if (!fiberUrl) throw new Error('Unable to locate the running React Three Fiber module')
  const { _roots } = await import(fiberUrl)
  globalThis.__paperbaneRouteStore = useGameStore
  globalThis.__paperbaneRouteRoots = _roots
  globalThis.__paperbaneRouteTransitions = []
  useGameStore.setState({ hp: 100000, graphicsMode: 'PERFORMANCE' })
  globalThis.__paperbaneRouteUnsubscribe = useGameStore.subscribe((state, previous) => {
    if (state.progression !== previous.progression || state.status !== previous.status) {
      globalThis.__paperbaneRouteTransitions.push({
        time: Math.round(performance.now()),
        progression: state.progression,
        status: state.status,
        objective: state.objective,
        kills: state.killCount,
        bossHp: state.bossHp
      })
    }
  })
})()`)

await click()
await delay(350)
assert(await evaluate(`document.pointerLockElement === document.querySelector('canvas')`), 'Pointer lock was not acquired')

let cameraYaw = 0

const readActors = () => evaluate(`(() => {
  const canvas = document.querySelector('canvas')
  const scene = globalThis.__paperbaneRouteRoots.get(canvas)?.store.getState().scene
  if (!scene) return null
  const groups = scene.children.filter((child) => child.type === 'Group')
  const meshCount = (group) => {
    let count = 0
    group.traverse((child) => { if (child.isMesh) count += 1 })
    return count
  }
  const enemies = groups.filter((group) => group.children.length === 1 && meshCount(group) === 73)
  const player = groups.find((group) => group.children.some((child) => child.type === 'PointLight') && (() => {
    const count = meshCount(group)
    return count > 80 && count < 150
  })())
  return {
    player: player?.position.toArray() ?? null,
    enemies: enemies.map((enemy) => enemy.position.toArray())
  }
})()`)

const turnToYaw = async (desiredYaw) => {
  let difference = desiredYaw - cameraYaw
  while (difference > Math.PI) difference -= Math.PI * 2
  while (difference < -Math.PI) difference += Math.PI * 2
  const movementX = difference / 0.00245
  await evaluate(`(() => {
    const event = new MouseEvent('mousemove')
    Object.defineProperty(event, 'movementX', { value: ${movementX} })
    Object.defineProperty(event, 'movementY', { value: 0 })
    document.dispatchEvent(event)
  })()`)
  cameraYaw += difference
  await delay(120)
}

const turnToPoint = async (targetX, targetZ) => {
  const actors = await readActors()
  assert(actors?.player, 'Player transform is unavailable')
  const dx = targetX - actors.player[0]
  const dz = targetZ - actors.player[2]
  await turnToYaw(Math.atan2(dx, -dz))
}

const turnToEnemy = async (index) => {
  const actors = await readActors()
  const target = actors?.enemies[index]
  assert(target, `Enemy transform ${index} is unavailable: ${JSON.stringify(actors)}`)
  await turnToPoint(target[0], target[2])
}

const approachEnemy = async (index, stopDistance = 4.6) => {
  for (let attempt = 0; attempt < 42; attempt += 1) {
    const actors = await readActors()
    const target = actors?.enemies[index]
    assert(actors?.player && target, `Unable to approach enemy ${index}: ${JSON.stringify(actors)}`)
    const distance = Math.hypot(target[0] - actors.player[0], target[2] - actors.player[2])
    if (distance <= stopDistance) return
    await turnToEnemy(index)
    await move(320)
  }
  throw new Error(`Enemy ${index} could not be approached: ${JSON.stringify(await readActors())}`)
}

const readState = () => evaluate(`(() => {
  const state = globalThis.__paperbaneRouteStore.getState()
  return {
    progression: state.progression,
    status: state.status,
    objective: state.objective,
    killCount: state.killCount,
    bossHp: state.bossHp,
    hp: state.hp,
    prompt: state.interactionPrompt
  }
})()`)

const attackUntil = async (predicate, timeout, label, targetIndex = null) => {
  const started = Date.now()
  let state = await readState()
  let strike = 0
  while (!predicate(state) && Date.now() - started < timeout) {
    if (targetIndex !== null && strike % 3 === 0) await turnToEnemy(targetIndex)
    await click('left')
    if (strike % 8 === 7) await tapKey('KeyF', 'f')
    await delay(245)
    state = await readState()
    strike += 1
  }
  assert(predicate(state), `${label} timed out: ${JSON.stringify(state)}`)
  return state
}

await move(1350)
await approachEnemy(0)
await attackUntil((state) => state.killCount >= 1, 14000, 'First Paper Walker', 0)
await approachEnemy(1)
await attackUntil((state) => state.killCount >= 2 && state.progression === 'INTRO_COMPLETE', 20000, 'Intro combat', 1)

await turnToYaw(0)
let state = await readState()
for (let attempt = 0; attempt < 18 && state.progression !== 'PUMP_STATION_ACTIVE'; attempt += 1) {
  await move(420)
  state = await readState()
}
assert(state.progression === 'PUMP_STATION_ACTIVE', `Pump Station did not activate: ${JSON.stringify(state)}`)

await approachEnemy(2)
await attackUntil((current) => current.killCount >= 3, 12000, 'Pump entrance Walker', 2)
await approachEnemy(5)
await attackUntil((current) => current.killCount >= 4, 15000, 'Pump forecourt Runner', 5)
await approachEnemy(3)
await attackUntil((current) => current.killCount >= 5, 15000, 'Pump canopy Walker', 3)
await approachEnemy(4)
await attackUntil((current) => current.killCount >= 6, 18000, 'Rear Pump Walker', 4)
await approachEnemy(6)
await attackUntil((current) => current.progression === 'TERMINAL_READY', 20000, 'Rear Pump Runner', 6)

await turnToYaw(0)
let terminalFound = false
for (let attempt = 0; attempt < 28 && !terminalFound; attempt += 1) {
  state = await readState()
  terminalFound = state.prompt === 'PRESS E TO RESTORE SIGNAL'
  if (!terminalFound) await move(150, 'KeyW', false)
}
if (!terminalFound) {
  await move(850, 'KeyS', false)
  for (let attempt = 0; attempt < 30 && !terminalFound; attempt += 1) {
    state = await readState()
    terminalFound = state.prompt === 'PRESS E TO RESTORE SIGNAL'
    if (!terminalFound) await move(120, 'KeyW', false)
  }
}
assert(terminalFound, `Terminal interaction range was not reached: ${JSON.stringify(await readState())}`)
await tapKey('KeyE', 'e')
await delay(650)
state = await readState()
assert(state.progression === 'TERMINAL_COMPLETE', `Terminal did not restore: ${JSON.stringify(state)}`)

await turnToYaw(0)
await move(620, 'KeyD', false)
for (let attempt = 0; attempt < 34; attempt += 1) {
  state = await readState()
  if (state.status === 'BOSS_INTRO' || state.progression === 'BOSS_ACTIVE') break
  await move(420)
}
state = await readState()
assert(state.progression === 'BOSS_ACTIVE', `Boss trigger was not reached: ${JSON.stringify(state)}`)

for (let attempt = 0; attempt < 20 && (await readState()).status !== 'PLAYING'; attempt += 1) await delay(250)
state = await readState()
assert(state.status === 'PLAYING', `Boss intro did not return control: ${JSON.stringify(state)}`)
await turnToYaw(0)
await move(1100)
await turnToPoint(0, -105)
await attackUntil((current) => current.status === 'VICTORY' && current.progression === 'VICTORY', 45000, 'Paper King combat')

const result = await evaluate(`(() => {
  globalThis.__paperbaneRouteUnsubscribe?.()
  const state = globalThis.__paperbaneRouteStore.getState()
  return {
    state: {
      progression: state.progression,
      status: state.status,
      objective: state.objective,
      killCount: state.killCount,
      bossHp: state.bossHp,
      hp: state.hp,
      finalRank: state.finalRank
    },
    transitions: globalThis.__paperbaneRouteTransitions,
    pageText: document.body.innerText,
    pointerLocked: document.pointerLockElement === document.querySelector('canvas')
  }
})()`)

await delay(600)
const screenshot = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
await mkdir('smoke-artifacts', { recursive: true })
await writeFile('smoke-artifacts/full-route-victory.png', Buffer.from(screenshot.data, 'base64'))

assert(result.pageText.includes('THE SIGNAL IS') && result.pageText.includes('RESTORED'), 'Victory screen did not appear')
assert(result.state.bossHp === 0, 'Boss health did not reach zero')
assert(browserErrors.length === 0, `Browser errors: ${browserErrors.join(' | ')}`)
socket.close()
console.log(JSON.stringify({ ...result, browserErrors }, null, 2))
