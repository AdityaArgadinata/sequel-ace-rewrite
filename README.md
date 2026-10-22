# Sequel Rewrite

Fondasi desktop Go + Wails + React/TypeScript untuk rewrite Sequel Ace.
Alur awal koneksi dan query database sudah tersedia. Repo ini adalah implementasi
Go terpisah; Sequel Ace menjadi referensi perilaku dan fitur.

## Toolchain dan target

- Go 1.25.3 (direktif modul minimum 1.25.0), Wails **2.17.0**.
- Node **24.4.1**; gunakan `npm ci` dengan `package-lock.json` yang dikomit.
- CI: macOS 15 arm64, Windows Server 2022 x64 untuk build Windows, Ubuntu 24.04 x64.
- Target penggunaan awal: macOS arm64, Windows 10/11 x64, Ubuntu 24.04 x64.
  Build di Windows Server tidak menggantikan manual QA Windows 10/11.
- Matriks database yang direncanakan untuk milestone 1: MySQL 8.4 dan MariaDB
  11.4. Versi lebih lama belum diklaim kompatibel.

Dependensi Go dikunci melalui `go.mod`/`go.sum`; frontend melalui lockfile.

## Menjalankan dari Mac

Pasang Go, Node dan Xcode Command Line Tools, lalu:

```sh
git clone https://github.com/AdityaArgadinata/sequel-ace-rewrite.git
cd sequel-ace-rewrite
go install github.com/wailsapp/wails/v2/cmd/wails@v2.17.0
```

Pastikan direktori `go env GOPATH` + `/bin` ada di PATH. Selanjutnya:

```sh
wails doctor
cd frontend
npm ci
cd ..
wails dev
```

Isi host, port, user, dan password, lalu klik **Hubungkan**. TLS terverifikasi
aktif secara default; tempel sertifikat PEM pada CA khusus jika diperlukan.
Password dikosongkan dari form setelah submit. Penyimpanan rahasia bersifat opt-in melalui vault OS, terpisah dari profil JSON.
Browser Vite saja tidak memiliki backend Wails; gunakan jendela desktop.
Untuk build produksi jalankan `wails build`, lalu buka `.app` di `build/bin/`.

## Pemeriksaan lokal

```sh
mkdir -p frontend/dist
touch frontend/dist/index.html
wails generate module
cd frontend
npm ci
npm run build
cd ..
go test ./...
go vet ./...
wails build
```

Unit test database berjalan tanpa server. Integration test dilewati jika
`SEQUEL_TEST_PORT` tidak diisi; hasil skip bukan bukti kompatibilitas server.
Binding `frontend/wailsjs/` dihasilkan Wails dan dapat diregenerasi.
`frontend/dist/` harus dibuat sebelum test/build Go karena di-embed oleh aplikasi.

## Windows dan Ubuntu

Windows memerlukan toolchain Go/Node serta WebView2 Runtime. Ubuntu memerlukan:

```sh
sudo apt-get update
sudo apt-get install -y libgtk-3-dev libwebkit2gtk-4.1-dev pkg-config
```

Gunakan `wails build -tags webkit2_41` pada Ubuntu 24.04; gunakan tag yang sama
untuk `go test` dan `go vet`. Hasil Linux bergantung pada runtime GTK/WebKitGTK;
artifact CI belum merupakan installer mandiri.

## CI

Workflow `.github/workflows/rewrite.yml` membangun aplikasi pada macOS 15,
Windows Server 2022, dan Ubuntu 24.04, serta menjalankan integration test pada
MySQL 8.4/MariaDB 11.4. Buka tab **Actions → Go desktop rewrite** untuk melihat
hasil dan mengunduh artifact. Build hijau belum menggantikan manual QA GUI.
Paket belum ditandatangani dengan identitas penerbit; Linux masih memerlukan
runtime GTK/WebKitGTK. Ikon scaffold berasal dari Wails dan belum final.

## Batas arsitektur

`main.go` mengatur lifecycle/jendela dan embed frontend. `app.go` menjadi adapter
Wails. Logika database ditempatkan di `internal/database`
tanpa import Wails agar integration test dapat berjalan tanpa desktop.
UI hanya memanggil operasi adapter, bukan mengelola koneksi SQL secara langsung.

## Catatan verifikasi

