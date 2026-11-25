import type { StatKey } from '../sim/types';

export interface RetirementEventDef {
  id: string;
  title: string;
  body: string;
  requiresJonin?: boolean;
  requiresSpouse?: boolean;
  options: {
    id: string;
    label: string;
    autoEligible: boolean;
    stats?: Partial<Record<StatKey, number>>;
    trustAllTeam?: number;
    resultText: string;
  }[];
}

export const RETIREMENT_EVENTS: readonly RetirementEventDef[] = [
  {
    id: 'ret_tea_porch',
    title: 'Quiet Tea Above the Training Yard',
    body: 'Morning fog lifts off the village roofs as young academy students run past your gate shouting the same drills you once hated.',
    options: [
      {
        id: 'watch_smile',
        label: 'Pour a second cup and watch them sprint past',
        autoEligible: true,
        stats: { will: 3, health: 2 },
        resultText: 'For the first time in decades, you do not check the wind for enemy chakra.',
      },
      {
        id: 'toss_advice',
        label: 'Call out one crisp pointer on footwork',
        autoEligible: true,
        stats: { bonds: 4, will: 2 },
        resultText: 'A breathless kid stops, bows awkwardly, and runs off grinning.',
      },
    ],
  },
  {
    id: 'ret_mentor_new_genin',
    title: 'Three Young Genin at Your Gate',
    body: 'The Kage office asks if you are willing to oversee a newly minted three-man Genin squad during peacetime drills.',
    requiresJonin: true,
    options: [
      {
        id: 'teach_bell_test',
        label: 'Hold up two silver bells and smile',
        autoEligible: true,
        stats: { bonds: 8, will: 5, health: -2 },
        trustAllTeam: 4,
        resultText: 'Standing where your own Sensei once stood, you pass down the same lesson: those who abandon comrades are worse than scum.',
      },
      {
        id: 'decline_gently',
        label: 'Leave field drills to younger Jonin and offer scroll lectures instead',
        autoEligible: true,
        stats: { intel: 4, health: 2 },
        resultText: 'Your annotated notebooks become required reading at the academy.',
      },
    ],
  },
  {
    id: 'ret_old_squad_drink',
    title: 'An Empty Seat at the Izakaya',
    body: 'Rain taps against the paper lantern outside as you meet surviving faces from your old Genin days over warm sake and grilled skewers.',
    options: [
      {
        id: 'toast_fallen',
        label: 'Pour an extra cup for those who never grew old',
        autoEligible: true,
        stats: { bonds: 6, will: 4 },
        trustAllTeam: 8,
        resultText: 'Grey hair and old scars fade for one evening as stories of your first terrible D-Rank mission fill the room.',
      },
      {
        id: 'quiet_nod',
        label: 'Share the meal in comfortable silence',
        autoEligible: true,
        stats: { will: 4, health: 2 },
        trustAllTeam: 4,
        resultText: 'Survivors need very few words to understand one another.',
      },
    ],
  },
  {
    id: 'ret_family_autumn',
    title: 'Maple Leaves on the Veranda',
    body: 'Your spouse folds an old, patched flak jacket into a cedar chest while autumn wind sweeps red leaves across the garden.',
    requiresSpouse: true,
    options: [
      {
        id: 'walk_market',
        label: 'Take a slow evening stroll through the lantern market together',
        autoEligible: true,
        stats: { bonds: 7, health: 3 },
        resultText: 'No dispatches, no alarms: just warm hands and an unhurried walk home.',
      },
    ],
  },
  {
    id: 'ret_write_memoir',
    title: 'Ink Before the Hands Tremble',
    body: 'Winter settles deep in your joints. An archivist visits to ask whether you will record your account of the shinobi wars for the library.',
    options: [
      {
        id: 'record_truth',
        label: 'Dictate every hard truth, victory, and mistake honestly',
        autoEligible: true,
        stats: { intel: 4, bonds: 3 },
        resultText: 'Your chronicle is bound in dark linen and placed beside the village histories.',
      },
      {
        id: 'keep_silence',
        label: 'Leave the past buried with the snow',
        autoEligible: true,
        stats: { will: 4 },
        resultText: 'Some battles belong only to the ones who walked through them.',
      },
    ],
  },
];
