import { describe, expect, it } from 'vitest';
import {
  buildBattleRoundDecision,
  getElementMultiplier,
  getPlayerSignatureUltimate,
  resolveBattleRound,
  unitBasePower,
} from '../src/sim/combat';
import { createNewLife } from '../src/sim/life';
import { promoteRank } from '../src/sim/ranks';
import { SeededRng } from '../src/sim/rng';
import { initWarState, startWarBattle } from '../src/sim/war';

describe('Solo Tactical Combat & Jutsu Clash Engine', () => {
  it('enforces the full 5-element Naruto advantage triangle', () => {
    expect(getElementMultiplier('fire', 'wind').mult).toBe(1.18);
    expect(getElementMultiplier('wind', 'lightning').mult).toBe(1.18);
    expect(getElementMultiplier('lightning', 'earth').mult).toBe(1.18);
    expect(getElementMultiplier('earth', 'water').mult).toBe(1.18);
    expect(getElementMultiplier('water', 'fire').mult).toBe(1.18);
    expect(getElementMultiplier('wind', 'fire').mult).toBe(0.85);
    expect(getElementMultiplier('fire', 'earth').mult).toBe(1.0);
  });

  it('scales combat power down to 35% as HP approaches 0', () => {
    const full = unitBasePower([4, 4, 4, 4, 4], 100);
    const low = unitBasePower([4, 4, 4, 4, 4], 0);
    expect(low / full).toBeCloseTo(0.35, 2);
  });

  it('produces 1-line tactical Why breakdown on every round and honors 3x Resolve tokens', () => {
    const state = createNewLife(4444);
    state.age = 20;
    promoteRank(state, 'chunin');
    state.stats.chakra = 70;
    state.stats.health = 85;
    state.stats.intel = 65;
    state.stats.will = 65;
    state.element = 'fire';
    state.disciplines = [
      { id: 'fire_release', level: 1, xp: 4, lastLevelAge: 16, quality: 1, isMain: true, declinedUntilAge: 0 },
      { id: 'genjutsu', level: 1, xp: 4, lastLevelAge: 17, quality: 1, isMain: false, declinedUntilAge: 0 },
    ];
    state.bloodline = { id: 'sharingan', grade: 3, stage: 'ctrl1', lastEventAge: 16, declined: false };

    const rng = new SeededRng(999);
    state.war = initWarState(state, rng, false, 'front');
    startWarBattle(state, state.war.enemies[0].id, { isFinal: false, isAmbush: true, isDefense: false });

    const menu = buildBattleRoundDecision(state);
    expect(menu.options.some((o) => o.id === 'jutsu:basic_strike')).toBe(true);
    expect(menu.options.some((o) => o.id === 'jutsu:gokakyu')).toBe(true);
    expect(menu.options.some((o) => o.id === 'jutsu:magen_narakumi')).toBe(true);
    expect(menu.options.some((o) => o.id === 'jutsu:bloodline_secret_sharingan')).toBe(true);
    expect(menu.options.some((o) => o.id === 'bloodline')).toBe(true);
    expect(menu.options.some((o) => o.id === 'resolve_boost')).toBe(true);
    expect(menu.options.some((o) => o.id === 'resolve_flee')).toBe(true);

    // Round 1: activate bloodline
    const r1 = resolveBattleRound(state, 'bloodline', rng);
    expect(r1.summary.whyLine.length).toBeGreaterThan(10);
    expect(state.war.activeBattle!.bloodlineActiveRounds).toBeGreaterThanOrEqual(1);
    expect(state.bodyStrain).toBeGreaterThan(0);

    // Round 2: guaranteed Body Flicker retreat via Resolve token
    const r2 = resolveBattleRound(state, 'resolve_flee', rng);
    expect(r2.status).toBe('retreated');
    expect(state.war.resolves).toBe(2);
  });

  it('derives Tier-4 secret art signature ultimate for S-Rank mastery', () => {
    const state = createNewLife(5555);
    state.disciplines = [
      { id: 'fire_release', level: 4, xp: 50, lastLevelAge: 22, quality: 1.2, isMain: true, declinedUntilAge: 0 },
    ];
    const ult = getPlayerSignatureUltimate(state);
    expect(ult).not.toBeNull();
    expect(ult!.name).toBe('Katon: Goka Mekkyaku');
    expect(ult!.rankVal).toBeGreaterThanOrEqual(5);
  });
});
