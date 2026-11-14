import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

async function scriptsIn(path) {
  const entries = await readdir(path, { withFileTypes: true });
  const paths = await Promise.all(entries.map((entry) => entry.isDirectory()
    ? scriptsIn(join(path, entry.name))
    : /\.(m?js)$/.test(entry.name) ? [join(path, entry.name)] : []));
  return paths.flat();
}
const files = ['vite.config.js', 'playwright.config.js', ...await scriptsIn('src'), ...await scriptsIn('functions'), ...await scriptsIn('scripts'), ...await scriptsIn('tests')];
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) { process.stderr.write(result.stderr); process.exit(1); }
}
console.log(`Syntax checked ${files.length} JavaScript files.`);
