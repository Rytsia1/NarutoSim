import type { ChakraElement, DisciplineBranch, LeaningKey, StatKey } from '../sim/types';

export interface DisciplineDef {
  id: string;
  name: string;
  branch: DisciplineBranch;
  maxLevel: 3 | 4;
  ability: StatKey;
  element?: ChakraElement;
  gain: Partial<Record<StatKey, number>>;
  leaningBias?: LeaningKey;
  combatRole: string;
  secretArtName?: string;
}

export const DISCIPLINES: readonly DisciplineDef[] = [
  // Ninjutsu & Elemental Branch
  {
    id: 'fire_release',
    name: 'Fire Release (Katon)',
    branch: 'ninjutsu',
    maxLevel: 4,
    ability: 'chakra',
    element: 'fire',
    gain: { chakra: 2 },
    leaningBias: 'will_of_fire',
    combatRole: 'Aggressive flame barrages; beats Wind Release.',
    secretArtName: 'Great Dragon Flame Annihilation',
  },
  {
    id: 'wind_release',
    name: 'Wind Release (Futon)',
    branch: 'ninjutsu',
    maxLevel: 4,
    ability: 'chakra',
    element: 'wind',
    gain: { chakra: 2 },
    combatRole: 'Razor-edged cutting waves; beats Lightning Release.',
    secretArtName: 'Spiraling Gale Shuriken',
  },
  {
    id: 'lightning_release',
    name: 'Lightning Release (Raiton)',
    branch: 'ninjutsu',
    maxLevel: 4,
    ability: 'chakra',
    element: 'lightning',
    gain: { chakra: 1, health: 1 },
    leaningBias: 'ambition',
    combatRole: 'High-speed piercing strikes; beats Earth Release.',
    secretArtName: 'Heavenly Thunder Spear',
  },
  {
    id: 'earth_release',
    name: 'Earth Release (Doton)',
    branch: 'ninjutsu',
    maxLevel: 4,
    ability: 'health',
    element: 'earth',
    gain: { health: 2 },
    combatRole: 'Stone ramparts and terrain control; beats Water Release.',
    secretArtName: 'Mountain Crushing Earthen Dome',
  },
  {
    id: 'water_release',
    name: 'Water Release (Suiton)',
    branch: 'ninjutsu',
    maxLevel: 4,
    ability: 'chakra',
    element: 'water',
    gain: { chakra: 1, intel: 1 },
    combatRole: 'Fluid battlefield torrents; beats Fire Release.',
    secretArtName: 'Great Waterfall Dragon Vortex',
  },
  {
    id: 'shadow_clone',
    name: 'Shadow Clone Mastery',
    branch: 'ninjutsu',
    maxLevel: 3,
    ability: 'chakra',
    gain: { chakra: 1, intel: 1 },
    combatRole: 'Multi-angle feints, scouting, and accelerated training drills.',
  },
  {
    id: 'fuinjutsu',
    name: 'Fuinjutsu (Sealing Arts)',
    branch: 'ninjutsu',
    maxLevel: 4,
    ability: 'intel',
    gain: { intel: 2 },
    leaningBias: 'forbidden',
    combatRole: 'Chakra suppression, storage scrolls, and crisis sealing.',
    secretArtName: 'Eight-Trigram Grand Seal',
  },
  {
    id: 'medical',
    name: 'Medical Ninjutsu',
    branch: 'ninjutsu',
    maxLevel: 4,
    ability: 'intel',
    gain: { intel: 1, health: 1 },
    leaningBias: 'will_of_fire',
    combatRole: 'Field triage, poison extraction, and chakra scalpel strikes.',
    secretArtName: 'Hundred Healings Mitotic Seal',
  },
  {
    id: 'barrier',
    name: 'Barrier Ninjutsu (Kekkai)',
    branch: 'ninjutsu',
    maxLevel: 3,
    ability: 'will',
    gain: { will: 2 },
    combatRole: 'Perimeter wards, camp fortification, and damage mitigation.',
  },
  {
    id: 'puppetry',
    name: 'Puppetry (Kugutsu)',
    branch: 'ninjutsu',
    maxLevel: 3,
    ability: 'intel',
    gain: { intel: 1, ryo: 2 },
    combatRole: 'Mid-range mechanical decoys and concealed poison needles.',
  },
  {
    id: 'summoning',
    name: 'Summoning Contract (Kuchiyose)',
    branch: 'ninjutsu',
    maxLevel: 3,
    ability: 'bonds',
    gain: { bonds: 1, chakra: 1 },
    combatRole: 'Tactical beast summons for battlefield support and escapes.',
  },
  {
    id: 'space_time',
    name: 'Space-Time Ninjutsu',
    branch: 'ninjutsu',
    maxLevel: 4,
    ability: 'intel',
    gain: { intel: 2, chakra: 1 },
    leaningBias: 'ambition',
    combatRole: 'Instant marker teleportation and impossible counterattacks.',
    secretArtName: 'Flying Thunder Flash Array',
  },

  // Genjutsu & Stealth Branch
  {
    id: 'genjutsu',
    name: 'Illusion Arts (Genjutsu)',
    branch: 'genjutsu',
    maxLevel: 4,
    ability: 'will',
    gain: { will: 2 },
    combatRole: 'Sensory disruption, false targets, and mental traps.',
    secretArtName: 'Infinite Bringer-of-Darkness',
  },
  {
    id: 'sensory',
    name: 'Sensory Perception',
    branch: 'genjutsu',
    maxLevel: 3,
    ability: 'intel',
    gain: { intel: 2 },
    combatRole: 'Long-range chakra tracking, ambush foresight, and Crisis Clues.',
  },
  {
    id: 'silent_killing',
    name: 'Silent Killing & Stealth',
    branch: 'genjutsu',
    maxLevel: 3,
    ability: 'will',
    gain: { will: 1, health: 1 },
    leaningBias: 'ruthless',
    combatRole: 'Mist concealment, reduced exposure, and decisive ambushes.',
  },
  {
    id: 'interrogation',
    name: 'Mind & Interrogation Arts',
    branch: 'genjutsu',
    maxLevel: 3,
    ability: 'will',
    gain: { will: 1, intel: 1 },
    leaningBias: 'ruthless',
    combatRole: 'Intel extraction and psychological breakdown.',
  },
  {
    id: 'trap_craft',
    name: 'Paper Bomb & Trap Craft',
    branch: 'genjutsu',
    maxLevel: 3,
    ability: 'intel',
    gain: { intel: 1, ryo: 1 },
    combatRole: 'Camp defense, terrain ambushes, and sabotage operations.',
  },

  // Taijutsu & Bukijutsu Branch
  {
    id: 'strong_fist',
    name: 'Strong Fist Taijutsu',
    branch: 'taijutsu',
    maxLevel: 4,
    ability: 'health',
    gain: { health: 2 },
    combatRole: 'Relentless bone-breaking strikes with minimal chakra drain.',
    secretArtName: 'Eight Inner Gates Formation',
  },
  {
    id: 'gentle_fist',
    name: 'Precision Chakra Fist',
    branch: 'taijutsu',
    maxLevel: 3,
    ability: 'health',
    gain: { health: 1, chakra: 1 },
    combatRole: 'Tenketsu disruption that starves enemy chakra reserves.',
  },
  {
    id: 'kenjutsu',
    name: 'Shinobi Kenjutsu',
    branch: 'taijutsu',
    maxLevel: 4,
    ability: 'will',
    gain: { will: 1, health: 1 },
    combatRole: 'Chakra-infused blade duels and lethal draw cuts.',
    secretArtName: 'White Fang Flashing Crescent',
  },
  {
    id: 'shurikenjutsu',
    name: 'Shuriken & Wire Arts',
    branch: 'taijutsu',
    maxLevel: 3,
    ability: 'intel',
    gain: { intel: 1, health: 1 },
    combatRole: 'Ricochet control, ranged harassment, and tactical pinning.',
  },
  {
    id: 'senjutsu',
    name: 'Sage Arts (Senjutsu)',
    branch: 'taijutsu',
    maxLevel: 4,
    ability: 'will',
    gain: { will: 2, chakra: 2 },
    combatRole: 'Nature-energy empowerment multiplying every combat attribute.',
    secretArtName: 'True Sage Mode Awakening',
  },
];

