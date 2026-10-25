# Milestone Rewrite Sequel Ace dengan Go

Status: milestone 0 selesai. Implementasi milestone 1 dan CI sudah lulus;
manual QA GUI Windows/Linux masih terbuka sebelum milestone 1 dinyatakan selesai.
Repo: https://github.com/AdityaArgadinata/sequel-ace-rewrite.
Run terverifikasi: https://github.com/AdityaArgadinata/sequel-ace-rewrite/actions/runs/39896410477
(commit kode `b4b5fc3`, kelima job lulus dan diverifikasi 2026-10-23).
Mencakup perubahan styling, layout workspace, Structure, diagnostik koneksi
serta shortcut yang terkumpul. Build/test bukan bukti kesetaraan visual.

## Ringkasan progres — 2026-10-23

Status di bawah mengikuti source lokal terbaru. Catatan CI pada bagian historis
berlaku untuk commit/run yang disebutkan; perubahan lokal terakhir belum
diverifikasi ulang di CI tiga OS. Build/test bukan bukti seluruh GUI sudah setara.

| Milestone | Status | Sisa pekerjaan |
| --- | --- | --- |
| 0 — Fondasi dan CI | Fondasi tersedia; CI historis lulus | Verifikasi perubahan terbaru di CI tiga OS saat diinstruksikan |
| 1 — Alur query pertama | Koneksi dan query dasar tersedia | Smoke test GUI Windows dan Ubuntu |
| 1A — Kesetaraan GUI Sequel Ace | Sedang dikerjakan; sorting header, edit sel dan filter per baris tersedia | Detail visual/interaksi, light mode, ikon asli, overlay, GUI Windows/Linux |
| 2 — Penggunaan harian | Profil, vault OS, SSH, tab, Query Favorites, history SQL opt-in dan browser tabel tersedia | QA GUI Windows/Linux dan batas fitur pada backlog di bawah |
| 3 — Pengubahan data | Insert/edit/delete InnoDB dan MyISAM tersedia | QA GUI lengkap tiga OS, konflik, transaksi dan kegagalan koneksi |
| 4 — Struktur dan pertukaran data | Dasar tersedia: editor schema, object manager, transfer dan migrasi native | Fitur native lanjutan, QA lintas OS/server dan batas dukungan di bawah |
| 5 — Beta Windows/Linux | Sebagian persiapan paket tersedia | Instalasi bersih, QA native, signing/notarization dan keputusan rilis |

**Instruksi rilis:** build/upload/publikasi GitHub Release ditunda sampai pengguna
meminta secara eksplisit. Build app lokal untuk pengujian dev tetap diperbolehkan.
Catatan draft/paket lama pada dokumen ini adalah riwayat, bukan izin rilis baru.

## Tujuan dan keputusan awal

Membangun aplikasi desktop pengelola MySQL/MariaDB yang dapat digunakan di
Windows dan Linux. macOS tetap didukung agar pengembangan dan pengujian harian
dapat dilakukan dari laptop Mac.

- Implementasi dilakukan di repo baru. Repo ini menjadi referensi perilaku,
  fitur, SQL, dan kasus pengujian; aplikasi macOS yang ada tetap terpisah.
- Target GUI sesuai permintaan pengguna: sama persis dengan Sequel Ace asli
  pada area aplikasi yang dibangun ulang. GUI sekarang masih prototipe fungsional
  dan belum memenuhi target visual tersebut. Milestone 1A tetap terbuka; atas instruksi berikutnya, implementasi milestone 2
  dilanjutkan tanpa mengklaim kesetaraan visual sudah selesai.
- Stack awal: Go untuk mesin database, Wails untuk desktop, serta React dan
  TypeScript untuk UI. Versi dependensi dipilih dan dikunci saat inisialisasi.
- Target awal: macOS pada arsitektur laptop pengembang, Windows x64, dan
  Ubuntu 24.04 LTS x64. Distro dan arsitektur lain belum termasuk dukungan awal.
- Fokus awal hanya MySQL/MariaDB. PostgreSQL dan kesetaraan seluruh fitur
  Sequel Ace berada di luar cakupan rilis pertama.
- Matriks server awal: MySQL 8.4 dan MariaDB 11.4 (integration test CI lulus).
  MySQL 5.7.44 juga diuji lokal; dukungan versi lain belum diklaim.
- Pertahankan atribusi dan pemberitahuan lisensi untuk materi yang digunakan
  kembali; periksa lisensi dependensi dan aset sebelum didistribusikan.

## Milestone 0 — Fondasi proyek dan CI tiga OS

- [x] Buat repo baru dengan Go, Wails, React, dan TypeScript.
- [x] Pisahkan UI, adapter desktop, dan logika database di `internal/database`.
- [x] Dokumentasikan versi toolchain, dependensi OS, target arsitektur, dan
  matriks versi server yang akan diuji.
- [x] Buat jendela aplikasi minimal yang berjalan di Mac. Build produksi dan
  tombol bridge Go terverifikasi pada darwin/arm64.
- [x] Siapkan workflow GitHub Actions untuk test dan build pada macOS, Windows,
  dan Ubuntu (lulus pada ketiga OS).
- [x] Unggah hasil build tiap OS sebagai artifact CI yang bisa diunduh.
- [x] Dokumentasikan cara menjalankan aplikasi dan membaca hasil CI dari Mac.

**Selesai jika:** checkout baru bisa dibangun dengan instruksi yang tersedia,
CI ketiga OS hijau, dan aplikasi dapat dibuka di Mac. Artifact Windows/Linux
tersedia; status uji GUI keduanya dicatat terpisah dari keberhasilan build.

## Milestone 1 — Alur query pertama

- [x] Koneksi MySQL melalui TCP, dengan timeout dan TLS yang memverifikasi
  sertifikat secara default; dukung CA khusus.
- [x] Pilih database dan tampilkan daftar tabel.
- [x] Sediakan editor untuk menjalankan satu statement SQL.
- [x] Tampilkan kolom, hasil query, durasi, jumlah baris yang dimuat, serta error.
- [x] Batasi hasil menjadi 500 baris / 4 MiB isi sel dan tampilkan status terpotong.
- [x] Kirim hasil bertahap ke UI: baris pertama segera, lalu batch hingga 50
  baris / pemicu 64 KiB atau 100 ms saat pembacaan berlangsung. ID query dan
  offset mencegah pencampuran event; snapshot akhir menjadi acuan.
- [x] Sediakan cancel dan jelaskan keadaan sesi setelah pembatalan/koneksi putus.
- [x] Pastikan satu tab query menggunakan sesi yang jelas untuk `USE`, variabel
  session, temporary table, dan transaksi; jangan berganti koneksi pool diam-diam.
- [x] Pertahankan nilai `NULL`, integer besar, `DECIMAL`, binary, dan tanggal
  tanpa kehilangan presisi saat melintasi batas Go–TypeScript.
- [x] Siapkan integration test dan workflow Linux CI untuk MySQL 8.4/MariaDB 11.4
  (MySQL 8.4 dan MariaDB 11.4 lulus di GitHub Actions).
- [x] Uji alur koneksi, query, error, cancel, dan batas hasil secara otomatis
  pada MySQL 5.7.44 lokal terisolasi, termasuk TLS dan race detector;
  integration test dengan race detector juga lulus pada MySQL 8.4/MariaDB 11.4 di CI.

- [x] Smoke test GUI macOS arm64: koneksi TLS, pilih database/tabel, hasil query,
  streaming, cancel, dan reconnect setelah cancel.
- [ ] Smoke test GUI Windows x64: startup → koneksi → database/tabel → query →
  hasil bertahap → cancel → reconnect; catat versi Windows dan hasilnya.
- [ ] Smoke test GUI Ubuntu 24.04 x64: startup → koneksi → database/tabel → query →
  hasil bertahap → cancel → reconnect; catat lingkungan desktop dan hasilnya.

**Selesai jika:** alur connect → pilih database/tabel → query → hasil → cancel
berjalan di Mac, build tiga OS hijau, dan integration test MySQL/MariaDB lulus.
Lakukan smoke test GUI pertama pada Windows dan Ubuntu melalui VM, remote
desktop, atau tester; catat OS/arsitektur dan hasilnya.

## Milestone 1A — Kesetaraan GUI dengan Sequel Ace asli

Status: sedang dikerjakan. Layout awal layar koneksi dan Query sudah dibangun,
belum identik dengan aplikasi asli. Referensi dan perbedaan dicatat di
`docs/gui-parity.md`; penomoran milestone lain tetap.

- [x] Inspeksi layar koneksi Sequel Ace 5.0.9 dan XIB source `a82ae6c30`;
  catat susunan toolbar/workspace awal tanpa memublikasikan data pengguna.

- [ ] Jalankan Sequel Ace asli dari versi/commit referensi yang dicatat dan ambil
  screenshot layar koneksi, Content, Structure, dan Query pada ukuran jendela
  serta skala tampilan yang sama. Catat referensi light/dark yang tersedia.
- [ ] Inventarisasi layout dan interaksi: sidebar favorites/koneksi, pemilih
  database, daftar tabel, toolbar, tab tampilan, editor SQL, hasil query, filter,
  status bar, panel detail, menu konteks, dan shortcut.
- [x] Bangun layout awal layar koneksi vertikal dan sidebar favorites berdasarkan
  referensi; profil, simpan/pilih ulang, dan koneksi TLS teruji di desktop Mac.
  Kesetaraan detail visual tetap mengikuti checklist di bawah.
- [x] Bangun kerangka workspace utama: posisi sidebar, toolbar, tab Content,
  Structure, Query, dan tampilan lain yang ada pada referensi. Tab yang fiturnya
  belum dibangun harus terlihat tidak tersedia, bukan berpura-pura berfungsi.
- [x] Terapkan metrik ConnectionView.xib: sidebar awal 200 px pada lebar
  1200 px, label 98 px, input 247×22 px, dan jarak field. Ukuran default
  jendela menjadi 1200×710. Toolbar Mac 52 px menyatu dengan title bar;
  render awal dan aksesibilitas kontrol diverifikasi pada salinan build.
  Tab sesi diposisikan di bawah toolbar; belum diuji pada sesi aktif.
- [x] Terapkan palet semantic AppKit Aqua/Dark Aqua untuk surface, teks,
  separator, stripe, selection aktif/nonaktif, dan focus ring; konfirmasi font
  sistem 13 pt/label kecil 11 pt. Grid angka rata kanan tanpa konversi nilai.
  Ikon SVG sendiri mengikuti nama simbol toolbar di source; bukan salinan
  artwork Apple. Render dark koneksi, 4 test frontend, unit Go, dan build Mac
  lulus. Rincian warna, provenance, lisensi dan batas ada di docs/gui-parity.md.
- [x] Petakan DBView.xib/ContentPaginationView.xib ke komponen workspace
  (`docs/source-ui-map.md`): aksi Content di bawah grid, filter toggle,
  action strip Query berukuran acuan XIB, sidebar tabel awal 214 px dan label
  Structure. Transaksi dipindah ke status bar dengan status tetap terlihat.
  Test/build lulus; smoke test workspace terhalang error frame CUA dan belum
  dihitung sebagai verifikasi visual atau interaksi.
- [x] Terapkan detail tabel Structure dari DBView.xib: lebar awal kolom,
  urutan Indexes, checkbox Allow Null read-only, action strip 25 px dan pesan
  kosong khusus metadata. Schema write tetap disabled. Test lossless reorder
  memverifikasi header/nilai, NULL, kolom tambahan dan input tidak berubah.
  Render desktop detail ini belum diverifikasi; kesetaraan penuh masih terbuka.
- [ ] Samakan warna, ukuran/proporsi, jarak, tipografi, ikon, border, selection,
  hover, focus, dan keadaan disabled dengan aplikasi asli; periksa lisensi aset
  sebelum digunakan kembali.
- [x] Pasang editor SQL, tabel hasil, streaming, cancel, dan status sesi yang sudah
  berfungsi ke layout baru; smoke test fixture Mac memverifikasi hasil, streaming,
  shortcut Cmd+Enter, dan cancel kembali ke favorites.
- [x] Tambahkan splitter sidebar Favorites/Tables dan tinggi editor SQL dengan
  drag, tombol panah, Home/End, batas ukuran, serta atribut aksesibilitas.
  Test otomatis perhitungan ukuran/keyboard dan build desktop Mac lulus.
  Smoke test Mac memverifikasi drag sidebar 15% → 25%, panah 17% → 18%,
  Home 15%, dan End 35%. Ini belum membuktikan kesetaraan splitter asli.
- [ ] Uji splitter editor dan sidebar Tables pada sesi database aktif serta
  jendela minimum; verifikasi interaksi di Windows/Linux.
- [x] Tambahkan interaksi grid bersama: klik/panah/Home/End untuk baris,
  resize kolom dengan pointer/keyboard (48–800 px), dan menu salin sel/baris.
  Empat test frontend, build produksi dan desktop Mac lulus; smoke test Mac
  memverifikasi klik/panah dan salin DECIMAL `123.4500` tetap utuh.
  Kesamaan dengan seluruh interaksi asli dan QA resize manual belum terbukti.
- [x] Susun Columns dan Indexes Structure secara bertumpuk dengan splitter;
  Foreign keys dan CREATE statement tetap tersedia. Build TypeScript/Mac lulus;
  smoke test fixture Mac memverifikasi empat kolom, PRIMARY index, dan
  splitter keyboard 60% → 61%. Detail kolom native dan kesetaraan visual
  panel masih terbuka.
- [x] Terapkan shortcut dari MainMenu.xib untuk fitur tersedia: ⌘1/2/6
  (Structure/Content/Query), ⌘R (Content/Structure), ⌘F dan ⌥⌘F (filter Content).
  Windows/Linux memakai Ctrl; repeat/IME/modifier tambahan diabaikan. Busy,
  editor baris dan konfirmasi delete tetap mengunci refresh/filter. Shortcut
  hanya ditangani workspace fokus, tanpa listener global pada tab tersembunyi.
  Tujuh test frontend, unit Go dan build Mac lulus; smoke test desktop belum.
