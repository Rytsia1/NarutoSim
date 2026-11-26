import { ARCHETYPE_AVG } from '../data/roster';
import { unitBasePower } from './combat';
import { clamp, computeCombatProjection } from './powers';
import type { SeededRng } from './rng';
import type {
  CombatArchetype,
  GameState,
  LongGoal,
  NpcTactic,
  RelEdge,
  ShinobiPersona,
  ShortGoal,
  TraitId,
  WarCompetitor,
  WarState,
} from './types';

export function relKey(fromId: string, toId: string): string {
  return `${fromId}->${toId}`;
}

export function defaultRelEdge(): RelEdge {
  return {
    trust: 25,
    affection: 10,
    fear: 0,
    respect: 20,
    rivalry: 10,
    grudge: 0,
    owe: 0,
    slight: 0,
  };
}

export function buildShinobiPersona(
  tactic: NpcTactic,
  traits: TraitId[],
  archetype: CombatArchetype,
): ShinobiPersona {
  const p: ShinobiPersona = {
    pride: 45,
    cunning: 45,
    ruthless: 40,
    loyal: 45,
    caution: 45,
  };

  switch (tactic) {
    case 'proud':
      p.pride += 30;
      p.caution -= 10;
      break;
    case 'cunning':
      p.cunning += 30;
      p.caution += 15;
      p.ruthless += 12;
      break;
    case 'hunter':
      p.ruthless += 26;
      p.cunning += 14;
      p.loyal -= 10;
      break;
    case 'reckless':
      p.pride += 18;
      p.ruthless += 18;
      p.caution -= 25;
      break;
    case 'defensive':
      p.caution += 28;
      p.loyal += 18;
      p.ruthless -= 12;
      break;
    case 'desperate':
      p.ruthless += 20;
      p.caution -= 15;
      p.loyal += 10;
      break;
  }

  for (const tr of traits) {
    if (tr === 'honor') {
      p.pride += 12;
      p.loyal += 12;
      p.ruthless -= 10;
    } else if (tr === 'compassion') {
      p.loyal += 16;
      p.ruthless -= 18;
    } else if (tr === 'loyalty') {
      p.loyal += 22;
    } else if (tr === 'ambition') {
      p.pride += 14;
      p.ruthless += 14;
      p.cunning += 10;
    } else if (tr === 'freedom') {
      p.cunning += 8;
      p.loyal -= 8;
    }
  }

  if (archetype === 'artificer' || archetype === 'infiltrator') p.cunning += 10;
  if (archetype === 'juggernaut') p.pride += 10;

  return {
    pride: clamp(p.pride, 5, 98),
    cunning: clamp(p.cunning, 5, 98),
    ruthless: clamp(p.ruthless, 5, 98),
    loyal: clamp(p.loyal, 5, 98),
    caution: clamp(p.caution, 5, 98),
  };
}

export function getRel(war: WarState, fromId: string, toId: string): RelEdge {
  const key = relKey(fromId, toId);
  if (!war.relations[key]) {
    war.relations[key] = defaultRelEdge();
  }
  return war.relations[key];
}

export function modRel(
  war: WarState,
  fromId: string,
  toId: string,
  deltas: Partial<RelEdge>,
): RelEdge {
  const edge = getRel(war, fromId, toId);
  for (const [k, v] of Object.entries(deltas) as [keyof RelEdge, number][]) {
    const cap = k === 'owe' || k === 'slight' ? 10 : 100;
    edge[k] = clamp(edge[k] + v, 0, cap);
  }
  return edge;
}

export function initWarRelations(state: GameState, war: WarState): void {
  const actors = ['player', ...war.enemies.map((e) => e.id)];
  for (const a of actors) {
    for (const b of actors) {
      if (a === b) continue;
      war.relations[relKey(a, b)] = defaultRelEdge();
    }
  }

  for (const enemy of war.enemies) {
    if (enemy.isExTeammateRogue) {
      modRel(war, enemy.id, 'player', { rivalry: 38, respect: 25, grudge: 32, trust: -10 });
      modRel(war, 'player', enemy.id, { rivalry: 38, respect: 22, grudge: 25 });
    } else if (enemy.villageId === state.villageId && state.specialStatus !== 'missing_nin') {
      modRel(war, enemy.id, 'player', { respect: 24, trust: 28, affection: 14, rivalry: -10 });
      modRel(war, 'player', enemy.id, { respect: 24, trust: 28, affection: 14, rivalry: -10 });
    } else {
      modRel(war, enemy.id, 'player', { rivalry: 14 });
    }

    for (const other of war.enemies) {
      if (enemy.id === other.id) continue;
      if (enemy.villageId === other.villageId) {
        modRel(war, enemy.id, other.id, { trust: 26, respect: 18, affection: 10, rivalry: -10 });
      } else {
        modRel(war, enemy.id, other.id, { rivalry: 12 });
      }
    }
  }
}

