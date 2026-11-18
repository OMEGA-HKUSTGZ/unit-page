// Key insights: the paper's three challenges and the modal-attention plug-in.
// Each chapter's motivation exhibit is in index.html (the paradigm matrix of
// Fig. 2 and the curves of Figs. 6 and 8 are drawn here); this script fills the evidence panel beside it, and
// the training-data strip in the Method section. Reads
// assets/js/analysis-data.js (Tables 1, 11, 13, Figs. 2 and 12, bottom),
// assets/js/results-data.js (Tables 3-9) and assets/js/longhorizon-data.js
// (Fig. 11).
// Every block has a fixed size; values enter once, when a chapter first
// scrolls into view, and only transforms and opacity animate.
(() => {
  const A = window.UNIT_ANALYSIS;
  const R = window.UNIT_RESULTS;
  const MC = window.UNIT_COLORS || {};
  if (!A) return;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const C = { si: '#6f86a6', ms: '#8a5f5c', base: '#c4bbb3' };
  const TYPE_COLORS = { Indoor: '#8a5f5c', Outdoor: '#6f86a6', Mixed: '#c9965a', Object: '#7f9a83', Human: '#8f7fa8' };

  const h = (tag, cls, txt) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (txt !== undefined) n.textContent = txt;
    return n;
  };
  const NS = 'http://www.w3.org/2000/svg';
  const s = (tag, attrs, parent) => {
    const n = document.createElementNS(NS, tag);
    Object.entries(attrs || {}).forEach(([k, v]) => n.setAttribute(k, v));
    if (parent) parent.appendChild(n);
    return n;
  };
  const f3 = (v) => v.toFixed(3);
  const pct = (a, b) => Math.round(((b - a) / a) * 100);
  const ord = (n) => `${n}${['th', 'st', 'nd', 'rd'][n % 10 > 3 || Math.floor(n / 10) === 1 ? 0 : n % 10]}`;

  // The four sparse-depth patterns of Table 9, drawn as the samples a model
  // would receive: light points on a dark depth image.
  const DC_PATTERNS = {
    Uniform: ['Uniform', 'random points'],
    LiDAR: ['LiDAR', 'scan lines'],
    SfM: ['SfM', 'feature points'],
    Grid: ['Grid', 'regular lattice'],
  };
  function sparseIcon(kind) {
    const W = 96;
    const H = 60;
    const svg = s('svg', { class: 'dc-i', viewBox: `0 0 ${W} ${H}`, 'aria-hidden': 'true' });
    let seed = 7;
    const rnd = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    const pts = [];
    if (kind === 'Uniform') {
      for (let i = 0; i < 46; i += 1) pts.push([6 + rnd() * (W - 12), 6 + rnd() * (H - 12)]);
    } else if (kind === 'LiDAR') {
      // Beams fan out from the sensor: rows bend and spread towards the bottom.
      [14, 23, 33, 45].forEach((y, r) => {
        for (let i = 0; i <= 22; i += 1) {
          const u = i / 22;
          pts.push([5 + u * (W - 10), y + (r + 1) * 1.6 * (u - 0.5) ** 2 * 4]);
        }
      });
    } else if (kind === 'SfM') {
      // Features cluster on textured structure and leave flat regions empty.
      [[22, 18, 9, 13], [66, 26, 12, 15], [40, 44, 8, 9], [80, 46, 6, 6]].forEach(([cx, cy, r, n]) => {
        for (let i = 0; i < n; i += 1) {
          const a = rnd() * Math.PI * 2;
          const d = Math.sqrt(rnd()) * r;
          pts.push([cx + Math.cos(a) * d * 1.3, cy + Math.sin(a) * d]);
        }
      });
    } else {
      for (let y = 0; y < 5; y += 1) for (let x = 0; x < 8; x += 1) pts.push([9 + x * 11.2, 8 + y * 11]);
    }
    pts.forEach(([x, y]) => s('circle', { cx: x.toFixed(1), cy: y.toFixed(1), r: 1.5, style: `--d:${(y / H).toFixed(2)}` }, svg));
    return svg;
  }

  // One evidence block inside a chapter's panel: a title, a source and a body.
  function block(parent, { title, src, note }) {
    const b = h('section', 'an-b');
    const head = h('header', 'an-bh');
    head.append(h('h4', 'an-bt', title), h('span', 'an-src', src));
    const body = h('div', 'an-bb');
    b.append(head, body);
    if (note) b.appendChild(h('p', 'an-note', note));
    parent.appendChild(b);
    return body;
  }
  const legend = (items, cls = '') => {
    const ul = h('ul', `an-legend ${cls}`);
    items.forEach(([label, color, kind]) => {
      const li = h('li');
      const sw = h('span', `an-sw${kind ? ` an-sw-${kind}` : ''}`);
      sw.style.setProperty('--c', color);
      li.append(sw, h('span', '', label));
      ul.appendChild(li);
    });
    return ul;
  };

  // A line chart drawn at its real pixel width, with a shared hover read-out.
  function lineChart(parent, { x, series, colors, yLo, yHi, yTicks, xLabel, mark, ends, H = 200, fmt = (v) => `${f3(v)} m`, tick = (t) => t.toFixed(3).replace(/0+$/, '').replace(/\.$/, ''), xTick = (v) => v, dots = true }) {
    const svgWrap = h('div', 'an-plot');
    svgWrap.style.height = `${H}px`;
    const svg = s('svg', { class: 'an-svg', role: 'img', tabindex: '0', 'aria-label': `${xLabel}: ${Object.entries(series).map(([k, v]) => `${k} from ${fmt(v[0])} to ${fmt(v[v.length - 1])}`).join('; ')}` });
    const tip = h('div', 'an-tip');
    const tipHead = h('div', 'an-tip-head');
    tip.appendChild(tipHead);
    const tipVals = Object.keys(series).map((k) => {
      const r = h('div', 'an-tip-row');
      const sw = h('span', 'an-sw');
      sw.style.setProperty('--c', colors[k]);
      const v = h('span', 'an-tip-v');
      r.append(sw, h('span', '', k), v);
      tip.appendChild(r);
      return v;
    });
    svgWrap.append(svg, tip);
    parent.append(legend(Object.keys(series).map((k) => [k, colors[k]])), svgWrap);

    const M = { l: 42, r: 16, t: 14, b: 36 };
    let W = 0;
    let geo = null;
    let hover = -1;
    let drawn = false;
    let pending = null;
    function setHover(i) {
      hover = i;
      svgWrap.classList.toggle('is-hover', i >= 0);
      if (!geo || i < 0) return;
      const px = geo.xs(i);
      geo.guide.setAttribute('x1', px);
      geo.guide.setAttribute('x2', px);
      Object.keys(series).forEach((k, j) => {
        const v = series[k][i];
        geo.dots[k].setAttribute('visibility', v === undefined ? 'hidden' : 'visible');
        tipVals[j].textContent = v === undefined ? 'out of memory' : fmt(v);
        if (v === undefined) return;
        geo.dots[k].setAttribute('cx', px);
        geo.dots[k].setAttribute('cy', geo.ys(v));
      });
      tipHead.textContent = `${xLabel.split(' (')[0]} = ${xTick(x[i])}`;
      const right = px < W / 2;
      tip.style.left = right ? `${px + 12}px` : '';
      tip.style.right = right ? '' : `${W - px + 12}px`;
    }
    function draw(animate) {
      svg.replaceChildren();
      svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
      svg.setAttribute('width', W);
      svg.setAttribute('height', H);
      const x0 = M.l;
      const x1 = W - M.r;
      const y0 = H - M.b;
      const y1 = M.t;
      const xs = (i) => x0 + (i / (x.length - 1)) * (x1 - x0);
      const ys = (v) => y0 - ((v - yLo) / (yHi - yLo)) * (y0 - y1);
      yTicks.forEach((t) => {
        s('line', { class: 'an-gridline', x1: x0, x2: x1, y1: ys(t), y2: ys(t) }, svg);
        const tl = s('text', { class: 'an-ytick', x: x0 - 8, y: ys(t) + 4 }, svg);
        tl.textContent = tick(t);
      });
      x.forEach((v, i) => {
        if ((W < 380 || x.length > 12) && i % 2 === 1 && i !== x.length - 1) return;
        if (W < 380 && x.length > 12 && i % 4 !== 0) return;
        const tl = s('text', { class: 'an-xtick', x: xs(i), y: y0 + 17 }, svg);
        tl.textContent = xTick(v);
      });
      const xl = s('text', { class: 'an-xlabel', x: (x0 + x1) / 2, y: y0 + 33 }, svg);
      xl.textContent = xLabel;
      if (mark) {
        const mx = xs(mark.index);
        s('line', { class: 'an-mark', x1: mx, x2: mx, y1, y2: y0 }, svg);
        const mt = s('text', { class: 'an-mark-t', x: mx + 6, y: y1 + 14 }, svg);
        mt.textContent = mark.label;
      }
      const paths = [];
      const pts = [];
      Object.entries(series).forEach(([k, vals]) => {
        const g = s('g', { class: 'an-series', style: `--c:${colors[k]}` }, svg);
        paths.push(s('path', { class: 'an-path', d: `M${vals.map((v, i) => `${xs(i)},${ys(v)}`).join(' L')}` }, g));
        if (dots) vals.forEach((v, i) => pts.push(s('circle', { class: 'an-pt', cx: xs(i), cy: ys(v), r: 2.8 }, g)));
        if (vals.length < x.length) {
          const o = s('g', { class: 'an-oom', transform: `translate(${xs(vals.length - 1)},${ys(vals[vals.length - 1])})` }, g);
          s('path', { d: 'M-5,-5 L5,5 M5,-5 L-5,5' }, o);
          const ot = s('text', { x: 9, y: -8 }, o);
          ot.textContent = 'out of memory';
        }
      });
      if (ends) {
        ends.forEach(({ index, label }) => {
          const ex = xs(index);
          const ey = ys(Math.max(...Object.values(series).map((v) => v[index]).filter((v) => v !== undefined))) - 12;
          const et = s('text', { class: `an-end${index === 0 ? '' : ' an-end-r'}`, x: index === 0 ? ex - 4 : ex + 4, y: ey }, svg);
          et.textContent = label;
        });
      }
      const guide = s('line', { class: 'an-guide', y1, y2: y0 }, svg);
      const hdots = {};
      Object.keys(series).forEach((k) => {
        hdots[k] = s('circle', { class: 'an-hdot', r: 4.2, stroke: colors[k] }, svg);
      });
      const hit = s('rect', { class: 'an-hit', x: x0 - 8, y: y1, width: x1 - x0 + 16, height: y0 - y1 }, svg);
      const idx = (clientX) => {
        const r = svg.getBoundingClientRect();
        const px = ((clientX - r.left) / r.width) * W;
        return Math.max(0, Math.min(x.length - 1, Math.round(((px - x0) / (x1 - x0)) * (x.length - 1))));
      };
      hit.addEventListener('pointermove', (e) => setHover(idx(e.clientX)));
      hit.addEventListener('pointerleave', () => setHover(-1));
      geo = { xs, ys, guide, dots: hdots };
      if (animate && !reduced) {
        paths.forEach((p) => {
          const len = p.getTotalLength();
          p.style.strokeDasharray = len;
          p.style.strokeDashoffset = len;
        });
        svg.classList.add('an-pre-draw');
      }
      if (hover >= 0) setHover(hover);
      return paths;
    }
    const measure = () => {
      const w = Math.round(svgWrap.clientWidth);
      if (!w || w === W) return;
      W = w;
      pending = draw(!drawn);
      if (drawn) pending = null;
    };
    new ResizeObserver(measure).observe(svgWrap);
    svg.addEventListener('keydown', (e) => {
      const step = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
      if (!step) return;
      e.preventDefault();
      setHover(Math.max(0, Math.min(x.length - 1, (hover < 0 ? (step > 0 ? -1 : x.length) : hover) + step)));
    });
    svg.addEventListener('blur', () => setHover(-1));
    return () => {
      measure();
      drawn = true;
      if (!pending) return;
      const paths = pending;
      pending = null;
      void svg.getBoundingClientRect();
      svg.classList.remove('an-pre-draw');
      svg.classList.add('an-draw');
      paths.forEach((p) => { p.style.strokeDashoffset = '0'; });
      setTimeout(() => {
        svg.classList.remove('an-draw');
        paths.forEach((p) => { p.style.strokeDasharray = ''; p.style.strokeDashoffset = ''; });
      }, 1600);
    };
  }

  // Horizontal bars on a shared zero-based axis: label | bars | values.
  function barRows(parent, { max, ticks, unit, rows, keys }) {
    const wrap = h('div', 'an-bars');
    const x = (v) => Math.max(0, v) / max;
    const axis = h('div', 'an-baxis');
    ticks.forEach((t) => {
      const tk = h('span', 'an-btick', t === 0 ? '0' : t.toFixed(3).replace(/0+$/, '').replace(/\.$/, ''));
      tk.style.setProperty('--x', x(t));
      axis.appendChild(tk);
    });
    rows.forEach((r, i) => {
      const row = h('div', `an-brow${r.ours ? ' is-ours' : ''}`);
      row.style.setProperty('--i', i);
      const lab = h('span', 'an-blabel', r.label);
      lab.title = r.label;
      const track = h('span', 'an-btrack');
      ticks.forEach((t) => {
        const g = h('span', 'an-bgl');
        g.style.setProperty('--x', x(t));
        track.appendChild(g);
      });
      const vals = h('span', 'an-bvals');
      r.bars.forEach((b, j) => {
        const bar = h('span', 'an-bar');
        bar.style.setProperty('--f', x(b));
        bar.style.setProperty('--c', keys[j].color);
        bar.style.setProperty('--j', j);
        track.appendChild(bar);
        vals.appendChild(h('span', 'an-bval', unit(b, j, r)));
      });
      if (r.tag) row.appendChild(h('span', `an-btag${r.tagCls ? ` ${r.tagCls}` : ''}`, r.tag));
      row.prepend(lab, track, vals);
      wrap.appendChild(row);
    });
    wrap.appendChild(axis);
    wrap.style.setProperty('--nb', rows[0].bars.length);
    wrap.classList.toggle('has-tag', rows.some((r) => r.tag));
    parent.append(legend(keys.map((k) => [k.label, k.color, 'sq'])), wrap);
  }

  const reveals = new Map();
  const onReveal = (key, fn) => {
    if (!reveals.has(key)) reveals.set(key, []);
    reveals.get(key).push(fn);
  };
  const ev = (key) => {
    const host = document.querySelector(`[data-an="${key}"]`);
    if (!host) return null;
    const panel = h('div', 'an-panel');
    host.appendChild(panel);
    return panel;
  };

  // 01 View configurations: group size (Fig. 12, bottom) and unified against
  // specialized models (Table 13).
  {
    const P = ev('views');
    const G = A.group;
    if (P) {
      const body = block(P, { title: 'Bigger groups, lower pose error', src: G.figure, note: 'ScanNetV2 · 90 frames · pose ATE (m)' });
      onReveal('views', lineChart(body, {
        x: G.x, series: G.series, colors: { 'Scale-invariant': C.si, 'Metric scale': C.ms },
        yLo: 0.028, yHi: 0.048, yTicks: [0.03, 0.035, 0.04, 0.045], xLabel: G.xLabel, H: 230,
        ends: [{ index: 0, label: 'online' }, { index: G.x.length - 1, label: 'offline' }],
      }));

      const U = A.unified;
      const [sp, un] = U.rows;
      const ub = block(P, { title: 'One model against three specialists', src: U.table, note: '7-Scenes, NRGBD, DTU · (Acc. + Comp.) / 2, lower is better' });
      barRows(ub, {
        max: 0.2,
        ticks: [0, 0.05, 0.1, 0.15, 0.2],
        keys: [{ label: 'Specialized model', color: C.base }, { label: 'Unified UniT', color: C.ms }],
        unit: (v) => f3(v),
        rows: U.columns.map((c, j) => {
          const d = pct(sp.values[j], un.values[j]);
          return {
            label: `${c[0]} · ${c[1].replace('Scale-invariant', 'scale-inv.').replace('Metric scale', 'metric')}`,
            bars: [sp.values[j], un.values[j]],
            tag: d === 0 ? '±0%' : `${d > 0 ? '+' : '−'}${Math.abs(d)}%`,
          };
        }),
      });
    }
  }

  // Plug-in, auxiliary modalities: Table 8 as an UpSet-style matrix, then depth
  // completion (Table 9).
  {
    const P = ev('modality');
    if (P && R) {
      const MM = R.multiModal;
      const methods = ['UniT', 'MapAnything', 'DepthAnything3'];
      const inputs = [['K', 'Intrinsics'], ['RT', 'Extrinsics'], ['D', 'Depth']];
      const short = { K: 'K', RT: 'R|T', D: 'D' };
      const combos = MM.conditions.map((c) => {
        const ranks = Object.fromEntries(c.groups[0].rows.map((r) => [r.method, r.rank]));
        const has = c.label.split('+');
        const best = Math.min(...Object.values(ranks));
        return { label: c.label, has, ranks, win: ranks.UniT === best };
      });
      const body = block(P, { title: 'Every input combination', src: MM.table, note: 'Average rank over nine metrics, metric scale. Shaded columns: UniT leads.' });
      body.appendChild(legend(methods.map((m) => [m, MC[m] || '#999', 'dot'])));
      const up = h('div', 'an-up');
      up.style.setProperty('--n', combos.length);
      const yl = h('div', 'an-up-y');
      [1, 2, 3].forEach((r) => {
        const t = h('span', 'an-up-yt', String(r));
        t.style.setProperty('--r', (r - 1) / 2);
        yl.appendChild(t);
      });
      yl.appendChild(h('span', 'an-up-yname', 'avg. rank'));
      up.appendChild(yl);
      const guides = h('div', 'an-up-guides');
      [0, 0.5, 1].forEach((r) => {
        const g = h('span', 'an-up-gl');
        g.style.setProperty('--r', r);
        guides.appendChild(g);
      });
      up.appendChild(guides);
      inputs.forEach(([k, name], i) => {
        const lab = h('span', 'an-up-in');
        lab.style.gridRow = String(i + 2);
        lab.append(h('strong', '', short[k]), h('span', '', name));
        up.appendChild(lab);
      });
      const tip = h('div', 'an-up-tip');
      const tipHead = h('div', 'an-tip-head');
      const tipRows = methods.map(() => {
        const r = h('div', 'an-tip-row');
        const sw = h('span', 'an-sw an-sw-dot');
        const n = h('span');
        const v = h('span', 'an-tip-v');
        r.append(sw, n, v);
        tip.appendChild(r);
        return { sw, n, v };
      });
      tip.prepend(tipHead);
      combos.forEach((c, ci) => {
        const col = h('div', `an-up-col${c.win ? ' is-win' : ''}`);
        col.style.gridColumn = String(ci + 2);
        col.style.setProperty('--ci', ci);
        col.tabIndex = 0;
        col.setAttribute('role', 'img');
        col.setAttribute('aria-label', `Inputs ${c.has.map((k) => short[k]).join(' + ')}: ${methods.map((m) => `${m} rank ${c.ranks[m]}`).join(', ')}`);
        const plot = h('div', 'an-up-plot');
        [...methods].reverse().forEach((m) => {
          const d = h('span', `an-up-dot${m === 'UniT' ? ' is-unit' : ''}`);
          d.style.setProperty('--r', (c.ranks[m] - 1) / 2);
          d.style.setProperty('--c', MC[m] || '#999');
          plot.appendChild(d);
        });
        const u = c.ranks.UniT;
        const crowded = methods.some((m) => m !== 'UniT' && c.ranks[m] < u && u - c.ranks[m] < 0.45);
        const val = h('span', `an-up-v${crowded || u < 1.3 ? ' is-below' : ''}`, u.toFixed(2));
        val.style.setProperty('--r', (c.ranks.UniT - 1) / 2);
        plot.appendChild(val);
        const mat = h('div', 'an-up-mat');
        const idxs = inputs.map(([k], i) => (c.has.includes(k) ? i : -1)).filter((i) => i >= 0);
        const link = h('span', 'an-up-link');
        link.style.setProperty('--a', Math.min(...idxs));
        link.style.setProperty('--b', Math.max(...idxs));
        mat.appendChild(link);
        inputs.forEach(([k], i) => {
          const d = h('span', `an-up-cell${c.has.includes(k) ? ' is-on' : ''}`);
          d.style.setProperty('--row', i);
          mat.appendChild(d);
        });
        col.append(plot, mat);
        const show = () => {
          up.classList.add('is-hover');
          col.classList.add('is-hl');
          tipHead.textContent = c.has.map((k) => short[k]).join(' + ');
          [...methods].sort((a, b) => c.ranks[a] - c.ranks[b]).forEach((m, j) => {
            tipRows[j].sw.style.setProperty('--c', MC[m] || '#999');
            tipRows[j].n.textContent = m;
            tipRows[j].v.textContent = c.ranks[m].toFixed(2);
          });
          const tw = tip.offsetWidth;
          const right = ci < combos.length / 2;
          const left = right ? col.offsetLeft + col.offsetWidth + 4 : col.offsetLeft - tw - 4;
          tip.style.transform = `translateX(${Math.max(0, Math.min(up.clientWidth - tw, left))}px)`;
        };
        const hide = () => {
          up.classList.remove('is-hover');
          col.classList.remove('is-hl');
        };
        col.addEventListener('pointerenter', show);
        col.addEventListener('pointerleave', hide);
        col.addEventListener('focus', show);
        col.addEventListener('blur', hide);
        up.appendChild(col);
      });
      up.appendChild(tip);
      body.appendChild(up);

      // Table 9: UniT's place for each sparse-depth pattern.
      const DC = R.depthCompletion;
      const db = block(P, { title: 'Sparse depth in, dense depth out', src: DC.table, note: 'Sintel, KITTI, NYUv2 · average rank among three methods, 1 is best' });
      const quad = h('div', 'dc');
      DC.conditions.forEach((c, i) => {
        const rows = [...c.groups[0].rows].sort((p, q) => p.rank - q.rank);
        const place = 1 + rows.findIndex((r) => r.method === 'UniT');
        const unit = rows.find((r) => r.method === 'UniT');
        const [name, what] = DC_PATTERNS[c.label] || [c.label, ''];
        const cell = h('div', `dc-c${place === 1 ? ' is-first' : ''}`);
        cell.style.setProperty('--k', i);
        cell.title = rows.map((r) => `${r.method} ${r.rank.toFixed(2)}`).join(' · ');
        const txt = h('p', 'dc-t');
        txt.append(h('strong', '', name), h('span', '', what));
        const res = h('p', 'dc-r');
        res.append(h('strong', '', ord(place)), h('span', '', `avg. rank ${unit.rank.toFixed(2)}`));
        cell.append(sparseIcon(c.label), txt, res);
        quad.appendChild(cell);
      });
      db.appendChild(quad);
    }
  }

  // 03 Metric scale: rank matrix from Tables 3-6, then the loss ablation.
  {
    const P = ev('metric');
    if (P && R) {
      const tasks = [['reconstruction', 'Multi-view reconstruction'], ['pose', 'Camera pose'], ['videoDepth', 'Video depth'], ['monoDepth', 'Monocular depth']];
      const place = (rows) => {
        const u = rows.find((r) => r.method === 'UniT');
        const others = rows.filter((r) => r.method !== 'UniT');
        const better = others.filter((r) => r.rank < u.rank).length;
        const tie = others.some((r) => r.rank === u.rank);
        const next = [...others].sort((a, b) => a.rank - b.rank)[0];
        return { n: better + 1, tie, of: rows.length, u: u.rank, next };
      };
      // Table 11: loss.
      const L = A.loss;
      const a = L.rows[0].values;
      const c = L.rows[2].values;
      const order = [3, 1, 0, 2];
      const lb = block(P, { title: 'Against direct metric regression', src: L.table, note: '7-Scenes, NRGBD, DTU · (Acc. + Comp.) / 2, lower is better' });
      barRows(lb, {
        max: 0.45,
        ticks: [0, 0.1, 0.2, 0.3, 0.4],
        keys: [{ label: 'Direct metric regression', color: C.base }, { label: 'UniT loss', color: C.ms }],
        unit: (v) => f3(v),
        rows: order.map((j) => ({
          label: `${L.columns[j][0]} · ${L.columns[j][1].replace('Scale-invariant', 'scale-inv.').replace('Metric scale', 'metric')}`,
          bars: [a[j], c[j]],
          ours: j % 2 === 1,
          tag: `${pct(a[j], c[j]) > 0 ? '+' : '−'}${Math.abs(pct(a[j], c[j]))}%`,
          tagCls: pct(a[j], c[j]) <= -30 ? 'is-big' : '',
        })),
      });
      const body = block(P, { title: 'UniT’s place in every setting', src: 'Tables 3–6', note: 'Place by the paper’s average rank over nine metrics.' });
      const rm = h('div', 'an-rm');
      const hd1 = h('div', 'an-rm-row an-rm-h1');
      hd1.append(h('span', ''), h('span', 'an-rm-g is-metric', 'Metric scale'), h('span', 'an-rm-g', 'Scale-invariant'));
      const hd2 = h('div', 'an-rm-row an-rm-h2');
      hd2.append(h('span', ''));
      ['Offline', 'Online', 'Offline', 'Online'].forEach((t) => hd2.appendChild(h('span', 'an-rm-sub', t)));
      rm.append(hd1, hd2);
      let k = 0;
      const tally = { metric: [0, 0], si: [0, 0] };
      tasks.forEach(([key, name]) => {
        const T = R[key];
        const row = h('div', 'an-rm-row');
        row.appendChild(h('span', 'an-rm-task', name));
        [...T.conditions].sort((p, q) => Number(q.label.startsWith('Metric')) - Number(p.label.startsWith('Metric'))).forEach((cond) => {
          const scale = cond.label.startsWith('Metric') ? 'metric' : 'si';
          cond.groups.forEach((g) => {
            const p = place(g.rows);
            tally[scale][0] += p.n === 1 && !p.tie ? 1 : 0;
            tally[scale][1] += 1;
            const cell = h('span', `an-rm-cell${p.n === 1 && !p.tie ? ' is-first' : ''}${scale === 'metric' ? ' is-metric' : ''}${cond.groups.length === 1 ? ' is-span' : ''}`);
            cell.style.setProperty('--k', k++);
            cell.append(h('strong', '', `${p.tie ? '=' : ''}${ord(p.n)}`), h('span', '', `of ${p.of}`));
            cell.title = `${name}, ${cond.label}${g.label ? `, ${g.label}` : ''}: UniT ${p.u.toFixed(2)}, ${p.next.method} ${p.next.rank.toFixed(2)}`;
            row.appendChild(cell);
          });
        });
        rm.appendChild(row);
      });
      const foot = h('div', 'an-rm-row an-rm-foot');
      foot.append(h('span', 'an-rm-task', 'First place'), h('span', 'an-rm-tally is-metric', `${tally.metric[0]} of ${tally.metric[1]}`), h('span', 'an-rm-tally', `${tally.si[0]} of ${tally.si[1]}`));
      rm.appendChild(foot);
      body.appendChild(rm);
    }
  }

  // 02 Streaming memory: KITTI-Odometry (Table 7) and sequence length on NRGBD
  // (Fig. 11).
  {
    const P = ev('horizon');
    if (P) {
      const K = R && R.kitti;
      if (K) {
        const row = (m) => K.rows.find((r) => r.method === m);
        const pairs = [
          ['vs. TTT3R', row('TTT3R'), row('UniT')],
          ['vs. VGGT-Long', row('VGGT-Long'), row('UniT-Long')],
        ];
        const kb = block(P, { title: 'Kilometre-scale driving', src: K.table, note: `KITTI-Odometry · mean ATE (m) over ${K.sequences.length} sequences, lower is better` });
        barRows(kb, {
          max: 200,
          ticks: [0, 50, 100, 150, 200],
          keys: [{ label: 'Baseline', color: C.base }, { label: 'UniT', color: C.ms }],
          unit: (v) => v.toFixed(1),
          rows: pairs.map(([label, b, u]) => ({ label, bars: [b.avg, u.avg], tag: `−${Math.abs(pct(b.avg, u.avg))}%`, tagCls: 'is-big' })),
        });
        // Every sequence at a glance: filled where UniT has the lower error.
        const ks = h('div', 'ks');
        const kh = h('div', 'ks-row ks-head');
        kh.appendChild(h('span', 'ks-l', 'Sequence, vs.'));
        K.sequences.forEach((q) => kh.appendChild(h('span', 'ks-id', q.id)));
        kh.appendChild(h('span', 'ks-n', 'UniT wins'));
        ks.appendChild(kh);
        pairs.forEach(([label, b, u]) => {
          const r = h('div', 'ks-row');
          r.appendChild(h('span', 'ks-l', b.method));
          let wins = 0;
          K.sequences.forEach((q, i) => {
            const win = u.values[i] < b.values[i];
            wins += win ? 1 : 0;
            const c = h('span', `ks-c${win ? ' is-win' : ''}`);
            c.style.setProperty('--k', i);
            c.title = `Sequence ${q.id}, ${q.frames.toLocaleString('en-US')} frames, ${q.km} km: UniT ${u.values[i].toFixed(1)} m, ${b.method} ${b.values[i].toFixed(1)} m`;
            c.setAttribute('role', 'img');
            c.setAttribute('aria-label', c.title);
            r.appendChild(c);
          });
          r.appendChild(h('span', 'ks-n', `${wins} / ${K.sequences.length}`));
          ks.appendChild(r);
        });
        kb.appendChild(ks);
      }
      const LH = window.UNIT_LONGHORIZON;
      if (LH) {
        const ser = LH.metrics[0].series;
        const lb = block(P, { title: 'Stable out to 500 frames', src: 'Fig. 11', note: 'NRGBD · metric scale · pose ATE (m)' });
        onReveal('horizon', lineChart(lb, {
          x: LH.views,
          series: { UniT: ser.UniT, CUT3R: ser.CUT3R, DepthAnything3: ser.DepthAnything3 },
          colors: { UniT: MC.UniT, CUT3R: MC.CUT3R, DepthAnything3: MC.DepthAnything3 },
          yLo: 0, yHi: 0.8, yTicks: [0, 0.2, 0.4, 0.6, 0.8], xLabel: 'sequence length (frames)', H: 210,
        }));
      }
    }
  }

  // Motivation exhibits of chapters 02 and 03, redrawn from the paper's Fig. 6c
  // and Fig. 8 (curves traced from the figures).
  {
    const at = document.querySelector('[data-attn]');
    const Fa = A.attention;
    if (at && Fa) {
      onReveal('horizon', lineChart(at, {
        x: Fa.x, series: Fa.series, colors: { StreamVGGT: '#9a948f', UniT: MC.UniT },
        yLo: 0, yHi: 20, yTicks: [0, 5, 10, 15, 20], xLabel: 'query frame', H: 190,
        fmt: (v) => `${v.toFixed(1)}%`, tick: (t) => `${t}%`, dots: false,
      }));
    }
    const lc = document.querySelector('[data-losscurve]');
    const Fl = A.lossCurve;
    if (lc && Fl) {
      onReveal('metric', lineChart(lc, {
        x: Fl.x, series: Fl.series, colors: { 'Scale-invariant': C.si, 'Metric scale': C.ms },
        yLo: 0, yHi: 1, yTicks: [0, 0.25, 0.5, 0.75, 1], xLabel: 'training step', H: 200,
        fmt: (v) => v.toFixed(2), tick: (t) => String(t), xTick: (v) => (v ? `${v / 1000}k` : '0'), dots: false,
      }));
    }
  }

  // Fig. 2 as a matrix: which capabilities each formulation covers.
  {
    const host = document.querySelector('[data-paradigms]');
    const Pd = A.paradigms;
    if (host && Pd) {
      const t = h('table', 'pm');
      const hr = h('tr');
      hr.appendChild(h('th', 'pm-m', ''));
      Pd.capabilities.forEach((c) => hr.appendChild(h('th', '', c)));
      const thead = h('thead');
      thead.appendChild(hr);
      const tb = h('tbody');
      Pd.rows.forEach((r) => {
        const tr = h('tr', r.ours ? 'is-ours' : '');
        const th = h('th', 'pm-m');
        th.scope = 'row';
        th.append(h('strong', '', r.name), h('span', '', r.how));
        tr.appendChild(th);
        r.has.forEach((on, j) => {
          const td = h('td', on ? 'is-on' : '');
          const mk = h('span', 'pm-mark', on ? '✓' : '×');
          mk.setAttribute('aria-label', `${Pd.capabilities[j]}: ${on ? 'yes' : 'no'}`);
          td.appendChild(mk);
          tr.appendChild(td);
        });
        tb.appendChild(tr);
      });
      t.append(thead, tb);
      host.appendChild(t);
    }
  }

  // Training data strip (Method section).
  {
    const host = document.querySelector('[data-training]');
    if (host && A.data) {
      const rows = A.data.rows;
      const scenes = rows.reduce((t, r) => t + r.scenes, 0);
      const real = rows.filter((r) => r.real).length;
      const dyn = rows.filter((r) => r.dynamic).length;
      const sum = host.querySelector('.td-sum');
      if (sum) sum.textContent = `${rows.length} datasets · ${scenes.toLocaleString('en-US')} scenes · ${real} real, ${rows.length - real} synthetic · ${dyn} dynamic. Width is the sampling ratio.`;
      const types = Object.keys(TYPE_COLORS);
      const heads = h('ul', 'an-legend td-types');
      const bar = h('div', 'td-mix');
      const chips = h('div', 'td-chips');
      types.forEach((t) => {
        const group = rows.filter((r) => r.type === t);
        const share = group.reduce((x, r) => x + r.ratio, 0);
        const li = h('li');
        const sw = h('span', 'an-sw an-sw-sq');
        sw.style.setProperty('--c', TYPE_COLORS[t]);
        li.append(sw, h('span', '', t), h('span', 'td-share', `${share.toFixed(1)}%`));
        heads.appendChild(li);
        group.forEach((r) => {
          const sg = h('span', `td-part${r.real ? '' : ' is-syn'}`);
          sg.style.flexGrow = r.ratio;
          sg.style.setProperty('--c', TYPE_COLORS[t]);
          sg.title = `${r.name}: ${r.ratio}% of samples, ${r.scenes.toLocaleString('en-US')} scenes, ${r.real ? 'real' : 'synthetic'}${r.dynamic ? ', dynamic' : ''}`;
          bar.appendChild(sg);
          const chip = h('span', `td-chip${r.real ? '' : ' is-syn'}`);
          chip.style.setProperty('--c', TYPE_COLORS[t]);
          chip.append(h('span', 'td-chip-sw'), h('span', '', r.name), h('span', 'td-chip-v', `${r.ratio.toFixed(1)}%`));
          chip.title = sg.title;
          chips.appendChild(chip);
          [sg, chip].forEach((el) => {
            el.addEventListener('pointerenter', () => { host.classList.add('is-hl'); sg.classList.add('is-hl'); chip.classList.add('is-hl'); });
            el.addEventListener('pointerleave', () => { host.classList.remove('is-hl'); sg.classList.remove('is-hl'); chip.classList.remove('is-hl'); });
          });
        });
      });
      const key = h('ul', 'an-legend td-key');
      [['', 'real'], ['is-syn', 'synthetic']].forEach(([cls, t]) => {
        const li = h('li');
        const sw = h('span', `td-chip-sw ${cls}`);
        sw.style.setProperty('--c', '#9a948f');
        li.append(sw, h('span', '', t));
        key.appendChild(li);
      });
      const top = h('div', 'td-top');
      top.append(heads, key);
      host.append(top, bar, chips);
      host.classList.add('an-pre');
    }
  }

  // Reveal each chapter (and the training strip) once.
  const targets = [...document.querySelectorAll('.an-ch'), document.querySelector('[data-training]')].filter(Boolean);
  targets.forEach((t) => t.classList.add('an-pre'));
  const show = (t) => {
    t.classList.remove('an-pre');
    const key = t.querySelector('[data-an]')?.dataset.an;
    (reveals.get(key) || []).forEach((fn) => fn());
  };
  if (reduced || !('IntersectionObserver' in window)) {
    targets.forEach(show);
  } else {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        io.unobserve(e.target);
        show(e.target);
      });
    }, { threshold: 0.2 });
    targets.forEach((t) => io.observe(t));
  }
  window.UNIT_ANALYSIS_UI = { showAll: () => targets.forEach(show) };
})();
