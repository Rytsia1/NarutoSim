# NarutoSim — Rencana Rework Combat: Power Fantasy & Jutsu Individual

## Context
Ada dua masalah yang membuat combat NarutoSim belum terasa seperti Naruto:

1. **Karakter kuat tidak terasa kuat.**
   - `initWarState` (`src/sim/war.ts:220`) mengecilkan semua NPC roster menjadi 62% / 78% / 94% mengikuti rank pemain.
   - `unitBasePower` (`src/sim/combat.ts:116`) menambahkan konstanta 78. Akibatnya selisih stat 3.0 vs 5.0 hanya menghasilkan ±16 power, padahal noise-nya ±14 per sisi.
   - "Underdog Grit" (`combat.ts:354`) dan reversal flat 6–14% (`combat.ts:1302`) terus membantu pihak yang lebih lemah.
   - NPC tidak punya klasifikasi rank, threat, atau tier. Engine tidak tahu apakah lawannya Genin biasa atau S-class Missing-nin.
2. **Jutsu hanya nama, bukan kemampuan.**
   - Pemain memilih *kategori* (taijutsu, ninjutsu, …). Lalu `pickPlayerJutsu` (`src/data/jutsu.ts:179`) memilih nama memakai `round % pool`.
   - Semua ninjutsu berbiaya 8 CP dengan satu formula damage.
   - Ada meter kedua, `battle.od`, khusus untuk aksi pendamping (Kuchiyose, Mystical Palm, Ward, Clone).

**Tujuan:**
- Gap kekuatan yang benar-benar terasa, tetapi tetap bisa diatasi dengan taktik.
- Database ±28 jutsu individual yang masing-masing punya cost, rank, mastery, dan efek mekanis sendiri.
- Satu meter Chakra.

### Keputusan yang sudah ditetapkan
- **Roster penuh, tanpa bantuan:** semua musuh selalu muncul dengan kekuatan aslinya, tanpa scaling apa pun.
- **Genin normalnya tidak dikirim ke perang.** Hanya ada kesempatan khusus yang langka: crisis war, atau emergency draft ±10%. Bila terkirim, perang menjadi skenario bertahan hidup.
- **Mastery dihitung per jutsu**, dengan counter penggunaan untuk tiap teknik.
- **Support jutsu memakai giliran exchange.** Tidak ada lagi aksi gratis yang menempel di serangan. Satu teknik per exchange.

### Prinsip desain
1. Power scaling itu asimetris.
2. Rank bukan kekuatan.
3. Jutsu adalah kemampuan nyata.
4. Chakra punya konsekuensi.
5. Taktik bisa mengalahkan kekuatan, asal ada alasan yang masuk akal.
6. Setiap karakter punya spesialisasi.

### Yang dipakai ulang (bukan ditulis ulang)
- **Jalur support** di `resolveBattleRound` (`combat.ts:943`): `support_heal`, `support_ward` dan `support_clone` sudah berbiaya CP, tapi selama ini tidak pernah muncul di menu. Jalur ini menjadi tujuan routing jutsu ber-role heal, defense, evasion dan summon.
- **Jalur Ultimate dan Jutsu Clash** (`combat.ts:1073–1239`) dipakai untuk jutsu ber-role `clash`.
- **Suku-suku taktis yang sudah ada** di `computePlayerRoundPower`: intel, fort, ambush, prep, high ground, partner, weakness exploited, dan exhaustion. Setelah formula baru, suku-suku ini menjadi sistem *Tactical Advantage*.
- **`computeRetreatChance`**, Body Flicker, Partner/Kizuna Interception, dan Nindo Resolve menjadi alat bertahan hidup.
- **Nama jutsu dan hand seals** yang sudah ada di `jutsu.ts`, plus `ZODIAC_SEAL_KANJI` dan `formatHandSeals`.
- **`tools/balance-report.ts`**: harness Monte Carlo yang mensimulasikan 500 perang per rank.
- **Registry migrasi** di `src/sim/kernel/bootstrap.ts:33`.

### Di luar cakupan (follow-up)
- Fase 7: counter dan interrupt (di situlah `castTime`/`range` mulai berarti).
- Fase 8: NPC memilih jutsu sesuai situasi.
- Fase 9: Kekkei Genkai dan jutsu klan (Kagemane, Kamui, Sand).

---

## Fase 1 — Official Rank, Threat Class, Combat Tier (P0)

