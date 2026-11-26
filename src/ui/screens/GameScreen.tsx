import { useEffect, useRef, useState } from 'react';
import { CLAN_MAP } from '../../data/clans';
import type { GovernanceActionId } from '../../data/events-politics';
import { t } from '../../data/i18n';
import { NINDO_MAP } from '../../data/nindo';
import { ORIGIN_MAP } from '../../data/origins';
import {
  BLOODLINE_GRADE_NAMES,
  BLOODLINE_MAP,
  BLOODLINE_STAGE_LABELS,
  DISCIPLINE_MAP,
  DISCIPLINE_TIER_NAMES,
  ELEMENT_KANJI,
  ELEMENT_NAMES,
  RANK_KANJI,
} from '../../data/powers';
import { kageTitle, VILLAGE_MAP } from '../../data/villages';
import { getSenseiBiasLabel } from '../../sim/academy';
import { getBranchLabel } from '../../sim/clan-heritage';
import { canEnterRetirement } from '../../sim/epilogue';
import { resolveFamilyMemberView, resolveSquadMemberView } from '../../sim/people';
import { computeCombatProjection, getChakraCap, XP_NEED_FOR_NEXT } from '../../sim/powers';
import { deriveRelArchetype } from '../../sim/relationships';
import { getRelStageLabel, getTrustTier } from '../../sim/team';
import type { FocusId, GameState } from '../../sim/types';
import { canCallDiplomaticSummit, getTensionLabel, MAX_CRISIS_CLUES } from '../../sim/world';
import { DecisionDialog } from '../components/DecisionDialog';
import { WorldSimulationPanel } from '../components/WorldSimulationPanel';

interface GameScreenProps {
  state: GameState;
  yearProgress: number;
  shortcutsBlocked?: boolean;
  decisionMinimized: boolean;
  onDecisionMinimizedChange: (next: boolean) => void;
  onSetSpeed: (speed: 1 | 2 | 4 | 8) => void;
  onTogglePause: () => void;
  onToggleAuto: () => void;
  onSetFocus: (focus: FocusId) => void;
  onResolve: (optionId: string, freeText?: string) => void;
  onRetire: () => void;
  onCallSummit?: () => void;
  onInvestigateTimeline?: (eventId: string) => void;
  onGovernanceAction?: (actionId: GovernanceActionId) => void;
  onOpenSettings: () => void;
  onBackToLobby: () => void;
}

const FOCUSES: FocusId[] = ['training', 'study', 'body', 'mind', 'social', 'work', 'balance'];

