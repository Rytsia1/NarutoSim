import { describe, expect, it } from 'vitest';
import { ACHIEVEMENTS } from '../src/data/achievements';
import { CLANS } from '../src/data/clans';
import { RETIREMENT_EVENTS } from '../src/data/events-epilogue';
import { DANGEROUS_MISSIONS, FLAVOR_LINES, GROWTH_EVENTS, LIFE_EVENTS } from '../src/data/events-life';
import { CRISIS_WHISPERS, SENSEI_ARCHETYPES, TEAMMATE_ARCHETYPES, TEAM_EVENTS } from '../src/data/events-team';
import { WAR_CROSSROADS } from '../src/data/events-war';
import { EMERGENT_TEMPLATES, VILLAGE_CRISIS_COPY } from '../src/data/events-world';
import { EN_DICT } from '../src/data/i18n';
import { ORIGINS } from '../src/data/origins';
import { BLOODLINES, DISCIPLINES } from '../src/data/powers';
import { ROSTER } from '../src/data/roster';
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
    assertUniqueIds('ROSTER', ROSTER);
    assertUniqueIds('WAR_CROSSROADS', WAR_CROSSROADS);
    assertUniqueIds('ACHIEVEMENTS', ACHIEVEMENTS);
  });

  it('contains no em-dash characters in UI dictionary or event prose', () => {
    const allStrings: string[] = [
      ...Object.values(EN_DICT),
      ...CLANS.flatMap((c) => [c.name, c.ethos, c.historyNote, c.yearlyBonus.label]),
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
      ...ROSTER.flatMap((r) => [
        r.name,
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
    ];

    for (const s of allStrings) {
      expect(s.includes('—'), `Found em-dash in string: ${s}`).toBe(false);
    }
  });
});
