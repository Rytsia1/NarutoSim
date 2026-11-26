import { describe, expect, it } from 'vitest';
import { CLAN_MAP } from '../src/data/clans';
import { getKnownJutsu } from '../src/data/jutsu';
import { initAcademyState, pickAcademyEventDecision, resolveAcademyEventDecision, tickAcademyYear } from '../src/sim/academy';
import { pickClanPoliticsDecision, resolveClanPoliticsDecision } from '../src/sim/clan-heritage';
import { ShinobiSim } from '../src/sim/engine';
import { createNewLife } from '../src/sim/life';
import {
  buildProceduralMissionStageDecision,
  generateMissionContract,
  resolveProceduralMissionStage,
} from '../src/sim/missions';
import { canRunGovernanceAction, pickPoliticsDecision, resolvePoliticsDecision, runGovernanceAction } from '../src/sim/politics';
import { advanceChuninTournamentStage, finalizeChuninTournament, initChuninTournament, promoteRank } from '../src/sim/ranks';
import { adjustBidirectionalPlayerRel, deriveRelArchetype, getReciprocalVector, getRelVector } from '../src/sim/relationships';
import { SeededRng } from '../src/sim/rng';
import { formGeninTeam } from '../src/sim/team';
import { investigateTimelineEvent, recordTimelineEvent, revealTimelineTruth } from '../src/sim/timeline';

