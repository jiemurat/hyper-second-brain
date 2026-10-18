#!/usr/bin/env node
/*
scaffold.mjs - installs hyper-second-brain into a project for hsb-init. Part of hyper-second-brain:
it runs from the skill folder and is not copied into the project. Node 18 or newer, no dependencies.

Usage:
  node <skill>/scripts/scaffold.mjs --root <project> [--vault vault] [--plan] [--json]
                                    [--create-vault] [--map Category=Folder ...] [--pointer-text File=Line ...]

It writes HYPER-SECOND-BRAIN.md (the general rules of the package) into the project root, writes
<project>/hyper-second-brain/project.md (the vault path, the PARA folder map, the other top-level
folders) and .manifest.json, creates the vault and the PARA folders that are missing, and adds the
pointer line to the agent's instruction files. A file that is already there stays as it is. It never
renames or deletes anything, and it leaves the text of existing instruction files as it is.

--plan            print what would happen and write nothing
--json            print the result as JSON
--create-vault    create the vault folder although the project root itself looks like a vault
--map C=Folder    use this existing folder of the vault for the category C (Inbox, Projects, Areas,
                  Resources, Archives); needed when two folders compete for one category
--pointer-text F=L  write the pointer line L into the instruction file F (AGENTS.md or CLAUDE.md) instead of
                  the English line: the agent translates the line into the language of that file. L must be
                  one line that names HYPER-SECOND-BRAIN.md
Exit codes: 0 done (or planned), 2 usage, 3 already installed, 4 the root looks like a vault (ask the
user), 5 two folders compete for a category (ask the user).
*/
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  FOLDER, MANIFEST, RULES_FILE, CATEGORIES,
  exists, isDir, readText, posix, pointerBlock, pointerLine, pointerTextProblem,
  detectPara, styleOf, newName, DEFAULT_STYLE, planEntryFiles, appendBlock, insertSessionStartItem, render, readManifest, rulesText, rulesTemplateHash,
} from './hsb-lib.mjs';

const SKILL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function usage(message) {
  if (message) console.error(`scaffold: ${message}`);
  console.error('usage: node <skill>/scripts/scaffold.mjs --root <project> [--vault vault] [--plan] [--json] [--create-vault] [--map Category=Folder ...]');
  process.exit(2);
}

const args = { root: null, vault: 'vault', plan: false, json: false, createVault: false, map: {}, pointerText: {} };
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--root') args.root = argv[++i];
  else if (a === '--vault') args.vault = argv[++i];
  else if (a === '--plan') args.plan = true;
  else if (a === '--json') args.json = true;
  else if (a === '--create-vault') args.createVault = true;
  else if (a === '--map') {
    const m = /^(\w+)=(.+)$/.exec(argv[++i] || '');
    if (!m || !CATEGORIES.includes(m[1])) usage(`--map takes Category=Folder with Category one of ${CATEGORIES.join(', ')}`);
    args.map[m[1]] = m[2];
  } else if (a === '--pointer-text') {
    const m = /^(AGENTS\.md|CLAUDE\.md)=(.*)$/s.exec(argv[++i] || '');
    if (!m) usage('--pointer-text takes AGENTS.md=Line or CLAUDE.md=Line');
    const problem = pointerTextProblem(m[2]);
    if (problem) usage(`--pointer-text ${m[1]}: ${problem}`);
    args.pointerText[m[1]] = m[2];
  } else if (a === '--help' || a === '-h') usage();
  else usage(`unknown argument ${a}`);
}
if (!args.root) usage('--root is required');
const root = path.resolve(args.root);
if (!isDir(root)) usage(`no such folder: ${root}`);
const vaultRel = posix(path.normalize(args.vault)).replace(/\/+$/, '');
if (!vaultRel || vaultRel.startsWith('..') || path.isAbsolute(args.vault)) usage('--vault must be a folder inside the project');
const vaultDir = path.join(root, vaultRel);

function finish(result, code = 0) {
  if (args.json) console.log(JSON.stringify(result, null, 2));
  else {
    console.log(`${result.status}: ${result.message || ''}`.trim());
    for (const line of result.lines || []) console.log(`  ${line}`);
  }
  process.exit(code);
}

const version = (/^\s*version:\s*"([^"]+)"/m.exec(readText(path.join(SKILL, 'SKILL.md'))) || [])[1];

// 1. already installed?
let manifest;
try {
  manifest = readManifest(root);
} catch (e) {
  finish({ status: 'error', message: e.message }, 6);
}
if (manifest) {
  finish({ status: 'already-installed', version: manifest.version, message: `hyper-second-brain ${manifest.version} is already set up here; run hsb-doctor (or hsb-update when the versions differ)` }, 3);
}

// 2. the vault: found, to create, or a question for the user
const vaultExists = isDir(vaultDir);
if (!vaultExists) {
  const rootPara = isDir(root) ? detectPara(root) : { found: {} };
  const rootLooksLikeVault = isDir(path.join(root, '.obsidian'))
    || CATEGORIES.filter((c) => rootPara.found[c]?.length).length >= 2;
  if (rootLooksLikeVault && !args.createVault) {
    finish({ status: 'ask-vault', message: `there is no ${vaultRel}/ folder, but the project root itself looks like a vault; ask the user where the vault is, then rerun with --vault <folder> or --create-vault` }, 4);
  }
}

