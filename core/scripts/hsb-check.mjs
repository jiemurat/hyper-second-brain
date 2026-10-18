#!/usr/bin/env node
/*
hsb-check.mjs - checks a project's hyper-second-brain setup and the state of its vault. Part of
hyper-second-brain: it runs from the skill folder and is not copied into the project. Node 18 or
newer, no dependencies.

Usage:
  node <skill>/scripts/hsb-check.mjs --root <project> [--json] [--fix] [--record-rules] [--today YYYY-MM-DD]

The check only reads. It prints names, counts and dates, never the text of a note. With --fix it repairs
the package's own files: a missing HYPER-SECOND-BRAIN.md, a missing pointer line, a missing PARA folder
from the map. A HYPER-SECOND-BRAIN.md that exists is the project's file and is never replaced. The manifest records
the template the rules file came from (rulesTemplate); --record-rules records the template of these skills once the
user has seen the differences and kept the file or taken the new text.
Exit codes: 0 no failure, 1 at least one failure is left, 2 usage, 3 hyper-second-brain is not set up,
4 the project is older than these skills (run hsb-update).
*/
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  FOLDER, MANIFEST, RULES_FILE, RULES_SECTIONS, CATEGORIES, START,
  exists, isDir, readText, posix, readManifest, planEntryFiles, appendBlock, insertSessionStartItem, pointerBlock, pointerLine, pointerFor,
  parseProjectMd, lastingNames, rulesText, rulesTemplateHash, skillVersion, compareVersions, daysBetween, localDay, walkFiles, render, STATE, readState, reviewStatus,
} from './hsb-lib.mjs';

const SKILL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function usage(message) {
  if (message) console.error(`hsb-check: ${message}`);
  console.error('usage: node <skill>/scripts/hsb-check.mjs --root <project> [--json] [--fix] [--record-rules] [--today YYYY-MM-DD]');
  process.exit(2);
}

const args = { root: null, json: false, fix: false, today: localDay() };
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--root') args.root = argv[++i];
  else if (a === '--json') args.json = true;
  else if (a === '--fix') args.fix = true;
  else if (a === '--record-rules') args.recordRules = true;
  else if (a === '--today') args.today = argv[++i];
  else if (a === '--help' || a === '-h') usage();
  else usage(`unknown argument ${a}`);
}
if (!args.root) usage('--root is required');
if (!/^\d{4}-\d{2}-\d{2}$/.test(args.today)) usage('--today takes YYYY-MM-DD');
const root = path.resolve(args.root);
if (!isDir(root)) usage(`no such folder: ${root}`);

const done = (result, code) => {
  if (args.json) console.log(JSON.stringify(result, null, 2));
  else {
    const c = result.counts || {};
    console.log(`hsb-check: ${result.status}${result.message ? `: ${result.message}` : ''}`);
    if (result.counts) console.log(`  ${c.ok} ok, ${c.fail} fail, ${c.warn} warn, ${c.info} info`);
    for (const f of result.findings || []) if (f.level !== 'ok') console.log(`  ${f.level.toUpperCase().padEnd(4)} ${f.id}: ${f.message}${f.fixable ? ` (fix: ${f.fixable})` : ''}`);
    for (const f of result.fixed || []) console.log(`  FIXED ${f}`);
    for (const l of result.lines || []) console.log(`  ${l}`);
  }
  process.exit(code);
};

const skillV = skillVersion(SKILL);
let manifest;
try {
  manifest = readManifest(root);
} catch (e) {
  done({ status: 'error', message: e.message, findings: [{ id: 'manifest', level: 'fail', message: e.message }] }, 1);
}
if (!manifest) done({ status: 'not-installed', message: 'there is no hyper-second-brain here; run hsb-init' }, 3);
if (compareVersions(manifest.version, skillV) < 0) {
  done({ status: 'outdated', version: manifest.version, skillVersion: skillV, message: `the project is at ${manifest.version}, these skills are at ${skillV}; run hsb-update` }, 4);
}

const hasCommand = (name) => spawnSync(process.platform === 'win32' ? 'where' : 'sh', process.platform === 'win32' ? [name] : ['-c', `command -v ${name}`], { encoding: 'utf8' }).status === 0;
// git may be missing: then every call answers "no" (status 1, no output)
const gitRun = (...a) => {
  const r = spawnSync('git', ['-C', root, ...a], { encoding: 'utf8' });
  return { status: r.status ?? 1, stdout: r.stdout || '' };
};

/** The vault path project.md names, or the default. */
const projectVault = () => {
  const f = path.join(root, FOLDER, 'project.md');
  return (exists(f) ? parseProjectMd(readText(f)).vault : null) || 'vault';
};

