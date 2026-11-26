import type { GameState, MetaState } from '../sim/types';

export type AchievementCategory =
  | 'path'
  | 'kizuna'
  | 'war'
  | 'powers'
  | 'crises'
  | 'meta';

export interface AchievementDef {
  id: string;
  category: AchievementCategory;
  title: string;
  desc: string;
  hidden?: boolean;
  check: (state: GameState, meta: MetaState) => boolean;
}

export const ACHIEVEMENT_CATEGORY_LABELS: Record<AchievementCategory, string> = {
  path: 'Shinobi Path',
  kizuna: 'Squad & Kizuna',
  war: 'War & Combat',
  powers: 'Jutsu & Bloodlines',
  crises: 'Crises & Conviction',
  meta: 'Hall of Shinobi',
};

export const ACHIEVEMENTS: readonly AchievementDef[] = [
  // === SHINOBI PATH (8) ===
  {
    id: 'ach_academy',
    category: 'path',
    title: 'First Forehead Protector',
    desc: 'Graduate from the Shinobi Academy and become a Genin.',
    check: (s) => s.peakRank === 'genin' || s.peakRank === 'chunin' || s.peakRank === 'jonin',
  },
  {
    id: 'ach_early_grad',
    category: 'path',
    title: 'Academy Prodigy',
    desc: 'Graduate to Genin before turning 12 years old.',
    check: (s) => s.geninSinceAge !== null && s.geninSinceAge < 12,
  },
  {
    id: 'ach_chunin',
    category: 'path',
    title: 'Green Flak Jacket',
    desc: 'Earn promotion to Chunin rank.',
    check: (s) => s.peakRank === 'chunin' || s.peakRank === 'jonin',
  },
  {
    id: 'ach_jonin',
    category: 'path',
    title: 'Village Elite',
    desc: 'Pass the Jonin Promotion Board and achieve Jonin rank.',
    check: (s) => s.peakRank === 'jonin',
  },
  {
    id: 'ach_anbu',
    category: 'path',
    title: 'Face Behind Porcelain',
    desc: 'Join the village ANBU shadow division.',
    check: (s) => s.specialStatus === 'anbu',
  },
  {
    id: 'ach_missing_nin',
    category: 'path',
    title: 'Slashed Emblem',
    desc: 'Abandon your village and enter the Bingo Book as a Missing-Nin.',
    check: (s) => s.specialStatus === 'missing_nin',
  },
  {
    id: 'ach_kage',
    category: 'path',
    title: 'Shadow of the Village',
    desc: 'Ascend as Hokage, Kazekage, or village leader through crisis victory or succession.',
    check: (s) => s.specialStatus === 'kage',
  },
  {
    id: 'ach_twilight',
    category: 'path',
    title: 'Outlived the Blade',
    desc: 'Enter peaceful Twilight Retirement after surviving decades of duty.',
    check: (s) => s.phase === 'retirement' || (s.age >= 75 && s.phase === 'ended'),
  },

  // === SQUAD & KIZUNA (6) ===
  {
    id: 'ach_bell_test',
    category: 'kizuna',
    title: 'Two Bells, Three Genin',
    desc: 'Pass your Jonin Sensei\'s induction Bell Test.',
    check: (s) => Boolean(s.team?.bellTestPassed),
  },
  {
    id: 'ach_disband',
    category: 'kizuna',
    title: 'Paths Diverge',
    desc: 'Experience the disbandment of your Genin squad upon Chunin promotion.',
    check: (s) => Boolean(s.team && !s.team.active && s.team.disbandedAge !== null),
  },
  {
    id: 'ach_kizuna_max',
    category: 'kizuna',
    title: 'Unbreakable Kizuna',
    desc: 'Reach Trust 80 or higher with a member of your Genin squad.',
    check: (s) => Boolean(s.team?.members.some((m) => m.trust >= 80)),
  },
  {
    id: 'ach_romance',
    category: 'kizuna',
    title: 'Promise Under Lanterns',
    desc: 'Enter the Romance track with a former squadmate.',
    check: (s) => Boolean(s.team?.members.some((m) => m.relTrack === 'romance')),
  },
  {
    id: 'ach_loyal_intercept',
    category: 'kizuna',
    title: 'Shield of Old Comrades',
    desc: 'Be saved in wartime combat by a Kizuna Loyal Interception.',
    check: (s) =>
      Boolean(s.war?.loyalInterceptUsed) || Boolean(s.flags.had_loyal_intercept),
  },
  {
    id: 'ach_family',
    category: 'kizuna',
    title: 'Next Generation',
    desc: 'Raise at least two children in the shinobi world.',
    check: (s) => s.family.filter((f) => f.relation === 'child').length >= 2,
  },

  // === WAR & COMBAT (7) ===
  {
    id: 'ach_first_war',
    category: 'war',
    title: 'Baptism of Smoke',
    desc: 'Survive your first Great Shinobi War.',
    check: (s) => s.world.warsSurvived >= 1,
  },
  {
    id: 'ach_veteran_3',
    category: 'war',
    title: 'Veteran of Three Eras',
    desc: 'Survive three separate Great Shinobi Wars in a single lifetime.',
    check: (s) => s.world.warsSurvived >= 3,
  },
  {
    id: 'ach_field_promo',
    category: 'war',
    title: 'Promoted Under Fire',
    desc: 'Earn a Genin Field Promotion to Chunin during a war.',
    check: (s) => s.warHistory.some((w) => w.fieldPromoted),
  },
  {
    id: 'ach_shared_peace',
    category: 'war',
    title: 'Two Survivors at Dawn',
    desc: 'End a war through a Shared Armistice with your wartime ally.',
    check: (s) => s.warHistory.some((w) => w.outcome === 'shared'),
  },
  {
    id: 'ach_jutsu_clash',
    category: 'war',
    title: 'Roaring Sky Collision',
    desc: 'Trigger a Jutsu Clash by firing Ultimates on the same round.',
    check: (s) =>
      Boolean(s.flags.had_jutsu_clash) || Boolean(s.war?.facts.some((f) => f.type === 'jutsu_clash')),
  },
  {
    id: 'ach_siege_breaker',
    category: 'war',
    title: 'Siege Breaker',
    desc: 'Counter-sally to break an enemy camp siege.',
    check: (s) =>
      Boolean(s.flags.had_siege_break) || Boolean(s.war?.facts.some((f) => f.type === 'siege_broken')),
  },
  {
    id: 'ach_s_mission',
    category: 'war',
    title: 'Bingo Book Executioner',
    desc: 'Complete an S-Rank mission during peacetime.',
    check: (s) => s.missions.s >= 1,
  },

  // === JUTSU & BLOODLINES (6) ===
  {
    id: 'ach_secret_art',
    category: 'powers',
    title: 'S-Rank Kinjutsu Mastery',
    desc: 'Advance any Jutsu Discipline to Tier 4 (S-Rank Secret Art).',
    check: (s) => s.disciplines.some((d) => d.level === 4),
  },
  {
    id: 'ach_three_arts',
    category: 'powers',
    title: 'Professor of Jutsu',
    desc: 'Learn four or more distinct Jutsu Disciplines in one life.',
    check: (s) => s.disciplines.length >= 4,
  },
  {
    id: 'ach_clan_legacy',
    category: 'powers',
    title: 'Keeper of the Hiden',
    desc: 'Inherit your clan\'s Hiden technique scroll.',
    check: (s) => s.hasClanLegacy,
  },
  {
    id: 'ach_bloodline_awaken',
    category: 'powers',
    title: 'Stirring of the Blood',
    desc: 'Awaken a rare Kekkei Genkai.',
    check: (s) => Boolean(s.bloodline && s.bloodline.stage !== 'latent'),
  },
  {
    id: 'ach_bloodline_master',
    category: 'powers',
    title: 'Sovereign Bloodline',
    desc: 'Master an awakened Kekkei Genkai to its peak stage.',
    check: (s) => s.bloodline?.stage === 'mastered',
  },
  {
    id: 'ach_rinne_eye',
    category: 'powers',
    title: 'Eyes of the Six Paths',
    desc: 'Awaken the mythic Rinnegan.',
    hidden: true,
    check: (s) => Boolean(s.bloodline?.id === 'rinne_eye' && s.bloodline.stage !== 'latent'),
  },

  // === CRISES & CONVICTION (6) ===
  {
    id: 'ach_clue_hunter',
    category: 'crises',
    title: 'Reader of Shadows',
    desc: 'Uncover at least 3 Endgame Crisis Clues before the storm erupts.',
    check: (s) => s.world.crisisClues >= 3,
  },
  {
    id: 'ach_calamity_clear',
    category: 'crises',
    title: 'Seal of the Rampaging Bijuu',
    desc: 'Subdue the Bijuu Rampage Endgame Crisis.',
    check: (s, m) => m.crisisCleared.calamity >= 1 || (s.world.seededCrisis === 'calamity' && s.world.crisisStage === 3),
  },
  {
    id: 'ach_mastermind_clear',
    category: 'crises',
    title: 'Red Clouds Shattered in the Rain',
    desc: 'Defeat the Akatsuki Conspiracy Endgame Crisis.',
    check: (s, m) => m.crisisCleared.mastermind >= 1 || (s.world.seededCrisis === 'mastermind' && s.world.crisisStage === 3),
  },
  {
    id: 'ach_conviction_enter',
    category: 'crises',
    title: 'Valley of the End',
    desc: 'Trigger the hidden Extreme Conviction Route.',
    hidden: true,
    check: (s) => Boolean(s.war?.conviction) || Boolean(s.flags.entered_conviction),
  },
  {
    id: 'ach_conviction_turn',
    category: 'crises',
    title: 'Sheathed at the Brink',
    desc: 'Turn away from your extreme conviction after hearing a comrade\'s voice.',
    hidden: true,
    check: (_s, m) => m.convictionEndings.includes('conv_turned_away'),
  },
  {
    id: 'ach_conviction_duel',
    category: 'crises',
    title: 'Clash of Ideals',
    desc: 'Conclude the Final Valley Ideological Duel.',
    hidden: true,
    check: (_s, m) =>
      m.convictionEndings.includes('conv_player_won') ||
      m.convictionEndings.includes('conv_master_won') ||
      m.convictionEndings.includes('conv_bond_stopped'),
  },

  // === META / HALL OF SHINOBI (3) ===
  {
    id: 'ach_meta_lives5',
    category: 'meta',
    title: 'Generations of Leaves',
    desc: 'Complete 5 full shinobi lives.',
    check: (_s, m) => m.livesPlayed >= 5,
  },
  {
    id: 'ach_meta_codex12',
    category: 'meta',
    title: 'Master of the Bingo Book',
    desc: 'Encounter or defeat at least 12 distinct rival shinobi in the Bingo Book Codex.',
    check: (_s, m) => Object.keys(m.codexRoster).length >= 12,
  },
  {
    id: 'ach_meta_both_crises',
    category: 'meta',
    title: 'Savior of Two Timelines',
    desc: 'Clear both the Bijuu Rampage and Akatsuki Conspiracy Endgame Crises.',
    check: (_s, m) => m.crisisCleared.calamity >= 1 && m.crisisCleared.mastermind >= 1,
  },
];

export const ACHIEVEMENT_MAP: Record<string, AchievementDef> = Object.fromEntries(
  ACHIEVEMENTS.map((a) => [a.id, a]),
) as Record<string, AchievementDef>;
