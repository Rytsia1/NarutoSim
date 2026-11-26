import type { NpcOccupation, NpcPersonality, VillageId } from '../../sim/types';
import { VILLAGE_MAP } from '../villages';

export interface OccupationDef {
  id: NpcOccupation;
  label: string;
  isShinobi: boolean;
  isCombatant: boolean;
  defaultWeight: number;
  defaultSpecialty: string;
  personalityBias: Partial<NpcPersonality>;
  roleTitles: readonly string[];
  allowedVillages?: readonly VillageId[];
  excludedVillages?: readonly VillageId[];
}

export const OCCUPATIONS: readonly OccupationDef[] = [
  {
    id: 'shinobi',
    label: 'Shinobi',
    isShinobi: true,
    isCombatant: true,
    defaultWeight: 60,
    defaultSpecialty: 'shurikenjutsu',
    personalityBias: { loyal: 8, ambitious: 6 },
    roleTitles: ['Village Shinobi', 'Frontier Operative', 'Garrison Scout'],
    excludedVillages: ['iron'],
  },
  {
    id: 'samurai',
    label: 'Samurai',
    isShinobi: false,
    isCombatant: true,
    defaultWeight: 58,
    defaultSpecialty: 'kenjutsu',
    personalityBias: { loyal: 18, cautious: 6, cruel: -10 },
    roleTitles: ['Iron Samurai', 'Peak Swordsman', 'Border Retainer'],
    allowedVillages: ['iron'],
  },
  {
    id: 'merchant',
    label: 'Merchant',
    isShinobi: false,
    isCombatant: false,
    defaultWeight: 8,
    defaultSpecialty: 'trap_craft',
    personalityBias: { ambitious: 10, cautious: 12, cruel: -6 },
    roleTitles: ['Caravan Merchant', 'Tea House Broker', 'Supply Quartermaster'],
  },
  {
    id: 'blacksmith',
    label: 'Blacksmith',
    isShinobi: false,
    isCombatant: false,
    defaultWeight: 6,
    defaultSpecialty: 'kenjutsu',
    personalityBias: { loyal: 10, cautious: 8, cruel: -8 },
    roleTitles: ['Kunai Smith', 'Blade Forger', 'Armor Artificer'],
  },
  {
    id: 'farmer',
    label: 'Farmer',
    isShinobi: false,
    isCombatant: false,
    defaultWeight: 8,
    defaultSpecialty: 'earth_release',
    personalityBias: { compassionate: 12, cautious: 10, ambitious: -10, cruel: -14 },
    roleTitles: ['Rice Grower', 'Orchard Keeper', 'Valley Farmer'],
  },
  {
    id: 'artisan',
    label: 'Artisan',
    isShinobi: false,
    isCombatant: false,
    defaultWeight: 7,
    defaultSpecialty: 'fuinjutsu',
    personalityBias: { cautious: 10, compassionate: 6, cruel: -10 },
    roleTitles: ['Scroll Maker', 'Timber Carpenter', 'Pottery Artisan'],
  },
  {
    id: 'medic',
    label: 'Civilian Medic',
    isShinobi: false,
    isCombatant: false,
    defaultWeight: 5,
    defaultSpecialty: 'medical',
    personalityBias: { compassionate: 22, cautious: 12, cruel: -18 },
    roleTitles: ['Clinic Healer', 'Herbal Apothecary', 'Ward Physician'],
  },
  {
    id: 'teacher',
    label: 'Instructor',
    isShinobi: false,
    isCombatant: false,
    defaultWeight: 4,
    defaultSpecialty: 'shurikenjutsu',
    personalityBias: { compassionate: 14, loyal: 12, cautious: 8, cruel: -10 },
    roleTitles: ['Village Tutor', 'Academy Lecturer', 'Calligraphy Instructor'],
  },
];

export const OCCUPATION_MAP: Record<NpcOccupation, OccupationDef> = Object.fromEntries(
  OCCUPATIONS.map((o) => [o.id, o]),
) as Record<NpcOccupation, OccupationDef>;

/**
 * Returns village-calibrated occupation weights (Great villages favor shinobi,
 * Land of Iron uses samurai, Land of Waves skews merchant/civilian, hospital baseline boosts medics).
 */
export function getVillageOccupationWeights(
  villageId: VillageId,
): { item: OccupationDef; weight: number }[] {
  const v = VILLAGE_MAP[villageId];
  const hospitalFactor = Math.max(0.5, v.institutions.hospitalBaseline / 60);

  const weights: { item: OccupationDef; weight: number }[] = [];
  for (const occ of OCCUPATIONS) {
    if (occ.allowedVillages && !occ.allowedVillages.includes(villageId)) continue;
    if (occ.excludedVillages && occ.excludedVillages.includes(villageId)) continue;

    let w = occ.defaultWeight;
    if (villageId === 'iron') {
      if (occ.id === 'samurai') w = 58;
      else if (occ.id === 'blacksmith') w = 14;
      else if (occ.id === 'merchant') w = 10;
    } else if (villageId === 'waves') {
      if (occ.id === 'shinobi') w = 8;
      else if (occ.id === 'merchant') w = 30;
      else if (occ.id === 'farmer') w = 22;
      else if (occ.id === 'artisan') w = 18;
      else if (occ.id === 'blacksmith') w = 12;
    } else if (v.tier === 'great') {
      if (occ.id === 'shinobi') w = 64;
    } else {
      if (occ.id === 'shinobi') w = 52;
    }

    if (occ.id === 'medic') {
      w = Math.round(w * hospitalFactor);
    }

    if (w > 0) {
      weights.push({ item: occ, weight: w });
    }
  }
  return weights;
}
