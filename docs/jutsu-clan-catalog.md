# NarutoSim — Katalog Jutsu, Revisi Efek & Jutsu Klan

Lanjutan dari [`combat-power-jutsu-plan.md`](combat-power-jutsu-plan.md). Dokumen itu sudah membuat fondasi database jutsu individual. Implementasinya sudah berjalan: `JUTSU_DB` berisi 31 entri di `src/data/jutsu.ts`.

Dokumen ini mengerjakan tiga hal:
1. **Memperluas katalog** dari 31 menjadi ±160 teknik, dikirim dalam tiga gelombang.
2. **Merevisi cara kerja dan efek semua jutsu.** Saat ini semua kontrol jatuh ke satu counter generik, jadi tiap teknik perlu status dan aturan sendiri.
3. **Jutsu dan kekkei genkai khusus klan.** Sharingan hanya untuk Uchiha, Byakugan hanya untuk Hyūga, dan seterusnya.

---

## Context — temuan di kode

| # | Temuan | Lokasi | Akibat |
|---|---|---|---|
| 1 | Bloodline di-roll saat lahir **tanpa melihat klan** | `rollBirthBloodline`, `src/sim/powers.ts:125` | Anak sipil atau Nara bisa lahir dengan Sharingan |
| 2 | Tiga klan menunjuk id bloodline yang tidak ada: `magnet_release`, `ice_release`, `lava_release` (id aslinya `jiton`, `hyoton`, `yoton`) | `src/data/clans.ts` (Sabaku, Yuki, Terumi, Iwagane) | Tautan klan ↔ bloodline putus |
| 3 | Custom build boleh memilih bloodline apa pun | `src/sim/custom.ts:151` | Sharingan bisa dipakai klan mana pun |
| 4 | Gentle Fist bisa dipelajari non-Hyūga | `origins.ts:32,46` (`familyDisciplines`), `jutsu.ts:425` | Jūken tidak eksklusif |
| 5 | Hiden klan hanya berupa bonus angka flat (`combatBonus`) | `clans.ts` `ClanHidenArt`, `clan-heritage.ts:74` | Kagemane, Baika dan lainnya hanya +3/+6 power, bukan teknik |
| 6 | Bloodline tanpa klan: `mokuton`, `shikotsumyaku`, `sage_body`, `rinne_eye` | `powers.ts` `BLOODLINES` | Tidak punya rumah lore |
| 7 | Klan Yamanaka, Senju dan Kaguya tidak ada | `clans.ts` | Trio Ino–Shika–Chō pincang, Mokuton dan Shikotsumyaku yatim |
| 8 | Semua efek kontrol memakai **satu** counter `enemyDebuffRounds` | `combat.ts:1417` | Kagemane, genjutsu dan Jibashi terasa sama ("disrupts foe") |
| 9 | Fallback generik muncul lagi: "`<Bloodline>` Secret Release" dan `secret_art_*` dengan seal palsu `['Tora','Mi','Hitsuji']` | `jutsu.ts:630–679` | Kembali ke masalah awal: nama kategori, bukan teknik |

---

## Sumber & kebijakan referensi

**Sumber utama:** Narutopedia (naruto.fandom.com). Halaman yang dipakai tercantum di bagian Referensi.

**Rank canon tidak seragam.** Narutopedia kini sering mengambil rank dari kartu Naruto Kayou, bukan dari databook. Karena itu katalog ini memakai aturan berikut:

| Label | Arti |
|---|---|
| **DB** | Rank dari databook resmi. Sudah diverifikasi lewat Narutopedia. |
| **TCG** | Rank dari kartu Kayou, menurut Narutopedia. Dipakai sebagai acuan, bukan hukum. |
| **NP** | Rank tertulis di Narutopedia tanpa sumber yang disebut. |
| **G** | Rank desain game (posture B). Belum dicocokkan dengan sumber. Ini label default bila kolom rank tidak menyebut sumber. |

**Rank yang sudah diverifikasi saat riset:**
- Chidori **A** (DB, First Databook hlm. 209)
- Kage Bunshin **B** (DB, Rin no Sho hlm. 170)
- Shintenshin **C** (NP)
- Gatsūga **C** (NP)
- Kagemane **A** (TCG). Game memakai B, lihat catatan di tabel Nara.
- Baika **C** (TCG)
- Makyō Hyōshō **S** (TCG)

**Aturan pengisian data:**
- **Hand seals** untuk entri baru disalin dari infobox halaman Narutopedia saat implementasi. Seal tidak boleh dikarang. Test memverifikasi bahwa setiap seal valid.
- **Deskripsi** ditulis dengan kata-kata sendiri, bukan salinan teks wiki.
- **Klan orisinal game** (Kazekawa, Ishikawa, Iwagane, Kaminari, dan klan desa kecil) diberi label *orisinal*.

---

## Bagian 1 — Revisi cara kerja jutsu (Effect Model v2)

### 1.1 Masalah model sekarang
`JutsuEffect` hanya punya `power`, `dodgeMult`, `pierceWall`, `debuffRounds`, `wardRounds`, `heal`, `cloneEvade`, `cpDrain`, `fortShave`, dan `selfRisk`. Akibatnya:
- Semua kontrol menjadi `debuffRounds`, jadi Kagemane = Narakumi = Jibashi.
- Tidak ada counter spesifik, misalnya Raiton vs Hydrification atau Kai vs genjutsu.
- Tidak ada mode berkelanjutan (Sharingan, Gates, Baika, Susanoo).
- Tidak ada biaya selain CP: HP, eye strain, atau batas pakai per battle.

### 1.2 Struktur baru
Struktur ini menggantikan field `effect` di `JutsuDefinition`. Migrasi 31 entri lama bersifat mekanis.

