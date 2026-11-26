import { describe, expect, it } from 'vitest';
import { JUTSU_MAP } from '../src/data/jutsu';
import { buildBattleRoundDecision, getEffectiveJutsuCost, resolveBattleRound } from '../src/sim/combat';
import { ShinobiSim } from '../src/sim/engine';
import {
  buildKageSuccessionDecision,
  createNewLife,
  getKageOfferReason,
  resolvePendingDecision,
} from '../src/sim/life';
import { buildChuninExamStage, promoteRank } from '../src/sim/ranks';
import { SeededRng } from '../src/sim/rng';
import { formGeninTeam } from '../src/sim/team';
import { initWarState, startWarBattle } from '../src/sim/war';
import { canCallDiplomaticSummit, tickWorldTension } from '../src/sim/world';

describe('Extended Chunin Exam, Reducible World Tension, Kenjutsu & Kage Offer Arc', () => {
  it('progresses through all 6 stages of the Extended Chunin Exam (including 2-round Stadium Finals)', () => {
    const state = createNewLife(8201, { crisisOverride: 'none' });
    state.age = 14;
    promoteRank(state, 'genin');
    state.geninSinceAge = 12;
    state.stats.chakra = 92;
    state.stats.health = 92;
    state.stats.intel = 92;
    state.stats.will = 92;
    state.stats.bonds = 92;
    state.team = formGeninTeam(state, new SeededRng(77));
    state.disciplines.push({
      id: 'kenjutsu',
      level: 2,
      xp: 10,
      lastLevelAge: 13,
      quality: 1,
      isMain: false,
      declinedUntilAge: 0,
    });

    // Stage 1: Written Cipher
    state.pending = buildChuninExamStage(state, 1);
    expect(state.pending.title).toContain('Stage 1 of 6');
    resolvePendingDecision(state, 'intel_gather');

    // Stage 2: Forest of Death (Scroll Hunt)
    expect(state.pending?.meta?.stage).toBe(2);
    resolvePendingDecision(state, 'stealth_route');

    // Stage 3: Forest of Death (Tower Sprint)
    expect(state.pending?.meta?.stage).toBe(3);
    resolvePendingDecision(state, 'smoke_diversion');

    // Stage 4: Tower Preliminaries (includes Kenjutsu option since discipline is learned)
    expect(state.pending?.meta?.stage).toBe(4);
    expect(state.pending?.options.some((o) => o.id === 'prelim_kenjutsu')).toBe(true);
    resolvePendingDecision(state, 'prelim_kenjutsu');

    // Stage 5: One-Month Finals Training
    expect(state.pending?.meta?.stage).toBe(5);
    resolvePendingDecision(state, 'prep_tactics');

    // Stage 6 Round 1: Finals Opening Exchange
    expect(state.pending?.meta?.stage).toBe(6);
    expect(state.pending?.meta?.finalsRound).toBe(1);
    resolvePendingDecision(state, 'open_tactical_read');

    // Stage 6 Round 2: Finals Climax -> Promotes to Chunin & triggers team disbandment
    expect(state.pending?.meta?.stage).toBe(6);
    expect(state.pending?.meta?.finalsRound).toBe(2);
    resolvePendingDecision(state, 'kenjutsu_finisher');

    expect(state.rank).toBe('chunin');
    expect(state.pending?.kind).toBe('team_disband');
  });

  it('allows World Tension to decrease via detente, Peace Accord, Diplomatic Mission, and Diplomatic Summit', () => {
    // 1. Peace Accord / True Peace cools tension down and clears War Omen below 65
    const state = createNewLife(8202, { crisisOverride: 'none' });
    state.age = 24;
    promoteRank(state, 'jonin');
    state.world.tension = 66;
    state.world.omenActive = true;
    state.world.peaceAccordUntilAge = 36;

    const tick = tickWorldTension(state, new SeededRng(101));
    expect(state.world.tension).toBeLessThan(66);
    expect(state.world.omenActive).toBe(false);
    expect(tick.omenCleared).toBe(true);

    // 2. Organic Diplomatic Detente reduces tension over normal years
    let cooledNaturally = false;
    for (let seed = 1; seed <= 30; seed++) {
      const s = createNewLife(8202 + seed, { crisisOverride: 'none' });
      s.age = 22;
      promoteRank(s, 'jonin');
      s.stats.bonds = 80;
      s.world.tension = 55;
      const res = tickWorldTension(s, new SeededRng(seed * 17));
      if (res.detenteLogged && s.world.tension < 55) {
        cooledNaturally = true;
        break;
      }
    }
    expect(cooledNaturally).toBe(true);

    // 3. Diplomatic Summit action lowers World Tension and sets 4-year cooldown
    const sim = new ShinobiSim();
    sim.newLife(8203, { crisisOverride: 'none' });
    const st = sim.getState();
    st.age = 28;
    promoteRank(st, 'jonin');
    st.specialStatus = 'kage';
    st.stats.ryo = 30;
    st.world.tension = 72;
    st.world.omenActive = true;
    expect(canCallDiplomaticSummit(st)).toBe(true);

    const ok = sim.callDiplomaticSummit();
    expect(ok).toBe(true);
    expect(sim.getState().world.tension).toBeLessThan(60);
    expect(sim.getState().world.omenActive).toBe(false);
    expect(canCallDiplomaticSummit(sim.getState())).toBe(false); // 4-year cooldown active
  });

  it('gates the Kenjutsu battle attack style strictly behind learning the kenjutsu discipline', () => {
    const state = createNewLife(8204, { crisisOverride: 'none' });
    state.age = 20;
    promoteRank(state, 'chunin');
    state.stats.chakra = 80;
    state.stats.health = 90;
    state.stats.will = 80;
    state.disciplines = [
      { id: 'fire_release', level: 2, xp: 10, lastLevelAge: 16, quality: 1, isMain: true, declinedUntilAge: 0 },
    ];

    const rng = new SeededRng(303);
    state.war = initWarState(state, rng, false, 'front');
    const enemy = state.war.enemies[0];
    enemy.hp = 100;
    enemy.fort = 20;
    startWarBattle(state, enemy.id, { isFinal: false, isAmbush: true, isDefense: false });

    // Without kenjutsu discipline: kenjutsu jutsu options MUST NOT appear!
    const menuWithout = buildBattleRoundDecision(state);
    expect(menuWithout.options.some((o) => o.id === 'jutsu:iai_slash' || o.id === 'jutsu:mikazuki_no_mai')).toBe(false);

    // After learning kenjutsu discipline (Tier 3): Iai Slash and Mikazuki no Mai appear!
    state.disciplines.push({
      id: 'kenjutsu',
      level: 3,
      xp: 20,
      lastLevelAge: 19,
      quality: 1,
      isMain: false,
      declinedUntilAge: 0,
    });
    const menuWith = buildBattleRoundDecision(state);
    expect(menuWith.options.some((o) => o.id === 'jutsu:iai_slash')).toBe(true);
    expect(menuWith.options.some((o) => o.id === 'jutsu:mikazuki_no_mai')).toBe(true);

    const cpBefore = state.war.cp;
    const expectedCost = getEffectiveJutsuCost(state, JUTSU_MAP.mikazuki_no_mai, state.war);
    state.war.activeBattle!.enemyWallRounds = 2;
    const res = resolveBattleRound(state, 'jutsu:mikazuki_no_mai', new SeededRng(999));
    expect(state.war.cp).toBe(cpBefore - expectedCost);
    expect(res.summary.jutsuName).toBe('Konoha-Ryu: Mikazuki no Mai');
  });

  it('supports the 2-beat Kage Offer & First Decree arc (war hero / legend triggers, comrade endorsement, and peace decree)', () => {
    // 1. War Hero Emergency Vacancy trigger -> Accept -> Inauguration First Decree (Peace Envoys)
    const state = createNewLife(8205, { crisisOverride: 'none' });
    state.age = 25;
    promoteRank(state, 'jonin');
    state.world.warsSurvived = 2;
    state.world.tension = 65;
    state.stats.will = 72;
    state.stats.bonds = 52;
    expect(getKageOfferReason(state)).toBe('war_hero');

    state.pending = buildKageSuccessionDecision(state, 1, 'war_hero');
    expect(state.pending.options.map((o) => o.id)).toEqual(
      expect.arrayContaining(['accept_kage', 'negotiate_authority', 'recommend_comrade', 'decline_kage']),
    );

    resolvePendingDecision(state, 'accept_kage');
    expect(state.pending?.meta?.kageStage).toBe(2);

    resolvePendingDecision(state, 'decree_peace');
    expect(state.specialStatus).toBe('kage');
    expect(state.world.tension).toBe(47);

    // 2. Endorsing a comrade declines the hat while lowering World Tension and preserving freedom
    const s2 = createNewLife(8206, { crisisOverride: 'none' });
    s2.age = 26;
    promoteRank(s2, 'jonin');
    s2.world.warsSurvived = 2;
    s2.world.tension = 50;
    s2.stats.will = 70;
    s2.stats.bonds = 55;
    s2.pending = buildKageSuccessionDecision(s2, 1, 'war_hero');
    resolvePendingDecision(s2, 'recommend_comrade');
    expect(s2.specialStatus).toBe('none');
    expect(s2.flags.declined_kage).toBe(true);
    expect(s2.world.tension).toBe(44);
  });
});
