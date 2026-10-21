# Kinetic Typography — "Jangan Takut Mulai Dari Nol"

Video kinetic typography 9:16 (1080×1920), durasi 15 detik, dibuat dengan HTML + CSS + JavaScript (Canvas 2D). Tidak memakai library apa pun. Font Anton dan Inter dimuat dari Google Fonts.

## Timeline

| Waktu | Scene | Efek |
|---|---|---|
| 0.0 – 3.2 s | JANGAN / **TAKUT** | slide + blur bertahap per huruf, zoom-in, guncangan kamera, gelombang kejut |
| 3.2 – 6.2 s | MULAI DARI / **NOL.** | rise + rotasi bertahap, "slam" scale 5× → 1×, ledakan partikel |
| 6.2 – 9.2 s | **TAKUTLAH** / JIKA KAMU | tema berganti emas → merah, jatuh sambil berotasi, slide dari kanan |
| 9.2 – 12.1 s | **TIDAK** / PERNAH | efek stempel dan guncangan keras, rise bertahap |
| 12.1 – 15.0 s | **MENCOBA.** | pop + rotasi bergantian, ledakan partikel terbesar, fade out |

Elemen yang aktif sepanjang video: latar gradien dengan orb cahaya yang bergerak, sinar diagonal, grid perspektif, 150 partikel debu, light sweep di setiap transisi, vignette, film grain, dan letterbox.

## Cara pakai

1. Buka `index.html` di Chrome, Edge, Safari, atau Firefox. Cukup klik dua kali file-nya. Kalau browser memblokir file lokal, jalankan server: `npx serve .`, lalu buka `http://localhost:3000`.
2. Kontrol:
   - **PLAY / PAUSE**: tombol, ketuk layar, atau tekan `Spasi`.
   - **REPLAY**: tombol atau tekan `R`.
   - **Slider**: geser untuk scrub. Tombol `←` dan `→` melompat 0,5 detik.
   - Kontrol otomatis tersembunyi 2 detik setelah video berjalan. Sentuh layar untuk memunculkannya lagi.
3. Parameter URL:
   - `?paused`: halaman tidak langsung memutar video.
   - `?render=1`: tampilan tanpa UI pada 1080×1920 piksel (dipakai oleh `render.mjs`).

Untuk mengubah teks, warna, atau timing, edit array `TEXT`, `IMPACTS`, `TRANSITIONS`, dan `LINES` di bagian atas script.

## Ekspor ke MP4

### Opsi A — Render frame-by-frame (direkomendasikan, kualitas terbaik)

Tiap frame dihitung dari waktu, jadi hasilnya bebas frame drop dan identik setiap kali dirender.

```bash
cd kinetic-typography
npm i playwright            # sekali saja
npx playwright install chromium
# ffmpeg harus terpasang: macOS `brew install ffmpeg`, Windows `winget install ffmpeg`, Linux `apt install ffmpeg`
node render.mjs 30 mulai-dari-nol.mp4    # atau 60 untuk 60 fps
```

Hasilnya MP4 H.264 1080×1920, `yuv420p`, `+faststart`, siap diunggah ke TikTok, Reels, atau Shorts. Proses render 30 fps memakan waktu sekitar 3–4 menit.

### Opsi B — Tombol REKAM di browser (cepat)

Klik **REKAM**. Video diputar ulang dari awal, direkam selama 15 detik secara real-time, lalu file otomatis terunduh.

- Chrome/Edge versi baru biasanya langsung menghasilkan `.mp4`. Browser lain menghasilkan `.webm`.
- Biarkan tab tetap aktif dan jangan pindah tab selama merekam. Di laptop yang lambat bisa terjadi frame drop.
- Konversi WebM ke MP4:

```bash
ffmpeg -i mulai-dari-nol.webm -c:v libx264 -crf 18 -pix_fmt yuv420p -r 30 -movflags +faststart mulai-dari-nol.mp4
```

### Opsi C — Screen recording HP

Buka di HP dalam layar penuh, sembunyikan kontrol, lalu gunakan perekam layar bawaan. Ini opsi terakhir karena hasilnya bergantung pada performa HP dan resolusi layarnya.

## Menambahkan musik

Video ini tidak memiliki audio. Hantaman visual terjadi di detik 1.18, 4.22, 6.95, 9.62, dan 13.05. Cocokkan dengan beat musik, lalu gabungkan:

```bash
ffmpeg -i mulai-dari-nol.mp4 -i musik.mp3 -c:v copy -c:a aac -b:a 192k -shortest final.mp4
```

Cara lain: tambahkan musik langsung dari library TikTok/Instagram saat mengunggah, supaya aman dari klaim hak cipta.
