# NarutoSim — Rencana Mekanik (selaras GDD Fate)

## Context
Usulan mekanik sebelumnya (segitiga jutsu, Merit, papan misi, pasar, Eight Gates, NG+) dinilai **terlalu ribet** dan dibuang. Arah baru: **ikuti GDD game Fate di `gdd/`**, karena NarutoSim memang port dari desain itu. Tidak ada sistem baru di luar yang ada di GDD.

Perbandingan bab per bab GDD vs kode menunjukkan kerangka luarnya sudah sama: loop tahunan, perang 14 hari, AI NPC, crisis, rute Valley of the End. **Yang hilang adalah intinya: Servant.** Di NarutoSim kamu bertarung sendirian, sedangkan inti GDD adalah partner yang:
1. dipanggil sesuai kepribadianmu (afinitas `exp(fit/8)`, GDD 5.1),
2. punya trust yang berpengaruh di battle (GDD 6.1, 7.1),
3. bisa diikat atau malah membelot lewat Command Seal (GDD 7.5),
4. menjadi pusat finale dan epilog (GDD 10.2, 10.3).

Keputusan pemain:
- **Padanan Servant = Rekan Shinobi + Hewan Kuchiyose.** Perannya dibagi dua:
  - **Rekan Perang** memegang lapisan *ikatan*: trust, fit, tahap hubungan, membelot.
  - **Kuchiyose** memegang lapisan *pemanggilan*: afinitas ("kontrak memilih yang mirip denganmu") dan aksi pendamping di battle.
- **Perang tetap berulang** (tension ≥ 80, cooldown 6 tahun). Jadi Rekan dan Kuchiyose dirancang bisa bertahan lintas perang.

### Yang sudah ada dan dipakai ulang (bukan ditulis ulang)
- **Sistem trust squad** di `src/sim/team.ts` sudah port GDD bab 7:
  - Tier 35/60/80 (`team.ts:69`).
  - Diminishing gain (`team.ts:97`).
  - Fit ×1.2 / ×0.7 (`team.ts:93-101`).
  - Tiga jalur hubungan (`team.ts:120-128`).
  - Trait set sama dengan GDD: honor, compassion, loyalty, ambition, freedom (`roster.ts:81`).
- **Interception** (`combat.ts:1064`), **Limit Break / Resolve** = Command Seal (`combat.ts:466-493`), **Jutsu Clash** = NP clash (`combat.ts:754-826`).
- **Jalur rogue ex-teammate** sebagai musuh (`war.ts:337-390`). Dipakai untuk Rekan yang membelot.
- **`battleChakraPool`** sudah dihitung tapi tak dipakai (`powers.ts:104`). Ini dijadikan pool **Od**.

Angka di bawah diambil dari GDD (dikutip per bab). Angka itu adalah *nilai yang berjalan di game Fate*, belum diukur di NarutoSim. Karena itu masing-masing diberi metrik untuk dicek dengan `npm run sim:balance`.

---

## K1 — Rekan Perang (padanan Servant: lapisan ikatan)

**Tujuan pemain:** tidak berperang sendirian. Rekan bertarung bersamamu, dan seberapa kamu dipercaya menentukan seberapa kuat kalian.

**Cara kerja:**
1. **Siapa yang jadi Rekan** saat perang dimulai (`war.ts:424`):
   1. Rekan perang sebelumnya bila masih hidup dan dulu memilih **tinggal** (lihat K4).
   2. Kalau tidak ada, anggota squad lama yang masih hidup dengan trust tertinggi. Trust-nya dibawa.
   3. Kalau tidak ada, dipilih dari shinobi desamu memakai **afinitas GDD 5.1**:
      - Skor tiap trait dihitung dari statmu: Honor = Will, Compassion = Bonds, Loyalty = (Bonds + Will)/2, Ambition = Chakra, Freedom = min(100, (Will + 100 − Bonds)/2 + 20, +10 bila yatim).
      - `fitScore` = rata-rata trait kandidat, ditambah penyesuaian dari leaning (ruthless ≥ 4: Compassion −15, Honor −10; will_of_fire ≥ 3: Honor +5, Compassion +5; vengeance ≥ 3: Freedom +5, Ambition +5).
      - Peluang terpilih ∝ `exp(fitScore / 8)`, artinya +10 fit ≈ ×3.5.
      - Trust awal `20 + match × 0.4`, dikurangi 5 bila fit < 50 (GDD 5.2).
   - Kandidat: roster dengan `villageId` yang sama + shinobi buatan dari `surnames` desa (`villages.ts`).
