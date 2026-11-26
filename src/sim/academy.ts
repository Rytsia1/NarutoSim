import { getClansForVillage } from '../data/clans';
import { VILLAGE_MAP } from '../data/villages';
import { addNpcMemory, createWorldNpc } from './npc-sim';
import { clamp } from './powers';
import { adjustBidirectionalPlayerRel } from './relationships';
import type { SeededRng } from './rng';
import type {
  AcademyState,
  GameState,
  PendingDecision,
  SenseiBias,
  WorldNpc,
} from './types';

const SENSEI_BIASES: readonly SenseiBias[] = ['clan_heirs', 'top_scorers', 'underdogs', 'strict_drill'];

export function getSenseiBiasLabel(bias: SenseiBias): string {
  switch (bias) {
    case 'clan_heirs':
      return 'Favors Prestigious Clan Heirs';
    case 'top_scorers':
      return 'Rewards Top Academic Scorers';
    case 'underdogs':
      return 'Supports Hard-Working Underdogs';
    case 'strict_drill':
      return 'Unforgiving Practical Drillmaster';
  }
}

export function initAcademyState(state: GameState, rng: SeededRng): AcademyState {
  const worldSim = state.worldSim;
  const year = state.birthYear + state.age;
  const villageClans = getClansForVillage(state.villageId);
  const usedNames = new Set<string>([
    state.name,
    ...state.family.map((f) => f.name),
    ...(worldSim?.npcs.map((n) => n.identity.name) ?? []),
  ]);

  let senseiNpcId = 'acad_sensei_local';
  let senseiName = `${rng.pick(VILLAGE_MAP[state.villageId].maleNames)} ${rng.pick(VILLAGE_MAP[state.villageId].surnames)}`;
  const senseiBias = rng.pick(SENSEI_BIASES);

  const classmateNpcIds: string[] = [];
  if (worldSim) {
    // Create Academy Sensei as real WorldNpc
    const senseiNpc = createWorldNpc(
      worldSim,
      {
        villageId: state.villageId,
        clanId: null,
        age: rng.int(24, 38),
        rank: 'chunin',
        specialStatus: 'none',
        roleTitle: 'Academy Instructor',
        roleBias: 'peer',
        personalityBias: {
          compassionate: senseiBias === 'underdogs' ? 25 : 8,
          cautious: 12,
          cruel: senseiBias === 'strict_drill' ? 14 : -10,
        },
        birthYear: year,
      },
      usedNames,
      rng,
    );
    worldSim.npcs.push(senseiNpc);
    senseiNpcId = senseiNpc.identity.id;
    senseiName = senseiNpc.identity.name;
    adjustBidirectionalPlayerRel(
      state,
      senseiNpc,
      { trust: 10, respect: 5, affection: 10 },
      { trust: 10, respect: 15, affection: 8 },
      'mentor',
    );

    // Seed 5 real Academy Classmates (reusing existing same-age youth NPCs if any, then creating the rest)
    const existingYouths = worldSim.npcs.filter(
      (n) =>
        n.identity.alive &&
        n.identity.villageId === state.villageId &&
        n.identity.age >= state.age - 1 &&
        n.identity.age <= state.age + 2 &&
        n.identity.rank !== 'genin' &&
        n.identity.rank !== 'chunin' &&
        n.identity.rank !== 'jonin',
    );
    for (const y of existingYouths.slice(0, 2)) {
      y.identity.rank = 'academy';
      y.identity.roleTitle = 'Academy Classmate';
      classmateNpcIds.push(y.identity.id);
    }

    while (classmateNpcIds.length < 5) {
      const idx = classmateNpcIds.length;
      const clan = idx < 3 && villageClans.length > 0 ? villageClans[idx % villageClans.length] : null;
      const isBullyArch = idx === 2;
      const isRivalArch = idx === 0;
      const mate = createWorldNpc(
        worldSim,
        {
          villageId: state.villageId,
          clanId: clan?.id ?? null,
          age: state.age,
          rank: 'academy',
          specialStatus: 'none',
          roleTitle: 'Academy Classmate',
          roleBias: 'peer',
          powerScore: isRivalArch ? rng.int(24, 32) : rng.int(16, 26),
          personalityBias: isBullyArch
            ? { cruel: 22, ambitious: 16, compassionate: -20 }
            : isRivalArch
              ? { ambitious: 25, loyal: 8 }
              : { compassionate: 16, loyal: 14 },
          birthYear: year,
        },
        usedNames,
        rng,
      );
      worldSim.npcs.push(mate);
      classmateNpcIds.push(mate.identity.id);

      if (isRivalArch) {
        adjustBidirectionalPlayerRel(
          state,
          mate,
          { rivalry: 42, respect: 15, affection: -5 },
          { rivalry: 42, respect: 15, affection: 0 },
          'rival',
        );
      } else if (isBullyArch) {
        adjustBidirectionalPlayerRel(
          state,
          mate,
          { resentment: 28, affection: -18, rivalry: 22 },
          { resentment: 22, affection: -18, trust: -15 },
          'rival',
        );
      } else {
        adjustBidirectionalPlayerRel(
          state,
          mate,
          { trust: 10, affection: 14 },
          { trust: 10, affection: 14 },
          'friend',
        );
      }
    }
  }

  const bullyNpcId = classmateNpcIds[2] ?? null;
  const favoredBySensei =
    (senseiBias === 'clan_heirs' && Boolean(state.clanId && state.originId === 'clan_heir')) ||
    (senseiBias === 'underdogs' && (state.originId === 'war_orphan' || state.originId === 'civilian'));

  const baseSkill = clamp(Math.round(14 + state.stats.chakra * 0.22 + state.stats.intel * 0.4), 12, 38);
  return {
    enrolledAge: state.age,
    senseiNpcId,
    senseiName,
    senseiBias,
    classmateNpcIds,
    academics: clamp(16 + state.stats.intel * 2, 12, 45),
    bunshin: baseSkill,
    henge: clamp(baseSkill + rng.int(-3, 5), 10, 42),
    kawarimi: clamp(baseSkill + rng.int(-3, 5), 10, 42),
    sparringWins: 0,
    sparringLosses: 0,
    classRank: 3,
    favoredBySensei,
    bullyNpcId,
    usedAcademyEvents: [],
  };
}

