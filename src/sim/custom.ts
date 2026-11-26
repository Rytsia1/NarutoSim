import { CLAN_MAP } from '../data/clans';
import { DRAWBACK_MAP } from '../data/drawbacks';
import { JUTSU_MAP } from '../data/jutsu';
import { ORIGIN_MAP } from '../data/origins';
import { BLOODLINE_MAP, DISCIPLINE_MAP } from '../data/powers';
import { SUMMON_CLAN_MAP } from '../data/summons';
import { clampStats } from './history/chronicle';
import { getChakraCap, getStatCap, MANGEKYO_ART_POOL } from './powers';
import type {
  ChakraElement,
  CustomBuildConfig,
  DisciplineProgress,
  DrawbackId,
  GameState,
  MangekyoArtId,
  StatKey,
} from './types';
import { BIJUU_LIST } from './world';

export const CUSTOM_BUDGET = 12;
export const MAX_FREE_DISCIPLINES = 5;
export const MAX_MANGEKYO_ARTS = 2;

/**
 * Canon clan ownership rules for Kekkei Genkai in Point-Buy mode.
 * Free Mode bypasses these rules for sandbox builds.
 */
export const BLOODLINE_REQUIRED_CLANS: Record<string, readonly string[]> = {
  sharingan: ['uchiha'],
  byakugan: ['hyuga'],
  ketsuryugan: ['chinoike'],
  mokuton: ['senju'],
  shikotsumyaku: ['kaguya'],
  uzumaki_chains: ['uzushio_seal_keepers'],
};

export const EVENT_ONLY_BIRTH_BLOODLINES = new Set(['rinne_eye', 'sage_body']);
const RARE_MUTATION_BLOODLINES = new Set(['hyoton', 'yoton', 'jiton']);
const VALID_ELEMENTS: ReadonlySet<ChakraElement> = new Set(['fire', 'wind', 'lightning', 'earth', 'water']);

export function isBloodlineAllowedForClan(
  bloodlineId: string,
  clanId?: string | null,
): { allowed: boolean; reason?: string } {
  if (EVENT_ONLY_BIRTH_BLOODLINES.has(bloodlineId)) {
    const bName = BLOODLINE_MAP[bloodlineId]?.name ?? bloodlineId;
    return {
      allowed: false,
      reason: `${bName} cannot be selected at birth in Point-Buy mode (event-only or Free Mode).`,
    };
  }

  const requiredClans = BLOODLINE_REQUIRED_CLANS[bloodlineId];
  if (requiredClans) {
    if (!clanId || !requiredClans.includes(clanId)) {
      const bName = BLOODLINE_MAP[bloodlineId]?.name ?? bloodlineId;
      const clanNames = requiredClans.map((id) => CLAN_MAP[id]?.name ?? id).join(' or ');
      return {
        allowed: false,
        reason: `${bName} requires belonging to the ${clanNames}.`,
      };
    }
    return { allowed: true };
  }

  // Elemental KG (Hyoton, Yoton, Jiton): allowed for matching clan OR clanless rare mutation,
  // but rejected if paired with a clan that owns a different Kekkei Genkai.
  if (RARE_MUTATION_BLOODLINES.has(bloodlineId) && clanId) {
    const clan = CLAN_MAP[clanId];
    if (clan?.bloodlineId && clan.bloodlineId !== bloodlineId) {
      const bName = BLOODLINE_MAP[bloodlineId]?.name ?? bloodlineId;
      return {
        allowed: false,
        reason: `${bName} does not match ${clan.name}'s bloodline lineage.`,
      };
    }
  }

  return { allowed: true };
}

export function isDisciplineAllowedForClan(
  disciplineId: string,
  clanId?: string | null,
): { allowed: boolean; reason?: string } {
  if (disciplineId === 'gentle_fist' && clanId !== 'hyuga') {
    return {
      allowed: false,
      reason: 'Gentle Fist (Juken) is restricted to the Hyuga Clan in Point-Buy mode.',
    };
  }
  return { allowed: true };
}

export interface CustomBuildValidation {
  valid: boolean;
  pointsSpent: number;
  budget: number;
  drawbackBonus: number;
  errors: string[];
}

