# Milestone Rewrite Sequel Ace dengan Go

Status: milestone 0 selesai. Implementasi milestone 1 dan CI sudah lulus;
manual QA GUI Windows/Linux masih terbuka sebelum milestone 1 dinyatakan selesai.
Repo: https://github.com/AdityaArgadinata/sequel-ace-rewrite.
Run terverifikasi: https://github.com/AdityaArgadinata/sequel-ace-rewrite/actions/runs/39545854229
(commit kode `ff149bd`, 2026-10-21).

## Ringkasan progres — 2026-10-21

| Milestone | Status | Sisa pekerjaan |
| --- | --- | --- |
| 0 — Fondasi dan CI | Selesai | Tidak ada |
| 1 — Alur query pertama | Implementasi dan CI selesai | Smoke test GUI Windows dan Ubuntu |
| 1A — Kesetaraan GUI Sequel Ace | Sedang dikerjakan; layout awal selesai | Referensi lengkap, detail visual/interaksi, overlay, dan GUI Windows/Linux |
| 2 — Penggunaan harian | Implementasi selesai; validasi berlangsung | CI terbaru dan GUI Windows/Linux; batas fitur didokumentasikan |
| 3 — Pengubahan data | Belum dimulai | Editor baris, transaksi UI, dan penanganan konflik |
| 4 — Struktur dan pertukaran data | Belum dimulai | Metadata struktur, import/export, dan migrasi |
| 5 — Beta Windows/Linux | Belum dimulai | Paket distribusi dan verifikasi rilis |

Build/test CI sudah lulus pada ketiga OS. Ini belum membuktikan interaksi GUI
Windows/Linux; milestone 1 tetap terbuka sampai smoke test berikut dicatat.

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

- [ ] Verifikasi CI terbaru pada macOS/Windows/Ubuntu, termasuk native vault
  Windows Credential Manager dan Linux Secret Service.
- [ ] Manual QA GUI milestone 2 di Windows dan Ubuntu: profil/password, SSH,
  tab, history, pagination/filter, cancel dan penutupan aplikasi.

**Selesai jika:** profil, credential store, SSH, tab, dan pagination dapat
dipakai berulang tanpa kebocoran koneksi. Pengujian otomatis lulus dan fitur
khusus OS sudah dicoba pada Windows serta Ubuntu.

## Milestone 3 — Pengubahan data yang aman

- [ ] Tambahkan insert, edit, dan delete pada browser tabel.
- [ ] Batasi edit/delete awal pada tabel dengan primary key, termasuk composite key.
- [ ] Jadikan hasil yang identitas barisnya ambigu sebagai read-only.
- [ ] Gunakan parameter untuk nilai dan validasi/quote identifier.
- [ ] Sediakan konfirmasi delete dan tampilkan hasil jumlah baris terpengaruh.
- [ ] Deteksi data berubah sejak dimuat sebelum menimpa/menghapusnya; uji dengan
  dua sesi yang mengubah baris sama.
- [ ] Sediakan begin/commit/rollback pada sesi query, dengan status transaksi
  terlihat dan penanganan disconnect yang tidak mengklaim rollback/commit sukses.
- [ ] Tambahkan integration test untuk composite key, `NULL`, karakter khusus,
  konflik perubahan, rollback, dan kegagalan koneksi saat write.

**Selesai jika:** insert/edit/delete memengaruhi baris yang dimaksud, konflik
ditampilkan, dan kegagalan tidak menyebabkan pengulangan write tanpa persetujuan.
Uji manual alur perubahan data terhadap server pengujian pada ketiga OS.

## Milestone 4 — Struktur dan pertukaran data

- [ ] Tampilkan struktur kolom, index, primary key, dan foreign key.
- [ ] Tambahkan export CSV secara streaming dengan penanganan tipe dan encoding.
- [ ] Tambahkan import CSV dengan preview pemetaan kolom dan laporan kegagalan;
  jelaskan jika operasi hanya selesai sebagian.
- [ ] Jika dibutuhkan untuk migrasi, tambahkan importer favorites Sequel Ace
  menggunakan fixture format lama; password Keychain tidak dianggap ikut pindah.
- [ ] Tentukan dukungan eksekusi script sebelum menambah multi-statement:
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
lulus tiga kali. Verifikasi run gabungan setelah perbaikan tetap diperlukan.
