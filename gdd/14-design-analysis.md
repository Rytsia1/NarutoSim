# 14 — Design Analysis & Issue Register

This chapter evaluates the implemented design with the **5-Component Filter** (Clarity, Motivation, Response, Satisfaction,
Fit; conflict priority Response > Clarity > Satisfaction > Fit > Motivation), lists risks and abuse cases, proposes playtest
scenarios, and consolidates every defect found during reverse-engineering.

Ratings are qualitative judgements from reading the code, not from playtest data.

## 14.1 System evaluation

| System | Clarity | Motivation | Response | Satisfaction | Fit |
|---|---|---|---|---|---|
| Life loop (ch. 02) | **Strong** — every choice shows stat chips and ✓/✗ checks | **Adequate** — stats matter later, but the link to the war is invisible until age 17–36 | **Adequate** — one decision per year; focus is the main lever | **Adequate** — text only, no FX for most growth | **Strong** — origins, orphan rewrites, leanings feel like a life |
| Magecraft & eyes (ch. 03) | **Weak** — advancement odds, gates and XP are hidden; "why didn't my art level?" has no answer | **Strong** — arts become battle actions and achievements | **Adequate** — "Dig deep / just enough / not now" is a real choice | **Strong** — awakening events, Rainbow eye, 107 achievements | **Strong** |
| Summoning (ch. 05) | **Weak** — affinity `exp(fit/8)` and leaning effects are invisible | **Strong** — the servant defines the run | **Adequate** — relic choice and bond summon give agency | **Strong** — summon FX + class theme | **Strong** — "the Grail picks someone like you" |
| War day/night loop (ch. 05) | **Adequate** — intel thresholds and Exposure are shown; threat odds are not | **Strong** — every night risks the run | **Strong** — 10+ distinct actions, class-specific options | **Adequate** — most outcomes are log lines | **Strong** |
| Combat (ch. 06) | **Weak** — `U(−18, 18)` per side vs an 8-point threshold means a single round is mostly noise; odds displays use class averages for unrevealed foes | **Strong** — death is permanent for the war | **Adequate** — attack type matters (`atkM` up to ×1.6), but noise dominates single rounds | **Adequate** — NP clash FX strong; regular rounds are text | **Strong** — NP matchups honor the source |
| Servant bond (ch. 07) | **Adequate** — tiers shown; diminishing returns and fit multipliers hidden | **Strong** — trust has combat, finale and epilogue payoffs | **Strong** — talks, outings, crossroads, seals all move it | **Strong** — 750 KB of per-servant lines | **Strong** |
| NPC AI (ch. 08) | **Adequate** — 6-axis view and planner view exist in the info sheet | **Strong** — alliances and betrayals threaten the player | **Adequate** — the player can ally, mediate, provoke | **Strong** — story titles and arcs at the end | **Strong** |
| Crises (ch. 09) | **Adequate** — banner with 3 phase pips; Kiara's divisor formula is opaque | **Strong** — city-wide stakes, unique endings | **Strong** — stance, Key, culling resistance, piece hunting | **Strong** — bespoke FX and music | **Strong** |
| Meta (ch. 11) | **Strong** — codex states and progress bars | **Adequate** — collection only; no power carry-over (by design) | **Adequate** — bond summon and scenarios are the only levers | **Adequate** | **Strong** — ghost teams fit "the war runs without you" |

### Headline findings

1. **The game's strongest pillar is Fit.** Source fidelity, the orphan rewrites, per-servant lines and NP matchups make every
   system feel like part of one world.
2. **The weakest component is Clarity in the mechanical core** (magecraft advancement, summon affinity, combat odds). The game
   hides formulas on purpose (it is a life-sim), but where the player is asked to make a *tactical* choice — the battle menu,
   the night action — hidden odds weaken Response too: the player can't tell a good decision from a lucky one.
3. **Combat variance is by design but unbounded in explanation.** The underdog term and ±36 swing make upsets common; the
   war report explains *what* happened but not *why* a round was lost.
4. **The life → war bridge is mostly invisible.** Master tier (circuit, Mana, crest) changes servant stats by up to ±1 rank,
   leanings change who you summon, and Knowledge unlocks weakness exploitation — but none of this is surfaced during the life
   phase, so Motivation for life choices relies on curiosity.

## 14.2 Risks & abuse cases

