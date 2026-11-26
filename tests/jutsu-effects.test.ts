import { describe, expect, it } from 'vitest';
import { formatJutsuChips, getKnownJutsu, JUTSU_DB, JUTSU_MAP, ZODIAC_SEAL_KANJI } from '../src/data/jutsu';
import { initClanHeritage } from '../src/sim/clan-heritage';
import {
  buildBattleRoundDecision,
  canToggleBattleMode,
  computeEnemyRoundPower,
  computePlayerRoundPower,
  initBattleV2State,
  isJutsuBlockedByBattleState,
  pickAutoJutsu,
  resolveBattleRound,
  resolveGate8Aftermath,
} from '../src/sim/combat';
import { createNewLife } from '../src/sim/life';
import { applyEternalMangekyo, awakenMangekyoSharingan, tryRareDojutsuTransplant } from '../src/sim/powers';
import { SeededRng } from '../src/sim/rng';
import type { ActiveBattleState, GameState, WarCompetitor } from '../src/sim/types';
import { initWarState } from '../src/sim/war';

function makeTestBattleState(opts?: {
  rank?: 'genin' | 'chunin' | 'jonin';
  lowStats?: boolean;
  clanId?: string;
  bloodlineId?: string;
  bloodlineStage?: 'latent' | 'awakened' | 'ctrl1' | 'ctrl2' | 'mastered';
  transplanted?: boolean;
  disciplines?: { id: string; level: 1 | 2 | 3 | 4 }[];
  will?: number;
  enemyRanks?: [number, number, number, number, number];
  playerCp?: number;
}): { state: GameState; enemy: WarCompetitor; battle: ActiveBattleState } {
  const state = createNewLife(2026);
  state.rank = opts?.rank ?? 'jonin';
  state.clanId = opts?.clanId ?? 'uchiha';
  state.clanHeritage = initClanHeritage(state, new SeededRng(2026));
  state.stats.chakra = opts?.lowStats ? 25 : 78;
  state.stats.intel = opts?.lowStats ? 25 : 72;
  state.stats.will = opts?.will ?? (opts?.lowStats ? 35 : 50);
  state.stats.health = opts?.lowStats ? 45 : 82;
  state.capacity = opts?.lowStats ? 1 : 4;
  state.disciplines = (opts?.disciplines ?? [
    { id: 'fire_release', level: 3 },
    { id: 'lightning_release', level: 3 },
    { id: 'wind_release', level: 3 },
    { id: 'water_release', level: 2 },
    { id: 'genjutsu', level: 2 },
  ]).map((d, idx) => ({
    id: d.id,
    level: d.level,
    xp: 30,
    lastLevelAge: 18,
    quality: 1,
    isMain: idx === 0,
    declinedUntilAge: 0,
  }));

  if (opts?.bloodlineId) {
    state.bloodline = {
      id: opts.bloodlineId,
      grade: 3,
      stage: opts.bloodlineStage ?? 'awakened',
      lastEventAge: 14,
      declined: false,
      eyeStrain: 0,
      transplanted: opts.transplanted,
    };
  } else {
    state.bloodline = null;
  }

  const rng = new SeededRng(9001);
  state.war = initWarState(state, rng, false, 'front');
  const war = state.war;
  war.hp = 100;
  war.cp = opts?.playerCp ?? 100;
  const enemy = war.enemies[0];
  enemy.hp = 100;
  enemy.cp = 50;
  enemy.intel = 100;
  enemy.ultimate.cost = 999; // Isolate tactical exchanges unless testing ultimates
  if (opts?.enemyRanks) {
    enemy.ranks = [...opts.enemyRanks];
  }

  const battle: ActiveBattleState = {
    enemyId: enemy.id,
    round: 1,
    maxRounds: 8,
    isFinal: false,
    isAmbush: false,
    isDefense: false,
    sceneLine: 'Combat begins.',
    enemyQuip: '"Show me your jutsu."',
    playerWardRounds: 0,
    playerBuffRounds: 0,
    playerCloneEvade: false,
    enemyDebuffRounds: 0,
    bloodlineActiveRounds: 0,
    enemyWallRounds: 0,
    enemyFieldRounds: 0,
    weaknessExploited: false,
    usedDesperation: false,
    resolveBoostThisRound: false,
    enemyStatus: {},
    playerStatus: {},
    playerSelf: {},
    enemySelf: {},
    playerDojutsuMode: null,
    playerBodyMode: null,
    modeCooldowns: {},
    setupFlags: {},
    usesThisBattle: {},
    rounds: [],
  };
  war.activeBattle = battle;
  initBattleV2State(state, enemy, battle);
  return { state, enemy, battle };
}

