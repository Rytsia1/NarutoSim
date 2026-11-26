import { VILLAGE_CRISIS_COPY } from '../data/events-world';
import { GREAT_VILLAGES, INITIAL_DIPLOMACY_SCORES, VILLAGES, VILLAGE_MAP } from '../data/villages';
import {
  addNpcMemory,
  recordWorldHistory,
  seedInitialWorldNpcs,
  setPlayerRelation,
  tickAutonomousNpcs,
  triggerNpcDefection,
  type WorldDispatch,
} from './npc-sim';
import { ensureVillagePopulation, rebalanceNpcLodTiers } from './npc/lod-population';
import { clamp } from './powers';
import { ensureVillagePolitics, tickVillagePolitics } from './politics';
import { ensureRel6Defaults } from './relationships';
import { SeededRng } from './rng';
import { seedInitialTimeline, tickLivingTimeline } from './timeline';
import type {
  DiplomacyEdge,
  GameState,
  PendingDecision,
  VillageId,
  VillageSimState,
  WorldNpc,
  WorldSimState,
} from './types';
import {
  buildInitialVillageSim,
  getVillageInstitutionalModifiers,
  tickVillageOrgLayer,
  type VillageInstitutionalModifiers,
} from './village/institutions';
import {
  buildInitialTerritories,
  getDiplomacyEdge,
  getDiplomacyKey,
  scoreToDiplomacyStatus,
  shiftDiplomacy,
  tickWorldLayer,
} from './world/geopolitics';

export {
  buildInitialTerritories,
  buildInitialVillageSim,
  getDiplomacyEdge,
  getDiplomacyKey,
  getVillageInstitutionalModifiers,
  scoreToDiplomacyStatus,
  shiftDiplomacy,
  tickVillageOrgLayer,
  tickWorldLayer,
  type VillageInstitutionalModifiers,
};

export function initWorldSim(state: GameState, rng: SeededRng): WorldSimState {
  const startYear = state.birthYear + state.age;
  const villages = {} as Record<VillageId, VillageSimState>;
  for (const v of VILLAGES) {
    villages[v.id] = buildInitialVillageSim(v.id);
  }

  const diplomacy: Record<string, DiplomacyEdge> = {};
  const greatIds = GREAT_VILLAGES.map((v) => v.id);
  for (let i = 0; i < greatIds.length; i++) {
    for (let j = i + 1; j < greatIds.length; j++) {
      const key = getDiplomacyKey(greatIds[i], greatIds[j]);
      diplomacy[key] = {
        a: greatIds[i] < greatIds[j] ? greatIds[i] : greatIds[j],
        b: greatIds[i] < greatIds[j] ? greatIds[j] : greatIds[i],
        score: 0,
        status: 'neutral',
        lastChangedYear: startYear,
      };
    }
  }
  for (const [a, b, score] of INITIAL_DIPLOMACY_SCORES) {
    const key = getDiplomacyKey(a, b);
    const [first, second] = a < b ? [a, b] : [b, a];
    diplomacy[key] = {
      a: first,
      b: second,
      score,
      status: scoreToDiplomacyStatus(score),
      lastChangedYear: startYear,
    };
  }

  const worldSim: WorldSimState = {
    economy: 64,
    economyTrend: 'stable',
    diplomacy,
    territories: buildInitialTerritories(),
    activeDisasters: [],
    villages,
    npcs: [],
    history: [],
    nextNpcSeq: 1,
    lastEmergentAge: -5,
  };

  seedInitialWorldNpcs(state, worldSim, rng);
  for (const v of Object.values(worldSim.villages)) {
    ensureVillagePolitics(v);
    ensureVillagePopulation(v);
  }
  rebalanceNpcLodTiers(state, worldSim);
  seedInitialTimeline(state, worldSim, rng);

  recordWorldHistory(worldSim, {
    year: startYear,
    layer: 'world',
    title: 'Dawn of a New Shinobi Era',
    summary: `The Five Great Nations maintain a fragile balance across contested borders while ${VILLAGE_MAP[state.villageId].name} shapes the next generation.`,
    villageId: state.villageId,
    tone: 'milestone',
  });

  return worldSim;
}

/**
 * Legacy save migration hook: cleanly initializes worldSim if missing from an older save.
 */
