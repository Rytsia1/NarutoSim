import { useCallback, useEffect, useRef, useState } from 'react';
import { ACHIEVEMENT_MAP } from '../data/achievements';
import { ShinobiSim } from '../sim/engine';
import { recordCompletedLifeInMeta, updateMetaFromState } from '../sim/meta';
import type { FocusId, GameState, LifeRecord, MetaState, ScenarioConfig } from '../sim/types';
import { soundEngine } from './audio/soundEngine';
import { SettingsDialog } from './components/SettingsDialog';
import { CinematicFxOverlay, detectFxFromLogEntry, type ActiveFxEvent } from './fx/CinematicFxOverlay';
import { EndingScreen } from './screens/EndingScreen';
import { GameScreen } from './screens/GameScreen';
import { LobbyScreen } from './screens/LobbyScreen';
import { WarScreen } from './screens/WarScreen';
import { loadSettings, saveSettings, type UserSettings } from './settings';
import {
  appendPastLife,
  clearSavedLife,
  loadMetaState,
  loadPastLives,
  loadSavedLife,
  saveCurrentLife,
  saveMetaState,
} from './storage';

type ViewMode = 'lobby' | 'playing';

export function App() {
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
  const [toastTitle, setToastTitle] = useState<string | null>(null);
  const [gameState, setGameState] = useState<GameState>(() => simRef.current!.snapshot());
  const [yearProgress, setYearProgress] = useState(0);
  const [warDayProgress, setWarDayProgress] = useState(0);
  const [warBeatProgress, setWarBeatProgress] = useState(0);

  const metaRef = useRef<MetaState>(meta);
  metaRef.current = meta;
  const settingsRef = useRef<UserSettings>(settings);
  settingsRef.current = settings;
  const lastLogIdRef = useRef<string | null>(null);

  // Apply sound settings + unlock audio on first interaction
  useEffect(() => {
    soundEngine.applySettings(settings);
    saveSettings(settings);
  }, [settings]);

  useEffect(() => {
    const unlockOnce = () => {
      soundEngine.unlock();
      window.removeEventListener('pointerdown', unlockOnce);
      window.removeEventListener('keydown', unlockOnce);
    };
    window.addEventListener('pointerdown', unlockOnce);
    window.addEventListener('keydown', unlockOnce);
    return () => {
      window.removeEventListener('pointerdown', unlockOnce);
      window.removeEventListener('keydown', unlockOnce);
    };
  }, []);

  // Global M shortcut to mute/unmute audio
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key.toLowerCase() === 'm') {
        setSettings((prev) => ({ ...prev, soundEnabled: !prev.soundEnabled }));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Route procedural BGM scene
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
    const names = ids.map((id) => ACHIEVEMENT_MAP[id]?.title ?? id).join(', ');
    setToastTitle(`Achievement Unlocked: ${names}`);
    soundEngine.playSfx('achievement');
  }, []);

  useEffect(() => {
    if (!toastTitle) return;
    const timer = window.setTimeout(() => setToastTitle(null), 3800);
    return () => window.clearTimeout(timer);
  }, [toastTitle]);

  const syncFromSim = useCallback(() => {
    const sim = simRef.current!;
    const snap = sim.snapshot();
    setGameState(snap);
    setYearProgress(sim.yearProgress());
    setWarDayProgress(sim.warDayProgress());
    setWarBeatProgress(sim.warBeatProgress());

    // Detect newly added logs for FX & SFX
    const latest = snap.logs[snap.logs.length - 1];
    if (latest && latest.id !== lastLogIdRef.current) {
      lastLogIdRef.current = latest.id;
      const fxEvent = detectFxFromLogEntry(latest);
      if (fxEvent) {
        if (fxEvent.kind === 'jutsu_clash') soundEngine.playSfx('clash', snap.speed);
        else if (fxEvent.kind === 'bloodline_awaken') soundEngine.playSfx('bloodline', snap.speed);
        else if (fxEvent.kind === 'resolve_burst') soundEngine.playSfx('resolve', snap.speed);
        else soundEngine.playSfx('milestone', snap.speed);

        if (settingsRef.current.fxEnabled) {
          setActiveFx(fxEvent);
        }
      } else if (latest.title === 'End of the Road') {
        soundEngine.playSfx('death');
      }
    }

    const res = updateMetaFromState(metaRef.current, snap);
    if (res.newlyUnlocked.length > 0 || JSON.stringify(res.meta) !== JSON.stringify(metaRef.current)) {
      metaRef.current = res.meta;
      setMeta(res.meta);
      saveMetaState(res.meta);
      showAchievementToasts(res.newlyUnlocked);
    }
  }, [showAchievementToasts]);

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

  // Pause simulation loop while a cinematic FX overlay is active (HOLD)
  useEffect(() => {
    if (view !== 'playing' || activeFx !== null) return;
    let rafId = 0;
    let lastTime = performance.now();

    const frame = (now: number) => {
      const dt = (now - lastTime) / 1000;
      lastTime = now;
      const sim = simRef.current!;
      const st = sim.getState();

      if (!st.paused && !st.pending && (st.phase === 'life' || st.phase === 'retirement' || st.phase === 'war')) {
        sim.tick(dt);
        if (st.phase === 'war') {
          setWarDayProgress(sim.warDayProgress());
          setWarBeatProgress(sim.warBeatProgress());
        } else {
          setYearProgress(sim.yearProgress());
        }
      }
      rafId = requestAnimationFrame(frame);
    };

    rafId = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(rafId);
  }, [view, activeFx]);

  useEffect(() => {
    if (view !== 'playing' || activeFx !== null) return;
    if (!gameState.autoPlay || !gameState.pending || gameState.pending.manual) return;
    const delay = Math.max(450, Math.round(1600 / gameState.speed));
    const timer = window.setTimeout(() => {
      simRef.current?.autoChoice(false);
    }, delay);
    return () => window.clearTimeout(timer);
  }, [view, activeFx, gameState.autoPlay, gameState.pending, gameState.speed]);

  const handleStartNew = (scenario?: ScenarioConfig) => {
    soundEngine.unlock();
    soundEngine.playSfx('milestone');
    lastLogIdRef.current = null;
    simRef.current!.newLife(undefined, scenario);
    syncFromSim();
    setView('playing');
  };

  const handleContinue = () => {
    if (!savedLife) return;
    soundEngine.unlock();
    lastLogIdRef.current = savedLife.logs[savedLife.logs.length - 1]?.id ?? null;
    simRef.current!.load(savedLife);
    syncFromSim();
    setView('playing');
  };

  const handleRefreshStorage = () => {
    setSavedLife(loadSavedLife());
    setHistory(loadPastLives());
    const loadedMeta = loadMetaState();
    metaRef.current = loadedMeta;
    setMeta(loadedMeta);
  };

  const handleResolve = (optId: string, text?: string) => {
    soundEngine.playSfx('click', gameState.speed);
    simRef.current!.resolve(optId, text);
  };

  return (
    <>
      {toastTitle && (
        <div className="ach-toast" role="status" aria-live="polite">
          {toastTitle}
        </div>
      )}

      <CinematicFxOverlay fx={activeFx} onFinish={() => setActiveFx(null)} />

      <SettingsDialog
        open={settingsOpen}
        settings={settings}
        onUpdate={setSettings}
        onClose={() => setSettingsOpen(false)}
      />

      {view === 'lobby' ? (
        <LobbyScreen
          savedLife={savedLife}
          history={history}
          meta={meta}
          animateBackdrop={settings.lobbyAnimationEnabled}
          onContinue={handleContinue}
          onStartNew={handleStartNew}
          onRefreshStorage={handleRefreshStorage}
          onOpenSettings={() => setSettingsOpen(true)}
        />
      ) : gameState.phase === 'posthumous' || gameState.phase === 'ended' ? (
        <EndingScreen
          state={gameState}
          onSubmitLastWords={(words) => simRef.current!.submitLastWords(words)}
          onNewLife={() => handleStartNew()}
          onReturnLobby={() => {
            handleRefreshStorage();
            setView('lobby');
          }}
        />
      ) : gameState.phase === 'war' && gameState.war !== null ? (
        <WarScreen
          state={gameState}
          warDayProgress={warDayProgress}
          warBeatProgress={warBeatProgress}
          onSetSpeed={(sp) => simRef.current!.setSpeed(sp)}
          onTogglePause={() => simRef.current!.togglePause()}
          onToggleAuto={() => simRef.current!.toggleAutoPlay()}
          onSkipWarBeat={() => simRef.current!.stepWarBeat()}
          onResolve={handleResolve}
          onOpenSettings={() => setSettingsOpen(true)}
          onBackToLobby={() => {
            saveCurrentLife(simRef.current!.snapshot());
            handleRefreshStorage();
            setView('lobby');
          }}
        />
      ) : (
        <GameScreen
          state={gameState}
          yearProgress={yearProgress}
          onSetSpeed={(sp) => simRef.current!.setSpeed(sp)}
          onTogglePause={() => simRef.current!.togglePause()}
          onToggleAuto={() => simRef.current!.toggleAutoPlay()}
          onSetFocus={(f: FocusId) => simRef.current!.setFocus(f)}
          onResolve={handleResolve}
          onRetire={() => simRef.current!.retireFromFrontline()}
          onOpenSettings={() => setSettingsOpen(true)}
          onBackToLobby={() => {
            saveCurrentLife(simRef.current!.snapshot());
            handleRefreshStorage();
            setView('lobby');
          }}
        />
      )}
    </>
  );
}
