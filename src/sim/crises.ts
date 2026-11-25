import { getPlayerRanks, getPlayerSignatureUltimate } from './combat';
import { addLeaning, clampStats, pushLog } from './life';
import { recordWarFact } from './narrative';
import { clamp } from './powers';
import type { SeededRng } from './rng';
import type {
  CrisisStance,
  GameState,
  LeaningKey,
  PendingDecision,
  WarCrisisState,
  WarState,
} from './types';

const SENTINEL_DIVISOR = [0, 0.35, 0.85, 1.5, 2.3, 3.2];

const CONVICTION_WISHES: Record<LeaningKey, string> = {
  vengeance: 'Burn the Cycle Through Retribution',
  will_of_fire: 'Enforce an Absolute Peace No Village Can Defy',
  ruthless: 'Forge a Shinobi Order Where Only the Strong Rule',
  forbidden: 'Transcend Mortality Through Forbidden Kinjutsu',
  ambition: 'Unite All Five Great Nations Under One Sovereign Crown',
};

export function initWarCrisisState(state: GameState, war: WarState, rng: SeededRng): WarCrisisState {
  const id = war.crisisId === 'mastermind' ? 'mastermind' : 'calamity';
  const stances: Record<string, CrisisStance> = {};

  for (const e of war.enemies) {
    if (e.tactic === 'defensive' || e.persona.loyal >= 60) {
      stances[e.id] = 'seal';
    } else if (e.tactic === 'reckless' || e.persona.ruthless >= 65) {
      stances[e.id] = 'exploit';
    } else {
      stances[e.id] = rng.chance(0.45) ? 'flee' : 'seal';
    }
  }

  const clueDiscount = state.world.crisisClues * 8;
  const bossMaxHp = id === 'calamity' ? Math.max(95, 145 - clueDiscount) : Math.max(90, 130 - clueDiscount);

  return {
    id,
    phase: 1,
    bossName:
      id === 'calamity'
        ? 'Unbound Ten-Tails Fragment (Calamity)'
        : 'The Masked Shadow Mastermind',
    bossHp: bossMaxHp,
    bossMaxHp,
    bossPhase2Done: false,
    echoesLeft: 0,
    sentinelsLeft: id === 'mastermind' ? 5 : 0,
    guardsActive: id === 'mastermind' ? 2 : 0,
    npcStances: stances,
    coalitionAllies: 0,
    defeated: false,
  };
}

export function syncCrisisCoalitionAllies(war: WarState): number {
  const c = war.crisis;
  if (!c) return 0;
  const count = war.enemies.filter((e) => e.alive && (c.npcStances[e.id] === 'seal' || e.id === war.allyId)).length;
  c.coalitionAllies = count;
  return count;
}

export function getMastermindDivisor(state: GameState, crisis: WarCrisisState): number {
  const base = 1 + SENTINEL_DIVISOR[clamp(crisis.sentinelsLeft, 0, 5)];
  const clueReduction = state.world.crisisClues * 0.16;
  return Math.max(1.0, Number((base - clueReduction).toFixed(2)));
}

/**
 * Advances the 3-Phase Crisis State Machine at Dawn.
 */
