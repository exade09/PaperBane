import { useEffect, useRef } from 'react'
import { useGameStore } from './GameState'
import type { GameStatus } from './GameConfig'

export type GameAudioCue =
  | 'footstep'
  | 'light-attack'
  | 'heavy-attack'
  | 'impact'
  | 'heavy-impact'
  | 'enemy'
  | 'player-damage'
  | 'terminal'
  | 'surge'
  | 'boss-warning'
  | 'dodge'
  | 'crate'
  | 'pickup'
  | 'victory'
  | 'death'
  | 'ui-hover'
  | 'ui-click'

type AudioListener = (cue: GameAudioCue, intensity: number) => void

const audioListeners = new Set<AudioListener>()

export const audioBus = {
  emit(cue: GameAudioCue, intensity = 1) {
    audioListeners.forEach((listener) => listener(cue, intensity))
  },
  on(listener: AudioListener) {
    audioListeners.add(listener)
    return () => {
      audioListeners.delete(listener)
    }
  }
}

export const emitGameAudio = (cue: GameAudioCue, intensity = 1) => audioBus.emit(cue, intensity)

class PaperBaneAudioEngine {
  private readonly context: AudioContext
  private readonly master: GainNode
  private readonly music: GainNode
  private readonly sfx: GainNode
  private readonly baseTrack: GainNode
  private readonly bossTrack: GainNode
  private readonly musicSources: AudioScheduledSourceNode[] = []
  private scheduler: number | null = null
  private activeTrack: 'base' | 'boss' | 'silent' = 'silent'
  private nextBaseStep = 0
  private nextBossStep = 0
  private baseStep = 0
  private bossStep = 0
  private volume = 0.65
  private muted = false

  constructor(volume: number, muted: boolean) {
    this.context = new AudioContext({ latencyHint: 'interactive' })
    this.master = this.context.createGain()
    this.music = this.context.createGain()
    this.sfx = this.context.createGain()
    this.baseTrack = this.context.createGain()
    this.bossTrack = this.context.createGain()

    const compressor = this.context.createDynamicsCompressor()
    compressor.threshold.value = -13
    compressor.knee.value = 14
    compressor.ratio.value = 4
    compressor.attack.value = 0.004
    compressor.release.value = 0.28

    const reverb = this.context.createConvolver()
    const reverbReturn = this.context.createGain()
    reverb.buffer = this.createReverbImpulse(1.85, 2.7)
    reverbReturn.gain.value = 0.16

    this.baseTrack.connect(this.music)
    this.bossTrack.connect(this.music)
    this.baseTrack.connect(reverb)
    this.bossTrack.connect(reverb)
    reverb.connect(reverbReturn).connect(this.music)
    this.music.connect(this.master)
    this.sfx.connect(this.master)
    this.master.connect(compressor).connect(this.context.destination)

    this.music.gain.value = 0
    this.baseTrack.gain.value = 0
    this.bossTrack.gain.value = 0
    this.sfx.gain.value = 1
    this.volume = volume
    this.muted = muted
    this.updateMaster(true)
    this.startBaseBed()
    this.startBossBed()
    this.scheduler = window.setInterval(() => this.scheduleMusic(), 90)
  }

  resume() {
    if (this.context.state === 'suspended') void this.context.resume()
  }

  setVolume(volume: number, muted: boolean) {
    this.volume = volume
    this.muted = muted
    this.updateMaster(false)
  }

  setGameState(status: GameStatus, bossActive: boolean, bossAlive: boolean) {
    const isGameSession = status === 'PLAYING' || status === 'BOSS_INTRO' || status === 'PAUSED'
    const nextTrack = isGameSession
      ? bossAlive
        ? 'boss'
        : bossActive
          ? 'silent'
          : 'base'
      : 'silent'
    const musicLevel = status === 'PLAYING' || status === 'BOSS_INTRO'
      ? 1
      : status === 'PAUSED'
        ? 0.28
        : 0
    const now = this.context.currentTime

    this.rampGain(this.music, musicLevel, status === 'PAUSED' ? 0.35 : 0.8)
    if (nextTrack === this.activeTrack) return

    this.activeTrack = nextTrack
    const fadeTime = 2.4
    this.rampGain(this.baseTrack, nextTrack === 'base' ? 0.82 : 0, fadeTime)
    this.rampGain(this.bossTrack, nextTrack === 'boss' ? 0.9 : 0, fadeTime)

    if (nextTrack === 'base') {
      this.nextBaseStep = now + 0.08
      this.baseStep = 0
    } else if (nextTrack === 'boss') {
      this.nextBossStep = now + 0.08
      this.bossStep = 0
    }
  }

