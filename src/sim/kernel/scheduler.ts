import type { SeededRng } from '../rng';
import type { GameState, PendingDecision } from '../types';
import type { DomainEventBus } from './event-queue';

export type KernelPhaseId =
  | 'world'
  | 'village'
  | 'npc'
  | 'relationship'
  | 'mission'
  | 'life'
  | 'history';

export const CANONICAL_TICK_ORDER: readonly KernelPhaseId[] = [
  'world',
  'village',
  'npc',
  'relationship',
  'mission',
  'life',
  'history',
];

export interface TickPhaseTask {
  id: string;
  phase: KernelPhaseId;
  run: (state: GameState, rng: SeededRng, bus: DomainEventBus) => void;
}

export interface PriorityDecisionProposal {
  priority: number; // Higher executes first (e.g., 100 War/Crisis, 80 Ranks, 60 Clan/Academy, 40 Politics, 20 Pools)
  source: KernelPhaseId;
  decision: PendingDecision;
}

/**
 * Deterministic Simulation Tick & Priority Decision Queue Scheduler.
 * Guarantees canonical domain ordering across yearly ticks and selects
 * the highest-priority PendingDecision cleanly.
 */
export class KernelScheduler {
  private tasks: TickPhaseTask[] = [];
  private proposals: PriorityDecisionProposal[] = [];

  registerPhaseTask(task: TickPhaseTask): void {
    if (this.tasks.some((t) => t.id === task.id)) return;
    this.tasks.push(task);
  }

  proposeDecision(proposal: PriorityDecisionProposal): void {
    this.proposals.push(proposal);
  }

  pickTopDecision(): PendingDecision | null {
    if (this.proposals.length === 0) return null;
    this.proposals.sort((a, b) => b.priority - a.priority);
    const winner = this.proposals[0].decision;
    this.proposals = [];
    return winner;
  }

  clearProposals(): void {
    this.proposals = [];
  }

  runYearlyPipeline(state: GameState, rng: SeededRng, bus: DomainEventBus): void {
    for (const phase of CANONICAL_TICK_ORDER) {
      const phaseTasks = this.tasks.filter((t) => t.phase === phase);
      for (const task of phaseTasks) {
        task.run(state, rng, bus);
      }
    }
    bus.flush(state, rng);
  }
}

export const defaultKernelScheduler = new KernelScheduler();