2. **Di battle** (`computePlayerRoundPower`, `combat.ts:229`): tambahkan suku GDD 6.1 `+ trust × 0.15 − 6`, jadi berkisar −6 sampai +9. Skill tag Rekan (power/evade/fort…) ikut dijumlahkan ke sisi pemain seperti skill musuh.
3. **Tier trust** (GDD 7.1) diberlakukan di perang:

| Tier | Trust | Efek |
|---|---|---|
| Tidak percaya | < 35 | 30% Rekan menolak mundur (retreat gagal); kenaikan trust positif ×0.5; risiko membelot (langkah 6) |
| Biasa | 35–59 | — |
| Percaya | 60–79 | Biaya Ultimate ×0.85; poin hubungan mulai terkumpul; bisa diminta tinggal setelah perang |
| Ikatan | ≥ 80 | +4 pada Jutsu Clash; Limit Break "Surpass" gratis sekali per perang saat HP < 35 |

4. **Interception** pindah ke Rekan dengan rumus GDD 7.6: syarat trust ≥ 30; peluang `min(0.85, 0.35 + trust × 0.003 + …)`; menahan 35% damage.
5. **Rekan bisa tumbang** (padanan GDD 6.6, disederhanakan):
   - Rekan punya HP sendiri. Interception dan sebagian damage Ultimate musuh mengenai HP Rekan.
   - HP Rekan 0 → Rekan keluar dari perang. 30% ia gugur, dan itu tercatat di log, kenangan, dan epilog.
   - Kamu lalu memilih: **lanjut sendirian** (suku trust hilang) atau **mundur dari perang** (outcome `withdrew` yang sudah ada).
6. **Limit Break = Command Seal** (GDD 7.5):
   - Setiap pakai: trust +4 bila trust ≤ 60, −3 bila > 60 (Rekan yang bangga tak suka diperintah).
   - **Resolve habis + trust < 35 + Rekan bertrait ambition** → 60% Rekan **membelot** ke musuh terkuat (musuh itu +30 HP). Ia dipakai lewat jalur rogue ex-teammate yang sudah ada.
   - Kalau trust ≥ 60 saat Resolve habis → baris kesetiaan, trust +8.

**State machine — Rekan dalam perang:**

| Properti | Aturan |
|---|---|
| Masuk | Perang dimulai, pemain tidak desersi |
| Keluar | Perang selesai (→ K4 tinggal/pisah), HP Rekan 0, atau membelot |
| Interupsi | Membelot hanya dicek saat Resolve terpakai habis |
| Lanjutan | Tumbang → lanjut sendiri / mundur. Membelot → muncul sebagai musuh di perang ini |
| Edge | Pemain mati saat Rekan hidup → Rekan muncul di epilog. Rekan = mantan squad yang jadi missing-nin → tidak bisa dipilih |

**Metrik (cek dengan `sim:balance`):**
- Tingkat bertahan hidup pemain di perang naik **≤ 10 pp** dibanding sekarang. Lebih dari itu → koefisien trust 0.15 → 0.10.
- Tier Ikatan tercapai di **10–25%** perang ("sengaja lambat", GDD 7.1).
- Rekan membelot di **3–10%** perang.

**File:** `src/sim/war.ts` (inisialisasi dan aftermath), `src/sim/combat.ts` (power, retreat, clash, interception, Limit Break), `src/sim/team.ts` (pakai ulang fit/trust), `src/sim/types.ts` (`WarState.partner`), `src/ui/screens/WarScreen.tsx` dan `BattleDialog.tsx` (kartu Rekan: HP, trust, tier).

---

## K2 — Ikatan di masa perang (GDD 7.1, 7.3, 7.4)

**Cara kerja:**
- **Aksi malam baru "Bicara dengan Rekan"**: trust +3–6 lewat kurva fit, HP +5. 70% membuka satu fragmen latar belakang Rekan (motive/originHint roster sudah ada).
- **Aksi siang "Kizuna"** yang sudah ada (`war.ts:2172`) menjadi padanan *outing*: trust +2–4, Exposure +3.
- **Reaksi crossroads per trait** menggantikan `squadTrustDelta` yang datar (`events-war.ts:12`):
  - Tiap opsi diberi `reactions: { honor?, compassion?, loyalty?, ambition?, freedom? }`.
  - Trust Rekan berubah sesuai trait-nya: jumlah reaksi × 1.5, dibatasi −18…+15 (GDD 7.1).
  - Pilihan kejam membuat Rekan compassion kecewa, tapi Rekan ambition senang.
