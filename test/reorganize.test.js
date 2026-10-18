// hsb-re-organize's script: what it finds in a vault, what it refuses in a plan, what an applied plan changes
// (and what it never touches), and how a batch is verified and taken back. Every note and file is invented.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { tmp, write, snapshot } from './fixtures.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCAFFOLD = path.join(ROOT, 'skills', 'hsb-init', 'scripts', 'scaffold.mjs');
const REORG = path.join(ROOT, 'skills', 'hsb-re-organize', 'scripts', 'reorganize.mjs');

const git = (dir, ...a) => spawnSync('git', ['-C', dir, '-c', 'user.email=a@example.com', '-c', 'user.name=Tester', ...a], { encoding: 'utf8' });

/** Runs a script of the package; `json` is the parsed output when the call had --json. */
function run(script, dir, cmd, args = [], extra = {}) {
  const argv = cmd ? [script, cmd, '--root', dir, ...args] : [script, '--root', dir, ...args];
  const r = spawnSync(process.execPath, argv, { encoding: 'utf8', ...extra });
  let json = null;
  try {
    json = JSON.parse(r.stdout);
  } catch {
    // text output
  }
  return { code: r.status, json, out: r.stdout + r.stderr };
}

const PDF = Buffer.from([37, 80, 68, 70, 45, 1, 2, 3]);
const PNG = Buffer.from([137, 80, 78, 71, 1, 2, 3]);

