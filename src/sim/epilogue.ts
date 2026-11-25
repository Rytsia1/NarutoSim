import { RETIREMENT_EVENTS } from '../data/events-epilogue';
import { BLOODLINE_MAP, DISCIPLINE_MAP } from '../data/powers';
import { ORIGIN_MAP } from '../data/origins';
import { VILLAGE_MAP } from '../data/villages';
import { computeCombatProjection } from './powers';
import type { SeededRng } from './rng';
import type { EpilogueBeat, GameState, LifeRecord, PendingDecision } from './types';

export function canEnterRetirement(state: GameState): boolean {
  if (state.phase !== 'life') return false;
  if (state.pending !== null) return false;
  return state.age >= 50 || Boolean(state.flags.medical_retirement);
}

export function buildRetirementEventDecision(state: GameState, rng: SeededRng): PendingDecision | null {
  const hasSpouse = state.family.some((f) => f.relation === 'spouse' && f.alive);
  const candidates = RETIREMENT_EVENTS.filter((ev) => {
    if (state.usedRetirement.includes(ev.id)) return false;
    if (ev.requiresJonin && state.rank !== 'jonin') return false;
    if (ev.requiresSpouse && !hasSpouse) return false;
    return true;
  });

  if (candidates.length === 0) return null;
  const chosen = rng.pick(candidates);
  state.usedRetirement.push(chosen.id);

  return {
    id: `ret_${chosen.id}_${state.age}`,
    kind: 'retirement_event',
    eventId: chosen.id,
    title: chosen.title,
    body: chosen.body,
    manual: false,
    meta: { retEventId: chosen.id },
    options: chosen.options.map((opt) => ({
      id: opt.id,
      label: opt.label,
      autoEligible: opt.autoEligible,
    })),
  };
}

/**
 * Posthumous Legacy Epilogue: fires whenever the shinobi dies at ANY age or phase
 * (age 13 in a Genin war, age 24 on an A-Rank mission, or age 78 in retirement).
 */
export function buildPosthumousEpilogue(state: GameState): EpilogueBeat[] {
  const village = VILLAGE_MAP[state.villageId].name;
  const beats: EpilogueBeat[] = [];

  // Beat 1: The Memorial Stone / Burial
  if (state.specialStatus === 'missing_nin') {
    beats.push({
      title: 'An Unmarked Cairn Beyond the Border',
      tone: 'epilogue',
      body: `No bells ring in ${village} when word of your death arrives at age ${state.age} (${state.causeOfDeath ?? 'fallen in the wilds'}). A clerk draws a single black line across your Bingo Book entry, and rain washes over the stones where you fell.`,
    });
  } else if (state.specialStatus === 'kage' || state.rank === 'jonin') {
    beats.push({
      title: 'Carved Into the Memorial Stone',
      tone: 'milestone',
      body: `Black umbrellas crowd the hillside above ${village} as your name is chiseled beside the village's greatest defenders. Passing at age ${state.age} (${state.causeOfDeath ?? 'at the end of your road'}), you leave behind the weight of a true ${state.specialStatus === 'kage' ? 'Kage' : 'Jonin'}.`,
    });
  } else if (state.rank === 'genin' || state.rank === 'chunin') {
    beats.push({
      title: 'White Flowers in the Rain',
      tone: 'epilogue',
      body: `A quiet row of white chrysanthemums rests beneath the stone monument of ${village}. Gone at age ${state.age} (${state.causeOfDeath ?? 'on duty'}), your forehead protector is folded neatly atop your service file.`,
    });
  } else {
    beats.push({
      title: 'A Quiet Farewell',
      tone: 'epilogue',
      body: `Lanterns burn softly by the river as neighbors gather in ${village} to remember ${state.name}, who left this world at age ${state.age} (${state.causeOfDeath ?? 'natural causes'}).`,
    });
  }

  // Beat 2: Those Left Behind (Genin Squad Kizuna & Family)
  const team = state.team;
  const livingSquad = team ? team.members.filter((m) => m.alive) : [];
  const livingSpouse = state.family.find((f) => f.relation === 'spouse' && f.alive);
  const livingChildren = state.family.filter((f) => f.relation === 'child' && f.alive);

  if (livingSquad.length > 0) {
    const closest = [...livingSquad].sort((a, b) => b.trust - a.trust)[0];
    const teamText =
      closest.specialStatus === 'missing_nin'
        ? `Far from ${village}, your former squadmate ${closest.name} hears the rumor in a roadside inn and stands silently in the rain long after the lantern goes out.`
        : closest.role === 'sensei'
          ? `Your former Sensei, ${closest.name}, lingers by the stone long after everyone leaves, resting a hand on the cold slate and whispering that students were never meant to go before their teacher.`
          : closest.relTrack === 'romance'
            ? `${closest.name} stays until dusk beside your grave, holding tightly to the promise you made when Team ${team!.number} parted ways.`
            : `${closest.name} of old Team ${team!.number} places two wooden training sticks beside the flowers, swearing to carry your share of the road forward.`;

    const familyLine = livingSpouse
      ? ` Beside them stands ${livingSpouse.name}${livingChildren.length > 0 ? ` with your ${livingChildren.length === 1 ? 'child' : `${livingChildren.length} children`}` : ''}, keeping your memory alive at home.`
      : '';

    beats.push({
      title: 'Echoes of Kizuna',
      tone: 'bond',
      body: `${teamText}${familyLine}`,
    });
  } else if (livingSpouse || livingChildren.length > 0) {
    beats.push({
      title: 'The Empty Sandals by the Door',
      tone: 'bond',
      body: `At home, ${livingSpouse ? livingSpouse.name : 'your children'} keep your worn headband in a cedar box, retelling stories of your courage whenever winter rain hammers the roof.`,
    });
  }

  // Beat 3: World Echo / Posthumous Crisis Echo
  if (state.world.seededCrisis !== 'none' && state.world.crisisStage < 2) {
    const echoText =
      state.world.seededCrisis === 'calamity'
        ? 'Years after your passing, the sky over the Five Great Nations cracks crimson as an ancient tailed-beast calamity tears free of its seals. The storm that once only whispered through your missions finally breaks upon the next generation.'
        : 'Years after your passing, a hidden mastermind steps out of the rain to plunge all five nations into a shadow war. The conspiracy whose loose threads you never lived to unravel finally claims the stage.';
    beats.push({
      title: 'The Storm You Never Lived to See',
      tone: 'crisis',
      body: echoText,
    });
  } else if (state.world.truePeace) {
    beats.push({
      title: 'Peace Bought in Blood and Resolve',
      tone: 'milestone',
      body: `Because you stood firm when the Endgame Crisis threatened to swallow the continent, a generation of academy children grows up without ever hearing mobilization drums.`,
    });
  } else if (state.warHistory.length > 0) {
    beats.push({
      title: 'Pages in the Shinobi Chronicle',
      tone: 'epilogue',
      body: `Your service across ${state.warHistory.length} ${state.warHistory.length === 1 ? 'war' : 'wars'} becomes a footnote studied by younger tacticians, proving that survival in the shinobi world is never guaranteed.`,
    });
  }

  return beats;
}

