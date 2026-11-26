# NarutoSim — Audit Lore & Logika (checklist kerja)

Centang `- [x]` setiap kali satu item selesai. Kerjakan berurutan per tier. Mulai **setelah editan di working tree di-commit**, karena banyak file yang disentuh sama.

**Keputusan yang sudah diambil:**
- Perang → **perang front penuh** (divisi desa vs aliansi, kontrol front, gencatan senjata).
- Land of Iron / Land of Waves / Uzushio → **sesuai canon**.
- Kalender → **tahun era**; perang besar dinomori mulai #4, perang kecil berulang disebut **Border War**.
- Karakter **sepenuhnya prosedural**; tidak ada karakter canon bernama.

**Akar masalah:**
1. Struktur perang warisan Grail War (individu saling bunuh).
2. Status pemain tidak dicek (Kage, missing-nin, sipil, pensiunan tetap menerima event shinobi aktif).
3. Teks khas Konoha dipakai untuk semua desa.

Nomor baris berasal dari working tree tanggal 2026-11-26. Kalau sudah bergeser, cari nama fungsinya.

---

## Persiapan
- [x] Working tree sudah di-commit (tidak ada editan lain yang berjalan)
- [x] Baseline `npm test` hijau, catat jumlah test (2026-11-26: 24 files, 116 tests passed)
- [x] Baseline `npm run sim:balance`: catat tingkat kematian pemain per perang, durasi perang, dan tingkat lulus Chunin NPC (2026-11-26, 500 perang/tier: Genin death 60.6% / avg 9.9d, Chunin death 47.0% / avg 11.0d, Jonin death 10.2% / avg 13.2d; NPC Chunin pass 49.7% dari 2.000 hidup / 117.382 percobaan). Dipakai untuk Tier F.

---

## Tier A — Bug (kecil, kerjakan dulu; satu commit + satu test kecil per item)

- [x] **A1 — Anak shinobi tidak pernah masuk akademi**
  - Masalah: saudara dan anak pemain dibuat sebagai `rank: 'civilian'` dengan occupation shinobi. Tick NPC hanya memindahkan `academy → genin`, jadi tidak pernah ada yang menjadi Genin.
  - Lokasi: `src/sim/life.ts:609`, `src/sim/life.ts:757`, `src/sim/npc-sim.ts:1002`
  - Perbaikan: di tick NPC, combatant yang `civilian` dan berusia 6 → `academy`.
- [x] **A2 — Kursi Kage**
  - Masalah:
    - Aklamasi crisis tidak memanggil `kage_ascend`, sehingga ada dua Kage, tanpa cek usia dan tanpa cek `flags.declined_kage`.
    - `killPerson` tidak mengosongkan `kageNpcId`, jadi desa dipimpin Kage yang sudah mati.
    - Kage pemain yang desersi tidak pernah diganti.
  - Lokasi: `src/sim/war.ts:1902-1911`, `src/sim/people.ts:136-197`, `src/sim/world-sim.ts:267-282`, `src/sim/village/institutions.ts:177`
  - Perbaikan: satu helper `vacateSeats(state, personId)` (Kage + kepala klan) dipanggil di `killPerson` dan di jalur defect. Aklamasi lewat `applyPlayerActionToWorldSim({type:'kage_ascend'})` + cek usia + cek declined.
- [x] **A3 — Chunin Exam**
  - Masalah:
    - Gagal tahap 3 tidak memanggil `finalizeChuninTournament`, sehingga hasil NPC hilang.
    - Teammate mendapat dua roll promosi dan bisa lolos walau sudah tersingkir.
    - Lawan final selalu rival walau rival sudah tersingkir.
  - Lokasi: `src/sim/life.ts:~2119-2135`, `src/sim/ranks.ts:711-724` vs `:786-799`, `src/sim/ranks.ts:384-398`
  - Perbaikan: panggil `finalizeChuninTournament(state, false, rng)`; hapus `evaluateTeammatesChuninPass` (tim gugur bersama di tahap 1–2); rival hanya jadi lawan bila status turnamennya `finalist`.
- [x] **A4 — Squadmate yang sudah tewas muncul di Valley of the End**
  - Masalah: `canTriggerConvictionRoute` dicek sebelum `applyWarResultsToPeople` mencatat korban.
  - Lokasi: `src/sim/war.ts:1860` vs `:1873`
  - Perbaikan: jalankan `applyWarResultsToPeople` sebelum cek conviction, atau kecualikan competitor `!alive`.
