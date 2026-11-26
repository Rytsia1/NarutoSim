import type {
  ChakraElement,
  CombatArchetype,
  NpcMotivation,
  NpcTactic,
  SkillTag,
  UltimateDef,
  VillageId,
} from '../../sim/types';
import type { SeededRng } from '../../sim/rng';
import { VILLAGE_MAP } from '../villages';

export interface PooledSkill {
  name: string;
  tag: SkillTag;
  rank: number;
}

export interface CombatLineSet {
  meet: string;
  clash: string;
  win: string;
  fall: string;
}

export const SKILL_POOL: Record<CombatArchetype, Partial<Record<ChakraElement | 'any', readonly PooledSkill[]>>> = {
  vanguard: {
    wind: [
      { name: 'Dance of the Crescent', tag: 'evade', rank: 4 },
      { name: 'Tactical Parry', tag: 'insight', rank: 3 },
      { name: 'Gale Edge Slash', tag: 'power', rank: 4 },
    ],
    water: [
      { name: 'Executioner Cleave', tag: 'power', rank: 4 },
      { name: 'Hidden Mist Shroud', tag: 'stealth', rank: 3 },
      { name: 'Tidal Guard', tag: 'resist', rank: 3 },
    ],
    earth: [
      { name: 'Chakra Blade Draw', tag: 'power', rank: 4 },
      { name: 'Seal Interruption', tag: 'resist', rank: 3 },
      { name: 'Iron Footing', tag: 'survive', rank: 3 },
    ],
    fire: [
      { name: 'Blazing Hilt Guard', tag: 'power', rank: 4 },
      { name: 'Ember Counter', tag: 'resist', rank: 3 },
    ],
    lightning: [
      { name: 'Conductive Edge', tag: 'power', rank: 4 },
      { name: 'Quick-Draw Reflex', tag: 'evade', rank: 3 },
    ],
    any: [
      { name: 'Chakra Blade Clash', tag: 'power', rank: 3 },
      { name: 'Stance Guard', tag: 'resist', rank: 3 },
      { name: 'Frontline Discipline', tag: 'insight', rank: 3 },
    ],
  },
  marksman: {
    wind: [
      { name: 'Desert Wind Gust', tag: 'power', rank: 3 },
      { name: 'Sand-Horizon Read', tag: 'insight', rank: 4 },
      { name: 'Cyclone Fan Screen', tag: 'evade', rank: 3 },
    ],
    fire: [
      { name: 'Flare Senbon Volley', tag: 'evade', rank: 3 },
      { name: 'Perimeter Sight', tag: 'insight', rank: 4 },
      { name: 'Cinder Wire Line', tag: 'power', rank: 3 },
    ],
    earth: [
      { name: 'Chakra Thread Snare', tag: 'insight', rank: 4 },
      { name: 'Canopy Ambush', tag: 'stealth', rank: 3 },
      { name: 'Resin Anchor Shot', tag: 'power', rank: 3 },
    ],
    water: [
      { name: 'Rain-Needle Arc', tag: 'insight', rank: 4 },
      { name: 'Mist Rangefinder', tag: 'stealth', rank: 3 },
    ],
    lightning: [
      { name: 'Magnetized Kunai Line', tag: 'power', rank: 4 },
      { name: 'Spark-Trail Sight', tag: 'insight', rank: 3 },
    ],
    any: [
      { name: 'Wire-Guided Volley', tag: 'insight', rank: 4 },
      { name: 'Elevation Read', tag: 'evade', rank: 3 },
    ],
  },
  striker: {
    lightning: [
      { name: 'White Chakra Tanto', tag: 'power', rank: 4 },
      { name: 'Battlefield Read', tag: 'insight', rank: 4 },
      { name: 'Lightning Flicker', tag: 'evade', rank: 4 },
      { name: 'Storm Cloak', tag: 'power', rank: 4 },
    ],
    water: [
      { name: 'Jetstream Dash', tag: 'evade', rank: 3 },
      { name: 'Pressure Piercer', tag: 'slayer', rank: 3 },
      { name: 'Torrent Surge', tag: 'power', rank: 4 },
    ],
    fire: [
      { name: 'Blazing Step', tag: 'evade', rank: 4 },
      { name: 'Scorch Lunge', tag: 'slayer', rank: 3 },
    ],
    wind: [
      { name: 'Vacuum Piercer', tag: 'power', rank: 4 },
      { name: 'Squall Footwork', tag: 'evade', rank: 4 },
    ],
    earth: [
      { name: 'Quake-Step Charge', tag: 'power', rank: 4 },
      { name: 'Basalt Knuckle', tag: 'resist', rank: 3 },
    ],
    any: [
      { name: 'Body Flicker Burst', tag: 'evade', rank: 4 },
      { name: 'Piercing Drive', tag: 'power', rank: 3 },
    ],
  },
  skirmisher: {
    wind: [
      { name: 'Dune Step', tag: 'evade', rank: 4 },
      { name: 'Sand Binding Cloth', tag: 'resist', rank: 3 },
      { name: 'Tailwind Pivot', tag: 'insight', rank: 3 },
    ],
    lightning: [
      { name: 'Cloud-Style Feint', tag: 'evade', rank: 4 },
      { name: 'Overthinking Prep', tag: 'insight', rank: 3 },
      { name: 'Static Sidestep', tag: 'evade', rank: 3 },
    ],
    water: [
      { name: 'Puddle Clone', tag: 'evade', rank: 4 },
      { name: 'Rain Sense', tag: 'stealth', rank: 3 },
      { name: 'Slipstream Feint', tag: 'insight', rank: 3 },
    ],
    fire: [
      { name: 'Smoke Screen Step', tag: 'evade', rank: 4 },
      { name: 'Ash Trail Decoy', tag: 'stealth', rank: 3 },
    ],
    earth: [
      { name: 'Subterranean Shift', tag: 'stealth', rank: 4 },
      { name: 'Scree Scramble', tag: 'evade', rank: 3 },
    ],
    any: [
      { name: 'Decoy Step', tag: 'evade', rank: 4 },
      { name: 'Flank Read', tag: 'insight', rank: 3 },
    ],
  },
  artificer: {
    earth: [
      { name: 'Iron Puppet Guard', tag: 'fort', rank: 4 },
      { name: 'Concealed Poison Gas', tag: 'power', rank: 3 },
      { name: 'Detonating Clay Traps', tag: 'fort', rank: 4 },
      { name: 'Blast Barrage', tag: 'power', rank: 4 },
    ],
    water: [
      { name: 'Whirlpool Barrier', tag: 'fort', rank: 5 },
      { name: 'Vitality Reserve', tag: 'regen', rank: 4 },
      { name: 'Tidal Ink Ward', tag: 'resist', rank: 3 },
    ],
    fire: [
      { name: 'Paper-Bomb Array', tag: 'fort', rank: 4 },
      { name: 'Thermal Trigger', tag: 'power', rank: 4 },
    ],
    wind: [
      { name: 'Gale Tripwire', tag: 'fort', rank: 4 },
      { name: 'Pressure Seal', tag: 'insight', rank: 3 },
    ],
    lightning: [
      { name: 'Static Perimeter Net', tag: 'fort', rank: 4 },
      { name: 'Arc Beacon', tag: 'insight', rank: 4 },
    ],
    any: [
      { name: 'Perimeter Seal', tag: 'fort', rank: 4 },
      { name: 'Trap Trigger', tag: 'power', rank: 3 },
    ],
  },
  infiltrator: {
    fire: [
      { name: 'Counter-Interrogation', tag: 'resist', rank: 4 },
      { name: 'Shadow Wire', tag: 'stealth', rank: 4 },
      { name: 'Cinder Veil', tag: 'evade', rank: 3 },
    ],
    water: [
      { name: 'Soundless Footwork', tag: 'stealth', rank: 5 },
      { name: 'Vital Point Strike', tag: 'slayer', rank: 4 },
      { name: 'Silent Mist Step', tag: 'evade', rank: 4 },
    ],
    wind: [
      { name: 'Auditory Genjutsu', tag: 'insight', rank: 5 },
      { name: 'Phantom Decoy', tag: 'evade', rank: 3 },
      { name: 'Whisper Cut', tag: 'slayer', rank: 4 },
    ],
    lightning: [
      { name: 'Nerve-Tap Cut', tag: 'slayer', rank: 4 },
      { name: 'Shadow Flicker', tag: 'stealth', rank: 4 },
    ],
    earth: [
      { name: 'Silent Burrow', tag: 'stealth', rank: 4 },
      { name: 'Dust-Blind Ambush', tag: 'slayer', rank: 4 },
    ],
    any: [
      { name: 'Soundless Approach', tag: 'stealth', rank: 4 },
      { name: 'Precision Strike', tag: 'slayer', rank: 4 },
    ],
  },
  juggernaut: {
    fire: [
      { name: 'Expansion Guard', tag: 'power', rank: 4 },
      { name: 'Second Wind', tag: 'survive', rank: 3 },
      { name: 'Calorie Surge', tag: 'regen', rank: 3 },
    ],
    water: [
      { name: 'Chakra-Draining Edge', tag: 'power', rank: 4 },
      { name: 'Tidal Stamina', tag: 'regen', rank: 4 },
      { name: 'Undertow Guard', tag: 'resist', rank: 4 },
    ],
    earth: [
      { name: 'Granite Skin', tag: 'resist', rank: 5 },
      { name: 'Unbreakable Stance', tag: 'survive', rank: 4 },
      { name: 'Bedrock Brace', tag: 'fort', rank: 4 },
    ],
    lightning: [
      { name: 'Thunder-Forged Frame', tag: 'resist', rank: 4 },
      { name: 'Shockwave Brace', tag: 'power', rank: 4 },
    ],
    wind: [
      { name: 'Cyclone Bulwark', tag: 'resist', rank: 4 },
      { name: 'Gale-Anchored Stance', tag: 'survive', rank: 4 },
    ],
    any: [
      { name: 'Fortress Guard', tag: 'resist', rank: 4 },
      { name: 'Enduring Will', tag: 'survive', rank: 3 },
    ],
  },
  rogue_s: {
    fire: [
      { name: 'Crow Illusion Shift', tag: 'evade', rank: 5 },
      { name: 'Crimson Eye Read', tag: 'insight', rank: 5 },
    ],
    lightning: [
      { name: 'Tagged Kunai Blink', tag: 'evade', rank: 5 },
      { name: 'Flee-on-Sight Speed', tag: 'power', rank: 5 },
    ],
    wind: [
      { name: 'Black Receiver Resonance', tag: 'insight', rank: 5 },
      { name: 'Repulsive Ward', tag: 'resist', rank: 5 },
    ],
    water: [
      { name: 'Abyssal Mist Veil', tag: 'stealth', rank: 5 },
      { name: 'Severed-Bond Surge', tag: 'slayer', rank: 4 },
    ],
    earth: [
      { name: 'Forbidden Core Armor', tag: 'resist', rank: 5 },
      { name: 'Seismic Rupture', tag: 'power', rank: 5 },
    ],
    any: [
      { name: 'Familiar Footwork', tag: 'insight', rank: 4 },
      { name: 'Rogue Resolve', tag: 'power', rank: 4 },
    ],
  },
};

