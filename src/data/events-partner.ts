import type { GameState, LeaningKey, RelTrack, StatKey, WarState } from '../sim/types';

export interface PartnerWarSceneOptionDef {
  id: string;
  label: string;
  sublabel: string;
  trustDelta: number;
  relPointsBonus?: number;
  unlockFragment?: boolean;
  switchTrack?: RelTrack;
  hpDelta?: number;
  partnerHpDelta?: number;
  cpDelta?: number;
  stats?: Partial<Record<StatKey, number>>;
  leanings?: Partial<Record<LeaningKey, number>>;
  autoEligible: boolean;
  resultText: string;
}

export interface PartnerWarSceneDef {
  id: string;
  title: string;
  body: (state: GameState, war: WarState) => string;
  condition?: (state: GameState, war: WarState) => boolean;
  options: PartnerWarSceneOptionDef[];
}

export const PARTNER_WAR_SCENES: readonly PartnerWarSceneDef[] = [
  {
    id: 'ps_dream',
    title: 'War Bond: Shared Dream Beneath the Watchfire',
    body: (_state, war) => {
      const p = war.partner!;
      return `Rain taps softly against the pine boughs while ${p.name} sharpens a kunai beside the banked embers. "When these fourteen days finally end," ${p.name} asks quietly without looking up, "what kind of peace are you actually fighting to see?"`;
    },
    condition: (_state, war) => war.day >= 3,
    options: [
      {
        id: 'dream_peace',
        label: 'Speak of a village where younger shinobi grow old without border wars',
        sublabel: 'Trust +6, unlocks backstory fragment, +3 Will, +3 Bonds',
        trustDelta: 6,
        relPointsBonus: 8,
        unlockFragment: true,
        stats: { will: 3, bonds: 3 },
        leanings: { will_of_fire: 1 },
        autoEligible: true,
        resultText: 'Your partner lowers the whetstone with a steady nod and tells you the quiet reason they still carry their village emblem.',
      },
      {
        id: 'dream_summit',
        label: 'Declare that only absolute strength forces lasting peace',
        sublabel: 'Trust +4, unlocks backstory fragment, +3 Chakra, Ambition +1',
        trustDelta: 4,
        relPointsBonus: 6,
        unlockFragment: true,
        stats: { chakra: 3 },
        leanings: { ambition: 1 },
        autoEligible: true,
        resultText: 'Your partner studies the embers for a long beat before meeting your gaze with fierce resolve.',
      },
    ],
  },
  {
    id: 'ps_wounds',
    title: 'War Bond: Bandaging Scars in the Rain',
    body: (_state, war) => {
      const p = war.partner!;
      return `Behind a collapsed stone shrine, ${p.name} notices crimson soaking through your sleeve and presses a roll of field gauze into your palm while hiding a fresh gash along their own shoulder.`;
    },
    condition: (_state, war) => war.hp < 82 || (war.partner?.hp ?? 100) < 88 || war.day >= 4,
    options: [
      {
        id: 'wounds_tend_partner',
        label: 'Insist on dressing their shoulder first before touching your own wounds',
        sublabel: 'Trust +7, +8 HP, +14 Partner HP, deepens bond',
        trustDelta: 7,
        relPointsBonus: 10,
        hpDelta: 8,
        partnerHpDelta: 14,
        stats: { bonds: 3 },
        autoEligible: true,
        resultText: 'For once, your partner lets their guard drop completely as you knot the linen cleanly across their shoulder.',
      },
      {
        id: 'wounds_trade_salve',
        label: 'Split the hemostatic salve evenly and review tomorrow’s guard shifts',
        sublabel: 'Trust +5, +10 HP, +10 Partner HP, +2 Intel',
        trustDelta: 5,
        relPointsBonus: 6,
        hpDelta: 10,
        partnerHpDelta: 10,
        stats: { intel: 2 },
        autoEligible: true,
        resultText: 'No wasted motion, no wasted words; two veteran shinobi patching each other up before dawn.',
      },
    ],
  },
  {
    id: 'ps_moonlit_roof',
    title: 'War Bond: Moonlit Ridge Watch',
    body: (_state, war) => {
      const p = war.partner!;
      return `The valley mist parts beneath a pale full moon. ${p.name} sits beside you along the mossy watchtower beam, shoulders close enough to feel their steady chakra pulse in the cold wind.`;
    },
    condition: (_state, war) => war.day >= 5,
    options: [
      {
        id: 'moon_vow_comrade',
        label: 'Clasp forearms and swear neither of you falls in this valley',
        sublabel: 'Trust +6, unlocks backstory fragment, +8 CP, +3 Will',
        trustDelta: 6,
        relPointsBonus: 10,
        unlockFragment: true,
        cpDelta: 8,
        stats: { will: 3 },
        autoEligible: true,
        resultText: 'Their grip locks around your wrist like iron. Beneath the moon, an unspoken pact seals between you.',
      },
      {
        id: 'moon_confess',
        label: 'Speak quietly from the heart about wanting them beside you long after the war',
        sublabel: 'Trust +8, opens deep personal bond, unlocks backstory fragment',
        trustDelta: 8,
        relPointsBonus: 14,
        unlockFragment: true,
        switchTrack: 'romance',
        stats: { bonds: 4 },
        autoEligible: false,
        resultText: 'Silence lingers beneath the moonlit pines before your partner rests their hand over yours with a quiet, unmistakable answer.',
      },
    ],
  },
  {
    id: 'ps_campfire',
    title: 'War Bond: Embers Before the Final Push',
    body: (_state, war) => {
      const p = war.partner!;
      return `With the war past its midpoint, ${p.name} splits the last warm ration skewer over a smokeless charcoal pit and laughs softly about how ridiculous your first day in this sector now seems.`;
    },
    condition: (_state, war) => war.day >= 7,
    options: [
      {
        id: 'campfire_promise',
        label: 'Promise to buy the first round back at the village ramen counter',
        sublabel: 'Trust +7, +8 HP, +12 CP, +8 Partner HP',
        trustDelta: 7,
        relPointsBonus: 10,
        hpDelta: 8,
        partnerHpDelta: 8,
        cpDelta: 12,
        stats: { bonds: 3 },
        autoEligible: true,
        resultText: 'For ten quiet minutes around the coals, the sound of distant explosions fades behind genuine laughter.',
      },
      {
        id: 'campfire_drill',
        label: 'Use the warm pause to synchronize hand-signal combos for the final days',
        sublabel: 'Trust +5, +12 CP, +3 Intel, +4 Next Battle Bonus',
        trustDelta: 5,
        relPointsBonus: 8,
        cpDelta: 12,
        stats: { intel: 3 },
        autoEligible: true,
        resultText: 'Two taps on a kunai hilt now say what used to take five words in the dark.',
      },
    ],
  },
  {
    id: 'ps_jealousy',
    title: 'War Bond: Quiet Friction on the Line',
    body: (_state, war) => {
      const p = war.partner!;
      const ally = war.allyId ? war.enemies.find((e) => e.id === war.allyId && e.alive) : null;
      return ally
        ? `${p.name} watches ${ally.name} vanish back into the mist and folds their arms tightly. "You share our flank plans with outsiders pretty easily. Tell me straight: whose back are you really watching in this valley?"`
        : `${p.name} blocks the narrow trail before you can leave camp alone. "You keep stepping ahead to absorb every ambush by yourself. Do you actually trust me to hold the line with you, or am I just baggage?"`;
    },
    condition: (_state, war) => war.day >= 6 || Boolean(war.allyId),
    options: [
      {
        id: 'jealousy_reassure',
        label: 'Look them straight in the eye and affirm they are the one partner you trust above all',
        sublabel: 'Trust +8, +12 Relationship Points, +3 Bonds',
        trustDelta: 8,
        relPointsBonus: 12,
        stats: { bonds: 3 },
        autoEligible: true,
        resultText: 'The tension leaves their shoulders all at once. "Good," they answer softly. "Then stop trying to carry this war alone."',
      },
      {
        id: 'jealousy_pragmatic',
        label: 'Answer coolly that survival requires every alliance and edge available',
        sublabel: 'Trust -3, +3 Intel, Ruthless +1',
        trustDelta: -3,
        stats: { intel: 3 },
        leanings: { ruthless: 1 },
        autoEligible: false,
        resultText: 'Your partner steps aside without another word, jaw tight as they return to perimeter watch.',
      },
    ],
  },
];
