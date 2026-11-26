# NarutoSim — Character Database & Population (satu identitas per orang)

## Context
`src/data/roster.ts` sekarang adalah "daftar musuh". Di sekitarnya sudah tumbuh populasi NPC (`state.worldSim.npcs`, tipe `WorldNpc`, dengan LOD L1/L2 dan populasi abstrak > 20.000), tetapi **satu manusia masih disimpan dalam banyak bentuk**. Eksplorasi menemukan 11 bentuk "orang" di 5 lokasi:

- **Classmate → teammate:** `WorldNpc` + `KizunaMember`, disinkron manual di ±5 tempat (`npc-sim.ts:792-902`, `:917`, `:1023`, `relationships.ts:141`, `imperfect-life.ts:941`).
- **Teammate → partner perang:** `WarPartnerState` (`partner.ts:112`), lalu `PermanentPartnerRecord` (`partner.ts:461`).
- **Teammate → musuh perang:** `WarCompetitor` hasil rakitan tangan.
  - Rogue (`war.ts:247-290`): rank dan jutsu di-hardcode.
  - Rival (`war.ts:304-334`): rival **memakai stat orang asing**.
  - Partner yang membelot (`partner.ts:387-431`).
  - **Kematian rival dan partner yang membelot tidak pernah tercatat balik.**
- **Romance teammate → pasangan:** `FamilyMember` duplikat tanpa tautan (`life.ts:637-658`). Keluarga tidak punya id, dan saudara serta anak tidak pernah mati.
- **Peserta Chunin Exam, lawan Valley of the End:** hanya snapshot nama.
- **Data statis dan dinamis bercampur:** `WarCompetitor` menyimpan motive/ultimate di samping hp/kills; `KizunaMember` menyimpan traits di samping trust/alive.
- Ada 7 pembuat nama terpisah, dan `state.rivalId` dibandingkan dengan id jenis lain (`lod-population.ts:223`) sehingga cek itu tidak pernah cocok.

**Koreksi kecil atas deskripsi awal:** `war.ts` sekarang **tidak** men-scale musuh berdasarkan rank pemain. Komentar di `war.ts:204` menyebut roster muncul "at full unscaled strength". Dengan desain di bawah, kekuatan musuh justru akan mengikuti rank dan usia orang itu sendiri.

**Tujuan:** NarutoSim punya *populasi shinobi*, bukan *roster musuh*. Satu orang memiliki satu `personId` sepanjang hidupnya: teman akademi → rekan → sensei → rival → musuh perang → Kage → meninggal.

**Keputusan pemain:**
- Template ditempatkan **relatif terhadap umur pemain**, bukan memakai kronologi canon.
- Database tetap berupa **file `.ts`, dipisah per desa**.

## Tiga lapisan

| Lapisan | Isi | Tempat | Boleh berubah saat main? |
|---|---|---|---|
| **Character Database** | Template: nama, julukan, desa, klan, sex, elemen, arketipe, tactic, traits, peak ranks, skills, ultimate, lore, dialog, `ageOffset`, `rankArc` | `src/data/characters/*.ts` | Tidak (readonly) |
| **Population** | Membuat orang dari template (canon/OC) atau dari profil arketipe (generik); memberi `personId` | `src/sim/people.ts` (baru) + `npc-sim.ts` / `world-sim.ts` yang sudah ada | — |
| **Person state** | `WorldNpc`: usia, rank, status, alive, powerScore, hubungan, memori, goal, cognition + `templateId` | `state.worldSim.npcs` (sudah ada) | Ya |

**Peran = view yang merujuk `personId`**, bukan salinan orang. Squad, partner, keluarga, peserta ujian, lawan duel, dan musuh perang hanya menyimpan data milik peran itu sendiri: trust, tahap hubungan, hp di battle, intel perang. Identitas (nama, usia, alive, rank) selalu dibaca dari person.

## F1 — Character Database (data saja)
- Pecah `src/data/roster.ts` menjadi `src/data/characters/index.ts` (tipe, registry `CHARACTERS`, `CHARACTER_MAP`) + `konoha.ts`, `kiri.ts`, `kumo.ts`, … (satu file per desa, `satisfies readonly CharacterTemplate[]`).
- `CharacterTemplate` = `RosterShinobiDef` yang sudah ada (`roster.ts:13`) dengan beberapa perubahan:
  - `ranks` diganti nama menjadi **`peakRanks`**: potensi di puncak, bukan kondisi saat ini.
  - Field baru `sex`, `clanId?`, `canon: boolean`.
  - **`ageOffset: [min, max]`**: selisih umur terhadap pemain (contoh: sebaya `[-1, 2]`, angkatan sensei `[12, 20]`, tetua `[30, 45]`).
  - **`rankArc`**: usia naik ke genin / chunin / jonin, plus `peakRank`. `officialRank` lama menjadi `peakRank`.
