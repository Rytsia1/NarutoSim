import { clamp } from '../powers';
import type { WarBeat, WarState, WarTimeOfDay } from '../types';

export const DEFAULT_WAR_SECONDS_PER_DAY = 110; // GDD LEN[40].spd = 110s at 1x

export function baseWarGap(war: Pick<WarState, 'secondsPerDay'>): number {
  return (war.secondsPerDay || DEFAULT_WAR_SECONDS_PER_DAY) / 12;
}

export function ensureWarClockDefaults(war: WarState): void {
  if (typeof war.secondsPerDay !== 'number' || war.secondsPerDay <= 0) {
    war.secondsPerDay = DEFAULT_WAR_SECONDS_PER_DAY;
  }
  if (typeof war.beatClock !== 'number') war.beatClock = 0;
  if (!Array.isArray(war.beatQueue)) war.beatQueue = [];
  if (!war.timeOfDay) war.timeOfDay = war.subPhase === 'night' ? 'dusk' : 'morning';
  if (typeof war.statusText !== 'string') war.statusText = 'Holding sector perimeter...';
  if (!Array.isArray(war.npcNightActed)) war.npcNightActed = [];
  if (typeof war.npcExtraRaidPressure !== 'number') war.npcExtraRaidPressure = 0;
  if (!Array.isArray(war.usedPartnerScenes)) war.usedPartnerScenes = [];
  if (war.partner === undefined) war.partner = null;
  if (war.activeBattle) {
    if (typeof war.activeBattle.odMax !== 'number') war.activeBattle.odMax = 24;
    if (typeof war.activeBattle.od !== 'number') war.activeBattle.od = war.activeBattle.odMax;
    if (typeof war.activeBattle.odUsedCount !== 'number') war.activeBattle.odUsedCount = 0;
  }
}

export function enqueueWarBeat(war: WarState, beat: WarBeat): void {
  ensureWarClockDefaults(war);
  war.beatQueue.push(beat);
  if (war.beatQueue.length === 1) {
    war.statusText = beat.label;
  }
}

export function queueWarStart(war: WarState): void {
  ensureWarClockDefaults(war);
  const gap = baseWarGap(war);
  war.beatClock = 0;
  war.beatQueue = [];
  war.timeOfDay = 'morning';
  enqueueWarBeat(war, {
    kind: 'day_open',
    delay: Number((gap * 0.55).toFixed(2)),
    label: 'Establishing perimeter and scanning sector chakra...',
    timeOfDay: 'morning',
  });
}

export function queueDayDecision(war: WarState, factor = 0.6): void {
  const gap = baseWarGap(war);
  enqueueWarBeat(war, {
    kind: 'day_decision',
    delay: Number((gap * factor).toFixed(2)),
    label: 'Evaluating daylight tactical openings...',
    timeOfDay: 'afternoon',
  });
}

export function queueNightDecision(war: WarState): void {
  const gap = baseWarGap(war);
  war.subPhase = 'night';
  enqueueWarBeat(war, {
    kind: 'night_decision',
    delay: Number((gap * 1.0).toFixed(2)),
    label: 'Dusk settles across the contested valley...',
    timeOfDay: 'dusk',
  });
}

export function queueNightSequence(war: WarState): void {
  ensureWarClockDefaults(war);
  const gap = baseWarGap(war);
  war.npcNightActed = [];
  war.npcExtraRaidPressure = 0;
  war.beatQueue = [];
  war.beatClock = 0;
  war.timeOfDay = 'midnight';

  enqueueWarBeat(war, {
    kind: 'npc_betrayal',
    delay: Number((gap * 0.55).toFixed(2)),
    label: 'Midnight falls; enemy factions move under cover of fog...',
    timeOfDay: 'midnight',
  });

  for (const e of war.enemies) {
    if (!e.alive) continue;
    enqueueWarBeat(war, {
      kind: 'npc_step',
      delay: Number((gap * 0.45).toFixed(2)),
      label: 'Tracking nocturnal chakra flares across the valley...',
      timeOfDay: 'midnight',
      npcId: e.id,
    });
  }

  enqueueWarBeat(war, {
    kind: 'night_threat',
    delay: Number((gap * 0.7).toFixed(2)),
    label: 'Listening to perimeter tripwires in the dark...',
    timeOfDay: 'late_night',
  });

  enqueueWarBeat(war, {
    kind: 'dawn_tick',
    delay: Number((gap * 0.75).toFixed(2)),
    label: 'Holding watch until first light...',
    timeOfDay: 'dawn',
  });
}

const TIME_ORDER: Record<WarTimeOfDay, number> = {
  dawn: 0,
  morning: 1,
  midday: 2,
  afternoon: 3,
  dusk: 4,
  midnight: 5,
  late_night: 6,
};

export function getWarBeatProgress(war: WarState): number {
  ensureWarClockDefaults(war);
  const next = war.beatQueue[0];
  if (!next || next.delay <= 0) return 0;
  return clamp(war.beatClock / next.delay, 0, 1);
}

export function getWarDayProgress(war: WarState): number {
  ensureWarClockDefaults(war);
  const seg = TIME_ORDER[war.timeOfDay] ?? 1;
  const sub = getWarBeatProgress(war);
  return clamp((seg + sub) / 7, 0, 1);
}
