import {
  ARCHETYPE_PROFILE_MAP,
  renderText,
} from '../data/characters';
import { buildShinobiPersona } from './ai';
import {
  applyPermanentNpcInjury,
  applyYearlyNpcGrowth,
  assignEpithetIfEligible,
  computePowerScoreFromRanks,
  computeRanksFromIdentity,
  generateCharacter,
  generateUniquePersonName,
  inferArchetypeFromSpecialty,
  learnNewNpcJutsu,
  type CharacterSpec,
} from './character-generator';
import type {
  ChakraElement,
  CombatArchetype,
  FamilyMember,
  GameState,
  KizunaMember,
  LongGoal,
  NpcOfficialRank,
  NpcTactic,
  ShinobiRank,
  ShortGoal,
  SkillTag,
  SpecialStatus,
  ThreatClass,
  TraitId,
  UltimateDef,
  VillageId,
  WarCompetitor,
  WorldNpc,
  WorldNpcIdentity,
} from './types';

export {
  applyPermanentNpcInjury,
  applyYearlyNpcGrowth,
  assignEpithetIfEligible,
  computePowerScoreFromRanks,
  computeRanksFromIdentity,
  generateCharacter,
  generateUniquePersonName,
  inferArchetypeFromSpecialty,
  learnNewNpcJutsu,
  type CharacterSpec,
};

export interface PersonCombatProfile {
  personId: string;
  name: string;
  epithet: string;
  villageId: VillageId;
  archetype: CombatArchetype;
  tactic: NpcTactic;
  element: ChakraElement;
  officialRank: NpcOfficialRank;
  formerShinobi: boolean;
  threatClass: ThreatClass;
  ranks: [number, number, number, number, number];
  weakness: string;
  traits: TraitId[];
  skills: { name: string; tag: SkillTag; rank: number }[];
  ultimate: UltimateDef;
  motive: string;
  originHint: string;
  lines: {
    meet: string;
    clash: string;
    win: string;
    fall: string;
  };
}

/**
 * Retrieves a person (WorldNpc) by their canonical personId.
 */
export function getPerson(state: GameState, id: string | null | undefined): WorldNpc | null {
  if (!id || !state.worldSim) return null;
  return state.worldSim.npcs.find((n) => n.identity.id === id) ?? null;
}

/**
 * Canonical name lookup for any personId (including `'player'`).
 */
export function personName(state: GameState, id: string | null | undefined): string {
  if (!id) return 'Unknown Shinobi';
  if (id === 'player') return state.name;
  return getPerson(state, id)?.identity.name ?? 'Unknown Shinobi';
}

export function isPersonAlive(state: GameState, personId: string | null | undefined): boolean {
  if (!personId) return false;
  if (personId === 'player') return state.phase !== 'posthumous' && state.phase !== 'ended';
  return getPerson(state, personId)?.identity.alive ?? false;
}

export function getPersonTraits(state: GameState, personId: string | null | undefined): TraitId[] {
  const person = getPerson(state, personId);
  if (!person) return [];
  if (person.identity.traits && person.identity.traits.length > 0) {
    return [...person.identity.traits];
  }
  const arch = person.identity.archetype ?? inferArchetypeFromSpecialty(person.identity.specialty);
  return [...ARCHETYPE_PROFILE_MAP[arch].traits];
}

/**
 * Marks a person as observed by the player so they are permanently protected from culling.
 */
export function markPersonObserved(state: GameState, personId: string | null | undefined): void {
  const person = getPerson(state, personId);
  if (person) {
    person.identity.observed = true;
  }
}

function officialRankForPerson(person: WorldNpc): NpcOfficialRank {
  if (person.identity.specialStatus === 'kage') return 'kage';
  if (person.identity.rank === 'jonin') {
    return person.identity.powerScore >= 78 ? 'jonin' : 'tokubetsu_jonin';
  }
  if (person.identity.rank === 'chunin') return 'chunin';
  return 'genin';
}