- [x] Verifikasi CI seluruh perubahan GUI dan shortcut terbaru: run
  `39896410477` (`b4b5fc3`) lulus desktop macOS 15, Windows Server 2022,
  Ubuntu 24.04, serta integration MySQL 8.4/MariaDB 11.4. Artifact tiga OS
  berhasil diunggah. GUI/overlay dan pengiriman shortcut native belum diuji.
- [x] Tambahkan menu grid melalui Shift+F10/tombol Context Menu, navigasi
  panah/Home/End, Escape dengan fokus kembali ke grid, dan ⌘/Ctrl+C untuk
  menyalin baris terpilih. Event input/editor tidak diambil alih. Delapan test
  frontend, unit Go dan build Mac lulus; delivery keyboard/clipboard native
  terbaru belum diuji langsung.
- [x] Bersihkan 60 deklarasi CSS yang tertimpa dan 3 selector tidak terpakai.
  Pemeriksaan PostCSS mempertahankan deklarasi efektif per selector/media/
  property sebelum menghapus style elemen yang sudah tidak dirender.
  Ini pemeliharaan stylesheet, bukan bukti kesamaan visual tambahan.
- [ ] Ikuti alur keyboard, pemilihan tabel/baris, resizing panel/kolom, serta
  menu konteks aplikasi asli untuk fitur yang sudah diimplementasikan.
- [ ] Bandingkan screenshot berdampingan atau dengan overlay pada ukuran/skala
  sama, termasuk keadaan kosong, loading, error, terhubung, dan hasil query.
  Catat selisih dan perbaiki sebelum mencentang kesetaraan visual.
- [ ] Verifikasi tampilan dan interaksi pada Windows dan Ubuntu; catat perbedaan
  title bar/bingkai jendela, rendering font, dan dialog bawaan OS yang tidak dapat
  identik. Perbedaan tersebut harus terdokumentasi dan disetujui pengguna.
- [x] Jalankan regresi koneksi, profil, query, streaming, dan cancel pada fixture
  desktop Mac serta build/test tiga OS setelah penggantian UI. CI `ff149bd`
  lulus di macOS/Windows/Ubuntu; integration test MySQL 8.4/MariaDB 11.4 lulus.
  Ini tidak mencentang pemeriksaan visual GUI Windows/Linux di atas.

**Selesai jika:** area aplikasi yang diimplementasikan cocok dengan referensi
Sequel Ace asli dan alurnya terverifikasi. Setiap selisih visual/interaksi harus
dicatat, bukan dianggap selesai hanya karena fitur bekerja. Milestone ini tidak
mengklaim seluruh fitur Sequel Ace sudah tersedia; fitur yang belum dibangun tetap
mengikuti checklist milestone terkait. GUI Windows/Linux belum dianggap identik
sebelum dibandingkan langsung pada OS tujuan.

## Milestone 2 — Penggunaan harian

- [x] Simpan, ubah, dan hapus profil koneksi tanpa password di file konfigurasi.
  Unit test CRUD/restart, file rusak, validasi CA, write failure, dan race detector
  lulus lokal. Smoke test GUI macOS: simpan, ubah, pilih setelah restart, password
  kosong, serta batal hapus. Penghapusan berhasil diuji melalui unit test store.
  Test profil, build, dan vet lulus pada macOS/Windows/Ubuntu di CI;
  regresi MySQL 8.4/MariaDB 11.4 juga lulus. GUI Windows/Linux belum diuji langsung.
- [x] Simpan rahasia melalui credential store masing-masing OS; jika tidak
  tersedia, minta password saat koneksi tanpa menyimpannya sebagai plaintext.
- [x] Tambahkan SSH tunnel dengan validasi host key dan autentikasi key/password.
- [x] Tambahkan beberapa tab query dengan kepemilikan sesi dan cleanup yang jelas.
- [x] Tambahkan history lokal; hindari pencatatan password/token dan sediakan
  penghapusan history karena teks SQL dapat mengandung data sensitif.
- [x] Tambahkan browser isi tabel dengan pagination, sorting, dan filter.
- [x] Quote identifier dengan benar dan gunakan parameter untuk nilai filter.
- [x] Tangani disconnect dan reconnect tanpa mengulang query pengubah data
  secara otomatis atau menganggap sesi lama masih berlaku.

Implementasi milestone 2 (2026-10-21):

- Credential bundle (password database/SSH dan key passphrase) hanya masuk vault
  OS atas pilihan pengguna; terikat fingerprint profil agar perubahan host/user
  tidak memakai password lama. Load/forget tersedia eksplisit. Tidak ada fallback
  plaintext. Native Keychain dummy round-trip/delete lulus; error vault diuji.
- SSH password dan private key terenkripsi teruji pada server loopback, termasuk
  forwarding MySQL dengan TLS. `known_hosts` wajib valid; host asing dan password
  salah ditolak. Tidak ada trust-on-first-use otomatis, agent, atau keyboard-interactive.
- Maksimum 16 tab dengan koneksi terpisah. Variabel, database aktif, temporary
  table dan transaksi tidak bercampur. Tutup tab membuang sesi; cancel di satu
  tab tidak memutus tab lain. Credential workspace hanya disimpan di memori
  hingga semua tab ditutup; tab baru membuka koneksi baru secara eksplisit.
- History opt-in menyimpan 100 metadata eksekusi terakhir di `history.json`:
  waktu, jenis statement dari allowlist, jumlah baris, durasi dan status. Teks SQL,
  nilai filter, nama koneksi/database dan pesan error tidak disimpan. Karena itu
  history tidak menyediakan replay SQL. Clear/retensi/file rusak diuji otomatis.
- Content read-only mendukung halaman 25/50/100/200 baris, sorting satu kolom,
  filter perbandingan/contains/NULL. Identifier di-quote dan nilai di-bind;
  `%`, `_`, `!` diperlakukan literal untuk contains. Pagination offset dapat
  bergeser saat data berubah; pilih kolom unik untuk urutan stabil.
- GUI Mac fixture TLS: halaman 50 + 46 baris, sort ID, filter `50%_!`, dua tab
  dengan database/variabel/editor terpisah, serta panel history metadata lulus.
  Test unit/integration/race lokal, TLS, Go vet dan frontend build lulus.

- [x] Verifikasi CI terbaru pada macOS/Windows/Ubuntu, termasuk native vault
  Windows Credential Manager dan Linux Secret Service. Run `39549139051`,
  commit `62c4750`: kelima job lulus; artifact desktop tiga OS tersedia.
- [ ] Manual QA GUI milestone 2 di Windows dan Ubuntu: profil/password, SSH,
  tab, history, pagination/filter, cancel dan penutupan aplikasi.

**Selesai jika:** profil, credential store, SSH, tab, dan pagination dapat
dipakai berulang tanpa kebocoran koneksi. Pengujian otomatis lulus dan fitur
khusus OS sudah dicoba pada Windows serta Ubuntu.

## Milestone 3 — Pengubahan data yang aman

- [x] Tambahkan insert, edit, dan delete pada browser tabel.
- [x] Batasi edit/delete awal pada tabel dengan primary key, termasuk composite key.
- [x] Jadikan hasil yang identitas barisnya ambigu sebagai read-only.
- [x] Gunakan parameter untuk nilai dan validasi/quote identifier.
- [x] Sediakan konfirmasi delete dan tampilkan hasil jumlah baris terpengaruh.
- [x] Deteksi data berubah sejak dimuat sebelum menimpa/menghapusnya; uji dengan
  dua sesi yang mengubah baris sama.
- [x] Sediakan begin/commit/rollback pada sesi query, dengan status transaksi
  terlihat dan penanganan disconnect yang tidak mengklaim rollback/commit sukses.
- [x] Tambahkan integration test untuk composite key, `NULL`, karakter khusus,
  konflik perubahan, rollback, dan kegagalan koneksi saat write.

**Selesai jika:** insert/edit/delete memengaruhi baris yang dimaksud, konflik
ditampilkan, dan kegagalan tidak menyebabkan pengulangan write tanpa persetujuan.
Uji manual alur perubahan data terhadap server pengujian pada ketiga OS.

Implementasi terbaru: tabel dasar InnoDB dan MyISAM dengan primary key (termasuk
composite) editable. View, tabel tanpa PK, engine lain dan tabel dengan invisible
columns tetap read-only. MyISAM memakai table write lock, tersimpan segera,
dan ditolak ketika transaksi managed aktif; rincian pada pembaruan dev lokal.
Snapshot seluruh kolom dibandingkan byte-exact dengan NULL-safe predicate;
nilai di-bind, identifier di-quote. Metadata lock menahan schema selama validasi
hingga write selesai. Write di luar transaksi UI memakai transaksi pendek;
write di transaksi UI menunggu Commit/Rollback. Generated column tidak ditulis.
Konflik/no-op meminta reload, bukan retry otomatis. Hasil write yang tak dapat
dikonfirmasi tidak dilaporkan sukses. SQL manual membuat status unverified;
selesaikan melalui Commit/Rollback sebelum row editor/Begin. Dalam transaksi
terkelola, DDL/CALL/statement transaksi manual ditolak untuk menghindari implicit commit.

- [x] Verifikasi CI terbaru tiga OS dan integration MySQL 8.4/MariaDB 11.4.
  Run 39745002743 (`ab5e712`) selesai: kelima job lulus, termasuk Ubuntu.
- [ ] Manual QA GUI insert/edit/delete, konflik dan transaksi pada tiga OS.

## Milestone 4 — Struktur dan pertukaran data

- [x] Tampilkan struktur kolom, index, primary key, dan foreign key.
  Tab Structure juga menampilkan default/comment/generated expression, prefix
  index, urutan composite FK, aturan ON UPDATE/DELETE, serta CREATE statement.
  Metadata berparameter dan read-only; metadata terpotong tidak diklaim lengkap.
  Unit/integration MySQL 5.7.44 lokal, frontend build dan build desktop Mac lulus.
- [x] Verifikasi CI perubahan Structure pada tiga OS dan dua database.
  Run `39748176141` (`81b6f11`): kelima job lulus, termasuk assertion MariaDB
  yang diperbaiki. Perubahan layout Structure berikutnya baru diuji lokal.
- [ ] Manual QA GUI Structure pada tiga OS.
- [x] Tambahkan export CSV secara streaming dengan penanganan tipe dan encoding.
  Export seluruh tabel tanpa batas 500 baris UI, buffering satu baris; UTF-8
  Sequel CSV v1 membedakan NULL/empty/binary/backslash dan mempertahankan angka
  sebagai teks. File sementara baru dipublikasikan setelah selesai, tanpa overwrite.
  Unit/integration lokal menguji 2.048 baris, presisi, escape, writer failure,
  cancel, batas baris, cleanup dan race tujuan file. Round-trip CSV/SQL ditambahkan pada Prioritas 4; lihat validasi terbaru di bawah.
- [x] Verifikasi CI export CSV: run `39748176141` (`81b6f11`) lulus pada
  macOS, Windows, Ubuntu, MySQL 8.4, dan MariaDB 11.4.
- [ ] Verifikasi dialog file/hasil export CSV di GUI tiga OS.
- [x] Tambahkan import CSV dengan preview pemetaan kolom dan laporan kegagalan;
  jelaskan jika operasi hanya selesai sebagian.
- [x] Tambahkan importer favorites Sequel Ace untuk subset TCP/SSH yang didukung
  menggunakan fixture format lama; password Keychain tidak dianggap ikut pindah.
- [x] Eksekusi script tersedia pada Query dan import dump terpisah;
  parser harus menangani komentar, string, dan delimiter, bukan split `;` sederhana.

**Selesai jika:** fitur yang dipilih lulus pengujian round-trip dan data besar
tanpa memuat seluruh dataset ke memori. Fitur yang ditunda dicatat eksplisit.

## Milestone 5 — Beta Windows dan Linux

- [ ] Siapkan paket distribusi dan petunjuk pemasangan untuk Windows x64 dan
  Ubuntu 24.04 x64, termasuk kebutuhan WebView/runtime.
- [ ] Uji pemasangan pada lingkungan bersih tanpa toolchain pengembang.
- [ ] Uji startup, koneksi TLS/SSH, credential store, file dialog, clipboard,
  shortcut, scaling tampilan, cancel, dan penutupan aplikasi pada OS tujuan.
- [ ] Jalankan regresi MySQL/MariaDB sesuai matriks versi yang didukung.
- [ ] Periksa bahwa log dan artifact diagnostik tidak membocorkan rahasia.
- [ ] Catat versi OS, arsitektur, versi aplikasi, pemeriksa, dan hasil manual QA.
- [ ] Dokumentasikan batas dukungan, masalah yang diketahui, serta keputusan
  code signing dan cara distribusi sebelum menerbitkan beta.

**Selesai jika:** artifact telah dicoba langsung pada Windows dan Ubuntu,
tidak ada masalah kritis pada alur utama atau perubahan data, dan batas
kompatibilitas dijelaskan pada catatan rilis.

## Strategi pengujian dari Mac

| Lapisan | Tempat | Bukti yang diperlukan |
| --- | --- | --- |
| Pengembangan dan GUI harian | Mac lokal | Alur utama dapat dijalankan |
| Unit test Go dan pemeriksaan frontend | CI ketiga OS | Hasil test dan build |
| Integration test database | Linux CI dengan server pengujian | Hasil MySQL/MariaDB sesuai matriks |
| Adapter dan dependensi khusus OS | Runner OS terkait | Test otomatis yang relevan |
| GUI dan paket distribusi | Windows/Ubuntu melalui VM, remote desktop, atau tester | Catatan smoke test/manual QA |

