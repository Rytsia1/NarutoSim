import { OCCUPATION_MAP } from '../data/characters';
import { getClansForVillage } from '../data/clans';
import { DISCIPLINE_MAP } from '../data/powers';
import { GREAT_VILLAGES, VILLAGE_MAP } from '../data/villages';
import { tickNpcCognitiveCycle } from './npc/cognition';
import { ensureVillagePopulation, rebalanceNpcLodTiers } from './npc/lod-population';
import {
  applyPermanentNpcInjury,
  applyYearlyNpcGrowth,
  assignEpithetIfEligible,
  collectReferencedPersonIds,
  computePowerScoreFromRanks,
  computeRanksFromIdentity,
  generateCharacter,
  generateUniquePersonName,
  isPersonObserved,
  learnNewNpcJutsu,
  personName,
} from './people';
import { clamp } from './powers';
import { applyRel6Delta, buildVectorFromLegacy, createRelVector6 } from './relationships';
import type { SeededRng } from './rng';
import type {
  GameState,
  NpcGoal,
  NpcKnowledge,
  NpcMemory,
  NpcMotivation,
  NpcOccupation,
  NpcPersonality,
  NpcRelationKind,
  NpcSchedule,
  ShinobiRank,
  VillageId,
  VillageSimState,
  WorldHistoryEntry,
  WorldNpc,
  WorldSimState,
} from './types';

export { generateUniquePersonName as generateUniqueNpcName };

export interface WorldDispatch {
  priority: number;
  tone: 'normal' | 'milestone' | 'danger' | 'bond' | 'war' | 'crisis';
  title: string;
  text: string;
}

const MOTIVATION_LABELS: Record<NpcMotivation, string> = {
  protect_village: 'Shield the village from ruin',
  attain_kage: 'Ascend to lead the village',
  restore_clan: 'Elevate the clan name',
  seek_power: 'Master peerless shinobi strength',
  avenge_loss: 'Avenge fallen loved ones',
  peace_reformer: 'Break the cycle of shinobi war',
  shadow_control: 'Steer history from the shadows',
  wanderer_freedom: 'Live unbound by village chains',
};

const SCHEDULE_LABELS: Record<NpcSchedule, string> = {
  academy_drills: 'Academy Drills & Sparring',
  training_ground: 'Intensive Jutsu Training',
  border_patrol: 'Frontier Border Patrol',
  anbu_covert: 'ANBU / Shadow Covert Ops',
  hospital_ward: 'Medical Corps & Triage',
  clan_council: 'Clan Council & Politics',
  diplomatic_envoy: 'Inter-Village Diplomacy',
  kage_office: 'Kage Tower Governance',
  forbidden_research: 'Secret Technique Research',
  wandering_exile: 'Wandering Missing-Nin Exile',
  work_trade: 'Craft, Trade & Village Livelihood',
  home: 'Household & Family Duties',
};

export function getMotivationLabel(m: NpcMotivation): string {
  return MOTIVATION_LABELS[m] ?? m;
}

export function getScheduleLabel(s: NpcSchedule): string {
  return SCHEDULE_LABELS[s] ?? s;
}

export function getPrimaryPersonalityTags(p: NpcPersonality): string[] {
  const entries: [string, number][] = [
    ['Loyal', p.loyal],
    ['Ambitious', p.ambitious],
    ['Cautious', p.cautious],
    ['Cruel', p.cruel],
    ['Compassionate', p.compassionate],
  ];
  entries.sort((a, b) => b[1] - a[1]);
  return [entries[0][0], entries[1][0]];
}

export function recordWorldHistory(
  worldSim: WorldSimState,
  entry: Omit<WorldHistoryEntry, 'id'>,
): void {
  const id = `wh_${entry.year}_${worldSim.history.length}_${entry.layer}`;
  worldSim.history.push({ id, ...entry });
  if (worldSim.history.length > 60) {
    worldSim.history.splice(0, worldSim.history.length - 60);
  }
}

export function addNpcMemory(npc: WorldNpc, mem: NpcMemory): void {
  npc.memory.push(mem);
  if (npc.memory.length > 16) {
    // Drop the oldest low-impact memory so pivotal trauma/triumphs persist
    let dropIdx = 0;
    let lowestWeight = Infinity;
    for (let i = 0; i < npc.memory.length - 4; i++) {
      const w = Math.abs(npc.memory[i].impact);
      if (w < lowestWeight) {
        lowestWeight = w;
        dropIdx = i;
      }
    }
    npc.memory.splice(dropIdx, 1);
  }
}

export function addNpcKnowledge(npc: WorldNpc, item: NpcKnowledge): void {
  if (npc.knowledge.some((k) => k.id === item.id)) return;
  npc.knowledge.push(item);
  if (npc.knowledge.length > 10) {
    npc.knowledge.shift();
  }
}

export function setBidirectionalRelation(
  a: WorldNpc,
  b: WorldNpc,
  kindForA: NpcRelationKind,
  kindForB: NpcRelationKind,
  affinityDelta: number,
  trustDelta: number,
  grudgeDelta = 0,
): void {
  const existingA = a.relationships[b.identity.id];
  const nextAffA = clamp((existingA?.affinity ?? 0) + affinityDelta, -100, 100);
  const nextTrustA = clamp((existingA?.trust ?? 40) + trustDelta, 0, 100);
  const nextGrudgeA = clamp((existingA?.grudge ?? 0) + grudgeDelta, 0, 100);
  const vecA = existingA?.vector
    ? applyRel6Delta(existingA.vector, {
      trust: trustDelta,
      affection: Math.round(affinityDelta * 0.5),
      respect: Math.round(trustDelta * 0.35),
      resentment: grudgeDelta,
      rivalry: kindForA === 'rival' ? 20 : 0,
    })
    : buildVectorFromLegacy({ kind: kindForA, affinity: nextAffA, trust: nextTrustA, grudge: nextGrudgeA });

  a.relationships[b.identity.id] = {
    targetId: b.identity.id,
    targetName: b.identity.name,
    kind: kindForA,
    affinity: nextAffA,
    trust: nextTrustA,
    grudge: nextGrudgeA,
    vector: vecA,
  };

  const existingB = b.relationships[a.identity.id];
  const nextAffB = clamp((existingB?.affinity ?? 0) + affinityDelta, -100, 100);
  const nextTrustB = clamp((existingB?.trust ?? 40) + trustDelta, 0, 100);
  const nextGrudgeB = clamp((existingB?.grudge ?? 0) + grudgeDelta, 0, 100);
  const vecB = existingB?.vector
    ? applyRel6Delta(existingB.vector, {
      trust: trustDelta,
      affection: Math.round(affinityDelta * 0.5),
      respect: Math.round(trustDelta * 0.35),
      resentment: grudgeDelta,
      rivalry: kindForB === 'rival' ? 20 : 0,
    })
    : buildVectorFromLegacy({ kind: kindForB, affinity: nextAffB, trust: nextTrustB, grudge: nextGrudgeB });

  b.relationships[a.identity.id] = {
    targetId: a.identity.id,
    targetName: a.identity.name,
    kind: kindForB,
    affinity: nextAffB,
    trust: nextTrustB,
    grudge: nextGrudgeB,
    vector: vecB,
  };
}