export function ensureWorldSimDefaults(state: GameState): WorldSimState {
  if (!state.worldSim) {
    const rng = new SeededRng((state.rng.seed ^ 0x51a7b3) >>> 0);
    state.worldSim = initWorldSim(state, rng);
    if (state.specialStatus === 'kage') {
      state.worldSim.villages[state.villageId].kageNpcId = 'player';
    }
  }
  for (const v of Object.values(state.worldSim.villages)) {
    ensureVillagePolitics(v);
    ensureVillagePopulation(v);
  }
  rebalanceNpcLodTiers(state, state.worldSim);
  if (!state.worldSim.timeline || state.worldSim.timeline.length === 0) {
    const tRng = new SeededRng((state.rng.seed ^ 0x9931a) >>> 0);
    seedInitialTimeline(state, state.worldSim, tRng);
  }
  if (!state.missionConsequences) state.missionConsequences = [];
  ensureRel6Defaults(state);
  return state.worldSim;
}


/**
 * Orchestrates the complete yearly 3-Layer Autonomous World Simulation tick:
 * Layer 1 (World) -> Layer 2 (Villages & Organizations) -> Layer 3 (Individual NPCs)
 * Returns at most 2 highest-priority curated dispatches for the player Chronicle.
 */
export function tickAutonomousWorldYear(
  state: GameState,
  rng: SeededRng,
): { dispatches: WorldDispatch[]; tensionDelta: number } {
  const worldSim = ensureWorldSimDefaults(state);

  if (state.specialStatus === 'kage') {
    worldSim.villages[state.villageId].kageNpcId = 'player';
  }

  const layer1 = tickWorldLayer(state, worldSim, rng);
  const layer2 = tickVillageOrgLayer(state, worldSim, rng);
  tickVillagePolitics(worldSim, rng);
  const layer3 = tickAutonomousNpcs(state, worldSim, rng);
  const timelineDispatches = tickLivingTimeline(state, worldSim, rng);

  ensureRel6Defaults(state);

  const allDispatches = [...layer1.dispatches, ...layer2, ...layer3, ...timelineDispatches];
  allDispatches.sort((a, b) => b.priority - a.priority);

  // Keep Chronicle signal-to-noise clean: max 2 dispatches per year
  const curated = allDispatches.slice(0, 2);
  return { dispatches: curated, tensionDelta: layer1.tensionDelta };
}

/**
 * Player -> Village & World bidirectional feedback bridge.
 */
