import { DISCIPLINE_MAP } from '../data/powers';
import { SENSEI_ARCHETYPES, TEAMMATE_ARCHETYPES } from '../data/events-team';
import { VILLAGE_MAP } from '../data/villages';
import { clamp } from './powers';
import type { SeededRng } from './rng';
import type { GameState, KizunaMember, PendingDecision, TeamState, TraitId } from './types';

function generateNpcName(state: GameState, rng: SeededRng, sex: 'M' | 'F', usedNames: Set<string>): string {
  const village = VILLAGE_MAP[state.villageId];
  const pool = sex === 'M' ? village.maleNames : village.femaleNames;
  for (let i = 0; i < 12; i++) {
    const first = rng.pick(pool);
    const last = rng.pick(village.surnames);
    const full = `${first} ${last}`;
    if (!usedNames.has(full) && full !== state.name) {
      usedNames.add(full);
      return full;
    }
  }
  const fallback = `${rng.pick(pool)} ${rng.pick(village.surnames)}`;
  usedNames.add(fallback);
  return fallback;
}

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

export function computeLiveFit(state: GameState, member: Pick<KizunaMember, 'traits'>): number {
  if (member.traits.length === 0) return 55;
  const scores = member.traits.map((tr) => computeTraitScore(state, tr));
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
  if (!member.alive) return 0;
  member.fit = computeLiveFit(state, member);

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

  return member.trust - before;
}

/**
 * Forms the classic Naruto 4-man Genin cell:
 * 1 Jonin Sensei + 2 Genin Teammates + Player as the 3rd student.
 */
