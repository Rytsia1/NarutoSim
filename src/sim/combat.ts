import {
  formatHandSeals,
  getJutsuBasePower,
  getJutsuMasteryInfo,
  getKnownJutsu,
  getNextTierLockedJutsu,
  type JutsuDefinition,
} from '../data/jutsu';
import { BLOODLINE_MAP, DISCIPLINE_MAP, ELEMENT_NAMES } from '../data/powers';
import { ARCHETYPE_AVG, ELEMENT_BEATS, ROSTER_MAP } from '../data/roster';
import { getSummonPowerTier, SUMMON_CLAN_MAP } from '../data/summons';
import { modRel } from './ai';
import { getUnlockedHidenCombatBonus } from './clan-heritage';
import { recordWarFact } from './narrative';
import { applyResolvePartnerReaction, syncPartnerBackToState } from './partner';
import { clamp, computeCombatProjection } from './powers';
import type { SeededRng } from './rng';
import type {
  ActiveBattleState,
  BattleRoundSummary,
  ChakraElement,
  CombatTier,
  GameState,
  NpcOfficialRank,
  PendingDecision,
  PowerGapLabel,
  SkillTag,
  UltimateScope,
  WarCompetitor,
  WarState,
} from './types';

export const POWER_PER_RANK = 20;
export const MAX_EXCHANGE_DAMAGE = 40;

export const COMBAT_TIER_LABELS: Record<CombatTier, string> = {
  academy: 'Academy',
  genin: 'Genin',
  chunin: 'Chunin',
  jonin: 'Jonin',
  elite_jonin: 'Elite Jonin',
  kage_class: 'Kage-Class',
  legendary: 'Legendary',
};

export const OFFICIAL_RANK_LABELS: Record<NpcOfficialRank, string> = {
  genin: 'Genin',
  chunin: 'Chunin',
  tokubetsu_jonin: 'Tokubetsu Jonin',
  jonin: 'Jonin',
  kage: 'Kage',
};

export interface PlayerUltimateInfo {
  name: string;
  rankVal: number;
  cost: number;
  element: ChakraElement;
  scope: UltimateScope;
  jutsuId?: string;
}

export function getCombatRating(ranks: readonly [number, number, number, number, number]): number {
  return (ranks[0] + ranks[1] + ranks[2] + ranks[3] + ranks[4]) / 5;
}

export function getCombatTier(ranks: readonly [number, number, number, number, number]): CombatTier {
  const cr = getCombatRating(ranks);
  if (cr < 1.8) return 'academy';
  if (cr < 2.6) return 'genin';
  if (cr < 3.4) return 'chunin';
  if (cr < 4.2) return 'jonin';
  if (cr < 4.8) return 'elite_jonin';
  if (cr < 5.5) return 'kage_class';
  return 'legendary';
}

