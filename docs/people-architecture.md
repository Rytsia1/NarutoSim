# NarutoSim — Character Generator & Penduduk Dunia (revisi)

## Context
Rencana sebelumnya (`docs/people-architecture.md`) memperlakukan 24 karakter tulisan tangan sebagai *template karakter*. Sebagian sudah terimplementasi di working tree:
- `src/data/characters/` sudah dipisah per desa,
- `src/sim/people.ts` sudah punya `materializeTemplate`, `createGenericPerson`, `combatProfile`, `competitorFromPerson`, `killPerson`, dan `collectReferencedPersonIds`.

Masukan baru meluruskan arahnya:
- **Random selection ≠ random generation.** Roster tidak dihapus, tetapi fungsinya berubah menjadi **building blocks untuk generator**.
- Generator membuat **penduduk dunia**: shinobi *dan* sipil (pedagang, pandai besi, medis, petani, pengrajin, guru, samurai), bukan sekadar musuh.
- **Field saling berkaitan**: klan → kemampuan dan latar, desa → budaya dan elemen, kepribadian → keputusan, usia → rank, gaya bertarung → jutsu.
- **Hasil generate harus persisten.** Kaito tetap Kaito sepanjang simulasi dan tidak di-generate ulang.

**Keputusan pemain:** sepenuhnya prosedural. 24 karakter dilebur menjadi pool. Codex lintas hidup berubah menjadi statistik, dan Bingo Book hanya per hidup. Progres Codex lama hilang (disetujui).

### Kondisi kode sekarang (hasil eksplorasi)
- Ada **3 pembuat orang** dengan aturan berbeda:
  - `createWorldNpc` (`npc-sim.ts:473`): elemen dari klan → desa, spesialisasi dari klan, kepribadian dibias `politicalBias`.
  - `createGenericPerson` (`people.ts:340`): **mengabaikan klan**, motivasi dan nindo selalu sama.
  - `materializeTemplate` (`people.ts:182`).
- Ada **2 generator nama yang identik**: `npc-sim.ts:233` dan `people.ts:293`. Yang ketiga ada di `life.ts:377`.
- NPC **tidak menyimpan stat atau jutsu**, hanya `powerScore` datar per rank. `combatProfile` (`people.ts:539`) memberi stat yang sama persis untuk semua NPC generik dengan arketipe + rank yang sama, sementara ujian Chunin memakai `powerScore`. Dua sistem kekuatan berjalan terpisah.
- **Tidak ada konsep profesi.** Sipil hanya muncul sebagai keluarga. Ada **bug**: semua sipil dewasa otomatis menjadi Genin di tick pertama (`npc-sim.ts:1072`), dan sipil memakai jadwal `border_patrol` (`npc-sim.ts:306`).
- **Batas persistensi** sekitar 68 orang. NPC L2 yang hidup dihapus saat lewat batas (`npc-sim.ts:1389-1425`), padahal mungkin sudah pernah ditemui pemain.
- Building blocks yang sudah ada dan dipakai ulang:
  - Klan `ClanDef`: 30 klan, `signatureDisciplines`, `preferredElement`, `bloodlineId/Chance`, `ethos`, `politicalBias`, `hidenArts`.
  - Desa: name pool, `dominantElement`, `culture`, `institutions`.
  - `JUTSU_DB`: 175 jutsu dengan `requires.disciplineId/element/rank/clanId`.
  - `NINDOS`, `ARCHETYPE_AVG`, `ARCHETYPE_PROFILES`, `SENSEI_ARCHETYPES` / `TEAMMATE_ARCHETYPES`.
  - `buildPersonality`, `pickMotivationFromPersonality`, `pickNindo` (`npc-sim.ts:257/270/291`).
  - `rollBirthBloodline` (`powers.ts:137`); aturan elemen pemain (`life.ts:413`).

## Tiga lapisan (versi akhir)

