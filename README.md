# UniT — OMEGA Lab project page

Project page for **UniT: Unified Geometry Learning with Group Autoregressive Transformer**, styled to match the OMEGA Lab website.

- Paper: <https://arxiv.org/abs/2605.21131>
- Code: <https://github.com/Wang-xjtu/UniT>
- Live demo: <https://enceladush-unit.hf.space/>
- Original project page: <https://sc2i-hkustgz.github.io/UniT/> (this page now carries all of its content, including the interactive point clouds)

## Deployment

A static page with no build step. It is published with the lab site at <https://omega-hkustgz.github.io/projects/unit/> by the site's deploy workflow (re-run it in `OMEGA-HKUSTGZ/omega-lab-site` after changing this page); header and breadcrumb links use relative paths (`../../`) back to the lab site, so keep that depth if the path changes.

Run the same checks as CI before publishing:

```sh
node tools/check.mjs
node tools/verify-point-cloud-host.mjs
```

The second command compares small head/middle/tail Range responses from the
published media with the retained originals. The publish workflow runs both
checks before notifying the lab site, so a missing or incompatible media source
cannot silently become a new page dependency.

Preview locally from a directory that mirrors both deployed paths:

```sh
mkdir -p /tmp/omega-preview/omega/projects /tmp/omega-preview/omega/unit-media
ln -s "$PWD" /tmp/omega-preview/omega/projects/unit
ln -s "$PWD/assets/media/point-clouds" /tmp/omega-preview/omega/unit-media/point-clouds
python3 -m http.server 4390 --directory /tmp/omega-preview
# open http://127.0.0.1:4390/omega/projects/unit/?full-file-preview=1
```

The viewer requires validated HTTP Range responses in production. Python's
basic server ignores Range, so whole-file fallback is permitted only on loopback
with the explicit `full-file-preview=1` option. This is a visual preview, not a
Range acceptance test. Use a Range-capable server for streaming regression checks.

The published page is indexable and uses the lab's official project URL as its canonical address. Link previews use the existing introduction poster.

## Assets

