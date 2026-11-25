# 04 — Servants

## 4.1 Roster (`HEROES`, index.html:2267–2519 + JSON patch set; `CLS` 2247)

135 servants. 112 are object literals; 23 were added as JSON entries whose extra tables are patched in around 15137–15300.

| Class | Code | Count | Servants |
|---|---|---|---|
| Saber | `sword` | 17 | Sigurd, Siegfried, Artoria, Nero, Gawain, Mordred, Altera, Charlemagne, Bedivere, Okita, Musashi, Rama, Richard I, Barghest, Lanling Wang, Senji Muramasa, Suzuka Gozen |
| Archer | `bow` | 18 | Arjuna, Robin Hood, Atalanta, EMIYA, Gilgamesh, Chiron, Arash, Tristan, Nobunaga, Tomoe, Tesla, Napoleon, Orion, Super Orion, Ptolemaios, Baobhan Sith, EMIYA Alter, Ishtar |
| Lancer | `lance` | 19 | Cú Chulainn, Hector, Leonidas, Diarmuid, Karna, Vlad III, Elisabeth, Enkidu, Scáthach, Romulus, Brynhild, Qin Liangyu, Fionn, Caenis, Don Quixote, Percival, Kagetora, Ereshkigal, Melusine |
| Rider | `rider` | 18 | Iskandar, Boudica, Achilles, Medusa, Drake, Astolfo, Georgios, Teach, Ozymandias, Medb, Ushiwakamaru, Ivan the Terrible, Odysseus, Hippolyta, Takeda Shingen, Constantine XI, Habetrot, Quetzalcoatl |
| Caster | `caster` | 17 | Medea, Merlin, Paracelsus, Gilles, Tamamo, Andersen, Shakespeare, Da Vinci, Nitocris, Mozart, Xuanzang, Circe, Avicebron, Prelati, Solomon, Asclepius, Queen of Sheba |
| Assassin | `shadow` | 15 | Jing Ke, Kojirō, Cursed Arm, Hundred-Faced, Serenity, King Hassan, Semiramis, Jack, Li Shuwen, Sanson, Shuten, Huyan Zhuo, Kama, Nameless Assassin, Hassan of the Wings |
| Berserker | `berserk` | 18 | Lancelot, Heracles, Spartacus, Lü Bu, Frankenstein, Asterios, Darius III, Beowulf, Kintoki, Raikō, Ibaraki, Penthesilea, Hijikata, Caligula, Kriemhild, Morgan, Lilith, Tamamo Cat |
| Avenger *(special)* | `avenger` | 6 | Gankutsuō, Salieri, Hessian Lobo, Kagekiyo, Angra Mainyu, Jeanne Alter |
| Ruler *(special)* | `judge` | 4 | Jeanne, Qin Shi Huang, Amakusa, Holmes |
| Moon Cancer *(special)* | `moon` | 1 | BB |
| Alter Ego *(special)* | `ego` | 2 | Meltryllis, Passionlip |
| Beast | `beast` | boss | Kiara (Beast III/R crisis only) |

BB, Meltryllis and Passionlip are **moon-gated** (`MOON_GATED` 17058): never in normal pools (see chapter 09).

## 4.2 Servant data schema

| Field | Meaning |
|---|---|
| `id`, `cls`, `name`, `title`, `from`, `fem` | identity, class, epithet, source myth/work, sex |
| `s` | five ranks `[STR, AGI, END, MANA, LUCK]` |
| `art {n, d}` | Noble Phantasm name and description |
| `traits` | 1–2 of Honor / Compassion / Loyalty / Ambition / Freedom — drive summon fit and trust reactions |
| `wish`, `relic`, `frags` | Grail wish, catalyst, 3 backstory fragments (unlocked by talks) |
| `sp` | special ability (39 servants): `intel` ×11, `guard` ×7, `escape`/`leaf`/`tough`/`judge`/`assassin` ×3, `avenge`/`traitor` ×2, `gate` (Gilgamesh), `revive` (Heracles) |

Parallel tables keyed by id: `ARTX` (NP rank/kind), `SK` (skills, 4929), `NPR` (NP role/scope, 12791), `HAL` (alignment,
10811), `HX` (personality axes, 15108), `HLK` (likes/dislikes, 10812), `HDAY` (day lines), `VOICE` (2650), `TALKX`, `LASTW`,
`PAIRV` (57 rival pairs with meet/fall/win lines, 2522), `RIVAL` (2525), `RLU` (per-servant relationship lines, 9338).

## 4.3 Rank → number (`RANKV`, 5107–5110)

| Rank | E | D | C | B | A | EX | ? |
|---|---|---|---|---|---|---|---|
| Value | 1 | 2 | 3 | 4 | 5 | 6 | 4.5 |

`+` adds 0.4, `-` subtracts 0.4; `"X ▲n"` adds n (Command Seal buffs); `"X~Y"` averages; unknown → 3. `npRV` = NP rank value
(`'-'` uses max(STR, AGI)).

## 4.4 Master tier modifies the servant (7940–7958)

```
masterScore = circuit × 12 + Mana × 0.6 + 8 (crest)
Tier: S ≥ 95, A ≥ 75, B ≥ 50, C ≥ 30, else D           (NPC tier from pw: S ≥ 83, A ≥ 74, B ≥ 48, C ≥ 33)
```

