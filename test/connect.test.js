// hsb-connect's script: tags and link properties written without touching the text after them, links in the form
// Obsidian resolves, MOCs, the check, the way back and undo. Every note is invented.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { tmp, write, snapshot } from './fixtures.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCAFFOLD = path.join(ROOT, 'skills', 'hsb-init', 'scripts', 'scaffold.mjs');
const CONNECT = path.join(ROOT, 'skills', 'hsb-connect', 'scripts', 'connect.mjs');
const TEMPLATE = fs.readFileSync(path.join(ROOT, 'skills', 'hsb-connect', 'templates', 'tags.md'), 'utf8');

const run = (dir, ...a) => {
  const r = spawnSync(process.execPath, [CONNECT, a[0], '--root', dir, ...a.slice(1), '--json'], { encoding: 'utf8' });
  let json = null;
  try {
    json = JSON.parse(r.stdout);
  } catch {
    // text output
  }
  return { code: r.status, json, out: r.stdout + r.stderr };
};
const git = (dir, ...a) => spawnSync('git', ['-C', dir, ...a], { encoding: 'utf8' });
const commit = (dir) => {
  git(dir, 'add', '-A');
  git(dir, '-c', 'user.name=t', '-c', 'user.email=t@example.com', 'commit', '-qm', 'x');
  return git(dir, 'rev-parse', 'HEAD').stdout.trim();
};
const v = (dir, rel, text) => write(dir, `vault/${rel}`, text);
const read = (dir, rel) => fs.readFileSync(path.join(dir, 'vault', rel), 'utf8');

