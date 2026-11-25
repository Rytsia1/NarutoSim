export type LocaleCode = 'en';

export const EN_DICT: Record<string, string> = {
  'app.title': 'NarutoSim',
  'app.subtitle': 'Shinobi Life Chronicle',
  'app.tagline':
    'Born at random into the shinobi world. Survive academy drills, four-man squad bonds, recurring wars across generations, and the shadow waiting at the end.',
  'lobby.continue': 'Continue Life',
  'lobby.new_life': 'Begin a New Shinobi Life',
  'lobby.past_lives': 'Hall of Shinobi',
  'lobby.import_save': 'Import Save JSON',
  'lobby.export_save': 'Export Save JSON',
  'lobby.crisis_mode': 'World Fate Scenario',
  'lobby.village_pick': 'Starting Village',
  'lobby.sex_pick': 'Shinobi Gender',
  'lobby.name_placeholder': 'Random shinobi name',
  'rank.civilian': 'Civilian',
  'rank.academy': 'Academy Student',
  'rank.genin': 'Genin',
  'rank.chunin': 'Chunin',
  'rank.jonin': 'Jonin',
  'status.none': 'Regular',
  'status.anbu': 'ANBU',
  'status.missing_nin': 'Missing-Nin',
  'status.kage': 'Kage',
  'focus.training': 'Chakra & Jutsu',
  'focus.study': 'Tactics & Scrolls',
  'focus.social': 'Bonds & Village',
  'focus.body': 'Taijutsu & Body',
  'focus.mind': 'Will & Genjutsu',
  'focus.work': 'Missions & Ryo',
  'focus.balance': 'Balanced Growth',
  'stat.chakra': 'Chakra',
  'stat.intel': 'Intel',
  'stat.will': 'Will',
  'stat.bonds': 'Bonds',
  'stat.health': 'Health',
  'stat.ryo': 'Ryo',
  'leaning.vengeance': 'Curse of Hatred',
  'leaning.will_of_fire': 'Will of Fire',
  'leaning.ruthless': 'Cold Shinobi',
  'leaning.forbidden': 'Forbidden Arts',
  'leaning.ambition': 'Sovereign Ambition',
  'crisis.none': 'Normal Shinobi Era',
  'crisis.calamity': 'Tailed-Beast Calamity',
  'crisis.mastermind': 'Shadow Mastermind',
};

export function t(key: string, vars?: Record<string, string | number>): string {
  const base = EN_DICT[key] ?? key;
  if (!vars) return base;
  return base.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? `{${k}}`));
}

/**
 * Orphan narrative rewrite filter (inspired by GDD Ch. 02 ORPH_FIX):
 * replaces parent references with caretakers/instructors for war orphans.
 */
const ORPHAN_REPLACEMENTS: readonly [RegExp, string][] = [
  [/\byour parents\b/gi, 'the orphanage elders'],
  [/\byour household\b/gi, 'the orphanage elders'],
  [/\byour father\b/gi, 'the senior caretaker'],
  [/\byour mother\b/gi, 'the matron'],
  [/\bparents'\b/gi, "caretakers'"],
  [/\bfamily home\b/gi, 'orphanage hall'],
];

export function rewriteOrphanText(text: string, isOrphan: boolean): string {
  if (!isOrphan) return text;
  let result = text;
  for (const [pattern, replacement] of ORPHAN_REPLACEMENTS) {
    result = result.replace(pattern, replacement);
  }
  return result;
}
