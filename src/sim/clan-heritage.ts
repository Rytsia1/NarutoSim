import { CLAN_MAP, type ClanHidenArt } from '../data/clans';
import { VILLAGE_MAP } from '../data/villages';
import { clamp } from './powers';
import type { SeededRng } from './rng';
import type {
  ClanHeritageState,
  GameState,
  LineageBranch,
  PendingDecision,
} from './types';

export function initClanHeritage(state: GameState, rng: SeededRng): ClanHeritageState | null {
  if (!state.clanId) return null;
  const clan = CLAN_MAP[state.clanId];
  if (!clan) return null;

  let lineageBranch: LineageBranch = 'main_cadets';
  if (state.originId === 'clan_heir') lineageBranch = 'main_heir';
  else if (state.originId === 'clan_branch') lineageBranch = 'branch_house';
  else if (state.originId === 'fallen_clan') lineageBranch = 'distant_blood';
  else if (state.originId === 'anbu_line') lineageBranch = 'main_cadets';
  else lineageBranch = rng.chance(0.5) ? 'mixed_blood' : 'distant_blood';

  // Nobody gets guaranteed peak power purely from clan name: compatibility & training matter!
  const baseCompat =
    lineageBranch === 'main_heir'
      ? rng.int(45, 92)
      : lineageBranch === 'branch_house'
        ? rng.int(40, 88)
        : lineageBranch === 'main_cadets'
          ? rng.int(38, 84)
          : rng.int(26, 78);

  const familyExpectation = clamp(
    clan.heirPressure * 14 + (lineageBranch === 'main_heir' ? 22 : lineageBranch === 'branch_house' ? 12 : 0),
    20,
    98,
  );

  const cagedBirdSealed = Boolean(clan.hasBranchHierarchy && lineageBranch === 'branch_house');

  return {
    clanId: clan.id,
    lineageBranch,
    compatibility: baseCompat,
    familyExpectation,
    traumaCatalyst: state.originId === 'war_orphan' || state.originId === 'fallen_clan' ? 28 : 10,
    unlockedHiden: [],
    hidenMastery: {},
    clanStanding: lineageBranch === 'main_heir' ? 62 : lineageBranch === 'branch_house' ? 46 : 42,
    isDesignatedHeir: lineageBranch === 'main_heir',
    cagedBirdSealed,
    obligationsCompleted: 0,
    internalFactionTension: clan.politicalBias === 'proud' || cagedBirdSealed ? 48 : 22,
    lastClanEventAge: 0,
  };
}

export function getBranchLabel(branch: LineageBranch): string {
  switch (branch) {
    case 'main_heir':
      return 'Main House Heir';
    case 'main_cadets':
      return 'Main House Cadet';
    case 'branch_house':
      return 'Branch House';
    case 'distant_blood':
      return 'Distant Lineage';
    case 'mixed_blood':
      return 'Mixed Heritage';
  }
}

export function bumpClanTraumaCatalyst(state: GameState, amount: number): void {
  if (!state.clanHeritage) return;
  state.clanHeritage.traumaCatalyst = clamp(state.clanHeritage.traumaCatalyst + amount, 0, 100);
}

export function getNextUnlockableHiden(state: GameState): ClanHidenArt | null {
  const ch = state.clanHeritage;
  if (!ch) return null;
  const clan = CLAN_MAP[ch.clanId];
  if (!clan) return null;
  for (const art of clan.hidenArts) {
    if (ch.unlockedHiden.includes(art.id)) continue;
    if (state.age < art.minAge) continue;
    // Branch house Hyuga can only unlock Tier 2 Kaiten if compatibility is high (prodigy) OR standing >= 70
    const reqCompat = ch.cagedBirdSealed && art.tier === 2 ? art.minCompatibility + 8 : art.minCompatibility;
    if (ch.compatibility >= reqCompat && (ch.clanStanding >= art.minStanding || state.stats.intel >= 65)) {
      return art;
    }
  }
  return null;
}

