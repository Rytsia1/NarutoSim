import { GREAT_VILLAGES, VILLAGE_MAP } from '../data/villages';
import { addNpcKnowledge, type WorldDispatch } from './npc-sim';
import { getRelVector } from './relationships';
import type { SeededRng } from './rng';
import type {
  DiscoveryChannel,
  GameState,
  TimelineCategory,
  TimelineEvent,
  VillageId,
  WorldSimState,
} from './types';

export const CHANNEL_LABELS: Record<DiscoveryChannel, string> = {
  hidden: 'UNDISCOVERED',
  rumor: 'RUMOR',
  newspaper: 'VILLAGE GAZETTE',
  mission_report: 'MISSION INTEL',
  npc_talk: 'NPC CONVERSATION',
  anbu_dossier: 'ANBU CLASSIFIED',
};

export function recordTimelineEvent(
  state: GameState,
  worldSim: WorldSimState,
  opts: {
    category: TimelineCategory;
    villageIds: VillageId[];
    npcIds?: string[];
    truthTitle: string;
    truthSummary: string;
    rumorTitle?: string;
    rumorSummary?: string;
    isSecret: boolean;
    immediateChannel?: DiscoveryChannel;
    sourceLabel?: string;
  },
): TimelineEvent {
  if (!worldSim.timeline) worldSim.timeline = [];
  const year = state.birthYear + state.age;
  const eraYear = Math.max(1, state.age + 1);
  const id = `tl_${year}_${worldSim.timeline.length}_${opts.category}`;
  const immediate = opts.immediateChannel ?? (opts.isSecret ? 'hidden' : 'newspaper');
  const knownByPlayer = immediate !== 'hidden';
  const playerKnowsTruth =
    immediate === 'newspaper' ||
    immediate === 'mission_report' ||
    immediate === 'anbu_dossier' ||
    immediate === 'npc_talk';

  const ev: TimelineEvent = {
    id,
    year,
    eraYear,
    category: opts.category,
    villageIds: opts.villageIds,
    npcIds: opts.npcIds ?? [],
    truthTitle: opts.truthTitle,
    truthSummary: opts.truthSummary,
    rumorTitle: opts.rumorTitle ?? `Whispers: ${opts.truthTitle}`,
    rumorSummary: opts.rumorSummary ?? opts.truthSummary,
    isSecret: opts.isSecret,
    knownByPlayer,
    playerKnowsTruth: opts.isSecret ? playerKnowsTruth && immediate !== 'newspaper' : knownByPlayer,
    discoveryChannel: immediate,
    discoveredYear: knownByPlayer ? year : undefined,
    sourceLabel: opts.sourceLabel,
  };

  worldSim.timeline.push(ev);
  if (worldSim.timeline.length > 55) {
    worldSim.timeline.splice(0, worldSim.timeline.length - 55);
  }
  return ev;
}

