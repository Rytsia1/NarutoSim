import { VILLAGES } from '../../data/villages';
import { clamp } from '../powers';
import { getRelVector } from '../relationships';
import type { SeededRng } from '../rng';
import type {
  GameState,
  NpcCognitionState,
  NpcLodTier,
  VillageId,
  VillagePopulationSim,
  VillageSimState,
  WorldNpc,
  WorldSimState,
} from '../types';

export interface WorldPopulationSummary {
  totalWorldPopulation: number;
  totalCivilians: number;
  totalShinobiCorps: number;
  totalAcademyCadets: number;
  totalOrphans: number;
  l1NpcCount: number;
  l2NpcCount: number;
  fallenNpcCount: number;
}

export function buildInitialVillagePopulation(vId: VillageId): VillagePopulationSim {
  switch (vId) {
    case 'konoha':
      return {
        civilians: 6400,
        academyCadets: 340,
        geninCorps: 220,
        chuninCorps: 390,
        joninCorps: 96,
        veterans: 170,
        sicknessRate: 12,
        warCasualtiesTotal: 0,
        orphansCount: 42,
      };
    case 'suna':
      return {
        civilians: 3150,
        academyCadets: 145,
        geninCorps: 98,
        chuninCorps: 192,
        joninCorps: 54,
        veterans: 88,
        sicknessRate: 18,
        warCasualtiesTotal: 0,
        orphansCount: 34,
      };
    case 'kiri':
      return {
        civilians: 4350,
        academyCadets: 180,
        geninCorps: 124,
        chuninCorps: 242,
        joninCorps: 74,
        veterans: 96,
        sicknessRate: 22,
        warCasualtiesTotal: 0,
        orphansCount: 58,
      };
    case 'kumo':
      return {
        civilians: 5200,
        academyCadets: 265,
        geninCorps: 182,
        chuninCorps: 325,
        joninCorps: 88,
        veterans: 120,
        sicknessRate: 14,
        warCasualtiesTotal: 0,
        orphansCount: 36,
      };
    case 'iwa':
      return {
        civilians: 5600,
        academyCadets: 250,
        geninCorps: 170,
        chuninCorps: 312,
        joninCorps: 82,
        veterans: 140,
        sicknessRate: 15,
        warCasualtiesTotal: 0,
        orphansCount: 40,
      };
    default:
      return {
        civilians: 1680,
        academyCadets: 76,
        geninCorps: 54,
        chuninCorps: 86,
        joninCorps: 24,
        veterans: 40,
        sicknessRate: 20,
        warCasualtiesTotal: 0,
        orphansCount: 28,
      };
  }
}

export function ensureVillagePopulation(vSim: VillageSimState): VillagePopulationSim {
  if (!vSim.population) {
    vSim.population = buildInitialVillagePopulation(vSim.villageId);
  }
  return vSim.population;
}

export function getVillageTotalPopulation(pop: VillagePopulationSim): number {
  return (
    pop.civilians +
    pop.academyCadets +
    pop.geninCorps +
    pop.chuninCorps +
    pop.joninCorps +
    pop.veterans
  );
}

export function getVillageActiveShinobi(pop: VillagePopulationSim): number {
  return pop.geninCorps + pop.chuninCorps + pop.joninCorps;
}

/**
 * Tier L3: O(1) statistical population simulation per village per year.
 * Simulates thousands of background civilians and shinobi without per-person object overhead.
 */
