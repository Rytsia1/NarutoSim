import { getClansForVillage } from '../data/clans';
import { GREAT_VILLAGES, VILLAGE_MAP } from '../data/villages';
import { addNpcMemory, createWorldNpc } from './npc-sim';
import { clamp, computeCombatProjection } from './powers';
import type { SeededRng } from './rng';
import { recordTimelineEvent } from './timeline';
import type {
  ChuninExamStage,
  ChuninParticipant,
  ChuninTournamentState,
  GameState,
  PendingDecision,
  ShinobiRank,
} from './types';

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
  const vDef = VILLAGE_MAP[state.villageId];
  const bloodyMist = Boolean(state.worldSim?.villages[state.villageId]?.academy.bloodyMistActive ?? vDef.institutions.bloodlineSuspicion);
  const doctrineBody = bloodyMist
    ? `Under ${vDef.name}'s brutal ${vDef.institutions.academyLabel}, examiners test lethal composure in a fog-shrouded proving ring. Passing is harder, yet survivors forge iron Will.`
    : `Three senior instructors of the ${vDef.institutions.academyLabel} sit behind a desk lined with metal forehead protectors. You must demonstrate Clone control, target precision, and composure under pressure.`;
  return {
    id: `grad_exam_${state.age}`,
    kind: 'graduation_exam',
    eventId: 'graduation_exam',
    title: isEarly
      ? `Early Trial: ${vDef.institutions.academyLabel}`
      : `${vDef.institutions.academyLabel} Graduation Exam`,
    body: isEarly
      ? `Instructors at ${vDef.institutions.academyLabel} have flagged your unusually sharp progress. You may sit the Graduation Exam early to claim your forehead protector ahead of your peers.`
      : doctrineBody,
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

export interface ChuninStageOptions {
  finalsRound?: 1 | 2;
  prepBonus?: number;
  finalsScore?: number;
}

export function buildChuninExamStage(
  state: GameState,
  stage: ChuninExamStage,
  opts: ChuninStageOptions = {},
): PendingDecision {
  const hasActiveTeam = Boolean(state.team?.active);
  const hasKenjutsu = state.disciplines.some((d) => d.id === 'kenjutsu');
  const hasSensoryOrEye =
    state.disciplines.some((d) => d.id === 'sensory') ||
    (state.bloodline !== null &&
      state.bloodline.stage !== 'latent' &&
      (state.bloodline.id === 'sharingan' || state.bloodline.id === 'byakugan'));

  // Stage 1: Written Cipher (Ibiki's Hall)
  if (stage === 1) {
    return {
      id: `chunin_s1_${state.age}`,
      kind: 'chunin_exam_stage',
      eventId: 'chunin_stage_1',
      title: 'Chunin Exam (Stage 1 of 6): The Written Cipher',
      body: hasActiveTeam
        ? `Your Sensei has endorsed Team ${state.team!.number} for the Chunin Exams. In a silent hall packed with rival villages, the proctor lays down nine impossible questions and warns that quitting preserves your squad's future eligibility.`
        : 'Entering the Chunin Exams as an independent Genin, you face a silent hall of rival candidates and a proctor testing nerve as much as knowledge.',
      manual: true,
      meta: { stage: 1 },
      options: [
        ...(hasSensoryOrEye
          ? [
              {
                id: 'bloodline_sensory_cheat',
                label: 'Use heightened perception to copy answers without a single tell',
                sublabel: 'Sensory / Dojutsu edge: high clear chance and +3 Intel.',
                statHints: ['Intel', 'Chakra'],
                autoEligible: true,
              },
            ]
          : []),
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

  // Stage 2: Forest of Death - Day 1 Scroll Hunt
  if (stage === 2) {
    return {
      id: `chunin_s2_${state.age}`,
      kind: 'chunin_exam_stage',
      eventId: 'chunin_stage_2',
      title: 'Chunin Exam (Stage 2 of 6): Forest of Death (Scroll Hunt)',
      body: 'Five days inside a walled jungle holding Heaven and Earth scrolls. You enter the gate with a Heaven scroll and must seize an Earth scroll from rival Genin hunting through the canopy.',
      manual: true,
      meta: { stage: 2 },
      options: [
        {
          id: 'ambush_hunt',
          label: 'Set a wire ambush and seize a scroll by force',
          sublabel: 'High reward, carries real risk of injury if overwhelmed.',
          statHints: ['Chakra', 'Health'],
          autoEligible: true,
        },
        {
          id: 'stealth_route',
          label: 'Shadow stronger squads and pick off an exhausted scroll carrier',
          statHints: ['Intel', 'Will'],
          autoEligible: true,
        },
        ...(hasActiveTeam
          ? [
              {
                id: 'squad_cover',
                label: 'Tighten formation with your Genin squad to corner a rival cell cleanly',
                statHints: ['Bonds', 'Will'],
                autoEligible: true,
              },
            ]
          : []),
        {
          id: 'barter_trap',
          label: 'Stage a decoy scroll exchange and spring a fast counter-snare',
          statHints: ['Intel', 'Chakra'],
          autoEligible: true,
        },
      ],
    };
  }

  // Stage 3: Forest of Death - Day 3-5 Mid-Forest Hazard & Tower Gate Sprint
  if (stage === 3) {
    return {
      id: `chunin_s3_${state.age}`,
      kind: 'chunin_exam_stage',
      eventId: 'chunin_stage_3',
      title: 'Chunin Exam (Stage 3 of 6): Forest of Death (Tower Sprint)',
      body: 'With both scrolls secured on Day 4, heavy rain floods the ravine before the Central Tower. A desperate rival team blocks the stone bridge while giant forest predators stir in the roots below.',
      manual: true,
      meta: { stage: 3 },
      options: [
        {
          id: 'hold_the_line',
          label: 'Crash straight through the blockade with full combat momentum',
          sublabel: 'Tests Chakra & Health; risks wounds if they hold firm.',
          statHints: ['Chakra', 'Health'],
          autoEligible: true,
        },
        {
          id: 'smoke_diversion',
          label: 'Detonate flash tags into the canopy and slip through the lower roots',
          statHints: ['Intel', 'Will'],
          autoEligible: true,
        },
        ...(hasActiveTeam
          ? [
              {
                id: 'protect_teammate',
                label: 'Cover your exhausted squadmates’ retreat into the tower gate',
                sublabel: 'Tests Bonds & Will; deepens Team Kizuna.',
                statHints: ['Bonds', 'Will'],
                autoEligible: true,
              },
            ]
          : []),
      ],
    };
  }

  // Stage 4: Tower Preliminaries (1v1 Elimination)
  if (stage === 4) {
    const prelimOpp = state.chuninTournament?.participants.find(
      (p) => p.npcId === state.chuninTournament?.prelimOpponentId,
    );
    const oppDesc = prelimOpp
      ? `The match board flashes your name opposite ${prelimOpp.name} of ${VILLAGE_MAP[prelimOpp.villageId].name} (Power ${prelimOpp.powerScore}).`
      : 'The proctor announces sudden 1v1 elimination bouts to narrow the field for the Stadium Finals.';
    return {
      id: `chunin_s4_${state.age}`,
      kind: 'chunin_exam_stage',
      eventId: 'chunin_stage_4',
      title: prelimOpp
        ? `Chunin Exam (Stage 4 of 6): Preliminaries vs ${prelimOpp.name}`
        : 'Chunin Exam (Stage 4 of 6): Tower Preliminary Bouts',
      body: `Too many candidates survived the Forest of Death. Beneath a towering carved hand-seal statue inside the Central Tower, ${oppDesc}`,
      manual: true,
      meta: { stage: 4 },
      options: [
        {
          id: 'prelim_taijutsu',
          label: 'Overwhelm your opponent in relentless close-quarters Taijutsu',
          statHints: ['Health', 'Will'],
          autoEligible: true,
        },
        ...(hasKenjutsu
          ? [
              {
                id: 'prelim_kenjutsu',
                label: 'Draw steel and end the bout with a blinding Kenjutsu flash cut',
                sublabel: 'Shinobi Kenjutsu mastery gives a decisive speed edge.',
                statHints: ['Health', 'Will'],
                autoEligible: true,
              },
            ]
          : []),
        {
          id: 'prelim_ninjutsu',
          label: 'Control the arena floor with sharp elemental Ninjutsu',
          statHints: ['Chakra', 'Intel'],
          autoEligible: true,
        },
        {
          id: 'prelim_genjutsu',
          label: 'Trap them in a subtle Genjutsu feint and force a clean forfeit',
          statHints: ['Intel', 'Will'],
          autoEligible: true,
        },
      ],
    };
  }

  // Stage 5: One-Month Finals Preparation Window
  if (stage === 5) {
    return {
      id: `chunin_s5_${state.age}`,
      kind: 'chunin_exam_stage',
      eventId: 'chunin_stage_5',
      title: 'Chunin Exam (Stage 5 of 6): One-Month Finals Training',
      body: 'You survived the Preliminaries! One full month remains before the Kage, Daimyo, and packed stadium stands witness the Finals. How will you spend these thirty days?',
      manual: true,
      meta: { stage: 5 },
      options: [
        {
          id: 'prep_jutsu',
          label: 'Lock yourself on the cliffside refining your signature Jutsu (+4 Chakra, +6 XP)',
          sublabel: 'Grants +8 Finals momentum bonus.',
          statHints: ['Chakra'],
          autoEligible: true,
        },
        {
          id: 'prep_blade_body',
          label: hasKenjutsu
            ? 'Drill draw-cuts and weighted sprints until dusk (+4 Health, +3 Will, +5 XP)'
            : 'Push conditioning and weighted Taijutsu drills (+4 Health, +3 Will)',
          sublabel: 'Grants +8 Finals momentum bonus.',
          statHints: ['Health', 'Will'],
          autoEligible: true,
        },
        {
          id: 'prep_tactics',
          label: 'Study every rival finalist’s habits and elemental counters (+5 Intel, +2 Will)',
          sublabel: 'Grants +9 Finals tactical bonus.',
          statHints: ['Intel'],
          autoEligible: true,
        },
        {
          id: 'prep_squad_spar',
          label: 'Spar daily with your Sensei and comrades (+4 Bonds, +2 Will, Squad Trust)',
          sublabel: 'Grants +7 Finals momentum bonus and deepens bonds.',
          statHints: ['Bonds'],
          autoEligible: true,
        },
      ],
    };
  }

  // Stage 6: Stadium Finals (2-Beat Duel: Round 1 Opening -> Round 2 Climax)
  const finalsRound = opts.finalsRound ?? 1;
  const prepBonus = opts.prepBonus ?? 0;
  const finalsScore = opts.finalsScore ?? 0;
  const rival = state.rivalId
    ? state.team?.members.find((m) => m.id === state.rivalId && m.alive && m.specialStatus !== 'missing_nin')
    : undefined;
  const tourneyFinalist = state.chuninTournament?.participants.find(
    (p) => p.npcId === state.chuninTournament?.finalsOpponentId,
  );
  const finalsOppName = rival?.name ?? tourneyFinalist?.name ?? '';
  const opponentLabel = rival
    ? `your sworn rival ${rival.name}`
    : tourneyFinalist
      ? `${tourneyFinalist.name} of ${VILLAGE_MAP[tourneyFinalist.villageId].name}`
      : 'a heralded prodigy from a rival village';

  if (finalsRound === 1) {
    return {
      id: `chunin_s6_r1_${state.age}`,
      kind: 'chunin_exam_stage',
      eventId: 'chunin_stage_6_r1',
      title: finalsOppName
        ? `Chunin Exam (Stage 6 of 6 · Opening): Finals vs ${finalsOppName}`
        : 'Chunin Exam (Stage 6 of 6 · Opening): Stadium Finals',
      body: `Cheers shake the packed stadium walls as Kage envoys and Jonin examiners watch from the upper gallery. You step onto the sunlit sand across from ${opponentLabel}. How do you open the championship bout?`,
      manual: true,
      meta: {
        stage: 6,
        finalsRound: 1,
        prepBonus,
        finalsScore: 0,
        rivalName: finalsOppName,
      },
      options: [
        {
          id: 'open_tactical_read',
          label: 'Probe their footwork with wire kunai and read their chakra rhythm',
          statHints: ['Intel', 'Will'],
          autoEligible: true,
        },
        {
          id: 'open_pressure',
          label: 'Explode forward immediately with elemental chakra pressure',
          statHints: ['Chakra', 'Health'],
          autoEligible: true,
        },
        ...(hasKenjutsu
          ? [
              {
                id: 'open_kenjutsu_draw',
                label: 'Flash-step inside their guard with a high-speed Kenjutsu iai draw',
                statHints: ['Health', 'Will'],
                autoEligible: true,
              },
            ]
          : []),
        {
          id: 'open_endure',
          label: 'Bait their strongest opening volley to drain their reserves early',
          statHints: ['Health', 'Will'],
          autoEligible: true,
        },
      ],
    };
  }

  return {
    id: `chunin_s6_r2_${state.age}`,
    kind: 'chunin_exam_stage',
    eventId: 'chunin_stage_6_r2',
    title: rival
      ? `Chunin Exam (Stage 6 of 6 · Climax): Finals vs ${rival.name}`
      : 'Chunin Exam (Stage 6 of 6 · Climax): Stadium Finals',
    body: `Dust hangs thick across the arena floor as both fighters trade heavy breaths. The examiners lean forward from the gallery: victory matters less than demonstrating tactical judgment worthy of leading missions.`,
    manual: true,
    meta: {
      stage: 6,
      finalsRound: 2,
      prepBonus,
      finalsScore,
      rivalName: rival?.name ?? '',
    },
    options: [
      {
        id: 'tactical_outplay',
        label: 'Spring a layered multi-step trap and win through pure strategy',
        statHints: ['Intel', 'Will'],
        autoEligible: true,
      },
      {
        id: 'full_power',
        label: 'Commit everything to your signature Jutsu in a decisive clash',
        statHints: ['Chakra', 'Health'],
        autoEligible: true,
      },
      ...(hasKenjutsu
        ? [
            {
              id: 'kenjutsu_finisher',
              label: 'Channel chakra down your blade for a razor-clean Kenjutsu finisher',
              statHints: ['Health', 'Will'],
              autoEligible: true,
            },
          ]
        : []),
      {
        id: 'grit_endure',
        label: 'Weather their final surge and land a calm decisive counter',
        statHints: ['Health', 'Will'],
        autoEligible: true,
      },
    ],
  };
}

export function initChuninTournament(state: GameState, rng: SeededRng): ChuninTournamentState {
  const worldSim = state.worldSim;
  const year = state.birthYear + state.age;
  const participants: ChuninParticipant[] = [
    {
      npcId: 'player',
      name: state.name,
      villageId: state.villageId,
      clanId: state.clanId ?? null,
      powerScore: computeCombatProjection(state).score,
      isTeammate: false,
      isRival: false,
      status: 'active',
    },
  ];
  const seenIds = new Set<string>(['player']);

  // Include active Genin teammates first
  if (state.team) {
    for (const m of state.team.members) {
      if (m.role !== 'teammate' || !m.alive || m.rank !== 'genin') continue;
      const linkedNpc = worldSim?.npcs.find((n) => n.identity.linkedTeamMemberId === m.id);
      const id = linkedNpc?.identity.id ?? m.id;
      if (seenIds.has(id)) continue;
      seenIds.add(id);
      participants.push({
        npcId: id,
        name: m.name,
        villageId: state.villageId,
        clanId: linkedNpc?.identity.clanId ?? null,
        powerScore: m.powerScore,
        isTeammate: true,
        isRival: m.id === state.rivalId,
        status: 'active',
      });
    }
  }

  // Pull existing living Genin NPCs from across the world
  if (worldSim) {
    const worldGenin = worldSim.npcs.filter(
      (n) =>
        n.identity.alive &&
        n.identity.rank === 'genin' &&
        n.identity.specialStatus === 'none' &&
        !seenIds.has(n.identity.id),
    );
    for (const g of worldGenin.slice(0, 12)) {
      seenIds.add(g.identity.id);
      participants.push({
        npcId: g.identity.id,
        name: g.identity.name,
        villageId: g.identity.villageId,
        clanId: g.identity.clanId,
        powerScore: g.identity.powerScore,
        isTeammate: false,
        isRival: g.relationships.player?.kind === 'rival',
        status: 'active',
      });
    }

    // Fill up to 14 participants with real foreign Genin candidates
    const usedNames = new Set(worldSim.npcs.map((n) => n.identity.name));
    usedNames.add(state.name);
    while (participants.length < 14) {
      const vDef = rng.pick(GREAT_VILLAGES);
      const vClans = getClansForVillage(vDef.id);
      const clan = vClans.length > 0 && rng.chance(0.6) ? rng.pick(vClans) : null;
      const foreignGenin = createWorldNpc(
        worldSim,
        {
          villageId: vDef.id,
          clanId: clan?.id ?? null,
          age: rng.int(12, 16),
          rank: 'genin',
          specialStatus: 'none',
          roleTitle: 'Chunin Exam Candidate',
          roleBias: 'peer',
          powerScore: rng.int(36, 62),
          birthYear: year,
        },
        usedNames,
        rng,
      );
      worldSim.npcs.push(foreignGenin);
      seenIds.add(foreignGenin.identity.id);
      participants.push({
        npcId: foreignGenin.identity.id,
        name: foreignGenin.identity.name,
        villageId: foreignGenin.identity.villageId,
        clanId: foreignGenin.identity.clanId,
        powerScore: foreignGenin.identity.powerScore,
        isTeammate: false,
        isRival: false,
        status: 'active',
      });
    }
  }

  const hostVillageId = rng.chance(0.65) ? state.villageId : rng.pick(GREAT_VILLAGES).id;
  const tourney: ChuninTournamentState = {
    examYear: year,
    hostVillageId,
    stage: 1,
    participants,
    prelimOpponentId: null,
    finalsOpponentId: null,
    casualties: [],
    promotedNames: [],
    completed: false,
  };
  state.chuninTournament = tourney;
  return tourney;
}

export function advanceChuninTournamentStage(
  state: GameState,
  completedStage: ChuninExamStage,
  rng: SeededRng,
): string[] {
  const tourney = state.chuninTournament;
  const worldSim = state.worldSim;
  if (!tourney || tourney.completed) return [];
  const year = state.birthYear + state.age;
  const notes: string[] = [];

  const npcActives = tourney.participants.filter((p) => p.npcId !== 'player' && p.status === 'active');

  if (completedStage === 1) {
    // Stage 1 Written Cipher eliminates ~25% of NPCs
    for (const p of npcActives) {
      if (rng.chance(clamp(0.32 - (p.powerScore - 40) * 0.008, 0.1, 0.45))) {
        p.status = 'eliminated_s1';
        p.eliminationNote = 'failed the Written Cipher';
      }
    }
    const left = tourney.participants.filter((p) => p.status === 'active').length;
    notes.push(`${left} candidates from across the nations advance from the Written Hall to the Forest of Death.`);
  } else if (completedStage === 2 || completedStage === 3) {
    // Forest of Death: ~35% eliminated, rare ~6% genuine casualty among non-teammate NPCs!
    for (const p of npcActives) {
      if (completedStage === 2 && rng.chance(0.28)) {
        p.status = 'eliminated_s2';
        p.eliminationNote = 'lost their Heaven/Earth scroll in the Forest of Death';
      } else if (completedStage === 3 && !p.isTeammate && rng.chance(0.06) && tourney.casualties.length < 2) {
        p.status = 'deceased';
        p.eliminationNote = 'fell in the Forest of Death';
        tourney.casualties.push(p.name);
        const npc = worldSim?.npcs.find((n) => n.identity.id === p.npcId);
        if (npc && npc.identity.alive) {
          npc.identity.alive = false;
          npc.identity.deathAge = npc.identity.age;
          npc.identity.deathCause = 'killed during the Forest of Death Chunin Exam';
        }
        notes.push(`Tragedy in the Forest of Death: ${p.name} (${VILLAGE_MAP[p.villageId].name}) did not make it to the Central Tower alive.`);
      }
    }
    // Pick a surviving Preliminaries opponent for Stage 4
    const survivingOpps = tourney.participants.filter((p) => p.npcId !== 'player' && p.status === 'active');
    if (survivingOpps.length > 0 && !tourney.prelimOpponentId) {
      tourney.prelimOpponentId = rng.pick(survivingOpps).npcId;
    }
  } else if (completedStage === 4) {
    // Preliminaries narrow NPCs down to 3-4 finalists
    const remaining = tourney.participants.filter((p) => p.npcId !== 'player' && p.status === 'active');
    for (const p of remaining) {
      if (p.npcId === tourney.prelimOpponentId) {
        p.status = 'eliminated_s4';
        p.eliminationNote = `defeated by ${state.name} in the Tower Preliminaries`;
        continue;
      }
      if (rng.chance(0.45)) {
        p.status = 'eliminated_s4';
        p.eliminationNote = 'defeated in the Tower Preliminary bouts';
      } else {
        p.status = 'finalist';
      }
    }
    const finalists = tourney.participants.filter((p) => p.npcId !== 'player' && (p.status === 'finalist' || p.status === 'active'));
    if (finalists.length > 0) {
      const rivalFinalist = finalists.find((f) => f.isRival) ?? finalists[0];
      tourney.finalsOpponentId = rivalFinalist.npcId;
      notes.push(`Stadium Finalists announced, including ${finalists.slice(0, 3).map((f) => f.name).join(', ')}.`);
    }
  }

  tourney.stage = Math.min(6, completedStage + 1) as ChuninExamStage;
  if (tourney.casualties.length > 0 && worldSim && completedStage === 3) {
    recordTimelineEvent(state, worldSim, {
      category: 'npc_fate',
      villageIds: [tourney.hostVillageId],
      truthTitle: `Chunin Exam Forest Casualties (${year})`,
      truthSummary: `${tourney.casualties.join(' and ')} perished inside the Forest of Death during the ${VILLAGE_MAP[tourney.hostVillageId].name} Chunin Exams.`,
      rumorTitle: `Whispers of Harsh Forest Losses at the Chunin Exams`,
      rumorSummary: `Observers whisper that this year's Forest of Death claimed young Genin lives.`,
      isSecret: false,
      immediateChannel: 'newspaper',
      sourceLabel: 'Chunin Exam Bulletin',
    });
  }
  return notes;
}

export function finalizeChuninTournament(
  state: GameState,
  playerPassed: boolean,
  rng: SeededRng,
): { promotedNpcs: string[]; failedRivals: string[]; summary: string } {
  const tourney = state.chuninTournament;
  const worldSim = state.worldSim;
  if (!tourney || tourney.completed) {
    return { promotedNpcs: [], failedRivals: [], summary: '' };
  }
  tourney.completed = true;
  const year = state.birthYear + state.age;
  const promotedNpcs: string[] = [];
  const failedRivals: string[] = [];

  const playerP = tourney.participants.find((p) => p.npcId === 'player');
  if (playerP) {
    playerP.status = playerPassed ? 'promoted' : 'eliminated_s4';
  }

  // Independent NPC winners & failures (friends can win even if player failed!)
  const contenders = tourney.participants.filter(
    (p) => p.npcId !== 'player' && (p.status === 'active' || p.status === 'finalist'),
  );
  for (const c of contenders) {
    const promoteProb = clamp(0.28 + (c.powerScore - 42) * 0.015, 0.16, 0.72);
    const won = rng.chance(promoteProb) && promotedNpcs.length < 3;
    const npc = worldSim?.npcs.find((n) => n.identity.id === c.npcId);
    if (won) {
      c.status = 'promoted';
      promotedNpcs.push(c.name);
      tourney.promotedNames.push(c.name);
      if (npc && npc.identity.alive && npc.identity.rank === 'genin') {
        npc.identity.rank = 'chunin';
        npc.identity.roleTitle = 'Village Chunin';
        npc.identity.powerScore = clamp(npc.identity.powerScore + 6, 10, 99);
        addNpcMemory(npc, {
          year,
          age: npc.identity.age,
          tag: 'exam',
          summary: `Earned the Chunin flak jacket at the ${VILLAGE_MAP[tourney.hostVillageId].name} Exams!`,
          impact: 7,
        });
      }
      if (c.isTeammate && state.team) {
        const tm = state.team.members.find((m) => m.name === c.name && m.alive);
        if (tm && tm.rank === 'genin') {
          tm.rank = 'chunin';
          tm.fateNote = `Promoted to Chunin at age ${tm.age} in the tournament.`;
        }
      }
    } else {
      if (c.isRival) failedRivals.push(c.name);
      if (npc && npc.identity.alive) {
        addNpcMemory(npc, {
          year,
          age: npc.identity.age,
          tag: 'exam',
          summary: `Fell short of Chunin promotion in the ${year} Exams.`,
          impact: -4,
        });
      }
    }
  }

  const allWinners = [...(playerPassed ? [state.name] : []), ...promotedNpcs];
  const summary =
    allWinners.length > 0
      ? `Chunin Exam ${year} concluded: ${allWinners.join(', ')} earned promotion${tourney.casualties.length > 0 ? `; casualties: ${tourney.casualties.join(', ')}` : ''}.`
      : `Chunin Exam ${year} concluded with zero candidates deemed ready for Chunin command.`;

  if (worldSim) {
    recordTimelineEvent(state, worldSim, {
      category: 'npc_fate',
      villageIds: [tourney.hostVillageId, state.villageId],
      truthTitle: `${VILLAGE_MAP[tourney.hostVillageId].name} Chunin Exam Results`,
      truthSummary: summary,
      isSecret: false,
      immediateChannel: 'newspaper',
      sourceLabel: 'Chunin Exam Proctor Board',
    });
  }

  return { promotedNpcs, failedRivals, summary };
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
