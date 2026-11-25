import { useEffect, useRef, useState } from 'react';
import { t } from '../../data/i18n';
import { ORIGIN_MAP } from '../../data/origins';
import {
  BLOODLINE_GRADE_NAMES,
  BLOODLINE_MAP,
  BLOODLINE_STAGE_LABELS,
  DISCIPLINE_MAP,
  DISCIPLINE_TIER_NAMES,
  ELEMENT_NAMES,
} from '../../data/powers';
import { VILLAGE_MAP } from '../../data/villages';
import { canEnterRetirement } from '../../sim/epilogue';
import { computeCombatProjection, getChakraCap, XP_NEED_FOR_NEXT } from '../../sim/powers';
import { getRelStageLabel, getTrustTier } from '../../sim/team';
import type { FocusId, GameState } from '../../sim/types';
import { getTensionLabel } from '../../sim/world';
import { DecisionDialog } from '../components/DecisionDialog';

interface GameScreenProps {
  state: GameState;
  yearProgress: number;
  onSetSpeed: (speed: 1 | 2 | 4 | 8) => void;
  onTogglePause: () => void;
  onToggleAuto: () => void;
  onSetFocus: (focus: FocusId) => void;
  onResolve: (optionId: string, freeText?: string) => void;
  onRetire: () => void;
  onOpenSettings: () => void;
  onBackToLobby: () => void;
}

const FOCUSES: FocusId[] = ['training', 'study', 'body', 'mind', 'social', 'work', 'balance'];