export const ULTIMATE_POOL: Record<CombatArchetype, Partial<Record<ChakraElement | 'any', readonly UltimateDef[]>>> = {
  vanguard: {
    wind: [
      {
        name: 'Three-Shadow Crescent Tempest',
        role: 'attack',
        scope: 'single',
        rankVal: 4.2,
        cost: 24,
        desc: 'Three wind-sharpened mirror strikes converging from every blind spot.',
      },
    ],
    water: [
      {
        name: 'Great Mist Severing Torrent',
        role: 'attack',
        scope: 'squad',
        rankVal: 4.5,
        cost: 28,
        desc: 'Unleashes a pressurized water crescent through blinding sea fog.',
      },
    ],
    earth: [
      {
        name: 'Flash of the Winter Peak',
        role: 'attack',
        scope: 'single',
        rankVal: 4.6,
        cost: 25,
        desc: 'An instantaneous chakra-edged draw cut before hand seals can complete.',
      },
    ],
    fire: [
      {
        name: 'Blazing Hilt Severance',
        role: 'attack',
        scope: 'single',
        rankVal: 4.3,
        cost: 25,
        desc: 'A superheated blade arc that cleaves straight through wooden and earth wards.',
      },
    ],
    lightning: [
      {
        name: 'Thunder-Split Iaido',
        role: 'attack',
        scope: 'single',
        rankVal: 4.4,
        cost: 26,
        desc: 'A crackling high-frequency blade draw that numbs any parrying arm.',
      },
    ],
    any: [
      {
        name: 'Crescent Severing Rush',
        role: 'attack',
        scope: 'single',
        rankVal: 4.1,
        cost: 24,
        desc: 'A committed chakra-blade lunge aimed straight through enemy guard.',
      },
    ],
  },
  marksman: {
    wind: [
      {
        name: 'Sky-Slicing Monsoon Fan',
        role: 'attack',
        scope: 'fortress',
        rankVal: 4.7,
        cost: 30,
        desc: 'Levels an entire forest strip with razor-sharp cyclonic blades.',
      },
    ],
    fire: [
      {
        name: 'Crimson Phoenix Needle Barrage',
        role: 'attack',
        scope: 'squad',
        rankVal: 4.3,
        cost: 26,
        desc: 'Ignites a storm of wire-guided incendiary needles across the clearing.',
      },
    ],
    earth: [
      {
        name: 'Piercing Horn of the Canopy',
        role: 'attack',
        scope: 'single',
        rankVal: 4.5,
        cost: 26,
        desc: 'A hyper-spun chakra arrow guided by silk filaments straight for vitals.',
      },
    ],
    water: [
      {
        name: 'Monsoon Senbon Hail',
        role: 'attack',
        scope: 'squad',
        rankVal: 4.3,
        cost: 25,
        desc: 'Blankets every escape route in pressurized needles condensed from fog.',
      },
    ],
    lightning: [
      {
        name: 'Rail-Wire Volt Volley',
        role: 'attack',
        scope: 'single',
        rankVal: 4.4,
        cost: 26,
        desc: 'Launches twin steel bolts accelerated along charged chakra wires.',
      },
    ],
    any: [
      {
        name: 'Horizon Needle Barrage',
        role: 'attack',
        scope: 'squad',
        rankVal: 4.2,
        cost: 25,
        desc: 'A sweeping storm of chakra-guided projectiles from elevated cover.',
      },
    ],
  },
  striker: {
    lightning: [
      {
        name: 'Lightning Cutter Mirage',
        role: 'attack',
        scope: 'single',
        rankVal: 4.7,
        cost: 28,
        desc: 'A blinding high-velocity thrust guided by sharp combat anticipation.',
      },
      {
        name: 'Black Panther Thunder Lariat',
        role: 'attack',
        scope: 'single',
        rankVal: 4.8,
        cost: 29,
        desc: 'Cloaks the body in crackling lightning for an unstoppable blitz impact.',
      },
    ],
    water: [
      {
        name: 'Roaring Waterfall Spear',
        role: 'attack',
        scope: 'single',
        rankVal: 4.4,
        cost: 26,
        desc: 'Compresses torrential water into a needle-thin armor-piercing lance.',
      },
    ],
    fire: [
      {
        name: 'Meteor Flash Thrust',
        role: 'attack',
        scope: 'single',
        rankVal: 4.4,
        cost: 26,
        desc: 'A blistering flame-cloaked sprint that detonates on first contact.',
      },
    ],
    wind: [
      {
        name: 'Gale Piercing Fang',
        role: 'attack',
        scope: 'single',
        rankVal: 4.4,
        cost: 26,
        desc: 'Spirals vacuum-compressed wind around a single lethal strike.',
      },
    ],
    earth: [
      {
        name: 'Shatter-Stone Charge',
        role: 'attack',
        scope: 'single',
        rankVal: 4.4,
        cost: 26,
        desc: 'Hardens the leading limb into dense basalt for a guard-breaking ram.',
      },
    ],
    any: [
      {
        name: 'Flash Piercing Lance',
        role: 'attack',
        scope: 'single',
        rankVal: 4.3,
        cost: 26,
        desc: 'A high-velocity elemental spear thrust built to break walls.',
      },
    ],
  },
  skirmisher: {
    wind: [
      {
        name: 'Whirling Cloth Shroud',
        role: 'wall',
        scope: 'single',
        rankVal: 4.2,
        cost: 23,
        desc: 'Wraps the user in chakra-woven banners that deflect incoming strikes.',
      },
    ],
    lightning: [
      {
        name: 'Cloud-Style Reverse Crescent',
        role: 'attack',
        scope: 'single',
        rankVal: 4.3,
        cost: 24,
        desc: 'A deceptive backward lunge that turns a retreat into a counter-slash.',
      },
    ],
    water: [
      {
        name: 'Endless Downpour Mirage',
        role: 'field',
        scope: 'squad',
        rankVal: 4.1,
        cost: 24,
        desc: 'Floods the arena with illusory rain clones that drain enemy stamina.',
      },
    ],
    fire: [
      {
        name: 'Cinder Mirage Step',
        role: 'field',
        scope: 'squad',
        rankVal: 4.1,
        cost: 24,
        desc: 'Scatters smoldering clones that blind and herd rival fighters.',
      },
    ],
    earth: [
      {
        name: 'Shifting Gravel Decoy',
        role: 'wall',
        scope: 'single',
        rankVal: 4.1,
        cost: 24,
        desc: 'Raises sudden earthen screens while slipping to an open flank.',
      },
    ],
    any: [
      {
        name: 'Whirling Mirage Ambush',
        role: 'field',
        scope: 'squad',
        rankVal: 4.0,
        cost: 24,
        desc: 'Scatters mobile clones to control terrain and sap enemy focus.',
      },
    ],
  },
  artificer: {
    earth: [
      {
        name: 'Black Iron Marionette Theater',
        role: 'debuff',
        scope: 'squad',
        rankVal: 4.6,
        cost: 28,
        desc: 'Three armored war puppets lock down the terrain with poison blades and shields.',
      },
      {
        name: 'C3 Dawn Detonation',
        role: 'attack',
        scope: 'fortress',
        rankVal: 4.9,
        cost: 33,
        desc: 'Drops a towering clay sculpture packed with unstable explosive chakra.',
      },
    ],
    water: [
      {
        name: 'Grand Spiral Sealing Cage',
        role: 'wall',
        scope: 'fortress',
        rankVal: 4.8,
        cost: 30,
        desc: 'Raises glowing crimson sealing script that crushes hostile chakra output.',
      },
    ],
    fire: [
      {
        name: 'Tandem Explosive Matrix',
        role: 'attack',
        scope: 'fortress',
        rankVal: 4.6,
        cost: 29,
        desc: 'Ignites a chain of concealed paper-bomb glyphs ringing the clearing.',
      },
    ],
    wind: [
      {
        name: 'Vacuum Snare Array',
        role: 'debuff',
        scope: 'squad',
        rankVal: 4.4,
        cost: 26,
        desc: 'Triggers howling air-pressure seals that strip footing and balance.',
      },
    ],
    lightning: [
      {
        name: 'Four-Pillar Static Cage',
        role: 'wall',
        scope: 'fortress',
        rankVal: 4.5,
        cost: 28,
        desc: 'Links four chakra rods into a crackling barrier that shocks attackers.',
      },
    ],
    any: [
      {
        name: 'Concentric Barrier Matrix',
        role: 'wall',
        scope: 'fortress',
        rankVal: 4.3,
        cost: 26,
        desc: 'Activates layered sealing ink that absorbs blows and pins terrain.',
      },
    ],
  },
  infiltrator: {
    fire: [
      {
        name: 'Scorching Iron Interrogation Net',
        role: 'debuff',
        scope: 'single',
        rankVal: 4.3,
        cost: 25,
        desc: 'Snares the target in superheated chains that sap willpower and chakra.',
      },
    ],
    water: [
      {
        name: 'Zero-Sound Mist Execution',
        role: 'attack',
        scope: 'single',
        rankVal: 4.6,
        cost: 26,
        desc: 'Erases all scent and footsteps before delivering a precision spinal strike.',
      },
    ],
    wind: [
      {
        name: 'Chains of the Moonless Melody',
        role: 'debuff',
        scope: 'squad',
        rankVal: 4.6,
        cost: 27,
        desc: 'Weaves a haunting cadence that freezes muscles and shatters focus.',
      },
    ],
    lightning: [
      {
        name: 'Blackout Nerve Sever',
        role: 'attack',
        scope: 'single',
        rankVal: 4.5,
        cost: 26,
        desc: 'A silent static touch that scrambles motor signals in a single breath.',
      },
    ],
    earth: [
      {
        name: 'Grave-Shadow Ambush',
        role: 'attack',
        scope: 'single',
        rankVal: 4.4,
        cost: 25,
        desc: 'Rises straight through the earth beneath the opponent without warning.',
      },
    ],
    any: [
      {
        name: 'Shadowless Vital Cut',
        role: 'attack',
        scope: 'single',
        rankVal: 4.3,
        cost: 25,
        desc: 'Erases presence completely before delivering a lethal ambush cut.',
      },
    ],
  },
  juggernaut: {
    fire: [
      {
        name: 'Crimson Butterfly Palm Crash',
        role: 'attack',
        scope: 'squad',
        rankVal: 4.7,
        cost: 30,
        desc: 'Converts deep vitality into blazing chakra wings for a ground-shattering slam.',
      },
    ],
    water: [
      {
        name: 'Great Shark Bomb Deluge',
        role: 'attack',
        scope: 'fortress',
        rankVal: 4.8,
        cost: 32,
        desc: 'Summons a monstrous shark of surging water that feeds on rival jutsu.',
      },
    ],
    earth: [
      {
        name: 'Twin Tectonic Mountain Press',
        role: 'attack',
        scope: 'fortress',
        rankVal: 4.9,
        cost: 32,
        desc: 'Raises two basalt cliffs on either side of the foe and slams them shut.',
      },
    ],
    lightning: [
      {
        name: 'Thunder-Anvil Slam',
        role: 'attack',
        scope: 'squad',
        rankVal: 4.7,
        cost: 30,
        desc: 'Drops like a falling anvil wrapped in deafening static shockwaves.',
      },
    ],
    wind: [
      {
        name: 'Tempest Rampart Quake',
        role: 'attack',
        scope: 'squad',
        rankVal: 4.6,
        cost: 29,
        desc: 'Drives a crushing dome of compressed air outward from heavy footing.',
      },
    ],
    any: [
      {
        name: 'Tectonic Rampart Smash',
        role: 'attack',
        scope: 'squad',
        rankVal: 4.5,
        cost: 28,
        desc: 'Channels overwhelming physical weight into a ground-shattering slam.',
      },
    ],
  },
  rogue_s: {
    fire: [
      {
        name: 'Black Flame Moonfall',
        role: 'attack',
        scope: 'squad',
        rankVal: 5.4,
        cost: 35,
        desc: 'Ignites inextinguishable black flames within an illusionary crimson moon.',
      },
    ],
    lightning: [
      {
        name: 'Spiral Flash Barrage',
        role: 'attack',
        scope: 'squad',
        rankVal: 5.3,
        cost: 34,
        desc: 'Blinks between sealing markers to slam a roaring chakra sphere home.',
      },
    ],
    wind: [
      {
        name: 'Heavenly Gravity Collapse',
        role: 'attack',
        scope: 'battlefield',
        rankVal: 5.5,
        cost: 36,
        desc: 'Crushes the entire battlefield beneath a sudden wave of repulsive force.',
      },
    ],
    water: [
      {
        name: 'Abyssal Vortex Severance',
        role: 'attack',
        scope: 'fortress',
        rankVal: 5.2,
        cost: 34,
        desc: 'Calls down a crushing black whirlpool that swallows steel and seals alike.',
      },
    ],
    earth: [
      {
        name: 'Cataclysmic Obsidian Spire',
        role: 'attack',
        scope: 'fortress',
        rankVal: 5.2,
        cost: 34,
        desc: 'Tears jagged pillars of dark stone across the entire valley floor.',
      },
    ],
    any: [
      {
        name: 'Severed-Bond Secret Technique',
        role: 'attack',
        scope: 'squad',
        rankVal: 4.6,
        cost: 28,
        desc: 'A ruthless forbidden-tinged burst forged outside village law.',
      },
    ],
  },
};

