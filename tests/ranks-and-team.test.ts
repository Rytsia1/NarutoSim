import { describe, expect, it } from 'vitest';
import { createNewLife, resolvePendingDecision } from '../src/sim/life';
import {
  buildChuninExamStage,
  buildGraduationExamDecision,
  buildJoninEvaluationDecision,
  canTakeJoninEvaluation,
  promoteRank,
} from '../src/sim/ranks';
import { SeededRng } from '../src/sim/rng';
import { disbandGeninTeam, formGeninTeam } from '../src/sim/team';

describe('Shinobi Rank progression & 4-man Genin Squad Kizuna', () => {
  it('forms a 4-man Genin cell (1 Sensei + 2 teammates, player as 3rd student) on Academy graduation', () => {
    const state = createNewLife(777);
    state.age = 12;
    promoteRank(state, 'academy');
    state.stats.chakra = 65;
    state.stats.intel = 60;
    state.pending = buildGraduationExamDecision(state);

    resolvePendingDecision(state, 'chakra_form');

    expect(state.rank).toBe('genin');
    expect(state.team).not.toBeNull();
    expect(state.team!.active).toBe(true);
    expect(state.team!.members).toHaveLength(3);
    expect(state.team!.members.filter((m) => m.role === 'sensei')).toHaveLength(1);
    expect(state.team!.members.filter((m) => m.role === 'teammate')).toHaveLength(2);
    // Immediately triggers Bell Test induction
    expect(state.pending?.kind).toBe('bell_test');
  });

  it('disbands the Genin team when the Player reaches Chunin rank and preserves Kizuna', () => {
    const state = createNewLife(10101);
    state.age = 14;
    promoteRank(state, 'genin');
    state.geninSinceAge = 12;
    state.stats.intel = 90;
    state.stats.will = 90;
    state.stats.chakra = 80;
    state.team = formGeninTeam(state, new SeededRng(55));
    state.pending = buildChuninExamStage(state, 6, { finalsRound: 2, prepBonus: 9, finalsScore: 12 });

    resolvePendingDecision(state, 'tactical_outplay');

    expect(state.rank).toBe('chunin');
    expect(state.team!.active).toBe(false);
    expect(state.team!.disbandReason).toBe('player_chunin');
    expect(state.pending?.kind).toBe('team_disband');

    // Resolve farewell and verify Kizuna members remain intact
    resolvePendingDecision(state, 'promise_comrades');
    expect(state.team!.members).toHaveLength(3);
    expect(state.team!.members.slice(1).every((m) => m.promiseMade)).toBe(true);
  });

  it('disbands the Genin team when ONLY a teammate reaches Chunin while player stays Genin', () => {
    const state = createNewLife(20202);
    state.age = 14;
    promoteRank(state, 'genin');
    state.geninSinceAge = 12;
    state.team = formGeninTeam(state, new SeededRng(88));
    // Boost teammate powerScore so at least one passes while player fails Stage 3
    state.stats.intel = 5;
    state.stats.will = 5;
    state.stats.chakra = 5;
    state.team.members[1].powerScore = 95;
    state.team.members[2].powerScore = 95;

    const decision = disbandGeninTeam(state, 'teammate_chunin', [state.team.members[1].name]);
    state.pending = decision;

    expect(state.rank).toBe('genin');
    expect(state.team.active).toBe(false);
    expect(state.team.disbandReason).toBe('teammate_chunin');
    expect(decision.title).toContain('Disbanded');
  });

  it('evaluates and promotes qualified Chunin to Jonin', () => {
    const state = createNewLife(30303);
    state.age = 18;
    promoteRank(state, 'chunin');
    state.stats.intel = 78;
    state.stats.will = 78;
    state.stats.chakra = 75;
    state.stats.health = 82;
    state.disciplines = [
      { id: 'fire_release', level: 2, xp: 10, lastLevelAge: 16, quality: 1, isMain: true, declinedUntilAge: 0 },
      { id: 'kenjutsu', level: 2, xp: 8, lastLevelAge: 17, quality: 1, isMain: false, declinedUntilAge: 0 },
    ];

    expect(canTakeJoninEvaluation(state)).toBe(true);
    state.pending = buildJoninEvaluationDecision(state);
    resolvePendingDecision(state, 'command_scenario');
    expect(state.rank).toBe('jonin');
    expect(state.peakRank).toBe('jonin');
  });
});
