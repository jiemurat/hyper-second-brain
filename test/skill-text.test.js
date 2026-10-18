// The skill texts say what the scripts do. An agent that follows a SKILL.md word for word must find
// every file, flag, exit code and finding id the text names: these tests keep the texts
// and the code from drifting apart (the independent sub-agent runs found each of these gaps by hand).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RULES_SECTIONS, PLACE_SKILL, pointerLine } from '../core/scripts/hsb-lib.mjs';
import { COMMANDS } from '../lib/agents.js';
import { packageSkills } from '../lib/install.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');
const SKILLS = { 'hsb-init': ['scaffold.mjs'], 'hsb-doctor': ['hsb-check.mjs'], 'hsb-update': ['update.mjs'], 'hsb-projects': ['hsb-state.mjs'], 'hsb-review': ['hsb-state.mjs', 'reorganize.mjs'], 'hsb-find': ['hsb-find.mjs'], 'hsb-capture': ['hsb-find.mjs'], 'hsb-re-organize': ['reorganize.mjs'], 'hsb-restart': ['reorganize.mjs'], 'hsb-connect': ['connect.mjs'] };
const TEXT_SKILLS = ['hsb-place-an-item', 'hsb-distill', 'hsb-create', 'hsb-share']; // skills of text only: a SKILL.md and a reference, no script

/** Every file under dir, relative, '/' separated. */
const walk = (dir, rel = '') => fs.readdirSync(path.join(dir, rel), { withFileTypes: true }).flatMap((e) => {
  const r = rel ? `${rel}/${e.name}` : e.name;
  return e.isDirectory() ? walk(dir, r) : [r];
});

/** The texts an agent reads in a built skill: its SKILL.md and its references. */
const skillTexts = (name) => ['SKILL.md', ...walk(path.join(ROOT, 'skills', name)).filter((f) => f.startsWith('references/'))].map((f) => read('skills', name, f));

/** The first block comment of a script: its header. */
const header = (script) => /\/\*([\s\S]*?)\*\//.exec(script)[1];

