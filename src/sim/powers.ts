import {
  BLOODLINES,
  BLOODLINE_GRADE_NAMES,
  BLOODLINE_MAP,
  BLOODLINE_STAGE_LABELS,
  DISCIPLINES,
  DISCIPLINE_MAP,
  DISCIPLINE_TIER_NAMES,
} from '../data/powers';
import { ORIGIN_MAP } from '../data/origins';
import { hashRand, type SeededRng } from './rng';
import type {
  BloodlineState,
  ChakraElement,
  CombatProjection,
  DisciplineProgress,
  GameState,
  PendingDecision,
  RankLetter,
} from './types';

export const XP_NEED_FOR_NEXT: Record<1 | 2 | 3, number> = {
  1: 8,
  2: 20,
  3: 40,
};

export function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

export function getChakraCap(state: Pick<GameState, 'capacity' | 'bloodline'>): number {
  const base = 40 + 12 * state.capacity;
  const uzumakiBonus =
    state.bloodline?.id === 'uzumaki_chains' && state.bloodline.stage !== 'latent' ? 12 : 0;
  return base + uzumakiBonus;
}

export function rankValueToLetter(v: number): RankLetter {
  if (v >= 5.5) return 'S';
  if (v >= 4.5) return 'A';
  if (v >= 3.5) return 'B';
  if (v >= 2.5) return 'C';
  if (v >= 1.5) return 'D';
  return 'E';
}

export function rankValueToGrade(v: number): string {
  if (v >= 6.4) return 'S+';
  if (v >= 5.5) return 'S';
  if (v >= 5.0) return 'A+';
  if (v >= 4.5) return 'A';
  if (v >= 4.0) return 'B+';
  if (v >= 3.5) return 'B';
  if (v >= 3.0) return 'C+';
  if (v >= 2.5) return 'C';
  if (v >= 2.0) return 'D+';
  if (v >= 1.5) return 'D';
  return 'E';
}

export function computeCombatProjection(state: GameState): CombatProjection {
  const { stats, capacity, disciplines, bloodline, hasClanLegacy, rank } = state;

  let ninBonus = 0;
  let genBonus = 0;
  let taiBonus = 0;
  for (const d of disciplines) {
    const def = DISCIPLINE_MAP[d.id];
    if (!def) continue;
    const scale = d.level * 0.35 * d.quality;
    if (def.branch === 'ninjutsu') ninBonus += scale;
    else if (def.branch === 'genjutsu') genBonus += scale;
    else taiBonus += scale;
  }

  let bloodBonus = 0;
  if (bloodline && bloodline.stage !== 'latent') {
    const stageMult =
      bloodline.stage === 'mastered'
        ? 1.2
        : bloodline.stage === 'ctrl2'
          ? 0.9
          : bloodline.stage === 'ctrl1'
            ? 0.65
            : 0.4;
    bloodBonus = (bloodline.grade * 0.25) * stageMult;
  }

  const legacyBonus = hasClanLegacy ? 0.4 : 0;
  const rankFloor = rank === 'jonin' ? 0.5 : rank === 'chunin' ? 0.25 : 0;

  const tai = clamp(1 + stats.health / 26 + taiBonus + bloodBonus * 0.5 + rankFloor, 1, 6);
  const spd = clamp(1 + (stats.health + stats.intel) / 52 + (taiBonus + genBonus) * 0.5 + bloodBonus * 0.6 + rankFloor, 1, 6);
  const sta = clamp(1 + (stats.health * 0.7 + stats.will * 0.3) / 26 + legacyBonus + rankFloor, 1, 6);
  const chk = clamp(1 + stats.chakra / 25 + capacity * 0.25 + ninBonus + bloodBonus + legacyBonus + rankFloor, 1, 6);
  const ins = clamp(1 + (stats.intel * 0.55 + stats.will * 0.45) / 26 + genBonus + bloodBonus * 0.7 + rankFloor, 1, 6);

  const avg = (tai + spd + sta + chk + ins) / 5;
  const score = Math.round(avg * 18 + (state.world.warsSurvived * 3));
  const threatTier: CombatProjection['threatTier'] =
    score >= 92 ? 'S' : score >= 76 ? 'A' : score >= 58 ? 'B' : score >= 40 ? 'C' : 'D';

  const battleChakraPool = Math.round(capacity * 12 + stats.chakra * 0.4 + (hasClanLegacy ? 10 : 0));

  return {
    tai: Number(tai.toFixed(1)),
    spd: Number(spd.toFixed(1)),
    sta: Number(sta.toFixed(1)),
    chk: Number(chk.toFixed(1)),
    ins: Number(ins.toFixed(1)),
    letters: {
      tai: rankValueToLetter(tai),
      spd: rankValueToLetter(spd),
      sta: rankValueToLetter(sta),
      chk: rankValueToLetter(chk),
      ins: rankValueToLetter(ins),
    },
    score,
    threatTier,
    battleChakraPool,
  };
}

