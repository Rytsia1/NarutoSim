import { BLOODLINE_MAP, DISCIPLINE_MAP, ELEMENT_NAMES } from '../data/powers';
import { ARCHETYPE_AVG, ELEMENT_BEATS, ROSTER_MAP } from '../data/roster';
import { modRel } from './ai';
import { recordWarFact } from './narrative';
import { clamp, computeCombatProjection } from './powers';
import type { SeededRng } from './rng';
import type {
  ActiveBattleState,
  BattleRoundSummary,
  ChakraElement,
  GameState,
  PendingDecision,
  SkillTag,
  UltimateScope,
  WarCompetitor,
  WarState,
} from './types';

export interface PlayerUltimateInfo {
  name: string;
  rankVal: number;
  cost: number;
  element: ChakraElement;
  scope: UltimateScope;
}

export function getElementMultiplier(
  atk: ChakraElement,
  def: ChakraElement,
): { mult: number; clashBonus: number; label: string | null } {
  if (ELEMENT_BEATS[atk] === def) {
    return {
      mult: 1.18,
      clashBonus: 6,
      label: `${ELEMENT_NAMES[atk]} beats ${ELEMENT_NAMES[def]} (+18%)`,
    };
  }
  if (ELEMENT_BEATS[def] === atk) {
    return {
      mult: 0.85,
      clashBonus: -5,
      label: `${ELEMENT_NAMES[def]} counters ${ELEMENT_NAMES[atk]} (-15%)`,
    };
  }
  return { mult: 1.0, clashBonus: 0, label: null };
}

export function getPlayerSignatureUltimate(state: GameState): PlayerUltimateInfo {
  const best = [...state.disciplines].sort((a, b) => b.level - a.level || b.xp - a.xp)[0];
  if (best) {
    const def = DISCIPLINE_MAP[best.id];
    const elem = def?.element ?? state.element;
    if (best.level === 4 && def?.secretArtName) {
      return {
        name: def.secretArtName,
        rankVal: 5.2,
        cost: 30,
        element: elem,
        scope: 'fortress',
      };
    }
    if (best.level === 3 && def) {
      return {
        name: `Master ${def.name} Burst`,
        rankVal: 4.5,
        cost: 27,
        element: elem,
        scope: 'squad',
      };
    }
    if (def) {
      return {
        name: `${def.name} Overdrive`,
        rankVal: 3.6 + best.level * 0.35,
        cost: 24,
        element: elem,
        scope: 'single',
      };
    }
  }

  if (state.bloodline && state.bloodline.stage !== 'latent') {
    const bDef = BLOODLINE_MAP[state.bloodline.id];
    return {
      name: `${bDef?.name ?? 'Bloodline'} Secret Release`,
      rankVal: 4.0 + state.bloodline.grade * 0.25,
      cost: 26,
      element: state.element,
      scope: 'squad',
    };
  }

  return {
    name: `${ELEMENT_NAMES[state.element]} Release: Great Gale Surge`,
    rankVal: 3.5,
    cost: 22,
    element: state.element,
    scope: 'single',
  };
}

export function unitBasePower(ranks: [number, number, number, number, number], hp: number): number {
  const [tai, spd, sta, chk, ins] = ranks;
  const raw = 78 + tai * 1.7 + (spd + sta + chk) * 1.4 + ins * 1.9;
  return raw * (0.55 + 0.45 * (clamp(hp, 0, 100) / 100));
}

export function skillSum(skills: { tag: SkillTag; rank: number }[], tag: SkillTag): number {
  let sum = 0;
  for (const s of skills) {
    if (s.tag === tag) sum += s.rank;
  }
  return sum;
}

export function getPlayerRanks(state: GameState, resolveBoost = false): [number, number, number, number, number] {
  const p = computeCombatProjection(state);
  const b = resolveBoost ? 3 : 0;
  return [
    clamp(p.tai + b, 1, 8),
    clamp(p.spd + b, 1, 8),
    clamp(p.sta + b, 1, 8),
    clamp(p.chk + b, 1, 8),
    clamp(p.ins + b, 1, 8),
  ];
}

export function getDisplayEnemyRanks(enemy: WarCompetitor): [number, number, number, number, number] {
  if (enemy.intel >= 80) return enemy.ranks;
  return ARCHETYPE_AVG[enemy.archetype];
}

export function getHealthConditionLabel(hp: number): string {
  if (hp >= 90) return 'Unhurt';
  if (hp >= 70) return 'Scratched';
  if (hp >= 40) return 'Wounded';
  if (hp >= 15) return 'Bloodied';
  return 'Critical';
}

export interface BattleOddsEstimate {
  tier: 'strong' | 'even' | 'weak';
  label: string;
  isEstimate: boolean;
}

/**
 * Computes a fair matchup preview for the 3 core battle styles using ONLY
 * known enemy intel (`getDisplayEnemyRanks`) so hidden enemy stats are never leaked.
 */
export function estimateBattleActionOdds(
  state: GameState,
  enemy: WarCompetitor,
  actionId: 'taijutsu' | 'ninjutsu' | 'genjutsu',
  resolveBoost = false,
): BattleOddsEstimate {
  const isEstimate = enemy.intel < 80;
  const pRanks = getPlayerRanks(state, resolveBoost);
  const eRanks = getDisplayEnemyRanks(enemy);

  let mult = 1.0;
  if (actionId === 'taijutsu') {
    mult = clamp(1 + (pRanks[0] - eRanks[2]) * 0.09 + (pRanks[1] - eRanks[1]) * 0.03, 0.65, 1.55);
  } else if (actionId === 'ninjutsu') {
    const elemMult = enemy.intel >= 60 ? getElementMultiplier(state.element, enemy.element).mult : 1.0;
    mult = clamp(1 + (pRanks[3] - eRanks[3]) * 0.07, 0.72, 1.38) * elemMult;
  } else {
    mult = clamp(1 + (pRanks[4] - eRanks[4]) * 0.08, 0.72, 1.38);
  }

  const suffix = isEstimate ? ' (est.)' : '';
  if (mult >= 1.1) {
    return { tier: 'strong', label: `Strong${suffix}`, isEstimate };
  }
  if (mult <= 0.91) {
    return { tier: 'weak', label: `Weak${suffix}`, isEstimate };
  }
  return { tier: 'even', label: `Even${suffix}`, isEstimate };
}

