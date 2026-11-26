import type {
  AcademyDoctrine,
  ChakraElement,
  StatKey,
  VillageId,
  VillagePolicy,
} from '../sim/types';

export interface VillagePerk {
  label: string;
  stat?: StatKey;
  disciplineId?: string;
}

export interface VillageInstitutionsDef {
  shadowOrgName: string;
  shadowOrgDesc: string;
  academyDoctrine: AcademyDoctrine;
  academyLabel: string;
  academyGradOffset: number; // positive = harder/stricter exam, negative = supportive
  hospitalBaseline: number;  // 0..100
  daimyoFundingBaseline: number; // 0..100
  daimyoVolatility: number;  // 0..1 higher = more prone to budget cuts
  bloodlineSuspicion: boolean; // e.g., Kirigakure Bloody Mist era
}

export interface VillageDef {
  id: VillageId;
  name: string;
  region: string;
  tier: 'great' | 'minor';
  dominantElement: ChakraElement;
  kageTitle: string;
  perk: VillagePerk;
  flavor: string;
  history: string;
  culture: string;
  militaryPolicy: VillagePolicy;
  politicalInterests: string;
  institutions: VillageInstitutionsDef;
  surnames: readonly string[];
  maleNames: readonly string[];
  femaleNames: readonly string[];
}