- [x] **A5 — Tension Perjanjian Damai ditimpa**
  - Masalah: `wish_peace` mengeset tension 8, lalu `concludeWar` menimpanya dengan `rng.int(10, 24)`.
  - Lokasi: `src/sim/war.ts:2762`, `src/sim/war.ts:1934`
  - Perbaikan: cek urutan pemanggilan dulu, lalu set tension setelah `concludeWar` (atau jangan reset bila ada accord).
- [x] **A6 — Bounty balas dendam jatuh ke sekutu**
  - Lokasi: `src/sim/war.ts:2798`
  - Perbaikan: target hanya pembunuh sekutu yang masih hidup atau penyintas yang hostile.
- [x] **A7 — Defeksi squadmate melewati logika defeksi**
  - Masalah: tanpa hunter-nin, history, dan kekosongan kursi.
  - Lokasi: `src/sim/team.ts:545`
  - Perbaikan: panggil `triggerNpcDefection`.
- [x] **A8 — Logika keluarga**
  - Masalah:
    - Orang tua pemain tidak saling menikah, dan masing-masing bisa menikah dengan NPC lain.
    - Pernikahan NPC tanpa cek sex dan keluarga.
    - Saudara bisa menjadi teman sekelas → teammate → pasangan.
  - Lokasi: `src/sim/life.ts:559-597`, `src/sim/npc-sim.ts:1110-1119`, `src/sim/academy.ts:79-95`
  - Perbaikan: hubungkan orang tua sebagai pasangan; filter sex + keluarga di pernikahan NPC; keluarkan person id `state.family` dari pool kelas.
- [x] **A9 — Teks tidak cocok dengan kode**
  - [x] Kehamilan mengabaikan sex pemain (`src/data/events-life.ts:373`)
  - [x] Label misi A/S berbunyi "3-Stage" padahal semua misi 2 tahap; label "+32 Ryo" padahal maksimal 30 (`src/sim/life.ts:1063,1072`)
  - [x] Deskripsi summon vs kode: siput +12 (kode 16), anjing +18 (kode 20), kera 1 ronde (kode 2) (`src/data/summons.ts:42,52,72` vs `src/sim/combat.ts:1159-1176`)
  - [x] Sublabel crossroads: cipher +10 (kode 12), cache −10 (kode 10–16) (`src/data/events-war.ts:68,130` vs `war.ts:2254,2258`)
  - [x] Berita timeline "Border Skirmish" selalu memakai jonin pertama, yaitu Hokage (`src/sim/timeline.ts:256`); pilih jonin acak dari desa itu

---

## Tier B — Gerbang status (satu helper, banyak filter)

- [x] **B0 — Helper `canReceive(state, tags)`** dengan tag `active_shinobi`, `not_kage`, `not_missing_nin`, `not_civilian`, `not_retired`, `sensei_alive`, dipasang di definisi event dan aksi
- [x] **B1 — Kage**
  - [x] Tanpa papan misi D-rank (`src/sim/life.ts:1032-1044`)
  - [x] Tanpa `le_kage_ambition` (`src/data/events-life.ts:476`, filter di `life.ts:1120-1134`)
  - [x] Tanpa perintah shadow org, "lapor ke Hokage", cek overreach, atau coup terhadap diri sendiri (`src/sim/politics.ts:209,273,304,357-388,668`)
  - [x] Tanpa draft solo dan opsi desersi; diganti event "komando HQ" (`src/sim/world.ts:315-357`)
  - [x] Kage yang pensiun benar-benar meninggalkan kursi; event retirement tidak berbunyi "kantor Kage memintamu…" (`src/data/events-epilogue.ts:46`)
- [x] **B2 — Missing-nin**
  - [x] Tanpa draft desa dan tanpa promosi lapangan (`src/sim/world.ts:318`, `src/sim/life.ts:1349`, `src/sim/war.ts:1894`, memori `war.ts:1949`)
  - [x] Tanpa event Ichiraku/Monumen di desa (`src/data/events-life.ts:561-604`)
  - [x] Tanpa adegan retirement desa (`src/sim/epilogue.ts:20-25`, `life.ts:1224`)
  - [x] Tanpa event "cegat pembelot di gerbang / panggil ANBU" (`src/sim/world-sim.ts:303-309`)