export function estimateRetreatChance(
  state: GameState,
  enemy: WarCompetitor,
  resolveBoost = false,
): number {
  const pRanks = getPlayerRanks(state, resolveBoost);
  const eRanks = getDisplayEnemyRanks(enemy);
  return Math.round(clamp(0.45 + (pRanks[1] - eRanks[1]) * 0.07 + 0.06, 0.25, 0.92) * 100);
}

export function computePlayerRoundPower(
  state: GameState,
  war: WarState,
  enemy: WarCompetitor,
  battle: ActiveBattleState,
): { power: number; topFactor: string } {
  const ranks = getPlayerRanks(state, battle.resolveBoostThisRound);
  const base = unitBasePower(ranks, war.hp);
  let total = base;

  const terms: { label: string; val: number }[] = [];

  const intelBonus = Math.round(enemy.intel * 0.11);
  if (intelBonus > 0) {
    total += intelBonus;
    terms.push({ label: `Intel Bonus (+${intelBonus})`, val: intelBonus });
  }

  if (battle.isDefense && war.fort > 0) {
    const fortBonus = Math.round(war.fort * 0.22 + (war.workshop >= 100 ? 10 : 0));
    total += fortBonus;
    terms.push({ label: `Camp Fortification (+${fortBonus})`, val: fortBonus });
  }

  if (battle.isAmbush && battle.round <= 2) {
    const amb = battle.round === 1 ? 10 : 5;
    total += amb;
    terms.push({ label: `Ambush Initiative (+${amb})`, val: amb });
  }

  if (battle.bloodlineActiveRounds > 0 && state.bloodline) {
    const bBoost = 9 + state.bloodline.grade * 2;
    total += bBoost;
    terms.push({ label: `${BLOODLINE_MAP[state.bloodline.id]?.name ?? 'Bloodline'} (+${bBoost})`, val: bBoost });
  }

  if (battle.playerBuffRounds > 0) {
    total += 8;
    terms.push({ label: 'Tactical Buff (+8)', val: 8 });
  }

  if (battle.weaknessExploited) {
    const wk = 8 + Math.round(state.stats.intel * 0.1);
    total += wk;
    terms.push({ label: `Weakness Exploited (+${wk})`, val: wk });
  }

  if (war.nextBattleBonus > 0) {
    total += war.nextBattleBonus;
    terms.push({ label: `Prep Bonus (+${war.nextBattleBonus})`, val: war.nextBattleBonus });
  }

  if (war.strategicClaimedBy === 'player') {
    total += 6;
    terms.push({ label: 'Strategic High Ground (+6)', val: 6 });
  }

  if (battle.resolveBoostThisRound) {
    terms.push({ label: 'Limit Break: Surpass Limits (+3 Ranks)', val: 24 });
  }

  if (war.cp <= 0) {
    total -= 22;
    terms.push({ label: 'Chakra Exhaustion (-22)', val: 22 });
  } else if (war.cp < 12) {
    total -= 8;
    terms.push({ label: 'Low Chakra (-8)', val: 8 });
  }

  // Modest underdog compression so lower-rank shinobi can still survive/upset tactically
  const enemyBase = unitBasePower(enemy.ranks, enemy.hp);
  if (base < enemyBase - 8) {
    const underdog = Math.min(11, Math.round((enemyBase - base) * 0.28));
    total += underdog;
    terms.push({ label: `Underdog Grit (+${underdog})`, val: underdog });
  }

  if (battle.enemyFieldRounds > 0) {
    total -= 7;
    terms.push({ label: 'Enemy Terrain Field (-7)', val: 7 });
  }

  terms.sort((a, b) => b.val - a.val);
  return { power: total, topFactor: terms[0]?.label ?? 'Core Combat Ranks' };
}

export function computeEnemyRoundPower(
  war: WarState,
  enemy: WarCompetitor,
  battle: ActiveBattleState,
): number {
  let total = unitBasePower(enemy.ranks, enemy.hp);
  total += skillSum(enemy.skills, 'power') * 1.4;
  if (battle.round >= 2) total += skillSum(enemy.skills, 'insight') * 0.9;
  if (battle.round === 1 && !battle.isAmbush) total += skillSum(enemy.skills, 'stealth') * 1.2;
  total += Math.round(war.exposure * 0.12);

  if (enemy.tactic === 'reckless') total += 5;
  if (!battle.isDefense && enemy.fort > 0) total += Math.round(enemy.fort * 0.08);
  if (battle.enemyDebuffRounds > 0) total -= 9;
  if (enemy.cp <= 0) total -= 18;

  return total;
}

export function npcUltimateChance(enemy: WarCompetitor, playerHp: number, isFinal: boolean): number {
  if (enemy.cp < enemy.ultimate.cost) return 0;
  let p = 0.12;
  if (enemy.hp < 50) p += 0.12;
  if (isFinal) p += 0.1;
  if (playerHp <= 35) p += 0.2;
  if (enemy.tactic === 'reckless') p *= 1.5;
  if (enemy.tactic === 'defensive') p *= 0.7;
  return clamp(p, 0, 0.75);
}

