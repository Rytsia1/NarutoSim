import { PARTNER_WAR_SCENES } from '../data/events-partner';
import { WAR_CROSSROADS } from '../data/events-war';
import { ELEMENT_NAMES } from '../data/powers';
import { ARCHETYPE_LABELS } from '../data/characters';
import { kageTitle, VILLAGES, VILLAGE_MAP } from '../data/villages';
import {
  calcAllyAcceptChance,
  computeBetrayScore,
  evaluateAllyFinalIntent,
  getRel,
  initWarRelations,
  modRel,
  runDailyStrategicPlanner,
} from './ai';
import {
  applyPermanentNpcInjury,
  competitorFromPerson,
  generateCharacter,
  getCompetitorLines,
  getPerson,
  isPersonAlive,
  killPerson,
  personName,
} from './people';
import {
  buildBattleRoundDecision,
  initBattleV2State,
  resolveBattleRound,
  resolveGate8Aftermath,
  resolveNpcSkirmish,
  skillSum,
} from './combat';
import { tryRareDojutsuTransplant } from './powers';
import {
  advanceCrisisPhase,
  buildConvictionBeatDecision,
  buildConvictionDuelDecision,
  buildCrisisAftermathDecision,
  buildCrisisBossDecision,
  canTriggerConvictionRoute,
  getMastermindDivisor,
  initWarCrisisState,
  resolveConvictionBeat,
  resolveConvictionDuelRound,
  resolveCrisisBossTurn,
  startConvictionRoute,
  syncCrisisCoalitionAllies,
} from './crises';
import { addLeaning, clampStats, killCharacter, pushLog, recordMemory } from './life';
import { generateWarChronicle, recordWarFact } from './narrative';
import { applyPlayerActionToWorldSim } from './world-sim';
import {
  adjustPartnerTrust,
  applyResolvePartnerReaction,
  createPermanentPartnerFromWar,
  getPartnerTrustTier,
  selectWarPartner,
  syncPartnerBackToState,
} from './partner';
import { clamp, computeCombatProjection } from './powers';
import { promoteRank } from './ranks';
import type { SeededRng } from './rng';
import { adjustMemberTrust, disbandGeninTeam } from './team';
import {
  baseWarGap,
  DEFAULT_WAR_SECONDS_PER_DAY,
  enqueueWarBeat,
  ensureWarClockDefaults,
  getWarBeatProgress,
  getWarDayProgress,
  queueDayDecision,
  queueNightDecision,
  queueNightSequence,
  queueWarStart,
} from './combat/war-clock';
import type {
  CombatArchetype,
  CrisisId,
  GameState,
  LeaningKey,
  PendingDecision,
  StatKey,
  WarCompetitor,
  WarState,
} from './types';

export {
  baseWarGap,
  DEFAULT_WAR_SECONDS_PER_DAY,
  enqueueWarBeat,
  ensureWarClockDefaults,
  getWarBeatProgress,
  getWarDayProgress,
  queueDayDecision,
  queueNightDecision,
  queueNightSequence,
  queueWarStart,
};

export function addEnemyIntel(enemy: WarCompetitor, delta: number): void {
  enemy.intel = clamp(enemy.intel + delta, 0, 100);
  if (enemy.intel >= 90) {
    enemy.skillsRevealed = true;
  }
}

export function markEnemyDead(war: WarState, victim: WarCompetitor): void {
  victim.alive = false;
  victim.hp = 0;
  victim.intel = 100;
  victim.skillsRevealed = true;
  victim.allyId = null;
  if (war.allyId === victim.id) {
    war.allyId = null;
  }
  for (const other of war.enemies) {
    if (other.allyId === victim.id) {
      other.allyId = null;
    }
  }
}

export function applyWarResultsToPeople(state: GameState, war: WarState): void {
  const year = state.birthYear + state.age;
  for (const e of war.enemies) {
    const person = getPerson(state, e.personId);
    if (person) {
      if (e.kills > 0) {
        person.identity.kills = (person.identity.kills ?? 0) + e.kills;
      }
      if (!e.alive && person.identity.alive) {
        killPerson(
          state,
          person.identity.id,
          person.identity.age,
          `fell during Great Shinobi War #${war.warNumber}`,
        );
      } else if (e.alive && e.hp > 0 && e.hp <= 25 && person.identity.alive) {
        // G4 Permanent Injury: surviving war with critical wounds scars future potential
        applyPermanentNpcInjury(person, year, `critical wounds from Great Shinobi War #${war.warNumber}`);
      }
    }
    if (!e.alive && state.team) {
      const mate = state.team.members.find((m) => m.personId === e.personId);
      if (mate) {
        mate.fateNote = `Fell during Great Shinobi War #${war.warNumber} at age ${person?.identity.age ?? state.age}.`;
      }
    }
  }
  if (war.partner?.died) {
    const partnerPerson = getPerson(state, war.partner.personId);
    killPerson(
      state,
      war.partner.personId,
      partnerPerson?.identity.age ?? state.age,
      `fell fighting beside ${state.name} in Great Shinobi War #${war.warNumber}`,
    );
  }
}

function hasActiveCrisis(war: WarState): boolean {
  return Boolean(war.crisis && !war.crisis.defeated);
}

function escalateToCrisisBoss(state: GameState, war: WarState): void {
  const c = war.crisis!;
  if (c.phase < 3) {
    c.phase = 3;
    syncCrisisCoalitionAllies(war);
    c.guardsActive = c.id === 'mastermind' ? Math.min(3, c.sentinelsLeft) : 0;
  } else {
    syncCrisisCoalitionAllies(war);
  }
  war.subPhase = 'final';
  war.beatQueue = [];
  war.beatClock = 0;
  pushLog(
    state,
    'crisis',
    `With the rival field cleared, ${c.bossName} descends into the crater for the decisive confrontation!`,
    { title: `${c.bossName} Descends!` },
  );
  state.pending = buildCrisisBossDecision(state);
}

const BASE_ARCHETYPES: readonly CombatArchetype[] = [
  'vanguard',
  'marksman',
  'striker',
  'skirmisher',
  'artificer',
  'infiltrator',
  'juggernaut',
];

/**
 * Initializes a full 14-day autonomous Shinobi Warfront (uniform 14 days at all ranks).
 * Every competitor is drawn from living world combatants or generated via CharacterGenerator,
 * then materialized through `competitorFromPerson` (which permanently marks them observed).
 */
export function initWarState(
  state: GameState,
  rng: SeededRng,
  isCrisisWar: boolean,
  approach: 'front' | 'flank',
): WarState {
  const partner = selectWarPartner(state, rng, new Set());
  const excludedPersonIds = new Set<string>([partner.personId]);
  const familyIds = new Set(state.family.map((f) => f.personId));
  const foreignVillages = VILLAGES.filter((v) => v.id !== state.villageId);
  const enemies: WarCompetitor[] = [];

  BASE_ARCHETYPES.forEach((arch, idx) => {
    // 1. Prefer an existing living combatant from another village matching this archetype
    const worldCandidates = (state.worldSim?.npcs ?? []).filter((n) => {
      const id = n.identity;
      if (!id.alive) return false;
      if (id.occupation !== 'shinobi' && id.occupation !== 'samurai') return false;
      if (id.age < 16 || (id.rank !== 'chunin' && id.rank !== 'jonin')) return false;
      if (id.specialStatus === 'kage') return false;
      if (id.villageId === state.villageId) return false;
      if (id.archetype !== arch) return false;
      if (excludedPersonIds.has(id.id) || familyIds.has(id.id)) return false;
      return true;
    });

    const person =
      worldCandidates.length > 0
        ? rng.pick(worldCandidates)
        : (() => {
            const foreignV = foreignVillages.length > 0 ? rng.pick(foreignVillages) : VILLAGE_MAP[state.villageId];
            return generateCharacter(
              state,
              {
                villageId: foreignV.id,
                occupation: foreignV.id === 'iron' ? 'samurai' : 'shinobi',
                age: Math.max(17, state.age + rng.int(1, 14)),
                rank: rng.chance(0.75) ? 'jonin' : 'chunin',
                archetype: arch,
                lodTier: 'L1',
                observed: true,
              },
              rng,
            );
          })();

    excludedPersonIds.add(person.identity.id);
    enemies.push(competitorFromPerson(state, person, idx + 1));
  });

  // Special S-Rank slot: ex-teammate missing_nin (prioritizing Rival!), or 15% (100% crisis) S-Rank rogue operative
  const rogueRival = state.rivalId
    ? state.team?.members.find((m) => {
        const p = getPerson(state, m.personId);
        return m.personId === state.rivalId && Boolean(p && p.identity.alive && p.identity.specialStatus === 'missing_nin');
      })
    : undefined;
  const rogueMate =
    rogueRival ??
    state.team?.members.find((m) => {
      const p = getPerson(state, m.personId);
      return m.role === 'teammate' && Boolean(p && p.identity.alive && p.identity.specialStatus === 'missing_nin');
    });
  if (rogueMate && rng.chance(0.55)) {
    const roguePerson = getPerson(state, rogueMate.personId);
    if (roguePerson) {
      roguePerson.identity.specialStatus = 'missing_nin';
      excludedPersonIds.add(roguePerson.identity.id);
      enemies.push(
        competitorFromPerson(state, roguePerson, 8, {
          id: `en_rogue_${roguePerson.identity.id}`,
          epithet: 'Former Squadmate (Missing-Nin)',
          tactic: 'hunter',
          formerShinobi: true,
          longGoal: 'dominate',
          shortGoal: 'strike_apex',
          planTargetId: 'player',
          fort: 18,
          intel: 80,
          knowPlayer: 45,
          isExTeammateRogue: true,
        }),
      );
    }
  } else if (isCrisisWar || rng.chance(0.15)) {
    const existingS = (state.worldSim?.npcs ?? []).filter(
      (n) =>
        n.identity.alive &&
        n.identity.archetype === 'rogue_s' &&
        !excludedPersonIds.has(n.identity.id) &&
        !familyIds.has(n.identity.id),
    );
    const sPerson =
      existingS.length > 0
        ? rng.pick(existingS)
        : (() => {
            const originV = foreignVillages.length > 0 ? rng.pick(foreignVillages) : VILLAGE_MAP[state.villageId];
            return generateCharacter(
              state,
              {
                villageId: originV.id,
                occupation: originV.id === 'iron' ? 'samurai' : 'shinobi',
                age: Math.max(22, state.age + rng.int(4, 18)),
                rank: 'jonin',
                specialStatus: 'missing_nin',
                archetype: 'rogue_s',
                lodTier: 'L1',
                observed: true,
              },
              rng,
            );
          })();
    const comp = competitorFromPerson(state, sPerson, 8);
    if (isCrisisWar && state.world.crisisClues > 0) {
      addEnemyIntel(comp, Math.min(80, state.world.crisisClues * 16));
    }
    excludedPersonIds.add(sPerson.identity.id);
    enemies.push(comp);
  }

  // Ensure at least 1 same-village comrade is deployed when player serves a village (village-vs-village war)
  if (state.specialStatus !== 'missing_nin') {
    const loyalRival =
      state.rivalId && state.rivalId !== partner.personId
        ? state.team?.members.find((m) => {
            const p = getPerson(state, m.personId);
            return m.personId === state.rivalId && Boolean(p && p.identity.alive && p.identity.specialStatus !== 'missing_nin');
          })
        : undefined;
    const hasSameVillage = enemies.some((e) => !e.isExTeammateRogue && e.villageId === state.villageId);
    if ((loyalRival || !hasSameVillage) && enemies.length > 0) {
      const swapIdx = 0;
      if (loyalRival) {
        const rivalPerson = getPerson(state, loyalRival.personId);
        if (rivalPerson && !excludedPersonIds.has(rivalPerson.identity.id) && !enemies.some((e) => e.personId === rivalPerson.identity.id)) {
          const v = VILLAGE_MAP[state.villageId];
          excludedPersonIds.add(rivalPerson.identity.id);
          enemies[swapIdx] = competitorFromPerson(state, rivalPerson, swapIdx + 1, {
            id: `en_rival_${rivalPerson.identity.id}`,
            epithet: `Sworn Rival of ${v.name}`,
            tactic: 'proud',
            formerShinobi: false,
          });
        }
      } else if (!hasSameVillage) {
        const v = VILLAGE_MAP[state.villageId];
        const existingComrade = state.worldSim?.npcs.find(
          (n) =>
            n.identity.alive &&
            (n.identity.occupation === 'shinobi' || n.identity.occupation === 'samurai') &&
            n.identity.age >= 16 &&
            (n.identity.rank === 'chunin' || n.identity.rank === 'jonin') &&
            n.identity.specialStatus !== 'kage' &&
            n.identity.specialStatus !== 'missing_nin' &&
            n.identity.villageId === state.villageId &&
            !excludedPersonIds.has(n.identity.id) &&
            !familyIds.has(n.identity.id) &&
            !enemies.some((e) => e.personId === n.identity.id),
        );
        const comradePerson =
          existingComrade ??
          generateCharacter(
            state,
            {
              age: Math.max(17, state.age + rng.int(1, 7)),
              villageId: state.villageId,
              occupation: state.villageId === 'iron' ? 'samurai' : 'shinobi',
              rank: 'chunin',
              roleTitle: `${v.name} Vanguard`,
              archetype: enemies[swapIdx].archetype === 'rogue_s' ? 'vanguard' : enemies[swapIdx].archetype,
              lodTier: 'L1',
              observed: true,
            },
            rng,
          );
        excludedPersonIds.add(comradePerson.identity.id);
        enemies[swapIdx] = competitorFromPerson(state, comradePerson, swapIdx + 1, {
          id: `en_ally_${comradePerson.identity.id}`,
          tactic: 'defensive',
          formerShinobi: false,
        });
      }
    }
  }

  const hasBarrier = state.disciplines.some((d) => d.id === 'barrier' || d.id === 'trap_craft');
  const startFort = (approach === 'flank' ? 24 : 16) + (hasBarrier ? 12 : 0);
  const startExposure =
    (state.rank === 'jonin' ? 12 : 0) +
    (state.specialStatus === 'missing_nin' ? 18 : 0) +
    (approach === 'front' ? 6 : 0);

  const war: WarState = {
    warNumber: state.world.eraNumber,
    isCrisisWar,
    crisisId: isCrisisWar ? state.world.seededCrisis : 'none',
    approach,
    day: 1,
    maxDays: 14,
    subPhase: 'day',
    secondsPerDay: DEFAULT_WAR_SECONDS_PER_DAY,
    beatClock: 0,
    beatQueue: [],
    timeOfDay: 'morning',
    statusText: 'Establishing sector perimeter...',
    npcNightActed: [],
    npcExtraRaidPressure: 0,
    hp: clamp(Math.max(70, state.stats.health + 12), 70, 100),
    cp: 100,
    fort: startFort,
    workshop: 0,
    exposure: startExposure,
    resolves: 3,
    bountyActive: false,
    daysWithoutFight: 0,
    kills: 0,
    strikes: 0,
    hidTonight: false,
    nextBattleBonus: isCrisisWar ? state.world.crisisClues * 3 : 0,
    relations: {},
    allyId: null,
    allyFormedDay: null,
    allyBetrayed: false,
    coalitionEnemyIds: [],
    siegeCount: 0,
    lastSiegeDay: -9,
    huntDone: false,
    strategicDay: rng.int(10, 12),
    strategicClaimedBy: null,
    crossroadsCount: 0,
    usedCrossroads: [],
    loyalInterceptUsed: false,
    partner,
    usedPartnerScenes: [],
    facts: [],
    crisis: null,
    conviction: null,
    enemies,
    activeBattle: null,
  };

  const tierInfo = getPartnerTrustTier(partner.trust);
  pushLog(
    state,
    'bond',
    `War Partner Assigned: ${partner.name} (${partner.epithet}) deploys directly beside you (Trust ${partner.trust} · ${tierInfo.label}, Affinity Fit ${partner.fit}).`,
    { title: `War Partner: ${partner.name}` },
  );

  if (isCrisisWar) {
    war.crisis = initWarCrisisState(state, war, rng);
  }

  initWarRelations(state, war);
  if (state.specialStatus !== 'missing_nin') {
    const villageComrade =
      war.enemies.find((e) => e.alive && e.id.startsWith('en_rival_')) ??
      war.enemies.find((e) => e.alive && !e.isExTeammateRogue && e.villageId === state.villageId);
    if (villageComrade) {
      establishPlayerAlliance(state, war, villageComrade, rng, true);
    }
  }
  runDailyStrategicPlanner(state, war, rng);
  return war;
}

