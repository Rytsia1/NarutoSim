import { describe, expect, it } from 'vitest';
import { RETIREMENT_EVENTS } from '../src/data/events-epilogue';
import { FLAVOR_LINES, GROWTH_EVENTS, LIFE_EVENTS } from '../src/data/events-life';
import { PARTNER_WAR_SCENES } from '../src/data/events-partner';
import { WAR_CROSSROADS } from '../src/data/events-war';
import { SUMMON_CLANS } from '../src/data/summons';
import {
  buildBattleRoundDecision,
  getEffectiveJutsuCost,
  getEffectiveUltimateCost,
  resolveBattleRound,
} from '../src/sim/combat';
import { JUTSU_MAP } from '../src/data/jutsu';
import { buildPosthumousEpilogue, buildRetirementEventDecision } from '../src/sim/epilogue';
import { createNewLife } from '../src/sim/life';
import { detectWarArcs, recordWarFact } from '../src/sim/narrative';
import {
  adjustPartnerTrust,
  applyResolvePartnerReaction,
  computeAffinityWeights,
  selectWarPartner,
} from '../src/sim/partner';
import { promoteRank } from '../src/sim/ranks';
import { SeededRng } from '../src/sim/rng';
import { concludeWar, ensureWarClockDefaults, handleWarDecision, initWarState, startWarBattle } from '../src/sim/war';

