import { CLAN_MAP } from '../data/clans';
import { GOVERNANCE_ACTIONS, type GovernanceActionId } from '../data/events-politics';
import { NINDO_MAP } from '../data/nindo';
import { GREAT_VILLAGES, kageTitle, VILLAGE_MAP } from '../data/villages';
import { addNpcMemory, recordWorldHistory } from './npc-sim';
import { clamp } from './powers';
import { adjustBidirectionalPlayerRel, getRelVector } from './relationships';
import type { SeededRng } from './rng';
import { recordTimelineEvent, revealTimelineTruth } from './timeline';
import type {
  GameState,
  PendingDecision,
  VillagePoliticsState,
  VillageSimState,
  WorldSimState,
} from './types';

export function ensureVillagePolitics(vSim: VillageSimState): VillagePoliticsState {
  if (!vSim.politics) {
    const vId = vSim.villageId;
    vSim.politics = {
      corruption: vId === 'oto' ? 48 : vId === 'suna' || vId === 'kiri' ? 32 : 20,
      factions: {
        hawks: vId === 'kumo' || vId === 'iwa' ? 36 : 24,
        doves: vId === 'konoha' || vId === 'iron' ? 32 : 20,
        elders: vId === 'kiri' || vId === 'konoha' ? 28 : 24,
        clans: vId === 'konoha' || vId === 'iwa' ? 28 : 22,
      },
      activeDirectives:
        vId === 'kiri' && vSim.academy.bloodyMistActive
          ? ['Bloody Mist Proving Edict']
          : vId === 'suna'
            ? ['Oasis Austerity Rationing']
            : vId === 'kumo'
              ? ['Alpine Vanguard Readiness']
              : ['Standard Frontier Watch'],
    };
  }
  return vSim.politics;
}

export function tickVillagePolitics(worldSim: WorldSimState, rng: SeededRng): void {
  for (const vSim of Object.values(worldSim.villages)) {
    const pol = ensureVillagePolitics(vSim);
    let corrDelta = rng.int(-2, 2);
    if (vSim.shadowOrg.influence >= 72) corrDelta += 2;
    if (vSim.daimyo.stance === 'austerity') corrDelta += 1;
    if (vSim.stability >= 75) corrDelta -= 1;
    pol.corruption = clamp(pol.corruption + corrDelta, 5, 95);

    // High corruption slowly erodes Hospital & Treasury
    if (pol.corruption >= 62) {
      vSim.treasury = clamp(vSim.treasury - 2, 10, 100);
      vSim.hospital.capacity = clamp(vSim.hospital.capacity - 1, 25, 100);
    }

    // Drift council factions subtly
    pol.factions.hawks = clamp(pol.factions.hawks + (vSim.policy === 'expansionist' ? 2 : rng.int(-1, 1)), 5, 80);
    pol.factions.doves = clamp(pol.factions.doves + (vSim.policy === 'diplomatic' ? 2 : rng.int(-1, 1)), 5, 80);
    pol.factions.elders = clamp(pol.factions.elders + (vSim.shadowOrg.influence >= 68 ? 2 : rng.int(-1, 1)), 5, 80);
    pol.factions.clans = clamp(pol.factions.clans + rng.int(-1, 2), 5, 80);
  }
}

export function canAccessGovernance(state: GameState): boolean {
  if (state.phase !== 'life' || state.specialStatus === 'missing_nin') return false;
  return (
    state.specialStatus === 'kage' ||
    state.specialStatus === 'anbu' ||
    state.rank === 'jonin' ||
    Boolean(state.clanHeritage?.isDesignatedHeir && state.age >= 16)
  );
}

export function canRunGovernanceAction(state: GameState, actionId: GovernanceActionId): boolean {
  if (!canAccessGovernance(state) || state.pending !== null) return false;
  const def = GOVERNANCE_ACTIONS.find((a) => a.id === actionId);
  if (!def) return false;
  if (state.stats.ryo < def.ryoCost) return false;
  if (state.lastGovernanceAge !== undefined && state.age - state.lastGovernanceAge < 3) return false;
  if (def.requiresKageOrJonin && state.rank !== 'jonin' && state.specialStatus !== 'kage') {
    return false;
  }
  return true;
}

