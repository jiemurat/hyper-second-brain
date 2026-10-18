#!/usr/bin/env node
/*
hsb-find.mjs - searches the vault and lists what it holds on a subject, ranked by how much of the search an item
matches, never by its age. Part of hyper-second-brain: it runs from the skill folder and is not copied into the
project. Node 18 or newer, no dependencies. It only reads.

Usage:
  node <skill>/scripts/hsb-find.mjs search --root <project> --terms "<term>|<term>|..." [--in <folder>] [--limit N] [--today YYYY-MM-DD] [--json]

A term is a word or a phrase of two characters or more; "|" separates the terms. The search ignores letter case and
the form of the apostrophe (' ’ ‘ ʻ ʼ ` ´ match each other), so "o'rta" also finds "oʻrta". It reads the text of every
Markdown file and the name of every other file: a Word, Excel, or PDF file is found by its name only. It leaves out
hidden folders and the _about.md of each folder. --in limits the search to one folder of the vault, given as a path
relative to the vault (such as the Archives folder that project.md names).
A hit gives the path relative to the vault, the folder, the category (the PARA category of its top folder, or other),
the title (the first heading of a Markdown file, else the file name), the kind (note for a Markdown file, document for
any other file), the day the file last changed and its age in days, the terms it matches, and up to two matching lines
of a Markdown file. A line that seems to hold a secret (a password, a PIN, an access key) shows its label only, a
card number (13 to 19 digits) is masked, and the hit carries secret: true when any line of the file holds either. Hits come ranked: more terms matched first, then more
matches, a match in the title or the file name counting three times; --limit (default 20) caps them.
Exit codes: 0 done (with hits or none), 1 project.md or the vault cannot be read, 2 usage, 3 hyper-second-brain is
not set up.
*/
import fs from 'node:fs';
import path from 'node:path';
import { FOLDER, CATEGORIES, isDir, exists, readText, readManifest, parseProjectMd, localDay, daysBetween } from './hsb-lib.mjs';

const USAGE = 'usage: node <skill>/scripts/hsb-find.mjs search --root <project> --terms "<term>|<term>" [--in <folder>] [--limit N] [--today YYYY-MM-DD] [--json]';
const BIG = 4 * 1024 * 1024; // a Markdown file larger than this is searched by its name only

function usage(message) {
  if (message) console.error(`hsb-find: ${message}`);
  console.error(USAGE);
  process.exit(2);
}

const [command, ...argv] = process.argv.slice(2);
if (command !== 'search') usage(command ? `unknown command ${command}` : 'a command is required');
const args = { root: null, terms: null, in: null, limit: '20', today: localDay(), json: false };
const VALUED = { '--root': 'root', '--terms': 'terms', '--in': 'in', '--limit': 'limit', '--today': 'today' };
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--json') args.json = true;
  else if (VALUED[a]) {
    if (i + 1 >= argv.length) usage(`${a} needs a value`);
    args[VALUED[a]] = argv[++i];
  } else if (a === '--help' || a === '-h') usage();
  else usage(`unknown argument ${a}`);
}
if (!args.root) usage('--root is required');
if (!/^[1-9]\d*$/.test(args.limit)) usage('--limit takes a positive number');
if (!/^\d{4}-\d{2}-\d{2}$/.test(args.today)) usage('--today takes YYYY-MM-DD');

