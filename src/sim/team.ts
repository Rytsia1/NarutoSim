import { DISCIPLINE_MAP } from '../data/powers';
import { SENSEI_ARCHETYPES, TEAMMATE_ARCHETYPES } from '../data/events-team';
import { getClansForVillage } from '../data/clans';
import {
  applyYearlyNpcGrowth,
  assignEpithetIfEligible,
  computePowerScoreFromRanks,
  computeRanksFromIdentity,
  generateCharacter,
  getPerson,
  getPersonTraits,
  isPersonAlive,
  killPerson,
  learnNewNpcJutsu,
  personName,
} from './people';
import { clamp } from './powers';
import { syncKizunaMemberRel6 } from './relationships';
import type { SeededRng } from './rng';
import type {
  GameState,
  KizunaMember,
  NpcRelationKind,
  PendingDecision,
  TeamState,
  TraitId,
  WorldNpc,
} from './types';

export function computeTraitScore(state: GameState, trait: TraitId): number {
  const { stats, leanings, originId } = state;
  let score = 50;
  switch (trait) {
    case 'honor':
      score = stats.will;
      break;
    case 'compassion':
      score = stats.bonds;
      break;
    case 'loyalty':
      score = (stats.bonds + stats.will) / 2;
      break;
    case 'ambition':
      score = stats.chakra;
      break;
    case 'freedom':
      score = Math.min(100, (stats.will + (100 - stats.bonds)) / 2 + 18 + (originId === 'war_orphan' ? 10 : 0));
      break;
  }

  if (leanings.ruthless >= 4) {
    if (trait === 'compassion') score -= 15;
    if (trait === 'honor') score -= 10;
    if (trait === 'ambition') score += 5;
  }
  if (leanings.will_of_fire >= 3) {
    if (trait === 'honor' || trait === 'compassion' || trait === 'loyalty') score += 6;
  }
  if (leanings.vengeance >= 3) {
    if (trait === 'freedom' || trait === 'ambition') score += 6;
    if (trait === 'compassion') score -= 8;
  }

  return clamp(Math.round(score), 0, 100);
}

export function computeLiveFit(state: GameState, subject: { traits: readonly TraitId[] }): number {
  if (subject.traits.length === 0) return 55;
  const scores = subject.traits.map((tr) => computeTraitScore(state, tr));
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  return clamp(Math.round(avg), 15, 99);
}

export function getTrustTier(trust: number): 'Distrust' | 'Steady' | 'Trusted' | 'Unbreakable' {
  if (trust < 35) return 'Distrust';
  if (trust < 60) return 'Steady';
  if (trust < 80) return 'Trusted';
  return 'Unbreakable';
}

export function getRelStageLabel(member: KizunaMember): string {
  if (member.relTrack === 'mentorship') {
    return ['Student', 'Acknowledged Disciple', 'Trusted Protégé', 'Inheritor of Will'][member.relStage];
  }
  if (member.relTrack === 'romance') {
    return ['Acquaintance', 'Fondness', 'Yearning', 'Lovers'][member.relStage];
  }
  return ['Squadmates', 'Comrades', 'Close Friends', 'Sworn Rivals & Bond'][member.relStage];
}

