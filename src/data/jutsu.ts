import type { ChakraElement, GameState } from '../sim/types';

export interface JutsuEntry {
  name: string;
  seals: readonly string[];
}

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

export const ELEMENTAL_JUTSU: Record<ChakraElement, Record<1 | 2 | 3 | 4, readonly JutsuEntry[]>> = {
  fire: {
    1: [
      { name: 'Katon: Gokakyu no Jutsu', seals: ['Mi', 'Hitsuji', 'Saru', 'I', 'Uma', 'Tora'] },
      { name: 'Katon: Hosenka no Jutsu', seals: ['Ne', 'Tora', 'Inu', 'Ushi', 'U', 'Tora'] },
    ],
    2: [
      { name: 'Katon: Ryuka no Jutsu', seals: ['Mi', 'Tatsu', 'U', 'Tora'] },
      { name: 'Katon: Haisekisho', seals: ['Mi', 'Tora', 'Inu', 'Tora'] },
    ],
    3: [
      { name: 'Katon: Goryuka no Jutsu', seals: ['Tora', 'Mi', 'Tatsu', 'Tora'] },
      { name: 'Katon: Endan', seals: ['Uma', 'Tora', 'Mi', 'Tora'] },
    ],
    4: [
      { name: 'Katon: Goka Mekkyaku', seals: ['Uma', 'Tora'] },
      { name: 'Katon: Goka Messhitsu', seals: ['Mi', 'Uma', 'Tora'] },
    ],
  },
  wind: {
    1: [
      { name: 'Futon: Toppa', seals: ['Tora', 'Ushi', 'Inu', 'Mi'] },
      { name: 'Futon: Reppusho', seals: ['Mi', 'Tora', 'Hitsuji'] },
    ],
    2: [
      { name: 'Futon: Daitoppa', seals: ['Tora', 'Ushi', 'Inu', 'U', 'Mi'] },
      { name: 'Futon: Kaze no Yaiba', seals: ['Saru', 'Tori', 'Ushi', 'Tora'] },
    ],
    3: [
      { name: 'Futon: Shinkugyoku', seals: ['Ne', 'Mi', 'Uma', 'Inu'] },
      { name: 'Futon: Atsugai', seals: ['Tora', 'Tatsu', 'Hitsuji', 'Mi'] },
    ],
    4: [
      { name: 'Futon: Rasenshuriken', seals: ['Hitsuji'] },
      { name: 'Futon: Shinku Renpa', seals: ['Ne', 'Tora', 'Inu', 'Mi'] },
    ],
  },
  lightning: {
    1: [
      { name: 'Raiton: Jibashi', seals: ['Ushi', 'Tora', 'Mi'] },
      { name: 'Raiton: Ikazuchi no Kiba', seals: ['Saru', 'Tatsu', 'Tora'] },
    ],
    2: [
      { name: 'Raiton: Raikyu', seals: ['Tora', 'Ushi', 'Saru', 'Tatsu'] },
      { name: 'Raiton: Gian', seals: ['Ushi', 'Mi', 'Tora', 'Saru'] },
    ],
    3: [
      { name: 'Raiton: Chidori', seals: ['Ushi', 'U', 'Saru'] },
      { name: 'Raiton: Kuroi Kaminari', seals: ['Inu', 'Tatsu', 'Tora'] },
    ],
    4: [
      { name: 'Raiton: Raikiri', seals: ['Ushi', 'U', 'Saru'] },
      { name: 'Raiton: Kirin', seals: ['Tatsu', 'Tora'] },
    ],
  },
  earth: {
    1: [
      { name: 'Doton: Doryuheki', seals: ['Tora', 'Hitsuji', 'I', 'Inu'] },
      { name: 'Doton: Shinju Zanshu no Jutsu', seals: ['Inu', 'Mi'] },
    ],
    2: [
      { name: 'Doton: Doryudan', seals: ['Hitsuji', 'Uma', 'Tatsu'] },
      { name: 'Doton: Yomi Numa', seals: ['I', 'Tora'] },
    ],
    3: [
      { name: 'Doton: Ganchuro no Jutsu', seals: ['Mi', 'Ushi', 'Tora', 'Hitsuji'] },
      { name: 'Doton: Kaju Gan no Jutsu', seals: ['Tora', 'Inu', 'Mi'] },
    ],
    4: [
      { name: 'Doton: Sando no Jutsu', seals: ['I', 'Inu', 'Tori', 'Saru', 'Hitsuji'] },
      { name: 'Doton: Chodo Kakaku', seals: ['Ushi', 'Hitsuji', 'Tora'] },
    ],
  },
  water: {
    1: [
      { name: 'Suiton: Teppodama', seals: ['Tora', 'Ushi', 'Tatsu'] },
      { name: 'Suiton: Mizurappa', seals: ['Tatsu', 'Tora', 'U'] },
    ],
    2: [
      { name: 'Suiton: Suiryudan no Jutsu', seals: ['Ushi', 'Saru', 'U', 'Ne', 'I', 'Tori'] },
      { name: 'Suiton: Suijinheki', seals: ['Tora', 'Mi', 'Tora', 'Mi', 'Tora'] },
    ],
    3: [
      { name: 'Suiton: Suikodan no Jutsu', seals: ['Tora', 'Ushi', 'Tatsu', 'Hitsuji', 'Tori'] },
      { name: 'Suiton: Daikodan no Jutsu', seals: ['Tora', 'Mi', 'Tatsu', 'Tori'] },
    ],
    4: [
      { name: 'Suiton: Daibakufu no Jutsu', seals: ['Tora', 'Ushi', 'Saru', 'U', 'Hitsuji'] },
      { name: 'Suiton: Suishoha', seals: ['Mi', 'Hitsuji', 'Tatsu'] },
    ],
  },
};

