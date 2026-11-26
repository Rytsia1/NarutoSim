import { useEffect, useId, useRef, useState } from 'react';
import { t } from '../../data/i18n';
import { pickPlayerJutsu, ZODIAC_SEAL_KANJI } from '../../data/jutsu';
import { BLOODLINE_MAP, ELEMENT_KANJI, ELEMENT_NAMES } from '../../data/powers';
import { ARCHETYPE_LABELS } from '../../data/roster';
import { VILLAGE_MAP } from '../../data/villages';
import {
  estimateBattleActionOdds,
  estimateRetreatChance,
  getAvailableOdActions,
  getEffectiveUltimateCost,
  getElementMultiplier,
  getHealthConditionLabel,
  getPlayerRanks,
  getPlayerSignatureUltimate,
} from '../../sim/combat';
import { getPartnerTrustTier } from '../../sim/partner';
import { rankValueToGrade } from '../../sim/powers';
import type { GameState, OdActionId, PendingDecision, WarCompetitor } from '../../sim/types';

interface BattleDialogProps {
  state: GameState;
  decision: PendingDecision;
  minimized: boolean;
  shortcutsBlocked?: boolean;
  onMinimizedChange: (next: boolean) => void;
  onResolve: (optionId: string, odAction?: OdActionId) => void;
}

const TACTIC_LABELS: Record<WarCompetitor['tactic'], string> = {
  reckless: 'Reckless Fighter',
  defensive: 'Defensive Tactician',
  hunter: 'Relentless Hunter',
  cunning: 'Cunning Strategist',
  proud: 'Proud Duelist',
  desperate: 'Desperate Combatant',
};

const SUPPORT_IDS = new Set([
  'bloodline',
  'support_heal',
  'support_ward',
  'support_clone',
  'exploit_weakness',
]);

const RESOLVE_IDS = new Set(['partner_free_surpass', 'resolve_boost', 'resolve_cp', 'resolve_flee']);