export function getPowerGapRead(
  state: GameState,
  enemy: WarCompetitor,
  resolveBoost = false,
): { label: PowerGapLabel; gap: number; isEstimate: boolean } {
  const isEstimate = enemy.intel < 80;
  const pCR = getCombatRating(getPlayerRanks(state, resolveBoost));
  const eCR = getCombatRating(getDisplayEnemyRanks(enemy));
  const gap = Number((pCR - eCR).toFixed(2));

  let label: PowerGapLabel = 'Competitive';
  if (gap <= -1.5) label = 'Overwhelming';
  else if (gap <= -0.85) label = 'Major disadvantage';
  else if (gap <= -0.35) label = 'Disadvantage';
  else if (gap < 0.35) label = 'Competitive';
  else if (gap < 0.95) label = 'Advantage';
  else label = 'Dominant';

  return { label, gap, isEstimate };
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

/**
 * Returns the player's true signature clash art ONLY when unlocked via:
 * - Tier-4 discipline secretArtName,
 * - a known DB clash jutsu, or
 * - an awakened Bloodline Secret Release.
 * Generic fallback ultimates ("Overdrive", "Burst", "Great Gale Surge") are removed.
 */
export function getPlayerSignatureUltimate(state: GameState): PlayerUltimateInfo | null {
  const bestLv4 = [...state.disciplines]
    .filter((d) => d.level === 4 && DISCIPLINE_MAP[d.id]?.secretArtName)
    .sort((a, b) => b.xp - a.xp)[0];
  if (bestLv4) {
    const def = DISCIPLINE_MAP[bestLv4.id]!;
    const knownClash = getKnownJutsu(state).find(
      (j) => j.role === 'clash' && j.requires.disciplineId === bestLv4.id,
    );
    return {
      name: def.secretArtName!,
      rankVal: 5.2,
      cost: knownClash?.chakraCost ?? 36,
      element: def.element ?? state.element,
      scope: 'fortress',
      jutsuId: knownClash?.id,
    };
  }

  const clashJutsu = getKnownJutsu(state).find((j) => j.role === 'clash');
  if (clashJutsu) {
    const isS = clashJutsu.rank === 'S';
    return {
      name: clashJutsu.name,
      rankVal: isS ? 5.2 : 4.5,
      cost: clashJutsu.chakraCost,
      element: clashJutsu.element ?? state.element,
      scope: isS ? 'fortress' : 'squad',
      jutsuId: clashJutsu.id,
    };
  }

  if (state.bloodline && state.bloodline.stage !== 'latent') {
    const bDef = BLOODLINE_MAP[state.bloodline.id];
    return {
      name: `${bDef?.name ?? 'Bloodline'} Secret Release`,
      rankVal: 4.0 + state.bloodline.grade * 0.25,
      cost: 30,
      element: state.element,
      scope: 'squad',
      jutsuId: `bloodline_secret_${state.bloodline.id}`,
    };
  }

  return null;
}

export function getEffectiveJutsuCost(
  state: GameState,
  jutsu: JutsuDefinition,
  war?: WarState | null,
): number {
  if (jutsu.chakraCost <= 0) return 0;
  const uses = state.jutsuMastery?.[jutsu.id] ?? 0;
  const { costMult } = getJutsuMasteryInfo(uses);
  const chkRank = computeCombatProjection(state).chk;
  const controlMult = 1.1 - 0.04 * chkRank;
  let cost = Math.max(1, Math.round(jutsu.chakraCost * costMult * controlMult));

  const activeWar = war ?? state.war;
  if (jutsu.role === 'clash' && activeWar?.partner?.active && activeWar.partner.trust >= 60) {
    cost = Math.max(1, Math.round(cost * 0.85));
  }
  return cost;
}

export function getEffectiveUltimateCost(state: GameState, war?: WarState | null): number {
  const ult = getPlayerSignatureUltimate(state);
  if (!ult) return 0;
  if (ult.jutsuId) {
    const known = getKnownJutsu(state).find((j) => j.id === ult.jutsuId);
    if (known) return getEffectiveJutsuCost(state, known, war);
  }
  const activeWar = war ?? state.war;
  if (activeWar?.partner?.active && activeWar.partner.trust >= 60) {
    return Math.round(ult.cost * 0.85);
  }
  return ult.cost;
}

/**
 * Asymmetric base power formula (Phase 3):
 * Removes the flat +78 constant and drops HP floor to 35% so rank gaps and wounds truly matter.
 */
export function unitBasePower(ranks: [number, number, number, number, number], hp: number): number {
  const cr = getCombatRating(ranks);
  return POWER_PER_RANK * cr * (0.35 + 0.65 * (clamp(hp, 0, 100) / 100));
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

export type BattleAttackStyle = 'taijutsu' | 'kenjutsu' | 'ninjutsu' | 'genjutsu';

export function hasKenjutsuDiscipline(state: GameState): boolean {
  return state.disciplines.some((d) => d.id === 'kenjutsu');
}

export function getKenjutsuLevel(state: GameState): number {
  return state.disciplines.find((d) => d.id === 'kenjutsu')?.level ?? 0;
}

export function computeStanceMultiplier(
  state: GameState,
  pRanks: [number, number, number, number, number],
  enemyRanks: [number, number, number, number, number],
  enemyElement: ChakraElement | null,
  enemySkills: { tag: SkillTag; rank: number }[],
  skillsKnown: boolean,
  actionId: BattleAttackStyle,
  attackElement?: ChakraElement,
): { mult: number; elemLabel: string | null } {
  if (actionId === 'taijutsu') {
    const mult = clamp(1 + (pRanks[0] - enemyRanks[2]) * 0.08 + (pRanks[1] - enemyRanks[1]) * 0.02, 0.65, 1.55);
    return { mult, elemLabel: null };
  }
  if (actionId === 'kenjutsu') {
    const kenLv = getKenjutsuLevel(state);
    const bladeRank = pRanks[1] * 0.55 + pRanks[0] * 0.45;
    const mult = clamp(1 + (bladeRank - enemyRanks[1]) * 0.08 + kenLv * 0.05, 0.72, 1.58);
    return { mult, elemLabel: null };
  }
  if (actionId === 'ninjutsu') {
    const elem = attackElement ?? state.element;
    const elemInfo = enemyElement ? getElementMultiplier(elem, enemyElement) : { mult: 1.0, label: null };
    const mr = skillsKnown ? 1 - Math.min(0.35, skillSum(enemySkills, 'resist') * 0.04) : 1.0;
    const mult = clamp(1 + (pRanks[3] - enemyRanks[3]) * 0.05, 0.75, 1.35) * elemInfo.mult * mr;
    return { mult, elemLabel: elemInfo.label };
  }
  const mult = clamp(1 + (pRanks[4] - enemyRanks[4]) * 0.06, 0.75, 1.35);
  return { mult, elemLabel: null };
}

export function computeRetreatChance(
  pSpd: number,
  eSpd: number,
  hasClone: boolean,
  hasSummoning: boolean,
): number {
  return clamp(
    0.45 + pSpd * 0.05 + (pSpd - eSpd) * 0.04 + (hasClone ? 0.15 : 0) + (hasSummoning ? 0.08 : 0),
    0.28,
    0.94,
  );
}

/**
 * Computes a fair matchup preview using ONLY known enemy intel (`getDisplayEnemyRanks`)
 * so hidden enemy stats are never leaked.
 */
export function estimateBattleActionOdds(
  state: GameState,
  enemy: WarCompetitor,
  actionId: BattleAttackStyle,
  resolveBoost = false,
  attackElement?: ChakraElement,
): BattleOddsEstimate {
  const isEstimate = enemy.intel < 80;
  const pRanks = getPlayerRanks(state, resolveBoost);
  const eRanks = getDisplayEnemyRanks(enemy);

  const { mult } = computeStanceMultiplier(
    state,
    pRanks,
    eRanks,
    enemy.intel >= 60 ? enemy.element : null,
    enemy.skills,
    enemy.skillsRevealed,
    actionId,
    attackElement,
  );

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
  const hasClone = Boolean(state.war?.activeBattle?.playerCloneEvade);
  const hasSummoning = state.disciplines.some((d) => d.id === 'summoning');
  return Math.round(computeRetreatChance(pRanks[1], eRanks[1], hasClone, hasSummoning) * 100);
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

  // Ambush Initiative strengthened (Phase 3): +18 Round 1, +9 Round 2 (~1 full rank swing)
  if (battle.isAmbush && battle.round <= 2) {
    const amb = battle.round === 1 ? 18 : 9;
    total += amb;
    terms.push({ label: `Ambush Initiative (+${amb})`, val: amb });
  }

  if (battle.bloodlineActiveRounds > 0 && state.bloodline) {
    const bId = state.bloodline.id;
    let bBoost = 9 + state.bloodline.grade * 2;
    if (bId === 'sharingan' || bId === 'byakugan') bBoost += 4;
    if (bId === 'hyoton' || bId === 'shikotsumyaku' || bId === 'yoton') bBoost += 5;
    total += bBoost;
    terms.push({ label: `${BLOODLINE_MAP[bId]?.name ?? 'Bloodline'} (+${bBoost})`, val: bBoost });
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

  if (war.partner && war.partner.active) {
    const pTrustMod = Math.round(war.partner.trust * 0.08 - 5);
    const pSkillMod =
      war.partner.trust >= 60
        ? Math.min(
            2,
            Math.round(
              skillSum(war.partner.skills, 'power') * 0.22 +
                (battle.isDefense ? skillSum(war.partner.skills, 'fort') * 0.22 : 0) +
                (enemy.hp < 75 ? skillSum(war.partner.skills, 'slayer') * 0.22 : 0),
            ),
          )
        : 0;
    const partnerTotal = pTrustMod + pSkillMod;
    total += partnerTotal;
    if (partnerTotal !== 0) {
      terms.push({
        label: `Partner ${war.partner.name} (${partnerTotal >= 0 ? `+${partnerTotal}` : partnerTotal})`,
        val: Math.abs(partnerTotal),
      });
    }
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
  if (!battle.isDefense && enemy.fort > 0) {
    total += Math.round(enemy.fort * 0.08 + skillSum(enemy.skills, 'fort') * 1.4);
  }
  if (war.hp < 75) {
    total += Math.round(skillSum(enemy.skills, 'slayer') * 1.6);
  }
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

/**
 * Heuristic auto-jutsu picker used by Auto-Play and as the foundation for future NPC jutsu AI.
 */
export function pickAutoJutsu(state: GameState, rng?: SeededRng): string {
  const war = state.war;
  const battle = war?.activeBattle;
  if (!war || !battle) return 'jutsu:basic_strike';
  const enemy = war.enemies.find((e) => e.id === battle.enemyId);
  const known = getKnownJutsu(state);

  const affordable = known.filter((j) => war.cp >= getEffectiveJutsuCost(state, j, war));

  // 1. Heal when wounded and medical jutsu is affordable
  if (war.hp < 55) {
    const healJutsu = affordable.find((j) => j.role === 'heal');
    if (healJutsu) return `jutsu:${healJutsu.id}`;
  }

  // 2. Raise defense on Round 1 (50% chance) if not already warded
  if (battle.round === 1 && battle.playerWardRounds === 0) {
    const defJutsu = affordable.find((j) => j.role === 'defense');
    if (defJutsu && (rng ? rng.chance(0.5) : false)) {
      return `jutsu:${defJutsu.id}`;
    }
  }

  // 3. Clash jutsu when enemy is weakened or on the Final Night
  if (enemy && (enemy.hp <= 55 || battle.isFinal)) {
    const clashJutsu = affordable.find((j) => j.role === 'clash');
    if (clashJutsu) return `jutsu:${clashJutsu.id}`;
  }

  // 4. Best affordable attack by expected damage per chakra
  const attacks = affordable.filter(
    (j) => j.role === 'damage' || j.role === 'multi_hit' || j.role === 'pierce' || j.role === 'control',
  );
  if (attacks.length > 0 && enemy) {
    const pRanks = getPlayerRanks(state, battle.resolveBoostThisRound);
    const eRanks = getDisplayEnemyRanks(enemy);
    let best = attacks[0];
    let bestScore = -1;

    for (const j of attacks) {
      const style: BattleAttackStyle = j.style === 'support' ? 'taijutsu' : j.style;
      const { mult } = computeStanceMultiplier(
        state,
        pRanks,
        eRanks,
        enemy.intel >= 60 ? enemy.element : null,
        enemy.skills,
        enemy.skillsRevealed,
        style,
        j.element,
      );
      const uses = state.jutsuMastery?.[j.id] ?? 0;
      const mastery = getJutsuMasteryInfo(uses);
      const effCost = getEffectiveJutsuCost(state, j, war);
      const expectedPower = getJutsuBasePower(j) * mastery.powerMult * mult;
      const wallBonus = battle.enemyWallRounds > 0 && j.effect.pierceWall ? 1.25 : 1.0;
      const score = (expectedPower * wallBonus) / Math.max(4, effCost * 0.35 + 4);
      if (score > bestScore) {
        bestScore = score;
        best = j;
      }
    }
    return `jutsu:${best.id}`;
  }

  return 'jutsu:basic_strike';
}

function pickBestOffensiveJutsuForResolve(state: GameState, war: WarState): JutsuDefinition {
  const known = getKnownJutsu(state);
  const clash = known.find((j) => j.role === 'clash' && war.cp >= getEffectiveJutsuCost(state, j, war));
  if (clash) return clash;
  const attacks = known
    .filter(
      (j) =>
        (j.role === 'damage' || j.role === 'multi_hit' || j.role === 'pierce' || j.role === 'control') &&
        war.cp >= getEffectiveJutsuCost(state, j, war),
    )
    .sort((a, b) => getJutsuBasePower(b) - getJutsuBasePower(a));
  return attacks[0] ?? known[0];
}

export function buildBattleRoundDecision(state: GameState): PendingDecision {
  const war = state.war!;
  const battle = war.activeBattle!;
  const enemy = war.enemies.find((e) => e.id === battle.enemyId)!;

  const enemyLabel =
    enemy.intel >= 80
      ? `${enemy.name} (${enemy.epithet})`
      : `Unknown ${enemy.archetype.toUpperCase()}`;
  const elemHint =
    enemy.intel >= 60 ? `Element: ${ELEMENT_NAMES[enemy.element]}` : 'Element: Unknown';
  const gapRead = getPowerGapRead(state, enemy, battle.resolveBoostThisRound);

  const canBloodline =
    state.bloodline !== null &&
    state.bloodline.stage !== 'latent' &&
    battle.bloodlineActiveRounds === 0;

  const knownJutsu = getKnownJutsu(state);
  const lockedNext = getNextTierLockedJutsu(state);
  const autoPickId = pickAutoJutsu(state);

  const options: PendingDecision['options'] = [];

  for (const jutsu of knownJutsu) {
    const effCost = getEffectiveJutsuCost(state, jutsu, war);
    const uses = state.jutsuMastery?.[jutsu.id] ?? 0;
    const mastery = getJutsuMasteryInfo(uses);
    const disabled = war.cp < effCost;
    const isAutoAttack = `jutsu:${jutsu.id}` === autoPickId;

    options.push({
      id: `jutsu:${jutsu.id}`,
      label: `${jutsu.name} (${jutsu.rank}-Rank, ${effCost} CP)`,
      sublabel: `${jutsu.description} [${mastery.label} ${mastery.uses}]`,
      statHints: [jutsu.role, `${effCost} CP`],
      disabled,
      disabledReason: disabled ? `Requires ${effCost} CP` : undefined,
      autoEligible: !disabled && isAutoAttack,
    });
  }

  for (const item of lockedNext) {
    options.push({
      id: `locked_jutsu:${item.jutsu.id}`,
      label: `${item.jutsu.name} (${item.jutsu.rank}-Rank, Locked)`,
      sublabel: item.requirementLabel,
      disabled: true,
      disabledReason: item.requirementLabel,
      autoEligible: false,
    });
  }

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

  if (state.stats.intel >= 40 && !battle.weaknessExploited) {
    options.push({
      id: 'exploit_weakness',
      label: 'Analyze & Exploit Weakness (Intel Check, 0 CP)',
      sublabel: 'Permanently boosts your power for the remainder of this battle on success.',
      statHints: ['Intel'],
      autoEligible: false,
    });
  }

  // Unbreakable Bond (Trust >= 80): Free Surpass Limits once per war when HP < 35
  if (war.partner?.active && war.partner.trust >= 80 && war.hp < 35 && !war.partner.freeSurpassUsed) {
    options.push({
      id: 'partner_free_surpass',
      label: `Unbreakable Bond: Free Surpass Limits (${war.partner.name})`,
      sublabel: '+3 Ranks & Clash x1.3 at 0 Resolve cost (once per war when HP < 35).',
      statHints: ['Resolve', 'Bonds'],
      autoEligible: true,
    });
  }

  // 3x Limit Break / Resolve Tokens (Will of Fire surge)
  if (war.resolves > 0) {
    options.push({
      id: 'resolve_boost',
      label: `Limit Break: Surpass Limits! (+3 Ranks & Clash x1.3 | ${war.resolves} left)`,
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
        autoEligible: war.hp <= 22 || gapRead.label === 'Overwhelming',
      });
    }
  }

  if (!battle.isFinal) {
    options.push({
      id: 'retreat',
      label: 'Shunshin Retreat (Attempt Escape)',
      sublabel: 'Escape chance scales with Speed. Failure risks 14 to 24 parting damage.',
      statHints: ['SPD'],
      autoEligible: war.hp <= 30 || gapRead.label === 'Overwhelming',
    });
  }

  const lastRound = battle.rounds[battle.rounds.length - 1];
  const prevNote = lastRound ? ` Previous round: ${lastRound.narrative} (${lastRound.whyLine})` : '';

  return {
    id: `battle_${war.day}_${battle.round}_${enemy.id}`,
    kind: 'war_battle_round',
    eventId: 'war_battle_round',
    title: `Round ${battle.round}/${battle.isFinal ? 'FINAL' : battle.maxRounds}: vs ${enemyLabel}`,
    body: `Threat ${enemy.threatClass} | Matchup: ${gapRead.label}${gapRead.isEstimate ? ' (est.)' : ''} | Your HP ${war.hp}/100, CP ${war.cp}/100 | Enemy HP ${enemy.hp}/100 (${elemHint}, Intel ${enemy.intel}%).${prevNote}`,
    manual: battle.isFinal,
    options,
  };
}

export type BattleResolutionStatus = 'continue' | 'player_won' | 'player_dead' | 'retreated' | 'dawn_break';

interface PreRoundCounters {
  ward: boolean;
  buff: boolean;
  debuff: boolean;
  bloodline: boolean;
  wall: boolean;
  field: boolean;
}

function resolveSummonSupportJutsu(
  state: GameState,
  war: WarState,
  enemy: WarCompetitor,
  battle: ActiveBattleState,
  jutsu: JutsuDefinition,
  masteryPowerMult: number,
  preCounters: PreRoundCounters,
  rng: SeededRng,
): { playerAction: string; whyLine: string; narrative: string; bonusEnemyDmg: number; enemyChip: number } {
  const contract = state.summonContract;
  if (contract) {
    contract.summonUses += 1;
    const clan = SUMMON_CLAN_MAP[contract.clanId];
    const tier = getSummonPowerTier(state);
    const summonName = clan.tierNames[tier.tierIndex];
    const rawDmg = Math.round(rng.int(6, 11) * tier.mult * masteryPowerMult);
    const dmg = Math.min(Math.max(0, enemy.hp - 1), rawDmg);
    enemy.hp = Math.max(1, enemy.hp - dmg);

    let extraNote = '';
    let enemyChip = rng.int(2, 6);

    if (clan.id === 'toad') {
      battle.playerBuffRounds = Math.max(battle.playerBuffRounds, 2);
      preCounters.buff = false;
      extraNote = ', granting +8 attack momentum';
    } else if (clan.id === 'snake') {
      battle.enemyDebuffRounds = Math.max(battle.enemyDebuffRounds, 2);
      preCounters.debuff = false;
      extraNote = ', venom disrupts the enemy for 2 rounds';
    } else if (clan.id === 'slug') {
      war.hp = clamp(war.hp + 16, 1, 100);
      if (war.partner?.active) war.partner.hp = clamp(war.partner.hp + 12, 1, war.partner.maxHp);
      extraNote = ', restoring +16 HP (+12 Partner HP)';
    } else if (clan.id === 'hound') {
      enemy.intel = clamp(enemy.intel + 20, 0, 100);
      if (enemy.intel >= 90) enemy.skillsRevealed = true;
      battle.enemyDebuffRounds = Math.max(battle.enemyDebuffRounds, 1);
      preCounters.debuff = false;
      extraNote = ', +20 Intel and pinned flank';
    } else if (clan.id === 'hawk') {
      battle.playerCloneEvade = true;
      enemyChip = rng.int(0, 3);
      extraNote = ', aerial evasion';
    } else if (clan.id === 'ape') {
      battle.playerWardRounds = Math.max(battle.playerWardRounds, 2);
      preCounters.ward = false;
      enemyChip = Math.round(enemyChip * 0.65);
      extraNote = ', adamantine defensive guard';
    }

    const sealStr = jutsu.seals.length > 0 ? `${formatHandSeals(jutsu.seals)}: ` : '';
    return {
      playerAction: `Kuchiyose: ${summonName}`,
      whyLine: `Key Factor: Kuchiyose Blood Contract (${clan.name}) dealt ${dmg} dmg`,
      narrative: `${sealStr}Kuchiyose: ${summonName} erupts from a cloud of white smoke, dealing ${dmg} damage${extraNote}!`,
      bonusEnemyDmg: dmg,
      enemyChip,
    };
  }

  // Generic summoning support if player learned Summoning discipline without a blood contract yet
  const rawDmg = Math.round(rng.int(5, 9) * masteryPowerMult);
  const dmg = Math.min(Math.max(0, enemy.hp - 1), rawDmg);
  enemy.hp = Math.max(1, enemy.hp - dmg);
  battle.playerBuffRounds = Math.max(battle.playerBuffRounds, 1);
  preCounters.buff = false;
  return {
    playerAction: jutsu.name,
    whyLine: `Key Factor: Summoning beast disrupted enemy (${dmg} dmg, +8 next attack)`,
    narrative: `${formatHandSeals(jutsu.seals)}: ${jutsu.name}! A summoned scout beast lunges through smoke for ${dmg} damage, creating an opening.`,
    bonusEnemyDmg: dmg,
    enemyChip: rng.int(3, 7),
  };
}

export function resolveBattleRound(
  state: GameState,
  optionId: string,
  rng: SeededRng,
): { status: BattleResolutionStatus; summary: BattleRoundSummary } {
  const war = state.war!;
  const battle = war.activeBattle!;
  const enemy = war.enemies.find((e) => e.id === battle.enemyId)!;
  if (!state.jutsuMastery) state.jutsuMastery = {};

  // Snapshot which counters were already active BEFORE this round's actions,
  // so newly applied buffs/debuffs never lose a turn on the same round!
  const preCounters: PreRoundCounters = {
    ward: battle.playerWardRounds > 0,
    buff: battle.playerBuffRounds > 0,
    debuff: battle.enemyDebuffRounds > 0,
    bloodline: battle.bloodlineActiveRounds > 0,
    wall: battle.enemyWallRounds > 0,
    field: battle.enemyFieldRounds > 0,
  };

  // Instant Resolve actions that modify state and resolve or exit
  if (optionId === 'resolve_flee' && war.resolves > 0 && !battle.isFinal) {
    war.resolves -= 1;
    state.bodyStrain += 3;
    battle.resolveBoostThisRound = false;
    const rx = applyResolvePartnerReaction(state, war, rng);
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
      whyLine: 'Key Factor: Limit Break Body Flicker guaranteed clean withdrawal',
      narrative: `Limit Break: You burn a surge of resolve into a blinding Body Flicker, vanishing beyond pursuit.${rx.note}`,
    };
    battle.rounds.push(summary);
    return { status: 'retreated', summary };
  }

  if (optionId === 'resolve_cp' && war.resolves > 0) {
    war.resolves -= 1;
    war.cp = clamp(war.cp + 40, 0, 100);
    state.bodyStrain += 4;
    battle.resolveBoostThisRound = false;
    const rx = applyResolvePartnerReaction(state, war, rng);
    const chip = rng.int(4, 9);
    war.hp = Math.max(1, war.hp - chip);
    const summary: BattleRoundSummary = {
      round: battle.round,
      playerAction: 'Limit Break: Second Wind (+40 CP)',
      enemyAction: 'Harassing strike',
      outcome: 'support',
      playerDmgTaken: chip,
      enemyDmgTaken: 0,
      whyLine: 'Key Factor: Limit Break Second Wind restored 40 CP at minor damage cost',
      narrative: `Limit Break: You force dormant reserves open (+40 CP) while absorbing a ${chip}-damage glancing blow.${rx.note}`,
    };
    battle.rounds.push(summary);
    return advanceRoundCounter(battle, summary, preCounters);
  }

  let resolvePartnerNote = '';
  if (
    optionId === 'partner_free_surpass' &&
    war.partner?.active &&
    war.partner.trust >= 80 &&
    war.hp < 35 &&
    !war.partner.freeSurpassUsed
  ) {
    war.partner.freeSurpassUsed = true;
    battle.resolveBoostThisRound = true;
    resolvePartnerNote = ` ${war.partner.name} pours chakra into your back in an Unbreakable Bond surge!`;
    const bestJ = pickBestOffensiveJutsuForResolve(state, war);
    optionId = `jutsu:${bestJ.id}`;
  } else if (optionId === 'resolve_boost' && war.resolves > 0) {
    war.resolves -= 1;
    battle.resolveBoostThisRound = true;
    state.bodyStrain += 6;
    const rx = applyResolvePartnerReaction(state, war, rng);
    resolvePartnerNote = rx.note;
    recordWarFact(war, {
      type: 'resolve_burst',
      actorId: 'player',
      actorName: state.name,
      targetId: enemy.id,
      targetName: enemy.name,
      detail: 'Unleashed Limit Break: Surpass Limits',
    });
    const bestJ = pickBestOffensiveJutsuForResolve(state, war);
    optionId = `jutsu:${bestJ.id}`;
  }

  // Compute pRanks AFTER resolve_boost has been applied!
  const pRanks = getPlayerRanks(state, battle.resolveBoostThisRound);
  const activeBloodlineId =
    battle.bloodlineActiveRounds > 0 && state.bloodline ? state.bloodline.id : null;

  // Standard Retreat attempt (shared formula with estimateRetreatChance)
  if (optionId === 'retreat' && !battle.isFinal) {
    if (war.partner?.active && war.partner.trust < 35 && rng.chance(0.3)) {
      const failDmg = rng.int(10, 18);
      war.hp = Math.max(0, war.hp - failDmg);
      battle.resolveBoostThisRound = false;
      const summary: BattleRoundSummary = {
        round: battle.round,
        playerAction: 'Shunshin Retreat (Partner Refused)',
        enemyAction: 'Pursuit strike',
        outcome: 'lose',
        playerDmgTaken: failDmg,
        enemyDmgTaken: 0,
        whyLine: `Key Factor: Distrustful partner ${war.partner.name} refused to fall back (-${failDmg} HP)`,
        narrative: `${war.partner.name} ignores your withdrawal signal and breaks formation, exposing your flank for ${failDmg} damage!`,
      };
      battle.rounds.push(summary);
      return resolveNonCombatLethalCheck(state, war, battle, summary, preCounters, rng);
    }

    const hasSummoning = state.disciplines.some((d) => d.id === 'summoning');
    const fleeP = computeRetreatChance(pRanks[1], enemy.ranks[1], battle.playerCloneEvade, hasSummoning);
    if (rng.chance(fleeP)) {
      battle.resolveBoostThisRound = false;
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
      battle.resolveBoostThisRound = false;
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
      return resolveNonCombatLethalCheck(state, war, battle, summary, preCounters, rng);
    }
  }

  // Non-jutsu tactical setup actions (bloodline & exploit_weakness)
  if (optionId === 'bloodline' || optionId === 'exploit_weakness') {
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
    } else if (optionId === 'exploit_weakness') {
      const ok = rng.chance(clamp(0.32 + state.stats.intel / 200 + (enemy.intel >= 80 ? 0.12 : 0), 0.35, 0.85));
      if (ok) {
        battle.weaknessExploited = true;
        enemy.intel = clamp(enemy.intel + 15, 0, 100);
        if (enemy.intel >= 90) enemy.skillsRevealed = true;
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
    battle.resolveBoostThisRound = false;
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
    return resolveNonCombatLethalCheck(state, war, battle, summary, preCounters, rng);
  }

  // === INDIVIDUAL JUTSU RESOLUTION (jutsu:<id>) ===
  if (!optionId.startsWith('jutsu:')) {
    throw new Error(`Invalid battle action id: ${optionId}`);
  }
  const jutsuId = optionId.slice('jutsu:'.length);
  const knownJutsu = getKnownJutsu(state);
  const chosenJutsu = knownJutsu.find((j) => j.id === jutsuId);
  if (!chosenJutsu) {
    throw new Error(`Unknown or unlearned jutsu cannot be executed: ${jutsuId}`);
  }

  const effCost = getEffectiveJutsuCost(state, chosenJutsu, war);
  if (war.cp < effCost) {
    throw new Error(`Insufficient CP (${war.cp} < ${effCost}) for jutsu: ${chosenJutsu.id}`);
  }

  // Read current mastery BEFORE incrementing, then increment usage counter
  const usesBefore = state.jutsuMastery[chosenJutsu.id] ?? 0;
  const mastery = getJutsuMasteryInfo(usesBefore);
  state.jutsuMastery[chosenJutsu.id] = usesBefore + 1;

  // Pay unified Chakra cost
  war.cp = Math.max(0, war.cp - effCost);

  const sealPrefix =
    chosenJutsu.seals.length > 0
      ? `${formatHandSeals(chosenJutsu.seals)}: ${chosenJutsu.name}! `
      : `${chosenJutsu.name}! `;

  // === DATA-DRIVEN SUPPORT JUTSU ROUTE (heal | defense | evasion | summon) ===
  if (
    chosenJutsu.role === 'heal' ||
    chosenJutsu.role === 'defense' ||
    chosenJutsu.role === 'evasion' ||
    chosenJutsu.role === 'summon'
  ) {
    let playerAction = chosenJutsu.name;
    let whyLine = `Key Factor: ${chosenJutsu.name} (${mastery.label})`;
    let narrative = '';
    let enemyChip = rng.int(4, 10);
    let enemyDmgTaken = 0;

    if (chosenJutsu.role === 'heal') {
      const healAmt = Math.round((chosenJutsu.effect.heal ?? 15) * mastery.powerMult);
      war.hp = clamp(war.hp + healAmt, 0, 100);
      if (war.partner?.active) {
        war.partner.hp = clamp(war.partner.hp + Math.round(healAmt * 0.5), 1, war.partner.maxHp);
      }
      enemyChip = rng.int(3, 8);
      playerAction = `${chosenJutsu.name} (+${healAmt} HP)`;
      whyLine = `Key Factor: Medical chakra restored ${healAmt} HP mid-fight (-${effCost} CP)`;
      narrative = `${sealPrefix}Green medical chakra knits torn tissue back together (+${healAmt} HP) while you pivot clear of a direct blow.`;
    } else if (chosenJutsu.role === 'defense') {
      const rounds = chosenJutsu.effect.wardRounds ?? 2;
      battle.playerWardRounds = Math.max(battle.playerWardRounds, rounds);
      preCounters.ward = false;
      enemyChip = Math.round(enemyChip * 0.65);
      whyLine = `Key Factor: Defensive barrier cuts incoming damage by 35% for ${rounds} rounds (-${effCost} CP)`;
      narrative = `${sealPrefix}A fortified barrier erupts in front of you, blunting the enemy's follow-up pressure.`;
    } else if (chosenJutsu.role === 'evasion') {
      battle.playerCloneEvade = true;
      if (chosenJutsu.id === 'kage_bunshin') {
        battle.playerBuffRounds = Math.max(battle.playerBuffRounds, 1);
        preCounters.buff = false;
        enemyChip = rng.int(0, 4);
        whyLine = `Key Factor: Solid Shadow Clone decoy (+22% dodge, +8 next attack, -${effCost} CP)`;
        narrative = `${sealPrefix}A solid Shadow Clone intercepts the rush and bursts into smoke, opening a sharp counter angle.`;
      } else {
        enemyChip = rng.int(1, 5);
        whyLine = `Key Factor: Evasion decoy primed (+22% dodge & +15% retreat chance, -${effCost} CP)`;
        narrative = `${sealPrefix}You slip away in a sudden blur, leaving a decoy to soak the enemy's probe.`;
      }
    } else {
      const sumRes = resolveSummonSupportJutsu(
        state,
        war,
        enemy,
        battle,
        chosenJutsu,
        mastery.powerMult,
        preCounters,
        rng,
      );
      playerAction = sumRes.playerAction;
      whyLine = sumRes.whyLine;
      narrative = sumRes.narrative;
      enemyDmgTaken = sumRes.bonusEnemyDmg;
      enemyChip = sumRes.enemyChip;
    }

    war.hp = Math.max(0, war.hp - enemyChip);
    battle.resolveBoostThisRound = false;
    const summary: BattleRoundSummary = {
      round: battle.round,
      playerAction,
      jutsuName: chosenJutsu.name,
      seals: [...chosenJutsu.seals],
      enemyAction: 'Pressuring strike',
      outcome: 'support',
      playerDmgTaken: enemyChip,
      enemyDmgTaken,
      whyLine,
      narrative,
    };
    battle.rounds.push(summary);
    return resolveNonCombatLethalCheck(state, war, battle, summary, preCounters, rng);
  }

  // Decide whether Enemy fires Ultimate this round
  const enemyUsesUlt = rng.chance(npcUltimateChance(enemy, war.hp, battle.isFinal));
  if (enemyUsesUlt) {
    enemy.cp = Math.max(0, enemy.cp - enemy.ultimate.cost);
    enemy.ultimateSeen = true;
    enemy.intel = clamp(enemy.intel + 15, 0, 100);
    if (enemy.intel >= 90) enemy.skillsRevealed = true;
  }

  const playerUsesClash = chosenJutsu.role === 'clash';
  const clashRankVal = chosenJutsu.rank === 'S' ? 5.2 : 4.5;
  const clashElement = chosenJutsu.element ?? state.element;
  if (playerUsesClash) {
    war.exposure = clamp(war.exposure + (chosenJutsu.rank === 'S' ? 10 : 6), 0, 100);
  }

  const memForBoost =
    battle.resolveBoostThisRound && state.memories && state.memories.length > 0
      ? state.memories[state.memories.length - 1]
      : null;
  const boostTag = battle.resolveBoostThisRound
    ? `Limit Break: ${memForBoost ? `Memory flashes back (Age ${memForBoost.age}): "${memForBoost.text}" ` : ''}${resolvePartnerNote ? `${resolvePartnerNote.trim()} ` : ''}`
    : resolvePartnerNote
      ? `${resolvePartnerNote.trim()} `
      : '';

  // === JUTSU CLASH (Both sides fire Clash/Ultimate on the same round!) ===
  if (playerUsesClash && enemyUsesUlt) {
    const elemInfo = getElementMultiplier(clashElement, enemy.element);
    const partnerClashBonus = war.partner?.active && war.partner.trust >= 80 ? 4 : 0;
    const pCV =
      clashRankVal * 8 * mastery.powerMult +
      pRanks[3] * 3 +
      (battle.resolveBoostThisRound ? 15 : 0) +
      (enemy.intel >= 80 ? 6 : 0) +
      partnerClashBonus +
      elemInfo.clashBonus +
      rng.int(-10, 10);
    const eCV = enemy.ultimate.rankVal * 8 + enemy.ranks[3] * 3 + rng.int(-10, 10);

    const diff = pCV - eCV;
    const basePlayerUltDmg = Math.round(
      (10 + clashRankVal * 4.5) * mastery.powerMult * (battle.resolveBoostThisRound ? 1.3 : 1) * elemInfo.mult,
    );
    const baseEnemyUltDmg = Math.round(
      (10 + enemy.ultimate.rankVal * 4.5) * (battle.playerWardRounds > 0 ? 0.65 : 1),
    );

    let pTaken = 0;
    let eTaken = 0;
    let outcome: BattleRoundSummary['outcome'] = 'clash_cancel';
    let narrative = '';
    let whyLine = '';

    if (diff >= 8) {
      const pierceFactor = clamp(0.65 + (diff - 8) * 0.022, 0.65, 1.0);
      eTaken = clamp(Math.round(basePlayerUltDmg * pierceFactor), 8, MAX_EXCHANGE_DAMAGE);
      pTaken = Math.max(3, Math.round(baseEnemyUltDmg * 0.15));
      outcome = 'clash_win';
      whyLine = `JUTSU CLASH WON (+${Math.round(diff)} CV)${elemInfo.label ? ` · ${elemInfo.label}` : ''}`;
      narrative = `${boostTag}JUTSU CLASH! Your ${chosenJutsu.name} tears clean through ${enemy.ultimate.name}, dealing ${eTaken} damage!`;
    } else if (diff <= -8) {
      const pierceFactor = clamp(0.65 + (-diff - 8) * 0.022, 0.65, 1.0);
      pTaken = clamp(Math.round(baseEnemyUltDmg * pierceFactor), 8, MAX_EXCHANGE_DAMAGE);
      eTaken = Math.max(3, Math.round(basePlayerUltDmg * 0.15));
      outcome = 'clash_lose';
      whyLine = `JUTSU CLASH LOST (${Math.round(diff)} CV)${elemInfo.label ? ` · ${elemInfo.label}` : ''}`;
      narrative = `${boostTag}JUTSU CLASH! ${enemy.ultimate.name} overpowers your ${chosenJutsu.name}, slamming you for ${pTaken} damage!`;
    } else {
      pTaken = Math.max(4, Math.round(baseEnemyUltDmg * 0.3));
      eTaken = Math.max(4, Math.round(basePlayerUltDmg * 0.3));
      outcome = 'clash_cancel';
      whyLine = `JUTSU CLASH SCATTERED (Δ${Math.round(diff)} CV) · Both techniques cancelled out`;
      narrative = `${boostTag}JUTSU CLASH! ${chosenJutsu.name} and ${enemy.ultimate.name} detonate midair in blinding shockwaves!`;
    }

    war.hp = Math.max(0, war.hp - pTaken);
    enemy.hp = Math.max(0, enemy.hp - eTaken);
    battle.resolveBoostThisRound = false;
    state.flags.had_jutsu_clash = true;

    recordWarFact(war, {
      type: 'jutsu_clash',
      actorId: 'player',
      actorName: state.name,
      targetId: enemy.id,
      targetName: enemy.name,
      detail: `${chosenJutsu.name} clashed with ${enemy.ultimate.name}`,
    });

    const summary: BattleRoundSummary = {
      round: battle.round,
      playerAction: chosenJutsu.name,
      jutsuName: chosenJutsu.name,
      seals: [...chosenJutsu.seals],
      enemyAction: `Ultimate: ${enemy.ultimate.name}`,
      outcome,
      playerDmgTaken: pTaken,
      enemyDmgTaken: eTaken,
      whyLine,
      narrative,
    };
    battle.rounds.push(summary);
    return finalizeCombatOutcomes(state, war, enemy, battle, summary, preCounters, rng);
  }

  // === Single-Side Player Clash Jutsu ===
  if (playerUsesClash && !enemyUsesUlt) {
    const elemInfo = getElementMultiplier(clashElement, enemy.element);
    const mrMit = 1 - Math.min(0.35, skillSum(enemy.skills, 'resist') * 0.04 + skillSum(enemy.skills, 'evade') * 0.02);
    const dmg = clamp(
      Math.round(
        (12 + clashRankVal * 5.2) *
          mastery.powerMult *
          (battle.resolveBoostThisRound ? 1.3 : 1) *
          elemInfo.mult *
          mrMit *
          rng.float(0.9, 1.1),
      ),
      12,
      MAX_EXCHANGE_DAMAGE,
    );
    const chip = rng.int(2, 6);
    enemy.hp = Math.max(0, enemy.hp - dmg);
    war.hp = Math.max(0, war.hp - chip);
    battle.resolveBoostThisRound = false;

    const summary: BattleRoundSummary = {
      round: battle.round,
      playerAction: chosenJutsu.name,
      jutsuName: chosenJutsu.name,
      seals: [...chosenJutsu.seals],
      enemyAction: 'Desperate guard',
      outcome: 'win',
      playerDmgTaken: chip,
      enemyDmgTaken: dmg,
      whyLine: `Key Factor: Uncontested ${chosenJutsu.rank}-Rank Clash Jutsu${elemInfo.label ? ` · ${elemInfo.label}` : ''}`,
      narrative: `${boostTag}${sealPrefix}Tears straight through their guard for ${dmg} damage!`,
    };
    battle.rounds.push(summary);
    return finalizeCombatOutcomes(state, war, enemy, battle, summary, preCounters, rng);
  }

  // === Single-Side Enemy Ultimate ===
  if (enemyUsesUlt && !playerUsesClash) {
    let pTaken = 0;
    let narrative = '';
    const wardMult =
      (battle.playerWardRounds > 0 ? 0.65 : 1) * (activeBloodlineId === 'jiton' ? 0.82 : 1);

    if (enemy.ultimate.role === 'wall') {
      battle.enemyWallRounds = 2;
      pTaken = Math.round(rng.int(4, 9) * wardMult);
      narrative = `${enemy.name} raises ${enemy.ultimate.name}, fortifying their guard for 2 rounds!`;
    } else if (enemy.ultimate.role === 'field' || enemy.ultimate.role === 'debuff') {
      battle.enemyFieldRounds = 2;
      pTaken = Math.round(rng.int(10, 18) * wardMult);
      narrative = `${enemy.name} activates ${enemy.ultimate.name}, seizing the terrain and hitting you for ${pTaken} damage!`;
    } else if (enemy.ultimate.role === 'heal') {
      enemy.hp = clamp(enemy.hp + 20, 0, 100);
      pTaken = Math.round(rng.int(3, 7) * wardMult);
      narrative = `${enemy.name} triggers ${enemy.ultimate.name}, mending wounds (+20 HP) while pushing you back for ${pTaken} damage!`;
    } else if (enemy.ultimate.role === 'buff') {
      battle.enemyWallRounds = 2;
      battle.enemyFieldRounds = 2;
      pTaken = Math.round(rng.int(6, 12) * wardMult);
      narrative = `${enemy.name} surges with ${enemy.ultimate.name}, bolstering defense and terrain control (${pTaken} damage)!`;
    } else {
      const elemInfo = getElementMultiplier(enemy.element, state.element);
      pTaken = clamp(
        Math.round((11 + enemy.ultimate.rankVal * 4.8) * elemInfo.mult * wardMult * rng.float(0.88, 1.12)),
        10,
        MAX_EXCHANGE_DAMAGE,
      );
      narrative = `${enemy.name} unleashes ${enemy.ultimate.name}, blasting through your guard for ${pTaken} damage!`;
    }

    const counterChip = rng.int(3, 8);
    war.hp = Math.max(0, war.hp - pTaken);
    enemy.hp = Math.max(0, enemy.hp - counterChip);
    battle.resolveBoostThisRound = false;

    const summary: BattleRoundSummary = {
      round: battle.round,
      playerAction: chosenJutsu.name,
      jutsuName: chosenJutsu.name,
      seals: [...chosenJutsu.seals],
      enemyAction: `Ultimate: ${enemy.ultimate.name}`,
      outcome: 'lose',
      playerDmgTaken: pTaken,
      enemyDmgTaken: counterChip,
      whyLine: `Key Factor: Enemy fired ${enemy.ultimate.name} uncontested`,
      narrative,
    };
    if (war.partner?.active && pTaken > 0) {
      const splash = Math.max(3, Math.round(pTaken * 0.35));
      war.partner.hp = Math.max(0, war.partner.hp - splash);
      summary.narrative += ` Shockwaves from the Ultimate catch ${war.partner.name} for ${splash} damage.`;
      checkPartnerDowned(state, war, summary, rng);
    }
    battle.rounds.push(summary);
    return finalizeCombatOutcomes(state, war, enemy, battle, summary, preCounters, rng);
  }

  // === STANDARD TACTICAL EXCHANGE (Individual Jutsu Mechanics, Phase 3 & 6) ===
  const { power: pBase, topFactor } = computePlayerRoundPower(state, war, enemy, battle);
  const eBase = computeEnemyRoundPower(war, enemy, battle);

  const hidenBonus = getUnlockedHidenCombatBonus(state);
  const pRoll = pBase + hidenBonus + rng.int(-14, 14);
  const eRoll = eBase + rng.int(-14, 14);
  const diff = pRoll - eRoll;

  const styleKey: BattleAttackStyle = chosenJutsu.style === 'support' ? 'taijutsu' : chosenJutsu.style;
  const { mult: stanceMult, elemLabel } = computeStanceMultiplier(
    state,
    pRanks,
    enemy.ranks,
    enemy.element,
    enemy.skills,
    true,
    styleKey,
    chosenJutsu.element,
  );
  const jutsuPower = getJutsuBasePower(chosenJutsu);
  const attackMult = stanceMult * jutsuPower * mastery.powerMult;

  let stanceReason = '';
  if (styleKey === 'taijutsu') {
    stanceReason = `${chosenJutsu.name} (TAI ${pRanks[0].toFixed(1)} vs STA ${enemy.ranks[2].toFixed(1)})`;
  } else if (styleKey === 'kenjutsu') {
    stanceReason = `${chosenJutsu.name} (SPD/TAI vs SPD ${enemy.ranks[1].toFixed(1)})`;
  } else if (styleKey === 'ninjutsu') {
    stanceReason = elemLabel ?? `${chosenJutsu.name} (CHK ${pRanks[3].toFixed(1)} vs CHK ${enemy.ranks[3].toFixed(1)})`;
  } else {
    stanceReason = `${chosenJutsu.name} (INS ${pRanks[4].toFixed(1)} vs INS ${enemy.ranks[4].toFixed(1)})`;
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
    narrative = `${boostTag}${sealPrefix}Sparks and chakra collide evenly: both shinobi trade glancing wounds (${eTaken} dealt, ${pTaken} taken).`;
  } else {
    // Phase 3 Reversal scaling: only occurs between near-peer fighters!
    let playerWins = diff > 0;
    const playerCR = getCombatRating(pRanks);
    const enemyCR = getCombatRating(enemy.ranks);
    const winnerCR = playerWins ? playerCR : enemyCR;
    const loserCR = playerWins ? enemyCR : playerCR;
    const crGap = Math.max(0, winnerCR - loserCR);
    const reversalScale = clamp(1 - crGap / 2, 0, 1);
    const loserIns = playerWins ? enemy.ranks[4] : pRanks[4];
    const reversal = rng.chance((0.06 + (loserIns * 0.08) / 6) * reversalScale);
    if (reversal) playerWins = !playerWins;

    if (playerWins) {
      const baseDodge = clamp(
        0.05 + (enemy.ranks[1] - pRanks[1]) * 0.012 + skillSum(enemy.skills, 'evade') * 0.02,
        0.03,
        0.24,
      );
      const dodgeMult = chosenJutsu.effect.dodgeMult ?? (styleKey === 'ninjutsu' ? 0.85 : 1.0);
      if (rng.chance(baseDodge * dodgeMult)) {
        eTaken = rng.int(2, 5);
        pTaken = rng.int(1, 3);
        outcome = 'win';
        whyLine = `Key Factor: Enemy evaded brunt of attack · ${stanceReason}`;
        narrative = `${boostTag}${sealPrefix}Your strike nearly connects cleanly, grazing them for ${eTaken} damage as they twist clear.`;
      } else {
        const wallPierced =
          battle.enemyWallRounds > 0 &&
          (Boolean(chosenJutsu.effect.pierceWall) || activeBloodlineId === 'yoton');
        const wallMult = battle.enemyWallRounds > 0 && !wallPierced ? 0.65 : 1;
        eTaken = clamp(
          Math.round((7 + Math.abs(diff) * 0.34) * attackMult * wallMult),
          5,
          MAX_EXCHANGE_DAMAGE,
        );
        pTaken = rng.int(1, 5);
        outcome = 'win';

        const effectNotes: string[] = [];
        if (chosenJutsu.effect.debuffRounds) {
          battle.enemyDebuffRounds = Math.max(battle.enemyDebuffRounds, chosenJutsu.effect.debuffRounds);
          preCounters.debuff = false;
          effectNotes.push(`disrupts foe (${chosenJutsu.effect.debuffRounds}r)`);
        }
        if (chosenJutsu.effect.cpDrain) {
          enemy.cp = Math.max(0, enemy.cp - chosenJutsu.effect.cpDrain);
          effectNotes.push(`drains -${chosenJutsu.effect.cpDrain} Enemy CP`);
        }
        if (chosenJutsu.effect.fortShave) {
          enemy.fort = Math.max(0, enemy.fort - chosenJutsu.effect.fortShave);
          effectNotes.push(`shaves -${chosenJutsu.effect.fortShave} Enemy Fort`);
        }
        if (wallPierced) {
          effectNotes.push('cleaves straight through their Guard Wall');
        }

        whyLine = `Key Factor: ${reversal ? 'Instinct Reversal! ' : ''}${stanceReason} · ${topFactor}`;
        const suffix = effectNotes.length > 0 ? ` (${effectNotes.join(', ')})!` : '!';
        narrative = `${boostTag}${sealPrefix}Breaks their guard for ${eTaken} damage${suffix}`;
      }
    } else {
      const bloodlineDodge =
        activeBloodlineId === 'hyoton'
          ? 0.16
          : activeBloodlineId === 'sharingan'
            ? 0.14
            : battle.bloodlineActiveRounds > 0
              ? 0.1
              : 0;
      const pDodgeP = clamp(
        0.05 + (pRanks[1] - enemy.ranks[1]) * 0.012 + (battle.playerCloneEvade ? 0.22 : 0) + bloodlineDodge,
        0.04,
        0.44,
      );
      if (rng.chance(pDodgeP)) {
        pTaken = rng.int(2, 5);
        eTaken = rng.int(2, 5);
        outcome = 'draw';
        whyLine = 'Key Factor: High-speed evasion turned a heavy hit into a graze';
        narrative = `${sealPrefix}Your opponent answers fast, forcing you to twist clear at the last instant (${pTaken} taken, ${eTaken} dealt).`;
      } else {
        const wardMult =
          (battle.playerWardRounds > 0 ? 0.65 : 1) *
          (activeBloodlineId === 'jiton' || activeBloodlineId === 'shikotsumyaku' ? 0.82 : 1);
        let rawPTaken = Math.round((7 + Math.abs(diff) * 0.32) * wardMult);

        // Self-risk penalty on exchange loss (Chidori tunnel-vision bypassed by Sharingan/Byakugan/Sensory/Debuff!)
        let riskNote = '';
        if (chosenJutsu.effect.selfRisk) {
          const chidoriProtected =
            chosenJutsu.id === 'chidori' &&
            (activeBloodlineId === 'sharingan' ||
              activeBloodlineId === 'byakugan' ||
              state.disciplines.some((d) => d.id === 'sensory') ||
              battle.enemyDebuffRounds > 0);
          if (!chidoriProtected) {
            rawPTaken += chosenJutsu.effect.selfRisk;
            riskNote =
              chosenJutsu.id === 'chidori'
                ? ' Tunnel-vision leaves you open to a brutal counter!'
                : ' Recoil strain amplifies the counterblow!';
          }
        }

        pTaken = clamp(rawPTaken, 5, MAX_EXCHANGE_DAMAGE);
        eTaken = rng.int(1, 5);
        outcome = 'lose';
        whyLine = `Key Factor: ${reversal ? 'Enemy Reversal! ' : ''}Enemy outpaced round (+${Math.round(Math.abs(diff))} power)`;
        narrative = `${sealPrefix}Your opponent reads the opening and lands a clean counter for ${pTaken} damage!${riskNote}`;
      }
    }
  }

  // Wire roster clash (Round 1) & win lines deterministically without touching RNG
  const rosterDef = ROSTER_MAP[enemy.rosterId];
  if (rosterDef) {
    if (battle.round === 1 && rosterDef.lines.clash) {
      narrative += ` ${rosterDef.lines.clash}`;
    } else if (outcome === 'lose' && rosterDef.lines.win) {
      narrative += ` ${rosterDef.lines.win}`;
    }
  }

  war.hp = Math.max(0, war.hp - pTaken);
  enemy.hp = Math.max(0, enemy.hp - eTaken);
  battle.playerCloneEvade = false;
  battle.resolveBoostThisRound = false;

  const summary: BattleRoundSummary = {
    round: battle.round,
    playerAction: chosenJutsu.name,
    jutsuName: chosenJutsu.name,
    seals: [...chosenJutsu.seals],
    enemyAction: 'Combat exchange',
    outcome,
    playerDmgTaken: pTaken,
    enemyDmgTaken: eTaken,
    whyLine,
    narrative,
  };
  battle.rounds.push(summary);
  return finalizeCombatOutcomes(state, war, enemy, battle, summary, preCounters, rng);
}

function checkNindoResolve(
  state: GameState,
  war: WarState,
  battle: ActiveBattleState,
  summary: BattleRoundSummary,
): void {
  if (battle.usedNindoResolve || !state.nindo) return;
  if (war.hp <= 0 || war.hp >= 25) return;
  battle.usedNindoResolve = true;
  war.hp = clamp(war.hp + 12, 1, 100);
  const mem =
    state.memories && state.memories.length > 0 ? state.memories[state.memories.length - 1] : null;
  const flashText = mem ? ` Memory flashes back (Age ${mem.age}): "${mem.text}"` : '';
  summary.narrative += ` NINDO RESOLVE! Remembering your ninja way pulls you back from the brink (+12 HP)!${flashText}`;
}

function checkPartnerDowned(
  state: GameState,
  war: WarState,
  summary: BattleRoundSummary,
  rng: SeededRng,
): void {
  const partner = war.partner;
  if (!partner || !partner.active || partner.hp > 0) return;
  partner.hp = 0;
  partner.active = false;
  const killed = rng.chance(0.3);
  partner.died = killed;
  syncPartnerBackToState(state, partner);

  if (killed) {
    if (!state.memories) state.memories = [];
    state.memories.push({
      age: state.age,
      tag: 'loss',
      text: `${partner.name} fell shielding you during Great Shinobi War #${war.warNumber}.`,
    });
    if (state.memories.length > 12) state.memories.splice(0, state.memories.length - 12);
  }

  recordWarFact(war, {
    type: 'partner_down',
    actorId: partner.id,
    actorName: partner.name,
    targetId: 'player',
    targetName: state.name,
    detail: killed
      ? `${partner.name} fell in action shielding you`
      : `${partner.name} was critically wounded shielding you`,
  });
  summary.narrative += killed
    ? ` FALLEN PARTNER! ${partner.name} collapses with fatal wounds after taking the blow for you.`
    : ` PARTNER DOWN! ${partner.name} collapses heavily wounded and can no longer fight beside you.`;
}

function checkPartnerOrSquadInterception(
  state: GameState,
  war: WarState,
  battle: ActiveBattleState,
  summary: BattleRoundSummary,
  rng: SeededRng,
): boolean {
  const partner = war.partner;
  if (
    partner &&
    partner.active &&
    !battle.partnerIntercepted &&
    partner.trust >= 30 &&
    summary.playerDmgTaken > 0 &&
    (summary.playerDmgTaken >= 14 || war.hp < 35)
  ) {
    const prob = clamp(0.28 + partner.trust * 0.003 + partner.relStage * 0.04, 0.28, 0.72);
    if (rng.chance(prob)) {
      battle.partnerIntercepted = true;
      const saved = Math.min(summary.playerDmgTaken, Math.max(3, Math.round(summary.playerDmgTaken * 0.35)));
      war.hp = clamp(war.hp + saved, 1, 100);
      summary.playerDmgTaken = Math.max(0, summary.playerDmgTaken - saved);
      const partnerDmg = Math.max(saved, Math.round(saved * 1.35));
      partner.hp = Math.max(0, partner.hp - partnerDmg);
      state.flags.had_loyal_intercept = true;
      summary.narrative += ` PARTNER INTERCEPTION! ${partner.name} steps into the strike, blocking ${saved} damage for you (-${partnerDmg} Partner HP)!`;
      recordWarFact(war, {
        type: 'partner_intercept',
        actorId: partner.id,
        actorName: partner.name,
        targetId: 'player',
        targetName: state.name,
        detail: `${partner.name} intercepted ${saved} damage for ${state.name}`,
      });
      checkPartnerDowned(state, war, summary, rng);
      return true;
    }
    return false;
  }
  return checkLoyalInterception(state, war, summary, rng);
}

function resolveNonCombatLethalCheck(
  state: GameState,
  war: WarState,
  battle: ActiveBattleState,
  summary: BattleRoundSummary,
  preCounters: PreRoundCounters,
  rng: SeededRng,
): { status: BattleResolutionStatus; summary: BattleRoundSummary } {
  checkPartnerOrSquadInterception(state, war, battle, summary, rng);
  checkNindoResolve(state, war, battle, summary);
  if (war.hp <= 0 && !battle.usedDesperation && state.stats.will >= 65) {
    battle.usedDesperation = true;
    war.hp = 10;
    summary.narrative += ' Sheer shinobi willpower keeps you standing at 10 HP!';
  }
  if (war.hp <= 0) {
    const foe = war.enemies.find((e) => e.id === battle.enemyId);
    const rosterDef = foe ? ROSTER_MAP[foe.rosterId] : undefined;
    if (rosterDef?.lines.win && !summary.narrative.includes(rosterDef.lines.win)) {
      summary.narrative += ` ${rosterDef.lines.win}`;
    }
    return { status: 'player_dead', summary };
  }
  return advanceRoundCounter(battle, summary, preCounters);
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
  if (summary.playerDmgTaken <= 0) return false;
  if (summary.playerDmgTaken < 14 && war.hp >= 30) return false;

  const candidates = state.team.members
    .filter((m) => m.alive && m.specialStatus !== 'missing_nin' && m.trust >= 65)
    .sort((a, b) => b.trust - a.trust);
  if (candidates.length === 0) return false;

  const protector = candidates[0];
  const prob = clamp(0.38 + (protector.trust - 65) * 0.014, 0.38, 0.85);
  if (!rng.chance(prob)) return false;

  const saved = Math.min(summary.playerDmgTaken, Math.max(6, Math.round(summary.playerDmgTaken * 0.45)));
  war.hp = clamp(war.hp + saved, 1, 100);
  summary.playerDmgTaken = Math.max(0, summary.playerDmgTaken - saved);
  war.loyalInterceptUsed = true;
  state.flags.had_loyal_intercept = true;
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
  preCounters: PreRoundCounters,
  rng: SeededRng,
): { status: BattleResolutionStatus; summary: BattleRoundSummary } {
  battle.resolveBoostThisRound = false;

  // Check Partner / Kizuna Interception & Nindo Resolve before resolving lethal blow
  checkPartnerOrSquadInterception(state, war, battle, summary, rng);
  checkNindoResolve(state, war, battle, summary);

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
    const rosterDef = ROSTER_MAP[enemy.rosterId];
    if (rosterDef?.lines.win && !summary.narrative.includes(rosterDef.lines.win)) {
      summary.narrative += ` ${rosterDef.lines.win}`;
    }
    return { status: 'player_dead', summary };
  }

  if (enemy.hp <= 0) {
    enemy.alive = false;
    enemy.hp = 0;
    enemy.intel = 100;
    enemy.skillsRevealed = true;
    enemy.allyId = null;
    war.kills += 1;
    if (war.allyId === enemy.id) {
      war.allyId = null;
    }
    for (const o of war.enemies) {
      if (o.allyId === enemy.id) o.allyId = null;
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

  return advanceRoundCounter(battle, summary, preCounters);
}

function advanceRoundCounter(
  battle: ActiveBattleState,
  summary: BattleRoundSummary,
  preCounters: PreRoundCounters,
): { status: BattleResolutionStatus; summary: BattleRoundSummary } {
  if (preCounters.ward && battle.playerWardRounds > 0) battle.playerWardRounds -= 1;
  if (preCounters.buff && battle.playerBuffRounds > 0) battle.playerBuffRounds -= 1;
  if (preCounters.debuff && battle.enemyDebuffRounds > 0) battle.enemyDebuffRounds -= 1;
  if (preCounters.bloodline && battle.bloodlineActiveRounds > 0) battle.bloodlineActiveRounds -= 1;
  if (preCounters.wall && battle.enemyWallRounds > 0) battle.enemyWallRounds -= 1;
  if (preCounters.field && battle.enemyFieldRounds > 0) battle.enemyFieldRounds -= 1;

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

  const pA =
    unitBasePower(a.ranks, a.hp) * elemA +
    skillSum(a.skills, 'power') * 1.4 +
    skillSum(a.skills, 'slayer') * 1.1 +
    skillSum(a.skills, 'fort') * 0.6 +
    rng.int(-16, 16);
  const pB =
    unitBasePower(b.ranks, b.hp) * elemB +
    skillSum(b.skills, 'power') * 1.4 +
    skillSum(b.skills, 'slayer') * 1.1 +
    skillSum(b.skills, 'fort') * 0.6 +
    rng.int(-16, 16);

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
    loser.hp = 0;
    loser.allyId = null;
    winner.kills += 1;
    if (war) {
      if (war.allyId === loser.id) war.allyId = null;
      for (const o of war.enemies) {
        if (o.allyId === loser.id) o.allyId = null;
      }
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
