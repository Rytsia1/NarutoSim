import type { RngSnapshot } from './rng';

export type LifePhase = 'life' | 'war' | 'retirement' | 'posthumous' | 'ended';

export type ShinobiRank = 'civilian' | 'academy' | 'genin' | 'chunin' | 'jonin';
export type SpecialStatus = 'none' | 'anbu' | 'missing_nin' | 'kage';

export type OriginId =
  | 'clan_heir'
  | 'clan_branch'
  | 'fallen_clan'
  | 'anbu_line'
  | 'shrine_monk'
  | 'civilian'
  | 'war_orphan';

export type VillageId =
  | 'konoha'
  | 'suna'
  | 'kiri'
  | 'kumo'
  | 'iwa'
  | 'ame'
  | 'oto'
  | 'taki'
  | 'kusa'
  | 'iron'
  | 'uzushio'
  | 'waves';

export type ChakraElement = 'fire' | 'wind' | 'lightning' | 'earth' | 'water';

export type FocusId = 'training' | 'study' | 'social' | 'body' | 'mind' | 'work' | 'balance';

export type LeaningKey = 'vengeance' | 'will_of_fire' | 'ruthless' | 'forbidden' | 'ambition';

export type TraitId = 'honor' | 'compassion' | 'loyalty' | 'ambition' | 'freedom';

export type DisciplineBranch = 'ninjutsu' | 'genjutsu' | 'taijutsu';

export type BloodlineStage = 'latent' | 'awakened' | 'ctrl1' | 'ctrl2' | 'mastered';

export type CrisisId = 'none' | 'calamity' | 'mastermind';
export type CrisisStage = 0 | 1 | 2 | 3;
export type CrisisStance = 'seal' | 'exploit' | 'flee';

export interface WarCrisisState {
  id: 'calamity' | 'mastermind';
  phase: 1 | 2 | 3;
  bossName: string;
  bossHp: number;
  bossMaxHp: number;
  bossPhase2Done: boolean;
  echoesLeft: number;
  sentinelsLeft: number;
  guardsActive: number;
  npcStances: Record<string, CrisisStance>;
  coalitionAllies: number;
  defeated: boolean;
}

export interface ConvictionState {
  leaning: LeaningKey;
  wishTitle: string;
  opponentId: string;
  opponentName: string;
  opponentRole: 'sensei' | 'teammate';
  triggerOutcome: 'victor' | 'shared';
  resolveR: number; // 0..100
  beat: 1 | 2 | 3;
  inDuel: boolean;
  opponentHp: number;
  round: number;
  endingKey: string | null;
}

export interface CustomBuildConfig {
  mode: 'points' | 'free';
  originId: OriginId;
  villageId: VillageId;
  sex: 'M' | 'F';
  name: string;
  capacity: 1 | 2 | 3 | 4 | 5;
  element: ChakraElement;
  statOffsets: Partial<Record<StatKey, number>>;
  directStats?: Partial<Record<StatKey, number>>;
  startDisciplineId?: string;
  startDisciplineLevel?: 1 | 2 | 3 | 4;
  latentBloodlineId?: string;
  startBloodlineStage?: BloodlineStage;
}

export interface MetaState {
  version: number;
  livesPlayed: number;
  codexRoster: Record<string, { state: 'seen' | 'met' | 'defeated'; encounters: number; defeats: number }>;
  codexBloodlines: Record<string, BloodlineStage>;
  codexDisciplines: Record<string, number>;
  crisisCleared: Record<'calamity' | 'mastermind', number>;
  convictionEndings: string[];
  achievements: string[];
}

export type RelTrack = 'mentorship' | 'comrades' | 'romance';

export type CombatArchetype =
  | 'vanguard'
  | 'marksman'
  | 'striker'
  | 'skirmisher'
  | 'artificer'
  | 'infiltrator'
  | 'juggernaut'
  | 'rogue_s';

export type NpcTactic = 'defensive' | 'reckless' | 'hunter' | 'cunning' | 'proud' | 'desperate';

export type SkillTag =
  | 'power'
  | 'insight'
  | 'evade'
  | 'resist'
  | 'survive'
  | 'stealth'
  | 'fort'
  | 'regen'
  | 'slayer';

export type UltimateRole = 'attack' | 'wall' | 'field' | 'buff' | 'heal' | 'debuff';
export type UltimateScope = 'single' | 'squad' | 'fortress' | 'battlefield';

export interface ShinobiPersona {
  pride: number;
  cunning: number;
  ruthless: number;
  loyal: number;
  caution: number;
}