- **Fit dicek ulang** saat leaning melewati ambang di tengah perang (sudah ada `fitLive`-style di `team.ts:93-101`).
- **5 adegan perang** (GDD 7.4, versi Naruto). Hanya berjalan bila trust ≥ 60, dan menambah poin hubungan:

| Adegan | Syarat dan peluang | Poin |
|---|---|---|
| Mimpi | 30% | +5 |
| Luka | 50% saat HP < 40 | +6 |
| Atap dan bulan | 25% | +4 |
| Api unggun | 30% di tahap ≥ 2; Exposure naik | +10 |
| Cemburu | 35% bila ada sekutu hidup | +6 |

- **Tahap hubungan** memakai tiga jalur yang sudah ada (mentorship / comrades / romance, `team.ts:120-128`). Tahap tidak berefek combat; ia mengubah dialog, finale (K4), dan epilog (K5).

---

## K3 — Kuchiyose (padanan Servant: lapisan pemanggilan dan Od)

**Tujuan pemain:** "kontrak memilih yang mirip denganmu". Hewan summon mencerminkan siapa kamu, lalu membantu di samping seranganmu.

**Cara kerja:**
1. **Kontrak** muncul sekali di life phase: Genin ke atas, usia ≥ 12, sebagai keputusan (atau saat disiplin Kuchiyose dipelajari). Bisa ditolak.
2. **Klan dipilih lewat afinitas** dengan rumus GDD 5.1 yang sama seperti K1, `exp(fitScore/8)` terhadap trait klan:

| Klan | Trait | Bantuan di battle (aksi Od) |
|---|---|---|
| Katak (Myōbokuzan) | honor, loyalty | +power ronde ini (serangan gabungan) |
| Ular (Ryūchi) | ambition, freedom | damage + debuff musuh 1 ronde |
| Siput (Shikkotsu) | compassion | heal pemain atau Rekan |
| Anjing ninja | loyalty | lacak: intel +15 dan peluang "Exploit Weakness" naik |
| Elang | freedom | retreat +15% / scout malam |
| Kera | honor | ward: damage masuk −35% satu ronde |

   - Tingkat summon (kecil / sedang / bos) naik bersama level disiplin Kuchiyose. Efek ×1 / ×1.5 / ×2.
3. **Od = pool chakra per battle**, memakai `battleChakraPool` yang sudah dihitung tapi menganggur (`powers.ts:104`). GDD 3.3: `circuit × 12 + Mana × 0.4` dipadankan ke `kapasitas × 12 + chakra × 0.4`. Pool penuh lagi di setiap battle, terpisah dari CP perang.
4. **Aksi pendamping di samping serangan** (GDD 3.3), bukan menggantikannya:
   - Tiap ronde = 1 serangan utama (Taijutsu / Ninjutsu / Genjutsu / Ultimate) + **opsional 1 aksi Od**: summon Kuchiyose, Heal, Ward, Clone.
   - Heal, Ward, dan Clone yang sekarang memakan ronde (`combat.ts:656-730`) pindah ke slot ini dan dibayar dengan Od, bukan CP.
   - Biaya Od: summon 20, Heal 12, Ward 10, Clone 10.
5. Kontrak permanen seumur hidup, jadi cocok untuk perang berulang. Klan yang pernah dikontrak masuk Codex.

**Metrik:**
- Rata-rata aksi Od per battle **1–2** (pool cukup tapi tidak gratis). Kurang dari 1 → kecilkan biaya. Lebih dari 3 → kecilkan pool ×0.4 → ×0.3.
- Tingkat bertahan hidup gabungan K1 + K3 naik **≤ 15 pp**.

**File:** `src/sim/powers.ts`, `src/data/powers.ts` (klan sebagai data), `src/sim/life.ts` (keputusan kontrak), `src/sim/combat.ts` (`resolveBattleRound`: serangan + aksi Od), `BattleDialog.tsx` (dua baris pilihan: serangan dan aksi pendamping), `src/sim/meta.ts` (Codex).

---

## K4 — Finale perang: Permintaan Pemenang (padanan Grail wish, GDD 10.2)

**Masalah:** menang perang sekarang hanya memberi Ryo, XP, dan promosi (`war.ts:1644-1696`), tanpa momen puncak.