// the same text in every form: one apostrophe, lower case, composed characters
const APOSTROPHES = /[‘’ʻʼ`´′]/g;
const norm = (s) => s.normalize('NFC').replace(APOSTROPHES, "'").toLowerCase();
const terms = [...new Set((args.terms ?? '').split('|').map((t) => norm(t.trim())).filter(Boolean))];
if (!terms.length) usage('--terms needs at least one term');
if (terms.some((t) => t.length < 2)) usage('every term needs two characters or more');

const root = path.resolve(args.root);
if (!isDir(root)) usage(`no such folder: ${root}`);

const done = (result, code, lines = []) => {
  if (args.json) console.log(JSON.stringify(result, null, 2));
  else {
    console.log(`hsb-find: ${result.message}`);
    for (const l of lines) console.log(l);
  }
  process.exit(code);
};

let manifest;
try {
  manifest = readManifest(root);
} catch (e) {
  done({ status: 'error', message: e.message }, 1);
}
if (!manifest) done({ status: 'not-installed', message: 'there is no hyper-second-brain here; run hsb-init' }, 3);
const projectFile = path.join(root, FOLDER, 'project.md');
if (!exists(projectFile)) done({ status: 'error', message: `${FOLDER}/project.md is missing; run hsb-doctor` }, 1);
const project = parseProjectMd(readText(projectFile));
if (!project.vault) done({ status: 'error', message: `${FOLDER}/project.md lacks the Vault line; run hsb-doctor` }, 1);
const vaultDir = path.resolve(root, project.vault);
if (!isDir(vaultDir)) done({ status: 'error', message: `the vault folder ${project.vault}/ does not exist; run hsb-doctor` }, 1);

let scope = vaultDir;
if (args.in) {
  scope = path.resolve(vaultDir, args.in);
  const rel = path.relative(vaultDir, scope);
  if (rel.startsWith('..') || path.isAbsolute(rel) || !isDir(scope)) usage(`--in ${args.in} is no folder of the vault`);
}

const posix = (p) => p.split(path.sep).join('/');
const categoryOf = Object.fromEntries(CATEGORIES.filter((c) => project.folders[c]).map((c) => [project.folders[c], c]));
const SECRET = /\b(password|passwd|passcode|parol|pin|pin-?kod|token|secret|api[ _-]?key|access[ _-]?key|kalit)\b\s*[:=]/i;
const CARD = /\b(?:\d[ -]?){12,18}\d\b/; // a card or account number: 13 to 19 digits, spaces or hyphens between
const hideSecret = (line) => (SECRET.test(line) ? line.replace(/([:=]).*$/, '$1 [hidden]') : line.replace(new RegExp(CARD.source, 'g'), '[hidden number]'));
const count = (text, term) => {
  let n = 0;
  for (let i = text.indexOf(term); i >= 0; i = text.indexOf(term, i + term.length)) n++;
  return n;
};

const hits = [];
const searched = { notes: 0, documents: 0 };
const walk = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.') || e.isSymbolicLink()) continue;
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) walk(abs);
    else if (e.isFile() && e.name !== '_about.md') look(abs, e.name);
  }
};
function look(abs, name) {
  const rel = posix(path.relative(vaultDir, abs));
  const st = fs.statSync(abs);
  const markdown = /\.md$/i.test(name) && st.size <= BIG;
  const kind = /\.md$/i.test(name) ? 'note' : 'document';
  searched[kind === 'note' ? 'notes' : 'documents']++;
  const base = name.replace(/\.[^.]+$/, '');
  const text = markdown ? readText(abs) : '';
  const title = (markdown && /^#\s+(.+?)\s*$/m.exec(text)?.[1]) || base;
  const ntext = norm(text);
  const nname = norm(`${base} ${title === base ? '' : title}`);
  let score = 0;
  const matched = [];
  for (const t of terms) {
    const n = count(ntext, t) + 3 * count(nname, t);
    if (n) {
      matched.push(t);
      score += n;
    }
  }
  if (!matched.length) return;
  const lines = markdown ? text.split(/\r?\n/) : [];
  const shown = lines.filter((l) => matched.some((t) => norm(l).includes(t)) && !/^#\s/.test(l)).slice(0, 2).map((l) => hideSecret(l.trim()).slice(0, 160));
  const day = localDay(new Date(st.mtimeMs));
  const top = rel.split('/')[0];
  hits.push({
    path: rel,
    folder: posix(path.dirname(rel)),
    category: rel.includes('/') ? categoryOf[top] ?? 'other' : 'other',
    title,
    kind,
    changed: day,
    ageDays: daysBetween(day, args.today),
    terms: matched,
    lines: shown,
    secret: lines.some((l) => SECRET.test(l) || CARD.test(l)),
    score,
  });
}
walk(scope);
hits.sort((a, b) => b.terms.length - a.terms.length || b.score - a.score || (a.path < b.path ? -1 : 1));
const shownHits = hits.slice(0, Number(args.limit));
const where = args.in ? `${project.vault}/${posix(path.relative(vaultDir, scope))}/` : `${project.vault}/`;
const message = hits.length
  ? `${hits.length} hit(s) for ${terms.join(' | ')} in ${where} (searched ${searched.notes} Markdown files and ${searched.documents} other files by name)${hits.length > shownHits.length ? `; the first ${shownHits.length} follow` : ''}`
  : `nothing in ${where} matches ${terms.join(' | ')} (searched ${searched.notes} Markdown files and ${searched.documents} other files by name)`;
const out = shownHits.flatMap((h, i) => [
  `${i + 1}. ${h.title} | ${h.folder}/ | ${h.category}, ${h.kind}, changed ${h.changed} (${h.ageDays} days ago) | terms: ${h.terms.join(', ')}${h.secret ? ' | holds a secret: quote nothing from it' : ''}`,
  ...h.lines.map((l) => `   > ${l}`),
]);
done({ status: 'ok', terms, in: args.in ?? null, searched, total: hits.length, hits: shownHits, message }, 0, out);
