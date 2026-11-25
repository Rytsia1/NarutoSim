import { clamp, getChakraCap } from './powers';
import type { GameState } from './types';

export { getChakraCap };

export function clampStats(state: GameState): void {
  const cap = getChakraCap(state);
  state.stats.chakra = clamp(Math.round(state.stats.chakra), 0, cap);
  state.stats.intel = clamp(Math.round(state.stats.intel), 0, 100);
  state.stats.will = clamp(Math.round(state.stats.will), 0, 100);
  state.stats.bonds = clamp(Math.round(state.stats.bonds), 0, 100);
  state.stats.health = clamp(Math.round(state.stats.health), 0, 100);
  state.stats.ryo = clamp(Math.round(state.stats.ryo), 0, 100);
}