// 3. the PARA folders
const para = vaultExists ? detectPara(vaultDir) : { found: Object.fromEntries(CATEGORIES.map((c) => [c, []])), other: [] };
for (const [category, folder] of Object.entries(args.map)) {
  if (!vaultExists || !isDir(path.join(vaultDir, folder))) usage(`--map ${category}=${folder}: no such folder in ${vaultRel}/`);
  para.found[category] = [folder];
}
const competing = CATEGORIES.filter((c) => para.found[c].length > 1);
if (competing.length) {
  finish({
    status: 'ask-para',
    message: `two or more folders compete for ${competing.join(', ')}; ask the user which one is meant, then rerun with --map Category=Folder`,
    candidates: Object.fromEntries(competing.map((c) => [c, para.found[c]])),
  }, 5);
}
const chosen = Object.fromEntries(CATEGORIES.map((c) => [c, para.found[c][0] || null]));
const style = Object.values(chosen).some(Boolean) ? styleOf(Object.values(chosen).filter(Boolean)) : DEFAULT_STYLE;
const mapping = Object.fromEntries(CATEGORIES.map((c) => [c, chosen[c]
  ? { folder: chosen[c], create: false } : { folder: newName(c, style), create: true }]));
const mapped = new Set(Object.values(mapping).map((m) => m.folder));
const other = vaultExists
  ? fs.readdirSync(vaultDir, { withFileTypes: true }).filter((e) => e.isDirectory() && !e.name.startsWith('.') && !mapped.has(e.name)).map((e) => e.name).sort()
  : [];

// instruction files the user keeps in the vault (the vault folder, the mapped PARA folders and the other top-level folders)
const instructionFiles = [];
if (vaultExists) {
  const folders = ['', ...Object.values(mapping).filter((m) => !m.create).map((m) => m.folder), ...other];
  for (const f of folders) {
    for (const name of ['AGENTS.md', 'CLAUDE.md', 'GEMINI.md']) {
      if (exists(path.join(vaultDir, f, name))) instructionFiles.push(posix(path.join(vaultRel, f, name)));
    }
  }
}

// 4. the instruction files of the project
const entry = planEntryFiles(root);

// 5. git facts for the report
// git may be missing: then every call answers "no" (status 1, no output)
const gitRun = (...a) => {
  const r = spawnSync('git', ['-C', root, ...a], { encoding: 'utf8' });
  return { status: r.status ?? 1, stdout: r.stdout || '' };
};
const insideGit = gitRun('rev-parse', '--is-inside-work-tree').stdout.trim() === 'true';
const git = {
  inside: insideGit,
  top: insideGit ? path.resolve(gitRun('rev-parse', '--show-toplevel').stdout.trim()) : null,
  vaultIgnored: insideGit && vaultExists ? gitRun('check-ignore', '-q', vaultRel).status === 0 : false,
};

// 6. the package's own files: the rules file in the root, the folder for project.md and the manifest
const targetDir = path.join(root, FOLDER);
const rulesFile = path.join(root, RULES_FILE);
const rulesExists = exists(rulesFile);
const projectMdExists = exists(path.join(targetDir, 'project.md'));

// what each kind of action does to an instruction file: [in the plan, once done]
const ENTRY_TEXT = {
  create: ['a new file; it holds the pointer line in a marked block', 'created; it holds the pointer line in a marked block'],
  block: ['the pointer line is added in a marked block at the end of the file', 'the pointer line was added in a marked block at the end of the file'],
  'list-item': ['the pointer line is added as the last numbered item of "Session start", ending with the marker <!-- hsb -->', 'the pointer line was added as the last numbered item of "Session start", ending with the marker <!-- hsb -->'],
  present: ['already has the pointer line; nothing to add', 'already had the pointer line; nothing was added'],
  imports: ['imports AGENTS.md, which gets the pointer line; nothing to add here', 'imports AGENTS.md; nothing was added here'],
};

const describe = (applied = false) => [
  `vault   ${vaultRel}/ ${vaultExists ? '(found)' : applied ? '(created)' : '(to create)'}`,
  ...Object.entries(mapping).map(([c, m]) => `map     ${c} -> ${m.folder}${m.create ? (applied ? ' (created)' : ' (to create)') : ''}`),
  ...(other.length ? other.map((o) => `outside PARA: ${o}`) : ['outside PARA: none']),
  ...(instructionFiles.length ? instructionFiles.map((f) => `instruction file in the vault: ${f} (stays as it is; it gets no pointer line)`) : ['instruction files in the vault: none']),
  `package ${[[RULES_FILE, rulesExists], [`${FOLDER}/project.md`, projectMdExists], [`${FOLDER}/${MANIFEST}`, false]]
    .map(([f, there]) => (there ? `keep ${f} (already there; it stays as it is)` : `create ${f}`)).join(', ')}`,
  ...entry.actions.map((a) => `entry   ${a.file}: ${a.kind} - ${ENTRY_TEXT[a.kind][applied ? 1 : 0]}`),
  ...(applied ? [] : [`pointer line (default): ${pointerLine(vaultRel)}`]),
  `git     ${git.inside ? `inside ${git.top}${git.vaultIgnored ? ' (the vault is ignored)' : ''}` : 'not a git repository'}`,
];

