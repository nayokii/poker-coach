// Checks that a public tunnel URL answers over HTTPS, independently of the local DNS resolver.
//
// Some home routers (and ISPs) cache "this name does not exist" for a brand-new trycloudflare.com host,
// so the browser on the same PC can fail for a few minutes while the tunnel is perfectly fine. We
// therefore resolve the name through public resolvers (1.1.1.1 and 8.8.8.8) and connect to that address
// with the right TLS server name, so the certificate is still fully verified.
import { Resolver } from 'node:dns';
import https from 'node:https';

function resolveWithPublicDns(hostname) {
  const resolver = new Resolver();
  resolver.setServers(['1.1.1.1', '8.8.8.8']);
  const attempt = (fn) => new Promise((resolve) => fn.call(resolver, hostname, (err, addrs) => resolve(err ? [] : addrs)));
  return Promise.all([attempt(resolver.resolve4), attempt(resolver.resolve6)]).then(([v4, v6]) => [
    ...v4.map((address) => ({ address, family: 4 })),
    ...v6.map((address) => ({ address, family: 6 })),
  ]);
}

function get(url, lookup) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { lookup, timeout: 8000 }, (res) => {
      res.resume();
      resolve(res.statusCode ?? 0);
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
  });
}

/**
 * Resolves to { status, via } where `via` is 'system-dns' or 'public-dns', or null if the URL never answered.
 * `systemDnsOk` tells the caller whether the machine's own resolver can see the name.
 */
export async function checkPublicUrl(url, { attempts = 20, delayMs = 1500 } = {}) {
  const { hostname } = new URL(url);
  let systemDnsOk = false;
  for (let i = 0; i < attempts; i++) {
    try {
      const status = await get(url);
      if (status >= 200 && status < 400) return { status, via: 'system-dns', systemDnsOk: true };
    } catch {
      /* fall through to public DNS */
    }
    const addrs = await resolveWithPublicDns(hostname);
    for (const a of addrs) {
      try {
        // Node 20+ asks for every address (`all: true`) when autoSelectFamily is on.
        const lookup = (_host, opts, cb) => (opts && opts.all ? cb(null, [{ address: a.address, family: a.family }]) : cb(null, a.address, a.family));
        const status = await get(url, lookup);
        if (status >= 200 && status < 400) return { status, via: 'public-dns', systemDnsOk };
      } catch {
        /* try the next address */
      }
    }
    await new Promise((r) => setTimeout(r, delayMs));
  }
  return null;
}
