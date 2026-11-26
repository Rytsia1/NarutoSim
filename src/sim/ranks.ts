import { computeCombatProjection } from './powers';
import type { SeededRng } from './rng';
import type { GameState, PendingDecision, ShinobiRank } from './types';

export const RANK_ORDER: Record<ShinobiRank, number> = {
  civilian: 0,
  academy: 1,
  genin: 2,
  chunin: 3,
  jonin: 4,
};

export function promoteRank(state: GameState, target: ShinobiRank): void {
  state.rank = target;
  if (RANK_ORDER[target] > RANK_ORDER[state.peakRank]) {
    state.peakRank = target;
  }
}

export function buildAcademyChoiceDecision(state: GameState): PendingDecision {
  return {
    id: `academy_choice_${state.age}`,
    kind: 'academy_choice',
    eventId: 'academy_choice',
    title: 'The Shinobi Academy Gates',
    body: 'At age six, children across the village line up beneath the wooden archway of the Shinobi Academy. Without a clan obligation, the path ahead is yours to choose.',
    manual: true,
    options: [
      {
        id: 'enroll',
        label: 'Enroll in the Shinobi Academy',
        sublabel: 'Begin training toward Genin, squad missions, and rank exams.',
        statHints: ['Chakra', 'Intel'],
        autoEligible: true,
      },
      {
        id: 'stay_civilian',
        label: 'Stay outside the shinobi system as a village civilian',
        sublabel: 'Safer peacetime life, though wars can still reach your doorstep.',
        statHints: ['Ryo', 'Bonds'],
        autoEligible: false,
      },
    ],
  };
}

export function canTakeGraduationExam(state: GameState): boolean {
  if (state.rank !== 'academy') return false;
  if (state.age === 12) return true;
  if (state.age >= 10 && state.age < 12) {
    // Early graduation opportunity for prodigious students
    const total = state.stats.chakra + state.stats.intel + state.stats.health;
    return total >= 150;
  }
  return state.age > 12 && state.academyFailedCount < 2;
}

export function buildGraduationExamDecision(state: GameState): PendingDecision {
  const isEarly = state.age < 12;
  return {
    id: `grad_exam_${state.age}`,
    kind: 'graduation_exam',
    eventId: 'graduation_exam',
    title: isEarly ? 'Early Academy Graduation Trial' : 'Shinobi Academy Graduation Exam',
    body: isEarly
      ? 'Instructors have flagged your unusually sharp progress. You may sit the Graduation Exam early to claim your forehead protector ahead of your peers.'
      : 'Three senior instructors sit behind a desk lined with metal forehead protectors. You must demonstrate Clone control, target precision, and composure under pressure.',
    manual: true,
    options: [
      {
        id: 'chakra_form',
        label: 'Demonstrate crisp Clone and Chakra control',
        statHints: ['Chakra', 'Intel'],
        autoEligible: true,
      },
      {
        id: 'taijutsu_form',
        label: 'Rely on relentless Taijutsu and target accuracy',
        statHints: ['Health', 'Will'],
        autoEligible: true,
      },
      ...(isEarly
        ? [
            {
              id: 'wait_normal',
              label: 'Wait and graduate with your classmates at age 12',
              statHints: ['Bonds'],
              autoEligible: false,
            },
          ]
        : []),
    ],
  };
}

export function canTakeChuninExam(state: GameState): boolean {
  if (state.rank !== 'genin') return false;
  if (state.specialStatus === 'missing_nin') return false;
  if (state.age < 13) return false;
  if (state.geninSinceAge !== null && state.age - state.geninSinceAge < 1) return false;
  return true;
}