**Tujuan pemain:** langsung tahu seberapa berbahaya lawan sebelum memilih bertarung atau kabur.

**Cara kerja:**
1. **Tipe baru di `src/sim/types.ts`:**
   - `NpcOfficialRank = 'genin' | 'chunin' | 'tokubetsu_jonin' | 'jonin' | 'kage'`
   - `ThreatClass = 'D' | 'C' | 'B' | 'A' | 'S'`
   - Field baru di `WarCompetitor`: `officialRank`, `formerShinobi?: boolean` (penanda missing-nin), dan `threatClass`.
2. **`src/data/roster.ts`:** tambahkan ketiga field itu ke `RosterShinobiDef`, lalu isi untuk ke-24 entri.
   - 21 entri dasar menjadi `jonin` atau `tokubetsu_jonin`, threat A atau B.
   - 3 entri `rogue_s` menjadi former jonin, threat **S**.
3. **Combat Tier diturunkan dari stat, tidak disimpan.**
   - Fungsi baru `getCombatTier(ranks)` di `combat.ts`, dengan CR = rata-rata 5 rank.
   - Fungsi yang sama dipakai untuk pemain maupun NPC, sehingga label tidak bisa melenceng dari angka.

| Tier | CR |
|---|---|
| academy | < 1.8 |
| genin | 1.8 – 2.6 |
| chunin | 2.6 – 3.4 |
| jonin | 3.4 – 4.2 |
| elite_jonin | 4.2 – 4.8 |
| kage_class | 4.8 – 5.5 |
| legendary | ≥ 5.5 |

4. **Builder khusus di `war.ts`** juga diisi field-nya:
   - Ex-teammate rogue (`war.ts:262`): former chunin, threat A.
   - Village comrade (`war.ts:358`): chunin.
5. **Clarity: `getPowerGapRead(state, enemy)`.**
   - Dihitung dari `getDisplayEnemyRanks`, jadi stat tersembunyi tidak bocor.
   - Hasilnya: *Overwhelming / Major disadvantage / Disadvantage / Competitive / Advantage / Dominant*.
   - Ditampilkan di header BattleDialog bersama threat class dan tier musuh.
   - Threat class terlihat sejak pertemuan pertama (ibarat Bingo Book). Rank pasti tetap butuh intel ≥ 80.

---

## Fase 2 — Hapus Global Enemy Scaling (P0)

1. Hapus `scaleMult` (`war.ts:220–226`) beserta parameternya di `createCompetitorFromRoster` (`war.ts:162–209`).
2. Hapus semua `* scaleMult` di `war.ts:239, 245, 256, 263, 276–283, 310, 352`.
3. **Konsekuensi yang diharapkan:**
   - Death rate Chunin naik.
   - Genin yang jarang terkirim (Fase 2b) menghadapi skenario bertahan hidup.
   - Retreat, Body Flicker, partner, ambush, dan prep menjadi alat utama.

---

## Fase 2b — Genin Normalnya Tidak Dikirim ke Perang (P0)

**Masalah:** setiap kali perang terpicu, Genin selalu ikut dikirim (`life.ts:1237` → `buildWarPreludeDecision`). Teks prelude Genin bahkan berbunyi "Even Genin cells are being rushed…".

**Cara kerja:**
1. **Roll draft di `life.ts:1241`:**
   ```ts
   const geninDeployed =
     state.rank === 'genin' && (worldTick.isCrisisWar || rng.chance(GENIN_DRAFT_CHANCE));
   ```
   - `GENIN_DRAFT_CHANCE = 0.1` (posture B).
   - Crisis war dihitung sebagai "kesempatan khusus", seperti Allied Shinobi Forces yang memanggil semua tenaga.
   - Hasilnya diteruskan ke `buildWarPreludeDecision(state, isCrisisWar, geninDeployed)` dan disimpan di `meta`.
2. **Genin yang terkirim:** prelude "emergency mobilization" yang ada tetap dipakai, kini dibingkai sebagai kejadian langka dengan judul log **"Emergency Genin Draft"**.
3. **Genin yang tidak terkirim:** prelude baru `war_prelude_genin_home` dengan dua opsi:
   - *Reinforce village patrols*: +Will, sedikit −Health, peluang mati karena raid ±4% (B).
   - *Run supply/medical relays*: +Bonds, +Intel.
