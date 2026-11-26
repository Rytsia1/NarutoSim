import { CLAN_MAP, getClansForVillage } from '../../data/clans';
import { GREAT_VILLAGES, VILLAGES, VILLAGE_MAP } from '../../data/villages';
import {
  addNpcKnowledge,
  addNpcMemory,
  recordWorldHistory,
  type WorldDispatch,
} from '../npc-sim';
import { buildInitialVillagePopulation, tickVillagePopulationL3 } from '../npc/lod-population';
import { clamp } from '../powers';
import type { SeededRng } from '../rng';
import type {
  ClanStatus,
  DaimyoStance,
  GameState,
  StatKey,
  VillageId,
  VillageSimState,
  WorldSimState,
} from '../types';
import { shiftDiplomacy } from '../world/geopolitics';

export interface VillageInstitutionalModifiers {
  academyGradOffset: number;
  academyXpBonus: number;
  hospitalMortalityMult: number;
  missionRyoMult: number;
  bloodyMistActive: boolean;
  clanBonus?: { stat?: StatKey; disciplineId?: string; label: string };
}

export function buildInitialVillageSim(vId: VillageId): VillageSimState {
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
    population: buildInitialVillagePopulation(vId),
    treasury: clamp(inst.daimyoFundingBaseline, 30, 95),
    military: def.tier === 'great' ? 74 : 52,
    morale: vId === 'kiri' ? 58 : vId === 'suna' ? 62 : 72,
    stability: vId === 'kiri' ? 56 : vId === 'suna' ? 64 : 74,
    policy: def.militaryPolicy,
  };
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

export function tickVillageOrgLayer(
  state: GameState,
  worldSim: WorldSimState,
  rng: SeededRng,
): WorldDispatch[] {
  const dispatches: WorldDispatch[] = [];
  const year = state.birthYear + state.age;

  for (const vDef of VILLAGES) {
    const vSim = worldSim.villages[vDef.id];
    const isPlayerVillage = vDef.id === state.villageId;

    // 1. Daimyo Funding & Politics + L3 Statistical Population Simulation
    tickVillagePopulationL3(vSim, worldSim, state, rng);
    const vol = vDef.institutions.daimyoVolatility;
    let fundDelta = rng.int(-3, 3);
    if (worldSim.economyTrend === 'boom') fundDelta += 3;
    else if (worldSim.economyTrend === 'slump' || worldSim.economyTrend === 'crisis') fundDelta -= 4;
    if (rng.chance(vol * 0.28)) {
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

    // 4. Shadow Org Covert Ops
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

    // 5. Policy Adaptation for Great Villages
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
