import { ShinobiSim } from '../src/sim/engine';
import { collectReferencedPersonIds, getPerson } from '../src/sim/people';
import type { CrisisId, GameState, ShinobiRank } from '../src/sim/types';

const textEncoder = new TextEncoder();

function assertNoDanglingPersonIds(state: GameState, lifeIdx: number, stage: string): void {
  if (!state.worldSim) return;
  for (const refId of collectReferencedPersonIds(state)) {
    if (!getPerson(state, refId)) {
      throw new Error(
        `Dangling personId "${refId}" detected in life ${lifeIdx} (age ${state.age}, stage ${stage})`,
      );
    }
  }
}

function assertNoNaN(state: GameState, lifeIdx: number): void {
  for (const [k, v] of Object.entries(state.stats)) {
    if (typeof v !== 'number' || Number.isNaN(v)) {
      throw new Error(`NaN player stat "${k}" in life ${lifeIdx} at age ${state.age}`);
    }
  }
  if (state.worldSim) {
    for (const npc of state.worldSim.npcs) {
      if (Number.isNaN(npc.identity.powerScore) || Number.isNaN(npc.identity.potential)) {
        throw new Error(`NaN NPC identity metric on ${npc.identity.id} in life ${lifeIdx}`);
      }
      for (const b of npc.identity.statBias ?? []) {
        if (Number.isNaN(b)) {
          throw new Error(`NaN statBias on ${npc.identity.id} in life ${lifeIdx}`);
        }
      }
    }
  }
}

const TOTAL_LIVES = 2000;

const peakRanks: Record<ShinobiRank, number> = {
  civilian: 0,
  academy: 0,
  genin: 0,
  chunin: 0,
  jonin: 0,
};

const warByRank: Record<ShinobiRank, number> = {
  civilian: 0,
  academy: 0,
  genin: 0,
  chunin: 0,
  jonin: 0,
};

const seededCrises: Record<CrisisId, number> = { none: 0, calamity: 0, mastermind: 0 };
let crisisErupted = 0;
let crisisResolved = 0;
let bloodlinesBorn = 0;
let bloodlinesAwakened = 0;
let disbandPlayerChunin = 0;
let disbandTeammateChunin = 0;
let disbandTragedy = 0;
let multiWarLives = 0;
let totalAge = 0;
let totalWarsFought = 0;
let maxSaveBytes = 0;
let maxNpcCount = 0;
let maxTickMs = 0;
let totalTickMs = 0;
let tickSamples = 0;
let npcChuninPasses = 0;
let npcChuninFails = 0;