export function runGovernanceAction(
  state: GameState,
  actionId: GovernanceActionId,
  rng: SeededRng,
): { ok: boolean; title: string; message: string; tensionDelta?: number } {
  if (!canRunGovernanceAction(state, actionId) || !state.worldSim) {
    return { ok: false, title: 'Governance Unavailable', message: 'Requirements or cooldown not met.' };
  }
  const def = GOVERNANCE_ACTIONS.find((a) => a.id === actionId)!;
  const vSim = state.worldSim.villages[state.villageId];
  const pol = ensureVillagePolitics(vSim);
  const vName = VILLAGE_MAP[state.villageId].name;

  state.stats.ryo = Math.max(0, state.stats.ryo - def.ryoCost);
  state.lastGovernanceAge = state.age;

  if (actionId === 'gov_anbu_intel_sweep') {
    state.stats.intel = clamp(state.stats.intel + 3, 0, 100);
    const revealed = revealTimelineTruth(
      state,
      'anbu_dossier',
      state.specialStatus === 'kage' ? 'Kage Classified Briefing' : 'ANBU Dossier Sweep',
    );
    if (revealed) {
      return {
        ok: true,
        title: 'Classified Timeline Truth Uncovered',
        message: `Your dossier sweep unsealed a hidden threat: "${revealed.truthTitle}" - ${revealed.truthSummary}`,
      };
    }
    state.world.crisisClues = Math.min(5, state.world.crisisClues + (state.world.seededCrisis !== 'none' ? 1 : 0));
    return {
      ok: true,
      title: 'ANBU Archives Audited',
      message: `Your intelligence sweep tightened ${vName}'s cipher security and turned up fresh border patterns (+3 Intel).`,
    };
  }

  if (actionId === 'gov_audit_corruption') {
    pol.corruption = clamp(pol.corruption - 12, 5, 95);
    vSim.academy.quality = clamp(vSim.academy.quality + 5, 25, 100);
    vSim.hospital.capacity = clamp(vSim.hospital.capacity + 5, 25, 100);
    pol.factions.doves = clamp(pol.factions.doves + 6, 5, 80);
    if (!pol.activeDirectives.includes('Anti-Corruption Audit')) {
      pol.activeDirectives = ['Anti-Corruption Audit', ...pol.activeDirectives.slice(0, 2)];
    }
    state.stats.will += 3;
    return {
      ok: true,
      title: 'Village Treasury Audited',
      message: `Your council audit cut embezzlement (-12 Corruption) and funneled recovered stipends into ${vName}'s Academy and Hospital (+5 each).`,
    };
  }

  if (actionId === 'gov_reconcile_clans') {
    for (const c of vSim.clans) c.loyalty = clamp(c.loyalty + 8, 10, 100);
    vSim.stability = clamp(vSim.stability + 5, 10, 100);
    pol.factions.clans = clamp(pol.factions.clans + 8, 5, 80);
    if (state.clanHeritage) {
      state.clanHeritage.internalFactionTension = clamp(state.clanHeritage.internalFactionTension - 10, 0, 100);
      state.clanHeritage.clanStanding = clamp(state.clanHeritage.clanStanding + 6, 0, 100);
    }
    state.stats.bonds += 4;
    return {
      ok: true,
      title: 'Clan Reconciliation Council',
      message: `Bringing clan heads and elders to one table raised clan loyalty (+8) and stabilized ${vName}'s internal politics.`,
    };
  }

  // gov_shift_diplomacy
  pol.factions.doves = clamp(pol.factions.doves + 10, 5, 80);
  pol.factions.hawks = clamp(pol.factions.hawks - 6, 5, 80);
  vSim.policy = 'diplomatic';
  if (!pol.activeDirectives.includes('Open Peace Charter')) {
    pol.activeDirectives = ['Open Peace Charter', ...pol.activeDirectives.slice(0, 2)];
  }
  const beforeT = state.world.tension;
  state.world.tension = clamp(state.world.tension - rng.int(5, 8), 5, 100);
  if (state.world.omenActive && state.world.tension < 65) state.world.omenActive = false;
  const deltaT = state.world.tension - beforeT;
  return {
    ok: true,
    title: 'Peace Charter Sponsored',
    message: `Your speech swung ${vName}'s council toward diplomacy, easing frontier hostility (${deltaT}% World Tension).`,
    tensionDelta: deltaT,
  };
}

