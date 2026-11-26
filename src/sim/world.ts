import { CRISIS_WHISPERS } from '../data/events-team';
import { clamp } from './powers';
import type { SeededRng } from './rng';
import type { CrisisId, GameState, PendingDecision, ScenarioConfig } from './types';

export const MAX_CRISIS_CLUES = 5;

export const BIJUU_LIST: readonly string[] = [
  'Shukaku (One-Tail)',
  'Matatabi (Two-Tails)',
  'Isobu (Three-Tails)',
  'Son Goku (Four-Tails)',
  'Kokuo (Five-Tails)',
  'Saiken (Six-Tails)',
  'Chomei (Seven-Tails)',
  'Gyuki (Eight-Tails)',
  'Kurama (Nine-Tails)',
];

/**
 * Deterministic Bijuu name per run without consuming RNG.
 */
export function getWorldBijuuName(state: { rng: { seed: number }; world: { bijuuName?: string } }): string {
  if (state.world.bijuuName) return state.world.bijuuName;
  const idx = Math.abs(state.rng.seed) % BIJUU_LIST.length;
  return BIJUU_LIST[idx];
}

export function rollSeededCrisis(rng: SeededRng, scenario?: ScenarioConfig): CrisisId {
  if (scenario?.crisisOverride && scenario.crisisOverride !== 'natural') {
    return scenario.crisisOverride;
  }
  const r = rng.next();
  if (r < 0.25) return 'calamity';
  if (r < 0.45) return 'mastermind';
  return 'none';
}

/**
 * Endgame Gate: seeded world crises never erupt while the player is a fresh Genin.
 * They unlock once the player reaches Jonin, survives an earlier war into adulthood,
 * or serves as an active adult shinobi into their late twenties.
 */
export function isEndgameReady(state: GameState): boolean {
  if (state.rank === 'civilian' || state.rank === 'academy') return false;
  if (state.rank === 'jonin') return true;
  if (state.world.warsSurvived >= 1 && state.age >= 20) return true;
  if (state.age >= 26) return true;
  return false;
}

export function getTensionLabel(tension: number, truePeace: boolean): string {
  if (truePeace && tension < 35) return 'Era of Peace';
  if (tension >= 80) return 'War Imminent';
  if (tension >= 60) return 'Border Crisis';
  if (tension >= 35) return 'Cold Tensions';
  return 'Fragile Calm';
}

export interface TensionTickResult {
  triggerWar: boolean;
  isCrisisWar: boolean;
  whisperDecision: PendingDecision | null;
  omenLogged: boolean;
}

export function tickWorldTension(state: GameState, rng: SeededRng): TensionTickResult {
  const w = state.world;
  if (state.phase !== 'life') {
    return { triggerWar: false, isCrisisWar: false, whisperDecision: null, omenLogged: false };
  }

  // Advance tension each year (slower during early childhood so Genin/Chunin arcs breathe naturally)
  const peaceDampener = w.truePeace ? 0.35 : 1;
  const baseStep = state.age < 12 ? rng.int(2, 4) : rng.int(5, 10);
  const delta = Math.round(baseStep * peaceDampener);
  w.tension = clamp(w.tension + delta, 0, 100);

  // Crisis Stage 0 -> 1 foreshadowing whispers starting age 14+
  let whisperDecision: PendingDecision | null = null;
  if (w.seededCrisis !== 'none' && w.crisisStage <= 1 && state.age >= 14) {
    if (w.crisisStage === 0) {
      w.crisisStage = 1;
    }
    const availableWhispers = CRISIS_WHISPERS.filter(
      (cw) => cw.crisisId === w.seededCrisis && !state.usedEvents.includes(cw.id),
    );
    if (availableWhispers.length > 0 && rng.chance(0.26)) {
      const cw = rng.pick(availableWhispers);
      whisperDecision = {
        id: `${cw.id}_${state.age}`,
        kind: 'crisis_whisper',
        eventId: cw.id,
        title: `Strange Intelligence: ${cw.title}`,
        body: cw.body,
        manual: false,
        meta: { whisperId: cw.id },
        options: [
          {
            id: 'investigate_clue',
            label: 'Investigate the anomaly and cross-check mission logs',
            statHints: ['Intel', 'Sensory'],
            autoEligible: true,
          },
          {
            id: 'report_ignore',
            label: 'File the rumor with headquarters and stay focused on drills',
            statHints: ['Will'],
            autoEligible: true,
          },
        ],
      };
    }
  }

  // Check if a Great Shinobi War can break out (honors K4 Peace Accord 12-year cooldown)
  const warCooldownOk =
    (w.lastWarAge === null || state.age - w.lastWarAge >= 6) &&
    (!w.peaceAccordUntilAge || state.age >= w.peaceAccordUntilAge);
  let omenLogged = false;

  if (w.tension >= 70 && !w.omenActive && warCooldownOk && state.age >= 11) {
    w.omenActive = true;
    omenLogged = true;
  }

  const canTriggerWar =
    w.tension >= 80 &&
    warCooldownOk &&
    state.age >= 12 &&
    state.rank !== 'academy' &&
    !w.truePeace;

  if (canTriggerWar) {
    const isCrisisWar =
      w.seededCrisis !== 'none' && w.crisisStage < 2 && isEndgameReady(state);
    return { triggerWar: true, isCrisisWar, whisperDecision: null, omenLogged };
  }

  return { triggerWar: false, isCrisisWar: false, whisperDecision, omenLogged };
}

