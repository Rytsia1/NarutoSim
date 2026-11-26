import { useState } from 'react';
import { getClansForVillage } from '../../data/clans';
import { ORIGIN_MAP, ORIGINS } from '../../data/origins';
import {
  BLOODLINES,
  BLOODLINE_STAGE_LABELS,
  DISCIPLINES,
  DISCIPLINE_MAP,
  DISCIPLINE_TIER_NAMES,
  ELEMENT_NAMES,
} from '../../data/powers';
import { VILLAGES, VILLAGE_MAP } from '../../data/villages';
import {
  CUSTOM_BUDGET,
  evaluateCustomBuild,
  isBloodlineAllowedForClan,
  isDisciplineAllowedForClan,
} from '../../sim/custom';
import type {
  BloodlineStage,
  ChakraElement,
  CrisisId,
  CustomBuildConfig,
  OriginId,
  StatKey,
  VillageId,
} from '../../sim/types';

interface CustomBuilderPanelProps {
  onStartCustom: (build: CustomBuildConfig, crisisOverride: 'natural' | CrisisId) => void;
}

const STAT_KEYS: { key: StatKey; label: string }[] = [
  { key: 'chakra', label: 'Chakra' },
  { key: 'intel', label: 'Intel' },
  { key: 'will', label: 'Will' },
  { key: 'bonds', label: 'Bonds' },
  { key: 'health', label: 'Health' },
  { key: 'ryo', label: 'Ryo' },
];

const BLOODLINE_STAGES: BloodlineStage[] = ['latent', 'awakened', 'ctrl1', 'ctrl2', 'mastered'];

function getBaselineRange(
  key: StatKey,
  originId: OriginId,
  capacity: 1 | 2 | 3 | 4 | 5,
): [number, number] {
  const origin = ORIGIN_MAP[originId];
  switch (key) {
    case 'chakra':
      return [capacity * 7, Math.min(40 + 12 * capacity, capacity * 7 + 8)];
    case 'intel':
      return [1, 5];
    case 'will':
      return [16, 34];
    case 'bonds':
      return origin.isOrphan ? [15, 28] : [40, 58];
    case 'health':
      return [72, 92];
    case 'ryo':
      return origin.ryoRange;
  }
}

function getDefaultDirectStats(originId: OriginId, capacity: 1 | 2 | 3 | 4 | 5): Record<StatKey, number> {
  const origin = ORIGIN_MAP[originId];
  return {
    chakra: Math.min(40 + 12 * capacity, capacity * 7 + 4),
    intel: 15,
    will: 30,
    bonds: origin.isOrphan ? 25 : 50,
    health: 85,
    ryo: Math.round((origin.ryoRange[0] + origin.ryoRange[1]) / 2),
  };
}