function getNormalizedStartDisciplines(cfg: CustomBuildConfig): { id: string; level: 1 | 2 | 3 | 4 }[] {
  const raw =
    cfg.startDisciplines && cfg.startDisciplines.length > 0
      ? cfg.startDisciplines
      : cfg.startDisciplineId
        ? [{ id: cfg.startDisciplineId, level: cfg.startDisciplineLevel ?? 1 }]
        : [];
  const seen = new Set<string>();
  const out: { id: string; level: 1 | 2 | 3 | 4 }[] = [];
  for (const item of raw) {
    if (!item.id || seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }
  return out;
}

/**
 * Evaluates a Custom Shinobi Build (Point-Buy with optional Drawbacks or Free Mode Build Kombo):
 * - Single Bloodline ONLY (no Dual Bloodline / Chimera).
 * - Free Mode supports up to 5 disciplines (with tiers), up to 5 elements, Sharingan MS/EMS,
 *   Kuchiyose contracts, Jinchuriki vessel, Signature Jutsu Picker, Transcendent Cap (150/200),
 *   and Growth Multiplier (1x/2x/5x).
 * - Point-Buy allows Drawbacks (+3 to +5 bonus points each), optional Kuchiyose (+4 pts),
 *   and optional 1 secondary element (+3 pts).
 */
export function evaluateCustomBuild(cfg: CustomBuildConfig): CustomBuildValidation {
  const errors: string[] = [];
  const origin = ORIGIN_MAP[cfg.originId];
  let points = 0;

  // Drawbacks / Curses grant +3..+5 bonus points in Point-Buy mode
  const uniqueDrawbacks: DrawbackId[] = [];
  let drawbackBonus = 0;
  for (const dId of cfg.drawbacks ?? []) {
    const def = DRAWBACK_MAP[dId];
    if (!def) {
      errors.push(`Unknown drawback "${dId}".`);
      continue;
    }
    if (!uniqueDrawbacks.includes(dId)) {
      uniqueDrawbacks.push(dId);
      drawbackBonus += def.bonusPoints;
    }
  }
  const effectiveBudget = CUSTOM_BUDGET + drawbackBonus;

  // C4: In Point-Buy mode, civilian/war_orphan origins cannot pick a shinobi clan
  if (cfg.mode !== 'free' && (cfg.originId === 'civilian' || cfg.originId === 'war_orphan') && cfg.clanId) {
    errors.push(`${origin.name} origin cannot select a noble shinobi clan in Point-Buy mode.`);
  }

  // Capacity above origin max costs 3 pts per tier; lowering is free (0 pts)
  const maxOriginCap = origin.capacityRange[1];
  if (cfg.capacity > maxOriginCap) {
    points += (cfg.capacity - maxOriginCap) * 3;
  }

  // Secondary chakra elements
  const secElements = (cfg.secondaryElements ?? []).filter((e) => e !== cfg.element && VALID_ELEMENTS.has(e));
  if (cfg.mode === 'points') {
    if (secElements.length > 1) {
      errors.push('Point-Buy mode allows at most 1 secondary chakra element (use Free Mode for up to all 5).');
    } else if (secElements.length === 1) {
      points += 3;
    }
  }

  // Positive stat offsets cost ceil(offset / 5) pts; negative offsets cost 0 (fix I3)
  const statKeys: StatKey[] = ['chakra', 'intel', 'will', 'bonds', 'health', 'ryo'];
  const maxDirectStat = cfg.mode === 'free' && cfg.transcendentCap ? 150 : 100;
  const maxDirectChakra = cfg.mode === 'free' && cfg.transcendentCap ? 200 : cfg.jinchurikiBijuu ? 147 : 100;
  if (cfg.mode === 'free' && cfg.directStats) {
    for (const k of statKeys) {
      const val = cfg.directStats[k];
      const maxForKey = k === 'chakra' ? maxDirectChakra : maxDirectStat;
      if (val !== undefined && (val < 0 || val > maxForKey)) {
        errors.push(`${k} must be between 0 and ${maxForKey}.`);
      }
    }
  } else {
    for (const k of statKeys) {
      const off = cfg.statOffsets[k] ?? 0;
      if (cfg.mode === 'points' && off > 25) {
        errors.push(`${k} bonus cannot exceed +25.`);
      }
      if (cfg.mode === 'points' && off < -20) {
        errors.push(`${k} reduction cannot be below -20.`);
      }
      if (off > 0) {
        points += Math.ceil(off / 5);
      }
    }
  }

  // Starting disciplines validation
  const startDiscs = getNormalizedStartDisciplines(cfg);
  if (cfg.mode === 'points' && startDiscs.length > 1) {
    errors.push('Point-Buy mode allows at most 1 starting discipline (use Free Mode for Build Kombo).');
  }
  if (cfg.mode === 'free' && startDiscs.length > MAX_FREE_DISCIPLINES) {
    errors.push(`Free Mode allows up to ${MAX_FREE_DISCIPLINES} starting disciplines.`);
  }
  for (const item of startDiscs) {
    const def = DISCIPLINE_MAP[item.id];
    if (!def) {
      errors.push(`Unknown starting discipline "${item.id}".`);
    } else if (cfg.mode === 'points' && (def.id === 'senjutsu' || def.id === 'space_time')) {
      errors.push(`${def.name} cannot be chosen as a childhood starting discipline.`);
    } else {
      if (cfg.mode === 'points') {
        const discGate = isDisciplineAllowedForClan(def.id, cfg.clanId);
        if (!discGate.allowed && discGate.reason) {
          errors.push(discGate.reason);
        }
      }
      const isFamilyDiscount =
        origin.familyDisciplines.includes(def.id) || (def.id === 'gentle_fist' && cfg.clanId === 'hyuga');
      points += isFamilyDiscount ? 1 : 3;
    }
  }

  // Guaranteed single Kekkei Genkai (strictly 1 bloodline; no dual bloodline / chimera)
  if (cfg.latentBloodlineId) {
    const bDef = BLOODLINE_MAP[cfg.latentBloodlineId];
    if (!bDef) {
      errors.push('Unknown Kekkei Genkai selected.');
    } else {
      if (cfg.mode === 'points') {
        const blGate = isBloodlineAllowedForClan(bDef.id, cfg.clanId);
        if (!blGate.allowed && blGate.reason) {
          errors.push(blGate.reason);
        }
      }
      if (bDef.id === 'rinne_eye') {
        points += 9;
      } else if (bDef.id === 'mokuton' || bDef.id === 'sharingan') {
        points += 6;
      } else {
        points += 4;
      }
    }
  }

  // Sharingan Mangekyo / EMS validation (Free Mode only)
  if ((cfg.mangekyoAwakened || cfg.eternalMangekyo) && cfg.latentBloodlineId !== 'sharingan') {
    errors.push('Mangekyo Sharingan and Eternal Mangekyo require Sharingan as your bloodline.');
  }
  if (cfg.mode === 'points' && (cfg.mangekyoAwakened || cfg.eternalMangekyo)) {
    errors.push('Mangekyo Sharingan and Eternal Mangekyo start options are Free Mode exclusive.');
  }
  if (cfg.mangekyoArts && cfg.mangekyoArts.length > MAX_MANGEKYO_ARTS) {
    errors.push(`Select at most ${MAX_MANGEKYO_ARTS} Mangekyo Sharingan arts.`);
  }

  // Kuchiyose summoning contract
  if (cfg.summonClanId) {
    if (!SUMMON_CLAN_MAP[cfg.summonClanId]) {
      errors.push('Unknown Kuchiyose summoning clan selected.');
    } else if (cfg.mode === 'points') {
      points += 4;
    }
  }

  // Free Mode exclusive toggles validation
  if (cfg.mode === 'points') {
    if (cfg.jinchurikiBijuu) {
      errors.push('Jinchuriki vessel option is available in Free Mode.');
    }
    if (cfg.signatureJutsuIds && cfg.signatureJutsuIds.length > 0) {
      errors.push('Starting Signature Jutsu Picker is available in Free Mode.');
    }
    if (cfg.transcendentCap) {
      errors.push('Transcendent Cap (150 / 200) is available in Free Mode.');
    }
    if (cfg.growthMult && cfg.growthMult !== 1) {
      errors.push('Growth Multiplier (2x / 5x) is available in Free Mode.');
    }
  }

  if (cfg.jinchurikiBijuu && !BIJUU_LIST.includes(cfg.jinchurikiBijuu)) {
    errors.push('Selected Bijuu is not in the Tailed Beast registry.');
  }

  if (cfg.mode === 'points' && points > effectiveBudget) {
    errors.push(
      `Build uses ${points} points (budget is ${effectiveBudget}). Add a Drawback, lower perks, or switch to Free Mode.`,
    );
  }

  return {
    valid: errors.length === 0,
    pointsSpent: points,
    budget: effectiveBudget,
    drawbackBonus,
    errors,
  };
}

export function applyCustomBuild(state: GameState, cfg: CustomBuildConfig): void {
  const check = evaluateCustomBuild(cfg);
  state.flags.custom_run = true;
  state.originId = cfg.originId;
  state.villageId = cfg.villageId;
  if (cfg.clanId && CLAN_MAP[cfg.clanId]?.villageId === cfg.villageId) {
    state.clanId = cfg.clanId;
  } else if (cfg.clanId === '') {
    state.clanId = null;
  }
  state.sex = cfg.sex;
  if (cfg.name.trim()) state.name = cfg.name.trim();
  const cleanEpithet = cfg.epithet?.trim().slice(0, 36);
  if (cleanEpithet) {
    state.epithet = cleanEpithet;
  }
  state.capacity = cfg.capacity;
  state.element = cfg.element;

  // Secondary chakra elements (up to 1 in Point-Buy, up to 4 extra in Free Mode)
  const uniqueSec: ChakraElement[] = [];
  for (const el of cfg.secondaryElements ?? []) {
    if (el !== cfg.element && VALID_ELEMENTS.has(el) && !uniqueSec.includes(el)) {
      uniqueSec.push(el);
    }
  }
  if (uniqueSec.length > 0) {
    state.secondaryElements = cfg.mode === 'free' ? uniqueSec.slice(0, 4) : uniqueSec.slice(0, 1);
  }

  // Sandbox Transcendent Cap & Growth Multiplier (Free Mode)
  if (cfg.mode === 'free' && (cfg.transcendentCap || (cfg.growthMult && cfg.growthMult !== 1))) {
    state.sandbox = {
      transcendentCap: Boolean(cfg.transcendentCap),
      growthMult: cfg.growthMult === 2 || cfg.growthMult === 5 ? cfg.growthMult : 1,
    };
  }

  // Jinchuriki Vessel (Free Mode) — must apply BEFORE stat clamp so Chakra Cap bonus takes effect
  if (cfg.mode === 'free' && cfg.jinchurikiBijuu && BIJUU_LIST.includes(cfg.jinchurikiBijuu)) {
    const ostracized = Boolean(cfg.jinchurikiOstracized);
    state.jinchuriki = {
      bijuuName: cfg.jinchurikiBijuu,
      ostracized,
      harmony: ostracized ? 20 : 55,
    };
    if (ostracized && !cfg.directStats?.bonds) {
      state.stats.bonds = Math.max(5, state.stats.bonds - 15);
    }
  }

  // Drawbacks / Curses
  const validDrawbacks = (cfg.drawbacks ?? []).filter((d): d is DrawbackId => Boolean(DRAWBACK_MAP[d]));
  if (validDrawbacks.length > 0) {
    state.drawbacks = [...new Set(validDrawbacks)];
    if (state.drawbacks.includes('caged_bird')) {
      state.flags.caged_bird_drawback = true;
      if (state.clanHeritage) {
        state.clanHeritage.cagedBirdSealed = true;
      }
    }
    if (state.drawbacks.includes('illness')) {
      state.flags.terminal_illness = true;
    }
  }

  // Multi-discipline Build Kombo (up to 5 in Free Mode; 1 in Point-Buy)
  const startDiscs = getNormalizedStartDisciplines(cfg);
  const builtDiscs: DisciplineProgress[] = [];
  const discCap = cfg.mode === 'free' ? MAX_FREE_DISCIPLINES : 1;
  for (const item of startDiscs.slice(0, discCap)) {
    const def = DISCIPLINE_MAP[item.id];
    if (!def) continue;
    const allowed = cfg.mode === 'free' || (def.id !== 'senjutsu' && def.id !== 'space_time');
    if (!allowed) continue;
    const startLvl =
      cfg.mode === 'free'
        ? (Math.max(1, Math.min(def.maxLevel, item.level)) as 1 | 2 | 3 | 4)
        : 1;
    builtDiscs.push({
      id: def.id,
      level: startLvl,
      xp: 0,
      lastLevelAge: 0,
      quality: 1,
      isMain: builtDiscs.length === 0,
      declinedUntilAge: 0,
    });
  }
  if (builtDiscs.length > 0) {
    state.disciplines = builtDiscs;
  }

  // Single Bloodline + Sharingan Mangekyo / Eternal Mangekyo
  if (cfg.latentBloodlineId && BLOODLINE_MAP[cfg.latentBloodlineId]) {
    const bDef = BLOODLINE_MAP[cfg.latentBloodlineId];
    const defaultStage = bDef.id === 'byakugan' && state.clanId === 'hyuga' ? 'awakened' : 'latent';
    let startStage = cfg.mode === 'free' && cfg.startBloodlineStage ? cfg.startBloodlineStage : defaultStage;
    const isSharingan = bDef.id === 'sharingan';
    const enableMs = cfg.mode === 'free' && isSharingan && Boolean(cfg.mangekyoAwakened || cfg.eternalMangekyo);
    const enableEms = cfg.mode === 'free' && isSharingan && Boolean(cfg.eternalMangekyo);
    if (enableMs && (startStage === 'latent' || startStage === 'awakened' || startStage === 'ctrl1')) {
      startStage = 'ctrl2';
    }
    const startGrade = startStage === 'mastered' || enableEms ? bDef.gradeRange[1] : bDef.gradeRange[0];

    let pickedMsArts: MangekyoArtId[] | undefined;
    if (enableMs) {
      const cleaned = (cfg.mangekyoArts ?? []).filter((a): a is MangekyoArtId =>
        (MANGEKYO_ART_POOL as readonly string[]).includes(a),
      );
      const uniqueArts = [...new Set(cleaned)].slice(0, MAX_MANGEKYO_ARTS);
      pickedMsArts = uniqueArts.length > 0 ? uniqueArts : ['amaterasu', 'tsukuyomi'];
    }

    state.bloodline = {
      id: bDef.id,
      grade: startGrade,
      stage: startStage,
      lastEventAge: 0,
      declined: false,
      eyeStrain: 0,
      mangekyoAwakened: enableMs || undefined,
      mangekyoArts: pickedMsArts,
      eternalMangekyo: enableEms || undefined,
      blinded: false,
    };
  } else if (check.valid && cfg.latentBloodlineId === undefined) {
    // Keep natural rolled bloodline for the selected custom origin & clan
  }

  // Kuchiyose Summoning Contract
  if (cfg.summonClanId && SUMMON_CLAN_MAP[cfg.summonClanId]) {
    state.summonContract = {
      clanId: cfg.summonClanId,
      contractedAge: 0,
      fitScore: 75,
      summonUses: 0,
    };
    if (!state.disciplines.some((d) => d.id === 'summoning')) {
      state.disciplines.push({
        id: 'summoning',
        level: 1,
        xp: 0,
        lastLevelAge: 0,
        quality: 1,
        isMain: state.disciplines.length === 0,
        declinedUntilAge: 0,
      });
    }
  }

  // Custom Signature Jutsu Picker (Free Mode)
  if (cfg.mode === 'free' && cfg.signatureJutsuIds && cfg.signatureJutsuIds.length > 0) {
    const validJutsu = [...new Set(cfg.signatureJutsuIds.filter((id) => Boolean(JUTSU_MAP[id])))];
    if (validJutsu.length > 0) {
      state.signatureJutsu = validJutsu;
    }
  }

  // Apply direct stats in Free Mode (respecting Transcendent Cap 150 / Chakra 200) or bounded offsets in Point-Buy
  const statKeys: StatKey[] = ['chakra', 'intel', 'will', 'bonds', 'health', 'ryo'];
  const statCap = getStatCap(state);
  const chakraCap = getChakraCap(state);
  if (cfg.mode === 'free' && cfg.directStats) {
    for (const k of statKeys) {
      const targetVal = cfg.directStats[k];
      if (targetVal !== undefined && Number.isFinite(targetVal)) {
        const keyCap = k === 'chakra' ? chakraCap : statCap;
        state.stats[k] = Math.max(0, Math.min(keyCap, Math.round(targetVal)));
      }
    }
  } else {
    for (const k of statKeys) {
      const rawOff = cfg.statOffsets[k] ?? 0;
      const off = cfg.mode === 'free' ? Math.max(-100, Math.min(100, rawOff)) : Math.max(-20, Math.min(25, rawOff));
      state.stats[k] += off;
    }
  }

  // Enforce final caps
  clampStats(state);
}
