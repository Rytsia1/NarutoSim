import { CLAN_MAP } from './clans';
import { DISCIPLINE_MAP } from './powers';
import { JUTSU_CLANS } from './jutsu-clans';
import { JUTSU_CORE } from './jutsu-core';
import type {
  ActiveBattleState,
  BloodlineStage,
  ChakraElement,
  GameState,
  ModeId,
  ModeSlot,
  SelfStateId,
  SetupFlag,
  StatusId,
} from '../sim/types';

export type JutsuRank = 'D' | 'C' | 'B' | 'A' | 'S';

export type JutsuCategory =
  | 'ninjutsu'
  | 'taijutsu'
  | 'kenjutsu'
  | 'genjutsu'
  | 'fuinjutsu'
  | 'medical'
  | 'summoning'
  | 'mode';

export type JutsuStyle = 'taijutsu' | 'kenjutsu' | 'ninjutsu' | 'genjutsu' | 'support';

export type JutsuRole =
  | 'damage'
  | 'multi_hit'
  | 'pierce'
  | 'control'
  | 'defense'
  | 'heal'
  | 'evasion'
  | 'summon'
  | 'clash'
  | 'mode';

export type JutsuMasteryStage = 'learning' | 'proficient' | 'mastered';

export interface OnHitStatusEffect {
  status: StatusId;
  rounds: number;
  chance?: number;
  value?: number;
}

export interface SelfStateEffect {
  state: SelfStateId;
  rounds: number;
  value?: number;
}

export interface JutsuSetupSpec {
  requires?: readonly SetupFlag[];
  sets?: readonly SetupFlag[];
}

export interface JutsuExtraCosts {
  hp?: number;
  strain?: number;
  upkeepCp?: number;
  upkeepHp?: number;
  eyeStrain?: number;
  usesPerBattle?: number;
}

export interface ModeDefinition {
  id: ModeId;
  name: string;
  slot: ModeSlot;
  upkeepCp: number;
  upkeepHp?: number;
  powerBonus: number;
  speedBonus?: number;
  dodgeBonus?: number;
  guardPct?: number;
  counters?: readonly string[];
  requires: JutsuRequirements;
  description: string;
}

export interface JutsuEffect {
  power?: number;
  hits?: number;
  speed?: -2 | -1 | 0 | 1 | 2;
  pierce?: boolean;
  aoe?: boolean;
  onHit?: readonly OnHitStatusEffect[];
  self?: readonly SelfStateEffect[];
  setup?: JutsuSetupSpec;
  costs?: JutsuExtraCosts;
  counters?: readonly string[];
  tags?: readonly string[];
  // Legacy / convenience fields mapped cleanly in combat resolver
  dodgeMult?: number;
  pierceWall?: boolean;
  debuffRounds?: number;
  wardRounds?: number;
  heal?: number;
  cloneEvade?: boolean;
  cpDrain?: number;
  fortShave?: number;
  selfRisk?: number;
}

export interface JutsuRequirements {
  disciplineId?: string;
  altDisciplineId?: string;
  level?: 1 | 2 | 3 | 4;
  bloodlineId?: string;
  minBloodlineStage?: BloodlineStage;
  clanId?: string;
  hidenId?: string;
  mangekyoArtId?: string;
  requiresContractOrDiscipline?: boolean;
}

export interface JutsuDefinition {
  id: string;
  name: string;
  category: JutsuCategory;
  style: JutsuStyle;
  role: JutsuRole;
  element?: ChakraElement;
  rank: JutsuRank;
  chakraCost: number;
  requires: JutsuRequirements;
  seals: readonly string[];
  sealless?: boolean;
  hiden?: boolean;
  forbidden?: boolean;
  modeId?: ModeId;
  ref: string;
  description: string;
  effect: JutsuEffect;
}

export interface JutsuMasteryInfo {
  stage: JutsuMasteryStage;
  label: string;
  uses: number;
  costMult: number;
  powerMult: number;
  nextThreshold: number | null;
}

