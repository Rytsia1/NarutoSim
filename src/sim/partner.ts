import { DISCIPLINE_MAP } from '../data/powers';
import {
  combatProfile,
  competitorFromPerson,
  generateCharacter,
  getPerson,
  getPersonMotive,
  getPersonOriginHint,
  getPersonTraits,
  isPersonAlive,
  killPerson,
  markPersonObserved,
  personName,
} from './people';
import { VILLAGE_MAP } from '../data/villages';
import { recordWarFact } from './narrative';
import { clamp } from './powers';
import type { SeededRng } from './rng';
import { computeLiveFit } from './team';
import type {
  GameState,
  KizunaMember,
  PartnerTrustTier,
  PermanentPartnerRecord,
  SkillTag,
  TraitId,
  WarPartnerState,
  WarState,
  WorldNpc,
} from './types';

export interface AffinityCandidate<T extends { traits: readonly TraitId[] }> {
  item: T;
  fit: number;
  weight: number;
}

/**
 * GDD Ch. 5.1 Affinity Weighting: weight = exp(fitScore / 8).
 * Works for both War Partner selection (K1) and Kuchiyose Clan summoning (K3).
 */
export function computeAffinityWeights<T extends { traits: readonly TraitId[] }>(
  state: GameState,
  candidates: readonly T[],
  bonusFn?: (candidate: T) => number,
): AffinityCandidate<T>[] {
  return candidates.map((item) => {
    const baseFit = computeLiveFit(state, { traits: [...item.traits] });
    const bonus = bonusFn ? bonusFn(item) : 0;
    const fit = clamp(Math.round(baseFit + bonus), 15, 99);
    return {
      item,
      fit,
      weight: Math.exp(fit / 8),
    };
  });
}

export function getPartnerTrustTier(trust: number): { id: PartnerTrustTier; label: string } {
  if (trust < 35) return { id: 'distrust', label: 'Distrust' };
  if (trust < 60) return { id: 'steady', label: 'Steady' };
  if (trust < 80) return { id: 'trusted', label: 'Trusted' };
  return { id: 'bond', label: 'Unbreakable Bond' };
}

export function getPartnerRelStageLabel(partner: Pick<WarPartnerState, 'relTrack' | 'relStage'>): string {
  if (partner.relTrack === 'mentorship') {
    return ['Student', 'Acknowledged Disciple', 'Trusted Protege', 'Inheritor of Will'][partner.relStage];
  }
  if (partner.relTrack === 'romance') {
    return ['Acquaintance', 'Fondness', 'Yearning', 'Lovers'][partner.relStage];
  }
  return ['Squadmates', 'Comrades', 'Close Friends', 'Sworn Bond'][partner.relStage];
}

function buildSkillsForSquadMember(
  state: GameState,
  m: KizunaMember,
): { name: string; tag: SkillTag; rank: number }[] {
  const person = getPerson(state, m.personId);
  const specialty = person?.identity.specialty ?? 'kenjutsu';
  const rank = person?.identity.rank ?? (m.role === 'sensei' ? 'jonin' : 'genin');
  const specName = DISCIPLINE_MAP[specialty]?.name ?? 'Shinobi';
  const baseRank = m.role === 'sensei' ? 4 : rank === 'jonin' ? 4 : rank === 'chunin' ? 3 : 2;
  const secondTag: SkillTag =
    specialty === 'barrier' || specialty === 'earth_release' || specialty === 'fuinjutsu'
      ? 'fort'
      : specialty === 'silent_killing' || specialty === 'shurikenjutsu'
        ? 'slayer'
        : 'insight';
  return [
    { name: `${specName} Support`, tag: 'power', rank: baseRank },
    { name: m.role === 'sensei' ? 'Veteran Guard' : 'Flank Cover', tag: secondTag, rank: Math.max(1, baseRank - 1) },
  ];
}

