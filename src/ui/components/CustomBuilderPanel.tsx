import { useMemo, useState } from 'react';
import { getClansForVillage } from '../../data/clans';
import { DRAWBACKS } from '../../data/drawbacks';
import { JUTSU_DB, JUTSU_MAP, type JutsuRank } from '../../data/jutsu';
import { ORIGIN_MAP, ORIGINS } from '../../data/origins';
import {
  BLOODLINES,
  BLOODLINE_STAGE_LABELS,
  DISCIPLINES,
  DISCIPLINE_MAP,
  DISCIPLINE_TIER_NAMES,
  ELEMENT_NAMES,
} from '../../data/powers';
import { SUMMON_CLANS } from '../../data/summons';
import { VILLAGES, VILLAGE_MAP } from '../../data/villages';
import {
  CUSTOM_BUDGET,
  evaluateCustomBuild,
  isBloodlineAllowedForClan,
  isDisciplineAllowedForClan,
  MAX_FREE_DISCIPLINES,
  MAX_MANGEKYO_ARTS,
} from '../../sim/custom';
import { MANGEKYO_ART_POOL } from '../../sim/powers';
import type {
  BloodlineStage,
  ChakraElement,
  CrisisId,
  CustomBuildConfig,
  DrawbackId,
  MangekyoArtId,
  OriginId,
  StatKey,
  SummonClanId,
  VillageId,
} from '../../sim/types';
import { BIJUU_LIST } from '../../sim/world';

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

const ALL_ELEMENTS: ChakraElement[] = ['fire', 'wind', 'lightning', 'earth', 'water'];
const BLOODLINE_STAGES: BloodlineStage[] = ['latent', 'awakened', 'ctrl1', 'ctrl2', 'mastered'];
const MANGEKYO_LABELS: Record<MangekyoArtId, string> = {
  amaterasu: 'Amaterasu (Black Flames)',
  tsukuyomi: 'Tsukuyomi (72-Hour Illusion)',
  kamui: 'Kamui (Space-Time Intangibility)',
  kotoamatsukami: 'Kotoamatsukami (Subtle Command)',
};

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

