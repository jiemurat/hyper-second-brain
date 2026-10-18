// hsb-doctor's script: what it finds in an installed project, what --fix repairs, and what it never touches.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { tmp, write, snapshot, emptyProject, numberedVault, harnessProject } from './fixtures.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCAFFOLD = path.join(ROOT, 'skills', 'hsb-init', 'scripts', 'scaffold.mjs');
const CHECK = path.join(ROOT, 'skills', 'hsb-doctor', 'scripts', 'hsb-check.mjs');
const RULES = 'HYPER-SECOND-BRAIN.md';

const node = (script, root, args, env = {}) => {
  const r = spawnSync(process.execPath, [script, '--root', root, ...args], { encoding: 'utf8', env: { ...process.env, ...env } });
  let json = null;
  try {
    json = JSON.parse(r.stdout);
  } catch {
    // text output
  }
  return { code: r.status, json, out: r.stdout + r.stderr };
};
const install = (dir) => {
  const r = node(SCAFFOLD, dir, ['--json']);
  assert.equal(r.code, 0, r.out);
  return dir;
};
const check = (dir, ...args) => node(CHECK, dir, ['--json', ...args]);
const find = (r, id) => r.json.findings.find((f) => f.id === id);
const level = (r, id) => find(r, id)?.level;
const read = (dir, rel) => fs.readFileSync(path.join(dir, rel), 'utf8');
const exists = (dir, rel) => fs.existsSync(path.join(dir, rel));
const installedVault = () => install(numberedVault());
// dates are computed from today, as the user's local calendar day (the script's own "today"): the repository keeps no literal dates
const daysAgo = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

test('a fresh install has no failure; the missing way back is a warning', () => {
  const dir = installedVault();
  const r = check(dir);
  assert.equal(r.code, 0, r.out);
  assert.equal(r.json.counts.fail, 0);
  assert.equal(level(r, 'pointer'), 'ok');
  assert.equal(level(r, 'folders'), 'ok');
  assert.equal(level(r, 'rules-file'), 'ok');
  assert.equal(level(r, 'way-back'), 'warn');
  // the old operations-note and monthly-review checks are gone; the Project List check is with hsb-projects, the reviews with hsb-review
  for (const id of ['operations-note', 'monthly-review']) assert.equal(find(r, id), undefined, id);
  assert.equal(level(r, 'project-list'), 'info'); // ALPHA and no list
  assert.equal(level(r, 'reviews'), 'info'); // no review ran yet
  assert.equal(level(r, 'naming'), 'info');
  assert.match(find(r, 'top-level')?.message ?? 'none', /none|5\. TOOLS/);
});

test('exit 3 when hyper-second-brain is not set up, exit 4 when the project is older than the skills', () => {
  assert.equal(check(emptyProject()).code, 3);
  const dir = installedVault();
  const m = JSON.parse(read(dir, 'hyper-second-brain/.manifest.json'));
  m.version = '0.9.0';
  write(dir, 'hyper-second-brain/.manifest.json', JSON.stringify(m));
  const r = check(dir);
  assert.equal(r.code, 4, r.out);
  assert.equal(r.json.status, 'outdated');
});

test('a missing pointer line is found and --fix adds it once', () => {
  const dir = installedVault();
  write(dir, 'AGENTS.md', '# Project instructions\n\nOnly my words.\n');
  const r = check(dir);
  assert.equal(r.code, 1);
  assert.equal(level(r, 'pointer:AGENTS.md'), 'fail');
  const fixed = check(dir, '--fix');
  assert.equal(fixed.code, 0, fixed.out);
  assert.ok(read(dir, 'AGENTS.md').startsWith('# Project instructions\n\nOnly my words.\n'));
  assert.equal(read(dir, 'AGENTS.md').split('hyper-second-brain:start').length, 2);
  const before = snapshot(dir);
  assert.equal(check(dir, '--fix').code, 0);
  assert.deepEqual(snapshot(dir), before);
});

