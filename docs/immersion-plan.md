# NarutoSim — Rencana Imersi "Terasa Naruto"

## Context
Game sudah punya mesin yang dalam (life loop tahunan, combat, war 14 hari, crisis, squad, bloodline), tapi rasanya belum "Naruto" karena:
- **Fit**: perang adalah battle-royale 8 rival dengan aliansi ad-hoc — sisa desain Fate/Grail War (`src/sim/combat.ts:466` "replaces Command Seals"). Di Naruto, perang = desa vs desa.
- **Fit**: semua istilah canon diganti (Samsara Eye, Shadow Mastermind, Spiraling Gale Shuriken, "Kage" generik). User memilih **full canon**.
- **Satisfaction**: ronde combat berbunyi "Fire Ninjutsu", tanpa nama jutsu, tanpa segel tangan; 24 baris `clash` + 24 `win` di roster tidak pernah dipakai; BGM hanya satu nada tiap 950ms.
- **Motivation**: tidak ada nindo, rival permanen, atau kilas balik — padahal itu tema inti Naruto (ikatan, tekad, rival). Desa tidak punya efek. Kage hanya lewat menang crisis.
- **Response**: 1 keputusan/tahun; auto-play memilih acak (`src/sim/engine.ts:218-223`), jadi karakter tidak "bertindak sesuai dirinya". Misi = satu cek stat.

Pemain memilih semua 4 pilar. Dikerjakan bertahap; tiap fase bisa di-ship sendiri dan `npm test` harus hijau di akhir fase.

Aturan umum:
- **Pemilihan nama/kosmetik tidak boleh memakan RNG** (pakai indeks deterministik, mis. `battle.rounds.length % n`) agar hasil seeded test tetap sama.
- Roster 24 rival tetap OC (karakter original); yang canon adalah istilah, jutsu, organisasi, Bijuu, gelar. Dialog canon ditulis ulang (parafrase), bukan disalin.
- Semua angka baru = **Posture B (starting value)** dengan metrik di bagian Verifikasi.

---

## Fase 0 — Bug kecil yang ketemu saat eksplorasi
- Cap clue tidak konsisten: whisper cap 3 (`src/sim/life.ts:1763`), effect cap 5 (`life.ts:434`), UI "/5" (`GameScreen.tsx:404`). Samakan ke satu konstanta (5).
- Whisper crisis selalu urutan sama (`src/sim/world.ts:66`) → pilih acak dari yang belum dipakai (RNG world, sudah ada).

## Fase 1 — Canon pass (data/teks saja)
- `src/data/powers.ts`: `secretArtName` → Futon: **Rasenshuriken**, Raiton: **Chidori** (tingkat akhir **Raikiri**), Katon: **Gōka Mekkyaku**, dst.; bloodline "Samsara Eye" → **Rinnegan**; nama lain (Mangekyō, Byakugan) dirapikan.
- `src/data/villages.ts`: tambah field `kageTitle` (Hokage, Kazekage, Mizukage, Raikage, Tsuchikage; desa kecil: "Village Head"/Otokage). Helper `kageTitle(state)` dipakai di semua teks "Kage" (`epilogue.ts:63`, `war.ts:1681`, `events-epilogue.ts:44`, `events-life.ts:217`, `i18n.ts:25`, `achievements.ts:77`).
- Crisis: "Tailed-Beast Calamity" → Bijuu bernama yang di-seed per run (Shukaku…Kurama, 9 entri, `bijuuName` di world state). "Shadow Mastermind" → **Akatsuki** (pemimpin bertopeng tetap OC). File: `src/sim/crises.ts`, `src/data/i18n.ts:45-46`, `src/data/events-team.ts:261-313`, `src/data/achievements.ts`, `src/sim/epilogue.ts:162`.
- Grep sapu bersih frasa pengganti lain ("masked envoy in the rain" → hujan Amegakure/Akatsuki, dll.).

## Fase 2 — Rasa pertarungan
- **Baru `src/data/jutsu.ts`**: tabel per elemen × tier (tier = level discipline elemen 1–4) `{ name, seals: string[] }` + daftar taijutsu (Konoha Senpū, Omote Renge…) + genjutsu. Segel memakai 12 segel shio (Ne, Ushi, Tora, U, Tatsu, Mi, Uma, Hitsuji, Saru, Tori, Inu, I).
- `src/sim/combat.ts:928-936`: `playerActionLabel` → nama jutsu; narasi diawali urutan segel ("Mi → Hitsuji → Saru → Tora — Katon: Gōkakyū no Jutsu!"). Pilihan via indeks ronde, bukan RNG.
- Pakai `lines.clash` roster di ronde pertama, `lines.win` saat musuh menang ronde/duel (saat ini hanya `meet` di `war.ts:1129` dan `fall` di `combat.ts:1174`).
- `src/ui/components/BattleDialog.tsx`: deretan chip segel dengan animasi stagger CSS (tanpa lib) + nama jutsu besar ala title card.
- **Nindo Resolve**: sekali per battle, saat HP pemain pertama kali < 25% dan pemain punya nindo (Fase 3) → pulih 20% HP + log kilas balik. Disambungkan ke jalur Limit Break yang sudah ada, bukan sistem baru.

