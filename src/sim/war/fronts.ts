import { GREAT_VILLAGES, VILLAGE_MAP, VILLAGES } from '../../data/villages';
import { ensureVillagePopulation } from '../npc/lod-population';
import { generateCharacter, getPerson, killPerson } from '../people';
import { clamp } from '../powers';
import type { SeededRng } from '../rng';
import type {
  GameState,
  VillageId,
  WarAlly,
  WarCompetitor,
  WarFront,
  WarPlayerRole,
  WarState,
} from '../types';
import { getDiplomacyEdge } from '../world/geopolitics';

export const NON_COMBATANT_VILLAGES: ReadonlySet<VillageId> = new Set<VillageId>([
  'iron',
  'waves',
  'uzushio',
]);

// Posture B calibration constants (F3 / F10)
export const FRONT_STRENGTH_COEFF = 0.1;
export const FRONT_DOMINANCE_HIGH = 80;
export const FRONT_DOMINANCE_LOW = 20;
export const FRONT_DOMINANCE_TURNS = 3;

export function determineWarPlayerRole(state: GameState): WarPlayerRole {
  if (state.specialStatus === 'kage') return 'kage_hq';
  if (state.specialStatus === 'missing_nin') return 'mercenary';
  if (state.rank === 'jonin') return 'jonin_commander';
  if (state.rank === 'chunin') return 'chunin_squad';
  return 'genin_support';
}

/**
 * F1: Build allied vs enemy village coalitions directly from worldSim.diplomacy.
 * Land of Iron (neutral samurai), Waves (civilian), and Uzushio (ruins) are never war enemies.
 */
export function buildWarCoalitions(
  state: GameState,
  isCrisisWar: boolean,
  rng: SeededRng,
): { alliedVillages: VillageId[]; enemyVillages: VillageId[] } {
  const combatantIds = VILLAGES.map((v) => v.id).filter((id) => !NON_COMBATANT_VILLAGES.has(id));
  const greatIds = GREAT_VILLAGES.map((v) => v.id);

  if (isCrisisWar) {
    // F8: All Five Great Villages unite as the Allied Shinobi Forces
    const allied = new Set<VillageId>(greatIds);
    if (!NON_COMBATANT_VILLAGES.has(state.villageId)) {
      allied.add(state.villageId);
    }
    return { alliedVillages: [...allied], enemyVillages: [] };
  }

  const playerVillage: VillageId = NON_COMBATANT_VILLAGES.has(state.villageId) ? 'konoha' : state.villageId;
  const allied = new Set<VillageId>([playerVillage]);
  const enemy = new Set<VillageId>();
  const worldSim = state.worldSim;

  if (worldSim) {
    for (const vId of combatantIds) {
      if (vId === playerVillage) continue;
      const edge = getDiplomacyEdge(worldSim, playerVillage, vId);
      if (!edge) continue;
      if (edge.status === 'allied' || edge.status === 'treaty') {
        allied.add(vId);
      } else if (edge.status === 'hostile' || edge.status === 'at_war') {
        enemy.add(vId);
      }
    }
  }

  // Ensure at least 2 rival combatant villages form the opposing coalition
  const fallbackPool = greatIds.filter((id) => !allied.has(id) && !enemy.has(id));
  while (enemy.size < 2 && fallbackPool.length > 0) {
    const idx = rng.int(0, fallbackPool.length - 1);
    const picked = fallbackPool.splice(idx, 1)[0];
    enemy.add(picked);
  }
  if (enemy.size === 0) {
    for (const vId of combatantIds) {
      if (!allied.has(vId)) {
        enemy.add(vId);
        if (enemy.size >= 2) break;
      }
    }
  }

  return {
    alliedVillages: [...allied],
    enemyVillages: [...enemy],
  };
}

