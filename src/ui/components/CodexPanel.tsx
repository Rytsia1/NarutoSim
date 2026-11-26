import { useState } from 'react';
import { CLAN_MAP } from '../../data/clans';
import {
  BLOODLINE_MAP,
  BLOODLINES,
  BLOODLINE_STAGE_LABELS,
  DISCIPLINES,
  DISCIPLINE_TIER_NAMES,
} from '../../data/powers';
import { ARCHETYPE_LABELS } from '../../data/characters';
import { SUMMON_CLANS } from '../../data/summons';
import { VILLAGES } from '../../data/villages';
import type { CombatArchetype, MetaState } from '../../sim/types';

interface CodexPanelProps {
  meta: MetaState;
}

const ALL_ARCHETYPES: readonly CombatArchetype[] = [
  'vanguard',
  'marksman',
  'striker',
  'skirmisher',
  'artificer',
  'infiltrator',
  'juggernaut',
  'rogue_s',
];

export function CodexPanel({ meta }: CodexPanelProps) {
  const [subTab, setSubTab] = useState<'stats' | 'bloodlines' | 'disciplines' | 'crises'>('stats');

  const stats = meta.codexStats;
  const archetypesSeen = ALL_ARCHETYPES.filter((a) => (stats.byArchetype[a]?.encountered ?? 0) > 0).length;
  const bloodFound = Object.keys(meta.codexBloodlines).length;
  const discFound = Object.keys(meta.codexDisciplines).length;

  const clanRows = Object.entries(stats.byClan)
    .filter(([, v]) => Boolean(v && v.encountered > 0))
    .sort((a, b) => (b[1]?.encountered ?? 0) - (a[1]?.encountered ?? 0));
  const bloodlineRows = Object.entries(stats.byBloodline)
    .filter(([, v]) => Boolean(v && v.encountered > 0))
    .sort((a, b) => (b[1]?.encountered ?? 0) - (a[1]?.encountered ?? 0));

  return (
    <section className="panel" aria-labelledby="codex-heading">
      <h2 id="codex-heading" className="panel-title">
        Shinobi Codex &amp; Encounter Statistics
      </h2>

      <div className="tab-strip tab-strip-4" style={{ marginBottom: 16 }} role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={subTab === 'stats'}
          className="tab-btn"
          onClick={() => setSubTab('stats')}
        >
          Encounters ({archetypesSeen}/8)
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
          Crises &amp; Routes
        </button>
      </div>

      {subTab === 'stats' && (
        <>
          <div className="record-grid" style={{ marginBottom: 16 }}>
            <div className="record-cell">
              <span className="record-label">Rivals Encountered</span>
              <span className="record-value tabular">{stats.totalEncountered}</span>
            </div>
            <div className="record-cell">
              <span className="record-label">Rivals Defeated</span>
              <span className="record-value tabular">{stats.totalDefeated}</span>
            </div>
            <div className="record-cell">
              <span className="record-label">Archetypes Faced</span>
              <span className="record-value tabular">{archetypesSeen} / 8</span>
            </div>
            <div className="record-cell">
              <span className="record-label">Lives Completed</span>
              <span className="record-value tabular">{meta.livesPlayed}</span>
            </div>
          </div>

          <h3 className="panel-title" style={{ fontSize: '0.98rem', marginTop: 0 }}>
            By Combat Archetype
          </h3>
          <div className="codex-grid">
            {ALL_ARCHETYPES.map((arch) => {
              const entry = stats.byArchetype[arch];
              const enc = entry?.encountered ?? 0;
              const def = entry?.defeated ?? 0;
              return (
                <article key={arch} className={`squad-card ${enc === 0 ? 'fallen' : ''}`}>
                  <div className="disc-head">
                    <span>{ARCHETYPE_LABELS[arch]}</span>
                    <span className="status-tag">{enc > 0 ? `${enc} met` : 'unseen'}</span>
                  </div>
                  <div className="disc-sub tabular">
                    Encountered: {enc} | Defeated: {def}
                  </div>
                </article>
              );
            })}
          </div>

          <h3 className="panel-title" style={{ fontSize: '0.98rem', marginTop: 18 }}>
            By Village
          </h3>
          <div className="codex-grid">
            {VILLAGES.map((v) => {
              const entry = stats.byVillage[v.id];
              const enc = entry?.encountered ?? 0;
              const def = entry?.defeated ?? 0;
              return (
                <article key={v.id} className={`squad-card ${enc === 0 ? 'fallen' : ''}`}>
                  <div className="disc-head">
                    <span>{v.name}</span>
                    <span className="status-tag">{enc > 0 ? `${def}/${enc} defeated` : 'unseen'}</span>
                  </div>
                  <div className="disc-sub tabular">
                    {v.region} | Encountered: {enc}
                  </div>
                </article>
              );
            })}
          </div>

          {clanRows.length > 0 && (
            <>
              <h3 className="panel-title" style={{ fontSize: '0.98rem', marginTop: 18 }}>
                Rival Clans Encountered
              </h3>
              <div className="codex-grid">
                {clanRows.map(([clanId, entry]) => (
                  <article key={clanId} className="squad-card">
                    <div className="disc-head">
                      <span>{CLAN_MAP[clanId]?.name ?? clanId}</span>
                      <span className="status-tag">{entry?.encountered ?? 0} met</span>
                    </div>
                    <div className="disc-sub tabular">Defeated: {entry?.defeated ?? 0}</div>
                  </article>
                ))}
              </div>
            </>
          )}

          {bloodlineRows.length > 0 && (
            <>
              <h3 className="panel-title" style={{ fontSize: '0.98rem', marginTop: 18 }}>
                Bloodlines Faced in Combat
              </h3>
              <div className="codex-grid">
                {bloodlineRows.map(([blId, entry]) => (
                  <article key={blId} className="squad-card">
                    <div className="disc-head">
                      <span>{BLOODLINE_MAP[blId]?.name ?? blId}</span>
                      <span className="status-tag">{entry?.encountered ?? 0} met</span>
                    </div>
                    <div className="disc-sub tabular">Defeated: {entry?.defeated ?? 0}</div>
                  </article>
                ))}
              </div>
            </>
          )}
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