test('repairing a pointer line leaves the manifest as it was and says which line was added', () => {
  const dir = installedVault();
  write(dir, 'AGENTS.md', '# Project instructions\n\nOnly my words.\n');
  const manifestBefore = read(dir, 'hyper-second-brain/.manifest.json');
  const r = check(dir, '--fix');
  assert.equal(r.code, 0, r.out);
  assert.equal(read(dir, 'hyper-second-brain/.manifest.json'), manifestBefore);
  assert.deepEqual(r.json.fixed, ['AGENTS.md: pointer line added (the English line)']);
});

test('a missing HYPER-SECOND-BRAIN.md is a failure; --fix writes it from the template with the vault path', () => {
  const dir = install(tmp());
  fs.rmSync(path.join(dir, RULES));
  const r = check(dir);
  assert.equal(r.code, 1, r.out);
  assert.equal(level(r, 'rules-file'), 'fail');
  assert.equal(find(r, 'rules-file').fixable, '--fix');
  const fixed = check(dir, '--fix');
  assert.equal(fixed.code, 0, fixed.out);
  assert.deepEqual(fixed.json.fixed, [`${RULES} written from the template`]);
  const text = read(dir, RULES);
  assert.ok(text.startsWith('# HYPER-SECOND-BRAIN\n') && text.includes('`vault/`') && !text.includes('{{'));
  // another vault folder name is written into the file
  const notes = tmp();
  write(notes, 'notes/0. INBOX/a.md', 'x');
  assert.equal(node(SCAFFOLD, notes, ['--json', '--vault', 'notes']).code, 0);
  fs.rmSync(path.join(notes, RULES));
  assert.equal(check(notes, '--fix').code, 0);
  assert.ok(read(notes, RULES).includes('`notes/`'));
});

test('a HYPER-SECOND-BRAIN.md that exists is the project\'s: edits are fine, --fix never replaces it, a missing section is a warning', () => {
  const dir = installedVault();
  fs.appendFileSync(path.join(dir, RULES), '\nMy own line.\n');
  assert.equal(level(check(dir), 'rules-file'), 'ok');
  const original = read(dir, RULES);
  write(dir, RULES, original.replace('## Order of authority', '## Something else'));
  const edited = read(dir, RULES);
  const r = check(dir, '--fix');
  assert.equal(r.code, 0, r.out);
  assert.equal(level(r, 'rules-file'), 'warn');
  assert.match(find(r, 'rules-file').message, /lacks the section\(s\): Order of authority/);
  assert.equal(read(dir, RULES), edited);
  assert.deepEqual(r.json.fixed, []);
});

const manifestOf = (dir) => JSON.parse(read(dir, 'hyper-second-brain/.manifest.json'));

test('the manifest records the template the rules file came from; a file that names a skill the package lacks is a warning', () => {
  const dir = installedVault();
  const template = manifestOf(dir).rulesTemplate;
  assert.match(template, /^[0-9a-f]{64}$/);
  write(dir, RULES, read(dir, RULES).replace('## Principles', '## Principles\n\nRun hsb-vault-tidy once a week.'));
  const r = check(dir, '--fix');
  assert.equal(level(r, 'rules-file'), 'warn');
  assert.match(find(r, 'rules-file').message, /names skills that are not installed: hsb-vault-tidy/);
  assert.ok(!r.out.includes('once a week'), 'no text of the file is printed');
  assert.deepEqual(r.json.fixed, []);
});