```ts
type JutsuSpeed = 'slow' | 'normal' | 'fast' | 'unavoidable';
type StatusId =
  | 'burn' | 'shock' | 'bind' | 'genjutsu' | 'drain' | 'tenketsu_seal'
  | 'bleed' | 'blind' | 'slow' | 'fear' | 'poison';
type SelfStateId =
  | 'guard' | 'wall' | 'evade' | 'reflect' | 'intangible' | 'field';

interface JutsuDefinition {
  // ...field yang sudah ada (id, name, category, style, role, element, rank, chakraCost, seals, description)
  requires: {
    disciplineId?: string; altDisciplineId?: string; level?: 1 | 2 | 3 | 4;
    clanId?: string;                 // BARU: hiden klan
    bloodlineId?: string;
    bloodlineStage?: BloodlineStage; // BARU: misalnya 3 tomoe = 'ctrl2'
    mode?: ModeId;                   // BARU: harus dalam mode tertentu (Byakugan, Gates 3, Baika)
    knownJutsuId?: string;           // BARU: turunan (Rasenshuriken butuh Rasengan)
    companion?: 'ninken' | 'puppet' | 'insects';
    requiresContractOrDiscipline?: boolean;
  };
  power: number;                     // menggantikan effect.power
  hits?: number;                     // multi-hit: peluang dodge musuh × 0.85^(hits−1)
  speed?: JutsuSpeed;                // slow ×1.3 / normal ×1 / fast ×0.5 / unavoidable ×0 peluang dodge
  pierce?: boolean;                  // menembus guard dan wall
  aoe?: boolean;                     // ikut mengenai summon, clone, dan partner musuh (Fase 8)
  onHit?: { status: StatusId; rounds: number; mag?: number }[];
  self?: { state: SelfStateId; rounds: number; mag?: number }[];
  setup?: 'ambush' | 'enemy_bound' | 'prev_fire' | 'markers' | 'water_field';
  costs?: { hp?: number; strain?: number; upkeepCp?: number; eyeStrain?: number; usesPerBattle?: number };
  counters?: string[];               // tag yang dikalahkan teknik ini, misalnya 'intangible', 'genjutsu'
  tags: string[];                    // chip UI, digenerate dari field di atas
  hiden?: boolean; forbidden?: boolean;
  ref: string;                       // slug halaman Narutopedia
}
```

**Battle state** (`ActiveBattleState`):
- Counter terpisah (`enemyDebuffRounds`, `playerWardRounds`, `playerCloneEvade`, `enemyWallRounds`, `enemyFieldRounds`) diganti dengan `enemyStatus`, `playerStatus`, `playerSelf`, dan `enemySelf`, masing-masing bertipe `Record<Id, { rounds, mag }>`.
- Ditambah `playerMode: { id, roundsActive } | null`.
- Pengurangan counter tetap memakai pola `PreRoundCounters` (`combat.ts`) agar status baru tidak langsung kehilangan satu ronde.

### 1.3 Status pada lawan
Semua angka di tabel ini posture B.

| Status | Efek per ronde | Durasi default | Cara lepas / counter | Penumpukan |
|---|---|---|---|---|
| **Burn** | 4 damage | 2 | Target memakai jutsu Suiton. **Amaterasu tidak bisa dipadamkan.** | Refresh, tidak menumpuk |
| **Shock** | Dodge target ×0.5, power −8 | 1 | — | Refresh |
| **Bind** | Target tidak bisa dodge, power −15 | 2 | Tiap ronde target lepas dengan p = clamp(0.25 + 0.2 × (CR target − CR pengguna), 0.1, 0.9). Lepas otomatis bila pengguna kena ≥ 15 damage. | Tidak bisa dua bind sekaligus |
| **Genjutsu** | Power −12, peluang Ultimate musuh ×0.5 | 2 | Kai (partner atau diri sendiri). Lepas bila kena damage ≥ 12. Uji INS lawan vs INS pengguna. Sharingan 2 tomoe ke atas kebal genjutsu rank ≤ C. | Refresh |
| **Drain** | Target −mag CP | sekali atau per ronde | Insect-repellent / Katon untuk drain serangga | Menumpuk sampai CP 0 (lalu kena penalti exhaustion yang sudah ada) |
| **Tenketsu Seal** | Target tidak bisa memakai Ultimate, clash, atau bloodline. Biaya ninjutsu target ×1.5. | 2 | Medical / waktu | Refresh |
| **Bleed** | 3 damage | 3 | Medical | Menumpuk maksimal 2 |
| **Blind** | Dodge pemain +0.20 terhadap target | 1 | Sensory, Byakugan, dan Sharingan kebal | Refresh |
| **Slow** | Dodge target ×0.6, power −8 | 2 | Gates dan Raiton no Yoroi kebal | Refresh |
| **Fear** (*killing intent*) | Power −10 | 1 | Will ≥ 60 kebal | Sekali per battle |
| **Poison** | 5 damage, power −5 | 3 | Medical, Shōsen | Menumpuk maksimal 2 |

**Killing Intent (Fear)** diterapkan otomatis di ronde 1 oleh pihak dengan CR ≥ 2 di atas lawan. Ini konsekuensi mekanis dari power gap (prinsip 1 di combat plan). Genin yang bertemu S-class merasakan tekanan itu sebelum sempat bergerak.

### 1.4 State pada diri sendiri

| State | Efek | Durasi | Ditembus oleh |
|---|---|---|---|
| **Guard** x% | Damage masuk −x% | 1–3 | `pierce` (separuh efek), genjutsu |
| **Wall** | Memblokir penuh serangan berikutnya yang tidak `pierce`, lalu pecah | 1–2 | `pierce`, `aoe` A/S |
| **Evade** p | Peluang p meniadakan serangan berikutnya | 1 | `aoe`, Byakugan dan Sharingan 3 tomoe (p × 0.5), `unavoidable` |
| **Reflect** | Memantulkan serangan taijutsu, kenjutsu, atau proyektil berikutnya, plus counter 8 | 1 | Genjutsu, `aoe` S, serangan `unavoidable` |
| **Intangible** | Kebal taijutsu, kenjutsu, dan proyektil | 1–3 | **Raiton ×1.5**, segel / fuinjutsu, genjutsu |
| **Field** | Medan milik sendiri, misalnya air untuk Suiton +30% | 3 | Field lawan menimpa |

### 1.5 Mode berkelanjutan
- Mode adalah aksi yang **tidak memakan exchange** (toggle instan). Ini menjaga *Response*: Sharingan menyala seketika, seperti di canon.
- Mode dibayar dengan **upkeep CP per ronde**.
- Hanya satu mode aktif. Pengecualiannya dōjutsu, yang bisa ditumpuk dengan satu mode tubuh.
- Saat CP 0, mode mati otomatis.

| Mode | Syarat | Efek | Upkeep / biaya |
|---|---|---|---|
| Sharingan | Uchiha (atau transplant, Gelombang 3) | Lihat 2.3 | Uchiha 2 CP/r; transplant 6 CP/r dan tidak bisa dimatikan |
| Mangekyō Sharingan | Sharingan + event trauma | Membuka 2 teknik unik dan Susanoo (lihat 2.3) | 4 CP/r + eye strain |
| Byakugan | Hyūga (sejak lahir) | Lihat 2.4 | 1 CP/r |
| Hachimon (Gate 1–8) | strong_fist L3+ | Power +6 per gerbang, kebal Slow | HP 2 × gerbang per ronde. Gerbang 8: lihat 3.7 |
| Baika (Multi-Size) | Akimichi | Taijutsu ×1.35, Guard 15% | 6 CP/r |
| Raiton no Yoroi | Yotsuki | Speed `fast` untuk taijutsu, Guard 20%, kebal Slow | 7 CP/r |
| Suika (Hydrification) | Hōzuki | Intangible terhadap fisik; Raiton ×1.5 | 5 CP/r |
| Makyō Hyōshō | Yuki + Hyōton | Evade 0.5 tiap ronde + serangan senbon otomatis 6 | 10 CP/r |
| Sennin Mode | senjutsu L4 | Semua power +18 (≈1 rank), sensory | 1 exchange untuk mengumpulkan energi alam; maksimal 3 ronde |
| Susanoo | MS kedua mata | Guard 60%, ultimate Susanoo terbuka | 10 CP/r + strain 3/r |