export function formGeninTeam(state: GameState, rng: SeededRng): TeamState {
  const usedNames = new Set<string>([state.name, ...state.family.map((f) => f.name)]);
  const teamNumber = rng.int(1, 14);

  const senseiArch = rng.pick(SENSEI_ARCHETYPES);
  const senseiSex: 'M' | 'F' = rng.chance(0.55) ? 'M' : 'F';
  const senseiSpecialty = rng.pick(senseiArch.specialties);
  const sensei: KizunaMember = {
    id: `sensei_${teamNumber}`,
    name: generateNpcName(state, rng, senseiSex, usedNames),
    sex: senseiSex,
    age: state.age + rng.int(12, 20),
    role: 'sensei',
    archetype: senseiArch.label,
    rank: 'jonin',
    specialStatus: 'none',
    alive: true,
    specialty: senseiSpecialty,
    traits: [...senseiArch.traits],
    trust: 38,
    fit: 55,
    relTrack: 'mentorship',
    relStage: 0,
    relPoints: 0,
    fragments: 0,
    promiseMade: false,
    powerScore: rng.int(72, 88),
    lastUpdateAge: state.age,
    fateNote: `Jonin Sensei of Team ${teamNumber}. ${senseiArch.introLine}`,
  };
  sensei.fit = computeLiveFit(state, sensei);
  sensei.trust = clamp(24 + Math.round(sensei.fit * 0.35), 25, 60);

  // Pick 2 distinct teammate archetypes
  const pool = [...TEAMMATE_ARCHETYPES];
  const arch1 = rng.pick(pool);
  const remaining = pool.filter((a) => a.id !== arch1.id);
  const arch2 = rng.pick(remaining);

  const teammates: KizunaMember[] = [arch1, arch2].map((arch, index) => {
    const sex: 'M' | 'F' = index === 0 ? (state.sex === 'M' ? 'F' : 'M') : rng.chance(0.5) ? 'M' : 'F';
    const mate: KizunaMember = {
      id: `mate_${teamNumber}_${index + 1}`,
      name: generateNpcName(state, rng, sex, usedNames),
      sex,
      age: Math.max(10, state.age + rng.int(-1, 1)),
      role: 'teammate',
      archetype: arch.label,
      rank: 'genin',
      specialStatus: 'none',
      alive: true,
      specialty: rng.pick(arch.specialties),
      traits: [...arch.traits],
      trust: 34,
      fit: 55,
      relTrack: 'comrades',
      relStage: 0,
      relPoints: 0,
      fragments: 0,
      promiseMade: false,
      powerScore: rng.int(34, 48),
      lastUpdateAge: state.age,
      fateNote: `Genin squadmate in Team ${teamNumber}. ${arch.introLine}`,
    };
    mate.fit = computeLiveFit(state, mate);
    mate.trust = clamp(22 + Math.round(mate.fit * 0.35), 22, 58);
    return mate;
  });

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
  const specName = DISCIPLINE_MAP[sensei.specialty]?.name ?? sensei.specialty;

  return {
    id: `bell_test_${state.age}`,
    kind: 'bell_test',
    eventId: 'bell_test',
    title: `Team ${team.number} Induction: The Two-Bell Test`,
    body: `${sensei.name} (${sensei.archetype}, specialist in ${specName}) dangles two silver bells before you, ${mates[0].name}, and ${mates[1].name}. Only two bells exist for three Genin. "Take one before noon, or go back to the Academy."`,
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
  const mates = team.members.slice(1);
  const livingMates = mates.filter((m) => m.alive);

  let headline = `Team ${team.number} Disbanded`;
  let body = '';

  if (reason === 'player_chunin') {
    body = `With your promotion to Chunin${promotedNames.length > 1 ? ` alongside ${promotedNames.filter((n) => n !== state.name).join(' and ')}` : ''}, Team ${team.number} is formally dissolved. ${sensei.name} folds the squad roster and buys one final round of skewers at the village dusk market. From tomorrow onward, you walk the shinobi road solo.`;
  } else if (reason === 'teammate_chunin') {
    body = `${promotedNames.join(' and ')} earned the Chunin flak jacket, formally dissolving Team ${team.number}. Though you remain an independent Genin for now, ${sensei.name} reminds you that every shinobi blooms on their own clock. Your shared bond outlives the squad assignment.`;
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
      label: `Bow deeply to ${sensei.name} and vow to honor their teachings`,
      statHints: ['Will', 'Intel'],
      autoEligible: true,
    },
  ];

  const romanceCandidate = livingMates.find(
    (m) => m.trust >= 55 && state.age >= 15 && !state.family.some((f) => f.relation === 'spouse' && f.alive),
  );
  if (romanceCandidate) {
    options.push({
      id: `confess_${romanceCandidate.id}`,
      label: `Pull ${romanceCandidate.name} aside and confess feelings before parting ways`,
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
    meta: { reason, romanceTargetId: romanceCandidate?.id ?? '' },
    options,
  };
}

/**
 * Ages team members each year, grows active teammates in parallel,
 * and simulates autonomous life developments after team disbandment.
 */
export function tickTeamYear(state: GameState, rng: SeededRng): string[] {
  const team = state.team;
  if (!team) return [];
  const notices: string[] = [];

  for (const m of team.members) {
    if (!m.alive) continue;
    m.age += 1;
    m.fit = computeLiveFit(state, m);

    if (team.active) {
      if (m.role === 'teammate') {
        m.powerScore = clamp(m.powerScore + rng.int(4, 9), 10, 98);
      } else {
        m.powerScore = clamp(m.powerScore + rng.int(0, 2), 60, 99);
      }
      continue;
    }

    // Post-disbandment autonomous life simulation
    if (state.age - m.lastUpdateAge < 2) continue;
    if (!rng.chance(0.32)) continue;
    m.lastUpdateAge = state.age;

    if (m.role === 'teammate') {
      m.powerScore = clamp(m.powerScore + rng.int(3, 8), 20, 99);

      if (m.age >= 68 && rng.chance(0.14)) {
        m.alive = false;
        m.fateNote = `Passed away peacefully in retirement at age ${m.age}.`;
        notices.push(`Former squadmate ${m.name} passed away quietly after a long life.`);
      } else if (m.rank === 'genin' && m.powerScore >= 56 && rng.chance(0.5)) {
        m.rank = 'chunin';
        m.fateNote = `Promoted to Chunin at age ${m.age}.`;
        notices.push(`Word reaches you that former squadmate ${m.name} passed the Chunin Exams.`);
      } else if (m.rank === 'chunin' && m.powerScore >= 78 && m.age >= 17 && rng.chance(0.35)) {
        m.rank = 'jonin';
        m.fateNote = `Promoted to Jonin at age ${m.age}.`;
        notices.push(`Former squadmate ${m.name} has been promoted to Jonin.`);
      } else if (
        m.specialStatus === 'none' &&
        (m.trust < 38 || m.traits.includes('ambition')) &&
        m.age >= 16 &&
        m.age <= 32 &&
        rng.chance(0.11)
      ) {
        m.specialStatus = 'missing_nin';
        m.fateNote = `Defected from the village at age ${m.age} as a Missing-Nin.`;
        notices.push(`Shocking dispatch: your former squadmate ${m.name} has abandoned the village and entered the Bingo Book as a Missing-Nin.`);
      } else if (m.age >= 18 && m.age < 60 && rng.chance(0.06)) {
        m.alive = false;
        m.fateNote = `Killed in action during a border assignment at age ${m.age}.`;
        notices.push(`Black borders frame a notice at headquarters: former squadmate ${m.name} fell in action on a frontier mission.`);
      } else if (m.trust >= 60 && rng.chance(0.35)) {
        adjustMemberTrust(state, m, 3);
        notices.push(`You share a brief meal with former squadmate ${m.name} between assignments, trading notes on the changing border.`);
      }
    } else {
      // Ex-Sensei aging and career beats
      if (m.age >= 68 && rng.chance(0.14)) {
        m.alive = false;
        m.fateNote = `Passed away peacefully at age ${m.age} after decades of service.`;
        notices.push(`Your former mentor ${m.name} passed away quietly after a lifetime of service.`);
      } else if (m.age >= 38 && m.age < 60 && rng.chance(0.05)) {
        m.alive = false;
        m.fateNote = `Fell protecting younger shinobi during a border ambush at age ${m.age}.`;
        notices.push(`Tragic news: your former Sensei ${m.name} fell holding a canyon pass so younger shinobi could escape.`);
      } else if (m.trust >= 55 && rng.chance(0.25)) {
        adjustMemberTrust(state, m, 2);
        notices.push(`You cross paths with ${m.name} at the memorial stone and exchange quiet words over tea.`);
      }
    }
  }

  return notices;
}