test('a rules file that the manifest does not tie to the template of these skills is a warning until it is refreshed or kept', () => {
  // a rules file that was there before hsb-init: it stays, and nothing records where it came from
  const dir = numberedVault();
  write(dir, RULES, '# HYPER-SECOND-BRAIN\n\nAn older wording.\n');
  install(dir);
  assert.equal(manifestOf(dir).rulesTemplate, undefined);
  const full = read(install(tmp()), RULES); // a current file with every section, for the section check
  write(dir, RULES, `${full}\nAn own line of the user.\n`);
  let r = check(dir);
  assert.equal(level(r, 'rules-file'), 'warn');
  assert.match(find(r, 'rules-file').message, /differs from the template of these skills/);
  assert.equal(find(r, 'rules-file').data.template, 'unknown');
  // the user saw the differences and kept the file (or took the new text): --record-rules ties it to the current template
  r = check(dir, '--record-rules');
  assert.equal(level(r, 'rules-file'), 'ok', find(r, 'rules-file').message);
  assert.deepEqual(r.json.fixed, [`${RULES} recorded as checked against the template of these skills`]);
  assert.match(manifestOf(dir).rulesTemplate, /^[0-9a-f]{64}$/);
  // a later version brings another template: the recorded one no longer matches
  const m = manifestOf(dir);
  m.rulesTemplate = '0'.repeat(64);
  write(dir, 'hyper-second-brain/.manifest.json', `${JSON.stringify(m, null, 2)}\n`);
  r = check(dir);
  assert.equal(level(r, 'rules-file'), 'warn');
  assert.equal(find(r, 'rules-file').data.template, 'older');
});

test('a rules file from an older version lacks the newer sections: one warning names them all, and --fix leaves the file alone', () => {
  const dir = installedVault();
  const old = read(dir, RULES).split('## Categories')[0];
  write(dir, RULES, old);
  const r = check(dir, '--fix');
  assert.equal(r.code, 0, r.out);
  assert.equal(level(r, 'rules-file'), 'warn');
  for (const h of ['Categories', 'Folders and names', 'What you may do and what you ask first', 'Links', 'Language', 'Data and secrets', 'Project List']) {
    assert.ok(find(r, 'rules-file').message.includes(h), h);
  }
  assert.equal(read(dir, RULES), old);
  assert.deepEqual(r.json.fixed, []);
});

test('a mapped PARA folder that is gone is created empty by --fix; the rest of the vault stays', () => {
  const dir = install(tmp());
  fs.rmdirSync(path.join(dir, 'vault', '2 Areas'));
  const before = snapshot(dir);
  const r = check(dir);
  assert.equal(level(r, 'folder:Areas'), 'fail');
  assert.equal(check(dir, '--fix').code, 0);
  assert.ok(exists(dir, 'vault/2 Areas'));
  assert.deepEqual(snapshot(dir), before);
});

test('the Inbox count is a fact, never a warning, and the Inbox\'s _about.md is no item', () => {
  const dir = install(tmp());
  for (let i = 0; i < 51; i++) write(dir, `vault/0 Inbox/note ${i}.md`, 'x');
  write(dir, 'vault/0 Inbox/_about.md', '# 0 Inbox\n');
  const r = check(dir);
  assert.equal(level(r, 'inbox'), 'ok');
  assert.equal(find(r, 'inbox').data.inbox, 51);
  assert.match(find(r, 'inbox').message, /holds 51 files$/);
});

test('the check reads only: no file changes and no note text is printed', () => {
  const dir = installedVault();
  const SECRET = 'SENTINEL-TEXT-4711';
  write(dir, 'vault/0. INBOX/Private.md', `${SECRET}\n`);
  write(dir, 'vault/2. AREAS/Vault management/Vault operations.md', `Last weekly maintenance: ${daysAgo(5)}\n\n${SECRET} playbook\n`);
  write(dir, 'vault/1. PROJECTS/Project List.md', `${SECRET}\n`);
  const before = snapshot(dir);
  for (const args of [[], ['--today', daysAgo(0)]]) {
    const r = check(dir, ...args);
    assert.ok(!r.out.includes(SECRET), 'a note text was printed');
  }
  const text = node(CHECK, dir, []);
  assert.ok(!text.out.includes(SECRET));
  assert.deepEqual(snapshot(dir), before);
});

