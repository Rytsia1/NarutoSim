export interface MissionObjectiveTemplate {
  id: string;
  ranks: ('D' | 'C' | 'B' | 'A' | 'S')[];
  title: string;
  objective: string;
  client: string;
  constraint: string;
  baseDifficulty: number;
  ryo: number;
  xp: number;
}

export interface MissionComplicationTemplate {
  id: string;
  minRank: 'C' | 'B' | 'A' | 'S';
  title: string;
  detail: string;
  secretIntelUnlock?: boolean;
  diplomaticRisk?: boolean;
  squadDanger?: boolean;
}

export const MISSION_OBJECTIVES: readonly MissionObjectiveTemplate[] = [
  {
    id: 'obj_village_patrol',
    ranks: ['D'],
    title: 'Outer Wall Patrol & Supply Run',
    objective: 'Clear brush, repair perimeter wire, and deliver sealed supply crates',
    client: 'Village Quartermaster',
    constraint: 'Complete before nightfall with zero damaged seals',
    baseDifficulty: 24,
    ryo: 5,
    xp: 3,
  },
  {
    id: 'obj_escort_merchant',
    ranks: ['C', 'B'],
    title: 'Border Caravan Escort',
    objective: 'Escort a wealthy merchant caravan safely across the border pass',
    client: 'Civilian Merchant Guild',
    constraint: 'No civilian casualties permitted',
    baseDifficulty: 46,
    ryo: 10,
    xp: 5,
  },
  {
    id: 'obj_bridge_architect',
    ranks: ['C', 'B'],
    title: 'Bridge Architect Protection',
    objective: 'Guard a master bridge builder targeted by shipping syndicate enforcers',
    client: 'Land of Waves Bridge Guild',
    constraint: 'Keep the architect alive until the central span is sealed',
    baseDifficulty: 50,
    ryo: 12,
    xp: 6,
  },
  {
    id: 'obj_recover_cipher',
    ranks: ['B', 'A'],
    title: 'Stolen Cipher Scroll Recovery',
    objective: 'Recover an encrypted border roster stolen from an outpost courier',
    client: 'Village Intelligence Desk',
    constraint: 'Zero detection: avoid triggering a border incident',
    baseDifficulty: 58,
    ryo: 16,
    xp: 8,
  },
  {
    id: 'obj_infiltrate_depot',
    ranks: ['B', 'A'],
    title: 'Frontier Depot Reconnaissance',
    objective: 'Infiltrate a rival supply depot and catalog troop numbers and chakra tools',
    client: 'Frontline Command Council',
    constraint: 'No lethal force against treaty-nation regulars',
    baseDifficulty: 62,
    ryo: 18,
    xp: 9,
  },
  {
    id: 'obj_extract_informant',
    ranks: ['A', 'S'],
    title: 'Deep-Cover Asset Extraction',
    objective: 'Extract a compromised village informant from a rain-drenched border city',
    client: 'ANBU Operations Command',
    constraint: 'Keep the informant identity strictly concealed',
    baseDifficulty: 68,
    ryo: 24,
    xp: 11,
  },
  {
    id: 'obj_hunt_rogue',
    ranks: ['A', 'S'],
    title: 'Bingo Book Interception',
    objective: 'Track and neutralize a high-threat Missing-Nin operating near trade passes',
    client: 'Daimyo Security Ministry',
    constraint: 'Retrieve the target headband or scroll proof intact',
    baseDifficulty: 72,
    ryo: 30,
    xp: 13,
  },
  {
    id: 'obj_secret_parley',
    ranks: ['B', 'A', 'S'],
    title: 'Back-Channel Envoy Escort',
    objective: 'Escort a secret peace envoy to a neutral mountain tea house',
    client: 'Kage Diplomatic Office',
    constraint: 'Prevent rival hawks from uncovering the summit location',
    baseDifficulty: 60,
    ryo: 18,
    xp: 9,
  },
];

export const MISSION_LOCATIONS: readonly string[] = [
  'Land of Fire Cedar Border',
  'Kannabi Bridge Gorge',
  'Land of Rain Outer Towers',
  'Red Dune Caravan Pass',
  'Eastern Sea Mist Harbor',
  'Frost and Thunder Mountain Trail',
  'Three Wolves Neutral Pass',
  'River Country Fog Crossing',
  'Basalt Canyon Watch Road',
];

export const MISSION_THREATS: readonly string[] = [
  'Roaming Missing-Nin Cell',
  'Rival Village Hunter-Nin Squad',
  'Hired Mercenary Shinobi',
  'Covert Shadow Saboteurs',
  'Corrupt Border Garrison',
  'Rogue Puppeteer Ambushers',
];

export const MISSION_COMPLICATIONS: readonly MissionComplicationTemplate[] = [
  {
    id: 'comp_merchant_spy',
    minRank: 'C',
    title: 'The Client Is a Spy',
    detail: 'Halfway across the gorge, your keen eye catches hidden cipher ink tucked inside the client luggage: your employer is secretly funneling village patrol maps to a rival nation.',
    secretIntelUnlock: true,
    diplomaticRisk: true,
  },
  {
    id: 'comp_rank_falsified',
    minRank: 'C',
    title: 'Falsified Contract Rank',
    detail: 'The client lied about the danger to afford a cheaper fee. Waiting beyond the fog are battle-hardened rogue Jonin far deadlier than the briefing claimed.',
    squadDanger: true,
  },
  {
    id: 'comp_refugee_target',
    minRank: 'B',
    title: 'Desperate Refugee Target',
    detail: 'When you corner the quarry, they are no ruthless killer, only a wounded border defector carrying stolen medicine for a starving village.',
    diplomaticRisk: true,
  },
  {
    id: 'comp_root_doublecross',
    minRank: 'B',
    title: 'Shadow Division Double-Cross',
    detail: 'Masked operatives from your own nation shadow division intercept the trail with sealed orders to silence every witness, including your client.',
    secretIntelUnlock: true,
    squadDanger: true,
  },
  {
    id: 'comp_paper_bomb_hostage',
    minRank: 'B',
    title: 'Rigged Civilian Hostage',
    detail: 'The enemy commander holds a bound civilian wrapped in live paper bombs, daring you to choose between the mission scroll and an innocent life.',
    squadDanger: true,
  },
  {
    id: 'comp_rival_army_prep',
    minRank: 'A',
    title: 'Hidden Mobilization Cache',
    detail: 'Behind a false rock wall you uncover crates of siege tags and invasion timetables proving a rival nation is preparing a surprise border strike.',
    secretIntelUnlock: true,
    diplomaticRisk: true,
  },
];