- **Id `ros_*` dipertahankan**, sehingga Codex dan `meta.codexRoster` tidak perlu migrasi.
- **Profil arketipe** untuk orang generik (`characters/archetypes.ts`): peak ranks dari `ARCHETYPE_AVG` (`roster.ts:59`) + skill dan ultimate generik. Ini menggantikan stat yang di-hardcode di rogue `war.ts:247-290`. Sensei dan teammate memakai `SENSEI_ARCHETYPES` / `TEAMMATE_ARCHETYPES` yang sudah ada.
- Semua konsumen `ROSTER` / `ROSTER_MAP` diperbarui: `war.ts`, `partner.ts`, `combat.ts` (dialog), `meta.ts`, `ai.ts`, `CodexPanel.tsx`, `LobbyScreen.tsx`, `WarScreen.tsx`, `BattleDialog.tsx`, dan test. Tanpa alias lama.

## F2 — Person API & populasi malas (lazy)
Satu file baru `src/sim/people.ts`. Semua akses ke orang lewat sini:
- `getPerson(state, id)`, `templateOf(person)`, `personName(state, id)` (`'player'` ditangani).
- **`materializeTemplate(state, templateId)`**: mengubah template menjadi `WorldNpc` saat pertama kali dibutuhkan (dipilih jadi teammate, sensei, partner, musuh, peserta ujian).
  - **Deterministik:** offset umur, tanggal lahir, dan nasib awal (rank menurut `rankArc`; meninggal sebelum ditemui atau tidak) dihitung dengan `hashRand(seed, templateId)` (`rng.ts:72`), **bukan** stream RNG utama. Dengan begitu outcome seed lain tidak bergeser, dan hasil materialize selalu sama kapan pun dipanggil.
  - Sebelum di-materialize, template berstatus "abstrak": tidak tersimpan di save, sama seperti populasi abstrak di `lod-population.ts`. Ukuran save tetap kecil, dan test `ws.npcs.length < 80` tetap relevan.
- `WorldNpcIdentity.linkedRosterId` (`types.ts:925`, dideklarasi tapi tak pernah diisi) diganti menjadi **`templateId`**: id template untuk orang canon/OC, atau id profil arketipe untuk orang generik.
- **`killPerson(state, id, age, cause)`**: satu-satunya jalur kematian. Ia mengisi alive/deathAge/deathCause, world history, dan memori orang terdekat, lalu menggantikan semua mirror sinkron.
- **`combatProfile(state, personId)`** menghasilkan ranks, skills, dan ultimate:
  - ranks = `peakRanks` × faktor rank (genin 0.70 / chunin 0.85 / jonin–peak 1.0) × faktor usia (−1% per tahun di atas 50).
  - **Posture B, metrik:** test `power-scaling` tetap hijau untuk orang yang berada di peak rank, dan `sim:balance` menunjukkan tingkat bertahan hidup pemain di perang dalam ±5 pp dari sebelum perubahan. Kalau musuh terlalu lemah → faktor chunin 0.85 → 0.90.
- **Satu pembuat nama**: `generateUniqueNpcName` (`npc-sim.ts:232`) menggantikan 6 picker lain (`team.ts:9`, `life.ts:359` dan inline, `academy.ts:41`, `partner.ts:224`, `war.ts:349`, `npc/cognition.ts:638`).
- Culling NPC (`npc-sim.ts:1518`) **tidak boleh** menghapus orang yang masih dirujuk sebuah peran.

## F3 — Perang memakai orang
- **`competitorFromPerson(state, personId)`** menggantikan `createCompetitorFromRoster` (`war.ts:161`) dan 4 perakit lain: rogue `war.ts:247`, rival `war.ts:304`, rekan desa `war.ts:336`, pembelot `partner.ts:387`.
  - `WarCompetitor` mendapat `personId`.
  - Lore, skill, ultimate, dan dialog **tidak disalin**; semuanya dibaca lewat `templateOf`.
  - Yang tersimpan hanya data lokal perang: hp, cp, fort, intel, kills, goals, allyId, persona.
- **Pemilihan musuh:** orang hidup, usia ≥ 16, chunin ke atas, dari desa lain, satu per arketipe. Template di-materialize bila perlu.
  - Rival dan rogue ex-teammate menjadi **dirinya sendiri** dengan stat dari profilnya, bukan stat orang asing.
  - Fated Thread menjadi `fatedTemplateId`.