export function buildLifeRecord(state: GameState): LifeRecord {
  const proj = computeCombatProjection(state);
  const village = VILLAGE_MAP[state.villageId];
  const origin = ORIGIN_MAP[state.originId];
  const topDisciplines = [...state.disciplines]
    .sort((a, b) => b.level - a.level || b.xp - a.xp)
    .slice(0, 3)
    .map((d) => `${DISCIPLINE_MAP[d.id]?.name ?? d.id} (Tier ${d.level})`);

  const bloodlineName =
    state.bloodline && state.bloodline.stage !== 'latent'
      ? BLOODLINE_MAP[state.bloodline.id]?.name ?? state.bloodline.id
      : null;

  let teamSummary = 'Never assigned to a Genin squad.';
  if (state.team) {
    const names = state.team.members.map((m) => `${m.name} (${m.role === 'sensei' ? 'Sensei' : m.rank})`).join(', ');
    teamSummary = `Team ${state.team.number} (${state.team.active ? 'Active at death' : `Disbanded at age ${state.team.disbandedAge}`}): ${names}`;
  }

  const crisisName =
    state.world.seededCrisis === 'calamity' ? 'Tailed-Beast Calamity' : 'Shadow Mastermind';
  const crisisStatus =
    state.world.seededCrisis === 'none'
      ? 'Normal Shinobi Era'
      : state.world.crisisStage === 3
        ? `Resolved ${crisisName}`
        : state.flags.crisis_claimed
          ? `Claimed Forbidden Power (${crisisName})`
          : state.world.crisisStage === 2
            ? `Endured / Fell during ${crisisName}`
            : `Unresolved (${state.world.crisisClues} clues gathered before death)`;

  return {
    id: `life_${state.rng.seed}_${state.birthYear}_${state.age}`,
    seed: state.rng.seed,
    name: state.name,
    sex: state.sex,
    villageId: state.villageId,
    villageName: village.name,
    originId: state.originId,
    originName: origin.name,
    birthYear: state.birthYear,
    deathYear: state.birthYear + state.age,
    deathAge: state.age,
    causeOfDeath: state.causeOfDeath ?? 'natural causes',
    peakRank: state.peakRank,
    specialStatus: state.specialStatus,
    threatTier: proj.threatTier,
    element: state.element,
    bloodlineName,
    topDisciplines,
    warsSurvived: state.world.warsSurvived,
    warsFought: state.warHistory.length,
    crisisStatus,
    lastWords: state.lastWords.trim(),
    reflections: [...state.reflections],
    warHistory: [...state.warHistory],
    teamSummary,
    posthumousBeats: [...state.posthumousBeats],
  };
}