### 1.6 Matriks interaksi (counter)

| Pemicu | Melawan | Hasil |
|---|---|---|
| Katon | Futon | ×1.18 (sudah ada, tidak berubah) |
| Suiton Wall | Katon | Diblokir penuh, bukan hanya pecah |
| Raiton | Intangible (Hydrification) | ×1.5 dan menghapus Intangible |
| Katon | Drain serangga (Aburame) | Drain musuh berikutnya ×0.5 |
| Kai | Genjutsu | Hapus status genjutsu |
| Sharingan 2+ tomoe | Genjutsu ≤ C | Kebal |
| Sharingan 3 tomoe | Genjutsu apa pun | 50% dipantulkan ke perapal |
| Byakugan / Sharingan 3 tomoe | Evade dari clone | Evade × 0.5 |
| Byakugan | Stealth / ambush musuh | Bonus ambush musuh hilang |
| Fuinjutsu (Tenketsu Seal) | Pengguna chakra besar | Clash dan bloodline dikunci. Inilah cara "sealing mengalahkan chakra raksasa". |
| Kagemane di ronde malam (`timeOfDay` = midnight / late_night) | — | Peluang bind −30% kecuali sebelumnya memakai Flash Bomb (bayangan butuh cahaya) |
| Chidori tanpa Sharingan, Byakugan, atau sensory | — | Bila exchange kalah: +selfRisk (tunnel vision, DB1) |
| Bind aktif | Shintenshin, Kage Kubishibari, Sabaku Sōsō | Kena otomatis atau ×1.4 (setup combo) |

### 1.7 State machine status
- **Masuk:** status diterapkan saat serangan *kena*. Dodge, Wall, Evade, atau Reflect berarti status tidak masuk.
- **Keluar:** durasi habis, dihapus counter, atau syarat lepas terpenuhi (bind, genjutsu).
- **Interupsi:** damage ≥ ambang (12 untuk genjutsu, 15 untuk pengguna bind).
- **Saat resource habis:** mode mati di CP 0. Status pada lawan tetap berjalan.
- **Edge case:**
  - Status pada lawan yang mati langsung dibuang.
  - Retreat menghapus semua status.
  - Dawn break mengakhiri battle, dan status tidak terbawa ke battle berikutnya.
  - Bind + Reflect: bind menang, karena target tidak bisa bergerak untuk memantulkan.

### 1.8 Clarity UI
1. Kartu jutsu menampilkan chip yang digenerate dari data, misalnya `[FAST] [PIERCE] [BIND 2] [-8 HP] [2/battle]`.
2. Header battle menampilkan status aktif kedua pihak sebagai chip dengan sisa ronde.
3. Narasi menyebut status dan counter-nya, misalnya *"Kagemane gagal: tak ada cahaya untuk bayanganmu"*.

---

## Bagian 2 — Klan, Bloodline & Gating

### 2.1 Aturan inti
1. **Dōjutsu tidak pernah muncul di luar klannya.** Satu-satunya jalan untuk orang luar adalah transplant (Gelombang 3), seperti di canon.
2. **Bloodline diturunkan dari klan saat lahir.** Klan tanpa bloodline tidak bisa memberi bloodline.
3. **Kekkei genkai elemen** boleh muncul di luar klan, tapi sangat langka. Canon: Rōshi memakai Lava Release tanpa klan yang disebut.
4. **Hiden hanya untuk anggota klan.** Hiden dibuka lewat alur `unlockedHiden` yang sudah ada (`clan-heritage.ts`), dengan syarat compatibility, standing dan umur. Bonus flat `combatBonus` dihapus dan diganti jutsu.
5. **Gentle Fist hanya untuk Hyūga.** `familyDisciplines` origin difilter berdasarkan klan, dan `meetsJutsuRequirements` mengecek `clanId`.

### 2.2 Tabel pewarisan
Peluang lahir di tabel ini posture B, kecuali Byakugan.

| Bloodline | Klan | Peluang membawa gen | Stage awal | Catatan canon |
|---|---|---|---|---|
| Sharingan | Uchiha | 70% | `latent`; bangun lewat emosi kuat (`catalystType: 'trauma'`) | "Appears selectively among its members" |
| Byakugan | Hyūga | **100%** | `awakened` sejak lahir | Present from birth |
| Hyōton | Yuki | 60% | `latent` | Klan Yuki ditakuti dan diburu |
| Yōton | Terumi, Iwagane (orisinal) | 25% | `latent` | Bentuknya beragam antar pengguna |
| Jiton | Sabaku (Kazekage) | 40% | `latent` | Pasir besi Kazekage ke-3, debu emas Rasa |
| Mokuton | **Senju (klan baru)** | 2% | `latent` | Hanya Hashirama yang memilikinya secara alami. Sel Hashirama: Gelombang 3 |
| Shikotsumyaku | **Kaguya (klan baru, Kiri)** | 60% | `latent` | Klan Kaguya merasa tak terkalahkan |
| Kongō Fūsa | Uzumaki | 20% | `latent` | Kushina; Karin dalam kadar lebih kecil |
| **Ketsuryūgan** (bloodline baru) | Chinoike | 70% | `latent` | Dōjutsu darah klan Chinoike |
| Sage Body | — | 0% saat lahir | event-only (Gelombang 3) | Klan Jūgo tanpa desa; ketidakstabilan mental |
| Rinnegan | — | 0% saat lahir | event-only (Gelombang 3) | Mitos |
| KG elemen di luar klan | sipil / lainnya | 0.3% | `latent` | Hanya Hyōton, Yōton, Jiton |

**Perbaikan kode:**
- `rollBirthBloodline(seed, originId)` → `rollBirthBloodline(seed, originId, clanId)`. Peluang diambil dari `ClanDef.bloodlineChance` (field baru), bukan dari roll global.
- Perbaiki `bloodlineId` di `clans.ts`: `magnet_release` → `jiton`, `ice_release` → `hyoton`, `lava_release` → `yoton`.
- `custom.ts`: validasi `latentBloodlineId` harus sama dengan `clan.bloodlineId`.
- Test integritas data: setiap `clan.bloodlineId` ada di `BLOODLINE_MAP`.

### 2.3 Sharingan → Mangekyō (Uchiha)
`BloodlineStage` yang sudah ada dipetakan ke tomoe:

| Stage | Tomoe | Efek mode |
|---|---|---|
| `awakened` | 1 | Lihat chakra: intel musuh +20 saat aktif, kebal genjutsu rank D |
| `ctrl1` | 2 | + Prediksi gerak (dodge +0.10), baca segel (power ninjutsu musuh −10%), kebal genjutsu ≤ C |
| `ctrl2` / `mastered` | 3 | + Dodge +0.15, **Genjutsu: Sharingan** terbuka, 50% pantul genjutsu, **Copy** (di bawah) |

**Copy Jutsu (identitas Uchiha):**
- Saat Sharingan 3 tomoe aktif dan musuh memakai jutsu yang bukan hiden dan bukan kekkei genkai, jutsu itu masuk `discoveredJutsu`.
- Jutsu itu bisa dipakai dengan mastery Learning, asal elemennya sesuai dengan discipline pemain.
- Bergantung pada Fase 8 (NPC memilih jutsu). Sebelum itu, copy hanya berlaku untuk jutsu partner dan sensei.

**Mangekyō** (Gelombang 3):
- Dibuka lewat event kehilangan orang terdekat. Reuse `bumpClanTraumaCatalyst` dan memori `loss`.
- Saat bangun, roll 2 teknik dari pool berikut: **Amaterasu**, **Tsukuyomi**, **Kamui**, **Kotoamatsukami**.
- Susanoo terbuka di stage `mastered`.
- **Eye strain** disimpan di state permanen `eyeStrain`:
  - Tiap teknik MS +2.
  - Saat mencapai 20 → **buta**: semua efek Sharingan ×0.5 dan intel −10 permanen. Ini *Motivation*, konsekuensi lintas hidup.
  - **Eternal Mangekyō** (mata saudara, event langka) menghapus eye strain.

### 2.4 Byakugan (Hyūga)

| Stage | Efek mode |
|---|---|
| `awakened` | Penglihatan ±360°: intel musuh langsung 100 saat aktif, bonus ambush dan stealth musuh hilang |
| `ctrl1` | + Clone dan genjutsu terlihat (Evade musuh × 0.5), Jūken DRAIN +25% |
| `ctrl2` | + Jangkauan diperluas, Hakke 64 terbuka |
| `mastered` | + Hakke 128 terbuka, **blind spot tertutup** |

**Blind spot:** di bawah `mastered`, musuh dengan skill `stealth` ≥ 4 punya peluang 20% mengabaikan bonus Byakugan pada ronde itu (titik buta di tengkuk, canon).

**Caged Bird Seal:** klan Hyūga sudah punya `hasBranchHierarchy`. Untuk Branch House, ini dijadikan event politik, bukan efek combat. Di luar cakupan dokumen ini.

### 2.5 Klan baru yang ditambahkan ke `clans.ts`

| Klan | Desa | Bloodline | Signature disciplines | Alasan |
|---|---|---|---|---|
| **Yamanaka** | Konoha | — | genjutsu, sensory, interrogation | Melengkapi Ino–Shika–Chō |
| **Senju** | Konoha | Mokuton (2%) | water_release, earth_release, shadow_clone | Rumah Mokuton; Tobirama pencipta Kage Bunshin (Narutopedia) |
| **Kaguya** | Kiri | Shikotsumyaku (60%) | strong_fist, kenjutsu | Rumah Shikotsumyaku |

---

## Bagian 3 — Katalog Jutsu

**Kolom tabel:**
- **Rank**: dengan label sumber, bila bukan G.
- **CP**: biaya dasar (B).
- **Syarat**: `disc Lv`, klan, mode.
- **Efek**: notasi Bagian 1.
- **W**: gelombang (1 = bersama combat rework, 2 = klan/KG, 3 = lanjutan).

`ATK x` = power. `HIT n` = multi-hit. `PRC` = pierce. `AOE` = area. `FAST` / `UNAV` = speed.

### 3.1 Akademi & universal (semua shinobi)

| Jutsu | Rank | CP | Syarat | Efek | W |
|---|---|---|---|---|---|
| Taijutsu Dasar | D | 0 | — | ATK 0.85 | 1 |
| Lempar Kunai / Shuriken | D | 0 | — | ATK 0.7, FAST | 1 |
| Bunshin no Jutsu | D | 3 | — | Evade 0.2 (clone ilusi; dōjutsu melihatnya) | 1 |
| Kawarimi no Jutsu | D | 4 | — | Evade 0.5, maksimal 1 per ronde | 1 |
| Henge no Jutsu | D | 3 | — | Ronde berikut dianggap ambush (+9); 1/battle | 1 |
| Kai (Genjutsu Release) | D | 2 | — | Hapus Genjutsu dari diri atau partner | 1 |
| Shunshin no Jutsu | D | 6 | — | Evade 0.3 + serangan berikut FAST; retreat +10% | 1 |
| Smoke Bomb (alat) | D | 0 | — | Blind 1; retreat +10%; 2/battle | 1 |
| Flash Bomb (alat) | D | 0 | — | Blind 1; membuka Kagemane di malam hari; 2/battle | 1 |
| Kibaku Fuda (Explosive Tag) | C | 4 | trap_craft L1 | ATK 1.1, AOE; ×1.4 bila dipasang saat prep | 1 |

### 3.2 Katon (Fire Release)

| Jutsu | Rank | CP | Syarat | Efek | W |
|---|---|---|---|---|---|
| Gōkakyū no Jutsu | C | 12 | fire L1 | ATK 1.12, Burn 2 | 1 |
| Hōsenka no Jutsu | C | 10 | fire L1 | ATK 0.85, HIT 3 | 1 |
| Hōsenka Tsumabeni | B | 14 | fire L2 + shurikenjutsu L1 | HIT 3, PRC (shuriken tersembunyi di api) | 2 |
| Ryūka no Jutsu | B | 16 | fire L2 | ATK 1.25, PRC, Burn 2 | 1 |
| Karyū Endan | B | 18 | fire L3 | ATK 1.35, AOE | 1 |
| Gōryūka no Jutsu | A | 26 | fire L3 | ATK 1.5, AOE, Burn 2; membuka setup `prev_fire` untuk Kirin | 1 |
| Gōka Mekkyaku | S | 40 | fire L4 | Clash, AOE, Burn 3 | 1 |
| Gōka Messhitsu | S | 48 | fire L4 + Uchiha | Clash, AOE, Burn 3, UNAV | 3 |

### 3.3 Fūton (Wind Release)

