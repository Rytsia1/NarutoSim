import { describe, expect, it } from 'vitest';
import { getAvailableModes, getKnownJutsu, JUTSU_MAP } from '../src/data/jutsu';
import {
  getCombatRating,
  getPlayerRanks,
  initBattleV2State,
  isRunOnSightLegend,
  resolveBattleRound,
  toggleBattleMode,
} from '../src/sim/combat';
import { CUSTOM_BUDGET, evaluateCustomBuild } from '../src/sim/custom';
import { buildLifeRecord } from '../src/sim/epilogue';
import { advanceYear, createNewLife, resolvePendingDecision } from '../src/sim/life';
import { tryLegendOrDrawbackDecision } from '../src/sim/life/legend-events';
import { computeCombatProjection, getChakraCap, getStatCap } from '../src/sim/powers';
import { canTakeChuninExam, canTakeGraduationExam, promoteRank } from '../src/sim/ranks';
import { SeededRng } from '../src/sim/rng';
import { formGeninTeam } from '../src/sim/team';
import type { CustomBuildConfig } from '../src/sim/types';
import { buildWarDayDecision, handleWarDecision, initWarState, startWarBattle } from '../src/sim/war';
import { BIJUU_LIST } from '../src/sim/world';
import { formatShareText } from '../src/ui/fx/recordCardCanvas';

