import { CLAN_MAP, getClansForVillage } from '../data/clans';
import { VILLAGE_CRISIS_COPY } from '../data/events-world';
import { GREAT_VILLAGES, INITIAL_DIPLOMACY_SCORES, VILLAGES, VILLAGE_MAP } from '../data/villages';
import {
  addNpcKnowledge,
  addNpcMemory,
  recordWorldHistory,
  seedInitialWorldNpcs,
  setPlayerRelation,
  syncTeamMembersToWorldNpcs,
  tickAutonomousNpcs,
  triggerNpcDefection,
  type WorldDispatch,
} from './npc-sim';
import { clamp } from './powers';
import { SeededRng } from './rng';
import type {
  ClanStatus,
  DaimyoStance,
  DiplomacyEdge,
  DiplomacyStatus,
  DisasterKind,
  GameState,
  PendingDecision,
  StatKey,
  VillageId,
  VillageSimState,
  WorldDisaster,
  WorldNpc,
  WorldSimState,
  WorldTerritory,
} from './types';

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

function buildInitialTerritories(): WorldTerritory[] {
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
      controller: 'konoha',
      contestedBy: 'iwa',
      wealth: 7,
      strategicValue: 10,
      flashpoint: 38,
    },
    {
      id: 'terr_valley_clouds',
      name: 'Frost & Thunder Pass',
      controller: 'kumo',
      contestedBy: 'konoha',
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

function buildInitialVillageSim(vId: VillageId): VillageSimState {
  const def = VILLAGE_MAP[vId];
  const inst = def.institutions;
  const clans = getClansForVillage(vId).map((c) => ({
    clanId: c.id,
    power: c.startingPower,
    loyalty: c.startingLoyalty,
    reputation: clamp(Math.round((c.startingPower + c.startingLoyalty) / 2), 20, 95),
    status: (c.startingLoyalty < 50 ? 'strained' : 'thriving') as ClanStatus,
    headNpcId: null,
  }));

  const stance: DaimyoStance =
    inst.daimyoFundingBaseline >= 80
      ? 'hawkish'
      : inst.daimyoFundingBaseline <= 55
        ? 'austerity'
        : 'balanced';

  return {
    villageId: vId,
    kageNpcId: null,
    daimyo: {
      funding: inst.daimyoFundingBaseline,
      favor: clamp(inst.daimyoFundingBaseline + 4, 25, 95),
      stance,
    },
    anbu: {
      strength: def.tier === 'great' ? 72 : 52,
      readiness: 68,
      activeOp: null,
    },
    shadowOrg: {
      name: inst.shadowOrgName,
      influence: vId === 'konoha' || vId === 'kiri' || vId === 'oto' ? 68 : 54,
      secrecy: 74,
      agenda:
        vId === 'kiri'
          ? 'bloodline_hunt'
          : vId === 'kumo' || vId === 'iwa'
            ? 'sabotage_rival'
            : vId === 'konoha'
              ? 'coup_watch'
              : 'stabilize',
    },
    academy: {
      quality: def.tier === 'great' ? 72 : 58,
      doctrine: inst.academyDoctrine,
      bloodyMistActive: inst.bloodlineSuspicion,
    },
    hospital: {
      capacity: inst.hospitalBaseline,
      readiness: inst.hospitalBaseline,
    },
    clans,
    treasury: clamp(inst.daimyoFundingBaseline, 30, 95),
    military: def.tier === 'great' ? 74 : 52,
    morale: vId === 'kiri' ? 58 : vId === 'suna' ? 62 : 72,
    stability: vId === 'kiri' ? 56 : vId === 'suna' ? 64 : 74,
    policy: def.militaryPolicy,
  };
}

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
    if (state.team) {
      syncTeamMembersToWorldNpcs(state, rng);
    }
  }
  return state.worldSim;
}

export interface VillageInstitutionalModifiers {
  academyGradOffset: number;
  academyXpBonus: number;
  hospitalMortalityMult: number;
  missionRyoMult: number;
  bloodyMistActive: boolean;
  clanBonus?: { stat?: StatKey; disciplineId?: string; label: string };
}

export function getVillageInstitutionalModifiers(state: GameState): VillageInstitutionalModifiers {
  const vDef = VILLAGE_MAP[state.villageId];
  const worldSim = state.worldSim;
  const vSim = worldSim?.villages[state.villageId];
  const clanDef = state.clanId ? CLAN_MAP[state.clanId] : undefined;

  const bloodyMistActive = Boolean(vSim?.academy.bloodyMistActive ?? vDef.institutions.bloodlineSuspicion);
  const academyGradOffset =
    vDef.institutions.academyGradOffset +
    (bloodyMistActive && vDef.id === 'kiri' ? 0 : vDef.id === 'kiri' ? -6 : 0) +
    (vSim && vSim.academy.quality >= 80 ? -3 : vSim && vSim.academy.quality < 45 ? 4 : 0);

  const hospitalCap = vSim?.hospital.capacity ?? vDef.institutions.hospitalBaseline;
  const hospitalMortalityMult = clamp(1.18 - hospitalCap * 0.0045, 0.72, 1.18);

  const daimyoFund = vSim?.daimyo.funding ?? vDef.institutions.daimyoFundingBaseline;
  const worldEcon = worldSim?.economy ?? 64;
  const missionRyoMult = clamp(0.75 + ((daimyoFund + worldEcon) / 200) * 0.5, 0.75, 1.25);

  const academyXpBonus = vSim && vSim.academy.quality >= 78 ? 1 : 0;

  return {
    academyGradOffset,
    academyXpBonus,
    hospitalMortalityMult,
    missionRyoMult,
    bloodyMistActive,
    clanBonus: clanDef?.yearlyBonus,
  };
}

