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
- The viewer (`assets/js/viewer.js`) is ported from the original page's `script.js`. It loads three.js r128 and OrbitControls from cdnjs and jsdelivr on demand. Each scene's initial view (camera, rotation, point size, brightness, background) lives in `DEMO_CONFIGS` at the top of that file, baked from the original page's live config; edit it there to change what visitors see first. The gear button opens view controls whose changes last only for the visit.
- The scene thumbnails reuse the example clips in `assets/media/examples/`.