export function tickVillagePopulationL3(
  vSim: VillageSimState,
  worldSim: WorldSimState,
  state: GameState,
  rng: SeededRng,
): void {
  const pop = ensureVillagePopulation(vSim);
  const activeDisaster = worldSim.activeDisasters.find((d) => d.villageId === vSim.villageId);
  const atWar = Object.values(worldSim.diplomacy).some(
    (e) => (e.a === vSim.villageId || e.b === vSim.villageId) && (e.status === 'at_war' || e.status === 'hostile'),
  );
  const warActive = atWar || state.world.tension >= 76;

  // 1. Sickness pressure driven by hospital capacity, economy, and disasters
  let sickDelta = rng.int(-3, 3);
  if (activeDisaster?.kind === 'plague') sickDelta += 14 + activeDisaster.severity * 4;
  else if (activeDisaster?.kind === 'famine' || activeDisaster?.kind === 'drought') sickDelta += 6;
  if (vSim.hospital.capacity >= 75) sickDelta -= 3;
  else if (vSim.hospital.capacity < 45) sickDelta += 4;
  if (worldSim.economyTrend === 'crisis') sickDelta += 3;
  pop.sicknessRate = clamp(pop.sicknessRate + sickDelta, 4, 92);

  // 2. Civilian birth/growth vs disaster/sickness attrition
  const growthRate =
    worldSim.economyTrend === 'boom'
      ? 0.018
      : worldSim.economyTrend === 'stable'
        ? 0.01
        : worldSim.economyTrend === 'slump'
          ? 0.002
          : -0.006;
  const sickLoss = pop.sicknessRate >= 35 ? Math.round(pop.civilians * ((pop.sicknessRate - 30) * 0.0007)) : 0;
  const disasterLoss = activeDisaster ? rng.int(12, 35) * activeDisaster.severity : 0;
  pop.civilians = Math.max(450, Math.round(pop.civilians * (1 + growthRate)) - sickLoss - disasterLoss);

  // 3. Academy pipeline -> Genin -> Chunin -> Jonin -> Veterans
  const intake = Math.max(8, Math.round((pop.civilians * 0.008) * (0.7 + vSim.academy.quality / 140)));
  const graduated = Math.min(pop.academyCadets, Math.round(pop.academyCadets * (vSim.academy.bloodyMistActive ? 0.16 : 0.24)));
  pop.academyCadets = clamp(pop.academyCadets + intake - graduated, 30, 800);

  const promotedToChunin = Math.min(pop.geninCorps, Math.round(pop.geninCorps * 0.12));
  const promotedToJonin = Math.min(pop.chuninCorps, Math.round(pop.chuninCorps * 0.05));
  const retiredToVet = Math.min(pop.joninCorps + pop.chuninCorps, Math.round((pop.chuninCorps + pop.joninCorps) * 0.03));

  pop.geninCorps = Math.max(20, pop.geninCorps + graduated - promotedToChunin);
  pop.chuninCorps = Math.max(30, pop.chuninCorps + promotedToChunin - promotedToJonin - Math.round(retiredToVet * 0.65));
  pop.joninCorps = Math.max(10, pop.joninCorps + promotedToJonin - Math.round(retiredToVet * 0.35));
  pop.veterans = clamp(pop.veterans + retiredToVet - Math.round(pop.veterans * 0.045), 15, 600);

  // 4. Wartime casualties & orphan surges
  if (warActive) {
    const casualties = rng.int(10, 28) + (atWar ? rng.int(8, 22) : 0);
    const geninHit = Math.min(pop.geninCorps - 10, Math.round(casualties * 0.45));
    const chuninHit = Math.min(pop.chuninCorps - 15, Math.round(casualties * 0.4));
    const joninHit = Math.min(pop.joninCorps - 5, Math.max(1, casualties - geninHit - chuninHit));
    pop.geninCorps = Math.max(10, pop.geninCorps - Math.max(0, geninHit));
    pop.chuninCorps = Math.max(15, pop.chuninCorps - Math.max(0, chuninHit));
    pop.joninCorps = Math.max(5, pop.joninCorps - Math.max(0, joninHit));
    pop.warCasualtiesTotal += casualties;
    pop.orphansCount = clamp(pop.orphansCount + Math.round(casualties * 0.45), 0, 600);
  } else if (vSim.morale >= 65 && pop.orphansCount > 12) {
    // Orphans grow up or are adopted in peaceful years
    pop.orphansCount = Math.max(10, pop.orphansCount - rng.int(1, 4));
  }
}