export function advanceCrisisPhase(state: GameState, war: WarState, rng: SeededRng): void {
  const c = war.crisis;
  if (!c || c.defeated) return;

  const aliveEnemies = war.enemies.filter((e) => e.alive);
  const fallenCount = war.enemies.length - aliveEnemies.length;

  // Phase 1 -> Phase 2 (Day 5+ or >= 3 fallen)
  if (c.phase === 1 && (war.day >= 5 || fallenCount >= 3)) {
    c.phase = 2;
    if (c.id === 'calamity') {
      c.echoesLeft = 2;
      pushLog(
        state,
        'crisis',
        'CRISIS PHASE 2 (OUTBREAK): Crimson chakra floods two border valleys! Two fallen shinobi rise as Corrupted Echoes. Hunt them at night for +1 Resolve.',
        { title: 'Calamity Phase 2: Outbreak' },
      );
    } else {
      pushLog(
        state,
        'crisis',
        `CRISIS PHASE 2 (RELIC ANCHORS): Five Forbidden Relic Sentinels shield the Shadow Mastermind (Current Boss Durability Divisor: x${getMastermindDivisor(state, c)}). Hunt Sentinels at night to shatter their armor!`,
        { title: 'Mastermind Phase 2: Hunt the Sentinels' },
      );
    }
  }

  // Autonomous NPC Sentinel hunting during Mastermind Phase 2
  if (c.id === 'mastermind' && c.phase === 2 && c.sentinelsLeft > 0) {
    const hunters = aliveEnemies.filter((e) => e.ranks[4] >= 4 || e.tactic === 'cunning' || e.tactic === 'hunter');
    if (hunters.length > 0 && rng.chance(0.24)) {
      c.sentinelsLeft = Math.max(0, c.sentinelsLeft - 1);
      pushLog(
        state,
        'crisis',
        `Rival operatives shatter a Forbidden Relic Sentinel in the distant mist! (${c.sentinelsLeft}/5 Sentinels remaining).`,
      );
    }
  }

  // Phase 2 -> Phase 3 (Boss Descent: Day 10+ for Calamity, Day 11+ or 0 Sentinels for Mastermind)
  const readyForDescent =
    c.id === 'calamity'
      ? war.day >= 10 || aliveEnemies.length <= 3
      : war.day >= 11 || c.sentinelsLeft === 0 || aliveEnemies.length <= 2;

  if (c.phase === 2 && readyForDescent) {
    c.phase = 3;
    syncCrisisCoalitionAllies(war);
    c.guardsActive = c.id === 'mastermind' ? Math.min(3, c.sentinelsLeft) : 0;
    pushLog(
      state,
      'crisis',
      c.id === 'calamity'
        ? `CRISIS PHASE 3 (DESCENT): ${c.bossName} tears free of the valley seals! ${c.coalitionAllies} allied shinobi stand ready to join a Coalition Raid.`
        : `CRISIS PHASE 3 (UNMASKED): ${c.bossName} steps openly into the storm with ${c.sentinelsLeft} remaining Sentinels (Divisor x${getMastermindDivisor(state, c)})!`,
      { title: `${c.bossName} Descends!` },
    );
  }

  // Culling during Calamity Phase 3 if > 3 rivals linger
  if (c.id === 'calamity' && c.phase === 3 && aliveEnemies.length > 3) {
    const weakest = [...aliveEnemies].sort((a, b) => a.hp - b.hp)[0];
    if (weakest && weakest.id !== war.allyId) {
      weakest.alive = false;
      weakest.hp = 0;
      for (const o of war.enemies) {
        if (o.allyId === weakest.id) o.allyId = null;
      }
      c.echoesLeft += 1;
      syncCrisisCoalitionAllies(war);
      pushLog(state, 'crisis', `Calamity Culling: ${weakest.name} is swallowed by crimson mud and rises as a Corrupted Echo!`);
    }
  } else if (c.phase === 3) {
    syncCrisisCoalitionAllies(war);
  }
}

