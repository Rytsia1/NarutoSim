import { createDefaultMeta } from '../sim/meta';
import type { GameState, LifeRecord, MetaState } from '../sim/types';

const SAVE_KEY = 'narutosim.save.v1';
const HISTORY_KEY = 'narutosim.history.v1';
const META_KEY = 'narutosim.meta.v1';
const MAX_HISTORY = 40;

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
    const parsed = JSON.parse(raw) as GameState;
    if (!parsed || typeof parsed.age !== 'number' || !parsed.stats || !parsed.rng) {
      return null;
    }
    return parsed;
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
    const parsed = JSON.parse(raw) as LifeRecord[];
    return Array.isArray(parsed) ? parsed : [];
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
    const parsed = JSON.parse(raw) as Partial<MetaState>;
    return {
      ...createDefaultMeta(),
      ...parsed,
    };
  } catch {
    return createDefaultMeta();
  }
}

export function saveMetaState(meta: MetaState): void {
  try {
    localStorage.setItem(META_KEY, JSON.stringify(meta));
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
    if (parsed.format !== 'narutosim.export.v1') {
      return { ok: false, message: 'Unsupported save file format.' };
    }
    if (parsed.currentSave) {
      saveCurrentLife(parsed.currentSave);
    }
    if (Array.isArray(parsed.history)) {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(parsed.history.slice(0, MAX_HISTORY)));
    }
    if (parsed.meta) {
      saveMetaState({ ...createDefaultMeta(), ...parsed.meta });
    }
    return { ok: true, message: 'Save archive imported cleanly.' };
  } catch {
    return { ok: false, message: 'Could not read JSON file.' };
  }
}