export const TAIJUTSU_LIST: readonly JutsuEntry[] = [
  { name: 'Konoha Senpu', seals: [] },
  { name: 'Konoha Reppu', seals: [] },
  { name: 'Shishi Rendan', seals: [] },
  { name: 'Omote Renge', seals: [] },
  { name: 'Konoha Goriki Senpu', seals: [] },
];

export const GENTLE_FIST_LIST: readonly JutsuEntry[] = [
  { name: 'Juken: Hakke Kusho', seals: [] },
  { name: 'Hakke Rokujuyon Sho', seals: [] },
  { name: 'Hakke Kaiten', seals: [] },
];

export const KENJUTSU_TIERS: Record<1 | 2 | 3 | 4, readonly JutsuEntry[]> = {
  1: [
    { name: 'Kunai Iai Slash', seals: [] },
    { name: 'Konoha-Ryu: Yanagi', seals: [] },
    { name: 'Steel Fang Parry', seals: [] },
  ],
  2: [
    { name: 'Hien: Chakra Blade Edge', seals: [] },
    { name: 'Kumo-Ryu: Uragiri', seals: [] },
    { name: 'Silver Crescent Draw', seals: [] },
  ],
  3: [
    { name: 'Kumo-Ryu: Mikazukigiri', seals: [] },
    { name: 'Konoha-Ryu: Crescent Flash', seals: [] },
    { name: 'Iai: Chakra Flash Cut', seals: [] },
  ],
  4: [
    { name: 'Konoha-Ryu: Mikazuki no Mai', seals: [] },
    { name: 'Kumo-Ryu: Flame Beheading', seals: [] },
    { name: 'Zero-Range Chakra Severance', seals: [] },
  ],
};

export const KENJUTSU_LIST: readonly JutsuEntry[] = [
  ...KENJUTSU_TIERS[1],
  ...KENJUTSU_TIERS[2],
  ...KENJUTSU_TIERS[3],
  ...KENJUTSU_TIERS[4],
];

export const GENJUTSU_LIST: readonly JutsuEntry[] = [
  { name: 'Magen: Narakumi no Jutsu', seals: ['Hitsuji'] },
  { name: 'Magen: Kasegui no Jutsu', seals: ['Mi', 'Tora'] },
  { name: 'Kori Shinchu no Jutsu', seals: ['Hitsuji', 'U', 'Mi'] },
  { name: 'Magen: Jubaku Satsu', seals: ['Mi', 'Hitsuji', 'U'] },
];

const ELEM_DISC_ID: Record<ChakraElement, string> = {
  fire: 'fire_release',
  wind: 'wind_release',
  lightning: 'lightning_release',
  earth: 'earth_release',
  water: 'water_release',
};

/**
 * Deterministically picks a canon jutsu name & zodiac hand-seal sequence
 * using roundIndex % pool.length (zero RNG consumed).
 */
export function pickPlayerJutsu(
  state: GameState,
  style: 'taijutsu' | 'kenjutsu' | 'ninjutsu' | 'genjutsu',
  roundIndex: number,
): JutsuEntry {
  const idx = Math.max(0, roundIndex);
  if (style === 'ninjutsu') {
    const elemDisc = state.disciplines.find((d) => d.id === ELEM_DISC_ID[state.element]);
    const tier = (elemDisc ? elemDisc.level : 1) as 1 | 2 | 3 | 4;
    const pool = ELEMENTAL_JUTSU[state.element][tier];
    return pool[idx % pool.length];
  }
  if (style === 'genjutsu') {
    return GENJUTSU_LIST[idx % GENJUTSU_LIST.length];
  }
  if (style === 'kenjutsu') {
    const kenDisc = state.disciplines.find((d) => d.id === 'kenjutsu');
    const tier = (kenDisc ? kenDisc.level : 1) as 1 | 2 | 3 | 4;
    const pool = KENJUTSU_TIERS[tier];
    return pool[idx % pool.length];
  }
  if (state.disciplines.some((d) => d.id === 'gentle_fist')) {
    return GENTLE_FIST_LIST[idx % GENTLE_FIST_LIST.length];
  }
  return TAIJUTSU_LIST[idx % TAIJUTSU_LIST.length];
}

export function formatHandSeals(seals: readonly string[]): string {
  if (seals.length === 0) return '';
  return seals.join(' → ');
}
