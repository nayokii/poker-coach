import { describe, expect, it, vi } from 'vitest';
import { cloudflaredCandidates, extractTunnelUrl, findCloudflared } from './tunnel.mjs';

describe('extractTunnelUrl', () => {
  it('finds the quick-tunnel URL in cloudflared output', () => {
    const out = [
      '2026-10-06T10:00:00Z INF Requesting new quick Tunnel on trycloudflare.com...',
      '2026-10-06T10:00:02Z INF |  Your quick Tunnel has been created! Visit it at (it may take some time to be reachable):  |',
      '2026-10-06T10:00:02Z INF |  https://rapid-lazy-fox-1234.trycloudflare.com                                             |',
    ].join('\n');
    expect(extractTunnelUrl(out)).toBe('https://rapid-lazy-fox-1234.trycloudflare.com');
  });

  it('ignores the Cloudflare API endpoint and unrelated URLs', () => {
    expect(extractTunnelUrl('POST https://api.trycloudflare.com/tunnel failed')).toBeNull();
    expect(extractTunnelUrl('see https://example.com and http://x.trycloudflare.com')).toBeNull();
    expect(extractTunnelUrl('api: https://api.trycloudflare.com then https://abc-def.trycloudflare.com')).toBe('https://abc-def.trycloudflare.com');
    expect(extractTunnelUrl('')).toBeNull();
  });
});

describe('cloudflared discovery', () => {
  it('prefers an explicit CLOUDFLARED_PATH, then PATH, then the usual Windows locations', () => {
    const env = { CLOUDFLARED_PATH: 'C:/tools/cf.exe', 'ProgramFiles(x86)': 'C:/PF86', ProgramFiles: 'C:/PF', LOCALAPPDATA: 'C:/Users/me/AppData/Local' };
    const list = cloudflaredCandidates(env, 'win32');
    expect(list[0]).toBe('C:/tools/cf.exe');
    expect(list[1]).toBe('cloudflared');
    expect(list.some((p) => p.replace(/\\/g, '/').endsWith('PF86/cloudflared/cloudflared.exe'))).toBe(true);
    expect(list.some((p) => p.replace(/\\/g, '/').includes('WinGet/Links/cloudflared.exe'))).toBe(true);
    expect(cloudflaredCandidates({}, 'linux')).toEqual(['cloudflared']);
  });

  it('returns null when nothing usable exists', async () => {
    // Simulate a machine without cloudflared whatever is really installed here: every probe fails.
    vi.resetModules();
    vi.doMock('node:child_process', () => ({ spawnSync: () => ({ error: new Error('ENOENT'), status: null }) }));
    vi.doMock('node:fs', async (orig) => ({ ...(await orig()), existsSync: () => false }));
    try {
      const isolated = await import('./tunnel.mjs?no-cloudflared');
      expect(isolated.findCloudflared({ CLOUDFLARED_PATH: 'C:/definitely/not/here.exe', PATH: '' }, 'win32')).toBeNull();
      expect(isolated.findCloudflared({ PATH: '' }, 'linux')).toBeNull();
    } finally {
      vi.doUnmock('node:child_process');
      vi.doUnmock('node:fs');
      vi.resetModules();
    }
  });
});
