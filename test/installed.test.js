// The package as a user gets it: the CLI installs the skills into a project, and the scripts run from the
// installed folders. Four kinds of project: empty, a numbered vault, only a CLAUDE.md, and a harness.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { emptyProject, numberedVault, claudeOnly, harnessProject } from './fixtures.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLI = path.join(ROOT, 'cli', 'hyper-second-brain.js');

const cli = (dir, ...args) => {
  const r = spawnSync(process.execPath, [CLI, ...args], { cwd: dir, encoding: 'utf8', env: { ...process.env, HSB_OFFLINE: '1' }, input: '' });
  return { code: r.status, out: r.stdout + r.stderr };
};
const run = (script, dir, ...args) => {
  const r = spawnSync(process.execPath, [script, '--root', dir, ...args], { encoding: 'utf8' });
  let json = null;
  try {
    json = JSON.parse(r.stdout);
  } catch {
    // text output
  }
  return { code: r.status, json, out: r.stdout + r.stderr };
};

const SCENARIOS = [
  ['an empty project', emptyProject],
  ['a numbered vault', numberedVault],
  ['a project with only a CLAUDE.md', claudeOnly],
  ['a project with a harness', harnessProject],
];

for (const [name, make] of SCENARIOS) {
  test(`${name}: the installed skills set up, check, update and come out again`, () => {
    const dir = make();
    assert.equal(cli(dir, 'init', '--agents', 'claude').code, 0);
    const skill = (n) => path.join(dir, '.claude', 'skills', n);

    // every file a SKILL.md names is in the installed folder
    for (const n of ['hsb-init', 'hsb-doctor', 'hsb-update', 'hsb-place-an-item', 'hsb-re-organize']) {
      const text = fs.readFileSync(path.join(skill(n), 'SKILL.md'), 'utf8');
      const named = [...text.matchAll(/`((?:scripts|references|templates)\/[^`]*)`/g)].map((m) => m[1].replace(/\/$/, ''));
      assert.ok(named.length > 0, n);
      for (const rel of named) assert.ok(fs.existsSync(path.join(skill(n), rel)), `${n}: ${rel}`);
    }

    const scaffold = path.join(skill('hsb-init'), 'scripts', 'scaffold.mjs');
    const plan = run(scaffold, dir, '--plan', '--json');
    assert.equal(plan.code, 0, plan.out);
    const applied = run(scaffold, dir, '--json');
    assert.equal(applied.code, 0, applied.out);
    assert.equal(run(scaffold, dir, '--json').code, 3);

    const doctor = run(path.join(skill('hsb-doctor'), 'scripts', 'hsb-check.mjs'), dir, '--json');
    assert.equal(doctor.code, 0, doctor.out);
    assert.equal(doctor.json.counts.fail, 0);

    const updated = run(path.join(skill('hsb-update'), 'scripts', 'update.mjs'), dir, '--json');
    assert.equal(updated.code, 0, updated.out);
    assert.equal(updated.json.status, 'current');

    assert.equal(cli(dir, 'remove').code, 0);
    assert.ok(!fs.existsSync(path.join(dir, '.claude')));
    assert.ok(fs.existsSync(path.join(dir, 'hyper-second-brain', 'project.md')), 'the project keeps its own folder');
  });
}
