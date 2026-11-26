import {
  ARCHETYPE_AVG,
  ARCHETYPE_PROFILE_MAP,
  buildProceduralEpithet,
  getVillageOccupationWeights,
  LINE_POOL,
  MOTIVE_POOL,
  OCCUPATION_MAP,
  ORIGIN_POOL,
  renderText,
  SKILL_POOL,
  ULTIMATE_POOL,
  WEAKNESS_LABELS,
} from '../data/characters';
import { CLAN_MAP, getClansForVillage, type ClanDef } from '../data/clans';
import { JUTSU_DB, type JutsuDefinition, type JutsuRank } from '../data/jutsu';
import { NINDO_MAP } from '../data/nindo';
import { BLOODLINE_MAP } from '../data/powers';
import { VILLAGE_MAP } from '../data/villages';
import { clamp } from './powers';
import type { SeededRng } from './rng';
import type {
  ChakraElement,
  CombatArchetype,
  GameState,
  NindoId,
  NpcGoal,
  NpcKit,
  NpcMotivation,
  NpcOccupation,
  NpcPersonality,
  NpcSchedule,
  NpcTactic,
  ShinobiRank,
  SpecialStatus,
  TraitId,
  VillageId,
  WorldNpc,
  WorldNpcIdentity,
  WorldSimState,
} from './types';

const ALL_ELEMENTS: readonly ChakraElement[] = ['fire', 'wind', 'lightning', 'earth', 'water'];
const RARE_ELEMENTAL_MUTATIONS = ['hyoton', 'yoton', 'jiton'] as const;
const RARE_MUTATION_CHANCE = 0.003;
const NINDO_IDS: readonly NindoId[] = [
  'never_go_back',
  'protect_bonds',
  'become_kage',
  'avenge_clan',
  'results_first',
];
const JUTSU_RANK_ORDER: Record<JutsuRank, number> = { D: 1, C: 2, B: 3, A: 4, S: 5 };

export interface GeneratorContext {
  birthYear: number;
  age: number;
  name?: string;
  worldSim?: WorldSimState;
}

export interface CharacterSpec {
  id?: string;
  villageId: VillageId;
  age: number;
  occupation?: NpcOccupation;
  clanId?: string | null;
  allowNoClan?: boolean;
  rank?: ShinobiRank;
  specialStatus?: SpecialStatus;
  roleTitle?: string;
  roleBias?: 'kage' | 'shadow' | 'clan_head' | 'peer';
  sex?: 'M' | 'F';
  name?: string;
  surnameOverride?: string;
  element?: ChakraElement;
  specialty?: string;
  archetype?: CombatArchetype;
  traits?: readonly TraitId[];
  personalityBias?: Partial<NpcPersonality>;
  lodTier?: 'L1' | 'L2';
  observed?: boolean;
  usedNames?: Set<string>;
  registerInWorld?: boolean;
}

/**
 * Single unified shinobi/civilian name generator across the entire codebase.
 */
export function generateUniquePersonName(
  villageId: VillageId,
  clanId: string | null,
  sex: 'M' | 'F',
  usedNames: Set<string>,
  rng: SeededRng,
  surnameOverride?: string,
): string {
  const v = VILLAGE_MAP[villageId];
  const clan = clanId ? CLAN_MAP[clanId] : null;
  const firstPool = sex === 'M' ? v.maleNames : v.femaleNames;
  for (let i = 0; i < 14; i++) {
    const first = rng.pick(firstPool);
    const last = surnameOverride ?? (clan ? clan.surname : rng.pick(v.surnames));
    const full = `${first} ${last}`;
    if (!usedNames.has(full)) {
      usedNames.add(full);
      return full;
    }
  }
  const fallback = `${rng.pick(firstPool)} ${surnameOverride ?? (clan ? clan.surname : rng.pick(v.surnames))}`;
  usedNames.add(fallback);
  return fallback;
}

export function inferArchetypeFromSpecialty(specialty: string): CombatArchetype {
  switch (specialty) {
    case 'kenjutsu':
    case 'strong_fist':
    case 'gentle_fist':
      return 'vanguard';
    case 'shurikenjutsu':
    case 'wind_release':
    case 'fire_release':
      return 'marksman';
    case 'lightning_release':
    case 'space_time':
      return 'striker';
    case 'shadow_clone':
    case 'water_release':
    case 'summoning':
      return 'skirmisher';
    case 'fuinjutsu':
    case 'barrier':
    case 'puppetry':
    case 'trap_craft':
    case 'medical':
      return 'artificer';
    case 'silent_killing':
    case 'genjutsu':
    case 'interrogation':
    case 'sensory':
      return 'infiltrator';
    case 'earth_release':
    case 'senjutsu':
      return 'juggernaut';
    default:
      return 'skirmisher';
  }
}