export function buildBattleRoundDecision(state: GameState): PendingDecision {
  const war = state.war!;
  const battle = war.activeBattle!;
  const enemy = war.enemies.find((e) => e.id === battle.enemyId)!;
  const ult = getPlayerSignatureUltimate(state);

  const enemyLabel = enemy.intel >= 80 ? `${enemy.name} (${enemy.epithet})` : `Unknown ${enemy.archetype.toUpperCase()}`;
  const elemHint =
    enemy.intel >= 60
      ? `Element: ${ELEMENT_NAMES[enemy.element]}`
      : 'Element: Unknown';
  const elemMatch = enemy.intel >= 60 ? getElementMultiplier(state.element, enemy.element).label : null;

  const hasMedical = state.disciplines.some((d) => d.id === 'medical');
  const hasWard = state.disciplines.some((d) => d.id === 'barrier' || d.id === 'earth_release' || d.id === 'fuinjutsu');
  const hasClone = state.disciplines.some((d) => d.id === 'shadow_clone' || d.id === 'genjutsu');
  const canBloodline =
    state.bloodline !== null &&
    state.bloodline.stage !== 'latent' &&
    battle.bloodlineActiveRounds === 0;

  const options: PendingDecision['options'] = [
    {
      id: 'taijutsu',
      label: 'Taijutsu Strike (Head-On, 0 CP)',
      sublabel: 'Tests TAI against enemy Stamina. Reliable when conserving Chakra.',
      statHints: ['TAI', 'STA'],
      autoEligible: true,
    },
    {
      id: 'ninjutsu',
      label: `${ELEMENT_NAMES[state.element]} Ninjutsu (8 CP)`,
      sublabel: elemMatch ? `Elemental read: ${elemMatch}` : 'Scales with Chakra and elemental nature matchups.',
      statHints: ['CHK', ELEMENT_NAMES[state.element]],
      disabled: war.cp < 8,
      disabledReason: 'Requires 8 CP',
      autoEligible: war.cp >= 8,
    },
    {
      id: 'genjutsu',
      label: 'Genjutsu / Tactical Feint (6 CP)',
      sublabel: 'Tests Insight & Will; success weakens the enemy for 2 rounds.',
      statHints: ['INS', 'Will'],
      disabled: war.cp < 6,
      disabledReason: 'Requires 6 CP',
      autoEligible: war.cp >= 6,
    },
    {
      id: 'ultimate',
      label: `Unleash Ultimate: ${ult.name} (${ult.cost} CP)`,
      sublabel: 'Massive strike. If enemy fires their Ultimate simultaneously, triggers a Jutsu Clash!',
      statHints: ['Ultimate', `${ult.cost} CP`],
      disabled: war.cp < ult.cost,
      disabledReason: `Requires ${ult.cost} CP`,
      autoEligible: war.cp >= ult.cost && (enemy.hp <= 55 || battle.isFinal),
    },
  ];

  if (canBloodline && state.bloodline) {
    const bDef = BLOODLINE_MAP[state.bloodline.id];
    options.push({
      id: 'bloodline',
      label: `Activate ${bDef?.name ?? 'Kekkei Genkai'} (Costs ${bDef?.strainCost ?? 5} Health/Strain)`,
      sublabel: '2 rounds of major combat boost & heightened evasion.',
      statHints: ['Bloodline'],
      disabled: war.hp <= (bDef?.strainCost ?? 5) + 5,
      disabledReason: 'HP too low to endure strain',
      autoEligible: war.hp > 50,
    });
  }

  if (hasMedical && war.hp < 85) {
    options.push({
      id: 'support_heal',
      label: 'Medical Triage: Mystical Palm (+20 HP, 12 CP)',
      sublabel: 'Recover mid-fight while defending against incoming strikes.',
      statHints: ['Medical'],
      disabled: war.cp < 12,
      disabledReason: 'Requires 12 CP',
      autoEligible: war.hp < 50 && war.cp >= 12,
    });
  } else if (hasWard && battle.playerWardRounds === 0) {
    options.push({
      id: 'support_ward',
      label: 'Raise Defensive Barrier (-35% damage for 2 rounds, 10 CP)',
      statHints: ['Defense'],
      disabled: war.cp < 10,
      disabledReason: 'Requires 10 CP',
      autoEligible: false,
    });
  } else if (hasClone && !battle.playerCloneEvade) {
    options.push({
      id: 'support_clone',
      label: 'Shadow Clone Feint (+22% dodge & +8 next attack, 10 CP)',
      statHints: ['Evasion'],
      disabled: war.cp < 10,
      disabledReason: 'Requires 10 CP',
      autoEligible: false,
    });
  }

  if (state.stats.intel >= 40 && !battle.weaknessExploited) {
    options.push({
      id: 'exploit_weakness',
      label: 'Analyze & Exploit Weakness (Intel Check, 0 CP)',
      sublabel: 'Permanently boosts your power for the remainder of this battle on success.',
      statHints: ['Intel'],
      autoEligible: false,
    });
  }

  // 3x Limit Break / Resolve Tokens (replaces Command Seals)
  if (war.resolves > 0) {
    options.push({
      id: 'resolve_boost',
      label: `Limit Break: Surpass Limits! (+3 Ranks & Ultimate x1.3 | ${war.resolves} left)`,
      sublabel: 'Pushes past physical limits this round (+6 Body Strain).',
      statHints: ['Resolve'],
      autoEligible: battle.isFinal && war.hp < 45,
    });
    if (war.cp < 40) {
      options.push({
        id: 'resolve_cp',
        label: `Limit Break: Second Wind (+40 CP | ${war.resolves} left)`,
        sublabel: 'Instant chakra surge (+4 Body Strain).',
        statHints: ['Resolve'],
        autoEligible: war.cp < 15,
      });
    }
    if (!battle.isFinal) {
      options.push({
        id: 'resolve_flee',
        label: `Limit Break: Body Flicker Escape (Guaranteed Retreat | ${war.resolves} left)`,
        sublabel: '100% safe withdrawal (+3 Body Strain).',
        statHints: ['Resolve'],
        autoEligible: war.hp <= 22,
      });
    }
  }

  if (!battle.isFinal) {
    options.push({
      id: 'retreat',
      label: 'Shunshin Retreat (Attempt Escape)',
      sublabel: 'Escape chance scales with Speed. Failure risks 14 to 26 parting damage.',
      statHints: ['SPD'],
      autoEligible: war.hp <= 30,
    });
  }

  const lastRound = battle.rounds[battle.rounds.length - 1];
  const prevNote = lastRound ? ` Previous round: ${lastRound.narrative} (${lastRound.whyLine})` : '';

  return {
    id: `battle_${war.day}_${battle.round}_${enemy.id}`,
    kind: 'war_battle_round',
    eventId: 'war_battle_round',
    title: `Round ${battle.round}/${battle.isFinal ? 'FINAL' : battle.maxRounds}: vs ${enemyLabel}`,
    body: `Your HP ${war.hp}/100, CP ${war.cp}/100 | Enemy HP ${enemy.hp}/100 (${elemHint}, Intel ${enemy.intel}%).${prevNote}`,
    manual: battle.isFinal,
    options,
  };
}

