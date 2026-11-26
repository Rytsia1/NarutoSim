import { describe, expect, it } from 'vitest';
import { ShinobiSim } from '../src/sim/engine';
import { createNewLife, resolvePendingDecision } from '../src/sim/life';
import { getPerson } from '../src/sim/people';
import { promoteRank } from '../src/sim/ranks';
import { SeededRng } from '../src/sim/rng';
import {
  buildWarDayDecision,
  buildWarNightDecision,
  flushWarUntilDecision,
  initWarState,
  startWarBattle,
} from '../src/sim/war';

describe('14-Day Autonomous Shinobi Warfront', () => {
  it('uses uniform 14-day duration across Genin, Chunin, and Jonin ranks', () => {
    for (const rank of ['genin', 'chunin', 'jonin'] as const) {
      const state = createNewLife(1234);
      state.age = 15;
      promoteRank(state, rank);
      const war = initWarState(state, new SeededRng(50), false, 'front');
      expect(war.maxDays).toBe(14);
      expect(war.enemies.length).toBeGreaterThanOrEqual(7);
      expect(war.resolves).toBe(3);
    }
  });

  it('unlocks build-specific night actions based on protagonist disciplines', () => {
    const state = createNewLife(2345);
    state.age = 19;
    promoteRank(state, 'chunin');
    state.disciplines = [
      { id: 'wind_release', level: 2, xp: 10, lastLevelAge: 16, quality: 1, isMain: true, declinedUntilAge: 0 },
      { id: 'sensory', level: 2, xp: 10, lastLevelAge: 17, quality: 1, isMain: false, declinedUntilAge: 0 },
      { id: 'fuinjutsu', level: 2, xp: 10, lastLevelAge: 18, quality: 1, isMain: false, declinedUntilAge: 0 },
    ];
    state.war = initWarState(state, new SeededRng(77), false, 'flank');
    const nightMenu = buildWarNightDecision(state);

    expect(nightMenu.options.some((o) => o.id === 'night_snipe')).toBe(true);
    expect(nightMenu.options.some((o) => o.id === 'night_sensory')).toBe(true);
    expect(nightMenu.options.some((o) => o.id === 'night_workshop')).toBe(true);
  });

  it('preserves exact mid-battle RNG determinism across save and reload', () => {
    const simA = new ShinobiSim();
    simA.newLife(77777, { crisisOverride: 'none' });
    const st = simA.getState();
    st.age = 20;
    promoteRank(st, 'chunin');
    st.stats.chakra = 75;
    st.stats.health = 90;
    st.stats.intel = 70;
    st.stats.will = 70;
    st.phase = 'war';
    st.war = initWarState(st, new SeededRng(333), false, 'front');
    startWarBattle(st, st.war.enemies[0].id, { isFinal: false, isAmbush: true, isDefense: false });

    const snap = simA.snapshot();
    const simB = new ShinobiSim();
    simB.load(snap);

    // Play 3 combat rounds identically on both instances
    for (let i = 0; i < 3; i++) {
      if (simA.getState().pending?.kind !== 'war_battle_round') break;
      simA.resolve('taijutsu');
      simB.resolve('taijutsu');
    }

    expect(simA.getState().war?.hp).toBe(simB.getState().war?.hp);
    expect(simA.getState().war?.enemies[0].hp).toBe(simB.getState().war?.enemies[0].hp);
    expect(simA.getState().rng).toEqual(simB.getState().rng);
  });

  it('persists fallen roster enemies into canonical dead people after war completion', () => {
    const state = createNewLife(8888, { crisisOverride: 'none' });
    state.age = 22;
    promoteRank(state, 'jonin');
    state.stats.chakra = 95;
    state.stats.health = 95;
    state.stats.intel = 90;
    state.stats.will = 90;
    state.phase = 'war';
    state.war = initWarState(state, new SeededRng(42), false, 'front');

    // Eliminate all enemies except one weak enemy to conclude war rapidly
    state.war.enemies.forEach((e, idx) => {
      if (idx > 0) {
        e.alive = false;
        e.hp = 0;
      } else {
        e.hp = 1;
      }
    });
    const slainIds = state.war.enemies.slice(1).map((e) => e.personId);
    state.pending = buildWarDayDecision(state);
    resolvePendingDecision(state, 'day_recover');
    flushWarUntilDecision(state, new SeededRng(43));
    resolvePendingDecision(state, 'night_raid');
    resolvePendingDecision(state, state.war.enemies[0].id);
    resolvePendingDecision(state, 'jutsu:basic_strike');

    // War should conclude cleanly back to life loop (unless enemy survived once at 12 HP)
    let guard = 0;
    while (state.phase === 'war' && guard < 20) {
      guard += 1;
      if (state.pending) {
        resolvePendingDecision(state, state.pending.options.find((o) => !o.disabled)!.id);
      } else {
        flushWarUntilDecision(state, new SeededRng(43 + guard));
      }
    }

    expect(state.phase).toBe('life');
    expect(state.war).toBeNull();
    expect(state.warHistory.length).toBe(1);
    for (const personId of slainIds) {
      const person = getPerson(state, personId);
      expect(person?.identity.alive).toBe(false);
    }
  });
});
