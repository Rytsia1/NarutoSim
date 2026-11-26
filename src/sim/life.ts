import { CLAN_MAP, getClansForVillage } from '../data/clans';
import { RETIREMENT_EVENTS } from '../data/events-epilogue';
import {
  DANGEROUS_MISSIONS,
  FLAVOR_LINES,
  GROWTH_EVENTS,
  LIFE_EVENTS,
  REFLECTION_PROMPTS,
  type LifeEventOptionDef,
  type SimpleEffect,
} from '../data/events-life';
import { CRISIS_WHISPERS, TEAM_EVENTS } from '../data/events-team';
import { rewriteOrphanText } from '../data/i18n';
import { NINDO_MAP, NINDOS } from '../data/nindo';
import { ORIGINS, ORIGIN_MAP } from '../data/origins';
import { SUMMON_CLANS, SUMMON_CLAN_MAP } from '../data/summons';
import {
  BLOODLINE_MAP,
  BLOODLINE_STAGE_LABELS,
  DISCIPLINE_MAP,
  DISCIPLINE_TIER_NAMES,
} from '../data/powers';
import { kageTitle, VILLAGES, VILLAGE_MAP } from '../data/villages';
import { buildLifeRecord, buildPosthumousEpilogue, buildRetirementEventDecision } from './epilogue';
import {
  buildFailedGeninDecision,
  ensurePlayerLegacy,
  pickImperfectLifeDecision,
  pickNpcPleaDecision,
} from './life/imperfect-life';
import { computeAffinityWeights } from './partner';
import {
  generateCharacter,
  generateUniquePersonName,
  getPerson,
  getPersonTraits,
  isPersonAlive,
  killPerson,
  personName,
} from './people';
import {
  applyEternalMangekyo,
  awakenMangekyoSharingan,
  awardYearlyDisciplineXp,
  clamp,
  computeCombatProjection,
  ensureAcademyElementDiscipline,
  hasActiveTeacher,
  pickStartingDiscipline,
  rollBirthBloodline,
  tryBloodlineEvent,
  tryDisciplineEvent,
} from './powers';
import {
  advanceChuninTournamentStage,
  buildAcademyChoiceDecision,
  buildChuninExamStage,
  buildGraduationExamDecision,
  buildJoninEvaluationDecision,
  canTakeChuninExam,
  canTakeGraduationExam,
  canTakeJoninEvaluation,
  finalizeChuninTournament,
  initChuninTournament,
  promoteRank,
} from './ranks';
import { SeededRng } from './rng';
import {
  adjustMemberTrust,
  buildBellTestDecision,
  disbandGeninTeam,
  formGeninTeam,
  tickTeamYear,
} from './team';
import type {
  ChakraElement,
  CheckResultChip,
  ChuninExamStage,
  FamilyMember,
  FocusId,
  GameState,
  LeaningKey,
  NindoId,
  PendingDecision,
  ScenarioConfig,
  StatDeltaChip,
  StatKey,
  SummonClanId,
} from './types';
import {
  BIJUU_LIST,
  buildWarPreludeDecision,
  GENIN_DRAFT_CHANCE,
  MAX_CRISIS_CLUES,
  rollSeededCrisis,
  tickWorldTension,
} from './world';
import { handleWarDecision, initWarState, queueWarStart } from './war';
import { applyCustomBuild } from './custom';
import {
  initAcademyState,
  pickAcademyEventDecision,
  tickAcademyYear,
} from './academy';
import {
  bumpClanTraumaCatalyst,
  initClanHeritage,
  pickClanPoliticsDecision,
} from './clan-heritage';
import {
  clampStats,
  diffStats,
  formatEraYear,
  pushLog,
  recordMemory,
  snapshotStats,
} from './history/chronicle';
import {
  defaultDecisionRouter,
  defaultDomainBus,
} from './kernel';
import { ensureKernelBootstrapped } from './kernel/bootstrap';
import {
  buildProceduralMissionStageDecision,
  generateMissionContract,
  tickMissionConsequences,
} from './missions';
import { setBidirectionalRelation, setPlayerRelation } from './npc-sim';
import { canReceive } from './status-gates';
import { pickPoliticsDecision } from './politics';
import {
  applyPlayerActionToWorldSim,
  getVillageInstitutionalModifiers,
  initWorldSim,
  pickEmergentWorldDecision,
  tickAutonomousWorldYear,
} from './world-sim';

export { clampStats, diffStats, pushLog, recordMemory, snapshotStats };

const LEANING_LINES: Record<LeaningKey, [string, string]> = {
  vengeance: [
    'Old grudges have begun hardening into a quiet oath behind your eyes.',
    'The Curse of Hatred burns unmistakably in every decision you make.',
  ],
  will_of_fire: [
    'Comrades and villagers alike start looking to your steady shoulders in rough seasons.',
    'The Will of Fire shapes your entire path, unshaken by blood or loss.',
  ],
  ruthless: [
    'Sentiment has started peeling away; efficiency now speaks louder than mercy.',
    'You have embraced the coldest creed of the shinobi world without flinching.',
  ],
  forbidden: [
    'Unorthodox seals and banned theories draw your curiosity late into the night.',
    'You walk openly along the edge of Kinjutsu that elders fear to name.',
  ],
  ambition: [
    'Ordinary survival no longer satisfies you; you measure yourself against legends.',
    'Sovereign ambition drives every move you make across the shinobi board.',
  ],
};

export function buildNindoChoiceDecision(state: GameState): PendingDecision {
  const leader = kageTitle(state);
  return {
    id: `nindo_choice_${state.age}`,
    kind: 'nindo_choice',
    eventId: 'nindo_choice',
    title: 'Declare Your Nindo (Your Ninja Way)',
    body: `With your forehead protector tied and Team ${state.team?.number ?? ''} standing beside you on the rooftop, Sensei asks every Genin to name the creed they will carry through fire and war.`,
    manual: true,
    options: NINDOS.map((n) => ({
      id: n.id,
      label: n.title.replace(/\{kage\}/g, leader),
      sublabel: `${n.vow.replace(/\{kage\}/g, leader)} (${n.desc})`,
      statHints: [...n.preferredHints],
      autoEligible: true,
    })),
  };
}

export type KageOfferReason = 'council' | 'war_hero' | 'legend';

export function getKageOfferReason(state: GameState): KageOfferReason | null {
  if (state.rank !== 'jonin') return null;
  if (state.villageId === 'waves' || state.villageId === 'uzushio') return null;
  if (state.specialStatus === 'kage' || state.specialStatus === 'missing_nin') return null;
  if (state.flags.declined_kage) return null;

  const endorsed = Boolean(state.flags.kage_endorsed);
  const reqBonds = (state.nindo === 'become_kage' ? 50 : 55) - (endorsed ? 10 : 0);
  const reqSMissions = Math.max(0, (state.nindo === 'become_kage' ? 1 : 2) - (endorsed ? 1 : 0));

  if (state.age >= 26 && state.stats.bonds >= reqBonds && state.missions.s >= reqSMissions) {
    return 'council';
  }
  if (state.age >= 24 && state.world.warsSurvived >= 2 && state.stats.will >= 65 && state.stats.bonds >= 45) {
    return 'war_hero';
  }
  if (state.age >= 25 && computeCombatProjection(state).threatTier === 'S' && state.stats.bonds >= 45) {
    return 'legend';
  }
  return null;
}

export function canTriggerKageSuccession(state: GameState): boolean {
  return getKageOfferReason(state) !== null;
}

export function buildKageSuccessionDecision(
  state: GameState,
  stage: 1 | 2 = 1,
  offerReason?: KageOfferReason,
): PendingDecision {
  const title = kageTitle(state);
  const vDef = VILLAGE_MAP[state.villageId];
  const vName = vDef.name;
  const reason = offerReason ?? getKageOfferReason(state) ?? 'council';

  if (stage === 2) {
    return {
      id: `kage_inauguration_${state.age}`,
      kind: 'kage_succession',
      eventId: 'kage_inauguration',
      title: `Inauguration of the ${title}: Your First Decree`,
      body: `Stepping onto the sunlit balcony above ${vName}, your ${vDef.cloakText} catches the breeze while thousands of villagers and ${state.villageId === 'iron' ? 'samurai' : 'shinobi'} cheer below. The council awaits your very first decree.`,
      manual: true,
      meta: { kageStage: 2, offerReason: reason },
      options: [
        {
          id: 'decree_peace',
          label: 'Dispatch peace envoys to every Great Nation (-18 World Tension, +6 Bonds)',
          sublabel: `Opens an era of border detente guided by ${vDef.creed}.`,
          statHints: ['Bonds', 'Will'],
          autoEligible: true,
        },
        {
          id: 'decree_academy',
          label: 'Reform the Shinobi Academy & shield young Genin (+8 Bonds, +5 Intel)',
          sublabel: 'Deepens trust across surviving comrades and strengthens the next generation.',
          statHints: ['Bonds', 'Intel'],
          autoEligible: true,
        },
        {
          id: 'decree_fortress',
          label: 'Fortify the borders and expand the elite Jonin corps (+6 Chakra, +6 Will, +15 Ryo)',
          sublabel: 'Signals unmistakable military strength across the frontier.',
          statHints: ['Chakra', 'Will'],
          autoEligible: true,
        },
        {
          id: 'decree_shadow',
          label: 'Empower ANBU & preemptive frontier intelligence (+8 Intel, +2 Crisis Clues)',
          sublabel: 'Uncovers hidden continental threats before they strike.',
          statHints: ['Intel'],
          autoEligible: true,
        },
      ],
    };
  }

  const livingSquadComrade = state.team?.members.find((m) => {
    const p = getPerson(state, m.personId);
    return Boolean(p && p.identity.alive && p.identity.specialStatus !== 'missing_nin');
  });
  const comradePersonId =
    state.permanentPartner && isPersonAlive(state, state.permanentPartner.personId)
      ? state.permanentPartner.personId
      : livingSquadComrade?.personId ?? '';
  const comradeName = comradePersonId ? personName(state, comradePersonId) : 'a trusted senior Jonin';

  const bodyByReason: Record<KageOfferReason, string> = {
    council: `After years of Jonin service, ${state.missions.s} S-Rank operations, and the deep trust of your peers (Bonds ${state.stats.bonds}), the Daimyo and elder council summon you to the tower and formally offer you the ${title} hat of ${vName}.`,
    war_hero: `Following ${state.world.warsSurvived} brutal Great Shinobi Wars, the previous ${title} steps aside. Standing before an emergency summit of clan heads and the Daimyo, the elders unanimously offer you the ${title} mantle to steady ${vName}.`,
    legend: `Your S-Rank battlefield renown has outgrown every dossier in the Five Great Nations. Two sealed envoys from the Daimyo track you down and lay the ${title} hat upon the table, asking you to take command of ${vName}.`,
  };

  return {
    id: `kage_succession_${state.age}`,
    kind: 'kage_succession',
    eventId: 'kage_succession',
    title: `Summons from the Daimyo: Offered the ${title} Hat`,
    body: bodyByReason[reason],
    manual: true,
    meta: { kageStage: 1, offerReason: reason, comradeName, comradePersonId },
    options: [
      {
        id: 'accept_kage',
        label: `Accept the mantle and ascend as ${title} of ${vName}`,
        sublabel: 'Proceed to your inauguration ceremony and issue your first village decree.',
        statHints: ['Bonds', 'Will'],
        autoEligible: true,
      },
      {
        id: 'negotiate_authority',
        label: 'Demand full command over border peace & military policy before accepting',
        sublabel: 'Tests Intel & Will against the Elders; success adds +6 Will, +15 Ryo & -8 World Tension.',
        statHints: ['Intel', 'Will'],
        autoEligible: state.stats.intel >= 60,
      },
      {
        id: 'recommend_comrade',
        label: `Turn down the hat and endorse ${comradeName} for the seat instead`,
        sublabel: 'Stay free on the field (+10 Bonds, +6 Will, -6 World Tension, +8 Squad Trust).',
        statHints: ['Bonds'],
        autoEligible: false,
      },
      {
        id: 'decline_kage',
        label: 'Decline the hat quietly and keep guarding the village from the frontlines (+6 Will, +4 Bonds)',
        statHints: ['Will'],
        autoEligible: false,
      },
    ],
  };
}

export function addLeaning(state: GameState, key: LeaningKey, amount: number): void {
  if (amount === 0) return;
  state.leanings[key] = Math.max(0, state.leanings[key] + amount);
  const val = state.leanings[key];
  if (val >= 4 && state.leaningAnnounced[key] < 4) {
    state.leaningAnnounced[key] = 4;
    pushLog(state, 'milestone', LEANING_LINES[key][0]);
  } else if (val >= 8 && state.leaningAnnounced[key] < 8) {
    state.leaningAnnounced[key] = 8;
    pushLog(state, 'milestone', LEANING_LINES[key][1]);
  }
}

export function leaningEventWeight(val: number): number {
  if (val >= 6) return 2.4;
  if (val >= 3) return 1.9;
  if (val >= 1) return 1.4;
  return 1;
}

export function baseMortality(age: number): number {
  if (age < 1) return 0.003;
  if (age < 5) return 0.001;
  if (age < 15) return 0.0003;
  return 0.00035 * Math.exp(0.088 * (age - 25));
}

export function yearlyMortalityChance(state: GameState): number {
  const base = baseMortality(state.age);
  const healthFactor = Math.exp((50 - state.stats.health) / 16);
  const trainingHazard = state.focus === 'training' && state.age > 12 ? 0.001 : 0;
  const hospitalMult = getVillageInstitutionalModifiers(state).hospitalMortalityMult;
  return Math.min(0.65, (base * healthFactor + trainingHazard) * hospitalMult);
}

function causeOfNaturalDeath(state: GameState, rng: SeededRng): string {
  if (state.age < 6) return 'a harsh childhood fever';
  if (state.legacyScar && rng.chance(0.18)) return 'complications from old war scars';
  if (state.bodyStrain >= 25 && rng.chance(0.25)) return 'chakra pathway exhaustion';
  if (state.age < 35) return state.rank === 'civilian' ? 'a sudden severe fever' : 'a sudden fatal accident during drills';
  if (state.age < 60) return 'an aggressive illness';
  return 'old age';
}

export function killCharacter(state: GameState, cause: string): void {
  if (state.phase === 'posthumous' || state.phase === 'ended') return;
  state.causeOfDeath = cause;
  state.pending = null;
  state.phase = 'posthumous';
  state.posthumousBeats = buildPosthumousEpilogue(state);
  state.posthumousIndex = 0;
  pushLog(
    state,
    'danger',
    `At age ${state.age} (${state.birthYear + state.age}), ${state.name} died from ${cause}.`,
    { title: 'End of the Road' },
  );
}

function generateNameForVillage(villageId: GameState['villageId'], sex: 'M' | 'F', rng: SeededRng): string {
  return generateUniquePersonName(villageId, null, sex, new Set(), rng);
}

