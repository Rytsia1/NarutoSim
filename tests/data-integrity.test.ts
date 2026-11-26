import { describe, expect, it } from 'vitest';
import { ACHIEVEMENTS } from '../src/data/achievements';
import { CLANS } from '../src/data/clans';
import { RETIREMENT_EVENTS } from '../src/data/events-epilogue';
import { DANGEROUS_MISSIONS, FLAVOR_LINES, GROWTH_EVENTS, LIFE_EVENTS } from '../src/data/events-life';
import { CRISIS_WHISPERS, SENSEI_ARCHETYPES, TEAMMATE_ARCHETYPES, TEAM_EVENTS } from '../src/data/events-team';
import { WAR_CROSSROADS } from '../src/data/events-war';
import { EMERGENT_TEMPLATES, VILLAGE_CRISIS_COPY } from '../src/data/events-world';
import { GOVERNANCE_ACTIONS, POLITICAL_SCENARIOS } from '../src/data/events-politics';
import {
  MISSION_COMPLICATIONS,
  MISSION_LOCATIONS,
  MISSION_OBJECTIVES,
  MISSION_THREATS,
} from '../src/data/mission-templates';
import { EN_DICT } from '../src/data/i18n';
import { ORIGINS } from '../src/data/origins';
import { BLOODLINES, DISCIPLINES } from '../src/data/powers';
import {
  ARCHETYPE_PROFILES,
  EPITHET_PARTS,
  LINE_POOL,
  MOTIVE_POOL,
  OCCUPATIONS,
  ORIGIN_POOL,
  SKILL_POOL,
  ULTIMATE_POOL,
  WEAKNESS_LABELS,
} from '../src/data/characters';
import { VILLAGES } from '../src/data/villages';

function assertUniqueIds(label: string, items: readonly { id: string }[]): void {
  const seen = new Set<string>();
  for (const item of items) {
    expect(seen.has(item.id), `Duplicate id "${item.id}" in ${label}`).toBe(false);
    seen.add(item.id);
  }
}