4. **Resolver `war_prelude`** (`life.ts:2740`): blok civilian diperluas menjadi cabang "home front" untuk `civilian || (genin && !geninDeployed)`.
   - Pembukuan akhir perang yang sama dipakai ulang: `warHistory` dengan `outcome: 'survived'`, `warsSurvived`, `eraNumber`, `lastWarAge`, reset tension, dan log penutup.
   - `rankAtStart` mencatat rank asli.
5. `tools/balance-report.ts` mengirim `geninDeployed = true`, supaya baris Genin tetap mengukur kasus yang terkirim.

---

## Fase 3 — Formula Power dengan Gap Nyata (P0)

**File:** `src/sim/combat.ts`

1. **Base power baru:**
   ```ts
   unitBasePower(ranks, hp) = POWER_PER_RANK × CR × (0.35 + 0.65 × hp / 100)
   ```
   - `POWER_PER_RANK = 18` (B). Konstanta 78 dihapus.
   - Lantai HP turun dari 55% ke 35%, jadi luka benar-benar menurunkan performa.
2. **Hapus Underdog Grit** (`combat.ts:354–360`).
3. **Reversal** (`combat.ts:1302`): peluangnya dikali `clamp(1 − gap / 2, 0, 1)`, dengan gap = CR(pemenang) − CR(yang kalah). Reversal "insting" hanya terjadi di antara petarung yang hampir setara.
4. **Cap damage** 40 per exchange (B). S-class tetap tidak bisa one-shot.
5. **Suku taktis tetap dipakai.** Di skala 18/rank, nilai flat-nya sekarang setara 0.4–1.2 rank. Inilah *Tactical Advantage*:

| Kondisi | Suku sekarang | Setara |
|---|---|---|
| Ambush | +10 / +5 → **+18 / +9** | ±1 rank di ronde 1 |
| Prep / trap (`nextBattleBonus`) | apa adanya | 0.3–1 rank |
| Weakness exploited (Intelligence) | 8 + intel × 0.1 | ±0.6–1 rank |
| Elemental counter | ×1.18 / ×0.85 | — |
| Teamwork (partner) | −5 … +7 | ±0.4 rank |
| Fortification / high ground | fort × 0.22, +6 | 0.3–1 rank |
| Chakra exhaustion | −8 / −22 | 0.4–1.2 rank |
| Luka | lantai HP 35% | sampai −65% |

6. `resolveNpcSkirmish` dan `ai.ts` otomatis ikut lebih curam karena sudah memakai `unitBasePower`.

---

## Fase 4 — Database Jutsu Individual (P0)

**File:** rewrite `src/data/jutsu.ts`

```ts
type JutsuRank = 'D' | 'C' | 'B' | 'A' | 'S';

interface JutsuDefinition {
  id: string;
  name: string;
  category: 'ninjutsu' | 'taijutsu' | 'kenjutsu' | 'genjutsu' | 'fuinjutsu' | 'medical' | 'summoning';
  style: 'taijutsu' | 'kenjutsu' | 'ninjutsu' | 'genjutsu' | 'support'; // stat kontes (computeStanceMultiplier)
  role: 'damage' | 'multi_hit' | 'pierce' | 'control' | 'defense' | 'heal' | 'evasion' | 'summon' | 'clash';
  element?: ChakraElement;
  rank: JutsuRank;
  chakraCost: number;
  requires: { disciplineId?: string; level?: 1 | 2 | 3 | 4; bloodlineId?: string }; // kosong = jutsu akademi
  seals: string[];
  description: string;
  effect: {
    power?: number;
    dodgeMult?: number;
    pierceWall?: boolean;
    debuffRounds?: number;
    wardRounds?: number;
    heal?: number;
    cloneEvade?: boolean;
    cpDrain?: number;
    fortShave?: number;
    selfRisk?: number;
  };
}
```

- **Base power per rank** (dipakai bila `effect.power` kosong, posture B): D 0.85 · C 1.0 · B 1.2 · A 1.45 · S 1.75.
- `castTime`, `range`, dan `terrainEffect` sengaja **belum** dimasukkan. Belum ada mekanik yang membacanya sampai Fase 7, jadi untuk sekarang hanya akan menjadi data mati.
- **Rank jutsu ≠ rank shinobi.** Akses ditentukan level discipline, bukan pangkat.

> **Diperluas:** katalog lengkap (±160 teknik), Effect Model v2 (status, mode, counter), dan aturan jutsu klan ada di [`jutsu-clan-catalog.md`](jutsu-clan-catalog.md). Daftar di bawah menjadi bagian dari Gelombang 1.

