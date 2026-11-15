# UniT — OMEGA Lab project page

Project page for **UniT: Unified Geometry Learning with Group Causal Transformer**, styled to match the OMEGA Lab website.

The page follows the IJCV 2026 version of the paper, which renamed the model from "Group Autoregressive Transformer" (arXiv v1) and added TTT3R, Stream3R and VGGT-Long as baselines, the KITTI-Odometry experiment and Tables 13–14. Its tables and figures are renumbered accordingly. Until that version is public, the Paper button still links to arXiv.

- Paper: <https://arxiv.org/abs/2605.21131>
- Code: <https://github.com/Wang-xjtu/UniT>
- Live demo: <https://enceladush-unit.hf.space/>
- Original project page: <https://sc2i-hkustgz.github.io/UniT/> (this page now carries all of its content, including the interactive point clouds)

## Deployment

A static page with no build step. It is published with the lab site at <https://omega-hkustgz.github.io/projects/unit/>: a push to `main` asks `OMEGA-HKUSTGZ/omega-lab-site` to republish; header and breadcrumb links use relative paths (`../../`) back to the lab site, so keep that depth if the path changes.

Run the same check as CI before publishing:

```sh
node tools/check.mjs
```

It parses the scripts, runs the loader tests and compares small head/middle/tail Range
responses from the published media with the bytes recorded in `tools/point-cloud-release.json`
(`--offline` skips that last step). The publish workflow runs it before notifying the lab site, so a missing or
incompatible media source cannot silently become a new page dependency.

Preview locally:

```sh
node tools/serve.mjs            # http://127.0.0.1:4390/projects/unit/
node tools/serve.mjs 4390 /preview/site-pr-1/projects/unit/   # the depth of a lab-site preview
```

The server answers HTTP Range, which the viewer requires, and passes `/unit-media/point-clouds/`
through from the published media site (or serves local copies, if you put any under
`assets/media/point-clouds/`, which Git ignores). A server that ignores Range (such as
`python3 -m http.server`) needs `?full-file-preview=1`, which is permitted only on loopback and
is a visual preview, not a Range acceptance test.

Every pull request gets a preview at `https://omega-hkustgz.github.io/preview/unit-pr-<number>/`
(not indexed, removed when the pull request closes). The lab site's own pull-request previews
serve this page at `/preview/site-pr-<number>/projects/unit/`.

The published page is indexable and uses the lab's official project URL as its canonical address. Link previews use the existing introduction poster.

## Assets