function partnerFromPermanent(state: GameState, rec: PermanentPartnerRecord): WarPartnerState {
  const person = getPerson(state, rec.personId);
  markPersonObserved(state, rec.personId);
  const profile = combatProfile(state, rec.personId);
  const traits = profile?.traits ?? getPersonTraits(state, rec.personId);
  const fit = computeLiveFit(state, { traits });
  return {
    id: `partner_perm_${rec.personId}`,
    personId: rec.personId,
    source: 'permanent',
    name: person?.identity.name ?? personName(state, rec.personId),
    epithet: rec.epithet || profile?.epithet || 'Permanent Partner',
    villageId: person?.identity.villageId ?? state.villageId,
    element: person?.identity.element ?? state.element,
    archetype: profile?.archetype ?? 'vanguard',
    hp: 100,
    maxHp: 100,
    trust: clamp(rec.trust, 10, 100),
    fit,
    traits,
    skills: profile?.skills ?? [
      { name: 'Joint Formation', tag: 'power', rank: 3 },
      { name: 'Field Cover', tag: 'fort', rank: 2 },
    ],
    relTrack: rec.relTrack,
    relStage: rec.relStage,
    relPoints: rec.relPoints,
    fragments: rec.fragments,
    motive: getPersonMotive(state, rec.personId, profile?.archetype),
    originHint: getPersonOriginHint(state, rec.personId, profile?.archetype),
    active: true,
    defected: false,
    died: false,
    downHandled: false,
    freeSurpassUsed: false,
  };
}

function partnerFromSquadMember(state: GameState, m: KizunaMember): WarPartnerState {
  const person = getPerson(state, m.personId);
  markPersonObserved(state, m.personId);
  const traits = getPersonTraits(state, m.personId);
  const fit = computeLiveFit(state, { traits });
  const v = VILLAGE_MAP[state.villageId];
  const specialty = person?.identity.specialty ?? 'kenjutsu';
  const discElem = DISCIPLINE_MAP[specialty]?.element ?? person?.identity.element ?? v.dominantElement;
  return {
    id: `partner_squad_${m.personId}`,
    personId: m.personId,
    source: 'squad',
    name: person?.identity.name ?? personName(state, m.personId),
    epithet: m.role === 'sensei' ? `Team ${state.team?.number ?? ''} Sensei` : `Team ${state.team?.number ?? ''} Comrade`,
    villageId: person?.identity.villageId ?? state.villageId,
    element: discElem,
    archetype: person?.identity.archetype ?? (m.role === 'sensei' ? 'vanguard' : 'skirmisher'),
    hp: 100,
    maxHp: 100,
    trust: clamp(m.trust, 10, 100),
    fit,
    traits,
    skills: buildSkillsForSquadMember(state, m),
    relTrack: m.relTrack,
    relStage: m.relStage,
    relPoints: m.relPoints,
    fragments: m.fragments,
    motive:
      m.role === 'sensei'
        ? `Bring every student of Team ${state.team?.number ?? ''} back through the village gate alive.`
        : `Stand shoulder to shoulder with ${state.name} until the war front falls quiet.`,
    originHint: m.fateNote,
    active: true,
    defected: false,
    died: false,
    downHandled: false,
    freeSurpassUsed: false,
  };
}

function partnerFromWorldPerson(
  state: GameState,
  person: WorldNpc,
  fit: number,
  source: 'village_roster' | 'village_gen',
): WarPartnerState {
  person.identity.observed = true;
  const profile = combatProfile(state, person)!;
  const startTrust = clamp(Math.round(20 + fit * 0.4 - (fit < 50 ? 5 : 0)), 18, 65);
  return {
    id: `partner_${person.identity.id}`,
    personId: person.identity.id,
    source,
    name: profile.name,
    epithet: profile.epithet,
    villageId: profile.villageId,
    element: profile.element,
    archetype: profile.archetype,
    hp: 100,
    maxHp: 100,
    trust: startTrust,
    fit,
    traits: profile.traits,
    skills: profile.skills,
    relTrack: 'comrades',
    relStage: 0,
    relPoints: 0,
    fragments: 0,
    motive: profile.motive,
    originHint: profile.originHint,
    active: true,
    defected: false,
    died: false,
    downHandled: false,
    freeSurpassUsed: false,
  };
}

