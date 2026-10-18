// hsb-init's script in throwaway projects: what it creates, what it leaves alone, and when it stops.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { tmp, write, snapshot, folders, emptyProject, numberedVault, claudeOnly, harnessProject } from './fixtures.js';
import { RULES_SECTIONS } from '../core/scripts/hsb-lib.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SKILL = path.join(ROOT, 'skills', 'hsb-init');
const SCAFFOLD = path.join(SKILL, 'scripts', 'scaffold.mjs');
const VERSION = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
const LINE = 'HYPER-SECOND-BRAIN.md';

function run(root, ...args) {
  const r = spawnSync(process.execPath, [SCAFFOLD, '--root', root, ...args, '--json'], { encoding: 'utf8' });
  let json = null;
  try {
    json = JSON.parse(r.stdout);
  } catch {
    // usage errors print text to stderr
  }
  return { code: r.status, json, out: r.stdout + r.stderr };
}

const read = (dir, rel) => fs.readFileSync(path.join(dir, rel), 'utf8');
const exists = (dir, rel) => fs.existsSync(path.join(dir, rel));
const added = (before, after) => Object.keys(after).filter((k) => !(k in before)).sort();
const changed = (before, after) => Object.keys(before).filter((k) => after[k] !== before[k]).sort();

test('an empty project gets the vault, the PARA folders, the rules file, project.md, the manifest and an AGENTS.md with the pointer', () => {
  const dir = emptyProject();
  const r = run(dir);
  assert.equal(r.code, 0, r.out);
  for (const f of ['0 Inbox', '1 Projects', '2 Areas', '3 Resources', '4 Archives']) assert.ok(exists(dir, `vault/${f}`), f);
  const rules = read(dir, 'HYPER-SECOND-BRAIN.md');
  assert.match(rules, /^# HYPER-SECOND-BRAIN\n/);
  for (const h of RULES_SECTIONS) assert.match(rules, new RegExp(`^## ${h}$`, 'm'), h);
  assert.ok(rules.includes('`vault/`') && !rules.includes('{{'));
  assert.deepEqual(fs.readdirSync(path.join(dir, 'hyper-second-brain')).sort(), ['.manifest.json', 'project.md']);
  const project = read(dir, 'hyper-second-brain/project.md');
  assert.match(project, /Vault: `vault\/`/);
  assert.match(project, /^## Lasting choices\n[\s\S]*\n- None yet\.\n$/m);
  for (const row of ['| Inbox | `0 Inbox` |', '| Projects | `1 Projects` |', '| Areas | `2 Areas` |', '| Resources | `3 Resources` |', '| Archives | `4 Archives` |']) {
    assert.ok(project.includes(row), row);
  }
  const manifest = JSON.parse(read(dir, 'hyper-second-brain/.manifest.json'));
  assert.equal(manifest.version, VERSION);
  assert.equal(manifest.files, undefined);
  assert.deepEqual(manifest.entryFiles, { 'AGENTS.md': 'create' });
  const agents = read(dir, 'AGENTS.md');
  assert.ok(agents.includes('<!-- hyper-second-brain:start -->') && agents.includes('<!-- hyper-second-brain:end -->'));
  assert.ok(agents.includes(LINE) && agents.includes('`vault/`'));
  assert.ok(!exists(dir, 'CLAUDE.md'));
});

test('a second run says "already installed" (exit 3) and changes nothing', () => {
  const dir = emptyProject();
  run(dir);
  const before = snapshot(dir);
  const r = run(dir);
  assert.equal(r.code, 3, r.out);
  assert.equal(r.json.status, 'already-installed');
  assert.deepEqual(snapshot(dir), before);
});

test('--plan writes nothing and reports what would be created', () => {
  const dir = emptyProject();
  const r = run(dir, '--plan');
  assert.equal(r.code, 0, r.out);
  assert.equal(r.json.status, 'plan');
  assert.equal(r.json.vault.create, true);
  assert.ok(Object.values(r.json.mapping).every((m) => m.create));
  assert.deepEqual(fs.readdirSync(dir), []);
});

test('a numbered vault keeps every folder and file, is mapped as it is, and the others are listed', () => {
  const dir = numberedVault();
  const before = snapshot(dir);
  const foldersBefore = folders(path.join(dir, 'vault'));
  const r = run(dir);
  assert.equal(r.code, 0, r.out);
  assert.deepEqual(changed(before, snapshot(dir)), []);
  assert.deepEqual(folders(path.join(dir, 'vault')), foldersBefore);
  assert.deepEqual(added(before, snapshot(dir)), [
    'AGENTS.md', 'HYPER-SECOND-BRAIN.md', 'hyper-second-brain/.manifest.json', 'hyper-second-brain/project.md',
  ]);
  const project = read(dir, 'hyper-second-brain/project.md');
  for (const row of ['| Inbox | `0. INBOX` |', '| Projects | `1. PROJECTS` |', '| Areas | `2. AREAS` |', '| Resources | `3. RESOURCES` |', '| Archives | `4. ARCHIVE` |']) {
    assert.ok(project.includes(row), row);
  }
  assert.ok(project.includes('- `5. TOOLS`') && project.includes('- `_assets`'));
  for (const f of ['vault/AGENTS.md', 'vault/1. PROJECTS/AGENTS.md', 'vault/4. ARCHIVE/AGENTS.md', 'vault/5. TOOLS/AGENTS.md']) assert.ok(project.includes(`- \`${f}\``), f);
  assert.ok(read(dir, 'AGENTS.md').includes(LINE));
});

test('only a CLAUDE.md: the pointer joins it and no AGENTS.md appears', () => {
  const dir = claudeOnly();
  const original = read(dir, 'CLAUDE.md');
  const r = run(dir);
  assert.equal(r.code, 0, r.out);
  const claude = read(dir, 'CLAUDE.md');
  assert.ok(claude.startsWith(original));
  assert.ok(claude.includes(LINE));
  assert.ok(!exists(dir, 'AGENTS.md'));
});

test('a CLAUDE.md that imports AGENTS.md leaves the pointer to AGENTS.md alone', () => {
  const dir = numberedVault({ rootAgents: true });
  write(dir, 'CLAUDE.md', '@AGENTS.md\n');
  const r = run(dir);
  assert.equal(r.code, 0, r.out);
  assert.equal(read(dir, 'CLAUDE.md'), '@AGENTS.md\n');
  assert.ok(read(dir, 'AGENTS.md').startsWith('# Project\n\nOwn rules of this project.\n'));
  assert.ok(read(dir, 'AGENTS.md').includes(LINE));
});

test('a CLAUDE.md that does not import AGENTS.md gets the pointer too', () => {
  const dir = numberedVault({ rootAgents: true });
  write(dir, 'CLAUDE.md', '# Own Claude rules\n');
  run(dir);
  assert.ok(read(dir, 'CLAUDE.md').includes(LINE));
  assert.ok(read(dir, 'AGENTS.md').includes(LINE));
});

test('a harness project: one numbered line joins Session start and nothing else changes', () => {
  const dir = harnessProject();
  const before = snapshot(dir);
  const original = read(dir, 'AGENTS.md').split('\n');
  const r = run(dir);
  assert.equal(r.code, 0, r.out);
  const after = read(dir, 'AGENTS.md').split('\n');
  assert.equal(after.length, original.length + 1);
  const at = after.findIndex((l) => l.startsWith('5. Vault work'));
  assert.ok(at > 0, 'the new item');
  assert.ok(after[at].includes(LINE) && after[at].endsWith('<!-- hsb -->'));
  assert.deepEqual([...after.slice(0, at), ...after.slice(at + 1)], original);
  assert.equal(after[at - 1], '4. Read the rest when needed.');
  assert.ok(!after.some((l) => l.includes('hyper-second-brain:start')));
  for (const k of ['PAN-HARNESS.md', 'pan-harness/state.md']) assert.equal(snapshot(dir)[k], before[k], k);
  assert.deepEqual(added(before, snapshot(dir)).filter((f) => f.startsWith('pan-harness/')), []);
});

test('an instruction file that already holds the pointer stays as it is', () => {
  const dir = emptyProject();
  write(dir, 'AGENTS.md', `# Mine\n\nRead ${LINE} first.\n`);
  const r = run(dir);
  assert.equal(r.code, 0, r.out);
  assert.equal(read(dir, 'AGENTS.md'), `# Mine\n\nRead ${LINE} first.\n`);
  assert.equal(r.json.entry.actions[0].kind, 'present');
});

test('missing PARA folders are created in the style of the folders that exist', () => {
  const dir = tmp();
  write(dir, 'vault/0. INBOX/a.md', 'x');
  write(dir, 'vault/1. PROJECTS/b.md', 'x');
  const r = run(dir);
  assert.equal(r.code, 0, r.out);
  assert.deepEqual(folders(path.join(dir, 'vault')).filter((f) => !f.includes('/')),
    ['0. INBOX', '1. PROJECTS', '2. AREAS', '3. RESOURCES', '4. ARCHIVES']);
  assert.equal(r.json.mapping.Areas.create, true);
  assert.equal(r.json.mapping.Inbox.create, false);
});

test('names without numbers are mapped and new ones follow the same plain style', () => {
  const dir = tmp();
  write(dir, 'vault/Inbox/a.md', 'x');
  write(dir, 'vault/Projects/b.md', 'x');
  run(dir);
  assert.ok(exists(dir, 'vault/Areas') && exists(dir, 'vault/Resources') && exists(dir, 'vault/Archives'));
});

test('two folders for one category stop the run (exit 5) until --map decides', () => {
  const dir = tmp();
  write(dir, 'vault/1. PROJECTS/a.md', 'x');
  write(dir, 'vault/Projects/b.md', 'x');
  const before = snapshot(dir);
  const r = run(dir);
  assert.equal(r.code, 5, r.out);
  assert.deepEqual(r.json.candidates.Projects.sort(), ['1. PROJECTS', 'Projects']);
  assert.deepEqual(snapshot(dir), before);
  const ok = run(dir, '--map', 'Projects=1. PROJECTS');
  assert.equal(ok.code, 0, ok.out);
  assert.match(read(dir, 'hyper-second-brain/project.md'), /\| Projects \| `1\. PROJECTS` \|/);
  assert.match(read(dir, 'hyper-second-brain/project.md'), /- `Projects`/);
});

test('a project root that looks like a vault, with no vault folder, stops the run (exit 4)', () => {
  const dir = tmp();
  write(dir, '0. INBOX/a.md', 'x');
  write(dir, '1. PROJECTS/b.md', 'x');
  const before = snapshot(dir);
  const r = run(dir);
  assert.equal(r.code, 4, r.out);
  assert.deepEqual(snapshot(dir), before);
  assert.ok(!exists(dir, 'vault'));
  assert.equal(run(dir, '--create-vault').code, 0);
  assert.ok(exists(dir, 'vault/0 Inbox'));
});

test('a vault folder with another name works with --vault', () => {
  const dir = tmp();
  write(dir, 'notes/0. INBOX/a.md', 'x');
  const r = run(dir, '--vault', 'notes');
  assert.equal(r.code, 0, r.out);
  assert.match(read(dir, 'hyper-second-brain/project.md'), /Vault: `notes\/`/);
  assert.ok(read(dir, 'AGENTS.md').includes('Vault work in `notes/`'));
});

test('line endings of an instruction file stay as they are', () => {
  const dir = emptyProject();
  write(dir, 'AGENTS.md', '# Mine\r\n\r\nOwn rules.\r\n');
  run(dir);
  const text = read(dir, 'AGENTS.md');
  assert.ok(!/(^|[^\r])\n/.test(text), JSON.stringify(text.slice(0, 120)));
  assert.ok(text.startsWith('# Mine\r\n\r\nOwn rules.\r\n'));
});

test('a rules file that is already there stays as it is and is reported as kept', () => {
  const dir = emptyProject();
  write(dir, 'HYPER-SECOND-BRAIN.md', '# My own rules\n');
  const plan = run(dir, '--plan');
  assert.deepEqual(plan.json.rulesFile, { path: 'HYPER-SECOND-BRAIN.md', exists: true });
  const r = run(dir);
  assert.equal(r.code, 0, r.out);
  assert.equal(read(dir, 'HYPER-SECOND-BRAIN.md'), '# My own rules\n');
  assert.ok(r.json.kept.includes('HYPER-SECOND-BRAIN.md') && !r.json.created.includes('HYPER-SECOND-BRAIN.md'));
});

test('the plan marks each package file create or keep, so a project.md that is already there reads as kept', () => {
  const dir = emptyProject();
  write(dir, 'HYPER-SECOND-BRAIN.md', '# My own rules\n');
  write(dir, 'hyper-second-brain/project.md', '# My settings\n\nVault: `vault/`\n');
  const plan = runText(dir, '--plan');
  assert.equal(plan.code, 0, plan.out);
  assert.match(plan.out, /package keep HYPER-SECOND-BRAIN\.md \(already there; it stays as it is\), keep hyper-second-brain\/project\.md \(already there; it stays as it is\), create hyper-second-brain\/\.manifest\.json\n/);
  assert.equal(run(dir).code, 0);
  assert.equal(read(dir, 'hyper-second-brain/project.md'), '# My settings\n\nVault: `vault/`\n');
});

test('without git on the machine the install still works and reports no repository', () => {
  const dir = emptyProject();
  const r = spawnSync(process.execPath, [SCAFFOLD, '--root', dir, '--json'], { encoding: 'utf8', env: { ...process.env, PATH: tmp('hsb-nogit-') } });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(JSON.parse(r.stdout).git.inside, false);
});

const UZ = "Vault bilan ishlash (`vault/`): qayd va hujjatlarni joylash yoki ko'chirish; qaydlarga nom berish; capture, distill yoki draft qilish; loyihani boshlash yoki tugatish; review: avval `HYPER-SECOND-BRAIN.md` ni o'qi. Narsa qayerga qo'yilishini hal qilish uchun `hsb-place-an-item` skill'idan foydalaning.";

test('a translated pointer line goes into a new file, a block and a list item, and the manifest records it', () => {
  // a new AGENTS.md
  const fresh = emptyProject();
  assert.equal(run(fresh, '--pointer-text', `AGENTS.md=${UZ}`).code, 0);
  assert.ok(read(fresh, 'AGENTS.md').includes(UZ) && !read(fresh, 'AGENTS.md').includes('Vault work in'));
  // a block at the end of an existing file
  const block = numberedVault({ rootAgents: true });
  const r = run(block, '--pointer-text', `AGENTS.md=${UZ}`);
  assert.equal(r.code, 0, r.out);
  assert.ok(read(block, 'AGENTS.md').includes(`<!-- hyper-second-brain:start -->\n${UZ}\n<!-- hyper-second-brain:end -->`));
  const m = JSON.parse(read(block, 'hyper-second-brain/.manifest.json'));
  assert.deepEqual(m.pointers, { 'AGENTS.md': { text: UZ, source: r.json.pointerLine } });
  // a list item in a harness AGENTS.md
  const h = harnessProject();
  assert.equal(run(h, '--pointer-text', `AGENTS.md=${UZ}`).code, 0);
  assert.ok(read(h, 'AGENTS.md').split('\n').includes(`5. ${UZ} <!-- hsb -->`));
});

test('without --pointer-text the manifest records no translation', () => {
  const dir = emptyProject();
  run(dir);
  assert.equal(JSON.parse(read(dir, 'hyper-second-brain/.manifest.json')).pointers, undefined);
});

test('a pointer text that cannot be used is refused (exit 2) and nothing is written', () => {
  const dir = numberedVault({ rootAgents: true });
  const before = snapshot(dir);
  for (const bad of ['AGENTS.md=a line without the rules file path', 'AGENTS.md=', 'GEMINI.md=x', 'AGENTS.md=two\nlines HYPER-SECOND-BRAIN.md hsb-place-an-item',
    'AGENTS.md=has <!-- hsb --> marker HYPER-SECOND-BRAIN.md hsb-place-an-item', 'AGENTS.md=names HYPER-SECOND-BRAIN.md but not the skill']) {
    assert.equal(run(dir, '--pointer-text', bad).code, 2, bad);
  }
  assert.deepEqual(snapshot(dir), before);
});

test('a pointer text for a file that gets no pointer line is reported and not used', () => {
  const dir = numberedVault({ rootAgents: true });
  write(dir, 'CLAUDE.md', '@AGENTS.md\n');
  const r = run(dir, '--pointer-text', `CLAUDE.md=${UZ}`);
  assert.equal(r.code, 0, r.out);
  assert.equal(read(dir, 'CLAUDE.md'), '@AGENTS.md\n');
  assert.match(r.json.notes[0], /CLAUDE\.md gets no pointer line/);
});

test('usage errors: missing root, unknown option, a map folder that does not exist, a vault outside the project', () => {
  const dir = numberedVault();
  assert.equal(spawnSync(process.execPath, [SCAFFOLD], { encoding: 'utf8' }).status, 2);
  assert.equal(run(dir, '--nosuch').code, 2);
  assert.equal(run(dir, '--map', 'Projects=Missing folder').code, 2);
  assert.equal(run(dir, '--vault', '../elsewhere').code, 2);
  assert.equal(run(dir, '--map', 'Nothing=x').code, 2);
});

const runText = (root, ...args) => {
  const r = spawnSync(process.execPath, [SCAFFOLD, '--root', root, ...args], { encoding: 'utf8' });
  return { code: r.status, out: r.stdout + r.stderr };
};

test('the plan lists the package files, says "none" for what is absent, and explains each entry action', () => {
  const dir = claudeOnly();
  const plan = runText(dir, '--plan');
  assert.equal(plan.code, 0, plan.out);
  assert.match(plan.out, /package create HYPER-SECOND-BRAIN\.md, create hyper-second-brain\/project\.md, create hyper-second-brain\/\.manifest\.json\n/);
  assert.match(plan.out, /outside PARA: none/);
  assert.match(plan.out, /instruction files in the vault: none/);
  assert.match(plan.out, /entry   CLAUDE\.md: block - the pointer line is added in a marked block at the end of the file/);
  const harness = runText(harnessProject(), '--plan');
  assert.match(harness.out, /entry   AGENTS\.md: list-item - .*last numbered item of "Session start".*<!-- hsb -->/);
  const created = runText(emptyProject(), '--plan');
  assert.match(created.out, /entry   AGENTS\.md: create - a new file/);
  const vault = runText(numberedVault(), '--plan');
  assert.match(vault.out, /outside PARA: 5\. TOOLS/);
  assert.match(vault.out, /instruction file in the vault: vault\/AGENTS\.md \(stays as it is; it gets no pointer line\)/);
});

test('the result says which existing file changed and which pointer line was written in each', () => {
  const dir = claudeOnly();
  const text = runText(dir);
  assert.equal(text.code, 0, text.out);
  assert.match(text.out, /done: \d+ created, 1 changed, 0 kept/);
  assert.match(text.out, /changed CLAUDE\.md: the pointer line was added/);
  assert.match(text.out, /pointer line written in CLAUDE\.md \(the English default\): Vault work in/);
  const translated = numberedVault({ rootAgents: true });
  const line = "Vault bilan ishlash (`vault/`): avval `HYPER-SECOND-BRAIN.md` ni o'qi; joylash uchun `hsb-place-an-item`.";
  const r = run(translated, '--pointer-text', `AGENTS.md=${line}`);
  assert.equal(r.code, 0, r.out);
  assert.deepEqual(r.json.changed, ['AGENTS.md']);
  assert.equal(r.json.pointerLines['AGENTS.md'], line);
  const again = runText(emptyProject());
  assert.match(again.out, /created AGENTS\.md/);
  assert.match(again.out, /pointer line written in AGENTS\.md \(the English default\)/);
});

test('instruction files in the top-level folders outside PARA are listed in project.md too', () => {
  const dir = emptyProject();
  write(dir, 'vault/0 Inbox/note.md', 'x');
  write(dir, 'vault/6 TOOLS/AGENTS.md', '# Tools\n');
  write(dir, 'vault/Misc/CLAUDE.md', '# Misc\n');
  write(dir, 'vault/Misc/deep/AGENTS.md', '# Deeper than one level\n');
  const r = run(dir);
  assert.equal(r.code, 0, r.out);
  assert.deepEqual(r.json.instructionFiles.sort(), ['vault/6 TOOLS/AGENTS.md', 'vault/Misc/CLAUDE.md']);
  const project = read(dir, 'hyper-second-brain/project.md');
  assert.ok(project.includes('- `vault/6 TOOLS/AGENTS.md`') && project.includes('- `vault/Misc/CLAUDE.md`'));
});
