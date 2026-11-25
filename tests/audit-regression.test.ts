import { describe, expect, it } from 'vitest';
import { ACHIEVEMENT_MAP } from '../src/data/achievements';
import { rewriteOrphanText } from '../src/data/i18n';
import { ORIGINS } from '../src/data/origins';
import { VILLAGES } from '../src/data/villages';
import {
  computeRetreatChance,
  estimateRetreatChance,
  getDisplayEnemyRanks,
  getPlayerRanks,
  resolveBattleRound,
} from '../src/sim/combat';
import { ShinobiSim } from '../src/sim/engine';
import { createNewLife } from '../src/sim/life';
import { createDefaultMeta, recordCompletedLifeInMeta, updateMetaFromState } from '../src/sim/meta';
import { promoteRank } from '../src/sim/ranks';
import { SeededRng } from '../src/sim/rng';
import { initWarState, openDayPhase, startWarBattle } from '../src/sim/war';
import { buildWarPreludeDecision } from '../src/sim/world';
import { wrapLines } from '../src/ui/fx/recordCardCanvas';
import { isValidGameState, sanitizeMetaState } from '../src/ui/storage';

describe('Full Codebase Audit Regressions', () => {
  it('never skips an active Endgame Crisis Boss when all rivals die or only the ally survives', () => {
    const sim = new ShinobiSim();
    sim.newLife(12345, { crisisOverride: 'calamity' });
    const st = sim.getState();
    st.age = 24;
    promoteRank(st, 'jonin');
    st.stats.chakra = 75;
    st.stats.health = 90;
    st.pending = buildWarPreludeDecision(st, true);
    sim.resolve('deploy_front');

    const war = st.war!;
    expect(war.crisis).not.toBeNull();

    // Kill every rival shinobi on Day 2
    for (const enemy of war.enemies) {
      enemy.alive = false;
      enemy.hp = 0;
    }

    const rng = new SeededRng(555);
    openDayPhase(st, rng);

    // Must escalate directly to the Crisis Boss instead of declaring early war victory!
    expect(st.phase).toBe('war');
    expect(war.crisis!.phase).toBe(3);
    expect(st.pending?.kind).toBe('war_crisis_raid');
  });

  it('recovers automatically from an empty beatQueue in war phase without softlocking', () => {
    const sim = new ShinobiSim();
    sim.newLife(22222, { crisisOverride: 'none' });
    const st = sim.getState();
    st.age = 20;
    promoteRank(st, 'chunin');
    st.pending = buildWarPreludeDecision(st, false);
    sim.resolve('deploy_front');

    // Simulate a corrupt/legacy mid-war save with empty beatQueue and no pending decision
    st.pending = null;
    st.war!.beatQueue = [];
    st.war!.beatClock = 0;

    sim.stepWarBeat();
    const after = sim.getState();
    expect(after.pending !== null || (after.war?.beatQueue.length ?? 0) > 0).toBe(true);
  });

  it('keeps support_clone (+8) and 2-round defensive buffs active on subsequent rounds and resets resolve_boost', () => {
    const state = createNewLife(33333, { crisisOverride: 'none' });
    state.age = 22;
    promoteRank(state, 'jonin');
    state.stats.chakra = 80;
    state.stats.health = 90;
    state.disciplines.push({
      id: 'shadow_clone',
      level: 3,
      xp: 30,
      lastLevelAge: 20,
      quality: 1,
      isMain: false,
      declinedUntilAge: 0,
    });
    state.disciplines.push({
      id: 'barrier',
      level: 3,
      xp: 30,
      lastLevelAge: 20,
      quality: 1,
      isMain: false,
      declinedUntilAge: 0,
    });
    const rng = new SeededRng(777);
    const war = initWarState(state, rng, false, 'front');
    state.war = war;
    war.cp = 100;
    war.hp = 100;
    const enemy = war.enemies[0];
    enemy.hp = 200; // ensure battle continues across rounds

    startWarBattle(state, enemy.id, { isFinal: false, isAmbush: true, isDefense: false });
    const battle = war.activeBattle!;

    // Cast support_clone -> must still have playerBuffRounds = 1 and playerCloneEvade = true AFTER Round 1 ends!
    resolveBattleRound(state, 'support_clone', rng);
    expect(battle.playerBuffRounds).toBe(1);
    expect(battle.playerCloneEvade).toBe(true);

    // Cast support_ward -> must still have playerWardRounds = 2 AFTER Round 2 ends!
    resolveBattleRound(state, 'support_ward', rng);
    expect(battle.playerWardRounds).toBe(2);

    // Cast resolve_boost -> must reset resolveBoostThisRound back to false after round resolves!
    war.resolves = 2;
    resolveBattleRound(state, 'resolve_boost', rng);
    expect(battle.resolveBoostThisRound).toBe(false);
    // And playerWardRounds decremented once from 2 -> 1 (still active for its 2nd round!)
    expect(battle.playerWardRounds).toBe(1);
  });

  it('keeps custom war_orphan parentless and applies custom origin/stat offsets accurately', () => {
    const state = createNewLife(44444, {
      customBuild: {
        mode: 'points',
        name: 'Renji',
        sex: 'M',
        originId: 'war_orphan',
        villageId: 'ame',
        capacity: 3,
        element: 'water',
        statOffsets: { chakra: 15, intel: 10 },
      },
    });
    expect(state.originId).toBe('war_orphan');
    expect(state.villageId).toBe('ame');
    expect(state.family.length).toBe(0);
    expect(state.leanings.vengeance).toBeGreaterThanOrEqual(1);
    expect(state.stats.chakra).toBeGreaterThanOrEqual(35);
  });

  it('matches battle retreat UI estimate with actual computeRetreatChance helper', () => {
    const state = createNewLife(55555, { crisisOverride: 'none' });
    state.age = 21;
    promoteRank(state, 'chunin');
    const rng = new SeededRng(888);
    const war = initWarState(state, rng, false, 'front');
    state.war = war;
    const enemy = war.enemies[0];

    const pRanks = getPlayerRanks(state, false);
    const eRanks = getDisplayEnemyRanks(enemy);
    const expected = Math.round(computeRetreatChance(pRanks[1], eRanks[1], false, false) * 100);
    expect(estimateRetreatChance(state, enemy)).toBe(expected);
  });

  it('prevents crisisCleared double counting, makes submitLastWords idempotent, and fixes achievement checks', () => {
    const sim = new ShinobiSim();
    sim.newLife(66666, { crisisOverride: 'calamity' });
    const st = sim.getState();
    st.world.crisisStage = 3;
    st.flags.had_jutsu_clash = true;
    st.flags.had_loyal_intercept = false;
    st.warHistory.push({
      warNumber: 1,
      ageAtStart: 20,
      rankAtStart: 'jonin',
      isCrisisWar: true,
      crisisId: 'calamity',
      outcome: 'victor',
      title: 'The Seal of the Storm',
      fieldPromoted: false,
      summary: 'Survived and sealed the crisis.',
      narrativeArcs: [
        { id: 'arc_kizuna', title: 'Old Friend Across the Line', summary: 'Met an ex-squadmate.', tone: 'bond' },
      ],
    });

    const meta = createDefaultMeta();
    // Live updates must NOT increment crisisCleared (only recordLifeIntoMeta does on life end)
    const { meta: afterLive } = updateMetaFromState(meta, st);
    expect(afterLive.crisisCleared.calamity).toBe(0);

    // Achievement checks: had_jutsu_clash unlocks ach_jutsu_clash even after war cleared;
    // arc_kizuna alone must NOT falsely unlock ach_loyal_intercept!
    expect(ACHIEVEMENT_MAP.ach_jutsu_clash.check(st, afterLive)).toBe(true);
    expect(ACHIEVEMENT_MAP.ach_loyal_intercept.check(st, afterLive)).toBe(false);

    const { meta: afterEnd } = recordCompletedLifeInMeta(afterLive, st);
    expect(afterEnd.crisisCleared.calamity).toBe(1);

    // submitLastWords idempotency check
    st.phase = 'posthumous';
    let endCount = 0;
    sim.setHooks({
      onEnd: () => {
        endCount += 1;
      },
    });
    sim.submitLastWords('Guard the village.');
    sim.submitLastWords('Duplicate submission should be ignored.');
    expect(endCount).toBe(1);
    expect(sim.getState().phase).toBe('ended');
  });

  it('validates imported saves, sanitizes corrupt meta, and wraps PNG text without off-by-one drop', () => {
    expect(isValidGameState(null)).toBe(false);
    expect(isValidGameState({ name: 'Broken' })).toBe(false);

    const validState = createNewLife(77777);
    expect(isValidGameState(validState)).toBe(true);

    const sanitized = sanitizeMetaState({
      livesPlayed: -5,
      achievements: ['ach_academy', 123, null],
      codexRoster: 'not-an-object',
      crisisCleared: { calamity: 2, mastermind: 'bad' },
    });
    expect(sanitized.livesPlayed).toBe(0);
    expect(sanitized.achievements).toEqual(['ach_academy']);
    expect(sanitized.crisisCleared).toEqual({ calamity: 2, mastermind: 0 });
    expect(sanitized.codexRoster).toEqual({});

    // wrapLines off-by-one regression: 2nd line must NOT truncate 1 word early!
    const measure = (s: string) => s.length * 10;
    const lines = wrapLines(measure, 'one two three four five six', 140, 2);
    expect(lines.length).toBe(2);
    expect(lines[0]).toBe('one two three');
    expect(lines[1]).toBe('four five six');
  });

  it('enforces clean data packs: zero duplicate surname/given-name pairs and no senjutsu family start', () => {
    for (const village of VILLAGES) {
      const surnames = new Set(village.surnames);
      for (const m of village.maleNames) {
        expect(surnames.has(m), `${village.id} maleName "${m}" duplicates surname`).toBe(false);
      }
      for (const f of village.femaleNames) {
        expect(surnames.has(f), `${village.id} femaleName "${f}" duplicates surname`).toBe(false);
      }
    }
    const kumo = VILLAGES.find((v) => v.id === 'kumo')!;
    expect(kumo.maleNames).not.toContain('Yugito');

    for (const origin of ORIGINS) {
      expect(origin.familyDisciplines).not.toContain('senjutsu');
      expect(origin.familyDisciplines).not.toContain('space_time');
    }
  });

  it('supports Free Mode direct 0..100 starting stats, discipline tier, mastered bloodline & orphan rewrite', () => {
    const state = createNewLife(88888, {
      customBuild: {
        mode: 'free',
        name: 'Aoi Senju',
        sex: 'F',
        originId: 'war_orphan',
        villageId: 'konoha',
        capacity: 5,
        element: 'water',
        statOffsets: {},
        directStats: {
          chakra: 100,
          intel: 100,
          will: 100,
          bonds: 100,
          health: 100,
          ryo: 100,
        },
        startDisciplineId: 'senjutsu',
        startDisciplineLevel: 4,
        latentBloodlineId: 'mokuton',
        startBloodlineStage: 'mastered',
      },
    });

    expect(state.stats.chakra).toBe(100);
    expect(state.stats.intel).toBe(100);
    expect(state.stats.will).toBe(100);
    expect(state.stats.bonds).toBe(100);
    expect(state.stats.health).toBe(100);
    expect(state.stats.ryo).toBe(100);
    expect(state.disciplines[0]?.id).toBe('senjutsu');
    expect(state.disciplines[0]?.level).toBe(4);
    expect(state.bloodline?.id).toBe('mokuton');
    expect(state.bloodline?.stage).toBe('mastered');

    // Orphan rewrite replaces "Your household" cleanly
    expect(rewriteOrphanText('Your household begins instilling fundamentals.', true)).toContain(
      'the orphanage elders',
    );
    expect(state.logs.some((l) => l.text.toLowerCase().includes('your household'))).toBe(false);
  });

  it('allows canceling war_target sub-menus (including Propose Alliance) back to war_night without losing a turn', () => {
    const sim = new ShinobiSim();
    sim.newLife(99999, { crisisOverride: 'none' });
    const st = sim.getState();
    st.age = 21;
    promoteRank(st, 'chunin');
    st.pending = buildWarPreludeDecision(st, false);
    sim.resolve('deploy_front');

    sim.flushWarUntilDecision();
    expect(sim.getState().pending?.kind).toBe('war_day');
    sim.resolve('day_cover');

    sim.flushWarUntilDecision();
    expect(sim.getState().pending?.kind).toBe('war_night');
    const dayBefore = sim.getState().war!.day;
    const cpBefore = sim.getState().war!.cp;

    // Enter Propose Temporary Alliance (Diplomacy) target sub-menu
    sim.resolve('night_ally');
    const targetPending = sim.getState().pending!;
    expect(targetPending.kind).toBe('war_target');
    expect(targetPending.cancelOptionId).toBe('cancel_back');
    const cancelOpt = targetPending.options.find((o) => o.id === 'cancel_back');
    expect(cancelOpt).toBeDefined();
    expect(cancelOpt?.autoEligible).toBe(false);

    // Cancel back to war_night cleanly without advancing day or spending CP
    sim.resolve('cancel_back');
    expect(sim.getState().pending?.kind).toBe('war_night');
    expect(sim.getState().war!.day).toBe(dayBefore);
    expect(sim.getState().war!.cp).toBe(cpBefore);
  });
});