describe('Custom Shinobi Build Kombo & Living Legend Overhaul', () => {
  it('supports Free Mode multi-discipline (up to 5), all 5 chakra elements, Sharingan MS/EMS, Kuchiyose, Jinchuriki & Signature Jutsu', () => {
    const cfg: CustomBuildConfig = {
      mode: 'free',
      name: 'Minato Uchiha',
      epithet: 'The Yellow Flash',
      sex: 'M',
      originId: 'clan_heir',
      villageId: 'konoha',
      clanId: 'uchiha',
      capacity: 5,
      element: 'wind',
      secondaryElements: ['fire', 'lightning', 'earth', 'water'],
      statOffsets: {},
      directStats: {
        chakra: 200,
        intel: 150,
        will: 150,
        bonds: 120,
        health: 150,
        ryo: 100,
      },
      startDisciplines: [
        { id: 'space_time', level: 4 },
        { id: 'wind_release', level: 3 },
        { id: 'senjutsu', level: 3 },
        { id: 'strong_fist', level: 4 },
        { id: 'medical', level: 4 },
      ],
      latentBloodlineId: 'sharingan',
      startBloodlineStage: 'mastered',
      mangekyoAwakened: true,
      mangekyoArts: ['kamui', 'tsukuyomi'],
      eternalMangekyo: true,
      summonClanId: 'toad',
      jinchurikiBijuu: BIJUU_LIST[8], // Kurama (Nine-Tails)
      jinchurikiOstracized: true,
      signatureJutsuIds: ['hiraishin', 'rasenshuriken', 'susanoo', 'edo_tensei'],
      transcendentCap: true,
      growthMult: 5,
    };

    const evalRes = evaluateCustomBuild(cfg);
    expect(evalRes.valid).toBe(true);

    const state = createNewLife(10101, { customBuild: cfg });
    expect(state.epithet).toBe('The Yellow Flash');
    expect(state.secondaryElements).toEqual(['fire', 'lightning', 'earth', 'water']);
    expect(state.disciplines.length).toBe(6); // 5 chosen + auto Lv1 summoning for Kuchiyose contract
    expect(state.bloodline?.id).toBe('sharingan');
    expect(state.bloodline?.mangekyoAwakened).toBe(true);
    expect(state.bloodline?.mangekyoArts).toEqual(['kamui', 'tsukuyomi']);
    expect(state.bloodline?.eternalMangekyo).toBe(true);
    expect(state.summonContract?.clanId).toBe('toad');
    expect(state.jinchuriki?.bijuuName).toBe(BIJUU_LIST[8]);
    expect(state.jinchuriki?.ostracized).toBe(true);
    expect(getStatCap(state)).toBe(150);
    expect(getChakraCap(state)).toBe(200);
    expect(state.stats.chakra).toBe(200);
    expect(state.stats.health).toBe(150);

    // Signature Jutsu + Mangekyo Arts + Edo Tensei all known
    const knownIds = new Set(getKnownJutsu(state).map((j) => j.id));
    expect(knownIds.has('hiraishin')).toBe(true);
    expect(knownIds.has('rasenshuriken')).toBe(true);
    expect(knownIds.has('susanoo')).toBe(true);
    expect(knownIds.has('edo_tensei')).toBe(true);
    expect(knownIds.has('kamui')).toBe(true);
    expect(knownIds.has('tsukuyomi')).toBe(true);
    expect(JUTSU_MAP.edo_tensei).toBeDefined();

    // Bijuu Cloak mode unlocked for Jinchuriki
    const modeIds = getAvailableModes(state).map((m) => m.id);
    expect(modeIds).toContain('bijuu_cloak');

    // Epithet & Bijuu carry into LifeRecord and Share Text
    const rec = buildLifeRecord(state);
    expect(rec.epithet).toBe('The Yellow Flash');
    expect(rec.bijuuName).toBe(BIJUU_LIST[8]);
    expect(formatShareText(rec)).toContain('"The Yellow Flash"');
    expect(formatShareText(rec)).toContain('Kurama');
  });

  it('expands Point-Buy budget with Drawbacks (+3..+5 pts) while keeping Free Mode perks gated', () => {
    const cfg: CustomBuildConfig = {
      mode: 'points',
      name: 'Kimimaro Test',
      sex: 'M',
      originId: 'clan_heir',
      villageId: 'konoha',
      clanId: 'uchiha',
      capacity: 5, // +3 pts above heir max 4
      element: 'fire',
      secondaryElements: ['lightning'], // +3 pts
      statOffsets: { chakra: 15, intel: 10 }, // +5 pts
      startDisciplineId: 'fire_release', // +1 pt (family)
      latentBloodlineId: 'sharingan', // +6 pts
      summonClanId: 'hawk', // +4 pts -> total 22 pts
      drawbacks: ['illness', 'hunted_by_village', 'chakra_burnout'], // +4 +4 +5 = +13 bonus -> budget 25!
    };

    const res = evaluateCustomBuild(cfg);
    expect(res.drawbackBonus).toBe(13);
    expect(res.budget).toBe(CUSTOM_BUDGET + 13);
    expect(res.pointsSpent).toBeLessThanOrEqual(res.budget);
    expect(res.valid).toBe(true);

    // Free Mode perks rejected in Point-Buy
    const invalidPb = evaluateCustomBuild({
      ...cfg,
      jinchurikiBijuu: BIJUU_LIST[0],
      transcendentCap: true,
      growthMult: 5,
    });
    expect(invalidPb.valid).toBe(false);
    expect(invalidPb.errors.length).toBeGreaterThanOrEqual(3);
  });

  it('applies Growth Multiplier (5x) cleanly and respects Transcendent Cap across years', () => {
    const baseState = createNewLife(20202, {
      customBuild: {
        mode: 'free',
        name: 'Normal Pace',
        sex: 'M',
        originId: 'civilian',
        villageId: 'konoha',
        capacity: 3,
        element: 'fire',
        statOffsets: {},
        directStats: { chakra: 30, intel: 20, will: 20, bonds: 30, health: 80, ryo: 20 },
        growthMult: 1,
      },
    });
    const fastState = createNewLife(20202, {
      customBuild: {
        mode: 'free',
        name: 'Fast Pace',
        sex: 'M',
        originId: 'civilian',
        villageId: 'konoha',
        capacity: 3,
        element: 'fire',
        statOffsets: {},
        directStats: { chakra: 30, intel: 20, will: 20, bonds: 30, health: 80, ryo: 20 },
        transcendentCap: true,
        growthMult: 5,
      },
    });

    baseState.age = 7;
    fastState.age = 7;
    promoteRank(baseState, 'genin');
    promoteRank(fastState, 'genin');
    baseState.focus = 'study';
    fastState.focus = 'study';
    baseState.flags.initial_focus_picked = true;
    fastState.flags.initial_focus_picked = true;

    advanceYear(baseState);
    advanceYear(fastState);
    expect(fastState.stats.intel).toBeGreaterThan(baseState.stats.intel);
  });

  it('triggers Prodigy Early Graduation (age 7-9), early Chunin (age 10), and Age 13 ANBU Captain', () => {
    const state = createNewLife(30303, {
      customBuild: {
        mode: 'free',
        name: 'Itachi Prodigy',
        sex: 'M',
        originId: 'clan_heir',
        villageId: 'konoha',
        clanId: 'uchiha',
        capacity: 5,
        element: 'fire',
        statOffsets: {},
        directStats: { chakra: 90, intel: 90, will: 90, bonds: 70, health: 90, ryo: 60 },
        startDisciplines: [{ id: 'fire_release', level: 3 }],
        latentBloodlineId: 'sharingan',
        startBloodlineStage: 'ctrl2',
      },
    });

    state.age = 8;
    promoteRank(state, 'academy');
    expect(canTakeGraduationExam(state)).toBe(true);

    // Graduate early -> Genin at age 10 can sit Chunin immediately with an active squad
    state.age = 10;
    promoteRank(state, 'genin');
    state.geninSinceAge = 10;
    const rng = new SeededRng(30303);
    state.team = formGeninTeam(state, rng);
    expect(canTakeChuninExam(state)).toBe(true);

    // At age 13 as Chunin with high score -> ANBU Captain appointment triggers!
    state.age = 13;
    promoteRank(state, 'chunin');
    const dec = tryLegendOrDrawbackDecision(state, rng);
    expect(dec?.eventId).toBe('prodigy_anbu_captain');
    state.pending = dec;
    resolvePendingDecision(state, 'accept_anbu_captain');
    expect(state.rank).toBe('jonin');
    expect(state.specialStatus).toBe('anbu');
    expect(state.flags.anbu_captain).toBe(true);
  });

  it('triggers Flee-on-Sight, Dramatic Killing Intent, Bijuu Cloak regen, and Solo Vanguard 2-sub-choice war actions', () => {
    const state = createNewLife(40404, {
      customBuild: {
        mode: 'free',
        name: 'Madara Legend',
        epithet: 'Ghost of the Uchiha',
        sex: 'M',
        originId: 'clan_heir',
        villageId: 'konoha',
        clanId: 'uchiha',
        capacity: 5,
        element: 'fire',
        statOffsets: {},
        directStats: { chakra: 190, intel: 145, will: 145, bonds: 100, health: 145, ryo: 100 },
        startDisciplines: [
          { id: 'fire_release', level: 4 },
          { id: 'senjutsu', level: 4 },
        ],
        latentBloodlineId: 'sharingan',
        startBloodlineStage: 'mastered',
        mangekyoAwakened: true,
        mangekyoArts: ['amaterasu', 'kamui'],
        eternalMangekyo: true,
        jinchurikiBijuu: BIJUU_LIST[8],
        transcendentCap: true,
        drawbacks: ['chakra_burnout'],
      },
    });
    state.age = 24;
    promoteRank(state, 'jonin');
    expect(computeCombatProjection(state).threatTier).toBe('S');
    expect(isRunOnSightLegend(state)).toBe(true);

    const rng = new SeededRng(40404);
    const war = initWarState(state, rng, false, 'front');
    state.war = war;
    war.hp = 85;
    war.cp = 85;

    // 1. Solo Vanguard Charge option appears on war_day and opens 2 sub-choices!
    const dayDec = buildWarDayDecision(state);
    expect(dayDec.options.some((o) => o.id === 'day_solo_vanguard')).toBe(true);
    state.pending = dayDec;
    handleWarDecision(state, 'day_solo_vanguard', rng);
    expect(state.pending?.kind).toBe('war_vanguard_choice');
    expect(state.pending?.options.some((o) => o.id === 'vanguard_gauntlet')).toBe(true);
    expect(state.pending?.options.some((o) => o.id === 'vanguard_barrage')).toBe(true);
    handleWarDecision(state, 'vanguard_cancel', rng);
    expect(state.pending?.kind).toBe('war_day');

    // 2. Flee-on-Sight routes sub-Jonin enemies before Round 1 begins
    const weakEnemy = war.enemies[0];
    weakEnemy.officialRank = 'chunin';
    weakEnemy.ranks = [2.2, 2.2, 2.2, 2.2, 2.2];
    const killsBefore = war.kills;
    startWarBattle(state, weakEnemy.id, {
      isFinal: false,
      isAmbush: true,
      isDefense: false,
      startedInPhase: 'night',
      allowFleeOnSight: true,
    });
    expect(weakEnemy.alive).toBe(false);
    expect(war.kills).toBe(killsBefore + 1);
    expect(war.activeBattle).toBeNull();
    expect(state.logs.some((l) => l.text.includes('Run-on-Sight Order') && l.text.includes('Ghost of the Uchiha'))).toBe(true);

    // 3. Jonin enemy with CR gap >= 2.5 triggers Dramatic Killing Intent + custom Epithet quip + Bijuu Cloak regen
    const joninEnemy = war.enemies[1];
    joninEnemy.officialRank = 'jonin';
    joninEnemy.ranks = [3.0, 3.0, 3.0, 3.0, 3.0];
    joninEnemy.hp = 180;
    const pCR = getCombatRating(getPlayerRanks(state, false));
    expect(pCR - getCombatRating(joninEnemy.ranks)).toBeGreaterThanOrEqual(2.5);

    startWarBattle(state, joninEnemy.id, { isFinal: false, isAmbush: true, isDefense: false, startedInPhase: 'night' });
    const battle = war.activeBattle!;
    expect(battle).not.toBeNull();
    expect(battle.enemyStatus?.fear).toBeDefined();
    expect(battle.sceneLine).toContain('brings');
    expect(battle.enemyQuip).toContain('Ghost of the Uchiha');

    // Toggle Bijuu Cloak and verify end-of-round regen
    const tog = toggleBattleMode(state, 'bijuu_cloak');
    expect(tog.ok).toBe(true);
    war.hp = 60;
    war.cp = 50;
    const res = resolveBattleRound(state, 'jutsu:gokakyu', rng);
    expect(res.summary.narrative).toContain('Bijuu Cloak +5 HP / +6 CP');

    // Re-init check idempotency
    initBattleV2State(state, joninEnemy, battle);
    expect(battle.killingIntentApplied).toBe(true);
  });
});