export function applyPlayerActionToWorldSim(
  state: GameState,
  action:
    | { type: 'kage_ascend' }
    | { type: 'kage_decree'; decree: 'decree_peace' | 'decree_academy' | 'decree_fortress' | 'decree_shadow' }
    | { type: 'diplomatic_summit'; drop: number }
    | { type: 'diplomatic_mission'; drop: number }
    | { type: 'player_defect' }
    | { type: 'war_ended'; outcome: 'victor' | 'shared' | 'survived' | 'withdrew' | 'deserted' | 'dead' },
): void {
  const worldSim = ensureWorldSimDefaults(state);
  const year = state.birthYear + state.age;
  const myVillage = worldSim.villages[state.villageId];
  const myName = VILLAGE_MAP[state.villageId].name;

  if (action.type === 'kage_ascend') {
    const oldKage = worldSim.npcs.find((n) => n.identity.id === myVillage.kageNpcId);
    if (oldKage && oldKage.identity.alive) {
      oldKage.identity.specialStatus = 'none';
      oldKage.identity.roleTitle = `Retired ${VILLAGE_MAP[state.villageId].kageTitle}`;
      setPlayerRelation(oldKage, state.name, 'ally', 25, 25, 0);
    }
    myVillage.kageNpcId = 'player';
    myVillage.stability = clamp(myVillage.stability + 8, 10, 100);
    myVillage.morale = clamp(myVillage.morale + 10, 10, 100);
    recordWorldHistory(worldSim, {
      year,
      layer: 'village',
      title: `${state.name} Inaugurated as ${VILLAGE_MAP[state.villageId].kageTitle}`,
      summary: `${state.name} took the ${VILLAGE_MAP[state.villageId].kageTitle} hat of ${myName}, ushering in a new political era.`,
      villageId: state.villageId,
      tone: 'milestone',
    });
    return;
  }

  if (action.type === 'kage_decree') {
    if (action.decree === 'decree_peace') {
      myVillage.policy = 'diplomatic';
      for (const g of GREAT_VILLAGES) {
        if (g.id !== state.villageId) shiftDiplomacy(worldSim, state.villageId, g.id, 18, year);
      }
      if (state.villageId === 'kiri') myVillage.academy.bloodyMistActive = false;
    } else if (action.decree === 'decree_academy') {
      myVillage.academy.quality = clamp(myVillage.academy.quality + 14, 10, 100);
      myVillage.hospital.capacity = clamp(myVillage.hospital.capacity + 10, 10, 100);
      myVillage.academy.bloodyMistActive = false;
      for (const c of myVillage.clans) c.loyalty = clamp(c.loyalty + 8, 10, 100);
    } else if (action.decree === 'decree_fortress') {
      myVillage.policy = 'expansionist';
      myVillage.military = clamp(myVillage.military + 14, 10, 100);
      myVillage.daimyo.favor = clamp(myVillage.daimyo.favor + 10, 10, 100);
    } else if (action.decree === 'decree_shadow') {
      myVillage.policy = 'shadow_ops';
      myVillage.anbu.strength = clamp(myVillage.anbu.strength + 14, 10, 100);
      myVillage.shadowOrg.influence = clamp(myVillage.shadowOrg.influence + 10, 10, 100);
    }
    return;
  }

  if (action.type === 'diplomatic_summit' || action.type === 'diplomatic_mission') {
    const boost = action.type === 'diplomatic_summit' ? 18 : 10;
    const neighbors = GREAT_VILLAGES.filter((v) => v.id !== state.villageId);
    // Prioritize improving the most hostile relationship
    neighbors.sort((a, b) => {
      const sa = getDiplomacyEdge(worldSim, state.villageId, a.id)?.score ?? 0;
      const sb = getDiplomacyEdge(worldSim, state.villageId, b.id)?.score ?? 0;
      return sa - sb;
    });
    if (neighbors[0]) {
      shiftDiplomacy(worldSim, state.villageId, neighbors[0].id, boost, year);
    }
    if (action.type === 'diplomatic_summit' && neighbors[1]) {
      shiftDiplomacy(worldSim, state.villageId, neighbors[1].id, Math.round(boost * 0.7), year);
      recordWorldHistory(worldSim, {
        year,
        layer: 'world',
        title: `Five-Nation Summit Convened by ${state.name}`,
        summary: `Diplomatic talks brokered by ${state.name} cooled tensions (-${action.drop}%) and restored border channels.`,
        villageId: state.villageId,
        tone: 'bond',
      });
    }
    return;
  }

  if (action.type === 'player_defect') {
    myVillage.stability = clamp(myVillage.stability - 8, 10, 100);
    myVillage.anbu.activeOp = `Hunting Missing-Nin ${state.name}`;
    if (state.clanId) {
      const cs = myVillage.clans.find((c) => c.clanId === state.clanId);
      if (cs) cs.loyalty = clamp(cs.loyalty - 12, 10, 100);
    }
    recordWorldHistory(worldSim, {
      year,
      layer: 'npc',
      title: `${state.name} Branded a Missing-Nin`,
      summary: `${state.name} abandoned ${myName}, shaking village trust and triggering Hunter-Nin pursuit.`,
      villageId: state.villageId,
      tone: 'danger',
    });
    return;
  }

  if (action.type === 'war_ended') {
    if (action.outcome === 'victor' || action.outcome === 'shared') {
      myVillage.morale = clamp(myVillage.morale + 10, 10, 100);
      myVillage.military = clamp(myVillage.military + 6, 10, 100);
      if (action.outcome === 'shared') {
        for (const g of GREAT_VILLAGES) {
          if (g.id !== state.villageId) shiftDiplomacy(worldSim, state.villageId, g.id, 12, year);
        }
      }
    } else if (action.outcome === 'dead' || action.outcome === 'withdrew') {
      myVillage.morale = clamp(myVillage.morale - 6, 10, 100);
    }
  }
}

/**
 * Dynamically builds a state-driven Emergent World/NPC Decision directly from live 3-layer state.
 */
