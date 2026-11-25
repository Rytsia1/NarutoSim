import { describe, expect, it } from 'vitest';
import {
  advanceCrisisPhase,
  canTriggerConvictionRoute,
  getMastermindDivisor,
  resolveConvictionBeat,
  resolveConvictionDuelRound,
  resolveCrisisBossTurn,
  startConvictionRoute,
} from '../src/sim/crises';
import { CUSTOM_BUDGET, evaluateCustomBuild } from '../src/sim/custom';
import { createNewLife } from '../src/sim/life';
import { createDefaultMeta, updateMetaFromState } from '../src/sim/meta';
import { promoteRank } from '../src/sim/ranks';
import { SeededRng } from '../src/sim/rng';
import { formGeninTeam } from '../src/sim/team';
import { initWarState } from '../src/sim/war';

describe('Endgame Crisis Bosses, Extreme Conviction Route, Custom Builder & Meta', () => {
  it('runs 3-phase Tailed-Beast Calamity with Act 1 crisisClues HP discount and Mokuton synergy', () => {
    const state = createNewLife(9001, { crisisOverride: 'calamity' });
    state.age = 24;
    promoteRank(state, 'jonin');
    state.world.crisisClues = 4; // -32 boss HP discount!
    state.bloodline = { id: 'mokuton', grade: 4, stage: 'ctrl2', lastEventAge: 20, declined: false };

    const rng = new SeededRng(101);
    const war = initWarState(state, rng, true, 'front');
    state.war = war;

    expect(war.crisis).not.toBeNull();
    expect(war.crisis!.id).toBe('calamity');
    expect(war.crisis!.phase).toBe(1);
    expect(war.crisis!.bossMaxHp).toBe(145 - 32);

    // Day 5 -> Phase 2 Outbreak spawns Corrupted Echoes
    war.day = 5;
    advanceCrisisPhase(state, war, rng);
    expect(war.crisis!.phase).toBe(2);
    expect(war.crisis!.echoesLeft).toBeGreaterThanOrEqual(2);

    // Day 10 -> Phase 3 Descent
    war.day = 10;
    advanceCrisisPhase(state, war, rng);
    expect(war.crisis!.phase).toBe(3);

    const hpBefore = war.crisis!.bossHp;
    resolveCrisisBossTurn(state, 'boss_seal_suppress', rng);
    expect(war.crisis!.bossHp).toBeLessThan(hpBefore);
  });

  it('runs Shadow Mastermind 5-Sentinel divisor and sweeps guards with AoE Ultimates (fixes U4)', () => {
    const state = createNewLife(9002, { crisisOverride: 'mastermind' });
    state.age = 24;
    promoteRank(state, 'jonin');
    state.world.crisisClues = 2;
    state.disciplines = [
      { id: 'fire_release', level: 4, xp: 50, lastLevelAge: 22, quality: 1, isMain: true, declinedUntilAge: 0 },
    ];

    const rng = new SeededRng(202);
    const war = initWarState(state, rng, true, 'front');
    state.war = war;

    const div5 = getMastermindDivisor(state, war.crisis!);
    war.crisis!.sentinelsLeft = 1;
    const div1 = getMastermindDivisor(state, war.crisis!);
    expect(div1).toBeLessThan(div5);

    // Phase 3 with active guards -> AoE Ultimate sweeps all guards!
    war.crisis!.phase = 3;
    war.crisis!.guardsActive = 2;
    resolveCrisisBossTurn(state, 'boss_ultimate', rng);
    expect(war.crisis!.guardsActive).toBe(0);
  });

  it('triggers Extreme Conviction Route when leaning >= 8 and runs Final Valley Ideological Duel', () => {
    const state = createNewLife(9003, { crisisOverride: 'none' });
    state.age = 22;
    promoteRank(state, 'jonin');
    state.leanings.vengeance = 9;
    state.team = formGeninTeam(state, new SeededRng(303));
    state.team.members[1].trust = 82;
    state.war = initWarState(state, new SeededRng(304), false, 'front');

    expect(canTriggerConvictionRoute(state, state.war)).toBe(true);
    const beat1 = startConvictionRoute(state, state.war);
    expect(beat1.kind).toBe('war_conviction');
    expect(state.war.conviction!.opponentName).toBe(state.team.members[1].name);

    // Push conviction through 3 beats into Final Valley Duel
    state.war.conviction!.resolveR = 70;
    expect(resolveConvictionBeat(state, 'press_conviction')).toBe('next_beat');
    expect(resolveConvictionBeat(state, 'press_conviction')).toBe('next_beat');
    expect(resolveConvictionBeat(state, 'press_conviction')).toBe('start_duel');
    expect(state.war.conviction!.inDuel).toBe(true);

    const beforeR = state.war.conviction!.resolveR;
    resolveConvictionDuelRound(state, 'duel_talk', new SeededRng(305));
    expect(state.war.conviction!.resolveR).toBeLessThan(beforeR);
  });

  it('validates Custom Shinobi Builder cleanly without penalizing dumped stats (fixes GDD I1-I4)', () => {
    const valid = evaluateCustomBuild({
      mode: 'points',
      name: 'Kuro',
      sex: 'M',
      originId: 'clan_heir',
      villageId: 'konoha',
      capacity: 4,
      element: 'fire',
      statOffsets: { chakra: 10, health: -10 }, // dumping health costs 0 pts!
      startDisciplineId: 'fire_release', // family discount = 1 pt
    });
    expect(valid.valid).toBe(true);
    expect(valid.pointsSpent).toBe(3); // +2 for +10 chakra, 0 for -10 health, +1 for family fire_release

    const illegalStart = evaluateCustomBuild({
      mode: 'points',
      name: 'Kuro',
      sex: 'M',
      originId: 'civilian',
      villageId: 'konoha',
      capacity: 3,
      element: 'wind',
      statOffsets: {},
      startDisciplineId: 'senjutsu',
    });
    expect(illegalStart.valid).toBe(false);

    const overBudgetFree = evaluateCustomBuild({
      mode: 'free',
      name: 'Legend',
      sex: 'F',
      originId: 'civilian',
      villageId: 'kumo',
      capacity: 5,
      element: 'lightning',
      statOffsets: { chakra: 25, intel: 25, will: 25 },
      latentBloodlineId: 'rinne_eye',
    });
    expect(overBudgetFree.pointsSpent).toBeGreaterThan(CUSTOM_BUDGET);
    expect(overBudgetFree.valid).toBe(true);
  });

  it('updates Bingo Book Codex and unlocks Achievements idempotently', () => {
    const state = createNewLife(9004, { fatedRosterId: 'ros_kenji_kirigiri' });
    state.age = 20;
    promoteRank(state, 'jonin');
    state.war = initWarState(state, new SeededRng(404), false, 'front');
    expect(state.war.enemies.some((e) => e.rosterId === 'ros_kenji_kirigiri')).toBe(true);

    const meta0 = createDefaultMeta();
    const res1 = updateMetaFromState(meta0, state);
    expect(res1.newlyUnlocked).toContain('ach_jonin');
    expect(Object.keys(res1.meta.codexRoster).length).toBeGreaterThanOrEqual(7);

    // Re-running yields 0 duplicate unlocks
    const res2 = updateMetaFromState(res1.meta, state);
    expect(res2.newlyUnlocked).toHaveLength(0);
  });
});
