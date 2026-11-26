import { describe, expect, it } from 'vitest';
import { ROSTER_MAP } from '../src/data/roster';
import {
  getCombatRating,
  getCombatTier,
  getPlayerRanks,
  getPowerGapRead,
  pickAutoJutsu,
  resolveBattleRound,
} from '../src/sim/combat';
import { createNewLife } from '../src/sim/life';
import { promoteRank } from '../src/sim/ranks';
import { SeededRng } from '../src/sim/rng';
import { initWarState, startWarBattle } from '../src/sim/war';
import { buildWarPreludeDecision, GENIN_DRAFT_CHANCE } from '../src/sim/world';

interface DuelMetrics {
  exchangeWinRate: number;
  avgHpLost: number;
  deathRate: number;
}

function buildFighterState(
  seed: number,
  tier: 'genin' | 'chunin' | 'jonin' | 'elite_jonin',
) {
  const state = createNewLife(seed, { preferredVillage: 'konoha', crisisOverride: 'none' });
  state.bloodline = null;
  state.hasClanLegacy = false;
  state.element = 'fire';

  if (tier === 'genin') {
    state.age = 13;
    promoteRank(state, 'genin');
    state.capacity = 2;
    state.stats = { chakra: 34, intel: 28, will: 30, bonds: 40, health: 42, ryo: 15 };
    state.disciplines = [
      { id: 'fire_release', level: 1, xp: 4, lastLevelAge: 12, quality: 1, isMain: true, declinedUntilAge: 0 },
    ];
  } else if (tier === 'chunin') {
    state.age = 18;
    promoteRank(state, 'chunin');
    state.capacity = 2;
    state.stats = { chakra: 50, intel: 46, will: 48, bonds: 45, health: 52, ryo: 25 };
    state.disciplines = [
      { id: 'fire_release', level: 2, xp: 10, lastLevelAge: 16, quality: 1, isMain: true, declinedUntilAge: 0 },
    ];
  } else if (tier === 'jonin') {
    state.age = 24;
    promoteRank(state, 'jonin');
    state.capacity = 3;
    state.stats = { chakra: 68, intel: 62, will: 62, bonds: 55, health: 66, ryo: 40 };
    state.disciplines = [
      { id: 'fire_release', level: 2, xp: 14, lastLevelAge: 20, quality: 1, isMain: true, declinedUntilAge: 0 },
    ];
  } else {
    state.age = 28;
    promoteRank(state, 'jonin');
    state.capacity = 4;
    state.stats = { chakra: 86, intel: 78, will: 78, bonds: 60, health: 80, ryo: 60 };
    state.disciplines = [
      { id: 'fire_release', level: 3, xp: 24, lastLevelAge: 24, quality: 1.1, isMain: true, declinedUntilAge: 0 },
      { id: 'strong_fist', level: 2, xp: 12, lastLevelAge: 23, quality: 1, isMain: false, declinedUntilAge: 0 },
    ];
  }
  return state;
}

