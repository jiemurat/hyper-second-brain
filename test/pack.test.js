// What npm would put into the tarball: the CLI, the library, the built skills and the documents, and nothing of the development.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const npm = (...args) => spawnSync('npm', args, { cwd: ROOT, encoding: 'utf8', shell: process.platform === 'win32' });
const hasNpm = npm('--version').status === 0;

test('the tarball holds what a user needs and nothing of the development', { skip: !hasNpm && 'npm is missing' }, () => {
  const r = npm('pack', '--dry-run', '--json', '--ignore-scripts');
  assert.equal(r.status, 0, r.stderr);
  const files = JSON.parse(r.stdout)[0].files.map((f) => f.path);
  for (const want of ['package.json', 'README.md', 'LICENSE', 'CHANGELOG.md', 'cli/hyper-second-brain.js', 'lib/install.js', 'lib/agents.js',
    'skills/hsb-init/SKILL.md', 'skills/hsb-init/scripts/scaffold.mjs', 'skills/hsb-init/scripts/hsb-lib.mjs', 'skills/hsb-init/templates/project.md.tmpl',
    'skills/hsb-doctor/SKILL.md', 'skills/hsb-doctor/scripts/hsb-check.mjs', 'skills/hsb-update/SKILL.md', 'skills/hsb-update/scripts/update.mjs',
    'skills/hsb-update/references/changelog.md', 'skills/hsb-init/templates/HYPER-SECOND-BRAIN.md.tmpl', 'skills/hsb-doctor/templates/HYPER-SECOND-BRAIN.md.tmpl',
    'skills/hsb-place-an-item/SKILL.md', 'skills/hsb-place-an-item/references/placement.md', 'skills/hsb-place-an-item/references/folder-about.md',
    'skills/hsb-re-organize/SKILL.md', 'skills/hsb-re-organize/scripts/reorganize.mjs', 'skills/hsb-re-organize/scripts/hsb-lib.mjs', 'skills/hsb-re-organize/references/reorganize.md', 'skills/hsb-re-organize/references/folder-about.md']) {
    assert.ok(files.includes(want), `missing: ${want}`);
  }
  const unwanted = files.filter((f) => /^(test|core|skills-src|scripts|\.github|evals|docs)\//.test(f) || /node_modules|\.tgz$|\.test\.js$/.test(f));
  assert.deepEqual(unwanted, []);
});