export const JUTSU_RANK_BASE_POWER: Record<JutsuRank, number> = {
  D: 0.85,
  C: 1.0,
  B: 1.2,
  A: 1.45,
  S: 1.75,
};

export const ZODIAC_SEAL_KANJI: Record<string, string> = {
  Ne: '子',
  Ushi: '丑',
  Tora: '寅',
  U: '卯',
  Tatsu: '辰',
  Mi: '巳',
  Uma: '午',
  Hitsuji: '未',
  Saru: '申',
  Tori: '酉',
  Inu: '戌',
  I: '亥',
};

/**
 * Full 10-Mode Registry (3 Dojutsu + 7 Body Modes):
 * Toggled instantaneously (free action) in BattleDialog; 1 Dojutsu + 1 Body Mode can stack simultaneously.
 */
export const MODE_DB: readonly ModeDefinition[] = [
  {
    id: 'sharingan',
    name: 'Sharingan',
    slot: 'dojutsu',
    upkeepCp: 4,
    powerBonus: 12,
    speedBonus: 1,
    dodgeBonus: 0.14,
    counters: ['genjutsu'],
    requires: { bloodlineId: 'sharingan' },
    description: 'Reads motion and seals in real time (+12 Power, +1 Speed, +14% Evade, resists sight Genjutsu).',
  },
  {
    id: 'byakugan',
    name: 'Byakugan',
    slot: 'dojutsu',
    upkeepCp: 3,
    powerBonus: 10,
    dodgeBonus: 0.12,
    counters: ['blind', 'genjutsu'],
    requires: { bloodlineId: 'byakugan' },
    description: 'Near-360-degree chakra vision (+10 Power, +12% Evade, ignores Blind/Mist, full Intel).',
  },
  {
    id: 'ketsuryugan',
    name: 'Ketsuryugan',
    slot: 'dojutsu',
    upkeepCp: 4,
    powerBonus: 11,
    dodgeBonus: 0.1,
    counters: ['genjutsu'],
    requires: { bloodlineId: 'ketsuryugan' },
    description: 'Crimson illusion vision (+11 Power, +10% Evade, strengthens Genjutsu control).',
  },
  {
    id: 'sennin',
    name: 'Sage Mode (Sennin Modo)',
    slot: 'body',
    upkeepCp: 5,
    powerBonus: 18,
    speedBonus: 1,
    guardPct: 20,
    counters: ['blind'],
    requires: { disciplineId: 'senjutsu', level: 3 },
    description: 'Natural energy harmonization (+18 Power, +1 Speed, 20% mitigation, sensory perception).',
  },
  {
    id: 'baika',
    name: 'Baika Expansion',
    slot: 'body',
    upkeepCp: 4,
    powerBonus: 12,
    guardPct: 22,
    requires: { clanId: 'akimichi', hidenId: 'hiden_akimichi_baika' },
    description: 'Calorie-to-mass Akimichi expansion (+12 Power, 22% physical mitigation).',
  },
  {
    id: 'raiton_yoroi',
    name: 'Lightning Chakra Mode',
    slot: 'body',
    upkeepCp: 6,
    powerBonus: 14,
    speedBonus: 2,
    guardPct: 18,
    requires: { clanId: 'yotsuki', hidenId: 'hiden_yotsuki_cloak' },
    description: 'Synapse-accelerating lightning cloak (+14 Power, +2 Speed, 18% armor).',
  },
  {
    id: 'suika',
    name: 'Suika Hydrification',
    slot: 'body',
    upkeepCp: 4,
    powerBonus: 8,
    dodgeBonus: 0.2,
    guardPct: 35,
    requires: { clanId: 'hozuki', hidenId: 'hiden_hozuki_liquid' },
    description: 'Liquid-body state (+20% Evade, 35% physical mitigation; vulnerable to Lightning).',
  },
  {
    id: 'makyo_hyosho',
    name: 'Makyo Hyosho Mirrors',
    slot: 'body',
    upkeepCp: 5,
    powerBonus: 12,
    speedBonus: 2,
    dodgeBonus: 0.18,
    requires: { bloodlineId: 'hyoton', minBloodlineStage: 'ctrl1' },
    description: 'Surrounding refractive ice mirrors (+12 Power, +2 Speed, +18% Evade).',
  },
  {
    id: 'suna_tate',
    name: 'Suna no Tate (Sand Shield)',
    slot: 'body',
    upkeepCp: 4,
    powerBonus: 9,
    guardPct: 32,
    requires: { clanId: 'sabaku', hidenId: 'hiden_sabaku_armor' },
    description: 'Autonomous defensive sand aura (+9 Power, 32% automatic mitigation).',
  },
  {
    id: 'shikyaku',
    name: 'Shikyaku (Four Legs Mode)',
    slot: 'body',
    upkeepCp: 3,
    powerBonus: 10,
    speedBonus: 1,
    dodgeBonus: 0.12,
    requires: { clanId: 'inuzuka', hidenId: 'hiden_inuzuka_gatsuga' },
    description: 'Feral pack-hunt stance (+10 Power, +1 Speed, +12% Evade).',
  },
];