/**
 * Vacates any institutional leadership seats (Kage or Clan Head) held by `personId`
 * (which may be an NPC id or `'player'`). Ensures no dead or defected person continues
 * to hold village leadership.
 */
export function vacateSeats(state: GameState, personId: string): void {
  if (!state.worldSim) return;
  for (const vSim of Object.values(state.worldSim.villages)) {
    if (vSim.kageNpcId === personId) {
      vSim.kageNpcId = null;
    }
    for (const cState of vSim.clans) {
      if (cState.headNpcId === personId) {
        cState.headNpcId = null;
      }
    }
  }
  if (personId === 'player') {
    if (state.specialStatus === 'kage') {
      state.specialStatus = 'none';
    }
  } else {
    const npc = getPerson(state, personId);
    if (npc && npc.identity.specialStatus === 'kage') {
      npc.identity.specialStatus = 'none';
    }
  }
}

/**
 * Single canonical death pathway for any person in the simulation.
 * Updates alive/deathAge/deathCause, vacates Kage/Clan Head seats, records memories
 * on the deceased & close bonds, and logs notable deaths into worldSim.history.
 */
export function killPerson(
  state: GameState,
  personId: string,
  age: number,
  cause: string,
): boolean {
  const npc = getPerson(state, personId);
  if (!npc || !npc.identity.alive) return false;

  const year = state.birthYear + state.age;
  const wasKage = npc.identity.specialStatus === 'kage';
  npc.identity.alive = false;
  npc.identity.deathAge = age;
  npc.identity.deathCause = cause;
  vacateSeats(state, personId);
  npc.memory.push({
    year,
    age,
    tag: 'loss',
    summary: `Died at age ${age}: ${cause}.`,
    impact: -5,
  });
  if (npc.memory.length > 14) npc.memory.splice(0, npc.memory.length - 14);

  if (state.worldSim) {
    for (const other of state.worldSim.npcs) {
      if (!other.identity.alive || other.identity.id === personId) continue;
      const rel = other.relationships[personId];
      if (rel && (rel.trust >= 45 || rel.affinity >= 35 || rel.kind === 'family' || rel.kind === 'spouse')) {
        other.memory.push({
          year,
          age: other.identity.age,
          tag: 'loss',
          summary: `Mourned the death of ${npc.identity.name} (${cause}).`,
          impact: -4,
        });
        if (other.memory.length > 14) other.memory.splice(0, other.memory.length - 14);
      }
    }

    const isNotable =
      Boolean(npc.identity.observed) ||
      npc.identity.rank === 'jonin' ||
      wasKage ||
      Boolean(npc.relationships.player);
    if (isNotable) {
      state.worldSim.history.push({
        id: `wh_death_${personId}_${year}`,
        year,
        layer: 'npc',
        title: `${npc.identity.name} Fell`,
        summary: `${npc.identity.name} (${npc.identity.roleTitle}) died at age ${age}: ${cause}.`,
        villageId: npc.identity.villageId,
        npcId: personId,
        tone: 'danger',
      });
      if (state.worldSim.history.length > 120) {
        state.worldSim.history.splice(0, state.worldSim.history.length - 120);
      }
    }
  }

  return true;
}

/**
 * Derives a person's live combat profile directly from their persistent WorldNpc instance.
 * Never re-generates identity fields; uses the exact same `computeRanksFromIdentity` formula
 * that powers `powerScore` for Chunin Exams and autonomous world simulation.
 */