Build berhasil tidak sama dengan GUI berhasil. Otomasi browser frontend juga
tidak membuktikan integrasi WebView dan desktop. Jika akses Windows/Ubuntu belum
tersedia, pengembangan tetap berjalan, tetapi milestone yang mensyaratkan
manual QA belum dinyatakan selesai dan dukungan OS belum dianggap tervalidasi.

## Fitur setelah fondasi stabil

AWS IAM, Vault, MCP server, editor schema, import/export SQL penuh, migrasi
session `.spf`, dukungan distro/arsitektur tambahan, dan database selain
MySQL/MariaDB diprioritaskan berdasarkan kebutuhan nyata setelah beta.

Tidak ada estimasi tanggal sebelum milestone 1 memberi bukti kelayakan teknis.

## Catatan pengerjaan terbaru — splitter panel

Milestone 1A berlanjut: lebar sidebar dipakai bersama layar koneksi/workspace
selama aplikasi terbuka; tinggi editor dapat diatur terpisah. Ukuran disimpan
sebagai persentase agar mengikuti jendela, belum dipersistenkan antar-restart.
`npm test` (2 test), `npm run build`, `go test -race ./...`, `go vet ./...`,
dan build desktop darwin/arm64 lulus lokal. Test integrasi database dilewati
karena server fixture tidak dinyalakan pada sesi ini. CI tiga OS yang tercantum
di bagian atas masih merujuk implementasi sebelumnya; belum menjadi bukti
untuk perubahan splitter ini. Pemeriksaan GUI Windows/Linux tetap terbuka.

CI milestone 2 awal (`5ea16c4`, run 39548873775): desktop build/test dan vault
native lulus di macOS, Windows dan Ubuntu; MariaDB 11.4 lulus. MySQL 8.4
menemukan cancel pada baris buffered yang masih dapat dilaporkan sukses.
Pemeriksaan context setelah pembacaan/emit diperbaiki; regresi database lokal
lulus tiga kali. Run gabungan setelah perbaikan (`62c4750`, run 39549139051) lulus pada
kelima job, termasuk MySQL 8.4 dan vault native ketiga OS.

Status akhir milestone 2: implementasi dan pengujian otomatis selesai, termasuk
CI build/test/vet tiga OS, vault native tiga OS, integration MySQL 8.4/MariaDB
11.4, serta fixture Mac MySQL 5.7.44/TLS/SSH. Manual QA GUI Windows/Ubuntu
belum tersedia; kriteria selesai penuh milestone 2 tetap terbuka untuk butir itu.
Panduan handoff: `docs/milestone-2-qa.md`. Build Mac lokal sudah diperbarui;
schema/history/credential dummy dan server fixture sudah dibersihkan.

## Progres milestone 3 — 2026-10-22

Implementasi `ab5e712` sudah tersedia dalam build Mac lokal. Frontend test/build,
Go vet, serta seluruh unit/integration/race lokal lulus. Test tambahan memutus
koneksi fisik saat INSERT tertahan di trigger fixture: outcome dilaporkan gagal,
sesi dibuang, baris tidak ter-commit dan write tidak diulang.
CI https://github.com/AdityaArgadinata/sequel-ace-rewrite/actions/runs/39745002743:
MySQL 8.4, MariaDB 11.4, desktop macOS dan Windows lulus. Job Ubuntu masih
berjalan pada pemasangan dependensi desktop saat catatan ini dibuat; checklist
CI tiga OS tetap terbuka. Manual QA GUI editor/transaksi pada ketiga OS belum
dilakukan. Panduan: `docs/milestone-3-qa.md`. Server/schema fixture lokal sudah
dibersihkan; tidak ada perubahan terhadap database pengguna.

## Progres milestone 4 — Structure

Tab Structure berisi Columns, Indexes/Primary key, Foreign keys dan CREATE
statement, dengan reload eksplisit. Pemilihan tabel saat berada di Structure
mempertahankan tampilan Structure. Setiap query catalog dibatasi 500 baris/4 MiB;
jika terpotong, snapshot tidak ditampilkan dan sesi perlu dihubungkan ulang.
Informasi catalog diambil lewat beberapa query: concurrent DDL dapat mengubah
metadata di antaranya, sehingga ini bukan snapshot schema transaksional.
Test lokal mencakup backtick pada nama tabel, PK/index prefix, default/comment/
generated column, FK composite beserta urutan/rule, view, tabel tidak ditemukan,
serta metadata melebihi batas. Export/import CSV dan migrasi favorites belum
diimplementasikan; eksekusi SQL tetap satu statement.

Implementasi Structure di-push sebagai `edb701f`; CI masih berjalan saat catatan
ini dibuat: https://github.com/AdityaArgadinata/sequel-ace-rewrite/actions/runs/39746801936.
Build Mac lokal telah diperbarui. Manual GUI Structure belum diperiksa langsung;
keberhasilan build tidak dianggap sebagai kesetaraan visual dengan Sequel Ace.

## Progres milestone 4 — export CSV

Tombol Content **Export entire table CSV** memakai dialog simpan native. Export
mengabaikan filter/sort/pagination UI dan memuat seluruh tabel/view yang dipilih.
File UTF-8 ber-header memakai dialect Sequel CSV v1; lihat README. Export meminta
nama baru dan tidak menimpa file lama. Publikasi memakai hard link file sementara
di direktori tujuan; filesystem tanpa hard-link support belum didukung.
Operasi mengikuti timeout sesi 60 detik dan batas 4 MiB isi sel ter-encode per
baris; driver tetap membaca satu baris utuh sebelum batas dapat diperiksa.
Cancel/error saat masih membaca membuang sesi agar rows.Close tidak menguras
seluruh hasil. Tidak ada file hasil parsial yang dianggap sukses.

CI Structure sebelumnya (39746801936): build tiga OS dan MySQL lulus, MariaDB
menemukan assertion default literal yang mengasumsikan format MySQL. Test diperbaiki
untuk menerima literal ber-kutip MariaDB; nilai metadata asli tidak diubah.
Verifikasi ulang digabungkan dengan CI export berikutnya. Import CSV dengan
preview/mapping, laporan partial failure, dan round-trip masih tahap berikutnya.

Export CSV di-push pada `81b6f11`. Run 39748176141:
https://github.com/AdityaArgadinata/sequel-ace-rewrite/actions/runs/39748176141.
MySQL 8.4, MariaDB 11.4, macOS dan Windows sudah lulus; Ubuntu masih memasang
paket desktop saat catatan ini dibuat. Assertion Structure MariaDB kini lulus.
Build Mac lokal sudah diperbarui dan server/schema fixture dibersihkan.
Export melalui dialog GUI belum diuji langsung; import CSV belum diimplementasikan.

## Catatan perbaikan koneksi — 2026-10-22

- [x] Tambahkan konteks tahap handshake/authentication, ping, dan inisialisasi
  sesi pada error koneksi. Error `invalid connection` menjelaskan kemungkinan
  sambungan ditutup/respons tidak lengkap dan pemeriksaan endpoint/tunnel/log.
  Test loopback mereproduksi server yang menutup handshake; password tidak
  masuk pesan dan sesi gagal tidak tersimpan aktif.
- [ ] Verifikasi ulang koneksi yang dilaporkan pengguna: pengguna memakai TCP/IP
  ke 127.0.0.1:3306; greeting sudah pulih setelah restart, login GUI belum
  dikonfirmasi. Perbaikan diagnostik bukan bukti penyebab
  endpoint pengguna telah diselesaikan; konfigurasi/verifikasi TLS tetap.

### Diagnosis TCP lokal pengguna

- [x] Port 127.0.0.1:3306 dimiliki mysqld MySQL 5.7.44. Probe TCP read-only
  tanpa autentikasi menerima EOF sebelum greeting. Log server pada waktu
  diagnosis berulang kali mencatat `File Descriptor 1667 exceeded FD_SETSIZE=1024`.
  Ini mengindikasikan kegagalan server sebelum autentikasi/TLS, bukan bukti
  kesalahan password atau validasi form rewrite.
- [x] Restart layanan MySQL lokal atas izin pengguna; Homebrew melaporkan
  stop/start berhasil. Probe 127.0.0.1:3306 kembali menerima greeting MySQL
  5.7.44 lengkap. Login dari GUI dengan kredensial pengguna masih perlu dicoba.

## Audit checklist — 2026-10-22

Checklist disesuaikan dengan bukti terkini, bukan hanya keberadaan implementasi.
CI Structure/export sudah diverifikasi langsung: lima job run `39748176141`
selesai sukses. Pemeriksaan dialog export dipisahkan karena belum dilakukan.
Perubahan grid dan diagnostik koneksi lulus pemeriksaan lokal/build Mac;
CI untuk perubahan terbaru belum diverifikasi. Login GUI pengguna setelah
restart MySQL tetap terbuka. Milestone 1A dan QA Windows/Linux belum selesai.

### Styling dari source asli

Form/toolbar/sidebar diperbarui dari metrik XIB dan observasi native. Pengaturan
credential dipindah ke bagian Password storage yang dapat dibuka. Frontend
4 test, typecheck/build produksi, Go unit test dan build desktop Mac lulus.
Pemeriksaan final grouping credential, light theme, workspace terhubung dan
Windows/Linux masih terbuka. Ini bukan penutupan milestone 1A.

### Warna, tipografi, ikon dan selection dari source

Palet Aqua/Dark Aqua dibaca langsung dari AppKit tanpa mengubah pengaturan OS.
Grid membedakan selection aktif/nonaktif dan tidak memakai hover sebagai
selection. Border separator dan focus ring mengikuti nilai semantic. Ikon
Structure/Relations/Triggers/Users diperbarui sesuai konsep simbol source.
Build Mac lokal terbaru tersedia. Butir kesetaraan penuh tetap terbuka:
source-list vibrancy, bentuk glyph persis, light render, focus/selection grid
aktif dan overlay belum terverifikasi; aksesibilitas gagal saat uji focus ring.
Tidak mengklaim kesamaan penuh atau QA Windows/Linux selesai.

### Pemetaan UI workspace dari codebase asli

DBView.xib, IndexesView.xib dan ContentPaginationView.xib dibaca untuk frame,
label, tooltip, simbol dan susunan panel. Perubahan diterapkan ke Content,
Query, Structure dan status bar. Source map serta perbedaan perilaku tersisa
tersimpan di docs/source-ui-map.md. Build Mac lokal sudah diperbarui; empat
test frontend, typecheck/build dan unit Go lulus. Fixture TLS terpisah disiapkan
lalu dibersihkan karena otomasi GUI gagal pada akses frame input; alur workspace
baru belum diverifikasi manual. Kesetaraan penuh dan QA OS tujuan tetap terbuka.

## Progres GUI 1A — 2026-10-23

Shortcut menu native diterapkan untuk tampilan yang tersedia, reload metadata/
Content dan fokus filter. Refresh Content mempertahankan halaman jika filter
belum berubah; perubahan filter memulai dari halaman pertama. Query tidak
pernah dijalankan ulang oleh shortcut refresh. Navigasi grid juga dibatasi
ulang bila result set baru lebih pendek dari selection sebelumnya.
Tujuh test frontend, typecheck/build, unit Go dan build Mac lokal lulus.
Perubahan GUI terkumpul sudah di-push ke origin rewrite. CI commit `b4b5fc3`
lulus kelima job: https://github.com/AdityaArgadinata/sequel-ace-rewrite/actions/runs/39896410477.
Ini bukti build/test lintas OS, bukan manual GUI Windows/Linux.

### Lanjutan GUI 1A — menu grid dan stylesheet

CSS App.css berkurang dari 777 menjadi 715 baris dengan menghapus deklarasi
tertimpa dan style elemen lama. Menu grid dapat dibuka lewat keyboard, navigasi
menu memakai batas indeks yang sama dengan grid, dan copy baris tetap mengirim
teks asli (NULL eksplisit, angka tanpa konversi). Shift+F10 memakai kolom pertama
pada baris terpilih; pointer tetap memakai sel yang diklik. Jika fokus sudah
berpindah keluar grid saat clipboard selesai, fokus pengguna tidak direbut.
Delapan test frontend, typecheck/build, unit Go dan build Mac lokal lulus.
GUI native, light/dark overlay serta Windows/Linux masih perlu pemeriksaan.
CI terakhir terverifikasi di atas tetap untuk b4b5fc3, bukan perubahan terbaru ini.

CI perubahan menu/CSS `95580b0` sudah dipicu:
https://github.com/AdityaArgadinata/sequel-ace-rewrite/actions/runs/39897440014.
Status saat pencatatan: queued; belum dicentang lulus untuk perubahan ini.

### Referensi screenshot Content — 2026-10-23

Layout dark disesuaikan dengan screenshot pengguna: toolbar 52 px, sidebar
20,5%, filter terlihat di atas grid, header nama/tipe kolom, baris 22 px,
selection penuh dan action strip 25 px. Tab sesi tunggal disembunyikan;
transaksi/history dan sort/pagination/export tetap tersedia melalui menu.
Ukuran jendela awal 1408×1024. Preview data sintetis tersimpan di
`docs/screenshots/content-dark.png`; detail bukti dan batas di `docs/gui-parity.md`.
Sembilan test frontend, production frontend build dan unit Go lulus. Browser
check mencakup filter/sort/selection/error/tab serta toolbar pada 800×600.
Ini belum membuktikan pixel-identik, render native Wails dengan database live,
atau QA Windows/Linux; milestone 1A tetap terbuka.
Build produksi aplikasi macOS arm64 juga lulus; hasil di
`build/bin/sequel-rewrite.app` sudah diperbarui.


### Koreksi transparansi sidebar — 2026-10-23

