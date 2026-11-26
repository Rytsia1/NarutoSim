import { ACHIEVEMENTS } from '../data/achievements';
import { getPerson } from './people';
import type {
  BloodlineStage,
  CodexStatEntry,
  CodexStats,
  CombatArchetype,
  GameState,
  MetaState,
  VillageId,
} from './types';

const BLOODLINE_STAGE_RANK: Record<BloodlineStage, number> = {
  latent: 0,
  awakened: 1,
  ctrl1: 2,
  ctrl2: 3,
  mastered: 4,
};

export function createEmptyCodexStats(): CodexStats {
  return {
    byArchetype: {},
    byClan: {},
    byVillage: {},
    byBloodline: {},
    totalEncountered: 0,
    totalDefeated: 0,
  };
}

export function createDefaultMeta(): MetaState {
  return {
    version: 1,
    livesPlayed: 0,
    codexStats: createEmptyCodexStats(),
    codexBloodlines: {},
    codexDisciplines: {},
    codexSummons: [],
    crisisCleared: { calamity: 0, mastermind: 0 },
    convictionEndings: [],
    achievements: [],
  };
}

function bumpBucket(
  map: Partial<Record<string, CodexStatEntry>>,
  key: string | null | undefined,
  encountered: number,
  defeated: number,
  mode: 'max' | 'add',
): void {
  if (!key) return;
  const cur = map[key] ?? { encountered: 0, defeated: 0 };
  if (mode === 'add') {
    map[key] = {
      encountered: cur.encountered + encountered,
      defeated: cur.defeated + defeated,
    };
  } else {
    map[key] = {
      encountered: Math.max(cur.encountered, encountered),
      defeated: Math.max(cur.defeated, defeated),
    };
  }
}

function collectLifeEncounterStats(state: GameState): CodexStats {
  const stats = createEmptyCodexStats();
  const seenIds = new Set<string>();

  const recordOne = (
    personId: string,
    archetype: CombatArchetype,
    villageId: VillageId,
    clanId: string | null | undefined,
    bloodlineId: string | null | undefined,
    defeated: boolean,
  ) => {
    if (seenIds.has(personId)) return;
    seenIds.add(personId);
    const def = defeated ? 1 : 0;
    stats.totalEncountered += 1;
    stats.totalDefeated += def;
    bumpBucket(stats.byArchetype, archetype, 1, def, 'add');
    bumpBucket(stats.byVillage, villageId, 1, def, 'add');
    if (clanId) bumpBucket(stats.byClan, clanId, 1, def, 'add');
    if (bloodlineId) bumpBucket(stats.byBloodline, bloodlineId, 1, def, 'add');
  };

  if (state.war) {
    for (const enemy of state.war.enemies) {
      const person = getPerson(state, enemy.personId);
      recordOne(
        enemy.personId,
        enemy.archetype,
        enemy.villageId,
        person?.identity.clanId,
        person?.identity.bloodlineId,
        !enemy.alive,
      );
    }
  }

  // Also include any other observed combatant who fought/fell across the life (e.g. earlier wars or Chunin Exam)
  if (state.worldSim) {
    for (const npc of state.worldSim.npcs) {
      const id = npc.identity;
      if (!id.observed) continue;
      if (id.occupation !== 'shinobi' && id.occupation !== 'samurai') continue;
      const isFamilyOrSquad =
        state.family.some((f) => f.personId === id.id) ||
        Boolean(state.team?.members.some((m) => m.personId === id.id && id.specialStatus !== 'missing_nin'));
      if (isFamilyOrSquad) continue;
      if (id.specialStatus === 'missing_nin' || (!id.alive && id.deathCause?.includes('Great Shinobi War'))) {
        recordOne(id.id, id.archetype, id.villageId, id.clanId, id.bloodlineId, !id.alive);
      }
    }
  }

  return stats;
}

function mergeCodexStats(target: CodexStats, life: CodexStats, mode: 'max' | 'add'): void {
  if (mode === 'add') {
    target.totalEncountered += life.totalEncountered;
    target.totalDefeated += life.totalDefeated;
  } else {
    target.totalEncountered = Math.max(target.totalEncountered, life.totalEncountered);
    target.totalDefeated = Math.max(target.totalDefeated, life.totalDefeated);
  }
  for (const [k, v] of Object.entries(life.byArchetype)) {
    if (v) bumpBucket(target.byArchetype, k, v.encountered, v.defeated, mode);
  }
  for (const [k, v] of Object.entries(life.byVillage)) {
    if (v) bumpBucket(target.byVillage, k, v.encountered, v.defeated, mode);
  }
  for (const [k, v] of Object.entries(life.byClan)) {
    if (v) bumpBucket(target.byClan, k, v.encountered, v.defeated, mode);
  }
  for (const [k, v] of Object.entries(life.byBloodline)) {
    if (v) bumpBucket(target.byBloodline, k, v.encountered, v.defeated, mode);
  }
}

/**
 * Synchronizes aggregate Codex statistics and evaluates all Achievements
 * against live GameState + MetaState. Strictly idempotent for repeated calls on the same life.
 */
export function updateMetaFromState(
  meta: MetaState,
  state: GameState,
): { meta: MetaState; newlyUnlocked: string[] } {
  const next: MetaState = structuredClone(meta);
  if (!next.codexStats) next.codexStats = createEmptyCodexStats();

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

  // 3. Idempotently synchronize Encounter Statistics from the current life
  const lifeStats = collectLifeEncounterStats(state);
  mergeCodexStats(next.codexStats, lifeStats, 'max');

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
  if (!bumped.codexStats) bumped.codexStats = createEmptyCodexStats();
  bumped.livesPlayed += 1;
  if (state.world.crisisStage === 3 && state.world.seededCrisis !== 'none') {
    bumped.crisisCleared[state.world.seededCrisis] += 1;
  }
  // Accumulate encounter statistics across subsequent completed lives without double-counting Life 1
  const lifeStats = collectLifeEncounterStats(state);
  mergeCodexStats(bumped.codexStats, lifeStats, bumped.livesPlayed === 1 ? 'max' : 'add');
  return updateMetaFromState(bumped, state);
}