export function getLivingEnemies(war: WarState): WarCompetitor[] {
  return war.enemies.filter((e) => e.alive);
}

export function buildAllyFinalDecision(state: GameState, ally: WarCompetitor): PendingDecision {
  return {
    id: `war_ally_final_${state.war!.warNumber}_${state.war!.day}`,
    kind: 'war_ally_final',
    eventId: 'war_ally_final',
    title: `Final Two: You and Your Ally ${ally.name}`,
    body: `Every other rival in War #${state.war!.warNumber} has fallen. Smoke hangs over the valley as ${ally.name} (${ally.epithet}) steps into the clearing across from you. Will your wartime pact survive the final dawn?`,
    manual: true,
    meta: { allyId: ally.id },
    options: [
      {
        id: 'share_victory',
        label: 'Honor the pact and declare a joint armistice (Share Victory)',
        sublabel: 'High trust ends the war together; a treacherous ally may still ambush you!',
        statHints: ['Bonds', 'Trust'],
        autoEligible: true,
      },
      {
        id: 'honorable_duel',
        label: 'Draw steel and settle the war in a clean Final Duel',
        statHints: ['Combat'],
        autoEligible: false,
      },
      {
        id: 'yield_sector',
        label: 'Yield the contested sector to your ally and withdraw alive',
        autoEligible: false,
      },
    ],
  };
}

/**
 * Day Event & Pressure Chain (fires at most 1 priority pressure/crossroads event
 * before the regular Daylight action on Day 2+).
 */
export function openDayPhase(state: GameState, rng: SeededRng): void {
  const war = state.war!;
  const living = getLivingEnemies(war);
  war.subPhase = 'day';

  // Priority 0: All rivals eliminated or Final Two with Living Ally!
  if (living.length === 0) {
    if (hasActiveCrisis(war)) {
      escalateToCrisisBoss(state, war);
    } else {
      concludeWar(state, rng, 'victor');
    }
    return;
  }

  if (living.length === 1 && war.allyId === living[0].id) {
    if (hasActiveCrisis(war)) {
      escalateToCrisisBoss(state, war);
    } else {
      state.pending = buildAllyFinalDecision(state, living[0]);
    }
    return;
  }

  // Priority 1: Hostage / Captured Scout Crisis (anti-passive pressure)
  const ruthlessEnemy = living.find((e) => e.id !== war.allyId && e.persona.ruthless >= 58);
  if (
    war.day >= 5 &&
    war.exposure >= 38 &&
    war.daysWithoutFight >= 2 &&
    ruthlessEnemy &&
    !state.flags[`hostage_w${war.warNumber}`] &&
    rng.chance(0.28)
  ) {
    state.flags[`hostage_w${war.warNumber}`] = true;
    state.pending = {
      id: `war_hostage_${war.day}`,
      kind: 'war_pressure',
      eventId: 'hostage',
      title: 'Pressure Event: Captured Allied Scout',
      body: `${ruthlessEnemy.intel >= 80 ? ruthlessEnemy.name : `A ruthless ${ruthlessEnemy.archetype}`} has captured an allied village courier using your exposed trail and threatens execution at dusk unless you step into the open.`,
      manual: true,
      meta: { pressureType: 'hostage', enemyId: ruthlessEnemy.id },
      options: [
        {
          id: 'rescue_fight',
          label: 'Storm their ridge and rescue the captive in combat',
          sublabel: 'Starts immediate clash; Will +4 & Kizuna boost on survival.',
          autoEligible: true,
        },
        ...(war.resolves > 0
          ? [
            {
              id: 'rescue_resolve',
              label: `Burn 1 Resolve: Instant Body Flicker Rescue (${war.resolves} left)`,
              sublabel: 'Saves the captive cleanly without fighting (+3 Body Strain).',
              autoEligible: true,
            },
          ]
          : []),
        {
          id: 'abandon_hostage',
          label: 'Stay hidden and abandon the scout (-5 Bonds, Ruthless +2)',
          autoEligible: false,
        },
      ],
    };
    return;
  }

  // Priority 2: Anti-Turtle Enemy Coalition
  const nonAllies = living.filter((e) => e.id !== war.allyId);
  if (
    ((war.day >= 8 && war.strikes < Math.floor(war.day / 3)) || (war.day >= 6 && war.fort >= 60)) &&
    war.coalitionEnemyIds.length === 0 &&
    nonAllies.length >= 2 &&
    rng.chance(0.45)
  ) {
    const pair = nonAllies.slice(0, 2);
    war.coalitionEnemyIds = pair.map((p) => p.id);
    recordWarFact(war, {
      type: 'enemy_coop',
      actorId: pair[0].id,
      actorName: pair[0].name,
      targetId: 'player',
      targetName: state.name,
      detail: `${pair[0].name} and ${pair[1].name} formed a coalition against you`,
    });
    state.pending = {
      id: `war_coalition_${war.day}`,
      kind: 'war_pressure',
      eventId: 'coalition',
      title: 'Pressure Event: Hostile Enemy Coalition!',
      body: `Alarmed by your fortified holdout, two rival shinobi have agreed to coordinate a joint strike on your camp tonight.`,
      manual: false,
      meta: { pressureType: 'coalition', enemyId: pair[0].id },
      options: [
        {
          id: 'coalition_strike',
          label: 'Strike one coalition member first before they link up',
          autoEligible: war.hp >= 60,
        },
        {
          id: 'coalition_brace',
          label: 'Brace your camp (+8 Fort, Exposure +6)',
          autoEligible: true,
        },
        {
          id: 'coalition_relocate',
          label: 'Abandon your camp and relocate before sunset (Fort x0.4, Exposure -14)',
          autoEligible: true,
        },
      ],
    };
    return;
  }

  // Priority 3: Camp Siege (anti-fortification turtling)
  if (
    war.fort >= 50 &&
    war.day >= 3 &&
    war.siegeCount < 3 &&
    war.day - war.lastSiegeDay >= 3 &&
    nonAllies.length >= 1 &&
    rng.chance(0.25 + (war.fort - 50) * 0.01)
  ) {
    war.siegeCount += 1;
    war.lastSiegeDay = war.day;
    const besieger = rng.pick(nonAllies);
    state.pending = {
      id: `war_siege_${war.day}`,
      kind: 'war_pressure',
      eventId: 'siege',
      title: 'Pressure Event: Camp Under Siege!',
      body: `Your heavy perimeter wards drew unwanted eyes. ${besieger.intel >= 80 ? besieger.name : `A rival ${besieger.archetype}`} bombards your outer traps from the ridge!`,
      manual: false,
      meta: { pressureType: 'siege', enemyId: besieger.id },
      options: [
        {
          id: 'siege_sally',
          label: 'Counter-sally out of the smoke and fight them directly',
          autoEligible: war.hp >= 65,
        },
        {
          id: 'siege_thicken',
          label: 'Pour chakra into the barrier (-14 CP, lose half Fort damage)',
          disabled: war.cp < 14,
          disabledReason: 'Requires 14 CP',
          autoEligible: war.cp >= 14,
        },
        {
          id: 'siege_relocate',
          label: 'Slip out the rear tunnel and relocate (Fort x0.3, Exposure -15)',
          autoEligible: true,
        },
      ],
    };
    return;
  }

  // Priority 4: Sector Bounty Hunt (Day 4-8, once per war)
  if (war.day >= 4 && war.day <= 8 && !war.huntDone && nonAllies.length >= 1 && rng.chance(0.32)) {
    war.huntDone = true;
    const playerIsHunted = state.leanings.ruthless >= 5 || state.specialStatus === 'missing_nin';
    const target = rng.pick(nonAllies);
    state.pending = {
      id: `war_hunt_${war.day}`,
      kind: 'war_pressure',
      eventId: 'hunt',
      title: playerIsHunted
        ? 'Pressure Event: Sector Bounty Placed on YOUR Head!'
        : 'Pressure Event: Sector-Wide Bounty Hunt',
      body: playerIsHunted
        ? 'Your ruthless reputation has united neutral enforcers and rival trackers against you. Bounty hunters close in across the ravine!'
        : `A notorious rogue target (${target.intel >= 80 ? target.name : `an unmasked ${target.archetype}`}) has drawn a sector bounty. Joining the hunt grants +10 combat power and +1 Resolve on takedown.`,
      manual: false,
      meta: { pressureType: playerIsHunted ? 'hunted' : 'hunt', enemyId: target.id },
      options: playerIsHunted
        ? [
          { id: 'hunted_fight', label: 'Turn and cut down the lead bounty hunter', autoEligible: war.hp >= 60 },
          { id: 'hunted_evade', label: 'Burn decoys and vanish into the cliffs (-12 CP, -8 HP)', autoEligible: true },
        ]
        : [
          { id: 'hunt_join', label: 'Join the hunt (+10 prep bonus, +1 Resolve if you finish them)', autoEligible: war.hp >= 65 },
          { id: 'hunt_ignore', label: 'Stay clear and conserve your strength (+6 CP)', autoEligible: true },
        ],
    };
    return;
  }

  // Priority 5: Decisive Strategic Point (Day 10-12)
  if (war.day === war.strategicDay && nonAllies.length >= 1 && !war.strategicClaimedBy) {
    const claimant = rng.pick(nonAllies);
    state.pending = {
      id: `war_strategic_${war.day}`,
      kind: 'war_pressure',
      eventId: 'strategic_point',
      title: 'Decisive Objective: The High Ground Supply Ridge',
      body: `On Day ${war.day}, the fog parts over the central supply hill. Claiming this vantage locks down the valley (+6 Combat Power & +4 CP every dawn for the rest of the war).`,
      manual: false,
      meta: { pressureType: 'strategic_point', enemyId: claimant.id },
      options: [
        {
          id: 'claim_ridge',
          label: 'Contest the high ground in immediate solo combat',
          autoEligible: war.hp >= 58,
        },
        {
          id: 'cede_ridge',
          label: 'Cede the hill and conserve strength in the treeline (+8 HP, +8 CP)',
          autoEligible: true,
        },
      ],
    };
    return;
  }

  // Priority 6: Incoming NPC Alliance Offer
  if (!war.allyId && war.day >= 2) {
    const seeker = nonAllies.find((e) => e.shortGoal === 'find_ally' && !e.isExTeammateRogue);
    if (seeker && rng.chance(0.32)) {
      state.pending = {
        id: `war_ally_offer_${war.day}_${seeker.id}`,
        kind: 'war_ally_offer',
        eventId: 'war_ally_offer',
        title: 'Diplomatic Envoy: Temporary Alliance Offer',
        body: `A coded kunai note arrives from ${seeker.intel >= 80 ? `${seeker.name} (${seeker.epithet})` : `an opposing ${seeker.archetype}`}: "Stronger threats stalk this valley. Watch my back until the end, and I will watch yours."`,
        manual: false,
        meta: { senderId: seeker.id },
        options: [
          {
            id: 'accept_ally',
            label: 'Accept the temporary wartime alliance',
            sublabel: 'Allies share intel and can rescue you from night raids (watch for betrayal!).',
            autoEligible: true,
          },
          {
            id: 'decline_ally',
            label: 'Decline politely and remain independent',
            autoEligible: false,
          },
        ],
      };
      return;
    }
  }

  // Priority 6.5: War Partner Bond Scene (K2: Trust >= 60, up to 2 per war)
  if (
    war.partner &&
    war.partner.active &&
    war.partner.trust >= 60 &&
    war.day >= 3 &&
    war.usedPartnerScenes.length < 2 &&
    rng.chance(0.32)
  ) {
    const eligibleScenes = PARTNER_WAR_SCENES.filter(
      (sc) => !war.usedPartnerScenes.includes(sc.id) && (!sc.condition || sc.condition(state, war)),
    );
    if (eligibleScenes.length > 0) {
      const scene = rng.pick(eligibleScenes);
      war.usedPartnerScenes.push(scene.id);
      state.pending = {
        id: `war_ps_${scene.id}_${war.day}`,
        kind: 'war_partner_scene',
        eventId: scene.id,
        title: scene.title,
        body: scene.body(state, war),
        manual: false,
        meta: { sceneId: scene.id },
        options: scene.options.map((o) => ({
          id: o.id,
          label: o.label,
          sublabel: o.sublabel,
          autoEligible: o.autoEligible,
        })),
      };
      return;
    }
  }

  // Priority 7: War Crossroads Dilemma (up to 3 per war)
  if (war.day >= 2 && war.crossroadsCount < 3 && rng.chance(0.35)) {
    const cands = WAR_CROSSROADS.filter((c) => !war.usedCrossroads.includes(c.id));
    if (cands.length > 0) {
      const chosen = rng.pick(cands);
      war.usedCrossroads.push(chosen.id);
      war.crossroadsCount += 1;
      state.pending = {
        id: `war_cr_${chosen.id}_${war.day}`,
        kind: 'war_crossroads',
        eventId: chosen.id,
        title: chosen.title,
        body: chosen.body,
        manual: false,
        meta: { crossroadId: chosen.id },
        options: chosen.options.map((o) => ({
          id: o.id,
          label: o.label,
          sublabel: o.sublabel,
          autoEligible: o.autoEligible,
        })),
      };
      return;
    }
  }

  state.pending = buildWarDayDecision(state);
}