function defaultSpecialtyForArchetype(archetype: CombatArchetype, element: ChakraElement): string {
  switch (archetype) {
    case 'vanguard':
      return 'kenjutsu';
    case 'marksman':
      return element === 'fire' || element === 'wind' ? `${element}_release` : 'shurikenjutsu';
    case 'striker':
      return element === 'lightning' ? 'lightning_release' : `${element}_release`;
    case 'skirmisher':
      return element === 'water' ? 'water_release' : 'shadow_clone';
    case 'artificer':
      return 'fuinjutsu';
    case 'infiltrator':
      return 'silent_killing';
    case 'juggernaut':
      return element === 'earth' ? 'earth_release' : 'strong_fist';
    case 'rogue_s':
      return `${element}_release`;
  }
}

export function buildPersonality(
  rng: SeededRng,
  bias?: Partial<NpcPersonality>,
): NpcPersonality {
  return {
    loyal: clamp(rng.int(28, 78) + (bias?.loyal ?? 0), 5, 98),
    ambitious: clamp(rng.int(25, 78) + (bias?.ambitious ?? 0), 5, 98),
    cautious: clamp(rng.int(25, 78) + (bias?.cautious ?? 0), 5, 98),
    cruel: clamp(rng.int(12, 62) + (bias?.cruel ?? 0), 5, 98),
    compassionate: clamp(rng.int(22, 78) + (bias?.compassionate ?? 0), 5, 98),
  };
}

/**
 * Derives 2 TraitIds deterministically from the 2 strongest personality dimensions.
 */
export function deriveTraitsFromPersonality(p: NpcPersonality): TraitId[] {
  const scored: { trait: TraitId; val: number }[] = [
    { trait: 'loyalty', val: p.loyal },
    { trait: 'ambition', val: p.ambitious },
    { trait: 'compassion', val: p.compassionate },
    { trait: 'honor', val: Math.round((p.loyal + p.cautious + (100 - p.cruel)) / 3) },
    { trait: 'freedom', val: Math.round(((100 - p.loyal) + (100 - p.cautious) + p.ambitious) / 3) },
  ];
  scored.sort((a, b) => b.val - a.val);
  return [scored[0].trait, scored[1].trait];
}

export function pickMotivationFromPersonality(
  p: NpcPersonality,
  role: 'kage' | 'shadow' | 'clan_head' | 'peer',
  rng: SeededRng,
): NpcMotivation {
  if (role === 'kage') {
    return p.compassionate >= 60 ? 'peace_reformer' : 'protect_village';
  }
  if (role === 'shadow') {
    return p.cruel >= 55 || p.ambitious >= 65 ? 'shadow_control' : 'protect_village';
  }
  if (role === 'clan_head') {
    return p.ambitious >= 65 ? 'restore_clan' : p.loyal >= 65 ? 'protect_village' : 'attain_kage';
  }
  if (p.ambitious >= 75) return rng.chance(0.5) ? 'attain_kage' : 'seek_power';
  if (p.compassionate >= 70) return rng.chance(0.5) ? 'peace_reformer' : 'protect_village';
  if (p.cruel >= 68) return 'seek_power';
  if (p.loyal <= 32) return 'wanderer_freedom';
  return rng.pick(['protect_village', 'restore_clan', 'seek_power', 'peace_reformer']);
}

export function pickNindo(
  p: NpcPersonality,
  villageId: VillageId,
  rng: SeededRng,
): { id: NindoId; maxim: string } {
  let id: NindoId = rng.pick(NINDO_IDS);
  if (p.compassionate >= 68 || p.loyal >= 75) id = 'protect_bonds';
  else if (p.ambitious >= 76) id = 'become_kage';
  else if (p.cruel >= 64) id = 'results_first';
  else if (p.cautious >= 72) id = 'never_go_back';

  const def = NINDO_MAP[id];
  const kTitle = VILLAGE_MAP[villageId].kageTitle;
  return {
    id,
    maxim: def ? def.vow.replace(/\{kage\}/g, kTitle) : 'Never abandon the path ahead.',
  };
}

function tacticFromPersonality(p: NpcPersonality, archetype: CombatArchetype): NpcTactic {
  if (archetype === 'infiltrator' || archetype === 'rogue_s') {
    return p.cautious >= 58 ? 'cunning' : 'hunter';
  }
  if (p.cruel >= 64 && p.ambitious >= 60) return 'hunter';
  if (p.cautious >= 66) return 'defensive';
  if (p.ambitious >= 72 && p.cautious < 45) return 'reckless';
  if (p.loyal >= 68 && p.cruel < 45) return 'proud';
  return ARCHETYPE_PROFILE_MAP[archetype].tactic;
}

