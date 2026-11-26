import { resolveAcademyEventDecision } from '../academy';
import { resolveClanPoliticsDecision } from '../clan-heritage';
import { clampStats, diffStats, pushLog, snapshotStats } from '../history/chronicle';
import {
  ensurePlayerLegacy,
  resolveImperfectLifeDecision,
  resolveNpcPleaDecision,
} from '../life/imperfect-life';
import { resolveProceduralMissionStage } from '../missions';
import { resolvePoliticsDecision } from '../politics';
import { clamp } from '../powers';
import { getVillageInstitutionalModifiers } from '../village/institutions';
import { ensureWarClockDefaults } from '../war';
import { ensureWorldSimDefaults, resolveEmergentWorldDecision } from '../world-sim';
import type { CheckResultChip, GameState, StatDeltaChip } from '../types';
import { MAX_CRISIS_CLUES } from '../world';
import { defaultDecisionRouter } from './decision-router';
import { defaultMigrationRegistry } from './migrations';

let kernelBootstrapped = false;

/**
 * Registers canonical domain migrations & modular DecisionRouter handlers once.
 * Keeps `life.ts` decoupled from mission, village, politics, and emergent resolutions.
 */
export function ensureKernelBootstrapped(
  onKill: (state: GameState, cause: string) => void,
): void {
  if (kernelBootstrapped) return;
  kernelBootstrapped = true;

  // 1. Canonical Save Migration Pipeline
  defaultMigrationRegistry.register({
    id: 'world_village_rel_defaults',
    order: 10,
    apply: (state) => {
      ensureWorldSimDefaults(state);
    },
  });

  defaultMigrationRegistry.register({
    id: 'war_clock_defaults',
    order: 20,
    apply: (state) => {
      if (state.war) {
        ensureWarClockDefaults(state.war);
      }
    },
  });

  defaultMigrationRegistry.register({
    id: 'player_legacy_defaults',
    order: 30,
    apply: (state) => {
      ensurePlayerLegacy(state);
    },
  });

  defaultMigrationRegistry.register({
    id: 'jutsu_mastery_defaults',
    order: 40,
    apply: (state) => {
      if (!state.jutsuMastery) state.jutsuMastery = {};
    },
  });

  defaultMigrationRegistry.register({
    id: 'effect_model_v2_defaults',
    order: 50,
    apply: (state) => {
      if (!state.discoveredJutsu) state.discoveredJutsu = [];
      if (state.permanentDisability === undefined) state.permanentDisability = false;
      if (state.bloodline && state.bloodline.eyeStrain === undefined) {
        state.bloodline.eyeStrain = 0;
      }
      const b = state.war?.activeBattle;
      if (b) {
        if (!b.enemyStatus) b.enemyStatus = {};
        if (!b.playerStatus) b.playerStatus = {};
        if (!b.playerSelf) b.playerSelf = {};
        if (!b.enemySelf) b.enemySelf = {};
        if (b.playerDojutsuMode === undefined) b.playerDojutsuMode = null;
        if (b.playerBodyMode === undefined) b.playerBodyMode = null;
        if (!b.modeCooldowns) b.modeCooldowns = {};
        if (!b.setupFlags) b.setupFlags = {};
        if (!b.usesThisBattle) b.usesThisBattle = {};
        if (b.enemyDebuffRounds > 0 && !b.enemyStatus.slow) {
          b.enemyStatus.slow = { rounds: b.enemyDebuffRounds, value: 9 };
        }
        if (b.playerWardRounds > 0 && !b.playerSelf.guard) {
          b.playerSelf.guard = { rounds: b.playerWardRounds, value: 35 };
        }
        if (b.playerCloneEvade && !b.playerSelf.evade) {
          b.playerSelf.evade = { rounds: 1, value: 1 };
        }
        if (b.enemyWallRounds > 0 && !b.enemySelf.wall) {
          b.enemySelf.wall = { rounds: b.enemyWallRounds, value: 22 };
        }
        if (b.enemyFieldRounds > 0 && !b.enemySelf.field) {
          b.enemySelf.field = { rounds: b.enemyFieldRounds, value: 7 };
        }
      }
    },
  });

  defaultMigrationRegistry.register({
    id: 'save_version_3_generator',
    order: 60,
    apply: (state) => {
      if (state.saveVersion === undefined) {
        state.saveVersion = 3;
      }
    },
  });

  // 2. Domain Decision Handlers registered cleanly per Engine!
  defaultDecisionRouter.register('academy_event', ({ state, decision, optionId, rng }) => {
    const before = snapshotStats(state);
    const res = resolveAcademyEventDecision(state, optionId, decision.meta, rng);
    clampStats(state);
    const checks: CheckResultChip[] = [];
    if (res.checkLabel !== undefined && res.checkPassed !== undefined) {
      checks.push({ label: res.checkLabel, passed: res.checkPassed });
    }
    pushLog(state, res.tone, res.text, {
      title: res.title,
      deltas: diffStats(before, state.stats),
      checks: checks.length > 0 ? checks : undefined,
    });
  });

  defaultDecisionRouter.register('mission_stage', ({ state, optionId, rng, bus }) => {
    const before = snapshotStats(state);
    const ryoMult = getVillageInstitutionalModifiers(state).missionRyoMult;
    const activeId = state.activeMission?.id ?? 'unknown';
    const activeRank = state.activeMission?.rank ?? 'C';
    const res = resolveProceduralMissionStage(state, optionId, ryoMult, rng);
    if (res.tensionDelta) {
      state.world.tension = clamp(state.world.tension + res.tensionDelta, 5, 100);
    }
    clampStats(state);
    if (res.killed) {
      onKill(state, res.deathCause ?? 'killed on a high-risk shinobi mission');
      return;
    }
    const checks: CheckResultChip[] = [];
    if (res.checkLabel !== undefined && res.checkPassed !== undefined) {
      checks.push({ label: res.checkLabel, passed: res.checkPassed });
    }
    const chips: StatDeltaChip[] = [...diffStats(before, state.stats)];
    if (res.tensionDelta) {
      chips.push({ stat: 'tension', label: 'World Tension', delta: res.tensionDelta });
    }
    pushLog(state, res.tone, res.text, {
      title: res.title,
      deltas: chips,
      checks: checks.length > 0 ? checks : undefined,
    });
    if (res.finished && res.outcome) {
      bus.emit({
        type: 'mission.completed',
        missionId: activeId,
        rank: activeRank,
        outcome: res.outcome,
      });
    } else if (!res.finished && res.nextDecision) {
      state.pending = res.nextDecision;
    }
  });

  defaultDecisionRouter.register('clan_politics', ({ state, decision, optionId, rng }) => {
    const before = snapshotStats(state);
    const res = resolveClanPoliticsDecision(state, optionId, decision.meta, rng);
    if (res.tensionDelta) {
      state.world.tension = clamp(state.world.tension + res.tensionDelta, 5, 100);
    }
    clampStats(state);
    const checks: CheckResultChip[] = [];
    if (res.checkLabel !== undefined && res.checkPassed !== undefined) {
      checks.push({ label: res.checkLabel, passed: res.checkPassed });
    }
    const chips: StatDeltaChip[] = [...diffStats(before, state.stats)];
    if (res.tensionDelta) {
      chips.push({ stat: 'tension', label: 'World Tension', delta: res.tensionDelta });
    }
    pushLog(state, res.tone, res.text, {
      title: res.title,
      deltas: chips,
      checks: checks.length > 0 ? checks : undefined,
    });
  });

  defaultDecisionRouter.register('politics_event', ({ state, decision, optionId, rng }) => {
    const before = snapshotStats(state);
    const res = resolvePoliticsDecision(state, optionId, decision.meta, rng);
    if (res.tensionDelta) {
      state.world.tension = clamp(state.world.tension + res.tensionDelta, 5, 100);
    }
    clampStats(state);
    const checks: CheckResultChip[] = [];
    if (res.checkLabel !== undefined && res.checkPassed !== undefined) {
      checks.push({ label: res.checkLabel, passed: res.checkPassed });
    }
    const chips: StatDeltaChip[] = [...diffStats(before, state.stats)];
    if (res.tensionDelta) {
      chips.push({ stat: 'tension', label: 'World Tension', delta: res.tensionDelta });
    }
    pushLog(state, res.tone, res.text, {
      title: res.title,
      deltas: chips,
      checks: checks.length > 0 ? checks : undefined,
    });
  });

  defaultDecisionRouter.register('world_emergent', ({ state, decision, optionId, rng }) => {
    const before = snapshotStats(state);
    const outcome = resolveEmergentWorldDecision(state, optionId, decision.meta, rng);
    if (outcome.tensionDelta) {
      state.world.tension = clamp(state.world.tension + outcome.tensionDelta, 5, 100);
      if (state.world.omenActive && state.world.tension < 65) state.world.omenActive = false;
    }
    if (outcome.cluesDelta) {
      state.world.crisisClues = clamp(state.world.crisisClues + outcome.cluesDelta, 0, MAX_CRISIS_CLUES);
    }
    clampStats(state);
    if (state.stats.health <= 0) {
      onKill(state, 'fatal injuries sustained during a village crisis');
      return;
    }
    const checks: CheckResultChip[] = [];
    if (outcome.checkLabel !== undefined && outcome.checkPassed !== undefined) {
      checks.push({ label: outcome.checkLabel, passed: outcome.checkPassed });
    }
    const chips: StatDeltaChip[] = [...diffStats(before, state.stats)];
    if (outcome.tensionDelta) {
      chips.push({ stat: 'tension', label: 'World Tension', delta: outcome.tensionDelta });
    }
    if (outcome.cluesDelta) {
      chips.push({ stat: 'clues', label: 'Crisis Clues', delta: outcome.cluesDelta });
    }
    pushLog(state, outcome.tone, outcome.text, {
      title: outcome.title,
      deltas: chips,
      checks: checks.length > 0 ? checks : undefined,
    });
  });

  defaultDecisionRouter.register('imperfect_life', ({ state, decision, optionId, rng }) => {
    const before = snapshotStats(state);
    const res = resolveImperfectLifeDecision(state, optionId, decision.meta, rng);
    if (res.tensionDelta) {
      state.world.tension = clamp(state.world.tension + res.tensionDelta, 5, 100);
    }
    clampStats(state);
    if (res.killed || state.stats.health <= 0) {
      onKill(state, res.deathCause ?? 'fatal wounds during a defining shinobi crisis');
      return;
    }
    const checks: CheckResultChip[] = [];
    if (res.checkLabel !== undefined && res.checkPassed !== undefined) {
      checks.push({ label: res.checkLabel, passed: res.checkPassed });
    }
    const chips: StatDeltaChip[] = [...diffStats(before, state.stats)];
    if (res.tensionDelta) {
      chips.push({ stat: 'tension', label: 'World Tension', delta: res.tensionDelta });
    }
    pushLog(state, res.tone, res.text, {
      title: res.title,
      deltas: chips,
      checks: checks.length > 0 ? checks : undefined,
    });
  });

  defaultDecisionRouter.register('npc_plea', ({ state, decision, optionId }) => {
    const before = snapshotStats(state);
    const res = resolveNpcPleaDecision(state, optionId, decision.meta);
    clampStats(state);
    pushLog(state, res.tone, res.text, {
      title: res.title,
      deltas: diffStats(before, state.stats),
    });
  });
}

export function migrateGameState(state: GameState): GameState {
  ensureKernelBootstrapped(() => undefined);
  return defaultMigrationRegistry.migrate(state);
}