**Cara kerja:** saat hasil `victor` / `shared`, Kage dan Daimyo mengabulkan **satu permintaan**:
1. **4 permintaan pribadi** dari leaning tertinggimu (GDD: top-4, murni/gelap):

| Leaning | Permintaan | Efek |
|---|---|---|
| will_of_fire (murni) | Perjanjian damai | Tension jadi 0, cooldown perang berikutnya ×2 |
| bonds (murni) | Lindungi keluarga | Health keluarga hidup +20, trust squad lama +10 |
| ambition | Pencalonan Kage | Jalur Kage terbuka (syarat crisis dilepas) |
| vengeance (gelap) | Buru pembunuh | Musuh yang membunuh orangmu jadi target bounty perang berikutnya |
| forbidden (gelap) | Gulungan terlarang | Satu disiplin terlarang langsung level 2, leaning forbidden +2 |
| ruthless (gelap) | Rampas wilayah | Ryo +40, reputasi desa lain turun (tension +15) |

2. **Permintaan Rekan**, bila trust ≥ 60: kabulkan → trust +10 dan poin hubungan +15. Ini padanan "servant's wish".
3. **"Tetap bersamaku"**, bila trust ≥ 60 (GDD STAY_NEED): Rekan menjadi partner permanen, otomatis jadi Rekan di perang berikutnya (K1 langkah 1), dan hadir di epilog.

---

## K5 — Epilog bersama Rekan (GDD 10.3, diringkas)

- Bila Rekan tinggal atau masih hidup, 3 adegan tetap masuk pool epilog: kunjungan tahunan, "di depan pintu" saat sakit tua, dan "malam terakhir" sebelum wafat. Teksnya berbeda per jalur hubungan.
- Rekan gugur → adegan batu peringatan.
- Memakai mesin epilog yang ada (`src/sim/epilogue.ts`, `src/data/events-epilogue.ts`).

---

## K6 — Isi konten (bukan mekanik baru)
GDD punya pool jauh lebih besar. Target bertahap, mulai dari setengahnya:

| Konten | GDD | Sekarang | Target 1 |
|---|---|---|---|
| Life events | 127 | 17 | 60 |
| Growth events | 56 | 8 | 25 |
| Flavour lines | 107 | 20 | 50 |
| Crossroads perang (dengan `reactions` per trait) | 75 | 12 | 30 |
| Epilogue events | 238 | 5 + 3 beat | 40 |
| Adegan perang Rekan | 5 | 0 | 5 |

---

## Urutan kerja
1. **K1** (Rekan + afinitas + suku trust di power) → `npm test` hijau, ukur metrik.
2. **K2** (Bicara, reaksi trait, adegan).
3. **K3** (Od + aksi pendamping + Kuchiyose).
4. **K4** → **K5**.
5. **K6** berjalan paralel kapan saja (data saja).

`docs/immersion-plan.md` tetap berlaku (istilah canon, nama jutsu, nindo, rival, kanji, audio). Fase 3-nya bisa memakai Rekan K1 sebagai rival bila trait-nya ambition.

## Verifikasi
- Tiap langkah: `npm test`, `npm run build`, `npm run sim:stress` (tanpa crash / NaN).
- `npm run sim:balance` sebelum dan sesudah, untuk metrik K1 dan K3. Catat jumlah sampel dan tanggal.
- Test kecil baru `tests/partner.test.ts`:
  - Afinitas lebih sering memilih kandidat dengan fit tinggi (seed tetap, banyak sampel).
  - Tier trust memberi efek yang benar (biaya Ultimate ×0.85 di ≥ 60, Surpass gratis di ≥ 80).
  - Membelot hanya saat Resolve 0 + trust < 35 + ambition.
  - Aksi Od tidak menggantikan serangan.
  - "Tetap bersamaku" membawa Rekan ke perang berikutnya.
- Manual (`npm run dev`): satu hidup sampai perang. Cek:
  - Kartu Rekan tampil dan trust bergerak dari Bicara dan crossroads.
  - Satu battle dengan summon Kuchiyose di samping serangan.
  - Menang lalu memilih permintaan, Rekan tinggal, dan muncul lagi di perang berikutnya.

## Dilewati (sesuai GDD, bisa ditambah nanti)
- Strays dan kontrak ulang Rekan (GDD 6.6). Untuk sekarang cukup "lanjut sendiri / mundur".
- Duel master vs master, membunuh master lawan, aksi khusus kelas (Berserker / Ruler).
- Relik/katalis untuk memengaruhi pemanggilan, ghost team, statistik global, multi-bahasa.
