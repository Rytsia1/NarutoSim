import { describe, expect, it } from 'vitest';
import { LIFE_EVENTS } from '../src/data/events-life';
import { TEAM_EVENTS } from '../src/data/events-team';
import { pickPlayerJutsu } from '../src/data/jutsu';
import { ELEMENT_KANJI, RANK_KANJI } from '../src/data/powers';
import { getKageTitle, kageTitle } from '../src/data/villages';
import { resolveBattleRound } from '../src/sim/combat';
import { startConvictionRoute } from '../src/sim/crises';
import {
  canTriggerKageSuccession,
  createNewLife,
  resolvePendingDecision,
} from '../src/sim/life';
import { buildChuninExamStage, buildGraduationExamDecision, promoteRank } from '../src/sim/ranks';
import { SeededRng } from '../src/sim/rng';
import { formGeninTeam } from '../src/sim/team';
import { initWarState, startWarBattle } from '../src/sim/war';
import { BIJUU_LIST, getWorldBijuuName, MAX_CRISIS_CLUES } from '../src/sim/world';

describe('Naruto Immersion Plan Verification (Fases 0-5)', () => {
  it('returns canon kageTitle per village, seeds 9 named Bijuu deterministically, and unifies clue cap to 5', () => {
    expect(getKageTitle('konoha')).toBe('Hokage');
    expect(getKageTitle('suna')).toBe('Kazekage');
    expect(getKageTitle('kiri')).toBe('Mizukage');
    expect(getKageTitle('kumo')).toBe('Raikage');
    expect(getKageTitle('iwa')).toBe('Tsuchikage');
    expect(getKageTitle('oto')).toBe('Otokage');

    const st = createNewLife(1001, { preferredVillage: 'konoha', crisisOverride: 'calamity' });
    expect(kageTitle(st)).toBe('Hokage');
    expect(BIJUU_LIST).toHaveLength(9);
    expect(BIJUU_LIST).toContain(getWorldBijuuName(st));
    expect(MAX_CRISIS_CLUES).toBe(5);
  });

  it('weaves canon jutsu & zodiac hand seals without consuming battle RNG', () => {
    const stA = createNewLife(4242, { preferredVillage: 'konoha', crisisOverride: 'none' });
    stA.age = 20;
    promoteRank(stA, 'chunin');
    stA.element = 'fire';
    stA.disciplines = [
      { id: 'fire_release', level: 2, xp: 10, lastLevelAge: 18, quality: 1, isMain: true, declinedUntilAge: 0 },
    ];
    const rngA = new SeededRng(909);
    stA.war = initWarState(stA, rngA, false, 'front');
    startWarBattle(stA, stA.war.enemies[0].id, { isFinal: false, isAmbush: true, isDefense: false });

    const jutsuPreview = pickPlayerJutsu(stA, 'ninjutsu', 0);
    expect(jutsuPreview.name).toContain('Katon:');
    expect(jutsuPreview.seals.length).toBeGreaterThan(0);

    const rngBefore = rngA.snapshot();
    const res = resolveBattleRound(stA, 'ninjutsu', rngA);
    expect(res.summary.jutsuName).toBe(jutsuPreview.name);
    expect(res.summary.seals).toEqual([...jutsuPreview.seals]);
    expect(res.summary.narrative).toContain(jutsuPreview.name);

    // Deterministic repeatability with identical seed
    const stB = createNewLife(4242, { preferredVillage: 'konoha', crisisOverride: 'none' });
    stB.age = 20;
    promoteRank(stB, 'chunin');
    stB.element = 'fire';
    stB.disciplines = [
      { id: 'fire_release', level: 2, xp: 10, lastLevelAge: 18, quality: 1, isMain: true, declinedUntilAge: 0 },
    ];
    const rngB = new SeededRng(909);
    stB.war = initWarState(stB, rngB, false, 'front');
    startWarBattle(stB, stB.war.enemies[0].id, { isFinal: false, isAmbush: true, isDefense: false });
    const rngB2 = new SeededRng(rngBefore.seed, rngBefore.state);
    const resB = resolveBattleRound(stB, 'ninjutsu', rngB2);
    expect(resB.summary.enemyDmgTaken).toBe(res.summary.enemyDmgTaken);
    expect(resB.summary.playerDmgTaken).toBe(res.summary.playerDmgTaken);
  });

  it('sets Nindo after graduation/Bell Test, tracks permanent rival into Chunin Finals & Valley of the End, and unlocks Kage Succession', () => {
    const state = createNewLife(5151, { preferredVillage: 'konoha', crisisOverride: 'none' });
    state.age = 12;
    promoteRank(state, 'academy');
    state.stats.chakra = 70;
    state.stats.intel = 70;
    state.pending = buildGraduationExamDecision(state);

    resolvePendingDecision(state, 'chakra_form');
    expect(state.rank).toBe('genin');
    expect(state.rivalId).toBe(state.team!.members[1].id);
    expect(state.pending?.kind).toBe('bell_test');

    // Bell Test -> queues Nindo choice
    resolvePendingDecision(state, 'share_lunch');
    expect(state.pending?.kind).toBe('nindo_choice');

    resolvePendingDecision(state, 'become_kage');
    expect(state.nindo).toBe('become_kage');
    expect(state.memories!.length).toBeGreaterThanOrEqual(3);

    // Chunin Arena Finals names the permanent rival
    const finals = buildChuninExamStage(state, 3);
    expect(finals.title).toContain(state.team!.members[1].name);

    // Valley of the End picks the permanent rival even if another squadmate has higher trust
    state.team!.members[0].trust = 99;
    state.team!.members[1].trust = 40;
    state.leanings.ambition = 9;
    state.war = initWarState(state, new SeededRng(123), false, 'front');
    startConvictionRoute(state, state.war);
    expect(state.war.conviction!.opponentId).toBe(state.rivalId);

    // Kage Succession triggers at Jonin + Age 30+ + Bonds + S-Rank missions
    state.war = null;
    promoteRank(state, 'jonin');
    state.age = 31;
    state.stats.bonds = 62;
    state.missions.s = 3;
    expect(canTriggerKageSuccession(state)).toBe(true);
  });

  it('deploys a same-village allied shinobi in village-vs-village wars and expands event pools & kanji tables', () => {
    const state = createNewLife(6262, { preferredVillage: 'suna', crisisOverride: 'none' });
    state.age = 20;
    promoteRank(state, 'chunin');
    state.team = formGeninTeam(state, new SeededRng(62));

    const war = initWarState(state, new SeededRng(63), false, 'front');
    expect(war.allyId).not.toBeNull();
    const ally = war.enemies.find((e) => e.id === war.allyId);
    expect(ally).toBeDefined();
    expect(ally!.villageId).toBe('suna');
    expect(ally!.intel).toBe(100);

    // Expanded Fase 5 content pools & kanji maps
    expect(TEAM_EVENTS.length).toBeGreaterThanOrEqual(12);
    expect(LIFE_EVENTS.length).toBeGreaterThanOrEqual(30);
    expect(ELEMENT_KANJI.fire).toBe('火');
    expect(ELEMENT_KANJI.wind).toBe('風');
    expect(ELEMENT_KANJI.lightning).toBe('雷');
    expect(ELEMENT_KANJI.earth).toBe('土');
    expect(ELEMENT_KANJI.water).toBe('水');
    expect(RANK_KANJI.kage).toBe('影');
  });
});