export function GameScreen({
  state,
  yearProgress,
  shortcutsBlocked = false,
  decisionMinimized,
  onDecisionMinimizedChange,
  onSetSpeed,
  onTogglePause,
  onToggleAuto,
  onSetFocus,
  onResolve,
  onRetire,
  onCallSummit,
  onInvestigateTimeline,
  onGovernanceAction,
  onOpenSettings,
  onBackToLobby,
}: GameScreenProps) {
  const [tab, setTab] = useState<'status' | 'squad' | 'world' | 'wars'>('status');
  const logFeedRef = useRef<HTMLDivElement | null>(null);
  const nearTopRef = useRef(true);

  const proj = computeCombatProjection(state);
  const chakraCap = getChakraCap(state);
  const village = VILLAGE_MAP[state.villageId];
  const origin = ORIGIN_MAP[state.originId];
  const retireAvailable = canEnterRetirement(state);
  const summitAvailable = canCallDiplomaticSummit(state);
  const newestFirstLogs = [...state.logs].reverse();

  // Keep newest log visible at top without yanking users who scrolled down into older history
  useEffect(() => {
    const feed = logFeedRef.current;
    if (feed && nearTopRef.current) {
      feed.scrollTop = 0;
    }
  }, [state.logs.length]);

  // Global keyboard shortcuts (disabled when modals/FX/settings open, modifier held, or on buttons/inputs)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (shortcutsBlocked || state.pending || e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (e.code === 'Space') {
        if (tag === 'BUTTON' || tag === 'A' || target?.getAttribute('role') === 'tab') return;
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
  }, [shortcutsBlocked, state.pending, onTogglePause, onSetSpeed, onToggleAuto]);

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
          <span className={`status-tag ${rankClass}`}>
            <span className="kanji-glyph">{RANK_KANJI[state.rank] ?? ''}</span> {t(`rank.${state.rank}`)}
          </span>
          {state.specialStatus !== 'none' && (
            <span className="status-tag">
              {state.specialStatus === 'kage' ? (
                <>
                  <span className="kanji-glyph">{RANK_KANJI.kage}</span> {kageTitle(state)}
                </>
              ) : (
                t(`status.${state.specialStatus}`)
              )}
            </span>
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
          <div
            ref={logFeedRef}
            className="log-feed"
            onScroll={() => {
              const el = logFeedRef.current;
              if (!el) return;
              nearTopRef.current = el.scrollTop < 60;
            }}
          >
            {newestFirstLogs.map((entry) => (
              <article key={entry.id} className={`log-entry tone-${entry.tone}`}>
                <div className="log-meta tabular">
                  <span>
                    Age {entry.age} (Year {entry.year})
                  </span>
                  {entry.tone !== 'normal' && <span>{entry.tone.toUpperCase()}</span>}
                </div>
                {entry.title && (
                  <div className="log-title-row">
                    <div className="log-title">{entry.title}</div>
                    {(entry.title.startsWith('Promoted to ') || entry.title.startsWith('Acclaimed as ')) && (
                      <span className="hanko-stamp" aria-hidden="true">
                        {entry.title.startsWith('Acclaimed as ')
                          ? RANK_KANJI.kage
                          : entry.title.includes('Jonin')
                            ? RANK_KANJI.jonin
                            : entry.title.includes('Chunin')
                              ? RANK_KANJI.chunin
                              : RANK_KANJI.genin}
                      </span>
                    )}
                  </div>
                )}
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
          </div>
        </section>

        <aside className="side-column" aria-label="Shinobi Dossier">
          <div className="tab-strip tab-strip-4" role="tablist" aria-label="Dossier Sections">
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'status'}
              className="tab-btn"
              onClick={() => setTab('status')}
            >
              Status
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'squad'}
              className="tab-btn"
              onClick={() => setTab('squad')}
            >
              Squad
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'world'}
              className="tab-btn"
              onClick={() => setTab('world')}
            >
              World
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
                  {origin.name}
                  {state.clanId && CLAN_MAP[state.clanId] ? ` | ${CLAN_MAP[state.clanId].name}` : ''} | Element:{' '}
                  <span className="kanji-glyph">{ELEMENT_KANJI[state.element]}</span> {ELEMENT_NAMES[state.element]} |
                  Capacity Tier {state.capacity}/5
                  {state.hasClanLegacy ? ' | Clan Hiden Inherited' : ''}
                  <br />
                  Village Trait ({village.name}): {village.perk.label}
                  {state.clanId && CLAN_MAP[state.clanId] && (
                    <>
                      <br />
                      Clan Trait ({CLAN_MAP[state.clanId].name}): {CLAN_MAP[state.clanId].yearlyBonus.label}
                    </>
                  )}
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
                {state.rank === 'academy' && state.academy && (
                  <div className="disc-item" style={{ marginTop: 12, borderColor: 'var(--accent-gold)' }}>
                    <div className="disc-head">
                      <span>Shinobi Academy Report</span>
                      <span className="status-tag tabular">Class Rank #{state.academy.classRank}/6</span>
                    </div>
                    <div className="disc-sub" style={{ marginTop: 4 }}>
                      Instructor: <strong>{state.academy.senseiName}</strong> ({getSenseiBiasLabel(state.academy.senseiBias)})
                      {state.academy.favoredBySensei ? ' | Favored' : ''}
                    </div>
                    <div className="chip-row tabular" style={{ marginTop: 6 }}>
                      <span className="chip">Academics {state.academy.academics}%</span>
                      <span className="chip">Bunshin {state.academy.bunshin}%</span>
                      <span className="chip">Henge {state.academy.henge}%</span>
                      <span className="chip">Kawarimi {state.academy.kawarimi}%</span>
                      <span className="chip">
                        Sparring {state.academy.sparringWins}W-{state.academy.sparringLosses}L
                      </span>
                    </div>
                  </div>
                )}

                {state.clanHeritage && CLAN_MAP[state.clanHeritage.clanId] && (
                  <div className="disc-item" style={{ marginTop: 10 }}>
                    <div className="disc-head">
                      <span>{CLAN_MAP[state.clanHeritage.clanId].name} Heritage</span>
                      <span className="status-tag">{getBranchLabel(state.clanHeritage.lineageBranch)}</span>
                    </div>
                    <div className="chip-row tabular" style={{ marginTop: 6 }}>
                      <span className="chip">Compat {state.clanHeritage.compatibility}%</span>
                      <span className="chip">Standing {state.clanHeritage.clanStanding}</span>
                      <span className="chip">Catalyst {state.clanHeritage.traumaCatalyst}%</span>
                      {state.clanHeritage.isDesignatedHeir && <span className="chip pos">Heir Candidate</span>}
                      {state.clanHeritage.cagedBirdSealed && <span className="chip neg">Caged Bird Seal</span>}
                    </div>
                    <div className="disc-sub" style={{ marginTop: 4 }}>
                      <strong>Unlocked Hiden:</strong>{' '}
                      {state.clanHeritage.unlockedHiden.length > 0
                        ? state.clanHeritage.unlockedHiden
                            .map((hId) => CLAN_MAP[state.clanHeritage!.clanId]?.hidenArts.find((a) => a.id === hId)?.name ?? hId)
                            .join(', ')
                        : 'None unlocked yet (requires compatibility, standing & training)'}
                    </div>
                  </div>
                )}

                {state.missionConsequences && state.missionConsequences.length > 0 && (
                  <div className="disc-item" style={{ marginTop: 10, borderColor: 'var(--accent-crimson)' }}>
                    <div className="disc-head">
                      <span>Active Mission Fallout ({state.missionConsequences.length})</span>
                    </div>
                    <div className="stat-list" style={{ marginTop: 4 }}>
                      {state.missionConsequences.map((mc) => (
                        <div key={mc.id} className="disc-sub">
                          <span className={`chip ${mc.kind === 'comrade_debt' ? 'pos' : 'neg'}`} style={{ marginRight: 6 }}>
                            {mc.kind.replace('_', ' ')}
                          </span>
                          {mc.detail}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {state.nindo && NINDO_MAP[state.nindo] && (
                  <div className="disc-item" style={{ marginTop: 12, borderColor: 'var(--accent-gold)' }}>
                    <div className="disc-head">
                      <span>Nindo (Ninja Way)</span>
                      <span className="status-tag">
                        {NINDO_MAP[state.nindo].title.replace(/\{kage\}/g, kageTitle(state))}
                      </span>
                    </div>
                    <div className="disc-sub" style={{ fontStyle: 'italic' }}>
                      &ldquo;{NINDO_MAP[state.nindo].vow.replace(/\{kage\}/g, kageTitle(state))}&rdquo;
                    </div>
                    {state.memories && state.memories.length > 0 && (
                      <div className="disc-sub" style={{ marginTop: 4 }}>
                        Latest Memory (Age {state.memories[state.memories.length - 1].age}):{' '}
                        {state.memories[state.memories.length - 1].text}
                      </div>
                    )}
                  </div>
                )}

                {state.specialStatus !== 'kage' &&
                  state.specialStatus !== 'missing_nin' &&
                  (state.rank === 'chunin' || state.rank === 'jonin' || state.nindo === 'become_kage') && (
                    <div className="disc-item" style={{ marginTop: 10 }}>
                      <div className="disc-head">
                        <span>Path to {kageTitle(state)}</span>
                        <span className="disc-sub tabular">Succession Requirements</span>
                      </div>
                      <div className="chip-row tabular">
                        <span className={`chip ${state.rank === 'jonin' ? 'pos' : ''}`}>
                          {state.rank === 'jonin' ? '✓' : '·'} Jonin
                        </span>
                        <span className={`chip ${state.age >= 26 ? 'pos' : ''}`}>
                          {state.age >= 26 ? '✓' : '·'} Age {state.age}/26
                        </span>
                        <span
                          className={`chip ${
                            state.stats.bonds >=
                            (state.nindo === 'become_kage' ? 50 : 55) - (state.flags.kage_endorsed ? 10 : 0)
                              ? 'pos'
                              : ''
                          }`}
                        >
                          Bonds {state.stats.bonds}/
                          {(state.nindo === 'become_kage' ? 50 : 55) - (state.flags.kage_endorsed ? 10 : 0)}
                        </span>
                        <span
                          className={`chip ${
                            state.missions.s >=
                            Math.max(0, (state.nindo === 'become_kage' ? 1 : 2) - (state.flags.kage_endorsed ? 1 : 0))
                              ? 'pos'
                              : ''
                          }`}
                        >
                          S-Rank {state.missions.s}/
                          {Math.max(0, (state.nindo === 'become_kage' ? 1 : 2) - (state.flags.kage_endorsed ? 1 : 0))}
                        </span>
                      </div>
                      <div className="disc-sub" style={{ marginTop: 4 }}>
                        Also offered via 2+ Wars Survived (Will 65+) or S-Rank Threat Tier (Bonds 45+).
                      </div>
                    </div>
                  )}
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
                  {summitAvailable && onCallSummit && (
                    <div style={{ marginTop: 12 }}>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        style={{ width: '100%', borderColor: 'var(--accent-gold)', color: 'var(--accent-gold)' }}
                        onClick={onCallSummit}
                        title="Spend 8 Ryo to convene a Five-Nation Summit and reduce World Tension (4-year cooldown)"
                      >
                        Convene Diplomatic Summit (-8 Ryo · Lower World Tension)
                      </button>
                    </div>
                  )}
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
                {state.bloodline && (state.bloodline.stage !== 'latent' || state.flags.custom_run) && (
                  <div className="disc-item" style={{ marginBottom: 10, borderColor: 'var(--accent-seal)' }}>
                    <div className="disc-head">
                      <span>{BLOODLINE_MAP[state.bloodline.id]?.name}</span>
                      <span className="status-tag">
                        {state.bloodline.stage === 'latent'
                          ? 'Latent (Unawakened)'
                          : `${BLOODLINE_GRADE_NAMES[state.bloodline.grade]} | ${BLOODLINE_STAGE_LABELS[state.bloodline.stage]}`}
                      </span>
                    </div>
                    <div className="disc-sub">
                      {state.bloodline.stage === 'latent'
                        ? 'Dormant in your lineage. Awakens through childhood or combat trials.'
                        : BLOODLINE_MAP[state.bloodline.id]?.bonusSummary}
                    </div>
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
                      <span className="tabular">{state.world.crisisClues}/{MAX_CRISIS_CLUES} Clues</span>
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
                  {state.team.members.map((m) => {
                    const vm = resolveSquadMemberView(state, m);
                    return (
                      <article key={vm.personId} className={`squad-card ${!vm.alive ? 'fallen' : ''}`}>
                        <div className="disc-head">
                          <span>
                            {vm.name} ({vm.role === 'sensei' ? 'Jonin Sensei' : vm.personId === state.rivalId ? 'Sworn Rival' : 'Squadmate'})
                          </span>
                          <span className="status-tag">
                            {!vm.alive
                              ? 'Fallen'
                              : vm.specialStatus === 'missing_nin'
                                ? 'Missing-Nin'
                                : t(`rank.${vm.rank}`)}
                          </span>
                        </div>
                        <div className="disc-sub tabular">
                          Age {vm.age} | {vm.archetype} | Specialty: {DISCIPLINE_MAP[vm.specialty]?.name ?? vm.specialty}
                        </div>
                        <div className="disc-sub tabular">
                          Trust: {vm.trust}/100 ({getTrustTier(vm.trust)}) | Live Fit: {vm.fit}% | Stage:{' '}
                          {getRelStageLabel(m)}
                          {vm.promiseMade ? ' | Oath Kept' : ''}
                        </div>
                        {vm.rel6 && (
                          <div className="chip-row tabular" style={{ marginTop: 4, marginBottom: 4 }}>
                            <span className="chip pos">{deriveRelArchetype(vm.rel6, vm.playerFeelings)}</span>
                            <span className="chip">Aff {vm.rel6.affection}</span>
                            <span className="chip">Resp {vm.rel6.respect}</span>
                            <span className="chip">Riv {vm.rel6.rivalry}</span>
                            {vm.rel6.fear >= 25 && <span className="chip">Fear {vm.rel6.fear}</span>}
                            {vm.rel6.resentment >= 25 && <span className="chip neg">Resent {vm.rel6.resentment}</span>}
                          </div>
                        )}
                        <div className="bar-track">
                          <div className="bar-fill health" style={{ width: `${vm.trust}%` }} />
                        </div>
                        <div className="disc-sub">{vm.fateNote}</div>
                      </article>
                    );
                  })}
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
                    {state.family.map((f, idx) => {
                      const vf = resolveFamilyMemberView(state, f);
                      return (
                        <div key={`${vf.personId}_${idx}`} className="disc-item">
                          <div className="disc-head">
                            <span>
                              {vf.name} ({vf.relation})
                            </span>
                            <span className="disc-sub tabular">
                              {vf.alive ? `Age ${vf.age}` : `Deceased (Age ${vf.deathAge ?? vf.age})`}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </section>
          )}

          {tab === 'world' && (
            <WorldSimulationPanel
              state={state}
              onInvestigateTimeline={onInvestigateTimeline}
              onGovernanceAction={onGovernanceAction}
            />
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

      <DecisionDialog
        decision={state.pending}
        minimized={decisionMinimized}
        shortcutsBlocked={shortcutsBlocked}
        onMinimizedChange={onDecisionMinimizedChange}
        onResolve={onResolve}
      />
    </div>
  );
}
