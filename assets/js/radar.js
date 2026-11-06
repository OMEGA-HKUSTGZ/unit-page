// Benchmark radar: one spoke per benchmark of Tables 3–6, the same twelve
// spokes as the radar in the paper's Fig. 1. Numbers come from
// assets/js/results-data.js (generated from the paper's LaTeX tables).
//
// Score on a spoke = mean over that table's three metrics of the model's value
// relative to the best model shown (best ÷ value when lower is better,
// value ÷ best when higher is better). 1 means best on every metric = the rim.
(() => {
  const DATA = window.UNIT_RESULTS;
  const host = document.querySelector('[data-radar]');
  if (!DATA || !host) return;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const touch = window.matchMedia('(hover: none)').matches;
  const NS = 'http://www.w3.org/2000/svg';

  const TASKS = [
    ['reconstruction', 'Multi-view reconstruction', 'Reconstruction'],
    ['videoDepth', 'Video depth', 'Video depth'],
    ['pose', 'Camera pose', 'Camera pose'],
    ['monoDepth', 'Monocular depth', 'Mono depth'],
  ];
  const SPOKES = [];
  TASKS.forEach(([task], ti) => DATA[task].datasets.forEach((ds, di) => SPOKES.push({ task, ti, di, ds })));
  const N = SPOKES.length;
  const ONLINE_ONLY = ['CUT3R', 'StreamVGGT'];
  // Shared with the per-task boards (assets/js/results.js loads first).
  const COLORS = window.UNIT_COLORS;
  const SCALES = ['Metric-scale', 'Scale-invariant'];
  const MODES = ['Offline', 'Online'];
  const ui = { scale: 0, mode: 0, hover: -1, pinned: 0 };
  const spokeNow = () => (ui.hover >= 0 ? ui.hover : ui.pinned);

  // ---------- data ----------
  function rowsFor(task, scale, mode) {
    const cond = DATA[task].conditions.find((c) => c.label === scale);
    const group = cond.groups.find((g) => g.label === mode) || cond.groups[0];
    let rows = group.rows;
    if (task === 'monoDepth') {
      rows = rows.filter((r) => (mode === 'Online'
        ? ONLINE_ONLY.includes(r.method) || r.method === 'UniT'
        : !ONLINE_ONLY.includes(r.method)));
    }
    return rows;
  }

  function buildView(scale, mode) {
    const models = [];
    const score = {};
    const raw = {};
    SPOKES.forEach((sp, si) => {
      const spec = DATA[sp.task];
      const rows = rowsFor(sp.task, scale, mode);
      rows.forEach((r) => {
        if (!score[r.method]) {
          score[r.method] = new Array(N).fill(0);
          raw[r.method] = new Array(N).fill(null);
          models.push(r.method);
        }
      });
      spec.metrics.forEach(([, dir], mi) => {
        const vals = rows.map((r) => r.values[sp.di * 3 + mi]);
        const best = dir === 'down' ? Math.min(...vals) : Math.max(...vals);
        rows.forEach((r, ri) => {
          const v = vals[ri];
          score[r.method][si] += (dir === 'down' ? best / v : v / best) / 3;
        });
      });
      rows.forEach((r) => { raw[r.method][si] = r.values.slice(sp.di * 3, sp.di * 3 + 3); });
    });
    models.sort((a, b) => (a === 'UniT') - (b === 'UniT')); // UniT drawn last, on top
    const mean = {};
    models.forEach((m) => { mean[m] = score[m].reduce((a, v) => a + v, 0) / N; });
    const others = models.filter((m) => m !== 'UniT');
    const margin = SPOKES.map((_, si) => score.UniT[si] - Math.max(...others.map((m) => score[m][si])));
    const leads = margin.filter((d) => d >= -1e-9).length;
    const lead = margin.indexOf(Math.max(...margin));
    return { scale, mode, models, score, raw, mean, leads, lead, margin };
  }
  const VIEWS = {};
  SCALES.forEach((sc) => MODES.forEach((m) => { VIEWS[`${sc}|${m}`] = buildView(sc, m); }));
  const viewNow = () => VIEWS[`${SCALES[ui.scale]}|${MODES[ui.mode]}`];
  const nameOf = (m, mode) => (m === 'UniT' ? (mode === 'Online' ? 'UniT (G = 1)' : 'UniT (G = N)') : m);

  // ---------- DOM helpers ----------
  const h = (tag, cls, txt) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (txt !== undefined) n.textContent = txt;
    return n;
  };
  const s = (tag, attrs, parent) => {
    const n = document.createElementNS(NS, tag);
    Object.entries(attrs || {}).forEach(([k, v]) => n.setAttribute(k, v));
    if (parent) parent.appendChild(n);
    return n;
  };

  // ---------- skeleton ----------
  const card = h('div', 'rd-card');
  const head = h('div', 'rd-head');
  const controls = h('div', 'rd-controls');
  const stage = h('div', 'rd-stage');
  const side = h('div', 'rd-side');
  card.append(head, controls, stage, side);
  const caption = h('figcaption', 'rd-caption',
    'Spokes are the twelve benchmarks of Tables 3–6, the same spokes as the radar in the paper’s Fig. 1. A model’s score on a spoke is the mean over that table’s three metrics of its value relative to the best model shown (best ÷ value when lower is better), so 1.0 on the outer ring means best on every metric.');
  host.append(card, caption);

  // ---------- radar drawing ----------
  const LAYOUTS = {
    wide: { W: 600, H: 600, cx: 300, cy: 300, R: 200, label: 20, arc: 64, font: 13, arcFont: 11.5 },
    tall: { W: 400, H: 400, cx: 200, cy: 200, R: 124, label: 13, arc: 52, font: 11.5, arcFont: 10 },
  };
  let L = null;
  let svg = null;
  const shapes = {};
  let spokeEls = [];
  let pill = null;
  const angle = (i) => -Math.PI / 2 + (i * 2 * Math.PI) / N;
  const pt = (i, r) => [L.cx + L.R * r * Math.cos(angle(i)), L.cy + L.R * r * Math.sin(angle(i))];
  const polar = (a, r) => [L.cx + r * Math.cos(a), L.cy + r * Math.sin(a)];

  function buildSvg() {
    stage.textContent = '';
    svg = s('svg', { viewBox: `0 0 ${L.W} ${L.H}`, class: 'rd-svg', role: 'img' });
    stage.appendChild(svg);
    const defs = s('defs', {}, svg);
    const grad = s('linearGradient', { id: 'urd-fill', x1: '0', y1: '0', x2: '1', y2: '1' }, defs);
    s('stop', { offset: '0%', 'stop-color': '#e88873', 'stop-opacity': '0.30' }, grad);
    s('stop', { offset: '100%', 'stop-color': '#8a5f5c', 'stop-opacity': '0.38' }, grad);
    const glow = s('filter', { id: 'urd-glow', x: '-25%', y: '-25%', width: '150%', height: '150%' }, defs);
    s('feGaussianBlur', { in: 'SourceAlpha', stdDeviation: '7', result: 'b' }, glow);
    s('feOffset', { in: 'b', dy: '6', result: 'o' }, glow);
    s('feFlood', { 'flood-color': '#8a5f5c', 'flood-opacity': '0.22' }, glow);
    s('feComposite', { in2: 'o', operator: 'in', result: 'sh' }, glow);
    const fm = s('feMerge', {}, glow);
    s('feMergeNode', { in: 'sh' }, fm);
    s('feMergeNode', { in: 'SourceGraphic' }, fm);

    // Ring bands: alternate fills read like a target, without heavy lines.
    const rings = [1, 0.8, 0.6, 0.4, 0.2];
    rings.forEach((r, k) => s('circle', {
      cx: L.cx, cy: L.cy, r: L.R * r, class: k % 2 ? 'rd-band rd-band-b' : 'rd-band rd-band-a',
    }, svg));
    s('circle', { cx: L.cx, cy: L.cy, r: L.R, class: 'rd-rim' }, svg);

    // Task arcs outside the benchmark labels, with curved titles.
    const half = Math.PI / N;
    TASKS.forEach(([, title, short], ti) => {
      const a0 = angle(ti * 3) - half + 0.05;
      const a1 = angle(ti * 3 + 2) + half - 0.05;
      const ar = L.R + L.arc;
      const mid = (a0 + a1) / 2;
      const lower = Math.sin(mid) > 0.2;
      const [x0, y0] = polar(a0, ar);
      const [x1, y1] = polar(a1, ar);
      s('path', { d: `M${x0},${y0} A${ar},${ar} 0 0 1 ${x1},${y1}`, class: 'rd-arc' }, svg);
      [a0, a1].forEach((a) => {
        const [ix, iy] = polar(a, ar - 4);
        const [ox, oy] = polar(a, ar + 4);
        s('line', { x1: ix, y1: iy, x2: ox, y2: oy, class: 'rd-arc' }, svg);
      });
      const tr = ar + (lower ? 16 : 10);
      const [p0x, p0y] = polar(a0, tr);
      const [p1x, p1y] = polar(a1, tr);
      const d = lower ? `M${p1x},${p1y} A${tr},${tr} 0 0 0 ${p0x},${p0y}` : `M${p0x},${p0y} A${tr},${tr} 0 0 1 ${p1x},${p1y}`;
      s('path', { id: `urd-arc-${ti}`, d, fill: 'none' }, defs);
      const t = s('text', { class: 'rd-task', 'font-size': L.arcFont }, svg);
      const tp = s('textPath', { href: `#urd-arc-${ti}`, startOffset: '50%', 'text-anchor': 'middle' }, t);
      tp.textContent = L === LAYOUTS.tall ? short : title;
    });

    // Spokes and benchmark labels.
    spokeEls = SPOKES.map((sp, i) => {
      const [x, y] = pt(i, 1);
      const line = s('line', { x1: L.cx, y1: L.cy, x2: x, y2: y, class: 'rd-spoke' }, svg);
      const [lx, ly] = pt(i, 1 + L.label / L.R);
      const c = Math.cos(angle(i));
      const sy = Math.sin(angle(i));
      const anchor = Math.abs(c) < 0.2 ? 'middle' : c > 0 ? 'start' : 'end';
      const label = s('text', {
        x: lx, y: ly + (sy > 0.5 ? 10 : sy < -0.5 ? -2 : 4),
        'text-anchor': anchor, class: 'rd-label', 'font-size': L.font,
      }, svg);
      label.textContent = sp.ds;
      return { line, label };
    });
    [0.6, 1].forEach((r) => {
      const t = s('text', { x: L.cx + 5, y: L.cy - L.R * r + 12, class: 'rd-ringval' }, svg);
      t.textContent = r.toFixed(1);
    });
    s('circle', { cx: L.cx, cy: L.cy, r: 2.5, class: 'rd-center' }, svg);

    // Model polygons.
    Object.keys(shapes).forEach((k) => delete shapes[k]);
    const layer = s('g', { class: 'rd-polys' }, svg);
    Object.keys(COLORS).forEach((m) => {
      const isU = m === 'UniT';
      const g = s('g', { class: `rd-model${isU ? ' rd-unit' : ''}`, 'data-model': m }, layer);
      const poly = s('polygon', { class: 'rd-poly', fill: isU ? 'url(#urd-fill)' : COLORS[m], stroke: COLORS[m] }, g);
      if (isU) poly.setAttribute('filter', 'url(#urd-glow)');
      const dots = SPOKES.map(() => s('circle', {
        r: isU ? 4 : 2.6, class: 'rd-dot', fill: isU ? '#fff' : COLORS[m], stroke: isU ? COLORS[m] : '#fff',
      }, g));
      shapes[m] = { g, poly, dots };
    });

    // Score pill for UniT on the selected spoke.
    pill = s('g', { class: 'rd-pill' }, svg);
    s('rect', { rx: 9, ry: 9, height: 18, width: 40 }, pill);
    s('text', { 'text-anchor': 'middle', y: 12.5 }, pill);

    // Hit wedges, one per spoke, for hover / tap / keyboard.
    const hits = s('g', { class: 'rd-hits' }, svg);
    SPOKES.forEach((sp, i) => {
      const R = L.R + L.label + 16;
      const [ax, ay] = polar(angle(i) - half, R);
      const [bx, by] = polar(angle(i) + half, R);
      const w = s('path', {
        d: `M${L.cx},${L.cy} L${ax},${ay} A${R},${R} 0 0 1 ${bx},${by} Z`,
        class: 'rd-hit', tabindex: '0', role: 'button',
        'aria-label': `${TASKS[sp.ti][1]}, ${sp.ds}: show the numbers`,
      }, hits);
      if (!touch) w.addEventListener('mouseenter', () => setHover(i));
      w.addEventListener('focus', () => setHover(i));
      w.addEventListener('blur', () => setHover(-1));
      w.addEventListener('click', () => { ui.pinned = i; setHover(-1); paintSpoke(); });
      w.addEventListener('keydown', (e) => { if (e.key === 'Enter') openTable(i); });
    });
    svg.addEventListener('mouseleave', () => setHover(-1));
    paint();
    paintSpoke();
  }

  // ---------- state + tween ----------
  const cur = {};
  const vis = {};
  Object.keys(COLORS).forEach((m) => { cur[m] = new Array(N).fill(0); vis[m] = 0; });
  let raf = 0;

  function paintPill() {
    if (!pill) return;
    const i = spokeNow();
    const r = cur.UniT[i];
    const on = vis.UniT > 0.5 && r > 0.05;
    pill.style.opacity = on ? '1' : '0';
    if (!on) return;
    const val = viewNow().score.UniT[i].toFixed(2);
    const a = angle(i);
    const [vx, vy] = pt(i, r);
    // Sit just inside the vertex so it never covers the benchmark label.
    const x = vx - Math.cos(a) * 26;
    const y = vy - Math.sin(a) * 20;
    pill.setAttribute('transform', `translate(${x - 20},${y - 9})`);
    pill.querySelector('text').setAttribute('x', 20);
    pill.querySelector('text').textContent = val;
  }

  function paint() {
    if (!svg) return;
    Object.entries(shapes).forEach(([m, { g, poly, dots }]) => {
      poly.setAttribute('points', cur[m].map((r, i) => pt(i, r).join(',')).join(' '));
      dots.forEach((d, i) => {
        const [x, y] = pt(i, cur[m][i]);
        d.setAttribute('cx', x);
        d.setAttribute('cy', y);
        d.style.opacity = cur[m][i] > 0.04 ? '' : '0';
      });
      g.style.opacity = String(vis[m]);
    });
    paintMeans();
    paintPill();
  }

  const easeOut = (t) => 1 - (1 - t) ** 3;
  const easeBack = (t) => {
    const c = 1.4;
    return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2;
  };

  // Grow each polygon corner by corner, clockwise from the top spoke;
  // the baselines first, then UniT pushing out past them.
  function animateTo(view, first) {
    cancelAnimationFrame(raf);
    const from = {};
    const fromVis = {};
    const target = {};
    Object.keys(COLORS).forEach((m) => {
      from[m] = cur[m].slice();
      fromVis[m] = vis[m];
      target[m] = view.models.includes(m) ? view.score[m].slice() : new Array(N).fill(0);
    });
    if (reduced) {
      Object.keys(COLORS).forEach((m) => { cur[m] = target[m]; vis[m] = view.models.includes(m) ? 1 : 0; });
      paint();
      return;
    }
    const base = view.models.filter((m) => m !== 'UniT');
    const plan = {};
    Object.keys(COLORS).forEach((m) => {
      const isU = m === 'UniT';
      const bi = Math.max(base.indexOf(m), 0);
      plan[m] = first
        ? { delay: isU ? 500 + base.length * 160 : 200 + bi * 160, stagger: isU ? 85 : 38, dur: isU ? 640 : 520, ease: isU ? easeBack : easeOut }
        : { delay: isU ? 120 : 0, stagger: isU ? 40 : 24, dur: 480, ease: isU ? easeBack : easeOut };
    });
    const end = Math.max(...Object.values(plan).map((p) => p.delay + p.stagger * N + p.dur));
    const t0 = performance.now();
    const step = (now) => {
      const t = now - t0;
      Object.keys(COLORS).forEach((m) => {
        const p = plan[m];
        for (let i = 0; i < N; i += 1) {
          const k = Math.min(1, Math.max(0, (t - p.delay - i * p.stagger) / p.dur));
          cur[m][i] = Math.max(0, from[m][i] + (target[m][i] - from[m][i]) * p.ease(k));
        }
        const on = view.models.includes(m) ? 1 : 0;
        const kv = Math.min(1, Math.max(0, (t - p.delay) / 260));
        vis[m] = fromVis[m] + (on - fromVis[m]) * kv;
      });
      paint();
      if (t < end) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  }

  // ---------- header ----------
  const kicker = h('p', 'rd-kicker', 'Benchmark profile');
  const title = h('p', 'rd-title');
  const sub = h('p', 'rd-sub');
  head.append(kicker, title, sub);

  const makeSeg = (label, items, key) => {
    const wrap = h('div', 'rc-seg-wrap');
    wrap.appendChild(h('span', 'rc-seg-label', label));
    const seg = h('div', 'seg');
    seg.setAttribute('role', 'group');
    seg.setAttribute('aria-label', label);
    const buttons = items.map((item, i) => {
      const b = h('button', '', item);
      b.type = 'button';
      b.addEventListener('click', () => {
        if (ui[key] === i) return;
        ui[key] = i;
        sync();
        update(false);
      });
      seg.appendChild(b);
      return b;
    });
    const sync = () => buttons.forEach((b, i) => b.setAttribute('aria-pressed', String(i === ui[key])));
    sync();
    wrap.appendChild(seg);
    return wrap;
  };
  controls.append(makeSeg('Scale', SCALES, 'scale'), makeSeg('Inference', MODES, 'mode'));

  function headline(view) {
    title.textContent = '';
    title.append(h('strong', '', String(view.leads)), document.createTextNode(` of ${N} benchmarks where UniT scores highest`));
    const others = view.models.filter((m) => m !== 'UniT').sort((a, b) => view.mean[b] - view.mean[a]);
    const top = others[0];
    const u = view.mean.UniT;
    const t = view.mean[top];
    const who = nameOf('UniT', view.mode);
    sub.textContent = u >= t
      ? `Mean score ${u.toFixed(2)} for ${who}, ahead of ${top} at ${t.toFixed(2)}.`
      : `Mean score ${u.toFixed(2)} for ${who}; ${top} is higher in this setting at ${t.toFixed(2)}.`;
    svg?.setAttribute('aria-label', `Radar of ${N} benchmarks, ${view.scale.toLowerCase()} ${view.mode.toLowerCase()}. ${title.textContent}. ${sub.textContent}`);
  }

  // ---------- side: legend + spoke detail ----------
  const legendBox = h('div', 'rd-panel rd-legend-box');
  legendBox.appendChild(h('p', 'rd-panel-title', 'Mean score over 12 benchmarks'));
  const legend = h('ul', 'rd-legend');
  legendBox.appendChild(legend);
  const detail = h('div', 'rd-panel rd-detail');
  detail.setAttribute('aria-live', 'polite');
  side.append(legendBox, detail);

  const meanEls = {};
  function buildLegend(view) {
    legend.textContent = '';
    Object.keys(meanEls).forEach((k) => delete meanEls[k]);
    view.models.slice().sort((a, b) => view.mean[b] - view.mean[a]).forEach((m) => {
      const li = h('li', `rd-li${m === 'UniT' ? ' rd-li-unit' : ''}`);
      li.tabIndex = 0;
      const sw = h('span', 'rd-swatch');
      sw.style.background = COLORS[m];
      const bar = h('span', 'rd-bar');
      const fill = h('span', 'rd-bar-fill');
      fill.style.background = COLORS[m];
      bar.appendChild(fill);
      const val = h('span', 'rd-val', '0.00');
      li.append(sw, h('span', 'rd-name', nameOf(m, view.mode)), bar, val);
      const on = () => setFocus(m);
      const off = () => setFocus(null);
      li.addEventListener('mouseenter', on);
      li.addEventListener('mouseleave', off);
      li.addEventListener('focus', on);
      li.addEventListener('blur', off);
      legend.appendChild(li);
      meanEls[m] = { fill, val };
    });
  }
  function paintMeans() {
    Object.entries(meanEls).forEach(([m, { fill, val }]) => {
      const mean = cur[m].reduce((a, b) => a + b, 0) / N;
      fill.style.width = `${(mean * 100).toFixed(1)}%`;
      val.textContent = mean.toFixed(2);
    });
  }
  function setFocus(m) {
    Object.entries(shapes).forEach(([k, { g }]) => g.classList.toggle('rd-dim', !!m && k !== m));
  }

  const fmt = (v) => (v >= 10 ? v.toFixed(2) : v.toFixed(3));
  function paintSpoke() {
    const view = viewNow();
    const i = spokeNow();
    spokeEls.forEach(({ line, label }, k) => {
      line.classList.toggle('rd-spoke-on', k === i);
      label.classList.toggle('rd-label-on', k === i);
    });
    Object.values(shapes).forEach(({ dots }) => dots.forEach((d, k) => d.classList.toggle('rd-dot-on', k === i)));
    paintPill();

    const sp = SPOKES[i];
    const spec = DATA[sp.task];
    detail.textContent = '';
    const top = h('div', 'rd-dhead');
    const isLead = i === view.lead;
    const tag = h('span', 'rd-tag', 'Largest lead');
    tag.style.visibility = isLead ? 'visible' : 'hidden';
    top.append(h('span', 'rd-dtask', TASKS[sp.ti][L === LAYOUTS.tall ? 2 : 1]), h('span', 'rd-dds', sp.ds), tag);
    detail.appendChild(top);

    // One line on how far UniT is ahead of (or behind) the best other model.
    const rivals = view.models.filter((m) => m !== 'UniT').sort((a, b) => view.score[b][i] - view.score[a][i]);
    const gap = view.score.UniT[i] - view.score[rivals[0]][i];
    const even = Math.abs(gap) < 0.005;
    const lede = h('p', `rd-lede ${gap >= 0 ? 'rd-up' : 'rd-down'}`);
    lede.append(
      h('strong', '', even ? 'Even' : `${gap >= 0 ? '+' : '−'}${Math.abs(gap).toFixed(2)}`),
      document.createTextNode(even ? ` UniT level with ${rivals[0]}` : gap >= 0 ? ` UniT ahead of ${rivals[0]}` : ` UniT behind ${rivals[0]}`),
    );
    detail.appendChild(lede);

    const table = h('table', 'rd-table');
    const cols = h('colgroup');
    ['rd-c-name', 'rd-c-num', 'rd-c-num', 'rd-c-num', 'rd-c-score'].forEach((c) => cols.appendChild(h('col', c)));
    table.appendChild(cols);
    const thead = h('thead');
    const tr0 = h('tr');
    tr0.appendChild(h('th', '', ''));
    const SHORT = { 'RPE trans.': 'RPE tr.', 'δ < 1.25': 'δ<1.25' };
    spec.metrics.forEach(([m, dir]) => {
      const th = h('th', '');
      th.title = m;
      th.appendChild(h('span', 'rd-th', `${SHORT[m] || m} ${dir === 'down' ? '↓' : '↑'}`));
      tr0.appendChild(th);
    });
    tr0.appendChild(h('th', '', 'Score'));
    thead.appendChild(tr0);
    table.appendChild(thead);
    const tb = h('tbody');
    const bestPer = spec.metrics.map(([, dir], mi) => {
      const vals = view.models.map((m) => view.raw[m][i][mi]);
      return dir === 'down' ? Math.min(...vals) : Math.max(...vals);
    });
    view.models.slice().sort((a, b) => view.score[b][i] - view.score[a][i]).forEach((m) => {
      const tr = h('tr', m === 'UniT' ? 'rd-tr-unit' : '');
      const th = h('th', '');
      const sw = h('span', 'rd-swatch');
      sw.style.background = COLORS[m];
      th.append(sw, h('span', 'rd-tname', nameOf(m, view.mode)));
      th.title = nameOf(m, view.mode);
      tr.appendChild(th);
      view.raw[m][i].forEach((v, mi) => tr.appendChild(h('td', v === bestPer[mi] ? 'rd-best' : '', fmt(v))));
      tr.appendChild(h('td', 'rd-score', view.score[m][i].toFixed(2)));
      tb.appendChild(tr);
    });
    table.appendChild(tb);
    const wrap = h('div', 'rd-table-wrap');
    wrap.appendChild(table);
    detail.appendChild(wrap);

    const foot = h('div', 'rd-dfoot');
    foot.appendChild(h('span', 'rd-hint', touch ? 'Tap a spoke for its numbers.' : 'Point at a spoke for its numbers.'));
    const open = h('button', 'rd-open', `${spec.table} in full →`);
    open.type = 'button';
    open.addEventListener('click', () => openTable(i));
    foot.appendChild(open);
    detail.appendChild(foot);
  }
  function setHover(i) {
    if (ui.hover === i) return;
    ui.hover = i;
    paintSpoke();
  }

  const TAB_OF = { reconstruction: 'tab-a', pose: 'tab-b', videoDepth: 'tab-c', monoDepth: 'tab-d' };
  function openTable(i) {
    const sp = SPOKES[i];
    const tab = document.getElementById(TAB_OF[sp.task]);
    tab?.click();
    const ci = DATA[sp.task].conditions.findIndex((c) => c.label === SCALES[ui.scale]);
    window.UNIT_CHARTS?.[sp.task]?.show(ci, sp.di);
    tab?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
  }

  // Lock the side column to the tallest of the four views, so neither a
  // hover nor a view switch can change the card's size.
  function lockSide() {
    side.style.minHeight = '';
    head.style.minHeight = '';
    const keep = { scale: ui.scale, mode: ui.mode, pinned: ui.pinned, hover: ui.hover };
    const wide = L === LAYOUTS.wide;
    if (wide) side.classList.add('rd-measure');
    let max = 0;
    let maxHead = 0;
    SCALES.forEach((_, si) => MODES.forEach((__, mi) => {
      ui.scale = si;
      ui.mode = mi;
      ui.hover = -1;
      const v = viewNow();
      ui.pinned = v.lead;
      headline(v);
      maxHead = Math.max(maxHead, head.getBoundingClientRect().height);
      if (wide) {
        buildLegend(v);
        paintSpoke();
        max = Math.max(max, side.getBoundingClientRect().height);
      }
    }));
    side.classList.remove('rd-measure');
    Object.assign(ui, keep);
    headline(viewNow());
    buildLegend(viewNow());
    paintMeans();
    paintSpoke();
    head.style.minHeight = `${Math.ceil(maxHead)}px`;
    if (wide) side.style.minHeight = `${Math.ceil(max)}px`;
  }

  let shown = false;
  function update(first) {
    const view = viewNow();
    ui.pinned = view.lead;
    buildLegend(view);
    headline(view);
    if (shown || reduced) animateTo(view, first);
    paintSpoke();
  }

  // ---------- responsive + reveal ----------
  const pickLayout = () => (host.clientWidth < 760 ? LAYOUTS.tall : LAYOUTS.wide);
  const applyLayout = () => {
    L = pickLayout();
    host.dataset.layout = L === LAYOUTS.tall ? 'tall' : 'wide';
    buildSvg();
  };
  applyLayout();
  update(true);
  lockSide();
  let lastWidth = host.clientWidth;
  new ResizeObserver(() => {
    const w = host.clientWidth;
    if (w === lastWidth) return;
    lastWidth = w;
    if (pickLayout() !== L) {
      applyLayout();
      headline(viewNow());
    }
    lockSide();
  }).observe(host);

  if (reduced) return;
  const io = new IntersectionObserver((entries) => {
    if (!entries.some((e) => e.isIntersecting)) return;
    io.disconnect();
    shown = true;
    animateTo(viewNow(), true);
  }, { threshold: 0.35 });
  io.observe(stage);
})();