export function rollBirthBloodline(seed: number, originId: GameState['originId']): BloodlineState | null {
  const origin = ORIGIN_MAP[originId];
  const chance = 0.03 * origin.bloodlineMult;
  const roll = hashRand(seed, 0, 'bloodline_chance');
  if (roll >= chance) return null;

  const totalWeight = BLOODLINES.reduce((sum, b) => sum + b.weight, 0);
  let pickRoll = hashRand(seed, 0, 'bloodline_pick') * totalWeight;
  let chosen = BLOODLINES[0];
  for (const b of BLOODLINES) {
    pickRoll -= b.weight;
    if (pickRoll <= 0) {
      chosen = b;
      break;
    }
  }

  const [minG, maxG] = chosen.gradeRange;
  const gradeSpan = maxG - minG + 1;
  const grade = (minG + Math.floor(hashRand(seed, 0, 'bloodline_grade') * gradeSpan)) as 1 | 2 | 3 | 4 | 5;

  return {
    id: chosen.id,
    grade,
    stage: 'latent',
    lastEventAge: 0,
    declined: false,
  };
}

export function pickStartingDiscipline(
  seed: number,
  originId: GameState['originId'],
  element: ChakraElement,
): DisciplineProgress | null {
  const origin = ORIGIN_MAP[originId];
  if (!origin.isShinobiHouse || origin.familyDisciplines.length === 0) return null;
  const idx = Math.floor(hashRand(seed, 0, 'family_discipline') * origin.familyDisciplines.length);
  const chosenId = origin.familyDisciplines[idx] ?? `${element}_release`;
  if (!DISCIPLINE_MAP[chosenId]) return null;

  return {
    id: chosenId,
    level: 1,
    xp: 0,
    lastLevelAge: 0,
    quality: 1,
    isMain: true,
    declinedUntilAge: 0,
  };
}

export function ensureAcademyElementDiscipline(state: GameState): void {
  if (state.disciplines.length > 0) return;
  const elemId = `${state.element}_release`;
  if (!DISCIPLINE_MAP[elemId]) return;
  state.disciplines.push({
    id: elemId,
    level: 1,
    xp: 0,
    lastLevelAge: state.age,
    quality: 1,
    isMain: true,
    declinedUntilAge: 0,
  });
}

export function hasActiveTeacher(state: GameState): boolean {
  if (state.flags.has_teacher) return true;
  if (state.rank === 'academy') return true;
  if (state.team?.active) {
    const sensei = state.team.members.find((m) => m.role === 'sensei' && m.alive);
    if (sensei) return true;
  }
  return false;
}

export function awardYearlyDisciplineXp(state: GameState): void {
  if (state.disciplines.length === 0) return;
  const teacherMult = hasActiveTeacher(state) ? 1.4 : 0.85;
  const legacyBonus = state.hasClanLegacy ? 1 : 0;

  if (state.focus === 'training' || state.focus === 'balance') {
    const main = state.disciplines.find((d) => d.isMain) ?? state.disciplines[0];
    const baseGain = state.focus === 'training' ? 3 : 1;
    const cloneBonus = state.disciplines.some((d) => d.id === 'shadow_clone') ? 1 : 0;
    main.xp += Math.round(baseGain * teacherMult) + legacyBonus + cloneBonus;

    // Bonus XP if active Sensei shares a discipline you already know
    const sensei = state.team?.active
      ? state.team.members.find((m) => m.role === 'sensei' && m.alive)
      : undefined;
    for (const d of state.disciplines) {
      if (d.id !== main.id && state.focus === 'training') {
        d.xp += sensei && sensei.specialty === d.id ? 2 : 1;
      }
    }
  }

  if (state.focus === 'body') {
    const tai = state.disciplines.find((d) => DISCIPLINE_MAP[d.id]?.branch === 'taijutsu');
    if (tai) tai.xp += 2;
  }

  if (state.focus === 'mind') {
    const gen = state.disciplines.find((d) => DISCIPLINE_MAP[d.id]?.branch === 'genjutsu');
    if (gen) gen.xp += 2;
  }
}