describe('6 Deep Immersion Pillars', () => {
  it('Pillar 1: separates Objective World Truth from Player Knowledge with 5 discovery channels', () => {
    const state = createNewLife(41001, { preferredVillage: 'konoha', crisisOverride: 'none' });
    const ws = state.worldSim!;
    const rng = new SeededRng(41001);

    // Seeded covert event starts with rumor only (player does NOT know truth yet!)
    const secretEv = ws.timeline!.find((e) => e.isSecret)!;
    expect(secretEv).toBeDefined();
    expect(secretEv.playerKnowsTruth).toBe(false);
    expect(secretEv.discoveryChannel).toBe('rumor');
    expect(secretEv.truthSummary).not.toBe(secretEv.rumorSummary);

    // Record a completely hidden covert military prep event
    const hiddenEv = recordTimelineEvent(state, ws, {
      category: 'military',
      villageIds: ['kumo', 'konoha'],
      truthTitle: 'Kumo Preparing Lightning Strike',
      truthSummary: 'Kumogakure mobilized elite strike units toward the northern Fire border.',
      rumorTitle: 'Unusual Patrols in Lightning Mountains',
      rumorSummary: 'Merchants heard rumors of closed mountain passes.',
      isSecret: true,
      immediateChannel: 'hidden',
    });
    expect(hiddenEv.knownByPlayer).toBe(false);
    expect(hiddenEv.playerKnowsTruth).toBe(false);

    // ANBU / Kage clearance reveals the secret truth via ANBU dossier
    state.specialStatus = 'anbu';
    const inv = investigateTimelineEvent(state, secretEv.id, rng);
    expect(inv.ok).toBe(true);
    expect(inv.revealed).toBe(true);
    expect(secretEv.playerKnowsTruth).toBe(true);
    expect(secretEv.discoveryChannel).toBe('anbu_dossier');

    // Mission report channel unlocks another hidden truth directly
    const unlocked = revealTimelineTruth(state, 'mission_report', 'B-Rank Recon Report', hiddenEv.id);
    expect(unlocked?.id).toBe(hiddenEv.id);
    expect(hiddenEv.knownByPlayer).toBe(true);
    expect(hiddenEv.playerKnowsTruth).toBe(true);
    expect(hiddenEv.discoveryChannel).toBe('mission_report');
  });

  it('Pillar 2: simulates multi-year Academy cohort and 14-participant independent Chunin Exam Tournament', () => {
    const state = createNewLife(42002, {
      customBuild: {
        mode: 'free',
        originId: 'clan_heir',
        villageId: 'konoha',
        clanId: 'nara',
        sex: 'M',
        name: 'Shikaro Nara',
        capacity: 3,
        element: 'earth',
        statOffsets: {},
      },
    });
    const rng = new SeededRng(42002);
    state.age = 6;
    promoteRank(state, 'academy');
    state.academy = initAcademyState(state, rng);

    expect(state.academy.classmateNpcIds.length).toBe(5);
    expect(state.academy.senseiName.length).toBeGreaterThan(2);

    // Run 3 years of Academy progression & events
    for (let yr = 7; yr <= 9; yr++) {
      state.age = yr;
      tickAcademyYear(state, rng);
      const ev = pickAcademyEventDecision(state, rng);
      expect(ev).not.toBeNull();
      const res = resolveAcademyEventDecision(state, ev!.options[0].id, ev!.meta, rng);
      expect(res.title.length).toBeGreaterThan(3);
    }
    expect(state.academy.bunshin).toBeGreaterThan(20);
    expect(state.academy.henge).toBeGreaterThan(20);
    expect(state.academy.kawarimi).toBeGreaterThan(20);

    // Graduate -> Genin Squad draws from actual Academy classmates!
    state.age = 12;
    promoteRank(state, 'genin');
    const team = formGeninTeam(state, rng);
    state.team = team;
    const acadNames = state.academy.classmateNpcIds.map(
      (id) => state.worldSim!.npcs.find((n) => n.identity.id === id)!.identity.name,
    );
    expect(acadNames).toContain(team.members[1].name);

    // Multi-participant Chunin Tournament (14 participants) runs independently even when player fails!
    state.age = 14;
    const tourney = initChuninTournament(state, rng);
    expect(tourney.participants.length).toBeGreaterThanOrEqual(12);
    advanceChuninTournamentStage(state, 1, rng);
    advanceChuninTournamentStage(state, 2, rng);
    advanceChuninTournamentStage(state, 3, rng);
    advanceChuninTournamentStage(state, 4, rng);
    expect(tourney.prelimOpponentId).not.toBeNull();
    const fin = finalizeChuninTournament(state, false, rng);
    expect(tourney.completed).toBe(true);
    expect(fin.summary.length).toBeGreaterThan(10);
  });

  it('Pillar 3: models 4-layer Clan Heritage (Identity, Lineage, Hiden unlocked via trial, Politics)', () => {
    const hyugaBranch = createNewLife(43003, {
      customBuild: {
        mode: 'free',
        originId: 'clan_branch',
        villageId: 'konoha',
        clanId: 'hyuga',
        sex: 'M',
        name: 'Nejiro Hyuga',
        capacity: 3,
        element: 'wind',
        statOffsets: {},
      },
    });

    const ch = hyugaBranch.clanHeritage!;
    expect(ch).toBeDefined();
    expect(ch.clanId).toBe('hyuga');
    expect(ch.lineageBranch).toBe('branch_house');
    expect(ch.cagedBirdSealed).toBe(true);
    // Not given peak Hiden automatically at birth!
    expect(ch.unlockedHiden.length).toBe(0);
    expect(getKnownJutsu(hyugaBranch).some((j) => j.id === 'hakke_kaiten')).toBe(false);

    // Konoha Aburame & Inuzuka clans exist with full Hiden metadata
    expect(CLAN_MAP.aburame.hidenArts.length).toBeGreaterThanOrEqual(2);
    expect(CLAN_MAP.inuzuka.hidenArts.length).toBeGreaterThanOrEqual(2);

    // Unlock Hiden art via training + high compatibility trial
    hyugaBranch.age = 14;
    hyugaBranch.stats.chakra = 80;
    hyugaBranch.stats.intel = 80;
    ch.compatibility = 85;
    ch.clanStanding = 65;
    ch.lastClanEventAge = 0;

    const rng = new SeededRng(43009);
    let trial = null;
    for (let i = 0; i < 15 && (!trial || trial.meta?.clanScenario !== 'hiden_trial'); i++) {
      ch.lastClanEventAge = 0;
      trial = pickClanPoliticsDecision(hyugaBranch, rng);
    }
    expect(trial).not.toBeNull();
    expect(trial!.meta?.clanScenario).toBe('hiden_trial');
    resolveClanPoliticsDecision(hyugaBranch, 'master_hiden', trial!.meta, rng);
    expect(ch.unlockedHiden.length).toBeGreaterThanOrEqual(1);
    const unlockedArt = CLAN_MAP.hyuga.hidenArts.find((a) => ch.unlockedHiden.includes(a.id))!;
    const knownAfter = getKnownJutsu(hyugaBranch);
    for (const jId of unlockedArt.jutsuIds) {
      expect(knownAfter.some((j) => j.id === jId)).toBe(true);
    }
  });

  it('Pillar 4: supports bidirectional 6-axis Relationship Simulation 2.0 with asymmetry', () => {
    const state = createNewLife(44004, { preferredVillage: 'konoha', crisisOverride: 'none' });
    const npc = state.worldSim!.npcs.find((n) => n.identity.alive && n.identity.villageId === 'konoha')!;

    // Asymmetric scenario: NPC fears and resents player, yet player still feels affection & trust!
    const rel = adjustBidirectionalPlayerRel(
      state,
      npc,
      { trust: -20, affection: -30, respect: 25, fear: 60, rivalry: 40, resentment: 65 },
      { trust: 25, affection: 30, respect: 20, fear: -5, rivalry: 25, resentment: -5 },
    );

    const npcToPlayer = getRelVector(rel);
    const playerToNpc = getReciprocalVector(rel);

    expect(npcToPlayer.resentment).toBeGreaterThanOrEqual(65);
    expect(npcToPlayer.fear).toBeGreaterThanOrEqual(60);
    expect(playerToNpc.affection).toBeGreaterThanOrEqual(70);
    expect(npcToPlayer.affection).toBeLessThan(playerToNpc.affection);

    const arch = deriveRelArchetype(npcToPlayer, playerToNpc);
    expect(arch).toBe('Bitter Nemesis');
  });

  it('Pillar 5: generates 8-component Procedural Missions with non-combat paths and persistent fallout', () => {
    const state = createNewLife(45005, { preferredVillage: 'suna', crisisOverride: 'none' });
    state.age = 16;
    promoteRank(state, 'chunin');
    state.stats.intel = 78;
    state.stats.bonds = 75;
    state.stats.will = 70;
    const rng = new SeededRng(45005);

    const contract = generateMissionContract(state, 'B', rng);
    expect(contract.objective.length).toBeGreaterThan(5);
    expect(contract.location.length).toBeGreaterThan(3);
    expect(contract.client.length).toBeGreaterThan(3);
    expect(contract.threat.length).toBeGreaterThan(3);
    expect(contract.constraint.length).toBeGreaterThan(5);
    expect(contract.squadLabel.length).toBeGreaterThan(3);
    expect(contract.hiddenComplicationTitle.length).toBeGreaterThan(3);
    expect(contract.complicationRevealed).toBe(false);

    // Stage 1: Non-combat path (Negotiate / Disguise / Infiltrate)
    state.activeMission = contract;
    const s1 = buildProceduralMissionStageDecision(state, contract);
    expect(s1.options.some((o) => o.id === 'negotiate')).toBe(true);
    expect(s1.options.some((o) => o.id === 'disguise')).toBe(true);
    expect(s1.options.some((o) => o.id === 'infiltrate')).toBe(true);

    const r1 = resolveProceduralMissionStage(state, 'negotiate', 1.0, rng);
    expect(r1.finished).toBe(false);
    expect(contract.complicationRevealed).toBe(true);
    expect(r1.nextDecision?.options.some((o) => o.id === 'save_comrades')).toBe(true);

    // Stage 2: Sacrifice Objective to Save Comrades creates persistent fallout & comrade debt
    const r2 = resolveProceduralMissionStage(state, 'save_comrades', 1.0, rng);
    expect(r2.finished).toBe(true);
    expect(r2.outcome).toBe('failure');
    expect(state.missionConsequences!.some((c) => c.kind === 'comrade_debt')).toBe(true);
    expect(state.missionConsequences!.some((c) => c.kind === 'reputation_hit')).toBe(true);
  });

  it('Pillar 6: engages Jonin & ANBU in mature politics and village governance without being Kage', () => {
    const state = createNewLife(46006, { preferredVillage: 'konoha', crisisOverride: 'none' });
    state.age = 22;
    promoteRank(state, 'jonin');
    state.specialStatus = 'anbu';
    state.nindo = 'protect_bonds';
    state.stats.ryo = 40;
    state.stats.intel = 75;
    state.stats.will = 75;
    const rng = new SeededRng(46006);

    // Governance actions available to Jonin / ANBU (NOT Kage!)
    expect(canRunGovernanceAction(state, 'gov_audit_corruption')).toBe(true);
    const beforeCorr = state.worldSim!.villages.konoha.politics!.corruption;
    const govRes = runGovernanceAction(state, 'gov_audit_corruption', rng);
    expect(govRes.ok).toBe(true);
    expect(state.worldSim!.villages.konoha.politics!.corruption).toBeLessThan(beforeCorr);

    // Political dilemma triggers for Jonin/ANBU without Kage rank
    let polDecision = null;
    for (let i = 0; i < 20 && !polDecision; i++) {
      state.lastPoliticsAge = undefined;
      polDecision = pickPoliticsDecision(state, rng);
    }
    expect(polDecision).not.toBeNull();
    expect(polDecision!.kind).toBe('politics_event');
    const resolved = resolvePoliticsDecision(state, polDecision!.options[0].id, polDecision!.meta, rng);
    expect(resolved.title.length).toBeGreaterThan(3);

    // 40-life headless stress test covering all 6 pillars end-to-end with 0 exceptions
    for (let i = 0; i < 40; i++) {
      const sim = new ShinobiSim();
      sim.newLife(160000 + i, { crisisOverride: i % 6 === 0 ? 'mastermind' : 'none' });
      let guard = 0;
      while (guard < 260) {
        guard += 1;
        const st = sim.getState();
        if (st.phase === 'posthumous') {
          sim.submitLastWords('Leave a light behind.');
          break;
        }
        if (st.phase === 'ended') break;
        if (st.pending) sim.autoChoice(true);
        else sim.stepYear();
      }
      expect(sim.getState().worldSim?.timeline?.length ?? 0).toBeGreaterThanOrEqual(1);
    }
  });
});
