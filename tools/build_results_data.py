"""Build assets/js/results-data.js from the UniT paper PDF (IJCV 2026 version).

Usage:
  python3 -I tools/build_results_data.py <paper.pdf> assets/js/results-data.js [--images assets/media/results]

Needs poppler (pdftohtml, pdftoppm). Tables 2-9 are read from the PDF's text
layer: values, the paper's average ranks, and its bold "best" marks (numbers
set in the bold font). Every table is checked against the method order the
paper prints, so a layout change fails loudly instead of shifting numbers
between rows. With --images, Tables 3-9 are also rendered from the PDF and
cropped to the PNGs the page opens with "Table N from the paper".
"""
import json, re, subprocess, sys, tempfile, unicodedata
import xml.etree.ElementTree as ET

NUM = re.compile(r'^-?\d+\.\d+$')
SCALE = 2  # pdftohtml -xml units are 1.5 per pt; images are rendered at 3 px per pt


def load(pdf):
    xml = subprocess.run(['pdftohtml', '-xml', '-i', '-fontfullname', '-q', '-stdout', pdf],
                         check=True, capture_output=True).stdout
    root = ET.fromstring(xml)
    fonts = {fs.get('id'): fs.get('family') for fs in root.iter('fontspec')}
    pages = []
    for page in root.iter('page'):
        items = []
        for t in page.iter('text'):
            items.append(dict(
                top=int(t.get('top')), left=int(t.get('left')),
                right=int(t.get('left')) + int(t.get('width')),
                bottom=int(t.get('top')) + int(t.get('height')),
                text=unicodedata.normalize('NFKC', ''.join(t.itertext())).strip(),
                bold='Bold' in fonts.get(t.get('font'), '') or t.find('.//b') is not None))
        pages.append(items)
    return pages


def caption(pages, label):
    for pi, items in enumerate(pages):
        for it in items:
            if it['text'] == label and it['bold']:
                return pi, it
    sys.exit(f'{label} not found in the PDF')


def region(pages, n):
    """Items of Table n: below its caption, above the next caption on the page."""
    pi, cap = caption(pages, f'Table {n}')
    items = pages[pi]
    nxt = [it['top'] for it in items if it['top'] > cap['top'] + 5 and it['bold']
           and re.fullmatch(r'(Table|Fig\.) \d+', it['text'])]
    bottom = min(nxt) if nxt else 10 ** 9
    return pi, cap, [it for it in items if cap['top'] < it['top'] < bottom]


METHODS = ['Ours-Long', 'VGGT-Long', 'StreamVGGT', 'VGGT', 'π3', 'MapAnything',
           'DepthAnything3', 'CUT3R', 'TTT3R', 'Stream3R', 'Ours']


def method_name(text):
    text = re.sub(r'\s+', '', text.replace('𝜋', 'π'))
    for m in METHODS:
        i = text.find(m)
        if i < 0:
            continue
        if m == 'π3':
            return 'π³'
        if m == 'Ours-Long':
            return 'UniT-Long'
        if m == 'Ours':
            var = re.match(r'\(([^)]*)\)', text[i + 4:])
            if not var:
                return 'UniT'
            parts = [p.replace('=', ' = ') for p in var.group(1).split(',')]
            return 'UniT (' + ', '.join(parts) + ')'
        return m
    return None


def rows(pages, n, ncols):
    """Data rows of Table n: rows with exactly ncols numeric cells and a method name."""
    pi, cap, items = region(pages, n)
    online = [it for it in items if it['text'] == 'Online']
    cells = [it for it in items if NUM.match(it['text']) or it['text'] == '-']
    by_top = {}
    for it in cells:
        key = next((k for k in by_top if abs(k - it['top']) <= 3), it['top'])
        by_top.setdefault(key, []).append(it)
    out = []
    for top in sorted(by_top):
        row = sorted(by_top[top], key=lambda it: it['left'])
        if len(row) != ncols:
            continue
        first = row[0]['left']
        near = [it for it in items if it['left'] < first - 4 and abs(it['top'] - top) <= 7]
        name_text = ' '.join(it['text'] for it in sorted(near, key=lambda it: it['left'])
                             if it['text'] != '✓')
        name = method_name(name_text)
        if not name:
            continue
        is_online = bool(online) and any(
            it['text'] == '✓' and abs((it['left'] + it['right']) / 2 - (online[0]['left'] + online[0]['right']) / 2) < 25
            for it in near)
        out.append(dict(
            method=name, online=is_online, top=top,
            bottom=max(it['bottom'] for it in row),
            values=[None if it['text'] == '-' else float(it['text']) for it in row],
            bold=[it['bold'] for it in row]))
    return out