export function adjustMemberTrust(
  state: GameState,
  member: KizunaMember,
  rawDelta: number,
  unlockFragment = false,
): number {
  const person = getPerson(state, member.personId);
  if (!person || !person.identity.alive) return 0;
  const traits = getPersonTraits(state, member.personId);
  member.fit = computeLiveFit(state, { traits });

  let delta = rawDelta;
  if (delta > 0) {
    const dim = clamp(1 - (member.trust - 30) / 50, 0.15, 1);
    const fitMult = member.fit >= 70 ? 1.2 : member.fit < 50 ? 0.7 : 1;
    delta = Math.max(1, Math.round(delta * dim * fitMult));
  } else if (delta < 0) {
    const fitMult = member.fit >= 70 ? 0.8 : member.fit < 50 ? 1.2 : 1;
    delta = Math.min(-1, Math.round(delta * fitMult));
  }

  const before = member.trust;
  member.trust = clamp(member.trust + delta, 0, 100);
  const isRival = state.rivalId === member.personId;
  syncKizunaMemberRel6(member, isRival);
  if (member.rel6) {
    member.rel6.trust = member.trust;
    if (delta > 0) {
      member.rel6.affection = clamp(member.rel6.affection + Math.ceil(delta * 0.6), 0, 100);
      member.rel6.respect = clamp(member.rel6.respect + Math.ceil(delta * 0.4), 0, 100);
    } else if (delta < 0) {
      member.rel6.resentment = clamp(member.rel6.resentment + Math.ceil(Math.abs(delta) * 0.6), 0, 100);
    }
  }

  if (unlockFragment && member.fragments < 3 && member.trust >= 40) {
    member.fragments += 1;
    member.relPoints += 6;
  }

  if (member.trust >= 60 && delta > 0) {
    member.relPoints += Math.round(delta * 1.4);
  } else if (member.trust < 35 && delta < 0) {
    member.relPoints = Math.max(0, member.relPoints - 8);
  }

  // Advance relationship stage thresholds (GDD Ch. 07 inspired)
  const ptReq = [0, 22, 52, 85];
  const trustReq = [0, 55, 72, 88];
  while (
    member.relStage < 3 &&
    member.relPoints >= ptReq[member.relStage + 1] &&
    member.trust >= trustReq[member.relStage + 1]
  ) {
    member.relStage = (member.relStage + 1) as 0 | 1 | 2 | 3;
  }

  // Keep the person's player relationship directly aligned
  const relKind: NpcRelationKind =
    member.role === 'sensei'
      ? 'student'
      : isRival
        ? 'rival'
        : member.relTrack === 'romance'
          ? 'ally'
          : 'friend';
  person.relationships.player = {
    targetId: 'player',
    targetName: state.name,
    kind: person.relationships.player?.kind === 'spouse' ? 'spouse' : relKind,
    affinity: clamp(member.trust - 20, -100, 100),
    trust: member.trust,
    grudge: member.trust < 30 ? clamp(40 - member.trust, 0, 100) : 0,
    vector: member.rel6 ? { ...member.rel6 } : person.relationships.player?.vector,
    reciprocal: member.playerFeelings ? { ...member.playerFeelings } : person.relationships.player?.reciprocal,
  };

  return member.trust - before;
}

function linkSquadPair(a: WorldNpc, b: WorldNpc, kindForA: NpcRelationKind, kindForB: NpcRelationKind, trust: number): void {
  if (!a.relationships[b.identity.id]) {
    a.relationships[b.identity.id] = {
      targetId: b.identity.id,
      targetName: b.identity.name,
      kind: kindForA,
      affinity: 30,
      trust,
      grudge: 0,
    };
  }
  if (!b.relationships[a.identity.id]) {
    b.relationships[a.identity.id] = {
      targetId: a.identity.id,
      targetName: a.identity.name,
      kind: kindForB,
      affinity: 30,
      trust,
      grudge: 0,
    };
  }
}

/**
 * Forms the classic Naruto 4-man Genin cell:
 * 1 Jonin Sensei + 2 Genin Teammates + Player as the 3rd student.
 * Every member is a canonical WorldNpc in `state.worldSim.npcs`; KizunaMember only stores role-local bond data.
 */