### Daftar awal (±28 teknik)
Nama dan hand seals memakai data yang sudah ada. Biaya = usulan awal (posture B).

| Grup | Jutsu | Rank | CP | Peran |
|---|---|---|---|---|
| Akademi | Basic Strike | D | 0 | damage |
| | Bunshin no Jutsu | D | 5 | evasion lemah |
| | Kawarimi | D | 4 | evasion |
| Fire | Gōkakyū no Jutsu | C | 12 | damage terkonsentrasi |
| | Hōsenka no Jutsu | C | 10 | multi-hit (dodge ×0.4) |
| | Ryūka no Jutsu | B | 16 | pierce |
| | Gōka Mekkyaku | S | 40 | clash, area |
| Wind | Daitoppa | C | 10 | damage + debuff 1 |
| | Kaze no Yaiba | B | 16 | pierce |
| | Rasenshuriken | S | 45 | clash, self-risk |
| Lightning | Jibashi | C | 10 | control |
| | **Chidori** | A | 25 | pierce, power 1.5, self-risk tanpa persepsi |
| | Raikiri | S | 38 | clash |
| Earth | Doryūheki | C | 14 | defense (ward 2 ronde) |
| | Doryūdan | B | 16 | damage |
| | Yomi Numa | B | 18 | control (2 ronde) |
| Water | Suijinheki | C | 12 | defense |
| | Suiryūdan no Jutsu | B | 16 | damage |
| | Daibakufu no Jutsu | S | 40 | clash |
| Strong Fist | Konoha Senpū | D | 0 | damage |
| | Omote Renge | B | 8 | damage, self-risk HP |
| Gentle Fist | Hakke Kūshō | C | 8 | chakra drain |
| | Hakke Rokujūyon Shō | B | 16 | drain besar + debuff |
| Kenjutsu | Iai Slash | D | 4 | pierce, fort-shave |
| | Mikazuki no Mai | A | 24 | pierce |
| Genjutsu | Magen: Narakumi | C | 6 | debuff 2 |
| | Magen: Kasegui | B | 14 | debuff 3 |
| Support | Kage Bunshin (shadow_clone) | C | 16 | evasion + buff |
| | Shōsen (medical) | C | 18 | heal 15 |
| | Fūin Ward (barrier/fuinjutsu) | C | 16 | defense |
| | Kuchiyose (summoning) | B | 24 | summon (efek klan) |

- `getKnownJutsu(state)` mengembalikan jutsu yang requirement-nya terpenuhi. Inilah tahap **Discovery**.
- Hapus `ELEMENTAL_JUTSU`, `KENJUTSU_TIERS`, `TAIJUTSU_LIST`, `GENTLE_FIST_LIST`, `GENJUTSU_LIST`, dan `pickPlayerJutsu`.

---

## Fase 5 — Jutsu Selection UI, Chakra Terpadu, Mastery per Jutsu (P0)

### Mastery
1. **State baru:** `GameState.jutsuMastery: Record<string, number>`, berisi jumlah penggunaan di battle.
   - Default `{}` lewat migrasi baru di `src/sim/kernel/bootstrap.ts`, mengikuti pola `defaultMigrationRegistry.register`.
2. **Tahap (B):**

| Tahap | Penggunaan | Cost × | Power × |
|---|---|---|---|
| Discovery | requirement terpenuhi | — | — |
| Learning | 0–4 | 1.15 | 0.90 |
| Proficient | 5–14 | 1.00 | 1.00 |
| Mastered | 15+ | 0.85 | 1.12 |

3. **Cost efektif:** `round(chakraCost × stageCostMult × (1.1 − 0.04 × CHK rank))`. Chakra control mengurangi biaya.
4. Counter bertambah di `resolveBattleRound` setiap kali jutsu dipakai.

### Menu battle (`buildBattleRoundDecision`, `combat.ts:477`)
1. Satu opsi `jutsu:<id>` untuk setiap jutsu yang dikenal. Opsi disabled bila CP < cost efektif.
2. Jutsu tingkat berikutnya dari discipline yang sudah dimiliki tampil disabled dengan keterangan, misalnya *"Requires Fire Release Lv2"*. Pemain jadi tahu apa yang bisa dilatih.
3. Id lama `taijutsu / kenjutsu / ninjutsu / genjutsu / ultimate` dihapus. `bloodline`, `exploit_weakness`, `resolve_*`, dan `retreat` tetap ada.
4. **Ultimate generik dihapus.** Nama seperti "Overdrive", "Burst", dan "Great Gale Surge" di `getPlayerSignatureUltimate` tidak dipakai lagi. Clash hanya berasal dari:
   - jutsu DB ber-role `clash`,
   - `secretArtName` discipline level 4,
   - bloodline secret release.

   Test `combat.test.ts:66` tetap lolos.

