import { VILLAGE_MAP } from '../../data/villages';
import { clamp } from '../powers';
import { applyRel6Delta, getRelVector } from '../relationships';
import type { SeededRng } from '../rng';
import type {
  GameState,
  NpcActionKind,
  NpcDecisionTrace,
  NpcFamilyCrisis,
  NpcGoalDomain,
  NpcGoapPlan,
  NpcMemory,
  NpcMemoryCategory,
  NpcUtilityEvaluation,
  VillageSimState,
  WorldNpc,
  WorldSimState,
} from '../types';
import { ensureNpcCognitionState, ensureVillagePopulation } from './lod-population';

export interface NpcPerception {
  year: number;
  threatLevel: number; // 0..100
  familyUrgency: number; // 0..100
  careerOpportunity: number; // 0..100
  villageSickness: number; // 0..100
  bestAllyId: string | null;
  bestAllyName: string | null;
  bestAllyTrust: number;
  bestAllyAffection: number;
  bestAllyResentment: number;
  primaryRivalId: string | null;
  primaryRivalName: string | null;
  savedFamilyBonusByActor: Record<string, number>;
  negativeMemoryByActor: Record<string, number>;
  recentExamFailure: boolean;
  recentLossTrauma: boolean;
}

export interface UtilityWeights {
  wg: number; // Goal weight
  wp: number; // Personality weight
  wr: number; // Relationship weight
  wm: number; // Memory weight
}

export interface CognitiveActionReport {
  npcId: string;
  action: NpcActionKind;
  chosenTotal: number;
  dispatch?: {
    priority: number;
    tone: 'normal' | 'milestone' | 'danger' | 'bond' | 'war' | 'crisis';
    title: string;
    text: string;
  };
}

const ACTION_LABELS: Record<NpcActionKind, string> = {
  take_mission: 'Take Dangerous Mission',
  visit_family: 'Visit & Care for Family',
  ask_ally_help: 'Ask Trusted Ally for Help',
  train: 'Intensive Shinobi Training',
  socialize: 'Strengthen Comrade Bonds',
  travel: 'Border Patrol & Recon',
  fight: 'Confront Rival / Enemy',
  rest: 'Rest & Recover',
  scheme_or_defect: 'Pursue Shadow Scheme / Defection',
};

export function getNpcActionLabel(action: NpcActionKind): string {
  return ACTION_LABELS[action] ?? action;
}

