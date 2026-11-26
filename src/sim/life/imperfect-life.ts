import { CLAN_MAP } from '../../data/clans';
import { GREAT_VILLAGES, kageTitle, VILLAGE_MAP } from '../../data/villages';
import { recordMemory } from '../history/chronicle';
import { recordEpisodicNpcMemory } from '../npc/cognition';
import { ensureNpcCognitionState } from '../npc/lod-population';
import { addNpcMemory, recordWorldHistory, triggerNpcDefection } from '../npc-sim';
import { getPerson, isPersonAlive, killPerson, personName } from '../people';
import { clamp } from '../powers';
import { adjustBidirectionalPlayerRel } from '../relationships';
import type { SeededRng } from '../rng';
import type {
  GameState,
  PendingDecision,
  PlayerHumanLegacy,
  VillageId,
  WorldNpc,
} from '../types';
import { shiftDiplomacy } from '../world/geopolitics';

export interface ImperfectLifeResolution {
  tone: 'normal' | 'milestone' | 'danger' | 'bond' | 'war';
  title: string;
  text: string;
  tensionDelta?: number;
  checkLabel?: string;
  checkPassed?: boolean;
  killed?: boolean;
  deathCause?: string;
}

export function ensurePlayerLegacy(state: GameState): PlayerHumanLegacy {
  if (!state.playerLegacy) {
    state.playerLegacy = {
      livesSaved: 0,
      comradesBroughtHome: 0,
      quietHeroMoments: [],
      unhealedScars: [],
      usedImperfectScenarios: [],
      abandonedSurvivorNpcId: null,
      unwantedTargetNpcId: null,
    };
  }
  return state.playerLegacy;
}

function getLivingVillageNpcs(state: GameState, excludeIds: Set<string> = new Set()): WorldNpc[] {
  const ws = state.worldSim;
  if (!ws) return [];
  return ws.npcs.filter(
    (n) =>
      n.identity.alive &&
      n.identity.villageId === state.villageId &&
      n.identity.specialStatus !== 'missing_nin' &&
      !excludeIds.has(n.identity.id),
  );
}

/**
 * Scenario A: The Failed Genin
 * Triggered when the player fails the Academy graduation exam while classmates move ahead.
 */
export function buildFailedGeninDecision(state: GameState): PendingDecision | null {
  const legacy = ensurePlayerLegacy(state);
  if (legacy.usedImperfectScenarios.includes('failed_genin')) return null;
  if (state.rank !== 'academy' || state.academyFailedCount < 1) return null;

  const ws = state.worldSim;
  const ac = state.academy;
  const senseiName = ac?.senseiName ?? 'your Academy Sensei';
  const classmates = (ac?.classmateNpcIds ?? [])
    .map((id) => ws?.npcs.find((n) => n.identity.id === id && n.identity.alive))
    .filter((n): n is WorldNpc => Boolean(n));

  const rival = classmates[0];
  const loyalFriend = classmates[1] ?? classmates[classmates.length - 1];

  return {
    id: `imp_failed_genin_${state.age}`,
    kind: 'imperfect_life',
    eventId: 'failed_genin',
    title: 'The Failed Genin: Left Behind in the Academy',
    body: `By dusk, the graduation courtyard empties out. ${rival ? rival.identity.name : 'Your former classmates'} walk past the gates wearing gleaming ${VILLAGE_MAP[state.villageId].name} forehead protectors, already murmuring about squad assignments and avoiding your eyes. While you sit on the wooden swing alone, ${senseiName} steps out with two worn practice kunai and offers to stay past dark to help you try again.`,
    manual: true,
    meta: {
      scenario: 'failed_genin',
      senseiId: ac?.senseiNpcId ?? '',
      rivalId: rival?.identity.id ?? '',
      friendId: loyalFriend?.identity.id ?? '',
    },
    options: [
      {
        id: 'accept_sensei',
        label: `Accept ${senseiName}'s quiet after-hours drills with humility`,
        sublabel: 'Swallow your pride, rebuild basics (+14 Bunshin/Kawarimi, +4 Will, deep Mentor bond).',
        statHints: ['Will', 'Intel'],
        autoEligible: true,
      },
      {
        id: 'solitary_grit',
        label: 'Refuse pity and drill alone past midnight until your knuckles bleed',
        sublabel: '+6 Chakra, +5 Will, -5 Health. Turns humiliation into fierce solitary grit.',
        statHints: ['Chakra', 'Will'],
        autoEligible: true,
      },
      {
        id: 'lean_on_friend',
        label: `Walk home with ${loyalFriend ? loyalFriend.identity.name : 'the one friend who stayed behind'}`,
        sublabel: 'Keep one human anchor intact (+6 Bonds, deep mutual Trust & Affection).',
        statHints: ['Bonds'],
        autoEligible: true,
      },
    ],
  };
}

/**
 * Scenario B: The Unwanted Mission
 * Ordered to hunt down a Missing-Nin who turns out to be a childhood friend / former classmate.
 */