/**
 * Selects the War Partner for the 14-day war following K1 priority:
 * 1. Living Permanent Partner (from a previous war's "Stay With Me" finale choice)
 * 2. Highest-trust living non-rogue squad member (Team Sensei or Teammate)
 * 3. Affinity-weighted selection via exp(fit / 8) from living world combatants,
 *    or a freshly generated village shinobi/samurai combatant via CharacterGenerator
 */
export function selectWarPartner(
  state: GameState,
  rng: SeededRng,
  excludedPersonIds: Set<string> = new Set(),
): WarPartnerState {
  // Priority 1: Permanent Partner from previous war finale
  if (state.permanentPartner && isPersonAlive(state, state.permanentPartner.personId)) {
    const p = getPerson(state, state.permanentPartner.personId);
    if (!p || p.identity.specialStatus !== 'missing_nin') {
      return partnerFromPermanent(state, state.permanentPartner);
    }
  }

  // Priority 2: Living squad member with highest trust (not missing_nin)
  if (state.team && state.specialStatus !== 'missing_nin') {
    const livingSquad = state.team.members
      .filter((m) => {
        const p = getPerson(state, m.personId);
        return Boolean(p && p.identity.alive && p.identity.specialStatus !== 'missing_nin');
      })
      .sort((a, b) => b.trust - a.trust || (a.role === 'teammate' ? -1 : 1));
    if (livingSquad.length > 0) {
      return partnerFromSquadMember(state, livingSquad[0]);
    }
  }

  // Priority 3: Affinity-weighted selection via exp(fit / 8) from living world combatants
  const familyIds = new Set(state.family.map((f) => f.personId));
  const worldPool = (state.worldSim?.npcs ?? []).filter((n) => {
    const id = n.identity;
    if (!id.alive) return false;
    if (id.occupation !== 'shinobi' && id.occupation !== 'samurai') return false;
    if (id.rank !== 'chunin' && id.rank !== 'jonin') return false;
    if (id.specialStatus === 'kage' || id.specialStatus === 'missing_nin') return false;
    if (id.archetype === 'rogue_s') return false;
    if (excludedPersonIds.has(id.id) || familyIds.has(id.id) || id.id === state.rivalId) return false;
    return true;
  });

  if (worldPool.length > 0) {
    const wrapped = worldPool.map((npc) => ({
      npc,
      villageId: npc.identity.villageId,
      traits: getPersonTraits(state, npc.identity.id),
    }));
    const weighted = computeAffinityWeights(state, wrapped, (c) =>
      c.villageId === state.villageId ? 6 : 0,
    );
    const chosen = rng.weighted(weighted.map((w) => ({ item: w, weight: w.weight })));
    return partnerFromWorldPerson(state, chosen.item.npc, chosen.fit, 'village_roster');
  }

  // Fallback: generate a village shinobi/samurai partner via CharacterGenerator
  const v = VILLAGE_MAP[state.villageId];
  const genPerson = generateCharacter(
    state,
    {
      age: Math.max(16, state.age + rng.int(0, 6)),
      villageId: state.villageId,
      occupation: state.villageId === 'iron' ? 'samurai' : 'shinobi',
      rank: 'chunin',
      roleTitle: `${v.name} Flank Partner`,
      lodTier: 'L1',
      observed: true,
    },
    rng,
  );
  const fit = computeLiveFit(state, { traits: genPerson.identity.traits });
  return partnerFromWorldPerson(state, genPerson, fit, 'village_gen');
}

