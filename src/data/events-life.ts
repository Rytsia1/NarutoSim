import type { FocusId, LeaningKey, ShinobiRank, StatKey, StatusGateTag, VillageId } from '../sim/types';
import { EXTRA_FLAVOR_LINES, EXTRA_GROWTH_EVENTS, EXTRA_LIFE_EVENTS } from './events-life-extra';

export interface SimpleEffect {
  stats?: Partial<Record<StatKey, number>>;
  leanings?: Partial<Record<LeaningKey, number>>;
  tension?: number;
  clues?: number;
  xpMain?: number;
  setFlags?: string[];
  trustAllTeam?: number;
  deathChance?: number;
  deathCause?: string;
}

export interface LifeEventOptionDef {
  id: string;
  label: string;
  sublabel?: string;
  statHints?: string[];
  autoEligible: boolean;
  minStat?: Partial<Record<StatKey, number>>;
  check?: {
    label: string;
    stat: StatKey;
    rollMax: number;
    threshold: number;
  };
  onPassText: string;
  onPass: SimpleEffect;
  onFailText?: string;
  onFail?: SimpleEffect;
}

export interface LifeEventDef {
  id: string;
  title: string;
  body: string;
  minAge: number;
  maxAge: number;
  weight: number;
  repeatable?: boolean;
  ranks?: ShinobiRank[];
  statusTags?: readonly StatusGateTag[];
  villageOnly?: VillageId[];
  excludeOrphan?: boolean;
  onlyOrphan?: boolean;
  leaningBias?: LeaningKey;
  options: LifeEventOptionDef[];
}