export function formGeninTeam(state: GameState, rng: SeededRng): TeamState {
  const teamNumber = rng.int(1, 14);
  const year = state.birthYear + state.age;
  const clans = getClansForVillage(state.villageId);

  const senseiArch = rng.pick(SENSEI_ARCHETYPES);
  const senseiSex: 'M' | 'F' = rng.chance(0.55) ? 'M' : 'F';
  const senseiSpecialty = rng.pick(senseiArch.specialties);
  const senseiNpc = generateCharacter(
    state,
    {
      sex: senseiSex,
      age: state.age + rng.int(12, 20),
      villageId: state.villageId,
      occupation: state.villageId === 'iron' ? 'samurai' : 'shinobi',
      clanId: clans.length > 0 && rng.chance(0.35) ? rng.pick(clans).id : null,
      rank: 'jonin',
      specialStatus: 'none',
      roleTitle: `Team ${teamNumber} Sensei`,
      specialty: senseiSpecialty,
      traits: [...senseiArch.traits],
      lodTier: 'L1',
      observed: true,
    },
    rng,
  );
  senseiNpc.personality.loyal = clamp(senseiNpc.personality.loyal + (senseiArch.traits.includes('loyalty') ? 20 : 0), 10, 98);
  senseiNpc.personality.compassionate = clamp(senseiNpc.personality.compassionate + (senseiArch.traits.includes('compassion') ? 20 : 0), 10, 98);
  senseiNpc.memory.push({
    year,
    age: senseiNpc.identity.age,
    tag: 'bond',
    summary: `Assigned as Jonin Sensei of Team ${teamNumber} alongside ${state.name}.`,
    actorId: 'player',
    impact: 5,
  });

  const senseiFit = computeLiveFit(state, { traits: senseiArch.traits });
  const senseiTrust = clamp(24 + Math.round(senseiFit * 0.35), 25, 60);
  const sensei: KizunaMember = {
    personId: senseiNpc.identity.id,
    role: 'sensei',
    archetype: senseiArch.label,
    trust: senseiTrust,
    fit: senseiFit,
    relTrack: 'mentorship',
    relStage: 0,
    relPoints: 0,
    fragments: 0,
    promiseMade: false,
    lastUpdateAge: state.age,
    fateNote: `Jonin Sensei of Team ${teamNumber}. ${senseiArch.introLine}`,
  };
  syncKizunaMemberRel6(sensei, false);
  senseiNpc.relationships.player = {
    targetId: 'player',
    targetName: state.name,
    kind: 'student',
    affinity: clamp(sensei.trust - 20, -100, 100),
    trust: sensei.trust,
    grudge: 0,
    vector: sensei.rel6 ? { ...sensei.rel6 } : undefined,
    reciprocal: sensei.playerFeelings ? { ...sensei.playerFeelings } : undefined,
  };

  // Pick 2 distinct teammate archetypes, promoting real Academy classmates directly when available!
  const pool = [...TEAMMATE_ARCHETYPES];
  const arch1 = rng.pick(pool);
  const remaining = pool.filter((a) => a.id !== arch1.id);
  const arch2 = rng.pick(remaining);

  const acadPeers: WorldNpc[] =
    state.academy && state.worldSim
      ? state.academy.classmateNpcIds
          .map((cid) => getPerson(state, cid))
          .filter((n): n is WorldNpc => Boolean(n && n.identity.alive))
      : [];

  const mateNpcs: WorldNpc[] = [];
  const teammates: KizunaMember[] = [arch1, arch2].map((arch, index) => {
    const peerNpc = acadPeers[index];
    const mateNpc: WorldNpc =
      peerNpc ??
      generateCharacter(
        state,
        {
          sex: index === 0 ? (state.sex === 'M' ? 'F' : 'M') : rng.chance(0.5) ? 'M' : 'F',
          age: Math.max(10, state.age + rng.int(-1, 1)),
          villageId: state.villageId,
          occupation: state.villageId === 'iron' ? 'samurai' : 'shinobi',
          clanId: clans.length > 0 && rng.chance(0.35) ? rng.pick(clans).id : null,
          rank: 'genin',
          specialStatus: 'none',
          roleTitle: `Team ${teamNumber} Squadmate`,
          specialty: rng.pick(arch.specialties),
          traits: [...arch.traits],
          lodTier: 'L1',
          observed: true,
        },
        rng,
      );

    mateNpc.identity.rank = 'genin';
    mateNpc.identity.roleTitle = `Team ${teamNumber} Squadmate`;
    mateNpc.identity.traits = [...arch.traits];
    mateNpc.identity.observed = true;
    mateNpc.identity.powerScore = computePowerScoreFromRanks(computeRanksFromIdentity(mateNpc.identity));
    learnNewNpcJutsu(mateNpc, rng);
    mateNpc.memory.push({
      year,
      age: mateNpc.identity.age,
      tag: 'bond',
      summary: `Assigned to Team ${teamNumber} alongside ${state.name}.`,
      actorId: 'player',
      impact: 5,
    });
    mateNpcs.push(mateNpc);

    const fit = computeLiveFit(state, { traits: arch.traits });
    const startTrust = peerNpc?.relationships.player?.trust ?? clamp(22 + Math.round(fit * 0.35), 22, 58);
    const mate: KizunaMember = {
      personId: mateNpc.identity.id,
      role: 'teammate',
      archetype: arch.label,
      trust: startTrust,
      fit,
      relTrack: 'comrades',
      relStage: 0,
      relPoints: 0,
      fragments: 0,
      promiseMade: false,
      lastUpdateAge: state.age,
      fateNote: peerNpc
        ? `Former Academy classmate now assigned to Team ${teamNumber}. ${arch.introLine}`
        : `Genin squadmate in Team ${teamNumber}. ${arch.introLine}`,
    };
    if (peerNpc?.relationships.player?.vector) {
      mate.rel6 = { ...peerNpc.relationships.player.vector };
    }
    if (peerNpc?.relationships.player?.reciprocal) {
      mate.playerFeelings = { ...peerNpc.relationships.player.reciprocal };
    }
    syncKizunaMemberRel6(mate, index === 0);
    mateNpc.relationships.player = {
      targetId: 'player',
      targetName: state.name,
      kind: index === 0 ? 'rival' : 'friend',
      affinity: clamp(mate.trust - 20, -100, 100),
      trust: mate.trust,
      grudge: mate.trust < 30 ? clamp(40 - mate.trust, 0, 100) : 0,
      vector: mate.rel6 ? { ...mate.rel6 } : undefined,
      reciprocal: mate.playerFeelings ? { ...mate.playerFeelings } : undefined,
    };
    return mate;
  });

  // Wire squad-internal relationships directly on the canonical people
  for (const mNpc of mateNpcs) {
    linkSquadPair(mNpc, senseiNpc, 'mentor', 'student', 68);
  }
  if (mateNpcs.length === 2) {
    linkSquadPair(mateNpcs[0], mateNpcs[1], 'friend', 'friend', 60);
  }

  return {
    number: teamNumber,
    active: true,
    formedAge: state.age,
    disbandedAge: null,
    disbandReason: null,
    bellTestPassed: false,
    members: [sensei, teammates[0], teammates[1]],
  };
}