function clanPoliticalBiasToPersonality(bias: ClanDef['politicalBias']): Partial<NpcPersonality> {
  switch (bias) {
    case 'loyalist':
      return { loyal: 16, compassionate: 6 };
    case 'proud':
      return { ambitious: 12, loyal: 6, cautious: 4 };
    case 'reformist':
      return { compassionate: 14, cautious: 8, cruel: -8 };
    case 'militarist':
      return { ambitious: 14, cruel: 8, cautious: -6 };
    case 'shadow':
      return { cautious: 14, cruel: 12, compassionate: -10 };
  }
}

function maxJutsuRankForIdentity(
  id: Pick<WorldNpcIdentity, 'occupation' | 'rank' | 'specialStatus' | 'archetype' | 'powerScore'>,
): number {
  if (id.occupation !== 'shinobi' && id.occupation !== 'samurai') return 1; // D-rank basics only
  if (id.specialStatus === 'kage' || id.archetype === 'rogue_s' || id.powerScore >= 84) return 5; // S
  if (id.rank === 'jonin') return 4; // A
  if (id.rank === 'chunin') return 3; // B
  if (id.rank === 'genin') return 2; // C
  return 1; // D
}

const NPC_BASE_JUTSU_POOL: readonly JutsuDefinition[] = JUTSU_DB.filter(
  (j) => !j.modeId && !j.requires.mangekyoArtId,
);
const ELIGIBLE_JUTSU_CACHE = new Map<string, JutsuDefinition[]>();

/**
 * Strictly filters JUTSU_DB so every jutsu an NPC starts with or learns satisfies `requires`.
 * Memoized by canonical requirement tuple for O(1) repeated lookups during world generation.
 */
export function getEligibleJutsuForNpc(
  id: Pick<
    WorldNpcIdentity,
    'occupation' | 'rank' | 'specialStatus' | 'archetype' | 'element' | 'specialty' | 'clanId' | 'bloodlineId' | 'powerScore'
  >,
): JutsuDefinition[] {
  if (id.occupation !== 'shinobi' && id.occupation !== 'samurai') return [];
  const maxRankVal = maxJutsuRankForIdentity(id);
  const allowForbidden = id.specialStatus === 'missing_nin' || id.archetype === 'rogue_s';
  const cacheKey = `${id.occupation}|${maxRankVal}|${allowForbidden ? 1 : 0}|${id.element}|${id.specialty}|${id.clanId ?? ''}|${id.bloodlineId ?? ''}`;
  const cached = ELIGIBLE_JUTSU_CACHE.get(cacheKey);
  if (cached) return cached;

  const elemDisc = `${id.element}_release`;
  const ownedDiscs = new Set<string>([id.specialty, elemDisc]);
  if (id.occupation === 'samurai') ownedDiscs.add('kenjutsu');

  const result = NPC_BASE_JUTSU_POOL.filter((j) => {
    if (JUTSU_RANK_ORDER[j.rank] > maxRankVal) return false;
    if (j.forbidden && !allowForbidden) return false;
    if (j.requires.hidenId && (!id.clanId || j.requires.clanId !== id.clanId)) return false;
    if (j.requires.clanId && j.requires.clanId !== id.clanId) return false;
    if (j.requires.bloodlineId && j.requires.bloodlineId !== id.bloodlineId) return false;
    if (j.requires.requiresContractOrDiscipline && id.specialty !== 'summoning') return false;

    const reqDisc = j.requires.disciplineId;
    const altDisc = j.requires.altDisciplineId;
    if (reqDisc && !ownedDiscs.has(reqDisc) && !(altDisc && ownedDiscs.has(altDisc))) {
      return false;
    }

    // Element coherence: elemental jutsu must match person's element unless unlocked by their own bloodline
    if (j.element && j.element !== id.element && (!j.requires.bloodlineId || j.requires.bloodlineId !== id.bloodlineId)) {
      return false;
    }
    return true;
  });

  if (ELIGIBLE_JUTSU_CACHE.size < 2048) {
    ELIGIBLE_JUTSU_CACHE.set(cacheKey, result);
  }
  return result;
}

function pickInitialJutsuIds(
  id: Pick<
    WorldNpcIdentity,
    'occupation' | 'rank' | 'specialStatus' | 'archetype' | 'element' | 'specialty' | 'clanId' | 'bloodlineId' | 'powerScore'
  >,
  rng: SeededRng,
): string[] {
  const pool = getEligibleJutsuForNpc(id);
  if (pool.length === 0) return [];

  // Prefer signature discipline / clan / bloodline / element jutsu over basic academy fillers
  const specialized = pool.filter(
    (j) =>
      Boolean(j.requires.clanId) ||
      Boolean(j.requires.bloodlineId) ||
      j.requires.disciplineId === id.specialty ||
      j.element === id.element,
  );
  const targetCount = id.rank === 'jonin' || id.specialStatus === 'kage' ? 3 : 2;
  const chosen: string[] = [];
  const used = new Set<string>();

  const primary = specialized.length > 0 ? [...specialized] : [...pool];
  while (chosen.length < targetCount && primary.length > 0) {
    const idx = Math.floor(rng.next() * primary.length);
    const pick = primary.splice(idx, 1)[0];
    if (!used.has(pick.id)) {
      used.add(pick.id);
      chosen.push(pick.id);
    }
  }
  const rest = pool.filter((j) => !used.has(j.id));
  while (chosen.length < targetCount && rest.length > 0) {
    const idx = Math.floor(rng.next() * rest.length);
    const pick = rest.splice(idx, 1)[0];
    chosen.push(pick.id);
  }
  return chosen;
}