/** A vault with the five PARA folders, loose material, a topic folder, an empty folder, and links of every kind. */
function messy({ git: useGit = true, commit = true } = {}) {
  const dir = tmp('hsb-re-');
  const v = (rel, data) => write(dir, `vault/${rel}`, data);
  v('0 Inbox/Untitled.md', 'Dentist visit on Friday. See [[Kerning basics]].\n');
  v('0 Inbox/scan0001.pdf', PDF);
  v('1 Projects/Brochure/Plan.md', 'Plan. [[Kerning basics]] [guide](../../Typography/Guide.md) [logo](../../Typography/logo.png)\n');
  v('1 Projects/Project List.md', '1. Brochure by end of June (Goal: print it; Area: none)\n2. Website by July (Goal: launch it; Area: none)\n');
  v('2 Areas/Health/Untitled copy.md', 'Dentist visit on Friday. See [[Kerning basics]].\n');
  v('3 Resources/misc/Doc One.pdf', PDF);
  v('3 Resources/misc/Snippets.md', 'Example:\n```\n[x](../../Typography/Guide.md) and [[Untitled]]\n```\n');
  v('3 Resources/Kitob xulosasi.md', 'Unicode name: Ўзбек.\n');
  v('4 Archives/.keep-me/none.txt', 'hidden folder inside Archives is left out\n');
  v('Typography/Guide.md', '# Guide\nSee [[Kerning basics]] and [[Untitled]]. ![[logo.png]] [pdf](<../3 Resources/misc/Doc One.pdf>)\n');
  v('Typography/Kerning basics.md', '# Kerning basics\nSpacing.\n');
  v('Typography/logo.png', PNG);
  v('Loose.md', 'Loose note.\n');
  v('.obsidian/app.json', '{}\n');
  fs.mkdirSync(path.join(dir, 'vault', 'Old stuff', 'empty'), { recursive: true });
  const r = spawnSync(process.execPath, [SCAFFOLD, '--root', dir, '--json'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  if (useGit) {
    git(dir, 'init', '-q', '.');
    if (commit) {
      git(dir, 'add', '-A');
      git(dir, 'commit', '-q', '-m', 'start');
    }
  }
  const work = tmp('hsb-work-');
  fs.rmSync(work, { recursive: true });
  return { dir, work };
}

const re = (p, cmd, args = [], extra) => run(REORG, p.dir, cmd, ['--work', p.work, ...args], extra);
const scan = (p) => {
  const r = re(p, 'scan', ['--json']);
  assert.equal(r.code, 0, r.out);
  return r;
};
const vaultOf = (p) => path.join(p.dir, 'vault');
const read = (p, rel) => fs.readFileSync(path.join(vaultOf(p), rel), 'utf8');
const has = (p, rel) => fs.existsSync(path.join(vaultOf(p), rel));
const row = (op, kind, from, to, flag = 'ok', reason = 'because') => ({ op, kind, from, to, reason, flag });
const mv = (kind, from, to, flag, reason) => row('move', kind, from, to, flag, reason);
const mkdir = (to) => row('mkdir', 'folder', undefined, to);
const rmdir = (from) => row('rmdir', 'folder', from, undefined);
const plan = (p, rows) => {
  fs.mkdirSync(p.work, { recursive: true });
  fs.writeFileSync(path.join(p.work, 'plan.json'), JSON.stringify(rows));
};

/** The rows that tidy `messy()`: the topic folder becomes a resource folder, the vague note gets a name. */
const TIDY = [
  mkdir('3 Resources/typography'),
  mv('note', 'Typography/Kerning basics.md', '3 Resources/typography/Kerning basics.md'),
  mv('note', 'Typography/Guide.md', '3 Resources/typography/Guide.md'),
  mv('document', 'Typography/logo.png', '3 Resources/typography/logo.png'),
  rmdir('Typography'),
  mv('note', '0 Inbox/Untitled.md', '2 Areas/Health/Dentist visit.md', 'doubt'),
  rmdir('Old stuff/empty'),
  rmdir('Old stuff'),
  mv('document', '0 Inbox/scan0001.pdf', '3 Resources/misc/scan0001.pdf'),
  mv('note', 'Loose.md', '0 Inbox/Loose.md'),
];

const applyAll = (p, rows = TIDY, ...more) => {
  plan(p, rows);
  return re(p, 'apply', ['--rows', 'all', '--json', ...more]);
};

// ---- scan and cards ----------------------------------------------------------------------------------

test('scan reports the vault and its signs and writes nothing into the project', () => {
  const p = messy();
  const before = snapshot(p.dir);
  const r = scan(p);
  assert.deepEqual(snapshot(p.dir), before);
  assert.ok(!p.work.startsWith(p.dir), 'the work folder is outside the project');
  assert.equal(r.json.counts.notes, 9);
  assert.equal(r.json.counts.documents, 3);
  assert.equal(r.json.wayBack.state, 'clean');
  const ids = r.json.signs.map((s) => s.id);
  for (const id of ['outside-para', 'root-file', 'duplicate', 'vague-name', 'project-list', 'empty-folder']) assert.ok(ids.includes(id), id);
  const sign = (id) => r.json.signs.find((s) => s.id === id).items.join('\n');
  assert.match(sign('outside-para'), /Typography \(3 files/);
  assert.match(sign('duplicate'), /0 Inbox\/Untitled\.md = 2 Areas\/Health\/Untitled copy\.md/);
  assert.match(sign('project-list'), /entry without a folder: Website/);
  assert.match(sign('empty-folder'), /Old stuff/);
  assert.ok(!r.json.signs.some((s) => s.items.some((i) => /\.obsidian|keep-me/.test(i))), 'hidden folders are left out');
  assert.equal(r.json.signs.find((s) => s.id === 'unresolved-link'), undefined, 'links in code blocks are not links');
});

test('scan names the first-level folders whose names break the letter-case rule, with the name the rule gives', () => {
  const p = messy();
  for (const rel of ['1 Projects/WEBSITE/Drafts/a.md', '2 Areas/health stuff/a.md', '2 Areas/FINANCE/a.md', '2 Areas/Team leadership/a.md',
    '3 Resources/Typography/a.md', '3 Resources/event venues/a.md', '3 Resources/日本語/a.md', '4 Archives/Old Project/a.md']) write(p.dir, `vault/${rel}`, 'x\n');
  const sign = scan(p).json.signs.find((s) => s.id === 'name-case');
  assert.deepEqual(sign.items.sort(), ['1 Projects/Brochure -> BROCHURE', '2 Areas/FINANCE -> Finance', '2 Areas/health stuff -> Health stuff',
    '3 Resources/Typography -> typography']);
});

test('a vault whose folder names follow the letter-case rule gives no name-case sign', () => {
  const p = messy();
  fs.renameSync(path.join(vaultOf(p), '1 Projects', 'Brochure'), path.join(vaultOf(p), '1 Projects', 'BROCHURE'));
  assert.equal(scan(p).json.signs.find((s) => s.id === 'name-case'), undefined);
});

test('after the user keeps the folder names, scan gives no name-case sign', () => {
  const p = messy();
  const pm = path.join(p.dir, 'hyper-second-brain', 'project.md');
  fs.writeFileSync(pm, fs.readFileSync(pm, 'utf8').replace('- None yet.', '- Folder names: keep as they are'));
  assert.equal(scan(p).json.signs.find((s) => s.id === 'name-case'), undefined);
});

test('scan names files that share a name and differ in content, and not plain duplicates', () => {
  const p = messy();
  write(p.dir, 'vault/Papers/Invoice 2026-09.pdf', Buffer.from('one'));
  write(p.dir, 'vault/1 Projects/Brochure/Invoice 2026-09.pdf', Buffer.from('two!'));
  write(p.dir, 'vault/Papers/Same.pdf', Buffer.from('twin'));
  write(p.dir, 'vault/1 Projects/Brochure/Same.pdf', Buffer.from('twin'));
  const sign = scan(p).json.signs.find((s) => s.id === 'same-name');
  assert.deepEqual(sign.items.map((i) => i.split(' / ').sort().join(' / ')), ['1 Projects/Brochure/Invoice 2026-09.pdf / Papers/Invoice 2026-09.pdf']);
});

test('cards come in batches with the opening text of notes and no text of documents', () => {
  const p = messy();
  const total = scan(p).json.cards;
  const a = re(p, 'cards', ['--from', '1', '--count', '5', '--json']);
  assert.equal(a.json.cards.length, 5);
  assert.equal(a.json.total, total);
  assert.equal(a.json.next, 6);
  const all = re(p, 'cards', ['--count', '100', '--json']).json.cards;
  assert.equal(all.length, total);
  assert.equal(all.at(-1).id, total);
  const note = all.find((c) => c.path === 'Typography/Guide.md');
  assert.equal(note.title, 'Guide');
  assert.match(note.head, /^# Guide See \[\[Kerning basics\]\]/);
  assert.equal(note.in, 1, 'only the Plan note links to the guide (the link in the code block is no link)');
  assert.equal(all.find((c) => c.path === '0 Inbox/scan0001.pdf').head, undefined);
  assert.equal(all.find((c) => c.path === '0 Inbox/Untitled.md').dup, all.find((c) => c.path === '2 Areas/Health/Untitled copy.md').dup);
  const text = re(p, 'cards', ['--count', '3']);
  assert.match(text.out, /^1 D 0 Inbox\/ \|/);
  assert.match(text.out, /cards 1-3 of \d+; next: --from 4/);
});

test('compact cards leave out the opening text, and --folder gives the full cards of one folder', () => {
  const p = messy();
  const total = scan(p).json.cards;
  const compact = re(p, 'cards', ['--compact', '--json']).json;
  assert.equal(compact.cards.length, total, 'a compact batch holds up to 200 cards');
  const note = compact.cards.find((c) => c.path === 'Typography/Guide.md');
  assert.equal(note.title, 'Guide');
  assert.equal(note.head, undefined);
  const text = re(p, 'cards', ['--compact']).out;
  assert.match(text, /F Typography\/Guide\.md \| md, \d+B, [^|]*\| heading: Guide\n/);
  assert.ok(!text.includes('See [[Kerning basics]]'));
  const folder = re(p, 'cards', ['--folder', 'Typography', '--json']).json;
  assert.deepEqual(folder.cards.map((c) => c.path), ['Typography', 'Typography/Guide.md', 'Typography/Kerning basics.md', 'Typography/logo.png']);
  assert.match(folder.cards[1].head, /^# Guide See/);
  assert.equal(re(p, 'cards', ['--folder', 'Nothing here']).code, 1);
});

test('exit codes: 3 not set up, 4 older project, 5 without the place skill, 2 usage', () => {
  const bare = tmp();
  assert.equal(run(REORG, bare, 'scan').code, 3);
  const p = messy();
  const manifest = path.join(p.dir, 'hyper-second-brain', '.manifest.json');
  const data = JSON.parse(fs.readFileSync(manifest, 'utf8'));
  fs.writeFileSync(manifest, JSON.stringify({ ...data, version: '0.0.1' }));
  assert.equal(re(p, 'scan').code, 4);
  fs.writeFileSync(manifest, JSON.stringify(data));
  // the skill copied alone, without hsb-place-an-item beside it
  const lone = tmp('hsb-lone-');
  fs.cpSync(path.join(ROOT, 'skills', 'hsb-re-organize'), path.join(lone, 'hsb-re-organize'), { recursive: true });
  const alone = run(path.join(lone, 'hsb-re-organize', 'scripts', 'reorganize.mjs'), p.dir, 'scan', ['--work', p.work]);
  assert.equal(alone.code, 5);
  assert.match(alone.out, /hsb-place-an-item/);
  assert.equal(spawnSync(process.execPath, [REORG], { encoding: 'utf8' }).status, 2);
  assert.equal(spawnSync(process.execPath, [REORG, 'dance', '--root', p.dir], { encoding: 'utf8' }).status, 2);
  assert.equal(re(p, 'cards', ['--from', '0']).code, 2);
  assert.equal(re(p, 'cards').code, 1, 'cards before scan');
});

// ---- the plan ----------------------------------------------------------------------------------------

test('the plan is printed as a numbered table with one line per row', () => {
  const p = messy();
  scan(p);
  plan(p, TIDY);
  const r = re(p, 'plan');
  assert.equal(r.code, 0, r.out);
  const lines = r.out.split('\n').filter((l) => /^\| \d+ \|/.test(l));
  assert.equal(lines.length, TIDY.length);
  assert.match(r.out, /^\| № \| What \| Kind \| From \| To \| Action \| Reason \| Flag \|$/m);
  lines.forEach((l, i) => assert.ok(l.startsWith(`| ${i + 1} |`), l));
  assert.match(lines[0], /\| create folder \|/);
  assert.match(lines[5], /\| move\+rename \| .* \| doubt \|$/);
  assert.match(lines[4], /\| remove empty folder \|/);
  assert.match(r.out, /10 rows; flags: 9 ok, 1 doubt, 0 ask; 6 files change place/);
  const second = re(p, 'plan', ['--from', '4', '--count', '3']);
  assert.equal(second.out.split('\n').filter((l) => /^\| \d+ \|/.test(l)).length, 3);
  assert.match(second.out, /rows 4-6 of 10; next: --from 7/);
  assert.equal(re(p, 'plan', ['--json']).json.status, 'valid');
});

test('a folder that moves whole is one row with its file count, and --expand lists the files', () => {
  const p = messy();
  scan(p);
  plan(p, [mv('folder', 'Typography', '3 Resources/Typography')]);
  const r = re(p, 'plan');
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /\| Typography \(3 files\) \| folder \| Typography \| 3 Resources\/Typography \| move \|/);
  const e = re(p, 'plan', ['--expand', '1', '--json']);
  assert.deepEqual(e.json.files, ['Guide.md', 'Kerning basics.md', 'logo.png']);
  assert.equal(re(p, 'plan', ['--expand', '2']).code, 1);
});

const REFUSED = [
  ['leaves the vault', [mv('note', 'Loose.md', '../Loose.md')], /"to" leaves the vault/],
  ['is hidden', [mv('note', 'Loose.md', '.obsidian/Loose.md')], /"to" is hidden/],
  ['source missing', [mv('note', 'Nope.md', '0 Inbox/Nope.md')], /Nope\.md is not a file at that point/],
  ['destination exists', [mv('note', 'Loose.md', '2 Areas/Health/Untitled copy.md')], /already exists at the destination/],
  ['case-only clash', [mv('note', 'Loose.md', '2 Areas/health/untitled COPY.md')], /does not exist|already exists/],
  ['document renamed', [mv('document', '0 Inbox/scan0001.pdf', '3 Resources/misc/Contract.pdf')], /a document keeps its name/],
  ['extension changed', [mv('note', 'Loose.md', '0 Inbox/Loose.txt')], /extension must stay/],
  ['kind note for a pdf', [mv('note', '0 Inbox/scan0001.pdf', '3 Resources/misc/scan0001.pdf')], /kind note is for Markdown/],
  ['no parent folder', [mv('note', 'Loose.md', '3 Resources/new/Loose.md')], /3 Resources\/new does not exist at that point/],
  ['outside PARA', [mv('note', '0 Inbox/Untitled.md', 'Typography/Untitled.md')], /inside one of the five PARA folders/],
  ['PARA folder moved', [mv('folder', '3 Resources', '4 Archives/res')], /one of the five PARA folders/],
  ['top-level mkdir', [mkdir('Notes')], /inside one of the five PARA folders/],
  ['emoji', [mv('note', 'Loose.md', '0 Inbox/\u{1F3AF} Loose.md')], /emoji/],
  ['reserved character', [mv('note', 'Loose.md', '0 Inbox/Loose: one.md')], /reserve/],
  ['folder into itself', [mkdir('3 Resources/a'), mv('folder', '3 Resources/a', '3 Resources/a/b')], /cannot move into itself/],
  ['rmdir not empty', [rmdir('Typography')], /not empty/],
  ['rmdir a PARA folder', [rmdir('4 Archives')], /not removed/],
  ['rmdir with hidden files', [rmdir('4 Archives/.keep-me')], /is hidden|is not a folder/],
  ['no reason', [{ op: 'move', kind: 'note', from: 'Loose.md', to: '0 Inbox/Loose.md', flag: 'ok' }], /has no reason/],
  ['bad op', [{ op: 'delete', kind: 'note', from: 'Loose.md', reason: 'x', flag: 'ok' }], /op must be one of/],
  ['note rename clash', [mv('note', 'Loose.md', '0 Inbox/Guide.md')], /another note already has the name "Guide"/],
  ['merge into a PARA folder', [row('merge', 'folder', 'Typography', '3 Resources')], /loose in a PARA folder/],
  ['merge collision', [mkdir('3 Resources/misc2'), row('merge', 'folder', '3 Resources/misc', '3 Resources/misc2'), row('merge', 'folder', '3 Resources/misc2', '3 Resources/misc')], /already in|does not exist/],
];
for (const [name, rows, pattern] of REFUSED) {
  test(`the plan is refused: ${name}`, () => {
    const p = messy();
    scan(p);
    plan(p, rows);
    const r = re(p, 'plan');
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, pattern);
  });
}

test('a plan refuses a rename that would shadow a name only with letter case, and a destination folder made by a later row', () => {
  const p = messy();
  scan(p);
  plan(p, [mv('note', 'Loose.md', '3 Resources/typography/Loose.md'), mkdir('3 Resources/typography')]);
  const r = re(p, 'plan');
  assert.equal(r.code, 1);
  assert.match(r.out, /row 1: .*3 Resources\/typography does not exist at that point \(add a mkdir row before it\)/);
});

// ---- apply ---------------------------------------------------------------------------------------------

test('apply moves what the rows say, repairs the links, and changes nothing else', () => {
  const p = messy();
  scan(p);
  const before = snapshot(p.dir);
  const r = applyAll(p);
  assert.equal(r.code, 0, r.out);
  assert.equal(r.json.status, 'applied');
  assert.equal(r.json.check.ok, true);
  // where everything went
  for (const gone of ['Typography', 'Old stuff', '0 Inbox/Untitled.md', '0 Inbox/scan0001.pdf', 'Loose.md']) assert.ok(!has(p, gone), gone);
  for (const rel of ['3 Resources/typography/Guide.md', '3 Resources/typography/Kerning basics.md', '3 Resources/typography/logo.png',
    '2 Areas/Health/Dentist visit.md', '3 Resources/misc/scan0001.pdf', '0 Inbox/Loose.md']) assert.ok(has(p, rel), rel);
  // the links
  assert.equal(read(p, '1 Projects/Brochure/Plan.md'),
    'Plan. [[Kerning basics]] [guide](<../../3 Resources/typography/Guide.md>) [logo](<../../3 Resources/typography/logo.png>)\n');
  assert.equal(read(p, '3 Resources/typography/Guide.md'),
    '# Guide\nSee [[Kerning basics]] and [[Dentist visit]]. ![[logo.png]] [pdf](<../misc/Doc One.pdf>)\n');
  assert.equal(r.json.linksRepaired, 4);
  assert.equal(r.json.notesEdited, 2);
  // what was not touched: documents byte for byte, notes without a stale link, code blocks, hidden folders
  const after = snapshot(p.dir);
  assert.equal(after['vault/3 Resources/typography/logo.png'], before['vault/Typography/logo.png']);
  assert.equal(after['vault/3 Resources/misc/scan0001.pdf'], before['vault/0 Inbox/scan0001.pdf']);
  assert.equal(after['vault/3 Resources/misc/Doc One.pdf'], before['vault/3 Resources/misc/Doc One.pdf']);
  assert.equal(after['vault/3 Resources/misc/Snippets.md'], before['vault/3 Resources/misc/Snippets.md']);
  assert.equal(after['vault/.obsidian/app.json'], before['vault/.obsidian/app.json']);
  assert.equal(after['vault/4 Archives/.keep-me/none.txt'], before['vault/4 Archives/.keep-me/none.txt']);
  assert.equal(after['vault/2 Areas/Health/Dentist visit.md'], before['vault/0 Inbox/Untitled.md']);
  assert.equal(Object.keys(after).length, Object.keys(before).length, 'no file added, none lost');
  assert.deepEqual(r.json.check.missing, []);
  assert.deepEqual(r.json.check.stale, []);
});

test('a link by path, a link of a note that moves, and a link of two notes that both move are recalculated', () => {
  const p = messy();
  write(p.dir, 'vault/2 Areas/Health/Path.md', 'By path [[Typography/Guide]] and encoded [g](../../Typography/Guide.md#top) and [k](../../Typography/Kerning%20basics.md).\n');
  git(p.dir, 'add', '-A');
  git(p.dir, 'commit', '-q', '-m', 'more');
  scan(p);
  const r = applyAll(p, [
    mkdir('3 Resources/typography'),
    mv('folder', 'Typography', '3 Resources/typography/old'),
    mv('note', '2 Areas/Health/Path.md', '3 Resources/typography/Path.md'),
  ]);
  assert.equal(r.code, 0, r.out);
  // [[Typography/Guide]] still needs its folder name only when the file name alone is not enough: it is enough here
  assert.equal(read(p, '3 Resources/typography/Path.md'),
    'By path [[Guide]] and encoded [g](old/Guide.md#top) and [k](old/Kerning%20basics.md).\n');
  assert.equal(r.json.check.ok, true);
});

/** A project whose Obsidian vault is the project folder, so that full-path links start with `vault/`. */
function obsidianAbove(notes, { ignorecase = true } = {}) {
  const dir = tmp('hsb-re-');
  write(dir, '.obsidian/app.json', '{}\n');
  for (const f of ['0 Inbox', '1 Projects', '2 Areas', '3 Resources', '4 Archives']) fs.mkdirSync(path.join(dir, 'vault', f), { recursive: true });
  for (const [rel, text] of Object.entries(notes)) write(dir, `vault/${rel}`, text);
  const r = spawnSync(process.execPath, [SCAFFOLD, '--root', dir, '--json'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  git(dir, 'init', '-q', '.');
  git(dir, 'config', 'core.ignorecase', String(ignorecase));
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', 'start');
  const work = tmp('hsb-work-');
  fs.rmSync(work, { recursive: true });
  return { dir, work };
}

test('a link by its full path from an Obsidian vault above the vault resolves and is repaired in the same form', () => {
  const p = obsidianAbove({
    '3 Resources/GARDEN/Seeds.md': '# Seeds\n',
    '2 Areas/Home.md': '---\nup: "[[vault/3 Resources/GARDEN/Seeds]]"\n---\nSee [[vault/3 Resources/GARDEN/Seeds|seeds]] and [s](</vault/3 Resources/GARDEN/Seeds.md>).\n',
  });
  const s = scan(p);
  assert.ok(!s.json.signs.some((g) => g.id === 'unresolved-link'), JSON.stringify(s.json.signs));
  const r = applyAll(p, [mv('folder', '3 Resources/GARDEN', '3 Resources/gardening')]);
  assert.equal(r.code, 0, r.out);
  assert.equal(r.json.linksRepaired, 3);
  assert.equal(read(p, '2 Areas/Home.md'),
    '---\nup: "[[vault/3 Resources/gardening/Seeds]]"\n---\nSee [[vault/3 Resources/gardening/Seeds|seeds]] and [s](</vault/3 Resources/gardening/Seeds.md>).\n');
  assert.deepEqual(r.json.check.stale, []);
});

test('a rename that changes only the letter case rewrites the links that spell the old name and gives the git commands', () => {
  const p = obsidianAbove({
    '3 Resources/GARDEN/Seeds.md': '# Seeds\n',
    '2 Areas/Home.md': 'See [[3 Resources/GARDEN/Seeds]], [[vault/3 Resources/GARDEN/Seeds]] and [[Seeds]].\n',
  });
  scan(p);
  const r = applyAll(p, [mv('folder', '3 Resources/GARDEN', '3 Resources/garden')]);
  assert.equal(r.code, 0, r.out);
  assert.equal(read(p, '2 Areas/Home.md'), 'See [[Seeds]], [[vault/3 Resources/garden/Seeds]] and [[Seeds]].\n');
  assert.deepEqual(r.json.gitCase, [{ row: 1, from: '3 Resources/GARDEN', to: '3 Resources/garden',
    commands: ["git rm -r --cached -q -- 'vault/3 Resources/GARDEN'", "git add -- 'vault/3 Resources/garden'"] }]);
  assert.match(r.out, /git rm -r --cached/);
  // the commands record the rename in git
  for (const c of r.json.gitCase[0].commands) assert.equal(spawnSync('sh', ['-c', c], { cwd: p.dir }).status, 0, c);
  assert.match(git(p.dir, 'status', '--porcelain').stdout, /garden\/Seeds\.md/);
  // a repository that tells the letter case apart needs no commands
  const q = obsidianAbove({ '3 Resources/GARDEN/Seeds.md': '# Seeds\n' }, { ignorecase: false });
  scan(q);
  const r2 = applyAll(q, [mv('folder', '3 Resources/GARDEN', '3 Resources/garden')]);
  assert.equal(r2.code, 0, r2.out);
  assert.deepEqual(r2.json.gitCase, []);
});

test('a link that still finds its moved note in other letter case and never spelled the old path stays byte for byte', () => {
  const p = obsidianAbove({
    '3 Resources/GARDEN/Seeds.md': '# Seeds\n',
    '3 Resources/GARDEN/Soil.md': '# Soil\n',
    '2 Areas/Home.md': 'See [[seeds]], [[SOIL]] and [[garden/seeds]].\n',
  });
  scan(p);
  const r = applyAll(p, [mv('folder', '3 Resources/GARDEN', '3 Resources/garden'), mv('note', '3 Resources/garden/Soil.md', '3 Resources/Soil.md')]);
  assert.equal(r.code, 0, r.out);
  assert.equal(read(p, '2 Areas/Home.md'), 'See [[seeds]], [[SOIL]] and [[garden/seeds]].\n');
  assert.equal(r.json.linksRepaired, 0);
});

test('names in another script and in decomposed Unicode resolve, and the next batch still sees its way back', () => {
  const nfd = 'Йўл харитаси'.normalize('NFD');
  const p = obsidianAbove({
    [`3 Resources/саёҳат/${nfd}.md`]: '# Йўл\n',
    '2 Areas/Эслатма.md': 'See [[Йўл харитаси]].\n',
  });
  const s = scan(p);
  assert.ok(!s.json.signs.some((g) => g.id === 'unresolved-link'), JSON.stringify(s.json.signs));
  const r = applyAll(p, [mv('folder', '3 Resources/саёҳат', '3 Resources/сафарлар')]);
  assert.equal(r.code, 0, r.out);
  assert.equal(scan(p).json.wayBack.state, 'journal');
});

test('a folder whose path a setting, a template, or an instruction file names is shown in the scan and in the plan', () => {
  const p = obsidianAbove({ '3 Resources/NEWS/Item.md': '# Item\n', '3 Resources/NEWSLETTERS/a.md': '# a\n', 'Templates/Post.md': 'Saved under vault/3 Resources/NEWS by the tool.\n' });
  write(p.dir, '.obsidian/plugins/poster/data.json', '{"target": "vault/3 Resources/NEWS"}\n');
  write(p.dir, '.obsidian/templates.json', '{"folder": "vault/Templates"}\n');
  fs.appendFileSync(path.join(p.dir, 'AGENTS.md'), '\nPosts go to `vault/3 Resources/NEWS/`.\n');
  git(p.dir, 'add', '-A');
  git(p.dir, 'commit', '-q', '-m', 'tools');
  const named = scan(p).json.signs.find((g) => g.id === 'name-case').items;
  assert.ok(named.includes('3 Resources/NEWS -> news (its path is written in: .obsidian/plugins/poster/data.json, AGENTS.md, vault/Templates/Post.md)'), named.join('\n'));
  assert.ok(named.includes('3 Resources/NEWSLETTERS -> newsletters'), named.join('\n'));
  plan(p, [mv('folder', '3 Resources/NEWS', '3 Resources/news'), mv('folder', '3 Resources/NEWSLETTERS', '3 Resources/newsletters')]);
  const r = re(p, 'plan', ['--json']);
  assert.equal(r.code, 0, r.out);
  assert.deepEqual(r.json.pathMentions, [{ row: 1, from: '3 Resources/NEWS', files: ['.obsidian/plugins/poster/data.json', 'AGENTS.md', 'vault/Templates/Post.md'] }]);
  assert.match(re(p, 'plan').out, /row 1 moves a folder whose path is written in/);
});

test('the signs leave out what repeats by design: a year in a title, empty notes, copies of a template, names in many folders', () => {
  const p = obsidianAbove({
    '3 Resources/films/A Long Voyage (1999).md': '# A Long Voyage\n',
    '3 Resources/films/Draft (2).md': '# Draft\n',
    'Templates/Daily.md': '# Day\n\n## Tasks\n',
    '0 Inbox/Day one.md': '# Day\n\n## Tasks\n',
    '0 Inbox/Day two.md': '# Day\n\n## Tasks\n',
    '0 Inbox/Stub a.md': '---\ntags: []\n---\n\n',
    '0 Inbox/Stub b.md': '---\ntags: []\n---\n\n',
    '2 Areas/Health/Same.md': 'Same text.\n',
    '2 Areas/Home/Same copy.md': 'Same text.\n',
    '3 Resources/course/m1/LESSON.md': 'one\n',
    '3 Resources/course/m2/LESSON.md': 'two\n',
    '3 Resources/course/m3/LESSON.md': 'three\n',
    '3 Resources/course/m1/view.md': 'query a\n',
    '3 Resources/course/m2/view.md': 'query b\n',
    '2 Areas/Health/Plan.md': 'health plan\n',
    '2 Areas/Home/Plan.md': 'home plan\n',
  });
  write(p.dir, '.obsidian/templates.json', '{"folder": "vault/Templates"}\n');
  git(p.dir, 'add', '-A');
  git(p.dir, 'commit', '-q', '-m', 'more');
  const items = (r, id) => r.json.signs.find((g) => g.id === id)?.items || [];
  let r = scan(p);
  assert.deepEqual(items(r, 'vague-name').filter((x) => x.startsWith('3 Resources/films')), ['3 Resources/films/Draft (2).md']);
  assert.deepEqual(items(r, 'duplicate'), ['2 Areas/Health/Same.md = 2 Areas/Home/Same copy.md']);
  assert.deepEqual(items(r, 'same-name'), ['2 Areas/Health/Plan.md / 2 Areas/Home/Plan.md', '3 Resources/course/m1/view.md / 3 Resources/course/m2/view.md']);
  // the user's own list of names that repeat by design
  const project = path.join(p.dir, 'hyper-second-brain/project.md');
  fs.writeFileSync(project, fs.readFileSync(project, 'utf8').replace('- None yet.', '- Ignore names: `view.md`, `Same.md`'));
  r = scan(p);
  assert.deepEqual(items(r, 'same-name'), ['2 Areas/Health/Plan.md / 2 Areas/Home/Plan.md']);
  assert.deepEqual(items(r, 'duplicate'), ['2 Areas/Health/Same.md = 2 Areas/Home/Same copy.md'], 'a group stays while one of its names is not on the list');
});

test('a folder that "Lasting choices" marks as not a project gives no project-list sign', () => {
  const p = obsidianAbove({ '1 Projects/VACANCIES/.keep': '', '1 Projects/ALPHA/Plan.md': 'plan\n', '1 Projects/Project List.md': '1. ALPHA by May (Goal: done; Area: none)\n' });
  const items = () => scan(p).json.signs.find((g) => g.id === 'project-list')?.items || [];
  assert.deepEqual(items(), ['folder without an entry: VACANCIES']);
  const project = path.join(p.dir, 'hyper-second-brain/project.md');
  fs.writeFileSync(project, fs.readFileSync(project, 'utf8').replace('- None yet.', '- Not projects: `VACANCIES`'));
  assert.deepEqual(items(), []);
});

test('a name that is shared by two notes stays ambiguous and is left alone', () => {
  const p = messy();
  write(p.dir, 'vault/2 Areas/Health/Kerning basics.md', 'Another note with the same name.\n');
  git(p.dir, 'add', '-A');
  git(p.dir, 'commit', '-q', '-m', 'twin');
  scan(p);
  const before = read(p, '1 Projects/Brochure/Plan.md');
  assert.ok(scan(p).json.signs.some((s) => s.id === 'ambiguous-link'));
  const r = applyAll(p, [mkdir('3 Resources/typography'), mv('note', 'Typography/Kerning basics.md', '3 Resources/typography/Kerning basics.md')]);
  assert.equal(r.code, 0, r.out);
  assert.equal(read(p, '1 Projects/Brochure/Plan.md'), before);
});

test('a Markdown document is moved but never edited; its links are reported', () => {
  const p = messy();
  write(p.dir, 'vault/3 Resources/misc/Manual.md', 'A manual kept as received. See [guide](../../Typography/Guide.md).\n');
  git(p.dir, 'add', '-A');
  git(p.dir, 'commit', '-q', '-m', 'manual');
  scan(p);
  const before = snapshot(p.dir)['vault/3 Resources/misc/Manual.md'];
  const r = applyAll(p, [mkdir('3 Resources/typography'), mv('note', 'Typography/Guide.md', '3 Resources/typography/Guide.md'), mv('document', '3 Resources/misc/Manual.md', '3 Resources/typography/Manual.md')]);
  assert.equal(snapshot(p.dir)['vault/3 Resources/typography/Manual.md'], before);
  assert.ok(r.json.notRepaired.some((x) => /Manual\.md/.test(x)), r.out);
  assert.equal(r.code, 1, 'the verify finds the stale link inside the document');
  assert.ok(r.json.check.stale.some((x) => /Manual\.md/.test(x)));
});

test('apply refuses a chosen row that depends on a row that was not chosen, and then changes nothing', () => {
  const p = messy();
  scan(p);
  plan(p, TIDY);
  const before = snapshot(p.dir);
  const r = re(p, 'apply', ['--rows', '2-4', '--json']);
  assert.equal(r.code, 1);
  assert.equal(r.json.status, 'refused');
  assert.match(r.json.errors.join('\n'), /3 Resources\/typography does not exist at that point/);
  assert.deepEqual(snapshot(p.dir), before);
});

test('apply never runs a row flagged ask, and accepts a row once its flag is ok', () => {
  const p = messy();
  scan(p);
  plan(p, [mv('note', 'Loose.md', '0 Inbox/Loose.md', 'ask')]);
  const before = snapshot(p.dir);
  const r = re(p, 'apply', ['--rows', 'all', '--json']);
  assert.equal(r.code, 1);
  assert.match(r.json.errors[0], /flagged ask/);
  assert.deepEqual(snapshot(p.dir), before);
  plan(p, [mv('note', 'Loose.md', '0 Inbox/Loose.md', 'ok')]);
  assert.equal(re(p, 'apply', ['--rows', '1']).code, 0);
});

test('--rows takes ranges and lists; a row outside the plan is a usage error', () => {
  const p = messy();
  scan(p);
  plan(p, TIDY);
  assert.equal(re(p, 'apply', ['--rows', '99']).code, 2);
  assert.equal(re(p, 'apply', ['--rows', 'x']).code, 2);
  assert.equal(re(p, 'apply', ['--rows', '3-1']).code, 2);
  assert.equal(re(p, 'apply').code, 2);
  const r = re(p, 'apply', ['--rows', '1-5,9,10', '--json']);
  assert.equal(r.code, 0, r.out);
  assert.equal(r.json.rows, 7);
  assert.ok(has(p, '0 Inbox/Untitled.md'), 'row 6 was skipped');
  assert.ok(has(p, 'Old stuff/empty'), 'rows 7 and 8 were skipped');
});

test('apply needs a way back: a dirty or missing git is exit 6 until the user confirms a backup', () => {
  const dirty = messy();
  scan(dirty);
  fs.appendFileSync(path.join(dirty.dir, 'vault', 'Loose.md'), 'edit\n');
  plan(dirty, [mv('note', 'Loose.md', '0 Inbox/Loose.md')]);
  const refused = re(dirty, 'apply', ['--rows', 'all']);
  assert.equal(refused.code, 6);
  assert.ok(has(dirty, 'Loose.md'));
  assert.equal(re(dirty, 'apply', ['--rows', 'all', '--backup-confirmed']).code, 0);

  const noGit = messy({ git: false });
  scan(noGit);
  plan(noGit, [mv('note', 'Loose.md', '0 Inbox/Loose.md')]);
  assert.equal(re(noGit, 'apply', ['--rows', 'all']).code, 6);
  assert.equal(re(noGit, 'scan', ['--json']).json.wayBack.state, 'no-git');

  const ignored = messy();
  fs.writeFileSync(path.join(ignored.dir, '.gitignore'), 'vault/\n');
  git(ignored.dir, 'rm', '-r', '-q', '--cached', 'vault');
  git(ignored.dir, 'add', '-A');
  git(ignored.dir, 'commit', '-q', '-m', 'ignore');
  assert.equal(scan(ignored).json.wayBack.state, 'ignored');
});

// ---- verify, undo, finish -----------------------------------------------------------------------------

test('undo takes the last batch back byte for byte, and only the last one', () => {
  const p = messy();
  scan(p);
  const start = snapshot(p.dir);
  plan(p, TIDY);
  assert.equal(re(p, 'apply', ['--rows', '1-5']).code, 0);
  assert.equal(scan(p).json.wayBack.state, 'journal', 'the uncommitted changes are those of the batch');
  const middle = snapshot(p.dir);
  assert.equal(re(p, 'apply', ['--rows', '6-10']).code, 0);
  const u = re(p, 'undo', ['--json']);
  assert.equal(u.code, 0, u.out);
  assert.deepEqual(snapshot(p.dir), middle);
  assert.ok(has(p, '0 Inbox/Untitled.md') && has(p, 'Old stuff/empty'), 'the folders removed by the second batch are back');
  assert.equal(re(p, 'undo', ['--json']).code, 0);
  assert.deepEqual(snapshot(p.dir), start);
  assert.ok(fs.statSync(path.join(p.dir, 'vault', 'Typography')).isDirectory());
  assert.equal(re(p, 'undo').code, 1, 'nothing left to take back');
});

test('undo does not overwrite a note that was edited after the batch', () => {
  const p = messy();
  scan(p);
  assert.equal(applyAll(p).code, 0);
  fs.appendFileSync(path.join(p.dir, 'vault', '3 Resources', 'typography', 'Guide.md'), 'my edit\n');
  const u = re(p, 'undo', ['--json']);
  assert.equal(u.code, 1);
  assert.ok(u.json.notes.some((n) => /not restored.*Guide\.md/.test(n)), u.out);
  assert.match(read(p, 'Typography/Guide.md'), /my edit/);
});

test('verify finds a lost file, a changed document and a document renamed by hand', () => {
  const p = messy();
  scan(p);
  assert.equal(applyAll(p).code, 0);
  assert.equal(re(p, 'verify').code, 0);
  fs.appendFileSync(path.join(p.dir, 'vault', '3 Resources', 'misc', 'scan0001.pdf'), 'x');
  fs.renameSync(path.join(p.dir, 'vault', '3 Resources', 'misc', 'Doc One.pdf'), path.join(p.dir, 'vault', '3 Resources', 'misc', 'Doc.pdf'));
  fs.rmSync(path.join(p.dir, 'vault', '0 Inbox', 'Loose.md'));
  const r = re(p, 'verify', ['--json']);
  assert.equal(r.code, 1);
  assert.deepEqual(r.json.missing.sort(), ['3 Resources/misc/Doc One.pdf', 'Loose.md']);
  assert.deepEqual(r.json.extra, ['3 Resources/misc/Doc.pdf']);
  assert.ok(r.json.changed.includes('3 Resources/misc/scan0001.pdf'));
  assert.ok(r.json.stale.some((s) => /Doc One\.pdf/.test(s)));
});

test('merge moves the contents of a folder into another and removes the empty one', () => {
  const p = messy();
  write(p.dir, 'vault/3 Resources/ty/One.md', 'one\n');
  write(p.dir, 'vault/3 Resources/typo/Two.md', 'two\n');
  git(p.dir, 'add', '-A');
  git(p.dir, 'commit', '-q', '-m', 'two folders');
  scan(p);
  const r = applyAll(p, [row('merge', 'folder', '3 Resources/ty', '3 Resources/typo')]);
  assert.equal(r.code, 0, r.out);
  assert.ok(has(p, '3 Resources/typo/One.md') && has(p, '3 Resources/typo/Two.md'));
  assert.ok(!has(p, '3 Resources/ty'));
  plan(p, [mkdir('3 Resources/clash'), row('merge', 'folder', '3 Resources/typo', '3 Resources/clash')]);
  assert.equal(re(p, 'plan').code, 0);
  write(p.dir, 'vault/3 Resources/clash/One.md', 'other\n');
  plan(p, [row('merge', 'folder', '3 Resources/typo', '3 Resources/clash')]);
  const clash = re(p, 'plan');
  assert.equal(clash.code, 1);
  assert.match(clash.out, /already in 3 Resources\/clash: One\.md/);
});

test('finish removes the work folder, and only a work folder', () => {
  const p = messy();
  scan(p);
  assert.ok(fs.existsSync(p.work));
  assert.equal(re(p, 'finish').code, 0);
  assert.ok(!fs.existsSync(p.work));
  assert.equal(re(p, 'finish').code, 0, 'a second finish is a no-op');
  const other = tmp('hsb-not-work-');
  write(other, 'keep.txt', 'mine\n');
  const r = run(REORG, p.dir, 'finish', ['--work', other]);
  assert.equal(r.code, 0);
  assert.ok(fs.existsSync(path.join(other, 'keep.txt')), 'a folder without the marker is not deleted');
});

test('scan, cards and plan leave the vault exactly as it was', () => {
  const p = messy();
  const before = snapshot(p.dir);
  scan(p);
  re(p, 'cards', ['--count', '100']);
  plan(p, TIDY);
  re(p, 'plan');
  re(p, 'plan', ['--expand', '1']);
  re(p, 'apply', ['--rows', '99']);
  assert.deepEqual(snapshot(p.dir), before);
  assert.deepEqual(fs.readdirSync(p.dir).sort().filter((n) => n.startsWith('hsb-')), []);
});

test('--allow-emoji lets a row name a folder with an emoji when the user asked for it', () => {
  const p = messy();
  scan(p);
  plan(p, [mkdir('1 Projects/\u{1F3AF} Website')]);
  assert.equal(re(p, 'plan').code, 1);
  assert.equal(re(p, 'plan', ['--allow-emoji']).code, 0);
  assert.equal(re(p, 'apply', ['--rows', 'all', '--allow-emoji']).code, 0);
  assert.ok(has(p, '1 Projects/\u{1F3AF} Website'));
});

test('the default work folder is outside the project and the vault', () => {
  const p = messy();
  const r = run(REORG, p.dir, 'scan', ['--json']);
  assert.equal(r.code, 0, r.out);
  assert.ok(r.json.work.startsWith(fs.realpathSync(os.tmpdir())) || r.json.work.startsWith(os.tmpdir()));
  assert.ok(!r.json.work.startsWith(p.dir));
  assert.equal(run(REORG, p.dir, 'finish').code, 0);
});

// ---- the about file of a folder ---------------------------------------------------------------------------

const aboutText = (title, extra = '') => `# ${title}\n\n## Purpose\nA folder for the test.${extra}\n\n## Belongs here\nNotes.\n\n## Not here\nNone.\n\n## Conventions\nNone.\n\n## Entry points\nNone.\n\n## Agent rules\nNone.\n`;
const wr = (to, text, flag = 'ok', reason = 'describes the folder') => ({ op: 'write', kind: 'about', to, text, reason, flag });
const rmf = (from, flag = 'ok', reason = 'the folder is gone') => ({ op: 'rmfile', kind: 'about', from, reason, flag });
const commitAll = (p, msg = 'more') => {
  git(p.dir, 'add', '-A');
  git(p.dir, 'commit', '-q', '-m', msg);
};
/** messy() with an _about.md in 3 Resources/misc, scanned. */
function withAbout() {
  const p = messy();
  write(p.dir, 'vault/3 Resources/misc/_about.md', aboutText('misc', ' Old line.'));
  commitAll(p);
  scan(p);
  return p;
}

test('scan sees an _about.md as the description of its folder, not as a note, a duplicate or content', () => {
  const p = messy();
  write(p.dir, 'vault/3 Resources/misc/_about.md', aboutText('misc'));
  write(p.dir, 'vault/Old stuff/empty/_about.md', aboutText('empty'));
  write(p.dir, 'vault/4 Archives/Old/_about.md', aboutText('Old'));
  const r = scan(p);
  assert.equal(r.json.counts.aboutFiles, 3);
  assert.equal(r.json.counts.notes, 9, 'the three _about.md files are not notes');
  const cards = re(p, 'cards', ['--count', '100', '--json']).json.cards;
  const card = cards.find((c) => c.path === '3 Resources/misc/_about.md');
  assert.equal(card.about, true);
  assert.match(card.head, /A folder for the test\./);
  assert.equal(card.dup, undefined, 'identical descriptions are no duplicates');
  assert.equal(cards.find((c) => c.path === '3 Resources/misc').about, true);
  assert.equal(cards.find((c) => c.path === 'Typography').about, false);
  assert.match(re(p, 'cards', ['--count', '100']).out, /3 Resources\/misc\/ \|[^\n]*_about\.md: yes/);
  assert.ok(r.json.signs.find((s) => s.id === 'empty-folder').items.includes('4 Archives/Old'), 'a folder with only its _about.md is empty');
  assert.ok(!r.json.signs.some((s) => s.id === 'duplicate' && s.items.some((i) => /_about/.test(i))));
});

test('write creates and updates an _about.md, the table says which, and plan --expand shows the change', () => {
  const p = withAbout();
  plan(p, [wr('3 Resources/misc/_about.md', aboutText('misc', ' New line.')), wr('Typography/_about.md', aboutText('Typography'))]);
  const r = re(p, 'plan');
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /\| misc\/_about\.md \| about \| 3 Resources\/misc\/_about\.md \| 3 Resources\/misc\/_about\.md \| update about file \|/);
  assert.match(r.out, /\| Typography\/_about\.md \| about \| - \| Typography\/_about\.md \| create about file \|/);
  const e = re(p, 'plan', ['--expand', '1']);
  assert.match(e.out, /--- current \(\d+ lines\)[\s\S]*Old line\.[\s\S]*--- proposed \(\d+ lines\)[\s\S]*New line\./);
  assert.match(re(p, 'plan', ['--expand', '2']).out, /create Typography\/_about\.md[\s\S]*--- proposed/);
  const a = re(p, 'apply', ['--rows', 'all', '--json']);
  assert.equal(a.code, 0, a.out);
  assert.deepEqual(a.json.aboutFiles, { created: 1, updated: 1, removed: 0 });
  assert.equal(a.json.filesMoved, 0, 'describing folders that nothing else touches moves nothing');
  assert.match(read(p, '3 Resources/misc/_about.md'), /New line\./);
  assert.ok(!/Old line/.test(read(p, '3 Resources/misc/_about.md')));
  assert.equal(read(p, 'Typography/_about.md'), aboutText('Typography'));
  assert.equal(a.json.check.ok, true);
});

const ABOUT_REFUSED = [
  ['another file name', () => [wr('Typography/Notes.md', aboutText('T'))], /write is only for a file named _about\.md/],
  ['too few sections', () => [wr('Typography/_about.md', '# T\n\n## Purpose\nx\n\n## Belongs here\ny\n')], /has 2 "## " sections; it needs 6/],
  ['too long', () => [wr('Typography/_about.md', aboutText('T', `\n${'line\n'.repeat(45)}`))], /the limit is 40/],
  ['no title', () => [wr('Typography/_about.md', aboutText('T').replace('# T\n', ''))], /starts with the name of the folder/],
  ['no text', () => [{ op: 'write', kind: 'about', to: 'Typography/_about.md', reason: 'x', flag: 'ok' }], /has no "text"/],
  ['top of the vault', () => [wr('_about.md', aboutText('V'))], /top of the vault gets no about file/],
  ['no such folder', () => [wr('Nowhere/_about.md', aboutText('N'))], /folder Nowhere does not exist/],
  ['wrong kind', () => [{ ...wr('Typography/_about.md', aboutText('T')), kind: 'note' }], /write takes kind about/],
  ['kind about on a move', () => [{ op: 'move', kind: 'about', from: 'Loose.md', to: '0 Inbox/Loose.md', reason: 'x', flag: 'ok' }], /kind about is for write and rmfile rows/],
  ['rmfile of another file', () => [rmf('Loose.md')], /rmfile is only for a file named _about\.md/],
  ['rmfile of a missing file', () => [rmf('Typography/_about.md')], /is not a file at that point/],
  ['move of an _about.md', () => [{ op: 'move', kind: 'note', from: '3 Resources/misc/_about.md', to: '3 Resources/_about.md', reason: 'x', flag: 'ok' }], /changed with write and rmfile rows, not moved/],
];
for (const [name, rows, pattern] of ABOUT_REFUSED) {
  test(`an about row is refused: ${name}`, () => {
    const p = withAbout();
    plan(p, rows());
    const r = re(p, 'plan');
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, pattern);
  });
}

test('an _about.md that changed since the scan is not overwritten or removed', () => {
  const p = withAbout();
  fs.appendFileSync(path.join(p.dir, 'vault', '3 Resources', 'misc', '_about.md'), 'The user added this line.\n');
  for (const rows of [[wr('3 Resources/misc/_about.md', aboutText('misc'))], [rmf('3 Resources/misc/_about.md')]]) {
    plan(p, rows);
    const r = re(p, 'plan');
    assert.equal(r.code, 1);
    assert.match(r.out, /changed since the last scan; run scan again/);
  }
  const fresh = withAbout();
  fs.rmSync(path.join(fresh.work, 'cards.json'));
  plan(fresh, [wr('3 Resources/misc/_about.md', aboutText('misc'))]);
  assert.match(re(fresh, 'plan').out, /was not in the last scan/);
});

test('plan names the touched folders that have no row for their _about.md', () => {
  const p = withAbout();
  plan(p, [mkdir('3 Resources/typography'), mv('note', 'Typography/Kerning basics.md', '3 Resources/typography/Kerning basics.md'), wr('3 Resources/typography/_about.md', aboutText('typography'))]);
  const r = re(p, 'plan', ['--json']);
  assert.equal(r.code, 0);
  assert.deepEqual(r.json.aboutWithoutRow.map((a) => a.folder), ['3 Resources', 'Typography']);
  assert.ok(r.json.aboutWithoutRow.every((a) => a.hasFile === false));
  assert.match(re(p, 'plan').out, /NOTE: 2 folder\(s\) that the rows touch have no write row for their _about\.md \(check that each existing file still holds\): 3 Resources \(no file\), Typography \(no file\)/);
  const a = re(p, 'apply', ['--rows', 'all', '--json']);
  assert.equal(a.code, 0, a.out);
  assert.deepEqual(a.json.check.aboutMissing, ['3 Resources', 'Typography']);
});

test('a folder is removed in three steps: its _about.md goes first, then the empty folder', () => {
  const p = withAbout();
  write(p.dir, 'vault/3 Resources/gone/_about.md', aboutText('gone'));
  commitAll(p, 'gone');
  scan(p);
  plan(p, [rmdir('3 Resources/gone')]);
  assert.match(re(p, 'plan').out, /still holds its _about\.md: add an rmfile row for it before this row/);
  plan(p, [rmf('3 Resources/gone/_about.md'), rmdir('3 Resources/gone')]);
  const a = re(p, 'apply', ['--rows', 'all', '--json']);
  assert.equal(a.code, 0, a.out);
  assert.ok(!has(p, '3 Resources/gone'));
  assert.deepEqual(a.json.aboutFiles, { created: 0, updated: 0, removed: 1 });
});

test('merging two folders folds their _about.md files: write the target, remove the source, then merge', () => {
  const p = messy();
  write(p.dir, 'vault/3 Resources/ty/One.md', 'one\n');
  write(p.dir, 'vault/3 Resources/ty/_about.md', aboutText('ty', ' Keeps one.'));
  write(p.dir, 'vault/3 Resources/typo/Two.md', 'two\n');
  write(p.dir, 'vault/3 Resources/typo/_about.md', aboutText('typo', ' Keeps two.'));
  commitAll(p, 'two folders');
  scan(p);
  plan(p, [row('merge', 'folder', '3 Resources/ty', '3 Resources/typo')]);
  assert.match(re(p, 'plan').out, /already in 3 Resources\/typo: _about\.md[\s\S]*put the lines of 3 Resources\/ty\/_about\.md that still hold into a write row/);
  plan(p, [wr('3 Resources/typo/_about.md', aboutText('typo', ' Keeps one and two.')), rmf('3 Resources/ty/_about.md'), row('merge', 'folder', '3 Resources/ty', '3 Resources/typo')]);
  const a = re(p, 'apply', ['--rows', 'all', '--json']);
  assert.equal(a.code, 0, a.out);
  assert.ok(!has(p, '3 Resources/ty'));
  assert.ok(has(p, '3 Resources/typo/One.md') && has(p, '3 Resources/typo/Two.md'));
  assert.match(read(p, '3 Resources/typo/_about.md'), /Keeps one and two\./);
});

test('a folder that moves whole takes its _about.md along, and a row can describe it at its new place', () => {
  const p = withAbout();
  plan(p, [mkdir('3 Resources/moved'), mv('folder', '3 Resources/misc', '3 Resources/moved/misc'), wr('3 Resources/moved/misc/_about.md', aboutText('misc', ' Moved.')), wr('3 Resources/moved/_about.md', aboutText('moved'))]);
  const a = re(p, 'apply', ['--rows', 'all', '--json']);
  assert.equal(a.code, 0, a.out);
  assert.match(read(p, '3 Resources/moved/misc/_about.md'), /Moved\./);
  assert.ok(has(p, '3 Resources/moved/_about.md'));
  assert.ok(!has(p, '3 Resources/misc'));
  assert.deepEqual(a.json.check.aboutBad, []);
});

test('undo takes back created, updated and removed _about.md files byte for byte', () => {
  const p = withAbout();
  write(p.dir, 'vault/3 Resources/gone/_about.md', aboutText('gone'));
  commitAll(p, 'gone');
  scan(p);
  const start = snapshot(p.dir);
  plan(p, [wr('3 Resources/misc/_about.md', aboutText('misc', ' Changed.')), wr('Typography/_about.md', aboutText('Typography')), rmf('3 Resources/gone/_about.md'), rmdir('3 Resources/gone')]);
  assert.equal(re(p, 'apply', ['--rows', 'all']).code, 0);
  assert.notDeepEqual(snapshot(p.dir), start);
  const u = re(p, 'undo', ['--json']);
  assert.equal(u.code, 0, u.out);
  assert.deepEqual(snapshot(p.dir), start);
  assert.ok(has(p, '3 Resources/gone/_about.md'));
});

test('undo does not overwrite an _about.md that was edited after the batch', () => {
  const p = withAbout();
  plan(p, [wr('3 Resources/misc/_about.md', aboutText('misc', ' Changed.'))]);
  assert.equal(re(p, 'apply', ['--rows', 'all']).code, 0);
  fs.appendFileSync(path.join(p.dir, 'vault', '3 Resources', 'misc', '_about.md'), 'My own line.\n');
  const u = re(p, 'undo', ['--json']);
  assert.equal(u.code, 1);
  assert.ok(u.json.notes.some((n) => /not restored.*_about\.md/.test(n)));
  assert.match(read(p, '3 Resources/misc/_about.md'), /My own line\./);
});

test('verify reports a written _about.md that later fails the rules, and a second batch needs no commit', () => {
  const p = withAbout();
  plan(p, [wr('3 Resources/misc/_about.md', aboutText('misc', ' Changed.')), mv('note', 'Loose.md', '0 Inbox/Loose.md')]);
  assert.equal(re(p, 'apply', ['--rows', '2']).code, 0);
  assert.equal(re(p, 'scan', ['--json']).json.wayBack.state, 'journal', 'the moved note is the batch\'s own change');
  assert.equal(re(p, 'apply', ['--rows', '1']).code, 0, 'the way back holds through the first batch');
  fs.writeFileSync(path.join(p.dir, 'vault', '3 Resources', 'misc', '_about.md'), '# Only a title\n');
  const v = re(p, 'verify', ['--json']);
  assert.equal(v.code, 1);
  assert.ok(v.json.aboutBad.some((m) => /3 Resources\/misc\/_about\.md: .*sections/.test(m)), v.out);
});

test('a link inside a described folder is repaired in an _about.md that the plan did not write', () => {
  const p = messy();
  write(p.dir, 'vault/3 Resources/misc/_about.md', aboutText('misc').replace('None.\n\n## Agent rules', '[[Kerning basics]] and [guide](../../Typography/Guide.md)\n\n## Agent rules'));
  commitAll(p);
  scan(p);
  plan(p, [mkdir('3 Resources/typography'), mv('note', 'Typography/Guide.md', '3 Resources/typography/Guide.md')]);
  const a = re(p, 'apply', ['--rows', 'all', '--json']);
  assert.equal(a.code, 0, a.out);
  assert.match(read(p, '3 Resources/misc/_about.md'), /\[guide\]\(\.\.\/typography\/Guide\.md\)/);
});

test('a link that a rewritten _about.md no longer holds is not a stale link', () => {
  const p = messy();
  write(p.dir, 'vault/3 Resources/misc/_about.md', aboutText('misc').replace('None.\n\n## Agent rules', '[[Kerning basics]]\n\n## Agent rules'));
  commitAll(p);
  scan(p);
  plan(p, [wr('3 Resources/misc/_about.md', aboutText('misc', ' No links now.'))]);
  const a = re(p, 'apply', ['--rows', 'all', '--json']);
  assert.equal(a.code, 0, a.out);
  assert.deepEqual(a.json.check.stale, []);
});

test('the _about.md of a PARA folder is no loose file of that folder', () => {
  const p = messy();
  write(p.dir, 'vault/3 Resources/_about.md', aboutText('Resources'));
  write(p.dir, 'vault/3 Resources/Stray.md', 'stray\n');
  const sign = scan(p).json.signs.find((s) => s.id === 'loose-in-category');
  assert.deepEqual(sign.items, ['3 Resources/Kitob xulosasi.md', '3 Resources/Stray.md']);
});

// ---- a second round: the rows that waited for an answer --------------------------------------------------

test('a second round passes over the applied and the declined rows, keeps the numbers, and undo takes the marks back', () => {
  const p = messy();
  scan(p);
  const planFile = path.join(p.work, 'plan.json');
  const saved = () => JSON.parse(fs.readFileSync(planFile, 'utf8'));
  plan(p, [
    mkdir('3 Resources/typography'),
    mv('note', 'Typography/Kerning basics.md', '3 Resources/typography/Kerning basics.md'),
    wr('3 Resources/typography/_about.md', aboutText('typography')),
    mv('note', '0 Inbox/Untitled.md', '2 Areas/Health/Dentist visit.md', 'ask'),
    mv('note', 'Loose.md', '0 Inbox/Loose.md', 'ask'),
  ]);
  let r = re(p, 'apply', ['--rows', '1-3', '--json']);
  assert.equal(r.code, 0, r.out);
  assert.deepEqual(saved().map((x) => x.applied), ['001', '001', '001', undefined, undefined]);
  assert.match(re(p, 'plan').out, /\| 3 \|[^\n]*\| write about file \|[^\n]*\| applied 001 \|/, 'an applied about row is neither a create nor an update any more');
  // the answers: row 4 yes, row 5 no, and a new row at the end rewrites the about file of the first round
  const rows = saved();
  rows[3].flag = 'ok';
  rows[4].flag = 'skip';
  rows.push(wr('3 Resources/typography/_about.md', aboutText('typography', ' Kerning too.')));
  fs.writeFileSync(planFile, JSON.stringify(rows));
  r = re(p, 'plan', ['--json']);
  assert.equal(r.code, 0, r.out);
  assert.equal(r.json.applied, 3);
  assert.deepEqual(r.json.errors, []);
  assert.match(re(p, 'plan').out, /\| 1 \|[^\n]*\| applied 001 \|\n[^\n]*\n[^\n]*\n\| 4 \|[^\n]*\| ok \|\n\| 5 \|[^\n]*\| skip \|/);
  // a chosen row that is done or declined is refused, and nothing changes
  const before = snapshot(p.dir);
  assert.match(re(p, 'apply', ['--rows', '1', '--json']).json.errors[0], /row 1: was applied in batch 001/);
  assert.match(re(p, 'apply', ['--rows', '5', '--json']).json.errors[0], /row 5: is flagged skip/);
  assert.deepEqual(snapshot(p.dir), before);
  r = re(p, 'apply', ['--rows', 'all', '--json']);
  assert.equal(r.code, 0, r.out);
  assert.equal(r.json.rows, 2);
  assert.deepEqual(saved().map((x) => x.applied), ['001', '001', '001', '002', undefined, '002']);
  assert.ok(has(p, '2 Areas/Health/Dentist visit.md') && has(p, 'Loose.md'));
  assert.match(read(p, '3 Resources/typography/_about.md'), /Kerning too\./);
  assert.equal(re(p, 'apply', ['--rows', 'all', '--json']).json.errors[0], 'no row is left to apply');
  // undo takes back the second batch and its marks; the rows that were in it are valid again
  r = re(p, 'undo', ['--json']);
  assert.equal(r.code, 0, r.out);
  assert.deepEqual(saved().map((x) => x.applied), ['001', '001', '001', undefined, undefined, undefined]);
  r = re(p, 'plan', ['--json']);
  assert.equal(r.code, 0, r.out);
  assert.equal(r.json.applied, 3);
});

// ---- archiving the whole Inbox (hsb-review) ---------------------------------------------------------------

// the user's local calendar day, computed: the repository keeps no literal dates
const localToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

test('inbox plans the whole Inbox into a dated Archives folder; apply moves it, the _about.md stays, undo takes it all back', () => {
  const p = messy();
  write(p.dir, 'vault/0 Inbox/_about.md', '# Inbox\n\n## Purpose\nNew items wait here.\n');
  write(p.dir, 'vault/0 Inbox/Clippings/one.md', 'A clipping.\n');
  git(p.dir, 'add', '-A');
  git(p.dir, 'commit', '-q', '-m', 'inbox');
  const before = snapshot(vaultOf(p));
  const r = re(p, 'inbox', ['--json']);
  assert.equal(r.code, 0, r.out);
  const target = `4 Archives/Inbox ${localToday()}`;
  assert.equal(r.json.target, target);
  assert.equal(r.json.items, 3);
  assert.equal(r.json.wayBack.state, 'clean');
  const rows = JSON.parse(fs.readFileSync(r.json.plan, 'utf8'));
  assert.deepEqual(rows.map((x) => [x.op, x.kind, x.from, x.to]), [
    ['mkdir', 'folder', undefined, target],
    ['move', 'folder', '0 Inbox/Clippings', `${target}/Clippings`],
    ['move', 'note', '0 Inbox/Untitled.md', `${target}/Untitled.md`],
    ['move', 'document', '0 Inbox/scan0001.pdf', `${target}/scan0001.pdf`],
  ]);
  assert.deepEqual(snapshot(vaultOf(p)), before, 'inbox writes nothing into the vault');
  assert.equal(re(p, 'plan').code, 0);
  const a = re(p, 'apply', ['--rows', 'all', '--json']);
  assert.equal(a.code, 0, a.out);
  assert.deepEqual(fs.readdirSync(path.join(vaultOf(p), '0 Inbox')), ['_about.md']);
  assert.ok(has(p, `${target}/Clippings/one.md`) && has(p, `${target}/scan0001.pdf`));
  assert.match(read(p, 'Typography/Guide.md'), /\[\[Untitled\]\]/, 'a link by name stays as it is');
  assert.equal(re(p, 'undo').code, 0);
  assert.deepEqual(snapshot(vaultOf(p)), before);
});

test('inbox takes --name and --reason, reuses an existing folder, and refuses a name the folder already holds', () => {
  const p = messy();
  write(p.dir, 'vault/4 Archives/Inbox spring/old.md', 'Old.\n');
  let r = re(p, 'inbox', ['--name', 'Inbox spring', '--reason', "Inbox butunlay arxivga", '--json']);
  assert.equal(r.code, 0, r.out);
  assert.equal(r.json.created, false);
  const rows = JSON.parse(fs.readFileSync(r.json.plan, 'utf8'));
  assert.ok(rows.every((x) => x.op === 'move' && x.reason === 'Inbox butunlay arxivga'));
  write(p.dir, 'vault/4 Archives/Inbox spring/Untitled.md', 'Taken.\n');
  r = re(p, 'inbox', ['--name', 'Inbox spring']);
  assert.equal(r.code, 1);
  assert.match(r.out, /already holds Untitled\.md/);
  assert.equal(re(p, 'inbox', ['--name', 'a/b']).code, 1);
});

test('inbox refuses while a batch is not finished, and an empty Inbox has nothing to archive', () => {
  const p = messy();
  assert.equal(re(p, 'inbox').code, 0);
  assert.equal(re(p, 'apply', ['--rows', 'all']).code, 0);
  const r = re(p, 'inbox');
  assert.equal(r.code, 1);
  assert.match(r.out, /not finished/);
  assert.equal(re(p, 'finish').code, 0);
  const e = re(p, 'inbox', ['--json']);
  assert.equal(e.code, 0, e.out);
  assert.equal(e.json.status, 'empty');
});

test('restart plans the four category folders into one dated archive; the list, the _about.md files, Archives and the rest stay; undo takes it back', () => {
  const p = messy();
  write(p.dir, 'vault/2 Areas/_about.md', '# Areas\n\n## Purpose\nResponsibilities.\n');
  write(p.dir, 'vault/4 Archives/Old project/notes.md', 'Old.\n');
  git(p.dir, 'add', '-A');
  git(p.dir, 'commit', '-q', '-m', 'restart');
  const before = snapshot(vaultOf(p));
  const r = re(p, 'restart', ['--json']);
  assert.equal(r.code, 0, r.out);
  const target = `4 Archives/Archive ${localToday()}`;
  assert.equal(r.json.target, target);
  assert.deepEqual(r.json.folders, { '0 Inbox': 2, '1 Projects': 1, '2 Areas': 1, '3 Resources': 2 });
  assert.equal(r.json.items, 6);
  const rows = JSON.parse(fs.readFileSync(r.json.plan, 'utf8'));
  assert.deepEqual(rows.filter((x) => x.op === 'mkdir').map((x) => x.to), [target, `${target}/0 Inbox`, `${target}/1 Projects`, `${target}/2 Areas`, `${target}/3 Resources`]);
  assert.ok(rows.some((x) => x.from === '1 Projects/Brochure' && x.to === `${target}/1 Projects/Brochure`));
  assert.ok(!rows.some((x) => /Project List|_about\.md|Old project|Typography|Loose/.test(x.from || '')));
  assert.deepEqual(snapshot(vaultOf(p)), before, 'restart writes nothing into the vault');
  assert.equal(re(p, 'plan').code, 0);
  const a = re(p, 'apply', ['--rows', 'all', '--json']);
  assert.equal(a.code, 0, a.out);
  assert.deepEqual(fs.readdirSync(path.join(vaultOf(p), '1 Projects')), ['Project List.md']);
  assert.deepEqual(fs.readdirSync(path.join(vaultOf(p), '2 Areas')), ['_about.md']);
  assert.ok(has(p, `${target}/0 Inbox/scan0001.pdf`) && has(p, `${target}/3 Resources/misc/Doc One.pdf`) && has(p, '4 Archives/Old project/notes.md') && has(p, 'Loose.md'));
  assert.equal(re(p, 'verify').code, 0);
  assert.equal(re(p, 'undo').code, 0);
  assert.deepEqual(snapshot(vaultOf(p)), before);
});

test('restart refuses an existing folder and an unfinished batch, and an empty vault has nothing to archive', () => {
  const p = messy();
  write(p.dir, `vault/4 Archives/Archive ${localToday()}/x.md`, 'Taken.\n');
  let r = re(p, 'restart');
  assert.equal(r.code, 1);
  assert.match(r.out, /already exists/);
  r = re(p, 'restart', ['--name', 'Fresh start', '--reason', 'Vault qaytadan', '--json']);
  assert.equal(r.code, 0, r.out);
  assert.ok(JSON.parse(fs.readFileSync(r.json.plan, 'utf8')).every((x) => x.reason === 'Vault qaytadan'));
  assert.equal(re(p, 'apply', ['--rows', 'all', '--backup-confirmed']).code, 0);
  assert.match(re(p, 'restart', ['--name', 'Again']).out, /not finished/);
  assert.equal(re(p, 'finish').code, 0);
  const e = re(p, 'restart', ['--name', 'Again', '--json']);
  assert.equal(e.code, 0, e.out);
  assert.equal(e.json.status, 'empty');
});

test('each skill that runs the script keeps its own work folder: an Inbox archive never meets an unfinished reorganization', () => {
  const p = messy();
  const review = path.join(ROOT, 'skills', 'hsb-review', 'scripts', 'reorganize.mjs');
  const a = run(REORG, p.dir, 'scan', ['--json']);
  const b = run(review, p.dir, 'scan', ['--json']);
  assert.equal(a.code, 0, a.out);
  assert.equal(b.code, 0, b.out);
  assert.match(path.basename(a.json.work), /^hsb-reorganize-/);
  assert.match(path.basename(b.json.work), /^hsb-review-/);
  assert.equal(run(review, p.dir, 'finish').code, 0);
  assert.ok(fs.existsSync(a.json.work), "finishing the review's work leaves the reorganization's");
  assert.equal(run(REORG, p.dir, 'finish').code, 0);
});

test('an Inbox archive with the _about.md rows the agent appends: plan, apply, verify, and undo byte for byte', () => {
  const p = messy();
  write(p.dir, 'vault/0 Inbox/_about.md', '# Inbox\n\n## Purpose\nNew items wait here.\n');
  git(p.dir, 'add', '-A');
  git(p.dir, 'commit', '-q', '-m', 'inbox');
  const before = snapshot(vaultOf(p));
  const r = re(p, 'inbox', ['--json']);
  assert.equal(r.code, 0, r.out);
  const about = (title, purpose) => `# ${title}\n\n## Purpose\n${purpose}\n\n## Belongs here\n- Old items.\n\n## Not here\nNone.\n\n## Conventions\nNone.\n\n## Entry points\nNone.\n\n## Agent rules\nNone.\n`;
  const rows = JSON.parse(fs.readFileSync(r.json.plan, 'utf8'));
  rows.push({ op: 'write', kind: 'about', to: `${r.json.target}/_about.md`, text: about(path.posix.basename(r.json.target), 'Archive: the Inbox items of that day, archived without sorting.'), reason: 'describe the new folder', flag: 'ok' });
  rows.push({ op: 'write', kind: 'about', to: '4 Archives/_about.md', text: about('4 Archives', 'Archive: inactive material.'), reason: 'describe Archives', flag: 'ok' });
  fs.writeFileSync(r.json.plan, JSON.stringify(rows, null, 1));
  const planned = re(p, 'plan', ['--json']);
  assert.equal(planned.code, 0, planned.out);
  assert.equal(re(p, 'apply', ['--rows', 'all']).code, 0);
  const v = re(p, 'verify', ['--json']);
  assert.equal(v.code, 0, v.out);
  assert.ok(has(p, `${r.json.target}/_about.md`) && has(p, '4 Archives/_about.md'));
  assert.deepEqual(fs.readdirSync(path.join(vaultOf(p), '0 Inbox')), ['_about.md']);
  assert.equal(re(p, 'undo').code, 0);
  assert.deepEqual(snapshot(vaultOf(p)), before);
});