function computeCoalitionDivisionStrength(state: GameState, villageIds: readonly VillageId[]): number {
  if (!state.worldSim || villageIds.length === 0) return 150;
  let total = 0;
  for (const vId of villageIds) {
    const vSim = state.worldSim.villages[vId];
    if (!vSim) continue;
    const pop = ensureVillagePopulation(vSim);
    // Weighted combat power from L3 shinobi corps
    const corpsScore = pop.geninCorps * 0.15 + pop.chuninCorps * 0.4 + pop.joninCorps * 1.1;
    total += corpsScore;
  }
  return clamp(Math.round(total * 0.25), 90, 220);
}

/**
 * F3: Build 3 contested border fronts from real world territories (excluding neutral Land of Iron).
 */
export function initWarFronts(
  state: GameState,
  alliedVillages: readonly VillageId[],
  enemyVillages: readonly VillageId[],
  isCrisisWar: boolean,
  rng: SeededRng,
): WarFront[] {
  const allyPool = computeCoalitionDivisionStrength(state, alliedVillages);
  const enemyPool = isCrisisWar
    ? Math.round(allyPool * 1.04)
    : computeCoalitionDivisionStrength(state, enemyVillages);

  const baseAllyPerFront = Math.round(allyPool / 3);
  const baseEnemyPerFront = Math.round(enemyPool / 3);

  if (isCrisisWar) {
    const crisisNames = [
      { id: 'front_crisis_north', territoryId: 'crisis_north', name: 'Northern Sealing Line' },
      { id: 'front_crisis_center', territoryId: 'crisis_center', name: 'Central Crater Front' },
      { id: 'front_crisis_south', territoryId: 'crisis_south', name: 'Southern Extraction Ridge' },
    ];
    return crisisNames.map((f, idx) => ({
      id: f.id,
      territoryId: f.territoryId,
      name: f.name,
      control: 50 + (idx === 1 ? -4 : 2),
      allyStrength: clamp(baseAllyPerFront + rng.int(-4, 4), 30, 85),
      enemyStrength: clamp(baseEnemyPerFront + rng.int(-4, 4), 30, 85),
      dominantTurnsAlly: 0,
      dominantTurnsEnemy: 0,
    }));
  }

  const candidateTerrs = (state.worldSim?.territories ?? []).filter(
    (t) => t.controller !== 'iron' && t.id !== 'terr_iron_peaks',
  );
  // Prioritize territories touching either coalition
  const prioritized = [...candidateTerrs].sort((a, b) => {
    const aRel =
      (alliedVillages.includes(a.controller) || enemyVillages.includes(a.controller) ? 2 : 0) +
      (a.contestedBy && (alliedVillages.includes(a.contestedBy) || enemyVillages.includes(a.contestedBy)) ? 2 : 0);
    const bRel =
      (alliedVillages.includes(b.controller) || enemyVillages.includes(b.controller) ? 2 : 0) +
      (b.contestedBy && (alliedVillages.includes(b.contestedBy) || enemyVillages.includes(b.contestedBy)) ? 2 : 0);
    return bRel - aRel || b.flashpoint - a.flashpoint;
  });

  const chosen = prioritized.slice(0, 3);
  const fallbackNames = ['Kannabi Bridge Front', 'Rain Corridor Front', 'Red Dune Border Pass'];

  return [0, 1, 2].map((idx) => {
    const terr = chosen[idx];
    return {
      id: `front_${idx + 1}`,
      territoryId: terr?.id ?? `terr_front_${idx + 1}`,
      name: terr?.name ?? fallbackNames[idx],
      control: 50 + rng.int(-4, 4),
      allyStrength: clamp(baseAllyPerFront + rng.int(-5, 5), 32, 80),
      enemyStrength: clamp(baseEnemyPerFront + rng.int(-5, 5), 32, 80),
      dominantTurnsAlly: 0,
      dominantTurnsEnemy: 0,
    };
  });
}

/**
 * F2: Populate WarState.allies[] separately from war.enemies[] (never attackable, never betrayed, never culled).
 */
