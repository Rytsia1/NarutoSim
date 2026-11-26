/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest';
import {
  combatEngine,
  historyEngine,
  kernel,
  lifeEngine,
  missionEngine,
  npcEngine,
  relationshipEngine,
  villageEngine,
  worldEngine,
} from '../src/sim';
import { migrateGameState } from '../src/sim/kernel/bootstrap';
import { createNewLife } from '../src/sim/life';
import { SeededRng } from '../src/sim/rng';
import {
  selectChronicleView,
  selectNpcDirectoryView,
  selectStatusView,
  selectVillageGovernanceView,
  selectWorldJournalView,
} from '../src/ui/selectors';

const KERNEL_SOURCES = import.meta.glob<string>('../src/sim/kernel/*.ts', {
  query: '?raw',
  import: 'default',
  eager: true,
});

describe('Domain Architecture Boundaries & Simulation Kernel', () => {
  it('exposes the Simulation Kernel and all 8 Domain Engine facades cleanly', () => {
    expect(typeof kernel.SeededRng).toBe('function');
    expect(typeof kernel.DomainEventBus).toBe('function');
    expect(typeof kernel.DecisionRouter).toBe('function');
    expect(typeof kernel.KernelScheduler).toBe('function');
    expect(typeof kernel.MigrationRegistry).toBe('function');

    expect(typeof worldEngine.tickWorldLayer).toBe('function');
    expect(typeof worldEngine.tickLivingTimeline).toBe('function');
    expect(typeof villageEngine.tickVillageOrgLayer).toBe('function');
    expect(typeof villageEngine.pickPoliticsDecision).toBe('function');
    expect(typeof villageEngine.initClanHeritage).toBe('function');
    expect(typeof lifeEngine.advanceYear).toBe('function');
    expect(typeof lifeEngine.initAcademyState).toBe('function');
    expect(typeof npcEngine.tickAutonomousNpcs).toBe('function');
    expect(typeof relationshipEngine.adjustBidirectionalPlayerRel).toBe('function');
    expect(typeof missionEngine.generateMissionContract).toBe('function');
    expect(typeof combatEngine.resolveBattleRound).toBe('function');
    expect(typeof combatEngine.ensureWarClockDefaults).toBe('function');
    expect(typeof historyEngine.pushLog).toBe('function');
    expect(typeof historyEngine.detectWarArcs).toBe('function');
  });

  it('enforces Simulation Kernel purity (zero UI or React imports inside src/sim/kernel)', () => {
    const entries = Object.entries(KERNEL_SOURCES);
    expect(entries.length).toBeGreaterThanOrEqual(5);

    for (const [file, src] of entries) {
      expect(src.includes('../ui'), `${file} must not import UI layer`).toBe(false);
      expect(src.includes("from 'react'"), `${file} must not import React`).toBe(false);
      expect(src.includes('window.'), `${file} must remain headless`).toBe(false);
    }
  });

  it('runs DomainEventBus deterministically in strict FIFO order', () => {
    const bus = new kernel.DomainEventBus();
    const state = createNewLife(77701, { preferredVillage: 'konoha', crisisOverride: 'none' });
    const rng = new SeededRng(77701);
    const order: string[] = [];

    bus.on('world.year_advanced', (ev) => {
      order.push(`year:${ev.age}`);
      bus.emit({ type: 'war.ended', warNumber: 1, outcome: 'survived' });
    });
    bus.on('war.ended', (ev) => {
      order.push(`war:${ev.warNumber}:${ev.outcome}`);
    });

    bus.emit({ type: 'world.year_advanced', year: 1990, age: 12 });
    const flushed = bus.flush(state, rng);

    expect(flushed.length).toBe(2);
    expect(order).toEqual(['year:12', 'war:1:survived']);
    expect(bus.pendingCount()).toBe(0);
  });

  it('orders KernelScheduler phases canonically and picks highest-priority decisions', () => {
    const scheduler = new kernel.KernelScheduler();
    const bus = new kernel.DomainEventBus();
    const state = createNewLife(77702, { preferredVillage: 'suna', crisisOverride: 'none' });
    const rng = new SeededRng(77702);
    const executed: string[] = [];

    // Register out of order intentionally: Scheduler must still execute in CANONICAL_TICK_ORDER!
    scheduler.registerPhaseTask({ id: 't_history', phase: 'history', run: () => executed.push('history') });
    scheduler.registerPhaseTask({ id: 't_world', phase: 'world', run: () => executed.push('world') });
    scheduler.registerPhaseTask({ id: 't_npc', phase: 'npc', run: () => executed.push('npc') });
    scheduler.registerPhaseTask({ id: 't_village', phase: 'village', run: () => executed.push('village') });

    scheduler.runYearlyPipeline(state, rng, bus);
    expect(executed).toEqual(['world', 'village', 'npc', 'history']);

    scheduler.proposeDecision({
      priority: 20,
      source: 'life',
      decision: { id: 'low', kind: 'life_event', eventId: 'low', title: 'Low', body: '', manual: false, options: [] },
    });
    scheduler.proposeDecision({
      priority: 95,
      source: 'world',
      decision: { id: 'high', kind: 'war_prelude', eventId: 'high', title: 'High', body: '', manual: true, options: [] },
    });
    expect(scheduler.pickTopDecision()?.id).toBe('high');
  });

  it('runs centralized MigrationRegistry and read-only Presentation Selectors cleanly', () => {
    const legacy = createNewLife(77703, { preferredVillage: 'kiri', crisisOverride: 'none' });
    delete legacy.worldSim;
    delete legacy.missionConsequences;

    migrateGameState(legacy);
    expect(legacy.worldSim).toBeDefined();
    expect(legacy.worldSim!.timeline!.length).toBeGreaterThanOrEqual(1);
    expect(legacy.worldSim!.villages.kiri.politics).toBeDefined();
    expect(Array.isArray(legacy.missionConsequences)).toBe(true);

    // Presentation Layer read-only selectors
    const chronicle = selectChronicleView(legacy);
    const status = selectStatusView(legacy);
    const journal = selectWorldJournalView(legacy);
    const gov = selectVillageGovernanceView(legacy, 'kiri');
    const npcs = selectNpcDirectoryView(legacy, 'my_village');

    expect(chronicle.totalCount).toBeGreaterThanOrEqual(1);
    expect(status.villageName).toBe('Kirigakure');
    expect(journal.knownEventsNewestFirst.length).toBeGreaterThanOrEqual(1);
    expect(gov.village?.villageId).toBe('kiri');
    expect(npcs.length).toBeGreaterThanOrEqual(4);
  });
});