export const LINE_POOL: Record<CombatArchetype, Partial<Record<NpcTactic | 'any', readonly CombatLineSet[]>>> = {
  vanguard: {
    defensive: [
      {
        meet: '{name} raises a slim katana calmly. "Step back if you value tomorrow."',
        clash: 'Three translucent silhouettes fan outward in a shimmering arc around {name}.',
        win: '{name} lowers the tip, leaving you breathing only if you stay down.',
        fall: 'A cough breaks {their} stance as the moonlit silhouettes scatter.',
      },
    ],
    reckless: [
      {
        meet: 'The fog thickens around steel. "Let us see if your neck holds against real iron."',
        clash: 'Surging chakra roars down {their} broad blade as {they} lunge forward.',
        win: '{name} wipes crimson mist off the flat of {their} sword without slowing.',
        fall: '{Their} heavy blade jams upright into the mud as {their} knees finally give.',
      },
    ],
    proud: [
      {
        meet: '{Their} thumb nudges the hilt guard free. "Name yourself before steel speaks."',
        clash: 'Cold blue chakra flashes cleanly along {their} curving edge.',
        win: '{name} flicks dust from the blade and sheathes it in one measured motion.',
        fall: '{name} kneels upright beside {their} cracked scabbard with calm eyes.',
      },
    ],
    any: [
      {
        meet: '"Draw steel. Let us settle this cleanly."',
        clash: 'Sparks burst between clashing blades across the clearing.',
        win: '{name} steadies {their} stance over the bruised ground.',
        fall: '{Their} blade drops into the dust as {their} guard finally yields.',
      },
    ],
  },
  marksman: {
    cunning: [
      {
        meet: 'Three iron ribs snap open in the breeze. "Come closer if you dare."',
        clash: 'Howling gusts tear bark clean off the surrounding pines.',
        win: '{name} snaps the weapon shut as shredded leaves rain down.',
        fall: '{Their} bent weapon clatters against stone as {they} drop to one knee.',
      },
    ],
    defensive: [
      {
        meet: 'Sparks dance between {their} gloved knuckles. "You crossed the wrong ridge."',
        clash: 'Hundreds of glowing needles arc overhead like falling embers.',
        win: '{name} steps back into the tall grass before the smoke settles.',
        fall: '{Their} wire spools tangle as {they} collapse behind a charred stump.',
      },
    ],
    hunter: [
      {
        meet: 'A taut golden thread hums beside your ear. "Found a fun prey."',
        clash: 'The bowstring snaps with a crack like splitting timber.',
        win: '{name} clicks {their} tongue from the treetops, already tallying the distance.',
        fall: '{Their} anchor lines snap, tumbling {them} hard through the brush.',
      },
    ],
    any: [
      {
        meet: '"You walked into my sightline ten paces ago."',
        clash: 'Volleys of steel hiss through the upper canopy.',
        win: '{name} slips back into elevated cover before the smoke clears.',
        fall: '{Their} vantage crumbles as {they} drop hard into the brush.',
      },
    ],
  },
  striker: {
    cunning: [
      {
        meet: 'A quiet sigh escapes {their} mask. "Let us finish this quickly."',
        clash: 'A chorus of shrieking birds erupts around {their} glowing palm.',
        win: '{name} checks your pulse briefly, confirms the fight is over, and departs.',
        fall: '{Their} chakra light fades as {they} drop to one knee clutching {their} ribs.',
      },
    ],
    reckless: [
      {
        meet: 'Arcs of blue lightning snap off {their} shoulders. "Try keeping up!"',
        clash: 'The air smells sharply of ozone as {they} vanish into a streak of light.',
        win: '{name} grins through rising steam, chakra humming along {their} knuckles.',
        fall: 'Static sputters out as {they} skid across the dirt, stunned by {their} own recoil.',
      },
    ],
    hunter: [
      {
        meet: 'Mist coils cleanly around {their} forearm. "No trespassers leave intact."',
        clash: 'A pressurized spear of chakra hisses straight toward your chest.',
        win: '{name} disperses the surge into cool spray and turns back toward the ridge.',
        fall: '{Their} spear bursts harmlessly as exhaustion drags {them} down.',
      },
    ],
    any: [
      {
        meet: '"Blink once and this duel is over."',
        clash: 'A blinding streak of chakra tears across the clearing.',
        win: '{name} skids to a halt, breathing hard through static sparks.',
        fall: 'Overextended momentum sends {them} crashing across the dirt.',
      },
    ],
  },
  skirmisher: {
    defensive: [
      {
        meet: 'White cloth ribbons whip through the wind. "You are already on my map."',
        clash: 'The woven binding hardens like steel against the impact.',
        win: '{name} knots a quick snare and vanishes over the next ridge.',
        fall: 'Torn cloth flutters loose as {they} retreat limping into the dust.',
      },
      {
        meet: '{name} chews a wooden stem nervously. "What if you blow up the whole valley?"',
        clash: '{Their} awkward footwork suddenly snaps into razor-clean swordsmanship.',
        win: '{name} exhales loudly. "Good, I survived scenario forty-two."',
        fall: '{name} grimaces and throws smoke before taking another direct hit.',
      },
    ],
    cunning: [
      {
        meet: 'A dozen identical figures step out of shallow puddles. "Guess which one bleeds."',
        clash: 'Cold raindrops turn sharp as needles across the darkened clearing.',
        win: '{Their} clones dissolve into mud as the real shinobi slips away.',
        fall: 'The illusions pop one by one until {they} hit the wet cobbles alone.',
      },
    ],
    any: [
      {
        meet: '"Try pinning down a shadow in open woods."',
        clash: 'Decoys burst into smoke across three separate flanks.',
        win: '{name} vanishes cleanly into the treeline once the exchange breaks.',
        fall: '{Their} final clone pops, leaving {them} cornered and winded.',
      },
    ],
  },
  artificer: {
    cunning: [
      {
        meet: 'Wooden joints clack inside a bandaged bundle. "Care to meet my latest work?"',
        clash: 'Three lacquered puppets burst from smoke in synchronized jaws.',
        win: '{name} reels the chakra strings back cleanly, smiling behind face paint.',
        fall: 'Splintered wood rains down as {their} main puppet collapses in pieces.',
      },
    ],
    reckless: [
      {
        meet: 'White clay birds flutter lazily overhead. "Hope you appreciate real art!"',
        clash: 'A blinding flash shakes loose boulders across the ridge.',
        win: '{name} laughs through drifting soot, already kneading another figure.',
        fall: '{Their} remaining clay misfires harmlessly as {they} crash into a crater.',
      },
    ],
    defensive: [
      {
        meet: 'Crimson ink flares along paper talismans around {their} boots. "Tread carefully."',
        clash: 'Runes bloom across the earth like a luminous whirlpool.',
        win: '{Their} sealing circle dims gently once your weapon hits the soil.',
        fall: 'Paper tags tear apart in the wind as {their} barrier shatters.',
      },
    ],
    any: [
      {
        meet: '"Every step you just took armed my perimeter."',
        clash: 'Sealing ink flashes across the soil in geometric arcs.',
        win: '{name} rolls a fresh scroll shut as the smoke settles.',
        fall: '{Their} paper seals tear loose in the shockwave.',
      },
    ],
  },
  infiltrator: {
    defensive: [
      {
        meet: '{name} studies your breathing calmly. "Your posture already told me three secrets."',
        clash: 'Glowing iron wire snaps tight out of the darkened grass.',
        win: '{name} pockets the captured intel scroll and vanishes into dusk.',
        fall: '{name} burns {their} own cipher strip before losing consciousness.',
      },
    ],
    hunter: [
      {
        meet: 'You hear nothing until cold steel touches your collar shadow.',
        clash: 'Only a ripple in the fog marks where {their} blade passes.',
        win: '{name} wipes {their} kunai cleanly and melts back into the damp cedar line.',
        fall: '{Their} ceramic mask cracks in half as {they} fade backward into mist.',
      },
    ],
    cunning: [
      {
        meet: 'A single clear note hangs in the twilight, turning your shadow heavy.',
        clash: 'Dissonant chords twist the treetops into grasping nightmares.',
        win: '{name} lowers the instrument while you struggle to stand upright.',
        fall: 'A stray strike snaps the focus in two, shattering the illusion instantly.',
      },
    ],
    any: [
      {
        meet: 'Cold steel glints out of the shadows without a sound.',
        clash: 'Only a brief flicker of mist marks {their} striking line.',
        win: '{name} wipes {their} kunai cleanly and melts back into darkness.',
        fall: 'A mistimed step exposes {their} flank to a decisive counter.',
      },
    ],
  },
  juggernaut: {
    defensive: [
      {
        meet: '{name} plants both feet wide across the bridge. "Nobody crosses while I stand."',
        clash: 'Blazing chakra condenses around {their} giant palm with thunderous force.',
        win: '{name} catches {their} breath heavily, relieved the bridge still stands.',
        fall: '{Their} heavy stance collapses in a cloud of steam as exhaustion claims {them}.',
      },
    ],
    reckless: [
      {
        meet: 'A sharp grin splits {their} face. "Smells like plenty of chakra on you."',
        clash: 'A roaring tidal wave surges forward, swallowing boulders whole.',
        win: '{name} laughs softly over the shattered clearing, barely winded.',
        fall: 'The surge recedes around {them} as {their} immense strength finally ebbs.',
      },
    ],
    proud: [
      {
        meet: 'Gravel trembles under {their} boots. "Hit me with your best jutsu first."',
        clash: 'Two colossal slabs of raw bedrock erupt out of the valley floor.',
        win: '{name} dusts crushed rock off {their} knuckles like rain.',
        fall: '{Their} granite armor fissures across the chest as {they} finally topple.',
      },
    ],
    any: [
      {
        meet: '"Break my guard first, if you think you can."',
        clash: 'The ground shudders beneath heavy chakra-reinforced blows.',
        win: '{name} exhales slowly, barely moved from {their} original footing.',
        fall: '{Their} heavy guard finally fractures under relentless pressure.',
      },
    ],
  },
  rogue_s: {
    defensive: [
      {
        meet: 'Two cold eyes gleam beneath a woven hat. "Do not look directly at me."',
        clash: 'Dark silhouettes burst into scorching embers across the darkened sky.',
        win: '{name} turns away quietly, leaving you alive to question what you saw.',
        fall: '{name} staggers back and dissolves into a final swirl of shadows.',
      },
    ],
    hunter: [
      {
        meet: 'A marked kunai lands inches from your boot before {name} blinks beside you.',
        clash: 'Blinding sparks streak across six points in a single heartbeat.',
        win: '{name} vanishes in a flash, leaving only a sealed note warning your camp to withdraw.',
        fall: '{Their} marker shatters cleanly, forcing {them} to pull back from the field.',
      },
    ],
    cunning: [
      {
        meet: 'Raindrops hang frozen in midair around {name}. "You fight for a fragile illusion."',
        clash: 'The ground cracks in a wide ring as invisible pressure slams downward.',
        win: '{name} steps over the crater in silence as the wind resumes.',
        fall: 'The pressure lifts abruptly, leaving only a torn dark cloak in the mud.',
      },
    ],
    any: [
      {
        meet: '"No village owns me anymore. Step aside or fall."',
        clash: 'Fierce unrestrained chakra erupts across the clearing.',
        win: '{name} steps past the crater without looking back.',
        fall: '{Their} scratched headband slips into the mud as {they} collapse.',
      },
    ],
  },
};

