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
import { ORIGINS, ORIGIN_MAP } from '../data/origins';
import {
  BLOODLINE_MAP,
  BLOODLINE_STAGE_LABELS,
  DISCIPLINE_MAP,
  DISCIPLINE_TIER_NAMES,
} from '../data/powers';
import { VILLAGES, VILLAGE_MAP } from '../data/villages';
import { buildLifeRecord, buildPosthumousEpilogue, buildRetirementEventDecision } from './epilogue';
import {
  awardYearlyDisciplineXp,
  clamp,
  computeCombatProjection,
  ensureAcademyElementDiscipline,
  getChakraCap,
  hasActiveTeacher,
  pickStartingDiscipline,
  rollBirthBloodline,
  tryBloodlineEvent,
  tryDisciplineEvent,
} from './powers';
import {
  buildAcademyChoiceDecision,
  buildChuninExamStage,
  buildGraduationExamDecision,
  buildJoninEvaluationDecision,
  canTakeChuninExam,
  canTakeGraduationExam,
  canTakeJoninEvaluation,
  evaluateTeammatesChuninPass,
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
  FamilyMember,
  FocusId,
  GameState,
  LeaningKey,
  LogEntry,
  PendingDecision,
  ScenarioConfig,
  StatDeltaChip,
  StatKey,
  Stats,
} from './types';
import {
  buildWarPreludeDecision,
  rollSeededCrisis,
  tickWorldTension,
} from './world';
import { handleWarDecision, initWarState, queueWarStart } from './war';
import { applyCustomBuild } from './custom';

const STAT_LABELS: Record<StatKey, string> = {
  chakra: 'Chakra',
  intel: 'Intel',
  will: 'Will',
  bonds: 'Bonds',
  health: 'Health',
  ryo: 'Ryo',
};

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

let logCounter = 0;

export function pushLog(
  state: GameState,
  tone: LogEntry['tone'],
  text: string,
  opts?: { title?: string; deltas?: StatDeltaChip[]; checks?: CheckResultChip[] },
): LogEntry {
  const isOrphan = ORIGIN_MAP[state.originId].isOrphan;
  const entry: LogEntry = {
    id: `log_${state.age}_${++logCounter}_${state.logs.length}`,
    age: state.age,
    year: state.birthYear + state.age,
    tone,
    title: opts?.title,
    text: rewriteOrphanText(text, isOrphan),
    deltas: opts?.deltas && opts.deltas.length > 0 ? opts.deltas : undefined,
    checks: opts?.checks && opts.checks.length > 0 ? opts.checks : undefined,
  };
  state.logs.push(entry);
  if (state.logs.length > 260) {
    state.logs.splice(0, state.logs.length - 260);
  }
  return entry;
}

export function snapshotStats(state: GameState): Stats {
  return { ...state.stats };
}

export function clampStats(state: GameState): void {
  const cap = getChakraCap(state);
  state.stats.chakra = clamp(Math.round(state.stats.chakra), 0, cap);
  state.stats.intel = clamp(Math.round(state.stats.intel), 0, 100);
  state.stats.will = clamp(Math.round(state.stats.will), 0, 100);
  state.stats.bonds = clamp(Math.round(state.stats.bonds), 0, 100);
  state.stats.health = clamp(Math.round(state.stats.health), 0, 100);
  state.stats.ryo = clamp(Math.round(state.stats.ryo), 0, 100);
}

export function diffStats(before: Stats, after: Stats): StatDeltaChip[] {
  const keys: StatKey[] = ['chakra', 'intel', 'will', 'bonds', 'health', 'ryo'];
  const chips: StatDeltaChip[] = [];
  for (const k of keys) {
    const delta = after[k] - before[k];
    if (delta !== 0) {
      chips.push({ stat: k, label: STAT_LABELS[k], delta });
    }
  }
  return chips;
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
  return Math.min(0.65, base * healthFactor + trainingHazard);
}

function causeOfNaturalDeath(state: GameState, rng: SeededRng): string {
  if (state.age < 6) return 'a harsh childhood fever';
  if (state.legacyScar && rng.chance(0.18)) return 'complications from old war scars';
  if (state.bodyStrain >= 25 && rng.chance(0.25)) return 'chakra pathway exhaustion';
  if (state.age < 35) return 'a sudden fatal accident during drills';
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
  const v = VILLAGE_MAP[villageId];
  const first = rng.pick(sex === 'M' ? v.maleNames : v.femaleNames);
  const last = rng.pick(v.surnames);
  return `${first} ${last}`;
}

