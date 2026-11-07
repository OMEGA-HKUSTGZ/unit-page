/* Ported from the original UniT project page (sc2i-hkustgz.github.io/UniT,
   script.js at commit 629ab47).  Changes: the per-scene initial views are a
   static config baked in below (no Cloudflare Worker fetch, no admin save
   path), the view-controls panel is public with session-only tweaks, and
   markup hooks follow the OMEGA page.  The intro-video, chapter-nav and
   lightbox helpers live in main.js. */

/* ========================================
   UniT project page — interactive examples
   PNT v4 point-cloud viewer + thumbnail video sync

   Loading strategy (lazy init + resumable chunk streaming)
   -----------------------------------------------------
   Each scene is served as one chunk-indexed .pnts file.  The payload is
   split into independently-compressed chunks of 65 536 points; the point
   order is inherited from the final shuffled .pnt stream, so **any chunk
   prefix is a uniform random subsample of the whole scene**.  That means:

     - The first block rendered already spans the full bounding box —
       the cloud looks like a sparse sketch of the real scene, not a
       spatial corner.
     - Each subsequent block adds more points, uniformly distributed.
       The cloud visibly densifies in real-time as bytes arrive, all
       the way up to full detail, with no discrete "now it refines"
       step.
     - If the user cancels or switches scenes mid-load, whatever
       arrived so far is still a usable visualisation.

   Implementation:
     - The viewer fetches the .pnts header/index first, then uses HTTP
       Range requests for independently-compressed chunks. Completed
       chunks are stored in IndexedDB, and partial in-flight chunks are
       kept in memory so switch-away/switch-back resumes instead of
       restarting.
     - The viewer preallocates the final-size position / colour arrays
       on header, installs an empty geometry (drawRange=0), then
       appends each block in place.  `BufferAttribute.updateRange`
       batches GPU sub-uploads to just the newly-added slice per
       animation frame — total upload over a load is ~1×N points,
       not quadratic.
     - The scene's centre + bounding sphere come from the header's
       min/scale (the full-scene quantisation bbox), so the transform
       is exact from byte 44 onward — no re-centring as more points
       land.

   Other wins layered on top:
     - The whole viewer is lazy-started only when the Examples section
       enters view. This keeps the project page and Results section cheap
       to open.
     - Scene switches abort the active fetch/decompress/read loop and
       stale GPU flushes so old loads cannot build up behind the current
       thumbnail.
   ======================================== */


// ========================================
// Cache eviction
//
// The Cache API name embeds a version number (unit-pnt-vN) that we bump
// whenever point-cloud bytes change format or geometry. Without explicit
// cleanup, every bump leaks up to ~175 MB of stale cache per user (the
// old entries still live under the old cache name forever).  On startup,
// delete every unit-pnt-* cache that isn't the current one.
// ========================================
function evictStaleCaches() {
    if (!('caches' in self)) return;
    caches.keys().then(names => {
        for (const n of names) {
            if (n.startsWith('unit-pnt-') && n !== CACHE_NAME) {
                caches.delete(n).catch(() => {});
            }
        }
    }).catch(() => {});
    if ('indexedDB' in window && indexedDB.databases) {
        indexedDB.databases().then(dbs => {
            for (const db of dbs) {
                if (db.name?.startsWith('unit-pnts-') && db.name !== PNTS_DB_NAME) {
                    indexedDB.deleteDatabase(db.name);
                }
            }
        }).catch(() => {});
    }
}


// ========================================
// Deferred Examples bootstrap
//
// The point-cloud viewer is the only heavyweight part of the page. It starts
// the active scene's single resumable stream when Examples enters view; clicks
// and thumbnails only ensure the same stream is active.
// ========================================
function initDeferredDemo() {
    const demo = document.getElementById('examples');
    if (!demo) return;

    let demoPromise = null;
    let ready = false;
    const getDemo = () => {
        if (!demoPromise) {
            demoPromise = initDemo().then(controller => {
                ready = true;
                return controller;
            }).catch(err => {
                console.error('Failed to initialize demo:', err);
                demoPromise = null;
                const messageEl = document.getElementById('demo-message');
                if (messageEl) {
                    messageEl.textContent = 'The 3D viewer could not start. Check your connection and reload the page.';
                    messageEl.style.display = 'flex';
                    messageEl.style.opacity = '1';
                }
                throw err;
            });
        }
        return demoPromise;
    };

    const startFull = (key) => {
        getDemo().then(controller => controller && controller.showFull(key)).catch(() => {});
    };

    document.querySelectorAll('a[href="#examples"]').forEach(link => {
        link.addEventListener('click', () => requestAnimationFrame(() => startFull()), { once: true });
    });

    if ('IntersectionObserver' in window) {
        const io = new IntersectionObserver((entries) => {
            if (entries.some(e => e.isIntersecting)) startFull();
        }, { rootMargin: '160px 0px', threshold: 0.01 });
        io.observe(demo);
    }

    // The settings and measure buttons are wired up once the viewer has
    // started; a click that arrives before then is replayed afterwards.
    demo.addEventListener('click', (e) => {
        if (e.target.closest?.('.demo-thumb')) return;
        const early = !ready && e.target.closest?.('#controls-toggle-btn, #measure-btn');
        startFull();
        if (early) getDemo().then(() => early.click()).catch(() => {});
    });
}

// Baked from the live Cloudflare Worker config on 2026-11-03
// (omega-lab-infra/handoffs/unit-worker-config-2026-11-03.json), merged over
// the original page's hard-coded defaults exactly as its applyRemoteConfig()
// did: title/cloud/flipY from the baked block, everything else from the
// Worker, samplingRate pinned to 1.0.  This is now the only source of the
// per-scene initial views; there is no runtime config fetch.
//
// Fields:
//   cloud         — chunk-indexed .pnts path (same origin, Range-capable)
//   pointSize     — splat size in world units (the viewer clamps to a
//                   minimum on-screen size, so 1e-6 means 'smallest')
//   flipY         — negate Y after centring
//   camera        — unit offset from the bounding-sphere centre,
//                   scaled by the sphere radius on load
//   samplingRate  — fraction of points drawn (1.0 = all)
//   brightness    — vertex-colour multiplier
//   background    — canvas clear colour
//   rotation      — extra Euler angles (degrees, XYZ) on the cloud
// The six v1 paths in unit-media are frozen. New bytes require a new path;
// the query identifies this release for browser/IndexedDB cache isolation.
const POINT_CLOUD_BASE = '../../unit-media/point-clouds/';
const POINT_CLOUD_VERSION = '0e1438880f2957264dab2b617f9d36d15db4d9ec';
const pointCloudUrl = (scene) => `${POINT_CLOUD_BASE}${scene}.pnts?v=${POINT_CLOUD_VERSION}`;

const DEMO_CONFIGS = {
    hkust_intr: {
        title: "HKUST (GZ) INTR",
        cloud: pointCloudUrl('hkust_intr'),
        pointSize: 1e-06,
        flipY: true,
        camera: { x: -0.6319618076660898, y: 0.3153347261155949, z: -1.4732851957859752 },
        samplingRate: 1.0,
        brightness: 1,
        background: "#ffffff",
        rotation: { x: 1, y: 32, z: 0 }
    },
    hkust_toy: {
        title: "HKUST (GZ) Toy",
        cloud: pointCloudUrl('hkust_toy'),
        pointSize: 1e-06,
        flipY: true,
        camera: { x: -0.6901299380940393, y: 0.34435931471359005, z: -1.6088918802192318 },
        samplingRate: 1.0,
        brightness: 1,
        background: "#ffffff",
        rotation: { x: 10, y: 22, z: 0 }
    },
    hkust_redbird: {
        title: "HKUST (GZ) Red Bird",
        cloud: pointCloudUrl('hkust_redbird'),
        pointSize: 1e-06,
        flipY: true,
        camera: { x: -0.45103204678001235, y: 0.3153347261155385, z: -1.4435610207830187 },
        samplingRate: 1.0,
        brightness: 1,
        background: "#ffffff",
        rotation: { x: -4, y: 41, z: 0 }
    },
    drift: {
        title: "Drift",
        cloud: pointCloudUrl('drift'),
        pointSize: 1e-06,
        flipY: true,
        camera: { x: -0.39666836040233505, y: 0.39666836040233494, z: -1.1900050812070047 },
        samplingRate: 1.0,
        brightness: 1,
        background: "#ffffff",
        rotation: { x: 1, y: -50, z: 0 }
    },
    gta_sfm: {
        title: "GTA SfM",
        cloud: pointCloudUrl('gta_sfm'),
        pointSize: 1e-06,
        flipY: true,
        camera: { x: -0.46654031199883444, y: 0.23262397828196726, z: -1.6322449142784692 },
        samplingRate: 1.0,
        brightness: 1,
        background: "#ffffff",
        rotation: { x: -12, y: -6, z: 0 }
    },
    kitti: {
        title: "KITTI",
        cloud: pointCloudUrl('kitti'),
        pointSize: 1e-06,
        flipY: true,
        camera: { x: -0.4189952357359402, y: 0.6135287380419124, z: -1.3943834955498005 },
        samplingRate: 1.0,
        brightness: 1,
        background: "#ffffff",
        rotation: { x: -26, y: 57, z: 0 }
    }
};

const CACHE_NAME = 'unit-pnt-v14';
const PNTS_DB_NAME = 'unit-pnts-v14';

const FIRST_PAINT_VISIBLE_POINTS = 786_432;
const CHUNK_FETCH_WINDOW = 4;
const INTERACTION_POINT_BUDGET_FACTOR = 1.0;
const INTERACTION_BUDGET_SETTLE_MS = 450;
const PNTS_HEADER_PROBE_BYTES = 8192;
const MAX_INDEXEDDB_CACHE_BYTES = 250 * 1024 * 1024;
const MAX_INACTIVE_DECODED_BYTES = 120 * 1024 * 1024;
// Phones and low-memory devices stream a uniform subsample first (any chunk
// prefix is one, see the header comment); "Load all points" lifts the cap
// for the rest of the visit. Desktops stream every point as before.
const LIGHT_DEVICE = (window.matchMedia ? window.matchMedia('(pointer: coarse)').matches : false) ||
    (navigator.deviceMemory != null && navigator.deviceMemory <= 4);
const LIGHT_POINT_BUDGET = 2_000_000;

window.__UNIT_DEMO_PERF = window.__UNIT_DEMO_PERF || {
    activeScene: null,
    activeLoadId: 0,
    activeUrl: null,
    loading: false,
    abortedLoads: 0,
    completedLoads: 0,
    livePointClouds: 0,
    activeThumbTimers: 0,
    visiblePoints: 0,
    loadedPoints: 0,
    totalPoints: 0,
    loadedChunkCount: 0,
    totalChunkCount: 0,
    networkBytes: 0,
    cachedBytes: 0,
    cacheBytes: 0,
    decodedBytes: 0,
    gpuBytes: 0,
    partialResumeBytes: 0,
    redownloadedChunks: 0,
    inflightFetches: 0,
    decodeQueueLength: 0,
    uploadQueueLength: 0,
    dirtyUploadRanges: 0,
    webglContextLost: false,
    lastError: null,
    effectiveConfig: null,
    status: 'idle'
};

const DEMO_DEPENDENCY_SCRIPTS = [
    'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js',
    'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js'
];

let demoDependenciesPromise = null;

function loadScriptOnce(src) {
    return new Promise((resolve, reject) => {
        const absoluteSrc = new URL(src, document.baseURI).href;
        const existing = Array.from(document.scripts).find(s => s.src === absoluteSrc);
        if (existing) {
            if (existing.dataset.loaded === 'true') {
                resolve();
                return;
            }
            existing.addEventListener('load', () => resolve(), { once: true });
            existing.addEventListener('error', () => reject(new Error(`Failed to load ${src}`)), { once: true });
            return;
        }
        const script = document.createElement('script');
        script.src = src;
        script.async = false;
        script.onload = () => {
            script.dataset.loaded = 'true';
            resolve();
        };
        script.onerror = () => reject(new Error(`Failed to load ${src}`));
        document.head.appendChild(script);
    });
}

