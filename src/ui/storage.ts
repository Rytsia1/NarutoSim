import { VILLAGE_MAP } from '../data/villages';
import { createDefaultMeta, createEmptyCodexStats } from '../sim/meta';
import type { CodexStatEntry, CodexStats, GameState, LifeRecord, MetaState } from '../sim/types';

const SAVE_KEY = 'narutosim.save.v1';
const HISTORY_KEY = 'narutosim.history.v1';
const META_KEY = 'narutosim.meta.v1';
const MAX_HISTORY = 40;

export const CURRENT_SAVE_VERSION = 3;

export const LEGACY_SAVE_RESET_NOTICE =
  'New version (v3): please start a new shinobi life. Your past life history and Hall of Shinobi remain intact.';

export function isLegacySaveVersion(state: Partial<GameState>): boolean {
  return (state.saveVersion ?? 1) < CURRENT_SAVE_VERSION;
}

export function isValidGameState(raw: unknown): raw is GameState {
  if (!raw || typeof raw !== 'object') return false;
  const s = raw as Partial<GameState>;
  return (
    typeof s.age === 'number' &&
    typeof s.name === 'string' &&
    typeof s.villageId === 'string' &&
    Boolean(VILLAGE_MAP[s.villageId as GameState['villageId']]) &&
    Boolean(s.stats && typeof s.stats.chakra === 'number') &&
    Boolean(s.rng && typeof s.rng.seed === 'number') &&
    Array.isArray(s.logs)
  );
}

function sanitizeStatRecord(raw: unknown): Record<string, CodexStatEntry> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, CodexStatEntry> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!v || typeof v !== 'object') continue;
    const e = v as Partial<CodexStatEntry>;
    const encountered = typeof e.encountered === 'number' && Number.isFinite(e.encountered) && e.encountered >= 0 ? Math.floor(e.encountered) : 0;
    const defeated = typeof e.defeated === 'number' && Number.isFinite(e.defeated) && e.defeated >= 0 ? Math.floor(e.defeated) : 0;
    out[k] = { encountered, defeated };
  }
  return out;
}

function sanitizeCodexStats(raw: unknown): CodexStats {
  const empty = createEmptyCodexStats();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return empty;
  const cs = raw as Partial<CodexStats>;
  return {
    byArchetype: sanitizeStatRecord(cs.byArchetype) as CodexStats['byArchetype'],
    byClan: sanitizeStatRecord(cs.byClan),
    byVillage: sanitizeStatRecord(cs.byVillage) as CodexStats['byVillage'],
    byBloodline: sanitizeStatRecord(cs.byBloodline),
    totalEncountered:
      typeof cs.totalEncountered === 'number' && Number.isFinite(cs.totalEncountered) && cs.totalEncountered >= 0
        ? Math.floor(cs.totalEncountered)
        : 0,
    totalDefeated:
      typeof cs.totalDefeated === 'number' && Number.isFinite(cs.totalDefeated) && cs.totalDefeated >= 0
        ? Math.floor(cs.totalDefeated)
        : 0,
  };
}

export function sanitizeMetaState(raw: unknown): MetaState {
  const base = createDefaultMeta();
  if (!raw || typeof raw !== 'object') return base;
  const p = raw as Partial<MetaState>;
  return {
    version: typeof p.version === 'number' ? p.version : base.version,
    livesPlayed: typeof p.livesPlayed === 'number' && p.livesPlayed >= 0 ? p.livesPlayed : base.livesPlayed,
    codexStats: sanitizeCodexStats(p.codexStats),
    codexBloodlines: p.codexBloodlines && typeof p.codexBloodlines === 'object' ? { ...p.codexBloodlines } : {},
    codexDisciplines: p.codexDisciplines && typeof p.codexDisciplines === 'object' ? { ...p.codexDisciplines } : {},
    codexSummons: Array.isArray(p.codexSummons)
      ? p.codexSummons.filter((x): x is NonNullable<MetaState['codexSummons']>[number] => typeof x === 'string')
      : [],
    crisisCleared: {
      calamity: typeof p.crisisCleared?.calamity === 'number' ? p.crisisCleared.calamity : 0,
      mastermind: typeof p.crisisCleared?.mastermind === 'number' ? p.crisisCleared.mastermind : 0,
    },
    convictionEndings: Array.isArray(p.convictionEndings)
      ? p.convictionEndings.filter((x): x is string => typeof x === 'string')
      : [],
    achievements: Array.isArray(p.achievements)
      ? p.achievements.filter((x): x is string => typeof x === 'string')
      : [],
  };
}