export function pickEmergentWorldDecision(
  state: GameState,
  rng: SeededRng,
): PendingDecision | null {
  const worldSim = state.worldSim;
  if (!worldSim || state.age < 13 || state.rank === 'civilian' || state.rank === 'academy') return null;
  if (state.age - worldSim.lastEmergentAge < 4) return null;
  if (!rng.chance(0.32)) return null;

  const myVillage = worldSim.villages[state.villageId];
  const vDef = VILLAGE_MAP[state.villageId];

  // Candidate 1: An autonomous NPC in your village is on the brink of defecting!
  const defectingNpc = worldSim.npcs.find(
    (n) =>
      n.identity.alive &&
      n.identity.villageId === state.villageId &&
      n.identity.specialStatus !== 'missing_nin' &&
      n.identity.specialStatus !== 'kage' &&
      (n.currentGoal.type === 'defect_village' || n.personality.loyal < 38),
  );
  if (defectingNpc && rng.chance(0.55)) {
    worldSim.lastEmergentAge = state.age;
    const latestMem = defectingNpc.memory[defectingNpc.memory.length - 1]?.summary ?? 'years of mounting pressure';
    return {
      id: `em_defect_${defectingNpc.identity.id}_${state.age}`,
      kind: 'world_emergent',
      eventId: 'em_npc_defection_brink',
      title: `Footsteps at the Gate: ${defectingNpc.identity.name}`,
      body: `Rain taps against the outer gate of ${vDef.name}. You intercept ${defectingNpc.identity.name} (${defectingNpc.identity.roleTitle}) with a packed travel scroll and a loosened forehead protector. Still haunted by "${latestMem}", they whisper that this village has nothing left for them.`,
      manual: false,
      meta: { scenario: 'em_npc_defection_brink', npcId: defectingNpc.identity.id },
      options: [
        {
          id: 'persuade_stay',
          label: `Appeal to ${defectingNpc.identity.name}'s Nindo and persuade them to stay`,
          sublabel: 'Tests Bonds & Will. Success restores their loyalty and forges a deep bond.',
          statHints: ['Bonds', 'Will'],
          autoEligible: true,
        },
        {
          id: 'report_anbu',
          label: `Signal ${vDef.institutions.shadowOrgName} and block their escape`,
          sublabel: 'Tests Chakra & Intel. Protects village security, but turns them into a bitter enemy.',
          statHints: ['Chakra', 'Intel'],
          autoEligible: true,
        },
        {
          id: 'let_go',
          label: 'Lower your guard and let them disappear into the trees',
          sublabel: 'They become a Missing-Nin, remembering your mercy if you meet again.',
          statHints: ['Will'],
          autoEligible: false,
        },
      ],
    };
  }

  // Candidate 2: A living NPC holding a secret (Knowledge) approaches you!
  const secretHolder = worldSim.npcs.find(
    (n) =>
      n.identity.alive &&
      n.identity.villageId === state.villageId &&
      n.identity.specialStatus !== 'missing_nin' &&
      n.knowledge.some((k) => k.secret),
  );
  if (secretHolder && rng.chance(0.5)) {
    const secret = secretHolder.knowledge.find((k) => k.secret)!;
    worldSim.lastEmergentAge = state.age;
    return {
      id: `em_secret_${secretHolder.identity.id}_${state.age}`,
      kind: 'world_emergent',
      eventId: 'em_shadow_secret_leak',
      title: `Secret Intelligence from ${secretHolder.identity.name}`,
      body: `${secretHolder.identity.name} (${secretHolder.identity.roleTitle}) pulls you into a quiet tea stall and slides a sealed cipher across the wood: "${secret.detail}" Their eyes search yours before deciding what happens next.`,
      manual: false,
      meta: { scenario: 'em_shadow_secret_leak', npcId: secretHolder.identity.id, knowledgeId: secret.id },
      options: [
        {
          id: 'expose_council',
          label: `Deliver the evidence directly to the ${vDef.kageTitle} and Clan Council`,
          sublabel: 'Curbs Shadow Org overreach, boosts clan loyalty & Intel, but draws covert enemies.',
          statHints: ['Intel', 'Bonds'],
          autoEligible: true,
        },
        {
          id: 'leverage_shadow',
          label: `Trade the cipher with ${vDef.institutions.shadowOrgName} for quiet backing`,
          sublabel: 'Gains Ryo, Intel & covert leverage (+Ruthless), strengthening Shadow influence.',
          statHints: ['Intel', 'Ryo'],
          autoEligible: true,
        },
        {
          id: 'burn_scroll',
          label: 'Burn the cipher in the brazier to prevent civil bloodshed',
          sublabel: 'Stabilizes immediate village calm (+Will, +Trust with informant).',
          statHints: ['Will'],
          autoEligible: true,
        },
      ],
    };
  }

  // Candidate 3: Encounter an Autonomous Missing-Nin on patrol!
  const roamingRogue = worldSim.npcs.find(
    (n) => n.identity.alive && n.identity.specialStatus === 'missing_nin',
  );
  if (roamingRogue && rng.chance(0.5)) {
    worldSim.lastEmergentAge = state.age;
    const originName = VILLAGE_MAP[roamingRogue.identity.homeVillageId].name;
    const rogueMem = roamingRogue.memory.find((m) => m.tag === 'defection')?.summary ?? `fled ${originName}`;
    return {
      id: `em_rogue_${roamingRogue.identity.id}_${state.age}`,
      kind: 'world_emergent',
      eventId: 'em_missing_nin_crossroads',
      title: `Bingo Book Crossroads: ${roamingRogue.identity.name}`,
      body: `Along a mist-soaked cedar road outside the border, you come face-to-face with Missing-Nin ${roamingRogue.identity.name} (formerly of ${originName}, Power ${roamingRogue.identity.powerScore}). Word says they ${rogueMem.toLowerCase()}. Their hand rests calmly near a kunai pouch.`,
      manual: false,
      meta: { scenario: 'em_missing_nin_crossroads', npcId: roamingRogue.identity.id },
      options: [
        {
          id: 'engage_rogue',
          label: `Draw steel and attempt to capture or eliminate ${roamingRogue.identity.name}`,
          sublabel: 'Tests Chakra & Will. High bounty & village prestige, real risk of wounds.',
          statHints: ['Chakra', 'Will'],
          autoEligible: true,
        },
        {
          id: 'trade_intel',
          label: 'Hold fire and trade frontier intelligence before parting ways',
          sublabel: 'Gains Intel & Crisis Clues; builds cautious respect with the rogue.',
          statHints: ['Intel'],
          autoEligible: true,
        },
        {
          id: 'withdraw_quietly',
          label: 'Back away slowly and log their coordinates for border command',
          sublabel: 'Safe option (+3 Intel, updates village ANBU intel).',
          statHints: ['Intel', 'Will'],
          autoEligible: true,
        },
      ],
    };
  }

  // Candidate 4: Active Regional Disaster in player's village
  const localDisaster = worldSim.activeDisasters.find((d) => d.villageId === state.villageId);
  if (localDisaster) {
    worldSim.lastEmergentAge = state.age;
    return {
      id: `em_disaster_${localDisaster.id}_${state.age}`,
      kind: 'world_emergent',
      eventId: 'em_disaster_flashpoint',
      title: `Crisis in ${vDef.name}: ${localDisaster.title}`,
      body: `${localDisaster.title} has pushed ${vDef.name}'s hospital wards (Capacity ${myVillage.hospital.capacity}) and emergency stores to the brink. Shinobi of every rank are called to hold the village together.`,
      manual: false,
      meta: { scenario: 'em_disaster_flashpoint', disasterId: localDisaster.id },
      options: [
        {
          id: 'aid_hospital',
          label: 'Pour chakra into triage, shelters, and supply convoys',
          sublabel: 'Strengthens Village Hospital & Morale (+6 Bonds, +4 Will, -4 Health).',
          statHints: ['Bonds', 'Will'],
          autoEligible: true,
        },
        {
          id: 'guard_borders',
          label: 'Patrol the weakened perimeter against opportunistic rival raids',
          sublabel: 'Protects village stability & deters neighbors (+4 Intel, +6 Ryo).',
          statHints: ['Intel', 'Chakra'],
          autoEligible: true,
        },
      ],
    };
  }

  // Candidate 5: Village-Specific Institutional & Clan Flashpoint!
  const crisisCopy = VILLAGE_CRISIS_COPY[state.villageId];
  if (crisisCopy && rng.chance(0.45)) {
    worldSim.lastEmergentAge = state.age;
    return {
      id: `em_village_crisis_${state.villageId}_${state.age}`,
      kind: 'world_emergent',
      eventId: 'em_village_institution_crisis',
      title: crisisCopy.title,
      body: crisisCopy.body,
      manual: false,
      meta: { scenario: 'em_village_institution_crisis' },
      options: [
        {
          id: 'stance_reform',
          label: crisisCopy.reformLabel,
          statHints: ['Bonds', 'Will'],
          autoEligible: true,
        },
        {
          id: 'stance_hardline',
          label: crisisCopy.hardlineLabel,
          statHints: ['Chakra', 'Will'],
          autoEligible: true,
        },
        {
          id: 'stance_shadow',
          label: crisisCopy.shadowLabel,
          statHints: ['Intel'],
          autoEligible: true,
        },
      ],
    };
  }

  return null;
}

