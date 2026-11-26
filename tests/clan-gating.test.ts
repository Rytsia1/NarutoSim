import { describe, expect, it } from 'vitest';
import { CLAN_MAP, CLANS } from '../src/data/clans';
import { getAvailableModes, getKnownJutsu, JUTSU_MAP, MODE_DB } from '../src/data/jutsu';
import { BLOODLINE_MAP } from '../src/data/powers';
import { evaluateCustomBuild } from '../src/sim/custom';
import { createNewLife } from '../src/sim/life';
import { pickStartingDiscipline, recordDiscoveredJutsu, rollBirthBloodline, tryDisciplineEvent } from '../src/sim/powers';
import { SeededRng } from '../src/sim/rng';
import type { CustomBuildConfig } from '../src/sim/types';

function makePointBuyConfig(overrides: Partial<CustomBuildConfig> = {}): CustomBuildConfig {
  return {
    mode: 'points',
    name: 'Test Shinobi',
    sex: 'M',
    originId: 'clan_heir',
    villageId: 'konoha',
    clanId: 'uchiha',
    capacity: 3,
    element: 'fire',
    statOffsets: {},
    ...overrides,
  };
}

describe('Clan & Bloodline Gating (Section 2 & 4.1)', () => {
  it('ensures every ClanDef.bloodlineId references a valid BLOODLINE_MAP entry and adds missing canon clans', () => {
    for (const clan of CLANS) {
      if (clan.bloodlineId) {
        expect(BLOODLINE_MAP[clan.bloodlineId], `Broken bloodlineId on clan ${clan.id}`).toBeDefined();
      }
    }
    expect(CLAN_MAP.sabaku?.bloodlineId).toBe('jiton');
    expect(CLAN_MAP.yuki?.bloodlineId).toBe('hyoton');
    expect(CLAN_MAP.terumi?.bloodlineId).toBe('yoton');
    expect(CLAN_MAP.iwagane?.bloodlineId).toBe('bakuton');
    expect(CLAN_MAP.chinoike?.bloodlineId).toBe('ketsuryugan');
    expect(CLAN_MAP.yamanaka?.villageId).toBe('konoha');
    expect(CLAN_MAP.senju?.villageId).toBe('konoha');
    expect(CLAN_MAP.senju?.bloodlineId).toBe('mokuton');
    expect(CLAN_MAP.kaguya?.villageId).toBe('kiri');
    expect(CLAN_MAP.kaguya?.bloodlineId).toBe('shikotsumyaku');

    // Wave 2 Hiden Art 1:1 integrity: every ClanHidenArt across all 30 clans maps to valid JUTSU_MAP IDs
    expect(CLANS.length).toBe(30);
    expect(MODE_DB.length).toBe(11);
    let totalHidenArts = 0;
    for (const clan of CLANS) {
      expect(clan.hidenArts.length, `Clan ${clan.id} missing hidenArts`).toBeGreaterThanOrEqual(1);
      for (const art of clan.hidenArts) {
        totalHidenArts++;
        expect(art.jutsuIds.length, `Hiden art ${art.id} has empty jutsuIds`).toBeGreaterThanOrEqual(1);
        expect((art as unknown as Record<string, unknown>).combatBonus).toBeUndefined();
        for (const jId of art.jutsuIds) {
          expect(JUTSU_MAP[jId], `Broken jutsuId "${jId}" in ${clan.id}.${art.id}`).toBeDefined();
        }
      }
    }
    expect(totalHidenArts).toBe(55);
  });

  it('guarantees zero dojutsu leaks outside lineage clans across 5,000 seeded births', () => {
    let uchihaCount = 0;
    let uchihaSharingan = 0;
    let hyugaCount = 0;
    let hyugaAwakenedByakugan = 0;
    let nonClanCount = 0;
    let nonClanMutations = 0;

    for (let i = 1; i <= 5000; i++) {
      const state = createNewLife(i * 97 + 13);
      const bl = state.bloodline;

      if (state.clanId === 'uchiha') {
        uchihaCount++;
        if (bl?.id === 'sharingan') uchihaSharingan++;
      } else {
        expect(bl?.id, `Non-Uchiha (${state.clanId}) rolled Sharingan on seed ${i}`).not.toBe('sharingan');
      }

      if (state.clanId === 'hyuga') {
        hyugaCount++;
        expect(bl?.id, `Hyuga must always be born with Byakugan (seed ${i})`).toBe('byakugan');
        expect(bl?.stage, `Hyuga Byakugan must start awakened (seed ${i})`).toBe('awakened');
        if (bl?.id === 'byakugan' && bl.stage === 'awakened') hyugaAwakenedByakugan++;
      } else {
        expect(bl?.id, `Non-Hyuga (${state.clanId}) rolled Byakugan on seed ${i}`).not.toBe('byakugan');
      }

      if (state.clanId !== 'chinoike') {
        expect(bl?.id).not.toBe('ketsuryugan');
      }
      expect(bl?.id).not.toBe('rinne_eye');
      expect(bl?.id).not.toBe('sage_body');

      if (!state.clanId) {
        nonClanCount++;
        if (bl) {
          nonClanMutations++;
          expect(['hyoton', 'yoton', 'jiton']).toContain(bl.id);
        }
      }
    }

    // Direct targeted checks for Uchiha (~70%) and Hyuga (100%)
    let directUchihaHits = 0;
    for (let s = 1; s <= 1000; s++) {
      const b = rollBirthBloodline(s * 31, 'clan_heir', 'uchiha');
      if (b?.id === 'sharingan') directUchihaHits++;
      const h = rollBirthBloodline(s * 31, 'clan_heir', 'hyuga');
      expect(h?.id).toBe('byakugan');
      expect(h?.stage).toBe('awakened');
    }
    expect(directUchihaHits / 1000).toBeGreaterThan(0.6);
    expect(directUchihaHits / 1000).toBeLessThan(0.8);
    expect(hyugaAwakenedByakugan).toBe(hyugaCount);
    expect(uchihaCount).toBeGreaterThan(0);
    expect(uchihaSharingan).toBeGreaterThan(0);
    expect(nonClanCount).toBeGreaterThan(1000);
    expect(nonClanMutations / nonClanCount).toBeLessThan(0.015);
  }, 15000);

  it('rejects mismatched clan-bloodline & non-Hyuga Gentle Fist in Point-Buy, while Free Mode bypasses clan rules', () => {
    const mismatchDojutsu = evaluateCustomBuild(
      makePointBuyConfig({ clanId: 'hyuga', latentBloodlineId: 'sharingan' }),
    );
    expect(mismatchDojutsu.valid).toBe(false);
    expect(mismatchDojutsu.errors.some((e) => e.includes('Uchiha'))).toBe(true);

    const clanlessDojutsu = evaluateCustomBuild(
      makePointBuyConfig({ clanId: undefined, latentBloodlineId: 'byakugan' }),
    );
    expect(clanlessDojutsu.valid).toBe(false);

    const rinneBirth = evaluateCustomBuild(
      makePointBuyConfig({ clanId: 'uchiha', latentBloodlineId: 'rinne_eye' }),
    );
    expect(rinneBirth.valid).toBe(false);

    const nonHyugaJuken = evaluateCustomBuild(
      makePointBuyConfig({ clanId: 'nara', startDisciplineId: 'gentle_fist' }),
    );
    expect(nonHyugaJuken.valid).toBe(false);
    expect(nonHyugaJuken.errors.some((e) => e.includes('Hyuga'))).toBe(true);

    const validUchiha = evaluateCustomBuild(
      makePointBuyConfig({ clanId: 'uchiha', latentBloodlineId: 'sharingan' }),
    );
    expect(validUchiha.valid).toBe(true);

    const validHyuga = evaluateCustomBuild(
      makePointBuyConfig({ clanId: 'hyuga', latentBloodlineId: 'byakugan', startDisciplineId: 'gentle_fist' }),
    );
    expect(validHyuga.valid).toBe(true);

    // Free Mode explicitly bypasses clan gating per user specification
    const freeSandbox = evaluateCustomBuild(
      makePointBuyConfig({
        mode: 'free',
        clanId: 'nara',
        latentBloodlineId: 'sharingan',
        startDisciplineId: 'gentle_fist',
      }),
    );
    expect(freeSandbox.valid).toBe(true);
  });

  it('gates Gentle Fist discipline away from non-Hyuga at birth and during learning events', () => {
    for (let s = 1; s <= 400; s++) {
      const disc = pickStartingDiscipline(s * 17, 'clan_heir', 'fire', 'uchiha');
      expect(disc?.id).not.toBe('gentle_fist');
    }

    const state = createNewLife(4242, {
      customBuild: makePointBuyConfig({ clanId: 'nara', startDisciplineId: 'fire_release' }),
    });
    state.rank = 'genin';
    state.age = 14;
    state.focus = 'training';
    for (let y = 10; y <= 34; y++) {
      state.age = y;
      const ev = tryDisciplineEvent(state, new SeededRng(y * 999));
      if (ev?.meta?.isNew) {
        expect(ev.meta.disciplineId).not.toBe('gentle_fist');
      }
    }
  });

  it('removes synthetic secret_art_* and bloodline_secret_* fallbacks and supports discoveredJutsu pipeline', () => {
    const state = createNewLife(777, {
      customBuild: makePointBuyConfig({
        mode: 'free',
        clanId: 'uchiha',
        latentBloodlineId: 'sharingan',
        startBloodlineStage: 'ctrl2',
        startDisciplineId: 'medical',
        startDisciplineLevel: 4,
      }),
    });

    const known = getKnownJutsu(state);
    expect(known.some((j) => j.id.startsWith('secret_art_'))).toBe(false);
    expect(known.some((j) => j.id.startsWith('bloodline_secret_'))).toBe(false);
    expect(known.some((j) => j.id === 'byakugo_no_in')).toBe(true);

    // Sharingan Copy pipeline: eligible elemental jutsu can be copied, Hyuga Hiden cannot
    recordDiscoveredJutsu(state, 'suiryudan');
    recordDiscoveredJutsu(state, 'hakke_64');
    const afterCopy = getKnownJutsu(state);
    expect(afterCopy.some((j) => j.id === 'suiryudan')).toBe(true);
    expect(afterCopy.some((j) => j.id === 'hakke_64')).toBe(false);

    // Unlocking Clan Hiden Art grants real Wave 2 jutsu and clan Mode
    const nara = createNewLife(888, {
      customBuild: makePointBuyConfig({ clanId: 'nara', startDisciplineId: 'trap_craft' }),
    });
    nara.clanHeritage!.unlockedHiden.push('hiden_nara_kagemane');
    expect(getKnownJutsu(nara).some((j) => j.id === 'kagemane')).toBe(true);

    const akimichi = createNewLife(889, {
      customBuild: makePointBuyConfig({ clanId: 'akimichi', startDisciplineId: 'strong_fist' }),
    });
    akimichi.clanHeritage!.unlockedHiden.push('hiden_akimichi_baika');
    expect(getAvailableModes(akimichi).some((m) => m.id === 'baika')).toBe(true);
  });
});