export function buildBellTestDecision(state: GameState): PendingDecision {
  const team = state.team!;
  const sensei = team.members[0];
  const mates = team.members.slice(1);
  const senseiPerson = getPerson(state, sensei.personId);
  const senseiSpec = senseiPerson?.identity.specialty ?? 'kenjutsu';
  const specName = DISCIPLINE_MAP[senseiSpec]?.name ?? senseiSpec;

  return {
    id: `bell_test_${state.age}`,
    kind: 'bell_test',
    eventId: 'bell_test',
    title: `Team ${team.number} Induction: The Two-Bell Test`,
    body: `${personName(state, sensei.personId)} (${sensei.archetype}, specialist in ${specName}) dangles two silver bells before you, ${personName(state, mates[0].personId)}, and ${personName(state, mates[1].personId)}. Only two bells exist for three Genin. "Take one before noon, or go back to the Academy."`,
    manual: true,
    options: [
      {
        id: 'team_plan',
        label: 'Coordinate a three-way feint with your squadmates',
        sublabel: 'Risk failing to take a bell individually in order to cover each other.',
        statHints: ['Bonds', 'Intel'],
        autoEligible: true,
      },
      {
        id: 'solo_rush',
        label: 'Break formation and strike straight for a bell yourself',
        sublabel: 'Tests raw Chakra & Speed against a Jonin.',
        statHints: ['Chakra', 'Health'],
        autoEligible: true,
      },
      {
        id: 'share_lunch',
        label: 'After getting caught, defy orders and share rations with a tied-up squadmate',
        sublabel: 'Tests Willpower and loyalty over strict rules.',
        statHints: ['Will', 'Bonds'],
        autoEligible: true,
      },
    ],
  };
}

