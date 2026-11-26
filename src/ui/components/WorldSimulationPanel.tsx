import { useState } from 'react';
import { OCCUPATION_MAP } from '../../data/characters';
import { CLAN_MAP } from '../../data/clans';
import { GOVERNANCE_ACTIONS, type GovernanceActionId } from '../../data/events-politics';
import { t } from '../../data/i18n';
import { GREAT_VILLAGES, VILLAGE_MAP } from '../../data/villages';
import {
  ensureVillagePopulation,
  getVillageActiveShinobi,
  getVillageTotalPopulation,
  getWorldPopulationSummary,
} from '../../sim/npc/lod-population';
import { getPrimaryPersonalityTags, getScheduleLabel } from '../../sim/npc-sim';
import { getLifeBingoBookEntries } from '../../sim/people';
import { canAccessGovernance, canRunGovernanceAction } from '../../sim/politics';
import { deriveRelArchetype, getRelVector } from '../../sim/relationships';
import { CHANNEL_LABELS } from '../../sim/timeline';
import type { GameState, VillageId, WorldNpc } from '../../sim/types';
import { getDiplomacyEdge } from '../../sim/world-sim';
import { NpcDossierModal } from './NpcDossierModal';

interface WorldSimulationPanelProps {
  state: GameState;
  onInvestigateTimeline?: (eventId: string) => void;
  onGovernanceAction?: (actionId: GovernanceActionId) => void;
}

type SubView = 'timeline' | 'village' | 'world' | 'npcs';
type NpcFilter = 'my_village' | 'bingo_book' | 'l1_detailed' | 'leaders' | 'all_living' | 'missing_nin' | 'fallen';

function diplomacyClass(status: string): string {
  if (status === 'allied' || status === 'treaty') return 'pos';
  if (status === 'hostile' || status === 'at_war' || status === 'strained') return 'neg';
  return '';
}

