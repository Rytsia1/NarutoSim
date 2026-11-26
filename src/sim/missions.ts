import {
  MISSION_COMPLICATIONS,
  MISSION_LOCATIONS,
  MISSION_OBJECTIVES,
  MISSION_THREATS,
} from '../data/mission-templates';
import { addNpcMemory } from './npc-sim';
import { getPerson, isPersonAlive, personName } from './people';
import { adjustBidirectionalPlayerRel } from './relationships';
import type { SeededRng } from './rng';
import { recordTimelineEvent, revealTimelineTruth } from './timeline';
import type {
  GameState,
  GeneratedMission,
  MissionApproachId,
  MissionConsequence,
  MissionOutcomeTier,
  PendingDecision,
} from './types';

function rankValue(r: 'D' | 'C' | 'B' | 'A' | 'S'): number {
  return r === 'D' ? 1 : r === 'C' ? 2 : r === 'B' ? 3 : r === 'A' ? 4 : 5;
}

export function generateMissionContract(
  state: GameState,
  rank: 'D' | 'C' | 'B' | 'A' | 'S',
  rng: SeededRng,
): GeneratedMission {
  const candidates = MISSION_OBJECTIVES.filter((o) => o.ranks.includes(rank));
  const obj = candidates.length > 0 ? rng.pick(candidates) : MISSION_OBJECTIVES[0];
  const location = rng.pick(MISSION_LOCATIONS);

  // C32: Pick a random living Missing-Nin whose power matches the mission rank tier
  const livingRogues =
    rankValue(rank) >= 3 && state.worldSim
      ? state.worldSim.npcs.filter((n) => n.identity.alive && n.identity.specialStatus === 'missing_nin')
      : [];
  const [minPow, maxPow] =
    rank === 'S' ? [60, 200] : rank === 'A' ? [42, 90] : [20, 68];
  const matchedRogues = livingRogues.filter(
    (n) => n.identity.powerScore >= minPow && n.identity.powerScore <= maxPow,
  );
  const roguePool = matchedRogues.length > 0 ? matchedRogues : livingRogues;
  const livingRogue = roguePool.length > 0 ? rng.pick(roguePool) : undefined;
  const threat = livingRogue
    ? `Missing-Nin ${livingRogue.identity.name} (Power ${livingRogue.identity.powerScore})`
    : rng.pick(MISSION_THREATS);

  const compPool = MISSION_COMPLICATIONS.filter((c) => rankValue(rank) >= rankValue(c.minRank));
  const comp =
    compPool.length > 0
      ? rng.pick(compPool)
      : {
          id: 'comp_storm_delay',
          title: 'Sudden Frontier Squall',
          detail: 'A violent border squall washes out the bridge road while rival scouts circle the treeline.',
        };

  let squadLabel = 'Solo Operative';
  if (state.team?.active) {
    const aliveNames = state.team.members
      .filter((m) => isPersonAlive(state, m.personId))
      .map((m) => personName(state, m.personId));
    squadLabel = `Team ${state.team.number} (${aliveNames.length + 1}-man cell: ${aliveNames.join(', ')})`;
  } else if (state.permanentPartner && isPersonAlive(state, state.permanentPartner.personId)) {
    squadLabel = `2-Man Cell with ${personName(state, state.permanentPartner.personId)}`;
  } else if (state.rank === 'jonin') {
    squadLabel = 'Jonin Strike Lead + 2 Village Escorts';
  }

  // Apply persistent reputation penalty if a recent mission failed badly
  const repPenalty = (state.missionConsequences ?? []).some((c) => !c.resolved && c.kind === 'reputation_hit')
    ? 0.8
    : 1.0;

  // C30: Pay scales cleanly with contract rank (D/C/B/A/S) instead of flat template pay
  const rankBaseRyo: Record<'D' | 'C' | 'B' | 'A' | 'S', number> = {
    D: 4,
    C: 9,
    B: 15,
    A: 22,
    S: 32,
  };
  const baseRyo = rankBaseRyo[rank];

  return {
    id: `mis_${rank}_${state.age}_${rng.int(100, 999)}`,
    rank,
    title: `${rank}-Rank: ${obj.title}`,
    objective: obj.objective,
    location,
    client: obj.client,
    threat,
    threatNpcId: livingRogue?.identity.id,
    constraint: obj.constraint,
    squadLabel,
    hiddenComplicationId: comp.id,
    hiddenComplicationTitle: comp.title,
    hiddenComplicationDetail: comp.detail,
    complicationRevealed: false,
    difficulty: obj.baseDifficulty + (rank === 'S' ? 8 : rank === 'A' ? 4 : 0),
    ryoReward: Math.max(3, Math.round(baseRyo * repPenalty)),
    xpReward: obj.xp,
    stage: 1,
    approachScore: 0,
    constraintIntact: true,
  };
}

