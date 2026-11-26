import type { VillageId } from '../sim/types';

export interface EmergentScenarioTemplate {
  id:
    | 'em_npc_defection_brink'
    | 'em_shadow_secret_leak'
    | 'em_village_institution_crisis'
    | 'em_missing_nin_crossroads'
    | 'em_disaster_flashpoint';
  title: string;
  summaryTag: string;
}

export const EMERGENT_TEMPLATES: readonly EmergentScenarioTemplate[] = [
  {
    id: 'em_npc_defection_brink',
    title: 'Footsteps at the Outer Gate',
    summaryTag: 'Autonomous NPC Defection Crossroads',
  },
  {
    id: 'em_shadow_secret_leak',
    title: 'Whispers Beneath the Council Floor',
    summaryTag: 'Shadow Division Secret Leak',
  },
  {
    id: 'em_village_institution_crisis',
    title: 'Crossroads of Village Doctrine',
    summaryTag: 'Village & Clan Political Flashpoint',
  },
  {
    id: 'em_missing_nin_crossroads',
    title: 'A Familiar Face in the Bingo Book',
    summaryTag: 'Autonomous Missing-Nin Encounter',
  },
  {
    id: 'em_disaster_flashpoint',
    title: 'Emergency Mobilization Across the Region',
    summaryTag: 'World Disaster Relief & Stability',
  },
];

export const VILLAGE_CRISIS_COPY: Record<
  VillageId,
  {
    title: string;
    body: string;
    reformLabel: string;
    hardlineLabel: string;
    shadowLabel: string;
  }