/** The backticked paths in the first column of the "Files and when to read them" table. */
function tablePaths(skillText) {
  const table = skillText.split('## Files and when to read them')[1] || '';
  return [...table.matchAll(/^\| ((?:`[^`]+`(?:, )?)+) \|/gm)].flatMap((m) => [...m[1].matchAll(/`([^`]+)`/g)].map((x) => x[1]));
}

test('every path the Files table names exists, and every file of the skill is named there', () => {
  for (const name of [...Object.keys(SKILLS), ...TEXT_SKILLS]) {
    const dir = path.join(ROOT, 'skills', name);
    // rows that start with <project>/ or <work>/ name files of the project or of the work folder, not files of the skill
    const named = tablePaths(read('skills', name, 'SKILL.md')).filter((p) => !p.startsWith('<'));
    assert.ok(named.length >= (name in SKILLS ? 3 : 1), `${name}: the Files table is empty`);
    for (const p of named) assert.ok(fs.existsSync(path.join(dir, p)), `${name}: the table names ${p}, which is not in the skill`);
    for (const file of walk(dir).filter((f) => f !== 'SKILL.md')) {
      assert.ok(named.some((p) => file === p || (p.endsWith('/') && file.startsWith(p))), `${name}: ${file} is not named in the Files table`);
    }
  }
});

test('every flag a skill names is a flag of its scripts or of the npm tool', () => {
  const cli = read('cli', 'hyper-second-brain.js');
  for (const [name, scripts] of Object.entries(SKILLS)) {
    const known = scripts.map((script) => header(read('skills', name, 'scripts', script))).join('\n') + cli;
    const spans = skillTexts(name).flatMap((text) => [...text.matchAll(/`([^`\n]+)`/g)].map((m) => m[1]));
    for (const flag of new Set(spans.flatMap((span) => span.match(/--[a-z][a-z-]+/g) || []))) {
      assert.ok(known.includes(flag), `${name}: ${flag} is not in the header of ${scripts.join(' or ')} or in the npm tool`);
    }
  }
});

test('every exit code in a script header is listed in one text of its skill', () => {
  for (const [name, scripts] of Object.entries(SKILLS)) {
    for (const script of scripts) {
      const codes = (/Exit codes?:([\s\S]*)$/.exec(header(read('skills', name, 'scripts', script))) || [])[1]?.match(/\b\d\b/g);
      assert.ok(codes?.length >= 4, `${name}: no exit codes in the header of ${script}`);
      const listing = (text) => codes.every((code) => new RegExp(`^ *- ${code}: `, 'm').test(text));
      assert.ok(skillTexts(name).some(listing), `${name}: no text of the skill lists every exit code of ${script} (${codes.join(', ')})`);
    }
  }
});

test('the SKILL.md files do not send the agent to a header they forbid it to read', () => {
  for (const name of Object.keys(SKILLS)) {
    assert.ok(!/in its header/.test(read('skills', name, 'SKILL.md')), `${name}: "in its header" while the script is not to be read`);
  }
});

test('every finding id the check can print has a row in audit.md, and every row has a finding', () => {
  const source = read('core', 'scripts', 'hsb-check.mjs');
  const emitted = new Set([...source.matchAll(/add\((['`])([^'`]+)\1/g)].map((m) => m[2].replace(/\$\{[^}]*\}/g, '<x>')));
  const documented = new Set([...read('core', 'references', 'audit.md').matchAll(/^\| `([^`]+)` \|/gm)].map((m) => m[1].replace(/<[^>]*>/g, '<x>')));
  assert.deepEqual([...emitted].filter((id) => !documented.has(id)).sort(), [], 'findings without a row in audit.md');
  assert.deepEqual([...documented].filter((id) => !emitted.has(id)).sort(), [], 'rows in audit.md without a finding');
});

test('the sections of HYPER-SECOND-BRAIN.md that the doctor looks for exist in the template and in the audit reference', () => {
  const template = read('core', 'templates', 'HYPER-SECOND-BRAIN.md.tmpl');
  const audit = read('core', 'references', 'audit.md');
  assert.ok(RULES_SECTIONS.length >= 3);
  for (const section of RULES_SECTIONS) {
    assert.match(template, new RegExp(`^## ${section}$`, 'm'), section);
    assert.ok(audit.includes(section), `${section}: audit.md does not name it`);
  }
});

test('the sections of project.md that the skills and references fill exist in the template', () => {
  const template = read('core', 'templates', 'project.md.tmpl');
  for (const section of ['Project rules', 'Decisions on conflicts', 'Instruction files in the vault', 'Other top-level folders', 'Folders', 'Lasting choices']) {
    assert.match(template, new RegExp(`^#{2,3} ${section}$`, 'm'), section);
  }
  const rules = read('core', 'references', 'project-rules.md');
  assert.ok(rules.includes('"- None recorded."') && (template.match(/- None recorded\./g) || []).length === 2);
});

test('both skills that record project rules carry the reference', () => {
  for (const name of ['hsb-init', 'hsb-doctor']) assert.ok(fs.existsSync(path.join(ROOT, 'skills', name, 'references', 'project-rules.md')), name);
  assert.ok(!fs.existsSync(path.join(ROOT, 'skills', 'hsb-update', 'references', 'project-rules.md')));
});

/** The sections of a project file that a text names: `HYPER-SECOND-BRAIN.md` -> "A", "B"  or  `project.md` -> "C". */
function namedSections(text) {
  const out = { rules: [], project: [] };
  for (const m of text.matchAll(/`(HYPER-SECOND-BRAIN\.md|project\.md)` → ((?:"[^"]+"(?:, | and | or )?)+)/g)) {
    const names = [...m[2].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
    (m[1] === 'project.md' ? out.project : out.rules).push(...names);
  }
  return out;
}

const headings = (text) => new Set(text.split('\n').map((l) => /^#{2,3} (.+?)\s*$/.exec(l)?.[1]).filter(Boolean));

test('every section of HYPER-SECOND-BRAIN.md and of project.md that a skill names exists in the templates', () => {
  const rules = headings(read('core', 'templates', 'HYPER-SECOND-BRAIN.md.tmpl'));
  const project = headings(read('core', 'templates', 'project.md.tmpl'));
  const decides = ['hsb-place-an-item', 'hsb-projects', 'hsb-review', 'hsb-re-organize']; // the skills that decide by the rules file name many of its sections
  for (const name of [...Object.keys(SKILLS), ...TEXT_SKILLS]) {
    const texts = [read('skills', name, 'SKILL.md'), ...walk(path.join(ROOT, 'skills', name, 'references')).map((f) => read('skills', name, 'references', f))];
    const found = { rules: [], project: [] };
    for (const t of texts) {
      const n = namedSections(t);
      found.rules.push(...n.rules);
      found.project.push(...n.project);
    }
    if (decides.includes(name)) assert.ok(found.rules.length >= 5, `${name}: it names ${found.rules.length} sections of HYPER-SECOND-BRAIN.md`);
    for (const h of found.rules) assert.ok(rules.has(h), `${name}: HYPER-SECOND-BRAIN.md has no section "${h}"`);
    for (const h of found.project) assert.ok(project.has(h), `${name}: project.md has no section "${h}"`);
  }
});

test('a skill that decides by the rules file repeats no line of it', () => {
  const lines = read('core', 'templates', 'HYPER-SECOND-BRAIN.md.tmpl').split('\n').map((l) => l.replace(/^\s*(?:[-*]|\d+\.)\s+/, '').trim()).filter((l) => l.length >= 50 && !l.startsWith('#'));
  assert.ok(lines.length > 20);
  for (const name of [...TEXT_SKILLS, 'hsb-projects', 'hsb-review', 'hsb-find', 'hsb-capture', 'hsb-re-organize', 'hsb-connect']) {
    const text = walk(path.join(ROOT, 'skills', name)).filter((f) => !f.startsWith('scripts/')).map((f) => read('skills', name, f)).join('\n');
    for (const line of lines) assert.ok(!text.includes(line), `${name} copies a line of the rules file: ${line.slice(0, 70)}`);
  }
});

test('hsb-re-organize, hsb-projects, hsb-review and hsb-capture repeat no line of hsb-place-an-item and name the files they read at run time', () => {
  const shared = new Set(fs.readdirSync(path.join(ROOT, 'core', 'skill-parts')).flatMap((f) => read('core', 'skill-parts', f).split('\n').map((l) => l.trim()))); // the skill parts are shared by every skill on purpose
  const lines = walk(path.join(ROOT, 'skills', 'hsb-place-an-item')).filter((f) => !f.endsWith('folder-about.md')).flatMap((f) => read('skills', 'hsb-place-an-item', f).split('\n')) // the folder-about reference is shared on purpose
    .map((l) => l.replace(/^\s*(?:[-*]|\d+\.)\s+/, '').trim()).filter((l) => l.length >= 50 && !l.startsWith('#') && !l.startsWith('|') && !shared.has(l));
  assert.ok(lines.length > 20);
  for (const name of ['hsb-re-organize', 'hsb-projects', 'hsb-review', 'hsb-capture']) {
    const text = walk(path.join(ROOT, 'skills', name)).filter((f) => !f.startsWith('scripts/')).map((f) => read('skills', name, f)).join('\n');
    for (const line of lines) assert.ok(!text.includes(line), `${name} copies a line of hsb-place-an-item: ${line.slice(0, 70)}`);
    for (const file of ['../hsb-place-an-item/SKILL.md', '../hsb-place-an-item/references/placement.md']) {
      assert.ok(text.includes(`\`${file}\``), `${name} does not send the agent to ${file}`);
      assert.ok(fs.existsSync(path.join(ROOT, 'skills', name, file)), file);
    }
  }
});

test('hsb-review repeats no rule of hsb-projects, names the files it reads at run time, and every section it names there exists', () => {
  // the rules of projects: the core rules of the SKILL.md and its two references (the steps' context and report lines are the same in every skill on purpose)
  const core = read('skills', 'hsb-projects', 'SKILL.md').split('## Core rules')[1].split('\n## ')[0];
  const lines = [core, read('skills', 'hsb-projects', 'references', 'project-list.md'), read('skills', 'hsb-projects', 'references', 'lifecycle.md')].flatMap((t) => t.split('\n'))
    .map((l) => l.replace(/^\s*(?:[-*]|\d+\.)\s+/, '').trim()).filter((l) => l.length >= 50 && !l.startsWith('#') && !l.startsWith('|'));
  assert.ok(lines.length > 20);
  const texts = walk(path.join(ROOT, 'skills', 'hsb-review')).filter((f) => !f.startsWith('scripts/')).map((f) => read('skills', 'hsb-review', f));
  const text = texts.join('\n');
  for (const line of lines) assert.ok(!text.includes(line), `hsb-review copies a line of hsb-projects: ${line.slice(0, 70)}`);
  for (const file of ['../hsb-projects/SKILL.md', '../hsb-projects/references/project-list.md', '../hsb-projects/references/lifecycle.md']) {
    assert.ok(text.includes(`\`${file}\``), `hsb-review does not send the agent to ${file}`);
    assert.ok(fs.existsSync(path.join(ROOT, 'skills', 'hsb-review', file)), file);
  }
  // a section of a sibling skill's file, named as `../<skill>/references/<file>.md` → "<section>"
  for (const m of text.matchAll(/`\.\.\/(hsb-[\w-]+)\/references\/([\w.-]+\.md)` → ((?:"[^"]+"(?:, | and | or )?)+)/g)) {
    const sections = headings(read('skills', m[1], 'references', m[2]));
    for (const name of [...m[3].matchAll(/"([^"]+)"/g)].map((x) => x[1])) assert.ok(sections.has(name), `${m[1]}/references/${m[2]} has no section "${name}"`);
  }
  // a section named by its title alone, inside a sentence about a sibling file, is checked by hand: "Reviewing the list"
  assert.ok(headings(read('skills', 'hsb-projects', 'references', 'project-list.md')).has('Reviewing the list'));
});

test('the pointer line names the rules file and an existing skill that the rules file lists', () => {
  const line = pointerLine('vault');
  assert.ok(line.includes('HYPER-SECOND-BRAIN.md') && line.includes(PLACE_SKILL));
  assert.ok(fs.existsSync(path.join(ROOT, 'skills', PLACE_SKILL, 'SKILL.md')));
  assert.ok(read('core', 'templates', 'HYPER-SECOND-BRAIN.md.tmpl').includes(`\`${PLACE_SKILL}\``));
});

test('the README table has a row for every shipped skill', () => {
  const readme = read('README.md');
  for (const name of fs.readdirSync(path.join(ROOT, 'skills'))) assert.match(readme, new RegExp(`^\\| \`${name}\` \\|`, 'm'), name);
});

test('hsb-re-organize answers the questions that the independent agent runs raised', () => {
  const skill = read('skills', 'hsb-re-organize', 'SKILL.md');
  const reference = read('skills', 'hsb-re-organize', 'references', 'reorganize.md');
  // the plan file does not exist after the scan; a general yes does not answer an ask row; the order of the script's checks; when finish is safe
  for (const phrase of ['it does not exist yet', 'A general yes does not answer a row flagged `ask`', 'checks the chosen rows first and the way back second', 'no row and no question still waits for an answer', '`Project List.md` in the Projects folder', 'When the plan has no rows', 'When either of these two files is missing', '`journal`: the uncommitted changes', 'blocks `apply` until the user commits', 'when the user declines both', 'skip both', 'a thanks alone is not that', 'Look at the way-back state from step 2 before you run `apply`', 'a question the user postponed still waits', 'skip step 8, and go to step 9', 'is refused while one of them is flagged `ask`', 'when the user is content with the result', 'leave the file where it is and ask the user']) {
    assert.ok(skill.includes(phrase), `SKILL.md lacks: ${phrase}`);
  }
  // which paths a row holds, what a duplicate and an empty folder get, what a document that cannot be read gets
  for (const phrase of ['Every path is relative to the vault', 'only `to` for a mkdir, only `from` for an rmdir', 'write no row', 'doubt` when it was empty before the plan', 'stays where it is and gets no row', 'A `mkdir` row has no current name', 'gets no row, whatever other signs it has', 'the user asking for this reorganization and saying yes to the table is that decision', 'In a move row `to` is the destination path', 'The question lives in your report only', 'named for what the item served', 'differ only in letter case are one folder', 'gets no row either: it stays where it is', '| `same-name` |', 'A folder with only its `_about.md` counts as empty', '| Describe a folder |']) {
    assert.ok(reference.includes(phrase), `reorganize.md lacks: ${phrase}`);
  }
});

test('hsb-re-organize and the rules file agree on the about file of a folder', () => {
  const skill = read('skills', 'hsb-re-organize', 'SKILL.md');
  const reference = read('skills', 'hsb-re-organize', 'references', 'folder-about.md');
  const rules = read('core', 'templates', 'HYPER-SECOND-BRAIN.md.tmpl');
  assert.match(rules, /^## Folder about files$/m);
  assert.ok(rules.includes('`_about.md`') && rules.includes('references/folder-about.md'));
  for (const phrase of ['`write` and `rmfile` rows', 'references/folder-about.md']) assert.ok(skill.includes(phrase), `SKILL.md lacks: ${phrase}`);
  for (const phrase of ['40 lines', '`None.`', 'Name no other files']) assert.ok(reference.includes(phrase), `folder-about.md lacks: ${phrase}`);
  // the script and the reference agree on the file name and the limits
  const script = read('core', 'scripts', 'reorganize.mjs');
  assert.ok(script.includes("const ABOUT = '_about.md'") && script.includes('ABOUT_MAX_LINES = 40') && script.includes('ABOUT_MIN_SECTIONS = 6'));
});

test('hsb-place-an-item describes the destination folder with the shared reference and reports it', () => {
  const skill = read('skills', 'hsb-place-an-item', 'SKILL.md');
  const placement = read('skills', 'hsb-place-an-item', 'references', 'placement.md');
  assert.ok(skill.includes('`references/folder-about.md`') && skill.includes('each destination folder has an `_about.md` that is true'));
  assert.ok(placement.includes('Read the `_about.md` of an existing folder') && placement.includes('The `_about.md` files you created or updated'));
  // one reference for both skills: the same text
  assert.equal(read('skills', 'hsb-place-an-item', 'references', 'folder-about.md'), read('skills', 'hsb-re-organize', 'references', 'folder-about.md'));
});

test('hsb-place-an-item, placement.md and the rules file agree on what is opened, archived and saved', () => {
  const skill = read('skills', 'hsb-place-an-item', 'SKILL.md');
  const placement = read('skills', 'hsb-place-an-item', 'references', 'placement.md');
  const rules = read('core', 'templates', 'HYPER-SECOND-BRAIN.md.tmpl');
  // placement.md has the agent read the about file of a folder it only considers: the rule on what to open allows it
  const openRule = skill.split('\n').find((l) => l.includes('**Open only what the steps name.**'));
  assert.ok(placement.includes('folder you are considering') && /`_about\.md` of each folder you consider/.test(openRule), 'the rule on what to open and placement.md disagree on the about files');
  // the archive stays as it was, yet the reorganizing keeps the about file of an archived folder true
  const archives = rules.split('\n').find((l) => l.startsWith('- **Archives:**'));
  assert.ok(archives.includes('`_about.md`'), 'the Archives rule leaves no room for the about file of an archived folder');
  // every note not created in this conversation is the user's: the about file, which the skills keep true without a yes, is the exception
  const notes = rules.split('\n').find((l) => l.includes('treat every other note as the user\'s'));
  assert.ok(notes.includes('`_about.md` follows "Folder about files"'), 'the rule on the user\'s notes would make every update of an about file wait for a yes');
  // material the agent adds on its own: the skill points to a check that the named section holds
  assert.ok(skill.includes('Material you decide to add on your own passes the check in `HYPER-SECOND-BRAIN.md` → "What you may do and what you ask first"'));
  const section = rules.split('## What you may do and what you ask first')[1].split('\n## ')[0];
  assert.ok(section.includes('Material you decide to add on your own'), 'the rules file has no check for material the agent adds on its own');
});

test('hsb-re-organize explains every flag of its script and the mark that apply writes, and reports other platforms', () => {
  const skill = read('skills', 'hsb-re-organize', 'SKILL.md');
  const rows = read('skills', 'hsb-re-organize', 'references', 'reorganize.md').split('## Writing the rows')[1].split('\n## ')[0];
  const script = read('core', 'scripts', 'reorganize.mjs');
  const flags = /const FLAGS = \[([^\]]+)\]/.exec(script)[1].match(/'(\w+)'/g).map((f) => f.slice(1, -1));
  for (const f of flags) assert.ok(rows.includes(`\`${f}\` is a row`), `reorganize.md does not explain the flag ${f}`);
  // the script writes into the plan file: the skill says so (D24)
  assert.ok(script.includes('.applied = number') && skill.includes('"applied": "001"'), 'the skill does not name the mark that apply writes into the plan file');
  // the reorganizing replaces the report of the place skill: the reminders of other platforms stay in it
  const report = skill.split('9. **Report.**')[1].split('Done when')[0];
  assert.ok(read('skills', 'hsb-place-an-item', 'references', 'placement.md').includes('The reminders of other platforms') && report.includes('the reminders of other platforms'));
});

test('every numbered step of a SKILL.md ends with a "Done when" completion criterion', () => {
  for (const name of [...Object.keys(SKILLS), ...TEXT_SKILLS]) {
    const steps = (read('skills', name, 'SKILL.md').split('## Steps')[1] || '').split('\n## ')[0];
    const items = steps.split(/^(?=\d+\. \*\*)/m).filter((s) => /^\d+\. \*\*/.test(s));
    assert.ok(items.length >= 3, `${name}: no numbered steps`);
    for (const item of items) assert.match(item, /Done when /, `${name}: the step "${item.slice(0, 40)}" has no completion criterion`);
  }
});

test('every section of a reference that a skill names exists in that reference', () => {
  for (const name of [...Object.keys(SKILLS), ...TEXT_SKILLS]) {
    const files = ['SKILL.md', ...walk(path.join(ROOT, 'skills', name)).filter((f) => f.startsWith('references/'))];
    for (const f of files) {
      for (const m of read('skills', name, f).matchAll(/`(?:references\/)?([\w.-]+\.md)` → "([^"]+)"/g)) {
        const ref = path.join(ROOT, 'skills', name, 'references', m[1]);
        if (!fs.existsSync(ref)) continue; // the project's files and the sibling skill's files have tests of their own
        assert.ok(headings(fs.readFileSync(ref, 'utf8')).has(m[2]), `${name}/${f}: ${m[1]} has no section "${m[2]}"`);
      }
    }
  }
});

test('the first sentence of every description fits the command menus uncut', () => {
  for (const s of packageSkills()) {
    for (const c of Object.values(COMMANDS)) {
      assert.ok(!c.render(s.name, s.description, '.agents/skills').includes('..."'), `${s.name}: the ${c.dir} menu cuts the first sentence of the description at 160 characters`);
    }
  }
});

test('hsb-capture and the weekly review name the favorite problems note by the same lasting-choices line', () => {
  const list = read('skills', 'hsb-capture', 'references', 'favorite-problems.md');
  assert.ok(list.includes('`- Favorite problems note: <path in the vault>`') && list.includes('`- Favorite problems note: none`'));
  for (const text of [read('skills', 'hsb-capture', 'SKILL.md'), read('skills', 'hsb-review', 'references', 'weekly.md')]) assert.ok(text.includes('"Favorite problems note:"'));
});

test('the skills that read or write the "Where I left off" note name it by the same title', () => {
  const texts = [read('skills', 'hsb-create', 'references', 'focus.md'), read('skills', 'hsb-find', 'references', 'finding.md'), read('skills', 'hsb-projects', 'references', 'lifecycle.md')];
  for (const text of texts) assert.ok(text.includes('"Where I left off"'));
});

test('every item stays in the vault: another platform is only a reminder', () => {
  const placement = read('skills', 'hsb-place-an-item', 'references', 'placement.md');
  assert.ok(placement.includes('The vault holds every item the user hands over or asks to keep: route nothing to another app.'));
  assert.ok(!/its one home is that platform|is not kept in the vault/.test(placement + read('skills', 'hsb-capture', 'references', 'keeping.md')));
  assert.ok(read('skills', 'hsb-capture', 'references', 'keeping.md').includes('is kept in the vault whatever the four questions say'));
  const rules = read('core', 'templates', 'HYPER-SECOND-BRAIN.md.tmpl');
  assert.ok(rules.includes('Write a secret (a password, a card number, an access key) into a note only as the user handed it over or told it to you'));
  assert.ok(!rules.includes('not on another platform'));
});