/** One pass over the project: the list of findings. */
function inspect() {
  const findings = [];
  const add = (id, level, message, extra = {}) => findings.push({ id, level, message, ...extra });
  const folderDir = path.join(root, FOLDER);

  add('manifest', 'ok', `${FOLDER}/${MANIFEST} is valid (version ${manifest.version})`);
  if (compareVersions(manifest.version, skillV) > 0) add('version', 'warn', `the project is at ${manifest.version}, newer than these skills (${skillV})`);

  // HYPER-SECOND-BRAIN.md: a file of the project; its presence, its sections, the skills it names, and the template it came from
  const rulesPath = path.join(root, RULES_FILE);
  if (!exists(rulesPath)) add('rules-file', 'fail', `${RULES_FILE} is missing from the project root`, { fixable: '--fix' });
  else {
    const text = readText(rulesPath);
    const headings = new Set(text.split(/\r?\n/).map((l) => /^##\s+(.+?)\s*$/.exec(l)?.[1]).filter(Boolean));
    const lacking = RULES_SECTIONS.filter((h) => !headings.has(h));
    const installed = new Set(fs.readdirSync(path.dirname(SKILL)).filter((n) => n.startsWith('hsb-')));
    const unknown = [...new Set([...text.matchAll(/\bhsb-[a-z0-9]+(?:-[a-z0-9]+)*\b(?!\.[a-z])/g)].map((m) => m[0]))].filter((n) => !installed.has(n));
    // an edit of the user's is fine while the file came from the template of these skills, or the user kept it after seeing the differences
    const current = text === rulesText(SKILL, projectVault()) || manifest.rulesTemplate === rulesTemplateHash(SKILL, projectVault());
    const template = current ? 'current' : manifest.rulesTemplate ? 'older' : 'unknown';
    const problems = [
      lacking.length ? `lacks the section(s): ${lacking.join(', ')}` : '',
      unknown.length ? `names skills that are not installed: ${unknown.join(', ')}` : '',
      current ? '' : `differs from the template of these skills${template === 'older' ? ' (it came from an older one)' : ' (the manifest does not record where it came from)'}; hsb-doctor shows the differences`,
    ].filter(Boolean);
    if (problems.length) add('rules-file', 'warn', `${RULES_FILE} ${problems.join('; ')}`, { data: { lacking: lacking.length, unknownSkills: unknown.length, template } });
    else add('rules-file', 'ok', `${RULES_FILE} is there with its sections, from the template of these skills`, { data: { lacking: 0, unknownSkills: 0, template } });
  }

  // project.md
  let project = null;
  const projectFile = path.join(folderDir, 'project.md');
  if (!exists(projectFile)) add('project.md', 'fail', `${FOLDER}/project.md is missing; ask the user, then rerun hsb-init after removing the manifest`);
  else {
    project = parseProjectMd(readText(projectFile));
    const missing = CATEGORIES.filter((c) => !project.folders[c]);
    if (!project.vault || missing.length) add('project.md', 'fail', `${FOLDER}/project.md lacks ${!project.vault ? 'the Vault line' : `the folder row for ${missing.join(', ')}`}`);
    else add('project.md', 'ok', 'project.md names the vault and all five folders');
  }

  const vaultRel = project?.vault || 'vault';
  const vaultDir = path.join(root, vaultRel);
  const vaultOk = isDir(vaultDir);
  if (project) {
    if (!vaultOk) add('vault', 'fail', `the vault folder ${vaultRel}/ does not exist`);
    else add('vault', 'ok', `the vault ${vaultRel}/ exists`);
  }

  // mapped folders
  if (project && vaultOk) {
    for (const c of CATEGORIES) {
      const name = project.folders[c];
      if (!name) continue;
      if (!isDir(path.join(vaultDir, name))) add(`folder:${c}`, 'fail', `${c} is mapped to ${vaultRel}/${name}, which does not exist`, { fixable: '--fix creates it empty' });
    }
    if (!findings.some((f) => f.id.startsWith('folder:'))) add('folders', 'ok', 'every mapped PARA folder exists');
    const defaults = CATEGORIES.map((c, i) => `${i} ${c}`);
    const differs = CATEGORIES.filter((c, i) => project.folders[c] && project.folders[c] !== defaults[i]);
    if (differs.length) {
      const pairs = differs.map((c) => `${c} is "${project.folders[c]}" (the package's default: "${defaults[CATEGORIES.indexOf(c)]}")`);
      add('naming', 'info', `the vault names some folders differently from the package's defaults: ${pairs.join(', ')}; they stay as they are, a folder is renamed only when the user asks`);
    }
    const mapped = new Set(Object.values(project.folders));
    const known = new Set(project.other);
    const fresh = fs.readdirSync(vaultDir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !e.name.startsWith('.') && !mapped.has(e.name) && !known.has(e.name)).map((e) => e.name).sort();
    if (fresh.length) add('top-level', 'info', `top-level folders not listed in project.md: ${fresh.join(', ')}`);
  }

  // pointer line in the instruction files
  const entry = planEntryFiles(root);
  const bad = entry.actions.filter((a) => ['create', 'block', 'list-item'].includes(a.kind));
  if (bad.length) for (const a of bad) add(`pointer:${a.file}`, 'fail', a.kind === 'create' ? 'there is no instruction file with the pointer line' : `${a.file} has no pointer line to ${RULES_FILE}`, { fixable: '--fix', kind: a.kind, file: a.file });
  else add('pointer', 'ok', 'every instruction file the agent reads leads to the rules file');
  const vaultForPointer = (project && project.vault) || 'vault';
  for (const [f, rec] of Object.entries(manifest.pointers || {})) {
    if (rec.source !== pointerLine(vaultForPointer)) add(`pointer-wording:${f}`, 'info', `the pointer line in ${f} was translated from an older English wording; hsb-update asks for a new translation`);
  }
  for (const f of ['AGENTS.md', 'CLAUDE.md']) {
    const file = path.join(root, f);
    if (exists(file) && readText(file).split(START).length > 2) add(`pointer-twice:${f}`, 'warn', `${f} holds the pointer block more than once`);
  }

  // project rules
  if (project) {
    const gone = [...new Set(project.rulePaths)].filter((p) => !exists(path.join(root, p)));
    const ownRules = ['AGENTS.md', 'CLAUDE.md', 'GEMINI.md', 'PAN-HARNESS.md'].filter((f) => {
      const file = path.join(root, f);
      if (!exists(file)) return false;
      const rest = readText(file).replace(/<!-- hyper-second-brain:start -->[\s\S]*?<!-- hyper-second-brain:end -->/g, '').replace(/^.*<!-- hsb -->.*$/gm, '');
      return rest.split('\n').filter((l) => l.trim() && !l.startsWith('#')).length > 3; // more than the stub the installer writes
    });
    if (gone.length) add('project-rules', 'fail', `project.md points to files that do not exist: ${gone.join(', ')}`);
    else if (!project.rulesRecorded && ownRules.length) add('project-rules', 'info', `${ownRules.join(', ')} hold rules, but the "Project rules" section of project.md records none`);
    else add('project-rules', 'ok', 'the paths in project.md lead to existing files');
  }

  // the harness of the project, when there is one
  const harnessCheck = path.join(root, 'pan-harness', 'scripts', 'pan-harness-check.mjs');
  if (exists(harnessCheck)) {
    const r = spawnSync(process.execPath, [harnessCheck, '--root', root], { encoding: 'utf8', timeout: 120000 });
    const last = (r.stdout || '').trim().split('\n').pop() || '';
    const errors = Number((/(\d+) error\(s\)/.exec(last) || [])[1] ?? 1);
    if (errors > 0) add('harness', 'fail', `the project's pan-harness check reports ${errors} error(s)`);
    else add('harness', 'ok', "the project's pan-harness check reports 0 errors");
  }

  // the tool files
  if (['.agents/skills', '.claude/skills'].some((d) => exists(path.join(root, d, '.hyper-second-brain.json')))) add('skills', 'ok', 'the hsb-* skills are installed in the project');
  else add('skills', 'info', 'the hsb-* skills are not installed here (they are tool files kept out of git): npx @jiemurat/hyper-second-brain@latest init');

  // ---- the vault: read-only -----------------------------------------------------------------
  const vault = {};
  if (project && vaultOk) {
    const files = walkFiles(vaultDir);
    const byType = {};
    for (const f of files) {
      const ext = path.extname(f).slice(1).toLowerCase() || '(none)';
      byType[ext] = (byType[ext] || 0) + 1;
    }
    vault.files = files.length;
    vault.byType = byType;
    const top = Object.entries(byType).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([e, n]) => `${e} ${n}`).join(', ');
    add('file-types', 'info', `${files.length} files in the vault: ${top}`, { data: byType });

    const needs = { pdf: ['pdftotext'], docx: ['pandoc', 'soffice'], doc: ['soffice'], xlsx: ['soffice'], xls: ['soffice'], pptx: ['soffice'] };
    const lacking = Object.entries(needs).filter(([ext, tools]) => byType[ext] && !tools.some(hasCommand)).map(([ext]) => `${ext} (${byType[ext]})`);
    if (lacking.length) add('readers', 'info', `no converter on PATH for ${lacking.join(', ')}; the agent may not be able to read their text`);

    const inboxName = project.folders.Inbox;
    if (inboxName && isDir(path.join(vaultDir, inboxName))) {
      const inbox = walkFiles(path.join(vaultDir, inboxName)).filter((f) => path.basename(f) !== '_about.md').length; // the folder's description is no item
      vault.inbox = inbox;
      add('inbox', 'ok', `the Inbox holds ${inbox} files`, { data: { inbox } });
    }

    // the folder description files: the category folders and the folders directly inside them
    const described = [];
    const withoutAbout = [];
    for (const c of CATEGORIES) {
      const name = project.folders[c];
      const base = name && path.join(vaultDir, name);
      if (!base || !isDir(base)) continue;
      const folders = [name, ...fs.readdirSync(base, { withFileTypes: true }).filter((e) => e.isDirectory() && !e.name.startsWith('.')).map((e) => `${name}/${e.name}`)];
      for (const d of folders) (exists(path.join(vaultDir, d, '_about.md')) ? described : withoutAbout).push(d);
    }
    vault.aboutFiles = described.length;
    add('about-files', withoutAbout.length ? 'info' : 'ok', `${described.length} of ${described.length + withoutAbout.length} category folders and folders directly inside them have an _about.md${withoutAbout.length ? `; without one: ${withoutAbout.slice(0, 8).join(', ')}${withoutAbout.length > 8 ? ', ...' : ''}` : ''}`, { data: { described: described.length, without: withoutAbout.length } });

    // the Project List names each project folder once (names and entry numbers only, never the text of an entry)
    const projectsName = project.folders.Projects;
    const projectsDir = projectsName && path.join(vaultDir, projectsName);
    if (projectsDir && isDir(projectsDir)) {
      const notProjects = lastingNames(project.lasting, 'Not projects'); // containers and umbrellas the user keeps off the list
      const projectFolders = fs.readdirSync(projectsDir, { withFileTypes: true }).filter((e) => e.isDirectory() && !e.name.startsWith('.') && !notProjects.includes(e.name)).map((e) => e.name);
      const listFile = path.join(projectsDir, 'Project List.md');
      if (exists(listFile)) {
        // an entry names the longest folder name it starts with, followed by anything but a letter or a digit
        const entries = readText(listFile).split(/\r?\n/).map((l) => /^\s*\d+[.)]\s+(?:\[\[|\*\*|`)?(.*)$/.exec(l)?.[1]).filter((e) => e !== undefined);
        const owner = (e) => projectFolders.filter((f) => e.startsWith(f) && !/[\p{L}\p{N}]/u.test(e[f.length] ?? '')).sort((a, b) => b.length - a.length)[0];
        const owners = entries.map(owner);
        const unlisted = projectFolders.filter((f) => !owners.includes(f));
        const orphans = owners.map((o, i) => (o ? null : i + 1)).filter(Boolean);
        const data = { entries: entries.length, folders: projectFolders.length, unlisted: unlisted.length, orphans: orphans.length };
        if (unlisted.length || orphans.length) {
          add('project-list', 'warn', `the Project List and the project folders differ: ${[unlisted.length ? `folders without an entry: ${unlisted.join(', ')}` : '', orphans.length ? `entries that name no folder: ${orphans.join(', ')}` : ''].filter(Boolean).join('; ')}`, { data });
        } else add('project-list', 'ok', `the Project List names each of the ${projectFolders.length} project folders`, { data });
      } else if (projectFolders.length) add('project-list', 'info', `${projectFolders.length} project folders and no Project List`, { data: { folders: projectFolders.length } });
    }

    // the weekly and monthly reviews: when each last ran (hyper-second-brain/state.json)
    let state = null;
    try {
      state = readState(root);
    } catch {
      add('reviews', 'warn', `${FOLDER}/${STATE} is damaged; show the user the file and ask before it is changed`);
    }
    if (state) {
      const reviews = reviewStatus(state, args.today);
      const due = Object.keys(reviews).filter((k) => reviews[k].due);
      const said = (k) => `the ${k} review ${reviews[k].last === null ? 'never ran' : `last ran ${reviews[k].days} days ago (${reviews[k].last})`}`;
      if (due.length) add('reviews', 'info', `${due.map(said).join('; ')}: due, hsb-review runs it`, { data: reviews });
      else add('reviews', 'ok', Object.keys(reviews).map(said).join('; '), { data: reviews });
    }

    // a way back from mistakes
    const inside = gitRun('rev-parse', '--is-inside-work-tree').stdout.trim() === 'true';
    if (inside) {
      const ignored = gitRun('check-ignore', '-q', vaultRel).status === 0;
      const tracked = gitRun('ls-files', '-z', '--', vaultRel).stdout.split('\0').filter(Boolean).length;
      const last = gitRun('log', '-1', '--format=%cs', '--', vaultRel).stdout.trim();
      const uncommitted = gitRun('status', '--porcelain', '--', vaultRel).stdout.split('\n').filter(Boolean).length;
      const data = { tracked, lastCommit: last || null, lastCommitDaysAgo: last ? daysBetween(last, args.today) : null, uncommitted };
      if (ignored) add('way-back', 'warn', `git ignores ${vaultRel}/, so git is no way back for the vault`, { data });
      else if (!tracked) add('way-back', 'warn', `git tracks no file of ${vaultRel}/ yet (${uncommitted} not committed)`, { data });
      else add('way-back', 'info', `git tracks ${tracked} files of ${vaultRel}/; last commit touching it: ${data.lastCommitDaysAgo} days ago; ${uncommitted} not committed`, { data });
    } else add('way-back', 'warn', 'no git here: make sure the vault has a way back from mistakes (a backup, or cloud sync with version history) before many files are moved');
  }
  return { findings, vault };
}

const fixed = [];
const manifestBefore = JSON.stringify(manifest); // the manifest is written back only when a repair changed it
function repair(findings) {
  for (const f of findings.filter((x) => x.level === 'fail')) {
    if (f.id === 'rules-file') {
      if (compareVersions(manifest.version, skillV) !== 0) continue;
      const projectFile = path.join(root, FOLDER, 'project.md');
      const vaultRel = (exists(projectFile) ? parseProjectMd(readText(projectFile)).vault : null) || 'vault';
      fs.writeFileSync(path.join(root, RULES_FILE), rulesText(SKILL, vaultRel));
      manifest.rulesTemplate = rulesTemplateHash(SKILL, vaultRel);
      fixed.push(`${RULES_FILE} written from the template`);
    } else if (f.id.startsWith('folder:')) {
      const project = parseProjectMd(readText(path.join(root, FOLDER, 'project.md')));
      const dir = path.join(root, project.vault, project.folders[f.id.slice('folder:'.length)]);
      fs.mkdirSync(dir, { recursive: true });
      fixed.push(`${posix(path.relative(root, dir))}/ created empty`);
    } else if (f.id.startsWith('pointer:')) {
      const vaultRel = (exists(path.join(root, FOLDER, 'project.md')) ? parseProjectMd(readText(path.join(root, FOLDER, 'project.md'))).vault : null) || 'vault';
      const file = path.join(root, f.file);
      const line = pointerFor(manifest, f.file, vaultRel); // a recorded translation, or the English line
      if (f.kind === 'create') {
        fs.writeFileSync(file, render(readText(path.join(SKILL, 'templates', 'AGENTS.md.tmpl')), { vault: vaultRel, block: pointerBlock(line) }));
      } else if (f.kind === 'list-item') fs.writeFileSync(file, insertSessionStartItem(readText(file), line) ?? appendBlock(readText(file), line));
      else fs.writeFileSync(file, appendBlock(readText(file), line));
      fixed.push(`${f.file}: pointer line added (${manifest.pointers?.[f.file] ? 'the recorded translation' : 'the English line'})`);
    }
  }
  if (JSON.stringify(manifest) !== manifestBefore) fs.writeFileSync(path.join(root, FOLDER, MANIFEST), `${JSON.stringify(manifest, null, 2)}\n`);
}

let result = inspect();
if (args.fix) {
  repair(result.findings);
  if (fixed.length) result = inspect();
}
if (args.recordRules && exists(path.join(root, RULES_FILE))) {
  manifest.rulesTemplate = rulesTemplateHash(SKILL, projectVault());
  fs.writeFileSync(path.join(root, FOLDER, MANIFEST), `${JSON.stringify(manifest, null, 2)}\n`);
  fixed.push(`${RULES_FILE} recorded as checked against the template of these skills`);
  result = inspect();
}
const count = (level) => result.findings.filter((f) => f.level === level).length;
const counts = { ok: count('ok'), fail: count('fail'), warn: count('warn'), info: count('info') };
done({
  status: counts.fail ? 'fail' : 'ok',
  version: manifest.version,
  skillVersion: skillV,
  today: args.today,
  counts,
  findings: result.findings,
  vault: result.vault,
  fixed,
}, counts.fail ? 1 : 0);