### Hapus Od
1. **Tipe dan logika combat:**
   - Field `od`, `odMax`, `odUsedCount` di `ActiveBattleState`.
   - Tipe `OdActionId`, fungsi `getAvailableOdActions` dan `applyCompanionOdAction`.
   - Parameter `odAction` di `resolveBattleRound` dan di handler `war.ts:2873`.
2. **Sisa di tempat lain:**
   - Default Od di `combat/war-clock.ts:24`.
   - Auto-pick Od di `engine.ts:311–334`.
   - Baris Od di BattleDialog dan CSS `.od-*` di `theme.css:1847–1905`.
3. Save lama boleh menyimpan field sisa. Tidak ada kode yang membacanya lagi.
4. Logika efek klan Kuchiyose dipindah ke jalur support.

### Auto-play
- `engine.autoChoice` menandai `autoEligible` lewat heuristik kecil `pickAutoJutsu(state)`:
  - Heal bila HP < 55 dan punya medical.
  - Defense di ronde 1 dengan peluang 50%.
  - Selain itu, serangan terjangkau dengan expected damage per chakra terbaik.
- Heuristik ini menjadi titik awal AI pemilihan jutsu NPC di Fase 8.

### BattleDialog (`src/ui/components/BattleDialog.tsx`)
1. Tab **Ninjutsu / Taijutsu / Genjutsu / Other**, masing-masing berisi grid kartu jutsu.
2. **Kartu** menampilkan:
   - nama dan pill rank,
   - CP efektif dan tag peran,
   - tahap mastery,
   - odds pill (`estimateBattleActionOdds` sesuai `style` jutsu).
3. **Panel detail** berisi deskripsi, hand seals dengan kanji, dan progres mastery.
4. Tombol angka memilih kartu di tab yang aktif.
5. Power-gap read dari Fase 1 ada di header.

---

## Fase 6 — Efek Individual di Resolver (P1)

**File:** `resolveBattleRound` di `src/sim/combat.ts`

1. **Jutsu yang dipilih menggantikan switch `styleKey`** (`combat.ts:1251–1342`):
   - Multiplier serangan = `stanceMult` (dari `jutsu.style`) × power jutsu × power mastery.
   - Peluang dodge musuh × `effect.dodgeMult`. Hōsenka jadi sulit dihindari.
   - `wallPierced ||= effect.pierceWall`. Chidori dan kenjutsu menembus Guard Wall.
   - Saat kena: terapkan `debuffRounds`, `cpDrain`, dan `fortShave`. Ini menggantikan cabang hard-code gentle fist, kenjutsu, dan genjutsu.
   - `selfRisk`: bila kalah exchange, pemain menerima damage tambahan.
     - Chidori bebas risiko bila Sharingan atau Byakugan aktif, pemain punya discipline sensory, atau musuh sedang ter-debuff. Itulah aturan "butuh persepsi atau setup".
2. **Routing per role:**
   - `heal | defense | evasion | summon` diarahkan ke jalur support (`combat.ts:943`), kini digerakkan data dan dibayar dengan chakra.
   - `clash` diarahkan ke jalur Ultimate/Jutsu Clash, dengan `rankVal` A = 4.5 dan S = 5.2.
3. `BattleRoundSummary.jutsuName/seals` selalu diambil dari definisi jutsu yang dipilih, tidak lagi dari pilihan berbasis indeks ronde.

---

## Kebijakan Angka
Semua angka di dokumen ini **posture B**: nilai awal yang divalidasi oleh target Monte Carlo di bawah. Bila target meleset:

| Gejala | Langkah |
|---|---|
| Gap terlalu landai atau terlalu curam | Geser `POWER_PER_RANK` ±2 |
| Underdog tidak pernah menang | Naikkan suku ambush dan prep |
| Mastery terasa datar | Lebarkan multiplier tahap |
| Genin terlalu sering atau terlalu jarang dikirim | Geser `GENIN_DRAFT_CHANCE` |

---

## Acceptance Tests