| Risk | Mechanism | Severity |
|---|---|---|
| Summon certainty | Bond summon is 100 % after a Grail win with that servant (`bondChance` 18813): a player can replay a favourite forever | Low — bond lives are excluded from stats, and it is a fan-service feature |
| Stat spoofing | `/api/life` trusts the client; only enums/ranges/rates are checked | Low–Medium — public stats page could be skewed |
| Turtling | High Bounded Field + Lie low every night | Mitigated by siege, coalition, hostage, restlessness, altar day lockout |
| Auto-play idling | Auto picks random `auto` options | Low — it is a deliberate idle mode |
| Save-scumming | `load()` does **not** restore the RNG position: it reseeds `mulberry(seed + age×7919 + epilogueStep×31337)` and clears the pending choice (`index.html:17051`). Age is constant during the war, so every mid-war reload restarts the same stream | Medium — a reload gives one fixed "second roll" that differs from the uninterrupted run, and varying earlier choices after a reload shifts outcomes; not a free infinite reroll |
| Motion-sensitive players | FX ignore `prefers-reduced-motion` | Medium |
| Deploy size | 81 MB unused sprites under `public/assets/sprites/`; `.assetsignore` excludes only `**/README.md`, so they **are** uploaded | Medium |

## 14.3 Playtest scenarios

| Type | Scenario | Pass signal |
|---|---|---|
| New player | Start a life with no guidance; after the first war, ask "why did you get that servant?" and "what does Bounded Field do?" | Player names at least one cause correctly |
| Stress | Run `dev/sim.js` with 2,000 lives at 8× and auto-play | No exceptions; every life reaches `record()` |
| Skill | Two testers play 10 wars each: one using intel + attack-type reads, one picking randomly | Skilled tester's win rate measurably higher |
| Abuse | Turtle strategy (Defend + Lie low every night) for 20 wars | Turtle win rate not higher than mixed play |
| Readability | Observer watches a battle log and explains why the round was lost | Observer cites a real factor (stats, attack type, seal) |

## 14.4 Recommendations

Each numeric recommendation follows the Numbers Policy (**Starting value**: test, metric, direction).

| # | Recommendation | Posture / test |
|---|---|---|
| R1 | Regenerate `src/known.js` after every content commit (run `tools/known.js --check` in the release script) | No number |
| R2 | Accept `zhs` / `zht` in `postLife` `lang` validation | No number |
| R3 | Show a one-line "why" on battle rounds: the largest contributing term (e.g. "Attack type: STR B vs END A") | No number; validate with the readability playtest |
| R4 | Narrow combat noise from `U(−18, 18)` to `U(−14, 14)` per side | **Starting value.** Test: `dev/sim.js` 5,000 wars before/after. Metric: share of rounds whose winner flips vs. a noiseless run. Pass: flips drop from the current rate by ≥ 20 % while the per-servant win-rate spread (max − min) stays within ±5 pts of today. If the spread widens, move back toward 16 |
| R5 | Surface the life → war bridge: show master tier (S–D) on the status tab from age 16 | No number |
| R6 | Respect `prefers-reduced-motion` by defaulting all full-screen FX to off | No number |
| R7 | Fix `pickLongGoal` field names (`madness`, `loyalty` → existing persona fields) | No number; verify with `dev/plan_test.js` |
| R8 | Add `sprites/**` to `public/.assetsignore` until the pixel-art battle feature ships (they are currently uploaded) | No number |
| R10 | Persist the RNG position in the snapshot (or reseed from a per-decision counter) so a reload reproduces the exact pre-reload outcome | No number; validate by reloading at a battle decision and comparing results |
| R9 | Implement `bxRep()` so Beast III/R lives feed global stats | No number |

## 14.5 Issue register

### Bugs

| # | Issue | Location | Effect |
|---|---|---|---|
| B1 | `pickLongGoal` reads `mp.madness` and `mp.loyalty`; `masterPersona` returns `loyal` and no madness | `index.html:7718–7719` | Dominate (+22) and Coalition (+18) terms never contribute |
| B2 | `collapsed` war outcome is labelled and handled in the UI but never set | 6830, 20081–20094, 20313 | Dead ending; `finalNight` comment says the Grail can sink empty but the loop always yields a winner |
| B3 | `cupPure: ch(.4)` immediately overwritten by `!crisis` | 7006 | Purity is entirely crisis-driven; Church "dark Grail" hints only matter in crisis wars |
| B4 | Duplicate epilogue id `checkup` in `EPI_POOL` | pool entries 128 and 244 | Second entry shadowed |
| B5 | `src/known.js` (11-22) predates the 11-25 eyes and arts | `src/known.js` | New achievements silently dropped by the server |
| B6 | `postLife` accepts only ko/en/ja | `src/worker.js` | zhs/zht lives stored with `lang = null` |
| B7 | `detectArcs` looks for a `kill` fact that is never recorded; in-battle shielding never records `servant_protect` | 7319, ~13492 | Masterless and devotion arcs under-fire |
| B8 | `bxRep()` returns `null` | 8974 | No server stats for Beast III/R |

### Comment / display mismatches