function runMonteCarloDuel(opts: {
  battles: number;
  playerTier: 'genin' | 'chunin' | 'jonin' | 'elite_jonin';
  enemyRanks: [number, number, number, number, number];
  enemySkillPower?: number;
  tacticalSetup?: boolean;
  startHp?: number;
  startCp?: number;
}): DuelMetrics {
  let playerExchangeWins = 0;
  let playerExchangeLosses = 0;
  let totalHpLost = 0;
  let deaths = 0;

  const templateState = buildFighterState(700000, opts.playerTier);
  // Drop worldSim from the duel template so 7,000 Monte Carlo battles clone in milliseconds
  templateState.worldSim = undefined;

  for (let i = 0; i < opts.battles; i++) {
    const seed = 700000 + i * 7919;
    const state = structuredClone(templateState);
    state.rng = { seed, state: seed };
    const rng = new SeededRng(seed + 13);
    state.war = initWarState(state, rng, false, 'front');
    const war = state.war;

    // Disable partner interference unless tacticalSetup is explicitly enabled
    if (opts.tacticalSetup) {
      if (war.partner) {
        war.partner.active = true;
        war.partner.trust = 88;
      }
      war.nextBattleBonus = 18;
      war.strategicClaimedBy = 'player';
    } else {
      war.partner = null;
      war.nextBattleBonus = 0;
      war.strategicClaimedBy = null;
    }

    const startHp = opts.startHp ?? 100;
    war.hp = startHp;
    war.cp = opts.startCp ?? 100;
    war.exposure = 0;
    war.resolves = 0;

    const enemy = war.enemies[0];
    enemy.ranks = [...opts.enemyRanks];
    enemy.element = 'earth'; // neutral vs fire
    enemy.tactic = 'defensive';
    enemy.fort = 0;
    enemy.hp = 100;
    enemy.cp = 20; // > 0 (no chakra exhaustion penalty), < ultimate cost (pure exchange benchmark)
    enemy.ultimate = { ...enemy.ultimate, cost: 999 };
    enemy.skills = opts.enemySkillPower
      ? [{ name: 'Edge', tag: 'power', rank: opts.enemySkillPower }]
      : [];
    enemy.intel = opts.tacticalSetup ? 100 : 0;

    startWarBattle(state, enemy.id, {
      isFinal: false,
      isAmbush: Boolean(opts.tacticalSetup),
      isDefense: false,
    });
    if (opts.tacticalSetup && war.activeBattle) {
      war.activeBattle.weaknessExploited = true;
    }

    let status = 'continue';
    while (status === 'continue') {
      const actionId = pickAutoJutsu(state, rng);
      const res = resolveBattleRound(state, actionId, rng);
      if (res.summary.outcome === 'win' || res.summary.outcome === 'clash_win') {
        playerExchangeWins += 1;
      } else if (res.summary.outcome === 'lose' || res.summary.outcome === 'clash_lose') {
        playerExchangeLosses += 1;
      }
      status = res.status;
    }

    totalHpLost += Math.max(0, startHp - war.hp);
    if (status === 'player_dead') deaths += 1;
  }

  return {
    exchangeWinRate: playerExchangeWins / Math.max(1, playerExchangeWins + playerExchangeLosses),
    avgHpLost: totalHpLost / opts.battles,
    deathRate: deaths / opts.battles,
  };
}

