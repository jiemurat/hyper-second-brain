// CLI tests: init, update, remove and status in throwaway project folders.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { spawnSync, execFile } from 'node:child_process';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { tmp, removeAtExit } from './fixtures.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLI = path.join(ROOT, 'cli', 'hyper-second-brain.js');
const VERSION = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
const SKILLS = fs.readdirSync(path.join(ROOT, 'skills')).filter((n) => n.startsWith('hsb-')).sort();

function project() {
  return tmp('hsb-cli-');
}

function runEnv(dir, env, ...args) {
  const r = spawnSync(process.execPath, [CLI, ...args], { cwd: dir, encoding: 'utf8', env: { ...process.env, HSB_OFFLINE: '1', ...env }, input: '' });
  return { code: r.status, out: r.stdout + r.stderr };
}

const run = (dir, ...args) => runEnv(dir, {}, ...args);
const hasGit = spawnSync('git', ['--version']).status === 0;
const noLinks = process.platform === 'win32' && 'symbolic links need extra rights on Windows';

const exists = (dir, rel) => fs.existsSync(path.join(dir, rel));
const read = (dir, rel) => fs.readFileSync(path.join(dir, rel), 'utf8');
const manifest = (dir, base = '.agents/skills') => JSON.parse(read(dir, `${base}/.hyper-second-brain.json`));

test('the package ships the fourteen hsb-* skills', () => {
  assert.deepEqual(SKILLS, ['hsb-capture', 'hsb-connect', 'hsb-create', 'hsb-distill', 'hsb-doctor', 'hsb-find', 'hsb-init', 'hsb-place-an-item', 'hsb-projects', 'hsb-re-organize', 'hsb-restart', 'hsb-review', 'hsb-share', 'hsb-update']);
});

test('init installs into .agents/skills and .claude/skills, writes commands, manifest and .gitignore', () => {
  const dir = project();
  const r = run(dir, 'init');
  assert.equal(r.code, 0, r.out);
  for (const s of SKILLS) {
    assert.ok(exists(dir, `.agents/skills/${s}/SKILL.md`), s);
    assert.ok(exists(dir, `.claude/skills/${s}/SKILL.md`), s);
    assert.ok(exists(dir, `.gemini/commands/${s}.toml`), s);
    assert.ok(exists(dir, `.opencode/commands/${s}.md`), s);
  }
  assert.ok(exists(dir, '.agents/skills/hsb-init/templates/HYPER-SECOND-BRAIN.md.tmpl'));
  const m = manifest(dir);
  assert.equal(m.version, VERSION);
  assert.deepEqual(m.targets, ['agents', 'claude']);
  const ignore = read(dir, '.gitignore');
  for (const line of ['.agents/skills/hsb-*/', '.claude/skills/hsb-*/', '.agents/skills/.hyper-second-brain.json', '.gemini/commands/hsb-*.toml', '.opencode/commands/hsb-*.md']) {
    assert.ok(ignore.includes(line), line);
  }
  assert.match(r.out, /\/hsb-init/);
  assert.match(r.out, /\$hsb-init/);
  assert.match(read(dir, '.gemini/commands/hsb-init.toml'), /\{\{args\}\}/);
  assert.match(read(dir, '.opencode/commands/hsb-init.md'), /\$ARGUMENTS/);
});

test('init again says the skills are already there and changes nothing', () => {
  const dir = project();
  run(dir, 'init');
  const before = read(dir, '.agents/skills/.hyper-second-brain.json');
  const r = run(dir, 'init');
  assert.equal(r.code, 0);
  assert.match(r.out, /already installed/);
  assert.equal(read(dir, '.agents/skills/.hyper-second-brain.json'), before);
});

test('init keeps the existing .gitignore lines and does not repeat its block', () => {
  const dir = project();
  fs.writeFileSync(path.join(dir, '.gitignore'), 'node_modules/\n');
  run(dir, 'init');
  run(dir, 'update', '--yes');
  const ignore = read(dir, '.gitignore');
  assert.ok(ignore.startsWith('node_modules/\n'));
  assert.equal(ignore.split('>>> hyper-second-brain tools').length, 2);
});

