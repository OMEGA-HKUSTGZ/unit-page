// The page's one check command; CI runs the same.
//   node tools/check.mjs             scripts parse, loader tests, published point clouds
//   node tools/check.mjs --offline   without the last step, which needs the network
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

process.chdir(fileURLToPath(new URL('..', import.meta.url)));
function run(...args) {
  const result = spawnSync(process.execPath, args, { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status || 1);
}
for (const file of readdirSync('assets/js').filter(name => name.endsWith('.js'))) run('--check', `assets/js/${file}`);
run('--check', 'tools/serve.mjs');
run('--test', 'tests/point-cloud-loader.test.mjs');
// Real Range requests against the media site: a missing or incompatible media source must
// not become a page dependency unnoticed.
if (!process.argv.includes('--offline')) run('tools/verify-point-cloud-host.mjs');
