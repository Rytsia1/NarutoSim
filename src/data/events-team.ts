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

  // Mastermind (Shadow Conspiracy)
  {
    id: 'cw_mastermind_1',
    crisisId: 'mastermind',
    title: 'Identical Orders on Both Sides',
    body: 'A captured dispatch from a rival village bears the same coded watermark you once saw on a black-market bounty in your own territory.',
    clueThresholdIntel: 35,
    clueFoundText: 'The cipher grammar is identical. An unseen third hand is feeding intelligence to both villages to prolong hostilities.',
    clueMissedText: 'The ink smudges in the rain before you can verify whether it is coincidence or forgery.',
  },
  {
    id: 'cw_mastermind_2',
    crisisId: 'mastermind',
    title: 'The Masked Envoy in the Rain',
    body: 'Merchants from the minor nations whisper of a hooded recruiter gathering S-Rank missing-nin and hunting five ancient chakra relics.',
    clueThresholdIntel: 48,
    clueFoundText: 'You piece together the locations of two relic vaults they have already raided, noting their operational pattern.',
    clueMissedText: 'Every witness gives a contradictory description of the envoy, making verification impossible.',
  },
  {
    id: 'cw_mastermind_3',
    crisisId: 'mastermind',
    title: 'Names Crossed Off the Bingo Book',
    body: 'Several elite shinobi from different nations vanish in a single week, replaced by quiet rumors of a shadow syndicate pulling every Kage string.',
    clueThresholdIntel: 58,
    clueFoundText: 'You isolate the syndicate’s relay network and prepare countermeasures should their mastermind finally step into the open.',
    clueMissedText: 'The village elders deny any coordinated conspiracy, blaming ordinary border friction.',
  },
];