export type BattleResolutionStatus = 'continue' | 'player_won' | 'player_dead' | 'retreated' | 'dawn_break';

export function resolveBattleRound(
  state: GameState,
  optionId: string,
  rng: SeededRng,
): { status: BattleResolutionStatus; summary: BattleRoundSummary } {
  const war = state.war!;
  const battle = war.activeBattle!;
  const enemy = war.enemies.find((e) => e.id === battle.enemyId)!;
  const pRanks = getPlayerRanks(state, battle.resolveBoostThisRound);
  const ult = getPlayerSignatureUltimate(state);

  // Instant Resolve actions that modify state and resolve or exit
  if (optionId === 'resolve_flee' && war.resolves > 0 && !battle.isFinal) {
    war.resolves -= 1;
    state.bodyStrain += 3;
    recordWarFact(war, {
      type: 'resolve_burst',
      actorId: 'player',
      actorName: state.name,
      detail: 'Used Limit Break: Body Flicker Escape',
    });
    const summary: BattleRoundSummary = {
      round: battle.round,
      playerAction: 'Limit Break: Body Flicker Escape',
      enemyAction: 'Pursuit blocked',
      outcome: 'retreat',
      playerDmgTaken: 0,
      enemyDmgTaken: 0,
      whyLine: 'Key Factor: Resolve Token guaranteed clean Body Flicker withdrawal',
      narrative: 'You burn a surge of resolve into a blinding Body Flicker, vanishing beyond pursuit.',
    };
    battle.rounds.push(summary);
    return { status: 'retreated', summary };
  }

  if (optionId === 'resolve_cp' && war.resolves > 0) {
    war.resolves -= 1;
    war.cp = clamp(war.cp + 40, 0, 100);
    state.bodyStrain += 4;
    const chip = rng.int(4, 9);
    war.hp = Math.max(1, war.hp - chip);
    const summary: BattleRoundSummary = {
      round: battle.round,
      playerAction: 'Limit Break: Second Wind (+40 CP)',
      enemyAction: 'Harassing strike',
      outcome: 'support',
      playerDmgTaken: chip,
      enemyDmgTaken: 0,
      whyLine: 'Key Factor: Emergency chakra surge restored 40 CP at minor damage cost',
      narrative: `You force dormant reserves open (+40 CP) while absorbing a ${chip}-damage glancing blow.`,
    };
    battle.rounds.push(summary);
    return advanceRoundCounter(battle, summary);
  }

  if (optionId === 'resolve_boost' && war.resolves > 0) {
    war.resolves -= 1;
    battle.resolveBoostThisRound = true;
    state.bodyStrain += 6;
    recordWarFact(war, {
      type: 'resolve_burst',
      actorId: 'player',
      actorName: state.name,
      targetId: enemy.id,
      targetName: enemy.name,
      detail: 'Unleashed Limit Break: Surpass Limits',
    });
    // Immediately execute an empowered strike this round!
    optionId = war.cp >= ult.cost ? 'ultimate' : 'taijutsu';
  }

  // Standard Retreat attempt
  if (optionId === 'retreat' && !battle.isFinal) {
    const fleeP = clamp(0.45 + pRanks[1] * 0.06 + (battle.playerCloneEvade ? 0.15 : 0), 0.35, 0.94);
    if (rng.chance(fleeP)) {
      const summary: BattleRoundSummary = {
        round: battle.round,
        playerAction: 'Shunshin Retreat',
        enemyAction: 'Missed intercept',
        outcome: 'retreat',
        playerDmgTaken: 0,
        enemyDmgTaken: 0,
        whyLine: `Key Factor: Speed (${pRanks[1].toFixed(1)}) cleared ${Math.round(fleeP * 100)}% escape check`,
        narrative: 'Smoke fills the clearing as you slip cleanly through the canopy out of range.',
      };
      battle.rounds.push(summary);
      return { status: 'retreated', summary };
    } else {
      const failDmg = rng.int(14, 24);
      war.hp = Math.max(0, war.hp - failDmg);
      const summary: BattleRoundSummary = {
        round: battle.round,
        playerAction: 'Shunshin Retreat (Failed)',
        enemyAction: 'Intercept strike',
        outcome: 'lose',
        playerDmgTaken: failDmg,
        enemyDmgTaken: 0,
        whyLine: `Key Factor: Enemy cut off retreat path (-${failDmg} HP)`,
        narrative: `Your opponent reads your smoke feint and slashes across your flank for ${failDmg} damage!`,
      };
      battle.rounds.push(summary);
      if (war.hp <= 0) return { status: 'player_dead', summary };
      return advanceRoundCounter(battle, summary);
    }
  }

  // Support / Bloodline / Weakness actions (enemy still gets a contested pressure roll)
  if (
    optionId === 'bloodline' ||
    optionId === 'support_heal' ||
    optionId === 'support_ward' ||
    optionId === 'support_clone' ||
    optionId === 'exploit_weakness'
  ) {
    let playerAction = 'Tactical Preparation';
    let whyLine = 'Key Factor: Tactical setup';
    let narrative = '';
    let enemyChip = rng.int(5, 11);

    if (optionId === 'bloodline' && state.bloodline) {
      const bDef = BLOODLINE_MAP[state.bloodline.id];
      const strain = bDef?.strainCost ?? 5;
      war.hp = Math.max(1, war.hp - strain);
      state.bodyStrain += strain;
      battle.bloodlineActiveRounds = 2;
      enemyChip = rng.int(2, 6);
      playerAction = `Activate ${bDef?.name ?? 'Bloodline'}`;
      whyLine = `Key Factor: Bloodline active for 2 rounds (-${strain} HP strain)`;
      narrative = `${bDef?.name ?? 'Your Kekkei Genkai'} flares to life, sharpening every motion as you deflect the enemy's probe.`;
    } else if (optionId === 'support_heal') {
      war.cp = Math.max(0, war.cp - 12);
      war.hp = clamp(war.hp + 20, 0, 100);
      enemyChip = rng.int(4, 9);
      playerAction = 'Mystical Palm Heal (+20 HP)';
      whyLine = 'Key Factor: Field triage restored 20 HP mid-fight';
      narrative = 'Green medical chakra knits torn tissue back together while you pivot clear of a full strike.';
    } else if (optionId === 'support_ward') {
      war.cp = Math.max(0, war.cp - 10);
      battle.playerWardRounds = 2;
      enemyChip = Math.round(enemyChip * 0.65);
      playerAction = 'Defensive Barrier Ward';
      whyLine = 'Key Factor: Barrier reduces incoming damage by 35% for 2 rounds';
      narrative = 'Sealing ink erupts into a shimmering chakra ward that blunts the incoming blow.';
    } else if (optionId === 'support_clone') {
      war.cp = Math.max(0, war.cp - 10);
      battle.playerCloneEvade = true;
      battle.playerBuffRounds = Math.max(battle.playerBuffRounds, 1);
      enemyChip = rng.int(0, 4);
      playerAction = 'Shadow Clone Feint';
      whyLine = 'Key Factor: Clone decoy absorbed enemy momentum';
      narrative = 'A Shadow Clone bursts into smoke on impact, opening an angle for your next counter.';
    } else if (optionId === 'exploit_weakness') {
      const ok = rng.chance(clamp(0.32 + state.stats.intel / 200 + (enemy.intel >= 80 ? 0.12 : 0), 0.35, 0.85));
      if (ok) {
        battle.weaknessExploited = true;
        enemy.intel = clamp(enemy.intel + 15, 0, 100);
        playerAction = 'Exploit Weakness (Success)';
        whyLine = `Key Factor: Intel (${state.stats.intel}) spotted habit (+${8 + Math.round(state.stats.intel * 0.1)} power)`;
        narrative = 'You spot the half-beat hesitation in their hand seals and lock onto their blind spot!';
      } else {
        playerAction = 'Exploit Weakness (Missed)';
        whyLine = 'Key Factor: Enemy shifted stance before you could read a flaw';
        narrative = 'They break rhythm sharply, denying you a clean read while grazing your guard.';
      }
    }

    war.hp = Math.max(0, war.hp - enemyChip);
    const summary: BattleRoundSummary = {
      round: battle.round,
      playerAction,
      enemyAction: 'Pressuring strike',
      outcome: 'support',
      playerDmgTaken: enemyChip,
      enemyDmgTaken: 0,
      whyLine,
      narrative,
    };
    battle.rounds.push(summary);
    if (war.hp <= 0) return { status: 'player_dead', summary };
    return advanceRoundCounter(battle, summary);
  }

  // Decide whether Enemy fires Ultimate this round
  const enemyUsesUlt = rng.chance(npcUltimateChance(enemy, war.hp, battle.isFinal));
  if (enemyUsesUlt) {
    enemy.cp = Math.max(0, enemy.cp - enemy.ultimate.cost);
    enemy.ultimateSeen = true;
    enemy.intel = clamp(enemy.intel + 15, 0, 100);
  }

  const playerUsesUlt = optionId === 'ultimate' && war.cp >= ult.cost;
  if (playerUsesUlt) {
    war.cp = Math.max(0, war.cp - ult.cost);
    war.exposure = clamp(war.exposure + (ult.scope === 'fortress' ? 10 : 6), 0, 100);
  } else if (optionId === 'ninjutsu') {
    war.cp = Math.max(0, war.cp - 8);
  } else if (optionId === 'genjutsu') {
    war.cp = Math.max(0, war.cp - 6);
  }

  // === JUTSU CLASH (Both sides fire Ultimates on the same round!) ===
  if (playerUsesUlt && enemyUsesUlt) {
    const elemInfo = getElementMultiplier(ult.element, enemy.element);
    const pCV =
      ult.rankVal * 8 +
      pRanks[3] * 3 +
      (battle.resolveBoostThisRound ? 15 : 0) +
      (enemy.intel >= 80 ? 6 : 0) +
      elemInfo.clashBonus +
      rng.int(-10, 10);
    const eCV =
      enemy.ultimate.rankVal * 8 +
      enemy.ranks[3] * 3 +
      rng.int(-10, 10);

    const diff = pCV - eCV;
    const basePlayerUltDmg = Math.round((10 + ult.rankVal * 4.5) * (battle.resolveBoostThisRound ? 1.3 : 1) * elemInfo.mult);
    const baseEnemyUltDmg = Math.round((10 + enemy.ultimate.rankVal * 4.5) * (battle.playerWardRounds > 0 ? 0.65 : 1));

    let pTaken = 0;
    let eTaken = 0;
    let outcome: BattleRoundSummary['outcome'] = 'clash_cancel';
    let narrative = '';
    let whyLine = '';

    if (diff >= 8) {
      const pierceFactor = clamp(0.65 + (diff - 8) * 0.022, 0.65, 1.0);
      eTaken = Math.max(8, Math.round(basePlayerUltDmg * pierceFactor));
      pTaken = Math.max(3, Math.round(baseEnemyUltDmg * 0.15));
      outcome = 'clash_win';
      whyLine = `JUTSU CLASH WON (+${Math.round(diff)} CV)${elemInfo.label ? ` · ${elemInfo.label}` : ''}`;
      narrative = `JUTSU CLASH! Your ${ult.name} tears clean through ${enemy.ultimate.name}, dealing ${eTaken} damage!`;
    } else if (diff <= -8) {
      const pierceFactor = clamp(0.65 + (-diff - 8) * 0.022, 0.65, 1.0);
      pTaken = Math.max(8, Math.round(baseEnemyUltDmg * pierceFactor));
      eTaken = Math.max(3, Math.round(basePlayerUltDmg * 0.15));
      outcome = 'clash_lose';
      whyLine = `JUTSU CLASH LOST (${Math.round(diff)} CV)${elemInfo.label ? ` · ${elemInfo.label}` : ''}`;
      narrative = `JUTSU CLASH! ${enemy.ultimate.name} overpowers your ${ult.name}, slamming you for ${pTaken} damage!`;
    } else {
      pTaken = Math.max(4, Math.round(baseEnemyUltDmg * 0.3));
      eTaken = Math.max(4, Math.round(basePlayerUltDmg * 0.3));
      outcome = 'clash_cancel';
      whyLine = `JUTSU CLASH SCATTERED (Δ${Math.round(diff)} CV) · Both techniques cancelled out`;
      narrative = `JUTSU CLASH! ${ult.name} and ${enemy.ultimate.name} detonate midair in blinding shockwaves!`;
    }

    war.hp = Math.max(0, war.hp - pTaken);
    enemy.hp = Math.max(0, enemy.hp - eTaken);
    battle.resolveBoostThisRound = false;

    recordWarFact(war, {
      type: 'jutsu_clash',
      actorId: 'player',
      actorName: state.name,
      targetId: enemy.id,
      targetName: enemy.name,
      detail: `${ult.name} clashed with ${enemy.ultimate.name}`,
    });

    const summary: BattleRoundSummary = {
      round: battle.round,
      playerAction: `Ultimate: ${ult.name}`,
      enemyAction: `Ultimate: ${enemy.ultimate.name}`,
      outcome,
      playerDmgTaken: pTaken,
      enemyDmgTaken: eTaken,
      whyLine,
      narrative,
    };
    battle.rounds.push(summary);
    return finalizeCombatOutcomes(state, war, enemy, battle, summary, rng);
  }

  // === Single-Side Ultimate ===
  if (playerUsesUlt && !enemyUsesUlt) {
    const elemInfo = getElementMultiplier(ult.element, enemy.element);
    const mrMit = 1 - Math.min(0.35, skillSum(enemy.skills, 'resist') * 0.04 + skillSum(enemy.skills, 'evade') * 0.02);
    const dmg = Math.max(
      12,
      Math.round((12 + ult.rankVal * 5.2) * (battle.resolveBoostThisRound ? 1.3 : 1) * elemInfo.mult * mrMit * rng.float(0.9, 1.1)),
    );
    const chip = rng.int(2, 6);
    enemy.hp = Math.max(0, enemy.hp - dmg);
    war.hp = Math.max(0, war.hp - chip);
    battle.resolveBoostThisRound = false;

    const summary: BattleRoundSummary = {
      round: battle.round,
      playerAction: `Ultimate: ${ult.name}`,
      enemyAction: 'Desperate guard',
      outcome: 'win',
      playerDmgTaken: chip,
      enemyDmgTaken: dmg,
      whyLine: `Key Factor: Uncontested Ultimate${elemInfo.label ? ` · ${elemInfo.label}` : ''}`,
      narrative: `You unleash ${ult.name}, tearing through their guard for ${dmg} damage!`,
    };
    battle.rounds.push(summary);
    return finalizeCombatOutcomes(state, war, enemy, battle, summary, rng);
  }

  if (enemyUsesUlt && !playerUsesUlt) {
    let pTaken = 0;
    let narrative = '';
    if (enemy.ultimate.role === 'wall') {
      battle.enemyWallRounds = 2;
      pTaken = rng.int(4, 9);
      narrative = `${enemy.name} raises ${enemy.ultimate.name}, fortifying their guard for 2 rounds!`;
    } else if (enemy.ultimate.role === 'field' || enemy.ultimate.role === 'debuff') {
      battle.enemyFieldRounds = 2;
      pTaken = rng.int(10, 18);
      narrative = `${enemy.name} activates ${enemy.ultimate.name}, seizing the terrain and hitting you for ${pTaken} damage!`;
    } else {
      const wardMult = battle.playerWardRounds > 0 ? 0.65 : 1;
      const elemInfo = getElementMultiplier(enemy.element, state.element);
      pTaken = Math.max(
        10,
        Math.round((11 + enemy.ultimate.rankVal * 4.8) * elemInfo.mult * wardMult * rng.float(0.88, 1.12)),
      );
      narrative = `${enemy.name} unleashes ${enemy.ultimate.name}, blasting through your guard for ${pTaken} damage!`;
    }

    const counterChip = rng.int(3, 8);
    war.hp = Math.max(0, war.hp - pTaken);
    enemy.hp = Math.max(0, enemy.hp - counterChip);

    const summary: BattleRoundSummary = {
      round: battle.round,
      playerAction: optionId === 'ninjutsu' ? 'Elemental Ninjutsu' : optionId === 'genjutsu' ? 'Genjutsu Feint' : 'Taijutsu Strike',
      enemyAction: `Ultimate: ${enemy.ultimate.name}`,
      outcome: 'lose',
      playerDmgTaken: pTaken,
      enemyDmgTaken: counterChip,
      whyLine: `Key Factor: Enemy fired ${enemy.ultimate.name} uncontested`,
      narrative,
    };
    battle.rounds.push(summary);
    return finalizeCombatOutcomes(state, war, enemy, battle, summary, rng);
  }

  // === Standard Tactical Exchange (Taijutsu / Ninjutsu / Genjutsu) ===
  const { power: pBase, topFactor } = computePlayerRoundPower(state, war, enemy, battle);
  const eBase = computeEnemyRoundPower(war, enemy, battle);

  // Narrowed noise U(-14, 14) per side (GDD Ch. 14 R4!)
  const pRoll = pBase + rng.int(-14, 14);
  const eRoll = eBase + rng.int(-14, 14);
  const diff = pRoll - eRoll;

  let stanceMult = 1.0;
  let stanceReason = '';
  let playerActionLabel = 'Taijutsu Strike';

  if (optionId === 'taijutsu') {
    stanceMult = clamp(1 + (pRanks[0] - enemy.ranks[2]) * 0.08 + (pRanks[1] - enemy.ranks[1]) * 0.02, 0.65, 1.55);
    stanceReason = `Taijutsu (TAI ${pRanks[0].toFixed(1)} vs STA ${enemy.ranks[2].toFixed(1)})`;
  } else if (optionId === 'ninjutsu') {
    const elemInfo = getElementMultiplier(state.element, enemy.element);
    const mr = 1 - Math.min(0.35, skillSum(enemy.skills, 'resist') * 0.04);
    stanceMult = clamp(1 + (pRanks[3] - enemy.ranks[3]) * 0.05, 0.75, 1.35) * elemInfo.mult * mr;
    playerActionLabel = `${ELEMENT_NAMES[state.element]} Ninjutsu`;
    stanceReason = elemInfo.label ?? `Ninjutsu (CHK ${pRanks[3].toFixed(1)} vs CHK ${enemy.ranks[3].toFixed(1)})`;
  } else {
    stanceMult = clamp(1 + (pRanks[4] - enemy.ranks[4]) * 0.06, 0.75, 1.35);
    playerActionLabel = 'Genjutsu Feint';
    stanceReason = `Genjutsu (INS ${pRanks[4].toFixed(1)} vs INS ${enemy.ranks[4].toFixed(1)})`;
  }

  let pTaken = 0;
  let eTaken = 0;
  let outcome: BattleRoundSummary['outcome'] = 'draw';
  let narrative = '';
  let whyLine = '';

  if (Math.abs(diff) < 8) {
    pTaken = rng.int(4, 8);
    eTaken = rng.int(4, 8);
    outcome = 'draw';
    whyLine = `Key Factor: Even clash (Δ${Math.round(diff)}) · ${stanceReason}`;
    narrative = `Sparks and steel collide evenly: both shinobi trade glancing wounds (${eTaken} dealt, ${pTaken} taken).`;
  } else {
    // Reversal check (instinct/luck)
    let playerWins = diff > 0;
    const loserIns = playerWins ? enemy.ranks[4] : pRanks[4];
    const reversal = rng.chance(0.06 + (loserIns * 0.08) / 6);
    if (reversal) playerWins = !playerWins;

    if (playerWins) {
      const dodgeP = clamp(0.05 + (enemy.ranks[1] - pRanks[1]) * 0.012 + skillSum(enemy.skills, 'evade') * 0.02, 0.03, 0.22);
      if (rng.chance(optionId === 'ninjutsu' ? dodgeP * 0.5 : dodgeP)) {
        eTaken = rng.int(2, 5);
        pTaken = rng.int(1, 3);
        outcome = 'win';
        whyLine = `Key Factor: Enemy evaded brunt of attack · ${stanceReason}`;
        narrative = `Your ${playerActionLabel} nearly connects, grazing them for ${eTaken} damage as they twist clear.`;
      } else {
        const wallMult = battle.enemyWallRounds > 0 ? 0.65 : 1;
        eTaken = Math.max(5, Math.round((7 + Math.abs(diff) * 0.34) * stanceMult * wallMult));
        pTaken = rng.int(1, 5);
        outcome = 'win';
        if (optionId === 'genjutsu') {
          battle.enemyDebuffRounds = 2;
        }
        whyLine = `Key Factor: ${reversal ? 'Instinct Reversal! ' : ''}${stanceReason} · ${topFactor}`;
        narrative = `Your ${playerActionLabel} breaks their guard for ${eTaken} damage${optionId === 'genjutsu' ? ' and rattles their focus!' : '!'}`;
      }
    } else {
      const pDodgeP = clamp(
        0.05 + (pRanks[1] - enemy.ranks[1]) * 0.012 + (battle.playerCloneEvade ? 0.22 : 0) + (battle.bloodlineActiveRounds > 0 ? 0.1 : 0),
        0.04,
        0.4,
      );
      if (rng.chance(pDodgeP)) {
        pTaken = rng.int(2, 5);
        eTaken = rng.int(2, 5);
        outcome = 'draw';
        whyLine = 'Key Factor: High-speed evasion turned a heavy hit into a graze';
        narrative = `You twist out of a lethal strike at the last fraction of a second, taking only ${pTaken} damage.`;
      } else {
        const wardMult = battle.playerWardRounds > 0 ? 0.65 : 1;
        pTaken = Math.max(5, Math.round((7 + Math.abs(diff) * 0.32) * wardMult));
        eTaken = rng.int(1, 5);
        outcome = 'lose';
        whyLine = `Key Factor: ${reversal ? 'Enemy Reversal! ' : ''}Enemy outpaced round (+${Math.round(Math.abs(diff))} power)`;
        narrative = `Your opponent seizes the tempo and lands a clean counter for ${pTaken} damage!`;
      }
    }
  }

  war.hp = Math.max(0, war.hp - pTaken);
  enemy.hp = Math.max(0, enemy.hp - eTaken);
  battle.playerCloneEvade = false;
  battle.resolveBoostThisRound = false;

  const summary: BattleRoundSummary = {
    round: battle.round,
    playerAction: playerActionLabel,
    enemyAction: 'Combat exchange',
    outcome,
    playerDmgTaken: pTaken,
    enemyDmgTaken: eTaken,
    whyLine,
    narrative,
  };
  battle.rounds.push(summary);
  return finalizeCombatOutcomes(state, war, enemy, battle, summary, rng);
}

