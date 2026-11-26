import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { t } from '../../data/i18n';
import {
  formatJutsuChips,
  getAvailableModes,
  getJutsuMasteryInfo,
  getKnownJutsu,
  getNextTierLockedJutsu,
  MODE_MAP,
  ZODIAC_SEAL_KANJI,
  type JutsuDefinition,
} from '../../data/jutsu';
import { BLOODLINE_MAP, ELEMENT_KANJI, ELEMENT_NAMES } from '../../data/powers';
import { ARCHETYPE_LABELS } from '../../data/characters';
import { VILLAGE_MAP } from '../../data/villages';
import {
  canToggleBattleMode,
  COMBAT_TIER_LABELS,
  estimateBattleActionOdds,
  estimateRetreatChance,
  getActivePlayerModes,
  getCombatTier,
  getDisplayEnemyRanks,
  getEffectiveJutsuCost,
  getHealthConditionLabel,
  getModeUpkeepCp,
  getPlayerRanks,
  getPlayerSignatureUltimate,
  getPowerGapRead,
  OFFICIAL_RANK_LABELS,
  type BattleAttackStyle,
} from '../../sim/combat';
import { getPartnerTrustTier } from '../../sim/partner';
import { rankValueToGrade } from '../../sim/powers';
import type { GameState, PendingDecision, PowerGapLabel, SelfStateId, StatusId, WarCompetitor } from '../../sim/types';

interface BattleDialogProps {
  state: GameState;
  decision: PendingDecision;
  minimized: boolean;
  shortcutsBlocked?: boolean;
  onMinimizedChange: (next: boolean) => void;
  onResolve: (optionId: string) => void;
}

type JutsuTabId = 'ninjutsu' | 'taijutsu' | 'genjutsu' | 'other';

const TACTIC_LABELS: Record<WarCompetitor['tactic'], string> = {
  reckless: 'Reckless Fighter',
  defensive: 'Defensive Tactician',
  hunter: 'Relentless Hunter',
  cunning: 'Cunning Strategist',
  proud: 'Proud Duelist',
  desperate: 'Desperate Combatant',
};

const ROLE_LABELS: Record<JutsuDefinition['role'], string> = {
  damage: 'Damage',
  multi_hit: 'Multi-Hit',
  pierce: 'Wall Pierce',
  control: 'Control',
  defense: 'Defense',
  heal: 'Heal',
  evasion: 'Evasion',
  summon: 'Summon',
  clash: 'Clash Art',
  mode: 'Mode',
};

const STATUS_DISPLAY: Record<StatusId, string> = {
  burn: 'Burn',
  shock: 'Shock',
  bind: 'Bind',
  genjutsu: 'Genjutsu',
  drain: 'Drain',
  tenketsu_seal: 'Tenketsu Seal',
  bleed: 'Bleed',
  blind: 'Blind',
  slow: 'Slow',
  fear: 'Fear',
  poison: 'Poison',
};

const SELF_DISPLAY: Record<SelfStateId, string> = {
  guard: 'Guard',
  wall: 'Wall',
  evade: 'Evade',
  reflect: 'Reflect',
  intangible: 'Intangible',
  field: 'Field',
};

function getTabForJutsu(j: JutsuDefinition): JutsuTabId {
  if (j.category === 'ninjutsu') return 'ninjutsu';
  if (j.category === 'taijutsu' || j.category === 'kenjutsu') return 'taijutsu';
  if (j.category === 'genjutsu') return 'genjutsu';
  return 'other';
}