export const LIFE_EVENTS: readonly LifeEventDef[] = [
  {
    id: 'le_first_chakra_leaf',
    title: 'Leaf Concentration Exercise',
    body: 'An instructor presses a dry cedar leaf to your forehead and tells you to hold it there with nothing but steady chakra.',
    minAge: 6,
    maxAge: 11,
    weight: 12,
    ranks: ['academy'],
    options: [
      {
        id: 'push_hard',
        label: 'Force more chakra until the leaf splits',
        statHints: ['Chakra', 'Health'],
        autoEligible: true,
        check: { label: 'Chakra Control', stat: 'chakra', rollMax: 25, threshold: 34 },
        onPassText: 'The leaf holds flat, then curls sharply from the clean flow. The instructor nods once.',
        onPass: { stats: { chakra: 4, will: 2 }, xpMain: 4 },
        onFailText: 'Your chakra surges wildly, giving you a splitting headache before the leaf flutters away.',
        onFail: { stats: { chakra: 2, health: -3 } },
      },
      {
        id: 'steady_breath',
        label: 'Focus on breathing and patience',
        statHints: ['Will', 'Intel'],
        autoEligible: true,
        onPassText: 'You close your eyes and count heartbeats. By sunset, the leaf stays pinned for a full minute.',
        onPass: { stats: { will: 3, intel: 2 }, xpMain: 2 },
      },
    ],
  },
  {
    id: 'le_academy_bully',
    title: 'Cornered Behind the Training Posts',
    body: 'Three older students from a proud clan block a quiet classmate behind the wooden posts, mocking their clumsy kunai grip.',
    minAge: 7,
    maxAge: 12,
    weight: 11,
    leaningBias: 'will_of_fire',
    options: [
      {
        id: 'step_in',
        label: 'Step between them and challenge the leader',
        statHints: ['Health', 'Bonds'],
        autoEligible: true,
        check: { label: 'Sparring Grit', stat: 'health', rollMax: 30, threshold: 78 },
        onPassText: 'You take a bruised cheek, sweep the leader off his feet, and earn quiet respect across the yard.',
        onPass: { stats: { bonds: 5, will: 3, health: -2 }, leanings: { will_of_fire: 2 } },
        onFailText: 'They shove you into the dirt, yet you refuse to crawl back. An instructor finally breaks it up.',
        onFail: { stats: { health: -5, will: 4, bonds: 2 }, leanings: { will_of_fire: 1, vengeance: 1 } },
      },
      {
        id: 'outsmart',
        label: 'Shout that the head instructor is coming around the fence',
        statHints: ['Intel'],
        autoEligible: true,
        onPassText: 'They scatter before checking the corner. The classmate quietly shares half a rice ball with you.',
        onPass: { stats: { intel: 3, bonds: 3 } },
      },
      {
        id: 'watch_coldly',
        label: 'Stay out of it: weak shinobi do not last',
        statHints: ['Will'],
        autoEligible: true,
        onPassText: 'You memorize their footwork from the shade and walk away without a word.',
        onPass: { stats: { intel: 2, bonds: -3 }, leanings: { ruthless: 2 } },
      },
    ],
  },
  {
    id: 'le_orphan_market',
    title: 'Rain by the River Stalls',
    body: 'A merchant accuses you of stealing bruised apples after the evening bell, pointing at your patched sleeve.',
    minAge: 6,
    maxAge: 13,
    weight: 14,
    onlyOrphan: true,
    leaningBias: 'vengeance',
    options: [
      {
        id: 'stand_ground',
        label: 'Empty your pockets in front of the crowd',
        statHints: ['Will'],
        autoEligible: true,
        onPassText: 'Only two dull training stones fall out. The stall owner mutters and turns away.',
        onPass: { stats: { will: 4, bonds: 1 }, leanings: { will_of_fire: 1 } },
      },
      {
        id: 'remember_face',
        label: 'Say nothing and burn his face into memory',
        statHints: ['Will'],
        autoEligible: true,
        onPassText: 'You walk back into the rain with cold hands and a vow never to beg anyone.',
        onPass: { stats: { will: 3, bonds: -2 }, leanings: { vengeance: 2 } },
      },
    ],
  },
  {
    id: 'le_sealed_scroll_attic',
    title: 'A Water-Stained Scroll',
    body: 'While clearing storage rafters for your parents, you uncover a waxed tube sealed with faded crimson ink and unfamiliar hand seals.',
    minAge: 11,
    maxAge: 24,
    weight: 10,
    excludeOrphan: true,
    leaningBias: 'forbidden',
    options: [
      {
        id: 'decode_secretly',
        label: 'Copy the diagrams by lantern light',
        statHints: ['Intel', 'Chakra'],
        autoEligible: true,
        check: { label: 'Scroll Decryption', stat: 'intel', rollMax: 30, threshold: 48 },
        onPassText: 'The margins describe an old chakra compression trick. Your control sharpens overnight.',
        onPass: { stats: { intel: 4, chakra: 4 }, xpMain: 6, leanings: { forbidden: 2 } },
        onFailText: 'A defensive ink-ward snaps across your fingers, scorching your palm before turning to ash.',
        onFail: { stats: { health: -6, intel: 2 }, leanings: { forbidden: 1 } },
      },
      {
        id: 'hand_over',
        label: 'Turn it over to the village archive',
        statHints: ['Bonds', 'Ryo'],
        autoEligible: true,
        onPassText: 'The archivist pays a modest finder\'s fee and commends your restraint.',
        onPass: { stats: { ryo: 6, bonds: 3 }, leanings: { will_of_fire: 1 } },
      },
    ],
  },
  {
    id: 'le_midnight_training',
    title: 'Moonlit Waterfall Drill',
    body: 'Restless after dusk, you hike to the river cliffs where older shinobi leave kunai scars across the wet rock.',
    minAge: 12,
    maxAge: 34,
    weight: 10,
    repeatable: true,
    ranks: ['genin', 'chunin', 'jonin'],
    options: [
      {
        id: 'exhaust_body',
        label: 'Drill until dawn breaks',
        statHints: ['Chakra', 'Health'],
        autoEligible: true,
        onPassText: 'Your lungs burn and your knuckles split, yet your hand seals flow half a beat faster.',
        onPass: { stats: { chakra: 3, will: 2, health: -3 }, xpMain: 5, leanings: { ambition: 1 } },
      },
      {
        id: 'meditate_flow',
        label: 'Sit beneath the cold mist and steady your mind',
        statHints: ['Will', 'Health'],
        autoEligible: true,
        onPassText: 'The roar of falling water clears out stray thoughts and mends worn nerves.',
        onPass: { stats: { will: 4, health: 2 } },
      },
    ],
  },
  {
    id: 'le_rogue_informant',
    title: 'Whisper in a Back-Alley Teahouse',
    body: 'A scarred traveler slides a coded slip under your cup: proof that a village councilor is selling border patrol timetables.',
    minAge: 15,
    maxAge: 38,
    weight: 11,
    ranks: ['genin', 'chunin', 'jonin'],
    leaningBias: 'will_of_fire',
    options: [
      {
        id: 'report_kage',
        label: 'Deliver the ledger directly to the {kage} Tower',
        statHints: ['Will', 'Bonds'],
        autoEligible: true,
        check: { label: 'Political Courage', stat: 'will', rollMax: 30, threshold: 52 },
        onPassText: 'The councilor vanishes from office within a week. Quiet praise reaches your file.',
        onPass: { stats: { bonds: 5, intel: 3 }, tension: -4, leanings: { will_of_fire: 2 } },
        onFailText: 'The trail goes cold before investigators arrive, and someone sends thugs to warn you off.',
        onFail: { stats: { health: -6, will: 3 }, leanings: { vengeance: 1 } },
      },
      {
        id: 'blackmail',
        label: 'Use the slip to extort funds and favors',
        statHints: ['Ryo', 'Intel'],
        autoEligible: true,
        onPassText: 'Heavy pouches of ryo arrive at your door under no seal. The border grows noisier that winter.',
        onPass: { stats: { ryo: 16, intel: 2, bonds: -4 }, tension: 6, leanings: { ruthless: 2, ambition: 1 } },
      },
      {
        id: 'burn_slip',
        label: 'Burn the note over the brazier and walk out',
        statHints: ['Will'],
        autoEligible: true,
        onPassText: 'Village politics swallow careless shinobi whole. You keep your head down.',
        onPass: { stats: { will: 2 } },
      },
    ],
  },
  {
    id: 'le_anbu_recruitment',
    title: 'An Owl Mask at Your Window',
    body: 'A figure in a porcelain mask perches silently on your windowsill, offering a transfer into the village shadow division.',
    minAge: 16,
    maxAge: 28,
    weight: 12,
    ranks: ['chunin', 'jonin'],
    options: [
      {
        id: 'join_anbu',
        label: 'Accept the mask and serve in silence',
        statHints: ['Will', 'Intel'],
        autoEligible: true,
        check: { label: 'ANBU Trial', stat: 'will', rollMax: 30, threshold: 58 },
        onPassText: 'Your name is scrubbed from public rosters. You walk rooftops by night and learn harsher truths.',
        onPass: { stats: { intel: 6, will: 5, bonds: -5 }, setFlags: ['joined_anbu'], leanings: { ruthless: 1, will_of_fire: 1 } },
        onFailText: 'After three brutal nights of evaluation, the captain deems your heart too loud for the shadows.',
        onFail: { stats: { health: -6, will: 3 } },
      },
      {
        id: 'refuse_anbu',
        label: 'Decline and keep fighting in the open',
        statHints: ['Bonds'],
        autoEligible: true,
        onPassText: 'The masked operative vanishes in a swirl of leaves without a second word.',
        onPass: { stats: { bonds: 3, will: 2 } },
      },
    ],
  },
  {
    id: 'le_forbidden_offer',
    title: 'The Chemist from Beyond the Border',
    body: 'A soft-spoken rogue researcher offers a vial that forcibly widens chakra coils at the cost of burning healthy tissue.',
    minAge: 15,
    maxAge: 36,
    weight: 9,
    ranks: ['genin', 'chunin', 'jonin'],
    leaningBias: 'forbidden',
    options: [
      {
        id: 'drink_vial',
        label: 'Swallow the compound and endure the fever',
        statHints: ['Chakra', 'Health'],
        autoEligible: true,
        check: { label: 'Vitality Endure', stat: 'health', rollMax: 25, threshold: 62 },
        onPassText: 'Three days of cold sweat leave your veins humming with raw, unnatural chakra pressure.',
        onPass: { stats: { chakra: 12, health: -8 }, leanings: { forbidden: 3, ambition: 1 } },
        onFailText: 'Your coils blister painfully. You survive, but a persistent tremor lingers in your hands.',
        onFail: { stats: { chakra: 5, health: -14 }, leanings: { forbidden: 2 } },
      },
      {
        id: 'capture_chemist',
        label: 'Draw a kunai and try to apprehend the rogue',
        statHints: ['Intel', 'Health'],
        autoEligible: true,
        check: { label: 'Ambush Catch', stat: 'intel', rollMax: 30, threshold: 55 },
        onPassText: 'He escapes in smoke, leaving behind field notes you turn in for a bounty.',
        onPass: { stats: { ryo: 10, intel: 4 }, leanings: { will_of_fire: 1 } },
        onFailText: 'A paralytic dart grazes your shoulder before he melts into the forest.',
        onFail: { stats: { health: -8 } },
      },
      {
        id: 'walk_away',
        label: 'Refuse and seal the meeting from your memory',
        autoEligible: true,
        onPassText: 'Power bought in alleys always collects interest later.',
        onPass: { stats: { will: 2 } },
      },
    ],
  },
  {
    id: 'le_first_love',
    title: 'Lanterns on the Autumn Bridge',
    body: 'During the harvest lantern festival, someone you have shared quiet patrols and meals with lingers beside you over the canal.',
    minAge: 17,
    maxAge: 28,
    weight: 10,
    options: [
      {
        id: 'confess',
        label: 'Speak honestly before another deployment separates you',
        statHints: ['Bonds'],
        autoEligible: true,
        check: { label: 'Heartfelt Bond', stat: 'bonds', rollMax: 35, threshold: 55 },
        onPassText: 'They smile through the lantern glow and clasp your scarred fingers. Life feels warmer for a season.',
        onPass: { stats: { bonds: 8, will: 3 }, setFlags: ['first_love'] },
        onFailText: 'They look down at the drifting paper boats and gently say shinobi cannot afford promises.',
        onFail: { stats: { bonds: -2, will: 2 } },
      },
      {
        id: 'keep_silent',
        label: 'Watch the river in silence and say nothing',
        autoEligible: true,
        onPassText: 'Some words stay safer unsaid when tomorrow brings another mission.',
        onPass: { stats: { will: 2 } },
      },
    ],
  },
  {
    id: 'le_marriage',
    title: 'A Home of Your Own',
    body: 'After years of returning to an empty room, someone who knows the weight of your life asks whether you want to build a home together.',
    minAge: 22,
    maxAge: 42,
    weight: 11,
    options: [
      {
        id: 'marry_yes',
        label: 'Exchange vows in a modest village ceremony',
        statHints: ['Bonds', 'Ryo'],
        autoEligible: true,
        onPassText: 'A second pair of sandals waits by the doorway now. Returning home each evening suddenly means far more.',
        onPass: { stats: { bonds: 10, will: 4, ryo: -5 }, setFlags: ['trigger_marry'] },
      },
      {
        id: 'marry_no',
        label: 'Decline: an uncertain life is too heavy a burden to ask of a spouse',
        autoEligible: true,
        onPassText: 'They nod with quiet sorrow. You return alone to your quiet room.',
        onPass: { stats: { will: 3, bonds: -3 } },
      },
    ],
  },
  {
    id: 'le_have_child',
    title: 'A New Voice Under the Roof',
    body: 'Your spouse places your hand gently over theirs and whispers that a child is on the way.',
    minAge: 24,
    maxAge: 44,
    weight: 12,
    repeatable: true,
    options: [
      {
        id: 'welcome_child',
        label: 'Welcome the child and swear to guard their future',
        statHints: ['Bonds', 'Ryo'],
        autoEligible: true,
        onPassText: 'When the first cry fills the room, every scar you survived feels worth the price.',
        onPass: { stats: { bonds: 8, ryo: -6, will: 3 }, setFlags: ['trigger_child'], leanings: { will_of_fire: 1 } },
      },
    ],
  },
  {
    id: 'le_border_skirmish_dilemma',
    title: 'Prisoner on the Mountain Pass',
    body: 'You capture an enemy scout carrying patrol ciphers, barely sixteen years old and trembling from a broken ankle.',
    minAge: 16,
    maxAge: 44,
    weight: 10,
    ranks: ['chunin', 'jonin'],
    leaningBias: 'ruthless',
    options: [
      {
        id: 'bind_escort',
        label: 'Splint the ankle and escort them to village custody',
        statHints: ['Will', 'Bonds'],
        autoEligible: true,
        onPassText: 'The slow march costs you a night of sleep, yet the prisoner offers useful border details out of gratitude.',
        onPass: { stats: { intel: 4, bonds: 3, health: -2 }, leanings: { will_of_fire: 2 } },
      },
      {
        id: 'extract_harshly',
        label: 'Break their resolve on the spot and leave no witness',
        statHints: ['Intel'],
        autoEligible: true,
        onPassText: 'You return before dawn with complete cipher sheets and cold mud on your boots.',
        onPass: { stats: { intel: 6, bonds: -4 }, tension: 5, leanings: { ruthless: 3 } },
      },
    ],
  },
  {
    id: 'le_betrayal_client',
    title: 'A Client Who Sold Your Route',
    body: 'Midway through an escort job, hired ambushers surround the ridge calling out your exact jutsu habits: the merchant you protected tipped them off.',
    minAge: 15,
    maxAge: 42,
    weight: 10,
    ranks: ['genin', 'chunin', 'jonin'],
    leaningBias: 'vengeance',
    options: [
      {
        id: 'cut_through',
        label: 'Break the encirclement and hunt the merchant down',
        statHints: ['Health', 'Chakra'],
        autoEligible: true,
        check: { label: 'Breakout Fight', stat: 'chakra', rollMax: 35, threshold: 58 },
        onPassText: 'You scatter the ambushers and drag the trembling client back in iron wire.',
        onPass: { stats: { will: 4, ryo: 8, health: -4 }, leanings: { vengeance: 2, ruthless: 1 } },
        onFailText: 'A hidden wire slashes your ribs as you dive into the ravine to survive.',
        onFail: { stats: { health: -12, will: 2 }, leanings: { vengeance: 3 }, deathChance: 0.08, deathCause: 'ambushed after a client betrayal' },
      },
      {
        id: 'smoke_vanish',
        label: 'Pop smoke bombs and abandon the compromised contract',
        statHints: ['Intel'],
        autoEligible: true,
        onPassText: 'You vanish through the canopy alive and file a black-mark report against the client.',
        onPass: { stats: { intel: 3, ryo: -4 } },
      },
    ],
  },
  {
    id: 'le_mentor_young_genin',
    title: 'An Unsteady Academy Hopeful',
    body: 'A scraped-up kid stays late at the practice grounds throwing crooked shuriken long after the bells ring.',
    minAge: 19,
    maxAge: 52,
    weight: 9,
    ranks: ['chunin', 'jonin'],
    leaningBias: 'will_of_fire',
    options: [
      {
        id: 'correct_stance',
        label: 'Spend an hour fixing their wrist angle and breathing',
        statHints: ['Bonds', 'Will'],
        autoEligible: true,
        onPassText: 'The next throw bites clean into the painted ring. Teaching sharpens your own fundamentals too.',
        onPass: { stats: { bonds: 5, intel: 2, will: 2 }, xpMain: 3, leanings: { will_of_fire: 2 } },
      },
      {
        id: 'harsh_truth',
        label: 'Tell them raw talent matters more than wishful drills',
        autoEligible: true,
        onPassText: 'They flinch, then grip the shuriken twice as hard. Whether it breaks or tempers them is up to them.',
        onPass: { stats: { will: 2, bonds: -2 }, leanings: { ruthless: 1, ambition: 1 } },
      },
    ],
  },
  {
    id: 'le_kage_ambition',
    title: 'Standing Below the Monument',
    body: 'Looking up at the leadership tower after a tense council briefing, you realize how fragile peace is when guided by timid hands.',
    minAge: 20,
    maxAge: 46,
    weight: 9,
    ranks: ['chunin', 'jonin'],
    statusTags: ['active_shinobi', 'not_kage'],
    leaningBias: 'ambition',
    options: [
      {
        id: 'vow_lead',
        label: 'Vow to earn the authority to reshape the village yourself',
        statHints: ['Will', 'Bonds'],
        autoEligible: true,
        onPassText: 'You study logistics, alliances, and defense protocols late into the night.',
        onPass: { stats: { intel: 4, will: 4, bonds: 2 }, leanings: { ambition: 3 } },
      },
      {
        id: 'serve_quietly',
        label: 'Leave politics to the elders and hone your own blade',
        autoEligible: true,
        onPassText: 'Titles draw arrows. Mastery keeps you breathing.',
        onPass: { stats: { chakra: 3, health: 2 }, xpMain: 3 },
      },
    ],
  },
  {
    id: 'le_keep_fit_routine',
    title: 'An Aging Medic\'s Warning',
    body: 'After patching a torn shoulder tendon, an old village medic warns that shinobi bodies collect every shortcut after forty.',
    minAge: 32,
    maxAge: 48,
    weight: 12,
    options: [
      {
        id: 'adopt_regimen',
        label: 'Commit to morning stretching, herbal broths, and steady recovery',
        statHints: ['Health', 'Ryo'],
        autoEligible: true,
        onPassText: 'Your joints ache less in winter rain, slowing the wear of advancing years.',
        onPass: { stats: { health: 6, ryo: -4 }, setFlags: ['keep_fit'] },
      },
      {
        id: 'ignore_warning',
        label: 'Shrug it off and keep pushing live drills',
        autoEligible: true,
        onPassText: 'You train through the stiffness and win two sparring bouts, though your knee swells by nightfall.',
        onPass: { stats: { will: 3, health: -3 }, xpMain: 3 },
      },
    ],
  },
  {
    id: 'le_hunter_nin_ambush',
    title: 'Hunter-Nin in the Cedar Fog',
    body: 'Whistling senbon slice the mist around your camp. A village tracker squad has finally caught up with your rogue scent.',
    minAge: 12,
    maxAge: 65,
    weight: 18,
    repeatable: true,
    options: [
      {
        id: 'fight_hunters',
        label: 'Turn and cut through the tracker squad',
        statHints: ['Chakra', 'Health'],
        autoEligible: true,
        check: { label: 'Rogue Survival', stat: 'chakra', rollMax: 40, threshold: 72 },
        onPassText: 'Two masks crack in the fog before the squad withdraws, adding fresh ink to your Bingo Book page.',
        onPass: { stats: { will: 5, health: -6 }, xpMain: 5, tension: 4, leanings: { ruthless: 1, vengeance: 1 } },
        onFailText: 'Poisoned needles slow your legs. You barely crawl clear of the gorge bleeding heavily.',
        onFail: { stats: { health: -18 }, deathChance: 0.24, deathCause: 'hunted down by an ANBU tracker squad' },
      },
      {
        id: 'decoy_flee',
        label: 'Burn paper bombs behind you and vanish downstream',
        statHints: ['Intel', 'Will'],
        autoEligible: true,
        check: { label: 'Evasion', stat: 'intel', rollMax: 35, threshold: 55 },
        onPassText: 'Your clone decoy draws their volley while you slip across the border unharmed.',
        onPass: { stats: { intel: 3, ryo: -5 } },
        onFailText: 'They read your feint and tag your flank before the river current hides your trail.',
        onFail: { stats: { health: -12 }, deathChance: 0.12, deathCause: 'cornered by village hunter-nin' },
      },
    ],
  },
  // === VILLAGE-SIGNATURE & EXPANDED NARUTO LIFE EVENTS ===
  {
    id: 'le_konoha_ichiraku',
    title: 'Steam Rising at Ichiraku Ramen',
    body: 'Rain patters on the red cloth curtains of Ichiraku Ramen as the chef slides a steaming bowl of miso chashu across the wooden counter after a brutal training week.',
    minAge: 8,
    maxAge: 60,
    weight: 12,
    villageOnly: ['konoha'],
    options: [
      {
        id: 'order_extra',
        label: 'Order a double bowl and swap war stories with the regulars',
        statHints: ['Bonds', 'Health'],
        autoEligible: true,
        onPassText: 'Warm broth restores bruised muscles and reminds you why Konohagakure is worth bleeding for.',
        onPass: { stats: { health: 6, bonds: 5, ryo: -3 }, leanings: { will_of_fire: 1 } },
      },
      {
        id: 'eat_fast',
        label: 'Finish quickly and head back to the training posts',
        statHints: ['Chakra'],
        autoEligible: true,
        onPassText: 'You leave exact coin on the wood and spend two more hours refining hand seals in the rain.',
        onPass: { stats: { chakra: 3, will: 2, ryo: -2 }, xpMain: 3 },
      },
    ],
  },
  {
    id: 'le_konoha_hokage_rock',
    title: 'Scrubbing the Hokage Monument',
    body: 'You climb the wooden scaffolding beneath the towering stone faces overlooking Konohagakure, looking down over every cedar roof and academy courtyard.',
    minAge: 9,
    maxAge: 22,
    weight: 11,
    villageOnly: ['konoha'],
    options: [
      {
        id: 'vow_carved_face',
        label: 'Stare at the carved stone and swear your face will join them one day',
        statHints: ['Will'],
        autoEligible: true,
        onPassText: 'Wind whips your headband tails as fierce determination settles into your chest.',
        onPass: { stats: { will: 5, chakra: 3 }, leanings: { ambition: 2, will_of_fire: 1 } },
      },
      {
        id: 'help_cleanup',
        label: 'Help the younger academy kids scrub the paint cleanly before dusk',
        statHints: ['Bonds'],
        autoEligible: true,
        onPassText: 'Everyone descends the cliff exhausted and grinning as lanterns blink on across the village.',
        onPass: { stats: { bonds: 6, will: 2 }, leanings: { will_of_fire: 1 } },
      },
    ],
  },
  {
    id: 'le_suna_puppet_forge',
    title: 'Sandstorm in the Puppet Brigade Workshop',
    body: 'Howling desert wind rattles the iron shutters of Sunagakure\'s craft hall, where senior artisans test chakra threads on lacquered wood joints.',
    minAge: 11,
    maxAge: 34,
    weight: 12,
    villageOnly: ['suna'],
    options: [
      {
        id: 'tune_threads',
        label: 'Spend the storm calibrating ten chakra threads at once',
        statHints: ['Intel', 'Chakra'],
        autoEligible: true,
        onPassText: 'Your fingertips ache by morning, yet your fine chakra precision leaps forward.',
        onPass: { stats: { intel: 5, chakra: 4 }, xpMain: 5 },
      },
      {
        id: 'trade_parts',
        label: 'Help reinforce desert water seals for bonus workshop pay',
        statHints: ['Ryo', 'Bonds'],
        autoEligible: true,
        onPass: { stats: { ryo: 10, bonds: 3 } },
        onPassText: 'Clean seals save precious cistern water, earning gratitude and silver coin.',
      },
    ],
  },
  {
    id: 'le_kiri_bloody_mist',
    title: 'Fog Over the Kirigakure Sparring Ring',
    body: 'Salt mist rolls thick across the stone courtyard. Instructors call out names in pairs, reviving harsh echoes of the old Bloody Mist proving grounds.',
    minAge: 10,
    maxAge: 18,
    weight: 14,
    villageOnly: ['kiri'],
    options: [
      {
        id: 'strike_decisive',
        label: 'End the bout in three ruthless strikes without hesitating',
        statHints: ['Health', 'Will'],
        autoEligible: true,
        onPassText: 'Silence falls across the fogged yard. Nobody questions your edge afterward.',
        onPass: { stats: { will: 5, chakra: 3, health: -3 }, xpMain: 5, leanings: { ruthless: 2 } },
      },
      {
        id: 'disarm_cleanly',
        label: 'Pin your classmate\'s blade without drawing blood',
        statHints: ['Intel', 'Bonds'],
        autoEligible: true,
        onPassText: 'You prove control beats cruelty, earning quiet respect from the younger generation of Kirigakure.',
        onPass: { stats: { intel: 4, bonds: 4, will: 3 }, leanings: { will_of_fire: 1 } },
      },
    ],
  },
  {
    id: 'le_kumo_lightning_peaks',
    title: 'Storm Drills Above the Cloud Peaks',
    body: 'Thunder rumbles beneath your sandals on Kumogakure\'s high training plateau as senior shinobi spar amidst crackling static.',
    minAge: 11,
    maxAge: 36,
    weight: 12,
    villageOnly: ['kumo'],
    options: [
      {
        id: 'match_pace',
        label: 'Push your footwork to lightning-cloak tempo until dusk',
        statHints: ['Health', 'Chakra'],
        autoEligible: true,
        onPassText: 'Your muscles burn like live wire, forging relentless Kumogakure speed.',
        onPass: { stats: { health: 4, chakra: 5, will: 2 }, xpMain: 5, leanings: { ambition: 1 } },
      },
      {
        id: 'study_stance',
        label: 'Analyze their lightning-blade openings from the cliff edge',
        statHints: ['Intel'],
        autoEligible: true,
        onPassText: 'You chart three lightning timing cues before the storm breaks.',
        onPass: { stats: { intel: 5, chakra: 2 } },
      },
    ],
  },
  {
    id: 'le_iwa_stone_trial',
    title: 'Burden of the Canyon Basalt',
    body: 'Iwagakure elders set a jagged boulder atop the narrow ridge path, daring young shinobi to shoulder the village\'s unyielding Will of Stone.',
    minAge: 11,
    maxAge: 38,
    weight: 12,
    villageOnly: ['iwa'],
    options: [
      {
        id: 'shoulder_stone',
        label: 'Heft the basalt slab across the gorge without dropping your stance',
        statHints: ['Health', 'Will'],
        autoEligible: true,
        onPassText: 'Your shoulders bruise black and blue, yet your endurance hardens like mountain rock.',
        onPass: { stats: { health: 6, will: 5 }, xpMain: 4, leanings: { will_of_fire: 1 } },
      },
      {
        id: 'shatter_doton',
        label: 'Channel Earth Release to cleave the boulder cleanly in two',
        statHints: ['Chakra', 'Intel'],
        autoEligible: true,
        onPassText: 'Stone cracks cleanly along the seam as onlookers applaud your chakra precision.',
        onPass: { stats: { chakra: 5, intel: 3 }, xpMain: 5 },
      },
    ],
  },
  {
    id: 'le_kuchiyose_contract',
    title: 'Blood Seal of a Summoning Scroll',
    body: 'A scarred veteran unrolls a weathered Kuchiyose blood-contract scroll scented with cedar and mountain mist, offering you a chance to sign with a named summon clan.',
    minAge: 14,
    maxAge: 36,
    weight: 10,
    ranks: ['genin', 'chunin', 'jonin'],
    options: [
      {
        id: 'sign_toad',
        label: 'Sign in blood with the Mount Myoboku Toads (Gamahiro lineage)',
        statHints: ['Chakra', 'Bonds'],
        autoEligible: true,
        check: { label: 'Summon Resonance', stat: 'chakra', rollMax: 30, threshold: 52 },
        onPassText: 'Smoke bursts wide as a gruff armored toad nods in approval. "Do not call me for petty chores, kid."',
        onPass: { stats: { chakra: 5, bonds: 5, will: 3 }, xpMain: 5, setFlags: ['summon_contract_toad'] },
        onFailText: 'Only a tiny tadpole pops out of the smoke, though the blood signature remains bound to your chakra.',
        onFail: { stats: { chakra: 2, will: 2 }, setFlags: ['summon_contract_toad'] },
      },
      {
        id: 'sign_hound',
        label: 'Sign in blood with the Ninken Tracking Hounds (Kuromaru pack)',
        statHints: ['Intel', 'Bonds'],
        autoEligible: true,
        onPassText: 'A sharp-eyed hound in a village vest steps through the mist and touches nose to your knuckle.',
        onPass: { stats: { intel: 5, bonds: 5 }, xpMain: 4, setFlags: ['summon_contract_hound'] },
      },
    ],
  },
  {
    id: 'le_chunin_vest_tailor',
    title: 'Fitting the Green Flak Jacket',
    body: 'The quartermaster lays a crisp olive-green tactical vest across the bench, complete with scroll pouches and reinforced shoulder plates.',
    minAge: 14,
    maxAge: 32,
    weight: 12,
    ranks: ['chunin', 'jonin'],
    options: [
      {
        id: 'pack_tactical',
        label: 'Line the chest pockets with extra wire spools, smoke tags, and antidote vials',
        statHints: ['Intel', 'Health'],
        autoEligible: true,
        onPassText: 'Every gram sits balanced over your ribs. A prepared shinobi lives longer than a flashy one.',
        onPass: { stats: { intel: 4, health: 4, ryo: -4 } },
      },
      {
        id: 'keep_light',
        label: 'Trim excess straps for maximum sprint agility',
        statHints: ['Chakra', 'Will'],
        autoEligible: true,
        onPassText: 'You test three Body Flicker bursts across the yard without a single strap snagging.',
        onPass: { stats: { chakra: 3, will: 4 } },
      },
    ],
  },
  {
    id: 'le_hotspring_recovery',
    title: 'Steam in the Border Hot Springs',
    body: 'Between deployments, a quiet sulfur spring tucked in the cedar foothills offers rare relief for aching chakra coils and old scar tissue.',
    minAge: 18,
    maxAge: 62,
    weight: 9,
    repeatable: true,
    ranks: ['genin', 'chunin', 'jonin'],
    options: [
      {
        id: 'soak_rest',
        label: 'Pay for an inn room and let every bruise mend properly',
        statHints: ['Health', 'Ryo'],
        autoEligible: true,
        onPassText: 'Mineral steam melts weeks of tension out of your shoulders.',
        onPass: { stats: { health: 9, will: 3, ryo: -6 } },
      },
      {
        id: 'listen_travelers',
        label: 'Keep your cloak dry and eavesdrop on traveling merchants',
        statHints: ['Intel'],
        autoEligible: true,
        onPassText: 'You pick up fresh rumors on border patrols and rival village supply routes.',
        onPass: { stats: { intel: 4 }, clues: 1 },
      },
    ],
  },
  {
    id: 'le_bingo_book_broker',
    title: 'Pages From an Underground Bingo Book',
    body: 'A hooded collector in a border bazaar offers you an updated copy of the continent\'s black-market Bingo Book listing S-Rank bounties and jutsu weaknesses.',
    minAge: 16,
    maxAge: 48,
    weight: 10,
    ranks: ['chunin', 'jonin'],
    options: [
      {
        id: 'buy_dossier',
        label: 'Purchase the annotated Bingo Book (-10 Ryo)',
        statHints: ['Intel', 'Ryo'],
        autoEligible: true,
        onPassText: 'Memorizing elemental counters and rogue aliases sharpens your battlefield instincts.',
        onPass: { stats: { intel: 7, ryo: -10 }, clues: 1 },
      },
      {
        id: 'decline_broker',
        label: 'Walk away before the collector remembers your face',
        statHints: ['Will'],
        autoEligible: true,
        onPassText: 'Keeping your own name out of shady ledgers is worth more than gossip.',
        onPass: { stats: { will: 3 } },
      },
    ],
  },
  {
    id: 'le_shuriken_wager',
    title: 'Blind-Corner Shuriken Challenge',
    body: 'Off-duty shinobi gather behind the red torii gate, wagering silver ryo on bouncing shuriken off stone posts to strike a hidden target.',
    minAge: 12,
    maxAge: 34,
    weight: 10,
    ranks: ['genin', 'chunin', 'jonin'],
    options: [
      {
        id: 'throw_ricochet',
        label: 'Snap a four-shuriken ricochet around the blind post',
        statHints: ['Intel', 'Ryo'],
        autoEligible: true,
        check: { label: 'Ricochet Precision', stat: 'intel', rollMax: 30, threshold: 50 },
        onPassText: 'Steel sparks off stone and pins dead center. Cheers erupt as coins slide your way.',
        onPass: { stats: { ryo: 10, intel: 3, bonds: 3 }, xpMain: 3 },
        onFailText: 'The third shuriken clips wide, costing you the wager and a round of teasing.',
        onFail: { stats: { ryo: -4, will: 2 } },
      },
      {
        id: 'watch_form',
        label: 'Watch their wrist angles quietly without betting',
        statHints: ['Intel'],
        autoEligible: true,
        onPassText: 'You pocket two crisp angle tricks without risking a single coin.',
        onPass: { stats: { intel: 3 } },
      },
    ],
  },
  {
    id: 'le_archive_night',
    title: 'Lantern Light in the Forbidden Archive',
    body: 'Pulling late guard duty outside the village scroll vault, you notice a senior archivist left an old Third Shinobi War battlefield journal open on the desk.',
    minAge: 15,
    maxAge: 42,
    weight: 10,
    ranks: ['chunin', 'jonin'],
    options: [
      {
        id: 'read_tactics',
        label: 'Study the formation notes until the morning bell rings',
        statHints: ['Intel', 'Will'],
        autoEligible: true,
        onPassText: 'Old war maps reveal how outnumbered Jonin survived encirclements through seal arrays.',
        onPass: { stats: { intel: 6, will: 2, health: -2 }, xpMain: 4 },
      },
      {
        id: 'seal_vault',
        label: 'Close the ledger untouched and lock the ward cleanly',
        statHints: ['Bonds', 'Will'],
        autoEligible: true,
        onPassText: 'The head archivist notices your discipline at dawn and adds a commendation to your record.',
        onPass: { stats: { bonds: 4, will: 3 }, leanings: { will_of_fire: 1 } },
      },
    ],
  },
  {
    id: 'le_bridge_builder',
    title: 'Escorting a Stubborn Bridge Builder',
    body: 'A weathered master carpenter hires village shinobi to guard his coastal bridge against syndicate thugs, though his trembling hands hint the danger runs far deeper than bandits.',
    minAge: 13,
    maxAge: 38,
    weight: 10,
    ranks: ['genin', 'chunin', 'jonin'],
    options: [
      {
        id: 'stay_guard_bridge',
        label: 'Refuse to abandon the town and hold the mist-wrapped bridge',
        statHints: ['Chakra', 'Bonds'],
        autoEligible: true,
        check: { label: 'Bridge Defense', stat: 'chakra', rollMax: 35, threshold: 56 },
        onPassText: 'When the mist clears, the bridge stands unbroken and the townsfolk name its span after your courage.',
        onPass: { stats: { bonds: 8, will: 5, ryo: 10, health: -4 }, xpMain: 6, leanings: { will_of_fire: 2 } },
        onFailText: 'A brutal ambush leaves deep cuts across your ribs before reinforcements force the assassins to retreat.',
        onFail: { stats: { health: -12, will: 4, bonds: 5 }, xpMain: 3 },
      },
      {
        id: 'demand_reclass',
        label: 'Report the false rank immediately and request backup',
        statHints: ['Intel'],
        autoEligible: true,
        onPassText: 'Protocol saves lives: a Jonin detachment arrives within two days to secure the crossing.',
        onPass: { stats: { intel: 4, ryo: 5 } },
      },
    ],
  },
  ...EXTRA_LIFE_EVENTS,
];