| Jutsu | Rank | CP | Syarat | Efek | W |
|---|---|---|---|---|---|
| Toppa | C | 8 | wind L1 | ATK 0.9, hapus Evade dan clone musuh | 1 |
| Daitoppa | C | 12 | wind L1 | ATK 1.0, AOE; Katon berikutnya +20% | 1 |
| Shinkūha | B | 14 | wind L2 | ATK 1.15, PRC, FAST | 1 |
| Shinkūgyoku | B | 16 | wind L2 | ATK 0.8, HIT 4 | 1 |
| Kaze no Yaiba | A | 22 | wind L3 | ATK 1.45, PRC | 1 |
| Shinkū Taigyoku | A | 26 | wind L3 | ATK 1.5, AOE | 1 |
| Rasengan | A | 24 | wind L3 **atau** shadow_clone L3 | ATK 1.55, PRC; spiral tanpa elemen | 1 |
| Rasenshuriken | S | 45 | wind L4 + tahu Rasengan | Clash, PRC, AOE; strain +8 per pakai (melukai lengan) kecuali Sennin Mode | 1 |

### 3.4 Raiton (Lightning Release)

| Jutsu | Rank | CP | Syarat | Efek | W |
|---|---|---|---|---|---|
| Raikyū | C | 10 | lightning L1 | ATK 1.0, FAST | 1 |
| Jibashi | C | 10 | lightning L1 | ATK 0.8, Shock 1 | 1 |
| Ikazuchi no Kiba | B | 16 | lightning L2 | ATK 1.2, Shock 1, AOE | 1 |
| Chidori Nagashi | B | 14 | lightning L3 + tahu Chidori | Reflect 1 + Shock 1 ke penyerang jarak dekat; lepas dari Bind | 1 |
| **Chidori** | **A (DB)** | 25 | lightning L3 | ATK 1.5, PRC, FAST; risiko tunnel vision; 2/battle (Learning) → 4/battle (Mastered) | 1 |
| Chidori Eisō | A | 22 | lightning L3 + tahu Chidori | ATK 1.3, PRC; jarak menengah, tanpa risiko tunnel vision | 2 |
| Raikiri | A | 28 | lightning L4 | Clash, PRC, FAST | 1 |
| Kirin | S | 45 | lightning L4 + fire L2 | UNAV, ATK 1.9; setup `prev_fire` wajib (awan dari Katon besar) | 3 |

### 3.5 Doton (Earth Release)

| Jutsu | Rank | CP | Syarat | Efek | W |
|---|---|---|---|---|---|
| Shinjū Zanshu | C | 8 | earth L1 | Bila ambush atau ronde 1: ATK 1.3 + Bind 1; selain itu ATK 0.8 | 1 |
| Doryūheki | B | 14 | earth L1 | Wall 1 | 1 |
| Doryūdan | B | 16 | earth L2 | ATK 1.2 | 1 |
| Yomi Numa | B | 18 | earth L2 | Bind 2, AOE | 1 |
| Ganchūrō | B | 18 | earth L3 | Bind 2, Guard 15% | 1 |
| Doryū Jōheki | A | 22 | earth L3 | Wall 2 (menahan 2 serangan) | 1 |
| Sando no Jutsu | S | 40 | earth L4 | Clash, Slow 2 | 1 |

### 3.6 Suiton (Water Release)

| Jutsu | Rank | CP | Syarat | Efek | W |
|---|---|---|---|---|---|
| Teppōdama | C | 10 | water L1 | ATK 1.05 | 1 |
| Mizurappa | C | 10 | water L1 | ATK 0.95, AOE; hapus Burn pada diri | 1 |
| Suijinheki | B | 14 | water L2 | Wall 1; blokir penuh Katon | 1 |
| Suirō no Jutsu | B | 14 | water L2 | Bind 2; peluang lepas ×2 bila pengguna kena serangan (tangan terkunci) | 1 |
| Suiryūdan no Jutsu | B | 18 | water L2 | ATK 1.3, AOE | 1 |
| Suikōdan no Jutsu | B | 20 | water L3 | ATK 1.4, HIT 2 | 1 |
| Daibakufu no Jutsu | A | 36 | water L4 | Clash, AOE, Field air 3 | 1 |

### 3.7 Taijutsu (strong_fist) & Hachimon

| Jutsu | Rank | CP | Syarat | Efek | W |
|---|---|---|---|---|---|
| Konoha Senpū | D | 0 | strong_fist L1 | ATK 1.0 | 1 |
| Konoha Reppū | D | 0 | strong_fist L1 | ATK 0.8, Slow 1 (sapuan kaki) | 1 |
| Dynamic Entry | C | 0 | strong_fist L1 | Ambush atau ronde 1: ATK 1.3; selain itu 0.9 | 1 |
| Omote Renge | B | 6 | strong_fist L2 | ATK 1.4; HP −5, strain +3 (Gerbang 1) | 1 |
| Mode Hachimon G1–G5 | B | 0 | strong_fist L3 | Mode: power +6 per gerbang, HP −2 × gerbang per ronde | 1 |
| Ura Renge | A | 8 | Mode Gerbang ≥ 3 | ATK 1.7, HIT 2 | 1 |
| Asa Kujaku | A | 10 | Mode Gerbang ≥ 6 (L4) | ATK 1.8, HIT 5, Burn 1 (gesekan) | 2 |
| Hirudora | S | 14 | Mode Gerbang 7 (L4) | Clash, AOE, UNAV | 2 |
| **Gerbang Kematian: Sekizō / Yagai** | S | 0 | Gerbang 8 (L4), sekali seumur hidup | Clash ×2.5 yang hampir pasti menang. Setelah battle: 70% gugur, 30% cacat permanen (karier shinobi berakhir). | 3 |

### 3.8 Kenjutsu & Shurikenjutsu

| Jutsu | Rank | CP | Syarat | Efek | W |
|---|---|---|---|---|---|
| Iai Slash | D | 4 | kenjutsu L1 | ATK 0.9, PRC, fort −4 | 1 |
| Kunai Parry | D | 2 | kenjutsu L1 | Reflect 1 (hanya kenjutsu dan proyektil) | 1 |
| Chakra Blade (Hien) | B | 14 | kenjutsu L2 + wind L1 | ATK 1.25, PRC, Bleed 1 | 2 |
| Mikazuki no Mai | A | 24 | kenjutsu L3 | ATK 1.3, HIT 3 (dua clone ikut menebas), PRC | 1 |
| Kage Shuriken | C | 4 | shurikenjutsu L1 | ATK 0.9; dodge musuh × 0.5 (shuriken kedua tersembunyi) | 1 |
| Sōshōryū | B | 10 | shurikenjutsu L2 | ATK 0.6, HIT 6 | 1 |
| Sōfūsha San no Tachi | B | 16 | shurikenjutsu L2 + fire L1 | Bind 1 (kawat), lalu Burn 2 | 2 |

### 3.9 Genjutsu

