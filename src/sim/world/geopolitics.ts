import { GREAT_VILLAGES, VILLAGE_MAP } from '../../data/villages';
import { recordWorldHistory, type WorldDispatch } from '../npc-sim';
import { clamp } from '../powers';
import type { SeededRng } from '../rng';
import { recordTimelineEvent } from '../timeline';
import type {
  DiplomacyEdge,
  DiplomacyStatus,
  DisasterKind,
  GameState,
  VillageId,
  WorldDisaster,
  WorldSimState,
  WorldTerritory,
} from '../types';

export function getDiplomacyKey(a: VillageId, b: VillageId): string {
  return a < b ? `${a}_${b}` : `${b}_${a}`;
}

export function scoreToDiplomacyStatus(score: number): DiplomacyStatus {
  if (score >= 55) return 'allied';
  if (score >= 20) return 'treaty';
  if (score > -18) return 'neutral';
  if (score > -48) return 'strained';
  if (score > -78) return 'hostile';
  return 'at_war';
}

export function getDiplomacyEdge(
  worldSim: WorldSimState,
  a: VillageId,
  b: VillageId,
): DiplomacyEdge | undefined {
  if (a === b) return undefined;
  return worldSim.diplomacy[getDiplomacyKey(a, b)];
}

export function shiftDiplomacy(
  worldSim: WorldSimState,
  a: VillageId,
  b: VillageId,
  delta: number,
  year: number,
): DiplomacyEdge | null {
  if (a === b) return null;
  const key = getDiplomacyKey(a, b);
  const [first, second] = a < b ? [a, b] : [b, a];
  const existing = worldSim.diplomacy[key] ?? {
    a: first,
    b: second,
    score: 0,
    status: 'neutral' as DiplomacyStatus,
    lastChangedYear: year,
  };
  const nextScore = clamp(existing.score + delta, -100, 100);
  const nextStatus = scoreToDiplomacyStatus(nextScore);
  const updated: DiplomacyEdge = {
    a: first,
    b: second,
    score: nextScore,
    status: nextStatus,
    lastChangedYear: nextStatus !== existing.status ? year : existing.lastChangedYear,
  };
  worldSim.diplomacy[key] = updated;
  return updated;
}

export function buildInitialTerritories(): WorldTerritory[] {
  return [
    {
      id: 'terr_rain_corridor',
      name: 'Land of Rain Corridor',
      controller: 'ame',
      contestedBy: 'iwa',
      wealth: 6,
      strategicValue: 9,
      flashpoint: 42,
    },
    {
      id: 'terr_kannabi_bridge',
      name: 'Kannabi Bridge (Land of Grass)',
      controller: 'kusa',
      contestedBy: 'iwa',
      wealth: 7,
      strategicValue: 10,
      flashpoint: 38,
    },
    {
      id: 'terr_valley_clouds',
      name: 'Frost & Thunder Border Pass',
      controller: 'kumo',
      contestedBy: 'iwa',
      wealth: 7,
      strategicValue: 8,
      flashpoint: 34,
    },
    {
      id: 'terr_desert_caravan',
      name: 'Red Dune Caravan Oasis',
      controller: 'suna',
      contestedBy: 'iwa',
      wealth: 8,
      strategicValue: 7,
      flashpoint: 28,
    },
    {
      id: 'terr_mist_strait',
      name: 'Eastern Sea Mist Strait',
      controller: 'kiri',
      contestedBy: 'kumo',
      wealth: 8,
      strategicValue: 8,
      flashpoint: 26,
    },
    {
      id: 'terr_iron_peaks',
      name: 'Three Wolves Neutral Peaks',
      controller: 'iron',
      contestedBy: null,
      wealth: 6,
      strategicValue: 7,
      flashpoint: 10,
    },
  ];
}