function getGapBadgeClass(label: PowerGapLabel): string {
  if (label === 'Overwhelming' || label === 'Major disadvantage') return 'danger';
  if (label === 'Disadvantage') return 'warn';
  if (label === 'Advantage' || label === 'Dominant') return 'good';
  return '';
}

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

  const [activeTab, setActiveTab] = useState<JutsuTabId>('ninjutsu');
  const [inspectedJutsuId, setInspectedJutsuId] = useState<string | null>(null);

  const war = state.war!;
  const battle = war.activeBattle!;
  const enemy = war.enemies.find((e) => e.id === battle.enemyId)!;

  const knownJutsu = useMemo(() => getKnownJutsu(state), [state]);
  const lockedNext = useMemo(() => getNextTierLockedJutsu(state), [state]);
  const availableModes = useMemo(() => getAvailableModes(state), [state]);
  const activeModes = getActivePlayerModes(battle);
  const optionById = useMemo(
    () => new Map(decision.options.map((o) => [o.id, o])),
    [decision.options],
  );

  // Group known + next-tier locked jutsu by tab
  const knownByTab = useMemo(() => {
    const groups: Record<JutsuTabId, JutsuDefinition[]> = {
      ninjutsu: [],
      taijutsu: [],
      genjutsu: [],
      other: [],
    };
    for (const j of knownJutsu) {
      groups[getTabForJutsu(j)].push(j);
    }
    return groups;
  }, [knownJutsu]);

  const lockedByTab = useMemo(() => {
    const groups: Record<JutsuTabId, { jutsu: JutsuDefinition; requirementLabel: string }[]> = {
      ninjutsu: [],
      taijutsu: [],
      genjutsu: [],
      other: [],
    };
    for (const item of lockedNext) {
      groups[getTabForJutsu(item.jutsu)].push(item);
    }
    return groups;
  }, [lockedNext]);

  const otherSpecialOpts = useMemo(
    () =>
      decision.options.filter(
        (o) =>
          o.id === 'bloodline' ||
          o.id === 'exploit_weakness' ||
          o.id === 'partner_free_surpass' ||
          o.id === 'resolve_boost' ||
          o.id === 'resolve_cp' ||
          o.id === 'resolve_flee',
      ),
    [decision.options],
  );
  const retreatOpt = optionById.get('retreat');

  // Reset scroll & default inspected jutsu on each new round
  useEffect(() => {
    if (innerRef.current) {
      innerRef.current.scrollTop = 0;
    }
    const firstInTab = knownByTab[activeTab][0] ?? knownJutsu[0] ?? null;
    setInspectedJutsuId(firstInTab?.id ?? null);
  }, [decision.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Update inspected jutsu when switching tab
  useEffect(() => {
    const firstInTab = knownByTab[activeTab][0] ?? lockedByTab[activeTab][0]?.jutsu ?? null;
    setInspectedJutsuId(firstInTab?.id ?? null);
  }, [activeTab, knownByTab, lockedByTab]);

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

  // Active tab executable options (mapped to number keys 1..9)
  const activeTabActionIds = useMemo(() => {
    const ids: string[] = knownByTab[activeTab].map((j) => `jutsu:${j.id}`);
    if (activeTab === 'other') {
      for (const sp of otherSpecialOpts) ids.push(sp.id);
      if (retreatOpt) ids.push('retreat');
    }
    return ids;
  }, [activeTab, knownByTab, otherSpecialOpts, retreatOpt]);

  // Keyboard shortcuts: 0 toggles Minimize, 1..9 pick cards in active tab, R triggers Retreat
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

      if ((e.key === 'r' || e.key === 'R') && retreatOpt && !retreatOpt.disabled) {
        e.preventDefault();
        onResolve('retreat');
        return;
      }

      const num = Number(e.key);
      if (Number.isInteger(num) && num >= 1 && num <= 9) {
        const targetId = activeTabActionIds[num - 1];
        if (targetId) {
          const opt = optionById.get(targetId);
          if (opt && !opt.disabled) {
            e.preventDefault();
            onResolve(targetId);
          }
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [shortcutsBlocked, minimized, onMinimizedChange, activeTabActionIds, optionById, retreatOpt, onResolve]);

  const playerRanks = getPlayerRanks(state, battle.resolveBoostThisRound);
  const playerTier = getCombatTier(playerRanks);
  const enemyDisplayRanks = getDisplayEnemyRanks(enemy);
  const enemyTier = getCombatTier(enemyDisplayRanks);
  const gapRead = getPowerGapRead(state, enemy, battle.resolveBoostThisRound);
  const ult = getPlayerSignatureUltimate(state);
  const partner = war.partner;
  const enemyKnown = enemy.intel >= 80;
  const enemyArchLabel = ARCHETYPE_LABELS[enemy.archetype];
  const headerEnemy = battle.isFinal
    ? `Final Night: ${enemyKnown ? enemy.name : enemyArchLabel}`
    : enemyKnown
      ? enemy.name
      : enemyArchLabel;

  const officialRankLabel = enemy.formerShinobi
    ? `Former ${OFFICIAL_RANK_LABELS[enemy.officialRank]}`
    : OFFICIAL_RANK_LABELS[enemy.officialRank];

  const retreatPct = estimateRetreatChance(state, enemy, battle.resolveBoostThisRound);
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
  for (const mId of activeModes) {
    const mDef = MODE_MAP[mId];
    if (mDef) playerMods.push(`▲▲ ${mDef.name} Mode (-${getModeUpkeepCp(state, mId)} CP/r)`);
  }
  if (battle.playerSelf) {
    for (const [k, inst] of Object.entries(battle.playerSelf)) {
      if (!inst) continue;
      const lbl = SELF_DISPLAY[k as SelfStateId] ?? k;
      playerMods.push(`▲ ${lbl}${inst.value && k === 'wall' ? ` ${inst.value}` : ''} (${inst.rounds}r)`);
    }
  } else {
    if (battle.playerWardRounds > 0) playerMods.push(`▲ Barrier (${battle.playerWardRounds}r)`);
    if (battle.playerCloneEvade) playerMods.push('▲ Clone Feint');
  }
  if (battle.playerStatus) {
    for (const [k, inst] of Object.entries(battle.playerStatus)) {
      if (!inst) continue;
      const lbl = STATUS_DISPLAY[k as StatusId] ?? k;
      playerMods.push(`▼ ${lbl} (${inst.rounds}r)`);
    }
  }
  if (battle.playerBuffRounds > 0) playerMods.push(`▲ Tactical Buff +8 (${battle.playerBuffRounds}r)`);
  if (battle.weaknessExploited) playerMods.push('▲ Weakness Read');
  if (war.nextBattleBonus > 0) playerMods.push(`▲ Prep Bonus (+${war.nextBattleBonus})`);
  if (war.strategicClaimedBy === 'player') playerMods.push('▲ High Ground (+6)');
  if (partner?.active) {
    const tier = getPartnerTrustTier(partner.trust);
    playerMods.push(`▲ ${partner.name}: ${tier.label} (HP ${partner.hp})`);
  }
  if (battle.resolveBoostThisRound) playerMods.push('▲▲ Surpass Limits');
  if (state.bloodline?.mangekyoAwakened || (state.bloodline?.eyeStrain ?? 0) > 0) {
    if (state.bloodline?.eternalMangekyo) {
      playerMods.push('▲▲ Eternal Mangekyo (0 Strain)');
    } else if (state.bloodline?.blinded) {
      playerMods.push('▼▼ Mangekyo BLINDED (Needs EMS)');
    } else {
      playerMods.push(`▼ Eye Strain ${state.bloodline?.eyeStrain ?? 0}/20`);
    }
  }
  if (battle.gate8Used) {
    playerMods.push('▼▼ Eighth Gate Opened (Fatal Aftermath)');
  }

  const enemyMods: string[] = [`▲▲ ${TACTIC_LABELS[enemy.tactic]}`];
  if (battle.enemySelf && Object.keys(battle.enemySelf).length > 0) {
    for (const [k, inst] of Object.entries(battle.enemySelf)) {
      if (!inst) continue;
      const lbl = SELF_DISPLAY[k as SelfStateId] ?? k;
      enemyMods.push(`▲ ${lbl}${inst.value && k === 'wall' ? ` ${inst.value}` : ''} (${inst.rounds}r)`);
    }
  } else {
    if (battle.enemyWallRounds > 0) enemyMods.push(`▲ Guard Wall (${battle.enemyWallRounds}r)`);
    if (battle.enemyFieldRounds > 0) enemyMods.push(`▲ Terrain Field (${battle.enemyFieldRounds}r)`);
  }
  if (battle.enemyStatus && Object.keys(battle.enemyStatus).length > 0) {
    for (const [k, inst] of Object.entries(battle.enemyStatus)) {
      if (!inst) continue;
      const lbl = STATUS_DISPLAY[k as StatusId] ?? k;
      enemyMods.push(`▼ ${lbl} (${inst.rounds}r)`);
    }
  } else if (battle.enemyDebuffRounds > 0) {
    enemyMods.push(`▼ Disrupted (${battle.enemyDebuffRounds}r)`);
  }

  const inspectedJutsu =
    knownJutsu.find((j) => j.id === inspectedJutsuId) ??
    lockedNext.find((x) => x.jutsu.id === inspectedJutsuId)?.jutsu ??
    knownByTab[activeTab][0] ??
    null;
  const inspectedMastery = inspectedJutsu
    ? getJutsuMasteryInfo(state.jutsuMastery?.[inspectedJutsu.id] ?? 0)
    : null;

  return (
    <>
      {minimized && (
        <div className="battle-minimized-bar" role="region" aria-label="Minimized battle controls">
          <div className="battle-min-info">
            <strong>
              {headerEnemy} · Round {battle.round} · Threat {enemy.threatClass}
            </strong>
            <span className="disc-sub tabular">
              You {war.hp} HP / {war.cp} CP | {gapRead.label} | Enemy: {enemyCond}
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
          {/* Header Bar with Threat Class, Enemy Combat Tier & Power-Gap Read */}
          <header className="battle-header">
            <div>
              <h1 id={titleId} className="battle-title">
                {headerEnemy} · Round {battle.round}
                {!battle.isFinal && <span className="battle-round-cap"> / {battle.maxRounds}</span>}
              </h1>
              <div className="chip-row tabular" style={{ marginTop: 6 }}>
                <span className={`power-gap-badge ${enemy.threatClass === 'S' ? 'danger' : enemy.threatClass === 'A' ? 'warn' : ''}`}>
                  Threat {enemy.threatClass}
                </span>
                <span className="power-gap-badge">
                  Tier: {COMBAT_TIER_LABELS[enemyTier]}{gapRead.isEstimate ? ' (est.)' : ''}
                </span>
                <span className={`power-gap-badge ${getGapBadgeClass(gapRead.label)}`}>
                  Read: {gapRead.label}{gapRead.isEstimate ? ' (est.)' : ''}
                </span>
                {enemyKnown && (
                  <span className="power-gap-badge">{officialRankLabel}</span>
                )}
                {decision.manual && (
                  <span className="chip">Critical Decision (Auto-Play Paused)</span>
                )}
              </div>
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
            {/* Left: Player Card (Unified Single Chakra Meter) */}
            <section className="battle-fighter-card battle-card-player" aria-label="Your Combat Status">
              <div className="fighter-top">
                <div className="diamond-emblem player-emblem" aria-hidden="true">
                  <span className="diamond-inner kanji-glyph">{ELEMENT_KANJI[state.element]}</span>
                </div>
                <div className="fighter-id">
                  <div className="fighter-role">
                    You · {t(`rank.${state.rank}`)} ({COMBAT_TIER_LABELS[playerTier]}) · {ELEMENT_NAMES[state.element]}
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
                <span>Fort {war.fort}</span>
                <span>Resolves {war.resolves}</span>
              </div>

              {partner && (
                <div className="fighter-meta-line tabular">
                  Partner {partner.name}{' '}
                  {partner.active
                    ? `HP ${partner.hp} (Trust ${partner.trust})`
                    : partner.died
                      ? '(Fallen)'
                      : partner.defected
                        ? '(Defected)'
                        : '(Down)'}
                </div>
              )}
              {ult && (
                <div className="fighter-meta-line">
                  Clash Art: <strong>{ult.name}</strong> · {rankValueToGrade(ult.rankVal)}
                </div>
              )}

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
                  <div className="fighter-role">
                    Threat {enemy.threatClass} · {enemyKnown ? officialRankLabel : enemyArchLabel}
                  </div>
                  <div className="fighter-name">{enemyKnown ? enemy.name : 'Unknown'}</div>
                </div>
                <div className="diamond-emblem enemy-emblem" aria-hidden="true">
                  <span className="diamond-inner">
                    {enemyKnown ? enemy.name.slice(0, 2).toUpperCase() : enemy.threatClass}
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
            {enemyKnown ? `${enemy.name} (${enemy.epithet}).` : 'An unknown foe.'} Enemy: {enemyCond} · You: {playerCond}
          </p>

          {/* Instant Mode Toggle Strip (Free Action: 1 Dojutsu + 1 Body Mode) */}
          {availableModes.length > 0 && (
            <div className="battle-mode-strip" role="region" aria-label="Instant Mode Toggles">
              <span className="disc-sub" style={{ fontWeight: 600 }}>
                Modes (Instant):
              </span>
              {availableModes.map((mode) => {
                const check = canToggleBattleMode(state, war, battle, mode.id);
                const upkeep = getModeUpkeepCp(state, mode.id);
                return (
                  <button
                    key={mode.id}
                    type="button"
                    className={`mode-toggle-btn ${check.isActive ? 'active' : ''}`}
                    disabled={!check.allowed}
                    title={check.reason ?? mode.description}
                    onClick={() => onResolve(`toggle_mode:${mode.id}`)}
                  >
                    <span>{mode.name}</span>
                    <span className="tabular" style={{ opacity: 0.85, fontSize: '0.72rem' }}>
                      {check.isActive ? 'ON' : check.reason ? check.reason : `-${upkeep} CP/r`}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Phase 5: Jutsu Category Tabs (Ninjutsu / Taijutsu / Genjutsu / Other) */}
          <div className="battle-jutsu-tabs" role="tablist" aria-label="Jutsu Categories">
            {(
              [
                ['ninjutsu', `Ninjutsu (${knownByTab.ninjutsu.length})`],
                ['taijutsu', `Taijutsu (${knownByTab.taijutsu.length})`],
                ['genjutsu', `Genjutsu (${knownByTab.genjutsu.length})`],
                ['other', `Other (${knownByTab.other.length + otherSpecialOpts.length})`],
              ] as [JutsuTabId, string][]
            ).map(([tabId, label]) => (
              <button
                key={tabId}
                type="button"
                role="tab"
                aria-selected={activeTab === tabId}
                className="tab-btn"
                onClick={() => setActiveTab(tabId)}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Detail Panel for Inspected Jutsu */}
          {inspectedJutsu && inspectedMastery && (
            <div className="jutsu-detail-panel" aria-live="polite">
              <div className="disc-head">
                <strong>
                  {inspectedJutsu.name} ({inspectedJutsu.rank}-Rank · {ROLE_LABELS[inspectedJutsu.role]})
                </strong>
                <span className="disc-sub tabular">
                  Mastery: {inspectedMastery.label} ({inspectedMastery.uses}
                  {inspectedMastery.nextThreshold ? `/${inspectedMastery.nextThreshold}` : '+'})
                </span>
              </div>
              <div className="disc-sub">{inspectedJutsu.description}</div>
              {inspectedJutsu.seals.length > 0 && (
                <div className="chip-row" style={{ marginTop: 2 }}>
                  <span className="disc-sub">Seals:</span>
                  {inspectedJutsu.seals.map((seal, idx) => (
                    <span key={`${seal}_${idx}`} className="chip">
                      {ZODIAC_SEAL_KANJI[seal] ?? ''} {seal}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Jutsu Card Grid for Active Tab */}
          <div className="battle-jutsu-grid">
            {knownByTab[activeTab].map((jutsu, idx) => {
              const optId = `jutsu:${jutsu.id}`;
              const opt = optionById.get(optId);
              const effCost = getEffectiveJutsuCost(state, jutsu, war);
              const mastery = getJutsuMasteryInfo(state.jutsuMastery?.[jutsu.id] ?? 0);
              const isCombat = jutsu.style !== 'support';
              const odds = isCombat
                ? estimateBattleActionOdds(
                    state,
                    enemy,
                    jutsu.style as BattleAttackStyle,
                    battle.resolveBoostThisRound,
                    jutsu.element,
                  )
                : null;
              const keyNum = idx < 9 ? idx + 1 : null;
              const disabled = Boolean(opt?.disabled);

              return (
                <button
                  key={jutsu.id}
                  type="button"
                  className={`jutsu-card-btn ${jutsu.role === 'clash' ? 'clash-card' : ''} ${inspectedJutsu?.id === jutsu.id ? 'selected' : ''}`}
                  disabled={disabled}
                  onMouseEnter={() => setInspectedJutsuId(jutsu.id)}
                  onFocus={() => setInspectedJutsuId(jutsu.id)}
                  onClick={() => onResolve(optId)}
                >
                  <div className="action-card-top">
                    {keyNum !== null && <span className="action-key tabular">{keyNum}</span>}
                    <span className="action-title" style={{ fontSize: '0.88rem' }}>
                      {jutsu.name}
                    </span>
                    <span className="rank-pill tabular">{jutsu.rank}</span>
                  </div>
                  <div className="chip-row tabular">
                    <span className={`cost-chip ${effCost === 0 ? 'neutral' : ''}`}>
                      {effCost === 0 ? '0 CP' : `-${effCost} CP`}
                    </span>
                    <span className="cost-chip neutral">{ROLE_LABELS[jutsu.role]}</span>
                    <span className="cost-chip neutral">{mastery.label}</span>
                    {odds && (
                      <span className={`odds-pill ${odds.tier}`}>
                        {odds.tier === 'strong' ? '▲' : odds.tier === 'weak' ? '▼' : '◆'} {odds.label}
                      </span>
                    )}
                    {formatJutsuChips(jutsu, battle).map((chip) => (
                      <span key={chip.label} className={`effect-chip ${chip.tone}`}>
                        {chip.label}
                      </span>
                    ))}
                  </div>
                  {disabled && opt?.disabledReason && (
                    <div className="disc-sub" style={{ color: '#e69b9b' }}>
                      {opt.disabledReason}
                    </div>
                  )}
                </button>
              );
            })}

            {/* Locked Next-Tier Jutsu Previews */}
            {lockedByTab[activeTab].map(({ jutsu, requirementLabel }) => (
              <button
                key={`locked_${jutsu.id}`}
                type="button"
                className="jutsu-card-btn"
                disabled
                onMouseEnter={() => setInspectedJutsuId(jutsu.id)}
              >
                <div className="action-card-top">
                  <span className="action-title" style={{ fontSize: '0.86rem' }}>
                    {jutsu.name}
                  </span>
                  <span className="rank-pill tabular">{jutsu.rank}</span>
                </div>
                <div className="disc-sub">{requirementLabel}</div>
              </button>
            ))}

            {/* Special Actions (Bloodline, Exploit Weakness, Resolves) in Other Tab */}
            {activeTab === 'other' &&
              otherSpecialOpts.map((opt, spIdx) => {
                const keyIdx = knownByTab.other.length + spIdx + 1;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    className="jutsu-card-btn"
                    disabled={opt.disabled}
                    onClick={() => onResolve(opt.id)}
                  >
                    <div className="action-card-top">
                      {keyIdx <= 9 && <span className="action-key tabular">{keyIdx}</span>}
                      <span className="action-title" style={{ fontSize: '0.86rem' }}>
                        {opt.label}
                      </span>
                    </div>
                    {opt.sublabel && <div className="disc-sub">{opt.sublabel}</div>}
                    {opt.disabled && opt.disabledReason && (
                      <div className="disc-sub" style={{ color: '#e69b9b' }}>
                        {opt.disabledReason}
                      </div>
                    )}
                  </button>
                );
              })}
          </div>

          {knownByTab[activeTab].length === 0 &&
            lockedByTab[activeTab].length === 0 &&
            (activeTab !== 'other' || otherSpecialOpts.length === 0) && (
              <p className="history-sub">No learned techniques in this category yet.</p>
            )}

          {/* Always-Accessible Tactical Footer: Shunshin Retreat & Instant Body Flicker Escape */}
          {!battle.isFinal && retreatOpt && (
            <div className="battle-actions-list" style={{ marginTop: 4 }}>
              <button
                type="button"
                className="battle-action-card"
                disabled={retreatOpt.disabled}
                onClick={() => onResolve('retreat')}
              >
                <div className="action-card-top">
                  <span className="action-key tabular">R</span>
                  <span className="action-title">Shunshin Retreat</span>
                  <span className={`odds-pill ${retreatPct >= 65 ? 'strong' : retreatPct <= 45 ? 'weak' : 'even'} tabular`}>
                    Escape ~{retreatPct}%
                  </span>
                </div>
                <div className="action-card-desc">
                  Disengage through smoke · Failed escape risks 14 to 24 parting damage
                </div>
              </button>
            </div>
          )}
        </div>
      </dialog>
    </>
  );
}