export function buildWarDayDecision(state: GameState): PendingDecision {
  const war = state.war!;
  const living = getLivingEnemies(war).length;
  const hasMedical = state.disciplines.some((d) => d.id === 'medical');
  const hasSquadNearby = Boolean(
    state.team &&
      state.team.members.some((m) => {
        const p = getPerson(state, m.personId);
        return Boolean(p && p.identity.alive && p.identity.specialStatus !== 'missing_nin');
      }),
  );
  const onStrategicDay = war.day === war.strategicDay;

  const options: PendingDecision['options'] = [
    {
      id: 'day_cover',
      label: 'Maintain Camp Cover & Erase Trails',
      sublabel: 'Exposure -7, Will +1. Reduces night raid risk.',
      statHints: ['Exposure'],
      autoEligible: war.exposure >= 25,
    },
    {
      id: 'day_recon',
      label: 'Investigate Sector Trails (Gather Intel)',
      sublabel: 'Gain +14 to +24 Intel on the least-known rival shinobi.',
      statHints: ['Intel'],
      autoEligible: true,
    },
    {
      id: 'day_recover',
      label: `Field Triage & Rest (+${hasMedical ? 16 : 10} HP, +12 CP)`,
      sublabel: 'Mend combat wounds and replenish chakra before nightfall.',
      statHints: ['HP', 'CP'],
      autoEligible: war.hp < 78 || war.cp < 60,
    },
    {
      id: 'day_fortify',
      label: 'Reinforce Camp Traps & Perimeter Wards',
      sublabel: onStrategicDay
        ? 'Locked while the Strategic Ridge is contested today.'
        : 'Fort +9 to +15. Strong camps repel or weaken night raiders.',
      statHints: ['Fort'],
      disabled: onStrategicDay,
      disabledReason: 'Disabled on Strategic Objective day',
      autoEligible: !onStrategicDay && war.fort < 40,
    },
    {
      id: 'day_outpost_intel',
      label: 'Buy Frontier Dossier at Neutral Outpost (-6 Ryo)',
      sublabel: 'Acquire +35 Intel on the least-known rival shinobi.',
      statHints: ['Ryo', 'Intel'],
      disabled: state.stats.ryo < 6 || living === 0,
      disabledReason: state.stats.ryo < 6 ? 'Not enough Ryo (needs 6)' : 'No living rivals',
      autoEligible: state.stats.ryo >= 12,
    },
  ];

  if (!war.bountyActive && living > 0) {
    options.push({
      id: 'day_outpost_bounty',
      label: 'Claim Outpost Elimination Bounty (Free)',
      sublabel: 'Your next rival elimination grants +1 Limit Break Resolve token.',
      statHints: ['Resolve'],
      autoEligible: true,
    });
  }

  if (war.partner?.active) {
    options.push({
      id: 'day_kizuna',
      label: `Kizuna Outing with ${war.partner.name} (Trust ${war.partner.trust})`,
      sublabel: 'Deepen Partner Trust (+2 to +4 via fit), +4 HP, +14 rival Intel, +3 Exposure.',
      statHints: ['Bonds', 'Intel'],
      autoEligible: war.partner.trust < 80,
    });
  } else if (hasSquadNearby) {
    options.push({
      id: 'day_kizuna',
      label: `Exchange Coded Signal with ${state.team!.active ? `Team ${state.team!.number}` : 'Former Squadmate'}`,
      sublabel: 'Deepens Kizuna Trust, restores +4 HP, and shares +14 sector Intel.',
      statHints: ['Kizuna', 'Intel'],
      autoEligible: true,
    });
  }

  return {
    id: `war_day_${war.warNumber}_${war.day}`,
    kind: 'war_day',
    eventId: 'war_day',
    title: `War #${war.warNumber}: Day ${war.day}/${war.maxDays} (Daylight Phase)`,
    body: `${living} rival shinobi remain active in the sector. Your status: HP ${war.hp}/100, CP ${war.cp}/100, Fort ${war.fort}, Exposure ${war.exposure}%, Resolves ${war.resolves}.`,
    manual: false,
    options,
  };
}

export function buildWarNightDecision(state: GameState): PendingDecision {
  const war = state.war!;
  const living = getLivingEnemies(war);

  const hasSnipe = state.disciplines.some(
    (d) => d.id === 'wind_release' || d.id === 'shurikenjutsu' || d.id === 'puppetry',
  );
  const hasWorkshop = state.disciplines.some(
    (d) => d.id === 'fuinjutsu' || d.id === 'barrier' || d.id === 'trap_craft',
  );
  const hasInfiltrate = state.disciplines.some(
    (d) => d.id === 'silent_killing' || d.id === 'genjutsu' || d.id === 'interrogation',
  );
  const hasSensory =
    state.disciplines.some((d) => d.id === 'sensory') ||
    (state.bloodline?.id === 'byakugan' && state.bloodline.stage !== 'latent');
  const hasSenjutsu =
    state.disciplines.some((d) => d.id === 'senjutsu') ||
    (state.bloodline?.id === 'sage_body' && state.bloodline.stage !== 'latent');

  const options: PendingDecision['options'] = [
    {
      id: 'night_scout',
      label: 'Night Recon (Deep Intel Gathering)',
      sublabel: '+24 to +38 Intel on a chosen rival. Small 14% risk of ambush.',
      statHints: ['Intel'],
      autoEligible: true,
    },
    {
      id: 'night_raid',
      label: 'Ambush & Engage a Rival Shinobi (Solo Combat)',
      sublabel: 'Strike first with Ambush Initiative (+10 R1, +5 R2). Requires 16 CP.',
      statHints: ['Combat'],
      disabled: war.cp < 16 || living.length === 0,
      disabledReason: war.cp < 16 ? 'Requires 16 CP' : 'No living targets',
      autoEligible: war.hp >= 65 && war.cp >= 35,
    },
    {
      id: 'night_sabotage',
      label: 'Sabotage an Enemy Camp (-8 Ryo)',
      sublabel: 'Detonate paper bombs to shred enemy Fortification and deal chip damage.',
      statHints: ['Ryo', 'Intel'],
      disabled: state.stats.ryo < 8 || living.length === 0,
      disabledReason: 'Requires 8 Ryo',
      autoEligible: false,
    },
    {
      id: 'night_guard',
      label: 'Hold Camp Perimeter (+8 Fort, +4 HP)',
      sublabel: 'Strengthens defenses and prepares for nighttime raids.',
      statHints: ['Fort'],
      autoEligible: war.fort < 35,
    },
    {
      id: 'night_hide',
      label: 'Lie Low & Mask Chakra (+7 HP, +10 CP, -12% Raid Chance)',
      sublabel: 'Conserve strength quietly through the night.',
      statHints: ['Stealth'],
      autoEligible: war.hp < 55 || war.cp < 30,
    },
  ];

  if (war.partner?.active) {
    options.push({
      id: 'night_talk_partner',
      label: `Talk with Partner: ${war.partner.name} (Trust ${war.partner.trust})`,
      sublabel: 'Build Partner Trust (+3 to +6 via fit), +5 HP, +8 Partner HP, 70% backstory fragment.',
      statHints: ['Bonds'],
      autoEligible: war.partner.trust < 75 || war.partner.hp < 75,
    });
  }

  if (living.some((e) => e.id !== war.allyId) && living.length >= 2) {
    options.push({
      id: 'night_ally',
      label: war.allyId ? 'Diplomacy: Negotiate New Coalition Pact' : 'Propose Temporary Alliance (Diplomacy)',
      sublabel: war.allyId
        ? 'Seek a new wartime ally from another faction (replaces current active partner).'
        : 'Seek a wartime pact with a shinobi (1 active partner; acceptance depends on 6-axis relations).',
      statHints: ['Bonds', 'Diplomacy'],
      autoEligible: !war.allyId && war.day <= 7 && war.hp < 75,
    });
  }

  if (hasSnipe && living.length > 0) {
    options.push({
      id: 'night_snipe',
      label: '[Build Action] Long-Range Snipe (-10 CP)',
      sublabel: 'Strike a rival from the canopy for 10 to 24 damage without entering close combat.',
      statHints: ['Marksman'],
      disabled: war.cp < 10,
      disabledReason: 'Requires 10 CP',
      autoEligible: war.cp >= 25,
    });
  }
  if (hasWorkshop && war.workshop < 100) {
    options.push({
      id: 'night_workshop',
      label: `[Build Action] Build Perimeter Barrier Network (${war.workshop}/100, -4 Ryo)`,
      sublabel: 'At 100: permanent +15 Fort and +10 camp defense for this war.',
      statHints: ['Artificer'],
      disabled: state.stats.ryo < 4,
      disabledReason: 'Requires 4 Ryo',
      autoEligible: state.stats.ryo >= 10,
    });
  }
  if (hasInfiltrate && living.length > 0) {
    options.push({
      id: 'night_infiltrate',
      label: '[Build Action] Silent Infiltration',
      sublabel: 'Slip past enemy wards to expose Identity & Skills or inflict a critical wound.',
      statHints: ['Infiltrator'],
      autoEligible: true,
    });
  }
  if (hasSensory && living.length > 0) {
    options.push({
      id: 'night_sensory',
      label: '[Build Action] Wide-Area Sensory Sweep (-8 CP)',
      sublabel: 'Sweep the valley for +25 Intel on ALL active rivals at once.',
      statHints: ['Sensory'],
      disabled: war.cp < 8,
      disabledReason: 'Requires 8 CP',
      autoEligible: war.cp >= 20,
    });
  }
  if (hasSenjutsu) {
    options.push({
      id: 'night_senjutsu',
      label: '[Build Action] Gather Nature Energy (+30 CP, +8 Next Fight)',
      sublabel: 'Draws dense nature chakra (+6 Exposure). Bonus persists until your next battle.',
      statHints: ['Senjutsu'],
      autoEligible: war.cp < 50,
    });
  }

  // Endgame Crisis Night Actions
  if (war.crisis && !war.crisis.defeated) {
    if (war.crisis.id === 'calamity' && war.crisis.phase >= 2 && war.crisis.echoesLeft > 0) {
      options.push({
        id: 'night_hunt_echo',
        label: `[Crisis Action] Hunt Corrupted Echo (${war.crisis.echoesLeft} left | -12 CP, +1 Resolve)`,
        sublabel: 'Purge a fallen chakra echo before Calamity Phase 3 (risks 10 to 18 HP).',
        statHints: ['Crisis'],
        disabled: war.cp < 12 || war.hp <= 20,
        disabledReason: war.cp < 12 ? 'Requires 12 CP' : 'HP too low (needs > 20 HP)',
        autoEligible: war.hp >= 60 && war.cp >= 12,
      });
    }
    if (war.crisis.id === 'mastermind' && war.crisis.phase >= 2 && war.crisis.sentinelsLeft > 0) {
      options.push({
        id: 'night_hunt_sentinel',
        label: `[Crisis Action] Hunt Relic Sentinel (${war.crisis.sentinelsLeft}/5 left | -14 CP, +1 Resolve)`,
        sublabel: `Current Boss Divisor: x${getMastermindDivisor(state, war.crisis)}. Shattering Sentinels weakens the Mastermind permanently!`,
        statHints: ['Crisis'],
        disabled: war.cp < 14 || war.hp <= 22,
        disabledReason: war.cp < 14 ? 'Requires 14 CP' : 'HP too low (needs > 22 HP)',
        autoEligible: war.hp >= 55 && war.cp >= 14,
      });
    }
    if (war.crisis.phase === 3) {
      syncCrisisCoalitionAllies(war);
      options.push({
        id: 'night_boss_raid',
        label: `[Crisis Climax] Confront ${war.crisis.bossName} (HP ${war.crisis.bossHp}/${war.crisis.bossMaxHp})`,
        sublabel: `Assemble ${war.crisis.coalitionAllies} coalition allies for the decisive Endgame Boss Raid!`,
        statHints: ['Boss Raid'],
        autoEligible: war.hp >= 60,
      });
    }
  }

  return {
    id: `war_night_${war.warNumber}_${war.day}`,
    kind: 'war_night',
    eventId: 'war_night',
    title: `War #${war.warNumber}: Night ${war.day}/${war.maxDays} (Cover of Darkness)`,
    body: `Night falls over the contested valley. Choose your operation while ${living.length} rival shinobi execute their own strategic plans.`,
    manual: false,
    options,
  };
}

function buildTargetSelectDecision(
  state: GameState,
  actionMode: 'scout' | 'raid' | 'sabotage' | 'snipe' | 'infiltrate' | 'ally',
): PendingDecision {
  const war = state.war!;
  const living = getLivingEnemies(war).filter((e) => (actionMode === 'ally' ? e.id !== war.allyId : true));
  const titleMap = {
    scout: 'Select Target to Scout',
    raid: 'Select Rival Shinobi to Ambush',
    sabotage: 'Select Enemy Camp to Sabotage',
    snipe: 'Select Long-Range Snipe Target',
    infiltrate: 'Select Target for Silent Infiltration',
    ally: 'Select Shinobi to Propose Alliance',
  };

  const targetOptions: PendingDecision['options'] = living.map((e) => {
    const displayName = e.intel >= 80 ? `${e.name} (${e.epithet})` : `Unknown ${ARCHETYPE_LABELS[e.archetype]}`;
    const subParts = [`HP ${e.hp}/100`, `Intel ${e.intel}%`];
    if (e.id === war.allyId) subParts.push('CURRENT ALLY');
    if (actionMode === 'ally') {
      subParts.push(`Est. Acceptance: ${Math.round(calcAllyAcceptChance(state, war, e) * 100)}%`);
    }
    if (e.intel >= 60) subParts.push(`${ELEMENT_NAMES[e.element]} | ${VILLAGE_MAP[e.villageId].name}`);
    return {
      id: e.id,
      label: displayName,
      sublabel: subParts.join(' | '),
      autoEligible: e.id !== war.allyId || actionMode === 'scout',
    };
  });

  targetOptions.push({
    id: 'cancel_back',
    label: 'Cancel & Back to Night Actions',
    sublabel: 'Return to the Night menu without spending your turn.',
    autoEligible: false,
  });

  return {
    id: `war_target_${actionMode}_${war.day}`,
    kind: 'war_target',
    eventId: 'war_target',
    title: titleMap[actionMode],
    body: 'Choose a rival shinobi in the sector, or cancel to pick a different night operation.',
    manual: false,
    cancelOptionId: 'cancel_back',
    cancelLabel: 'Cancel & Back to Night Actions',
    meta: { actionMode },
    options: targetOptions,
  };
}

