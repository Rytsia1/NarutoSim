import type { GameState, SummonClanId, TraitId, VillageId } from '../sim/types';

export interface SummonClanDef {
  id: SummonClanId;
  name: string;
  originPlace: string;
  preferredVillages?: readonly VillageId[];
  traits: TraitId[];
  tierNames: [string, string, string];
  shortDesc: string;
  odEffectDesc: string;
  contractFlavor: string;
}

export const SUMMON_CLANS: readonly SummonClanDef[] = [
  {
    id: 'toad',
    name: 'Toad Clan of Mount Myoboku',
    originPlace: 'Mount Myoboku',
    preferredVillages: ['konoha', 'ame'],
    traits: ['honor', 'loyalty'],
    tierNames: ['Mount Myoboku Scout Toad', 'Iron-Shield Great Toad', 'Elder Chief Toad'],
    shortDesc: 'Boisterous warrior toads famed for crushing leaps, toad oil blasts, and steadfast loyalty.',
    odEffectDesc: 'Deals heavy crushing damage and bolsters your attack (+8 next/current buff).',
    contractFlavor: 'A sage toad unrolls a weathered crimson scroll smelling of cedar smoke and mountain rain.',
  },
  {
    id: 'snake',
    name: 'Serpent Clan of Ryuchi Cave',
    originPlace: 'Ryuchi Cave',
    preferredVillages: ['oto', 'kusa', 'kiri'],
    traits: ['ambition', 'freedom'],
    tierNames: ['Ryuchi Viper Striker', 'Giant Fang Boa', 'Abyssal Great Serpent'],
    shortDesc: 'Cunning, venomous serpents demanding strength and ruthlessness from every contractor.',
    odEffectDesc: 'Strikes with venomous fangs for heavy damage and disrupts the enemy for 2 rounds.',
    contractFlavor: 'Scales hiss across damp stone as a pale serpent offers a dark scroll inked in soot.',
  },
  {
    id: 'slug',
    name: 'Slug Clan of Shikkotsu Forest',
    originPlace: 'Shikkotsu Forest',
    preferredVillages: ['konoha', 'taki'],
    traits: ['compassion', 'loyalty'],
    tierNames: ['Shikkotsu Forest Slug', 'Healing Mantle Great Slug', 'Elder Forest Slug'],
    shortDesc: 'Gentle, resilient forest slugs capable of spitting corrosive acid and knitting mortal wounds.',
    odEffectDesc: 'Sprays acid while knitting wounds (+16 Player HP and +12 Partner HP).',
    contractFlavor: 'Mist drifts off ancient roots as a serene white slug extends a jade-bound contract scroll.',
  },
  {
    id: 'hound',
    name: 'Ninken Tracking Pack',
    originPlace: 'Mountain Tracker Kennels',
    preferredVillages: ['konoha', 'suna', 'kumo'],
    traits: ['loyalty', 'honor'],
    tierNames: ['Lead Tracker Hound', 'Ninken Strike Pack', 'Eight-Hound Alpha Pack'],
    shortDesc: 'Razor-sharp ninja hounds unmatched at scent tracking, flanking pins, and ambush detection.',
    odEffectDesc: 'Pins the enemy flank, reveals +20 Intel, and disrupts enemy footing for 1 round.',
    contractFlavor: 'Eight keen noses circle your boots before the lead hound nudges a scarred leather scroll forward.',
  },
  {
    id: 'hawk',
    name: 'Sky Hawk Sanctuary',
    originPlace: 'High Crag Peaks',
    preferredVillages: ['suna', 'kumo', 'iwa', 'taki'],
    traits: ['freedom', 'honor'],
    tierNames: ['High-Crag Scout Hawk', 'Storm-Talon Hawk', 'Elder Sky Hawk'],
    shortDesc: 'Fast aerial raptors that control the skies, break encirclements, and dive faster than arrows.',
    odEffectDesc: 'Executes a blinding aerial dive and grants high-speed evasion for this round.',
    contractFlavor: 'A wide shadow sweeps across the clearing as a mountain hawk drops a feather-tied scroll at your feet.',
  },
  {
    id: 'ape',
    name: 'Adamantine Ape Clan',
    originPlace: 'Adamantine Ape Sanctuary',
    preferredVillages: ['konoha', 'iwa'],
    traits: ['honor', 'compassion'],
    tierNames: ['Young Ape Brawler', 'Iron-Fur Vanguard Ape', 'Elder Adamantine Ape'],
    shortDesc: 'Proud martial primates whose bodies transform into unbreakable adamantine weapons.',
    odEffectDesc: 'Sweeps the enemy with an adamantine staff slam and raises a 2-round defensive ward.',
    contractFlavor: 'An iron-furred elder plants a ringed staff into the earth and tests your stance before opening the scroll.',
  },
];

export const SUMMON_CLAN_MAP: Record<SummonClanId, SummonClanDef> = Object.fromEntries(
  SUMMON_CLANS.map((c) => [c.id, c]),
) as Record<SummonClanId, SummonClanDef>;

export function getSummonPowerTier(state: GameState): { tierIndex: 0 | 1 | 2; mult: number; tierLabel: string } {
  const disc = state.disciplines.find((d) => d.id === 'summoning');
  const lvl = disc?.level ?? 1;
  // C15: Boss-tier summon requires Summoning mastery (Lv3) AND Jonin rank
  if (lvl >= 3 && state.rank === 'jonin') return { tierIndex: 2, mult: 1.75, tierLabel: 'Boss' };
  if (lvl >= 2) return { tierIndex: 1, mult: 1.35, tierLabel: 'Giant' };
  return { tierIndex: 0, mult: 1.0, tierLabel: 'Scout' };
}