- Video, figures and example clips come from the original UniT project page. The intro video is re-encoded to 720p H.264 for faster loading.
- Colors, typography and the Ω mark mirror `omega-lab-site` (`src/styles/global.css`, `public/images/brand/omega-mark.svg`). Update both together.
- Fonts: Inter, Space Grotesk and Source Serif 4 (SIL Open Font License; see `assets/fonts/`). They are self-hosted so the page does not depend on Google Fonts.
- Interactive point clouds: six scenes, 180,977,460 bytes (172.59 MiB), served by the existing [unit-media Pages](https://omega-hkustgz.github.io/unit-media/) at `../../unit-media/point-clouds/<scene>.pnts?v=0e1438880f2957264dab2b617f9d36d15db4d9ec`. These v1 paths are frozen; the query isolates caches but is not a substitute for immutability. Future data must use a new versioned path. Their source copies stay in `assets/media/point-clouds/` for verification and rollback; the lab publisher excludes that directory from `dist`. This shrinks publication, but does not remove the current source-clone download. Do not move them to Git LFS. Only the selected scene is loaded when Examples enters view.
- The viewer (`assets/js/viewer.js`) is ported from the original page's `script.js`. It loads three.js r128 and OrbitControls from cdnjs and jsdelivr on demand. Each scene's initial view (camera, rotation, point size, brightness, background) lives in `DEMO_CONFIGS` at the top of that file, baked from the original page's live config; edit it there to change what visitors see first. The settings button opens view settings whose changes last only for the visit. Measure draws its dots, line and distance as a screen-space overlay projected from the cloud each frame, so they keep one size at any zoom; Esc leaves measuring. The point-size slider shows on-screen pixels (1–10 px); the stored `pointSize` stays in world units. On phones and other light devices (coarse pointer, or `navigator.deviceMemory` ≤ 4), the 2 M point budget rounds up to complete chunks (31 chunks / 2,031,616 points for large scenes); a "Load all" button then loads the rest on request.
- The scene thumbnails reuse the example clips in `assets/media/examples/`.
- Method figure (`assets/js/method.js`): the global-attention mask for N = 4 frames with a group-size switch (G = 1, 2, 3, N; the G = 3 case leaves a one-frame last group, since the paper only defines G dividing N). Picking a group size plays the autoregressive steps once: rows of the mask fill per step, earlier frames pass through a KV-cache queue of Q = 2, and point maps appear as each group is decoded. Frames and point maps are 7-Scenes examples from the paper's Fig. 3 (`assets/media/method/`).
- The benchmark radar (`assets/js/radar.js`) uses the same twelve spokes as the radar in the paper's Fig. 1 (Tables 3–6). A spoke's score is the mean, over that table's three metrics, of each model's value relative to the best model shown, so 1.0 on the rim means best on every metric.
- `assets/js/results-data.js` holds Tables 2–8 copied from the paper's LaTeX source (arXiv 2605.21131, `tab/*.tex`), including the paper's average ranks and bold best marks. If the paper's tables change, regenerate it with `tools/build_results_data.py` rather than editing numbers by hand. The radar covers Tables 3–6, and its "Table N from the paper" button opens that table's image. Below it sit three claim cards, one per setting, drawn by `assets/js/results.js`: long horizon with a small pose-error curve (Fig. 9 redrawn in full and Table 2 speed and memory as a ranked board sit open below the cards; its button hides them), and multi-modal (Table 7) and depth completion (Table 8) with UniT's placing per setting by the paper's average rank (their buttons open the paper's table). The card headlines in `index.html` (500 frames, 2.9×, 5 of 7, all 4) come from these data; update them together.
- The long-horizon charts read `assets/js/longhorizon-data.js`. The paper gives Fig. 9 only as a plot, so those values were read from the figure's markers and are accurate to about ±0.005; replace them if the authors publish the raw numbers. The original figure stays available under "Original figure".
- The Analysis section (`assets/js/analysis.js`) takes the overview's four capabilities in turn and pairs each with its evidence: the group-size curve (Fig. 10), Table 7 as a matrix of input combinations, a place-by-average-rank matrix from Tables 3–6, and the ablations of Tables 9–11. It reads `assets/js/analysis-data.js` (Tables 1, 9, 10 and 11 copied from the paper's LaTeX source, plus the two curves of Fig. 10, which the paper gives only as a plot; those were read from the figure's markers and are accurate to about ±0.001 m) and `assets/js/results-data.js`. The training-data strip at the end of the Method section (Table 1) is drawn by the same script. Headline numbers written in `index.html` (−16%, 5 / 7, 7 / 7, N/3) come from these data; update them together.

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

The initial rollout keeps the original files in the lab publication while the
new viewer is validated. Only after that deployment and a cache compatibility
window does the lab site exclude them. Page links, canonical and `#examples`
remain unchanged. Old binary URLs under `/projects/unit/assets/media/point-clouds/`
stop working once exclusion is enabled; an HTML redirect cannot preserve Range.

To roll back without breaking the viewer:

1. In omega-lab-site, remove only the point-cloud exclusion in `project-pages.json`
   and temporarily restore the publication budget to 260,000,000 bytes. Publish
   and verify the original six paths first. Keep the other housekeeping exclusions.
2. Set `POINT_CLOUD_BASE` back to `assets/media/point-clouds/`, bump both cache names
   and the script query, and republish through the usual lab workflow. Keep the
   Range validation and existing interactions.
3. Verify all scenes and phone controls. Retain unit-media for cached viewers;
   do not delete it or rewrite repository history.

Record both source revisions when releasing: rerunning an old lab-site workflow
alone is insufficient because it fetches the project page's current default branch.
The complete rollback restores the approximately 239 MB publication and may take
several minutes; it is not an instant service switch.
