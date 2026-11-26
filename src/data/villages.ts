import type { ChakraElement, StatKey, VillageId } from '../sim/types';

export interface VillagePerk {
  label: string;
  stat?: StatKey;
  disciplineId?: string;
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
    perk: { label: 'Bloody Mist Discipline (+1 Will/yr)', stat: 'will' },
    flavor: 'Shrouded in salt fog and steep cliffs where silent blades settle disputes.',
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
    perk: { label: 'Will of Stone (+1 Health/yr)', stat: 'health' },
    flavor: 'Built from layered canyon basalt where stubborn will outlasts any siege.',
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
    surnames: ['Tazuna', 'Nami', 'Minato', 'Hamada', 'Shima'],
    maleNames: ['Inari', 'Kaiza', 'Giichi', 'Koji', 'Masanori', 'Sho'],
    femaleNames: ['Tsunami', 'Akane', 'Maki', 'Saki', 'Eri', 'Nozomi'],
  },
];

export const VILLAGE_MAP: Record<VillageId, VillageDef> = Object.fromEntries(
  VILLAGES.map((v) => [v.id, v]),
) as Record<VillageId, VillageDef>;

export const GREAT_VILLAGES = VILLAGES.filter((v) => v.tier === 'great');

export function getKageTitle(villageId: VillageId): string {
  return VILLAGE_MAP[villageId]?.kageTitle ?? 'Kage';
}

export function kageTitle(state: { villageId: VillageId }): string {
  return getKageTitle(state.villageId);
}