export function setPlayerRelation(
  npc: WorldNpc,
  playerName: string,
  kind: NpcRelationKind,
  affinityDelta: number,
  trustDelta: number,
  grudgeDelta = 0,
): void {
  const existing = npc.relationships.player;
  const nextAff = clamp((existing?.affinity ?? 0) + affinityDelta, -100, 100);
  const nextTrust = clamp((existing?.trust ?? 45) + trustDelta, 0, 100);
  const nextGrudge = clamp((existing?.grudge ?? 0) + grudgeDelta, 0, 100);
  const vec = existing?.vector
    ? applyRel6Delta(existing.vector, {
      trust: trustDelta,
      affection: Math.round(affinityDelta * 0.5),
      respect: Math.round(trustDelta * 0.35),
      resentment: grudgeDelta,
      rivalry: kind === 'rival' ? 18 : 0,
    })
    : buildVectorFromLegacy({ kind, affinity: nextAff, trust: nextTrust, grudge: nextGrudge });
  const recip = existing?.reciprocal
    ? applyRel6Delta(existing.reciprocal, {
      trust: Math.round(trustDelta * 0.7),
      affection: Math.round(affinityDelta * 0.4),
      resentment: Math.round(grudgeDelta * 0.5),
    })
    : createRelVector6({
      trust: nextTrust,
      affection: clamp(Math.round((nextAff + 100) / 2), 0, 100),
      respect: vec.respect,
      fear: 8,
      rivalry: kind === 'rival' ? 58 : 15,
      resentment: Math.round(nextGrudge * 0.6),
    });

  npc.relationships.player = {
    targetId: 'player',
    targetName: playerName,
    kind,
    affinity: nextAff,
    trust: nextTrust,
    grudge: nextGrudge,
    vector: vec,
    reciprocal: recip,
  };
}

export function computeNpcSchedule(
  npc: WorldNpc,
  village: VillageSimState | undefined,
  worldSim: WorldSimState,
): NpcSchedule {
  if (!npc.identity.alive) return 'wandering_exile';
  if (npc.identity.specialStatus === 'missing_nin') {
    return npc.personality.cruel >= 65 || npc.motivation === 'seek_power'
      ? 'forbidden_research'
      : 'wandering_exile';
  }
  if (npc.identity.specialStatus === 'kage') return 'kage_office';

  const occ = npc.identity.occupation ?? 'shinobi';
  if (occ !== 'shinobi' && occ !== 'samurai') {
    if (occ === 'medic') return 'hospital_ward';
    if (occ === 'teacher') return 'academy_drills';
    if (npc.identity.age < 14) return 'home';
    return 'work_trade';
  }

  if (npc.identity.rank === 'academy' || npc.identity.age < 12) return 'academy_drills';
  if (npc.identity.specialStatus === 'anbu') return 'anbu_covert';
  if (npc.identity.specialty === 'medical' && village && village.hospital.capacity >= 50) {
    return 'hospital_ward';
  }
  if (npc.currentGoal.type === 'broker_peace' || village?.policy === 'diplomatic') {
    if (npc.identity.rank === 'jonin' && npc.personality.compassionate >= 55) {
      return 'diplomatic_envoy';
    }
  }
  if (npc.currentGoal.type === 'protect_clan' || npc.identity.roleTitle.includes('Head')) {
    return 'clan_council';
  }
  if (npc.currentGoal.type === 'shadow_scheme') return 'forbidden_research';
  if (npc.identity.rank === 'genin') return 'training_ground';
  if (worldSim.activeDisasters.some((d) => d.villageId === npc.identity.villageId)) {
    return 'hospital_ward';
  }
  return 'border_patrol';
}

export function chooseNextNpcGoal(
  npc: WorldNpc,
  village: VillageSimState | undefined,
  worldSim: WorldSimState,
  rng: SeededRng,
): NpcGoal {
  const id = npc.identity;
  const occ = id.occupation ?? 'shinobi';

  // Civilian residents keep civilian livelihood & family goals (never shinobi exam/defection goals)
  if (occ !== 'shinobi' && occ !== 'samurai') {
    const hasSpouse = Object.values(npc.relationships).some((r) => r.kind === 'spouse');
    if (!hasSpouse && id.age >= 20 && id.age <= 36 && npc.personality.compassionate >= 50 && rng.chance(0.32)) {
      return {
        type: 'marry_partner',
        label: 'Build a warm household in the village',
        progress: 25,
        startedAge: id.age,
      };
    }
    if (id.clanId && rng.chance(0.35)) {
      return {
        type: 'protect_clan',
        label: `Support household affairs in ${VILLAGE_MAP[id.villageId].name}`,
        progress: 20,
        startedAge: id.age,
      };
    }
    const occLabel = OCCUPATION_MAP[occ]?.label.toLowerCase() ?? 'trade';
    return {
      type: 'master_art',
      label:
        id.age < 14
          ? `Grow up safely in ${VILLAGE_MAP[id.villageId].name}`
          : `Advance ${occLabel} craft in ${VILLAGE_MAP[id.villageId].name}`,
      progress: 20,
      startedAge: id.age,
    };
  }

  if (id.specialStatus === 'missing_nin') {
    const enemy = Object.values(npc.relationships).find((r) => r.grudge >= 50 || r.kind === 'enemy');
    if (npc.motivation === 'avenge_loss' && enemy) {
      return {
        type: 'avenge_loss',
        label: `Hunt ${enemy.targetName} to settle an old score`,
        targetId: enemy.targetId,
        progress: 10,
        startedAge: id.age,
      };
    }
    return {
      type: 'master_art',
      label: 'Perfect forbidden jutsu in exile',
      progress: 15,
      startedAge: id.age,
    };
  }

  if (id.specialStatus === 'kage') {
    if (village?.policy === 'diplomatic') {
      return {
        type: 'broker_peace',
        label: `Secure border treaties for ${VILLAGE_MAP[id.villageId].name}`,
        progress: 20,
        startedAge: id.age,
      };
    }
    return {
      type: 'protect_clan',
      label: `Steer ${VILLAGE_MAP[id.villageId].name} through shifting politics`,
      progress: 20,
      startedAge: id.age,
    };
  }

  if (id.rank === 'academy' || id.rank === 'genin') {
    return {
      type: 'pass_chunin',
      label: 'Pass the Chunin Exams and earn a flak jacket',
      progress: id.rank === 'genin' ? 35 : 10,
      startedAge: id.age,
    };
  }

  if (id.specialStatus === 'anbu') {
    const rogue = worldSim.npcs.find(
      (n) => n.identity.alive && n.identity.specialStatus === 'missing_nin' && n.identity.homeVillageId === id.villageId,
    );
    if (rogue) {
      return {
        type: 'hunt_missing_nin',
        label: `Track Missing-Nin ${rogue.identity.name}`,
        targetId: rogue.identity.id,
        progress: 15,
        startedAge: id.age,
      };
    }
    if (npc.personality.cruel >= 55 || npc.motivation === 'shadow_control') {
      return {
        type: 'shadow_scheme',
        label: `Advance ${VILLAGE_MAP[id.villageId].institutions.shadowOrgName} covert agenda`,
        progress: 15,
        startedAge: id.age,
      };
    }
  }

  // Check clan persecution / low loyalty defection pressure
  const clanState = village?.clans.find((c) => c.clanId === id.clanId);
  const persecuted =
    Boolean(village?.academy.bloodyMistActive && id.clanId === 'yuki') ||
    (clanState !== undefined && clanState.loyalty < 36);
  if ((persecuted || npc.motivation === 'avenge_loss') && npc.personality.loyal < 52 && rng.chance(0.45)) {
    return {
      type: 'defect_village',
      label: `Break ties with ${VILLAGE_MAP[id.villageId].name} and walk in exile`,
      progress: 20,
      startedAge: id.age,
    };
  }

  if (id.rank === 'chunin') {
    return {
      type: 'reach_jonin',
      label: 'Earn Jonin evaluation and field command',
      progress: 25,
      startedAge: id.age,
    };
  }

  const hasSpouse = Object.values(npc.relationships).some((r) => r.kind === 'spouse');
  if (!hasSpouse && id.age >= 20 && id.age <= 35 && npc.personality.compassionate >= 52 && rng.chance(0.3)) {
    return {
      type: 'marry_partner',
      label: 'Build a family despite the looming shadow of war',
      progress: 25,
      startedAge: id.age,
    };
  }

  if (npc.personality.ambitious >= 70 || npc.motivation === 'attain_kage') {
    return {
      type: 'seek_kage',
      label: `Build council backing for the ${VILLAGE_MAP[id.villageId].kageTitle} seat`,
      progress: 20,
      startedAge: id.age,
    };
  }

  if (npc.personality.compassionate >= 65 || npc.motivation === 'peace_reformer') {
    return {
      type: 'broker_peace',
      label: 'De-escalate border rivalries through envoy talks',
      progress: 20,
      startedAge: id.age,
    };
  }

  return {
    type: 'master_art',
    label: `Master ${DISCIPLINE_MAP[id.specialty]?.name ?? id.specialty}`,
    progress: 20,
    startedAge: id.age,
  };
}