test('git facts: tracked files, the age of the last commit, uncommitted changes, and an ignored vault', { skip: spawnSync('git', ['--version']).status !== 0 && 'git is missing' }, () => {
  const dir = installedVault();
  const git = (...a) => spawnSync('git', ['-C', dir, '-c', 'user.name=t', '-c', 'user.email=t@example.com', ...a], { encoding: 'utf8' });
  git('init', '-q');
  git('add', '-A');
  git('commit', '-q', '-m', 'base');
  write(dir, 'vault/0. INBOX/Quick idea.md', 'changed\n');
  const r = check(dir);
  const data = find(r, 'way-back').data;
  assert.equal(level(r, 'way-back'), 'info');
  assert.ok(data.tracked > 5);
  assert.equal(data.uncommitted, 1);
  assert.equal(data.lastCommitDaysAgo, 0);
  // a vault that git ignores is no way back
  const ignored = installedVault();
  const gi = (...a) => spawnSync('git', ['-C', ignored, '-c', 'user.name=t', '-c', 'user.email=t@example.com', ...a], { encoding: 'utf8' });
  gi('init', '-q');
  write(ignored, '.gitignore', 'vault/\n');
  gi('add', '-A');
  gi('commit', '-q', '-m', 'base');
  assert.equal(level(check(ignored), 'way-back'), 'warn');
  assert.match(find(check(ignored), 'way-back').message, /ignores vault\//);
});

test('without git on the machine the check still runs and says there is no git', () => {
  const dir = installedVault();
  const r = node(CHECK, dir, ['--json'], { PATH: tmp('hsb-nogit-') });
  assert.equal(r.code, 0, r.out);
  assert.match(find(r, 'way-back').message, /no git here/);
});

test('Word and Excel files without a converter on the PATH give a hint', { skip: process.platform === 'win32' && 'needs sh' }, () => {
  const dir = installedVault();
  write(dir, 'vault/0. INBOX/Offer.docx', 'x');
  write(dir, 'vault/0. INBOX/Table.xlsx', 'x');
  const bin = tmp('hsb-bin-');
  fs.symlinkSync(fs.realpathSync('/bin/sh'), path.join(bin, 'sh'));
  const r = node(CHECK, dir, ['--json'], { PATH: bin });
  assert.match(find(r, 'readers').message, /docx \(1\), xlsx \(1\)/);
  assert.equal(find(r, 'file-types').data.docx, 1);
});

test('a project harness that reports errors is a failure; one that reports none is fine', () => {
  const dir = install(harnessProject());
  const script = (n) => `console.log('pan-harness-check 1.3.1: ${n} error(s), 0 warning(s)');process.exit(${n ? 1 : 0});`;
  write(dir, 'pan-harness/scripts/pan-harness-check.mjs', script(2));
  assert.equal(level(check(dir), 'harness'), 'fail');
  write(dir, 'pan-harness/scripts/pan-harness-check.mjs', script(0));
  assert.equal(level(check(dir), 'harness'), 'ok');
});

test('project.md that points to a file that does not exist is a failure', () => {
  const dir = installedVault();
  const file = path.join(dir, 'hyper-second-brain', 'project.md');
  fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('- None recorded.', '- Commits: `RULES-GONE.md`, rule R3.'));
  const r = check(dir);
  assert.equal(level(r, 'project-rules'), 'fail');
  assert.match(find(r, 'project-rules').message, /RULES-GONE\.md/);
});

test('a pointer block twice and a new top-level folder are noticed', () => {
  const dir = installedVault();
  const agents = read(dir, 'AGENTS.md');
  write(dir, 'AGENTS.md', `${agents}\n${agents.slice(agents.indexOf('<!-- hyper-second-brain:start -->'))}`);
  fs.mkdirSync(path.join(dir, 'vault', '6. NEW'));
  const r = check(dir);
  assert.equal(level(r, 'pointer-twice:AGENTS.md'), 'warn');
  assert.match(find(r, 'top-level').message, /6\. NEW/);
});