export function buildUnwantedMissionDecision(state: GameState): PendingDecision | null {
  const legacy = ensurePlayerLegacy(state);
  if (legacy.usedImperfectScenarios.includes('unwanted_mission')) return null;
  if (state.specialStatus === 'missing_nin' || state.specialStatus === 'kage') return null;
  if (state.rank !== 'chunin' && state.rank !== 'jonin') return null;
  if (state.age < 16) return null;

  const ws = state.worldSim;
  if (!ws) return null;

  // Prefer an actual Missing-Nin who knows the player or was an Academy classmate
  let target = ws.npcs.find(
    (n) =>
      n.identity.alive &&
      n.identity.specialStatus === 'missing_nin' &&
      (Boolean(n.relationships.player) || state.academy?.classmateNpcIds.includes(n.identity.id)),
  );

  // If none defected yet during a tense era, organically trigger a strained classmate/peer's defection
  if (!target && state.world.tension >= 42) {
    const teamIds = new Set(state.team?.members.map((m) => m.personId) ?? []);
    const peer = ws.npcs.find(
      (n) =>
        n.identity.alive &&
        n.identity.villageId === state.villageId &&
        n.identity.specialStatus === 'none' &&
        !teamIds.has(n.identity.id) &&
        (state.academy?.classmateNpcIds.includes(n.identity.id) || Boolean(n.relationships.player)) &&
        n.personality.loyal <= 62,
    );
    if (peer) {
      triggerNpcDefection(peer, 'fled after refusing a covert elder purge order', state, ws, []);
      target = peer;
    }
  }

  if (!target) return null;
  legacy.unwantedTargetNpcId = target.identity.id;
  const leader = kageTitle(state);
  const vName = VILLAGE_MAP[state.villageId].name;

  return {
    id: `imp_unwanted_mission_${state.age}`,
    kind: 'imperfect_life',
    eventId: 'unwanted_mission',
    title: `The Unwanted Mission: Warrant for ${target.identity.name}`,
    body: `An ANBU courier delivers a red-wax elimination scroll from the ${leader}'s office. When you break the seal, the inked portrait staring back is ${target.identity.name}, someone who once shared training grounds and quiet afternoons with you in ${vName}. Now listed as a Bingo Book Missing-Nin hiding along the frontier, your orders are unambiguous: track them down and erase the village's embarrassment.`,
    manual: true,
    meta: {
      scenario: 'unwanted_mission',
      targetId: target.identity.id,
      targetName: target.identity.name,
    },
    options: [
      {
        id: 'execute_order',
        label: 'Carry out the village order without hesitation',
        sublabel: 'Upholds duty (+6 Ryo, +Village standing), leaves a permanent unhealed scar.',
        statHints: ['Will'],
        autoEligible: false,
      },
      {
        id: 'fake_death',
        label: 'Stage their death at the river gorge and let them vanish',
        sublabel: 'Tests Intel. Earns a lifelong spared-life bond; risks ANBU suspicion if discovered.',
        statHints: ['Intel', 'Bonds'],
        autoEligible: true,
      },
      {
        id: 'bring_home_alive',
        label: 'Track them alone and fight non-lethally to drag them home alive',
        sublabel: 'Tests Chakra & Will. Dangerous clash, but refuses to bury an old friend.',
        statHints: ['Chakra', 'Will'],
        autoEligible: true,
      },
      {
        id: 'refuse_scroll',
        label: `Lay the sealed scroll back on the ${leader}'s desk and refuse the contract`,
        sublabel: 'Protects your Nindo (+7 Will), invites harsh political backlash (-8 Ryo, -Clan/Village favor).',
        statHints: ['Will', 'Bonds'],
        autoEligible: false,
      },
    ],
  };
}

/**
 * Scenario C: The Abandoned Squad
 * Sensei and a teammate fall during a brutal ambush; you survive, and the sole surviving teammate blames you.
 */
export function buildAbandonedSquadDecision(state: GameState): PendingDecision | null {
  const legacy = ensurePlayerLegacy(state);
  if (legacy.usedImperfectScenarios.includes('abandoned_squad')) return null;
  if (!state.team || !state.team.active || state.age < 13) return null;
  if (state.world.tension < 38) return null;

  const sensei = state.team.members.find((m) => m.role === 'sensei' && isPersonAlive(state, m.personId));
  const livingMates = state.team.members.filter((m) => m.role === 'teammate' && isPersonAlive(state, m.personId));
  if (!sensei || livingMates.length < 2) return null;

  const fallenMate = livingMates[0];
  const survivorMate = livingMates[1];
  const senseiName = personName(state, sensei.personId);
  const fallenMateName = personName(state, fallenMate.personId);
  const survivorMateName = personName(state, survivorMate.personId);

  return {
    id: `imp_abandoned_squad_${state.age}`,
    kind: 'imperfect_life',
    eventId: 'abandoned_squad',
    title: `The Abandoned Squad: Rain Over the Frontier`,
    body: `An intelligence leak drops an enemy kill-squad straight onto Team ${state.team.number} in a rain-drenched ravine. ${senseiName} throws up a desperate barrier while ${fallenMateName} drags you clear of a paper-bomb blast, vanishing into the smoke behind them. Bleeding and pinned down beside a broken bridge, ${survivorMateName} grabs your collar in panic, screaming at you to go back into the fire as enemy footsteps close in.`,
    manual: true,
    meta: {
      scenario: 'abandoned_squad',
      senseiId: sensei.personId,
      senseiName,
      fallenMateId: fallenMate.personId,
      fallenMateName,
      survivorMateId: survivorMate.personId,
      survivorMateName,
    },
    options: [
      {
        id: 'pull_survivor_out',
        label: `Drag ${survivorMateName} out of the ravine alive while the rear guard falls`,
        sublabel: 'You save the last living teammate, though survivor guilt turns their grief into blame against you.',
        statHints: ['Will', 'Health'],
        autoEligible: true,
      },
      {
        id: 'charge_back_smoke',
        label: 'Dive back into the smoke to recover their bodies and buy escape time',
        sublabel: 'Severe physical toll (-18 Health, +8 Will, +1 Life Saved); softens some bitterness.',
        statHints: ['Health', 'Will'],
        autoEligible: false,
      },
      {
        id: 'protocol_retreat',
        label: 'Follow shinobi extraction protocol and secure the mission scroll first',
        sublabel: '+5 Intel, preserves mission intel, deepens Resentment with the sole survivor.',
        statHints: ['Intel'],
        autoEligible: false,
      },
    ],
  };
}

/**
 * Scenario C Follow-Up: Years later, cross paths with the estranged surviving teammate.
 */
export function buildAbandonedSquadReckoningDecision(state: GameState): PendingDecision | null {
  const legacy = ensurePlayerLegacy(state);
  if (!legacy.usedImperfectScenarios.includes('abandoned_squad')) return null;
  if (legacy.usedImperfectScenarios.includes('abandoned_squad_reckoning')) return null;
  if (!legacy.abandonedSurvivorNpcId) return null;

  const ws = state.worldSim;
  const survivor = ws?.npcs.find((n) => n.identity.id === legacy.abandonedSurvivorNpcId && n.identity.alive);
  if (!survivor) return null;
  const year = state.birthYear + state.age;
  const abandonedMem = survivor.memory.find((m) => m.category === 'abandoned');
  if (!abandonedMem || year - abandonedMem.year < 3) return null;

  return {
    id: `imp_abandoned_reckoning_${state.age}`,
    kind: 'imperfect_life',
    eventId: 'abandoned_squad_reckoning',
    title: `Echoes of Team ${state.team?.number ?? ''}: Facing ${survivor.identity.name}`,
    body: `Outside the memorial stone at dusk, you find ${survivor.identity.name} laying fresh white flowers beside your fallen squadmates' names. Years have passed since the ravine ambush, yet their jaw tightens the moment they hear your footsteps. "I still dream about that rain," they say quietly without turning around. "Tell me honestly why we walked away while they did not."`,
    manual: true,
    meta: {
      scenario: 'abandoned_squad_reckoning',
      survivorNpcId: survivor.identity.id,
      survivorName: survivor.identity.name,
    },
    options: [
      {
        id: 'own_the_weight',
        label: 'Stand beside them in the rain and carry the guilt without making excuses',
        sublabel: 'Genuine honesty begins healing Resentment and restores quiet Trust.',
        statHints: ['Bonds', 'Will'],
        autoEligible: true,
      },
      {
        id: 'honor_sacrifice',
        label: 'Remind them that living well is the debt owed to Sensei and your fallen friend',
        sublabel: 'Tests Bonds & Will. Can transform survivor guilt into shared resolve.',
        statHints: ['Will', 'Bonds'],
        autoEligible: true,
      },
      {
        id: 'leave_silently',
        label: 'Place a single flower beside theirs and walk away in silence',
        sublabel: 'Accepts that some wounds cannot be talked away (+4 Will, estrangement lingers).',
        statHints: ['Will'],
        autoEligible: false,
      },
    ],
  };
}

