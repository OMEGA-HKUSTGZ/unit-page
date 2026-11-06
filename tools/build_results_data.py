"""Build assets/js/results-data.js from the paper LaTeX source.

Usage: python3 tools/build_results_data.py <unpacked arXiv source dir> assets/js/results-data.js
(download the source with: curl -L -o src.tar.gz https://arxiv.org/e-print/2605.21131)
"""
import re, json, sys
root = sys.argv[1]
NUM = r'-?\d+\.\d+'
def clean(s):
    s = re.sub(r'\\cellcolor\{[^}]*\}', '', s)
    s = re.sub(r'\\cite\{[^}]*\}', '', s)
    return s
def method_name(cell):
    c = cell
    c = c.replace(r'$\pi^3$', 'π³')
    m = re.search(r'G\\!=\\!(N|1)', c)
    base = re.sub(r'\\textbf\{|\}|\\\\|\$.*?\$', '', c)
    base = re.sub(r'\(.*', '', base).strip()
    base = re.sub(r'\\[a-z]+', '', base).strip()
    if base.startswith('Ours'): base = 'UniT'
    return base
def parse(fname, cond_labels, group_split=True, mm=False):
    txt = clean(open(f'{root}/tab/{fname}').read())
    body = txt.split('\\midrule', 1)[1].split('\\bottomrule')[0]
    conds = body.split('\\midrule')
    out = []
    for ci, block in enumerate(conds):
        groups = [[]]
        for line in block.split('\n'):
            if 'cmidrule(lr){2-' in line or 'cmidrule(lr){4-' in line:
                groups.append([]); continue
            if '\\\\' not in line: continue
            nums = re.findall(r'(?<![\w.])' + NUM, re.sub(r'\\underline\{|\\textbf\{', '', line))
            if len(nums) < 10: continue
            nums = [float(x) for x in nums[-10:]]
            cells = [c for c in line.split('&')]
            name = None
            for c in cells:
                n = method_name(c)
                if re.search(r'[A-Za-zπ]', n) and not re.fullmatch(r'\s*', n):
                    if any(k in n for k in ['VGGT','π³','MapAnything','DepthAnything3','CUT3R','StreamVGGT','UniT']):
                        name = n; break
            best = []
            # mark best (bold) per metric from raw line
            raw_cells = [re.sub(r'\s', '', c) for c in cells]
            numcells = [c for c in raw_cells if re.search(NUM, c)][-10:]
            bold = [c.startswith('\\textbf') or '\\textbf{' in c for c in numcells]
            under = ['\\underline{' in c for c in numcells]
            online = '\\checkmark' in line and not mm
            groups[-1].append({'method': name, 'online': online, 'values': nums[:9], 'rank': nums[9], 'bold': bold[:9], 'rankBold': bold[9], 'second': under[:9]})
        groups = [g for g in groups if g]
        out.append({'label': cond_labels[ci], 'groups': groups})
    return out
spec = {
 'reconstruction': ('pointmap.tex', ['Scale-invariant','Metric-scale']),
 'pose': ('pose.tex', ['Scale-invariant','Metric-scale']),
 'videoDepth': ('videodepth.tex', ['Scale-invariant','Metric-scale']),
 'monoDepth': ('monocular.tex', ['Scale-invariant','Metric-scale']),
 'multiModal': ('pointmap_mm.tex', ['K','RT','D','K+RT','K+D','RT+D','K+RT+D']),
 'depthCompletion': ('depthcompletion.tex', ['Uniform','LiDAR','SfM','Grid']),
}
res = {}
for k,(f,labels) in spec.items():
    res[k] = parse(f, labels, mm=(k=='multiModal'))
d = res
pm = [['Acc.', 'down'], ['Comp.', 'down'], ['N.C.', 'up']]
dm = [['AbsRel', 'down'], ['RMSE', 'down'], ['δ < 1.25', 'up']]
meta = {
 'reconstruction': dict(table='Table 3', datasets=['7-Scenes','NRGBD','DTU'], metrics=pm, groups=['Offline','Online']),
 'pose': dict(table='Table 4', datasets=['Sintel','TUM-Dynamic','ScanNetV2'], metrics=[['ATE','down'],['RPE trans.','down'],['RPE rot.','down']], groups=['Offline','Online']),
 'videoDepth': dict(table='Table 5', datasets=['Sintel','Bonn','ETH3D'], metrics=dm, groups=['Offline','Online']),
 'monoDepth': dict(table='Table 6', datasets=['Sintel','KITTI','NYUv2'], metrics=dm, groups=['']),
 'multiModal': dict(table='Table 7', datasets=['7-Scenes','ETH3D','ScanNetV2'], metrics=pm, groups=['']),
 'depthCompletion': dict(table='Table 8', datasets=['Sintel','KITTI','NYUv2'], metrics=dm, groups=['']),
}
out = {}
for k, conds in d.items():
    m = meta[k]
    out[k] = dict(table=m['table'], datasets=m['datasets'], metrics=m['metrics'], conditions=[
        dict(label=c['label'], groups=[dict(label=m['groups'][gi] if gi < len(m['groups']) else '', rows=[
            dict(method=r['method'], values=r['values'], rank=r['rank'], best=[i for i,b in enumerate(r['bold']) if b])
            for r in g]) for gi, g in enumerate(c['groups'])]) for c in conds])
out['complexity'] = dict(table='Table 2', note='Image-only, 448×224, 50-image sequences, one RTX 4090.', rows=[
 dict(method='VGGT', online=False, params=1.19, fps=31.98, mem=11.7),
 dict(method='π³', online=False, params=0.96, fps=46.18, mem=6.4),
 dict(method='MapAnything', online=False, params=0.56, fps=23.77, mem=15.9),
 dict(method='DepthAnything3', online=False, params=1.40, fps=22.36, mem=11.4),
 dict(method='UniT (G = N)', online=False, params=1.18, fps=33.83, mem=8.1),
 dict(method='CUT3R', online=True, params=0.79, fps=19.64, mem=4.7),
 dict(method='StreamVGGT', online=True, params=1.19, fps=11.50, mem=9.6),
 dict(method='UniT (G = 1, Q = 1)', online=True, params=1.18, fps=20.41, mem=6.7),
 dict(method='UniT (G = 1, Q = N/3)', online=True, params=1.18, fps=16.44, mem=7.4),
 dict(method='UniT (G = 1, Q = N)', online=True, params=1.18, fps=13.38, mem=9.1),
])
src = ('// Generated from the LaTeX tables of arXiv:2605.21131 (tab/*.tex). Do not edit by hand:\n'
       '// values, ranks and the paper\'s bold "best" marks are copied verbatim.\n'
       'window.UNIT_RESULTS = ' + json.dumps(out, ensure_ascii=False, separators=(',', ':')) + ';\n')
open(sys.argv[2], 'w').write(src)
print(len(src))