export function buildCrisisBossDecision(state: GameState): PendingDecision {
  const war = state.war!;
  const c = war.crisis!;
  syncCrisisCoalitionAllies(war);
  const ult = getPlayerSignatureUltimate(state);
  const hasMokutonOrSeal =
    (state.bloodline?.id === 'mokuton' && state.bloodline.stage !== 'latent') ||
    state.disciplines.some((d) => d.id === 'fuinjutsu' && d.level >= 3);
  const isAoE = ult.scope !== 'single';
  const divNote =
    c.id === 'mastermind'
      ? ` | Durability Divisor: x${getMastermindDivisor(state, c)} | Active Sentinel Guards: ${c.guardsActive}`
      : ` | Coalition Companions: ${c.coalitionAllies} (+${c.coalitionAllies * 7} power)`;

  return {
    id: `crisis_raid_${war.day}_${c.bossHp}`,
    kind: 'war_crisis_raid',
    eventId: 'war_crisis_raid',
    title: `Boss Raid: ${c.bossName} (HP ${c.bossHp}/${c.bossMaxHp})`,
    body: `You confront ${c.bossName} beneath a torn sky! Your HP ${war.hp}/100, CP ${war.cp}/100, Resolves ${war.resolves}${divNote}.`,
    manual: true,
    options: [
      {
        id: 'boss_ultimate',
        label: `Unleash ${ult.name} (${ult.cost} CP)${isAoE && c.guardsActive > 0 ? ' [AoE Sweeps Guards!]' : ''}`,
        sublabel: isAoE && c.guardsActive > 0
          ? 'Area Ultimate clears Sentinel Guards AND blasts the boss.'
          : 'Heavy direct damage against the crisis boss.',
        disabled: war.cp < ult.cost,
        disabledReason: `Requires ${ult.cost} CP`,
        autoEligible: war.cp >= ult.cost,
      },
      {
        id: 'boss_strike',
        label: 'Coordinated Strike with Coalition Allies (8 CP)',
        sublabel: `Steady damage boosted by ${c.coalitionAllies} companions.`,
        disabled: war.cp < 8,
        disabledReason: 'Requires 8 CP',
        autoEligible: war.cp >= 8,
      },
      ...(hasMokutonOrSeal && c.id === 'calamity'
        ? [
            {
              id: 'boss_seal_suppress',
              label: '[Wood / Fuinjutsu Synergy] Suppress Tailed-Beast Chakra (14 CP)',
              sublabel: 'Massive bonus damage & halves boss counterattack!',
              disabled: war.cp < 14,
              disabledReason: 'Requires 14 CP',
              autoEligible: war.cp >= 14,
            },
          ]
        : []),
      ...(war.resolves > 0
        ? [
            {
              id: 'boss_resolve',
              label: `Burn 1 Resolve: All-Out Limit Break Assault (${war.resolves} left)`,
              sublabel: 'Huge unblockable damage burst (+6 Body Strain).',
              autoEligible: c.bossHp <= 55,
            },
          ]
        : []),
      {
        id: 'boss_fall_back',
        label: 'Break Contact & Regroup Before Dawn',
        autoEligible: war.hp < 28,
      },
    ],
  };
}

export function buildCrisisAftermathDecision(state: GameState): PendingDecision {
  const war = state.war!;
  const c = war.crisis!;
  const sealScore = Math.round((state.stats.chakra + state.stats.intel) / 2);

  return {
    id: `crisis_end_${war.warNumber}`,
    kind: 'war_crisis_end',
    eventId: 'war_crisis_end',
    title: `Aftermath: ${c.bossName} Shattered`,
    body: `The storm collapses around the crater, leaving the exposed core of ${c.id === 'calamity' ? 'the unbound Tailed-Beast chakra' : 'the Mastermind Relic Matrix'} trembling before you. How will you end this era?`,
    manual: true,
    options: [
      {
        id: 'crisis_seal',
        label: `Bind the Core with a Grand Seal (Chakra+Intel avg ${sealScore}, needs 50+)`,
        sublabel: 'Seals the core cleanly on success for True Peace; weaker seal strains Chakra (-12 HP).',
        autoEligible: true,
      },
      {
        id: 'crisis_shatter',
        label: 'Shatter the Core Completely (Costs 1 Resolve or 25 CP)',
        sublabel: 'Guaranteed destruction of the threat -> Era of True Peace.',
        disabled: war.resolves === 0 && war.cp < 25,
        disabledReason: 'Requires 1 Resolve or 25 CP',
        autoEligible: war.resolves > 0 || war.cp >= 25,
      },
      {
        id: 'crisis_claim',
        label: 'Absorb the Forbidden Power for Yourself (+15 Chakra, Ruthless +3, Heavy Scar)',
        sublabel: 'Grants terrifying personal power, but denies the world True Peace.',
        autoEligible: false,
      },
    ],
  };
}