export const MODE_MAP: Record<ModeId, ModeDefinition> = Object.fromEntries(
  MODE_DB.map((m) => [m.id, m]),
) as Record<ModeId, ModeDefinition>;

export const JUTSU_DB: readonly JutsuDefinition[] = [...JUTSU_CORE, ...JUTSU_CLANS];

export const JUTSU_MAP: Record<string, JutsuDefinition> = Object.fromEntries(
  JUTSU_DB.map((j) => [j.id, j]),
);

const BLOODLINE_STAGE_ORDER: Record<BloodlineStage, number> = {
  latent: 0,
  awakened: 1,
  ctrl1: 2,
  ctrl2: 3,
  mastered: 4,
};

export function getJutsuMasteryInfo(uses: number): JutsuMasteryInfo {
  const safeUses = Math.max(0, Math.floor(uses));
  if (safeUses >= 15) {
    return {
      stage: 'mastered',
      label: 'Mastered',
      uses: safeUses,
      costMult: 0.85,
      powerMult: 1.12,
      nextThreshold: null,
    };
  }
  if (safeUses >= 5) {
    return {
      stage: 'proficient',
      label: 'Proficient',
      uses: safeUses,
      costMult: 1.0,
      powerMult: 1.0,
      nextThreshold: 15,
    };
  }
  return {
    stage: 'learning',
    label: 'Learning',
    uses: safeUses,
    costMult: 1.15,
    powerMult: 0.9,
    nextThreshold: 5,
  };
}

export function getJutsuBasePower(jutsu: JutsuDefinition): number {
  return jutsu.effect.power ?? JUTSU_RANK_BASE_POWER[jutsu.rank];
}

export function meetsJutsuRequirements(state: GameState, req: JutsuRequirements): boolean {
  if (req.clanId && state.clanId !== req.clanId) {
    return false;
  }
  if (req.hidenId) {
    const unlocked = state.clanHeritage?.unlockedHiden ?? [];
    if (!unlocked.includes(req.hidenId)) return false;
  }
  if (req.mangekyoArtId) {
    const arts = state.bloodline?.mangekyoArts ?? [];
    if (!state.bloodline?.mangekyoAwakened || !arts.includes(req.mangekyoArtId)) {
      return false;
    }
  }
  if (req.bloodlineId) {
    if (!state.bloodline || state.bloodline.id !== req.bloodlineId || state.bloodline.stage === 'latent') {
      return false;
    }
    if (req.minBloodlineStage) {
      if (BLOODLINE_STAGE_ORDER[state.bloodline.stage] < BLOODLINE_STAGE_ORDER[req.minBloodlineStage]) {
        return false;
      }
    }
  }
  if (req.requiresContractOrDiscipline) {
    if (state.summonContract) return true;
  }
  if (req.disciplineId) {
    const needLv = req.level ?? 1;
    const matchPrimary = state.disciplines.some((d) => d.id === req.disciplineId && d.level >= needLv);
    const matchAlt = req.altDisciplineId
      ? state.disciplines.some((d) => d.id === req.altDisciplineId && d.level >= needLv)
      : false;
    if (!matchPrimary && !matchAlt) return false;
  }
  return true;
}

