import type { RngSnapshot } from './rng';

export type LifePhase = 'life' | 'war' | 'retirement' | 'posthumous' | 'ended';

export type ShinobiRank = 'civilian' | 'academy' | 'genin' | 'chunin' | 'jonin';
export type SpecialStatus = 'none' | 'anbu' | 'missing_nin' | 'kage';
export type StatusGateTag =
  | 'active_shinobi'
  | 'not_kage'
  | 'not_missing_nin'
  | 'not_civilian'
  | 'not_retired'
  | 'sensei_alive'
  | 'teammate_alive'
  | 'in_village';
export type ChuninExamStage = 1 | 2 | 3 | 4 | 5 | 6;

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
  opponentPersonId: string;
  opponentRole: 'sensei' | 'teammate';
  triggerOutcome: 'victor' | 'shared';
  resolveR: number; // 0..100
  beat: 1 | 2 | 3;
  inDuel: boolean;
  opponentHp: number;
  round: number;
  endingKey: string | null;
}

export type DrawbackId = 'illness' | 'hunted_by_village' | 'caged_bird' | 'chakra_burnout';

export interface SandboxConfig {
  transcendentCap: boolean;
  growthMult: 1 | 2 | 5;
}

export interface JinchurikiState {
  bijuuName: string;
  ostracized: boolean;
  harmony: number; // 0..100
}

export type MangekyoArtId = 'amaterasu' | 'tsukuyomi' | 'kamui' | 'kotoamatsukami';

export interface CustomBuildConfig {
  mode: 'points' | 'free';
  originId: OriginId;
  villageId: VillageId;
  clanId?: string;
  sex: 'M' | 'F';
  name: string;
  epithet?: string;
  capacity: 1 | 2 | 3 | 4 | 5;
  element: ChakraElement;
  secondaryElements?: ChakraElement[];
  statOffsets: Partial<Record<StatKey, number>>;
  directStats?: Partial<Record<StatKey, number>>;
  startDisciplineId?: string;
  startDisciplineLevel?: 1 | 2 | 3 | 4;
  startDisciplines?: { id: string; level: 1 | 2 | 3 | 4 }[];
  latentBloodlineId?: string;
  startBloodlineStage?: BloodlineStage;
  mangekyoAwakened?: boolean;
  mangekyoArts?: MangekyoArtId[];
  eternalMangekyo?: boolean;
  summonClanId?: SummonClanId;
  jinchurikiBijuu?: string;
  jinchurikiOstracized?: boolean;
  signatureJutsuIds?: string[];
  transcendentCap?: boolean;
  growthMult?: 1 | 2 | 5;
  drawbacks?: DrawbackId[];
}

export type SummonClanId = 'toad' | 'snake' | 'slug' | 'hound' | 'hawk' | 'ape';

export type PartnerTrustTier = 'distrust' | 'steady' | 'trusted' | 'bond';

export type NpcOccupation =
  | 'shinobi'
  | 'merchant'
  | 'blacksmith'
  | 'farmer'
  | 'artisan'
  | 'medic'
  | 'teacher'
  | 'samurai';

export interface WarPartnerState {
  id: string;
  personId: string;
  source: 'permanent' | 'squad' | 'village_roster' | 'village_gen';
  name: string;
  epithet: string;
  villageId: VillageId;
  element: ChakraElement;
  archetype: CombatArchetype;
  hp: number;
  maxHp: number;
  trust: number;
  fit: number;
  traits: TraitId[];
  skills: { name: string; tag: SkillTag; rank: number }[];
  relTrack: RelTrack;
  relStage: 0 | 1 | 2 | 3;
  relPoints: number;
  fragments: number;
  motive: string;
  originHint: string;
  active: boolean;
  defected: boolean;
  died: boolean;
  downHandled: boolean;
  freeSurpassUsed: boolean;
}

