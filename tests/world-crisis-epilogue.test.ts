import { describe, expect, it } from 'vitest';
import { ShinobiSim } from '../src/sim/engine';
import { buildPosthumousEpilogue, canEnterRetirement } from '../src/sim/epilogue';
import { createNewLife, killCharacter } from '../src/sim/life';
import { promoteRank } from '../src/sim/ranks';
import { SeededRng } from '../src/sim/rng';
import { buildWarPreludeDecision, isEndgameReady, tickWorldTension } from '../src/sim/world';

describe('World Tension, Seeded Endgame Crisis, and Dual Epilogue', () => {
  it('locks seeded crisis at birth and never erupts before Endgame Gate', () => {
    const state = createNewLife(555, { crisisOverride: 'calamity' });
    expect(state.world.seededCrisis).toBe('calamity');

    // Fresh Genin at age 13 is NOT Endgame ready -> war is conventional, not Crisis War!
    state.age = 13;
    promoteRank(state, 'genin');
    state.world.tension = 85;
    expect(isEndgameReady(state)).toBe(false);

    const tick = tickWorldTension(state, new SeededRng(12));
    expect(tick.triggerWar).toBe(true);
    expect(tick.isCrisisWar).toBe(false);

    // Once Jonin -> Endgame ready -> Crisis erupts!
    promoteRank(state, 'jonin');
    state.age = 22;
    state.world.tension = 85;
    state.world.lastWarAge = 13;
    expect(isEndgameReady(state)).toBe(true);

    const endgameTick = tickWorldTension(state, new SeededRng(34));
    expect(endgameTick.triggerWar).toBe(true);
    expect(endgameTick.isCrisisWar).toBe(true);
    // Pure tickWorldTension does not prematurely mutate crisisStage until prelude is actually queued
    expect(state.world.crisisStage).toBe(1);
  });

  it('supports recurring 14-day wars in one life and returns to Continuous Life Loop afterward', () => {
    const sim = new ShinobiSim();
    sim.newLife(888, { crisisOverride: 'none' });
    const state = sim.getState();
    state.age = 16;
    promoteRank(state, 'chunin');
    state.stats.chakra = 95;
    state.stats.health = 98;
    state.stats.intel = 90;
    state.stats.will = 90;

    // War #1
    state.pending = buildWarPreludeDecision(state, false);
    sim.resolve('recon_flank');
    expect(sim.getState().phase).toBe('war');
    expect(sim.getState().war?.maxDays).toBe(14);

    let guard = 0;
    while (sim.getState().phase === 'war' && guard < 250) {
      guard += 1;
      sim.autoChoice(true);
    }

    if (sim.getState().phase === 'life') {
      expect(sim.getState().warHistory.length).toBe(1);
      expect(sim.getState().world.warsSurvived).toBe(1);
      expect(sim.getState().world.tension).toBeLessThan(35);

      // War #2 years later
      const st2 = sim.getState();
      st2.age = 26;
      st2.stats.health = 95;
      st2.world.tension = 85;
      st2.pending = buildWarPreludeDecision(st2, false);
      sim.resolve('recon_flank');
      expect(sim.getState().phase).toBe('war');

      let guard2 = 0;
      while (sim.getState().phase === 'war' && guard2 < 250) {
        guard2 += 1;
        sim.autoChoice(true);
      }

      if (sim.getState().phase === 'life') {
        expect(sim.getState().warHistory.length).toBe(2);
        expect(sim.getState().world.warsSurvived).toBe(2);
      }
    }
  });

  it('triggers Posthumous Legacy Epilogue with Crisis Echo when dying before Endgame Crisis erupts', () => {
    const state = createNewLife(999, { crisisOverride: 'mastermind' });
    state.age = 15;
    promoteRank(state, 'genin');
    killCharacter(state, 'fell during a border ambush');

    expect(state.phase).toBe('posthumous');
    const beats = buildPosthumousEpilogue(state);
    expect(beats.length).toBeGreaterThanOrEqual(2);
    expect(beats.some((b) => b.tone === 'crisis' && b.title.includes('Storm You Never Lived'))).toBe(true);
  });

  it('allows entering Twilight Retirement at age 50+ and disables frontline war mobilization', () => {
    const sim = new ShinobiSim();
    sim.newLife(112233, { crisisOverride: 'none' });
    const st = sim.getState();
    st.age = 52;
    st.pending = null;
    st.world.tension = 95;

    expect(canEnterRetirement(st)).toBe(true);
    expect(sim.retireFromFrontline()).toBe(true);
    expect(sim.getState().phase).toBe('retirement');

    const tick = tickWorldTension(sim.getState(), new SeededRng(9));
    expect(tick.triggerWar).toBe(false);
  });
});