- [x] **B3 — Sipil / dropout akademi**
  - [x] Tanpa kemajuan disiplin dan Secret Art (`src/sim/powers.ts:500`, latihan `life.ts:807`)
  - [x] Tanpa ujian hiden klan (`src/sim/clan-heritage.ts:101`)
  - [x] Tanpa event bloodline/Mangekyō (`src/sim/life.ts:1389`)
  - [x] Tanpa event khusus shinobi: `le_ghost_outpost`, `le_marriage` ("Beyond the Barracks"), `le_first_love` ("shared patrols"), `le_ichiraku_debt` ("ration bar from your vest") (`src/data/events-life-extra.ts:557` dkk.)
  - [x] Prompt refleksi usia 15/50 tidak berbunyi "shinobi macam apa…" (`src/data/events-life.ts:1173-1174`)
  - [x] Sebab kematian sipil tidak berbunyi "drills" (`src/sim/life.ts:356`)
  - [x] Log "Entered the Shinobi Academy" tidak muncul di Iron/Waves (`src/sim/life.ts:1280`)
- [x] **B4 — Usia dan pensiun**: tidak di-draft bila flag `medical_retirement` aktif atau usia > 55 (`src/sim/life.ts:1349`, `src/sim/world.ts:200-205`); usia musuh dibatasi (`war.ts:237,303`)
- [x] **B5 — Event tim** butuh sensei/teammate yang masih hidup (`src/sim/life.ts:1007-1008`, contoh `src/data/events-team.ts:283`)
- [x] **B6 — Flavor line** difilter usia dan status (`src/sim/life.ts:976-985`; contoh `events-life.ts:1150`, `events-life-extra.ts:1046`)
- [x] **B7 — Perang tidak dijeda** karena pemain masih di akademi; siswa akademi hanya tidak di-draft (`src/sim/world.ts:204`)
- [x] **B8 — Jadwal NPC**: jonin lanjut usia tidak berpatroli di perbatasan; NPC rank academy tidak mendapat goal "Pass the Chunin Exams" (`src/sim/npc-sim.ts:259-277,356-362`)

---

## Tier C — Bloodline, klan, jutsu, ekonomi

### Bloodline & klan
- [x] **C1** — Sharingan bangkit hanya dengan trauma (orang tua mati atau `traumaCatalyst` ≥ 50) (`src/sim/powers.ts:357-361`)
- [x] **C2** — Eternal Mangekyō hanya untuk Uchiha non-transplant (`src/sim/powers.ts:425-438`)
- [x] **C3** — Hyuga di luar main house → `branch_house` + Caged Bird (`src/sim/clan-heritage.ts:22,40`)
- [x] **C4** — Custom builder: origin sipil/yatim tidak bisa mengambil klan + kekkei genkai + hiden (`src/sim/custom.ts:26-65`)
- [x] **C5** — Chinoike dipindah dari Kumo menjadi klan buangan dekat Konoha, dan marganya dihapus dari pool Kumo (`src/data/clans.ts:788-797`, `src/data/villages.ts:155`)
- [x] **C6** — "Sabaku" bukan klan (itu julukan); Sand Armor / Desert Coffin bukan bloodline (`src/data/clans.ts:396-421`)
- [x] **C7** — Pasangan berklan mewariskan klan ke anak (`src/sim/life.ts:722-756`)
- [x] **C8** — Disiplin awal mengikuti klan, bukan origin (`src/sim/powers.ts:206`); Ice/Lava/Magnet Release konsisten dengan elemen (`src/sim/life.ts:413`); hapus `bloodlineMult` yang tidak dipakai (`powers.ts:139`)
- [x] **C9** — Heir "Firstborn" tidak punya kakak; saudara yang dibuat untuk heir selalu lebih muda (`src/sim/life.ts:599-605`)

### Nama (proyek prosedural)
- [x] **C10** — Hapus marga klan dari pool marga umum desa: Nara, Akimichi, Yamanaka, Inuzuka, Aburame, Sarutobi, Yuki, Kaguya, Hozuki, Hoshigaki, Terumi, Yotsuki, Kamizuru, Uzumaki (`src/data/villages.ts:71,127,155,183,351,379`)
- [x] **C11** — Hapus nama depan canon yang bisa berpasangan dengan marga canon: Kushina/Mito/Ashina, Mei, Haku, Kagura, Suigetsu, Suzumebachi, Temari/Kankuro/Rasa/Karura, Yahiko/Nagato/Konan (`src/data/villages.ts:99-101,127-129,183-185,212-213,351-353`)
- [x] **C12** — Nama depan yang dipakai sebagai marga diganti: Darui, Toroi, Gari, Roshi, Tazuna, Nami, Minato; "Kusa" sebagai nama depan (`src/data/villages.ts:155,183,296,379`, `src/data/clans.ts:1130`)
- [x] **C13** — Marga cadangan "Shinobi" untuk nama satu kata diganti (`src/sim/life.ts:749`)

