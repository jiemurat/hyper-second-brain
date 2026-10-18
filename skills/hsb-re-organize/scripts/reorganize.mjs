#!/usr/bin/env node
/*
reorganize.mjs - the mechanical part of hsb-re-organize: it scans the vault, checks and numbers the plan of
changes, applies chosen rows of the plan (moves, new and removed empty folders, merges) with the links repaired,
verifies the result, and takes the last batch back. hsb-review runs it to archive the whole Inbox, hsb-restart to
archive the whole vault before a fresh start. Part of
hyper-second-brain: it runs from the skill folder and is not copied into the project. Node 18 or newer, no
dependencies.

Usage:
  node <skill>/scripts/reorganize.mjs scan   --root <project> [--work <dir>] [--json]
  node <skill>/scripts/reorganize.mjs cards  --root <project> [--compact] [--folder <path>] [--from N] [--count N] [--json]
  node <skill>/scripts/reorganize.mjs inbox  --root <project> [--name <folder>] [--reason <text>] [--today YYYY-MM-DD] [--json]
  node <skill>/scripts/reorganize.mjs restart --root <project> [--name <folder>] [--reason <text>] [--today YYYY-MM-DD] [--json]
  node <skill>/scripts/reorganize.mjs plan   --root <project> [--plan <file>] [--from N] [--count N] [--expand N] [--allow-emoji] [--json]
  node <skill>/scripts/reorganize.mjs apply  --root <project> --rows <1-30,33|all> [--plan <file>] [--backup-confirmed] [--allow-emoji] [--json]
  node <skill>/scripts/reorganize.mjs verify --root <project> [--json]
  node <skill>/scripts/reorganize.mjs undo   --root <project> [--json]
  node <skill>/scripts/reorganize.mjs finish --root <project>

The work folder (cards, plan, journal, saved copies of edited notes) is a temporary folder outside the project and
the vault, one for each skill that runs the script; --work names another one. Nothing is written into the vault
except the changes of an applied plan.
inbox scans the vault as scan does and writes the plan that archives the whole Inbox: a folder in Archives named
--name (by default the Inbox folder's name without its leading number, then today's date), created unless it
exists, and one move row for each file and folder directly in the Inbox, the folder's _about.md left in place;
--reason is the reason the rows give. It refuses while a batch of the work folder has not been taken back or
finished, and when the destination already holds an item of the same name.
restart scans the vault as scan does and writes the plan that archives the vault for a fresh start: a new folder in Archives
named --name (by default "Archive " and today's date), one folder in it for each of the Inbox, Projects, Areas and Resources
folders that holds something, named as that folder, and one move row for each file and folder directly in them; it leaves in
place the _about.md of each folder, the note "Project List.md" in Projects, hidden files and folders, the Archives folder's
own contents, and everything outside the five category folders. It refuses while a batch of the work folder has not been taken
back or finished, and when the folder --name names already exists.
The plan is a JSON file (default <work>/plan.json): an array of rows {op, kind, from, to, reason, flag}, paths relative
to the vault. op is move (a rename is a move to another name), mkdir (uses "to"), merge (the contents of the folder
"from" go into the existing folder "to", then "from" is removed), rmdir (an empty folder), write (kind about: "to" is the
path of an _about.md and "text" its whole new content, a create or an update) or rmfile (kind about: "from" is the path of an
_about.md to remove). kind is note, document, folder or about. flag is ok, doubt, ask or skip; a row flagged ask waits for the user's answer and a row
flagged skip was declined: neither is ever applied. The script numbers the rows in file order. apply writes "applied": "<batch>"
into each row it applied, plan and apply pass over such rows, and undo takes the mark back, so the numbers stay the same from one
round to the next. apply also keeps the hashes of the _about.md files its batch changed, so that the next plan does not take them
for the user's edits.
The cards print the opening text of notes (--compact leaves it out, except for an _about.md, and takes 200 cards a batch;
--folder takes the cards of one folder and its subfolders); hashes cover files up to 64 MB, larger files are compared by size and time.
Exit codes: 0 done, 1 needs attention (the plan has errors, a row was refused, the check found a problem), 2 usage,
3 hyper-second-brain is not set up here, 4 the project is older than these skills, 5 hsb-place-an-item is not
installed next to this skill, 6 the vault has no way back from a mistake.
*/
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  FOLDER, CATEGORIES, PLACE_SKILL,
  exists, isDir, readText, readManifest, parseProjectMd, skillVersion, compareVersions, localDay, obsidianRoot, lastingNames,
} from './hsb-lib.mjs';

const SKILL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BIG = 64 * 1024 * 1024;
const MARKER = '.hsb-reorganize';
const OPS = ['move', 'mkdir', 'merge', 'rmdir', 'write', 'rmfile'];
const KINDS = ['note', 'document', 'folder', 'about'];
const ABOUT = '_about.md'; // the file that describes the folder it sits in
const ABOUT_MAX_LINES = 40;
const ABOUT_MIN_SECTIONS = 6;
const FLAGS = ['ok', 'doubt', 'ask', 'skip'];

// ---- command line ------------------------------------------------------------------------------

const COMMANDS = ['scan', 'cards', 'inbox', 'restart', 'plan', 'apply', 'verify', 'undo', 'finish'];
const VALUED = ['--root', '--work', '--from', '--count', '--folder', '--plan', '--rows', '--expand', '--name', '--reason', '--today'];
const BOOLEAN = ['--json', '--backup-confirmed', '--allow-emoji', '--compact'];

function usage(message) {
  if (message) console.error(`reorganize: ${message}`);
  console.error(`usage: node <skill>/scripts/reorganize.mjs <${COMMANDS.join('|')}> --root <project> [options]`);
  process.exit(2);
}

const argv = process.argv.slice(2);
const command = argv[0];
if (!COMMANDS.includes(command)) usage(command ? `unknown command ${command}` : 'a command is required');
const args = {};
for (let i = 1; i < argv.length; i++) {
  const a = argv[i];
  if (VALUED.includes(a)) {
    if (argv[i + 1] === undefined) usage(`${a} needs a value`);
    args[a.slice(2)] = argv[++i];
  } else if (BOOLEAN.includes(a)) args[a.slice(2)] = true;
  else usage(`unknown argument ${a}`);
}
if (!args.root) usage('--root is required');
for (const k of ['from', 'count', 'expand']) {
  if (args[k] !== undefined && !/^[1-9]\d*$/.test(args[k])) usage(`--${k} takes a positive number`);
}
if (args.today !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(args.today)) usage('--today takes YYYY-MM-DD');
const root = path.resolve(args.root);
if (!isDir(root)) usage(`no such folder: ${root}`);

const out = (value, text) => {
  console.log(args.json ? JSON.stringify(value, null, 2) : text);
};
function done(code, value, text) {
  out(value, text);
  process.exit(code);
}
const stop = (code, message) => done(code, { status: 'stopped', code, message }, `reorganize: ${message}`);

// ---- the project and the vault -------------------------------------------------------------------

const posix = path.posix;
const isAbout = (p) => posix.basename(p) === ABOUT;
const lt = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const sha256 = (data) => crypto.createHash('sha256').update(data).digest('hex');
// each skill that runs the script keeps its own work folder: an Inbox archive never meets an unfinished reorganization
const WORK_PREFIX = path.basename(SKILL) === 'hsb-re-organize' ? 'hsb-reorganize' : path.basename(SKILL);
const defaultWork = () => path.resolve(args.work || path.join(os.tmpdir(), `${WORK_PREFIX}-${sha256(root).slice(0, 10)}`));

function setup() {
  let manifest;
  try {
    manifest = readManifest(root);
  } catch (e) {
    stop(1, e.message);
  }
  if (!manifest) stop(3, 'there is no hyper-second-brain here; run hsb-init');
  const skillV = skillVersion(SKILL);
  if (compareVersions(manifest.version, skillV) < 0) stop(4, `the project is at ${manifest.version}, these skills are at ${skillV}; run hsb-update`);
  if (!exists(path.join(SKILL, '..', PLACE_SKILL, 'SKILL.md'))) stop(5, `the ${PLACE_SKILL} skill is not installed next to this skill; reinstall the skills with the npm tool`);
  const projectFile = path.join(root, FOLDER, 'project.md');
  if (!exists(projectFile)) stop(1, `${FOLDER}/project.md is missing; run hsb-doctor`);
  const project = parseProjectMd(readText(projectFile));
  const missing = CATEGORIES.filter((c) => !project.folders[c]);
  if (!project.vault || missing.length) stop(1, `${FOLDER}/project.md lacks ${!project.vault ? 'the Vault line' : `the folder row for ${missing.join(', ')}`}; run hsb-doctor`);
  const vaultDir = path.resolve(root, project.vault);
  if (!isDir(vaultDir)) stop(1, `the vault folder ${project.vault}/ does not exist; run hsb-doctor`);
  for (const c of CATEGORIES) if (!isDir(path.join(vaultDir, project.folders[c]))) stop(1, `${c} is mapped to ${project.vault}/${project.folders[c]}, which does not exist; run hsb-doctor`);
  return { manifest, project, vaultRel: project.vault, vaultDir, folders: project.folders, ob: obsidianRoot(root, vaultDir), work: defaultWork() };
}
const ctx = command === 'finish' ? null : setup();

/** The files and folders of the vault (hidden ones and symbolic links left out), paths relative to the vault with '/'. */
function listVault(vaultDir) {
  const files = [];
  const dirs = [];
  const rec = (rel) => {
    for (const e of fs.readdirSync(path.join(vaultDir, rel), { withFileTypes: true })) {
      if (e.name.startsWith('.') || e.isSymbolicLink()) continue;
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) {
        dirs.push(r);
        rec(r);
      } else if (e.isFile()) {
        const st = fs.statSync(path.join(vaultDir, r));
        files.push({ rel: r, size: st.size, mtimeMs: st.mtimeMs });
      }
    }
  };
  rec('');
  files.sort((a, b) => lt(a.rel, b.rel));
  dirs.sort(lt);
  return { files, dirs };
}

const dayOf = (ms) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** A hash of the whole file up to 64 MB; a larger file is stood for by its size and time. */
function fingerprint(abs, st) {
  if (st.size > BIG) return `big:${st.size}:${Math.floor(st.mtimeMs)}`;
  return sha256(fs.readFileSync(abs));
}