function ensureDemoDependencies() {
    if (window.THREE && window.THREE.OrbitControls) return Promise.resolve();
    if (!demoDependenciesPromise) {
        demoDependenciesPromise = DEMO_DEPENDENCY_SCRIPTS
            .reduce((p, src) => p.then(() => loadScriptOnce(src)), Promise.resolve())
            .then(() => {
                if (!window.THREE || !window.THREE.OrbitControls) {
                    throw new Error('Three.js demo dependencies did not initialize');
                }
            });
    }
    return demoDependenciesPromise;
}



// ========================================
// Interactive Examples
// ========================================
async function initDemo() {
    const canvas = document.getElementById('demo-canvas');
    if (!canvas) return;
    const messageEl = document.getElementById('demo-message');
    if (messageEl) {
        messageEl.textContent = 'Preparing 3D viewer...';
        messageEl.style.display = 'flex';
        messageEl.style.opacity = '1';
    }
    await ensureDemoDependencies();

    // A basic local file server may ignore Range. Opt in explicitly for that
    // preview only; production must never silently download a whole scene.
    const allowFullFile = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname) &&
        new URLSearchParams(location.search).get('full-file-preview') === '1';
    const loader = new PntsLoader(PNTS_DB_NAME, { allowFullFile });
    const viewer = new PointCloudViewer(canvas, messageEl, loader);
    const thumbs = Array.from(document.querySelectorAll('.demo-thumb'));
    const controls = new ViewerControls(viewer);

    let currentDemo = null;
    let activeThumbVideo = null;
    let activeThumbToken = 0;
    let activeThumbLoopTimer = null;

    function select(key, full = true) {
        const cfg = DEMO_CONFIGS[key];
        if (!cfg) return;
        if (key === currentDemo) {
            const selectedVideo = document.querySelector(`.demo-thumb[data-demo="${key}"] video`);
            if (selectedVideo && selectedVideo !== activeThumbVideo) {
                focusThumbVideo(selectedVideo);
            } else if (selectedVideo) {
                maintainActiveThumbLoop(selectedVideo);
            }
            const resolved = controls.bind(key, cfg);
            if (full) viewer.showFull(key, resolved);
            else viewer.showPreview(key, resolved);
            return;
        }
        currentDemo = key;
        let selectedVideo = null;
        thumbs.forEach(t => {
            const isSelected = t.dataset.demo === key;
            t.classList.toggle('selected', isSelected);
            const v = t.querySelector('video');
            if (!v) return;
            if (isSelected) selectedVideo = v;
            else blurThumbVideo(v);
        });
        if (selectedVideo) focusThumbVideo(selectedVideo);
        const resolved = controls.bind(key, cfg);
        if (full) viewer.showFull(key, resolved);
        else viewer.showPreview(key, resolved);
    }

    const requestFullForCurrent = () => {
        if (!currentDemo) return;
        select(currentDemo, true);
    };
    canvas.addEventListener('pointerdown', requestFullForCurrent, { capture: true });
    canvas.addEventListener('wheel', requestFullForCurrent, { capture: true, passive: true });
    const measureBtn = document.getElementById('measure-btn');
    if (measureBtn) measureBtn.addEventListener('click', requestFullForCurrent, { capture: true });

    // Start (or resume) autoplay on the currently-focused thumbnail.
    // Three independent things can defer playback here:
    //   1. `preload="metadata"` keeps the off-screen thumbs light, so
    //      the first play() call can fire before a single frame has
    //      been decoded — retry on loadeddata/canplay covers that.
    //   2. Chrome's muted-autoplay policy suspends playback whenever
    //      the element is outside the viewport, even if play() was
    //      previously invoked.  The thumbnails live well below the
    //      fold, so on first load the select() call lands before the
    //      user has scrolled to them.  An IntersectionObserver kicks
    //      play() again each time the selected thumb becomes visible.
    //   3. Chrome also pauses media when the tab is hidden.  When the
    //      user comes back (visibilitychange → "visible"), re-arm the
    //      currently-selected thumb so it resumes looping.
    const isActiveThumbVideo = (v, token = activeThumbToken) =>
        v && v === activeThumbVideo && token === activeThumbToken;

    const pauseInactiveThumbVideos = () => {
        thumbs.forEach(t => {
            const v = t.querySelector('video');
            if (!v || v === activeThumbVideo) return;
            if (!v.paused) v.pause();
        });
    };

    const rewindIfAtEnd = (v, force = false) => {
        const duration = Number.isFinite(v.duration) ? v.duration : 0;
        const atEnd = v.ended || (duration > 0 && v.currentTime >= duration - 0.08);
        if (!force && !atEnd) return;
        try { v.currentTime = 0; } catch {}
    };

    const tryPlay = (v, token = activeThumbToken) => {
        if (!isActiveThumbVideo(v, token)) return;
        pauseInactiveThumbVideos();
        rewindIfAtEnd(v);
        if (!v.paused) return;
        const p = v.play();
        if (p && typeof p.catch === 'function') {
            p.catch(() => {
                if (isActiveThumbVideo(v, token)) pauseInactiveThumbVideos();
            });
        }
    };

    const maintainActiveThumbLoop = (v, token = activeThumbToken) => {
        if (!isActiveThumbVideo(v, token)) return;
        const thumb = v.closest('.demo-thumb');
        if (!thumb || !thumb.classList.contains('selected')) return;

        v.muted = true;
        v.loop = true;
        v.playsInline = true;
        if (v.playbackRate === 0) v.playbackRate = 1;

        const duration = Number.isFinite(v.duration) ? v.duration : 0;
        if (v.ended || (duration > 0 && v.currentTime >= duration - 0.08)) {
            rewindIfAtEnd(v, true);
        }
        tryPlay(v, token);
    };

    const armActiveThumbLoop = (v, token) => {
        if (activeThumbLoopTimer) clearInterval(activeThumbLoopTimer);
        activeThumbLoopTimer = setInterval(() => {
            maintainActiveThumbLoop(v, token);
        }, 250);
        window.__UNIT_DEMO_PERF.activeThumbTimers = 1;
    };

    const getSelectedVideo = () => {
        const sel = document.querySelector('.demo-thumb.selected video');
        return sel || null;
    };
    const thumbVisibility = new IntersectionObserver((entries) => {
        for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            const v = entry.target;
            const thumb = v.closest('.demo-thumb');
            if (thumb && thumb.classList.contains('selected')) tryPlay(v);
        }
    }, { threshold: 0.1 });
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') maintainActiveThumbLoop(getSelectedVideo());
    });

    function focusThumbVideo(v) {
        activeThumbVideo = v;
        activeThumbToken += 1;
        const token = activeThumbToken;
        pauseInactiveThumbVideos();

        v.muted = true;
        v.loop = true;
        v.playsInline = true;
        if (v.preload !== 'auto') v.preload = 'auto';
        rewindIfAtEnd(v, true);
        armActiveThumbLoop(v, token);
        const start = () => {
            if (!isActiveThumbVideo(v, token)) return;
            pauseInactiveThumbVideos();
            maintainActiveThumbLoop(v, token);
        };
        start();                                            // kick off loading + play
        thumbVisibility.observe(v);
    }

    function blurThumbVideo(v) {
        thumbVisibility.unobserve(v);
        v.pause();
        try { v.currentTime = 0; } catch {}
    }

    thumbs.forEach(t => {
        const v = t.querySelector('video');
        if (v) {
            const enforceSingleActivePlayback = () => {
                if (v === activeThumbVideo) {
                    pauseInactiveThumbVideos();
                } else {
                    v.pause();
                    try { v.currentTime = 0; } catch {}
                }
            };
            v.addEventListener('play', enforceSingleActivePlayback);
            v.addEventListener('playing', enforceSingleActivePlayback);
            v.addEventListener('ended', () => maintainActiveThumbLoop(v));
            v.addEventListener('pause', () => {
                if (v === activeThumbVideo) {
                    setTimeout(() => maintainActiveThumbLoop(v), 0);
                }
            });
            v.addEventListener('loadeddata', () => maintainActiveThumbLoop(v));
            v.addEventListener('canplay', () => maintainActiveThumbLoop(v));
            v.addEventListener('stalled', () => maintainActiveThumbLoop(v));
            v.addEventListener('suspend', () => maintainActiveThumbLoop(v));
            v.addEventListener('timeupdate', () => {
                if (v === activeThumbVideo) rewindIfAtEnd(v);
            });
        }
        t.addEventListener('click', (e) => {
            e.stopPropagation();
            select(t.dataset.demo, true);
        });
    });

    return {
        showPreview(key = currentDemo || 'hkust_intr') {
            return Promise.resolve(select(key, false));
        },
        showFull(key = currentDemo || 'hkust_intr') {
            return Promise.resolve(select(key, true));
        },
        get currentDemo() {
            return currentDemo;
        }
    };
}


// ========================================
// PntsLoader
//
// `scene.pnts` is a single logical point-cloud asset:
//   - 64-byte PNTS header
//   - fixed-size index entries
//   - independently gzip-compressed payload chunks
//
// The header/index is fetched once, then chunk payloads are fetched through
// byte ranges. Completed chunks are persisted in IndexedDB; partial chunks
// are retained in memory during scene switches so the next activation resumes
// from the missing byte instead of restarting the chunk.
// ========================================
function concatUint8(parts, totalLength) {
    if (parts.length === 1 && parts[0].byteLength === totalLength) return parts[0];
    const out = new Uint8Array(totalLength);
    let offset = 0;
    for (const part of parts) {
        out.set(part, offset);
        offset += part.byteLength;
    }
    return out;
}

function nextFrame() {
    return new Promise(resolve => requestAnimationFrame(resolve));
}

class PntsChunkStore {
    constructor(dbName) {
        this.dbName = dbName;
        this.dbPromise = null;
        this.disabled = !('indexedDB' in window);
        this.estimatedBytes = 0;
        this.lastEstimateAt = 0;
        this.lastEvictAt = 0;
    }

    _key(url, index) {
        return `${url}#${index}`;
    }

    _db() {
        if (this.disabled) return Promise.resolve(null);
        if (this.dbPromise) return this.dbPromise;
        this.dbPromise = new Promise((resolve) => {
            const req = indexedDB.open(this.dbName, 1);
            req.onupgradeneeded = () => {
                const db = req.result;
                if (!db.objectStoreNames.contains('chunks')) {
                    db.createObjectStore('chunks', { keyPath: 'key' });
                }
                if (!db.objectStoreNames.contains('meta')) {
                    db.createObjectStore('meta', { keyPath: 'key' });
                }
            };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => {
                this.disabled = true;
                resolve(null);
            };
        });
        return this.dbPromise;
    }

    async get(url, index, expectedSize) {
        const db = await this._db();
        if (!db) return null;
        return new Promise(resolve => {
            const tx = db.transaction('chunks', 'readonly');
            const req = tx.objectStore('chunks').get(this._key(url, index));
            req.onsuccess = () => {
                const row = req.result;
                const bytes = row?.bytes;
                if (bytes && bytes.byteLength === expectedSize) {
                    this.touch(url, index, expectedSize).catch(() => {});
                    resolve(bytes);
                } else {
                    resolve(null);
                }
            };
            req.onerror = () => resolve(null);
        });
    }

    async touch(url, index, size) {
        const db = await this._db();
        if (!db || !db.objectStoreNames.contains('meta')) return false;
        return new Promise(resolve => {
            const tx = db.transaction('meta', 'readwrite');
            tx.objectStore('meta').put({
                key: this._key(url, index),
                url,
                index,
                size,
                updatedAt: Date.now(),
            });
            tx.oncomplete = () => resolve(true);
            tx.onerror = () => resolve(false);
            tx.onabort = () => resolve(false);
        });
    }

    async put(url, index, bytes) {
        const db = await this._db();
        if (!db) return false;
        const ok = await new Promise(resolve => {
            const key = this._key(url, index);
            const tx = db.transaction(['chunks', 'meta'], 'readwrite');
            tx.objectStore('chunks').put({
                key,
                url,
                index,
                size: bytes.byteLength,
                bytes,
                updatedAt: Date.now(),
            });
            tx.objectStore('meta').put({
                key,
                url,
                index,
                size: bytes.byteLength,
                updatedAt: Date.now(),
            });
            tx.oncomplete = () => resolve(true);
            tx.onerror = () => resolve(false);
            tx.onabort = () => resolve(false);
        });
        if (ok) {
            this.estimatedBytes += bytes.byteLength;
            this.lastEstimateAt = Date.now();
            const now = Date.now();
            if (now - this.lastEvictAt > 3000) {
                this.lastEvictAt = now;
                this.evictLRU(MAX_INDEXEDDB_CACHE_BYTES).catch(() => {});
            }
        }
        return ok;
    }

