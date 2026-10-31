import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const roots = ['src', 'scripts'];
const files = [];
async function walk(dir) {
  for (const item of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, item.name);
    if (item.isDirectory()) await walk(full);
    else if (full.endsWith('.js')) files.push(full);
  }
}
for (const root of roots) await walk(root);
let failed = false;
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) {
    failed = true;
    console.error(`FAIL ${file}\n${result.stderr}`);
  } else console.log(`OK   ${file}`);
}
if (failed) process.exit(1);
console.log(`Syntax check passed for ${files.length} JavaScript files.`);
