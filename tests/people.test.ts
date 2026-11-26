import { describe, expect, it } from 'vitest';
import { ARCHETYPE_PROFILES } from '../src/data/characters';
import { buildLifeRecord } from '../src/sim/epilogue';
import { createNewLife, resolvePendingDecision } from '../src/sim/life';
import { createDefaultMeta, updateMetaFromState } from '../src/sim/meta';
import { determineNpcLodTier } from '../src/sim/npc/lod-population';
import {
  collectReferencedPersonIds,
  combatProfile,
  generateCharacter,
  getLifeBingoBookEntries,
  getPerson,
  isPersonAlive,
  killPerson,
  resolveFamilyMemberView,
  resolveSquadMemberView,
} from '../src/sim/people';
import { buildGraduationExamDecision, promoteRank } from '../src/sim/ranks';
import { SeededRng } from '../src/sim/rng';
import { formGeninTeam } from '../src/sim/team';
import { applyWarResultsToPeople, initWarState } from '../src/sim/war';
import {
  appendPastLife,
  CURRENT_SAVE_VERSION,
  LEGACY_SAVE_RESET_NOTICE,
  loadMetaState,
  loadPastLives,
  loadSavedLifeWithStatus,
  saveMetaState,
} from '../src/ui/storage';

const DYNAMIC_KEYS = ['hp', 'cp', 'alive', 'trust', 'age'] as const;