export function createNewLife(seed: number, scenario?: ScenarioConfig): GameState {
  const rng = new SeededRng(seed);
  const customCfg = scenario?.customBuild;

  const origin = customCfg
    ? ORIGIN_MAP[customCfg.originId]
    : rng.weighted(ORIGINS.map((o) => ({ item: o, weight: o.weight })));
  const village = customCfg
    ? VILLAGE_MAP[customCfg.villageId]
    : scenario?.preferredVillage
      ? VILLAGE_MAP[scenario.preferredVillage]
      : rng.pick(VILLAGES);
  const villageClans = getClansForVillage(village.id);
  let clanId: string | null = null;
  if (customCfg?.clanId && CLAN_MAP[customCfg.clanId]?.villageId === village.id) {
    clanId = customCfg.clanId;
  } else if (
    (origin.id === 'clan_heir' || origin.id === 'clan_branch' || origin.id === 'fallen_clan') &&
    villageClans.length > 0
  ) {
    clanId = rng.pick(villageClans).id;
  }
  const chosenClan = clanId ? CLAN_MAP[clanId] : null;
  const sex: 'M' | 'F' = customCfg?.sex ?? scenario?.preferredSex ?? (rng.chance(0.5) ? 'M' : 'F');
  const customTrim = (customCfg?.name ?? scenario?.customName)?.trim();
  const generatedName = chosenClan
    ? `${rng.pick(sex === 'M' ? village.maleNames : village.femaleNames)} ${chosenClan.surname}`
    : generateNameForVillage(village.id, sex, rng);
  const name = customTrim && customTrim.length > 0 ? customTrim : generatedName;

  const [minCap, maxCap] = origin.capacityRange;
  const capacity = (customCfg?.capacity ?? rng.int(minCap, maxCap)) as 1 | 2 | 3 | 4 | 5;
  const elements: ChakraElement[] = ['fire', 'wind', 'lightning', 'earth', 'water'];
  let element: ChakraElement =
    customCfg?.element ??
    (chosenClan?.preferredElement && rng.chance(0.65)
      ? chosenClan.preferredElement
      : rng.chance(0.55)
        ? village.dominantElement
        : rng.pick(elements));

  // D10: Era years counted after the Third Shinobi War
  const birthYear = rng.int(1, 36);
  const [minRyo, maxRyo] = origin.ryoRange;

  const family: FamilyMember[] = [];

  const bloodline = rollBirthBloodline(seed, origin.id, clanId);
  // C8: Ensure elemental Kekkei Genkai matches one of its constituent chakra natures
  if (!customCfg?.element && bloodline) {
    if (bloodline.id === 'hyoton' && element !== 'water' && element !== 'wind') {
      element = rng.chance(0.5) ? 'water' : 'wind';
    } else if (bloodline.id === 'yoton' && element !== 'fire' && element !== 'earth') {
      element = rng.chance(0.5) ? 'fire' : 'earth';
    } else if (bloodline.id === 'jiton' && element !== 'wind' && element !== 'earth') {
      element = rng.chance(0.5) ? 'wind' : 'earth';
    } else if (bloodline.id === 'mokuton' && element !== 'earth' && element !== 'water') {
      element = rng.chance(0.5) ? 'earth' : 'water';
    } else if (bloodline.id === 'bakuton' && element !== 'earth' && element !== 'lightning') {
      element = rng.chance(0.5) ? 'earth' : 'lightning';
    }
  }
  const startDisc = pickStartingDiscipline(seed, origin.id, element, clanId);
  const seededCrisis = rollSeededCrisis(rng, scenario);

  const leanings: Record<LeaningKey, number> = {
    vengeance: 0,
    will_of_fire: 0,
    ruthless: 0,
    forbidden: 0,
    ambition: 0,
  };
  if (origin.startLeaning) {
    leanings[origin.startLeaning.key] += origin.startLeaning.amount;
  }

  const state: GameState = {
    version: 1,
    saveVersion: 3,
    phase: 'life',
    rng: rng.snapshot(),
    birthYear,
    age: 0,
    clock: 0,
    secondsPerYear: 16,
    speed: 1,
    paused: false,
    autoPlay: false,

    name,
    sex,
    originId: origin.id,
    villageId: village.id,
    clanId,
    capacity,
    element,

    rank: 'civilian',
    peakRank: 'civilian',
    specialStatus: 'none',
    academyFailedCount: 0,
    geninSinceAge: null,
    chuninAttempts: 0,
    joninEvalFailedAge: null,

    focus: 'balance',
    stats: {
      chakra: capacity * 7 + rng.int(0, 8),
      intel: rng.int(1, 5),
      will: rng.int(16, 34),
      bonds: origin.isOrphan ? rng.int(15, 28) : rng.int(40, 58),
      health: rng.int(72, 92),
      ryo: rng.int(minRyo, maxRyo),
    },
    leanings,
    leaningAnnounced: {
      vengeance: 0,
      will_of_fire: 0,
      ruthless: 0,
      forbidden: 0,
      ambition: 0,
    },

    disciplines: startDisc ? [startDisc] : [],
    jutsuMastery: {},
    discoveredJutsu: [],
    permanentDisability: false,
    bloodline,
    hasClanLegacy: false,
    legacyScar: false,
    bodyStrain: 0,
    keepFit: false,
    flags: {},

    family,
    team: null,
    rivalId: null,
    memories: [],
    missions: { d: 0, c: 0, b: 0, a: 0, s: 0 },
    world: {
      eraNumber: 4,
      tension: rng.int(5, 16),
      omenActive: false,
      lastWarAge: null,
      warsSurvived: 0,
      truePeace: false,
      seededCrisis,
      bijuuName: BIJUU_LIST[Math.abs(seed) % BIJUU_LIST.length],
      crisisStage: 0,
      crisisClues: 0,
    },
    war: null,
    warHistory: [],

    usedEvents: [],
    usedGrowth: [],
    usedFlavor: {},
    usedRetirement: [],
    reflections: [],
    lastLineAge: -1,

    causeOfDeath: null,
    lastWords: '',
    retirementStep: 0,
    posthumousBeats: [],
    posthumousIndex: 0,

    pending: null,
    logs: [],
    record: null,
  };

  if (customCfg) {
    applyCustomBuild(state, customCfg);
  }

  // Initialize 4-Layer Clan Heritage, Human Legacy & the 3-Layer Autonomous World Simulation
  state.clanHeritage = initClanHeritage(state, rng);
  state.missionConsequences = [];
  ensurePlayerLegacy(state);
  state.worldSim = initWorldSim(state, rng);

  // Register birth family members as canonical WorldNpcs in `state.worldSim.npcs`
  const finalOrigin = ORIGIN_MAP[state.originId];
  const finalVillage = VILLAGE_MAP[state.villageId];
  if (!finalOrigin.isOrphan) {
    const familyUsedNames = new Set<string>([state.name]);
    for (const n of state.worldSim.npcs) familyUsedNames.add(n.identity.name);
    const surname = state.name.split(' ').slice(1).join(' ') || rng.pick(finalVillage.surnames);
    const parentRank = finalOrigin.isShinobiHouse ? 'chunin' : 'civilian';
    const civilianParentOccs = ['merchant', 'blacksmith', 'farmer', 'artisan', 'medic', 'teacher'] as const;
    const combatOcc = state.villageId === 'iron' ? 'samurai' : 'shinobi';
    const fatherOcc = finalOrigin.isShinobiHouse ? combatOcc : rng.pick(civilianParentOccs);
    const motherOcc = finalOrigin.isShinobiHouse ? combatOcc : rng.pick(civilianParentOccs);
    const fatherNpc = generateCharacter(
      state,
      {
        sex: 'M',
        age: rng.int(24, 39),
        villageId: state.villageId,
        clanId: state.clanId ?? null,
        occupation: fatherOcc,
        rank: parentRank,
        roleTitle: finalOrigin.isShinobiHouse ? 'Household Shinobi' : undefined,
        surnameOverride: surname,
        lodTier: 'L1',
        observed: true,
        usedNames: familyUsedNames,
      },
      rng,
    );
    setPlayerRelation(fatherNpc, state.name, 'family', 45, 78, 0);
    state.family.push({ personId: fatherNpc.identity.id, relation: 'father' });

    const motherNpc = generateCharacter(
      state,
      {
        sex: 'F',
        age: rng.int(22, 36),
        villageId: state.villageId,
        clanId: state.clanId ?? null,
        occupation: motherOcc,
        rank: parentRank,
        roleTitle: finalOrigin.isShinobiHouse ? 'Household Shinobi' : undefined,
        surnameOverride: surname,
        lodTier: 'L1',
        observed: true,
        usedNames: familyUsedNames,
      },
      rng,
    );
    setPlayerRelation(motherNpc, state.name, 'family', 48, 80, 0);
    setBidirectionalRelation(fatherNpc, motherNpc, 'spouse', 'spouse', 55, 82, 0);
    state.family.push({ personId: motherNpc.identity.id, relation: 'mother' });

    // C9: Firstborn heir origins never start with an older sibling
    if (!finalOrigin.isHeir && (finalOrigin.alwaysSibling || rng.chance(0.5))) {
      const sibSex: 'M' | 'F' = rng.chance(0.5) ? 'M' : 'F';
      const sibNpc = generateCharacter(
        state,
        {
          sex: sibSex,
          age: finalOrigin.alwaysSibling ? rng.int(2, 5) : rng.int(0, 4),
          villageId: state.villageId,
          clanId: state.clanId ?? null,
          occupation: finalOrigin.isShinobiHouse ? combatOcc : rng.pick(civilianParentOccs),
          rank: 'civilian',
          roleTitle: finalOrigin.alwaysSibling ? 'Clan Sibling' : 'Sibling',
          surnameOverride: surname,
          lodTier: 'L1',
          observed: true,
          usedNames: familyUsedNames,
        },
        rng,
      );
      setPlayerRelation(sibNpc, state.name, 'family', finalOrigin.alwaysSibling ? 20 : 40, 68, 0);
      state.family.push({
        personId: sibNpc.identity.id,
        relation: 'sibling',
        isHeirRival: finalOrigin.alwaysSibling,
      });
    }
  }

  // Save RNG snapshot AFTER all birth & world-seeding rolls so Year 1 never replays birth RNG draws
  state.rng = rng.snapshot();

  clampStats(state);
  const resolvedVillage = VILLAGE_MAP[state.villageId];
  const resolvedOrigin = ORIGIN_MAP[state.originId];
  const resolvedClan = state.clanId ? CLAN_MAP[state.clanId] : null;
  pushLog(
    state,
    'milestone',
    `Born in ${resolvedVillage.name} (${resolvedVillage.region}) as ${state.name}${resolvedClan ? ` of the ${resolvedClan.name}` : ''}. ${resolvedOrigin.name}: ${resolvedOrigin.shortDesc} ${resolvedVillage.culture}${customCfg ? ' (Custom Build)' : ''}`,
    {
      title: `${formatEraYear(birthYear, false)}: ${
        state.villageId === 'waves'
          ? 'A New Life in the Harbor'
          : state.villageId === 'iron'
            ? 'A New Samurai Life'
            : 'A New Shinobi Life'
      }`,
    },
  );
  const actualStartDisc = state.disciplines[0];
  if (actualStartDisc) {
    pushLog(
      state,
      'normal',
      `Your household begins instilling early fundamentals in ${DISCIPLINE_MAP[actualStartDisc.id]?.name ?? actualStartDisc.id}.`,
    );
  }

  return state;
}

function applySimpleEffect(
  state: GameState,
  rng: SeededRng,
  effect: SimpleEffect,
): { killed: boolean; extraChips: StatDeltaChip[] } {
  const extraChips: StatDeltaChip[] = [];

  if (effect.stats) {
    for (const [key, delta] of Object.entries(effect.stats) as [StatKey, number][]) {
      state.stats[key] += delta;
    }
  }
  if (effect.leanings) {
    const nindoLeaning = state.nindo ? NINDO_MAP[state.nindo]?.leaning : null;
    let nindoAligned = false;
    for (const [k, v] of Object.entries(effect.leanings) as [LeaningKey, number][]) {
      addLeaning(state, k, v);
      if (v > 0 && nindoLeaning && k === nindoLeaning) nindoAligned = true;
    }
    if (nindoAligned) {
      state.stats.will += 1;
    }
  }
  if (effect.tension) {
    state.world.tension = clamp(state.world.tension + effect.tension, 0, 100);
    extraChips.push({ stat: 'tension', label: 'World Tension', delta: effect.tension });
  }
  if (effect.clues) {
    state.world.crisisClues = clamp(state.world.crisisClues + effect.clues, 0, MAX_CRISIS_CLUES);
    extraChips.push({ stat: 'clues', label: 'Crisis Clues', delta: effect.clues });
  }
  if (effect.xpMain && state.disciplines.length > 0) {
    const main = state.disciplines.find((d) => d.isMain) ?? state.disciplines[0];
    main.xp += effect.xpMain;
  }
  if (effect.trustAllTeam && state.team) {
    let total = 0;
    for (const m of state.team.members) {
      if (isPersonAlive(state, m.personId)) total += adjustMemberTrust(state, m, effect.trustAllTeam);
    }
    if (total !== 0) {
      extraChips.push({ stat: 'trust', label: 'Squad Kizuna', delta: Math.round(total / Math.max(1, state.team.members.length)) });
    }
  }
  if (effect.setFlags) {
    for (const fl of effect.setFlags) {
      if (fl === 'joined_anbu' && state.specialStatus === 'none') {
        state.specialStatus = 'anbu';
      } else if (fl === 'keep_fit') {
        state.keepFit = true;
      } else if (fl === 'trigger_marry') {
        const romanticMate = state.team?.members.find((m) => {
          const p = getPerson(state, m.personId);
          return (
            m.role === 'teammate' &&
            m.relTrack === 'romance' &&
            Boolean(p && p.identity.alive && p.identity.specialStatus !== 'missing_nin')
          );
        });
        if (romanticMate) {
          const mateNpc = getPerson(state, romanticMate.personId);
          if (mateNpc) {
            setPlayerRelation(mateNpc, state.name, 'spouse', 35, 25, 0);
          }
          state.family.push({
            personId: romanticMate.personId,
            relation: 'spouse',
          });
        } else {
          const spouseSex: 'M' | 'F' = state.sex === 'M' ? 'F' : 'M';
          const spouseNpc = generateCharacter(
            state,
            {
              sex: spouseSex,
              age: Math.max(18, state.age + rng.int(-3, 3)),
              villageId: state.villageId,
              occupation:
                state.rank === 'civilian'
                  ? rng.pick(['merchant', 'artisan', 'medic', 'teacher'] as const)
                  : state.villageId === 'iron'
                    ? 'samurai'
                    : 'shinobi',
              rank: state.rank === 'civilian' ? 'civilian' : 'chunin',
              roleTitle: 'Spouse',
              lodTier: 'L1',
              observed: true,
            },
            rng,
          );
          setPlayerRelation(spouseNpc, state.name, 'spouse', 55, 82, 0);
          state.family.push({
            personId: spouseNpc.identity.id,
            relation: 'spouse',
          });
        }
      } else if (fl === 'trigger_child') {
        const childSex: 'M' | 'F' = rng.chance(0.5) ? 'M' : 'F';
        const spouseEntry = state.family.find((f) => f.relation === 'spouse');
        const spouseNpc = spouseEntry ? getPerson(state, spouseEntry.personId) : null;
        // C7: Inherit clan from player or clanned spouse
        const inheritedClanId = state.clanId ?? spouseNpc?.identity.clanId ?? null;
        // C13: Never use literal "Shinobi" as fallback surname
        const playerSurname = state.name.split(' ').slice(1).join(' ');
        const spouseSurname = spouseNpc ? spouseNpc.identity.name.split(' ').slice(1).join(' ') : '';
        const surname = playerSurname || spouseSurname || rng.pick(VILLAGE_MAP[state.villageId].surnames);
        const childNpc = generateCharacter(
          state,
          {
            sex: childSex,
            age: 0,
            villageId: state.villageId,
            clanId: inheritedClanId,
            occupation: state.rank === 'civilian' ? 'artisan' : state.villageId === 'iron' ? 'samurai' : 'shinobi',
            rank: 'civilian',
            roleTitle: 'Child',
            surnameOverride: surname,
            lodTier: 'L1',
            observed: true,
          },
          rng,
        );
        setPlayerRelation(childNpc, state.name, 'family', 60, 85, 0);
        state.family.push({
          personId: childNpc.identity.id,
          relation: 'child',
          capacity: clamp(rng.int(1, Math.min(5, state.capacity + 1)), 1, 5),
        });
      } else {
        state.flags[fl] = true;
      }
    }
  }

  clampStats(state);

  if (state.stats.health <= 0) {
    killCharacter(state, effect.deathCause ?? 'mortal wounds');
    return { killed: true, extraChips };
  }

  if (effect.deathChance && rng.chance(effect.deathChance)) {
    killCharacter(state, effect.deathCause ?? 'fatal combat injuries');
    return { killed: true, extraChips };
  }

  return { killed: false, extraChips };
}