  play(cue: GameAudioCue, rawIntensity = 1) {
    if (this.context.state === 'suspended') return
    const intensity = Math.max(0.1, Math.min(1.5, rawIntensity))

    switch (cue) {
      case 'footstep':
        this.noise(0.09, 0.075 * intensity, 290, 'lowpass')
        this.tone(78, 54, 0.08, 'sine', 0.04 * intensity)
        break
      case 'light-attack':
        this.noise(0.16, 0.095 * intensity, 980, 'bandpass')
        this.tone(210, 82, 0.15, 'sawtooth', 0.04 * intensity)
        break
      case 'heavy-attack':
        this.noise(0.3, 0.15 * intensity, 690, 'bandpass')
        this.tone(164, 38, 0.34, 'sawtooth', 0.09 * intensity)
        break
      case 'impact':
        this.noise(0.095, 0.15 * intensity, 720, 'lowpass')
        this.tone(108, 62, 0.12, 'square', 0.075 * intensity)
        break
      case 'heavy-impact':
        this.noise(0.22, 0.22 * intensity, 510, 'lowpass')
        this.tone(86, 34, 0.28, 'sawtooth', 0.13 * intensity)
        break
      case 'enemy':
        this.tone(96, 57, 0.42, 'sawtooth', 0.055 * intensity)
        this.tone(101, 48, 0.38, 'square', 0.025 * intensity, 0.035)
        break
      case 'player-damage':
        this.noise(0.2, 0.19 * intensity, 430, 'lowpass')
        this.tone(112, 41, 0.31, 'square', 0.1 * intensity)
        break
      case 'terminal':
        this.tone(220, 220, 0.15, 'square', 0.045 * intensity)
        this.tone(330, 330, 0.18, 'square', 0.05 * intensity, 0.13)
        this.tone(495, 495, 0.42, 'sine', 0.065 * intensity, 0.27)
        break
      case 'surge':
        this.noise(0.65, 0.08 * intensity, 1450, 'highpass')
        this.tone(110, 220, 0.24, 'sawtooth', 0.065 * intensity)
        this.tone(220, 440, 0.3, 'sawtooth', 0.075 * intensity, 0.18)
        this.tone(440, 660, 0.5, 'sine', 0.08 * intensity, 0.4)
        break
      case 'boss-warning':
        this.tone(62, 39, 1.05, 'sawtooth', 0.12 * intensity)
        this.tone(65, 42, 1.05, 'square', 0.04 * intensity)
        this.noise(0.65, 0.07 * intensity, 240, 'lowpass', 0.18)
        break
      case 'dodge':
        this.noise(0.19, 0.08 * intensity, 1250, 'bandpass')
        this.tone(174, 91, 0.16, 'triangle', 0.025 * intensity)
        break
      case 'crate':
        this.noise(0.24, 0.16 * intensity, 820, 'lowpass')
        this.tone(142, 48, 0.16, 'square', 0.055 * intensity)
        break
      case 'pickup':
        this.tone(392, 522, 0.13, 'square', 0.035 * intensity)
        this.tone(522, 784, 0.2, 'sine', 0.04 * intensity, 0.11)
        break
      case 'victory':
        this.tone(196, 196, 0.42, 'triangle', 0.055 * intensity)
        this.tone(294, 294, 0.5, 'triangle', 0.06 * intensity, 0.2)
        this.tone(392, 392, 0.85, 'sine', 0.07 * intensity, 0.42)
        break
      case 'death':
        this.noise(0.8, 0.055 * intensity, 260, 'lowpass')
        this.tone(108, 34, 1.25, 'sawtooth', 0.085 * intensity)
        break
      case 'ui-hover':
        this.tone(294, 328, 0.045, 'square', 0.018 * intensity)
        break
      case 'ui-click':
        this.tone(165, 247, 0.07, 'square', 0.032 * intensity)
        this.tone(330, 330, 0.055, 'square', 0.016 * intensity, 0.045)
        break
    }
  }