export const VILLAGES: readonly VillageDef[] = [
  {
    id: 'konoha',
    name: 'Konohagakure',
    region: 'Land of Fire',
    tier: 'great',
    dominantElement: 'fire',
    kageTitle: 'Hokage',
    perk: { label: 'Will of Fire (+1 Bonds/yr)', stat: 'bonds' },
    flavor: 'Hidden among ancient cedar canopies beneath carved stone faces.',
    history: 'Founded by an alliance of rival clans, Konoha anchors continental diplomacy while managing deep internal rivalries between noble houses and shadow elders.',
    culture: 'Will of Fire: teamwork-first Academy, largest Shinobi Hospital network, and coalition politics among proud founding clans.',
    militaryPolicy: 'diplomatic',
    politicalInterests: 'Preserve multi-clan unity, maintain fertile Fire trade corridors, and deter Kumo and Iwa expansion.',
    institutions: {
      shadowOrgName: 'Root (Foundation)',
      shadowOrgDesc: 'Secretive underground black-ops division operating beyond the Hokage council to crush threats preemptively.',
      academyDoctrine: 'teamwork',
      academyLabel: 'Will of Fire Squad Academy',
      academyGradOffset: -4,
      hospitalBaseline: 84,
      daimyoFundingBaseline: 78,
      daimyoVolatility: 0.25,
      bloodlineSuspicion: false,
    },
    surnames: ['Sarutobi', 'Nara', 'Akimichi', 'Yamanaka', 'Inuzuka', 'Aburame', 'Shimura', 'Hatake', 'Morino', 'Gekko'],
    maleNames: ['Ren', 'Hayato', 'Kenji', 'Sora', 'Daiki', 'Toma', 'Haruki', 'Shun', 'Kaito', 'Yuta'],
    femaleNames: ['Hana', 'Aoi', 'Yumi', 'Sakura', 'Rin', 'Mei', 'Natsuki', 'Kana', 'Emi', 'Chihiro'],
  },
  {
    id: 'suna',
    name: 'Sunagakure',
    region: 'Land of Wind',
    tier: 'great',
    dominantElement: 'wind',
    kageTitle: 'Kazekage',
    perk: { label: 'Puppet Brigade (+2 Puppetry XP / +1 Intel/yr)', stat: 'intel', disciplineId: 'puppetry' },
    flavor: 'A sandstone fortress carved inside desert cliffs where every drop of water counts.',
    history: 'Forged in arid scarcity, Sunagakure relies on elite individual quality, puppetry, and venom mastery whenever the Wind Daimyo diverts contracts abroad.',
    culture: 'Desert Austerity: lean, resourceful forces where tactical invention and survival discipline outweigh raw numbers.',
    militaryPolicy: 'defensive',
    politicalInterests: 'Secure Wind Daimyo funding, protect oasis trade caravans, and avoid being economically strangled by Konoha.',
    institutions: {
      shadowOrgName: 'Puppet Counter-Intel',
      shadowOrgDesc: 'Covert desert spies and poison artisans watching border caravans and foreign contractors.',
      academyDoctrine: 'austerity_craft',
      academyLabel: 'Oasis Survival & Craft Academy',
      academyGradOffset: 3,
      hospitalBaseline: 64,
      daimyoFundingBaseline: 52,
      daimyoVolatility: 0.65,
      bloodlineSuspicion: false,
    },
    surnames: ['Kazekawa', 'Sabaku', 'Sajin', 'Tatsumaki', 'Retsu', 'Arashi', 'Kagero', 'Shirogane'],
    maleNames: ['Baki', 'Kankuro', 'Zaji', 'Rasa', 'Shinki', 'Goro', 'Yashamaru', 'Tetsu'],
    femaleNames: ['Temari', 'Maki', 'Sari', 'Pakura', 'Yodo', 'Karura', 'Nemu', 'Sana'],
  },
  {
    id: 'kiri',
    name: 'Kirigakure',
    region: 'Land of Water',
    tier: 'great',
    dominantElement: 'water',
    kageTitle: 'Mizukage',
    perk: { label: 'Bloody Mist Discipline (+1 Will/yr)', stat: 'will', disciplineId: 'kenjutsu' },
    flavor: 'Shrouded in salt fog and steep cliffs where silent blades settle disputes.',
    history: 'Scarred by island civil wars and paranoid isolation, Kirigakure stands torn between ruthless Bloody Mist traditionalists and modernizing reformers.',
    culture: 'Bloody Mist & Silent Blades: brutal Academy proving grounds, elite Hunter-Nin corpse squads, and suspicion of hereditary bloodlines.',
    militaryPolicy: 'isolationist',
    politicalInterests: 'Police maritime straits, eliminate defectors without leaving traces, and resolve the struggle over Bloody Mist reforms.',
    institutions: {
      shadowOrgName: 'Mist Hunter-Nin Corps',
      shadowOrgDesc: 'Masked executioners who track Missing-Nin relentlessly and erase every trace of stolen secrets.',
      academyDoctrine: 'bloody_mist',
      academyLabel: 'Bloody Mist Proving Grounds',
      academyGradOffset: 10,
      hospitalBaseline: 58,
      daimyoFundingBaseline: 64,
      daimyoVolatility: 0.4,
      bloodlineSuspicion: true,
    },
    surnames: ['Hozuki', 'Momochi', 'Hoshigaki', 'Terumi', 'Karatachi', 'Kaguya', 'Yuki', 'Suiren'],
    maleNames: ['Suigetsu', 'Chojuro', 'Ao', 'Mangetsu', 'Kiriya', 'Raiga', 'Shizuma', 'Haku'],
    femaleNames: ['Mei', 'Misuno', 'Tsubaki', 'Nami', 'Buntan', 'Kagura', 'Kasumi', 'Rina'],
  },
  {
    id: 'kumo',
    name: 'Kumogakure',
    region: 'Land of Lightning',
    tier: 'great',
    dominantElement: 'lightning',
    kageTitle: 'Raikage',
    perk: { label: 'Thunder Drills (+1 Chakra/yr)', stat: 'chakra', disciplineId: 'lightning_release' },
    flavor: 'Perched above thunderheads on alpine peaks, prized for speed and relentless drills.',
    history: 'Backed by a wealthy, hawkish Daimyo, Kumogakure never disarmed after past wars and continuously expands its speed, swordsmanship, and intel reach.',
    culture: 'Thunder Supremacy: relentless high-tempo drills, strong military treasury, and fierce pride in martial dominance.',
    militaryPolicy: 'expansionist',
    politicalInterests: 'Expand alpine influence, acquire rival jutsu and bloodline intelligence, and outpace Konoha and Iwa in military readiness.',
    institutions: {
      shadowOrgName: 'Cloud Vanguard Intel',
      shadowOrgDesc: 'Aggressive border acquisition units running deep-cover extraction and sabotage operations.',
      academyDoctrine: 'thunder_drills',
      academyLabel: 'Cloud Peak Speed Academy',
      academyGradOffset: 4,
      hospitalBaseline: 72,
      daimyoFundingBaseline: 84,
      daimyoVolatility: 0.2,
      bloodlineSuspicion: false,
    },
    surnames: ['Yotsuki', 'Chinoike', 'Raikou', 'Kaminari', 'Darui', 'Toroi', 'Kurogane'],
    maleNames: ['Omoi', 'Cee', 'Atsui', 'Jay', 'Motoi', 'Dodai', 'Karai', 'Riku'],
    femaleNames: ['Karui', 'Samui', 'Mabui', 'Yugito', 'Sora', 'Kira', 'Tamae', 'Ayane'],
  },
  {
    id: 'iwa',
    name: 'Iwagakure',
    region: 'Land of Earth',
    tier: 'great',
    dominantElement: 'earth',
    kageTitle: 'Tsuchikage',
    perk: { label: 'Will of Stone (+1 Health/yr)', stat: 'health', disciplineId: 'earth_release' },
    flavor: 'Built from layered canyon basalt where stubborn will outlasts any siege.',
    history: 'Hardened by mountain sieges and long blood feuds with Konoha and Kumo, Iwagakure prizes unyielding resolve and pragmatic covert contracts.',
    culture: 'Will of Stone: fortress endurance, Demolition Corps warfare, and long institutional memories for past grievances.',
    militaryPolicy: 'defensive',
    politicalInterests: 'Fortify canyon passes, dominate strategic bridges in the Land of Grass and Rain, and check Konoha and Kumo power.',
    institutions: {
      shadowOrgName: 'Demolition Saboteurs',
      shadowOrgDesc: 'Underground tunnelers and covert contractors who undermine enemy supply lines and hire rogue mercenaries.',
      academyDoctrine: 'fortress_stone',
      academyLabel: 'Canyon Bastion Academy',
      academyGradOffset: 5,
      hospitalBaseline: 68,
      daimyoFundingBaseline: 72,
      daimyoVolatility: 0.3,
      bloodlineSuspicion: false,
    },
    surnames: ['Kamizuru', 'Ishikawa', 'Iwagane', 'Taketori', 'Doryu', 'Gari', 'Roshi'],
    maleNames: ['Kitsuchi', 'Deidara', 'Akatsuchi', 'Mahiru', 'Taiseki', 'Kakkou', 'Sekki', 'Ganryu'],
    femaleNames: ['Kurotsuchi', 'Suzumebachi', 'Kozu', 'Tama', 'Iwae', 'Hina', 'Roka', 'Mina'],
  },
  {
    id: 'ame',
    name: 'Amegakure',
    region: 'Land of Rain',
    tier: 'minor',
    dominantElement: 'water',
    kageTitle: 'Amegakure Leader',
    perk: { label: 'Rain-Watch Vigilance (+1 Intel/yr)', stat: 'intel' },
    flavor: 'Iron towers weeping under endless grey rain, caught between warring empires.',
    history: 'Repeatedly trampled as the proxy battlefield of Fire, Wind, and Earth, Amegakure closed its borders under iron vigilance.',
    culture: 'Rain Vigilance: paranoia toward outsiders, constant surveillance, and fierce determination to end great-nation abuse.',
    militaryPolicy: 'isolationist',
    politicalInterests: 'Keep foreign armies out of the Rain Corridor and leverage border intelligence.',
    institutions: {
      shadowOrgName: 'Rain-Watch Inquisitors',
      shadowOrgDesc: 'Silent rain-masked monitors tracking every chakra signature entering the iron towers.',
      academyDoctrine: 'austerity_craft',
      academyLabel: 'Iron Tower Watch Academy',
      academyGradOffset: 6,
      hospitalBaseline: 54,
      daimyoFundingBaseline: 55,
      daimyoVolatility: 0.45,
      bloodlineSuspicion: false,
    },
    surnames: ['Amegumo', 'Mizukami', 'Sazanami', 'Kirisame', 'Kuroame', 'Mizuho'],
    maleNames: ['Yahiko', 'Nagato', 'Oboro', 'Kagari', 'Mubi', 'Aoi', 'Shigure', 'Jiro'],
    femaleNames: ['Konan', 'Ajisai', 'Suiren', 'Ame', 'Fuyuka', 'Kiri', 'Shizuku', 'Mio'],
  },
  {
    id: 'oto',
    name: 'Otogakure',
    region: 'Land of Rice Fields',
    tier: 'minor',
    dominantElement: 'wind',
    kageTitle: 'Otokage',
    perk: { label: 'Sound Experiments (+1 Chakra/yr)', stat: 'chakra' },
    flavor: 'A secretive stronghold of forbidden research and ruthless ambition.',
    history: 'Carved from the fractured Land of Rice Fields by rogue researchers recruiting ambitious outcasts.',
    culture: 'Forbidden Experimentation: results above ethics, acoustic illusions, and covert recruitment of disillusioned prodigies.',
    militaryPolicy: 'shadow_ops',
    politicalInterests: 'Destabilize great-village treaties and harvest rare jutsu and bloodline samples.',
    institutions: {
      shadowOrgName: 'Sound Lab Wardens',
      shadowOrgDesc: 'Secretive laboratory cells running covert abductions and curse-seal research.',
      academyDoctrine: 'bloody_mist',
      academyLabel: 'Sound Crucible Grounds',
      academyGradOffset: 7,
      hospitalBaseline: 60,
      daimyoFundingBaseline: 58,
      daimyoVolatility: 0.5,
      bloodlineSuspicion: false,
    },
    surnames: ['Fuma', 'Kinuta', 'Abumi', 'Tsuchi', 'Kagero', 'Hibiki'],
    maleNames: ['Dosu', 'Zaku', 'Sakon', 'Kidomaru', 'Jirobo', 'Kimimaro', 'Arashi', 'Koto'],
    femaleNames: ['Kin', 'Tayuya', 'Sasame', 'Guren', 'Yuki', 'Saya', 'Hotaru', 'Kanae'],
  },
  {
    id: 'taki',
    name: 'Takigakure',
    region: 'Land of Waterfalls',
    tier: 'minor',
    dominantElement: 'water',
    kageTitle: 'Village Head',
    perk: { label: 'Cataract Endurance (+1 Health/yr)', stat: 'health' },
    flavor: 'Concealed behind a roaring cataract, proud of its stubborn independence.',
    history: 'A hidden valley that repelled four border invasions by weaponizing its mountain rivers.',
    culture: 'Cataract Independence: tightly knit mountain defenders guarding sacred spring shrines.',
    militaryPolicy: 'defensive',
    politicalInterests: 'Maintain valley secrecy and neutral trade.',
    institutions: {
      shadowOrgName: 'Spring Wardens',
      shadowOrgDesc: 'Mountain sentries who erase unauthorized trails leading behind the falls.',
      academyDoctrine: 'fortress_stone',
      academyLabel: 'Cataract Training Hall',
      academyGradOffset: 1,
      hospitalBaseline: 64,
      daimyoFundingBaseline: 60,
      daimyoVolatility: 0.3,
      bloodlineSuspicion: false,
    },
    surnames: ['Taki', 'Suien', 'Takigawa', 'Hoshino', 'Mizuuchi'],
    maleNames: ['Shibuki', 'Kegon', 'Hisan', 'Tatsuya', 'Renji', 'Kazuo'],
    femaleNames: ['Fu', 'Yori', 'Mina', 'Satsuki', 'Aya', 'Kaho'],
  },
  {
    id: 'kusa',
    name: 'Kusagakure',
    region: 'Land of Grass',
    tier: 'minor',
    dominantElement: 'earth',
    kageTitle: 'Village Head',
    perk: { label: 'Border Espionage (+1 Intel/yr)', stat: 'intel' },
    flavor: 'A borderland of spies and diplomats surviving by reading stronger neighbors.',
    history: 'Caught directly along Kannabi Bridge between Fire and Earth, Grass survived through sharp espionage.',
    culture: 'Border Pragmatism: diplomacy, double agents, and rapid adaptation.',
    militaryPolicy: 'shadow_ops',
    politicalInterests: 'Keep Kannabi trade open while trading intelligence to deter annexation.',
    institutions: {
      shadowOrgName: 'Grass Cipher Bureau',
      shadowOrgDesc: 'Border informants who buy and sell troop movements between Fire and Earth.',
      academyDoctrine: 'austerity_craft',
      academyLabel: 'Grass Recon Academy',
      academyGradOffset: 2,
      hospitalBaseline: 62,
      daimyoFundingBaseline: 56,
      daimyoVolatility: 0.45,
      bloodlineSuspicion: false,
    },
    surnames: ['Kusano', 'Shiore', 'Kusakabe', 'Kaze', 'Nohara'],
    maleNames: ['Mui', 'Muku', 'Kusa', 'Taro', 'Shingo', 'Hideo'],
    femaleNames: ['Karin', 'Ryuzetsu', 'Sayo', 'Midori', 'Yoko', 'Haru'],
  },
  {
    id: 'iron',
    name: 'Land of Iron',
    region: 'Three Wolves Peaks',
    tier: 'minor',
    dominantElement: 'earth',
    kageTitle: 'General of Iron',
    perk: { label: 'Samurai Bushido (+1 Will/yr)', stat: 'will', disciplineId: 'kenjutsu' },
    flavor: 'Snowbound neutral peaks guarded by chakra-forging samurai and lone wanderers.',
    history: 'An autonomous samurai stronghold whose neutrality is respected by all Five Great Nations.',
    culture: 'Samurai Bushido: disciplined iaido steel, summit arbitration, and steadfast neutrality.',
    militaryPolicy: 'diplomatic',
    politicalInterests: 'Host Five-Nation peace summits and defend mountain neutrality.',
    institutions: {
      shadowOrgName: 'Peak Arbiters',
      shadowOrgDesc: 'Sworn summit guards who uncover covert assassins before diplomatic talks begin.',
      academyDoctrine: 'fortress_stone',
      academyLabel: 'Iron Peak Dojo',
      academyGradOffset: 3,
      hospitalBaseline: 70,
      daimyoFundingBaseline: 74,
      daimyoVolatility: 0.2,
      bloodlineSuspicion: false,
    },
    surnames: ['Yukimura', 'Tachibana', 'Urakaku', 'Tetsuo', 'Kuroda'],
    maleNames: ['Mifune', 'Okisuke', 'Tsubasa', 'Kengo', 'Masaru', 'Shinji'],
    femaleNames: ['Tsubaki', 'Yukino', 'Kaede', 'Fumi', 'Aki', 'Rei'],
  },
  {
    id: 'uzushio',
    name: 'Uzushio Coast',
    region: 'Whirlpool Archipelago',
    tier: 'minor',
    dominantElement: 'water',
    kageTitle: 'Uzushio Elder',
    perk: { label: 'Whirlpool Sealing Lore (+2 Fuinjutsu XP / +1 Chakra/yr)', stat: 'chakra', disciplineId: 'fuinjutsu' },
    flavor: 'Wind-swept ruins and fishing coves haunted by ancient sealing lore.',
    history: 'Once a legendary island of sealing masters allied with Konoha, now rebuilt by vigilant remnants.',
    culture: 'Whirlpool Lore: immense vitality, sealing craftsmanship, and wary coastal defenses.',
    militaryPolicy: 'defensive',
    politicalInterests: 'Guard ancestral sealing vaults and sustain maritime friendship with Fire.',
    institutions: {
      shadowOrgName: 'Spiral Seal Wardens',
      shadowOrgDesc: 'Barrier keepers hiding ancient Uzushio scrolls from foreign raiders.',
      academyDoctrine: 'teamwork',
      academyLabel: 'Whirlpool Seal Hall',
      academyGradOffset: 1,
      hospitalBaseline: 68,
      daimyoFundingBaseline: 58,
      daimyoVolatility: 0.35,
      bloodlineSuspicion: false,
    },
    surnames: ['Uzumaki', 'Arashio', 'Shiozaki', 'Ushio', 'Namioka'],
    maleNames: ['Ashina', 'Minato', 'Kaito', 'Sora', 'Nagi', 'Tatsumi'],
    femaleNames: ['Mito', 'Kushina', 'Honoka', 'Umi', 'Natsumi', 'Shiori'],
  },
  {
    id: 'waves',
    name: 'Land of Waves',
    region: 'Eastern Sea',
    tier: 'minor',
    dominantElement: 'water',
    kageTitle: 'Village Head',
    perk: { label: 'Port Trade Network (+1 Ryo/yr)', stat: 'ryo' },
    flavor: 'A mist-wrapped island port linked by bridges, reliant on hired shinobi.',
    history: 'A maritime trade hub struggling to stay independent from shipping syndicates and coastal raids.',
    culture: 'Maritime Resilience: merchant solidarity, practical self-defense, and open bridges.',
    militaryPolicy: 'diplomatic',
    politicalInterests: 'Keep sea bridges open and hire reliable shinobi escorts.',
    institutions: {
      shadowOrgName: 'Harbor Watch',
      shadowOrgDesc: 'Port informants tracking smugglers and rogue mercenary bands.',
      academyDoctrine: 'teamwork',
      academyLabel: 'Harbor Militia Hall',
      academyGradOffset: -2,
      hospitalBaseline: 60,
      daimyoFundingBaseline: 62,
      daimyoVolatility: 0.4,
      bloodlineSuspicion: false,
    },
    surnames: ['Tazuna', 'Nami', 'Minato', 'Hamada', 'Shima'],
    maleNames: ['Inari', 'Kaiza', 'Giichi', 'Koji', 'Masanori', 'Sho'],
    femaleNames: ['Tsunami', 'Akane', 'Maki', 'Saki', 'Eri', 'Nozomi'],
  },
];