| Lapisan | Isi | Tempat |
|---|---|---|
| **Character Templates** (building blocks, readonly) | Arketipe, profesi, klan, desa, pool skill/ultimate/dialog/motif/julukan | `src/data/characters/`, `clans.ts`, `villages.ts`, `jutsu*.ts` |
| **Character Instance** (hasil generate, disimpan sekali) | Nama, sex, tanggal lahir, desa, klan, profesi, elemen, bloodline, kepribadian, traits, potensi, bias stat, kelemahan, kit jutsu, latar | field di `WorldNpc`, ditulis **hanya** oleh generator |
| **Simulation State** (berubah tiap tahun) | Usia, rank, status, alive, cedera, jutsu yang dikuasai, hubungan, memori, goal, cognition | field dinamis `WorldNpc` yang sudah ada |

**CharacterRegistry tidak perlu kelas baru.** Registry = `state.worldSim.npcs` + API di `people.ts` (`getPerson`, `killPerson`, `collectReferencedPersonIds`).

---

## G1 — Roster menjadi building blocks (data)
- Isi 24 file per desa di `src/data/characters/` dilebur ke **`pools.ts`**:
  - `SKILL_POOL[archetype][element]` dan `ULTIMATE_POOL[archetype][element]` (diambil dari skill dan ultimate yang ada; isinya memang sudah berwarna arketipe + elemen).
  - `LINE_POOL[archetype][tactic]` untuk meet / clash / win / fall, `MOTIVE_POOL[motivation]`, `ORIGIN_POOL[archetype]`.
  - Teks diberi placeholder `{name}`, `{they}`, `{their}`, `{village}` (contoh asli: "her gloved knuckles", "Kusagakure"), lalu dirender oleh satu helper `renderText(person, text)`.
  - `EPITHET_PARTS`: awalan menurut elemen/desa ("Mist", "Ember") + akhiran menurut arketipe ("Cleaver", "Lance"). Julukan hanya diberikan kepada chunin+ yang punya reputasi.
- **Baru `occupations.ts`:**

| Profesi | Shinobi? | Bobot default | Catatan |
|---|---|---|---|
| shinobi | ya | menurut desa (desa besar tinggi) | jalur rank normal |
| merchant, blacksmith, farmer, artisan | tidak | sisa populasi | `waves_guild` condong ke merchant |
| medic (sipil) | tidak | kecil | dipengaruhi `hospitalBaseline` desa |
| teacher | tidak / mantan | kecil | instruktur akademi |
| samurai | bukan ninja, tapi petarung | hanya Land of Iron | gaya kenjutsu, klan `iron_samurai_house` |

- 24 file karakter per desa dihapus setelah konten berpindah. `ARCHETYPE_PROFILES` (`archetypes.ts`) tetap ada sebagai fallback.
- Pengecekan em-dash di `tests/data-integrity.test.ts` dipindah ke pool.

## G2 — `CharacterGenerator` (satu pipeline, field saling terkait)
File baru `src/sim/character-generator.ts`, fungsi `generateCharacter(state, spec, rng)`. `spec` = `{ villageId, age, occupation?, clanId?, rank?, roleTitle? }`. **Menggantikan ketiga pembuat orang**; `createWorldNpc`, `createGenericPerson`, dan `materializeTemplate` menjadi pembungkus tipis lalu dihapus.

Urutan langkah (tiap langkah membaca hasil langkah sebelumnya):
1. **Profesi**: bobot desa + usia (anak = academy/sipil).
2. **Klan**: `getClansForVillage` (`clans.ts:1161`) dengan peluang klan vs tanpa klan; klan samurai/guild hanya untuk profesi yang cocok.
3. **Nama**: satu `generateUniquePersonName` (gabungan dua salinan; picker di `life.ts:377` juga diarahkan ke sini). Marga dari klan.
4. **Elemen**: aturan pemain `life.ts:413`, yaitu klan 65% → desa 55% → acak. Ini memperbaiki bug teammate Uchiha yang mendapat elemen desa.
5. **Bloodline**: logika `rollBirthBloodline` (`powers.ts:137`) dengan `clan.bloodlineChance`. NPC kini bisa punya bloodline.
6. **Kepribadian**: `buildPersonality` + bias `clan.politicalBias` + bias profesi.
7. **Traits dari kepribadian**: honor / compassion / loyalty / ambition / freedom diambil dari 2 sumbu tertinggi. Dibutuhkan oleh fit partner dan squad (`team.ts`).
8. **Motivasi & nindo**: `pickMotivationFromPersonality`, `pickNindo` (di-export).
9. **Gaya bertarung**: `clan.signatureDisciplines` / spesialisasi profesi → `inferArchetypeFromSpecialty` (`people.ts:108`).
10. **Potensi & bias stat**: `potential` 0.80–1.20, `statBias` ±0.4 per stat (5 stat). Keduanya **Posture B**, metrik di Verifikasi.
11. **Kelemahan**: stat terendah setelah bias, diberi label ("kontrol chakra buruk", "stamina rendah"). Dipakai untuk intel "Exploit Weakness".
12. **Kit jutsu awal**: saring `JUTSU_DB` menurut `requires.disciplineId`, elemen, `rank` ≤ rank orang itu, dan `clanId`; ambil 2–3. Skill dan ultimate diambil dari `SKILL_POOL` / `ULTIMATE_POOL`.
13. **Latar**: `clan.ethos` + `village.culture` + `ORIGIN_POOL` + `MOTIVE_POOL`, dirender dengan placeholder.