export function resolveEmergentWorldDecision(
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
  cluesDelta?: number;
} {
  const worldSim = ensureWorldSimDefaults(state);
  const year = state.birthYear + state.age;
  const scenario = String(meta?.scenario ?? '');
  const npcId = String(meta?.npcId ?? '');
  const npc: WorldNpc | undefined = worldSim.npcs.find((n) => n.identity.id === npcId);
  const myVillage = worldSim.villages[state.villageId];
  const vDef = VILLAGE_MAP[state.villageId];

  if (scenario === 'em_npc_defection_brink' && npc) {
    if (optionId === 'persuade_stay') {
      const passed = state.stats.bonds + state.stats.will + rng.int(0, 30) >= 120;
      if (passed) {
        npc.personality.loyal = clamp(npc.personality.loyal + 22, 5, 98);
        npc.currentGoal = {
          type: 'protect_clan',
          label: `Rebuild trust inside ${vDef.name}`,
          progress: 20,
          startedAge: npc.identity.age,
        };
        setPlayerRelation(npc, state.name, 'friend', 35, 30, -15);
        addNpcMemory(npc, {
          year,
          age: npc.identity.age,
          tag: 'bond',
          summary: `${state.name} stopped me at the outer gate and restored my resolve to stay.`,
          actorId: 'player',
          impact: 8,
        });
        state.stats.bonds += 6;
        state.stats.will += 4;
        myVillage.stability = clamp(myVillage.stability + 4, 10, 100);
        return {
          tone: 'bond',
          title: `Oath Renewed: ${npc.identity.name}`,
          text: `Your words cut through ${npc.identity.name}'s bitterness. Slowly, they retie their ${vDef.name} headband and walk back through the gate beside you.`,
          checkLabel: 'Bonds & Will Persuasion',
          checkPassed: true,
        };
      }
      const d: WorldDispatch[] = [];
      triggerNpcDefection(npc, 'rejected your plea at the outer gate', state, worldSim, d);
      setPlayerRelation(npc, state.name, 'rival', -15, -10, 15);
      state.stats.will += 2;
      return {
        tone: 'danger',
        title: `${npc.identity.name} Vanished into the Rain`,
        text: `${npc.identity.name} shook their head quietly and leaped into the canopy, leaving ${vDef.name} behind as a Missing-Nin.`,
        checkLabel: 'Bonds & Will Persuasion',
        checkPassed: false,
      };
    }

    if (optionId === 'report_anbu') {
      const passed = state.stats.chakra + state.stats.intel + rng.int(0, 28) >= 115;
      if (passed) {
        npc.personality.loyal = clamp(npc.personality.loyal - 10, 5, 98);
        npc.currentGoal = {
          type: 'master_art',
          label: 'Bide time under ANBU probation',
          progress: 10,
          startedAge: npc.identity.age,
        };
        setPlayerRelation(npc, state.name, 'enemy', -45, -40, 55);
        addNpcMemory(npc, {
          year,
          age: npc.identity.age,
          tag: 'betrayal',
          summary: `${state.name} turned me over to ${vDef.institutions.shadowOrgName} at the gate.`,
          actorId: 'player',
          impact: -9,
        });
        myVillage.anbu.readiness = clamp(myVillage.anbu.readiness + 6, 10, 100);
        state.stats.ryo += 10;
        state.stats.intel += 3;
        return {
          tone: 'war',
          title: 'Defection Intercepted',
          text: `${vDef.institutions.shadowOrgName} operatives sealed the perimeter before ${npc.identity.name} could flee. Village command rewards your vigilance, though ${npc.identity.name} will never forgive you.`,
          checkLabel: 'Interception Check',
          checkPassed: true,
        };
      }
      const d: WorldDispatch[] = [];
      triggerNpcDefection(npc, 'broke past an ANBU ambush you triggered', state, worldSim, d);
      setPlayerRelation(npc, state.name, 'enemy', -50, -45, 65);
      state.stats.health -= 5;
      return {
        tone: 'danger',
        title: `${npc.identity.name} Escaped the Net`,
        text: `${npc.identity.name} blasted through the barrier tags and fled into exile, swearing vengeance on you and ${vDef.name}.`,
        checkLabel: 'Interception Check',
        checkPassed: false,
      };
    }

    // let_go
    const d: WorldDispatch[] = [];
    triggerNpcDefection(npc, 'slipped past the gate with your quiet mercy', state, worldSim, d);
    setPlayerRelation(npc, state.name, 'ally', 25, 25, 0);
    state.stats.will += 3;
    return {
      tone: 'normal',
      title: 'An Unspoken Departure',
      text: `You lowered your kunai as ${npc.identity.name} slipped into the night. They entered the Bingo Book by morning, yet they will remember you spared their path.`,
    };
  }

  if (scenario === 'em_shadow_secret_leak' && npc) {
    if (optionId === 'expose_council') {
      myVillage.shadowOrg.influence = clamp(myVillage.shadowOrg.influence - 10, 10, 100);
      myVillage.stability = clamp(myVillage.stability + 5, 10, 100);
      for (const c of myVillage.clans) c.loyalty = clamp(c.loyalty + 6, 10, 100);
      setPlayerRelation(npc, state.name, 'ally', 20, 20, 0);
      state.stats.bonds += 5;
      state.stats.intel += 4;
      recordWorldHistory(worldSim, {
        year,
        layer: 'village',
        title: `${vDef.institutions.shadowOrgName} Overreach Checked`,
        summary: `${state.name} and ${npc.identity.name} brought covert evidence before the ${vDef.name} council, restoring clan trust.`,
        villageId: state.villageId,
        tone: 'milestone',
      });
      return {
        tone: 'milestone',
        title: 'Council Transparency Enforced',
        text: `With ${npc.identity.name}'s evidence laid on the council table, the ${vDef.kageTitle} reined in ${vDef.institutions.shadowOrgName} and steadied clan loyalties across ${vDef.name}.`,
      };
    }
    if (optionId === 'leverage_shadow') {
      myVillage.shadowOrg.influence = clamp(myVillage.shadowOrg.influence + 10, 10, 100);
      state.stats.intel += 5;
      state.stats.ryo += 12;
      state.leanings.ruthless += 2;
      setPlayerRelation(npc, state.name, 'rival', -20, -25, 25);
      return {
        tone: 'normal',
        title: 'Quiet Bargain in the Dark',
        text: `You handed the cipher back to ${vDef.institutions.shadowOrgName} in exchange for deep funding and covert access. ${npc.identity.name} now views you with cold caution.`,
      };
    }
    myVillage.stability = clamp(myVillage.stability + 3, 10, 100);
    setPlayerRelation(npc, state.name, 'friend', 15, 20, 0);
    state.stats.will += 4;
    return {
      tone: 'bond',
      title: 'Ashes in the Brazier',
      text: `You watched the secret cipher curl into ash beside ${npc.identity.name}, choosing fragile peace over open factional war.`,
    };
  }

  if (scenario === 'em_missing_nin_crossroads' && npc) {
    if (optionId === 'engage_rogue') {
      const playerPower = state.stats.chakra + state.stats.will + rng.int(0, 40);
      const passed = playerPower >= npc.identity.powerScore + 65;
      if (passed) {
        npc.identity.alive = false;
        npc.identity.deathAge = npc.identity.age;
        npc.identity.deathCause = `defeated by ${state.name} on the frontier`;
        state.stats.ryo += 20;
        state.stats.will += 5;
        myVillage.morale = clamp(myVillage.morale + 5, 10, 100);
        myVillage.anbu.activeOp = null;
        recordWorldHistory(worldSim, {
          year,
          layer: 'npc',
          title: `${state.name} Defeated Missing-Nin ${npc.identity.name}`,
          summary: `${state.name} neutralized rogue shinobi ${npc.identity.name} along the frontier.`,
          villageId: state.villageId,
          npcId: npc.identity.id,
          tone: 'war',
        });
        return {
          tone: 'war',
          title: `Bounty Claimed: ${npc.identity.name}`,
          text: `After a fierce exchange of jutsu, you brought down Missing-Nin ${npc.identity.name} and closed their Bingo Book entry.`,
          checkLabel: 'Frontier Duel',
          checkPassed: true,
        };
      }
      state.stats.health -= 12;
      setPlayerRelation(npc, state.name, 'enemy', -30, -30, 40);
      addNpcMemory(npc, {
        year,
        age: npc.identity.age,
        tag: 'war',
        summary: `Clashed fiercely with ${state.name} on the frontier and escaped.`,
        actorId: 'player',
        impact: -4,
      });
      return {
        tone: 'danger',
        title: `${npc.identity.name} Slipped Away`,
        text: `${npc.identity.name} countered your opening strike, leaving you bloodied before vanishing into the fog.`,
        checkLabel: 'Frontier Duel',
        checkPassed: false,
      };
    }

    if (optionId === 'trade_intel') {
      setPlayerRelation(npc, state.name, 'ally', 18, 15, -10);
      state.stats.intel += 5;
      return {
        tone: 'bond',
        title: 'Frontier Parley',
        text: `Over cautious distance, ${npc.identity.name} shared rumors of rival troop movements and anomalies along the border before vanishing into the pines.`,
        cluesDelta: state.world.seededCrisis !== 'none' ? 1 : 0,
      };
    }

    state.stats.intel += 3;
    myVillage.anbu.readiness = clamp(myVillage.anbu.readiness + 4, 10, 100);
    return {
      tone: 'normal',
      title: 'Border Sighting Logged',
      text: `You withdrew cleanly and filed ${npc.identity.name}'s coordinates with ${vDef.name} frontier command.`,
    };
  }

  if (scenario === 'em_disaster_flashpoint') {
    const disId = String(meta?.disasterId ?? '');
    const dis = worldSim.activeDisasters.find((d) => d.id === disId);
    if (optionId === 'aid_hospital') {
      state.stats.bonds += 6;
      state.stats.will += 4;
      state.stats.health -= 4;
      myVillage.hospital.capacity = clamp(myVillage.hospital.capacity + 6, 10, 100);
      myVillage.morale = clamp(myVillage.morale + 8, 10, 100);
      if (dis) dis.yearsLeft = Math.max(0, dis.yearsLeft - 1);
      return {
        tone: 'bond',
        title: 'Hands in the Rubble',
        text: `Your tireless triage and supply escorts stabilized ${vDef.name}'s hospital wards and shortened the emergency.`,
      };
    }
    state.stats.intel += 4;
    state.stats.ryo += 6;
    myVillage.stability = clamp(myVillage.stability + 6, 10, 100);
    return {
      tone: 'milestone',
      title: 'Watch Along the Storm Line',
      text: `Your perimeter sweeps deterred foreign opportunists while ${vDef.name} weathered the regional disaster.`,
    };
  }

  // Village-specific institutional crisis resolution
  if (optionId === 'stance_reform') {
    state.stats.bonds += 5;
    state.stats.will += 4;
    myVillage.policy = 'diplomatic';
    myVillage.stability = clamp(myVillage.stability + 6, 10, 100);
    for (const c of myVillage.clans) c.loyalty = clamp(c.loyalty + 7, 10, 100);
    if (state.villageId === 'kiri') myVillage.academy.bloodyMistActive = false;
    return {
      tone: 'bond',
      title: `${vDef.name} Reform Movement`,
      text: `Your stance rallied reformist clans and stabilized ${vDef.name}'s institutions, easing internal friction and foreign suspicion.`,
      tensionDelta: -6,
    };
  }
  if (optionId === 'stance_hardline') {
    state.stats.chakra += 4;
    state.stats.will += 5;
    myVillage.military = clamp(myVillage.military + 8, 10, 100);
    myVillage.policy = 'expansionist';
    return {
      tone: 'war',
      title: `${vDef.name} Iron Mandate`,
      text: `${vDef.name} hardened its military doctrine and border garrisons, projecting unmistakable strength across the frontier.`,
      tensionDelta: 5,
    };
  }
  state.stats.intel += 5;
  state.stats.ryo += 8;
  state.leanings.ruthless += 1;
  myVillage.shadowOrg.influence = clamp(myVillage.shadowOrg.influence + 8, 10, 100);
  myVillage.policy = 'shadow_ops';
  return {
    tone: 'normal',
    title: `${vDef.institutions.shadowOrgName} Contingency`,
    text: `Working beneath the surface with ${vDef.institutions.shadowOrgName}, you neutralized the immediate flashpoint while deepening covert leverage.`,
  };
}
