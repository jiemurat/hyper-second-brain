#!/usr/bin/env node
/*
update.mjs - brings a project's hyper-second-brain files up to the version of these skills, for hsb-update.
Part of hyper-second-brain: it runs from the skill folder and is not copied into the project. Node 18
or newer, no dependencies.

Usage:
  node <skill>/scripts/update.mjs --root <project> [--plan] [--json] [--pointer-text File=Line ...]

It runs the migration steps of every version after the project's own (migrations.mjs; the
`mechanical` ones), refreshes the wording of the pointer line, and writes the new version into the
manifest. A pointer line that was written in another language (the manifest records it) is left as it
is, unless the English wording it came from has changed: then the plan says `translate`, and the agent
gives the new translation with --pointer-text File=Line. HYPER-SECOND-BRAIN.md, project.md and the
vault are never touched.
Exit codes: 0 done (or already current), 1 a migration step failed, 2 usage, 3 not set up,
4 the project is newer than these skills.
*/
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  FOLDER, MANIFEST, exists, isDir, readText, readManifest, parseProjectMd,
  skillVersion, compareVersions, refreshPointerText, planMigrations, runMigrations, pointerLine, pointerTextProblem,
} from './hsb-lib.mjs';
import { MIGRATIONS } from './migrations.mjs';

const SKILL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function usage(message) {
  if (message) console.error(`update: ${message}`);
  console.error('usage: node <skill>/scripts/update.mjs --root <project> [--plan] [--json] [--pointer-text File=Line ...]');
  process.exit(2);
}

const args = { root: null, plan: false, json: false, pointerText: {} };
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--root') args.root = argv[++i];
  else if (a === '--plan') args.plan = true;
  else if (a === '--json') args.json = true;
  else if (a === '--pointer-text') {
    const m = /^(AGENTS\.md|CLAUDE\.md)=(.*)$/s.exec(argv[++i] || '');
    if (!m) usage('--pointer-text takes AGENTS.md=Line or CLAUDE.md=Line');
    const problem = pointerTextProblem(m[2]);
    if (problem) usage(`--pointer-text ${m[1]}: ${problem}`);
    args.pointerText[m[1]] = m[2];
  }
  else if (a === '--help' || a === '-h') usage();
  else usage(`unknown argument ${a}`);
}
if (!args.root) usage('--root is required');
const root = path.resolve(args.root);
if (!isDir(root)) usage(`no such folder: ${root}`);

const finish = (result, code = 0) => {
  if (args.json) console.log(JSON.stringify(result, null, 2));
  else {
    console.log(`${result.status}${result.message ? `: ${result.message}` : ''}`);
    for (const l of result.lines || []) console.log(`  ${l}`);
  }
  process.exit(code);
};

let manifest;
try {
  manifest = readManifest(root);
} catch (e) {
  finish({ status: 'error', message: e.message }, 1);
}
if (!manifest) finish({ status: 'not-installed', message: 'there is no hyper-second-brain here; run hsb-init' }, 3);

const to = skillVersion(SKILL);
const from = manifest.version;
if (compareVersions(from, to) > 0) {
  finish({ status: 'project-newer', from, to, message: `the project is at ${from}, newer than these skills (${to}); update the skills first: npx @jiemurat/hyper-second-brain@latest update` }, 4);
}

const folderDir = path.join(root, FOLDER);

const projectMd = path.join(folderDir, 'project.md');
const vaultRel = (exists(projectMd) ? parseProjectMd(readText(projectMd)).vault : null) || 'vault';

// which instruction files carry the pointer in an older wording
const defaultLine = pointerLine(vaultRel);
const pointers = {};
const pointerLines = {};
const translate = [];
for (const [file, kind] of Object.entries(manifest.entryFiles || {})) {
  if (!['create', 'block', 'list-item'].includes(kind)) continue;
  const f = path.join(root, file);
  if (!exists(f)) continue;
  const text = readText(f);
  const recorded = manifest.pointers?.[file];
  const given = args.pointerText[file];
  pointerLines[file] = given ?? recorded?.text ?? defaultLine;
  if (given) pointers[file] = 'refresh';
  else if (recorded && recorded.source !== defaultLine) {
    pointers[file] = 'translate';
    translate.push({ file, english: defaultLine, current: recorded.text });
  } else pointers[file] = refreshPointerText(text, pointerLines[file]) === text ? 'current' : 'refresh';
}

const steps = planMigrations(MIGRATIONS, from, to);
const needsWork = from !== to || Object.values(pointers).some((a) => a === 'refresh' || a === 'translate');

const result = {
  status: !needsWork ? 'current' : args.plan ? 'plan' : 'done',
  from,
  to,
  pointers,
  translate,
  migrations: steps.map(({ version, id, kind, description }) => ({ version, id, kind, description })),
};

if (!needsWork || args.plan) {
  result.message = !needsWork ? 'nothing to update' : `nothing was written; ${from} -> ${to}`;
  result.lines = [
    ...Object.entries(pointers).filter(([, a]) => a === 'refresh').map(([f]) => `pointer ${f}: refresh the wording`),
    ...translate.map((t) => `pointer ${t.file}: translate the new English wording, then rerun with --pointer-text ${t.file}=<line>: ${t.english}`),
    ...steps.map((m) => `migration ${m.version} ${m.id} (${m.kind})`),
  ];
  finish(result);
}

// ---- apply ----------------------------------------------------------------------------------
const writeManifest = () => fs.writeFileSync(path.join(folderDir, MANIFEST), `${JSON.stringify(manifest, null, 2)}\n`);
let ran;
try {
  ran = await runMigrations({ root, folder: folderDir, manifest }, steps, (version) => {
    manifest.version = version;
    writeManifest();
  });
} catch (e) {
  finish({ ...result, status: 'error', message: `a migration step failed: ${e.message}; the project stays at ${manifest.version}, rerun after fixing it` }, 1);
}

const changed = [];
for (const [file, action] of Object.entries(pointers)) {
  if (action !== 'refresh') continue;
  const f = path.join(root, file);
  fs.writeFileSync(f, refreshPointerText(readText(f), pointerLines[file]));
  if (args.pointerText[file]) manifest.pointers = { ...(manifest.pointers || {}), [file]: { text: args.pointerText[file], source: defaultLine } };
  changed.push(`${file}: pointer line refreshed`);
}
manifest.version = to;
writeManifest();

result.migrationsDone = ran.done;
result.structural = ran.structural;
result.byHand = ran.byHand;
result.changed = changed;
result.message = `${from} -> ${to}: ${changed.length} file(s) changed`;
result.lines = [
  ...changed,
  ...ran.done.map((d) => `migration done: ${d}`),
  ...ran.structural.map((s) => `structural step for the user: ${s.version} ${s.id}`),
  ...ran.byHand.map((s) => `by-hand step: ${s.version} ${s.id}`),
  ...translate.map((t) => `pointer in ${t.file} waits for a translation of: ${t.english}`),
];
finish(result);
