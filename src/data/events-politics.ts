export interface PoliticalScenarioDef {
  id:
    | 'pol_orders_vs_nindo'
    | 'pol_anbu_watch_friend'
    | 'pol_clan_vs_kage'
    | 'pol_daimyo_corruption'
    | 'pol_shadow_coup';
  title: string;
  minRank: 'chunin' | 'jonin';
  summary: string;
}

export const POLITICAL_SCENARIOS: readonly PoliticalScenarioDef[] = [
  {
    id: 'pol_orders_vs_nindo',
    title: 'Sealed Orders Against Your Nindo',
    minRank: 'jonin',
    summary: 'Village leadership hands you a ruthless directive that collides directly with your sworn Ninja Way.',
  },
  {
    id: 'pol_anbu_watch_friend',
    title: 'ANBU Directive: Watch Your Own Comrade',
    minRank: 'chunin',
    summary: 'Shadow command orders you to place covert surveillance on a living friend or former squadmate.',
  },
  {
    id: 'pol_clan_vs_kage',
    title: 'Council Fracture: Clan Head vs Kage',
    minRank: 'jonin',
    summary: 'A powerful village clan openly defies Kage authority over autonomy, land, or bloodline oversight.',
  },
  {
    id: 'pol_daimyo_corruption',
    title: 'Daimyo Ministry Embezzlement',
    minRank: 'jonin',
    summary: 'Audit scrolls reveal corrupt ministers siphoning hospital and shinobi stipends into private syndicates.',
  },
  {
    id: 'pol_shadow_coup',
    title: 'Midnight Power Struggle in the Tower',
    minRank: 'jonin',
    summary: 'Hardliners and shadow operatives move to replace the sitting Kage during a moment of village weakness.',
  },
];

export type GovernanceActionId =
  | 'gov_audit_corruption'
  | 'gov_reconcile_clans'
  | 'gov_anbu_intel_sweep'
  | 'gov_shift_diplomacy';

export interface GovernanceActionDef {
  id: GovernanceActionId;
  label: string;
  desc: string;
  ryoCost: number;
  requiresKageOrJonin: boolean;
}

export const GOVERNANCE_ACTIONS: readonly GovernanceActionDef[] = [
  {
    id: 'gov_anbu_intel_sweep',
    label: 'ANBU / Intel Dossier Sweep',
    desc: 'Cross-reference classified scrolls to uncover a hidden Living Timeline truth (+Intel).',
    ryoCost: 4,
    requiresKageOrJonin: false,
  },
  {
    id: 'gov_audit_corruption',
    label: 'Anti-Corruption Budget Audit',
    desc: 'Cut village corruption (-12) and redirect funds to Academy & Hospital (+5 each).',
    ryoCost: 6,
    requiresKageOrJonin: true,
  },
  {
    id: 'gov_reconcile_clans',
    label: 'Convene Clan Reconciliation Council',
    desc: 'Ease strained clan tensions (+8 Clan Loyalty, +5 Stability, strengthens Clan/Dove factions).',
    ryoCost: 6,
    requiresKageOrJonin: true,
  },
  {
    id: 'gov_shift_diplomacy',
    label: 'Sponsor Peace Charter in Council',
    desc: 'Push Doves faction (+10), shift policy toward diplomacy, and cool border tension (-6).',
    ryoCost: 6,
    requiresKageOrJonin: true,
  },
];