/**
 * Single canonical combat ranks formula shared by Combat, War, and Chunin Exam:
 *   ranks = (ARCHETYPE_AVG[archetype] + statBias) * potential * rankFactor * ageFactor
 */
export function computeRanksFromIdentity(
  id: Pick<WorldNpcIdentity, 'occupation' | 'rank' | 'specialStatus' | 'archetype' | 'age' | 'potential' | 'statBias'>,
): [number, number, number, number, number] {
  const base = ARCHETYPE_AVG[id.archetype] ?? ARCHETYPE_AVG.skirmisher;
  const bias = id.statBias ?? [0, 0, 0, 0, 0];
  const potential = clamp(id.potential ?? 1.0, 0.65, 1.25);

  let rankFactor = 1.0;
  if (id.occupation !== 'shinobi' && id.occupation !== 'samurai') {
    rankFactor = 0.45;
  } else if (id.archetype === 'rogue_s') {
    rankFactor = 1.0;
  } else if (id.specialStatus === 'kage') {
    rankFactor = 1.15;
  } else if (id.rank === 'civilian' || id.rank === 'academy') {
    rankFactor = 0.55;
  } else if (id.rank === 'genin') {
    rankFactor = 0.7;
  } else if (id.rank === 'chunin') {
    rankFactor = 0.9;
  } else {
    rankFactor = 1.08;
  }

  const ageFactor = id.age > 50 ? Math.max(0.75, 1 - (id.age - 50) * 0.01) : 1.0;
  const mult = potential * rankFactor * ageFactor;

  return [
    Math.round(clamp((base[0] + bias[0]) * mult, 1.0, 6.0) * 10) / 10,
    Math.round(clamp((base[1] + bias[1]) * mult, 1.0, 6.0) * 10) / 10,
    Math.round(clamp((base[2] + bias[2]) * mult, 1.0, 6.0) * 10) / 10,
    Math.round(clamp((base[3] + bias[3]) * mult, 1.0, 6.0) * 10) / 10,
    Math.round(clamp((base[4] + bias[4]) * mult, 1.0, 6.0) * 10) / 10,
  ];
}

export function computePowerScoreFromRanks(ranks: readonly [number, number, number, number, number]): number {
  const avg = (ranks[0] + ranks[1] + ranks[2] + ranks[3] + ranks[4]) / 5;
  return clamp(Math.round(avg * 18), 10, 99);
}

export function assignEpithetIfEligible(npc: WorldNpc, rng: SeededRng): string | undefined {
  const id = npc.identity;
  if (id.epithet) return id.epithet;
  const isCombatant = id.occupation === 'shinobi' || id.occupation === 'samurai';
  if (!isCombatant) return undefined;
  const hasRankRep =
    id.specialStatus === 'kage' ||
    id.specialStatus === 'missing_nin' ||
    id.rank === 'jonin' ||
    (id.rank === 'chunin' && id.powerScore >= 52);
  if (!hasRankRep) return undefined;
  id.epithet = buildProceduralEpithet(id.element, id.villageId, id.archetype, rng);
  return id.epithet;
}

/**
 * G4 Progression: teaches an NPC 1 new qualifying jutsu on rank-up or training completion.
 */
export function learnNewNpcJutsu(npc: WorldNpc, rng: SeededRng): string | null {
  const id = npc.identity;
  const existing = new Set(id.jutsuIds ?? []);
  const eligible = getEligibleJutsuForNpc(id).filter((j) => !existing.has(j.id));
  if (eligible.length === 0) return null;

  // Prefer higher-rank jutsu appropriate for the NPC's new tier
  eligible.sort((a, b) => JUTSU_RANK_ORDER[b.rank] - JUTSU_RANK_ORDER[a.rank]);
  const topSlice = eligible.slice(0, Math.min(5, eligible.length));
  const picked = rng.pick(topSlice);
  if (!id.jutsuIds) id.jutsuIds = [];
  id.jutsuIds.push(picked.id);
  return picked.id;
}