for (let i = 0; i < TOTAL_LIVES; i++) {
  const sim = new ShinobiSim();
  sim.newLife(100000 + i * 7919);

  let guard = 0;
  while (sim.getState().phase !== 'posthumous' && sim.getState().phase !== 'ended') {
    guard += 1;
    if (guard > 4000) {
      throw new Error(`Simulation guard exceeded for life ${i} at age ${sim.getState().age}`);
    }

    const st = sim.getState();
    if (guard % 15 === 0 || st.phase === 'war') {
      assertNoDanglingPersonIds(st, i, st.phase);
      assertNoNaN(st, i);
    }
    if (st.pending) {
      const ok = sim.autoChoice(true);
      if (!ok) {
        throw new Error(`Failed to resolve pending decision ${st.pending.id} (${st.pending.kind})`);
      }
    } else {
      // Optionally retire some elderly shinobi at 58+ to exercise Twilight Retirement path
      if (st.phase === 'life' && st.age >= 58 && i % 3 === 0) {
        sim.retireFromFrontline();
      }
      const t0 = performance.now();
      sim.stepYear();
      const dt = performance.now() - t0;
      if (dt > maxTickMs) maxTickMs = dt;
      totalTickMs += dt;
      tickSamples += 1;
    }
  }

  const record = sim.submitLastWords('For the next generation.');
  if (!record) {
    throw new Error(`Life ${i} failed to produce a LifeRecord`);
  }

  const finalState = sim.getState();
  assertNoDanglingPersonIds(finalState, i, 'final');
  assertNoNaN(finalState, i);

  // Sample save JSON size & population metrics
  if (i % 20 === 0 || finalState.age >= 60) {
    const saveBytes = textEncoder.encode(JSON.stringify(finalState)).length;
    if (saveBytes > maxSaveBytes) maxSaveBytes = saveBytes;
  }
  if (finalState.worldSim) {
    if (finalState.worldSim.npcs.length > maxNpcCount) {
      maxNpcCount = finalState.worldSim.npcs.length;
    }
    for (const n of finalState.worldSim.npcs) {
      for (const m of n.memory) {
        if (m.tag === 'exam') {
          if (m.impact > 0) npcChuninPasses += 1;
          else if (m.impact < 0) npcChuninFails += 1;
        }
      }
    }
  }

  peakRanks[record.peakRank] += 1;
  seededCrises[finalState.world.seededCrisis] += 1;
  if (finalState.world.crisisStage >= 2) crisisErupted += 1;
  if (finalState.world.crisisStage === 3) crisisResolved += 1;
  if (finalState.bloodline) bloodlinesBorn += 1;
  if (finalState.bloodline && finalState.bloodline.stage !== 'latent') bloodlinesAwakened += 1;

  if (finalState.team?.disbandReason === 'player_chunin') disbandPlayerChunin += 1;
  if (finalState.team?.disbandReason === 'teammate_chunin') disbandTeammateChunin += 1;
  if (finalState.team?.disbandReason === 'tragedy') disbandTragedy += 1;

  totalAge += record.deathAge;
  totalWarsFought += record.warsFought;
  if (record.warsFought >= 2) multiWarLives += 1;
  for (const w of record.warHistory) {
    warByRank[w.rankAtStart] += 1;
  }
}

const maxSaveMb = maxSaveBytes / (1024 * 1024);
const avgTickMs = totalTickMs / Math.max(1, tickSamples);
const npcChuninTotal = npcChuninPasses + npcChuninFails;
const npcChuninRate = npcChuninTotal > 0 ? (npcChuninPasses / npcChuninTotal) * 100 : 0;

console.log(`=== NarutoSim Headless Stress Report (${TOTAL_LIVES} lives, 0 exceptions, 0 NaN, 0 dangling personIds) ===`);
console.log(`Average Lifespan       : ${(totalAge / TOTAL_LIVES).toFixed(1)} years`);
console.log(`Peak Shinobi Ranks     :`, peakRanks);
console.log(`Team Disband Reasons   :`, {
  player_chunin: disbandPlayerChunin,
  teammate_chunin: disbandTeammateChunin,
  tragedy: disbandTragedy,
});
console.log(`Total Wars Fought      : ${totalWarsFought} (avg ${(totalWarsFought / TOTAL_LIVES).toFixed(2)}/life, 2+ wars: ${multiWarLives} lives)`);
console.log(`Wars by Starting Rank  :`, warByRank);
console.log(`Seeded Crises          :`, seededCrises);
console.log(`Endgame Crisis Erupted : ${crisisErupted} | Resolved: ${crisisResolved}`);
console.log(`Bloodlines Born/Awaken : ${bloodlinesBorn} (${((bloodlinesBorn / TOTAL_LIVES) * 100).toFixed(1)}%) / ${bloodlinesAwakened}`);
console.log(`Max World NPCs in Save : ${maxNpcCount}`);
console.log(`Max Save JSON Size     : ${maxSaveMb.toFixed(3)} MB (target < 1.500 MB)`);
console.log(`Yearly Tick Timing     : avg ${avgTickMs.toFixed(3)} ms | max ${maxTickMs.toFixed(2)} ms (target < 20 ms)`);
console.log(`NPC Chunin Exam Pass   : ${npcChuninRate.toFixed(1)}% (${npcChuninPasses}/${npcChuninTotal})`);

if (maxSaveMb >= 1.5) {
  throw new Error(`Save JSON size budget exceeded: ${maxSaveMb.toFixed(3)} MB >= 1.5 MB`);
}