export function seedInitialTimeline(
  state: GameState,
  worldSim: WorldSimState,
  rng: SeededRng,
): void {
  if (!worldSim.timeline) worldSim.timeline = [];
  if (worldSim.timeline.length > 0) return;

  const year = state.birthYear + state.age;
  const home = VILLAGE_MAP[state.villageId];
  const rival = rng.pick(GREAT_VILLAGES.filter((v) => v.id !== state.villageId)) ?? GREAT_VILLAGES[0];

  // Year 1 Public Chronicle
  recordTimelineEvent(state, worldSim, {
    category: 'clan',
    villageIds: [state.villageId],
    truthTitle: `${home.name} Settles Border Clan Dispute`,
    truthSummary: `${home.name} mediated a tense territorial dispute with neighboring frontier houses, purchasing a fragile calm for the new generation.`,
    rumorTitle: `Border Quiet Around ${home.name}`,
    rumorSummary: `Village gazettes celebrate a quiet truce along the ${home.region} trade roads.`,
    isSecret: false,
    immediateChannel: 'newspaper',
    sourceLabel: `${home.name} Gazette`,
  });

  // Hidden Secret Event (Epistemic Fog-of-War right from the start!)
  const secretEv = recordTimelineEvent(state, worldSim, {
    category: 'military',
    villageIds: [rival.id, state.villageId],
    truthTitle: `${rival.name} Preparing Northern Strike Contingencies`,
    truthSummary: `Classified military ledgers confirm ${rival.name} is stockpiling lightning seals and forward rations for a surprise strike on contested border passes.`,
    rumorTitle: `Unusual Troop Movements Near ${rival.region}`,
    rumorSummary: `Traveling merchants whisper about unscheduled patrol shifts and closed passes along the ${rival.region} frontier, though officials deny war preparations.`,
    isSecret: true,
    immediateChannel: 'rumor',
    sourceLabel: 'Caravan Rumor',
  });

  // Give a senior NPC in the rival/home shadow org knowledge of this secret
  const shadowChief = worldSim.npcs.find(
    (n) => n.identity.alive && n.identity.villageId === state.villageId && n.identity.specialStatus === 'anbu',
  );
  if (shadowChief) {
    addNpcKnowledge(shadowChief, {
      id: `know_${secretEv.id}`,
      topic: 'border_raid',
      detail: secretEv.truthSummary,
      secret: true,
      learnedYear: year,
    });
  }
}

export function revealTimelineTruth(
  state: GameState,
  channel: Exclude<DiscoveryChannel, 'hidden' | 'rumor'>,
  sourceLabel: string,
  specificEventId?: string,
): TimelineEvent | null {
  const timeline = state.worldSim?.timeline;
  if (!timeline || timeline.length === 0) return null;

  const target = specificEventId
    ? timeline.find((e) => e.id === specificEventId && !e.playerKnowsTruth)
    : [...timeline].reverse().find((e) => e.isSecret && !e.playerKnowsTruth);

  if (!target) return null;
  target.knownByPlayer = true;
  target.playerKnowsTruth = true;
  target.discoveryChannel = channel;
  target.discoveredYear = state.birthYear + state.age;
  target.sourceLabel = sourceLabel;
  return target;
}

export function investigateTimelineEvent(
  state: GameState,
  eventId: string,
  rng: SeededRng,
): { ok: boolean; revealed: boolean; message: string; event?: TimelineEvent } {
  const timeline = state.worldSim?.timeline;
  if (!timeline) return { ok: false, revealed: false, message: 'No timeline records available.' };
  const ev = timeline.find((e) => e.id === eventId);
  if (!ev || !ev.knownByPlayer || ev.playerKnowsTruth) {
    return { ok: false, revealed: false, message: 'No unverified rumor to investigate.' };
  }
  if (state.stats.ryo < 4 && state.specialStatus !== 'anbu' && state.specialStatus !== 'kage') {
    return { ok: false, revealed: false, message: 'Requires 4 Ryo (or ANBU/Kage clearance) to investigate.' };
  }

  const hasClearance = state.specialStatus === 'anbu' || state.specialStatus === 'kage';
  if (!hasClearance) {
    state.stats.ryo = Math.max(0, state.stats.ryo - 4);
  }
  const hasSensory = state.disciplines.some((d) => d.id === 'sensory' || d.id === 'interrogation');
  const chance = hasClearance ? 1.0 : Math.min(0.88, 0.36 + state.stats.intel * 0.005 + (hasSensory ? 0.18 : 0));

  if (rng.chance(chance)) {
    const channel: DiscoveryChannel = hasClearance ? 'anbu_dossier' : 'mission_report';
    const label = hasClearance ? 'ANBU Classified Archive' : 'Personal Field Investigation';
    ev.playerKnowsTruth = true;
    ev.discoveryChannel = channel;
    ev.discoveredYear = state.birthYear + state.age;
    ev.sourceLabel = label;
    state.stats.intel = Math.min(100, state.stats.intel + 2);
    return {
      ok: true,
      revealed: true,
      event: ev,
      message: `Truth uncovered via ${label}: ${ev.truthTitle}. ${ev.truthSummary}`,
    };
  }

  return {
    ok: true,
    revealed: false,
    event: ev,
    message: `Your contacts hit a wall investigating "${ev.rumorTitle}". The real plot stays buried behind coded seals.`,
  };
}

