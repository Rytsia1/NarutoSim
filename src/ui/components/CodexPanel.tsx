import { useState } from 'react';
import {
  BLOODLINES,
  BLOODLINE_STAGE_LABELS,
  DISCIPLINES,
  DISCIPLINE_TIER_NAMES,
  ELEMENT_NAMES,
} from '../../data/powers';
import { ARCHETYPE_LABELS, ROSTER } from '../../data/roster';
import { SUMMON_CLANS } from '../../data/summons';
import { VILLAGE_MAP } from '../../data/villages';
import type { MetaState } from '../../sim/types';

interface CodexPanelProps {
  meta: MetaState;
  selectedFatedId: string | null;
  onSelectFated: (rosterId: string | null) => void;
}

export function CodexPanel({ meta, selectedFatedId, onSelectFated }: CodexPanelProps) {
  const [subTab, setSubTab] = useState<'roster' | 'bloodlines' | 'disciplines' | 'crises'>('roster');

  const rosterFound = Object.keys(meta.codexRoster).length;
  const rosterDefeated = Object.values(meta.codexRoster).filter((r) => r.state === 'defeated').length;
  const bloodFound = Object.keys(meta.codexBloodlines).length;
  const discFound = Object.keys(meta.codexDisciplines).length;

  return (
    <section className="panel" aria-labelledby="codex-heading">
      <h2 id="codex-heading" className="panel-title">
        Bingo Book & Shinobi Codex
      </h2>

      <div className="tab-strip tab-strip-4" style={{ marginBottom: 16 }} role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={subTab === 'roster'}
          className="tab-btn"
          onClick={() => setSubTab('roster')}
        >
          Bingo Book ({rosterFound}/{ROSTER.length})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={subTab === 'bloodlines'}
          className="tab-btn"
          onClick={() => setSubTab('bloodlines')}
        >
          Bloodlines ({bloodFound}/{BLOODLINES.length})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={subTab === 'disciplines'}
          className="tab-btn"
          onClick={() => setSubTab('disciplines')}
        >
          Jutsu ({discFound}/{DISCIPLINES.length})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={subTab === 'crises'}
          className="tab-btn"
          onClick={() => setSubTab('crises')}
        >
          Crises & Routes
        </button>
      </div>

      {subTab === 'roster' && (
        <>
          <p className="history-sub" style={{ marginTop: 0 }}>
            Defeated: {rosterDefeated}/{ROSTER.length}. Pin any encountered rival as your{' '}
            <strong>Fated Thread</strong> to guarantee crossing blades with them in your next war.
          </p>
          <div className="codex-grid">
            {ROSTER.map((r) => {
              const entry = meta.codexRoster[r.id];
              const isPinned = selectedFatedId === r.id;
              return (
                <article key={r.id} className={`squad-card ${!entry ? 'fallen' : ''}`}>
                  <div className="disc-head">
                    <span>{entry ? `${r.name} (${r.epithet})` : `??? (${ARCHETYPE_LABELS[r.archetype]})`}</span>
                    <span className="status-tag">{entry ? entry.state : 'unknown'}</span>
                  </div>
                  <div className="disc-sub">
                    {entry
                      ? `${VILLAGE_MAP[r.villageId].name} | ${ELEMENT_NAMES[r.element]} | Ultimate: ${r.ultimate.name}`
                      : 'Encounter this shinobi during a 14-day war to unlock their dossier.'}
                  </div>
                  {entry && (
                    <div style={{ marginTop: 6 }}>
                      <button
                        type="button"
                        className={`btn btn-sm ${isPinned ? 'btn-active' : 'btn-ghost'}`}
                        onClick={() => onSelectFated(isPinned ? null : r.id)}
                      >
                        {isPinned ? 'Fated Thread Active (Click to Clear)' : 'Set Fated Thread'}
                      </button>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </>
      )}

      {subTab === 'bloodlines' && (
        <div className="codex-grid">
          {BLOODLINES.map((b) => {
            const stage = meta.codexBloodlines[b.id];
            return (
              <article key={b.id} className={`squad-card ${!stage ? 'fallen' : ''}`}>
                <div className="disc-head">
                  <span>{stage ? b.name : '??? (Unawakened Bloodline)'}</span>
                  <span className="status-tag">{stage ? BLOODLINE_STAGE_LABELS[stage] : 'locked'}</span>
                </div>
                <div className="disc-sub">{stage ? b.description : b.bonusSummary}</div>
              </article>
            );
          })}
        </div>
      )}

      {subTab === 'disciplines' && (
        <>
          <div className="codex-grid">
            {DISCIPLINES.map((d) => {
              const lvl = meta.codexDisciplines[d.id] as 1 | 2 | 3 | 4 | undefined;
              return (
                <article key={d.id} className={`squad-card ${!lvl ? 'fallen' : ''}`}>
                  <div className="disc-head">
                    <span>{d.name}</span>
                    <span className="status-tag">{lvl ? DISCIPLINE_TIER_NAMES[lvl] : 'unlearned'}</span>
                  </div>
                  <div className="disc-sub">{d.combatRole}</div>
                  {lvl === 4 && d.secretArtName && (
                    <div className="disc-sub" style={{ color: 'var(--accent-gold)' }}>
                      Secret Art: {d.secretArtName}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
          <h3 className="panel-title" style={{ fontSize: '1rem', marginTop: 18 }}>
            Kuchiyose Summoning Contracts ({(meta.codexSummons ?? []).length}/{SUMMON_CLANS.length})
          </h3>
          <div className="codex-grid">
            {SUMMON_CLANS.map((clan) => {
              const signed = (meta.codexSummons ?? []).includes(clan.id);
              return (
                <article key={clan.id} className={`squad-card ${!signed ? 'fallen' : ''}`}>
                  <div className="disc-head">
                    <span>{signed ? clan.name : '??? (Uncontracted Clan)'}</span>
                    <span className="status-tag">{signed ? clan.originPlace : 'locked'}</span>
                  </div>
                  <div className="disc-sub">
                    {signed
                      ? `${clan.shortDesc} Od Art: ${clan.odEffectDesc}`
                      : 'Sign a Kuchiyose Blood Contract during your shinobi career to record this clan.'}
                  </div>
                </article>
              );
            })}
          </div>
        </>
      )}

      {subTab === 'crises' && (
        <div className="record-grid">
          <div className="record-cell">
            <span className="record-label">Bijuu Rampage Cleared</span>
            <span className="record-value tabular">{meta.crisisCleared.calamity} times</span>
          </div>
          <div className="record-cell">
            <span className="record-label">Akatsuki Conspiracy Cleared</span>
            <span className="record-value tabular">{meta.crisisCleared.mastermind} times</span>
          </div>
          <div className="record-cell">
            <span className="record-label">Extreme Conviction Endings Unlocked</span>
            <span className="record-value tabular">{meta.convictionEndings.length} / 4</span>
          </div>
          <div className="record-cell">
            <span className="record-label">Total Completed Shinobi Lives</span>
            <span className="record-value tabular">{meta.livesPlayed}</span>
          </div>
        </div>
      )}
    </section>
  );
}