    async estimateBytes(maxAgeMs = 5000) {
        const now = Date.now();
        if (now - this.lastEstimateAt < maxAgeMs) return this.estimatedBytes;
        const db = await this._db();
        if (!db) return 0;
        return new Promise(resolve => {
            const tx = db.transaction('meta', 'readonly');
            const req = tx.objectStore('meta').getAll();
            req.onsuccess = () => {
                const rows = req.result || [];
                this.estimatedBytes = rows.reduce((sum, row) => sum + (row.size || 0), 0);
                this.lastEstimateAt = now;
                resolve(this.estimatedBytes);
            };
            req.onerror = () => resolve(this.estimatedBytes || 0);
        });
    }

    async evictLRU(maxBytes) {
        const db = await this._db();
        if (!db) return 0;
        const rows = await new Promise(resolve => {
            const tx = db.transaction('meta', 'readonly');
            const req = tx.objectStore('meta').getAll();
            req.onsuccess = () => resolve(req.result || []);
            req.onerror = () => resolve([]);
        });
        let total = rows.reduce((sum, row) => sum + (row.size || 0), 0);
        this.estimatedBytes = total;
        this.lastEstimateAt = Date.now();
        if (total <= maxBytes) return total;

        const victims = rows
            .slice()
            .sort((a, b) => (a.updatedAt || 0) - (b.updatedAt || 0));
        await new Promise(resolve => {
            const tx = db.transaction(['chunks', 'meta'], 'readwrite');
            const chunks = tx.objectStore('chunks');
            const meta = tx.objectStore('meta');
            for (const row of victims) {
                if (total <= maxBytes) break;
                total -= row.size || 0;
                chunks.delete(row.key);
                meta.delete(row.key);
            }
            tx.oncomplete = () => resolve();
            tx.onerror = () => resolve();
            tx.onabort = () => resolve();
        });
        this.estimatedBytes = Math.max(0, total);
        this.lastEstimateAt = Date.now();
        return this.estimatedBytes;
    }
}

class PntsLoader {
    constructor(dbName, { allowFullFile = false } = {}) {
        this.store = new PntsChunkStore(dbName);
        this.fullFileCache = new Map();
        this.fileSizes = new Map();
        this.allowFullFile = allowFullFile;
    }

    estimateCacheBytes(maxAgeMs) {
        return this.store.estimateBytes(maxAgeMs);
    }

    releaseFullFile(url) {
        this.fullFileCache.delete(url);
    }

    _rememberFullFile(url, bytes) {
        if (!this.fullFileCache.has(url)) {
            this.fullFileCache.clear();
            this.fullFileCache.set(url, bytes);
        }
        return this.fullFileCache.get(url);
    }

    _sliceFullFile(url, start, end) {
        const full = this.fullFileCache.get(url);
        if (!full || end >= full.byteLength) return null;
        return full.slice(start, end + 1);
    }

    async _validateRangeResponse(resp, start, end, url) {
        const match = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(resp.headers.get('Content-Range') || '');
        const length = resp.headers.get('Content-Length');
        const encoding = resp.headers.get('Content-Encoding');
        const previousSize = this.fileSizes.get(url);
        if (resp.status !== 206 || !match || Number(match[1]) !== start || Number(match[2]) !== end ||
            !Number.isSafeInteger(Number(match[3])) || Number(match[3]) <= end ||
            (previousSize != null && previousSize !== Number(match[3])) ||
            (length != null && Number(length) !== end - start + 1) ||
            (encoding && encoding !== 'identity')) {
            await resp.body?.cancel().catch(() => {});
            throw new Error(`Invalid point-cloud Range response (${resp.status}) for ${start}-${end}: ${url}`);
        }
        this.fileSizes.set(url, Number(match[3]));
    }

    async _fetchRange(url, start, end, signal, onBytes) {
        const cachedFull = this._sliceFullFile(url, start, end);
        if (cachedFull) return cachedFull;
        if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
        const resp = await fetch(url, {
            signal,
            priority: 'high',
            headers: { Range: `bytes=${start}-${end}` },
        });
        if (resp.status === 200 && this.allowFullFile) {
            const full = this._rememberFullFile(url, new Uint8Array(await resp.arrayBuffer()));
            if (onBytes) onBytes(full.byteLength);
            const slice = this._sliceFullFile(url, start, end);
            if (slice) return slice;
            throw new Error(`Full response too small for requested range ${start}-${end}: ${url}`);
        }
        await this._validateRangeResponse(resp, start, end, url);
        if (!resp.body) {
            const arr = new Uint8Array(await resp.arrayBuffer());
            if (arr.byteLength !== end - start + 1) throw new Error(`Incomplete point-cloud range: ${url}`);
            if (onBytes) onBytes(arr.byteLength);
            return arr;
        }
        const reader = resp.body.getReader();
        const abortReader = () => reader.cancel().catch(() => {});
        if (signal) signal.addEventListener('abort', abortReader, { once: true });
        const parts = [];
        let total = 0;
        try {
            while (true) {
                if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
                const { done, value } = await reader.read();
                if (done) break;
                parts.push(value);
                total += value.byteLength;
                if (onBytes) onBytes(value.byteLength);
            }
        } finally {
            if (signal) signal.removeEventListener('abort', abortReader);
        }
        if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
        if (total !== end - start + 1) throw new Error(`Incomplete point-cloud range: ${url}`);
        return concatUint8(parts, total);
    }

    parseManifest(bytes, url) {
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        const magic = String.fromCharCode(
            view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3)
        );
        if (magic !== 'PNTS') throw new Error(`Not a PNTS stream: ${url}`);
        const version = view.getUint32(4, true);
        if (version !== 1) throw new Error(`Unsupported PNTS version ${version}: ${url}`);
        const count = view.getUint32(8, true);
        const blockSize = view.getUint32(12, true);
        const pointsPerChunk = view.getUint32(16, true);
        const chunkCount = view.getUint32(20, true);
        const entrySize = view.getUint32(24, true);
        const headerSize = view.getUint32(28, true);
        const indexBytes = headerSize + chunkCount * entrySize;
        if (entrySize !== 24) throw new Error(`Unsupported PNTS index entry size ${entrySize}: ${url}`);
        if (bytes.byteLength < indexBytes) return { needBytes: indexBytes };

        const chunks = [];
        for (let i = 0; i < chunkCount; i += 1) {
            const base = headerSize + i * entrySize;
            chunks.push({
                firstPoint: view.getUint32(base, true),
                pointCount: view.getUint32(base + 4, true),
                blockCount: view.getUint32(base + 8, true),
                compressedSize: view.getUint32(base + 12, true),
                rawSize: view.getUint32(base + 16, true),
                offset: view.getUint32(base + 20, true),
            });
        }

        return {
            url,
            magic,
            version,
            count,
            blockSize,
            pointsPerChunk,
            chunkCount,
            entrySize,
            headerSize,
            min: [view.getFloat32(32, true), view.getFloat32(36, true), view.getFloat32(40, true)],
            scale: [view.getFloat32(44, true), view.getFloat32(48, true), view.getFloat32(52, true)],
            chunks,
        };
    }

    async loadManifest(url, signal, onBytes) {
        const probeEnd = PNTS_HEADER_PROBE_BYTES - 1;
        let bytes = await this._fetchRange(url, 0, probeEnd, signal, onBytes);
        let manifest = this.parseManifest(bytes, url);
        if (manifest.needBytes) {
            bytes = await this._fetchRange(url, 0, manifest.needBytes - 1, signal, onBytes);
            manifest = this.parseManifest(bytes, url);
        }
        const last = manifest.chunks.at(-1);
        const total = this.fileSizes.get(url);
        if (total != null && (!last || last.offset + last.compressedSize !== total)) {
            throw new Error(`Point-cloud index does not match file length: ${url}`);
        }
        return manifest;
    }

    async fetchChunk(state, index, signal, onBytes) {
        const chunk = state.manifest.chunks[index];
        const cached = await this.store.get(state.url, index, chunk.compressedSize);
        if (cached) {
            state.cachedBytes += cached.byteLength;
            return { bytes: cached, fromCache: true };
        }
        const cachedFull = this._sliceFullFile(
            state.url,
            chunk.offset,
            chunk.offset + chunk.compressedSize - 1
        );
        if (cachedFull) {
            state.cachedBytes += cachedFull.byteLength;
            await this.store.put(state.url, index, cachedFull);
            return { bytes: cachedFull, fromCache: true };
        }

        const partial = state.partialChunks.get(index) || { parts: [], length: 0 };
        let parts = partial.parts.slice();
        let length = partial.length;
        if (length > 0) state.partialResumeBytes += length;
        if (length >= chunk.compressedSize) {
            const bytes = concatUint8(parts, length);
            state.partialChunks.delete(index);
            await this.store.put(state.url, index, bytes);
            return { bytes, fromCache: false };
        }

        const start = chunk.offset + length;
        const end = chunk.offset + chunk.compressedSize - 1;
        const resp = await fetch(state.url, {
            signal,
            priority: 'high',
            headers: { Range: `bytes=${start}-${end}` },
        });
        if (resp.status === 200 && this.allowFullFile) {
            const full = this._rememberFullFile(state.url, new Uint8Array(await resp.arrayBuffer()));
            state.networkBytes += full.byteLength;
            if (onBytes) onBytes(full.byteLength);
            const bytes = this._sliceFullFile(state.url, chunk.offset, chunk.offset + chunk.compressedSize - 1);
            if (!bytes) throw new Error(`Full response too small for chunk ${index}: ${state.url}`);
            state.partialChunks.delete(index);
            await this.store.put(state.url, index, bytes);
            return { bytes, fromCache: false };
        }
        await this._validateRangeResponse(resp, start, end, state.url);
        if (!resp.body) {
            const bytes = new Uint8Array(await resp.arrayBuffer());
            parts.push(bytes);
            length += bytes.byteLength;
            state.networkBytes += bytes.byteLength;
            if (onBytes) onBytes(bytes.byteLength);
        } else {
            const reader = resp.body.getReader();
            const abortReader = () => reader.cancel().catch(() => {});
            if (signal) signal.addEventListener('abort', abortReader, { once: true });
            try {
                while (length < chunk.compressedSize) {
                    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
                    const { done, value } = await reader.read();
                    if (done) break;
                    parts.push(value);
                    length += value.byteLength;
                    state.networkBytes += value.byteLength;
                    state.partialChunks.set(index, { parts, length });
                    if (onBytes) onBytes(value.byteLength);
                }
            } finally {
                if (signal) signal.removeEventListener('abort', abortReader);
            }
        }

        if (length !== chunk.compressedSize) {
            if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
            state.partialChunks.delete(index);
            throw new Error(`Incomplete point-cloud chunk ${index}: ${state.url}`);
        }
        const bytes = concatUint8(parts, length);
        state.partialChunks.delete(index);
        await this.store.put(state.url, index, bytes);
        return { bytes, fromCache: false };
    }
}

async function decompressGzipBytes(bytes) {
    if (!('DecompressionStream' in window)) {
        throw new Error('This browser lacks DecompressionStream support for .pnts chunks');
    }
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
}


// ========================================
// PNT v4 parser + helpers
// ========================================
function parsePntV4Header(buffer, offset = 0) {
    const view = new DataView(buffer, offset, 44);
    const magic =
        String.fromCharCode(view.getUint8(0)) +
        String.fromCharCode(view.getUint8(1)) +
        String.fromCharCode(view.getUint8(2)) +
        String.fromCharCode(view.getUint8(3));
    if (magic !== 'UNP4') {
        throw new Error(`Not a UNP4 file (got "${magic}") — refresh to clear old cache?`);
    }
    const version    = view.getUint32(4,  true);
    const count      = view.getUint32(8,  true);
    const blockSize  = view.getUint32(12, true);
    const numBlocks  = view.getUint32(16, true);
    const minX = view.getFloat32(20, true);
    const minY = view.getFloat32(24, true);
    const minZ = view.getFloat32(28, true);
    const sx   = view.getFloat32(32, true);
    const sy   = view.getFloat32(36, true);
    const sz   = view.getFloat32(40, true);
    return {
        magic, version, count, blockSize, numBlocks,
        min:   [minX, minY, minZ],
        scale: [sx, sy, sz],
    };
}