/**
 * Generates periodic world-shaping timeline events AND runs epistemic propagation
 * so the player learns news organically via Gazette, Rumors, Trusted NPCs, or ANBU dossiers.
 */
export function tickLivingTimeline(
  state: GameState,
  worldSim: WorldSimState,
  rng: SeededRng,
): WorldDispatch[] {
  if (!worldSim.timeline) worldSim.timeline = [];
  const dispatches: WorldDispatch[] = [];
  const year = state.birthYear + state.age;

  // 1. Organic Living Timeline World Beats (every ~2-3 years)
  if (state.age >= 2 && rng.chance(0.38)) {
    const roll = rng.next();
    const vA = rng.pick(GREAT_VILLAGES);
    const vB = rng.pick(GREAT_VILLAGES.filter((v) => v.id !== vA.id)) ?? GREAT_VILLAGES[0];

    if (roll < 0.25) {
      // Covert Military Buildup (Secret!)
      recordTimelineEvent(state, worldSim, {
        category: 'military',
        villageIds: [vA.id, vB.id],
        truthTitle: `${vA.name} Covert Strike Plan Against ${vB.name}`,
        truthSummary: `${vA.name} command secretly staged forward strike teams and chakra supplies to pressure ${vB.name}'s frontier passes.`,
        rumorTitle: `Rumor: Heavy Supply Wagons Leaving ${vA.name}`,
        rumorSummary: `Tea-house rumors speak of darkened supply convoys leaving ${vA.name} at midnight, though no war declaration exists.`,
        isSecret: true,
        immediateChannel: 'hidden',
      });
    } else if (roll < 0.48) {
      // Resource Shortage / Daimyo Crunch
      recordTimelineEvent(state, worldSim, {
        category: 'economy',
        villageIds: [vA.id],
        truthTitle: `${vA.name} Faces Resource & Stipend Crunch`,
        truthSummary: `Harsh weather and ${vA.region} Daimyo budget cuts squeezed ${vA.name}'s supply depots, forcing shinobi squads onto lean rations.`,
        rumorTitle: `Merchant Chatter: Tight Coffers in ${vA.name}`,
        rumorSummary: `Caravan guards report ${vA.name} quartermasters haggling aggressively over iron and medical herbs.`,
        isSecret: false,
        immediateChannel: vA.id === state.villageId ? 'newspaper' : 'rumor',
        sourceLabel: vA.id === state.villageId ? `${vA.name} Gazette` : 'Trade Rumor',
      });
    } else if (roll < 0.72) {
      // Secret Shadow Deal / Treaty Breakdown
      recordTimelineEvent(state, worldSim, {
        category: 'covert',
        villageIds: [vA.id, vB.id],
        truthTitle: `Secret Envoy Talks Between ${vA.name} and ${vB.name} Collapse`,
        truthSummary: `Back-channel peace negotiations between ${vA.name} and ${vB.name} shattered after ${vA.institutions.shadowOrgName} sabotaged the envoy ciphers.`,
        rumorTitle: `Rumor: Cold Silence Between ${vA.name} and ${vB.name}`,
        rumorSummary: `Border couriers noticed ${vA.name} and ${vB.name} stopped exchanging seasonal treaty flags without public explanation.`,
        isSecret: true,
        immediateChannel: 'hidden',
      });
    } else {
      // Famous Jonin or Clan Milestone
      const notableNpc = worldSim.npcs.find((n) => n.identity.alive && n.identity.rank === 'jonin');
      const subjectName = notableNpc ? notableNpc.identity.name : `a veteran ${vA.name} Jonin`;
      recordTimelineEvent(state, worldSim, {
        category: 'npc_fate',
        villageIds: [notableNpc?.identity.villageId ?? vA.id],
        npcIds: notableNpc ? [notableNpc.identity.id] : [],
        truthTitle: `Border Skirmish Tests ${subjectName}`,
        truthSummary: `${subjectName} led a grueling counter-ambush along the contested passes, earning new lines in rival Bingo Books.`,
        rumorTitle: `Tavern Tales of ${subjectName}`,
        rumorSummary: `Travelers trade exaggerated stories about a fierce midnight clash involving ${subjectName}.`,
        isSecret: false,
        immediateChannel: 'newspaper',
        sourceLabel: 'Continental Gazette',
      });
    }
  }

  // 2. Epistemic Knowledge Propagation: reveal hidden events through realistic channels!
  const hasAnbuAccess =
    state.specialStatus === 'anbu' ||
    state.specialStatus === 'kage' ||
    (state.rank === 'jonin' && state.stats.intel >= 68);

  const trustedConfidant = worldSim.npcs.find((n) => {
    if (!n.identity.alive || !n.relationships.player) return false;
    const vec = getRelVector(n.relationships.player);
    return vec.trust >= 65 && vec.affection >= 55;
  });

  for (const ev of worldSim.timeline) {
    if (ev.playerKnowsTruth) continue;

    // Hidden -> Rumor leak after 1+ year
    if (!ev.knownByPlayer && year - ev.year >= 1 && rng.chance(0.45)) {
      ev.knownByPlayer = true;
      ev.discoveryChannel = 'rumor';
      ev.discoveredYear = year;
      ev.sourceLabel = 'Street Rumor';
      if (ev.villageIds.includes(state.villageId)) {
        dispatches.push({
          priority: 66,
          tone: 'normal',
          title: `Rumor: ${ev.rumorTitle}`,
          text: `${ev.rumorSummary} (Unverified rumor in Living Timeline)`,
        });
      }
      continue;
    }

    // Secret Rumor -> Classified ANBU Dossier if player has clearance!
    if (ev.isSecret && hasAnbuAccess && rng.chance(0.42)) {
      ev.knownByPlayer = true;
      ev.playerKnowsTruth = true;
      ev.discoveryChannel = 'anbu_dossier';
      ev.discoveredYear = year;
      ev.sourceLabel = state.specialStatus === 'kage' ? 'Kage Intelligence Briefing' : 'ANBU Classified Dossier';
      dispatches.push({
        priority: 79,
        tone: 'crisis',
        title: `Classified Intel: ${ev.truthTitle}`,
        text: `${ev.truthSummary} (Source: ${ev.sourceLabel})`,
      });
      continue;
    }

    // Secret Rumor -> Trusted NPC Conversation leak!
    if (ev.isSecret && trustedConfidant && year - ev.year >= 1 && rng.chance(0.22)) {
      ev.knownByPlayer = true;
      ev.playerKnowsTruth = true;
      ev.discoveryChannel = 'npc_talk';
      ev.discoveredYear = year;
      ev.sourceLabel = `Tip from ${trustedConfidant.identity.name}`;
      dispatches.push({
        priority: 77,
        tone: 'bond',
        title: `Quiet Word from ${trustedConfidant.identity.name}`,
        text: `Trusting you completely, ${trustedConfidant.identity.name} reveals the truth behind recent whispers: ${ev.truthSummary}`,
      });
      continue;
    }

    // Non-secret rumor -> Public Gazette confirmation
    if (!ev.isSecret && ev.knownByPlayer && !ev.playerKnowsTruth && year - ev.year >= 1) {
      ev.playerKnowsTruth = true;
      ev.discoveryChannel = 'newspaper';
      ev.discoveredYear = year;
      ev.sourceLabel = `${VILLAGE_MAP[state.villageId].name} Gazette`;
    }
  }

  return dispatches;
}
