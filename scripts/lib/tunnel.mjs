// Helpers for scripts/dev-tunnel.mjs. Kept in their own module so they can be unit tested.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

/** First https://<random>.trycloudflare.com URL found in a line of cloudflared output, or null. */
export function extractTunnelUrl(text) {
  for (const m of text.matchAll(/https:\/\/([a-z0-9][a-z0-9-]*)\.trycloudflare\.com/gi)) {
    if (m[1].toLowerCase() !== 'api') return m[0]; // api.trycloudflare.com is Cloudflare's own endpoint, not the tunnel
  }
  return null;
}

/** Candidate cloudflared executables, in order of preference. */
export function cloudflaredCandidates(env = process.env, platform = process.platform) {
  const list = [];
  if (env.CLOUDFLARED_PATH) list.push(env.CLOUDFLARED_PATH);
  list.push('cloudflared'); // on PATH
  if (platform === 'win32') {
    for (const base of [env['ProgramFiles(x86)'], env.ProgramFiles]) {
      if (base) list.push(join(base, 'cloudflared', 'cloudflared.exe'));
    }
    if (env.LOCALAPPDATA) list.push(join(env.LOCALAPPDATA, 'Microsoft', 'WinGet', 'Links', 'cloudflared.exe'));
  }
  return list;
}

/** Path/command of a working cloudflared, or null. */
export function findCloudflared(env = process.env, platform = process.platform) {
  for (const cand of cloudflaredCandidates(env, platform)) {
    if (cand !== 'cloudflared' && !existsSync(cand)) continue;
    const r = spawnSync(cand, ['--version'], { encoding: 'utf8' });
    if (!r.error && r.status === 0) return cand;
  }
  return null;
}

export const INSTALL_HELP = `cloudflared is not installed (or not on your PATH).

Install it once, then run this command again:

  Windows (PowerShell):   winget install --id Cloudflare.cloudflared
                          then CLOSE and REOPEN the terminal so that PATH is refreshed
  macOS:                  brew install cloudflared
  Linux / other:          https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/

No Cloudflare account, login or token is needed: this uses a temporary "quick tunnel".
If cloudflared is installed somewhere unusual, set CLOUDFLARED_PATH to its full path.`;
