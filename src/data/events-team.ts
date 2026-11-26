import type { CrisisId, LeaningKey, StatKey, TraitId } from '../sim/types';

export interface SenseiArchetype {
  id: string;
  label: string;
  traits: TraitId[];
  specialties: string[];
  introLine: string;
}

export interface TeammateArchetype {
  id: string;
  label: string;
  traits: TraitId[];
  specialties: string[];
  introLine: string;
}

export const SENSEI_ARCHETYPES: readonly SenseiArchetype[] = [
  {
    id: 'quiet_veteran',
    label: 'Scarred Veteran',
    traits: ['loyalty', 'honor'],
    specialties: ['lightning_release', 'kenjutsu', 'silent_killing', 'sensory'],
    introLine: 'Arrives ten minutes late with half-closed eyes, yet moves faster than anyone in the clearing.',
  },
  {
    id: 'strict_tactician',
    label: 'Strict Tactician',
    traits: ['honor', 'ambition'],
    specialties: ['fuinjutsu', 'earth_release', 'trap_craft', 'barrier'],
    introLine: 'Measures every student by posture and discipline before uttering a single word of praise.',
  },
  {
    id: 'warm_protector',
    label: 'Field Medic Veteran',
    traits: ['compassion', 'loyalty'],
    specialties: ['medical', 'water_release', 'genjutsu', 'summoning'],
    introLine: 'Insists that keeping your squadmates breathing matters more than any mission medal.',
  },
  {
    id: 'fierce_brawler',
    label: 'Relentless Taijutsu Master',
    traits: ['honor', 'freedom'],
    specialties: ['strong_fist', 'fire_release', 'wind_release', 'shurikenjutsu'],
    introLine: 'Greets the squad with a booming laugh and fifty laps around the village perimeter.',
  },
];

export const TEAMMATE_ARCHETYPES: readonly TeammateArchetype[] = [
  {
    id: 'proud_prodigy',
    label: 'Proud Prodigy',
    traits: ['ambition', 'honor'],
    specialties: ['fire_release', 'lightning_release', 'kenjutsu', 'gentle_fist'],
    introLine: 'Top of the academy sparring bracket, impatient with anyone who slows the squad down.',
  },
  {
    id: 'loyal_heart',
    label: 'Steadfast Comrade',
    traits: ['compassion', 'loyalty'],
    specialties: ['medical', 'water_release', 'barrier', 'earth_release'],
    introLine: 'Always carries extra bandages and checks on everyone before resting.',
  },
  {
    id: 'sharp_schemer',
    label: 'Quiet Strategist',
    traits: ['freedom', 'loyalty'],
    specialties: ['trap_craft', 'genjutsu', 'sensory', 'fuinjutsu'],
    introLine: 'Complains about hard drills, yet somehow predicts every ambush three moves ahead.',
  },
  {
    id: 'loud_underdog',
    label: 'Defiant Underdog',
    traits: ['freedom', 'compassion'],
    specialties: ['shadow_clone', 'strong_fist', 'wind_release', 'shurikenjutsu'],
    introLine: 'Refuses to back down from any fight and treats every rival as a promise to grow stronger.',
  },
];

export interface TeamEventOptionDef {
  id: string;
  label: string;
  sublabel?: string;
  statHints?: string[];
  autoEligible: boolean;
  stats?: Partial<Record<StatKey, number>>;
  leanings?: Partial<Record<LeaningKey, number>>;
  xpMain?: number;
  trustSensei: number;
  trustTeammates: number;
  traitBonus?: Partial<Record<TraitId, number>>;
  unlockFragment?: boolean;
  resultText: string;
}

export interface TeamEventDef {
  id: string;
  title: string;
  body: string;
  onlyActiveTeam: boolean;
  options: TeamEventOptionDef[];
}

