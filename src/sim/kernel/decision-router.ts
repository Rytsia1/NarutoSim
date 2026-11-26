import type { SeededRng } from '../rng';
import type {
  DecisionKind,
  GameState,
  OdActionId,
  PendingDecision,
} from '../types';
import type { DomainEventBus } from './event-queue';

export interface DecisionContext {
  state: GameState;
  decision: PendingDecision;
  optionId: string;
  freeText?: string;
  odAction?: OdActionId;
  rng: SeededRng;
  bus: DomainEventBus;
}

export type DecisionHandler = (ctx: DecisionContext) => void;

/**
 * Central Decision Handler Registry replacing ad-hoc switch monoliths.
 * Each Domain Engine registers handlers for the DecisionKinds it owns.
 */
export class DecisionRouter {
  private handlers = new Map<DecisionKind, DecisionHandler>();

  register(kind: DecisionKind, handler: DecisionHandler): void {
    this.handlers.set(kind, handler);
  }

  registerMany(kinds: readonly DecisionKind[], handler: DecisionHandler): void {
    for (const k of kinds) {
      this.handlers.set(k, handler);
    }
  }

  has(kind: DecisionKind): boolean {
    return this.handlers.has(kind);
  }

  registeredKinds(): DecisionKind[] {
    return Array.from(this.handlers.keys());
  }

  dispatch(ctx: DecisionContext): boolean {
    const handler = this.handlers.get(ctx.decision.kind);
    if (!handler) return false;
    handler(ctx);
    return true;
  }
}

export const defaultDecisionRouter = new DecisionRouter();
