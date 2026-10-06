// Build guard: fail if anything that looks like a privileged Supabase key ended up in dist/.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const banned = [/sb_secret_[A-Za-z0-9_-]+/, /"role"\s*:\s*"service_role"/, /service_role/];
const files = [];
const walk = (d) => readdirSync(d).forEach((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : files.push(join(d, f))));
walk('dist');
let bad = 0;
for (const f of files) {
  if (!/\.(js|html|css|json|webmanifest|map)$/.test(f)) continue;
  const text = readFileSync(f, 'utf8');
  // A JWT-shaped string whose payload says service_role is also a privileged key.
  const jwts = text.match(/eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g) ?? [];
  const privilegedJwt = jwts.some((j) => Buffer.from(j.split('.')[1], 'base64url').toString().includes('service_role'));
  if (banned.some((r) => r.test(text)) || privilegedJwt) {
    console.error(`SECRET-LIKE VALUE FOUND in ${f}`);
    bad++;
  }
}
if (bad) process.exit(1);
console.log(`bundle secret check passed (${files.length} files)`);
