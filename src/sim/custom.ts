import { CLAN_MAP } from '../data/clans';
import { ORIGIN_MAP } from '../data/origins';
import { BLOODLINE_MAP, DISCIPLINE_MAP } from '../data/powers';
import { clampStats } from './history/chronicle';
import { getChakraCap } from './powers';
import type { CustomBuildConfig, GameState, StatKey } from './types';

export const CUSTOM_BUDGET = 12;

/**
 * Canon clan ownership rules for Kekkei Genkai in Point-Buy mode.
 * Free Mode bypasses these rules for sandbox builds.
 */
export const BLOODLINE_REQUIRED_CLANS: Record<string, readonly string[]> = {
  sharingan: ['uchiha'],
  byakugan: ['hyuga'],
  ketsuryugan: ['chinoike'],
  mokuton: ['senju'],
  shikotsumyaku: ['kaguya'],
  uzumaki_chains: ['uzushio_seal_keepers'],
};

export const EVENT_ONLY_BIRTH_BLOODLINES = new Set(['rinne_eye', 'sage_body']);
const RARE_MUTATION_BLOODLINES = new Set(['hyoton', 'yoton', 'jiton']);

export function isBloodlineAllowedForClan(
  bloodlineId: string,
  clanId?: string | null,
): { allowed: boolean; reason?: string } {
  if (EVENT_ONLY_BIRTH_BLOODLINES.has(bloodlineId)) {
    const bName = BLOODLINE_MAP[bloodlineId]?.name ?? bloodlineId;
    return {
      allowed: false,
      reason: `${bName} cannot be selected at birth in Point-Buy mode (event-only or Free Mode).`,
    };
  }

  const requiredClans = BLOODLINE_REQUIRED_CLANS[bloodlineId];
  if (requiredClans) {
    if (!clanId || !requiredClans.includes(clanId)) {
      const bName = BLOODLINE_MAP[bloodlineId]?.name ?? bloodlineId;
      const clanNames = requiredClans.map((id) => CLAN_MAP[id]?.name ?? id).join(' or ');
      return {
        allowed: false,
        reason: `${bName} requires belonging to the ${clanNames}.`,
      };
    }
    return { allowed: true };
  }

  // Elemental KG (Hyoton, Yoton, Jiton): allowed for matching clan OR clanless rare mutation,
  // but rejected if paired with a clan that owns a different Kekkei Genkai.
  if (RARE_MUTATION_BLOODLINES.has(bloodlineId) && clanId) {
    const clan = CLAN_MAP[clanId];
    if (clan?.bloodlineId && clan.bloodlineId !== bloodlineId) {
      const bName = BLOODLINE_MAP[bloodlineId]?.name ?? bloodlineId;
      return {
        allowed: false,
        reason: `${bName} does not match ${clan.name}'s bloodline lineage.`,
      };
    }
  }

  return { allowed: true };
}

export function isDisciplineAllowedForClan(
  disciplineId: string,
  clanId?: string | null,
): { allowed: boolean; reason?: string } {
  if (disciplineId === 'gentle_fist' && clanId !== 'hyuga') {
    return {
      allowed: false,
      reason: 'Gentle Fist (Juken) is restricted to the Hyuga Clan in Point-Buy mode.',
    };
  }
  return { allowed: true };
}

export interface CustomBuildValidation {
  valid: boolean;
  pointsSpent: number;
  budget: number;
  errors: string[];
}

/**
 * Evaluates a Custom Shinobi Build cleanly, fixing GDD Ch. 14 inconsistencies I1-I4:
 * - I1/I2: Discipline gates match natural play (no senjutsu/space_time at birth).
 * - I3: Lowering stats below origin baseline costs 0 points (never penalizes dumping).
 * - I4: Origin family discipline discount applies cleanly to the chosen main discipline.
 */
