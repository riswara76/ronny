# DCU Active: Panduan Langkah demi Langkah untuk Menyelesaikan Phase 4

Panduan ini untuk konfigurasi Anda: **domain sendiri + Resend (SMTP) + Netlify + iPhone dan Android**.

**Perkiraan waktu:**
- Persiapan akun: sekitar 60–90 menit, ditambah waktu tunggu propagasi DNS (bisa sampai beberapa jam).
- Uji di perangkat: sekitar 60 menit.

## Aturan keamanan (wajib)

- Semua nilai yang ditandai 🔒 **hanya** boleh dimasukkan ke GitHub Secrets.
- Nilai 🔒 **tidak boleh** ditempel di chat, ChatGPT, email, WhatsApp, atau file di repo.
- Saya (Claude) tidak perlu dan tidak boleh melihat nilai-nilai itu. Workflow GitHub yang memakainya.
- Kalau nilai 🔒 tidak sengaja terkirim ke tempat lain, **cabut atau buat ulang** key itu di provider-nya.

## Tempat mencatat sementara

Siapkan catatan lokal di komputer Anda, misalnya Notepad (bukan cloud), lalu **hapus setelah selesai**.

Ada 24 secret yang harus Anda isi. Daftar lengkapnya ada di bagian 7.

---

## Langkah 1: Supabase (backend staging)

1. Buka https://supabase.com/dashboard, lalu login atau daftar.
2. Klik **New project**:
   - Name: `dcu-active-staging`
   - Database Password: klik **Generate a password**, lalu salin ke catatan 🔒
   - Region: **Southeast Asia (Singapore)**
   - Plan: Free
3. Tunggu sekitar 2 menit sampai project siap.
4. Ambil nilai-nilai berikut:

| Secret | Lokasi di dashboard | |
|---|---|---|
| `STAGING_PROJECT_REF` | ⚙ Project Settings → General → **Project ID** (20 huruf) | |
| `STAGING_SUPABASE_URL` | Project Settings → Data API → **Project URL** (`https://xxxx.supabase.co`) | |
| `STAGING_PUBLISHABLE_KEY` | Project Settings → API Keys → **Publishable key** (`sb_publishable_…`) | |
| `STAGING_SECRET_KEY` | Project Settings → API Keys → **Secret keys** → Reveal (`sb_secret_…`) | 🔒 |
| `STAGING_DB_URL` | Tombol **Connect** (atas) → tab "Connection String" → **Session pooler** → salin URI | 🔒 |
| `SUPABASE_ACCESS_TOKEN` | https://supabase.com/dashboard/account/tokens → **Generate new token**, nama `dcu-staging-ci` | 🔒 |

**Catatan untuk `STAGING_DB_URL`:**
- Ganti `[YOUR-PASSWORD]` dengan password database dari langkah 2.
- Kalau password mengandung karakter khusus, ubah dulu: `@` menjadi `%40`, `#` menjadi `%23`, `/` menjadi `%2F`, `:` menjadi `%3A`.
- Cara termudah: pakai password hasil *Generate*, karena biasanya hanya berisi huruf dan angka.
- Hasilnya kira-kira seperti ini:
  `postgresql://postgres.xxxx:PASSWORD@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres`

Jangan ubah pengaturan Auth di dashboard. Workflow yang akan mengaturnya: redirect URL, SMTP, template email, dan aturan password.

---

## Langkah 2: Resend (pengirim email) + DNS domain Anda

Gunakan **subdomain**, misalnya `mail.domainanda.com`, bukan domain utama. Dengan begitu, reputasi email kantor/utama tidak ikut terdampak.

1. Buka https://resend.com, lalu daftar.
2. Masuk ke **Domains → Add Domain**:
   - Isi `mail.domainanda.com` (ganti dengan domain Anda).
   - Region: **Tokyo (ap-northeast-1)** atau yang terdekat.
3. Resend akan menampilkan beberapa record DNS. Biasanya:
   - 1 × **MX** (untuk `send.mail…`)
   - 1 × **TXT** SPF (`v=spf1 include:amazonses.com ~all`)
   - 1 × **TXT** DKIM (`resend._domainkey.mail…`)