> = {
  konoha: {
    title: 'Konoha Council Crisis: Root Surveillance vs Clan Autonomy',
    body: 'Tensions boil behind the Hokage Tower. Root operatives have quietly placed watch seals around a proud founding clan compound, sparking furious rumors of betrayal across the village.',
    reformLabel: 'Side with the Clan Council and push for transparent Hokage oversight',
    hardlineLabel: 'Back the Hokage guard to enforce strict unity and calm the streets',
    shadowLabel: 'Assist Root in silence to contain the unrest before it turns into a coup',
  },
  suna: {
    title: 'Sunagakure Austerity Crisis: Wind Daimyo Budget Freeze',
    body: 'Couriers from the Wind Capital announce another steep cut to Sunagakure stipends, routing lucrative contracts to foreign nations. The Kazekage council is split on how to survive.',
    reformLabel: 'Escort desert trade caravans and negotiate a cooperative border accord',
    hardlineLabel: 'Rally the Puppet Brigade and Gale Corps to project military deterrence',
    shadowLabel: 'Run covert counter-intel to expose foreign agents poaching Suna contracts',
  },
  kiri: {
    title: 'Kirigakure Reckoning: The Bloody Mist Divide',
    body: 'Screams from the proving grounds echo through the harbor fog. Reformist houses demand an end to lethal Bloody Mist exams and bloodline suspicion, while Hunter-Nin hardliners warn reform will breed weakness.',
    reformLabel: 'Stand with the Reformists to curb Bloody Mist purges and shield bloodline clans',
    hardlineLabel: 'Defend Kirigakure iron discipline so foreign spies never breach the fog',
    shadowLabel: 'Work with the Hunter-Nin Corps to quietly relocate endangered bloodline youths',
  },
  kumo: {
    title: 'Kumogakure Summit Debate: Thunder Expansion',
    body: 'With overflowing Daimyo coffers, Cloud Vanguard hawks push for aggressive border probes against neighboring nations, while veteran captains warn that overreach will ignite another Great War.',
    reformLabel: 'Urge measured mountain defense and diplomatic leverage over reckless raids',
    hardlineLabel: 'Champion Thunder Supremacy drills and fortify forward lightning outposts',
    shadowLabel: 'Lead a quiet Vanguard reconnaissance sweep along the contested mountain ridge',
  },
  iwa: {
    title: 'Iwagakure Canyon Dispute: Will of Stone vs Mercenary Pacts',
    body: 'Bitter debate grips the Tsuchikage stone hall. Explosion Corps commanders argue for hiring rogue mercenaries to break rival borders, while traditionalists insist the Will of Stone must stand alone.',
    reformLabel: 'Reject rogue contracts and strengthen Iwa garrisons from within',
    hardlineLabel: 'Approve relentless Explosion Corps fortification across the canyon frontier',
    shadowLabel: 'Use Demolition Saboteurs to quietly bleed rival supply depots without open war',
  },
  ame: {
    title: 'Amegakure Vigil: Foreign Scouts in the Rain',
    body: 'Great-nation scout teams have slipped beneath the iron towers again. The Rain-Watch demands an immediate answer before the Land of Rain becomes a battlefield once more.',
    reformLabel: 'Coordinate shelter defenses and warn border settlements quietly',
    hardlineLabel: 'Drive the foreign scouts back across the floodplains by force',
    shadowLabel: 'Feed false intelligence through Rain-Watch channels to turn rival powers against each other',
  },
  oto: {
    title: 'Otogakure Crucible: Rogue Experiment Fallout',
    body: 'A volatile chakra experiment inside the Sound vaults has stirred unrest among junior shinobi and drawn the eyes of rival border trackers.',
    reformLabel: 'Stabilize the wounded test squads and secure the outer tunnels',
    hardlineLabel: 'Push through the crucible trials to claim stronger technique breakthroughs',
    shadowLabel: 'Erase the trail outside the valley before great-nation Hunter-Nin arrive',
  },
  taki: {
    title: 'Takigakure Defense: Trespassers Near the Cataract',
    body: 'Foreign intelligence teams have mapped the hidden gorge leading behind the great waterfall.',
    reformLabel: 'Fortify the gorge wards with village elders and evacuate outer shrines',
    hardlineLabel: 'Ambush the trespassers along the wet cliff paths before they report back',
    shadowLabel: 'Misdirect the foreign scouts into false mountain passes',
  },
  kusa: {
    title: 'Kusagakure Tightrope: Caught Between Fire and Earth',
    body: 'Envoys from both Konoha and Iwa demand exclusive passage across Kannabi Bridge before the season turns.',
    reformLabel: 'Broker a neutral transit toll that keeps Grass villages out of crossfire',
    hardlineLabel: 'Fortify the bridge approaches and assert Kusagakure sovereignty',
    shadowLabel: 'Sell carefully edited border intel to both sides to stall an invasion',
  },
  iron: {
    title: 'Land of Iron Arbitration: Shadow Blade at the Summit',
    body: 'Samurai sentries uncover a covert shinobi plot targeting delegates arriving at the snowbound Three Wolves Peaks.',
    reformLabel: 'Protect the envoys openly and uphold Iron neutrality without bloodshed',
    hardlineLabel: 'Meet the covert intruders steel-to-steel along the frozen pass',
    shadowLabel: 'Trace the assassins back to their sponsor to expose the plot publicly',
  },
  uzushio: {
    title: 'Uzushio Coast Alert: Seal Raiders in the Fog',
    body: 'Unmarked vessels approach the whirlpool coves hunting for surviving Uzumaki sealing scrolls.',
    reformLabel: 'Raise the coastal spiral barrier and shelter village elders',
    hardlineLabel: 'Board the raiders at the tide line before they set foot on shore',
    shadowLabel: 'Lay decoy scrolls laced with suppression seals along the cliffs',
  },
  waves: {
    title: 'Land of Waves Harbor Crisis: Syndicate Blockade',
    body: 'A ruthless maritime syndicate has hired rogue shinobi to choke off bridge traffic and starve the port.',
    reformLabel: 'Rally the harbor guild and defend the bridge workers directly',
    hardlineLabel: 'Strike the rogue enforcers at the docks to shatter the blockade',
    shadowLabel: 'Infiltrate the syndicate warehouses and cut their supply lines at night',
  },
};