/**
 * Unified Betrayal Score (inspired by GDD Ch. 08 betrayScore, clamped 0.01..0.95).
 */
export function computeBetrayScore(
  persona: ShinobiPersona,
  edge: RelEdge,
  targetHp: number,
  isFinal: boolean,
): number {
  const fearTerm = targetHp < 45 ? edge.fear * 0.003 : -edge.fear * 0.0045;
  const raw =
    0.12 +
    (persona.ruthless - 40) * 0.005 +
    edge.grudge * 0.006 +
    edge.rivalry * (isFinal ? 0.004 : 0.0015) +
    Math.max(0, 50 - edge.trust) * 0.0055 +
    Math.max(0, 30 - edge.affection) * 0.003 -
    edge.trust * 0.0035 -
    edge.affection * 0.003 -
    edge.respect * 0.0025 -
    (persona.loyal - 40) * 0.004 +
    edge.slight * 0.1 -
    edge.owe * 0.08 +
    fearTerm;

  return clamp(Number(raw.toFixed(3)), 0.01, 0.95);
}

export function evalThreatScore(
  state: GameState,
  war: WarState,
  observerId: string,
  targetId: string,
): number {
  const edge = getRel(war, observerId, targetId);
  if (targetId === 'player') {
    const proj = computeCombatProjection(state);
    const estPower = unitBasePower([proj.tai, proj.spd, proj.sta, proj.chk, proj.ins], war.hp);
    return estPower + war.kills * 10 + (war.workshop >= 100 ? 8 : 0) + war.fort * 0.35 + edge.fear * 0.25;
  }

  const target = war.enemies.find((e) => e.id === targetId);
  if (!target || !target.alive) return 0;

  const observer = war.enemies.find((e) => e.id === observerId);
  const knowsWell = observer ? observer.tactic === 'cunning' || war.day >= 5 : target.intel >= 40;
  const ranks = knowsWell ? target.ranks : ARCHETYPE_AVG[target.archetype];
  return unitBasePower(ranks, target.hp) + target.kills * 10 + target.fort * 0.35 + edge.fear * 0.25;
}

/**
 * Picks an NPC's Long-Term Goal with +20 stickiness.
 * Fixes GDD Bug B1: properly wires `persona.ruthless` (dominate) and `persona.loyal` (coalition).
 */
export function pickLongGoal(
  npc: WarCompetitor,
  isSelfApex: boolean,
  apexThreatDiff: number,
  aliveCount: number,
): LongGoal {
  const p = npc.persona;
  const scores: Record<LongGoal, number> = {
    territory: 30 + (npc.archetype === 'artificer' ? 28 : 0) + p.caution * 0.35 + (npc.fort >= 25 ? 10 : 0),
    topple_apex: (isSelfApex ? 5 : 26 + Math.max(0, apexThreatDiff) * 0.6) + p.pride * 0.28 + p.cunning * 0.2,
    outlast: 24 + p.caution * 0.45 + (npc.hp < 55 ? 24 : 0) + (aliveCount >= 5 ? 8 : -8),
    dominate: 20 + (isSelfApex ? 26 : 0) + p.ruthless * 0.42 + p.pride * 0.25 + npc.kills * 8,
    coalition:
      (isSelfApex ? 4 : 22 + Math.max(0, apexThreatDiff) * 0.45) +
      p.loyal * 0.32 +
      p.caution * 0.22 +
      (npc.allyId ? 12 : 0),
  };

  // +20 stickiness to keep current strategic commitment steady
  scores[npc.longGoal] += 20;

  let best: LongGoal = npc.longGoal;
  let bestVal = -Infinity;
  for (const [goal, val] of Object.entries(scores) as [LongGoal, number][]) {
    if (val > bestVal) {
      bestVal = val;
      best = goal;
    }
  }
  return best;
}

export function pickShortGoal(
  npc: WarCompetitor,
  apexId: string,
  weakestId: string,
): { shortGoal: ShortGoal; planTargetId: string | null } {
  if (npc.hp < 42 || npc.cp < 25) {
    return { shortGoal: 'preserve_chakra', planTargetId: null };
  }

  switch (npc.longGoal) {
    case 'territory':
      return npc.fort < 42
        ? { shortGoal: 'secure_camp', planTargetId: null }
        : { shortGoal: 'gather_intel', planTargetId: apexId };
    case 'outlast':
      return npc.fort < 35
        ? { shortGoal: 'secure_camp', planTargetId: null }
        : { shortGoal: 'preserve_chakra', planTargetId: null };
    case 'topple_apex':
      return { shortGoal: 'strike_apex', planTargetId: apexId !== npc.id ? apexId : weakestId };
    case 'dominate':
      return { shortGoal: 'hunt_weak', planTargetId: weakestId !== npc.id ? weakestId : apexId };
    case 'coalition':
      return !npc.allyId
        ? { shortGoal: 'find_ally', planTargetId: apexId }
        : { shortGoal: 'strike_apex', planTargetId: apexId !== npc.id ? apexId : weakestId };
  }
}

