import { ACHIEVEMENTS } from '../data/achievements';
import { ROSTER_MAP } from '../data/roster';
import type { BloodlineStage, GameState, MetaState } from './types';

const BLOODLINE_STAGE_RANK: Record<BloodlineStage, number> = {
  latent: 0,
  awakened: 1,
  ctrl1: 2,
  ctrl2: 3,
  mastered: 4,
};

export function createDefaultMeta(): MetaState {
  return {
    version: 1,
    livesPlayed: 0,
    codexRoster: {},
    codexBloodlines: {},
    codexDisciplines: {},
    codexSummons: [],
    crisisCleared: { calamity: 0, mastermind: 0 },
    convictionEndings: [],
    achievements: [],
  };
}

/**
 * Synchronizes Bingo Book Codex entries and evaluates all 36 Achievements
 * against live GameState + MetaState. Returns newly unlocked achievement IDs.
 */
export function updateMetaFromState(
  meta: MetaState,
  state: GameState,
): { meta: MetaState; newlyUnlocked: string[] } {
  const next: MetaState = structuredClone(meta);

  // 1. Update Disciplines Codex
  for (const d of state.disciplines) {
    const prev = next.codexDisciplines[d.id] ?? 0;
    if (d.level > prev) next.codexDisciplines[d.id] = d.level;
  }

  // 2. Update Bloodlines & Kuchiyose Summons Codex
  if (state.bloodline && state.bloodline.stage !== 'latent') {
    const prev = next.codexBloodlines[state.bloodline.id];
    if (!prev || BLOODLINE_STAGE_RANK[state.bloodline.stage] > BLOODLINE_STAGE_RANK[prev]) {
      next.codexBloodlines[state.bloodline.id] = state.bloodline.stage;
    }
  }
  if (!Array.isArray(next.codexSummons)) next.codexSummons = [];
  if (state.summonContract && !next.codexSummons.includes(state.summonContract.clanId)) {
    next.codexSummons.push(state.summonContract.clanId);
  }

  // 3. Update Bingo Book Roster Codex from active war & fallen roster
  if (state.war) {
    for (const enemy of state.war.enemies) {
      if (!ROSTER_MAP[enemy.rosterId]) continue;
      const cur = next.codexRoster[enemy.rosterId] ?? { state: 'seen', encounters: 0, defeats: 0 };
      if (!enemy.alive) {
        cur.state = 'defeated';
        cur.defeats = Math.max(cur.defeats, 1);
      } else if (enemy.intel >= 80 && cur.state === 'seen') {
        cur.state = 'met';
      }
      cur.encounters = Math.max(cur.encounters, 1);
      next.codexRoster[enemy.rosterId] = cur;
    }
  }

  for (const fallenId of state.fallenRosterIds) {
    if (!ROSTER_MAP[fallenId]) continue;
    const cur = next.codexRoster[fallenId] ?? { state: 'defeated', encounters: 1, defeats: 1 };
    cur.state = 'defeated';
    cur.defeats = Math.max(cur.defeats, 1);
    cur.encounters = Math.max(cur.encounters, 1);
    next.codexRoster[fallenId] = cur;
  }

  // 4. Crisis & Conviction records (NOTE: crisisCleared count increments once in recordCompletedLifeInMeta!)
  const convEnd = state.war?.conviction?.endingKey;
  if (convEnd && !next.convictionEndings.includes(convEnd)) {
    next.convictionEndings.push(convEnd);
  }
  for (const key of ['conv_turned_away', 'conv_together', 'conv_player_won', 'conv_master_won', 'conv_bond_stopped']) {
    if (state.flags[key]) {
      const normalized = key === 'conv_master_won' ? 'conv_player_won' : key;
      if (!next.convictionEndings.includes(normalized)) {
        next.convictionEndings.push(normalized);
      }
    }
  }

  // 5. Evaluate Achievements (single source of truth!)
  const unlockedSet = new Set(next.achievements);
  const newlyUnlocked: string[] = [];
  for (const ach of ACHIEVEMENTS) {
    if (unlockedSet.has(ach.id)) continue;
    if (ach.check(state, next)) {
      unlockedSet.add(ach.id);
      next.achievements.push(ach.id);
      newlyUnlocked.push(ach.id);
    }
  }

  return { meta: next, newlyUnlocked };
}

export function recordCompletedLifeInMeta(
  meta: MetaState,
  state: GameState,
): { meta: MetaState; newlyUnlocked: string[] } {
  const bumped: MetaState = structuredClone(meta);
  bumped.livesPlayed += 1;
  if (state.world.crisisStage === 3 && state.world.seededCrisis !== 'none') {
    bumped.crisisCleared[state.world.seededCrisis] += 1;
  }
  // Increment cumulative defeats for roster shinobi slain during this completed life
  for (const fallenId of state.fallenRosterIds) {
    if (!ROSTER_MAP[fallenId]) continue;
    const cur = bumped.codexRoster[fallenId] ?? { state: 'defeated', encounters: 0, defeats: 0 };
    cur.state = 'defeated';
    cur.defeats += 1;
    cur.encounters = Math.max(cur.encounters + 1, cur.defeats);
    bumped.codexRoster[fallenId] = cur;
  }
  return updateMetaFromState(bumped, state);
}