4. Login ke panel DNS domain Anda (Niagahoster/Rumahweb/Cloudflare/GoDaddy, dll.).
5. Tambahkan record tersebut **persis** seperti yang ditampilkan Resend.
   - Jika memakai Cloudflare, set Proxy = **DNS only** (awan abu-abu).
6. *(Disarankan)* Tambahkan juga record TXT `_dmarc.mail.domainanda.com` dengan isi `v=DMARC1; p=none;`.
7. Kembali ke Resend dan klik **Verify DNS Records**. Tunggu sampai statusnya **Verified**. Bisa beberapa menit sampai beberapa jam.
8. Buka **API Keys → Create API Key**:
   - Name: `dcu-staging-smtp`
   - Permission: **Sending access**
   - Domain: pilih domain tadi
   - Salin key-nya (`re_…`) 🔒. Key **hanya ditampilkan sekali**.

| Secret | Nilai |
|---|---|
| `SMTP_HOST` | `smtp.resend.com` |
| `SMTP_PORT` | `587` |
| `SMTP_USER` | `resend` |
| `SMTP_PASS` | API key `re_…` 🔒 |
| `SMTP_ADMIN_EMAIL` | `no-reply@mail.domainanda.com` (harus di domain yang sudah Verified) |
| `SMTP_SENDER_NAME` | `DCU Active` |

---

## Langkah 3: Netlify (hosting HTTPS)

Untuk staging, cukup pakai alamat bawaan `*.netlify.app` yang otomatis HTTPS. Domain sendiri bisa dipakai nanti untuk production.

1. Buka https://app.netlify.com, lalu daftar (bisa memakai akun GitHub).
2. Pilih **Add new project → Deploy manually**.
   - Seret folder kosong apa saja yang berisi satu file `index.html` sederhana.
   - Tujuannya hanya membuat situs. Isi sebenarnya nanti di-deploy oleh workflow.
3. Buka **Project configuration → General → Change project name**, lalu ganti menjadi `dcu-active-staging` (atau nama lain yang masih tersedia).
4. Ambil nilai-nilai berikut:

| Secret | Lokasi | |
|---|---|---|
| `NETLIFY_SITE_ID` | Project configuration → General → **Project ID** | |
| `STAGING_SITE_URL` | `https://dcu-active-staging.netlify.app`: tanpa `/` di akhir, tanpa `*` | |
| `NETLIFY_AUTH_TOKEN` | Avatar (kanan atas) → User settings → Applications → **Personal access tokens → New access token**, expiry 30–60 hari | 🔒 |

---

## Langkah 4: Gmail khusus untuk tes otomatis

Tes otomatis mengirim email **sungguhan** (registrasi, verifikasi, reset password), lalu membacanya kembali. Karena itu dibutuhkan satu kotak surat khusus.

**Jangan pakai email pribadi Anda.**

1. Buat akun Gmail baru, misalnya `dcu.active.e2e@gmail.com`.
2. Buka https://myaccount.google.com/security dan aktifkan **2-Step Verification**.
3. Buka https://myaccount.google.com/apppasswords.
   - Nama aplikasi: `dcu-staging-imap`, lalu klik **Create**.
   - Salin 16 karakter yang muncul, **tanpa spasi** 🔒.
4. Di Gmail, buka ⚙ → See all settings → **Forwarding and POP/IMAP**. Pastikan **IMAP** dalam status *Enabled*.
5. **Penting:** setelah run pertama, cek folder **Spam** di Gmail ini.
   - Kalau email DCU Active masuk ke Spam, tandai **Not spam**.
   - Kirim kabar ke saya, karena itu indikasi DNS (SPF/DKIM) belum benar.

| Secret | Nilai | |
|---|---|---|
| `TEST_MAILBOX` | `dcu.active.e2e@gmail.com` | |
| `TEST_IMAP_HOST` | `imap.gmail.com` | |
| `TEST_IMAP_PORT` | `993` | |
| `TEST_IMAP_USER` | `dcu.active.e2e@gmail.com` | |
| `TEST_IMAP_PASS` | App password 16 karakter | 🔒 |

---

## Langkah 5: Akun tes staging

Anda yang menentukan nilainya. Workflow akan membuat akun-akun ini secara otomatis.