function applyYearlyGrowth(state: GameState, rng: SeededRng): void {
  const age = state.age;
  if (age < 6) {
    state.stats.chakra += rng.int(0, 2);
    state.stats.intel += rng.int(1, 3);
    state.stats.will += rng.int(0, 2);
    state.stats.health += rng.int(0, 2);
    clampStats(state);
    return;
  }

  const g = rng.int(2, 5);
  const youth = age <= 25 ? 1.2 : age <= 45 ? 1.0 : age <= 65 ? 0.75 : 0.5;
  const selfMult = hasActiveTeacher(state) ? 1.0 : 0.75;
  const isShinobi = state.rank !== 'civilian';

  switch (state.focus) {
    case 'training':
      if (isShinobi) {
        state.stats.chakra += Math.round(g * youth * (0.65 + 0.14 * state.capacity) * selfMult);
        state.stats.health -= rng.int(0, 1);
        state.stats.bonds -= rng.int(0, 1);
      } else {
        state.stats.health += rng.int(1, 3);
      }
      break;
    case 'study':
      state.stats.intel += Math.round(g * youth);
      break;
    case 'social':
      state.stats.bonds += g;
      state.stats.will += rng.int(0, 1);
      break;
    case 'body':
      state.stats.health += rng.int(2, 4);
      break;
    case 'mind':
      state.stats.will += g;
      break;
    case 'work':
      if (age >= 12) {
        const rankPay = state.rank === 'jonin' ? 3 : state.rank === 'chunin' ? 2 : state.rank === 'genin' ? 1 : 0;
        state.stats.ryo += g + rankPay;
      }
      break;
    case 'balance':
    default:
      if (isShinobi) state.stats.chakra += rng.int(1, 2);
      state.stats.intel += rng.int(1, 2);
      state.stats.will += rng.int(1, 2);
      state.stats.bonds += rng.int(0, 2);
      state.stats.health += rng.int(0, 2);
      if (age >= 14 && rng.chance(0.5)) state.stats.ryo += rng.int(1, 2);
      break;
  }

  if (age < 18) {
    state.stats.intel += rng.int(0, 2);
  }

  // Village & Clan institutional perks
  const vPerk = VILLAGE_MAP[state.villageId]?.perk;
  if (vPerk) {
    if (vPerk.stat) {
      state.stats[vPerk.stat] += 1;
    }
    if (vPerk.disciplineId) {
      const disc = state.disciplines.find((d) => d.id === vPerk.disciplineId);
      if (disc) disc.xp += 2;
    }
  }
  const instMods = getVillageInstitutionalModifiers(state);
  if (instMods.clanBonus) {
    if (instMods.clanBonus.stat) {
      state.stats[instMods.clanBonus.stat] += 1;
    }
    if (instMods.clanBonus.disciplineId) {
      const cDisc = state.disciplines.find((d) => d.id === instMods.clanBonus!.disciplineId);
      if (cDisc) cDisc.xp += 1;
    }
  }
  if (instMods.academyXpBonus > 0 && state.disciplines.length > 0 && (state.rank === 'academy' || state.rank === 'genin')) {
    const main = state.disciplines.find((d) => d.isMain) ?? state.disciplines[0];
    main.xp += instMods.academyXpBonus;
  }

  // Upkeep & aging wear
  if (age >= 40) {
    state.stats.health -= state.keepFit ? rng.int(0, 1) : rng.int(0, 2);
  }
  if (age >= 55 && state.stats.chakra > 30) {
    state.stats.chakra -= rng.int(0, 2);
  }
  if (age >= 18 && state.focus !== 'work') {
    state.stats.ryo -= rng.int(0, 1);
  }
  if (state.legacyScar && rng.chance(0.12)) {
    state.stats.health -= rng.int(1, 2);
  }

  awardYearlyDisciplineXp(state);
  clampStats(state);
}

function tickFamilyYear(state: GameState, rng: SeededRng): { parentDied: boolean; clanLegacyPending: PendingDecision | null } {
  let parentDied = false;
  let clanLegacyPending: PendingDecision | null = null;
  const origin = ORIGIN_MAP[state.originId];

  for (const member of state.family) {
    const person = getPerson(state, member.personId);
    if (!person || !person.identity.alive) continue;
    const fAge = person.identity.age;
    const fName = person.identity.name;

    if (member.relation === 'father' || member.relation === 'mother') {
      const q = Math.min(0.5, baseMortality(fAge) * 1.15 + (origin.isShinobiHouse ? 0.004 : 0));
      if (rng.chance(q) || fAge >= 98) {
        killPerson(state, member.personId, fAge, fAge >= 65 ? 'old age' : 'illness or shinobi duty');
        parentDied = true;
        state.stats.bonds -= 5;
        state.stats.will -= 2;
        addLeaning(state, 'vengeance', 1);
        bumpClanTraumaCatalyst(state, 28);
        pushLog(
          state,
          'danger',
          `Your ${member.relation}, ${fName}, passed away at age ${fAge}.`,
        );

        if (
          origin.isShinobiHouse &&
          origin.isHeir &&
          !state.hasClanLegacy &&
          !state.flags.declined_legacy &&
          state.age >= 10
        ) {
          clanLegacyPending = {
            id: `clan_legacy_${state.age}`,
            kind: 'clan_legacy',
            eventId: 'clan_legacy',
            title: 'Inheritance of the Clan Hiden Scroll',
            body: `Before passing, ${fName} leaves behind the sealed Hiden technique of your house. Binding its chakra imprint grants formidable reserves, though your body will bear the strain.`,
            manual: true,
            options: [
              {
                id: 'accept_legacy',
                label: 'Inherit the Clan Hiden (+18 Chakra, -8 Health, +3 Will)',
                statHints: ['Chakra', 'Health'],
                autoEligible: true,
              },
              {
                id: 'refuse_legacy',
                label: 'Seal the scroll away and walk without the clan burden (+5 Will, -3 Bonds)',
                statHints: ['Will'],
                autoEligible: false,
              },
            ],
          };
        }
      }
    } else if (member.relation === 'spouse') {
      if (rng.chance(baseMortality(fAge)) || fAge >= 98) {
        killPerson(state, member.personId, fAge, fAge >= 65 ? 'old age' : 'illness');
        state.stats.bonds -= 10;
        state.stats.will -= 4;
        state.stats.health -= 3;
        pushLog(state, 'danger', `Your spouse, ${fName}, passed away at age ${fAge}.`);
      }
    } else if (member.relation === 'sibling' || member.relation === 'child') {
      // Siblings & children also experience natural old-age mortality in addition to autonomous NPC risks
      if (fAge >= 65 && (rng.chance(baseMortality(fAge)) || fAge >= 98)) {
        killPerson(state, member.personId, fAge, 'old age');
        state.stats.bonds -= 6;
        pushLog(state, 'danger', `Your ${member.relation}, ${fName}, passed away at age ${fAge}.`);
      }
    }
  }

  clampStats(state);
  return { parentDied, clanLegacyPending };
}

function logAnnualFlavor(state: GameState, rng: SeededRng): void {
  if (!rng.chance(0.75)) return;
  const shinobiTextRe = /training post|hand-seal|kunai|mission|drills|headband|flak jacket|patrol|chakra|jutsu|sparring|blade|pouch|memorial stone/i;
  const villageResidentRe = /village|academy|market|lantern|dango|noodle|bathhouse|tea house|main village gate|mission desk/i;
  const candidates = FLAVOR_LINES.filter((line) => {
    if (line.minAge !== undefined && state.age < line.minAge) return false;
    if (line.maxAge !== undefined && state.age > line.maxAge) return false;
    if (line.ranks && !line.ranks.includes(state.rank)) return false;
    if (line.statusTags && !canReceive(state, line.statusTags)) return false;
    if (state.age < 6 && (line.focus !== undefined || shinobiTextRe.test(line.text))) return false;
    if (state.rank === 'civilian' && shinobiTextRe.test(line.text)) return false;
    if (state.specialStatus === 'missing_nin' && villageResidentRe.test(line.text)) return false;
    const rec = state.usedFlavor[line.id];
    if (rec && (rec.count >= 3 || state.age - rec.lastAge < 6)) return false;
    return true;
  });
  if (candidates.length === 0) return;

  const chosen = rng.weighted(
    candidates.map((line) => {
      const rec = state.usedFlavor[line.id];
      let w = 1;
      if (line.focus === state.focus) w *= 1.6;
      if (!rec) w *= 2.5;
      return { item: line, weight: w };
    }),
  );

  const prev = state.usedFlavor[chosen.id];
  state.usedFlavor[chosen.id] = { count: (prev?.count ?? 0) + 1, lastAge: state.age };
  pushLog(state, 'normal', chosen.text);
}

function rollPoolDecision(state: GameState, rng: SeededRng): PendingDecision | null {
  const isOrphan = ORIGIN_MAP[state.originId].isOrphan;

  // 1. Active Genin Squad event (35% chance while team is active AND sensei + teammate are alive)
  if (state.team?.active && canReceive(state, ['active_shinobi', 'sensei_alive', 'teammate_alive']) && rng.chance(0.38)) {
    const teamCands = TEAM_EVENTS.filter((e) => !state.usedEvents.includes(e.id));
    if (teamCands.length > 0) {
      const chosen = rng.pick(teamCands);
      state.usedEvents.push(chosen.id);
      return {
        id: `${chosen.id}_${state.age}`,
        kind: 'team_event',
        eventId: chosen.id,
        title: `Team ${state.team.number}: ${chosen.title}`,
        body: chosen.body,
        manual: false,
        meta: { teamEventId: chosen.id },
        options: chosen.options.map((o) => ({
          id: o.id,
          label: o.label,
          sublabel: o.sublabel,
          statHints: o.statHints,
          autoEligible: o.autoEligible,
        })),
      };
    }
  }

  // 2. Shinobi Mission Board (Genin/Chunin/Jonin; never Kage or Missing-Nin!)
  if (
    canReceive(state, ['active_shinobi', 'not_kage']) &&
    rng.chance(state.focus === 'work' ? 0.44 : 0.28)
  ) {
    const boardOptions: PendingDecision['options'] = [
      {
        id: 'd_mission',
        label: 'D-Rank Assignment: Village Chores & Escort',
        sublabel: 'Safe pay (+4 Ryo, +2 Bonds). Guaranteed completion.',
        statHints: ['Bonds', 'Ryo'],
        autoEligible: state.rank === 'genin',
      },
      {
        id: 'c_mission',
        label: 'C-Rank Assignment: Bandit Pass Escort',
        sublabel: 'Moderate risk (+8 Ryo, +4 XP). Tests Health & grit.',
        statHints: ['Health', 'Ryo'],
        autoEligible: state.rank === 'genin' || state.rank === 'chunin',
      },
    ];
    if (state.rank === 'chunin' || state.rank === 'jonin') {
      boardOptions.push({
        id: 'b_mission',
        label: 'B-Rank Operation: Border Recon & Skirmish (2-Stage Tactical Checks)',
        sublabel: 'High pay (+14 Ryo, +6 XP). Approach + Combat clash checks.',
        statHints: ['Intel', 'Chakra'],
        autoEligible: state.rank === 'chunin',
      });
      boardOptions.push({
        id: 'a_mission',
        label: 'A-Rank Operation: Neutralize Rogue Cell (2-Stage Tactical Checks)',
        sublabel: 'Elite pay (+22 Ryo, +9 XP). Real lethal risk on failure.',
        statHints: ['Chakra', 'Will'],
        autoEligible: state.rank === 'chunin' || state.rank === 'jonin',
      });
    }
    if (state.rank === 'jonin') {
      boardOptions.push({
        id: 's_mission',
        label: 'S-Rank Operation: Intercept Bingo Book Target (2-Stage Elite Clash)',
        sublabel: 'Highest pay (+30 Ryo, +13 XP, counts toward Kage Succession). High lethality!',
        statHints: ['Chakra', 'Will', 'Intel'],
        autoEligible: state.stats.health >= 55,
      });
    }
    if (state.world.tension >= 30 && (state.rank === 'chunin' || state.rank === 'jonin')) {
      boardOptions.push({
        id: 'diplomatic_mission',
        label: 'Diplomatic Peacekeeping: Border Summit Escort (-8 to -14 World Tension)',
        sublabel: 'Escort neutral envoys to de-escalate border friction (+10 Ryo, +4 Bonds). Tests Intel & Bonds.',
        statHints: ['Bonds', 'Intel'],
        autoEligible: state.world.tension >= 55,
      });
    }
    boardOptions.push({
      id: 'pass_mission',
      label: 'Pass on the Mission Board and run village drills (+2 Ryo)',
      autoEligible: state.stats.health < 45,
    });

    return {
      id: `mission_board_${state.age}`,
      kind: 'mission_board',
      eventId: 'mission_board',
      title: `${VILLAGE_MAP[state.villageId].name} Mission Assignment Desk`,
      body: `A clerk pins fresh contracts behind the wooden counter for ${state.rank.toUpperCase()} operatives. Higher ranks demand multi-stage tactical execution and carry genuine risk of death.`,
      manual: false,
      options: boardOptions,
    };
  }

  // 3. Life events weighted by leanings (positive feedback loop evW)
  const lifeChance = state.age < 6 ? 0.25 : 0.55;
  if (rng.chance(lifeChance)) {
    const hasSpouse = state.family.some((f) => f.relation === 'spouse' && isPersonAlive(state, f.personId));
    const childCount = state.family.filter((f) => f.relation === 'child').length;

    const villageDutyIds = new Set([
      'le_rogue_informant',
      'le_border_skirmish_dilemma',
      'le_mentor_young_genin',
      'le_kage_ambition',
      'le_anbu_recruitment',
      'le_konoha_ichiraku',
      'le_konoha_hokage_rock',
      'le_suna_puppet_forge',
      'le_kiri_mist_docks',
      'le_kumo_cloud_peaks',
      'le_iwa_basalt_trial',
    ]);
    const shinobiOnlyIds = new Set([
      'le_ghost_outpost',
      'le_ichiraku_debt',
      'le_debt_collector_alley',
      'le_first_love',
    ]);
    const cands = LIFE_EVENTS.filter((ev) => {
      if (state.age < ev.minAge || state.age > ev.maxAge) return false;
      if (!ev.repeatable && state.usedEvents.includes(ev.id)) return false;
      if (ev.ranks && !ev.ranks.includes(state.rank)) return false;
      if (ev.statusTags && !canReceive(state, ev.statusTags)) return false;
      if (ev.villageOnly && !ev.villageOnly.includes(state.villageId)) return false;
      if (ev.excludeOrphan && isOrphan) return false;
      if (ev.onlyOrphan && !isOrphan) return false;
      if (state.specialStatus === 'missing_nin' && villageDutyIds.has(ev.id)) return false;
      if (state.specialStatus === 'kage' && ev.id === 'le_kage_ambition') return false;
      if (state.rank === 'civilian' && shinobiOnlyIds.has(ev.id)) return false;
      if (ev.id === 'le_marriage' && hasSpouse) return false;
      if (ev.id === 'le_have_child' && (!hasSpouse || childCount >= 3)) return false;
      if (ev.id === 'le_anbu_recruitment' && state.specialStatus !== 'none') return false;
      if (ev.id === 'le_hunter_nin_ambush' && state.specialStatus !== 'missing_nin') return false;
      if (ev.id === 'le_keep_fit_routine' && state.keepFit) return false;
      return true;
    });

    if (cands.length > 0) {
      const chosen = rng.weighted(
        cands.map((ev) => ({
          item: ev,
          weight: ev.weight * (ev.leaningBias ? leaningEventWeight(state.leanings[ev.leaningBias]) : 1),
        })),
      );
      if (!chosen.repeatable) state.usedEvents.push(chosen.id);
      const leaderTitle = kageTitle(state);
      const rawBody =
        chosen.id === 'le_have_child'
          ? state.sex === 'F'
            ? 'You place your spouse’s hand gently over yours and share quiet news: a child is on the way.'
            : 'Your spouse places your hand gently over hers and whispers that a child is on the way.'
          : chosen.body;
      return {
        id: `${chosen.id}_${state.age}`,
        kind: 'life_event',
        eventId: chosen.id,
        title: chosen.title.replace(/\{kage\}/g, leaderTitle),
        body: rewriteOrphanText(rawBody.replace(/\{kage\}/g, leaderTitle), isOrphan),
        manual: false,
        meta: { lifeEventId: chosen.id },
        options: chosen.options.map((o) => ({
          id: o.id,
          label: o.label.replace(/\{kage\}/g, leaderTitle),
          sublabel: o.sublabel?.replace(/\{kage\}/g, leaderTitle),
          statHints: o.statHints,
          autoEligible: o.autoEligible,
        })),
      };
    }
  }

  // 4. Childhood growth events (ages 4 to 15)
  if (state.age >= 4 && state.age <= 15 && rng.chance(0.75)) {
    const gCands = GROWTH_EVENTS.filter(
      (g) => state.age >= g.minAge && state.age <= g.maxAge && !state.usedGrowth.includes(g.id),
    );
    if (gCands.length > 0) {
      const chosen = rng.pick(gCands);
      state.usedGrowth.push(chosen.id);
      return {
        id: `${chosen.id}_${state.age}`,
        kind: 'growth_event',
        eventId: chosen.id,
        title: chosen.title,
        body: rewriteOrphanText(chosen.body, isOrphan),
        manual: false,
        meta: { growthEventId: chosen.id },
        options: chosen.options.map((o) => ({
          id: o.id,
          label: o.label,
          sublabel: o.sublabel,
          statHints: o.statHints,
          autoEligible: o.autoEligible,
        })),
      };
    }
  }

  return null;
}

