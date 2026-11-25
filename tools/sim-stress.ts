import { ShinobiSim } from '../src/sim/engine';
import type { CrisisId, ShinobiRank } from '../src/sim/types';

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
      sim.stepYear();
    }
  }

  const record = sim.submitLastWords('For the next generation.');
  if (!record) {
    throw new Error(`Life ${i} failed to produce a LifeRecord`);
  }

  const finalState = sim.getState();
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

console.log(`=== NarutoSim Headless Stress Report (${TOTAL_LIVES} lives, 0 exceptions) ===`);
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