def grouped(n, spec, ncols=10, check_online=False):
    """Split Table n's rows into the paper's conditions and groups, checking the order."""
    found = rows(PAGES, n, ncols)
    want = [m for _, groups in spec for _, ms in groups for m in ms]
    got = [r['method'] for r in found]
    if got != want:
        sys.exit(f'Table {n}: expected rows {want}, found {got}')
    it = iter(found)
    conds = []
    for label, groups in spec:
        gs = []
        for glabel, ms in groups:
            rs = [next(it) for _ in ms]
            if check_online and any(r['online'] != (glabel == 'Online') for r in rs):
                sys.exit(f'Table {n}: online marks do not match the {label} / {glabel} group')
            gs.append(dict(label=glabel, rows=[dict(
                method=r['method'], values=r['values'][:9], rank=r['values'][9],
                best=[i for i, b in enumerate(r['bold'][:9]) if b]) for r in rs]))
        conds.append(dict(label=label, groups=gs))
    return conds


OFF = ['VGGT', 'π³', 'MapAnything', 'DepthAnything3', 'UniT (G = N)']
ON = ['CUT3R', 'StreamVGGT', 'TTT3R', 'Stream3R', 'UniT (G = 1)']
STD = [('Scale-invariant', [('Offline', OFF), ('Online', ON)]),
       ('Metric-scale', [('Offline', ['MapAnything', 'DepthAnything3', 'UniT (G = N)']),
                         ('Online', ['CUT3R', 'TTT3R', 'Stream3R', 'UniT (G = 1)'])])]
MONO = [('Scale-invariant', [('', ['VGGT', 'π³', 'MapAnything', 'DepthAnything3', 'CUT3R',
                                   'StreamVGGT', 'TTT3R', 'Stream3R', 'UniT'])]),
        ('Metric-scale', [('', ['MapAnything', 'DepthAnything3', 'CUT3R', 'TTT3R', 'Stream3R', 'UniT'])])]
MM = [(c, [('', ['MapAnything', 'DepthAnything3', 'UniT (G = N)'])])
      for c in ['K', 'RT', 'D', 'K+RT', 'K+D', 'RT+D', 'K+RT+D']]
DC = [(c, [('', ['MapAnything', 'DepthAnything3', 'UniT'])]) for c in ['Uniform', 'LiDAR', 'SfM', 'Grid']]

PM = [['Acc.', 'down'], ['Comp.', 'down'], ['N.C.', 'up']]
DM = [['AbsRel', 'down'], ['RMSE', 'down'], ['δ < 1.25', 'up']]
TABLES = {
    'reconstruction': (3, STD, ['7-Scenes', 'NRGBD', 'DTU'], PM, 'table3_reconstruction.png'),
    'pose': (4, STD, ['Sintel', 'TUM-Dynamic', 'ScanNetV2'],
             [['ATE', 'down'], ['RPE trans.', 'down'], ['RPE rot.', 'down']], 'table4_pose.png'),
    'videoDepth': (5, STD, ['Sintel', 'Bonn', 'ETH3D'], DM, 'table5_video_depth.png'),
    'monoDepth': (6, MONO, ['Sintel', 'KITTI', 'NYUv2'], DM, 'table6_mono_depth.png'),
    'multiModal': (8, MM, ['7-Scenes', 'ETH3D', 'ScanNetV2'], PM, 'table8_multimodal.png'),
    'depthCompletion': (9, DC, ['Sintel', 'KITTI', 'NYUv2'], DM, 'table9_depth_completion.png'),
}


def plain(name):
    # The page names the UniT row "UniT" and labels the variant from the group.
    return 'UniT' if name.startswith('UniT (G = ') and ',' not in name else name


def complexity():
    found = rows(PAGES, 2, 3)
    want = ['VGGT', 'π³', 'MapAnything', 'DepthAnything3', 'UniT (G = N)', 'CUT3R', 'StreamVGGT',
            'TTT3R', 'Stream3R', 'UniT (G = 1, Q = 1)', 'UniT (G = 1, Q = N/3)', 'UniT (G = 1, Q = N)']
    got = [r['method'] for r in found]
    if got != want:
        sys.exit(f'Table 2: expected rows {want}, found {got}')
    return dict(table='Table 2', note='Image-only, 448×224, 50-image sequences, one RTX 4090D.', rows=[
        dict(method=r['method'], online=r['online'], params=r['values'][0], fps=r['values'][1], mem=r['values'][2])
        for r in found])