/**
 * Scenario D: The Political Tool
 * Born into an influential clan, the Kage dispatches you on a delicate diplomatic mission solely because of your family ties.
 */
export function buildPoliticalToolDecision(state: GameState, rng: SeededRng): PendingDecision | null {
  const legacy = ensurePlayerLegacy(state);
  if (legacy.usedImperfectScenarios.includes('political_tool')) return null;
  if (!state.clanId || state.specialStatus === 'missing_nin' || state.specialStatus === 'kage') return null;
  if (state.age < 15 || (state.rank !== 'genin' && state.rank !== 'chunin' && state.rank !== 'jonin')) return null;

  const clan = CLAN_MAP[state.clanId];
  if (!clan) return null;
  const rivals = GREAT_VILLAGES.filter((v) => v.id !== state.villageId);
  const targetVillage = rng.pick(rivals);
  const leader = kageTitle(state);

  return {
    id: `imp_political_tool_${state.age}`,
    kind: 'imperfect_life',
    eventId: 'political_tool',
    title: `The Political Tool: A Bargaining Chip of the ${clan.name}`,
    body: `The ${leader} and your clan elders summon you behind sliding paper doors. A fragile border treaty with ${targetVillage.name} hangs by a thread, and they are not asking for your jutsu; they are deploying your surname. Because your household shares old marriage and trade ties across the border, you are ordered to act as the visible guarantor of a backroom concession that quietly sacrifices an allied border hamlet.`,
    manual: true,
    meta: {
      scenario: 'political_tool',
      targetVillageId: targetVillage.id,
      targetVillageName: targetVillage.name,
      clanName: clan.name,
    },
    options: [
      {
        id: 'play_pawn',
        label: 'Play the obedient envoy and seal the treaty on the elders’ terms',
        sublabel: 'Lowers World Tension (-10) & lifts Clan Standing (+12), at the cost of a quiet scar.',
        statHints: ['Bonds', 'Intel'],
        autoEligible: true,
      },
      {
        id: 'subvert_quietly',
        label: 'Sign the accord while smuggling warning scrolls to evacuate the border hamlet first',
        sublabel: 'Tests Intel. Saves innocent civilians (+2 Lives Saved) while walking a razor wire.',
        statHints: ['Intel', 'Will'],
        autoEligible: true,
      },
      {
        id: 'reject_pawn_role',
        label: 'Speak off-script before both delegations and refuse to trade lives for prestige',
        sublabel: '+8 Will, wins grassroots respect, angers clan elders (-14 Clan Standing).',
        statHints: ['Will'],
        autoEligible: false,
      },
    ],
  };
}

/**
 * Scenario E: The Ordinary Shinobi
 * Not from a great clan, no Kekkei Genkai, never Kage, yet you bring three comrades home alive.
 */
export function buildOrdinaryShinobiDecision(state: GameState): PendingDecision | null {
  const legacy = ensurePlayerLegacy(state);
  if (legacy.usedImperfectScenarios.includes('ordinary_shinobi')) return null;
  if (state.specialStatus === 'kage' || state.specialStatus === 'missing_nin') return null;
  if (state.age < 15 || (state.rank !== 'genin' && state.rank !== 'chunin' && state.rank !== 'jonin')) return null;

  const isOrdinary =
    !state.bloodline &&
    (state.originId === 'civilian' || state.originId === 'war_orphan' || !state.clanId);
  // Ordinary shinobi trigger readily in any tense year; others can still face it during real wartime tension
  if (!isOrdinary && state.world.tension < 58 && state.warHistory.length === 0) return null;
  if (isOrdinary && state.world.tension < 28 && state.warHistory.length === 0 && state.age < 19) return null;

  const comrades = getLivingVillageNpcs(state)
    .sort((a, b) => (b.relationships.player ? 1 : 0) - (a.relationships.player ? 1 : 0))
    .slice(0, 3);
  const cNames =
    comrades.length >= 3
      ? `${comrades[0].identity.name}, ${comrades[1].identity.name}, and ${comrades[2].identity.name}`
      : 'three pinned village shinobi';

  return {
    id: `imp_ordinary_shinobi_${state.age}`,
    kind: 'imperfect_life',
    eventId: 'ordinary_shinobi',
    title: 'The Ordinary Shinobi: Bring Them Home',
    body: `Smoke chokes the mountain supply pass after an enemy artillery barrage collapses the road back to ${VILLAGE_MAP[state.villageId].name}. No legendary bloodline or Kage escort is coming. Behind the shattered boulders, ${cNames} are wounded and out of chakra as enemy trackers sweep the ridge. Command has already sounded full retreat. No medal awaits anyone who turns back, only three empty chairs in the village if you leave them.`,
    manual: true,
    meta: {
      scenario: 'ordinary_shinobi',
      c1Id: comrades[0]?.identity.id ?? '',
      c2Id: comrades[1]?.identity.id ?? '',
      c3Id: comrades[2]?.identity.id ?? '',
      comradeNames: cNames,
    },
    options: [
      {
        id: 'bring_all_three',
        label: 'Hold the choke point with mud walls and haul all three comrades home yourself',
        sublabel: 'Brings 3 comrades home (+3 Lives Saved, lifelong NPC memories), heavy physical toll (-14 Health).',
        statHints: ['Will', 'Health'],
        autoEligible: true,
      },
      {
        id: 'tactical_extraction',
        label: 'Rig paper-bomb decoys and smoke clones to slip them out through the gully',
        sublabel: 'Tests Intel & Chakra. Brings all 3 home cleanly on success, 2 on partial.',
        statHints: ['Intel', 'Chakra'],
        autoEligible: true,
      },
      {
        id: 'relay_reinforcements',
        label: 'Pull the closest wounded comrade clear and sprint for border reinforcements',
        sublabel: 'Saves 1 comrade safely without risking collapse (+1 Life Saved, realistic survival choice).',
        statHints: ['Will'],
        autoEligible: false,
      },
    ],
  };
}

/**
 * Bridges L1 NPC Utility AI -> Player Agency!
 * Fires when an L1 NPC's Utility AI chose `ask_ally_help` targeting `'player'` (e.g. Renji's sick sibling).
 */
