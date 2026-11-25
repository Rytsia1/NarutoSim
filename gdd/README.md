# The Night the Grail Fills (성배가 차는 밤) — Game Design Document

> **Reverse-engineered GDD.** This document was reconstructed from the shipped code (repo state of 2026-11-25, 722 commits,
> v2.02 + six post-2.02 commits). It describes the game **as implemented**, not as originally intended. Where the code,
> its comments, and the internal design notes (`dev/BX_PLAN.md`) disagree, the disagreement is called out.

## One-page pitch

**Genre:** text-driven life simulation + autonomous strategy war, single-player with asynchronous multiplayer touches.
**Platform:** browser / installable PWA (desktop + mobile), hosted on Cloudflare Workers.
**Status:** live, unofficial fan work set in the Fate "Holy Grail War" universe. Korean original; English, Japanese,
Simplified and Traditional Chinese localizations.

You are **born at random** — into a magus dynasty, a fallen house, a church family, an exorcist clan, an ordinary home or an
orphanage — in one of 29 world cities. You live **year by year** (16 real seconds per year), choosing a growth focus and
answering life events, until somewhere between age 17 and 36 three **Command Seals** burn onto your hand. A **Holy Grail War**
starts in your city: you summon one of **135 Heroic Spirits** and fight six or seven AI master-servant pairs over **14 days and
nights**. Whatever happens — you win the Grail, die, flee, or refuse to fight — the game keeps going: you live out the rest of
your life in an **epilogue** until you die, and the life is recorded in a codex that persists across lives.

The hook is *one human life, with a mythic two weeks in the middle of it*.

## Document index

| # | Chapter | What it covers |
|---|---|---|
| 01 | [Overview](01-overview.md) | Vision, pillars, audience, structure, core loops |
| 02 | [Life Simulation](02-life-simulation.md) | Birth, stats, yearly loop, events, checks, mortality, war trigger, custom master |
| 03 | [Magecraft & Mystic Eyes](03-magecraft-and-mystic-eyes.md) | 25 art lines, 16 eye types, progression odds, Od and master battle actions |
| 04 | [Servants](04-servants.md) | Roster (135), stat ranks, master tier, skills, Noble Phantasms |
| 05 | [The Holy Grail War](05-holy-grail-war.md) | Summoning, pairs, day/night loop, actions, intel, threats, sieges, hunts |
| 06 | [Combat](06-combat.md) | Power formulas, round resolution, NP clash, retreat, duels |
| 07 | [Servant Bond](07-servant-bond.md) | Trust, fit, alignment, romance/friendship, Command Seals, defection |
| 08 | [NPC AI & Emergent Narrative](08-npc-ai-and-narrative.md) | Personas, relationship matrix, planner, alliances, story arcs |
| 09 | [Crises & Special Routes](09-crises-and-special-routes.md) | Black Grail, Beast III/R, True Wish route, Moon route |
| 10 | [Endings & Epilogue](10-endings-and-epilogue.md) | Grail wishes, outcome keys, epilogue, death, war report |
| 11 | [Meta-progression](11-meta-progression.md) | Codex, achievements, past lives, bond summon, ghost teams, global stats |
| 12 | [UI, UX & Presentation](12-ui-ux-presentation.md) | Screens, FX, audio, i18n, controls, accessibility |
| 13 | [Technical Architecture](13-technical-architecture.md) | Code layout, saves & sync, server API, build pipeline, tests |
| 14 | [Design Analysis & Issue Register](14-design-analysis.md) | 5-Component evaluation, risks, playtests, bugs and recommendations |

## How this document was derived

1. The repo was mapped: nearly all game logic lives in one 5 MB file, `public/index.html`.
2. Three read-only passes traced every major system (life layer; war/combat/AI layer; crises/meta/tech layer),
   extracting constants, formulas, tables and state transitions with line numbers.
3. Conflicting findings were re-verified directly against the code.
4. Design evaluation (chapter 14) applies the 5-Component Filter (Clarity, Motivation, Response, Satisfaction, Fit).

## Source map

| Path | Role |
|---|---|
| `public/index.html` L5–12 | Save-migration receiver (old GitHub Pages address) |
| `public/index.html` L1920–2060 | Loading screen, language-pack loader |
| `public/index.html` L2066–2222 | HTML screens (birth, lobby, game, dialogs, ending) |
| `public/index.html` L2227–17078 | `<script id="sim">` — the `Sim` simulation engine (data + rules) |
| `public/index.html` L17079–17142 | `<script id="syncm">` — cross-device save merge |
| `public/index.html` L17143–17360 | Procedural lobby renderer |
| `public/index.html` L17361–23026 | UI: rendering, FX, audio, i18n, codex, settings |
| `public/assets/i18n/{en,ja,zhs,zht}.js` | Translation dictionaries and templates (~21 MB) |
| `public/assets/{portraits,sprites,sound,lobby}` | 137 portraits, 343 sprite files (unused), 145 audio files, 4 skies |
| `public/stats.html` | Public global-statistics dashboard |
| `src/worker.js`, `src/known.js`, `wrangler.jsonc` | Cloudflare Worker API, allowlist, D1 + rate-limit config |
| `dev/` | ~120 `*_apply.py` patchers, headless simulators, tests, design notes |

Citations in this GDD use the form `index.html:8165`, meaning `public/index.html` line 8165. Line numbers drift as the file
changes; search for the quoted identifier if a line has moved.

## Numbers convention

Every number in chapters 01–13 is **as implemented (code)** and carries a line citation. None of them are claims about what
the *right* value is. Recommendations in chapter 14 follow the Numbers Policy: each is labelled **Starting value** (with a
test, pass/fail metric and tuning direction) or written as an **ASSUMPTION** block.

## Glossary (Korean → English)

| Korean | Code key | English term used here |
|---|---|---|
| 성배전쟁 | `war` | Holy Grail War |
| 서번트 / 영령 | `hero` | Servant / Heroic Spirit |
| 마스터 | `pair`, `master` | Master |
| 령주 | `seals` | Command Seal |
| 보구 | `art`, NP | Noble Phantasm (NP) |
| 진명 | true name | True name |
| 마력 | `mana` | Mana (master stat) / servant MANA rank |
| 지식 | `lore` | Knowledge |
| 정신 | `will` | Spirit |
| 인연 | `bond` | Bonds (social stat) |
| 건강 | `health` | Health |
| 재산 | `wealth` | Wealth |
| 마술회로 | `circuit` | Magic Circuits (grade E–A) |
| 마술각인 | `crest` | Magic Crest |
| 결계 | `fort` | Bounded Field |
| 공방 | workshop | Workshop |
| 노출 | `exposure` | Exposure |
| 신뢰 | `trust` | Trust |
| 불신 | `DIST` | Distrust (trust < 35) |
| 유대 | — | Bond (trust tier ≥ 80) |
| 오드 | `odd` | Od (master's per-battle mana pool) |
| 마안 | `gift` | Mystic Eyes |
| 감독관 | — | Supervisor (Church overseer) |
| 매장기관 | `burial` | Burial Agency |
| 검은 성배 | `black` | Black Grail (crisis) |
| 비스트 III/R | `beast3R` | Beast III/R (crisis) |
| 본성 속 진심 | `kg` | True Wish route |
| 도감 | `codex` | Codex |
| 유령 조 | `ghost` | Ghost team |
| 성향 | `aff` | Leaning (hidden moral tendency) |