| Secret | Contoh | |
|---|---|---|
| `STAGING_ADMIN_EMAIL` | `dcu.active.e2e+admin@gmail.com` | |
| `STAGING_USER1_EMAIL` | `dcu.active.e2e+user1@gmail.com` | |
| `STAGING_USER2_EMAIL` | `dcu.active.e2e+user2@gmail.com` | |
| `STAGING_TEST_PASSWORD` | Minimal 12 karakter, berisi huruf besar, huruf kecil, angka, dan simbol. Contoh *pola*: `Lapangan-Basket-2026!` (jangan pakai contoh ini) | 🔒 |

Password ini juga akan Anda pakai untuk uji di HP.

---

## Langkah 6: Masukkan semua secret ke GitHub

1. Buka https://github.com/riswara76/ronny/settings/environments.
2. Klik **New environment**, beri nama persis `staging`, lalu **Configure environment**.
3. Di bagian **Environment secrets**, klik **Add environment secret** sekali untuk setiap baris di daftar bagian 7.
   - Nama harus **persis sama**: huruf besar dan garis bawah.
   - Tidak boleh ada spasi di awal atau akhir nilai.
4. *(Disarankan)* Di **Deployment protection rules**, centang **Required reviewers** dan pilih diri Anda. Dengan begitu, staging tidak bisa dijalankan tanpa persetujuan Anda.

---

## 7. Checklist 24 secret

Centang setiap baris setelah dimasukkan.

| # | Secret | 🔒 |
|---|---|---|
| 1 | `SUPABASE_ACCESS_TOKEN` | 🔒 |
| 2 | `STAGING_PROJECT_REF` | |
| 3 | `STAGING_SUPABASE_URL` | |
| 4 | `STAGING_PUBLISHABLE_KEY` | |
| 5 | `STAGING_SECRET_KEY` | 🔒 |
| 6 | `STAGING_DB_URL` | 🔒 |
| 7 | `NETLIFY_SITE_ID` | |
| 8 | `NETLIFY_AUTH_TOKEN` | 🔒 |
| 9 | `STAGING_SITE_URL` | |
| 10 | `SMTP_HOST` | |
| 11 | `SMTP_PORT` | |
| 12 | `SMTP_USER` | |
| 13 | `SMTP_PASS` | 🔒 |
| 14 | `SMTP_ADMIN_EMAIL` | |
| 15 | `SMTP_SENDER_NAME` | |
| 16 | `TEST_MAILBOX` | |
| 17 | `TEST_IMAP_HOST` | |
| 18 | `TEST_IMAP_PORT` | |
| 19 | `TEST_IMAP_USER` | |
| 20 | `TEST_IMAP_PASS` | 🔒 |
| 21 | `STAGING_ADMIN_EMAIL` | |
| 22 | `STAGING_USER1_EMAIL` | |
| 23 | `STAGING_USER2_EMAIL` | |
| 24 | `STAGING_TEST_PASSWORD` | 🔒 |

---

## Langkah 8: Kirim ke saya (Claude) HANYA ini

```
Secrets staging sudah lengkap (24).
STAGING_SITE_URL = https://....netlify.app
Domain Resend: Verified (ya/tidak)
Silakan jalankan workflow staging.
```

Setelah itu saya akan:
1. menjalankan workflow "Staging deploy + verification";
2. membaca hasilnya;
3. memperbaiki kegagalan yang muncul;
4. menjalankan ulang sampai hijau.

Anda juga bisa menjalankannya sendiri lewat **Actions → Staging deploy + verification → Run workflow**.

---

## Langkah 9: Uji di HP sungguhan

Lakukan langkah ini **setelah** saya mengabarkan staging hijau.

Ikuti `docs/phase-4/REAL-DEVICE-TEST-PLAN.md` (17 baris). Kolomnya:
- **A** = iPhone Safari
- **B** = iPhone yang dipasang ke Home Screen
- **C** = Android Chrome

Yang perlu dikirim balik:
- tabel berisi Pass/Fail per baris, dengan screenshot untuk setiap Fail;
- versi iOS, model HP Android, versi Android, dan versi Chrome.

**Jangan** kirim screenshot yang memperlihatkan password.

---

## Setelah semua selesai

Saya akan:
1. memperbaiki setiap Fail;
2. menjalankan ulang regresi;
3. menulis `PHASE-4-REVIEW-PACKAGE.md`;
4. lalu berhenti dan menunggu persetujuan Anda.