function updateClanStatus(loyalty: number, power: number): ClanStatus {
  if (loyalty < 25) return 'exiled';
  if (loyalty < 50) return 'strained';
  if (power < 42) return 'declining';
  return 'thriving';
}

function tickWorldLayer(
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

function tickVillageOrgLayer(
  state: GameState,
  worldSim: WorldSimState,
  rng: SeededRng,
): WorldDispatch[] {
  const dispatches: WorldDispatch[] = [];
  const year = state.birthYear + state.age;

  for (const vDef of VILLAGES) {
    const vSim = worldSim.villages[vDef.id];
    const isPlayerVillage = vDef.id === state.villageId;

    // 1. Daimyo Funding & Politics
    const vol = vDef.institutions.daimyoVolatility;
    let fundDelta = rng.int(-3, 3);
    if (worldSim.economyTrend === 'boom') fundDelta += 3;
    else if (worldSim.economyTrend === 'slump' || worldSim.economyTrend === 'crisis') fundDelta -= 4;
    if (rng.chance(vol * 0.28)) {
      // Suna-style Daimyo austerity squeeze or hawkish windfall
      const squeeze = vDef.id === 'suna' ? rng.chance(0.7) : rng.chance(0.45);
      fundDelta += squeeze ? -8 : 7;
    }
    vSim.daimyo.funding = clamp(vSim.daimyo.funding + fundDelta, 20, 98);
    vSim.daimyo.stance =
      vSim.daimyo.funding >= 78
        ? 'generous'
        : vSim.daimyo.funding <= 44
          ? 'austerity'
          : vSim.policy === 'expansionist'
            ? 'hawkish'
            : 'balanced';

    // Daimyo funding drives Treasury, Academy quality, and Hospital capacity
    const treasTarget = Math.round((vSim.daimyo.funding + worldSim.economy) / 2);
    vSim.treasury = clamp(vSim.treasury + Math.sign(treasTarget - vSim.treasury) * 2, 15, 98);
    if (vSim.treasury < 40) {
      vSim.academy.quality = clamp(vSim.academy.quality - 1, 30, 98);
      vSim.hospital.capacity = clamp(vSim.hospital.capacity - 1, 30, 98);
    } else if (vSim.treasury >= 72) {
      vSim.academy.quality = clamp(vSim.academy.quality + 1, 30, 98);
      vSim.hospital.capacity = clamp(vSim.hospital.capacity + 1, 30, 98);
    }

    // 2. Kage Succession (if Kage seat is vacant)
    if (vSim.kageNpcId === null) {
      if (isPlayerVillage && state.specialStatus === 'kage') {
        vSim.kageNpcId = 'player';
      } else {
        const candidates = worldSim.npcs
          .filter(
            (n) =>
              n.identity.alive &&
              n.identity.villageId === vDef.id &&
              n.identity.specialStatus !== 'missing_nin' &&
              n.identity.rank === 'jonin',
          )
          .sort((a, b) => b.identity.powerScore - a.identity.powerScore);
        if (candidates.length > 0) {
          const newKage = candidates[0];
          newKage.identity.specialStatus = 'kage';
          newKage.identity.roleTitle = vDef.kageTitle;
          vSim.kageNpcId = newKage.identity.id;
          vSim.stability = clamp(vSim.stability + 6, 10, 100);
          addNpcMemory(newKage, {
            year,
            age: newKage.identity.age,
            tag: 'promotion',
            summary: `Acclaimed as the new ${vDef.kageTitle} of ${vDef.name}.`,
            impact: 9,
          });

          // New Kage's personality reshapes village policy & Kiri Bloody Mist reform!
          if (newKage.personality.compassionate >= 62) {
            vSim.policy = 'diplomatic';
            if (vDef.id === 'kiri' && vSim.academy.bloodyMistActive) {
              vSim.academy.bloodyMistActive = false;
              recordWorldHistory(worldSim, {
                year,
                layer: 'village',
                title: `End of the Bloody Mist in ${vDef.name}`,
                summary: `New ${vDef.kageTitle} ${newKage.identity.name} abolished lethal academy exams and bloodline purges.`,
                villageId: vDef.id,
                npcId: newKage.identity.id,
                tone: 'milestone',
              });
            }
          } else if (newKage.personality.ambitious >= 70) {
            vSim.policy = 'expansionist';
          } else if (newKage.personality.cruel >= 65) {
            vSim.policy = 'shadow_ops';
          } else {
            vSim.policy = 'defensive';
          }

          recordWorldHistory(worldSim, {
            year,
            layer: 'village',
            title: `${newKage.identity.name} Named ${vDef.kageTitle}`,
            summary: `Following leadership succession, ${newKage.identity.name} assumed command of ${vDef.name} under a ${vSim.policy} doctrine.`,
            villageId: vDef.id,
            npcId: newKage.identity.id,
            tone: 'milestone',
          });
          if (isPlayerVillage || vDef.tier === 'great') {
            dispatches.push({
              priority: isPlayerVillage ? 94 : 62,
              tone: 'milestone',
              title: `New ${vDef.kageTitle}: ${newKage.identity.name}`,
              text: `${newKage.identity.name} has been inaugurated as the new ${vDef.kageTitle} of ${vDef.name}, steering the village toward a ${vSim.policy.replace('_', ' ')} policy.`,
            });
          }
        }
      }
    }

    // 3. Clan Dynamics & Head Succession
    for (const cState of vSim.clans) {
      const cDef = CLAN_MAP[cState.clanId];
      if (!cDef) continue;

      let loyaltyDrift = rng.int(-2, 2);
      if (vSim.stability >= 70) loyaltyDrift += 1;
      if (vSim.daimyo.stance === 'austerity') loyaltyDrift -= 2;
      if (vSim.academy.bloodyMistActive && cState.clanId === 'yuki') loyaltyDrift -= 4;
      if (vDef.id === 'konoha' && cState.clanId === 'uchiha' && vSim.shadowOrg.influence >= 70) {
        loyaltyDrift -= 3;
      }

      cState.loyalty = clamp(cState.loyalty + loyaltyDrift, 10, 100);
      cState.power = clamp(cState.power + rng.int(-2, 2), 15, 100);
      cState.status = updateClanStatus(cState.loyalty, cState.power);

      // Reassign Clan Head if vacant
      if (!cState.headNpcId || !worldSim.npcs.some((n) => n.identity.id === cState.headNpcId && n.identity.alive)) {
        const heir = worldSim.npcs.find(
          (n) =>
            n.identity.alive &&
            n.identity.villageId === vDef.id &&
            n.identity.clanId === cState.clanId &&
            n.identity.specialStatus !== 'missing_nin',
        );
        if (heir) {
          cState.headNpcId = heir.identity.id;
          if (heir.identity.specialStatus !== 'kage') {
            heir.identity.roleTitle = `${cDef.name} Head`;
          }
        } else {
          cState.headNpcId = null;
        }
      }
    }

    // 4. Shadow Org (Root / Hunter-Nin / Cloud Vanguard / Saboteurs) Covert Ops
    if (vDef.tier === 'great' && rng.chance(0.14)) {
      if (vSim.shadowOrg.agenda === 'sabotage_rival') {
        const rivals = GREAT_VILLAGES.filter((g) => g.id !== vDef.id);
        const target = rng.pick(rivals);
        const exposed = !rng.chance(vSim.shadowOrg.secrecy / 100);
        if (exposed) {
          shiftDiplomacy(worldSim, vDef.id, target.id, -14, year);
          vSim.shadowOrg.secrecy = clamp(vSim.shadowOrg.secrecy - 4, 25, 95);
          const kage = worldSim.npcs.find((n) => n.identity.id === worldSim.villages[target.id].kageNpcId);
          if (kage) {
            addNpcKnowledge(kage, {
              id: `know_sab_${vDef.id}_${year}`,
              topic: 'border_raid',
              detail: `Caught ${vSim.shadowOrg.name} agents from ${vDef.name} attempting border sabotage.`,
              secret: false,
              learnedYear: year,
            });
          }
          if (isPlayerVillage || target.id === state.villageId) {
            dispatches.push({
              priority: 76,
              tone: 'war',
              title: `Covert Incident: ${vSim.shadowOrg.name}`,
              text: `${vDef.name}'s ${vSim.shadowOrg.name} was exposed conducting border espionage against ${target.name}, sharply straining diplomatic ties.`,
            });
          }
        }
      }
    }

    // 5. Policy Adaptation for Great Villages (unless player is Kage and controls it)
    if (vDef.tier === 'great' && vSim.kageNpcId !== 'player' && rng.chance(0.12)) {
      if (vSim.daimyo.stance === 'austerity' && vSim.treasury < 45) {
        vSim.policy = rng.chance(0.5) ? 'shadow_ops' : 'expansionist';
      } else if (state.world.truePeace) {
        vSim.policy = 'diplomatic';
      }
    }
  }

  return dispatches;
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

  if (state.team) {
    syncTeamMembersToWorldNpcs(state, rng);
  }
  if (state.specialStatus === 'kage') {
    worldSim.villages[state.villageId].kageNpcId = 'player';
  }

  const layer1 = tickWorldLayer(state, worldSim, rng);
  const layer2 = tickVillageOrgLayer(state, worldSim, rng);
  const layer3 = tickAutonomousNpcs(state, worldSim, rng);

  // Sync back any autonomous changes to team members
  if (state.team) {
    syncTeamMembersToWorldNpcs(state, rng);
  }

  const allDispatches = [...layer1.dispatches, ...layer2, ...layer3];
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