Verifikasi lokal 2026-10-21: unit/integration test dengan race detector pada
MySQL 5.7.44 terisolasi lulus, termasuk TLS dengan CA khusus dan penolakan CA
tak dipercaya, presisi tipe, sesi/transaksi, error SQL, batas hasil, dan cancel.
Test streaming mencakup urutan batch, kesamaan snapshot akhir, batas hasil, dan
cancel dari callback. Build frontend, Go vet, serta build produksi macOS berhasil. Desktop dicoba
untuk connect melalui TLS, pilih database/tabel, tampilkan hasil, dan cancel
`SELECT SLEEP(20)`: UI kembali offline dan meminta koneksi ulang.
Smoke test streaming tambahan: query lambat menampilkan 9 baris saat masih
berjalan; cancel membersihkan hasil parsial. Setelah reconnect, query cepat
selesai dengan 41 baris tanpa duplikasi.

CI terverifikasi 2026-10-21 pada commit kode `2a36ee6`:

| Job | Hasil |
| --- | --- |
| Desktop macOS 15 | Test, vet, build, dan artifact lulus |
| Desktop Windows Server 2022 x64 | Test, vet, build .exe, dan artifact lulus |
| Desktop Ubuntu 24.04 x64 | Test, vet, build, dan artifact lulus |
| MySQL 8.4 | Integration test dengan race detector lulus |
| MariaDB 11.4 | Integration test dengan race detector lulus |