export function combatProfile(
  state: GameState,
  personOrId: string | WorldNpc,
): PersonCombatProfile | null {
  const person = typeof personOrId === 'string' ? getPerson(state, personOrId) : personOrId;
  if (!person) return null;
  const id = person.identity;
  const fallback = ARCHETYPE_PROFILE_MAP[id.archetype] ?? ARCHETYPE_PROFILE_MAP.skirmisher;
  const ranks = computeRanksFromIdentity(id);
  const officialRank = officialRankForPerson(person);
  const avgRank = (ranks[0] + ranks[1] + ranks[2] + ranks[3] + ranks[4]) / 5;
  const threatClass: ThreatClass =
    avgRank >= 4.7
      ? 'S'
      : avgRank >= 3.9
        ? 'A'
        : avgRank >= 3.1
          ? 'B'
          : avgRank >= 2.2
            ? 'C'
            : 'D';

  const kit = id.kit;
  const lines = kit?.lines ?? {
    meet: renderText(id, fallback.lines.meet),
    clash: renderText(id, fallback.lines.clash),
    win: renderText(id, fallback.lines.win),
    fall: renderText(id, fallback.lines.fall),
  };

  return {
    personId: id.id,
    name: id.name,
    epithet: id.epithet || id.roleTitle || fallback.epithet,
    villageId: id.villageId,
    archetype: id.archetype,
    tactic: kit?.tactic ?? fallback.tactic,
    element: id.element,
    officialRank,
    formerShinobi: id.specialStatus === 'missing_nin',
    threatClass,
    ranks,
    weakness: id.weakness || 'poor chakra control',
    traits: id.traits?.length ? [...id.traits] : [...fallback.traits],
    skills: kit?.skills ? kit.skills.map((s) => ({ ...s })) : fallback.skills.map((s) => ({ ...s })),
    ultimate: kit?.ultimate ? { ...kit.ultimate } : { ...fallback.ultimate },
    motive: person.nindo.maxim || fallback.motive,
    originHint: id.background || fallback.originHint,
    lines,
  };
}

export interface CompetitorOverrides {
  id?: string;
  epithet?: string;
  tactic?: NpcTactic;
  formerShinobi?: boolean;
  hp?: number;
  cp?: number;
  fort?: number;
  intel?: number;
  knowPlayer?: number;
  ultimateSeen?: boolean;
  skillsRevealed?: boolean;
  longGoal?: LongGoal;
  shortGoal?: ShortGoal;
  planTargetId?: string | null;
  allyId?: string | null;
  isExTeammateRogue?: boolean;
}

/**
 * Single canonical constructor for any WarCompetitor.
 * Always derives combat profile from the person's persistent WorldNpc instance
 * and marks the person as observed so they remain persistent for the rest of the life.
 */
export function competitorFromPerson(
  state: GameState,
  personOrId: string | WorldNpc,
  index: number,
  overrides?: CompetitorOverrides,
): WarCompetitor {
  const person = typeof personOrId === 'string' ? getPerson(state, personOrId) : personOrId;
  if (!person) {
    throw new Error(`competitorFromPerson: person not found (${String(personOrId)})`);
  }
  person.identity.observed = true;

  const profile = combatProfile(state, person)!;
  const tactic = overrides?.tactic ?? profile.tactic;
  const persona = buildShinobiPersona(tactic, profile.traits, profile.archetype);
  return {
    id: overrides?.id ?? `en_${index}_${profile.personId}`,
    personId: profile.personId,
    name: profile.name,
    epithet: overrides?.epithet ?? profile.epithet,
    villageId: profile.villageId,
    archetype: profile.archetype,
    tactic,
    element: profile.element,
    officialRank: profile.officialRank,
    formerShinobi: overrides?.formerShinobi ?? profile.formerShinobi,
    threatClass: profile.threatClass,
    ranks: profile.ranks,
    weakness: profile.weakness,
    skills: profile.skills,
    ultimate: profile.ultimate,
    persona,
    longGoal:
      overrides?.longGoal ??
      (profile.archetype === 'artificer'
        ? 'territory'
        : tactic === 'defensive'
          ? 'outlast'
          : 'topple_apex'),
    shortGoal: overrides?.shortGoal ?? 'gather_intel',
    planTargetId: overrides?.planTargetId ?? null,
    allyId: overrides?.allyId ?? null,
    hp: overrides?.hp ?? 100,
    cp: overrides?.cp ?? 100,
    fort: overrides?.fort ?? (profile.archetype === 'artificer' ? 32 : 14),
    alive: true,
    intel: overrides?.intel ?? 0,
    ultimateSeen: overrides?.ultimateSeen ?? false,
    skillsRevealed: overrides?.skillsRevealed ?? false,
    knowPlayer: overrides?.knowPlayer ?? 0,
    kills: 0,
    survivedOnce: false,
    isExTeammateRogue: overrides?.isExTeammateRogue ?? false,
  };
}

