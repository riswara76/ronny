# Panduan Staging DCU Active (versi sederhana)

**Tujuan:** menaruh aplikasi DCU Active di internet (staging) supaya bisa dites otomatis dan dicoba di HP sungguhan. Ini syarat terakhir Phase 4.

**Pembagian tugas:**

- **Anda:** membuat 5 akun, lalu menyalin 13 nilai ke GitHub.
- **Claude:** menjalankan deploy dan semua tes, membaca hasilnya, lalu memperbaiki error.

---

## Gambaran besar (4 fase)

| Fase | Yang Anda kerjakan | Waktu | Hasil |
|---|---|---|---|
| **A** | Membuat 5 akun: Resend, Gmail tes, Supabase, Netlify, GitHub environment | ±60 menit, ditambah tunggu DNS | Ke-13 nilai sudah tercatat |
| **B** | Menyalin 13 nilai ke GitHub | ±15 menit | Checklist 13/13 tercentang |
| **C** | Mengirim 1 pesan ke Claude | 1 menit | Claude menjalankan staging |
| **D** | Uji di iPhone dan Android | ±60 menit | Tabel Pass/Fail |

Kerjakan **berurutan**. Mulai dari **A1 (Resend)**, karena verifikasi DNS bisa memakan waktu beberapa jam. Selama menunggu, lanjutkan langkah lain.

---

## Sebelum mulai: 3 aturan

1. Buka **Notepad** (atau aplikasi catatan offline) untuk menyimpan nilai sementara. **Hapus catatan itu setelah Fase B selesai.**
2. Nilai bertanda 🔒 adalah **rahasia**. Nilai itu hanya boleh ditempel di GitHub (Fase B).
   - Jangan tempel di chat Claude, ChatGPT, WhatsApp, atau email.
   - Kalau terlanjur bocor: hapus key-nya di website asalnya, lalu buat key baru.
3. Kalau macet di suatu langkah, kirim ke Claude **nomor langkahnya** plus screenshot. Pastikan screenshot tidak memperlihatkan nilai 🔒.

---

## FASE A: Buat akun dan kumpulkan nilai

### A1. Resend (pengirim email aplikasi)

Fungsinya: mengirim email verifikasi dan reset password ke pengguna.

1. Daftar di https://resend.com.
2. Buka menu **Domains** → **Add Domain**.
   - Isi dengan **subdomain**, misalnya `mail.domainanda.com`. Jangan pakai domain utama, supaya email kantor tidak ikut kena masalah spam.
3. Resend menampilkan 3–4 baris DNS (MX, TXT SPF, TXT DKIM). Biarkan halaman itu terbuka.
4. Di tab lain, login ke panel domain Anda (tempat Anda membeli domain atau mengelola DNS-nya).
   - Tambahkan setiap baris **persis** seperti yang ditampilkan Resend: Type, Name, dan Value.
   - Kalau DNS Anda di Cloudflare, set Proxy = **DNS only** (awan abu-abu).
5. Kembali ke Resend dan klik **Verify DNS Records**.
   - Kalau belum hijau, lanjutkan ke A2 dulu dan cek lagi nanti.
6. Buka menu **API Keys** → **Create API Key**:
   - Name: `dcu-staging`
   - Permission: **Sending access**
   - Domain: pilih subdomain Anda.
7. Salin key yang muncul (diawali `re_`). Key ini hanya ditampilkan sekali.

**Catat:**

| No | Nama | Nilai |
|---|---|---|
| 9 🔒 | `SMTP_PASS` | key `re_…` |
| 10 | `SMTP_ADMIN_EMAIL` | `no-reply@mail.domainanda.com` (sesuaikan dengan subdomain Anda) |

✅ **A1 selesai jika:** status domain di Resend **Verified** (hijau) dan key `re_…` sudah tercatat.

### A2. Gmail khusus tes

Fungsinya: tes otomatis mengirim email sungguhan ke kotak ini, lalu membacanya kembali.

1. Buat akun Gmail **baru**, misalnya `dcu.active.e2e@gmail.com`. Jangan pakai email pribadi.
2. Buka https://myaccount.google.com/security → aktifkan **2-Step Verification**.
3. Buka https://myaccount.google.com/apppasswords:
   - Isi nama `dcu-staging`, lalu klik **Create**.
   - Salin 16 hurufnya **tanpa spasi**.