- **`applyWarResultsToPeople(state, war)`**: satu fungsi di akhir perang untuk kematian (`killPerson`) dan kills. Ini menggantikan `syncFallenFromWar` (`war.ts:111-124`), dan **`fallenRosterIds` dihapus** (diturunkan dari orang yang mati dan punya `templateId`). Codex di `meta.ts:56-78` membaca dari situ.

## F4 — Peran lain merujuk `personId`
- **Squad** (`team.ts:148-253`): `KizunaMember` → `{ personId, role, trust, fit, relTrack, relStage, relPoints, fragments, promiseMade }`.
  - Field identitas yang duplikat dibuang: name, age, rank, specialStatus, alive, powerScore, sex.
  - `syncTeamMembersToWorldNpcs` dan mirror-mirror lainnya dihapus.
- **Partner:** `WarPartnerState` → `personId` + hp/trust perang. `state.permanentPartner` → `{ personId, trust, rel* }`. Bentuk role bond-nya sama dengan squad, jadi dipakai ulang.
- **Keluarga** (`life.ts:410-437, 637-671`): tiap anggota menjadi person; `state.family: { personId, relation }[]`.
  - Pasangan dari romance = **orang yang sama**.
  - Saudara dan anak ikut menua dan bisa meninggal lewat tick NPC biasa.
- **Chunin Exam** (`ranks.ts:482-578`) dan **Valley of the End** (`crises.ts:423-453`): `personId` menggantikan snapshot nama.
- **Fakta naratif** (`WarFact`) menyimpan `personId`; nama di-resolve saat dibaca.
- **Bug `rivalId`** (`lod-population.ts:223`) hilang dengan sendirinya karena sekarang semuanya `personId`.

## Save & migrasi
- Tambah `saveVersion: 2` di GameState dan satu langkah di `MigrationRegistry` (`kernel/migrations.ts`, `kernel/bootstrap.ts`).
- **ASSUMPTION:** save *hidup yang sedang berjalan* dari versi lama tidak dimigrasi. Saat dibuka muncul pesan "Versi baru: mulai hidup baru". **History (40 hidup terakhir) dan meta/Codex tetap aman**, karena id `ros_*` tidak berubah.
  - IMPACT: pemain kehilangan satu hidup yang sedang berjalan.
  - IF WRONG (kamu ingin save lama tetap jalan): perlu migrasi penuh yang memetakan KizunaMember/Family/partner ke person. Polanya sudah ada di backfill `world-sim.ts:123-150`, tapi kerjanya jauh lebih besar.
  - VALIDATE: buka save v1 setelah update → pesan muncul, lobby, history, dan Codex utuh.

## Urutan & cara kerja
0. Simpan rencana ini sebagai `docs/people-architecture.md`.
1. **F1** → `npm test` hijau (data dan konsumen saja, perilaku sama).
2. **F2** → test baru untuk materialize dan killPerson.
3. **F3** → test war dan power-scaling hijau, lalu ukur `sim:balance`.
4. **F4** → bagian terbesar; test shape squad (`ranks-and-team`, `immersion`, `deep-immersion`) diperbarui ke `personId`.

Setiap fase bisa di-commit sendiri.

## Verifikasi
- `npm test`, `npm run build`, `npm run sim:stress` (2.000 hidup). Di sim-stress ditambah **cek tidak ada `personId` yang menggantung**: setiap rujukan peran harus menemukan orangnya.
- Test baru `tests/people.test.ts`:
  - Template tidak memiliki key dinamis (hp, cp, alive, trust, age).
  - `materializeTemplate` dua kali pada seed yang sama menghasilkan identitas identik, dan tidak menggeser stream RNG utama.
  - Teammate membelot → muncul di perang dengan `personId` yang sama → mati → squad view, populasi, dan Codex sama-sama menunjukkan mati.
  - `personId` pasangan === `personId` teammate romance.
  - Saudara bisa meninggal.
- `npm run sim:balance` sebelum dan sesudah F3 (target ±5 pp). Catat jumlah sampel dan tanggal.
- Manual (`npm run dev`): satu hidup sampai perang. Teman sekelas yang sama muncul sebagai teammate, lalu sebagai partner atau musuh dengan nama, usia, dan rank yang konsisten. Bingo Book lama tetap terisi.

## Dilewati (tambah nanti)
- Menambah karakter canon/OC baru: setelah fondasi ini selesai, cukup menambah entri di `src/data/characters/{desa}.ts`.
- Simulasi penuh untuk setiap orang (belajar jutsu, misi individual). Tick NPC + LOD yang ada sudah cukup; template abstrak tidak disimulasikan sampai di-materialize.
- Migrasi save hidup yang sedang berjalan (lihat ASSUMPTION).
