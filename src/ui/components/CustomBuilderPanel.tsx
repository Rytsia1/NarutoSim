import { useState } from 'react';
import { ORIGINS } from '../../data/origins';
import { BLOODLINES, DISCIPLINES, ELEMENT_NAMES } from '../../data/powers';
import { VILLAGES } from '../../data/villages';
import { CUSTOM_BUDGET, evaluateCustomBuild } from '../../sim/custom';
import type {
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

export function CustomBuilderPanel({ onStartCustom }: CustomBuilderPanelProps) {
  const [mode, setMode] = useState<'points' | 'free'>('points');
  const [name, setName] = useState('');
  const [sex, setSex] = useState<'M' | 'F'>('M');
  const [originId, setOriginId] = useState<OriginId>('clan_heir');
  const [villageId, setVillageId] = useState<VillageId>('konoha');
  const [capacity, setCapacity] = useState<1 | 2 | 3 | 4 | 5>(3);
  const [element, setElement] = useState<ChakraElement>('fire');
  const [startDisciplineId, setStartDisciplineId] = useState('');
  const [latentBloodlineId, setLatentBloodlineId] = useState('');
  const [crisisOverride, setCrisisOverride] = useState<'natural' | CrisisId>('natural');
  const [statOffsets, setStatOffsets] = useState<Partial<Record<StatKey, number>>>({
    chakra: 0,
    intel: 0,
    will: 0,
    bonds: 0,
    health: 0,
    ryo: 0,
  });

  const cfg: CustomBuildConfig = {
    mode,
    name,
    sex,
    originId,
    villageId,
    capacity,
    element,
    statOffsets,
    startDisciplineId: startDisciplineId || undefined,
    latentBloodlineId: latentBloodlineId || undefined,
  };

  const validation = evaluateCustomBuild(cfg);
  const allowedDisciplines = DISCIPLINES.filter((d) => d.id !== 'senjutsu' && d.id !== 'space_time');

  return (
    <section className="panel" aria-labelledby="custom-heading">
      <div className="disc-head" style={{ marginBottom: 14 }}>
        <h2 id="custom-heading" className="panel-title" style={{ margin: 0 }}>
          Custom Shinobi Builder
        </h2>
        <span className={`status-tag tabular ${mode === 'points' && validation.pointsSpent > CUSTOM_BUDGET ? 'tension-high' : 'rank-chunin'}`}>
          {mode === 'points' ? `Points: ${validation.pointsSpent}/${CUSTOM_BUDGET}` : 'Free Mode'}
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
          <select id="cb-village" value={villageId} onChange={(e) => setVillageId(e.target.value as VillageId)}>
            {VILLAGES.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name} ({v.region})
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="cb-cap">Chakra Capacity Tier (1 to 5)</label>
          <select
            id="cb-cap"
            value={capacity}
            onChange={(e) => setCapacity(Number(e.target.value) as 1 | 2 | 3 | 4 | 5)}
          >
            {[1, 2, 3, 4, 5].map((c) => (
              <option key={c} value={c}>
                Tier {c} (Max Chakra {40 + 12 * c})
              </option>
            ))}
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
          <label htmlFor="cb-disc">Starting Discipline (1 pt clan / 3 pts other)</label>
          <select
            id="cb-disc"
            value={startDisciplineId}
            onChange={(e) => setStartDisciplineId(e.target.value)}
          >
            <option value="">Origin Default</option>
            {allowedDisciplines.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="cb-blood">Latent Kekkei Genkai (4 to 9 pts)</label>
          <select
            id="cb-blood"
            value={latentBloodlineId}
            onChange={(e) => setLatentBloodlineId(e.target.value)}
          >
            <option value="">Natural Birth Roll (0 pts)</option>
            {BLOODLINES.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name} ({b.id === 'rinne_eye' ? 9 : b.id === 'mokuton' || b.id === 'sharingan' ? 6 : 4} pts)
              </option>
            ))}
          </select>
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <strong style={{ fontSize: '0.88rem' }}>
          Starting Stat Adjustments (+1 pt per +5 boost; lowering costs 0 pts)
        </strong>
        <div className="form-grid" style={{ marginTop: 10 }}>
          {STAT_KEYS.map(({ key, label }) => {
            const val = statOffsets[key] ?? 0;
            return (
              <div key={key} className="field">
                <label htmlFor={`cb-stat-${key}`} className="tabular">
                  {label}: {val >= 0 ? `+${val}` : val}
                </label>
                <input
                  id={`cb-stat-${key}`}
                  type="range"
                  min={-15}
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
          <option value="calamity">Seed Tailed-Beast Calamity</option>
          <option value="mastermind">Seed Shadow Mastermind</option>
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