| Jutsu | Rank | CP | Syarat | Efek | W |
|---|---|---|---|---|---|
| Magen: Narakumi | D | 6 | genjutsu L1 | Genjutsu 1 | 1 |
| Kori Shinchū | C | 8 | genjutsu L1 | Genjutsu 2 (ilusi lingkungan) | 1 |
| Magen: Kasegui | B | 14 | genjutsu L2 | Bind 2 sebagai genjutsu (Kai melepasnya) | 1 |
| Nehan Shōja | B | 16 | genjutsu L2 | AOE; musuh tidak bisa counter 1 ronde (tidur) | 1 |
| Magen: Jubaku Satsu | A | 20 | genjutsu L3 | Bind 2 + ATK 1.2 di ronde berikutnya | 1 |
| Kokuangyō | S | 34 | genjutsu L4 | Blind 3 + Genjutsu 2 | 1 |

### 3.10 Medical, Fūinjutsu, Barrier, Sensory, Trap

| Jutsu | Rank | CP | Syarat | Efek | W |
|---|---|---|---|---|---|
| Shōsen no Jutsu | C | 18 | medical L1 | Heal 15; hapus Bleed dan Poison | 1 |
| Chakra no Mesu | B | 14 | medical L2 | ATK 0.9, abaikan Guard, Slow 2 (otot terputus) | 1 |
| Ōkasho | A | 20 | medical L3 | ATK 1.6, pecahkan Wall | 1 |
| Byakugō no In | S | 40 | medical L4 | Mode 3 ronde: heal 10 per ronde, selamat dari 1 pukulan mematikan | 1 |
| Fūin Ward (Kekkai) | C | 16 | barrier L1 / fuinjutsu L1 | Guard 35% 2 | 1 |
| Fūka Hōin | B | 16 | fuinjutsu L2 | Tenketsu Seal 2 (ultimate dan bloodline musuh terkunci) | 1 |
| Gogyō Fūin | A | 24 | fuinjutsu L3 | Tenketsu Seal 3 + biaya ninjutsu musuh ×1.5 | 1 |
| Hakke no Fūin Shiki | S | 40 | fuinjutsu L4 | Clash; Tenketsu Seal 4 + Drain 30 | 1 |
| Kagura Shingan (sensory) | C | 6 | sensory L2 | Intel musuh 100, stealth dan ambush musuh tidak berlaku | 1 |
| Wire Trap (trap) | C | 6 | trap_craft L2 | Bind 1; ×2 bila dipasang saat prep | 1 |

### 3.11 Clone, Summoning, Space-Time, Puppetry, Senjutsu

| Jutsu | Rank | CP | Syarat | Efek | W |
|---|---|---|---|---|---|
| **Kage Bunshin no Jutsu** | **B (DB)** | 16 | shadow_clone L1 | Evade 0.4 + power +8 di ronde berikutnya | 1 |
| Bunshin Daibakuha | A | 22 | shadow_clone L3 | Evade 0.4; bila clone kena, ledakan ATK 1.3 AOE | 2 |
| Tajū Kage Bunshin (terlarang) | A | 35 | shadow_clone L3 + chakra ≥ 80 | Evade 0.6 + power +16 selama 2 ronde | 2 |
| Kuchiyose no Jutsu | B | 24 | kontrak / summoning | Efek klan summon yang sudah ada (toad, snake, slug, hound, hawk, ape) | 1 |
| Hiraishin no Jutsu | S | 30 | space_time L4 | Evade 1.0 untuk serangan berikutnya + serangan berikutnya UNAV; setup `markers` (pasang kunai saat prep) | 2 |
| Kugutsu no Jutsu | C | 10 | puppetry L1 | Self: Wall 1 (boneka menahan) + ATK 0.8 Poison 2 | 2 |
| Sennin Mode | S | — | senjutsu L4 | Mode (lihat 1.5) | 2 |

### 3.12 Hiden klan — Konoha

| Klan | Jutsu | Rank | CP | Efek | W |
|---|---|---|---|---|---|
| **Uchiha** | Mode Sharingan | — | upkeep | Lihat 2.3 | 2 |
| | Genjutsu: Sharingan | B | 10 | Butuh 3 tomoe. Genjutsu 2, mengabaikan peluang lepas pada ronde pertama | 2 |
| | Katon: Gōkakyū (Ritus Uchiha) | C | 10 | Menggantikan Gōkakyū biasa untuk Uchiha: Burn 3 | 2 |
| | Amaterasu (MS) | S | 40 | Burn 8/r tanpa batas waktu, tidak bisa dipadamkan Suiton. Eye strain +2 | 3 |
| | Tsukuyomi (MS) | S | 35 | Musuh kehilangan 2 exchange + 20 damage mental. Eye strain +2. MS musuh kebal | 3 |
| | Kamui (MS) | S | 30 | Intangible 1 tiap ronde selama aktif (upkeep 6), atau ATK 1.8 UNAV (warp). Eye strain +2 | 3 |
| | Susanoo (MS kedua mata) | S | mode | Lihat 1.5 | 3 |
| | Izanagi (terlarang) | S | — | Membatalkan kematian sekali. Mata itu buta permanen | 3 |
| **Hyūga** | Mode Byakugan | — | upkeep | Lihat 2.4 | 2 |
| | Jūken | C | 6 | ATK 0.8, Drain 8, abaikan Guard (serangan internal) | 2 |
| | Hakke Kūshō | B | 10 | ATK 1.0, PRC, jarak jauh | 2 |
| | Hakkeshō Kaiten | B | 14 | Reflect 1 + counter. Butuh mode Byakugan | 2 |
| | Hakke Rokujūyon Shō | A | 20 | HIT 64 (dihitung sebagai 1 hit), Drain 30, Tenketsu Seal 2. Butuh Byakugan `ctrl2` | 2 |
| | Hakke Hyakunijūhachi Shō | S | 28 | Drain 45, Tenketsu Seal 3. Butuh Byakugan `mastered` | 3 |
| | Jūho Sōshiken | A | 22 | Mode 3 ronde: Drain Jūken ×2 | 3 |
| **Nara** | Kagemane no Jutsu | B (TCG: A) | 12 | Bind 2 + upkeep 6 CP/r selama bind. Malam: −30% kecuali Flash Bomb. Game memakai B karena teknik ini dipakai Shikamaru sejak Genin. | 2 |
| | Kage Kubishibari | B | 16 | Butuh Bind aktif: 6 damage/r + power −10 | 2 |
| | Kage Nui | A | 20 | ATK 1.2, HIT 3, PRC, Bleed 1 | 2 |
| | Kagemane Shuriken | C | 8 | ATK 0.9; bila kena, Bind 1 | 2 |
| **Akimichi** | Mode Baika (Multi-Size) | C (TCG) | upkeep | Lihat 1.5 | 2 |
| | Nikudan Sensha | B | 10 | ATK 1.3, AOE. Butuh Baika | 2 |
| | Bubun Baika | B | 12 | Bind 1 (tangan raksasa menggenggam) | 2 |
| | Pil Tiga Warna (hijau, kuning, merah) | — | 0 | Hijau: +20 CP. Kuning: power +12 selama 2 ronde. **Merah**: Mode Kupu-kupu (power ×2 selama 3 ronde), lalu HP 1 + stamina −10 permanen kecuali dirawat medis. 1 per perang | 3 |
| **Yamanaka** *(klan baru)* | Shintenshin no Jutsu | C (NP) | 12 | Bila target Bind/Slow: musuh kehilangan 1 exchange dan melukai diri 15. Bila gagal: pengguna menerima ×1.5 damage ronde itu (tubuh tak berjaga) | 2 |
| | Shinranshin no Jutsu | B | 14 | Genjutsu 1 (musuh salah sasaran) | 2 |
| | Kanchi Denden (sensing transmission) | C | 6 | Intel 100 untuk diri dan partner | 2 |
| **Aburame** | Kikaichū no Jutsu | C | 8 | Drain 10/r selama 2 ronde | 2 |
| | Mushi Bunshin | C | 10 | Evade 0.4 | 2 |
| | Mushi Dama | B | 16 | Bind 2 + Drain 6/r. Musuh berelemen Katon: drain ×0.5 | 2 |
| | Pelacak serangga betina | D | 4 | Retreat musuh gagal otomatis pada battle ini | 2 |
| **Inuzuka** | Shikyaku no Jutsu | D | upkeep 3 | Mode: taijutsu FAST | 2 |
| | Gatsūga | C (NP) | 12 | ATK 1.2, HIT 2. Butuh ninken | 2 |
| | Garōga | A | 24 | ATK 1.7, AOE. Butuh ninken | 2 |
| | Penciuman Ninken | D | 0 | Stealth dan ambush musuh tidak berlaku (pasif) | 2 |
| **Sarutobi** | Katon: Haisekishō | B | 15 | Blind 1 + Burn 2 | 2 |
| | Hien (Futon Chakra Blade) | B | 14 | ATK 1.25, PRC, Bleed 1 | 2 |
| **Senju** *(klan baru)* | Mokuton: Mokujōheki | A | 22 | Wall 2 + Guard 20%. Butuh Mokuton | 2 |
| | Mokuton: Shichūrō | A | 24 | Bind 3 (rumus lepas memakai CR pengguna +1). Butuh Mokuton | 2 |
| | Mokuton: Jukai Kōtan | S | 42 | Clash, AOE, Bind 2. Bonus vs Calamity Crisis (sudah ada) | 3 |
| | Vitalitas Senju | — | pasif | +5 HP regen per battle dimenangkan | 2 |