export const MOTIVE_POOL: Record<NpcMotivation, readonly string[]> = {
  protect_village: [
    'End the sector war swiftly so younger shinobi of {village} return home.',
    'Hold the border line for {village} without yielding a single pace.',
    'Shield allied camps and keep {village} out of foreign crossfire.',
  ],
  attain_kage: [
    'Climb straight to the high council of {village} through battlefield glory.',
    'Prove {they} possess the strength and vision to lead {village}.',
  ],
  restore_clan: [
    'Bring lasting honor to {their} house across the Five Great Nations.',
    'Preserve ancient clan arts from fading beneath foreign pressure.',
  ],
  seek_power: [
    'Test {their} reserves against the strongest rivals in the sector.',
    'Refine {their} signature craft until no defense can withstand it.',
  ],
  avenge_loss: [
    'Carry fallen comrades\' wills forward and settle an unpaid blood debt.',
    'Ensure {village} is never again crushed as a battlefield for giants.',
  ],
  peace_reformer: [
    'End the border war in a decisive stroke before further casualties mount.',
    'Watch the conflict closely to prevent a far greater catastrophe.',
  ],
  shadow_control: [
    'Protect {village} ciphers and erase rogue intel leaks before they spread.',
    'Dictate every frontier clash from the shadows before armies march.',
  ],
  wanderer_freedom: [
    'Walk a free road beyond any council desk or village leash.',
    'Outlive every old master and claim true autonomy by force.',
  ],
};