export function resolveCrisisBossTurn(
  state: GameState,
  optionId: string,
  rng: SeededRng,
): 'continue' | 'boss_down' | 'retreated' | 'player_dead' {
  const war = state.war!;
  const c = war.crisis!;
  const ult = getPlayerSignatureUltimate(state);
  const ranks = getPlayerRanks(state, optionId === 'boss_resolve');

  if (optionId === 'boss_fall_back') {
    const chip = rng.int(6, 12);
    war.hp = Math.max(1, war.hp - chip);
    pushLog(state, 'crisis', `You disengage from ${c.bossName} through smoke, taking ${chip} parting damage.`);
    return 'retreated';
  }

  let rawDmg = 0;
  let counterMult = 1.0;

  if (optionId === 'boss_resolve' && war.resolves > 0) {
    war.resolves -= 1;
    state.bodyStrain += 6;
    rawDmg = Math.round(42 + ranks[3] * 5 + c.coalitionAllies * 6 + rng.int(-6, 10));
    recordWarFact(war, {
      type: 'resolve_burst',
      actorId: 'player',
      actorName: state.name,
      targetName: c.bossName,
      detail: `Unleashed Limit Break against ${c.bossName}`,
    });
  } else if (optionId === 'boss_seal_suppress') {
    war.cp = Math.max(0, war.cp - 14);
    rawDmg = Math.round(36 + ranks[3] * 4 + c.coalitionAllies * 6 + rng.int(-4, 8));
    counterMult = 0.5;
  } else if (optionId === 'boss_ultimate') {
    war.cp = Math.max(0, war.cp - ult.cost);
    rawDmg = Math.round(28 + ult.rankVal * 5.5 + c.coalitionAllies * 5 + rng.int(-6, 8));
    // Fix GDD U4: Player AoE Ultimates actively sweep Mastermind Sentinel Guards!
    if (ult.scope !== 'single' && c.guardsActive > 0) {
      const swept = c.guardsActive;
      c.guardsActive = 0;
      pushLog(
        state,
        'milestone',
        `Your area-wide ${ult.name} sweeps away all ${swept} Sentinel Guards shielding ${c.bossName}!`,
      );
    }
  } else {
    war.cp = Math.max(0, war.cp - 8);
    rawDmg = Math.round(18 + (ranks[0] + ranks[3]) * 2.5 + c.coalitionAllies * 7 + rng.int(-6, 8));
  }

  // Apply Mastermind durability divisor & guard cover
  const divisor = c.id === 'mastermind' ? getMastermindDivisor(state, c) : 1.0;
  const guardMit = c.guardsActive > 0 ? 0.78 : 1.0;
  const finalDmg = Math.max(6, Math.round((rawDmg * guardMit) / divisor));

  c.bossHp = Math.max(0, c.bossHp - finalDmg);

  // Boss Phase 2 revival trigger
  if (c.bossHp <= 0 && !c.bossPhase2Done) {
    c.bossPhase2Done = true;
    c.bossHp = c.id === 'calamity' ? 35 : 40;
    pushLog(
      state,
      'crisis',
      `${c.bossName} roars into PHASE 2, violently restoring ${c.bossHp} HP as the sky fractures!`,
      { title: 'Boss Phase 2!' },
    );
  }

  // Boss counterattack
  const bossCounter = Math.max(
    4,
    Math.round((rng.int(12, 22) + c.guardsActive * 3 - c.coalitionAllies * 2) * counterMult),
  );
  war.hp = Math.max(0, war.hp - bossCounter);

  pushLog(
    state,
    'crisis',
    `Boss Raid Exchange: You deal ${finalDmg} damage to ${c.bossName} (HP ${c.bossHp}/${c.bossMaxHp}) and absorb ${bossCounter} counter-damage.`,
  );

  if (war.hp <= 0) {
    return 'player_dead';
  }

  if (c.bossHp <= 0) {
    c.defeated = true;
    return 'boss_down';
  }

  return 'continue';
}