export function tryBloodlineEvent(
  state: GameState,
  parentDiedThisYear: boolean,
): PendingDecision | null {
  const b = state.bloodline;
  if (!b || b.declined) return null;
  const def = BLOODLINE_MAP[b.id];
  if (!def) return null;

  const r = hashRand(state.rng.seed, state.age, `bloodline_${b.stage}`);

  if (b.stage === 'latent' && state.age >= 6 && state.age <= 22 && state.age - b.lastEventAge >= 3) {
    // 4-Layer Clan Heritage: awakening is NOT automatic at birth! Compatibility, trauma catalyst & training govern it.
    const ch = state.clanHeritage;
    const compatFactor = ch ? clamp(ch.compatibility / 65, 0.55, 1.45) : 1.0;
    const catalystBoost = ch ? clamp(ch.traumaCatalyst / 220, 0, 0.25) : 0;
    const baseProb = parentDiedThisYear
      ? 0.45
      : state.age === 18 && state.flags.custom_run
        ? 1.0
        : clamp(0.14 * compatFactor + catalystBoost, 0.06, 0.42);
    if (r < baseProb) {
      return {
        id: `bl_awaken_${state.age}`,
        kind: 'bloodline_event',
        eventId: 'bloodline_awaken',
        title: `Bloodline Awakening: ${def.name}`,
        body: `A sudden jolt tears through your chakra pathways. ${def.description} Even dormant instincts recognize the ${BLOODLINE_GRADE_NAMES[b.grade]}-grade gift surfacing inside you.`,
        manual: true,
        meta: { nextStage: 'awakened' },
        options: [
          {
            id: 'embrace',
            label: 'Embrace the awakening and study its flow',
            statHints: ['Chakra', 'Will'],
            autoEligible: true,
          },
          {
            id: 'suppress',
            label: 'Keep it sealed for now to avoid drawing attention',
            statHints: ['Will'],
            autoEligible: false,
          },
        ],
      };
    }
    return null;
  }

  if (b.stage !== 'latent' && b.stage !== 'mastered' && state.age <= 52 && state.age - b.lastEventAge >= 2) {
    const prob = b.stage === 'ctrl2' ? (b.id === 'rinne_eye' ? 0.16 : 0.28) : 0.18;
    if (r < prob) {
      const nextStage =
        b.stage === 'awakened' ? 'ctrl1' : b.stage === 'ctrl1' ? 'ctrl2' : 'mastered';
      return {
        id: `bl_adv_${state.age}`,
        kind: 'bloodline_event',
        eventId: 'bloodline_advance',
        title: `Refining ${def.name} (${BLOODLINE_STAGE_LABELS[nextStage]})`,
        body: `Your control over ${def.name} stands on the verge of a breakthrough. Pushing to the next stage will sharpen every battle reflex, though reckless practice carries a heavy physical cost.`,
        manual: false,
        meta: { nextStage },
        options: [
          {
            id: 'guided',
            label: 'Seek veteran guidance and protective herbs (-5 Ryo)',
            statHints: ['Ryo', 'Will'],
            disabled: state.stats.ryo < 5,
            disabledReason: 'Requires 5 Ryo',
            autoEligible: true,
          },
          {
            id: 'solo_push',
            label: 'Push through the breakthrough alone (risks Health)',
            statHints: ['Health', 'Will'],
            autoEligible: true,
          },
          {
            id: 'hold_back',
            label: 'Rest your coils and wait for another year',
            autoEligible: true,
          },
        ],
      };
    }
  }

  return null;
}