  destroy() {
    if (this.scheduler !== null) window.clearInterval(this.scheduler)
    this.musicSources.forEach((source) => {
      try {
        source.stop()
      } catch {
        return
      }
    })
    if (this.context.state !== 'closed') void this.context.close()
  }

  private updateMaster(immediate: boolean) {
    const now = this.context.currentTime
    const target = this.muted ? 0 : Math.pow(this.volume, 1.35) * 0.48
    this.master.gain.cancelScheduledValues(now)
    if (immediate) this.master.gain.setValueAtTime(target, now)
    else this.master.gain.linearRampToValueAtTime(target, now + 0.08)
  }

  // The score is authored here and synthesised locally. It contains no sampled
  // or copyrighted soundtrack material.
  private startBaseBed() {
    const filter = this.context.createBiquadFilter()
    const drift = this.context.createOscillator()
    const driftDepth = this.context.createGain()
    const root = this.context.createOscillator()
    const rootGain = this.context.createGain()
    const upper = this.context.createOscillator()
    const upperGain = this.context.createGain()
    const fog = this.createLoopingNoise(7.5)
    const fogFilter = this.context.createBiquadFilter()
    const fogGain = this.context.createGain()
    const now = this.context.currentTime

    filter.type = 'lowpass'
    filter.frequency.setValueAtTime(205, now)
    filter.Q.value = 1.35
    drift.type = 'sine'
    drift.frequency.value = 0.047
    driftDepth.gain.value = 58
    root.type = 'sine'
    root.frequency.value = 38.89
    rootGain.gain.value = 0.052
    upper.type = 'triangle'
    upper.frequency.value = 58.33
    upper.detune.value = -9
    upperGain.gain.value = 0.012
    fog.loop = true
    fogFilter.type = 'bandpass'
    fogFilter.frequency.value = 430
    fogFilter.Q.value = 0.34
    fogGain.gain.value = 0.018

    drift.connect(driftDepth).connect(filter.frequency)
    root.connect(rootGain).connect(filter)
    upper.connect(upperGain).connect(filter)
    filter.connect(this.baseTrack)
    fog.connect(fogFilter).connect(fogGain).connect(this.baseTrack)
    drift.start()
    root.start()
    upper.start()
    fog.start()
    this.musicSources.push(drift, root, upper, fog)
  }

  private startBossBed() {
    const filter = this.context.createBiquadFilter()
    const pulse = this.context.createOscillator()
    const pulseGain = this.context.createGain()
    const undertone = this.context.createOscillator()
    const undertoneGain = this.context.createGain()
    const movement = this.context.createOscillator()
    const movementDepth = this.context.createGain()
    const rumble = this.createLoopingNoise(5.25)
    const rumbleFilter = this.context.createBiquadFilter()
    const rumbleGain = this.context.createGain()

    filter.type = 'lowpass'
    filter.frequency.value = 142
    filter.Q.value = 2.2
    pulse.type = 'sawtooth'
    pulse.frequency.value = 36.71
    pulse.detune.value = -7
    pulseGain.gain.value = 0.027
    undertone.type = 'square'
    undertone.frequency.value = 25.96
    undertoneGain.gain.value = 0.012
    movement.type = 'sine'
    movement.frequency.value = 0.115
    movementDepth.gain.value = 44
    rumble.loop = true
    rumbleFilter.type = 'lowpass'
    rumbleFilter.frequency.value = 105
    rumbleFilter.Q.value = 0.8
    rumbleGain.gain.value = 0.034

    pulse.connect(pulseGain).connect(filter)
    undertone.connect(undertoneGain).connect(filter)
    movement.connect(movementDepth).connect(filter.frequency)
    filter.connect(this.bossTrack)
    rumble.connect(rumbleFilter).connect(rumbleGain).connect(this.bossTrack)
    pulse.start()
    undertone.start()
    movement.start()
    rumble.start()
    this.musicSources.push(pulse, undertone, movement, rumble)
  }