export function GameScreen({
  state,
  yearProgress,
  onSetSpeed,
  onTogglePause,
  onToggleAuto,
  onSetFocus,
  onResolve,
  onRetire,
  onOpenSettings,
  onBackToLobby,
}: GameScreenProps) {
  const [tab, setTab] = useState<'status' | 'squad' | 'wars'>('status');
  const logEndRef = useRef<HTMLDivElement | null>(null);

  const proj = computeCombatProjection(state);
  const chakraCap = getChakraCap(state);
  const village = VILLAGE_MAP[state.villageId];
  const origin = ORIGIN_MAP[state.originId];
  const retireAvailable = canEnterRetirement(state);

  // Scroll chronicle smoothly when new entries arrive
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'auto', block: 'end' });
  }, [state.logs.length]);

  // Global keyboard shortcuts (outside modals and inputs)
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

  const rankClass =
    state.rank === 'jonin'
      ? 'rank-jonin'
      : state.rank === 'chunin'
        ? 'rank-chunin'
        : state.rank === 'genin'
          ? 'rank-genin'
          : '';

  return (
    <div className="app-shell">
      <header className="game-topbar">
        <div className="identity-block">
          <h1 className="char-name">{state.name}</h1>
          <span className={`status-tag ${rankClass}`}>{t(`rank.${state.rank}`)}</span>
          {state.specialStatus !== 'none' && (
            <span className="status-tag">{t(`status.${state.specialStatus}`)}</span>
          )}
          {state.phase === 'retirement' && <span className="status-tag">Retired</span>}
          <span className="history-sub tabular">
            Age {state.age} ({state.birthYear + state.age}) | {village.name}
          </span>
          <span
            className={`status-tag ${state.world.tension >= 70 ? 'tension-high' : ''}`}
            title="World Tension between the hidden villages"
          >
            Tension {state.world.tension}%: {getTensionLabel(state.world.tension, state.world.truePeace)}
          </span>
        </div>

        <div className="controls-bar">
          <button
            type="button"
            className={`btn btn-sm ${state.paused ? 'btn-active' : ''}`}
            onClick={onTogglePause}
            aria-label={state.paused ? 'Resume timeline' : 'Pause timeline'}
          >
            {state.paused ? 'Resume' : 'Pause'}
          </button>
          {([1, 2, 4, 8] as const).map((sp) => (
            <button
              key={sp}
              type="button"
              className={`btn btn-sm tabular ${state.speed === sp ? 'btn-active' : 'btn-ghost'}`}
              onClick={() => onSetSpeed(sp)}
            >
              {sp}x
            </button>
          ))}
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

      <div className="year-bar-track" aria-hidden="true">
        <div className="year-bar-fill" style={{ width: `${Math.round(yearProgress * 100)}%` }} />
      </div>

      <main className="game-layout">
        <section className="log-column" aria-label="Shinobi Life Chronicle">
          <div className="log-feed">
            {state.logs.map((entry) => (
              <article key={entry.id} className={`log-entry tone-${entry.tone}`}>
                <div className="log-meta tabular">
                  <span>
                    Age {entry.age} (Year {entry.year})
                  </span>
                  {entry.tone !== 'normal' && <span>{entry.tone.toUpperCase()}</span>}
                </div>
                {entry.title && <div className="log-title">{entry.title}</div>}
                <p className="log-text">{entry.text}</p>
                {(entry.deltas || entry.checks) && (
                  <div className="chip-row">
                    {entry.checks?.map((c, idx) => (
                      <span key={`${c.label}_${idx}`} className={`chip ${c.passed ? 'check-pass' : 'check-fail'}`}>
                        {c.passed ? 'PASS' : 'FAIL'}: {c.label}
                      </span>
                    ))}
                    {entry.deltas?.map((d, idx) => (
                      <span key={`${d.stat}_${idx}`} className={`chip ${d.delta > 0 ? 'pos' : 'neg'}`}>
                        {d.label} {d.delta > 0 ? `+${d.delta}` : d.delta}
                      </span>
                    ))}
                  </div>
                )}
              </article>
            ))}
            <div ref={logEndRef} />
          </div>
        </section>

        <aside className="side-column" aria-label="Shinobi Dossier">
          <div className="tab-strip" role="tablist" aria-label="Dossier Sections">
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'status'}
              className="tab-btn"
              onClick={() => setTab('status')}
            >
              Status & Build
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'squad'}
              className="tab-btn"
              onClick={() => setTab('squad')}
            >
              Squad & Kizuna
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'wars'}
              className="tab-btn"
              onClick={() => setTab('wars')}
            >
              Wars ({state.warHistory.length})
            </button>
          </div>

          {tab === 'status' && (
            <>
              <section className="panel">
                <h2 className="panel-title">Core Attributes</h2>
                <div className="history-sub" style={{ marginBottom: 10 }}>
                  {origin.name} | Element: {ELEMENT_NAMES[state.element]} | Capacity Tier {state.capacity}/5
                  {state.hasClanLegacy ? ' | Clan Hiden Inherited' : ''}
                </div>
                <div className="stat-list tabular">
                  <div className="stat-row">
                    <span>Chakra</span>
                    <div className="bar-track">
                      <div
                        className="bar-fill chakra"
                        style={{ width: `${Math.min(100, (state.stats.chakra / chakraCap) * 100)}%` }}
                      />
                    </div>
                    <span>
                      {state.stats.chakra}/{chakraCap}
                    </span>
                  </div>
                  <div className="stat-row">
                    <span>Health</span>
                    <div className="bar-track">
                      <div className="bar-fill health" style={{ width: `${state.stats.health}%` }} />
                    </div>
                    <span>{state.stats.health}</span>
                  </div>
                  <div className="stat-row">
                    <span>Intel</span>
                    <div className="bar-track">
                      <div className="bar-fill" style={{ width: `${state.stats.intel}%` }} />
                    </div>
                    <span>{state.stats.intel}</span>
                  </div>
                  <div className="stat-row">
                    <span>Will</span>
                    <div className="bar-track">
                      <div className="bar-fill" style={{ width: `${state.stats.will}%` }} />
                    </div>
                    <span>{state.stats.will}</span>
                  </div>
                  <div className="stat-row">
                    <span>Bonds</span>
                    <div className="bar-track">
                      <div className="bar-fill health" style={{ width: `${state.stats.bonds}%` }} />
                    </div>
                    <span>{state.stats.bonds}</span>
                  </div>
                  <div className="stat-row">
                    <span>Ryo</span>
                    <div className="bar-track">
                      <div className="bar-fill" style={{ width: `${state.stats.ryo}%` }} />
                    </div>
                    <span>{state.stats.ryo}</span>
                  </div>
                </div>

                <div style={{ marginTop: 16 }}>
                  <div className="disc-head">
                    <span>Projected Solo Combat Profile</span>
                    <span className="status-tag">Bingo Tier: {proj.threatTier}-Rank</span>
                  </div>
                  <div className="combat-ranks-grid">
                    <div className="rank-cell">
                      <span className="rank-cell-label">TAI</span>
                      <span className="rank-cell-val">{proj.letters.tai}</span>
                    </div>
                    <div className="rank-cell">
                      <span className="rank-cell-label">SPD</span>
                      <span className="rank-cell-val">{proj.letters.spd}</span>
                    </div>
                    <div className="rank-cell">
                      <span className="rank-cell-label">STA</span>
                      <span className="rank-cell-val">{proj.letters.sta}</span>
                    </div>
                    <div className="rank-cell">
                      <span className="rank-cell-label">CHK</span>
                      <span className="rank-cell-val">{proj.letters.chk}</span>
                    </div>
                    <div className="rank-cell">
                      <span className="rank-cell-label">INS</span>
                      <span className="rank-cell-val">{proj.letters.ins}</span>
                    </div>
                  </div>
                </div>
              </section>

              {state.phase === 'life' && state.age >= 6 && (
                <section className="panel">
                  <h2 className="panel-title">Yearly Focus</h2>
                  <div className="focus-grid">
                    {FOCUSES.map((f) => {
                      const disabled = f === 'work' && state.age < 12;
                      return (
                        <button
                          key={f}
                          type="button"
                          disabled={disabled}
                          className={`btn btn-sm ${state.focus === f ? 'btn-active' : 'btn-ghost'}`}
                          onClick={() => onSetFocus(f)}
                        >
                          {t(`focus.${f}`)}
                        </button>
                      );
                    })}
                  </div>
                  {retireAvailable && (
                    <div style={{ marginTop: 14 }}>
                      <button type="button" className="btn btn-primary" style={{ width: '100%' }} onClick={onRetire}>
                        Retire from Frontline Duty (Enter Twilight Years)
                      </button>
                    </div>
                  )}
                </section>
              )}

              <section className="panel">
                <h2 className="panel-title">Jutsu Disciplines & Kekkei Genkai</h2>
                {state.bloodline && state.bloodline.stage !== 'latent' && (
                  <div className="disc-item" style={{ marginBottom: 10, borderColor: 'var(--accent-seal)' }}>
                    <div className="disc-head">
                      <span>{BLOODLINE_MAP[state.bloodline.id]?.name}</span>
                      <span className="status-tag">
                        {BLOODLINE_GRADE_NAMES[state.bloodline.grade]} | {BLOODLINE_STAGE_LABELS[state.bloodline.stage]}
                      </span>
                    </div>
                    <div className="disc-sub">{BLOODLINE_MAP[state.bloodline.id]?.bonusSummary}</div>
                  </div>
                )}

                {state.disciplines.length === 0 ? (
                  <p className="history-sub">No formal shinobi disciplines learned yet.</p>
                ) : (
                  <div className="stat-list">
                    {state.disciplines.map((d) => {
                      const def = DISCIPLINE_MAP[d.id];
                      const nextNeed = d.level < def.maxLevel ? XP_NEED_FOR_NEXT[d.level as 1 | 2 | 3] : null;
                      return (
                        <div key={d.id} className="disc-item">
                          <div className="disc-head">
                            <span>
                              {def?.name ?? d.id} {d.isMain ? '(Main)' : ''}
                            </span>
                            <span className="disc-sub">{DISCIPLINE_TIER_NAMES[d.level]}</span>
                          </div>
                          <div className="disc-sub tabular">
                            {nextNeed
                              ? `XP: ${d.xp}/${nextNeed} | Gate Stat: ${t(`stat.${def.ability}`)}`
                              : 'Maximum Tier Reached'}
                          </div>
                          {nextNeed && (
                            <div className="bar-track">
                              <div
                                className="bar-fill"
                                style={{ width: `${Math.min(100, (d.xp / nextNeed) * 100)}%` }}
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {state.world.crisisClues > 0 && (
                  <div className="disc-item" style={{ marginTop: 10, borderColor: 'var(--accent-gold)' }}>
                    <div className="disc-head">
                      <span>Anomalous Intelligence</span>
                      <span className="tabular">{state.world.crisisClues}/5 Clues</span>
                    </div>
                    <div className="disc-sub">
                      Strange patterns uncovered across borders will prove decisive if a continental crisis erupts.
                    </div>
                  </div>
                )}
              </section>
            </>
          )}

          {tab === 'squad' && (
            <section className="panel">
              <h2 className="panel-title">
                {state.team
                  ? `Team ${state.team.number} (${state.team.active ? 'Active Genin Cell' : `Disbanded at Age ${state.team.disbandedAge}`})`
                  : 'Genin Squad & Kizuna'}
              </h2>
              {!state.team ? (
                <p className="history-sub">
                  Graduate from the Shinobi Academy to be assigned to a four-man Genin cell (1 Jonin Sensei and 2 squadmates).
                </p>
              ) : (
                <div className="stat-list">
                  <p className="history-sub" style={{ margin: 0 }}>
                    {state.team.active
                      ? 'Active squadmates train beside you until you or a teammate earn Chunin rank.'
                      : 'Your Genin cell has disbanded, yet your Kizuna persists as each former member walks their own path.'}
                  </p>
                  {state.team.members.map((m) => (
                    <article key={m.id} className={`squad-card ${!m.alive ? 'fallen' : ''}`}>
                      <div className="disc-head">
                        <span>
                          {m.name} ({m.role === 'sensei' ? 'Jonin Sensei' : 'Squadmate'})
                        </span>
                        <span className="status-tag">
                          {!m.alive
                            ? 'Fallen'
                            : m.specialStatus === 'missing_nin'
                              ? 'Missing-Nin'
                              : t(`rank.${m.rank}`)}
                        </span>
                      </div>
                      <div className="disc-sub tabular">
                        Age {m.age} | {m.archetype} | Specialty: {DISCIPLINE_MAP[m.specialty]?.name ?? m.specialty}
                      </div>
                      <div className="disc-sub tabular">
                        Trust: {m.trust}/100 ({getTrustTier(m.trust)}) | Live Fit: {m.fit}% | Stage:{' '}
                        {getRelStageLabel(m)}
                        {m.promiseMade ? ' | Oath Kept' : ''}
                      </div>
                      <div className="bar-track">
                        <div className="bar-fill health" style={{ width: `${m.trust}%` }} />
                      </div>
                      <div className="disc-sub">{m.fateNote}</div>
                    </article>
                  ))}
                </div>
              )}

              <div style={{ marginTop: 18 }}>
                <h3 className="panel-title" style={{ fontSize: '1rem' }}>
                  Family Record
                </h3>
                {state.family.length === 0 ? (
                  <p className="history-sub">Raised without immediate family.</p>
                ) : (
                  <div className="stat-list">
                    {state.family.map((f, idx) => (
                      <div key={`${f.name}_${idx}`} className="disc-item">
                        <div className="disc-head">
                          <span>
                            {f.name} ({f.relation})
                          </span>
                          <span className="disc-sub tabular">
                            {f.alive ? `Age ${f.age}` : `Deceased (Age ${f.age})`}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>
          )}

          {tab === 'wars' && (
            <section className="panel">
              <h2 className="panel-title">World Tension & War Archive</h2>
              <div className="stat-row tabular" style={{ marginBottom: 14 }}>
                <span>Tension</span>
                <div className="bar-track">
                  <div className="bar-fill tension" style={{ width: `${state.world.tension}%` }} />
                </div>
                <span>{state.world.tension}%</span>
              </div>
              <p className="history-sub" style={{ marginTop: 0 }}>
                Completed Missions: D ({state.missions.d}), C ({state.missions.c}), B ({state.missions.b}), A (
                {state.missions.a}), S ({state.missions.s})
              </p>
              {state.warHistory.length === 0 ? (
                <p className="history-sub">
                  You have not yet deployed to a Great Shinobi War. Wars can erupt whenever village tensions peak, whether you are Genin, Chunin, or Jonin.
                </p>
              ) : (
                <div className="stat-list">
                  {state.warHistory.map((w) => (
                    <article key={`war_${w.warNumber}_${w.ageAtStart}`} className="disc-item">
                      <div className="disc-head">
                        <span>{w.title}</span>
                        <span className="status-tag">{w.outcome}</span>
                      </div>
                      <div className="disc-sub tabular">
                        Age {w.ageAtStart} | Rank: {t(`rank.${w.rankAtStart}`)}
                        {w.fieldPromoted ? ' (Field Promoted!)' : ''}
                        {w.isCrisisWar ? ' | Endgame Crisis' : ''}
                      </div>
                      <div className="disc-sub">{w.summary}</div>
                      {w.narrativeArcs && w.narrativeArcs.length > 0 && (
                        <div className="chip-row" style={{ marginTop: 6 }}>
                          {w.narrativeArcs.map((arc) => (
                            <span key={arc.id} className="chip" title={arc.summary}>
                              {arc.title}
                            </span>
                          ))}
                        </div>
                      )}
                    </article>
                  ))}
                </div>
              )}
            </section>
          )}
        </aside>
      </main>

      <DecisionDialog decision={state.pending} onResolve={onResolve} />
    </div>
  );
}
