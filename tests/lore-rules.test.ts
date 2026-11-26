import { describe, expect, it } from 'vitest';
import { getKnownJutsu } from '../src/data/jutsu';
import { VILLAGE_MAP, VILLAGES } from '../src/data/villages';
import { resolveBattleRound } from '../src/sim/combat';
import { canTriggerConvictionRoute, startConvictionRoute } from '../src/sim/crises';
import { buildRetirementEventDecision } from '../src/sim/epilogue';
import { advanceYear, createNewLife, resolvePendingDecision } from '../src/sim/life';
import { buildInitialVillagePopulation } from '../src/sim/npc/lod-population';
import { generateCharacter, getPerson, killPerson } from '../src/sim/people';
import { pickPoliticsDecision } from '../src/sim/politics';
import { tryBloodlineEvent } from '../src/sim/powers';
import {
  buildChuninExamStage,
  canTakeChuninExam,
  finalizeChuninTournament,
  initChuninTournament,
  promoteRank,
} from '../src/sim/ranks';
import { SeededRng } from '../src/sim/rng';
import { canReceive } from '../src/sim/status-gates';
import { formGeninTeam } from '../src/sim/team';
import { initWarState, startWarBattle } from '../src/sim/war';
import { buildWarPreludeDecision } from '../src/sim/world';
import { applyPlayerActionToWorldSim, tickAutonomousWorldYear } from '../src/sim/world-sim';

