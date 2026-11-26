import type { StatKey } from '../sim/types';
import { EXTRA_RETIREMENT_EVENTS } from './events-epilogue-extra';

export interface RetirementEventDef {
  id: string;
  title: string;
  body: string;
  requiresJonin?: boolean;
  requiresSpouse?: boolean;
  requiresPartner?: boolean;
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
    body: 'The {kage} office asks if you are willing to oversee a newly minted three-man Genin squad during peacetime drills.',
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
  {
    id: 'ret_partner_visit',
    title: 'Annual Visit at the Lantern Gate',
    body: 'Every autumn on the anniversary of the armistice, {partner} arrives at your garden gate carrying roasted chestnuts and a battered canteen. {partnerRelLine}',
    requiresPartner: true,
    options: [
      {
        id: 'partner_tea_stories',
        label: 'Sit until twilight trading old battlefield jokes',
        autoEligible: true,
        stats: { bonds: 6, will: 4, health: 2 },
        resultText: 'Laughter softens the lines around both your eyes as the lanterns come alive down the street.',
      },
      {
        id: 'partner_walk_memorial',
        label: 'Walk together to the hillside memorial before supper',
        autoEligible: true,
        stats: { will: 6, bonds: 4 },
        resultText: 'You set two white blossoms at the stone side by side, grateful that both of you lived to grow grey.',
      },
    ],
  },
  {
    id: 'ret_partner_doorstep',
    title: 'At the Doorstep in Winter Rain',
    body: 'Cold sleet hammers the eaves when {partner} knocks quietly at your doorstep, shaking snow from a travel cloak that still smells of cedar smoke. {partnerRelLine}',
    requiresPartner: true,
    options: [
      {
        id: 'partner_hearth',
        label: 'Pull them inside beside the charcoal hearth and warm two bowls of soup',
        autoEligible: true,
        stats: { bonds: 7, health: 3 },
        resultText: 'No guard shifts remain to divide the night; only steady warmth and a bond that outlived every war.',
      },
      {
        id: 'partner_spar_slow',
        label: 'Trade three slow wooden-sword stances beneath the covered porch',
        autoEligible: true,
        stats: { will: 5, health: 2 },
        resultText: 'Even with stiff joints, neither of you has forgotten the rhythm of the other’s footwork.',
      },
    ],
  },
  {
    id: 'ret_partner_final_night',
    title: 'The Final Night Together',
    body: 'Under a clear harvest moon, your breathing slows while {partner} sits calmly at your bedside holding your scarred hand. {partnerRelLine}',
    requiresPartner: true,
    options: [
      {
        id: 'partner_thank_you',
        label: 'Thank them for never once letting go of your back',
        autoEligible: true,
        stats: { bonds: 8, will: 6 },
        resultText: 'They smile through quiet tears and whisper that walking beside you was the proudest mission of their life.',
      },
    ],
  },
  ...EXTRA_RETIREMENT_EVENTS,
];
