import { useState } from 'react';
import { t } from '../../data/i18n';
import { VILLAGE_MAP } from '../../data/villages';
import type { GameState } from '../../sim/types';
import { downloadOrShareShinobiCard, formatShareText } from '../fx/recordCardCanvas';

interface EndingScreenProps {
  state: GameState;
  onSubmitLastWords: (words: string) => void;
  onNewLife: () => void;
  onOpenSettings: () => void;
  onReturnLobby: () => void;
}

export function EndingScreen({
  state,
  onSubmitLastWords,
  onNewLife,
  onOpenSettings,
  onReturnLobby,
}: EndingScreenProps) {
  const [words, setWords] = useState('');
  const [shareMsg, setShareMsg] = useState<string | null>(null);
  const isFinalized = state.phase === 'ended' && state.record !== null;

  if (!isFinalized) {
    return (
      <main className="ending-wrap">
        <header className="lobby-header">
          <div className="disc-head">
            <span className="lobby-kicker">End of a Shinobi Life</span>
            <div className="controls-bar">
              <button type="button" className="btn btn-sm btn-ghost" onClick={onOpenSettings}>
                Settings
              </button>
              <button type="button" className="btn btn-sm btn-ghost" onClick={onReturnLobby}>
                Lobby
              </button>
            </div>
          </div>
          <h1 className="lobby-title">
            {state.name}, Age {state.age}
          </h1>
          <p className="lobby-tagline">
            Fallen in {VILLAGE_MAP[state.villageId]?.name ?? state.villageId} territory ({state.birthYear + state.age}) from{' '}
            {state.causeOfDeath ?? 'natural causes'}.
          </p>
        </header>

        <section className="panel">
          <h2 className="panel-title">Last Words</h2>
          <p className="history-sub">
            Leave final words for your former squad, family, or the village before the Posthumous Chronicle closes.
          </p>
          <div className="field" style={{ marginBottom: 16 }}>
            <label htmlFor="last-words-input">Final Words (Optional)</label>
            <textarea
              id="last-words-input"
              rows={3}
              maxLength={220}
              value={words}
              onChange={(e) => setWords(e.target.value)}
              placeholder="Write your parting words..."
            />
          </div>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => onSubmitLastWords(words)}
          >
            Seal Shinobi Record &amp; View Posthumous Epilogue
          </button>
        </section>
      </main>
    );
  }

  const rec = state.record!;
  const peakRankText =
    rec.specialStatus === 'kage'
      ? 'Kage'
      : rec.specialStatus !== 'none'
        ? `${t(`status.${rec.specialStatus}`)} (${t(`rank.${rec.peakRank}`)})`
        : t(`rank.${rec.peakRank}`);

  return (
    <main className="ending-wrap">
      <header className="lobby-header">
        <span className="lobby-kicker">Posthumous Legacy Epilogue</span>
        <h1 className="lobby-title">{rec.name}</h1>
        <p className="lobby-tagline tabular">
          {rec.birthYear} to {rec.deathYear} (Age {rec.deathAge}) | {rec.villageName} | Peak Rank:{' '}
          {peakRankText}
        </p>
      </header>

      {rec.lastWords && (
        <section className="beat-card">
          <span className="lobby-kicker">Last Words</span>
          <p className="log-text" style={{ fontStyle: 'italic', fontSize: '1.05rem' }}>
            &ldquo;{rec.lastWords}&rdquo;
          </p>
        </section>
      )}

      {rec.posthumousBeats.map((beat, idx) => (
        <article key={`${beat.title}_${idx}`} className={`beat-card tone-${beat.tone}`}>
          <h2 className="panel-title" style={{ marginBottom: 4 }}>
            {beat.title}
          </h2>
          <p className="log-text">{beat.body}</p>
        </article>
      ))}

      <section className="panel">
        <h2 className="panel-title">Final Shinobi Record</h2>
        <div className="record-grid">
          <div className="record-cell">
            <span className="record-label">Origin & Village</span>
            <span className="record-value">
              {rec.originName} ({rec.villageName})
            </span>
          </div>
          <div className="record-cell">
            <span className="record-label">Cause of Death</span>
            <span className="record-value">{rec.causeOfDeath}</span>
          </div>
          <div className="record-cell">
            <span className="record-label">Bingo Book Threat Tier</span>
            <span className="record-value">
              {rec.threatTier}-Rank ({rec.specialStatus !== 'none' ? t(`status.${rec.specialStatus}`) : t(`rank.${rec.peakRank}`)})
            </span>
          </div>
          <div className="record-cell">
            <span className="record-label">Kekkei Genkai</span>
            <span className="record-value">{rec.bloodlineName ?? 'None Awakened'}</span>
          </div>
          <div className="record-cell">
            <span className="record-label">Wars Survived / Fought</span>
            <span className="record-value tabular">
              {rec.warsSurvived} / {rec.warsFought}
            </span>
          </div>
          <div className="record-cell">
            <span className="record-label">World Fate & Crisis</span>
            <span className="record-value">{rec.crisisStatus}</span>
          </div>
        </div>

        <div className="record-cell" style={{ marginTop: 12 }}>
          <span className="record-label">Genin Squad Legacy</span>
          <span className="record-value">{rec.teamSummary}</span>
        </div>

        {rec.topDisciplines.length > 0 && (
          <div className="record-cell" style={{ marginTop: 12 }}>
            <span className="record-label">Signature Disciplines</span>
            <span className="record-value">{rec.topDisciplines.join(' | ')}</span>
          </div>
        )}

        {rec.warHistory.length > 0 && (
          <div className="record-cell" style={{ marginTop: 12 }}>
            <span className="record-label">Multi-War Chronicles</span>
            <div className="stat-list" style={{ marginTop: 8 }}>
              {rec.warHistory.map((w) => (
                <div key={`rec_war_${w.warNumber}_${w.ageAtStart}`} className="disc-sub">
                  <strong>{w.title}</strong> (Age {w.ageAtStart}, {w.outcome}): {w.summary}
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      <div className="lobby-actions">
        <button type="button" className="btn btn-primary" onClick={onNewLife}>
          Begin Another Shinobi Life
        </button>
        <button
          type="button"
          className="btn"
          onClick={async () => {
            const msg = await downloadOrShareShinobiCard(rec);
            setShareMsg(msg);
          }}
        >
          Download Shinobi Card (PNG)
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(formatShareText(rec));
              setShareMsg('Chronicle summary copied to clipboard.');
            } catch {
              setShareMsg('Clipboard unavailable in this browser context.');
            }
          }}
        >
          Copy Chronicle Text
        </button>
        <button type="button" className="btn btn-ghost" onClick={onReturnLobby}>
          Return to Lobby
        </button>
      </div>
      {shareMsg && <p className="history-sub">{shareMsg}</p>}
    </main>
  );
}
