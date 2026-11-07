import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

process.chdir(fileURLToPath(new URL('..', import.meta.url)));
for (const file of readdirSync('assets/js').filter(name => name.endsWith('.js'))) {
  const result = spawnSync(process.execPath, ['--check', `assets/js/${file}`], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status || 1);
}
const result = spawnSync(process.execPath, ['--test', 'tests/point-cloud-loader.test.mjs'], { stdio: 'inherit' });
process.exit(result.status ?? 1);