### Kuchiyose
- [x] **C14** — Kuchiyose butuh `summonContract` (`src/data/jutsu-core.ts:1652`, `src/sim/combat.ts:1189-1201`, Kongo Nyoi `src/data/jutsu-clans.ts:424-436`)
- [x] **C15** — Summon tingkat bos butuh Jonin+ (`src/data/summons.ts:84`)
- [x] **C16** — Klan summon ditawarkan per desa; anjing ninja tidak lagi "Konoha Kennels" untuk semua desa (`src/data/summons.ts:48`, `src/sim/life.ts:1408-1418`)
- [x] **C17** — Individu bernama canon (Gamabunta, Manda, Katsuyu, Enma, Pakkun) diganti nama prosedural/generik (`src/data/summons.ts:20-70`)

### Jutsu
- [x] **C18** — Rasengan/Chidori butuh guru atau flag event, bukan otomatis di level disiplin 3 (`src/data/jutsu.ts:401-405`, `src/data/jutsu-core.ts:487`)
- [x] **C19** — Rasenshuriken butuh Rasengan dan tanpa segel tangan; Raikiri = varian Chidori, bukan jutsu S terpisah (`src/data/jutsu-core.ts:510-511,658-666`)
- [x] **C20** — Sage Mode butuh kontrak katak/ular/siput (`src/sim/powers.ts:582`); Hiraishin butuh penanda yang sudah dipasang (`src/sim/powers.ts:583`, `src/data/jutsu-core.ts:1677`)
- [x] **C21** — Jūken butuh Byakugan (`src/data/jutsu-core.ts:1104,1125`, `src/data/jutsu-forbidden.ts:425`)
- [x] **C22** — Shishi Enjin (barrier 4 orang) dan Hakke no Fūin Shiki (penyegelan Bijuu) bukan serangan solo (`src/data/jutsu-core.ts:1528,1500-1510`)
- [x] **C23** — Tag dua elemen untuk kekkei genkai: Wood = earth+water, Lava = fire+earth, Ice = water+wind, Magnet = wind+earth, Explosion = earth+lightning (`src/data/jutsu-clans.ts:673,1216,855,1122,1540`)
- [x] **C24** — Explosion Release butuh bloodline; C3 bukan teknik klan S-rank (`src/data/jutsu-clans.ts:1540,1559-1566`); Goton Dairendan memakai tag lima elemen (`:448-455`)
- [x] **C25** — Rapikan rank yang menggelembung: Kokuangyō, Daibakufu, Kirigakure no Jutsu (D → C) (`src/data/jutsu-core.ts:1362,959,837`)
- [x] **C26** — Segel Kuchiyose yang di-copy-paste ke Shinju Zanshu, Sando, dan Izanagi diganti (`src/data/jutsu-core.ts:691,816`, `src/data/jutsu-forbidden.ts:148`)
- [x] **C27** — Izanagi benar-benar membutakan satu mata (`src/data/jutsu-forbidden.ts:151,155`)
- [x] **C28** — Pipeline copy jutsu Sharingan dihidupkan atau dihapus (`recordDiscoveredJutsu` tidak pernah dipanggil, `src/sim/powers.ts:275`)

### Ekonomi
- [x] **C29** — Ryo ditampilkan ×1.000 (D-rank ribuan ryo, S-rank ratusan ribu); batas 0–100 tetap berlaku di dalam sim (`src/sim/history/chronicle.ts:60`, UI stat)
- [x] **C30** — Upah misi mengikuti rank, tidak datar per template (`src/sim/missions.ts:86`, `src/data/mission-templates.ts:102-110`); hadiah perang besar tidak lagi 18 (`src/sim/war.ts:1880`)
- [x] **C31** — "Border Summit Escort" butuh Chunin+ (`src/sim/life.ts:1078-1080,2757`)
- [x] **C32** — Ancaman misi B+ dipilih acak dari missing-nin sesuai kekuatan, bukan selalu yang pertama (`src/sim/missions.ts:35-38`)

