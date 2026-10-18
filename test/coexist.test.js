// hyper-second-brain next to pan-harness: both packages can sit in one project and
// neither touches the other's files, folders or .gitignore block.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { tmp } from './fixtures.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLI = path.join(ROOT, 'cli', 'hyper-second-brain.js');

const PH_BLOCK = [
  '# >>> pan-harness tools (npx @jiemurat/pan-harness) >>>',
  '.agents/skills/ph-*/',
  '.claude/skills/ph-*/',
  '.agents/skills/.pan-harness.json',
  '.gemini/commands/ph-*.toml',
  '.opencode/commands/ph-*.md',
  '# <<< pan-harness tools <<<',
].join('\n');
const GITIGNORE = `node_modules/\n\n${PH_BLOCK}\n`;

// the files pan-harness leaves in a project: its skills, command files, manifest and the harness
const PH_FILES = {
  '.agents/skills/ph-init/SKILL.md': 'pan-harness skill\n',
  '.agents/skills/ph-doctor/SKILL.md': 'pan-harness skill\n',
  '.claude/skills/ph-init/SKILL.md': 'pan-harness skill\n',
  '.agents/skills/.pan-harness.json': '{"package":"@jiemurat/pan-harness","version":"1.3.1","targets":["agents","claude"],"files":{}}\n',
  '.gemini/commands/ph-init.toml': 'description = "x"\n',
  '.opencode/commands/ph-init.md': 'x\n',
  'AGENTS.md': '# Project\n',
  'PAN-HARNESS.md': '# PAN-HARNESS\n',
  'pan-harness/state.md': '# State\n',
};

function projectWithPanHarness() {
  const dir = tmp('hsb-co-');
  for (const [rel, text] of Object.entries(PH_FILES)) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), text);
  }
  fs.writeFileSync(path.join(dir, '.gitignore'), GITIGNORE);
  return dir;
}

function run(dir, ...args) {
  const r = spawnSync(process.execPath, [CLI, ...args], { cwd: dir, encoding: 'utf8', env: { ...process.env, HSB_OFFLINE: '1' }, input: '' });
  return { code: r.status, out: r.stdout + r.stderr };
}

const hashes = (dir) => Object.fromEntries(Object.keys(PH_FILES).map((rel) => [rel,
  crypto.createHash('sha256').update(fs.readFileSync(path.join(dir, rel))).digest('hex')]));
const read = (dir, rel) => fs.readFileSync(path.join(dir, rel), 'utf8');
const exists = (dir, rel) => fs.existsSync(path.join(dir, rel));

test('init next to pan-harness leaves every pan-harness file as it was and keeps both .gitignore blocks', () => {
  const dir = projectWithPanHarness();
  const before = hashes(dir);
  const r = run(dir, 'init');
  assert.equal(r.code, 0, r.out);
  assert.deepEqual(hashes(dir), before);
  for (const s of ['hsb-init', 'hsb-doctor', 'hsb-update', 'hsb-place-an-item', 'hsb-re-organize']) {
    assert.ok(exists(dir, `.agents/skills/${s}/SKILL.md`), s);
    assert.ok(exists(dir, `.claude/skills/${s}/SKILL.md`), s);
  }
  assert.ok(exists(dir, '.agents/skills/.hyper-second-brain.json'));
  const ignore = read(dir, '.gitignore');
  assert.ok(ignore.startsWith(GITIGNORE));
  assert.equal(ignore.split(PH_BLOCK).length, 2);
  assert.equal(ignore.split('>>> hyper-second-brain tools').length, 2);
  assert.ok(ignore.includes('.agents/skills/hsb-*/'));
});

test('a second init, update and status leave pan-harness alone too', () => {
  const dir = projectWithPanHarness();
  run(dir, 'init');
  const before = hashes(dir);
  assert.equal(run(dir, 'init').code, 0);
  assert.equal(run(dir, 'update', '--yes').code, 0);
  assert.equal(run(dir, 'status').code, 0);
  assert.deepEqual(hashes(dir), before);
  const ignore = read(dir, '.gitignore');
  assert.equal(ignore.split(PH_BLOCK).length, 2);
  assert.equal(ignore.split('>>> hyper-second-brain tools').length, 2);
});

test('remove takes out only the hyper-second-brain files and block', () => {
  const dir = projectWithPanHarness();
  const before = hashes(dir);
  run(dir, 'init');
  const r = run(dir, 'remove');
  assert.equal(r.code, 0, r.out);
  assert.deepEqual(hashes(dir), before);
  assert.equal(read(dir, '.gitignore'), GITIGNORE);
  for (const s of ['hsb-init', 'hsb-doctor', 'hsb-update', 'hsb-place-an-item', 'hsb-re-organize']) {
    assert.ok(!exists(dir, `.agents/skills/${s}`), s);
    assert.ok(!exists(dir, `.claude/skills/${s}`), s);
  }
  assert.ok(!exists(dir, '.agents/skills/.hyper-second-brain.json'));
  assert.ok(exists(dir, '.agents/skills/ph-init/SKILL.md'));
});

test('a skill folder of pan-harness is never mistaken for a hyper-second-brain one', () => {
  const dir = projectWithPanHarness();
  run(dir, 'init');
  const m = JSON.parse(read(dir, '.agents/skills/.hyper-second-brain.json'));
  assert.ok(Object.keys(m.files).every((rel) => !rel.includes('/ph-')), 'manifest lists a ph-* path');
  assert.ok(Object.keys(m.files).every((rel) => !rel.endsWith('.pan-harness.json')));
});