export const ORIGIN_POOL: Record<CombatArchetype, readonly string[]> = {
  vanguard: [
    'Trains in relentless frontline bladework honed in {village}.',
    'Carries a chipped war blade tempered through border skirmishes.',
  ],
  marksman: [
    'Uses waxed senbon and long-range wind reads taught in {village}.',
    'Leaves taut chakra anchor lines high among the border ridges.',
  ],
  striker: [
    'Radiates sharp high-velocity bursts forged in {village} shock drills.',
    'Carries a short chakra-conductive blade strapped across {their} lower back.',
  ],
  skirmisher: [
    'Moves with acrobatic scout footwork drilled along the {village} frontier.',
    'Relies on layered decoys and quick terrain reads to stay ahead of ambushes.',
  ],
  artificer: [
    'Carries sealing ink scrolls and concealed mechanism cases from {village}.',
    'Sets layered perimeter traps before committing to any direct clash.',
  ],
  infiltrator: [
    'Bears the quiet discipline of {village}\'s covert counter-intel corps.',
    'Moves with low-glare steel and silent footwork tuned for night ops.',
  ],
  juggernaut: [
    'Stands with the unshakable frontline posture of {village}\'s heavy guard.',
    'Channels deep physical reserves built to weather full squad volleys.',
  ],
  rogue_s: [
    'Listed in regional Bingo Books as a dangerous Missing-Nin from {village}.',
    'Wears a deeply gouged {village} headband and fights without restraint.',
  ],
};