export function initWarAllies(
  state: GameState,
  alliedVillages: readonly VillageId[],
  fronts: readonly WarFront[],
  excludedPersonIds: Set<string>,
  rng: SeededRng,
): WarAlly[] {
  if (state.specialStatus === 'missing_nin') {
    return [];
  }

  const allies: WarAlly[] = [];
  const usedIds = new Set<string>(excludedPersonIds);

  const pushAlly = (
    personId: string,
    name: string,
    epithet: string,
    villageId: VillageId,
    role: string,
    powerScore: number,
  ): void => {
    if (usedIds.has(personId)) return;
    usedIds.add(personId);
    const front = fronts[allies.length % fronts.length];
    allies.push({
      id: `ally_${personId}`,
      personId,
      name,
      epithet,
      villageId,
      role,
      frontId: front.id,
      powerScore,
      hp: 100,
      alive: true,
    });
    front.allyStrength = clamp(front.allyStrength + Math.round(powerScore * 0.08), 20, 95);
  };

  // 1. Living loyal squadmates & rival from home village
  if (state.team) {
    for (const m of state.team.members) {
      const p = getPerson(state, m.personId);
      if (!p || !p.identity.alive || p.identity.specialStatus === 'missing_nin') continue;
      const isRival = m.personId === state.rivalId;
      pushAlly(
        p.identity.id,
        p.identity.name,
        isRival ? `Allied Rival of ${VILLAGE_MAP[p.identity.villageId].name}` : p.identity.roleTitle,
        p.identity.villageId,
        m.role === 'sensei' ? 'Squad Sensei' : isRival ? 'Allied Rival' : 'Squadmate',
        p.identity.powerScore,
      );
    }
  }

  // 2. Pull up to 4 total named allies from allied villages in worldSim
  const alliedSet = new Set(alliedVillages);
  if (state.worldSim) {
    const candidates = state.worldSim.npcs.filter(
      (n) =>
        n.identity.alive &&
        !usedIds.has(n.identity.id) &&
        (n.identity.occupation === 'shinobi' || n.identity.occupation === 'samurai') &&
        alliedSet.has(n.identity.villageId) &&
        n.identity.specialStatus !== 'missing_nin' &&
        n.identity.specialStatus !== 'kage' &&
        (n.identity.rank === 'chunin' || n.identity.rank === 'jonin'),
    );
    for (const c of candidates.slice(0, Math.max(0, 4 - allies.length))) {
      pushAlly(
        c.identity.id,
        c.identity.name,
        c.identity.epithet ?? `${VILLAGE_MAP[c.identity.villageId].name} Division`,
        c.identity.villageId,
        c.identity.rank === 'jonin' ? 'Division Captain' : 'Frontline Chunin',
        c.identity.powerScore,
      );
    }
  }

  // Guarantee at least 1 same-village comrade in allies[]
  if (allies.length === 0 && !NON_COMBATANT_VILLAGES.has(state.villageId)) {
    const vDef = VILLAGE_MAP[state.villageId];
    const generated = generateCharacter(
      state,
      {
        age: clamp(Math.max(18, state.age + rng.int(0, 6)), 18, 50),
        villageId: state.villageId,
        occupation: 'shinobi',
        rank: 'chunin',
        roleTitle: `${vDef.name} Vanguard`,
        lodTier: 'L1',
        observed: true,
      },
      rng,
    );
    pushAlly(
      generated.identity.id,
      generated.identity.name,
      `${vDef.name} Vanguard`,
      state.villageId,
      'Division Vanguard',
      generated.identity.powerScore,
    );
  }

  return allies;
}

export function assignEnemiesToFronts(enemies: WarCompetitor[], fronts: WarFront[]): void {
  if (fronts.length === 0) return;
  enemies.forEach((e, idx) => {
    const front = fronts[idx % fronts.length];
    e.frontId = front.id;
    front.enemyStrength = clamp(front.enemyStrength + Math.round(e.ranks[0] * 1.1), 20, 95);
  });
}