export function advanceYear(state: GameState): void {
  if (state.phase === 'posthumous' || state.phase === 'ended' || state.pending) return;
  const rng = new SeededRng(state.rng.seed, state.rng.state);

  if (state.phase === 'retirement') {
    const jump = rng.int(2, 4);
    for (let i = 0; i < jump; i++) {
      state.age += 1;
      state.stats.health = clamp(state.stats.health - (state.keepFit ? rng.int(0, 1) : rng.int(1, 2)), 0, 100);
      const retTeamNotices = tickTeamYear(state, rng);
      for (const notice of retTeamNotices) {
        pushLog(state, 'bond', notice);
      }
      tickFamilyYear(state, rng);
      if (i === 0) {
        const retWorld = tickAutonomousWorldYear(state, rng);
        for (const d of retWorld.dispatches.slice(0, 1)) {
          pushLog(state, d.tone, d.text, { title: d.title });
        }
      }
      if (state.stats.health <= 0 || state.age >= 102 || rng.chance(yearlyMortalityChance(state))) {
        killCharacter(state, state.age >= 60 ? 'old age in peaceful retirement' : causeOfNaturalDeath(state, rng));
        state.rng = rng.snapshot();
        return;
      }
    }
    const retDecision = buildRetirementEventDecision(state, rng);
    if (retDecision) {
      state.pending = retDecision;
    } else {
      pushLog(
        state,
        'epilogue',
        state.specialStatus === 'missing_nin'
          ? `Quiet seasons roll by in exile beyond the Great Nations as you reach age ${state.age}.`
          : `Quiet seasons roll by in ${VILLAGE_MAP[state.villageId].name} as you reach age ${state.age}.`,
      );
    }
    state.rng = rng.snapshot();
    return;
  }

  // Standard Continuous Yearly Life Loop
  state.age += 1;
  applyYearlyGrowth(state, rng);
  const { parentDied, clanLegacyPending } = tickFamilyYear(state, rng);
  const teamNotices = tickTeamYear(state, rng);
  for (const notice of teamNotices) {
    pushLog(state, 'bond', notice);
    if (notice.includes('fell in action') || notice.includes('fell holding') || notice.includes('passed away')) {
      recordMemory(state, 'loss', notice);
    }
  }

  // Log annual flavor line
  logAnnualFlavor(state, rng);

  // 3-Layer Autonomous World Simulation tick (World -> Villages/Orgs -> Independent NPCs)
  const autoWorld = tickAutonomousWorldYear(state, rng);
  if (autoWorld.tensionDelta !== 0 && !state.world.truePeace) {
    state.world.tension = clamp(state.world.tension + autoWorld.tensionDelta, 5, 100);
  }
  for (const d of autoWorld.dispatches) {
    pushLog(state, d.tone, d.text, { title: d.title });
  }

  // Academy Yearly Simulator & Persistent Mission Fallout ticks
  if (state.rank === 'academy') {
    if (!state.academy) state.academy = initAcademyState(state, rng);
    tickAcademyYear(state, rng);
  }
  const falloutLogs = tickMissionConsequences(state, rng);
  for (const fLog of falloutLogs) {
    pushLog(state, 'danger', fLog, { title: 'Mission Consequence' });
  }

  // Check natural mortality before events
  if (state.stats.health <= 0 || state.age >= 104 || rng.chance(yearlyMortalityChance(state))) {
    killCharacter(state, causeOfNaturalDeath(state, rng));
    state.rng = rng.snapshot();
    return;
  }

  // Auto-enroll shinobi-house children into the Academy at age 6 (never in Waves/Uzushio; Iron uses Samurai Dojo)
  if (
    state.age === 6 &&
    ORIGIN_MAP[state.originId].isShinobiHouse &&
    state.rank === 'civilian' &&
    state.villageId !== 'waves' &&
    state.villageId !== 'uzushio'
  ) {
    promoteRank(state, 'academy');
    ensureAcademyElementDiscipline(state);
    state.academy = initAcademyState(state, rng);
    const isIron = state.villageId === 'iron';
    pushLog(
      state,
      'milestone',
      `At age 6, your household sends you through the gates of the ${VILLAGE_MAP[state.villageId].institutions.academyLabel} under Instructor ${state.academy.senseiName}.`,
      { title: isIron ? 'Entered the Samurai Dojo' : 'Entered the Shinobi Academy' },
    );
  }

  // World Tension & Crisis Foreshadowing tick
  const worldTick = tickWorldTension(state, rng);
  if (worldTick.detenteLogged && worldTick.detenteDelta) {
    pushLog(
      state,
      'bond',
      `Diplomatic envoys renew border trade accords across the Five Great Nations, easing frontier hostilities.`,
      {
        title: 'Diplomatic Detente',
        deltas: [{ stat: 'tension', label: 'World Tension', delta: worldTick.detenteDelta }],
      },
    );
  }
  if (worldTick.omenCleared) {
    pushLog(
      state,
      'normal',
      'Frontier garrisons stand down from red alert as border tensions cool below crisis threshold.',
      { title: 'War Omen Subsides' },
    );
  }
  if (worldTick.omenLogged) {
    pushLog(
      state,
      'war',
      'Border outposts double their watchtowers and supply wagons roll through the night. War between the hidden villages feels dangerously close.',
      { title: 'War Omen' },
    );
  }

  // Priority Event Window (at most 1 pending decision per year)
  let nextDecision: PendingDecision | null = null;

  // Priority 1: Age 6 Academy enrollment for civilian/orphan (D2/D3: never offered in civilian Waves or Uzushio ruins)
  if (
    !nextDecision &&
    state.age === 6 &&
    !ORIGIN_MAP[state.originId].isShinobiHouse &&
    !state.flags.declined_academy &&
    state.villageId !== 'waves' &&
    state.villageId !== 'uzushio'
  ) {
    nextDecision = buildAcademyChoiceDecision(state);
  }

  // Priority 2: Early Focus Pick (ages 6-8 so Civilian/Orphan receive it after Academy choice)
  if (!nextDecision && state.age >= 6 && state.age <= 8 && !state.flags.initial_focus_picked) {
    state.flags.initial_focus_picked = true;
    nextDecision = {
      id: `focus_initial_${state.age}`,
      kind: 'focus_initial',
      eventId: 'focus_initial',
      title: 'Choose Your Early Focus',
      body: 'You are old enough to shape how your days are spent. You can change your yearly focus at any time from the Status panel.',
      manual: false,
      options: [
        { id: 'training', label: 'Chakra & Jutsu Training', statHints: ['Chakra'], autoEligible: true },
        { id: 'study', label: 'Tactics & Scrolls', statHints: ['Intel'], autoEligible: true },
        { id: 'body', label: 'Taijutsu & Conditioning', statHints: ['Health'], autoEligible: true },
        { id: 'mind', label: 'Willpower & Mental Focus', statHints: ['Will'], autoEligible: true },
        { id: 'social', label: 'Village & Bonds', statHints: ['Bonds'], autoEligible: true },
        { id: 'balance', label: 'Balanced Growth', autoEligible: true },
      ],
    };
  }

  // Priority 3: Clan Legacy Inheritance
  if (!nextDecision && clanLegacyPending) {
    nextDecision = clanLegacyPending;
  }

  // Priority 4: Recurring Shinobi War / Endgame Crisis Eruption (skip draft if permanently disabled, medically retired, or age > 55)
  if (
    !nextDecision &&
    worldTick.triggerWar &&
    !state.permanentDisability &&
    !state.flags.medical_retirement &&
    state.age <= 55
  ) {
    if (worldTick.isCrisisWar) {
      state.world.crisisStage = 2;
    }
    const geninDeployed =
      state.rank === 'genin' && (worldTick.isCrisisWar || rng.chance(GENIN_DRAFT_CHANCE));
    nextDecision = buildWarPreludeDecision(state, worldTick.isCrisisWar, geninDeployed);
  }

  // Priority 5: Academy Graduation Exam
  if (!nextDecision && canTakeGraduationExam(state)) {
    nextDecision = buildGraduationExamDecision(state);
  }

  // Priority 6: Chunin Exam (12-16 participant tournament + 6 Stages!)
  if (!nextDecision && canTakeChuninExam(state) && rng.chance(state.chuninAttempts === 0 ? 0.8 : 0.65)) {
    state.chuninAttempts += 1;
    initChuninTournament(state, rng);
    nextDecision = buildChuninExamStage(state, 1);
  }

  // Priority 7: Jonin Evaluation
  if (!nextDecision && canTakeJoninEvaluation(state) && rng.chance(0.65)) {
    nextDecision = buildJoninEvaluationDecision(state);
  }

  // Priority 7.5: Kage Offer & Succession Arc (Council / War Hero / S-Rank Legend)
  if (!nextDecision) {
    const offerReason = getKageOfferReason(state);
    if (offerReason) {
      const offerChance =
        offerReason === 'council' || state.flags.kage_endorsed ? 0.55 : 0.35;
      if (rng.chance(offerChance)) {
        nextDecision = buildKageSuccessionDecision(state, 1, offerReason);
      }
    }
  }

  // Priority 8: Bloodline (Kekkei Genkai) Awakening / Refinement (skip for civilians who left the shinobi path)
  if (!nextDecision && state.rank !== 'civilian') {
    nextDecision = tryBloodlineEvent(state, parentDied);
  }

  // Priority 9: Discipline Advancement / New Discipline
  if (!nextDecision) {
    nextDecision = tryDisciplineEvent(state, rng);
  }

  // Priority 9.2: Multi-Year Academy Cohort Simulator Events (ages 7-11)
  if (!nextDecision && state.rank === 'academy' && state.age >= 7 && state.age <= 11) {
    nextDecision = pickAcademyEventDecision(state, rng);
  }

  // Priority 9.3: 4-Layer Clan Heritage & Secret Hiden Trials
  if (!nextDecision && state.clanHeritage) {
    nextDecision = pickClanPoliticsDecision(state, rng);
  }

  // Priority 9.5: Kuchiyose Summoning Contract (K3: Genin+, Age >= 12, once per life, Affinity exp(fit/8))
  if (
    !nextDecision &&
    !state.summonContract &&
    !state.flags.declined_kuchiyose &&
    state.age >= 12 &&
    (state.rank === 'genin' || state.rank === 'chunin' || state.rank === 'jonin')
  ) {
    const hasSummonDisc = state.disciplines.some((d) => d.id === 'summoning');
    if (rng.chance(hasSummonDisc ? 0.55 : 0.22)) {
      // C16: Weight summon contracts by village tradition & clan affinity
      const weighted = computeAffinityWeights(state, SUMMON_CLANS);
      const chosen = rng.weighted(
        weighted.map((w) => {
          let villageBoost = w.item.preferredVillages?.includes(state.villageId) ? 2.6 : 0.7;
          if (w.item.id === 'ape' && state.clanId === 'sarutobi') villageBoost = 4.0;
          return { item: w, weight: w.weight * villageBoost };
        }),
      );
      const clan = chosen.item;
      nextDecision = {
        id: `kuchiyose_${clan.id}_${state.age}`,
        kind: 'kuchiyose_contract',
        eventId: `kuchiyose_${clan.id}`,
        title: `Kuchiyose Blood Contract: ${clan.name}`,
        body: `${clan.contractFlavor} Drawn by your chakra resonance (Affinity Fit ${chosen.fit}), an emissary from ${clan.originPlace} offers you a permanent Summoning Blood Contract with the ${clan.name}. ${clan.shortDesc}`,
        manual: true,
        meta: { clanId: clan.id, fitScore: chosen.fit },
        options: [
          {
            id: 'sign_contract',
            label: `Sign the Blood Contract with the ${clan.name}`,
            sublabel: `Permanent Kuchiyose ally (${clan.originPlace}). Unlocks the Summon Companion Od Action in battle.`,
            statHints: ['Chakra', 'Bonds'],
            autoEligible: true,
          },
          {
            id: 'decline_contract',
            label: 'Decline the scroll and rely solely on your own jutsu (+3 Will)',
            sublabel: 'You will not be offered another summoning contract this life.',
            statHints: ['Will'],
            autoEligible: false,
          },
        ],
      };
    }
  }

  // Priority 10: Crisis Foreshadowing Whisper (Seeded Endgame Crisis)
  if (!nextDecision && worldTick.whisperDecision) {
    const wId = String(worldTick.whisperDecision.meta?.whisperId ?? '');
    if (wId && !state.usedEvents.includes(wId)) {
      state.usedEvents.push(wId);
    }
    nextDecision = worldTick.whisperDecision;
  }

  // Priority 10.1: Live L1 NPC Utility AI Plea (e.g. trusted friend asking for help with sick sibling)
  if (!nextDecision) {
    nextDecision = pickNpcPleaDecision(state);
  }

  // Priority 10.15: Imperfect Shinobi Life Turning Points (Scenarios A-E)
  if (!nextDecision) {
    nextDecision = pickImperfectLifeDecision(state, rng);
  }

  // Priority 10.2: Mature Adult Politics & Village Governance Dilemmas (Jonin / ANBU / Clan Heir / Kage)
  if (!nextDecision) {
    nextDecision = pickPoliticsDecision(state, rng);
  }

  // Priority 10.5: Emergent Autonomous World / NPC / Village Crisis Decision
  if (!nextDecision) {
    nextDecision = pickEmergentWorldDecision(state, rng);
  }

  // Priority 11: Milestone Reflections (ages 5, 15, 30, 50, 70)
  if (!nextDecision) {
    const prompt = REFLECTION_PROMPTS.find((r) => r.age === state.age);
    if (prompt && !state.reflections.some((r) => r.age === state.age)) {
      const promptText =
        state.rank === 'civilian' && state.age === 15
          ? 'What kind of life do you swear to build beyond the shinobi world?'
          : state.rank === 'civilian' && state.age === 30
            ? 'What have these turbulent decades taken from you, and what remains worth protecting?'
            : state.rank === 'civilian' && state.age === 50
              ? 'Looking back across wars and quiet years, what truth would you pass on to the next generation?'
              : prompt.prompt;
      nextDecision = {
        id: `reflect_${state.age}`,
        kind: 'reflection',
        eventId: `reflect_${state.age}`,
        title: `Reflection at Age ${state.age}`,
        body: promptText,
        manual: false,
        allowFreeText: true,
        freeTextPlaceholder: 'Write a brief personal note (optional)...',
        meta: { promptText },
        options: [
          { id: 'save_note', label: 'Record reflection in your chronicle', autoEligible: true },
        ],
      };
    }
  }

  // Priority 12: Team / Mission / Life / Growth event pools
  if (!nextDecision) {
    nextDecision = rollPoolDecision(state, rng);
  }

  defaultDomainBus.emit({
    type: 'world.year_advanced',
    year: state.birthYear + state.age,
    age: state.age,
  });
  defaultDomainBus.flush(state, rng);

  state.pending = nextDecision;
  state.rng = rng.snapshot();
}

