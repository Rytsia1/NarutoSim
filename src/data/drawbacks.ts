import type { DrawbackId } from '../sim/types';

export interface DrawbackDef {
  id: DrawbackId;
  name: string;
  bonusPoints: number;
  shortDesc: string;
  flavorTag: string;
  effectSummary: string;
}

export const DRAWBACKS: readonly DrawbackDef[] = [
  {
    id: 'illness',
    name: 'Terminal Shinobi Illness',
    bonusPoints: 4,
    flavorTag: 'Itachi / Kimimaro Arc',
    shortDesc: 'An incurable chakra-lung affliction shadows your prime. Treatments stabilize it, never erase it.',
    effectSummary: 'Periodic flare-ups drain Health and raise mortality risk; medical care buys precious years.',
  },
  {
    id: 'hunted_by_village',
    name: 'Marked by Hunter-Nin',
    bonusPoints: 4,
    flavorTag: 'Bounty & Pursuit',
    shortDesc: 'Rival village hunter cells already carry orders to neutralize you before you reach full bloom.',
    effectSummary: 'Periodic Hunter-Nin ambushes on the road and heightened bounty targeting during war.',
  },
  {
    id: 'caged_bird',
    name: 'Bound by Branch Seal',
    bonusPoints: 3,
    flavorTag: 'Clan Servitude',
    shortDesc: 'A restrictive curse seal brands your forehead, binding your fate to elder politics and branch duty.',
    effectSummary: 'Elder council decrees and political friction test your Will and Bonds across your career.',
  },
  {
    id: 'chakra_burnout',
    name: 'Volatile Chakra Pathways',
    bonusPoints: 5,
    flavorTag: 'Glass Cannon Strain',
    shortDesc: 'Your tenketsu surges violently under S-Rank output, tearing muscle fibers whenever you go all out.',
    effectSummary: 'Casting S-Rank techniques inflicts 3 recoil HP and accelerates body strain; occasional overload episodes.',
  },
];

export const DRAWBACK_MAP: Record<DrawbackId, DrawbackDef> = Object.fromEntries(
  DRAWBACKS.map((d) => [d.id, d]),
) as Record<DrawbackId, DrawbackDef>;