export function seedInitialWorldNpcs(
  state: GameState,
  worldSim: WorldSimState,
  rng: SeededRng,
): void {
  const usedNames = new Set<string>([state.name, ...state.family.map((f) => personName(state, f.personId))]);
  const startYear = state.birthYear + state.age;
  const genCtx = { birthYear: state.birthYear, age: state.age, name: state.name, worldSim };
  const civilianOccs: readonly NpcOccupation[] = ['merchant', 'blacksmith', 'farmer', 'artisan', 'medic', 'teacher'];

  // 1. Seed all 5 Great Villages with rich institutional, personal & civilian casts
  for (const vDef of GREAT_VILLAGES) {
    const vSim = worldSim.villages[vDef.id];
    const clans = getClansForVillage(vDef.id);
    const primaryClan = clans[0] ?? null;

    // Kage
    const kage = generateCharacter(
      genCtx,
      {
        villageId: vDef.id,
        clanId: primaryClan?.id ?? null,
        occupation: 'shinobi',
        age: rng.int(36, 54),
        rank: 'jonin',
        specialStatus: 'kage',
        roleTitle: vDef.kageTitle,
        roleBias: 'kage',
        personalityBias:
          vDef.id === 'kiri'
            ? { cautious: 15, cruel: 18 }
            : vDef.id === 'konoha'
              ? { loyal: 18, compassionate: 16 }
              : vDef.id === 'kumo'
                ? { ambitious: 16, loyal: 15 }
                : { loyal: 12, cautious: 12 },
        usedNames,
      },
      rng,
    );
    vSim.kageNpcId = kage.identity.id;
    if (vSim.clans[0]) vSim.clans[0].headNpcId = kage.identity.id;

    // Shadow / ANBU Commander
    const shadowHead = generateCharacter(
      genCtx,
      {
        villageId: vDef.id,
        clanId: clans[1]?.id ?? primaryClan?.id ?? null,
        occupation: 'shinobi',
        age: rng.int(30, 46),
        rank: 'jonin',
        specialStatus: 'anbu',
        roleTitle: `${vDef.institutions.shadowOrgName} Chief`,
        roleBias: 'shadow',
        specialty: vDef.id === 'suna' ? 'puppetry' : vDef.id === 'kiri' ? 'silent_killing' : 'interrogation',
        personalityBias: { cautious: 18, cruel: 22, ambitious: 14, compassionate: -18 },
        usedNames,
      },
      rng,
    );
    addNpcKnowledge(shadowHead, {
      id: `know_init_${vDef.id}_shadow`,
      topic: vDef.id === 'kiri' ? 'bloodline_purge' : 'root_plot',
      detail:
        vDef.id === 'kiri'
          ? `Maintains a secret ledger of bloodline families inside ${vDef.name} under Bloody Mist edicts.`
          : `Oversees unapproved ${vDef.institutions.shadowOrgName} contingencies watching rival clans and foreign borders.`,
      secret: true,
      learnedYear: startYear,
    });

    // Kage <-> Shadow Chief relationship (uneasy ally or rival)
    setBidirectionalRelation(
      kage,
      shadowHead,
      vDef.id === 'konoha' ? 'rival' : 'ally',
      vDef.id === 'konoha' ? 'rival' : 'ally',
      vDef.id === 'konoha' ? -15 : 22,
      vDef.id === 'konoha' ? 35 : 62,
      vDef.id === 'konoha' ? 20 : 0,
    );

    // 2 Clan Heads (for clans index 1 and 2, or reformist/volatile houses)
    const clanHeadIndices = clans.length >= 3 ? [1, 2] : clans.length === 2 ? [1] : [];
    const villageHeads: WorldNpc[] = [];
    for (const cIdx of clanHeadIndices) {
      const cDef = clans[cIdx];
      const head = generateCharacter(
        genCtx,
        {
          villageId: vDef.id,
          clanId: cDef.id,
          occupation: 'shinobi',
          age: rng.int(27, 45),
          rank: 'jonin',
          specialStatus: 'none',
          roleTitle: `${cDef.name} Head`,
          roleBias: 'clan_head',
          personalityBias:
            cDef.politicalBias === 'proud'
              ? { ambitious: 20, loyal: -12 }
              : cDef.politicalBias === 'reformist'
                ? { compassionate: 18, cautious: 10 }
                : { loyal: 14 },
          usedNames,
        },
        rng,
      );
      if (cDef.politicalBias === 'proud' || cDef.id === 'yuki') {
        addNpcKnowledge(head, {
          id: `know_clan_${cDef.id}`,
          topic: 'clan_unrest',
          detail: `Aware of simmering distrust between the ${cDef.name} and ${vDef.institutions.shadowOrgName}.`,
          secret: true,
          learnedYear: startYear,
        });
      }
      villageHeads.push(head);
      const vc = vSim.clans.find((c) => c.clanId === cDef.id);
      if (vc) vc.headNpcId = head.identity.id;
      setBidirectionalRelation(
        kage,
        head,
        cDef.startingLoyalty < 60 ? 'rival' : 'ally',
        cDef.startingLoyalty < 60 ? 'rival' : 'ally',
        cDef.startingLoyalty < 60 ? -10 : 25,
        cDef.startingLoyalty,
        cDef.startingLoyalty < 60 ? 18 : 0,
      );
    }

    // 1-2 Rising Peers (extra peer in player's own village!)
    const peerCount = vDef.id === state.villageId ? 2 : 1;
    for (let p = 0; p < peerCount; p++) {
      const peerClan = clans.length > 0 ? clans[(p + 1) % clans.length] : null;
      const isYouth = vDef.id === state.villageId && p === 0;
      const peerAge = isYouth ? Math.max(1, state.age + rng.int(1, 3)) : rng.int(13, 21);
      const peerRank: ShinobiRank = peerAge < 6 ? 'civilian' : peerAge < 12 ? 'academy' : peerAge < 16 ? 'genin' : 'chunin';
      const peer = generateCharacter(
        genCtx,
        {
          villageId: vDef.id,
          clanId: peerClan?.id ?? null,
          occupation: 'shinobi',
          age: peerAge,
          rank: peerRank,
          specialStatus: 'none',
          roleTitle: peerRank === 'chunin' ? 'Rising Chunin' : peerRank === 'genin' ? 'Young Genin' : 'Village Youth',
          roleBias: 'peer',
          observed: vDef.id === state.villageId && p === 0,
          usedNames,
        },
        rng,
      );

      const mentor = villageHeads[p % Math.max(1, villageHeads.length)] ?? kage;
      if (mentor) {
        setBidirectionalRelation(peer, mentor, 'mentor', 'student', 35, 68, 0);
      }
      if (vDef.id === state.villageId && p === 0) {
        setPlayerRelation(peer, state.name, 'friend', 15, 50, 0);
      }
    }

    // 1-2 Civilian residents (merchants, blacksmiths, medics, artisans, farmers, teachers)
    const civCount = vDef.id === state.villageId ? 2 : 1;
    for (let c = 0; c < civCount; c++) {
      const civOcc = rng.pick(civilianOccs);
      generateCharacter(
        genCtx,
        {
          villageId: vDef.id,
          occupation: civOcc,
          age: rng.int(22, 56),
          rank: 'civilian',
          specialStatus: 'none',
          roleBias: 'peer',
          usedNames,
        },
        rng,
      );
    }
  }

  // 2. Seed key Minor Villages (ame, oto, iron + player's minor village if applicable)
  const minorTargets: VillageId[] = ['ame', 'oto', 'iron'];
  if (VILLAGE_MAP[state.villageId].tier === 'minor' && !minorTargets.includes(state.villageId)) {
    minorTargets.push(state.villageId);
  }
  for (const mId of minorTargets) {
    const vDef = VILLAGE_MAP[mId];
    const vSim = worldSim.villages[mId];
    const clans = getClansForVillage(mId);
    const leaderOcc: NpcOccupation = mId === 'iron' ? 'samurai' : 'shinobi';
    const leader = generateCharacter(
      genCtx,
      {
        villageId: mId,
        clanId: clans[0]?.id ?? null,
        occupation: leaderOcc,
        age: rng.int(32, 50),
        rank: 'jonin',
        specialStatus: 'kage',
        roleTitle: vDef.kageTitle,
        roleBias: 'kage',
        personalityBias: mId === 'oto' ? { ambitious: 25, cruel: 25 } : { cautious: 15 },
        usedNames,
      },
      rng,
    );
    vSim.kageNpcId = leader.identity.id;
    if (vSim.clans[0]) vSim.clans[0].headNpcId = leader.identity.id;

    if (mId === state.villageId) {
      const peer = generateCharacter(
        genCtx,
        {
          villageId: mId,
          clanId: clans[0]?.id ?? null,
          occupation: leaderOcc,
          age: Math.max(2, state.age + rng.int(1, 4)),
          rank: state.age < 6 ? 'civilian' : 'academy',
          specialStatus: 'none',
          roleTitle: 'Village Peer',
          roleBias: 'peer',
          observed: true,
          usedNames,
        },
        rng,
      );
      setBidirectionalRelation(peer, leader, 'mentor', 'student', 30, 62, 0);
      setPlayerRelation(peer, state.name, 'friend', 18, 52, 0);

      generateCharacter(
        genCtx,
        {
          villageId: mId,
          occupation: mId === 'waves' ? 'merchant' : rng.pick(civilianOccs),
          age: rng.int(24, 52),
          rank: 'civilian',
          specialStatus: 'none',
          roleBias: 'peer',
          usedNames,
        },
        rng,
      );
    }
  }
}