  private scheduleMusic() {
    if (this.context.state !== 'running') return
    const now = this.context.currentTime
    const horizon = now + 0.42

    if (this.activeTrack === 'base') {
      if (this.nextBaseStep < now - 0.15) this.nextBaseStep = now + 0.05
      while (this.nextBaseStep < horizon) {
        this.scheduleBaseStep(this.nextBaseStep, this.baseStep)
        this.nextBaseStep += 60 / 46
        this.baseStep = (this.baseStep + 1) % 16
      }
    } else if (this.activeTrack === 'boss') {
      if (this.nextBossStep < now - 0.15) this.nextBossStep = now + 0.05
      while (this.nextBossStep < horizon) {
        this.scheduleBossStep(this.nextBossStep, this.bossStep)
        this.nextBossStep += 60 / 84
        this.bossStep = (this.bossStep + 1) % 16
      }
    }
  }

  private scheduleBaseStep(start: number, step: number) {
    const notes: Array<number | null> = [
      116.54, null, null, 92.5, null, null, 123.47, null,
      103.83, null, null, 77.78, null, 87.31, null, null
    ]
    const note = notes[step]
    if (note !== null) {
      this.musicTone(note, note * 0.997, 3.8, 'sine', 0.029, start, this.baseTrack, 0.65, 0.9)
      this.musicTone(note * 2.01, note * 2, 2.7, 'triangle', 0.0085, start + 0.12, this.baseTrack, 0.8, 1.2)
    }
    if (step === 6 || step === 14) {
      this.musicNoise(2.4, 0.009, step === 6 ? 1280 : 790, 'bandpass', start, this.baseTrack, 1.2)
    }
  }

  private scheduleBossStep(start: number, step: number) {
    const accented = step % 4 === 0
    const offBeat = step % 4 === 2
    this.musicTone(
      accented ? 61 : 48,
      accented ? 31 : 34,
      accented ? 0.46 : 0.25,
      'sine',
      accented ? 0.17 : 0.075,
      start,
      this.bossTrack,
      0.008,
      0.18
    )
    if (accented || offBeat) {
      this.musicNoise(
        accented ? 0.18 : 0.09,
        accented ? 0.075 : 0.034,
        accented ? 520 : 1180,
        'bandpass',
        start,
        this.bossTrack,
        0.012
      )
    }
    if (step === 0 || step === 8) {
      const root = step === 0 ? 73.42 : 69.3
      this.musicTone(root, root * 0.985, 2.2, 'sawtooth', 0.035, start, this.bossTrack, 0.08, 0.8, 310)
      this.musicTone(root * Math.SQRT2, root * 1.405, 1.8, 'triangle', 0.016, start + 0.05, this.bossTrack, 0.12, 0.75, 480)
    }
    if (step === 7 || step === 15) {
      this.musicNoise(0.72, 0.026, 2240, 'highpass', start, this.bossTrack, 0.08)
    }
  }