export function evaluateCustomBuild(cfg: CustomBuildConfig): CustomBuildValidation {
  const errors: string[] = [];
  const origin = ORIGIN_MAP[cfg.originId];
  let points = 0;

  // Capacity above origin max costs 3 pts per tier; lowering is free (0 pts)
  const maxOriginCap = origin.capacityRange[1];
  if (cfg.capacity > maxOriginCap) {
    points += (cfg.capacity - maxOriginCap) * 3;
  }

  // Positive stat offsets cost ceil(offset / 5) pts; negative offsets cost 0 (fix I3)
  const statKeys: StatKey[] = ['chakra', 'intel', 'will', 'bonds', 'health', 'ryo'];
  if (cfg.mode === 'free' && cfg.directStats) {
    for (const k of statKeys) {
      const val = cfg.directStats[k];
      if (val !== undefined && (val < 0 || val > 100)) {
        errors.push(`${k} must be between 0 and 100.`);
      }
    }
  } else {
    for (const k of statKeys) {
      const off = cfg.statOffsets[k] ?? 0;
      if (cfg.mode === 'points' && off > 25) {
        errors.push(`${k} bonus cannot exceed +25.`);
      }
      if (cfg.mode === 'points' && off < -20) {
        errors.push(`${k} reduction cannot be below -20.`);
      }
      if (off > 0) {
        points += Math.ceil(off / 5);
      }
    }
  }

  // Starting discipline validation (fix I1/I2/I4; Free Mode unlocks all 22 disciplines and bypasses clan gating)
  if (cfg.startDisciplineId) {
    const def = DISCIPLINE_MAP[cfg.startDisciplineId];
    if (!def) {
      errors.push('Unknown starting discipline.');
    } else if (cfg.mode === 'points' && (def.id === 'senjutsu' || def.id === 'space_time')) {
      errors.push(`${def.name} cannot be chosen as a childhood starting discipline.`);
    } else {
      if (cfg.mode === 'points') {
        const discGate = isDisciplineAllowedForClan(def.id, cfg.clanId);
        if (!discGate.allowed && discGate.reason) {
          errors.push(discGate.reason);
        }
      }
      const isFamilyDiscount = origin.familyDisciplines.includes(def.id) || (def.id === 'gentle_fist' && cfg.clanId === 'hyuga');
      points += isFamilyDiscount ? 1 : 3;
    }
  }

  // Guaranteed latent Kekkei Genkai (Point-Buy enforces canon clan ownership; Free Mode bypasses)
  if (cfg.latentBloodlineId) {
    const bDef = BLOODLINE_MAP[cfg.latentBloodlineId];
    if (!bDef) {
      errors.push('Unknown Kekkei Genkai selected.');
    } else {
      if (cfg.mode === 'points') {
        const blGate = isBloodlineAllowedForClan(bDef.id, cfg.clanId);
        if (!blGate.allowed && blGate.reason) {
          errors.push(blGate.reason);
        }
      }
      if (bDef.id === 'rinne_eye') {
        points += 9;
      } else if (bDef.id === 'mokuton' || bDef.id === 'sharingan') {
        points += 6;
      } else {
        points += 4;
      }
    }
  }

  if (cfg.mode === 'points' && points > CUSTOM_BUDGET) {
    errors.push(`Build uses ${points} points (budget is ${CUSTOM_BUDGET}). Switch to Free Mode or lower perks.`);
  }

  return {
    valid: errors.length === 0,
    pointsSpent: points,
    budget: CUSTOM_BUDGET,
    errors,
  };
}

export function applyCustomBuild(state: GameState, cfg: CustomBuildConfig): void {
  const check = evaluateCustomBuild(cfg);
  state.flags.custom_run = true;
  state.originId = cfg.originId;
  state.villageId = cfg.villageId;
  if (cfg.clanId && CLAN_MAP[cfg.clanId]?.villageId === cfg.villageId) {
    state.clanId = cfg.clanId;
  } else if (cfg.clanId === '') {
    state.clanId = null;
  }
  state.sex = cfg.sex;
  if (cfg.name.trim()) state.name = cfg.name.trim();
  state.capacity = cfg.capacity;
  state.element = cfg.element;

  // Apply direct stats in Free Mode or bounded stat offsets in Point-Buy Mode
  const statKeys: StatKey[] = ['chakra', 'intel', 'will', 'bonds', 'health', 'ryo'];
  if (cfg.mode === 'free' && cfg.directStats) {
    for (const k of statKeys) {
      const targetVal = cfg.directStats[k];
      if (targetVal !== undefined && Number.isFinite(targetVal)) {
        state.stats[k] = Math.max(0, Math.min(100, Math.round(targetVal)));
      }
    }
  } else {
    for (const k of statKeys) {
      const rawOff = cfg.statOffsets[k] ?? 0;
      const off = cfg.mode === 'free' ? Math.max(-100, Math.min(100, rawOff)) : Math.max(-20, Math.min(25, rawOff));
      state.stats[k] += off;
    }
  }

  const startDef = cfg.startDisciplineId ? DISCIPLINE_MAP[cfg.startDisciplineId] : undefined;
  const allowStartDisc =
    Boolean(startDef) &&
    (cfg.mode === 'free' || (cfg.startDisciplineId !== 'senjutsu' && cfg.startDisciplineId !== 'space_time'));
  if (startDef && allowStartDisc) {
    const startLvl =
      cfg.mode === 'free' && cfg.startDisciplineLevel
        ? (Math.max(1, Math.min(startDef.maxLevel, cfg.startDisciplineLevel)) as 1 | 2 | 3 | 4)
        : 1;
    state.disciplines = [
      {
        id: startDef.id,
        level: startLvl,
        xp: 0,
        lastLevelAge: 0,
        quality: 1,
        isMain: true,
        declinedUntilAge: 0,
      },
    ];
  }

  if (cfg.latentBloodlineId && BLOODLINE_MAP[cfg.latentBloodlineId]) {
    const bDef = BLOODLINE_MAP[cfg.latentBloodlineId];
    const defaultStage = bDef.id === 'byakugan' && state.clanId === 'hyuga' ? 'awakened' : 'latent';
    const startStage = cfg.mode === 'free' && cfg.startBloodlineStage ? cfg.startBloodlineStage : defaultStage;
    const startGrade =
      startStage === 'mastered' ? bDef.gradeRange[1] : bDef.gradeRange[0];
    state.bloodline = {
      id: bDef.id,
      grade: startGrade,
      stage: startStage,
      lastEventAge: 0,
      declined: false,
      eyeStrain: 0,
    };
  } else if (check.valid && cfg.latentBloodlineId === undefined) {
    // Keep natural rolled bloodline for the selected custom origin & clan
  }

  // Enforce chakra cap
  const cap = getChakraCap(state);
  if (state.stats.chakra > cap) state.stats.chakra = cap;
  clampStats(state);
}