---

## Tier D — Dunia, desa, kalender

### Desa kecil (sesuai canon)
- [x] **D1 — Land of Iron = jalur samurai**
  - Dojo, rank samurai, tanpa ujian Chunin, Bell Test, atau hitai-ate. Netral dan **tidak pernah jadi musuh perang**; tuan rumah KTT Kage dan gencatan senjata.
  - Lokasi: `src/data/villages.ts:308-316`, `src/sim/npc-sim.ts:641-649,1011,1035`, `src/sim/team.ts:213-215,288-290`, `src/sim/life.ts:272,391`, `src/sim/war.ts:210,231-236`, `src/sim/npc/lod-population.ts:89-100`
- [x] **D2 — Land of Waves = hanya sipil**
  - Tanpa akademi, ninja, atau klan hiden `waves_guild`. Lahir di sana berarti jalur sipil (bisa pindah desa lewat event).
  - Lokasi: `src/data/villages.ts:356-382`, `src/data/clans.ts:1128-1141`, `src/sim/npc/lod-population.ts:89-100`
- [x] **D3 — Uzushio = reruntuhan**
  - Sisa keturunan Uzumaki tersebar, tanpa akademi dan tanpa pemimpin desa. Lahir di sana = keturunan Uzumaki yang dibesarkan di desa lain. Teks krisis "surviving Uzumaki sealing scrolls" jadi konsisten.
  - Lokasi: `src/data/villages.ts:328-336,402`, `src/data/events-world.ts:124`

### Ujian & institusi
- [x] **D4** — Chunin Exam hanya di lima desa besar, dengan set piece per tuan rumah (bukan selalu Ibiki, Forest of Death, Central Tower); hapus kode mati `iron` (`src/sim/ranks.ts:152-298,564,586`)
- [x] **D5** — Syarat usia 13 untuk Chunin Exam dihapus (cukup lama sebagai Genin); wajib tim tiga orang, tanpa "independent Genin" (`src/sim/ranks.ts:128-129,161`)
- [x] **D6** — Gagal kelulusan: teman sekelas yang sudah Genin tidak dimasukkan ke tim barumu (`src/sim/team.ts:270-275`)
- [x] **D7** — Kage awal dipilih berbobot, bukan selalu kepala klan pertama (Uchiha) (`src/sim/npc-sim.ts:468,488`)
- [x] **D8** — Kepala klan minimal usia 25 dan combatant (`src/sim/village/institutions.ts:265-276`)
- [x] **D9** — "Dukung rekan jadi Kage" benar-benar melantik rekan itu (`src/sim/life.ts:1937-1962`)

### Kalender & perang
- [x] **D10** — Tahun era: `birthYear` 1968–2004 → "Tahun N setelah Perang Shinobi Ketiga" di UI, record card, dan log (`src/sim/life.ts:421`, `src/ui/screens/GameScreen.tsx:147`, `src/ui/fx/recordCardCanvas.ts:16`)
- [x] **D11** — Perang besar dinomori mulai #4; perang berulang menjadi "Border War"; cooldown perang besar 12–15 tahun (`src/sim/world.ts:113-115,145,250`, `src/sim/life.ts:505`)
- [x] **D12** — Teks "Second War" / "First War" / "the previous Great Shinobi War" konsisten dengan era (`src/data/events-life.ts:868`, `src/data/events-life-extra.ts:930`, `src/data/events-war-extra.ts:459`)
- [x] **D13** — Geografi: Kannabi Bridge mulai di bawah Kusa; Kumo–Konoha tidak bertetangga ("Frost & Thunder Pass") (`src/sim/world/geopolitics.ts:82-96`)
- [x] **D14** — Gelar korupsi tidak dibentuk dari nama region ("Whirlpool Archipelago Daimyo") (`src/sim/politics.ts:326`)

---

## Tier E — Teks per desa & istilah

- [x] **E1 — Field teks per desa di `src/data/villages.ts`**: `creed` (pengganti "Will of Fire" di teks), `cloakText`, `senseiTestFlavor`, `weatherLine`, `vestText`
  - [x] Jubah "white-and-flame" + "Will of Fire diplomacy" saat pelantikan (`src/sim/life.ts:224,231`)
  - [x] Kutipan Bell Test diparafrase per desa; tes bisa gagal sungguhan (`src/sim/life.ts:1691,1715`, `src/sim/team.ts:387`)
  - [x] "Will of Fire +1" untuk pemain Kiri (`src/data/events-war.ts:171,200`, `src/sim/missions.ts:200`)
  - [x] "Rain taps…" / "Vanished into the Rain" di semua desa (`src/sim/world-sim.ts:332,576`)
  - [x] Rompi hijau dan Bell Test di achievement (`src/data/achievements.ts:48,93`)