[Run CI dan artifact](https://github.com/AdityaArgadinata/sequel-ace-rewrite/actions/runs/39542207475).
Workflow diperiksa dengan actionlint. Checkout bersih juga diuji lokal, termasuk
cross-build Windows x64. `.gitattributes` menjaga LF agar pemeriksaan format Go
konsisten pada checkout Windows. Uji TLS positif masih hanya diuji lokal dengan
`SEQUEL_TEST_CA_FILE`; CI database dasar memakai koneksi fixture tanpa TLS.

CLI/cache sementara sesi ini berada di `/private/tmp/sequel-rewrite-*`;
untuk sesi berikutnya pasang CLI sesuai langkah di atas.

Manual QA GUI Windows/Linux masih harus dijalankan. Sebelum beta,
jalankan smoke test GUI pada Windows dan Ubuntu melalui VM, remote desktop,
atau tester. Tidak perlu membeli laptop lain untuk memulai pengembangan.

## Batas alur query awal

- Satu sesi/query per tab, maksimum 16 tab dengan koneksi terpisah. Tidak ada retry atau reconnect otomatis.
- Batas waktu koneksi 10 detik; operasi 60 detik.
- Hasil maksimal 500 baris dan 4 MiB isi sel (bukan batas ukuran JSON keseluruhan).
  Nilai dikirim sebagai string; binary sebagai hex dan NULL ditandai terpisah.
  Driver membaca satu baris utuh sebelum batas diperiksa; satu BLOB sangat besar
  masih dapat memakai memori besar. Pembatasan memori keras belum tersedia.
- Hasil query tampil bertahap melalui event Wails: baris pertama segera setelah
  diterima driver, lalu flush pada 50 baris, 64 KiB isi sel, atau 100 ms ketika
  baris berikutnya dibaca. Satu baris besar tetap dikirim utuh. Ini bukan timer
  independen: server/driver yang belum mengirim baris tetap dapat menunda tampilan.
- ID query dan offset memisahkan batch. Snapshot akhir menggantikan hasil parsial
  sehingga event terlambat tidak menggandakan hasil. Snapshot akhir juga memuat
  seluruh hasil terbatas; transfer terakhir belum dioptimalkan untuk menghindari
  pengiriman ulang. Hasil parsial dibersihkan jika query gagal/cancel.
- Cancel/timeout/hasil terpotong memutus sesi. Hubungkan ulang secara eksplisit;
  transaksi dan temporary table lama tidak diteruskan. Untuk write yang terputus,
  periksa hasil di server sebelum mengulang; cancel bukan jaminan rollback.
- Satu statement; jangan menempel script SQL. Jika CALL memberi result set
  tambahan, hanya set pertama ditampilkan dan sesi dibuang dengan status terpotong.
- Statement tanpa result set ditampilkan sebagai selesai tanpa data; jumlah
  affected rows belum tersedia. Ini belum merupakan editor baris tabel.
- Metadata tidak dimuat ulang setelah query agar ROW_COUNT()/diagnostik sesi tidak
  terganggu. Klik **Segarkan daftar** setelah USE/DDL manual jika perlu; tindakan
  ini menjalankan query metadata sehingga dapat mengubah diagnostik sesi.
- Import/export belum tersedia. Row editor Content dibatasi ke tabel InnoDB ber-primary key; hasil SQL bebas tetap read-only.

## Integration test pada server disposable

Jalankan hanya pada server khusus pengujian. Test membuat dan menghapus schema
unik `sequel_rewrite_test_*`; user fixture memerlukan hak tersebut. Jangan gunakan
server produksi atau kredensial pengguna aplikasi. Dari root repo:

```sh
SEQUEL_TEST_PORT=13367 go test -race ./internal/database -v -count=1
```

Isi `SEQUEL_TEST_PASSWORD` lewat environment jika server fixture memakai password.
Untuk test TLS tambahan, isi `SEQUEL_TEST_CA_FILE` dengan path CA fixture; sertifikat
server harus valid untuk `127.0.0.1` dan ditandatangani CA tersebut. Koneksi tanpa CA
harus gagal, sedangkan koneksi dengan CA harus berhasil. Fixture TLS tidak boleh
memakai CA yang sudah dipercaya sistem, agar pemeriksaan negatif tetap bermakna.
Test integrasi dasar memakai koneksi tanpa TLS ke server disposable localhost;
GUI tetap menyalakan TLS secara default.

## Mencoba artifact desktop

Buka run CI di atas, lalu unduh artifact OS yang diinginkan. Pengguna artifact
tidak perlu memasang Go atau Node.

- Windows: ekstrak artifact `sequel-rewrite-windows-2022` dan jalankan
  `sequel-rewrite.exe`. WebView2 Runtime tetap diperlukan.
- Ubuntu 24.04 x64: ekstrak ZIP artifact, lalu ekstrak `sequel-rewrite-linux.tar.gz`.
  Pastikan runtime GTK 3 dan WebKitGTK 4.1 tersedia, lalu jalankan `./sequel-rewrite`.
- macOS: ekstrak ZIP artifact, lalu ZIP bundle di dalamnya untuk mendapatkan `.app`.

Ini artifact pengujian, belum installer rilis bertanda tangan. Build/test CI tidak
membuktikan interaksi GUI pada Windows/Linux; catat hasil uji startup, koneksi,
query, cancel, clipboard, dan tampilan pada OS tujuan sebelum beta.

## Profil koneksi

Form koneksi menyediakan **Simpan profil**, **Simpan perubahan**, dan **Hapus
profil** dengan konfirmasi. Memilih **Koneksi baru** menyiapkan form kosong;
memilih profil mengisi host/port/user/TLS/CA dan mengosongkan password. Nama profil
tidak wajib untuk koneksi sekali pakai. Profil dimuat ulang saat aplikasi dibuka.

Hanya nama, host, port, user, TLS, dan sertifikat CA yang disimpan. Model profil
terpisah dari model koneksi dan tidak mempunyai field password. Private key tidak
diterima dalam input CA. Password dapat disimpan secara eksplisit di credential store OS; lihat bagian penggunaan harian.

Lokasi file JSON versi 1 (satu file per ID profil):

- macOS: `~/Library/Application Support/SequelRewrite/profiles/`
- Windows: `%AppData%\SequelRewrite\profiles\`
- Linux: `$XDG_CONFIG_HOME/SequelRewrite/profiles/`, atau
  `~/.config/SequelRewrite/profiles/` jika XDG_CONFIG_HOME tidak diisi.

Penulisan memakai file sementara di direktori yang sama lalu rename, sehingga
error tidak menghapus file lama. Pada POSIX, file dibuat dengan mode 0600 dan
folder baru 0700; Windows memakai ACL direktori konfigurasi pengguna. File rusak,
versi tak dikenal, atau symlink dilaporkan dan tidak ditimpa/dihapus melalui UI.
Koneksi tanpa profil tetap tersedia bila penyimpanan tidak dapat dibaca.
Mengedit profil yang sama dari dua proses mengikuti penulisan terakhir; penggabungan
perubahan antarproses belum tersedia.

Verifikasi lokal 2026-10-21: unit test dengan race detector mencakup CRUD, muat
ulang, password tidak terserialisasi, data rusak/versi asing, traversal ID, CA yang
berisi private key, write failure, dan penyimpanan bersamaan. Smoke test desktop
Mac mencakup simpan, ubah, restart/pilih ulang dengan password kosong, dan batal
hapus. Test store memverifikasi penghapusan berhasil. Profil QA sementara sudah
dibersihkan. Build frontend, Go vet, dan paket desktop macOS lulus.

CI fitur profil pada commit `500495d` lulus di macOS 15, Windows Server 2022,
dan Ubuntu 24.04, termasuk test CRUD/persistensi. Regresi database juga lulus.
[Run CI fitur profil dan artifact](https://github.com/AdityaArgadinata/sequel-ace-rewrite/actions/runs/39543659071).
Manual QA GUI Windows/Linux tetap belum dilakukan.

## GUI menuju Sequel Ace asli

Milestone 1A sedang dikerjakan. Layout awal mengikuti layar koneksi Sequel Ace:
sidebar favorites, toolbar ikon, form vertikal, serta workspace Query dengan
sidebar tabel dan grid hasil. Fitur yang belum tersedia tampil disabled. SSL tetap
aktif secara default. [Referensi dan perbedaan](docs/gui-parity.md) mencatat scope
dan batasnya; hasil ini **belum sama persis**. Smoke test Mac dengan data sintetis
memverifikasi favorites, koneksi TLS, pemilih database/tabel, query dan NULL/DECIMAL,
streaming, shortcut run, serta cancel. Light mode, overlay piksel, shortcut/menu
lengkap, dan GUI Windows/Linux belum tervalidasi.

[CI layout awal dan artifact desktop](https://github.com/AdityaArgadinata/sequel-ace-rewrite/actions/runs/39545854229)
lulus untuk commit `ff149bd` pada ketiga OS dan kedua database. Milestone 1A
tetap sedang dikerjakan karena kesetaraan visual/interaksi belum selesai.

## Penggunaan harian — milestone 2

- **Password:** isi nama profil dan centang **Save passwords in OS credential
  store** untuk menyimpan saat save/connect. **Use saved passwords** memuatnya;
  **Forget saved passwords** menghapusnya. Bundle terikat konfigurasi profil:
  setelah profil berubah, password perlu disimpan ulang. Tidak ada fallback file
  plaintext. Jika vault tidak tersedia/ditolak, nonaktifkan save dan masukkan
  password manual. Hapus profil meminta pembersihan vault terlebih dahulu; jika
  gagal, profil dipertahankan agar credential tidak ditinggalkan diam-diam.
- **Vault OS:** Keychain di macOS, Credential Manager di Windows, Secret Service
  melalui D-Bus di Linux (misalnya GNOME Keyring yang sedang terbuka), memakai
  [go-keyring v0.2.6](https://github.com/zalando/go-keyring).
- **SSH:** pilih SSH lalu isi host/port/user SSH dan password atau path absolut
  private key. Key terenkripsi memakai Passphrase. Host database ditafsirkan dari
  server SSH. Known Hosts kosong memakai `~/.ssh/known_hosts`. Host asing/berubah
  ditolak: verifikasi identitasnya melalui cara tepercaya sebelum memperbarui
  file itu. Tidak ada trust otomatis, SSH agent atau keyboard-interactive. TLS
  MySQL tetap memverifikasi nama Host database, bukan alamat server SSH.
- **Tab:** **＋** membuka koneksi baru ke server workspace yang sama. Tiap tab
  memiliki editor/hasil/database aktif terpisah. Menutup tab membuang koneksi dan
  transaksi belum commit. Setelah cancel/putus, tutup tab lalu buka tab baru atau
  hubungkan ulang via form. Tidak ada replay SQL atau pemulihan sesi otomatis.
  Credential workspace hanya ditahan di memori hingga semua tab ditutup.
- **Content:** pilih database/tabel, sort dan filter/operator/nilai, lalu **Apply**.
  Nilai filter memakai parameter; contains memperlakukan `%`, `_`, `!` sebagai
  teks. Halaman 25–200 baris memakai Previous/Next/Reload. Perubahan filter/sort
  perlu Apply sebelum pindah halaman. Pilih kolom unik untuk urutan stabil;
  perubahan data bersamaan tetap dapat menggeser pagination offset. Batas 4 MiB
  tetap berlaku dan dapat memutus sesi jika halaman terlalu besar.
- **History:** centang **Record history (metadata only)** per tab. Panel History
  memuat 100 eksekusi terakhir, dengan Clear history. Hanya waktu, jenis statement
  dari allowlist, jumlah baris, durasi dan status yang disimpan. SQL, nilai,
  identifier database/koneksi dan error tidak disimpan; history tidak mendukung
  replay SQL. `history.json` berada di folder konfigurasi SequelRewrite, dengan
  permission 0600 pada POSIX.

Verifikasi lokal: unit/race/integration MySQL 5.7.44, TLS, SSH forwarding,
password/key terenkripsi, penolakan host asing/password salah, isolasi tab,
rollback saat tutup tab dan cancel terisolasi lulus. Native Keychain diuji dengan
credential dummy yang dibersihkan setelah test. GUI Mac fixture memverifikasi
Content, halaman 50+46 baris, sorting/filter, dua tab terpisah dan history metadata.
CI menguji build tiga OS dan vault native masing-masing. Manual QA GUI Windows/
Linux tetap diperlukan sebelum milestone 2 dinyatakan tervalidasi sepenuhnya.

Pemeriksaan tambahan (hanya server/vault disposable):

```sh
npm --prefix frontend test
SEQUEL_TEST_PORT=13367 go test -race ./internal/database ./internal/workspace ./internal/tunnel -count=1 -timeout=180s
SEQUEL_TEST_KEYRING=1 go test ./internal/credentials -run TestNativeVault -v -count=1
```

Fixture MySQL memerlukan `max_allowed_packet` setidaknya 8 MiB untuk test baris
besar. Native vault test hanya menyimpan credential dummy ber-ID acak. Test SSH
membuat listener loopback sementara; file key/known_hosts dibersihkan setelah test.

CI milestone 2 pada commit `62c4750` lulus untuk build/test/vet desktop macOS,
Windows dan Ubuntu, test vault native masing-masing OS, serta integration MySQL
8.4/MariaDB 11.4 (SSH forwarding, isolasi tab, filter/pagination dan cancel).
[Run dan artifact milestone 2](https://github.com/AdityaArgadinata/sequel-ace-rewrite/actions/runs/39549139051).
[Checklist manual QA yang masih terbuka](docs/milestone-2-qa.md).

## Pengubahan data — milestone 3

Content menyediakan Insert row/Edit row/Delete row pada tabel dasar InnoDB
ber-primary key. Klik nomor baris untuk memilih; centang kolom yang ingin ditulis.
Kolom insert yang tidak dipilih memakai default server. NULL berbeda dari teks
kosong, binary memakai 0x hex, generated columns tidak dapat ditulis. Delete
memerlukan konfirmasi yang menampilkan primary key; trigger/cascade server tetap
berlaku. View, tabel tanpa PK/non-InnoDB dan invisible columns tetap read-only.

Update/delete membandingkan seluruh snapshot baris dan composite key. Konflik atau
nilai tak berubah meminta reload. Tidak ada retry write otomatis; jika koneksi
putus saat write/commit, periksa keadaan server sebelum mengulang. Mutasi mandiri
memakai transaksi pendek dan menahan metadata lock selama validasi/write, mengikuti
[metadata locking MySQL](https://dev.mysql.com/doc/refman/8.0/en/metadata-locking.html).

Begin/Commit/Rollback tersedia per tab dengan status terlihat. Perubahan editor
dalam transaksi terkelola belum permanen sampai Commit. SQL manual membuat
status unverified, sehingga row editor/Begin menunggu Commit/Rollback. DDL/CALL
serta SQL pengubah transaksi ditolak di transaksi terkelola; SELECT/INSERT/UPDATE/
DELETE diperbolehkan. Error transaksi meminta Rollback sebelum melanjutkan.
Rollback hanya melindungi storage engine transaksional; efek trigger ke engine
nontransaksional atau sistem eksternal tidak dijamin dapat dibatalkan.

Test lokal mencakup composite key, binary/NULL/quotes, konflik dua sesi termasuk
perubahan huruf besar/kecil, insert/update/delete, commit/rollback, serta simulasi
koneksi terputus tanpa replay. GUI Windows/Linux tetap perlu diuji langsung.