// Derive the scene's centre-at-origin transform directly from the file
// header.  The header's (min, scale) pair describes the exact quantised
// bbox of the *full* cloud, so we know the centre and bounding-sphere
// radius the moment 44 bytes arrive — no need to sample any points,
// no "sampling error" as more blocks land.
function computeXformFromHeader(header, cfg) {
    const [mx, my, mz] = header.min;
    const [sx, sy, sz] = header.scale;
    const HALF = 32767.5;                // midpoint of the uint16 grid
    const cx = mx + HALF * sx;
    const cy = my + HALF * sy;
    const cz = mz + HALF * sz;
    const hx = HALF * sx;
    const hy = HALF * sy;
    const hz = HALF * sz;
    const radius = Math.sqrt(hx * hx + hy * hy + hz * hz) || 1;
    return { cx, cy, cz, flipY: !!cfg.flipY, radius };
}

// Translate (+ optional flipY, + unconditional flipX) a contiguous slice
// of `positions` in-place.  Algebraic identity: `(-x - (-cx_raw))` ==
// `-(x - cx_raw)`, so we can translate first (all axes) then flip the
// signs, and still end up with the same layout as "flip first, then
// centre on the flipped axis".
//
// The X negation is applied unconditionally because every reconstructed
// cloud comes out horizontally mirrored relative to its reference video
// under this pipeline's coordinate convention; flipping X after centring
// corrects that once for every scene.
function applyTransform(positions, start, count, xform) {
    const { cx, cy, cz, flipY } = xform;
    const end = start + count;
    for (let i = start; i < end; i++) {
        const k = i * 3;
        positions[k]     = -(positions[k]     - cx);
        positions[k + 1] -=   cy;
        positions[k + 2] -=   cz;
    }
    if (flipY) {
        for (let i = start; i < end; i++) {
            positions[i * 3 + 1] = -positions[i * 3 + 1];
        }
    }
}

// Decode one block (byte-plane SoA) into preallocated Float32 position
// + Uint8 colour slots.  `bytes` is the grow-doubling scratch Uint8Array
// the loader reads into; `byteOffset` is where the block starts in that
// buffer; `writeOffset` is the *point index* where the block's points
// should land in the geometry.
function decodeBlock(bytes, byteOffset, n, positions, colors, writeOffset, header) {
    const base = bytes.byteOffset + byteOffset;
    const buf = bytes.buffer;
    const [mx, my, mz] = header.min;
    const [sx, sy, sz] = header.scale;

    const xLo = new Uint8Array(buf, base,             n);
    const xHi = new Uint8Array(buf, base + n,         n);
    const yLo = new Uint8Array(buf, base + n * 2,     n);
    const yHi = new Uint8Array(buf, base + n * 3,     n);
    const zLo = new Uint8Array(buf, base + n * 4,     n);
    const zHi = new Uint8Array(buf, base + n * 5,     n);
    const r   = new Uint8Array(buf, base + n * 6,     n);
    const g   = new Uint8Array(buf, base + n * 7,     n);
    const b   = new Uint8Array(buf, base + n * 8,     n);

    // Tight SoA dequant loop — ~8 ms per million points on M1.
    const posBase = writeOffset * 3;
    const colBase = writeOffset * 3;
    for (let i = 0; i < n; i++) {
        const qx = xLo[i] | (xHi[i] << 8);
        const qy = yLo[i] | (yHi[i] << 8);
        const qz = zLo[i] | (zHi[i] << 8);
        const k = i * 3;
        positions[posBase + k]     = mx + qx * sx;
        positions[posBase + k + 1] = my + qy * sy;
        positions[posBase + k + 2] = mz + qz * sz;
        colors[colBase + k]     = r[i];
        colors[colBase + k + 1] = g[i];
        colors[colBase + k + 2] = b[i];
    }
}


// ========================================
// Point cloud viewer
// ========================================
class PointCloudViewer {
    constructor(canvas, messageEl, loader) {
        this.canvas = canvas;
        this.messageEl = messageEl;
        this.container = canvas.parentElement;
        this.loader = loader;
        this.fullDetail = !LIGHT_DEVICE;
        this.detailBtn = document.getElementById('detail-btn');
        if (this.detailBtn) this.detailBtn.addEventListener('click', () => this.loadAllPoints());
        this.pointCloud = null;
        this.activeKey = null;
        this.activeQuality = 'idle';
        this.activeUrl = null;
        this.activeAbort = null;
        this.activeLoadId = 0;
        this.sceneStates = new Map();
        this.currentState = null;
        this._pendingFlushRaf = null;
        this._interactionBudgetTimer = null;
        this._loadingBudget = false;
        this._interactionBudget = false;
        this._baseSamplingRate = 1;
        this._loadedPoints = 0;
        this._contextLost = false;

        // Measurement state
        this.measureMode = false;
        this.measurePoints = [];
        this.raycaster = new THREE.Raycaster();
        this.raycaster.params.Points.threshold = 0.1;  // reset per scene at load
        this.mouse = new THREE.Vector2();

        this.init();
        this.initMeasureUI();
        window.addEventListener('resize', () => this.onResize());
    }

    init() {
        const width = this.container.clientWidth;
        const height = this.container.clientHeight;

        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0xffffff);

        this.camera = new THREE.PerspectiveCamera(55, width / height, 0.01, 2000);
        this.camera.position.set(2, 1.5, 2);

        this.renderer = new THREE.WebGLRenderer({
            canvas: this.canvas,
            antialias: false,
            powerPreference: 'low-power'
        });
        this.renderer.setSize(width, height);
        this.renderer.setPixelRatio(1);

        this.controls = new THREE.OrbitControls(this.camera, this.canvas);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.08;
        this.controls.minDistance = 0.05;
        this.controls.maxDistance = 1000;
        // Orbiting the camera is disabled: dragging rotates the point
        // cloud itself (see _installRotateDrag), so the X/Y/Z rotation
        // values shown in the controls panel always match the on-screen
        // orientation.  Zoom (wheel) and pan (right-click) stay on
        // OrbitControls since they don't affect that invariant.
        this.controls.enableRotate = false;
        this.controls.addEventListener('start', () => this._beginInteractionBudget());
        this.controls.addEventListener('end', () => this._endInteractionBudgetSoon());
        this.canvas.addEventListener('wheel', () => this._markInteractionActive(), { passive: true });

        // Callback invoked whenever drag-rotation updates the cloud's
        // orientation; ViewerControls wires this up to keep its sliders
        // in sync.  Signature: ({x, y, z}) in degrees, each wrapped to
        // [-180, 180] and rounded to match the slider step.
        this.onRotationChanged = null;

        // Current scene's effective config — mutated by the controls panel.
        this._effective = null;
        this._totalPoints = 0;