def kitti():
    found = rows(PAGES, 7, 12)
    want = ['StreamVGGT', 'TTT3R', 'UniT', 'VGGT-Long', 'UniT-Long']
    got = [r['method'] for r in found]
    if got != want:
        sys.exit(f'Table 7: expected rows {want}, found {got}')
    _, _, items = region(PAGES, 7)
    head = [it for it in items if it['top'] < found[0]['top'] - 4]
    seqs = [it['text'] for it in sorted(head, key=lambda it: it['left']) if re.fullmatch(r'\d\d', it['text'])]
    frames = [int(it['text']) for it in sorted(head, key=lambda it: it['left']) if re.fullmatch(r'\d{3,4}', it['text'])]
    km = [float(it['text'][:-2]) for it in sorted(head, key=lambda it: it['left'])
          if re.fullmatch(r'\d+\.\d+km', it['text'])]
    if not (len(seqs) == len(frames) == len(km) == 11):
        sys.exit(f'Table 7: header has {len(seqs)} sequences, {len(frames)} frame counts, {len(km)} lengths')
    return dict(table='Table 7', note='Scale-aligned ATE (m); "–" is out of memory.',
                sequences=[dict(id=s, frames=f, km=k) for s, f, k in zip(seqs, frames, km)],
                rows=[dict(method=r['method'], chunked=r['method'].endswith('-Long'), values=r['values'][:11],
                           avg=r['values'][11], avgBest=r['bold'][11],
                           best=[i for i, b in enumerate(r['bold'][:11]) if b])
                      for r in found])


def crop_images(pdf, outdir):
    jobs = [(n, f) for n, _, _, _, f in TABLES.values()] + [(7, 'table7_kitti_odometry.png')]
    with tempfile.TemporaryDirectory() as tmp:
        for n, fname in jobs:
            pi, cap, items = region(PAGES, n)
            ncols = {7: 12}.get(n, 10)
            last = max(r['bottom'] for r in rows(PAGES, n, ncols))
            # A footnote line ("Reported using ...") may sit just under the last row.
            notes = [it['top'] for it in items if last < it['top'] <= last + 22
                     and it['text'].startswith(('Reported', 'The results'))]
            body = [it for it in items if it['top'] <= last
                    or any(abs(it['top'] - t) <= 3 for t in notes)] + [cap]
            x0 = min(it['left'] for it in body) - 8
            x1 = max(it['right'] for it in body) + 8
            y0 = cap['top'] - 8
            y1 = max(it['bottom'] for it in body) + 10
            base = f'{tmp}/t{n}'
            subprocess.run(['pdftoppm', '-r', '216', '-f', str(pi + 1), '-l', str(pi + 1), '-singlefile',
                            '-x', str(x0 * SCALE), '-y', str(y0 * SCALE),
                            '-W', str((x1 - x0) * SCALE), '-H', str((y1 - y0) * SCALE),
                            '-png', pdf, base], check=True)
            subprocess.run(['cp', base + '.png', f'{outdir}/{fname}'], check=True)
            print(fname, (x1 - x0) * SCALE, (y1 - y0) * SCALE)


if __name__ == '__main__':
    pdf, dest = sys.argv[1], sys.argv[2]
    PAGES = load(pdf)
    out = {}
    for key, (n, spec, datasets, metrics, _) in TABLES.items():
        conds = grouped(n, spec, check_online=spec is STD)
        for c in conds:
            for g in c['groups']:
                for r in g['rows']:
                    r['method'] = plain(r['method'])
        out[key] = dict(table=f'Table {n}', datasets=datasets, metrics=metrics, conditions=conds)
    out['complexity'] = complexity()
    out['kitti'] = kitti()
    src = ('// Generated by tools/build_results_data.py from the tables of the IJCV 2026 paper PDF.\n'
           '// Do not edit by hand: values, average ranks and the paper\'s bold "best" marks are\n'
           '// copied verbatim from the PDF text layer.\n'
           'window.UNIT_RESULTS = ' + json.dumps(out, ensure_ascii=False, separators=(',', ':')) + ';\n')
    open(dest, 'w').write(src)
    print(dest, len(src), 'bytes')
    if '--images' in sys.argv:
        crop_images(pdf, sys.argv[sys.argv.index('--images') + 1])
