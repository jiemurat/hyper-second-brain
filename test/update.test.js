// hsb-update's script: what it refreshes, what it never touches, and how the migration steps run.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { write, snapshot, emptyProject, numberedVault, harnessProject } from './fixtures.js';
import { planMigrations, runMigrations, refreshPointerText, pointerLine } from '../core/scripts/hsb-lib.mjs';
import { MIGRATIONS } from '../core/scripts/migrations.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCAFFOLD = path.join(ROOT, 'skills', 'hsb-init', 'scripts', 'scaffold.mjs');
const UPDATE = path.join(ROOT, 'skills', 'hsb-update', 'scripts', 'update.mjs');
const VERSION = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;

const node = (script, root, args = []) => {
  const r = spawnSync(process.execPath, [script, '--root', root, ...args], { encoding: 'utf8' });
  let json = null;
  try {
    json = JSON.parse(r.stdout);
  } catch {
    // text output
  }
  return { code: r.status, json, out: r.stdout + r.stderr };
};
const update = (dir, ...args) => node(UPDATE, dir, ['--json', ...args]);
const read = (dir, rel) => fs.readFileSync(path.join(dir, rel), 'utf8');
const manifestOf = (dir) => JSON.parse(read(dir, 'hyper-second-brain/.manifest.json'));
const setManifest = (dir, change) => {
  const m = manifestOf(dir);
  change(m);
  write(dir, 'hyper-second-brain/.manifest.json', `${JSON.stringify(m, null, 2)}\n`);
};

/** A project installed by hsb-init and then made to look like one from an older version: the manifest records an older version. */
function oldProject(dir = numberedVault()) {
  assert.equal(node(SCAFFOLD, dir, ['--json']).code, 0);
  setManifest(dir, (m) => { m.version = '0.9.0'; });
  return dir;
}

test('an older project: the manifest follows the version; the rules file, project.md and the vault stay', () => {
  const dir = oldProject();
  const before = snapshot(dir);
  const r = update(dir);
  assert.equal(r.code, 0, r.out);
  assert.equal(r.json.status, 'done');
  assert.equal(manifestOf(dir).version, VERSION);
  const after = snapshot(dir);
  assert.deepEqual(Object.keys(before).filter((k) => before[k] !== after[k]), ['hyper-second-brain/.manifest.json']);
  assert.deepEqual(Object.keys(after).filter((k) => !(k in before)), []);
});

test('HYPER-SECOND-BRAIN.md is the project\'s file: an edited one, and a missing one, are left as they are', () => {
  const dir = oldProject();
  fs.appendFileSync(path.join(dir, 'HYPER-SECOND-BRAIN.md'), '\nMy own line.\n');
  const edited = read(dir, 'HYPER-SECOND-BRAIN.md');
  assert.equal(update(dir).code, 0);
  assert.equal(read(dir, 'HYPER-SECOND-BRAIN.md'), edited);
  const gone = oldProject();
  fs.rmSync(path.join(gone, 'HYPER-SECOND-BRAIN.md'));
  assert.equal(update(gone).code, 0);
  assert.ok(!fs.existsSync(path.join(gone, 'HYPER-SECOND-BRAIN.md')));
});

test('the pointer wording is refreshed in a block and in a list item; the text around stays', () => {
  const dir = oldProject();
  const agents = read(dir, 'AGENTS.md').replace(/(<!-- hyper-second-brain:start -->\n)[\s\S]*?(\n<!-- hyper-second-brain:end -->)/, '$1Old wording of the pointer.$2');
  write(dir, 'AGENTS.md', `${agents}\nTrailing words of the user.\n`);
  const r = update(dir);
  assert.equal(r.code, 0, r.out);
  assert.equal(r.json.pointers['AGENTS.md'], 'refresh');
  const text = read(dir, 'AGENTS.md');
  assert.ok(!text.includes('Old wording'));
  assert.ok(text.includes('read `HYPER-SECOND-BRAIN.md` first'));
  assert.ok(text.endsWith('Trailing words of the user.\n'));
  // a list item in a harness AGENTS.md
  const h = harnessProject();
  assert.equal(node(SCAFFOLD, h, ['--json']).code, 0);
  write(h, 'AGENTS.md', read(h, 'AGENTS.md').replace(/^5\. .*<!-- hsb -->$/m, '5. Old list wording. <!-- hsb -->'));
  setManifest(h, (m) => { m.version = '0.9.0'; });
  assert.equal(update(h).code, 0);
  const item = read(h, 'AGENTS.md').split('\n').find((l) => l.endsWith('<!-- hsb -->'));
  assert.ok(item.startsWith('5. Vault work in `vault/`'), item);
});

