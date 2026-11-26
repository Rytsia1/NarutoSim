import { describe, expect, it } from 'vitest';
import { CLAN_MAP, getClansForVillage } from '../src/data/clans';
import { GREAT_VILLAGES, VILLAGE_MAP } from '../src/data/villages';
import { ShinobiSim } from '../src/sim/engine';
import { createNewLife } from '../src/sim/life';
import { triggerNpcDefection } from '../src/sim/npc-sim';
import { promoteRank } from '../src/sim/ranks';
import { SeededRng } from '../src/sim/rng';
import {
  applyPlayerActionToWorldSim,
  ensureWorldSimDefaults,
  getDiplomacyEdge,
  getVillageInstitutionalModifiers,
} from '../src/sim/world-sim';

describe('Autonomous 3-Layer World Simulation', () => {
  it('initializes all 3 layers deterministically with 9-component living NPCs', () => {
    const a = createNewLife(77101, { preferredVillage: 'konoha', crisisOverride: 'none' });
    const b = createNewLife(77101, { preferredVillage: 'konoha', crisisOverride: 'none' });

    expect(a.worldSim).toBeDefined();
    expect(a.worldSim).toEqual(b.worldSim);

    const ws = a.worldSim!;
    // Layer 1: World Layer
    expect(ws.economy).toBeGreaterThanOrEqual(15);
    expect(ws.territories.length).toBeGreaterThanOrEqual(6);
    expect(Object.keys(ws.diplomacy).length).toBeGreaterThanOrEqual(10);
    expect(ws.history.length).toBeGreaterThanOrEqual(1);

    // Layer 2: Village & Organization Layer
    for (const gv of GREAT_VILLAGES) {
      const vSim = ws.villages[gv.id];
      expect(vSim).toBeDefined();
      expect(vSim.kageNpcId).not.toBeNull();
      expect(vSim.clans.length).toBeGreaterThanOrEqual(3);
      expect(vSim.shadowOrg.name).toBe(gv.institutions.shadowOrgName);
      expect(vSim.daimyo.funding).toBeGreaterThanOrEqual(20);
      expect(vSim.hospital.capacity).toBeGreaterThanOrEqual(30);
    }

    // Layer 3: Every NPC has all 9 required components
    expect(ws.npcs.length).toBeGreaterThanOrEqual(25);
    for (const npc of ws.npcs) {
      expect(npc.identity.name.length).toBeGreaterThan(2);
      expect(npc.personality.loyal).toBeGreaterThanOrEqual(5);
      expect(npc.personality.ambitious).toBeGreaterThanOrEqual(5);
      expect(npc.personality.cautious).toBeGreaterThanOrEqual(5);
      expect(npc.personality.cruel).toBeGreaterThanOrEqual(5);
      expect(npc.personality.compassionate).toBeGreaterThanOrEqual(5);
      expect(typeof npc.motivation).toBe('string');
      expect(npc.nindo.maxim.length).toBeGreaterThan(5);
      expect(typeof npc.relationships).toBe('object');
      expect(Array.isArray(npc.memory)).toBe(true);
      expect(npc.memory.length).toBeGreaterThanOrEqual(1);
      expect(typeof npc.schedule).toBe('string');
      expect(Array.isArray(npc.knowledge)).toBe(true);
      expect(npc.currentGoal.label.length).toBeGreaterThan(3);
    }
  });

  it('gives Konoha, Suna, Kiri, Kumo, and Iwa genuinely distinct institutions, clans, and modifiers', () => {
    const konoha = createNewLife(88101, {
      customBuild: {
        mode: 'free',
        originId: 'clan_heir',
        villageId: 'konoha',
        clanId: 'uchiha',
        sex: 'M',
        name: 'Ren Uchiha',
        capacity: 3,
        element: 'fire',
        statOffsets: {},
      },
    });
    const kiri = createNewLife(88102, {
      customBuild: {
        mode: 'free',
        originId: 'clan_heir',
        villageId: 'kiri',
        clanId: 'yuki',
        sex: 'F',
        name: 'Tsubaki Yuki',
        capacity: 3,
        element: 'water',
        statOffsets: {},
      },
    });
    const suna = createNewLife(88103, {
      customBuild: {
        mode: 'free',
        originId: 'clan_heir',
        villageId: 'suna',
        clanId: 'shirogane',
        sex: 'M',
        name: 'Goro Shirogane',
        capacity: 3,
        element: 'wind',
        statOffsets: {},
      },
    });

    const kMods = getVillageInstitutionalModifiers(konoha);
    const kiriMods = getVillageInstitutionalModifiers(kiri);
    const sunaMods = getVillageInstitutionalModifiers(suna);

    // Distinct shadow orgs & doctrines
    expect(VILLAGE_MAP.konoha.institutions.shadowOrgName).toContain('Root');
    expect(VILLAGE_MAP.kiri.institutions.shadowOrgName).toContain('Hunter-Nin');
    expect(VILLAGE_MAP.suna.institutions.shadowOrgName).toContain('Puppet');
    expect(VILLAGE_MAP.kumo.institutions.shadowOrgName).toContain('Cloud Vanguard');
    expect(VILLAGE_MAP.iwa.institutions.shadowOrgName).toContain('Demolition');

    // Mechanical divergence
    expect(kiriMods.bloodyMistActive).toBe(true);
    expect(kMods.bloodyMistActive).toBe(false);
    expect(kiriMods.academyGradOffset).toBeGreaterThan(kMods.academyGradOffset);
    expect(kMods.hospitalMortalityMult).toBeLessThan(kiriMods.hospitalMortalityMult);
    expect(sunaMods.missionRyoMult).toBeLessThan(kMods.missionRyoMult);

    // Clans assigned cleanly and unique per village
    expect(konoha.clanId).toBe('uchiha');
    expect(CLAN_MAP.uchiha.villageId).toBe('konoha');
    expect(getClansForVillage('kumo').some((c) => c.id === 'yotsuki')).toBe(true);
    expect(getClansForVillage('iwa').some((c) => c.id === 'iwagane')).toBe(true);
  });

  it('simulates independent NPC lives with cascading village & relationship consequences', () => {
    let sawExamOrPromo = false;
    let sawMarriage = false;
    let sawOffscreenDeath = false;
    let sawDefection = false;

    for (let seed = 91001; seed <= 91008; seed++) {
      const sim = new ShinobiSim();
      sim.newLife(seed, { preferredVillage: seed % 2 === 0 ? 'kiri' : 'konoha', crisisOverride: 'none' });
      for (let step = 0; step < 38; step++) {
        const st = sim.getState();
        if (st.phase === 'posthumous' || st.phase === 'ended') break;
        if (st.pending) {
          sim.autoChoice(true);
        } else {
          sim.stepYear();
        }
      }
      const ws = sim.getState().worldSim!;
      for (const npc of ws.npcs) {
        if (npc.memory.some((m) => m.tag === 'exam' || m.tag === 'promotion')) sawExamOrPromo = true;
        if (npc.memory.some((m) => m.tag === 'marriage')) sawMarriage = true;
        if (!npc.identity.alive) sawOffscreenDeath = true;
        if (npc.identity.specialStatus === 'missing_nin' || npc.memory.some((m) => m.tag === 'defection')) {
          sawDefection = true;
        }
      }
    }

    expect(sawExamOrPromo).toBe(true);
    expect(sawOffscreenDeath).toBe(true);
    expect(sawMarriage || sawDefection).toBe(true);

    // Direct causal check: NPC defection cascades into Village stability, Clan loyalty, ANBU ops, & History
    const st = createNewLife(99001, { preferredVillage: 'konoha', crisisOverride: 'none' });
    const ws = st.worldSim!;
    const konoha = ws.villages.konoha;
    const targetNpc = ws.npcs.find(
      (n) => n.identity.alive && n.identity.villageId === 'konoha' && n.identity.specialStatus === 'none' && n.identity.clanId,
    )!;
    const clanBefore = konoha.clans.find((c) => c.clanId === targetNpc.identity.clanId)!.loyalty;
    const stabBefore = konoha.stability;

    triggerNpcDefection(targetNpc, 'bitter rift with Root', st, ws, []);

    expect(targetNpc.identity.specialStatus).toBe('missing_nin');
    expect(konoha.stability).toBeLessThan(stabBefore);
    expect(konoha.clans.find((c) => c.clanId === targetNpc.identity.clanId)!.loyalty).toBeLessThan(clanBefore);
    expect(konoha.anbu.activeOp).toContain(targetNpc.identity.name);
    expect(ws.history.some((h) => h.npcId === targetNpc.identity.id)).toBe(true);
  });

  it('propagates bidirectional player Kage & Diplomatic actions into World and Village layers', () => {
    const st = createNewLife(99202, { preferredVillage: 'kiri', crisisOverride: 'none' });
    st.age = 26;
    promoteRank(st, 'jonin');
    const ws = st.worldSim!;
    const beforeKonohaEdge = getDiplomacyEdge(ws, 'kiri', 'konoha')!.score;

    applyPlayerActionToWorldSim(st, { type: 'kage_ascend' });
    applyPlayerActionToWorldSim(st, { type: 'kage_decree', decree: 'decree_peace' });

    expect(ws.villages.kiri.kageNpcId).toBe('player');
    expect(ws.villages.kiri.policy).toBe('diplomatic');
    expect(ws.villages.kiri.academy.bloodyMistActive).toBe(false);
    expect(getDiplomacyEdge(ws, 'kiri', 'konoha')!.score).toBeGreaterThan(beforeKonohaEdge);
  });

  it('migrates legacy saves without worldSim cleanly and survives a 50-life headless stress run', () => {
    const sim = new ShinobiSim();
    const legacy = createNewLife(55501, { preferredVillage: 'suna', crisisOverride: 'none' });
    delete legacy.worldSim;

    sim.load(legacy);
    const migrated = sim.getState();
    expect(migrated.worldSim).toBeDefined();
    expect(migrated.worldSim!.npcs.length).toBeGreaterThanOrEqual(20);
    expect(ensureWorldSimDefaults(migrated)).toBe(migrated.worldSim);

    // 50 full headless lives with 0 exceptions and bounded NPC counts
    for (let i = 0; i < 50; i++) {
      const s = new ShinobiSim();
      s.newLife(120000 + i, { crisisOverride: i % 5 === 0 ? 'calamity' : 'none' });
      let guard = 0;
      while (guard < 260) {
        guard += 1;
        const cur = s.getState();
        if (cur.phase === 'posthumous') {
          s.submitLastWords('Walk forward.');
          break;
        }
        if (cur.phase === 'ended') break;
        if (cur.pending) s.autoChoice(true);
        else s.stepYear();
      }
      const endState = s.getState();
      expect(endState.worldSim).toBeDefined();
      expect(endState.worldSim!.npcs.length).toBeLessThanOrEqual(75);
      // Verify RNG snapshot stays valid
      expect(new SeededRng(endState.rng.seed, endState.rng.state).next()).toBeGreaterThanOrEqual(0);
    }
  }, 15_000);
});