function handleNpcDeathConsequences(
  npc: WorldNpc,
  cause: string,
  state: GameState,
  worldSim: WorldSimState,
  rng: SeededRng,
): void {
  const year = state.birthYear + state.age;
  npc.identity.alive = false;
  npc.identity.deathAge = npc.identity.age;
  npc.identity.deathCause = cause;

  const village = worldSim.villages[npc.identity.villageId];
  if (village) {
    if (village.kageNpcId === npc.identity.id) {
      village.kageNpcId = null;
      village.stability = clamp(village.stability - 10, 10, 100);
      village.morale = clamp(village.morale - 8, 10, 100);
    }
    if (npc.identity.clanId) {
      const cState = village.clans.find((c) => c.clanId === npc.identity.clanId);
      if (cState && cState.headNpcId === npc.identity.id) {
        cState.headNpcId = null;
        cState.power = clamp(cState.power - 8, 15, 100);
      }
    }
  }

  // Cascade grief, motivation shifts, and memories to every connected living NPC
  for (const other of worldSim.npcs) {
    if (!other.identity.alive || other.identity.id === npc.identity.id) continue;
    const rel = other.relationships[npc.identity.id];
    if (!rel) continue;
    if (rel.kind === 'student' || rel.kind === 'mentor' || rel.kind === 'spouse' || rel.kind === 'family' || rel.kind === 'friend') {
      const roleLabel =
        rel.kind === 'mentor'
          ? 'mentor'
          : rel.kind === 'spouse'
            ? 'spouse'
            : rel.kind === 'student'
              ? 'student'
              : 'close comrade';
      addNpcMemory(other, {
        year,
        age: other.identity.age,
        tag: 'loss',
        summary: `Lost ${roleLabel} ${npc.identity.name} (${cause}).`,
        actorId: npc.identity.id,
        impact: -9,
      });
      if (cause !== 'old age' && rng.chance(0.55)) {
        if (other.personality.compassionate >= 65) {
          other.motivation = 'peace_reformer';
          other.currentGoal = {
            type: 'broker_peace',
            label: `End the bloodshed that claimed ${npc.identity.name}`,
            progress: 15,
            startedAge: other.identity.age,
          };
        } else if (other.personality.ambitious >= 55 || other.personality.cruel >= 45) {
          other.motivation = 'avenge_loss';
          other.personality.loyal = clamp(other.personality.loyal - 12, 5, 98);
          other.currentGoal = {
            type: other.personality.loyal < 42 ? 'defect_village' : 'avenge_loss',
            label:
              other.personality.loyal < 42
                ? `Abandon ${VILLAGE_MAP[other.identity.villageId].name} after ${npc.identity.name}'s death`
                : `Avenge the death of ${npc.identity.name}`,
            progress: 25,
            startedAge: other.identity.age,
          };
        }
      }
    }
  }
}