### 3.13 Hiden klan — desa lain

| Klan | Jutsu | Rank | CP | Efek | W |
|---|---|---|---|---|---|
| **Sabaku / Kazekage** (Suna) | Jiton: Satetsu Shigure | B | 16 | HIT 5, Poison 2. Butuh Jiton | 2 |
| | Jiton: Satetsu Kaihō | A | 26 | ATK 1.5, AOE. Butuh Jiton | 2 |
| | Suna no Tate (perisai otomatis) | B | upkeep 4 | Mode: Guard 30% | 2 |
| | Sabaku Kyū → Sabaku Sōsō | A | 24 | Bind 2; Sōsō vs target ter-bind: ATK 1.6 | 2 |
| | *Catatan canon:* pasir Gaara berasal dari Shukaku, bukan bloodline. Di game, pasir menjadi hiden Sabaku. | | | | |
| **Shirogane** (Suna, canon) | Chakra Thread Ambush Matrix | B | 14 | Bind 1 + Poison 2 (boneka) | 2 |
| | Shiro Hiden: Jikki Chikamatsu | S | 40 | Clash, HIT 10, Poison 3 | 3 |
| **Hōzuki** (Kiri) | Mode Suika no Jutsu | B | upkeep | Lihat 1.5. Lemah terhadap Raiton | 2 |
| | Mizudeppō | C | 8 | ATK 1.1, FAST, PRC | 2 |
| | Gōsuiwan | B | 12 | ATK 1.35 (lengan air raksasa) | 2 |
| **Hoshigaki** (Kiri) | Daikōdan no Jutsu | A | 26 | ATK 1.6, menyerap 10 CP musuh | 2 |
| | Bakusui Shōha | A | 24 | Field air 3 (Suiton +30%) + ATK 1.1 AOE | 2 |
| **Yuki** (Kiri) | Hyōton: Sensatsu Suishō | B | 16 | HIT 5, Bleed 1. Butuh Hyōton | 2 |
| | Hyōton: Hyōrō | B | 18 | Bind 2. Butuh Hyōton | 2 |
| | Mode Makyō Hyōshō | S (TCG) | upkeep | Lihat 1.5. Katon biasa tidak melelehkan cermin | 2 |
| **Terumi** (Kiri, orisinal) | Yōton: Yōkai no Jutsu | A | 22 | Asam: pecahkan Wall dan Guard + Burn 2. Butuh Yōton | 2 |
| | Futton: Kōmu no Jutsu | A | 22 | Field kabut korosif: 5 damage/r selama 3 ronde ke musuh | 2 |
| **Kaguya** *(klan baru, Kiri)* | Tsubaki no Mai | B | 12 | ATK 1.2, PRC. Butuh Shikotsumyaku | 2 |
| | Yanagi no Mai | B | 12 | Reflect 1 + Bleed ke penyerang | 2 |
| | Karamatsu no Mai | A | 18 | Guard 40% 2 + counter 6 | 2 |
| | Tessenka no Mai | A | 24 | ATK 1.6, PRC | 2 |
| | Sawarabi no Mai | S | 40 | Clash, AOE, Bind 2. Strain +6 (canon: penyakit Kimimaro) | 3 |
| **Yotsuki** (Kumo, orisinal) | Mode Raiton no Yoroi | A | upkeep | Lihat 1.5 | 2 |
| | Double Lariat | A | 22 | ATK 1.7. Butuh partner Yotsuki atau partner berelemen Raiton | 3 |
| **Chinoike** (Kumo) | Ketsuryūgan (mode) | — | upkeep 3 | Genjutsu musuh +1 ronde, Bind darah: Bleed → Bind | 2 |
| | Ketsuryūgan Crimson Trance | B | 14 | Genjutsu 2 + Bleed 1 | 2 |
| **Kamizuru** (Iwa) | Thousand Bee Stings | B | 14 | HIT 4, Poison 2 | 2 |
| | Golden Honey Seal Prison | A | 20 | Bind 2 + Drain 6 | 2 |
| **Uzumaki** (Uzushio) | Kongō Fūsa | A | 24 | Bind 3; hanya lepas bila CR target ≥ CR pengguna + 1.5. Bonus vs Calamity | 2 |
| | Shishō Fūin | A | 22 | Tenketsu Seal 3 | 2 |
| | Kagura Shingan & gigitan penyembuh | C | 8 | Partner heal 15, pengguna HP −8 | 2 |
| | Chakra Uzumaki | — | pasif | CP maksimal +20 | 2 |
| | Shiki Fūjin (terlarang) | S | 60 | Target pasti tersegel (menang). Pengguna gugur setelah battle | 3 |
| **Klan orisinal lain** (Kazekawa, Kaminari, Ishikawa, Iwagane, Amegumo, Kinuta, Takigawa, Kusano, Tachibana, Tazuna) | Setiap `ClanHidenArt` yang ada dikonversi 1:1 menjadi `JutsuDefinition` dengan role sesuai `desc`-nya. Contoh: *Doton: Added-Weight Rock* (Ishikawa) → Slow 2. *Detonating Clay* (Iwagane) → ATK AOE. *Iaido: Instant Seal Severance* (Tachibana) → FAST PRC + Tenketsu Seal 1 | B/A | — | — | 2 |