/** A project with the default folders (0 Inbox ... 4 Archives), the standard, a git repository and an Obsidian folder at the project root. */
function project({ obsidianAt = 'root', gitRepo = true, tags = [], old = [] } = {}) {
  const dir = tmp();
  fs.mkdirSync(path.join(dir, 'vault'));
  const r = spawnSync(process.execPath, [SCAFFOLD, '--root', dir, '--json'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  if (obsidianAt === 'root') write(dir, '.obsidian/app.json', '{"alwaysUpdateLinks": true}');
  if (obsidianAt === 'vault') write(dir, 'vault/.obsidian/app.json', '{}');
  let std = TEMPLATE.replace('| `type/moc` | A map of content: a note that lists the notes of a section, grouped |', [
    '| `type/moc` | A map of content |',
    ...['type/meeting', 'type/quote', 'type/plan', 'topic/garden', 'topic/hiring', 'status/draft', ...tags].map((t) => `| \`${t}\` | Invented. |`),
  ].join('\n'));
  std = std.replace('| Old tag | New tag |\n|---|---|\n', `| Old tag | New tag |\n|---|---|\n${old.map(([a, b]) => `| \`${a}\` | \`${b}\` |`).join('\n')}${old.length ? '\n' : ''}`);
  write(dir, 'hyper-second-brain/tags.md', std);
  if (gitRepo) {
    git(dir, 'init', '-q');
    commit(dir);
  }
  return dir;
}
const changes = (dir, data) => write(dir, '../changes-' + path.basename(dir) + '.json', JSON.stringify(data));
const spec = (dir, data) => write(dir, '../spec-' + path.basename(dir) + '.json', JSON.stringify(data));
const bodyOf = (text) => text.replace(/^---\r?\n(?:[\s\S]*?\r?\n)?---[ \t]*(?:\r?\n|$)/, '');

test('apply reads every form of properties, keeps the other keys and the text after them byte for byte', () => {
  const dir = project({ old: [['garden', 'topic/garden'], ['Meeting', 'type/meeting']] });
  const notes = {
    '3 Resources/a/Block.md': '---\ntags:\n  - garden\ntitle: Block\n---\n# Block\n\nText with #inline tag.\n',
    '3 Resources/a/Flow.md': '---\ntags: [garden, "Meeting"]\nrating: 5\n---\nFlow body\n',
    '3 Resources/a/Scalar.md': '---\ntags: garden\nup: "[[Block]]"\n---\nScalar body',
    '3 Resources/a/None.md': 'No properties at all.\n\n---\n\nA rule line above.\n',
    '3 Resources/a/Empty.md': '---\n---\nEmpty block.\n',
    '3 Resources/a/Crlf.md': '---\r\ntags:\r\n  - garden\r\nnote: |\r\n  two\r\n  lines\r\n---\r\nWindows text\r\n',
  };
  for (const [rel, text] of Object.entries(notes)) v(dir, rel, text);
  commit(dir);
  const all = Object.fromEntries(Object.keys(notes).map((rel) => [rel, { tags: ['type/quote'], up: ['3 Resources/a/Block.md'] }]));
  all['3 Resources/a/Block.md'] = { tags: ['type/plan'], related: ['Flow'] };
  all['3 Resources/a/Flow.md'] = { up: ['3 Resources/a/Block.md'] }; // its old tag Meeting becomes its type/ tag
  const r = run(dir, 'apply', '--changes', changes(dir, all));
  assert.equal(r.code, 0, r.out);
  for (const [rel, before] of Object.entries(notes)) assert.equal(bodyOf(read(dir, rel)), bodyOf(before), rel);
  assert.equal(read(dir, '3 Resources/a/None.md'), `---\ntags:\n  - type/quote\nup:\n  - "[[Block]]"\n---\n${notes['3 Resources/a/None.md']}`);
  assert.match(read(dir, '3 Resources/a/Block.md'), /^---\ntags:\n {2}- type\/plan\n {2}- topic\/garden\ntitle: Block\nrelated:\n {2}- "\[\[Flow\]\]"\n---\n/);
  assert.match(read(dir, '3 Resources/a/Flow.md'), /tags:\n {2}- type\/meeting\n {2}- topic\/garden\nrating: 5\n/, 'the old tags were mapped and ordered');
  const crlf = read(dir, '3 Resources/a/Crlf.md');
  assert.ok(crlf.includes('note: |\r\n  two\r\n  lines\r\n'), 'a key the script does not touch stays as it was');
  assert.ok(!/[^\r]\n/.test(crlf), 'the line ends stay CRLF');
  assert.match(read(dir, '3 Resources/a/Scalar.md'), /up:\n {2}- "\[\[Block\]\]"\n---\nScalar body$/);
  // a second run with the same changes writes nothing
  const again = run(dir, 'apply', '--changes', changes(dir, all));
  assert.equal(again.code, 0, again.out);
  assert.equal(again.json.status, 'unchanged');
});

test('apply refuses the whole batch when one note cannot take the change, and writes nothing', () => {
  const dir = project();
  v(dir, '3 Resources/b/Good.md', 'Good.\n');
  v(dir, '3 Resources/b/Bom.md', '﻿---\ntags: []\n---\nText\n');
  v(dir, '3 Resources/b/OldTag.md', '---\ntags: [unmapped]\n---\nText\n');
  v(dir, '3 Resources/b/Twice.md', '---\ntags: [type/quote]\n---\nText\n');
  v(dir, '3 Resources/b/Multi.md', '---\ntags: >\n  folded\n---\nText\n');
  v(dir, '3 Resources/b/Dup.md', '---\nup: a\nup: b\n---\nText\n');
  v(dir, '3 Resources/b/_about.md', '# b\n');
  v(dir, '3 Resources/b/AGENTS.md', '# rules\n');
  commit(dir);
  const before = snapshot(dir);
  const cases = {
    '3 Resources/b/Good.md': { tags: ['type/unknown'] },
    '3 Resources/b/Bom.md': { tags: ['type/quote'] },
    '3 Resources/b/OldTag.md': { tags: ['type/quote'] },
    '3 Resources/b/Twice.md': { tags: ['type/plan'] },
    '3 Resources/b/Multi.md': { tags: ['type/quote'] },
    '3 Resources/b/Dup.md': { tags: ['type/quote'] },
    '3 Resources/b/_about.md': { tags: ['type/quote'] },
    '3 Resources/b/AGENTS.md': { tags: ['type/quote'] },
    '3 Resources/b/Missing.md': { tags: ['type/quote'] },
  };
  const r = run(dir, 'apply', '--changes', changes(dir, cases));
  assert.equal(r.code, 1, r.out);
  assert.equal(r.json.refused.length, Object.keys(cases).length, r.out);
  const reason = (name) => r.json.refused.find((x) => x.path.endsWith(name)).reason;
  assert.match(reason('Good.md'), /not in the standard/);
  assert.match(reason('Bom.md'), /byte order mark/);
  assert.match(reason('OldTag.md'), /neither lists nor maps/);
  assert.match(reason('Twice.md'), /allows one/);
  assert.match(reason('Multi.md'), /does not read/);
  assert.match(reason('Dup.md'), /appears twice/);
  assert.match(reason('_about.md'), /folder about file/);
  assert.match(reason('AGENTS.md'), /instruction file/);
  assert.match(reason('Missing.md'), /no such note/);
  const links = run(dir, 'apply', '--changes', changes(dir, { '3 Resources/b/Good.md': { up: ['Nowhere'] } }));
  assert.equal(links.code, 1, links.out);
  assert.match(links.json.refused[0].reason, /leads to no file/);
  assert.deepEqual(snapshot(dir), before, 'nothing was written');
});

test('a link is short when the name is unique, the full path from the Obsidian root when the name repeats in letter case or Unicode form', () => {
  const dir = project();
  const nfd = 'Café notes';
  v(dir, '1 Projects/GREENHOUSE/Requirements.md', 'One.\n');
  v(dir, '2 Areas/Work/requirements.md', 'Two.\n');
  v(dir, `3 Resources/c/${nfd}.md`, 'Decomposed name.\n');
  v(dir, '3 Resources/c/Plan.md', 'Plan.\n');
  commit(dir);
  const r = run(dir, 'apply', '--changes', changes(dir, {
    '3 Resources/c/Plan.md': { related: ['1 Projects/GREENHOUSE/Requirements.md', '[[Café notes]]'] },
    '3 Resources/c/Café notes.md': { tags: ['type/plan'] },
  }));
  assert.equal(r.code, 0, r.out);
  const plan = read(dir, '3 Resources/c/Plan.md');
  assert.ok(plan.includes('  - "[[vault/1 Projects/GREENHOUSE/Requirements]]"'), plan);
  assert.ok(plan.includes('  - "[[Café notes]]"'.normalize('NFC')), plan);
  assert.ok(fs.existsSync(path.join(dir, 'vault', `3 Resources/c/${nfd}.md`)), 'the file keeps its name on disk');
  const amb = run(dir, 'apply', '--changes', changes(dir, { '3 Resources/c/Plan.md': { up: ['Requirements'] } }));
  assert.equal(amb.code, 1, amb.out);
  assert.match(amb.json.refused[0].reason, /fits 2 files/);
  // the Obsidian vault is the vault folder itself: paths start there
  const inner = project({ obsidianAt: 'vault' });
  v(inner, '1 Projects/A/Notes.md', 'x\n');
  v(inner, '2 Areas/B/Notes.md', 'y\n');
  v(inner, '2 Areas/B/Main.md', 'z\n');
  commit(inner);
  const r2 = run(inner, 'apply', '--changes', changes(inner, { '2 Areas/B/Main.md': { related: ['2 Areas/B/Notes.md'] } }));
  assert.equal(r2.code, 0, r2.out);
  assert.ok(read(inner, '2 Areas/B/Main.md').includes('"[[2 Areas/B/Notes]]"'));
});

test('apply needs a way back: a vault with the user\'s uncommitted changes or without git is left alone unless a backup is confirmed', () => {
  const dir = project();
  v(dir, '3 Resources/d/Note.md', 'x\n');
  commit(dir);
  v(dir, '3 Resources/d/Other.md', 'the user is still writing\n');
  const c = changes(dir, { '3 Resources/d/Note.md': { tags: ['type/quote'] } });
  const before = snapshot(dir);
  const r = run(dir, 'apply', '--changes', c);
  assert.equal(r.code, 6, r.out);
  assert.deepEqual(snapshot(dir), before);
  const ok = run(dir, 'apply', '--changes', c, '--backup-confirmed');
  assert.equal(ok.code, 0, ok.out);
  const plain = project({ gitRepo: false });
  v(plain, '3 Resources/d/Note.md', 'x\n');
  const r2 = run(plain, 'apply', '--changes', changes(plain, { '3 Resources/d/Note.md': { tags: ['type/quote'] } }));
  assert.equal(r2.code, 6, r2.out);
  assert.equal(r2.json.wayBack.state, 'no-git');
});

test('moc creates a map with short aliases, and a later run only adds what it lacks', () => {
  const dir = project();
  v(dir, '2 Areas/Hiring/Interview one.md', 'x\n');
  v(dir, '2 Areas/Hiring/Interview two.md', 'y\n');
  v(dir, '2 Areas/Hiring/Job description.md', 'z\n');
  v(dir, '2 Areas/Hiring/_about.md', '# Hiring\n');
  v(dir, '2 Areas/Hiring/Own note.md', '---\ntags: [type/plan]\n---\nThe user\'s own list.\n');
  commit(dir);
  const long = 'A very long title | with [brackets]\nand a line break that goes on well past the limit of the alias';
  const first = { path: '2 Areas/Hiring/MOC - Hiring.md', intro: 'Hiring: start with the job description.', up: ['2 Areas/Hiring/_about.md'], groups: [{ heading: 'Interviews', links: [{ to: 'Interview one', alias: long }] }] };
  const r = run(dir, 'moc', '--spec', spec(dir, first));
  assert.equal(r.code, 0, r.out);
  const text = read(dir, '2 Areas/Hiring/MOC - Hiring.md');
  assert.match(text, /^---\ntags:\n {2}- type\/moc\nup:\n {2}- "\[\[vault\/2 Areas\/Hiring\/_about\]\]"\n---\nHiring: start with the job description\.\n\n## Interviews\n\n- \[\[Interview one\|[^|\]\n[]+…\]\]\n$/);
  // the user adds a line; the next run adds the new links at the end of their groups and keeps that line
  fs.appendFileSync(path.join(dir, 'vault/2 Areas/Hiring/MOC - Hiring.md'), '- A line the user wrote\n');
  commit(dir);
  const second = { ...first, groups: [{ heading: 'Interviews', links: ['Interview one', 'Interview two'] }, { heading: 'Roles', links: ['Job description'] }] };
  const r2 = run(dir, 'moc', '--spec', spec(dir, second));
  assert.equal(r2.code, 0, r2.out);
  const after = read(dir, '2 Areas/Hiring/MOC - Hiring.md');
  assert.equal(after.match(/Interview one/g).length, 1, after);
  assert.match(after, /- A line the user wrote\n- \[\[Interview two\]\]\n\n## Roles\n\n- \[\[Job description\]\]\n/);
  // a note without type/moc is the user's: moc leaves it alone
  const r3 = run(dir, 'moc', '--spec', spec(dir, { path: '2 Areas/Hiring/Own note.md', groups: [{ heading: 'X', links: ['Interview one'] }] }));
  assert.equal(r3.code, 1, r3.out);
  assert.match(r3.json.refused[0].reason, /user's note/);
});

test('check finds the gaps and passes once they are filled; the text is compared with the base commit', () => {
  const dir = project();
  v(dir, '1 Projects/SHED/Plan.md', '# Plan\n\nBuild it.\n');
  v(dir, '1 Projects/SHED/Quote.md', '---\ntags:\n  - type/quote\nup: [[Plan]]\n---\nA quote.\n');
  v(dir, '1 Projects/SHED/_about.md', '# SHED\n\n## Entry points\n\nNone.\n');
  v(dir, '2 Areas/Old/_about.md', '# Old\n');
  const base = commit(dir);
  let r = run(dir, 'check', '--base', base);
  assert.equal(r.code, 1, r.out);
  const count = (res, id) => res.json.results.find((x) => x.id === id).count;
  assert.equal(count(r, 'tag-missing'), 1);
  assert.equal(count(r, 'up-missing'), 1);
  assert.equal(count(r, 'link-unquoted'), 1);
  // fill the gaps with the script, then a MOC that the folder's _about.md does not name yet
  r = run(dir, 'moc', '--spec', spec(dir, { path: '1 Projects/SHED/MOC - Shed.md', intro: 'The shed.', up: ['1 Projects/SHED/_about.md'], groups: [{ heading: 'Plan', links: ['Plan'] }] }));
  assert.equal(r.code, 0, r.out);
  r = run(dir, 'apply', '--changes', changes(dir, {
    '1 Projects/SHED/Plan.md': { tags: ['type/plan'], up: ['MOC - Shed'] },
    '1 Projects/SHED/Quote.md': { up: ['MOC - Shed'], remove: { up: ['Plan'] } },
  }));
  assert.equal(r.code, 0, r.out);
  r = run(dir, 'check', '--base', base);
  assert.equal(count(r, 'moc-unreached'), 1, r.out);
  assert.equal(count(r, 'moc-member-missing'), 1, r.out);
  fs.writeFileSync(path.join(dir, 'vault/1 Projects/SHED/_about.md'), '# SHED\n\n## Entry points\n\n- [[MOC - Shed]]\n');
  r = run(dir, 'moc', '--spec', spec(dir, { path: '1 Projects/SHED/MOC - Shed.md', groups: [{ heading: 'Quotes', links: ['Quote'] }] }));
  assert.equal(r.code, 0, r.out);
  r = run(dir, 'check', '--base', base);
  assert.equal(r.code, 0, r.out);
  // a changed text, a moved note whose up still names the old folder's _about.md
  fs.appendFileSync(path.join(dir, 'vault/1 Projects/SHED/Plan.md'), 'One more line.\n');
  v(dir, '2 Areas/Old/Moved.md', '---\ntags:\n  - type/plan\nup:\n  - "[[vault/1 Projects/SHED/_about]]"\n---\nx\n');
  r = run(dir, 'check', '--base', base);
  assert.equal(count(r, 'body-changed'), 1, r.out);
  assert.equal(count(r, 'up-stale'), 1, r.out);
  // without --base the comparison is with the text before the first batch of this run
  r = run(dir, 'check');
  assert.equal(count(r, 'body-changed'), 1, r.out);
});

test('undo takes the last batch back, a created MOC included, and keeps a file the user changed since', () => {
  const dir = project();
  v(dir, '3 Resources/e/One.md', 'one\n');
  v(dir, '3 Resources/e/Two.md', 'two\n');
  commit(dir);
  const before = snapshot(dir);
  assert.equal(run(dir, 'moc', '--spec', spec(dir, { path: '3 Resources/e/MOC - E.md', groups: [{ heading: 'All', links: ['One', 'Two'] }] })).code, 0);
  assert.equal(run(dir, 'undo').code, 0);
  assert.deepEqual(snapshot(dir), before);
  assert.equal(run(dir, 'apply', '--changes', changes(dir, { '3 Resources/e/One.md': { tags: ['type/quote'] }, '3 Resources/e/Two.md': { tags: ['type/quote'] } })).code, 0);
  fs.appendFileSync(path.join(dir, 'vault/3 Resources/e/Two.md'), 'the user wrote more\n');
  const r = run(dir, 'undo');
  assert.equal(r.code, 1, r.out);
  assert.deepEqual(r.json.kept, ['3 Resources/e/Two.md']);
  assert.equal(read(dir, '3 Resources/e/One.md'), 'one\n');
  assert.equal(run(dir, 'finish').code, 0);
});

test('measure only reads, and reports tags, repeated names, what depends on tags or paths, and what is left out', () => {
  const dir = project();
  write(dir, '.obsidian/community-plugins.json', '["dataview", "templater-obsidian"]');
  write(dir, '.obsidian/plugins/templater-obsidian/data.json', '{"templates_folder": "vault/3 Resources/templates"}');
  v(dir, '3 Resources/templates/Daily.md', '---\ntags: [daily]\n---\n<% tp.date.now() %>\n');
  v(dir, '3 Resources/f/A.md', '---\ntags: [reading]\n---\nText #idea and `#code` and\n\n```\n#fenced\n```\n');
  v(dir, '3 Resources/f/Requirements.md', 'x\n');
  v(dir, '2 Areas/G/requirements.md', 'y\n');
  v(dir, '2 Areas/G/Board.md', '```dataview\nLIST FROM #reading\n```\n');
  v(dir, '2 Areas/G/View.base', 'filters:\n  and:\n    - file.inFolder("2 Areas/G")\n');
  v(dir, '2 Areas/G/Map.canvas', '{"nodes": [{"id": "1", "type": "file", "file": "vault/2 Areas/G/Board.md"}]}');
  v(dir, '2 Areas/G/Drawing.excalidraw.md', '---\nexcalidraw-plugin: parsed\n---\n');
  commit(dir);
  const before = snapshot(dir);
  const r = run(dir, 'measure');
  assert.equal(r.code, 0, r.out);
  assert.deepEqual(snapshot(dir), before);
  const m = r.json;
  assert.equal(m.obsidian.vaultPrefix, 'vault');
  assert.deepEqual(m.obsidian.templates, ['3 Resources/templates']);
  assert.deepEqual(m.inlineTags.map((t) => t.name), ['idea']);
  assert.ok(m.tags.some((t) => t.name === 'reading'));
  assert.deepEqual(m.repeatedNames.map((l) => l.length), [2]);
  assert.equal(m.dependents.dataview[0].tags[0], '#reading');
  assert.equal(m.dependents.bases.length, 1);
  assert.equal(m.dependents.canvases.length, 1);
  const reasons = Object.fromEntries(m.excluded.map((x) => [x.path, x.reason]));
  assert.equal(reasons['3 Resources/templates/Daily.md'], 'templates folder');
  assert.equal(reasons['2 Areas/G/Drawing.excalidraw.md'], 'Excalidraw drawing');
  assert.equal(m.standard.exists, true);
});

