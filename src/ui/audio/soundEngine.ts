import type { UserSettings } from '../settings';

export type AudioScene = 'lobby' | 'life' | 'war' | 'crisis' | 'epilogue';
export type SfxKind = 'click' | 'milestone' | 'clash' | 'resolve' | 'bloodline' | 'achievement' | 'death';

// Traditional Japanese Yo (warm) and In-sen (tense/tragic) pentatonic scales (Hz)
const SCENE_SCALES: Record<AudioScene, readonly number[]> = {
  lobby: [293.66, 329.63, 392.0, 440.0, 523.25, 587.33], // D Yo pentatonic (serene night village)
  life: [261.63, 293.66, 349.23, 392.0, 440.0, 523.25], // C Yo pentatonic (warm daytime)
  war: [220.0, 233.08, 293.66, 329.63, 392.0, 440.0], // A In-sen (urgent shinobi front)
  crisis: [196.0, 207.65, 261.63, 293.66, 349.23, 392.0], // G In-sen (ominous crisis)
  epilogue: [246.94, 261.63, 329.63, 369.99, 440.0, 493.88], // B In-sen reflective
};

// Short melodic motifs (indices into SCENE_SCALES, -1 = rest)
const SCENE_PHRASES: Record<AudioScene, readonly (readonly number[])[]> = {
  lobby: [
    [0, 2, 3, -1, 2, 0],
    [3, 4, 2, -1, 1, 0],
    [2, 3, 5, 4, 3, -1],
  ],
  life: [
    [0, 1, 3, 2, -1, 0],
    [2, 3, 4, 3, 1, -1],
    [3, 5, 4, 2, 1, 0],
  ],
  war: [
    [0, 1, 0, 2, 3, 1],
    [3, 2, 1, 0, 2, 0],
    [0, 2, 4, 3, 1, 0],
  ],
  crisis: [
    [0, 1, 3, 1, 0, 1],
    [4, 3, 1, 0, 1, 0],
    [0, 1, 2, 4, 1, 0],
  ],
  epilogue: [
    [0, 2, 3, -1, 1, 0],
    [3, 2, 1, 0, -1, 0],
    [2, 4, 3, 2, 1, -1],
  ],
};

class ProceduralSoundEngine {
  private ctx: AudioContext | null = null;
  private bgmGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private scene: AudioScene = 'lobby';
  private settings: UserSettings = {
    soundEnabled: true,
    bgmVolume: 0.35,
    sfxVolume: 0.55,
    fxEnabled: true,
    lobbyAnimationEnabled: true,
  };
  private timerId: number | null = null;
  private phraseIndex = 0;
  private tabId = `tab_${Math.random().toString(36).slice(2)}`;
  private channel: BroadcastChannel | null = null;
  private ownsAudio = true;
  private userHasInteracted = false;