export function triggerNpcDefection(
  npc: WorldNpc,
  reason: string,
  state: GameState,
  worldSim: WorldSimState,
  dispatches: WorldDispatch[],
): void {
  if (!npc.identity.alive || npc.identity.specialStatus === 'missing_nin') return;
  const year = state.birthYear + state.age;
  const homeVillage = worldSim.villages[npc.identity.homeVillageId];
  const vName = VILLAGE_MAP[npc.identity.homeVillageId].name;

  npc.identity.specialStatus = 'missing_nin';
  npc.identity.roleTitle = 'Missing-Nin Rogue';
  npc.schedule = 'wandering_exile';
  npc.currentGoal = {
    type: 'master_art',
    label: 'Survive Hunter-Nin pursuit and grow stronger in exile',
    progress: 10,
    startedAge: npc.identity.age,
  };

  addNpcMemory(npc, {
    year,
    age: npc.identity.age,
    tag: 'defection',
    summary: `Defected from ${vName}: ${reason}.`,
    impact: -8,
  });

  // Organizational consequences: village stability & clan loyalty drop; ANBU begins hunt!
  if (homeVillage) {
    if (homeVillage.kageNpcId === npc.identity.id) homeVillage.kageNpcId = null;
    homeVillage.stability = clamp(homeVillage.stability - 6, 10, 100);
    homeVillage.morale = clamp(homeVillage.morale - 3, 10, 100);
    homeVillage.anbu.activeOp = `Hunting Missing-Nin ${npc.identity.name}`;

    if (npc.identity.clanId) {
      const cState = homeVillage.clans.find((c) => c.clanId === npc.identity.clanId);
      if (cState) {
        cState.loyalty = clamp(cState.loyalty - 8, 10, 100);
        cState.reputation = clamp(cState.reputation - 10, 10, 100);
        if (cState.headNpcId === npc.identity.id) cState.headNpcId = null;
      }
    }

    // Give home village ANBU / Hunter-Nin knowledge of the rogue
    const hunter = worldSim.npcs.find(
      (n) =>
        n.identity.alive &&
        n.identity.villageId === npc.identity.homeVillageId &&
        n.identity.specialStatus === 'anbu' &&
        n.identity.id !== npc.identity.id,
    );
    if (hunter) {
      addNpcKnowledge(hunter, {
        id: `know_hunt_${npc.identity.id}`,
        topic: 'missing_nin_loc',
        detail: `Tracking rogue ${npc.identity.name} along the ${vName} borderlands.`,
        secret: false,
        learnedYear: year,
        subjectId: npc.identity.id,
      });
      hunter.currentGoal = {
        type: 'hunt_missing_nin',
        label: `Eliminate or capture Missing-Nin ${npc.identity.name}`,
        targetId: npc.identity.id,
        progress: 20,
        startedAge: hunter.identity.age,
      };
    }
  }

  // Relationship fallout with former friends/mentors
  for (const other of worldSim.npcs) {
    if (!other.identity.alive || other.identity.id === npc.identity.id) continue;
    const rel = other.relationships[npc.identity.id];
    if (rel && other.identity.villageId === npc.identity.homeVillageId) {
      rel.trust = clamp(rel.trust - 30, 0, 100);
      rel.grudge = clamp(rel.grudge + 22, 0, 100);
      if (other.personality.loyal >= 60) rel.kind = 'enemy';
      addNpcMemory(other, {
        year,
        age: other.identity.age,
        tag: 'defection',
        summary: `${npc.identity.name} abandoned ${vName} and entered the Bingo Book.`,
        actorId: npc.identity.id,
        impact: -6,
      });
    }
  }

  recordWorldHistory(worldSim, {
    year,
    layer: 'npc',
    title: `${npc.identity.name} Defects from ${vName}`,
    summary: `${npc.identity.name} left ${vName} as a Missing-Nin (${reason}), prompting an immediate ANBU pursuit.`,
    villageId: npc.identity.homeVillageId,
    npcId: npc.identity.id,
    tone: 'danger',
  });

  const isRelevant = npc.identity.homeVillageId === state.villageId || Boolean(npc.relationships.player);
  dispatches.push({
    priority: isRelevant ? 92 : 55,
    tone: 'danger',
    title: `Bingo Book Alert: ${npc.identity.name}`,
    text: `${npc.identity.name} (${vName}) has abandoned their headband and fled as a Missing-Nin (${reason}). ${VILLAGE_MAP[npc.identity.homeVillageId].institutions.shadowOrgName} units have been dispatched.`,
  });
}

function returnNpcToL3Population(worldSim: WorldSimState, npc: WorldNpc): void {
  const vSim = worldSim.villages[npc.identity.villageId];
  if (!vSim) return;
  const pop = ensureVillagePopulation(vSim);
  const id = npc.identity;
  if (id.occupation !== 'shinobi' && id.occupation !== 'samurai') {
    pop.civilians += 1;
  } else if (id.age >= 55) {
    pop.veterans += 1;
  } else if (id.rank === 'academy') {
    pop.academyCadets += 1;
  } else if (id.rank === 'genin') {
    pop.geninCorps += 1;
  } else if (id.rank === 'chunin') {
    pop.chuninCorps += 1;
  } else if (id.rank === 'jonin') {
    pop.joninCorps += 1;
  } else {
    pop.civilians += 1;
  }
}

