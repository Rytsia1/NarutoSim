import {
  ACHIEVEMENTS,
  ACHIEVEMENT_CATEGORY_LABELS,
  type AchievementCategory,
} from '../../data/achievements';
import type { MetaState } from '../../sim/types';

interface AchievementsPanelProps {
  meta: MetaState;
}

const CATEGORIES: AchievementCategory[] = ['path', 'kizuna', 'war', 'powers', 'crises', 'meta'];

export function AchievementsPanel({ meta }: AchievementsPanelProps) {
  const unlocked = new Set(meta.achievements);

  return (
    <section className="panel" aria-labelledby="ach-heading">
      <div className="disc-head" style={{ marginBottom: 14 }}>
        <h2 id="ach-heading" className="panel-title" style={{ margin: 0 }}>
          Shinobi Achievements
        </h2>
        <span className="status-tag tabular">
          {unlocked.size} / {ACHIEVEMENTS.length} Unlocked
        </span>
      </div>

      <div className="stat-list">
        {CATEGORIES.map((cat) => {
          const items = ACHIEVEMENTS.filter((a) => a.category === cat);
          const count = items.filter((a) => unlocked.has(a.id)).length;
          return (
            <div key={cat}>
              <div className="disc-head" style={{ marginBottom: 8 }}>
                <strong>{ACHIEVEMENT_CATEGORY_LABELS[cat]}</strong>
                <span className="disc-sub tabular">
                  {count}/{items.length}
                </span>
              </div>
              <div className="codex-grid">
                {items.map((ach) => {
                  const isDone = unlocked.has(ach.id);
                  const hideText = Boolean(ach.hidden && !isDone);
                  return (
                    <article key={ach.id} className={`squad-card ${!isDone ? 'fallen' : ''}`}>
                      <div className="disc-head">
                        <span>{hideText ? 'Hidden Achievement' : ach.title}</span>
                        <span className={`status-tag ${isDone ? 'rank-chunin' : ''}`}>
                          {isDone ? 'Unlocked' : 'Locked'}
                        </span>
                      </div>
                      <div className="disc-sub">
                        {hideText ? 'Trigger a hidden route or rare miracle to reveal.' : ach.desc}
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