export function buildProceduralMissionStageDecision(
  state: GameState,
  mission: GeneratedMission,
): PendingDecision {
  const hasHengeOrGen =
    (state.academy?.henge ?? 0) >= 45 || state.disciplines.some((d) => d.id === 'genjutsu');
  const hasStealthOrSensory = state.disciplines.some(
    (d) => d.id === 'silent_killing' || d.id === 'sensory',
  );
  const hasTraps = state.disciplines.some((d) => d.id === 'trap_craft' || d.id === 'fuinjutsu');

  if (mission.stage === 1) {
    const briefing = [
      `Objective: ${mission.objective}.`,
      `Location: ${mission.location} | Client: ${mission.client}.`,
      `Expected Threat: ${mission.threat}.`,
      `Constraint: ${mission.constraint}.`,
      `Squad: ${mission.squadLabel}.`,
    ].join(' ');

    return {
      id: `${mission.id}_s1`,
      kind: 'mission_stage',
      eventId: 'mission_stage_approach',
      title: `${mission.title} (Stage 1: Approach)`,
      body: briefing,
      manual: false,
      meta: { missionId: mission.id, missionStage: 1 },
      options: [
        {
          id: 'infiltrate',
          label: 'Infiltrate under cover and bypass enemy sentries silently',
          sublabel: hasStealthOrSensory
            ? 'Stealth/Sensory edge: excels at honoring zero-detection constraints.'
            : 'Tests Intel & Will; preserves constraints.',
          statHints: ['Intel', 'Will'],
          autoEligible: true,
        },
        {
          id: 'disguise',
          label: 'Forge identity with Henge disguise and slip past checkpoints',
          sublabel: hasHengeOrGen
            ? 'Henge/Genjutsu edge: bypasses combat and uncovers hidden secrets!'
            : 'Tests Intel & Henge mastery.',
          statHints: ['Intel'],
          autoEligible: true,
        },
        {
          id: 'negotiate',
          label: 'Open parley channels and negotiate safe passage with local brokers',
          sublabel: 'Non-combat path: tests Bonds & Intel, lowers border friction.',
          statHints: ['Bonds', 'Intel'],
          autoEligible: true,
        },
        {
          id: 'gather_intel',
          label: 'Scout the terrain and probe the client for hidden motives first',
          sublabel: 'High chance to spot Hidden Complications early and uncover Timeline intel.',
          statHints: ['Intel'],
          autoEligible: true,
        },
        {
          id: 'trap',
          label: 'Rig wire snares and ambush points along the canyon flank',
          sublabel: hasTraps ? 'Trap Craft / Fuinjutsu bonus!' : 'Tests Intel & Chakra.',
          statHints: ['Intel', 'Chakra'],
          autoEligible: true,
        },
        {
          id: 'combat',
          label: 'Advance openly and crush hostile opposition with direct jutsu',
          sublabel: 'Tests Chakra & Health; high risk of breaking stealth or casualty constraints.',
          statHints: ['Chakra', 'Health'],
          autoEligible: true,
        },
      ],
    };
  }

  // Stage 2: Hidden Complication Revealed!
  return {
    id: `${mission.id}_s2`,
    kind: 'mission_stage',
    eventId: 'mission_stage_complication',
    title: `Mission Twist: ${mission.hiddenComplicationTitle}`,
    body: `${mission.hiddenComplicationDetail} Your squad (${mission.squadLabel}) looks to you for the decisive call while keeping "${mission.constraint}" in mind.`,
    manual: false,
    meta: { missionId: mission.id, missionStage: 2 },
    options: [
      {
        id: 'adapt_noncombat',
        label: 'Outmaneuver the twist via negotiation, exposure, or covert extraction',
        sublabel: 'Tests Intel & Bonds. Best path for clean Success and uncovering hidden intel.',
        statHints: ['Intel', 'Bonds'],
        autoEligible: true,
      },
      {
        id: 'force_objective',
        label: 'Commit full combat power to force the objective through at any cost',
        sublabel: 'Tests Chakra & Will. Higher pay chance, real risk of wounds or broken constraints.',
        statHints: ['Chakra', 'Will'],
        autoEligible: true,
      },
      {
        id: 'save_comrades',
        label: 'Abandon the objective to shield your squad and innocent bystanders',
        sublabel: 'Fails the contract (Partial/Failure), yet earns immense Squad Trust & Affection and honors your village creed!',
        statHints: ['Bonds', 'Will'],
        autoEligible: false,
      },
      {
        id: 'retreat',
        label: 'Pop smoke tags and execute a clean tactical escape',
        sublabel: 'Fails the contract safely without fatalities; avoids lethal ambushes.',
        statHints: ['Health', 'Will'],
        autoEligible: state.stats.health < 40,
      },
    ],
  };
}

