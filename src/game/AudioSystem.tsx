import { useEffect, useRef } from 'react'
import { useGameStore } from './GameState'

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
  private readonly ambience: GainNode
  private readonly ambientSources: AudioScheduledSourceNode[] = []
  private volume = 0.65
  private muted = false

  constructor(volume: number, muted: boolean) {
    this.context = new AudioContext({ latencyHint: 'interactive' })
    this.master = this.context.createGain()
    this.ambience = this.context.createGain()
    this.master.connect(this.context.destination)
    this.ambience.connect(this.master)
    this.volume = volume
    this.muted = muted
    this.updateMaster(true)
    this.startAmbience()
  }

  resume() {
    if (this.context.state === 'suspended') void this.context.resume()
  }

  setVolume(volume: number, muted: boolean) {
    this.volume = volume
    this.muted = muted
    this.updateMaster(false)
  }

  setStatus(status: string) {
    const target = status === 'PLAYING' || status === 'BOSS_INTRO' ? 1 : status === 'PAUSED' ? 0.45 : 0.28
    this.ambience.gain.cancelScheduledValues(this.context.currentTime)
    this.ambience.gain.linearRampToValueAtTime(0.035 * target, this.context.currentTime + 0.35)
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
    this.ambientSources.forEach((source) => {
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

  private startAmbience() {
    const filter = this.context.createBiquadFilter()
    const drift = this.context.createOscillator()
    const driftDepth = this.context.createGain()
    const low = this.context.createOscillator()
    const fifth = this.context.createOscillator()
    const now = this.context.currentTime

    filter.type = 'lowpass'
    filter.frequency.setValueAtTime(155, now)
    filter.Q.value = 1.1
    drift.type = 'sine'
    drift.frequency.value = 0.075
    driftDepth.gain.value = 42
    low.type = 'sine'
    low.frequency.value = 43
    fifth.type = 'triangle'
    fifth.frequency.value = 64.5
    this.ambience.gain.setValueAtTime(0.025, now)

    drift.connect(driftDepth).connect(filter.frequency)
    low.connect(filter)
    fifth.connect(filter)
    filter.connect(this.ambience)
    drift.start()
    low.start()
    fifth.start()
    this.ambientSources.push(drift, low, fifth)
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
    oscillator.connect(filter).connect(gain).connect(this.master)
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
    const frames = Math.max(1, Math.floor(this.context.sampleRate * duration))
    const buffer = this.context.createBuffer(1, frames, this.context.sampleRate)
    const data = buffer.getChannelData(0)
    for (let index = 0; index < frames; index += 1) {
      const envelope = 1 - index / frames
      data[index] = (Math.random() * 2 - 1) * envelope
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
    source.connect(filter).connect(gain).connect(this.master)
    source.start(start)
  }
}

export function AudioSystem() {
  const volume = useGameStore((state) => state.volume)
  const muted = useGameStore((state) => state.muted)
  const status = useGameStore((state) => state.status)
  const message = useGameStore((state) => state.message)
  const hp = useGameStore((state) => state.hp)
  const combo = useGameStore((state) => state.combo)
  const engineRef = useRef<PaperBaneAudioEngine | null>(null)
  const previousStatus = useRef(status)
  const previousMessage = useRef(message)
  const previousHp = useRef(hp)
  const previousCombo = useRef(combo)
  const settingsRef = useRef({ volume, muted, status })

  settingsRef.current = { volume, muted, status }

  useEffect(() => {
    const unlock = () => {
      if (!engineRef.current) {
        const settings = settingsRef.current
        engineRef.current = new PaperBaneAudioEngine(settings.volume, settings.muted)
        engineRef.current.setStatus(settings.status)
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
    engine?.setStatus(status)
    if (status !== previousStatus.current) {
      if (status === 'PLAYER_DEAD') engine?.play('death')
      if (status === 'VICTORY') engine?.play('victory')
      if (status === 'BOSS_INTRO') engine?.play('boss-warning')
      previousStatus.current = status
    }
  }, [status])

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