export function startWarBattle(
  state: GameState,
  enemyId: string,
  opts: {
    isFinal: boolean;
    isAmbush: boolean;
    isDefense: boolean;
    startedInPhase?: 'day' | 'night';
    rewardTag?: 'strategic_ridge';
  },
): void {
  const war = state.war!;
  const enemy = war.enemies.find((e) => e.id === enemyId)!;
  const startedInPhase = opts.startedInPhase ?? (war.subPhase === 'day' ? 'day' : 'night');
  war.subPhase = 'battle';
  war.daysWithoutFight = 0;
  if (!opts.isDefense) war.strikes += 1;

  // Attacking your own ally breaks the pact cleanly on both sides!
  if (war.allyId === enemyId && !opts.isDefense && !opts.isFinal) {
    war.allyId = null;
    war.allyBetrayed = true;
    enemy.allyId = null;
    modRel(war, enemy.id, 'player', { trust: -40, grudge: 35, slight: 2 });
    recordWarFact(war, {
      type: 'ally_betray',
      actorId: 'player',
      actorName: state.name,
      targetId: enemy.id,
      targetName: enemy.name,
      detail: `Turned on wartime ally ${enemy.name}`,
    });
  }

  const lines = getCompetitorLines(state, enemy);
  const archLabel = ARCHETYPE_LABELS[enemy.archetype];
  const sceneLine = opts.isFinal
    ? `Day ${war.day} Final Night. Moonlit smoke drifts across the central valley as the last rival stands in your path.`
    : opts.isDefense
      ? `Night ${war.day} perimeter breach. ${enemy.intel >= 80 ? enemy.name : `A rival ${archLabel}`} slips past your outer wards under cover of dark.`
      : opts.isAmbush
        ? `Night ${war.day} raid along the misty ridge. You drop into the enemy ${archLabel} perimeter with first initiative.`
        : `Day ${war.day} engagement on the contested ridge. The rival ${archLabel} is already waiting with weapons drawn.`;

  const fallbackQuips: Record<WarCompetitor['tactic'], string> = {
    reckless: '"No holding back. Show me everything you have!"',
    defensive: '"Step closer and let my wards take your measure."',
    hunter: '"I tracked your chakra for miles. Nowhere left to run."',
    cunning: '"You walked straight into the ground I chose."',
    proud: '"Draw your blade properly. Let our jutsu speak."',
    desperate: '"Only one of us walks out of this valley alive!"',
  };
  const rawQuip = lines.meet?.trim();
  const enemyQuip = rawQuip ? (rawQuip.startsWith('"') ? rawQuip : `"${rawQuip}"`) : fallbackQuips[enemy.tactic];

  war.beatQueue = [];
  war.beatClock = 0;
  war.statusText = opts.isFinal ? 'Final Night Duel in progress...' : `In solo combat (Round 1)...`;

  war.activeBattle = {
    enemyId,
    round: 1,
    maxRounds: opts.isAmbush ? 7 : 5,
    isFinal: opts.isFinal,
    isAmbush: opts.isAmbush,
    isDefense: opts.isDefense,
    startedInPhase,
    rewardTag: opts.rewardTag,
    sceneLine,
    enemyQuip,
    playerWardRounds: 0,
    playerBuffRounds: 0,
    playerCloneEvade: false,
    enemyDebuffRounds: 0,
    bloodlineActiveRounds: 0,
    enemyWallRounds: 0,
    enemyFieldRounds: 0,
    weaknessExploited: false,
    usedDesperation: false,
    usedNindoResolve: false,
    resolveBoostThisRound: false,
    enemyStatus: {},
    playerStatus: {},
    playerSelf: {},
    enemySelf: {},
    playerDojutsuMode: null,
    playerBodyMode: null,
    modeCooldowns: {},
    setupFlags: {},
    usesThisBattle: {},
    rounds: [],
  };
  initBattleV2State(state, enemy, war.activeBattle);

  const label = enemy.intel >= 80 ? `${enemy.name} (${enemy.epithet})` : `an enemy ${enemy.archetype}`;
  pushLog(
    state,
    opts.isFinal ? 'crisis' : 'war',
    `${opts.isFinal ? 'FINAL NIGHT CLASH' : opts.isDefense ? 'CAMP RAID' : 'NIGHT ENGAGEMENT'} against ${label}! ${lines.meet}`,
    { title: opts.isFinal ? `Final Night Duel (Day ${war.day})` : `Battle on Night ${war.day}` },
  );
  state.pending = buildBattleRoundDecision(state);
}

function establishPlayerAlliance(
  state: GameState,
  war: WarState,
  target: WarCompetitor,
  rng: SeededRng,
  isVillageComrade = false,
): void {
  if (war.allyId && war.allyId !== target.id) {
    const prev = war.enemies.find((e) => e.id === war.allyId);
    if (prev) prev.allyId = null;
  }
  war.allyId = target.id;
  war.allyFormedDay = war.day;
  target.allyId = 'player';
  modRel(war, target.id, 'player', { trust: 22, affection: 12, respect: 10 });
  modRel(war, 'player', target.id, { trust: 22, affection: 12, respect: 10 });

  // Village comrades start fully known (zero RNG); outside allies confide 72% of the time
  if (isVillageComrade) {
    target.intel = 100;
    target.ultimateSeen = true;
    target.skillsRevealed = true;
  } else if (rng.chance(0.72)) {
    target.intel = Math.max(target.intel, 85);
    target.ultimateSeen = true;
  }

  recordWarFact(war, {
    type: 'ally_form',
    actorId: 'player',
    actorName: state.name,
    targetId: target.id,
    targetName: target.name,
    detail: isVillageComrade
      ? `Deployed beside fellow ${VILLAGE_MAP[state.villageId].name} shinobi ${target.name}`
      : `Formed a wartime pact with ${target.name}`,
  });

  if (isVillageComrade) {
    pushLog(
      state,
      'bond',
      `Village Deployment: Fellow ${VILLAGE_MAP[state.villageId].name} shinobi ${target.name} (${target.epithet}) deploys alongside you against the rival coalition!`,
      { title: `${VILLAGE_MAP[state.villageId].name} Allied Partner` },
    );
    return;
  }

  pushLog(
    state,
    'bond',
    `Alliance forged with ${target.intel >= 80 ? `${target.name} (${target.epithet})` : `a rival ${target.archetype}`}! ${target.ultimateSeen ? `They confide their signature technique: ${target.ultimate.name}.` : 'They keep their trump card private for now.'}`,
    { title: 'Wartime Alliance Formed' },
  );
}

function runNpcBetrayalCheck(state: GameState, rng: SeededRng): boolean {
  const war = state.war!;
  const living = getLivingEnemies(war);
  if (living.length === 0) return false;

  if (war.allyId && war.day - (war.allyFormedDay ?? war.day) >= 2) {
    const ally = living.find((e) => e.id === war.allyId);
    if (ally && ally.persona.ruthless >= 62) {
      const edge = getRel(war, ally.id, 'player');
      const bScore = computeBetrayScore(ally.persona, edge, war.hp, false);
      if (rng.chance(bScore * 0.34)) {
        war.allyId = null;
        war.allyBetrayed = true;
        ally.allyId = null;
        war.exposure = clamp(war.exposure + 18, 0, 100);
        modRel(war, 'player', ally.id, { trust: -45, grudge: 40, slight: 2 });
        recordWarFact(war, {
          type: 'ally_betray',
          actorId: ally.id,
          actorName: ally.name,
          targetId: 'player',
          targetName: state.name,
          detail: `${ally.name} sold out your camp coordinates to enemy trackers`,
        });
        pushLog(
          state,
          'danger',
          `BETRAYAL! Your ally ${ally.name} leaked your camp coordinates across the valley before vanishing (Exposure +18)!`,
          { title: 'Wartime Alliance Betrayed' },
        );
        return true;
      }
    }
  }
  return false;
}

/**
 * Executes one living NPC's planned nightly ShortGoal.
 * Returns true if a player-visible log event occurred (so the beat timer pauses for reading).
 */
function runSingleNpcNightStep(state: GameState, npcId: string, rng: SeededRng): boolean {
  const war = state.war!;
  const living = getLivingEnemies(war);
  const npc = living.find((e) => e.id === npcId && e.alive);
  if (!npc || war.npcNightActed.includes(npc.id)) return false;

  war.npcNightActed.push(npc.id);

  switch (npc.shortGoal) {
    case 'preserve_chakra':
      npc.hp = clamp(npc.hp + rng.int(12, 18), 0, 100);
      npc.cp = clamp(npc.cp + rng.int(16, 26), 0, 100);
      return false;
    case 'secure_camp':
      npc.fort = clamp(npc.fort + rng.int(12, 18), 0, 80);
      return false;
    case 'gather_intel':
      if (npc.planTargetId === 'player' && npc.id !== war.allyId) {
        npc.knowPlayer = clamp(npc.knowPlayer + 22, 0, 100);
        war.exposure = clamp(war.exposure + 4, 0, 100);
      }
      return false;
    case 'find_ally': {
      const partner = living.find((o) => o.alive && o.id !== npc.id && !o.allyId && o.id !== war.allyId);
      if (partner && rng.chance(0.45)) {
        npc.allyId = partner.id;
        partner.allyId = npc.id;
        modRel(war, npc.id, partner.id, { trust: 20, respect: 10 });
        modRel(war, partner.id, npc.id, { trust: 20, respect: 10 });
        recordWarFact(war, {
          type: 'ally_form',
          actorId: npc.id,
          actorName: npc.name,
          targetId: partner.id,
          targetName: partner.name,
          detail: `${npc.name} and ${partner.name} formed a rival pact`,
        });
        pushLog(state, 'war', 'Intercepted flare signals suggest two rival shinobi have struck a nighttime pact.');
        return true;
      }
      return false;
    }
    case 'hunt_weak':
    case 'strike_apex': {
      if (npc.planTargetId === 'player' && npc.id !== war.allyId) {
        war.npcExtraRaidPressure += 0.06;
        return false;
      }
      const foe =
        living.find((o) => o.alive && o.id === npc.planTargetId && o.id !== npc.id && o.id !== npc.allyId) ??
        living.find((o) => o.alive && o.id !== npc.id && o.id !== npc.allyId);
      if (foe && rng.chance(0.72)) {
        war.npcNightActed.push(foe.id);
        const res = resolveNpcSkirmish(npc, foe, rng, war);
        pushLog(state, 'war', res.logLine);
        return true;
      }
      return false;
    }
  }
}

function runNightThreatCheck(state: GameState, rng: SeededRng): boolean {
  const war = state.war!;
  const raiders = getLivingEnemies(war).filter((e) => e.id !== war.allyId);
  if (raiders.length === 0) return false;

  const stealthSkill = state.disciplines.some((d) => d.id === 'silent_killing' || d.id === 'genjutsu') ? 0.04 : 0;
  const coalitionBoost = war.coalitionEnemyIds.some((id) => raiders.some((r) => r.id === id)) ? 0.1 : 0;
  const raidProb = clamp(
    0.12 +
    war.exposure * 0.003 +
    war.day * 0.011 +
    war.npcExtraRaidPressure +
    coalitionBoost -
    (war.hidTonight ? 0.12 : 0) -
    Math.min(war.fort, 50) * 0.0015 +
    (war.resolves === 0 ? 0.06 : 0) -
    stealthSkill,
    0.03,
    0.62,
  );

  if (rng.chance(raidProb)) {
    const attacker = rng.pick(raiders);

    // Check if living Ally rushes in to defend the player!
    const ally = war.allyId ? getLivingEnemies(war).find((e) => e.id === war.allyId) : undefined;
    if (ally) {
      const edge = getRel(war, ally.id, 'player');
      const helpProb = clamp(0.38 + edge.trust * 0.004 + edge.owe * 0.06 - edge.slight * 0.08, 0.15, 0.78);
      if (rng.chance(helpProb)) {
        const dmg = rng.int(22, 34);
        attacker.hp = Math.max(8, attacker.hp - dmg);
        modRel(war, 'player', ally.id, { owe: 1, trust: 8 });
        recordWarFact(war, {
          type: 'ally_help',
          actorId: ally.id,
          actorName: ally.name,
          targetId: attacker.id,
          targetName: attacker.name,
          detail: `${ally.name} intercepted a nighttime raid on your camp (-${dmg} HP to raider)`,
        });
        pushLog(
          state,
          'bond',
          `Your ally ${ally.name} intercepts a nighttime raider at your outer perimeter, driving them back with ${dmg} damage!`,
          { title: 'Ally Came to Your Aid' },
        );
        return false;
      }
    }

    // High fortification (>= 50) can repel raiders!
    if (war.fort >= 50 && rng.chance(Math.min(0.75, (war.fort - 40) / 60))) {
      war.fort = Math.max(20, war.fort - 10);
      pushLog(
        state,
        'war',
        'Tripwires and sealing wards trigger in the outer perimeter, driving a nighttime raider back into the fog!',
      );
      return false;
    }

    startWarBattle(state, attacker.id, { isFinal: false, isAmbush: false, isDefense: true });
    return true;
  }

  return false;
}

export function runDawnTick(state: GameState, rng: SeededRng): void {
  const war = state.war!;
  war.activeBattle = null;
  war.hidTonight = false;
  // NOTE: war.nextBattleBonus persists until the player actually enters and finishes a battle!

  const hasMedical = state.disciplines.some((d) => d.id === 'medical');
  const hasUzumaki = state.bloodline?.id === 'uzumaki_chains' && state.bloodline.stage !== 'latent';
  const strategicBonus = war.strategicClaimedBy === 'player' ? 4 : 0;

  const prevHp = war.hp;
  const prevCp = war.cp;
  war.hp = clamp(
    war.hp + 4 + Math.round(state.stats.chakra * 0.05) + (hasMedical ? 4 : 0) + (war.workshop >= 100 ? 3 : 0),
    0,
    100,
  );
  war.cp = clamp(
    war.cp +
    9 +
    Math.round(state.stats.chakra * 0.08) +
    (hasUzumaki ? 5 : 0) +
    (war.workshop >= 100 ? 3 : 0) +
    strategicBonus,
    0,
    100,
  );

  war.fort = Math.max(0, Math.floor(war.fort * 0.93));
  if (war.fort >= 40) {
    war.exposure = clamp(war.exposure + Math.floor((war.fort - 40) / 10) + 1, 0, 100);
  }

  if (war.partner && war.partner.active) {
    war.partner.hp = clamp(war.partner.hp + 5 + (hasMedical ? 4 : 0), 0, war.partner.maxHp);
  }

  for (const e of war.enemies) {
    if (!e.alive) continue;
    const regen = skillSum(e.skills, 'regen') * 2;
    e.hp = clamp(e.hp + 4 + regen, 0, 100);
    e.cp = clamp(e.cp + 10 + regen, 0, 100);
  }

  const living = getLivingEnemies(war);
  if (living.length === 0) {
    if (hasActiveCrisis(war)) {
      escalateToCrisisBoss(state, war);
    } else {
      concludeWar(state, rng, 'victor');
    }
    return;
  }

  // Final Two with Ally check!
  if (living.length === 1 && war.allyId === living[0].id) {
    if (hasActiveCrisis(war)) {
      escalateToCrisisBoss(state, war);
    } else {
      state.pending = buildAllyFinalDecision(state, living[0]);
    }
    return;
  }

  war.day += 1;
  war.daysWithoutFight += 1;
  runDailyStrategicPlanner(state, war, rng);
  advanceCrisisPhase(state, war, rng);

  const hpGain = war.hp - prevHp;
  const cpGain = war.cp - prevCp;
  pushLog(
    state,
    'war',
    `Day ${war.day}/${war.maxDays} Dawn: ${living.length} rival shinobi remain active across the sector (Recovered +${hpGain} HP, +${cpGain} CP | Fort ${war.fort}).`,
    { title: `Day ${war.day} Breaks` },
  );

  const gap = baseWarGap(war);
  war.subPhase = war.day >= war.maxDays ? 'final' : 'day';
  war.beatQueue = [];
  war.beatClock = 0;
  war.timeOfDay = 'dawn';
  enqueueWarBeat(war, {
    kind: 'day_open',
    delay: Number((gap * (war.day >= war.maxDays ? 0.75 : 0.6)).toFixed(2)),
    label:
      war.day >= war.maxDays
        ? 'Final Night draws over the smoking valley...'
        : `Surveying morning signals on Day ${war.day}...`,
    timeOfDay: 'morning',
  });
}