- [x] **E2 — Istilah**
  - [x] Memorial Stone hanya untuk yang gugur dalam tugas, bukan wafat karena usia (`src/sim/epilogue.ts:81-85`)
  - [x] "Jonin Promotion Board" → rekomendasi Kage (`src/sim/ranks.ts:821`, `src/sim/life.ts:2411,2422`, `src/data/achievements.ts:56`)
  - [x] Kinjutsu ≠ hiden (`src/data/achievements.ts:190-192`)
  - [x] "Sunday" dihapus (`src/data/events-life-extra.ts:1033`); "owl" → "hawk" (`src/sim/politics.ts:699`); "Gazette/newspaper" → papan pengumuman / burung pesan (`src/sim/timeline.ts:17`)
  - [x] Valley of the End diganti lokasi yang sesuai desa pemain (`src/sim/crises.ts:460-483`)
- [x] **E3 — Rapikan**
  - [x] Kurung ganda pada nama boss "Kurama (Nine-Tails) (Unbound Bijuu)" (`src/sim/crises.ts:51`)
  - [x] Julukan "Sworn Rival of Konoha" untuk rekan setia (`src/sim/war.ts:340`)
  - [x] Crossroads "honor duel" yang tidak memulai duel (`src/data/events-war.ts:353-369`)
  - [x] Sumur beracun juga melukai sekutu (`src/sim/war.ts:2247-2249`)
  - [x] Achievement yang syaratnya tidak cocok: disband "upon Chunin promotion" (`src/data/achievements.ts:99-101`), "during peacetime" (`:182-183`)
  - [x] Pemenang perang tunggal "memaksa lima komandan" menandatangani perjanjian → menjadi rekomendasi kepada Kage (`src/sim/war.ts:1757,1831,2768`)

---

## Tier F — Perang Front (rombak struktur, terakhir)

Menggantikan battle royale. **Yang dipakai ulang:** loop 14 giliran hari/malam, combat engine, persona AI, partner K1, crossroads, Exposure dan intel.

- [x] **F0 — Baseline** `sim:balance` sudah dicatat (lihat Persiapan)
- [x] **F1 — Pihak**
  - Desamu + desa berstatus allied/treaty (`worldSim.diplomacy`, `src/sim/world/geopolitics.ts:21-36`) melawan koalisi desa hostile/at_war.
  - Iron dan desa netral di luar perang.
  - Shinobi satu desa **tidak pernah** saling bertarung (memperbaiki `war.ts:1397-1399,1602-1608`, `ai.ts:156-158`).
- [x] **F2 — Sekutu terpisah**
  - `WarState.allies[]` untuk squad, partner, dan rekan desa: tidak bisa diserang, dikhianati, atau di-cull, tapi bisa gugur di front.
  - Rekan desa dikeluarkan dari `enemies` (`src/sim/war.ts:321-384,455-461,1313-1340,2143-2146`, `src/sim/ai.ts:351-355`).
- [x] **F3 — Front**
  - 3 front dari wilayah perbatasan nyata antara kedua pihak (`geopolitics.ts` territories).
  - Kontrol 0–100 (50 = diperebutkan) dan kekuatan divisi = korps genin/chunin/jonin desa (`src/sim/npc/lod-population.ts`) + skor orang bernama yang ditugaskan.
  - Tiap giliran: kontrol ±(selisih kekuatan × 0.1) + hasil aksi pemain. **Posture B.**
- [x] **F4 — Peran pemain menurut status** (prelude di `src/sim/world.ts:315-357`)

  | Status | Penempatan | Pilihan tiap giliran |
  |---|---|---|
  | Siswa akademi | Tidak di-draft; evakuasi/bantuan di desa | — |
  | Genin | Bersama tim di front belakang (logistik, medis, jaga desa) | aksi pendukung |
  | Chunin | Pemimpin regu di satu front | serbu / tahan / intai / sabotase / medis / kawal |
  | Jonin | Komandan unit; bisa memilih front | aksi Chunin + pindah front + misi khusus |
  | Kage | HQ: membagi divisi ke front, diplomasi, turun ke medan sekali-sekali | alokasi + duel puncak |
  | Missing-nin | Tidak di-draft; opsi tentara bayaran untuk pihak mana pun | kontrak per giliran |

