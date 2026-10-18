// hsb-lib.mjs - shared helpers of the hyper-second-brain skills: the project folder and its manifest,
// the PARA folders of a vault, and the pointer line in the agent's instruction files.
// Part of hyper-second-brain: it runs from the skill folder and is not copied into the project.
// Node 18 or newer, no dependencies.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const FOLDER = 'hyper-second-brain'; // the project's folder for project.md and the manifest
export const MANIFEST = '.manifest.json';
export const RULES_FILE = 'HYPER-SECOND-BRAIN.md'; // the general rules of the package, a file of the project, in the project root
export const RULES_SECTIONS = [ // the headings hsb-doctor looks for in it
  'Where things are', 'Order of authority', 'Notes and documents', 'Categories', 'Principles', 'Folder about files', 'Folders and names',
  'What you may do and what you ask first', 'Links', 'Language', 'Data and secrets', 'Project List',
];
export const PLACE_SKILL = 'hsb-place-an-item'; // the skill the pointer line names
export const CATEGORIES = ['Inbox', 'Projects', 'Areas', 'Resources', 'Archives'];
export const START = '<!-- hyper-second-brain:start -->';
export const END = '<!-- hyper-second-brain:end -->';
export const ITEM_MARK = '<!-- hsb -->';

export const exists = (p) => fs.existsSync(p);
export const isDir = (p) => exists(p) && fs.statSync(p).isDirectory();
export const readText = (p) => fs.readFileSync(p, 'utf8');
export const eolOf = (text) => (text.includes('\r\n') ? '\r\n' : '\n');
export const posix = (p) => p.split(path.sep).join('/');

/** The pointer line: what the agent's instruction file says about vault work. */
export function pointerLine(vaultRel) {
  return `Vault work in \`${vaultRel}/\` (placing or moving notes and documents; titling notes; capturing, distilling, or drafting; `
    + `starting or finishing a project; reviews): read \`${RULES_FILE}\` first. `
    + `To decide where an item goes, use the \`${PLACE_SKILL}\` skill.`;
}

/** The path every pointer line must name, in whatever language the line is written. */
export const POINTER_PATH = RULES_FILE;

/** True when the text already carries the pointer (marked block, marked list item, or the rules file path). */
export const hasPointer = (text) => text.includes(START) || text.includes(ITEM_MARK) || text.includes(POINTER_PATH);

/** The reason a given pointer line cannot be used, or null: one line that names the rules file. */
export function pointerTextProblem(line) {
  if (typeof line !== 'string' || !line.trim()) return 'the pointer line is empty';
  if (/[\r\n]/.test(line)) return 'the pointer line must be one line';
  if (!line.includes(POINTER_PATH)) return `the pointer line must name ${POINTER_PATH}`;
  if (!line.includes(PLACE_SKILL)) return `the pointer line must name the ${PLACE_SKILL} skill`;
  if (line.includes(START) || line.includes(END) || line.includes(ITEM_MARK)) return 'the pointer line must not contain the markers';
  return null;
}

/** The pointer line of one instruction file: the text recorded for it in the manifest (a translation), or the English default. */
export const pointerFor = (manifest, file, vaultRel) => manifest?.pointers?.[file]?.text ?? pointerLine(vaultRel);

// ---- PARA folders ----------------------------------------------------------------------------

const WORDS = {
  inbox: 'Inbox', project: 'Projects', projects: 'Projects', area: 'Areas', areas: 'Areas',
  resource: 'Resources', resources: 'Resources', archive: 'Archives', archives: 'Archives',
};

/** The PARA category a folder name stands for ("0. INBOX", "1 Projects", "Archive"), or null. */
export function categoryOf(name) {
  const bare = name.replace(/^[^\p{L}]+/u, '').trim().toLowerCase();
  return WORDS[bare] || null;
}

