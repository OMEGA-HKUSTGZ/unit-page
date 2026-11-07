# unit-page

Lab standard: <https://github.com/OMEGA-HKUSTGZ/.github-private/blob/main/STANDARD.md>

## 这是什么

Static UniT project page, copied by omega-lab-site to `/projects/unit/`.
Point clouds are served separately by the existing same-origin unit-media Pages.

## 写在哪里

- Page: `index.html`, `assets/css/`, `assets/js/`; no page build step.
- Point-cloud URL/version and loader: `assets/js/viewer.js`.
- Keep scene views and interactions intact when changing resource hosting.
- Source point clouds remain under `assets/media/point-clouds/` for checks and rollback;
  omega-lab-site excludes that directory from its published artifact.
- Data provenance and frozen v1 checksums live in unit-media; new bytes need new URLs.

## 怎么检查

```sh
node tools/check.mjs
node tools/verify-point-cloud-host.mjs
```

CI runs the same checks before notifying the lab site. Preview desktop and phone
interactions with a Range-capable server; see README for the local path layout.

## 坑

- Keep `/projects/unit/`, canonical and the `../../` lab navigation unchanged.
- Do not overwrite frozen point-cloud URLs or move them to Git LFS.
- A 200 whole-file response is a production failure, even if it can render.
- Bump the viewer script URL and cache names when changing resource identity.
- Publish and verify new media before making the viewer reference it.
- Rollback must restore the site's copied files and size budget before local URLs.