export function tickWorldLayer(
  state: GameState,
  worldSim: WorldSimState,
  rng: SeededRng,
): { dispatches: WorldDispatch[]; tensionDelta: number } {
  const dispatches: WorldDispatch[] = [];
  const year = state.birthYear + state.age;
  let tensionDelta = 0;

  // 1. Continental Economy driven by treaties, war tension, and active disasters
  const edges = Object.values(worldSim.diplomacy);
  const treatyCount = edges.filter((e) => e.status === 'allied' || e.status === 'treaty').length;
  const hostileCount = edges.filter((e) => e.status === 'hostile' || e.status === 'at_war').length;
  const disasterDrag = worldSim.activeDisasters.reduce((acc, d) => acc + d.severity * 2, 0);

  const econDrift = rng.int(-3, 4) + Math.min(3, treatyCount) - hostileCount * 2 - Math.round(disasterDrag / 2);
  worldSim.economy = clamp(worldSim.economy + econDrift, 15, 98);
  worldSim.economyTrend =
    worldSim.economy >= 74
      ? 'boom'
      : worldSim.economy >= 48
        ? 'stable'
        : worldSim.economy >= 30
          ? 'slump'
          : 'crisis';

  // 2. Active Disasters tick & rare regional disaster spawning
  for (const d of worldSim.activeDisasters) {
    d.yearsLeft -= 1;
    const vSim = worldSim.villages[d.villageId];
    if (vSim) {
      vSim.treasury = clamp(vSim.treasury - d.severity * 2, 10, 100);
      vSim.morale = clamp(vSim.morale - d.severity * 2, 10, 100);
    }
  }
  worldSim.activeDisasters = worldSim.activeDisasters.filter((d) => d.yearsLeft > 0);

  if (worldSim.activeDisasters.length < 2 && rng.chance(0.11)) {
    const targetV = rng.pick(GREAT_VILLAGES);
    const kindByVillage: Record<string, { kind: DisasterKind; title: string }> = {
      suna: { kind: 'drought', title: 'Great Sandstorm & Oasis Drought' },
      kiri: { kind: 'storm', title: 'Crimson Typhoon & Coastal Plague' },
      iwa: { kind: 'quake', title: 'Canyon Tremor & Tunnel Collapse' },
      kumo: { kind: 'storm', title: 'Alpine Lightning Tempest' },
      konoha: { kind: 'famine', title: 'Border Harvest Blight' },
    };
    const picked = kindByVillage[targetV.id] ?? { kind: 'syndicate_raid', title: 'Rogue Syndicate Frontier Raid' };
    const disaster: WorldDisaster = {
      id: `dis_${year}_${targetV.id}`,
      kind: picked.kind,
      title: picked.title,
      villageId: targetV.id,
      severity: rng.int(1, 3),
      yearsLeft: rng.int(2, 3),
    };
    worldSim.activeDisasters.push(disaster);
    recordTimelineEvent(state, worldSim, {
      category: 'disaster',
      villageIds: [targetV.id],
      truthTitle: `${disaster.title} Strikes ${targetV.name}`,
      truthSummary: `A severity-${disaster.severity} disaster disrupted trade and strained ${targetV.name}'s hospitals and treasury.`,
      isSecret: false,
      immediateChannel: 'newspaper',
      sourceLabel: 'Continental Gazette',
    });
    recordWorldHistory(worldSim, {
      year,
      layer: 'world',
      title: `${disaster.title} Strikes ${targetV.name}`,
      summary: `A severity-${disaster.severity} disaster disrupted trade and strained ${targetV.name}'s hospitals and treasury.`,
      villageId: targetV.id,
      tone: 'crisis',
    });
    dispatches.push({
      priority: targetV.id === state.villageId ? 90 : 58,
      tone: 'crisis',
      title: `Regional Disaster: ${disaster.title}`,
      text: `${disaster.title} struck ${targetV.region}, straining ${targetV.name}'s treasury and medical corps while shaking regional trade.`,
    });
  }

  // 3. Bilateral Diplomacy drift based on Village Policies & Economy
  const greatIds = GREAT_VILLAGES.map((v) => v.id);
  for (let i = 0; i < greatIds.length; i++) {
    for (let j = i + 1; j < greatIds.length; j++) {
      const a = greatIds[i];
      const b = greatIds[j];
      const va = worldSim.villages[a];
      const vb = worldSim.villages[b];
      let delta = rng.int(-3, 3);
      if (va.policy === 'diplomatic' || vb.policy === 'diplomatic') delta += 2;
      if (va.policy === 'expansionist' || vb.policy === 'expansionist') delta -= 3;
      if (va.policy === 'shadow_ops' || vb.policy === 'shadow_ops') delta -= 2;
      if (worldSim.economyTrend === 'crisis') delta -= 2;
      if (state.world.truePeace) delta += 5;

      const beforeStatus = getDiplomacyEdge(worldSim, a, b)?.status;
      const updated = shiftDiplomacy(worldSim, a, b, delta, year);
      if (updated && beforeStatus && updated.status !== beforeStatus) {
        if (updated.status === 'hostile' || updated.status === 'at_war') {
          tensionDelta += 4;
          recordWorldHistory(worldSim, {
            year,
            layer: 'world',
            title: `${VILLAGE_MAP[a].name} and ${VILLAGE_MAP[b].name} Turn ${updated.status === 'at_war' ? 'to Open Conflict' : 'Hostile'}`,
            summary: `Diplomatic ties broke down between ${VILLAGE_MAP[a].name} and ${VILLAGE_MAP[b].name}, pushing continental tension higher.`,
            tone: 'war',
          });
          if (a === state.villageId || b === state.villageId) {
            dispatches.push({
              priority: 85,
              tone: 'war',
              title: `Diplomatic Rupture: ${VILLAGE_MAP[a].name} & ${VILLAGE_MAP[b].name}`,
              text: `Relations between ${VILLAGE_MAP[a].name} and ${VILLAGE_MAP[b].name} deteriorated into ${updated.status.replace('_', ' ')} footing.`,
            });
          }
        } else if (updated.status === 'allied' || (beforeStatus === 'hostile' && updated.status === 'strained')) {
          tensionDelta -= 3;
          if (a === state.villageId || b === state.villageId) {
            dispatches.push({
              priority: 70,
              tone: 'bond',
              title: `Diplomatic Thaw: ${VILLAGE_MAP[a].name} & ${VILLAGE_MAP[b].name}`,
              text: `Envoys from ${VILLAGE_MAP[a].name} and ${VILLAGE_MAP[b].name} eased border hostilities (${updated.status}).`,
            });
          }
        }
      }
    }
  }

  // 4. Strategic Territories border skirmishes
  for (const terr of worldSim.territories) {
    if (!terr.contestedBy) continue;
    const edge = getDiplomacyEdge(worldSim, terr.controller, terr.contestedBy);
    const edgeScore = edge?.score ?? 0;
    if (edgeScore < -20) {
      terr.flashpoint = clamp(terr.flashpoint + rng.int(4, 11), 0, 100);
    } else if (edgeScore > 20) {
      terr.flashpoint = clamp(terr.flashpoint - rng.int(4, 9), 0, 100);
    }

    if (terr.flashpoint >= 88 && rng.chance(0.45)) {
      const attacker = worldSim.villages[terr.contestedBy];
      const defender = worldSim.villages[terr.controller];
      const attackerWins =
        attacker && defender
          ? rng.chance(clamp(0.45 + (attacker.military - defender.military) * 0.01, 0.2, 0.8))
          : rng.chance(0.45);
      terr.flashpoint = 35;
      if (attackerWins) {
        const oldCtrl = terr.controller;
        terr.controller = terr.contestedBy;
        terr.contestedBy = oldCtrl;
        tensionDelta += 5;
        if (attacker) attacker.treasury = clamp(attacker.treasury + 6, 10, 100);
        if (defender) defender.morale = clamp(defender.morale - 6, 10, 100);
        recordWorldHistory(worldSim, {
          year,
          layer: 'world',
          title: `${VILLAGE_MAP[terr.controller].name} Seizes ${terr.name}`,
          summary: `Border skirmishes flipped control of ${terr.name} from ${VILLAGE_MAP[oldCtrl].name} to ${VILLAGE_MAP[terr.controller].name}.`,
          villageId: terr.controller,
          tone: 'war',
        });
        dispatches.push({
          priority: terr.controller === state.villageId || oldCtrl === state.villageId ? 89 : 60,
          tone: 'war',
          title: `Territory Shift: ${terr.name}`,
          text: `${VILLAGE_MAP[terr.controller].name} wrested control of ${terr.name} from ${VILLAGE_MAP[oldCtrl].name} in a sharp border clash.`,
        });
      }
    }
  }

  return { dispatches, tensionDelta };
}
