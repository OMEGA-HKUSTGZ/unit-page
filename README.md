# UniT — OMEGA Lab project page

Project page for **UniT: Unified Geometry Learning with Group Autoregressive Transformer**, styled to match the OMEGA Lab website.

- Paper: <https://arxiv.org/abs/2605.21131>
- Code: <https://github.com/Wang-xjtu/UniT>
- Live demo: <https://enceladush-unit.hf.space/>
- Original project page: <https://sc2i-hkustgz.github.io/UniT/> (this page now carries all of its content, including the interactive point clouds)

## Deployment

A static page with no build step. It is published with the lab site at <https://omega-hkustgz.github.io/projects/unit/> by the site's deploy workflow (re-run it in `OMEGA-HKUSTGZ/omega-lab-site` after changing this page); header and breadcrumb links use relative paths (`../../`) back to the lab site, so keep that depth if the path changes.

Preview locally from a directory that mirrors the deployed path:

```sh
mkdir -p /tmp/omega-preview/omega/projects
ln -s "$PWD" /tmp/omega-preview/omega/projects/unit
python3 -m http.server 4390 --directory /tmp/omega-preview
# open http://127.0.0.1:4390/omega/projects/unit/
```

The point-cloud viewer streams `.pnts` chunks with HTTP Range requests. `python3 -m http.server` ignores Range headers, so locally the viewer falls back to downloading each selected scene whole; GitHub Pages supports Range, so the deployed page streams.

The published page is indexable and uses the lab's official project URL as its canonical address. Link previews use the existing introduction poster.

## Assets

- Video, figures and example clips come from the original UniT project page. The intro video is re-encoded to 720p H.264 for faster loading.
- Colors, typography and the Ω mark mirror `omega-lab-site` (`src/styles/global.css`, `public/images/brand/omega-mark.svg`). Update both together.
- Fonts: Inter, Space Grotesk and Source Serif 4 (SIL Open Font License; see `assets/fonts/`). They are self-hosted so the page does not depend on Google Fonts.
- Interactive point clouds: `assets/media/point-clouds/<scene>.pnts` (six scenes, about 173 MB in total) are the chunk-indexed files from the original page, committed as plain Git objects. Do not move them to Git LFS: GitHub Pages does not serve LFS files. Only the selected scene is downloaded, and only once the Examples section is in view.
- The viewer (`assets/js/viewer.js`) is ported from the original page's `script.js`. It loads three.js r128 and OrbitControls from cdnjs and jsdelivr on demand. Each scene's initial view (camera, rotation, point size, brightness, background) lives in `DEMO_CONFIGS` at the top of that file, baked from the original page's live config; edit it there to change what visitors see first. The settings button opens view settings whose changes last only for the visit. Measure draws its dots, line and distance as a screen-space overlay projected from the cloud each frame, so they keep one size at any zoom; Esc leaves measuring. The point-size slider shows on-screen pixels (1–10 px); the stored `pointSize` stays in world units. On phones and other light devices (coarse pointer, or `navigator.deviceMemory` ≤ 4) a scene streams at most `LIGHT_POINT_BUDGET` points (2 M); a "Load all" button then loads the rest on request.
- The scene thumbnails reuse the example clips in `assets/media/examples/`.
- Method figure (`assets/js/method.js`): the global-attention mask for N = 4 frames with a group-size switch (G = 1, 2, N). Picking a group size plays the autoregressive steps once: rows of the mask fill per step, earlier frames pass through a KV-cache queue of Q = 2, and point maps appear as each group is decoded. Frames and point maps are 7-Scenes examples from the paper's Fig. 3 (`assets/media/method/`).
- The benchmark radar (`assets/js/radar.js`) uses the same twelve spokes as the radar in the paper's Fig. 1 (Tables 3–6). A spoke's score is the mean, over that table's three metrics, of each model's value relative to the best model shown, so 1.0 on the rim means best on every metric.
- `assets/js/results-data.js` holds Tables 2–8 copied from the paper's LaTeX source (arXiv 2605.21131, `tab/*.tex`), including the paper's average ranks and bold best marks. If the paper's tables change, regenerate it with `tools/build_results_data.py` rather than editing numbers by hand. The radar covers Tables 3–6, and its "Table N from the paper" button opens that table's image. Below it sit three claim cards, one per setting, drawn by `assets/js/results.js`: long horizon with a small pose-error curve (its button opens Fig. 9 redrawn in full and Table 2 speed and memory as a ranked board), and multi-modal (Table 7) and depth completion (Table 8) with UniT's placing per setting by the paper's average rank (their buttons open the paper's table). The card headlines in `index.html` (500 frames, 2.9×, 5 of 7, all 4) come from these data; update them together.
- The long-horizon charts read `assets/js/longhorizon-data.js`. The paper gives Fig. 9 only as a plot, so those values were read from the figure's markers and are accurate to about ±0.005; replace them if the authors publish the raw numbers. The original figure stays available under "Original figure".
- The Analysis section (`assets/js/analysis.js`) takes the overview's four capabilities in turn and pairs each with its evidence: the group-size curve (Fig. 10), Table 7 as a matrix of input combinations, a place-by-average-rank matrix from Tables 3–6, and the ablations of Tables 9–11. It reads `assets/js/analysis-data.js` (Tables 1, 9, 10 and 11 copied from the paper's LaTeX source, plus the two curves of Fig. 10, which the paper gives only as a plot; those were read from the figure's markers and are accurate to about ±0.001 m) and `assets/js/results-data.js`. The training-data strip at the end of the Method section (Table 1) is drawn by the same script. Headline numbers written in `index.html` (−16%, 5 / 7, 7 / 7, N/3) come from these data; update them together.
