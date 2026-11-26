import type { LeaningKey, NindoId } from '../sim/types';

export interface NindoDef {
  id: NindoId;
  title: string;
  vow: string;
  leaning: LeaningKey;
  preferredHints: readonly string[];
  desc: string;
}

export const NINDOS: readonly NindoDef[] = [
  {
    id: 'never_go_back',
    title: 'Never Go Back on My Word',
    vow: 'I never go back on my word. That is my Nindo, my ninja way.',
    leaning: 'will_of_fire',
    preferredHints: ['Will', 'Bonds', 'Kizuna'],
    desc: 'Aligned with Will of Fire. Unbending resolve and loyalty to comrades.',
  },
  {
    id: 'protect_bonds',
    title: 'Protect Those Precious to Me',
    vow: 'Strength only matters when it shields the people I refuse to lose.',
    leaning: 'will_of_fire',
    preferredHints: ['Bonds', 'Kizuna', 'Health'],
    desc: 'Aligned with Bonds & Kizuna. Prioritizes squadmates, family, and village.',
  },
  {
    id: 'become_kage',
    title: 'Ascend as {kage}',
    vow: 'One day every villager will look up and acknowledge my name as {kage}.',
    leaning: 'ambition',
    preferredHints: ['Chakra', 'Will', 'Combat'],
    desc: 'Aligned with Sovereign Ambition. Seeks mastery, leadership, and the Kage hat.',
  },
  {
    id: 'avenge_clan',
    title: 'Avenge What Was Taken',
    vow: 'I walk into the dark so those who ruined my past answer for it.',
    leaning: 'vengeance',
    preferredHints: ['Chakra', 'Intel', 'Combat'],
    desc: 'Aligned with Curse of Hatred. Driven by retribution and solitary strength.',
  },
  {
    id: 'results_first',
    title: 'Mission Results Above All',
    vow: 'A shinobi is a blade in the shadows: emotion breaks, efficiency endures.',
    leaning: 'ruthless',
    preferredHints: ['Intel', 'Stealth', 'Ryo'],
    desc: 'Aligned with Cold Shinobi. Ruthless pragmatism and tactical advantage.',
  },
];

export const NINDO_MAP: Record<NindoId, NindoDef> = Object.fromEntries(
  NINDOS.map((n) => [n.id, n]),
) as Record<NindoId, NindoDef>;