describe('People Architecture (Single Canonical Identity per Person)', () => {
  it('guarantees fallback ArchetypeProfiles contain zero dynamic keys', () => {
    expect(ARCHETYPE_PROFILES.length).toBeGreaterThanOrEqual(8);

    for (const tpl of ARCHETYPE_PROFILES) {
      for (const dynKey of DYNAMIC_KEYS) {
        expect(dynKey in tpl, `Profile ${tpl.id} must not declare dynamic key "${dynKey}"`).toBe(false);
      }
      expect(tpl.peakRanks).toHaveLength(5);
    }
  });

  it('generates procedural people deterministically for identical seeds and derives consistent combatProfile', () => {
    const stateA = createNewLife(77123, { preferredVillage: 'konoha', crisisOverride: 'none' });
    const stateB = createNewLife(77123, { preferredVillage: 'konoha', crisisOverride: 'none' });
    stateA.age = 20;
    stateB.age = 20;

    const personA = generateCharacter(
      stateA,
      { villageId: 'kiri', age: 28, occupation: 'shinobi', rank: 'jonin', archetype: 'vanguard', observed: true },
      new SeededRng(5050),
    );
    const personB = generateCharacter(
      stateB,
      { villageId: 'kiri', age: 28, occupation: 'shinobi', rank: 'jonin', archetype: 'vanguard', observed: true },
      new SeededRng(5050),
    );

    expect(personA.identity).toEqual(personB.identity);
    const prof1 = combatProfile(stateA, personA.identity.id)!;
    const prof2 = combatProfile(stateA, personA.identity.id)!;
    expect(prof1.ranks).toEqual(prof2.ranks);
    expect(prof1.name).toBe(personA.identity.name);
    expect(prof1.weakness).toBe(personA.identity.weakness);
  });

  it('tracks a defecting teammate into war under the exact same personId and propagates death to squad, population, Bingo Book, and Codex Stats', () => {
    const state = createNewLife(88210, { preferredVillage: 'konoha', crisisOverride: 'none' });
    state.age = 19;
    promoteRank(state, 'chunin');
    state.team = formGeninTeam(state, new SeededRng(88210));

    const teammate = state.team.members[1];
    state.rivalId = teammate.personId;
    const matePerson = getPerson(state, teammate.personId)!;
    expect(matePerson).not.toBeNull();

    // Verify rivalId matches canonical WorldNpc id & receives L1 LOD
    expect(state.rivalId).toBe(matePerson.identity.id);
    expect(determineNpcLodTier(matePerson, state, state.worldSim!)).toBe('L1');

    // Teammate defects as Missing-Nin
    matePerson.identity.specialStatus = 'missing_nin';
    expect(resolveSquadMemberView(state, teammate).specialStatus).toBe('missing_nin');

    // Enter war until the rogue teammate joins the warfront (55% roll per seed)
    let foundRogue = null;
    for (let s = 1; s <= 30; s++) {
      const war = initWarState(state, new SeededRng(5000 + s), false, 'front');
      const rogue = war.enemies.find((e) => e.personId === teammate.personId);
      if (rogue) {
        state.war = war;
        foundRogue = rogue;
        break;
      }
    }
    expect(foundRogue).not.toBeNull();
    expect(foundRogue!.personId).toBe(teammate.personId);
    expect(foundRogue!.isExTeammateRogue).toBe(true);

    // Also pick another war competitor and slay both
    const otherEnemy = state.war!.enemies.find((e) => e.personId !== teammate.personId)!;
    expect(otherEnemy).toBeDefined();

    foundRogue!.alive = false;
    foundRogue!.hp = 0;
    otherEnemy.alive = false;
    otherEnemy.hp = 0;
    applyWarResultsToPeople(state, state.war!);

    // Squad view, canonical Population, Per-Life Bingo Book, and Codex Stats all agree they are dead!
    expect(isPersonAlive(state, teammate.personId)).toBe(false);
    expect(getPerson(state, teammate.personId)!.identity.alive).toBe(false);
    expect(resolveSquadMemberView(state, teammate).alive).toBe(false);

    expect(getPerson(state, otherEnemy.personId)!.identity.alive).toBe(false);
    const bingoIds = getLifeBingoBookEntries(state).map((n) => n.identity.id);
    expect(bingoIds).toContain(teammate.personId);
    expect(bingoIds).toContain(otherEnemy.personId);

    const metaRes = updateMetaFromState(createDefaultMeta(), state);
    expect(metaRes.meta.codexStats.totalDefeated).toBeGreaterThanOrEqual(2);
    expect(metaRes.meta.codexStats.byArchetype[otherEnemy.archetype]?.defeated).toBeGreaterThanOrEqual(1);
  });

  it('links a married romantic teammate using the exact same personId without creating a duplicate person', () => {
    const state = createNewLife(99301, { preferredVillage: 'konoha', crisisOverride: 'none' });
    state.age = 12;
    promoteRank(state, 'academy');
    state.stats.chakra = 70;
    state.stats.intel = 70;
    state.pending = buildGraduationExamDecision(state);
    resolvePendingDecision(state, 'chakra_form');

    const romanticMate = state.team!.members[1];
    romanticMate.relTrack = 'romance';
    romanticMate.relStage = 3;
    romanticMate.trust = 90;

    // Trigger marriage life event directly
    state.age = 22;
    state.pending = {
      id: 'le_marriage_22',
      kind: 'life_event',
      eventId: 'le_marriage',
      title: 'Marriage',
      body: 'Marry',
      manual: false,
      meta: { lifeEventId: 'le_marriage' },
      options: [{ id: 'marry_yes', label: 'Marry', autoEligible: true }],
    };
    const npcsBefore = state.worldSim!.npcs.length;
    resolvePendingDecision(state, 'marry_yes');

    const spouse = state.family.find((f) => f.relation === 'spouse');
    expect(spouse).toBeDefined();
    expect(spouse!.personId).toBe(romanticMate.personId);
    expect(state.worldSim!.npcs.length).toBe(npcsBefore);
    expect(resolveFamilyMemberView(state, spouse!).name).toBe(resolveSquadMemberView(state, romanticMate).name);
  });

  it('registers siblings as real people who age with the world and can die via canonical killPerson', () => {
    const state = createNewLife(55102, {
      preferredVillage: 'konoha',
      crisisOverride: 'none',
      customBuild: {
        mode: 'free',
        originId: 'clan_branch',
        villageId: 'konoha',
        clanId: 'uchiha',
        sex: 'M',
        name: 'Ren Uchiha',
        capacity: 3,
        element: 'fire',
        statOffsets: {},
      },
    });

    const sibling = state.family.find((f) => f.relation === 'sibling');
    expect(sibling).toBeDefined();
    const sibPerson = getPerson(state, sibling!.personId)!;
    expect(sibPerson).not.toBeNull();
    expect(sibPerson.identity.alive).toBe(true);

    const ageBefore = sibPerson.identity.age;
    sibPerson.identity.age += 1;
    expect(resolveFamilyMemberView(state, sibling!).age).toBe(ageBefore + 1);

    const killed = killPerson(state, sibling!.personId, sibPerson.identity.age, 'fell in a frontier ambush');
    expect(killed).toBe(true);
    expect(resolveFamilyMemberView(state, sibling!).alive).toBe(false);
    expect(resolveFamilyMemberView(state, sibling!).deathCause).toContain('ambush');

    // Every referenced personId across the entire GameState resolves to a real person
    for (const refId of collectReferencedPersonIds(state)) {
      expect(getPerson(state, refId), `Dangling personId: ${refId}`).not.toBeNull();
    }
  });

  it('resets incompatible legacy v1/v2 in-progress saves with a notice while preserving history and Codex meta', () => {
    const store = new Map<string, string>();
    const prevStorage = globalThis.localStorage;
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => store.set(k, v),
        removeItem: (k: string) => store.delete(k),
        clear: () => store.clear(),
      },
    });

    try {
      const currentState = createNewLife(44112);
      expect(currentState.saveVersion).toBe(CURRENT_SAVE_VERSION);
      expect(CURRENT_SAVE_VERSION).toBe(3);

      // Simulate a pre-v3 (v2) saved life
      const v2Save = { ...currentState, saveVersion: 2 };
      store.set('narutosim.save.v1', JSON.stringify(v2Save));

      // Seed history and Codex Stats
      const pastRec = buildLifeRecord(currentState);
      pastRec.id = 'life_past_1';
      pastRec.name = 'Past Shinobi';
      appendPastLife(pastRec);
      const meta = createDefaultMeta();
      meta.livesPlayed = 3;
      meta.codexStats.totalEncountered = 14;
      meta.codexStats.byArchetype.vanguard = { encountered: 5, defeated: 3 };
      saveMetaState(meta);

      const loaded = loadSavedLifeWithStatus();
      expect(loaded.state).toBeNull();
      expect(loaded.legacyCleared).toBe(true);
      expect(loaded.notice).toBe(LEGACY_SAVE_RESET_NOTICE);

      // History and Codex Stats MUST remain intact
      expect(loadPastLives()).toHaveLength(1);
      expect(loadPastLives()[0].name).toBe('Past Shinobi');
      const loadedMeta = loadMetaState();
      expect(loadedMeta.livesPlayed).toBe(3);
      expect(loadedMeta.codexStats.totalEncountered).toBe(14);
      expect(loadedMeta.codexStats.byArchetype.vanguard?.defeated).toBe(3);
    } finally {
      Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: prevStorage });
    }
  });
});
