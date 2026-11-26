import { DISCIPLINE_MAP } from '../data/powers';
import { ROSTER, type RosterShinobiDef } from '../data/roster';
import { VILLAGE_MAP } from '../data/villages';
import { buildShinobiPersona } from './ai';
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
  WarCompetitor,
  WarPartnerState,
  WarState,
} from './types';

export interface AffinityCandidate<T extends { traits: TraitId[] }> {
  item: T;
  fit: number;
  weight: number;
}

/**
 * GDD Ch. 5.1 Affinity Weighting: weight = exp(fitScore / 8).
 * Works for both War Partner selection (K1) and Kuchiyose Clan summoning (K3).
 */
export function computeAffinityWeights<T extends { traits: TraitId[] }>(
  state: GameState,
  candidates: readonly T[],
  bonusFn?: (candidate: T) => number,
): AffinityCandidate<T>[] {
  return candidates.map((item) => {
    const baseFit = computeLiveFit(state, { traits: item.traits });
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

function buildSkillsForSquadMember(m: KizunaMember): { name: string; tag: SkillTag; rank: number }[] {
  const specName = DISCIPLINE_MAP[m.specialty]?.name ?? 'Shinobi';
  const baseRank = m.role === 'sensei' ? 4 : m.rank === 'jonin' ? 4 : m.rank === 'chunin' ? 3 : 2;
  const secondTag: SkillTag =
    m.specialty === 'barrier' || m.specialty === 'earth_release' || m.specialty === 'fuinjutsu'
      ? 'fort'
      : m.specialty === 'silent_killing' || m.specialty === 'shurikenjutsu'
        ? 'slayer'
        : 'insight';
  return [
    { name: `${specName} Support`, tag: 'power', rank: baseRank },
    { name: m.role === 'sensei' ? 'Veteran Guard' : 'Flank Cover', tag: secondTag, rank: Math.max(1, baseRank - 1) },
  ];
}

function partnerFromPermanent(state: GameState, rec: PermanentPartnerRecord): WarPartnerState {
  const fit = computeLiveFit(state, { traits: rec.traits });
  return {
    id: rec.id,
    source: 'permanent',
    rosterId: rec.rosterId,
    teamMemberId: rec.teamMemberId,
    name: rec.name,
    epithet: rec.epithet,
    villageId: rec.villageId,
    element: rec.element,
    archetype: rec.archetype,
    hp: 100,
    maxHp: 100,
    trust: clamp(rec.trust, 10, 100),
    fit,
    traits: [...rec.traits],
    skills: rec.skills.map((s) => ({ ...s })),
    relTrack: rec.relTrack,
    relStage: rec.relStage,
    relPoints: rec.relPoints,
    fragments: rec.fragments,
    motive: rec.motive,
    originHint: rec.originHint,
    active: true,
    defected: false,
    died: false,
    downHandled: false,
    freeSurpassUsed: false,
  };
}

function partnerFromSquadMember(state: GameState, m: KizunaMember): WarPartnerState {
  const fit = computeLiveFit(state, { traits: m.traits });
  const v = VILLAGE_MAP[state.villageId];
  const discElem = DISCIPLINE_MAP[m.specialty]?.element ?? v.dominantElement;
  return {
    id: `partner_squad_${m.id}`,
    source: 'squad',
    teamMemberId: m.id,
    name: m.name,
    epithet: m.role === 'sensei' ? `Team ${state.team?.number ?? ''} Sensei` : `Team ${state.team?.number ?? ''} Comrade`,
    villageId: state.villageId,
    element: discElem,
    archetype: m.role === 'sensei' ? 'vanguard' : 'skirmisher',
    hp: 100,
    maxHp: 100,
    trust: clamp(m.trust, 10, 100),
    fit,
    traits: [...m.traits],
    skills: buildSkillsForSquadMember(m),
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

function partnerFromRoster(def: RosterShinobiDef, fit: number): WarPartnerState {
  const startTrust = clamp(Math.round(20 + fit * 0.4 - (fit < 50 ? 5 : 0)), 18, 65);
  return {
    id: `partner_ros_${def.id}`,
    source: 'village_roster',
    rosterId: def.id,
    name: def.name,
    epithet: def.epithet,
    villageId: def.villageId,
    element: def.element,
    archetype: def.archetype,
    hp: 100,
    maxHp: 100,
    trust: startTrust,
    fit,
    traits: [...def.traits],
    skills: def.skills.map((s) => ({ ...s })),
    relTrack: 'comrades',
    relStage: 0,
    relPoints: 0,
    fragments: 0,
    motive: def.motive,
    originHint: def.originHint,
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
 * 3. Affinity-weighted candidate via exp(fit / 8)
 */
export function selectWarPartner(
  state: GameState,
  rng: SeededRng,
  excludedRosterIds: Set<string> = new Set(),
): WarPartnerState {
  // Priority 1: Permanent Partner from previous war finale
  if (state.permanentPartner && state.permanentPartner.alive) {
    return partnerFromPermanent(state, state.permanentPartner);
  }

  // Priority 2: Living squad member with highest trust (not missing_nin)
  if (state.team && state.specialStatus !== 'missing_nin') {
    const livingSquad = state.team.members
      .filter((m) => m.alive && m.specialStatus !== 'missing_nin')
      .sort((a, b) => b.trust - a.trust || (a.role === 'teammate' ? -1 : 1));
    if (livingSquad.length > 0) {
      return partnerFromSquadMember(state, livingSquad[0]);
    }
  }

  // Priority 3: Affinity-weighted selection via exp(fit / 8)
  const fallen = new Set(state.fallenRosterIds);
  const pool = ROSTER.filter(
    (r) =>
      r.archetype !== 'rogue_s' &&
      !fallen.has(r.id) &&
      !excludedRosterIds.has(r.id) &&
      r.id !== state.fatedRosterId,
  );
  if (pool.length > 0) {
    const weighted = computeAffinityWeights(state, pool, (c) =>
      c.villageId === state.villageId ? 6 : 0,
    );
    const chosen = rng.weighted(weighted.map((w) => ({ item: w, weight: w.weight })));
    return partnerFromRoster(chosen.item, chosen.fit);
  }

  // Fallback generated village partner if roster is exhausted
  const v = VILLAGE_MAP[state.villageId];
  const first = rng.pick(v.maleNames);
  const last = rng.pick(v.surnames);
  const traits: TraitId[] = ['loyalty', 'honor'];
  const fit = computeLiveFit(state, { traits });
  const startTrust = clamp(Math.round(20 + fit * 0.4 - (fit < 50 ? 5 : 0)), 18, 65);
  return {
    id: `partner_gen_${state.villageId}_${state.world.eraNumber}`,
    source: 'village_gen',
    name: `${first} ${last}`,
    epithet: `${v.name} Flank Partner`,
    villageId: state.villageId,
    element: v.dominantElement,
    archetype: 'vanguard',
    hp: 100,
    maxHp: 100,
    trust: startTrust,
    fit,
    traits,
    skills: [
      { name: 'Joint Formation', tag: 'power', rank: 3 },
      { name: 'Field Cover', tag: 'fort', rank: 2 },
    ],
    relTrack: 'comrades',
    relStage: 0,
    relPoints: 0,
    fragments: 0,
    motive: `See the ${v.name} frontier secured before winter.`,
    originHint: `Assigned from the ${v.name} reserve corps.`,
    active: true,
    defected: false,
    died: false,
    downHandled: false,
    freeSurpassUsed: false,
  };
}

export function syncPartnerBackToState(state: GameState, partner: WarPartnerState | null): void {
  if (!partner) return;
  if (partner.teamMemberId && state.team) {
    const m = state.team.members.find((mem) => mem.id === partner.teamMemberId);
    if (m) {
      m.trust = partner.trust;
      m.fit = partner.fit;
      m.relTrack = partner.relTrack;
      m.relStage = partner.relStage;
      m.relPoints = partner.relPoints;
      m.fragments = partner.fragments;
      if (partner.died) {
        m.alive = false;
        m.fateNote = `Fell fighting beside you during Great Shinobi War #${state.war?.warNumber ?? state.world.eraNumber} at age ${m.age}.`;
      } else if (partner.defected) {
        m.specialStatus = 'missing_nin';
        m.fateNote = `Defected during Great Shinobi War #${state.war?.warNumber ?? state.world.eraNumber}.`;
      }
    }
  }
  if (state.permanentPartner && state.permanentPartner.id === partner.id) {
    state.permanentPartner.trust = partner.trust;
    state.permanentPartner.relTrack = partner.relTrack;
    state.permanentPartner.relStage = partner.relStage;
    state.permanentPartner.relPoints = partner.relPoints;
    state.permanentPartner.fragments = partner.fragments;
    if (partner.died) {
      state.permanentPartner.alive = false;
      state.permanentPartner.diedAge = state.age;
      state.permanentPartner.causeOfDeath = `fell protecting you in Great Shinobi War #${state.war?.warNumber ?? state.world.eraNumber}`;
    } else if (partner.defected) {
      state.permanentPartner.alive = false;
      state.permanentPartner.causeOfDeath = `severed your bond and defected during War #${state.war?.warNumber ?? state.world.eraNumber}`;
    }
  }
  if (partner.died && partner.rosterId && !state.fallenRosterIds.includes(partner.rosterId)) {
    state.fallenRosterIds.push(partner.rosterId);
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
        const defectEnemy: WarCompetitor = {
          id: defectId,
          rosterId: partner.rosterId ?? defectId,
          name: partner.name,
          epithet: `${partner.epithet} (Turncoat)`,
          villageId: partner.villageId,
          archetype: partner.archetype,
          tactic: 'hunter',
          element: partner.element,
          officialRank: 'chunin',
          formerShinobi: true,
          threatClass: 'A',
          ranks: [3.8, 4.0, 3.6, 3.8, 3.7],
          skills: partner.skills.map((s) => ({ ...s })),
          ultimate: {
            name: 'Severed Pact Flash',
            role: 'attack',
            scope: 'single',
            rankVal: 4.3,
            cost: 26,
            desc: 'A ruthless strike turned against a former war partner.',
          },
          motive: 'Claim the sector alone after abandoning a spent commander.',
          originHint: partner.originHint,
          persona: buildShinobiPersona('hunter', partner.traits, partner.archetype),
          longGoal: 'dominate',
          shortGoal: 'strike_apex',
          planTargetId: 'player',
          allyId: strongest?.id ?? null,
          hp: Math.max(55, partner.hp),
          cp: 90,
          fort: 12,
          alive: true,
          intel: 100,
          ultimateSeen: true,
          skillsRevealed: true,
          knowPlayer: 65,
          kills: 0,
          survivedOnce: false,
          isExTeammateRogue: Boolean(partner.teamMemberId),
        };
        war.enemies.push(defectEnemy);
      }

      recordWarFact(war, {
        type: 'partner_defect',
        actorId: partner.id,
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
    id: partner.id,
    rosterId: partner.rosterId,
    teamMemberId: partner.teamMemberId,
    name: partner.name,
    epithet: partner.epithet,
    villageId: partner.villageId,
    element: partner.element,
    archetype: partner.archetype,
    trust: partner.trust,
    traits: [...partner.traits],
    skills: partner.skills.map((s) => ({ ...s })),
    relTrack: partner.relTrack,
    relStage: partner.relStage,
    relPoints: partner.relPoints,
    fragments: partner.fragments,
    motive: partner.motive,
    originHint: partner.originHint,
    alive: true,
    stayedAge: state.age,
  };
}
