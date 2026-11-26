import { describe, expect, it } from 'vitest';
import {
  getKnownJutsu,
  JUTSU_DB,
  JUTSU_MAP,
  JUTSU_RANK_BASE_POWER,
  ZODIAC_SEAL_KANJI,
} from '../src/data/jutsu';
import {
  buildBattleRoundDecision,
  getEffectiveJutsuCost,
  resolveBattleRound,
} from '../src/sim/combat';
import { createNewLife } from '../src/sim/life';
import { promoteRank } from '../src/sim/ranks';
import { SeededRng } from '../src/sim/rng';
import { initWarState, startWarBattle } from '../src/sim/war';

describe('Phase 4-6 Individual Jutsu Database, Mastery & Resolver Acceptance', () => {
  it('validates all jutsu definitions (cost >= 0, valid zodiac seals, S > A > B > C > D base power)', () => {
    expect(JUTSU_DB.length).toBeGreaterThanOrEqual(28);
    for (const j of JUTSU_DB) {
      expect(j.chakraCost).toBeGreaterThanOrEqual(0);
      for (const seal of j.seals) {
        expect(ZODIAC_SEAL_KANJI[seal], `Invalid zodiac seal "${seal}" on ${j.id}`).toBeDefined();
      }
    }
    expect(JUTSU_RANK_BASE_POWER.S).toBeGreaterThan(JUTSU_RANK_BASE_POWER.A);
    expect(JUTSU_RANK_BASE_POWER.A).toBeGreaterThan(JUTSU_RANK_BASE_POWER.B);
    expect(JUTSU_RANK_BASE_POWER.B).toBeGreaterThan(JUTSU_RANK_BASE_POWER.C);
    expect(JUTSU_RANK_BASE_POWER.C).toBeGreaterThan(JUTSU_RANK_BASE_POWER.D);
  });

  it('exposes only known jutsu as executable options and rejects unknown/unlearned jutsu execution', () => {
    const state = createNewLife(88101, { preferredVillage: 'konoha', crisisOverride: 'none' });
    state.age = 16;
    promoteRank(state, 'chunin');
    state.element = 'fire';
    state.disciplines = [
      { id: 'fire_release', level: 1, xp: 4, lastLevelAge: 14, quality: 1, isMain: true, declinedUntilAge: 0 },
    ];
    const rng = new SeededRng(88101);
    state.war = initWarState(state, rng, false, 'front');
    startWarBattle(state, state.war.enemies[0].id, { isFinal: false, isAmbush: true, isDefense: false });

    const menu = buildBattleRoundDecision(state);
    const knownIds = new Set(getKnownJutsu(state).map((j) => `jutsu:${j.id}`));
    const executableJutsuOpts = menu.options.filter((o) => o.id.startsWith('jutsu:'));
    expect(executableJutsuOpts.length).toBe(knownIds.size);
    for (const opt of executableJutsuOpts) {
      expect(knownIds.has(opt.id)).toBe(true);
    }

    // Active battle no longer has any Od field
    const rawBattle = state.war.activeBattle as unknown as Record<string, unknown>;
    expect('od' in rawBattle).toBe(false);
    expect('odMax' in rawBattle).toBe(false);
    expect('odUsedCount' in rawBattle).toBe(false);

    // Unlearned jutsu (Chidori) cannot be executed directly
    expect(() => resolveBattleRound(state, 'jutsu:chidori', rng)).toThrow();
    expect(() => resolveBattleRound(state, 'jutsu:nonexistent_art', rng)).toThrow();
  });

  it('records exact jutsuName & seals, increments mastery counter, and lowers CP cost at 15 uses', () => {
    const state = createNewLife(88102, { preferredVillage: 'konoha', crisisOverride: 'none' });
    state.age = 20;
    promoteRank(state, 'jonin');
    state.stats.chakra = 80;
    state.stats.health = 85;
    state.element = 'fire';
    state.disciplines = [
      { id: 'fire_release', level: 2, xp: 10, lastLevelAge: 18, quality: 1, isMain: true, declinedUntilAge: 0 },
    ];
    const rng = new SeededRng(88102);
    state.war = initWarState(state, rng, false, 'front');
    const enemy = state.war.enemies[0];
    enemy.hp = 200;
    enemy.cp = 0;
    startWarBattle(state, enemy.id, { isFinal: false, isAmbush: true, isDefense: false });

    const gokakyu = JUTSU_MAP.gokakyu;
    const costLearning = getEffectiveJutsuCost(state, gokakyu, state.war);
    const res = resolveBattleRound(state, 'jutsu:gokakyu', rng);

    expect(res.summary.jutsuName).toBe(gokakyu.name);
    expect(res.summary.seals).toEqual([...gokakyu.seals]);
    expect(state.jutsuMastery!.gokakyu).toBe(1);

    // Reach Mastered (15+ uses) -> effective CP cost drops cleanly
    state.jutsuMastery!.gokakyu = 15;
    const costMastered = getEffectiveJutsuCost(state, gokakyu, state.war);
    expect(costMastered).toBeLessThan(costLearning);
  });

  it('makes Hosenka harder to dodge than Gokakyu across seeds and lets Chidori pierce Guard Walls', () => {
    // 1. Hosenka vs Gokakyu dodge comparison across 600 trials
    let hosenkaDodges = 0;
    let gokakyuDodges = 0;
    for (let i = 0; i < 600; i++) {
      for (const jutsuId of ['hosenka', 'gokakyu'] as const) {
        const st = createNewLife(88200 + i, { preferredVillage: 'konoha', crisisOverride: 'none' });
        st.age = 24;
        promoteRank(st, 'jonin');
        st.stats = { chakra: 92, intel: 80, will: 80, bonds: 60, health: 90, ryo: 40 };
        st.disciplines = [
          { id: 'fire_release', level: 2, xp: 10, lastLevelAge: 20, quality: 1, isMain: true, declinedUntilAge: 0 },
        ];
        const rng = new SeededRng(9000 + i * 31);
        st.war = initWarState(st, rng, false, 'front');
        st.war.partner = null;
        const foe = st.war.enemies[0];
        foe.ranks = [2.4, 5.2, 2.4, 2.4, 2.4]; // player easily wins exchange, high enemy SPD triggers dodge checks
        foe.skills = [{ name: 'Flicker', tag: 'evade', rank: 5 }];
        foe.cp = 0;
        foe.hp = 100;
        startWarBattle(st, foe.id, { isFinal: false, isAmbush: true, isDefense: false });
        const r = resolveBattleRound(st, `jutsu:${jutsuId}`, new SeededRng(50000 + i * 17));
        if (r.summary.whyLine.includes('Enemy evaded')) {
          if (jutsuId === 'hosenka') hosenkaDodges += 1;
          else gokakyuDodges += 1;
        }
      }
    }
    expect(hosenkaDodges).toBeLessThan(gokakyuDodges);

    // 2. Chidori pierces enemyWallRounds cleanly
    const stC = createNewLife(88300, { preferredVillage: 'konoha', crisisOverride: 'none' });
    stC.age = 24;
    promoteRank(stC, 'jonin');
    stC.stats = { chakra: 95, intel: 85, will: 85, bonds: 60, health: 92, ryo: 50 };
    stC.element = 'lightning';
    stC.flags.learned_chidori = true;
    stC.disciplines = [
      { id: 'lightning_release', level: 3, xp: 20, lastLevelAge: 22, quality: 1, isMain: true, declinedUntilAge: 0 },
    ];
    const rngC = new SeededRng(88300);
    stC.war = initWarState(stC, rngC, false, 'front');
    stC.war.partner = null;
    const foeC = stC.war.enemies[0];
    foeC.ranks = [2.2, 2.2, 2.2, 2.2, 2.2];
    foeC.skills = [];
    foeC.cp = 0;
    foeC.hp = 100;
    startWarBattle(stC, foeC.id, { isFinal: false, isAmbush: true, isDefense: false });
    stC.war.activeBattle!.enemyWallRounds = 2;

    let piercedWall = false;
    for (let s = 1; s <= 15; s++) {
      stC.war.cp = 100;
      foeC.hp = 100;
      stC.war.activeBattle!.enemyWallRounds = 2;
      const res = resolveBattleRound(stC, 'jutsu:chidori', new SeededRng(1000 + s));
      if (res.summary.narrative.includes('cleaves straight through their Guard Wall')) {
        piercedWall = true;
        break;
      }
    }
    expect(piercedWall).toBe(true);
  }, 15000);
});
