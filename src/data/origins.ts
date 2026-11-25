import type { LeaningKey, OriginId } from '../sim/types';

export interface OriginDef {
  id: OriginId;
  name: string;
  shortDesc: string;
  weight: number;
  capacityRange: [1 | 2 | 3 | 4 | 5, 1 | 2 | 3 | 4 | 5];
  ryoRange: [number, number];
  isShinobiHouse: boolean;
  isHeir: boolean;
  alwaysSibling: boolean;
  isOrphan: boolean;
  bloodlineMult: number;
  startLeaning?: { key: LeaningKey; amount: number };
  familyDisciplines: string[];
}

export const ORIGINS: readonly OriginDef[] = [
  {
    id: 'clan_heir',
    name: 'Main Branch Clan Heir',
    shortDesc: 'Firstborn of a prestigious shinobi clan with high expectations and deep chakra reserves.',
    weight: 10,
    capacityRange: [3, 5],
    ryoRange: [60, 85],
    isShinobiHouse: true,
    isHeir: true,
    alwaysSibling: false,
    isOrphan: false,
    bloodlineMult: 2.0,
    familyDisciplines: ['fire_release', 'lightning_release', 'genjutsu', 'fuinjutsu', 'gentle_fist', 'kenjutsu'],
  },
  {
    id: 'clan_branch',
    name: 'Branch House Child',
    shortDesc: 'Secondborn in a renowned clan, raised in the shadow of an older heir.',
    weight: 10,
    capacityRange: [3, 5],
    ryoRange: [50, 75],
    isShinobiHouse: true,
    isHeir: false,
    alwaysSibling: true,
    isOrphan: false,
    bloodlineMult: 1.8,
    familyDisciplines: ['wind_release', 'earth_release', 'gentle_fist', 'kenjutsu', 'sensory'],
  },
  {
    id: 'fallen_clan',
    name: 'Fallen Shinobi Clan',
    shortDesc: 'Descendant of a once-feared lineage now reduced to faded scrolls and debts.',
    weight: 18,
    capacityRange: [2, 4],
    ryoRange: [15, 38],
    isShinobiHouse: true,
    isHeir: true,
    alwaysSibling: false,
    isOrphan: false,
    bloodlineMult: 1.5,
    familyDisciplines: ['fuinjutsu', 'puppetry', 'silent_killing', 'trap_craft', 'water_release'],
  },
  {
    id: 'anbu_line',
    name: 'ANBU & Intel Household',
    shortDesc: 'Raised by masked operatives where silence, discipline, and duty outweigh comfort.',
    weight: 8,
    capacityRange: [2, 3],
    ryoRange: [35, 55],
    isShinobiHouse: true,
    isHeir: false,
    alwaysSibling: false,
    isOrphan: false,
    bloodlineMult: 1.2,
    startLeaning: { key: 'will_of_fire', amount: 1 },
    familyDisciplines: ['silent_killing', 'sensory', 'interrogation', 'kenjutsu'],
  },
  {
    id: 'shrine_monk',
    name: 'Seal-Keeper Shrine',
    shortDesc: 'Reared among mountain ninja monks guarding ancient chakra seals and rare arts.',
    weight: 6,
    capacityRange: [1, 3],
    ryoRange: [28, 50],
    isShinobiHouse: true,
    isHeir: false,
    alwaysSibling: false,
    isOrphan: false,
    bloodlineMult: 4.0,
    familyDisciplines: ['fuinjutsu', 'barrier', 'medical', 'water_release'],
  },
  {
    id: 'civilian',
    name: 'Village Civilian Home',
    shortDesc: 'An ordinary merchant or artisan family with no shinobi crest to lean on.',
    weight: 34,
    capacityRange: [1, 3],
    ryoRange: [25, 62],
    isShinobiHouse: false,
    isHeir: false,
    alwaysSibling: false,
    isOrphan: false,
    bloodlineMult: 1.0,
    familyDisciplines: [],
  },
  {
    id: 'war_orphan',
    name: 'War Orphanage',
    shortDesc: 'Left behind by an earlier border clash, growing up hungry and watchful by the river.',
    weight: 14,
    capacityRange: [1, 4],
    ryoRange: [5, 18],
    isShinobiHouse: false,
    isHeir: false,
    alwaysSibling: false,
    isOrphan: true,
    bloodlineMult: 2.0,
    startLeaning: { key: 'vengeance', amount: 1 },
    familyDisciplines: [],
  },
];

export const ORIGIN_MAP: Record<OriginId, OriginDef> = Object.fromEntries(
  ORIGINS.map((o) => [o.id, o]),
) as Record<OriginId, OriginDef>;