export const TEAM_EVENTS: readonly TeamEventDef[] = [
  {
    id: 'te_d_rank_chores',
    title: 'D-Rank Chaos in the Village Orchard',
    body: 'Your squad is assigned to catch a runaway prize cat and weed three terraced gardens before sundown. One teammate already wants to ditch the job for real sparring.',
    onlyActiveTeam: true,
    options: [
      {
        id: 'coordinate_trap',
        label: 'Split into a three-point net and finish cleanly together',
        statHints: ['Intel', 'Bonds'],
        autoEligible: true,
        stats: { intel: 2, bonds: 3, ryo: 3 },
        trustSensei: 6,
        trustTeammates: 5,
        traitBonus: { loyalty: 3, honor: 2 },
        unlockFragment: true,
        resultText: 'With hand signals and a quick encirclement, the cat is caught without a scratch. Sensei notes your coordination.',
      },
      {
        id: 'solo_catch',
        label: 'Dash ahead alone and snag the target first',
        statHints: ['Health'],
        autoEligible: true,
        stats: { health: 2, ryo: 3 },
        leanings: { ambition: 1 },
        trustSensei: -2,
        trustTeammates: -2,
        traitBonus: { ambition: 3, freedom: 2, loyalty: -3 },
        resultText: 'You vault the wall and grab the furious cat yourself, earning scratched arms and annoyed looks from the squad.',
      },
      {
        id: 'laugh_share',
        label: 'Turn the chore into a contest and buy snacks after',
        statHints: ['Bonds', 'Ryo'],
        autoEligible: true,
        stats: { bonds: 4, ryo: -2 },
        trustSensei: 3,
        trustTeammates: 7,
        traitBonus: { compassion: 3, freedom: 2 },
        unlockFragment: true,
        resultText: 'Laughter carries down the hillside as the squad shares dumplings on the riverbank.',
      },
    ],
  },
  {
    id: 'te_sensei_sparring',
    title: 'Special Drill with Sensei',
    body: 'After sunset, your Jonin Sensei offers extra personal instruction in their signature style, warning that the drill will push your chakra to the edge.',
    onlyActiveTeam: true,
    options: [
      {
        id: 'endure_drill',
        label: 'Push through every round until your legs give out',
        statHints: ['Chakra', 'Health'],
        autoEligible: true,
        stats: { chakra: 4, will: 3, health: -3 },
        xpMain: 6,
        trustSensei: 8,
        trustTeammates: 2,
        traitBonus: { honor: 3, ambition: 2 },
        unlockFragment: true,
        resultText: 'Sensei catches your final strike with one hand and nods slowly. Real technique sinks into your muscles.',
      },
      {
        id: 'ask_team_combo',
        label: 'Ask Sensei to teach a squad cover-formation instead',
        statHints: ['Intel', 'Bonds'],
        autoEligible: true,
        stats: { intel: 3, bonds: 4 },
        xpMain: 3,
        trustSensei: 5,
        trustTeammates: 7,
        traitBonus: { loyalty: 4, compassion: 2 },
        unlockFragment: true,
        resultText: 'Your teammates join under the lantern light, drilling blind-spot cover until every step clicks.',
      },
    ],
  },
  {
    id: 'te_c_rank_dilemma',
    title: 'Squad Crossroads: Mission Scroll or Wounded Ally',
    body: 'During a tense C-Rank border delivery, a hidden snare injures one of your teammates while enemy scouts close in on the ridge.',
    onlyActiveTeam: true,
    options: [
      {
        id: 'carry_teammate',
        label: 'Drop the decoy pack and carry your teammate to safety',
        statHints: ['Bonds', 'Health'],
        autoEligible: true,
        stats: { bonds: 5, will: 3, health: -4 },
        leanings: { will_of_fire: 2 },
        trustSensei: 7,
        trustTeammates: 10,
        traitBonus: { compassion: 4, loyalty: 4 },
        unlockFragment: true,
        resultText: 'You refuse to leave anyone behind. Together with Sensei covering the rear, the entire squad makes it back.',
      },
      {
        id: 'complete_objective',
        label: 'Secure the sealed dispatch first and hold the ridge',
        statHints: ['Intel', 'Will'],
        autoEligible: true,
        stats: { intel: 4, ryo: 6, bonds: -2 },
        leanings: { ruthless: 2 },
        trustSensei: 2,
        trustTeammates: -5,
        traitBonus: { ambition: 3, compassion: -4 },
        resultText: 'The scroll reaches headquarters on time, though the silence at dinner afterward hangs heavy.',
      },
    ],
  },
  {
    id: 'te_campfire_secrets',
    title: 'Rainbound Campfire Watch',
    body: 'Pinned inside a mountain cave by a spring cloudburst, your squad shares dry rations and quiet stories about why each of you took the headband.',
    onlyActiveTeam: true,
    options: [
      {
        id: 'open_up',
        label: 'Share your true reason for becoming a shinobi',
        statHints: ['Bonds', 'Will'],
        autoEligible: true,
        stats: { bonds: 5, will: 2 },
        trustSensei: 5,
        trustTeammates: 8,
        traitBonus: { loyalty: 3, compassion: 3 },
        unlockFragment: true,
        resultText: 'For the first time, the squad feels less like an assignment and more like family.',
      },
      {
        id: 'take_first_watch',
        label: 'Keep your past private and volunteer for double perimeter watch',
        statHints: ['Will', 'Intel'],
        autoEligible: true,
        stats: { will: 4, intel: 2, health: -1 },
        trustSensei: 4,
        trustTeammates: 2,
        traitBonus: { honor: 2, freedom: 2 },
        resultText: 'You sit at the cave mouth listening to the storm while your squad sleeps safely behind you.',
      },
    ],
  },
  {
    id: 'te_ramen_wager',
    title: 'Post-Drill Ramen Wager',
    body: 'After three brutal hours of water-walking drills, your rival dares the entire squad to a kunai accuracy contest where the loser buys hot miso ramen for everyone.',
    onlyActiveTeam: true,
    options: [
      {
        id: 'accept_wager',
        label: 'Step up to the chalk line and aim for the center knot',
        statHints: ['Intel', 'Bonds'],
        autoEligible: true,
        stats: { intel: 3, bonds: 4, ryo: -2 },
        xpMain: 3,
        trustSensei: 3,
        trustTeammates: 8,
        traitBonus: { honor: 3, freedom: 2 },
        unlockFragment: true,
        resultText: 'Your kunai splits the edge of your rival\'s mark. Nobody settles who truly won, so Sensei picks up the tab laughing.',
      },
      {
        id: 'split_bill',
        label: 'Skip the contest and treat your exhausted squadmates directly',
        statHints: ['Bonds', 'Ryo'],
        autoEligible: true,
        stats: { bonds: 6, ryo: -4 },
        trustSensei: 5,
        trustTeammates: 9,
        traitBonus: { compassion: 4, loyalty: 3 },
        resultText: 'Steaming bowls vanish in minutes while the whole team argues cheerfully over hand-seal shortcuts.',
      },
    ],
  },
  {
    id: 'te_sensei_late',
    title: 'Two Hours Late at the Bridge',
    body: 'Dawn turns into mid-morning on the wooden training bridge and Sensei still has not shown up. Your rival begins pacing furiously.',
    onlyActiveTeam: true,
    options: [
      {
        id: 'run_self_drill',
        label: 'Use the wait to drill combo footwork with your squadmates',
        statHints: ['Chakra', 'Will'],
        autoEligible: true,
        stats: { chakra: 3, will: 2 },
        xpMain: 4,
        trustSensei: 7,
        trustTeammates: 5,
        traitBonus: { loyalty: 3, honor: 2 },
        resultText: 'When Sensei finally arrives with a flimsy excuse about a black cat, they notice your sweat-soaked sleeves and smile quietly.',
      },
      {
        id: 'set_prank_trap',
        label: 'Rig a harmless chalk-duster wire trap over the bridge post',
        statHints: ['Intel', 'Bonds'],
        autoEligible: true,
        stats: { intel: 2, bonds: 4 },
        trustSensei: 2,
        trustTeammates: 7,
        traitBonus: { freedom: 4 },
        resultText: 'Sensei sidesteps the trap without looking up from a pocket novel, leaving the whole squad groaning and laughing.',
      },
    ],
  },
  {
    id: 'te_combo_jutsu',
    title: 'Synchronizing Elemental Combo Jutsu',
    body: 'Sensei challenges the three of you to combine your chakra natures into a single synchronized wave across the clearing.',
    onlyActiveTeam: true,
    options: [
      {
        id: 'anchor_timing',
        label: 'Match your breathing to your teammates\' hand-seal cadence',
        statHints: ['Chakra', 'Bonds'],
        autoEligible: true,
        stats: { chakra: 4, bonds: 4 },
        xpMain: 5,
        trustSensei: 7,
        trustTeammates: 8,
        traitBonus: { loyalty: 4, honor: 2 },
        unlockFragment: true,
        resultText: 'Two natures merge in a roaring arc that scorches the practice stumps clean. Even your rival nods in grudging respect.',
      },
      {
        id: 'overpower_lead',
        label: 'Pour maximum chakra forward and force the team to follow your lead',
        statHints: ['Chakra', 'Will'],
        autoEligible: true,
        stats: { chakra: 5, will: 2, health: -2 },
        leanings: { ambition: 1 },
        trustSensei: 2,
        trustTeammates: -1,
        traitBonus: { ambition: 4 },
        resultText: 'Your output impresses the instructors, though the wave fractures before your squadmates can link in.',
      },
    ],
  },
  {
    id: 'te_missing_courier',
    title: 'Tracking a Lost Border Dog',
    body: 'A village tracking hound bolts into the mist-choked cedar woods carrying a weather-sealed pouch. Sensei lets the three Genin lead the search.',
    onlyActiveTeam: true,
    options: [
      {
        id: 'fan_out_signals',
        label: 'Use bird-call whistle codes to sweep the ravine systematically',
        statHints: ['Intel', 'Bonds'],
        autoEligible: true,
        stats: { intel: 4, bonds: 3, ryo: 4 },
        trustSensei: 7,
        trustTeammates: 6,
        traitBonus: { loyalty: 3, honor: 3 },
        resultText: 'You locate the hound tangled in wild brambles within an hour and return the intact dispatch pouch.',
      },
      {
        id: 'sprint_ridge',
        label: 'Dash along the high canopy alone to cut off its path',
        statHints: ['Health', 'Will'],
        autoEligible: true,
        stats: { health: 3, will: 3, ryo: 3 },
        trustSensei: 3,
        trustTeammates: 1,
        traitBonus: { freedom: 3, ambition: 2 },
        resultText: 'You drop onto the trail ahead of the hound with torn sleeves and a satisfied grin.',
      },
    ],
  },
  {
    id: 'te_bridge_watch',
    title: 'Night Watch on the Foggy Bridge',
    body: 'Escorting a timber convoy across a border gorge, your squad spots three cold cooking fires glowing on the far ridge after midnight.',
    onlyActiveTeam: true,
    options: [
      {
        id: 'rotate_sentries',
        label: 'Double up sentry pairs and lace the bridge rails with tripwire bells',
        statHints: ['Intel', 'Will'],
        autoEligible: true,
        stats: { intel: 3, will: 4, ryo: 5 },
        trustSensei: 8,
        trustTeammates: 6,
        traitBonus: { loyalty: 3, honor: 3 },
        unlockFragment: true,
        resultText: 'When bandits test the approaches at 3 AM, the bells ring out and your squad drives them off without a single casualty.',
      },
      {
        id: 'preempt_scouts',
        label: 'Creep across the gorge to scatter their scouts before dawn',
        statHints: ['Chakra', 'Health'],
        autoEligible: true,
        stats: { chakra: 3, health: -2, will: 4, ryo: 6 },
        leanings: { ruthless: 1 },
        trustSensei: 3,
        trustTeammates: 4,
        traitBonus: { ambition: 3 },
        resultText: 'Two flash tags scatter the ambushers into the dark, though Sensei warns against outrunning your cover.',
      },
    ],
  },
  {
    id: 'te_field_triage_drill',
    title: 'Sudden Poison-Thorn Ambush Drill',
    body: 'Sensei tosses live smoke bombs during a routine hike and declares one teammate "critically poisoned," timing how fast you stabilize and extract them.',
    onlyActiveTeam: true,
    options: [
      {
        id: 'calm_triage',
        label: 'Apply a clean tourniquet and coordinate a two-person carry',
        statHints: ['Intel', 'Bonds'],
        autoEligible: true,
        stats: { intel: 3, bonds: 5, health: 2 },
        trustSensei: 8,
        trustTeammates: 9,
        traitBonus: { compassion: 4, loyalty: 4 },
        resultText: 'Sensei clicks the stopwatch shut with quiet pride. Every second shaved here buys a life in real combat.',
      },
      {
        id: 'decoy_counter',
        label: 'Leave a clone decoy and counter-rush Sensei\'s smoke screen',
        statHints: ['Chakra', 'Will'],
        autoEligible: true,
        stats: { chakra: 4, will: 3 },
        trustSensei: 5,
        trustTeammates: 3,
        traitBonus: { ambition: 3, freedom: 2 },
        resultText: 'Your decoy buys the squad precious breathing room, earning a rare chuckle from behind Sensei\'s mask.',
      },
    ],
  },
  {
    id: 'te_daimyo_heir',
    title: 'Guarding a Runaway Noble Heir',
    body: 'A spoiled provincial heir slips away from your C-Rank escort to explore the night lantern stalls, putting the contract at risk.',
    onlyActiveTeam: true,
    options: [
      {
        id: 'blend_crowd',
        label: 'Disguise the squad in festival cloaks and shadow them discreetly',
        statHints: ['Intel', 'Bonds'],
        autoEligible: true,
        stats: { intel: 4, ryo: 7, bonds: 3 },
        trustSensei: 7,
        trustTeammates: 6,
        traitBonus: { honor: 3, compassion: 2 },
        resultText: 'The heir enjoys two hours of freedom without ever spotting the three Genin quietly intercepting two pickpockets.',
      },
      {
        id: 'haul_back',
        label: 'Intercept them immediately and march them back to the inn',
        statHints: ['Will', 'Ryo'],
        autoEligible: true,
        stats: { will: 3, ryo: 5, bonds: -1 },
        leanings: { ruthless: 1 },
        trustSensei: 4,
        trustTeammates: 1,
        traitBonus: { honor: 2 },
        resultText: 'The client complains loudly, yet the contract closes without a scratch on their cloak.',
      },
    ],
  },
  {
    id: 'te_rooftop_promise',
    title: 'Sunset on the Village Rooftops',
    body: 'With dust still drying on your vests after a week of non-stop missions, your squad sits along the red tile ridge watching village lanterns flicker awake below.',
    onlyActiveTeam: true,
    options: [
      {
        id: 'vow_summit',
        label: 'Promise to push one another until all three reach the summit',
        statHints: ['Bonds', 'Will'],
        autoEligible: true,
        stats: { bonds: 6, will: 4 },
        leanings: { will_of_fire: 1 },
        trustSensei: 6,
        trustTeammates: 10,
        traitBonus: { loyalty: 4, honor: 3 },
        unlockFragment: true,
        resultText: 'Orange dusk light catches three forehead protectors side by side. Years later, you will still remember this quiet breeze.',
      },
      {
        id: 'challenge_rival',
        label: 'Point at your rival and swear you will surpass them first',
        statHints: ['Chakra', 'Will'],
        autoEligible: true,
        stats: { chakra: 4, will: 4 },
        xpMain: 4,
        leanings: { ambition: 1 },
        trustSensei: 4,
        trustTeammates: 6,
        traitBonus: { ambition: 4, honor: 2 },
        unlockFragment: true,
        resultText: 'Your rival smirks and bumps your shoulder. "Try keeping up at the Chunin Exams first."',
      },
    ],
  },
];