export function CustomBuilderPanel({ onStartCustom }: CustomBuilderPanelProps) {
  const [mode, setMode] = useState<'points' | 'free'>('points');
  const [name, setName] = useState('');
  const [epithet, setEpithet] = useState('');
  const [sex, setSex] = useState<'M' | 'F'>('M');
  const [originId, setOriginId] = useState<OriginId>('clan_heir');
  const [villageId, setVillageId] = useState<VillageId>('konoha');
  const [clanId, setClanId] = useState<string>('');
  const [capacity, setCapacity] = useState<1 | 2 | 3 | 4 | 5>(3);
  const [element, setElement] = useState<ChakraElement>('fire');
  const [secondaryElements, setSecondaryElements] = useState<ChakraElement[]>([]);

  // Point-Buy uses 1 discipline; Free Mode supports up to 5 Build Kombo disciplines with tiers
  const [startDisciplines, setStartDisciplines] = useState<{ id: string; level: 1 | 2 | 3 | 4 }[]>([]);
  const [discPickerId, setDiscPickerId] = useState('');

  // Single bloodline only (no dual bloodline / chimera) + Sharingan MS / EMS options
  const [latentBloodlineId, setLatentBloodlineId] = useState('');
  const [startBloodlineStage, setStartBloodlineStage] = useState<BloodlineStage>('latent');
  const [mangekyoAwakened, setMangekyoAwakened] = useState(false);
  const [mangekyoArts, setMangekyoArts] = useState<MangekyoArtId[]>(['amaterasu', 'tsukuyomi']);
  const [eternalMangekyo, setEternalMangekyo] = useState(false);

  // Kuchiyose & Jinchuriki
  const [summonClanId, setSummonClanId] = useState<SummonClanId | ''>('');
  const [jinchurikiBijuu, setJinchurikiBijuu] = useState('');
  const [jinchurikiOstracized, setJinchurikiOstracized] = useState(false);

  // Signature Jutsu Picker (Free Mode)
  const [signatureJutsuIds, setSignatureJutsuIds] = useState<string[]>([]);
  const [jutsuSearch, setJutsuSearch] = useState('');
  const [jutsuRankFilter, setJutsuRankFilter] = useState<'ALL' | JutsuRank>('S');

  // Sandbox Ceiling & Pacing (Free Mode)
  const [transcendentCap, setTranscendentCap] = useState(false);
  const [growthMult, setGrowthMult] = useState<1 | 2 | 5>(1);

  // Imperfect Power Fantasy Drawbacks / Curses
  const [drawbacks, setDrawbacks] = useState<DrawbackId[]>([]);

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

  const selectedOrigin = ORIGIN_MAP[originId];
  const villageClans = getClansForVillage(villageId);
  const safeClanId = villageClans.some((c) => c.id === clanId) ? clanId : '';

  const maxStatCeiling = mode === 'free' && transcendentCap ? 150 : 100;
  const chakraCap =
    mode === 'free' && transcendentCap
      ? 200
      : 40 + 12 * capacity + (mode === 'free' && jinchurikiBijuu ? 35 : 0);

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

  const safeBloodlineId = allowedBloodlines.some((b) => b.id === latentBloodlineId) ? latentBloodlineId : '';
  const safeSecondaryElements = secondaryElements
    .filter((el) => el !== element)
    .slice(0, mode === 'free' ? 4 : 1);

  const safeStartDisciplines = startDisciplines
    .filter((item) => allowedDisciplines.some((d) => d.id === item.id))
    .slice(0, mode === 'free' ? MAX_FREE_DISCIPLINES : 1)
    .map((item) => ({
      id: item.id,
      level: mode === 'free' ? item.level : (1 as const),
    }));

  const effectiveDirectStats: Record<StatKey, number> = {
    chakra: Math.min(directStats.chakra, chakraCap),
    intel: Math.min(directStats.intel, maxStatCeiling),
    will: Math.min(directStats.will, maxStatCeiling),
    bonds: Math.min(directStats.bonds, maxStatCeiling),
    health: Math.min(directStats.health, maxStatCeiling),
    ryo: Math.min(directStats.ryo, maxStatCeiling),
  };

  const cfg: CustomBuildConfig = {
    mode,
    name,
    epithet: epithet.trim() || undefined,
    sex,
    originId,
    villageId,
    clanId: safeClanId || undefined,
    capacity,
    element,
    secondaryElements: safeSecondaryElements.length > 0 ? safeSecondaryElements : undefined,
    statOffsets,
    directStats: mode === 'free' ? effectiveDirectStats : undefined,
    startDisciplineId: safeStartDisciplines[0]?.id,
    startDisciplineLevel: mode === 'free' && safeStartDisciplines[0] ? safeStartDisciplines[0].level : undefined,
    startDisciplines: safeStartDisciplines.length > 0 ? safeStartDisciplines : undefined,
    latentBloodlineId: safeBloodlineId || undefined,
    startBloodlineStage: mode === 'free' && safeBloodlineId ? startBloodlineStage : undefined,
    mangekyoAwakened:
      mode === 'free' && safeBloodlineId === 'sharingan' && (mangekyoAwakened || eternalMangekyo) ? true : undefined,
    mangekyoArts:
      mode === 'free' && safeBloodlineId === 'sharingan' && (mangekyoAwakened || eternalMangekyo)
        ? mangekyoArts
        : undefined,
    eternalMangekyo:
      mode === 'free' && safeBloodlineId === 'sharingan' && eternalMangekyo ? true : undefined,
    summonClanId: summonClanId || undefined,
    jinchurikiBijuu: mode === 'free' && jinchurikiBijuu ? jinchurikiBijuu : undefined,
    jinchurikiOstracized: mode === 'free' && jinchurikiBijuu ? jinchurikiOstracized : undefined,
    signatureJutsuIds: mode === 'free' && signatureJutsuIds.length > 0 ? signatureJutsuIds : undefined,
    transcendentCap: mode === 'free' && transcendentCap ? true : undefined,
    growthMult: mode === 'free' && growthMult !== 1 ? growthMult : undefined,
    drawbacks: drawbacks.length > 0 ? drawbacks : undefined,
  };

  const validation = evaluateCustomBuild(cfg);

  const filteredJutsu = useMemo(() => {
    const q = jutsuSearch.trim().toLowerCase();
    return JUTSU_DB.filter((j) => {
      if (jutsuRankFilter !== 'ALL' && j.rank !== jutsuRankFilter) return false;
      if (!q) return true;
      return (
        j.name.toLowerCase().includes(q) ||
        j.id.toLowerCase().includes(q) ||
        j.description.toLowerCase().includes(q)
      );
    }).slice(0, 40);
  }, [jutsuSearch, jutsuRankFilter]);

  const handleCapacityChange = (nextCap: 1 | 2 | 3 | 4 | 5) => {
    setCapacity(nextCap);
    const nextMaxChakra =
      mode === 'free' && transcendentCap ? 200 : 40 + 12 * nextCap + (mode === 'free' && jinchurikiBijuu ? 35 : 0);
    setDirectStats((prev) => ({
      ...prev,
      chakra: Math.min(prev.chakra, nextMaxChakra),
    }));
  };

  const toggleSecondaryElement = (el: ChakraElement) => {
    if (el === element) return;
    setSecondaryElements((prev) => {
      if (prev.includes(el)) return prev.filter((x) => x !== el);
      if (mode === 'points') return [el];
      return [...prev, el].slice(0, 4);
    });
  };

  const addComboDiscipline = (id: string) => {
    if (!id || startDisciplines.some((d) => d.id === id)) return;
    if (mode === 'points') {
      setStartDisciplines([{ id, level: 1 }]);
    } else if (startDisciplines.length < MAX_FREE_DISCIPLINES) {
      setStartDisciplines((prev) => [...prev, { id, level: 3 }]);
    }
    setDiscPickerId('');
  };

  const updateComboDisciplineLevel = (id: string, level: 1 | 2 | 3 | 4) => {
    setStartDisciplines((prev) => prev.map((d) => (d.id === id ? { ...d, level } : d)));
  };

  const removeComboDiscipline = (id: string) => {
    setStartDisciplines((prev) => prev.filter((d) => d.id !== id));
  };

  const toggleMangekyoArt = (art: MangekyoArtId) => {
    setMangekyoArts((prev) => {
      if (prev.includes(art)) {
        return prev.length > 1 ? prev.filter((a) => a !== art) : prev;
      }
      if (prev.length >= MAX_MANGEKYO_ARTS) {
        return [prev[1], art];
      }
      return [...prev, art];
    });
  };

  const toggleDrawback = (id: DrawbackId) => {
    setDrawbacks((prev) => (prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id]));
  };

  const toggleSignatureJutsu = (id: string) => {
    setSignatureJutsuIds((prev) => (prev.includes(id) ? prev.filter((j) => j !== id) : [...prev, id]));
  };

  const handleMaxAllFree = () => {
    setCapacity(5);
    const statMax = transcendentCap ? 150 : 100;
    const chkMax = transcendentCap ? 200 : jinchurikiBijuu ? 135 : 100;
    setDirectStats({
      chakra: chkMax,
      intel: statMax,
      will: statMax,
      bonds: statMax,
      health: statMax,
      ryo: statMax,
    });
    setStartDisciplines((prev) =>
      prev.map((d) => ({
        ...d,
        level: (DISCIPLINE_MAP[d.id]?.maxLevel ?? 4) as 1 | 2 | 3 | 4,
      })),
    );
    if (safeBloodlineId) {
      setStartBloodlineStage('mastered');
    }
  };

  const handleResetFree = () => {
    setDirectStats(getDefaultDirectStats(originId, capacity));
    setStartDisciplines([]);
    setSecondaryElements([]);
    setSignatureJutsuIds([]);
    setJinchurikiBijuu('');
    setJinchurikiOstracized(false);
    setSummonClanId('');
    setMangekyoAwakened(false);
    setEternalMangekyo(false);
    setTranscendentCap(false);
    setGrowthMult(1);
    setStartBloodlineStage('latent');
  };

  const applyPreset = (preset: 'yellow_flash' | 'crimson_uchiha' | 'gates_medic') => {
    setMode('free');
    if (preset === 'yellow_flash') {
      setName('Minato Namikaze');
      setEpithet('The Yellow Flash');
      setVillageId('konoha');
      setClanId('');
      setOriginId('civilian');
      setCapacity(5);
      setElement('wind');
      setSecondaryElements(['lightning', 'fire']);
      setStartDisciplines([
        { id: 'space_time', level: 4 },
        { id: 'wind_release', level: 3 },
        { id: 'senjutsu', level: 3 },
        { id: 'fuinjutsu', level: 3 },
      ]);
      setLatentBloodlineId('');
      setSummonClanId('toad');
      setJinchurikiBijuu('');
      setSignatureJutsuIds(['hiraishin', 'rasengan', 'rasenshuriken']);
      setTranscendentCap(true);
      setGrowthMult(2);
      setDirectStats({ chakra: 165, intel: 140, will: 135, bonds: 120, health: 125, ryo: 95 });
    } else if (preset === 'crimson_uchiha') {
      setName('Shisui Uchiha');
      setEpithet('Ghost of the Uchiha');
      setVillageId('konoha');
      setClanId('uchiha');
      setOriginId('clan_heir');
      setCapacity(5);
      setElement('fire');
      setSecondaryElements(['lightning', 'wind']);
      setStartDisciplines([
        { id: 'fire_release', level: 4 },
        { id: 'genjutsu', level: 4 },
        { id: 'kenjutsu', level: 3 },
      ]);
      setLatentBloodlineId('sharingan');
      setStartBloodlineStage('mastered');
      setMangekyoAwakened(true);
      setMangekyoArts(['kamui', 'tsukuyomi']);
      setEternalMangekyo(true);
      setSummonClanId('hawk');
      setJinchurikiBijuu('');
      setSignatureJutsuIds(['susanoo', 'amaterasu', 'goka_messhitsu']);
      setTranscendentCap(true);
      setGrowthMult(2);
      setDirectStats({ chakra: 175, intel: 140, will: 145, bonds: 90, health: 125, ryo: 100 });
    } else {
      setName('Might Ren');
      setEpithet('Crimson Lotus');
      setVillageId('konoha');
      setClanId('');
      setOriginId('civilian');
      setCapacity(4);
      setElement('fire');
      setSecondaryElements(['earth']);
      setStartDisciplines([
        { id: 'strong_fist', level: 4 },
        { id: 'medical', level: 4 },
        { id: 'weapon_mastery', level: 3 },
      ]);
      setLatentBloodlineId('');
      setSummonClanId('slug');
      setJinchurikiBijuu('');
      setSignatureJutsuIds(['byakugo', 'hirudora']);
      setTranscendentCap(true);
      setGrowthMult(2);
      setDirectStats({ chakra: 145, intel: 115, will: 150, bonds: 125, health: 150, ryo: 85 });
    }
  };

  return (
    <section className="panel" aria-labelledby="custom-heading">
      <div className="disc-head" style={{ marginBottom: 12 }}>
        <h2 id="custom-heading" className="panel-title" style={{ margin: 0 }}>
          Custom Shinobi Builder
        </h2>
        <span
          className={`status-tag tabular ${mode === 'points' && validation.pointsSpent > validation.budget ? 'tension-high' : 'rank-chunin'}`}
        >
          {mode === 'points'
            ? `Points: ${validation.pointsSpent}/${validation.budget}${validation.drawbackBonus > 0 ? ` (+${validation.drawbackBonus} Drawback)` : ''}`
            : 'Free Mode (Build Kombo)'}
        </span>
      </div>

      <div className="lobby-actions" style={{ marginBottom: 14, flexWrap: 'wrap' }}>
        <button
          type="button"
          className={`btn btn-sm ${mode === 'points' ? 'btn-active' : 'btn-ghost'}`}
          onClick={() => setMode('points')}
        >
          Point-Buy ({CUSTOM_BUDGET} + Drawback pts)
        </button>
        <button
          type="button"
          className={`btn btn-sm ${mode === 'free' ? 'btn-active' : 'btn-ghost'}`}
          onClick={() => setMode('free')}
        >
          Free Mode (Build Kombo Sandbox)
        </button>
      </div>

      {mode === 'free' && (
        <div className="disc-item" style={{ marginBottom: 14, borderColor: 'var(--accent-gold)' }}>
          <div className="disc-head" style={{ marginBottom: 6 }}>
            <span>Legendary Combo Presets</span>
            <span className="history-sub">One-click starting fantasies</span>
          </div>
          <div className="lobby-actions" style={{ flexWrap: 'wrap', gap: 6 }}>
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => applyPreset('yellow_flash')}>
              The Yellow Flash (Hiraishin + Wind + Sage)
            </button>
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => applyPreset('crimson_uchiha')}>
              Ghost of the Uchiha (EMS + Kamui/Tsukuyomi)
            </button>
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => applyPreset('gates_medic')}>
              Crimson Lotus (8 Gates + Byakugo Medic)
            </button>
          </div>
        </div>
      )}

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

      {/* SECTION 1: Identity & Origin */}
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
          <label htmlFor="cb-epithet">Custom Epithet / Title (Bingo Book)</label>
          <input
            id="cb-epithet"
            type="text"
            maxLength={36}
            value={epithet}
            onChange={(e) => setEpithet(e.target.value)}
            placeholder="e.g. The Yellow Flash, Ghost of the Mist"
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
          <label htmlFor="cb-clan">Shinobi Clan</label>
          <select
            id="cb-clan"
            value={safeClanId}
            onChange={(e) => setClanId(e.target.value)}
            disabled={mode === 'points' && (originId === 'civilian' || originId === 'war_orphan')}
          >
            <option value="">
              {mode === 'points' && (originId === 'civilian' || originId === 'war_orphan')
                ? 'None (Civilian/Orphan in Point-Buy)'
                : 'No Specific Clan (Village Random)'}
            </option>
            {villageClans.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.yearlyBonus.label})
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="cb-cap">
            Chakra Capacity Tier (Cap {chakraCap})
          </label>
          <select
            id="cb-cap"
            value={capacity}
            onChange={(e) => handleCapacityChange(Number(e.target.value) as 1 | 2 | 3 | 4 | 5)}
          >
            {[1, 2, 3, 4, 5].map((tier) => (
              <option key={tier} value={tier}>
                Tier {tier}/5 {tier > selectedOrigin.capacityRange[1] && mode === 'points' ? `(+${(tier - selectedOrigin.capacityRange[1]) * 3} pts)` : '(Base)'}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="cb-crisis">Seeded Endgame Crisis</label>
          <select
            id="cb-crisis"
            value={crisisOverride}
            onChange={(e) => setCrisisOverride(e.target.value as 'natural' | CrisisId)}
          >
            <option value="natural">Natural World Seed</option>
            <option value="none">Normal Era (No Crisis)</option>
            <option value="calamity">Force Bijuu Calamity</option>
            <option value="mastermind">Force Akatsuki Conspiracy</option>
          </select>
        </div>
      </div>

      {/* SECTION 2: Multi-Element & Multi-Discipline Build Kombo */}
      <div className="disc-item" style={{ marginTop: 14 }}>
        <div className="disc-head" style={{ marginBottom: 8 }}>
          <span>Chakra Natures & Build Kombo Disciplines</span>
          <span className="history-sub">
            {mode === 'free'
              ? `Up to 5 Elements & ${MAX_FREE_DISCIPLINES} Disciplines`
              : '1 Secondary Element (+3 pts) & 1 Discipline'}
          </span>
        </div>

        <div className="form-grid" style={{ marginBottom: 10 }}>
          <div className="field">
            <label htmlFor="cb-elem">Primary Chakra Nature</label>
            <select
              id="cb-elem"
              value={element}
              onChange={(e) => {
                const next = e.target.value as ChakraElement;
                setElement(next);
                setSecondaryElements((prev) => prev.filter((x) => x !== next));
              }}
            >
              {ALL_ELEMENTS.map((el) => (
                <option key={el} value={el}>
                  {ELEMENT_NAMES[el]}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Secondary Chakra Natures {mode === 'points' ? '(Max 1, +3 pts)' : '(Pick up to all 5)'}</label>
            <div className="chip-row" style={{ marginTop: 4 }}>
              {ALL_ELEMENTS.filter((el) => el !== element).map((el) => {
                const active = safeSecondaryElements.includes(el);
                return (
                  <button
                    key={el}
                    type="button"
                    className={`btn btn-sm ${active ? 'btn-active' : 'btn-ghost'}`}
                    onClick={() => toggleSecondaryElement(el)}
                  >
                    {active ? '[x] ' : '+ '}
                    {ELEMENT_NAMES[el]}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {mode === 'points' ? (
          <div className="field">
            <label htmlFor="cb-disc-pb">Starting Discipline (Lv 1)</label>
            <select
              id="cb-disc-pb"
              value={safeStartDisciplines[0]?.id ?? ''}
              onChange={(e) => {
                const val = e.target.value;
                setStartDisciplines(val ? [{ id: val, level: 1 }] : []);
              }}
            >
              <option value="">Default Origin Discipline (0 pts)</option>
              {allowedDisciplines.map((d) => {
                const disc = selectedOrigin.familyDisciplines.includes(d.id) || (d.id === 'gentle_fist' && safeClanId === 'hyuga');
                return (
                  <option key={d.id} value={d.id}>
                    {d.name} (+{disc ? 1 : 3} pts)
                  </option>
                );
              })}
            </select>
          </div>
        ) : (
          <div>
            <div className="form-grid" style={{ alignItems: 'end' }}>
              <div className="field">
                <label htmlFor="cb-disc-add">
                  Add Combo Discipline ({safeStartDisciplines.length}/{MAX_FREE_DISCIPLINES})
                </label>
                <select
                  id="cb-disc-add"
                  value={discPickerId}
                  onChange={(e) => addComboDiscipline(e.target.value)}
                  disabled={safeStartDisciplines.length >= MAX_FREE_DISCIPLINES}
                >
                  <option value="">
                    {safeStartDisciplines.length >= MAX_FREE_DISCIPLINES
                      ? 'Maximum 5 disciplines reached'
                      : 'Select a discipline to add to combo...'}
                  </option>
                  {allowedDisciplines
                    .filter((d) => !safeStartDisciplines.some((s) => s.id === d.id))
                    .map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name} ({d.branch})
                      </option>
                    ))}
                </select>
              </div>
            </div>
            {safeStartDisciplines.length > 0 && (
              <div className="stat-list" style={{ marginTop: 8, gap: 6 }}>
                {safeStartDisciplines.map((item, idx) => {
                  const def = DISCIPLINE_MAP[item.id];
                  if (!def) return null;
                  return (
                    <div key={item.id} className="disc-head" style={{ gap: 8 }}>
                      <span>
                        {idx === 0 ? '[Main] ' : ''}
                        <strong>{def.name}</strong>
                      </span>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <select
                          aria-label={`${def.name} tier`}
                          value={item.level}
                          onChange={(e) => updateComboDisciplineLevel(item.id, Number(e.target.value) as 1 | 2 | 3 | 4)}
                          style={{ width: 'auto', padding: '2px 6px' }}
                        >
                          {([1, 2, 3, 4] as const)
                            .filter((lv) => lv <= def.maxLevel)
                            .map((lv) => (
                              <option key={lv} value={lv}>
                                Lv {lv} ({DISCIPLINE_TIER_NAMES[lv]})
                              </option>
                            ))}
                        </select>
                        <button
                          type="button"
                          className="btn btn-sm btn-ghost"
                          onClick={() => removeComboDiscipline(item.id)}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* SECTION 3: Single Bloodline + Sharingan MS / EMS */}
      <div className="disc-item" style={{ marginTop: 12 }}>
        <div className="disc-head" style={{ marginBottom: 8 }}>
          <span>Kekkei Genkai (Single Bloodline Only)</span>
          <span className="history-sub">No Dual Bloodline / Chimera</span>
        </div>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="cb-bloodline">Starting Bloodline</label>
            <select
              id="cb-bloodline"
              value={safeBloodlineId}
              onChange={(e) => {
                const next = e.target.value;
                setLatentBloodlineId(next);
                if (next !== 'sharingan') {
                  setMangekyoAwakened(false);
                  setEternalMangekyo(false);
                }
              }}
            >
              <option value="">Natural Birth Roll (0 pts)</option>
              {allowedBloodlines.map((b) => {
                const cost = b.id === 'rinne_eye' ? 9 : b.id === 'mokuton' || b.id === 'sharingan' ? 6 : 4;
                return (
                  <option key={b.id} value={b.id}>
                    {b.name} {mode === 'points' ? `(+${cost} pts)` : ''}
                  </option>
                );
              })}
            </select>
          </div>
          {mode === 'free' && safeBloodlineId && (
            <div className="field">
              <label htmlFor="cb-bl-stage">Starting Bloodline Stage</label>
              <select
                id="cb-bl-stage"
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

        {mode === 'free' && safeBloodlineId === 'sharingan' && (
          <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid var(--border-subtle)' }}>
            <div className="lobby-actions" style={{ gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={mangekyoAwakened || eternalMangekyo}
                  onChange={(e) => {
                    setMangekyoAwakened(e.target.checked);
                    if (!e.target.checked) setEternalMangekyo(false);
                  }}
                />
                <span>Awaken Mangekyo Sharingan (Pick 2 Arts)</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={eternalMangekyo}
                  onChange={(e) => {
                    setEternalMangekyo(e.target.checked);
                    if (e.target.checked) setMangekyoAwakened(true);
                  }}
                />
                <span>Eternal Mangekyo (EMS, Zero Eye Strain)</span>
              </label>
            </div>

            {(mangekyoAwakened || eternalMangekyo) && (
              <div>
                <div className="history-sub" style={{ marginBottom: 6 }}>
                  Choose 2 Mangekyo Arts ({mangekyoArts.length}/{MAX_MANGEKYO_ARTS} selected; Susanoo unlocks at Mastered stage):
                </div>
                <div className="chip-row">
                  {MANGEKYO_ART_POOL.map((art) => {
                    const active = mangekyoArts.includes(art);
                    return (
                      <button
                        key={art}
                        type="button"
                        className={`btn btn-sm ${active ? 'btn-active' : 'btn-ghost'}`}
                        onClick={() => toggleMangekyoArt(art)}
                      >
                        {active ? '[x] ' : '+ '}
                        {MANGEKYO_LABELS[art]}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* SECTION 4: Kuchiyose & Jinchuriki Vessel */}
      <div className="disc-item" style={{ marginTop: 12 }}>
        <div className="disc-head" style={{ marginBottom: 8 }}>
          <span>Kuchiyose Contract & Jinchuriki Vessel</span>
          <span className="history-sub">Summon Allies & Tailed Beast Power</span>
        </div>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="cb-summon">
              Kuchiyose Summoning Contract {mode === 'points' ? '(+4 pts)' : '(Free)'}
            </label>
            <select
              id="cb-summon"
              value={summonClanId}
              onChange={(e) => setSummonClanId(e.target.value as SummonClanId | '')}
            >
              <option value="">None (Earn naturally in life)</option>
              {SUMMON_CLANS.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.originPlace})
                </option>
              ))}
            </select>
          </div>
          {mode === 'free' && (
            <div className="field">
              <label htmlFor="cb-jinchuriki">Jinchuriki Vessel (Free Mode)</label>
              <select
                id="cb-jinchuriki"
                value={jinchurikiBijuu}
                onChange={(e) => {
                  setJinchurikiBijuu(e.target.value);
                  if (!e.target.value) setJinchurikiOstracized(false);
                }}
              >
                <option value="">Not a Jinchuriki</option>
                {BIJUU_LIST.map((b) => (
                  <option key={b} value={b}>
                    {b} (+35 Chakra Cap, Regen & Bijuu Cloak)
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
        {mode === 'free' && jinchurikiBijuu && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={jinchurikiOstracized}
              onChange={(e) => setJinchurikiOstracized(e.target.checked)}
            />
            <span>Childhood Ostracization Drama (Shunned by villagers early in life; unlocks unique vessel scenes)</span>
          </label>
        )}
      </div>

      {/* SECTION 5: Signature Jutsu Picker (Free Mode) */}
      {mode === 'free' && (
        <div className="disc-item" style={{ marginTop: 12 }}>
          <div className="disc-head" style={{ marginBottom: 8 }}>
            <span>Signature Jutsu Picker ({signatureJutsuIds.length} selected)</span>
            <span className="history-sub">Start with iconic techniques directly</span>
          </div>
          {signatureJutsuIds.length > 0 && (
            <div className="chip-row" style={{ marginBottom: 8 }}>
              {signatureJutsuIds.map((id) => (
                <button
                  key={id}
                  type="button"
                  className="btn btn-sm btn-active"
                  onClick={() => toggleSignatureJutsu(id)}
                >
                  {JUTSU_MAP[id]?.name ?? id} x
                </button>
              ))}
            </div>
          )}
          <div className="form-grid" style={{ marginBottom: 8 }}>
            <div className="field">
              <label htmlFor="cb-jutsu-search">Search Jutsu Catalog</label>
              <input
                id="cb-jutsu-search"
                type="text"
                value={jutsuSearch}
                onChange={(e) => setJutsuSearch(e.target.value)}
                placeholder="Hiraishin, Rasenshuriken, Susanoo, Edo Tensei..."
              />
            </div>
            <div className="field">
              <label htmlFor="cb-jutsu-rank">Rank Filter</label>
              <select
                id="cb-jutsu-rank"
                value={jutsuRankFilter}
                onChange={(e) => setJutsuRankFilter(e.target.value as 'ALL' | JutsuRank)}
              >
                <option value="S">S-Rank Ultimates & Kinjutsu</option>
                <option value="A">A-Rank Signature Arts</option>
                <option value="B">B-Rank Tactical Arts</option>
                <option value="C">C-Rank Core Arts</option>
                <option value="ALL">All Ranks</option>
              </select>
            </div>
          </div>
          <div
            style={{
              maxHeight: 155,
              overflowY: 'auto',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))',
              gap: 6,
              padding: 4,
              border: '1px solid var(--border-subtle)',
              borderRadius: 6,
            }}
          >
            {filteredJutsu.map((j) => {
              const picked = signatureJutsuIds.includes(j.id);
              return (
                <button
                  key={j.id}
                  type="button"
                  className={`btn btn-sm ${picked ? 'btn-active' : 'btn-ghost'}`}
                  style={{ justifyContent: 'flex-start', textAlign: 'left' }}
                  onClick={() => toggleSignatureJutsu(j.id)}
                  title={j.description}
                >
                  [{j.rank}] {j.name}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* SECTION 6: Transcendent Cap & Growth Multiplier (Free Mode) */}
      {mode === 'free' && (
        <div className="disc-item" style={{ marginTop: 12, borderColor: 'var(--accent-crimson)' }}>
          <div className="disc-head" style={{ marginBottom: 8 }}>
            <span>Sandbox Ceilings & Growth Pacing</span>
            <span className="status-tag">
              Max Stat {maxStatCeiling} | Chakra {chakraCap} | {growthMult}x Growth
            </span>
          </div>
          <div className="lobby-actions" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={transcendentCap}
                onChange={(e) => setTranscendentCap(e.target.checked)}
              />
              <span>Transcendent Cap (Max Stat 150 / Max Chakra 200)</span>
            </label>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <span className="history-sub">Growth:</span>
              {([1, 2, 5] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  className={`btn btn-sm ${growthMult === m ? 'btn-active' : 'btn-ghost'}`}
                  onClick={() => setGrowthMult(m)}
                >
                  {m}x
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* SECTION 7: Imperfect Power Fantasy Drawbacks / Curses */}
      <div className="disc-item" style={{ marginTop: 12 }}>
        <div className="disc-head" style={{ marginBottom: 8 }}>
          <span>Imperfect Power Fantasy: Drawbacks & Curses</span>
          <span className="history-sub">
            {mode === 'points' ? 'Grants +3 to +5 extra Point-Buy points' : 'Optional tragic storytelling arcs'}
          </span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8 }}>
          {DRAWBACKS.map((db) => {
            const active = drawbacks.includes(db.id);
            return (
              <button
                key={db.id}
                type="button"
                className={`btn btn-sm ${active ? 'btn-active' : 'btn-ghost'}`}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-start',
                  textAlign: 'left',
                  padding: '8px 10px',
                  height: 'auto',
                }}
                onClick={() => toggleDrawback(db.id)}
              >
                <div style={{ fontWeight: 600 }}>
                  {active ? '[x] ' : ''}
                  {db.name} {mode === 'points' ? `(+${db.bonusPoints} pts)` : ''}
                </div>
                <div className="history-sub" style={{ fontSize: '0.78rem', marginTop: 2 }}>
                  {db.flavorTag}: {db.effectSummary}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* SECTION 8: Starting Stats */}
      <div className="disc-item" style={{ marginTop: 12 }}>
        <div className="disc-head" style={{ marginBottom: 8 }}>
          <span>
            {mode === 'free'
              ? `Direct Starting Stats (0-${maxStatCeiling}, Chakra 0-${chakraCap})`
              : 'Starting Stat Offsets (-20 to +25)'}
          </span>
          {mode === 'free' && (
            <div style={{ display: 'flex', gap: 6 }}>
              <button type="button" className="btn btn-sm btn-ghost" onClick={handleMaxAllFree}>
                Max All
              </button>
              <button type="button" className="btn btn-sm btn-ghost" onClick={handleResetFree}>
                Reset
              </button>
            </div>
          )}
        </div>
        <div className="form-grid">
          {STAT_KEYS.map(({ key, label }) => {
            if (mode === 'free') {
              const maxVal = key === 'chakra' ? chakraCap : maxStatCeiling;
              const curVal = effectiveDirectStats[key];
              return (
                <div key={key} className="field">
                  <label htmlFor={`cb-direct-${key}`} className="tabular">
                    {label}: {curVal}/{maxVal}
                  </label>
                  <input
                    id={`cb-direct-${key}`}
                    type="range"
                    min={0}
                    max={maxVal}
                    value={curVal}
                    onChange={(e) =>
                      setDirectStats((prev) => ({
                        ...prev,
                        [key]: Number(e.target.value),
                      }))
                    }
                  />
                </div>
              );
            }

            const off = statOffsets[key] ?? 0;
            const [bMin, bMax] = getBaselineRange(key, originId, capacity);
            return (
              <div key={key} className="field">
                <label htmlFor={`cb-off-${key}`} className="tabular">
                  {label}: {off >= 0 ? `+${off}` : off} (Est. {Math.max(0, bMin + off)}-{Math.min(100, bMax + off)})
                </label>
                <input
                  id={`cb-off-${key}`}
                  type="range"
                  min={-20}
                  max={25}
                  step={5}
                  value={off}
                  onChange={(e) =>
                    setStatOffsets((prev) => ({
                      ...prev,
                      [key]: Number(e.target.value),
                    }))
                  }
                />
              </div>
            );
          })}
        </div>
      </div>

      {validation.errors.length > 0 && (
        <div className="disc-item" style={{ marginTop: 12, borderColor: 'var(--accent-crimson)' }}>
          {validation.errors.map((err, idx) => (
            <div key={idx} className="disc-sub" style={{ color: 'var(--accent-crimson)' }}>
              {err}
            </div>
          ))}
        </div>
      )}

      <div className="lobby-actions" style={{ marginTop: 16 }}>
        <button
          type="button"
          className="btn btn-primary"
          disabled={!validation.valid}
          onClick={() => onStartCustom(cfg, crisisOverride)}
        >
          Begin Custom Shinobi Life
        </button>
      </div>
    </section>
  );
}