export interface RelEdge {
  trust: number;
  affection: number;
  fear: number;
  respect: number;
  rivalry: number;
  grudge: number;
  owe: number;
  slight: number;
}

export type LongGoal = 'territory' | 'topple_apex' | 'outlast' | 'dominate' | 'coalition';
export type ShortGoal =
  | 'preserve_chakra'
  | 'secure_camp'
  | 'gather_intel'
  | 'find_ally'
  | 'hunt_weak'
  | 'strike_apex';

export type WarFactType =
  | 'ally_form'
  | 'ally_betray'
  | 'ally_help'
  | 'enemy_coop'
  | 'kill'
  | 'jutsu_clash'
  | 'squad_protect'
  | 'resolve_burst'
  | 'siege_broken'
  | 'ex_mate_clash';

export interface WarFact {
  day: number;
  type: WarFactType;
  actorId: string;
  actorName: string;
  targetId?: string;
  targetName?: string;
  detail: string;
}

export interface NarrativeArc {
  id: string;
  title: string;
  summary: string;
  tone: 'milestone' | 'bond' | 'danger' | 'crisis' | 'war';
}

export interface UltimateDef {
  name: string;
  role: UltimateRole;
  scope: UltimateScope;
  rankVal: number; // 3..6
  cost: number;
  desc: string;
}

export interface WarCompetitor {
  id: string;
  rosterId: string;
  name: string;
  epithet: string;
  villageId: VillageId;
  archetype: CombatArchetype;
  tactic: NpcTactic;
  element: ChakraElement;
  ranks: [number, number, number, number, number]; // [tai, spd, sta, chk, ins]
  skills: { name: string; tag: SkillTag; rank: number }[];
  ultimate: UltimateDef;
  motive: string;
  originHint: string;
  persona: ShinobiPersona;
  longGoal: LongGoal;
  shortGoal: ShortGoal;
  planTargetId: string | null;
  allyId: string | null;
  hp: number;
  cp: number;
  fort: number;
  alive: boolean;
  intel: number; // 0..100 player intel on this enemy
  ultimateSeen: boolean;
  skillsRevealed: boolean;
  knowPlayer: number; // 0..100 enemy intel on player
  kills: number;
  survivedOnce: boolean;
  isExTeammateRogue: boolean;
}

export interface BattleRoundSummary {
  round: number;
  playerAction: string;
  enemyAction: string;
  outcome: 'win' | 'lose' | 'draw' | 'clash_win' | 'clash_lose' | 'clash_cancel' | 'retreat' | 'support';
  playerDmgTaken: number;
  enemyDmgTaken: number;
  whyLine: string;
  narrative: string;
}

export type WarTimeOfDay =
  | 'dawn'
  | 'morning'
  | 'midday'
  | 'afternoon'
  | 'dusk'
  | 'midnight'
  | 'late_night';

export type WarBeatKind =
  | 'day_open'
  | 'day_pressure'
  | 'day_decision'
  | 'night_decision'
  | 'npc_betrayal'
  | 'npc_step'
  | 'night_threat'
  | 'dawn_tick';

export interface WarBeat {
  kind: WarBeatKind;
  delay: number;
  label: string;
  timeOfDay: WarTimeOfDay;
  npcId?: string;
}

export interface ActiveBattleState {
  enemyId: string;
  round: number;
  maxRounds: number;
  isFinal: boolean;
  isAmbush: boolean;
  isDefense: boolean;
  startedInPhase?: 'day' | 'night';
  rewardTag?: 'strategic_ridge';
  sceneLine: string;
  enemyQuip: string;
  playerWardRounds: number;
  playerBuffRounds: number;
  playerCloneEvade: boolean;
  enemyDebuffRounds: number;
  bloodlineActiveRounds: number;
  enemyWallRounds: number;
  enemyFieldRounds: number;
  weaknessExploited: boolean;
  usedDesperation: boolean;
  resolveBoostThisRound: boolean;
  rounds: BattleRoundSummary[];
}

