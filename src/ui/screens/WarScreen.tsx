import { useEffect, useRef, useState } from 'react';
import { t } from '../../data/i18n';
import { ELEMENT_NAMES } from '../../data/powers';
import { ARCHETYPE_LABELS } from '../../data/roster';
import { VILLAGE_MAP } from '../../data/villages';
import { getRel, SHORT_GOAL_LABELS } from '../../sim/ai';
import { getDisplayEnemyRanks, getPlayerRanks } from '../../sim/combat';
import { getMastermindDivisor } from '../../sim/crises';
import { detectWarArcs } from '../../sim/narrative';
import { rankValueToLetter } from '../../sim/powers';
import type { GameState } from '../../sim/types';
import { getLivingEnemies } from '../../sim/war';
import { BattleDialog } from '../components/BattleDialog';
import { DecisionDialog } from '../components/DecisionDialog';

const TIME_OF_DAY_LABELS: Record<string, string> = {
  dawn: 'DAWN',
  morning: 'MORNING',
  midday: 'MIDDAY',
  afternoon: 'AFTERNOON',
  dusk: 'DUSK',
  midnight: 'MIDNIGHT',
  late_night: 'LATE NIGHT',
};

interface WarScreenProps {
  state: GameState;
  warDayProgress: number;
  warBeatProgress: number;
  onSetSpeed: (speed: 1 | 2 | 4 | 8) => void;
  onTogglePause: () => void;
  onToggleAuto: () => void;
  onSkipWarBeat: () => void;
  onResolve: (optionId: string, freeText?: string) => void;
  onOpenSettings: () => void;
  onBackToLobby: () => void;
}

