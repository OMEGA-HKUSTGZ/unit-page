// Per-task results, built from the paper's own tables (assets/js/results-data.js)
// and the digitized long-horizon curves (assets/js/longhorizon-data.js).
//
// Each task is a board: one ranked column per metric, every row a method with a
// bar relative to the best value in that column (best = full bar). Every method
// that appears in any setting of a task keeps its row, so switching setting or
// dataset only reorders rows and retimes bars; nothing changes size.
(() => {
  const DATA = window.UNIT_RESULTS;
  if (!DATA) return;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ROW = 30;

  const COLORS = {
    UniT: '#8a5f5c',
    VGGT: '#7f9a83',
    'π³': '#4f9aa0',
    MapAnything: '#c9965a',
    DepthAnything3: '#6f86a6',
    CUT3R: '#8f7fa8',
    StreamVGGT: '#a39684',
  };
  window.UNIT_COLORS = COLORS;
  const colorOf = (m) => COLORS[m.startsWith('UniT') ? 'UniT' : m] || '#999';
  const isUniT = (m) => m.startsWith('UniT');

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
  const ordinal = (n) => (n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th`);
  const condLabel = (task, label) => {
    if (task !== 'multiModal') return label;
    return label.split('+').map((m) => (m === 'RT' ? 'R|T' : m)).join(' + ');
  };

  function makeSeg(label, items, initial, onPick) {
    const wrap = h('div', 'rc-seg-wrap');
    wrap.appendChild(h('span', 'rc-seg-label', label));
    const seg = h('div', 'seg');
    seg.setAttribute('role', 'group');
    seg.setAttribute('aria-label', label);
    let cur = initial;
    const buttons = items.map((item, i) => {
      const b = h('button', '', item);
      b.type = 'button';
      b.addEventListener('click', () => {
        cur = i;
        sync();
        onPick(i);
      });
      seg.appendChild(b);
      return b;
    });
    const sync = (i) => {
      if (i !== undefined) cur = i;
      buttons.forEach((b, j) => b.setAttribute('aria-pressed', String(j === cur)));
    };
    sync();
    wrap.appendChild(seg);
    return { wrap, sync };
  }

  // Replay an entrance when a board scrolls into view for the first time.
  const onFirstView = (el, fn) => {
    if (reduced || !('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        io.disconnect();
        fn();
      }
    }, { threshold: 0.25 });
    io.observe(el);
  };

  // ---------- Ranked board ----------
  // groups: [{key, members: [{id, name}]}]; metrics: [{name, dir, digits}]
  function makeBoard({ groups, metrics, cls }) {
    const root = h('div', `lb${cls ? ` ${cls}` : ''}`);
    root.dataset.metric = '0';
    root.style.setProperty('--lb-cols', metrics.length);
    const cells = {}; // cells[group][metric][id] = {li, rank, fill, val, tag}
    const heads = {};

    groups.forEach((g) => {
      const sec = h('section', 'lb-group');
      const head = h('header', 'lb-ghead');
      const title = h('h4', 'lb-gtitle');
      const sub = h('span', 'lb-gsub');
      const note = h('span', 'lb-gnote');
      const left = h('div', 'lb-gleft');
      left.append(title, sub);
      head.append(left, note);
      heads[g.key] = { title, sub, note };
      const cols = h('div', 'lb-cols');
      cells[g.key] = metrics.map((m, mi) => {
        const col = h('div', `lb-col lb-m${mi}`);
        const ch = h('div', 'lb-chead');
        ch.appendChild(h('strong', '', m.name));
        ch.appendChild(h('span', 'lb-dir', m.dir === 'down' ? '↓ lower is better' : '↑ higher is better'));
        const list = h('ol', 'lb-list');
        list.style.height = `${g.members.length * ROW}px`;
        const byId = {};
        g.members.forEach((mem, i) => {
          const li = h('li', `lb-row${isUniT(mem.id) ? ' lb-ours' : ''}`);
          li.dataset.id = mem.id;
          li.style.setProperty('--c', colorOf(mem.id));
          li.style.setProperty('--i', i);
          const rank = h('span', 'lb-rank');
          const name = h('span', 'lb-name', mem.name);
          name.title = mem.name;
          const track = h('span', 'lb-track');
          const fill = h('span', 'lb-fill');
          const tag = h('span', 'lb-tag');
          track.append(fill, tag);
          const val = h('span', 'lb-val');
          li.append(rank, name, track, val);
          li.addEventListener('pointerenter', () => highlight(mem.id));
          li.addEventListener('pointerleave', () => highlight(null));
          list.appendChild(li);
          byId[mem.id] = { li, rank, fill, val, tag };
        });
        col.append(ch, list);
        cols.appendChild(col);
        return byId;
      });
      sec.append(head, cols);
      root.appendChild(sec);
    });

    function highlight(id) {
      root.classList.toggle('lb-hl', Boolean(id));
      root.querySelectorAll('.lb-row').forEach((li) => li.classList.toggle('is-hl', li.dataset.id === id));
    }

    // state[group] = {title, sub, note, rows: {id: {values: [..per metric], best: [bool..]}}, absent}
    function render(state) {
      groups.forEach((g) => {
        const st = state[g.key];
        const hd = heads[g.key];
        hd.title.textContent = st.title;
        hd.sub.textContent = st.sub || '';
        hd.note.textContent = st.note || '';
        hd.note.title = st.noteTitle || '';
        metrics.forEach((m, mi) => {
          const present = g.members.filter((mem) => st.rows[mem.id]);
          const absent = g.members.filter((mem) => !st.rows[mem.id]);
          const v = (mem) => st.rows[mem.id].values[mi];
          present.sort((a, b) => (m.dir === 'down' ? v(a) - v(b) : v(b) - v(a)));
          const best = v(present[0]);
          let lastV = null;
          let lastRank = 0;
          present.forEach((mem, i) => {
            const c = cells[g.key][mi][mem.id];
            const val = v(mem);
            const rank = val === lastV ? lastRank : i + 1;
            lastV = val;
            lastRank = rank;
            const f = m.dir === 'down' ? (val > 0 ? best / val : 1) : (best > 0 ? val / best : 1);
            c.li.classList.remove('lb-absent');
            c.li.classList.toggle('lb-first', rank === 1);
            c.li.style.transform = `translateY(${i * ROW}px)`;
            c.fill.style.setProperty('--f', Math.max(0.02, Math.min(1, f)).toFixed(4));
            c.rank.textContent = rank;
            c.val.textContent = val.toFixed(m.digits ?? 3);
            c.val.classList.toggle('lb-bold', Boolean(st.rows[mem.id].best?.[mi]));
            c.tag.textContent = '';
            c.li.setAttribute('aria-label', `${ordinal(rank)}: ${c.li.querySelector('.lb-name').textContent}, ${m.name} ${c.val.textContent}`);
          });
          absent.forEach((mem, k) => {
            const c = cells[g.key][mi][mem.id];
            c.li.classList.add('lb-absent');
            c.li.classList.remove('lb-first');
            c.li.style.transform = `translateY(${(present.length + k) * ROW}px)`;
            c.fill.style.setProperty('--f', '0');
            c.rank.textContent = '';
            c.val.textContent = '';
            c.val.classList.remove('lb-bold');
            c.tag.textContent = st.absent || 'not evaluated';
            c.li.setAttribute('aria-label', `${c.li.querySelector('.lb-name').textContent}: ${st.absent || 'not evaluated'}`);
          });
        });
      });
    }

    function reveal() {
      if (reduced) return;
      root.classList.add('lb-pre');
      void root.offsetWidth;
      root.classList.remove('lb-pre');
      root.classList.add('lb-reveal');
      clearTimeout(root._rt);
      root._rt = setTimeout(() => root.classList.remove('lb-reveal'), 1400);
    }

    return {
      root,
      render,
      reveal,
      setMetric(i) { root.dataset.metric = String(i); },
    };
  }

  // A white card with controls, a board and a footer for notes and the paper's table.
  function makeCard(host) {
    const card = h('div', 'lb-card');
    const controls = h('div', 'lb-controls');
    const body = h('div', 'lb-body');
    const foot = h('div', 'lb-foot');
    const note = h('p', 'lb-note');
    foot.appendChild(note);
    card.append(controls, body, foot);
    host.appendChild(card);
    // Move the paper's table (the <details> after the host) into the card footer.
    const next = host.nextElementSibling;
    if (next && next.matches('details.paper-table')) {
      next.querySelector('summary').textContent = next.querySelector('summary').textContent.replace('Show the table from the paper', 'Original table');
      foot.appendChild(next);
    }
    return { card, controls, body, foot, note };
  }

  const charts = {};

  // ---------- Per-task boards ----------
  function buildChart(host) {
    const task = host.dataset.chart;
    const spec = DATA[task];
    const ui = { cond: 0, dataset: 0 };

    // Every method that appears in a group under any setting keeps a row.
    const groupKeys = [];
    const members = {};
    spec.conditions.forEach((c) => c.groups.forEach((g) => {
      if (!members[g.label]) {
        members[g.label] = [];
        groupKeys.push(g.label);
      }
      g.rows.forEach((r) => {
        if (!members[g.label].some((m) => m.id === r.method)) members[g.label].push({ id: r.method, name: r.method });
      });
    }));
    const displayName = (group, m) => {
      if (m !== 'UniT') return m;
      if (group === 'Offline') return 'UniT (G = N)';
      if (group === 'Online') return 'UniT (G = 1)';
      return 'UniT';
    };
    // Put UniT last within each group, as in the paper, and name it by its mode.
    groupKeys.forEach((k) => {
      members[k].sort((a, b) => Number(isUniT(a.id)) - Number(isUniT(b.id)));
      members[k].forEach((m) => { m.name = displayName(k, m.id); });
    });

    const { controls, body, note } = makeCard(host);
    const board = makeBoard({
      groups: groupKeys.map((k) => ({ key: k, members: members[k] })),
      metrics: spec.metrics.map(([name, dir]) => ({ name, dir, digits: 3 })),
    });
    body.appendChild(board.root);

    const condName = task === 'multiModal' ? 'Inputs' : task === 'depthCompletion' ? 'Sparse pattern' : 'Setting';
    const condSeg = spec.conditions.length > 1
      ? makeSeg(condName, spec.conditions.map((c) => condLabel(task, c.label)), 0, (i) => { ui.cond = i; draw(); })
      : null;
    const dataSeg = makeSeg('Dataset', spec.datasets, 0, (i) => { ui.dataset = i; draw(); });
    const metricSeg = makeSeg('Metric', spec.metrics.map(([m]) => m), 0, (i) => board.setMetric(i));
    metricSeg.wrap.classList.add('lb-metric-pick');
    if (condSeg) controls.appendChild(condSeg.wrap);
    controls.append(dataSeg.wrap, metricSeg.wrap);

    note.textContent = `${spec.table} of the paper. Bars are relative to the best value in each column; bold values are the paper's best.`;

    const GROUP_SUB = { Offline: 'all frames at once', Online: 'frame by frame' };
    function draw() {
      const cond = spec.conditions[ui.cond];
      const base = ui.dataset * 3;
      const state = {};
      groupKeys.forEach((k) => {
        const g = cond.groups.find((x) => x.label === k);
        const rows = {};
        g.rows.forEach((r) => {
          rows[r.method] = {
            values: [0, 1, 2].map((m) => r.values[base + m]),
            best: [0, 1, 2].map((m) => r.best.includes(base + m)),
          };
        });
        const u = g.rows.find((r) => isUniT(r.method));
        const place = 1 + g.rows.filter((r) => r.rank < u.rank).length;
        state[k] = {
          title: k || 'All methods',
          sub: k ? GROUP_SUB[k] : (task === 'monoDepth' ? 'single image' : task === 'multiModal' ? 'with these inputs' : 'sparse depth'),
          note: `UniT avg. rank ${u.rank.toFixed(2)} · ${ordinal(place)} of ${g.rows.length}`,
          noteTitle: `Average rank over all nine metric × dataset columns of ${spec.table}`,
          rows,
          absent: cond.label === 'Metric-scale' ? 'up-to-scale only' : 'not evaluated',
        };
      });
      board.render(state);
    }

    charts[task] = {
      show(condIndex, datasetIndex) {
        if (condIndex >= 0) ui.cond = condIndex;
        if (datasetIndex !== undefined) ui.dataset = datasetIndex;
        condSeg?.sync(ui.cond);
        dataSeg.sync(ui.dataset);
        draw();
        board.reveal();
      },
      reveal: board.reveal,
    };
    draw();
    onFirstView(board.root, board.reveal);
  }

  // ---------- Speed and memory (Table 2) ----------
  function buildComplexity(host) {
    const spec = DATA.complexity;
    const keys = ['Offline', 'Online'];
    const rowsOf = (k) => spec.rows.filter((r) => r.online === (k === 'Online'));
    const { controls, body, note } = makeCard(host);
    const board = makeBoard({
      cls: 'lb-wide-names',
      groups: keys.map((k) => ({ key: k, members: rowsOf(k).map((r) => ({ id: r.method, name: r.method })) })),
      metrics: [
        { name: 'Speed (images/s)', dir: 'up', digits: 2 },
        { name: 'Peak memory (GiB)', dir: 'down', digits: 1 },
      ],
    });
    body.appendChild(board.root);
    const metricSeg = makeSeg('Metric', ['Speed', 'Memory'], 0, (i) => board.setMetric(i));
    metricSeg.wrap.classList.add('lb-metric-pick');
    controls.appendChild(metricSeg.wrap);
    controls.classList.add('lb-controls-narrow-only');
    note.textContent = `${spec.table} of the paper. ${spec.note} G is the group size, Q the memory queue length.`;

    const state = {};
    keys.forEach((k) => {
      const rows = {};
      rowsOf(k).forEach((r) => { rows[r.method] = { values: [r.fps, r.mem], best: [false, false] }; });
      const list = rowsOf(k);
      const rankIn = (key, dir) => {
        const sorted = [...list].sort((a, b) => (dir === 'down' ? a[key] - b[key] : b[key] - a[key]));
        return 1 + sorted.findIndex((r) => isUniT(r.method));
      };
      state[k] = {
        title: k,
        sub: k === 'Offline' ? 'all frames at once' : 'frame by frame',
        note: `UniT ${ordinal(rankIn('fps', 'up'))} in speed · ${ordinal(rankIn('mem', 'down'))} in memory`,
        noteTitle: 'Best-placed UniT variant in each column',
        rows,
      };
    });
    board.render(state);
    onFirstView(board.root, board.reveal);
    charts.complexity = { reveal: board.reveal };
  }

  // ---------- Long horizon (Fig. 9) ----------
  function buildLongHorizon(host) {
    const LH = window.UNIT_LONGHORIZON;
    if (!LH) return;
    const X = LH.views;
    const last = X.length - 1;
    const ate = LH.metrics[0].series;
    const da3Last = LH.metrics[0].series.DepthAnything3.length - 1;
    const ratio = ate.CUT3R[last] / ate.UniT[last];

    const lede = h('p', 'lh-lede');
    lede.innerHTML = `DepthAnything3 runs out of memory beyond <strong>${X[da3Last]} frames</strong>. `
      + `From there UniT continues online with a ${LH.queue}-frame memory, and at ${X[last]} frames its pose error is `
      + `<strong>${ratio.toFixed(1)}× lower</strong> than CUT3R's (${ate.UniT[last].toFixed(2)} vs ${ate.CUT3R[last].toFixed(2)} m ATE).`;

    const card = h('div', 'lb-card lh-card');
    const legend = h('ul', 'lh-legend');
    [['UniT', 'UniT (hybrid)'], ['CUT3R', 'CUT3R'], ['DepthAnything3', 'DepthAnything3']].forEach(([m, label]) => {
      const li = h('li', m === 'UniT' ? 'lh-ours' : '');
      const sw = h('span', 'lh-sw');
      sw.style.background = COLORS[m];
      li.append(sw, h('span', '', label));
      legend.appendChild(li);
    });
    const oom = h('li', 'lh-oom-key');
    oom.append(h('span', 'lh-x', '×'), h('span', '', 'out of memory'));
    legend.appendChild(oom);

    const panels = h('div', 'lh-panels');
    const foot = h('div', 'lb-foot');
    foot.appendChild(h('p', 'lb-note', 'Values read from the markers of Fig. 9 in the paper (NRGBD, metric scale), accurate to about ±0.005.'));
    const pair = host.querySelector('.pair');
    if (pair) {
      const det = h('details', 'paper-table');
      det.appendChild(h('summary', '', 'Original figure'));
      det.appendChild(pair);
      foot.appendChild(det);
    }
    card.append(legend, panels, foot);
    host.prepend(lede, card);

    const H = 260;
    const M = { l: 44, r: 58, t: 34, b: 30 };
    const charts2 = LH.metrics.map((metric) => {
      const fig = h('figure', 'lh-panel');
      const cap = h('figcaption', 'lh-cap');
      cap.append(h('strong', '', metric.label), h('span', '', `${metric.unit} vs. sequence length (frames)`));
      const wrap = h('div', 'lh-plot');
      const svg = s('svg', { class: 'lh-svg', role: 'img', tabindex: '0', 'aria-label': `${metric.label}, ${metric.unit}, against sequence length. Use the arrow keys to read values.` });
      const tip = h('div', 'lh-tip');
      tip.setAttribute('aria-hidden', 'true');
      const tipHead = h('div', 'lh-tip-head');
      tip.appendChild(tipHead);
      const tipRows = ['UniT', 'CUT3R', 'DepthAnything3'].map((m) => {
        const r = h('div', 'lh-tip-row');
        const sw = h('span', 'lh-sw');
        sw.style.background = COLORS[m];
        const v = h('span', 'lh-tip-v');
        r.append(sw, h('span', 'lh-tip-n', m === 'DepthAnything3' ? 'DA3' : m), v);
        tip.appendChild(r);
        return v;
      });
      wrap.append(svg, tip);
      fig.append(cap, wrap);
      panels.appendChild(fig);
      return { metric, fig, wrap, svg, tip, tipHead, tipRows, w: 0, geo: null };
    });

    let hoverIdx = -1;
    function setHover(i) {
      hoverIdx = i;
      charts2.forEach((c) => {
        if (!c.geo) return;
        const { xs, ys, guide, dots, W } = c.geo;
        const on = i >= 0;
        c.wrap.classList.toggle('lh-hovering', on);
        if (!on) return;
        const x = xs(X[i]);
        guide.setAttribute('x1', x);
        guide.setAttribute('x2', x);
        ['UniT', 'CUT3R', 'DepthAnything3'].forEach((m, k) => {
          const v = c.metric.series[m][i];
          const d = dots[m];
          if (v === undefined) {
            d.setAttribute('visibility', 'hidden');
            c.tipRows[k].textContent = 'OOM';
          } else {
            d.setAttribute('visibility', 'visible');
            d.setAttribute('cx', x);
            d.setAttribute('cy', ys(v));
            c.tipRows[k].textContent = v.toFixed(3);
          }
        });
        c.tipHead.textContent = `${X[i]} frames`;
        const right = x < W / 2;
        c.tip.style.left = right ? `${x + 12}px` : '';
        c.tip.style.right = right ? '' : `${W - x + 12}px`;
      });
    }

    function draw(c, animate) {
      const W = c.w;
      const { metric, svg } = c;
      svg.replaceChildren();
      svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
      svg.setAttribute('width', W);
      svg.setAttribute('height', H);
      const x0 = M.l;
      const x1 = W - M.r;
      const y0 = H - M.b;
      const y1 = M.t;
      const xs = (v) => x0 + ((v - X[0]) / (X[last] - X[0])) * (x1 - x0);
      const [d0, d1] = metric.domain;
      const ys = (v) => y0 - ((v - d0) / (d1 - d0)) * (y0 - y1);
      const narrow = W < 420;

      // Zones: offline up to the switch, online with memory after it.
      const split = xs((LH.switchAt + X[X.indexOf(LH.switchAt) + 1]) / 2);
      s('rect', { class: 'lh-zone-on', x: split, y: y1 - 22, width: x1 + 12 - split, height: y0 - y1 + 22 }, svg);
      s('line', { class: 'lh-split', x1: split, x2: split, y1: y1 - 22, y2: y0 }, svg);
      const zl = s('text', { class: 'lh-zone', x: x0, y: y1 - 10 }, svg);
      zl.textContent = 'Offline';
      const zr = s('text', { class: 'lh-zone lh-zone-r', x: split + 8, y: y1 - 10 }, svg);
      zr.textContent = narrow ? `Online · Q = ${LH.queue}` : `Online + memory · Q = ${LH.queue}`;

      metric.ticks.forEach((t) => {
        s('line', { class: 'lh-grid', x1: x0, x2: x1, y1: ys(t), y2: ys(t) }, svg);
        const tl = s('text', { class: 'lh-ytick', x: x0 - 8, y: ys(t) + 4 }, svg);
        tl.textContent = t.toFixed(1);
      });
      X.forEach((v, i) => {
        if (narrow && i % 2 === 0) return;
        const tl = s('text', { class: 'lh-xtick', x: xs(v), y: y0 + 18 }, svg);
        tl.textContent = v;
      });

      const order = ['DepthAnything3', 'CUT3R', 'UniT'];
      const lines = [];
      order.forEach((m, k) => {
        const vals = metric.series[m];
        const pts = vals.map((v, i) => [xs(X[i]), ys(v)]);
        const g = s('g', { class: `lh-series${m === 'UniT' ? ' lh-ours' : ''}`, style: `--c:${COLORS[m]}` }, svg);
        const path = s('path', { class: 'lh-line', d: `M${pts.map((p) => p.join(',')).join(' L')}` }, g);
        pts.forEach((p) => s('circle', { class: 'lh-pt', cx: p[0], cy: p[1], r: m === 'UniT' ? 3 : 2.4 }, g));
        if (vals.length < X.length) {
          const p = pts[pts.length - 1];
          const x = s('g', { class: 'lh-oom', transform: `translate(${p[0]},${p[1]})` }, g);
          s('path', { d: 'M-5,-5 L5,5 M5,-5 L-5,5' }, x);
          const t = s('text', { x: 9, y: -8 }, x);
          t.textContent = 'DA3 · OOM';
        } else {
          const p = pts[last];
          const t = s('text', { class: 'lh-end', x: p[0] + 9, y: p[1] + 4 }, g);
          t.textContent = m;
        }
        lines.push({ path, g, k });
      });

      const guide = s('line', { class: 'lh-guide', y1: y1 - 22, y2: y0 }, svg);
      const dots = {};
      order.forEach((m) => {
        dots[m] = s('circle', { class: 'lh-hdot', r: 4.5, stroke: COLORS[m], visibility: 'hidden' }, svg);
      });
      const hit = s('rect', { class: 'lh-hit', x: x0 - 10, y: y1 - 22, width: x1 - x0 + 20, height: y0 - y1 + 22 }, svg);
      const idxAt = (clientX) => {
        const r = svg.getBoundingClientRect();
        const px = ((clientX - r.left) / r.width) * W;
        let best = 0;
        X.forEach((v, i) => { if (Math.abs(xs(v) - px) < Math.abs(xs(X[best]) - px)) best = i; });
        return best;
      };
      hit.addEventListener('pointermove', (e) => setHover(idxAt(e.clientX)));
      hit.addEventListener('pointerleave', () => setHover(-1));
      c.geo = { xs, ys, guide, dots, W };

      if (animate && !reduced) {
        svg.classList.add('lh-pre');
        lines.forEach(({ path }) => {
          const len = path.getTotalLength();
          path.style.strokeDasharray = `${len}`;
          path.style.strokeDashoffset = `${len}`;
        });
        void svg.getBoundingClientRect();
        requestAnimationFrame(() => {
          svg.classList.remove('lh-pre');
          svg.classList.add('lh-draw');
          lines.forEach(({ path }) => { path.style.strokeDashoffset = '0'; });
          setTimeout(() => {
            svg.classList.remove('lh-draw');
            lines.forEach(({ path }) => { path.style.strokeDasharray = ''; path.style.strokeDashoffset = ''; });
          }, 1900);
        });
      }
      if (hoverIdx >= 0) setHover(hoverIdx);
    }

    charts2.forEach((c) => {
      c.svg.addEventListener('keydown', (e) => {
        const step = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
        if (!step) return;
        e.preventDefault();
        setHover(Math.max(0, Math.min(last, (hoverIdx < 0 ? (step > 0 ? -1 : X.length) : hoverIdx) + step)));
      });
      c.svg.addEventListener('blur', () => setHover(-1));
    });

    // Draw at the real pixel width, and replay the lines each time the tab opens.
    const measure = () => {
      charts2.forEach((c) => {
        const w = Math.round(c.wrap.clientWidth);
        if (!w || w === c.w) {
          if (!w) c.w = 0;
          return;
        }
        const appearing = c.w === 0;
        c.w = w;
        draw(c, appearing);
      });
    };
    const ro = new ResizeObserver(measure);
    charts2.forEach((c) => ro.observe(c.wrap));
    charts.longHorizon = { measure };
  }

  document.querySelectorAll('[data-chart]').forEach(buildChart);
  document.querySelectorAll('[data-complexity]').forEach(buildComplexity);
  document.querySelectorAll('[data-longhorizon]').forEach(buildLongHorizon);
  window.UNIT_CHARTS = charts;

  // Task chips in the stats strip open their tab.
  document.querySelectorAll('[data-open-tab]').forEach((link) => {
    link.addEventListener('click', (e) => {
      const tab = document.getElementById(link.dataset.openTab);
      if (!tab) return;
      e.preventDefault();
      tab.click();
      tab.closest('[data-tabs]')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });

  // Replay the bars when a tab is opened.
  document.querySelectorAll('#results [role="tab"]').forEach((tab) => {
    tab.addEventListener('click', () => {
      const panel = document.getElementById(tab.getAttribute('aria-controls'));
      const task = panel?.querySelector('[data-chart]')?.dataset.chart;
      if (task) charts[task].reveal();
      if (panel?.querySelector('[data-longhorizon]')) charts.longHorizon?.measure();
      if (panel?.querySelector('[data-complexity]')) charts.complexity?.reveal();
    });
  });
})();