export function tickAcademyYear(state: GameState, rng: SeededRng): void {
  const ac = state.academy;
  if (!ac || state.rank !== 'academy') return;

  const studyGain = state.focus === 'study' ? rng.int(10, 16) : rng.int(4, 9);
  const chakraGain = state.focus === 'training' ? rng.int(10, 16) : rng.int(5, 10);
  const bodyGain = state.focus === 'body' ? rng.int(10, 16) : rng.int(5, 10);
  const senseiBoost = ac.favoredBySensei ? 3 : 0;

  ac.academics = clamp(ac.academics + studyGain + senseiBoost, 0, 100);
  ac.bunshin = clamp(ac.bunshin + chakraGain + senseiBoost, 0, 100);
  ac.henge = clamp(ac.henge + Math.round((studyGain + chakraGain) / 2), 0, 100);
  ac.kawarimi = clamp(ac.kawarimi + bodyGain, 0, 100);

  // Recompute class rank (1 = Rookie of the Year, 6 = Dead Last)
  const avg = (ac.academics + ac.bunshin + ac.henge + ac.kawarimi) / 4 + ac.sparringWins * 4;
  if (avg >= 76) ac.classRank = 1;
  else if (avg >= 62) ac.classRank = 2;
  else if (avg >= 48) ac.classRank = 3;
  else if (avg >= 36) ac.classRank = 4;
  else if (avg >= 26) ac.classRank = 5;
  else ac.classRank = 6;

  if (ac.senseiBias === 'top_scorers' && ac.classRank <= 2) {
    ac.favoredBySensei = true;
  }
}

