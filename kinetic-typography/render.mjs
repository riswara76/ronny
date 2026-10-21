// Render index.html frame-by-frame lalu gabungkan menjadi MP4 dengan ffmpeg.
// Hasilnya bebas frame drop karena tiap frame dihitung dari waktu, bukan direkam real-time.
//
// Pakai:  node render.mjs [fps] [output.mp4]
// Contoh: node render.mjs 30 mulai-dari-nol.mp4
//
// Butuh: Node 18+, `npm i playwright` (atau terpasang global), dan ffmpeg di PATH.

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const FPS = Number(process.argv[2] || 30);
const OUT = process.argv[3] || 'mulai-dari-nol.mp4';
const here = path.dirname(fileURLToPath(import.meta.url));
const url = pathToFileURL(path.join(here, 'index.html')).href + '?render=1';

const launchOpts = process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {};
const browser = await chromium.launch(launchOpts);
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
await page.goto(url);
await page.evaluate(() => window.__ready);
const duration = await page.evaluate(() => window.__DURATION);
const total = Math.round(duration * FPS);

// Frame PNG dialirkan langsung ke ffmpeg lewat stdin (tanpa file sementara)
const ff = spawn('ffmpeg', [
  '-y', '-loglevel', 'error',
  '-f', 'image2pipe', '-framerate', String(FPS), '-i', '-',
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '16',
  '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
  OUT,
], { stdio: ['pipe', 'inherit', 'inherit'] });

for (let i = 0; i < total; i++) {
  const b64 = await page.evaluate(t => {
    window.__seek(t);
    return document.getElementById('c').toDataURL('image/png').split(',')[1];
  }, i / FPS);
  const buf = Buffer.from(b64, 'base64');
  if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
  if (i % FPS === 0 || i === total - 1) {
    process.stdout.write(`\rRender frame ${i + 1}/${total}`);
  }
}
ff.stdin.end();
await new Promise((res, rej) => ff.on('close', c => (c === 0 ? res() : rej(new Error('ffmpeg exit ' + c)))));
await browser.close();
console.log(`\nSelesai: ${OUT} (1080x1920, ${FPS} fps, ${duration} detik)`);
