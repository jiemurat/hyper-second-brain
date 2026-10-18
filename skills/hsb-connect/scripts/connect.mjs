#!/usr/bin/env node
/*
connect.mjs - the mechanical part of hsb-connect: it measures the vault, prints short cards of the notes, writes tags
and link properties into the notes' properties (the YAML block at the top of a note) without touching the text after
them, creates and extends maps of content (MOCs), checks the vault against the tag standard, and takes the last batch
back. Part of hyper-second-brain: it runs from the skill folder and is not copied into the project. Node 18 or newer,
no dependencies.

Usage:
  node <skill>/scripts/connect.mjs measure --root <project> [--list] [--json]
  node <skill>/scripts/connect.mjs cards   --root <project> [--scope <folder>] [--missing] [--from N] [--count N] [--json]
  node <skill>/scripts/connect.mjs apply   --root <project> --changes <file> [--spec <file>] [--dry-run] [--backup-confirmed] [--json]
  node <skill>/scripts/connect.mjs moc     --root <project> --spec <file> [--dry-run] [--backup-confirmed] [--json]
  node <skill>/scripts/connect.mjs check   --root <project> [--scope <folder>] [--base <commit>] [--list] [--json]
  node <skill>/scripts/connect.mjs undo    --root <project> [--json]
  node <skill>/scripts/connect.mjs finish  --root <project>

The standard is the file hyper-second-brain/tags.md of the project (the skill's templates/tags.md is its form): the
tables "Settings" (Home page, Excluded), "Prefixes" (Prefix, Meaning, Per note one|any, Soft limit), "Tags" (Tag,
Meaning), "Old tags" (Old tag, New tag) and "Link properties" (Property, Meaning). apply, moc and check need it.
Paths in --changes, --spec and --scope are relative to the vault. Links are written in the shortest form Obsidian
resolves to one file: [[name]] when no other file in the Obsidian vault has that name (compared without letter case,
after Unicode NFC), otherwise the full path from the Obsidian vault root.
--changes: {"<path>": {"tags": [...], "<link property>": [...], "remove": {"tags": [...], "<link property>": [...]}}};
tags and links are added to the ones a note has, the existing tags are mapped by "Old tags", "remove" takes values
out. A link is a path, a note name or "[[...]]". When one file is refused, nothing is written. A link must lead to an
existing file; --spec (the MOC spec of the same batch) lets apply link to the MOCs it names before moc creates them, and
a --dry-run also counts the _about.md of every existing folder as there, so that the plan can be checked before those
files are written. Run moc before apply, and write the missing _about.md files before both.
--spec: one MOC or an array: {"path", "intro", "tags": [...], "up": [...], "groups": [{"heading", "links":
[{"to", "alias"}]}]}. A new MOC is created with the tag type/moc; an existing one must carry type/moc, and only the
links it does not hold yet are added, at the end of their group (a new group at the end); no line is removed.
The work folder (the original of each changed file, the batch journals) is a temporary folder outside the project
and the vault (measure names it; --work names another one); finish removes it. The first batch of a run needs a way
back: the vault committed in git (an uncommitted _about.md aside), or --backup-confirmed after the user confirmed a
backup; the later batches of the run stand on it while the commit stays the same. check compares the text after the properties with --base (a git commit) or, without
it, with the text each file had before the first batch of this run; MOCs are left out of that comparison.
Exit codes: 0 done (check: no fail), 1 needs attention (a file was refused, the check found a fail), 2 usage,
3 hyper-second-brain is not set up here, 4 the project is older than these skills, 5 the standard
hyper-second-brain/tags.md is missing or has errors, 6 the vault has no way back from a mistake.
*/
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  FOLDER, exists, isDir, readText, eolOf, readManifest, parseProjectMd, skillVersion, compareVersions, obsidianRoot,
} from './hsb-lib.mjs';

const SKILL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STANDARD = 'tags.md'; // in the project's hyper-second-brain/ folder
const ABOUT = '_about.md';
const LIST = 'Project List.md';
const MOC_TAG = 'type/moc';
const INSTRUCTION_FILES = ['AGENTS.md', 'CLAUDE.md', 'GEMINI.md'];
const KNOWN_PLUGINS = ['dataview', 'templater-obsidian', 'periodic-notes', 'obsidian-excalidraw-plugin', 'tag-wrangler'];
const ALIAS_MAX = 60;

// ---- command line ------------------------------------------------------------------------------

const COMMANDS = ['measure', 'cards', 'apply', 'moc', 'check', 'undo', 'finish'];
const VALUED = ['--root', '--work', '--scope', '--from', '--count', '--changes', '--spec', '--base'];
const BOOLEAN = ['--json', '--list', '--missing', '--dry-run', '--backup-confirmed'];

function usage(message) {
  if (message) console.error(`connect: ${message}`);
  console.error(`usage: node <skill>/scripts/connect.mjs <${COMMANDS.join('|')}> --root <project> [options]`);
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
  } else if (BOOLEAN.includes(a)) args[a.replace(/^--/, '').replace(/-(\w)/g, (_, c) => c.toUpperCase())] = true;
  else usage(`unknown argument ${a}`);
}
if (!args.root) usage('--root is required');
for (const k of ['from', 'count']) if (args[k] !== undefined && !/^[1-9]\d*$/.test(args[k])) usage(`--${k} takes a positive number`);
if (command === 'apply' && !args.changes) usage('apply needs --changes <file>');
if (command === 'moc' && !args.spec) usage('moc needs --spec <file>');
if (args.scope !== undefined) args.scope = args.scope.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
const root = path.resolve(args.root);
if (!isDir(root)) usage(`no such folder: ${root}`);

function done(code, value, text) {
  console.log(args.json ? JSON.stringify(value, null, 2) : text);
  process.exit(code);
}
const stop = (code, message, extra = {}) => done(code, { status: 'stopped', code, message, ...extra }, `connect: ${message}`);

// ---- small helpers -----------------------------------------------------------------------------

const posix = path.posix;
const sha256 = (data) => crypto.createHash('sha256').update(data).digest('hex');
const nfc = (s) => s.normalize('NFC');
const key = (s) => nfc(s).toLowerCase();
const lt = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const under = (p, folder) => !folder || p === folder || p.startsWith(`${folder}/`);
const readJson = (file) => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
};

/** Every file under dir (hidden entries and symbolic links left out), paths relative to dir with '/'. */
function walk(dir, rel = '', out = []) {
  for (const e of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
    if (e.name.startsWith('.') || e.isSymbolicLink() || e.name === 'node_modules') continue;
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) walk(dir, r, out);
    else if (e.isFile()) out.push(r);
  }
  return out;
}

// ---- the project, the vault and Obsidian ---------------------------------------------------------

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
  const projectFile = path.join(root, FOLDER, 'project.md');
  if (!exists(projectFile)) stop(1, `${FOLDER}/project.md is missing; run hsb-doctor`);
  const project = parseProjectMd(readText(projectFile));
  if (!project.vault) stop(1, `${FOLDER}/project.md lacks the Vault line; run hsb-doctor`);
  const vaultDir = path.resolve(root, project.vault);
  if (!isDir(vaultDir)) stop(1, `the vault folder ${project.vault}/ does not exist; run hsb-doctor`);
  const ob = obsidian(vaultDir);
  return { project, vaultRel: project.vault, vaultDir, folders: project.folders, ob, work: path.resolve(args.work || path.join(os.tmpdir(), `hsb-connect-${sha256(root).slice(0, 10)}`)) };
}

/** The Obsidian vault root (the nearest folder with .obsidian/, from the vault up to the project) and its settings. */
function obsidian(vaultDir) {
  const { found, rootDir: base, prefix, conf, templates } = obsidianRoot(root, vaultDir);
  const app = conf('app.json') || {};
  const community = conf('community-plugins.json') || [];
  const core = conf('core-plugins.json');
  const coreOn = Array.isArray(core) ? core : core ? Object.keys(core).filter((k) => core[k]) : [];
  const daily = conf('daily-notes.json')?.template || conf('plugins/periodic-notes/data.json')?.daily?.template || null;
  return {
    found: Boolean(found),
    rootDir: base,
    rootRel: path.relative(root, base).split(path.sep).join('/') || '.',
    prefix,
    alwaysUpdateLinks: app.alwaysUpdateLinks ?? null,
    newLinkFormat: app.newLinkFormat ?? null,
    useMarkdownLinks: app.useMarkdownLinks ?? null,
    plugins: community,
    known: KNOWN_PLUGINS.filter((p) => community.includes(p)).concat(coreOn.includes('bases') ? ['bases (core)'] : []),
    templates,
    dailyTemplate: daily,
  };
}

// ---- properties (the YAML block at the top of a note) -----------------------------------------------