describe('Content pack data integrity', () => {
  it('has zero duplicate IDs across every data pack', () => {
    assertUniqueIds('ORIGINS', ORIGINS);
    assertUniqueIds('VILLAGES', VILLAGES);
    assertUniqueIds('CLANS', CLANS);
    assertUniqueIds('EMERGENT_TEMPLATES', EMERGENT_TEMPLATES);
    assertUniqueIds('POLITICAL_SCENARIOS', POLITICAL_SCENARIOS);
    assertUniqueIds('GOVERNANCE_ACTIONS', GOVERNANCE_ACTIONS);
    assertUniqueIds('MISSION_OBJECTIVES', MISSION_OBJECTIVES);
    assertUniqueIds('MISSION_COMPLICATIONS', MISSION_COMPLICATIONS);
    assertUniqueIds('DISCIPLINES', DISCIPLINES);
    assertUniqueIds('BLOODLINES', BLOODLINES);
    assertUniqueIds('LIFE_EVENTS', LIFE_EVENTS);
    assertUniqueIds('GROWTH_EVENTS', GROWTH_EVENTS);
    assertUniqueIds('FLAVOR_LINES', FLAVOR_LINES);
    assertUniqueIds('DANGEROUS_MISSIONS', DANGEROUS_MISSIONS);
    assertUniqueIds('SENSEI_ARCHETYPES', SENSEI_ARCHETYPES);
    assertUniqueIds('TEAMMATE_ARCHETYPES', TEAMMATE_ARCHETYPES);
    assertUniqueIds('TEAM_EVENTS', TEAM_EVENTS);
    assertUniqueIds('CRISIS_WHISPERS', CRISIS_WHISPERS);
    assertUniqueIds('RETIREMENT_EVENTS', RETIREMENT_EVENTS);
    assertUniqueIds('OCCUPATIONS', OCCUPATIONS);
    assertUniqueIds('ARCHETYPE_PROFILES', ARCHETYPE_PROFILES);
    assertUniqueIds('WAR_CROSSROADS', WAR_CROSSROADS);
    assertUniqueIds('ACHIEVEMENTS', ACHIEVEMENTS);
  });

  it('contains no em-dash characters in UI dictionary or event prose', () => {
    const allStrings: string[] = [
      ...Object.values(EN_DICT),
      ...CLANS.flatMap((c) => [
        c.name,
        c.ethos,
        c.historyNote,
        c.yearlyBonus.label,
        ...c.hidenArts.flatMap((h) => [h.name, h.desc]),
      ]),
      ...POLITICAL_SCENARIOS.flatMap((p) => [p.title, p.summary]),
      ...GOVERNANCE_ACTIONS.flatMap((g) => [g.label, g.desc]),
      ...MISSION_OBJECTIVES.flatMap((m) => [m.title, m.objective, m.client, m.constraint]),
      ...MISSION_COMPLICATIONS.flatMap((c) => [c.title, c.detail]),
      ...MISSION_LOCATIONS,
      ...MISSION_THREATS,
      ...VILLAGES.flatMap((v) => [
        v.name,
        v.flavor,
        v.history,
        v.culture,
        v.politicalInterests,
        v.institutions.shadowOrgName,
        v.institutions.shadowOrgDesc,
        v.institutions.academyLabel,
      ]),
      ...Object.values(VILLAGE_CRISIS_COPY).flatMap((c) => [
        c.title,
        c.body,
        c.reformLabel,
        c.hardlineLabel,
        c.shadowLabel,
      ]),
      ...ACHIEVEMENTS.flatMap((a) => [a.title, a.desc]),
      ...LIFE_EVENTS.flatMap((e) => [e.title, e.body, ...e.options.map((o) => o.label)]),
      ...GROWTH_EVENTS.flatMap((e) => [e.title, e.body]),
      ...TEAM_EVENTS.flatMap((e) => [e.title, e.body]),
      ...CRISIS_WHISPERS.flatMap((e) => [e.title, e.body]),
      ...RETIREMENT_EVENTS.flatMap((e) => [e.title, e.body]),
      ...WAR_CROSSROADS.flatMap((c) => [c.title, c.body, ...c.options.flatMap((o) => [o.label, o.resultText])]),
      ...OCCUPATIONS.flatMap((o) => [o.label, ...o.roleTitles]),
      ...ARCHETYPE_PROFILES.flatMap((r) => [
        r.epithet,
        r.motive,
        r.originHint,
        r.ultimate.name,
        r.ultimate.desc,
        r.lines.meet,
        r.lines.clash,
        r.lines.win,
        r.lines.fall,
      ]),
      ...Object.values(SKILL_POOL).flatMap((byEl) =>
        Object.values(byEl).flatMap((list) => (list ?? []).map((s) => s.name)),
      ),
      ...Object.values(ULTIMATE_POOL).flatMap((byEl) =>
        Object.values(byEl).flatMap((list) => (list ?? []).flatMap((u) => [u.name, u.desc])),
      ),
      ...Object.values(LINE_POOL).flatMap((byTac) =>
        Object.values(byTac).flatMap((list) => (list ?? []).flatMap((l) => [l.meet, l.clash, l.win, l.fall])),
      ),
      ...Object.values(MOTIVE_POOL).flat(),
      ...Object.values(ORIGIN_POOL).flat(),
      ...Object.values(EPITHET_PARTS.elementPrefix).flat(),
      ...Object.values(EPITHET_PARTS.villagePrefix).flat(),
      ...Object.values(EPITHET_PARTS.archetypeSuffix).flat(),
      ...WEAKNESS_LABELS,
    ];

    for (const s of allStrings) {
      expect(s.includes('—'), `Found em-dash in string: ${s}`).toBe(false);
    }
  });
});
