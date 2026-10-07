#!/usr/bin/env node
// Opens the app on a phone from ANY network (4G/5G, another Wi-Fi) through a temporary HTTPS tunnel.
//
//   npm run dev:tunnel       Vite dev server (hot reload) behind the tunnel
//   npm run preview:tunnel   production build + preview server behind the tunnel (real PWA: manifest,
//                            service worker, offline, "Add to Home Screen")
//
// Development helper only: nothing here is used by the production build. The tunnel is a Cloudflare
// "quick tunnel": no account, no token, no configuration file, and the URL changes at every launch.
// The Vite server listens on 127.0.0.1 only; nothing on your LAN or router is opened.
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkPublicUrl } from './lib/publicCheck.mjs';
import { INSTALL_HELP, extractTunnelUrl, findCloudflared } from './lib/tunnel.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const mode = process.argv.includes('--preview') ? 'preview' : 'dev';
const port = Number(process.env.PORT ?? (mode === 'preview' ? 4173 : 5173));
const children = [];
let shuttingDown = false;

const line = '─'.repeat(44);
const log = (msg = '') => console.log(msg);

function stopAll(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const c of children) {
    if (c.exitCode !== null || !c.pid) continue;
    if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(c.pid), '/T', '/F'], { stdio: 'ignore' });
    else c.kill('SIGTERM');
  }
  process.exit(code);
}
process.on('SIGINT', () => stopAll(0));
process.on('SIGTERM', () => stopAll(0));

const cloudflared = findCloudflared();
if (!cloudflared) {
  console.error(INSTALL_HELP);
  process.exit(1);
}

const viteBin = join(dirname(createRequire(import.meta.url).resolve('vite/package.json')), 'bin', 'vite.js');

if (mode === 'preview') {
  log('Building the production bundle (vite build)...');
  const build = spawnSync(process.execPath, [viteBin, 'build'], { cwd: root, stdio: 'inherit' });
  if (build.status !== 0) {
    console.error('Build failed: fix the errors above, then run the command again.');
    process.exit(build.status ?? 1);
  }
}

const viteArgs = [viteBin, ...(mode === 'preview' ? ['preview'] : []), '--host', '127.0.0.1', '--port', String(port), '--strictPort'];
const vite = spawn(process.execPath, viteArgs, {
  cwd: root,
  // POKER_TUNNEL makes the dev server point hot-reload at the HTTPS tunnel (see vite.config.ts).
  env: { ...process.env, POKER_TUNNEL: '1' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
children.push(vite);
let viteLog = '';
for (const stream of [vite.stdout, vite.stderr]) stream.on('data', (d) => (viteLog += d.toString()));
vite.on('exit', (code) => {
  if (!shuttingDown) {
    console.error(`\nThe ${mode} server stopped (code ${code}).\n${viteLog.split('\n').slice(-12).join('\n')}`);
    stopAll(code ?? 1);
  }
});

async function waitForServer(timeoutMs = 60_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/`);
      if (res.ok) return true;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  return false;
}

if (!(await waitForServer())) {
  console.error(`The server did not answer on http://127.0.0.1:${port}/ within 60 s.\n${viteLog}`);
  stopAll(1);
}

log(`Local server ready on http://localhost:${port}`);
log('Starting the HTTPS tunnel...');

const tunnel = spawn(cloudflared, ['tunnel', '--url', `http://127.0.0.1:${port}`, '--no-autoupdate'], {
  cwd: root,
  stdio: ['ignore', 'pipe', 'pipe'],
});
children.push(tunnel);

let announced = false;
let tunnelLog = '';
const onTunnelData = async (data) => {
  const text = data.toString();
  tunnelLog += text;
  if (announced) return;
  const url = extractTunnelUrl(text);
  if (!url) return;
  announced = true;
  await announce(url);
};
tunnel.stdout.on('data', onTunnelData);
tunnel.stderr.on('data', onTunnelData);
tunnel.on('error', (e) => {
  console.error(`Could not start cloudflared: ${e.message}`);
  stopAll(1);
});
tunnel.on('exit', (code) => {
  if (!shuttingDown) {
    console.error(`\ncloudflared stopped (code ${code}).\n${tunnelLog.split('\n').slice(-12).join('\n')}`);
    stopAll(code ?? 1);
  }
});

setTimeout(() => {
  if (!announced && !shuttingDown) {
    console.error('\nNo tunnel URL after 45 s. Check your internet connection. cloudflared output:\n' + tunnelLog.slice(-1500));
    stopAll(1);
  }
}, 45_000);

async function announce(url) {
  const check = await checkPublicUrl(url);
  log();
  log('Poker Coach');
  log(line);
  log();
  log('Local:');
  log(`http://localhost:${port}`);
  log();
  log('Phone:');
  log(url);
  log();
  log('Open this URL on your phone (any network: 4G/5G or another Wi-Fi).');
  log();
  try {
    const qr = (await import('qrcode-terminal')).default;
    qr.generate(url, { small: true });
  } catch {
    /* the QR code is a convenience only */
  }
  if (check) {
    log(`Checked from this PC: the tunnel answers over HTTPS (HTTP ${check.status}, valid certificate).`);
    if (!check.systemDnsOk) {
      log('Note: the DNS of this PC (usually the router) does not know the new name yet, so opening the URL on THIS PC may fail');
      log('for a few minutes. A phone on 4G/5G is not affected. A phone on your home Wi-Fi uses the same router DNS: if it fails there,');
      log('switch the phone to mobile data or wait a few minutes.');
    }
  } else {
    log('Could not confirm the URL from this PC yet. Give it a few more seconds, then try on the phone.');
  }
  log(mode === 'preview'
    ? 'Mode: production build (service worker + manifest active: you can install the PWA).'
    : 'Mode: development server (hot reload). For the installable PWA use: npm run preview:tunnel');
  log('The URL is public while this runs and changes every launch. Press Ctrl+C to stop everything.');
  log(line);
}
