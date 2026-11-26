import { rewriteOrphanText } from '../../data/i18n';
import { ORIGIN_MAP } from '../../data/origins';
import { clamp, getChakraCap } from '../powers';
import type {
  CheckResultChip,
  GameState,
  LogEntry,
  ShinobiMemory,
  StatDeltaChip,
  StatKey,
  Stats,
} from '../types';

export const STAT_LABELS: Record<StatKey, string> = {
  chakra: 'Chakra',
  intel: 'Intel',
  will: 'Will',
  bonds: 'Bonds',
  health: 'Health',
  ryo: 'Ryo',
};

// C29: Display Ryo scaled x1,000 while keeping internal 0..100 stat math intact
export function formatRyo(ryo: number): string {
  return `${(Math.round(ryo) * 1000).toLocaleString()} Ryo`;
}

export function formatRyoDelta(delta: number): string {
  const scaled = Math.round(delta) * 1000;
  return `${scaled > 0 ? '+' : ''}${scaled.toLocaleString()} Ryo`;
}

// D10: Era calendar relative to the Third Shinobi War (falls back cleanly for legacy 1968+ saves)
export function formatEraYear(year: number, compact = true): string {
  if (year >= 1900) return `Year ${year}`;
  return compact ? `Year ${year} Post-3rd War` : `Year ${year} After the Third Shinobi War`;
}

export function formatEraRange(birthYear: number, deathYear: number): string {
  if (birthYear >= 1900) return `${birthYear} to ${deathYear}`;
  return `Year ${birthYear} to Year ${deathYear} Post-3rd War`;
}

let chronicleLogCounter = 0;

export function pushLog(
  state: GameState,
  tone: LogEntry['tone'],
  text: string,
  opts?: { title?: string; deltas?: StatDeltaChip[]; checks?: CheckResultChip[] },
): LogEntry {
  const isOrphan = ORIGIN_MAP[state.originId].isOrphan;
  const entry: LogEntry = {
    id: `log_${state.rng.seed}_${state.age}_${++chronicleLogCounter}`,
    age: state.age,
    year: state.birthYear + state.age,
    tone,
    title: opts?.title,
    text: rewriteOrphanText(text, isOrphan),
    deltas: opts?.deltas && opts.deltas.length > 0 ? opts.deltas : undefined,
    checks: opts?.checks && opts.checks.length > 0 ? opts.checks : undefined,
  };
  state.logs.push(entry);
  if (state.logs.length > 260) {
    state.logs.splice(0, state.logs.length - 260);
  }
  return entry;
}

export function snapshotStats(state: GameState): Stats {
  return { ...state.stats };
}

export function clampStats(state: GameState): void {
  const cap = getChakraCap(state);
  state.stats.chakra = clamp(Math.round(state.stats.chakra), 0, cap);
  state.stats.intel = clamp(Math.round(state.stats.intel), 0, 100);
  state.stats.will = clamp(Math.round(state.stats.will), 0, 100);
  state.stats.bonds = clamp(Math.round(state.stats.bonds), 0, 100);
  state.stats.health = clamp(Math.round(state.stats.health), 0, 100);
  state.stats.ryo = clamp(Math.round(state.stats.ryo), 0, 100);
}

export function diffStats(before: Stats, after: Stats): StatDeltaChip[] {
  const keys: StatKey[] = ['chakra', 'intel', 'will', 'bonds', 'health', 'ryo'];
  const chips: StatDeltaChip[] = [];
  for (const k of keys) {
    const delta = after[k] - before[k];
    if (delta !== 0) {
      chips.push({ stat: k, label: STAT_LABELS[k], delta });
    }
  }
  return chips;
}

export function recordMemory(
  state: GameState,
  tag: ShinobiMemory['tag'],
  text: string,
): void {
  if (!state.memories) state.memories = [];
  state.memories.push({ age: state.age, tag, text });
  if (state.memories.length > 12) {
    state.memories.splice(0, state.memories.length - 12);
  }
}
