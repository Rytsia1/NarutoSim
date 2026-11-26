import type { LeaningKey, StatKey, TraitId } from '../sim/types';
import { EXTRA_WAR_CROSSROADS } from './events-war-extra';

export interface WarCrossroadOptionDef {
  id: string;
  label: string;
  sublabel?: string;
  autoEligible: boolean;
  hpDelta?: number;
  cpDelta?: number;
  fortDelta?: number;
  exposureDelta?: number;
  allyTrustDelta?: number;
  squadTrustDelta?: number;
  reactions?: Partial<Record<TraitId, number>>;
  stats?: Partial<Record<StatKey, number>>;
  leanings?: Partial<Record<LeaningKey, number>>;
  resultText: string;
}

export interface WarCrossroadDef {
  id: string;
  title: string;
  body: string;
  options: WarCrossroadOptionDef[];
}

export const WAR_CROSSROADS: readonly WarCrossroadDef[] = [
  {
    id: 'wc_refugee_cart',
    title: 'Crossroads: Stranded Border Refugees',
    body: 'A broken wagon of fleeing villagers blocks a narrow ravine road while enemy smoke rises two ridges east. Helping them risks giving away your camp trail.',
    options: [
      {
        id: 'escort_safe',
        label: 'Clear the axle and guide them to a hidden cave',
        sublabel: '+6 Exposure, -6 CP, +3 Will, +3 Bonds, +5 Squad Kizuna',
        autoEligible: true,
        exposureDelta: 6,
        cpDelta: -6,
        squadTrustDelta: 5,
        allyTrustDelta: 4,
        reactions: { compassion: 5, honor: 3, loyalty: 2, ambition: -2 },
        stats: { will: 3, bonds: 3 },
        leanings: { will_of_fire: 2 },
        resultText: 'You spend precious chakra lifting the wagon clear. An old farmer presses dry rice cakes into your hand before vanishing into the cave.',
      },
      {
        id: 'leave_silent',
        label: 'Stay concealed in the cedar canopy and let them fend for themselves',
        sublabel: 'Exposure -4, Ruthless +2',
        autoEligible: true,
        exposureDelta: -4,
        allyTrustDelta: -3,
        reactions: { compassion: -5, honor: -3, ambition: 2, freedom: 1 },
        leanings: { ruthless: 2 },
        resultText: 'You hold your breath until the ravine empties. Staying alive comes first in a shinobi war.',
      },
    ],
  },
  {
    id: 'wc_wounded_enemy_courier',
    title: 'Crossroads: Dying Enemy Messenger',
    body: 'Pinned beneath a shattered pine sits a young enemy courier clutching a bloodstained pouch. They beg you to deliver a folded letter home instead of burning it.',
    options: [
      {
        id: 'take_cipher_honor_letter',
        label: 'Seize the military map, but seal their family letter for neutral post',
        sublabel: '+10 Rival Intel, +3 Intel, +2 Will, +3 Ally/Squad Trust',
        autoEligible: true,
        stats: { intel: 3, will: 2 },
        allyTrustDelta: 3,
        squadTrustDelta: 3,
        reactions: { honor: 4, compassion: 4, loyalty: 2 },
        leanings: { will_of_fire: 1 },
        resultText: 'Even across rival headbands, you leave a shred of mercy intact while taking the tactical routes.',
      },
      {
        id: 'interrogate_cold',
        label: 'Extract every patrol code before they fade',
        sublabel: 'Intel +4, Ruthless +2, Exposure -2',
        autoEligible: true,
        exposureDelta: -2,
        reactions: { compassion: -4, honor: -3, ambition: 3 },
        stats: { intel: 4 },
        leanings: { ruthless: 2 },
        resultText: 'You walk away with three fresh passwords and cold silence behind you.',
      },
    ],
  },
  {
    id: 'wc_poisoned_spring',
    title: 'Crossroads: The Valley Well',
    body: 'You discover an unmarked spring that supplies two rival camps downstream. Dropping slow-acting paralytic powder inside could weaken the entire sector.',
    options: [
      {
        id: 'poison_well',
        label: 'Slip the paralytic toxin into the downstream current',
        sublabel: 'All living rivals lose HP, Forbidden +2, Ruthless +2',
        autoEligible: false,
        exposureDelta: 5,
        allyTrustDelta: -6,
        reactions: { honor: -6, compassion: -6, loyalty: -2, ambition: 2 },
        leanings: { forbidden: 2, ruthless: 2 },
        resultText: 'By dusk, coughing echoes from two distant ridges. Victory tastes bitter on the tongue.',
      },
      {
        id: 'refuse_poison',
        label: 'Refill your own canteen and leave the water clean',
        sublabel: '+8 HP, +8 CP, Will +2',
        autoEligible: true,
        hpDelta: 8,
        cpDelta: 8,
        squadTrustDelta: 4,
        reactions: { honor: 5, compassion: 3, loyalty: 2 },
        stats: { will: 2 },
        leanings: { will_of_fire: 1 },
        resultText: 'Some lines stay uncrossed even when steel decides the border.',
      },
    ],
  },
  {
    id: 'wc_abandoned_supply_cache',
    title: 'Crossroads: Booby-Trapped Supply Cache',
    body: 'Beneath a fallen watchtower lies an intact crate of soldier pills, sealing paper, and silver ryo wired to a hair-trigger explosive tag.',
    options: [
      {
        id: 'disarm_loot',
        label: 'Carefully sever the chakra wire and claim the cache',
        sublabel: '+14 CP, +8 Fort, +8 Ryo (or -10 HP blast on slip)',
        autoEligible: true,
        cpDelta: 14,
        fortDelta: 8,
        reactions: { ambition: 2, freedom: 2, loyalty: 1 },
        stats: { ryo: 8, intel: 2 },
        resultText: 'Your kunai lifts the paper tag clean off the latch. Fresh supplies replenish your pouches.',
      },
      {
        id: 'rewire_trap',
        label: 'Leave it untouched and double the fuse as bait for rival scouts',
        sublabel: 'Fort +10, Exposure -3',
        autoEligible: true,
        fortDelta: 10,
        exposureDelta: -3,
        reactions: { ambition: 3, honor: -2, freedom: 1 },
        leanings: { ambition: 1 },
        resultText: 'Hours later, a muffled blast rings out down the gorge as a rival scout learns caution the hard way.',
      },
    ],
  },
  {
    id: 'wc_forbidden_scroll_field',
    title: 'Crossroads: Blood-Smeared Kinjutsu Fragment',
    body: 'A fallen Jonin from a minor nation dropped a torn scroll detailing a brutal chakra-overclock seal that trades lifespan for raw explosive output.',
    options: [
      {
        id: 'study_kinjutsu',
        label: 'Memorize the forbidden formula before burning the parchment',
        sublabel: '+20 CP, -8 HP, Forbidden +3',
        autoEligible: false,
        cpDelta: 20,
        hpDelta: -8,
        reactions: { ambition: 4, honor: -4, compassion: -3, freedom: 2 },
        stats: { chakra: 3 },
        leanings: { forbidden: 3, ambition: 1 },
        resultText: 'Your pathways flare painfully as the stolen formula sinks into muscle memory.',
      },
      {
        id: 'burn_scroll',
        label: 'Reduce the scroll to ash with a quick spark',
        sublabel: '+3 Will, +3 Squad Trust, Will of Fire +1',
        autoEligible: true,
        stats: { will: 3 },
        squadTrustDelta: 3,
        reactions: { honor: 4, loyalty: 3, ambition: -2 },
        leanings: { will_of_fire: 1 },
        resultText: 'The black ash scatters over the mud. Power bought with rot always collects its debt.',
      },
    ],
  },
  {
    id: 'wc_bridge_demolition',
    title: 'Crossroads: The River Crossing',
    body: 'Blowing the stone footbridge would cut off rival reinforcements tonight, though two local hamlets rely on that crossing for winter grain.',
    options: [
      {
        id: 'blow_bridge',
        label: 'Detonate the piers and choke the enemy advance',
        sublabel: 'Fort +12, Exposure +6, Ruthless +2',
        autoEligible: true,
        fortDelta: 12,
        exposureDelta: 6,
        reactions: { compassion: -5, ambition: 3, honor: -2 },
        leanings: { ruthless: 2 },
        resultText: 'Stone plunges into white rapids. Rival columns are forced onto a two-day detour through mud.',
      },
      {
        id: 'rig_warning_wires',
        label: 'Spare the bridge and lace only the approaches with tripwires',
        sublabel: 'Fort +6, Bonds +3, Will of Fire +1',
        autoEligible: true,
        fortDelta: 6,
        stats: { bonds: 3 },
        squadTrustDelta: 4,
        reactions: { compassion: 4, honor: 3, loyalty: 2 },
        leanings: { will_of_fire: 1 },
        resultText: 'The crossing stands intact while thin bells alert you to any shinobi boot crossing after dark.',
      },
    ],
  },
  {
    id: 'wc_fallen_headband',
    title: 'Crossroads: A Familiar Village Emblem',
    body: 'Resting beside a shattered shield is a scratched forehead protector from your own village, left behind by an earlier patrol that never made it back.',
    options: [
      {
        id: 'carry_emblem',
        label: 'Tuck the emblem into your vest and swear to bring it home',
        sublabel: '+6 HP, +10 CP, +4 Will',
        autoEligible: true,
        hpDelta: 6,
        cpDelta: 10,
        squadTrustDelta: 5,
        reactions: { loyalty: 5, honor: 4, compassion: 2 },
        stats: { will: 4 },
        leanings: { will_of_fire: 2 },
        resultText: 'The cool metal sits over your chest like a quiet vow against the dark.',
      },
      {
        id: 'vow_revenge',
        label: 'Track the footprints leading away and swear blood for blood',
        sublabel: '+10 CP, Vengeance +3',
        autoEligible: true,
        cpDelta: 10,
        reactions: { ambition: 3, freedom: 2, compassion: -3 },
        leanings: { vengeance: 3 },
        resultText: 'Cold fury steadies your hand on the kunai hilt as dusk deepens.',
      },
    ],
  },
  {
    id: 'wc_night_parley',
    title: 'Crossroads: White Cloth Under the Pines',
    body: 'An exhausted rival operative waves a torn white bandage across a stream, offering a one-night truce to share fire and dry wet powder.',
    options: [
      {
        id: 'share_fire',
        label: 'Accept the brief truce and trade quiet stories until midnight',
        sublabel: '+10 HP, +10 CP, +6 Ally Trust, +3 Bonds',
        autoEligible: true,
        hpDelta: 10,
        cpDelta: 10,
        allyTrustDelta: 6,
        reactions: { compassion: 4, honor: 3, freedom: 3 },
        stats: { bonds: 3 },
        resultText: 'For two hours under the pines, you are just two tired people wondering who still remembers why the border burned.',
      },
      {
        id: 'ambush_truce',
        label: 'Feint agreement and throw flash tags across the stream',
        sublabel: 'Exposure +5, Ruthless +3',
        autoEligible: false,
        exposureDelta: 5,
        allyTrustDelta: -8,
        reactions: { honor: -6, compassion: -4, loyalty: -2, ambition: 2 },
        leanings: { ruthless: 3 },
        resultText: 'They scramble backward coughing through smoke. Word of your treachery spreads quietly across the valley.',
      },
    ],
  },
  {
    id: 'wc_medical_herb_cliff',
    title: 'Crossroads: Cliffside Antidote Moss',
    body: 'Rare silver hemostatic moss clings to a slick waterfall ledge. Climbing for it risks a nasty fall, yet its salve stops deep blade wounds instantly.',
    options: [
      {
        id: 'climb_cliff',
        label: 'Channel chakra into your soles and harvest the moss',
        sublabel: '+16 HP, -6 CP',
        autoEligible: true,
        hpDelta: 16,
        cpDelta: -6,
        reactions: { loyalty: 3, compassion: 2, honor: 2 },
        stats: { health: 2 },
        resultText: 'Cold spray stings your eyes, but you return with enough silver salve to patch three deep gashes.',
      },
      {
        id: 'skip_climb',
        label: 'Conserve chakra and keep moving along dry ground',
        sublabel: '+8 CP',
        autoEligible: true,
        cpDelta: 8,
        reactions: { freedom: 2, ambition: 1 },
        resultText: 'You save your strength for enemies rather than wet granite.',
      },
    ],
  },
  {
    id: 'wc_whispered_rumor',
    title: 'Crossroads: Intercepted Hawk Dispatch',
    body: 'A tired messenger hawk drops onto your camp awning with a wax cylinder stamped by an enemy commander. Breaking the seal alerts their sensory corps.',
    options: [
      {
        id: 'crack_seal',
        label: 'Steam the wax open and memorize the deployment chart',
        sublabel: '+4 Intel, Exposure +4',
        autoEligible: true,
        exposureDelta: 4,
        reactions: { ambition: 2, loyalty: 2 },
        stats: { intel: 4 },
        resultText: 'You copy three supply timings and release the bird before it misses a beat.',
      },
      {
        id: 'forge_note',
        label: 'Swap in false coordinates and send the hawk onward',
        sublabel: 'Fort +8, Ambition +1',
        autoEligible: true,
        fortDelta: 8,
        reactions: { ambition: 3, freedom: 2, honor: -1 },
        leanings: { ambition: 1 },
        resultText: 'False trails will keep rival scouts chasing ghosts through the southern marsh.',
      },
    ],
  },
  {
    id: 'wc_dusk_meditation',
    title: 'Crossroads: Silence Before the Storm',
    body: 'Wind dies completely across the valley at sunset. Every shinobi instinct warns that tomorrow night will decide who walks out alive.',
    options: [
      {
        id: 'hone_resolve',
        label: 'Sharpen your blades and steady your chakra breathing',
        sublabel: '+12 CP, +3 Will',
        autoEligible: true,
        cpDelta: 12,
        reactions: { honor: 3, loyalty: 2 },
        stats: { will: 3 },
        resultText: 'Your pulse slows to an even drumbeat as stars pierce the smoke.',
      },
      {
        id: 'fortify_quietly',
        label: 'Set three extra decoy flares along the outer path',
        sublabel: '+10 Fort, Exposure -3',
        autoEligible: true,
        fortDelta: 10,
        exposureDelta: -3,
        reactions: { loyalty: 2, freedom: 1, ambition: 1 },
        resultText: 'Anyone stepping near your ridge tonight will announce themselves in bright fire.',
      },
    ],
  },
  {
    id: 'wc_rival_honor_duel',
    title: 'Crossroads: Carved Challenge on a Cedar Trunk',
    body: 'A rival shinobi leaves a kunai pinning a note to a boundary tree: meet openly at the dry riverbed at dusk, or be branded a coward across the sector.',
    options: [
      {
        id: 'accept_honor',
        label: 'Leave your own mark in reply and steel your spirit',
        sublabel: '+4 Will, +5 Ally / +4 Squad Trust, Exposure +5',
        autoEligible: true,
        exposureDelta: 5,
        allyTrustDelta: 5,
        squadTrustDelta: 4,
        reactions: { honor: 5, loyalty: 3, ambition: 2 },
        stats: { will: 4 },
        leanings: { will_of_fire: 1, ambition: 1 },
        resultText: 'Word ripples through the valley that you do not hide behind shadows.',
      },
      {
        id: 'burn_note',
        label: 'Pocket the free kunai and move your camp two hills north',
        sublabel: 'Exposure -6, Fort +5',
        autoEligible: true,
        exposureDelta: -6,
        fortDelta: 5,
        reactions: { freedom: 3, honor: -3, ambition: 1 },
        resultText: 'Pride fills memorial stones. Relocation keeps you breathing.',
      },
    ],
  },
  ...EXTRA_WAR_CROSSROADS,
];