export function pickNpcPleaDecision(state: GameState): PendingDecision | null {
  const ws = state.worldSim;
  if (!ws || state.age < 11 || state.specialStatus === 'missing_nin') return null;
  const legacy = ensurePlayerLegacy(state);
  if (legacy.lastNpcPleaAge !== undefined && state.age - legacy.lastNpcPleaAge < 4) return null;

  const requester = ws.npcs.find(
    (n) =>
      n.identity.alive &&
      n.cognition?.pendingPlayerPlea &&
      n.cognition.familyCrisis &&
      n.identity.villageId === state.villageId,
  );
  if (!requester || !requester.cognition?.familyCrisis) return null;

  const fc = requester.cognition.familyCrisis;
  const hasMedical = state.disciplines.some((d) => d.id === 'medical');
  const lastTrace = requester.cognition.lastDecision;
  const utilityNote = lastTrace
    ? ` (They weighed mission duty against family and trusted you most to ask.)`
    : '';

  return {
    id: `npc_plea_${requester.identity.id}_${state.age}`,
    kind: 'npc_plea',
    eventId: 'npc_family_plea',
    title: `A Quiet Knock at Dusk: ${requester.identity.name}'s Plea`,
    body: `${requester.identity.name} waits outside your door with tired eyes, still wearing travel dust from village drills. Their ${fc.relativeName} has taken a turn for the worse while their sensei is pressing them to deploy on a dangerous rank mission.${utilityNote} "I would not ask anyone else," they say softly. "Can you help me keep my family standing?"`,
    manual: true,
    meta: {
      npcId: requester.identity.id,
      npcName: requester.identity.name,
      relativeName: fc.relativeName,
    },
    options: [
      {
        id: 'save_family_medical_or_ryo',
        label: hasMedical
          ? `Use your Medical Ninjutsu and herbs to stabilize ${fc.relativeName}`
          : `Spend 10 Ryo to secure rare medicine and tend ${fc.relativeName}`,
        sublabel: hasMedical
          ? 'No Ryo cost! Saves their relative and creates a permanent Saved Family memory.'
          : 'Costs 10 Ryo. Saves their relative and transforms their loyalty to you for life.',
        disabled: !hasMedical && state.stats.ryo < 10,
        disabledReason: !hasMedical && state.stats.ryo < 10 ? 'Requires 10 Ryo or Medical Ninjutsu.' : undefined,
        statHints: ['Bonds'],
        autoEligible: hasMedical || state.stats.ryo >= 14,
      },
      {
        id: 'cover_shift',
        label: `Take their patrol shift so ${requester.identity.name} can stay by their family's bedside`,
        sublabel: 'Costs -6 Health / fatigue, no Ryo spent. Deepens Trust & Affection.',
        statHints: ['Will', 'Bonds'],
        autoEligible: true,
      },
      {
        id: 'decline_plea',
        label: 'Tell them every shinobi must carry their own burdens alone',
        sublabel: 'Preserves your time and ryo, bruises Trust and plants Resentment.',
        statHints: ['Will'],
        autoEligible: false,
      },
    ],
  };
}

export function resolveNpcPleaDecision(
  state: GameState,
  optionId: string,
  meta: Record<string, string | number | boolean> | undefined,
): ImperfectLifeResolution {
  const ws = state.worldSim;
  const legacy = ensurePlayerLegacy(state);
  legacy.lastNpcPleaAge = state.age;
  const npcId = String(meta?.npcId ?? '');
  const npc = ws?.npcs.find((n) => n.identity.id === npcId);
  const npcName = npc?.identity.name ?? String(meta?.npcName ?? 'your comrade');
  const relativeName = String(meta?.relativeName ?? 'their relative');
  const year = state.birthYear + state.age;

  if (npc?.cognition) {
    npc.cognition.pendingPlayerPlea = false;
  }

  if (optionId === 'save_family_medical_or_ryo') {
    const hasMedical = state.disciplines.some((d) => d.id === 'medical');
    if (!hasMedical) state.stats.ryo = Math.max(0, state.stats.ryo - 10);
    state.stats.bonds += 7;
    state.stats.will += 3;
    legacy.livesSaved += 1;
    legacy.quietHeroMoments.push(`Helped save ${npcName}'s ${relativeName} at age ${state.age}.`);

    if (npc) {
      const cog = ensureNpcCognitionState(npc, 'L1');
      cog.familyCrisis = null;
      cog.stress = clamp(cog.stress - 28, 0, 100);
      adjustBidirectionalPlayerRel(
        state,
        npc,
        { trust: 26, affection: 24, respect: 16, resentment: -20 },
        { trust: 14, affection: 16, respect: 8 },
        'friend',
      );
      recordEpisodicNpcMemory(npc, {
        year,
        age: npc.identity.age,
        tag: 'bond',
        category: 'saved_family',
        salience: 10,
        actorId: 'player',
        summary: `${state.name} stepped in and saved ${relativeName} when no one else could.`,
        impact: 10,
      });
    }
    recordMemory(state, 'bond', `Helped ${npcName} save ${relativeName} through a dark night.`);

    return {
      tone: 'bond',
      title: `A Debt Never Forgotten: ${npcName}`,
      text: `By morning the fever breaks. ${npcName} sits beside ${relativeName} with tears of relief they quickly wipe away before gripping your hand. "Whatever happens in the years ahead, ${state.name}, you will never stand alone."`,
    };
  }

  if (optionId === 'cover_shift') {
    state.stats.health -= 6;
    state.stats.bonds += 5;
    state.stats.will += 2;
    if (npc) {
      const cog = ensureNpcCognitionState(npc, 'L1');
      if (cog.familyCrisis) {
        cog.familyCrisis.severity = clamp(cog.familyCrisis.severity - 42, 0, 100);
        cog.familyCrisis.helpedByPlayer = true;
        if (cog.familyCrisis.severity <= 20) cog.familyCrisis = null;
      }
      adjustBidirectionalPlayerRel(
        state,
        npc,
        { trust: 16, affection: 15, respect: 12, resentment: -10 },
        { trust: 10, affection: 10 },
        'friend',
      );
      recordEpisodicNpcMemory(npc, {
        year,
        age: npc.identity.age,
        tag: 'bond',
        category: 'helped_ally',
        salience: 8,
        actorId: 'player',
        summary: `${state.name} covered my patrol shift so I could stay with ${relativeName}.`,
        impact: 7,
      });
    }
    return {
      tone: 'bond',
      title: `Double Watch for ${npcName}`,
      text: `You take the cold night watch along the village perimeter so ${npcName} can remain at home. Exhausted at dawn, you find a warm parcel of rice balls and a short note of gratitude waiting on your doorstep.`,
    };
  }

  // Declined
  state.stats.will += 1;
  if (npc) {
    adjustBidirectionalPlayerRel(
      state,
      npc,
      { trust: -18, affection: -14, resentment: 16 },
      { affection: -6 },
    );
    recordEpisodicNpcMemory(npc, {
      year,
      age: npc.identity.age,
      tag: 'bond',
      category: 'abandoned',
      salience: 6,
      actorId: 'player',
      summary: `${state.name} turned me away when ${relativeName} was desperately ill.`,
      impact: -6,
    });
  }
  return {
    tone: 'normal',
    title: 'Closed Door at Dusk',
    text: `${npcName} nods once, their expression shutting tight like a shutter in a storm, and disappears back into the alley alone.`,
  };
}