export function pickClanPoliticsDecision(
  state: GameState,
  rng: SeededRng,
): PendingDecision | null {
  const ch = state.clanHeritage;
  if (!ch || state.age < 10 || state.specialStatus === 'missing_nin') return null;
  if (state.age - ch.lastClanEventAge < 4) return null;
  const clan = CLAN_MAP[ch.clanId];
  if (!clan) return null;

  // 1. Secret Hiden Technique Unlock Trial (Layer 3!)
  const nextHiden = getNextUnlockableHiden(state);
  if (nextHiden && rng.chance(0.55)) {
    ch.lastClanEventAge = state.age;
    const restrictedNote =
      ch.cagedBirdSealed && nextHiden.tier === 2
        ? ' Though the Main House guards this secret scroll behind Branch prohibitions, you have decoded its chakra rotation from observation alone.'
        : '';
    return {
      id: `clan_hiden_${nextHiden.id}_${state.age}`,
      kind: 'clan_politics',
      eventId: 'clan_hiden_trial',
      title: `${clan.name} Secret Art: ${nextHiden.name}`,
      body: `With ${ch.compatibility}% lineage compatibility and hard-earned discipline, you stand ready to attempt the secret technique ${nextHiden.name}. ${nextHiden.desc}${restrictedNote}`,
      manual: true,
      meta: { clanScenario: 'hiden_trial', hidenId: nextHiden.id },
      options: [
        {
          id: 'master_hiden',
          label: `Attempt the ${nextHiden.name} mastery trial`,
          sublabel: 'Tests compatibility, Chakra & Intel. Permanently unlocks this Clan Hiden art in combat!',
          statHints: ['Chakra', 'Intel', 'Will'],
          autoEligible: true,
        },
        {
          id: 'defer_hiden',
          label: 'Defer the scroll and drill fundamentals first (+3 Will, +4 Clan Standing)',
          statHints: ['Will'],
          autoEligible: false,
        },
      ],
    };
  }

  if (!rng.chance(0.32)) return null;
  ch.lastClanEventAge = state.age;
  const vName = VILLAGE_MAP[state.villageId].name;

  // 2. Clan-specific Layer 4 Political Drama
  if (clan.id === 'hyuga' && ch.cagedBirdSealed) {
    return {
      id: `clan_pol_hyuga_branch_${state.age}`,
      kind: 'clan_politics',
      eventId: 'clan_hyuga_branch',
      title: 'Hyuga Branch House: Shadow of the Caged Bird',
      body: `At the autumn compound assembly, Main House elders command Branch prodigies to spar defensively so the Main heir can shine before visiting ${vName} officials. The Caged Bird seal pulses faintly beneath your headband.`,
      manual: false,
      meta: { clanScenario: 'hyuga_branch' },
      options: [
        {
          id: 'defy_hierarchy',
          label: 'Fight at full strength and expose the flaw in the Main heir\'s stance',
          sublabel: '+6 Will, +8 Compatibility focus, +10 Internal Tension, -8 Clan Standing.',
          statHints: ['Will', 'Chakra'],
          autoEligible: true,
        },
        {
          id: 'honor_duty',
          label: 'Yield gracefully to shield younger Branch children from punishment',
          sublabel: '+6 Bonds, +8 Clan Standing, +4 Intel.',
          statHints: ['Bonds', 'Intel'],
          autoEligible: true,
        },
        {
          id: 'reform_petition',
          label: 'Quietly ally with reformist Jonin to challenge Branch subordination',
          sublabel: 'Tests Intel & Bonds. Eases internal tension and raises clan loyalty.',
          statHints: ['Intel', 'Bonds'],
          autoEligible: true,
        },
      ],
    };
  }

  if (clan.id === 'uchiha') {
    return {
      id: `clan_pol_uchiha_${state.age}`,
      kind: 'clan_politics',
      eventId: 'clan_uchiha_heir',
      title: ch.isDesignatedHeir
        ? 'Uchiha Compound: Weight of the Heirship'
        : 'Uchiha Police Force: Pride vs Village Unity',
      body: `Beneath flickering shrine torches, Uchiha elders whisper that ${vName}'s shadow council has pushed the clan to the outer district. They look to you to uphold Uchiha prestige and question where your true loyalty lies.`,
      manual: false,
      meta: { clanScenario: 'uchiha_council' },
      options: [
        {
          id: 'bridge_village',
          label: 'Argue for bridging the gap with the Hokage while proving Uchiha honor openly',
          sublabel: '+5 Bonds, +5 Will, raises Uchiha village loyalty, slight clan tension.',
          statHints: ['Bonds', 'Will'],
          autoEligible: true,
        },
        {
          id: 'uphold_clan_pride',
          label: 'Swear to elevate Uchiha power above every rival house in the village',
          sublabel: '+5 Chakra, +10 Clan Standing, +10 Internal Tension, +2 Ambition.',
          statHints: ['Chakra', 'Will'],
          autoEligible: true,
        },
        {
          id: 'investigate_root',
          label: 'Quietly trace who is feeding suspicion between Root and the Police Force',
          sublabel: '+6 Intel, +4 Compatibility insight, uncovers political tension.',
          statHints: ['Intel'],
          autoEligible: true,
        },
      ],
    };
  }

  if (clan.id === 'nara') {
    return {
      id: `clan_pol_nara_${state.age}`,
      kind: 'clan_politics',
      eventId: 'clan_nara_strategy',
      title: 'Nara Deer Forest: Strategic Expectations',
      body: `The Nara clan elders lay a continental border map across the shogi board. As a Nara of ${vName}, you are expected to advise the council and preserve the ancient Ino-Shika-Cho oath rather than chase reckless glory.`,
      manual: false,
      meta: { clanScenario: 'nara_council' },
      options: [
        {
          id: 'submit_doctrine',
          label: 'Draft a full border-deterrence doctrine for the Kage council',
          sublabel: '+6 Intel, +8 Clan Standing, cools World Tension (-4).',
          statHints: ['Intel'],
          autoEligible: true,
        },
        {
          id: 'oath_allies',
          label: 'Drill combined formations with allied clan youths to honor the ancient oath',
          sublabel: '+6 Bonds, +4 Will, +6 Clan Standing.',
          statHints: ['Bonds', 'Will'],
          autoEligible: true,
        },
      ],
    };
  }

  // Generic rich 4-layer Clan Obligation & Heir Politics event for all other 24 clans
  return {
    id: `clan_pol_duty_${clan.id}_${state.age}`,
    kind: 'clan_politics',
    eventId: 'clan_obligation',
    title: `${clan.name} Council: Lineage Obligation`,
    body: `Elders of the ${clan.name} summon you to the ancestral hall. With family expectations at ${ch.familyExpectation}%, they ask you to represent the house before ${vName}'s council and secure the clan's future.`,
    manual: false,
    meta: { clanScenario: 'generic_obligation' },
    options: [
      {
        id: 'fulfill_obligation',
        label: `Accept the ${clan.name} mandate and shoulder the lineage burden`,
        sublabel: '+10 Clan Standing, +4 Will, +4 Compatibility refinement.',
        statHints: ['Will', 'Bonds'],
        autoEligible: true,
      },
      {
        id: 'negotiate_autonomy',
        label: 'Serve the clan on your own terms without surrendering your personal Nindo',
        sublabel: '+5 Will, +4 Intel, balances standing and independence.',
        statHints: ['Intel', 'Will'],
        autoEligible: true,
      },
      {
        id: 'challenge_heirship',
        label: 'Challenge senior prodigies in the clan courtyard to prove your claim',
        sublabel: 'Tests Chakra & Health. Victory earns Heir status & +12 Clan Standing!',
        statHints: ['Chakra', 'Health'],
        autoEligible: true,
      },
    ],
  };
}