export function getAvailableModes(state: GameState): ModeDefinition[] {
  return MODE_DB.filter((m) => meetsJutsuRequirements(state, m.requires));
}

/**
 * Returns every individual jutsu currently known by the player from JUTSU_DB
 * plus any Sharingan-copied techniques recorded in `state.discoveredJutsu`.
 * Generic synthetic `secret_art_*` and `<Bloodline> Secret Release` fallbacks are removed.
 */
export function getKnownJutsu(state: GameState): JutsuDefinition[] {
  const seen = new Set<string>();
  const list: JutsuDefinition[] = [];

  for (const j of JUTSU_DB) {
    if (meetsJutsuRequirements(state, j.requires)) {
      seen.add(j.id);
      list.push(j);
    }
  }

  // Unlock real jutsu directly from ClanHidenArt.jutsuIds when a Clan Hiden Art is unlocked
  if (state.clanId && state.clanHeritage?.unlockedHiden.length) {
    const clan = CLAN_MAP[state.clanId];
    if (clan) {
      for (const art of clan.hidenArts) {
        if (!state.clanHeritage.unlockedHiden.includes(art.id)) continue;
        for (const jId of art.jutsuIds) {
          if (seen.has(jId)) continue;
          const def = JUTSU_MAP[jId];
          if (def) {
            seen.add(jId);
            list.push(def);
          }
        }
      }
    }
  }

  // Sharingan Copy pipeline: allow discovered non-hiden, non-bloodline techniques
  if (state.discoveredJutsu && state.discoveredJutsu.length > 0) {
    for (const id of state.discoveredJutsu) {
      if (seen.has(id)) continue;
      const def = JUTSU_MAP[id];
      if (!def) continue;
      if (def.hiden || def.forbidden || def.requires.bloodlineId || def.requires.clanId) continue;
      seen.add(id);
      list.push(def);
    }
  }

  return list;
}

export interface LockedNextJutsu {
  jutsu: JutsuDefinition;
  requirementLabel: string;
}

export function getNextTierLockedJutsu(state: GameState): LockedNextJutsu[] {
  const locked: LockedNextJutsu[] = [];
  const ownedMap = new Map(state.disciplines.map((d) => [d.id, d.level]));

  for (const j of JUTSU_DB) {
    if (meetsJutsuRequirements(state, j.requires)) continue;
    if (j.requires.clanId && state.clanId !== j.requires.clanId) continue;
    const discId = j.requires.disciplineId;
    if (!discId || !j.requires.level) continue;
    const ownedLv = ownedMap.get(discId);
    if (!ownedLv) continue;
    const nextTierAllowed = ownedLv + 1;
    if (j.requires.level === nextTierAllowed || (j.requires.level === 4 && ownedLv === 3)) {
      const def = DISCIPLINE_MAP[discId];
      locked.push({
        jutsu: j,
        requirementLabel: `Requires ${def?.name ?? discId} Lv${j.requires.level}`,
      });
    }
  }

  return locked;
}

const STATUS_SHORT_LABELS: Record<StatusId, string> = {
  burn: 'BURN',
  shock: 'SHOCK',
  bind: 'BIND',
  genjutsu: 'GENJUTSU',
  drain: 'DRAIN',
  tenketsu_seal: 'SEAL',
  bleed: 'BLEED',
  blind: 'BLIND',
  slow: 'SLOW',
  fear: 'FEAR',
  poison: 'POISON',
};