test('--fix puts back the recorded translation of a pointer line; an old source is only an info', () => {
  const UZ = "Vault bilan ishlash (`vault/`): qayd va hujjatlarni joylash yoki ko'chirish; qaydlarga nom berish; capture, distill yoki draft qilish; loyihani boshlash yoki tugatish; review: avval `HYPER-SECOND-BRAIN.md` ni o'qi. Narsa qayerga qo'yilishini hal qilish uchun `hsb-place-an-item` skill'idan foydalaning.";
  const dir = numberedVault({ rootAgents: true });
  assert.equal(node(SCAFFOLD, dir, ['--json', '--pointer-text', `AGENTS.md=${UZ}`]).code, 0);
  const installed = read(dir, 'AGENTS.md');
  write(dir, 'AGENTS.md', '# Project\n\nOwn rules of this project.\n');
  assert.equal(level(check(dir), 'pointer:AGENTS.md'), 'fail');
  assert.equal(check(dir, '--fix').code, 0);
  assert.ok(read(dir, 'AGENTS.md').includes(UZ));
  assert.equal(read(dir, 'AGENTS.md'), installed);
  const m = JSON.parse(read(dir, 'hyper-second-brain/.manifest.json'));
  m.pointers['AGENTS.md'].source = 'an older English wording';
  write(dir, 'hyper-second-brain/.manifest.json', JSON.stringify(m));
  const r = check(dir);
  assert.equal(level(r, 'pointer-wording:AGENTS.md'), 'info');
  assert.equal(r.code, 0);
});

test('usage errors', () => {
  assert.equal(spawnSync(process.execPath, [CHECK], { encoding: 'utf8' }).status, 2);
  assert.equal(node(CHECK, emptyProject(), ['--nosuch']).code, 2);
  assert.equal(node(CHECK, emptyProject(), ['--today', 'tomorrow']).code, 2);
});