// =========================================================================
// HIDDEN EXTREME CONVICTION ROUTE + FINAL VALLEY IDEOLOGICAL DUEL (GDD 9.4)
// =========================================================================

export function findDominantExtremeLeaning(state: GameState): LeaningKey | null {
  let best: LeaningKey | null = null;
  let bestVal = 7;
  for (const [k, v] of Object.entries(state.leanings) as [LeaningKey, number][]) {
    if (v >= 8 && v > bestVal) {
      bestVal = v;
      best = k;
    }
  }
  return best;
}

export function canTriggerConvictionRoute(state: GameState, war: WarState): boolean {
  if (war.isCrisisWar) return false;
  if (war.conviction !== null) return false;
  if (state.flags.entered_conviction) return false;
  if (!findDominantExtremeLeaning(state)) return false;
  const livingSquad = state.team?.members.filter((m) => m.alive) ?? [];
  return livingSquad.length > 0;
}

export function startConvictionRoute(
  state: GameState,
  war: WarState,
  triggerOutcome: 'victor' | 'shared' = 'victor',
): PendingDecision {
  const leaning = findDominantExtremeLeaning(state)!;
  const opponent = [...state.team!.members.filter((m) => m.alive)].sort((a, b) => b.trust - a.trust)[0];

  // Clear any leftover activeBattle when transitioning into Conviction Route
  war.activeBattle = null;

  // Initial Resolve R (0..100) from traits, trust, and relationship stage
  let r = 48;
  if (opponent.traits.includes('honor')) r += 10;
  if (opponent.traits.includes('compassion')) r += 12;
  if (opponent.traits.includes('ambition')) r -= 10;
  if (opponent.trust >= 80) r -= 10;
  else if (opponent.trust < 40) r += 12;
  r += opponent.relStage * 5;

  state.flags.entered_conviction = true;
  war.conviction = {
    leaning,
    wishTitle: CONVICTION_WISHES[leaning],
    opponentId: opponent.id,
    opponentName: opponent.name,
    opponentRole: opponent.role,
    triggerOutcome,
    resolveR: clamp(r, 15, 95),
    beat: 1,
    inDuel: false,
    opponentHp: 100,
    round: 1,
    endingKey: null,
  };

  pushLog(
    state,
    'crisis',
    `EXTREME CONVICTION ROUTE: As the dust of War #${war.warNumber} settles, your overwhelming conviction ("${CONVICTION_WISHES[leaning]}") reaches its tipping point. Waiting beside the waterfall at the Valley of the End stands ${opponent.name}.`,
    { title: 'The Valley of the End' },
  );

  return buildConvictionBeatDecision(state);
}