const isMd = (p) => p.toLowerCase().endsWith('.md');
const topOf = (rel) => rel.split('/')[0];
const nameBad = (name) => /[<>:"\\|?*]/.test(name) || /\p{Extended_Pictographic}/u.test(name);

function categoryOf(rel, folders, isFileAtRoot = false) {
  const top = topOf(rel);
  const c = CATEGORIES.find((k) => folders[k] === top);
  if (c) return c;
  return isFileAtRoot ? 'root' : 'outside';
}

// ---- links ---------------------------------------------------------------------------------------

/** The text with fenced code blocks and code spans blanked (same length), so that links in code are not links. */
function maskCode(text) {
  const blank = (m) => m.replace(/[^\n]/g, ' ');
  return text.replace(/^(```|~~~)[^\n]*\n[\s\S]*?\n\1[^\n]*$/gm, blank).replace(/`[^`\n]*`/g, blank);
}

const WIKI = /(!?)\[\[([^\]\n|#]*)(#[^\]\n|]*)?(\|[^\]\n]*)?\]\]/g;
const MDLINK = /(!?)\[([^\]\n]*)\]\((<[^>\n]*>|[^)\s]*)((?:\s+"[^"\n]*")?)\s*\)/g;

/** Every link in a note: {kind, start, end, raw, target}; for a wiki link the span is the target, for a Markdown link the destination. */
function findLinks(text) {
  const masked = maskCode(text);
  const found = [];
  for (const m of masked.matchAll(WIKI)) {
    if (!m[2].trim()) continue;
    const start = m.index + m[1].length + 2;
    found.push({ kind: 'wiki', start, end: start + m[2].length, raw: m[2], target: m[2], text: m[0] });
  }
  for (const m of masked.matchAll(MDLINK)) {
    const start = m.index + m[0].indexOf('](') + 2;
    const raw = m[3];
    const inner = raw.startsWith('<') ? raw.slice(1, -1) : raw;
    if (!inner || inner.startsWith('#') || inner.startsWith('//') || /^[a-z][a-z0-9+.-]*:/i.test(inner)) continue;
    found.push({ kind: 'md', start, end: start + raw.length, raw, target: inner, text: m[0] });
  }
  return found;
}

// names compare without letter case and in composed Unicode: macOS may store a name decomposed while links are composed
const fold = (s) => s.normalize('NFC').toLowerCase();

/** The files of the vault for resolving links; prefix is the vault's path inside the Obsidian vault ('' when they are one folder). */
function buildIndex(paths, prefix = ctx?.ob.prefix || '') {
  const names = new Map();
  const add = (k, p) => {
    const a = names.get(k);
    if (a) a.push(p);
    else names.set(k, [p]);
  };
  for (const p of paths) {
    const base = fold(posix.basename(p));
    add(base, p);
    if (base.endsWith('.md')) add(base.slice(0, -3), p);
  }
  return { set: new Set(paths), list: paths, lower: new Map(paths.map((p) => [p, fold(p)])), byNfc: new Map(paths.map((p) => [p.normalize('NFC'), p])), names, prefix };
}

/** The file a [[wiki link]] means: {path, ambiguous}, or null. A name matches a file name or a Markdown note's name. */
function resolveWiki(index, target) {
  const t = fold(target.trim().replace(/\\/g, '/').replace(/^\/+/, ''));
  if (!t) return null;
  let hits;
  const pre = fold(index.prefix);
  if (pre && t.startsWith(`${pre}/`)) { // a full path from the Obsidian vault root, a folder above the vault
    const rest = t.slice(pre.length + 1);
    hits = index.list.filter((p) => index.lower.get(p) === rest || index.lower.get(p) === `${rest}.md`);
    if (hits.length) return { path: hits.sort(lt)[0], ambiguous: hits.length > 1, full: true };
  }
  if (t.includes('/')) hits = index.list.filter((p) => { const lp = index.lower.get(p); return lp === t || lp === `${t}.md` || lp.endsWith(`/${t}`) || lp.endsWith(`/${t}.md`); });
  else hits = [...new Set(index.names.get(t) || [])];
  if (!hits.length) return null;
  hits.sort((a, b) => a.split('/').length - b.split('/').length || lt(a, b));
  return { path: hits[0], ambiguous: hits.length > 1 };
}

const decode = (s) => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};

/** The file a Markdown link points to, from the note at `source`, or null. */
function resolveMd(index, source, target) {
  let t = decode(target.split(/[#?]/)[0]);
  if (!t) return null;
  if (t.startsWith('/') && index.prefix && t.startsWith(`/${index.prefix}/`)) t = t.slice(index.prefix.length + 1); // from the Obsidian vault root
  t = t.startsWith('/') ? posix.normalize(t.slice(1)) : posix.normalize(posix.join(posix.dirname(source), t));
  if (t.startsWith('..') || t === '.') return null;
  return index.byNfc.get(t.normalize('NFC')) ?? index.byNfc.get(`${t}.md`.normalize('NFC')) ?? null;
}

/** The shortest [[target]] that names `p` and nothing else in the index, in the style of the old one. */
function wikiTargetFor(index, p, withExt) {
  const segs = p.split('/');
  for (let k = 1; k <= segs.length; k++) {
    let cand = segs.slice(-k).join('/');
    if (isMd(p) && !withExt) cand = cand.replace(/\.md$/i, '');
    const r = resolveWiki(index, cand);
    if (r && r.path === p && !r.ambiguous) return cand;
  }
  return isMd(p) && !withExt ? p.replace(/\.md$/i, '') : p;
}

/** Whether the text of a wiki link names the path p with its exact letters (a name, a path's end, or the full path). */
function spells(text, p, full, withExt) {
  const want = (full ? `${ctx.ob.prefix}/` : '') + (withExt || !isMd(p) ? p : p.replace(/\.md$/i, ''));
  const t = text.trim().replace(/\\/g, '/').replace(/^\/+/, '').normalize('NFC');
  const w = want.normalize('NFC');
  return w === t || w.endsWith(`/${t}`);
}

/** The full path of p from the Obsidian vault root, for a link written in that form. */
const fullTarget = (p, withExt) => `${ctx.ob.prefix}/${withExt || !isMd(p) ? p : p.replace(/\.md$/i, '')}`;

/** The destination text of a Markdown link to `target` (vault-relative) from the note at `source`, in the style of the old one. */
function mdDestFor(oldRaw, source, target, prefix = '') {
  const angle = oldRaw.startsWith('<');
  const inner = angle ? oldRaw.slice(1, -1) : oldRaw;
  const frag = (/[#?].*$/.exec(inner) || [''])[0];
  const pathPart = inner.slice(0, inner.length - frag.length);
  const fromObsidian = prefix && decode(pathPart).startsWith(`/${prefix}/`);
  let rel = pathPart.startsWith('/') ? `/${fromObsidian ? `${prefix}/` : ''}${target}` : posix.relative(posix.dirname(source), target);
  if (!pathPart.startsWith('/') && pathPart.startsWith('./') && !rel.startsWith('.')) rel = `./${rel}`;
  if (!/\.[A-Za-z0-9]+$/.test(decode(pathPart)) && isMd(rel)) rel = rel.replace(/\.md$/i, '');
  const encoded = pathPart.includes('%');
  const text = encoded ? rel.split('/').map(encodeURIComponent).join('/') : rel;
  const full = text + frag;
  return angle || (!encoded && /\s/.test(full)) ? `<${full}>` : full;
}

/**
 * The links of the notes in `files` (vault-relative paths whose text is read through `read`), resolved against
 * `index` as if each note stood at `where(file)`. Returns the resolved pairs and the unresolved links.
 */
function linkTable(files, read, index, where = (f) => f) {
  const pairs = [];
  const unresolved = [];
  for (const f of files) {
    if (!isMd(f)) continue;
    const text = read(f);
    if (text === null) continue;
    for (const l of findLinks(text)) {
      const r = l.kind === 'wiki' ? resolveWiki(index, l.target)?.path : resolveMd(index, where(f), l.target);
      if (r) pairs.push({ file: f, link: l, target: r, ambiguous: l.kind === 'wiki' && resolveWiki(index, l.target).ambiguous });
      else unresolved.push({ file: f, text: l.text });
    }
  }
  return { pairs, unresolved };
}

// ---- the vault facts: cards and signs ---------------------------------------------------------------

function noteFacts(text) {
  let body = text;
  if (body.startsWith('---')) {
    const m = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/.exec(body);
    if (m) body = body.slice(m[0].length);
  }
  const h = /^#{1,6}[ \t]+(.+?)\s*$/m.exec(body);
  return { title: h ? h[1] : null, head: body.replace(/\s+/g, ' ').trim().slice(0, 300) };
}

/** The name the letter-case rule gives a first-level folder of a category: a project in capitals, an area with a capital first letter, a resource in lowercase. */
function caseName(category, name) {
  if (category === 'Projects') return name.toUpperCase();
  if (category === 'Resources') return name.toLowerCase();
  const base = name === name.toUpperCase() ? name.toLowerCase() : name; // an area in capitals would read as a project
  return base.replace(/\p{L}/u, (ch) => ch.toUpperCase());
}

/**
 * The files outside the notes that may name a folder by its path, as [project-relative path, text]: Obsidian's settings
 * (with the plugins' data), the notes of the templates folders, and the instruction files.
 */
function configTexts(c) {
  const files = new Set();
  const rec = (dir, keep) => {
    if (!isDir(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, e.name);
      if (e.isDirectory() && e.name !== 'node_modules') rec(abs, keep);
      else if (e.isFile() && keep(e.name) && fs.statSync(abs).size <= 4 * 1024 * 1024) files.add(abs);
    }
  };
  if (c.ob.found) rec(path.join(c.ob.found, '.obsidian'), (n) => n.endsWith('.json'));
  for (const t of c.ob.templates) rec(path.join(c.vaultDir, t), isMd);
  for (const f of ['AGENTS.md', 'CLAUDE.md', 'GEMINI.md', ...c.project.instructionFiles]) if (exists(path.join(root, f))) files.add(path.join(root, f));
  return [...files].map((abs) => [path.relative(root, abs).split(path.sep).join('/'), fs.readFileSync(abs, 'utf8').normalize('NFC')]).sort((a, b) => lt(a[0], b[0]));
}

/** For each vault-relative folder path, the files of configTexts that write it with its exact letters. */
function pathMentions(c, rels) {
  if (!rels.length) return new Map();
  const texts = configTexts(c);
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new Map(rels.map((rel) => {
    const re = new RegExp(`${esc(rel.normalize('NFC'))}(?![\\p{L}\\p{N}])`, 'u');
    return [rel, texts.filter(([, t]) => re.test(t)).map(([f]) => f)];
  }));
}

// a copy counter is "(2)", not a year in a title such as "(1999)"
const VAGUE = /^(untitled|new (note|file|document|folder)|note\s*\d*|scan\s*\d+|img[_ -]?\d+|image\s*\d*|document\s*\d*|\d+|.*\bcopy( \d+)?|.*\(\d{1,2}\))$/i;

function scanVault(c) {
  const { files, dirs } = listVault(c.vaultDir);
  const index = buildIndex(files.map((f) => f.rel));
  const textOf = (rel) => {
    const abs = path.join(c.vaultDir, rel);
    return fs.readFileSync(abs, 'utf8');
  };
  const notes = files.filter((f) => isMd(f.rel)).map((f) => f.rel);
  const aboutPaths = files.filter((f) => isAbout(f.rel)).map((f) => f.rel);
  const aboutHashes = Object.fromEntries(aboutPaths.map((a) => [a, sha256(fs.readFileSync(path.join(c.vaultDir, a)))]));
  const { pairs, unresolved } = linkTable(notes, textOf, index);
  const inbound = new Map();
  const outbound = new Map();
  for (const p of pairs) {
    inbound.set(p.target, (inbound.get(p.target) || 0) + 1);
    outbound.set(p.file, (outbound.get(p.file) || 0) + 1);
  }
  // duplicates: same size, then same content; a note with no text after its properties, and a copy of a template, repeat by design
  const ignoreNames = new Set(lastingNames(c.project.lasting, 'Ignore names').map((n) => fold(n)));
  const inTemplates = (rel) => c.ob.templates.some((t) => rel === t || rel.startsWith(`${t}/`));
  const emptyNote = (rel) => isMd(rel) && !textOf(rel).replace(/^---\r?\n[\s\S]*?\r?\n---(\r?\n|$)/, '').trim();
  const bySize = new Map();
  for (const f of files) if (f.size > 0 && !isAbout(f.rel)) bySize.set(f.size, [...(bySize.get(f.size) || []), f]);
  const dupOf = new Map();
  let groups = 0;
  const dupGroups = [];
  for (const same of bySize.values()) {
    if (same.length < 2) continue;
    const byHash = new Map();
    for (const f of same) {
      const h = fingerprint(path.join(c.vaultDir, f.rel), { size: f.size, mtimeMs: f.mtimeMs });
      byHash.set(h, [...(byHash.get(h) || []), f.rel]);
    }
    for (const g of byHash.values()) {
      if (g.length < 2 || g.some(inTemplates) || emptyNote(g[0]) || g.every((p) => ignoreNames.has(fold(posix.basename(p))))) continue;
      groups++;
      for (const p of g) dupOf.set(p, `d${groups}`);
      dupGroups.push(g);
    }
  }
  const fileCount = new Map(dirs.map((d) => [d, 0]));
  const dirCount = new Map(dirs.map((d) => [d, 0]));
  for (const f of files) if (!isAbout(f.rel)) for (let d = posix.dirname(f.rel); d !== '.'; d = posix.dirname(d)) fileCount.set(d, fileCount.get(d) + 1);
  for (const d of dirs) for (let p = posix.dirname(d); p !== '.'; p = posix.dirname(p)) dirCount.set(p, dirCount.get(p) + 1);

  const entries = [];
  let id = 0;
  const all = [...dirs.map((d) => ({ dir: true, rel: d })), ...files.map((f) => ({ dir: false, rel: f.rel, f }))].sort((a, b) => lt(a.rel, b.rel));
  for (const e of all) {
    id++;
    if (e.dir) {
      entries.push({ id, type: 'dir', path: e.rel, files: fileCount.get(e.rel), dirs: dirCount.get(e.rel), category: categoryOf(e.rel, c.folders), about: aboutPaths.includes(`${e.rel}/${ABOUT}`) });
      continue;
    }
    const card = {
      id, type: 'file', path: e.rel, ext: posix.extname(e.rel).slice(1).toLowerCase(), size: e.f.size, date: dayOf(e.f.mtimeMs),
      category: categoryOf(e.rel, c.folders, !e.rel.includes('/')),
      in: inbound.get(e.rel) || 0, out: outbound.get(e.rel) || 0,
    };
    if (dupOf.has(e.rel)) card.dup = dupOf.get(e.rel);
    if (isMd(e.rel)) Object.assign(card, noteFacts(textOf(e.rel)));
    if (isAbout(e.rel)) {
      const text = textOf(e.rel);
      Object.assign(card, { about: true, lines: text.replace(/\n+$/, '').split('\n').length, head: text.replace(/\r?\n/g, ' \u23ce ').trim().slice(0, 2400) });
    }
    entries.push(card);
  }

  // signs the names and the layout show; the judgement signs (area or resource, a project's material elsewhere) are the agent's
  const signs = [];
  const sign = (kind, message, items) => {
    if (items.length) signs.push({ id: kind, message, items });
  };
  const rootNames = new Set(CATEGORIES.map((k) => c.folders[k]));
  const known = new Set(c.project.other.map((o) => o.replace(/\/+$/, '')));
  sign('outside-para', 'top-level folders outside the five PARA folders (the user decides how to treat the ones project.md lists)',
    dirs.filter((d) => !d.includes('/') && !rootNames.has(d)).map((d) => `${d} (${fileCount.get(d)} files${known.has(d) ? ', listed in project.md' : ''})`));
  sign('root-file', 'files lying loose at the top of the vault', files.filter((f) => !f.rel.includes('/')).map((f) => f.rel));
  const loose = ['Projects', 'Areas', 'Resources'].map((k) => c.folders[k]);
  sign('loose-in-category', 'files lying directly in the Projects, Areas, or Resources folder instead of in the folder of what they serve',
    files.filter((f) => !isAbout(f.rel) && loose.includes(posix.dirname(f.rel)) && !(posix.dirname(f.rel) === c.folders.Projects && /^project list\.md$/i.test(posix.basename(f.rel)))).map((f) => f.rel));
  sign('empty-folder', 'folders with no file in them or under them (an _about.md alone does not count as a file)',
    dirs.filter((d) => fileCount.get(d) === 0 && !rootNames.has(d) && (posix.dirname(d) === '.' || rootNames.has(posix.dirname(d)) || fileCount.get(posix.dirname(d)) > 0)));
  sign('duplicate', 'files with identical content', dupGroups.map((g) => g.join(' = ')));
  // a name in three or more folders, and a name the user listed, repeats by design (the plan refuses a move that would overwrite)
  const byName = new Map();
  for (const f of files) if (!isAbout(f.rel) && f.size > 0 && !ignoreNames.has(fold(posix.basename(f.rel))) && !emptyNote(f.rel)) byName.set(fold(posix.basename(f.rel)), [...(byName.get(fold(posix.basename(f.rel))) || []), f.rel]);
  sign('same-name', 'files with the same name in two folders and different content (a move between them would overwrite)',
    [...byName.values()].filter((g) => g.length === 2 && g.some((p) => dupOf.get(p) !== dupOf.get(g[0]) || !dupOf.has(p))).map((g) => g.join(' / ')));
  sign('vague-name', 'notes with a missing or vague name', files.filter((f) => isMd(f.rel) && VAGUE.test(posix.basename(f.rel, '.md'))).map((f) => f.rel));
  sign('bad-name', 'names with an emoji or a character that file systems reserve', [...dirs, ...files.map((f) => f.rel)].filter((p) => nameBad(posix.basename(p))));
  const keepNames = c.project.lasting.some((l) => /^Folder names:\s*keep as they are/i.test(l));
  if (!keepNames) {
    const wrong = ['Projects', 'Areas', 'Resources'].flatMap((k) => dirs.filter((d) => posix.dirname(d) === c.folders[k]).map((d) => [d, caseName(k, posix.basename(d))]))
      .filter(([d, want]) => want !== posix.basename(d));
    const named = pathMentions(c, wrong.map(([d]) => d)); // a tool that writes to the old path would make a second folder
    sign('name-case', 'first-level folders of Projects, Areas, or Resources whose names break the letter-case rule, with the name the rule gives (and the settings, templates, or instruction files that write the old path)',
      wrong.map(([d, want]) => `${d} -> ${want}${named.get(d).length ? ` (its path is written in: ${named.get(d).join(', ')})` : ''}`));
  }
  sign('deep-folder', 'folders four or more levels below a PARA folder',
    dirs.filter((d) => d.split('/').length >= 5 && rootNames.has(topOf(d))));
  const plRel = files.map((f) => f.rel).find((p) => posix.dirname(p) === c.folders.Projects && /^project list\.md$/i.test(posix.basename(p)));
  if (plRel) {
    const listed = [...textOf(plRel).matchAll(/^\s*\d+\.\s+(.+?)\s+by\s+.+?\s+\(Goal:/gm)].map((m) => m[1].trim());
    const notProjects = lastingNames(c.project.lasting, 'Not projects');
    const folderNames = dirs.filter((d) => posix.dirname(d) === c.folders.Projects).map((d) => posix.basename(d)).filter((n) => !notProjects.includes(n));
    sign('project-list', 'the Project List and the folders in Projects disagree',
      [...folderNames.filter((n) => !listed.includes(n)).map((n) => `folder without an entry: ${n}`), ...listed.filter((n) => !folderNames.includes(n)).map((n) => `entry without a folder: ${n}`)]);
  }
  sign('unresolved-link', 'links that point to nothing (they stay as they are)', unresolved.map((u) => `${u.file}: ${u.text}`));
  sign('ambiguous-link', 'links by a name that two files share (they stay as they are)', pairs.filter((p) => p.ambiguous).map((p) => `${p.file}: ${p.link.text}`));
  const inboxFiles = files.filter((f) => topOf(f.rel) === c.folders.Inbox).length;
  if (inboxFiles >= 50) sign('inbox-size', 'the Inbox holds 50 or more files', [`${inboxFiles} files`]);
  return { entries, signs, aboutHashes, counts: { files: files.length, notes: notes.length - aboutPaths.length, documents: files.length - notes.length, aboutFiles: aboutPaths.length, folders: dirs.length, unresolvedLinks: unresolved.length }, listing: { files, dirs } };
}

function ensureWork(c) {
  fs.mkdirSync(c.work, { recursive: true });
  fs.writeFileSync(path.join(c.work, MARKER), 'work folder of hsb-re-organize; safe to delete\n');
}
const workFile = (c, name) => path.join(c.work, name);
const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const writeJson = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 1));

/** The vault paths that the batches of this run, not taken back, have changed (old and new places, edited notes). */
function touchedByBatches(c) {
  const touched = new Set();
  const dir = path.join(c.work, 'batches');
  if (!exists(dir)) return touched;
  for (const name of fs.readdirSync(dir).filter((n) => /^\d+$/.test(n))) {
    const journal = readJson(path.join(dir, name, 'journal.json'));
    if (journal.undone) continue;
    const map = readJson(path.join(dir, name, 'map.json'));
    const back = new Map(Object.entries(map).map(([o, f]) => [f, o]));
    for (const [o, f] of Object.entries(map)) if (o !== f) {
      touched.add(o);
      touched.add(f);
    }
    for (const p of [...Object.keys(journal.written || {}), ...(journal.createdFinal || []), ...(journal.removedOrigins || [])]) touched.add(p);
    for (const e of journal.edits) {
      touched.add(e.path);
      if (back.has(e.path)) touched.add(back.get(e.path));
    }
  }
  return touched;
}

function wayBack(c) {
  const git = (...a) => {
    const r = spawnSync('git', ['-C', root, ...a], { encoding: 'utf8' });
    return { status: r.status ?? 1, stdout: r.stdout || '' };
  };
  if (git('rev-parse', '--is-inside-work-tree').status !== 0) return { state: 'no-git', detail: 'the project is not a git repository (or git is not installed)' };
  if (git('rev-parse', '--verify', 'HEAD').status !== 0) return { state: 'no-commit', detail: 'the repository has no commit yet' };
  if (git('check-ignore', '-q', c.vaultRel).status === 0) return { state: 'ignored', detail: `git ignores ${c.vaultRel}/, so it is no way back` };
  // -z and quotepath=off give the paths as they are (git quotes a name in another script otherwise); a rename gives two paths
  const raw = git('-c', 'core.quotepath=off', 'status', '--porcelain', '-z', '-uall', '--', c.vaultRel).stdout.split('\0').filter(Boolean);
  const dirty = [];
  for (let i = 0; i < raw.length; i++) {
    dirty.push(raw[i].slice(3).normalize('NFC'));
    if (/^[RC]/.test(raw[i]) && i + 1 < raw.length) dirty.push(raw[++i].normalize('NFC'));
  }
  if (!dirty.length) return { state: 'clean', detail: `${c.vaultRel}/ is committed in git` };
  const top = git('rev-parse', '--show-toplevel').stdout.trim();
  const prefix = top ? path.relative(fs.realpathSync.native(top), fs.realpathSync.native(c.vaultDir)).split(path.sep).join('/') : c.vaultRel;
  const touched = new Set([...touchedByBatches(c)].map((p) => p.normalize('NFC')));
  const mine = dirty.filter((p) => touched.has(prefix && p.startsWith(`${prefix}/`) ? p.slice(prefix.length + 1) : p));
  if (touched.size && mine.length === dirty.length) return { state: 'journal', detail: `${dirty.length} uncommitted change(s) in ${c.vaultRel}/, all made by earlier batches of this run; undo can take them back` };
  return { state: 'dirty', detail: `${dirty.length - mine.length} uncommitted change(s) in ${c.vaultRel}/ that no batch of this run made; commit them first` };
}

// ---- scan and cards --------------------------------------------------------------------------------

const cardLine = (e) => {
  if (e.type === 'dir') return `${e.id} D ${e.path}/ | ${e.files} files, ${e.dirs} folders | ${e.category} | ${ABOUT}: ${e.about ? 'yes' : 'no'}`;
  const size = e.size >= 1048576 ? `${(e.size / 1048576).toFixed(1)}M` : e.size >= 1024 ? `${(e.size / 1024).toFixed(1)}K` : `${e.size}B`;
  const facts = [`${e.ext || 'no ext'}`, size, e.date, e.category, `in ${e.in}`, `out ${e.out}`];
  if (e.dup) facts.push(`dup ${e.dup}`);
  let line = `${e.id} F ${e.path} | ${facts.join(', ')}`;
  if (e.about) return `${line} | folder description, ${e.lines} lines | ${e.head}`;
  if (e.title !== undefined) line += ` | ${e.title === null ? 'no heading (the file name is its title)' : `heading: ${e.title}`}${e.head === undefined ? '' : ` | ${e.head}`}`;
  return line;
};

/** Scans the vault into the work folder's cards, the base that apply checks every row against. */
function writeCards(c) {
  const s = scanVault(c);
  ensureWork(c);
  const back = wayBack(c);
  writeJson(workFile(c, 'cards.json'), { root, vault: c.vaultRel, entries: s.entries, signs: s.signs, counts: s.counts, wayBack: back, aboutHashes: s.aboutHashes });
  return { s, back };
}

if (command === 'scan') {
  const { s, back } = writeCards(ctx);
  const result = { status: 'scanned', work: ctx.work, plan: workFile(ctx, 'plan.json'), counts: s.counts, wayBack: back, cards: s.entries.length, signs: s.signs };
  const lines = [
    `reorganize: scanned ${ctx.vaultRel}/ - ${s.counts.files} files (${s.counts.notes} notes, ${s.counts.documents} other, ${s.counts.aboutFiles} ${ABOUT}), ${s.counts.folders} folders, ${s.counts.unresolvedLinks} unresolved links`,
    `  way back: ${back.state} - ${back.detail}`,
    `  work folder: ${ctx.work}`,
    `  write the plan to: ${workFile(ctx, 'plan.json')}`,
    `  ${s.entries.length} cards; read them with: cards --from 1 --count 50`,
  ];
  for (const g of s.signs) {
    lines.push(`  sign ${g.id} (${g.items.length}): ${g.message}`);
    for (const it of g.items.slice(0, 12)) lines.push(`    - ${it}`);
    if (g.items.length > 12) lines.push(`    - ... and ${g.items.length - 12} more (all in ${workFile(ctx, 'cards.json')})`);
  }
  done(0, result, lines.join('\n'));
}

if (command === 'cards') {
  const file = workFile(ctx, 'cards.json');
  if (!exists(file)) stop(1, 'there are no cards yet; run scan first');
  const data = readJson(file);
  // --compact leaves out the opening text of notes (an _about.md keeps its text); --folder takes the cards of one folder
  let entries = data.entries;
  if (args.folder !== undefined) {
    const f = String(args.folder).replace(/\/+$/, '');
    entries = entries.filter((e) => e.path === f || e.path.startsWith(`${f}/`));
    if (!entries.length) stop(1, `no card has the path ${f}; the folder paths are on the D cards`);
  }
  if (args.compact) entries = entries.map(({ head, ...rest }) => (rest.about ? { head, ...rest } : rest));
  const from = Number(args.from || 1);
  const count = Number(args.count || (args.compact ? 200 : 50));
  const slice = entries.slice(from - 1, from - 1 + count);
  const next = from - 1 + count < entries.length ? from + count : null;
  done(0, { from, count: slice.length, total: entries.length, next, cards: slice },
    [...slice.map(cardLine), `-- cards ${from}-${from + slice.length - 1} of ${entries.length}${next ? `; next: --from ${next}` : '; that was the last batch'}`].join('\n'));
}

if (command === 'inbox') {
  const inbox = ctx.folders.Inbox;
  const dir = path.join(ctx.work, 'batches');
  const open = exists(dir) ? fs.readdirSync(dir).filter((n) => /^\d+$/.test(n) && !readJson(path.join(dir, n, 'journal.json')).undone) : [];
  if (open.length) stop(1, `batch ${open.at(-1)} of the work folder ${ctx.work} is not finished: run finish once the user is content with it, or undo, then inbox again`);
  const items = fs.readdirSync(path.join(ctx.vaultDir, inbox), { withFileTypes: true })
    .filter((e) => !e.name.startsWith('.') && !e.isSymbolicLink() && e.name !== ABOUT && (e.isFile() || e.isDirectory()))
    .map((e) => ({ name: e.name, kind: e.isDirectory() ? 'folder' : isMd(e.name) ? 'note' : 'document' }))
    .sort((a, b) => lt(a.name, b.name));
  if (!items.length) done(0, { status: 'empty', inbox }, `reorganize: ${ctx.vaultRel}/${inbox}/ holds nothing to archive`);
  const name = args.name ?? `${inbox.replace(/^[\d\s._)-]+/, '') || inbox} ${args.today ?? localDay()}`;
  if (nameBad(name) || !name.trim() || name.includes('/')) stop(1, `--name "${name}" is no usable folder name`);
  const target = `${ctx.folders.Archives}/${name}`;
  const targetDir = path.join(ctx.vaultDir, target);
  if (exists(targetDir) && !isDir(targetDir)) stop(1, `${ctx.vaultRel}/${target} is a file`);
  const taken = items.filter((it) => exists(path.join(targetDir, it.name))).map((it) => it.name);
  if (taken.length) stop(1, `${ctx.vaultRel}/${target}/ already holds ${taken.join(', ')}; give another --name`);
  const reason = args.reason ?? 'the Inbox archived whole';
  const rows = [
    ...(isDir(targetDir) ? [] : [{ op: 'mkdir', kind: 'folder', to: target, reason, flag: 'ok' }]),
    ...items.map((it) => ({ op: 'move', kind: it.kind, from: `${inbox}/${it.name}`, to: `${target}/${it.name}`, reason, flag: 'ok' })),
  ];
  const { back } = writeCards(ctx);
  const planFile = path.resolve(args.plan || workFile(ctx, 'plan.json'));
  writeJson(planFile, rows);
  done(0, { status: 'planned', plan: planFile, work: ctx.work, inbox, target, created: !isDir(targetDir), items: items.length, rows: rows.length, wayBack: back }, [
    `reorganize: the plan moves ${items.length} item(s) of ${ctx.vaultRel}/${inbox}/ into ${ctx.vaultRel}/${target}/ (${isDir(targetDir) ? 'an existing folder' : 'a new folder'}); ${ABOUT} stays in the Inbox`,
    `  way back: ${back.state} - ${back.detail}`,
    `  plan file: ${planFile} (${rows.length} rows)`,
  ].join('\n'));
}

if (command === 'restart') {
  const dir = path.join(ctx.work, 'batches');
  const open = exists(dir) ? fs.readdirSync(dir).filter((n) => /^\d+$/.test(n) && !readJson(path.join(dir, n, 'journal.json')).undone) : [];
  if (open.length) stop(1, `batch ${open.at(-1)} of the work folder ${ctx.work} is not finished: run finish once the user is content with it, or undo, then restart again`);
  const name = args.name ?? `Archive ${args.today ?? localDay()}`;
  if (nameBad(name) || !name.trim() || name.includes('/')) stop(1, `--name "${name}" is no usable folder name`);
  const target = `${ctx.folders.Archives}/${name}`;
  const targetDir = path.join(ctx.vaultDir, target);
  if (exists(targetDir)) stop(1, `${ctx.vaultRel}/${target} already exists; give another --name`);
  const LIST = 'Project List.md'; // the list stays in Projects: the rebuild starts from it
  const groups = ['Inbox', 'Projects', 'Areas', 'Resources'].map((cat) => {
    const folder = ctx.folders[cat];
    const items = folder && isDir(path.join(ctx.vaultDir, folder)) ? fs.readdirSync(path.join(ctx.vaultDir, folder), { withFileTypes: true })
      .filter((e) => !e.name.startsWith('.') && !e.isSymbolicLink() && e.name !== ABOUT && !(cat === 'Projects' && e.name === LIST) && (e.isFile() || e.isDirectory()))
      .map((e) => ({ name: e.name, kind: e.isDirectory() ? 'folder' : isMd(e.name) ? 'note' : 'document' }))
      .sort((a, b) => lt(a.name, b.name)) : [];
    return { folder, items };
  }).filter((g) => g.items.length);
  if (!groups.length) done(0, { status: 'empty' }, 'reorganize: the Inbox, Projects, Areas and Resources folders hold nothing to archive');
  const reason = args.reason ?? 'the vault archived for a fresh start';
  const rows = [{ op: 'mkdir', kind: 'folder', to: target, reason, flag: 'ok' }];
  for (const g of groups) {
    rows.push({ op: 'mkdir', kind: 'folder', to: `${target}/${g.folder}`, reason, flag: 'ok' });
    rows.push(...g.items.map((it) => ({ op: 'move', kind: it.kind, from: `${g.folder}/${it.name}`, to: `${target}/${g.folder}/${it.name}`, reason, flag: 'ok' })));
  }
  const items = groups.reduce((n, g) => n + g.items.length, 0);
  const { back } = writeCards(ctx);
  const planFile = path.resolve(args.plan || workFile(ctx, 'plan.json'));
  writeJson(planFile, rows);
  done(0, { status: 'planned', plan: planFile, work: ctx.work, target, items, folders: Object.fromEntries(groups.map((g) => [g.folder, g.items.length])), rows: rows.length, wayBack: back }, [
    `reorganize: the plan moves ${items} item(s) into ${ctx.vaultRel}/${target}/, one folder for each category folder: ${groups.map((g) => `${g.folder} ${g.items.length}`).join(', ')}`,
    `  left in place: the ${ABOUT} files, ${LIST}, hidden items, the contents of ${ctx.folders.Archives}, everything outside the category folders`,
    `  way back: ${back.state} - ${back.detail}`,
    `  plan file: ${planFile} (${rows.length} rows)`,
  ].join('\n'));
}

/** The sha256 of every _about.md that the last scan saw, or null when there was no scan. */
function loadAboutHashes(c) {
  const file = workFile(c, 'cards.json');
  return exists(file) ? readJson(file).aboutHashes || null : null;
}

// ---- the plan: checking, numbering, the table ----------------------------------------------------------

function readPlan(c) {
  const file = path.resolve(args.plan || workFile(c, 'plan.json'));
  if (!exists(file)) stop(1, `there is no plan file at ${file}`);
  let data;
  try {
    data = readJson(file);
  } catch {
    stop(1, `${file} is not valid JSON`);
  }
  const rows = Array.isArray(data) ? data : data?.rows;
  if (!Array.isArray(rows)) stop(1, `${file} must hold an array of rows`);
  return { file, rows, data };
}

/** A path from the plan, normalized; returns {path} or {error}. */
function normPath(p) {
  if (typeof p !== 'string' || !p.trim()) return { error: 'is empty' };
  const parts = p.replace(/\\/g, '/').split('/').filter((s) => s !== '' && s !== '.');
  if (!parts.length) return { error: 'is empty' };
  if (parts.includes('..')) return { error: 'leaves the vault' };
  if (p.startsWith('/')) return { error: 'must be relative to the vault' };
  if (parts.some((s) => s.startsWith('.'))) return { error: 'is hidden (a name starting with a dot)' };
  return { path: parts.join('/') };
}

/**
 * Plays the rows (those in `select`, or all) on a copy of the vault's file list. Returns the errors, the
 * operations to run, and the final map of file paths (origin -> final).
 */
function simulate(c, listing, rows, select, aboutHashes) {
  const errors = [];
  const fileOrigin = new Map(listing.files.map((f) => [f.rel, f.rel]));
  const dirs = new Set(listing.dirs);
  const roots = new Set(CATEGORIES.map((k) => c.folders[k]));
  const ops = [];
  const touched = new Set(); // folders whose content a row changes
  const touch = (d) => {
    if (d && d !== '.') touched.add(d);
  };
  let newCount = 0;
  /** An _about.md must be as the last scan saw it, so that an edit made since is not lost. */
  const unchanged = (origin) => {
    if (origin.startsWith('\0')) return null;
    const want = aboutHashes?.[origin];
    if (!want) return `${origin} was not in the last scan; run scan again`;
    let now;
    try {
      now = sha256(fs.readFileSync(path.join(c.vaultDir, origin)));
    } catch {
      return `${origin} cannot be read`;
    }
    return now === want ? null : `${origin} changed since the last scan; run scan again and read it again`;
  };
  const sameName = (a, b) => a.toLowerCase() === b.toLowerCase();
  const collides = (p, ignore) => {
    for (const x of [...fileOrigin.keys(), ...dirs]) if (x !== ignore && sameName(x, p)) return x;
    return null;
  };
  const under = (p, dir) => p === dir || p.startsWith(`${dir}/`);
  const hiddenIn = (dir) => {
    try {
      return fs.readdirSync(path.join(c.vaultDir, dir)).some((n) => n.startsWith('.'));
    } catch {
      return false;
    }
  };
  const countUnder = (dir) => [...fileOrigin.keys()].filter((p) => under(p, dir)).length + [...dirs].filter((p) => p !== dir && under(p, dir)).length;
  const moveTree = (from, to) => {
    for (const [p, o] of [...fileOrigin]) if (under(p, from)) {
      fileOrigin.delete(p);
      fileOrigin.set(to + p.slice(from.length), o);
    }
    for (const d of [...dirs]) if (under(d, from)) {
      dirs.delete(d);
      dirs.add(to + d.slice(from.length));
    }
    for (const d of [...touched]) if (under(d, from)) {
      touched.delete(d);
      touched.add(to + d.slice(from.length));
    }
  };

  rows.forEach((row, i) => {
    const n = i + 1;
    if (select && !select.has(n)) return;
    const err = (m) => errors.push(`row ${n}: ${m}`);
    if (!row || typeof row !== 'object') return err('is not an object');
    if (row.applied !== undefined) return select ? err(`was applied in batch ${row.applied}`) : undefined; // its changes are in the vault
    if (row.flag === 'skip') return select ? err('is flagged skip: the user declined it') : undefined;
    if (!OPS.includes(row.op)) return err(`op must be one of ${OPS.join(', ')}`);
    if (!KINDS.includes(row.kind)) return err(`kind must be one of ${KINDS.join(', ')}`);
    if (!FLAGS.includes(row.flag)) return err(`flag must be one of ${FLAGS.join(', ')}`);
    if (typeof row.reason !== 'string' || !row.reason.trim()) return err('has no reason');
    if (select && row.flag === 'ask') return err('is flagged ask: wait for the user\'s answer, then set the flag to ok');
    if (row.op === 'mkdir' && row.kind !== 'folder') return err('mkdir takes kind folder');
    if (row.kind === 'about' && !['write', 'rmfile'].includes(row.op)) return err('kind about is for write and rmfile rows');
    if (['write', 'rmfile'].includes(row.op) && row.kind !== 'about') return err(`${row.op} takes kind about`);
    const to = ['rmdir', 'rmfile'].includes(row.op) ? null : normPath(row.to);
    if (to?.error) return err(`"to" ${to.error}`);
    const from = ['mkdir', 'write'].includes(row.op) ? null : normPath(row.from);
    if (from?.error) return err(`"from" ${from.error}`);
    const f = from?.path;
    const t = to?.path;
    const newName = (p, old) => {
      const name = posix.basename(p);
      if (old !== undefined && name === posix.basename(old)) return null;
      if (/[<>:"\\|?*]/.test(name)) return `the name "${name}" has a character that file systems reserve`;
      if (/[. ]$/.test(name)) return `the name "${name}" ends with a dot or a space`;
      if (!args['allow-emoji'] && /\p{Extended_Pictographic}/u.test(name)) return `the name "${name}" has an emoji; emoji are used only when the user asks (--allow-emoji)`;
      return null;
    };

    if (row.op === 'mkdir') {
      if (t.split('/').length < 2 || !roots.has(topOf(t))) return err('a new folder goes inside one of the five PARA folders');
      const bad = newName(t);
      if (bad) return err(bad);
      if (collides(t)) return err(`${t} already exists (or differs only in letter case)`);
      if (!dirs.has(posix.dirname(t))) return err(`the parent ${posix.dirname(t)} does not exist at that point`);
      dirs.add(t);
      touch(t);
      touch(posix.dirname(t));
      ops.push({ n, op: 'mkdir', path: t });
      return;
    }
    if (row.op === 'rmdir') {
      if (!dirs.has(f)) return err(`${f} is not a folder at that point`);
      if (roots.has(f)) return err('the five PARA folders are not removed');
      if (countUnder(f) > 0) {
        const left = [...fileOrigin.keys()].filter((p) => under(p, f));
        const subdirs = [...dirs].filter((p) => p !== f && under(p, f));
        if (!subdirs.length && left.every(isAbout)) return err(`${f} still holds its ${ABOUT}: add an rmfile row for it before this row`);
        return err(`${f} is not empty`);
      }
      if (hiddenIn(f)) return err(`${f} holds hidden files; it is not removed`);
      touch(posix.dirname(f));
      dirs.delete(f);
      touched.delete(f);
      ops.push({ n, op: 'rmdir', path: f });
      return;
    }
    if (row.op === 'write') {
      if (posix.basename(t) !== ABOUT) return err(`write is only for a file named ${ABOUT}`);
      const dir = posix.dirname(t);
      if (dir === '.') return err('the top of the vault gets no about file');
      if (!dirs.has(dir)) return err(`the folder ${dir} does not exist at that point`);
      if (typeof row.text !== 'string' || !row.text.trim()) return err('has no "text"');
      const lines = row.text.replace(/\n+$/, '').split('\n').length;
      if (lines > ABOUT_MAX_LINES) return err(`the text has ${lines} lines; the limit is ${ABOUT_MAX_LINES}`);
      if (!/^# \S/m.test(row.text)) return err('the text starts with the name of the folder as a "# " title');
      const sections = (row.text.match(/^## \S/gm) || []).length;
      if (sections < ABOUT_MIN_SECTIONS) return err(`the text has ${sections} "## " sections; it needs ${ABOUT_MIN_SECTIONS}`);
      const existed = fileOrigin.has(t);
      let origin;
      if (existed) {
        origin = fileOrigin.get(t);
        const bad = unchanged(origin);
        if (bad) return err(bad);
      } else {
        if (collides(t)) return err(`${t} clashes with an existing name that differs only in letter case`);
        origin = `\0new${++newCount}`;
        fileOrigin.set(t, origin);
      }
      ops.push({ n, op: 'write', path: t, text: row.text.replace(/\n*$/, '\n'), existed, origin });
      return;
    }
    if (row.op === 'rmfile') {
      if (!isAbout(f)) return err(`rmfile is only for a file named ${ABOUT}`);
      if (!fileOrigin.has(f)) return err(`${f} is not a file at that point`);
      const origin = fileOrigin.get(f);
      const bad = unchanged(origin);
      if (bad) return err(bad);
      fileOrigin.delete(f);
      ops.push({ n, op: 'rmfile', path: f, origin });
      return;
    }
    // move and merge
    if (roots.has(f)) return err(`${f} is one of the five PARA folders; they are not moved or merged away`);
    const isFolder = dirs.has(f);
    if (row.kind === 'folder' && !isFolder) return err(`${f} is not a folder at that point`);
    if (row.kind !== 'folder' && !fileOrigin.has(f)) return err(`${f} is not a file at that point`);
    if (row.kind === 'folder' && fileOrigin.has(f)) return err(`${f} is a file, not a folder`);
    if (!isFolder && isAbout(f)) return err(`${ABOUT} is changed with write and rmfile rows, not moved`);
    if (row.op === 'move') {
      if (!roots.has(topOf(t))) return err(`the destination must be inside one of the five PARA folders`);
      if (t.split('/').length < 2) return err('the destination is a PARA folder itself');
      if (isFolder && under(t, f)) return err('a folder cannot move into itself');
      if (!dirs.has(posix.dirname(t))) return err(`the destination folder ${posix.dirname(t)} does not exist at that point (add a mkdir row before it)`);
      const hit = collides(t, f);
      if (hit) return err(`${hit} already exists at the destination; nothing is overwritten`);
      if (row.kind === 'document' && posix.basename(t) !== posix.basename(f)) return err('a document keeps its name');
      if (row.kind === 'note' && !isMd(f)) return err('kind note is for Markdown files; use document');
      if (row.kind !== 'folder' && posix.extname(t).toLowerCase() !== posix.extname(f).toLowerCase()) return err('the file extension must stay');
      const bad = newName(t, f);
      if (bad) return err(bad);
      if (row.kind === 'note' && posix.basename(t) !== posix.basename(f)) {
        const stem = posix.basename(t).toLowerCase().replace(/\.md$/, '');
        const clash = [...fileOrigin.keys()].find((p) => p !== f && isMd(p) && !isAbout(p) && posix.basename(p).toLowerCase().replace(/\.md$/, '') === stem);
        if (clash) return err(`another note already has the name "${posix.basename(t, '.md')}" (${clash}); links by name would become ambiguous`);
      }
      touch(posix.dirname(f));
      if (isFolder) moveTree(f, t);
      else {
        const o = fileOrigin.get(f);
        fileOrigin.delete(f);
        fileOrigin.set(t, o);
      }
      touch(posix.dirname(t));
      if (isFolder) touch(t);
      ops.push({ n, op: 'rename', from: f, to: t });
      return;
    }
    // merge
    if (!isFolder) return err('merge takes a folder');
    if (!dirs.has(t)) return err(`the target folder ${t} does not exist at that point`);
    if (roots.has(t)) return err(`merging into ${t} would leave the items loose in a PARA folder; merge into a folder inside it`);
    if (under(t, f) || f === t) return err('a folder cannot be merged into itself or into a folder inside it');
    const kids = [...new Set([...fileOrigin.keys(), ...dirs].filter((p) => posix.dirname(p) === f))].sort(lt);
    const clashes = kids.filter((k) => collides(`${t}/${posix.basename(k)}`));
    if (clashes.length) return err(`already in ${t}: ${clashes.map((k) => posix.basename(k)).join(', ')}; resolve these with rows of their own${clashes.some(isAbout) ? ` (put the lines of ${f}/${ABOUT} that still hold into a write row for ${t}/${ABOUT}, then remove ${f}/${ABOUT} with an rmfile row, both before this row)` : ''}`);
    if (hiddenIn(f)) return err(`${f} holds hidden files; it is not removed`);
    for (const k of kids) {
      const dest = `${t}/${posix.basename(k)}`;
      moveTree(k, dest);
      ops.push({ n, op: 'rename', from: k, to: dest });
    }
    touch(t);
    touch(posix.dirname(f));
    dirs.delete(f);
    touched.delete(f);
    ops.push({ n, op: 'rmdir', path: f });
  });

  const map = new Map();
  const createdFinal = new Map();
  for (const [final, origin] of fileOrigin) {
    if (origin.startsWith('\0')) createdFinal.set(origin, final);
    else map.set(origin, final);
  }
  const finalOf = (origin) => (origin.startsWith('\0') ? createdFinal.get(origin) : map.get(origin));
  const touchedFolders = [...touched].filter((d) => dirs.has(d) && !d.split('/').some((x) => x.startsWith('.'))).sort(lt);
  const aboutRows = new Set(ops.filter((o) => o.op === 'write').map((o) => finalOf(o.origin)).filter(Boolean).map((p) => posix.dirname(p)));
  const finalAbout = new Set([...fileOrigin.keys()].filter(isAbout).map((p) => posix.dirname(p)));
  return { errors, ops, map, createdFinal, finalOf, touchedFolders, aboutRows, finalAbout, finalFiles: [...fileOrigin.keys()], finalDirs: [...dirs] };
}

function actionOf(row) {
  if (row.op === 'mkdir') return 'create folder';
  if (row.op === 'rmdir') return 'remove empty folder';
  if (row.op === 'merge') return 'merge into';
  if (row.op === 'write') return row.applied !== undefined ? 'write about file' : row._existed ? 'update about file' : 'create about file';
  if (row.op === 'rmfile') return 'remove about file';
  const same = posix.dirname(row.from) === posix.dirname(row.to);
  const renamed = posix.basename(row.from) !== posix.basename(row.to);
  if (CATEGORIES.some((k) => ctx.folders[k] === topOf(row.to)) && ctx.folders.Archives === topOf(row.to) && ctx.folders.Archives !== topOf(row.from)) return renamed ? 'archive+rename' : 'archive';
  if (same) return 'rename';
  return renamed ? 'move+rename' : 'move';
}

/** A row with every field its op needs. */
const readable = (row) => row && typeof row === 'object' && OPS.includes(row.op)
  && (row.op === 'mkdir' || row.op === 'write' || typeof row.from === 'string')
  && (row.op === 'rmdir' || row.op === 'rmfile' || typeof row.to === 'string');

function planTable(rows, listing, from, count) {
  const fileCount = new Map();
  for (const f of listing.files) if (!isAbout(f.rel)) for (let d = posix.dirname(f.rel); d !== '.'; d = posix.dirname(d)) fileCount.set(d, (fileCount.get(d) || 0) + 1);
  const cell = (s) => String(s).replace(/\|/g, '\\|').replace(/\s+/g, ' ');
  const lines = ['| № | What | Kind | From | To | Action | Reason | Flag |', '|---|---|---|---|---|---|---|---|'];
  rows.slice(from - 1, from - 1 + count).forEach((row, i) => {
    const n = from + i;
    if (!readable(row)) {
      lines.push(`| ${n} | (row cannot be read) | | | | | | |`);
      return;
    }
    const aboutOf = (p) => `${posix.basename(posix.dirname(p))}/${ABOUT}`;
    const src = row.op === 'mkdir' ? '' : row.op === 'write' ? (row._existed ? String(row.to) : '') : String(row.from);
    const dst = row.op === 'rmdir' || row.op === 'rmfile' ? '' : String(row.to);
    const what = (row.op === 'write' ? aboutOf(dst) : row.op === 'rmfile' ? aboutOf(src) : posix.basename(row.op === 'mkdir' ? dst : src)) + (row.kind === 'folder' && (row.op === 'move' || row.op === 'merge') && fileCount.has(src) ? ` (${fileCount.get(src)} files)` : '');
    lines.push(`| ${n} | ${cell(what)} | ${row.kind} | ${cell(src || '-')} | ${cell(dst || '-')} | ${actionOf(row)} | ${cell(row.reason)} | ${row.applied !== undefined ? `applied ${row.applied}` : row.flag} |`);
  });
  return lines.join('\n');
}

if (command === 'plan') {
  const { rows, file } = readPlan(ctx);
  const listing = listVault(ctx.vaultDir);
  const sim = simulate(ctx, listing, rows, null, loadAboutHashes(ctx));
  for (const o of sim.ops) if (o.op === 'write') rows[o.n - 1]._existed = o.existed; // for the table only; the plan file is not changed
  const valid = rows.filter((r) => readable(r) && KINDS.includes(r.kind) && FLAGS.includes(r.flag) && typeof r.reason === 'string');
  if (args.expand) {
    const N = Number(args.expand);
    const row = rows[N - 1];
    if (row?.applied !== undefined) stop(1, `row ${N} was applied in batch ${row.applied}`);
    if (row && (row.op === 'write' || row.op === 'rmfile')) {
      const o = sim.ops.find((x) => x.n === N);
      if (!o) stop(1, `row ${N} has errors; fix them first`);
      let current = null;
      if (!o.origin.startsWith('\0')) current = fs.readFileSync(path.join(ctx.vaultDir, o.origin), 'utf8');
      const count = (t) => t.replace(/\n+$/, '').split('\n').length;
      done(0, { row: N, path: o.path, current, proposed: o.op === 'write' ? o.text : null }, [
        `row ${N}: ${o.op === 'write' ? (o.existed ? 'update' : 'create') : 'remove'} ${o.path}`,
        ...(current !== null ? [`--- current (${count(current)} lines)`, current.replace(/\n+$/, '')] : []),
        ...(o.op === 'write' ? [`--- proposed (${count(o.text)} lines)`, o.text.replace(/\n+$/, '')] : []),
      ].join('\n'));
    }
    if (!row || row.kind !== 'folder' || row.op === 'mkdir') stop(1, `row ${args.expand} is not a folder row of an existing folder`);
    const base = String(row.from);
    const inside = listing.files.filter((f) => f.rel.startsWith(`${base}/`)).map((f) => f.rel.slice(base.length + 1));
    done(0, { row: Number(args.expand), folder: base, files: inside }, [`row ${args.expand}: ${base}/ holds ${inside.length} files`, ...inside.slice(0, 200).map((p) => `  ${p}`), ...(inside.length > 200 ? [`  ... and ${inside.length - 200} more`] : [])].join('\n'));
  }
  const from = Number(args.from || 1);
  const count = Number(args.count || 40);
  const open = rows.filter((r) => r?.applied === undefined);
  const flags = Object.fromEntries(FLAGS.map((k) => [k, open.filter((r) => r?.flag === k).length]));
  const applied = rows.length - open.length;
  const actions = {};
  if (!sim.errors.length) for (const r of valid.filter((x) => x.applied === undefined && x.flag !== 'skip')) actions[actionOf(r)] = (actions[actionOf(r)] || 0) + 1;
  const filesTouched = sim.errors.length ? null : [...sim.map].filter(([o, f]) => o !== f).length;
  const summary = `${rows.length} rows${applied ? ` (${applied} applied)` : ''}; flags${applied ? ' of the rest' : ''}: ${flags.ok} ok, ${flags.doubt} doubt, ${flags.ask} ask${flags.skip ? `, ${flags.skip} skip` : ''}${filesTouched === null ? '' : `; ${filesTouched} files change place`}`;
  const aboutWithoutRow = sim.errors.length ? [] : sim.touchedFolders.filter((d) => !sim.aboutRows.has(d)).map((d) => ({ folder: d, hasFile: sim.finalAbout.has(d) }));
  const folderMoves = rows.map((r, i) => ({ r, n: i + 1 })).filter(({ r }) => readable(r) && r.applied === undefined && r.flag !== 'skip' && r.kind === 'folder' && ['move', 'merge'].includes(r.op) && r.from !== r.to);
  const named = pathMentions(ctx, [...new Set(folderMoves.map(({ r }) => String(r.from)))]);
  const mentions = folderMoves.filter(({ r }) => named.get(String(r.from)).length).map(({ r, n }) => ({ row: n, from: String(r.from), files: named.get(String(r.from)) }));
  const result = { status: sim.errors.length ? 'errors' : 'valid', plan: file, rows: rows.length, applied, flags, actions, filesTouched, errors: sim.errors, aboutWithoutRow, pathMentions: mentions, table: planTable(rows, listing, from, count) };
  const shown = `-- rows ${from}-${Math.min(rows.length, from + count - 1)} of ${rows.length}${from + count <= rows.length ? `; next: --from ${from + count}` : ''}`;
  const text = [
    sim.errors.length ? `reorganize: the plan has ${sim.errors.length} error(s):` : 'reorganize: the plan is valid',
    ...sim.errors.map((e) => `  ${e}`),
    ...(Object.keys(actions).length ? [`  actions: ${Object.entries(actions).map(([k, v]) => `${v} ${k}`).join(', ')}`] : []),
    `  ${summary}`,
    ...mentions.map((m) => `  NOTE: row ${m.row} moves a folder whose path is written in: ${m.files.join(', ')} (a tool or a rule there may still use the old path)`),
    ...(aboutWithoutRow.length ? [`  NOTE: ${aboutWithoutRow.length} folder(s) that the rows touch have no write row for their ${ABOUT} (check that each existing file still holds): ${aboutWithoutRow.slice(0, 25).map((a) => `${a.folder} (${a.hasFile ? 'has the file' : 'no file'})`).join(', ')}${aboutWithoutRow.length > 25 ? ', ...' : ''}`] : []),
    '',
    planTable(rows, listing, from, count),
    shown,
  ].filter((l) => l !== undefined).join('\n');
  done(sim.errors.length ? 1 : 0, result, text);
}

// ---- apply, verify, undo ------------------------------------------------------------------------------

function parseRows(spec, total) {
  if (!spec) usage('--rows is required (for example 1-30,33 or all)');
  if (spec === 'all') return new Set(Array.from({ length: total }, (_, i) => i + 1));
  const set = new Set();
  for (const part of spec.split(',')) {
    const m = /^(\d+)(?:-(\d+))?$/.exec(part.trim());
    if (!m) usage(`--rows: cannot read "${part}"`);
    const a = Number(m[1]);
    const b = Number(m[2] || m[1]);
    if (a < 1 || b < a || b > total) usage(`--rows: ${part} is outside 1-${total}`);
    for (let k = a; k <= b; k++) set.add(k);
  }
  return set;
}

const batchesDir = (c) => workFile(c, 'batches');
function latestBatch(c) {
  const dir = batchesDir(c);
  if (!exists(dir)) return null;
  const names = fs.readdirSync(dir).filter((n) => /^\d+$/.test(n)).sort();
  for (let i = names.length - 1; i >= 0; i--) {
    const journal = readJson(path.join(dir, names[i], 'journal.json'));
    if (!journal.undone) return { name: names[i], dir: path.join(dir, names[i]), journal };
  }
  return null;
}

/** What is wrong with the text of an _about.md, as a list of short messages. */
function aboutProblems(text) {
  const out = [];
  const lines = text.replace(/\n+$/, '').split('\n').length;
  if (lines > ABOUT_MAX_LINES) out.push(`${lines} lines, the limit is ${ABOUT_MAX_LINES}`);
  if (!/^# \S/m.test(text)) out.push('no "# " title');
  const sections = (text.match(/^## \S/gm) || []).length;
  if (sections < ABOUT_MIN_SECTIONS) out.push(`${sections} "## " sections, it needs ${ABOUT_MIN_SECTIONS}`);
  return out;
}

/** The state of the vault against the snapshot a batch took before it ran. */
function checkBatch(c, batch) {
  const before = readJson(path.join(batch.dir, 'before.json'));
  const map = readJson(path.join(batch.dir, 'map.json'));
  const edits = batch.journal.edits;
  const removed = new Set(batch.journal.removedOrigins || []);
  const createdFinal = new Set(batch.journal.createdFinal || []);
  const editedAfter = new Map([...Object.entries(batch.journal.written || {}), ...edits.map((e) => [e.path, e.afterSha])]);
  const now = listVault(c.vaultDir);
  const nowSet = new Set(now.files.map((f) => f.rel));
  const problems = { missing: [], changed: [], renamedDocuments: [], extra: [], stale: [], aboutBad: [] };
  const expected = new Set();
  for (const [origin, info] of Object.entries(before.files)) {
    if (removed.has(origin)) continue;
    const final = map[origin] ?? origin;
    expected.add(final);
    if (!nowSet.has(final)) {
      problems.missing.push(origin);
      continue;
    }
    const abs = path.join(c.vaultDir, final);
    const st = fs.statSync(abs);
    const sha = fingerprint(abs, st);
    const want = editedAfter.get(final) ?? info.sha;
    if (sha !== want || st.size !== (editedAfter.has(final) ? st.size : info.size)) problems.changed.push(final);
    if (posix.basename(final) !== posix.basename(origin) && !batch.journal.renamedNotes.includes(origin)) problems.renamedDocuments.push(origin);
  }
  for (const f of now.files) if (!expected.has(f.rel) && !createdFinal.has(f.rel)) problems.extra.push(f.rel);
  // links that pointed at something before and no longer do
  const index = buildIndex(now.files.map((f) => f.rel));
  const after = linkTable(now.files.map((f) => f.rel), (r) => fs.readFileSync(path.join(c.vaultDir, r), 'utf8'), index);
  const have = new Set(after.pairs.map((p) => `${p.file}\u0000${p.target}`));
  for (const p of before.links) {
    if (removed.has(p.file) || removed.has(p.target)) continue;
    if ((batch.journal.written || {})[map[p.file] ?? p.file]) continue; // the links of a note that the batch rewrote are its writer's choice
    const key = `${map[p.file] ?? p.file}\u0000${map[p.target] ?? p.target}`;
    if (!have.has(key)) problems.stale.push(`${map[p.file] ?? p.file}: ${p.text}`);
  }
  const roots = new Set(CATEGORIES.map((k) => c.folders[k]));
  for (const final of Object.keys(batch.journal.written || {})) {
    if (nowSet.has(final)) problems.aboutBad.push(...aboutProblems(fs.readFileSync(path.join(c.vaultDir, final), 'utf8')).map((m) => `${final}: ${m}`));
  }
  const nowDirs = new Set(now.dirs);
  const aboutMissing = (batch.journal.touched || []).filter((d) => nowDirs.has(d) && !nowSet.has(`${d}/${ABOUT}`));
  const emptyFolders = now.dirs.filter((d) => !roots.has(d) && !now.files.some((f) => f.rel.startsWith(`${d}/`))).length;
  const ok = !Object.values(problems).some((v) => v.length);
  return { ok, files: Object.keys(before.files).length, now: now.files.length, aboutMissing, emptyFolders, unresolvedBefore: before.unresolved, unresolvedNow: after.unresolved.length, ...problems };
}

function verifyText(r) {
  const lines = [r.ok ? `verify: ok - ${r.files} files before, ${r.now} now; nothing lost, no document renamed or changed, no stale link` : 'verify: PROBLEMS found'];
  const show = (label, list) => {
    if (list.length) {
      lines.push(`  ${label} (${list.length}):`);
      for (const x of list.slice(0, 20)) lines.push(`    - ${x}`);
      if (list.length > 20) lines.push(`    - ... and ${list.length - 20} more`);
    }
  };
  show('files missing', r.missing);
  show('files with changed content', r.changed);
  show('documents renamed', r.renamedDocuments);
  show('files nobody planned', r.extra);
  show(`${ABOUT} files that do not meet the rules`, r.aboutBad);
  show('links that no longer resolve (inside documents or canvases they cannot be repaired; tell the user)', r.stale);
  if (r.aboutMissing.length) lines.push(`  note: ${r.aboutMissing.length} touched folder(s) have no ${ABOUT}: ${r.aboutMissing.slice(0, 20).join(', ')}${r.aboutMissing.length > 20 ? ', ...' : ''}`);
  lines.push(`  empty folders now: ${r.emptyFolders}; unresolved links before/now: ${r.unresolvedBefore}/${r.unresolvedNow}`);
  return lines.join('\n');
}

if (command === 'apply') {
  const { rows, file: planFile, data: planData } = readPlan(ctx);
  const select = parseRows(args.rows, rows.length);
  if (args.rows === 'all') for (const n of [...select]) if (rows[n - 1]?.applied !== undefined || rows[n - 1]?.flag === 'skip') select.delete(n);
  if (!select.size) done(1, { status: 'refused', errors: ['no row is left to apply'] }, 'reorganize: nothing was changed; every row is applied or flagged skip');
  const listing = listVault(ctx.vaultDir);
  const sim = simulate(ctx, listing, rows, select, loadAboutHashes(ctx));
  if (sim.errors.length) done(1, { status: 'refused', errors: sim.errors }, `reorganize: nothing was changed; ${sim.errors.length} problem(s) in the chosen rows:\n${sim.errors.map((e) => `  ${e}`).join('\n')}`);
  const back = wayBack(ctx);
  if (!['clean', 'journal'].includes(back.state) && !args['backup-confirmed']) {
    done(6, { status: 'no-way-back', wayBack: back }, `reorganize: nothing was changed; the vault has no way back from a mistake (${back.detail}). Ask the user to commit the vault or to confirm a backup, then rerun with --backup-confirmed if they confirm one.`);
  }
  ensureWork(ctx);
  fs.mkdirSync(batchesDir(ctx), { recursive: true });
  const number = String(fs.readdirSync(batchesDir(ctx)).filter((n) => /^\d+$/.test(n)).length + 1).padStart(3, '0');
  const dir = path.join(batchesDir(ctx), number);
  fs.mkdirSync(path.join(dir, 'notes'), { recursive: true });

  // the state before: a fingerprint of every file and every link that resolves
  const initial = buildIndex(listing.files.map((f) => f.rel));
  const readNow = (r) => fs.readFileSync(path.join(ctx.vaultDir, r), 'utf8');
  const beforeFiles = {};
  for (const f of listing.files) beforeFiles[f.rel] = { size: f.size, sha: fingerprint(path.join(ctx.vaultDir, f.rel), f) };
  const beforeTable = linkTable(listing.files.map((f) => f.rel), readNow, initial);
  writeJson(path.join(dir, 'before.json'), { files: beforeFiles, links: beforeTable.pairs.filter((p) => !p.ambiguous).map((p) => ({ file: p.file, target: p.target, text: p.link.text })), unresolved: beforeTable.unresolved.length });
  const map = Object.fromEntries(sim.map);
  writeJson(path.join(dir, 'map.json'), map);

  const documentsMd = new Set(rows.filter((r, i) => select.has(i + 1) && r.kind === 'document' && isMd(String(r.from))).map((r) => String(r.from)));
  const renamedNotes = rows.filter((r, i) => select.has(i + 1) && r.kind === 'note' && r.op === 'move' && posix.basename(r.from) !== posix.basename(r.to)).map((r) => String(r.from));
  const journal = { rows: [...select], ops: [], edits: [], renamedNotes, undone: false };
  const save = () => writeJson(path.join(dir, 'journal.json'), journal);
  save();

  // the changes on disk, one operation at a time, each written to the journal at once
  let aboutCopies = 0;
  for (const op of sim.ops) {
    try {
      if (op.op === 'mkdir') fs.mkdirSync(path.join(ctx.vaultDir, op.path));
      else if (op.op === 'rmdir') fs.rmdirSync(path.join(ctx.vaultDir, op.path));
      else if (op.op === 'write' || op.op === 'rmfile') {
        const abs = path.join(ctx.vaultDir, op.path);
        if (op.op === 'rmfile' || op.existed) { // a copy of the old text, for undo
          op.backup = `notes/about-${++aboutCopies}.txt`;
          fs.writeFileSync(path.join(dir, op.backup), fs.readFileSync(abs));
        }
        if (op.op === 'rmfile') fs.unlinkSync(abs);
        else {
          fs.writeFileSync(abs, op.text, op.existed ? undefined : { flag: 'wx' });
          op.afterSha = sha256(fs.readFileSync(abs));
        }
      } else fs.renameSync(path.join(ctx.vaultDir, op.from), path.join(ctx.vaultDir, op.to));
    } catch (e) {
      save();
      done(1, { status: 'failed', batch: number, row: op.n, message: e.message }, `reorganize: row ${op.n} failed (${e.message}); the rows before it are done and journaled. Run undo to take the batch back, or fix the cause.`);
    }
    const { text, ...record } = op; // the text of an about file is in the vault now; the journal keeps the rest
    journal.ops.push(record);
    save();
  }
  // what the batch wrote, removed and created, by final path, for verify and for the next batch's way-back check
  journal.written = {};
  journal.removedOrigins = [];
  journal.createdFinal = [...sim.createdFinal.values()];
  journal.touched = sim.touchedFolders;
  for (const op of sim.ops) {
    if (op.op === 'write' && sim.finalOf(op.origin)) journal.written[sim.finalOf(op.origin)] = op.afterSha;
    if (op.op === 'rmfile' && !op.origin.startsWith('\0')) journal.removedOrigins.push(op.origin);
  }
  save();

  // the links: resolve each against the old layout, rewrite where the new layout needs another text
  const finalFiles = listVault(ctx.vaultDir).files.map((f) => f.rel);
  const finalIndex = buildIndex(finalFiles);
  const origin = new Map([...sim.map].map(([o, f]) => [f, o]));
  const mapOf = (p) => sim.map.get(p) ?? p;
  let repaired = 0;
  const unrepaired = [];
  let editCount = 0;
  for (const f of finalFiles.filter(isMd)) {
    const src = origin.get(f) ?? f;
    const text = readNow(f);
    const edits = [];
    for (const l of findLinks(text)) {
      if (l.kind === 'wiki') {
        const old = resolveWiki(initial, l.target);
        if (!old || old.ambiguous) continue;
        const target = mapOf(old.path);
        const now = resolveWiki(finalIndex, l.target);
        const withExt = /\.md$/i.test(l.target);
        // a link that still finds its moved file and spells its old path with the old letters (a rename of letter case) is rewritten too
        const oldSpelling = target !== old.path && spells(l.target, old.path, old.full, withExt) && !spells(l.target, target, old.full, withExt);
        if (now && now.path === target && !now.ambiguous && !oldSpelling) continue;
        edits.push({ l, text: old.full ? fullTarget(target, withExt) : wikiTargetFor(finalIndex, target, withExt) });
      } else {
        const old = resolveMd(initial, src, l.target);
        if (!old) continue;
        const target = mapOf(old);
        const dest = mdDestFor(l.raw, f, target, ctx.ob.prefix);
        if (dest !== l.raw) edits.push({ l, text: dest });
      }
    }
    if (!edits.length) continue;
    if (documentsMd.has(src)) {
      for (const e of edits) unrepaired.push(`${f}: ${e.l.text} (a document is not edited)`);
      continue;
    }
    let next = text;
    for (const e of edits.sort((a, b) => b.l.start - a.l.start)) next = next.slice(0, e.l.start) + e.text + next.slice(e.l.end);
    editCount++;
    repaired += edits.length;
    fs.writeFileSync(path.join(dir, 'notes', `${editCount}.txt`), text);
    fs.writeFileSync(path.join(ctx.vaultDir, f), next);
    journal.edits.push({ path: f, backup: `notes/${editCount}.txt`, afterSha: sha256(Buffer.from(next)) });
    save();
  }
  // the rows of this batch carry its number from now on, and the about files it changed keep their new hashes
  for (const n of select) rows[n - 1].applied = number;
  writeJson(planFile, planData);
  const cardsFile = workFile(ctx, 'cards.json');
  if (exists(cardsFile)) {
    const cards = readJson(cardsFile);
    const hashes = cards.aboutHashes || {};
    journal.aboutHashesBefore = { ...hashes };
    for (const [o, f] of sim.map) if (isAbout(o) && o !== f && o in hashes) { hashes[f] = hashes[o]; delete hashes[o]; }
    for (const [f, sha] of Object.entries(journal.written)) hashes[f] = sha;
    for (const e of journal.edits) if (isAbout(e.path)) hashes[e.path] = e.afterSha;
    for (const k of Object.keys(hashes)) if (!exists(path.join(ctx.vaultDir, k))) delete hashes[k];
    cards.aboutHashes = hashes;
    writeJson(cardsFile, cards);
    save();
  }
  const batch = { name: number, dir, journal };
  const check = checkBatch(ctx, batch);
  const gitCase = caseRenames(ctx, rows, select);
  const moved = [...sim.map].filter(([o, f]) => o !== f).length;
  const created = sim.ops.filter((o) => o.op === 'mkdir').length;
  const about = { created: sim.ops.filter((o) => o.op === 'write' && !o.existed).length, updated: sim.ops.filter((o) => o.op === 'write' && o.existed).length, removed: sim.ops.filter((o) => o.op === 'rmfile').length };
  const removed = sim.ops.filter((o) => o.op === 'rmdir').length;
  writeJson(path.join(dir, 'result.json'), { moved, created, removed, repaired, editCount, check });
  const result = { status: check.ok ? 'applied' : 'applied-with-problems', batch: number, rows: select.size, filesMoved: moved, foldersCreated: created, foldersRemoved: removed, aboutFiles: about, notesEdited: editCount, linksRepaired: repaired, notRepaired: unrepaired, gitCase, check };
  done(check.ok ? 0 : 1, result, [
    `reorganize: applied batch ${number} - ${select.size} rows; ${moved} files changed place, ${created} folders created, ${removed} removed; ${repaired} links repaired in ${editCount} notes; ${ABOUT}: ${about.created} created, ${about.updated} updated, ${about.removed} removed`,
    ...unrepaired.map((u) => `  not repaired: ${u}`),
    ...(gitCase.length ? [`  git ignores letter case here (core.ignorecase), so it does not see ${gitCase.length} rename(s) that change only the letter case; run in the project before the commit:`,
      ...gitCase.flatMap((g) => g.commands.map((cmd) => `    ${cmd}`))] : []),
    verifyText(check),
  ].join('\n'));
}

/**
 * The chosen move rows that change only the letter case of a name git tracks, when git ignores letter case: git keeps the
 * old name then, so each gets the two commands that record the rename (paths from the project root, where they run).
 */
function caseRenames(c, rows, select) {
  const chosen = rows.map((r, i) => ({ r, n: i + 1 })).filter(({ r, n }) => select.has(n) && r.op === 'move' && r.from !== r.to && fold(r.from) === fold(r.to));
  if (!chosen.length) return [];
  const git = (...a) => spawnSync('git', ['-C', root, ...a], { encoding: 'utf8' });
  if (git('config', '--get', 'core.ignorecase').stdout.trim() !== 'true') return [];
  const q = (p) => `'${p.replace(/'/g, "'\\''")}'`;
  return chosen
    .filter(({ r }) => git('ls-files', '--', `${c.vaultRel}/${r.from}`).stdout.trim())
    .map(({ r, n }) => ({ row: n, from: r.from, to: r.to, commands: [`git rm -r --cached -q -- ${q(`${c.vaultRel}/${r.from}`)}`, `git add -- ${q(`${c.vaultRel}/${r.to}`)}`] }));
}

if (command === 'verify') {
  const batch = latestBatch(ctx);
  if (!batch) stop(1, 'there is no applied batch to verify');
  const check = checkBatch(ctx, batch);
  done(check.ok ? 0 : 1, { status: check.ok ? 'ok' : 'problems', batch: batch.name, ...check }, verifyText(check));
}

if (command === 'undo') {
  const batch = latestBatch(ctx);
  if (!batch) stop(1, 'there is no applied batch to take back');
  const notes = [];
  for (const e of [...batch.journal.edits].reverse()) {
    const abs = path.join(ctx.vaultDir, e.path);
    if (!exists(abs) || sha256(fs.readFileSync(abs)) !== e.afterSha) {
      notes.push(`not restored (changed since): ${e.path}`);
      continue;
    }
    fs.writeFileSync(abs, fs.readFileSync(path.join(batch.dir, e.backup)));
  }
  for (const op of [...batch.journal.ops].reverse()) {
    try {
      if (op.op === 'mkdir') fs.rmdirSync(path.join(ctx.vaultDir, op.path));
      else if (op.op === 'rmdir') fs.mkdirSync(path.join(ctx.vaultDir, op.path));
      else if (op.op === 'write') {
        const abs = path.join(ctx.vaultDir, op.path);
        if (!exists(abs) || sha256(fs.readFileSync(abs)) !== op.afterSha) notes.push(`not restored (changed since): ${op.path}`);
        else if (op.backup) fs.writeFileSync(abs, fs.readFileSync(path.join(batch.dir, op.backup)));
        else fs.unlinkSync(abs);
      } else if (op.op === 'rmfile') fs.writeFileSync(path.join(ctx.vaultDir, op.path), fs.readFileSync(path.join(batch.dir, op.backup)));
      else fs.renameSync(path.join(ctx.vaultDir, op.to), path.join(ctx.vaultDir, op.from));
    } catch (e) {
      notes.push(`could not undo row ${op.n} (${op.op}): ${e.message}`);
    }
  }
  batch.journal.undone = true;
  writeJson(path.join(batch.dir, 'journal.json'), batch.journal);
  const cardsFile = workFile(ctx, 'cards.json');
  if (batch.journal.aboutHashesBefore && exists(cardsFile)) writeJson(cardsFile, { ...readJson(cardsFile), aboutHashes: batch.journal.aboutHashesBefore });
  const planFile = path.resolve(args.plan || workFile(ctx, 'plan.json'));
  try {
    const data = readJson(planFile);
    const marked = (Array.isArray(data) ? data : data?.rows || []).filter((r) => r?.applied === batch.name);
    for (const r of marked) delete r.applied;
    if (marked.length) writeJson(planFile, data);
  } catch {
    // no plan file, or one that cannot be read: there is no mark to take back
  }
  // compare with the state before the batch: the identity map
  const before = readJson(path.join(batch.dir, 'before.json'));
  const now = listVault(ctx.vaultDir);
  const nowSet = new Set(now.files.map((f) => f.rel));
  const wrong = [];
  for (const [p, info] of Object.entries(before.files)) {
    const abs = path.join(ctx.vaultDir, p);
    if (!nowSet.has(p)) wrong.push(`missing: ${p}`);
    else if (fingerprint(abs, fs.statSync(abs)) !== info.sha) wrong.push(`changed: ${p}`);
  }
  for (const f of now.files) if (!(f.rel in before.files)) wrong.push(`extra: ${f.rel}`);
  const ok = !notes.length && !wrong.length;
  done(ok ? 0 : 1, { status: ok ? 'undone' : 'undone-with-problems', batch: batch.name, notes, differences: wrong },
    [ok ? `reorganize: batch ${batch.name} taken back; the vault is as it was before it (${Object.keys(before.files).length} files compared)` : `reorganize: batch ${batch.name} taken back with problems`,
      ...notes.map((x) => `  ${x}`), ...wrong.slice(0, 20).map((x) => `  ${x}`)].join('\n'));
}

if (command === 'finish') {
  const work = defaultWork();
  if (!exists(path.join(work, MARKER))) done(0, { status: 'nothing-to-do', work }, `reorganize: no work folder at ${work}`);
  fs.rmSync(work, { recursive: true, force: true });
  done(0, { status: 'finished', work }, `reorganize: removed the work folder ${work}`);
}
