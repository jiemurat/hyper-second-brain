// The newest published version of the package from the npm registry.
// HSB_REGISTRY_URL overrides the registry (tests), HSB_OFFLINE=1 skips the request.
import https from 'node:https';
import http from 'node:http';

/** {state, version}: state is found, not-published (the registry answers 404), unreachable, or skipped (HSB_OFFLINE=1). */
export function lookupLatest(name, timeoutMs = 5000) {
  if (process.env.HSB_OFFLINE === '1') return Promise.resolve({ state: 'skipped', version: null });
  const base = (process.env.HSB_REGISTRY_URL || 'https://registry.npmjs.org').replace(/\/$/, '');
  const url = `${base}/${name.replace('/', '%2f')}/latest`;
  const get = url.startsWith('https:') ? https.get : http.get;
  return new Promise((resolve) => {
    const req = get(url, { headers: { accept: 'application/json' } }, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => {
        if (res.statusCode === 404) return resolve({ state: 'not-published', version: null });
        try {
          const version = res.statusCode === 200 ? JSON.parse(body).version || null : null;
          resolve({ state: version ? 'found' : 'unreachable', version });
        } catch {
          resolve({ state: 'unreachable', version: null });
        }
      });
    });
    req.setTimeout(timeoutMs, () => req.destroy());
    req.on('error', () => resolve({ state: 'unreachable', version: null }));
  });
}

/** -1, 0 or 1 for two x.y.z versions (pre-release parts are ignored). */
export function compareVersions(a, b) {
  const pa = String(a).split('-')[0].split('.').map(Number);
  const pb = String(b).split('-')[0].split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d < 0 ? -1 : 1;
  }
  return 0;
}