export function runDailyStrategicPlanner(state: GameState, war: WarState, _rng: SeededRng): void {
  const living = war.enemies.filter((e) => e.alive);
  if (living.length === 0) return;
  const allActorIds = ['player', ...living.map((e) => e.id)];

  for (const npc of living) {
    let apexId = 'player';
    let apexThreat = -Infinity;
    let weakestId = 'player';
    let highestVuln = -Infinity;
    const selfThreat = evalThreatScore(state, war, npc.id, npc.id);

    for (const candId of allActorIds) {
      const th = evalThreatScore(state, war, npc.id, candId);
      if (th > apexThreat) {
        apexThreat = th;
        apexId = candId;
      }
      if (candId === npc.id) continue;
      const candHp = candId === 'player' ? war.hp : (war.enemies.find((e) => e.id === candId)?.hp ?? 100);
      const candCp = candId === 'player' ? war.cp : (war.enemies.find((e) => e.id === candId)?.cp ?? 100);
      const vuln = (100 - candHp) + (candCp < 30 ? 20 : 0) - th * 0.15;
      if (vuln > highestVuln) {
        highestVuln = vuln;
        weakestId = candId;
      }
    }

    const isSelfApex = apexId === npc.id;
    npc.longGoal = pickLongGoal(npc, isSelfApex, apexThreat - selfThreat, allActorIds.length);
    const { shortGoal, planTargetId } = pickShortGoal(npc, apexId, weakestId);
    npc.shortGoal = shortGoal;
    npc.planTargetId = planTargetId;
  }
}

export function calcAllyAcceptChance(state: GameState, war: WarState, target: WarCompetitor): number {
  if (!target.alive) return 0;
  if (target.isExTeammateRogue) return 0.08;
  const edge = getRel(war, target.id, 'player');
  let p =
    0.28 +
    (target.tactic === 'defensive' || target.tactic === 'desperate' ? 0.22 : 0) -
    (target.persona.pride >= 65 ? 0.15 : 0) +
    (edge.trust - 25) * 0.0045 +
    edge.respect * 0.003 -
    edge.grudge * 0.0065 +
    state.stats.bonds / 380 +
    (target.hp < 55 ? 0.16 : 0) +
    (war.isCrisisWar ? 0.14 : 0) +
    (target.villageId === state.villageId ? 0.12 : 0);

  if (state.rank === 'jonin') p += 0.08;
  if (war.allyBetrayed) p -= 0.12;
  return clamp(Number(p.toFixed(2)), 0.05, 0.92);
}

export function evaluateAllyFinalIntent(
  state: GameState,
  war: WarState,
  ally: WarCompetitor,
  rng: SeededRng,
): 'share' | 'betray' | 'yield' {
  const edge = getRel(war, ally.id, 'player');
  const bScore = computeBetrayScore(ally.persona, edge, war.hp, true);

  let pBetray = ally.tactic === 'hunter' || ally.tactic === 'cunning' ? 0.42 : 0.16;
  let pYield = ally.tactic === 'defensive' ? 0.4 : 0.18;
  let pShare = 1 - pBetray - pYield;

  const sameVillageDiscount =
    ally.villageId === state.villageId && !ally.isExTeammateRogue && state.specialStatus !== 'missing_nin'
      ? 0.22
      : 0;
  pBetray = clamp(pBetray + (bScore - 0.35) * 0.7 - state.stats.bonds * 0.002 - sameVillageDiscount, 0.02, 0.8);
  pShare = clamp(pShare + edge.trust * 0.003 + edge.owe * 0.05 + sameVillageDiscount, 0.1, 0.9);
  pYield = Math.max(0.05, pYield);

  const total = pBetray + pShare + pYield;
  const roll = rng.next() * total;
  if (roll < pBetray) return 'betray';
  if (roll < pBetray + pShare) return 'share';
  return 'yield';
}

export const SHORT_GOAL_LABELS: Record<ShortGoal, string> = {
  preserve_chakra: 'Conserving Chakra',
  secure_camp: 'Fortifying Camp',
  gather_intel: 'Gathering Intel',
  find_ally: 'Seeking Alliance',
  hunt_weak: 'Hunting the Wounded',
  strike_apex: 'Targeting the Apex Threat',
};