- Figures and example clips come from the original UniT project page. The intro video is the authors' IJCV-version video (`videos_causal.mp4`, 1080p), re-encoded for faster loading: `ffmpeg -i videos_causal.mp4 -vf "scale=1280:-2,fps=30" -c:v libx264 -preset slow -crf 25 -pix_fmt yuv420p -movflags +faststart -an intro.mp4` (its audio track is silent). The poster is its title frame at 1.2 s.
- Colors, typography and the Ω mark mirror `omega-lab-site` (`src/styles/global.css`, `public/images/brand/omega-mark.svg`). Update both together.
- Fonts: Inter, Space Grotesk and Source Serif 4 (SIL Open Font License; see `assets/fonts/`). They are self-hosted so the page does not depend on Google Fonts.
- Interactive point clouds: six scenes, 180,977,460 bytes (172.59 MiB), served by the existing [unit-media Pages](https://omega-hkustgz.github.io/unit-media/) at `/unit-media/point-clouds/<scene>.pnts?v=0e1438880f2957264dab2b617f9d36d15db4d9ec`. The address is root-relative because the page is published at several depths (the lab site, its pull-request previews, this page's own previews); a path relative to the page reaches the media site from one depth only. These v1 paths are frozen; the query isolates caches but is not a substitute for immutability. Future data must use a new versioned path. They are no longer in this repository's tree: unit-media is the one place that holds them, and `tools/point-cloud-release.json` records the sizes and checksums the check expects. Earlier commits of this repository still contain the files, so a full clone still downloads them (`git clone --filter=blob:none` or `--depth 1` does not); the history is deliberately not rewritten. Do not move them to Git LFS: GitHub Pages serves LFS pointer files, not the data. Only the selected scene is loaded when Examples enters view.
- The viewer (`assets/js/viewer.js`) is ported from the original page's `script.js`. It loads three.js r128 and OrbitControls from cdnjs and jsdelivr on demand. Each scene's initial view (camera, rotation, point size, brightness, background) lives in `DEMO_CONFIGS` at the top of that file, baked from the original page's live config; edit it there to change what visitors see first. The settings button opens view settings whose changes last only for the visit. Measure draws its dots, line and distance as a screen-space overlay projected from the cloud each frame, so they keep one size at any zoom; Esc leaves measuring. The point-size slider shows on-screen pixels (1–10 px); the stored `pointSize` stays in world units. On phones and other light devices (coarse pointer, or `navigator.deviceMemory` ≤ 4), the 2 M point budget rounds up to complete chunks (31 chunks / 2,031,616 points for large scenes); a "Load all" button then loads the rest on request.
- The scene thumbnails reuse the example clips in `assets/media/examples/`.
- Method figure (`assets/js/method.js`): the global-attention mask for N = 4 frames with a group-size switch (G = 1, 2, 3, N; the G = 3 case leaves a one-frame last group, since the paper only defines G dividing N). Picking a group size plays the prediction steps once: rows of the mask fill per step, earlier frames pass through a KV-cache queue of Q = 2, and point maps appear as each group is decoded. Frames and point maps are 7-Scenes examples from the paper's Fig. 3 (`assets/media/method/`).
- The benchmark radar (`assets/js/radar.js`) uses the same twelve spokes as the radar in the paper's Fig. 1 (Tables 3–6). A spoke's score is the mean, over that table's three metrics, of each model's value relative to the best model shown, so 1.0 on the rim means best on every metric.
- `assets/js/results-data.js` holds Tables 2–9 of the IJCV paper, read from the PDF's text layer by `tools/build_results_data.py`, including the paper's average ranks and bold best marks (numbers set in the bold font). The script checks every table against the method order the paper prints and stops on any mismatch. If the paper's tables change, regenerate the data and the table images rather than editing numbers by hand: `python3 -I tools/build_results_data.py <paper.pdf> assets/js/results-data.js --images assets/media/results` (needs poppler). The radar covers Tables 3–6, and its "Table N from the paper" button opens that table's image. The Results section holds only the counts and the radar; long horizon (Table 7, Fig. 11), multi-modal input (Table 8) and depth completion (Table 9) are shown in the Key insights chapters, where a block's source label opens the paper's table. Table 2 (speed and memory) is in the data but not shown. `assets/js/results.js` now only defines the method colours.
- The sequence-length chart reads the pose curves of `assets/js/longhorizon-data.js`. The paper gives Fig. 11 (Fig. 9 in arXiv v1) only as a plot, so those values were read from the figure's markers and are accurate to about ±0.005; replace them if the authors publish the raw numbers.
- The Key insights section (`assets/js/analysis.js`, `#analysis`, placed before Results) follows the paper's own argument: its three challenges (view configurations, streaming memory, metric scale) and the modal-attention plug-in. Each chapter is a Problem → Insight → Result strip, then the paper's motivation exhibit beside an evidence panel. Text is kept to short phrases; each design is explained once, in its chapter's Insight step. The strips and motivation exhibits are written in `index.html`: Fig. 2 drawn as a capability matrix (from `paradigms` in `assets/js/analysis-data.js`, copied from the figure's check marks), Fig. 6 (attention while streaming) and Fig. 8 (training loss curves). The evidence panels are drawn by the script: the group-size curve (Fig. 12) and unified against specialized models (Table 13); KITTI-Odometry means with a per-sequence win strip (Table 7), sequence length on NRGBD (Fig. 11), queue capacity (Fig. 12) and the accuracy/efficiency trade-off (Fig. 13); the loss ablation (Table 11), a place-by-average-rank matrix from Tables 3–6 and Fig. 10; Table 8 as a matrix of input combinations and UniT's place per sparse-depth pattern (Table 9). It reads `assets/js/analysis-data.js` (Tables 1, 11 and 13 copied from the IJCV paper, plus the two curves of Fig. 12, unchanged from Fig. 10 of arXiv v1, which the paper gives only as a plot; those were read from the figure's markers and are accurate to about ±0.001 m), `assets/js/results-data.js` and `assets/js/longhorizon-data.js`. Figs. 6, 8, 10 and 13 are crops of the paper PDF rendered at 288 dpi (`assets/media/insights/`); replace them if the figures change. The binocular experiment (Table 14, Fig. 14), the drop-strategy and fusion ablations (Tables 12 and 10) are deliberately left out. The training-data strip at the end of the Method section (Table 1) is drawn by the same script. Headline numbers written in `index.html` (0.087 against 0.092, 5.1 km and 9 of 11, 15.1% and 8.0%, 7 / 7, 5 / 7) come from these data and figures; update them together.

## Data versions and rollback

The existing [unit-media manifest](https://github.com/OMEGA-HKUSTGZ/unit-media/blob/main/point-clouds-manifest.json)
records original SC2I and OMEGA source revisions, byte counts, Git blob IDs and
SHA-256 checksums. The files are unchanged copies of the existing public assets;
this deployment change asserts no new data license. Retain upstream attribution
and verify the redistribution scope before adding new third-party data.

For a new data version, publish a new path in unit-media first, wait for a
successful media deployment, and verify the actual 206 responses. Then change
`POINT_CLOUD_BASE` / `POINT_CLOUD_VERSION`, bump `PNTS_DB_NAME`, `CACHE_NAME` and
the viewer script query in `index.html`, and run the checks above. Never remove
media still referenced by a published or cached viewer.

The page has loaded the point clouds from unit-media since 2026-11-07, and the lab site has
left this repository's copies out of its publication since 2026-11-09. The copies were removed
from the tree after that; old binary URLs under `/projects/unit/assets/media/point-clouds/` no
longer exist.

Rollback, should the media site ever have to be abandoned:

1. Bring the six files back with an ordinary commit: `git revert` the commit that removed them
   (they are still in history), or copy them from unit-media and check them against its
   manifest.
2. In omega-lab-site, remove only the point-cloud exclusion in `project-pages.json` and restore
   the publication budget to 260,000,000 bytes. Publish and verify the six paths first.
3. Set `POINT_CLOUD_BASE` to `assets/media/point-clouds/`, bump both cache names and the script
   query, and republish through the usual lab workflow. Keep the Range validation.
4. Verify all scenes and phone controls. Retain unit-media for cached viewers; do not delete it
   or rewrite repository history.

Record both source revisions when releasing: rerunning an old lab-site workflow
alone is insufficient because it fetches the project page's current default branch.
The complete rollback restores the approximately 239 MB publication and may take
several minutes; it is not an instant service switch.