export function syncPartnerBackToState(state: GameState, partner: WarPartnerState | null): void {
  if (!partner) return;
  const person = getPerson(state, partner.personId);
  if (partner.died) {
    killPerson(
      state,
      partner.personId,
      person?.identity.age ?? state.age,
      `fell protecting ${state.name} in Great Shinobi War #${state.war?.warNumber ?? state.world.eraNumber}`,
    );
  } else if (partner.defected && person) {
    person.identity.specialStatus = 'missing_nin';
    person.identity.roleTitle = 'Missing-Nin Rogue';
  }
  if (state.team) {
    const m = state.team.members.find((mem) => mem.personId === partner.personId);
    if (m) {
      m.trust = partner.trust;
      m.fit = partner.fit;
      m.relTrack = partner.relTrack;
      m.relStage = partner.relStage;
      m.relPoints = partner.relPoints;
      m.fragments = partner.fragments;
      if (partner.died) {
        m.fateNote = `Fell fighting beside you during Great Shinobi War #${state.war?.warNumber ?? state.world.eraNumber} at age ${person?.identity.age ?? state.age}.`;
      } else if (partner.defected) {
        m.fateNote = `Defected during Great Shinobi War #${state.war?.warNumber ?? state.world.eraNumber}.`;
      }
    }
  }
  if (state.permanentPartner && state.permanentPartner.personId === partner.personId) {
    state.permanentPartner.trust = partner.trust;
    state.permanentPartner.relTrack = partner.relTrack;
    state.permanentPartner.relStage = partner.relStage;
    state.permanentPartner.relPoints = partner.relPoints;
    state.permanentPartner.fragments = partner.fragments;
  }
}

export function adjustPartnerTrust(
  state: GameState,
  partner: WarPartnerState,
  rawDelta: number,
  unlockFragment = false,
): number {
  if (!partner.active || partner.died || partner.defected) return 0;
  partner.fit = computeLiveFit(state, { traits: partner.traits });

  let delta = rawDelta;
  if (delta > 0) {
    const dim = clamp(1 - (partner.trust - 30) / 50, 0.15, 1);
    const fitMult = partner.fit >= 70 ? 1.2 : partner.fit < 50 ? 0.7 : 1;
    const distrustMult = partner.trust < 35 ? 0.5 : 1;
    delta = Math.max(1, Math.round(delta * dim * fitMult * distrustMult));
  } else if (delta < 0) {
    const fitMult = partner.fit >= 70 ? 0.8 : partner.fit < 50 ? 1.2 : 1;
    delta = Math.min(-1, Math.round(delta * fitMult));
  }

  const before = partner.trust;
  partner.trust = clamp(partner.trust + delta, 0, 100);

  if (unlockFragment && partner.fragments < 3 && partner.trust >= 35) {
    partner.fragments += 1;
    partner.relPoints += 6;
  }

  if (partner.trust >= 60 && delta > 0) {
    partner.relPoints += Math.round(delta * 1.4);
  } else if (partner.trust < 35 && delta < 0) {
    partner.relPoints = Math.max(0, partner.relPoints - 8);
  }

  const ptReq = [0, 22, 52, 85];
  const trustReq = [0, 55, 72, 88];
  while (
    partner.relStage < 3 &&
    partner.relPoints >= ptReq[partner.relStage + 1] &&
    partner.trust >= trustReq[partner.relStage + 1]
  ) {
    partner.relStage = (partner.relStage + 1) as 0 | 1 | 2 | 3;
  }

  syncPartnerBackToState(state, partner);
  return partner.trust - before;
}

/**
 * Evaluates GDD Ch. 7.5 Command Seal / Resolve reaction on the War Partner.
 * - Spending Resolve: trust <= 60 => +4 trust; trust > 60 => -3 trust.
 * - When Resolves reach 0:
 *   - trust < 35 && traits.includes('ambition') => 60% Defection (joins strongest enemy +30 HP + spawns rogue competitor).
 *   - trust >= 60 => Loyalty Oath (+8 trust).
 */