        this._installRotateDrag();
        this._installRenderVisibilityGate();
        this._installContextHandlers();
    }

    _installContextHandlers() {
        this.canvas.addEventListener('webglcontextlost', (event) => {
            event.preventDefault();
            this._contextLost = true;
            this._cancelPendingFlush();
            this._abortAllStreams();
            if (this._rafId) {
                cancelAnimationFrame(this._rafId);
                this._rafId = null;
            }
            this.setMessage('WebGL context lost. Reload the page or reselect a scene to recover.');
            this._updatePerf({
                webglContextLost: true,
                loading: false,
                status: 'webgl-context-lost',
                lastError: 'WebGL context lost',
            });
        }, false);

        this.canvas.addEventListener('webglcontextrestored', () => {
            this._contextLost = false;
            for (const state of this.sceneStates.values()) {
                state.pointCloud = null;
                state.geometry = null;
                state.uploadRaf = null;
                state.uploadDirtyStart = Infinity;
                state.uploadDirtyEnd = -Infinity;
            }
            this.pointCloud = null;
            this.setMessage('WebGL context restored. Reselect the scene to continue.');
            this._updatePerf({
                webglContextLost: false,
                status: 'webgl-context-restored',
                livePointClouds: 0,
            });
            this._syncRenderLoop();
        }, false);
    }

    // Custom drag-to-rotate: left-button drag over the canvas rotates
    // the point cloud directly, so the effective orientation is always
    // reflected back in the Pitch/Yaw/Roll sliders without a quaternion
    // round-trip.  Horizontal drag adds to the Y (yaw) angle, vertical
    // drag adds to the X (pitch) angle; Z (roll) is only touchable via
    // the slider.  Euler angles compose in the object's local frame,
    // which matches how setRotation() from the sliders drives the scene
    // so the two controls stay in exact lockstep.
    _installRotateDrag() {
        let dragging = false;
        let pid = null;
        let lastX = 0, lastY = 0;
        let startX = 0, startY = 0;
        let moved = false;
        const THRESH = 5; // px before drag becomes a rotation

        const d2r = Math.PI / 180;
        const r2d = 180 / Math.PI;
        const wrap = (deg) => Math.round(((deg + 180) % 360 + 360) % 360 - 180);

        this.canvas.addEventListener('pointerdown', (e) => {
            if (e.button !== 0) return;          // left / primary only
            if (!this.pointCloud) return;
            dragging = true;
            pid = e.pointerId;
            startX = lastX = e.clientX;
            startY = lastY = e.clientY;
            moved = false;
            this._beginInteractionBudget();
            try { this.canvas.setPointerCapture(pid); } catch {}
        });

        this.canvas.addEventListener('pointermove', (e) => {
            if (!dragging || e.pointerId !== pid || !this.pointCloud) return;
            if (!moved) {
                if (Math.hypot(e.clientX - startX, e.clientY - startY) < THRESH) return;
                moved = true;
            }
            const dx = e.clientX - lastX;
            const dy = e.clientY - lastY;
            lastX = e.clientX;
            lastY = e.clientY;
            this._markInteractionActive();

            const rect = this.canvas.getBoundingClientRect();
            // Full-width drag ≈ one full yaw turn; full-height ≈ one
            // pitch turn.  Matches OrbitControls' default sensitivity
            // closely enough that the interaction feels identical.
            //
            // Pitch sign: the baked cameras all sit at -Z looking at the
            // origin, so a positive world-X rotation tilts the cloud's
            // top AWAY from the viewer — the opposite of the standard
            // "drag down ⇒ see more of the top" convention used by
            // OrbitControls.  Negate dy so the drag direction matches
            // what the user expects.  Yaw already matches because the
            // rotation axis and angular direction in world space are
            // unchanged by applyTransform's X mirror, so a positive
            // world-Y rotation still reads as "scene rotated right" on
            // screen.
            const yawDeg   =  (dx / rect.width)  * 360;
            const pitchDeg = -(dy / rect.height) * 360;

            const rot = this.pointCloud.rotation;
            rot.y += yawDeg   * d2r;
            rot.x += pitchDeg * d2r;

            if (this.onRotationChanged) {
                this.onRotationChanged({
                    x: wrap(rot.x * r2d),
                    y: wrap(rot.y * r2d),
                    z: wrap(rot.z * r2d)
                });
            }
        });

        const end = (e) => {
            if (!dragging || e.pointerId !== pid) return;
            dragging = false;
            this._endInteractionBudgetSoon();
            try { this.canvas.releasePointerCapture(pid); } catch {}
            pid = null;
        };
        this.canvas.addEventListener('pointerup', end);
        this.canvas.addEventListener('pointercancel', end);
    }

    initMeasureUI() {
        this.measureBtn = document.getElementById('measure-btn');
        this.measureHintEl = document.getElementById('measure-hint');
        const panel = this.canvas.parentElement;
        this.measureSvg = panel.querySelector('.measure-overlay');
        this.measureTag = panel.querySelector('.measure-tag');
        if (this.measureBtn) {
            this.measureBtn.addEventListener('click', () => this.toggleMeasureMode());
        }
        document.addEventListener('keydown', e => {
            if (e.key === 'Escape' && this.measureMode) this.toggleMeasureMode();
        });
        let downAt = null;
        this.canvas.addEventListener('pointerdown', e => {
            downAt = { x: e.clientX, y: e.clientY };
        });
        this.canvas.addEventListener('pointerup', e => {
            if (!downAt) return;
            const dx = e.clientX - downAt.x;
            const dy = e.clientY - downAt.y;
            downAt = null;
            if (Math.hypot(dx, dy) > 5) return; // was a drag, ignore
            this.onCanvasClick(e);
        });
    }

    // Status line inside the viewer: what to click next, then the result.
    _setMeasureStatus(html) {
        const el = this.measureHintEl;
        if (!el) return;
        el.hidden = !this.measureMode;
        el.innerHTML = html;
    }

    toggleMeasureMode() {
        this.measureMode = !this.measureMode;
        if (this.measureBtn) {
            this.measureBtn.classList.toggle('active', this.measureMode);
            this.measureBtn.setAttribute('aria-pressed', String(this.measureMode));
            this.measureBtn.title = this.measureMode
                ? 'Stop measuring (Esc)'
                : 'Measure the distance between two points';
        }
        this.clearMeasurement();
        this.canvas.style.cursor = this.measureMode ? 'crosshair' : '';
    }

    onCanvasClick(event) {
        if (!this.measureMode || !this.pointCloud) return;
        const rect = this.canvas.getBoundingClientRect();
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        // Force matrices up-to-date before raycasting: the drag handler
        // mutates pointCloud.rotation outside the render loop, and a click
        // can land between frames (before renderer.render() refreshes
        // matrixWorld).  Without this the raycaster silently samples a
        // stale transform and misses every point.
        this.camera.updateMatrixWorld();
        this.pointCloud.updateMatrixWorld();
        // Widen the raycast threshold for the click path so aim-precision
        // doesn't have to match the rendered pixel size.  The render-side
        // threshold stays at pointSize × 1.5 (set in _installGeometry /
        // setPointSize).  ~1% of the scene radius gives the user a few
        // CSS pixels of click slack on every scene scale.
        const prevThreshold = this.raycaster.params.Points.threshold;
        this.raycaster.params.Points.threshold = Math.max(
            prevThreshold, (this._sceneRadius || 1) * 0.01
        );
        this.raycaster.setFromCamera(this.mouse, this.camera);
        const hits = this.raycaster.intersectObject(this.pointCloud);
        this.raycaster.params.Points.threshold = prevThreshold;
        // Raycaster returns the hit in world space. Convert to the point
        // cloud's local frame so the measurement tracks the cloud when it
        // rotates.
        if (hits.length > 0) {
            const local = this.pointCloud.worldToLocal(hits[0].point.clone());
            this.addMeasurePoint(local);
        } else {
            this._setMeasureStatus(this.measurePoints.length === 1
                ? 'No point there. Click a second point on the cloud'
                : 'No point there. Click a point on the cloud');
        }
    }

    addMeasurePoint(point) {
        if (this.measurePoints.length >= 2) this.clearMeasurement();
        this.measurePoints.push(point);
        if (this.measurePoints.length === 2) {
            const d = this.measurePoints[0].distanceTo(this.measurePoints[1]);
            this._measureText = `${d >= 10 ? d.toFixed(1) : d.toFixed(2)} m`;
            if (this.measureTag) this.measureTag.textContent = this._measureText;
            this._setMeasureStatus(`<strong>${this._measureText}</strong><span>Click again to start over</span>`);
        } else {
            this._setMeasureStatus('Click a second point');
        }
        this._updateMeasureOverlay();
    }

    clearMeasurement() {
        this.measurePoints = [];
        this._measureText = '';
        this._setMeasureStatus('Click a point on the cloud');
        this._updateMeasureOverlay();
    }

    // Draw the measurement as a 2D overlay projected from the cloud every
    // frame, so dots, line and label keep one size on screen at any zoom.
    _updateMeasureOverlay() {
        const svg = this.measureSvg;
        if (!svg) return;
        const pts = this.measurePoints;
        const circles = svg.querySelectorAll('.mo-pt');
        const lines = svg.querySelectorAll('line');
        const W = this.canvas.clientWidth;
        const H = this.canvas.clientHeight;
        const scr = pts.map(p => {
            if (!this.pointCloud || !this.camera) return null;
            const v = this.pointCloud.localToWorld(p.clone()).project(this.camera);
            if (v.z > 1 || v.z < -1) return null;
            return [(v.x + 1) / 2 * W, (1 - v.y) / 2 * H];
        });
        circles.forEach((c, i) => {
            const s = scr[i];
            c.style.display = s ? '' : 'none';
            if (s) { c.setAttribute('cx', s[0].toFixed(1)); c.setAttribute('cy', s[1].toFixed(1)); }
        });
        const both = scr.length === 2 && scr[0] && scr[1];
        lines.forEach(l => {
            l.style.display = both ? '' : 'none';
            if (both) {
                l.setAttribute('x1', scr[0][0].toFixed(1)); l.setAttribute('y1', scr[0][1].toFixed(1));
                l.setAttribute('x2', scr[1][0].toFixed(1)); l.setAttribute('y2', scr[1][1].toFixed(1));
            }
        });
        if (this.measureTag) {
            this.measureTag.hidden = !both;
            if (both) {
                const x = (scr[0][0] + scr[1][0]) / 2;
                const y = (scr[0][1] + scr[1][1]) / 2;
                this.measureTag.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -150%)`;
            }
        }
    }

    _updatePerf(partial) {
        Object.assign(window.__UNIT_DEMO_PERF, partial);
    }

    _effectiveConfigSummary(cfg) {
        if (!cfg) return null;
        return {
            pointSize: cfg.pointSize,
            samplingRate: cfg.samplingRate,
            brightness: cfg.brightness,
            background: cfg.background,
            camera: cfg.camera ? { ...cfg.camera } : null,
            rotation: cfg.rotation ? { ...cfg.rotation } : null,
        };
    }

    _decodedBytesForState(state) {
        if (!state?.positions || !state?.colors) return 0;
        return state.positions.byteLength + state.colors.byteLength;
    }

    _refreshResourceCounters(extra = {}) {
        let decodedBytes = 0;
        let gpuBytes = 0;
        let livePointClouds = 0;
        for (const state of this.sceneStates.values()) {
            decodedBytes += this._decodedBytesForState(state);
            if (state.pointCloud) {
                gpuBytes += this._decodedBytesForState(state);
                if (state.pointCloud.parent === this.scene) livePointClouds += 1;
            }
        }
        this._updatePerf({
            decodedBytes,
            gpuBytes,
            livePointClouds,
            ...extra,
        });
        if (this.loader?.estimateCacheBytes) {
            this.loader.estimateCacheBytes().then(cacheBytes => {
                this._updatePerf({ cacheBytes });
            }).catch(() => {});
        }
    }

    _visiblePointCap() {
        const total = this._totalPoints || 0;
        const loaded = this._loadedPoints || 0;
        if (!total || !loaded) return 0;
        let factor = this._baseSamplingRate;
        if (this._interactionBudget) factor *= INTERACTION_POINT_BUDGET_FACTOR;
        const cap = Math.max(1, Math.floor(total * Math.max(0, Math.min(1, factor))));
        return Math.min(loaded, cap);
    }

    _applyDrawBudget() {
        if (!this.pointCloud) return;
        const visible = this._visiblePointCap();
        this.pointCloud.geometry.setDrawRange(0, visible);
        this._updatePerf({
            visiblePoints: visible,
            loadedPoints: this._loadedPoints,
            totalPoints: this._totalPoints,
            loading: this._loadingBudget,
        });
    }

    _beginInteractionBudget() {
        if (!this.pointCloud) return;
        if (this._interactionBudgetTimer) clearTimeout(this._interactionBudgetTimer);
        if (!this._interactionBudget) {
            this._interactionBudget = true;
            this._applyDrawBudget();
        }
    }

    _endInteractionBudgetSoon(delay = INTERACTION_BUDGET_SETTLE_MS) {
        if (this._interactionBudgetTimer) clearTimeout(this._interactionBudgetTimer);
        this._interactionBudgetTimer = setTimeout(() => {
            this._interactionBudget = false;
            this._applyDrawBudget();
        }, delay);
    }

    _markInteractionActive() {
        this._beginInteractionBudget();
        this._endInteractionBudgetSoon();
    }

    _cancelPendingFlush() {
        if (this._pendingFlushRaf) {
            cancelAnimationFrame(this._pendingFlushRaf);
            this._pendingFlushRaf = null;
        }
    }

    _cancelStateUpload(state) {
        if (!state) return;
        if (state.uploadRaf) {
            cancelAnimationFrame(state.uploadRaf);
            state.uploadRaf = null;
        }
        state.uploadDirtyStart = Infinity;
        state.uploadDirtyEnd = -Infinity;
        state.uploadQueueLength = 0;
    }

    _captureViewState() {
        if (!this.pointCloud) return null;
        return {
            cameraPosition: this.camera.position.clone(),
            controlsTarget: this.controls.target.clone(),
            rotation: this.pointCloud.rotation.clone(),
        };
    }

    _restoreViewState(state) {
        if (!state || !this.pointCloud) return;
        this.camera.position.copy(state.cameraPosition);
        this.controls.target.copy(state.controlsTarget);
        this.pointCloud.rotation.copy(state.rotation);
        this.controls.update();
    }

    setMessage(text) {
        if (!this.messageEl) return;
        this.messageEl.textContent = text;
        this.messageEl.style.display = text ? 'flex' : 'none';
        this.messageEl.style.opacity = text ? '1' : '0';
    }

    clearCloud() {
        this.clearMeasurement();
        this._cancelPendingFlush();
        if (this.pointCloud) {
            this.scene.remove(this.pointCloud);
            this.pointCloud.geometry.dispose();
            this.pointCloud.material.dispose();
            this.pointCloud = null;
        }
        this._loadedPoints = 0;
        this._totalPoints = 0;
        this._refreshResourceCounters({
            visiblePoints: 0,
            loadedPoints: 0,
            totalPoints: 0,
        });
    }

    showPreview(key, cfg) {
        return this.showFull(key, cfg);
    }

    showFull(key, cfg) {
        return this._activateState(key, cfg);
    }

    _getState(key, cfg) {
        let state = this.sceneStates.get(key);
        if (!state) {
            state = {
                key,
                cfg,
                url: cfg.cloud,
                manifest: null,
                positions: null,
                colors: null,
                xform: null,
                geometry: null,
                pointCloud: null,
                loadedChunks: null,
                loadedChunkCount: 0,
                contiguousChunks: 0,
                loadedPoints: 0,
                visiblePoints: 0,
                revealed: false,
                abort: null,
                loadPromise: null,
                loadId: 0,
                status: 'idle',
                partialChunks: new Map(),
                fetchInFlight: 0,
                decodeQueueLength: 0,
                uploadRaf: null,
                uploadDirtyStart: Infinity,
                uploadDirtyEnd: -Infinity,
                uploadQueueLength: 0,
                dirtyUploadRanges: 0,
                networkBytes: 0,
                cachedBytes: 0,
                partialResumeBytes: 0,
                redownloadedChunks: 0,
                view: null,
                lastActive: 0,
            };
            this.sceneStates.set(key, state);
        }
        state.cfg = cfg;
        state.url = cfg.cloud;
        return state;
    }

    _captureStateView(state) {
        if (!state || !state.pointCloud || this.pointCloud !== state.pointCloud) return;
        state.view = this._captureViewState();
    }

    _abortStateStream(state) {
        if (!state?.abort || state.abort.signal.aborted) return;
        state.abort.abort();
        if (state.status === 'loading' || state.status === 'streaming') {
            state.status = 'aborted';
            this._updatePerf({ abortedLoads: window.__UNIT_DEMO_PERF.abortedLoads + 1 });
        }
    }

    _abortAllStreams() {
        for (const state of this.sceneStates.values()) {
            this._abortStateStream(state);
            this._cancelStateUpload(state);
        }
    }

    _disposeStateGpu(state) {
        if (!state?.pointCloud) return;
        this._cancelStateUpload(state);
        state.pointCloud.parent?.remove(state.pointCloud);
        state.pointCloud.geometry?.dispose();
        state.pointCloud.material?.dispose();
        state.pointCloud = null;
        state.geometry = null;
        if (this.pointCloud && this.currentState === state) this.pointCloud = null;
    }

    _detachCurrentState(nextKey) {
        const state = this.currentState;
        if (!state || state.key === nextKey) return;
        this._captureStateView(state);
        this._abortStateStream(state);
        this._disposeStateGpu(state);
        this.pointCloud = null;
        this.currentState = null;
        this.clearMeasurement();
        this._refreshResourceCounters();
    }

    async _activateState(key, cfg) {
        if (!cfg?.cloud) return;
        if (this._contextLost) {
            this.setMessage('WebGL context is recovering. Reselect the scene in a moment.');
            this._updatePerf({
                activeScene: key,
                status: 'webgl-context-lost',
                lastError: 'WebGL context lost',
                effectiveConfig: this._effectiveConfigSummary(cfg),
            });
            return;
        }
        this._detachCurrentState(key);
        const state = this._getState(key, cfg);
        const alreadyAttached = this.currentState === state
            && this.pointCloud === state.pointCloud
            && !!state.pointCloud;
        state.lastActive = Date.now();

        this.currentState = state;
        this.activeKey = key;
        this.activeQuality = state.status === 'ready' ? 'full' : 'loading-full';
        this.activeUrl = state.url;
        this._baseSamplingRate = Math.max(0, Math.min(1, cfg.samplingRate != null ? cfg.samplingRate : 1));
        this._loadingBudget = false;
        this._interactionBudget = false;

        if (alreadyAttached) {
            this._startOrResumeState(state);
            this._refreshResourceCounters({
                effectiveConfig: this._effectiveConfigSummary(cfg),
            });
            return;
        }

        if (!state.pointCloud && state.manifest && state.positions && state.colors) {
            this._ensureStateGeometry(state);
            this._queueUploadRange(state, 0, state.loadedPoints || 0);
        }

        if (state.pointCloud) {
            this.pointCloud = state.pointCloud;
            if (state.pointCloud.parent !== this.scene) this.scene.add(state.pointCloud);
            this._totalPoints = state.capacity || state.manifest?.count || state.loadedPoints || 0;
            this._loadedPoints = state.loadedPoints || 0;
            this.setPointSize(cfg.pointSize);
            if (cfg.brightness != null) this.setBrightness(cfg.brightness);
            if (cfg.background) this.setBackground(cfg.background);
            if (state.view) this._restoreViewState(state.view);
            this._commitStateProgress(state);
        } else {
            this.setMessage('Loading…');
        }

        this._startOrResumeState(state);
        this._trimInactiveStates();
        this._refreshResourceCounters({
            effectiveConfig: this._effectiveConfigSummary(cfg),
        });
    }

    _ensureStateGeometry(state) {
        if (state.pointCloud || !state.manifest) return;
        const header = {
            count: state.manifest.count,
            blockSize: state.manifest.blockSize,
            numBlocks: Math.ceil(state.manifest.count / state.manifest.blockSize),
            min: state.manifest.min,
            scale: state.manifest.scale,
        };
        // Arrays hold only the points this device streams; they grow (keeping
        // what is decoded) when the user asks for every point.
        const capacity = this._capacityPoints(state);
        state.capacity = capacity;
        const grow = (arr, Type) => {
            if (arr && arr.length >= capacity * 3) return arr;
            const next = new Type(capacity * 3);
            if (arr) next.set(arr.subarray(0, Math.min(arr.length, next.length)));
            return next;
        };
        state.positions = grow(state.positions, Float32Array);
        state.colors = grow(state.colors, Uint8Array);
        if (!state.loadedChunks || state.loadedChunks.length !== state.manifest.chunkCount) {
            state.loadedChunks = new Uint8Array(state.manifest.chunkCount);
            state.loadedChunkCount = 0;
            state.contiguousChunks = 0;
            state.loadedPoints = 0;
            state.visiblePoints = 0;
            state.revealed = false;
        }
        state.xform = computeXformFromHeader(header, state.cfg);
        this._cancelPendingFlush();
        state.geometry = this._installGeometry(
            state.positions, state.colors, capacity, 0, state.cfg, state.xform.radius
        );
        state.pointCloud = this.pointCloud;
        state.pointCloud.visible = !!state.revealed;
        this._totalPoints = capacity;
        this._loadedPoints = state.loadedPoints || 0;
        if (state.view) this._restoreViewState(state.view);
    }

    _startOrResumeState(state) {
        if (state.status === 'ready' && (state.loadedLimit ?? Infinity) >= this._chunkLimit(state)) {
            this.setMessage('');
            this._updatePerf({ loading: false, status: 'ready' });
            return;
        }
        if (state.loadPromise && !state.abort?.signal.aborted) return state.loadPromise;

        this._baseSamplingRate = Math.max(0, Math.min(1, state.cfg.samplingRate != null ? state.cfg.samplingRate : 1));
        this._interactionBudget = false;
        const abort = new AbortController();
        state.abort = abort;
        const loadId = ++state.loadId;
        this.activeAbort = abort;
        this.activeLoadId += 1;
        state.status = state.manifest ? 'streaming' : 'loading';

        this._updatePerf({
            activeScene: state.key,
            activeLoadId: this.activeLoadId,
            activeUrl: state.url,
            loading: true,
            status: state.status,
            visiblePoints: state.visiblePoints || 0,
            loadedPoints: state.loadedPoints || 0,
            totalPoints: state.manifest?.count || 0,
            loadedChunkCount: state.loadedChunkCount || 0,
            totalChunkCount: state.manifest?.chunkCount || 0,
            livePointClouds: this.pointCloud ? 1 : 0,
            networkBytes: state.networkBytes,
            cachedBytes: state.cachedBytes,
            partialResumeBytes: state.partialResumeBytes,
            redownloadedChunks: state.redownloadedChunks,
            inflightFetches: state.fetchInFlight || 0,
            decodeQueueLength: state.decodeQueueLength || 0,
            uploadQueueLength: state.uploadQueueLength || 0,
            dirtyUploadRanges: state.dirtyUploadRanges || 0,
            effectiveConfig: this._effectiveConfigSummary(state.cfg),
            lastError: null,
        });
        state.loadPromise = this._streamState(state, loadId, abort)
            .finally(() => {
                if (state.loadId === loadId) {
                    state.loadPromise = null;
                    state.abort = null;
                    if (this.currentState === state) this.activeAbort = null;
                }
            });
        return state.loadPromise;
    }

    async _streamState(state, loadId, abort) {
        const isStale = () => abort.signal.aborted || state.loadId !== loadId;
        try {
            if (!state.manifest) {
                this.setMessage('Loading…');
                state.manifest = await this.loader.loadManifest(state.url, abort.signal, (n) => {
                    state.networkBytes += n;
                });
                if (isStale()) return;
                this._ensureStateGeometry(state);
                this._updatePerf({
                    totalPoints: state.manifest.count,
                    totalChunkCount: state.manifest.chunkCount,
                    livePointClouds: this.currentState === state && this.pointCloud ? 1 : 0,
                });
            } else {
                this._ensureStateGeometry(state);
            }

            state.status = 'streaming';
            this._commitStateProgress(state);

            let nextToSchedule = 0;
            const chunkLimit = this._chunkLimit(state);
            const activeFetches = new Map();
            const decodeQueue = [];
            const schedule = () => {
                while (activeFetches.size < CHUNK_FETCH_WINDOW && nextToSchedule < chunkLimit) {
                    const idx = nextToSchedule++;
                    if (state.loadedChunks[idx]) continue;
                    const task = this._fetchChunkForState(state, idx, abort.signal)
                        .then(result => {
                            if (result && !isStale()) decodeQueue.push(result);
                            state.decodeQueueLength = decodeQueue.length;
                            return idx;
                        })
                        .finally(() => {
                            activeFetches.delete(idx);
                            state.fetchInFlight = activeFetches.size;
                            if (this.currentState === state) {
                                this._updatePerf({
                                    inflightFetches: state.fetchInFlight,
                                    decodeQueueLength: state.decodeQueueLength,
                                });
                            }
                        });
                    activeFetches.set(idx, task);
                    state.fetchInFlight = activeFetches.size;
                }
                if (this.currentState === state) {
                    this._updatePerf({
                        inflightFetches: state.fetchInFlight,
                        decodeQueueLength: state.decodeQueueLength,
                    });
                }
            };

            while (!isStale()) {
                schedule();
                if (decodeQueue.length) {
                    const item = decodeQueue.shift();
                    state.decodeQueueLength = decodeQueue.length;
                    await this._decodeFetchedChunk(state, item.index, item.bytes, abort.signal);
                    await nextFrame();
                    continue;
                }
                if (!activeFetches.size) break;
                await Promise.race(activeFetches.values());
            }
            if (isStale()) return;
            if (state.uploadRaf) await nextFrame();

            state.status = 'ready';
            state.loadedLimit = chunkLimit;
            state.revealed = true;
            state.fetchInFlight = 0;
            state.decodeQueueLength = 0;
            this.activeQuality = 'full';
            this.setMessage('');
            this._commitStateProgress(state);
            this.loader.releaseFullFile?.(state.url);
            this._updatePerf({
                loading: false,
                status: 'ready',
                inflightFetches: 0,
                decodeQueueLength: 0,
                uploadQueueLength: state.uploadQueueLength || 0,
                completedLoads: window.__UNIT_DEMO_PERF.completedLoads + 1,
            });
            if (this.loader?.estimateCacheBytes) {
                this.loader.estimateCacheBytes(0).then(cacheBytes => {
                    this._updatePerf({ cacheBytes });
                }).catch(() => {});
            }
            if (this.onSceneReady && this.currentState === state) {
                this.onSceneReady(state.key, state.cfg);
            }
        } catch (err) {
            if (err.name === 'AbortError' || abort.signal.aborted) {
                if (state.status === 'loading' || state.status === 'streaming') state.status = 'aborted';
                state.fetchInFlight = 0;
                state.decodeQueueLength = 0;
                if (this.currentState === state) {
                    this._updatePerf({
                        loading: false,
                        status: 'aborted',
                        inflightFetches: 0,
                        decodeQueueLength: 0,
                    });
                }
                return;
            }
            console.error('Error loading point cloud:', err);
            state.status = 'error';
            state.fetchInFlight = 0;
            state.decodeQueueLength = 0;
            if (this.currentState === state) {
                this.setMessage('Failed to load point cloud');
                this._updatePerf({
                    loading: false,
                    status: 'error',
                    inflightFetches: 0,
                    decodeQueueLength: 0,
                    lastError: err.message || String(err),
                });
            }
        }
    }

    async _fetchChunkForState(state, index, signal) {
        if (state.loadedChunks[index]) return;
        const { bytes } = await this.loader.fetchChunk(state, index, signal);
        return { index, bytes };
    }

    async _decodeFetchedChunk(state, index, bytes, signal) {
        if (signal?.aborted || state.loadedChunks[index]) return;
        if (this._contextLost) throw new DOMException('Aborted', 'AbortError');
        const raw = await decompressGzipBytes(bytes);
        if (signal?.aborted || state.loadedChunks[index]) return;
        await nextFrame();
        if (signal?.aborted || state.loadedChunks[index]) return;
        this._decodeChunkIntoState(state, index, raw);
        state.loadedChunks[index] = 1;
        state.loadedChunkCount += 1;
        this._updateLoadedPrefix(state);
        this._queueChunkUpload(state, index);
        if (this.currentState === state) {
            this._updatePerf({
                loadedChunkCount: state.loadedChunkCount,
                loadedPoints: state.loadedPoints,
                decodeQueueLength: state.decodeQueueLength,
            });
        }
    }

    _decodeChunkIntoState(state, index, raw) {
        const chunk = state.manifest.chunks[index];
        const header = {
            min: state.manifest.min,
            scale: state.manifest.scale,
            blockSize: state.manifest.blockSize,
            count: state.manifest.count,
        };
        let offset = 0;
        let writeOffset = chunk.firstPoint;
        let remaining = chunk.pointCount;
        while (remaining > 0) {
            const blockCount = Math.min(state.manifest.blockSize, remaining);
            decodeBlock(raw, offset, blockCount, state.positions, state.colors, writeOffset, header);
            offset += blockCount * 9;
            writeOffset += blockCount;
            remaining -= blockCount;
        }
        applyTransform(state.positions, chunk.firstPoint, chunk.pointCount, state.xform);
    }

    _firstPaintTarget(state) {
        const sampling = Math.max(0.01, this._baseSamplingRate || 1);
        const targetLoaded = Math.ceil(FIRST_PAINT_VISIBLE_POINTS / sampling);
        return Math.min(state.capacity || state.manifest.count, targetLoaded);
    }

    // How many chunks this device streams for a scene, and how many points
    // that covers. Chunks are a shuffled stream, so the prefix is uniform.
    _chunkLimit(state) {
        const m = state.manifest;
        if (!m) return 0;
        if (this.fullDetail || m.count <= LIGHT_POINT_BUDGET) return m.chunkCount;
        let i = 0;
        while (i < m.chunkCount && m.chunks[i].firstPoint < LIGHT_POINT_BUDGET) i += 1;
        return Math.max(1, i);
    }

    _capacityPoints(state) {
        const m = state.manifest;
        const limit = this._chunkLimit(state);
        return limit >= m.chunkCount ? m.count : m.chunks[limit].firstPoint;
    }

    _updateDetailUI() {
        const btn = this.detailBtn;
        if (!btn) return;
        const state = this.currentState;
        const m = state?.manifest;
        const limited = !!m && this._chunkLimit(state) < m.chunkCount;
        btn.hidden = !limited;
        if (!limited) return;
        let rest = 0;
        for (let i = this._chunkLimit(state); i < m.chunkCount; i++) {
            if (!state.loadedChunks?.[i]) rest += m.chunks[i].compressedSize;
        }
        const mp = (n) => (n / 1e6).toFixed(1);
        btn.querySelector('.detail-count').textContent = `${mp(state.capacity)} of ${mp(m.count)} M points`;
        btn.querySelector('.detail-act').textContent = `Load all · ${Math.max(1, Math.round(rest / 1e6))} MB`;
    }

    // Lift the device budget: grow the arrays, reinstall the geometry with
    // what is already decoded, and stream the remaining chunks.
    loadAllPoints() {
        if (this.fullDetail) return;
        this.fullDetail = true;
        const state = this.currentState;
        if (this.detailBtn) this.detailBtn.hidden = true;
        if (!state?.manifest) return;
        // Re-enter the scene through the normal path: it regrows the arrays,
        // re-uploads what is decoded, reapplies the view settings and resumes.
        this._captureStateView(state);
        this._abortStateStream(state);
        this._disposeStateGpu(state);
        this._activateState(state.key, state.cfg);
    }

    _updateLoadedPrefix(state) {
        while (state.contiguousChunks < state.manifest.chunkCount &&
               state.loadedChunks[state.contiguousChunks]) {
            state.contiguousChunks += 1;
        }
        const contiguousPoints = state.contiguousChunks >= state.manifest.chunkCount
            ? state.manifest.count
            : state.manifest.chunks[state.contiguousChunks]?.firstPoint || 0;
        state.loadedPoints = contiguousPoints;
        if (this.currentState === state) {
            this._totalPoints = state.capacity || state.manifest.count;
            this._loadedPoints = contiguousPoints;
        }
        return contiguousPoints;
    }

    _queueChunkUpload(state, index) {
        const chunk = state.manifest.chunks[index];
        this._queueUploadRange(state, chunk.firstPoint, chunk.pointCount);
    }

    _queueUploadRange(state, firstPoint, pointCount) {
        if (!state?.geometry || this.currentState !== state || !pointCount || this._contextLost) return;
        state.uploadDirtyStart = Math.min(state.uploadDirtyStart, firstPoint);
        state.uploadDirtyEnd = Math.max(state.uploadDirtyEnd, firstPoint + pointCount);
        state.uploadQueueLength = 1;
        state.dirtyUploadRanges += 1;
        if (state.uploadRaf) {
            this._updatePerf({
                uploadQueueLength: state.uploadQueueLength,
                dirtyUploadRanges: state.dirtyUploadRanges,
            });
            return;
        }
        state.uploadRaf = requestAnimationFrame(() => {
            state.uploadRaf = null;
            if (this.currentState !== state || !state.geometry || this._contextLost) {
                state.uploadDirtyStart = Infinity;
                state.uploadDirtyEnd = -Infinity;
                state.uploadQueueLength = 0;
                return;
            }
            const start = state.uploadDirtyStart;
            const end = state.uploadDirtyEnd;
            state.uploadDirtyStart = Infinity;
            state.uploadDirtyEnd = -Infinity;
            state.uploadQueueLength = 0;
            if (Number.isFinite(start) && end > start) {
                const posAttr = state.geometry.getAttribute('position');
                const colAttr = state.geometry.getAttribute('color');
                const attrOffset = start * 3;
                const attrCount = (end - start) * 3;
                posAttr.updateRange.offset = attrOffset;
                posAttr.updateRange.count = attrCount;
                posAttr.needsUpdate = true;
                colAttr.updateRange.offset = attrOffset;
                colAttr.updateRange.count = attrCount;
                colAttr.needsUpdate = true;
            }
            this._commitStateProgress(state);
        });
        this._updatePerf({
            uploadQueueLength: state.uploadQueueLength,
            dirtyUploadRanges: state.dirtyUploadRanges,
        });
    }

    _commitStateProgress(state, dirtyChunkIndex = null) {
        if (this.currentState === state) this._updateDetailUI();
        if (dirtyChunkIndex != null) this._queueChunkUpload(state, dirtyChunkIndex);
        const contiguousPoints = this._updateLoadedPrefix(state);

        if (!state.revealed && contiguousPoints >= this._firstPaintTarget(state)) {
            state.revealed = true;
            if (state.pointCloud) state.pointCloud.visible = true;
            this.setMessage('');
        } else if (!state.revealed && this.currentState === state) {
            this.setMessage('Loading…');
        }

        if (state.pointCloud) {
            const visible = state.revealed ? this._visiblePointCap() : 0;
            state.pointCloud.geometry.setDrawRange(0, visible);
            state.visiblePoints = visible;
        }

        if (this.currentState === state) {
            this._updatePerf({
                activeScene: state.key,
                activeUrl: state.url,
                loading: state.status !== 'ready',
                status: state.status,
                visiblePoints: state.visiblePoints,
                loadedPoints: state.loadedPoints,
                totalPoints: state.manifest.count,
                loadedChunkCount: state.loadedChunkCount,
                totalChunkCount: state.manifest.chunkCount,
                networkBytes: state.networkBytes,
                cachedBytes: state.cachedBytes,
                partialResumeBytes: state.partialResumeBytes,
                redownloadedChunks: state.redownloadedChunks,
                inflightFetches: state.fetchInFlight || 0,
                decodeQueueLength: state.decodeQueueLength || 0,
                uploadQueueLength: state.uploadQueueLength || 0,
                dirtyUploadRanges: state.dirtyUploadRanges || 0,
                livePointClouds: this.pointCloud ? 1 : 0,
            });
            this._refreshResourceCounters();
        }
    }

    _disposeDecodedState(state) {
        if (!state || state === this.currentState) return;
        this._disposeStateGpu(state);
        state.positions = null;
        state.colors = null;
        state.geometry = null;
        state.pointCloud = null;
        state.loadedChunks = null;
        state.loadedChunkCount = 0;
        state.contiguousChunks = 0;
        state.loadedPoints = 0;
        state.visiblePoints = 0;
        state.revealed = false;
        state.status = 'idle';
        state.partialChunks.clear();
    }

    _trimInactiveStates() {
        const inactive = Array.from(this.sceneStates.values())
            .filter(s => s !== this.currentState && (s.positions || s.pointCloud) && !s.loadPromise)
            .sort((a, b) => b.lastActive - a.lastActive);
        let retainedBytes = 0;
        inactive.forEach((state, index) => {
            const bytes = this._decodedBytesForState(state);
            const keep = index === 0 && retainedBytes + bytes <= MAX_INACTIVE_DECODED_BYTES;
            if (keep) {
                retainedBytes += bytes;
                this._disposeStateGpu(state);
            } else {
                this._disposeDecodedState(state);
            }
        });
        this._refreshResourceCounters();
    }

    // Runtime setters used by the view controls panel.  All of them no-op
    // gracefully when there is no point cloud loaded yet (the panel can
    // still write values; the next scene load will pick them up via cfg).
    // Points use size attenuation: on screen, size × (height / 2) / depth px.
    // The panel works in pixels at the orbit centre; 1 px is the finest.
    _pxPerWorld() {
        const z = this.camera && this.controls ? this.camera.position.distanceTo(this.controls.target) : 0;
        const hgt = this.container.clientHeight;
        return z > 0 && hgt > 0 ? hgt / (2 * z) : 0;
    }

    pointSizeToPx(size) {
        const k = this._pxPerWorld();
        if (!k || size <= 1e-5) return 1;
        return Math.max(1, Math.min(10, Math.round(size * k * 2) / 2));
    }

    pxToPointSize(px) {
        const k = this._pxPerWorld();
        return px <= 1 || !k ? 1e-6 : px / k;
    }

    setPointSize(size) {
        if (!this.pointCloud) return;
        this.pointCloud.material.size = size;
        this.raycaster.params.Points.threshold = size * 1.5;
    }

    setSamplingRate(rate) {
        this._baseSamplingRate = Math.max(0, Math.min(1, rate));
        this._applyDrawBudget();
    }

    setBrightness(b) {
        if (!this.pointCloud) return;
        const shader = this.pointCloud.material.userData?.shader;
        if (shader && shader.uniforms.uBrightness) {
            shader.uniforms.uBrightness.value = b;
        }
    }

    setBackground(color) {
        this.scene.background = new THREE.Color(color);
    }

    setRotation(rotDegrees) {
        if (!this.pointCloud) return;
        const d2r = Math.PI / 180;
        this.pointCloud.rotation.set(
            (rotDegrees.x || 0) * d2r,
            (rotDegrees.y || 0) * d2r,
            (rotDegrees.z || 0) * d2r
        );
    }

    // Move the camera without re-installing the scene.  `cam` is a unit
    // offset multiplied by the scene's bounding-sphere radius, same as
    // the one baked into DEMO_CONFIGS.  The orbit target is reset to the
    // origin so spin-around works as expected after the snap.
    setCameraOffset(cam) {
        const r = this._sceneRadius || 1;
        this.camera.position.set(r * cam.x, r * cam.y, r * cam.z);
        this.controls.target.set(0, 0, 0);
        this.controls.update();
    }

    // Capture the current camera as unit offsets ({x, y, z} divided by
    // radius), suitable for pasting back into DEMO_CONFIGS.camera.
    getCameraOffset() {
        const r = this._sceneRadius || 1;
        return {
            x: this.camera.position.x / r,
            y: this.camera.position.y / r,
            z: this.camera.position.z / r
        };
    }

    // Install an (initially empty) full-sized geometry.  Positions &
    // colours are the pre-allocated typed arrays that blocks will fill
    // in place.  We set `boundingSphere` explicitly from the header's
    // known full-scene radius so three.js never re-derives it from the
    // (still-zero) unfilled slots.  Returns the geometry so the caller
    // can retain a reference for later updateRange plumbing.
    _installGeometry(positions, colors, totalCount, drawCount, cfg, radius) {
        this.clearCloud();

        const geometry = new THREE.BufferGeometry();
        const posAttr = new THREE.BufferAttribute(positions, 3);
        posAttr.setUsage(THREE.DynamicDrawUsage);
        geometry.setAttribute('position', posAttr);
        const colAttr = new THREE.BufferAttribute(colors, 3, true);
        colAttr.setUsage(THREE.DynamicDrawUsage);
        geometry.setAttribute('color', colAttr);

        geometry.setDrawRange(0, drawCount);
        geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), radius);

        this._sceneRadius = radius;
        this.raycaster.params.Points.threshold = cfg.pointSize * 1.5;

        const material = new THREE.PointsMaterial({
            size: cfg.pointSize,
            vertexColors: true,
            sizeAttenuation: true
        });

        // Inject a brightness uniform into the fragment shader.  We keep
        // a reference to the compiled Shader object so the controls panel
        // can update `uBrightness` live without a full material rebuild.
        // Values > 1 are allowed — they map to over-exposure, which is
        // exactly what under-lit scans need to read well on a white page.
        //
        // Anchor the injection at `#include <tonemapping_fragment>` rather
        // than `#include <output_fragment>`: r128's points_frag writes
        // `gl_FragColor` inline (no output_fragment chunk exists), so the
        // older anchor silently no-ops.  Splicing in right before the
        // tonemapping pass also means the multiplier is applied in linear
        // space, which is the correct order for exposure-style scaling.
        const initialBrightness = (cfg.brightness != null) ? cfg.brightness : 1.0;
        material.userData.uBrightness = { value: initialBrightness };
        material.onBeforeCompile = (shader) => {
            shader.uniforms.uBrightness = material.userData.uBrightness;
            shader.fragmentShader = shader.fragmentShader
                .replace(
                    'void main() {',
                    'uniform float uBrightness;\nvoid main() {'
                )
                .replace(
                    '#include <tonemapping_fragment>',
                    'gl_FragColor.rgb *= uBrightness;\n\t#include <tonemapping_fragment>'
                );
            material.userData.shader = shader;
        };

        this.pointCloud = new THREE.Points(geometry, material);

        // Apply scene rotation (straightens crooked captures).  Stored in
        // degrees in the config for human-readability; Three.js wants rad.
        const rot = cfg.rotation || { x: 0, y: 0, z: 0 };
        const d2r = Math.PI / 180;
        this.pointCloud.rotation.set(
            (rot.x || 0) * d2r, (rot.y || 0) * d2r, (rot.z || 0) * d2r
        );

        // Points' raycast() iterates the full positions buffer regardless
        // of drawRange, which means measurements snap to hidden points
        // when sampling < 100%.  Wrap it to respect drawRange.count.
        const originalRaycast = this.pointCloud.raycast.bind(this.pointCloud);
        this.pointCloud.raycast = (raycaster, intersects) => {
            const drawCount = geometry.drawRange.count;
            if (drawCount === Infinity || drawCount >= totalCount) {
                return originalRaycast(raycaster, intersects);
            }
            const before = intersects.length;
            originalRaycast(raycaster, intersects);
            // Filter out hits beyond drawRange — original is out-of-order
            // (by distance), so we keep only intersections whose index is
            // inside the drawn prefix.
            for (let i = intersects.length - 1; i >= before; i--) {
                if (intersects[i].index >= drawCount) intersects.splice(i, 1);
            }
        };

        this.scene.add(this.pointCloud);

        // Apply background override if provided (default: white).
        if (cfg.background) {
            this.scene.background = new THREE.Color(cfg.background);
        }

        const cam = cfg.camera || { x: -0.5, y: 0.3, z: -1.5 };
        this.camera.position.set(radius * cam.x, radius * cam.y, radius * cam.z);
        this.controls.target.set(0, 0, 0);
        this.controls.update();
        return geometry;
    }

    onResize() {
        const width = this.container.clientWidth;
        const height = this.container.clientHeight;
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
    }

    _installRenderVisibilityGate() {
        this._inViewport = true;
        this._docVisible = document.visibilityState === 'visible';
        this._rafId = null;

        const sync = () => this._syncRenderLoop();
        document.addEventListener('visibilitychange', () => {
            this._docVisible = document.visibilityState === 'visible';
            sync();
        });

        if ('IntersectionObserver' in window) {
            this._inViewport = false;
            this._renderObserver = new IntersectionObserver((entries) => {
                this._inViewport = entries.some(e => e.isIntersecting);
                sync();
            }, { threshold: 0.01 });
            this._renderObserver.observe(this.container);
        }

        sync();
    }

    _syncRenderLoop() {
        const shouldRender = this._inViewport && this._docVisible && !this._contextLost;
        if (shouldRender && !this._rafId) {
            this.animate();
        } else if (!shouldRender && this._rafId) {
            cancelAnimationFrame(this._rafId);
            this._rafId = null;
        }
    }

    animate() {
        if (!this._inViewport || !this._docVisible || this._contextLost) {
            this._rafId = null;
            return;
        }
        this.controls.update();
        this.renderer.render(this.scene, this.camera);
        if (this.measurePoints.length) this._updateMeasureOverlay();
        this._rafId = requestAnimationFrame(() => this.animate());
    }
}