  private musicTone(
    from: number,
    to: number,
    duration: number,
    type: OscillatorType,
    level: number,
    start: number,
    destination: AudioNode,
    attack: number,
    release: number,
    cutoff = 1250
  ) {
    const oscillator = this.context.createOscillator()
    const filter = this.context.createBiquadFilter()
    const gain = this.context.createGain()
    const attackEnd = Math.min(start + attack, start + duration * 0.45)
    const releaseStart = Math.max(attackEnd, start + duration - release)
    oscillator.type = type
    oscillator.frequency.setValueAtTime(Math.max(1, from), start)
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, to), start + duration)
    filter.type = 'lowpass'
    filter.frequency.value = cutoff
    filter.Q.value = 0.9
    gain.gain.setValueAtTime(0.0001, start)
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, level), attackEnd)
    gain.gain.setValueAtTime(Math.max(0.0001, level), releaseStart)
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration)
    oscillator.connect(filter).connect(gain).connect(destination)
    oscillator.start(start)
    oscillator.stop(start + duration + 0.04)
  }

  private musicNoise(
    duration: number,
    level: number,
    frequency: number,
    filterType: BiquadFilterType,
    start: number,
    destination: AudioNode,
    attack: number
  ) {
    const source = this.context.createBufferSource()
    const filter = this.context.createBiquadFilter()
    const gain = this.context.createGain()
    source.buffer = this.createNoiseBuffer(duration)
    filter.type = filterType
    filter.frequency.value = frequency
    filter.Q.value = filterType === 'bandpass' ? 1.4 : 0.55
    gain.gain.setValueAtTime(0.0001, start)
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, level), start + Math.min(attack, duration * 0.45))
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration)
    source.connect(filter).connect(gain).connect(destination)
    source.start(start)
    source.stop(start + duration + 0.03)
  }

  private createLoopingNoise(duration: number) {
    const source = this.context.createBufferSource()
    source.buffer = this.createNoiseBuffer(duration, true)
    return source
  }

  private createNoiseBuffer(duration: number, softened = false) {
    const frames = Math.max(1, Math.floor(this.context.sampleRate * duration))
    const buffer = this.context.createBuffer(1, frames, this.context.sampleRate)
    const data = buffer.getChannelData(0)
    let previous = 0
    for (let index = 0; index < frames; index += 1) {
      const white = Math.random() * 2 - 1
      previous = softened ? previous * 0.82 + white * 0.18 : white
      data[index] = previous
    }
    return buffer
  }

  private createReverbImpulse(duration: number, decay: number) {
    const frames = Math.max(1, Math.floor(this.context.sampleRate * duration))
    const impulse = this.context.createBuffer(2, frames, this.context.sampleRate)
    let seed = 0x51a7
    const random = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0
      return seed / 0x100000000
    }
    for (let channel = 0; channel < impulse.numberOfChannels; channel += 1) {
      const data = impulse.getChannelData(channel)
      for (let index = 0; index < frames; index += 1) {
        const envelope = Math.pow(1 - index / frames, decay)
        data[index] = (random() * 2 - 1) * envelope
      }
    }
    return impulse
  }

  private rampGain(node: GainNode, target: number, duration: number) {
    const now = this.context.currentTime
    const current = Math.max(0, node.gain.value)
    node.gain.cancelScheduledValues(now)
    node.gain.setValueAtTime(current, now)
    node.gain.linearRampToValueAtTime(target, now + duration)
  }

  private tone(
    from: number,
    to: number,
    duration: number,
    type: OscillatorType,
    level: number,
    delay = 0
  ) {
    const start = this.context.currentTime + delay
    const oscillator = this.context.createOscillator()
    const gain = this.context.createGain()
    const filter = this.context.createBiquadFilter()
    oscillator.type = type
    oscillator.frequency.setValueAtTime(Math.max(1, from), start)
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, to), start + duration)
    filter.type = 'lowpass'
    filter.frequency.value = 1900
    gain.gain.setValueAtTime(0.0001, start)
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, level), start + 0.009)
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration)
    oscillator.connect(filter).connect(gain).connect(this.sfx)
    oscillator.start(start)
    oscillator.stop(start + duration + 0.025)
  }

  private noise(
    duration: number,
    level: number,
    frequency: number,
    filterType: BiquadFilterType,
    delay = 0
  ) {
    const start = this.context.currentTime + delay
    const buffer = this.createNoiseBuffer(duration)
    const data = buffer.getChannelData(0)
    for (let index = 0; index < buffer.length; index += 1) {
      const envelope = 1 - index / buffer.length
      data[index] *= envelope
    }
    const source = this.context.createBufferSource()
    const filter = this.context.createBiquadFilter()
    const gain = this.context.createGain()
    source.buffer = buffer
    filter.type = filterType
    filter.frequency.value = frequency
    filter.Q.value = filterType === 'bandpass' ? 0.8 : 0.45
    gain.gain.setValueAtTime(level, start)
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration)
    source.connect(filter).connect(gain).connect(this.sfx)
    source.start(start)
  }
}