export function disbandGeninTeam(
  state: GameState,
  reason: 'player_chunin' | 'teammate_chunin' | 'tragedy',
  promotedNames: string[],
): PendingDecision {
  const team = state.team!;
  team.active = false;
  team.disbandedAge = state.age;
  team.disbandReason = reason;

  const sensei = team.members[0];
  const senseiName = personName(state, sensei.personId);
  const mates = team.members.slice(1);
  const livingMates = mates.filter((m) => isPersonAlive(state, m.personId));

  let headline = `Team ${team.number} Disbanded`;
  let body = '';

  if (reason === 'player_chunin') {
    body = `With your promotion to Chunin${promotedNames.length > 1 ? ` alongside ${promotedNames.filter((n) => n !== state.name).join(' and ')}` : ''}, Team ${team.number} is formally dissolved. ${senseiName} folds the squad roster and buys one final round of skewers at the village dusk market. From tomorrow onward, you walk the shinobi road solo.`;
  } else if (reason === 'teammate_chunin') {
    body = `${promotedNames.join(' and ')} earned the Chunin flak jacket, formally dissolving Team ${team.number}. Though you remain an independent Genin for now, ${senseiName} reminds you that every shinobi blooms on their own clock. Your shared bond outlives the squad assignment.`;
  } else {
    headline = `Team ${team.number} Shattered`;
    body = `With too few survivors left to field a cell, Team ${team.number} is struck from active rotation. The memories of the comrades who walked beside you will never leave your shadow.`;
  }

  const options: PendingDecision['options'] = [
    {
      id: 'promise_comrades',
      label: 'Swear an oath to meet again at the summit as stronger shinobi',
      statHints: ['Bonds', 'Will'],
      autoEligible: true,
    },
    {
      id: 'thank_sensei',
      label: `Bow deeply to ${senseiName} and vow to honor their teachings`,
      statHints: ['Will', 'Intel'],
      autoEligible: true,
    },
  ];

  const hasLivingSpouse = state.family.some((f) => f.relation === 'spouse' && isPersonAlive(state, f.personId));
  const romanceCandidate = livingMates.find(
    (m) => m.trust >= 55 && state.age >= 15 && !hasLivingSpouse,
  );
  if (romanceCandidate) {
    options.push({
      id: `confess_${romanceCandidate.personId}`,
      label: `Pull ${personName(state, romanceCandidate.personId)} aside and confess feelings before parting ways`,
      statHints: ['Bonds'],
      autoEligible: false,
    });
  }

  options.push({
    id: 'part_coldly',
    label: 'Leave quietly after sunset without sentiment',
    statHints: ['Will'],
    autoEligible: true,
  });

  return {
    id: `team_disband_${state.age}`,
    kind: 'team_disband',
    eventId: 'team_disband',
    title: headline,
    body,
    manual: true,
    meta: { reason, romanceTargetId: romanceCandidate?.personId ?? '' },
    options,
  };
}

/**
 * Grows active teammates in parallel and simulates post-disbandment narrative beats.
 * Aging itself happens once per year on the canonical WorldNpc inside `tickAutonomousNpcs`.
 */