export function tryDisciplineEvent(state: GameState, rng: SeededRng): PendingDecision | null {
  if (state.rank === 'civilian' && state.disciplines.length === 0) return null;

  // 1. Check advancement for existing disciplines (with Pity Timer!)
  for (const prog of state.disciplines) {
    const def = DISCIPLINE_MAP[prog.id];
    if (!def || prog.level >= def.maxLevel) continue;
    if (state.age < prog.declinedUntilAge) continue;

    const nextLevel = (prog.level + 1) as 2 | 3 | 4;
    const minGap = nextLevel === 2 ? 2 : 3;
    if (state.age - prog.lastLevelAge < minGap) continue;

    const abilityGate = nextLevel === 2 ? 38 : nextLevel === 3 ? 58 : 72;
    if (state.stats[def.ability] < abilityGate) continue;

    if (nextLevel === 3 && state.capacity < 2 && !state.hasClanLegacy) continue;
    if (nextLevel === 4) {
      const currentMain = state.disciplines.find((d) => d.isMain);
      const mainCappedAt3 = currentMain ? (DISCIPLINE_MAP[currentMain.id]?.maxLevel ?? 4) < 4 : true;
      if ((!prog.isMain && !mainCappedAt3) || state.age < 20) continue;
      if (state.capacity < 4 && !state.hasClanLegacy && state.rank !== 'jonin') continue;
    }

    const needXp = XP_NEED_FOR_NEXT[prog.level as 1 | 2 | 3];
    const hasXp = prog.xp >= needXp;
    const pityTriggered = hasXp && state.age - prog.lastLevelAge >= minGap + 2;

    const baseProb = nextLevel === 2 ? 0.16 : nextLevel === 3 ? 0.1 : 0.06;
    const mult = (prog.isMain ? 2.2 : 1) * (hasXp ? 2.5 : 0.4);
    const roll = hashRand(state.rng.seed, state.age, `disc_adv_${prog.id}`);

    if (pityTriggered || roll < baseProb * mult) {
      const secretNote =
        nextLevel === 4 && def.secretArtName
          ? ` Reaching S-Rank unlocks your signature ultimate: ${def.secretArtName}.`
          : '';
      return {
        id: `disc_adv_${prog.id}_${state.age}`,
        kind: 'discipline_advance',
        eventId: 'discipline_advance',
        title: `Breakthrough: ${def.name} (${DISCIPLINE_TIER_NAMES[nextLevel]})`,
        body: `Years of hand seals and live drills align into sudden clarity in ${def.name}.${secretNote}`,
        manual: nextLevel === 4,
        meta: { disciplineId: prog.id, targetLevel: nextLevel, isNew: false },
        options: [
          {
            id: 'dig_deep',
            label: 'Dig deep and master every nuance (Quality 1.2x, -3 Health, -2 Bonds)',
            statHints: ['Health', 'Bonds'],
            autoEligible: true,
          },
          {
            id: 'learn_clean',
            label: 'Master the standard form cleanly (Quality 1.0x)',
            autoEligible: true,
          },
          {
            id: 'defer',
            label: 'Step back for now (3-year pause on this discipline)',
            autoEligible: false,
          },
        ],
      };
    }
  }

  // 2. Check learning a new discipline (up to 3 Ninjutsu/Genjutsu + 2 Taijutsu)
  if (state.age >= 9 && state.age <= 34) {
    const ninGenCount = state.disciplines.filter((d) => DISCIPLINE_MAP[d.id]?.branch !== 'taijutsu').length;
    const taiCount = state.disciplines.filter((d) => DISCIPLINE_MAP[d.id]?.branch === 'taijutsu').length;

    const learnProb = state.focus === 'training' || state.focus === 'body' ? 0.18 : 0.08;
    if (hashRand(state.rng.seed, state.age, 'disc_learn_roll') < learnProb) {
      const owned = new Set(state.disciplines.map((d) => d.id));
      const senseiSpec = state.team?.active
        ? state.team.members.find((m) => m.role === 'sensei' && m.alive)?.specialty
        : undefined;

      const candidates = DISCIPLINES.filter((def) => {
        if (owned.has(def.id)) return false;
        if (def.id === 'senjutsu' && state.age < 18) return false;
        if (def.id === 'space_time' && state.stats.intel < 50) return false;
        if (def.branch === 'taijutsu') return taiCount < 2;
        return ninGenCount < 3;
      });

      if (candidates.length > 0) {
        const chosen =
          senseiSpec && candidates.some((c) => c.id === senseiSpec) && rng.chance(0.55)
            ? DISCIPLINE_MAP[senseiSpec]
            : rng.pick(candidates);

        const senseiLine =
          senseiSpec === chosen.id
            ? 'Your Jonin Sensei demonstrates the foundation directly during squad drills.'
            : 'Through scrolls and sparring observations, an opportunity opens to learn a new shinobi discipline.';

        return {
          id: `disc_new_${chosen.id}_${state.age}`,
          kind: 'discipline_advance',
          eventId: 'discipline_new',
          title: `New Discipline Available: ${chosen.name}`,
          body: `${senseiLine} ${chosen.combatRole}`,
          manual: false,
          meta: { disciplineId: chosen.id, targetLevel: 1, isNew: true },
          options: [
            {
              id: 'learn_clean',
              label: `Begin studying ${chosen.name} (D-Rank Novice)`,
              autoEligible: true,
            },
            {
              id: 'defer',
              label: 'Focus on your current repertoire instead',
              autoEligible: true,
            },
          ],
        };
      }
    }
  }

  return null;
}
