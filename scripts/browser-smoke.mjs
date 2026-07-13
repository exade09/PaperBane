import { mkdir, writeFile } from 'node:fs/promises'

const endpoint = process.env.CDP_ENDPOINT ?? 'http://127.0.0.1:9222'
const baseUrl = process.env.TEST_URL ?? 'http://127.0.0.1:4173'

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))

async function waitForBrowser() {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const response = await fetch(`${endpoint}/json/version`)
      if (response.ok) return
    } catch {
      await delay(250)
    }
  }
  throw new Error('Headless browser did not expose the debugging endpoint')
}

await waitForBrowser()

const pageResponse = await fetch(`${endpoint}/json/new?${encodeURIComponent(`${baseUrl}/`)}`, { method: 'PUT' })
if (!pageResponse.ok) throw new Error(`Unable to create browser page ${pageResponse.status}`)
const page = await pageResponse.json()
const socket = new WebSocket(page.webSocketDebuggerUrl)
const pending = new Map()
const browserErrors = []
let nextId = 0

const opened = new Promise((resolve, reject) => {
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
  if (message.method === 'Runtime.exceptionThrown') {
    browserErrors.push(message.params.exceptionDetails.text)
  }
  if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error') {
    browserErrors.push(message.params.entry.text)
  }
})

await opened

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

const screenshot = async (name) => {
  const result = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
  await mkdir('smoke-artifacts', { recursive: true })
  await writeFile(`smoke-artifacts/${name}.png`, Buffer.from(result.data, 'base64'))
}

const assert = (condition, message) => {
  if (!condition) throw new Error(message)
}

await command('Page.enable')
await command('Runtime.enable')
await command('Log.enable')
await command('Page.bringToFront')
await command('Emulation.setDeviceMetricsOverride', {
  width: 1440,
  height: 1000,
  deviceScaleFactor: 1,
  mobile: false
})

await command('Page.navigate', { url: `${baseUrl}/` })
await delay(6000)

const home = await evaluate(`(() => ({
  title: document.title,
  text: document.body.innerText,
  canvases: document.querySelectorAll('canvas').length,
  socialLinks: Array.from(document.querySelectorAll('.pb-social-link')).map((link) => ({
    href: link.href,
    target: link.target,
    rel: link.rel
  }))
}))()`)

assert(home.title === 'PaperBane | Hold the Wick', 'Homepage title is incorrect')
assert(home.text.includes('Kill the panic Hold the wick'), 'Hero slogan is missing')
assert(home.text.includes('GAME ONLINE'), 'Game status is missing')
assert(home.canvases >= 1, 'Cinematic hero canvas is missing')
assert(home.socialLinks.length >= 4, 'Social links are missing')
assert(home.socialLinks.every((link) => link.target === '_blank' && link.rel.includes('noopener') && link.rel.includes('noreferrer')), 'Social links are unsafe')
await screenshot('homepage-hero')

await evaluate(`Array.from(document.querySelectorAll('button')).find((button) => button.textContent.trim() === 'STORY').click()`)
await delay(300)
assert(await evaluate(`document.querySelector('[role="dialog"]')?.innerText.includes('THE FOG OF BLACKWICK')`), 'Story modal did not open')
await command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape' })
await command('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape' })
await delay(250)
assert(!(await evaluate(`Boolean(document.querySelector('[role="dialog"]'))`)), 'Story modal did not close with Escape')

await evaluate(`Array.from(document.querySelectorAll('button')).find((button) => button.textContent.trim() === 'TOKENOMICS').click()`)
await delay(250)
const tokenText = await evaluate(`document.querySelector('[role="dialog"]')?.innerText ?? ''`)
for (const value of ['PaperBane', 'PBANE', '1B', 'Solana', 'Pump.fun', '0%', 'Contract will appear after launch']) {
  assert(tokenText.includes(value), `Tokenomics modal is missing ${value}`)
}
await command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape' })
await command('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape' })
await delay(250)

