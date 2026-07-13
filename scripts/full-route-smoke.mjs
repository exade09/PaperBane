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
  const expectedEnemyIds = ['street-w1', 'street-w2', 'pump-w1', 'pump-w2', 'pump-w3', 'pump-r1', 'pump-r2']
  const namedEnemies = expectedEnemyIds
    .map((id) => groups.find((group) => group.name.startsWith('paper-hand-') && group.name.endsWith('-' + id)))
    .filter(Boolean)
  const enemies = namedEnemies.length === expectedEnemyIds.length
    ? namedEnemies
    : groups.filter((group) => {
      const count = meshCount(group)
      return group.children.length === 1 && count >= 60 && count <= 160 && group.position.z > -80
    })
  const namedPlayer = groups.find((group) => group.name === 'paperbane-player')
  const player = namedPlayer ?? groups.find((group) => group.children.some((child) =>
    child.type === 'PointLight' && ['7dff48', '91c99a'].includes(child.color?.getHexString?.())
  ) && (() => {
    const count = meshCount(group)
    return count > 80 && count < 240
  })())
  const namedBoss = groups.find((group) => group.name === 'paperbane-paper-king')
  const boss = namedBoss ?? groups.find((group) => group.children.some((child) =>
    child.type === 'PointLight' && child.color?.getHexString?.() === 'c63f3f'
  ) && (() => {
    const count = meshCount(group)
    return count >= 10 && count < 260 && group.position.z < -80
  })())
  return {
    player: player?.position.toArray() ?? null,
    enemies: enemies.map((enemy) => enemy.position.toArray()),
    boss: boss?.position.toArray() ?? null
  }
})()`)

const modelMetrics = await evaluate(`(() => {
  const canvas = document.querySelector('canvas')
  const scene = globalThis.__paperbaneRouteRoots.get(canvas)?.store.getState().scene
  if (!scene) return null
  const groups = scene.children.filter((child) => child.type === 'Group')
  const meshesFor = (group) => {
    const meshes = []
    group.traverse((child) => { if (child.isMesh && child.geometry) meshes.push(child) })
    return meshes
  }
  const metrics = (group) => {
    const meshes = meshesFor(group)
    const uniqueGeometries = new Map()
    const materials = new Set()
    let renderedTriangles = 0
    for (const mesh of meshes) {
      const geometry = mesh.geometry
      const triangles = geometry.index ? geometry.index.count / 3 : geometry.attributes.position.count / 3
      renderedTriangles += triangles
      uniqueGeometries.set(geometry.uuid, triangles)
      const meshMaterials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
      meshMaterials.forEach((material) => material && materials.add(material.uuid))
    }
    return {
      meshInstances: meshes.length,
      renderedTriangles: Math.round(renderedTriangles),
      uniqueGeometryTriangles: Math.round([...uniqueGeometries.values()].reduce((sum, value) => sum + value, 0)),
      uniqueGeometries: uniqueGeometries.size,
      uniqueMaterials: materials.size
    }
  }
  const namedPlayer = groups.find((group) => group.name === 'paperbane-player')
  const player = namedPlayer ?? groups.find((group) => group.children.some((child) =>
    child.type === 'PointLight' && ['7dff48', '91c99a'].includes(child.color?.getHexString?.())
  ) && (() => {
    const count = meshesFor(group).length
    return count > 80 && count < 240
  })())
  const namedEnemies = groups.filter((group) => group.name.startsWith('paper-hand-'))
  const enemies = namedEnemies.length > 0 ? namedEnemies : groups.filter((group) => group.children.length === 1 && (() => {
      const count = meshesFor(group).length
      return count >= 60 && count <= 160 && group.position.z > -80
    })())
  const weaponCandidates = []
  player?.traverse((object) => {
    if (object.type !== 'Group') return
    const meshes = meshesFor(object)
    const hasCandleBody = object.name === 'paperbane-candlestick' || meshes.some((mesh) => {
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
      return materials.some((material) => ['4aa927', '438e2b'].includes(material?.color?.getHexString?.()))
    })
    if (hasCandleBody) weaponCandidates.push({ object, meshCount: meshes.length })
  })
  weaponCandidates.sort((a, b) => a.meshCount - b.meshCount)
  return {
    player: player ? metrics(player) : null,
    weapon: weaponCandidates[0] ? metrics(weaponCandidates[0].object) : null,
    enemy: enemies[0] ? metrics(enemies[0]) : null,
    enemyInstances: enemies.length
  }
})()`)

assert(modelMetrics?.player?.meshInstances >= 160, `Detailed player model was not loaded: ${JSON.stringify(modelMetrics)}`)
assert(modelMetrics?.player?.renderedTriangles >= 19000, `Player geometry regressed: ${JSON.stringify(modelMetrics?.player)}`)
assert(modelMetrics?.weapon?.meshInstances >= 20, `Detailed candlestick was not loaded: ${JSON.stringify(modelMetrics?.weapon)}`)
assert(modelMetrics?.weapon?.renderedTriangles >= 1400, `Candlestick geometry regressed: ${JSON.stringify(modelMetrics?.weapon)}`)
assert(modelMetrics?.enemy?.meshInstances >= 100, `Detailed Paper Hand was not loaded: ${JSON.stringify(modelMetrics?.enemy)}`)
assert(modelMetrics?.enemy?.renderedTriangles >= 9000, `Paper Hand geometry regressed: ${JSON.stringify(modelMetrics?.enemy)}`)
assert(modelMetrics?.enemyInstances === 7, `Expected seven Paper Hands: ${JSON.stringify(modelMetrics)}`)

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

const moveToPoint = async (targetX, targetZ, stopDistance = 1.2, timeout = 18000) => {
  const started = Date.now()
  while (Date.now() - started < timeout) {
    const actors = await readActors()
    assert(actors?.player, `Player transform is unavailable en route to ${targetX},${targetZ}`)
    const distance = Math.hypot(targetX - actors.player[0], targetZ - actors.player[2])
    if (distance <= stopDistance) return
    await turnToPoint(targetX, targetZ)
    await move(Math.min(300, Math.max(100, distance * 65)), 'KeyW', false)
  }
  throw new Error(`Waypoint ${targetX},${targetZ} was not reached: ${JSON.stringify(await readActors())}`)
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
    prompt: state.interactionPrompt,
    checkpoint: state.checkpoint
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

const attackBossUntilDefeated = async (timeout) => {
  const started = Date.now()
  let state = await readState()
  let strike = 0
  while (state.bossHp > 0 && Date.now() - started < timeout) {
    const actors = await readActors()
    assert(actors?.player && actors?.boss, `Boss transform is unavailable: ${JSON.stringify(actors)}`)
    const distance = Math.hypot(
      actors.boss[0] - actors.player[0],
      actors.boss[2] - actors.player[2]
    )
    await turnToPoint(actors.boss[0], actors.boss[2])
    if (distance > 2.65) await move(Math.min(260, Math.max(90, (distance - 2.35) * 90)), 'KeyW', false)
    else await click(strike % 7 === 6 ? 'right' : 'left')
    if (strike % 11 === 8) await tapKey('Space', ' ')
    await delay(230)
    state = await readState()
    strike += 1
  }
  assert(state.bossHp === 0, `Paper King combat timed out: ${JSON.stringify(state)}`)
}

await mkdir('smoke-artifacts', { recursive: true })
const holderRearScreenshot = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
await writeFile('smoke-artifacts/holder-rear.png', Buffer.from(holderRearScreenshot.data, 'base64'))
await turnToYaw(Math.PI)
await delay(420)
const holderFrontScreenshot = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
await writeFile('smoke-artifacts/holder-front.png', Buffer.from(holderFrontScreenshot.data, 'base64'))
await turnToYaw(0)
await delay(260)

await move(1350)
await approachEnemy(0, 2.8)
const enemyScreenshot = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
await writeFile('smoke-artifacts/enemy-closeup.png', Buffer.from(enemyScreenshot.data, 'base64'))
await click('left')
await delay(270)
const impactScreenshot = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
await writeFile('smoke-artifacts/combat-impact.png', Buffer.from(impactScreenshot.data, 'base64'))
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
await delay(320)
const pumpRouteScreenshot = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
await writeFile('smoke-artifacts/pump-route.png', Buffer.from(pumpRouteScreenshot.data, 'base64'))

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
assert(state.checkpoint === true, `Terminal did not persist the boss checkpoint: ${JSON.stringify(state)}`)
assert(await evaluate(`localStorage.getItem('paperbane-checkpoint') === 'true'`), 'Boss checkpoint was not written to local storage')

await moveToPoint(3.1, -72.5, 1.35)
await moveToPoint(0, -91.5, 1.8, 24000)
state = await readState()
assert(state.progression === 'BOSS_ACTIVE', `Boss trigger was not reached: ${JSON.stringify(state)}`)

modelMetrics.boss = await evaluate(`(() => {
  try {
  const canvas = document.querySelector('canvas')
  const scene = globalThis.__paperbaneRouteRoots.get(canvas)?.store.getState().scene
  if (!scene) return null
  const boss = scene.children.find((child) => child.type === 'Group' && (child.name === 'paperbane-paper-king' || child.children.some((nested) =>
    nested.type === 'PointLight' && nested.color?.getHexString?.() === 'c63f3f'
  )))
  if (!boss) return null
  const geometries = new Map()
  const materials = new Set()
  let meshInstances = 0
  let renderedTriangles = 0
  boss.traverse((child) => {
    if (!child.isMesh || !child.geometry) return
    meshInstances += 1
    const positionCount = child.geometry.attributes?.position?.count ?? 0
    const triangles = child.geometry.index ? child.geometry.index.count / 3 : positionCount / 3
    if (!Number.isFinite(triangles)) return
    renderedTriangles += triangles
    geometries.set(child.geometry.uuid, triangles)
    const meshMaterials = Array.isArray(child.material) ? child.material : [child.material]
    meshMaterials.forEach((material) => material && materials.add(material.uuid))
  })
  return {
    meshInstances,
    renderedTriangles: Math.round(renderedTriangles),
    uniqueGeometryTriangles: Math.round([...geometries.values()].reduce((sum, value) => sum + value, 0)),
    uniqueGeometries: geometries.size,
    uniqueMaterials: materials.size
  }
  } catch (error) {
    return { error: String(error), stack: error?.stack ?? '' }
  }
})()`)
assert(modelMetrics.boss && !modelMetrics.boss.error, `Boss metric collection failed: ${JSON.stringify(modelMetrics.boss)}`)
assert(modelMetrics.boss.meshInstances >= 100, `Detailed Paper King was not loaded: ${JSON.stringify(modelMetrics.boss)}`)
assert(modelMetrics.boss.renderedTriangles >= 14000, `Paper King geometry regressed: ${JSON.stringify(modelMetrics.boss)}`)

for (let attempt = 0; attempt < 20 && (await readState()).status !== 'PLAYING'; attempt += 1) await delay(250)
state = await readState()
assert(state.status === 'PLAYING', `Boss intro did not return control: ${JSON.stringify(state)}`)
await turnToYaw(0)
await move(1100)
const bossActors = await readActors()
assert(bossActors?.boss, `Boss transform is unavailable for visual capture: ${JSON.stringify(bossActors)}`)
await turnToPoint(bossActors.boss[0], bossActors.boss[2])
const bossScreenshot = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
await mkdir('smoke-artifacts', { recursive: true })
await writeFile('smoke-artifacts/boss-closeup.png', Buffer.from(bossScreenshot.data, 'base64'))
await attackBossUntilDefeated(90000)
for (let attempt = 0; attempt < 24 && (await readState()).status !== 'VICTORY'; attempt += 1) await delay(250)
state = await readState()
assert(
  state.status === 'VICTORY' && state.progression === 'VICTORY',
  `Paper King death did not complete the game: ${JSON.stringify(state)}`
)

await delay(600)
const result = await evaluate(`(() => {
  globalThis.__paperbaneRouteUnsubscribe?.()
  const state = globalThis.__paperbaneRouteStore.getState()
  const victoryOverlay = document.querySelector('.game-overlay--victory')
  const victoryPanel = document.querySelector('.game-overlay__panel--victory')
  const victoryPanelRect = victoryPanel?.getBoundingClientRect()
  const victoryOverflow = victoryOverlay ? getComputedStyle(victoryOverlay) : null
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
    pointerLocked: document.pointerLockElement === document.querySelector('canvas'),
    layout: {
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      documentWidth: document.documentElement.scrollWidth,
      documentHeight: document.documentElement.scrollHeight,
      bodyWidth: document.body.scrollWidth,
      bodyHeight: document.body.scrollHeight,
      bodyClass: document.body.className,
      victoryOverlay: victoryOverlay ? {
        clientWidth: victoryOverlay.clientWidth,
        scrollWidth: victoryOverlay.scrollWidth,
        clientHeight: victoryOverlay.clientHeight,
        scrollHeight: victoryOverlay.scrollHeight,
        overflowX: victoryOverflow?.overflowX,
        overflowY: victoryOverflow?.overflowY
      } : null,
      victoryPanel: victoryPanelRect ? {
        left: victoryPanelRect.left,
        top: victoryPanelRect.top,
        right: victoryPanelRect.right,
        bottom: victoryPanelRect.bottom
      } : null
    }
  }
})()`)

const screenshot = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
await mkdir('smoke-artifacts', { recursive: true })
await writeFile('smoke-artifacts/full-route-victory.png', Buffer.from(screenshot.data, 'base64'))

assert(result.pageText.includes('THE SIGNAL IS') && result.pageText.includes('RESTORED'), 'Victory screen did not appear')
assert(result.state.bossHp === 0, 'Boss health did not reach zero')
assert(result.layout.documentWidth <= result.layout.innerWidth + 1, `Victory layout overflowed horizontally: ${JSON.stringify(result.layout)}`)
assert(result.layout.documentHeight <= result.layout.innerHeight + 1, `Victory layout overflowed vertically: ${JSON.stringify(result.layout)}`)
assert(result.layout.victoryOverlay?.overflowX === 'hidden', `Victory overlay did not clip horizontal rays: ${JSON.stringify(result.layout.victoryOverlay)}`)
assert(result.layout.victoryOverlay?.overflowY === 'hidden', `Desktop victory overlay unexpectedly scrolls: ${JSON.stringify(result.layout.victoryOverlay)}`)
assert(
  result.layout.victoryPanel?.left >= 0 &&
  result.layout.victoryPanel?.top >= 0 &&
  result.layout.victoryPanel?.right <= result.layout.innerWidth &&
  result.layout.victoryPanel?.bottom <= result.layout.innerHeight,
  `Victory panel was clipped: ${JSON.stringify(result.layout)}`
)

const victoryResponsiveLayouts = []
for (const viewport of [{ width: 640, height: 560 }, { width: 1024, height: 520 }]) {
  await command('Emulation.setDeviceMetricsOverride', {
    width: viewport.width,
    height: viewport.height,
    deviceScaleFactor: 1,
    mobile: false
  })
  await delay(220)
  const responsiveLayout = await evaluate(`(() => {
    const overlay = document.querySelector('.game-overlay--victory')
    const panel = document.querySelector('.game-overlay__panel--victory')
    const gamePage = document.querySelector('.game-page')
    if (!overlay || !panel || !gamePage) return null
    overlay.scrollTop = overlay.scrollHeight
    const panelRect = panel.getBoundingClientRect()
    const gameRect = gamePage.getBoundingClientRect()
    const buttons = Array.from(panel.querySelectorAll('button, a')).map((button) => {
      const rect = button.getBoundingClientRect()
      return {
        text: button.textContent.trim(),
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        clippedText: button.scrollWidth > button.clientWidth + 1 || button.scrollHeight > button.clientHeight + 1
      }
    })
    const style = getComputedStyle(overlay)
    const lastButton = buttons.at(-1)
    return {
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      documentWidth: document.documentElement.scrollWidth,
      panel: { left: panelRect.left, right: panelRect.right, top: panelRect.top, bottom: panelRect.bottom },
      gamePage: { width: gameRect.width, height: gameRect.height },
      overlay: {
        clientWidth: overlay.clientWidth,
        clientHeight: overlay.clientHeight,
        scrollHeight: overlay.scrollHeight,
        scrollTop: overlay.scrollTop,
        overflowX: style.overflowX,
        overflowY: style.overflowY
      },
      buttons,
      lastButtonVisible: Boolean(lastButton && lastButton.top >= -1 && lastButton.bottom <= window.innerHeight + 1)
    }
  })()`)
  assert(responsiveLayout, `Victory responsive layout did not render at ${JSON.stringify(viewport)}`)
  assert(responsiveLayout.documentWidth <= viewport.width + 1, `Victory page overflowed at ${JSON.stringify({ viewport, responsiveLayout })}`)
  assert(responsiveLayout.gamePage.width <= viewport.width + 1 && responsiveLayout.gamePage.height <= viewport.height + 1, `Game viewport minimum size leaked at ${JSON.stringify({ viewport, responsiveLayout })}`)
  assert(responsiveLayout.panel.left >= 0 && responsiveLayout.panel.right <= viewport.width + 1, `Victory panel clipped horizontally at ${JSON.stringify({ viewport, responsiveLayout })}`)
  assert(responsiveLayout.overlay.overflowX === 'hidden' && responsiveLayout.overlay.overflowY === 'auto', `Victory overflow policy failed at ${JSON.stringify({ viewport, responsiveLayout })}`)
  assert(!responsiveLayout.buttons.some((button) => button.clippedText), `Victory button text clipped at ${JSON.stringify({ viewport, responsiveLayout })}`)
  assert(responsiveLayout.lastButtonVisible, `Victory actions were not reachable by scrolling at ${JSON.stringify({ viewport, responsiveLayout })}`)
  victoryResponsiveLayouts.push({ viewport, ...responsiveLayout })
}

await command('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false })
assert(browserErrors.length === 0, `Browser errors: ${browserErrors.join(' | ')}`)
socket.close()
console.log(JSON.stringify({ ...result, victoryResponsiveLayouts, modelMetrics, browserErrors }, null, 2))