export interface GrowthEventDef {
  id: string;
  title: string;
  body: string;
  minAge: number;
  maxAge: number;
  options: LifeEventOptionDef[];
}

export const GROWTH_EVENTS: readonly GrowthEventDef[] = [
  {
    id: 'gr_roof_race',
    title: 'Race Across the Tile Roofs',
    body: 'Neighborhood kids dare each other to leap across a narrow alley between drying roofs.',
    minAge: 4,
    maxAge: 10,
    options: [
      {
        id: 'leap',
        label: 'Sprint and make the jump',
        statHints: ['Health'],
        autoEligible: true,
        onPassText: 'You land in a rolling crouch with scraped palms and a grin.',
        onPass: { stats: { health: 4, bonds: 2 } },
      },
      {
        id: 'measure',
        label: 'Pace the gap first and find a safer beam',
        statHints: ['Intel'],
        autoEligible: true,
        onPassText: 'You cross cleanly while the loudest kid slips into a laundry basket.',
        onPass: { stats: { intel: 4, will: 1 } },
      },
    ],
  },
  {
    id: 'gr_broken_kunai',
    title: 'Rusty Kunai by the Creek',
    body: 'Half-buried in river silt sits a chipped iron kunai wrapped in rotting grip cloth.',
    minAge: 4,
    maxAge: 11,
    options: [
      {
        id: 'clean_keep',
        label: 'Scrub off the rust and practice grips every evening',
        statHints: ['Health', 'Will'],
        autoEligible: true,
        onPassText: 'Calluses form early across your fingers as the iron becomes familiar weight.',
        onPass: { stats: { health: 3, will: 3 } },
      },
      {
        id: 'sell_scrap',
        label: 'Trade it to the blacksmith for coin and a hot skewer',
        statHints: ['Ryo'],
        autoEligible: true,
        onPassText: 'The smith laughs, checks the steel stamp, and drops a few copper coins in your palm.',
        onPass: { stats: { ryo: 5, bonds: 1 } },
      },
    ],
  },
  {
    id: 'gr_night_story',
    title: 'Stories of the Old Wars',
    body: 'An elderly veteran with a missing sleeve talks quietly by the hearth about shinobi who saved entire battalions.',
    minAge: 5,
    maxAge: 13,
    options: [
      {
        id: 'ask_tactics',
        label: 'Ask how they survived outnumbered ambushes',
        statHints: ['Intel'],
        autoEligible: true,
        onPassText: 'He traces formations in the ash: terrain, patience, and never trusting silence.',
        onPass: { stats: { intel: 5, will: 2 } },
      },
      {
        id: 'ask_fallen',
        label: 'Ask the names of the comrades he lost',
        statHints: ['Bonds'],
        autoEligible: true,
        onPassText: 'His voice softens. You learn early that every badge carries names behind it.',
        onPass: { stats: { bonds: 5, will: 2 }, leanings: { will_of_fire: 1 } },
      },
    ],
  },
  {
    id: 'gr_stray_dog',
    title: 'Shivering Pup Under the Eaves',
    body: 'During a late autumn storm, a skinny hound curls beneath the wooden veranda.',
    minAge: 4,
    maxAge: 12,
    options: [
      {
        id: 'share_food',
        label: 'Share half your dried fish and towel it dry',
        statHints: ['Bonds'],
        autoEligible: true,
        onPassText: 'The pup trails your footsteps to the market all season.',
        onPass: { stats: { bonds: 5, health: 1 }, setFlags: ['had_pet'] },
      },
      {
        id: 'shoo_away',
        label: 'Drive it back into the alley: winter rations are tight',
        autoEligible: true,
        onPassText: 'You shut the wooden shutter and listen to the rain alone.',
        onPass: { stats: { will: 2, ryo: 2 }, leanings: { ruthless: 1 } },
      },
    ],
  },
  {
    id: 'gr_scroll_shop',
    title: 'Dusty Tactics Primer',
    body: 'A secondhand bookstore displays an annotated map of the Five Great Nations and basic chakra theory.',
    minAge: 8,
    maxAge: 15,
    options: [
      {
        id: 'buy_book',
        label: 'Spend your allowance to study every page',
        statHints: ['Intel', 'Ryo'],
        autoEligible: true,
        onPassText: 'By spring you can sketch border rivers and nature counters from memory.',
        onPass: { stats: { intel: 6, ryo: -4 } },
      },
      {
        id: 'browse_stand',
        label: 'Read as much as you can standing by the shelf',
        statHints: ['Intel'],
        autoEligible: true,
        onPassText: 'You memorize two chapters before the clerk clears his throat.',
        onPass: { stats: { intel: 3 } },
      },
    ],
  },
  {
    id: 'gr_tree_climb',
    title: 'Walking Straight Up Cedar Bark',
    body: 'You test channeling chakra solely into the soles of your sandals to climb a sheer cedar trunk without hands.',
    minAge: 9,
    maxAge: 15,
    options: [
      {
        id: 'keep_climbing',
        label: 'Mark each fall with a kunai notch until you reach the top branch',
        statHints: ['Chakra', 'Will'],
        autoEligible: true,
        onPassText: 'Dozens of bruises later, you stand upside-down beneath the bough watching the whole village.',
        onPass: { stats: { chakra: 5, will: 3, health: -2 }, xpMain: 4 },
      },
      {
        id: 'study_balance',
        label: 'Pace your output carefully one meter at a time',
        statHints: ['Chakra', 'Intel'],
        autoEligible: true,
        onPassText: 'Steady control gets you halfway up without a single wasted drop of chakra.',
        onPass: { stats: { chakra: 3, intel: 3 }, xpMain: 2 },
      },
    ],
  },
  {
    id: 'gr_sparring_rival',
    title: 'Wooden Swords at Dusk',
    body: 'An older student from a neighboring street challenges you to first touch with practice staves.',
    minAge: 8,
    maxAge: 15,
    options: [
      {
        id: 'rush_in',
        label: 'Press forward aggressively before they set their stance',
        statHints: ['Health'],
        autoEligible: true,
        onPassText: 'Your wooden tip taps their ribs first. Both of you collapse laughing in the grass.',
        onPass: { stats: { health: 4, will: 2, bonds: 2 }, leanings: { ambition: 1 } },
      },
      {
        id: 'counter_wait',
        label: 'Wait for an overextended swing and parry cleanly',
        statHints: ['Intel', 'Will'],
        autoEligible: true,
        onPassText: 'You turn aside their strike and hold the tip an inch from their collar.',
        onPass: { stats: { intel: 3, will: 3 } },
      },
    ],
  },
  {
    id: 'gr_cold_river_vow',
    title: 'Winter Cold-Water Endurance',
    body: 'Snow collects along the river stones. Older shinobi sit knee-deep in the freezing current to steel their minds against genjutsu.',
    minAge: 10,
    maxAge: 15,
    options: [
      {
        id: 'wade_in',
        label: 'Wade in and hold the seal until numbness sets in',
        statHints: ['Will', 'Health'],
        autoEligible: true,
        onPassText: 'Your teeth chatter violently, yet panic never takes hold. Your mental guard hardens.',
        onPass: { stats: { will: 6, health: -2 } },
      },
      {
        id: 'watch_notes',
        label: 'Observe their breathing rhythm from the bank',
        statHints: ['Intel'],
        autoEligible: true,
        onPassText: 'You pick up the cadence without catching a winter fever.',
        onPass: { stats: { intel: 3, health: 1 } },
      },
    ],
  },
  ...EXTRA_GROWTH_EVENTS,
];

