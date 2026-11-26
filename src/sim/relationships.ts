import { clamp } from './powers';
import type {
  GameState,
  KizunaMember,
  NpcRelationKind,
  NpcRelationship,
  RelVector6,
  WorldNpc,
} from './types';

export function createRelVector6(seed?: Partial<RelVector6>): RelVector6 {
  return {
    trust: clamp(Math.round(seed?.trust ?? 45), 0, 100),
    affection: clamp(Math.round(seed?.affection ?? 45), 0, 100),
    respect: clamp(Math.round(seed?.respect ?? 45), 0, 100),
    fear: clamp(Math.round(seed?.fear ?? 10), 0, 100),
    rivalry: clamp(Math.round(seed?.rivalry ?? 15), 0, 100),
    resentment: clamp(Math.round(seed?.resentment ?? 8), 0, 100),
  };
}

export function applyRel6Delta(vec: RelVector6, delta: Partial<RelVector6>): RelVector6 {
  return {
    trust: clamp(Math.round(vec.trust + (delta.trust ?? 0)), 0, 100),
    affection: clamp(Math.round(vec.affection + (delta.affection ?? 0)), 0, 100),
    respect: clamp(Math.round(vec.respect + (delta.respect ?? 0)), 0, 100),
    fear: clamp(Math.round(vec.fear + (delta.fear ?? 0)), 0, 100),
    rivalry: clamp(Math.round(vec.rivalry + (delta.rivalry ?? 0)), 0, 100),
    resentment: clamp(Math.round(vec.resentment + (delta.resentment ?? 0)), 0, 100),
  };
}

export function buildVectorFromLegacy(rel: Pick<NpcRelationship, 'kind' | 'affinity' | 'trust' | 'grudge'>): RelVector6 {
  const aff = clamp(Math.round((rel.affinity + 100) / 2), 0, 100);
  const res = clamp(rel.grudge, 0, 100);
  const riv = rel.kind === 'rival' ? Math.max(60, Math.round(rel.trust * 0.5 + 25)) : rel.kind === 'enemy' ? 45 : 15;
  const respect = clamp(Math.round(rel.trust * 0.65 + (rel.kind === 'mentor' || rel.kind === 'rival' ? 22 : 12)), 0, 100);
  const fear = rel.kind === 'enemy' ? clamp(Math.round(res * 0.5), 10, 80) : 10;
  return createRelVector6({
    trust: rel.trust,
    affection: aff,
    respect,
    fear,
    rivalry: riv,
    resentment: res,
  });
}

export function getRelVector(rel: NpcRelationship): RelVector6 {
  if (!rel.vector) {
    rel.vector = buildVectorFromLegacy(rel);
  }
  return rel.vector;
}

export function getReciprocalVector(rel: NpcRelationship): RelVector6 {
  if (!rel.reciprocal) {
    const base = getRelVector(rel);
    rel.reciprocal = createRelVector6({
      trust: base.trust,
      affection: base.affection,
      respect: base.respect,
      fear: Math.max(5, Math.round(base.fear * 0.5)),
      rivalry: base.rivalry,
      resentment: Math.max(5, Math.round(base.resentment * 0.6)),
    });
  }
  return rel.reciprocal;
}

/**
 * Derives a rich dynamic relationship archetype from the 6-axis bidirectional vectors.
 */
export function deriveRelArchetype(npcToTarget: RelVector6, targetToNpc?: RelVector6): string {
  if (npcToTarget.resentment >= 70 && npcToTarget.respect >= 55) return 'Bitter Nemesis';
  if (npcToTarget.resentment >= 65) return 'Sworn Grudge';
  if (npcToTarget.fear >= 65 && npcToTarget.affection < 40) return 'Terrified Subordinate';
  if (npcToTarget.rivalry >= 68 && npcToTarget.respect >= 60) return 'Sworn Rival';
  if (npcToTarget.rivalry >= 65 && npcToTarget.resentment >= 45) return 'Bitter Rival';
  if (npcToTarget.trust >= 78 && npcToTarget.affection >= 75) return 'Unbreakable Confidant';
  if (
    targetToNpc &&
    targetToNpc.affection >= 65 &&
    npcToTarget.affection < 40 &&
    npcToTarget.resentment >= 40
  ) {
    return 'Fractured Bond';
  }
  if (npcToTarget.affection >= 70 && npcToTarget.respect >= 65) return 'Devoted Ally';
  if (npcToTarget.respect >= 72 && npcToTarget.trust < 50) return 'Wary Respect';
  if (npcToTarget.trust >= 60 && npcToTarget.affection >= 55) return 'Trusted Comrade';
  if (npcToTarget.fear >= 50) return 'Intimidated Peer';
  return 'Cautious Acquaintance';
}

