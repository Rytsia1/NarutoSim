import type { GovernanceActionId } from '../data/events-politics';
import { kageTitle, VILLAGE_MAP } from '../data/villages';
import { NINDO_MAP } from '../data/nindo';
import { pickAutoJutsu } from './combat';
import { canEnterRetirement } from './epilogue';
import { advanceYear, createNewLife, finalizeLifeRecord, pushLog, resolvePendingDecision } from './life';
import { vacateSeats } from './people';
import { canRunGovernanceAction, runGovernanceAction } from './politics';
import { SeededRng } from './rng';
import { investigateTimelineEvent } from './timeline';
import type { FocusId, GameState, LifeRecord, ScenarioConfig } from './types';
import { canCallDiplomaticSummit, runDiplomaticSummit } from './world';
import { migrateGameState } from './kernel/bootstrap';
import {
  advanceWarBeat,
  ensureWarClockDefaults,
  flushWarUntilDecision,
  getWarBeatProgress,
  getWarDayProgress,
  openDayPhase,
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
    migrateGameState(this.state);
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
    const wasKage = this.state.specialStatus === 'kage';
    if (wasKage) {
      this.state.flags.retired_kage = true;
      vacateSeats(this.state, 'player');
    }
    this.state.phase = 'retirement';
    this.state.world.omenActive = false;
    pushLog(
      this.state,
      'epilogue',
      wasKage
        ? `At age ${this.state.age}, you lay down the ${kageTitle(this.state)} hat and step into quiet retirement so a new generation can lead ${VILLAGE_MAP[this.state.villageId].name}.`
        : `At age ${this.state.age}, you fold your frontline gear away and enter quiet retirement. Mobilization orders will no longer call your name.`,
      { title: 'Twilight Years Begin' },
    );
    this.notify(true);
    return true;
  }

  callDiplomaticSummit(): boolean {
    if (!canCallDiplomaticSummit(this.state)) return false;
    const rng = new SeededRng(this.state.rng.seed, this.state.rng.state);
    const { drop, omenCleared } = runDiplomaticSummit(this.state, rng);
    this.state.rng = rng.snapshot();
    const roleLabel =
      this.state.specialStatus === 'kage' ? kageTitle(this.state) : `Senior Jonin Envoy of ${VILLAGE_MAP[this.state.villageId].name}`;
    pushLog(
      this.state,
      'bond',
      `Acting as ${roleLabel}, you convene a Five-Nation Diplomatic Summit and broker a border pullback (-${drop}% World Tension${omenCleared ? '; War Omen cleared' : ''}).`,
      {
        title: 'Diplomatic Summit Convened',
        deltas: [
          { stat: 'tension', label: 'World Tension', delta: -drop },
          { stat: 'ryo', label: 'Ryo', delta: -8 },
          { stat: 'bonds', label: 'Bonds', delta: 3 },
          { stat: 'will', label: 'Will', delta: 2 },
        ],
      },
    );
    this.notify(true);
    return true;
  }

  investigateTimeline(eventId: string): { ok: boolean; revealed: boolean; message: string } {
    if (this.state.phase !== 'life') {
      return { ok: false, revealed: false, message: 'Investigations can only be run during active life.' };
    }
    const rng = new SeededRng(this.state.rng.seed, this.state.rng.state);
    const res = investigateTimelineEvent(this.state, eventId, rng);
    this.state.rng = rng.snapshot();
    if (res.ok) {
      pushLog(this.state, res.revealed ? 'crisis' : 'normal', res.message, {
        title: res.revealed ? 'Living Timeline Truth Uncovered' : 'Investigation Stalled',
      });
      this.notify(true);
    }
    return { ok: res.ok, revealed: res.revealed, message: res.message };
  }

  executeGovernanceAction(actionId: GovernanceActionId): boolean {
    if (!canRunGovernanceAction(this.state, actionId)) return false;
    const rng = new SeededRng(this.state.rng.seed, this.state.rng.state);
    const res = runGovernanceAction(this.state, actionId, rng);
    this.state.rng = rng.snapshot();
    if (res.ok) {
      pushLog(this.state, 'milestone', res.message, {
        title: res.title,
        deltas: res.tensionDelta
          ? [{ stat: 'tension', label: 'World Tension', delta: res.tensionDelta }]
          : undefined,
      });
      this.notify(true);
    }
    return res.ok;
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
        // Recover migrated/legacy war saves with an empty beat queue
        const rng = new SeededRng(s.rng.seed, s.rng.state);
        openDayPhase(s, rng);
        s.rng = rng.snapshot();
        this.notify(true);
        return true;
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
    let advanced = false;
    if (s.war.beatQueue.length === 0) {
      openDayPhase(s, rng);
      advanced = true;
    } else {
      advanced = advanceWarBeat(s, rng);
    }
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
   * Picks a deterministic eligible option weighted by the character's Nindo and moral leanings.
   * Respects `manual` decisions unless `forceManual` is true (headless stress runner).
   */
  autoChoice(forceManual = false): boolean {
    const pending = this.state.pending;
    if (!pending) return false;
    if (pending.manual && !forceManual) return false;

    const rng = new SeededRng(this.state.rng.seed, this.state.rng.state);

    if (pending.kind === 'war_battle_round' && this.state.war && this.state.war.activeBattle) {
      const war = this.state.war;
      const battle = war.activeBattle!;
      const freeSurpass = pending.options.find((o) => o.id === 'partner_free_surpass' && !o.disabled);
      const resolveFlee = pending.options.find((o) => o.id === 'resolve_flee' && !o.disabled && o.autoEligible);
      const retreatOpt = pending.options.find((o) => o.id === 'retreat' && !o.disabled && o.autoEligible);
      const resolveCp = pending.options.find((o) => o.id === 'resolve_cp' && !o.disabled && o.autoEligible);
      const resolveBoost = pending.options.find((o) => o.id === 'resolve_boost' && !o.disabled && o.autoEligible);

      let chosenId: string;
      if (freeSurpass) {
        chosenId = freeSurpass.id;
      } else if (resolveFlee && war.hp <= 22) {
        chosenId = resolveFlee.id;
      } else if (retreatOpt && war.hp <= 30 && !battle.isFinal) {
        chosenId = retreatOpt.id;
      } else if (resolveCp && war.cp < 12) {
        chosenId = resolveCp.id;
      } else if (resolveBoost && battle.isFinal && war.hp < 45) {
        chosenId = resolveBoost.id;
      } else {
        const autoJutsu = pickAutoJutsu(this.state, rng);
        const validJutsu = pending.options.find((o) => o.id === autoJutsu && !o.disabled);
        chosenId = validJutsu ? validJutsu.id : (pending.options.find((o) => !o.disabled)?.id ?? 'jutsu:basic_strike');
      }
      this.state.rng = rng.snapshot();
      this.resolve(chosenId);
      return true;
    }

    const eligible = pending.options.filter((o) => !o.disabled && o.autoEligible);
    const pool = eligible.length > 0 ? eligible : pending.options.filter((o) => !o.disabled);
    if (pool.length === 0) return false;

    const nindoDef = this.state.nindo ? NINDO_MAP[this.state.nindo] : null;
    const weighted = pool.map((opt) => {
      let weight = 1;
      if (nindoDef && opt.statHints && opt.statHints.length > 0) {
        if (opt.statHints.some((h) => nindoDef.preferredHints.includes(h))) {
          weight += 1.5;
        }
      }
      if (this.state.nindo === 'become_kage' && (opt.id === 'accept_kage' || opt.id === 'vow_lead' || opt.id === 's_mission')) {
        weight += 3;
      }
      if (this.state.leanings.will_of_fire >= 3 && opt.statHints?.includes('Bonds')) {
        weight += 0.8;
      }
      if (this.state.leanings.ruthless >= 3 && (opt.statHints?.includes('Intel') || opt.statHints?.includes('Stealth'))) {
        weight += 0.8;
      }
      if (this.state.leanings.ambition >= 3 && opt.statHints?.includes('Chakra')) {
        weight += 0.8;
      }
      return { item: opt, weight };
    });

    const picked = rng.weighted(weighted);
    this.state.rng = rng.snapshot();
    this.resolve(picked.id);
    return true;
  }

  submitLastWords(lastWords: string): LifeRecord | null {
    if (this.state.phase !== 'posthumous') return this.state.record;
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