export function WarScreen({
  state,
  warDayProgress,
  warBeatProgress,
  onSetSpeed,
  onTogglePause,
  onToggleAuto,
  onSkipWarBeat,
  onResolve,
  onOpenSettings,
  onBackToLobby,
}: WarScreenProps) {
  const [sideTab, setSideTab] = useState<'competitors' | 'diplomacy'>('competitors');
  const war = state.war!;
  const logEndRef = useRef<HTMLDivElement | null>(null);
  const livingCount = getLivingEnemies(war).length;
  const activeBattle = war.activeBattle;
  const battleEnemy = activeBattle
    ? war.enemies.find((e) => e.id === activeBattle.enemyId) ?? null
    : null;
  const activeAlly = war.allyId ? war.enemies.find((e) => e.id === war.allyId && e.alive) ?? null : null;
  const playerRanks = getPlayerRanks(state, activeBattle?.resolveBoostThisRound);
  const liveArcs = detectWarArcs(state, war);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'auto', block: 'end' });
  }, [state.logs.length, activeBattle?.rounds.length]);

  // War-phase keyboard shortcuts (disabled while a modal decision is open)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (state.pending) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.code === 'Space') {
        e.preventDefault();
        onTogglePause();
      } else if (e.key === '1') {
        onSetSpeed(1);
      } else if (e.key === '2') {
        onSetSpeed(2);
      } else if (e.key === '3') {
        onSetSpeed(4);
      } else if (e.key === '4') {
        onSetSpeed(8);
      } else if (e.key.toLowerCase() === 'a') {
        onToggleAuto();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [state.pending, onTogglePause, onSetSpeed, onToggleAuto]);

  const warLogs = state.logs.slice(-40);
  const waitingForBeat = !state.pending && war.beatQueue.length > 0;
  const nextBeat = war.beatQueue[0] ?? null;
  const remainSec = nextBeat
    ? Math.max(0, (nextBeat.delay - war.beatClock) / state.speed)
    : 0;
  const isBattleDialogOpen = state.pending?.kind === 'war_battle_round' && activeBattle !== null;

  return (
    <div className="app-shell">
      <header className="game-topbar">
        <div className="identity-block">
          <h1 className="char-name">
            {war.isCrisisWar ? `Endgame Crisis War #${war.warNumber}` : `Great Shinobi War #${war.warNumber}`}
          </h1>
          <span className={`status-tag ${war.isCrisisWar ? 'tension-high' : 'rank-jonin'} tabular`}>
            Day {war.day}/{war.maxDays} · {TIME_OF_DAY_LABELS[war.timeOfDay] ?? war.subPhase.toUpperCase()}
          </span>
          <span className="status-tag">{t(`rank.${state.rank}`)}</span>
          {activeAlly && (
            <span className="status-tag rank-genin">
              Ally: {activeAlly.intel >= 80 ? activeAlly.name : activeAlly.archetype}
            </span>
          )}
          {war.strategicClaimedBy === 'player' && (
            <span className="status-tag rank-chunin">High Ground (+6)</span>
          )}
          {war.coalitionEnemyIds.length > 0 && (
            <span className="status-tag tension-high">Enemy Coalition Active</span>
          )}
          <span className="history-sub tabular">
            {livingCount}/{war.enemies.length} Rivals Active | Kills: {war.kills}
          </span>
        </div>

        <div className="controls-bar">
          <button
            type="button"
            className={`btn btn-sm ${state.paused ? 'btn-active' : 'btn-ghost'}`}
            onClick={onTogglePause}
          >
            {state.paused ? 'Resume' : 'Pause'}
          </button>

          <div className="speed-group" role="group" aria-label="War simulation speed">
            {([1, 2, 4, 8] as const).map((sp) => (
              <button
                key={sp}
                type="button"
                className={`speed-btn tabular ${state.speed === sp ? 'active' : ''}`}
                aria-pressed={state.speed === sp}
                onClick={() => onSetSpeed(sp)}
              >
                {sp}x
              </button>
            ))}
          </div>

          {waitingForBeat && (
            <button
              type="button"
              className="btn btn-sm btn-primary"
              onClick={onSkipWarBeat}
              title="Advance immediately to the next war beat"
            >
              Next Beat
            </button>
          )}

          <button
            type="button"
            className={`btn btn-sm ${state.autoPlay ? 'btn-active' : 'btn-ghost'}`}
            onClick={onToggleAuto}
          >
            Auto: {state.autoPlay ? 'On' : 'Off'}
          </button>
          <button type="button" className="btn btn-sm btn-ghost" onClick={onOpenSettings}>
            Settings
          </button>
          <button type="button" className="btn btn-sm btn-ghost" onClick={onBackToLobby}>
            Lobby
          </button>
        </div>
      </header>

      <div className="war-hud-strip tabular">
        <div className="hud-meter">
          <span className="hud-label">HP {war.hp}/100</span>
          <div className="bar-track">
            <div className="bar-fill health" style={{ width: `${war.hp}%` }} />
          </div>
        </div>
        <div className="hud-meter">
          <span className="hud-label">CP {war.cp}/100</span>
          <div className="bar-track">
            <div className="bar-fill chakra" style={{ width: `${war.cp}%` }} />
          </div>
        </div>
        <div className="hud-meter">
          <span className="hud-label">
            Camp Fort {war.fort}
            {war.workshop > 0 ? ` (WS ${war.workshop}%)` : ''}
          </span>
          <div className="bar-track">
            <div className="bar-fill" style={{ width: `${Math.min(100, war.fort)}%` }} />
          </div>
        </div>
        <div className="hud-meter">
          <span className="hud-label">Exposure {war.exposure}%</span>
          <div className="bar-track">
            <div className="bar-fill tension" style={{ width: `${war.exposure}%` }} />
          </div>
        </div>
        <div className="hud-seals" aria-label={`Limit Break Resolves remaining: ${war.resolves}`}>
          <span className="hud-label">Resolves</span>
          <div className="seal-pips">
            {[0, 1, 2].map((idx) => (
              <span
                key={idx}
                className={`seal-pip ${idx < war.resolves ? 'active' : ''}`}
                title="Limit Break Resolve Token"
              />
            ))}
            {war.resolves > 3 && <span className="chip pos">+{war.resolves - 3}</span>}
          </div>
        </div>
      </div>

      {/* GDD Real-Time War Clock & Time-of-Day Progress Strip */}
      <div className="war-clock-strip" aria-live="polite">
        <div className="war-clock-meta tabular">
          <span className="war-tod-badge">
            Day {war.day} · {TIME_OF_DAY_LABELS[war.timeOfDay] ?? 'WAR'}
          </span>
          <span className="war-status-text">
            {state.paused
              ? 'Paused (Press Space to resume)'
              : state.pending
                ? 'Awaiting your tactical command'
                : war.statusText}
          </span>
          <span className="war-clock-eta">
            {waitingForBeat && !state.paused ? `Next beat: ${remainSec.toFixed(1)}s` : `${Math.round(warDayProgress * 100)}% of day`}
          </span>
        </div>
        <div className="war-clock-bars">
          <div className="bar-track" title="Current beat countdown">
            <div
              className="bar-fill war-beat-fill"
              style={{ width: `${Math.round((waitingForBeat ? warBeatProgress : warDayProgress) * 100)}%` }}
            />
          </div>
        </div>
      </div>

      <main className="game-layout">
        <section className="log-column" aria-label="Warfront Feed & Active Battle">
          {war.crisis && !war.crisis.defeated && (
            <section className="panel crisis-banner-card" aria-label="Endgame Crisis Status">
              <div className="disc-head">
                <strong style={{ color: 'var(--accent-seal)' }}>{war.crisis.bossName}</strong>
                <div className="seal-pips" aria-label={`Crisis Phase ${war.crisis.phase} of 3`}>
                  {[1, 2, 3].map((p) => (
                    <span
                      key={p}
                      className={`seal-pip ${p <= war.crisis!.phase ? 'active' : ''}`}
                      title={`Crisis Phase ${p}`}
                    />
                  ))}
                  <span className="status-tag tension-high">Phase {war.crisis.phase}/3</span>
                </div>
              </div>
              <div className="disc-sub tabular" style={{ marginTop: 6 }}>
                {war.crisis.id === 'calamity'
                  ? `Boss HP: ${war.crisis.bossHp}/${war.crisis.bossMaxHp} | Corrupted Echoes: ${war.crisis.echoesLeft} | Coalition Allies: ${war.crisis.coalitionAllies}`
                  : `Boss HP: ${war.crisis.bossHp}/${war.crisis.bossMaxHp} | Relic Sentinels: ${war.crisis.sentinelsLeft}/5 | Divisor: x${getMastermindDivisor(state, war.crisis)}`}
              </div>
              <div className="bar-track" style={{ marginTop: 6 }}>
                <div
                  className="bar-fill tension"
                  style={{ width: `${Math.round((war.crisis.bossHp / war.crisis.bossMaxHp) * 100)}%` }}
                />
              </div>
            </section>
          )}

          {war.conviction && (
            <section className="panel crisis-banner-card" aria-label="Valley of the End Conviction">
              <div className="disc-head">
                <strong style={{ color: 'var(--accent-gold)' }}>
                  Extreme Conviction: {war.conviction.wishTitle}
                </strong>
                <span className="status-tag tension-high">
                  {war.conviction.opponentName} Resolve: {war.conviction.resolveR}/100
                </span>
              </div>
              {war.conviction.inDuel && (
                <div className="disc-sub tabular" style={{ marginTop: 6 }}>
                  Final Valley Duel (Round {war.conviction.round}): {war.conviction.opponentName} HP{' '}
                  {war.conviction.opponentHp}/100
                </div>
              )}
            </section>
          )}

          {activeBattle && battleEnemy && (
            <section className="panel battle-arena-card" aria-label="Active Solo Battle">
              <div className="disc-head" style={{ marginBottom: 12 }}>
                <span className="log-title">
                  {activeBattle.isFinal
                    ? 'FINAL NIGHT DUEL'
                    : `Solo Combat (Round ${activeBattle.round}/${activeBattle.maxRounds})`}
                </span>
                <span className="status-tag tension-high">
                  {activeBattle.isAmbush ? 'Ambush' : activeBattle.isDefense ? 'Camp Defense' : 'Open Clash'}
                </span>
              </div>

              <div className="arena-sides">
                <div className="arena-fighter">
                  <div className="disc-head">
                    <strong>{state.name}</strong>
                    <span className="chip">{ELEMENT_NAMES[state.element]}</span>
                  </div>
                  <div className="disc-sub tabular">
                    HP {war.hp}/100 | CP {war.cp}/100
                  </div>
                  <div className="bar-track">
                    <div className="bar-fill health" style={{ width: `${war.hp}%` }} />
                  </div>
                  <div className="chip-row" style={{ marginTop: 6 }}>
                    <span className="chip">TAI {rankValueToLetter(playerRanks[0])}</span>
                    <span className="chip">SPD {rankValueToLetter(playerRanks[1])}</span>
                    <span className="chip">STA {rankValueToLetter(playerRanks[2])}</span>
                    <span className="chip">CHK {rankValueToLetter(playerRanks[3])}</span>
                    <span className="chip">INS {rankValueToLetter(playerRanks[4])}</span>
                  </div>
                  {(activeBattle.bloodlineActiveRounds > 0 ||
                    activeBattle.playerWardRounds > 0 ||
                    activeBattle.weaknessExploited) && (
                    <div className="chip-row">
                      {activeBattle.bloodlineActiveRounds > 0 && <span className="chip pos">Bloodline Active</span>}
                      {activeBattle.playerWardRounds > 0 && <span className="chip pos">Barrier Ward</span>}
                      {activeBattle.weaknessExploited && <span className="chip pos">Weakness Read</span>}
                    </div>
                  )}
                </div>

                <div className="arena-fighter">
                  <div className="disc-head">
                    <strong>
                      {battleEnemy.intel >= 80
                        ? `${battleEnemy.name} (${battleEnemy.epithet})`
                        : `Unknown ${battleEnemy.archetype.toUpperCase()}`}
                    </strong>
                    <span className="chip">
                      {battleEnemy.intel >= 60 ? ELEMENT_NAMES[battleEnemy.element] : '???'}
                    </span>
                  </div>
                  <div className="disc-sub tabular">
                    HP {battleEnemy.hp}/100 | Intel {battleEnemy.intel}%
                  </div>
                  <div className="bar-track">
                    <div className="bar-fill tension" style={{ width: `${battleEnemy.hp}%` }} />
                  </div>
                  {(() => {
                    const eRanks = getDisplayEnemyRanks(battleEnemy);
                    const est = battleEnemy.intel < 80 ? '~' : '';
                    return (
                      <div className="chip-row" style={{ marginTop: 6 }}>
                        <span className="chip">
                          TAI {est}
                          {rankValueToLetter(eRanks[0])}
                        </span>
                        <span className="chip">
                          SPD {est}
                          {rankValueToLetter(eRanks[1])}
                        </span>
                        <span className="chip">
                          STA {est}
                          {rankValueToLetter(eRanks[2])}
                        </span>
                        <span className="chip">
                          CHK {est}
                          {rankValueToLetter(eRanks[3])}
                        </span>
                        <span className="chip">
                          INS {est}
                          {rankValueToLetter(eRanks[4])}
                        </span>
                      </div>
                    );
                  })()}
                </div>
              </div>

              {activeBattle.rounds.length > 0 && (
                <div className="battle-rounds-feed">
                  {activeBattle.rounds.slice(-4).map((r) => (
                    <div key={r.round} className={`round-row outcome-${r.outcome}`}>
                      <div className="disc-head tabular">
                        <span>
                          R{r.round}: {r.playerAction}
                        </span>
                        <span>
                          Dealt {r.enemyDmgTaken} | Took {r.playerDmgTaken}
                        </span>
                      </div>
                      <div className="disc-sub">{r.narrative}</div>
                      <div className="why-line">{r.whyLine}</div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          <div className="log-feed">
            {warLogs.map((entry) => (
              <article key={entry.id} className={`log-entry tone-${entry.tone}`}>
                <div className="log-meta tabular">
                  <span>
                    Age {entry.age} (Year {entry.year})
                  </span>
                  <span>{entry.tone.toUpperCase()}</span>
                </div>
                {entry.title && <div className="log-title">{entry.title}</div>}
                <p className="log-text">{entry.text}</p>
              </article>
            ))}
            <div ref={logEndRef} />
          </div>
        </section>

        <aside className="side-column" aria-label="Sector Dossier & Diplomacy">
          <div className="tab-strip" style={{ gridTemplateColumns: '1fr 1fr' }} role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={sideTab === 'competitors'}
              className="tab-btn"
              onClick={() => setSideTab('competitors')}
            >
              Competitors ({livingCount})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={sideTab === 'diplomacy'}
              className="tab-btn"
              onClick={() => setSideTab('diplomacy')}
            >
              Chronicle & AI ({war.facts.length})
            </button>
          </div>

          {sideTab === 'competitors' ? (
            <section className="panel">
              <h2 className="panel-title">Sector Competitors</h2>
              <div className="stat-list">
                {war.enemies.map((e) => {
                  const knownName = e.intel >= 80 || !e.alive;
                  const rel = getRel(war, e.id, 'player');
                  const isAlly = war.allyId === e.id;
                  return (
                    <article key={e.id} className={`squad-card ${!e.alive ? 'fallen' : ''}`}>
                      <div className="disc-head">
                        <span>
                          {knownName ? `${e.name} (${e.epithet})` : `Unknown ${ARCHETYPE_LABELS[e.archetype]}`}
                        </span>
                        <span className={`status-tag ${isAlly ? 'rank-genin' : e.alive ? '' : 'tension-high'}`}>
                          {!e.alive ? 'Eliminated' : isAlly ? `ALLY (HP ${e.hp})` : `HP ${e.hp}`}
                        </span>
                      </div>
                      <div className="disc-sub tabular">
                        Intel: {e.intel}%
                        {e.intel >= 30 ? ` | Fort ${e.fort}` : ''}
                        {e.intel >= 60 ? ` | ${ELEMENT_NAMES[e.element]} | ${VILLAGE_MAP[e.villageId].name}` : ''}
                      </div>
                      <div className="bar-track">
                        <div className="bar-fill" style={{ width: `${e.intel}%` }} />
                      </div>
                      {e.intel >= 50 && e.alive && (
                        <>
                          <div className="disc-sub" style={{ color: 'var(--accent-gold)' }}>
                            AI Intent: {SHORT_GOAL_LABELS[e.shortGoal]} ({e.longGoal.replace('_', ' ')})
                          </div>
                          <div className="chip-row tabular">
                            <span className="chip">Trust {rel.trust}</span>
                            <span className="chip">Fear {rel.fear}</span>
                            <span className="chip">Rivalry {rel.rivalry}</span>
                            <span className="chip">Grudge {rel.grudge}</span>
                          </div>
                        </>
                      )}
                      {e.intel >= 50 && <div className="disc-sub">Motive: {e.motive}</div>}
                      {e.intel >= 60 && e.intel < 80 && <div className="disc-sub">Hint: {e.originHint}</div>}
                      {e.skillsRevealed && (
                        <div className="chip-row">
                          {e.skills.map((sk) => (
                            <span key={sk.name} className="chip">
                              {sk.name}
                            </span>
                          ))}
                        </div>
                      )}
                      {e.ultimateSeen && (
                        <div className="disc-sub" style={{ color: 'var(--accent-gold)' }}>
                          Ultimate: {e.ultimate.name}
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            </section>
          ) : (
            <section className="panel">
              <h2 className="panel-title">Emergent War Chronicle</h2>
              <div className="stat-list">
                {liveArcs.map((arc) => (
                  <article key={arc.id} className={`disc-item tone-${arc.tone}`}>
                    <div className="disc-head">
                      <span style={{ color: 'var(--accent-gold)' }}>{arc.title}</span>
                    </div>
                    <div className="disc-sub">{arc.summary}</div>
                  </article>
                ))}
              </div>

              <h3 className="panel-title" style={{ fontSize: '1rem', marginTop: 18 }}>
                Recorded War Facts ({war.facts.length})
              </h3>
              {war.facts.length === 0 ? (
                <p className="history-sub">
                  Alliances, betrayals, Jutsu Clashes, Kizuna interceptions, and eliminations will be chronicled here as the war unfolds.
                </p>
              ) : (
                <div className="stat-list">
                  {war.facts.slice(-12).reverse().map((f, idx) => (
                    <div key={`${f.day}_${f.type}_${idx}`} className="disc-item">
                      <div className="disc-head tabular">
                        <span>Day {f.day}</span>
                        <span className="chip">{f.type.replace('_', ' ')}</span>
                      </div>
                      <div className="disc-sub">{f.detail}</div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}
        </aside>
      </main>

      {isBattleDialogOpen && state.pending ? (
        <BattleDialog state={state} decision={state.pending} onResolve={onResolve} />
      ) : (
        <DecisionDialog decision={state.pending} onResolve={onResolve} />
      )}
    </div>
  );
}