test('init replaces a .gitignore block written before the scoped name', () => {
  const dir = project();
  fs.writeFileSync(path.join(dir, '.gitignore'), 'node_modules/\n\n# >>> hyper-second-brain tools (npx hyper-second-brain) >>>\n.claude/skills/hsb-*/\n# <<< hyper-second-brain tools <<<\n');
  run(dir, 'init');
  const ignore = read(dir, '.gitignore');
  assert.equal(ignore.split('>>> hyper-second-brain tools').length, 2);
  assert.match(ignore, /# >>> hyper-second-brain tools \(npx @jiemurat\/hyper-second-brain\) >>>/);
});

test('--agents claude installs only for Claude Code, without command files', () => {
  const dir = project();
  const r = run(dir, 'init', '--agents', 'claude');
  assert.equal(r.code, 0, r.out);
  assert.ok(exists(dir, '.claude/skills/hsb-init/SKILL.md'));
  assert.ok(!exists(dir, '.agents'));
  assert.ok(!exists(dir, '.gemini'));
  assert.ok(exists(dir, '.claude/skills/.hyper-second-brain.json'));
  assert.ok(!read(dir, '.gitignore').includes('.agents/'));
});

test('agent names map to their folders and an unknown agent is a usage error', () => {
  const dir = project();
  assert.equal(run(dir, 'init', '--agents', 'cursor,claude-code', '--no-commands').code, 0);
  const agy = project();
  assert.equal(run(agy, 'init', '--agents', 'antigravity', '--no-commands').code, 0);
  assert.ok(exists(agy, '.agents/skills/hsb-init/SKILL.md'));
  assert.ok(!exists(agy, '.agent'));
  assert.ok(exists(dir, '.agents/skills/hsb-init/SKILL.md'));
  assert.ok(exists(dir, '.claude/skills/hsb-init/SKILL.md'));
  assert.ok(!exists(dir, '.gemini'));
  assert.equal(run(project(), 'init', '--agents', 'nosuch').code, 2);
});

test('--dry-run writes nothing', () => {
  const dir = project();
  const r = run(dir, 'init', '--dry-run');
  assert.equal(r.code, 0, r.out);
  assert.deepEqual(fs.readdirSync(dir), []);
});

test('a hsb-* folder hyper-second-brain did not write is not overwritten without --yes', () => {
  const dir = project();
  fs.mkdirSync(path.join(dir, '.claude/skills/hsb-init'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.claude/skills/hsb-init/SKILL.md'), 'mine\n');
  const r = run(dir, 'init');
  assert.equal(r.code, 3, r.out);
  assert.equal(read(dir, '.claude/skills/hsb-init/SKILL.md'), 'mine\n');
  assert.equal(run(dir, 'init', '--yes').code, 0);
  assert.notEqual(read(dir, '.claude/skills/hsb-init/SKILL.md'), 'mine\n');
});

test('update: up to date, then a file changed by hand stops it (exit 3) until --yes', () => {
  const dir = project();
  run(dir, 'init');
  assert.match(run(dir, 'update').out, /up to date/);
  fs.appendFileSync(path.join(dir, '.claude/skills/hsb-init/SKILL.md'), 'local edit\n');
  const r = run(dir, 'update');
  assert.equal(r.code, 3, r.out);
  assert.match(r.out, /\.claude\/skills\/hsb-init\/SKILL\.md/);
  assert.ok(read(dir, '.claude/skills/hsb-init/SKILL.md').endsWith('local edit\n'));
  assert.equal(run(dir, 'update', '--yes').code, 0);
  assert.ok(!read(dir, '.claude/skills/hsb-init/SKILL.md').includes('local edit'));
});

test('update at the same version replaces the files whose content differs from this package', () => {
  const dir = project();
  run(dir, 'init');
  // an install of the same version number with other content (a release that forgot the version bump)
  const rel = '.claude/skills/hsb-init/SKILL.md';
  const old = 'an older text of the same version\n';
  fs.writeFileSync(path.join(dir, rel), old);
  const m = manifest(dir);
  m.files[rel] = crypto.createHash('sha256').update(old).digest('hex');
  fs.writeFileSync(path.join(dir, '.agents/skills/.hyper-second-brain.json'), JSON.stringify(m, null, 2));
  assert.match(run(dir, 'status').out, /No file changed by hand/);
  const dry = run(dir, 'update', '--dry-run');
  assert.equal(dry.code, 0, dry.out);
  assert.match(dry.out, /1 file\(s\) differ from this package/);
  assert.equal(read(dir, rel), old);
  const r = run(dir, 'update');
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /Reinstalled/);
  assert.equal(read(dir, rel), read(ROOT, 'skills/hsb-init/SKILL.md'));
  assert.match(run(dir, 'update').out, /up to date/);
});

test('update from an older version replaces the files and drops ones the new version no longer has', () => {
  const dir = project();
  run(dir, 'init');
  const mfile = path.join(dir, '.agents/skills/.hyper-second-brain.json');
  const m = JSON.parse(fs.readFileSync(mfile, 'utf8'));
  m.version = '0.9.0';
  const stale = '.agents/skills/hsb-init/templates/old-file.md';
  fs.writeFileSync(path.join(dir, stale), 'old\n');
  m.files[stale] = '5d41402abc4b2a76b9719d911017c592ccf9e1d58df3a8d8e5b4d7e5a1c66d7d'; // not the real hash: changed by hand
  fs.writeFileSync(mfile, JSON.stringify(m));
  const r = run(dir, 'update', '--yes');
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /0\.9\.0 -> /);
  assert.match(r.out, /hsb-update\/references\/changelog\.md/);
  assert.ok(!exists(dir, stale));
  assert.equal(manifest(dir).version, VERSION);
});

test('update without an installation points to init', () => {
  const r = run(project(), 'update');
  assert.equal(r.code, 1);
  assert.match(r.out, /init/);
});

test('remove deletes the tools, their folders and the .gitignore block, and keeps other skills', () => {
  const dir = project();
  fs.writeFileSync(path.join(dir, '.gitignore'), 'dist/\n');
  fs.mkdirSync(path.join(dir, '.claude/skills/my-skill'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.claude/skills/my-skill/SKILL.md'), '---\nname: my-skill\ndescription: x\n---\n');
  run(dir, 'init');
  const r = run(dir, 'remove');
  assert.equal(r.code, 0, r.out);
  assert.equal(read(dir, '.gitignore'), 'dist/\n');
  assert.ok(exists(dir, '.claude/skills/my-skill/SKILL.md'));
  assert.ok(!exists(dir, '.claude/skills/hsb-init'));
  assert.ok(!exists(dir, '.agents'));
  assert.ok(!exists(dir, '.gemini'));
  assert.ok(!exists(dir, '.opencode'));
});

test('remove deletes a .gitignore that held only the block', () => {
  const dir = project();
  run(dir, 'init');
  run(dir, 'remove');
  assert.deepEqual(fs.readdirSync(dir), []);
});

test('status reports the version and files changed by hand', () => {
  const dir = project();
  assert.match(run(dir, 'status').out, /not installed/);
  run(dir, 'init');
  assert.match(run(dir, 'status').out, new RegExp(`${VERSION.replace(/\./g, '\\.')} installed`));
  fs.appendFileSync(path.join(dir, '.agents/skills/hsb-doctor/SKILL.md'), 'x\n');
  assert.match(run(dir, 'status').out, /Changed by hand: 1 file/);
});

test('status tells a package that is not on npm from a registry it cannot reach', async () => {
  const dir = project();
  run(dir, 'init');
  const server = http.createServer((req, res) => {
    if (req.url.startsWith('/@jiemurat%2fhyper-second-brain/')) {
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end('{"error":"Not found"}');
    } else {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{"version":"9.9.9"}');
    }
  });
  await new Promise((resolve) => server.listen(0, resolve));
  const url = `http://localhost:${server.address().port}`;
  const status = (registry) => new Promise((resolve) => execFile(process.execPath, [CLI, 'status'], { cwd: dir, env: { ...process.env, HSB_OFFLINE: '', HSB_REGISTRY_URL: registry } }, (e, out, err) => resolve(out + err)));
  try {
    assert.match(await status(url), /newest on npm: not published there/);
    server.close();
    assert.match(await status(url), /newest on npm: unknown \(the registry could not be reached\)/);
  } finally {
    server.close();
  }
  assert.match(run(dir, 'status').out, /newest on npm: not checked \(HSB_OFFLINE=1\)/);
});

test('help, version and an unknown command', () => {
  const dir = project();
  assert.match(run(dir, '--help').out, /Usage: npx @jiemurat\/hyper-second-brain@latest/);
  assert.equal(run(dir, '--version').out.trim(), VERSION);
  assert.equal(run(dir, 'nosuch').code, 2);
});

test('a manifest path outside the skill folders is refused and nothing is deleted', () => {
  const dir = project();
  run(dir, 'init');
  const victim = removeAtExit(path.join(path.dirname(dir), `hsb-victim-${path.basename(dir)}.txt`));
  fs.writeFileSync(victim, 'keep\n');
  const mfile = path.join(dir, '.agents/skills/.hyper-second-brain.json');
  const m = JSON.parse(fs.readFileSync(mfile, 'utf8'));
  m.files[`../${path.basename(victim)}`] = 'x';
  fs.writeFileSync(mfile, JSON.stringify(m));
  for (const cmd of ['remove', 'update']) {
    const r = run(dir, cmd, '--yes');
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, /outside the skill and command folders/);
  }
  assert.equal(fs.readFileSync(victim, 'utf8'), 'keep\n');
  assert.ok(exists(dir, '.agents/skills/hsb-init/SKILL.md'));
});

test('a damaged manifest gives a clear error', () => {
  const dir = project();
  run(dir, 'init');
  fs.writeFileSync(path.join(dir, '.agents/skills/.hyper-second-brain.json'), '{bad');
  const r = run(dir, 'status');
  assert.equal(r.code, 1);
  assert.match(r.out, /\.hyper-second-brain\.json is not valid JSON .* init --yes/);
});

test('update does not go back to an older version without --yes', () => {
  const dir = project();
  run(dir, 'init');
  const mfile = path.join(dir, '.agents/skills/.hyper-second-brain.json');
  const m = JSON.parse(fs.readFileSync(mfile, 'utf8'));
  m.version = '99.0.0';
  fs.writeFileSync(mfile, JSON.stringify(m));
  const r = run(dir, 'update');
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /newer than this hyper-second-brain/);
  assert.equal(manifest(dir).version, '99.0.0');
  assert.match(run(dir, 'init').out, /newer than this/);
  assert.equal(run(dir, 'update', '--yes').code, 0);
  assert.equal(manifest(dir).version, VERSION);
});

test('update --agents installs the skills for another set of agents', () => {
  const dir = project();
  run(dir, 'init');
  assert.match(run(dir, 'init', '--agents', 'claude,windsurf').out, /update --agents claude,windsurf/);
  let r = run(dir, 'update', '--agents', 'agents,claude,windsurf');
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /Reinstalled/);
  assert.ok(exists(dir, '.windsurf/skills/hsb-init/SKILL.md'));
  assert.deepEqual(manifest(dir).targets, ['agents', 'claude', 'windsurf']);
  r = run(dir, 'update', '--agents', 'claude');
  assert.equal(r.code, 0, r.out);
  for (const gone of ['.agents', '.gemini', '.opencode', '.windsurf']) assert.ok(!exists(dir, gone), gone);
  assert.ok(exists(dir, '.claude/skills/hsb-init/SKILL.md'));
  assert.deepEqual(manifest(dir, '.claude/skills').targets, ['claude']);
  assert.ok(!read(dir, '.gitignore').includes('.agents/'));
  assert.match(run(dir, 'update', '--agents', 'claude').out, /up to date/);
});