/**
 * Generates mature adult Political & Village Governance dilemmas for Jonin, ANBU, Clan Heirs, and Kage.
 * Players do NOT need to be Kage to live through shinobi politics!
 */
export function pickPoliticsDecision(
  state: GameState,
  rng: SeededRng,
): PendingDecision | null {
  const worldSim = state.worldSim;
  if (!worldSim || state.specialStatus === 'missing_nin') return null;
  const eligible =
    state.rank === 'jonin' ||
    state.specialStatus === 'anbu' ||
    state.specialStatus === 'kage' ||
    (state.rank === 'chunin' && state.age >= 17 && Boolean(state.clanHeritage?.isDesignatedHeir));
  if (!eligible) return null;
  if (state.lastPoliticsAge !== undefined && state.age - state.lastPoliticsAge < 4) return null;
  if (!rng.chance(0.36)) return null;

  const vSim = worldSim.villages[state.villageId];
  const pol = ensureVillagePolitics(vSim);
  const vDef = VILLAGE_MAP[state.villageId];
  const leaderTitle = kageTitle(state);
  state.lastPoliticsAge = state.age;

  // Scenario 1: ANBU / Covert Surveillance of a LIVING Friend or Squadmate! (Not for Kage; Kage gives orders)
  const watchedFriend = worldSim.npcs.find((n) => {
    if (!n.identity.alive || n.identity.villageId !== state.villageId || n.identity.specialStatus === 'kage') return false;
    const rel = n.relationships.player;
    if (!rel) return false;
    const vec = getRelVector(rel);
    return vec.trust >= 50 || vec.affection >= 50;
  });
  if (state.specialStatus !== 'kage' && (state.specialStatus === 'anbu' || state.rank === 'jonin') && watchedFriend && rng.chance(0.45)) {
    return {
      id: `pol_watch_${watchedFriend.identity.id}_${state.age}`,
      kind: 'politics_event',
      eventId: 'pol_anbu_watch_friend',
      title: `Covert Directive: Surveillance on ${watchedFriend.identity.name}`,
      body: `A masked courier from ${vDef.institutions.shadowOrgName} places a sealed red scroll on your desk. Suspecting foreign leaks, they order you to plant a silent chakra monitor on your own comrade, ${watchedFriend.identity.name} (${watchedFriend.identity.roleTitle}), and log every person they meet.`,
      manual: true,
      meta: { polScenario: 'anbu_watch_friend', targetNpcId: watchedFriend.identity.id },
      options: [
        {
          id: 'obey_surveillance',
          label: `Obey orders and quietly plant the watch seal on ${watchedFriend.identity.name}`,
          sublabel: '+6 Intel, +10 Ryo, strengthens Elders/Shadow Org. Massive Trust/Resentment fallout if discovered!',
          statHints: ['Intel'],
          autoEligible: false,
        },
        {
          id: 'falsify_report',
          label: 'Accept the scroll but file a clean falsified report to shield your friend',
          sublabel: 'Tests Intel & Will. Protects your comrade at real political risk to yourself.',
          statHints: ['Intel', 'Will'],
          autoEligible: true,
        },
        {
          id: 'warn_friend',
          label: `Meet ${watchedFriend.identity.name} at midnight and warn them about ${vDef.institutions.shadowOrgName}`,
          sublabel: 'Huge Trust & Affection surge (+20), makes Shadow Org furious, risks political clash.',
          statHints: ['Bonds', 'Will'],
          autoEligible: true,
        },
      ],
    };
  }

  // Scenario 2: Orders vs Nindo (Jonin moral collision! Skipped for Kage who signs council orders directly)
  if (state.specialStatus !== 'kage' && state.nindo && state.rank === 'jonin' && rng.chance(0.45)) {
    const nindoDef = NINDO_MAP[state.nindo];
    const rivalNation = rng.pick(GREAT_VILLAGES.filter((v) => v.id !== state.villageId)) ?? GREAT_VILLAGES[0];
    return {
      id: `pol_nindo_${state.age}`,
      kind: 'politics_event',
      eventId: 'pol_orders_vs_nindo',
      title: `Orders Against Your Nindo (${nindoDef?.title.replace(/\{kage\}/g, leaderTitle) ?? 'Ninja Way'})`,
      body: `Hawks on the ${vDef.name} council issue a black-stamped directive: sabotage a civilian medicine convoy bound for a neutral border town near ${rivalNation.name} to squeeze their garrison. Every word collides with your sworn Nindo.`,
      manual: true,
      meta: { polScenario: 'orders_vs_nindo', rivalVillageId: rivalNation.id },
      options: [
        {
          id: 'execute_order',
          label: 'Carry out the council directive without hesitation (+14 Ryo, +Ruthless, -6 Will)',
          sublabel: 'Satisfies Hawks & Elders, stains your Nindo and spikes border hostility.',
          statHints: ['Intel'],
          autoEligible: false,
        },
        {
          id: 'subvert_order',
          label: 'Delay the convoy harmlessly so the medicine arrives intact while fulfilling the letter of the order',
          sublabel: 'Tests Intel & Will. Honors your Nindo quietly without open mutiny.',
          statHints: ['Intel', 'Will'],
          autoEligible: true,
        },
        {
          id: 'refuse_openly',
          label: `Lay the scroll back before the ${leaderTitle} and refuse the order openly`,
          sublabel: '+8 Will, +6 Bonds, shifts council toward Doves, earns Hawks resentment.',
          statHints: ['Will', 'Bonds'],
          autoEligible: true,
        },
      ],
    };
  }

  // Scenario 3: Clan Head vs Kage Standoff (when player is Kage, exclude self-overreach option)
  const strainedClan = vSim.clans.find((c) => c.loyalty < 65) ?? vSim.clans[0];
  if (strainedClan && state.specialStatus !== 'kage' && rng.chance(0.45)) {
    const cDef = CLAN_MAP[strainedClan.clanId];
    return {
      id: `pol_clan_kage_${strainedClan.clanId}_${state.age}`,
      kind: 'politics_event',
      eventId: 'pol_clan_vs_kage',
      title: `Council Standoff: ${cDef?.name ?? 'Noble Clan'} vs ${leaderTitle}`,
      body: `Shouting echoes from the council chamber. Leaders of the ${cDef?.name ?? 'house'} accuse the ${leaderTitle}'s office of restricting their autonomy while demanding frontline blood. As a senior shinobi, your voice carries real weight.`,
      manual: false,
      meta: { polScenario: 'clan_vs_kage', clanId: strainedClan.clanId },
      options: [
        {
          id: 'mediate_compromise',
          label: 'Broker a constitutional compromise granting clan oversight and unified defense',
          sublabel: 'Tests Bonds & Intel. Raises both Stability and Clan Loyalty.',
          statHints: ['Bonds', 'Intel'],
          autoEligible: true,
        },
        {
          id: 'back_clan',
          label: `Stand behind the ${cDef?.name ?? 'clan'} and check executive overreach`,
          sublabel: '+12 Clan Loyalty, +Clan Faction, lowers Kage/Elder favor.',
          statHints: ['Will', 'Bonds'],
          autoEligible: true,
        },
        {
          id: 'back_kage',
          label: `Enforce ${leaderTitle} supremacy so factional pride never fractures ${vDef.name}`,
          sublabel: '+8 Stability, +Hawks/Elders, strains clan loyalty.',
          statHints: ['Will'],
          autoEligible: true,
        },
      ],
    };
  }

  // Scenario 4: Daimyo Corruption & Embezzlement (D14: use proper countryName, never region/archipelago)
  if (pol.corruption >= 22 || rng.chance(0.5)) {
    return {
      id: `pol_corrupt_${state.age}`,
      kind: 'politics_event',
      eventId: 'pol_daimyo_corruption',
      title: `${vDef.countryName} Treasury Ministry Embezzlement`,
      body: `While reviewing supply manifests, you uncover a ring of ${vDef.countryName} officials skimming 20% of ${vDef.name}'s hospital and mission stipends into private syndicates (Village Corruption: ${pol.corruption}%).`,
      manual: false,
      meta: { polScenario: 'daimyo_corruption' },
      options: [
        {
          id: 'expose_scandal',
          label: 'Post the audited ledgers to the village notice board and force an immediate purge',
          sublabel: '-15 Corruption, +6 Will, +6 Hospital/Academy, risks brief Daimyo funding dip.',
          statHints: ['Will', 'Intel'],
          autoEligible: true,
        },
        {
          id: 'blackmail_for_village',
          label: 'Quietly corner the ministers and force them to fund the Hospital and Academy double',
          sublabel: 'Tests Intel. +10 Hospital, +10 Treasury, -8 Corruption without public chaos.',
          statHints: ['Intel'],
          autoEligible: true,
        },
        {
          id: 'take_bribe',
          label: 'Look away in exchange for a private war-chest stipend (+22 Ryo, +12 Corruption)',
          sublabel: 'Rich personal payoff at the cost of village morale and corruption.',
          statHints: ['Ryo'],
          autoEligible: false,
        },
      ],
    };
  }

  // Scenario 5: Shadow Power Struggle / Coup Crisis
  const playerIsKage = state.specialStatus === 'kage';
  return {
    id: `pol_coup_${state.age}`,
    kind: 'politics_event',
    eventId: 'pol_shadow_coup',
    title: `Midnight Power Struggle: ${vDef.institutions.shadowOrgName} Moves on the Tower`,
    body: playerIsKage
      ? `Lanterns flicker across the rooftops of ${vDef.name}. Armed cells loyal to ${vDef.institutions.shadowOrgName} and hawkish elders have surrounded your tower, demanding you step aside immediately.`
      : `Lanterns flicker across the rooftops of ${vDef.name}. Armed cells loyal to ${vDef.institutions.shadowOrgName} and hawkish elders have surrounded the council hall, demanding the ${leaderTitle} step aside immediately.`,
    manual: true,
    meta: { polScenario: 'shadow_coup' },
    options: [
      {
        id: 'defend_tower',
        label: `Stand at the steps of the ${leaderTitle} Tower and break the coup openly`,
        sublabel: 'Tests Chakra & Will. Saves village stability and earns massive Respect.',
        statHints: ['Chakra', 'Will'],
        autoEligible: true,
      },
      {
        id: 'expose_coup_dossiers',
        label: 'Leak the conspirators\' names to every clan head simultaneously to collapse their backing',
        sublabel: 'Tests Intel & Bonds. Bloodless counter-coup that curbs Shadow Org power!',
        statHints: ['Intel', 'Bonds'],
        autoEligible: true,
      },
      ...(!playerIsKage
        ? [
            {
              id: 'join_coup',
              label: 'Back the hardline coalition to seize iron control over village policy',
              sublabel: 'Shifts village to Expansionist/Shadow Ops (+12 Ryo, +Ruthless, -Stability).',
              statHints: ['Chakra'],
              autoEligible: false,
            },
          ]
        : []),
    ],
  };
}