export function CustomBuilderPanel({
  onStartCustom,
}: CustomBuilderPanelProps) {
  const [mode, setMode] = useState<'points' | 'free'>('points');
  const [name, setName] = useState('');
  const [sex, setSex] = useState<'M' | 'F'>('M');
  const [originId, setOriginId] = useState<OriginId>('clan_heir');
  const [villageId, setVillageId] = useState<VillageId>('konoha');
  const [clanId, setClanId] = useState<string>('');
  const [capacity, setCapacity] = useState<1 | 2 | 3 | 4 | 5>(3);
  const [element, setElement] = useState<ChakraElement>('fire');
  const [startDisciplineId, setStartDisciplineId] = useState('');
  const [startDisciplineLevel, setStartDisciplineLevel] = useState<1 | 2 | 3 | 4>(1);
  const [latentBloodlineId, setLatentBloodlineId] = useState('');
  const [startBloodlineStage, setStartBloodlineStage] = useState<BloodlineStage>('latent');
  const [crisisOverride, setCrisisOverride] = useState<'natural' | CrisisId>('natural');
  const [statOffsets, setStatOffsets] = useState<Partial<Record<StatKey, number>>>({
    chakra: 0,
    intel: 0,
    will: 0,
    bonds: 0,
    health: 0,
    ryo: 0,
  });
  const [directStats, setDirectStats] = useState<Record<StatKey, number>>(() =>
    getDefaultDirectStats('clan_heir', 3),
  );

  const chakraCap = 40 + 12 * capacity;
  const selectedOrigin = ORIGIN_MAP[originId];
  const villageClans = getClansForVillage(villageId);
  const safeClanId = villageClans.some((c) => c.id === clanId) ? clanId : '';

  const allowedDisciplines =
    mode === 'free'
      ? DISCIPLINES
      : DISCIPLINES.filter(
          (d) =>
            d.id !== 'senjutsu' &&
            d.id !== 'space_time' &&
            isDisciplineAllowedForClan(d.id, safeClanId || null).allowed,
        );

  const allowedBloodlines =
    mode === 'free'
      ? BLOODLINES
      : BLOODLINES.filter((b) => isBloodlineAllowedForClan(b.id, safeClanId || null).allowed);

  const safeStartDiscId =
    allowedDisciplines.some((d) => d.id === startDisciplineId) ? startDisciplineId : '';
  const safeBloodlineId =
    allowedBloodlines.some((b) => b.id === latentBloodlineId) ? latentBloodlineId : '';
  const selectedDiscDef = safeStartDiscId ? DISCIPLINE_MAP[safeStartDiscId] : undefined;
  const maxDiscLevel = selectedDiscDef?.maxLevel ?? 4;
  const clampedDiscLevel = Math.min(startDisciplineLevel, maxDiscLevel) as 1 | 2 | 3 | 4;

  const effectiveDirectStats: Record<StatKey, number> = {
    ...directStats,
    chakra: Math.min(directStats.chakra, chakraCap),
  };

  const cfg: CustomBuildConfig = {
    mode,
    name,
    sex,
    originId,
    villageId,
    clanId: safeClanId || undefined,
    capacity,
    element,
    statOffsets,
    directStats: mode === 'free' ? effectiveDirectStats : undefined,
    startDisciplineId: safeStartDiscId || undefined,
    startDisciplineLevel: mode === 'free' && safeStartDiscId ? clampedDiscLevel : undefined,
    latentBloodlineId: safeBloodlineId || undefined,
    startBloodlineStage: mode === 'free' && safeBloodlineId ? startBloodlineStage : undefined,
  };

  const validation = evaluateCustomBuild(cfg);

  const handleCapacityChange = (nextCap: 1 | 2 | 3 | 4 | 5) => {
    setCapacity(nextCap);
    const nextMaxChakra = 40 + 12 * nextCap;
    setDirectStats((prev) => ({
      ...prev,
      chakra: Math.min(prev.chakra, nextMaxChakra),
    }));
  };

  const handleMaxAllFree = () => {
    setCapacity(5);
    setDirectStats({
      chakra: 100,
      intel: 100,
      will: 100,
      bonds: 100,
      health: 100,
      ryo: 100,
    });
    if (safeStartDiscId) {
      setStartDisciplineLevel(maxDiscLevel as 1 | 2 | 3 | 4);
    }
    if (latentBloodlineId) {
      setStartBloodlineStage('mastered');
    }
  };

  const handleResetFree = () => {
    setDirectStats(getDefaultDirectStats(originId, capacity));
    setStartDisciplineLevel(1);
    setStartBloodlineStage('latent');
  };

  return (
    <section className="panel" aria-labelledby="custom-heading">
      <div className="disc-head" style={{ marginBottom: 14 }}>
        <h2 id="custom-heading" className="panel-title" style={{ margin: 0 }}>
          Custom Shinobi Builder
        </h2>
        <span className={`status-tag tabular ${mode === 'points' && validation.pointsSpent > CUSTOM_BUDGET ? 'tension-high' : 'rank-chunin'}`}>
          {mode === 'points' ? `Points: ${validation.pointsSpent}/${CUSTOM_BUDGET}` : 'Free Mode (Sandbox)'}
        </span>
      </div>

      <div className="lobby-actions" style={{ marginBottom: 16 }}>
        <button
          type="button"
          className={`btn btn-sm ${mode === 'points' ? 'btn-active' : 'btn-ghost'}`}
          onClick={() => setMode('points')}
        >
          Point-Buy ({CUSTOM_BUDGET} pts)
        </button>
        <button
          type="button"
          className={`btn btn-sm ${mode === 'free' ? 'btn-active' : 'btn-ghost'}`}
          onClick={() => setMode('free')}
        >
          Free Mode (No Budget Limit)
        </button>
      </div>

      <div className="disc-item" style={{ marginBottom: 14 }}>
        <div className="disc-head">
          <span>{VILLAGE_MAP[villageId].name} Doctrine</span>
          <span className="status-tag">
            {VILLAGE_MAP[villageId].militaryPolicy.replace('_', ' ')} | {VILLAGE_MAP[villageId].institutions.shadowOrgName}
          </span>
        </div>
        <div className="disc-sub" style={{ marginTop: 4 }}>
          {VILLAGE_MAP[villageId].culture}
        </div>
      </div>

      <div className="form-grid">
        <div className="field">
          <label htmlFor="cb-name">Shinobi Name</label>
          <input
            id="cb-name"
            type="text"
            maxLength={28}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Leave blank for village random"
          />
        </div>
        <div className="field">
          <label htmlFor="cb-sex">Gender</label>
          <select id="cb-sex" value={sex} onChange={(e) => setSex(e.target.value as 'M' | 'F')}>
            <option value="M">Male</option>
            <option value="F">Female</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="cb-origin">Origin</label>
          <select id="cb-origin" value={originId} onChange={(e) => setOriginId(e.target.value as OriginId)}>
            {ORIGINS.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name} (Cap {o.capacityRange[0]}-{o.capacityRange[1]})
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="cb-village">Hidden Village</label>
          <select
            id="cb-village"
            value={villageId}
            onChange={(e) => {
              setVillageId(e.target.value as VillageId);
              setClanId('');
            }}
          >
            {VILLAGES.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name} ({v.region})
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="cb-clan">Village Clan Lineage (Optional)</label>
          <select id="cb-clan" value={safeClanId} onChange={(e) => setClanId(e.target.value)}>
            <option value="">Origin Default / No Specific Clan</option>
            {villageClans.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.yearlyBonus.label})
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="cb-cap">
            {mode === 'points'
              ? `Chakra Capacity Tier (above origin max ${selectedOrigin.capacityRange[1]}: +3 pts/tier)`
              : 'Chakra Capacity Tier (Sets Max Chakra Cap)'}
          </label>
          <select
            id="cb-cap"
            value={capacity}
            onChange={(e) => handleCapacityChange(Number(e.target.value) as 1 | 2 | 3 | 4 | 5)}
          >
            {[1, 2, 3, 4, 5].map((c) => {
              const extraCost = c > selectedOrigin.capacityRange[1] ? (c - selectedOrigin.capacityRange[1]) * 3 : 0;
              return (
                <option key={c} value={c}>
                  Tier {c} (Max Chakra {40 + 12 * c}
                  {mode === 'points' ? (extraCost > 0 ? ` | +${extraCost} pts` : ' | 0 pts') : ''})
                </option>
              );
            })}
          </select>
        </div>
        <div className="field">
          <label htmlFor="cb-elem">Primary Chakra Nature</label>
          <select id="cb-elem" value={element} onChange={(e) => setElement(e.target.value as ChakraElement)}>
            {(Object.keys(ELEMENT_NAMES) as ChakraElement[]).map((el) => (
              <option key={el} value={el}>
                {ELEMENT_NAMES[el]} Release
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="cb-disc">
            {mode === 'points'
              ? 'Starting Discipline (1 pt clan / 3 pts other)'
              : 'Starting Discipline (All 22 Unlocked)'}
          </label>
          <select
            id="cb-disc"
            value={safeStartDiscId}
            onChange={(e) => setStartDisciplineId(e.target.value)}
          >
            <option value="">Origin Default {mode === 'points' ? '(0 pts)' : ''}</option>
            {allowedDisciplines.map((d) => {
              const isClan = selectedOrigin.familyDisciplines.includes(d.id);
              return (
                <option key={d.id} value={d.id}>
                  {d.name}
                  {mode === 'points' ? (isClan ? ' (1 pt clan)' : ' (3 pts)') : ''}
                </option>
              );
            })}
          </select>
        </div>
        {mode === 'free' && safeStartDiscId && (
          <div className="field">
            <label htmlFor="cb-disc-lvl">Starting Discipline Tier</label>
            <select
              id="cb-disc-lvl"
              value={clampedDiscLevel}
              onChange={(e) => setStartDisciplineLevel(Number(e.target.value) as 1 | 2 | 3 | 4)}
            >
              {[1, 2, 3, 4]
                .filter((lvl) => lvl <= maxDiscLevel)
                .map((lvl) => (
                  <option key={lvl} value={lvl}>
                    Tier {lvl}: {DISCIPLINE_TIER_NAMES[lvl as 1 | 2 | 3 | 4]}
                  </option>
                ))}
            </select>
          </div>
        )}
        <div className="field">
          <label htmlFor="cb-blood">
            {mode === 'points'
              ? 'Latent Kekkei Genkai (Clan-gated, 4 to 6 pts)'
              : 'Kekkei Genkai (Free Mode bypasses clan rules)'}
          </label>
          <select
            id="cb-blood"
            value={safeBloodlineId}
            onChange={(e) => setLatentBloodlineId(e.target.value)}
          >
            <option value="">Natural Birth Roll {mode === 'points' ? '(0 pts)' : ''}</option>
            {allowedBloodlines.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
                {mode === 'points'
                  ? ` (${b.id === 'rinne_eye' ? 9 : b.id === 'mokuton' || b.id === 'sharingan' ? 6 : 4} pts)`
                  : ''}
              </option>
            ))}
          </select>
        </div>
        {mode === 'free' && safeBloodlineId && (
          <div className="field">
            <label htmlFor="cb-blood-stage">Starting Bloodline Stage</label>
            <select
              id="cb-blood-stage"
              value={startBloodlineStage}
              onChange={(e) => setStartBloodlineStage(e.target.value as BloodlineStage)}
            >
              {BLOODLINE_STAGES.map((st) => (
                <option key={st} value={st}>
                  {BLOODLINE_STAGE_LABELS[st]}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div style={{ marginBottom: 16 }}>
        <div className="disc-head" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
          <strong style={{ fontSize: '0.88rem' }}>
            {mode === 'free'
              ? `Direct Starting Stats (Set exact Age 0 values; Max Chakra ${chakraCap})`
              : 'Starting Stat Adjustments (+1 pt per +5 boost; lowering costs 0 pts)'}
          </strong>
          {mode === 'free' && (
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="btn btn-sm btn-active" onClick={handleMaxAllFree}>
                Max All (100)
              </button>
              <button type="button" className="btn btn-sm btn-ghost" onClick={handleResetFree}>
                Reset Defaults
              </button>
            </div>
          )}
        </div>

        <div className="form-grid" style={{ marginTop: 10 }}>
          {STAT_KEYS.map(({ key, label }) => {
            if (mode === 'free') {
              const maxVal = key === 'chakra' ? chakraCap : 100;
              const val = Math.min(effectiveDirectStats[key], maxVal);
              return (
                <div key={key} className="field">
                  <label htmlFor={`cb-stat-${key}`} className="tabular">
                    {label}: {val}/{maxVal}
                  </label>
                  <input
                    id={`cb-stat-${key}`}
                    type="range"
                    min={0}
                    max={maxVal}
                    step={1}
                    value={val}
                    onChange={(e) =>
                      setDirectStats((prev) => ({ ...prev, [key]: Number(e.target.value) }))
                    }
                  />
                </div>
              );
            }

            const val = statOffsets[key] ?? 0;
            const [baseMin, baseMax] = getBaselineRange(key, originId, capacity);
            const cap = key === 'chakra' ? chakraCap : 100;
            const estMin = Math.max(0, Math.min(cap, baseMin + val));
            const estMax = Math.max(0, Math.min(cap, baseMax + val));
            return (
              <div key={key} className="field">
                <label htmlFor={`cb-stat-${key}`} className="tabular">
                  {label}: {val >= 0 ? `+${val}` : val} (est. {estMin === estMax ? estMin : `${estMin}-${estMax}`})
                </label>
                <input
                  id={`cb-stat-${key}`}
                  type="range"
                  min={-20}
                  max={25}
                  step={5}
                  value={val}
                  onChange={(e) =>
                    setStatOffsets((prev) => ({ ...prev, [key]: Number(e.target.value) }))
                  }
                />
              </div>
            );
          })}
        </div>
      </div>

      <div className="field" style={{ marginBottom: 16, maxWidth: 320 }}>
        <label htmlFor="cb-crisis">World Fate Scenario</label>
        <select
          id="cb-crisis"
          value={crisisOverride}
          onChange={(e) => setCrisisOverride(e.target.value as 'natural' | CrisisId)}
        >
          <option value="natural">Natural Fate</option>
          <option value="none">Normal Era Only</option>
          <option value="calamity">Seed Bijuu Rampage</option>
          <option value="mastermind">Seed Akatsuki Conspiracy</option>
        </select>
      </div>

      {validation.errors.length > 0 && (
        <div className="disc-item" style={{ borderColor: 'var(--accent-crimson)', marginBottom: 14 }}>
          {validation.errors.map((err) => (
            <div key={err} className="disc-sub" style={{ color: '#f2a6a6' }}>
              {err}
            </div>
          ))}
        </div>
      )}

      <button
        type="button"
        className="btn btn-primary"
        disabled={!validation.valid}
        onClick={() => onStartCustom(cfg, crisisOverride)}
      >
        Begin Life as Custom Shinobi
      </button>
    </section>
  );
}