export function tickTeamYear(state: GameState, rng: SeededRng): string[] {
  const team = state.team;
  if (!team) return [];
  const notices: string[] = [];

  for (const m of team.members) {
    const person = getPerson(state, m.personId);
    if (!person || !person.identity.alive) continue;
    const id = person.identity;
    const traits = getPersonTraits(state, m.personId);
    m.fit = computeLiveFit(state, { traits });

    if (team.active) {
      applyYearlyNpcGrowth(person, rng);
      continue;
    }

    // Post-disbandment autonomous life beats
    if (state.age - m.lastUpdateAge < 2) continue;
    if (!rng.chance(0.32)) continue;
    m.lastUpdateAge = state.age;

    if (m.role === 'teammate') {
      applyYearlyNpcGrowth(person, rng);

      if (id.age >= 68 && rng.chance(0.14)) {
        killPerson(state, m.personId, id.age, 'passed away peacefully in retirement');
        m.fateNote = `Passed away peacefully in retirement at age ${id.age}.`;
        notices.push(`Former squadmate ${id.name} passed away quietly after a long life.`);
      } else if (id.rank === 'genin' && id.powerScore >= 44 && rng.chance(0.5)) {
        id.rank = 'chunin';
        id.roleTitle = 'Village Chunin';
        id.powerScore = computePowerScoreFromRanks(computeRanksFromIdentity(id));
        learnNewNpcJutsu(person, rng);
        assignEpithetIfEligible(person, rng);
        m.fateNote = `Promoted to Chunin at age ${id.age}.`;
        notices.push(`Word reaches you that former squadmate ${id.name} passed the Chunin Exams.`);
      } else if (id.rank === 'chunin' && id.powerScore >= 58 && id.age >= 17 && rng.chance(0.35)) {
        id.rank = 'jonin';
        id.roleTitle = 'Village Jonin';
        id.powerScore = computePowerScoreFromRanks(computeRanksFromIdentity(id));
        learnNewNpcJutsu(person, rng);
        assignEpithetIfEligible(person, rng);
        m.fateNote = `Promoted to Jonin at age ${id.age}.`;
        notices.push(`Former squadmate ${id.name} has been promoted to Jonin.`);
      } else if (
        id.specialStatus === 'none' &&
        (m.trust < 38 || traits.includes('ambition')) &&
        id.age >= 16 &&
        id.age <= 32 &&
        rng.chance(0.11)
      ) {
        id.specialStatus = 'missing_nin';
        id.roleTitle = 'Missing-Nin Rogue';
        m.fateNote = `Defected from the village at age ${id.age} as a Missing-Nin.`;
        notices.push(`Shocking dispatch: your former squadmate ${id.name} has abandoned the village and entered the Bingo Book as a Missing-Nin.`);
      } else if (id.age >= 18 && id.age < 60 && rng.chance(0.06)) {
        killPerson(state, m.personId, id.age, 'killed in action during a border assignment');
        m.fateNote = `Killed in action during a border assignment at age ${id.age}.`;
        notices.push(`Black borders frame a notice at headquarters: former squadmate ${id.name} fell in action on a frontier mission.`);
      } else if (m.trust >= 60 && rng.chance(0.35)) {
        adjustMemberTrust(state, m, 3);
        notices.push(`You share a brief meal with former squadmate ${id.name} between assignments, trading notes on the changing border.`);
      }
    } else {
      // Ex-Sensei career beats
      if (id.age >= 68 && rng.chance(0.14)) {
        killPerson(state, m.personId, id.age, 'passed away peacefully after decades of service');
        m.fateNote = `Passed away peacefully at age ${id.age} after decades of service.`;
        notices.push(`Your former mentor ${id.name} passed away quietly after a lifetime of service.`);
      } else if (id.age >= 38 && id.age < 60 && rng.chance(0.05)) {
        killPerson(state, m.personId, id.age, 'fell protecting younger shinobi during a border ambush');
        m.fateNote = `Fell protecting younger shinobi during a border ambush at age ${id.age}.`;
        notices.push(`Tragic news: your former Sensei ${id.name} fell holding a canyon pass so younger shinobi could escape.`);
      } else if (m.trust >= 55 && rng.chance(0.25)) {
        adjustMemberTrust(state, m, 2);
        notices.push(`You cross paths with ${id.name} at the memorial stone and exchange quiet words over tea.`);
      }
    }
  }

  return notices;
}