/**
 * Resolves the combat dialogue lines for a WarCompetitor through its persistent WorldNpc.
 */
export function getCompetitorLines(
  state: GameState,
  enemy: Pick<WarCompetitor, 'personId' | 'archetype' | 'name' | 'villageId'>,
): { meet: string; clash: string; win: string; fall: string } {
  const person = getPerson(state, enemy.personId);
  if (person?.identity.kit?.lines) {
    return person.identity.kit.lines;
  }
  const fallback = ARCHETYPE_PROFILE_MAP[enemy.archetype] ?? ARCHETYPE_PROFILE_MAP.skirmisher;
  return {
    meet: renderText({ name: enemy.name, sex: 'M', villageId: enemy.villageId }, fallback.lines.meet),
    clash: renderText({ name: enemy.name, sex: 'M', villageId: enemy.villageId }, fallback.lines.clash),
    win: renderText({ name: enemy.name, sex: 'M', villageId: enemy.villageId }, fallback.lines.win),
    fall: renderText({ name: enemy.name, sex: 'M', villageId: enemy.villageId }, fallback.lines.fall),
  };
}

export function getPersonMotive(
  state: GameState,
  personId: string | undefined,
  fallbackArchetype?: CombatArchetype,
): string {
  const person = getPerson(state, personId);
  if (person?.nindo.maxim) return person.nindo.maxim;
  return ARCHETYPE_PROFILE_MAP[fallbackArchetype ?? 'vanguard'].motive;
}

export function getPersonOriginHint(
  state: GameState,
  personId: string | undefined,
  fallbackArchetype?: CombatArchetype,
): string {
  const person = getPerson(state, personId);
  if (person?.identity.background) return person.identity.background;
  return ARCHETYPE_PROFILE_MAP[fallbackArchetype ?? 'vanguard'].originHint;
}

export interface ResolvedSquadMemberView {
  personId: string;
  name: string;
  sex: 'M' | 'F';
  age: number;
  rank: ShinobiRank;
  specialStatus: SpecialStatus;
  alive: boolean;
  specialty: string;
  traits: TraitId[];
  powerScore: number;
  role: 'sensei' | 'teammate';
  archetype: string;
  trust: number;
  fit: number;
  relTrack: KizunaMember['relTrack'];
  relStage: KizunaMember['relStage'];
  relPoints: number;
  fragments: number;
  promiseMade: boolean;
  fateNote: string;
  rel6?: KizunaMember['rel6'];
  playerFeelings?: KizunaMember['playerFeelings'];
}

export function resolveSquadMemberView(state: GameState, m: KizunaMember): ResolvedSquadMemberView {
  const person = getPerson(state, m.personId);
  return {
    personId: m.personId,
    name: person?.identity.name ?? 'Unknown Shinobi',
    sex: person?.identity.sex ?? 'M',
    age: person?.identity.age ?? state.age,
    rank: person?.identity.rank ?? (m.role === 'sensei' ? 'jonin' : 'genin'),
    specialStatus: person?.identity.specialStatus ?? 'none',
    alive: person?.identity.alive ?? false,
    specialty: person?.identity.specialty ?? 'kenjutsu',
    traits: getPersonTraits(state, m.personId),
    powerScore: person?.identity.powerScore ?? 40,
    role: m.role,
    archetype: m.archetype,
    trust: m.trust,
    fit: m.fit,
    relTrack: m.relTrack,
    relStage: m.relStage,
    relPoints: m.relPoints,
    fragments: m.fragments,
    promiseMade: m.promiseMade,
    fateNote: m.fateNote,
    rel6: m.rel6,
    playerFeelings: m.playerFeelings,
  };
}

