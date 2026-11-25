import { canEnterRetirement } from './epilogue';
import { advanceYear, createNewLife, finalizeLifeRecord, pushLog, resolvePendingDecision } from './life';
import { SeededRng } from './rng';
import type { FocusId, GameState, LifeRecord, ScenarioConfig } from './types';
import {
  advanceWarBeat,
  ensureWarClockDefaults,
  flushWarUntilDecision,
  getWarBeatProgress,
  getWarDayProgress,
} from './war';

export interface SimHooks {
  onStateChange?: (state: GameState) => void;
  onSave?: (state: GameState) => void;
  onEnd?: (record: LifeRecord) => void;
}

export class ShinobiSim {
  private state: GameState;
  private hooks: SimHooks = {};

  constructor(initialState?: GameState) {
    this.state = initialState ?? createNewLife(Date.now() >>> 0);
  }

  setHooks(hooks: SimHooks): void {
    this.hooks = hooks;
  }

  getState(): GameState {
    return this.state;
  }

  newLife(seed?: number, scenario?: ScenarioConfig): GameState {
    const resolvedSeed = (seed ?? ((Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0)) >>> 0;
    this.state = createNewLife(resolvedSeed, scenario);
    this.notify(true);
    return this.state;
  }

  load(snapshot: GameState): GameState {
    this.state = structuredClone(snapshot);
    if (this.state.war) {
      ensureWarClockDefaults(this.state.war);
    }
    this.notify(false);
    return this.state;
  }

  snapshot(): GameState {
    return structuredClone(this.state);
  }

  yearProgress(): number {
    if (this.state.secondsPerYear <= 0) return 0;
    return Math.min(1, Math.max(0, this.state.clock / this.state.secondsPerYear));
  }

  warBeatProgress(): number {
    if (this.state.phase !== 'war' || !this.state.war) return 0;
    return getWarBeatProgress(this.state.war);
  }

  warDayProgress(): number {
    if (this.state.phase !== 'war' || !this.state.war) return 0;
    return getWarDayProgress(this.state.war);
  }

  setFocus(focus: FocusId): void {
    if (this.state.phase !== 'life') return;
    this.state.focus = focus;
    this.notify(true);
  }

  setSpeed(speed: 1 | 2 | 4 | 8): void {
    this.state.speed = speed;
    this.notify(false);
  }

  togglePause(): void {
    this.state.paused = !this.state.paused;
    this.notify(false);
  }

  toggleAutoPlay(): void {
    this.state.autoPlay = !this.state.autoPlay;
    this.notify(false);
  }

  retireFromFrontline(): boolean {
    if (!canEnterRetirement(this.state)) return false;
    this.state.phase = 'retirement';
    this.state.world.omenActive = false;
    pushLog(
      this.state,
      'epilogue',
      `At age ${this.state.age}, you fold your frontline gear away and enter quiet retirement. Mobilization orders will no longer call your name.`,
      { title: 'Twilight Years Begin' },
    );
    this.notify(true);
    return true;
  }

  /**
   * Advances simulation time by dt seconds (capped at 0.25s per frame, GDD Ch. 02).
   * Drives both the yearly life clock (16s/yr at 1x) and the 14-day war beat queue (110s/day at 1x).
   * Returns true if a year or war beat advanced.
   */
  tick(dtSeconds: number): boolean {
    const s = this.state;
    if (s.paused || s.pending !== null || s.phase === 'posthumous' || s.phase === 'ended') {
      return false;
    }

    const dt = Math.min(0.25, Math.max(0, dtSeconds));

    if (s.phase === 'war' && s.war) {
      ensureWarClockDefaults(s.war);
      if (s.war.beatQueue.length === 0) {
        return false;
      }
      s.war.beatClock += dt * s.speed;
      if (s.war.beatClock >= s.war.beatQueue[0].delay) {
        const rng = new SeededRng(s.rng.seed, s.rng.state);
        const advanced = advanceWarBeat(s, rng);
        s.rng = rng.snapshot();
        if (advanced) {
          this.notify(true);
          return true;
        }
      }
      return false;
    }

    s.clock += dt * s.speed;

    if (s.clock >= s.secondsPerYear) {
      s.clock -= s.secondsPerYear;
      advanceYear(s);
      this.notify(true);
      return true;
    }
    return false;
  }

  /**
   * Immediately executes the next queued war beat (used by the "Next Beat" UI button and tests).
   */
  stepWarBeat(): boolean {
    const s = this.state;
    if (s.phase !== 'war' || !s.war || s.pending !== null) return false;
    ensureWarClockDefaults(s.war);
    const rng = new SeededRng(s.rng.seed, s.rng.state);
    const advanced = advanceWarBeat(s, rng);
    s.rng = rng.snapshot();
    if (advanced) {
      this.notify(true);
    }
    return advanced;
  }

  /**
   * Advances queued war beats until a decision opens or the war ends (for headless sims & tests).
   */
  flushWarUntilDecision(): void {
    const s = this.state;
    if (s.phase !== 'war' || !s.war || s.pending !== null) return;
    const rng = new SeededRng(s.rng.seed, s.rng.state);
    flushWarUntilDecision(s, rng);
    s.rng = rng.snapshot();
    this.notify(true);
  }

  /**
   * Immediate step helper for headless simulations and testing.
   */
  stepYear(): void {
    if (this.state.pending || this.state.phase === 'posthumous' || this.state.phase === 'ended') return;
    if (this.state.phase === 'war' && this.state.war) {
      this.flushWarUntilDecision();
      return;
    }
    this.state.clock = 0;
    advanceYear(this.state);
    this.notify(true);
  }

  resolve(optionId: string, freeText?: string): void {
    if (!this.state.pending) return;
    const valid = this.state.pending.options.find((o) => o.id === optionId && !o.disabled);
    if (!valid) return;
    resolvePendingDecision(this.state, optionId, freeText);
    this.notify(true);
  }

  /**
   * Picks a deterministic eligible option when auto-play is active.
   * Respects `manual` decisions unless `forceManual` is true (headless stress runner).
   */
  autoChoice(forceManual = false): boolean {
    const pending = this.state.pending;
    if (!pending) return false;
    if (pending.manual && !forceManual) return false;

    const eligible = pending.options.filter((o) => !o.disabled && o.autoEligible);
    const pool = eligible.length > 0 ? eligible : pending.options.filter((o) => !o.disabled);
    if (pool.length === 0) return false;

    const rng = new SeededRng(this.state.rng.seed, this.state.rng.state);
    const picked = rng.pick(pool);
    this.state.rng = rng.snapshot();
    this.resolve(picked.id);
    return true;
  }

  submitLastWords(lastWords: string): LifeRecord | null {
    if (this.state.phase !== 'posthumous' && this.state.phase !== 'ended') return null;
    finalizeLifeRecord(this.state, lastWords);
    const rec = this.state.record;
    this.notify(true);
    if (rec && this.hooks.onEnd) {
      this.hooks.onEnd(rec);
    }
    return rec;
  }

  private notify(shouldSave: boolean): void {
    if (this.hooks.onStateChange) {
      this.hooks.onStateChange(this.state);
    }
    if (shouldSave && this.hooks.onSave) {
      this.hooks.onSave(this.state);
    }
  }
}