export interface FlavorLineDef {
  id: string;
  text: string;
  focus?: FocusId;
  minAge?: number;
  maxAge?: number;
  ranks?: ShinobiRank[];
  statusTags?: readonly StatusGateTag[];
}

export const FLAVOR_LINES: readonly FlavorLineDef[] = [
  { id: 'fl_01', text: 'Cicadas hum over the training posts while wooden targets take fresh kunai marks.', focus: 'training' },
  { id: 'fl_02', text: 'You spend rainy evenings copying hand-seal diagrams until ink stains every knuckle.', focus: 'study' },
  { id: 'fl_03', text: 'Warm broth at the corner noodle stand tastes better after a long week of drills.', focus: 'social' },
  { id: 'fl_04', text: 'Five hundred strikes on the wrapped post leave your forearms trembling and steady.', focus: 'body' },
  { id: 'fl_05', text: 'Sitting quietly beneath cedar shadows, you practice spotting ripples in your own chakra.', focus: 'mind' },
  { id: 'fl_06', text: 'Mission pay clinks cleanly in your pouch after a stretch of tedious escort and courier jobs.', focus: 'work', minAge: 12 },
  { id: 'fl_07', text: 'Seasons turn evenly: morning runs, scroll study at dusk, and quiet roofs under starlight.', focus: 'balance' },
  { id: 'fl_08', text: 'Paper lanterns drift across the canal as villagers celebrate a brief stretch of quiet borders.' },
  { id: 'fl_09', text: 'A hawk circles twice over the mission tower, carrying wax-sealed dispatches from the frontier.' },
  { id: 'fl_10', text: 'You wake before sunrise to clear frost off the training yard before anyone else arrives.', ranks: ['academy', 'genin'] },
  { id: 'fl_11', text: 'New forehead protectors catch the spring light along the academy steps.', ranks: ['academy'], maxAge: 12 },
  { id: 'fl_12', text: 'Fresh scars fade along your forearms, each one reminding you of a mistake never to repeat.', ranks: ['genin', 'chunin', 'jonin'] },
  { id: 'fl_13', text: 'Younger academy kids step aside in the street when they spot the flak jacket on your shoulders.', ranks: ['chunin', 'jonin'] },
  { id: 'fl_14', text: 'An old map in the mission desk shows border markers shifting quietly by a few kilometers.', minAge: 14 },
  { id: 'fl_15', text: 'Smoke from roasted chestnuts drifts through the autumn market while rumors of distant skirmishes circulate.' },
  { id: 'fl_16', text: 'You oil your blades by candlelight and double-check the paper tags tucked inside your pouch.', ranks: ['genin', 'chunin', 'jonin'] },
  { id: 'fl_17', text: 'Passing the memorial stone on a grey morning, you pause long enough to read three familiar names.', minAge: 16 },
  { id: 'fl_18', text: 'Winter rain hammers the tin eaves as you review counter-formations against enemy jutsu.', focus: 'study', minAge: 14 },
  { id: 'fl_19', text: 'Sharing tea with old acquaintances reminds you what lies behind the village walls.', focus: 'social', minAge: 15 },
  { id: 'fl_20', text: 'Even in peacetime, your boots stay laced beside the bed out of habit.', ranks: ['chunin', 'jonin'] },
  ...EXTRA_FLAVOR_LINES,
];