export const VILLAGE_MAP: Record<VillageId, VillageDef> = Object.fromEntries(
  VILLAGES.map((v) => [v.id, v]),
) as Record<VillageId, VillageDef>;

export const GREAT_VILLAGES = VILLAGES.filter((v) => v.tier === 'great');

export const INITIAL_DIPLOMACY_SCORES: readonly [VillageId, VillageId, number][] = [
  ['konoha', 'suna', 22],   // uneasy treaty
  ['konoha', 'kumo', -24],  // tense strategic rivalry
  ['konoha', 'iwa', -32],   // historical border grudge
  ['konoha', 'kiri', -10],  // wary distance
  ['suna', 'iwa', -18],     // western frontier friction
  ['suna', 'kumo', -8],
  ['suna', 'kiri', -6],
  ['kumo', 'iwa', -28],     // deep northern-western feud
  ['kumo', 'kiri', -12],
  ['iwa', 'kiri', -14],
  ['konoha', 'uzushio', 52],
  ['konoha', 'iron', 32],
  ['konoha', 'oto', -36],
  ['ame', 'konoha', -22],
  ['ame', 'iwa', -20],
  ['ame', 'suna', -16],
];

export function getKageTitle(villageId: VillageId): string {
  return VILLAGE_MAP[villageId]?.kageTitle ?? 'Kage';
}

export function kageTitle(state: { villageId: VillageId }): string {
  return getKageTitle(state.villageId);
}
