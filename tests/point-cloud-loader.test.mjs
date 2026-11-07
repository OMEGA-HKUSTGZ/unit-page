import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const source = await readFile(new URL('../assets/js/viewer.js', import.meta.url), 'utf8');
function harness(fetchImpl, options) {
  const context = vm.createContext({
    window: {}, navigator: {}, document: { readyState: 'loading', addEventListener() {} },
    fetch: fetchImpl, Response, Headers, Uint8Array, DataView, Map, Set, DOMException,
    TextDecoder, console, setTimeout, clearTimeout,
  });
  vm.runInContext(`${source}\nglobalThis.classes = { PntsLoader, PointCloudViewer, DEMO_CONFIGS };`, context);
  const loader = new context.classes.PntsLoader('test', options);
  return { loader, ...context.classes };
}
function response(bytes, start, end, total = 100, overrides = {}) {
  return new Response(new Uint8Array(bytes), {
    status: 206,
    headers: { 'Content-Range': `bytes ${start}-${end}/${total}`, 'Content-Length': String(end - start + 1), ...overrides },
  });
}
function state() {
  return { url: '/cloud.pnts', manifest: { chunks: [{ offset: 20, compressedSize: 4 }] },
    partialChunks: new Map(), cachedBytes: 0, networkBytes: 0, partialResumeBytes: 0 };
}

test('reads a validated nonzero range without a full-file download', async () => {
  const { loader } = harness((_url, init) => {
    assert.equal(init.headers.Range, 'bytes=20-23');
    return response([1, 2, 3, 4], 20, 23);
  });
  assert.deepEqual([...await loader._fetchRange('/cloud.pnts', 20, 23)], [1, 2, 3, 4]);
});

test('production refuses 200 before reading the response body', async () => {
  let cancelled = false;
  const { loader } = harness(() => ({ status: 200, headers: new Headers(),
    body: { async cancel() { cancelled = true; } },
    arrayBuffer() { throw new Error('must not download'); } }));
  await assert.rejects(loader._fetchRange('/cloud.pnts', 0, 3), /Invalid point-cloud Range/);
  assert.equal(cancelled, true);
  await assert.rejects(loader.fetchChunk(state(), 0), /Invalid point-cloud Range/);
});

test('an explicit local-preview option retains full-file fallback', async () => {
  const { loader } = harness(() => new Response(new Uint8Array([10, 11, 12, 13])), { allowFullFile: true });
  assert.deepEqual([...await loader._fetchRange('/cloud.pnts', 1, 2)], [11, 12]);
});

test('rejects wrong, hidden, encoded or inconsistent range headers', async () => {
  for (const headers of [
    { 'Content-Range': 'bytes 21-24/100' }, { 'Content-Range': '' },
    { 'Content-Range': 'bytes 20-23/*' }, { 'Content-Range': 'bytes 20-23/23' },
    { 'Content-Length': '100' }, { 'Content-Encoding': 'gzip' },
  ]) {
    const { loader } = harness(() => response([1, 2, 3, 4], 20, 23, 100, headers));
    await assert.rejects(loader._fetchRange('/cloud.pnts', 20, 23), /Invalid point-cloud Range/);
  }
  let total = 100;
  const { loader } = harness(() => response([1, 2, 3, 4], 20, 23, total));
  await loader._fetchRange('/cloud.pnts', 20, 23);
  total = 101;
  await assert.rejects(loader._fetchRange('/cloud.pnts', 20, 23), /Invalid point-cloud Range/);
});

test('truncated or oversized bodies are errors and never become cached chunks', async () => {
  for (const bytes of [[1, 2], [1, 2, 3, 4, 5]]) {
    const { loader } = harness(() => response(bytes, 20, 23));
    let writes = 0;
    loader.store.put = async () => { writes += 1; };
    await assert.rejects(loader._fetchRange('/cloud.pnts', 20, 23), /Incomplete/);
    const s = state();
    await assert.rejects(loader.fetchChunk(s, 0), /Incomplete point-cloud chunk/);
    assert.equal(writes, 0);
    assert.equal(s.partialChunks.size, 0);
  }
});

test('resumes a partial chunk at the next byte and caches the complete chunk', async () => {
  const { loader } = harness((_url, init) => {
    assert.equal(init.headers.Range, 'bytes=22-23');
    return response([3, 4], 22, 23);
  });
  const s = state();
  s.partialChunks.set(0, { parts: [new Uint8Array([1, 2])], length: 2 });
  let written;
  loader.store.put = async (_url, _index, bytes) => { written = [...bytes]; };
  const result = await loader.fetchChunk(s, 0);
  assert.deepEqual([...result.bytes], [1, 2, 3, 4]);
  assert.deepEqual(written, [1, 2, 3, 4]);
  assert.equal(s.networkBytes, 2);
  assert.equal(s.partialResumeBytes, 2);
  assert.equal(s.partialChunks.size, 0);
});

test('an aborted header request remains an AbortError', async () => {
  const controller = new AbortController();
  controller.abort();
  const { loader } = harness(() => { throw new Error('must not fetch'); });
  await assert.rejects(loader._fetchRange('/cloud.pnts', 0, 3, controller.signal), { name: 'AbortError' });
});

test('six scene URLs retain same-origin routing and mobile chunk budget', () => {
  const { DEMO_CONFIGS, PointCloudViewer } = harness(() => {});
  assert.equal(Object.keys(DEMO_CONFIGS).length, 6);
  for (const [scene, cfg] of Object.entries(DEMO_CONFIGS)) {
    const url = new URL(cfg.cloud, 'https://omega-hkustgz.github.io/projects/unit/');
    assert.equal(url.origin, 'https://omega-hkustgz.github.io');
    assert.equal(url.pathname, `/unit-media/point-clouds/${scene}.pnts`);
    assert.equal(url.searchParams.get('v'), '0e1438880f2957264dab2b617f9d36d15db4d9ec');
  }
  const scene = { manifest: { count: 7_043_505, chunkCount: 108,
    chunks: Array.from({ length: 108 }, (_, i) => ({ firstPoint: i * 65_536 })) } };
  assert.equal(PointCloudViewer.prototype._chunkLimit.call({ fullDetail: false }, scene), 31);
  assert.equal(PointCloudViewer.prototype._chunkLimit.call({ fullDetail: true }, scene), 108);
});
