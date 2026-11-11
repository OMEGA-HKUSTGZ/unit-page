# unit-page

Lab standard: <https://github.com/OMEGA-HKUSTGZ/.github-private/blob/main/STANDARD.md>

## 这是什么

Static UniT project page, copied by omega-lab-site to `/projects/unit/`.
Point clouds are served separately by the existing same-origin unit-media Pages.

## 写在哪里

- Page: `index.html`, `assets/css/`, `assets/js/`; no page build step.
- Point-cloud URL/version and loader: `assets/js/viewer.js`.
- Keep scene views and interactions intact when changing resource hosting.
- Point clouds are not in this repository's tree: the six files live in unit-media, whose
  manifest holds their provenance and checksums. `tools/point-cloud-release.json` records the
  bytes the check expects; new bytes need new URLs and a new record.

## 怎么检查

```sh
node tools/check.mjs
```

CI runs the same command (`--offline` skips the real Range requests to the media site).
Look at the page with `node tools/serve.mjs`: it serves the page at `/projects/unit/` and passes
`/unit-media/point-clouds/` through from the media site, with HTTP Range. A pull request gets a preview at
`https://omega-hkustgz.github.io/preview/unit-pr-<number>/`.

## 坑

- Keep `/projects/unit/`, canonical and the `../../` lab navigation unchanged.
- Point clouds load from the root-relative `/unit-media/point-clouds/`: the page is also served
  at preview depths, where a page-relative path misses the media site.
- Do not overwrite frozen point-cloud URLs or move them to Git LFS.
- A 200 whole-file response is a production failure, even if it can render.
- Bump the viewer script URL and cache names when changing resource identity.
- Publish and verify new media before making the viewer reference it.
- Do not put point clouds back in this repository or rewrite its history; see README, Rollback.