/**
 * G4 Progression: yearly growth driven by `potential` (replaces random powerScore +1..3).
 * Raises `statBias` by 0..0.1/yr up to age 34, declines gently after 62, and recomputes `powerScore`.
 */
export function applyYearlyNpcGrowth(npc: WorldNpc, rng: SeededRng): void {
  const id = npc.identity;
  const isCombatant = id.occupation === 'shinobi' || id.occupation === 'samurai';
  if (isCombatant && id.age <= 34) {
    const statIdx = rng.int(0, 4);
    const delta = Number((rng.next() * 0.1 * id.potential).toFixed(3));
    id.statBias[statIdx] = Number(clamp(id.statBias[statIdx] + delta, -0.6, 0.9).toFixed(3));
  } else if (id.age >= 62) {
    const statIdx = rng.int(0, 4);
    const delta = Number((rng.next() * 0.05).toFixed(3));
    id.statBias[statIdx] = Number(clamp(id.statBias[statIdx] - delta, -0.8, 0.9).toFixed(3));
  }
  const ranks = computeRanksFromIdentity(id);
  id.powerScore = computePowerScoreFromRanks(ranks);
}

/**
 * G4 Permanent Injury: reduces potential by -0.05 and logs an injury memory.
 */
export function applyPermanentNpcInjury(npc: WorldNpc, year: number, reason: string): void {
  const id = npc.identity;
  id.potential = Number(clamp(id.potential - 0.05, 0.65, 1.25).toFixed(3));
  id.permanentInjuries = (id.permanentInjuries ?? 0) + 1;
  id.powerScore = computePowerScoreFromRanks(computeRanksFromIdentity(id));
  npc.memory.push({
    year,
    age: id.age,
    tag: 'loss',
    summary: `Sustained a lasting injury (${reason}), limiting future peak growth.`,
    impact: -6,
  });
  if (npc.memory.length > 14) npc.memory.splice(0, npc.memory.length - 14);
}

function buildKit(
  personHeader: { name: string; sex: 'M' | 'F'; villageId: VillageId },
  archetype: CombatArchetype,
  element: ChakraElement,
  tactic: NpcTactic,
  rng: SeededRng,
): NpcKit {
  const elemSkills = SKILL_POOL[archetype][element] ?? [];
  const anySkills = SKILL_POOL[archetype].any ?? ARCHETYPE_PROFILE_MAP[archetype].skills;
  const skillPool = elemSkills.length >= 2 ? [...elemSkills] : [...elemSkills, ...anySkills];
  const s1 = rng.pick(skillPool);
  const restSkills = skillPool.filter((s) => s.name !== s1.name);
  const s2 = restSkills.length > 0 ? rng.pick(restSkills) : anySkills[Math.min(1, anySkills.length - 1)];

  const elemUlts = ULTIMATE_POOL[archetype][element] ?? [];
  const anyUlts = ULTIMATE_POOL[archetype].any ?? [ARCHETYPE_PROFILE_MAP[archetype].ultimate];
  const chosenUlt = rng.pick(elemUlts.length > 0 ? elemUlts : anyUlts);

  const tacticLines = LINE_POOL[archetype][tactic] ?? [];
  const anyLines = LINE_POOL[archetype].any ?? [ARCHETYPE_PROFILE_MAP[archetype].lines];
  const rawLines = rng.pick(tacticLines.length > 0 ? tacticLines : anyLines);

  return {
    skills: [{ ...s1 }, { ...s2 }],
    ultimate: { ...chosenUlt },
    tactic,
    lines: {
      meet: renderText(personHeader, rawLines.meet),
      clash: renderText(personHeader, rawLines.clash),
      win: renderText(personHeader, rawLines.win),
      fall: renderText(personHeader, rawLines.fall),
    },
  };
}

function initialScheduleForNpc(
  occupation: NpcOccupation,
  rank: ShinobiRank,
  specialStatus: SpecialStatus,
  age: number,
  specialty: string,
): NpcSchedule {
  if (specialStatus === 'missing_nin') return 'wandering_exile';
  if (specialStatus === 'kage') return 'kage_office';
  if (occupation === 'medic') return 'hospital_ward';
  if (occupation === 'teacher') return 'academy_drills';
  if (occupation !== 'shinobi' && occupation !== 'samurai') {
    return age < 14 ? 'home' : 'work_trade';
  }
  if (rank === 'academy' || age < 12) return 'academy_drills';
  if (specialStatus === 'anbu') return 'anbu_covert';
  if (specialty === 'medical') return 'hospital_ward';
  if (rank === 'genin') return 'training_ground';
  return 'border_patrol';
}

