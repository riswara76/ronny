// Fills the Supabase origin into dist/_headers (CSP connect-src). Runs after `vite build`.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

function envValue(name) {
  if (process.env[name]) return process.env[name];
  for (const f of ['.env.production.local', '.env.local', '.env.production', '.env']) {
    if (!existsSync(f)) continue;
    const m = readFileSync(f, 'utf8').match(new RegExp(`^${name}=(.*)$`, 'm'));
    if (m) return m[1].trim();
  }
  return undefined;
}

const url = envValue('VITE_SUPABASE_URL');
if (!url) {
  console.error('VITE_SUPABASE_URL is not set; cannot build the CSP.');
  process.exit(1);
}
const httpOrigin = new URL(url).origin;
const wsOrigin = httpOrigin.replace(/^http/, 'ws');
const file = 'dist/_headers';
const text = readFileSync(file, 'utf8').replaceAll('__SUPABASE_HTTP__', httpOrigin).replaceAll('__SUPABASE_WS__', wsOrigin);
if (text.includes('__SUPABASE_')) {
  console.error('Unreplaced placeholder in dist/_headers');
  process.exit(1);
}
writeFileSync(file, text);
console.log(`dist/_headers: CSP connect-src ${httpOrigin} ${wsOrigin}`);