export const EPITHET_PARTS = {
  elementPrefix: {
    fire: ['Crimson', 'Ember', 'Ash', 'Blazing', 'Cinder'],
    wind: ['Gale', 'Zephyr', 'Crescent', 'Monsoon', 'Horizon'],
    lightning: ['Thunder', 'Silver', 'Storm', 'Static', 'Flash'],
    earth: ['Iron', 'Granite', 'Basalt', 'Stone', 'Obsidian'],
    water: ['Mist', 'Tidal', 'Rain', 'Cataract', 'Undertow'],
  } as Record<ChakraElement, readonly string[]>,
  villagePrefix: {
    konoha: ['Leaf', 'Cedar', 'Will'],
    suna: ['Dune', 'Mirage', 'Desert'],
    kiri: ['Fog', 'Sea', 'Bloody-Mist'],
    kumo: ['Cloud', 'Peak', 'Lightning'],
    iwa: ['Mountain', 'Canyon', 'Crag'],
    ame: ['Downpour', 'Storm', 'Rain'],
    oto: ['Echo', 'Resonant', 'Dusk'],
    iron: ['Winter', 'White-Peak', 'Steel'],
    kusa: ['Briar', 'Grass', 'Ridge'],
    taki: ['Falls', 'Spring', 'Torrent'],
    uzushio: ['Spiral', 'Whirlpool', 'Rune'],
    waves: ['Harbor', 'Salt', 'Tide'],
  } as Record<VillageId, readonly string[]>,
  archetypeSuffix: {
    vanguard: ['Edge', 'Cleaver', 'Blade', 'Iaido'],
    marksman: ['Bow', 'Needle', 'Fan', 'Sight'],
    striker: ['Fang', 'Lance', 'Bolt', 'Spear'],
    skirmisher: ['Runner', 'Stepper', 'Phantom', 'Scout'],
    artificer: ['Sculptor', 'Weaver', 'Spiral', 'Tactician'],
    infiltrator: ['Cipher', 'Shadow', 'Whisper', 'Veil'],
    juggernaut: ['Boulder', 'Breaker', 'Bastion', 'Tide'],
    rogue_s: ['Exile', 'Reaper', 'Phantom', 'Omen'],
  } as Record<CombatArchetype, readonly string[]>,
};