function initialGoalForNpc(
  occupation: NpcOccupation,
  rank: ShinobiRank,
  specialStatus: SpecialStatus,
  age: number,
  clanId: string | null,
  motivation: NpcMotivation,
  villageId: VillageId,
): NpcGoal {
  const vName = VILLAGE_MAP[villageId].name;
  if (specialStatus === 'missing_nin') {
    return {
      type: 'master_art',
      label: 'Perfect forbidden jutsu in exile',
      progress: 15,
      startedAge: age,
    };
  }
  if (occupation !== 'shinobi' && occupation !== 'samurai') {
    const occLabel = OCCUPATION_MAP[occupation].label.toLowerCase();
    return {
      type: clanId ? 'protect_clan' : 'master_art',
      label: age < 14 ? `Grow up safely in ${vName}` : `Build a thriving ${occLabel} livelihood in ${vName}`,
      progress: 15,
      startedAge: age,
    };
  }
  if (rank === 'genin') {
    return { type: 'pass_chunin', label: 'Clear the Chunin Exams', progress: 15, startedAge: age };
  }
  if (rank === 'chunin') {
    return { type: 'reach_jonin', label: 'Earn promotion to Jonin', progress: 15, startedAge: age };
  }
  if (motivation === 'attain_kage') {
    return { type: 'seek_kage', label: `Contend for ${VILLAGE_MAP[villageId].kageTitle} succession`, progress: 15, startedAge: age };
  }
  if (motivation === 'peace_reformer') {
    return { type: 'broker_peace', label: 'Ease border tensions across the Great Nations', progress: 15, startedAge: age };
  }
  if (motivation === 'restore_clan' && clanId) {
    return { type: 'protect_clan', label: `Elevate the ${CLAN_MAP[clanId]?.name ?? 'clan'}`, progress: 15, startedAge: age };
  }
  return { type: 'master_art', label: `Serve ${vName} on the frontier`, progress: 15, startedAge: age };
}

/**
 * Single canonical 13-step procedural CharacterGenerator.
 * Produces a coherent, persistent WorldNpc whose occupation, clan, name, element, bloodline,
 * personality, traits, motivation, fighting style, potential, statBias, weakness, jutsu kit,
 * and background interlock cleanly and are NEVER re-rolled.
 */
