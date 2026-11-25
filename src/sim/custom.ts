import { ORIGIN_MAP } from '../data/origins';
import { BLOODLINE_MAP, DISCIPLINE_MAP } from '../data/powers';
import { clampStats, getChakraCap } from './powers_bridge';
import type { CustomBuildConfig, GameState, StatKey } from './types';

export const CUSTOM_BUDGET = 12;

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
  for (const k of statKeys) {
    const off = cfg.statOffsets[k] ?? 0;
    if (off > 25) {
      errors.push(`${k} bonus cannot exceed +25.`);
    }
    if (off < -20) {
      errors.push(`${k} reduction cannot be below -20.`);
    }
    if (off > 0) {
      points += Math.ceil(off / 5);
    }
  }

  // Starting discipline validation (fix I1/I2/I4)
  if (cfg.startDisciplineId) {
    const def = DISCIPLINE_MAP[cfg.startDisciplineId];
    if (!def) {
      errors.push('Unknown starting discipline.');
    } else if (def.id === 'senjutsu' || def.id === 'space_time') {
      errors.push(`${def.name} cannot be chosen as a childhood starting discipline.`);
    } else {
      const isFamilyDiscount = origin.familyDisciplines.includes(def.id);
      points += isFamilyDiscount ? 1 : 3;
    }
  }

  // Guaranteed latent Kekkei Genkai
  if (cfg.latentBloodlineId) {
    const bDef = BLOODLINE_MAP[cfg.latentBloodlineId];
    if (!bDef) {
      errors.push('Unknown Kekkei Genkai selected.');
    } else if (bDef.id === 'rinne_eye') {
      points += 9;
    } else if (bDef.id === 'mokuton' || bDef.id === 'sharingan') {
      points += 6;
    } else {
      points += 4;
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
  state.flags.custom_run = true;
  state.originId = cfg.originId;
  state.villageId = cfg.villageId;
  state.sex = cfg.sex;
  if (cfg.name.trim()) state.name = cfg.name.trim();
  state.capacity = cfg.capacity;
  state.element = cfg.element;

  // Apply stat offsets cleanly within caps
  const statKeys: StatKey[] = ['chakra', 'intel', 'will', 'bonds', 'health', 'ryo'];
  for (const k of statKeys) {
    const off = cfg.statOffsets[k] ?? 0;
    state.stats[k] += off;
  }

  if (cfg.startDisciplineId && DISCIPLINE_MAP[cfg.startDisciplineId]) {
    const existing = state.disciplines.find((d) => d.id === cfg.startDisciplineId);
    if (!existing) {
      state.disciplines = [
        {
          id: cfg.startDisciplineId,
          level: 1,
          xp: 0,
          lastLevelAge: 0,
          quality: 1,
          isMain: true,
          declinedUntilAge: 0,
        },
      ];
    }
  }

  if (cfg.latentBloodlineId && BLOODLINE_MAP[cfg.latentBloodlineId]) {
    const bDef = BLOODLINE_MAP[cfg.latentBloodlineId];
    state.bloodline = {
      id: bDef.id,
      grade: bDef.gradeRange[0],
      stage: 'latent',
      lastEventAge: 0,
      declined: false,
    };
  }

  // Enforce chakra cap
  const cap = getChakraCap(state);
  if (state.stats.chakra > cap) state.stats.chakra = cap;
  clampStats(state);
}