| # | Issue | Location |
|---|---|---|
| C1 | `CRISIS` comment says 20 %/25 % for the Black Grail alone (predates Beast) | 8160 |
| C2 | Boss comment says it "survives 100 HP twice (200 total)"; `hp2` is 30 | 8387 |
| C3 | `dodgeP` comment: 1.5 %/step, 3–18 %; code: 1.2 %/step, 3–15 % | 13589 |
| C4 | `trustGain` comment: full to 40, half at 70; code: full to 30, half at 55, floor at 75 | 9269 |
| C5 | Power uses trust neutral 40 (`trust × .15 − 6`); UI displays `(trust − 50) × .15` | 7972 vs `battleMods` |
| C6 | `EPI_END` text says 60 years; code uses `warYear + 58` | `EPI_END` 15059 |
| C7 | `MECH_W` "fitted on 129 heroes"; roster is 135 | 8056 |
| C8 | `dev/BX_PLAN.md` vs code: karma ×0.85 (plan 0.7), NPC roll −41 (plan −25), NPC-only HP ×2.8 (plan ×2), global ×1.3 unplanned | 8635 |

### Dead or unreachable code

| # | Issue | Location |
|---|---|---|
| D1 | `LEN` 20/60 lengths unreachable (UI hard-codes 40) | 5497, 17711 |
| D2 | 38 % post-war-age event rate in `rollEvent` unreachable | 6787 |
| D3 | `CLS_BIAS = {}` and `BIAS = {}` empty hooks | 8044–8045 |
| D4 | Literal `v` values in `EDGE` entries are recomputed | 5047ff |
| D5 | `PICKUP` multiplier expired 2026-11-06 | 6941 |
| D6 | `CITY_W` empty — city weighting always uniform | 5517 |
| D7 | `HDAY` entries for heroes not in the roster (`fuuma`, `corday`) | `HDAY` 9810 |
| D8 | `bxPostDay(){}` empty | 8846 |

### Unfinished content

| # | Issue | Location |
|---|---|---|
| U1 | 10 of 36 archetypes have no `MASTER_EV` arc (flunk, fortune, streamer, stage, inlaw, antique, amnesia, exile, lecturer, kendo) | 10288 |
| U2 | 81 MB sprite set (43 servants with attack/NP sheets, 65 master sprites) not referenced | `public/assets/sprites/` |
| U3 | `DUEL_END` defines only `test`; real handlers come from the True Wish code | 11219 |
| U4 | Beast III/R simplifications: player area NPs don't sweep guards; companion NPCs don't target guards | `dev/BX_PLAN.md` |
| U5 | Codex has no "late-crisis record" section (per BX_PLAN) | — |

### Design inconsistencies

| # | Issue | Location |
|---|---|---|
| I1 | Secret Art gate: natural play circuit ≥ B **or** crest; Custom requires circuit A | 12308 vs 5694 |
| I2 | Custom mode skips `ART_CHAIN.req` (anyone can start with Demon-hunting/Executor/Firearms) | 5641 |
| I3 | Custom charges points for dumping a stat below its band; lowering circuit is free | 5679, 5672 |
| I4 | Custom family-art discount goes to the first family art in iteration order, not the main line | 5696 |
| I5 | "Mystic Eyes of Enchantment" (`ARTS.charm`, NPC-only) duplicates "Mystic Eyes of Charm" (`GIFTS.charm`) | 12094 vs 12390 |
| I6 | 1.3 s pause before a queued growth event is not speed-scaled | 5838 |
| I7 | Past/Future eras exist only in Custom mode | 5562 |
| I8 | FX ignore `prefers-reduced-motion` | 20542 |
| I9 | Post-2.02 module comments are in Indonesian; the rest of the file is Korean | e.g. 7322 |

### Code smells

| # | Issue | Location |
|---|---|---|
| S1 | `tgt.ally \|\| tgt.ally` redundant | 7586 |
| S2 | Duplicated passive-day block in `hostageTry` | 10262–10265 |
| S3 | `newLife` monkey-patched at the end of `Sim` to inject Moon flags | ~17060 |

### Balance observations (not defects)

- **Master contribution asymmetry:** player `trust×.15 + mana×.12 − 6` (≈ −6…+21) plus Od actions vs NPC `pw×.32` (≈ 7–29).
- **Variance:** ±36 noise vs an 8-point threshold, plus up to 15 underdog points.
- **NP lethality:** rank-A NP ≈ 45 damage vs 100 HP; one NP plus a failed retreat (18–32) often ends a fight.
- **Stat outliers:** Andersen E/E/E/EX/E; Qin Shi Huang B+ across the board; Heracles A-class with `revive`; Enkidu's displayed
  `?` stats differ from his real morph stats.