describe('Effect Model v2 & Wave 1 Jutsu Catalog (Section 1 & 4.2)', () => {
  it('validates Wave 1 + Wave 2 + Wave 3 JUTSU_DB integrity: unique IDs, Narutopedia refs, valid zodiac seals, zero em-dashes', () => {
    expect(JUTSU_DB.length).toBeGreaterThanOrEqual(165);
    const ids = new Set<string>();
    const validSeals = new Set(Object.keys(ZODIAC_SEAL_KANJI));

    for (const j of JUTSU_DB) {
      expect(ids.has(j.id), `Duplicate jutsu id: ${j.id}`).toBe(false);
      ids.add(j.id);

      expect(j.ref.trim().length, `Missing Narutopedia ref on ${j.id}`).toBeGreaterThan(0);
      expect(j.description.includes('\u2014'), `Em-dash found in ${j.id}`).toBe(false);
      expect(j.name.includes('\u2014'), `Em-dash found in ${j.name}`).toBe(false);

      for (const s of j.seals) {
        expect(validSeals.has(s), `Invalid zodiac seal "${s}" on ${j.id}`).toBe(true);
      }

      const needsSeal =
        (j.category === 'ninjutsu' || j.category === 'genjutsu' || j.category === 'fuinjutsu' || j.category === 'medical' || j.category === 'summoning') &&
        !j.sealless;
      if (needsSeal) {
        expect(j.seals.length, `Non-sealless jutsu ${j.id} must have >= 1 hand seal`).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('applies Killing Intent (Fear) on Round 1 when CR gap >= 2 and lets high Willpower resist it', () => {
    const lowWill = makeTestBattleState({
      rank: 'genin',
      lowStats: true,
      will: 40,
      disciplines: [{ id: 'fire_release', level: 1 }],
      enemyRanks: [6.0, 6.0, 6.0, 6.0, 6.0],
    });
    expect(lowWill.battle.playerStatus?.fear).toBeDefined();
    expect(lowWill.battle.playerStatus?.fear?.rounds).toBeGreaterThanOrEqual(1);

    const highWill = makeTestBattleState({
      rank: 'genin',
      lowStats: true,
      will: 90,
      disciplines: [{ id: 'fire_release', level: 1 }],
      enemyRanks: [6.0, 6.0, 6.0, 6.0, 6.0],
    });
    expect(highWill.battle.playerStatus?.fear).toBeUndefined();
  });

  it('supports instant Mode toggles (no round advance), Dojutsu + Body stacking, CP upkeep, and auto-off at CP 0', () => {
    const { state, battle } = makeTestBattleState({
      bloodlineId: 'sharingan',
      bloodlineStage: 'ctrl2',
      disciplines: [{ id: 'senjutsu', level: 3 }, { id: 'fire_release', level: 2 }],
      playerCp: 20,
    });

    const rng = new SeededRng(101);
    const res1 = resolveBattleRound(state, 'toggle_mode:sharingan', rng);
    expect(res1.status).toBe('mode_toggled');
    expect(battle.round).toBe(1);
    expect(battle.playerDojutsuMode).toBe('sharingan');

    const res2 = resolveBattleRound(state, 'toggle_mode:sennin', rng);
    expect(res2.status).toBe('mode_toggled');
    expect(battle.round).toBe(1);
    expect(battle.playerDojutsuMode).toBe('sharingan');
    expect(battle.playerBodyMode).toBe('sennin');

    // Run a zero-CP strike so mode upkeep drains CP (4 + 5 = 9 CP/rd)
    resolveBattleRound(state, 'jutsu:basic_strike', rng);
    expect(battle.round).toBe(2);
    expect(state.war!.cp).toBe(11);

    // Next round drains another 9 -> 2 CP, then another round hits 0 -> auto-off + 1r cooldown!
    resolveBattleRound(state, 'jutsu:basic_strike', rng);
    resolveBattleRound(state, 'jutsu:basic_strike', rng);
    expect(state.war!.cp).toBe(0);
    expect(battle.playerDojutsuMode).toBeNull();
    expect(battle.playerBodyMode).toBeNull();
  });

  it('applies 2x CP upkeep tax for transplanted non-clan Dojutsu', () => {
    const { state } = makeTestBattleState({
      clanId: 'nara',
      bloodlineId: 'sharingan',
      bloodlineStage: 'awakened',
      transplanted: true,
      playerCp: 20,
    });
    const rng = new SeededRng(202);
    resolveBattleRound(state, 'toggle_mode:sharingan', rng);
    resolveBattleRound(state, 'jutsu:basic_strike', rng);
    expect(state.war!.cp).toBe(12); // 4 * 2 = 8 CP upkeep
  });

  it('resolves DoT ticks (burn, bleed, poison), drain CP siphon, and Tenketsu Seal lockout', () => {
    const { state, enemy, battle } = makeTestBattleState({
      enemyRanks: [2.5, 2.5, 2.5, 2.5, 2.5],
      playerCp: 50,
    });
    const rng = new SeededRng(303);

    battle.enemyStatus = {
      burn: { rounds: 2, value: 5 },
      bleed: { rounds: 2, value: 4 },
      poison: { rounds: 2, value: 3 },
      drain: { rounds: 2, value: 6 },
    };
    const cpBefore = state.war!.cp;
    const enemyHpBefore = enemy.hp;
    resolveBattleRound(state, 'jutsu:kawarimi', rng);
    // Support action deals 0 direct dmg; DoTs deal 5 + 4 + 3 = 12 dmg; drain siphons +6 CP after -4 CP kawarimi
    expect(enemy.hp).toBe(enemyHpBefore - 12);
    expect(state.war!.cp).toBe(cpBefore - 4 + 6);

    // Tenketsu Seal on player blocks chakra ninjutsu but allows 0-CP taijutsu
    battle.playerStatus = { tenketsu_seal: { rounds: 2 } };
    const dec = buildBattleRoundDecision(state);
    const fireOpt = dec.options.find((o) => o.id === 'jutsu:gokakyu');
    const strikeOpt = dec.options.find((o) => o.id === 'jutsu:basic_strike');
    expect(fireOpt?.disabled).toBe(true);
    expect(strikeOpt?.disabled).toBe(false);
    expect(isJutsuBlockedByBattleState(state, state.war!, battle, JUTSU_DB.find((j) => j.id === 'gokakyu')!)).toContain('Tenketsu Seal');
  });

  it('enforces Counter Matrix 1.6: Genjutsu vs Kai, Evade vs AoE, Intangible vs Genjutsu, Wall vs Pierce, Bind vs Power Gap', () => {
    // 1. Genjutsu broken immediately by Kai
    const gCase = makeTestBattleState();
    gCase.battle.playerStatus = { genjutsu: { rounds: 2 } };
    const powerUnderGen = computePlayerRoundPower(gCase.state, gCase.state.war!, gCase.enemy, gCase.battle).power;
    resolveBattleRound(gCase.state, 'jutsu:kai', new SeededRng(404));
    expect(gCase.battle.playerStatus?.genjutsu).toBeUndefined();
    const powerAfterKai = computePlayerRoundPower(gCase.state, gCase.state.war!, gCase.enemy, gCase.battle).power;
    expect(powerAfterKai).toBeGreaterThan(powerUnderGen);

    // 2. Evade blocks single-target, AoE hits through & burns Evade
    const eCase = makeTestBattleState({ enemyRanks: [1.5, 1.5, 1.5, 1.5, 1.5] });
    eCase.battle.enemySelf = { evade: { rounds: 2, value: 1 } };
    const singleRes = resolveBattleRound(eCase.state, 'jutsu:gokakyu', new SeededRng(505));
    expect(singleRes.summary.enemyDmgTaken).toBe(0);

    eCase.battle.enemySelf = { evade: { rounds: 2, value: 1 } };
    const aoeRes = resolveBattleRound(eCase.state, 'jutsu:hosenka', new SeededRng(506));
    expect(aoeRes.summary.enemyDmgTaken).toBeGreaterThan(0);
    expect(eCase.battle.enemySelf?.evade).toBeUndefined();

    // 3. Intangible blocks physical, Genjutsu hits through
    const iCase = makeTestBattleState({ enemyRanks: [1.5, 1.5, 1.5, 1.5, 1.5] });
    iCase.battle.enemySelf = { intangible: { rounds: 2, value: 1 } };
    const physRes = resolveBattleRound(iCase.state, 'jutsu:basic_strike', new SeededRng(606));
    expect(physRes.summary.enemyDmgTaken).toBe(0);
    const genRes = resolveBattleRound(iCase.state, 'jutsu:magen_kasegui', new SeededRng(607));
    expect(genRes.summary.enemyDmgTaken).toBeGreaterThan(0);

    // 4. Wall shattered by Pierce jutsu
    const wCase = makeTestBattleState({ enemyRanks: [1.5, 1.5, 1.5, 1.5, 1.5] });
    wCase.battle.enemySelf = { wall: { rounds: 2, value: 30 } };
    wCase.battle.enemyWallRounds = 2;
    const pierceRes = resolveBattleRound(wCase.state, 'jutsu:ryuka', new SeededRng(707));
    expect(pierceRes.summary.enemyDmgTaken).toBeGreaterThan(0);
    expect(wCase.battle.enemySelf?.wall).toBeUndefined();

    // 5. Bind broken immediately when target is >= 2 CR tiers stronger (no Genin permastun on Kage)
    const bCase = makeTestBattleState({
      rank: 'genin',
      lowStats: true,
      disciplines: [{ id: 'earth_release', level: 1 }],
      enemyRanks: [6.0, 6.0, 6.0, 6.0, 6.0],
    });
    bCase.battle.enemyStatus = { bind: { rounds: 2, value: 1 } };
    const bindRes = resolveBattleRound(bCase.state, 'jutsu:basic_strike', new SeededRng(808));
    expect(bCase.battle.enemyStatus?.bind).toBeUndefined();
    expect(bindRes.summary.narrative).toContain('shatters the bind');

    // 6. Statuses properly reduce enemy power (shock, slow, fear, blind)
    const sCase = makeTestBattleState({ enemyRanks: [3.5, 3.5, 3.5, 3.5, 3.5] });
    const baseEnemyP = computeEnemyRoundPower(sCase.state.war!, sCase.enemy, sCase.battle);
    sCase.battle.enemyStatus = { shock: { rounds: 2, value: 8 }, fear: { rounds: 2, value: 8 } };
    const debuffedEnemyP = computeEnemyRoundPower(sCase.state.war!, sCase.enemy, sCase.battle);
    expect(debuffedEnemyP).toBeLessThan(baseEnemyP - 10);
  });

  it('verifies Monte Carlo diversity: no single jutsu exceeds 40% pick share under pickAutoJutsu', () => {
    const counts = new Map<string, number>();
    let totalPicks = 0;

    for (let trial = 0; trial < 40; trial++) {
      const { state, enemy, battle } = makeTestBattleState({
        enemyRanks: [3.2, 3.2, 3.2, 3.2, 3.2],
        playerCp: 100,
      });
      const rng = new SeededRng(10000 + trial * 37);

      // Vary battlefield states across trials (walls, evades, genjutsu, blind)
      if (trial % 4 === 1) battle.enemySelf = { wall: { rounds: 2, value: 26 } };
      if (trial % 4 === 2) battle.enemySelf = { evade: { rounds: 1, value: 1 } };
      if (trial % 4 === 3) battle.playerStatus = { genjutsu: { rounds: 2 } };

      for (let r = 0; r < 5 && enemy.hp > 0 && state.war!.hp > 0; r++) {
        const pick = pickAutoJutsu(state, rng);
        counts.set(pick, (counts.get(pick) ?? 0) + 1);
        totalPicks++;
        const res = resolveBattleRound(state, pick, rng);
        if (res.status !== 'continue') break;
      }
    }

    expect(totalPicks).toBeGreaterThan(80);
    let maxShare = 0;
    let topId = '';
    for (const [id, c] of counts.entries()) {
      const share = c / totalPicks;
      if (share > maxShare) {
        maxShare = share;
        topId = id;
      }
    }
    expect(maxShare, `Single jutsu ${topId} dominated ${(maxShare * 100).toFixed(1)}% of optimal picks`).toBeLessThanOrEqual(0.4);
  });

  it('enforces Wave 2 clan synergies: Nara nighttime shadow penalty and Hozuki Suika lightning vulnerability', () => {
    // 1. Nara Kagemane shows NIGHT -20% chip during night battles without prev_fire
    const naraCase = makeTestBattleState({
      clanId: 'nara',
      enemyRanks: [1.5, 1.5, 1.5, 1.5, 1.5],
    });
    naraCase.state.clanHeritage!.clanId = 'nara';
    naraCase.state.clanHeritage!.unlockedHiden.push('hiden_nara_kagemane');
    naraCase.battle.startedInPhase = 'night';

    const nightChips = formatJutsuChips(JUTSU_MAP.kagemane, naraCase.battle);
    expect(nightChips.some((c) => c.label === 'NIGHT -20%')).toBe(true);

    const resNight = resolveBattleRound(naraCase.state, 'jutsu:kagemane', new SeededRng(4242));
    expect(resNight.summary.narrative).toContain('night dimness -20%');

    // Setting prev_fire removes the nighttime chip warning
    naraCase.battle.setupFlags!.prev_fire = 2;
    const litChips = formatJutsuChips(JUTSU_MAP.kagemane, naraCase.battle);
    expect(litChips.some((c) => c.label === 'NIGHT -20%')).toBe(false);

    // 2. Hozuki Suika mode is vulnerable to Lightning enemies
    const hozukiCase = makeTestBattleState({
      rank: 'genin',
      lowStats: true,
      clanId: 'hozuki',
      enemyRanks: [5.0, 5.0, 5.0, 5.0, 5.0],
    });
    hozukiCase.state.clanHeritage!.clanId = 'hozuki';
    hozukiCase.state.clanHeritage!.unlockedHiden.push('hiden_hozuki_liquid');
    hozukiCase.enemy.element = 'lightning';
    resolveBattleRound(hozukiCase.state, 'toggle_mode:suika', new SeededRng(5151));
    expect(hozukiCase.battle.playerBodyMode).toBe('suika');

    let sawShockNote = false;
    for (let s = 1; s <= 15; s++) {
      hozukiCase.state.war!.hp = 100;
      hozukiCase.state.war!.cp = 100;
      hozukiCase.battle.playerBodyMode = 'suika';
      const r = resolveBattleRound(hozukiCase.state, 'jutsu:basic_strike', new SeededRng(6000 + s));
      if (r.summary.narrative.includes('Hydrification')) {
        sawShockNote = true;
        break;
      }
    }
    expect(sawShockNote).toBe(true);
  });

  it('enforces Wave 3 mechanics: Kirin prev_fire setup, Mangekyo Eye Strain/Blindness/EMS, Shiki Fujin mutual kill, Gate 8 aftermath, and rare Transplant', () => {
    // 1. Kirin requires prev_fire setup flag
    const kirinCase = makeTestBattleState({
      disciplines: [
        { id: 'lightning_release', level: 4 },
        { id: 'fire_release', level: 2 },
      ],
      enemyRanks: [2.0, 2.0, 2.0, 2.0, 2.0],
    });
    expect(isJutsuBlockedByBattleState(kirinCase.state, kirinCase.state.war!, kirinCase.battle, JUTSU_MAP.kirin)).toContain('prev fire');
    resolveBattleRound(kirinCase.state, 'jutsu:gokakyu', new SeededRng(7001));
    expect(kirinCase.battle.setupFlags?.prev_fire).toBeGreaterThanOrEqual(1);
    expect(isJutsuBlockedByBattleState(kirinCase.state, kirinCase.state.war!, kirinCase.battle, JUTSU_MAP.kirin)).toBeNull();

    // 2. Mangekyo Sharingan awakening rolls 2 arts, Susanoo unlocks at mastered, eyeStrain >= 20 blinds, EMS cures
    const msCase = makeTestBattleState({
      clanId: 'uchiha',
      bloodlineId: 'sharingan',
      bloodlineStage: 'mastered',
      enemyRanks: [2.5, 2.5, 2.5, 2.5, 2.5],
      playerCp: 100,
    });
    const rolledArts = awakenMangekyoSharingan(msCase.state, new SeededRng(7002));
    expect(rolledArts.length).toBe(2);
    expect(rolledArts[0]).not.toBe(rolledArts[1]);
    const knownMs = getKnownJutsu(msCase.state);
    expect(knownMs.some((j) => j.id === rolledArts[0])).toBe(true);
    expect(knownMs.some((j) => j.id === 'susanoo')).toBe(true);

    // Push Eye Strain to 18, then cast Susanoo (+3 -> 21 >= 20 -> permanent blindness until EMS!)
    msCase.state.bloodline!.eyeStrain = 18;
    resolveBattleRound(msCase.state, 'jutsu:susanoo', new SeededRng(7003));
    expect(msCase.state.bloodline!.blinded).toBe(true);
    expect(canToggleBattleMode(msCase.state, msCase.state.war!, msCase.battle, 'sharingan').allowed).toBe(false);
    expect(isJutsuBlockedByBattleState(msCase.state, msCase.state.war!, msCase.battle, JUTSU_MAP.susanoo)).toContain('Blinded');

    // EMS cures blindness & prevents future eyeStrain
    applyEternalMangekyo(msCase.state);
    expect(msCase.state.bloodline!.blinded).toBe(false);
    expect(msCase.state.bloodline!.eyeStrain).toBe(0);
    msCase.state.war!.cp = 100;
    msCase.enemy.hp = 100;
    resolveBattleRound(msCase.state, 'jutsu:susanoo', new SeededRng(7004));
    expect(msCase.state.bloodline!.eyeStrain).toBe(0);

    // 3. Shiki Fujin mutual-kill kinjutsu
    const sfCase = makeTestBattleState({
      disciplines: [{ id: 'fuinjutsu', level: 4 }],
      enemyRanks: [5.5, 5.5, 5.5, 5.5, 5.5],
    });
    const sfRes = resolveBattleRound(sfCase.state, 'jutsu:shiki_fujin', new SeededRng(7005));
    expect(sfRes.status).toBe('player_dead');
    expect(sfCase.enemy.hp).toBe(0);
    expect(sfCase.state.war!.hp).toBe(0);

    // 4. Eighth Gate sets gate8Used and distributes ~70% fatal / ~30% permanent disability
    const g8Case = makeTestBattleState({
      disciplines: [{ id: 'strong_fist', level: 4 }],
      enemyRanks: [3.0, 3.0, 3.0, 3.0, 3.0],
    });
    resolveBattleRound(g8Case.state, 'jutsu:hachimon_gate8_sekizo', new SeededRng(7006));
    expect(g8Case.battle.gate8Used).toBe(true);

    let g8Deaths = 0;
    let g8Disabled = 0;
    for (let i = 0; i < 1000; i++) {
      const st = createNewLife(8000 + i);
      const out = resolveGate8Aftermath(st, new SeededRng(9000 + i));
      if (out.died) g8Deaths++;
      else if (st.permanentDisability) g8Disabled++;
    }
    expect(g8Deaths / 1000).toBeGreaterThan(0.63);
    expect(g8Deaths / 1000).toBeLessThan(0.77);
    expect(g8Deaths + g8Disabled).toBe(1000);

    // 5. Rare non-clan Dojutsu Transplant (< 1% rate) sets transplanted: true
    let transplants = 0;
    for (let i = 0; i < 2000; i++) {
      const st = createNewLife(12000 + i);
      st.bloodline = null;
      const res = tryRareDojutsuTransplant(st, new SeededRng(15000 + i));
      if (res) {
        transplants++;
        const updatedBloodline = st.bloodline as GameState['bloodline'];
        expect(updatedBloodline?.transplanted).toBe(true);
      }
    }
    expect(transplants).toBeGreaterThan(0);
    expect(transplants / 2000).toBeLessThan(0.02);
  }, 15000);
});