**Catat:**

| No | Nama | Nilai |
|---|---|---|
| 11 | `TEST_MAILBOX` | alamat Gmail baru tadi |
| 12 🔒 | `TEST_IMAP_PASS` | 16 huruf app password |

✅ **A2 selesai jika:** kedua nilai sudah tercatat.

### A3. Password akun tes

Buat sendiri satu password. Syaratnya:
- minimal 12 karakter;
- ada huruf besar, huruf kecil, angka, dan simbol.

Contoh pola: `Lapangan-Tenis-2026!` (jangan pakai contoh ini persis).

Password ini juga Anda pakai saat uji di HP (Fase D). Akun tes yang memakainya dibuat otomatis:
- admin: `alamatgmail+admin@gmail.com`
- user 1: `alamatgmail+user1@gmail.com`
- user 2: `alamatgmail+user2@gmail.com`

**Catat:**

| No | Nama | Nilai |
|---|---|---|
| 13 🔒 | `STAGING_TEST_PASSWORD` | password tadi |

### A4. Supabase (database dan login)

1. Login di https://supabase.com/dashboard → **New project**:
   - Name: `dcu-active-staging`
   - Database Password: klik **Generate a password**, lalu catat sementara (dipakai di langkah 3).
   - Region: **Southeast Asia (Singapore)**
   - Klik **Create**, lalu tunggu ±2 menit.
2. Salin nilai-nilai ini:

| No | Nama | Lokasi |
|---|---|---|
| 1 | `STAGING_PROJECT_REF` | ⚙ Project Settings → General → **Project ID** (20 huruf kecil) |
| 2 | `STAGING_PUBLISHABLE_KEY` | Project Settings → **API Keys** → Publishable key (`sb_publishable_…`) |
| 3 🔒 | `STAGING_SECRET_KEY` | Project Settings → **API Keys** → Secret keys → klik ikon mata → salin (`sb_secret_…`) |
| 4 🔒 | `SUPABASE_ACCESS_TOKEN` | https://supabase.com/dashboard/account/tokens → **Generate new token** (nama `dcu-staging`) |

3. Nilai no 5, `STAGING_DB_URL` 🔒:
   - Klik tombol **Connect** di bagian atas dashboard.
   - Buka bagian **Session pooler** dan salin URI-nya.
   - Ganti teks `[YOUR-PASSWORD]` dengan password database dari langkah 1 (tanda kurung siku ikut dihapus).
   - Hasilnya kira-kira seperti ini: `postgresql://postgres.abcd…:PasswordAnda@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres`

**Jangan** mengubah pengaturan lain di Supabase. Sistem mengaturnya otomatis.

✅ **A4 selesai jika:** nilai no 1–5 sudah tercatat.

### A5. Netlify (hosting website HTTPS)

1. Login di https://app.netlify.com (boleh pakai akun GitHub).
2. Klik **Add new project** → **Deploy manually**.
   - Seret satu folder berisi file teks apa saja. Ini hanya untuk membuat situs; isinya nanti diganti otomatis.
3. Buka **Project configuration** → **Change project name** → isi `dcu-active-staging`. Kalau nama itu sudah dipakai orang, tambahkan angka di belakangnya.
4. Salin nilai-nilai ini:

| No | Nama | Lokasi |
|---|---|---|
| 6 | `NETLIFY_SITE_ID` | Project configuration → General → **Project ID** |
| 7 🔒 | `NETLIFY_AUTH_TOKEN` | Klik avatar (kanan atas) → User settings → Applications → **New access token** |
| 8 | `STAGING_SITE_URL` | Alamat situs, misalnya `https://dcu-active-staging.netlify.app`. **Tanpa** `/` di akhir. |

✅ **A5 selesai jika:** nilai no 6–8 sudah tercatat.

---

## FASE B: Salin 13 nilai ke GitHub

1. Buka https://github.com/riswara76/ronny/settings/environments.
2. Klik **New environment** → nama: `staging` (huruf kecil semua) → **Configure environment**.
3. Gulir ke **Environment secrets** → **Add environment secret**. Ulangi untuk ke-13 baris di bawah.
   - **Name** harus persis sama dengan tabel: huruf besar dan garis bawah.
   - **Value** tanpa spasi di awal atau akhir.