export function buildConvictionBeatDecision(state: GameState): PendingDecision {
  const conv = state.war!.conviction!;
  const prompts: Record<1 | 2 | 3, { title: string; body: string }> = {
    1: {
      title: `Valley of the End (1/3): ${conv.opponentName} Blocks Your Path`,
      body: `"I saw what this war turned you into," ${conv.opponentName} says quietly over the roar of the falls. "If you pursue '${conv.wishTitle}', I cannot stand aside." (Their Resolve: ${conv.resolveR}/100)`,
    },
    2: {
      title: 'Valley of the End (2/3): Echo of Team Memories',
      body: `Rain begins falling over the carved stone statues. ${conv.opponentName} tightens their grip on a familiar kunai, asking whether the Genin days you shared meant nothing at all. (Their Resolve: ${conv.resolveR}/100)`,
    },
    3: {
      title: 'Valley of the End (3/3): The Final Step',
      body: `Lightning flashes across the gorge. One step forward seals your radical path forever; one step back lets you walk home together. (Their Resolve: ${conv.resolveR}/100)`,
    },
  };
  const p = prompts[conv.beat];

  return {
    id: `conv_beat_${conv.beat}_${state.war!.warNumber}`,
    kind: 'war_conviction',
    eventId: `conv_beat_${conv.beat}`,
    title: p.title,
    body: p.body,
    manual: true,
    options: [
      {
        id: 'invoke_memory',
        label: 'Invoke your shared Genin Squad promise and ask them to understand (-16 Resolve)',
        statHints: ['Bonds', 'Kizuna'],
        autoEligible: true,
      },
      {
        id: 'press_conviction',
        label: 'Stand unyielding on your path (+10 Resolve, Will +3)',
        statHints: ['Will'],
        autoEligible: false,
      },
      {
        id: 'turn_away',
        label: 'Sheathe your blade and abandon the extreme path (Turn Away Ending)',
        statHints: ['Kizuna'],
        autoEligible: true,
      },
    ],
  };
}

export function buildConvictionDuelDecision(state: GameState): PendingDecision {
  const war = state.war!;
  const conv = war.conviction!;
  const ult = getPlayerSignatureUltimate(state);

  return {
    id: `conv_duel_${conv.round}`,
    kind: 'war_conviction_duel',
    eventId: 'war_conviction_duel',
    title: `Final Valley Ideological Duel (Round ${conv.round}): vs ${conv.opponentName}`,
    body: `Your HP ${war.hp}/100, CP ${war.cp}/100 | ${conv.opponentName} HP ${conv.opponentHp}/100, Resolve ${conv.resolveR}/100. Lowering their Resolve makes them hesitate mid-clash.`,
    manual: true,
    options: [
      {
        id: 'duel_clash',
        label: 'Full-Force Shinobi Clash (Taijutsu & Ninjutsu, 8 CP)',
        autoEligible: true,
      },
      {
        id: 'duel_ultimate',
        label: `Unleash ${ult.name} (${ult.cost} CP)`,
        disabled: war.cp < ult.cost,
        disabledReason: `Requires ${ult.cost} CP`,
        autoEligible: war.cp >= ult.cost,
      },
      {
        id: 'duel_talk',
        label: 'Reach Through the Clash: Speak of Your Shared Promise (-18 Resolve)',
        sublabel: 'Shakes their conviction and weakens their strike.',
        autoEligible: conv.resolveR >= 45,
      },
      {
        id: 'duel_sheathe',
        label: 'Lower Your Weapon & Surrender Your Obsession (Turn Away)',
        autoEligible: war.hp < 22,
      },
    ],
  };
}

export function resolveConvictionBeat(
  state: GameState,
  optionId: string,
): 'next_beat' | 'start_duel' | 'end_turned_away' | 'end_together' {
  const conv = state.war!.conviction!;

  if (optionId === 'turn_away') {
    conv.endingKey = 'conv_turned_away';
    state.flags.conv_turned_away = true;
    state.stats.bonds += 8;
    state.stats.will += 4;
    clampStats(state);
    pushLog(
      state,
      'bond',
      `You lower your kunai in the rain. ${conv.opponentName} exhales shakily and walks back toward the village beside you.`,
      { title: 'Conviction Ending: Turned Away' },
    );
    return 'end_turned_away';
  }

  if (optionId === 'invoke_memory') {
    conv.resolveR = clamp(conv.resolveR - 16, 0, 100);
    pushLog(state, 'bond', `Memories of old drills flicker behind ${conv.opponentName}’s eyes (Resolve ${conv.resolveR}/100).`);
  } else {
    conv.resolveR = clamp(conv.resolveR + 10, 0, 100);
    state.stats.will += 3;
    clampStats(state);
    pushLog(state, 'crisis', `Your unyielding resolve forces ${conv.opponentName} into a combat stance (Resolve ${conv.resolveR}/100).`);
  }

  if (conv.beat < 3) {
    conv.beat = (conv.beat + 1) as 1 | 2 | 3;
    return 'next_beat';
  }

  if (conv.resolveR < 35) {
    conv.endingKey = 'conv_together';
    state.flags.conv_together = true;
    addLeaning(state, conv.leaning, 1);
    pushLog(
      state,
      'milestone',
      `Unable to strike you down, ${conv.opponentName} steps beside you at the edge of the falls. Together, you will reshape the shinobi world.`,
      { title: 'Conviction Ending: Walk Together' },
    );
    return 'end_together';
  }

  conv.inDuel = true;
  return 'start_duel';
}