/** The top-level folders of a vault: candidates per PARA category, and the folders outside PARA (hidden ones left out). */
export function detectPara(vaultDir) {
  const found = Object.fromEntries(CATEGORIES.map((c) => [c, []]));
  const other = [];
  for (const entry of fs.readdirSync(vaultDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
    const category = categoryOf(entry.name);
    if (category) found[category].push(entry.name);
    else other.push(entry.name);
  }
  return { found, other: other.sort() };
}

const mostCommon = (values) => {
  const count = new Map();
  for (const v of values) count.set(v, (count.get(v) || 0) + 1);
  return [...count.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
};

/** How the existing PARA folders are named: numbered or not, the separator, the letter case. */
export function styleOf(existing) {
  const parsed = existing.map((n) => /^(\d+)([\s._-]*)(.*)$/u.exec(n)).filter(Boolean);
  const words = existing.map((n) => n.replace(/^[^\p{L}]+/u, ''));
  return {
    numbered: existing.length > 0 && parsed.length * 2 >= existing.length,
    sep: mostCommon(parsed.map((m) => m[2])) ?? ' ',
    caseMode: words.length && words.every((w) => w === w.toUpperCase()) ? 'upper'
      : words.length && words.every((w) => w === w.toLowerCase()) ? 'lower' : 'title',
  };
}

export const DEFAULT_STYLE = { numbered: true, sep: ' ', caseMode: 'title' };

/** The name for a PARA folder that does not exist yet, in the style of the folders that do. */
export function newName(category, style) {
  const word = style.caseMode === 'upper' ? category.toUpperCase() : style.caseMode === 'lower' ? category.toLowerCase() : category;
  return style.numbered ? `${CATEGORIES.indexOf(category)}${style.sep}${word}` : word;
}

// ---- instruction files -----------------------------------------------------------------------

/** What to do with the agent's instruction files in the project root. */
export function planEntryFiles(root) {
  const agents = path.join(root, 'AGENTS.md');
  const claude = path.join(root, 'CLAUDE.md');
  const hasAgents = exists(agents);
  const hasClaude = exists(claude);
  const harness = exists(path.join(root, 'PAN-HARNESS.md')) || isDir(path.join(root, 'pan-harness'));
  const actions = [];
  if (!hasAgents && !hasClaude) actions.push({ file: 'AGENTS.md', kind: 'create' });
  if (hasAgents) {
    const text = readText(agents);
    if (hasPointer(text)) actions.push({ file: 'AGENTS.md', kind: 'present' });
    else actions.push({ file: 'AGENTS.md', kind: harness && sessionStartItems(text) ? 'list-item' : 'block' });
  }
  if (hasClaude) {
    const text = readText(claude);
    if (hasPointer(text)) actions.push({ file: 'CLAUDE.md', kind: 'present' });
    else if (hasAgents && /(^|\s)@AGENTS\.md\b/.test(text)) actions.push({ file: 'CLAUDE.md', kind: 'imports' });
    else actions.push({ file: 'CLAUDE.md', kind: 'block' });
  }
  return { harness, actions };
}

/** The block of a pointer line between its markers, ending with a line break. */
export const pointerBlock = (line, eol = '\n') => `${START}${eol}${line}${eol}${END}${eol}`;

/** Appends the marked block to an instruction file; the file's own text and line endings stay. */
export function appendBlock(text, line) {
  const eol = eolOf(text);
  let out = text;
  if (out && !out.endsWith('\n')) out += eol;
  if (out) out += eol;
  return out + pointerBlock(line, eol);
}

/** Whether a harness AGENTS.md has a numbered "Session start" list the pointer can join. */
export function sessionStartItems(text) {
  const lines = text.split(/\r?\n/);
  const head = lines.findIndex((l) => /^##\s+Session start\s*$/.test(l));
  if (head < 0) return false;
  let end = lines.findIndex((l, i) => i > head && /^##\s/.test(l));
  if (end < 0) end = lines.length;
  return lines.slice(head + 1, end).some((l) => /^\d+\.\s/.test(l));
}

/** Adds the pointer as the last numbered item of "Session start"; null when the section has no numbered list. */
export function insertSessionStartItem(text, line) {
  if (!sessionStartItems(text)) return null;
  const eol = eolOf(text);
  const lines = text.split(/\r?\n/);
  const head = lines.findIndex((l) => /^##\s+Session start\s*$/.test(l));
  let end = lines.findIndex((l, i) => i > head && /^##\s/.test(l));
  if (end < 0) end = lines.length;
  let last = -1;
  let number = 0;
  for (let i = head + 1; i < end; i++) {
    const m = /^(\d+)\.\s/.exec(lines[i]);
    if (m) {
      last = i;
      number = Number(m[1]);
    }
  }
  let stop = last + 1; // the item runs until a blank line, the next item or the end of the section
  while (stop < end && lines[stop].trim() !== '' && !/^\d+\.\s/.test(lines[stop])) stop++;
  lines.splice(stop, 0, `${number + 1}. ${line} ${ITEM_MARK}`);
  return lines.join(eol);
}

// ---- manifest --------------------------------------------------------------------------------

/** The manifest of the project, or null. A damaged one throws. */
export function readManifest(root) {
  const file = path.join(root, FOLDER, MANIFEST);
  if (!exists(file)) return null;
  let data;
  try {
    data = JSON.parse(readText(file));
  } catch {
    throw new Error(`${FOLDER}/${MANIFEST} is not valid JSON`);
  }
  if (!data || typeof data.version !== 'string') throw new Error(`${FOLDER}/${MANIFEST} is damaged (version)`);
  return data;
}

/** Fills {{name}} places of a template. */
export const render = (template, values) => template.replace(/\{\{(\w+)\}\}/g, (_, k) => {
  if (!(k in values)) throw new Error(`template place {{${k}}} has no value`);
  return values[k];
});

// ---- project.md, versions, dates, tools ----------------------------------------------------------

/** The rules file as the template of a skill folder gives it for this vault, and the hash the manifest records for it. */
export const rulesText = (skillDir, vaultRel) => render(readText(path.join(skillDir, 'templates', 'HYPER-SECOND-BRAIN.md.tmpl')), { vault: vaultRel });
export const rulesTemplateHash = (skillDir, vaultRel) => crypto.createHash('sha256').update(rulesText(skillDir, vaultRel)).digest('hex');

/** Reads project.md: the vault path, the folder table, the other folders, the instruction files, the backticked paths of the project rules, and the lasting choices (one line each). */
export function parseProjectMd(text) {
  const sections = {};
  let current = '';
  for (const line of text.split(/\r?\n/)) {
    const h = /^##\s+(.+?)\s*$/.exec(line);
    if (h) current = h[1];
    else if (/^#{3,}\s/.test(line) && current === 'Project rules') sections[current] = `${sections[current] || ''}${line}\n`;
    else sections[current] = `${sections[current] || ''}${line}\n`;
  }
  const vault = (/^Vault:\s*`([^`]+)`/m.exec(text) || [])[1]?.replace(/\/+$/, '') || null;
  const folders = {};
  for (const m of (sections.Folders || '').matchAll(/^\|\s*(\w+)\s*\|\s*`([^`]+)`\s*\|\s*$/gm)) {
    if (CATEGORIES.includes(m[1])) folders[m[1]] = m[2];
  }
  const bullets = (name) => [...(sections[name] || '').matchAll(/^-\s+`([^`]+)`/gm)].map((m) => m[1]);
  const rules = sections['Project rules'] || '';
  const rulePaths = [...rules.matchAll(/`([^`]+\.(?:md|mdc|toml|json|txt))`/g)].map((m) => m[1]);
  return {
    vault,
    folders,
    other: bullets('Other top-level folders'),
    instructionFiles: bullets('Instruction files in the vault'),
    rulePaths,
    rulesRecorded: !/^\s*-\s*None recorded\.\s*$/m.test(rules.split('### Decisions')[0] || ''),
    lasting: [...(sections['Lasting choices'] || '').matchAll(/^-\s+(.+?)\s*$/gm)].map((m) => m[1]).filter((l) => l !== 'None yet.'),
  };
}

/** The backticked names on the "Lasting choices" line that starts with label, for example `Not projects` or `Ignore names`. */
export function lastingNames(lasting, label) {
  const re = new RegExp(`^${label}:\\s*(.*)$`, 'i');
  return lasting.flatMap((l) => {
    const m = re.exec(l);
    return m ? [...m[1].matchAll(/`([^`]+)`/g)].map((x) => x[1].replace(/\/+$/, '')) : [];
  });
}

/** The version in a skill's SKILL.md frontmatter, or null. */
export function skillVersion(skillDir) {
  return (/^\s*version:\s*"([^"]+)"/m.exec(readText(path.join(skillDir, 'SKILL.md'))) || [])[1] || null;
}

/** -1, 0 or 1 for two x.y.z versions. */
export function compareVersions(a, b) {
  const pa = String(a).split('-')[0].split('.').map(Number);
  const pb = String(b).split('-')[0].split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d < 0 ? -1 : 1;
  }
  return 0;
}

// the user's calendar day: the dates in the notes and in git are written in local time, so "today" is local too
export const localDay = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Whole days from an ISO date (YYYY-MM-DD) to another. */
export const daysBetween = (from, to) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);

// ---- state.json: the questions that wait for the user, and the review dates -----------------------------

export const STATE = 'state.json'; // in the project's folder, written by hsb-state.mjs
export const REVIEWS = { weekly: 7, monthly: 30 }; // a review is due once more days than these have passed, or when it never ran

/** The state of the project's skills, or an empty one while the file does not exist; a damaged file throws. */
export function readState(root) {
  const file = path.join(root, FOLDER, STATE);
  if (!exists(file)) return { lastId: 0, questions: [] };
  const state = JSON.parse(readText(file));
  const reviews = state?.reviews;
  const reviewsOk = reviews === undefined || (reviews !== null && typeof reviews === 'object' && !Array.isArray(reviews)
    && Object.values(reviews).every((d) => d === null || /^\d{4}-\d{2}-\d{2}$/.test(d)));
  if (!Array.isArray(state?.questions) || !Number.isInteger(state?.lastId) || !reviewsOk) throw new Error('damaged');
  return state;
}

/** Each review with the date it last ran (or null), the days since then, and whether it is due. */
export const reviewStatus = (state, today) => Object.fromEntries(Object.entries(REVIEWS).map(([kind, limit]) => {
  const last = state?.reviews?.[kind] ?? null;
  const days = last === null ? null : daysBetween(last, today);
  return [kind, { last, days, due: days === null || days > limit }];
}));

/** Relative paths of the files under dir, hidden folders left out. */
export function walkFiles(dir) {
  const out = [];
  const rec = (rel) => {
    for (const e of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
      if (e.name.startsWith('.')) continue;
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) rec(r);
      else if (e.isFile()) out.push(r);
    }
  };
  rec('');
  return out;
}

// ---- Obsidian --------------------------------------------------------------------------------------

const readJsonOrNull = (file) => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
};

/**
 * The Obsidian vault root: the nearest folder with .obsidian/, from the vault up to the project root.
 * {found, rootDir, prefix, conf, templates}: prefix is the vault's path inside the Obsidian vault ('' when they are one
 * folder), conf(f) reads a JSON file of .obsidian/, templates are the templates folders, relative to the vault.
 */
export function obsidianRoot(root, vaultDir) {
  let dir = vaultDir;
  let found = null;
  for (;;) {
    if (isDir(path.join(dir, '.obsidian'))) {
      found = dir;
      break;
    }
    if (path.resolve(dir) === path.resolve(root) || path.dirname(dir) === dir) break;
    dir = path.dirname(dir);
  }
  const base = found || vaultDir;
  const prefix = posix(path.relative(base, vaultDir));
  const conf = (f) => (found ? readJsonOrNull(path.join(found, '.obsidian', f)) : null);
  const toVault = (p) => {
    const clean = String(p).replace(/^\/+|\/+$/g, '');
    if (!prefix) return clean;
    return clean === prefix || clean.startsWith(`${prefix}/`) ? clean.slice(prefix.length + 1) : null;
  };
  const templates = [conf('templates.json')?.folder, conf('plugins/templater-obsidian/data.json')?.templates_folder]
    .filter(Boolean).map(toVault).filter((p) => p !== null);
  return { found, rootDir: base, prefix, conf, templates };
}

// ---- the pointer line in a newer wording, and migrations ----------------------------------------

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Puts the given pointer line into the marked block and the marked list item; the text around them stays. */
export function refreshPointerText(text, line) {
  const eol = eolOf(text);
  const blockRe = new RegExp(`${escapeRe(START)}[\\s\\S]*?${escapeRe(END)}`, 'g');
  return text
    .replace(blockRe, () => `${START}${eol}${line}${eol}${END}`)
    .replace(/^(\s*\d+\.\s).*<!-- hsb -->(\r?)$/gm, (_, lead, cr) => `${lead}${line} ${ITEM_MARK}${cr}`);
}

/** The migration steps between two versions (from exclusive, to inclusive), oldest version first. */
export function planMigrations(migrations, from, to) {
  return migrations
    .map((m, i) => ({ m, i }))
    .filter(({ m }) => compareVersions(m.version, from) > 0 && compareVersions(m.version, to) <= 0)
    .sort((a, b) => compareVersions(a.m.version, b.m.version) || a.i - b.i)
    .map(({ m }) => m);
}

/**
 * Runs the planned steps version by version. A `mechanical` step runs; a `structural` or `by-hand` step is
 * handed back for the agent. After each version the callback records it, so a stopped run resumes there.
 */
export async function runMigrations(ctx, steps, recordVersion) {
  const result = { done: [], structural: [], byHand: [] };
  const versions = [...new Set(steps.map((s) => s.version))];
  for (const version of versions) {
    for (const step of steps.filter((s) => s.version === version)) {
      if (step.kind === 'mechanical') {
        await step.run(ctx);
        result.done.push(`${step.version} ${step.id}`);
      } else if (step.kind === 'structural') result.structural.push({ version: step.version, id: step.id, description: step.description });
      else result.byHand.push({ version: step.version, id: step.id, description: step.description });
    }
    recordVersion(version);
  }
  return result;
}