| ☐ | No | Name | Dari langkah |
|---|---|---|---|
| ☐ | 1 | `STAGING_PROJECT_REF` | A4 |
| ☐ | 2 | `STAGING_PUBLISHABLE_KEY` | A4 |
| ☐ | 3 | `STAGING_SECRET_KEY` 🔒 | A4 |
| ☐ | 4 | `SUPABASE_ACCESS_TOKEN` 🔒 | A4 |
| ☐ | 5 | `STAGING_DB_URL` 🔒 | A4 |
| ☐ | 6 | `NETLIFY_SITE_ID` | A5 |
| ☐ | 7 | `NETLIFY_AUTH_TOKEN` 🔒 | A5 |
| ☐ | 8 | `STAGING_SITE_URL` | A5 |
| ☐ | 9 | `SMTP_PASS` 🔒 | A1 |
| ☐ | 10 | `SMTP_ADMIN_EMAIL` | A1 |
| ☐ | 11 | `TEST_MAILBOX` | A2 |
| ☐ | 12 | `TEST_IMAP_PASS` 🔒 | A2 |
| ☐ | 13 | `STAGING_TEST_PASSWORD` 🔒 | A3 |

4. Setelah 13/13 masuk, **hapus catatan Notepad Anda**.

Tidak perlu khawatir salah ketik. Langkah pertama workflow memeriksa ke-13 secret, lalu menyebut **nama** secret yang kosong atau formatnya salah, tanpa pernah menampilkan isinya.

✅ **Fase B selesai jika:** halaman environment `staging` menampilkan 13 secret.

---

## FASE C: Kirim pesan ini ke Claude

Salin, isi bagian yang perlu, lalu kirim. **Jangan tambahkan nilai 🔒.**

```
Fase B selesai: 13 secret sudah ada di environment staging.
STAGING_SITE_URL = https://__________.netlify.app
Domain Resend sudah Verified: ya / belum
Silakan jalankan staging.
```

Setelah itu Claude akan:
1. menjalankan workflow staging, yang otomatis memasang database, mengatur login dan email, lalu mengunggah website;
2. menjalankan semua tes: database, keamanan, header, konkurensi, email sungguhan, Lighthouse, dan aksesibilitas;
3. memperbaiki yang gagal dan mengulang sampai hijau;
4. mengabari Anda bahwa staging siap diuji di HP.

---

## FASE D: Uji di HP (setelah Claude bilang staging hijau)

Ikuti `docs/phase-4/REAL-DEVICE-TEST-PLAN.md`. Isinya 17 langkah singkat, seperti daftar, login, booking, batal, check-in, dan offline. Lakukan di:

- **A:** iPhone, browser Safari
- **B:** iPhone, setelah dipasang ke layar utama (Safari → tombol Share → *Add to Home Screen*)
- **C:** HP Android, browser Chrome

Kirim balik:
- tabel berisi **Pass/Fail** per langkah;
- screenshot untuk setiap Fail;
- versi iOS, model HP Android, versi Android, dan versi Chrome.

Setelah itu Claude memperbaiki setiap Fail, menulis paket review Phase 4, lalu berhenti dan menunggu persetujuan Anda.

---

## Kalau macet

| Masalah | Solusi |
|---|---|
| Domain Resend tidak kunjung Verified | Tunggu sampai 24 jam. Cek apakah Name di DNS tertulis dobel (misalnya `send.mail.domainanda.com.domainanda.com`). Banyak panel DNS otomatis menambahkan domain, jadi cukup isi `send.mail`. |
| Menu App Passwords Gmail tidak muncul | 2-Step Verification belum aktif. Aktifkan dulu. |
| Lupa password database Supabase | Project Settings → Database → **Reset database password**, lalu buat ulang `STAGING_DB_URL`. |
| Nilai 🔒 terlanjur terkirim di chat | Hapus atau cabut key itu di websitenya, buat yang baru, lalu perbarui secret di GitHub. |
| Bingung di langkah tertentu | Kirim ke Claude: "Macet di langkah A4.3" plus screenshot tanpa nilai rahasia. |
