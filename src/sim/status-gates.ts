import { isPersonAlive } from './people';
import type { GameState, StatusGateTag } from './types';

/**
 * Canonical status-gate predicate used across events, mission boards, politics,
 * retirement, flavor lines, and world interactions (Lore Audit B0).
 */
export function canReceive(
  state: GameState,
  tags: readonly StatusGateTag[] | undefined,
): boolean {
  if (!tags || tags.length === 0) return true;
  for (const tag of tags) {
    switch (tag) {
      case 'active_shinobi':
        if (
          state.phase !== 'life' ||
          state.rank === 'civilian' ||
          state.rank === 'academy' ||
          state.specialStatus === 'missing_nin'
        ) {
          return false;
        }
        break;
      case 'not_kage':
        if (state.specialStatus === 'kage') return false;
        break;
      case 'not_missing_nin':
        if (state.specialStatus === 'missing_nin') return false;
        break;
      case 'not_civilian':
        if (state.rank === 'civilian') return false;
        break;
      case 'not_retired':
        if (state.phase === 'retirement' || Boolean(state.flags.medical_retirement)) return false;
        break;
      case 'sensei_alive':
        if (!state.team?.members.some((m) => m.role === 'sensei' && isPersonAlive(state, m.personId))) {
          return false;
        }
        break;
      case 'teammate_alive':
        if (!state.team?.members.some((m) => m.role === 'teammate' && isPersonAlive(state, m.personId))) {
          return false;
        }
        break;
      case 'in_village':
        if (state.specialStatus === 'missing_nin') return false;
        break;
    }
  }
  return true;
}