/**
 * Selects an eligible Imperfect Life Scenario (A-E) organically during yearly progression.
 */
export function pickImperfectLifeDecision(state: GameState, rng: SeededRng): PendingDecision | null {
  // Scenario A has immediate priority if the player failed graduation
  const failedGenin = buildFailedGeninDecision(state);
  if (failedGenin) return failedGenin;

  // Scenario C follow-up reckoning
  const reckoning = buildAbandonedSquadReckoningDecision(state);
  if (reckoning && rng.chance(0.45)) return reckoning;

  // Pace remaining human turning points cleanly (avoid stacking back-to-back)
  if (!rng.chance(0.24)) return null;

  const candidates: PendingDecision[] = [];
  const sB = buildUnwantedMissionDecision(state);
  if (sB) candidates.push(sB);
  const sC = buildAbandonedSquadDecision(state);
  if (sC) candidates.push(sC);
  const sD = buildPoliticalToolDecision(state, rng);
  if (sD) candidates.push(sD);
  const sE = buildOrdinaryShinobiDecision(state);
  if (sE) candidates.push(sE);

  if (candidates.length === 0) return null;
  return rng.pick(candidates);
}

/**
 * Resolves Scenarios A-E with rich Relationship 2.0, Episodic Memory, and Quiet Heroism Legacy updates.
 */