export const WEAKNESS_LABELS: readonly [string, string, string, string, string] = [
  'fragile close-quarters guard',
  'slow footwork under pressure',
  'low stamina in prolonged duels',
  'poor chakra control',
  'telegraphed tactical reads',
];

export function buildProceduralEpithet(
  element: ChakraElement,
  villageId: VillageId,
  archetype: CombatArchetype,
  rng: SeededRng,
): string {
  const prefixes = rng.chance(0.65)
    ? EPITHET_PARTS.elementPrefix[element]
    : EPITHET_PARTS.villagePrefix[villageId];
  const suffixes = EPITHET_PARTS.archetypeSuffix[archetype];
  return `${rng.pick(prefixes)} ${rng.pick(suffixes)}`;
}

const PLACEHOLDER_RE = /\{(name|They|they|them|Their|their|village)\}/g;

/**
 * Renders procedural text templates containing {name}, {they}/{They}, {them}, {their}/{Their}, {village}.
 */
export function renderText(
  person: { name: string; sex: 'M' | 'F'; villageId: VillageId },
  text: string,
): string {
  if (!text.includes('{')) return text;
  const isM = person.sex === 'M';
  return text.replace(PLACEHOLDER_RE, (_m, key: string) => {
    switch (key) {
      case 'name':
        return person.name;
      case 'They':
        return isM ? 'He' : 'She';
      case 'they':
        return isM ? 'he' : 'she';
      case 'them':
        return isM ? 'him' : 'her';
      case 'Their':
        return isM ? 'His' : 'Her';
      case 'their':
        return isM ? 'his' : 'her';
      case 'village':
        return VILLAGE_MAP[person.villageId]?.name ?? person.villageId;
      default:
        return _m;
    }
  });
}