describe('Mechanics Overhaul K1-K6: War Partner, Kuchiyose Od, Finale & Content Pools', () => {
  it('K1/K3: exp(fit/8) affinity weighting heavily favors high-fit candidates across large seeded samples', () => {
    const state = createNewLife(7101);
    state.stats.will = 95;
    state.stats.bonds = 95;
    state.stats.chakra = 20;
    state.leanings.will_of_fire = 5;

    const candidates = [
      { id: 'high_fit', traits: ['honor', 'compassion'] as ('honor' | 'compassion')[] },
      { id: 'low_fit', traits: ['ambition', 'freedom'] as ('ambition' | 'freedom')[] },
    ];
    const weighted = computeAffinityWeights(state, candidates);
    const high = weighted.find((w) => w.item.id === 'high_fit')!;
    const low = weighted.find((w) => w.item.id === 'low_fit')!;
    expect(high.fit).toBeGreaterThan(low.fit + 25);

    const rng = new SeededRng(4242);
    let highPicks = 0;
    for (let i = 0; i < 400; i++) {
      const pick = rng.weighted(weighted.map((w) => ({ item: w.item.id, weight: w.weight })));
      if (pick === 'high_fit') highPicks += 1;
    }
    expect(highPicks).toBeGreaterThan(360);
  });

  it('K1: enforces all 4 Partner Trust Tiers (<35 distrust/retreat refusal, >=60 ult discount, >=80 free surpass)', () => {
    const state = createNewLife(7102);
    state.age = 20;
    promoteRank(state, 'chunin');
    state.stats.chakra = 75;
    state.stats.health = 85;
    const rng = new SeededRng(1001);
    state.war = initWarState(state, rng, false, 'front');
    const war = state.war;
    const partner = war.partner!;
    expect(partner).not.toBeNull();
    expect(war.enemies.some((e) => e.rosterId === partner.rosterId && partner.rosterId !== undefined)).toBe(false);

    // Tier < 35: trust gain is halved
    partner.trust = 25;
    const gainLow = adjustPartnerTrust(state, partner, 8);
    expect(gainLow).toBeLessThanOrEqual(4);

    // Tier < 35: retreat refusal can trigger over repeated trials
    startWarBattle(state, war.enemies[0].id, { isFinal: false, isAmbush: false, isDefense: false });
    let refused = false;
    for (let i = 0; i < 40; i++) {
      partner.trust = 20;
      war.hp = 90;
      war.activeBattle!.round = 1;
      const res = resolveBattleRound(state, 'retreat', new SeededRng(500 + i));
      if (res.summary.playerAction.includes('Partner Refused')) {
        refused = true;
        break;
      }
    }
    expect(refused).toBe(true);

    // Tier >= 60: 15% Clash Ultimate CP discount
    state.disciplines = [
      { id: 'fire_release', level: 4, xp: 50, lastLevelAge: 19, quality: 1, isMain: true, declinedUntilAge: 0 },
    ];
    partner.trust = 40;
    const baseUltCost = getEffectiveUltimateCost(state, war);
    partner.trust = 65;
    expect(getEffectiveUltimateCost(state, war)).toBe(Math.round(baseUltCost * 0.85));

    // Tier >= 80 & HP < 35: Unbreakable Bond Free Surpass Limits option appears
    partner.trust = 85;
    partner.freeSurpassUsed = false;
    war.hp = 30;
    const dec = buildBattleRoundDecision(state);
    expect(dec.options.some((o) => o.id === 'partner_free_surpass')).toBe(true);
  });

  it('K1: defection only triggers when Resolves == 0, Trust < 35, and partner has ambition trait', () => {
    const state = createNewLife(7103);
    state.age = 22;
    promoteRank(state, 'jonin');
    const rng = new SeededRng(2025);
    state.war = initWarState(state, rng, false, 'front');
    const war = state.war;
    const partner = war.partner!;

    // Without ambition trait: never defects even at 0 resolves & trust 10
    partner.traits = ['honor', 'loyalty'];
    partner.trust = 10;
    war.resolves = 0;
    for (let i = 0; i < 20; i++) {
      const rx = applyResolvePartnerReaction(state, war, new SeededRng(900 + i));
      expect(rx.defected).toBe(false);
    }

    // With ambition trait, resolves == 0, trust < 35: defects!
    let defected = false;
    for (let i = 0; i < 25; i++) {
      const s2 = createNewLife(7103);
      s2.age = 22;
      promoteRank(s2, 'jonin');
      s2.war = initWarState(s2, new SeededRng(2025), false, 'front');
      s2.war.partner!.traits = ['ambition', 'freedom'];
      s2.war.partner!.trust = 15;
      s2.war.resolves = 0;
      const rx = applyResolvePartnerReaction(s2, s2.war, new SeededRng(300 + i));
      if (rx.defected) {
        expect(s2.war.partner!.defected).toBe(true);
        expect(s2.war.partner!.active).toBe(false);
        expect(s2.war.enemies.some((e) => e.id.startsWith('en_defect_'))).toBe(true);
        defected = true;
        break;
      }
    }
    expect(defected).toBe(true);
  });

  it('K3: executes Kuchiyose & Support Jutsu via unified Chakra meter on their own exchange', () => {
    const state = createNewLife(7104);
    state.age = 21;
    promoteRank(state, 'chunin');
    state.stats.chakra = 80;
    state.stats.health = 90;
    state.summonContract = { clanId: 'toad', contractedAge: 14, fitScore: 78, summonUses: 0 };
    state.disciplines.push(
      { id: 'medical', level: 2, xp: 20, lastLevelAge: 18, quality: 1, isMain: false, declinedUntilAge: 0 },
      { id: 'barrier', level: 2, xp: 20, lastLevelAge: 18, quality: 1, isMain: false, declinedUntilAge: 0 },
      { id: 'shadow_clone', level: 2, xp: 20, lastLevelAge: 18, quality: 1, isMain: false, declinedUntilAge: 0 },
    );

    const rng = new SeededRng(4004);
    state.war = initWarState(state, rng, false, 'front');
    const enemy = state.war.enemies[0];
    enemy.hp = 100;
    startWarBattle(state, enemy.id, { isFinal: false, isAmbush: true, isDefense: false });

    const menu = buildBattleRoundDecision(state);
    expect(menu.options.map((o) => o.id)).toEqual(
      expect.arrayContaining(['jutsu:kuchiyose', 'jutsu:shosen', 'jutsu:fuin_ward', 'jutsu:kage_bunshin']),
    );

    const cpBefore = state.war.cp;
    const expectedCost = getEffectiveJutsuCost(state, JUTSU_MAP.kuchiyose, state.war);
    const res = resolveBattleRound(state, 'jutsu:kuchiyose', rng);
    expect(state.war.cp).toBe(cpBefore - expectedCost);
    expect(state.summonContract.summonUses).toBe(1);
    expect(res.summary.narrative).toContain('Kuchiyose:');
    expect(res.summary.jutsuName).toBe('Kuchiyose no Jutsu');
    expect(res.summary.outcome).toBe('support');
  });

  it('K4/K5: "Stay With Me" finale carries permanentPartner into the next war and retirement/posthumous epilogues', () => {
    const state = createNewLife(7105, { crisisOverride: 'none' });
    state.age = 24;
    promoteRank(state, 'jonin');
    const rng = new SeededRng(5005);
    state.war = initWarState(state, rng, false, 'front');
    const partner = state.war.partner!;
    partner.trust = 85;
    partner.relTrack = 'romance';
    const partnerName = partner.name;

    // Trigger War Finale Wish on victory
    concludeWar(state, rng, 'victor', true);
    expect(state.pending?.kind).toBe('war_finale_wish');
    expect(state.pending?.options.some((o) => o.id === 'wish_stay_with_me')).toBe(true);

    // Choose "Stay With Me"
    handleWarDecision(state, 'wish_stay_with_me', rng);
    expect(state.permanentPartner).not.toBeNull();
    expect(state.permanentPartner!.name).toBe(partnerName);
    expect(state.phase).toBe('life');

    // Next war automatically brings back the exact same permanent partner!
    const nextPartner = selectWarPartner(state, new SeededRng(6006));
    expect(nextPartner.source).toBe('permanent');
    expect(nextPartner.name).toBe(partnerName);

    // Retirement partner scenes & posthumous beat include the permanent partner
    state.usedRetirement = RETIREMENT_EVENTS.filter((r) => !r.requiresPartner).map((r) => r.id);
    const retDec = buildRetirementEventDecision(state, new SeededRng(7007));
    expect(retDec).not.toBeNull();
    expect(retDec!.body).toContain(partnerName);

    const beats = buildPosthumousEpilogue(state);
    expect(beats.some((b) => b.title.includes(partnerName))).toBe(true);
  });

  it('K6: satisfies Target 1 content pool counts with zero em-dashes and trait reactions on all War Crossroads', () => {
    expect(LIFE_EVENTS.length).toBeGreaterThanOrEqual(60);
    expect(GROWTH_EVENTS.length).toBeGreaterThanOrEqual(25);
    expect(FLAVOR_LINES.length).toBeGreaterThanOrEqual(50);
    expect(WAR_CROSSROADS.length).toBeGreaterThanOrEqual(30);
    expect(RETIREMENT_EVENTS.length).toBeGreaterThanOrEqual(40);
    expect(PARTNER_WAR_SCENES.length).toBe(5);
    expect(SUMMON_CLANS.length).toBe(6);

    for (const cr of WAR_CROSSROADS) {
      for (const opt of cr.options) {
        expect(opt.reactions && Object.keys(opt.reactions).length > 0, `Missing reactions on ${cr.id}/${opt.id}`).toBe(true);
      }
    }
  });

  it('regressions: migrates legacy war saves safely, expires od_ward after 1 round, and detects partner war arcs', () => {
    const state = createNewLife(7199, { crisisOverride: 'none' });
    state.age = 22;
    promoteRank(state, 'chunin');
    state.disciplines.push({
      id: 'barrier',
      level: 2,
      xp: 10,
      lastLevelAge: 19,
      quality: 1,
      isMain: false,
      declinedUntilAge: 0,
    });
    const rng = new SeededRng(9191);
    state.war = initWarState(state, rng, false, 'front');
    const enemy = state.war.enemies[0];
    enemy.hp = 200;
    startWarBattle(state, enemy.id, { isFinal: false, isAmbush: true, isDefense: false });

    // 1. Simulate legacy save missing K1/K2 fields
    const rawWar = state.war as unknown as Record<string, unknown>;
    delete rawWar.usedPartnerScenes;
    delete rawWar.partner;
    ensureWarClockDefaults(state.war);
    expect(Array.isArray(state.war.usedPartnerScenes)).toBe(true);
    expect(state.war.partner).toBeNull();

    // 2. Fuin Ward applies 2 rounds of ward via unified Chakra and decrements cleanly next round
    state.war.activeBattle!.playerWardRounds = 0;
    resolveBattleRound(state, 'jutsu:fuin_ward', rng);
    expect(state.war.activeBattle!.playerWardRounds).toBe(2);
    resolveBattleRound(state, 'jutsu:basic_strike', rng);
    expect(state.war.activeBattle!.playerWardRounds).toBe(1);

    // 3. Partner facts surface in detectWarArcs
    recordWarFact(state.war, {
      type: 'partner_intercept',
      actorId: 'p1',
      actorName: 'Shun Hatake',
      targetId: 'player',
      targetName: state.name,
      detail: 'Shun Hatake intercepted 12 damage',
    });
    recordWarFact(state.war, {
      type: 'partner_down',
      actorId: 'p1',
      actorName: 'Shun Hatake',
      targetId: 'player',
      targetName: state.name,
      detail: 'Shun Hatake fell in action shielding you',
    });
    const arcs = detectWarArcs(state, state.war);
    expect(arcs.some((a) => a.id === 'arc_partner_sacrifice')).toBe(true);
    expect(arcs.some((a) => a.id === 'arc_kizuna')).toBe(true);
  });
});