Semua hasil disimpan di `WorldNpc` (field instance baru: `occupation`, `traits`, `bloodlineId?`, `potential`, `statBias`, `weakness`, `jutsuIds`, `kit {skills, ultimate}`, `background`, `epithet?`). **Tidak pernah dihitung ulang.**

**`combatProfile`** (`people.ts:539`) membaca instance:
- `ranks = (ARCHETYPE_AVG[arch] + statBias) × potential × faktor rank × faktor usia`.
- **`powerScore` diturunkan dari ranks yang sama** (`avg × 18`, rumus yang sudah dipakai `materializeTemplate`), sehingga ujian Chunin dan perang memakai satu sumber kekuatan.

## G3 — Populasi & persistensi
- **Aturan inti: orang yang sudah pernah "teramati" tidak pernah dihapus.** Teramati berarti:
  - dirujuk oleh peran (`collectReferencedPersonIds`), atau
  - punya hubungan/memori dengan pemain, atau
  - pernah ditemui di perang, ujian, atau misi.
- Orang L2 yang belum pernah teramati boleh di-cull dan dikembalikan ke hitungan abstrak L3 (`lod-population.ts`). Karena belum pernah dilihat pemain, ini tidak menimbulkan inkonsistensi.
- Batas instance dinaikkan dari ~68 ke **120** (Posture B). Metrik: save JSON < 1.5 MB dan tick tahunan < 20 ms di akhir hidup terpanjang `sim:stress`. Melewati itu → turunkan ke 90 atau rapatkan memori.
- **Fix bug sipil:**
  - Hanya `academy` yang lulus ke genin di usia 12 (`npc-sim.ts:1072`); sipil tetap sipil.
  - `computeNpcSchedule` (`npc-sim.ts:306`) mendapat cabang sipil `work_trade` / `home`.
  - Goal sipil memakai domain `family` / `career` yang sudah ada.
- **Seed dunia** (`npc-sim.ts:574-790`), **akademi** (`academy.ts:47/100`), **peserta ujian** (`ranks.ts:548`), **pengisian ulang** (`npc-sim.ts:1365`), **keluarga** (`life.ts:556-734`), **squad** (`team.ts:202/276`), **perang** (`war.ts:251/376`), dan **partner** (`partner.ts:260/438`) semuanya memanggil `generateCharacter`.
- **Musuh perang** dipilih dari populasi (chunin+, usia ≥ 16, desa lain, satu per arketipe). Generator hanya dipanggil bila kurang, dan orang hasilnya otomatis teramati.

## G4 — Progression per orang
- Saat naik rank atau goal `train`: NPC mempelajari 1 jutsu baru dari pool yang memenuhi syarat (sama seperti langkah 12, dengan rank lebih tinggi).
- Pertumbuhan tahunan memakai `potential`: kenaikan `statBias` 0–0.1 per tahun di usia ≤ 34, menurun setelah 62. Ini menggantikan powerScore +1–3 acak; powerScore otomatis mengikuti.
- **Cedera permanen**: kalah duel hunter-nin atau selamat dari perang dengan HP rendah → `potential −0.05`, tercatat di memori.
- Kematian tetap lewat `killPerson`.