await evaluate(`Array.from(document.querySelectorAll('button')).find((button) => button.textContent.trim() === 'COMMUNITY').click()`)
await delay(250)
const community = await evaluate(`(() => {
  const dialog = document.querySelector('[role="dialog"]')
  return {
    text: dialog?.innerText ?? '',
    links: Array.from(dialog?.querySelectorAll('a') ?? []).map((link) => link.href)
  }
})()`)
assert(community.text.includes('JOIN THE COMMUNITY'), 'Community modal did not open')
assert(community.links.includes('https://t.me/'), 'Telegram link is incorrect')
assert(community.links.includes('https://x.com/'), 'X link is incorrect')
await screenshot('homepage')

await command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape' })
await command('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape' })
await delay(180)

const responsiveLayouts = []
for (const viewport of [
  { width: 320, height: 640 },
  { width: 375, height: 667 },
  { width: 768, height: 800 },
  { width: 1024, height: 768 },
  { width: 1440, height: 1000 },
  { width: 1920, height: 1080 }
]) {
  await command('Emulation.setDeviceMetricsOverride', {
    width: viewport.width,
    height: viewport.height,
    deviceScaleFactor: 1,
    mobile: viewport.width <= 375
  })
  await delay(180)
  await evaluate(`window.scrollTo(0, 0)`)
  await evaluate(`Array.from(document.querySelectorAll('button')).find((button) => button.textContent.trim() === 'TOKENOMICS').click()`)
  await delay(220)
  const layout = await evaluate(`(() => {
    const dialog = document.querySelector('[role="dialog"]')
    const content = dialog?.querySelector('.pb-modal__content')
    const cards = Array.from(dialog?.querySelectorAll('.pb-token-grid--modal > div') ?? [])
    const rects = cards.map((card) => {
      const label = card.querySelector('dt')?.getBoundingClientRect()
      const value = card.querySelector('dd')?.getBoundingClientRect()
      const cardRect = card.getBoundingClientRect()
      return {
        card: { left: cardRect.left, top: cardRect.top, right: cardRect.right, bottom: cardRect.bottom },
        label: label && { left: label.left, top: label.top, right: label.right, bottom: label.bottom },
        value: value && { left: value.left, top: value.top, right: value.right, bottom: value.bottom }
      }
    })
    const intersects = (a, b) => Boolean(a && b && Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1)
    const cardOverlap = rects.some((entry, index) => rects.slice(index + 1).some((other) => intersects(entry.card, other.card)))
    const textOverlap = rects.some((entry) => intersects(entry.label, entry.value))
    const dialogRect = dialog?.getBoundingClientRect()
    return {
      viewport: { width: innerWidth, height: innerHeight },
      documentWidth: document.documentElement.scrollWidth,
      dialogRect: dialogRect && { left: dialogRect.left, top: dialogRect.top, right: dialogRect.right, bottom: dialogRect.bottom },
      contentScrollable: Boolean(content && (content.scrollHeight <= content.clientHeight + 1 || getComputedStyle(content).overflowY === 'auto')),
      cardCount: cards.length,
      cardOverlap,
      textOverlap,
      clippedButtons: Array.from(dialog?.querySelectorAll('.pb-button') ?? []).some((button) => button.scrollWidth > button.clientWidth + 1)
    }
  })()`)
  assert(layout.documentWidth <= layout.viewport.width + 1, `Homepage overflow at ${viewport.width}px: ${JSON.stringify(layout)}`)
  assert(layout.dialogRect && layout.dialogRect.left >= -1 && layout.dialogRect.right <= layout.viewport.width + 1, `Tokenomics modal escaped ${viewport.width}px viewport: ${JSON.stringify(layout)}`)
  assert(layout.cardCount === 6, `Tokenomics rows are incomplete at ${viewport.width}px`)
  assert(!layout.cardOverlap && !layout.textOverlap, `Tokenomics content overlaps at ${viewport.width}px: ${JSON.stringify(layout)}`)
  assert(!layout.clippedButtons, `Tokenomics button text clips at ${viewport.width}px`)
  assert(layout.contentScrollable, `Tokenomics modal cannot scroll at ${viewport.width}px`)
  responsiveLayouts.push(layout)
  await command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape' })
  await command('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape' })
  await delay(120)
}

