// Build and validation tests: the generated skills match their sources and the
// Agent Skills specification.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildAll } from '../scripts/build.js';
import { validateSkill } from '../scripts/validate.js';
import { tmp } from './fixtures.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VERSION = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;

test('the committed skills/ is a fresh build of skills-src/ and core/', () => {
  const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'build.js'), '--check'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

test('the package ships exactly the fourteen hsb-* skills', () => {
  assert.deepEqual(fs.readdirSync(path.join(ROOT, 'skills')).sort(), ['hsb-capture', 'hsb-connect', 'hsb-create', 'hsb-distill', 'hsb-doctor', 'hsb-find', 'hsb-init', 'hsb-place-an-item', 'hsb-projects', 'hsb-re-organize', 'hsb-restart', 'hsb-review', 'hsb-share', 'hsb-update']);
});

test('includes are resolved and the version is filled in', () => {
  const built = buildAll();
  assert.deepEqual([...built.keys()].sort(), ['hsb-capture', 'hsb-connect', 'hsb-create', 'hsb-distill', 'hsb-doctor', 'hsb-find', 'hsb-init', 'hsb-place-an-item', 'hsb-projects', 'hsb-re-organize', 'hsb-restart', 'hsb-review', 'hsb-share', 'hsb-update']);
  for (const [name, files] of built) {
    const skill = files.get('SKILL.md').toString('utf8');
    assert.ok(!skill.includes('<!-- include:'), name);
    assert.ok(!skill.includes('{{version}}'), name);
    assert.ok(skill.includes(`version: "${VERSION}"`), name);
  }
  assert.ok(built.get('hsb-update').has('references/changelog.md'));
  assert.ok(!built.get('hsb-init').has('references/changelog.md'));
  assert.deepEqual([...built.get('hsb-place-an-item').keys()].sort(), ['SKILL.md', 'references/folder-about.md', 'references/placement.md']);
  assert.deepEqual([...built.get('hsb-re-organize').keys()].sort(), ['SKILL.md', 'references/folder-about.md', 'references/reorganize.md', 'scripts/hsb-lib.mjs', 'scripts/reorganize.mjs']);
  assert.deepEqual([...built.get('hsb-projects').keys()].sort(), ['SKILL.md', 'references/folder-about.md', 'references/lifecycle.md', 'references/project-list.md', 'scripts/hsb-lib.mjs', 'scripts/hsb-state.mjs']);
  assert.deepEqual([...built.get('hsb-distill').keys()].sort(), ['SKILL.md', 'references/layers.md']);
  assert.deepEqual([...built.get('hsb-connect').keys()].sort(), ['SKILL.md', 'references/folder-about.md', 'references/pitfalls.md', 'references/standard.md', 'scripts/connect.mjs', 'scripts/hsb-lib.mjs', 'templates/tags.md']);
  assert.deepEqual([...built.get('hsb-create').keys()].sort(), ['SKILL.md', 'references/focus.md', 'references/making.md']);
  assert.deepEqual([...built.get('hsb-share').keys()].sort(), ['SKILL.md', 'references/sharing.md']);
  assert.deepEqual([...built.get('hsb-restart').keys()].sort(), ['SKILL.md', 'references/folder-about.md', 'references/getting-started.md', 'references/restart.md', 'scripts/hsb-lib.mjs', 'scripts/reorganize.mjs']);
  assert.deepEqual([...built.get('hsb-capture').keys()].sort(), ['SKILL.md', 'references/favorite-problems.md', 'references/keeping.md', 'references/source.md', 'scripts/hsb-find.mjs', 'scripts/hsb-lib.mjs']);
  assert.deepEqual([...built.get('hsb-find').keys()].sort(), ['SKILL.md', 'references/finding.md', 'references/meeting.md', 'references/stuck.md', 'scripts/hsb-find.mjs', 'scripts/hsb-lib.mjs']);
  assert.deepEqual([...built.get('hsb-review').keys()].sort(), ['SKILL.md', 'references/changes.md', 'references/folder-about.md', 'references/inbox-archive.md', 'references/monthly.md', 'references/weekly.md', 'scripts/hsb-lib.mjs', 'scripts/hsb-state.mjs', 'scripts/reorganize.mjs']);
});

test('every shipped skill passes the specification checks', () => {
  for (const name of fs.readdirSync(path.join(ROOT, 'skills'))) {
    const r = validateSkill(path.join(ROOT, 'skills', name));
    assert.deepEqual(r.errors, [], name);
  }
});

function fakeSkill(name, frontmatter) {
  const dir = path.join(tmp('hsb-val-'), name);
  fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, 'SKILL.md'), `---\n${frontmatter}\n---\nbody\n`);
  return dir;
}

test('the validator catches what the specification forbids', () => {
  const cases = [
    ['hsb-x', 'name: hsb-y\ndescription: d', /does not match the folder/],
    ['Bad_Name', 'name: Bad_Name\ndescription: d', /lowercase letters/],
    ['hsb--x', 'name: hsb--x\ndescription: d', /single hyphens/],
    ['hsb-x', 'name: hsb-x', /description is missing/],
    ['hsb-x', `name: hsb-x\ndescription: ${'a'.repeat(1025)}`, /max 1024/],
    ['hsb-x', 'name: hsb-x\ndescription: d\nuser-invocable: false', /not in the specification/],
  ];
  for (const [folder, fm, want] of cases) {
    const r = validateSkill(fakeSkill(folder, fm));
    assert.ok(r.errors.some((e) => want.test(e)), `${fm} -> ${r.errors.join('; ')}`);
  }
  assert.deepEqual(validateSkill(fakeSkill('hsb-ok', 'name: hsb-ok\ndescription: fine\nmetadata:\n  version: "1"')).errors, []);
});
