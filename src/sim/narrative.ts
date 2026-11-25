import type { GameState, NarrativeArc, WarFact, WarFactType, WarState } from './types';

export function recordWarFact(
  war: WarState,
  fact: Omit<WarFact, 'day'>,
): void {
  if (war.facts.length >= 120) return;
  war.facts.push({
    day: war.day,
    ...fact,
  });
}

function factsOf(war: WarState, type: WarFactType): WarFact[] {
  return war.facts.filter((f) => f.type === type);
}

/**
 * Groups recorded war facts into cohesive Emergent Story Arcs (GDD Ch. 08.5).
 * Fixes Bug B7: properly leverages recorded `kill` and `squad_protect` facts.
 */
export function detectWarArcs(state: GameState, war: WarState): NarrativeArc[] {
  const arcs: NarrativeArc[] = [];

  const betrayals = factsOf(war, 'ally_betray');
  if (betrayals.length > 0) {
    const first = betrayals[0];
    arcs.push({
      id: 'arc_betrayal',
      title: 'Broken Oaths in the Dark',
      tone: 'danger',
      summary: `An uneasy pact shattered on Day ${first.day} when ${first.actorName} turned on an ally. Trust became the rarest currency of War #${war.warNumber}.`,
    });
  }

  const exClashes = factsOf(war, 'ex_mate_clash');
  const protects = factsOf(war, 'squad_protect');
  if (exClashes.length > 0 || protects.length > 0) {
    const teamLabel = state.team ? `Team ${state.team.number}` : 'your old squad';
    const summary =
      exClashes.length > 0 && protects.length > 0
        ? `Even as ${exClashes[0].targetName ?? 'a former squadmate'} crossed blades with you as a Missing-Nin, the bonds of ${teamLabel} held firm when ${protects[0].actorName} stepped into lethal fire to shield you.`
        : exClashes.length > 0
          ? `Fate forced you to face former squadmate ${exClashes[0].targetName ?? 'a Missing-Nin'} across the battlefield on Day ${exClashes[0].day}.`
          : `On Day ${protects[0].day}, ${protects[0].actorName} of ${teamLabel} flash-stepped into lethal fire to save your life, proving Kizuna outlives any squad roster.`;
    arcs.push({
      id: 'arc_kizuna',
      title: `Shadow of Old ${state.team ? `Team ${state.team.number}` : 'Comrades'}`,
      tone: 'bond',
      summary,
    });
  }

  const coops = factsOf(war, 'enemy_coop');
  if (coops.length > 0) {
    arcs.push({
      id: 'arc_coalition',
      title: 'Enemies Under One Banner',
      tone: 'crisis',
      summary: `Alarmed by your rise across the valley, rival shinobi formed a hostile coalition on Day ${coops[0].day} to hunt you down together.`,
    });
  }

  const clashes = factsOf(war, 'jutsu_clash');
  const resolves = factsOf(war, 'resolve_burst');
  if (clashes.length > 0 || resolves.length >= 2) {
    arcs.push({
      id: 'arc_unbowed',
      title: 'Chronicle of the Unbowed Blade',
      tone: 'milestone',
      summary: `Marked by ${clashes.length} catastrophic Jutsu ${clashes.length === 1 ? 'Clash' : 'Clashes'} and ${resolves.length} desperate Limit Break surges, you refused to yield an inch until the final night.`,
    });
  }

  const kills = factsOf(war, 'kill').filter((f) => f.actorId === 'player');
  const sieges = factsOf(war, 'siege_broken');
  if (kills.length >= 2 || sieges.length > 0) {
    arcs.push({
      id: 'arc_dominion',
      title: 'Blood on the Frontier',
      tone: 'war',
      summary: `Claiming ${kills.length} decisive takedowns${sieges.length > 0 ? ` and breaking ${sieges.length} camp siege${sieges.length > 1 ? 's' : ''}` : ''}, your name spread rapidly through enemy Bingo Books.`,
    });
  }

  const allyHelps = factsOf(war, 'ally_help');
  if (allyHelps.length > 0 && betrayals.length === 0) {
    arcs.push({
      id: 'arc_pact',
      title: 'An Unbroken Wartime Pact',
      tone: 'bond',
      summary: `${allyHelps[0].actorName} honored their battlefield oath when night raiders closed in, proving alliances can survive even a shinobi war.`,
    });
  }

  if (arcs.length === 0) {
    arcs.push({
      id: 'arc_survival',
      title: 'Fourteen Nights in the Mud',
      tone: 'war',
      summary: `Through smoke, cautious recon, and quiet endurance, you outlasted the shifting ambitions of Great Shinobi War #${war.warNumber}.`,
    });
  }

  return arcs;
}

export function generateWarChronicle(
  state: GameState,
  war: WarState,
  outcome: 'victor' | 'shared' | 'survived' | 'withdrew' | 'dead',
): { title: string; arcs: NarrativeArc[] } {
  const arcs = detectWarArcs(state, war);
  const arcIds = new Set(arcs.map((a) => a.id));

  let title = `Chronicle of Frontier War #${war.warNumber}`;
  if (war.isCrisisWar) {
    title =
      outcome === 'dead'
        ? `Night of the Fallen Banner (Crisis War #${war.warNumber})`
        : `Dawn After the ${war.crisisId === 'calamity' ? 'Calamity' : 'Shadow Conspiracy'}`;
  } else if (outcome === 'shared') {
    title = `The Armistice of Two Survivors (War #${war.warNumber})`;
  } else if (arcIds.has('arc_betrayal')) {
    title = `The Season of Broken Oaths (War #${war.warNumber})`;
  } else if (arcIds.has('arc_kizuna')) {
    title = `Vigil of Unyielding Kizuna (War #${war.warNumber})`;
  } else if (arcIds.has('arc_coalition')) {
    title = `Enemies Under One Banner (War #${war.warNumber})`;
  } else if (arcIds.has('arc_unbowed')) {
    title = `Chronicle of the Unbowed Shinobi (War #${war.warNumber})`;
  } else if (arcIds.has('arc_dominion')) {
    title = `The Frontier Hunter's War #${war.warNumber}`;
  }

  return { title, arcs };
}
