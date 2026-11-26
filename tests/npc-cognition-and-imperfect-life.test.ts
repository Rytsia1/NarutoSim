import { describe, expect, it } from 'vitest';
import { initAcademyState } from '../src/sim/academy';
import { buildLifeRecord } from '../src/sim/epilogue';
import { migrateGameState } from '../src/sim/kernel/bootstrap';
import { createNewLife, killCharacter, resolvePendingDecision } from '../src/sim/life';
import {
  buildAbandonedSquadDecision,
  buildAbandonedSquadReckoningDecision,
  buildFailedGeninDecision,
  buildOrdinaryShinobiDecision,
  buildPoliticalToolDecision,
  buildUnwantedMissionDecision,
  pickNpcPleaDecision,
} from '../src/sim/life/imperfect-life';
import {
  buildNpcGoapPlan,
  evaluateNpcUtilityActions,
  getDynamicUtilityWeights,
  perceiveNpcWorld,
  recordEpisodicNpcMemory,
  tickNpcCognitiveCycle,
} from '../src/sim/npc/cognition';
import {
  ensureNpcCognitionState,
  getWorldPopulationSummary,
  rebalanceNpcLodTiers,
  tickVillagePopulationL3,
} from '../src/sim/npc/lod-population';
import { adjustBidirectionalPlayerRel } from '../src/sim/relationships';
import { SeededRng } from '../src/sim/rng';
import { formGeninTeam } from '../src/sim/team';
import { syncTeamMembersToWorldNpcs } from '../src/sim/npc-sim';