await command('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false })

await command('Page.navigate', { url: `${baseUrl}/play` })
await command('Page.bringToFront')
await delay(12000)
const menuText = await evaluate(`document.body.innerText`)
if (!menuText.includes('START GAME')) console.log(JSON.stringify({ menuText, browserErrors }))
assert(menuText.includes('START GAME'), 'Game main menu did not load')
assert(menuText.includes('HOLD THE WICK'), 'Game subtitle is missing')
assert(await evaluate(`document.querySelectorAll('canvas').length === 1`), 'Game canvas is missing')
await screenshot('game-menu')

await evaluate(`Array.from(document.querySelectorAll('button')).find((button) => button.textContent.trim() === 'START GAME').click()`)
await delay(1800)
const playText = await evaluate(`document.body.innerText`)
assert(playText.includes('THE HOLDER'), 'Player HUD did not start')
assert(playText.includes('REACH THE PUMP STATION'), 'Initial objective is incorrect')
const frameState = await evaluate(`new Promise((resolve) => requestAnimationFrame((time) => resolve({ time, visibility: document.visibilityState, focused: document.hasFocus() })))`)
const frameTiming = await evaluate(`new Promise((resolve) => {
  const samples = []
  let previous = performance.now()
  const sample = (now) => {
    if (samples.length > 0 || now > previous) samples.push(now - previous)
    previous = now
    if (samples.length < 120) requestAnimationFrame(sample)
    else {
      const sorted = [...samples].sort((a, b) => a - b)
      const averageMs = samples.reduce((sum, value) => sum + value, 0) / samples.length
      resolve({
        samples: samples.length,
        averageMs,
        p95Ms: sorted[Math.floor(sorted.length * 0.95)],
        estimatedFps: 1000 / averageMs,
        framesOver25Ms: samples.filter((value) => value > 25).length
      })
    }
  }
  requestAnimationFrame(sample)
})`)
const webgl = await evaluate(`(() => {
  const canvas = document.querySelector('canvas')
  const context = canvas?.getContext('webgl2') ?? canvas?.getContext('webgl')
  if (!canvas || !context) return null
  const rendererInfo = context.getExtension('WEBGL_debug_renderer_info')
  return {
    width: canvas.width,
    height: canvas.height,
    renderer: context.getParameter(context.RENDERER),
    unmaskedRenderer: rendererInfo ? context.getParameter(rendererInfo.UNMASKED_RENDERER_WEBGL) : 'unavailable',
    version: context.getParameter(context.VERSION),
    contextLost: context.isContextLost(),
    glError: context.getError()
  }
})()`)
assert(webgl && webgl.width > 0 && webgl.height > 0, 'WebGL context is unavailable')
const softwareRenderer = /swiftshader|llvmpipe|software/i.test(webgl.unmaskedRenderer)
if (!softwareRenderer) {
  assert(frameTiming.averageMs < 34 && frameTiming.p95Ms < 50, `Gameplay frame pacing regressed: ${JSON.stringify(frameTiming)}`)
}
await screenshot('game-playing')

await command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape' })
await command('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape' })
await delay(350)
assert((await evaluate(`document.body.innerText`)).includes('PAUSED'), 'Escape did not pause the game')

assert(browserErrors.length === 0, `Browser errors detected: ${browserErrors.join(' | ')}`)
socket.close()

console.log(JSON.stringify({
  homeCanvas: home.canvases,
  socialLinks: home.socialLinks.length,
  mainMenu: true,
  playingHud: true,
  pauseMenu: true,
  responsiveLayouts,
  frameState,
  frameTiming,
  webgl,
  softwareRenderer,
  browserErrors: browserErrors.length
}))
