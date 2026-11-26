import type {
  ChakraElement,
  CombatArchetype,
  NpcOfficialRank,
  NpcTactic,
  SkillTag,
  ThreatClass,
  TraitId,
  UltimateDef,
  VillageId,
} from '../../sim/types';

export interface RankArc {
  geninAge: number;
  chuninAge: number;
  joninAge?: number;
  peakRank: NpcOfficialRank;
}

export interface CharacterTemplate {
  id: string;
  name: string;
  epithet: string;
  villageId: VillageId;
  clanId?: string;
  sex: 'M' | 'F';
  canon: boolean;
  archetype: CombatArchetype;
  tactic: NpcTactic;
  element: ChakraElement;
  ageOffset: readonly [number, number];
  rankArc: RankArc;
  formerShinobi?: boolean;
  threatClass: ThreatClass;
  peakRanks: readonly [number, number, number, number, number]; // [tai, spd, sta, chk, ins] on 1..6 scale
  traits: readonly TraitId[];
  skills: readonly { name: string; tag: SkillTag; rank: number }[];
  ultimate: UltimateDef;
  motive: string;
  originHint: string;
  lines: {
    meet: string;
    clash: string;
    win: string;
    fall: string;
  };
}

export interface ArchetypeProfile {
  id: string;
  archetype: CombatArchetype;
  epithet: string;
  tactic: NpcTactic;
  threatClass: ThreatClass;
  peakRanks: readonly [number, number, number, number, number];
  traits: readonly TraitId[];
  skills: readonly { name: string; tag: SkillTag; rank: number }[];
  ultimate: UltimateDef;
  motive: string;
  originHint: string;
  lines: {
    meet: string;
    clash: string;
    win: string;
    fall: string;
  };
}

/**
 * Naruto Elemental Advantage Triangle:
 * Fire > Wind > Lightning > Earth > Water > Fire
 */
export const ELEMENT_BEATS: Record<ChakraElement, ChakraElement> = {
  fire: 'wind',
  wind: 'lightning',
  lightning: 'earth',
  earth: 'water',
  water: 'fire',
};

export const ARCHETYPE_LABELS: Record<CombatArchetype, string> = {
  vanguard: 'Vanguard (Blade & Close)',
  marksman: 'Marksman (Long-Range)',
  striker: 'Striker (High-Speed Pierce)',
  skirmisher: 'Skirmisher (Mobile Scout)',
  artificer: 'Artificer (Seals & Traps)',
  infiltrator: 'Infiltrator (Silent Assassin)',
  juggernaut: 'Juggernaut (Heavy Tank)',
  rogue_s: 'S-Rank Rogue Operative',
};

/**
 * Used in odds/intel displays when an enemy's true identity has not yet been revealed (intel < 80).
 */
export const ARCHETYPE_AVG: Record<CombatArchetype, [number, number, number, number, number]> = {
  vanguard: [4.2, 3.6, 3.8, 3.2, 3.2],
  marksman: [2.8, 3.8, 2.9, 4.0, 4.2],
  striker: [3.6, 4.6, 3.0, 3.6, 3.6],
  skirmisher: [3.2, 4.3, 3.2, 3.5, 3.8],
  artificer: [2.5, 2.9, 3.1, 4.5, 4.4],
  infiltrator: [3.3, 4.4, 2.7, 3.2, 4.3],
  juggernaut: [4.7, 2.7, 4.8, 3.6, 2.6],
  rogue_s: [4.6, 4.6, 4.4, 4.8, 4.6],
};