export function AudioSystem() {
  const volume = useGameStore((state) => state.volume)
  const muted = useGameStore((state) => state.muted)
  const status = useGameStore((state) => state.status)
  const bossActive = useGameStore((state) => state.bossActive)
  const bossAlive = useGameStore((state) => state.bossActive && state.bossHp > 0)
  const message = useGameStore((state) => state.message)
  const hp = useGameStore((state) => state.hp)
  const combo = useGameStore((state) => state.combo)
  const engineRef = useRef<PaperBaneAudioEngine | null>(null)
  const previousStatus = useRef(status)
  const previousMessage = useRef(message)
  const previousHp = useRef(hp)
  const previousCombo = useRef(combo)
  const settingsRef = useRef({ volume, muted, status, bossActive, bossAlive })

  settingsRef.current = { volume, muted, status, bossActive, bossAlive }

  useEffect(() => {
    const unlock = () => {
      if (!engineRef.current) {
        const settings = settingsRef.current
        engineRef.current = new PaperBaneAudioEngine(settings.volume, settings.muted)
        engineRef.current.setGameState(settings.status, settings.bossActive, settings.bossAlive)
      }
      engineRef.current.resume()
    }

    window.addEventListener('pointerdown', unlock, { capture: true })
    window.addEventListener('keydown', unlock, { capture: true })
    return () => {
      window.removeEventListener('pointerdown', unlock, { capture: true })
      window.removeEventListener('keydown', unlock, { capture: true })
      engineRef.current?.destroy()
      engineRef.current = null
    }
  }, [])

  useEffect(() => audioBus.on((cue, intensity) => engineRef.current?.play(cue, intensity)), [])

  useEffect(() => {
    engineRef.current?.setVolume(volume, muted)
  }, [volume, muted])

  useEffect(() => {
    const engine = engineRef.current
    engine?.setGameState(status, bossActive, bossAlive)
    if (status !== previousStatus.current) {
      if (status === 'PLAYER_DEAD') engine?.play('death')
      if (status === 'VICTORY') engine?.play('victory')
      if (status === 'BOSS_INTRO') engine?.play('boss-warning')
      previousStatus.current = status
    }
  }, [bossActive, bossAlive, status])

  useEffect(() => {
    if (message && message !== previousMessage.current) {
      if (message === 'SIGNAL RESTORED') engineRef.current?.play('terminal')
      if (message === 'GREEN WICK ACTIVE') engineRef.current?.play('surge')
      if (message === 'MEDKIT USED') engineRef.current?.play('pickup')
    }
    previousMessage.current = message
  }, [message])

  useEffect(() => {
    if (hp < previousHp.current) engineRef.current?.play('player-damage')
    previousHp.current = hp
  }, [hp])

  useEffect(() => {
    if (combo > previousCombo.current) engineRef.current?.play('impact')
    previousCombo.current = combo
  }, [combo])

  useEffect(() => {
    const onPointerOver = (event: PointerEvent) => {
      if (!(event.target instanceof Element)) return
      const control = event.target.closest<HTMLElement>('button, a[href], input[type="range"]')
      if (!control) return
      if (event.relatedTarget instanceof Node && control.contains(event.relatedTarget)) return
      audioBus.emit('ui-hover', 0.7)
    }
    const onClick = (event: MouseEvent) => {
      if (event.target instanceof Element && event.target.closest('button, a[href], input[type="range"]')) {
        audioBus.emit('ui-click', 0.8)
      }
    }
    document.addEventListener('pointerover', onPointerOver)
    document.addEventListener('click', onClick)
    return () => {
      document.removeEventListener('pointerover', onPointerOver)
      document.removeEventListener('click', onClick)
    }
  }, [])

  return null
}

export default AudioSystem