export function saveCurrentLife(state: GameState): void {
  try {
    if (state.phase === 'ended') {
      localStorage.removeItem(SAVE_KEY);
      return;
    }
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage quota issues gracefully
  }
}

export interface LoadedLifeResult {
  state: GameState | null;
  legacyCleared: boolean;
  notice: string | null;
}

export function loadSavedLifeWithStatus(): LoadedLifeResult {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return { state: null, legacyCleared: false, notice: null };
    const parsed: unknown = JSON.parse(raw);
    if (!isValidGameState(parsed)) {
      return { state: null, legacyCleared: false, notice: null };
    }
    if (isLegacySaveVersion(parsed)) {
      localStorage.removeItem(SAVE_KEY);
      return {
        state: null,
        legacyCleared: true,
        notice: LEGACY_SAVE_RESET_NOTICE,
      };
    }
    return { state: parsed, legacyCleared: false, notice: null };
  } catch {
    return { state: null, legacyCleared: false, notice: null };
  }
}

export function loadSavedLife(): GameState | null {
  return loadSavedLifeWithStatus().state;
}

export function clearSavedLife(): void {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    // Ignore
  }
}

export function loadPastLives(): LifeRecord[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (r): r is LifeRecord =>
        Boolean(r && typeof r === 'object' && typeof (r as LifeRecord).id === 'string' && typeof (r as LifeRecord).name === 'string'),
    );
  } catch {
    return [];
  }
}

export function appendPastLife(record: LifeRecord): LifeRecord[] {
  const existing = loadPastLives().filter((r) => r.id !== record.id);
  const next = [record, ...existing].slice(0, MAX_HISTORY);
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  } catch {
    // Ignore
  }
  return next;
}

export function loadMetaState(): MetaState {
  try {
    const raw = localStorage.getItem(META_KEY);
    if (!raw) return createDefaultMeta();
    return sanitizeMetaState(JSON.parse(raw));
  } catch {
    return createDefaultMeta();
  }
}

export function saveMetaState(meta: MetaState): void {
  try {
    localStorage.setItem(META_KEY, JSON.stringify(sanitizeMetaState(meta)));
  } catch {
    // Ignore storage errors
  }
}

export interface ExportBundle {
  format: 'narutosim.export.v1';
  exportedAt: string;
  currentSave: GameState | null;
  history: LifeRecord[];
  meta?: MetaState;
}

export function buildExportJson(): string {
  const bundle: ExportBundle = {
    format: 'narutosim.export.v1',
    exportedAt: new Date().toISOString(),
    currentSave: loadSavedLife(),
    history: loadPastLives(),
    meta: loadMetaState(),
  };
  return JSON.stringify(bundle, null, 2);
}

export function importSaveJson(raw: string): { ok: boolean; message: string } {
  try {
    const parsed = JSON.parse(raw) as Partial<ExportBundle>;
    if (!parsed || parsed.format !== 'narutosim.export.v1') {
      return { ok: false, message: 'Unsupported save file format.' };
    }
    let legacySkipped = false;
    if (parsed.currentSave === null) {
      clearSavedLife();
    } else if (parsed.currentSave !== undefined) {
      if (!isValidGameState(parsed.currentSave)) {
        return { ok: false, message: 'Current save payload is malformed or corrupted.' };
      }
      if (isLegacySaveVersion(parsed.currentSave)) {
        clearSavedLife();
        legacySkipped = true;
      } else {
        saveCurrentLife(parsed.currentSave);
      }
    }
    if (Array.isArray(parsed.history)) {
      const validHistory = parsed.history
        .filter(
          (r): r is LifeRecord =>
            Boolean(r && typeof r === 'object' && typeof r.id === 'string' && typeof r.name === 'string'),
        )
        .slice(0, MAX_HISTORY);
      localStorage.setItem(HISTORY_KEY, JSON.stringify(validHistory));
    }
    if (parsed.meta !== undefined) {
      saveMetaState(sanitizeMetaState(parsed.meta));
    }
    return {
      ok: true,
      message: legacySkipped
        ? 'History & Bingo Book Codex imported. Legacy v1 in-progress life skipped; start a new shinobi life.'
        : 'Save archive imported cleanly.',
    };
  } catch {
    return { ok: false, message: 'Could not read JSON file.' };
  }
}