Warna hijau pada referensi berasal dari wallpaper, bukan warna sidebar tetap.
Gradasi hijau dihapus; macOS menggunakan transparansi WebView dan visual-effect
native di belakang jendela. Root/sidebar transparan hanya di runtime macOS;
platform lain memakai fallback abu-abu netral. Form koneksi dan grid tetap
opaque. Sembilan test frontend, build frontend dan unit Go lulus. Preview PNG
sebelumnya adalah bukti layout sebelum koreksi transparansi, bukan bukti efek
wallpaper. Perbandingan visual native pada beberapa wallpaper masih terbuka.
Build macOS arm64 terbaru dan pemeriksaan code signature juga lulus.

### Distribution packages — 2026-10-23

The workflow now prepares macOS ARM64 DMG/ZIP, Windows AMD64 NSIS installer and
portable ZIP, and an Ubuntu 24.04 AMD64 tarball. Packages retain LICENSE and
README; the Windows installer displays and installs LICENSE. Version tags or a
manual `release_tag` request create a draft pre-release only after all desktop
and database jobs pass, including SHA-256 checksums. Publisher signing and
notarization are not configured. Workflow lint and local release-version checks
passed; cross-platform package build verification is in progress.
Local macOS production build, ZIP integrity/content check, code-signature check,
and DMG creation/checksum verification also passed.