export function buildChuninExamStage(state: GameState, stage: 1 | 2 | 3): PendingDecision {
  const hasActiveTeam = Boolean(state.team?.active);
  if (stage === 1) {
    return {
      id: `chunin_s1_${state.age}`,
      kind: 'chunin_exam_stage',
      eventId: 'chunin_stage_1',
      title: 'Chunin Exam (Stage 1 of 3): The Written Cipher',
      body: hasActiveTeam
        ? `Your Sensei has endorsed Team ${state.team!.number} for the Chunin Exams. In a silent hall packed with rival villages, the proctor lays down nine impossible questions and warns that quitting preserves your squad’s future eligibility.`
        : 'Entering the Chunin Exams as an independent Genin, you face a silent hall of rival candidates and a proctor testing nerve as much as knowledge.',
      manual: true,
      meta: { stage: 1 },
      options: [
        {
          id: 'intel_gather',
          label: 'Stealthily gather answers without getting caught',
          statHints: ['Intel', 'Chakra'],
          autoEligible: true,
        },
        {
          id: 'bluff_resolve',
          label: 'Leave the sheet blank and stake everything on the Tenth Question',
          statHints: ['Will'],
          autoEligible: true,
        },
        {
          id: 'withdraw_exam',
          label: 'Withdraw from this year’s exam and train another year',
          autoEligible: false,
        },
      ],
    };
  }

  if (stage === 2) {
    return {
      id: `chunin_s2_${state.age}`,
      kind: 'chunin_exam_stage',
      eventId: 'chunin_stage_2',
      title: 'Chunin Exam (Stage 2 of 3): The Forest of Death',
      body: 'Five days inside a walled jungle holding Heaven and Earth scrolls. Rival Genin from neighboring villages hunt through the canopy. Casualties are signed off in advance.',
      manual: true,
      meta: { stage: 2 },
      options: [
        {
          id: 'ambush_hunt',
          label: 'Set a wire ambush and seize a scroll by force',
          sublabel: 'High reward, carries real risk of lethal injury if overwhelmed.',
          statHints: ['Chakra', 'Health'],
          autoEligible: true,
        },
        {
          id: 'stealth_route',
          label: 'Shadow stronger squads and slip to the tower with minimal fights',
          statHints: ['Intel', 'Will'],
          autoEligible: true,
        },
        ...(hasActiveTeam
          ? [
              {
                id: 'squad_cover',
                label: 'Tighten formation with your Genin squad and protect every flank',
                statHints: ['Bonds', 'Will'],
                autoEligible: true,
              },
            ]
          : []),
      ],
    };
  }

  const rival = state.rivalId
    ? state.team?.members.find((m) => m.id === state.rivalId && m.alive && m.specialStatus !== 'missing_nin')
    : undefined;
  return {
    id: `chunin_s3_${state.age}`,
    kind: 'chunin_exam_stage',
    eventId: 'chunin_stage_3',
    title: rival ? `Chunin Exam (Stage 3 of 3): Arena Finals vs ${rival.name}` : 'Chunin Exam (Stage 3 of 3): Arena Finals',
    body: rival
      ? `Kage envoys and Jonin examiners watch from the upper gallery as you step onto the central sand across from your rival, ${rival.name}. Victory matters less than demonstrating tactical judgment worthy of leading missions.`
      : 'Kage envoys and Jonin examiners watch from the upper gallery as you step into the central sand arena solo. Victory matters less than demonstrating tactical judgment worthy of leading missions.',
    manual: true,
    meta: { stage: 3, rivalName: rival?.name ?? '' },
    options: [
      {
        id: 'tactical_outplay',
        label: 'Control range, read enemy hand seals, and win through strategy',
        statHints: ['Intel', 'Will'],
        autoEligible: true,
      },
      {
        id: 'full_power',
        label: 'Overwhelm the opponent with raw Chakra and relentless pressure',
        statHints: ['Chakra', 'Health'],
        autoEligible: true,
      },
      {
        id: 'grit_endure',
        label: 'Absorb their opening barrage and counter when their reserves fade',
        statHints: ['Health', 'Will'],
        autoEligible: true,
      },
    ],
  };
}

/**
 * Evaluates whether active Genin teammates pass the Chunin Exam alongside or ahead of the player.
 */
export function evaluateTeammatesChuninPass(state: GameState, rng: SeededRng): string[] {
  const team = state.team;
  if (!team || !team.active) return [];
  const promoted: string[] = [];

  for (const mate of team.members) {
    if (mate.role !== 'teammate' || !mate.alive || mate.rank !== 'genin') continue;
    const passChance = Math.min(0.65, Math.max(0.15, (mate.powerScore - 36) / 55));
    if (rng.chance(passChance)) {
      mate.rank = 'chunin';
      mate.fateNote = `Promoted to Chunin at age ${mate.age} in the exams.`;
      promoted.push(mate.name);
    }
  }
  return promoted;
}

export function canTakeJoninEvaluation(state: GameState): boolean {
  if (state.rank !== 'chunin') return false;
  if (state.specialStatus === 'missing_nin') return false;
  if (state.age < 16) return false;
  if (state.stats.intel < 45 || state.stats.will < 45) return false;
  if (state.disciplines.length < 2 || !state.disciplines.some((d) => d.level >= 2)) return false;
  if (state.joninEvalFailedAge !== null && state.age - state.joninEvalFailedAge < 2) return false;
  const proj = computeCombatProjection(state);
  return proj.score >= 54;
}

export function buildJoninEvaluationDecision(state: GameState): PendingDecision {
  const proj = computeCombatProjection(state);
  return {
    id: `jonin_eval_${state.age}`,
    kind: 'jonin_eval',
    eventId: 'jonin_eval',
    title: 'Jonin Promotion Board',
    body: `The council has reviewed your mission dossier (Projected Threat Tier: ${proj.threatTier}-Rank). To earn Jonin authority, you must pass a live tactical command and combat evaluation before senior examiners.`,
    manual: true,
    options: [
      {
        id: 'command_scenario',
        label: 'Lead the simulated ambush defense with calm tactical command',
        statHints: ['Intel', 'Will'],
        autoEligible: true,
      },
      {
        id: 'duel_examiner',
        label: 'Hold your ground in a live sparring exchange against an examiner',
        statHints: ['Chakra', 'Health'],
        autoEligible: true,
      },
    ],
  };
}
