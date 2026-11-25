import { describe, expect, it } from 'vitest';
import {
  estimateBattleActionOdds,
  estimateRetreatChance,
  getHealthConditionLabel,
} from '../src/sim/combat';
import { ShinobiSim } from '../src/sim/engine';
import { rankValueToGrade } from '../src/sim/powers';
import { promoteRank } from '../src/sim/ranks';
import { buildWarPreludeDecision } from '../src/sim/world';

function deployTestSim(seed: number): ShinobiSim {
  const sim = new ShinobiSim();
  sim.newLife(seed, { crisisOverride: 'none' });
  const st = sim.getState();
  st.age = 19;
  promoteRank(st, 'chunin');
  st.stats.chakra = 65;
  st.stats.health = 85;
  st.stats.intel = 60;
  st.stats.will = 65;
  st.pending = buildWarPreludeDecision(st, false);
  sim.resolve('deploy_front');
  return sim;
}

describe('GDD 14-Day War Pacing & Battle Dialog Helpers', () => {
  it('queues timed beats upon deployment instead of firing Day 1 modal immediately', () => {
    const sim = deployTestSim(40404);
    const st = sim.getState();
    expect(st.phase).toBe('war');
    expect(st.pending).toBeNull();
    expect(st.war?.secondsPerDay).toBe(110);
    expect(st.war?.beatQueue.length).toBeGreaterThan(0);
    expect(st.war?.beatQueue[0].kind).toBe('day_open');

    // Pausing freezes war beatClock
    sim.togglePause();
    for (let i = 0; i < 20; i++) sim.tick(0.25);
    expect(sim.getState().war?.beatClock).toBe(0);
    expect(sim.getState().pending).toBeNull();

    // Unpausing at 4x speed advances through the deployment beat cleanly
    sim.togglePause();
    sim.setSpeed(4);
    let ticks = 0;
    while (!sim.getState().pending && ticks < 100) {
      ticks += 1;
      sim.tick(0.25);
    }
    expect(sim.getState().pending?.kind).toBe('war_day');
    expect(ticks).toBeGreaterThan(1);
    expect(ticks).toBeLessThan(20);
  });

  it('keeps war_night -> war_target instant (0s) while spacing Day -> Night -> NPC -> Dawn', () => {
    const sim = deployTestSim(50505);
    sim.flushWarUntilDecision();
    expect(sim.getState().pending?.kind).toBe('war_day');

    // Resolving Day action queues dusk night_decision beat (not immediate modal)
    sim.resolve('day_cover');
    expect(sim.getState().pending).toBeNull();
    expect(sim.getState().war?.beatQueue[0]?.kind).toBe('night_decision');

    sim.flushWarUntilDecision();
    expect(sim.getState().pending?.kind).toBe('war_night');

    // Selecting Night Scout immediately opens Target Selector (0s sub-menu)
    sim.resolve('night_scout');
    expect(sim.getState().pending?.kind).toBe('war_target');
  });

  it('preserves exact beat-queue determinism across mid-wait save and reload', () => {
    const simA = deployTestSim(60606);
    simA.setSpeed(2);
    simA.tick(0.25);
    simA.tick(0.25);

    const snap = simA.snapshot();
    const simB = new ShinobiSim();
    simB.load(snap);
    simB.setSpeed(2);

    for (let i = 0; i < 30; i++) {
      simA.tick(0.25);
      simB.tick(0.25);
    }

    expect(simA.getState().pending?.id).toBe(simB.getState().pending?.id);
    expect(simA.getState().war?.beatClock).toBeCloseTo(simB.getState().war?.beatClock ?? -1, 5);
    expect(simA.getState().rng).toEqual(simB.getState().rng);
  });

  it('computes fair battle odds without leaking hidden stats and formats rank grades & health labels', () => {
    const sim = deployTestSim(70707);
    const st = sim.getState();
    const enemy = st.war!.enemies[0];

    enemy.intel = 20;
    const est = estimateBattleActionOdds(st, enemy, 'taijutsu');
    expect(est.isEstimate).toBe(true);
    expect(est.label).toContain('(est.)');

    enemy.intel = 85;
    const exact = estimateBattleActionOdds(st, enemy, 'taijutsu');
    expect(exact.isEstimate).toBe(false);
    expect(exact.label).not.toContain('(est.)');

    const fleePct = estimateRetreatChance(st, enemy);
    expect(fleePct).toBeGreaterThanOrEqual(25);
    expect(fleePct).toBeLessThanOrEqual(92);

    expect(rankValueToGrade(3.2)).toBe('C+');
    expect(rankValueToGrade(5.7)).toBe('S');
    expect(getHealthConditionLabel(100)).toBe('Unhurt');
    expect(getHealthConditionLabel(55)).toBe('Wounded');
    expect(getHealthConditionLabel(10)).toBe('Critical');
  });
});