- [x] **F5 — Musuh bernama**
  - Ace dari desa musuh (orang dari populasi atau generator) ditempatkan per front; pertarungan memakai combat engine yang ada.
  - Korban tercatat lewat `killPerson` + hitungan populasi, lalu masuk Memorial Stone.
- [x] **F6 — AI divisi** memilih front berdasarkan kekuatan (`src/sim/ai.ts`)
- [x] **F7 — Akhir perang**
  - Gencatan senjata bila: satu pihak menguasai ≥ 2 front di ≥ 80 selama 3 giliran, **atau** kelelahan perang salah satu pihak ≥ 100 (naik dari korban), **atau** giliran 14 tercapai (pihak dengan kontrol rata-rata lebih tinggi unggul).
  - Iron menjadi tuan rumah perundingan.
  - Hasil:
    - **menang** → syarat perjanjian; Permintaan Pemenang menjadi *rekomendasi kepada Kage*;
    - **seri** → status quo;
    - **kalah** → wilayah hilang, tension naik, reparasi.
  - Pemain mati atau desersi tetap jadi outcome yang sah. Hapus "Final Night culling" (`src/sim/war.ts:1602-1620`) dan menang-karena-semua-mati (`:513-518`).
- [x] **F8 — Perang crisis**
  - Semua desa bersatu menjadi **Allied Shinobi Forces**; front krisis dengan musuh Echo/Sentinel. Musuh desa lain tidak ikut, dan culling tidak membunuh anggota koalisi (`src/sim/world.ts:309`, `src/sim/war.ts:165-183,513-518`, `src/sim/crises.ts:144-155`).
  - Bijuu tidak bisa dihancurkan: hanya disegel ke inang (opsi jinchuriki) atau tersebar dan kembali bertahun-tahun kemudian (`src/sim/crises.ts:279-289`, `src/sim/war.ts:2022-2050`).
  - Infinite Tsukuyomi diturunkan menjadi genjutsu regional (`src/sim/war.ts:2004,2008`).
- [x] **F9 — UI**: `src/ui/screens/WarScreen.tsx` menampilkan peta 3 front + bar kontrol + daftar sekutu
- [x] **F10 — Metrik (Posture B, `sim:balance`)**:
  - durasi rata-rata 9–14 giliran;
  - tingkat kematian pemain ±5 pp dari baseline;
  - gencatan senjata seri di 20–40% perang;
  - di luar rentang → ubah koefisien 0.1 atau ambang 80.

---

## Verifikasi (setiap tier)
- [x] `npm test` hijau (25/25 file, 124/124 test lulus)
- [x] `npm run build` bersih (`tsc --noEmit && vite build` sukses)
- [x] `npm run sim:stress` (2.000 hidup): tanpa NaN, tanpa `personId` menggantung (0 error, 0 NaN, 0 dangling, max save 0.607 MB, avg tick 0.131 ms)
- [x] Test baru `tests/lore-rules.test.ts`:
  - [x] Anak shinobi menjadi Genin di usia 12–13 (A1)
  - [x] Satu desa tidak pernah punya dua Kage setelah 2.000 hidup; kursi kosong selalu terisi (A2)
  - [x] Gagal tahap 3 Chunin memfinalisasi turnamen; teammate yang tersingkir tidak lolos (A3)
  - [x] Squadmate yang mati tidak muncul di Valley of the End (A4)
  - [x] Kage dan missing-nin tidak menerima event bertag terlarang (B)
  - [x] Sharingan tidak bangkit tanpa trauma; Kuchiyose gagal tanpa kontrak (C1, C14)
  - [x] Iron, Waves, dan Uzushio tidak punya rank ninja atau akademi (D1–D3)
  - [x] Tidak ada pertarungan satu desa; Iron tidak pernah menjadi pihak perang (F1)
- [ ] Manual (`npm run dev`):
  - [ ] Satu hidup di Kiri: tidak ada teks Konoha, tahun tampil sebagai era
  - [ ] Satu hidup sebagai Kage: komando HQ, bukan draft solo
  - [ ] Satu perang front: peta 3 front, sekutu di daftar sendiri, gencatan senjata di Iron