// ========================================
// ViewerControls — MeshLab-style settings panel
//
// Owns the UI for tweaking point size, sampling rate, brightness,
// background and scene rotation.  Tweaks are kept per scene for the
// current visit only; every page load starts from the baked DEMO_CONFIGS
// initial view, and Reset snaps the current scene back to it.  To change
// an initial view for everyone, edit DEMO_CONFIGS above.
// ========================================
class ViewerControls {
    constructor(viewer) {
        this.viewer = viewer;
        this.currentKey = null;
        this.currentCfg = null;
        this.overrides = {};

        this.panel  = document.getElementById('demo-controls-panel');
        this.toggle = document.getElementById('controls-toggle-btn');

        // Bail silently if the panel markup isn't present (e.g. on an old
        // cached index.html); the viewer still runs, just without the
        // settings UI.
        if (!this.panel || !this.toggle) return;

        this._bindInputs();
        this._bindButtons();

        // Keep the Pitch/Yaw/Roll sliders in lockstep with mouse-drag
        // rotation: whenever the viewer rotates the cloud via drag, we
        // write the new degrees back into the inputs and their labels.
        this.viewer.onRotationChanged = (rot) => this._onViewerRotated(rot);

        this.toggle.addEventListener('click', () => this._togglePanel());
        const closeBtn = document.getElementById('controls-close');
        if (closeBtn) closeBtn.addEventListener('click', () => this._togglePanel(false));
        // Fill each slider's track up to its thumb.
        this.panel.addEventListener('input', (e) => {
            if (e.target.type === 'range') this._paintRange(e.target);
        });
    }

