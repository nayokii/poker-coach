// Static readiness check for a Vercel deployment of this Vite PWA. Pure file inspection: no network, no build.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/** Hosts that must never be needed by the production bundle. */
export const FORBIDDEN_IN_DIST = [/localhost/i, /127\.0\.0\.1/, /trycloudflare/i, /\b192\.168\.\d+\.\d+/];

const TEXT_EXT = /\.(html|js|mjs|css|json|webmanifest|svg|txt|map)$/i;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));

/** Returns { errors, warnings, info }. Nothing is printed here. */
export function checkProject(root) {
  const errors = [];
  const warnings = [];
  const info = [];
  const dist = join(root, 'dist');
  const err = (m) => errors.push(m);

  // ---- package.json ----
  let pkg = null;
  try {
    pkg = readJson(join(root, 'package.json'));
    if (!pkg.scripts?.build) err('package.json has no "build" script');
    if (!pkg.engines?.node) warnings.push('package.json has no engines.node: Vercel will choose its default Node version');
  } catch {
    err('package.json is missing or invalid');
  }

  // ---- vercel.json ----
  const vj = join(root, 'vercel.json');
  if (existsSync(vj)) {
    try {
      const v = readJson(vj);
      if (v.outputDirectory && v.outputDirectory !== 'dist') err(`vercel.json outputDirectory is "${v.outputDirectory}" but Vite builds to "dist"`);
      if (v.buildCommand && v.buildCommand !== 'npm run build') warnings.push(`vercel.json buildCommand is "${v.buildCommand}"`);
      if (v.rewrites) info.push('vercel.json defines rewrites (not needed: the app has no URL routes)');
      info.push('vercel.json: framework=' + (v.framework ?? 'auto') + ', build=' + (v.buildCommand ?? 'auto') + ', output=' + (v.outputDirectory ?? 'auto'));
    } catch {
      err('vercel.json is not valid JSON');
    }
  } else {
    info.push('no vercel.json: Vercel will auto-detect Vite');
  }

  // ---- .gitignore and secrets ----
  const gi = existsSync(join(root, '.gitignore')) ? readFileSync(join(root, '.gitignore'), 'utf8').split(/\r?\n/).map((l) => l.trim()) : [];
  for (const need of ['node_modules', 'dist', '.env']) if (!gi.includes(need)) err(`.gitignore does not ignore "${need}"`);
  if (!gi.some((l) => l === '.env.*')) err('.gitignore does not ignore ".env.*"');
  for (const f of readdirSync(root)) {
    if (/^\.env(\..+)?$/.test(f) && f !== '.env.example') err(`${f} exists in the project root: remove it or make sure it holds no secret (it is ignored by git)`);
  }

  // ---- dist ----
  if (!existsSync(join(dist, 'index.html'))) {
    err('dist/index.html is missing: run "npm run build" first');
    return { errors, warnings, info };
  }
  const html = readFileSync(join(dist, 'index.html'), 'utf8');
  const refs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1]);
  for (const r of refs) {
    if (/^(https?:)?\/\//.test(r)) err(`dist/index.html references an external URL: ${r}`);
    else if (r.startsWith('/') && !existsSync(join(dist, r.replace(/^\//, '').split('?')[0]))) err(`dist/index.html references a missing file: ${r}`);
  }
  info.push(`dist/index.html references ${refs.length} local files, all present`);

  // ---- manifest ----
  const mp = join(dist, 'manifest.webmanifest');
  if (!existsSync(mp)) err('dist/manifest.webmanifest is missing');
  else {
    const m = readJson(mp);
    for (const k of ['name', 'short_name', 'start_url', 'scope', 'display', 'theme_color', 'background_color']) if (!m[k]) err(`manifest has no "${k}"`);
    if (m.display && !['standalone', 'fullscreen', 'minimal-ui'].includes(m.display)) err(`manifest display "${m.display}" is not installable`);
    if (m.start_url && !String(m.start_url).startsWith('/') && !String(m.start_url).startsWith('.')) err('manifest start_url should be relative to the site');
    const icons = m.icons ?? [];
    for (const ic of icons) if (!existsSync(join(dist, ic.src))) err(`manifest icon is missing: ${ic.src}`);
    const has = (size, purpose) => icons.some((i) => i.sizes === size && (purpose ? i.purpose === purpose : true));
    if (!has('192x192')) err('manifest needs a 192x192 icon');
    if (!has('512x512')) err('manifest needs a 512x512 icon');
    if (!has('512x512', 'maskable')) warnings.push('manifest has no maskable 512x512 icon');
    if (!html.includes('rel="manifest"')) err('dist/index.html does not link the manifest');
    info.push(`manifest: "${m.name}" / "${m.short_name}", start_url=${m.start_url}, scope=${m.scope}, display=${m.display}, ${icons.length} icons`);
  }

  // ---- service worker ----
  const sw = join(dist, 'sw.js');
  if (!existsSync(sw)) err('dist/sw.js is missing');
  else {
    const src = readFileSync(sw, 'utf8');
    const urls = [...new Set([...src.matchAll(/url:\s*"([^"]+)"/g)].map((m) => m[1]))];
    for (const u of urls) if (!existsSync(join(dist, u))) err(`service worker precaches a missing file: ${u}`);
    if (!urls.includes('index.html')) err('service worker does not precache index.html');
    if (!/createHandlerBoundToURL\("index\.html"\)/.test(src)) warnings.push('service worker has no navigation fallback to index.html (offline reloads of non-root URLs)');
    info.push(`service worker precaches ${urls.length} files, all present`);
  }

  // ---- forbidden hosts in the production bundle ----
  let scanned = 0;
  for (const f of walk(dist)) {
    if (!TEXT_EXT.test(f)) continue;
    scanned++;
    const text = readFileSync(f, 'utf8');
    for (const re of FORBIDDEN_IN_DIST) if (re.test(text)) err(`${relative(root, f)} contains ${re}: production must not depend on a local or tunnel address`);
  }
  info.push(`scanned ${scanned} text files in dist for localhost / LAN / tunnel addresses`);

  return { errors, warnings, info };
}