test('the naming finding names each folder together with the default it differs from', () => {
  const r = check(installedVault());
  assert.match(find(r, 'naming').message, /Inbox is "0\. INBOX" \(the package's default: "0 Inbox"\)/);
  assert.match(find(r, 'naming').message, /Archives is "4\. ARCHIVE" \(the package's default: "4 Archives"\)/);
  assert.equal(find(check(install(tmp())), 'naming'), undefined);
});

test('rules that project.md does not record are an info; recording them, or saying there are none, clears it', () => {
  const dir = install(emptyProject());
  const rules = Array.from({ length: 6 }, (_, i) => `- **R${i + 1}.** Rule number ${i + 1} of this project.`).join('\n');
  write(dir, 'AGENTS.md', `# Project\n\n## Rules\n\n${rules}\n\n<!-- hyper-second-brain:start -->\nline\n<!-- hyper-second-brain:end -->\n`);
  const first = check(dir);
  assert.equal(level(first, 'project-rules'), 'info');
  assert.match(find(first, 'project-rules').message, /"Project rules" section of project\.md records none/);
  const project = path.join(dir, 'hyper-second-brain', 'project.md');
  const text = fs.readFileSync(project, 'utf8');
  fs.writeFileSync(project, text.replace('- None recorded.', '- Everything: `AGENTS.md`, section "Rules".'));
  assert.equal(level(check(dir), 'project-rules'), 'ok');
  fs.writeFileSync(project, text.replace('- None recorded.', '- None: the project has no rule files.'));
  assert.equal(level(check(dir), 'project-rules'), 'ok');
});

test('about-files counts the category folders and the folders directly inside them that have an _about.md, by name only', () => {
  const dir = installedVault();
  let r = check(dir);
  assert.equal(level(r, 'about-files'), 'info');
  assert.match(find(r, 'about-files').message, /^0 of \d+ category folders and folders directly inside them have an _about\.md; without one: /);
  write(dir, 'vault/1. PROJECTS/ALPHA/_about.md', '# ALPHA\n\nSecret text that must not be printed.\n');
  write(dir, 'vault/1. PROJECTS/_about.md', '# Projects\n');
  r = check(dir);
  assert.match(find(r, 'about-files').message, /^2 of \d+ /);
  assert.ok(!r.out.includes('Secret text'));
  assert.equal(find(r, 'about-files').data.described, 2);
});

test('project-list: the list names each project folder once; names and entry numbers only, never the text of an entry', () => {
  const dir = installedVault();
  const P = 'vault/1. PROJECTS';
  write(dir, `${P}/Q3/Plan.md`, 'Invented text.\n');
  write(dir, `${P}/Q3 RESEARCH REPORT/Notes.md`, 'Invented text.\n');
  write(dir, `${P}/Project List.md`, '# Project List\n\n1. [[ALPHA]] by May (Goal: secret goal words; Area: none)\n2. Q3 RESEARCH REPORT by end of Q3 (Goal: the report is published; Area: Work)\n3. Q3 by June (Goal: done; Area: none)\n');
  let r = check(dir);
  assert.equal(level(r, 'project-list'), 'ok', find(r, 'project-list')?.message);
  assert.deepEqual(find(r, 'project-list').data, { entries: 3, folders: 3, unlisted: 0, orphans: 0 });
  write(dir, `${P}/Project List.md`, '# Project List\n\n1. Q3 RESEARCH REPORT by end of Q3 (Goal: the report is published; Area: Work)\n2. GONE PROJECT by May (Goal: secret goal words; Area: none)\n');
  r = check(dir);
  const f = find(r, 'project-list');
  assert.equal(f.level, 'warn');
  assert.match(f.message, /folders without an entry: ALPHA, Q3; entries that name no folder: 2/);
  assert.ok(!/secret goal words|GONE PROJECT/.test(r.out), 'no text of an entry is printed');
});

test('project-list: a folder that "Lasting choices" marks as not a project needs no entry', () => {
  const dir = installedVault();
  const P = 'vault/1. PROJECTS';
  write(dir, `${P}/VACANCIES/.keep`, '');
  write(dir, `${P}/Project List.md`, '# Project List\n\n1. ALPHA by May (Goal: done; Area: none)\n');
  assert.match(find(check(dir), 'project-list').message, /folders without an entry: VACANCIES/);
  const project = path.join(dir, 'hyper-second-brain/project.md');
  fs.writeFileSync(project, read(dir, 'hyper-second-brain/project.md').replace('- None yet.', '- Not projects: `VACANCIES` (a container: each vacancy gets its own folder)'));
  const r = check(dir);
  assert.equal(level(r, 'project-list'), 'ok', find(r, 'project-list').message);
  assert.deepEqual(find(r, 'project-list').data, { entries: 1, folders: 1, unlisted: 0, orphans: 0 });
});

test('project-list: no finding when Projects holds no project folder and no list', () => {
  const dir = installedVault();
  fs.rmSync(path.join(dir, 'vault/1. PROJECTS/ALPHA'), { recursive: true });
  assert.equal(find(check(dir), 'project-list'), undefined);
});

test('reviews: the dates in hyper-second-brain/state.json; a review that is due is an info, a damaged file a warning', () => {
  const dir = installedVault();
  const state = (reviews) => write(dir, 'hyper-second-brain/state.json', `${JSON.stringify({ lastId: 0, questions: [], reviews })}\n`);
  let f = find(check(dir), 'reviews');
  assert.equal(f.level, 'info');
  assert.match(f.message, /weekly review never ran; the monthly review never ran: due/);
  state({ weekly: daysAgo(3), monthly: daysAgo(30) });
  f = find(check(dir), 'reviews');
  assert.equal(f.level, 'ok', f.message);
  assert.deepEqual(f.data.weekly, { last: daysAgo(3), days: 3, due: false });
  state({ weekly: daysAgo(8), monthly: daysAgo(10) });
  f = find(check(dir), 'reviews');
  assert.equal(f.level, 'info');
  assert.match(f.message, /^the weekly review last ran 8 days ago \(\d{4}-\d{2}-\d{2}\): due/);
  assert.doesNotMatch(f.message, /monthly/);
  write(dir, 'hyper-second-brain/state.json', '{ not json');
  f = find(check(dir), 'reviews');
  assert.equal(f.level, 'warn');
  assert.equal(read(dir, 'hyper-second-brain/state.json'), '{ not json', 'the check only reads');
});