    _paintRange(el) {
        const min = parseFloat(el.min), max = parseFloat(el.max), v = parseFloat(el.value);
        el.style.setProperty('--p', `${(((v - min) / (max - min)) * 100).toFixed(1)}%`);
    }

    _paintAll() {
        this.panel.querySelectorAll('input[type="range"]').forEach((el) => this._paintRange(el));
    }

    _onViewerRotated(rot) {
        if (!this.currentCfg) return;
        const set = (id, valId, value) => {
            const el = this._$(id); if (el) el.value = value;
            const lab = this._$(valId); if (lab) lab.textContent = value + '°';
        };
        set('ctrl-rot-x', 'ctrl-rot-x-val', rot.x);
        set('ctrl-rot-y', 'ctrl-rot-y-val', rot.y);
        set('ctrl-rot-z', 'ctrl-rot-z-val', rot.z);
        this._persist({ rotation: { x: rot.x, y: rot.y, z: rot.z } });
        this._paintAll();
    }

    // Called by initDemo before `viewer.show()`.  Merges baked config
    // with any saved per-scene overrides and returns the effective cfg
    // that the viewer should render with.  Also refreshes the panel so
    // its inputs reflect the resolved values.
    bind(key, cfg) {
        this.currentKey = key;
        const effective = this._merge(cfg, this.overrides[key]);
        this.currentCfg = effective;
        this._syncInputs(effective);
        return effective;
    }