export function resolvePoliticsDecision(
  state: GameState,
  optionId: string,
  meta: Record<string, string | number | boolean> | undefined,
  rng: SeededRng,
): {
  tone: 'normal' | 'milestone' | 'danger' | 'bond' | 'war' | 'crisis';
  title: string;
  text: string;
  checkLabel?: string;
  checkPassed?: boolean;
  tensionDelta?: number;
} {
  const worldSim = state.worldSim!;
  const vSim = worldSim.villages[state.villageId];
  const pol = ensureVillagePolitics(vSim);
  const vDef = VILLAGE_MAP[state.villageId];
  const year = state.birthYear + state.age;
  const scenario = String(meta?.polScenario ?? '');

  if (scenario === 'anbu_watch_friend') {
    const npc = worldSim.npcs.find((n) => n.identity.id === String(meta?.targetNpcId ?? ''));
    const name = npc?.identity.name ?? 'your comrade';
    if (optionId === 'obey_surveillance') {
      state.stats.intel += 6;
      state.stats.ryo += 10;
      state.leanings.ruthless += 2;
      pol.factions.elders = clamp(pol.factions.elders + 8, 5, 80);
      vSim.shadowOrg.influence = clamp(vSim.shadowOrg.influence + 6, 10, 100);
      const discovered = rng.chance(0.55);
      if (npc && discovered) {
        adjustBidirectionalPlayerRel(
          state,
          npc,
          { trust: -35, affection: -30, resentment: 45, fear: 15 },
          { trust: -10, resentment: 5 },
          'enemy',
        );
        addNpcMemory(npc, {
          year,
          age: npc.identity.age,
          tag: 'betrayal',
          summary: `Discovered ${state.name} planted a covert ${vDef.institutions.shadowOrgName} watch seal on me.`,
          actorId: 'player',
          impact: -9,
        });
      }
      return {
        tone: discovered ? 'danger' : 'normal',
        title: discovered ? `Surveillance Discovered by ${name}` : 'Silent Watch Logged',
        text: discovered
          ? `${name} detected your chakra wire at midnight and stared at you in cold disbelief. ${vDef.institutions.shadowOrgName} paid your stipend, yet your bond shattered.`
          : `You logged every movement of ${name} in silence for three months, filing a spotless intelligence ledger with ${vDef.institutions.shadowOrgName}.`,
      };
    }

    if (optionId === 'falsify_report') {
      const ok = state.stats.intel + state.stats.will + rng.int(0, 28) >= 115;
      if (ok) {
        state.stats.intel += 4;
        state.stats.will += 4;
        if (npc) adjustBidirectionalPlayerRel(state, npc, { trust: 10, respect: 10 }, { trust: 8 });
        return {
          tone: 'milestone',
          title: 'Flawless Paper Shield',
          text: `Your fabricated patrol logs satisfied ${vDef.institutions.shadowOrgName} auditors completely, quietly pulling ${name} off their watch list.`,
          checkLabel: 'Cipher Falsification',
          checkPassed: true,
        };
      }
      state.stats.ryo = Math.max(0, state.stats.ryo - 8);
      vSim.shadowOrg.influence = clamp(vSim.shadowOrg.influence + 5, 10, 100);
      return {
        tone: 'danger',
        title: 'Audit Suspicion Triggered',
        text: `A sharp ${vDef.institutions.shadowOrgName} auditor flagged discrepancies in your report, stripping your covert stipend and placing your own file under review.`,
        checkLabel: 'Cipher Falsification',
        checkPassed: false,
      };
    }

    // warn_friend
    state.stats.bonds += 6;
    state.stats.will += 5;
    pol.factions.elders = clamp(pol.factions.elders - 6, 5, 80);
    if (npc) {
      adjustBidirectionalPlayerRel(
        state,
        npc,
        { trust: 22, affection: 20, respect: 18, resentment: -20 },
        { trust: 16, affection: 14 },
        'friend',
      );
      addNpcMemory(npc, {
        year,
        age: npc.identity.age,
        tag: 'bond',
        summary: `${state.name} defied ${vDef.institutions.shadowOrgName} to warn me I was under secret surveillance.`,
        actorId: 'player',
        impact: 9,
      });
    }
    return {
      tone: 'bond',
      title: `Midnight Warning to ${name}`,
      text: `You burned the watch seal in front of ${name} beneath the cedar eaves. Shadow elders grow suspicious of you, yet ${name} swears you will always have their back.`,
    };
  }

  if (scenario === 'orders_vs_nindo') {
    if (optionId === 'execute_order') {
      state.stats.ryo += 14;
      state.stats.will = Math.max(5, state.stats.will - 6);
      state.leanings.ruthless += 2;
      pol.factions.hawks = clamp(pol.factions.hawks + 8, 5, 80);
      recordTimelineEvent(state, worldSim, {
        category: 'covert',
        villageIds: [state.villageId],
        truthTitle: `Covert Sabotage of Neutral Medicine Convoy`,
        truthSummary: `${vDef.name} operatives destroyed a border medicine convoy under sealed hawkish orders.`,
        rumorTitle: `Rumor: Bandits Burned Border Medicine Wagons`,
        rumorSummary: `Border towns blame nameless bandits for torched medicine wagons along the frontier pass.`,
        isSecret: true,
        immediateChannel: 'anbu_dossier',
        sourceLabel: 'Personal Black-Ops Record',
      });
      return {
        tone: 'war',
        title: 'Orders Obeyed, Nindo Scarred',
        text: 'Smoke curls over the ruined medicine wagons. The council hawks praise your ruthlessness, though your own reflection feels colder.',
        tensionDelta: 6,
      };
    }
    if (optionId === 'subvert_order') {
      const ok = state.stats.intel + state.stats.will + rng.int(0, 28) >= 112;
      state.stats.will += ok ? 6 : 2;
      state.stats.intel += 4;
      return {
        tone: ok ? 'milestone' : 'normal',
        title: ok ? 'Quiet Subversion Succeeded' : 'Tense Debriefing',
        text: ok
          ? 'By staging a brief rockslide and routing the wagons safely around the gorge, you fulfilled the scroll\'s letter without spilling innocent blood.'
          : 'The medicine reached the town safely, though hawkish elders grilled you for hours over the suspiciously light damage.',
        checkLabel: 'Tactical Subversion',
        checkPassed: ok,
      };
    }
    state.stats.will += 8;
    state.stats.bonds += 6;
    pol.factions.doves = clamp(pol.factions.doves + 10, 5, 80);
    pol.factions.hawks = clamp(pol.factions.hawks - 6, 5, 80);
    return {
      tone: 'bond',
      title: 'Refused an Unjust Order',
      text: `You set the red-stamped scroll back onto the council table without blinking. Hawks hiss at your defiance, while younger Jonin rally around your unyielding Nindo.`,
      tensionDelta: -4,
    };
  }

  if (scenario === 'clan_vs_kage') {
    const clanId = String(meta?.clanId ?? '');
    const cSim = vSim.clans.find((c) => c.clanId === clanId);
    const cName = CLAN_MAP[clanId]?.name ?? 'the clan';
    if (optionId === 'mediate_compromise') {
      const ok = state.stats.bonds + state.stats.intel + rng.int(0, 28) >= 110;
      if (ok) {
        if (cSim) cSim.loyalty = clamp(cSim.loyalty + 12, 10, 100);
        vSim.stability = clamp(vSim.stability + 8, 10, 100);
        state.stats.bonds += 6;
        state.stats.intel += 4;
        return {
          tone: 'milestone',
          title: `Accord Signed with ${cName}`,
          text: `Your mediation bridged the rift between ${cName} and the ${vDef.kageTitle}, securing joint representation and steadying ${vDef.name}.`,
          checkLabel: 'Council Mediation',
          checkPassed: true,
        };
      }
      vSim.stability = clamp(vSim.stability - 4, 10, 100);
      return {
        tone: 'normal',
        title: 'Fragile Truce in the Chamber',
        text: `Neither side fully accepted your terms, yet your calm voice prevented blades from clearing their sheaths today.`,
        checkLabel: 'Council Mediation',
        checkPassed: false,
      };
    }
    if (optionId === 'back_clan') {
      if (cSim) cSim.loyalty = clamp(cSim.loyalty + 14, 10, 100);
      pol.factions.clans = clamp(pol.factions.clans + 10, 5, 80);
      state.stats.bonds += 4;
      state.stats.will += 4;
      return {
        tone: 'bond',
        title: `Stood with ${cName}`,
        text: `Your backing forced the council to respect ${cName}'s charter, cementing clan loyalty across the district.`,
      };
    }
    vSim.stability = clamp(vSim.stability + 8, 10, 100);
    if (cSim) cSim.loyalty = clamp(cSim.loyalty - 8, 10, 100);
    pol.factions.elders = clamp(pol.factions.elders + 8, 5, 80);
    state.stats.will += 5;
    return {
      tone: 'war',
      title: `Upheld ${vDef.kageTitle} Authority`,
      text: `You stood firmly behind unified village command, forcing ${cName} to stand down for now.`,
    };
  }

  if (scenario === 'daimyo_corruption') {
    if (optionId === 'expose_scandal') {
      pol.corruption = clamp(pol.corruption - 15, 5, 95);
      vSim.hospital.capacity = clamp(vSim.hospital.capacity + 6, 25, 100);
      vSim.academy.quality = clamp(vSim.academy.quality + 6, 25, 100);
      vSim.daimyo.funding = clamp(vSim.daimyo.funding - 5, 20, 98);
      state.stats.will += 6;
      recordWorldHistory(worldSim, {
        year,
        layer: 'village',
        title: `Anti-Corruption Purge in ${vDef.name}`,
        summary: `${state.name} exposed Daimyo embezzlement, restoring hospital and academy stipends.`,
        villageId: state.villageId,
        tone: 'milestone',
      });
      return {
        tone: 'milestone',
        title: 'Corruption Exposed in Daylight',
        text: `The scandal forced corrupt ministers from office (-15 Corruption), restoring vital funds to ${vDef.name}'s hospital and academy.`,
      };
    }
    if (optionId === 'blackmail_for_village') {
      const ok = state.stats.intel + rng.int(0, 30) >= 70;
      if (ok) {
        pol.corruption = clamp(pol.corruption - 8, 5, 95);
        vSim.hospital.capacity = clamp(vSim.hospital.capacity + 10, 25, 100);
        vSim.treasury = clamp(vSim.treasury + 10, 15, 98);
        state.stats.intel += 5;
        return {
          tone: 'milestone',
          title: 'Quiet Restitution Secured',
          text: `Faced with your sealed audit copies, the ministers quietly doubled funding for ${vDef.name}'s hospital and treasury.`,
          checkLabel: 'Political Leverage',
          checkPassed: true,
        };
      }
      state.stats.ryo = Math.max(0, state.stats.ryo - 6);
      return {
        tone: 'danger',
        title: 'Ministers Covered Their Tracks',
        text: 'Before you could spring the trap, the syndicate burned the ledgers and froze your expense allowances.',
        checkLabel: 'Political Leverage',
        checkPassed: false,
      };
    }
    state.stats.ryo += 22;
    state.leanings.ruthless += 2;
    pol.corruption = clamp(pol.corruption + 12, 5, 95);
    vSim.morale = clamp(vSim.morale - 6, 10, 100);
    return {
      tone: 'normal',
      title: 'Gold in a Dark Envelope',
      text: 'You pocketed the heavy ryo vouchers and closed the ledger, letting rot deepen quietly inside the ministry.',
    };
  }

  // shadow_coup
  if (optionId === 'defend_tower') {
    const ok = state.stats.chakra + state.stats.will + rng.int(0, 32) >= 125;
    if (ok) {
      vSim.stability = clamp(vSim.stability + 12, 10, 100);
      vSim.shadowOrg.influence = clamp(vSim.shadowOrg.influence - 14, 10, 100);
      state.stats.will += 7;
      state.stats.bonds += 6;
      recordWorldHistory(worldSim, {
        year,
        layer: 'village',
        title: `Coup Crushed at ${vDef.name} Tower`,
        summary:
          state.specialStatus === 'kage'
            ? `${state.name} personally crushed a midnight ${vDef.institutions.shadowOrgName} coup attempt against the ${vDef.kageTitle} Tower.`
            : `${state.name} repelled a midnight ${vDef.institutions.shadowOrgName} coup attempt and saved the sitting ${vDef.kageTitle}.`,
        villageId: state.villageId,
        tone: 'milestone',
      });
      return {
        tone: 'milestone',
        title: 'Midnight Coup Shattered',
        text: `Standing across the tower stairs, you broke the shadow vanguard before dawn. Every clan in ${vDef.name} speaks your name with awe.`,
        checkLabel: 'Tower Defense Clash',
        checkPassed: true,
      };
    }
    state.stats.health = Math.max(8, state.stats.health - 14);
    vSim.stability = clamp(vSim.stability - 8, 10, 100);
    return {
      tone: 'danger',
      title: 'Bloody Stalemate on the Steps',
      text: 'You took heavy wounds holding the stairway until loyal garrisons finally forced the conspirators back into the fog.',
      checkLabel: 'Tower Defense Clash',
      checkPassed: false,
    };
  }
  if (optionId === 'expose_coup_dossiers') {
    const ok = state.stats.intel + state.stats.bonds + rng.int(0, 30) >= 118;
    vSim.shadowOrg.influence = clamp(vSim.shadowOrg.influence - (ok ? 16 : 6), 10, 100);
    vSim.stability = clamp(vSim.stability + (ok ? 10 : 2), 10, 100);
    state.stats.intel += 5;
    return {
      tone: ok ? 'milestone' : 'normal',
      title: ok ? 'Bloodless Counter-Coup' : 'Conspirators Scattered',
      text: ok
        ? `Simultaneous messenger hawks exposed every conspirator to the clan heads before midnight, collapsing the coup without a single drop of blood.`
        : `Half the conspirators fled before clan guards closed the gates, leaving lingering distrust across the council.`,
      checkLabel: 'Counter-Intel Leak',
      checkPassed: ok,
    };
  }

  vSim.policy = 'shadow_ops';
  vSim.shadowOrg.influence = clamp(vSim.shadowOrg.influence + 16, 10, 100);
  vSim.stability = clamp(vSim.stability - 10, 10, 100);
  pol.factions.elders = clamp(pol.factions.elders + 14, 5, 80);
  state.stats.ryo += 12;
  state.leanings.ruthless += 3;
  return {
    tone: 'crisis',
    title: 'Iron Regime Installed',
    text: `You stepped aside as ${vDef.institutions.shadowOrgName} seized the council chamber, binding ${vDef.name} to ruthless shadow governance.`,
    tensionDelta: 8,
  };
}