/**
 * Kizuna Loyal Interception: once per war, a living Genin Squad Sensei or teammate
 * with Trust >= 65 can flash-step in to absorb 45% of a heavy or lethal blow.
 */
export function checkLoyalInterception(
  state: GameState,
  war: WarState,
  summary: BattleRoundSummary,
  rng: SeededRng,
): boolean {
  if (war.loyalInterceptUsed || !state.team) return false;
  if (summary.playerDmgTaken < 14 && war.hp >= 30) return false;

  const candidates = state.team.members
    .filter((m) => m.alive && m.specialStatus !== 'missing_nin' && m.trust >= 65)
    .sort((a, b) => b.trust - a.trust);
  if (candidates.length === 0) return false;

  const protector = candidates[0];
  const prob = clamp(0.38 + (protector.trust - 65) * 0.014, 0.38, 0.85);
  if (!rng.chance(prob)) return false;

  const saved = Math.max(6, Math.round(summary.playerDmgTaken * 0.45));
  war.hp = clamp(war.hp + saved, 1, 100);
  summary.playerDmgTaken = Math.max(0, summary.playerDmgTaken - saved);
  war.loyalInterceptUsed = true;
  summary.narrative += ` KIZUNA INTERCEPTION! ${protector.name} flash-steps between you and the lethal blow, absorbing ${saved} damage!`;
  recordWarFact(war, {
    type: 'squad_protect',
    actorId: protector.id,
    actorName: protector.name,
    targetId: 'player',
    targetName: state.name,
    detail: `Shielded ${state.name} from a heavy strike (${saved} damage blocked)`,
  });
  return true;
}

