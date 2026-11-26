import { useEffect } from 'react';
import { OCCUPATION_MAP } from '../../data/characters';
import { CLAN_MAP } from '../../data/clans';
import { t } from '../../data/i18n';
import { JUTSU_MAP } from '../../data/jutsu';
import { BLOODLINE_MAP, DISCIPLINE_MAP, ELEMENT_NAMES } from '../../data/powers';
import { VILLAGE_MAP } from '../../data/villages';
import {
  getMotivationLabel,
  getPrimaryPersonalityTags,
  getScheduleLabel,
} from '../../sim/npc-sim';
import { deriveRelArchetype, getReciprocalVector, getRelVector } from '../../sim/relationships';
import type { RelVector6, WorldNpc } from '../../sim/types';

interface NpcDossierModalProps {
  npc: WorldNpc | null;
  onClose: () => void;
  onSelectNpcId?: (npcId: string) => void;
}

function RelVectorBars({ title, vec }: { title: string; vec: RelVector6 }) {
  const axes: { label: string; val: number; barClass?: string }[] = [
    { label: 'Trust', val: vec.trust, barClass: 'health' },
    { label: 'Affection', val: vec.affection, barClass: 'health' },
    { label: 'Respect', val: vec.respect, barClass: 'chakra' },
    { label: 'Fear', val: vec.fear },
    { label: 'Rivalry', val: vec.rivalry },
    { label: 'Resentment', val: vec.resentment, barClass: 'tension' },
  ];
  return (
    <div className="disc-item" style={{ padding: '8px 10px' }}>
      <div className="disc-sub" style={{ fontWeight: 600, marginBottom: 4 }}>
        {title}
      </div>
      <div className="stat-list tabular">
        {axes.map((ax) => (
          <div key={ax.label} className="stat-row">
            <span>{ax.label}</span>
            <div className="bar-track">
              <div className={`bar-fill ${ax.barClass ?? ''}`} style={{ width: `${ax.val}%` }} />
            </div>
            <span>{ax.val}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function NpcDossierModal({ npc, onClose, onSelectNpcId }: NpcDossierModalProps) {
  useEffect(() => {
    if (!npc) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [npc, onClose]);

  if (!npc) return null;

  const { identity, personality, motivation, nindo, relationships, memory, schedule, knowledge, currentGoal, cognition } = npc;
  const village = VILLAGE_MAP[identity.villageId];
  const homeVillage = VILLAGE_MAP[identity.homeVillageId];
  const clan = identity.clanId ? CLAN_MAP[identity.clanId] : null;
  const primaryTags = getPrimaryPersonalityTags(personality);
  const relList = Object.values(relationships);
  const playerRel = relationships.player;
  const npcToPlayerVec = playerRel ? getRelVector(playerRel) : null;
  const playerToNpcVec = playerRel ? getReciprocalVector(playerRel) : null;
  const playerArchetype =
    npcToPlayerVec && playerToNpcVec ? deriveRelArchetype(npcToPlayerVec, playerToNpcVec) : null;
  const newestMemories = [...memory].reverse();

  const personalityRows: { label: string; value: number }[] = [
    { label: 'Loyal', value: personality.loyal },
    { label: 'Ambitious', value: personality.ambitious },
    { label: 'Cautious', value: personality.cautious },
    { label: 'Cruel', value: personality.cruel },
    { label: 'Compassionate', value: personality.compassionate },
  ];

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal-card npc-dossier-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="npc-dossier-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="disc-head" style={{ marginBottom: 8 }}>
          <div>
            <h2 id="npc-dossier-title" className="panel-title" style={{ margin: 0 }}>
              {identity.name}
              {identity.epithet ? ` (${identity.epithet})` : ''}
            </h2>
            <div className="disc-sub tabular">
              {OCCUPATION_MAP[identity.occupation]?.label ?? 'Shinobi'} | {identity.roleTitle} | {village.name}
              {identity.homeVillageId !== identity.villageId ? ` (Origin: ${homeVillage.name})` : ''}
              {clan ? ` | ${clan.name}` : ''}
            </div>
          </div>
          <button type="button" className="btn btn-sm btn-ghost" onClick={onClose}>
            Close
          </button>
        </div>

        {/* 1. IDENTITY */}
        <div className="chip-row tabular" style={{ marginBottom: 12 }}>
          <span className={`chip ${!identity.alive ? 'neg' : identity.specialStatus === 'missing_nin' ? 'neg' : 'pos'}`}>
            {!identity.alive
              ? `Fallen (Age ${identity.deathAge ?? identity.age})`
              : identity.specialStatus === 'missing_nin'
                ? 'Missing-Nin'
                : identity.specialStatus === 'kage'
                  ? village.kageTitle
                  : identity.specialStatus === 'anbu'
                    ? 'ANBU / Shadow'
                    : identity.occupation !== 'shinobi' && identity.occupation !== 'samurai'
                      ? OCCUPATION_MAP[identity.occupation]?.label ?? identity.roleTitle
                      : t(`rank.${identity.rank}`)}
          </span>
          <span className="chip">Age {identity.age}</span>
          <span className="chip">Power {identity.powerScore}</span>
          <span className="chip">{ELEMENT_NAMES[identity.element]}</span>
          <span className="chip">{DISCIPLINE_MAP[identity.specialty]?.name ?? identity.specialty}</span>
          {identity.bloodlineId && BLOODLINE_MAP[identity.bloodlineId] && (
            <span className="chip pos">{BLOODLINE_MAP[identity.bloodlineId].name}</span>
          )}
          {cognition && (
            <span className={`chip ${cognition.lodTier === 'L1' ? 'pos' : ''}`}>
              {cognition.lodTier === 'L1' ? 'L1 Detailed AI' : 'L2 Periodic AI'}
            </span>
          )}
          {primaryTags.map((tag) => (
            <span key={tag} className="chip">
              {tag}
            </span>
          ))}
        </div>

        {identity.background && (
          <div className="disc-item" style={{ marginBottom: 10 }}>
            <div className="disc-sub">{identity.background}</div>
            {identity.jutsuIds && identity.jutsuIds.length > 0 && (
              <div className="disc-sub" style={{ marginTop: 4 }}>
                <strong>Known Jutsu:</strong>{' '}
                {identity.jutsuIds.map((jid) => JUTSU_MAP[jid]?.name ?? jid).join(', ')}
              </div>
            )}
            {identity.permanentInjuries && identity.permanentInjuries > 0 ? (
              <div className="disc-sub" style={{ marginTop: 4, color: 'var(--accent-crimson)' }}>
                Lasting War Injuries: {identity.permanentInjuries}
              </div>
            ) : null}
          </div>
        )}

        {!identity.alive && identity.deathCause && (
          <div className="disc-item" style={{ marginBottom: 10, borderColor: 'var(--accent-crimson)' }}>
            <div className="disc-sub">Cause of Death: {identity.deathCause}</div>
          </div>
        )}

        <div className="npc-dossier-grid">
          {/* 2. PERSONALITY */}
          <section className="disc-item">
            <div className="disc-head">
              <span>Personality</span>
              <span className="disc-sub">{primaryTags.join(' / ')}</span>
            </div>
            <div className="stat-list tabular" style={{ marginTop: 6 }}>
              {personalityRows.map((row) => (
                <div key={row.label} className="stat-row">
                  <span>{row.label}</span>
                  <div className="bar-track">
                    <div className="bar-fill" style={{ width: `${row.value}%` }} />
                  </div>
                  <span>{row.value}</span>
                </div>
              ))}
            </div>
          </section>

          {/* 3. MOTIVATION, 4. NINDO, 7. SCHEDULE, 9. CURRENT GOAL */}
          <section className="disc-item">
            <div className="disc-head">
              <span>Drive, Nindo &amp; Routine</span>
            </div>
            <div className="disc-sub" style={{ marginTop: 4 }}>
              <strong>Motivation:</strong> {getMotivationLabel(motivation)}
            </div>
            <div className="disc-sub" style={{ marginTop: 4, fontStyle: 'italic' }}>
              <strong>Nindo:</strong> &ldquo;{nindo.maxim}&rdquo;
            </div>
            <div className="disc-sub" style={{ marginTop: 4 }}>
              <strong>Schedule:</strong> {getScheduleLabel(schedule)}
            </div>
            <div style={{ marginTop: 8 }}>
              <div className="disc-head">
                <span className="disc-sub">
                  <strong>Current Goal:</strong> {currentGoal.label}
                </span>
                <span className="disc-sub tabular">{currentGoal.progress}%</span>
              </div>
              <div className="bar-track" style={{ marginTop: 4 }}>
                <div className="bar-fill chakra" style={{ width: `${currentGoal.progress}%` }} />
              </div>
            </div>
          </section>
        </div>

        {/* COGNITIVE MIND: UTILITY AI + GOAP + LIFE CONDITION */}
        {cognition && (
          <section className="disc-item" style={{ marginTop: 10 }}>
            <div className="disc-head">
              <span>Cognitive Mind (Utility AI + GOAP)</span>
              <span className="disc-sub tabular">
                Stress {cognition.stress}% | Injury {cognition.injury}%
              </span>
            </div>

            {cognition.familyCrisis && (
              <div className="disc-sub" style={{ marginTop: 6, color: 'var(--accent-crimson)' }}>
                <strong>Active Personal Crisis:</strong> {cognition.familyCrisis.relativeName} (
                {cognition.familyCrisis.kind.replace('_', ' ')}, Severity {cognition.familyCrisis.severity}%)
              </div>
            )}

            {cognition.activePlan && (
              <div style={{ marginTop: 6 }}>
                <div className="disc-head">
                  <span className="disc-sub">
                    <strong>GOAP Plan [{cognition.activePlan.domain.toUpperCase()}]:</strong>{' '}
                    {cognition.activePlan.goalLabel}
                  </span>
                  <span className="disc-sub tabular">Urgency {cognition.activePlan.urgency}</span>
                </div>
                <div className="chip-row" style={{ marginTop: 4 }}>
                  {cognition.activePlan.steps.map((st, idx) => (
                    <span
                      key={`${st.action}_${idx}`}
                      className={`chip ${st.completed ? 'pos' : idx === cognition.activePlan!.currentStepIndex ? '' : ''}`}
                    >
                      {st.completed ? '[Done] ' : idx === cognition.activePlan!.currentStepIndex ? '[Now] ' : ''}
                      {st.label}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {cognition.lastDecision && (
              <div style={{ marginTop: 8 }}>
                <div className="disc-sub">
                  <strong>Latest Choice (Yr {cognition.lastDecision.year}):</strong>{' '}
                  {cognition.lastDecision.reasonSummary}
                </div>
                <div className="stat-list tabular" style={{ marginTop: 6 }}>
                  {cognition.lastDecision.topOptions.map((opt, idx) => (
                    <div key={`${opt.action}_${idx}`} className="disc-head" style={{ fontSize: '0.8rem' }}>
                      <span>
                        {opt.action === cognition.lastDecision!.chosenAction ? '> ' : ''}
                        {opt.label}
                      </span>
                      <span className={`chip ${opt.action === cognition.lastDecision!.chosenAction ? 'pos' : ''}`}>
                        U={opt.total} (G:{opt.gScore} P:{opt.pScore} R:{opt.rScore} M:{opt.mScore})
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        {/* 5. RELATIONSHIP 2.0 (BIDIRECTIONAL 6-AXIS BOND WITH PLAYER) */}
        {npcToPlayerVec && playerToNpcVec && (
          <section className="disc-item" style={{ marginTop: 10, borderColor: 'var(--accent-gold)' }}>
            <div className="disc-head" style={{ marginBottom: 6 }}>
              <span>Bidirectional Bond (Relationship 2.0)</span>
              <span className="status-tag">{playerArchetype}</span>
            </div>
            <div className="npc-dossier-grid">
              <RelVectorBars title={`${identity.name} -> You`} vec={npcToPlayerVec} />
              <RelVectorBars title={`You -> ${identity.name}`} vec={playerToNpcVec} />
            </div>
          </section>
        )}

        {/* ALL NPC NETWORK RELATIONSHIPS */}
        <section className="disc-item" style={{ marginTop: 10 }}>
          <div className="disc-head">
            <span>All Relationships ({relList.length})</span>
          </div>
          {relList.length === 0 ? (
            <div className="disc-sub">No prominent recorded ties yet.</div>
          ) : (
            <div className="chip-row" style={{ marginTop: 6 }}>
              {relList.map((rel) => {
                const vec = getRelVector(rel);
                const arch = deriveRelArchetype(vec);
                const clickable = rel.targetId !== 'player' && Boolean(onSelectNpcId);
                return clickable ? (
                  <button
                    key={rel.targetId}
                    type="button"
                    className={`chip chip-btn ${rel.kind === 'enemy' || vec.resentment >= 60 ? 'neg' : rel.kind === 'spouse' || rel.kind === 'friend' || rel.kind === 'mentor' ? 'pos' : ''}`}
                    onClick={() => onSelectNpcId?.(rel.targetId)}
                    title={`Trust ${vec.trust} | Aff ${vec.affection} | Resp ${vec.respect} | Fear ${vec.fear} | Riv ${vec.rivalry} | Resent ${vec.resentment}`}
                  >
                    {rel.targetName} ({rel.kind}: {arch})
                  </button>
                ) : (
                  <span
                    key={rel.targetId}
                    className={`chip ${rel.kind === 'enemy' || vec.resentment >= 60 ? 'neg' : vec.trust >= 60 ? 'pos' : ''}`}
                  >
                    {rel.targetName} ({rel.kind}: {arch})
                  </span>
                );
              })}
            </div>
          )}
        </section>

        {/* 8. KNOWLEDGE */}
        <section className="disc-item" style={{ marginTop: 10 }}>
          <div className="disc-head">
            <span>Known Intelligence &amp; Secrets ({knowledge.length})</span>
          </div>
          {knowledge.length === 0 ? (
            <div className="disc-sub">No classified intel or rumors recorded.</div>
          ) : (
            <div className="stat-list" style={{ marginTop: 6 }}>
              {knowledge.map((k) => (
                <div key={k.id} className="disc-sub">
                  <span className={`chip ${k.secret ? 'neg' : ''}`} style={{ marginRight: 6 }}>
                    {k.secret ? 'SECRET' : 'INTEL'}
                  </span>
                  {k.detail} <span className="tabular">(Year {k.learnedYear})</span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* 6. MEMORY */}
        <section className="disc-item" style={{ marginTop: 10 }}>
          <div className="disc-head">
            <span>Lived Memories ({newestMemories.length})</span>
          </div>
          <div className="stat-list npc-memory-list" style={{ marginTop: 6 }}>
            {newestMemories.map((m, idx) => (
              <div key={`${m.year}_${idx}`} className="disc-sub">
                <span className="tabular">
                  <strong>Age {m.age} (Yr {m.year})</strong> [{m.tag}]:
                </span>{' '}
                {m.summary}
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