describe('Phase 1-3 Power Scaling & Asymmetric Gap Acceptance (Monte Carlo 1,000 battles)', () => {
  it('spawns full unscaled roster stats for Genin, classifies tiers accurately, and drafts Genin ~10% (100% in crisis)', () => {
    const genin = buildFighterState(11001, 'genin');
    const war = initWarState(genin, new SeededRng(11001), false, 'front');

    // Every roster competitor must keep exact ROSTER_MAP ranks with zero rank scaling
    for (const enemy of war.enemies) {
      const def = ROSTER_MAP[enemy.rosterId];
      if (!def) continue;
      expect(enemy.ranks).toEqual(def.ranks);
      expect(enemy.officialRank).toBe(def.officialRank);
      expect(enemy.threatClass).toBe(def.threatClass);
    }

    // Tier classification ordering
    const geninRanks: [number, number, number, number, number] = [2.3, 2.4, 2.3, 2.5, 2.4];
    const eliteRanks: [number, number, number, number, number] = [4.5, 4.6, 4.4, 4.6, 4.5];
    expect(getCombatTier(geninRanks)).toBe('genin');
    expect(getCombatTier(eliteRanks)).toBe('elite_jonin');
    expect(getCombatRating(geninRanks)).toBeLessThan(getCombatRating(eliteRanks));

    // Genin vs S-rogue power gap reads Overwhelming
    const sRogue = ROSTER_MAP.ros_s_kurogumo;
    const mockRogue = { ...war.enemies[0], ranks: [...sRogue.ranks] as [number, number, number, number, number], archetype: 'rogue_s' as const, threatClass: 'S' as const, intel: 0 };
    expect(getPowerGapRead(genin, mockRogue).label).toBe('Overwhelming');

    // Genin draft probability over 1,000 non-crisis war triggers: 5% - 15%
    const draftRng = new SeededRng(88421);
    let nonCrisisDeployed = 0;
    for (let i = 0; i < 1000; i++) {
      const deployed = draftRng.chance(GENIN_DRAFT_CHANCE);
      const prelude = buildWarPreludeDecision(genin, false, deployed);
      if (prelude.eventId === 'war_prelude_shinobi') {
        nonCrisisDeployed += 1;
      } else {
        expect(prelude.eventId).toBe('war_prelude_genin_home');
      }
    }
    expect(nonCrisisDeployed).toBeGreaterThanOrEqual(50);
    expect(nonCrisisDeployed).toBeLessThanOrEqual(150);

    // Crisis war deploys Genin 100%
    const crisisPrelude = buildWarPreludeDecision(genin, true, true);
    expect(crisisPrelude.eventId).toBe('war_prelude_shinobi');
  });

  it('enforces real asymmetric power gaps across tiers and rewards tactical preparation (1,000 duels each)', () => {
    const geninCR = getCombatRating(getPlayerRanks(buildFighterState(1, 'genin')));
    const chuninCR = getCombatRating(getPlayerRanks(buildFighterState(1, 'chunin')));
    const joninCR = getCombatRating(getPlayerRanks(buildFighterState(1, 'jonin')));
    const eliteCR = getCombatRating(getPlayerRanks(buildFighterState(1, 'elite_jonin')));
    expect(geninCR).toBeLessThan(2.7);
    expect(chuninCR).toBeGreaterThanOrEqual(2.8);
    expect(joninCR).toBeGreaterThanOrEqual(3.6);
    expect(eliteCR).toBeGreaterThanOrEqual(4.3);

    // 1. Genin (CR ~2.4) vs S-rogue roster (CR ~4.8) -> exchange win <= 5%, avg HP lost >= 60
    const sDef = ROSTER_MAP.ros_s_kurogumo;
    const geninVsS = runMonteCarloDuel({
      battles: 1000,
      playerTier: 'genin',
      enemyRanks: [...sDef.ranks],
      enemySkillPower: 3,
    });
    expect(geninVsS.exchangeWinRate).toBeLessThanOrEqual(0.05);
    expect(geninVsS.avgHpLost).toBeGreaterThanOrEqual(60);

    // 2. Chunin (~3.2) vs Elite Jonin (~4.5) -> exchange win <= 15%
    const chuninVsElite = runMonteCarloDuel({
      battles: 1000,
      playerTier: 'chunin',
      enemyRanks: [4.5, 4.5, 4.5, 4.5, 4.5],
      enemySkillPower: 2,
    });
    expect(chuninVsElite.exchangeWinRate).toBeLessThanOrEqual(0.15);

    // 3. Jonin vs Jonin (+-0.2 CR) -> exchange win 40-60%
    const joninVsJonin = runMonteCarloDuel({
      battles: 1000,
      playerTier: 'jonin',
      enemyRanks: [joninCR, joninCR, joninCR, joninCR, joninCR],
    });
    expect(joninVsJonin.exchangeWinRate).toBeGreaterThanOrEqual(0.4);
    expect(joninVsJonin.exchangeWinRate).toBeLessThanOrEqual(0.6);

    // 4. Elite Jonin vs Kage-class (~5.3) -> exchange win 10-30%
    const eliteVsKage = runMonteCarloDuel({
      battles: 1000,
      playerTier: 'elite_jonin',
      enemyRanks: [5.3, 5.3, 5.3, 5.3, 5.3],
    });
    expect(eliteVsKage.exchangeWinRate).toBeGreaterThanOrEqual(0.1);
    expect(eliteVsKage.exchangeWinRate).toBeLessThanOrEqual(0.3);

    // 5. Genin vs S WITH ambush + prep + weakness + high-trust partner -> >= 3x open duel win rate
    const geninVsSTactical = runMonteCarloDuel({
      battles: 1000,
      playerTier: 'genin',
      enemyRanks: [...sDef.ranks],
      enemySkillPower: 3,
      tacticalSetup: true,
    });
    expect(geninVsSTactical.exchangeWinRate).toBeGreaterThanOrEqual(
      Math.max(0.06, geninVsS.exchangeWinRate * 3),
    );

    // 6. Wounded (HP 40) or Exhausted (CP 0) drops Jonin vs Jonin win rate by >= 10 percentage points
    const joninWounded = runMonteCarloDuel({
      battles: 1000,
      playerTier: 'jonin',
      enemyRanks: [joninCR, joninCR, joninCR, joninCR, joninCR],
      startHp: 40,
    });
    const joninExhausted = runMonteCarloDuel({
      battles: 1000,
      playerTier: 'jonin',
      enemyRanks: [joninCR, joninCR, joninCR, joninCR, joninCR],
      startCp: 0,
    });
    expect(joninVsJonin.exchangeWinRate - joninWounded.exchangeWinRate).toBeGreaterThanOrEqual(0.1);
    expect(joninVsJonin.exchangeWinRate - joninExhausted.exchangeWinRate).toBeGreaterThanOrEqual(0.1);
  }, 20000);
});