export function BattleDialog({
  state,
  decision,
  minimized,
  shortcutsBlocked = false,
  onMinimizedChange,
  onResolve,
}: BattleDialogProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const innerRef = useRef<HTMLDivElement | null>(null);
  const titleId = useId();
  const [supportOpen, setSupportOpen] = useState(false);
  const [resolveOpen, setResolveOpen] = useState(false);
  const [selectedOd, setSelectedOd] = useState<OdActionId | null>(null);

  const war = state.war!;
  const battle = war.activeBattle!;
  const enemy = war.enemies.find((e) => e.id === battle.enemyId)!;
  const odOptions = getAvailableOdActions(state);

  // Reset accordions, Od selection & scroll to top on every new round so Fighter Cards stay visible
  useEffect(() => {
    setSupportOpen(false);
    setResolveOpen(false);
    setSelectedOd(null);
    if (innerRef.current) {
      innerRef.current.scrollTop = 0;
    }
  }, [decision.id]);

  // Open/close native <dialog> based on minimized state
  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (!minimized && !el.open) {
      el.showModal();
      if (innerRef.current) {
        innerRef.current.scrollTop = 0;
        innerRef.current.focus({ preventScroll: true });
      }
    } else if (minimized && el.open) {
      el.close();
    }
  }, [minimized, decision.id]);

  // Prevent Escape from cancelling a required combat round
  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    const onCancel = (e: Event) => {
      e.preventDefault();
    };
    el.addEventListener('cancel', onCancel);
    return () => el.removeEventListener('cancel', onCancel);
  }, []);

  const optionById = new Map(decision.options.map((o) => [o.id, o]));
  const taiOpt = optionById.get('taijutsu');
  const ninOpt = optionById.get('ninjutsu');
  const genOpt = optionById.get('genjutsu');
  const ultOpt = optionById.get('ultimate');
  const retreatOpt = optionById.get('retreat');
  const supportOpts = decision.options.filter((o) => SUPPORT_IDS.has(o.id));
  const resolveOpts = decision.options.filter((o) => RESOLVE_IDS.has(o.id));

  let nextKey = 5;
  const supportKey = supportOpts.length > 0 ? nextKey++ : null;
  const resolveKey = resolveOpts.length > 0 ? nextKey++ : null;
  const retreatKey = retreatOpt ? nextKey++ : null;

  // Keyboard shortcuts: 0 toggles Minimize, 1-4 pick core actions, dynamic keys for accordions & retreat
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (shortcutsBlocked || e.ctrlKey || e.metaKey || e.altKey) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (e.key === '0') {
        e.preventDefault();
        onMinimizedChange(!minimized);
        return;
      }
      if (minimized) return;

      if (e.key === '1' && taiOpt && !taiOpt.disabled) {
        e.preventDefault();
        onResolve('taijutsu', selectedOd ?? undefined);
      } else if (e.key === '2' && ninOpt && !ninOpt.disabled) {
        e.preventDefault();
        onResolve('ninjutsu', selectedOd ?? undefined);
      } else if (e.key === '3' && genOpt && !genOpt.disabled) {
        e.preventDefault();
        onResolve('genjutsu', selectedOd ?? undefined);
      } else if (e.key === '4' && ultOpt && !ultOpt.disabled) {
        e.preventDefault();
        onResolve('ultimate', selectedOd ?? undefined);
      } else if (supportKey !== null && e.key === String(supportKey)) {
        e.preventDefault();
        setSupportOpen((prev) => !prev);
      } else if (resolveKey !== null && e.key === String(resolveKey)) {
        e.preventDefault();
        setResolveOpen((prev) => !prev);
      } else if (retreatKey !== null && e.key === String(retreatKey) && retreatOpt && !retreatOpt.disabled) {
        e.preventDefault();
        onResolve('retreat');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    shortcutsBlocked,
    minimized,
    onMinimizedChange,
    selectedOd,
    taiOpt,
    ninOpt,
    genOpt,
    ultOpt,
    retreatOpt,
    supportKey,
    resolveKey,
    retreatKey,
    onResolve,
  ]);

  const playerRanks = getPlayerRanks(state, battle.resolveBoostThisRound);
  const ult = getPlayerSignatureUltimate(state);
  const ultCost = getEffectiveUltimateCost(state, war);
  const partner = war.partner;
  const enemyKnown = enemy.intel >= 80;
  const enemyArchLabel = ARCHETYPE_LABELS[enemy.archetype];
  const headerEnemy = battle.isFinal
    ? `Final Night: ${enemyKnown ? enemy.name : enemyArchLabel}`
    : enemyKnown
      ? enemy.name
      : enemyArchLabel;

  const taiOdds = estimateBattleActionOdds(state, enemy, 'taijutsu', battle.resolveBoostThisRound);
  const ninOdds = estimateBattleActionOdds(state, enemy, 'ninjutsu', battle.resolveBoostThisRound);
  const genOdds = estimateBattleActionOdds(state, enemy, 'genjutsu', battle.resolveBoostThisRound);
  const retreatPct = estimateRetreatChance(state, enemy, battle.resolveBoostThisRound);
  const elemMatch = enemy.intel >= 60 ? getElementMultiplier(state.element, enemy.element).label : null;

  const lastRound = battle.rounds[battle.rounds.length - 1] ?? null;
  const enemyCond = getHealthConditionLabel(enemy.hp);
  const playerCond = getHealthConditionLabel(war.hp);

  const playerMods: string[] = [];
  if (battle.isAmbush && battle.round <= 2) {
    playerMods.push(`▲▲ Initiative ${3 - battle.round} ${3 - battle.round === 1 ? 'exchange' : 'exchanges'}`);
  }
  if (battle.isDefense && (war.fort > 0 || war.workshop >= 100)) {
    const fortVal = Math.round(war.fort * 0.22 + (war.workshop >= 100 ? 10 : 0));
    playerMods.push(`▲ Camp Wards (+${fortVal})`);
  }
  if (battle.bloodlineActiveRounds > 0 && state.bloodline) {
    const bName = BLOODLINE_MAP[state.bloodline.id]?.name ?? 'Bloodline';
    playerMods.push(`▲▲ ${bName} (${battle.bloodlineActiveRounds}r)`);
  }
  if (battle.playerWardRounds > 0) playerMods.push(`▲ Barrier (${battle.playerWardRounds}r)`);
  if (battle.playerBuffRounds > 0) playerMods.push(`▲ Tactical Buff +8 (${battle.playerBuffRounds}r)`);
  if (battle.playerCloneEvade) playerMods.push('▲ Clone Feint');
  if (battle.weaknessExploited) playerMods.push('▲ Weakness Read');
  if (war.nextBattleBonus > 0) playerMods.push(`▲ Prep Bonus (+${war.nextBattleBonus})`);
  if (war.strategicClaimedBy === 'player') playerMods.push('▲ High Ground (+6)');
  if (partner?.active) {
    const tier = getPartnerTrustTier(partner.trust);
    playerMods.push(`▲ ${partner.name}: ${tier.label} (HP ${partner.hp})`);
  }
  if (battle.resolveBoostThisRound) playerMods.push('▲▲ Surpass Limits');

  const enemyMods: string[] = [`▲▲ ${TACTIC_LABELS[enemy.tactic]}`];
  if (battle.enemyWallRounds > 0) enemyMods.push(`▲ Guard Wall (${battle.enemyWallRounds}r)`);
  if (battle.enemyFieldRounds > 0) enemyMods.push(`▲ Terrain Field (${battle.enemyFieldRounds}r)`);
  if (battle.enemyDebuffRounds > 0) enemyMods.push(`▼ Disrupted (${battle.enemyDebuffRounds}r)`);

  const supportPreview = supportOpts
    .map((o) => o.label.split('(')[0].split(':')[0].trim())
    .join(' · ');
  const resolvePreview = resolveOpts
    .map((o) => o.label.replace('Limit Break: ', '').split('(')[0].trim())
    .join(' · ');

  return (
    <>
      {minimized && (
        <div className="battle-minimized-bar" role="region" aria-label="Minimized battle controls">
          <div className="battle-min-info">
            <strong>
              {headerEnemy} · Round {battle.round}
            </strong>
            <span className="disc-sub tabular">
              You {war.hp} HP / {war.cp} CP | Enemy: {enemyCond}
            </span>
          </div>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => onMinimizedChange(false)}
          >
            Expand Battle (0) ▴
          </button>
        </div>
      )}

      <dialog
        ref={dialogRef}
        className="battle-dialog"
        aria-labelledby={titleId}
        {...({ closedby: 'none' } as Record<string, string>)}
      >
        <div ref={innerRef} className="battle-dialog-inner" tabIndex={-1}>
          {/* Header Bar */}
          <header className="battle-header">
            <div>
              <h1 id={titleId} className="battle-title">
                {headerEnemy} · Round {battle.round}
                {!battle.isFinal && <span className="battle-round-cap"> / {battle.maxRounds}</span>}
              </h1>
              {decision.manual && (
                <div className="chip-row" style={{ marginTop: 6 }}>
                  <span className="chip">Critical Decision (Auto-Play Paused)</span>
                </div>
              )}
            </div>
            <button
              type="button"
              className="battle-min-btn"
              onClick={() => onMinimizedChange(true)}
              title="Minimize battle window to inspect the war log (Shortcut: 0)"
            >
              Minimize ▾
            </button>
          </header>

          <div className="battle-divider" aria-hidden="true">
            <span className="battle-divider-gem" />
          </div>

          {/* Two-Column Fighter Comparison Cards */}
          <div className="battle-cards-grid">
            {/* Left: Player Card */}
            <section className="battle-fighter-card battle-card-player" aria-label="Your Combat Status">
              <div className="fighter-top">
                <div className="diamond-emblem player-emblem" aria-hidden="true">
                  <span className="diamond-inner kanji-glyph">{ELEMENT_KANJI[state.element]}</span>
                </div>
                <div className="fighter-id">
                  <div className="fighter-role">
                    You · {t(`rank.${state.rank}`)} · {ELEMENT_NAMES[state.element]}
                  </div>
                  <div className="fighter-name">{state.name}</div>
                </div>
              </div>

              <div className="battle-stat-row tabular">
                {(
                  [
                    ['Taijutsu', playerRanks[0]],
                    ['Speed', playerRanks[1]],
                    ['Stamina', playerRanks[2]],
                    ['Chakra', playerRanks[3]],
                    ['Insight', playerRanks[4]],
                  ] as const
                ).map(([lbl, val]) => (
                  <div key={lbl} className="battle-stat-col">
                    <span className="battle-stat-label">{lbl}</span>
                    <span className="battle-stat-grade">{rankValueToGrade(val)}</span>
                  </div>
                ))}
              </div>

              <div className="dual-bar" aria-label={`Health ${war.hp} percent, Chakra ${war.cp} percent`}>
                <div className="dual-bar-track">
                  <div className="dual-bar-fill hp" style={{ width: `${war.hp}%` }} />
                </div>
                <div className="dual-bar-track thin">
                  <div className="dual-bar-fill cp" style={{ width: `${war.cp}%` }} />
                </div>
              </div>

              <div className="fighter-vitals tabular">
                <span>Health {war.hp}</span>
                <span>Chakra {war.cp}</span>
                <span>Od {battle.od}/{battle.odMax}</span>
                <span>Fort {war.fort}</span>
              </div>

              <div className="fighter-meta-line tabular">
                Resolves {war.resolves}
                {partner ? ` · Partner ${partner.name} ${partner.active ? `HP ${partner.hp} (Trust ${partner.trust})` : partner.died ? '(Fallen)' : partner.defected ? '(Defected)' : '(Down)'}` : ''}
              </div>
              <div className="fighter-meta-line">
                Signature: <strong>{ult.name}</strong> · {rankValueToGrade(ult.rankVal)}
              </div>

              {playerMods.length > 0 && (
                <div className="battle-mod-row">
                  {playerMods.map((m) => (
                    <span key={m} className="battle-mod-pill player">
                      {m}
                    </span>
                  ))}
                </div>
              )}
            </section>

            {/* Right: Enemy Card */}
            <section className="battle-fighter-card battle-card-enemy" aria-label="Enemy Combat Status">
              <div className="fighter-top enemy-top">
                <div className="fighter-id enemy-id">
                  <div className="fighter-role">Enemy Shinobi · {enemyArchLabel}</div>
                  <div className="fighter-name">{enemyKnown ? enemy.name : 'Unknown'}</div>
                </div>
                <div className="diamond-emblem enemy-emblem" aria-hidden="true">
                  <span className="diamond-inner">
                    {enemyKnown ? enemy.name.slice(0, 2).toUpperCase() : '?'}
                  </span>
                </div>
              </div>

              <div className="battle-stat-row tabular">
                {(
                  [
                    ['Taijutsu', enemy.ranks[0]],
                    ['Speed', enemy.ranks[1]],
                    ['Stamina', enemy.ranks[2]],
                    ['Chakra', enemy.ranks[3]],
                    ['Insight', enemy.ranks[4]],
                  ] as const
                ).map(([lbl, val]) => (
                  <div key={lbl} className="battle-stat-col">
                    <span className="battle-stat-label">{lbl}</span>
                    <span className="battle-stat-grade">{enemyKnown ? rankValueToGrade(val) : '?'}</span>
                  </div>
                ))}
              </div>

              <div className="dual-bar" aria-label={`Enemy condition: ${enemyCond}`}>
                <div className="dual-bar-track">
                  <div className="dual-bar-fill enemy" style={{ width: `${enemy.hp}%` }} />
                </div>
              </div>

              <div className="fighter-vitals tabular">
                <span>{enemyCond}</span>
                <span>{enemy.intel >= 60 ? VILLAGE_MAP[enemy.villageId]?.name ?? 'Frontier' : 'Unknown Village'}</span>
                <span>Intel {enemy.intel}%</span>
              </div>

              <div className="fighter-meta-line">
                {enemy.ultimateSeen
                  ? `Signature: ${enemy.ultimate.name} · ${rankValueToGrade(enemy.ultimate.rankVal)}`
                  : 'Signature Jutsu unknown'}
              </div>

              <div className="battle-mod-row">
                {enemyMods.map((m) => (
                  <span key={m} className="battle-mod-pill enemy">
                    {m}
                  </span>
                ))}
              </div>
            </section>
          </div>

          {/* This Battle Narrative Box */}
          <section className="battle-context-box" aria-label="Current battle log">
            <div className="context-eyebrow">◆ This battle</div>
            {lastRound ? (
              <>
                {lastRound.seals && lastRound.seals.length > 0 && (
                  <div className="seal-chain" key={`seals_${lastRound.round}`} aria-label="Hand seal sequence">
                    {lastRound.seals.map((seal, idx) => (
                      <span
                        key={`${seal}_${idx}`}
                        className="seal-chip"
                        style={{ animationDelay: `${idx * 70}ms` }}
                      >
                        <span className="seal-kanji">{ZODIAC_SEAL_KANJI[seal] ?? ''}</span>
                        <span>{seal}</span>
                      </span>
                    ))}
                  </div>
                )}
                {lastRound.jutsuName && (
                  <div className="jutsu-title-card" key={`jutsu_${lastRound.round}`}>
                    {lastRound.jutsuName}
                  </div>
                )}
                <p className="context-scene">{lastRound.narrative}</p>
                <p className="context-quote">{lastRound.whyLine}</p>
              </>
            ) : (
              <>
                <p className="context-scene">{battle.sceneLine}</p>
                <p className="context-quote">
                  {enemyKnown ? enemy.name : enemyArchLabel}: {battle.enemyQuip}
                </p>
              </>
            )}
          </section>

          <p className="battle-status-line">
            {enemyKnown
              ? `${enemy.name} (${enemy.epithet}).`
              : 'An unknown foe.'}{' '}
            Enemy: {enemyCond} · You: {playerCond}
          </p>

          {/* Row 1: Optional Companion Od Actions (executed alongside Main Attack in the same round) */}
          {odOptions.length > 0 && (
            <section className="battle-od-row" aria-label="Optional Companion Od Actions">
              <div className="disc-head tabular">
                <span className="footer-label">
                  Companion Action (Optional · Runs Alongside Main Attack)
                </span>
                <span className="stat-used-chip">
                  Od {battle.od}/{battle.odMax}
                </span>
              </div>
              <div className="od-chip-grid">
                {odOptions.map((odOpt) => {
                  const armed = selectedOd === odOpt.id;
                  return (
                    <button
                      key={odOpt.id}
                      type="button"
                      className={`od-action-chip ${armed ? 'armed' : ''}`}
                      disabled={odOpt.disabled}
                      aria-pressed={armed}
                      title={odOpt.disabled && odOpt.disabledReason ? odOpt.disabledReason : odOpt.desc}
                      onClick={() => setSelectedOd((prev) => (prev === odOpt.id ? null : odOpt.id))}
                    >
                      <span className="od-chip-head tabular">
                        <strong>{odOpt.label}</strong>
                        <span className="cost-chip neutral">-{odOpt.cost} Od</span>
                      </span>
                      <span className="od-chip-desc">{odOpt.desc}</span>
                    </button>
                  );
                })}
              </div>
              {selectedOd && (
                <div className="disc-sub" style={{ color: 'var(--accent-gold)', marginTop: 6 }}>
                  Armed: will fire simultaneously when you pick a Main Attack below (click chip again to clear).
                </div>
              )}
            </section>
          )}

          {/* Row 2: Tactical Action Cards */}
          <div className="battle-actions-list">
            {/* [1] Taijutsu Strike */}
            {taiOpt && (
              <button
                type="button"
                className="battle-action-card"
                disabled={taiOpt.disabled}
                onClick={() => onResolve('taijutsu', selectedOd ?? undefined)}
              >
                <div className="action-card-top">
                  <span className="action-key tabular">1</span>
                  <span className="action-title">
                    {pickPlayerJutsu(state, 'taijutsu', battle.rounds.length).name} (Taijutsu)
                  </span>
                  <span className={`odds-pill ${taiOdds.tier}`}>
                    {taiOdds.tier === 'strong' ? '▲' : taiOdds.tier === 'weak' ? '▼' : '◆'} {taiOdds.label}
                  </span>
                </div>
                <div className="action-card-desc">
                  Pit Taijutsu against their Stamina · Reliable when conserving Chakra
                </div>
                <div className="action-card-chips">
                  <span className="cost-chip neutral">Chakra 0</span>
                </div>
                <div className="action-card-footer">
                  <span className="footer-label">Stat used</span>
                  <span className="stat-used-chip tabular">Taijutsu {rankValueToGrade(playerRanks[0])}</span>
                </div>
              </button>
            )}

            {/* [2] Elemental Ninjutsu */}
            {ninOpt && (
              <button
                type="button"
                className="battle-action-card"
                disabled={ninOpt.disabled}
                onClick={() => onResolve('ninjutsu', selectedOd ?? undefined)}
              >
                <div className="action-card-top">
                  <span className="action-key tabular">2</span>
                  <span className="action-title">
                    {pickPlayerJutsu(state, 'ninjutsu', battle.rounds.length).name} ({ELEMENT_NAMES[state.element]})
                  </span>
                  <span className={`odds-pill ${ninOdds.tier}`}>
                    {ninOdds.tier === 'strong' ? '▲' : ninOdds.tier === 'weak' ? '▼' : '◆'} {ninOdds.label}
                  </span>
                </div>
                <div className="action-card-desc">
                  Pit Chakra against their Chakra ·{' '}
                  {elemMatch ? elemMatch : 'Scales with elemental affinity and harder to dodge'}
                </div>
                <div className="action-card-chips">
                  <span className="cost-chip">Chakra -8</span>
                  {ninOpt.disabled && ninOpt.disabledReason && (
                    <span className="cost-chip">{ninOpt.disabledReason}</span>
                  )}
                </div>
                <div className="action-card-footer">
                  <span className="footer-label">Stat used</span>
                  <span className="stat-used-chip tabular">
                    Chakra {rankValueToGrade(playerRanks[3])} · {ELEMENT_NAMES[state.element]}
                  </span>
                </div>
              </button>
            )}

            {/* [3] Genjutsu / Tactical Feint */}
            {genOpt && (
              <button
                type="button"
                className="battle-action-card"
                disabled={genOpt.disabled}
                onClick={() => onResolve('genjutsu', selectedOd ?? undefined)}
              >
                <div className="action-card-top">
                  <span className="action-key tabular">3</span>
                  <span className="action-title">Genjutsu &amp; Tactical Feint</span>
                  <span className={`odds-pill ${genOdds.tier}`}>
                    {genOdds.tier === 'strong' ? '▲' : genOdds.tier === 'weak' ? '▼' : '◆'} {genOdds.label}
                  </span>
                </div>
                <div className="action-card-desc">
                  Pit Insight against their Insight · Landing a feint disrupts the enemy for 2 rounds
                </div>
                <div className="action-card-chips">
                  <span className="cost-chip">Chakra -6</span>
                  {genOpt.disabled && genOpt.disabledReason && (
                    <span className="cost-chip">{genOpt.disabledReason}</span>
                  )}
                </div>
                <div className="action-card-footer">
                  <span className="footer-label">Stat used</span>
                  <span className="stat-used-chip tabular">Insight {rankValueToGrade(playerRanks[4])}</span>
                </div>
              </button>
            )}

            {/* [4] Signature Jutsu Ultimate */}
            {ultOpt && (
              <button
                type="button"
                className="battle-action-card ultimate-card"
                disabled={ultOpt.disabled}
                onClick={() => onResolve('ultimate', selectedOd ?? undefined)}
              >
                <div className="action-card-top">
                  <span className="action-key tabular">4</span>
                  <span className="action-title">
                    Signature Jutsu: {ult.name}
                    <span className="rank-pill tabular">Rank {rankValueToGrade(ult.rankVal)}</span>
                  </span>
                </div>
                <div className="action-card-desc">
                  Unleash your signature technique · Simultaneous enemy Ultimate triggers a Jutsu Clash
                </div>
                <div className="action-card-chips">
                  <span className="cost-chip">Your trump card will be revealed</span>
                  <span className="cost-chip tabular">
                    Chakra -{ultCost}
                    {ultCost < ult.cost ? ' (-15% Bond)' : ''}
                  </span>
                  {ultOpt.disabled && ultOpt.disabledReason && (
                    <span className="cost-chip">{ultOpt.disabledReason}</span>
                  )}
                </div>
                <div className="action-card-footer">
                  <span className="footer-label">Current</span>
                  <span className="stat-used-chip tabular">Chakra {war.cp}</span>
                  <span className="stat-used-chip tabular">Health {war.hp}</span>
                </div>
              </button>
            )}

            {/* [5] Tactical Support & Bloodline Accordion */}
            {supportOpts.length > 0 && supportKey !== null && (
              <div className="battle-accordion-card">
                <button
                  type="button"
                  className="battle-accordion-trigger"
                  aria-expanded={supportOpen}
                  onClick={() => setSupportOpen((prev) => !prev)}
                >
                  <div className="action-card-top">
                    <span className="action-key tabular">{supportKey}</span>
                    <span className="action-title">Tactical Arts &amp; Bloodline</span>
                    <span className="accordion-chevron">{supportOpen ? 'Collapse ▴' : 'Expand ▾'}</span>
                  </div>
                  <div className="action-card-desc tabular">
                    {supportPreview} [HP {war.hp}/100 · CP {war.cp}/100]
                  </div>
                </button>

                {supportOpen && (
                  <div className="battle-accordion-body">
                    {supportOpts.map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        className="battle-sub-btn"
                        disabled={opt.disabled}
                        onClick={() => onResolve(opt.id)}
                      >
                        <span className="battle-sub-title">{opt.label}</span>
                        {opt.sublabel && <span className="action-card-desc">{opt.sublabel}</span>}
                        {opt.disabled && opt.disabledReason && (
                          <span className="cost-chip">{opt.disabledReason}</span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* [6] Limit Break / Resolve Accordion */}
            {resolveOpts.length > 0 && resolveKey !== null && (
              <div className="battle-accordion-card">
                <button
                  type="button"
                  className="battle-accordion-trigger"
                  aria-expanded={resolveOpen}
                  onClick={() => setResolveOpen((prev) => !prev)}
                >
                  <div className="action-card-top">
                    <span className="action-key tabular">{resolveKey}</span>
                    <span className="action-title">Limit Break / Resolve ({war.resolves} left)</span>
                    <span className="accordion-chevron">{resolveOpen ? 'Collapse ▴' : 'Expand ▾'}</span>
                  </div>
                  <div className="action-card-desc">{resolvePreview}</div>
                </button>

                {resolveOpen && (
                  <div className="battle-accordion-body">
                    {resolveOpts.map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        className="battle-sub-btn"
                        disabled={opt.disabled}
                        onClick={() => onResolve(opt.id)}
                      >
                        <span className="battle-sub-title">{opt.label}</span>
                        {opt.sublabel && <span className="action-card-desc">{opt.sublabel}</span>}
                        {opt.disabled && opt.disabledReason && (
                          <span className="cost-chip">{opt.disabledReason}</span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* [7] Shunshin Retreat */}
            {retreatOpt && retreatKey !== null && (
              <button
                type="button"
                className="battle-action-card"
                disabled={retreatOpt.disabled}
                onClick={() => onResolve('retreat')}
              >
                <div className="action-card-top">
                  <span className="action-key tabular">{retreatKey}</span>
                  <span className="action-title">Shunshin Retreat</span>
                  <span className={`odds-pill ${retreatPct >= 65 ? 'strong' : retreatPct <= 45 ? 'weak' : 'even'} tabular`}>
                    Escape ~{retreatPct}%
                  </span>
                </div>
                <div className="action-card-desc">
                  Disengage through smoke · Failed escape risks 14 to 24 parting damage
                </div>
                {retreatOpt.disabled && retreatOpt.disabledReason && (
                  <div className="action-card-chips">
                    <span className="cost-chip">{retreatOpt.disabledReason}</span>
                  </div>
                )}
                <div className="action-card-footer">
                  <span className="footer-label">Stat used</span>
                  <span className="stat-used-chip tabular">Speed {rankValueToGrade(playerRanks[1])}</span>
                </div>
              </button>
            )}
          </div>
        </div>
      </dialog>
    </>
  );
}