export const DISCIPLINE_MAP: Record<string, DisciplineDef> = Object.fromEntries(
  DISCIPLINES.map((d) => [d.id, d]),
);

export const DISCIPLINE_TIER_NAMES: Record<1 | 2 | 3 | 4, string> = {
  1: 'D-Rank (Novice)',
  2: 'C-Rank (Adept)',
  3: 'B/A-Rank (Master)',
  4: 'S-Rank (Secret Art)',
};

export interface BloodlineDef {
  id: string;
  name: string;
  category: 'dojutsu' | 'elemental' | 'body';
  weight: number;
  gradeRange: [1 | 2 | 3 | 4 | 5, 1 | 2 | 3 | 4 | 5];
  strainCost: number;
  description: string;
  bonusSummary: string;
}

export const BLOODLINES: readonly BloodlineDef[] = [
  {
    id: 'sharingan',
    name: 'Sharingan',
    category: 'dojutsu',
    weight: 20,
    gradeRange: [2, 5],
    strainCost: 6,
    description: 'Crimson eyes that read motion, copy jutsu, and awaken catastrophic Mangekyo arts at severe cost.',
    bonusSummary: '+Insight, +Genjutsu, +Combat Read; high-grade use strains Health.',
  },
  {
    id: 'byakugan',
    name: 'Byakugan',
    category: 'dojutsu',
    weight: 22,
    gradeRange: [1, 4],
    strainCost: 3,
    description: 'Near-360-degree chakra vision capable of spotting ambushes kilometers away.',
    bonusSummary: '+Sensory Intel, +Crisis Clues, +Precision strikes.',
  },
  {
    id: 'hyoton',
    name: 'Ice Release (Hyoton)',
    category: 'elemental',
    weight: 16,
    gradeRange: [1, 3],
    strainCost: 4,
    description: 'Fusion of Wind and Water creating crystalline mirrors and sub-zero traps.',
    bonusSummary: '+Speed, +Evade, +Battlefield control.',
  },
  {
    id: 'yoton',
    name: 'Lava Release (Yoton)',
    category: 'elemental',
    weight: 14,
    gradeRange: [2, 4],
    strainCost: 5,
    description: 'Molten Earth and Fire capable of melting fortifications and armor.',
    bonusSummary: '+Heavy Ninjutsu damage, +Siege breaker.',
  },
  {
    id: 'jiton',
    name: 'Magnet Release (Jiton)',
    category: 'elemental',
    weight: 15,
    gradeRange: [2, 4],
    strainCost: 4,
    description: 'Magnetic manipulation of iron sand, gold dust, or chakra-tagged blades.',
    bonusSummary: '+Defense barrier, +Ranged versatility.',
  },
  {
    id: 'mokuton',
    name: 'Wood Release (Mokuton)',
    category: 'elemental',
    weight: 3,
    gradeRange: [3, 5],
    strainCost: 7,
    description: 'Legendary fusion of Earth and Water that births living forests and suppresses tailed-beast chakra.',
    bonusSummary: '+Massive defense/offense, +Bonus vs Calamity Crisis.',
  },
  {
    id: 'shikotsumyaku',
    name: 'Dead Bone Pulse (Shikotsumyaku)',
    category: 'body',
    weight: 9,
    gradeRange: [2, 4],
    strainCost: 6,
    description: 'Manipulation of skeletal structure into hardened lances and armor.',
    bonusSummary: '+Taijutsu, +Endurance; harsh physical toll.',
  },
  {
    id: 'uzumaki_chains',
    name: 'Adamantine Sealing Chains',
    category: 'body',
    weight: 10,
    gradeRange: [2, 4],
    strainCost: 5,
    description: 'Golden chakra chains born of ferocious vitality that bind even giant threats.',
    bonusSummary: '+Chakra Cap, +Sealing power, +Vitality.',
  },
  {
    id: 'sage_body',
    name: 'Natural Energy Vessel',
    category: 'body',
    weight: 8,
    gradeRange: [2, 4],
    strainCost: 5,
    description: 'Passive absorption of ambient nature energy granting explosive bursts at the risk of fury.',
    bonusSummary: '+Burst power, +Stamina; risks loss of control.',
  },
  {
    id: 'rinne_eye',
    name: 'Samsara Eye (Rinne-Tier)',
    category: 'dojutsu',
    weight: 0.4,
    gradeRange: [4, 5],
    strainCost: 14,
    description: 'Mythic rippled eyes rumored to wield gravity, absorption, and dominion over all five natures.',
    bonusSummary: 'Peerless combat authority; extreme Health strain per activation.',
  },
];

export const BLOODLINE_MAP: Record<string, BloodlineDef> = Object.fromEntries(
  BLOODLINES.map((b) => [b.id, b]),
);

export const BLOODLINE_GRADE_NAMES: Record<1 | 2 | 3 | 4 | 5, string> = {
  1: 'Trace',
  2: 'Distinct',
  3: 'Pure',
  4: 'Sovereign',
  5: 'Mythic',
};

export const BLOODLINE_STAGE_LABELS: Record<'latent' | 'awakened' | 'ctrl1' | 'ctrl2' | 'mastered', string> = {
  latent: 'Latent',
  awakened: 'Awakened',
  ctrl1: 'Controlled (I)',
  ctrl2: 'Refined (II)',
  mastered: 'Mastered',
};

export const ELEMENT_NAMES: Record<ChakraElement, string> = {
  fire: 'Fire',
  wind: 'Wind',
  lightning: 'Lightning',
  earth: 'Earth',
  water: 'Water',
};
