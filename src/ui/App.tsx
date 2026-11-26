import { useEffect, useRef } from 'react';
import { SettingsDialog } from './components/SettingsDialog';
import { useShinobiSim } from './controllers/useShinobiSim';
import { CinematicFxOverlay } from './fx/CinematicFxOverlay';
import { EndingScreen } from './screens/EndingScreen';
import { GameScreen } from './screens/GameScreen';
import { LobbyScreen } from './screens/LobbyScreen';
import { WarScreen } from './screens/WarScreen';

/**
 * Pure Presentation Layer Root Router.
 * Simulation clock, storage hooks, FX scanning, and command dispatchers
 * live cleanly inside `useShinobiSim`.
 */
export function App() {
  const {
    view,
    savedLife,
    legacyNotice,
    dismissLegacyNotice,
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
    actions,
  } = useShinobiSim();

  const toastRef = useRef<HTMLDivElement | null>(null);

  // Show toast in Browser Top Layer via popover="manual" when supported so it sits above <dialog>
  useEffect(() => {
    const el = toastRef.current as (HTMLDivElement & { showPopover?: () => void; hidePopover?: () => void }) | null;
    if (!el || typeof el.showPopover !== 'function') return;
    try {
      if (currentToast) {
        if (!el.matches(':popover-open')) el.showPopover();
      } else if (el.matches(':popover-open')) {
        el.hidePopover();
      }
    } catch {
      // Ignore if browser lacks popover support
    }
  }, [currentToast]);

  const modalBlocking = settingsOpen || activeFx !== null;

  return (
    <>
      <div
        ref={toastRef}
        popover="manual"
        className={`ach-toast ${currentToast ? 'visible' : ''}`}
        role="status"
        aria-live="polite"
      >
        {currentToast}
      </div>

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
          legacyNotice={legacyNotice}
          onDismissLegacyNotice={dismissLegacyNotice}
          history={history}
          meta={meta}
          animateBackdrop={settings.lobbyAnimationEnabled}
          onContinue={actions.continueSaved}
          onStartNew={actions.startNew}
          onRefreshStorage={actions.refreshStorage}
          onOpenSettings={() => setSettingsOpen(true)}
        />
      ) : gameState.phase === 'posthumous' || gameState.phase === 'ended' ? (
        <EndingScreen
          state={gameState}
          onSubmitLastWords={actions.submitLastWords}
          onNewLife={() => actions.startNew()}
          onOpenSettings={() => setSettingsOpen(true)}
          onReturnLobby={actions.returnLobbyFromEnding}
        />
      ) : gameState.phase === 'war' && gameState.war !== null ? (
        <WarScreen
          state={gameState}
          warDayProgress={warDayProgress}
          warBeatProgress={warBeatProgress}
          shortcutsBlocked={modalBlocking}
          battleMinimized={battleMinimized}
          onBattleMinimizedChange={setBattleMinimized}
          decisionMinimized={decisionMinimized}
          onDecisionMinimizedChange={setDecisionMinimized}
          onSetSpeed={actions.setSpeed}
          onTogglePause={actions.togglePause}
          onToggleAuto={actions.toggleAuto}
          onSkipWarBeat={actions.skipWarBeat}
          onResolve={actions.resolve}
          onOpenSettings={() => setSettingsOpen(true)}
          onBackToLobby={actions.backToLobby}
        />
      ) : (
        <GameScreen
          state={gameState}
          yearProgress={yearProgress}
          shortcutsBlocked={modalBlocking}
          decisionMinimized={decisionMinimized}
          onDecisionMinimizedChange={setDecisionMinimized}
          onSetSpeed={actions.setSpeed}
          onTogglePause={actions.togglePause}
          onToggleAuto={actions.toggleAuto}
          onSetFocus={actions.setFocus}
          onResolve={actions.resolve}
          onRetire={actions.retire}
          onCallSummit={actions.callSummit}
          onInvestigateTimeline={actions.investigateTimeline}
          onGovernanceAction={actions.governanceAction}
          onOpenSettings={() => setSettingsOpen(true)}
          onBackToLobby={actions.backToLobby}
        />
      )}
    </>
  );
}