const SELF_SHORT_LABELS: Record<SelfStateId, string> = {
  guard: 'GUARD',
  wall: 'WALL',
  evade: 'EVADE',
  reflect: 'REFLECT',
  intangible: 'PHASE',
  field: 'FIELD',
};

export interface JutsuEffectChip {
  label: string;
  tone: 'neutral' | 'fast' | 'pierce' | 'aoe' | 'status' | 'def' | 'cost' | 'warn';
}

/**
 * Auto-generates compact combat clarity chips for any jutsu button in BattleDialog.
 */
export function formatJutsuChips(
  jutsu: JutsuDefinition,
  battle?: ActiveBattleState | null,
): JutsuEffectChip[] {
  const chips: JutsuEffectChip[] = [];
  const eff = jutsu.effect;

  if ((eff.speed ?? 0) >= 2) chips.push({ label: 'BLITZ', tone: 'fast' });
  else if ((eff.speed ?? 0) === 1) chips.push({ label: 'FAST', tone: 'fast' });
  else if ((eff.speed ?? 0) <= -1) chips.push({ label: 'SLOW', tone: 'warn' });

  if (eff.pierce || eff.pierceWall) chips.push({ label: 'PIERCE', tone: 'pierce' });
  if (eff.aoe) chips.push({ label: 'AOE', tone: 'aoe' });
  if (eff.hits && eff.hits > 1) chips.push({ label: `${eff.hits} HITS`, tone: 'neutral' });

  if (eff.onHit) {
    for (const st of eff.onHit) {
      chips.push({ label: `${STATUS_SHORT_LABELS[st.status]} ${st.rounds}`, tone: 'status' });
    }
  }

  if (eff.self) {
    for (const s of eff.self) {
      const valNote = s.state === 'wall' && s.value ? ` ${s.value}` : ` ${s.rounds}`;
      chips.push({ label: `${SELF_SHORT_LABELS[s.state]}${valNote}`, tone: 'def' });
    }
  }

  if (eff.heal) chips.push({ label: `HEAL ${eff.heal}`, tone: 'def' });
  if (eff.cpDrain) chips.push({ label: `-${eff.cpDrain} ENEMY CP`, tone: 'status' });
  if (eff.counters && eff.counters.length > 0) {
    chips.push({ label: `BREAKS ${eff.counters[0].toUpperCase()}`, tone: 'def' });
  }
  if (eff.costs?.hp) chips.push({ label: `HP -${eff.costs.hp}`, tone: 'cost' });
  if (eff.costs?.usesPerBattle) {
    const used = battle?.usesThisBattle?.[jutsu.id] ?? 0;
    chips.push({
      label: `${Math.max(0, eff.costs.usesPerBattle - used)}/${eff.costs.usesPerBattle} USE`,
      tone: 'warn',
    });
  }
  if (eff.setup?.requires && eff.setup.requires.length > 0) {
    for (const req of eff.setup.requires) {
      const met = Boolean(battle?.setupFlags?.[req]);
      chips.push({
        label: met ? `${req.replace('_', ' ').toUpperCase()} READY` : `NEEDS ${req.replace('_', ' ').toUpperCase()}`,
        tone: met ? 'def' : 'warn',
      });
    }
  }
  if (jutsu.effect.tags?.includes('shadow') && battle?.startedInPhase === 'night' && !battle?.setupFlags?.prev_fire) {
    chips.push({ label: 'NIGHT -20%', tone: 'warn' });
  }
  if (jutsu.forbidden) chips.push({ label: 'FORBIDDEN', tone: 'cost' });

  return chips;
}

export function formatHandSeals(seals: readonly string[]): string {
  if (seals.length === 0) return '';
  return seals.join(' -> ');
}
