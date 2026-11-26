import { useRef, useState } from 'react';
import { ACHIEVEMENTS } from '../../data/achievements';
import { getClansForVillage } from '../../data/clans';
import { t } from '../../data/i18n';
import { ROSTER, ROSTER_MAP } from '../../data/roster';
import { getKageTitle, VILLAGES, VILLAGE_MAP } from '../../data/villages';
import type {
  CrisisId,
  CustomBuildConfig,
  GameState,
  LifeRecord,
  MetaState,
  ScenarioConfig,
  VillageId,
} from '../../sim/types';
import { AchievementsPanel } from '../components/AchievementsPanel';
import { CodexPanel } from '../components/CodexPanel';
import { CustomBuilderPanel } from '../components/CustomBuilderPanel';
import { LobbyBackdropCanvas } from '../fx/LobbyBackdropCanvas';
import { buildExportJson, importSaveJson } from '../storage';

interface LobbyScreenProps {
  savedLife: GameState | null;
  history: LifeRecord[];
  meta: MetaState;
  animateBackdrop: boolean;
  onContinue: () => void;
  onStartNew: (scenario: ScenarioConfig) => void;
  onRefreshStorage: () => void;
  onOpenSettings: () => void;
}

export function LobbyScreen({
  savedLife,
  history,
  meta,
  animateBackdrop,
  onContinue,
  onStartNew,
  onRefreshStorage,
  onOpenSettings,
}: LobbyScreenProps) {
  const [lobbyTab, setLobbyTab] = useState<'play' | 'custom' | 'codex' | 'achievements'>('play');
  const [village, setVillage] = useState<'' | VillageId>('');
  const [sex, setSex] = useState<'' | 'M' | 'F'>('');
  const [crisisOverride, setCrisisOverride] = useState<'natural' | CrisisId>('natural');
  const [customName, setCustomName] = useState('');
  const [fatedRosterId, setFatedRosterId] = useState<string | null>(null);
  const [confirmOverwrite, setConfirmOverwrite] = useState(false);
  const [importFeedback, setImportFeedback] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleStart = () => {
    if (savedLife && !confirmOverwrite) {
      setConfirmOverwrite(true);
      return;
    }
    setConfirmOverwrite(false);
    onStartNew({
      preferredVillage: village || undefined,
      preferredSex: sex || undefined,
      crisisOverride,
      customName: customName.trim() || undefined,
      fatedRosterId: fatedRosterId || undefined,
    });
  };

  const handleStartCustom = (build: CustomBuildConfig, crisis: 'natural' | CrisisId) => {
    onStartNew({
      crisisOverride: crisis,
      customBuild: build,
      fatedRosterId: fatedRosterId || undefined,
    });
  };

  const handleExport = () => {
    const json = buildExportJson();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `narutosim-archive-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handleImportFile = async (file: File | undefined) => {
    if (!file) return;
    const text = await file.text();
    const res = importSaveJson(text);
    setImportFeedback(res.message);
    if (res.ok) onRefreshStorage();
  };

  return (
    <div className="lobby-stage">
      <LobbyBackdropCanvas
        livesPlayed={meta.livesPlayed}
        codexCount={Object.keys(meta.codexRoster).length}
        animate={animateBackdrop}
      />
      <main className="lobby-wrap">
        <header className="lobby-header">
          <div className="disc-head">
            <span className="lobby-kicker">Solo Shinobi Life Simulation</span>
            <button type="button" className="btn btn-sm btn-ghost" onClick={onOpenSettings}>
              Settings
            </button>
          </div>
        <h1 className="lobby-title">
          {t('app.title')}: {t('app.subtitle')}
        </h1>
        <p className="lobby-tagline">{t('app.tagline')}</p>
        <div className="chip-row tabular" style={{ marginTop: 6 }}>
          <span className="chip">Lives Lived: {meta.livesPlayed}</span>
          <span className="chip">
            Bingo Book: {Object.keys(meta.codexRoster).length}/{ROSTER.length}
          </span>
          <span className="chip">
            Achievements: {meta.achievements.length}/{ACHIEVEMENTS.length}
          </span>
          {fatedRosterId && ROSTER_MAP[fatedRosterId] && (
            <button
              type="button"
              className="chip pos chip-btn"
              onClick={() => setFatedRosterId(null)}
              title="Click to clear Fated Thread"
            >
              Fated Thread: {ROSTER_MAP[fatedRosterId].name} ×
            </button>
          )}
        </div>
      </header>

      <nav className="tab-strip tab-strip-4" aria-label="Lobby Sections" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={lobbyTab === 'play'}
          className="tab-btn"
          onClick={() => setLobbyTab('play')}
        >
          New Life &amp; Hall
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={lobbyTab === 'custom'}
          className="tab-btn"
          onClick={() => setLobbyTab('custom')}
        >
          Custom Shinobi
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={lobbyTab === 'codex'}
          className="tab-btn"
          onClick={() => setLobbyTab('codex')}
        >
          Bingo Book Codex
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={lobbyTab === 'achievements'}
          className="tab-btn"
          onClick={() => setLobbyTab('achievements')}
        >
          Achievements ({meta.achievements.length})
        </button>
      </nav>

      {/* Keep CustomBuilderPanel mounted so switching to Codex never wipes user edits */}
      <div hidden={lobbyTab !== 'custom'}>
        <CustomBuilderPanel
          fatedRosterName={fatedRosterId ? ROSTER_MAP[fatedRosterId]?.name ?? null : null}
          onClearFated={() => setFatedRosterId(null)}
          onStartCustom={handleStartCustom}
        />
      </div>

      {lobbyTab === 'codex' && (
        <CodexPanel
          meta={meta}
          selectedFatedId={fatedRosterId}
          onSelectFated={setFatedRosterId}
        />
      )}

      {lobbyTab === 'achievements' && <AchievementsPanel meta={meta} />}

      {lobbyTab === 'play' && (
        <div className="lobby-grid">
          <section className="panel" aria-labelledby="start-heading">
            <h2 id="start-heading" className="panel-title">
              Enter the Shinobi World
            </h2>

            {savedLife && (
              <div className="continue-card">
                <div>
                  <strong>{savedLife.name}</strong>{' '}
                  <span className="status-tag">{t(`rank.${savedLife.rank}`)}</span>
                </div>
                <div className="continue-meta tabular">
                  Age {savedLife.age} ({savedLife.birthYear + savedLife.age}) in{' '}
                  {VILLAGE_MAP[savedLife.villageId]?.name ?? savedLife.villageId} | Wars Survived:{' '}
                  {savedLife.world.warsSurvived}
                </div>
                <div>
                  <button type="button" className="btn btn-primary" onClick={onContinue}>
                    {t('lobby.continue')}
                  </button>
                </div>
              </div>
            )}

            <div className="form-grid">
              <div className="field">
                <label htmlFor="name-input">Shinobi Name (Optional)</label>
                <input
                  id="name-input"
                  type="text"
                  maxLength={28}
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  placeholder={t('lobby.name_placeholder')}
                />
              </div>

              <div className="field">
                <label htmlFor="sex-select">{t('lobby.sex_pick')}</label>
                <select
                  id="sex-select"
                  value={sex}
                  onChange={(e) => setSex(e.target.value as '' | 'M' | 'F')}
                >
                  <option value="">Random</option>
                  <option value="M">Male</option>
                  <option value="F">Female</option>
                </select>
              </div>

              <div className="field">
                <label htmlFor="village-select">{t('lobby.village_pick')}</label>
                <select
                  id="village-select"
                  value={village}
                  onChange={(e) => setVillage(e.target.value as '' | VillageId)}
                >
                  <option value="">Random Village (All 12)</option>
                  {VILLAGES.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name} ({v.region})
                    </option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label htmlFor="crisis-select">{t('lobby.crisis_mode')}</label>
                <select
                  id="crisis-select"
                  value={crisisOverride}
                  onChange={(e) => setCrisisOverride(e.target.value as 'natural' | CrisisId)}
                >
                  <option value="natural">Natural Fate (Seeded at Birth)</option>
                  <option value="none">Normal Era Only (No World Crisis)</option>
                  <option value="calamity">Seed Bijuu Rampage</option>
                  <option value="mastermind">Seed Akatsuki Conspiracy</option>
                </select>
              </div>
            </div>

            {village && VILLAGE_MAP[village] && (
              <div className="disc-item" style={{ marginTop: 12 }}>
                <div className="disc-head">
                  <span>{VILLAGE_MAP[village].name} Identity</span>
                  <span className="status-tag">
                    Policy: {VILLAGE_MAP[village].militaryPolicy.replace('_', ' ')}
                  </span>
                </div>
                <div className="disc-sub" style={{ marginTop: 4 }}>
                  {VILLAGE_MAP[village].culture}
                </div>
                <div className="disc-sub" style={{ marginTop: 4 }}>
                  <strong>Shadow Division:</strong> {VILLAGE_MAP[village].institutions.shadowOrgName} |{' '}
                  <strong>Academy:</strong> {VILLAGE_MAP[village].institutions.academyLabel}
                </div>
                <div className="disc-sub" style={{ marginTop: 4 }}>
                  <strong>Major Clans:</strong>{' '}
                  {getClansForVillage(village)
                    .map((c) => c.name)
                    .join(', ')}
                </div>
              </div>
            )}

            <div className="lobby-actions">
              <button type="button" className="btn btn-primary" onClick={handleStart}>
                {confirmOverwrite ? 'Confirm Overwrite Saved Life' : t('lobby.new_life')}
              </button>
              {confirmOverwrite && (
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setConfirmOverwrite(false)}
                >
                  Cancel
                </button>
              )}
              <button type="button" className="btn btn-ghost" onClick={handleExport}>
                {t('lobby.export_save')}
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => fileInputRef.current?.click()}
              >
                {t('lobby.import_save')}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/json"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  void handleImportFile(file);
                }}
              />
            </div>

            {importFeedback && (
              <p className="history-sub" style={{ marginTop: 12 }}>
                {importFeedback}
              </p>
            )}
          </section>

          <section className="panel" aria-labelledby="hall-heading">
            <h2 id="hall-heading" className="panel-title">
              {t('lobby.past_lives')} ({history.length})
            </h2>

            {history.length === 0 ? (
              <p className="history-sub">
                No shinobi chronicles recorded yet. Complete a life to etch a name onto the memorial stone.
              </p>
            ) : (
              <div className="history-list">
                {history.map((rec) => (
                  <article key={rec.id} className="history-card">
                    <div className="history-head">
                      <span>{rec.name}</span>
                      <span className="status-tag">
                        {rec.specialStatus === 'kage'
                          ? getKageTitle(rec.villageId)
                          : rec.specialStatus === 'missing_nin'
                            ? 'Missing-Nin'
                            : t(`rank.${rec.peakRank}`)}
                      </span>
                    </div>
                    <div className="history-sub tabular">
                      {rec.villageName} | Lived to {rec.deathAge} ({rec.birthYear} to {rec.deathYear})
                    </div>
                    <div className="history-sub">
                      Threat Tier: {rec.threatTier}-Rank | Wars Survived: {rec.warsSurvived} | Cause:{' '}
                      {rec.causeOfDeath}
                    </div>
                    {rec.lastWords && (
                      <div className="history-sub" style={{ fontStyle: 'italic' }}>
                        &ldquo;{rec.lastWords}&rdquo;
                      </div>
                    )}
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
      </main>
    </div>
  );
}