## Fase 3 — Ikatan & tekad
- **Nindo** (`state.nindo`, `src/sim/types.ts`): dipilih di keputusan kelulusan (`src/sim/life.ts`, langkah graduation). 5 opsi dipetakan ke leaning yang sudah ada: "Tak menarik kata-kata" (will_of_fire), "Melindungi orang berharga" (bonds), "Menjadi Kage" (ambition), "Membalas klan" (vengeance), "Hasil di atas segalanya" (ruthless).
  - Opsi keputusan yang sejalan dengan leaning nindo: +Will kecil; melanggar di keputusan `manual`: −Will + log "kau mengkhianati jalan ninjamu".
  - **Auto-play** (`engine.ts:218-223`) memilih opsi berbobot leaning/nindo, bukan seragam acak.
- **Rival permanen** (`state.rivalId`): satu teman sekelas di akademi (atau anggota squad). Rival naik pangkat bersamamu (pakai aging squad di `src/sim/team.ts`), jadi lawan Arena Chunin Exam (`src/sim/ranks.ts`), muncul di perang (sekutu atau pembelot via jalur `war.ts:337-390`), dan menjadi lawan **Valley of the End** menggantikan "squad member terdekat" bila ada.
- **Kilas balik** (`state.memories: { age, tag, text }[]`): dicatat di momen nyata — Bell Test, kelulusan, nindo, kematian rekan/sensei, duel rival, promosi. Ditampilkan saat Nindo Resolve, Limit Break, Valley of the End, boss crisis; teks lewat `CinematicFxOverlay` (sekarang dipicu pencocokan teks log, `CinematicFxOverlay.tsx:27-73`).
- **Jalur Kage**: untuk nindo "Menjadi Kage" (atau siapa pun memenuhi syarat), event suksesi saat Jonin, usia ≥ 30, Bonds ≥ 60, misi S ≥ 3 (Posture B). Syarat ditampilkan di UI agar jelas tujuannya.

## Fase 4 — Perang antar desa (Great Shinobi War)
- Baca penuh `src/sim/war.ts` sebelum mengubah (2488 baris; `war-loop.test.ts`, `war-pacing.test.ts` menjaga pacing).
- Inisialisasi kompetitor (~`war.ts:272`): rival satu desa dengan pemain mulai **beraliansi** lewat `establishPlayerAlliance` (`war.ts:1170`); rival saling satu desa mulai relasi tinggi dan peluang khianat diturunkan. Pastikan minimal 1–2 rekan desa ada (ambil dari roster ber-`villageId` sama, atau generate dari `surnames` desa).
- Teks framing: "Great Shinobi War #N — {desamu} vs koalisi", aliansi crisis → **Allied Shinobi Forces**.
- Mesin war tidak ditulis ulang; hanya seed relasi + teks.

## Fase 5 — Dunia & presentasi
- **Identitas desa** (`src/data/villages.ts`): field `perk` kecil (Konoha +Bonds, Suna XP puppetry, Kiri event "Bloody Mist graduation", Kumo raiton/taijutsu, Iwa +Health) + filter `villageOnly` di `LifeEventDef` (`events-life.ts:34`) untuk 1–2 event khas per desa besar.
- **Papan misi**: keputusan tahunan memilih rank D–S sesuai pangkat; B+ memicu battle.
  - ASSUMPTION: battle engine bisa jalan di luar `WarState`. IMPACT: menentukan apakah misi bisa jadi pertarungan nyata. IF WRONG: misi B+ jadi rangkaian 2–3 cek stat bernarasi. VALIDATE: cek signature `resolveBattleRound`/BattleDialog terhadap `war` sebelum mulai.
- Perbesar pool: squad events 4 → ~12 (`events-team.ts`), life events 17 → ~30 (Ichiraku, Monumen Hokage, kontrak Kuchiyose dengan hewan bernama, rompi Chunin).
- **Kanji**: glyph elemen (火 風 雷 土 水), pangkat, dan cap hanko saat promosi. Font fallback sistem `"Yu Mincho", "Noto Serif JP", serif` — tanpa download, PWA tetap offline.
- **Audio** (`src/ui/audio/soundEngine.ts`): `SCENE_SCALES` → skala pentatonik Jepang (in/yo); loop memainkan frasa pendek, bukan satu nada; nada "shakuhachi" = sine + vibrato + noise tersaring; taiko di war sudah ada (`playDrum`).

---

## Verifikasi
- Tiap fase: `npm test` hijau; `npm run build` (tsc) bersih.
- Balance (Posture B, ukur sebelum/sesudah): `npm run sim:balance` dan `npm run sim:stress`.
  - Nindo Resolve: win rate pemain vs musuh grade setara naik ≤ 5 pp; jika lebih, turunkan heal 20% → 12%.
  - Jalur Kage: tercapai di 5–15% run auto-play; jika di luar rentang, geser syarat Bonds/misi S.
  - Fase 4: durasi perang & jumlah betrayal tetap dalam batas `war-pacing.test.ts`.
- Test baru kecil (satu file `tests/immersion.test.ts`): nama jutsu tidak mengubah hasil seeded battle; nindo ter-set saat lulus; rival dipakai di Valley of the End; `kageTitle` per desa.
- Manual: `npm run dev` → satu run penuh di browser pane: cek segel & nama jutsu di BattleDialog, kilas balik muncul, gelar Hokage untuk Konoha, perang menampilkan sekutu satu desa, BGM terdengar berupa frasa.

## Dilewati (tambahkan nanti bila perlu)
- Karakter canon (Kakashi dkk.) di roster — tetap OC. Tambahkan bila mau cameo.
- Lokalisasi Bahasa Indonesia — UI tetap Inggris.
- Jinchuriki sebagai jalur pemain (menyegel Bijuu ke diri sendiri di aftermath crisis) — kandidat setelah Fase 3.