export interface ResolvedFamilyMemberView {
  personId: string;
  relation: FamilyMember['relation'];
  name: string;
  sex: 'M' | 'F';
  age: number;
  alive: boolean;
  occupation: WorldNpcIdentity['occupation'];
  deathAge?: number;
  deathCause?: string;
  capacity?: number;
  isHeirRival?: boolean;
}

export function resolveFamilyMemberView(state: GameState, f: FamilyMember): ResolvedFamilyMemberView {
  const person = getPerson(state, f.personId);
  return {
    personId: f.personId,
    relation: f.relation,
    name: person?.identity.name ?? 'Unknown Relative',
    sex: person?.identity.sex ?? 'M',
    age: person?.identity.age ?? 0,
    alive: person?.identity.alive ?? false,
    occupation: person?.identity.occupation ?? 'shinobi',
    deathAge: person?.identity.deathAge,
    deathCause: person?.identity.deathCause,
    capacity: f.capacity,
    isHeirRival: f.isHeirRival,
  };
}

/**
 * Collects every personId currently referenced by any role in GameState.
 */
export function collectReferencedPersonIds(state: GameState): Set<string> {
  const refs = new Set<string>();
  const add = (id?: string | null) => {
    if (id && id !== 'player') refs.add(id);
  };

  if (state.team) {
    for (const m of state.team.members) {
      add(m.personId);
    }
  }
  for (const f of state.family) {
    add(f.personId);
  }
  add(state.rivalId);
  add(state.permanentPartner?.personId);
  add(state.war?.partner?.personId);
  if (state.war) {
    for (const e of state.war.enemies) {
      add(e.personId);
    }
    add(state.war.conviction?.opponentPersonId);
  }
  if (state.chuninTournament) {
    for (const p of state.chuninTournament.participants) {
      add(p.personId);
    }
  }
  if (state.playerLegacy) {
    add(state.playerLegacy.abandonedSurvivorNpcId);
    add(state.playerLegacy.unwantedTargetNpcId);
  }
  if (state.academy) {
    add(state.academy.senseiNpcId);
    for (const cid of state.academy.classmateNpcIds) add(cid);
  }
  if (state.worldSim) {
    for (const v of Object.values(state.worldSim.villages)) {
      add(v.kageNpcId);
      for (const c of v.clans) add(c.headNpcId);
    }
  }
  return refs;
}

/**
 * G3 Persistence Rule: a person who has ever been observed by the player
 * (referenced by a role, has a player relationship/memory, or flagged `observed`)
 * is NEVER culled from `state.worldSim.npcs`.
 */
export function isPersonObserved(
  state: GameState,
  npc: WorldNpc,
  referencedIds?: Set<string>,
): boolean {
  const id = npc.identity.id;
  if (npc.identity.observed) return true;
  if (referencedIds ? referencedIds.has(id) : collectReferencedPersonIds(state).has(id)) return true;
  if (npc.relationships.player) return true;
  if (npc.memory.some((m) => m.actorId === 'player')) return true;
  return false;
}

/**
 * Per-life Bingo Book (G5): every observed combatant encountered during this life.
 */
export function getLifeBingoBookEntries(state: GameState): WorldNpc[] {
  if (!state.worldSim) return [];
  const refs = collectReferencedPersonIds(state);
  return state.worldSim.npcs
    .filter(
      (n) =>
        (n.identity.occupation === 'shinobi' || n.identity.occupation === 'samurai') &&
        isPersonObserved(state, n, refs),
    )
    .sort((a, b) => Number(b.identity.alive) - Number(a.identity.alive) || b.identity.powerScore - a.identity.powerScore);
}