export function generateCharacter(
  ctx: GameState | GeneratorContext,
  spec: CharacterSpec,
  rng: SeededRng,
): WorldNpc {
  const village = VILLAGE_MAP[spec.villageId];
  const worldSim = ctx.worldSim;
  const currentYear = ctx.birthYear + ctx.age;

  // Step 1: Occupation (village weights + age)
  let occupation: NpcOccupation = spec.occupation ?? 'shinobi';
  if (!spec.occupation) {
    if (spec.rank && spec.rank !== 'civilian' && spec.rank !== 'academy') {
      occupation = spec.villageId === 'iron' ? 'samurai' : 'shinobi';
    } else if (spec.archetype === 'rogue_s' || spec.specialStatus === 'kage' || spec.specialStatus === 'anbu' || spec.specialStatus === 'missing_nin') {
      occupation = spec.villageId === 'iron' ? 'samurai' : 'shinobi';
    } else {
      const weights = getVillageOccupationWeights(spec.villageId);
      occupation = rng.weighted(weights).id;
    }
  }
  // Enforce Land of Iron samurai rule
  if (occupation === 'samurai' && spec.villageId !== 'iron') {
    occupation = 'shinobi';
  }
  const occDef = OCCUPATION_MAP[occupation];

  // Determine canonical rank aligned with occupation + age
  let rank: ShinobiRank = spec.rank ?? 'civilian';
  if (!spec.rank) {
    if (!occDef.isCombatant) {
      rank = 'civilian';
    } else if (spec.age < 7) {
      rank = 'civilian';
    } else if (spec.age < 12) {
      rank = 'academy';
    } else if (spec.age < 16) {
      rank = 'genin';
    } else if (spec.age < 24) {
      rank = rng.chance(0.28) ? 'jonin' : 'chunin';
    } else {
      rank = rng.chance(0.55) ? 'jonin' : 'chunin';
    }
  }
  const specialStatus: SpecialStatus = spec.specialStatus ?? 'none';

  // Step 2: Clan (village clans matched to occupation; samurai/guild restricted properly)
  let clanId: string | null = spec.clanId !== undefined ? spec.clanId : null;
  if (spec.clanId === undefined && !spec.allowNoClan) {
    const villageClans = getClansForVillage(spec.villageId).filter((c) => {
      if (c.id === 'iron_samurai_house') return occupation === 'samurai';
      if (c.id === 'waves_guild') return occupation === 'merchant' || occupation === 'artisan';
      return true;
    });
    const clanChance = occDef.isCombatant ? 0.42 : occupation === 'merchant' && spec.villageId === 'waves' ? 0.45 : 0.16;
    if (villageClans.length > 0 && rng.chance(clanChance)) {
      clanId = rng.pick(villageClans).id;
    }
  }
  const clan = clanId ? CLAN_MAP[clanId] ?? null : null;

  // Step 3: Name (unified generateUniquePersonName; clan surname automatically applied)
  let usedNames = spec.usedNames;
  if (!usedNames) {
    usedNames = new Set<string>();
    if (ctx.name) usedNames.add(ctx.name);
    if (worldSim) {
      for (const n of worldSim.npcs) usedNames.add(n.identity.name);
    }
  }
  const sex: 'M' | 'F' = spec.sex ?? (rng.chance(0.52) ? 'M' : 'F');
  const name =
    spec.name ??
    generateUniquePersonName(spec.villageId, clan?.id ?? null, sex, usedNames, rng, spec.surnameOverride);
  usedNames.add(name);

  // Step 4: Element (same rule as player: 65% clan -> 55% village -> random)
  const element: ChakraElement =
    spec.element ??
    (clan?.preferredElement && rng.chance(0.65)
      ? clan.preferredElement
      : rng.chance(0.55)
        ? village.dominantElement
        : rng.pick(ALL_ELEMENTS));

  // Step 5: Bloodline (canon-gated roll via clan.bloodlineChance; rare 0.3% elemental KG otherwise)
  let bloodlineId: string | null = null;
  if (clan?.bloodlineId) {
    const chance = clan.bloodlineChance ?? 0.5;
    if (rng.chance(chance) && BLOODLINE_MAP[clan.bloodlineId]) {
      bloodlineId = clan.bloodlineId;
    }
  } else if (occDef.isCombatant && rng.chance(RARE_MUTATION_CHANCE)) {
    bloodlineId = rng.pick(RARE_ELEMENTAL_MUTATIONS);
  }

  // Step 6: Personality (base + clan politicalBias + occupation bias + spec bias)
  const clanBias = clan ? clanPoliticalBiasToPersonality(clan.politicalBias) : {};
  const mergedBias: Partial<NpcPersonality> = {
    loyal: (clanBias.loyal ?? 0) + (occDef.personalityBias.loyal ?? 0) + (spec.personalityBias?.loyal ?? 0),
    ambitious: (clanBias.ambitious ?? 0) + (occDef.personalityBias.ambitious ?? 0) + (spec.personalityBias?.ambitious ?? 0),
    cautious: (clanBias.cautious ?? 0) + (occDef.personalityBias.cautious ?? 0) + (spec.personalityBias?.cautious ?? 0),
    cruel: (clanBias.cruel ?? 0) + (occDef.personalityBias.cruel ?? 0) + (spec.personalityBias?.cruel ?? 0),
    compassionate:
      (clanBias.compassionate ?? 0) +
      (occDef.personalityBias.compassionate ?? 0) +
      (spec.personalityBias?.compassionate ?? 0),
  };
  const personality = buildPersonality(rng, mergedBias);

  // Step 7: Traits derived from the 2 highest personality axes
  const traits: TraitId[] = spec.traits ? [...spec.traits] : deriveTraitsFromPersonality(personality);

  // Step 8: Motivation & Nindo
  const roleBias =
    spec.roleBias ??
    (specialStatus === 'kage' ? 'kage' : specialStatus === 'anbu' ? 'shadow' : 'peer');
  const motivation = pickMotivationFromPersonality(personality, roleBias, rng);
  const nindo = pickNindo(personality, spec.villageId, rng);

  // Step 9: Fighting style (specialty -> archetype)
  let specialty: string;
  if (spec.specialty) {
    specialty = spec.specialty;
  } else if (spec.archetype) {
    specialty = defaultSpecialtyForArchetype(spec.archetype, element);
  } else if (occupation === 'samurai') {
    specialty = 'kenjutsu';
  } else if (!occDef.isCombatant) {
    specialty = occDef.defaultSpecialty;
  } else if (clan && clan.signatureDisciplines.length > 0 && rng.chance(0.75)) {
    specialty = rng.pick(clan.signatureDisciplines);
  } else if (village.perk.disciplineId && rng.chance(0.35)) {
    specialty = village.perk.disciplineId;
  } else {
    specialty = `${element}_release`;
  }
  const archetype: CombatArchetype =
    spec.archetype ?? (specialStatus === 'missing_nin' && rank === 'jonin' && rng.chance(0.35) ? 'rogue_s' : inferArchetypeFromSpecialty(specialty));

  // Step 10: Potential (0.80..1.20) & statBias (±0.4 per stat across 5 stats)
  const potential = Math.round((0.8 + rng.next() * 0.4) * 1000) / 1000;
  const statBias: [number, number, number, number, number] = [
    Math.round((rng.next() * 2 - 1) * 40) / 100,
    Math.round((rng.next() * 2 - 1) * 40) / 100,
    Math.round((rng.next() * 2 - 1) * 40) / 100,
    Math.round((rng.next() * 2 - 1) * 40) / 100,
    Math.round((rng.next() * 2 - 1) * 40) / 100,
  ];

  // Step 11: Weakness (lowest stat after bias)
  const archAvg = ARCHETYPE_AVG[archetype];
  let lowestIdx = 0;
  let lowestVal = archAvg[0] + statBias[0];
  for (let i = 1; i < 5; i++) {
    const v = archAvg[i] + statBias[i];
    if (v < lowestVal) {
      lowestVal = v;
      lowestIdx = i;
    }
  }
  const weakness = WEAKNESS_LABELS[lowestIdx];

  // Step 12: Initial jutsu kit (strictly matching requires) + pooled skills/ultimate/lines
  const tactic = tacticFromPersonality(personality, archetype);
  const personHeader = { name, sex, villageId: spec.villageId };
  const kit = buildKit(personHeader, archetype, element, tactic, rng);

  const previewRanks = computeRanksFromIdentity({
    occupation,
    rank,
    specialStatus,
    archetype,
    age: spec.age,
    potential,
    statBias,
  });
  const powerScore = computePowerScoreFromRanks(previewRanks);
  const jutsuIds = pickInitialJutsuIds(
    {
      occupation,
      rank,
      specialStatus,
      archetype,
      element,
      specialty,
      clanId: clan?.id ?? null,
      bloodlineId,
      powerScore,
    },
    rng,
  );

  // Step 13: Background (clan ethos + village culture + origin + motive, rendered with placeholders)
  const rawOrigin = rng.pick(ORIGIN_POOL[archetype]);
  const rawMotive = rng.pick(MOTIVE_POOL[motivation]);
  const renderedOrigin = renderText(personHeader, rawOrigin);
  const renderedMotive = renderText(personHeader, rawMotive);
  const background = occDef.isCombatant
    ? clan
      ? `${renderedOrigin} Raised under the ${clan.name} (${clan.ethos}) in ${village.name}.`
      : `${renderedOrigin} Shaped by ${village.name}'s ethos: ${village.culture}`
    : `${name} works as a ${occDef.label.toLowerCase()} in ${village.name}. ${village.culture}`;

  const roleTitle =
    spec.roleTitle ??
    (specialStatus === 'kage'
      ? village.kageTitle
      : specialStatus === 'missing_nin'
        ? 'Missing-Nin Rogue'
        : occDef.isCombatant
          ? rank === 'jonin'
            ? `Village Jonin`
            : rank === 'chunin'
              ? `Village Chunin`
              : rank === 'genin'
                ? `Village Genin`
                : rank === 'academy'
                  ? 'Academy Cadet'
                  : rng.pick(occDef.roleTitles)
          : rng.pick(occDef.roleTitles));

  const seq = worldSim ? worldSim.nextNpcSeq++ : Math.floor(rng.next() * 1e7);
  const id = spec.id ?? `wnpc_${seq}`;

  const identity: WorldNpcIdentity = {
    id,
    name,
    sex,
    age: spec.age,
    villageId: spec.villageId,
    homeVillageId: spec.villageId,
    clanId: clan?.id ?? null,
    occupation,
    rank,
    specialStatus,
    roleTitle,
    element,
    specialty,
    archetype,
    bloodlineId,
    traits,
    potential,
    statBias,
    weakness,
    jutsuIds,
    kit,
    background,
    powerScore,
    alive: true,
    observed: Boolean(spec.observed),
    permanentInjuries: 0,
    kills: 0,
  };

  const npc: WorldNpc = {
    identity,
    personality,
    motivation,
    nindo: {
      id: nindo.id,
      maxim: renderedMotive,
    },
    relationships: {},
    memory: [
      {
        year: currentYear,
        age: spec.age,
        tag: occDef.isCombatant ? 'politics' : 'bond',
        summary: occDef.isCombatant
          ? `Serves ${village.name} as ${roleTitle}.`
          : `Works as ${roleTitle} in ${village.name}.`,
        impact: 2,
      },
    ],
    schedule: initialScheduleForNpc(occupation, rank, specialStatus, spec.age, specialty),
    knowledge: [],
    currentGoal: initialGoalForNpc(occupation, rank, specialStatus, spec.age, clan?.id ?? null, motivation, spec.villageId),
    cognition: {
      lodTier: spec.lodTier ?? (spec.observed ? 'L1' : 'L2'),
      stress: 12,
      injury: 0,
      lastUtilityTickYear: currentYear,
      familyCrisis: null,
      activePlan: null,
      lastDecision: null,
    },
  };

  assignEpithetIfEligible(npc, rng);

  if (worldSim && spec.registerInWorld !== false) {
    worldSim.npcs.push(npc);
  }
  return npc;
}