export function pickAcademyEventDecision(
  state: GameState,
  rng: SeededRng,
): PendingDecision | null {
  const ac = state.academy;
  if (!ac || state.rank !== 'academy' || state.age < 7 || state.age > 11) return null;

  const worldSim = state.worldSim;
  const classmates: WorldNpc[] = worldSim
    ? ac.classmateNpcIds
        .map((id) => worldSim.npcs.find((n) => n.identity.id === id && n.identity.alive))
        .filter((n): n is WorldNpc => Boolean(n))
    : [];

  const rivalNpc = classmates[0];
  const friendNpc = classmates[1];
  const bullyNpc = classmates.find((c) => c.identity.id === ac.bullyNpcId) ?? classmates[2];

  const pool: { id: string; build: () => PendingDecision }[] = [
    {
      id: 'ac_three_basics',
      build: () => ({
        id: `ac_basics_${state.age}`,
        kind: 'academy_event',
        eventId: 'ac_three_basics',
        title: `Academy Practical: Bunshin, Henge & Kawarimi (Age ${state.age})`,
        body: `${ac.senseiName} lines the class across the dusty yard for the seasonal Three-Basics evaluation. Current mastery: Bunshin ${ac.bunshin}%, Henge ${ac.henge}%, Kawarimi ${ac.kawarimi}% (Class Rank #${ac.classRank}).`,
        manual: false,
        meta: { acScenario: 'three_basics' },
        options: [
          {
            id: 'drill_bunshin',
            label: 'Focus on flawless Bunshin (Clone) chakra splitting',
            sublabel: '+14 Bunshin, +3 Chakra, +3 Academics.',
            statHints: ['Chakra'],
            autoEligible: true,
          },
          {
            id: 'drill_henge',
            label: 'Perfect convincing Henge (Transformation) detail and voice',
            sublabel: '+15 Henge, +3 Intel. Valuable later for infiltration and disguises.',
            statHints: ['Intel'],
            autoEligible: true,
          },
          {
            id: 'drill_kawarimi',
            label: 'Drill split-second Kawarimi (Substitution) reflexes with wooden logs',
            sublabel: '+15 Kawarimi, +3 Health, +2 Will.',
            statHints: ['Health', 'Will'],
            autoEligible: true,
          },
        ],
      }),
    },
    {
      id: 'ac_sparring_ring',
      build: () => ({
        id: `ac_spar_${state.age}`,
        kind: 'academy_event',
        eventId: 'ac_sparring_ring',
        title: `Academy Sparring Ring vs ${rivalNpc?.identity.name ?? 'Top Classmate'}`,
        body: `${ac.senseiName} draws a chalk circle in the courtyard and calls you forward to form the Seal of Confrontation against ${rivalNpc?.identity.name ?? 'your top rival'} in front of the whole class.`,
        manual: false,
        meta: { acScenario: 'sparring_ring', targetNpcId: rivalNpc?.identity.id ?? '' },
        options: [
          {
            id: 'spar_aggressive',
            label: 'Press forward aggressively with Taijutsu and Kawarimi feints',
            sublabel: 'Tests Health & Kawarimi. Victory boosts Class Rank, Respect & Rivalry!',
            statHints: ['Health', 'Will'],
            autoEligible: true,
          },
          {
            id: 'spar_tactical',
            label: 'Use Henge and Bunshin misdirection to outsmart their guard',
            sublabel: 'Tests Intel & Henge/Bunshin.',
            statHints: ['Intel', 'Chakra'],
            autoEligible: true,
          },
          {
            id: 'spar_respectful',
            label: 'Fight cleanly and offer the Seal of Reconciliation afterward',
            sublabel: 'Builds mutual Respect & Affection regardless of outcome.',
            statHints: ['Bonds', 'Will'],
            autoEligible: true,
          },
        ],
      }),
    },
    {
      id: 'ac_bullying_stand',
      build: () => ({
        id: `ac_bully_${state.age}`,
        kind: 'academy_event',
        eventId: 'ac_bullying_stand',
        title: `Courtyard Tension: ${bullyNpc?.identity.name ?? 'Older Classmate'}'s Taunts`,
        body: `Behind the shuriken targets, ${bullyNpc?.identity.name ?? 'a boastful classmate'} corners ${friendNpc?.identity.name ?? 'a quieter student'} and mocks their clan standing and exam scores while other children look away.`,
        manual: false,
        meta: {
          acScenario: 'bullying',
          bullyId: bullyNpc?.identity.id ?? '',
          victimId: friendNpc?.identity.id ?? '',
        },
        options: [
          {
            id: 'defend_peer',
            label: `Step between them and challenge ${bullyNpc?.identity.name ?? 'the bully'} directly`,
            sublabel: '+5 Will, huge Trust & Affection with victim, Rivalry/Resentment with bully.',
            statHints: ['Will', 'Bonds'],
            autoEligible: true,
          },
          {
            id: 'prank_henge',
            label: 'Use Henge to impersonate Sensei and scatter the bullies without blows',
            sublabel: 'Tests Henge & Intel. Clever win (+8 Henge, +4 Intel, +Trust).',
            statHints: ['Intel'],
            autoEligible: true,
          },
          {
            id: 'walk_past',
            label: 'Keep your head down and walk back to your own training post',
            sublabel: 'Avoids trouble (+3 Chakra, -Trust with classmate).',
            statHints: ['Chakra'],
            autoEligible: false,
          },
        ],
      }),
    },
    {
      id: 'ac_sensei_favoritism',
      build: () => ({
        id: `ac_favor_${state.age}`,
        kind: 'academy_event',
        eventId: 'ac_sensei_favoritism',
        title: `Academy Politics: ${ac.senseiName}'s Favoritism`,
        body: `${ac.senseiName} (${getSenseiBiasLabel(ac.senseiBias)}) awards extra scrolls and glowing marks to their preferred students while brushing past equally sharp work from the rest of the room.`,
        manual: false,
        meta: { acScenario: 'favoritism', rivalId: rivalNpc?.identity.id ?? '' },
        options: [
          {
            id: 'outwork_bias',
            label: 'Stay past sunset drilling until your scores cannot be ignored',
            sublabel: '+10 Academics, +6 Bunshin, +4 Will, wins Sensei Respect.',
            statHints: ['Will', 'Intel'],
            autoEligible: true,
          },
          {
            id: 'share_notes',
            label: 'Form a late-afternoon study circle with overlooked classmates',
            sublabel: '+6 Bonds, +8 Academics, raises Trust & Affection across classmates.',
            statHints: ['Bonds', 'Intel'],
            autoEligible: true,
          },
          {
            id: 'call_out_sensei',
            label: 'Question the unfair grading openly during class review',
            sublabel: '+6 Will, earns peer Respect, risks Sensei Resentment.',
            statHints: ['Will'],
            autoEligible: false,
          },
        ],
      }),
    },
  ];

  const unused = pool.filter((p) => !ac.usedAcademyEvents.includes(p.id));
  const chosen = unused.length > 0 ? rng.pick(unused) : rng.pick(pool);
  if (!ac.usedAcademyEvents.includes(chosen.id)) {
    ac.usedAcademyEvents.push(chosen.id);
  }
  return chosen.build();
}

