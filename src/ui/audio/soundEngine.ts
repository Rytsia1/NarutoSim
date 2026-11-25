import type { UserSettings } from '../settings';

export type AudioScene = 'lobby' | 'life' | 'war' | 'crisis' | 'epilogue';
export type SfxKind = 'click' | 'milestone' | 'clash' | 'resolve' | 'bloodline' | 'achievement' | 'death';

// Traditional Japanese Hirajoshi / In-sen pentatonic frequencies (Hz)
const SCENE_SCALES: Record<AudioScene, readonly number[]> = {
  lobby: [146.83, 164.81, 196.0, 220.0, 261.63, 293.66], // D minor pentatonic calm
  life: [196.0, 220.0, 246.94, 293.66, 329.63, 392.0], // G pentatonic warm
  war: [110.0, 116.54, 146.83, 164.81, 174.61, 220.0], // A In-sen tense
  crisis: [98.0, 103.83, 130.81, 146.83, 155.56, 196.0], // G dark phrygian/In-sen
  epilogue: [130.81, 146.83, 164.81, 196.0, 220.0, 261.63], // C reflective
};

class ProceduralSoundEngine {
  private ctx: AudioContext | null = null;
  private bgmGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private scene: AudioScene = 'lobby';
  private settings: UserSettings = {
    soundEnabled: true,
    bgmVolume: 0.35,
    sfxVolume: 0.55,
    fxEnabled: true,
    lobbyAnimationEnabled: true,
  };
  private timerId: number | null = null;
  private stepIndex = 0;
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
      this.updateGains();
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    this.claimActiveTab();
    return this.ctx;
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
    // If user previously interacted while muted and now unmutes, bootstrap AudioContext + BGM immediately!
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
    // Cancel any scheduled duckBgm restoration ramps so muting always holds cleanly
    this.bgmGain.gain.cancelScheduledValues(now);
    this.sfxGain.gain.cancelScheduledValues(now);
    this.bgmGain.gain.setTargetAtTime(active ? this.settings.bgmVolume * 0.28 : 0, now, 0.1);
    this.sfxGain.gain.setTargetAtTime(active ? this.settings.sfxVolume * 0.55 : 0, now, 0.05);
  }

  /**
   * Called on user interaction: records gesture permission, re-claims multi-tab audio focus,
   * and starts BGM if enabled.
   */
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
    this.stepIndex = 0;
  }

  private startLoop(): void {
    if (this.timerId !== null || typeof window === 'undefined') return;
    if (typeof document !== 'undefined' && document.hidden) return;
    const tick = () => {
      if (!this.settings.soundEnabled || !this.ownsAudio || !this.ctx || !this.bgmGain) return;
      if (this.ctx.state !== 'running') return;

      const scale = SCENE_SCALES[this.scene];
      const now = this.ctx.currentTime;
      const isWar = this.scene === 'war' || this.scene === 'crisis';

      const freq = scale[(this.stepIndex * 2 + (this.stepIndex % 3)) % scale.length];
      this.playTone(freq, isWar ? 'triangle' : 'sine', now, isWar ? 0.55 : 1.15, 0.4, this.bgmGain);

      if (isWar && this.stepIndex % 2 === 0) {
        this.playDrum(now, this.scene === 'crisis' ? 68 : 82, 0.28, this.bgmGain);
      }

      this.stepIndex += 1;
    };

    this.timerId = window.setInterval(tick, 950);
  }

  private stopLoop(): void {
    if (this.timerId !== null && typeof window !== 'undefined') {
      window.clearInterval(this.timerId);
      this.timerId = null;
    }
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

    env.gain.setValueAtTime(0.55, startTime);
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