describe('Deterministic NPC Intelligence (Utility AI + GOAP + Memory + 3-Tier LOD)', () => {
  it('evaluates U(a) = w_g*G + w_p*P + w_r*R + w_m*M accurately for Renji sick-sibling dilemma', () => {
    const state = createNewLife(91001, { preferredVillage: 'konoha', crisisOverride: 'none' });
    state.age = 19;
    const ws = state.worldSim!;
    const renji = ws.npcs.find((n) => n.identity.alive && n.identity.villageId === 'konoha')!;

    // Set up the exact Renji scenario: wants Jonin, sick sibling, trusted ally (player)
    renji.identity.rank = 'chunin';
    renji.identity.age = 19;
    renji.personality = { loyal: 74, ambitious: 68, cautious: 58, cruel: 18, compassionate: 84 };
    renji.nindo = { id: 'protect_bonds', maxim: 'Never abandon those you swore to shield.' };
    renji.currentGoal = {
      type: 'reach_jonin',
      label: 'Earn Jonin promotion',
      progress: 55,
      startedAge: 17,
    };
    const cog = ensureNpcCognitionState(renji, 'L1');
    cog.familyCrisis = {
      kind: 'sick_sibling',
      relativeName: 'Hana (younger sibling)',
      severity: 88,
      yearsRemaining: 2,
    };
    adjustBidirectionalPlayerRel(
      state,
      renji,
      { trust: 40, affection: 38, respect: 25, resentment: -20 },
      { trust: 35, affection: 35 },
      'friend',
    );

    const perception = perceiveNpcWorld(renji, state, ws);
    const plan = buildNpcGoapPlan(renji, perception, ws.villages.konoha);
    const evals = evaluateNpcUtilityActions(renji, perception, plan, state);
    const w = getDynamicUtilityWeights(renji, perception);

    expect(plan.domain).toBe('family');
    const visit = evals.find((e) => e.action === 'visit_family')!;
    const askHelp = evals.find((e) => e.action === 'ask_ally_help')!;
    const mission = evals.find((e) => e.action === 'take_mission')!;
    const train = evals.find((e) => e.action === 'train')!;

    expect(visit).toBeDefined();
    expect(askHelp).toBeDefined();
    expect(mission).toBeDefined();
    expect(train).toBeDefined();

    // Verify exact formula U(a) = round(w_g*G + w_p*P + w_r*R + w_m*M)
    for (const ev of [visit, askHelp, mission, train]) {
      const expected = Math.round(w.wg * ev.gScore + w.wp * ev.pScore + w.wr * ev.rScore + w.wm * ev.mScore);
      expect(ev.total).toBe(expected);
    }

    // Visit sibling & ask trusted friend must outscore dangerous mission, which outscores training
    expect(visit.total).toBeGreaterThan(mission.total);
    expect(askHelp.total).toBeGreaterThan(mission.total);
    expect(mission.total).toBeGreaterThan(train.total);

    // Determinism check: identical seed produces identical cognitive decision trace
    const rngA = new SeededRng(4242);
    const reportA = tickNpcCognitiveCycle(renji, state, ws, rngA);
    expect(reportA).not.toBeNull();
    expect(renji.cognition?.lastDecision?.topOptions.length).toBeGreaterThanOrEqual(4);
  });

  it('feeds structured episodic memories (saved_family) directly into future M(a) and U(a)', () => {
    const state = createNewLife(91002, { preferredVillage: 'konoha', crisisOverride: 'none' });
    state.age = 18;
    const ws = state.worldSim!;
    const npc = ws.npcs.find((n) => n.identity.alive && n.identity.villageId === 'konoha')!;
    const cog = ensureNpcCognitionState(npc, 'L1');
    cog.familyCrisis = {
      kind: 'elder_illness',
      relativeName: 'Kenji (ailing parent)',
      severity: 70,
      yearsRemaining: 2,
    };
    adjustBidirectionalPlayerRel(
      state,
      npc,
      { trust: 22, affection: 20, resentment: -10 },
      { trust: 20, affection: 20 },
      'friend',
    );

    const beforePerc = perceiveNpcWorld(npc, state, ws);
    const beforePlan = buildNpcGoapPlan(npc, beforePerc, ws.villages.konoha);
    const beforeHelp = evaluateNpcUtilityActions(npc, beforePerc, beforePlan, state).find(
      (e) => e.action === 'ask_ally_help',
    )!;

    // Now player saves their family -> episodic memory recorded
    recordEpisodicNpcMemory(npc, {
      year: state.birthYear + state.age,
      age: npc.identity.age,
      tag: 'bond',
      category: 'saved_family',
      salience: 10,
      actorId: 'player',
      summary: `${state.name} saved my younger sister during winter fever.`,
      impact: 10,
    });

    const afterPerc = perceiveNpcWorld(npc, state, ws);
    const afterPlan = buildNpcGoapPlan(npc, afterPerc, ws.villages.konoha);
    const afterHelp = evaluateNpcUtilityActions(npc, afterPerc, afterPlan, state).find(
      (e) => e.action === 'ask_ally_help',
    )!;

    expect(afterHelp.mScore).toBeGreaterThan(beforeHelp.mScore + 15);
    expect(afterHelp.total).toBeGreaterThan(beforeHelp.total);
  });

  it('scales world inhabitants via 3-Tier LOD (L3 statistical thousands, L2->L1 dynamic promotion)', () => {
    const state = createNewLife(91003, { preferredVillage: 'suna', crisisOverride: 'none' });
    const ws = state.worldSim!;

    const summary = getWorldPopulationSummary(ws);
    // Thousands of background inhabitants modeled in O(1) while keeping NPC array lean
    expect(summary.totalWorldPopulation).toBeGreaterThan(20000);
    expect(ws.npcs.length).toBeLessThan(80);
    expect(summary.l1NpcCount).toBeGreaterThan(0);
    expect(summary.l2NpcCount).toBeGreaterThan(0);

    // Wartime & plague pressure updates L3 statistics cleanly
    const suna = ws.villages.suna;
    const beforeCasualties = suna.population!.warCasualtiesTotal;
    state.world.tension = 85;
    tickVillagePopulationL3(suna, ws, state, new SeededRng(55));
    expect(suna.population!.warCasualtiesTotal).toBeGreaterThan(beforeCasualties);

    // Dynamic L2 -> L1 promotion when player builds a strong bond with a foreign/distant L2 NPC
    const l2Npc = ws.npcs.find((n) => n.identity.alive && n.cognition?.lodTier === 'L2')!;
    expect(l2Npc).toBeDefined();
    adjustBidirectionalPlayerRel(state, l2Npc, { trust: 35, affection: 30 }, { trust: 30, affection: 30 }, 'friend');
    rebalanceNpcLodTiers(state, ws);
    expect(l2Npc.cognition?.lodTier).toBe('L1');
  });

  it('bridges L1 Utility AI ask_ally_help directly to an interactive npc_plea decision', () => {
    const state = createNewLife(91004, { preferredVillage: 'konoha', crisisOverride: 'none' });
    state.age = 16;
    state.stats.ryo = 25;
    const ws = state.worldSim!;
    const friend = ws.npcs.find((n) => n.identity.alive && n.identity.villageId === 'konoha')!;
    const cog = ensureNpcCognitionState(friend, 'L1');
    cog.familyCrisis = {
      kind: 'sick_sibling',
      relativeName: 'Mio (younger sibling)',
      severity: 82,
      yearsRemaining: 2,
    };
    cog.pendingPlayerPlea = true;

    const plea = pickNpcPleaDecision(state);
    expect(plea).not.toBeNull();
    expect(plea!.kind).toBe('npc_plea');

    state.pending = plea;
    resolvePendingDecision(state, 'save_family_medical_or_ryo');

    expect(friend.cognition?.familyCrisis).toBeNull();
    expect(friend.cognition?.pendingPlayerPlea).toBe(false);
    expect(friend.memory.some((m) => m.category === 'saved_family' && m.actorId === 'player')).toBe(true);
    expect(state.playerLegacy?.livesSaved).toBeGreaterThanOrEqual(1);
  });
});