/**
 * A note split into its properties and its text: {props: [lines] | null, body, eol, error}.
 * The properties start at the first line "---" and end at the next line "---"; the body is every byte after that line.
 */
function split(text) {
  const eol = eolOf(text);
  if (text.charCodeAt(0) === 0xfeff) return { props: null, body: text, eol, error: 'the file starts with a byte order mark' };
  const first = /^---[ \t]*(\r?\n)/.exec(text);
  if (!first) return { props: null, body: text, eol, error: null };
  const close = /^---[ \t]*(\r?\n|$)/gm;
  close.lastIndex = first[0].length;
  const m = close.exec(text);
  if (!m) return { props: null, body: text, eol, error: 'the properties block has no closing line ---' };
  const inner = text.slice(first[0].length, m.index).replace(/\r?\n$/, '');
  return { props: inner === '' && m.index === first[0].length ? [] : inner.split(/\r?\n/), body: text.slice(m.index + m[0].length), eol, error: null };
}

const KEY_LINE = /^("[^"]*"|'[^']*'|[^\s#\-"'][^:]*?)\s*:(?:\s+(.*?))?\s*$/u;

/** The top-level keys of a properties block: [{key, start, end, rest}], or {error}. */
function keysOf(lines) {
  const entries = [];
  const seen = new Set();
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim() || /^\s/.test(line) || /^-(\s|$)/.test(line) || line.startsWith('#')) {
      if (!entries.length && line.trim() && !line.startsWith('#')) return { error: `line ${i + 2} of the properties belongs to no key` };
      if (entries.length) entries[entries.length - 1].end = i + 1;
      continue;
    }
    const m = KEY_LINE.exec(line);
    if (!m) return { error: `line ${i + 2} of the properties is not a key` };
    const k = m[1].replace(/^["']|["']$/g, '');
    if (seen.has(k)) return { error: `the property ${k} appears twice` };
    seen.add(k);
    entries.push({ key: k, start: i, end: i + 1, rest: m[2] ?? '' });
  }
  return { entries };
}

