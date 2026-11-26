import type { GameState } from '../types';

export interface SaveMigrationStep {
  id: string;
  order: number;
  apply: (state: GameState) => void;
}

/**
 * Centralized Save Snapshot Migration Pipeline.
 * Each Domain Engine registers its own backwards-compatible default migrator,
 * replacing scattered ad-hoc ensure*Defaults calls across the codebase.
 */
export class MigrationRegistry {
  private steps: SaveMigrationStep[] = [];

  register(step: SaveMigrationStep): void {
    if (this.steps.some((s) => s.id === step.id)) return;
    this.steps.push(step);
    this.steps.sort((a, b) => a.order - b.order);
  }

  listIds(): string[] {
    return this.steps.map((s) => s.id);
  }

  migrate(state: GameState): GameState {
    for (const step of this.steps) {
      step.apply(state);
    }
    return state;
  }
}

export const defaultMigrationRegistry = new MigrationRegistry();