export function applyResolvePartnerReaction(
  state: GameState,
  war: WarState,
  rng: SeededRng,
): { defected: boolean; oath: boolean; note: string } {
  const partner = war.partner;
  if (!partner || !partner.active) {
    return { defected: false, oath: false, note: '' };
  }

  let note = '';
  if (partner.trust <= 60) {
    const d = adjustPartnerTrust(state, partner, 4);
    if (d !== 0) note = ` ${partner.name} respects your decisive surge (Trust ${d > 0 ? `+${d}` : d}).`;
  } else {
    const d = adjustPartnerTrust(state, partner, -3);
    if (d !== 0) note = ` ${partner.name} bristles at being pushed past the wire (Trust ${d}).`;
  }

  if (war.resolves === 0) {
    if (partner.trust < 35 && partner.traits.includes('ambition') && rng.chance(0.6)) {
      partner.active = false;
      partner.defected = true;
      partner.downHandled = true;
      syncPartnerBackToState(state, partner);

      const livingEnemies = war.enemies.filter((e) => e.alive).sort((a, b) => b.hp - a.hp);
      const strongest = livingEnemies[0];
      if (strongest) {
        strongest.hp = clamp(strongest.hp + 30, 0, 100);
      }

      const defectId = `en_defect_${partner.id}`;
      if (!war.enemies.some((e) => e.id === defectId)) {
        const defectPerson =
          getPerson(state, partner.personId) ??
          generateCharacter(
            state,
            {
              id: partner.personId,
              name: partner.name,
              age: Math.max(16, state.age),
              villageId: partner.villageId,
              occupation: partner.villageId === 'iron' ? 'samurai' : 'shinobi',
              rank: 'chunin',
              specialStatus: 'missing_nin',
              roleTitle: `${partner.epithet} (Turncoat)`,
              element: partner.element,
              archetype: partner.archetype,
              traits: partner.traits,
              lodTier: 'L1',
              observed: true,
            },
            rng,
          );
        const defectEnemy = competitorFromPerson(state, defectPerson, war.enemies.length + 1, {
          id: defectId,
          epithet: `${partner.epithet} (Turncoat)`,
          tactic: 'hunter',
          formerShinobi: true,
          longGoal: 'dominate',
          shortGoal: 'strike_apex',
          planTargetId: 'player',
          allyId: strongest?.id ?? null,
          hp: Math.max(55, partner.hp),
          cp: 90,
          fort: 12,
          intel: 100,
          ultimateSeen: true,
          skillsRevealed: true,
          knowPlayer: 65,
          isExTeammateRogue: Boolean(state.team?.members.some((m) => m.personId === partner.personId)),
        });
        war.enemies.push(defectEnemy);
      }

      recordWarFact(war, {
        type: 'partner_defect',
        actorId: partner.personId,
        actorName: partner.name,
        targetId: 'player',
        targetName: state.name,
        detail: `${partner.name} defected once your final Resolve was spent!`,
      });
      return {
        defected: true,
        oath: false,
        note: ` DEFECTION! Sensing your final Resolve spent, ${partner.name} breaks ranks and defects to the enemy front${strongest ? ` (${strongest.name} +30 HP)` : ''}!`,
      };
    }

    if (partner.trust >= 60) {
      const bonus = adjustPartnerTrust(state, partner, 8);
      return {
        defected: false,
        oath: true,
        note: ` LOYALTY OATH! Even with your final Resolve spent, ${partner.name} steps shoulder-to-shoulder beside you (Trust +${bonus}).`,
      };
    }
  }

  return { defected: false, oath: false, note };
}

export function createPermanentPartnerFromWar(
  state: GameState,
  partner: WarPartnerState,
): PermanentPartnerRecord {
  return {
    personId: partner.personId,
    epithet: partner.epithet,
    trust: partner.trust,
    relTrack: partner.relTrack,
    relStage: partner.relStage,
    relPoints: partner.relPoints,
    fragments: partner.fragments,
    stayedAge: state.age,
  };
}
