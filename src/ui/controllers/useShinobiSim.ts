import { useCallback, useEffect, useRef, useState } from 'react';
import { ACHIEVEMENT_MAP } from '../../data/achievements';
import type { GovernanceActionId } from '../../data/events-politics';
import { ShinobiSim } from '../../sim/engine';
import { recordCompletedLifeInMeta, updateMetaFromState } from '../../sim/meta';
import type {
  FocusId,
  GameState,
  LifeRecord,
  MetaState,
  OdActionId,
  ScenarioConfig,
} from '../../sim/types';
import { soundEngine } from '../audio/soundEngine';
import { pickHighestPriorityFx, type ActiveFxEvent } from '../fx/CinematicFxOverlay';
import { loadSettings, saveSettings, type UserSettings } from '../settings';
import {
  appendPastLife,
  clearSavedLife,
  loadMetaState,
  loadPastLives,
  loadSavedLife,
  saveCurrentLife,
  saveMetaState,
} from '../storage';

export type ViewMode = 'lobby' | 'playing';

/**
 * Presentation Layer Simulation Controller Hook.
 * Encapsulates the RAF clock, Auto-Play timer, audio/FX triggers, storage hooks,
 * and command dispatchers so React screens remain pure presentation components.
 */
export function useShinobiSim() {
  const simRef = useRef<ShinobiSim | null>(null);
  if (!simRef.current) {
    simRef.current = new ShinobiSim();
  }

  const [view, setView] = useState<ViewMode>('lobby');
  const [savedLife, setSavedLife] = useState<GameState | null>(() => loadSavedLife());
  const [history, setHistory] = useState<LifeRecord[]>(() => loadPastLives());
  const [meta, setMeta] = useState<MetaState>(() => loadMetaState());
  const [settings, setSettings] = useState<UserSettings>(() => loadSettings());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [activeFx, setActiveFx] = useState<ActiveFxEvent | null>(null);
  const [battleMinimized, setBattleMinimized] = useState(false);
  const [decisionMinimized, setDecisionMinimized] = useState(false);
  const [toastQueue, setToastQueue] = useState<string[]>([]);
  const [gameState, setGameState] = useState<GameState>(() => simRef.current!.snapshot());
  const [yearProgress, setYearProgress] = useState(0);
  const [warDayProgress, setWarDayProgress] = useState(0);
  const [warBeatProgress, setWarBeatProgress] = useState(0);

  const metaRef = useRef<MetaState>(meta);
  metaRef.current = meta;
  const settingsRef = useRef<UserSettings>(settings);
  settingsRef.current = settings;
  const lastLogIdRef = useRef<string | null>(null);
  const lastDecisionIdRef = useRef<string | null>(null);
  const yearPctRef = useRef<number>(-1);
  const warDayPctRef = useRef<number>(-1);
  const warBeatPctRef = useRef<number>(-1);

  const currentToast = toastQueue[0] ?? null;

  useEffect(() => {
    soundEngine.applySettings(settings);
    saveSettings(settings);
  }, [settings]);

  useEffect(() => {
    const onInteract = () => {
      soundEngine.unlock();
    };
    window.addEventListener('pointerdown', onInteract, { passive: true });
    window.addEventListener('keydown', onInteract, { passive: true });
    return () => {
      window.removeEventListener('pointerdown', onInteract);
      window.removeEventListener('keydown', onInteract);
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key.toLowerCase() === 'm') {
        setSettings((prev) => ({ ...prev, soundEnabled: !prev.soundEnabled }));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (view === 'lobby') {
      soundEngine.setScene('lobby');
    } else if (gameState.phase === 'posthumous' || gameState.phase === 'ended' || gameState.phase === 'retirement') {
      soundEngine.setScene('epilogue');
    } else if (gameState.phase === 'war') {
      soundEngine.setScene(gameState.war?.isCrisisWar ? 'crisis' : 'war');
    } else {
      soundEngine.setScene('life');
    }
  }, [view, gameState.phase, gameState.war?.isCrisisWar]);

  const showAchievementToasts = useCallback((ids: string[]) => {
    if (ids.length === 0) return;
    const messages = ids.map((id) => `Achievement Unlocked: ${ACHIEVEMENT_MAP[id]?.title ?? id}`);
    setToastQueue((prev) => [...prev, ...messages]);
    soundEngine.playSfx('achievement');
  }, []);

  useEffect(() => {
    if (!currentToast) return;
    const timer = window.setTimeout(() => {
      setToastQueue((prev) => prev.slice(1));
    }, 3400);
    return () => window.clearTimeout(timer);
  }, [currentToast]);

  const syncProgressQuantized = useCallback((sim: ShinobiSim) => {
    const yPct = Math.round(sim.yearProgress() * 100);
    if (yPct !== yearPctRef.current) {
      yearPctRef.current = yPct;
      setYearProgress(yPct / 100);
    }
    const wdPct = Math.round(sim.warDayProgress() * 100);
    if (wdPct !== warDayPctRef.current) {
      warDayPctRef.current = wdPct;
      setWarDayProgress(wdPct / 100);
    }
    const wbPct = Math.round(sim.warBeatProgress() * 100);
    if (wbPct !== warBeatPctRef.current) {
      warBeatPctRef.current = wbPct;
      setWarBeatProgress(wbPct / 100);
    }
  }, []);

  const syncFromSim = useCallback(() => {
    const sim = simRef.current!;
    const snap = sim.snapshot();
    setGameState(snap);
    syncProgressQuantized(sim);

    if (snap.pending?.kind !== 'war_battle_round') {
      setBattleMinimized(false);
    }
    const nextPendingId = snap.pending?.id ?? null;
    if (nextPendingId !== lastDecisionIdRef.current) {
      lastDecisionIdRef.current = nextPendingId;
      setDecisionMinimized(false);
    }

    const logs = snap.logs;
    if (logs.length > 0) {
      const prevIdx = lastLogIdRef.current
        ? logs.findIndex((l) => l.id === lastLogIdRef.current)
        : logs.length - 1;
      const newLogs = prevIdx >= 0 ? logs.slice(prevIdx + 1) : logs.slice(-6);
      lastLogIdRef.current = logs[logs.length - 1].id;

      if (newLogs.length > 0) {
        const fxEvent = pickHighestPriorityFx(newLogs);
        if (fxEvent) {
          if (fxEvent.kind === 'jutsu_clash') soundEngine.playSfx('clash', snap.speed);
          else if (fxEvent.kind === 'bloodline_awaken') soundEngine.playSfx('bloodline', snap.speed);
          else if (fxEvent.kind === 'resolve_burst') soundEngine.playSfx('resolve', snap.speed);
          else soundEngine.playSfx('milestone', snap.speed);

          if (settingsRef.current.fxEnabled) {
            setActiveFx(fxEvent);
          }
        } else if (newLogs.some((l) => l.title === 'End of the Road')) {
          soundEngine.playSfx('death');
        }
      }
    }

    const res = updateMetaFromState(metaRef.current, snap);
    if (res.newlyUnlocked.length > 0 || JSON.stringify(res.meta) !== JSON.stringify(metaRef.current)) {
      metaRef.current = res.meta;
      setMeta(res.meta);
      saveMetaState(res.meta);
      showAchievementToasts(res.newlyUnlocked);
    }
  }, [showAchievementToasts, syncProgressQuantized]);

  useEffect(() => {
    const sim = simRef.current!;
    sim.setHooks({
      onStateChange: () => syncFromSim(),
      onSave: (st) => {
        saveCurrentLife(st);
        setSavedLife(st.phase === 'ended' ? null : structuredClone(st));
      },
      onEnd: (rec) => {
        const nextHistory = appendPastLife(rec);
        setHistory(nextHistory);
        const completed = recordCompletedLifeInMeta(metaRef.current, sim.snapshot());
        metaRef.current = completed.meta;
        setMeta(completed.meta);
        saveMetaState(completed.meta);
        showAchievementToasts(completed.newlyUnlocked);
        clearSavedLife();
        setSavedLife(null);
      },
    });
  }, [syncFromSim, showAchievementToasts]);

  useEffect(() => {
    if (view !== 'playing' || activeFx !== null || settingsOpen) return;
    let rafId = 0;
    let lastTime = performance.now();

    const frame = (now: number) => {
      const dt = (now - lastTime) / 1000;
      lastTime = now;
      const sim = simRef.current!;
      const st = sim.getState();

      if (!st.paused && !st.pending && (st.phase === 'life' || st.phase === 'retirement' || st.phase === 'war')) {
        sim.tick(dt);
        syncProgressQuantized(sim);
      }
      rafId = requestAnimationFrame(frame);
    };

    rafId = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(rafId);
  }, [view, activeFx, settingsOpen, syncProgressQuantized]);

  useEffect(() => {
    if (view !== 'playing' || activeFx !== null || settingsOpen || battleMinimized || decisionMinimized) return;
    if (gameState.paused || !gameState.autoPlay || !gameState.pending || gameState.pending.manual) return;
    const delay = Math.max(450, Math.round(1600 / gameState.speed));
    const timer = window.setTimeout(() => {
      simRef.current?.autoChoice(false);
    }, delay);
    return () => window.clearTimeout(timer);
  }, [
    view,
    activeFx,
    settingsOpen,
    battleMinimized,
    decisionMinimized,
    gameState.paused,
    gameState.autoPlay,
    gameState.pending,
    gameState.speed,
  ]);

  const refreshStorage = useCallback(() => {
    setSavedLife(loadSavedLife());
    setHistory(loadPastLives());
    const loadedMeta = loadMetaState();
    metaRef.current = loadedMeta;
    setMeta(loadedMeta);
  }, []);

  const startNew = useCallback((scenario?: ScenarioConfig) => {
    soundEngine.unlock();
    soundEngine.playSfx('milestone');
    setActiveFx(null);
    setBattleMinimized(false);
    setDecisionMinimized(false);
    lastDecisionIdRef.current = null;
    lastLogIdRef.current = null;
    simRef.current!.newLife(undefined, scenario);
    setView('playing');
  }, []);

  const continueSaved = useCallback(() => {
    if (!savedLife) return;
    soundEngine.unlock();
    setActiveFx(null);
    setBattleMinimized(false);
    setDecisionMinimized(false);
    lastDecisionIdRef.current = savedLife.pending?.id ?? null;
    lastLogIdRef.current = savedLife.logs[savedLife.logs.length - 1]?.id ?? null;
    simRef.current!.load(savedLife);
    setView('playing');
  }, [savedLife]);

  const resolve = useCallback((optionId: string, freeText?: string, odAction?: OdActionId) => {
    soundEngine.playSfx('click', simRef.current!.getState().speed);
    simRef.current!.resolve(optionId, freeText, odAction);
  }, []);

  const setSpeed = useCallback((sp: 1 | 2 | 4 | 8) => {
    simRef.current!.setSpeed(sp);
  }, []);

  const togglePause = useCallback(() => {
    simRef.current!.togglePause();
  }, []);

  const toggleAuto = useCallback(() => {
    simRef.current!.toggleAutoPlay();
  }, []);

  const setFocus = useCallback((f: FocusId) => {
    simRef.current!.setFocus(f);
  }, []);

  const retire = useCallback(() => {
    simRef.current!.retireFromFrontline();
  }, []);

  const callSummit = useCallback(() => {
    soundEngine.playSfx('milestone', simRef.current!.getState().speed);
    simRef.current!.callDiplomaticSummit();
  }, []);

  const investigateTimeline = useCallback((eventId: string) => {
    const res = simRef.current!.investigateTimeline(eventId);
    if (res.revealed) {
      soundEngine.playSfx('milestone', simRef.current!.getState().speed);
    }
  }, []);

  const governanceAction = useCallback((actionId: GovernanceActionId) => {
    const ok = simRef.current!.executeGovernanceAction(actionId);
    if (ok) {
      soundEngine.playSfx('milestone', simRef.current!.getState().speed);
    }
  }, []);

  const skipWarBeat = useCallback(() => {
    simRef.current!.stepWarBeat();
  }, []);

  const submitLastWords = useCallback((words: string) => {
    simRef.current!.submitLastWords(words);
  }, []);

  const backToLobby = useCallback(() => {
    setActiveFx(null);
    setBattleMinimized(false);
    setDecisionMinimized(false);
    lastDecisionIdRef.current = null;
    saveCurrentLife(simRef.current!.snapshot());
    refreshStorage();
    setView('lobby');
  }, [refreshStorage]);

  const returnLobbyFromEnding = useCallback(() => {
    setActiveFx(null);
    refreshStorage();
    setView('lobby');
  }, [refreshStorage]);

  return {
    view,
    savedLife,
    history,
    meta,
    settings,
    setSettings,
    settingsOpen,
    setSettingsOpen,
    activeFx,
    setActiveFx,
    battleMinimized,
    setBattleMinimized,
    decisionMinimized,
    setDecisionMinimized,
    currentToast,
    gameState,
    yearProgress,
    warDayProgress,
    warBeatProgress,
    actions: {
      refreshStorage,
      startNew,
      continueSaved,
      resolve,
      setSpeed,
      togglePause,
      toggleAuto,
      setFocus,
      retire,
      callSummit,
      investigateTimeline,
      governanceAction,
      skipWarBeat,
      submitLastWords,
      backToLobby,
      returnLobbyFromEnding,
    },
  };
}