  constructor() {
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        this.channel = new BroadcastChannel('narutosim-audio-lock');
        this.channel.onmessage = (e: MessageEvent) => {
          if (e.data?.type === 'claim' && e.data?.tabId !== this.tabId) {
            this.ownsAudio = false;
            this.updateGains();
          }
        };
      } catch {
        this.channel = null;
      }
    }

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
          this.stopLoop();
        } else if (this.userHasInteracted && this.settings.soundEnabled) {
          this.claimActiveTab();
          this.ensureContext();
          this.startLoop();
        }
      });
    }
  }

  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();
      this.bgmGain = this.ctx.createGain();
      this.sfxGain = this.ctx.createGain();
      this.bgmGain.connect(this.ctx.destination);
      this.sfxGain.connect(this.ctx.destination);
      this.noiseBuffer = this.buildNoiseBuffer(this.ctx);
      this.updateGains();
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    this.claimActiveTab();
    return this.ctx;
  }

  private buildNoiseBuffer(ctx: AudioContext): AudioBuffer {
    const len = Math.floor(ctx.sampleRate * 1.2);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buf;
  }

  private claimActiveTab(): void {
    this.ownsAudio = true;
    try {
      this.channel?.postMessage({ type: 'claim', tabId: this.tabId });
    } catch {
      // Ignore closed channel
    }
    this.updateGains();
  }

  applySettings(next: UserSettings): void {
    this.settings = { ...next };
    if (!this.settings.soundEnabled) {
      this.updateGains();
      this.stopLoop();
      return;
    }
    if (this.userHasInteracted) {
      this.ensureContext();
      this.startLoop();
    }
    this.updateGains();
  }

  private updateGains(): void {
    if (!this.ctx || !this.bgmGain || !this.sfxGain) return;
    const active = this.settings.soundEnabled && this.ownsAudio;
    const now = this.ctx.currentTime;
    this.bgmGain.gain.cancelScheduledValues(now);
    this.sfxGain.gain.cancelScheduledValues(now);
    this.bgmGain.gain.setTargetAtTime(active ? this.settings.bgmVolume * 0.28 : 0, now, 0.1);
    this.sfxGain.gain.setTargetAtTime(active ? this.settings.sfxVolume * 0.55 : 0, now, 0.05);
  }

  unlock(): void {
    this.userHasInteracted = true;
    if (!this.settings.soundEnabled) return;
    const ctx = this.ensureContext();
    if (ctx && this.timerId === null) {
      this.startLoop();
    }
  }

  setScene(scene: AudioScene): void {
    if (this.scene === scene) return;
    this.scene = scene;
    this.phraseIndex = 0;
  }

  /**
   * Plays a multi-note Japanese pentatonic phrase using a procedural shakuhachi flute
   * (sine + subtle vibrato LFO + bandpass-filtered breath noise) and taiko drums during war.
   */
  private startLoop(): void {
    if (this.timerId !== null || typeof window === 'undefined') return;
    if (typeof document !== 'undefined' && document.hidden) return;

    const schedulePhrase = () => {
      if (!this.settings.soundEnabled || !this.ownsAudio || !this.ctx || !this.bgmGain) return;
      if (this.ctx.state !== 'running') return;

      const scale = SCENE_SCALES[this.scene];
      const phrases = SCENE_PHRASES[this.scene];
      const motif = phrases[this.phraseIndex % phrases.length];
      const isWar = this.scene === 'war' || this.scene === 'crisis';
      const stepSec = isWar ? 0.34 : 0.48;
      const now = this.ctx.currentTime;

      // Grounding shamisen/koto low drone on beat 0
      this.playTone(scale[0] * 0.5, 'triangle', now, stepSec * motif.length * 0.9, 0.2, this.bgmGain);

      motif.forEach((noteIdx, i) => {
        const t0 = now + i * stepSec;
        if (noteIdx >= 0) {
          const freq = scale[noteIdx % scale.length];
          if (isWar) {
            this.playShakuhachi(freq, t0, stepSec * 0.9, 0.32, this.bgmGain!);
          } else {
            this.playShakuhachi(freq, t0, stepSec * 1.25, 0.26, this.bgmGain!);
          }
        }
        if (isWar && (i % 2 === 0 || (this.scene === 'crisis' && i === 5))) {
          this.playDrum(t0, this.scene === 'crisis' ? 68 : 84, 0.24, this.bgmGain!);
        }
      });

      this.phraseIndex += 1;
    };

    schedulePhrase();
    this.timerId = window.setInterval(schedulePhrase, 2850);
  }

  private stopLoop(): void {
    if (this.timerId !== null && typeof window !== 'undefined') {
      window.clearInterval(this.timerId);
      this.timerId = null;
    }
  }

  private playShakuhachi(
    freq: number,
    startTime: number,
    duration: number,
    peak: number,
    dest: AudioNode,
  ): void {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const lfo = this.ctx.createOscillator();
    const lfoGain = this.ctx.createGain();
    const env = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, startTime);

    // Gentle 5.2Hz vibrato for bamboo flute warmth
    lfo.type = 'sine';
    lfo.frequency.setValueAtTime(5.2, startTime);
    lfoGain.gain.setValueAtTime(freq * 0.008, startTime);
    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);

    env.gain.setValueAtTime(0.0001, startTime);
    env.gain.exponentialRampToValueAtTime(Math.max(0.001, peak), startTime + 0.06);
    env.gain.exponentialRampToValueAtTime(Math.max(0.001, peak * 0.7), startTime + duration * 0.65);
    env.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

    osc.connect(env);
    env.connect(dest);

    // Filtered breath noise layer
    let noiseSrc: AudioBufferSourceNode | null = null;
    let noiseFilter: BiquadFilterNode | null = null;
    let noiseGain: GainNode | null = null;
    if (this.noiseBuffer) {
      noiseSrc = this.ctx.createBufferSource();
      noiseSrc.buffer = this.noiseBuffer;
      noiseFilter = this.ctx.createBiquadFilter();
      noiseFilter.type = 'bandpass';
      noiseFilter.frequency.setValueAtTime(freq * 2.2, startTime);
      noiseFilter.Q.setValueAtTime(5.5, startTime);
      noiseGain = this.ctx.createGain();
      noiseGain.gain.setValueAtTime(0.0001, startTime);
      noiseGain.gain.exponentialRampToValueAtTime(peak * 0.14, startTime + 0.05);
      noiseGain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration * 0.9);
      noiseSrc.connect(noiseFilter);
      noiseFilter.connect(noiseGain);
      noiseGain.connect(dest);
      noiseSrc.start(startTime);
      noiseSrc.stop(startTime + duration + 0.03);
    }

    osc.onended = () => {
      osc.disconnect();
      lfo.disconnect();
      lfoGain.disconnect();
      env.disconnect();
      noiseSrc?.disconnect();
      noiseFilter?.disconnect();
      noiseGain?.disconnect();
    };
    lfo.start(startTime);
    osc.start(startTime);
    lfo.stop(startTime + duration + 0.04);
    osc.stop(startTime + duration + 0.04);
  }

  private playTone(
    freq: number,
    type: OscillatorType,
    startTime: number,
    duration: number,
    peak: number,
    dest: AudioNode,
  ): void {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, startTime);

    env.gain.setValueAtTime(0.0001, startTime);
    env.gain.exponentialRampToValueAtTime(Math.max(0.001, peak), startTime + 0.03);
    env.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

    osc.connect(env);
    env.connect(dest);
    osc.onended = () => {
      osc.disconnect();
      env.disconnect();
    };
    osc.start(startTime);
    osc.stop(startTime + duration + 0.04);
  }

  private playDrum(startTime: number, startFreq: number, duration: number, dest: AudioNode): void {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(startFreq, startTime);
    osc.frequency.exponentialRampToValueAtTime(32, startTime + duration);

    env.gain.setValueAtTime(0.5, startTime);
    env.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

    osc.connect(env);
    env.connect(dest);
    osc.onended = () => {
      osc.disconnect();
      env.disconnect();
    };
    osc.start(startTime);
    osc.stop(startTime + duration + 0.03);
  }

  private duckBgm(seconds: number): void {
    if (!this.ctx || !this.bgmGain || !this.settings.soundEnabled || !this.ownsAudio) return;
    const now = this.ctx.currentTime;
    const normal = this.settings.bgmVolume * 0.28;
    this.bgmGain.gain.cancelScheduledValues(now);
    this.bgmGain.gain.setTargetAtTime(normal * 0.25, now, 0.04);
    this.bgmGain.gain.setTargetAtTime(normal, now + seconds, 0.25);
  }

  playSfx(kind: SfxKind, speed = 1): void {
    if (!this.settings.soundEnabled) return;
    if (speed >= 8 && kind === 'click') return;

    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain) return;
    if (this.timerId === null) {
      this.startLoop();
    }
    const now = ctx.currentTime;

    switch (kind) {
      case 'click':
        this.playTone(440, 'triangle', now, 0.07, 0.18, this.sfxGain);
        break;
      case 'achievement':
        this.duckBgm(0.6);
        this.playTone(587.33, 'triangle', now, 0.22, 0.35, this.sfxGain);
        this.playTone(880.0, 'sine', now + 0.12, 0.45, 0.38, this.sfxGain);
        break;
      case 'milestone':
        this.duckBgm(0.8);
        this.playTone(392.0, 'triangle', now, 0.24, 0.34, this.sfxGain);
        this.playTone(523.25, 'triangle', now + 0.12, 0.28, 0.34, this.sfxGain);
        this.playTone(659.25, 'sine', now + 0.24, 0.55, 0.4, this.sfxGain);
        break;
      case 'resolve':
        this.duckBgm(0.7);
        this.playDrum(now, 120, 0.32, this.sfxGain);
        this.playTone(659.25, 'sawtooth', now + 0.04, 0.3, 0.22, this.sfxGain);
        break;
      case 'bloodline':
        this.duckBgm(0.9);
        this.playTone(293.66, 'sine', now, 0.65, 0.32, this.sfxGain);
        this.playTone(440.0, 'triangle', now + 0.08, 0.7, 0.3, this.sfxGain);
        this.playTone(880.0, 'sine', now + 0.18, 0.8, 0.26, this.sfxGain);
        break;
      case 'clash':
        this.duckBgm(1.0);
        this.playDrum(now, 145, 0.45, this.sfxGain);
        this.playTone(220.0, 'sawtooth', now, 0.38, 0.28, this.sfxGain);
        this.playTone(554.37, 'triangle', now + 0.06, 0.52, 0.3, this.sfxGain);
        break;
      case 'death':
        this.duckBgm(1.4);
        this.playDrum(now, 74, 0.9, this.sfxGain);
        this.playTone(196.0, 'sine', now + 0.05, 1.35, 0.32, this.sfxGain);
        break;
    }
  }
}

export const soundEngine = new ProceduralSoundEngine();
