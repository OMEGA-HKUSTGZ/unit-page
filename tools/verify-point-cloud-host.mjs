// Small real Range GETs, compared with the retained originals. No full downloads.
import assert from 'node:assert/strict';
import { open, readFile, stat } from 'node:fs/promises';
const viewer = await readFile(new URL('../assets/js/viewer.js', import.meta.url), 'utf8');
const base = /const POINT_CLOUD_BASE = '([^']+)'/.exec(viewer)?.[1];
const version = /const POINT_CLOUD_VERSION = '([^']+)'/.exec(viewer)?.[1];
assert.ok(base && version, 'Missing point-cloud release configuration');
const scenes = [...viewer.matchAll(/cloud: pointCloudUrl\('([^']+)'\)/g)].map(m => m[1]);
assert.equal(scenes.length, 6);

async function verify(scene) {
  const path = new URL(`../assets/media/point-clouds/${scene}.pnts`, import.meta.url);
  const { size } = await stat(path);
  const file = await open(path);
  const url = new URL(`${base}${scene}.pnts?v=${version}`, 'https://omega-hkustgz.github.io/projects/unit/');
  try {
    for (const start of [0, Math.floor(size / 2), size - 64]) {
      const end = start + 63;
      const expected = Buffer.alloc(64);
      await file.read(expected, 0, 64, start);
      let failure;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          const response = await fetch(url, { headers: { Range: `bytes=${start}-${end}` }, signal: AbortSignal.timeout(30_000) });
          try {
            assert.equal(response.status, 206, `${scene}: Range required`);
            assert.equal(response.headers.get('content-range'), `bytes ${start}-${end}/${size}`);
            assert.ok(!response.headers.get('content-encoding') || response.headers.get('content-encoding') === 'identity');
            const bytes = Buffer.from(await response.arrayBuffer());
            assert.deepEqual(bytes, expected, `${scene}: bytes differ at ${start}`);
          } finally {
            await response.body?.cancel().catch(() => {});
          }
          failure = null;
          break;
        } catch (error) { failure = error; }
      }
      if (failure) throw failure;
    }
    console.log(`PASS ${scene}: head/middle/tail 206 and original bytes`);
  } finally { await file.close(); }
}
// Two scenes at a time keeps this gate small for the public host.
for (let i = 0; i < scenes.length; i += 2) await Promise.all(scenes.slice(i, i + 2).map(verify));
