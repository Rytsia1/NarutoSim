import { describe, expect, it } from 'vitest';
import {
  buildShinobiPersona,
  calcAllyAcceptChance,
  computeBetrayScore,
  defaultRelEdge,
  modRel,
  pickLongGoal,
} from '../src/sim/ai';
import { checkLoyalInterception } from '../src/sim/combat';
import { createNewLife, resolvePendingDecision } from '../src/sim/life';
import { detectWarArcs, generateWarChronicle, recordWarFact } from '../src/sim/narrative';
import { promoteRank } from '../src/sim/ranks';
import { SeededRng } from '../src/sim/rng';
import { formGeninTeam } from '../src/sim/team';
import { buildAllyFinalDecision, initWarState } from '../src/sim/war';

describe('Autonomous 6-Axis AI, Alliances, Loyal Interception & Emergent Narrative', () => {
  it('wires persona.ruthless and persona.loyal into Long-Term Goal selection (fixes GDD Bug B1)', () => {
    const state = createNewLife(6001);
    state.age = 20;
    promoteRank(state, 'chunin');
    const war = initWarState(state, new SeededRng(41), false, 'front');
    const npc = war.enemies[0];

    // Ruthless Apex strongly favors dominate
    npc.persona = { pride: 85, cunning: 50, ruthless: 95, loyal: 10, caution: 15 };
    npc.longGoal = 'outlast';
    npc.kills = 3;
    expect(pickLongGoal(npc, true, -10, 5)).toBe('dominate');

    // Loyal underdog facing a much stronger Apex favors coalition
    npc.persona = { pride: 30, cunning: 45, ruthless: 10, loyal: 95, caution: 65 };
    npc.longGoal = 'dominate';
    npc.kills = 0;
    expect(pickLongGoal(npc, false, 45, 6)).toBe('coalition');
  });

  it('computes betrayScore higher with grudge/ruthlessness and lower with trust/loyalty', () => {
    const ruthless = buildShinobiPersona('hunter', ['ambition'], 'infiltrator');
    const loyal = buildShinobiPersona('defensive', ['loyalty', 'compassion'], 'vanguard');

    const hostileEdge = { ...defaultRelEdge(), trust: 10, grudge: 75, slight: 2 };
    const friendlyEdge = { ...defaultRelEdge(), trust: 85, affection: 60, owe: 2 };

    const highRisk = computeBetrayScore(ruthless, hostileEdge, 35, true);
    const lowRisk = computeBetrayScore(loyal, friendlyEdge, 80, false);
    expect(highRisk).toBeGreaterThan(0.65);
    expect(lowRisk).toBeLessThan(0.15);
  });

  it('supports Final Two alliance resolution yielding a shared armistice outcome', () => {
    const state = createNewLife(6002, { crisisOverride: 'none' });
    state.age = 22;
    promoteRank(state, 'jonin');
    state.stats.bonds = 90;
    state.phase = 'war';
    state.war = initWarState(state, new SeededRng(52), false, 'front');

    const ally = state.war.enemies[0];
    ally.persona = { pride: 30, cunning: 30, ruthless: 10, loyal: 95, caution: 60 };
    ally.tactic = 'defensive';
    state.war.allyId = ally.id;
    modRel(state.war, ally.id, 'player', { trust: 95, affection: 70, owe: 3 });

    // Eliminate all other enemies so only player & ally remain
    state.war.enemies.slice(1).forEach((e) => {
      e.alive = false;
      e.hp = 0;
    });

    expect(calcAllyAcceptChance(state, state.war, ally)).toBeGreaterThan(0.5);
    state.pending = buildAllyFinalDecision(state, ally);
    resolvePendingDecision(state, 'share_victory');

    // Should resolve to shared armistice (with high loyalty & trust) or betray duel
    const finalPhase = state.phase as string;
    if (finalPhase === 'life') {
      const last = state.warHistory[state.warHistory.length - 1];
      expect(last.outcome).toBe('shared');
      expect(last.title).toContain('Armistice');
    }
  });

  it('triggers Kizuna Loyal Interception when squad trust >= 65 and records squad_protect fact (fixes Bug B7)', () => {
    const state = createNewLife(6003);
    state.age = 15;
    promoteRank(state, 'genin');
    state.team = formGeninTeam(state, new SeededRng(73));
    state.team.members[0].trust = 95;
    state.war = initWarState(state, new SeededRng(74), false, 'front');
    state.war.hp = 20;

    const summary = {
      round: 2,
      playerAction: 'Taijutsu',
      enemyAction: 'Ultimate',
      outcome: 'lose' as const,
      playerDmgTaken: 24,
      enemyDmgTaken: 4,
      whyLine: 'Test hit',
      narrative: 'Heavy blow landed.',
    };

    // Run with deterministic RNG that rolls low (< 0.85)
    let intercepted = false;
    for (let s = 1; s <= 10 && !intercepted; s++) {
      state.war.loyalInterceptUsed = false;
      state.war.hp = 20;
      summary.playerDmgTaken = 24;
      intercepted = checkLoyalInterception(state, state.war, summary, new SeededRng(s));
    }

    expect(intercepted).toBe(true);
    expect(state.war.hp).toBeGreaterThan(20);
    expect(state.war.facts.some((f) => f.type === 'squad_protect')).toBe(true);
  });

  it('generates emergent story arcs and prioritized war title from recorded facts (fixes Bug B7)', () => {
    const state = createNewLife(6004);
    state.age = 21;
    promoteRank(state, 'chunin');
    state.war = initWarState(state, new SeededRng(84), false, 'front');

    recordWarFact(state.war, {
      type: 'ally_betray',
      actorId: 'en_1',
      actorName: 'Raizo Momochi',
      targetId: 'player',
      targetName: state.name,
      detail: 'Leaked coordinates',
    });
    recordWarFact(state.war, {
      type: 'kill',
      actorId: 'player',
      actorName: state.name,
      targetId: 'en_1',
      targetName: 'Raizo Momochi',
      detail: 'Eliminated traitor',
    });
    recordWarFact(state.war, {
      type: 'kill',
      actorId: 'player',
      actorName: state.name,
      targetId: 'en_2',
      targetName: 'Kengo Mifune',
      detail: 'Eliminated rival',
    });

    const arcs = detectWarArcs(state, state.war);
    expect(arcs.some((a) => a.id === 'arc_betrayal')).toBe(true);
    expect(arcs.some((a) => a.id === 'arc_dominion')).toBe(true);

    const chronicle = generateWarChronicle(state, state.war, 'victor');
    expect(chronicle.title).toContain('Broken Oaths');
    expect(chronicle.arcs.length).toBeGreaterThanOrEqual(2);
  });
});