export interface WarState {
  warNumber: number;
  isCrisisWar: boolean;
  crisisId: CrisisId;
  approach: 'front' | 'flank';
  day: number;
  maxDays: number;
  subPhase: 'day' | 'night' | 'battle' | 'final';
  secondsPerDay: number;
  beatClock: number;
  beatQueue: WarBeat[];
  timeOfDay: WarTimeOfDay;
  statusText: string;
  npcNightActed: string[];
  npcExtraRaidPressure: number;
  hp: number;
  cp: number;
  fort: number;
  workshop: number; // 0..100 for seal/trap workshop
  exposure: number; // 0..100
  resolves: number; // 3x Limit Break / Resolve tokens
  bountyActive: boolean;
  daysWithoutFight: number;
  kills: number;
  strikes: number;
  hidTonight: boolean;
  nextBattleBonus: number;
  relations: Record<string, RelEdge>;
  allyId: string | null;
  allyFormedDay: number | null;
  allyBetrayed: boolean;
  coalitionEnemyIds: string[];
  siegeCount: number;
  lastSiegeDay: number;
  huntDone: boolean;
  strategicDay: number;
  strategicClaimedBy: string | null;
  crossroadsCount: number;
  usedCrossroads: string[];
  loyalInterceptUsed: boolean;
  facts: WarFact[];
  crisis: WarCrisisState | null;
  conviction: ConvictionState | null;
  enemies: WarCompetitor[];
  activeBattle: ActiveBattleState | null;
}

export interface Stats {
  chakra: number;
  intel: number;
  will: number;
  bonds: number;
  health: number;
  ryo: number;
}

export type StatKey = keyof Stats;

export type RankLetter = 'E' | 'D' | 'C' | 'B' | 'A' | 'S';

export interface CombatProjection {
  tai: number;
  spd: number;
  sta: number;
  chk: number;
  ins: number;
  letters: {
    tai: RankLetter;
    spd: RankLetter;
    sta: RankLetter;
    chk: RankLetter;
    ins: RankLetter;
  };
  score: number;
  threatTier: 'D' | 'C' | 'B' | 'A' | 'S';
  battleChakraPool: number;
}

export interface FamilyMember {
  relation: 'father' | 'mother' | 'sibling' | 'spouse' | 'child';
  name: string;
  sex: 'M' | 'F';
  age: number;
  alive: boolean;
  capacity?: number;
  isHeirRival?: boolean;
}

export interface DisciplineProgress {
  id: string;
  level: 1 | 2 | 3 | 4;
  xp: number;
  lastLevelAge: number;
  quality: number;
  isMain: boolean;
  declinedUntilAge: number;
}

export interface BloodlineState {
  id: string;
  grade: 1 | 2 | 3 | 4 | 5;
  stage: BloodlineStage;
  lastEventAge: number;
  declined: boolean;
}

export interface KizunaMember {
  id: string;
  name: string;
  sex: 'M' | 'F';
  age: number;
  role: 'sensei' | 'teammate';
  archetype: string;
  rank: ShinobiRank;
  specialStatus: SpecialStatus;
  alive: boolean;
  specialty: string;
  traits: TraitId[];
  trust: number;
  fit: number;
  relTrack: RelTrack;
  relStage: 0 | 1 | 2 | 3;
  relPoints: number;
  fragments: number;
  promiseMade: boolean;
  powerScore: number;
  lastUpdateAge: number;
  fateNote: string;
}

export interface TeamState {
  number: number;
  active: boolean;
  formedAge: number;
  disbandedAge: number | null;
  disbandReason: 'player_chunin' | 'teammate_chunin' | 'tragedy' | null;
  bellTestPassed: boolean;
  members: KizunaMember[];
}

export interface MissionRecord {
  d: number;
  c: number;
  b: number;
  a: number;
  s: number;
}

export interface WarSummary {
  warNumber: number;
  ageAtStart: number;
  rankAtStart: ShinobiRank;
  isCrisisWar: boolean;
  crisisId: CrisisId;
  outcome: 'victor' | 'shared' | 'survived' | 'withdrew' | 'deserted' | 'dead';
  title: string;
  fieldPromoted: boolean;
  summary: string;
  narrativeArcs?: NarrativeArc[];
}

export interface WorldState {
  eraNumber: number;
  tension: number;
  omenActive: boolean;
  lastWarAge: number | null;
  warsSurvived: number;
  truePeace: boolean;
  seededCrisis: CrisisId;
  crisisStage: CrisisStage;
  crisisClues: number;
}

export interface StatDeltaChip {
  stat: StatKey | 'trust' | 'tension' | 'clues';
  label: string;
  delta: number;
}

export interface CheckResultChip {
  label: string;
  passed: boolean;
}

export interface LogEntry {
  id: string;
  age: number;
  year: number;
  tone: 'normal' | 'milestone' | 'danger' | 'bond' | 'war' | 'crisis' | 'epilogue';
  title?: string;
  text: string;
  deltas?: StatDeltaChip[];
  checks?: CheckResultChip[];
}