export function tickAutonomousNpcs(
  state: GameState,
  worldSim: WorldSimState,
  rng: SeededRng,
): WorldDispatch[] {
  const dispatches: WorldDispatch[] = [];
  const year = state.birthYear + state.age;

  // Dynamic L1 / L2 LOD tier rebalancing before ticking NPCs
  rebalanceNpcLodTiers(state, worldSim);

  for (const npc of worldSim.npcs) {
    if (!npc.identity.alive) continue;
    const id = npc.identity;
    const village = worldSim.villages[id.villageId];
    const vDef = VILLAGE_MAP[id.villageId];
    const isPlayerVillage = id.villageId === state.villageId;
    const knowsPlayer = Boolean(npc.relationships.player);
    const isCombatant = id.occupation === 'shinobi' || id.occupation === 'samurai';

    // 1. Canonical once-per-year aging & potential-driven growth (G4)
    id.age += 1;
    applyYearlyNpcGrowth(npc, rng);

    // 2. Refresh daily/yearly schedule & execute 6-stage Cognitive AI (Utility AI + GOAP + Memory)
    npc.schedule = computeNpcSchedule(npc, village, worldSim);
    const cogReport = tickNpcCognitiveCycle(npc, state, worldSim, rng);
    if (cogReport?.dispatch) {
      dispatches.push(cogReport.dispatch);
    }

    // 3. Independent Off-Screen Mortality (active disasters, war tension, covert risk, old age; mitigated by Hospital)
    const activeDisaster = worldSim.activeDisasters.find((d) => d.villageId === id.villageId);
    const hospitalSave = village ? (village.hospital.capacity - 60) * 0.0004 : 0;
    const oldAgeRisk = id.age >= 65 ? 0.03 + (id.age - 65) * 0.015 : 0;
    const fieldRisk =
      id.age >= 15 && id.age < 65
        ? (!isCombatant
          ? 0.002
          : npc.schedule === 'border_patrol' || npc.schedule === 'anbu_covert'
            ? 0.016
            : 0.006) +
        (state.world.tension >= 65 ? (isCombatant ? 0.012 : 0.003) : 0) +
        (activeDisaster ? activeDisaster.severity * 0.012 : 0)
        : 0;
    const deathChance = clamp(oldAgeRisk + Math.max(0.001, fieldRisk - hospitalSave), 0, 0.45);

    // Protect active squad members & parents/spouse (parents/spouse mortality triggers dedicated grief/legacy beats in tickFamilyYear)
    // Siblings and children DO age and experience natural NPC mortality here!
    const isProtectedActiveSquad = Boolean(
      state.team?.active && state.team.members.some((m) => m.personId === id.id),
    );
    const isParentOrSpouse = state.family.some(
      (f) => f.personId === id.id && (f.relation === 'father' || f.relation === 'mother' || f.relation === 'spouse'),
    );
    if (!isProtectedActiveSquad && !isParentOrSpouse && rng.chance(deathChance)) {
      const cause =
        id.age >= 65
          ? 'old age'
          : activeDisaster
            ? `casualties during the ${activeDisaster.title}`
            : !isCombatant
              ? 'an unexpected fever'
              : npc.schedule === 'anbu_covert'
                ? 'a failed covert mission behind enemy lines'
                : id.specialStatus === 'missing_nin'
                  ? 'a fatal clash with Hunter-Nin pursuers'
                  : 'an enemy border ambush while on assignment';
      handleNpcDeathConsequences(npc, cause, state, worldSim, rng);

      if (id.specialStatus === 'kage' || isPlayerVillage || knowsPlayer) {
        recordWorldHistory(worldSim, {
          year,
          layer: 'npc',
          title: `Passing of ${id.name}`,
          summary: `${id.name} (${id.roleTitle} of ${vDef.name}) died at age ${id.age} from ${cause}.`,
          villageId: id.villageId,
          npcId: id.id,
          tone: 'danger',
        });
        dispatches.push({
          priority: id.specialStatus === 'kage' ? 96 : knowsPlayer ? 88 : 68,
          tone: 'danger',
          title: id.specialStatus === 'kage' ? `${vDef.kageTitle} Fallen: ${id.name}` : `Dispatch: ${id.name} Fallen`,
          text: `While you were occupied elsewhere, word arrived that ${id.name} (${id.roleTitle}, ${vDef.name}) died at age ${id.age} from ${cause}.`,
        });
      }
      continue;
    }

    // 4. Advance active Goal & trigger independent life outcomes with real consequences!
    npc.currentGoal.progress = clamp(npc.currentGoal.progress + rng.int(16, 34), 0, 100);

    // Academy Graduation (age 12): ONLY Academy cadets graduate to Genin; civilians remain civilians!
    if (isCombatant && id.rank === 'academy' && id.age >= 12) {
      id.rank = 'genin';
      id.roleTitle = id.occupation === 'samurai' ? 'Young Samurai' : 'Village Genin';
      id.powerScore = computePowerScoreFromRanks(computeRanksFromIdentity(id));
      learnNewNpcJutsu(npc, rng);
      addNpcMemory(npc, {
        year,
        age: id.age,
        tag: 'promotion',
        summary: `Graduated from the ${vDef.institutions.academyLabel} as a Genin.`,
        impact: 4,
      });
      npc.currentGoal = chooseNextNpcGoal(npc, village, worldSim, rng);
      continue;
    }

    // Goal Resolution when progress reaches 100
    if (npc.currentGoal.progress >= 100) {
      const gType = npc.currentGoal.type;

      if (isCombatant && gType === 'pass_chunin' && id.rank === 'genin' && id.age >= 13) {
        const academyMod = village ? (village.academy.quality - 60) * 0.25 : 0;
        const passChance = clamp(0.42 + (id.powerScore - 40) * 0.015 + academyMod * 0.01, 0.22, 0.85);
        if (rng.chance(passChance)) {
          id.rank = 'chunin';
          id.roleTitle = id.occupation === 'samurai' ? 'Sworn Samurai' : 'Village Chunin';
          id.powerScore = computePowerScoreFromRanks(computeRanksFromIdentity(id));
          learnNewNpcJutsu(npc, rng);
          assignEpithetIfEligible(npc, rng);
          addNpcMemory(npc, {
            year,
            age: id.age,
            tag: 'exam',
            summary: `Passed the Chunin Exams and earned the ${vDef.name} flak jacket.`,
            impact: 6,
          });
          if (village) village.morale = clamp(village.morale + 1, 10, 100);
          if (isPlayerVillage || knowsPlayer) {
            dispatches.push({
              priority: knowsPlayer ? 74 : 52,
              tone: 'milestone',
              title: `Chunin Promotion: ${id.name}`,
              text: `${id.name} of ${vDef.name} cleared the Chunin Exams independently and earned their flak jacket.`,
            });
          }
          npc.currentGoal = chooseNextNpcGoal(npc, village, worldSim, rng);
        } else {
          // Real consequence of FAILING the Chunin Exam!
          addNpcMemory(npc, {
            year,
            age: id.age,
            tag: 'exam',
            summary: `Failed the Chunin Exams at age ${id.age}, bruising their pride.`,
            impact: -4,
          });
          if (npc.personality.ambitious >= 62 || npc.personality.cruel >= 55) {
            npc.personality.loyal = clamp(npc.personality.loyal - 7, 5, 98);
            npc.personality.cruel = clamp(npc.personality.cruel + 5, 5, 98);
            if (npc.personality.loyal < 38) {
              npc.currentGoal = {
                type: 'defect_village',
                label: `Seek forbidden strength outside ${vDef.name}`,
                progress: 35,
                startedAge: id.age,
              };
            } else {
              npc.currentGoal.progress = 20;
            }
          } else {
            npc.currentGoal.progress = 25;
          }
          if (knowsPlayer) {
            dispatches.push({
              priority: 62,
              tone: 'normal',
              title: `Chunin Exam Setback: ${id.name}`,
              text: `${id.name} failed to earn promotion in the latest Chunin Exams and returned to ${vDef.name} determined to prove themselves.`,
            });
          }
        }
      } else if (isCombatant && gType === 'reach_jonin' && id.rank === 'chunin' && id.age >= 17) {
        if (id.powerScore >= 58 && rng.chance(0.65)) {
          id.rank = 'jonin';
          id.roleTitle = id.occupation === 'samurai' ? 'Samurai Captain' : 'Village Jonin';
          id.powerScore = computePowerScoreFromRanks(computeRanksFromIdentity(id));
          learnNewNpcJutsu(npc, rng);
          assignEpithetIfEligible(npc, rng);
          addNpcMemory(npc, {
            year,
            age: id.age,
            tag: 'promotion',
            summary: `Promoted to elite Jonin of ${vDef.name}.`,
            impact: 7,
          });
          if (village) village.military = clamp(village.military + 2, 10, 100);
          if (isPlayerVillage || knowsPlayer) {
            dispatches.push({
              priority: knowsPlayer ? 76 : 50,
              tone: 'milestone',
              title: `Jonin Appointment: ${id.name}`,
              text: `${id.name} has been elevated to Jonin of ${vDef.name}, taking command of frontier squads.`,
            });
          }
        }
        npc.currentGoal = chooseNextNpcGoal(npc, village, worldSim, rng);
      } else if (gType === 'marry_partner' && id.specialStatus !== 'missing_nin') {
        const hasSpouse = Object.values(npc.relationships).some((r) => r.kind === 'spouse');
        if (!hasSpouse) {
          const partner = worldSim.npcs.find(
            (other) =>
              other.identity.alive &&
              other.identity.id !== id.id &&
              other.identity.villageId === id.villageId &&
              other.identity.specialStatus !== 'missing_nin' &&
              other.identity.age >= 19 &&
              Math.abs(other.identity.age - id.age) <= 10 &&
              !Object.values(other.relationships).some((r) => r.kind === 'spouse'),
          );
          if (partner) {
            setBidirectionalRelation(npc, partner, 'spouse', 'spouse', 45, 35, 0);
            addNpcMemory(npc, {
              year,
              age: id.age,
              tag: 'marriage',
              summary: `Married ${partner.identity.name} in ${vDef.name}.`,
              actorId: partner.identity.id,
              impact: 8,
            });
            addNpcMemory(partner, {
              year,
              age: partner.identity.age,
              tag: 'marriage',
              summary: `Married ${id.name} in ${vDef.name}.`,
              actorId: id.id,
              impact: 8,
            });
            if (village) village.morale = clamp(village.morale + 2, 10, 100);
            if (isPlayerVillage || knowsPlayer || Boolean(partner.relationships.player)) {
              dispatches.push({
                priority: knowsPlayer ? 72 : 48,
                tone: 'bond',
                title: `Village Wedding: ${id.name}`,
                text: `${id.name} and ${partner.identity.name} married in ${vDef.name}, binding their households amid uncertain times.`,
              });
            }
          }
        }
        npc.currentGoal = chooseNextNpcGoal(npc, village, worldSim, rng);
      } else if (isCombatant && gType === 'defect_village' && id.specialStatus !== 'missing_nin' && id.specialStatus !== 'kage') {
        const clanState = village?.clans.find((c) => c.clanId === id.clanId);
        const reason =
          village?.academy.bloodyMistActive && id.clanId === 'yuki'
            ? 'fleeing Bloody Mist bloodline persecution'
            : npc.motivation === 'avenge_loss'
              ? 'pursuing vengeance outside village law'
              : clanState && clanState.loyalty < 40
                ? 'bitter clan rift with village leadership'
                : 'disillusionment and forbidden ambition';
        triggerNpcDefection(npc, reason, state, worldSim, dispatches);
      } else if (isCombatant && gType === 'hunt_missing_nin' && npc.currentGoal.targetId) {
        const target = worldSim.npcs.find((n) => n.identity.id === npc.currentGoal.targetId && n.identity.alive);
        if (target) {
          const hunterWinChance = clamp(0.5 + (id.powerScore - target.identity.powerScore) * 0.015, 0.25, 0.78);
          if (rng.chance(hunterWinChance)) {
            handleNpcDeathConsequences(
              target,
              `tracked down and slain by ${id.name} of ${vDef.name}`,
              state,
              worldSim,
              rng,
            );
            addNpcMemory(npc, {
              year,
              age: id.age,
              tag: 'war',
              summary: `Eliminated Missing-Nin ${target.identity.name} on border pursuit.`,
              actorId: target.identity.id,
              impact: 5,
            });
            if (village) {
              village.stability = clamp(village.stability + 4, 10, 100);
              village.anbu.activeOp = null;
            }
            recordWorldHistory(worldSim, {
              year,
              layer: 'npc',
              title: `Missing-Nin ${target.identity.name} Eliminated`,
              summary: `${id.name} intercepted and defeated rogue shinobi ${target.identity.name} outside ${vDef.name}.`,
              villageId: id.villageId,
              npcId: target.identity.id,
              tone: 'war',
            });
            dispatches.push({
              priority: isPlayerVillage || Boolean(target.relationships.player) ? 84 : 50,
              tone: 'war',
              title: `Bingo Book Closed: ${target.identity.name}`,
              text: `${id.name} (${vDef.institutions.shadowOrgName}) tracked down Missing-Nin ${target.identity.name} in the borderlands and ended their flight.`,
            });
          } else {
            // Missing-Nin turns the tables on the hunter!
            const idx = rng.int(0, 4);
            target.identity.statBias[idx] = Number(clamp(target.identity.statBias[idx] + 0.08, -0.6, 0.9).toFixed(3));
            target.identity.powerScore = computePowerScoreFromRanks(computeRanksFromIdentity(target.identity));
            learnNewNpcJutsu(target, rng);
            addNpcMemory(target, {
              year,
              age: target.identity.age,
              tag: 'war',
              summary: `Repelled Hunter-Nin ${id.name} in a bloody border skirmish.`,
              actorId: id.id,
              impact: 5,
            });
            if (rng.chance(0.45)) {
              handleNpcDeathConsequences(npc, `slain by Missing-Nin ${target.identity.name}`, state, worldSim, rng);
              if (isPlayerVillage) {
                dispatches.push({
                  priority: 82,
                  tone: 'danger',
                  title: `Hunter-Nin Ambush: ${id.name} Fallen`,
                  text: `Missing-Nin ${target.identity.name} turned the tables on pursuer ${id.name}, leaving ${vDef.name} reeling.`,
                });
              }
            } else {
              // G4 Permanent Injury: hunter survived a brutal clash with lasting scars
              applyPermanentNpcInjury(npc, year, `wounded by Missing-Nin ${target.identity.name}`);
            }
          }
        }
        npc.currentGoal = chooseNextNpcGoal(npc, village, worldSim, rng);
      } else if (gType === 'shadow_scheme' && village) {
        // Covert plot generates secret knowledge and impacts Shadow Org / Clan loyalty
        village.shadowOrg.influence = clamp(village.shadowOrg.influence + 4, 10, 100);
        const secretId = `know_plot_${id.villageId}_${year}`;
        addNpcKnowledge(npc, {
          id: secretId,
          topic: 'root_plot',
          detail: `${vDef.institutions.shadowOrgName} moved covert assets inside ${vDef.name} to pressure rival clans.`,
          secret: true,
          learnedYear: year,
          subjectId: id.id,
        });
        // Leak chance: trusted ally or rival discovers the secret
        if (rng.chance(0.42)) {
          const witness = worldSim.npcs.find(
            (o) =>
              o.identity.alive &&
              o.identity.villageId === id.villageId &&
              o.identity.id !== id.id &&
              o.identity.specialStatus !== 'anbu',
          );
          if (witness) {
            addNpcKnowledge(witness, {
              id: secretId,
              topic: 'root_plot',
              detail: `Uncovered proof of a covert ${vDef.institutions.shadowOrgName} operation led by ${id.name}.`,
              secret: true,
              learnedYear: year,
              subjectId: id.id,
            });
            addNpcMemory(witness, {
              year,
              age: witness.identity.age,
              tag: 'secret',
              summary: `Learned of ${id.name}'s secret ${vDef.institutions.shadowOrgName} plot.`,
              actorId: id.id,
              impact: -4,
            });
          }
        }
        npc.currentGoal = chooseNextNpcGoal(npc, village, worldSim, rng);
      } else if (gType === 'broker_peace' && village) {
        // NPC diplomat helps cool tension with a strained neighbor
        village.morale = clamp(village.morale + 2, 10, 100);
        addNpcMemory(npc, {
          year,
          age: id.age,
          tag: 'politics',
          summary: `Led quiet envoy talks to ease frontier friction for ${vDef.name}.`,
          impact: 4,
        });
        npc.currentGoal = chooseNextNpcGoal(npc, village, worldSim, rng);
      } else {
        // master_art / seek_kage / protect_clan / avenge_loss progress payoff
        if (isCombatant) {
          const statIdx = rng.int(0, 4);
          id.statBias[statIdx] = Number(clamp(id.statBias[statIdx] + 0.05, -0.6, 0.9).toFixed(3));
          id.powerScore = computePowerScoreFromRanks(computeRanksFromIdentity(id));
          learnNewNpcJutsu(npc, rng);
          assignEpithetIfEligible(npc, rng);
        }
        if (gType === 'protect_clan' && village && id.clanId) {
          const cs = village.clans.find((c) => c.clanId === id.clanId);
          if (cs) {
            cs.power = clamp(cs.power + 3, 10, 100);
            cs.loyalty = clamp(cs.loyalty + 3, 10, 100);
          }
        }
        npc.currentGoal = chooseNextNpcGoal(npc, village, worldSim, rng);
      }
    }
  }

  // 5. Generational Replenishment: ensure each Great Village keeps a healthy cast of living NPCs
  const usedNames = new Set(worldSim.npcs.map((n) => n.identity.name));
  const livingCount = worldSim.npcs.filter((n) => n.identity.alive).length;
  if (livingCount < 32) {
    for (const vDef of GREAT_VILLAGES) {
      const vLiving = worldSim.npcs.filter((n) => n.identity.alive && n.identity.villageId === vDef.id);
      if (vLiving.length < 4) {
        const clans = getClansForVillage(vDef.id);
        const clan = clans.length > 0 ? rng.pick(clans) : null;
        const youth = generateCharacter(
          state,
          {
            villageId: vDef.id,
            clanId: clan?.id ?? null,
            occupation: 'shinobi',
            age: rng.int(9, 13),
            rank: 'academy',
            specialStatus: 'none',
            roleTitle: 'Academy Prodigy',
            roleBias: 'peer',
            usedNames,
          },
          rng,
        );
        const senior = vLiving.find((n) => n.identity.rank === 'jonin');
        if (senior) {
          setBidirectionalRelation(youth, senior, 'mentor', 'student', 28, 60, 0);
        }
      }
    }
  }

  // 6. G3 Persistence & Culling (Posture B, cap 120):
  // NEVER cull any person observed by the player (living OR dead).
  // Unobserved dead NPCs are trimmed first; excess unobserved living L2 NPCs return to L3 population.
  const protectedIds = collectReferencedPersonIds(state);
  const isProtected = (n: WorldNpc): boolean => isPersonObserved(state, n, protectedIds);

  const deadUnobserved = worldSim.npcs.filter((n) => !n.identity.alive && !isProtected(n));
  if (deadUnobserved.length > 24) {
    const toRemove = new Set(deadUnobserved.slice(0, deadUnobserved.length - 24).map((n) => n.identity.id));
    worldSim.npcs = worldSim.npcs.filter((n) => !toRemove.has(n.identity.id));
  }
  if (worldSim.npcs.length > 120) {
    const deadExcess = worldSim.npcs.filter((n) => !n.identity.alive && !isProtected(n));
    const dropDead = Math.min(deadExcess.length, worldSim.npcs.length - 120);
    if (dropDead > 0) {
      const toRemove = new Set(deadExcess.slice(0, dropDead).map((n) => n.identity.id));
      worldSim.npcs = worldSim.npcs.filter((n) => !toRemove.has(n.identity.id));
    }
  }
  if (worldSim.npcs.length > 120) {
    const unobservedL2 = worldSim.npcs.filter(
      (n) =>
        n.identity.alive &&
        n.cognition?.lodTier === 'L2' &&
        !isProtected(n) &&
        n.identity.specialStatus !== 'kage',
    );
    const dropCount = Math.min(unobservedL2.length, worldSim.npcs.length - 120);
    if (dropCount > 0) {
      const toRemove = new Set<string>();
      for (const dropped of unobservedL2.slice(0, dropCount)) {
        returnNpcToL3Population(worldSim, dropped);
        toRemove.add(dropped.identity.id);
      }
      worldSim.npcs = worldSim.npcs.filter((n) => !toRemove.has(n.identity.id));
    }
  }

  return dispatches;
}