export interface CrisisWhisperDef {
  id: string;
  crisisId: Exclude<CrisisId, 'none'>;
  title: string;
  body: string;
  clueThresholdIntel: number;
  clueFoundText: string;
  clueMissedText: string;
}

export const CRISIS_WHISPERS: readonly CrisisWhisperDef[] = [
  // Calamity (Tailed-Beast / Forbidden Seal Rampage)
  {
    id: 'cw_calamity_1',
    crisisId: 'calamity',
    title: 'Tremors Beneath the Seal Valley',
    body: 'Border couriers report livestock fleeing the mountain shrines and crimson static crackling through old barrier stones at dusk.',
    clueThresholdIntel: 35,
    clueFoundText: 'Tracing the barrier resonance, you identify fractures matching ancient tailed-beast containment formulas. You log the coordinates.',
    clueMissedText: 'Most villagers dismiss the tremors as an ordinary mountain quake, though the air smells faintly of ozone.',
  },
  {
    id: 'cw_calamity_2',
    crisisId: 'calamity',
    title: 'Missing Seal-Keepers',
    body: 'Two senior Fuinjutsu wardens vanish from a neutral shrine without a drop of blood spilled, leaving only scorched chakra chains in the dust.',
    clueThresholdIntel: 48,
    clueFoundText: 'You cross-reference the scorched pattern with forbidden unsealing rituals: someone is deliberately bleeding a great seal dry.',
    clueMissedText: 'Headquarters seals the dossier before you can read past the cover sheet.',
  },
  {
    id: 'cw_calamity_3',
    crisisId: 'calamity',
    title: 'Red Moon Over the River',
    body: 'Sensory shinobi across three borders wake simultaneously with nosebleeds, describing a monstrous chakra heartbeat echoing far underground.',
    clueThresholdIntel: 58,
    clueFoundText: 'By triangulating the pulse timing, you map the exact fault line where a calamity would erupt.',
    clueMissedText: 'By sunrise the sensation fades, leaving only restless whispers in the barracks.',
  },

  // Mastermind (Akatsuki Conspiracy)
  {
    id: 'cw_mastermind_1',
    crisisId: 'mastermind',
    title: 'Identical Orders on Both Sides',
    body: 'A captured dispatch from a rival village bears the same coded watermark you once saw on a black-market bounty in your own territory.',
    clueThresholdIntel: 35,
    clueFoundText: 'The cipher grammar is identical. Akatsuki brokers are feeding intelligence to both villages to prolong hostilities.',
    clueMissedText: 'The ink smudges in the rain before you can verify whether it is coincidence or forgery.',
  },
  {
    id: 'cw_mastermind_2',
    crisisId: 'mastermind',
    title: 'Red Clouds in the Amegakure Rain',
    body: 'Merchants from the Land of Rain whisper of S-Rank missing-nin in black cloaks stitched with red clouds hunting five ancient Bijuu-sealing relics.',
    clueThresholdIntel: 48,
    clueFoundText: 'You piece together the locations of two relic vaults Akatsuki has already raided, noting their operational pattern.',
    clueMissedText: 'Every witness gives a contradictory description of the cloaked Akatsuki operatives, making verification impossible.',
  },
  {
    id: 'cw_mastermind_3',
    crisisId: 'mastermind',
    title: 'Names Crossed Off the Bingo Book',
    body: 'Several elite shinobi from different nations vanish in a single week, replaced by quiet rumors of Akatsuki pulling strings behind every Great Village.',
    clueThresholdIntel: 58,
    clueFoundText: 'You isolate Akatsuki\'s relay network out of Amegakure and prepare countermeasures should their masked leader finally step into the open.',
    clueMissedText: 'The village elders deny any coordinated Akatsuki conspiracy, blaming ordinary border friction.',
  },
];
