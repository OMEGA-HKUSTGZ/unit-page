# UniT — OMEGA Lab project page

Project page for **UniT: Unified Geometry Learning with Group Autoregressive Transformer**, styled to match the OMEGA Lab website.

- Paper: <https://arxiv.org/abs/2605.21131>
- Code: <https://github.com/Wang-xjtu/UniT>
- Live demo: <https://enceladush-unit.hf.space/>
- Original project page (interactive point clouds): <https://sc2i-hkustgz.github.io/UniT/>

## Deployment

A static page with no build step. It is published with the lab site at <https://omega-hkustgz.github.io/projects/unit/> by the site's deploy workflow (re-run it in `OMEGA-HKUSTGZ/omega-lab-site` after changing this page); header and breadcrumb links use relative paths (`../../`) back to the lab site, so keep that depth if the path changes.

Preview locally from a directory that mirrors the deployed path:

```sh
mkdir -p /tmp/omega-preview/omega/projects
ln -s "$PWD" /tmp/omega-preview/omega/projects/unit
python3 -m http.server 4390 --directory /tmp/omega-preview
# open http://127.0.0.1:4390/omega/projects/unit/
```

The published page is indexable and uses the lab's official project URL as its canonical address. Link previews use the existing introduction poster.

## Assets

- Video, figures and example clips come from the original UniT project page. The intro video is re-encoded to 720p H.264 for faster loading.
- Colors, typography and the Ω mark mirror `omega-lab-site` (`src/styles/global.css`, `public/images/brand/omega-mark.svg`). Update both together.
- Fonts: Inter, Space Grotesk and Source Serif 4 (SIL Open Font License; see `assets/fonts/`). They are self-hosted so the page does not depend on Google Fonts.