function unquote(s) {
  const t = s.trim();
  if (t.length >= 2 && t.startsWith('"') && t.endsWith('"')) return t.slice(1, -1).replace(/\\(["\\])/g, '$1');
  if (t.length >= 2 && t.startsWith("'") && t.endsWith("'")) return t.slice(1, -1).replace(/''/g, "'");
  return t;
}
const isQuoted = (s) => /^(".*"|'.*')$/.test(s.trim());

/** The items of a flow list "[a, "b, c", d]" (without the brackets), or null when the quotes do not close. */
function flowItems(inner) {
  const items = [];
  let cur = '';
  let q = null;
  for (const ch of inner) {
    if (q) {
      cur += ch;
      if (ch === q) q = null;
    } else if (ch === '"' || ch === "'") {
      q = ch;
      cur += ch;
    } else if (ch === ',') {
      items.push(cur);
      cur = '';
    } else cur += ch;
  }
  if (q) return null;
  if (cur.trim()) items.push(cur);
  return items.map((s) => s.trim()).filter(Boolean);
}

/**
 * The values of one key as a list: {values: [{text, quoted}], form} or {error}. Read forms: a block list, a flow list
 * [a, b], one value, nothing; a bare [[link]] (YAML reads it as a nested list) is read as a link that is not quoted.
 */
function valuesOf(entry, lines) {
  const rest = entry.rest;
  const more = lines.slice(entry.start + 1, entry.end).filter((l) => l.trim() && !/^\s*#/.test(l));
  const item = (raw) => ({ text: unquote(raw), quoted: isQuoted(raw) });
  if (!rest) {
    const values = [];
    for (const l of more) {
      const m = /^\s*-(?:\s+(.*?))?\s*$/.exec(l);
      if (!m) return { error: `${entry.key} holds something other than a list` };
      if (m[1] !== undefined && m[1] !== '') values.push(item(m[1]));
    }
    return { values, form: more.length ? 'block' : 'empty' };
  }
  if (more.length) return { error: `${entry.key} runs over several lines in a form this script does not read` };
  if (/^\[\[[^\]]*\]\]$/.test(rest)) return { values: [{ text: rest, quoted: false }], form: 'scalar' };
  if (rest.startsWith('[')) {
    if (!rest.endsWith(']')) return { error: `${entry.key} is a list without its closing ]` };
    const items = flowItems(rest.slice(1, -1));
    if (!items) return { error: `${entry.key} has a quote that does not close` };
    return { values: items.map(item), form: 'flow' };
  }
  if (rest === 'null' || rest === '~' || rest === '""' || rest === "''") return { values: [], form: 'empty' };
  if (/^[|>{&*!]/.test(rest)) return { error: `${entry.key} is in a YAML form this script does not read` };
  return { values: [item(rest)], form: 'scalar' };
}

/** The tags written in a value list: "#" dropped, a one-line value split at commas and spaces. */
const tagsFrom = (values, form) => values.flatMap((v) => (form === 'scalar' && !v.quoted ? v.text.split(/[,\s]+/) : [v.text])).map((t) => t.trim().replace(/^#/, '')).filter(Boolean);

/** A note read for its properties: {props, body, eol, entries, get(key) -> {values, form, error}, error}. */
function readNote(text) {
  const s = split(text);
  const note = { ...s, entries: [], tags: [], error: s.error };
  if (s.error || !s.props) return note;
  const k = keysOf(s.props);
  if (k.error) {
    note.error = k.error;
    return note;
  }
  note.entries = k.entries;
  note.get = (name) => {
    const e = k.entries.find((x) => x.key === name);
    return e ? valuesOf(e, s.props) : null;
  };
  if (note.entries.some((e) => e.key === 'tag')) note.error = 'the property tag (Obsidian reads tags) is present';
  const t = note.get('tags');
  if (t?.error) note.error = t.error;
  else if (t) note.tags = tagsFrom(t.values, t.form);
  return note;
}
const noteGet = (note, name) => (note.get ? note.get(name) : null);

const yamlString = (s) => `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
const renderKey = (name, values, quote) => [`${name}:`, ...values.map((v) => `  - ${quote ? yamlString(v) : v}`)];

/** The note's text with the given keys set (values: list of strings; null removes the key); the body stays as it was. */
function withKeys(text, note, set) {
  const eol = note.eol;
  let lines = note.props ? [...note.props] : [];
  const entries = note.props ? note.entries : [];
  const replacements = [];
  const appended = [];
  for (const [name, { values, quote }] of Object.entries(set)) {
    const rendered = values && values.length ? renderKey(name, values, quote) : [];
    const e = entries.find((x) => x.key === name);
    if (e) replacements.push({ start: e.start, end: e.end, rendered });
    else appended.push(...rendered);
  }
  replacements.sort((a, b) => b.start - a.start);
  for (const r of replacements) lines.splice(r.start, r.end - r.start, ...r.rendered);
  // a key's range may end with blank lines that belonged to it: keep them out of the way of the appended keys
  let tail = lines.length;
  while (tail > 0 && !lines[tail - 1].trim()) tail--;
  lines = [...lines.slice(0, tail), ...appended, ...lines.slice(tail)];
  if (!lines.length && !note.props) return text;
  return `---${eol}${lines.join(eol)}${lines.length ? eol : ''}---${eol}${note.body}`;
}

// ---- the standard (hyper-second-brain/tags.md) --------------------------------------------------------

const SEGMENT = '[\\p{Ll}\\p{Lo}\\p{Lm}\\p{N}][\\p{Ll}\\p{Lo}\\p{Lm}\\p{N}_-]*';
const TAG_FORM = new RegExp(`^${SEGMENT}(?:/${SEGMENT})+$`, 'u');
const PROP_FORM = /^[\p{L}\p{N}_][\p{L}\p{N}_ -]*$/u;
const prefixOf = (tag) => (tag.includes('/') ? `${tag.split('/')[0]}/` : '');

function tableRows(sectionText) {
  const rows = [];
  for (const line of (sectionText || '').split(/\r?\n/)) {
    if (!/^\s*\|/.test(line)) continue;
    const cells = line.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
    if (cells.every((c) => /^:?-{3,}:?$/.test(c))) continue;
    rows.push(cells);
  }
  return rows.slice(1); // the first row is the header
}
const bare = (cell) => (cell || '').replace(/`/g, '').trim();
const codeList = (cell) => [...(cell || '').matchAll(/`([^`]+)`/g)].map((m) => m[1].replace(/\/+$/, ''));

/** The standard: {exists, errors, settings, prefixes, tags, old, links, homePage, excluded}. */
function readStandard() {
  const file = path.join(root, FOLDER, STANDARD);
  const std = { exists: exists(file), errors: [], prefixes: [], tags: new Map(), old: new Map(), links: [], homePage: null, excluded: [] };
  if (!std.exists) return std;
  const sections = {};
  let cur = '';
  for (const line of readText(file).split(/\r?\n/)) {
    const h = /^##\s+(.+?)\s*$/.exec(line);
    if (h) cur = h[1];
    else sections[cur] = `${sections[cur] || ''}${line}\n`;
  }
  for (const s of ['Settings', 'Prefixes', 'Tags', 'Old tags', 'Link properties']) if (!(s in sections)) std.errors.push(`the section "## ${s}" is missing`);
  for (const [name, value] of tableRows(sections.Settings)) {
    if (/^home page$/i.test(bare(name))) std.homePage = /^none$/i.test(bare(value)) || !bare(value) ? null : bare(value);
    if (/^excluded$/i.test(bare(name))) std.excluded = codeList(value);
  }
  for (const [p, , per, limit] of tableRows(sections.Prefixes)) {
    const prefix = bare(p);
    if (!/^[\p{Ll}\p{Lo}\p{Lm}\p{N}][\p{Ll}\p{Lo}\p{Lm}\p{N}_-]*\/$/u.test(prefix)) {
      std.errors.push(`the prefix "${prefix}" is not lowercase words and hyphens ending with /`);
      continue;
    }
    const one = /^one$/i.test(bare(per));
    if (!one && !/^any$/i.test(bare(per))) std.errors.push(`the prefix ${prefix} needs "one" or "any" under "Per note"`);
    const n = /^\d+$/.test(bare(limit)) ? Number(bare(limit)) : null;
    std.prefixes.push({ prefix, one, limit: n });
  }
  const known = new Set(std.prefixes.map((p) => p.prefix));
  for (const [t] of tableRows(sections.Tags)) {
    const tag = bare(t);
    if (!TAG_FORM.test(tag)) std.errors.push(`the tag "${tag}" is not in the form prefix/lowercase-words`);
    else if (!known.has(prefixOf(tag))) std.errors.push(`the tag ${tag} has a prefix that "Prefixes" does not list`);
    else if (std.tags.has(tag)) std.errors.push(`the tag ${tag} is listed twice`);
    std.tags.set(tag, true);
  }
  if (!std.tags.has(MOC_TAG)) std.errors.push(`the tag ${MOC_TAG} (a map of content) is missing from "Tags"`);
  for (const [o, n] of tableRows(sections['Old tags'])) {
    const from = bare(o).replace(/^#/, '');
    const to = codeList(n).length ? codeList(n) : bare(n).split(/[,\s]+/).filter(Boolean);
    if (!from) continue;
    const unknown = to.filter((t) => !std.tags.has(t));
    if (!to.length) std.errors.push(`the old tag ${from} maps to nothing`);
    else if (unknown.length) std.errors.push(`the old tag ${from} maps to ${unknown.join(', ')}, which "Tags" does not list`);
    std.old.set(key(from), to);
  }
  for (const [p] of tableRows(sections['Link properties'])) {
    const prop = bare(p);
    if (!PROP_FORM.test(prop) || prop === 'tags') std.errors.push(`the link property "${prop}" cannot be used`);
    else std.links.push(prop);
  }
  if (!std.links.includes('up')) std.errors.push('the link property up is missing from "Link properties"');
  return std;
}

function needStandard() {
  const std = readStandard();
  if (!std.exists) stop(5, `${FOLDER}/${STANDARD} is missing: agree on the standard with the user and write it from the skill's templates/tags.md`);
  if (std.errors.length) stop(5, `${FOLDER}/${STANDARD} has errors:\n  ${std.errors.join('\n  ')}`, { errors: std.errors });
  return std;
}

/** The tags in their order: by the order of "Prefixes", then as they came. */
function orderTags(tags, std) {
  const rank = (t) => {
    const i = std.prefixes.findIndex((p) => p.prefix === prefixOf(t));
    return i < 0 ? std.prefixes.length : i;
  };
  return [...new Set(tags)].map((t, i) => ({ t, i })).sort((a, b) => rank(a.t) - rank(b.t) || a.i - b.i).map((x) => x.t);
}

// ---- the files of the Obsidian vault and links ----------------------------------------------------------

/** The index of every file Obsidian sees, by path and by name. Paths are relative to the Obsidian vault root. */
function buildIndex(ctx) {
  const files = walk(ctx.ob.rootDir);
  const byPath = new Map();
  const byName = new Map();
  const add = (map, k, p) => {
    const a = map.get(k);
    if (!a) map.set(k, [p]);
    else if (!a.includes(p)) a.push(p);
  };
  const index = { files, byPath, byName };
  index.add = (p) => {
    add(byPath, key(p), p);
    const base = posix.basename(p);
    add(byName, key(base), p);
    if (/\.md$/i.test(p)) {
      add(byPath, key(p.slice(0, -3)), p);
      add(byName, key(base.slice(0, -3)), p);
    }
  };
  for (const p of files) index.add(p);
  return index;
}

/** What a link target means: {kind: path|name|partial|ambiguous|none, path, hits}. */
function resolve(index, raw) {
  let t = raw.trim().replace(/^\[\[|\]\]$/g, '').split('|')[0].split('#')[0].trim().replace(/\\/g, '/').replace(/^\/+/, '');
  if (!t) return { kind: 'none', hits: [] };
  t = key(t);
  if (t.includes('/')) {
    const exact = index.byPath.get(t);
    if (exact?.length === 1) return { kind: 'path', path: exact[0], hits: exact };
    const hits = index.files.filter((p) => {
      const k = key(p);
      return k.endsWith(`/${t}`) || k.endsWith(`/${t}.md`);
    });
    if (hits.length === 1) return { kind: 'partial', path: hits[0], hits };
    return { kind: hits.length ? 'ambiguous' : 'none', hits };
  }
  const hits = index.byName.get(t) || [];
  if (hits.length === 1) return { kind: 'name', path: hits[0], hits };
  return { kind: hits.length ? 'ambiguous' : 'none', hits };
}

/**
 * The shortest link to a file that Obsidian resolves to it alone; a name every folder may hold (_about.md, an
 * instruction file) always gets the full path, so that the link holds when another folder gets one.
 */
function linkTo(index, obPath) {
  const base = posix.basename(obPath);
  const name = /\.md$/i.test(obPath) ? base.slice(0, -3) : base;
  const full = /\.md$/i.test(obPath) ? obPath.slice(0, -3) : obPath;
  const shared = base === ABOUT || INSTRUCTION_FILES.includes(base);
  return nfc(!shared && (index.byName.get(key(name)) || []).length === 1 ? `[[${name}]]` : `[[${full}]]`);
}

const toOb = (ctx, vaultPath) => (ctx.ob.prefix ? `${ctx.ob.prefix}/${vaultPath}` : vaultPath);
const toVault = (ctx, obPath) => {
  if (!ctx.ob.prefix) return obPath;
  return obPath.startsWith(`${ctx.ob.prefix}/`) ? obPath.slice(ctx.ob.prefix.length + 1) : null;
};

/** A link the user or the agent gave (a vault path, a note name or "[[...]]"): {path} in the Obsidian vault, or {error}. */
function target(ctx, index, given) {
  const raw = String(given).trim();
  const inner = raw.replace(/^\[\[|\]\]$/g, '');
  const viaVault = !raw.startsWith('[[') && inner.includes('/') ? resolve(index, toOb(ctx, inner)) : null;
  const r = viaVault && viaVault.kind === 'path' ? viaVault : resolve(index, inner);
  if (r.kind === 'path' || r.kind === 'name') return { path: r.path };
  if (r.kind === 'partial') return { path: r.path };
  if (r.kind === 'ambiguous') return { error: `the link ${raw} fits ${r.hits.length} files (${r.hits.slice(0, 3).join(', ')}); give the path` };
  return { error: `the link ${raw} leads to no file` };
}

/** The text with fenced code blocks and code spans blanked (same length), so that tags and links in code do not count. */
function maskCode(text) {
  const blank = (m) => m.replace(/[^\n]/g, ' ');
  return text.replace(/^(```|~~~)[^\n]*\n[\s\S]*?\n\1[^\n]*$/gm, blank).replace(/`[^`\n]*`/g, blank);
}
const WIKI = /!?\[\[([^\]\n]+)\]\]/g;
const bodyLinks = (body) => [...maskCode(body).matchAll(WIKI)].map((m) => m[1]);
const INLINE_TAG = /(^|[\s(])#([\p{L}\p{N}_/-]*[\p{L}_/-][\p{L}\p{N}_/-]*)/gu;
const inlineTags = (body) => [...maskCode(body).matchAll(INLINE_TAG)].map((m) => m[2]);

// ---- the notes the standard covers ------------------------------------------------------------------------

/** Each Markdown file of the vault: {path, note, excluded: reason | null}. */
function notesOf(ctx, std) {
  const projects = ctx.folders.Projects;
  const notes = [];
  for (const p of walk(ctx.vaultDir).filter((f) => /\.md$/i.test(f)).sort(lt)) {
    const name = posix.basename(p);
    const text = fs.readFileSync(path.join(ctx.vaultDir, p), 'utf8');
    const note = readNote(text);
    let excluded = null;
    if (name === ABOUT) excluded = 'folder about file';
    else if (INSTRUCTION_FILES.includes(name)) excluded = 'instruction file';
    else if (projects && p === `${projects}/${LIST}`) excluded = 'Project List';
    else if (/\.excalidraw\.md$/i.test(name) || note.entries.some((e) => e.key === 'excalidraw-plugin')) excluded = 'Excalidraw drawing';
    else if (ctx.ob.templates.some((t) => under(p, t))) excluded = 'templates folder';
    else if (std && std.excluded.some((x) => under(key(p), key(x)))) excluded = 'excluded by the standard';
    notes.push({ path: p, text, note, excluded });
  }
  return notes;
}

// ---- the way back and the work folder -------------------------------------------------------------------

const runFile = (ctx) => path.join(ctx.work, 'run.json');
const readRun = (ctx) => readJson(runFile(ctx)) || { bodies: {}, batches: [] };
const writeRun = (ctx, run) => {
  fs.mkdirSync(ctx.work, { recursive: true });
  fs.writeFileSync(runFile(ctx), `${JSON.stringify(run, null, 2)}\n`);
};

/** The commit the project's git is at, or 'none'. */
const gitHead = () => spawnSync('git', ['-C', root, 'rev-parse', '--verify', 'HEAD'], { encoding: 'utf8' }).stdout?.trim() || 'none';

function wayBack(ctx) {
  const git = (...a) => {
    const r = spawnSync('git', ['-C', root, ...a], { encoding: 'utf8' });
    return { status: r.status ?? 1, stdout: r.stdout || '' };
  };
  if (git('rev-parse', '--is-inside-work-tree').status !== 0) return { state: 'no-git', detail: 'the project is not a git repository (or git is not installed)' };
  if (git('rev-parse', '--verify', 'HEAD').status !== 0) return { state: 'no-commit', detail: 'the repository has no commit yet' };
  if (git('check-ignore', '-q', ctx.vaultRel).status === 0) return { state: 'ignored', detail: `git ignores ${ctx.vaultRel}/, so it is no way back` };
  // the _about.md files the agent writes by hand before a batch are no change of a note: the script never writes them
  const dirty = git('-c', 'core.quotepath=off', 'status', '--porcelain', '-uall', '--', ctx.vaultRel).stdout.split('\n').filter(Boolean).map((l) => nfc(l.slice(3).replace(/^"|"$/g, ''))).filter((p) => posix.basename(p) !== ABOUT);
  if (!dirty.length) return { state: 'clean', detail: `${ctx.vaultRel}/ is committed in git (changed _about.md files aside)` };
  const top = git('rev-parse', '--show-toplevel').stdout.trim();
  const prefix = top ? path.relative(fs.realpathSync.native(top), fs.realpathSync.native(ctx.vaultDir)).split(path.sep).join('/') : ctx.vaultRel;
  const touched = new Set(Object.keys(readRun(ctx).bodies).map(nfc));
  const mine = dirty.filter((p) => touched.has(prefix && p.startsWith(`${prefix}/`) ? p.slice(prefix.length + 1) : p));
  if (touched.size && mine.length === dirty.length) return { state: 'journal', detail: `${dirty.length} uncommitted change(s) in ${ctx.vaultRel}/, all made by earlier batches of this run; undo can take them back` };
  return { state: 'dirty', detail: `${dirty.length - mine.length} uncommitted change(s) in ${ctx.vaultRel}/ that no batch of this run made; commit them first` };
}

/** Writes the files of one batch, keeping the originals for undo: writes = [{path, text, created}]. */
function writeBatch(ctx, writes) {
  const run = readRun(ctx);
  const n = String((run.batches.at(-1) ?? 0) + 1).padStart(3, '0');
  const dir = path.join(ctx.work, `batch-${n}`);
  const journal = { batch: n, files: {} };
  for (const w of writes) {
    const file = path.join(ctx.vaultDir, w.path);
    const before = w.created ? null : fs.readFileSync(file);
    if (before) {
      const copy = path.join(dir, 'files', w.path);
      fs.mkdirSync(path.dirname(copy), { recursive: true });
      fs.writeFileSync(copy, before);
    }
    // the first text of each file the run touches (null for a file the run created): the way back and the body check use it
    if (!(w.path in run.bodies)) run.bodies[w.path] = { body: before ? sha256(split(before.toString('utf8')).body) : null, batch: n };
    journal.files[w.path] = { created: Boolean(w.created), before: before ? sha256(before) : null, after: sha256(Buffer.from(w.text)) };
  }
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'journal.json'), `${JSON.stringify(journal, null, 2)}\n`);
  run.batches.push(Number(n));
  if (run.batches.length === 1) run.head = gitHead(); // the later batches of the run stand on this way back while the commit stays
  writeRun(ctx, run);
  for (const w of writes) fs.writeFileSync(path.join(ctx.vaultDir, w.path), w.text);
  return n;
}

function needWayBack(ctx) {
  // a run starts from a way back; its later batches stand on it, together with the hand edits between them
  // (an _about.md, the standard), which git or the confirmed backup also takes back
  const run = readRun(ctx);
  if (run.batches.length && run.head === gitHead()) return { state: 'run', detail: `this run's first batch started from a way back; undo takes each batch back` };
  const back = wayBack(ctx);
  if (['clean', 'journal'].includes(back.state) || args.backupConfirmed) return back;
  stop(6, `nothing was changed; the vault has no way back (${back.state}: ${back.detail}). Ask the user to commit the vault, or to confirm a backup and run again with --backup-confirmed`, { wayBack: back });
}

// ---- measure ---------------------------------------------------------------------------------------------

function measure() {
  const ctx = setup();
  const std = readStandard();
  const notes = notesOf(ctx, std.exists ? std : null);
  const index = buildIndex(ctx);
  const top = (p) => (p.includes('/') ? p.split('/')[0] : '(vault root)');
  const folders = {};
  const propTags = new Map();
  const inline = new Map();
  const keys = new Map();
  const bump = (m, k) => m.set(k, (m.get(k) || 0) + 1);
  let bytes = 0;
  const unreadable = [];
  const inlineFields = [];
  const dataview = [];
  for (const n of notes) {
    bytes += Buffer.byteLength(n.text);
    const f = (folders[top(n.path)] ||= { notes: 0, withProperties: 0, withTags: 0, withUp: 0, excluded: 0 });
    f.notes++;
    if (n.excluded) f.excluded++;
    if (n.note.props) f.withProperties++;
    if (n.note.tags.length) f.withTags++;
    if (noteGet(n.note, 'up')?.values?.length) f.withUp++;
    if (n.note.error) unreadable.push({ path: n.path, error: n.note.error });
    for (const t of n.note.tags) bump(propTags, t);
    for (const e of n.note.entries) bump(keys, e.key);
    for (const t of inlineTags(n.note.body)) bump(inline, t);
    if (/^[^\n`]*\w::\s*\[\[/m.test(n.note.body)) inlineFields.push(n.path);
    for (const m of n.note.body.matchAll(/^(```|~~~)\s*(dataview|dataviewjs)[^\n]*\n([\s\S]*?)\n\1/gm)) {
      const tags = [...m[3].matchAll(/#[\p{L}\p{N}_/-]+/gu)].map((x) => x[0]);
      if (tags.length) dataview.push({ path: n.path, tags: [...new Set(tags)] });
    }
  }
  const all = walk(ctx.vaultDir);
  const bases = [];
  for (const p of all.filter((f) => /\.base$/i.test(f))) {
    const lines = fs.readFileSync(path.join(ctx.vaultDir, p), 'utf8').split(/\r?\n/).filter((l) => /inFolder\(|hasTag\(|tags/.test(l)).map((l) => l.trim());
    if (lines.length) bases.push({ path: p, lines });
  }
  const canvases = [];
  for (const p of all.filter((f) => /\.canvas$/i.test(f))) {
    const data = readJson(path.join(ctx.vaultDir, p));
    const files = (data?.nodes || []).filter((x) => x.file).map((x) => x.file);
    if (files.length) canvases.push({ path: p, files: files.length });
  }
  // notes that share a name (letter case and Unicode form ignored): a link to them needs the full path
  const groups = new Map();
  for (const p of index.files.filter((f) => /\.md$/i.test(f))) {
    const k = key(posix.basename(p));
    groups.set(k, [...(groups.get(k) || []), p]);
  }
  const isStandardName = (name) => name === ABOUT || INSTRUCTION_FILES.includes(name) || /^[A-Z0-9_-]+\.md$/.test(name);
  const shared = [...groups.values()].filter((list) => list.length > 1);
  const repeated = shared.filter((list) => !isStandardName(posix.basename(list[0]))).map((list) => list.map((p) => toVault(ctx, p) ?? `(outside the vault) ${p}`));
  const standardNames = shared.filter((list) => isStandardName(posix.basename(list[0]))).map((list) => ({ name: posix.basename(list[0]), count: list.length }));
  const sorted = (m) => [...m.entries()].sort((a, b) => b[1] - a[1] || lt(a[0], b[0])).map(([name, count]) => ({ name, count }));
  const run = readRun(ctx);
  const back = wayBack(ctx);
  const value = {
    status: 'measured',
    vault: ctx.vaultRel,
    obsidian: { found: ctx.ob.found, root: ctx.ob.rootRel, vaultPrefix: ctx.ob.prefix, alwaysUpdateLinks: ctx.ob.alwaysUpdateLinks, newLinkFormat: ctx.ob.newLinkFormat, useMarkdownLinks: ctx.ob.useMarkdownLinks, plugins: ctx.ob.plugins, known: ctx.ob.known, templates: ctx.ob.templates, dailyTemplate: ctx.ob.dailyTemplate },
    counts: { notes: notes.length, inScope: notes.filter((n) => !n.excluded).length, bytes, tokens: Math.round(bytes / 4) },
    folders,
    excluded: notes.filter((n) => n.excluded).map((n) => ({ path: n.path, reason: n.excluded })),
    unreadable,
    tags: sorted(propTags),
    inlineTags: sorted(inline),
    properties: sorted(keys),
    dependents: { bases, dataview, canvases, inlineFields },
    repeatedNames: repeated,
    standardNames,
    standard: { exists: std.exists, errors: std.errors },
    wayBack: back,
    work: ctx.work,
    unfinishedRun: run.batches.length ? run.batches.length : 0,
  };
  const cap = (list, f) => (args.list ? list : list.slice(0, 15)).map(f).join('\n') + (!args.list && list.length > 15 ? `\n    ... ${list.length - 15} more (--list)` : '');
  const tagLine = (list) => (list.length ? cap(list, (t) => `    ${t.name} ${t.count}`) : '    none');
  const text = [
    `connect: measured ${ctx.vaultRel}/ - ${value.counts.notes} notes (${value.counts.inScope} in scope), ${(bytes / 1048576).toFixed(1)} MB of Markdown, about ${value.counts.tokens} tokens to read in full`,
    `obsidian: ${ctx.ob.found ? `vault root ${ctx.ob.rootRel}${ctx.ob.prefix ? `, the notes under ${ctx.ob.prefix}/` : ''}` : 'no .obsidian folder found; links are written from the vault folder'}; alwaysUpdateLinks ${ctx.ob.alwaysUpdateLinks ?? 'not set'}; newLinkFormat ${ctx.ob.newLinkFormat ?? 'not set'}; useMarkdownLinks ${ctx.ob.useMarkdownLinks ?? 'not set'}`,
    `plugins: ${ctx.ob.known.length ? ctx.ob.known.join(', ') : 'none of interest'}; templates folders: ${ctx.ob.templates.length ? ctx.ob.templates.join(', ') : 'none'}${ctx.ob.dailyTemplate ? `; daily note template ${ctx.ob.dailyTemplate}` : ''}`,
    'folders (notes / with properties / with tags / with up / excluded):',
    ...Object.entries(folders).map(([f, c]) => `    ${f}: ${c.notes} / ${c.withProperties} / ${c.withTags} / ${c.withUp} / ${c.excluded}`),
    `tags in properties (${value.tags.length}):`, tagLine(value.tags),
    `inline tags, code left out (${value.inlineTags.length}):`, tagLine(value.inlineTags),
    `properties (${value.properties.length}):`, tagLine(value.properties),
    `excluded (${value.excluded.length}):`, value.excluded.length ? cap(value.excluded, (x) => `    ${x.path} - ${x.reason}`) : '    none',
    `unreadable properties (${unreadable.length}):`, unreadable.length ? cap(unreadable, (x) => `    ${x.path} - ${x.error}`) : '    none',
    `depend on paths or tags: ${bases.length} .base file(s), ${dataview.length} note(s) with Dataview tag queries, ${canvases.length} canvas(es), ${inlineFields.length} note(s) with inline link fields`,
    ...bases.map((b) => `    base ${b.path}: ${b.lines.join(' | ')}`),
    ...dataview.map((d) => `    dataview ${d.path}: ${d.tags.join(' ')}`),
    ...canvases.map((c) => `    canvas ${c.path}: ${c.files} file(s)`),
    `repeated names, letter case ignored (${repeated.length}):`, repeated.length ? cap(repeated, (l) => `    ${l.join('  |  ')}`) : '    none',
    `standard file names: ${standardNames.length ? standardNames.map((x) => `${x.name} ${x.count}`).join(', ') : 'none'}`,
    `standard: ${std.exists ? (std.errors.length ? `${FOLDER}/${STANDARD} has errors: ${std.errors.join('; ')}` : `${FOLDER}/${STANDARD} is there`) : `${FOLDER}/${STANDARD} is missing (a first run)`}`,
    `way back: ${back.state} - ${back.detail}`,
    `work folder: ${ctx.work}`,
    `unfinished run: ${value.unfinishedRun ? `${value.unfinishedRun} batch(es) in ${ctx.work}; undo or finish it` : 'none'}`,
  ];
  done(0, value, text.join('\n'));
}

// ---- cards -----------------------------------------------------------------------------------------------

function cards() {
  const ctx = setup();
  const std = readStandard();
  const notes = notesOf(ctx, std.exists ? std : null).filter((n) => !n.excluded && under(n.path, args.scope));
  const ones = std.exists ? std.prefixes.filter((p) => p.one).map((p) => p.prefix) : ['type/'];
  const gap = (n) => ones.some((p) => !n.note.tags.some((t) => prefixOf(t) === p)) || !noteGet(n.note, 'up')?.values?.length;
  const list = args.missing ? notes.filter(gap) : notes;
  const from = Number(args.from || 1);
  const count = Number(args.count || 50);
  const shown = list.slice(from - 1, from - 1 + count);
  const links = std.exists ? std.links : ['up', 'related', 'source'];
  const items = shown.map((n, i) => {
    const body = maskCode(n.note.body);
    const headings = body.split(/\r?\n/).filter((l) => /^#{1,6}\s/.test(l)).slice(0, 5).map((l) => l.trim());
    const opening = n.note.body.split(/\r?\n/).filter((l) => l.trim() && !/^#{1,6}\s/.test(l)).join(' ').replace(/\s+/g, ' ').slice(0, 160);
    const props = Object.fromEntries(links.map((k) => [k, (noteGet(n.note, k)?.values || []).map((v) => v.text)]).filter(([, v]) => v.length));
    return { n: from + i, path: n.path, tags: n.note.tags, links: props, other: n.note.entries.map((e) => e.key).filter((k) => k !== 'tags' && !links.includes(k)), headings, opening, error: n.note.error };
  });
  const text = [
    `connect: ${list.length} note(s)${args.scope ? ` in ${args.scope}` : ''}${args.missing ? ' with a missing tag or up' : ''}; cards ${list.length ? from : 0}-${from - 1 + shown.length}`,
    ...items.map((c) => [
      `${c.n} ${c.path} | tags: ${c.tags.join(' ') || 'none'} | ${Object.entries(c.links).map(([k, v]) => `${k}: ${v.join(', ')}`).join(' | ') || 'no links'}${c.other.length ? ` | other: ${c.other.join(', ')}` : ''}${c.error ? ` | UNREADABLE: ${c.error}` : ''}`,
      ...c.headings.map((h) => `    ${h}`),
      c.opening ? `    > ${c.opening}` : '    > (no text)',
    ].join('\n')),
    from - 1 + shown.length < list.length ? `next: --from ${from + shown.length}` : 'end of the list',
  ];
  done(0, { status: 'cards', total: list.length, from, cards: items }, text.join('\n'));
}

// ---- apply and moc -------------------------------------------------------------------------------------

/** The vault file a given path means (Unicode form and, when unique, letter case ignored), or null. */
function findVaultNote(notes, given) {
  const g = String(given).replace(/\\/g, '/').replace(/^\/+/, '');
  const exact = notes.find((n) => nfc(n.path) === nfc(g));
  if (exact) return exact;
  const loose = notes.filter((n) => key(n.path) === key(g));
  return loose.length === 1 ? loose[0] : null;
}

/** The new tags and link values of one note, or {error}. spec: {tags, <link>: [...], remove: {...}}. */
function merged(ctx, std, index, n, spec) {
  const note = n.note;
  const remove = spec.remove || {};
  for (const k of Object.keys(spec)) if (k !== 'tags' && k !== 'remove' && !std.links.includes(k)) return { error: `${k} is not a link property of the standard` };
  for (const k of Object.keys(remove)) if (k !== 'tags' && !std.links.includes(k)) return { error: `remove.${k} is not a link property of the standard` };
  const set = {};
  // tags: the note's own, mapped by "Old tags", then the given ones, without the removed ones
  const own = note.tags.flatMap((t) => (std.tags.has(t) ? [t] : std.old.get(key(t)) || [t]));
  const unknownOwn = own.filter((t) => !std.tags.has(t));
  if (unknownOwn.length) return { error: `the note has the tag(s) ${unknownOwn.join(', ')}, which the standard neither lists nor maps under "Old tags"` };
  const given = (spec.tags || []).map((t) => String(t).replace(/^#/, ''));
  const unknown = given.filter((t) => !std.tags.has(t));
  if (unknown.length) return { error: `the tag(s) ${unknown.join(', ')} are not in the standard; add each to "Tags" with its meaning first` };
  const drop = new Set((remove.tags || []).map((t) => String(t).replace(/^#/, '')));
  const tags = orderTags([...own, ...given].filter((t) => !drop.has(t)), std);
  for (const p of std.prefixes.filter((x) => x.one)) {
    const several = tags.filter((t) => prefixOf(t) === p.prefix);
    if (several.length > 1) return { error: `the note would have ${several.length} ${p.prefix} tags (${several.join(', ')}); the standard allows one` };
  }
  const tagsBefore = note.tags;
  const tagForm = noteGet(note, 'tags')?.form;
  const tagsChanged = tags.length !== tagsBefore.length || tags.some((t, i) => t !== tagsBefore[i]) || (tags.length && tagForm && tagForm !== 'block');
  if (tagsChanged) set.tags = { values: tags, quote: false };
  for (const k of std.links) {
    if (!spec[k] && !remove[k]) continue;
    const cur = noteGet(note, k);
    if (cur?.error) return { error: cur.error };
    const values = [];
    const seen = new Set();
    const push = (text, resolved) => {
      const id = resolved || key(text);
      if (seen.has(id)) return;
      seen.add(id);
      values.push({ text, id });
    };
    for (const v of cur?.values || []) {
      const r = resolve(index, v.text);
      push(v.text, ['path', 'name', 'partial'].includes(r.kind) ? r.path : null);
    }
    for (const g of spec[k] || []) {
      const t = target(ctx, index, g);
      if (t.error) return { error: `${k}: ${t.error}` };
      if (t.path === toOb(ctx, n.path)) return { error: `${k}: the note would link to itself` };
      push(linkTo(index, t.path), t.path);
    }
    const out = [];
    for (const v of values) {
      let gone = false;
      for (const g of remove[k] || []) {
        const t = target(ctx, index, g);
        if ((t.path && t.path === v.id) || key(String(g)) === key(v.text)) gone = true;
      }
      if (!gone) out.push(v.text);
    }
    const before = (cur?.values || []).map((v) => v.text);
    const unquoted = (cur?.values || []).some((v) => !v.quoted) || (cur && cur.form !== 'block');
    if (out.length !== before.length || out.some((t, i) => t !== before[i]) || unquoted) set[k] = { values: out, quote: true };
  }
  return { set };
}

function loadJson(file, what) {
  const data = readJson(path.resolve(file));
  if (data === null) stop(2, `${what} ${file} is not readable JSON`);
  return data;
}

function apply() {
  const ctx = setup();
  const std = needStandard();
  const changes = loadJson(args.changes, '--changes');
  if (typeof changes !== 'object' || Array.isArray(changes)) stop(2, '--changes must be an object: {"<path>": {...}}');
  const notes = notesOf(ctx, std);
  const index = buildIndex(ctx);
  const planned = plan(ctx, notes, index, args.spec ? [].concat(loadJson(args.spec, '--spec')) : []);
  const refused = [];
  const writes = [];
  const unchanged = [];
  const seen = new Set();
  for (const [given, spec] of Object.entries(changes)) {
    const n = findVaultNote(notes, given);
    if (!n) {
      refused.push({ path: given, reason: 'no such note in the vault' });
      continue;
    }
    if (seen.has(n.path)) {
      refused.push({ path: n.path, reason: 'the note is named twice in the changes' });
      continue;
    }
    seen.add(n.path);
    if (n.excluded) {
      refused.push({ path: n.path, reason: `left out of the standard: ${n.excluded}` });
      continue;
    }
    if (n.note.error) {
      refused.push({ path: n.path, reason: `its properties cannot be read: ${n.note.error}` });
      continue;
    }
    if (typeof spec !== 'object' || spec === null || Array.isArray(spec)) {
      refused.push({ path: n.path, reason: 'its change is not an object' });
      continue;
    }
    const m = merged(ctx, std, index, n, spec);
    if (m.error) {
      refused.push({ path: n.path, reason: m.error });
      continue;
    }
    if (!Object.keys(m.set).length) {
      unchanged.push(n.path);
      continue;
    }
    const text = withKeys(n.text, n.note, m.set);
    if (split(text).body !== n.note.body) {
      refused.push({ path: n.path, reason: 'the text after the properties would change' });
      continue;
    }
    writes.push({ path: n.path, text, keys: Object.keys(m.set) });
  }
  finishWrites(ctx, writes, refused, unchanged, 'apply', planned, index);
}

/**
 * The files a batch links to before they exist: the MOCs of the spec, and on a dry run the _about.md of every existing
 * folder of the vault that has none. They enter the index; the list goes into the output.
 */
function plan(ctx, notes, index, specs) {
  const planned = [];
  for (const s of specs) {
    if (!s || typeof s.path !== 'string') continue;
    const rel = s.path.replace(/^\/+/, '');
    if (!findVaultNote(notes, rel) && !index.byPath.has(key(toOb(ctx, rel)))) {
      index.add(toOb(ctx, rel));
      planned.push(rel);
    }
  }
  if (args.dryRun) {
    const dirs = new Set(['']);
    for (const f of walk(ctx.vaultDir)) {
      const parts = f.split('/').slice(0, -1);
      for (let i = 1; i <= parts.length; i++) dirs.add(parts.slice(0, i).join('/'));
    }
    for (const d of dirs) {
      if (!d) continue;
      const rel = `${d}/${ABOUT}`;
      if (!index.byPath.has(key(toOb(ctx, rel)))) {
        index.add(toOb(ctx, rel));
        planned.push(rel);
      }
    }
  }
  return planned;
}

function finishWrites(ctx, writes, refused, unchanged, what, planned = [], index = null) {
  const summary = { status: refused.length ? 'refused' : args.dryRun ? 'dry-run' : 'applied', changed: writes.map((w) => ({ path: w.path, keys: w.keys, created: Boolean(w.created) })), unchanged, refused };
  const linkedPlanned = index ? planned.filter((p) => writes.some((w) => w.text.includes(linkTo(index, toOb(ctx, p)).slice(0, -2)))) : [];
  if (linkedPlanned.length) summary.plannedLinks = linkedPlanned;
  const plannedLine = linkedPlanned.length ? `\n    links to file(s) not written yet - create them first: ${linkedPlanned.join(', ')}` : '';
  const lines = (list, f) => list.map(f).join('\n');
  if (refused.length) {
    done(1, summary, [`connect: ${what} refused ${refused.length} file(s); nothing was written`, lines(refused, (r) => `    ${r.path} - ${r.reason}`)].join('\n'));
  }
  if (args.dryRun) {
    done(0, summary, [`connect: ${what} --dry-run - ${writes.length} file(s) would change, ${unchanged.length} already hold it; nothing was written`, lines(writes, (w) => `    ${w.created ? 'create' : 'change'} ${w.path}: ${w.keys.join(', ')}`)].join('\n') + plannedLine);
  }
  if (!writes.length) done(0, { ...summary, status: 'unchanged' }, `connect: ${what} - nothing to change (${unchanged.length} file(s) already hold it)`);
  const back = needWayBack(ctx);
  const batch = writeBatch(ctx, writes);
  done(0, { ...summary, batch, work: ctx.work, wayBack: back }, [
    `connect: ${what} batch ${batch} - ${writes.length} file(s) written, ${unchanged.length} already held it; the text after the properties is unchanged`,
    lines(writes, (w) => `    ${w.created ? 'created' : 'changed'} ${w.path}: ${w.keys.join(', ')}`),
    `way back: ${back.state}${args.backupConfirmed && !['clean', 'journal'].includes(back.state) ? ' (backup confirmed by the user)' : ''}; undo takes this batch back`,
  ].join('\n'));
}

/** A short alias: no characters that break a wiki link, no line break, cut at a word boundary. */
function cleanAlias(s) {
  let a = String(s).replace(/[|[\]]/g, ' ').replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (a.length > ALIAS_MAX) {
    const cut = a.slice(0, ALIAS_MAX + 1);
    const space = cut.lastIndexOf(' ');
    a = `${(space > 20 ? cut.slice(0, space) : a.slice(0, ALIAS_MAX)).replace(/[\s,.;:–-]+$/, '')}…`;
  }
  return a;
}

function moc() {
  const ctx = setup();
  const std = needStandard();
  let specs = loadJson(args.spec, '--spec');
  if (!Array.isArray(specs)) specs = [specs];
  const notes = notesOf(ctx, std);
  const index = buildIndex(ctx);
  const refused = [];
  const writes = [];
  const unchanged = [];
  // the new MOCs first enter the index, so that a MOC may link to another one made in the same batch
  const planned = plan(ctx, notes, index, specs).filter((p) => posix.basename(p) === ABOUT);
  for (const s of specs) {
    if (!s || typeof s.path !== 'string' || !/\.md$/i.test(s.path) || !Array.isArray(s.groups)) {
      refused.push({ path: s?.path ?? '(no path)', reason: 'a MOC needs "path" (a .md file) and "groups"' });
      continue;
    }
    const rel = s.path.replace(/^\/+/, '');
    const name = posix.basename(rel);
    if (/["/\\:*?<>|]/.test(name.slice(0, -3))) {
      refused.push({ path: rel, reason: 'the name has a character that file systems reserve' });
      continue;
    }
    const existing = findVaultNote(notes, rel);
    if (!existing && !isDir(path.join(ctx.vaultDir, posix.dirname(rel)))) {
      refused.push({ path: rel, reason: 'its folder does not exist; a MOC goes into the folder it maps' });
      continue;
    }
    if (existing && (existing.note.error || !existing.note.tags.includes(MOC_TAG))) {
      refused.push({ path: existing.path, reason: existing.note.error ? `its properties cannot be read: ${existing.note.error}` : `it does not carry ${MOC_TAG}, so it is the user's note, not a MOC this skill made` });
      continue;
    }
    // the links of each group, in the shortest form, with a short alias
    const groups = [];
    let problem = null;
    for (const g of s.groups) {
      const heading = String(g?.heading || '').replace(/[\r\n]+/g, ' ').trim();
      if (!heading) {
        problem = 'a group has no heading';
        break;
      }
      const links = [];
      for (const l of g.links || []) {
        const t = target(ctx, index, typeof l === 'string' ? l : l?.to);
        if (t.error) {
          problem = `${heading}: ${t.error}`;
          break;
        }
        const link = linkTo(index, t.path).slice(2, -2);
        const alias = typeof l === 'object' && l.alias ? cleanAlias(l.alias) : null;
        const shown = posix.basename(link);
        links.push({ path: t.path, line: `- [[${link}${alias && alias !== shown ? `|${alias}` : ''}]]` });
      }
      if (problem) break;
      groups.push({ heading, links });
    }
    if (problem) {
      refused.push({ path: rel, reason: problem });
      continue;
    }
    const tags = orderTags([MOC_TAG, ...(s.tags || [])], std);
    const unknown = tags.filter((t) => !std.tags.has(t));
    if (unknown.length) {
      refused.push({ path: rel, reason: `the tag(s) ${unknown.join(', ')} are not in the standard` });
      continue;
    }
    if (!existing) {
      const eol = '\n';
      const ups = [];
      for (const u of s.up || []) {
        const t = target(ctx, index, u);
        if (t.error) problem = `up: ${t.error}`;
        else ups.push(linkTo(index, t.path));
      }
      if (problem) {
        refused.push({ path: rel, reason: problem });
        continue;
      }
      const props = [...renderKey('tags', tags, false), ...(ups.length ? renderKey('up', ups, true) : [])];
      const body = [String(s.intro || '').replace(/[\r\n]+/g, ' ').trim(), ...groups.flatMap((g) => ['', `## ${g.heading}`, '', ...g.links.map((l) => l.line)])].join(eol);
      writes.push({ path: rel, text: `---${eol}${props.join(eol)}${eol}---${eol}${body.replace(/^\n+/, '')}${eol}`, keys: ['new MOC', `${groups.reduce((a, g) => a + g.links.length, 0)} link(s)`], created: true });
      continue;
    }
    // an existing MOC: add what it lacks, remove nothing
    const m = merged(ctx, std, index, existing, { tags: s.tags || [], up: s.up || [] });
    if (m.error) {
      refused.push({ path: existing.path, reason: m.error });
      continue;
    }
    const eol = existing.note.eol;
    const lines = existing.note.body.split(/\r?\n/);
    const held = new Set(bodyLinks(existing.note.body).map((l) => resolve(index, l)).filter((r) => r.path).map((r) => r.path));
    let added = 0;
    for (const g of groups) {
      const fresh = g.links.filter((l) => !held.has(l.path));
      fresh.forEach((l) => held.add(l.path));
      if (!fresh.length) continue;
      added += fresh.length;
      const h = lines.findIndex((l) => /^##\s/.test(l) && l.replace(/^##\s+/, '').trim() === g.heading);
      if (h < 0) {
        while (lines.length && !lines.at(-1).trim()) lines.pop();
        lines.push('', `## ${g.heading}`, '', ...fresh.map((l) => l.line), '');
        continue;
      }
      let end = h + 1;
      while (end < lines.length && !/^#{1,2}\s/.test(lines[end])) end++;
      let last = end - 1;
      while (last > h && !lines[last].trim()) last--;
      lines.splice(last + 1, 0, ...(last === h ? [''] : []), ...fresh.map((l) => l.line));
    }
    const body = lines.join(eol);
    if (!added && !Object.keys(m.set).length) {
      unchanged.push(existing.path);
      continue;
    }
    const withProps = withKeys(existing.text, existing.note, m.set);
    const text = withProps.slice(0, withProps.length - existing.note.body.length) + body;
    writes.push({ path: existing.path, text, keys: [`${added} link(s) added`, ...Object.keys(m.set)] });
  }
  finishWrites(ctx, writes, refused, unchanged, 'moc', planned, index);
}

// ---- check -----------------------------------------------------------------------------------------------

const LEVEL = {
  unreadable: 'fail', 'tag-missing': 'fail', 'tag-several': 'fail', 'tag-unknown': 'fail', 'up-missing': 'fail',
  'link-broken': 'fail', 'link-ambiguous': 'fail', 'link-unquoted': 'fail', 'body-link-broken': 'fail', 'moc-unreached': 'fail',
  'moc-member-missing': 'fail', 'body-changed': 'fail', 'up-stale': 'fail', 'link-partial': 'warn', 'over-limit': 'warn',
  'tag-once': 'info', 'tag-unused': 'info',
};
const MEANING = {
  unreadable: 'notes whose properties cannot be read',
  'tag-missing': 'notes without the tag of a one-per-note prefix',
  'tag-several': 'notes with more than one tag of a one-per-note prefix',
  'tag-unknown': 'tags the standard does not list (an old tag not mapped yet, or a new one not added)',
  'up-missing': 'notes without up (the home page needs none)',
  'link-broken': 'property links that lead to no file',
  'link-ambiguous': 'property links that fit several files',
  'link-unquoted': 'property links not written as a quoted "[[...]]" in a list',
  'body-link-broken': 'links in MOCs, _about.md files and the home page that lead to no file or to several',
  'moc-unreached': 'MOCs that neither the _about.md of their folder nor the home page links to',
  'moc-member-missing': 'notes whose up is a MOC that does not list them',
  'body-changed': 'notes whose text after the properties changed',
  'link-partial': 'links that name only the end of a path (they rely on a resolution Obsidian does not document)',
  'up-stale': 'notes whose up is the _about.md of a folder they no longer sit in',
  'over-limit': 'prefixes with more tags than their soft limit',
  'tag-once': 'tags only one note carries (candidates to merge)',
  'tag-unused': 'tags of the standard no note carries',
};

function bodyBase(ctx, notes) {
  if (args.base) {
    const git = (a, opts = {}) => spawnSync('git', ['-C', root, ...a], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, ...opts });
    if (git(['rev-parse', '--verify', `${args.base}^{commit}`]).status !== 0) stop(2, `--base ${args.base} is not a commit of this repository`);
    const top = git(['rev-parse', '--show-toplevel']).stdout.trim();
    const prefix = path.relative(fs.realpathSync.native(top), fs.realpathSync.native(ctx.vaultDir)).split(path.sep).join('/');
    const gitPath = (p) => (prefix ? `${prefix}/${p}` : p);
    const changed = new Set(git(['-c', 'core.quotepath=off', 'diff', '--name-only', '-z', args.base, '--', prefix || '.']).stdout.split('\0').filter(Boolean).map(nfc));
    const out = new Map();
    for (const n of notes) {
      if (!changed.has(nfc(gitPath(n.path)))) continue;
      const r = git(['show', `${args.base}:${gitPath(n.path)}`]);
      if (r.status === 0) out.set(n.path, sha256(split(r.stdout).body));
    }
    return { from: `commit ${args.base}`, bodies: out };
  }
  const run = readRun(ctx);
  return { from: run.batches.length ? 'the text before the first batch of this run' : null, bodies: new Map(Object.entries(run.bodies).filter(([, v]) => v.body).map(([p, v]) => [p, v.body])) };
}

function check() {
  const ctx = setup();
  const std = needStandard();
  const all = notesOf(ctx, std);
  const index = buildIndex(ctx);
  const found = Object.fromEntries(Object.keys(LEVEL).map((k) => [k, []]));
  const scoped = all.filter((n) => !n.excluded && under(n.path, args.scope));
  const home = std.homePage ? findVaultNote(all, std.homePage) : null;
  if (std.homePage && !home) found['body-link-broken'].push(`the home page ${std.homePage} named in the standard does not exist`);
  const isMoc = (n) => n.note.tags.includes(MOC_TAG);
  const use = new Map();
  const mocs = all.filter((n) => !n.excluded && isMoc(n));
  const bodyLinksOf = new Map();
  const linksFrom = (n) => {
    if (!bodyLinksOf.has(n.path)) bodyLinksOf.set(n.path, new Set(bodyLinks(n.note.body).map((l) => resolve(index, l)).filter((r) => r.path).map((r) => r.path)));
    return bodyLinksOf.get(n.path);
  };
  for (const n of scoped) {
    const note = n.note;
    if (note.error) {
      found.unreadable.push(`${n.path}: ${note.error}`);
      continue;
    }
    for (const t of note.tags) use.set(t, (use.get(t) || 0) + 1);
    const unknown = note.tags.filter((t) => !std.tags.has(t));
    if (unknown.length) found['tag-unknown'].push(`${n.path}: ${unknown.join(', ')}`);
    for (const p of std.prefixes.filter((x) => x.one)) {
      const c = note.tags.filter((t) => prefixOf(t) === p.prefix).length;
      if (!c) found['tag-missing'].push(`${n.path}: no ${p.prefix} tag`);
      if (c > 1) found['tag-several'].push(`${n.path}: ${c} ${p.prefix} tags`);
    }
    for (const k of std.links) {
      const cur = noteGet(note, k);
      if (!cur) continue;
      if (cur.error) {
        found.unreadable.push(`${n.path}: ${cur.error}`);
        continue;
      }
      for (const v of cur.values) {
        if (!/^\[\[[^\]]+\]\]$/.test(v.text)) continue;
        if (!v.quoted || cur.form !== 'block') found['link-unquoted'].push(`${n.path}: ${k} ${v.text}`);
        const r = resolve(index, v.text);
        if (r.kind === 'none') found['link-broken'].push(`${n.path}: ${k} ${v.text}`);
        else if (r.kind === 'ambiguous') found['link-ambiguous'].push(`${n.path}: ${k} ${v.text} (${r.hits.length} files)`);
        else if (r.kind === 'partial') found['link-partial'].push(`${n.path}: ${k} ${v.text}`);
        if (k === 'up' && r.path) {
          const v2 = toVault(ctx, r.path);
          if (v2 && posix.basename(v2) === ABOUT && !under(posix.dirname(n.path), posix.dirname(v2) === '.' ? '' : posix.dirname(v2))) found['up-stale'].push(`${n.path}: up ${v.text}`);
          const parent = v2 ? findVaultNote(all, v2) : null;
          if (parent && isMoc(parent) && !linksFrom(parent).has(toOb(ctx, n.path))) found['moc-member-missing'].push(`${n.path}: not listed in ${parent.path}`);
        }
      }
    }
    const up = noteGet(note, 'up');
    if (!(up?.values || []).length && n !== home) found['up-missing'].push(n.path);
  }
  // bodies of MOCs, _about.md files and the home page: their links must lead to one file
  const bodies = all.filter((n) => under(n.path, args.scope) && (isMoc(n) || posix.basename(n.path) === ABOUT || n === home));
  for (const n of bodies) {
    for (const l of bodyLinks(n.note.body)) {
      const r = resolve(index, l);
      if (r.kind === 'none' || r.kind === 'ambiguous') found['body-link-broken'].push(`${n.path}: [[${l}]]${r.kind === 'ambiguous' ? ` (${r.hits.length} files)` : ''}`);
      else if (r.kind === 'partial') found['link-partial'].push(`${n.path}: [[${l}]]`);
    }
  }
  for (const m of mocs.filter((x) => under(x.path, args.scope))) {
    const dir = posix.dirname(m.path);
    const about = findVaultNote(all, dir === '.' ? ABOUT : `${dir}/${ABOUT}`);
    const ob = toOb(ctx, m.path);
    if (!(about && linksFrom(about).has(ob)) && !(home && linksFrom(home).has(ob))) found['moc-unreached'].push(m.path);
  }
  // the text after the properties
  const base = bodyBase(ctx, all);
  for (const n of scoped) {
    if (isMoc(n) || n === home || !base.bodies.has(n.path)) continue;
    if (base.bodies.get(n.path) !== sha256(n.note.body)) found['body-changed'].push(n.path);
  }
  // the vocabulary
  for (const p of std.prefixes) {
    const count = [...std.tags.keys()].filter((t) => prefixOf(t) === p.prefix).length;
    if (p.limit !== null && count > p.limit) found['over-limit'].push(`${p.prefix}: ${count} tags, soft limit ${p.limit}`);
  }
  if (!args.scope) {
    for (const [t, c] of use) if (c === 1 && t !== MOC_TAG) found['tag-once'].push(t);
    for (const t of std.tags.keys()) if (!use.has(t)) found['tag-unused'].push(t);
  }
  const results = Object.keys(LEVEL).map((id) => ({ id, level: LEVEL[id], count: found[id].length, meaning: MEANING[id], items: found[id] }));
  const fails = results.filter((r) => r.level === 'fail' && r.count);
  const value = { status: fails.length ? 'problems' : 'ok', notes: scoped.length, mocs: mocs.length, bodiesComparedWith: base.from, results };
  const text = [
    `connect: check ${args.scope ? `${args.scope} - ` : ''}${scoped.length} note(s) in scope, ${mocs.length} MOC(s); text compared with ${base.from || 'nothing (no --base and no batch in this run)'}`,
    ...results.map((r) => {
      const mark = r.count ? r.level : 'ok';
      const head = `${mark.padEnd(4)} ${r.id}: ${r.count}${r.count ? ` - ${r.meaning}` : ''}`;
      const items = r.count ? (args.list ? r.items : r.items.slice(0, 5)).map((x) => `       ${x}`) : [];
      if (r.count > 5 && !args.list) items.push(`       ... ${r.count - 5} more (--list)`);
      return [head, ...items].join('\n');
    }),
    fails.length ? `check: ${fails.length} fail(s)` : 'check: no fail',
  ];
  done(fails.length ? 1 : 0, value, text.join('\n'));
}

// ---- undo and finish -------------------------------------------------------------------------------------

function undo() {
  const ctx = setup();
  const run = readRun(ctx);
  if (!run.batches.length) done(0, { status: 'nothing' }, 'connect: undo - no batch to take back');
  const n = String(run.batches.at(-1)).padStart(3, '0');
  const dir = path.join(ctx.work, `batch-${n}`);
  const journal = readJson(path.join(dir, 'journal.json'));
  if (!journal) stop(1, `the journal of batch ${n} is missing in ${ctx.work}`);
  const restored = [];
  const kept = [];
  for (const [p, f] of Object.entries(journal.files)) {
    const file = path.join(ctx.vaultDir, p);
    if (!exists(file) || sha256(fs.readFileSync(file)) !== f.after) {
      kept.push(p);
      continue;
    }
    if (f.created) fs.rmSync(file);
    else fs.writeFileSync(file, fs.readFileSync(path.join(dir, 'files', p)));
    restored.push(p);
  }
  run.batches.pop();
  for (const [p, v] of Object.entries(run.bodies)) if (v.batch === n) delete run.bodies[p];
  writeRun(ctx, run);
  fs.rmSync(dir, { recursive: true, force: true });
  done(kept.length ? 1 : 0, { status: 'undone', batch: n, restored, kept }, [
    `connect: undo batch ${n} - ${restored.length} file(s) back as they were`,
    ...kept.map((p) => `    kept ${p}: it changed after the batch, so it was not taken back`),
  ].join('\n'));
}

function finish() {
  const ctx = setup();
  const had = exists(ctx.work);
  fs.rmSync(ctx.work, { recursive: true, force: true });
  done(0, { status: 'finished', removed: had ? ctx.work : null }, had ? `connect: finished; the work folder ${ctx.work} is removed` : 'connect: finished; there was no work folder');
}

({ measure, cards, apply, moc, check, undo, finish })[command]();