export function resolveClanPoliticsDecision(
  state: GameState,
  optionId: string,
  meta: Record<string, string | number | boolean> | undefined,
  rng: SeededRng,
): {
  tone: 'normal' | 'milestone' | 'danger' | 'bond';
  title: string;
  text: string;
  checkLabel?: string;
  checkPassed?: boolean;
  tensionDelta?: number;
} {
  const ch = state.clanHeritage!;
  const clan = CLAN_MAP[ch.clanId];
  const scenario = String(meta?.clanScenario ?? '');
  const vSim = state.worldSim?.villages[state.villageId];
  const clanSim = vSim?.clans.find((c) => c.clanId === ch.clanId);

  if (scenario === 'hiden_trial') {
    const hidenId = String(meta?.hidenId ?? '');
    const art = clan.hidenArts.find((a) => a.id === hidenId);
    if (!art || optionId === 'defer_hiden') {
      ch.clanStanding = clamp(ch.clanStanding + 4, 0, 100);
      state.stats.will += 3;
      return {
        tone: 'normal',
        title: `${clan.name} Fundamentals`,
        text: 'You seal the Hiden scroll back in its cedar box for another season, sharpening your control first.',
      };
    }

    const score = ch.compatibility * 0.45 + state.stats.chakra * 0.3 + state.stats.intel * 0.3 + rng.int(0, 26);
    const passed = score >= (art.tier === 2 ? 78 : 54);
    if (passed) {
      ch.unlockedHiden.push(art.id);
      ch.hidenMastery[art.id] = 1;
      ch.clanStanding = clamp(ch.clanStanding + 10, 0, 100);
      ch.obligationsCompleted += 1;
      state.stats.chakra += 4;
      state.stats.will += 4;
      if (clanSim) clanSim.power = clamp(clanSim.power + 4, 10, 100);
      return {
        tone: 'milestone',
        title: `Clan Hiden Mastered: ${art.name}`,
        text: `Chakra locks cleanly into the ancestral pattern! You master ${art.name}, unlocking its power in live combat and missions.`,
        checkLabel: `${art.name} Mastery`,
        checkPassed: true,
      };
    }
    ch.compatibility = clamp(ch.compatibility + 5, 0, 100);
    state.stats.health = Math.max(10, state.stats.health - 5);
    state.stats.will += 2;
    return {
      tone: 'danger',
      title: `Hiden Recoil: ${art.name}`,
      text: `The ancestral chakra flow destabilizes mid-seal, scorching your coils. Yet the failed attempt deepens your lineage compatibility (+5%).`,
      checkLabel: `${art.name} Mastery`,
      checkPassed: false,
    };
  }

  if (scenario === 'hyuga_branch') {
    if (optionId === 'defy_hierarchy') {
      state.stats.will += 6;
      ch.compatibility = clamp(ch.compatibility + 8, 0, 100);
      ch.internalFactionTension = clamp(ch.internalFactionTension + 10, 0, 100);
      ch.clanStanding = clamp(ch.clanStanding - 8, 0, 100);
      return {
        tone: 'milestone',
        title: 'Defiance in the Hyuga Courtyard',
        text: 'Your palm stops a hair from the Main heir\'s chest before the silent crowd. The elders glare in fury, yet younger Branch shinobi stare at you with fierce pride.',
      };
    }
    if (optionId === 'reform_petition') {
      const ok = state.stats.intel + state.stats.bonds + rng.int(0, 28) > 105;
      if (ok) {
        ch.internalFactionTension = clamp(ch.internalFactionTension - 14, 0, 100);
        ch.clanStanding = clamp(ch.clanStanding + 8, 0, 100);
        if (clanSim) clanSim.loyalty = clamp(clanSim.loyalty + 6, 10, 100);
        state.stats.bonds += 5;
        return {
          tone: 'bond',
          title: 'Cracks in the Old Hierarchy',
          text: 'Your quiet alliance with respected Jonin wins fairer training access for Branch students without igniting an open clan feud.',
          checkLabel: 'Clan Reform Petition',
          checkPassed: true,
        };
      }
      ch.internalFactionTension = clamp(ch.internalFactionTension + 6, 0, 100);
      state.stats.will += 3;
      return {
        tone: 'normal',
        title: 'Petition Shelved',
        text: 'Main House elders table your proposal behind closed doors, yet word of your courage spreads through the Branch quarters.',
        checkLabel: 'Clan Reform Petition',
        checkPassed: false,
      };
    }
    state.stats.bonds += 6;
    state.stats.intel += 4;
    ch.clanStanding = clamp(ch.clanStanding + 8, 0, 100);
    ch.obligationsCompleted += 1;
    return {
      tone: 'bond',
      title: 'Quiet Shield of the Branch',
      text: 'You step back cleanly during the exhibition match, keeping retaliation away from younger Branch cousins while studying every Main House posture.',
    };
  }

  if (scenario === 'uchiha_council') {
    if (optionId === 'bridge_village') {
      state.stats.bonds += 5;
      state.stats.will += 5;
      ch.internalFactionTension = clamp(ch.internalFactionTension - 8, 0, 100);
      if (clanSim) clanSim.loyalty = clamp(clanSim.loyalty + 8, 10, 100);
      return {
        tone: 'bond',
        title: 'Bridge Between Clan and Village',
        text: 'Standing calmly before the shrine, you remind the elders that Konoha was forged by Uchiha hands too, cooling radical whispers.',
      };
    }
    if (optionId === 'uphold_clan_pride') {
      state.stats.chakra += 5;
      ch.clanStanding = clamp(ch.clanStanding + 10, 0, 100);
      ch.internalFactionTension = clamp(ch.internalFactionTension + 10, 0, 100);
      if (clanSim) clanSim.power = clamp(clanSim.power + 5, 10, 100);
      state.leanings.ambition += 2;
      return {
        tone: 'milestone',
        title: 'Flame of Uchiha Pride',
        text: 'The elders nod solemnly as you pledge to make the Uchiha name undeniable across the shinobi world.',
      };
    }
    state.stats.intel += 6;
    ch.compatibility = clamp(ch.compatibility + 4, 0, 100);
    return {
      tone: 'normal',
      title: 'Traces in the Police Ledger',
      text: 'Comparing patrol timestamps reveals deliberate sabotage meant to pit Uchiha officers against Root watchers.',
    };
  }

  if (scenario === 'nara_council') {
    if (optionId === 'submit_doctrine') {
      state.stats.intel += 6;
      ch.clanStanding = clamp(ch.clanStanding + 8, 0, 100);
      ch.obligationsCompleted += 1;
      return {
        tone: 'milestone',
        title: 'Nara Border Doctrine Adopted',
        text: 'The council adopts your defensive supply doctrine verbatim, deterring border skirmishes before a single kunai is thrown.',
        tensionDelta: -4,
      };
    }
    state.stats.bonds += 6;
    state.stats.will += 4;
    ch.clanStanding = clamp(ch.clanStanding + 6, 0, 100);
    ch.obligationsCompleted += 1;
    return {
      tone: 'bond',
      title: 'Oath of the Three Houses',
      text: 'Hours of synchronized shadow-and-vanguard drills in the cedar forest renew the unbreakable bond between allied clans.',
    };
  }

  // Generic obligation resolution
  if (optionId === 'challenge_heirship') {
    const passed = state.stats.chakra + state.stats.health + rng.int(0, 30) >= 120;
    if (passed) {
      ch.isDesignatedHeir = true;
      ch.clanStanding = clamp(ch.clanStanding + 12, 0, 100);
      ch.obligationsCompleted += 1;
      state.stats.will += 5;
      return {
        tone: 'milestone',
        title: `Heir Recognized by the ${clan.name}`,
        text: `You best the clan's top challenger in the stone courtyard, earning formal recognition as a designated heir of the ${clan.name}!`,
        checkLabel: 'Clan Heirship Bout',
        checkPassed: true,
      };
    }
    state.stats.health = Math.max(10, state.stats.health - 6);
    ch.compatibility = clamp(ch.compatibility + 4, 0, 100);
    return {
      tone: 'normal',
      title: 'Hard Lesson in the Courtyard',
      text: 'The senior heir outmaneuvers your opening rush, leaving bruises and sharper focus for next year.',
      checkLabel: 'Clan Heirship Bout',
      checkPassed: false,
    };
  }

  if (optionId === 'fulfill_obligation') {
    ch.clanStanding = clamp(ch.clanStanding + 10, 0, 100);
    ch.compatibility = clamp(ch.compatibility + 4, 0, 100);
    ch.obligationsCompleted += 1;
    state.stats.will += 4;
    if (clanSim) clanSim.loyalty = clamp(clanSim.loyalty + 4, 10, 100);
    return {
      tone: 'milestone',
      title: `${clan.name} Honor Upheld`,
      text: `You shoulder the ${clan.name}'s diplomatic and training duties cleanly, raising your standing among the elders.`,
    };
  }

  state.stats.will += 5;
  state.stats.intel += 4;
  ch.clanStanding = clamp(ch.clanStanding + 3, 0, 100);
  return {
    tone: 'normal',
    title: 'Independent Line',
    text: `You respect the ${clan.name}'s history while making clear that your Nindo belongs to you alone.`,
  };
}
