import { CLAN_MAP } from '../data/clans';
import { ORIGIN_MAP } from '../data/origins';
import { VILLAGE_MAP } from '../data/villages';
import { computeCombatProjection, getChakraCap } from '../sim/powers';
import { canAccessGovernance } from '../sim/politics';
import { deriveRelArchetype, getRelVector } from '../sim/relationships';
import { canEnterRetirement } from '../sim/epilogue';
import { canCallDiplomaticSummit, getTensionLabel } from '../sim/world';
import type {
  GameState,
  LogEntry,
  TimelineEvent,
  VillageId,
  VillageSimState,
  WorldNpc,
} from '../sim/types';

export interface ChronicleViewModel {
  entriesNewestFirst: LogEntry[];
  totalCount: number;
}

export interface StatusViewModel {
  projection: ReturnType<typeof computeCombatProjection>;
  chakraCap: number;
  villageName: string;
  villagePerkLabel: string;
  originName: string;
  clanName: string | null;
  clanBonusLabel: string | null;
  tensionLabel: string;
  retireAvailable: boolean;
  summitAvailable: boolean;
  activeFalloutCount: number;
}

export interface WorldJournalViewModel {
  knownEventsNewestFirst: TimelineEvent[];
  hiddenCount: number;
  unverifiedRumorCount: number;
}

export interface VillageGovernanceViewModel {
  village: VillageSimState | null;
  canGovern: boolean;
  kageNpc: WorldNpc | null;
}

export interface NpcDirectoryEntry {
  npc: WorldNpc;
  playerArchetype: string | null;
  knowsPlayer: boolean;
}

/**
 * Pure Read-Only Presentation Layer Selectors.
 * Decouples UI screens from internal simulation details across all 9 Domain Engines.
 */
export function selectChronicleView(state: GameState): ChronicleViewModel {
  return {
    entriesNewestFirst: [...state.logs].reverse(),
    totalCount: state.logs.length,
  };
}

export function selectStatusView(state: GameState): StatusViewModel {
  const village = VILLAGE_MAP[state.villageId];
  const origin = ORIGIN_MAP[state.originId];
  const clan = state.clanId ? CLAN_MAP[state.clanId] : null;
  return {
    projection: computeCombatProjection(state),
    chakraCap: getChakraCap(state),
    villageName: village.name,
    villagePerkLabel: village.perk.label,
    originName: origin.name,
    clanName: clan?.name ?? null,
    clanBonusLabel: clan?.yearlyBonus.label ?? null,
    tensionLabel: getTensionLabel(state.world.tension, state.world.truePeace),
    retireAvailable: canEnterRetirement(state),
    summitAvailable: canCallDiplomaticSummit(state),
    activeFalloutCount: state.missionConsequences?.length ?? 0,
  };
}

export function selectWorldJournalView(state: GameState): WorldJournalViewModel {
  const all = state.worldSim?.timeline ?? [];
  const known = all.filter((e) => e.knownByPlayer).reverse();
  return {
    knownEventsNewestFirst: known,
    hiddenCount: all.length - known.length,
    unverifiedRumorCount: known.filter((e) => !e.playerKnowsTruth).length,
  };
}

export function selectVillageGovernanceView(
  state: GameState,
  villageId: VillageId,
): VillageGovernanceViewModel {
  const ws = state.worldSim;
  if (!ws) {
    return { village: null, canGovern: false, kageNpc: null };
  }
  const vSim = ws.villages[villageId] ?? ws.villages[state.villageId];
  const kageNpc =
    vSim.kageNpcId && vSim.kageNpcId !== 'player'
      ? ws.npcs.find((n) => n.identity.id === vSim.kageNpcId) ?? null
      : null;
  return {
    village: vSim,
    canGovern: villageId === state.villageId && canAccessGovernance(state),
    kageNpc,
  };
}

export function selectNpcDirectoryView(
  state: GameState,
  filter: 'my_village' | 'leaders' | 'all_living' | 'missing_nin' | 'fallen',
): NpcDirectoryEntry[] {
  const npcs = state.worldSim?.npcs ?? [];
  return npcs
    .filter((n) => {
      if (filter === 'fallen') return !n.identity.alive;
      if (!n.identity.alive) return false;
      if (filter === 'my_village') return n.identity.villageId === state.villageId;
      if (filter === 'leaders') {
        return (
          n.identity.specialStatus === 'kage' ||
          n.identity.roleTitle.includes('Head') ||
          n.identity.specialStatus === 'anbu'
        );
      }
      if (filter === 'missing_nin') return n.identity.specialStatus === 'missing_nin';
      return true;
    })
    .map((npc) => {
      const pRel = npc.relationships.player;
      return {
        npc,
        knowsPlayer: Boolean(pRel),
        playerArchetype: pRel ? deriveRelArchetype(getRelVector(pRel)) : null,
      };
    })
    .sort((a, b) => {
      if (a.knowsPlayer !== b.knowsPlayer) return a.knowsPlayer ? -1 : 1;
      return b.npc.identity.powerScore - a.npc.identity.powerScore;
    });
}
