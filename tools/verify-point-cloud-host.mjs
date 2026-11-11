// Small real Range GETs to the media site, compared with the recorded bytes of the frozen
// release (tools/point-cloud-release.json). No full downloads, no local copies needed.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
const viewer = await readFile(new URL('../assets/js/viewer.js', import.meta.url), 'utf8');
const release = JSON.parse(await readFile(new URL('./point-cloud-release.json', import.meta.url), 'utf8'));
const base = /const POINT_CLOUD_BASE = '([^']+)'/.exec(viewer)?.[1];
const version = /const POINT_CLOUD_VERSION = '([^']+)'/.exec(viewer)?.[1];
assert.ok(base && version, 'Missing point-cloud release configuration');
assert.equal(version, release.dataVersion, 'viewer.js and tools/point-cloud-release.json name different data versions');
const scenes = [...viewer.matchAll(/cloud: pointCloudUrl\('([^']+)'\)/g)].map(m => m[1]);
assert.equal(scenes.length, 6);

async function verify(scene) {
  const expected = release.files[scene];
  assert.ok(expected, `${scene}: not in tools/point-cloud-release.json`);
  const url = new URL(`${base}${scene}.pnts?v=${version}`, 'https://omega-hkustgz.github.io/projects/unit/');
  for (const { start, sha256 } of expected.windows) {
    const end = start + 63;
    let failure;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const response = await fetch(url, { headers: { Range: `bytes=${start}-${end}` }, signal: AbortSignal.timeout(30_000) });
        try {
          assert.equal(response.status, 206, `${scene}: Range required`);
          assert.equal(response.headers.get('content-range'), `bytes ${start}-${end}/${expected.bytes}`);
          assert.ok(!response.headers.get('content-encoding') || response.headers.get('content-encoding') === 'identity');
          const bytes = Buffer.from(await response.arrayBuffer());
          assert.equal(createHash('sha256').update(bytes).digest('hex'), sha256, `${scene}: bytes differ at ${start}`);
        } finally {
          await response.body?.cancel().catch(() => {});
        }
        failure = null;
        break;
      } catch (error) { failure = error; }
    }
    if (failure) throw failure;
  }
  console.log(`PASS ${scene}: head/middle/tail 206 and recorded bytes`);
}
// Two scenes at a time keeps this gate small for the public host.
for (let i = 0; i < scenes.length; i += 2) await Promise.all(scenes.slice(i, i + 2).map(verify));