const plan = {
  status: args.plan ? 'plan' : 'done',
  version,
  root,
  vault: { path: vaultRel, create: !vaultExists },
  mapping,
  other,
  instructionFiles,
  entry,
  git,
  rulesFile: { path: RULES_FILE, exists: rulesExists },
  pointerLine: pointerLine(vaultRel),
};
if (args.plan) {
  plan.message = 'nothing was written';
  plan.lines = describe();
  finish(plan);
}

// ---- apply ---------------------------------------------------------------------------------
const created = [];
const kept = [];
const mk = (dir) => {
  if (!isDir(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    created.push(`${posix(path.relative(root, dir))}/`);
  }
};
mk(vaultDir);
for (const m of Object.values(mapping)) if (m.create) mk(path.join(vaultDir, m.folder));

mk(targetDir);
if (rulesExists) kept.push(RULES_FILE);
else {
  fs.writeFileSync(rulesFile, rulesText(SKILL, vaultRel));
  created.push(RULES_FILE);
}

const listOrNone = (items, fmt) => (items.length ? items.map(fmt).join('\n') : 'None.');
const projectMd = path.join(targetDir, 'project.md');
if (exists(projectMd)) kept.push(`${FOLDER}/project.md`);
else {
  fs.writeFileSync(projectMd, render(readText(path.join(SKILL, 'templates', 'project.md.tmpl')), {
    vault: vaultRel,
    inbox: mapping.Inbox.folder,
    projects: mapping.Projects.folder,
    areas: mapping.Areas.folder,
    resources: mapping.Resources.folder,
    archives: mapping.Archives.folder,
    other: listOrNone(other, (o) => `- \`${o}\``),
    instruction_files: listOrNone(instructionFiles, (f) => `- \`${f}\``),
  }));
  created.push(`${FOLDER}/project.md`);
}

const entryResult = {};
const pointers = {}; // the lines written in another language than the default, with the default they were made from
for (const action of entry.actions) {
  const file = path.join(root, action.file);
  const custom = ['create', 'block', 'list-item'].includes(action.kind) ? args.pointerText[action.file] : undefined;
  const line = custom ?? pointerLine(vaultRel);
  if (action.kind === 'create') {
    fs.writeFileSync(file, render(readText(path.join(SKILL, 'templates', 'AGENTS.md.tmpl')), { vault: vaultRel, block: pointerBlock(line) }));
    created.push(action.file);
  } else if (action.kind === 'block') {
    fs.writeFileSync(file, appendBlock(readText(file), line));
  } else if (action.kind === 'list-item') {
    const next = insertSessionStartItem(readText(file), line);
    fs.writeFileSync(file, next ?? appendBlock(readText(file), line));
  }
  if (custom) pointers[action.file] = { text: custom, source: pointerLine(vaultRel) };
  entryResult[action.file] = action.kind;
}
for (const f of Object.keys(args.pointerText)) {
  if (!['create', 'block', 'list-item'].includes(entryResult[f])) {
    // a pointer text for a file that gets no pointer: say so, nothing was written for it
    plan.notes = [...(plan.notes || []), `--pointer-text ${f} was not used: ${f} gets no pointer line`];
  }
}

fs.writeFileSync(path.join(targetDir, MANIFEST), `${JSON.stringify({ package: '@jiemurat/hyper-second-brain', version, entryFiles: entryResult, ...(Object.keys(pointers).length ? { pointers } : {}), ...(rulesExists ? {} : { rulesTemplate: rulesTemplateHash(SKILL, vaultRel) }) }, null, 2)}\n`);
created.push(`${FOLDER}/${MANIFEST}`);

// the instruction files that existed before and now carry the pointer line, and the line each one got
const changedEntry = entry.actions.filter((a) => ['block', 'list-item'].includes(a.kind)).map((a) => a.file);
const written = Object.fromEntries(entry.actions.filter((a) => ['create', 'block', 'list-item'].includes(a.kind))
  .map((a) => [a.file, args.pointerText[a.file] ?? pointerLine(vaultRel)]));
plan.created = created;
plan.changed = changedEntry;
plan.kept = kept;
plan.pointerLines = written;
plan.message = `${created.length} created, ${changedEntry.length} changed, ${kept.length} kept`;
plan.lines = [
  ...created.map((c) => `created ${c}`),
  ...changedEntry.map((f) => `changed ${f}: the pointer line was added`),
  ...kept.map((k) => `kept    ${k}`),
  ...describe(true).filter((l) => !l.startsWith('vault ')),
  ...Object.entries(written).map(([f, l]) => `pointer line written in ${f}${args.pointerText[f] ? '' : ' (the English default)'}: ${l}`),
];
finish(plan);
