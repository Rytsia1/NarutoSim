import { VILLAGE_MAP } from '../data/villages';
import { createDefaultMeta } from '../sim/meta';
import type { GameState, LifeRecord, MetaState } from '../sim/types';

const SAVE_KEY = 'narutosim.save.v1';
const HISTORY_KEY = 'narutosim.history.v1';
const META_KEY = 'narutosim.meta.v1';
const MAX_HISTORY = 40;

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

export function sanitizeMetaState(raw: unknown): MetaState {
  const base = createDefaultMeta();
  if (!raw || typeof raw !== 'object') return base;
  const p = raw as Partial<MetaState>;
  return {
    version: typeof p.version === 'number' ? p.version : base.version,
    livesPlayed: typeof p.livesPlayed === 'number' && p.livesPlayed >= 0 ? p.livesPlayed : base.livesPlayed,
    codexRoster: p.codexRoster && typeof p.codexRoster === 'object' ? { ...p.codexRoster } : {},
    codexBloodlines: p.codexBloodlines && typeof p.codexBloodlines === 'object' ? { ...p.codexBloodlines } : {},
    codexDisciplines: p.codexDisciplines && typeof p.codexDisciplines === 'object' ? { ...p.codexDisciplines } : {},
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

export function loadSavedLife(): GameState | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isValidGameState(parsed) ? parsed : null;
  } catch {
    return null;
  }
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
    if (parsed.currentSave === null) {
      clearSavedLife();
    } else if (parsed.currentSave !== undefined) {
      if (!isValidGameState(parsed.currentSave)) {
        return { ok: false, message: 'Current save payload is malformed or corrupted.' };
      }
      saveCurrentLife(parsed.currentSave);
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
    return { ok: true, message: 'Save archive imported cleanly.' };
  } catch {
    return { ok: false, message: 'Could not read JSON file.' };
  }
}