function finalizeCombatOutcomes(
  state: GameState,
  war: WarState,
  enemy: WarCompetitor,
  battle: ActiveBattleState,
  summary: BattleRoundSummary,
  rng: SeededRng,
): { status: BattleResolutionStatus; summary: BattleRoundSummary } {
  // Check Kizuna Loyal Interception before resolving lethal blow
  checkLoyalInterception(state, war, summary, rng);

  // Update 6-axis relations after combat exchange
  if (summary.enemyDmgTaken > summary.playerDmgTaken) {
    modRel(war, enemy.id, 'player', { fear: 4, respect: 3, rivalry: 4, grudge: 5 });
  } else if (summary.playerDmgTaken > summary.enemyDmgTaken) {
    modRel(war, 'player', enemy.id, { rivalry: 4, grudge: 5 });
  }

  // Record ex-teammate rogue clash fact once
  if (enemy.isExTeammateRogue && battle.round === 1) {
    recordWarFact(war, {
      type: 'ex_mate_clash',
      actorId: 'player',
      actorName: state.name,
      targetId: enemy.id,
      targetName: enemy.name,
      detail: `Crossed blades with former squadmate ${enemy.name}`,
    });
  }

  // Check enemy survive passive once per war
  if (enemy.hp <= 0 && !enemy.survivedOnce && skillSum(enemy.skills, 'survive') > 0) {
    enemy.survivedOnce = true;
    enemy.hp = 12;
    summary.narrative += ` ${enemy.name} refuses to fall, staggering back upright at 12 HP!`;
  }

  // Check player one-time desperation survival if Will >= 65
  if (war.hp <= 0 && !battle.usedDesperation && state.stats.will >= 65 && enemy.hp > 0) {
    battle.usedDesperation = true;
    war.hp = 10;
    summary.narrative += ' Sheer shinobi willpower keeps you standing at 10 HP!';
  }

  if (war.hp <= 0) {
    return { status: 'player_dead', summary };
  }

  if (enemy.hp <= 0) {
    enemy.alive = false;
    enemy.intel = 100;
    war.kills += 1;
    if (war.allyId === enemy.id) {
      war.allyId = null;
    }
    recordWarFact(war, {
      type: 'kill',
      actorId: 'player',
      actorName: state.name,
      targetId: enemy.id,
      targetName: enemy.name,
      detail: `Eliminated ${enemy.name} (${enemy.epithet})`,
    });
    const rosterDef = ROSTER_MAP[enemy.rosterId];
    if (rosterDef) {
      summary.narrative += ` ${rosterDef.lines.fall}`;
    }
    return { status: 'player_won', summary };
  }

  return advanceRoundCounter(battle, summary);
}