export function resolveConvictionDuelRound(
  state: GameState,
  optionId: string,
  rng: SeededRng,
): 'continue' | 'player_won' | 'opponent_won' | 'opponent_won_dead' | 'turned_away' {
  const war = state.war!;
  const conv = war.conviction!;
  const ult = getPlayerSignatureUltimate(state);

  if (optionId === 'duel_sheathe') {
    conv.endingKey = 'conv_turned_away';
    state.flags.conv_turned_away = true;
    pushLog(state, 'bond', `Mid-clash, you drop your weapon and yield your dark obsession to ${conv.opponentName}.`, {
      title: 'Conviction Ending: Turned Away',
    });
    return 'turned_away';
  }

  const hesitates = rng.chance(clamp((85 - conv.resolveR) / 100, 0.05, 0.45));
  let pDmg = 0;
  let eDmg = hesitates ? rng.int(5, 11) : rng.int(14, 24);

  if (optionId === 'duel_talk') {
    conv.resolveR = clamp(conv.resolveR - 18, 0, 100);
    pDmg = rng.int(4, 10);
    eDmg = Math.round(eDmg * 0.65);
    pushLog(
      state,
      'bond',
      `Your words cut through the rain, dropping ${conv.opponentName}’s Resolve to ${conv.resolveR}/100!`,
    );
  } else if (optionId === 'duel_ultimate') {
    war.cp = Math.max(0, war.cp - ult.cost);
    pDmg = rng.int(26, 38) + (hesitates ? 8 : 0);
  } else {
    war.cp = Math.max(0, war.cp - 8);
    pDmg = rng.int(16, 26) + (hesitates ? 6 : 0);
  }

  conv.opponentHp = Math.max(0, conv.opponentHp - pDmg);
  war.hp = Math.max(0, war.hp - eDmg);
  conv.round += 1;

  pushLog(
    state,
    'crisis',
    `Final Valley Clash (R${conv.round - 1}): You deal ${pDmg} damage${hesitates ? ` (${conv.opponentName} hesitated!)` : ''} and take ${eDmg} damage.`,
  );

  if (conv.opponentHp <= 0) {
    conv.endingKey = 'conv_player_won';
    state.flags.conv_player_won = true;
    state.stats.bonds -= 12;
    state.stats.will += 8;
    clampStats(state);
    pushLog(
      state,
      'crisis',
      `${conv.opponentName} collapses onto the wet stone as you stand alone above the falls. Your radical vision ("${conv.wishTitle}") reshapes the continent.`,
      { title: 'Conviction Ending: Unbroken Will' },
    );
    return 'player_won';
  }

  if (war.hp <= 0) {
    conv.endingKey = 'conv_bond_stopped';
    state.flags.conv_bond_stopped = true;
    const member = state.team?.members.find((m) => m.id === conv.opponentId);
    if (member && member.trust >= 70) {
      war.hp = 12;
      pushLog(
        state,
        'bond',
        `${conv.opponentName} pins your blade beneath the waterfall and refuses to strike the killing blow, pulling you back from the abyss alive.`,
        { title: 'Conviction Ending: Saved by Kizuna' },
      );
      return 'opponent_won';
    }
    return 'opponent_won_dead';
  }

  return 'continue';
}