export const REFLECTION_PROMPTS: readonly { age: number; prompt: string }[] = [
  { age: 5, prompt: 'What is the earliest memory you still carry from childhood?' },
  { age: 15, prompt: 'What kind of shinobi do you swear to become?' },
  { age: 30, prompt: 'What has this shinobi world taken from you, and what remains worth protecting?' },
  { age: 50, prompt: 'Looking back across wars and quiet years, what truth would you tell a new Genin?' },
  { age: 70, prompt: 'When your name is spoken long after you are gone, how do you hope it is remembered?' },
];

export interface MissionDef {
  id: string;
  rank: 'C' | 'B' | 'A' | 'S';
  title: string;
  body: string;
  allowedRanks: ShinobiRank[];
  stat: StatKey;
  threshold: number;
  ryoReward: number;
  xpReward: number;
  failHealthLoss: number;
  deathChanceOnFail: number;
  deathCause: string;
}

export const DANGEROUS_MISSIONS: readonly MissionDef[] = [
  {
    id: 'mis_c_bandit_pass',
    rank: 'C',
    title: 'C-Rank Mission: Bandit Escort on Cedar Pass',
    body: 'A supply caravan requests shinobi protection across a ravine plagued by armed deserters.',
    allowedRanks: ['genin', 'chunin'],
    stat: 'health',
    threshold: 55,
    ryoReward: 8,
    xpReward: 4,
    failHealthLoss: 8,
    deathChanceOnFail: 0.03,
    deathCause: 'killed during a C-Rank caravan ambush',
  },
  {
    id: 'mis_b_border_recon',
    rank: 'B',
    title: 'B-Rank Mission: Mist Border Reconnaissance',
    body: 'Slip past enemy listening posts, map troop supply lines, and return before sunrise without triggering an alarm.',
    allowedRanks: ['chunin', 'jonin'],
    stat: 'intel',
    threshold: 58,
    ryoReward: 14,
    xpReward: 6,
    failHealthLoss: 12,
    deathChanceOnFail: 0.08,
    deathCause: 'cut down behind enemy lines on a B-Rank reconnaissance mission',
  },
  {
    id: 'mis_a_rogue_cell',
    rank: 'A',
    title: 'A-Rank Mission: Neutralize a Rogue Shinobi Cell',
    body: 'Three missing-nin have fortified an abandoned mine and are raiding border villages. Orders are clear: eliminate the threat.',
    allowedRanks: ['chunin', 'jonin'],
    stat: 'chakra',
    threshold: 72,
    ryoReward: 22,
    xpReward: 9,
    failHealthLoss: 18,
    deathChanceOnFail: 0.16,
    deathCause: 'slain fighting an A-Rank missing-nin cell',
  },
  {
    id: 'mis_s_vip_intercept',
    rank: 'S',
    title: 'S-Rank Mission: Intercept a Bingo Book Target',
    body: 'An infamous S-Rank operative has crossed into allied territory carrying stolen sealing scrolls. Only elite shinobi are authorized to engage.',
    allowedRanks: ['jonin'],
    stat: 'will',
    threshold: 78,
    ryoReward: 32,
    xpReward: 13,
    failHealthLoss: 24,
    deathChanceOnFail: 0.24,
    deathCause: 'fell in single combat against an S-Rank Bingo Book target',
  },
];
