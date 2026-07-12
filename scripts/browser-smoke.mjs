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
const webgl = await evaluate(`(() => {
  const canvas = document.querySelector('canvas')
  const context = canvas?.getContext('webgl2') ?? canvas?.getContext('webgl')
  if (!canvas || !context) return null
  return {
    width: canvas.width,
    height: canvas.height,
    renderer: context.getParameter(context.RENDERER),
    version: context.getParameter(context.VERSION),
    contextLost: context.isContextLost(),
    glError: context.getError()
  }
})()`)
assert(webgl && webgl.width > 0 && webgl.height > 0, 'WebGL context is unavailable')
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
  frameState,
  webgl,
  browserErrors: browserErrors.length
}))