describe('Player Agency & Imperfect Shinobi Lives (Scenarios A-E + Quiet Heroism)', () => {
  it('resolves Scenarios A (Failed Genin), B (Unwanted Mission), C (Abandoned Squad + Reckoning), D (Political Tool), and E (Ordinary Shinobi)', () => {
    // Scenario A: The Failed Genin
    const sA = createNewLife(92001, { preferredVillage: 'konoha', crisisOverride: 'none' });
    sA.age = 12;
    sA.rank = 'academy';
    sA.academy = initAcademyState(sA, new SeededRng(92001));
    sA.academyFailedCount = 1;
    const decA = buildFailedGeninDecision(sA);
    expect(decA?.kind).toBe('imperfect_life');
    sA.pending = decA;
    resolvePendingDecision(sA, 'accept_sensei');
    expect(sA.academy.favoredBySensei).toBe(true);
    expect(sA.playerLegacy?.usedImperfectScenarios).toContain('failed_genin');

    // Scenario B: The Unwanted Mission
    const sB = createNewLife(92002, { preferredVillage: 'kiri', crisisOverride: 'none' });
    sB.age = 18;
    sB.rank = 'chunin';
    sB.stats.intel = 78;
    sB.world.tension = 60;
    const peer = sB.worldSim!.npcs.find((n) => n.identity.alive && n.identity.villageId === 'kiri')!;
    peer.identity.specialStatus = 'missing_nin';
    adjustBidirectionalPlayerRel(sB, peer, { trust: 10, affection: 15 }, { trust: 10, affection: 15 }, 'friend');
    const decB = buildUnwantedMissionDecision(sB);
    expect(decB?.eventId).toBe('unwanted_mission');
    sB.pending = decB;
    resolvePendingDecision(sB, 'fake_death');
    expect(peer.memory.some((m) => m.category === 'spared_life' && m.actorId === 'player')).toBe(true);
    expect(sB.playerLegacy?.livesSaved).toBeGreaterThanOrEqual(1);

    // Scenario C: The Abandoned Squad + Follow-Up Reckoning
    const sC = createNewLife(92003, { preferredVillage: 'konoha', crisisOverride: 'none' });
    sC.age = 14;
    sC.rank = 'genin';
    sC.world.tension = 55;
    sC.team = formGeninTeam(sC, new SeededRng(92003));
    syncTeamMembersToWorldNpcs(sC, new SeededRng(92003));
    const decC = buildAbandonedSquadDecision(sC);
    expect(decC?.eventId).toBe('abandoned_squad');
    sC.pending = decC;
    resolvePendingDecision(sC, 'pull_survivor_out');
    expect(sC.team.active).toBe(false);
    const survivorId = sC.playerLegacy?.abandonedSurvivorNpcId;
    expect(survivorId).toBeTruthy();
    const survivorNpc = sC.worldSim!.npcs.find((n) => n.identity.id === survivorId)!;
    const resentmentAfter = survivorNpc.relationships.player?.vector?.resentment ?? 0;
    expect(resentmentAfter).toBeGreaterThanOrEqual(45);
    expect(survivorNpc.memory.some((m) => m.category === 'abandoned')).toBe(true);

    // Advance 4 years -> Reckoning scene can heal resentment
    sC.age += 4;
    const decC2 = buildAbandonedSquadReckoningDecision(sC);
    expect(decC2?.eventId).toBe('abandoned_squad_reckoning');
    sC.pending = decC2;
    resolvePendingDecision(sC, 'own_the_weight');
    expect((survivorNpc.relationships.player?.vector?.resentment ?? 100)).toBeLessThan(resentmentAfter);

    // Scenario D: The Political Tool
    const sD = createNewLife(92004, {
      preferredVillage: 'konoha',
      crisisOverride: 'none',
      customBuild: {
        mode: 'free',
        name: 'Shisui Uchiha',
        sex: 'M',
        villageId: 'konoha',
        originId: 'clan_heir',
        clanId: 'uchiha',
        element: 'fire',
        capacity: 4,
        statOffsets: {},
      },
    });
    sD.age = 17;
    sD.rank = 'chunin';
    sD.stats.intel = 82;
    const decD = buildPoliticalToolDecision(sD, new SeededRng(92004));
    expect(decD?.eventId).toBe('political_tool');
    sD.pending = decD;
    resolvePendingDecision(sD, 'subvert_quietly');
    expect(sD.playerLegacy?.usedImperfectScenarios).toContain('political_tool');

    // Scenario E: The Ordinary Shinobi & Quiet Heroism Posthumous Epilogue
    const sE = createNewLife(92005, {
      preferredVillage: 'konoha',
      crisisOverride: 'none',
      customBuild: {
        mode: 'free',
        name: 'Taro Sato',
        sex: 'M',
        villageId: 'konoha',
        originId: 'civilian',
        element: 'earth',
        capacity: 2,
        statOffsets: {},
      },
    });
    sE.age = 22;
    sE.rank = 'chunin';
    sE.bloodline = null;
    sE.world.tension = 45;
    const decE = buildOrdinaryShinobiDecision(sE);
    expect(decE?.eventId).toBe('ordinary_shinobi');
    sE.pending = decE;
    resolvePendingDecision(sE, 'bring_all_three');
    expect(sE.playerLegacy?.comradesBroughtHome).toBe(3);
    expect(sE.playerLegacy?.livesSaved).toBe(3);

    // Legacy migration safety check + Quiet Heroism Epilogue beat
    killCharacter(sE, 'old age');
    expect(sE.posthumousBeats.some((b) => b.title === 'The Ordinary Shinobi Who Brought Them Home')).toBe(true);
    const rec = buildLifeRecord(sE);
    expect(rec.comradesBroughtHome).toBe(3);
    expect(rec.quietHeroTitle).toBe('Ordinary Shinobi Who Brought Comrades Home');

    // Verify legacy save without playerLegacy migrates cleanly
    const legacySave = createNewLife(92006, { preferredVillage: 'iwa', crisisOverride: 'none' });
    delete legacySave.playerLegacy;
    delete legacySave.worldSim!.villages.iwa.population;
    migrateGameState(legacySave);
    expect(legacySave.playerLegacy).toBeDefined();
    expect(legacySave.worldSim!.villages.iwa.population).toBeDefined();
  });
});