export interface DecisionOption {
  id: string;
  label: string;
  sublabel?: string;
  statHints?: string[];
  disabled?: boolean;
  disabledReason?: string;
  autoEligible: boolean;
}

export type DecisionKind =
  | 'focus_initial'
  | 'academy_choice'
  | 'graduation_exam'
  | 'bell_test'
  | 'chunin_exam_stage'
  | 'team_disband'
  | 'jonin_eval'
  | 'bloodline_event'
  | 'discipline_advance'
  | 'clan_legacy'
  | 'life_event'
  | 'growth_event'
  | 'team_event'
  | 'mission_event'
  | 'crisis_whisper'
  | 'war_prelude'
  | 'war_day'
  | 'war_night'
  | 'war_target'
  | 'war_battle_round'
  | 'war_pressure'
  | 'war_crossroads'
  | 'war_ally_offer'
  | 'war_ally_final'
  | 'war_crisis_raid'
  | 'war_crisis_end'
  | 'war_conviction'
  | 'war_conviction_duel'
  | 'retirement_event'
  | 'reflection';

export interface PendingDecision {
  id: string;
  kind: DecisionKind;
  eventId: string;
  title: string;
  body: string;
  manual: boolean;
  allowFreeText?: boolean;
  freeTextPlaceholder?: string;
  cancelOptionId?: string;
  cancelLabel?: string;
  meta?: Record<string, string | number | boolean>;
  options: DecisionOption[];
}

export interface EpilogueBeat {
  title: string;
  body: string;
  tone: 'epilogue' | 'bond' | 'crisis' | 'milestone';
}

export interface LifeRecord {
  id: string;
  seed: number;
  name: string;
  sex: 'M' | 'F';
  villageId: VillageId;
  villageName: string;
  originId: OriginId;
  originName: string;
  birthYear: number;
  deathYear: number;
  deathAge: number;
  causeOfDeath: string;
  peakRank: ShinobiRank;
  specialStatus: SpecialStatus;
  threatTier: 'D' | 'C' | 'B' | 'A' | 'S';
  element: ChakraElement;
  bloodlineName: string | null;
  topDisciplines: string[];
  warsSurvived: number;
  warsFought: number;
  crisisStatus: string;
  lastWords: string;
  reflections: { age: number; prompt: string; answer: string }[];
  warHistory: WarSummary[];
  teamSummary: string;
  posthumousBeats: EpilogueBeat[];
}

export interface ScenarioConfig {
  crisisOverride?: 'natural' | CrisisId;
  preferredSex?: 'M' | 'F';
  preferredVillage?: VillageId;
  customName?: string;
  customBuild?: CustomBuildConfig;
  fatedRosterId?: string;
}

export interface GameState {
  version: number;
  phase: LifePhase;
  rng: RngSnapshot;
  birthYear: number;
  age: number;
  clock: number;
  secondsPerYear: number;
  speed: 1 | 2 | 4 | 8;
  paused: boolean;
  autoPlay: boolean;

  name: string;
  sex: 'M' | 'F';
  originId: OriginId;
  villageId: VillageId;
  capacity: 1 | 2 | 3 | 4 | 5;
  element: ChakraElement;

  rank: ShinobiRank;
  peakRank: ShinobiRank;
  specialStatus: SpecialStatus;
  academyFailedCount: number;
  geninSinceAge: number | null;
  chuninAttempts: number;
  joninEvalFailedAge: number | null;

  focus: FocusId;
  stats: Stats;
  leanings: Record<LeaningKey, number>;
  leaningAnnounced: Record<LeaningKey, number>;

  disciplines: DisciplineProgress[];
  bloodline: BloodlineState | null;
  hasClanLegacy: boolean;
  legacyScar: boolean;
  bodyStrain: number;
  keepFit: boolean;
  flags: Record<string, boolean>;

  family: FamilyMember[];
  team: TeamState | null;
  missions: MissionRecord;
  world: WorldState;
  war: WarState | null;
  warHistory: WarSummary[];
  fallenRosterIds: string[];
  fatedRosterId: string | null;

  usedEvents: string[];
  usedGrowth: string[];
  usedFlavor: Record<string, { count: number; lastAge: number }>;
  usedRetirement: string[];
  reflections: { age: number; prompt: string; answer: string }[];
  lastLineAge: number;

  causeOfDeath: string | null;
  lastWords: string;
  retirementStep: number;
  posthumousBeats: EpilogueBeat[];
  posthumousIndex: number;

  pending: PendingDecision | null;
  logs: LogEntry[];
  record: LifeRecord | null;
}