export function ensureNpcCognitionState(npc: WorldNpc, initialLod: NpcLodTier = 'L2'): NpcCognitionState {
  if (!npc.cognition) {
    npc.cognition = {
      lodTier: initialLod,
      stress: 18,
      injury: 0,
      lastUtilityTickYear: 0,
      familyCrisis: null,
      activePlan: null,
      lastDecision: null,
      pendingPlayerPlea: false,
    };
  }
  return npc.cognition;
}

/**
 * Dynamic LOD Promotion/Demotion between L1 (Individual Detailed) and L2 (Periodic Utility).
 */
export function determineNpcLodTier(npc: WorldNpc, state: GameState, worldSim: WorldSimState): NpcLodTier {
  const id = npc.identity;
  if (!id.alive) return 'L2';

  // Always L1: Active/former squad, Academy sensei/classmates, rival, imperfect-life key actors
  if (id.linkedTeamMemberId) return 'L1';
  if (state.academy?.senseiNpcId === id.id) return 'L1';
  if (state.academy?.classmateNpcIds.includes(id.id)) return 'L1';
  if (state.rivalId === id.id) return 'L1';
  if (state.playerLegacy?.abandonedSurvivorNpcId === id.id) return 'L1';
  if (state.playerLegacy?.unwantedTargetNpcId === id.id) return 'L1';

  // Always L1: Strong bond, rivalry, or resentment with the player
  const pRel = npc.relationships.player;
  if (pRel) {
    const vec = getRelVector(pRel);
    if (
      pRel.kind === 'family' ||
      pRel.kind === 'spouse' ||
      pRel.kind === 'mentor' ||
      pRel.kind === 'friend' ||
      vec.trust >= 52 ||
      vec.affection >= 52 ||
      vec.resentment >= 40 ||
      vec.rivalry >= 45
    ) {
      return 'L1';
    }
  }

  // Always L1: Home village Kage, home clan head, or home village Missing-Nin
  const myVillage = worldSim.villages[state.villageId];
  if (myVillage?.kageNpcId === id.id) return 'L1';
  if (id.villageId === state.villageId && id.roleTitle.includes('Head')) return 'L1';
  if (id.homeVillageId === state.villageId && id.specialStatus === 'missing_nin') return 'L1';
  if (npc.cognition?.familyCrisis || npc.cognition?.pendingPlayerPlea) return 'L1';

  return 'L2';
}

export function rebalanceNpcLodTiers(state: GameState, worldSim: WorldSimState): { l1Count: number; l2Count: number } {
  let l1Count = 0;
  let l2Count = 0;
  for (const npc of worldSim.npcs) {
    if (!npc.identity.alive) continue;
    const tier = determineNpcLodTier(npc, state, worldSim);
    const cog = ensureNpcCognitionState(npc, tier);
    cog.lodTier = tier;
    if (tier === 'L1') l1Count += 1;
    else l2Count += 1;
  }
  return { l1Count, l2Count };
}

export function getWorldPopulationSummary(worldSim: WorldSimState): WorldPopulationSummary {
  let totalCivilians = 0;
  let totalShinobiCorps = 0;
  let totalAcademyCadets = 0;
  let totalOrphans = 0;
  let totalWorldPopulation = 0;

  for (const vDef of VILLAGES) {
    const vSim = worldSim.villages[vDef.id];
    if (!vSim) continue;
    const pop = ensureVillagePopulation(vSim);
    totalCivilians += pop.civilians;
    totalShinobiCorps += getVillageActiveShinobi(pop);
    totalAcademyCadets += pop.academyCadets;
    totalOrphans += pop.orphansCount;
    totalWorldPopulation += getVillageTotalPopulation(pop);
  }

  let l1NpcCount = 0;
  let l2NpcCount = 0;
  let fallenNpcCount = 0;
  for (const npc of worldSim.npcs) {
    if (!npc.identity.alive) {
      fallenNpcCount += 1;
    } else if (npc.cognition?.lodTier === 'L1') {
      l1NpcCount += 1;
    } else {
      l2NpcCount += 1;
    }
  }

  return {
    totalWorldPopulation,
    totalCivilians,
    totalShinobiCorps,
    totalAcademyCadets,
    totalOrphans,
    l1NpcCount,
    l2NpcCount,
    fallenNpcCount,
  };
}