function advanceRoundCounter(
  battle: ActiveBattleState,
  summary: BattleRoundSummary,
): { status: BattleResolutionStatus; summary: BattleRoundSummary } {
  if (battle.playerWardRounds > 0) battle.playerWardRounds -= 1;
  if (battle.playerBuffRounds > 0) battle.playerBuffRounds -= 1;
  if (battle.enemyDebuffRounds > 0) battle.enemyDebuffRounds -= 1;
  if (battle.bloodlineActiveRounds > 0) battle.bloodlineActiveRounds -= 1;
  if (battle.enemyWallRounds > 0) battle.enemyWallRounds -= 1;
  if (battle.enemyFieldRounds > 0) battle.enemyFieldRounds -= 1;

  battle.round += 1;
  if (!battle.isFinal && battle.round > battle.maxRounds) {
    return { status: 'dawn_break', summary };
  }
  return { status: 'continue', summary };
}

/**
 * Autonomous NPC-vs-NPC combat resolver for the Night phase.
 */
export function resolveNpcSkirmish(
  a: WarCompetitor,
  b: WarCompetitor,
  rng: SeededRng,
  war?: WarState,
): { winner: WarCompetitor | null; loser: WarCompetitor | null; logLine: string } {
  const elemA = getElementMultiplier(a.element, b.element).mult;
  const elemB = getElementMultiplier(b.element, a.element).mult;

  const pA = unitBasePower(a.ranks, a.hp) * elemA + skillSum(a.skills, 'power') * 1.4 + rng.int(-16, 16);
  const pB = unitBasePower(b.ranks, b.hp) * elemB + skillSum(b.skills, 'power') * 1.4 + rng.int(-16, 16);

  const diff = pA - pB;
  if (Math.abs(diff) < 7) {
    a.hp = Math.max(15, a.hp - rng.int(12, 22));
    b.hp = Math.max(15, b.hp - rng.int(12, 22));
    a.cp = Math.max(10, a.cp - 18);
    b.cp = Math.max(10, b.cp - 18);
    if (war) {
      modRel(war, a.id, b.id, { respect: 6, rivalry: 8 });
      modRel(war, b.id, a.id, { respect: 6, rivalry: 8 });
    }
    return {
      winner: null,
      loser: null,
      logLine: `Distant explosions rattle the night ridge as two rival shinobi clash to a bloody draw.`,
    };
  }

  const winner = diff > 0 ? a : b;
  const loser = diff > 0 ? b : a;
  const dmg = rng.int(26, 48) + Math.round(Math.abs(diff) * 0.45);
  loser.hp = Math.max(0, loser.hp - dmg);
  winner.hp = Math.max(12, winner.hp - rng.int(8, 22));
  winner.cp = Math.max(10, winner.cp - 22);
  loser.cp = Math.max(0, loser.cp - 24);

  if (war) {
    modRel(war, loser.id, winner.id, { fear: 10, respect: 8, rivalry: 10, grudge: 12 });
  }

  if (loser.hp <= 0) {
    loser.alive = false;
    winner.kills += 1;
    if (war) {
      if (war.allyId === loser.id) war.allyId = null;
      recordWarFact(war, {
        type: 'kill',
        actorId: winner.id,
        actorName: winner.name,
        targetId: loser.id,
        targetName: loser.name,
        detail: `${winner.name} eliminated ${loser.name} in the valley`,
      });
    }
    const loserLabel = loser.intel >= 80 ? loser.name : `a rival ${loser.archetype}`;
    const winLabel = winner.intel >= 80 ? winner.name : `an opposing ${winner.archetype}`;
    return {
      winner,
      loser,
      logLine: `Night dispatch: ${loserLabel} was eliminated in the valley by ${winLabel}.`,
    };
  }

  return {
    winner,
    loser,
    logLine: `Flares light the eastern trees as two rival shinobi trade fierce jutsu before one breaks contact.`,
  };
}