export function buildWarPreludeDecision(state: GameState, isCrisisWar: boolean): PendingDecision {
  const warNum = state.world.eraNumber;
  const rankLabel = state.rank.toUpperCase();
  const bijuu = getWorldBijuuName(state);
  const crisisTitle =
    state.world.seededCrisis === 'calamity'
      ? `Endgame Crisis: ${bijuu} Rampage`
      : 'Endgame Crisis: The Akatsuki Conspiracy';

  if (state.rank === 'civilian') {
    return {
      id: `war_pre_${warNum}_${state.age}`,
      kind: 'war_prelude',
      eventId: 'war_prelude_civilian',
      title: `Great Shinobi War #${warNum} Reaches the Border`,
      body: 'Smoke rises along the outer trade road as rival shinobi skirmishers clash outside the village gates. As a civilian, every choice is about survival.',
      manual: true,
      meta: { isCrisisWar: false, warNum },
      options: [
        {
          id: 'evacuate',
          label: 'Evacuate into the reinforced mountain shelters',
          statHints: ['Health', 'Ryo'],
          autoEligible: true,
        },
        {
          id: 'aid_wounded',
          label: 'Stay behind to carry supplies and wounded shinobi',
          statHints: ['Bonds', 'Health'],
          autoEligible: true,
        },
      ],
    };
  }

  const title = isCrisisWar
    ? `War #${warNum} Escalates: ${crisisTitle}`
    : `Great Shinobi War #${warNum} Mobilization (${rankLabel})`;

  let body = '';
  if (isCrisisWar) {
    body =
      state.world.seededCrisis === 'calamity'
        ? `The ancient seals you heard whispered about for years have shattered across the frontier. ${bijuu} has torn loose across the borderlands, forcing bitter rival villages into the Allied Shinobi Forces. Clues gathered: ${state.world.crisisClues}/${MAX_CRISIS_CLUES}.`
        : `Every border skirmish was bait. Akatsuki and their masked leader have stepped out of the Amegakure rain to seize the Five Great Nations from the shadows. Clues gathered: ${state.world.crisisClues}/${MAX_CRISIS_CLUES}.`;
  } else if (state.rank === 'genin') {
    body = state.team?.active
      ? `Emergency mobilization drums echo at dawn. Even Genin cells are being rushed to hold secondary supply passes. Team ${state.team.number} is ordered to deploy immediately. Surviving rival Chunin and Jonin will take everything you have.`
      : 'Emergency draft notices post across the square. Even as an independent Genin, you are ordered to the contested frontier.';
  } else if (state.rank === 'jonin') {
    body = 'As a Jonin, you are assigned directly to the decisive 14-day contested sector. Enemy hunter teams already know your face and threat tier.';
  } else {
    body = 'Chunin mobilization orders seal your pack before sunrise. Fourteen days of ambushes, sabotage, and survival await on the contested front.';
  }

  return {
    id: `war_pre_${warNum}_${state.age}`,
    kind: 'war_prelude',
    eventId: 'war_prelude_shinobi',
    title,
    body,
    manual: true,
    meta: { isCrisisWar, warNum },
    options: [
      {
        id: 'deploy_front',
        label: isCrisisWar
          ? 'March to the Crisis Front and face the threat head-on'
          : 'Deploy to the 14-day contested front',
        sublabel: 'High glory and chance of Field Promotion, with real risk of death.',
        statHints: ['Chakra', 'Health', 'Will'],
        autoEligible: true,
      },
      {
        id: 'recon_flank',
        label: 'Operate along the reconnaissance flank (cautious survival)',
        sublabel: 'Lower mortality risk, relies on Intel and stealth.',
        statHints: ['Intel', 'Will'],
        autoEligible: true,
      },
      ...(state.specialStatus !== 'missing_nin'
        ? [
            {
              id: 'desert_war',
              label: 'Refuse the meat grinder and flee across the border (Become Missing-Nin)',
              sublabel: 'Avoid the war immediately, but village Hunter-Nin will hunt you.',
              statHints: ['Will'],
              autoEligible: false,
            },
          ]
        : []),
    ],
  };
}