export function resolveImperfectLifeDecision(
  state: GameState,
  optionId: string,
  meta: Record<string, string | number | boolean> | undefined,
  rng: SeededRng,
): ImperfectLifeResolution {
  const legacy = ensurePlayerLegacy(state);
  const ws = state.worldSim;
  const year = state.birthYear + state.age;
  const scenario = String(meta?.scenario ?? '');
  if (scenario && !legacy.usedImperfectScenarios.includes(scenario)) {
    legacy.usedImperfectScenarios.push(scenario);
  }

  // ---- SCENARIO A: THE FAILED GENIN ----
  if (scenario === 'failed_genin') {
    const sensei = ws?.npcs.find((n) => n.identity.id === String(meta?.senseiId ?? ''));
    const rival = ws?.npcs.find((n) => n.identity.id === String(meta?.rivalId ?? ''));
    const friend = ws?.npcs.find((n) => n.identity.id === String(meta?.friendId ?? ''));

    // Former classmates move forward; arrogant rival pulls away slightly
    if (rival) {
      if (rival.identity.rank === 'academy') {
        rival.identity.rank = 'genin';
        rival.identity.roleTitle = 'Village Genin';
      }
      adjustBidirectionalPlayerRel(
        state,
        rival,
        { respect: -14, affection: -10, rivalry: 8 },
        { rivalry: 14, resentment: 6 },
      );
    }

    if (optionId === 'accept_sensei') {
      if (state.academy) {
        state.academy.bunshin = clamp(state.academy.bunshin + 14, 0, 100);
        state.academy.kawarimi = clamp(state.academy.kawarimi + 14, 0, 100);
        state.academy.favoredBySensei = true;
      }
      state.stats.will += 4;
      state.stats.intel += 3;
      if (sensei) {
        adjustBidirectionalPlayerRel(
          state,
          sensei,
          { trust: 18, respect: 14, affection: 14 },
          { trust: 20, respect: 20, affection: 16 },
          'mentor',
        );
        recordEpisodicNpcMemory(sensei, {
          year,
          age: sensei.identity.age,
          tag: 'bond',
          category: 'mentored',
          salience: 8,
          actorId: 'player',
          summary: `Coached ${state.name} through the sting of failing graduation until their form steadied.`,
          impact: 7,
        });
      }
      return {
        tone: 'bond',
        title: 'Lantern-Lit Drills',
        text: `Long after the courtyard falls dark, ${sensei?.identity.name ?? 'your Sensei'} corrects your footwork patient beat by patient beat. Repeating a year still stings, yet for the first time you feel your chakra answer without shaking.`,
      };
    }

    if (optionId === 'solitary_grit') {
      state.stats.chakra += 6;
      state.stats.will += 6;
      state.stats.health -= 5;
      legacy.unhealedScars.push('Carried the bitter sting of repeating the Academy alone.');
      if (state.academy) {
        state.academy.bunshin = clamp(state.academy.bunshin + 10, 0, 100);
        state.academy.kawarimi = clamp(state.academy.kawarimi + 10, 0, 100);
      }
      return {
        tone: 'normal',
        title: 'Torn Bandages in the Dark',
        text: `You wave off everyone's sympathy and hammer wooden posts until moonlight fades into dawn. Your hands are raw, but nobody in next year's class will mistake your silence for weakness.`,
      };
    }

    state.stats.bonds += 7;
    state.stats.will += 3;
    if (friend) {
      adjustBidirectionalPlayerRel(
        state,
        friend,
        { trust: 20, affection: 22, respect: 10 },
        { trust: 20, affection: 22, respect: 10 },
        'friend',
      );
      recordEpisodicNpcMemory(friend, {
        year,
        age: friend.identity.age,
        tag: 'bond',
        category: 'helped_ally',
        salience: 8,
        actorId: 'player',
        summary: `Stayed by ${state.name}'s side when others drifted away after the graduation exam.`,
        impact: 7,
      });
    }
    return {
      tone: 'bond',
      title: 'Two Bowls of Ramen on the Curb',
      text: `${friend?.identity.name ?? 'Your loyal classmate'} refuses to act superior over a strip of metal and cloth. Sitting together on the curb laughing until midnight, you remember why you wanted to protect this village in the first place.`,
    };
  }

  // ---- SCENARIO B: THE UNWANTED MISSION ----
  if (scenario === 'unwanted_mission') {
    const targetId = String(meta?.targetId ?? '');
    const target = ws?.npcs.find((n) => n.identity.id === targetId);
    const targetName = target?.identity.name ?? String(meta?.targetName ?? 'your childhood friend');

    if (optionId === 'execute_order') {
      state.stats.ryo += 14;
      state.stats.will -= 4;
      legacy.unhealedScars.push(`Executed village orders against childhood friend ${targetName}.`);
      if (target) {
        target.identity.alive = false;
        target.identity.deathAge = target.identity.age;
        target.identity.deathCause = `eliminated under official village warrant by ${state.name}`;
      }
      if (ws) {
        ws.villages[state.villageId].stability = clamp(ws.villages[state.villageId].stability + 4, 10, 100);
        recordWorldHistory(ws, {
          year,
          layer: 'npc',
          title: `Bingo Book Entry Closed: ${targetName}`,
          summary: `${state.name} carried out an official pursuit warrant against former friend ${targetName}.`,
          villageId: state.villageId,
          npcId: target?.identity.id,
          tone: 'danger',
        });
      }
      recordMemory(state, 'loss', `Followed orders and cut down childhood friend ${targetName} in the border rain.`);
      return {
        tone: 'danger',
        title: 'The Quiet Weight of Obedience',
        text: `${targetName} does not even draw a second kunai at the end. You hand their scratched forehead protector to the mission desk, pocket the cold ryo, and discover that no rank washes ash off your hands.`,
      };
    }

    if (optionId === 'fake_death') {
      const passed = state.stats.intel + rng.int(0, 34) >= 62;
      if (target) {
        adjustBidirectionalPlayerRel(
          state,
          target,
          { trust: 32, affection: 28, respect: 22, resentment: -30 },
          { trust: 16, affection: 18 },
          'ally',
        );
        recordEpisodicNpcMemory(target, {
          year,
          age: target.identity.age,
          tag: 'bond',
          category: 'spared_life',
          salience: 10,
          actorId: 'player',
          summary: `${state.name} staged my death on an elimination warrant and gave me a second life.`,
          impact: 10,
        });
      }
      legacy.livesSaved += 1;
      legacy.quietHeroMoments.push(`Spared childhood friend ${targetName} by staging their fall.`);
      if (passed) {
        state.stats.bonds += 6;
        state.stats.intel += 4;
        return {
          tone: 'bond',
          title: 'A Ghost Left in the Gorge',
          text: `You leave a scorched cloak and a broken blade above the foaming river. ANBU examiners sign off on the death certificate, while far across the pass ${targetName} pauses once to bow toward ${VILLAGE_MAP[state.villageId].name}.`,
          checkLabel: 'Staged Extraction',
          checkPassed: true,
        };
      }
      state.stats.bonds += 4;
      state.stats.ryo = Math.max(0, state.stats.ryo - 8);
      if (ws) {
        ws.villages[state.villageId].shadowOrg.influence = clamp(
          ws.villages[state.villageId].shadowOrg.influence + 5,
          10,
          100,
        );
      }
      return {
        tone: 'danger',
        title: 'Mercy Under Suspicion',
        text: `${targetName} escapes cleanly into the mist, but an ANBU tracker spots the fresh footprints along the far bank. You escape treason charges for lack of proof, yet shadowy eyes linger on your dossier for years.`,
        checkLabel: 'Staged Extraction',
        checkPassed: false,
      };
    }

    if (optionId === 'bring_home_alive') {
      const passed = state.stats.chakra + state.stats.will + rng.int(0, 40) >= 125;
      state.stats.health -= 10;
      if (passed && target) {
        target.identity.specialStatus = 'none';
        target.identity.villageId = state.villageId;
        target.identity.roleTitle = 'Pardoned Shinobi';
        target.personality.loyal = clamp(target.personality.loyal + 22, 10, 98);
        adjustBidirectionalPlayerRel(
          state,
          target,
          { trust: 28, respect: 26, affection: 22, resentment: -25 },
          { trust: 20, affection: 20 },
          'friend',
        );
        recordEpisodicNpcMemory(target, {
          year,
          age: target.identity.age,
          tag: 'bond',
          category: 'spared_life',
          salience: 10,
          actorId: 'player',
          summary: `${state.name} dragged me back alive and refused to abandon our friendship.`,
          impact: 10,
        });
        legacy.livesSaved += 1;
        legacy.comradesBroughtHome += 1;
        legacy.quietHeroMoments.push(`Brought rogue friend ${targetName} back to ${VILLAGE_MAP[state.villageId].name} alive.`);
        state.stats.bonds += 9;
        state.stats.will += 6;
        return {
          tone: 'milestone',
          title: `Brought Home Alive: ${targetName}`,
          text: `Bruised and breathless at dawn, you shatter ${targetName}'s guard without a lethal strike and carry them through the village gates yourself. Moved by your testimony, leadership commutes their sentence to supervised service.`,
          checkLabel: 'Non-Lethal Capture',
          checkPassed: true,
        };
      }
      state.stats.will += 4;
      if (target) {
        recordEpisodicNpcMemory(target, {
          year,
          age: target.identity.age,
          tag: 'bond',
          category: 'fought_together',
          salience: 8,
          actorId: 'player',
          summary: `${state.name} fought to bring me home alive instead of killing me.`,
          impact: 6,
        });
      }
      return {
        tone: 'normal',
        title: 'Slipped Into the Fog',
        text: `Your clash tears up half a cedar ridge, yet you refuse to strike a fatal blow. Bleeding and exhausted, ${targetName} slips into the valley fog, whispering your name before vanishing.`,
        checkLabel: 'Non-Lethal Capture',
        checkPassed: false,
      };
    }

    // Refuse the scroll
    state.stats.will += 7;
    state.stats.ryo = Math.max(0, state.stats.ryo - 8);
    if (state.clanHeritage) {
      state.clanHeritage.clanStanding = clamp(state.clanHeritage.clanStanding - 8, 5, 100);
    }
    return {
      tone: 'bond',
      title: 'Refused the Red-Wax Scroll',
      text: `You set the unopened warrant back upon the ${kageTitle(state)}'s desk and accept formal reprimand and pay suspension. Your superiors call you soft; your conscience sleeps cleanly for the first time in months.`,
    };
  }

  // ---- SCENARIO C: THE ABANDONED SQUAD ----
  if (scenario === 'abandoned_squad') {
    const senseiId = String(meta?.senseiId ?? '');
    const fallenMateId = String(meta?.fallenMateId ?? '');
    const survivorMateId = String(meta?.survivorMateId ?? '');
    const senseiName = String(meta?.senseiName ?? 'Sensei');
    const fallenMateName = String(meta?.fallenMateName ?? 'your teammate');
    const survivorMateName = String(meta?.survivorMateName ?? 'your surviving teammate');

    // Mark sensei & fallen teammate dead via canonical killPerson (zero mirror syncing!)
    const senseiNpc = getPerson(state, senseiId);
    const fallenMateNpc = getPerson(state, fallenMateId);
    if (senseiNpc) {
      killPerson(state, senseiId, senseiNpc.identity.age, 'fell covering the retreat during a frontier ravine ambush');
    }
    if (fallenMateNpc) {
      killPerson(state, fallenMateId, fallenMateNpc.identity.age, 'fell covering the retreat during a frontier ravine ambush');
    }
    if (state.team) {
      for (const m of state.team.members) {
        if (m.personId === senseiId || m.personId === fallenMateId) {
          const p = getPerson(state, m.personId);
          m.fateNote = `Fell during the frontier ravine ambush at age ${p?.identity.age ?? state.age}.`;
        }
      }
      state.team.active = false;
      state.team.disbandedAge = state.age;
      state.team.disbandReason = 'tragedy';
    }

    const survivorNpc: WorldNpc | undefined = getPerson(state, survivorMateId) ?? undefined;

    const resentmentGain = optionId === 'charge_back_smoke' ? 32 : optionId === 'protocol_retreat' ? 62 : 52;
    const trustDrop = optionId === 'charge_back_smoke' ? -22 : optionId === 'protocol_retreat' ? -45 : -36;

    if (survivorNpc) {
      legacy.abandonedSurvivorNpcId = survivorNpc.identity.id;
      ensureNpcCognitionState(survivorNpc, 'L1').injury = 45;
      adjustBidirectionalPlayerRel(
        state,
        survivorNpc,
        { trust: trustDrop, affection: -24, resentment: resentmentGain },
        { resentment: 10, affection: -6 },
      );
      recordEpisodicNpcMemory(survivorNpc, {
        year,
        age: survivorNpc.identity.age,
        tag: 'loss',
        category: 'abandoned',
        salience: 10,
        actorId: 'player',
        summary: `Lost ${senseiName} and ${fallenMateName} in the ravine ambush; I cannot stop blaming ${state.name} for leaving them behind.`,
        impact: -9,
      });
    }

    legacy.unhealedScars.push(`Survived the ravine ambush that claimed ${senseiName} and ${fallenMateName}.`);
    recordMemory(state, 'loss', `Survived the ravine ambush that claimed ${senseiName} and ${fallenMateName}; ${survivorMateName} blamed you.`);

    if (optionId === 'charge_back_smoke') {
      state.stats.health -= 18;
      state.stats.will += 8;
      legacy.livesSaved += 1;
      legacy.comradesBroughtHome += 1;
      return {
        tone: 'danger',
        title: 'Carried Out Through Ash',
        text: `You dive back into the burning ravine and haul ${survivorMateName} and your fallen squadmates' headbands back across the river at terrible physical cost. Yet in the hospital ward, ${survivorMateName} stares at the ceiling and whispers that you should have fought sooner.`,
      };
    }

    if (optionId === 'protocol_retreat') {
      state.stats.intel += 5;
      state.stats.bonds -= 6;
      return {
        tone: 'danger',
        title: 'By the Book, Alone in the Rain',
        text: `You secure the intelligence scroll and force an extraction by shinobi doctrine. Command commends your discipline, while ${survivorMateName} refuses to speak a single word to you at the funeral.`,
      };
    }

    state.stats.health -= 8;
    state.stats.will += 4;
    legacy.livesSaved += 1;
    legacy.comradesBroughtHome += 1;
    return {
      tone: 'danger',
      title: 'The Sole Survivor’s Blame',
      text: `You drag ${survivorMateName} out of the collapsing gorge alive while ${senseiName} and ${fallenMateName} hold the smoke behind you. Back inside the gates, grief twists into venom: ${survivorMateName} shoves your hand away and blames you for walking out alive.`,
    };
  }

  // ---- SCENARIO C FOLLOW-UP: RECKONING ----
  if (scenario === 'abandoned_squad_reckoning') {
    const survivor = ws?.npcs.find((n) => n.identity.id === String(meta?.survivorNpcId ?? ''));
    const survivorName = survivor?.identity.name ?? String(meta?.survivorName ?? 'your former teammate');

    if (optionId === 'own_the_weight') {
      state.stats.bonds += 8;
      state.stats.will += 5;
      if (survivor) {
        adjustBidirectionalPlayerRel(
          state,
          survivor,
          { trust: 26, affection: 18, respect: 16, resentment: -38 },
          { trust: 18, affection: 14, resentment: -20 },
          'friend',
        );
        recordEpisodicNpcMemory(survivor, {
          year,
          age: survivor.identity.age,
          tag: 'bond',
          category: 'helped_ally',
          salience: 9,
          actorId: 'player',
          summary: `Made quiet peace with ${state.name} beside the memorial stone after years of bitterness.`,
          impact: 8,
        });
      }
      return {
        tone: 'bond',
        title: `Shared Rain With ${survivorName}`,
        text: `You offer no clever defense, only the truth that you still hear their voices every rainy night. ${survivorName}'s shoulders finally drop, and for the first time in years you stand side by side before the carved stone as friends again.`,
      };
    }

    if (optionId === 'honor_sacrifice') {
      const passed = state.stats.bonds + state.stats.will + rng.int(0, 30) >= 110;
      if (passed && survivor) {
        adjustBidirectionalPlayerRel(
          state,
          survivor,
          { trust: 20, respect: 24, resentment: -30 },
          { trust: 14, respect: 16 },
          'ally',
        );
      }
      state.stats.will += 5;
      return {
        tone: passed ? 'bond' : 'normal',
        title: 'An Old Wound Spoken Aloud',
        text: passed
          ? `${survivorName} listens in silence, then touches their scarred cheek and nods slowly. "Then neither of us gets to waste what they bought for us."`
          : `${survivorName} exhales sharply and turns away. "Easy to say when you are not the one who froze." The fracture stays, though the rage has cooled to tired sorrow.`,
        checkLabel: 'Reconciliation',
        checkPassed: passed,
      };
    }

    state.stats.will += 4;
    return {
      tone: 'normal',
      title: 'Two White Chrysanthemums',
      text: `You lay a single white flower beside theirs and walk back down the hillside without forcing forgiveness neither of you feels ready to claim.`,
    };
  }

  // ---- SCENARIO D: THE POLITICAL TOOL ----
  if (scenario === 'political_tool') {
    const targetVillageId = (String(meta?.targetVillageId ?? 'suna') as VillageId);
    const targetVillageName = String(meta?.targetVillageName ?? 'a rival nation');
    const clanName = String(meta?.clanName ?? 'your clan');

    if (optionId === 'play_pawn') {
      state.stats.ryo += 12;
      state.stats.bonds += 3;
      if (state.clanHeritage) {
        state.clanHeritage.clanStanding = clamp(state.clanHeritage.clanStanding + 12, 0, 100);
        state.clanHeritage.obligationsCompleted += 1;
      }
      if (ws) shiftDiplomacy(ws, state.villageId, targetVillageId, 16, year);
      legacy.unhealedScars.push(`Served as a diplomatic bargaining chip for the ${clanName} to seal the ${targetVillageName} accord.`);
      return {
        tone: 'milestone',
        title: 'Ink Dry on Borrowed Pride',
        text: `Your surname opens every closed door in ${targetVillageName}. The border accord holds and your elders beam with satisfaction, though you never forget the quiet look of the border villagers traded away in the fine print.`,
        tensionDelta: -10,
      };
    }

    if (optionId === 'subvert_quietly') {
      const passed = state.stats.intel + rng.int(0, 32) >= 64;
      if (passed) {
        state.stats.intel += 5;
        state.stats.will += 5;
        state.stats.bonds += 5;
        legacy.livesSaved += 2;
        legacy.quietHeroMoments.push(`Secretly warned and evacuated a border hamlet traded away in a ${clanName} treaty.`);
        if (ws) shiftDiplomacy(ws, state.villageId, targetVillageId, 10, year);
        return {
          tone: 'milestone',
          title: 'Two Letters in the Same Sleeve',
          text: `You stamp the formal seal in public while a disguised runner carries your coded warning ahead of the boundary patrol. By the time foreign troops arrive, the hamlet is safely evacuated and the treaty still holds.`,
          tensionDelta: -6,
          checkLabel: 'Covert Evacuation',
          checkPassed: true,
        };
      }
      state.stats.will += 4;
      if (state.clanHeritage) {
        state.clanHeritage.clanStanding = clamp(state.clanHeritage.clanStanding - 12, 0, 100);
      }
      return {
        tone: 'danger',
        title: 'Leaked Cipher',
        text: `Your courier reaches the hamlet in time to save several families, yet elders trace the cipher straight back to your seal. Your name is quietly struck from the council's inner roster.`,
        checkLabel: 'Covert Evacuation',
        checkPassed: false,
      };
    }

    state.stats.will += 8;
    state.stats.bonds += 4;
    if (state.clanHeritage) {
      state.clanHeritage.clanStanding = clamp(state.clanHeritage.clanStanding - 14, 0, 100);
      state.clanHeritage.internalFactionTension = clamp(state.clanHeritage.internalFactionTension + 14, 0, 100);
    }
    return {
      tone: 'bond',
      title: 'Refused to Be a Bargaining Chip',
      text: `Standing before both delegations, you refuse to speak the elders' rehearsed lines and condemn trading civilian homes behind closed doors. Your elders are furious, yet young shinobi from both villages remember your voice.`,
      tensionDelta: 4,
    };
  }

  // ---- SCENARIO E: THE ORDINARY SHINOBI ----
  if (scenario === 'ordinary_shinobi') {
    const comradeIds = [String(meta?.c1Id ?? ''), String(meta?.c2Id ?? ''), String(meta?.c3Id ?? '')].filter(Boolean);
    const rescuedNpcs = comradeIds
      .map((id) => ws?.npcs.find((n) => n.identity.id === id && n.identity.alive))
      .filter((n): n is WorldNpc => Boolean(n));

    const grantRescueMemory = (npcs: WorldNpc[]) => {
      for (const comrade of npcs) {
        adjustBidirectionalPlayerRel(
          state,
          comrade,
          { trust: 26, affection: 22, respect: 28, resentment: -20 },
          { trust: 18, affection: 16, respect: 16 },
          'friend',
        );
        recordEpisodicNpcMemory(comrade, {
          year,
          age: comrade.identity.age,
          tag: 'war',
          category: 'fought_together',
          salience: 10,
          actorId: 'player',
          summary: `${state.name} turned back into the collapsed pass and dragged me home alive.`,
          impact: 10,
        });
      }
    };

    if (optionId === 'bring_all_three') {
      state.stats.health -= 14;
      state.stats.will += 9;
      state.stats.bonds += 12;
      legacy.livesSaved += 3;
      legacy.comradesBroughtHome += 3;
      legacy.quietHeroMoments.push(
        `Held a collapsing mountain pass alone and brought three wounded comrades home alive at age ${state.age}.`,
      );
      grantRescueMemory(rescuedNpcs);
      recordMemory(state, 'war', `Turned back through artillery fire and brought three wounded comrades home alive.`);
      if (ws) {
        ws.villages[state.villageId].morale = clamp(ws.villages[state.villageId].morale + 6, 10, 100);
        addNpcMemory(rescuedNpcs[0] ?? ws.npcs[0], {
          year,
          age: (rescuedNpcs[0] ?? ws.npcs[0])?.identity.age ?? state.age,
          tag: 'bond',
          category: 'saved_family',
          salience: 10,
          actorId: 'player',
          summary: `Because ${state.name} refused to leave us behind, three households did not hang funeral lanterns that winter.`,
          impact: 10,
        });
      }
      return {
        tone: 'milestone',
        title: 'Three Comrades Brought Home',
        text: `No legendary bloodline answers your call, only bruised shoulders, basic earth walls, and stubborn refusal to leave anyone in the dust. By sunrise you stagger through the gates of ${VILLAGE_MAP[state.villageId].name} with all three comrades alive. No statue will bear your name, yet three families weep in gratitude at the gate.`,
      };
    }

    if (optionId === 'tactical_extraction') {
      const passed = state.stats.intel + state.stats.chakra + rng.int(0, 34) >= 105;
      const savedCount = passed ? 3 : 2;
      state.stats.health -= passed ? 5 : 10;
      state.stats.will += 6;
      state.stats.bonds += passed ? 10 : 7;
      legacy.livesSaved += savedCount;
      legacy.comradesBroughtHome += savedCount;
      legacy.quietHeroMoments.push(`Extracted ${savedCount} trapped comrades through smoke decoys at age ${state.age}.`);
      grantRescueMemory(rescuedNpcs.slice(0, savedCount));
      return {
        tone: 'milestone',
        title: passed ? 'Clean Extraction Through Smoke' : 'Two Pulled From the Ridge',
        text: passed
          ? `With three well-placed smoke decoys and a fake trail of bootprints, you fool the enemy sweepers and guide all three wounded comrades safely down the ravine and home.`
          : `Your smoke cover buys precious minutes to carry two wounded comrades clear down the gully, though the barrage forces you to leave the ridge before reaching the third.`,
        checkLabel: 'Decoy Extraction',
        checkPassed: passed,
      };
    }

    state.stats.will += 3;
    state.stats.bonds += 4;
    legacy.livesSaved += 1;
    legacy.comradesBroughtHome += 1;
    grantRescueMemory(rescuedNpcs.slice(0, 1));
    return {
      tone: 'bond',
      title: 'One Brought Back, Reinforcements Called',
      text: `You sling the nearest wounded shinobi across your back and sprint down the slope to rally border reinforcements. You did not work miracles, yet one more comrade lives to see tomorrow because you acted.`,
    };
  }

  return {
    tone: 'normal',
    title: 'A Turning Point Passes',
    text: 'The season turns quietly, leaving its mark on your road.',
  };
}