export function WorldSimulationPanel({
  state,
  onInvestigateTimeline,
  onGovernanceAction,
}: WorldSimulationPanelProps) {
  const [subView, setSubView] = useState<SubView>('timeline');
  const [selectedVillageId, setSelectedVillageId] = useState<VillageId>(state.villageId);
  const [npcFilter, setNpcFilter] = useState<NpcFilter>('my_village');
  const [selectedNpcId, setSelectedNpcId] = useState<string | null>(null);

  const worldSim = state.worldSim;
  if (!worldSim) {
    return (
      <section className="panel">
        <h2 className="panel-title">Autonomous World Simulation</h2>
        <p className="history-sub">World simulation data initializes on your next year tick.</p>
      </section>
    );
  }

  const inspectedVillage = worldSim.villages[selectedVillageId] ?? worldSim.villages[state.villageId];
  const inspectedVillageDef = VILLAGE_MAP[inspectedVillage.villageId];
  const inspectedPolitics = inspectedVillage.politics;
  const inspectedPop = ensureVillagePopulation(inspectedVillage);
  const worldPopSummary = getWorldPopulationSummary(worldSim);
  const kageNpc =
    inspectedVillage.kageNpcId && inspectedVillage.kageNpcId !== 'player'
      ? worldSim.npcs.find((n) => n.identity.id === inspectedVillage.kageNpcId) ?? null
      : null;

  const selectedNpc: WorldNpc | null = selectedNpcId
    ? worldSim.npcs.find((n) => n.identity.id === selectedNpcId) ?? null
    : null;

  const knownTimeline = [...(worldSim.timeline ?? [])]
    .filter((ev) => ev.knownByPlayer)
    .reverse();
  const hiddenCount = (worldSim.timeline ?? []).filter((ev) => !ev.knownByPlayer).length;

  const bingoBookNpcs = getLifeBingoBookEntries(state);
  const filteredNpcs =
    npcFilter === 'bingo_book'
      ? bingoBookNpcs
      : worldSim.npcs
          .filter((n) => {
            if (npcFilter === 'fallen') return !n.identity.alive;
            if (!n.identity.alive) return false;
            if (npcFilter === 'my_village') return n.identity.villageId === state.villageId;
            if (npcFilter === 'l1_detailed') return n.cognition?.lodTier === 'L1';
            if (npcFilter === 'leaders')
              return n.identity.specialStatus === 'kage' || n.identity.roleTitle.includes('Head') || n.identity.specialStatus === 'anbu';
            if (npcFilter === 'missing_nin') return n.identity.specialStatus === 'missing_nin';
            return true;
          })
          .sort((a, b) => {
            const aKnown = a.relationships.player ? 1 : 0;
            const bKnown = b.relationships.player ? 1 : 0;
            if (aKnown !== bKnown) return bKnown - aKnown;
            return b.identity.powerScore - a.identity.powerScore;
          });

  const villageChoices: VillageId[] = [
    ...GREAT_VILLAGES.map((v) => v.id),
    ...(GREAT_VILLAGES.some((v) => v.id === state.villageId) ? [] : [state.villageId]),
  ];

  const hasGovAccess = canAccessGovernance(state);

  return (
    <section className="panel">
      <div className="disc-head" style={{ marginBottom: 8 }}>
        <h2 className="panel-title" style={{ margin: 0 }}>
          Living Shinobi World
        </h2>
        <span className="status-tag tabular">
          Pop: {worldPopSummary.totalWorldPopulation.toLocaleString()} | Econ: {worldSim.economy} ({worldSim.economyTrend})
        </span>
      </div>

      <div className="tab-strip tab-strip-4" style={{ marginBottom: 12 }} role="tablist" aria-label="World Layers">
        <button
          type="button"
          role="tab"
          aria-selected={subView === 'timeline'}
          className="tab-btn"
          onClick={() => setSubView('timeline')}
        >
          Timeline
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={subView === 'village'}
          className="tab-btn"
          onClick={() => setSubView('village')}
        >
          Politics
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={subView === 'world'}
          className="tab-btn"
          onClick={() => setSubView('world')}
        >
          Diplomacy
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={subView === 'npcs'}
          className="tab-btn"
          onClick={() => setSubView('npcs')}
        >
          NPCs ({worldSim.npcs.filter((n) => n.identity.alive).length})
        </button>
      </div>

      {/* PILLAR 1: LIVING TIMELINE + EPISTEMIC FOG-OF-WAR */}
      {subView === 'timeline' && (
        <div className="stat-list">
          <div className="disc-item">
            <div className="disc-head">
              <span>Living Timeline (Player Knowledge)</span>
              <span className="disc-sub tabular">
                {knownTimeline.length} Known | {hiddenCount} Undiscovered
              </span>
            </div>
            <div className="disc-sub" style={{ marginTop: 4 }}>
              World events unfold independently. You only see what reaches you via Gazette, Rumors, Mission Intel, Trusted NPCs, or ANBU Dossiers.
            </div>
          </div>

          <div className="stat-list npc-list-scroll">
            {knownTimeline.map((ev) => {
              const title = ev.playerKnowsTruth ? ev.truthTitle : ev.rumorTitle;
              const summary = ev.playerKnowsTruth ? ev.truthSummary : ev.rumorSummary;
              const isRumor = !ev.playerKnowsTruth;
              const canInvestigate =
                isRumor &&
                state.phase === 'life' &&
                !state.pending &&
                Boolean(onInvestigateTimeline) &&
                (state.stats.ryo >= 4 || state.specialStatus === 'anbu' || state.specialStatus === 'kage');

              return (
                <article
                  key={ev.id}
                  className="disc-item"
                  style={isRumor ? { borderColor: 'var(--accent-gold)' } : undefined}
                >
                  <div className="disc-head">
                    <span className="tabular">
                      Year {ev.eraYear} ({ev.year}): {title}
                    </span>
                    <span className={`chip ${isRumor ? '' : ev.discoveryChannel === 'anbu_dossier' ? 'neg' : 'pos'}`}>
                      {CHANNEL_LABELS[ev.discoveryChannel]}
                    </span>
                  </div>
                  <div className="disc-sub" style={{ marginTop: 4 }}>
                    {summary}
                  </div>
                  <div className="disc-head" style={{ marginTop: 6 }}>
                    <span className="disc-sub">
                      Source: {ev.sourceLabel ?? CHANNEL_LABELS[ev.discoveryChannel]}
                      {isRumor ? ' (Unverified: hidden truth may lie deeper)' : ''}
                    </span>
                    {isRumor && onInvestigateTimeline && (
                      <button
                        type="button"
                        className="btn btn-sm btn-ghost"
                        disabled={!canInvestigate}
                        onClick={() => onInvestigateTimeline(ev.id)}
                        title="Spend 4 Ryo (or ANBU/Kage clearance) to uncover the truth behind this rumor"
                      >
                        Investigate {state.specialStatus === 'anbu' || state.specialStatus === 'kage' ? '(ANBU)' : '(-4 Ryo)'}
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      )}

      {/* PILLAR 6 & LAYER 2: VILLAGE ORGANIZATIONS & GOVERNANCE POLITICS */}
      {subView === 'village' && (
        <div className="stat-list">
          <div className="chip-row" style={{ marginBottom: 4 }}>
            {villageChoices.map((vId) => (
              <button
                key={vId}
                type="button"
                className={`chip chip-btn ${selectedVillageId === vId ? 'pos' : ''}`}
                onClick={() => setSelectedVillageId(vId)}
              >
                {VILLAGE_MAP[vId].name}
                {vId === state.villageId ? ' (Home)' : ''}
              </button>
            ))}
          </div>

          <div className="disc-item">
            <div className="disc-head">
              <span>{inspectedVillageDef.name}</span>
              <span className="status-tag">Policy: {inspectedVillage.policy.replace('_', ' ')}</span>
            </div>
            <div className="disc-sub" style={{ marginTop: 4 }}>
              {inspectedVillageDef.culture}
            </div>
            <div className="disc-sub" style={{ marginTop: 6 }}>
              <strong>{inspectedVillageDef.kageTitle}:</strong>{' '}
              {inspectedVillage.kageNpcId === 'player' ? (
                <span>{state.name} (You)</span>
              ) : kageNpc ? (
                <button
                  type="button"
                  className="chip chip-btn pos"
                  onClick={() => setSelectedNpcId(kageNpc.identity.id)}
                >
                  {kageNpc.identity.name} (Inspect)
                </button>
              ) : (
                <span>Seat Vacant (Succession Pending)</span>
              )}
            </div>
          </div>

          <div className="disc-item tabular">
            <div className="disc-head">
              <span>Institutions &amp; Governance</span>
              <span className="disc-sub">Daimyo: {inspectedVillage.daimyo.stance}</span>
            </div>
            <div className="stat-list" style={{ marginTop: 6 }}>
              <div className="stat-row">
                <span>Daimyo Fund</span>
                <div className="bar-track">
                  <div className="bar-fill" style={{ width: `${inspectedVillage.daimyo.funding}%` }} />
                </div>
                <span>{inspectedVillage.daimyo.funding}</span>
              </div>
              <div className="stat-row">
                <span>Stability</span>
                <div className="bar-track">
                  <div className="bar-fill health" style={{ width: `${inspectedVillage.stability}%` }} />
                </div>
                <span>{inspectedVillage.stability}</span>
              </div>
              {inspectedPolitics && (
                <div className="stat-row">
                  <span>Corruption</span>
                  <div className="bar-track">
                    <div className="bar-fill tension" style={{ width: `${inspectedPolitics.corruption}%` }} />
                  </div>
                  <span>{inspectedPolitics.corruption}</span>
                </div>
              )}
              <div className="stat-row">
                <span>Academy</span>
                <div className="bar-track">
                  <div className="bar-fill" style={{ width: `${inspectedVillage.academy.quality}%` }} />
                </div>
                <span>{inspectedVillage.academy.quality}</span>
              </div>
              <div className="stat-row">
                <span>Hospital</span>
                <div className="bar-track">
                  <div className="bar-fill health" style={{ width: `${inspectedVillage.hospital.capacity}%` }} />
                </div>
                <span>{inspectedVillage.hospital.capacity}</span>
              </div>
              <div className="stat-row">
                <span>ANBU</span>
                <div className="bar-track">
                  <div className="bar-fill chakra" style={{ width: `${inspectedVillage.anbu.strength}%` }} />
                </div>
                <span>{inspectedVillage.anbu.strength}</span>
              </div>
            </div>

            {inspectedPolitics && (
              <>
                <div className="chip-row tabular" style={{ marginTop: 8 }}>
                  <span className="chip">Hawks {inspectedPolitics.factions.hawks}</span>
                  <span className="chip pos">Doves {inspectedPolitics.factions.doves}</span>
                  <span className="chip">Elders {inspectedPolitics.factions.elders}</span>
                  <span className="chip">Clans {inspectedPolitics.factions.clans}</span>
                </div>
                <div className="disc-sub" style={{ marginTop: 6 }}>
                  <strong>Active Directives:</strong> {inspectedPolitics.activeDirectives.join(' | ')}
                </div>
              </>
            )}

            <div className="disc-sub" style={{ marginTop: 4 }}>
              <strong>{inspectedVillage.shadowOrg.name}:</strong> Influence {inspectedVillage.shadowOrg.influence} | Agenda:{' '}
              {inspectedVillage.shadowOrg.agenda.replace('_', ' ')}
            </div>
            {inspectedVillage.anbu.activeOp && (
              <div className="disc-sub" style={{ marginTop: 3, color: 'var(--accent-crimson)' }}>
                <strong>Active ANBU Op:</strong> {inspectedVillage.anbu.activeOp}
              </div>
            )}
          </div>

          <div className="disc-item tabular">
            <div className="disc-head">
              <span>L3 Village Demographics</span>
              <span className="status-tag">Total ~{getVillageTotalPopulation(inspectedPop).toLocaleString()}</span>
            </div>
            <div className="chip-row" style={{ marginTop: 6 }}>
              <span className="chip">Civilians {inspectedPop.civilians.toLocaleString()}</span>
              <span className="chip pos">Active Shinobi {getVillageActiveShinobi(inspectedPop)}</span>
              <span className="chip">Cadets {inspectedPop.academyCadets}</span>
              <span className="chip">Veterans {inspectedPop.veterans}</span>
              <span className={`chip ${inspectedPop.sicknessRate >= 35 ? 'neg' : ''}`}>
                Illness {inspectedPop.sicknessRate}%
              </span>
              <span className="chip">Orphans {inspectedPop.orphansCount}</span>
              {inspectedPop.warCasualtiesTotal > 0 && (
                <span className="chip neg">War Dead {inspectedPop.warCasualtiesTotal}</span>
              )}
            </div>
            <div className="disc-sub" style={{ marginTop: 4 }}>
              Corps Breakdown: {inspectedPop.geninCorps} Genin | {inspectedPop.chuninCorps} Chunin |{' '}
              {inspectedPop.joninCorps} Jonin (World LOD: {worldPopSummary.l1NpcCount} L1 Detailed,{' '}
              {worldPopSummary.l2NpcCount} L2 Periodic)
            </div>
          </div>

          {/* Interactive Council Governance Actions for Home Village (Jonin / ANBU / Clan Heir / Kage) */}
          {selectedVillageId === state.villageId && hasGovAccess && onGovernanceAction && (
            <div className="disc-item" style={{ borderColor: 'var(--accent-gold)' }}>
              <div className="disc-head">
                <span>Village Governance Actions</span>
                <span className="disc-sub">3-year cooldown</span>
              </div>
              <div className="stat-list" style={{ marginTop: 6 }}>
                {GOVERNANCE_ACTIONS.map((act) => {
                  const enabled = canRunGovernanceAction(state, act.id);
                  return (
                    <button
                      key={act.id}
                      type="button"
                      className="btn btn-sm btn-ghost"
                      style={{ textAlign: 'left', justifyContent: 'space-between' }}
                      disabled={!enabled}
                      onClick={() => onGovernanceAction(act.id)}
                      title={act.desc}
                    >
                      <span>{act.label}</span>
                      <span className="tabular">-{act.ryoCost} Ryo</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="disc-item">
            <div className="disc-head">
              <span>Major Clans ({inspectedVillage.clans.length})</span>
            </div>
            <div className="stat-list" style={{ marginTop: 6 }}>
              {inspectedVillage.clans.map((cState) => {
                const cDef = CLAN_MAP[cState.clanId];
                const head = cState.headNpcId
                  ? worldSim.npcs.find((n) => n.identity.id === cState.headNpcId)
                  : null;
                return (
                  <div key={cState.clanId} className="disc-item" style={{ padding: '6px 8px' }}>
                    <div className="disc-head">
                      <span>
                        {cDef?.name ?? cState.clanId}
                        {state.clanId === cState.clanId ? ' (Your Clan)' : ''}
                      </span>
                      <span className={`chip ${cState.status === 'strained' || cState.status === 'exiled' ? 'neg' : 'pos'}`}>
                        {cState.status}
                      </span>
                    </div>
                    <div className="disc-sub tabular">
                      Power {cState.power} | Loyalty {cState.loyalty}
                      {head && head.identity.alive ? (
                        <>
                          {' '}
                          | Head:{' '}
                          <button
                            type="button"
                            className="chip chip-btn"
                            onClick={() => setSelectedNpcId(head.identity.id)}
                          >
                            {head.identity.name}
                          </button>
                        </>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* LAYER 1: WORLD LAYER & DIPLOMACY */}
      {subView === 'world' && (
        <div className="stat-list">
          {worldSim.activeDisasters.length > 0 && (
            <div className="disc-item" style={{ borderColor: 'var(--accent-crimson)' }}>
              <div className="disc-head">
                <span>Active Regional Disasters</span>
              </div>
              {worldSim.activeDisasters.map((d) => (
                <div key={d.id} className="disc-sub" style={{ marginTop: 4 }}>
                  <strong>{d.title}</strong> in {VILLAGE_MAP[d.villageId].name} (Severity {d.severity}, {d.yearsLeft} yr left)
                </div>
              ))}
            </div>
          )}

          <div className="disc-item">
            <div className="disc-head">
              <span>Five Great Nations Diplomacy</span>
              <span className="disc-sub">vs {VILLAGE_MAP[state.villageId].name}</span>
            </div>
            <div className="stat-list" style={{ marginTop: 6 }}>
              {GREAT_VILLAGES.filter((v) => v.id !== state.villageId).map((other) => {
                const edge = getDiplomacyEdge(worldSim, state.villageId, other.id);
                const oSim = worldSim.villages[other.id];
                return (
                  <div key={other.id} className="disc-head tabular" style={{ fontSize: '0.84rem' }}>
                    <span>
                      {other.name} ({oSim.policy.replace('_', ' ')})
                    </span>
                    <span className={`chip ${diplomacyClass(edge?.status ?? 'neutral')}`}>
                      {(edge?.status ?? 'neutral').replace('_', ' ')} ({edge?.score ?? 0})
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="disc-item">
            <div className="disc-head">
              <span>Strategic Territories</span>
            </div>
            <div className="stat-list" style={{ marginTop: 6 }}>
              {worldSim.territories.map((terr) => (
                <div key={terr.id} className="disc-sub tabular">
                  <strong>{terr.name}</strong>: Held by {VILLAGE_MAP[terr.controller].name}
                  {terr.contestedBy ? ` (Contested by ${VILLAGE_MAP[terr.contestedBy].name}, Heat ${terr.flashpoint}%)` : ' (Neutral)'}
                </div>
              ))}
            </div>
          </div>

          <div className="disc-item">
            <div className="disc-head">
              <span>World History Archive</span>
            </div>
            <div className="stat-list npc-memory-list" style={{ marginTop: 6 }}>
              {[...worldSim.history]
                .reverse()
                .slice(0, 12)
                .map((h) => (
                  <div key={h.id} className="disc-sub">
                    <strong className="tabular">Yr {h.year}</strong> [{h.layer.toUpperCase()}]: <strong>{h.title}</strong> - {h.summary}
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* LAYER 3: INDIVIDUAL AUTONOMOUS NPCS */}
      {subView === 'npcs' && (
        <div className="stat-list">
          <div className="chip-row" style={{ marginBottom: 4 }}>
            {(
              [
                ['my_village', 'My Village'],
                ['bingo_book', `Bingo Book (${bingoBookNpcs.length})`],
                ['l1_detailed', `L1 Detailed (${worldPopSummary.l1NpcCount})`],
                ['leaders', 'Kage & Leaders'],
                ['all_living', 'All Living'],
                ['missing_nin', 'Missing-Nin'],
                ['fallen', 'Fallen'],
              ] as [NpcFilter, string][]
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                className={`chip chip-btn ${npcFilter === key ? 'pos' : ''}`}
                onClick={() => setNpcFilter(key)}
              >
                {label}
              </button>
            ))}
          </div>

          {filteredNpcs.length === 0 ? (
            <p className="history-sub">No NPCs match this filter yet.</p>
          ) : (
            <div className="stat-list npc-list-scroll">
              {filteredNpcs.map((npc) => {
                const { identity, personality, currentGoal, schedule, relationships, knowledge } = npc;
                const vName = VILLAGE_MAP[identity.villageId].name;
                const cName = identity.clanId ? CLAN_MAP[identity.clanId]?.name : null;
                const tags = getPrimaryPersonalityTags(personality);
                const pRel = relationships.player;
                const arch = pRel ? deriveRelArchetype(getRelVector(pRel)) : null;
                return (
                  <button
                    key={identity.id}
                    type="button"
                    className={`disc-item npc-card-btn ${!identity.alive ? 'fallen' : ''}`}
                    onClick={() => setSelectedNpcId(identity.id)}
                  >
                    <div className="disc-head">
                      <span>
                        {identity.name}
                        {identity.epithet ? `, "${identity.epithet}"` : ''}
                        {arch ? ` (${arch})` : ''}
                      </span>
                      <span
                        className={`status-tag ${
                          !identity.alive || identity.specialStatus === 'missing_nin' ? 'tension-high' : ''
                        }`}
                      >
                        {!identity.alive
                          ? 'Fallen'
                          : identity.specialStatus === 'missing_nin'
                            ? 'Missing-Nin'
                            : identity.specialStatus === 'kage'
                              ? VILLAGE_MAP[identity.villageId].kageTitle
                              : identity.occupation !== 'shinobi' && identity.occupation !== 'samurai'
                                ? OCCUPATION_MAP[identity.occupation]?.label ?? identity.roleTitle
                                : t(`rank.${identity.rank}`)}
                      </span>
                    </div>
                    <div className="disc-sub tabular">
                      {npc.cognition ? `[${npc.cognition.lodTier}] ` : ''}Age {identity.age} | {vName}
                      {cName ? ` | ${cName}` : ''} | {tags.join('/')}
                    </div>
                    <div className="disc-sub">
                      <strong>Goal:</strong> {currentGoal.label} ({currentGoal.progress}%)
                    </div>
                    <div className="disc-sub">
                      <strong>Now:</strong> {getScheduleLabel(schedule)}
                      {knowledge.length > 0 ? ` | Intel: ${knowledge.length}` : ''}
                    </div>
                    {npc.cognition?.lastDecision && (
                      <div className="disc-sub">
                        <strong>Mind:</strong> {npc.cognition.lastDecision.chosenLabel} (U={npc.cognition.lastDecision.topOptions[0]?.total ?? 0})
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      <NpcDossierModal
        npc={selectedNpc}
        onClose={() => setSelectedNpcId(null)}
        onSelectNpcId={(id) => setSelectedNpcId(id)}
      />
    </section>
  );
}