function pushConsequence(state: GameState, c: MissionConsequence): void {
  if (!state.missionConsequences) state.missionConsequences = [];
  state.missionConsequences.push(c);
  if (state.missionConsequences.length > 8) {
    state.missionConsequences.shift();
  }
}

export function resolveProceduralMissionStage(
  state: GameState,
  optionId: string,
  ryoMult: number,
  rng: SeededRng,
): {
  finished: boolean;
  nextDecision?: PendingDecision;
  outcome?: MissionOutcomeTier;
  tone: 'normal' | 'milestone' | 'danger' | 'bond' | 'war';
  title: string;
  text: string;
  checkLabel?: string;
  checkPassed?: boolean;
  killed?: boolean;
  deathCause?: string;
  tensionDelta?: number;
} {
  const mission = state.activeMission;
  if (!mission) {
    return {
      finished: true,
      tone: 'normal',
      title: 'Mission Closed',
      text: 'The assignment desk files the paperwork away.',
    };
  }

  // Stage 1 Resolution -> Reveal Hidden Complication & Move to Stage 2
  if (mission.stage === 1) {
    const approach = optionId as MissionApproachId;
    mission.chosenApproach = approach;
    let statSum = 0;
    let bonus = 0;
    let label = 'Approach Execution';

    if (approach === 'infiltrate') {
      label = 'Stealth Infiltration';
      statSum = state.stats.intel * 0.55 + state.stats.will * 0.45;
      if (state.disciplines.some((d) => d.id === 'silent_killing' || d.id === 'sensory')) bonus += 14;
    } else if (approach === 'disguise') {
      label = 'Henge Identity Forgery';
      statSum = state.stats.intel * 0.6 + (state.academy?.henge ?? 45) * 0.4;
      if (state.disciplines.some((d) => d.id === 'genjutsu')) bonus += 12;
    } else if (approach === 'negotiate') {
      label = 'Tactical Negotiation';
      statSum = state.stats.bonds * 0.55 + state.stats.intel * 0.45;
    } else if (approach === 'gather_intel') {
      label = 'Reconnaissance & Intel Probe';
      statSum = state.stats.intel * 0.75 + state.stats.will * 0.25;
      bonus += 8;
    } else if (approach === 'trap') {
      label = 'Wire & Trap Ambush';
      statSum = state.stats.intel * 0.5 + state.stats.chakra * 0.5;
      if (state.disciplines.some((d) => d.id === 'trap_craft' || d.id === 'fuinjutsu')) bonus += 14;
    } else {
      label = 'Direct Jutsu Assault';
      statSum = state.stats.chakra * 0.55 + state.stats.health * 0.45;
      if (mission.constraint.toLowerCase().includes('zero detection') || mission.constraint.toLowerCase().includes('no lethal')) {
        mission.constraintIntact = false;
      }
    }

    const roll = statSum + bonus + rng.int(0, 28);
    const passed = roll >= mission.difficulty;
    mission.approachScore = passed ? 20 : 6;
    mission.complicationRevealed = true;
    mission.stage = 2;

    return {
      finished: false,
      nextDecision: buildProceduralMissionStageDecision(state, mission),
      tone: passed ? 'normal' : 'danger',
      title: `${mission.title}: Complication Uncovered`,
      text: passed
        ? `Your ${label.toLowerCase()} opens clean momentum across ${mission.location}, just as a hidden complication surfaces: ${mission.hiddenComplicationTitle}!`
        : `Your ${label.toLowerCase()} trips enemy perimeter wards in ${mission.location}, exposing a sudden complication: ${mission.hiddenComplicationTitle}!`,
      checkLabel: label,
      checkPassed: passed,
    };
  }

  // Stage 2 Resolution -> Final Outcome (Success / Partial Success / Failure) + Persistent Fallout!
  state.activeMission = null;
  const worldSim = state.worldSim;
  const rankKey = mission.rank.toLowerCase() as keyof GameState['missions'];
  const scaledRyo = Math.max(3, Math.round(mission.ryoReward * ryoMult));

  // Path A: Sacrifice Objective to Save Comrades
  if (optionId === 'save_comrades') {
    state.stats.bonds += 7;
    state.stats.will += 6;
    state.stats.health = Math.max(10, state.stats.health - 6);
    if (state.team) {
      for (const m of state.team.members) {
        const npc = getPerson(state, m.personId);
        if (!npc || !npc.identity.alive) continue;
        adjustBidirectionalPlayerRel(
          state,
          npc,
          { trust: 20, affection: 18, respect: 16, resentment: -15 },
          { trust: 14, affection: 14 },
        );
        addNpcMemory(npc, {
          year: state.birthYear + state.age,
          age: npc.identity.age,
          tag: 'bond',
          summary: `${state.name} abandoned a ${mission.rank}-Rank objective to pull us out alive.`,
          actorId: 'player',
          impact: 9,
        });
      }
    }
    pushConsequence(state, {
      id: `cons_debt_${mission.id}`,
      createdAge: state.age,
      expiresAge: state.age + 8,
      kind: 'comrade_debt',
      title: 'Unbreakable Comrade Debt',
      detail: `Your squad remembers you chose their lives over ${mission.client}'s fee.`,
      resolved: false,
    });
    pushConsequence(state, {
      id: `cons_rep_${mission.id}`,
      createdAge: state.age,
      expiresAge: state.age + 4,
      kind: 'reputation_hit',
      title: 'Client Displeasure',
      detail: `${mission.client} filed a complaint over the abandoned ${mission.rank}-Rank objective.`,
      resolved: false,
    });
    return {
      finished: true,
      outcome: 'failure',
      tone: 'bond',
      title: 'Comrades Chosen Above the Scroll',
      text: `You abandon the ${mission.rank}-Rank objective to pull every comrade and bystander clear of ${mission.location}. The mission desk docks your fee, yet your squad's trust in you becomes unshakable.`,
    };
  }

  // Path B: Tactical Retreat
  if (optionId === 'retreat') {
    state.stats.will += 2;
    pushConsequence(state, {
      id: `cons_rep_${mission.id}`,
      createdAge: state.age,
      expiresAge: state.age + 3,
      kind: 'reputation_hit',
      title: 'Aborted Assignment Record',
      detail: `Retreating from ${mission.title} briefly lowered your priority for top-paying contracts.`,
      resolved: false,
    });
    return {
      finished: true,
      outcome: 'failure',
      tone: 'normal',
      title: `${mission.title}: Clean Tactical Retreat`,
      text: `Reading the trap clearly, you lay smoke screens and extract cleanly from ${mission.location} with everyone breathing.`,
    };
  }

  // Path C: Non-Combat Adaptation OR Direct Combat Force
  const isNonCombat = optionId === 'adapt_noncombat';
  const score = isNonCombat
    ? state.stats.intel * 0.55 + state.stats.bonds * 0.35 + state.stats.will * 0.2 + mission.approachScore
    : state.stats.chakra * 0.5 + state.stats.will * 0.35 + state.stats.health * 0.2 + mission.approachScore;
  const roll = score + rng.int(0, 30);

  let outcome: MissionOutcomeTier = 'failure';
  if (roll >= mission.difficulty + 26 && mission.constraintIntact) {
    outcome = 'success';
  } else if (roll >= mission.difficulty + 8) {
    outcome = 'partial_success';
  } else {
    outcome = 'failure';
  }

  if (outcome === 'success') {
    state.missions[rankKey] += 1;
    state.stats.ryo += scaledRyo;
    state.stats.will += mission.rank === 'S' ? 4 : 2;
    state.stats.intel += isNonCombat ? 3 : 1;
    if (state.disciplines.length > 0) {
      const main = state.disciplines.find((d) => d.isMain) ?? state.disciplines[0];
      main.xp += mission.xpReward;
    }

    // Unlock hidden Living Timeline truth if complication involved spy/intel!
    let intelNote = '';
    if (
      (mission.hiddenComplicationId === 'comp_merchant_spy' ||
        mission.hiddenComplicationId === 'comp_root_doublecross' ||
        mission.hiddenComplicationId === 'comp_rival_army_prep' ||
        mission.chosenApproach === 'gather_intel') &&
      worldSim
    ) {
      const revealed = revealTimelineTruth(state, 'mission_report', `${mission.title} Field Report`);
      if (revealed) {
        intelNote = ` Classified Timeline Truth uncovered: "${revealed.truthTitle}"!`;
      }
    }

    return {
      finished: true,
      outcome: 'success',
      tone: mission.rank === 'S' || mission.rank === 'A' ? 'milestone' : 'normal',
      title: `${mission.title}: Clean Success`,
      text: `You overcame "${mission.hiddenComplicationTitle}" while honoring "${mission.constraint}" in ${mission.location}.${intelNote}`,
      checkLabel: isNonCombat ? 'Non-Combat Resolution' : 'Combat Climax',
      checkPassed: true,
    };
  }

  if (outcome === 'partial_success') {
    state.missions[rankKey] += 1;
    state.stats.ryo += Math.max(2, Math.round(scaledRyo * 0.6));
    state.stats.health = Math.max(8, state.stats.health - (isNonCombat ? 6 : 12));
    state.stats.will += 2;
    if (state.disciplines.length > 0) {
      const main = state.disciplines.find((d) => d.isMain) ?? state.disciplines[0];
      main.xp += Math.max(2, Math.round(mission.xpReward * 0.6));
    }

    // Partial success breaks constraint or leaves a bitter rival behind
    let tensionDelta = 0;
    if (!mission.constraintIntact || rng.chance(0.5)) {
      tensionDelta = 4;
      pushConsequence(state, {
        id: `cons_dip_${mission.id}`,
        createdAge: state.age,
        expiresAge: state.age + 5,
        kind: 'diplomatic_scandal',
        title: 'Broken Mission Constraint',
        detail: `Completing ${mission.title} violated "${mission.constraint}", causing frontier friction.`,
        resolved: false,
      });
      if (worldSim) {
        recordTimelineEvent(state, worldSim, {
          category: 'diplomacy',
          villageIds: [state.villageId],
          truthTitle: `Border Incident at ${mission.location}`,
          truthSummary: `A messy ${mission.rank}-Rank operation at ${mission.location} breached diplomatic constraints, fueling rival protests.`,
          isSecret: false,
          immediateChannel: 'newspaper',
          sourceLabel: 'Frontier Dispatch',
        });
      }
    }

    return {
      finished: true,
      outcome: 'partial_success',
      tone: 'war',
      title: `${mission.title}: Partial Success`,
      text: `You salvaged the core objective against "${mission.hiddenComplicationTitle}", but at a cost in wounds and broken constraints along ${mission.location}.`,
      checkLabel: isNonCombat ? 'Non-Combat Resolution' : 'Combat Climax',
      checkPassed: true,
      tensionDelta,
    };
  }

  // Failure: real wounds, possible death on A/S combat, AND persistent vendetta fallout!
  const dmg = mission.rank === 'S' ? 22 : mission.rank === 'A' ? 18 : mission.rank === 'B' ? 14 : 10;
  state.stats.health -= dmg;
  const deathRisk: number = !isNonCombat
    ? mission.rank === 'S'
      ? 0.16
      : mission.rank === 'A'
        ? 0.1
        : 0.03
    : 0;
  if (state.stats.health <= 0 || (deathRisk > 0 && rng.chance(deathRisk))) {
    return {
      finished: true,
      outcome: 'failure',
      tone: 'danger',
      title: `${mission.title}: Fatal Failure`,
      text: `Overwhelmed by ${mission.threat} amid "${mission.hiddenComplicationTitle}", you fell in ${mission.location}.`,
      killed: true,
      deathCause: `killed during a ${mission.rank}-Rank mission (${mission.hiddenComplicationTitle})`,
    };
  }

  pushConsequence(state, {
    id: `cons_vend_${mission.id}`,
    createdAge: state.age,
    expiresAge: state.age + 7,
    kind: 'vendetta',
    title: `Surviving Threat: ${mission.threat}`,
    detail: `After escaping your failed ${mission.rank}-Rank mission in ${mission.location}, ${mission.threat} marked your face.`,
    npcId: mission.threatNpcId,
    resolved: false,
  });
  pushConsequence(state, {
    id: `cons_rep_${mission.id}`,
    createdAge: state.age,
    expiresAge: state.age + 4,
    kind: 'reputation_hit',
    title: 'Failed Mission Dossier',
    detail: `Failure on ${mission.title} reduced contract fees for several seasons.`,
    resolved: false,
  });

  if (mission.threatNpcId && worldSim) {
    const rogue = worldSim.npcs.find((n) => n.identity.id === mission.threatNpcId && n.identity.alive);
    if (rogue) {
      adjustBidirectionalPlayerRel(state, rogue, { resentment: 30, rivalry: 25 }, { resentment: 35, rivalry: 25 }, 'enemy');
    }
  }

  return {
    finished: true,
    outcome: 'failure',
    tone: 'danger',
    title: `${mission.title}: Mission Failed`,
    text: `"${mission.hiddenComplicationTitle}" shattered your plan in ${mission.location}. You limped back alive, leaving an unresolved vendetta and a scarred dossier behind.`,
    checkLabel: isNonCombat ? 'Non-Combat Resolution' : 'Combat Climax',
    checkPassed: false,
  };
}

/**
 * Processes persistent consequences from past missions across subsequent years!
 */
export function tickMissionConsequences(state: GameState, rng: SeededRng): string[] {
  if (!state.missionConsequences || state.missionConsequences.length === 0) return [];
  const logs: string[] = [];

  for (const c of state.missionConsequences) {
    if (c.resolved) continue;
    if (state.age >= c.expiresAge) {
      c.resolved = true;
      continue;
    }
    if (c.kind === 'vendetta' && state.age > c.createdAge && rng.chance(0.22)) {
      c.resolved = true;
      const escaped = state.stats.intel + state.stats.will + rng.int(0, 28) >= 95;
      if (escaped) {
        state.stats.will += 3;
        logs.push(`Past Mission Fallout: Assassins tied to "${c.title}" ambushed you outside the village gate, but your sharp reflexes broke the snare (+3 Will).`);
      } else {
        state.stats.health = Math.max(8, state.stats.health - 9);
        logs.push(`Past Mission Fallout: Enemies from "${c.title}" struck back on a dark road, leaving fresh wounds before slipping away (-9 Health).`);
      }
    }
  }

  state.missionConsequences = state.missionConsequences.filter((c) => !c.resolved);
  return logs;
}