export function hashNpcId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = ((h << 5) - h + id.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/**
 * Records a structured episodic memory with category & salience so future Utility AI M(a) responds directly.
 */
export function recordEpisodicNpcMemory(
  npc: WorldNpc,
  mem: NpcMemory & { category?: NpcMemoryCategory; salience?: number },
): void {
  const enriched: NpcMemory = {
    ...mem,
    salience: clamp(mem.salience ?? Math.max(2, Math.abs(mem.impact)), 1, 10),
  };
  npc.memory.push(enriched);
  if (npc.memory.length > 18) {
    // Preserve high-salience memories (saved family, trauma, betrayal, spared life)
    let dropIdx = 0;
    let lowestScore = Infinity;
    for (let i = 0; i < npc.memory.length - 4; i++) {
      const m = npc.memory[i];
      const score = (m.salience ?? Math.abs(m.impact)) + (m.category === 'saved_family' || m.category === 'abandoned' || m.category === 'spared_life' ? 8 : 0);
      if (score < lowestScore) {
        lowestScore = score;
        dropIdx = i;
      }
    }
    npc.memory.splice(dropIdx, 1);
  }
}

/**
 * Stage 2: Perception System
 * Evaluates world threats, village sickness, personal crises, trusted allies, rivals, and relevant memories.
 */
export function perceiveNpcWorld(
  npc: WorldNpc,
  state: GameState,
  worldSim: WorldSimState,
): NpcPerception {
  const year = state.birthYear + state.age;
  const cog = ensureNpcCognitionState(npc);
  const village = worldSim.villages[npc.identity.villageId];
  const pop = village ? ensureVillagePopulation(village) : null;
  const activeDisaster = worldSim.activeDisasters.find((d) => d.villageId === npc.identity.villageId);

  const villageSickness = pop?.sicknessRate ?? 15;
  const threatLevel = clamp(
    Math.round(
      state.world.tension * 0.55 +
        (activeDisaster ? activeDisaster.severity * 16 : 0) +
        (npc.identity.specialStatus === 'missing_nin' ? 28 : 0) +
        cog.injury * 0.35,
    ),
    0,
    100,
  );

  const familyUrgency = cog.familyCrisis ? clamp(cog.familyCrisis.severity, 0, 100) : 0;

  let careerOpportunity = 42;
  if (npc.identity.rank === 'genin' && npc.identity.age >= 13) careerOpportunity = 68;
  else if (npc.identity.rank === 'chunin' && npc.identity.age >= 16) careerOpportunity = 74;
  else if (npc.identity.rank === 'jonin' && npc.currentGoal.type === 'seek_kage') careerOpportunity = 76;
  if (state.world.tension >= 50) careerOpportunity = clamp(careerOpportunity + 12, 0, 100);

  // Evaluate memories by actor to feed both Perception and M(a)
  const savedFamilyBonusByActor: Record<string, number> = {};
  const negativeMemoryByActor: Record<string, number> = {};
  let recentExamFailure = false;
  let recentLossTrauma = false;

  for (const m of npc.memory) {
    const recency = year - m.year <= 6 ? 1.0 : year - m.year <= 15 ? 0.78 : 0.6;
    const sal = (m.salience ?? Math.max(2, Math.abs(m.impact))) * recency;
    if (m.actorId) {
      if (
        m.category === 'saved_family' ||
        m.category === 'spared_life' ||
        m.category === 'helped_ally' ||
        m.category === 'fought_together' ||
        m.category === 'mentored'
      ) {
        const mult = m.category === 'saved_family' ? 3.8 : m.category === 'spared_life' ? 3.2 : 2.1;
        savedFamilyBonusByActor[m.actorId] = clamp(
          (savedFamilyBonusByActor[m.actorId] ?? 0) + Math.round(sal * mult),
          0,
          45,
        );
      } else if (
        m.category === 'abandoned' ||
        m.category === 'betrayed' ||
        m.category === 'humiliated' ||
        m.impact <= -6
      ) {
        negativeMemoryByActor[m.actorId] = clamp(
          (negativeMemoryByActor[m.actorId] ?? 0) + Math.round(sal * 3.0),
          0,
          50,
        );
      }
    }
    if (m.tag === 'exam' && m.impact < 0 && year - m.year <= 4) {
      recentExamFailure = true;
    }
    if (m.tag === 'loss' && year - m.year <= 6) {
      recentLossTrauma = true;
    }
  }

  // Find best trusted ally (including Player!) and primary rival/enemy
  let bestAllyId: string | null = null;
  let bestAllyName: string | null = null;
  let bestAllyScore = -1;
  let bestAllyTrust = 0;
  let bestAllyAffection = 0;
  let bestAllyResentment = 0;

  let primaryRivalId: string | null = null;
  let primaryRivalName: string | null = null;
  let bestRivalScore = 40;

  for (const rel of Object.values(npc.relationships)) {
    // Skip dead NPCs
    if (rel.targetId !== 'player') {
      const targetNpc = worldSim.npcs.find((n) => n.identity.id === rel.targetId);
      if (!targetNpc || !targetNpc.identity.alive) continue;
    }
    const vec = getRelVector(rel);
    const memBoost = savedFamilyBonusByActor[rel.targetId] ?? 0;
    const memPenalty = negativeMemoryByActor[rel.targetId] ?? 0;
    const allyScore =
      vec.trust * 0.55 +
      vec.affection * 0.45 +
      memBoost -
      vec.resentment * 0.65 -
      vec.fear * 0.25 -
      memPenalty;

    if (allyScore > bestAllyScore && (vec.trust >= 45 || vec.affection >= 48 || memBoost >= 12)) {
      bestAllyScore = allyScore;
      bestAllyId = rel.targetId;
      bestAllyName = rel.targetId === 'player' ? state.name : rel.targetName;
      bestAllyTrust = vec.trust;
      bestAllyAffection = vec.affection;
      bestAllyResentment = vec.resentment;
    }

    const rivalScore = vec.rivalry * 0.55 + vec.resentment * 0.65 + memPenalty * 0.5;
    if (rivalScore > bestRivalScore) {
      bestRivalScore = rivalScore;
      primaryRivalId = rel.targetId;
      primaryRivalName = rel.targetId === 'player' ? state.name : rel.targetName;
    }
  }

  return {
    year,
    threatLevel,
    familyUrgency,
    careerOpportunity,
    villageSickness,
    bestAllyId,
    bestAllyName,
    bestAllyTrust,
    bestAllyAffection,
    bestAllyResentment,
    primaryRivalId,
    primaryRivalName,
    savedFamilyBonusByActor,
    negativeMemoryByActor,
    recentExamFailure,
    recentLossTrauma,
  };
}

/**
 * Stage 3: GOAP Goal Planner (Career, Survival, Family, Ambition, Loyalty)
 * Dynamically replans when family crises, injuries, or loyalty collapses occur.
 */
export function buildNpcGoapPlan(
  npc: WorldNpc,
  perception: NpcPerception,
  village: VillageSimState | undefined,
): NpcGoapPlan {
  const cog = ensureNpcCognitionState(npc);
  const id = npc.identity;

  const candidates: { domain: NpcGoalDomain; urgency: number; plan: NpcGoapPlan }[] = [];

  // 1. Family domain
  if (cog.familyCrisis) {
    const fc = cog.familyCrisis;
    const urgency = clamp(
      Math.round(52 + fc.severity * 0.46 + (npc.personality.compassionate - 50) * 0.22),
      45,
      99,
    );
    candidates.push({
      domain: 'family',
      urgency,
      plan: {
        domain: 'family',
        goalLabel: `Protect ${fc.relativeName} (${fc.kind.replace('_', ' ')})`,
        urgency,
        steps: [
          { action: 'visit_family', label: `Tend to ${fc.relativeName}`, completed: false },
          { action: 'ask_ally_help', label: 'Seek medicine or support from a trusted ally', completed: false },
          { action: 'take_mission', label: 'Earn ryo for household recovery', completed: false },
        ],
        currentStepIndex: 0,
      },
    });
  }

  // 2. Survival domain
  if (cog.injury >= 35 || cog.stress >= 75 || (id.specialStatus === 'missing_nin' && perception.threatLevel >= 65)) {
    const urgency = clamp(Math.round(45 + cog.injury * 0.65 + cog.stress * 0.25), 40, 96);
    candidates.push({
      domain: 'survival',
      urgency,
      plan: {
        domain: 'survival',
        goalLabel: cog.injury >= 35 ? 'Recover from battlefield wounds' : 'Endure escalating danger',
        urgency,
        steps: [
          { action: 'rest', label: 'Treat injuries and steady chakra', completed: false },
          { action: 'socialize', label: 'Regroup with trusted allies', completed: false },
          { action: 'train', label: 'Rebuild combat readiness', completed: false },
        ],
        currentStepIndex: 0,
      },
    });
  }

  // 3. Career domain (Chunin / Jonin / Mastery)
  const careerUrgency = clamp(
    Math.round(
      42 +
        perception.careerOpportunity * 0.32 +
        (npc.personality.ambitious - 45) * 0.28 +
        (npc.currentGoal.type === 'reach_jonin' || npc.currentGoal.type === 'pass_chunin' ? 14 : 0),
    ),
    25,
    88,
  );
  candidates.push({
    domain: 'career',
    urgency: careerUrgency,
    plan: {
      domain: 'career',
      goalLabel: npc.currentGoal.label,
      urgency: careerUrgency,
      steps: [
        { action: 'take_mission', label: 'Complete high-visibility village mission', completed: false },
        { action: 'train', label: 'Sharpen signature jutsu', completed: false },
        { action: 'fight', label: 'Prove combat merit in sparring or field action', completed: false },
      ],
      currentStepIndex: 0,
    },
  });

  // 4. Ambition domain (Kage / Power / Shadow / Defection)
  if (npc.personality.ambitious >= 60 || npc.motivation === 'attain_kage' || npc.motivation === 'seek_power') {
    const ambUrgency = clamp(Math.round(38 + npc.personality.ambitious * 0.45), 30, 86);
    candidates.push({
      domain: 'ambition',
      urgency: ambUrgency,
      plan: {
        domain: 'ambition',
        goalLabel: npc.motivation === 'attain_kage' ? 'Build stature for Kage succession' : 'Pursue apex shinobi strength',
        urgency: ambUrgency,
        steps: [
          { action: 'take_mission', label: 'Claim prestige on dangerous assignments', completed: false },
          { action: 'train', label: 'Push chakra ceiling higher', completed: false },
          { action: 'socialize', label: 'Cultivate influential clan and jonin allies', completed: false },
        ],
        currentStepIndex: 0,
      },
    });
  }

  // 5. Loyalty / Duty domain (or Defection when loyalty breaks)
  const villageAtRisk = perception.threatLevel >= 60 || (village && village.stability < 50);
  const loyaltyUrgency = clamp(
    Math.round(
      36 +
        (villageAtRisk ? 26 : 0) +
        (npc.personality.loyal >= 60 ? npc.personality.loyal * 0.28 : (100 - npc.personality.loyal) * 0.3),
    ),
    25,
    90,
  );
  candidates.push({
    domain: 'loyalty',
    urgency: loyaltyUrgency,
    plan: {
      domain: 'loyalty',
      goalLabel:
        npc.personality.loyal < 36 && id.specialStatus !== 'kage'
          ? 'Break free from village control'
          : `Defend ${VILLAGE_MAP[id.villageId].name} and uphold duty`,
      urgency: loyaltyUrgency,
      steps:
        npc.personality.loyal < 36 && id.specialStatus !== 'kage'
          ? [
              { action: 'scheme_or_defect', label: 'Prepare covert break from the village', completed: false },
              { action: 'travel', label: 'Slip past frontier patrols', completed: false },
            ]
          : [
              { action: 'travel', label: 'Patrol borders and watch rival villages', completed: false },
              { action: 'take_mission', label: 'Execute village strategic directives', completed: false },
            ],
      currentStepIndex: 0,
    },
  });

  candidates.sort((a, b) => b.urgency - a.urgency);
  return candidates[0].plan;
}

/**
 * Dynamic Utility Weights: U(a) = w_g*G(a) + w_p*P(a) + w_r*R(a) + w_m*M(a)
 * Weights adapt smoothly to the NPC's Nindo and immediate crisis context.
 */
export function getDynamicUtilityWeights(npc: WorldNpc, perception: NpcPerception): UtilityWeights {
  if (perception.familyUrgency >= 60 || npc.nindo.id === 'protect_bonds') {
    return { wg: 0.32, wp: 0.18, wr: 0.28, wm: 0.22 };
  }
  if (npc.nindo.id === 'become_kage' || npc.nindo.id === 'results_first') {
    return { wg: 0.42, wp: 0.24, wr: 0.16, wm: 0.18 };
  }
  if (npc.nindo.id === 'avenge_clan') {
    return { wg: 0.34, wp: 0.22, wr: 0.18, wm: 0.26 };
  }
  return { wg: 0.36, wp: 0.22, wr: 0.22, wm: 0.2 };
}

/**
 * Stage 4: Dynamic Utility Decision Engine
 * Computes transparent U(a) = w_g*G(a) + w_p*P(a) + w_r*R(a) + w_m*M(a) for every candidate action.
 */
export function evaluateNpcUtilityActions(
  npc: WorldNpc,
  perception: NpcPerception,
  plan: NpcGoapPlan,
  state: GameState,
): NpcUtilityEvaluation[] {
  const cog = ensureNpcCognitionState(npc);
  const p = npc.personality;
  const w = getDynamicUtilityWeights(npc, perception);
  const fc = cog.familyCrisis;
  const allyMemBoost = perception.bestAllyId ? (perception.savedFamilyBonusByActor[perception.bestAllyId] ?? 0) : 0;
  const allyNegPenalty = perception.bestAllyId ? (perception.negativeMemoryByActor[perception.bestAllyId] ?? 0) : 0;

  const evaluations: NpcUtilityEvaluation[] = [];

  const pushEval = (
    action: NpcActionKind,
    label: string,
    gScore: number,
    pScore: number,
    rScore: number,
    mScore: number,
    targetId?: string,
    targetName?: string,
  ) => {
    const g = clamp(Math.round(gScore), 0, 100);
    const ps = clamp(Math.round(pScore), 0, 100);
    const r = clamp(Math.round(rScore), 0, 100);
    const m = clamp(Math.round(mScore), 0, 100);
    const total = clamp(Math.round(w.wg * g + w.wp * ps + w.wr * r + w.wm * m), 0, 100);
    evaluations.push({ action, label, total, gScore: g, pScore: ps, rScore: r, mScore: m, targetId, targetName });
  };

  // 1. Visit & Care for Family (spikes sharply when sibling/elder is sick!)
  if (fc) {
    const g = clamp(40 + fc.severity * 0.65, 0, 100);
    const ps = clamp(46 + p.compassionate * 0.48 + p.loyal * 0.16 - p.cruel * 0.28, 0, 100);
    const r = clamp(68 + (npc.nindo.id === 'protect_bonds' ? 22 : 12) + (fc.severity >= 70 ? 8 : 0), 0, 100);
    const m = clamp(
      62 + (perception.recentLossTrauma ? 24 : 0) + (fc.helpedByPlayer ? 12 : 0) + Math.round(fc.severity * 0.2),
      0,
      100,
    );
    pushEval('visit_family', `Visit & care for ${fc.relativeName}`, g, ps, r, m);
  }

  // 2. Ask Trusted Ally for Help (including Player when trusted!)
  if (perception.bestAllyId && (fc || cog.injury >= 35 || cog.stress >= 60)) {
    const crisisBoost = fc ? fc.severity * 0.56 : cog.injury * 0.48;
    const g = clamp(34 + crisisBoost, 0, 100);
    const ps = clamp(44 + p.compassionate * 0.28 + p.cautious * 0.24 - p.cruel * 0.2 + (p.loyal * 0.14), 0, 100);
    const r = clamp(
      22 +
        perception.bestAllyTrust * 0.54 +
        perception.bestAllyAffection * 0.36 -
        perception.bestAllyResentment * 0.6,
      0,
      100,
    );
    const m = clamp(50 + allyMemBoost * 1.15 - allyNegPenalty * 0.9, 0, 100);
    pushEval(
      'ask_ally_help',
      `Ask ${perception.bestAllyName ?? 'trusted ally'} for help`,
      g,
      ps,
      r,
      m,
      perception.bestAllyId,
      perception.bestAllyName ?? undefined,
    );
  }

  // 3. Take Dangerous / Career Mission
  {
    const careerStepMatch = plan.steps[plan.currentStepIndex]?.action === 'take_mission' ? 16 : 0;
    const g = clamp(
      52 +
        perception.careerOpportunity * 0.32 +
        careerStepMatch -
        (fc && fc.severity >= 70 ? 12 : 0) -
        (cog.injury >= 45 ? 20 : 0),
      0,
      100,
    );
    const ps = clamp(42 + p.ambitious * 0.38 + p.loyal * 0.24 - p.cautious * 0.14, 0, 100);
    const r = clamp(48 + (npc.identity.specialStatus === 'anbu' ? 18 : 8) + (npc.nindo.id === 'become_kage' ? 14 : 0), 0, 100);
    const m = clamp(54 + (perception.recentExamFailure ? 14 : 0) - (perception.recentLossTrauma ? 10 : 0), 0, 100);
    pushEval('take_mission', 'Take high-stakes village mission', g, ps, r, m);
  }

  // 4. Intensive Training
  {
    const trainStepMatch = plan.steps[plan.currentStepIndex]?.action === 'train' ? 15 : 0;
    const g = clamp(
      44 +
        (npc.identity.age <= 22 ? 16 : 4) +
        trainStepMatch -
        (fc && fc.severity >= 60 ? 22 : 0) -
        (cog.injury >= 40 ? 22 : 0),
      0,
      100,
    );
    const ps = clamp(40 + p.ambitious * 0.32 + p.cautious * 0.18, 0, 100);
    const r = clamp(32 + (perception.primaryRivalId ? 18 : 0), 0, 100);
    const m = clamp(44 + (perception.recentExamFailure ? 22 : 0), 0, 100);
    pushEval('train', 'Train jutsu & fundamentals', g, ps, r, m);
  }

  // 5. Socialize / Deepen Bonds (with best ally or player)
  if (perception.bestAllyId) {
    const g = clamp(30 + (cog.stress >= 50 ? 20 : 0) + (plan.domain === 'ambition' ? 14 : 0), 0, 100);
    const ps = clamp(34 + p.compassionate * 0.4 + p.loyal * 0.2 - p.cruel * 0.25, 0, 100);
    const r = clamp(30 + perception.bestAllyAffection * 0.45 + perception.bestAllyTrust * 0.35 - perception.bestAllyResentment * 0.5, 0, 100);
    const m = clamp(42 + allyMemBoost * 1.1 - allyNegPenalty * 0.85, 0, 100);
    pushEval(
      'socialize',
      `Spend time with ${perception.bestAllyName ?? 'comrades'}`,
      g,
      ps,
      r,
      m,
      perception.bestAllyId,
      perception.bestAllyName ?? undefined,
    );
  }

  // 6. Travel / Frontier Patrol
  {
    const g = clamp(36 + (perception.threatLevel >= 55 ? 24 : 8) + (plan.domain === 'loyalty' ? 16 : 0), 0, 100);
    const ps = clamp(38 + p.loyal * 0.3 + p.cautious * 0.18, 0, 100);
    const r = clamp(42 + (npc.identity.villageId === state.villageId ? 8 : 0), 0, 100);
    const m = clamp(46 + (perception.recentLossTrauma ? 8 : 0), 0, 100);
    pushEval('travel', 'Patrol frontier & gather field intel', g, ps, r, m);
  }

  // 7. Confront Rival / Fight
  if (perception.primaryRivalId) {
    const rivalNeg = perception.negativeMemoryByActor[perception.primaryRivalId] ?? 0;
    const g = clamp(34 + (npc.currentGoal.type === 'avenge_loss' ? 36 : 12) - (cog.injury >= 40 ? 25 : 0), 0, 100);
    const ps = clamp(28 + p.cruel * 0.35 + p.ambitious * 0.3 - p.cautious * 0.25, 0, 100);
    const r = clamp(48 + (rivalNeg > 0 ? 18 : 6), 0, 100);
    const m = clamp(40 + rivalNeg * 1.2 + (perception.recentLossTrauma ? 14 : 0), 0, 100);
    pushEval(
      'fight',
      `Confront ${perception.primaryRivalName ?? 'rival'}`,
      g,
      ps,
      r,
      m,
      perception.primaryRivalId,
      perception.primaryRivalName ?? undefined,
    );
  }

  // 8. Rest & Recover
  if (cog.injury >= 25 || cog.stress >= 55) {
    const g = clamp(30 + cog.injury * 0.72 + cog.stress * 0.32, 0, 100);
    const ps = clamp(42 + p.cautious * 0.42 - p.ambitious * 0.14, 0, 100);
    const r = clamp(45, 0, 100);
    const m = clamp(48 + (cog.injury >= 50 ? 18 : 0), 0, 100);
    pushEval('rest', 'Rest & mend injuries', g, ps, r, m);
  }

  // 9. Scheme or Defect (only if loyalty is eroding or shadow motivation)
  if (
    npc.identity.specialStatus !== 'kage' &&
    npc.identity.specialStatus !== 'missing_nin' &&
    (p.loyal < 42 || npc.motivation === 'shadow_control' || npc.currentGoal.type === 'defect_village')
  ) {
    const g = clamp(38 + (100 - p.loyal) * 0.5 + (npc.currentGoal.type === 'defect_village' ? 24 : 0), 0, 100);
    const ps = clamp(30 + p.cruel * 0.38 + p.ambitious * 0.34 - p.loyal * 0.35, 0, 100);
    const r = clamp(35 + (perception.bestAllyResentment >= 40 ? 22 : 0), 0, 100);
    const m = clamp(40 + (perception.recentExamFailure ? 16 : 0) + (perception.recentLossTrauma ? 16 : 0), 0, 100);
    pushEval('scheme_or_defect', 'Plot in shadow or break village ties', g, ps, r, m);
  }

  evaluations.sort((a, b) => b.total - a.total);
  return evaluations;
}

/**
 * Deterministic top-candidate selector: picks the highest utility option, with slight
 * weighted variance only when the #2 option sits within 8 points of #1.
 */
export function selectUtilityAction(
  evaluations: NpcUtilityEvaluation[],
  rng: SeededRng,
): NpcUtilityEvaluation {
  if (evaluations.length <= 1) return evaluations[0];
  const top = evaluations[0];
  const second = evaluations[1];
  const gap = top.total - second.total;
  if (gap >= 9) return top;
  const secondChance = clamp((9 - gap) * 0.04, 0.05, 0.35);
  return rng.chance(secondChance) ? second : top;
}

/**
 * Organically sparks realistic family crises on L1 NPCs driven by L3 village sickness/economy.
 */
export function maybeSparkNpcFamilyCrisis(
  npc: WorldNpc,
  village: VillageSimState | undefined,
  state: GameState,
  rng: SeededRng,
): void {
  const cog = ensureNpcCognitionState(npc);
  if (cog.familyCrisis || !npc.identity.alive || npc.identity.specialStatus === 'missing_nin') return;
  if (npc.identity.age < 12 || npc.identity.age > 55) return;

  const pop = village ? ensureVillagePopulation(village) : null;
  const sickness = pop?.sicknessRate ?? 15;
  const baseChance = 0.03 + (sickness >= 28 ? 0.045 : 0) + (state.worldSim?.economyTrend === 'crisis' ? 0.03 : 0);
  if (!rng.chance(baseChance)) return;

  const vDef = VILLAGE_MAP[npc.identity.villageId];
  const relName = rng.chance(0.5) ? rng.pick(vDef.femaleNames) : rng.pick(vDef.maleNames);
  const kind: NpcFamilyCrisis['kind'] =
    sickness >= 22 || rng.chance(0.6)
      ? 'sick_sibling'
      : rng.chance(0.55)
        ? 'elder_illness'
        : 'household_debt';

  cog.familyCrisis = {
    kind,
    relativeName: `${relName} (${kind === 'sick_sibling' ? 'younger sibling' : kind === 'elder_illness' ? 'ailing parent' : 'family household'})`,
    severity: rng.int(58, 86),
    yearsRemaining: rng.int(2, 3),
    helpedByPlayer: false,
  };
}

/**
 * Stages 5 & 6: Action Execution + Episodic Memory & Relationship Update.
 */
export function executeNpcCognitiveAction(
  npc: WorldNpc,
  chosen: NpcUtilityEvaluation,
  evaluations: NpcUtilityEvaluation[],
  plan: NpcGoapPlan,
  state: GameState,
  worldSim: WorldSimState,
  rng: SeededRng,
): CognitiveActionReport {
  const year = state.birthYear + state.age;
  const cog = ensureNpcCognitionState(npc);
  const id = npc.identity;
  let reasonSummary = `Selected ${chosen.label} (U=${chosen.total}: G=${chosen.gScore}, P=${chosen.pScore}, R=${chosen.rScore}, M=${chosen.mScore}).`;
  let dispatch: CognitiveActionReport['dispatch'];

  switch (chosen.action) {
    case 'visit_family': {
      if (cog.familyCrisis) {
        cog.familyCrisis.severity = clamp(cog.familyCrisis.severity - rng.int(24, 38), 0, 100);
        cog.familyCrisis.yearsRemaining -= 1;
        cog.stress = clamp(cog.stress - 10, 0, 100);
        const recovered = cog.familyCrisis.severity <= 18 || cog.familyCrisis.yearsRemaining <= 0;
        const relLabel = cog.familyCrisis.relativeName;
        if (recovered) {
          recordEpisodicNpcMemory(npc, {
            year,
            age: id.age,
            tag: 'bond',
            category: 'saved_family',
            salience: 8,
            summary: `Put career aside to nurse ${relLabel} back to health.`,
            impact: 7,
          });
          cog.familyCrisis = null;
          reasonSummary = `Chose family over rank ambition and nursed ${relLabel} through recovery.`;
        } else {
          reasonSummary = `Stayed at ${relLabel}'s bedside instead of taking dangerous field work.`;
        }
      }
      break;
    }

    case 'ask_ally_help': {
      if (chosen.targetId === 'player') {
        cog.pendingPlayerPlea = true;
        reasonSummary = `Trusted ${state.name} enough (U=${chosen.total}) to ask for personal help.`;
      } else if (chosen.targetId) {
        const ally = worldSim.npcs.find((n) => n.identity.id === chosen.targetId && n.identity.alive);
        if (ally) {
          if (cog.familyCrisis) {
            cog.familyCrisis.severity = clamp(cog.familyCrisis.severity - rng.int(30, 45), 0, 100);
            if (cog.familyCrisis.severity <= 20) cog.familyCrisis = null;
          }
          cog.stress = clamp(cog.stress - 12, 0, 100);
          const relA = npc.relationships[ally.identity.id];
          if (relA?.vector) {
            relA.vector = applyRel6Delta(relA.vector, { trust: 10, affection: 9, respect: 5 });
          }
          recordEpisodicNpcMemory(npc, {
            year,
            age: id.age,
            tag: 'bond',
            category: 'saved_family',
            salience: 9,
            actorId: ally.identity.id,
            summary: `${ally.identity.name} stepped in to help during a household crisis.`,
            impact: 8,
          });
          recordEpisodicNpcMemory(ally, {
            year,
            age: ally.identity.age,
            tag: 'bond',
            category: 'helped_ally',
            salience: 6,
            actorId: id.id,
            summary: `Helped ${id.name} care for their household in a moment of need.`,
            impact: 5,
          });
          reasonSummary = `Turned to trusted friend ${ally.identity.name} for support instead of going alone.`;
        }
      }
      break;
    }

    case 'take_mission': {
      npc.currentGoal.progress = clamp(npc.currentGoal.progress + rng.int(12, 22), 0, 100);
      id.powerScore = clamp(id.powerScore + rng.int(1, 2), 10, 99);
      cog.stress = clamp(cog.stress + 8, 0, 100);
      if (rng.chance(0.18)) {
        cog.injury = clamp(cog.injury + rng.int(12, 26), 0, 100);
      }
      if (cog.familyCrisis) {
        // Leaving a sick family member worsens crisis slightly and creates guilt
        cog.familyCrisis.severity = clamp(cog.familyCrisis.severity + 8, 0, 100);
        cog.stress = clamp(cog.stress + 10, 0, 100);
      }
      reasonSummary = `Accepted a high-stakes mission to push toward ${npc.currentGoal.label}.`;
      break;
    }

    case 'train': {
      id.powerScore = clamp(id.powerScore + rng.int(1, 3), 10, 99);
      npc.currentGoal.progress = clamp(npc.currentGoal.progress + rng.int(6, 12), 0, 100);
      cog.stress = clamp(cog.stress + 4, 0, 100);
      reasonSummary = `Dedicated the season to intensive jutsu drills and tactical refinement.`;
      break;
    }

    case 'socialize': {
      cog.stress = clamp(cog.stress - 14, 0, 100);
      if (chosen.targetId === 'player' && npc.relationships.player?.vector) {
        npc.relationships.player.vector = applyRel6Delta(npc.relationships.player.vector, {
          trust: 4,
          affection: 5,
          resentment: -4,
        });
      } else if (chosen.targetId && npc.relationships[chosen.targetId]?.vector) {
        npc.relationships[chosen.targetId].vector = applyRel6Delta(npc.relationships[chosen.targetId].vector!, {
          trust: 5,
          affection: 5,
        });
      }
      reasonSummary = `Stepped back from drills to nurture trusted bonds with ${chosen.targetName ?? 'comrades'}.`;
      break;
    }

    case 'travel': {
      npc.currentGoal.progress = clamp(npc.currentGoal.progress + rng.int(8, 15), 0, 100);
      cog.stress = clamp(cog.stress + 5, 0, 100);
      reasonSummary = `Deployed along the borderlands to patrol and gather intelligence.`;
      break;
    }

    case 'fight': {
      id.powerScore = clamp(id.powerScore + rng.int(1, 3), 10, 99);
      cog.stress = clamp(cog.stress + 10, 0, 100);
      if (rng.chance(0.28)) {
        cog.injury = clamp(cog.injury + rng.int(10, 22), 0, 100);
      }
      reasonSummary = `Chose direct confrontation against ${chosen.targetName ?? 'a rival'} to prove strength.`;
      break;
    }

    case 'rest': {
      cog.injury = clamp(cog.injury - rng.int(26, 42), 0, 100);
      cog.stress = clamp(cog.stress - rng.int(22, 36), 0, 100);
      reasonSummary = `Stepped off active duty to treat wounds and rebuild stamina.`;
      break;
    }

    case 'scheme_or_defect': {
      npc.personality.loyal = clamp(npc.personality.loyal - 6, 5, 98);
      npc.currentGoal.progress = clamp(npc.currentGoal.progress + rng.int(14, 24), 0, 100);
      if (npc.personality.loyal < 32 && npc.currentGoal.type !== 'defect_village') {
        npc.currentGoal = {
          type: 'defect_village',
          label: `Sever ties with ${VILLAGE_MAP[id.villageId].name}`,
          progress: 55,
          startedAge: id.age,
        };
      }
      reasonSummary = `Disillusionment drove covert scheming outside official village channels.`;
      break;
    }
  }

  // Advance GOAP step if action matched current plan step
  const activeStep = plan.steps[plan.currentStepIndex];
  if (activeStep && activeStep.action === chosen.action) {
    activeStep.completed = true;
    plan.currentStepIndex = Math.min(plan.steps.length - 1, plan.currentStepIndex + 1);
  }

  const trace: NpcDecisionTrace = {
    year,
    chosenAction: chosen.action,
    chosenLabel: chosen.label,
    reasonSummary,
    topOptions: evaluations.slice(0, 4),
  };
  cog.activePlan = plan;
  cog.lastDecision = trace;
  cog.lastUtilityTickYear = year;

  // Gentle natural healing/recovery every year
  cog.injury = clamp(cog.injury - 6, 0, 100);
  cog.stress = clamp(cog.stress - 3, 0, 100);

  return { npcId: id.id, action: chosen.action, chosenTotal: chosen.total, dispatch };
}

/**
 * Full cognitive tick respecting 3-Tier LOD:
 * - L1: Runs every year (full 6-stage pipeline + family crisis sparks + decision trace).
 * - L2: Runs periodically every 2 years (lightweight utility step).
 */
export function tickNpcCognitiveCycle(
  npc: WorldNpc,
  state: GameState,
  worldSim: WorldSimState,
  rng: SeededRng,
): CognitiveActionReport | null {
  if (!npc.identity.alive) return null;
  const year = state.birthYear + state.age;
  const cog = ensureNpcCognitionState(npc);
  const village = worldSim.villages[npc.identity.villageId];

  if (cog.lodTier === 'L2') {
    // Periodic utility simulation: run every 2nd year per staggered NPC hash
    if ((year + hashNpcId(npc.identity.id)) % 2 !== 0 && cog.lastDecision !== null) {
      return null;
    }
  } else {
    // L1 detailed NPCs can experience human family crises tied to L3 village sickness/economy
    maybeSparkNpcFamilyCrisis(npc, village, state, rng);
  }

  const perception = perceiveNpcWorld(npc, state, worldSim);
  const plan = buildNpcGoapPlan(npc, perception, village);
  const evaluations = evaluateNpcUtilityActions(npc, perception, plan, state);
  if (evaluations.length === 0) return null;
  const chosen = selectUtilityAction(evaluations, rng);
  return executeNpcCognitiveAction(npc, chosen, evaluations, plan, state, worldSim, rng);
}