export interface PermanentPartnerRecord {
  personId: string;
  epithet: string;
  trust: number;
  relTrack: RelTrack;
  relStage: 0 | 1 | 2 | 3;
  relPoints: number;
  fragments: number;
  stayedAge: number;
}

export interface SummonContractState {
  clanId: SummonClanId;
  contractedAge: number;
  fitScore: number;
  summonUses: number;
}

export interface CodexStatEntry {
  encountered: number;
  defeated: number;
}

export interface CodexStats {
  byArchetype: Partial<Record<CombatArchetype, CodexStatEntry>>;
  byClan: Record<string, CodexStatEntry>;
  byVillage: Partial<Record<VillageId, CodexStatEntry>>;
  byBloodline: Record<string, CodexStatEntry>;
  totalEncountered: number;
  totalDefeated: number;
}

export interface MetaState {
  version: number;
  livesPlayed: number;
  codexStats: CodexStats;
  codexBloodlines: Record<string, BloodlineStage>;
  codexDisciplines: Record<string, number>;
  codexSummons?: SummonClanId[];
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
  | 'partner_intercept'
  | 'partner_defect'
  | 'partner_down'
  | 'resolve_burst'
  | 'siege_broken'
  | 'ex_mate_clash';

export interface WarFact {
  day: number;
  type: WarFactType;
  actorId: string; // canonical personId or 'player'
  actorName?: string;
  targetId?: string; // canonical personId or 'player'
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

export type NpcOfficialRank = 'genin' | 'chunin' | 'tokubetsu_jonin' | 'jonin' | 'kage';
export type ThreatClass = 'D' | 'C' | 'B' | 'A' | 'S';
export type CombatTier =
  | 'academy'
  | 'genin'
  | 'chunin'
  | 'jonin'
  | 'elite_jonin'
  | 'kage_class'
  | 'legendary';
export type PowerGapLabel =
  | 'Overwhelming'
  | 'Major disadvantage'
  | 'Disadvantage'
  | 'Competitive'
  | 'Advantage'
  | 'Dominant';

export interface WarCompetitor {
  id: string;
  personId: string;
  name: string;
  epithet: string;
  villageId: VillageId;
  archetype: CombatArchetype;
  tactic: NpcTactic;
  element: ChakraElement;
  officialRank: NpcOfficialRank;
  formerShinobi?: boolean;
  threatClass: ThreatClass;
  ranks: [number, number, number, number, number]; // [tai, spd, sta, chk, ins]
  weakness?: string;
  skills: { name: string; tag: SkillTag; rank: number }[];
  ultimate: UltimateDef;
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
  frontId?: string;
}

export type NindoId =
  | 'never_go_back'
  | 'protect_bonds'
  | 'become_kage'
  | 'avenge_clan'
  | 'results_first';

export interface ShinobiMemory {
  age: number;
  tag: 'bell_test' | 'graduation' | 'nindo' | 'loss' | 'rival' | 'promotion' | 'war' | 'bond';
  text: string;
}

export interface BattleRoundSummary {
  round: number;
  playerAction: string;
  jutsuName?: string;
  seals?: string[];
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

export type StatusId =
  | 'burn'
  | 'shock'
  | 'bind'
  | 'genjutsu'
  | 'drain'
  | 'tenketsu_seal'
  | 'bleed'
  | 'blind'
  | 'slow'
  | 'fear'
  | 'poison';

export type SelfStateId =
  | 'guard'
  | 'wall'
  | 'evade'
  | 'reflect'
  | 'intangible'
  | 'field';

export type ModeId =
  | 'sharingan'
  | 'byakugan'
  | 'baika'
  | 'raiton_yoroi'
  | 'suika'
  | 'makyo_hyosho'
  | 'sennin'
  | 'ketsuryugan'
  | 'suna_tate'
  | 'shikyaku'
  | 'bijuu_cloak';

export type ModeSlot = 'dojutsu' | 'body';

export type SetupFlag =
  | 'prev_fire'
  | 'prev_water'
  | 'mist'
  | 'mark'
  | 'oil'
  | 'shadows_present'
  | 'bone_armor'
  | 'puppet_out'
  | 'insects_planted'
  | 'sand_field';

export interface StatusInstance {
  rounds: number;
  value?: number;
  sourcePower?: number;
  sourceName?: string;
}

export interface SelfStateInstance {
  rounds: number;
  value?: number;
}

export interface ActiveBattleState {
  enemyId: string;
  round: number;
  maxRounds: number;
  isFinal: boolean;
  isAmbush: boolean;
  isDefense: boolean;
  startedInPhase?: 'day' | 'night';
  rewardTag?: 'strategic_ridge' | 'solo_vanguard_gauntlet' | 'solo_vanguard_barrage';
  vanguardQueueEnemyId?: string;
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
  usedNindoResolve?: boolean;
  partnerIntercepted?: boolean;
  resolveBoostThisRound: boolean;
  // Effect Model v2 structured state maps
  enemyStatus?: Partial<Record<StatusId, StatusInstance>>;
  playerStatus?: Partial<Record<StatusId, StatusInstance>>;
  playerSelf?: Partial<Record<SelfStateId, SelfStateInstance>>;
  enemySelf?: Partial<Record<SelfStateId, SelfStateInstance>>;
  playerDojutsuMode?: ModeId | null;
  playerBodyMode?: ModeId | null;
  modeCooldowns?: Partial<Record<ModeId, number>>;
  setupFlags?: Partial<Record<SetupFlag, number>>;
  usesThisBattle?: Record<string, number>;
  prevPlayerElement?: ChakraElement;
  gate8Used?: boolean;
  killingIntentApplied?: boolean;
  rounds: BattleRoundSummary[];
}

export type WarPlayerRole =
  | 'genin_support'
  | 'chunin_squad'
  | 'jonin_commander'
  | 'kage_hq'
  | 'mercenary';

export interface WarFront {
  id: string;
  territoryId: string;
  name: string;
  control: number; // 0..100 (50 = contested)
  allyStrength: number;
  enemyStrength: number;
  dominantTurnsAlly: number;
  dominantTurnsEnemy: number;
}

export interface WarAlly {
  id: string;
  personId: string;
  name: string;
  epithet: string;
  villageId: VillageId;
  role: string;
  frontId: string;
  powerScore: number;
  hp: number;
  alive: boolean;
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
  partner: WarPartnerState | null;
  usedPartnerScenes: string[];
  finaleWishDone?: boolean;
  resultsApplied?: boolean;
  // Tier F: Full Front War fields
  alliedVillages?: VillageId[];
  enemyVillages?: VillageId[];
  fronts?: WarFront[];
  allies?: WarAlly[];
  activeFrontId?: string;
  playerRole?: WarPlayerRole;
  allyExhaustion?: number;
  enemyExhaustion?: number;
  armisticeOutcome?: 'victory' | 'draw' | 'defeat';
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
  personId: string;
  relation: 'father' | 'mother' | 'sibling' | 'spouse' | 'child';
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
  eyeStrain?: number;
  mangekyoAwakened?: boolean;
  mangekyoArts?: string[];
  eternalMangekyo?: boolean;
  blinded?: boolean;
  transplanted?: boolean;
}

export interface KizunaMember {
  personId: string;
  role: 'sensei' | 'teammate';
  archetype: string;
  trust: number;
  fit: number;
  relTrack: RelTrack;
  relStage: 0 | 1 | 2 | 3;
  relPoints: number;
  fragments: number;
  promiseMade: boolean;
  lastUpdateAge: number;
  fateNote: string;
  /** Relationship Sim 2.0 vectors (role-local view synced with WorldNpc.relationships.player) */
  rel6?: RelVector6;
  playerFeelings?: RelVector6;
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
  peaceAccordUntilAge?: number;
  lastSummitAge?: number;
  vengeanceTargetId?: string | null;
  seededCrisis: CrisisId;
  bijuuName?: string;
  crisisStage: CrisisStage;
  crisisClues: number;
}

// ============================================================
// AUTONOMOUS 3-LAYER WORLD SIMULATION TYPES
// ============================================================

export type DiplomacyStatus = 'allied' | 'treaty' | 'neutral' | 'strained' | 'hostile' | 'at_war';
export type VillagePolicy = 'diplomatic' | 'defensive' | 'expansionist' | 'isolationist' | 'shadow_ops';
export type AcademyDoctrine = 'teamwork' | 'bloody_mist' | 'thunder_drills' | 'austerity_craft' | 'fortress_stone';
export type DaimyoStance = 'generous' | 'balanced' | 'austerity' | 'hawkish';
export type ShadowAgenda = 'stabilize' | 'sabotage_rival' | 'coup_watch' | 'bloodline_hunt';
export type ClanStatus = 'thriving' | 'strained' | 'declining' | 'exiled';
export type EconomyTrend = 'boom' | 'stable' | 'slump' | 'crisis';
export type DisasterKind = 'drought' | 'plague' | 'famine' | 'quake' | 'storm' | 'syndicate_raid';

export interface DiplomacyEdge {
  a: VillageId;
  b: VillageId;
  score: number; // -100..100
  status: DiplomacyStatus;
  lastChangedYear: number;
}

export interface WorldTerritory {
  id: string;
  name: string;
  controller: VillageId;
  contestedBy: VillageId | null;
  wealth: number; // 1..10
  strategicValue: number; // 1..10
  flashpoint: number; // 0..100
}

export interface WorldDisaster {
  id: string;
  kind: DisasterKind;
  title: string;
  villageId: VillageId;
  severity: number; // 1..3
  yearsLeft: number;
}

export interface VillageClanState {
  clanId: string;
  power: number; // 0..100
  loyalty: number; // 0..100
  reputation: number; // 0..100
  status: ClanStatus;
  headNpcId: string | null;
}

export interface VillagePoliticsState {
  corruption: number; // 0..100
  factions: {
    hawks: number; // 0..100
    doves: number; // 0..100
    elders: number; // 0..100
    clans: number; // 0..100
  };
  activeDirectives: string[];
}

export interface VillagePopulationSim {
  civilians: number;
  academyCadets: number;
  geninCorps: number;
  chuninCorps: number;
  joninCorps: number;
  veterans: number;
  sicknessRate: number; // 0..100
  warCasualtiesTotal: number;
  orphansCount: number;
}

export interface VillageSimState {
  villageId: VillageId;
  kageNpcId: string | null; // WorldNpc id or 'player'
  daimyo: {
    funding: number; // 0..100
    favor: number; // 0..100
    stance: DaimyoStance;
  };
  anbu: {
    strength: number; // 0..100
    readiness: number; // 0..100
    activeOp: string | null;
  };
  shadowOrg: {
    name: string;
    influence: number; // 0..100
    secrecy: number; // 0..100
    agenda: ShadowAgenda;
  };
  academy: {
    quality: number; // 0..100
    doctrine: AcademyDoctrine;
    bloodyMistActive: boolean;
  };
  hospital: {
    capacity: number; // 0..100
    readiness: number; // 0..100
  };
  clans: VillageClanState[];
  politics?: VillagePoliticsState;
  population?: VillagePopulationSim;
  treasury: number; // 0..100
  military: number; // 0..100
  morale: number; // 0..100
  stability: number; // 0..100
  policy: VillagePolicy;
}

export interface NpcPersonality {
  loyal: number; // 0..100
  ambitious: number; // 0..100
  cautious: number; // 0..100
  cruel: number; // 0..100
  compassionate: number; // 0..100
}

export type NpcMotivation =
  | 'protect_village'
  | 'attain_kage'
  | 'restore_clan'
  | 'seek_power'
  | 'avenge_loss'
  | 'peace_reformer'
  | 'shadow_control'
  | 'wanderer_freedom';

export type NpcSchedule =
  | 'academy_drills'
  | 'training_ground'
  | 'border_patrol'
  | 'anbu_covert'
  | 'hospital_ward'
  | 'clan_council'
  | 'diplomatic_envoy'
  | 'kage_office'
  | 'forbidden_research'
  | 'wandering_exile'
  | 'work_trade'
  | 'home';

export type NpcRelationKind =
  | 'family'
  | 'spouse'
  | 'mentor'
  | 'student'
  | 'friend'
  | 'rival'
  | 'enemy'
  | 'ally';

export interface RelVector6 {
  trust: number; // 0..100
  affection: number; // 0..100
  respect: number; // 0..100
  fear: number; // 0..100
  rivalry: number; // 0..100
  resentment: number; // 0..100
}

export interface NpcRelationship {
  targetId: string; // WorldNpc id or 'player'
  targetName: string;
  kind: NpcRelationKind;
  affinity: number; // -100..100 (legacy compatible)
  trust: number; // 0..100 (legacy compatible)
  grudge: number; // 0..100 (legacy compatible)
  /** Relationship Sim 2.0: 6-axis how THIS NPC feels about target */
  vector?: RelVector6;
  /** Relationship Sim 2.0: 6-axis how target (e.g. Player) feels about this NPC */
  reciprocal?: RelVector6;
}

export type NpcMemoryTag =
  | 'exam'
  | 'promotion'
  | 'marriage'
  | 'loss'
  | 'betrayal'
  | 'war'
  | 'defection'
  | 'politics'
  | 'secret'
  | 'bond';

export type NpcMemoryCategory =
  | 'saved_family'
  | 'abandoned'
  | 'betrayed'
  | 'fought_together'
  | 'mentored'
  | 'humiliated'
  | 'spared_life'
  | 'helped_ally'
  | 'loss'
  | 'milestone';

export interface NpcMemory {
  year: number;
  age: number;
  tag: NpcMemoryTag;
  summary: string;
  actorId?: string;
  impact: number; // -10..10
  category?: NpcMemoryCategory;
  salience?: number; // 1..10
}

export type NpcKnowledgeTopic =
  | 'root_plot'
  | 'clan_unrest'
  | 'missing_nin_loc'
  | 'kage_health'
  | 'border_raid'
  | 'bloodline_purge'
  | 'crisis_intel';

export interface NpcKnowledge {
  id: string;
  topic: NpcKnowledgeTopic;
  detail: string;
  secret: boolean;
  learnedYear: number;
  subjectId?: string;
}

export type NpcGoalType =
  | 'pass_chunin'
  | 'reach_jonin'
  | 'seek_kage'
  | 'marry_partner'
  | 'avenge_loss'
  | 'defect_village'
  | 'hunt_missing_nin'
  | 'broker_peace'
  | 'protect_clan'
  | 'shadow_scheme'
  | 'master_art';

export interface NpcGoal {
  type: NpcGoalType;
  label: string;
  targetId?: string;
  progress: number; // 0..100
  startedAge: number;
}

export interface NpcKit {
  skills: { name: string; tag: SkillTag; rank: number }[];
  ultimate: UltimateDef;
  tactic: NpcTactic;
  lines: {
    meet: string;
    clash: string;
    win: string;
    fall: string;
  };
}

export interface WorldNpcIdentity {
  id: string;
  name: string;
  sex: 'M' | 'F';
  age: number;
  villageId: VillageId;
  homeVillageId: VillageId;
  clanId: string | null;
  occupation: NpcOccupation;
  rank: ShinobiRank;
  specialStatus: SpecialStatus;
  roleTitle: string;
  epithet?: string;
  element: ChakraElement;
  specialty: string;
  archetype: CombatArchetype;
  bloodlineId?: string | null;
  traits: TraitId[];
  potential: number; // 0.80..1.20 (can decline with permanent injuries)
  statBias: [number, number, number, number, number]; // per-stat delta around ARCHETYPE_AVG
  weakness: string;
  jutsuIds: string[];
  kit: NpcKit;
  background: string;
  powerScore: number;
  alive: boolean;
  observed?: boolean;
  permanentInjuries?: number;
  deathAge?: number;
  deathCause?: string;
  kills?: number;
}

export type NpcLodTier = 'L1' | 'L2';

export type NpcGoalDomain = 'career' | 'survival' | 'family' | 'ambition' | 'loyalty';

export type NpcActionKind =
  | 'take_mission'
  | 'visit_family'
  | 'ask_ally_help'
  | 'train'
  | 'socialize'
  | 'travel'
  | 'fight'
  | 'rest'
  | 'scheme_or_defect';

export interface NpcFamilyCrisis {
  kind: 'sick_sibling' | 'elder_illness' | 'household_debt' | 'clan_trial';
  relativeName: string;
  severity: number; // 1..100
  yearsRemaining: number;
  helpedByPlayer?: boolean;
}

export interface NpcGoapStep {
  action: NpcActionKind;
  label: string;
  completed: boolean;
}

export interface NpcGoapPlan {
  domain: NpcGoalDomain;
  goalLabel: string;
  urgency: number; // 0..100
  steps: NpcGoapStep[];
  currentStepIndex: number;
}

export interface NpcUtilityEvaluation {
  action: NpcActionKind;
  label: string;
  total: number; // U(a) = w_g*G + w_p*P + w_r*R + w_m*M (0..100)
  gScore: number; // 0..100
  pScore: number; // 0..100
  rScore: number; // 0..100
  mScore: number; // 0..100
  targetId?: string;
  targetName?: string;
}

export interface NpcDecisionTrace {
  year: number;
  chosenAction: NpcActionKind;
  chosenLabel: string;
  reasonSummary: string;
  topOptions: NpcUtilityEvaluation[];
}

export interface NpcCognitionState {
  lodTier: NpcLodTier;
  stress: number; // 0..100
  injury: number; // 0..100
  lastUtilityTickYear: number;
  familyCrisis: NpcFamilyCrisis | null;
  activePlan: NpcGoapPlan | null;
  lastDecision: NpcDecisionTrace | null;
  pendingPlayerPlea?: boolean;
}

export interface WorldNpc {
  identity: WorldNpcIdentity;
  personality: NpcPersonality;
  motivation: NpcMotivation;
  nindo: {
    id: NindoId;
    maxim: string;
  };
  relationships: Record<string, NpcRelationship>;
  memory: NpcMemory[];
  schedule: NpcSchedule;
  knowledge: NpcKnowledge[];
  currentGoal: NpcGoal;
  cognition?: NpcCognitionState;
}

export interface WorldHistoryEntry {
  id: string;
  year: number;
  layer: 'world' | 'village' | 'npc';
  title: string;
  summary: string;
  villageId?: VillageId;
  npcId?: string;
  tone: 'normal' | 'milestone' | 'danger' | 'bond' | 'war' | 'crisis';
}

export type DiscoveryChannel =
  | 'hidden'
  | 'rumor'
  | 'newspaper'
  | 'mission_report'
  | 'npc_talk'
  | 'anbu_dossier';

export type TimelineCategory =
  | 'diplomacy'
  | 'military'
  | 'economy'
  | 'clan'
  | 'npc_fate'
  | 'covert'
  | 'disaster';

export interface TimelineEvent {
  id: string;
  year: number;
  eraYear: number;
  category: TimelineCategory;
  villageIds: VillageId[];
  npcIds: string[];
  truthTitle: string;
  truthSummary: string;
  rumorTitle: string;
  rumorSummary: string;
  isSecret: boolean;
  knownByPlayer: boolean;
  playerKnowsTruth: boolean;
  discoveryChannel: DiscoveryChannel;
  discoveredYear?: number;
  sourceLabel?: string;
}

export type SenseiBias = 'clan_heirs' | 'top_scorers' | 'underdogs' | 'strict_drill';

export interface AcademyState {
  enrolledAge: number;
  senseiNpcId: string;
  senseiName: string;
  senseiBias: SenseiBias;
  classmateNpcIds: string[];
  academics: number; // 0..100
  bunshin: number; // 0..100
  henge: number; // 0..100
  kawarimi: number; // 0..100
  sparringWins: number;
  sparringLosses: number;
  classRank: number; // 1..6
  favoredBySensei: boolean;
  bullyNpcId: string | null;
  usedAcademyEvents: string[];
}

export type ChuninParticipantStatus =
  | 'active'
  | 'eliminated_s1'
  | 'eliminated_s2'
  | 'eliminated_s4'
  | 'finalist'
  | 'promoted'
  | 'deceased';

export interface ChuninParticipant {
  personId: string; // 'player' or WorldNpc id
  powerScore: number;
  isTeammate: boolean;
  isRival: boolean;
  status: ChuninParticipantStatus;
  eliminationNote?: string;
}

export interface ChuninTournamentState {
  examYear: number;
  hostVillageId: VillageId;
  stage: ChuninExamStage;
  participants: ChuninParticipant[];
  prelimOpponentId: string | null;
  finalsOpponentId: string | null;
  casualties: string[];
  promotedNames: string[];
  completed: boolean;
}

export type LineageBranch =
  | 'main_heir'
  | 'main_cadets'
  | 'branch_house'
  | 'distant_blood'
  | 'mixed_blood';

export interface ClanHeritageState {
  clanId: string;
  lineageBranch: LineageBranch;
  compatibility: number; // 0..100
  familyExpectation: number; // 0..100
  traumaCatalyst: number; // 0..100
  unlockedHiden: string[];
  hidenMastery: Record<string, 1 | 2 | 3>;
  clanStanding: number; // 0..100
  isDesignatedHeir: boolean;
  cagedBirdSealed: boolean;
  obligationsCompleted: number;
  internalFactionTension: number; // 0..100
  lastClanEventAge: number;
}

export type MissionApproachId =
  | 'negotiate'
  | 'disguise'
  | 'infiltrate'
  | 'gather_intel'
  | 'trap'
  | 'combat'
  | 'retreat'
  | 'save_comrades';

export type MissionOutcomeTier = 'success' | 'partial_success' | 'failure';

export interface GeneratedMission {
  id: string;
  rank: 'D' | 'C' | 'B' | 'A' | 'S';
  title: string;
  objective: string;
  location: string;
  client: string;
  threat: string;
  threatNpcId?: string;
  constraint: string;
  squadLabel: string;
  hiddenComplicationId: string;
  hiddenComplicationTitle: string;
  hiddenComplicationDetail: string;
  complicationRevealed: boolean;
  difficulty: number;
  ryoReward: number;
  xpReward: number;
  stage: 1 | 2 | 3;
  approachScore: number;
  constraintIntact: boolean;
  chosenApproach?: MissionApproachId;
}

export interface MissionConsequence {
  id: string;
  createdAge: number;
  expiresAge: number;
  kind: 'vendetta' | 'reputation_hit' | 'diplomatic_scandal' | 'comrade_debt' | 'intel_edge';
  title: string;
  detail: string;
  npcId?: string;
  villageId?: VillageId;
  resolved: boolean;
}

export interface WorldSimState {
  economy: number; // 0..100
  economyTrend: EconomyTrend;
  diplomacy: Record<string, DiplomacyEdge>;
  territories: WorldTerritory[];
  activeDisasters: WorldDisaster[];
  villages: Record<VillageId, VillageSimState>;
  npcs: WorldNpc[];
  history: WorldHistoryEntry[];
  timeline?: TimelineEvent[];
  nextNpcSeq: number;
  lastEmergentAge: number;
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
  | 'academy_event'
  | 'graduation_exam'
  | 'bell_test'
  | 'nindo_choice'
  | 'chunin_exam_stage'
  | 'team_disband'
  | 'jonin_eval'
  | 'kage_succession'
  | 'kuchiyose_contract'
  | 'bloodline_event'
  | 'discipline_advance'
  | 'clan_legacy'
  | 'clan_politics'
  | 'life_event'
  | 'growth_event'
  | 'team_event'
  | 'mission_board'
  | 'mission_stage'
  | 'mission_event'
  | 'world_emergent'
  | 'politics_event'
  | 'imperfect_life'
  | 'npc_plea'
  | 'legend_event'
  | 'drawback_event'
  | 'crisis_whisper'
  | 'war_prelude'
  | 'war_day'
  | 'war_vanguard_choice'
  | 'war_night'
  | 'war_target'
  | 'war_battle_round'
  | 'war_pressure'
  | 'war_crossroads'
  | 'war_partner_down'
  | 'war_partner_scene'
  | 'war_finale_wish'
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

export interface PlayerHumanLegacy {
  livesSaved: number;
  comradesBroughtHome: number;
  quietHeroMoments: string[];
  unhealedScars: string[];
  usedImperfectScenarios: string[];
  abandonedSurvivorNpcId?: string | null;
  unwantedTargetNpcId?: string | null;
  lastNpcPleaAge?: number;
}

export interface LifeRecord {
  id: string;
  seed: number;
  name: string;
  epithet?: string;
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
  secondaryElements?: ChakraElement[];
  bloodlineName: string | null;
  bijuuName?: string | null;
  topDisciplines: string[];
  warsSurvived: number;
  warsFought: number;
  crisisStatus: string;
  lastWords: string;
  reflections: { age: number; prompt: string; answer: string }[];
  warHistory: WarSummary[];
  teamSummary: string;
  posthumousBeats: EpilogueBeat[];
  livesSaved?: number;
  comradesBroughtHome?: number;
  quietHeroTitle?: string;
}

export interface ScenarioConfig {
  crisisOverride?: 'natural' | CrisisId;
  preferredSex?: 'M' | 'F';
  preferredVillage?: VillageId;
  customName?: string;
  customBuild?: CustomBuildConfig;
}

export interface GameState {
  version: number;
  saveVersion?: number;
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
  epithet?: string;
  sex: 'M' | 'F';
  originId: OriginId;
  villageId: VillageId;
  clanId?: string | null;
  capacity: 1 | 2 | 3 | 4 | 5;
  element: ChakraElement;
  secondaryElements?: ChakraElement[];

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
  jutsuMastery?: Record<string, number>;
  discoveredJutsu?: string[];
  signatureJutsu?: string[];
  jinchuriki?: JinchurikiState | null;
  drawbacks?: DrawbackId[];
  sandbox?: SandboxConfig;
  permanentDisability?: boolean;
  bloodline: BloodlineState | null;
  hasClanLegacy: boolean;
  legacyScar: boolean;
  bodyStrain: number;
  keepFit: boolean;
  flags: Record<string, boolean>;

  family: FamilyMember[];
  team: TeamState | null;
  academy?: AcademyState | null;
  chuninTournament?: ChuninTournamentState | null;
  clanHeritage?: ClanHeritageState | null;
  activeMission?: GeneratedMission | null;
  missionConsequences?: MissionConsequence[];
  playerLegacy?: PlayerHumanLegacy;
  lastGovernanceAge?: number;
  lastPoliticsAge?: number;
  permanentPartner?: PermanentPartnerRecord | null;
  summonContract?: SummonContractState | null;
  nindo?: NindoId;
  rivalId?: string | null;
  memories?: ShinobiMemory[];
  missions: MissionRecord;
  world: WorldState;
  worldSim?: WorldSimState;
  war: WarState | null;
  warHistory: WarSummary[];

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