function runDayOpenBeat(state: GameState, rng: SeededRng): void {
  const war = state.war!;
  const living = getLivingEnemies(war);
  if (living.length === 0) {
    if (hasActiveCrisis(war)) {
      escalateToCrisisBoss(state, war);
    } else {
      concludeWar(state, rng, 'victor');
    }
    return;
  }

  // Day 14 Final Night resolution
  if (war.day >= war.maxDays) {
    if (hasActiveCrisis(war)) {
      war.crisis!.phase = 3;
      syncCrisisCoalitionAllies(war);
      war.subPhase = 'final';
      pushLog(
        state,
        'crisis',
        `DAY 14 FINAL RECKONING: ${war.crisis!.bossName} threatens to consume the Five Great Nations unless stopped tonight!`,
        { title: 'Final Night Crisis Confrontation' },
      );
      state.pending = buildCrisisBossDecision(state);
      return;
    }

    while (getLivingEnemies(war).length > 1) {
      const pool = getLivingEnemies(war);
      const a = pool[0];
      const b = pool[1];
      const res = resolveNpcSkirmish(a, b, rng, war);
      if (a.alive && b.alive) {
        const culled = a.hp >= b.hp ? b : a;
        const survivor = culled === b ? a : b;
        markEnemyDead(war, culled);
        survivor.kills += 1;
        pushLog(
          state,
          'war',
          `Final Night culling: ${culled.intel >= 80 ? culled.name : `a rival ${culled.archetype}`} falls in the desperate valley clash.`,
        );
      } else {
        pushLog(state, 'war', res.logLine);
      }
    }

    const finalist = getLivingEnemies(war)[0];
    if (!finalist) {
      concludeWar(state, rng, 'victor');
      return;
    }

    if (war.allyId === finalist.id) {
      state.pending = buildAllyFinalDecision(state, finalist);
      return;
    }

    finalist.hp = Math.max(55, finalist.hp);
    finalist.cp = Math.max(60, finalist.cp);
    war.subPhase = 'final';
    startWarBattle(state, finalist.id, { isFinal: true, isAmbush: false, isDefense: false, startedInPhase: 'night' });
    return;
  }

  // Day 1 goes straight to daylight options; Day 2+ checks pressure / crossroads first
  if (war.day === 1) {
    openDayPhase(state, rng);
    return;
  }

  const gap = baseWarGap(war);
  enqueueWarBeat(war, {
    kind: 'day_pressure',
    delay: Number((gap * 0.55).toFixed(2)),
    label: 'Checking frontier dispatches and enemy movements...',
    timeOfDay: 'midday',
  });
}

/**
 * Consumes and executes the next queued war beat.
 * Silently cascades through silent NPC background ticks so players never wait on empty beats.
 */
export function advanceWarBeat(state: GameState, rng: SeededRng): boolean {
  if (state.phase !== 'war' || !state.war || state.pending !== null) return false;
  const war = state.war;
  ensureWarClockDefaults(war);
  if (war.beatQueue.length === 0) return false;

  let guard = 0;
  let advancedAny = false;

  while (guard < 24 && state.phase === 'war' && state.war && state.pending === null && war.beatQueue.length > 0) {
    guard += 1;
    const beat = war.beatQueue.shift()!;
    war.beatClock = 0;
    war.timeOfDay = beat.timeOfDay;
    war.statusText = beat.label;
    advancedAny = true;

    let producedVisibleBeat = true;

    switch (beat.kind) {
      case 'day_open':
        runDayOpenBeat(state, rng);
        break;
      case 'day_pressure':
        openDayPhase(state, rng);
        break;
      case 'day_decision':
        war.subPhase = 'day';
        state.pending = buildWarDayDecision(state);
        break;
      case 'night_decision':
        war.subPhase = 'night';
        state.pending = buildWarNightDecision(state);
        break;
      case 'npc_betrayal':
        producedVisibleBeat = runNpcBetrayalCheck(state, rng);
        break;
      case 'npc_step':
        producedVisibleBeat = beat.npcId ? runSingleNpcNightStep(state, beat.npcId, rng) : false;
        break;
      case 'night_threat': {
        const raided = runNightThreatCheck(state, rng);
        if (!raided && state.phase === 'war') {
          // Quiet night: keep dawn_tick queued so player feels the night settle
          producedVisibleBeat = true;
        }
        break;
      }
      case 'dawn_tick':
        runDawnTick(state, rng);
        break;
    }

    if (state.phase !== 'war' || !state.war || state.pending !== null) {
      break;
    }

    if (producedVisibleBeat) {
      if (war.beatQueue[0]) {
        war.statusText = war.beatQueue[0].label;
      }
      break;
    }
  }

  return advancedAny;
}

/**
 * Advances queued war beats synchronously until a decision opens or war ends (headless/test helper).
 */
export function flushWarUntilDecision(state: GameState, rng: SeededRng): void {
  if (state.phase !== 'war' || !state.war) return;
  ensureWarClockDefaults(state.war);

  let guard = 0;
  while (state.phase === 'war' && state.war && state.pending === null && guard < 64) {
    guard += 1;
    if (state.war.beatQueue.length === 0) {
      openDayPhase(state, rng);
      break;
    }
    advanceWarBeat(state, rng);
  }
}

function buildWarFinaleWishDecision(
  state: GameState,
  war: WarState,
  outcome: 'victor' | 'shared',
): PendingDecision {
  const leader = kageTitle(state);
  const villageName = VILLAGE_MAP[state.villageId].name;

  const personalCandidates: { id: string; score: number; label: string; sublabel: string; hints: string[] }[] = [
    {
      id: 'wish_peace',
      score: state.leanings.will_of_fire * 2 + state.stats.bonds * 0.05,
      label: 'Demand a Five-Nation Peace Accord',
      sublabel: 'Doubles the war cooldown to 12 years, drops World Tension to 8, +6 Bonds, +4 Will.',
      hints: ['Bonds', 'Will'],
    },
    {
      id: 'wish_protect',
      score: state.stats.bonds * 0.08 + state.leanings.will_of_fire * 1.2,
      label: `Fortify ${villageName} & Shield Your Loved Ones`,
      sublabel: 'Restores +10 Health, +8 Bonds, +6 Will, and deepens trust with surviving squadmates.',
      hints: ['Bonds', 'Health'],
    },
    {
      id: 'wish_kage',
      score: state.leanings.ambition * 2 + (state.nindo === 'become_kage' ? 4 : 0),
      label: `Claim Council Endorsement for the ${leader} Seat`,
      sublabel: `Lowers ${leader} Succession requirements, +6 Will, +5 Bonds, +15 Ryo.`,
      hints: ['Will', 'Bonds'],
    },
    {
      id: 'wish_vengeance',
      score: state.leanings.vengeance * 2 + (state.nindo === 'avenge_clan' ? 4 : 0),
      label: 'Place a Continental Bounty on Your Sworn Foes',
      sublabel: 'Marks a lingering rival target for future reckoning, +6 Chakra, +6 Will, +12 Ryo.',
      hints: ['Chakra', 'Will'],
    },
    {
      id: 'wish_kinjutsu',
      score: state.leanings.forbidden * 2 + state.stats.intel * 0.04,
      label: 'Unseal a Confiscated War Vault Kinjutsu Scroll',
      sublabel: 'Gain +12 Chakra, +6 Intel, and +15 XP to your main jutsu discipline (-6 Health).',
      hints: ['Chakra', 'Intel'],
    },
    {
      id: 'wish_dominion',
      score: state.leanings.ruthless * 2 + state.stats.ryo * 0.03,
      label: 'Seize Frontier Supply Lines & War Reparations',
      sublabel: 'Claim +25 Ryo, +6 Chakra, +4 Intel, Ruthless +1.',
      hints: ['Ryo', 'Intel'],
    },
  ];

  personalCandidates.sort((a, b) => b.score - a.score);
  const topFour = personalCandidates.slice(0, 4);

  const options: PendingDecision['options'] = topFour.map((w) => ({
    id: w.id,
    label: w.label,
    sublabel: w.sublabel,
    statHints: w.hints,
    autoEligible: true,
  }));

  if (war.partner && war.partner.active && war.partner.trust >= 60) {
    options.push({
      id: 'wish_partner_dream',
      label: `Grant ${war.partner.name}'s Wish`,
      sublabel: `"${war.partner.motive}" (Partner Trust +10, +15 Rel Points, +5 Bonds, +5 Will).`,
      statHints: ['Bonds'],
      autoEligible: true,
    });
    options.push({
      id: 'wish_stay_with_me',
      label: `"Stay With Me" (Keep ${war.partner.name} as Your Permanent Partner)`,
      sublabel: `${war.partner.name} walks beside you into future wars and retirement epilogues.`,
      statHints: ['Bonds', 'Will'],
      autoEligible: war.partner.trust >= 75,
    });
  }

  return {
    id: `war_finale_wish_${war.warNumber}`,
    kind: 'war_finale_wish',
    eventId: 'war_finale_wish',
    title: `War #${war.warNumber} Finale: The Winner's Demand`,
    body: `Smoke clears over the contested valley. Standing victorious${war.partner?.active ? ` beside ${war.partner.name}` : ''}, your voice carries the weight of the entire front. What demand will you carve into the armistice treaty?`,
    manual: true,
    meta: { outcome },
    options,
  };
}

export function concludeWar(
  state: GameState,
  rng: SeededRng,
  outcome: 'victor' | 'shared' | 'survived' | 'withdrew',
  skipConviction = false,
): void {
  const war = state.war!;

  // Extremely rare (< 1%) non-clan battlefield Dojutsu Transplant opportunity on victory
  if (outcome === 'victor' && !state.bloodline) {
    const transplanted = tryRareDojutsuTransplant(state, rng);
    if (transplanted) {
      pushLog(
        state,
        'milestone',
        `A field medic salvages a rare ${transplanted === 'sharingan' ? 'Sharingan' : 'Byakugan'} from the battlefield in an emergency transplant! Non-clan physiology doubles its chakra upkeep permanently.`,
        { title: 'Rare Ocular Transplant' },
      );
    }
  }

  // Trigger hidden Extreme Conviction Route on non-Crisis victory when Leaning >= 8!
  if (!skipConviction && (outcome === 'victor' || outcome === 'shared') && canTriggerConvictionRoute(state, war)) {
    state.pending = startConvictionRoute(state, war, outcome);
    return;
  }

  // K4: Winner's Wish Finale on War Victory or Shared Armistice
  if ((outcome === 'victor' || outcome === 'shared') && !war.finaleWishDone && !war.isCrisisWar) {
    war.finaleWishDone = true;
    state.pending = buildWarFinaleWishDecision(state, war, outcome);
    return;
  }

  const chronicle = generateWarChronicle(state, war, outcome);
  applyWarResultsToPeople(state, war);
  syncPartnerBackToState(state, war.partner);

  const wear = Math.max(0, Math.round((100 - war.hp) * 0.28));
  state.stats.health = clamp(state.stats.health - wear, 8, 100);
  state.stats.will += outcome === 'victor' || outcome === 'shared' ? 6 : 3;
  state.stats.intel += 3;
  state.stats.ryo += outcome === 'victor' ? 18 : outcome === 'shared' ? 14 : 9;
  if (outcome === 'shared') state.stats.bonds += 5;

  if (state.disciplines.length > 0) {
    const main = state.disciplines.find((d) => d.isMain) ?? state.disciplines[0];
    main.xp += outcome === 'victor' || outcome === 'shared' ? 10 : 5;
  }

  if (state.stats.health < 28) {
    state.legacyScar = true;
    state.flags.medical_retirement = true;
  }

  let fieldPromoted = false;
  if (state.rank === 'genin' && (outcome === 'victor' || outcome === 'shared' || war.kills >= 1)) {
    promoteRank(state, 'chunin');
    fieldPromoted = true;
  }

  if (war.isCrisisWar && (outcome === 'victor' || outcome === 'shared')) {
    state.world.crisisStage = 3;
    state.world.truePeace = true;
    if (state.rank === 'jonin' && state.stats.bonds >= 55 && state.specialStatus !== 'missing_nin') {
      const title = kageTitle(state);
      state.specialStatus = 'kage';
      pushLog(
        state,
        'milestone',
        `Having shattered the Endgame Crisis in War #${war.warNumber}, the village acclaims you as ${title}!`,
        { title: `Acclaimed as ${title}` },
      );
    }
  }

  clampStats(state);

  state.warHistory.push({
    warNumber: war.warNumber,
    ageAtStart: state.age,
    rankAtStart: fieldPromoted ? 'genin' : state.rank,
    isCrisisWar: war.isCrisisWar,
    crisisId: war.crisisId as CrisisId,
    outcome,
    title: chronicle.title,
    fieldPromoted,
    summary: `Lasted ${war.day} days with ${war.kills} decisive eliminations.`,
    narrativeArcs: chronicle.arcs,
  });

  state.war = null;
  state.phase = 'life';
  state.world.warsSurvived += 1;
  state.world.eraNumber += 1;
  state.world.lastWarAge = state.age;
  state.world.tension = state.world.truePeace ? 5 : rng.int(10, 24);
  state.world.omenActive = false;
  if (state.worldSim) {
    applyPlayerActionToWorldSim(state, { type: 'war_ended', outcome });
  }

  pushLog(
    state,
    war.isCrisisWar ? 'crisis' : 'milestone',
    `Post-War Chronicle: "${chronicle.title}". Eliminations: ${war.kills}. ${fieldPromoted ? 'Earned a Field Promotion to Chunin! ' : ''}${state.world.truePeace ? 'The continent enters a lasting Era of True Peace.' : 'An uneasy ceasefire settles as everyday shinobi life resumes.'}`,
    { title: chronicle.title },
  );
  recordMemory(
    state,
    'war',
    `Survived Great Shinobi War #${war.warNumber} (${chronicle.title}) fighting for ${VILLAGE_MAP[state.villageId].name}.`,
  );

  if (fieldPromoted && state.team?.active) {
    state.pending = disbandGeninTeam(state, 'player_chunin', [state.name]);
  }
}

