// Minimal static server for dist/ that applies dist/_headers and the SPA fallback exactly like
// Netlify / Cloudflare Pages do. Used by the E2E suite so the real CSP is enforced in every test.
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';

const root = 'dist';
const port = Number(process.env.PORT ?? 4173);
const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.json': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
};

// Parse Netlify-format _headers: a path line, then indented "Name: value" lines.
const rules = [];
for (const line of readFileSync(join(root, '_headers'), 'utf8').split('\n')) {
  if (!line.trim() || line.trim().startsWith('#')) continue;
  if (!/^\s/.test(line)) rules.push({ pattern: line.trim(), headers: [] });
  else rules.at(-1)?.headers.push(line.trim().split(/:\s(.*)/s).slice(0, 2));
}
const matches = (pattern, path) =>
  pattern.endsWith('*') ? path.startsWith(pattern.slice(0, -1)) : pattern === path;

createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let file = normalize(join(root, path));
  if (!file.startsWith(root)) { res.writeHead(400).end(); return; }
  let served = path;
  if (!existsSync(file) || statSync(file).isDirectory()) {
    file = join(root, 'index.html');            // _redirects: /*  /index.html  200
    served = path;
  }
  const headers = { 'Content-Type': types[extname(file)] ?? 'application/octet-stream' };
  if (extname(file) === '.html') headers['Cache-Control'] = 'public, max-age=0, must-revalidate';  // host default
  for (const r of rules) if (matches(r.pattern, served)) for (const [k, v] of r.headers) headers[k] = v;
  res.writeHead(200, headers).end(readFileSync(file));
}).listen(port, () => console.log(`serving ${root} with _headers on http://localhost:${port}`));