test('a folder that does not exist is a usage error and is not created', () => {
  const dir = project();
  const r = run(dir, 'init', '--dir', path.join(dir, 'no', 'such'));
  assert.equal(r.code, 2, r.out);
  assert.match(r.out, /no such folder/);
  assert.ok(!exists(dir, 'no'));
});

test('the home folder needs --yes', () => {
  const home = project();
  const env = { HOME: home, USERPROFILE: home };
  const r = runEnv(home, env, 'init');
  assert.equal(r.code, 2, r.out);
  assert.match(r.out, /home folder/);
  assert.ok(!exists(home, '.claude'));
  assert.equal(runEnv(home, env, 'init', '--yes').code, 0);
});

test('init in a subfolder of a git repository points to the repository root', { skip: !hasGit && 'git is missing' }, () => {
  const top = project();
  spawnSync('git', ['init', '-q'], { cwd: top });
  fs.mkdirSync(path.join(top, 'sub'));
  const r = run(path.join(top, 'sub'), 'init');
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /inside the git repository/);
  assert.doesNotMatch(run(project(), 'init').out, /inside the git repository/);
});

test('a .gitignore with CRLF line endings keeps them', () => {
  const dir = project();
  const original = 'node_modules/\r\ndist/\r\n';
  fs.writeFileSync(path.join(dir, '.gitignore'), original);
  run(dir, 'init');
  const text = read(dir, '.gitignore');
  assert.ok(!/(^|[^\r])\n/.test(text), JSON.stringify(text.slice(0, 80)));
  run(dir, 'remove');
  assert.equal(read(dir, '.gitignore'), original);
});