describe('Lore Audit Rules & Invariants (Tiers A-F)', () => {
  it('A1: combatant shinobi children enroll in Academy at 6-11 and graduate to Genin at age 12-13', () => {
    const state = createNewLife(91001, { preferredVillage: 'konoha', crisisOverride: 'none' });
    const rng = new SeededRng(91001);
    const child = generateCharacter(
      state,
      {
        villageId: 'konoha',
        occupation: 'shinobi',
        age: 5,
        rank: 'civilian',
        roleTitle: 'Child',
        lodTier: 'L1',
        observed: true,
      },
      rng,
    );

    let sawAcademy = false;
    let graduatedAtAge: number | null = null;
    for (let y = 0; y < 9; y++) {
      state.age += 1;
      tickAutonomousWorldYear(state, rng);
      if (!child.identity.alive) break;
      if (child.identity.rank === 'academy') sawAcademy = true;
      if (child.identity.rank === 'genin' && graduatedAtAge === null) {
        graduatedAtAge = child.identity.age;
      }
    }

    expect(sawAcademy).toBe(true);
    expect(graduatedAtAge).not.toBeNull();
    expect(graduatedAtAge!).toBeGreaterThanOrEqual(12);
    expect(graduatedAtAge!).toBeLessThanOrEqual(13);
  });

  it('A2: strictly at most one living Kage per village and vacant seats are always refilled', () => {
    const state = createNewLife(91002, { preferredVillage: 'konoha', crisisOverride: 'none' });
    const rng = new SeededRng(91002);
    const ws = state.worldSim!;

    // Kill the Konoha Kage and verify seat is vacated & refilled cleanly
    const oldKageId = ws.villages.konoha.kageNpcId!;
    expect(oldKageId).not.toBeNull();
    killPerson(state, oldKageId, state.birthYear + state.age, 'test succession');
    expect(ws.villages.konoha.kageNpcId).toBeNull();

    state.age += 1;
    tickAutonomousWorldYear(state, rng);
    expect(ws.villages.konoha.kageNpcId).not.toBeNull();
    expect(ws.villages.konoha.kageNpcId).not.toBe(oldKageId);

    // Promote player to Kage and confirm zero duplicate living Kages in any village
    promoteRank(state, 'jonin');
    state.specialStatus = 'kage';
    applyPlayerActionToWorldSim(state, { type: 'kage_ascend' });
    state.age += 1;
    tickAutonomousWorldYear(state, rng);

    for (const v of VILLAGES) {
      const livingNpcKages = ws.npcs.filter(
        (n) => n.identity.alive && n.identity.villageId === v.id && n.identity.specialStatus === 'kage',
      );
      const playerIsKageHere = state.villageId === v.id && state.specialStatus === 'kage';
      expect(livingNpcKages.length + (playerIsKageHere ? 1 : 0)).toBeLessThanOrEqual(1);
    }
  });

  it('A3: failing Chunin Stage 3 finalizes the tournament and prevents eliminated teammates from passing', () => {
    const state = createNewLife(91003, { preferredVillage: 'konoha', crisisOverride: 'none' });
    const rng = new SeededRng(91003);
    state.age = 14;
    promoteRank(state, 'genin');
    state.geninSinceAge = 12;
    state.team = formGeninTeam(state, rng);
    const tourney = initChuninTournament(state, rng);

    const res = finalizeChuninTournament(state, false, rng, 3);
    expect(tourney.completed).toBe(true);
    expect(res.promotedTeammates.length).toBe(0);

    const teammateEntries = tourney.participants.filter((p) => p.isTeammate);
    expect(teammateEntries.length).toBeGreaterThan(0);
    for (const tm of teammateEntries) {
      expect(tm.status).not.toBe('promoted');
      const npc = getPerson(state, tm.personId);
      expect(npc?.identity.rank).toBe('genin');
    }

    // Also verify eliminated rival is never chosen in Stage 6 Finals
    const stage6 = buildChuninExamStage(state, 6);
    if (state.rivalId) {
      const rivalName = getPerson(state, state.rivalId)?.identity.name ?? '';
      expect(stage6.title).not.toContain(rivalName);
    }
  });

  it('A4: slain squadmates never appear at the Conviction Route final confrontation', () => {
    const state = createNewLife(91004, { preferredVillage: 'konoha', crisisOverride: 'none' });
    const rng = new SeededRng(91004);
    state.age = 18;
    promoteRank(state, 'chunin');
    state.team = formGeninTeam(state, rng);
    state.rivalId = state.team.members[1].personId;
    state.leanings.ambition = 10;

    // Kill rival squadmate before conviction check
    killPerson(state, state.rivalId, state.birthYear + state.age, 'slain on the front');
    state.war = initWarState(state, rng, false, 'front');
    expect(canTriggerConvictionRoute(state, state.war)).toBe(true);
    startConvictionRoute(state, state.war);
    expect(state.war.conviction!.opponentPersonId).not.toBe(state.rivalId);

    // Kill remaining squadmates -> Conviction Route cannot trigger at all
    for (const m of state.team.members) {
      killPerson(state, m.personId, state.birthYear + state.age, 'slain on the front');
    }
    state.flags.entered_conviction = false;
    expect(canTriggerConvictionRoute(state, state.war)).toBe(false);
  });

  it('B: Kage and Missing-Nin are strictly gated away from forbidden events and actions', () => {
    const rng = new SeededRng(91005);

    // Kage gates
    const kage = createNewLife(91005, { preferredVillage: 'konoha', crisisOverride: 'none' });
    kage.age = 32;
    promoteRank(kage, 'jonin');
    kage.specialStatus = 'kage';
    expect(canReceive(kage, ['not_kage'])).toBe(false);
    expect(canReceive(kage, ['active_shinobi'])).toBe(true);
    const kagePrelude = buildWarPreludeDecision(kage, false, false);
    expect(kagePrelude.eventId).toBe('war_prelude_kage_hq');
    expect(kagePrelude.options.some((o) => o.id === 'desert')).toBe(false);
    // Kage never gets a "join coup against yourself" option
    for (let i = 0; i < 15; i++) {
      const pol = pickPoliticsDecision(kage, new SeededRng(100 + i));
      if (pol) {
        expect(pol.options.some((o) => o.id === 'join_coup')).toBe(false);
      }
    }

    // Missing-Nin gates
    const rogue = createNewLife(91006, { preferredVillage: 'kiri', crisisOverride: 'none' });
    rogue.age = 24;
    promoteRank(rogue, 'jonin');
    rogue.specialStatus = 'missing_nin';
    expect(canReceive(rogue, ['not_missing_nin'])).toBe(false);
    expect(canReceive(rogue, ['in_village'])).toBe(false);
    const roguePrelude = buildWarPreludeDecision(rogue, false, false);
    expect(roguePrelude.eventId).toBe('war_prelude_rogue');
    expect(buildRetirementEventDecision(rogue, rng)).toBeNull();
  });

  it('C1 & C14: Sharingan never awakens without trauma and Kuchiyose fails without a blood contract', () => {
    // C1: Sharingan trauma gate
    const uchiha = createNewLife(91007, {
      preferredVillage: 'konoha',
      crisisOverride: 'none',
      customBuild: {
        mode: 'free',
        villageId: 'konoha',
        originId: 'clan_heir',
        clanId: 'uchiha',
        sex: 'M',
        name: 'Renji Uchiha',
        capacity: 4,
        element: 'fire',
        statOffsets: {},
      },
    });
    uchiha.flags.custom_run = false;
    uchiha.bloodline = {
      id: 'sharingan',
      grade: 3,
      stage: 'latent',
      lastEventAge: 0,
      declined: false,
      eyeStrain: 0,
    };
    uchiha.clanHeritage!.traumaCatalyst = 10;
    uchiha.age = 12;
    uchiha.rank = 'genin';

    for (let age = 9; age <= 20; age++) {
      uchiha.age = age;
      uchiha.bloodline!.lastEventAge = 0;
      expect(tryBloodlineEvent(uchiha, false)).toBeNull();
    }

    // With trauma catalyst >= 50 or parent death, awakening becomes eligible
    uchiha.clanHeritage!.traumaCatalyst = 85;
    let awakenedDecision = null;
    for (let age = 10; age <= 22 && !awakenedDecision; age++) {
      uchiha.age = age;
      uchiha.bloodline!.lastEventAge = 0;
      awakenedDecision = tryBloodlineEvent(uchiha, true);
    }
    expect(awakenedDecision).not.toBeNull();

    // C14: Kuchiyose requires summonContract
    const summoner = createNewLife(91008, { preferredVillage: 'konoha', crisisOverride: 'none' });
    summoner.age = 18;
    promoteRank(summoner, 'chunin');
    summoner.disciplines = [
      { id: 'summoning', level: 2, xp: 10, lastLevelAge: 16, quality: 1, isMain: true, declinedUntilAge: 0 },
    ];
    summoner.summonContract = null;
    expect(getKnownJutsu(summoner).some((j) => j.id === 'kuchiyose')).toBe(false);

    const rng = new SeededRng(91008);
    summoner.war = initWarState(summoner, rng, false, 'front');
    startWarBattle(summoner, summoner.war.enemies[0].id, { isFinal: false, isAmbush: true, isDefense: false });
    expect(() => resolveBattleRound(summoner, 'jutsu:kuchiyose', rng)).toThrow();
  });

  it('D1-D3: Land of Iron (samurai), Waves (civilian), and Uzushio (ruins) have no shinobi corps or ninja exams', () => {
    for (const vId of ['iron', 'waves', 'uzushio'] as const) {
      const pop = buildInitialVillagePopulation(vId);
      expect(pop.geninCorps).toBe(0);
      expect(pop.chuninCorps).toBe(0);
      expect(pop.joninCorps).toBe(0);
    }

    // Waves & Uzushio have zero academy cadets and no Kage
    expect(buildInitialVillagePopulation('waves').academyCadets).toBe(0);
    expect(buildInitialVillagePopulation('uzushio').academyCadets).toBe(0);

    const wavesLife = createNewLife(91009, { preferredVillage: 'waves', crisisOverride: 'none' });
    expect(wavesLife.worldSim!.villages.waves.kageNpcId).toBeNull();
    // Advance to age 6: never receives shinobi academy enrollment
    for (let i = 0; i < 6; i++) {
      advanceYear(wavesLife);
      if (wavesLife.pending) {
        expect(wavesLife.pending.kind).not.toBe('academy_choice');
        resolvePendingDecision(wavesLife, wavesLife.pending.options[0].id);
      }
    }
    expect(wavesLife.rank).toBe('civilian');

    // Uzushio ruins has no Kage
    const uzuLife = createNewLife(91010, { preferredVillage: 'uzushio', crisisOverride: 'none' });
    expect(uzuLife.worldSim!.villages.uzushio.kageNpcId).toBeNull();

    // Land of Iron cannot take Chunin Exam
    const ironLife = createNewLife(91011, { preferredVillage: 'iron', crisisOverride: 'none' });
    ironLife.age = 15;
    promoteRank(ironLife, 'genin');
    ironLife.geninSinceAge = 12;
    ironLife.team = formGeninTeam(ironLife, new SeededRng(91011));
    expect(canTakeChuninExam(ironLife)).toBe(false);
    expect(VILLAGE_MAP.iron.kageTitle).toBe('General of Iron');
  });

  it('F1/F2: zero same-village fights in war and Land of Iron is never a war enemy across 200 wars', () => {
    for (let i = 0; i < 200; i++) {
      const vId = (['konoha', 'suna', 'kiri', 'kumo', 'iwa'] as const)[i % 5];
      const state = createNewLife(92000 + i, { preferredVillage: vId, crisisOverride: 'none' });
      state.age = 20;
      promoteRank(state, 'chunin');
      const war = initWarState(state, new SeededRng(93000 + i), false, 'front');

      expect(war.enemyVillages ?? []).not.toContain('iron');
      expect(war.enemyVillages ?? []).not.toContain('waves');
      expect(war.enemyVillages ?? []).not.toContain('uzushio');
      expect(war.fronts?.length).toBe(3);
      expect(war.allies && war.allies.length).toBeGreaterThanOrEqual(1);

      for (const e of war.enemies) {
        expect(e.villageId).not.toBe('iron');
        expect(e.villageId).not.toBe('waves');
        expect(e.villageId).not.toBe('uzushio');
        if (!e.isExTeammateRogue) {
          expect(e.villageId).not.toBe(state.villageId);
        }
      }
    }
  });
});