/**
 * Updates BOTH directions of a Player <-> NPC relationship asymmetrically and mirrors onto linked Team members.
 */
export function adjustBidirectionalPlayerRel(
  state: GameState,
  npc: WorldNpc,
  npcToPlayerDelta: Partial<RelVector6>,
  playerToNpcDelta: Partial<RelVector6>,
  nextKind?: NpcRelationKind,
): NpcRelationship {
  const existing = npc.relationships.player;
  const baseNpcVec = existing
    ? getRelVector(existing)
    : createRelVector6({ trust: 45, affection: 45, respect: 45, fear: 10, rivalry: 15, resentment: 5 });
  const basePlayerVec = existing
    ? getReciprocalVector(existing)
    : createRelVector6({ trust: 45, affection: 45, respect: 45, fear: 8, rivalry: 15, resentment: 5 });

  const newNpcVec = applyRel6Delta(baseNpcVec, npcToPlayerDelta);
  const newPlayerVec = applyRel6Delta(basePlayerVec, playerToNpcDelta);

  const kind: NpcRelationKind =
    nextKind ??
    existing?.kind ??
    (newNpcVec.resentment >= 65
      ? 'enemy'
      : newNpcVec.rivalry >= 60
        ? 'rival'
        : newNpcVec.trust >= 60 && newNpcVec.affection >= 60
          ? 'friend'
          : 'ally');

  const updated: NpcRelationship = {
    targetId: 'player',
    targetName: state.name,
    kind,
    trust: newNpcVec.trust,
    affinity: clamp(newNpcVec.affection * 2 - 100, -100, 100),
    grudge: newNpcVec.resentment,
    vector: newNpcVec,
    reciprocal: newPlayerVec,
  };
  npc.relationships.player = updated;

  // Update role-local bond cache on KizunaMember if this person is in the player's squad
  if (state.team) {
    const member = state.team.members.find((m) => m.personId === npc.identity.id);
    if (member) {
      member.trust = newNpcVec.trust;
      member.rel6 = { ...newNpcVec };
      member.playerFeelings = { ...newPlayerVec };
    }
  }
  return updated;
}

/**
 * Ensures all KizunaMembers and WorldNpc relationships have initialized 6-axis RelVector6 fields.
 */
export function ensureRel6Defaults(state: GameState): void {
  if (state.team) {
    for (const m of state.team.members) {
      syncKizunaMemberRel6(m, state.rivalId === m.personId);
    }
  }
  if (state.worldSim) {
    for (const npc of state.worldSim.npcs) {
      for (const rel of Object.values(npc.relationships)) {
        if (!rel.vector) rel.vector = buildVectorFromLegacy(rel);
        if (rel.targetId === 'player' && !rel.reciprocal) {
          rel.reciprocal = getReciprocalVector(rel);
        }
      }
    }
  }
}

export function syncKizunaMemberRel6(member: KizunaMember, isRival: boolean): void {
  if (!member.rel6) {
    member.rel6 = createRelVector6({
      trust: member.trust,
      affection: clamp(member.trust + (member.relTrack === 'romance' ? 14 : 4), 10, 100),
      respect: clamp(member.trust + (member.role === 'sensei' ? 10 : isRival ? 18 : 5), 10, 100),
      fear: 10,
      rivalry: isRival ? 68 : member.role === 'teammate' ? 28 : 8,
      resentment: member.trust < 35 ? clamp(55 - member.trust, 10, 90) : 6,
    });
  } else {
    member.rel6.trust = member.trust;
  }
  if (!member.playerFeelings) {
    member.playerFeelings = createRelVector6({
      trust: member.trust,
      affection: clamp(member.trust + 4, 15, 100),
      respect: clamp(member.role === 'sensei' ? 70 : member.trust + 5, 15, 100),
      fear: member.role === 'sensei' ? 18 : 6,
      rivalry: isRival ? 65 : 20,
      resentment: 5,
    });
  }
}