test('a linked skill file is replaced, never written through', { skip: noLinks }, () => {
  const dir = project();
  const outside = removeAtExit(path.join(path.dirname(dir), `hsb-outside-${path.basename(dir)}.md`));
  fs.writeFileSync(outside, 'mine\n');
  fs.mkdirSync(path.join(dir, '.claude/skills/hsb-init'), { recursive: true });
  fs.symlinkSync(outside, path.join(dir, '.claude/skills/hsb-init/SKILL.md'));
  assert.equal(run(dir, 'init', '--yes').code, 0);
  assert.equal(fs.readFileSync(outside, 'utf8'), 'mine\n');
  assert.ok(!fs.lstatSync(path.join(dir, '.claude/skills/hsb-init/SKILL.md')).isSymbolicLink());
});

test('a skill folder that links out of the project stops the install before any file is written', { skip: noLinks }, () => {
  const dir = project();
  const outside = tmp('hsb-outside-');
  fs.mkdirSync(path.join(dir, '.claude/skills'), { recursive: true });
  fs.symlinkSync(outside, path.join(dir, '.claude/skills/hsb-init'), 'dir');
  const r = run(dir, 'init', '--yes');
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /leads outside the project/);
  assert.deepEqual(fs.readdirSync(outside), []);
  assert.ok(!exists(dir, '.agents'));
});