export function applyPlayerFrontImpact(
  war: WarState,
  controlDelta: number,
  enemyStrengthDelta = 0,
  allyStrengthDelta = 0,
  targetFrontId?: string,
): WarFront | null {
  const fronts = war.fronts;
  if (!fronts || fronts.length === 0) return null;
  const fId = targetFrontId ?? war.activeFrontId ?? fronts[0].id;
  const front = fronts.find((f) => f.id === fId) ?? fronts[0];
  front.control = clamp(front.control + controlDelta, 0, 100);
  if (enemyStrengthDelta !== 0) {
    front.enemyStrength = clamp(front.enemyStrength + enemyStrengthDelta, 10, 98);
  }
  if (allyStrengthDelta !== 0) {
    front.allyStrength = clamp(front.allyStrength + allyStrengthDelta, 10, 98);
  }
  return front;
}

export interface FrontTickResult {
  logs: string[];
  armisticeOutcome: 'victory' | 'draw' | 'defeat' | null;
  armisticeReason: string | null;
}

/**
 * F3 / F5 / F6 / F7:
 * Advance all 3 war fronts each dawn, run division reinforcement AI, compute casualties/exhaustion,
 * and test Land of Iron armistice triggers.
 */
export function tickFrontsAtDawn(state: GameState, war: WarState, rng: SeededRng): FrontTickResult {
  const fronts = war.fronts;
  if (!fronts || fronts.length === 0) {
    return { logs: [], armisticeOutcome: null, armisticeReason: null };
  }

  const logs: string[] = [];

  // F6: Division AI reinforces weakest contested front from strongest front on each side
  if (fronts.length >= 2) {
    const sortedByAlly = [...fronts].sort((a, b) => b.allyStrength - a.allyStrength);
    const donorA = sortedByAlly[0];
    const targetA = [...fronts].sort((a, b) => a.control - b.control)[0];
    if (donorA.id !== targetA.id && donorA.allyStrength >= 36) {
      const shift = rng.int(2, 4);
      donorA.allyStrength -= shift;
      targetA.allyStrength = clamp(targetA.allyStrength + shift, 15, 98);
    }

    const sortedByEnemy = [...fronts].sort((a, b) => b.enemyStrength - a.enemyStrength);
    const donorE = sortedByEnemy[0];
    const targetE = [...fronts].sort((a, b) => b.control - a.control)[0];
    if (donorE.id !== targetE.id && donorE.enemyStrength >= 36) {
      const shift = rng.int(2, 4);
      donorE.enemyStrength -= shift;
      targetE.enemyStrength = clamp(targetE.enemyStrength + shift, 15, 98);
    }
  }

  // F3: Update front control using Posture B: (allyStrength - enemyStrength) * 0.1 + variance
  let allyDominantFronts = 0;
  let enemyDominantFronts = 0;
  let totalControl = 0;

  for (const f of fronts) {
    const livingAcesOnFront = war.enemies.filter((e) => e.alive && e.frontId === f.id).length;
    const livingAlliesOnFront = (war.allies ?? []).filter((a) => a.alive && a.frontId === f.id).length;
    const aceFactor = (livingAlliesOnFront - livingAcesOnFront) * 2;
    const rawDelta = Math.round((f.allyStrength - f.enemyStrength + aceFactor) * FRONT_STRENGTH_COEFF) + rng.int(-2, 2);
    const delta = clamp(rawDelta, -7, 7);
    f.control = clamp(f.control + delta, 0, 100);
    totalControl += f.control;

    if (f.control >= FRONT_DOMINANCE_HIGH) {
      f.dominantTurnsAlly += 1;
      f.dominantTurnsEnemy = 0;
    } else if (f.control <= FRONT_DOMINANCE_LOW) {
      f.dominantTurnsEnemy += 1;
      f.dominantTurnsAlly = 0;
    } else {
      f.dominantTurnsAlly = 0;
      f.dominantTurnsEnemy = 0;
    }

    if (f.dominantTurnsAlly >= FRONT_DOMINANCE_TURNS) allyDominantFronts += 1;
    if (f.dominantTurnsEnemy >= FRONT_DOMINANCE_TURNS) enemyDominantFronts += 1;

    // F5: Attrition & occasional named ally injury/fall on hard-pressed fronts
    if (f.control <= 30 && war.allies) {
      const frontAllies = war.allies.filter((a) => a.alive && a.frontId === f.id);
      if (frontAllies.length > 0 && rng.chance(0.08)) {
        const hurt = rng.pick(frontAllies);
        hurt.hp = Math.max(0, hurt.hp - rng.int(22, 42));
        if (hurt.hp <= 0) {
          hurt.alive = false;
          killPerson(
            state,
            hurt.personId,
            state.birthYear + state.age,
            `fell holding ${f.name} during War #${war.warNumber}`,
          );
          if (state.worldSim?.villages[hurt.villageId]?.population) {
            state.worldSim.villages[hurt.villageId].population!.warCasualtiesTotal += 1;
          }
          logs.push(`Casualty Report: Allied shinobi ${hurt.name} fell holding the line at ${f.name}.`);
        }
      }
    }
  }

  // Record L3 division attrition & advance war exhaustion (F10 calibrated)
  const avgControl = totalControl / fronts.length;
  const allyLoss = rng.int(5, 7) + (avgControl < 45 ? 2 : 0);
  const enemyLoss = rng.int(5, 7) + (avgControl > 55 ? 2 : 0);
  war.allyExhaustion = clamp((war.allyExhaustion ?? 0) + allyLoss, 0, 100);
  war.enemyExhaustion = clamp((war.enemyExhaustion ?? 0) + enemyLoss, 0, 100);

  if (state.worldSim) {
    for (const vId of war.alliedVillages ?? []) {
      const pop = state.worldSim.villages[vId]?.population;
      if (pop) pop.warCasualtiesTotal += rng.int(2, 6);
    }
    for (const vId of war.enemyVillages ?? []) {
      const pop = state.worldSim.villages[vId]?.population;
      if (pop) pop.warCasualtiesTotal += rng.int(2, 6);
    }
  }

  if (war.isCrisisWar) {
    return { logs, armisticeOutcome: null, armisticeReason: null };
  }

  // F7: Land of Iron Armistice triggers
  if (allyDominantFronts >= 2) {
    return {
      logs,
      armisticeOutcome: 'victory',
      armisticeReason: 'Allied forces held two decisive fronts for three straight days, forcing enemy envoys to the Land of Iron table.',
    };
  }
  if (enemyDominantFronts >= 2) {
    return {
      logs,
      armisticeOutcome: 'defeat',
      armisticeReason: 'Enemy divisions broke two strategic fronts for three consecutive days, compelling an emergency armistice at the Land of Iron.',
    };
  }

  const exhausted = (war.allyExhaustion ?? 0) >= 100 || (war.enemyExhaustion ?? 0) >= 100;
  if (exhausted) {
    if (avgControl >= 57) {
      return {
        logs,
        armisticeOutcome: 'victory',
        armisticeReason:
          'Both coalitions hit wartime exhaustion; holding the stronger front lines secures favorable terms at the Land of Iron.',
      };
    }
    if (avgControl <= 43) {
      return {
        logs,
        armisticeOutcome: 'defeat',
        armisticeReason:
          'Severe war exhaustion forced allied commanders to accept painful ceasefire concessions at the Land of Iron.',
      };
    }
    return {
      logs,
      armisticeOutcome: 'draw',
      armisticeReason:
        'Both coalitions reached total exhaustion in a deadlock across the three fronts. Envoys meet in the neutral Land of Iron to sign a status-quo armistice.',
    };
  }

  return { logs, armisticeOutcome: null, armisticeReason: null };
}