export function resolvePendingDecision(
  state: GameState,
  optionId: string,
  freeText?: string,
): void {
  const decision = state.pending;
  if (!decision) return;
  const rng = new SeededRng(state.rng.seed, state.rng.state);
  ensureKernelBootstrapped(killCharacter);

  if (
    (decision.kind === 'war_day' ||
      decision.kind === 'war_night' ||
      decision.kind === 'war_target' ||
      decision.kind === 'war_battle_round' ||
      decision.kind === 'war_pressure' ||
      decision.kind === 'war_crossroads' ||
      decision.kind === 'war_partner_down' ||
      decision.kind === 'war_partner_scene' ||
      decision.kind === 'war_finale_wish' ||
      decision.kind === 'war_ally_offer' ||
      decision.kind === 'war_ally_final' ||
      decision.kind === 'war_crisis_raid' ||
      decision.kind === 'war_crisis_end' ||
      decision.kind === 'war_conviction' ||
      decision.kind === 'war_conviction_duel') &&
    state.war
  ) {
    handleWarDecision(state, optionId, rng);
    state.rng = rng.snapshot();
    return;
  }

  // Delegate domain-owned decisions cleanly through the Kernel DecisionRouter!
  if (defaultDecisionRouter.has(decision.kind)) {
    state.pending = null;
    defaultDecisionRouter.dispatch({
      state,
      decision,
      optionId,
      freeText,
      rng,
      bus: defaultDomainBus,
    });
    defaultDomainBus.flush(state, rng);
    state.rng = rng.snapshot();
    return;
  }

  const before = snapshotStats(state);
  state.pending = null;

  const checks: CheckResultChip[] = [];
  let extraChips: StatDeltaChip[] = [];

  switch (decision.kind) {
    case 'focus_initial': {
      state.focus = optionId as FocusId;
      pushLog(state, 'normal', `You set your early focus to ${optionId}.`);
      break;
    }

    case 'academy_choice': {
      if (optionId === 'enroll') {
        promoteRank(state, 'academy');
        ensureAcademyElementDiscipline(state);
        state.academy = initAcademyState(state, rng);
        state.stats.will += 2;
        clampStats(state);
        pushLog(
          state,
          'milestone',
          `You enroll in the ${VILLAGE_MAP[state.villageId].institutions.academyLabel} under Instructor ${state.academy.senseiName}, tying a practice headband around your wrist.`,
          { title: 'Entered the Shinobi Academy', deltas: diffStats(before, state.stats) },
        );
      } else {
        state.flags.declined_academy = true;
        state.stats.ryo += 4;
        state.stats.bonds += 3;
        clampStats(state);
        pushLog(
          state,
          'normal',
          'You choose to remain a village civilian, trading kunai drills for quiet streets and an honest trade.',
          { deltas: diffStats(before, state.stats) },
        );
      }
      break;
    }

    case 'graduation_exam': {
      if (optionId === 'wait_normal') {
        state.stats.bonds += 2;
        clampStats(state);
        pushLog(state, 'normal', 'You decline early graduation and remain with your academy classmates.', {
          deltas: diffStats(before, state.stats),
        });
        break;
      }
      const isEarly = state.age < 12;
      const acadMods = getVillageInstitutionalModifiers(state);
      const acBonus = state.academy
        ? Math.round((state.academy.bunshin + state.academy.henge + state.academy.kawarimi) / 18) +
          (state.academy.favoredBySensei ? 4 : 0)
        : 0;
      const passed =
        optionId === 'chakra_form'
          ? state.stats.chakra + state.stats.intel + acBonus + rng.int(0, 28) > (isEarly ? 82 : 46 + acadMods.academyGradOffset)
          : state.stats.health + state.stats.will + acBonus + rng.int(0, 28) > (isEarly ? 128 : 88 + acadMods.academyGradOffset);
      checks.push({ label: optionId === 'chakra_form' ? 'Clone & Chakra Exam' : 'Taijutsu & Target Exam', passed });

      if (passed) {
        promoteRank(state, 'genin');
        state.geninSinceAge = state.age;
        ensureAcademyElementDiscipline(state);
        state.stats.will += acadMods.bloodyMistActive ? 7 : 4;
        state.stats.bonds += acadMods.bloodyMistActive ? 1 : 3;
        clampStats(state);

        state.team = formGeninTeam(state, rng);
        const sensei = state.team.members[0];
        const mates = state.team.members.slice(1);
        state.rivalId = mates[0]?.personId ?? null;
        if (mates[0]) {
          mates[0].fateNote += ' Your sworn rival since Academy graduation.';
        }
        const isIron = state.villageId === 'iron';
        recordMemory(
          state,
          'graduation',
          isIron
            ? `Completed the Iron Peak Dojo trial and swore the samurai oath alongside ${mates[0] ? personName(state, mates[0].personId) : 'fellow swordsmen'}.`
            : `Tied on the ${VILLAGE_MAP[state.villageId].name} headband and joined Team ${state.team.number} with ${mates[0] ? personName(state, mates[0].personId) : 'squadmates'}.`,
        );
        pushLog(
          state,
          'milestone',
          isIron
            ? `You pass the Iron Peak Dojo Trial and take your oath as a Sworn Samurai! You are placed in Squad ${state.team.number} under Captain ${personName(state, sensei.personId)}, alongside your rival ${personName(state, mates[0].personId)} and ${personName(state, mates[1].personId)}.`
            : `You pass the Graduation Exam and receive your forehead protector as a Genin! You are assigned to Team ${state.team.number} under Jonin Sensei ${personName(state, sensei.personId)}, alongside your rival ${personName(state, mates[0].personId)} and ${personName(state, mates[1].personId)}.`,
          {
            title: isIron
              ? `Sworn Samurai (Squad ${state.team.number})`
              : `Promoted to Genin (Team ${state.team.number})`,
            deltas: diffStats(before, state.stats),
            checks,
          },
        );
        // D1: Land of Iron samurai skip the shinobi Bell Test and proceed directly to their Bushido / Nindo oath
        state.pending = isIron ? buildNindoChoiceDecision(state) : buildBellTestDecision(state);
      } else {
        const isEarlyExam = state.age < 12;
        if (!isEarlyExam) {
          state.academyFailedCount += 1;
        }
        state.stats.will -= 2;
        clampStats(state);
        if (!isEarlyExam && state.academyFailedCount >= 2) {
          state.rank = 'civilian';
          pushLog(
            state,
            'danger',
            'After failing the Graduation Exam twice, your academy registration is closed. You step into adulthood as a civilian.',
            { title: 'Left the Academy', deltas: diffStats(before, state.stats), checks },
          );
        } else {
          pushLog(
            state,
            'normal',
            isEarlyExam
              ? 'The proctors commend your ambition on the early exam, though your fundamentals need another year in the Academy.'
              : 'Your clone flickers and dissolves before the examiners. You stay in the Academy for one more year to sharpen your fundamentals.',
            { deltas: diffStats(before, state.stats), checks },
          );
          if (!isEarlyExam && state.academyFailedCount === 1) {
            const failedArc = buildFailedGeninDecision(state);
            if (failedArc) state.pending = failedArc;
          }
        }
      }
      break;
    }

    case 'bell_test': {
      const team = state.team!;
      const sensei = team.members[0];
      const senseiName = personName(state, sensei.personId);
      const mates = team.members.slice(1);
      team.bellTestPassed = false;

      if (optionId === 'team_plan') {
        team.bellTestPassed = true;
        state.stats.bonds += 4;
        state.stats.intel += 3;
        adjustMemberTrust(state, sensei, 10, true);
        mates.forEach((m) => adjustMemberTrust(state, m, 9, true));
        clampStats(state);
        pushLog(
          state,
          'bond',
          `Your squad’s coordinated trap forces ${senseiName} onto the defensive. "You passed," Sensei smiles. "${VILLAGE_MAP[state.villageId].senseiTestFlavor}"`,
          { title: `Team ${team.number} Passed the Induction Test`, deltas: diffStats(before, state.stats) },
        );
      } else if (optionId === 'share_lunch') {
        team.bellTestPassed = true;
        state.stats.will += 4;
        state.stats.bonds += 5;
        addLeaning(state, 'will_of_fire', 1);
        adjustMemberTrust(state, sensei, 12, true);
        mates.forEach((m) => adjustMemberTrust(state, m, 11, true));
        clampStats(state);
        pushLog(
          state,
          'bond',
          `Defying orders to share rations with a bound squadmate wins ${senseiName}’s rare approval: "${VILLAGE_MAP[state.villageId].senseiTestFlavor}"`,
          { title: `Team ${team.number} Passed the Induction Test`, deltas: diffStats(before, state.stats) },
        );
      } else {
        // E1: Solo rush can genuinely fail the Bell Test (sending the squad to remedial drills)
        const passed = state.stats.chakra + rng.int(0, 30) > 62;
        checks.push({ label: 'Solo Bell Snatch', passed });
        if (passed) {
          team.bellTestPassed = true;
          state.stats.chakra += 3;
          addLeaning(state, 'ambition', 1);
          adjustMemberTrust(state, sensei, 5);
          mates.forEach((m) => adjustMemberTrust(state, m, -3));
        } else {
          team.bellTestPassed = false;
          state.stats.health = Math.max(1, state.stats.health - 4);
          state.stats.bonds = Math.max(0, state.stats.bonds - 2);
          adjustMemberTrust(state, sensei, -4);
          mates.forEach((m) => adjustMemberTrust(state, m, -2));
        }
        clampStats(state);
        pushLog(
          state,
          passed ? 'normal' : 'danger',
          passed
            ? `You actually graze a bell with a fearless rush before ${senseiName} warns you: "${VILLAGE_MAP[state.villageId].senseiTestFlavor}" Still, Team ${team.number} is cleared for active missions.`
            : `${senseiName} pins you in a rope snare before noon. "You failed. ${VILLAGE_MAP[state.villageId].senseiTestFlavor}" Team ${team.number} is assigned remedial squad drills before earning field trust.`,
          {
            title: passed ? `Team ${team.number} Passed the Induction Test` : `Team ${team.number} Failed the Induction Test`,
            deltas: diffStats(before, state.stats),
            checks,
          },
        );
      }
      recordMemory(
        state,
        'bell_test',
        team.bellTestPassed
          ? `Passed ${senseiName}'s squad induction test with Team ${team.number}.`
          : `Failed ${senseiName}'s initial induction test with Team ${team.number} and underwent remedial squad drills.`,
      );
      if (!state.nindo) {
        state.pending = buildNindoChoiceDecision(state);
      }
      break;
    }

    case 'nindo_choice': {
      const def = NINDO_MAP[optionId as NindoId] ?? NINDOS[0];
      const leader = kageTitle(state);
      const titleText = def.title.replace(/\{kage\}/g, leader);
      const vowText = def.vow.replace(/\{kage\}/g, leader);
      state.nindo = def.id;
      state.stats.will += 3;
      addLeaning(state, def.leaning, 1);
      if (def.id === 'protect_bonds') {
        state.stats.bonds += 2;
      }
      clampStats(state);
      recordMemory(state, 'nindo', `Swore your Nindo: "${vowText}"`);
      pushLog(state, 'milestone', `Standing beneath the village sky, you declare your Nindo: "${vowText}"`, {
        title: `Nindo Declared: ${titleText}`,
        deltas: diffStats(before, state.stats),
      });
      break;
    }

    case 'kuchiyose_contract': {
      const clanId = String(decision.meta?.clanId ?? 'toad') as SummonClanId;
      const fitScore = Number(decision.meta?.fitScore ?? 60);
      const clan = SUMMON_CLAN_MAP[clanId] ?? SUMMON_CLANS[0];
      if (optionId === 'sign_contract') {
        state.summonContract = {
          clanId: clan.id,
          contractedAge: state.age,
          fitScore,
          summonUses: 0,
        };
        const existingSummon = state.disciplines.find((d) => d.id === 'summoning');
        if (existingSummon) {
          existingSummon.xp += 14;
        } else if (state.disciplines.length < 4) {
          state.disciplines.push({
            id: 'summoning',
            level: 1,
            xp: 10,
            lastLevelAge: state.age,
            quality: 1.0,
            isMain: false,
            declinedUntilAge: 0,
          });
        }
        state.stats.chakra += 3;
        state.stats.bonds += 3;
        clampStats(state);
        recordMemory(state, 'promotion', `Signed the Kuchiyose Blood Contract with the ${clan.name} of ${clan.originPlace}.`);
        pushLog(
          state,
          'milestone',
          `You press your thumbprint in blood across the scroll of ${clan.originPlace}. Smoke bursts around your boots as the ${clan.name} answers your call!`,
          { title: `Kuchiyose Contract: ${clan.name}`, deltas: diffStats(before, state.stats) },
        );
      } else {
        state.flags.declined_kuchiyose = true;
        state.stats.will += 3;
        clampStats(state);
        pushLog(
          state,
          'normal',
          `You respectfully roll the ${clan.originPlace} scroll shut and decline the contract, trusting solely in your own jutsu.`,
          { deltas: diffStats(before, state.stats) },
        );
      }
      break;
    }

    case 'kage_succession': {
      const title = kageTitle(state);
      const vName = VILLAGE_MAP[state.villageId].name;
      const kageStage = Number(decision.meta?.kageStage ?? 1);
      const offerReason = String(decision.meta?.offerReason ?? 'council') as KageOfferReason;
      const comradeName = String(decision.meta?.comradeName ?? 'a trusted comrade');

      if (kageStage === 2) {
        state.specialStatus = 'kage';
        state.stats.will += 6;
        state.stats.bonds += 6;
        let tensionDelta = 0;
        let decreeSummary = '';

        if (optionId === 'decree_peace') {
          const prevT = state.world.tension;
          state.world.tension = clamp(state.world.tension - 18, 5, 100);
          tensionDelta = state.world.tension - prevT;
          if (state.world.omenActive && state.world.tension < 65) {
            state.world.omenActive = false;
          }
          state.stats.bonds += 6;
          addLeaning(state, 'will_of_fire', 2);
          decreeSummary = `Your first decree dispatches peace envoys to every Great Nation, cooling border tensions immediately.`;
        } else if (optionId === 'decree_academy') {
          state.stats.bonds += 8;
          state.stats.intel += 5;
          addLeaning(state, 'will_of_fire', 1);
          if (state.team) {
            state.team.members.forEach((m) => isPersonAlive(state, m.personId) && adjustMemberTrust(state, m, 8));
          }
          decreeSummary = `Your first decree reforms the Shinobi Academy and raises safety standards for young Genin squads.`;
        } else if (optionId === 'decree_fortress') {
          state.stats.chakra += 6;
          state.stats.will += 6;
          state.stats.ryo += 15;
          addLeaning(state, 'ambition', 1);
          decreeSummary = `Your first decree fortifies the outer watchtowers and expands the elite Jonin response corps.`;
        } else {
          state.stats.intel += 8;
          state.world.crisisClues = clamp(state.world.crisisClues + 2, 0, MAX_CRISIS_CLUES);
          addLeaning(state, 'ruthless', 1);
          decreeSummary = `Your first decree empowers ANBU border networks, uncovering deep intelligence on hidden threats.`;
        }

        clampStats(state);
        applyPlayerActionToWorldSim(state, { type: 'kage_ascend' });
        applyPlayerActionToWorldSim(state, {
          type: 'kage_decree',
          decree:
            optionId === 'decree_peace' ||
            optionId === 'decree_academy' ||
            optionId === 'decree_fortress'
              ? optionId
              : 'decree_shadow',
        });
        const chips = [...diffStats(before, state.stats)];
        if (tensionDelta !== 0) {
          chips.push({ stat: 'tension', label: 'World Tension', delta: tensionDelta });
        }
        recordMemory(state, 'promotion', `Ascended as ${title} of ${vName} and issued your first village decree.`);
        pushLog(
          state,
          'milestone',
          `Before the entire village square, you place the ${title} hat upon your head. ${decreeSummary}`,
          { title: `Acclaimed as ${title}`, deltas: chips },
        );
        break;
      }

      if (optionId === 'accept_kage') {
        pushLog(
          state,
          'milestone',
          `You bow calmly before the Daimyo and elder council, accepting the burden of becoming ${title} of ${vName}.`,
        );
        state.pending = buildKageSuccessionDecision(state, 2, offerReason);
        break;
      }

      if (optionId === 'negotiate_authority') {
        const passed = state.stats.intel + state.stats.will + rng.int(0, 30) > 125;
        checks.push({ label: 'Council Authority Negotiation', passed });
        if (passed) {
          const prevT = state.world.tension;
          state.world.tension = clamp(state.world.tension - 8, 5, 100);
          if (state.world.omenActive && state.world.tension < 65) state.world.omenActive = false;
          state.stats.will += 6;
          state.stats.ryo += 15;
          clampStats(state);
          const chips = [...diffStats(before, state.stats)];
          if (state.world.tension - prevT !== 0) {
            chips.push({ stat: 'tension', label: 'World Tension', delta: state.world.tension - prevT });
          }
          pushLog(
            state,
            'milestone',
            `The Daimyo admires your iron composure and grants you full authority over ${vName}'s war and peace councils!`,
            { deltas: chips, checks },
          );
          state.pending = buildKageSuccessionDecision(state, 2, offerReason);
        } else {
          state.stats.will += 3;
          state.stats.bonds -= 2;
          clampStats(state);
          pushLog(
            state,
            'normal',
            `The elder council balks at your terms, forcing a tense compromise before confirming your inauguration as ${title}.`,
            { deltas: diffStats(before, state.stats), checks },
          );
          state.pending = buildKageSuccessionDecision(state, 2, offerReason);
        }
        break;
      }

      if (optionId === 'recommend_comrade') {
        state.flags.declined_kage = true;
        const prevT = state.world.tension;
        state.world.tension = clamp(state.world.tension - 6, 5, 100);
        if (state.world.omenActive && state.world.tension < 65) state.world.omenActive = false;
        state.stats.bonds += 10;
        state.stats.will += 6;
        if (state.team) {
          state.team.members.forEach((m) => isPersonAlive(state, m.personId) && adjustMemberTrust(state, m, 8));
        }
        if (state.permanentPartner && isPersonAlive(state, state.permanentPartner.personId)) {
          state.permanentPartner.trust = clamp(state.permanentPartner.trust + 8, 0, 100);
        }
        // D9: Actually inaugurate the endorsed comrade NPC as the new Kage of the village
        const comradePersonId = String(decision.meta?.comradePersonId ?? '');
        const endorsedNpc =
          (comradePersonId ? getPerson(state, comradePersonId) : undefined) ??
          state.worldSim?.npcs.find(
            (n) =>
              n.identity.alive &&
              n.identity.villageId === state.villageId &&
              n.identity.specialStatus !== 'kage' &&
              n.identity.specialStatus !== 'missing_nin' &&
              n.identity.rank === 'jonin',
          );
        const vSim = state.worldSim?.villages[state.villageId];
        if (endorsedNpc && endorsedNpc.identity.alive && vSim && state.worldSim) {
          for (const n of state.worldSim.npcs) {
            if (n.identity.villageId === state.villageId && n.identity.specialStatus === 'kage') {
              n.identity.specialStatus = 'none';
              if (n.identity.alive) n.identity.roleTitle = `Retired ${title}`;
            }
          }
          endorsedNpc.identity.rank = 'jonin';
          endorsedNpc.identity.specialStatus = 'kage';
          endorsedNpc.identity.roleTitle = title;
          vSim.kageNpcId = endorsedNpc.identity.id;
        }
        const inauguratedName = endorsedNpc?.identity.name ?? comradeName;
        clampStats(state);
        const chips = [...diffStats(before, state.stats)];
        if (state.world.tension - prevT !== 0) {
          chips.push({ stat: 'tension', label: 'World Tension', delta: state.world.tension - prevT });
        }
        recordMemory(state, 'promotion', `Declined the ${title} hat and inaugurated ${inauguratedName} to lead ${vName}.`);
        pushLog(
          state,
          'bond',
          `You decline the ${title} hat with an easy grin and endorse ${inauguratedName} before the Daimyo. Days later, ${inauguratedName} takes the oath as ${title} while you stay free to guard ${vName} from the open road.`,
          { title: `Endorsed ${inauguratedName} as ${title}`, deltas: chips },
        );
        break;
      }

      state.flags.declined_kage = true;
      state.stats.will += 6;
      state.stats.bonds += 4;
      clampStats(state);
      pushLog(
        state,
        'bond',
        `You decline the ${title} offer with a quiet bow, choosing to keep shielding ${vName} from the frontlines.`,
        { deltas: diffStats(before, state.stats) },
      );
      break;
    }

    case 'chunin_exam_stage': {
      const stage = Number(decision.meta?.stage ?? 1) as ChuninExamStage;

      if (stage === 1) {
        if (optionId === 'withdraw_exam') {
          const fin = finalizeChuninTournament(state, false, rng);
          pushLog(
            state,
            'normal',
            `You raise your hand and withdraw from the Chunin Exams to prepare another year.${fin.summary ? ` ${fin.summary}` : ''}`,
          );
          break;
        }
        const passed =
          optionId === 'bloodline_sensory_cheat'
            ? state.stats.intel + state.stats.chakra * 0.4 + rng.int(0, 30) > 36
            : optionId === 'intel_gather'
              ? state.stats.intel + rng.int(0, 30) > 40
              : state.stats.will + rng.int(0, 30) > 44;
        const label =
          optionId === 'bloodline_sensory_cheat'
            ? 'Sensory / Dojutsu Information Gathering'
            : optionId === 'intel_gather'
              ? 'Stealth Info Gathering'
              : 'Tenth Question Resolve';
        checks.push({ label, passed });

        if (passed) {
          state.stats.intel += optionId === 'bloodline_sensory_cheat' ? 3 : 2;
          state.stats.will += 2;
          clampStats(state);
          const tNotes = advanceChuninTournamentStage(state, 1, rng);
          pushLog(
            state,
            'milestone',
            `You clear Stage 1 (Written Cipher) and march into the Forest of Death!${tNotes.length > 0 ? ` ${tNotes.join(' ')}` : ''}`,
            {
              deltas: diffStats(before, state.stats),
              checks,
            },
          );
          state.pending = buildChuninExamStage(state, 2);
        } else {
          const fin = finalizeChuninTournament(state, false, rng, 1);
          pushLog(
            state,
            'normal',
            `Caught out by the proctor’s trap, you are eliminated in Stage 1 of the Chunin Exams.${fin.summary ? ` ${fin.summary}` : ''}`,
            { checks },
          );
          if (fin.promotedTeammates.length > 0 && state.team?.active) {
            state.pending = disbandGeninTeam(state, 'teammate_chunin', fin.promotedTeammates);
          }
        }
      } else if (stage === 2) {
        let passed = false;
        let checkLabel = 'Forest Scroll Hunt';
        if (optionId === 'ambush_hunt') {
          checkLabel = 'Scroll Ambush';
          passed = state.stats.chakra + state.stats.health * 0.5 + rng.int(0, 34) > 78;
        } else if (optionId === 'squad_cover') {
          checkLabel = 'Squad Formation';
          passed = state.stats.bonds + state.stats.will * 0.5 + rng.int(0, 34) > 72;
        } else if (optionId === 'barter_trap') {
          checkLabel = 'Decoy Scroll Snare';
          passed = state.stats.intel + state.stats.chakra * 0.45 + rng.int(0, 34) > 74;
        } else {
          checkLabel = 'Forest Stealth';
          passed = state.stats.intel + state.stats.will * 0.5 + rng.int(0, 34) > 70;
        }
        checks.push({ label: checkLabel, passed });

        if (passed) {
          state.stats.will += 2;
          state.stats.health = Math.max(1, state.stats.health - 3);
          if (state.team?.active) {
            state.team.members.forEach((m) => isPersonAlive(state, m.personId) && adjustMemberTrust(state, m, 3));
          }
          clampStats(state);
          const tNotes = advanceChuninTournamentStage(state, 2, rng);
          pushLog(
            state,
            'milestone',
            `You secure the missing Earth Scroll on Day 2 and begin the perilous push toward the Central Tower!${tNotes.length > 0 ? ` ${tNotes.join(' ')}` : ''}`,
            { deltas: diffStats(before, state.stats), checks },
          );
          state.pending = buildChuninExamStage(state, 3);
        } else {
          state.stats.health -= optionId === 'ambush_hunt' ? 14 : 8;
          clampStats(state);
          const loyalMate = state.team?.active
            ? state.team.members.find((m) => m.role === 'teammate' && isPersonAlive(state, m.personId) && m.trust >= 65)
            : undefined;
          const fatalRisk = optionId === 'ambush_hunt' && state.stats.health < 30 && !loyalMate;
          if (state.stats.health <= 0 || (fatalRisk && rng.chance(0.14))) {
            killCharacter(state, 'mortally wounded inside the Forest of Death during the Chunin Exams');
            break;
          }
          const fin = finalizeChuninTournament(state, false, rng, 2);
          pushLog(
            state,
            'danger',
            `${loyalMate ? `Rival Genin shatter your guard in the Forest of Death, and only ${personName(state, loyalMate.personId)} dragging you clear saves your life. Your exam run ends here.` : 'An enemy squad seizes your scroll in the Forest of Death, ending your Chunin Exam run with harsh bruises.'}${fin.summary ? ` ${fin.summary}` : ''}`,
            { deltas: diffStats(before, state.stats), checks },
          );
          if (fin.promotedTeammates.length > 0 && state.team?.active) {
            state.pending = disbandGeninTeam(state, 'teammate_chunin', fin.promotedTeammates);
          }
        }
      } else if (stage === 3) {
        let passed = false;
        let checkLabel = 'Tower Gate Sprint';
        if (optionId === 'hold_the_line') {
          checkLabel = 'Bridge Breakthrough';
          passed = state.stats.chakra + state.stats.health * 0.5 + rng.int(0, 34) > 78;
        } else if (optionId === 'protect_teammate') {
          checkLabel = 'Squad Rearguard';
          passed = state.stats.bonds + state.stats.will * 0.5 + rng.int(0, 34) > 72;
        } else {
          checkLabel = 'Smoke Diversion';
          passed = state.stats.intel + state.stats.will * 0.5 + rng.int(0, 34) > 70;
        }
        checks.push({ label: checkLabel, passed });

        if (passed) {
          state.stats.will += 3;
          state.stats.health = Math.max(1, state.stats.health - 3);
          if (state.team?.active) {
            state.team.members.forEach((m) => isPersonAlive(state, m.personId) && adjustMemberTrust(state, m, optionId === 'protect_teammate' ? 6 : 3));
          }
          clampStats(state);
          const tNotes = advanceChuninTournamentStage(state, 3, rng);
          pushLog(
            state,
            'milestone',
            `Mud-streaked and breathless, you slam through the Central Tower doors with both Heaven and Earth scrolls before the five-day horn sounds!${tNotes.length > 0 ? ` ${tNotes.join(' ')}` : ''}`,
            { deltas: diffStats(before, state.stats), checks },
          );
          state.pending = buildChuninExamStage(state, 4);
        } else {
          state.stats.health -= optionId === 'hold_the_line' ? 12 : 7;
          clampStats(state);
          if (state.stats.health <= 0) {
            killCharacter(state, 'overwhelmed at the Central Tower ravine during the Chunin Exams');
            break;
          }
          const fin = finalizeChuninTournament(state, false, rng, 3);
          pushLog(
            state,
            'danger',
            `Pinned down outside the ravine bridge until the five-day horn rings, you miss the tower cutoff.${fin.summary ? ` ${fin.summary}` : ''}`,
            { deltas: diffStats(before, state.stats), checks },
          );
          if (fin.promotedTeammates.length > 0 && state.team?.active) {
            state.pending = disbandGeninTeam(state, 'teammate_chunin', fin.promotedTeammates);
          }
        }
      } else if (stage === 4) {
        // Tower Preliminaries (1v1 Elimination)
        const kenLevel = state.disciplines.find((d) => d.id === 'kenjutsu')?.level ?? 0;
        let statScore = 0;
        let checkLabel = 'Tower Preliminary Bout';
        if (optionId === 'prelim_kenjutsu') {
          checkLabel = 'Preliminary Kenjutsu Clash';
          statScore = state.stats.health * 0.45 + state.stats.will * 0.45 + kenLevel * 6;
        } else if (optionId === 'prelim_ninjutsu') {
          checkLabel = 'Preliminary Ninjutsu Clash';
          statScore = state.stats.chakra * 0.6 + state.stats.intel * 0.35;
        } else if (optionId === 'prelim_genjutsu') {
          checkLabel = 'Preliminary Genjutsu Feint';
          statScore = state.stats.intel * 0.55 + state.stats.will * 0.4;
        } else {
          checkLabel = 'Preliminary Taijutsu Bout';
          statScore = state.stats.health * 0.55 + state.stats.will * 0.4;
        }
        const passed = statScore + rng.int(0, 36) > 64;
        checks.push({ label: checkLabel, passed });

        if (passed) {
          state.stats.will += 2;
          if (state.disciplines.length > 0) {
            const main = state.disciplines.find((d) => d.isMain) ?? state.disciplines[0];
            main.xp += 4;
          }
          clampStats(state);
          const tNotes = advanceChuninTournamentStage(state, 4, rng);
          pushLog(
            state,
            'milestone',
            `Victory in the Tower Preliminaries! Your name flashes across the electronic match board for next month’s Stadium Finals.${tNotes.length > 0 ? ` ${tNotes.join(' ')}` : ''}`,
            { deltas: diffStats(before, state.stats), checks },
          );
          state.pending = buildChuninExamStage(state, 5);
        } else {
          state.stats.health = Math.max(8, state.stats.health - 8);
          state.stats.will += 2;
          clampStats(state);
          const fin = finalizeChuninTournament(state, false, rng, 4);
          pushLog(
            state,
            'normal',
            `Your opponent edges you out in a fierce Tower Preliminary bout. You watch the remaining qualifiers from the balcony, hungry for next year.${fin.summary ? ` ${fin.summary}` : ''}`,
            { deltas: diffStats(before, state.stats), checks },
          );
          if (fin.promotedTeammates.length > 0 && state.team?.active) {
            state.pending = disbandGeninTeam(state, 'teammate_chunin', fin.promotedTeammates);
          }
        }
      } else if (stage === 5) {
        // One-Month Finals Training Window
        let prepBonus = 7;
        let prepMsg = '';
        if (optionId === 'prep_jutsu') {
          state.stats.chakra += 4;
          if (state.disciplines.length > 0) {
            const main = state.disciplines.find((d) => d.isMain) ?? state.disciplines[0];
            main.xp += 6;
          }
          prepBonus = 8;
          prepMsg = 'Thirty relentless days on the cliffside sharpen your signature Jutsu to a razor edge.';
        } else if (optionId === 'prep_blade_body') {
          state.stats.health += 4;
          state.stats.will += 3;
          const ken = state.disciplines.find((d) => d.id === 'kenjutsu');
          if (ken) ken.xp += 5;
          prepBonus = 8;
          prepMsg = 'Weighted dawn sprints and endless form drills harden your footing for the stadium sand.';
        } else if (optionId === 'prep_tactics') {
          state.stats.intel += 5;
          state.stats.will += 2;
          prepBonus = 9;
          prepMsg = 'You dissect every finalist’s preliminary habits until you can predict their third move before their first.';
        } else {
          state.stats.bonds += 4;
          state.stats.will += 2;
          if (state.team?.active) {
            state.team.members.forEach((m) => isPersonAlive(state, m.personId) && adjustMemberTrust(state, m, 5));
          }
          prepBonus = 7;
          prepMsg = 'Daily spars beside your comrades fill you with calm fire heading into the stadium.';
        }
        clampStats(state);
        pushLog(state, 'milestone', `${prepMsg} The month flies by; stadium drums roll for the Finals!`, {
          deltas: diffStats(before, state.stats),
        });
        state.pending = buildChuninExamStage(state, 6, { finalsRound: 1, prepBonus, finalsScore: 0 });
      } else {
        // Stage 6: Stadium Finals (Round 1 Opening -> Round 2 Climax)
        const finalsRound = Number(decision.meta?.finalsRound ?? 2);
        const prepBonus = Number(decision.meta?.prepBonus ?? 0);
        const prevScore = Number(decision.meta?.finalsScore ?? 0);
        const proj = computeCombatProjection(state);
        const kenLevel = state.disciplines.find((d) => d.id === 'kenjutsu')?.level ?? 0;

        if (finalsRound === 1) {
          let openBonus = 0;
          if (optionId === 'open_tactical_read') openBonus = state.stats.intel * 0.35 + state.stats.will * 0.25;
          else if (optionId === 'open_pressure') openBonus = state.stats.chakra * 0.38 + proj.score * 0.22;
          else if (optionId === 'open_kenjutsu_draw') openBonus = state.stats.health * 0.3 + state.stats.will * 0.3 + kenLevel * 5;
          else openBonus = state.stats.health * 0.35 + state.stats.will * 0.25;

          const roundWon = openBonus + prepBonus * 0.5 + rng.int(0, 30) > 50;
          checks.push({ label: 'Finals Opening Exchange', passed: roundWon });
          const nextScore = roundWon ? 12 : 4;
          pushLog(
            state,
            roundWon ? 'milestone' : 'normal',
            roundWon
              ? 'Your opening sequence seizes the center of the stadium as the crowd erupts!'
              : 'Your opponent forces you back across the sand in a blistering opening exchange, but the match is far from over!',
            { checks },
          );
          state.pending = buildChuninExamStage(state, 6, {
            finalsRound: 2,
            prepBonus,
            finalsScore: nextScore,
          });
          break;
        }

        // Round 2: Climax & Chunin Promotion Evaluation
        let scoreBonus = 0;
        if (optionId === 'tactical_outplay') scoreBonus = state.stats.intel * 0.35 + state.stats.will * 0.25;
        else if (optionId === 'full_power') scoreBonus = state.stats.chakra * 0.4 + proj.score * 0.25;
        else if (optionId === 'kenjutsu_finisher') scoreBonus = state.stats.health * 0.32 + state.stats.will * 0.3 + kenLevel * 6;
        else scoreBonus = state.stats.health * 0.35 + state.stats.will * 0.25;

        const totalRoll = scoreBonus + prepBonus + prevScore + rng.int(0, 32);
        const matchWon = totalRoll > 62;
        const tacticalPromotion =
          !matchWon &&
          totalRoll > 50 &&
          (state.stats.intel + state.stats.will) / 2 >= 58;
        const playerPassed = matchWon || tacticalPromotion;

        checks.push({
          label: tacticalPromotion ? 'Tactical Composure Promotion' : 'Chunin Arena Finals',
          passed: playerPassed,
        });
        const tourneyResult = finalizeChuninTournament(state, playerPassed, rng, playerPassed ? undefined : 6);
        const matesPassed = tourneyResult.promotedTeammates;

        if (playerPassed) {
          promoteRank(state, 'chunin');
          state.stats.ryo += 12;
          state.stats.will += 4;
          state.stats.bonds += 3;
          clampStats(state);
          const rivalName = String(decision.meta?.rivalName ?? '');
          const vestText = VILLAGE_MAP[state.villageId].vestText;
          recordMemory(
            state,
            rivalName ? 'rival' : 'promotion',
            rivalName
              ? `Clashed with rival ${rivalName} in the Chunin Arena Finals and earned the ${vestText}.`
              : `Earned the ${vestText} in the Chunin Exam Arena Finals.`,
          );
          pushLog(
            state,
            'milestone',
            `${tacticalPromotion ? `Though your opponent edged out the final clash, the Kage and Jonin examiners applaud your calm strategic command and award you the ${vestText} anyway!` : rivalName ? `After a thrilling two-round Finals clash against your rival ${rivalName}, the examiners award you the ${vestText} and promote you to Chunin!` : `The examiners commend your composure and tactical judgment across the Finals. You are awarded the ${vestText} and promoted to Chunin!`}${tourneyResult.promotedNpcs.length > 0 ? ` Other promoted peers: ${tourneyResult.promotedNpcs.join(', ')}.` : ''}`,
            { title: 'Promoted to Chunin!', deltas: diffStats(before, state.stats), checks },
          );
          if (state.team?.active) {
            state.pending = disbandGeninTeam(state, 'player_chunin', [state.name, ...matesPassed]);
          }
        } else {
          state.stats.will += 3;
          clampStats(state);
          pushLog(
            state,
            'normal',
            `You fight hard in the Arena Finals, yet the examiners judge you need another season of maturity before leading Chunin missions.${tourneyResult.summary ? ` ${tourneyResult.summary}` : ''}`,
            { deltas: diffStats(before, state.stats), checks },
          );
          if (matesPassed.length > 0 && state.team?.active) {
            state.pending = disbandGeninTeam(state, 'teammate_chunin', matesPassed);
          }
        }
      }
      break;
    }

    case 'team_disband': {
      const team = state.team!;
      const sensei = team.members[0];
      const senseiName = personName(state, sensei.personId);
      const mates = team.members.slice(1);

      if (optionId === 'promise_comrades') {
        state.stats.bonds += 5;
        state.stats.will += 3;
        mates.forEach((m) => {
          if (isPersonAlive(state, m.personId)) {
            m.promiseMade = true;
            adjustMemberTrust(state, m, 9, true);
          }
        });
        clampStats(state);
        pushLog(
          state,
          'bond',
          `You clasp fists with your former squadmates from Team ${team.number}, swearing to meet again at the summit no matter how far your paths diverge.`,
          { title: `Farewell, Team ${team.number}`, deltas: diffStats(before, state.stats) },
        );
      } else if (optionId === 'thank_sensei') {
        state.stats.will += 4;
        state.stats.intel += 2;
        if (isPersonAlive(state, sensei.personId)) {
          sensei.promiseMade = true;
          adjustMemberTrust(state, sensei, 12, true);
        }
        clampStats(state);
        pushLog(
          state,
          'bond',
          `${senseiName} rests a warm hand on your shoulder as dusk falls. "You are no longer my student. Watch your own back out there."`,
          { title: `Farewell, Team ${team.number}`, deltas: diffStats(before, state.stats) },
        );
      } else if (optionId.startsWith('confess_')) {
        const targetId = optionId.replace('confess_', '');
        const target = mates.find((m) => m.personId === targetId);
        if (target && isPersonAlive(state, target.personId)) {
          const targetName = personName(state, target.personId);
          const ok = state.stats.bonds + target.trust + rng.int(0, 30) > 108;
          checks.push({ label: `Confess to ${targetName}`, passed: ok });
          if (ok) {
            target.relTrack = 'romance';
            target.relStage = Math.max(1, target.relStage) as 0 | 1 | 2 | 3;
            target.promiseMade = true;
            adjustMemberTrust(state, target, 14, true);
            state.stats.bonds += 6;
            clampStats(state);
            pushLog(
              state,
              'bond',
              `${targetName} listens in stunned quiet, then holds your hand beneath the lantern light. Team ${team.number} ends tonight, yet something deeper begins.`,
              { title: 'A Promise Beyond the Squad', deltas: diffStats(before, state.stats), checks },
            );
          } else {
            state.stats.will += 2;
            adjustMemberTrust(state, target, 3);
            clampStats(state);
            pushLog(
              state,
              'bond',
              `${targetName} smiles gently and asks to remain trusted comrades while wars still loom ahead.`,
              { deltas: diffStats(before, state.stats), checks },
            );
          }
        }
      } else {
        state.stats.will += 3;
        addLeaning(state, 'ruthless', 1);
        team.members.forEach((m) => isPersonAlive(state, m.personId) && adjustMemberTrust(state, m, -4));
        clampStats(state);
        pushLog(
          state,
          'normal',
          `You leave the training ground early without looking back. From today onward, Team ${team.number} belongs to the past.`,
          { deltas: diffStats(before, state.stats) },
        );
      }
      break;
    }

    case 'jonin_eval': {
      const leader = kageTitle(state);
      const passed =
        optionId === 'command_scenario'
          ? state.stats.intel + state.stats.will + rng.int(0, 30) > 122
          : state.stats.chakra + state.stats.health + rng.int(0, 30) > 132;
      checks.push({ label: `${leader} Jonin Recommendation`, passed });

      if (passed) {
        promoteRank(state, 'jonin');
        state.stats.ryo += 18;
        state.stats.will += 5;
        state.stats.bonds += 4;
        clampStats(state);
        pushLog(
          state,
          'milestone',
          `The ${leader} and senior Jonin commanders endorse your dossier unanimously. You now stand among the village’s elite Jonin, authorized for S-Rank operations and frontline command.`,
          { title: 'Promoted to Jonin!', deltas: diffStats(before, state.stats), checks },
        );
      } else {
        state.joninEvalFailedAge = state.age;
        state.stats.will += 2;
        clampStats(state);
        pushLog(
          state,
          'normal',
          `The ${leader}’s examiners push your defense to its limit and defer your Jonin recommendation for two years. Still, the trial reveals clear gaps to refine.`,
          { deltas: diffStats(before, state.stats), checks },
        );
      }
      break;
    }

    case 'bloodline_event': {
      const b = state.bloodline;
      if (!b) break;
      const def = BLOODLINE_MAP[b.id];
      const nextStage = decision.meta?.nextStage as typeof b.stage;

      if (decision.eventId === 'mangekyo_awaken') {
        if (optionId === 'embrace_ms') {
          const arts = awakenMangekyoSharingan(state, rng);
          b.lastEventAge = state.age;
          state.stats.chakra += 6;
          state.stats.will += 4;
          clampStats(state);
          pushLog(
            state,
            'milestone',
            `Your Sharingan mutates into the Mangekyo Sharingan, unlocking ${arts.join(' and ')}! Beware cumulative Eye Strain.`,
            { title: 'Mangekyo Sharingan Awakened', deltas: diffStats(before, state.stats) },
          );
        } else {
          b.lastEventAge = state.age;
          state.stats.will += 3;
          clampStats(state);
          pushLog(state, 'normal', 'You lock the grief away and refuse the crimson mutation for now.');
        }
        break;
      }

      if (decision.eventId === 'ems_transplant') {
        if (optionId === 'accept_ems') {
          applyEternalMangekyo(state);
          b.lastEventAge = state.age;
          state.stats.will += 5;
          clampStats(state);
          pushLog(
            state,
            'milestone',
            'Light returns permanently! Your Eternal Mangekyo Sharingan cures ocular blindness and removes all future Eye Strain.',
            { title: 'Eternal Mangekyo Sharingan', deltas: diffStats(before, state.stats) },
          );
        } else {
          b.lastEventAge = state.age;
          state.stats.bonds += 4;
          clampStats(state);
          pushLog(state, 'normal', 'You refuse the transplant, choosing honor over eternal sight.');
        }
        break;
      }

      if (decision.eventId === 'bloodline_awaken') {
        if (optionId === 'embrace') {
          b.stage = 'awakened';
          b.lastEventAge = state.age;
          state.stats.chakra += 5;
          state.stats.will += 3;
          clampStats(state);
          pushLog(
            state,
            'milestone',
            `${def.name} awakens unmistakably within you! ${def.bonusSummary}`,
            { title: `Awakened ${def.name}`, deltas: diffStats(before, state.stats) },
          );
        } else {
          b.lastEventAge = state.age;
          state.stats.will += 3;
          clampStats(state);
          pushLog(
            state,
            'normal',
            `You keep ${def.name} sealed for now to avoid drawing attention. It may stir again in a few years.`,
          );
        }
      } else if (optionId === 'guided') {
        b.stage = nextStage;
        b.lastEventAge = state.age;
        state.stats.ryo -= 5;
        state.stats.will += 3;
        clampStats(state);
        pushLog(
          state,
          'milestone',
          `Under careful guidance, your ${def.name} advances to ${BLOODLINE_STAGE_LABELS[nextStage]}.`,
          { deltas: diffStats(before, state.stats) },
        );
      } else if (optionId === 'solo_push') {
        const ok = rng.chance(0.55);
        checks.push({ label: 'Solo Bloodline Control', passed: ok });
        if (ok) {
          b.stage = nextStage;
          b.lastEventAge = state.age;
          state.stats.will += 4;
          state.bodyStrain += def.strainCost;
          clampStats(state);
          pushLog(
            state,
            'milestone',
            `Through sheer grit, you force ${def.name} up to ${BLOODLINE_STAGE_LABELS[nextStage]}.`,
            { deltas: diffStats(before, state.stats), checks },
          );
        } else {
          state.stats.health -= 6;
          state.bodyStrain += def.strainCost;
          clampStats(state);
          if (state.stats.health <= 0) {
            killCharacter(state, `chakra pathway collapse while forcing ${def.name} alone`);
            break;
          }
          pushLog(
            state,
            'danger',
            `The raw surge of ${def.name} recoils violently, leaving your chakra coils sore for weeks.`,
            { deltas: diffStats(before, state.stats), checks },
          );
        }
      } else {
        b.lastEventAge = state.age;
        pushLog(state, 'normal', `You hold back from pushing ${def.name} further this year.`);
      }
      break;
    }

    case 'discipline_advance': {
      const discId = String(decision.meta?.disciplineId ?? '');
      const targetLevel = Number(decision.meta?.targetLevel ?? 1) as 1 | 2 | 3 | 4;
      const isNew = Boolean(decision.meta?.isNew);
      const def = DISCIPLINE_MAP[discId];
      if (!def) break;

      if (optionId === 'defer') {
        const existing = state.disciplines.find((d) => d.id === discId);
        if (existing) existing.declinedUntilAge = state.age + 3;
        pushLog(state, 'normal', `You decide not to pursue ${def.name} further right now.`);
        break;
      }

      const quality = optionId === 'dig_deep' ? 1.2 : 1.0;
      if (optionId === 'dig_deep') {
        state.stats.health = Math.max(1, state.stats.health - 3);
        state.stats.bonds -= 2;
      }

      if (isNew) {
        state.disciplines.push({
          id: discId,
          level: 1,
          xp: 0,
          lastLevelAge: state.age,
          quality,
          isMain: state.disciplines.length === 0,
          declinedUntilAge: 0,
        });
      } else {
        const existing = state.disciplines.find((d) => d.id === discId);
        if (existing) {
          existing.level = targetLevel;
          existing.lastLevelAge = state.age;
          existing.quality = Math.max(existing.quality, quality);
        }
      }

      for (const [k, v] of Object.entries(def.gain) as [StatKey, number][]) {
        state.stats[k] += v;
      }
      if (def.leaningBias && targetLevel >= 3) {
        addLeaning(state, def.leaningBias, 1);
      }
      clampStats(state);

      const secretNote =
        targetLevel === 4 && def.secretArtName
          ? ` Signature S-Rank Technique unlocked: ${def.secretArtName}!`
          : '';
      pushLog(
        state,
        targetLevel >= 3 ? 'milestone' : 'normal',
        `${isNew ? 'Learned' : 'Advanced'} ${def.name} to ${DISCIPLINE_TIER_NAMES[targetLevel]}.${secretNote}`,
        { title: targetLevel === 4 ? `S-Rank Mastery: ${def.name}` : undefined, deltas: diffStats(before, state.stats) },
      );
      break;
    }

    case 'clan_legacy': {
      if (optionId === 'accept_legacy') {
        state.hasClanLegacy = true;
        state.stats.chakra += 18;
        state.stats.health -= 8;
        state.stats.will += 3;
        clampStats(state);
        if (state.stats.health <= 0) {
          killCharacter(state, 'body failure during the clan Hiden inheritance ritual');
          break;
        }
        pushLog(
          state,
          'milestone',
          'You unseal the family Hiden scroll and take on your clan’s accumulated chakra legacy.',
          { title: 'Clan Legacy Inherited', deltas: diffStats(before, state.stats) },
        );
      } else {
        state.flags.declined_legacy = true;
        state.stats.will += 5;
        state.stats.bonds -= 3;
        clampStats(state);
        pushLog(state, 'normal', 'You lock the clan Hiden away, choosing to forge your strength purely by your own hand.', {
          deltas: diffStats(before, state.stats),
        });
      }
      break;
    }

    case 'life_event':
    case 'growth_event': {
      const def =
        decision.kind === 'life_event'
          ? LIFE_EVENTS.find((e) => e.id === decision.meta?.lifeEventId)
          : GROWTH_EVENTS.find((e) => e.id === decision.meta?.growthEventId);
      const opt: LifeEventOptionDef | undefined = def?.options.find((o) => o.id === optionId);
      if (!def || !opt) break;

      let passed = true;
      if (opt.check) {
        passed = state.stats[opt.check.stat] + rng.int(0, opt.check.rollMax) > opt.check.threshold;
        checks.push({ label: opt.check.label, passed });
      }

      const effect = passed || !opt.onFail ? opt.onPass : opt.onFail;
      const text = passed || !opt.onFailText ? opt.onPassText : opt.onFailText;
      const res = applySimpleEffect(state, rng, effect);
      extraChips = res.extraChips;

      if (!res.killed) {
        pushLog(state, passed ? 'normal' : 'danger', text, {
          deltas: [...diffStats(before, state.stats), ...extraChips],
          checks,
        });
      }
      break;
    }

    case 'team_event': {
      const def = TEAM_EVENTS.find((e) => e.id === decision.meta?.teamEventId);
      const opt = def?.options.find((o) => o.id === optionId);
      if (!def || !opt || !state.team) break;

      if (opt.stats) {
        for (const [k, v] of Object.entries(opt.stats) as [StatKey, number][]) {
          state.stats[k] += v;
        }
      }
      if (opt.leanings) {
        for (const [k, v] of Object.entries(opt.leanings) as [LeaningKey, number][]) {
          addLeaning(state, k, v);
        }
      }
      if (opt.xpMain && state.disciplines.length > 0) {
        const main = state.disciplines.find((d) => d.isMain) ?? state.disciplines[0];
        main.xp += opt.xpMain;
      }

      let avgTrust = 0;
      for (const m of state.team.members) {
        if (!isPersonAlive(state, m.personId)) continue;
        let delta = m.role === 'sensei' ? opt.trustSensei : opt.trustTeammates;
        if (opt.traitBonus) {
          for (const tr of getPersonTraits(state, m.personId)) {
            delta += opt.traitBonus[tr] ?? 0;
          }
        }
        avgTrust += adjustMemberTrust(state, m, delta, Boolean(opt.unlockFragment));
      }
      if (def.id === 'te_d_rank_chores') state.missions.d += 1;
      else if (def.id === 'te_c_rank_dilemma') state.missions.c += 1;
      clampStats(state);
      if (state.stats.health <= 0) {
        killCharacter(state, `fatal injuries sustained during ${def.title}`);
        break;
      }
      const trustChip: StatDeltaChip[] =
        avgTrust !== 0 ? [{ stat: 'trust', label: 'Squad Kizuna', delta: Math.round(avgTrust / 3) }] : [];

      pushLog(state, 'bond', opt.resultText, {
        deltas: [...diffStats(before, state.stats), ...trustChip],
      });
      break;
    }

    case 'mission_board': {
      if (optionId === 'pass_mission') {
        state.stats.ryo += 2;
        clampStats(state);
        pushLog(state, 'normal', 'You skip the mission board and spend the week drilling fundamentals.', {
          deltas: diffStats(before, state.stats),
        });
        break;
      }

      if (optionId === 'd_mission') {
        state.missions.d += 1;
        state.stats.ryo += 4;
        state.stats.bonds += 2;
        clampStats(state);
        pushLog(state, 'normal', 'Completed a D-Rank village contract cleanly, earning modest pay and goodwill.', {
          deltas: diffStats(before, state.stats),
        });
        break;
      }

      if (optionId === 'diplomatic_mission') {
        const score = (state.stats.intel + state.stats.bonds) / 2;
        const passed = score + rng.int(0, 32) > 54;
        checks.push({ label: 'Border Diplomacy & Escort', passed });
        if (passed) {
          const prevT = state.world.tension;
          const drop = rng.int(8, 14);
          state.world.tension = clamp(state.world.tension - drop, 5, 100);
          if (state.world.omenActive && state.world.tension < 65) {
            state.world.omenActive = false;
          }
          state.missions.b += 1;
          const ryoMult = getVillageInstitutionalModifiers(state).missionRyoMult;
          state.stats.ryo += Math.max(6, Math.round(10 * ryoMult));
          state.stats.bonds += 4;
          state.stats.intel += 2;
          addLeaning(state, 'will_of_fire', 1);
          clampStats(state);
          const actualDelta = state.world.tension - prevT;
          applyPlayerActionToWorldSim(state, { type: 'diplomatic_mission', drop: Math.abs(actualDelta) });
          pushLog(
            state,
            'bond',
            `Diplomatic Peacekeeping succeeded! Your steady escort brings rival envoys to the table, easing frontier hostility.`,
            {
              title: 'Border Tension De-escalated',
              deltas: [
                ...diffStats(before, state.stats),
                ...(actualDelta !== 0 ? [{ stat: 'tension' as const, label: 'World Tension', delta: actualDelta }] : []),
              ],
              checks,
            },
          );
        } else {
          state.stats.health = Math.max(8, state.stats.health - 6);
          state.stats.will += 2;
          clampStats(state);
          pushLog(
            state,
            'danger',
            'Hardliners ambushed the border conference before talks concluded; you extracted the envoys safely, but tension remains high.',
            { deltas: diffStats(before, state.stats), checks },
          );
        }
        break;
      }

      const rankLetter =
        optionId === 's_mission' ? 'S' : optionId === 'a_mission' ? 'A' : optionId === 'b_mission' ? 'B' : 'C';
      const generated = generateMissionContract(state, rankLetter, rng);
      state.activeMission = generated;
      state.pending = buildProceduralMissionStageDecision(state, generated);
      pushLog(
        state,
        'normal',
        `Contract accepted: ${generated.title} (${generated.location}). Client: ${generated.client}. Constraint: ${generated.constraint}.`,
      );
      break;
    }

    case 'mission_event': {
      const mission = DANGEROUS_MISSIONS.find((m) => m.id === decision.meta?.missionId);
      if (!mission) break;

      if (optionId === 'pass_mission') {
        state.stats.ryo += 2;
        clampStats(state);
        pushLog(state, 'normal', 'You pass on the high-risk contract and complete routine village patrols.', {
          deltas: diffStats(before, state.stats),
        });
        break;
      }

      const cautious = optionId === 'cautious_mission';
      const statVal = cautious ? (state.stats.intel + state.stats.will) / 2 : state.stats[mission.stat];
      const passed = statVal + rng.int(0, 34) > (cautious ? mission.threshold - 10 : mission.threshold);
      checks.push({ label: `${mission.rank}-Rank Execution`, passed });

      if (passed) {
        const rankKey = mission.rank.toLowerCase() as keyof GameState['missions'];
        state.missions[rankKey] += 1;
        state.stats.ryo += cautious ? Math.round(mission.ryoReward * 0.55) : mission.ryoReward;
        state.stats.will += cautious ? 1 : 2;
        if (state.disciplines.length > 0) {
          const main = state.disciplines.find((d) => d.isMain) ?? state.disciplines[0];
          main.xp += cautious ? Math.round(mission.xpReward * 0.5) : mission.xpReward;
        }
        clampStats(state);
        pushLog(
          state,
          mission.rank === 'S' || mission.rank === 'A' ? 'milestone' : 'normal',
          `Mission accomplished: ${mission.title}. Your dossier grows sharper.`,
          { deltas: diffStats(before, state.stats), checks },
        );
      } else {
        const dmg = cautious ? Math.round(mission.failHealthLoss * 0.5) : mission.failHealthLoss;
        state.stats.health -= dmg;
        clampStats(state);
        const deathProb = cautious ? mission.deathChanceOnFail * 0.25 : mission.deathChanceOnFail;
        if (state.stats.health <= 0 || rng.chance(deathProb)) {
          killCharacter(state, mission.deathCause);
          break;
        }
        pushLog(
          state,
          'danger',
          `The ${mission.rank}-Rank operation goes sideways. You limp back through the village gate battered and lucky to breathe.`,
          { deltas: diffStats(before, state.stats), checks },
        );
      }
      break;
    }

    case 'crisis_whisper': {
      const cw = CRISIS_WHISPERS.find((w) => w.id === decision.meta?.whisperId);
      if (!cw) break;

      if (optionId === 'investigate_clue') {
        const hasSensory =
          state.disciplines.some((d) => d.id === 'sensory') ||
          (state.bloodline?.id === 'byakugan' && state.bloodline.stage !== 'latent');
        const bonus = hasSensory ? 16 : 0;
        const passed = state.stats.intel + bonus + rng.int(0, 26) > cw.clueThresholdIntel;
        checks.push({ label: 'Anomaly Investigation', passed });

        if (passed) {
          state.world.crisisClues = clamp(state.world.crisisClues + 1, 0, MAX_CRISIS_CLUES);
          state.stats.intel += 3;
          clampStats(state);
          pushLog(state, 'crisis', cw.clueFoundText, {
            title: `Crisis Clue Uncovered (${state.world.crisisClues}/${MAX_CRISIS_CLUES})`,
            deltas: [...diffStats(before, state.stats), { stat: 'clues', label: 'Crisis Clues', delta: 1 }],
            checks,
          });
        } else {
          pushLog(state, 'normal', cw.clueMissedText, { checks });
        }
      } else {
        state.stats.will += 1;
        clampStats(state);
        pushLog(state, 'normal', 'You file the odd rumor away and stay focused on immediate survival.', {
          deltas: diffStats(before, state.stats),
        });
      }
      break;
    }

    case 'war_prelude': {
      const isCrisisWar = Boolean(decision.meta?.isCrisisWar);
      const warNum = Number(decision.meta?.warNum ?? state.world.eraNumber);
      const isGeninHomeFront = state.rank === 'genin' && decision.meta?.geninDeployed === false;

      if (state.rank === 'civilian' || isGeninHomeFront) {
        if (isGeninHomeFront) {
          const raidDeath = optionId === 'home_patrols' && rng.chance(0.04);
          if (raidDeath) {
            killCharacter(state, `killed repelling an enemy border raid during Great Shinobi War #${warNum}`);
            break;
          }
          if (optionId === 'home_patrols') {
            state.stats.will += 4;
            state.stats.health -= 4;
          } else {
            state.stats.bonds += 5;
            state.stats.intel += 3;
          }
          clampStats(state);
          if (state.stats.health <= 0) {
            killCharacter(state, `exhaustion during perimeter watch in Great Shinobi War #${warNum}`);
            break;
          }
          state.warHistory.push({
            warNumber: warNum,
            ageAtStart: state.age,
            rankAtStart: state.rank,
            isCrisisWar: false,
            crisisId: 'none',
            outcome: 'survived',
            title: `Home Front Watch of War #${warNum}`,
            fieldPromoted: false,
            summary:
              optionId === 'home_patrols'
                ? 'Held outer village patrol lines while senior shinobi fought at the front.'
                : 'Ran medical and supply relays between the village hospital and gates.',
          });
          state.world.warsSurvived += 1;
          state.world.eraNumber += 1;
          state.world.lastWarAge = state.age;
          state.world.tension = rng.int(10, 22);
          state.world.omenActive = false;
          pushLog(
            state,
            'war',
            `Great Shinobi War #${warNum} ends along the frontier. Held back on home-front duty as a Genin, you helped keep the village standing until the veterans returned.`,
            { title: `War #${warNum} Home Front Duty`, deltas: diffStats(before, state.stats) },
          );
          break;
        }

        const died = optionId === 'aid_wounded' && rng.chance(0.14);
        if (died) {
          killCharacter(state, `caught in crossfire during Great Shinobi War #${warNum}`);
          break;
        }
        if (optionId === 'aid_wounded') {
          state.stats.bonds += 6;
          state.stats.health -= 8;
        } else {
          state.stats.ryo -= 6;
        }
        clampStats(state);
        if (state.stats.health <= 0) {
          killCharacter(state, `exhaustion and shrapnel while aiding wounded in Great Shinobi War #${warNum}`);
          break;
        }
        state.warHistory.push({
          warNumber: warNum,
          ageAtStart: state.age,
          rankAtStart: state.rank,
          isCrisisWar: false,
          crisisId: 'none',
          outcome: 'survived',
          title: `Border Smoke of War #${warNum}`,
          fieldPromoted: false,
          summary: optionId === 'aid_wounded' ? 'Carried wounded shinobi behind the barricades.' : 'Endured the war inside mountain shelters.',
        });
        state.world.warsSurvived += 1;
        state.world.eraNumber += 1;
        state.world.lastWarAge = state.age;
        state.world.tension = rng.int(10, 22);
        state.world.omenActive = false;
        pushLog(state, 'war', `Great Shinobi War #${warNum} finally burns out along the border, leaving empty chairs and exhausted streets.`, {
          deltas: diffStats(before, state.stats),
        });
        break;
      }

      if (optionId === 'desert_war') {
        state.specialStatus = 'missing_nin';
        state.stats.bonds -= 12;
        state.stats.will += 4;
        addLeaning(state, 'ruthless', 2);
        if (
          state.nindo === 'never_go_back' ||
          state.nindo === 'protect_bonds' ||
          state.nindo === 'become_kage'
        ) {
          state.stats.will = Math.max(0, state.stats.will - 6);
          pushLog(
            state,
            'danger',
            'You betrayed your own Nindo, slashing the emblem of the village you once swore to uphold (-6 Will).',
          );
        }
        if (state.team?.active) {
          state.team.active = false;
          state.team.disbandedAge = state.age;
          state.team.disbandReason = 'tragedy';
          for (const m of state.team.members) {
            if (isPersonAlive(state, m.personId)) adjustMemberTrust(state, m, -20);
          }
        }
        clampStats(state);
        state.warHistory.push({
          warNumber: warNum,
          ageAtStart: state.age,
          rankAtStart: state.rank,
          isCrisisWar,
          crisisId: isCrisisWar ? state.world.seededCrisis : 'none',
          outcome: 'deserted',
          title: `Flight from War #${warNum}`,
          fieldPromoted: false,
          summary: 'Slashed the village headband and vanished across the frontier as a Missing-Nin.',
        });
        state.world.eraNumber += 1;
        state.world.lastWarAge = state.age;
        state.world.tension = rng.int(18, 32);
        state.world.omenActive = false;
        applyPlayerActionToWorldSim(state, { type: 'player_defect' });
        pushLog(
          state,
          'danger',
          `You slash a deep line across your forehead protector and vanish into the rain rather than die in War #${warNum}. Village Hunter-Nin now carry your name.`,
          { title: 'Became a Missing-Nin', deltas: diffStats(before, state.stats) },
        );
        break;
      }

      // Deploy to the 14-Day Autonomous Shinobi Warfront!
      const approach: 'front' | 'flank' = optionId === 'deploy_front' ? 'front' : 'flank';
      state.phase = 'war';
      state.war = initWarState(state, rng, isCrisisWar, approach);
      const deployTitle = isCrisisWar
        ? `Endgame Crisis War #${warNum} (14 Days)`
        : state.rank === 'genin'
          ? 'Emergency Genin Draft'
          : `Great Shinobi War #${warNum} (14 Days)`;
      pushLog(
        state,
        isCrisisWar ? 'crisis' : 'war',
        `You march into ${isCrisisWar ? 'the Endgame Crisis War' : `Great Shinobi War #${warNum}`} via the ${approach === 'front' ? 'contested front' : 'reconnaissance flank'}. ${state.war.enemies.length} rival shinobi operate across the 14-day sector.`,
        { title: deployTitle },
      );
      queueWarStart(state.war);
      break;
    }

    case 'retirement_event': {
      const ev = RETIREMENT_EVENTS.find((r) => r.id === decision.meta?.retEventId);
      const opt = ev?.options.find((o) => o.id === optionId);
      if (!ev || !opt) break;
      if (opt.stats) {
        for (const [k, v] of Object.entries(opt.stats) as [StatKey, number][]) {
          state.stats[k] += v;
        }
      }
      if (opt.trustAllTeam && state.team) {
        state.team.members.forEach((m) => isPersonAlive(state, m.personId) && adjustMemberTrust(state, m, opt.trustAllTeam!));
      }
      clampStats(state);
      if (state.stats.health <= 0) {
        killCharacter(state, 'quiet exhaustion in twilight retirement');
        break;
      }
      pushLog(state, 'epilogue', opt.resultText, { deltas: diffStats(before, state.stats) });
      break;
    }

    case 'reflection': {
      const promptText = String(decision.meta?.promptText ?? '');
      const answer = (freeText ?? '').trim();
      state.reflections.push({
        age: state.age,
        prompt: promptText,
        answer: answer || '(Kept silently in memory)',
      });
      pushLog(state, 'normal', answer ? `Reflection recorded: "${answer}"` : 'You pause in quiet thought as another milestone passes.');
      break;
    }
  }

  state.rng = rng.snapshot();
}

export function finalizeLifeRecord(state: GameState, lastWords: string): void {
  if (state.phase !== 'posthumous' && state.phase !== 'ended') return;
  state.lastWords = lastWords.trim();
  state.phase = 'ended';
  state.record = buildLifeRecord(state);
}