export function resolveAcademyEventDecision(
  state: GameState,
  optionId: string,
  meta: Record<string, string | number | boolean> | undefined,
  rng: SeededRng,
): {
  tone: 'normal' | 'milestone' | 'danger' | 'bond';
  title: string;
  text: string;
  checkLabel?: string;
  checkPassed?: boolean;
} {
  const ac = state.academy!;
  const worldSim = state.worldSim;
  const year = state.birthYear + state.age;
  const scenario = String(meta?.acScenario ?? '');

  if (scenario === 'three_basics') {
    if (optionId === 'drill_bunshin') {
      ac.bunshin = clamp(ac.bunshin + 14, 0, 100);
      ac.academics = clamp(ac.academics + 3, 0, 100);
      state.stats.chakra += 3;
      return {
        tone: 'normal',
        title: 'Bunshin Mastery Drill',
        text: `Two crisp afterimages snap into place beside you. ${ac.senseiName} marks your Bunshin form at ${ac.bunshin}%.`,
      };
    }
    if (optionId === 'drill_henge') {
      ac.henge = clamp(ac.henge + 15, 0, 100);
      state.stats.intel += 3;
      return {
        tone: 'normal',
        title: 'Henge Precision Drill',
        text: `Even your voice and posture hold without a flicker of smoke. Your Henge mastery reaches ${ac.henge}%.`,
      };
    }
    ac.kawarimi = clamp(ac.kawarimi + 15, 0, 100);
    state.stats.health += 3;
    state.stats.will += 2;
    return {
      tone: 'normal',
      title: 'Kawarimi Reflex Drill',
      text: `Wooden kunai strike only a cedar log while you drop silently behind the target line. Kawarimi reaches ${ac.kawarimi}%.`,
    };
  }

  if (scenario === 'sparring_ring') {
    const targetId = String(meta?.targetNpcId ?? '');
    const opponent = worldSim?.npcs.find((n) => n.identity.id === targetId);
    const oppName = opponent?.identity.name ?? 'your classmate';
    const power =
      optionId === 'spar_tactical'
        ? state.stats.intel * 0.5 + (ac.henge + ac.bunshin) * 0.35
        : state.stats.health * 0.45 + ac.kawarimi * 0.45 + state.stats.will * 0.25;
    const won = power + rng.int(0, 30) >= (opponent ? opponent.identity.powerScore + 46 : 64);

    if (won) {
      ac.sparringWins += 1;
      ac.classRank = Math.max(1, ac.classRank - 1);
      state.stats.will += 3;
      if (opponent) {
        adjustBidirectionalPlayerRel(
          state,
          opponent,
          {
            respect: 14,
            rivalry: 12,
            affection: optionId === 'spar_respectful' ? 10 : -4,
            resentment: optionId === 'spar_aggressive' ? 10 : -4,
          },
          { respect: 10, rivalry: 10, affection: optionId === 'spar_respectful' ? 10 : 0 },
        );
        addNpcMemory(opponent, {
          year,
          age: opponent.identity.age,
          tag: 'exam',
          summary: `Lost an Academy sparring bout to ${state.name} before the class.`,
          actorId: 'player',
          impact: -3,
        });
      }
      return {
        tone: 'milestone',
        title: `Sparring Victory Over ${oppName}`,
        text: `You force ${oppName} out of the chalk ring with crisp timing! Your Academy standing rises to Rank #${ac.classRank}.`,
        checkLabel: 'Academy Sparring Ring',
        checkPassed: true,
      };
    }

    ac.sparringLosses += 1;
    state.stats.will += 2;
    state.stats.health = Math.max(12, state.stats.health - 3);
    if (opponent) {
      adjustBidirectionalPlayerRel(
        state,
        opponent,
        { respect: 6, rivalry: 8, affection: optionId === 'spar_respectful' ? 8 : 0 },
        { respect: 12, rivalry: 14, resentment: optionId === 'spar_respectful' ? 0 : 6 },
      );
    }
    return {
      tone: 'normal',
      title: `Hard-Fought Bout vs ${oppName}`,
      text: `${oppName} counters your opening step and claims the chalk ring, yet the bout leaves you sharper and hungry for a rematch.`,
      checkLabel: 'Academy Sparring Ring',
      checkPassed: false,
    };
  }

  if (scenario === 'bullying') {
    const bully = worldSim?.npcs.find((n) => n.identity.id === String(meta?.bullyId ?? ''));
    const victim = worldSim?.npcs.find((n) => n.identity.id === String(meta?.victimId ?? ''));
    if (optionId === 'defend_peer') {
      state.stats.will += 5;
      state.stats.bonds += 4;
      if (victim) {
        adjustBidirectionalPlayerRel(
          state,
          victim,
          { trust: 20, affection: 22, respect: 16 },
          { trust: 14, affection: 16 },
          'friend',
        );
        addNpcMemory(victim, {
          year,
          age: victim.identity.age,
          tag: 'bond',
          summary: `${state.name} stood up for me against Academy bullies.`,
          actorId: 'player',
          impact: 7,
        });
      }
      if (bully) {
        adjustBidirectionalPlayerRel(
          state,
          bully,
          { resentment: 18, fear: 12, rivalry: 14, affection: -12 },
          { resentment: 12, affection: -14 },
          'rival',
        );
      }
      return {
        tone: 'bond',
        title: 'Stood Ground in the Courtyard',
        text: `You planted your boots between ${bully?.identity.name ?? 'the bully'} and ${victim?.identity.name ?? 'your classmate'} until they backed down. That quiet loyalty will not be forgotten.`,
      };
    }
    if (optionId === 'prank_henge') {
      const ok = ac.henge + state.stats.intel + rng.int(0, 28) >= 62;
      ac.henge = clamp(ac.henge + 8, 0, 100);
      state.stats.intel += 4;
      if (ok && victim) {
        adjustBidirectionalPlayerRel(state, victim, { trust: 14, affection: 16, respect: 14 }, { affection: 12 }, 'friend');
      }
      return {
        tone: ok ? 'bond' : 'normal',
        title: ok ? 'Flawless Henge Intervention' : 'Smoky Disguise Mishap',
        text: ok
          ? `Transforming cleanly into ${ac.senseiName}, you sent the bullies sprinting for the classroom while ${victim?.identity.name ?? 'your classmate'} burst out laughing.`
          : `Your disguise puffed apart halfway through a barked order, though the commotion still broke up the cornering.`,
        checkLabel: 'Henge Impersonation',
        checkPassed: ok,
      };
    }
    state.stats.chakra += 3;
    if (victim) {
      adjustBidirectionalPlayerRel(state, victim, { trust: -10, affection: -8, resentment: 10 }, { affection: -4 });
    }
    return {
      tone: 'normal',
      title: 'Eyes on Your Own Targets',
      text: 'You kept walking toward the kunai range, telling yourself shinobi must harden their own skin.',
    };
  }

  // Sensei favoritism
  const sensei = worldSim?.npcs.find((n) => n.identity.id === ac.senseiNpcId);
  if (optionId === 'outwork_bias') {
    ac.academics = clamp(ac.academics + 10, 0, 100);
    ac.bunshin = clamp(ac.bunshin + 6, 0, 100);
    ac.favoredBySensei = true;
    state.stats.will += 4;
    if (sensei) {
      adjustBidirectionalPlayerRel(state, sensei, { respect: 18, trust: 10 }, { respect: 8 });
    }
    return {
      tone: 'milestone',
      title: 'Earned Respect Through Grit',
      text: `Night after night beneath courtyard lanterns, your scores climb so high even ${ac.senseiName} publicly commends your discipline.`,
    };
  }
  if (optionId === 'share_notes') {
    ac.academics = clamp(ac.academics + 8, 0, 100);
    state.stats.bonds += 6;
    if (worldSim) {
      for (const cid of ac.classmateNpcIds.slice(0, 3)) {
        const mate = worldSim.npcs.find((n) => n.identity.id === cid && n.identity.alive);
        if (mate) {
          adjustBidirectionalPlayerRel(state, mate, { trust: 10, affection: 10, respect: 8 }, { trust: 8, affection: 8 });
        }
      }
    }
    return {
      tone: 'bond',
      title: 'After-Hours Study Circle',
      text: 'Sharing chakra theory scrolls beneath the cedar trees turns quiet classmates into steadfast future comrades.',
    };
  }
  state.stats.will += 6;
  ac.favoredBySensei = false;
  if (sensei) {
    adjustBidirectionalPlayerRel(state, sensei, { resentment: 14, respect: 6, affection: -10 }, { respect: -10, resentment: 10 });
  }
  return {
    tone: 'normal',
    title: 'Challenged the Instructor',
    text: `Silence fell across the room when you challenged ${ac.senseiName}'s grading. You earned detention, yet half the class began looking at you with newfound respect.`,
  };
}