export function createNewLife(seed: number, scenario?: ScenarioConfig): GameState {
  const rng = new SeededRng(seed);

  const origin = rng.weighted(ORIGINS.map((o) => ({ item: o, weight: o.weight })));
  const village = scenario?.preferredVillage
    ? VILLAGE_MAP[scenario.preferredVillage]
    : rng.pick(VILLAGES);
  const sex: 'M' | 'F' = scenario?.preferredSex ?? (rng.chance(0.5) ? 'M' : 'F');
  const customTrim = scenario?.customName?.trim();
  const name = customTrim && customTrim.length > 0 ? customTrim : generateNameForVillage(village.id, sex, rng);

  const [minCap, maxCap] = origin.capacityRange;
  const capacity = rng.int(minCap, maxCap) as 1 | 2 | 3 | 4 | 5;
  const elements: ChakraElement[] = ['fire', 'wind', 'lightning', 'earth', 'water'];
  const element: ChakraElement = rng.chance(0.55) ? village.dominantElement : rng.pick(elements);

  const birthYear = rng.int(1968, 2004);
  const [minRyo, maxRyo] = origin.ryoRange;

  const family: FamilyMember[] = [];
  if (!origin.isOrphan) {
    const surname = name.split(' ').slice(1).join(' ') || rng.pick(village.surnames);
    family.push({
      relation: 'father',
      name: `${rng.pick(village.maleNames)} ${surname}`,
      sex: 'M',
      age: rng.int(24, 39),
      alive: true,
    });
    family.push({
      relation: 'mother',
      name: `${rng.pick(village.femaleNames)} ${surname}`,
      sex: 'F',
      age: rng.int(22, 36),
      alive: true,
    });
    if (origin.alwaysSibling || rng.chance(0.5)) {
      const sibSex: 'M' | 'F' = rng.chance(0.5) ? 'M' : 'F';
      family.push({
        relation: 'sibling',
        name: `${rng.pick(sibSex === 'M' ? village.maleNames : village.femaleNames)} ${surname}`,
        sex: sibSex,
        age: origin.alwaysSibling ? rng.int(2, 5) : rng.int(0, 4),
        alive: true,
        isHeirRival: origin.alwaysSibling,
      });
    }
  }

  const bloodline = rollBirthBloodline(seed, origin.id);
  const startDisc = pickStartingDiscipline(seed, origin.id, element);
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
    bloodline,
    hasClanLegacy: false,
    legacyScar: false,
    bodyStrain: 0,
    keepFit: false,
    flags: {},

    family,
    team: null,
    missions: { d: 0, c: 0, b: 0, a: 0, s: 0 },
    world: {
      eraNumber: 1,
      tension: rng.int(5, 16),
      omenActive: false,
      lastWarAge: null,
      warsSurvived: 0,
      truePeace: false,
      seededCrisis,
      crisisStage: 0,
      crisisClues: 0,
    },
    war: null,
    warHistory: [],
    fallenRosterIds: [],
    fatedRosterId: scenario?.fatedRosterId ?? null,

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

  if (scenario?.customBuild) {
    applyCustomBuild(state, scenario.customBuild);
  }

  clampStats(state);
  const resolvedVillage = VILLAGE_MAP[state.villageId];
  const resolvedOrigin = ORIGIN_MAP[state.originId];
  pushLog(
    state,
    'milestone',
    `Born in ${resolvedVillage.name} (${resolvedVillage.region}) as ${state.name}. ${resolvedOrigin.name}: ${resolvedOrigin.shortDesc} ${resolvedVillage.flavor}${scenario?.customBuild ? ' (Custom Shinobi Build)' : ''}`,
    { title: `Year ${birthYear}: A New Shinobi Life` },
  );
  if (startDisc) {
    pushLog(
      state,
      'normal',
      `Your household begins instilling early fundamentals in ${DISCIPLINE_MAP[startDisc.id]?.name ?? startDisc.id}.`,
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
    for (const [k, v] of Object.entries(effect.leanings) as [LeaningKey, number][]) {
      addLeaning(state, k, v);
    }
  }
  if (effect.tension) {
    state.world.tension = clamp(state.world.tension + effect.tension, 0, 100);
    extraChips.push({ stat: 'tension', label: 'World Tension', delta: effect.tension });
  }
  if (effect.clues) {
    state.world.crisisClues = clamp(state.world.crisisClues + effect.clues, 0, 5);
    extraChips.push({ stat: 'clues', label: 'Crisis Clues', delta: effect.clues });
  }
  if (effect.xpMain && state.disciplines.length > 0) {
    const main = state.disciplines.find((d) => d.isMain) ?? state.disciplines[0];
    main.xp += effect.xpMain;
  }
  if (effect.trustAllTeam && state.team) {
    let total = 0;
    for (const m of state.team.members) {
      if (m.alive) total += adjustMemberTrust(state, m, effect.trustAllTeam);
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
        const spouseSex: 'M' | 'F' = state.sex === 'M' ? 'F' : 'M';
        state.family.push({
          relation: 'spouse',
          name: generateNameForVillage(state.villageId, spouseSex, rng),
          sex: spouseSex,
          age: Math.max(18, state.age + rng.int(-3, 3)),
          alive: true,
        });
      } else if (fl === 'trigger_child') {
        const childSex: 'M' | 'F' = rng.chance(0.5) ? 'M' : 'F';
        const surname = state.name.split(' ').slice(1).join(' ') || 'Shinobi';
        const v = VILLAGE_MAP[state.villageId];
        const first = rng.pick(childSex === 'M' ? v.maleNames : v.femaleNames);
        state.family.push({
          relation: 'child',
          name: `${first} ${surname}`,
          sex: childSex,
          age: 0,
          alive: true,
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
  const isShinobi = state.rank !== 'civilian' || state.disciplines.length > 0;

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
    if (!member.alive) continue;
    member.age += 1;

    if (member.relation === 'father' || member.relation === 'mother') {
      const q = Math.min(0.5, baseMortality(member.age) * 1.15 + (origin.isShinobiHouse ? 0.004 : 0));
      if (rng.chance(q) || member.age >= 98) {
        member.alive = false;
        parentDied = true;
        state.stats.bonds -= 5;
        state.stats.will -= 2;
        addLeaning(state, 'vengeance', 1);
        pushLog(
          state,
          'danger',
          `Your ${member.relation}, ${member.name}, passed away at age ${member.age}.`,
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
            body: `Before passing, ${member.name} leaves behind the sealed Hiden technique of your house. Binding its chakra imprint grants formidable reserves, though your body will bear the strain.`,
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
      if (rng.chance(baseMortality(member.age)) || member.age >= 98) {
        member.alive = false;
        state.stats.bonds -= 10;
        state.stats.will -= 4;
        state.stats.health -= 3;
        pushLog(state, 'danger', `Your spouse, ${member.name}, passed away at age ${member.age}.`);
      }
    }
  }

  clampStats(state);
  return { parentDied, clanLegacyPending };
}

function logAnnualFlavor(state: GameState, rng: SeededRng): void {
  if (!rng.chance(0.75)) return;
  const candidates = FLAVOR_LINES.filter((line) => {
    if (line.minAge !== undefined && state.age < line.minAge) return false;
    if (line.maxAge !== undefined && state.age > line.maxAge) return false;
    if (line.ranks && !line.ranks.includes(state.rank)) return false;
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

  // 1. Active Genin Squad event (35% chance while team is active)
  if (state.team?.active && rng.chance(0.38)) {
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

  // 2. Dangerous shinobi mission (Genin/Chunin/Jonin) — real stakes & permadeath!
  if (
    (state.rank === 'genin' || state.rank === 'chunin' || state.rank === 'jonin') &&
    state.specialStatus !== 'missing_nin' &&
    rng.chance(state.focus === 'work' ? 0.36 : 0.22)
  ) {
    const mCands = DANGEROUS_MISSIONS.filter((m) => m.allowedRanks.includes(state.rank));
    if (mCands.length > 0) {
      const mission = rng.pick(mCands);
      return {
        id: `${mission.id}_${state.age}`,
        kind: 'mission_event',
        eventId: mission.id,
        title: mission.title,
        body: mission.body,
        manual: false,
        meta: { missionId: mission.id },
        options: [
          {
            id: 'accept_mission',
            label: `Take the ${mission.rank}-Rank mission head-on`,
            sublabel: `Reward: +${mission.ryoReward} Ryo, +${mission.xpReward} Discipline XP. Failure risks heavy injury or death.`,
            statHints: [STAT_LABELS[mission.stat]],
            autoEligible: true,
          },
          {
            id: 'cautious_mission',
            label: 'Complete the job conservatively with extra precautions',
            sublabel: 'Half reward, much lower mortality risk.',
            statHints: ['Intel', 'Will'],
            autoEligible: true,
          },
          {
            id: 'pass_mission',
            label: 'Decline and take routine village patrol instead',
            autoEligible: true,
          },
        ],
      };
    }
  }

  // 3. Life events weighted by leanings (positive feedback loop evW)
  const lifeChance = state.age < 6 ? 0.25 : 0.55;
  if (rng.chance(lifeChance)) {
    const hasSpouse = state.family.some((f) => f.relation === 'spouse' && f.alive);
    const childCount = state.family.filter((f) => f.relation === 'child').length;

    const cands = LIFE_EVENTS.filter((ev) => {
      if (state.age < ev.minAge || state.age > ev.maxAge) return false;
      if (!ev.repeatable && state.usedEvents.includes(ev.id)) return false;
      if (ev.ranks && !ev.ranks.includes(state.rank)) return false;
      if (ev.excludeOrphan && isOrphan) return false;
      if (ev.onlyOrphan && !isOrphan) return false;
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
      return {
        id: `${chosen.id}_${state.age}`,
        kind: 'life_event',
        eventId: chosen.id,
        title: chosen.title,
        body: rewriteOrphanText(chosen.body, isOrphan),
        manual: false,
        meta: { lifeEventId: chosen.id },
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

  // 4. Childhood growth events (ages 4–15)
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
      tickTeamYear(state, rng);
      tickFamilyYear(state, rng);
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
      pushLog(state, 'epilogue', `Quiet seasons roll by in ${VILLAGE_MAP[state.villageId].name} as you reach age ${state.age}.`);
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
  }

  // Log annual flavor line
  logAnnualFlavor(state, rng);

  // Check natural mortality before events
  if (state.stats.health <= 0 || state.age >= 104 || rng.chance(yearlyMortalityChance(state))) {
    killCharacter(state, causeOfNaturalDeath(state, rng));
    state.rng = rng.snapshot();
    return;
  }

  // Auto-enroll shinobi-house children into the Academy at age 6
  if (state.age === 6 && ORIGIN_MAP[state.originId].isShinobiHouse && state.rank === 'civilian') {
    promoteRank(state, 'academy');
    ensureAcademyElementDiscipline(state);
    pushLog(
      state,
      'milestone',
      `At age 6, your household sends you through the gates of the ${VILLAGE_MAP[state.villageId].name} Shinobi Academy.`,
      { title: 'Entered the Shinobi Academy' },
    );
  }

  // World Tension & Crisis Foreshadowing tick
  const worldTick = tickWorldTension(state, rng);
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

  // Priority 1: Age 6 Academy enrollment for civilian/orphan
  if (!nextDecision && state.age === 6 && !ORIGIN_MAP[state.originId].isShinobiHouse && !state.flags.declined_academy) {
    nextDecision = buildAcademyChoiceDecision(state);
  }

  // Priority 2: Age 6 Initial Focus Pick
  if (!nextDecision && state.age === 6 && !state.flags.initial_focus_picked) {
    state.flags.initial_focus_picked = true;
    nextDecision = {
      id: 'focus_initial_6',
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

  // Priority 4: Recurring Shinobi War / Endgame Crisis Eruption!
  if (!nextDecision && worldTick.triggerWar) {
    nextDecision = buildWarPreludeDecision(state, worldTick.isCrisisWar);
  }

  // Priority 5: Academy Graduation Exam
  if (!nextDecision && canTakeGraduationExam(state)) {
    nextDecision = buildGraduationExamDecision(state);
  }

  // Priority 6: Chunin Exam (Genin -> Chunin & Team Disbandment trigger!)
  if (!nextDecision && canTakeChuninExam(state) && rng.chance(state.chuninAttempts === 0 ? 0.8 : 0.65)) {
    state.chuninAttempts += 1;
    nextDecision = buildChuninExamStage(state, 1);
  }

  // Priority 7: Jonin Evaluation
  if (!nextDecision && canTakeJoninEvaluation(state) && rng.chance(0.65)) {
    nextDecision = buildJoninEvaluationDecision(state);
  }

  // Priority 8: Bloodline (Kekkei Genkai) Awakening / Refinement
  if (!nextDecision) {
    nextDecision = tryBloodlineEvent(state, parentDied);
  }

  // Priority 9: Discipline Advancement / New Discipline
  if (!nextDecision) {
    nextDecision = tryDisciplineEvent(state, rng);
  }

  // Priority 10: Crisis Foreshadowing Whisper (Seeded Endgame Crisis)
  if (!nextDecision && worldTick.whisperDecision) {
    nextDecision = worldTick.whisperDecision;
  }

  // Priority 11: Milestone Reflections (ages 5, 15, 30, 50, 70)
  if (!nextDecision) {
    const prompt = REFLECTION_PROMPTS.find((r) => r.age === state.age);
    if (prompt && !state.reflections.some((r) => r.age === state.age)) {
      nextDecision = {
        id: `reflect_${state.age}`,
        kind: 'reflection',
        eventId: `reflect_${state.age}`,
        title: `Reflection at Age ${state.age}`,
        body: prompt.prompt,
        manual: false,
        allowFreeText: true,
        freeTextPlaceholder: 'Write a brief personal note (optional)...',
        meta: { promptText: prompt.prompt },
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

  if (
    (decision.kind === 'war_day' ||
      decision.kind === 'war_night' ||
      decision.kind === 'war_target' ||
      decision.kind === 'war_battle_round' ||
      decision.kind === 'war_pressure' ||
      decision.kind === 'war_crossroads' ||
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
        state.stats.will += 2;
        clampStats(state);
        pushLog(
          state,
          'milestone',
          `You enroll in the ${VILLAGE_MAP[state.villageId].name} Shinobi Academy, tying a practice headband around your wrist.`,
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
      const passed =
        optionId === 'chakra_form'
          ? state.stats.chakra + state.stats.intel + rng.int(0, 28) > (isEarly ? 82 : 46)
          : state.stats.health + state.stats.will + rng.int(0, 28) > (isEarly ? 128 : 88);
      checks.push({ label: optionId === 'chakra_form' ? 'Clone & Chakra Exam' : 'Taijutsu & Target Exam', passed });

      if (passed) {
        promoteRank(state, 'genin');
        state.geninSinceAge = state.age;
        ensureAcademyElementDiscipline(state);
        state.stats.will += 4;
        state.stats.bonds += 3;
        clampStats(state);

        state.team = formGeninTeam(state, rng);
        const sensei = state.team.members[0];
        const mates = state.team.members.slice(1);
        pushLog(
          state,
          'milestone',
          `You pass the Graduation Exam and receive your forehead protector as a Genin! You are assigned to Team ${state.team.number} under Jonin Sensei ${sensei.name}, alongside ${mates[0].name} and ${mates[1].name}.`,
          { title: `Promoted to Genin (Team ${state.team.number})`, deltas: diffStats(before, state.stats), checks },
        );
        // Immediately queue the induction Bell Test
        state.pending = buildBellTestDecision(state);
      } else {
        state.academyFailedCount += 1;
        state.stats.will -= 2;
        clampStats(state);
        if (state.academyFailedCount >= 2) {
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
            'Your clone flickers and dissolves before the examiners. You stay in the Academy for one more year to sharpen your fundamentals.',
            { deltas: diffStats(before, state.stats), checks },
          );
        }
      }
      break;
    }

    case 'bell_test': {
      const team = state.team!;
      const sensei = team.members[0];
      const mates = team.members.slice(1);
      team.bellTestPassed = true;

      if (optionId === 'team_plan') {
        state.stats.bonds += 4;
        state.stats.intel += 3;
        adjustMemberTrust(state, sensei, 10, true);
        mates.forEach((m) => adjustMemberTrust(state, m, 9, true));
        clampStats(state);
        pushLog(
          state,
          'bond',
          `Your squad’s coordinated trap forces ${sensei.name} onto the defensive. "You passed," Sensei smiles. "Teamwork comes before individual glory."`,
          { title: `Team ${team.number} Passed the Bell Test`, deltas: diffStats(before, state.stats) },
        );
      } else if (optionId === 'share_lunch') {
        state.stats.will += 4;
        state.stats.bonds += 5;
        addLeaning(state, 'will_of_fire', 1);
        adjustMemberTrust(state, sensei, 12, true);
        mates.forEach((m) => adjustMemberTrust(state, m, 11, true));
        clampStats(state);
        pushLog(
          state,
          'bond',
          `Defying orders to feed a bound squadmate wins ${sensei.name}’s rare approval: "Those who break rules are scum, but those who abandon comrades are worse than scum."`,
          { title: `Team ${team.number} Passed the Bell Test`, deltas: diffStats(before, state.stats) },
        );
      } else {
        const passed = state.stats.chakra + rng.int(0, 30) > 62;
        checks.push({ label: 'Solo Bell Snatch', passed });
        if (passed) {
          state.stats.chakra += 3;
          addLeaning(state, 'ambition', 1);
          adjustMemberTrust(state, sensei, 5);
          mates.forEach((m) => adjustMemberTrust(state, m, -3));
        } else {
          state.stats.health -= 4;
          adjustMemberTrust(state, sensei, 2);
          mates.forEach((m) => adjustMemberTrust(state, m, 2));
        }
        clampStats(state);
        pushLog(
          state,
          'normal',
          passed
            ? `You actually graze a bell with a fearless rush before ${sensei.name} reminds you that lone wolves die early. Still, Team ${team.number} is cleared for active missions.`
            : `${sensei.name} traps you in a rope snare effortlessly, lecturing the squad on teamwork before clearing Team ${team.number} for D-Rank duty.`,
          { deltas: diffStats(before, state.stats), checks },
        );
      }
      break;
    }

    case 'chunin_exam_stage': {
      const stage = Number(decision.meta?.stage ?? 1) as 1 | 2 | 3;

      if (stage === 1) {
        if (optionId === 'withdraw_exam') {
          pushLog(state, 'normal', 'You raise your hand and withdraw from the Chunin Exams to prepare another year.');
          break;
        }
        const passed =
          optionId === 'intel_gather'
            ? state.stats.intel + rng.int(0, 30) > 42
            : state.stats.will + rng.int(0, 30) > 46;
        checks.push({ label: optionId === 'intel_gather' ? 'Stealth Info Gathering' : 'Tenth Question Resolve', passed });

        if (passed) {
          state.stats.intel += 2;
          state.stats.will += 2;
          clampStats(state);
          pushLog(state, 'milestone', 'You clear Stage 1 of the Chunin Exams and advance to the Forest of Death.', {
            deltas: diffStats(before, state.stats),
            checks,
          });
          state.pending = buildChuninExamStage(state, 2);
        } else {
          pushLog(state, 'normal', 'Caught out by the proctor’s trap, you are eliminated in Stage 1 of the Chunin Exams.', {
            checks,
          });
          // Even if player fails, check if a teammate still earned Chunin independently!
          const matesPassed = evaluateTeammatesChuninPass(state, rng);
          if (matesPassed.length > 0 && state.team?.active) {
            state.pending = disbandGeninTeam(state, 'teammate_chunin', matesPassed);
          }
        }
      } else if (stage === 2) {
        let passed = false;
        let checkLabel = 'Forest Survival';
        if (optionId === 'ambush_hunt') {
          checkLabel = 'Scroll Ambush';
          passed = state.stats.chakra + state.stats.health * 0.5 + rng.int(0, 32) > 84;
        } else if (optionId === 'squad_cover') {
          checkLabel = 'Squad Formation';
          passed = state.stats.bonds + state.stats.will * 0.5 + rng.int(0, 32) > 78;
        } else {
          checkLabel = 'Forest Stealth';
          passed = state.stats.intel + state.stats.will * 0.5 + rng.int(0, 32) > 74;
        }
        checks.push({ label: checkLabel, passed });

        if (passed) {
          state.stats.will += 3;
          state.stats.health -= 4;
          if (state.team?.active) {
            state.team.members.forEach((m) => m.alive && adjustMemberTrust(state, m, 4));
          }
          clampStats(state);
          pushLog(
            state,
            'milestone',
            'Bruised and mud-streaked, you reach the central tower with both Heaven and Earth scrolls before the five-day horn sounds.',
            { deltas: diffStats(before, state.stats), checks },
          );
          state.pending = buildChuninExamStage(state, 3);
        } else {
          state.stats.health -= optionId === 'ambush_hunt' ? 16 : 9;
          clampStats(state);
          const loyalMate = state.team?.active
            ? state.team.members.find((m) => m.role === 'teammate' && m.alive && m.trust >= 65)
            : undefined;
          const fatalRisk = optionId === 'ambush_hunt' && state.stats.health < 35 && !loyalMate;
          if (state.stats.health <= 0 || (fatalRisk && rng.chance(0.18))) {
            killCharacter(state, 'mortally wounded inside the Forest of Death during the Chunin Exams');
            break;
          }
          pushLog(
            state,
            'danger',
            loyalMate
              ? `Rival Genin shatter your guard in the Forest of Death, and only ${loyalMate.name} dragging you clear saves your life. Your exam run ends here.`
              : 'An enemy squad seizes your scroll in the Forest of Death, ending your Chunin Exam run with harsh bruises.',
            { deltas: diffStats(before, state.stats), checks },
          );
          const matesPassed = evaluateTeammatesChuninPass(state, rng);
          if (matesPassed.length > 0 && state.team?.active) {
            state.pending = disbandGeninTeam(state, 'teammate_chunin', matesPassed);
          }
        }
      } else {
        // Stage 3: Arena Finals
        const proj = computeCombatProjection(state);
        let scoreBonus = 0;
        if (optionId === 'tactical_outplay') scoreBonus = state.stats.intel * 0.35 + state.stats.will * 0.25;
        else if (optionId === 'full_power') scoreBonus = state.stats.chakra * 0.4 + proj.score * 0.25;
        else scoreBonus = state.stats.health * 0.35 + state.stats.will * 0.25;

        const playerPassed = scoreBonus + rng.int(0, 34) > 54;
        checks.push({ label: 'Chunin Arena Evaluation', passed: playerPassed });
        const matesPassed = evaluateTeammatesChuninPass(state, rng);

        if (playerPassed) {
          promoteRank(state, 'chunin');
          state.stats.ryo += 10;
          state.stats.will += 4;
          state.stats.bonds += 3;
          clampStats(state);
          pushLog(
            state,
            'milestone',
            'The examiners commend your composure and tactical judgment in the Arena Finals. You are awarded the green flak jacket and promoted to Chunin!',
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
            'You fight hard in the Arena Finals, yet the examiners judge you need another season of maturity before leading Chunin missions.',
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
      const mates = team.members.slice(1);

      if (optionId === 'promise_comrades') {
        state.stats.bonds += 5;
        state.stats.will += 3;
        mates.forEach((m) => {
          if (m.alive) {
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
        if (sensei.alive) {
          sensei.promiseMade = true;
          adjustMemberTrust(state, sensei, 12, true);
        }
        clampStats(state);
        pushLog(
          state,
          'bond',
          `${sensei.name} rests a warm hand on your shoulder as dusk falls. "You are no longer my student. Watch your own back out there."`,
          { title: `Farewell, Team ${team.number}`, deltas: diffStats(before, state.stats) },
        );
      } else if (optionId.startsWith('confess_')) {
        const targetId = optionId.replace('confess_', '');
        const target = mates.find((m) => m.id === targetId);
        if (target && target.alive) {
          const ok = state.stats.bonds + target.trust + rng.int(0, 30) > 108;
          checks.push({ label: `Confess to ${target.name}`, passed: ok });
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
              `${target.name} listens in stunned quiet, then holds your hand beneath the lantern light. Team ${team.number} ends tonight, yet something deeper begins.`,
              { title: 'A Promise Beyond the Squad', deltas: diffStats(before, state.stats), checks },
            );
          } else {
            state.stats.will += 2;
            adjustMemberTrust(state, target, 3);
            clampStats(state);
            pushLog(
              state,
              'bond',
              `${target.name} smiles gently and asks to remain trusted comrades while wars still loom ahead.`,
              { deltas: diffStats(before, state.stats), checks },
            );
          }
        }
      } else {
        state.stats.will += 3;
        addLeaning(state, 'ruthless', 1);
        team.members.forEach((m) => m.alive && adjustMemberTrust(state, m, -4));
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
      const passed =
        optionId === 'command_scenario'
          ? state.stats.intel + state.stats.will + rng.int(0, 30) > 122
          : state.stats.chakra + state.stats.health + rng.int(0, 30) > 132;
      checks.push({ label: 'Jonin Board Evaluation', passed });

      if (passed) {
        promoteRank(state, 'jonin');
        state.stats.ryo += 18;
        state.stats.will += 5;
        state.stats.bonds += 4;
        clampStats(state);
        pushLog(
          state,
          'milestone',
          'The Jonin Promotion Board stamps your dossier unanimously. You now stand among the village’s elite Jonin, authorized for S-Rank operations and frontline command.',
          { title: 'Promoted to Jonin!', deltas: diffStats(before, state.stats), checks },
        );
      } else {
        state.joninEvalFailedAge = state.age;
        state.stats.will += 2;
        clampStats(state);
        pushLog(
          state,
          'normal',
          'The examiners push your defense to its limit and defer your Jonin promotion for two years. Still, the evaluation reveals clear gaps to refine.',
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
          b.declined = true;
          state.stats.will += 3;
          clampStats(state);
          pushLog(state, 'normal', `You seal away the stirring power of ${def.name}, choosing an ordinary shinobi path.`);
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
        state.stats.health -= 3;
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
        if (!m.alive) continue;
        let delta = m.role === 'sensei' ? opt.trustSensei : opt.trustTeammates;
        if (opt.traitBonus) {
          for (const tr of m.traits) {
            delta += opt.traitBonus[tr] ?? 0;
          }
        }
        avgTrust += adjustMemberTrust(state, m, delta, Boolean(opt.unlockFragment));
      }
      state.missions.d += 1;
      clampStats(state);
      const trustChip: StatDeltaChip[] =
        avgTrust !== 0 ? [{ stat: 'trust', label: 'Squad Kizuna', delta: Math.round(avgTrust / 3) }] : [];

      pushLog(state, 'bond', opt.resultText, {
        deltas: [...diffStats(before, state.stats), ...trustChip],
      });
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
          state.world.crisisClues = clamp(state.world.crisisClues + 1, 0, 5);
          state.stats.intel += 3;
          clampStats(state);
          pushLog(state, 'crisis', cw.clueFoundText, {
            title: `Crisis Clue Uncovered (${state.world.crisisClues}/5)`,
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

      if (state.rank === 'civilian') {
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
        state.warHistory.push({
          warNumber: warNum,
          ageAtStart: state.age,
          rankAtStart: 'civilian',
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
      pushLog(
        state,
        isCrisisWar ? 'crisis' : 'war',
        `You march into ${isCrisisWar ? 'the Endgame Crisis War' : `Great Shinobi War #${warNum}`} via the ${approach === 'front' ? 'contested front' : 'reconnaissance flank'}. ${state.war.enemies.length} rival shinobi operate across the 14-day sector.`,
        { title: isCrisisWar ? `Endgame Crisis War #${warNum} (14 Days)` : `Great Shinobi War #${warNum} (14 Days)` },
      );
      queueWarStart(state.war);
      break;
    }

    case 'war_campaign_choice': {
      const isCrisisWar = Boolean(decision.meta?.isCrisisWar);
      const approach = (decision.meta?.approach === 'flank' ? 'flank' : 'front') as 'front' | 'flank';
      const warNum = Number(decision.meta?.warNum ?? state.world.eraNumber);
      const proj = computeCombatProjection(state);

      const clueBonus = isCrisisWar ? state.world.crisisClues * 7 : 0;
      const rankRiskMod = state.rank === 'genin' ? -12 : state.rank === 'jonin' ? 8 : 0;
      const difficulty = isCrisisWar ? 86 : approach === 'front' ? 68 : 56;

      let rollScore = proj.score + rankRiskMod + clueBonus + rng.int(-14, 14);
      if (optionId === 'tactical_hold') rollScore += Math.round(state.stats.intel * 0.16);
      if (optionId === 'press_victory') rollScore += Math.round(state.stats.chakra * 0.14);

      if (optionId === 'tactical_retreat') {
        const escaped = state.stats.health * 0.4 + state.stats.intel * 0.4 + rng.int(0, 35) > 52;
        checks.push({ label: 'Tactical Withdrawal', passed: escaped });
        if (!escaped && rng.chance(state.rank === 'genin' ? 0.35 : 0.2)) {
          state.warHistory.push({
            warNumber: warNum,
            ageAtStart: state.age,
            rankAtStart: state.rank,
            isCrisisWar,
            crisisId: isCrisisWar ? state.world.seededCrisis : 'none',
            outcome: 'dead',
            title: `Fallen in War #${warNum}`,
            fieldPromoted: false,
            summary: 'Overtaken during a desperate nighttime retreat.',
          });
          killCharacter(state, `cut down retreating from Great Shinobi War #${warNum}`);
          break;
        }
        state.stats.health -= 12;
        state.stats.will += 2;
        clampStats(state);
        state.warHistory.push({
          warNumber: warNum,
          ageAtStart: state.age,
          rankAtStart: state.rank,
          isCrisisWar,
          crisisId: isCrisisWar ? state.world.seededCrisis : 'none',
          outcome: 'withdrew',
          title: `Retreat from War #${warNum}`,
          fieldPromoted: false,
          summary: 'Pulled back through smoke and fog to live another day.',
        });
        state.phase = 'life';
        state.world.warsSurvived += 1;
        state.world.eraNumber += 1;
        state.world.lastWarAge = state.age;
        state.world.tension = rng.int(12, 26);
        state.world.omenActive = false;
        pushLog(state, 'war', `You escape encirclement alive as War #${warNum} grinds toward a bitter armistice.`, {
          deltas: diffStats(before, state.stats),
          checks,
        });
        break;
      }

      const decisiveWin = rollScore >= difficulty + 10;
      const survived = rollScore >= difficulty - 10;
      checks.push({ label: isCrisisWar ? 'Crisis Climax Clash' : 'Warfront Survival Clash', passed: survived });

      if (!survived) {
        const deathChance = optionId === 'press_victory' ? (isCrisisWar ? 0.55 : 0.42) : 0.26;
        if (rng.chance(deathChance) || state.stats.health <= 18) {
          state.warHistory.push({
            warNumber: warNum,
            ageAtStart: state.age,
            rankAtStart: state.rank,
            isCrisisWar,
            crisisId: isCrisisWar ? state.world.seededCrisis : 'none',
            outcome: 'dead',
            title: isCrisisWar ? `Fell Against the Crisis (War #${warNum})` : `Fallen in War #${warNum}`,
            fieldPromoted: false,
            summary: 'Held the line on the final night until chakra ran dry.',
          });
          killCharacter(
            state,
            isCrisisWar
              ? `killed fighting the ${state.world.seededCrisis === 'calamity' ? 'Tailed-Beast Calamity' : 'Shadow Mastermind'}`
              : `killed in action during Great Shinobi War #${warNum}`,
          );
          break;
        }
      }

      // Survived the war!
      const damage = decisiveWin ? rng.int(6, 12) : rng.int(14, 24);
      state.stats.health -= damage;
      state.stats.will += decisiveWin ? 6 : 3;
      state.stats.intel += 3;
      state.stats.ryo += decisiveWin ? 16 : 8;
      if (state.stats.health < 28) {
        state.legacyScar = true;
        state.flags.medical_retirement = true;
      }

      // Genin Squad casualties risk if deployed as active Genin on the front
      if (state.team?.active && approach === 'front') {
        const aliveMates = state.team.members.filter((m) => m.role === 'teammate' && m.alive);
        if (aliveMates.length > 0 && rng.chance(0.14)) {
          const fallen = rng.pick(aliveMates);
          fallen.alive = false;
          fallen.fateNote = `Killed in action during Great Shinobi War #${warNum} at age ${fallen.age}.`;
          addLeaning(state, 'vengeance', 2);
          pushLog(
            state,
            'danger',
            `In the smoke of War #${warNum}, squadmate ${fallen.name} takes a lethal blow shielding the flank. Their headband stays in your pocket.`,
          );
        }
      }

      // Field promotion for Genin surviving frontline war!
      let fieldPromoted = false;
      if (state.rank === 'genin' && (decisiveWin || (approach === 'front' && rng.chance(0.45)))) {
        promoteRank(state, 'chunin');
        fieldPromoted = true;
      }

      // Crisis resolution -> True Peace & Kage candidacy
      if (isCrisisWar && (decisiveWin || survived)) {
        state.world.crisisStage = 3;
        state.world.truePeace = true;
        if (state.rank === 'jonin' && state.stats.bonds >= 55 && state.specialStatus !== 'missing_nin') {
          state.specialStatus = 'kage';
          pushLog(
            state,
            'milestone',
            `Having broken the Endgame Crisis, the elders and shinobi of ${VILLAGE_MAP[state.villageId].name} acclaim you as Kage!`,
            { title: 'Acclaimed as Kage' },
          );
        }
      }

      clampStats(state);
      const outcome = decisiveWin ? 'victor' : 'survived';
      const warTitle = isCrisisWar
        ? `Dawn After the ${state.world.seededCrisis === 'calamity' ? 'Calamity' : 'Shadow War'}`
        : decisiveWin
          ? `Hero of Great Shinobi War #${warNum}`
          : `Survivor of Great Shinobi War #${warNum}`;

      state.warHistory.push({
        warNumber: warNum,
        ageAtStart: state.age,
        rankAtStart: fieldPromoted ? 'genin' : state.rank,
        isCrisisWar,
        crisisId: isCrisisWar ? state.world.seededCrisis : 'none',
        outcome,
        title: warTitle,
        fieldPromoted,
        summary: decisiveWin
          ? 'Turned the decisive night clash and returned decorated.'
          : 'Endured fourteen brutal days of mud, fire, and survival.',
      });

      state.phase = 'life';
      state.world.warsSurvived += 1;
      state.world.eraNumber += 1;
      state.world.lastWarAge = state.age;
      state.world.tension = state.world.truePeace ? 5 : rng.int(10, 24);
      state.world.omenActive = false;

      pushLog(
        state,
        isCrisisWar ? 'crisis' : 'milestone',
        `Post-War Aftermath: ${warTitle}. ${fieldPromoted ? 'For valor under fire, you receive a Field Promotion to Chunin! ' : ''}${state.world.truePeace ? 'The continent enters a long Era of True Peace.' : 'An uneasy ceasefire settles across the Five Great Nations as everyday life resumes.'}`,
        { title: warTitle, deltas: diffStats(before, state.stats), checks },
      );

      // If Field Promotion promoted a Genin while squad was active, disband the Genin team!
      if (fieldPromoted && state.team?.active) {
        state.pending = disbandGeninTeam(state, 'player_chunin', [state.name]);
      } else if (state.team?.active && state.team.members.filter((m) => m.role === 'teammate' && m.alive).length === 0) {
        state.pending = disbandGeninTeam(state, 'tragedy', []);
      }
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
        state.team.members.forEach((m) => m.alive && adjustMemberTrust(state, m, opt.trustAllTeam!));
      }
      clampStats(state);
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