Distribution verification completed for code commit `745f4d0`:
[workflow run 39905593443](https://github.com/AdityaArgadinata/sequel-ace-rewrite/actions/runs/39905593443)
passed all seven jobs (version validation, three desktop builds, two database
integration jobs, and draft release upload). Draft `v0.1.0-alpha.1` contains
five packages plus `SHA256SUMS.txt`. All assets were downloaded again; SHA-256,
ZIP contents, LICENSE/README inclusion, macOS 0.1.0 app metadata, binary CPU
architectures, Linux executable permissions, and the released DMG checksum
were verified. Files are also available locally in `dist/from-github/` (ignored
by Git). Native installation/GUI tests on Windows/Linux and publisher signing /
notarization remain open. The release is a draft pending the owner's publication.

### Cross-platform UI control fix — 2026-10-23

Linux dropdown text clipping is addressed through explicit shared control metrics
and appearance. The form's global select selector was corrected. Search insets,
small-window favorite labels, row-editor label spacing and menu overflow were
also reviewed. Local Chromium/WebKit checks passed (14), frontend unit tests (9)
and frontend build passed. The desktop CI jobs now run both test engines on all
three OSes and retain screenshots. Historical plan (superseded by the release hold above): an alpha.2 package build was being prepared;
cross-OS run results will be recorded after verification.
The first cross-OS run passed (42 UI checks plus desktop/database jobs). Reviewing
the Linux WebKit screenshots found one additional initial header-width issue;
its spacing estimate and UI assertion were corrected before regenerating alpha.2.
The corrected build passed 14 local UI checks and 9 frontend unit tests.

## Pembaruan dev lokal — 2026-10-23

- [x] Klik header Content menjalankan sorting server-side ASC/DESC; pindah kolom
  mulai ASC dan kembali ke halaman pertama.
- [x] Double-click sel membuka editor ringkas di tempat tanpa mengubah ukuran
  kolom/baris; teks terseleksi, Enter menyimpan, Shift+Enter membuat newline,
  Escape atau blur membatalkan. Kontrol NULL/hex tetap di row editor.
- [x] Filter mengikuti referensi: checkbox independen per baris, input sejajar,
  tombol −/+ tiap baris, dan satu Apply Filter(s) di kanan baris terakhir.
  Plus menyisipkan kondisi setelah barisnya; minus menghapus kondisi (baris
  terakhir direset nonaktif). Maksimum 100 kondisi; All/Any (AND/OR) di menu opsi.
- [x] Pesan hasil write dipindah ke bawah grid, di atas toolbar bawah.
- [x] Klik/drag ruang kosong tidak menyeleksi seluruh teks grid; seleksi baris,
  copy dan seleksi teks dalam editor tetap berfungsi.
- [x] Pembacaan versi server/database aktif menggunakan endpoint metadata tetap,
  sehingga startup/refresh tidak membuat transaksi menjadi unverified. Query
  manual dan error yang benar-benar belum pasti tetap dilindungi; tidak ada
  commit/rollback otomatis untuk menyelesaikan transaksi pengguna.
- [x] MyISAM dengan primary key dapat diedit memakai LOCK TABLES WRITE selama
  validasi metadata dan write, lalu UNLOCK TABLES. Transaksi aktif/unverified
  ditolak sebelum locking. Hasil MyISAM tersimpan segera dan tidak bisa rollback;
  akun memerlukan privilege LOCK TABLES. Tidak mengubah engine tabel pengguna.
- [x] Build app lokal macOS ARM64 diperbarui untuk percobaan dev.

Validasi lokal: pemeriksaan TypeScript dan lint localization lulus; suite UI
terakhir berisi 28 tes Chromium/WebKit dan semuanya lulus. Suite Go beserta
integration test pada instance disposable MySQL 5.7 lulus setelah konfigurasi
max_allowed_packet fixture disesuaikan. Pengujian MyISAM mencakup insert/update/
delete, konflik snapshot, cleanup lock, visibilitas dari sesi kedua dan transaksi
aktif; regresi InnoDB juga lulus. Tidak ada write atau perubahan schema pada
bbc_config pengguna. Perubahan ini belum diuji ulang pada GUI native Windows/
Ubuntu, CI terbaru, atau server MariaDB nyata dalam sesi ini.

## Backlog kesetaraan fitur Sequel Ace asli — 2026-10-23

Daftar ini memisahkan kekurangan dari fitur dasar yang sudah tersedia. Fitur
lanjutan di luar cakupan rilis pertama tidak menjadi syarat selesai milestone
lama secara otomatis; prioritasnya mengikuti urutan di bawah.

### Prioritas 1 — Content grid (lanjutan 1A/3)

- [x] Duplicate row melalui draft editor; metadata auto-increment tersedia.
- [x] Multi-row selection serta edit/delete beberapa baris; berhenti saat error dan melaporkan hasil parsial.
- [x] Navigasi edit antarsel dengan Tab/Enter seperti aplikasi asli.
- [x] Menu konteks dasar asli tersedia, termasuk SQL INSERT dengan/tanpa auto-increment; rincian pada catatan implementasi Prioritas 1.
- [x] Lompat halaman dan navigasi Table History Back/Forward.
- [x] Perluasan hasil editable selain tabel ber-PK InnoDB/MyISAM, hanya dengan
  identifikasi baris dan aturan write yang terbukti aman: unique key lengkap NOT NULL. View dan hasil Query
  arbitrer saat ini read-only; generated column tetap dihitung oleh server.

### Prioritas 2 — Editor dan eksekusi SQL (lanjutan 2/4)

- [x] Syntax highlighting MySQL/MariaDB dan autocomplete keyword/tabel/kolom (Ctrl+Space).
- [x] Run Current Statement, Run Selection dan Run All, termasuk shortcut editor.
- [x] Buka/simpan SQL dengan dialog native dan eksekusi script memakai parser
  komentar/string/DELIMITER; validasi sebelum eksekusi, berhenti pada error pertama.
- [x] Query Favorites: simpan, ubah, muat dan hapus SQL lokal.
- [x] History SQL opt-in dengan pilihan Off/Metadata/Include SQL text; muat ke
  editor untuk ditinjau sebelum Run, serta hapus SQL tanpa menghapus metadata.

### Prioritas 3 — Editor schema (lanjutan 4)

- [x] Tambah/edit/hapus kolom dan atributnya di Structure melalui form definisi SQL.
- [x] Tambah/edit/hapus index dan primary key, termasuk index gabungan/prefix.
- [x] Tambah/edit/hapus foreign key, referensi gabungan dan ON DELETE/UPDATE.

### Prioritas 4 — Tabel/database dan pertukaran data (lanjutan 4)

- [x] UI create/rename/copy/drop tabel dan database, serta truncate tabel;
  copy/move database mendukung subset base table yang dijelaskan di bawah.
- [x] Import CSV dengan preview, pemetaan kolom dan laporan hasil parsial.
- [x] Import dump SQL, export SQL/XML/CSV, serta export hasil query/filter/seleksi.
- [x] Migrasi favorites XML/binary dan buka/simpan session .spf tanpa enkripsi;
  password/Keychain dan auto-connect tidak ikut dipindahkan.

### Prioritas 5 — Panel fitur asli dan kelengkapan penggunaan

Implementasi dasar sudah tersedia lokal; rincian batas dan verifikasi ada pada
catatan implementasi Prioritas 5 di bawah. Ini belum berarti seluruh fitur native
Sequel Ace sudah setara.

- [x] Relations memakai editor foreign key dengan preview dan Add/Edit/Drop.
- [x] Triggers: daftar/body/SQL mode/definer, create dan drop dengan preview;
  penggantian trigger dilakukan sebagai dua operasi terpisah.
- [x] Table Info: metadata ukuran/engine/collation/comment dan perubahan
  engine/default collation/comment melalui preview ALTER TABLE.
- [x] User Manager dasar: daftar akun, SHOW GRANTS, create/drop/password serta
  grant/revoke privilege database/tabel dengan preview password tersamarkan.
- [x] Console aktivitas sesi: 500 event SQL query/execute dan administrasi di
  memori, termasuk grid/transfer; hanya jenis operasi, waktu dan respons awal.
- [x] UNIX socket lokal dan timezone sesi; database awal sudah tersedia.
- [x] SSH agent lewat SSH_AUTH_SOCK dan keyboard-interactive dengan jawaban
  sekali pakai yang diisi berurutan sebelum Connect; host key tetap diverifikasi.
- [x] Folder/path dan warna favorites dapat disimpan, diubah dan dikelompokkan.
- [x] Dark/light/system, font/ukuran editor, wrap SQL, shortcut view 1–6,
  reload panel dan preferences. Ikon SVG sebelumnya dipertahankan sesuai
  permintaan pengguna; penggantian dengan aset PNG asli dibatalkan.
- [x] AWS IAM lewat AWS CLI, Vault database credentials lewat HTTPS, HELP SQL
  server dan export HTML hasil yang dimuat untuk Print/Save PDF di browser.
- [ ] Paritas lanjutan: semua shortcut native dan remapping, preferensi lengkap,
  operasi folder massal/tree native; global/dynamic/role privileges,
  resource limit/auth-plugin/rename akun, editor trigger atomic/version-specific.
- [ ] Vault OIDC/login/renewal, IAM tanpa dependensi AWS CLI, dialog print native
  langsung serta kompatibilitas SPF untuk pengaturan koneksi tambahan ini.

### Syarat verifikasi sebelum beta (lanjutan 5)

- [ ] QA native Windows/Ubuntu dan regresi GUI macOS terhadap server pengujian.
- [ ] Instalasi pada mesin bersih, vault, file dialog, clipboard, shortcut,
  scaling, TLS/SSH, cancel dan shutdown.
- [ ] Verifikasi ulang CI dan matriks MySQL/MariaDB untuk source terbaru ketika
  pengguna meminta; jangan menganggap hasil CI commit lama mencakup perubahan ini.
- [ ] Keputusan signing/notarization, batas dukungan dan catatan rilis.
- [ ] Build/upload/publikasi GitHub Release hanya setelah instruksi pengguna.

## Implementasi Prioritas 1 — Content grid — 2026-10-23

Implementasi lokal selesai; QA native Windows/Ubuntu dan verifikasi CI terbaru
masih terbuka. GitHub Release tetap ditunda sampai instruksi pengguna.

- [x] Duplicate satu baris lewat toolbar/menu konteks membuka draft sebelum write.
  Generated columns tidak disalin sebagai assignment; auto-increment tidak
  dicentang sehingga server membuat nilainya. Key unik lain tetap perlu diperiksa.
- [x] Multi-select dengan Shift-click, Cmd/Ctrl-click, Shift+panah, serta
  Cmd/Ctrl+A untuk seluruh baris pada halaman aktif. Seleksi dibersihkan saat reload.
- [x] Edit banyak baris melalui row editor: hanya kolom yang dicentang diterapkan
  ke semua baris terpilih; kolom identitas tidak bisa diubah massal. Nilai yang
  sama dengan snapshot dilewati. Delete massal memerlukan konfirmasi jumlah/key.
- [x] Operasi massal berjalan satu baris per statement, berhenti pada error pertama,
  melaporkan jumlah yang sudah diproses dan membuang snapshot lama. Bukan satu
  transaksi atomik: write sebelumnya bisa sudah tersimpan; pada managed InnoDB
  transaction, perubahan tetap menunggu Commit/Rollback. Tidak ada retry otomatis.
- [x] Tab/Shift+Tab menyimpan lalu berpindah ke sel editable berikut/sebelumnya;
  Enter ke baris berikut pada kolom sama. Shift+Enter tetap newline, Escape/blur
  membatalkan draft. Generated columns dilewati. Setelah refresh/sorting, tujuan
  dicari melalui key, bukan nomor baris; jika tujuan keluar dari hasil, edit berhenti.
- [x] Menu konteks dasar asli: copy, copy dengan nama kolom, SQL INSERT dengan/
  tanpa auto-increment, insert, duplicate dan delete. Ditambah CSV, copy cell/row,
  select all/clear, edit cell/selected rows, NULL, filter by cell dan refresh.
  Copy SQL mengecualikan generated columns dan mengodekan teks sebagai UTF-8 hex.
  Integrasi Bundles/plugin menu asli bukan bagian implementasi Content grid ini.
- [x] Go to page pada menu Content options, validasi integer positif dan batas
  offset 10.000.000. Tidak menjalankan COUNT seluruh tabel; halaman bisa kosong.
- [x] Back/Forward Table History per tab (maksimum 100 tabel), termasuk lintas
  database; navigasi baru memangkas cabang Forward. Hanya memilih tabel/view dan
  memuat datanya, tidak menjalankan ulang SQL pengguna. Draft/filter tidak dipersist
  ke history; transaksi dan sesi database tetap milik tab yang sama.
- [x] Perluasan identitas baris: InnoDB/MyISAM tanpa primary key asli dapat diedit
  bila ada unique index lengkap yang seluruh kolomnya NOT NULL. Baca STATISTICS
  untuk membedakan PK asli dari COLUMN_KEY=PRI semu. Nullable/prefix/expression
  key ditolak, snapshot seluruh kolom tetap dicek, schema direvalidasi dalam lock.
  View, hasil Query arbitrer, tabel tanpa key aman dan engine lain tetap read-only.

Validasi: TypeScript, 12 unit test frontend, 50 tes UI Chromium/WebKit, go vet,
suite Go serta integration test dan race detector database pada MySQL 5.7
disposable lulus. App lokal macOS ARM64 sudah dibuild ulang. Tes mencakup unique key
komposit InnoDB/MyISAM, metadata auto-increment, konflik snapshot, gagal sebagian,
copy/seleksi/navigasi/duplicate/delete dan riwayat tabel. Screenshot UI ditinjau
melalui fixture Chromium/WebKit; tidak ada write pada database pengguna. QA
native tiga OS dan CI source terbaru tetap harus dilakukan sebelum beta.

### Perbaikan tinggi row dan zebra kosong — 2026-10-23

- [x] Gunakan satu metrik tinggi row 22 px untuk data, pola zebra dan editor sel.
  Line-height sel dibuat eksplisit agar isi/jenis font tidak memperbesar row.
- [x] Awal zebra kosong mengikuti tinggi header sebenarnya melalui ResizeObserver,
  menggantikan offset tetap 28 px yang meleset ketika nama/tipe kolom bertumpuk.
- [x] Posisi zebra mengikuti scrollTop tanpa rerender React setiap scroll.
- [x] Suite 54 tes UI Chromium/WebKit lulus, termasuk row sebelum/saat edit
  multiline/emoji dan keselarasan zebra setelah scrolling; screenshot diperiksa.

Pembaruan ini hanya menyentuh layout grid; tidak mengubah data atau schema.
QA pada app native Windows/Ubuntu masih terbuka. GitHub Release tetap ditunda.

### Perbaikan katalog lebih dari 500 tabel — 2026-10-23

- [x] Pisahkan budget daftar database/tabel dari batas hasil query 500 baris.
  Katalog memakai maksimum 50.000 entri / 4 MiB dan timeout operasi yang sama;
  hasil query pengguna tetap maksimum 500 baris / 4 MiB.
- [x] Katalog yang melampaui budget dibuang dengan error eksplisit, sehingga UI
  tidak mengaku sukses dengan daftar parsial setelah sesi ditutup.
- [x] Uji MySQL 5.7 disposable dengan 509 tabel: USE/list mempertahankan sesi dan
  transaksi aktif, tabel terakhir tersedia, serta insert/browse tetap berfungsi.
- [x] Unit test membuktikan Databases/Tables dapat melewati 500 entri, sementara
  query biasa tetap dibatasi dan katalog berlebih tidak dikembalikan sebagian.
- [x] Dua tes UI Chromium/WebKit memastikan 509 tombol tabel tersedia, tabel
  terakhir bisa dibuka, dan pencarian sidebar tetap bekerja. Suite Go lulus.

Database bbo pengguna tidak dimodifikasi. App lokal diperbarui; sesi yang sudah
terputus perlu dihubungkan ulang. Tidak ada reconnect atau replay SQL otomatis,
dan tidak ada build/upload GitHub Release.


### Implementasi Prioritas 2 — 23 Oktober 2026

- [x] CodeMirror menggantikan textarea: highlighting, line numbers, pencarian,
  undo/redo dan completion dari database aktif. Semua nama tabel yang terdaftar
  tersedia; metadata completion dibatasi 2.000 kolom dan dapat di-refresh.
- [x] Current/Selection/All menggunakan posisi UTF-16 editor dan parser server-side,
  termasuk komentar, escaped/doubled quotes, executable comments dan DELIMITER
  untuk trigger/routine. Mode SQL sesi diperiksa; perubahan SQL_MODE menghentikan
  script sebelum statement berikutnya agar quoting tidak ditafsirkan keliru.
- [x] File UTF-8 maksimum 4 MiB; maksimum 1.000 statement per script. Open/Load
  melindungi draft yang belum disimpan. Save memakai file sementara dan rename.
- [x] Eksekusi berurutan pada sesi tab yang sama, cancel dan berhenti pada error/
  hasil terpotong. Lima hasil statement terakhir dapat dipilih kembali. Tidak ada
  retry/replay/COMMIT otomatis; perubahan sebelum error dapat sudah tersimpan.
- [x] Favorites maksimum 100 entri, 1 MiB SQL per entri dan 8 MiB file total.
  SQL disimpan lokal sebagai plain text; memuat favorite tidak menjalankannya.
- [x] History default Off. Metadata tetap tanpa SQL; Include SQL text menyimpan
  SQL lengkap maksimal 32 KiB per statement (yang lebih besar hanya metadata),
  maksimum 100 entri/4 MiB. Review/load bukan eksekusi otomatis; SQL lama bisa
  dihapus tersendiri. SQL plaintext dapat mengandung rahasia.
- [x] Pengujian parser/scopes/Unicode, file SQL, favorites, history, script trigger
  pada MySQL 5.7 disposable, dan interaksi editor di Chromium/WebKit lulus.

Validasi: 12 unit test frontend, 76 tes UI Chromium/WebKit, seluruh suite Go
termasuk MySQL 5.7 disposable dengan race detector, go vet, lint English strings
dan build lokal macOS arm64 lulus. QA dialog file native dan GUI Windows/Linux serta
regresi matriks server CI untuk perubahan ini masih terbuka. GitHub Release
menunggu instruksi pengguna.


### Implementasi Prioritas 3 — 23 Oktober 2026

- [x] Structure: pilih baris lalu Edit/Drop atau klik dua kali untuk membuka form;
  tombol tambah tersedia untuk kolom, index/primary key dan foreign key.
- [x] Form Name + Definition SQL mempertahankan definisi lengkap dari SHOW CREATE
  TABLE: tipe/panjang, NULL/default, auto-increment, charset/collation, comment,
  generated expression dan posisi FIRST/AFTER dapat diubah. Ini form definisi SQL,
  belum widget terpisah untuk setiap atribut seperti seluruh UI native Sequel Ace.
- [x] Pilihan INDEX/UNIQUE/PRIMARY/FULLTEXT/SPATIAL dan definisi kolom terurut,
  prefix/direction, USING/COMMENT. Edit index memakai DROP + ADD pada satu ALTER.
- [x] FK: kolom lokal/referensi, lintas database, gabungan dan aturan ON DELETE/
  ON UPDATE. Edit mengusulkan nama constraint baru; MySQL 5.7 dapat menolak
  penggantian nama identik pada COPY ALTER. Tidak ada pemadaman foreign_key_checks
  atau rangkaian drop/add terpisah yang meninggalkan FK hilang saat langkah gagal.
- [x] Preview SQL dan konfirmasi eksplisit sebelum Apply. Backend menyimpan plan
  sekali pakai per sesi; SQL tidak diterima kembali dari frontend saat Apply.
  Snapshot SHOW CREATE + SQL_MODE diperiksa ulang, mengabaikan hanya nilai tabel
  AUTO_INCREMENT berikutnya. Perubahan eksternal membatalkan preview yang lama;
  pemeriksaan optimistis ini bukan penguncian lintas sesi selama pengguna meninjau.
- [x] Blokir transaksi aktif/unverified, autocommit off, view dan metadata tidak
  lengkap. Identifier dikutip, definisi maksimum 64 KiB dan CREATE maksimum 4 MiB.
  Tolak beberapa clause/statement, delimiter/comment di luar teks berkutip.
  Definisi dengan version comments harus ditinjau melalui Query; editor ini tidak
  menghapus komentar server secara diam-diam. CHECK constraint belum dikelola.
- [x] Reload metadata setelah server mengakui DDL, tampilkan sampai 20 warning,
  dan bedakan DDL berhasil dari reload gagal. Token dikonsumsi sebelum eksekusi;
  error/cancel/hasil tidak pasti tidak memicu retry/COMMIT/rollback otomatis.
- [x] Unit dan integration test disposable mencakup CRUD, atribut yang dipertahankan,
  FK/index gabungan, preview stale, INSERT di antara preview/apply, SQL error,
  transaksi, autocommit, view, warning truncation dan mode ANSI_QUOTES/
  NO_BACKSLASH_ESCAPES. Tes UI Chromium/WebKit ditambahkan untuk alur tersebut
  beserta preview/konfirmasi dan layout jendela kecil.

DDL dapat memblokir/rebuild tabel dan membuang data; Rollback tidak membatalkan
perubahan schema. Regresi server lain dan QA GUI Windows/Linux masih terbuka.
GitHub Release tetap menunggu instruksi pengguna; build lokal dev diperbolehkan.


Validasi Prioritas 3: 12 unit test frontend, 94 tes UI Chromium/WebKit (92 regresi
lengkap + 2 verifikasi refresh completion), seluruh suite Go dengan race detector
pada MySQL 5.7 disposable, tes terarah schema setelah perbaikan terakhir, go vet
serta lint katalog English lulus. Autocomplete Query di-refresh pada kunjungan
berikutnya setelah operasi schema. Build lokal macOS arm64 diperbarui; perubahan
ini belum diverifikasi ulang pada MySQL 8.4/MariaDB 11.4 atau GUI Windows/Linux.


### Implementasi Prioritas 4 — 23 Oktober 2026

- [x] Object manager melalui tombol + sidebar/menu Connection actions: create,
  rename, copy dan drop tabel/database, serta truncate tabel. Preview SQL dan
  konfirmasi; rename/drop/truncate meminta nama sumber tepat sebelum Apply.
  Plan sekali pakai per sesi diperiksa ulang terhadap metadata/SQL_MODE.
- [x] Create tabel menerima definisi kolom/options SQL; create database memakai
  default server. Copy tabel mempertahankan definisi/index/constraint, nama FK
  baru, referensi self yang diarahkan ke copy, serta data opsional tanpa menulis
  generated columns. Copy/move dengan trigger diblokir.
- [x] Copy database membuat base table terlebih dahulu, data opsional, lalu FK
  agar siklus/dependensi tidak memerlukan foreign_key_checks=0. Referensi internal
  diarahkan ke database tujuan. Rename database diemulasi dengan CREATE DATABASE,
  multi-table RENAME TABLE dan DROP sumber setelah pemeriksaan sumber kosong.
  Ini operasi bertahap, bukan RENAME DATABASE atomik atau snapshot data konsisten.
- [x] Copy/move database dibatasi 1.000 base table dan preview 4 MiB. View, sequence,
  trigger, routine dan event memerlukan migrasi terpisah dan diblokir bila terlihat;
  akun perlu visibilitas metadata memadai. Grants dan referensi SQL eksternal tidak
  disalin. Koordinasikan perubahan schema/data dari sesi lain. Target harus baru;
  hasil parsial dibiarkan terlihat untuk diperiksa, tidak dihapus/diulang otomatis.
- [x] CSV UTF-8 dengan comma/semicolon/tab, header opsional, preview 20 record dan
  mapping Ignore/kolom writable. Batas file 8 MiB, 20.000 record, 200.000 cell.
  Plain CSV mempertahankan teks literal; Sequel CSV v1 membedakan NULL, empty,
  binary dan escape termasuk \0 untuk NUL. Semua mapping/nilai divalidasi sebelum
  insert pertama; insert satu per satu dengan autocommit, berhenti pada error/
  warning. Laporkan record diakui/total dan hasil row terakhir bila tidak pasti.
- [x] Import dump SQL terpisah: 64 MiB, 100.000 statement, maksimum 4 MiB per
  statement. Parser komentar/string/DELIMITER yang sama; interactive editor tetap
  4 MiB/1.000 statement. Preview maksimal 100 statement/256 KiB; pengguna perlu
  meninjau seluruh file. Error, warning, cancel atau perubahan SQL_MODE menghentikan
  statement berikutnya. Notes seperti DROP IF EXISTS bukan warning coercion.
  Tidak ada retry/COMMIT/ROLLBACK otomatis; status sesi tetap unverified setelah
  SQL arbitrer sampai pengguna menyelesaikannya lewat kontrol transaksi.
- [x] Export CSV/SQL/XML dari seluruh tabel, seluruh hasil filter tanpa pagination,
  halaman terfilter, loaded Query result atau seleksi loaded Content. Filter/sort
  harus sudah diterapkan. Export Query memakai snapshot tanpa menjalankan SQL lagi.
  Export SQL tabel dapat menyertakan CREATE dan mengecualikan generated columns
  dari INSERT; ini dump per tabel, bukan seluruh routine/trigger/event database.
- [x] Export streaming tidak memakai batas 500 baris UI, tetapi memakai timeout
  operasi 60 detik dan batas row 4 MiB. Loaded/selection tetap maksimum 500 baris/
  4 MiB. XML menandai NULL dan memakai base64 untuk binary/control text. File baru
  dipublikasikan setelah lengkap; existing file/symlink tidak ditimpa, file gagal
  dibuang. Export besar dapat melebihi batas import aplikasi ini; gunakan tool
  database lain atau pecah file bila perlu. File berisi data sensitif dan formula
  spreadsheet tetap dipertahankan sebagai data, tanpa transformasi tersembunyi.
- [x] Favorites.plist/SPConnectionFavorites XML/binary dibaca menggunakan plist
  decoder Go yang sesuai dependensi Wails. Group diratakan pada nama; impor hanya
  entri terpilih ke ID baru, tidak menimpa favorit lama. Impor ulang dapat membuat
  duplikat. Password, kcid dan Keychain tidak dibaca/disalin. SSH key path hanya
  dipulihkan sebagai teks dan tidak dibuka sampai Connect eksplisit. Socket,
  IAM/Vault, client cert/CA path dan plugin auth khusus memerlukan setup manual.
- [x] SPF v1 tanpa enkripsi: connection TCP/SSH, database, table, view Structure/
  Content/Query dan editor SQL dipulihkan setelah Connect eksplisit; SQL tidak
  dijalankan otomatis. Baca XML/binary serta zlib query dari format native.
  Simpan password-free SPF dengan auto_connect=false, compatible data dictionary;
  XML besar otomatis memakai binary plist agar tetap bisa dibaca kembali.
  Layout, filter, seleksi/keyed archive dan native history tidak dipulihkan.
  Encrypted SPF, custom CA PEM dan custom known_hosts memerlukan setup native
  manual; file tidak disimpan dengan konfigurasi keamanan yang hilang diam-diam.
- [x] Profile menyimpan database awal opsional, tanpa credentials; koneksi lama
  tetap dapat dibaca. Fixture format native dan pengujian metadata memastikan
  parsing tidak mengikuti path/URL atau memanggil Keychain.
- [x] Metadata kosong karena objek dihapus sesi lain tidak lagi dianggap sebagai
  transport failure; preview stale ditolak tanpa menjatuhkan sesi yang masih hidup.

Perubahan baru diverifikasi pada MySQL 5.7 disposable dan UI fixture Chromium/
WebKit. GUI native Windows/Linux, dialog file manual, MySQL 8.4/MariaDB 11.4
untuk source terbaru, kasus data sangat besar/lock server dan semua fitur format
native lanjutan masih membutuhkan QA. GitHub Release tetap menunggu instruksi.


Validasi Prioritas 4: 12 unit test frontend, 124 kasus UI Chromium/WebKit (122
lulus pada regresi penuh; fixture katalog database kedua diperbaiki lalu kasus
Table History dan native migration terkait lulus pada pengulangan terarah),
seluruh suite Go dengan race detector pada MySQL 5.7 disposable, fixture native
XML/binary/zlib/SPF besar, go vet dan lint English strings lulus. Build lokal
macOS arm64 diperbarui; tidak ada GitHub Release yang dibuat atau diunggah.

Round-trip SQL structure+data juga diverifikasi langsung: BIGINT unsigned maksimum,
DECIMAL(30,10), Unicode/NUL, NULL vs empty, binary kosong dan generated columns
terjaga setelah file hasil export diimpor kembali. Header dump mencatat SQL_MODE
sumber tanpa mengubah mode secara otomatis. Preview dump panjang menampilkan
prefix statement pertama dengan penanda truncation, bukan melewatkannya diam-diam.


## Implementasi Prioritas 5 — Panel dan kelengkapan dasar — 2026-10-23

- Relations memakai operasi foreign key Prioritas 3; Triggers/Table Info/Users
  kini aktif. Rencana administrasi disimpan per sesi, token sekali pakai dikonsumsi
  sebelum write, dan metadata/SQL mode diperiksa ulang. Active/unverified
  transaction dan autocommit off memblokir DDL/account writes. Pemeriksaan optimis
  bukan lock lintas sesi selama pengguna meninjau. Tidak ada retry otomatis.
- Trigger create mendukung satu statement atau BEGIN…END. Drop memeriksa trigger
  benar-benar milik tabel yang dipilih. Perubahan trigger adalah drop dan create
  terpisah; definer/SQL mode lama terlihat sebagai metadata, bukan otomatis
  dipertahankan ketika membuat ulang. Default definer adalah akun sesi saat ini.
- Table Info menampilkan metadata termasuk ukuran/count estimasi. Collation
  mengubah default tabel, bukan mengonversi encoding kolom lama. Server tetap
  memvalidasi dukungan engine/collation dan mengembalikan warning/error.
- User Manager memerlukan izin mysql.user dan pengelolaan akun. Password baru
  tidak dikembalikan dalam preview, log, profile atau file; disimpan sementara
  hanya dalam rencana sekali pakai di memori. Grant/revoke menggunakan allowlist
  privilege database/tabel. Global/role/dynamic privilege belum ada.
- Console mencatat verb SQL dan hasil pengiriman/respons awal tanpa isi SQL,
  bound values, password atau pesan error. Ring 500 event per tab, Clear/Reload,
  tanpa file history. Durasi bukan total streaming; kegagalan saat membaca baris
  berikutnya dan scalar QueryRow metadata tidak masuk event tersebut.
- UNIX socket memakai absolute path hingga 103 byte, tanpa TLS/SSH. TCP/SSH tetap
  mendukung verified TLS. SET SESSION time_zone dijalankan saat setiap koneksi
  baru; nama zona memerlukan timezone tables server. Tidak ada reconnect diam-diam.
- SSH agent memerlukan SSH_AUTH_SOCK dalam environment aplikasi. Jawaban
  keyboard-interactive diisi sebelum handshake, satu baris per challenge dan
  tidak disimpan di favorites/credential store. Belum ada dialog live yang
  menampilkan pertanyaan server. Known_hosts tetap wajib diverifikasi.
- Favorites menyimpan path folder/warna; sidebar mengelompokkan folder. Pengaturan
  appearance/editor disimpan lokal; tidak mengimpor NSUserDefaults native.
  Ikon dikembalikan ke SVG sebelum Prioritas 5 sesuai permintaan pengguna;
  aset PNG tambahan dihapus.
- IAM memanggil AWS CLI tanpa shell, profile/region eksplisit atau provider CLI
  default, token baru setiap sesi. Vault memakai HTTPS terverifikasi, token
  sementara, namespace opsional, mount/role database dinamis dan menolak redirect.
  Kedua provider mensyaratkan TLS MySQL terverifikasi. Secret provider tidak
  diserialisasikan ke profile; lease Vault tidak direnew otomatis.
- HELP menggunakan tabel bantuan server. Print view menyimpan HTML escaped dari
  snapshot maksimal 500 baris/4 MiB, memberi tanda hasil terpotong, menolak
  overwrite, dan dicetak/dijadikan PDF setelah dibuka di browser. Tidak mengulang
  query, tidak mencetak langsung dari dialog native Wails.
- SPF export menolak socket/timezone/provider/auth SSH tambahan yang belum bisa
  diwakili daripada diam-diam menghilangkan setting. Import native socket/provider
  tetap memerlukan konfigurasi manual. Tidak ada perubahan format favorites lama.
- Verifikasi: Go race suite dan go vet; disposable MySQL 5.7 port 33317 untuk
  trigger, opsi tabel, akun/privilege/password, stale preview, transaksi, socket
  dan timezone. SSH fixture memeriksa agent, OTP benar/salah dan host key. Fake AWS
  CLI/HTTPS Vault memeriksa resolusi, penolakan sertifikat/redirect dan error aman.
  Fixture browser Chromium/WebKit memeriksa panel, acknowledgement, error tanpa
  replay, light mode, preferences, koneksi, bantuan, print dan viewport 800px.
- Hasil akhir: satu putaran penuh 148 tes UI Chromium/WebKit lulus, 12 tes unit
  frontend lulus, TypeScript check, seluruh Go race suite dan go vet lulus;
  plutil English catalog serta diff checks lulus. App lokal darwin/arm64 dibangun
  di rewrite/build/bin/sequel-rewrite.app dan codesign --verify --deep --strict
  lulus. Server MySQL sementara port 33317 sudah dihentikan.
- Akun AWS/Vault nyata, native file dialog/printing, macOS GUI ke server live,
  Windows/Linux GUI serta matriks MySQL/MariaDB lain belum diverifikasi.
  GitHub Release tetap menunggu instruksi pengguna.


## Nama dan app icon — 2026-10-24

- Nama produk, window title, UI dan output build diubah menjadi `sequelx`
  (`build/bin/sequelx.app`, `sequelx.exe`, `sequelx`). Packaging CI mengikuti nama baru.
- App icon memakai `rewrite/sequelx.png` dari pengguna melalui build/appicon.png,
  ikon macOS/Windows hasil konversi dan window icon Linux. Ikon toolbar tetap SVG.
- Direktori profil dan credential-service identifier tetap memakai identitas
  lama. Bundle identifier macOS sekarang `com.adityaargadinata.sequelx` agar
  identitas/icon sequelx tidak bercampur dengan bundle rewrite lama.
- Build lokal diperbarui; tidak ada publikasi GitHub Release.

Verifikasi perubahan nama/icon: build macOS ARM64, bundle name/display name/
executable, identitas bundle lama, isi app icon hasil ICNS, Windows ICO serta
codesign verification lulus. Source PNG awal berasal dari sequelx.png; revisi transparan memakai sequelx-icon.png.
Tes output print dan lint English catalog lulus. Paket/GUI Windows/Linux dan
suite UI penuh tidak diulang untuk perubahan branding ini.

### Penyesuaian app icon transparan — 2026-10-24

Latar putih di luar tile merah dihapus; logo putih di dalam tile tetap ada.
Ikon ditempatkan pada kanvas persegi dengan margin transparan sehingga bidang
utama menempati sekitar 83% lebar kanvas. Asset hasil edit `sequelx-icon.png`
dipakai untuk build/appicon.png dan Windows ICO; `sequelx.png` asli dipertahankan.
Build lokal macOS diperbarui. Ikon toolbar tidak diubah.

### Preferences dan identitas build macOS — 2026-10-24

Bar/tombol Preferences di atas toolbar dihapus. Menu native Settings →
Preferences… dan shortcut Cmd/Ctrl+, membuka dialog modal yang bisa ditutup
dengan Escape atau tombol Close. Menu App/Edit/Window macOS tetap dipertahankan.
Bundle ID sequelx dipisah dari app rewrite lama untuk menghindari benturan
registrasi/icon. Path build lama diarahkan ke build sequelx terbaru; salinan
artifact lama disimpan sementara, bukan menjadi bundle kedua yang stale.

Pengaturan lintas OS: tombol Settings dengan ikon gear ditempatkan tepat di
sebelah Console pada toolbar, tersedia sebelum maupun sesudah koneksi di macOS,
Linux dan Windows. Tombol membuka dialog Preferences yang sama; shortcut dan
menu native tetap tersedia sebagai akses tambahan.

Verifikasi Settings: seluruh tes Go lulus; 44 tes UI panel/layout Chromium dan
WebKit lulus, termasuk gear sebelum/sesudah koneksi, viewport 800px, dialog,
Escape, native-menu event dan shortcut. Build macOS lokal serta codesign lulus.
GUI native Windows/Linux belum diuji pada perubahan ini.

### Select All hasil query manual — 2026-10-24

Grid hasil Query yang memakai seleksi internal kini mendukung Cmd/Ctrl+A untuk
semua baris hasil yang dimuat, Cmd/Ctrl+C, Shift-range, toggle selection dan
Select All/Clear melalui menu konteks. Seleksi dibersihkan ketika hasil query
atau tab statement berganti. Seleksi Content dan metadata yang dikendalikan
parent tetap menggunakan handler semula; shortcut di editor/field tidak diambil
alih oleh grid. Tidak ada query tambahan atau perubahan database.

Verifikasi: 60 tes UI Query/Content lulus; setelah pembatasan reset seleksi pada
grid internal, 12 tes fokus Query/Content/metadata lulus. Dua shortcut Cmd/Ctrl+A
dan Cmd/Ctrl+C, NULL/Unicode, pergantian hasil, menu konteks serta regresi editor
diuji di Chromium/WebKit. 12 unit test frontend, TypeScript, build macOS dan
codesign lulus. GUI native Windows/Linux belum diuji ulang.

### Structure sesuai editor kolom asli — 2026-10-24

- Mengacu pada `SPTableStructure.m`, `SPTableFieldValidation.m`, dan DBView.xib:
  Field, Type, Length, Unsigned, Zerofill, Binary, Allow Null, Key, Default,
  Extra, Encoding, Collation, Comment; panel INDEXES dan toolbar di bawah grid.
- Dropdown Type/Extra mengikuti daftar asli; Encoding dan Collation dibaca dari
  server. Collation mengikuti charset; checkbox dan field yang tidak berlaku
  dinonaktifkan. Type Info menggunakan deskripsi asli. JSON memakai encoding
  tetap; DEFAULT_GENERATED tidak disamakan dengan kolom generated.
- Edit inline menjadi draft satu baris. Review → preview SQL → Apply memakai
  token, validasi transaksi dan snapshot DDL yang sudah ada. Cancel membuang
  draft; SQL editor lengkap tersedia lewat gear/double-click pada sel Key.
  Atribut yang tidak diedit, termasuk ekspresi generated, tetap dipertahankan
  dari SHOW CREATE server. Tidak ada perubahan otomatis pada database pengguna.
- Verifikasi: 68 tes UI regresi Structure/Content/Query lulus, 36 tes
  Structure/layout multiukuran lulus (sebagian tumpang tindih), dan 6 tes fokus
  final Chromium/WebKit lulus. 14 unit frontend, TypeScript, seluruh tes Go
  dengan MySQL 5.7 disposable, build macOS arm64 dan codesign lulus.
  Kasus charset yang sebelumnya diwarisi tabel, kutip/backslash/default,
  preservasi generated, pembatalan draft dan tinggi row 22px tercakup.
- Build lokal: `rewrite/build/bin/sequelx.app`. Native GUI Windows/Linux belum
  diuji ulang; menu dropdown mengikuti renderer platform. Tidak membuat Release.

### Publikasi alpha.2 — 2026-10-24

Pengguna telah mengizinkan push, build distribusi dan publish GitHub Release.
Target: `v0.1.0-alpha.2` dengan nama sequelx, lima paket platform dan SHA256SUMS.
Rilis dipublikasikan setelah pipeline desktop dan database lulus.

Saat persiapan publikasi, CI menemukan fixture akun prioritas 5 mengunci host
ke 127.0.0.1 meskipun server container melihat alamat bridge runner. Fixture
kini mengambil host dari USER() server; akun tes tetap dibatasi ke satu host
dan dibersihkan sesudah tes. Tidak mengubah perilaku akun aplikasi.

Suite UI penuh juga menemukan assertion Relations yang masih mencari tombol
Foreign keys pada layout lama. Assertion kini memeriksa judul panel aktif dan
kemampuan membuka editor FK, mengikuti layout Structure baru.

### Release alpha.2 dipublikasikan — 2026-10-24

[sequelx v0.1.0-alpha.2](https://github.com/AdityaArgadinata/sequel-ace-rewrite/releases/tag/v0.1.0-alpha.2)
telah dipublikasikan sebagai pre-release (bukan draft), source commit
`0e34219fff0e0f7e30274c84f55c7a35fa99001b`.
[Pipeline 40006541954](https://github.com/AdityaArgadinata/sequel-ace-rewrite/actions/runs/40006541954)
lulus seluruh tujuh job: prepare, tiga desktop, MySQL 8.4, MariaDB 11.4,
dan upload release. Job Linux diulang pada runner baru karena mirror Ubuntu
sangat lambat; hasil macOS/Windows tetap dipertahankan.

Lima paket (macOS ARM64 DMG/ZIP, Windows AMD64 installer/portable ZIP,
Linux AMD64 tar.gz) dan SHA256SUMS.txt tersedia. Semua aset diunduh kembali;
checksum, integritas arsip, penyertaan LICENSE/README, arsitektur executable,
versi/bundle ID macOS, permission executable Linux dan validitas DMG lulus.
162 tes UI Chromium/WebKit lulus pada setiap platform; native GUI install
Windows/Linux serta publisher signing/notarization tetap belum divalidasi.
Salinan paket terverifikasi tersimpan di `dist/from-github/v0.1.0-alpha.2/`.


### Draft insert langsung di Content — 2026-10-24

- Double-click area kosong di bawah data membuat satu draft row inline dari
  default struktur. Double-click berikutnya, Enter atau Save new row menyimpan;
  Tab/Shift+Tab berpindah kolom, Escape/Cancel new row membuang draft.
- Kegagalan insert membuka dialog Unable to write row dengan Edit row dan
  Discard changes. Isian tetap tersedia untuk diperbaiki. Hasil write yang tidak
  pasti tidak diulang otomatis; refresh yang gagal setelah insert sukses tidak
  menyisakan draft yang bisa tersimpan dua kali.
- Default yang tidak diedit tidak dikirim ulang ke INSERT: server tetap mengisi
  default, auto-increment dan ekspresi waktu; generated tidak ditulis. MySQL 5.7
  bisa menampilkan emoji default sebagai ? pada metadata meski nilai server
  masih utuh; pratinjau mengikuti metadata, insert mempertahankan default server.
- Verifikasi: seluruh tes Go dengan MySQL 5.7 disposable, go vet dan tes race
  metadata/insert lulus. 15 unit frontend dan TypeScript lulus. Regresi UI penuh
  meluluskan 170 tes; dua assertion lama triple-click disesuaikan karena kini
  membuat draft, lalu seluruh 26 tes fokus final Chromium/WebKit lulus.
- Build lokal macOS ARM64 diperbarui di rewrite/build/bin/sequelx.app.
  Native GUI Windows/Linux belum diuji ulang. Belum dipush atau dirilis.


### Dialog CRUD bergaya Sequel Ace — 2026-10-24

- Konfirmasi delete row dipindahkan dari panel inline ke modal berikon sequelx,
  judul Delete selected row?/Delete rows?, identitas baris dan tombol Cancel
  sebagai fokus awal. Escape membatalkan tanpa write; fokus kembali ke pembuka.
- Form Insert/Edit/Duplicate, editor kolom/index/foreign key, preview perubahan
  tabel/database dan administrasi memakai modal yang sama. Preview SQL,
  acknowledgment, konfirmasi nama dan batasan write tetap dipertahankan.
- Kegagalan create/update/delete menampilkan detail server dalam modal. Error
  setelah write sukses dipisahkan dari error write agar tidak mendorong insert
  ulang. Hasil parsial operasi objek tampil dalam modal; jumlah row sukses tetap
  di status bawah. Menutup error tidak mengulang operasi.
- Verifikasi: 173 tes regresi UI lulus pada run penuh; satu masalah fokus editor
  WebKit diperbaiki. Dua belas tes inline insert dan delapan tes CRUD final
  Chromium/WebKit lulus, termasuk pembukaan lewat keyboard, fokus Cancel,
  Escape, pemulihan fokus dan tidak ada write ulang. 15 unit frontend,
  TypeScript dan lint localization lulus. Modal diperiksa lewat screenshot.
- Build lokal macOS ARM64 diperbarui. Native GUI Windows/Linux belum diuji
  ulang; belum dipush atau dipublikasikan sebagai release.


### Tipografi dialog dan Insert inline dari tombol plus — 2026-10-24

- Tombol +/Insert row dan menu konteks Insert row memanggil alur draft inline
  yang sama dengan double-click area kosong. Draft muncul di bawah data,
  mengikuti default struktur dan langsung memfokuskan sel pertama. Satu draft
  aktif pada satu waktu; belum ada write saat tombol diklik.
- Dialog dirapikan dengan judul 17px semibold, body 13px dengan line-height
  konsisten, informasi pendukung 12px, ikon 64px dan tombol 32px. Teks delete
  dipersingkat; nama tabel dipisahkan dari paragraf dan identitas baris tampil
  dalam area ringkas. Peringatan cascade dan partial write tetap terlihat.
- Verifikasi: 60 tes UI Chromium/WebKit, 15 unit frontend, TypeScript dan lint
  localization lulus. Screenshot modal diperiksa. Tes mencakup Insert dari
  toolbar/konteks, default, fokus, save/cancel serta regresi edit/delete.
- Build lokal macOS ARM64 diperbarui; GUI Windows/Linux belum diuji ulang.
  Belum dipush atau dirilis.


## Backlog penggunaan harian lanjutan — 2026-10-24

Urutan kerja setelah penyempurnaan Content dan modal CRUD:

1. [x] Hasil query besar dan kestabilan sesi: pertahankan sesi ketika batas
   tampilan tercapai jika sisa respons bisa dikonsumsi dengan anggaran terbatas;
   tampilkan alasan hasil parsial dan kebutuhan reconnect secara akurat.
   Cancel/timeout/transport error tetap harus menjaga kepastian transaksi.
2. [x] Editor isi sel TEXT/JSON/BLOB: tampilan luas, pencarian, preview dan
   import/export isi sel, dengan preservasi NULL/binary serta deteksi konflik.
3. [x] Pemulihan workspace: filter, posisi scroll, selection dan draft ketika
   kembali ke tabel, tanpa menjalankan ulang write atau memakai snapshot basi.
4. [x] Transfer database lengkap: inventaris dan dukungan trigger/view/routine/
   event, dependensi dan hasil parsial yang terverifikasi.
5. [x] Kelengkapan penggunaan: preferences, shortcut/remapping, operasi folder
   favorites dan pengelolaan privilege akun lanjutan.
6. [ ] Distribusi: QA native Windows/Linux, instalasi bersih, keputusan signing/
   notarization serta mekanisme update. Publish tetap memerlukan instruksi.

Pengerjaan dimulai dari butir 1. Butir lain tetap terbuka sampai implementasi
beserta verifikasinya selesai; tidak dianggap tercakup oleh tes fitur sebelumnya.


### Prioritas lanjutan 1 — Hasil besar tanpa kehilangan sesi secara langsung — 2026-10-24

- Batas tampilan tetap 500 baris/4 MiB. Setelah tercapai, sisa result set pertama
  dibaca dan dibuang hingga batas 10.000 baris/16 MiB raw/2 detik. Jika selesai,
  sesi fisik yang sama dipertahankan: tidak reconnect/replay atau COMMIT otomatis.
- Jika anggaran terlampaui atau ada result set tambahan, respons dihentikan dan
  sesi ditutup. Cancel pengguna, timeout operasi dan kegagalan transport tetap
  menutup sesi. Ini bukan dukungan hasil tak terbatas atau cancel tanpa reconnect.
- Result membawa notice dan flag sessionClosed. Query menunjukkan Partial result;
  batas tampilan tidak lagi dilaporkan sebagai error koneksi jika sesi masih
  aktif. Statement lanjutan dalam script tidak dijalankan setelah hasil parsial.
  Content juga menampilkan notice untuk batas ukuran data pada satu halaman.
- Metadata tidak pernah dianggap lengkap bila terpotong; kegagalan metadata
  sekarang dapat mempertahankan sesi jika responsnya berhasil diselesaikan.
- Verifikasi: seluruh tes Go pada MySQL 5.7 disposable, go vet, tes race fokus,
  30 tes UI Chromium/WebKit, 15 unit frontend dan TypeScript lulus. Tes database
  memverifikasi CONNECTION_ID/database/variabel/temp table, managed transaction
  serta rollback, batas tepat/overflow, error server terlambat, deadline dan cancel.
- Build lokal macOS ARM64 diperbarui. MySQL 8.4/MariaDB 11.4 serta GUI native
  Windows/Linux belum diuji ulang untuk perubahan ini. Belum dipush atau dirilis.
- Prioritas lanjutan 2–6 tetap terbuka; berikutnya editor TEXT/JSON/BLOB.


### Prioritas lanjutan 2 — Editor isi sel TEXT/JSON/BLOB — 2026-10-24

- Open cell editor pada menu konteks Content dan Alt+Enter dari editor inline
  membuka area luas dengan pencarian literal Next/Previous (Cmd/Ctrl+F), Text/
  Hex, NULL eksplisit, preview dan simpan melalui Cmd/Ctrl+Enter. Double-click
  Content tetap inline. Hasil Query memiliki viewer baca-saja lewat double-click
  atau Open cell viewer; sel generated/read-only juga hanya dapat dilihat/export.
- Preview mendukung teks, JSON, hexdump dan gambar PNG/JPEG/GIF/WebP lokal.
  HTML/SVG tetap berupa teks. JSON preview mempertahankan literal angka besar,
  duplicate key dan escape; tidak menulis ulang draft lewat JSON.stringify.
  Kolom JSON divalidasi sintaksnya sebelum write. URL gambar dibersihkan saat
  preview ditutup/berubah.
- Impor/ekspor satu sel memakai dialog file native. Impor hanya mengubah draft;
  ekspor menulis UTF-8/raw binary ke nama file baru tanpa overwrite. BOM, CRLF,
  NUL dan byte non-UTF-8 diuji round-trip. NULL berbeda dari teks/binary kosong;
  ekspor NULL tidak membuat file kosong. Konversi hex/UTF-8 yang tidak valid ditolak.
- Save cell memakai Mutate dan snapshot original lengkap untuk mendeteksi konflik.
  Setelah write gagal, draft tetap dapat dilihat/ekspor; write ulang diblokir
  sampai pengguna menutup editor, memeriksa server dan reload. Apply to new row
  hanya mengubah draft insert, belum menulis database. Default yang tidak diubah
  tetap tidak dikirim sebagai nilai eksplisit.
- Batas nilai tetap 4 MiB encoded (binary sekitar 2 MiB raw). Preview JSON
  dibatasi 64 KiB input/128 KiB formatted/64 tingkat; teks 65.536 karakter dan
  hexdump 4 KiB. Batas preview tidak memotong nilai yang disimpan.
- Verifikasi: seluruh tes Go dengan MySQL 5.7 disposable, go vet, race fokus
  file/API/konflik, 19 unit frontend dan TypeScript lulus. Regresi UI penuh
  210 tes lulus; 22 tes fokus final Chromium/WebKit lulus termasuk validasi JSON,
  PNG lokal/cleanup, generated read-only, draft insert, kegagalan file/write,
  pencarian dan layout 800/1280 px. Screenshot JSON dan jendela kecil diperiksa.
- Build lokal macOS ARM64 diperbarui. Dialog file native dan GUI Windows/Linux
  belum diuji manual ulang; MySQL 8.4/MariaDB 11.4 belum diuji untuk perubahan ini.
  Belum dipush atau dirilis. Prioritas lanjutan 3–6 tetap terbuka.


## Prioritas lanjutan 3 — pemulihan workspace Content (2026-10-24)

- [x] Setiap tab koneksi mempertahankan filter (termasuk perubahan belum Apply),
  sort, halaman, pilihan baris, scroll horizontal/vertikal, lebar kolom, serta
  draft edit/insert ketika berpindah tabel, database, tampilan dan tab koneksi.
- Snapshot disimpan di RAM untuk maksimum delapan tabel per tab koneksi.
  Workspace bersih yang paling lama dikunjungi dapat diganti; draft baris dan
  filter belum diterapkan dilindungi. Jika delapan workspace berisi draft,
  pembukaan tabel baru diblokir sampai salah satu draft diselesaikan/dibatalkan.
- Kembali ke workspace tidak mengulang query atau write. Banner menyatakan data
  berasal dari memori; write tetap memeriksa seluruh nilai baris asli agar
  perubahan server tidak tertimpa. SQL manual, perubahan schema/admin dan
  COMMIT/ROLLBACK menandai snapshot usang dan memblokir write sampai reload.
  Draft tetap tersedia; membuang draft untuk reload memerlukan konfirmasi.
- Menutup tab koneksi/aplikasi mengakhiri penyimpanan ini; belum ada pemulihan
  lintas restart atau penyimpanan draft ke disk. Ikon aplikasi/toolbar tetap.
- Verifikasi khusus: 22 tes unit frontend dan 16 tes UI Chromium/WebKit lulus,
  termasuk isolasi database/tab, cache penuh, filter belum Apply, draft insert,
  pemulihan geometri grid, invalidasi SQL, dan konflik baris tanpa retry write.
  Tes Go lulus tanpa server integrasi hidup pada putaran ini. Regresi lengkap:
  228/230 lulus; dua kegagalan adalah tes edit yang masih menganggap refresh
  katalog menghapus cache. Setelah disesuaikan dengan reload eksplisit, seluruh
  14 tes interaksi tabel Chromium/WebKit lulus (termasuk dua kasus tersebut).
  Build lokal darwin/arm64 `rewrite/build/bin/sequelx.app` diperbarui; verifikasi
  codesign, localization lint dan diff whitespace lulus. Windows/Linux serta
  interaksi native app belum diuji manual untuk perubahan ini. Belum dipush atau
  dirilis. Prioritas lanjutan 4–6 tetap terbuka.


## Prioritas lanjutan 4 — transfer SQL database lengkap (2026-10-24)

- [x] Connection actions → Transfer database menyediakan inventaris tabel, view,
  function, procedure, trigger dan event, jumlah tiap jenis serta dependensi view.
  Inspect bersifat read-only; Save database SQL baru aktif sesudah review eksplisit.
- Ekspor SQL mencakup struktur dan data opsional: tabel terlebih dahulu, lalu data,
  foreign key, routine, view berdasarkan dependensi, trigger sesuai ACTION_ORDER,
  dan event. Generated columns tidak disuplai lewat INSERT. NULL/binary/Unicode
  dipertahankan, TIMESTAMP dibaca/restore dalam UTC dan zona waktu sesi asal
  dikembalikan. Mode/collation pembuatan objek dan zona waktu event dipertahankan.
- Event di dump dinonaktifkan; pengguna meninjau sebelum mengaktifkan jadwalnya.
  Nama database, DEFINER dan referensi SQL eksternal dipertahankan tanpa rewrite.
  Restore memerlukan database nama asal belum ada; akun/grants tidak ikut diekspor.
  Direct copy/move tetap memblokir special objects; transfer lengkap melalui SQL.
- Fingerprint definisi diperiksa sebelum dan sesudah ekspor. Metadata berubah,
  privilege tidak cukup, jenis objek tak didukung, dependensi view ambigu/siklus,
  atau collation database berbeda dari konteks pembuatan objek gagal eksplisit.
  File sementara hanya dipublikasikan setelah selesai, tanpa overwrite file lama.
- Import mengenali SET SESSION sql_mode literal dan memverifikasi mode server
  sebelum setiap statement. Deprecation 1287/1681/3090 hanya di SET mode literal
  dicatat tanpa menghentikan; warning lainnya/error/cancel menghentikan impor.
  Laporan memuat prefix yang diakui server, statement/baris kegagalan, uncertainty,
  dan warning maksimum 32 KiB. Token sekali pakai; tidak ada retry/COMMIT/ROLLBACK
  otomatis. Hasil DDL/data sebelum kegagalan bisa sudah tersimpan.
- Batas: 1.000 objek, 8 MiB definisi, file 64 MiB/100.000 statement, 4 MiB per
  statement dan timeout operasi 60 detik. Inventaris hanya menampilkan objek yang
  terlihat untuk akun tersebut; gunakan akun dengan privilege metadata lengkap.
  Pause DDL/write untuk backup konsisten: belum ada snapshot transaksi lintas
  tabel/engine atau remap referensi/grants lintas database/server.
- Verifikasi: seluruh `SEQUEL_TEST_PORT=33317 go test -race ./...` dan `go vet
  ./...` lulus pada MySQL disposable 5.7.44. Round-trip memeriksa binary/Unicode,
  TIMESTAMP lintas zona waktu, generated/FK, view bertingkat, trigger, function,
  routine SQL mode berbeda dan event disabled; metadata berubah sebelum/selama
  ekspor ditolak. Restore duplikat berhenti pada CREATE DATABASE tanpa replay.
  Seluruh 22 unit frontend, 56 tes UI transfer/workspace dan 10 tes UI transfer
  final Chromium/WebKit lulus. Build darwin/arm64, codesign, localization lint dan
  diff whitespace lulus. Ikon tidak berubah; belum dipush atau dirilis.
- Belum diverifikasi manual di app native atau di Windows/Linux. MySQL 8.x dan
  MariaDB belum diuji untuk perubahan ini; migrasi lintas versi/privilege/charset
  memerlukan uji restore tersendiri. Prioritas 5–6 tetap terbuka.


## Prioritas lanjutan 5 — kelengkapan penggunaan harian (2026-10-25)

- [x] Preferences menambah SQL tab width 2/4/8, default halaman Content
  25/50/100/200, reset settings dan reset shortcut. Nilai legacy theme/font/size/
  wrap tetap terbaca. Perubahan page size hanya berlaku pada workspace tabel baru;
  halaman/draft yang sudah terbuka tetap dipertahankan. Settings memakai gear yang
  sama di samping Console; ikon aplikasi dan toolbar tidak diubah.
- [x] Remapping untuk enam view, reload/filter, run current/selection, run all dan
  Preferences. Binding memakai Mod/Shift/Alt, dapat dikosongkan untuk disable;
  konflik, shortcut editing/app/window yang dicadangkan, repeat, composition dan AltGr
  diperiksa. Preferences tersimpan di localStorage. Accelerator menu native ikut
  diperbarui, termasuk saat binding Preferences dimatikan; tombol gear tetap ada.
  Label shortcut mengikuti konfigurasi. Dialog mencegah navigasi workspace tersembunyi.
- [x] Folder favorites persisten (termasuk folder kosong), filter/collapse, create,
  rename/move subtree dan remove dengan memindahkan favorit ke Unfiled. ID profil,
  seluruh pengaturan koneksi dan credential OS tetap dipertahankan. Pindah favorit
  individual melalui Folder + Save Changes. Path maksimum 200 byte UTF-8/10 level;
  tidak melakukan merge folder otomatis. Format profil v1 tetap kompatibel;
  metadata folder kosong tersimpan terpisah di .folders-v1.
- Batch folder memvalidasi profil lebih dahulu dan menulis setiap profil secara
  atomik. Keseluruhan batch bukan transaksi file; interupsi/kegagalan dilaporkan
  sebagai prefix selesai. Tidak menghapus profil/credential atau retry otomatis;
  reload sebelum menyelesaikan batch parsial. Save/Connect diblokir selama batch.
- [x] User Manager menambah scope privilege global/database/table/column/
  procedure/function, GRANT OPTION dan revoke delegasi, rename, lock/unlock, serta
  assign/revoke/default/clear default untuk role yang sudah ada pada MySQL 8+ dan
  MariaDB 10.2+. Host role hanya dipakai MySQL. Wildcard nama database di-escape
  sesuai partial_revokes, agar grant tidak melebar ke database lain.
- Semua perubahan akun tetap satu statement dengan preview, acknowledgment dan
  token sekali pakai. Snapshot mencakup grants, SHOW CREATE USER (termasuk lock/
  password policy), grants role, default role dan partial_revokes untuk menolak
  preview basi. SQL/password tidak masuk activity log; preview password disamarkan.
  Akun/grants tidak ditulis otomatis. Lock tidak memutus sesi yang sudah terbuka.
- Batas UI privilege: subset static privileges yang ditampilkan; role creation,
  dynamic privileges MySQL, resource limits dan pilihan authentication plugin
  tetap melalui SQL editor. Server/akun yang tak mendukung metadata atau syntax
  tersebut gagal eksplisit; diperlukan privilege administrasi server yang sesuai.
- Verifikasi: seluruh `SEQUEL_TEST_PORT=33317 go test -race ./...` lulus di
  MySQL disposable 5.7.44; tes akun/race final juga lulus setelah validasi rename.
  Tes live membuktikan privilege kolom tidak melebar, escape wildcard database,
  grant routine, grant/revoke global, revoke delegasi, lock/unlock, rename dan penolakan snapshot
  akun yang berubah. Tes unit memeriksa syntax role MySQL/MariaDB dan gate versi,
  konflik shortcut, AltGr/composition/repeat, kompatibilitas preferences/profil,
  subtree/empty folder, serta penolakan dokumen corrupt/future version sebelum write.
- Seluruh 24 unit frontend dan 258 regresi UI Chromium/WebKit lulus; 18 tes prioritas
  5 final diulang dan lulus setelah guard AltGr/reset delegasi. UI diverifikasi
  pada lebar 800/1280. Native menu parser dan disable/remap accelerator diuji unit.
  `go vet`, lint English localization, diff whitespace dan codesign lulus. Build
  lokal darwin/arm64 `rewrite/build/bin/sequelx.app` diperbarui. Belum dipush/dirilis.
- Belum diuji manual pada app native macOS/Windows/Linux. Role/default-role dan
  partial_revokes MySQL 8/MariaDB baru diverifikasi pada generator/validator SQL,
  belum pada server live tersebut. Native accelerator bergantung perilaku OS dan
  layout keyboard; QA native lintas platform tetap bagian prioritas 6 yang terbuka.


## Prioritas lanjutan 6 — distribusi (mulai 2026-10-25)

- [x] Cek pembaruan manual di Settings/Preferences. Hanya membaca maksimal 100
  metadata rilis GitHub saat tombol diklik; stable dipisahkan dari prerelease.
  Perbandingan mengikuti SemVer. CI menyertakan tag penuh di binary; build lokal
  ditandai development. Tidak mengunduh/mengganti app atau menutup sesi otomatis.
- [x] CI disiapkan untuk startup native Linux melalui Xvfb dan Windows dari
  hasil instalasi NSIS ke direktori baru. Konfigurasi kosong, tanpa koneksi SQL;
  laporan JSON mencatat OS/arsitektur/hash binary dan jendela yang teramati.
  Smoke test ini hanya membuktikan startup, bukan seluruh QA desktop/installer.
- [x] Keputusan pengguna: distribusi melalui GitHub Releases, memakai signature ad hoc macOS,
  Windows unsigned dan instalasi pembaruan manual. Signing production bukan syarat
  distribusi GitHub saat ini. Tidak menyimpan sertifikat atau
  credential GitHub dalam app. Signing production/notarization belum diaktifkan.
- [x] Workflow Windows/Linux dan startup native lulus pada rilis v0.1.0 (lihat
  catatan publikasi di bawah).
- [ ] QA manual koneksi, credential vault,
  shortcut native, CRUD, import/export, upgrade/uninstall dan instalasi bersih pada
  desktop Windows/Linux tetap diperlukan. Tidak tersedia lingkungan desktop kedua
  OS pada host lokal ini.
- Opsional di luar cakupan distribusi GitHub saat ini: signing production Windows
  dan Developer ID/notarization macOS. Paket sekarang tidak boleh dianggap telah
  notarized; peringatan publisher dari OS masih mungkin muncul.
- Verifikasi lokal: Go race suite lulus (integrasi database dilewati karena server
  disposable tidak aktif), 24 unit frontend dan 52 tes UI terkait Chromium/WebKit
  lulus, dua unit probe smoke test dan actionlint lulus. Build darwin/arm64 lokal
  diperbarui dan signature ad hoc diperiksa. QA native Windows/Linux masih terbuka;
  prioritas 6 belum ditandai selesai. Status push/publikasi terbaru ada di bawah.


## Release v0.1.0 dipublikasikan — 2026-10-25

- [x] Seluruh implementasi prioritas 1–6 yang tersedia dipush ke repo rewrite.
  [v0.1.0](https://github.com/AdityaArgadinata/sequel-ace-rewrite/releases/tag/v0.1.0)
  dipublish sebagai rilis biasa/latest, bukan prerelease. Commit binary
  `a3cca808a947e661671b67125e95e4624f0fbd70`.
- [x] Lima paket tersedia: macOS arm64 DMG/ZIP, Windows amd64 installer/portable
  ZIP, Linux amd64 tar.gz, ditambah SHA256SUMS.txt. Build lokal diperbarui dengan
  identitas v0.1.0; signature ad hoc diverifikasi. Ikon tidak berubah.
- [x] [CI rilis](https://github.com/AdityaArgadinata/sequel-ace-rewrite/actions/runs/40150462434)
  lulus: 262 tes UI Chromium/WebKit pada masing-masing dari tiga OS, tes/vet Go,
  credential vault native, smoke startup Linux dan Windows dari installer baru,
  serta integrasi MySQL 8.4/MariaDB 11.4. Tes TLS khusus masih membutuhkan fixture.
- Verifikasi lintas server menemukan dan memperbaiki default teks MySQL 8 yang
  ditampilkan sebagai hex, serta fixture event yang sempat berjalan langsung.
  Default hex kini memakai metadata yang didekode oleh server; event tes dijadwalkan
  satu hari kemudian dan setting scheduler disposable dikembalikan setelah tes.
- Job Windows pertama berhenti saat cleanup metrics WebView2 yang masih terkunci,
  sesudah startup berhasil. Pengulangan job lulus. Main menambah toleransi cleanup
  sementara pada runner ephemeral dan regresi untuk memastikan kegagalan startup
  tetap dilaporkan gagal; perubahan ini hanya infrastruktur CI, binary tetap sama.
- [ ] QA desktop manual penuh (koneksi, CRUD, native shortcut, upgrade/uninstall)
  pada Windows/Linux tetap terbuka; smoke startup tidak membuktikan semua alur GUI.
  Paket macOS ad hoc/tidak notarized dan Windows unsigned, sesuai keputusan
  distribusi GitHub. Prioritas 6 tidak ditutup seluruhnya hanya karena publish.
- [x] Kelima paket publik diunduh ulang dan SHA-256 semuanya cocok dengan
  SHA256SUMS.txt serta digest aset GitHub. Arsip ZIP/tar dan DMG diperiksa;
  salinan lokal terverifikasi ada di `dist/from-github/v0.1.0/`.
