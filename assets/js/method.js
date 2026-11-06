// Method figure: group autoregression, read through its attention mask.
//
// Four 7-Scenes frames from the paper's architecture figure label both axes of
// the global-attention mask (rows are query frames, columns key frames), as in
// the paper's mask figure. The reader picks the group size G; the figure then
// steps through the autoregressive steps once: the mask fills one group of rows
// per step, earlier frames are read through a KV-cache queue of capacity Q, and
// each step decodes its group's point maps. Nothing loops and nothing resizes.
(() => {
  const root = document.querySelector('[data-method]');
  if (!root) return;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const N = 4;
  const Q = 2;
  const STEP_MS = 1300;
  const media = (name) => new URL(`assets/media/method/${name}`, document.baseURI).href;

  const MODES = [
    { G: 1, label: 'G = 1', name: 'Online', title: 'Online streaming', mask: 'standard causal mask',
      text: 'One frame per step. Each frame attends to itself and to the frames still in the KV cache.' },
    { G: 2, label: 'G = 2', name: 'Stereo', title: 'Synchronized pairs', mask: 'group causal mask',
      text: 'Two views per step, bidirectional within the pair and causal across pairs, as for a stereo rig.' },
    { G: N, label: 'G = N', name: 'Offline', title: 'Offline reconstruction', mask: 'null mask',
      text: 'All frames in a single step with full attention, like a multi-view model. Nothing needs caching.' },
  ];

  const h = (tag, cls, txt) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (txt !== undefined) n.textContent = txt;
    return n;
  };
  const thumb = (i, cls) => {
    const w = h('span', `gx-thumb ${cls || ''}`);
    const img = h('img');
    img.src = media(`frame${i + 1}.jpg`);
    img.alt = '';
    img.decoding = 'async';
    w.append(img, h('span', 'gx-fno', String(i + 1)));
    return w;
  };

  const ui = { mode: 1, step: 0, timer: null, started: false };
  const mode = () => MODES[ui.mode];
  const steps = () => N / mode().G;
  const groupOf = (i) => Math.floor(i / mode().G);
  // Frames held in the KV cache when group s is computed: the last Q earlier frames.
  const cacheAt = (s) => {
    if (mode().G === N) return [];
    return Array.from({ length: s * mode().G }, (_, i) => i).slice(-Q);
  };

  // ---------- DOM ----------
  const card = h('div', 'gx-card');
  const head = h('div', 'gx-head');
  const titles = h('div', 'gx-titles');
  const variants = MODES.map((m) => {
    const v = h('div', 'gx-variant');
    const t = h('h3', 'gx-title');
    t.append(h('span', 'gx-title-g', m.label), document.createTextNode(` · ${m.title}`));
    v.append(t, h('p', 'gx-text', m.text));
    titles.appendChild(v);
    return v;
  });
  const segWrap = h('div', 'rc-seg-wrap gx-seg');
  segWrap.appendChild(h('span', 'rc-seg-label', 'Group size'));
  const seg = h('div', 'seg');
  seg.setAttribute('role', 'group');
  seg.setAttribute('aria-label', 'Group size');
  const segButtons = MODES.map((m, i) => {
    const b = h('button');
    b.type = 'button';
    b.append(h('strong', '', m.label), h('span', '', m.name));
    b.addEventListener('click', () => setMode(i));
    seg.appendChild(b);
    return b;
  });
  segWrap.appendChild(seg);
  head.append(titles, segWrap);

  // Mask: brackets over the key frames, key-frame thumbs, query-frame thumbs, cells.
  const matrix = h('div', 'gx-matrix');
  const corner = h('div', 'gx-corner');
  corner.append(h('span', 'gx-ax gx-ax-k', 'key →'), h('span', 'gx-ax gx-ax-q', 'query ↓'));
  const brackets = h('div', 'gx-brackets');
  const bracketEls = Array.from({ length: N }, () => {
    const b = h('span', 'gx-br');
    brackets.appendChild(b);
    return b;
  });
  const cols = h('div', 'gx-cols');
  const rows = h('div', 'gx-rows');
  const colThumbs = [];
  const rowThumbs = [];
  for (let i = 0; i < N; i++) {
    colThumbs.push(cols.appendChild(thumb(i)));
    rowThumbs.push(rows.appendChild(thumb(i)));
  }
  const cells = h('div', 'gx-cells');
  // One outline around the rows being computed, thumbnails included. It sits in
  // the gaps between rows, so it never crosses a cell or a thumbnail.
  const band = h('div', 'gx-band');
  const cellEls = [];
  for (let q = 0; q < N; q++) {
    for (let k = 0; k < N; k++) {
      const c = h('span', 'gx-cell');
      c.style.setProperty('--d', `${(q + k) * 35}ms`);
      c.appendChild(h('span', 'gx-inf', '−∞'));
      cells.appendChild(c);
      cellEls.push({ c, q, k });
    }
  }
  const spacer = h('div', 'gx-spacer');
  matrix.append(spacer, brackets, corner, cols, rows, cells, band);

  const legend = h('ul', 'gx-legend');
  [['gx-sw-self', 'same group'], ['gx-sw-cache', 'read from KV cache'], ['gx-sw-mask', 'future, masked (−∞)'], ['gx-sw-drop', `dropped from the queue (Q = ${Q})`]].forEach(([cls, label]) => {
    const li = h('li');
    li.append(h('span', `gx-sw ${cls}`), h('span', '', label));
    legend.appendChild(li);
  });
  const maskName = h('p', 'gx-maskname');
  const left = h('div', 'gx-left');
  left.append(maskName, matrix, legend);

  // Side: step control, KV cache, decoded point maps.
  const side = h('div', 'gx-side');
  const stepBox = h('div', 'gx-block gx-stepbox');
  const stepRow = h('div', 'gx-steprow');
  const prev = h('button', 'gx-btn', '‹');
  prev.type = 'button';
  prev.setAttribute('aria-label', 'Previous step');
  const next = h('button', 'gx-btn', '›');
  next.type = 'button';
  next.setAttribute('aria-label', 'Next step');
  const stepNum = h('span', 'gx-stepnum');
  stepNum.setAttribute('aria-live', 'polite');
  const dots = h('span', 'gx-dots');
  const dotEls = Array.from({ length: N }, () => dots.appendChild(h('span', 'gx-dot')));
  const replay = h('button', 'gx-btn gx-replay', '↻ Replay');
  replay.type = 'button';
  stepRow.append(prev, stepNum, next, dots, replay);
  stepBox.append(h('span', 'gx-label', 'Autoregressive step'), stepRow);

  const cacheBox = h('div', 'gx-block');
  const cacheHead = h('div', 'gx-blockhead');
  cacheHead.append(h('span', 'gx-label', 'KV cache'), h('span', 'gx-cap', `queue, capacity Q = ${Q}`));
  const queue = h('div', 'gx-queue');
  for (let j = 0; j < Q; j++) {
    const slot = h('span', 'gx-slot');
    slot.style.setProperty('--j', j);
    queue.appendChild(slot);
  }
  const qItems = Array.from({ length: N }, (_, i) => {
    const t = thumb(i, 'gx-qitem');
    queue.appendChild(t);
    return t;
  });
  const cacheNote = h('p', 'gx-note');
  cacheBox.append(cacheHead, queue, cacheNote);

  const outBox = h('div', 'gx-block');
  const outHead = h('div', 'gx-blockhead');
  outHead.append(h('span', 'gx-label', 'Decoded point maps'), h('span', 'gx-cap', 'one per frame'));
  const outs = h('div', 'gx-outs');
  const outEls = Array.from({ length: N }, (_, i) => {
    const o = h('span', 'gx-out');
    const img = h('img');
    img.src = media(`pointmap${i + 1}.png`);
    img.alt = `Point map of frame ${i + 1}`;
    img.decoding = 'async';
    o.append(h('span', 'gx-out-ph', String(i + 1)), img);
    outs.appendChild(o);
    return o;
  });
  outBox.append(outHead, outs);
  side.append(stepBox, cacheBox, outBox);

  const body = h('div', 'gx-body');
  body.append(left, side);
  card.append(head, body);
  root.prepend(card);

  // ---------- State → view ----------
  function render() {
    const m = mode();
    const S = steps();
    const s = ui.step;
    root.dataset.g = String(m.G);
    segButtons.forEach((b, i) => b.setAttribute('aria-pressed', String(i === ui.mode)));
    variants.forEach((v, i) => v.classList.toggle('is-on', i === ui.mode));
    maskName.innerHTML = `<span class="gx-mn-pre">Global attention · </span>${m.mask}`;

    // Group brackets over the key frames.
    bracketEls.forEach((b, i) => {
      const on = i < S;
      b.classList.toggle('is-on', on);
      b.classList.toggle('is-now', on && i === s);
      b.style.setProperty('--i', (on ? i : S - 1) * m.G);
      b.style.setProperty('--n', m.G);
    });
    colThumbs.forEach((t, i) => t.classList.toggle('is-now', groupOf(i) === s));
    rowThumbs.forEach((t, i) => {
      t.classList.toggle('is-now', groupOf(i) === s);
      t.classList.toggle('is-wait', groupOf(i) > s);
    });

    // Cells: same group, cached, dropped or masked; rows of later groups wait.
    cellEls.forEach(({ c, q, k }) => {
      const gq = groupOf(q);
      const gk = groupOf(k);
      let st;
      if (gk > gq) st = 'mask';
      else if (gk === gq) st = 'self';
      else st = cacheAt(gq).includes(k) ? 'cache' : 'drop';
      c.dataset.st = st;
      c.classList.toggle('is-wait', gq > s);
      c.classList.toggle('is-now', gq === s);
    });
    band.style.setProperty('--i', s * m.G);
    band.style.setProperty('--n', m.G);

    // Step control.
    const first = s * m.G + 1;
    const last = (s + 1) * m.G;
    stepNum.innerHTML = `<strong>${s + 1}</strong> / ${S}<span class="gx-stepframes">${first === last ? `frame ${first}` : `frames ${first}–${last}`}</span>`;
    dotEls.forEach((d, i) => {
      d.classList.toggle('is-on', i < S);
      d.classList.toggle('is-done', i <= s);
    });
    prev.disabled = s === 0;
    next.disabled = s === S - 1;

    // KV cache: frames enter from the right and leave to the left.
    const held = cacheAt(s);
    const seen = Array.from({ length: s * m.G }, (_, i) => i);
    const dropped = m.G === N ? [] : seen.filter((i) => !held.includes(i));
    qItems.forEach((t, i) => {
      const j = held.indexOf(i);
      t.dataset.st = j >= 0 ? 'in' : dropped.includes(i) ? 'out' : 'wait';
      t.style.setProperty('--j', j >= 0 ? j : dropped.includes(i) ? -1 : Q);
    });
    let note;
    if (m.G === N) note = 'Single step: nothing to cache.';
    else if (s === 0) note = 'Empty at the first step.';
    else if (dropped.length) note = `Frame ${dropped.map((i) => i + 1).join(', ')} dropped; memory stays bounded.`;
    else note = `Keeps at most the last ${Q} frames.`;
    cacheNote.textContent = note;

    // Point maps decoded so far; this step's group is highlighted.
    outEls.forEach((o, i) => {
      o.classList.toggle('is-done', groupOf(i) <= s);
      o.classList.toggle('is-now', groupOf(i) === s);
    });
  }

  function stop() {
    clearTimeout(ui.timer);
    ui.timer = null;
    root.classList.remove('is-playing');
  }
  function play(delay) {
    stop();
    if (reduced) {
      ui.step = steps() - 1;
      render();
      return;
    }
    ui.step = 0;
    render();
    if (steps() === 1) return;
    root.classList.add('is-playing');
    const tick = () => {
      ui.step += 1;
      render();
      if (ui.step >= steps() - 1) stop();
      else ui.timer = setTimeout(tick, STEP_MS);
    };
    ui.timer = setTimeout(tick, delay ?? STEP_MS);
  }
  function setMode(i) {
    ui.mode = i;
    root.classList.add('is-morph');
    clearTimeout(root._mt);
    root._mt = setTimeout(() => root.classList.remove('is-morph'), 800);
    play(STEP_MS);
  }
  prev.addEventListener('click', () => { stop(); ui.step = Math.max(0, ui.step - 1); render(); });
  next.addEventListener('click', () => { stop(); ui.step = Math.min(steps() - 1, ui.step + 1); render(); });
  replay.addEventListener('click', () => play(900));

  // Start on G = 2 fully drawn; play it through once when it scrolls into view.
  ui.step = steps() - 1;
  render();
  if (!reduced && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        io.disconnect();
        if (!ui.timer) play(900);
      }
    }, { threshold: 0.4 });
    io.observe(card);
  }
  window.UNIT_METHOD = { setMode, play, stop, get state() { return { ...ui }; }, setStep(s) { stop(); ui.step = s; render(); } };
})();
