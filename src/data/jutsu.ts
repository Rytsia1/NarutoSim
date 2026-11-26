import { BLOODLINE_MAP, DISCIPLINE_MAP } from './powers';
import type { ChakraElement, GameState } from '../sim/types';

export type JutsuRank = 'D' | 'C' | 'B' | 'A' | 'S';

export type JutsuCategory =
  | 'ninjutsu'
  | 'taijutsu'
  | 'kenjutsu'
  | 'genjutsu'
  | 'fuinjutsu'
  | 'medical'
  | 'summoning';

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
  | 'clash';

export type JutsuMasteryStage = 'learning' | 'proficient' | 'mastered';

export interface JutsuEffect {
  power?: number;
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

export const JUTSU_DB: readonly JutsuDefinition[] = [
  // === ACADEMY FUNDAMENTALS (Always known) ===
  {
    id: 'basic_strike',
    name: 'Basic Strike',
    category: 'taijutsu',
    style: 'taijutsu',
    role: 'damage',
    rank: 'D',
    chakraCost: 0,
    requires: {},
    seals: [],
    description: 'Fundamental academy taijutsu exchange. Zero chakra cost and dependable under pressure.',
    effect: { power: 0.85 },
  },
  {
    id: 'bunshin',
    name: 'Bunshin no Jutsu',
    category: 'ninjutsu',
    style: 'support',
    role: 'evasion',
    rank: 'D',
    chakraCost: 5,
    requires: {},
    seals: ['Hitsuji', 'Mi', 'Tora'],
    description: 'Creates intangible academy clones to throw off enemy timing and open an escape lane.',
    effect: { cloneEvade: true },
  },
  {
    id: 'kawarimi',
    name: 'Kawarimi no Jutsu',
    category: 'ninjutsu',
    style: 'support',
    role: 'evasion',
    rank: 'D',
    chakraCost: 4,
    requires: {},
    seals: ['Hitsuji', 'I', 'Ushi', 'Inu', 'Mi'],
    description: 'Swaps places with a nearby log or debris at the moment of impact, softening pressure and priming evasion.',
    effect: { cloneEvade: true, dodgeMult: 0.7 },
  },

  // === FIRE RELEASE (Katon) ===
  {
    id: 'gokakyu',
    name: 'Katon: Gokakyu no Jutsu',
    category: 'ninjutsu',
    style: 'ninjutsu',
    role: 'damage',
    element: 'fire',
    rank: 'C',
    chakraCost: 12,
    requires: { disciplineId: 'fire_release', level: 1 },
    seals: ['Mi', 'Hitsuji', 'Saru', 'I', 'Uma', 'Tora'],
    description: 'Concentrated sphere of blazing fire that hits hard against Wind users and open guards.',
    effect: { power: 1.12 },
  },
  {
    id: 'hosenka',
    name: 'Katon: Hosenka no Jutsu',
    category: 'ninjutsu',
    style: 'ninjutsu',
    role: 'multi_hit',
    element: 'fire',
    rank: 'C',
    chakraCost: 10,
    requires: { disciplineId: 'fire_release', level: 1 },
    seals: ['Ne', 'Tora', 'Inu', 'Ushi', 'U', 'Tora'],
    description: 'Volley of scattered phoenix embers with a wide spread that cuts enemy evasion sharply.',
    effect: { power: 0.96, dodgeMult: 0.4 },
  },
  {
    id: 'ryuka',
    name: 'Katon: Ryuka no Jutsu',
    category: 'ninjutsu',
    style: 'ninjutsu',
    role: 'pierce',
    element: 'fire',
    rank: 'B',
    chakraCost: 16,
    requires: { disciplineId: 'fire_release', level: 2 },
    seals: ['Mi', 'Tatsu', 'U', 'Tora'],
    description: 'Linear dragon-flame lance guided along taut wire that punches straight through Guard Walls.',
    effect: { power: 1.24, pierceWall: true },
  },
  {
    id: 'goka_mekkyaku',
    name: 'Katon: Goka Mekkyaku',
    category: 'ninjutsu',
    style: 'ninjutsu',
    role: 'clash',
    element: 'fire',
    rank: 'S',
    chakraCost: 40,
    requires: { disciplineId: 'fire_release', level: 4 },
    seals: ['Uma', 'Tora'],
    description: 'Catastrophic wall of sea-sized flames capable of triggering and overpowering an Ultimate Jutsu Clash.',
    effect: { power: 1.8 },
  },

  // === WIND RELEASE (Futon) ===
  {
    id: 'daitoppa',
    name: 'Futon: Daitoppa',
    category: 'ninjutsu',
    style: 'ninjutsu',
    role: 'damage',
    element: 'wind',
    rank: 'C',
    chakraCost: 10,
    requires: { disciplineId: 'wind_release', level: 1 },
    seals: ['Tora', 'Ushi', 'Inu', 'U', 'Mi'],
    description: 'Compressed gale blast that tears through enemy footing and disrupts their stance for 1 round.',
    effect: { power: 1.0, debuffRounds: 1 },
  },
  {
    id: 'kaze_no_yaiba',
    name: 'Futon: Kaze no Yaiba',
    category: 'ninjutsu',
    style: 'ninjutsu',
    role: 'pierce',
    element: 'wind',
    rank: 'B',
    chakraCost: 16,
    requires: { disciplineId: 'wind_release', level: 2 },
    seals: ['Saru', 'Tori', 'Ushi', 'Tora'],
    description: 'Invisible vacuum sword that slices directly through Guard Walls without warning.',
    effect: { power: 1.24, pierceWall: true },
  },
  {
    id: 'rasenshuriken',
    name: 'Futon: Rasenshuriken',
    category: 'ninjutsu',
    style: 'ninjutsu',
    role: 'clash',
    element: 'wind',
    rank: 'S',
    chakraCost: 45,
    requires: { disciplineId: 'wind_release', level: 4 },
    seals: ['Hitsuji'],
    description: 'Microscopic wind-blade vortex of devastating clash force. Carries recoil risk on a lost exchange.',
    effect: { power: 1.85, selfRisk: 8 },
  },

  // === LIGHTNING RELEASE (Raiton) ===
  {
    id: 'jibashi',
    name: 'Raiton: Jibashi',
    category: 'ninjutsu',
    style: 'ninjutsu',
    role: 'control',
    element: 'lightning',
    rank: 'C',
    chakraCost: 10,
    requires: { disciplineId: 'lightning_release', level: 1 },
    seals: ['Ushi', 'Tora', 'Mi'],
    description: 'Electromagnetic shockwave that numbs enemy nerves and disrupts them for 1 round.',
    effect: { power: 0.98, debuffRounds: 1 },
  },
  {
    id: 'chidori',
    name: 'Raiton: Chidori',
    category: 'ninjutsu',
    style: 'ninjutsu',
    role: 'pierce',
    element: 'lightning',
    rank: 'A',
    chakraCost: 25,
    requires: { disciplineId: 'lightning_release', level: 3 },
    seals: ['Ushi', 'U', 'Saru'],
    description: 'High-speed piercing lightning thrust that cleaves Guard Walls. Tunnel-vision risk unless paired with Dojutsu, Sensory, or an enemy debuff.',
    effect: { power: 1.5, pierceWall: true, selfRisk: 10 },
  },
  {
    id: 'raikiri',
    name: 'Raiton: Raikiri',
    category: 'ninjutsu',
    style: 'ninjutsu',
    role: 'clash',
    element: 'lightning',
    rank: 'S',
    chakraCost: 38,
    requires: { disciplineId: 'lightning_release', level: 4 },
    seals: ['Ushi', 'U', 'Saru'],
    description: 'Refined S-Rank lightning blade capable of cleaving rival Ultimates in a Jutsu Clash.',
    effect: { power: 1.78, pierceWall: true },
  },

  // === EARTH RELEASE (Doton) ===
  {
    id: 'doryuheki',
    name: 'Doton: Doryuheki',
    category: 'ninjutsu',
    style: 'support',
    role: 'defense',
    element: 'earth',
    rank: 'C',
    chakraCost: 14,
    requires: { disciplineId: 'earth_release', level: 1 },
    seals: ['Tora', 'Hitsuji', 'I', 'Inu'],
    description: 'Raises a towering reinforced mud rampart reducing incoming damage by 35% for 2 rounds.',
    effect: { wardRounds: 2 },
  },
  {
    id: 'doryudan',
    name: 'Doton: Doryudan',
    category: 'ninjutsu',
    style: 'ninjutsu',
    role: 'damage',
    element: 'earth',
    rank: 'B',
    chakraCost: 16,
    requires: { disciplineId: 'earth_release', level: 2 },
    seals: ['Hitsuji', 'Uma', 'Tatsu'],
    description: 'Earthen dragon head firing pressurized stone projectiles that batter enemy fortifications.',
    effect: { power: 1.22, fortShave: 4 },
  },
  {
    id: 'yomi_numa',
    name: 'Doton: Yomi Numa',
    category: 'ninjutsu',
    style: 'ninjutsu',
    role: 'control',
    element: 'earth',
    rank: 'B',
    chakraCost: 18,
    requires: { disciplineId: 'earth_release', level: 2 },
    seals: ['I', 'Tora'],
    description: 'Turns the battleground into a bottomless mire, disrupting enemy mobility for 2 rounds.',
    effect: { power: 1.08, debuffRounds: 2 },
  },
  {
    id: 'sando_no_jutsu',
    name: 'Doton: Sando no Jutsu',
    category: 'ninjutsu',
    style: 'ninjutsu',
    role: 'clash',
    element: 'earth',
    rank: 'S',
    chakraCost: 40,
    requires: { disciplineId: 'earth_release', level: 4 },
    seals: ['I', 'Inu', 'Tori', 'Saru', 'Hitsuji'],
    description: 'Raises twin tectonic mountain walls to crush an opponent or clash against S-Rank Ultimates.',
    effect: { power: 1.76 },
  },

  // === WATER RELEASE (Suiton) ===
  {
    id: 'suijinheki',
    name: 'Suiton: Suijinheki',
    category: 'ninjutsu',
    style: 'support',
    role: 'defense',
    element: 'water',
    rank: 'C',
    chakraCost: 12,
    requires: { disciplineId: 'water_release', level: 1 },
    seals: ['Tora', 'Mi', 'Tora', 'Mi', 'Tora'],
    description: 'Pressurized circling wall of water that cuts incoming damage by 35% for 2 rounds.',
    effect: { wardRounds: 2 },
  },
  {
    id: 'suiryudan',
    name: 'Suiton: Suiryudan no Jutsu',
    category: 'ninjutsu',
    style: 'ninjutsu',
    role: 'damage',
    element: 'water',
    rank: 'B',
    chakraCost: 16,
    requires: { disciplineId: 'water_release', level: 2 },
    seals: ['Ushi', 'Saru', 'U', 'Ne', 'I', 'Tori'],
    description: 'Surging torrent shaped like a roaring water dragon that crushes Fire users.',
    effect: { power: 1.24 },
  },
  {
    id: 'daibakufu',
    name: 'Suiton: Daibakufu no Jutsu',
    category: 'ninjutsu',
    style: 'ninjutsu',
    role: 'clash',
    element: 'water',
    rank: 'S',
    chakraCost: 40,
    requires: { disciplineId: 'water_release', level: 4 },
    seals: ['Tora', 'Ushi', 'Saru', 'U', 'Hitsuji'],
    description: 'Monumental vortex deluge capable of overwhelming rival S-Rank Ultimates in a Jutsu Clash.',
    effect: { power: 1.78 },
  },

  // === STRONG FIST TAIJUTSU ===
  {
    id: 'konoha_senpu',
    name: 'Konoha Senpu',
    category: 'taijutsu',
    style: 'taijutsu',
    role: 'damage',
    rank: 'D',
    chakraCost: 0,
    requires: { disciplineId: 'strong_fist', level: 1 },
    seals: [],
    description: 'High-low spinning leaf kick chain that hits harder than basic blows at zero chakra cost.',
    effect: { power: 0.96 },
  },
  {
    id: 'omote_renge',
    name: 'Omote Renge',
    category: 'taijutsu',
    style: 'taijutsu',
    role: 'damage',
    rank: 'B',
    chakraCost: 8,
    requires: { disciplineId: 'strong_fist', level: 2 },
    seals: [],
    description: 'Explosive aerial piledriver unlocked by straining the First Gate. High burst with recoil risk on miss.',
    effect: { power: 1.32, selfRisk: 9 },
  },

  // === GENTLE FIST (Juken) ===
  {
    id: 'hakke_kusho',
    name: 'Juken: Hakke Kusho',
    category: 'taijutsu',
    style: 'taijutsu',
    role: 'control',
    rank: 'C',
    chakraCost: 8,
    requires: { disciplineId: 'gentle_fist', level: 1 },
    seals: [],
    description: 'Vacuum palm burst that strikes chakra tenketsu and drains 10 enemy CP on impact.',
    effect: { power: 1.0, cpDrain: 10 },
  },
  {
    id: 'hakke_64',
    name: 'Hakke Rokujuyon Sho',
    category: 'taijutsu',
    style: 'taijutsu',
    role: 'control',
    rank: 'B',
    chakraCost: 16,
    requires: { disciplineId: 'gentle_fist', level: 2 },
    seals: [],
    description: 'Sixty-Four Palms barrage sealing chakra pathways (-18 enemy CP) and disrupting the foe for 2 rounds.',
    effect: { power: 1.2, cpDrain: 18, debuffRounds: 2 },
  },

  // === KENJUTSU ===
  {
    id: 'iai_slash',
    name: 'Iai Slash',
    category: 'kenjutsu',
    style: 'kenjutsu',
    role: 'pierce',
    rank: 'D',
    chakraCost: 4,
    requires: { disciplineId: 'kenjutsu', level: 1 },
    seals: [],
    description: 'Rapid chakra-edged blade draw that pierces Guard Walls and shaves 4 enemy Fortification.',
    effect: { power: 0.95, pierceWall: true, fortShave: 4 },
  },
  {
    id: 'mikazuki_no_mai',
    name: 'Konoha-Ryu: Mikazuki no Mai',
    category: 'kenjutsu',
    style: 'kenjutsu',
    role: 'pierce',
    rank: 'A',
    chakraCost: 24,
    requires: { disciplineId: 'kenjutsu', level: 3 },
    seals: [],
    description: 'Three-angle shadow crescent blade assault piercing Guard Walls and shredding 6 enemy Fortification.',
    effect: { power: 1.48, pierceWall: true, fortShave: 6 },
  },

  // === GENJUTSU ===
  {
    id: 'magen_narakumi',
    name: 'Magen: Narakumi no Jutsu',
    category: 'genjutsu',
    style: 'genjutsu',
    role: 'control',
    rank: 'C',
    chakraCost: 6,
    requires: { disciplineId: 'genjutsu', level: 1 },
    seals: ['Hitsuji'],
    description: 'Conjures a harrowing vision that rattles enemy concentration and weakens them for 2 rounds.',
    effect: { power: 0.95, debuffRounds: 2 },
  },
  {
    id: 'magen_kasegui',
    name: 'Magen: Kasegui no Jutsu',
    category: 'genjutsu',
    style: 'genjutsu',
    role: 'control',
    rank: 'B',
    chakraCost: 14,
    requires: { disciplineId: 'genjutsu', level: 2 },
    seals: ['Mi', 'Tora'],
    description: 'Illusory shackles pin the opponent in place, crippling their combat output for 3 rounds.',
    effect: { power: 1.15, debuffRounds: 3 },
  },

  // === SUPPORT & SPECIALIZED ARTS ===
  {
    id: 'kage_bunshin',
    name: 'Kage Bunshin no Jutsu',
    category: 'ninjutsu',
    style: 'support',
    role: 'evasion',
    rank: 'C',
    chakraCost: 16,
    requires: { disciplineId: 'shadow_clone', level: 1 },
    seals: ['Hitsuji', 'Mi', 'Tora'],
    description: 'Solid shadow clone decoy granting evasion and +8 tactical attack momentum on the next exchange.',
    effect: { cloneEvade: true },
  },
  {
    id: 'shosen',
    name: 'Shosen Jutsu',
    category: 'medical',
    style: 'support',
    role: 'heal',
    rank: 'C',
    chakraCost: 18,
    requires: { disciplineId: 'medical', level: 1 },
    seals: ['Ushi', 'Hitsuji'],
    description: 'Mystical Palm medical chakra that restores 15 HP (+8 Partner HP) mid-battle.',
    effect: { heal: 15 },
  },
  {
    id: 'fuin_ward',
    name: 'Fuin Ward',
    category: 'fuinjutsu',
    style: 'support',
    role: 'defense',
    rank: 'C',
    chakraCost: 16,
    requires: { disciplineId: 'fuinjutsu', altDisciplineId: 'barrier', level: 1 },
    seals: ['Tora', 'Mi', 'Inu'],
    description: 'Sealing ink erupts into a shimmering defensive barrier (-35% incoming damage for 2 rounds).',
    effect: { wardRounds: 2 },
  },
  {
    id: 'kuchiyose',
    name: 'Kuchiyose no Jutsu',
    category: 'summoning',
    style: 'support',
    role: 'summon',
    rank: 'B',
    chakraCost: 24,
    requires: { disciplineId: 'summoning', level: 1, requiresContractOrDiscipline: true },
    seals: ['I', 'Inu', 'Tori', 'Saru', 'Hitsuji'],
    description: 'Summons your contracted beast ally (or frontier scout summon) for specialized battlefield support.',
    effect: { power: 1.2 },
  },
];

export const JUTSU_MAP: Record<string, JutsuDefinition> = Object.fromEntries(
  JUTSU_DB.map((j) => [j.id, j]),
);

const ELEMENTAL_CLASH_DISCS = new Set([
  'fire_release',
  'wind_release',
  'lightning_release',
  'earth_release',
  'water_release',
]);

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
  if (req.bloodlineId) {
    if (!state.bloodline || state.bloodline.id !== req.bloodlineId || state.bloodline.stage === 'latent') {
      return false;
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

/**
 * Returns every individual jutsu currently known by the player (Discovery stage),
 * plus any non-elemental Lv4 discipline Secret Art or awakened Bloodline Secret Release clash art.
 */
export function getKnownJutsu(state: GameState): JutsuDefinition[] {
  const list: JutsuDefinition[] = JUTSU_DB.filter((j) => meetsJutsuRequirements(state, j.requires));

  // Add Lv4 Secret Art clash techniques for non-elemental disciplines that define a secretArtName
  for (const d of state.disciplines) {
    if (d.level < 4 || ELEMENTAL_CLASH_DISCS.has(d.id)) continue;
    const def = DISCIPLINE_MAP[d.id];
    if (!def?.secretArtName) continue;
    // Skip kenjutsu Lv4 if mikazuki_no_mai is already known as an A-rank pierce jutsu, or add clash variant
    if (d.id === 'kenjutsu') continue;
    list.push({
      id: `secret_art_${d.id}`,
      name: def.secretArtName,
      category:
        def.branch === 'taijutsu'
          ? 'taijutsu'
          : def.branch === 'genjutsu'
            ? 'genjutsu'
            : d.id === 'medical'
              ? 'medical'
              : d.id === 'fuinjutsu'
                ? 'fuinjutsu'
                : 'ninjutsu',
      style: def.branch === 'taijutsu' ? 'taijutsu' : def.branch === 'genjutsu' ? 'genjutsu' : 'ninjutsu',
      role: 'clash',
      element: def.element ?? state.element,
      rank: 'S',
      chakraCost: 36,
      requires: { disciplineId: d.id, level: 4 },
      seals: ['Tora', 'Mi', 'Hitsuji'],
      description: `S-Rank Secret Art of ${def.name}, capable of triggering and overpowering an Ultimate Jutsu Clash.`,
      effect: { power: 1.8 },
    });
  }

  // Add Bloodline Secret Release clash jutsu when Kekkei Genkai is awakened (stage !== 'latent')
  if (state.bloodline && state.bloodline.stage !== 'latent') {
    const bDef = BLOODLINE_MAP[state.bloodline.id];
    list.push({
      id: `bloodline_secret_${state.bloodline.id}`,
      name: `${bDef?.name ?? 'Bloodline'} Secret Release`,
      category: 'ninjutsu',
      style: 'ninjutsu',
      role: 'clash',
      element: state.element,
      rank: state.bloodline.grade >= 4 ? 'S' : 'A',
      chakraCost: 30,
      requires: { bloodlineId: state.bloodline.id },
      seals: ['Mi', 'Tora'],
      description: `Awakened ${bDef?.name ?? 'Kekkei Genkai'} trump technique capable of contesting an enemy Ultimate.`,
      effect: { power: 1.55 + state.bloodline.grade * 0.06 },
    });
  }

  return list;
}

export interface LockedNextJutsu {
  jutsu: JutsuDefinition;
  requirementLabel: string;
}

/**
 * Returns the immediate next-tier locked jutsu for disciplines the player already owns,
 * so the battle menu shows clear training goals without cluttering with unrelated trees.
 */
export function getNextTierLockedJutsu(state: GameState): LockedNextJutsu[] {
  const locked: LockedNextJutsu[] = [];
  const ownedMap = new Map(state.disciplines.map((d) => [d.id, d.level]));

  for (const j of JUTSU_DB) {
    if (meetsJutsuRequirements(state, j.requires)) continue;
    const discId = j.requires.disciplineId;
    if (!discId || !j.requires.level) continue;
    const ownedLv = ownedMap.get(discId);
    if (!ownedLv) continue;
    // Show the very next unlockable tier (or Lv3/4 when at Lv2/3)
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

export function formatHandSeals(seals: readonly string[]): string {
  if (seals.length === 0) return '';
  return seals.join(' -> ');
}