### 3.14 Ringkasan jumlah

| Gelombang | Isi | ± Jumlah |
|---|---|---|
| 1 | Akademi, 5 elemen, taijutsu, kenjutsu, shuriken, genjutsu, medical/fuin/sensory/trap, clone/summon | 73 |
| 2 | Mode dōjutsu dan tubuh, hiden klan, kekkei genkai | 71 (+ ±20 hiden klan orisinal yang dikonversi) |
| 3 | Mangekyō, Gerbang 8, Kirin, teknik terlarang | 16 |
| **Total** | | **160 baris + ±20 konversi** |

---

## Bagian 4 — Integrasi dengan combat plan

1. **Fase 4 di combat plan** (database awal 31 entri) menjadi Gelombang 1 versi lama. Entri lama dimigrasi ke Effect Model v2.
2. **Hapus fallback generik** di `getKnownJutsu` (`jutsu.ts:630–679`):
   - `secret_art_*` diganti entri nyata: Kokuangyō, Hakke no Fūin Shiki, Byakugō, Hiraishin, Hachimon, Sennin Mode.
   - "`<Bloodline>` Secret Release" diganti teknik spesifik per bloodline (Bagian 3.12–3.13).
3. **Hiden:** `ClanHidenArt` mendapat `jutsuIds: string[]`. Membuka hiden di `clan-heritage.ts:331` berarti membuka jutsu itu. `getUnlockedHidenCombatBonus` dihapus, beserta pemakaiannya di `combat.ts`.
4. **Fase 8 (NPC memilih jutsu)** adalah prasyarat untuk Copy Sharingan dan status pada pemain. Roster NPC perlu `clanId` agar dōjutsu NPC konsisten. Contoh: rogue_s dengan skill "Crimson Eye Read" harus berstatus Uchiha.

---

## Kebijakan Angka
Semua CP, power, durasi, magnitudo status dan peluang lahir di dokumen ini **posture B**. Gagal tes → arah perbaikan:

| Gejala (diukur Monte Carlo) | Langkah |
|---|---|
| Satu jutsu dipakai > 40% oleh policy optimal di semua matchup | Naikkan CP-nya atau turunkan power 10% |
| Bind terlalu kuat (win rate pengguna bind > +15 poin vs non-bind setara) | Naikkan konstanta 0.25 di rumus lepas |
| Status tak pernah dipilih policy optimal | Naikkan magnitudo atau durasi +1 |
| Uchiha atau Hyūga > 65% win rate di cermin jonin vs jonin non-klan | Turunkan efek mode per stage |
| Eye strain tidak pernah mencapai buta dalam 1 hidup | Naikkan strain per teknik dari +2 ke +3 |

---

## Acceptance Tests

### `tests/clan-gating.test.ts`
1. 5.000 kelahiran seeded:
   - 0 Sharingan di luar Uchiha, 0 Byakugan di luar Hyūga.
   - 100% Hyūga ber-Byakugan.
   - Uchiha pembawa Sharingan 60–80%.
2. Setiap `clan.bloodlineId` ada di `BLOODLINE_MAP`. Ini menangkap bug `magnet_release`.
3. Custom build dengan bloodline yang tidak cocok dengan klan ditolak.
4. Jutsu `hiden` tidak muncul di `getKnownJutsu` untuk non-klan, meski discipline-nya terpenuhi.
5. Gentle Fist tidak bisa dimiliki non-Hyūga.

### `tests/jutsu-effects.test.ts`
1. **Data:**
   - Setiap entri punya `ref`.
   - Semua `seals` valid terhadap `ZODIAC_SEAL_KANJI`.
   - Jutsu ninjutsu atau genjutsu yang bukan mode punya ≥ 1 seal, kecuali yang tercatat tanpa segel (Rasengan, Chidori setelah dikuasai).
2. **Tiap status:**
   - Diterapkan saat kena, tidak diterapkan saat dodge.
   - Berkurang sesuai durasi.
   - Counter-nya menghapus status.
3. **Interaksi dari matriks 1.6:**
   - Raiton vs Intangible.
   - Suiton Wall vs Katon.
   - Kai vs Genjutsu.
   - Sharingan 2 tomoe kebal genjutsu C.
   - Kagemane malam tanpa Flash Bomb.
4. **Mode:**
   - Upkeep terpotong tiap ronde, dan mode mati di CP 0.
   - Gerbang 8 → status pasca-battle gugur atau cacat.
5. **Bind dan power gap:** Genin yang mem-bind S-class lepas ≥ 80% per ronde. Jonin vs jonin sekitar 25%.
6. **Monte Carlo keseimbangan** (memakai harness `tests/power-scaling.test.ts`): tidak ada satu jutsu pun yang dipakai > 40% oleh policy optimal.

### Cek di browser
1. **Uchiha:** aktifkan Sharingan. Upkeep terlihat, dan intel musuh naik.
2. **Hyūga:** Byakugan aktif sejak lahir dan Kaiten memantulkan serangan.
3. **Nara di battle malam:** Kagemane menampilkan peringatan cahaya.
4. **Sipil:** tidak pernah ada opsi Sharingan atau Byakugan.

---

## Referensi (Narutopedia, diakses 2026-11-26)
- Klan dan kekkei genkai: Clans · Hiden · Kekkei Genkai · Nature Transformation
- Uchiha: Sharingan · Mangekyō Sharingan · Uchiha Clan
- Hyūga: Byakugan
- Nara: Shadow Imitation Technique · Nara Clan
- Akimichi: Multi-Size Technique
- Yamanaka: Mind Body Switch Technique · Yamanaka Clan
- Aburame: Aburame Clan
- Inuzuka: Fang Passing Fang
- Kekkei genkai lain: Wood Release · Ice Release · Demonic Mirroring Ice Crystals · Lava Release · Shikotsumyaku · Hydrification Technique · Uzumaki Clan
- Teknik umum: Chidori · Shadow Clone Technique · Eight Gates

URL dasar: `https://naruto.fandom.com/wiki/<Nama_Halaman>`.
