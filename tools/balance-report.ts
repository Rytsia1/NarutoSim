import { ShinobiSim } from '../src/sim/engine';
import { promoteRank } from '../src/sim/ranks';
import { buildWarPreludeDecision } from '../src/sim/world';

const WARS_PER_RANK = 500;

for (const rank of ['genin', 'chunin', 'jonin'] as const) {
  let wins = 0;
  let deaths = 0;
  let totalDays = 0;
  let totalKills = 0;
  let clashes = 0;

  for (let i = 0; i < WARS_PER_RANK; i++) {
    const sim = new ShinobiSim();
    sim.newLife(500000 + i * 3571 + rank.length * 100, { crisisOverride: 'none' });
    const st = sim.getState();

    // Provision representative stats per rank
    st.age = rank === 'genin' ? 14 : rank === 'chunin' ? 18 : 24;
    promoteRank(st, rank);
    if (rank === 'genin') {
      st.stats.chakra = 42;
      st.stats.health = 76;
      st.stats.intel = 36;
      st.stats.will = 40;
      st.disciplines = [
        { id: `${st.element}_release`, level: 1, xp: 4, lastLevelAge: 12, quality: 1, isMain: true, declinedUntilAge: 0 },
      ];
    } else if (rank === 'chunin') {
      st.stats.chakra = 62;
      st.stats.health = 82;
      st.stats.intel = 55;
      st.stats.will = 58;
      st.disciplines = [
        { id: `${st.element}_release`, level: 2, xp: 10, lastLevelAge: 16, quality: 1, isMain: true, declinedUntilAge: 0 },
        { id: 'shadow_clone', level: 2, xp: 6, lastLevelAge: 17, quality: 1, isMain: false, declinedUntilAge: 0 },
      ];
    } else {
      st.stats.chakra = 84;
      st.stats.health = 88;
      st.stats.intel = 76;
      st.stats.will = 78;
      st.disciplines = [
        { id: `${st.element}_release`, level: 3, xp: 20, lastLevelAge: 21, quality: 1.1, isMain: true, declinedUntilAge: 0 },
        { id: 'medical', level: 2, xp: 12, lastLevelAge: 20, quality: 1, isMain: false, declinedUntilAge: 0 },
        { id: 'sensory', level: 2, xp: 12, lastLevelAge: 22, quality: 1, isMain: false, declinedUntilAge: 0 },
      ];
    }

    st.pending = buildWarPreludeDecision(st, false);
    sim.resolve('deploy_front');

    let guard = 0;
    while (sim.getState().phase === 'war' && guard < 400) {
      guard += 1;
      if (sim.getState().pending) {
        sim.autoChoice(true);
      } else {
        sim.flushWarUntilDecision();
      }
    }

    const end = sim.getState();
    const lastWar = end.warHistory[end.warHistory.length - 1];
    if (end.phase === 'posthumous' || lastWar?.outcome === 'dead') {
      deaths += 1;
    } else {
      wins += 1;
    }

    const clashCount = end.logs.filter((l) => l.text.includes('JUTSU CLASH!')).length;
    clashes += clashCount;
    const dayMatch = lastWar?.summary.match(/Lasted (\d+) days with (\d+)/);
    if (dayMatch) {
      totalDays += Number(dayMatch[1]);
      totalKills += Number(dayMatch[2]);
    } else {
      totalDays += 8;
    }
  }

  console.log(
    `[Balance ${rank.toUpperCase().padEnd(6)}] Wars: ${WARS_PER_RANK} | Survive/Win: ${((wins / WARS_PER_RANK) * 100).toFixed(1)}% | Death: ${((deaths / WARS_PER_RANK) * 100).toFixed(1)}% | Avg Days: ${(totalDays / WARS_PER_RANK).toFixed(1)} | Avg Kills: ${(totalKills / WARS_PER_RANK).toFixed(2)} | Jutsu Clashes: ${clashes}`,
  );
}