### 1. `tests/power-scaling.test.ts` (Monte Carlo seeded)
**Setup:**
- 1.000 battle per matchup.
- Fighter dibangun lewat `initWarState` + `startWarBattle`, lalu rank musuh ditimpa dengan template tier.

**Kebijakan open duel:** pemain selalu memakai serangan terjangkau terbaik, tanpa persiapan.

**Metrik:** exchange-win rate pemain, rata-rata HP hilang, dan death rate.

| Matchup | Target |
|---|---|
| Genin (CR ≈ 2.4) vs S-rogue roster | exchange win ≤ 5%, HP hilang rata-rata ≥ 60 |
| Chunin (≈ 3.2) vs Elite Jonin (≈ 4.5) | ≤ 15% |
| Jonin vs Jonin (±0.2 CR) | 40–60% |
| Elite Jonin vs Kage-class (≈ 5.3) | 10–30% |
| Genin vs S **dengan** ambush + prep + weakness + partner ikatan | ≥ 3× angka open duel |
| Matchup yang sama dengan HP 40 atau CP 0 | win rate turun ≥ 10 poin |

**Asersi tambahan:**
- `initWarState` untuk Genin menghasilkan rank roster yang **sama persis** dengan `ROSTER_MAP`, tanpa scaling.
- CR NPC tier Genin < CR Elite Jonin.
- Dari 1.000 trigger perang non-crisis untuk Genin, 5–15% berakhir di prelude deploy. Untuk crisis war, 100%.

### 2. `tests/jutsu-system.test.ts`
1. Menu hanya berisi id jutsu yang sudah dikenal. Id yang tidak dikenal tidak bisa dieksekusi.
2. Setiap jutsu punya cost ≥ 0, dan semua seals-nya ada di `ZODIAC_SEAL_KANJI`.
3. `jutsuName` dan `seals` di summary sama dengan definisi jutsu yang dipilih.
4. Counter mastery bertambah, dan cost turun setelah 15 penggunaan.
5. Urutan base power per rank: S > A > B > C > D.
6. Hōsenka lebih jarang dihindari daripada Gōkakyū di banyak seed.
7. Chidori menembus `enemyWallRounds`.
8. `activeBattle` tidak lagi punya field `od`.

### 3. Update test lama
Ganti id lama dan Od di:
- `combat.test.ts` (termasuk lantai HP di baris 25)
- `partner.test.ts:166, 263`
- `audit-regression.test.ts:108–118`
- `immersion.test.ts:53, 70`
- `chunin-tension-kenjutsu.test.ts:143–162`
- `war-pacing.test.ts:101`

### 4. Build dan balance
1. Jalankan `npm test` dan `npm run build`.
2. Jalankan `npm run sim:balance` **sebelum dan sesudah**, lalu laporkan death rate perang Genin, Chunin, dan Jonin. Kenaikan death rate Genin dan Chunin memang diharapkan.

### 5. Cek di browser (dev server)
1. Mulai perang. Pastikan tab, cost, mastery, dan power-gap read tampil.
2. Gunakan Chidori. Seals dan narasi harus menyebut Chidori.
3. Sebagai Genin yang terkirim, bertemu S-rogue. Read harus "Overwhelming", dan retreat harus bisa dipakai.
4. Sebagai Genin yang tidak terkirim, prelude home front harus muncul dan perang tercatat sebagai `survived`.

---

## Urutan Pengerjaan

| Urutan | Fase | Prioritas | Gerbang |
|---|---|---|---|
| 1 | Fase 1 — Rank / Threat / Tier | P0 | — |
| 2 | Fase 2 — Hapus scaling | P0 | — |
| 3 | Fase 2b — Genin home front | P0 | test draft hijau |
| 4 | Fase 3 — Formula power | P0 | `power-scaling.test.ts` hijau |
| 5 | Fase 4 — Database jutsu | P0 | — |
| 6 | Fase 5 — Selection UI, Chakra, mastery | P0 | — |
| 7 | Fase 6 — Efek individual | P1 | `jutsu-system.test.ts` hijau |
| 8 | Fase 7 — Counter dan interrupt | P1 | follow-up |
| 9 | Fase 8 — AI NPC memilih jutsu | P1 | follow-up |
| 10 | Fase 9 — Kekkei Genkai dan jutsu klan | P2 | follow-up |

Setiap fase menyentuh `combat.ts` dan `war.ts`, jadi fase-fase ini dikerjakan berurutan, tidak paralel.