| Tier | STR | AGI | END | MANA | LUCK |
|---|---|---|---|---|---|
| S | +½ | 0 | +½ | +1 | +½ |
| A | 0 | 0 | 0 | +½ | 0 |
| B | 0 | 0 | 0 | 0 | 0 |
| C | −1 | 0 | 0 | −1 | 0 |
| D | −1 | −1 | −1 | −1 | −1 |

(½ = one `+` step.) **Starved:** master Health < 35 and no Independent Action → STR and AGI −1. This is the main bridge between
the life phase and the war: a well-trained magus fields a stronger servant.

**Enkidu** has all-`?` stats replaced by a point-buy morph (`MORPH` 7946): D 29 / C 32 / B 35 / A 37 / S 40 points across
balance / attack / defense / speed stances, switchable once per round.

## 4.5 Skills (`SKX` 4823, `SK` 4929)

About 230 skill names map to an effect kind; `SV(h, kind)` sums rank values of that kind.

| Kind | Effect |
|---|---|
| power | power +1.2 × rank |
| div / mad / rally | power +0.8 × rank |
| ride | +0.8 on attack; flee +3 %/rank |
| insight | +0.9 from round 2; rank ≥ A on Instinct/Revelation/Clairvoyance → **foresee** enemy NP |
| avenge | +(100 − HP) × 0.045 × rank |
| sabotage | enemy −1.1 × rank |
| slayer | enemy −1.2 × rank (conditional) |
| evade | damage taken −3.5 %/rank (cap 35 %), flee +2 % |
| mr (Magic Resistance) | magic damage × (1 − min(.4, .04 × rank)); NP damage −4 %/rank |
| survive | once per war, stand back up at 12 HP |
| stealth | lower threat chance, less Exposure from NP, ambush +1.4 × rank in round 1 |
| fort | Bounded Field ×3 at start; defense bonuses |
| regen / heal | dawn HP and SM recovery |
| ind (Independent Action) | costs ×0.8, never starved, longer stray survival |
| gold | Wealth at dawn |
| reveal | true-name reveals |
| armor | Karna: damage ×0.7 until Vasavi Shakti is used |

**EDGE** (5046): hand-tuned bonuses for ~41 servants with low measured win rates, `rank × EDGE_K` with kinds flat 2.2 /
first 3.4 / late 2.4 / grit 0.06 × (100 − HP) / guard 2.8. (The literal `v` stored in each entry is dead; it is recomputed.)

## 4.6 Noble Phantasms (12741–13410)

**Damage** (`npDmg` 12743):

```
max(3, round( (8 + npRV × 2.5) × NP_MUL(2.2)
              × clamp(1 + (MANA − 3) × .05, .8, 1.25) × U(.85, 1.15)
              × (.75 if enemy knows the NP) × (.8 if elder master)
              × (1 − min(.4, MR × .04 + evade × .02)) ))
```

A rank-A NP averages ~45 damage; EX ~52 — against a 100 HP scale. Gilgamesh, Okita and EMIYA Alter ignore the MR/evade
reduction.

**Mana cost** (`smCost('art')`):

```
scopeMul × (22 + npRV × 3) × clamp(1 − (MANA − 3) × .05, .8, 1.2)
  × .85 (trust ≥ 60) × 1.4 (Berserker) × .8 (Independent Action) × .85 (Caster)
scopeMul (SC_COST): anti-unit .8, anti-army 1, anti-fortress/anti-country 1.15, anti-world 1.3
```

**Roles** (`NPR`): A Attack, D Defense (wall), F Field, S Self-buff, H Heal, B Buff, W Weaken, X Special (Medea, Angra,
Holmes, Circe, Solomon). **Scope:** anti-unit, anti-army, anti-fortress, anti-country, anti-world, barrier, special. Lasting
effects for fields/walls/supports live in `FIELD_SP` / `WALL_SP` / `SUP_SP` (12826–12845).

### Special matchups (`npCVsp` / `npDmgSp`)

| Case | Effect |
|---|---|
| Gilgamesh | +5 clash value |
| Arash | +10 clash, ×2 damage, then dies |
| Karna / Enkidu / Nobunaga | +2 × target's Divinity |
| Rama vs `DEMONIC` (Ibaraki, Shuten, Raikō, Medusa, Tamamo, Suzuka, Tamamo Cat) | +6 clash |
| Dragon-slayers (Siegfried, Sigurd, Kriemhild) vs `DRAGON` (Artoria, Mordred, Siegfried, Sigurd, Jeanne Alter, Elisabeth) | +6 clash, ×1.25 damage |
| Georgios | marks target as a dragon |
| Hijikata | scales with missing HP |
| Muramasa | +8 vs Defense/Field NPs |
| Ishtar | +6 vs Gilgamesh |
| Baobhan Sith | ×1.25 vs revealed targets |
| Lilith | ×1.2 vs Lawful or Good |
| Tamamo Cat | nap: −30 power on its start round (`NAP_P`) |

### NPC NP usage (`npcNPProb` 13061)

Attack-role probability per round `(.1 + .1 if HP < 50 + .1 if final + .25 if your HP ≤ 35) × persona` (reckless 1.8 …
defensive .7), × .25 under the `preserve_mana` plan. NPCs pay from servant mana; no per-battle cap.