    _merge(base, override) {
        if (!override) return { ...base };
        const merged = { ...base, ...override };
        // Deep-merge the two nested objects so partial overrides work.
        merged.camera   = { ...(base.camera   || {}), ...(override.camera   || {}) };
        merged.rotation = { ...(base.rotation || {}), ...(override.rotation || {}) };
        return merged;
    }

    // Record a per-scene tweak for this visit.  The override layers on top
    // of the baked cfg so switching scenes and back keeps it.
    _persist(patch) {
        if (!this.currentKey) return;
        const prev = this.overrides[this.currentKey] || {};
        this.overrides[this.currentKey] = { ...prev, ...patch };
        Object.assign(this.currentCfg, patch);
    }

    _togglePanel(force) {
        const want = (force != null) ? force : !this.panel.classList.contains('open');
        this.panel.classList.toggle('open', want);
        this.toggle.classList.toggle('active', want);
        this.toggle.setAttribute('aria-expanded', String(want));
    }

    _$(id) { return document.getElementById(id); }

    _bindInputs() {
        const bindRange = (id, labelId, onChange, formatter) => {
            const el = this._$(id);
            const lab = this._$(labelId);
            if (!el) return;
            el.addEventListener('input', () => {
                const v = parseFloat(el.value);
                if (lab) lab.textContent = formatter(v);
                onChange(v);
            });
        };

        bindRange('ctrl-pointsize', 'ctrl-pointsize-val', (v) => {
            const size = this.viewer.pxToPointSize(v);
            this.viewer.setPointSize(size);
            this._persist({ pointSize: size });
        }, (v) => `${String(+v)} px`);

        bindRange('ctrl-sampling', 'ctrl-sampling-val', (v) => {
            this.viewer.setSamplingRate(v / 100);
            this._persist({ samplingRate: v / 100 });
        }, (v) => Math.round(v) + '%');

        bindRange('ctrl-brightness', 'ctrl-brightness-val', (v) => {
            this.viewer.setBrightness(v);
            this._persist({ brightness: v });
        }, (v) => v.toFixed(2) + '×');

        const bindRot = (axis) => {
            const el = this._$(`ctrl-rot-${axis}`);
            const lab = this._$(`ctrl-rot-${axis}-val`);
            if (!el) return;
            el.addEventListener('input', () => {
                const v = parseFloat(el.value);
                if (lab) lab.textContent = v + '°';
                const rot = { ...(this.currentCfg?.rotation || { x: 0, y: 0, z: 0 }) };
                rot[axis] = v;
                this.viewer.setRotation(rot);
                this._persist({ rotation: rot });
            });
        };
        bindRot('x'); bindRot('y'); bindRot('z');

        const bgRow = this._$('ctrl-bg-swatches');
        if (bgRow) {
            bgRow.querySelectorAll('.bg-swatch').forEach(btn => {
                btn.addEventListener('click', () => {
                    const bg = btn.dataset.bg;
                    bgRow.querySelectorAll('.bg-swatch').forEach(b => b.classList.toggle('selected', b === btn));
                    this.viewer.setBackground(bg);
                    this._persist({ background: bg });
                });
            });
        }
    }

    _bindButtons() {
        const reset = this._$('ctrl-reset');
        if (reset) reset.addEventListener('click', () => this._resetCurrent());
    }

    _syncInputs(cfg) {
        const set = (id, valId, value, formatter) => {
            const el = this._$(id); if (!el) return;
            el.value = value;
            const lab = this._$(valId);
            if (lab && formatter) lab.textContent = formatter(value);
        };
        set('ctrl-pointsize', 'ctrl-pointsize-val', this.viewer.pointSizeToPx(cfg.pointSize), (v) => `${String(+v)} px`);
        const samp = (cfg.samplingRate != null ? cfg.samplingRate : 1) * 100;
        set('ctrl-sampling', 'ctrl-sampling-val', samp, (v) => Math.round(v) + '%');
        const bright = (cfg.brightness != null ? cfg.brightness : 1);
        set('ctrl-brightness', 'ctrl-brightness-val', bright, (v) => (+v).toFixed(2) + '×');
        const rot = cfg.rotation || { x: 0, y: 0, z: 0 };
        set('ctrl-rot-x', 'ctrl-rot-x-val', rot.x || 0, (v) => v + '°');
        set('ctrl-rot-y', 'ctrl-rot-y-val', rot.y || 0, (v) => v + '°');
        set('ctrl-rot-z', 'ctrl-rot-z-val', rot.z || 0, (v) => v + '°');

        this._paintAll();
        const bgRow = this._$('ctrl-bg-swatches');
        if (bgRow) {
            const current = (cfg.background || '#ffffff').toLowerCase();
            bgRow.querySelectorAll('.bg-swatch').forEach(b => {
                b.classList.toggle('selected', b.dataset.bg.toLowerCase() === current);
            });
        }
    }

    _resetCurrent() {
        if (!this.currentKey) return;
        delete this.overrides[this.currentKey];
        const baked = DEMO_CONFIGS[this.currentKey];
        if (!baked) return;
        this.currentCfg = { ...baked,
            camera:   { ...baked.camera },
            rotation: { ...baked.rotation }
        };
        this._syncInputs(this.currentCfg);
        // Push all values back into the viewer so the scene snaps to its
        // baked defaults in one action.
        this.viewer.setPointSize(baked.pointSize);
        this.viewer.setSamplingRate(baked.samplingRate != null ? baked.samplingRate : 1);
        this.viewer.setBrightness(baked.brightness != null ? baked.brightness : 1);
        this.viewer.setBackground(baked.background || '#ffffff');
        this.viewer.setRotation(baked.rotation || { x: 0, y: 0, z: 0 });
        this.viewer.setCameraOffset(baked.camera);
    }
}


// ========================================
// Boot (kept last so every const/class above is initialised)
// ========================================
function bootUnitViewer() {
    evictStaleCaches();
    initDeferredDemo();
}
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootUnitViewer, { once: true });
} else {
    bootUnitViewer();
}
