import { describe, expect, it } from 'vitest';
import { CLAN_MAP } from '../src/data/clans';
import { JUTSU_MAP } from '../src/data/jutsu';
import { VILLAGES } from '../src/data/villages';
import {
  applyPermanentNpcInjury,
  applyYearlyNpcGrowth,
  generateCharacter,
  learnNewNpcJutsu,
} from '../src/sim/character-generator';
import { createNewLife } from '../src/sim/life';
import { createDefaultMeta, recordCompletedLifeInMeta, updateMetaFromState } from '../src/sim/meta';
import { tickAutonomousNpcs } from '../src/sim/npc-sim';
import { combatProfile, getLifeBingoBookEntries, getPerson, isPersonObserved } from '../src/sim/people';
import { promoteRank } from '../src/sim/ranks';
import { SeededRng } from '../src/sim/rng';
import { applyWarResultsToPeople, initWarState } from '../src/sim/war';

describe('CharacterGenerator & World Residents (G1-G5)', () => {
  it('enforces interlocking coherence: clan preferredElement >= 60%, bloodlineChance +/-5%, legal initial jutsu, samurai only in Land of Iron', () => {
    const baseState = createNewLife(10101, { preferredVillage: 'konoha', crisisOverride: 'none' });
    const rng = new SeededRng(42001);

    // 1. Clan preferredElement rate (>= 60% for Uchiha -> fire; canonical is 65% + random fallback)
    const uchiha = CLAN_MAP.uchiha;
    let fireHits = 0;
    let sharinganHits = 0;
    const N = 5000;
    for (let i = 0; i < N; i++) {
      const npc = generateCharacter(
        baseState,
        {
          villageId: 'konoha',
          clanId: 'uchiha',
          occupation: 'shinobi',
          age: 18,
          rank: 'chunin',
          registerInWorld: false,
        },
        rng,
      );
      if (npc.identity.element === uchiha.preferredElement) fireHits += 1;
      if (npc.identity.bloodlineId === uchiha.bloodlineId) sharinganHits += 1;

      // Every initial jutsu MUST strictly obey JutsuDefinition.requires
      for (const jId of npc.identity.jutsuIds) {
        const def = JUTSU_MAP[jId];
        expect(def, `Unknown jutsu ${jId}`).toBeDefined();
        if (def.requires.clanId) {
          expect(npc.identity.clanId).toBe(def.requires.clanId);
        }
        if (def.requires.bloodlineId) {
          expect(npc.identity.bloodlineId).toBe(def.requires.bloodlineId);
        }
        if (def.requires.hidenId) {
          expect(npc.identity.clanId).toBe(def.requires.clanId);
        }
      }
    }
    expect(fireHits / N).toBeGreaterThanOrEqual(0.6);
    const expectedBlChance = uchiha.bloodlineChance ?? 0.5;
    expect(Math.abs(sharinganHits / N - expectedBlChance)).toBeLessThanOrEqual(0.05);

    // 2. Samurai occupation ONLY spawns in Land of Iron
    for (const v of VILLAGES) {
      for (let i = 0; i < 60; i++) {
        const res = generateCharacter(
          baseState,
          { villageId: v.id, age: 25, registerInWorld: false },
          rng,
        );
        if (res.identity.occupation === 'samurai') {
          expect(v.id).toBe('iron');
        }
      }
    }
  });

  it('preserves observed people across 20 yearly ticks without culling or re-rolling identity', () => {
    const state = createNewLife(20202, { preferredVillage: 'konoha', crisisOverride: 'none' });
    state.age = 20;
    promoteRank(state, 'chunin');
    const war = initWarState(state, new SeededRng(30303), false, 'front');
    state.war = war;
    const encountered = war.enemies[0];
    const personBefore = getPerson(state, encountered.personId)!;
    expect(personBefore).not.toBeNull();
    expect(isPersonObserved(state, personBefore)).toBe(true);

    const snapshotName = personBefore.identity.name;
    const snapshotElement = personBefore.identity.element;
    const snapshotArchetype = personBefore.identity.archetype;
    const snapshotUltimate = personBefore.identity.kit.ultimate.name;

    // End war and pad population past culling cap (120) with unobserved L2 NPCs
    state.war = null;
    const padRng = new SeededRng(40404);
    for (let i = 0; i < 110; i++) {
      generateCharacter(
        state,
        { villageId: 'iwa', age: 25, occupation: 'merchant', rank: 'civilian', observed: false, lodTier: 'L2' },
        padRng,
      );
    }

    // Tick 20 years
    for (let y = 0; y < 20; y++) {
      state.age += 1;
      tickAutonomousNpcs(state, state.worldSim!, padRng);
    }

    // Encountered war rival MUST still exist in worldSim with identical core identity & kit
    const personAfter = getPerson(state, encountered.personId);
    expect(personAfter).not.toBeNull();
    expect(personAfter!.identity.name).toBe(snapshotName);
    expect(personAfter!.identity.element).toBe(snapshotElement);
    expect(personAfter!.identity.archetype).toBe(snapshotArchetype);
    expect(personAfter!.identity.kit.ultimate.name).toBe(snapshotUltimate);
  });

  it('keeps civilian merchants as civilians (never graduates them into Genin) after 10 yearly ticks', () => {
    const state = createNewLife(30303, { preferredVillage: 'konoha', crisisOverride: 'none' });
    const rng = new SeededRng(50505);
    const merchant = generateCharacter(
      state,
      {
        villageId: 'konoha',
        occupation: 'merchant',
        age: 26,
        rank: 'civilian',
        observed: true,
        lodTier: 'L1',
      },
      rng,
    );
    expect(merchant.identity.occupation).toBe('merchant');
    expect(merchant.identity.rank).toBe('civilian');

    for (let y = 0; y < 10; y++) {
      state.age += 1;
      tickAutonomousNpcs(state, state.worldSim!, rng);
    }

    const stillThere = getPerson(state, merchant.identity.id)!;
    expect(stillThere).not.toBeNull();
    expect(stillThere.identity.occupation).toBe('merchant');
    expect(stillThere.identity.rank).toBe('civilian');
    if (stillThere.identity.alive) {
      expect(['work_trade', 'home']).toContain(stillThere.schedule);
    }
  });

  it('creates genuine combat variation between two generic Chunin of the same archetype via potential and statBias', () => {
    const state = createNewLife(40404, { preferredVillage: 'suna', crisisOverride: 'none' });
    const rng = new SeededRng(60606);
    const a = generateCharacter(
      state,
      { villageId: 'suna', age: 20, occupation: 'shinobi', rank: 'chunin', archetype: 'vanguard', registerInWorld: false },
      rng,
    );
    const b = generateCharacter(
      state,
      { villageId: 'suna', age: 20, occupation: 'shinobi', rank: 'chunin', archetype: 'vanguard', registerInWorld: false },
      rng,
    );

    const profA = combatProfile(state, a)!;
    const profB = combatProfile(state, b)!;
    expect(profA.ranks).not.toEqual(profB.ranks);
  });

  it('supports G4 per-person progression: jutsu learning on rank-up, potential growth, and permanent war injuries', () => {
    const state = createNewLife(50505, { preferredVillage: 'kumo', crisisOverride: 'none' });
    const rng = new SeededRng(70707);
    const npc = generateCharacter(
      state,
      { villageId: 'kumo', age: 15, occupation: 'shinobi', rank: 'genin', observed: true },
      rng,
    );

    const initialJutsuCount = npc.identity.jutsuIds.length;
    npc.identity.rank = 'chunin';
    const learned = learnNewNpcJutsu(npc, rng);
    expect(learned).not.toBeNull();
    expect(npc.identity.jutsuIds.length).toBe(initialJutsuCount + 1);

    // Yearly growth updates statBias without NaN
    applyYearlyNpcGrowth(npc, rng);
    expect(Number.isNaN(npc.identity.powerScore)).toBe(false);

    // Permanent injury reduces potential by 0.05 and increments counter
    const potBefore = npc.identity.potential;
    applyPermanentNpcInjury(npc, state.birthYear + state.age, 'critical war wounds');
    expect(npc.identity.potential).toBeCloseTo(Math.max(0.65, potBefore - 0.05), 3);
    expect(npc.identity.permanentInjuries).toBe(1);

    // War aftermath applies permanent injury to surviving competitor with HP <= 25
    state.age = 20;
    promoteRank(state, 'chunin');
    const war = initWarState(state, rng, false, 'front');
    const woundedEnemy = war.enemies[0];
    woundedEnemy.alive = true;
    woundedEnemy.hp = 18;
    const enemyPerson = getPerson(state, woundedEnemy.personId)!;
    const enemyPotBefore = enemyPerson.identity.potential;
    applyWarResultsToPeople(state, war);
    expect(enemyPerson.identity.permanentInjuries).toBeGreaterThanOrEqual(1);
    expect(enemyPerson.identity.potential).toBeLessThan(enemyPotBefore);
  });

  it('aggregates Codex Stats across lives and populates Per-Life Bingo Book from observed combatants', () => {
    const s1 = createNewLife(60601, { preferredVillage: 'konoha', crisisOverride: 'none' });
    s1.age = 20;
    promoteRank(s1, 'chunin');
    s1.war = initWarState(s1, new SeededRng(80801), true, 'front'); // crisis war guarantees S-rank -> all 8 archetypes!
    const bingo = getLifeBingoBookEntries(s1);
    expect(bingo.length).toBeGreaterThanOrEqual(7);

    const m0 = createDefaultMeta();
    const afterLive = updateMetaFromState(m0, s1);
    const afterEnd1 = recordCompletedLifeInMeta(afterLive.meta, s1);
    expect(afterEnd1.meta.livesPlayed).toBe(1);
    // No double counting between live sync and end of Life 1
    expect(afterEnd1.meta.codexStats.totalEncountered).toBe(afterLive.meta.codexStats.totalEncountered);

    // Life 2 accumulates on top of Life 1
    const s2 = createNewLife(60602, { preferredVillage: 'suna', crisisOverride: 'none' });
    s2.age = 20;
    promoteRank(s2, 'chunin');
    s2.war = initWarState(s2, new SeededRng(80802), false, 'front');
    const afterEnd2 = recordCompletedLifeInMeta(afterEnd1.meta, s2);
    expect(afterEnd2.meta.livesPlayed).toBe(2);
    expect(afterEnd2.meta.codexStats.totalEncountered).toBeGreaterThan(afterEnd1.meta.codexStats.totalEncountered);
  });
});