export function handleWarDecision(
  state: GameState,
  optionId: string,
  rng: SeededRng,
): void {
  const decision = state.pending!;
  const war = state.war!;
  state.pending = null;

  // === ENDGAME CRISIS BOSS RAID ===
  if (decision.kind === 'war_crisis_raid') {
    const res = resolveCrisisBossTurn(state, optionId, rng);
    if (res === 'continue') {
      state.pending = buildCrisisBossDecision(state);
      return;
    }
    if (res === 'player_dead') {
      const bossName = war.crisis?.bossName ?? 'the Crisis';
      applyWarResultsToPeople(state, war);
      state.warHistory.push({
        warNumber: war.warNumber,
        ageAtStart: state.age,
        rankAtStart: state.rank,
        isCrisisWar: true,
        crisisId: war.crisisId,
        outcome: 'dead',
        title: `Fell Against ${bossName}`,
        fieldPromoted: false,
        summary: `Gave everything on Day ${war.day} facing the Endgame Crisis.`,
      });
      state.war = null;
      killCharacter(state, `slain fighting ${bossName} during Crisis War #${war.warNumber}`);
      return;
    }
    if (res === 'boss_down') {
      state.pending = buildCrisisAftermathDecision(state);
      return;
    }
    // Retreated from boss raid: if Day 14, calamity/illusion claims the sector!
    if (war.day >= war.maxDays) {
      state.stats.health = Math.max(8, state.stats.health - 18);
      state.stats.will = Math.max(5, state.stats.will - 15);
      clampStats(state);
      pushLog(
        state,
        'crisis',
        war.crisis?.id === 'mastermind'
          ? 'Unable to break Akatsuki by dawn, a pale Infinite Tsukuyomi illusion washes across the borderlands.'
          : `Unchecked at dawn, ${war.crisis?.bossName ?? 'the unbound Bijuu'} scorches the entire contested valley before vanishing beneath the mountains.`,
        { title: 'Crisis Uncontained' },
      );
      concludeWar(state, rng, 'survived', true);
      return;
    }
    enqueueWarBeat(war, {
      kind: 'dawn_tick',
      delay: Number((baseWarGap(war) * 0.75).toFixed(2)),
      label: 'Pulling back from the crisis crater until dawn...',
      timeOfDay: 'dawn',
    });
    return;
  }

  // === ENDGAME CRISIS AFTERMATH ===
  if (decision.kind === 'war_crisis_end') {
    if (optionId === 'crisis_claim') {
      state.stats.chakra += 15;
      state.stats.health = Math.max(12, state.stats.health - 14);
      state.stats.will = Math.max(10, state.stats.will - 10);
      state.legacyScar = true;
      state.flags.crisis_claimed = true;
      addLeaning(state, 'ruthless', 3);
      addLeaning(state, 'forbidden', 2);
      if (
        state.nindo === 'never_go_back' ||
        state.nindo === 'protect_bonds' ||
        state.nindo === 'become_kage'
      ) {
        state.stats.will = Math.max(0, state.stats.will - 5);
        pushLog(
          state,
          'danger',
          'You betrayed your own Nindo, seizing forbidden power at the expense of the peace you swore to guard (-5 Will).',
        );
      }
      clampStats(state);
      pushLog(
        state,
        'crisis',
        'You absorb the fractured core into your own coils. Immense power surges through scarred veins, denying the world peace.',
        { title: 'Claimed Forbidden Power' },
      );
      concludeWar(state, rng, 'survived', true);
      return;
    }
    if (optionId === 'crisis_shatter') {
      if (war.resolves > 0) war.resolves -= 1;
      else war.cp = Math.max(0, war.cp - 25);
    } else if (optionId === 'crisis_seal') {
      const sealScore = Math.round((state.stats.chakra + state.stats.intel) / 2);
      if (sealScore < 50) {
        state.stats.health = Math.max(10, state.stats.health - 12);
        clampStats(state);
        pushLog(
          state,
          'danger',
          `Your sealing array nearly tears open (avg ${sealScore} < 50), forcing you to channel life force (-12 HP) to close the core!`,
        );
      }
    }
    state.world.crisisStage = 3;
    state.world.truePeace = true;
    pushLog(
      state,
      'milestone',
      optionId === 'crisis_seal'
        ? 'Your Grand Seal locks the crisis core cleanly beneath the stone. Sunlight finally pierces the storm.'
        : 'Your final blast shatters the crisis core into harmless drifting light across all five nations.',
      { title: 'Endgame Crisis Defeated!' },
    );
    concludeWar(state, rng, 'victor', true);
    return;
  }

  // === EXTREME CONVICTION ROUTE ===
  if (decision.kind === 'war_conviction') {
    const convOutcome = war.conviction?.triggerOutcome ?? 'victor';
    const res = resolveConvictionBeat(state, optionId);
    if (res === 'next_beat') {
      state.pending = buildConvictionBeatDecision(state);
      return;
    }
    if (res === 'start_duel') {
      state.pending = buildConvictionDuelDecision(state);
      return;
    }
    concludeWar(state, rng, convOutcome, true);
    return;
  }

  if (decision.kind === 'war_conviction_duel') {
    const conv = war.conviction!;
    const convOutcome = conv.triggerOutcome ?? 'victor';
    const res = resolveConvictionDuelRound(state, optionId, rng);
    if (res === 'continue') {
      state.pending = buildConvictionDuelDecision(state);
      return;
    }
    if (res === 'opponent_won_dead') {
      const oppName = personName(state, conv.opponentPersonId);
      const chronicle = generateWarChronicle(state, war, 'dead');
      applyWarResultsToPeople(state, war);
      state.warHistory.push({
        warNumber: war.warNumber,
        ageAtStart: state.age,
        rankAtStart: state.rank,
        isCrisisWar: false,
        crisisId: 'none',
        outcome: 'dead',
        title: chronicle.title,
        fieldPromoted: false,
        summary: `Fell at the Valley of the End against ${oppName} after War #${war.warNumber}.`,
        narrativeArcs: chronicle.arcs,
      });
      state.war = null;
      killCharacter(state, `felled by ${oppName} in the Final Valley Ideological Duel`);
      return;
    }
    concludeWar(state, rng, convOutcome, true);
    return;
  }

  // === FINAL TWO ALLY RESOLUTION ===
  if (decision.kind === 'war_ally_final') {
    const ally = war.enemies.find((e) => e.id === decision.meta?.allyId && e.alive);
    if (!ally) {
      concludeWar(state, rng, 'victor');
      return;
    }

    if (optionId === 'yield_sector') {
      pushLog(state, 'bond', `You lower your guard, honor ${ally.name}, and withdraw from the valley alive.`);
      concludeWar(state, rng, 'withdrew');
      return;
    }

    if (optionId === 'honorable_duel') {
      war.allyId = null;
      startWarBattle(state, ally.id, { isFinal: true, isAmbush: false, isDefense: false });
      return;
    }

    // Share victory check!
    const intent = evaluateAllyFinalIntent(state, war, ally, rng);
    if (intent === 'betray') {
      war.allyId = null;
      war.allyBetrayed = true;
      recordWarFact(war, {
        type: 'ally_betray',
        actorId: ally.id,
        actorName: ally.name,
        targetId: 'player',
        targetName: state.name,
        detail: `${ally.name} ambushed you at the Final Two armistice!`,
      });
      war.hp = Math.max(12, war.hp - 12);
      pushLog(
        state,
        'danger',
        `FINAL BETRAYAL! As you lower your blade to seal the armistice, ${ally.name} strikes from the blind spot (-12 HP)!`,
        { title: 'Betrayed at the Final Dawn' },
      );
      startWarBattle(state, ally.id, { isFinal: true, isAmbush: false, isDefense: true });
      return;
    }

    pushLog(
      state,
      'bond',
      `${ally.name} clasps your forearm over the smoking ridge. Together, you declare a joint armistice and walk out of War #${war.warNumber} alive!`,
      { title: 'Joint Armistice Secured' },
    );
    concludeWar(state, rng, 'shared');
    return;
  }

  // === INCOMING ALLIANCE OFFER ===
  if (decision.kind === 'war_ally_offer') {
    const sender = war.enemies.find((e) => e.id === decision.meta?.senderId && e.alive);
    if (optionId === 'accept_ally' && sender) {
      establishPlayerAlliance(state, war, sender, rng);
    } else if (sender) {
      modRel(war, sender.id, 'player', { trust: -6, slight: 1 });
      pushLog(state, 'war', 'You decline the coded alliance offer and keep your own counsel.');
    }
    queueDayDecision(war, 0.55);
    return;
  }

  // === WAR PARTNER BOND SCENE (K2) ===
  if (decision.kind === 'war_partner_scene') {
    const scene = PARTNER_WAR_SCENES.find((s) => s.id === decision.meta?.sceneId);
    const opt = scene?.options.find((o) => o.id === optionId);
    const partner = war.partner;
    if (scene && opt && partner && partner.active) {
      if (opt.hpDelta) war.hp = clamp(war.hp + opt.hpDelta, 1, 100);
      if (opt.partnerHpDelta) partner.hp = clamp(partner.hp + opt.partnerHpDelta, 1, partner.maxHp);
      if (opt.cpDelta) war.cp = clamp(war.cp + opt.cpDelta, 0, 100);
      if (opt.id === 'campfire_drill') war.nextBattleBonus += 4;
      if (opt.switchTrack && partner.relTrack !== 'mentorship') {
        const hasSpouse = state.family.some((f) => f.relation === 'spouse' && isPersonAlive(state, f.personId));
        if (opt.switchTrack !== 'romance' || !hasSpouse) {
          partner.relTrack = opt.switchTrack;
        }
      }
      if (opt.relPointsBonus) {
        partner.relPoints += opt.relPointsBonus;
      }
      const tDelta = adjustPartnerTrust(state, partner, opt.trustDelta, Boolean(opt.unlockFragment));
      if (opt.stats) {
        for (const [k, v] of Object.entries(opt.stats) as [StatKey, number][]) {
          state.stats[k] += v;
        }
      }
      if (opt.leanings) {
        for (const [k, v] of Object.entries(opt.leanings) as [LeaningKey, number][]) {
          addLeaning(state, k, v);
        }
      }
      clampStats(state);
      pushLog(
        state,
        'bond',
        `${opt.resultText} (${partner.name} Trust ${tDelta >= 0 ? `+${tDelta}` : tDelta} · now ${partner.trust}).`,
        { title: scene.title },
      );
    }
    queueDayDecision(war, 0.5);
    return;
  }

  // === WAR CROSSROADS DILEMMA ===
  if (decision.kind === 'war_crossroads') {
    const def = WAR_CROSSROADS.find((c) => c.id === decision.meta?.crossroadId);
    const opt = def?.options.find((o) => o.id === optionId);
    if (def && opt) {
      if (opt.hpDelta) war.hp = clamp(war.hp + opt.hpDelta, 1, 100);
      if (opt.cpDelta) war.cp = clamp(war.cp + opt.cpDelta, 0, 100);
      if (opt.fortDelta) war.fort = clamp(war.fort + opt.fortDelta, 0, 85);
      if (opt.exposureDelta) war.exposure = clamp(war.exposure + opt.exposureDelta, 0, 100);
      if (opt.id === 'poison_well') {
        for (const e of getLivingEnemies(war)) e.hp = Math.max(12, e.hp - 14);
      }
      if (opt.id === 'take_cipher_honor_letter') {
        const livingRivals = getLivingEnemies(war);
        if (livingRivals.length > 0) {
          const target = [...livingRivals].sort((a, b) => a.intel - b.intel)[0];
          addEnemyIntel(target, 12);
        }
      }
      if (opt.id === 'disarm_loot' && !rng.chance(clamp(0.65 + state.stats.intel * 0.004, 0.65, 0.92))) {
        const blast = rng.int(10, 16);
        war.hp = Math.max(8, war.hp - blast);
        pushLog(state, 'danger', `A hidden secondary wire snaps inside the cache, scorching you for ${blast} damage as you grab the supplies!`);
      }
      if (opt.allyTrustDelta && war.allyId) {
        modRel(war, war.allyId, 'player', { trust: opt.allyTrustDelta });
      }
      let partnerReactionNote = '';
      if (war.partner?.active && opt.reactions) {
        const rawSum = war.partner.traits.reduce((acc, tr) => acc + (opt.reactions?.[tr] ?? 0), 0);
        if (rawSum !== 0) {
          const rawDelta = clamp(Math.round(rawSum * 1.5), -18, 15);
          const actual = adjustPartnerTrust(state, war.partner, rawDelta);
          if (actual !== 0) {
            partnerReactionNote = ` ${war.partner.name} ${actual > 0 ? 'approves of your call' : 'disagrees with your call'} (Trust ${actual > 0 ? `+${actual}` : actual}).`;
          }
        }
      }
      if (opt.squadTrustDelta && state.team) {
        state.team.members.forEach((m) => isPersonAlive(state, m.personId) && m.personId !== war.partner?.personId && adjustMemberTrust(state, m, opt.squadTrustDelta!));
      }
      if (opt.stats) {
        for (const [k, v] of Object.entries(opt.stats) as [StatKey, number][]) {
          state.stats[k] += v;
        }
      }
      if (opt.leanings) {
        for (const [k, v] of Object.entries(opt.leanings) as [LeaningKey, number][]) {
          addLeaning(state, k, v);
        }
      }
      clampStats(state);
      pushLog(state, 'war', `${opt.resultText}${partnerReactionNote}`);
    }
    queueDayDecision(war, 0.55);
    return;
  }

  // === 5 PRESSURE SYSTEMS ===
  if (decision.kind === 'war_pressure') {
    const pType = String(decision.meta?.pressureType ?? '');
    const enemyId = String(decision.meta?.enemyId ?? '');
    const enemy = war.enemies.find((e) => e.id === enemyId && e.alive);

    if (pType === 'hostage') {
      if (optionId === 'rescue_fight' && enemy) {
        state.stats.will += 4;
        clampStats(state);
        if (state.team) state.team.members.forEach((m) => isPersonAlive(state, m.personId) && adjustMemberTrust(state, m, 6));
        startWarBattle(state, enemy.id, { isFinal: false, isAmbush: false, isDefense: false, startedInPhase: 'day' });
        return;
      }
      if (optionId === 'rescue_resolve' && war.resolves > 0) {
        war.resolves -= 1;
        state.bodyStrain += 3;
        state.stats.will += 4;
        state.stats.bonds += 4;
        const rx = applyResolvePartnerReaction(state, war, rng);
        recordWarFact(war, {
          type: 'resolve_burst',
          actorId: 'player',
          actorName: state.name,
          detail: 'Spent Resolve for an instant hostage rescue',
        });
        pushLog(state, 'bond', `In a single Body Flicker flash, you sever the ropes and vanish with the scout unharmed!${rx.note}`);
      } else {
        state.stats.bonds -= 5;
        addLeaning(state, 'ruthless', 2);
        if (state.nindo === 'never_go_back' || state.nindo === 'protect_bonds') {
          state.stats.will = Math.max(0, state.stats.will - 4);
          pushLog(
            state,
            'danger',
            'You betrayed your own Nindo, turning away as dusk closed over a captured comrade (-4 Will).',
          );
        } else {
          pushLog(state, 'danger', 'You remain silent in the brush as dusk closes over the ridge.');
        }
      }
      clampStats(state);
      queueDayDecision(war, 0.55);
      return;
    }

    if (pType === 'coalition') {
      if (optionId === 'coalition_strike' && enemy) {
        startWarBattle(state, enemy.id, { isFinal: false, isAmbush: true, isDefense: false, startedInPhase: 'day' });
        return;
      }
      if (optionId === 'coalition_brace') {
        war.fort = clamp(war.fort + 8, 0, 85);
        war.exposure = clamp(war.exposure + 6, 0, 100);
        pushLog(state, 'war', 'You rig secondary explosive corridors to weather the enemy coalition.');
      } else {
        war.fort = Math.floor(war.fort * 0.4);
        war.exposure = clamp(war.exposure - 14, 0, 100);
        war.coalitionEnemyIds = [];
        pushLog(state, 'war', 'You slip away from your old camp before dawn, leaving the coalition hitting empty tents.');
      }
      queueDayDecision(war, 0.55);
      return;
    }

    if (pType === 'siege') {
      if (optionId === 'siege_sally' && enemy) {
        state.flags.had_siege_break = true;
        recordWarFact(war, {
          type: 'siege_broken',
          actorId: 'player',
          actorName: state.name,
          targetId: enemy.id,
          targetName: enemy.name,
          detail: `Sallied out to break ${enemy.name}'s camp siege`,
        });
        startWarBattle(state, enemy.id, { isFinal: false, isAmbush: true, isDefense: false, startedInPhase: 'day' });
        return;
      }
      if (optionId === 'siege_thicken') {
        war.cp = Math.max(0, war.cp - 14);
        war.fort = Math.max(15, war.fort - 12);
        pushLog(state, 'war', 'Reinforced sealing wards absorb the barrage, preserving half your camp defenses.');
      } else {
        war.fort = Math.floor(war.fort * 0.3);
        war.exposure = clamp(war.exposure - 15, 0, 100);
        pushLog(state, 'war', 'You abandon the battered camp through a dry creekbed and reset your scent.');
      }
      queueDayDecision(war, 0.55);
      return;
    }

    if (pType === 'hunt' || pType === 'hunted') {
      if ((optionId === 'hunt_join' || optionId === 'hunted_fight') && enemy) {
        if (optionId === 'hunt_join') {
          war.nextBattleBonus += 10;
          war.bountyActive = true;
        }
        startWarBattle(state, enemy.id, {
          isFinal: false,
          isAmbush: optionId === 'hunt_join',
          isDefense: optionId === 'hunted_fight',
          startedInPhase: 'day',
        });
        return;
      }
      if (optionId === 'hunted_evade') {
        war.cp = Math.max(0, war.cp - 12);
        war.hp = Math.max(10, war.hp - 8);
        pushLog(state, 'danger', 'You blow three smoke seals to shake the bounty hunters off your trail (-12 CP, -8 HP).');
      } else {
        war.cp = clamp(war.cp + 6, 0, 100);
        pushLog(state, 'war', 'You let the other hunters bleed each other while conserving your own chakra.');
      }
      queueDayDecision(war, 0.55);
      return;
    }

    if (pType === 'strategic_point') {
      if (optionId === 'claim_ridge' && enemy) {
        pushLog(state, 'milestone', 'You charge onto the Strategic High Ground to contest control of the valley!');
        startWarBattle(state, enemy.id, {
          isFinal: false,
          isAmbush: false,
          isDefense: false,
          startedInPhase: 'day',
          rewardTag: 'strategic_ridge',
        });
        return;
      }
      war.strategicClaimedBy = enemy?.id ?? 'npc';
      war.hp = clamp(war.hp + 8, 0, 100);
      war.cp = clamp(war.cp + 8, 0, 100);
      pushLog(state, 'war', 'You let rival factions fight over the ridge while conserving your strength in the shadows.');
      queueDayDecision(war, 0.55);
      return;
    }
  }

  // === DAY ACTION ===
  if (decision.kind === 'war_day') {
    const living = getLivingEnemies(war);
    const hasMedical = state.disciplines.some((d) => d.id === 'medical');
    const hasFortBonus = state.disciplines.some((d) => d.id === 'barrier' || d.id === 'trap_craft' || d.id === 'earth_release');

    if (optionId === 'day_cover') {
      war.exposure = clamp(war.exposure - 7, 0, 100);
      state.stats.will = clamp(state.stats.will + 1, 0, 100);
      pushLog(state, 'war', 'You blend into supply columns and scrub chakra traces along your approach (Exposure -7).');
    } else if (optionId === 'day_recon' && living.length > 0) {
      const target = [...living].sort((a, b) => a.intel - b.intel)[0];
      const cloneBonus = state.disciplines.some((d) => d.id === 'shadow_clone') ? 8 : 0;
      const gain = rng.int(14, 24) + Math.round(state.stats.intel * 0.08) + cloneBonus;
      addEnemyIntel(target, gain);
      pushLog(
        state,
        'war',
        `Daylight recon${cloneBonus > 0 ? ' with Shadow Clone scouts' : ''} yields +${gain} Intel on ${target.intel >= 80 ? target.name : `a rival ${target.archetype}`} (now ${target.intel}%).`,
      );
    } else if (optionId === 'day_recover') {
      const hpGain = hasMedical ? 16 : 10;
      war.hp = clamp(war.hp + hpGain, 0, 100);
      war.cp = clamp(war.cp + 12, 0, 100);
      pushLog(state, 'war', `You dress wounds and meditate in quiet cover (+${hpGain} HP, +12 CP).`);
    } else if (optionId === 'day_fortify') {
      const fGain = rng.int(9, 15) + (hasFortBonus ? 6 : 0);
      war.fort = clamp(war.fort + fGain, 0, 85);
      pushLog(state, 'war', `You string explosive tags and chakra wires across the perimeter (Fort +${fGain}).`);
    } else if ((optionId === 'day_outpost_intel' || optionId === 'day_outpost') && state.stats.ryo >= 6 && living.length > 0) {
      state.stats.ryo -= 6;
      const target = [...living].sort((a, b) => a.intel - b.intel)[0];
      addEnemyIntel(target, 35);
      pushLog(
        state,
        'war',
        `An information broker trades frontier dossiers for 6 Ryo (+35 Intel on ${target.intel >= 80 ? target.name : `a rival ${target.archetype}`}).`,
      );
    } else if (optionId === 'day_outpost_bounty' && !war.bountyActive) {
      war.bountyActive = true;
      pushLog(state, 'war', 'You accept an outpost elimination bounty: your next rival takedown grants +1 Resolve.');
    } else if (optionId === 'day_kizuna') {
      if (war.partner?.active) {
        const gained = adjustPartnerTrust(state, war.partner, rng.int(3, 5));
        war.exposure = clamp(war.exposure + 3, 0, 100);
        war.hp = clamp(war.hp + 4, 0, 100);
        if (living.length > 0) {
          const target = [...living].sort((a, b) => a.intel - b.intel)[0];
          addEnemyIntel(target, 14);
        }
        pushLog(
          state,
          'bond',
          `You share a quiet daylight patrol and rations with ${war.partner.name} (Trust ${gained >= 0 ? `+${gained}` : gained}, +4 HP, +14 Intel, +3 Exposure).`,
        );
      } else if (state.team) {
        const ally = state.team.members.find((m) => {
          const p = getPerson(state, m.personId);
          return Boolean(p && p.identity.alive && p.identity.specialStatus !== 'missing_nin');
        });
        if (ally) {
          adjustMemberTrust(state, ally, 5);
          war.hp = clamp(war.hp + 4, 0, 100);
          if (living.length > 0) {
            const target = rng.pick(living);
            addEnemyIntel(target, 14);
          }
          pushLog(state, 'bond', `You meet ${personName(state, ally.personId)} briefly behind a cedar ridge, trading supplies and sector notes (+4 HP, +14 Intel).`);
        }
      }
    }

    queueNightDecision(war);
    return;
  }

  // === NIGHT ACTION ===
  if (decision.kind === 'war_night') {
    if (optionId === 'night_scout') {
      state.pending = buildTargetSelectDecision(state, 'scout');
      return;
    }
    if (optionId === 'night_raid') {
      state.pending = buildTargetSelectDecision(state, 'raid');
      return;
    }
    if (optionId === 'night_sabotage') {
      state.pending = buildTargetSelectDecision(state, 'sabotage');
      return;
    }
    if (optionId === 'night_snipe') {
      state.pending = buildTargetSelectDecision(state, 'snipe');
      return;
    }
    if (optionId === 'night_infiltrate') {
      state.pending = buildTargetSelectDecision(state, 'infiltrate');
      return;
    }
    if (optionId === 'night_ally') {
      state.pending = buildTargetSelectDecision(state, 'ally');
      return;
    }

    if (optionId === 'night_guard') {
      war.fort = clamp(war.fort + 8, 0, 85);
      war.hp = clamp(war.hp + 4, 0, 100);
      pushLog(state, 'war', 'You hold watch over your reinforced camp through the night (+8 Fort, +4 HP).');
    } else if (optionId === 'night_hide') {
      war.hidTonight = true;
      war.hp = clamp(war.hp + 7, 0, 100);
      war.cp = clamp(war.cp + 10, 0, 100);
      pushLog(state, 'war', 'You suppress your chakra signature completely and rest out of sight (+7 HP, +10 CP).');
    } else if (optionId === 'night_talk_partner' && war.partner?.active) {
      const prevFrags = war.partner.fragments;
      const unlockFrag = rng.chance(0.7);
      const gained = adjustPartnerTrust(state, war.partner, rng.int(4, 7), unlockFrag);
      war.hp = clamp(war.hp + 3, 0, 100);
      war.partner.hp = clamp(war.partner.hp + 6, 0, war.partner.maxHp);
      const fragUnlocked = war.partner.fragments > prevFrags;
      const fragNote =
        fragUnlocked && war.partner.fragments === 1
          ? ` Fragment 1/3 unlocked: ${war.partner.motive}`
          : fragUnlocked && war.partner.fragments === 2
            ? ` Fragment 2/3 unlocked: ${war.partner.originHint}`
            : fragUnlocked
              ? ` Fragment 3/3 unlocked: ${war.partner.name} speaks candidly about the burden they carry into this war.`
              : '';
      pushLog(
        state,
        'bond',
        `You spend a quiet night watch talking beside ${war.partner.name} (Trust ${gained >= 0 ? `+${gained}` : gained}, +5 HP, +8 Partner HP).${fragNote}`,
        { title: `Night Watch with ${war.partner.name}` },
      );
    } else if (optionId === 'night_workshop') {
      state.stats.ryo = Math.max(0, state.stats.ryo - 4);
      war.workshop = clamp(war.workshop + 35, 0, 100);
      if (war.workshop >= 100) {
        war.fort = clamp(war.fort + 15, 0, 85);
        pushLog(state, 'milestone', 'Your Perimeter Barrier Network is complete! (+15 Fort, +10 Camp Defense).');
      } else {
        pushLog(state, 'war', `You inscribe layered barrier arrays through the night (Barrier Network ${war.workshop}/100).`);
      }
    } else if (optionId === 'night_sensory') {
      war.cp = Math.max(0, war.cp - 8);
      for (const e of getLivingEnemies(war)) {
        addEnemyIntel(e, 25);
      }
      pushLog(state, 'war', 'Your Sensory Sweep maps chakra signatures across the valley (+25 Intel on all rivals).');
    } else if (optionId === 'night_senjutsu') {
      war.cp = clamp(war.cp + 30, 0, 100);
      war.nextBattleBonus += 8;
      war.exposure = clamp(war.exposure + 6, 0, 100);
      pushLog(state, 'war', 'Dense natural energy floods your coils (+30 CP, +8 next battle power, +6 Exposure).');
    } else if (optionId === 'night_hunt_echo' && war.crisis && war.crisis.phase >= 2 && war.crisis.echoesLeft > 0) {
      const dmg = rng.int(10, 18);
      war.hp = Math.max(4, war.hp - dmg);
      war.cp = Math.max(0, war.cp - 12);
      war.crisis.echoesLeft -= 1;
      war.resolves += 1;
      pushLog(
        state,
        'crisis',
        `You purge a Corrupted Chakra Echo in fierce midnight combat (-${dmg} HP, +1 Resolve | ${war.crisis.echoesLeft} Echoes left).`,
      );
    } else if (optionId === 'night_hunt_sentinel' && war.crisis && war.crisis.phase >= 2 && war.crisis.sentinelsLeft > 0) {
      const dmg = rng.int(12, 20);
      war.hp = Math.max(4, war.hp - dmg);
      war.cp = Math.max(0, war.cp - 14);
      war.crisis.sentinelsLeft -= 1;
      war.crisis.guardsActive = Math.max(0, war.crisis.guardsActive - 1);
      war.resolves += 1;
      pushLog(
        state,
        'crisis',
        `You shatter a Forbidden Relic Sentinel! (-${dmg} HP, +1 Resolve | Mastermind Divisor now x${getMastermindDivisor(state, war.crisis)}).`,
        { title: `Sentinel Shattered (${war.crisis.sentinelsLeft}/5 Left)` },
      );
    } else if (optionId === 'night_boss_raid' && war.crisis && war.crisis.phase === 3) {
      state.pending = buildCrisisBossDecision(state);
      return;
    }

    queueNightSequence(war);
    return;
  }

  // === TARGET SELECTION ===
  if (decision.kind === 'war_target') {
    if (optionId === 'cancel_back') {
      state.pending = buildWarNightDecision(state);
      return;
    }
    const mode = String(decision.meta?.actionMode ?? 'scout');
    const target = war.enemies.find((e) => e.id === optionId && e.alive);
    if (!target) {
      queueNightSequence(war);
      return;
    }

    if (mode === 'ally') {
      const chance = calcAllyAcceptChance(state, war, target);
      if (rng.chance(chance)) {
        establishPlayerAlliance(state, war, target, rng);
      } else {
        modRel(war, target.id, 'player', { respect: 3 });
        pushLog(
          state,
          'war',
          `${target.intel >= 80 ? target.name : `The rival ${target.archetype}`} refuses your alliance proposal cleanly, preferring to fight alone.`,
        );
      }
      queueNightSequence(war);
      return;
    }

    if (mode === 'raid') {
      startWarBattle(state, target.id, { isFinal: false, isAmbush: true, isDefense: false });
      return;
    }

    if (mode === 'scout') {
      const gain = rng.int(24, 38) + Math.round(state.stats.intel * 0.08);
      target.intel = clamp(target.intel + gain, 0, 100);
      if (target.intel >= 90) target.skillsRevealed = true;
      pushLog(
        state,
        'war',
        `Night recon reveals +${gain} Intel on ${target.intel >= 80 ? target.name : `rival ${target.archetype}`} (now ${target.intel}%).`,
      );
      if (target.id !== war.allyId && rng.chance(0.14)) {
        startWarBattle(state, target.id, { isFinal: false, isAmbush: false, isDefense: false });
        return;
      }
    } else if (mode === 'sabotage') {
      state.stats.ryo = Math.max(0, state.stats.ryo - 8);
      const ok = rng.chance(clamp(0.35 + state.stats.intel * 0.004 + target.intel * 0.003, 0.25, 0.85));
      if (ok) {
        target.fort = Math.max(0, target.fort - 22);
        const dmg = rng.int(12, 22);
        target.hp = Math.max(10, target.hp - dmg);
        modRel(war, target.id, 'player', { grudge: 16, fear: 6 });
        pushLog(state, 'war', `Explosive tags rip through the enemy camp, shredding traps and dealing ${dmg} damage!`);
      } else {
        war.exposure = clamp(war.exposure + 10, 0, 100);
        pushLog(state, 'danger', 'Your sabotage fuse is spotted early; you withdraw under fire (Exposure +10).');
      }
    } else if (mode === 'snipe') {
      war.cp = Math.max(0, war.cp - 10);
      if (war.allyId === target.id) {
        war.allyId = null;
        war.allyBetrayed = true;
        target.allyId = null;
        modRel(war, target.id, 'player', { trust: -45, grudge: 40, slight: 2 });
        recordWarFact(war, {
          type: 'ally_betray',
          actorId: 'player',
          actorName: state.name,
          targetId: target.id,
          targetName: target.name,
          detail: `Sniped wartime ally ${target.name} from ambush`,
        });
      }
      const proj = computeCombatProjection(state);
      const hitScore = proj.spd * 3 + proj.ins * 2 + rng.int(-12, 14) - (target.ranks[1] * 3 + 6);
      if (hitScore >= 0) {
        const dmg = rng.int(10, 24);
        target.hp = Math.max(0, target.hp - dmg);
        modRel(war, target.id, 'player', { grudge: 14, fear: 8 });
        pushLog(state, 'war', `Your long-range snipe finds its mark through the canopy for ${dmg} damage!`);
        if (target.hp <= 0) {
          markEnemyDead(war, target);
          war.kills += 1;
          if (war.bountyActive) {
            war.bountyActive = false;
            war.resolves += 1;
            pushLog(state, 'milestone', 'Outpost bounty fulfilled from long range! You gain +1 Resolve.');
          }
          recordWarFact(war, {
            type: 'kill',
            actorId: 'player',
            actorName: state.name,
            targetId: target.id,
            targetName: target.name,
            detail: `Eliminated ${target.name} via long-range snipe`,
          });
          pushLog(state, 'milestone', `Target eliminated from long range: ${target.name} (${target.epithet})!`);
        }
      } else {
        war.exposure = clamp(war.exposure + 10, 0, 100);
        pushLog(state, 'danger', 'The target deflects your shot and marks your firing line (Exposure +10).');
      }
    } else if (mode === 'infiltrate') {
      const proj = computeCombatProjection(state);
      const diff = proj.spd * 2 + proj.ins * 2 + target.intel * 0.1 + rng.int(-14, 14) - (target.ranks[4] * 3 + 10);
      if (diff >= 10) {
        target.intel = 100;
        target.skillsRevealed = true;
        const dmg = rng.int(18, 30);
        target.hp = Math.max(5, target.hp - dmg);
        modRel(war, target.id, 'player', { fear: 14, grudge: 18 });
        pushLog(
          state,
          'milestone',
          `Silent infiltration succeeds! You expose ${target.name} (${target.epithet}) and leave a deep ${dmg}-damage wound before vanishing.`,
        );
      } else if (diff >= 0) {
        target.intel = clamp(target.intel + 40, 0, 100);
        target.skillsRevealed = true;
        pushLog(state, 'war', `You slip out with full dossier notes on ${target.intel >= 80 ? target.name : 'the target'}.`);
      } else {
        war.exposure = clamp(war.exposure + 12, 0, 100);
        pushLog(state, 'danger', 'A wire alarm trips inside their camp! You flee under pursuit (Exposure +12).');
      }
    }

    queueNightSequence(war);
    return;
  }

  // === WAR FINALE: WINNER'S WISH (K4) ===
  if (decision.kind === 'war_finale_wish') {
    const finaleOutcome = (decision.meta?.outcome === 'shared' ? 'shared' : 'victor') as 'victor' | 'shared';
    const leader = kageTitle(state);
    const partner = war.partner;

    if (optionId === 'wish_peace') {
      state.world.peaceAccordUntilAge = state.age + 12;
      state.world.tension = 8;
      state.stats.bonds += 6;
      state.stats.will += 4;
      pushLog(
        state,
        'milestone',
        `Armistice Decree: You compel the five border commanders to ratify a Twelve-Year Peace Accord (War cooldown doubled).`,
        { title: 'Winner’s Wish: Peace Accord' },
      );
      recordMemory(state, 'war', `Ratified a twelve-year Peace Accord after Great Shinobi War #${war.warNumber}.`);
    } else if (optionId === 'wish_protect') {
      state.stats.health += 10;
      state.stats.bonds += 8;
      state.stats.will += 6;
      if (state.team) {
        state.team.members.forEach((m) => isPersonAlive(state, m.personId) && adjustMemberTrust(state, m, 8));
      }
      pushLog(
        state,
        'bond',
        `Armistice Decree: War reparations go straight toward barrier towers, clinics, and pensions for the families of ${VILLAGE_MAP[state.villageId].name}.`,
        { title: 'Winner’s Wish: Shield the Village' },
      );
    } else if (optionId === 'wish_kage') {
      state.flags.kage_endorsed = true;
      state.stats.will += 6;
      state.stats.bonds += 5;
      state.stats.ryo += 15;
      pushLog(
        state,
        'milestone',
        `Armistice Decree: The frontline elders formally endorse your name for future ${leader} succession.`,
        { title: `Winner’s Wish: ${leader} Endorsement` },
      );
      recordMemory(state, 'promotion', `Won formal council endorsement for ${leader} after War #${war.warNumber}.`);
    } else if (optionId === 'wish_vengeance') {
      const target = war.enemies.find((e) => e.alive) ?? war.enemies[0];
      state.world.vengeanceTargetId = target?.personId ?? null;
      state.stats.chakra += 6;
      state.stats.will += 6;
      state.stats.ryo += 12;
      pushLog(
        state,
        'war',
        `Armistice Decree: You post an open bounty across the five borders, swearing unfinished blood debts will be settled.`,
        { title: 'Winner’s Wish: Oath of Reckoning' },
      );
    } else if (optionId === 'wish_kinjutsu') {
      state.stats.chakra += 12;
      state.stats.intel += 6;
      state.stats.health = Math.max(10, state.stats.health - 6);
      if (state.disciplines.length > 0) {
        const main = state.disciplines.find((d) => d.isMain) ?? state.disciplines[0];
        main.xp += 15;
      }
      pushLog(
        state,
        'crisis',
        `Armistice Decree: You claim a sealed Kinjutsu war scroll from the surrendered vault, burning forbidden insight into your coils.`,
        { title: 'Winner’s Wish: Sealed War Vault' },
      );
    } else if (optionId === 'wish_dominion') {
      state.stats.ryo += 25;
      state.stats.chakra += 6;
      state.stats.intel += 4;
      addLeaning(state, 'ruthless', 1);
      pushLog(
        state,
        'war',
        `Armistice Decree: You strip the contested passes of every supply depot and silver chest before marching home.`,
        { title: 'Winner’s Wish: Frontier Tribute' },
      );
    } else if (optionId === 'wish_partner_dream' && partner) {
      partner.relPoints += 15;
      adjustPartnerTrust(state, partner, 10, true);
      state.stats.bonds += 5;
      state.stats.will += 5;
      pushLog(
        state,
        'bond',
        `Armistice Decree: You spend your victory to honor ${partner.name}’s deepest wish (${partner.motive}).`,
        { title: `Winner’s Wish: ${partner.name}’s Dream` },
      );
      recordMemory(state, 'war', `Granted ${partner.name}'s wish at the end of Great Shinobi War #${war.warNumber}.`);
    } else if (optionId === 'wish_stay_with_me' && partner) {
      partner.relPoints += 12;
      adjustPartnerTrust(state, partner, 8, true);
      state.permanentPartner = createPermanentPartnerFromWar(state, partner);
      state.stats.bonds += 6;
      pushLog(
        state,
        'bond',
        `You ask for neither silver nor titles, only that ${partner.name} remain at your side beyond this war. ${partner.name} nods softly and clasps your hand: they will walk with you into every dawn ahead.`,
        { title: `Permanent Partner: ${partner.name}` },
      );
      recordMemory(state, 'war', `Asked ${partner.name} to remain permanently beside you after War #${war.warNumber}.`);
    }

    clampStats(state);
    concludeWar(state, rng, finaleOutcome, true);
    return;
  }

  // === PARTNER DOWNED CHOICE (K1) ===
  if (decision.kind === 'war_partner_down') {
    const wasDefense = Boolean(decision.meta?.wasDefense);
    const startedInDay = Boolean(decision.meta?.startedInDay);
    if (optionId === 'partner_withdraw') {
      pushLog(
        state,
        'bond',
        `You shoulder ${war.partner?.name ?? 'your fallen partner'} out of the smoking ravine, withdrawing from War #${war.warNumber} rather than leaving them behind.`,
        { title: 'Withdrew to Carry Fallen Partner' },
      );
      concludeWar(state, rng, 'withdrew', true);
      return;
    }
    pushLog(
      state,
      'war',
      `With ${war.partner?.name ?? 'your partner'} out of the fight, you tighten your headband and resolve to see the rest of War #${war.warNumber} through alone.`,
    );
    if (startedInDay) {
      war.subPhase = 'day';
      queueNightDecision(war);
    } else if (wasDefense) {
      war.subPhase = 'night';
      war.beatQueue = [];
      war.beatClock = 0;
      enqueueWarBeat(war, {
        kind: 'dawn_tick',
        delay: Number((baseWarGap(war) * 0.75).toFixed(2)),
        label: 'Securing the battered perimeter until first light...',
        timeOfDay: 'dawn',
      });
    } else {
      war.subPhase = 'night';
      queueNightSequence(war);
    }
    return;
  }

  // === BATTLE ROUND ===
  if (decision.kind === 'war_battle_round') {
    const battle = war.activeBattle!;
    const enemy = war.enemies.find((e) => e.id === battle.enemyId)!;
    const { status, summary } = resolveBattleRound(state, optionId, rng);

    if (status === 'mode_toggled') {
      state.pending = buildBattleRoundDecision(state);
      return;
    }

    pushLog(
      state,
      summary.outcome.startsWith('clash') ? 'crisis' : summary.outcome === 'lose' ? 'danger' : 'war',
      `${summary.narrative} | ${summary.whyLine}`,
    );

    if (status === 'continue') {
      state.pending = buildBattleRoundDecision(state);
      return;
    }

    if (status === 'player_dead') {
      const chronicle = generateWarChronicle(state, war, 'dead');
      applyWarResultsToPeople(state, war);
      state.warHistory.push({
        warNumber: war.warNumber,
        ageAtStart: state.age,
        rankAtStart: state.rank,
        isCrisisWar: war.isCrisisWar,
        crisisId: war.crisisId,
        outcome: 'dead',
        title: chronicle.title,
        fieldPromoted: false,
        summary: `Fell in combat against ${enemy.name} on Day ${war.day}.`,
        narrativeArcs: chronicle.arcs,
      });
      state.war = null;
      killCharacter(
        state,
        `slain by ${enemy.name} (${enemy.epithet}) on Day ${war.day} of Great Shinobi War #${war.warNumber}`,
      );
      return;
    }

    // Consume one-battle prep bonus once the fight ends (win/retreat/dawn break)
    war.nextBattleBonus = 0;

    // Gate 8 Post-Battle Consequence: 70% fatal death / 30% permanent career-ending disability
    if (battle.gate8Used) {
      const g8 = resolveGate8Aftermath(state, rng);
      pushLog(state, g8.died ? 'danger' : 'crisis', g8.note, { title: 'Aftermath of the Eighth Gate' });
      if (g8.died) {
        const chronicle = generateWarChronicle(state, war, 'dead');
        applyWarResultsToPeople(state, war);
        state.warHistory.push({
          warNumber: war.warNumber,
          ageAtStart: state.age,
          rankAtStart: state.rank,
          isCrisisWar: war.isCrisisWar,
          crisisId: war.crisisId,
          outcome: 'dead',
          title: chronicle.title,
          fieldPromoted: false,
          summary: 'Burned to ash after unleashing the Eighth Gate of Death.',
          narrativeArcs: chronicle.arcs,
        });
        state.war = null;
        killCharacter(state, 'burning out their life force with the Eighth Gate of Death');
        return;
      }
    }

    if (battle.rewardTag === 'strategic_ridge') {
      if (status === 'player_won' || status === 'dawn_break') {
        war.strategicClaimedBy = 'player';
        pushLog(state, 'milestone', 'You secure the Strategic High Ground! (+6 Combat Power & +4 CP every dawn).');
      } else if (status === 'retreated') {
        war.strategicClaimedBy = enemy.id;
        pushLog(state, 'war', 'You disengage from the ridge, ceding the high ground to the enemy.');
      }
    }

    if (status === 'player_won') {
      if (war.bountyActive) {
        war.bountyActive = false;
        war.resolves += 1;
        pushLog(state, 'milestone', 'Outpost bounty fulfilled! You gain +1 Resolve.');
      }
      addLeaning(state, 'ambition', 1);
      if (battle.isFinal || getLivingEnemies(war).length === 0) {
        war.activeBattle = null;
        if (hasActiveCrisis(war)) {
          escalateToCrisisBoss(state, war);
        } else {
          concludeWar(state, rng, 'victor');
        }
        return;
      }
    }

    const wasDefense = battle.isDefense;
    const startedInDay = battle.startedInPhase === 'day';
    war.activeBattle = null;

    if (war.partner && !war.partner.active && !war.partner.defected && !war.partner.downHandled) {
      war.partner.downHandled = true;
      state.pending = {
        id: `war_partner_down_${war.warNumber}_${war.day}`,
        kind: 'war_partner_down',
        eventId: 'war_partner_down',
        title: war.partner.died
          ? `Partner Fallen: ${war.partner.name}`
          : `Partner Incapacitated: ${war.partner.name}`,
        body: war.partner.died
          ? `${war.partner.name} gave their life shielding you from the enemy's strike. The valley still burns around you.`
          : `${war.partner.name} took grievous wounds intercepting blows meant for you and cannot continue fighting. What will you do?`,
        manual: true,
        meta: { wasDefense, startedInDay },
        options: [
          {
            id: 'partner_continue_solo',
            label: 'Continue the war solo without a partner',
            sublabel: 'Stay in the sector and finish the campaign alone.',
            statHints: ['Will'],
            autoEligible: true,
          },
          {
            id: 'partner_withdraw',
            label: `Withdraw from War #${war.warNumber} to evacuate ${war.partner.name}`,
            sublabel: 'Ends the war immediately (Outcome: Withdrew) and preserves your own life.',
            statHints: ['Bonds'],
            autoEligible: false,
          },
        ],
      };
      return;
    }

    if (startedInDay) {
      war.subPhase = 'day';
      queueNightDecision(war);
    } else if (wasDefense) {
      war.subPhase = 'night';
      war.beatQueue = [];
      war.beatClock = 0;
      enqueueWarBeat(war, {
        kind: 'dawn_tick',
        delay: Number((baseWarGap(war) * 0.75).toFixed(2)),
        label: 'Securing the battered perimeter until first light...',
        timeOfDay: 'dawn',
      });
    } else {
      war.subPhase = 'night';
      queueNightSequence(war);
    }
  }
}
