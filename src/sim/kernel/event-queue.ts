import type { SeededRng } from '../rng';
import type {
  DiscoveryChannel,
  GameState,
  MissionOutcomeTier,
  VillageId,
} from '../types';

export type DomainEvent =
  | { type: 'world.year_advanced'; year: number; age: number }
  | { type: 'npc.defected'; npcId: string; npcName: string; villageId: VillageId; reason: string }
  | { type: 'npc.died'; npcId: string; npcName: string; villageId: VillageId; cause: string }
  | { type: 'village.kage_changed'; villageId: VillageId; newKageId: string }
  | { type: 'mission.completed'; missionId: string; rank: string; outcome: MissionOutcomeTier }
  | { type: 'timeline.truth_revealed'; eventId: string; channel: DiscoveryChannel }
  | { type: 'war.ended'; warNumber: number; outcome: string };

export type DomainEventType = DomainEvent['type'];

export type DomainEventListener<T extends DomainEventType = DomainEventType> = (
  event: Extract<DomainEvent, { type: T }>,
  state: GameState,
  rng: SeededRng,
) => void;

/**
 * Deterministic, synchronous FIFO Domain Event Queue & Pub/Sub Bus.
 * Allows the 9 domain engines to broadcast and react to cross-layer events
 * without introducing circular imports or async nondeterminism.
 */
export class DomainEventBus {
  private queue: DomainEvent[] = [];
  private listeners = new Map<DomainEventType, DomainEventListener[]>();
  private processed: DomainEvent[] = [];

  emit(event: DomainEvent): void {
    this.queue.push(event);
  }

  on<T extends DomainEventType>(type: T, listener: DomainEventListener<T>): () => void {
    const list = this.listeners.get(type) ?? [];
    const fn = listener as unknown as DomainEventListener;
    list.push(fn);
    this.listeners.set(type, list);
    return () => {
      const current = this.listeners.get(type);
      if (!current) return;
      const idx = current.indexOf(fn);
      if (idx >= 0) current.splice(idx, 1);
    };
  }

  pendingCount(): number {
    return this.queue.length;
  }

  getProcessedLog(): readonly DomainEvent[] {
    return this.processed;
  }

  clearLog(): void {
    this.processed = [];
  }

  /**
   * Flushes all queued events strictly in FIFO order, capping cascade depth
   * to prevent accidental infinite event loops.
   */
  flush(state: GameState, rng: SeededRng, maxEvents = 64): DomainEvent[] {
    const handled: DomainEvent[] = [];
    let count = 0;
    while (this.queue.length > 0 && count < maxEvents) {
      const ev = this.queue.shift()!;
      count += 1;
      handled.push(ev);
      this.processed.push(ev);
      if (this.processed.length > 120) {
        this.processed.shift();
      }
      const subs = this.listeners.get(ev.type);
      if (subs && subs.length > 0) {
        for (const fn of subs) {
          fn(ev as never, state, rng);
        }
      }
    }
    return handled;
  }
}

export const defaultDomainBus = new DomainEventBus();
