import { describe, expect, it } from 'vitest';
import type { LifeRecord, LogEntry } from '../src/sim/types';
import { defaultSettings } from '../src/ui/settings';
import { detectFxFromLogEntry } from '../src/ui/fx/CinematicFxOverlay';
import { formatShareText } from '../src/ui/fx/recordCardCanvas';

function makeLog(partial: Partial<LogEntry>): LogEntry {
  return {
    id: 'test-log-1',
    year: 1020,
    age: 18,
    tone: 'war',
    text: '',
    ...partial,
  };
}

describe('Phase 5: Polish, Accessibility & Share Card', () => {
  it('defaults FX and lobby animation to disabled under prefers-reduced-motion (GDD R6)', () => {
    const reduced = defaultSettings(true);
    expect(reduced.fxEnabled).toBe(false);
    expect(reduced.lobbyAnimationEnabled).toBe(false);
    expect(reduced.soundEnabled).toBe(true);

    const normal = defaultSettings(false);
    expect(normal.fxEnabled).toBe(true);
    expect(normal.lobbyAnimationEnabled).toBe(true);
  });

  it('detects all 5 cinematic FX kinds from chronicle logs and ignores ordinary entries', () => {
    const clash = detectFxFromLogEntry(makeLog({ text: 'JUTSU CLASH! Both techniques collide midair.' }));
    expect(clash?.kind).toBe('jutsu_clash');

    const bloodline = detectFxFromLogEntry(
      makeLog({ tone: 'milestone', title: 'Awakened Sharingan', text: 'Crimson chakra floods your eyes.' }),
    );
    expect(bloodline?.kind).toBe('bloodline_awaken');

    const limitBreak = detectFxFromLogEntry(
      makeLog({ text: 'Limit Break: Surpass Limits shatters the enemy guard!' }),
    );
    expect(limitBreak?.kind).toBe('resolve_burst');
    expect(limitBreak?.headline).toBe('LIMIT BREAK');

    const kizuna = detectFxFromLogEntry(
      makeLog({ text: 'KIZUNA INTERCEPTION! Your former teammate blocks the lethal blow.' }),
    );
    expect(kizuna?.kind).toBe('resolve_burst');
    expect(kizuna?.headline).toBe('KIZUNA INTERCEPTION');

    const crisis = detectFxFromLogEntry(
      makeLog({ tone: 'crisis', title: 'Tailed-Beast Calamity Descends!', text: 'The horizon splits.' }),
    );
    expect(crisis?.kind).toBe('crisis_descent');

    const promo = detectFxFromLogEntry(
      makeLog({ tone: 'milestone', title: 'Promoted to Jonin', text: 'The council grants your vest.' }),
    );
    expect(promo?.kind).toBe('rank_promotion');

    const kage = detectFxFromLogEntry(
      makeLog({ tone: 'milestone', title: 'Acclaimed as Kage', text: 'You step onto the tower balcony.' }),
    );
    expect(kage?.kind).toBe('rank_promotion');

    const plain = detectFxFromLogEntry(
      makeLog({ tone: 'normal', title: 'Quiet Patrol', text: 'You swept the eastern border without incident.' }),
    );
    expect(plain).toBeNull();
  });

  it('formats shareable Shinobi Record text completely and without em-dashes', () => {
    const rec: LifeRecord = {
      id: 'life-1',
      seed: 424242,
      name: 'Renji Sarutobi',
      sex: 'M',
      villageId: 'konoha',
      villageName: 'Hidden Leaf',
      originId: 'clan_branch',
      originName: 'Branch Clan Heir',
      birthYear: 1000,
      deathYear: 1054,
      deathAge: 54,
      peakRank: 'jonin',
      specialStatus: 'kage',
      element: 'fire',
      bloodlineName: 'Blaze Release',
      threatTier: 'S',
      warsFought: 4,
      warsSurvived: 4,
      crisisStatus: 'Sealed the Tailed-Beast Calamity',
      causeOfDeath: 'Peaceful twilight passing',
      lastWords: 'Keep the lanterns burning for the next generation.',
      reflections: [],
      warHistory: [],
      teamSummary: 'Team 7 under Hayato Sensei',
      topDisciplines: ['Fire Release (Tier 4)', 'Fuinjutsu (Tier 3)'],
      posthumousBeats: [],
    };

    const text = formatShareText(rec);
    expect(text).toContain('Renji Sarutobi');
    expect(text).toContain('Hidden Leaf');
    expect(text).toContain('Peak Rank: Hokage');
    expect(text).toContain('Bingo Tier: S-Rank');
    expect(text).toContain('Wars Survived: 4/4');
    expect(text).toContain('Sealed the Tailed-Beast Calamity');
    expect(text).toContain('Keep the lanterns burning for the next generation.');
    expect(text).not.toContain('—');
  });
});