test('apply, moc and check stop with exit 5 while the standard is missing or has errors', () => {
  const dir = project();
  v(dir, '3 Resources/h/Note.md', 'x\n');
  commit(dir);
  const file = path.join(dir, 'hyper-second-brain', 'tags.md');
  fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('| `type/moc` | A map of content |', '| `Type/Moc` | Wrong form |'));
  let r = run(dir, 'check');
  assert.equal(r.code, 5, r.out);
  assert.ok(r.json.errors.some((e) => /not in the form/.test(e)), r.out);
  fs.rmSync(file);
  r = run(dir, 'apply', '--changes', changes(dir, {}));
  assert.equal(r.code, 5, r.out);
  assert.equal(run(dir, 'measure').code, 0, 'measure works before the standard exists');
});

test('the order of the skill works on a first run: dry runs before the MOC and the _about.md exist, then _about.md, moc, apply', () => {
  const dir = project();
  v(dir, '2 Areas/Team/Minutes one.md', 'One.\n');
  v(dir, '2 Areas/Team/Minutes two.md', 'Two.\n');
  v(dir, '2 Areas/Health/Plan.md', 'Walk daily.\n');
  commit(dir);
  const s = spec(dir, { path: '2 Areas/Team/MOC - Team.md', intro: 'The team.', up: ['2 Areas/Team/_about.md'], groups: [{ heading: 'Meetings', links: ['Minutes one', 'Minutes two'] }] });
  const c = changes(dir, {
    '2 Areas/Team/Minutes one.md': { tags: ['type/meeting'], up: ['2 Areas/Team/MOC - Team.md'] },
    '2 Areas/Team/Minutes two.md': { tags: ['type/meeting'], up: ['MOC - Team'] },
    '2 Areas/Health/Plan.md': { tags: ['type/plan'], up: ['2 Areas/Health/_about.md'] },
  });
  const before = snapshot(dir);
  let r = run(dir, 'moc', '--spec', s, '--dry-run');
  assert.equal(r.code, 0, r.out);
  r = run(dir, 'apply', '--changes', c, '--spec', s, '--dry-run');
  assert.equal(r.code, 0, r.out);
  assert.deepEqual(r.json.plannedLinks.sort(), ['2 Areas/Health/_about.md', '2 Areas/Team/MOC - Team.md']);
  assert.deepEqual(snapshot(dir), before, 'a dry run writes nothing');
  r = run(dir, 'apply', '--changes', c, '--spec', s);
  assert.equal(r.code, 1, 'without the _about.md files the real run is refused');
  v(dir, '2 Areas/Team/_about.md', '# Team\n\n## Entry points\n\n- [[MOC - Team]]\n');
  v(dir, '2 Areas/Health/_about.md', '# Health\n');
  assert.equal(run(dir, 'moc', '--spec', s).code, 0);
  r = run(dir, 'apply', '--changes', c, '--spec', s);
  assert.equal(r.code, 0, r.out);
  r = run(dir, 'check');
  assert.equal(r.code, 0, r.out);
});
