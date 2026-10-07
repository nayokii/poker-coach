import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { checkProject } from './deploy.mjs';

const dirs = [];
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop(), { recursive: true, force: true });
});

/** A minimal, valid project on disk; `mutate` can break it. */
function makeProject(mutate = () => {}) {
  const root = mkdtempSync(join(tmpdir(), 'deploy-check-'));
  dirs.push(root);
  const files = {
    'package.json': JSON.stringify({ scripts: { build: 'vite build' }, engines: { node: '>=22.12.0' } }),
    'vercel.json': JSON.stringify({ framework: 'vite', buildCommand: 'npm run build', outputDirectory: 'dist' }),
    '.gitignore': 'node_modules\ndist\n.env\n.env.*\n',
    'dist/index.html': '<link rel="manifest" href="/manifest.webmanifest"><script type="module" src="/assets/app.js"></script>',
    'dist/assets/app.js': 'console.log("hello")',
    'dist/manifest.webmanifest': JSON.stringify({
      name: 'App', short_name: 'App', start_url: '/', scope: '/', display: 'standalone', theme_color: '#000', background_color: '#000',
      icons: [
        { src: 'i192.png', sizes: '192x192', type: 'image/png' },
        { src: 'i512.png', sizes: '512x512', type: 'image/png' },
        { src: 'm512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    }),
    'dist/i192.png': 'x',
    'dist/i512.png': 'x',
    'dist/m512.png': 'x',
    'dist/sw.js': 'precacheAndRoute([{url:"index.html",revision:"1"},{url:"assets/app.js",revision:null}]);createHandlerBoundToURL("index.html")',
  };
  const state = { files };
  mutate(state);
  for (const [name, content] of Object.entries(state.files)) {
    if (content === null) continue;
    const p = join(root, name);
    mkdirSync(join(p, '..'), { recursive: true });
    writeFileSync(p, content);
  }
  return root;
}

describe('deploy readiness check', () => {
  it('accepts a valid project', () => {
    const r = checkProject(makeProject());
    expect(r.errors).toEqual([]);
    expect(r.info.join('\n')).toContain('service worker precaches 2 files');
  });

  it('fails without a build output', () => {
    const r = checkProject(makeProject((s) => (s.files['dist/index.html'] = null)));
    expect(r.errors[0]).toContain('dist/index.html is missing');
  });

  it.each([
    ['a localhost address in the bundle', (s) => (s.files['dist/assets/app.js'] = 'fetch("http://localhost:3000/x")')],
    ['a loopback address', (s) => (s.files['dist/assets/app.js'] = 'x="http://127.0.0.1:5173"')],
    ['a Cloudflare tunnel address', (s) => (s.files['dist/assets/app.js'] = 'x="https://abc.trycloudflare.com"')],
    ['a LAN address', (s) => (s.files['dist/assets/app.js'] = 'x="http://192.168.1.20"')],
  ])('fails on %s', (_name, mutate) => {
    const r = checkProject(makeProject(mutate));
    expect(r.errors.some((e) => e.includes('production must not depend on a local or tunnel address'))).toBe(true);
  });

  it('fails on a missing icon, a missing manifest field and an uninstallable display mode', () => {
    const noIcon = checkProject(makeProject((s) => (s.files['dist/i512.png'] = null)));
    expect(noIcon.errors.some((e) => e.includes('manifest icon is missing: i512.png'))).toBe(true);
    const bad = checkProject(
      makeProject((s) => {
        const m = JSON.parse(s.files['dist/manifest.webmanifest']);
        delete m.short_name;
        m.display = 'browser';
        s.files['dist/manifest.webmanifest'] = JSON.stringify(m);
      }),
    );
    expect(bad.errors).toEqual(expect.arrayContaining(['manifest has no "short_name"', 'manifest display "browser" is not installable']));
  });

  it('fails when the service worker precaches a file that is not in dist, or index.html is not referenced correctly', () => {
    const r = checkProject(makeProject((s) => (s.files['dist/sw.js'] = 'x([{url:"index.html"},{url:"assets/gone.js"}])')));
    expect(r.errors.some((e) => e.includes('assets/gone.js'))).toBe(true);
    const html = checkProject(makeProject((s) => (s.files['dist/index.html'] = '<link rel="manifest" href="/manifest.webmanifest"><script src="/assets/missing.js"></script>')));
    expect(html.errors.some((e) => e.includes('/assets/missing.js'))).toBe(true);
    const ext = checkProject(makeProject((s) => (s.files['dist/index.html'] = '<link rel="manifest" href="/manifest.webmanifest"><script src="https://cdn.example.com/x.js"></script>')));
    expect(ext.errors.some((e) => e.includes('external URL'))).toBe(true);
  });

  it('checks git hygiene: .env must be ignored and no .env file may sit in the project', () => {
    const noIgnore = checkProject(makeProject((s) => (s.files['.gitignore'] = 'node_modules\ndist\n')));
    expect(noIgnore.errors).toEqual(expect.arrayContaining(['.gitignore does not ignore ".env"', '.gitignore does not ignore ".env.*"']));
    const withEnv = checkProject(makeProject((s) => (s.files['.env.local'] = 'SECRET=1')));
    expect(withEnv.errors.some((e) => e.includes('.env.local exists'))).toBe(true);
    const example = checkProject(makeProject((s) => (s.files['.env.example'] = 'PUBLIC_X=')));
    expect(example.errors).toEqual([]);
  });

  it('checks the Vercel config: wrong output directory fails, rewrites are reported', () => {
    const wrong = checkProject(makeProject((s) => (s.files['vercel.json'] = JSON.stringify({ outputDirectory: 'build' }))));
    expect(wrong.errors.some((e) => e.includes('outputDirectory'))).toBe(true);
    const none = checkProject(makeProject((s) => (s.files['vercel.json'] = null)));
    expect(none.errors).toEqual([]);
    expect(none.info.join('\n')).toContain('auto-detect Vite');
    const invalid = checkProject(makeProject((s) => (s.files['vercel.json'] = '{nope')));
    expect(invalid.errors).toContain('vercel.json is not valid JSON');
  });

  it('warns (does not fail) about a missing maskable icon or engines', () => {
    const r = checkProject(
      makeProject((s) => {
        s.files['package.json'] = JSON.stringify({ scripts: { build: 'x' } });
        const m = JSON.parse(s.files['dist/manifest.webmanifest']);
        m.icons = m.icons.filter((i) => i.purpose !== 'maskable');
        s.files['dist/manifest.webmanifest'] = JSON.stringify(m);
      }),
    );
    expect(r.errors).toEqual([]);
    expect(r.warnings.length).toBe(2);
  });
});