test('line endings of an instruction file stay when the wording is refreshed', () => {
  const dir = oldProject();
  const crlf = read(dir, 'AGENTS.md').replace(/\n/g, '\r\n').replace(/read `HYPER-SECOND-BRAIN[^\r]*/, 'old wording.');
  write(dir, 'AGENTS.md', crlf);
  assert.equal(update(dir).code, 0);
  const text = read(dir, 'AGENTS.md');
  assert.ok(!/(^|[^\r])\n/.test(text));
  assert.ok(text.includes('read `HYPER-SECOND-BRAIN.md`'));
});

test('a project at the current version writes nothing', () => {
  const dir = numberedVault();
  assert.equal(node(SCAFFOLD, dir, ['--json']).code, 0);
  const before = snapshot(dir);
  const r = update(dir);
  assert.equal(r.code, 0, r.out);
  assert.equal(r.json.status, 'current');
  assert.deepEqual(snapshot(dir), before);
});

test('--plan writes nothing and lists what would change', () => {
  const dir = oldProject();
  const before = snapshot(dir);
  const r = update(dir, '--plan');
  assert.equal(r.code, 0, r.out);
  assert.equal(r.json.status, 'plan');
  assert.equal(r.json.from, '0.9.0');
  assert.equal(r.json.to, VERSION);
  assert.deepEqual(snapshot(dir), before);
});

test('exit 3 when hyper-second-brain is not set up, exit 4 when the project is newer than the skills', () => {
  assert.equal(update(emptyProject()).code, 3);
  const dir = oldProject();
  setManifest(dir, (m) => { m.version = '99.0.0'; });
  const r = update(dir);
  assert.equal(r.code, 4, r.out);
  assert.equal(r.json.status, 'project-newer');
});

test('usage errors', () => {
  assert.equal(spawnSync(process.execPath, [UPDATE], { encoding: 'utf8' }).status, 2);
  assert.equal(update(emptyProject(), '--nosuch').code, 2);
});

// ---- the migration runner ---------------------------------------------------------------------

const step = (version, id, kind, log) => ({ version, id, kind, description: `${id} text`, run: () => { log.push(`${version} ${id}`); } });

test('the planner picks the versions after the project\'s own up to the skills\', oldest first', () => {
  const log = [];
  const all = [step('1.2.0', 'c', 'mechanical', log), step('1.1.0', 'a', 'mechanical', log), step('1.1.0', 'b', 'structural', log), step('1.3.0', 'd', 'mechanical', log), step('1.0.0', 'z', 'mechanical', log)];
  assert.deepEqual(planMigrations(all, '1.0.0', '1.2.0').map((s) => s.id), ['a', 'b', 'c']);
  assert.deepEqual(planMigrations(all, '1.2.0', '1.2.0'), []);
  assert.deepEqual(planMigrations([], '0.9.0', '1.0.0'), []);
});

test('the runner runs mechanical steps, hands back structural and by-hand ones, and records each version', async () => {
  const log = [];
  const steps = [step('1.1.0', 'a', 'mechanical', log), step('1.1.0', 'b', 'structural', log), step('1.2.0', 'c', 'by-hand', log), step('1.2.0', 'd', 'mechanical', log)];
  const recorded = [];
  const result = await runMigrations({}, steps, (v) => recorded.push(v));
  assert.deepEqual(log, ['1.1.0 a', '1.2.0 d']);
  assert.deepEqual(result.done, ['1.1.0 a', '1.2.0 d']);
  assert.deepEqual(result.structural.map((s) => s.id), ['b']);
  assert.deepEqual(result.byHand.map((s) => s.id), ['c']);
  assert.deepEqual(recorded, ['1.1.0', '1.2.0']);
});

test('a failing step stops the run; the last finished version stays recorded', async () => {
  const log = [];
  const boom = { version: '1.2.0', id: 'x', kind: 'mechanical', description: '', run: () => { throw new Error('boom'); } };
  const recorded = [];
  await assert.rejects(runMigrations({}, [step('1.1.0', 'a', 'mechanical', log), boom, step('1.3.0', 'e', 'mechanical', log)], (v) => recorded.push(v)), /boom/);
  assert.deepEqual(recorded, ['1.1.0']);
  assert.deepEqual(log, ['1.1.0 a']);
});

test('the pointer refresh changes only the marked wording', () => {
  const text = 'Mine.\n\n<!-- hyper-second-brain:start -->\nold\n<!-- hyper-second-brain:end -->\n\nAlso mine.\n';
  const out = refreshPointerText(text, pointerLine('vault'));
  assert.ok(out.startsWith('Mine.\n\n<!-- hyper-second-brain:start -->\nVault work in `vault/`'));
  assert.ok(out.endsWith('<!-- hyper-second-brain:end -->\n\nAlso mine.\n'));
  assert.equal(refreshPointerText('Nothing marked here.\n', pointerLine('vault')), 'Nothing marked here.\n');
});

// ---- the changelogs ---------------------------------------------------------------------------

test('the changelogs end at the package version and every migration version has an entry', () => {
  const versions = (file) => [...fs.readFileSync(path.join(ROOT, file), 'utf8').matchAll(/^## (\d+\.\d+\.\d+)\s*$/gm)].map((m) => m[1]);
  for (const file of ['CHANGELOG.md', 'core/references/changelog.md']) {
    const v = versions(file);
    assert.ok(v.length > 0, file);
    assert.equal(v[v.length - 1], VERSION, `${file}: the last entry`);
  }
  const listed = new Set(versions('core/references/changelog.md'));
  for (const m of MIGRATIONS) assert.ok(listed.has(m.version), `migration ${m.id}: no changelog entry for ${m.version}`);
});

// ---- a pointer line in the language of the instruction file ---------------------------------------

const UZ = "Vault bilan ishlash (`vault/`): qayd va hujjatlarni joylash yoki ko'chirish; qaydlarga nom berish; capture, distill yoki draft qilish; loyihani boshlash yoki tugatish; review: avval `HYPER-SECOND-BRAIN.md` ni o'qi. Narsa qayerga qo'yilishini hal qilish uchun `hsb-place-an-item` skill'idan foydalaning.";

function oldProjectWithTranslation() {
  const dir = numberedVault({ rootAgents: true });
  assert.equal(node(SCAFFOLD, dir, ['--json', '--pointer-text', `AGENTS.md=${UZ}`]).code, 0);
  setManifest(dir, (m) => { m.version = '0.9.0'; });
  return dir;
}

test('a translated pointer line is left alone while the English wording it came from is the same', () => {
  const dir = oldProjectWithTranslation();
  const before = read(dir, 'AGENTS.md');
  const r = update(dir);
  assert.equal(r.code, 0, r.out);
  assert.equal(r.json.pointers['AGENTS.md'], 'current');
  assert.equal(read(dir, 'AGENTS.md'), before);
  assert.ok(read(dir, 'AGENTS.md').includes(UZ));
  assert.equal(manifestOf(dir).pointers['AGENTS.md'].text, UZ);
});

test('when the English wording changed, the plan says translate and --pointer-text applies the new translation', () => {
  const dir = oldProjectWithTranslation();
  setManifest(dir, (m) => { m.pointers['AGENTS.md'].source = 'an older English wording'; });
  const before = read(dir, 'AGENTS.md');
  const r = update(dir);
  assert.equal(r.code, 0, r.out);
  assert.equal(r.json.pointers['AGENTS.md'], 'translate');
  assert.equal(r.json.translate[0].file, 'AGENTS.md');
  assert.equal(r.json.translate[0].english, pointerLine('vault'));
  assert.equal(read(dir, 'AGENTS.md'), before);
  const NEW = `${UZ} (yangi)`;
  const again = update(dir, '--pointer-text', `AGENTS.md=${NEW}`);
  assert.equal(again.code, 0, again.out);
  assert.ok(read(dir, 'AGENTS.md').includes(NEW) && !read(dir, 'AGENTS.md').includes(`${UZ}\n`));
  assert.deepEqual(manifestOf(dir).pointers['AGENTS.md'], { text: NEW, source: pointerLine('vault') });
  assert.equal(update(dir).json.status, 'current');
});

test('update refuses a pointer text that cannot be used', () => {
  const dir = oldProject();
  assert.equal(update(dir, '--pointer-text', 'AGENTS.md=no path in this line').code, 2);
  assert.equal(update(dir, '--pointer-text', 'GEMINI.md=x').code, 2);
});