## G5 — Codex → statistik, Bingo Book per hidup
- `meta.codexRoster` diganti **`meta.codexStats`**: jumlah dihadapi/dikalahkan per arketipe, klan, desa, dan bloodline. `CodexPanel.tsx` dan `LobbyScreen.tsx` menampilkan statistik ini.
- **Bingo Book per hidup**: daftar orang yang ditemui di hidup ini, dibaca langsung dari populasi (nama, julukan, rank, status hidup/mati).
- Achievement "12 entri codex" (`achievements.ts:294`) diganti menjadi "hadapi 8 arketipe".
- **Fated Thread dihapus**: pin di `LobbyScreen.tsx:48`, `fatedRosterId` / `fatedTemplateId`, dan resolusinya di `war.ts` / `partner.ts`. Dengan karakter prosedural, tidak ada orang yang sama di hidup berikutnya.
- Migrasi meta: `codexRoster` lama dibuang di `sanitizeMetaState`.

## Save
- Naikkan `saveVersion`. Save *hidup yang sedang berjalan* versi lama → pesan "mulai hidup baru". History tetap utuh.

## Urutan kerja
**Mulai setelah editan yang sedang berjalan di working tree di-commit.** Refactor ini menyentuh `war.ts`, `life.ts`, `combat.ts`, `people.ts`, dan `npc-sim.ts`.
0. Ganti isi `docs/people-architecture.md` dengan dokumen ini.
1. **G1** → `npm test` hijau.
2. **G2** → ganti 3 pembuat orang; test lama diperbarui.
3. **G3** → bug sipil + persistensi.
4. **G4** → progression.
5. **G5** → Codex dan Fated Thread.
6. Verifikasi penuh.

## Verifikasi
- `npm test`, `npm run build`, `npm run sim:stress` (2.000 hidup; tanpa NaN, tanpa `personId` menggantung, ukuran save dan waktu tick dicatat).
- Test baru `tests/character-generator.test.ts`:
  - **Koherensi**: anggota klan berelemen `preferredElement` ≥ 60%; anak dengan klan ber-bloodline mendapat bloodline sesuai `bloodlineChance` (±5%, 5.000 sampel); jutsu awal selalu memenuhi `requires`; samurai hanya ada di Land of Iron.
  - **Persistensi**: orang yang ditemui di perang masih ada (nama dan stat sama) 20 tahun kemudian; generator tidak dipanggil ulang untuk id yang sudah ada.
  - **Sipil**: pedagang dewasa tetap pedagang setelah 10 tick.
  - **Variasi**: dua chunin generik dengan arketipe sama memiliki ranks yang berbeda.
- Test yang perlu diubah:
  - `crises-and-meta.test.ts` (Fated `ros_kenji_kirigiri`),
  - `power-scaling.test.ts` (pin `ROSTER_MAP` / `ros_s_kurogumo` → batas distribusi),
  - `war-loop.test.ts` (`fallenRosterIds`),
  - `partner.test.ts`, `data-integrity.test.ts`.
- `npm run sim:balance` sebelum/sesudah (Posture B):
  - Tingkat bertahan hidup pemain di perang dalam ±5 pp. Musuh terlalu kuat → persempit `potential` ke 0.85–1.15.
  - Tingkat lulus Chunin NPC tetap dalam ±5 pp dari sebelumnya.
  - Catat jumlah sampel dan tanggal.
- Manual (`npm run dev`): satu hidup. Cek:
  - Teman sekelas punya profesi orang tua yang masuk akal.
  - Ada pedagang atau pandai besi di desa.
  - Teammate dari klan ber-elemen klan.
  - Musuh perang yang sama muncul lagi dengan nama, julukan, dan jutsu yang konsisten.
  - Bingo Book hidup ini terisi, dan statistik Codex bertambah.

## Dilewati (tambah nanti)
- Ekonomi dan aktivitas detail untuk sipil (dagang, harga): cukup jadwal + goal dulu.
- Template dialog per kepribadian yang lebih kaya; pool per arketipe × tactic dulu.
- Karakter canon: proyek sepenuhnya prosedural.
