// hsb-find's search script: what it finds, how it ranks, what it hides, and that it only reads. Every note is invented.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { emptyProject, numberedVault, write, snapshot } from './fixtures.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCAFFOLD = path.join(ROOT, 'skills', 'hsb-init', 'scripts', 'scaffold.mjs');
const FIND = path.join(ROOT, 'skills', 'hsb-find', 'scripts', 'hsb-find.mjs');

const run = (args) => {
  const r = spawnSync(process.execPath, [FIND, ...args], { encoding: 'utf8' });
  let json = null;
  try {
    json = JSON.parse(r.stdout);
  } catch {
    // text output
  }
  return { code: r.status, json, out: r.stdout + r.stderr };
};
const search = (dir, terms, ...more) => run(['search', '--root', dir, '--terms', terms, '--json', ...more]);
/** A numbered vault with hyper-second-brain set up; its folders are 0. INBOX ... 4. ARCHIVE. */
const installed = () => {
  const dir = numberedVault();
  const r = spawnSync(process.execPath, [SCAFFOLD, '--root', dir, '--json'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  return dir;
};
const folderOf = (dir, category) => (new RegExp(`\\| ${category} \\| \`([^\`]+)\` \\|`).exec(fs.readFileSync(path.join(dir, 'hyper-second-brain', 'project.md'), 'utf8')) || [])[1];
const v = (dir, rel, text) => write(dir, `vault/${rel}`, text);
// a file's change time, set some days back: the repository keeps no literal dates
const age = (dir, rel, days) => {
  const t = new Date(Date.now() - days * 86400000);
  fs.utimesSync(path.join(dir, 'vault', rel), t, t);
};

test('the search ignores the form of the apostrophe and the letter case, Cyrillic included', () => {
  const dir = installed();
  const R = folderOf(dir, 'Resources');
  v(dir, `${R}/notes/a.md`, "Hisobotning o'rta qismi.\n");
  v(dir, `${R}/notes/b.md`, 'Hisobotning oʻrta qismi.\n');
  v(dir, `${R}/notes/c.md`, 'Hisobotning o’rta qismi.\n');
  v(dir, `${R}/notes/d.md`, 'ўзбек тили ҳақида.\n');
  for (const form of ["o'rta", 'oʻrta', 'O‘RTA']) {
    const r = search(dir, form);
    assert.equal(r.code, 0, r.out);
    assert.deepEqual(r.json.hits.map((h) => path.posix.basename(h.path)).sort(), ['a.md', 'b.md', 'c.md'], form);
  }
  assert.equal(search(dir, 'ЎЗБЕК').json.total, 1);
});

test('hits are ranked by how much they match, not by age; the age is given', () => {
  const dir = installed();
  const A = folderOf(dir, 'Archives');
  const P = folderOf(dir, 'Projects');
  v(dir, `${A}/2024 churn study/Churn analysis.md`, '# Churn analysis\nChurn in the first 60 days, by onboarding time. Churn drops after onboarding calls.\n');
  v(dir, `${P}/Q3 report/Interview.md`, 'Alisher said churn is high.\n');
  age(dir, `${A}/2024 churn study/Churn analysis.md`, 400);
  const r = search(dir, 'churn|onboarding');
  assert.equal(r.json.total, 2);
  assert.equal(r.json.hits[0].title, 'Churn analysis');
  assert.equal(r.json.hits[0].category, 'Archives');
  assert.ok(r.json.hits[0].ageDays >= 399, String(r.json.hits[0].ageDays));
  assert.deepEqual(r.json.hits[0].terms, ['churn', 'onboarding']);
  assert.equal(r.json.hits[1].category, 'Projects');
  assert.match(r.json.hits[1].lines[0], /Alisher said churn/);
});

test('a document is found by its name only, and --in keeps the search in one folder', () => {
  const dir = installed();
  const A = folderOf(dir, 'Archives');
  v(dir, `${A}/Offsite 2025/Budget 2025.pdf`, '%PDF-1.1 venue budget inside the file\n');
  v(dir, `${A}/Offsite 2025/scan0001.pdf`, '%PDF-1.1 budget only inside\n');
  v(dir, 'notes elsewhere/Budget idea.md', 'A budget idea.\n');
  const all = search(dir, 'budget');
  assert.deepEqual(all.json.hits.map((h) => path.posix.basename(h.path)).sort(), ['Budget 2025.pdf', 'Budget idea.md']);
  assert.equal(all.json.hits.find((h) => h.kind === 'document').title, 'Budget 2025');
  const archived = search(dir, 'budget', '--in', A);
  assert.deepEqual(archived.json.hits.map((h) => h.path), [`${A}/Offsite 2025/Budget 2025.pdf`]);
  assert.equal(search(dir, 'budget', '--in', '../outside').code, 2);
  assert.equal(search(dir, 'budget', '--in', 'no such folder').code, 2);
});

test('a secret is never printed: its line shows the label only, and the hit says the file holds one', () => {
  const dir = installed();
  const AR = folderOf(dir, 'Areas');
  v(dir, `${AR}/Home/Router login.md`, 'Home Wi-Fi router admin page: router.home\nuser: admin\npassword: Tr0ub4dor&3\n');
  for (const terms of ['router', 'password', 'router|password|admin']) {
    const r = search(dir, terms);
    assert.equal(r.json.total, 1, terms);
    assert.equal(r.json.hits[0].secret, true);
    assert.ok(!r.out.includes('Tr0ub4dor'), terms);
    const text = run(['search', '--root', dir, '--terms', terms]);
    assert.ok(!text.out.includes('Tr0ub4dor') && /holds a secret/.test(text.out), terms);
  }
});

test('a card number is masked and marks the note as holding a secret; a date or a phone number is no card', () => {
  const dir = installed();
  const AR = folderOf(dir, 'Areas');
  v(dir, `${AR}/Finances/Cards.md`, 'Visa for travel: 4111 1111 1111 1111, expires on the 12th.\n');
  const day = new Date().toISOString().slice(0, 10); // a date, computed: the repository keeps no literal dates
  v(dir, `${AR}/Finances/Contacts.md`, `Bank hotline for travel: +998 71 200 00 00; card renewed ${day}.\n`);
  const r = search(dir, 'travel');
  assert.equal(r.json.total, 2);
  const cards = r.json.hits.find((h) => h.title === 'Cards');
  assert.equal(cards.secret, true);
  assert.match(cards.lines[0], /\[hidden number\]/);
  assert.ok(!r.out.includes('4111'));
  assert.equal(r.json.hits.find((h) => h.title === 'Contacts').secret, false);
});

test('hidden folders and the _about.md files are left out; nothing found is a plain answer, exit 0', () => {
  const dir = installed();
  const R = folderOf(dir, 'Resources');
  v(dir, '.obsidian/notes.md', 'bicycle\n');
  v(dir, `${R}/sport/_about.md`, '# sport\n\n## Purpose\nBicycle routes.\n');
  const r = search(dir, 'bicycle');
  assert.equal(r.code, 0, r.out);
  assert.equal(r.json.total, 0);
  assert.match(run(['search', '--root', dir, '--terms', 'bicycle']).out, /nothing in vault\/ matches bicycle/);
});

test('the search only reads, and --limit caps the hits', () => {
  const dir = installed();
  const R = folderOf(dir, 'Resources');
  for (let i = 1; i <= 30; i++) v(dir, `${R}/clips/Clip ${i}.md`, `A clip about sleep, number ${i}.\n`);
  const before = snapshot(dir);
  const r = search(dir, 'sleep', '--limit', '5');
  assert.equal(r.json.total, 30);
  assert.equal(r.json.hits.length, 5);
  assert.deepEqual(snapshot(dir), before);
});

test('exit 3 without hyper-second-brain, exit 2 on bad usage', () => {
  assert.equal(search(emptyProject(), 'x y').code, 3);
  const dir = installed();
  assert.equal(run(['search', '--root', dir]).code, 2);
  assert.equal(run(['find', '--root', dir, '--terms', 'a b']).code, 2);
  assert.equal(search(dir, 'a').code, 2);
  assert.equal(search(dir, ' | ').code, 2);
  assert.equal(search(dir, 'ok', '--limit', '0').code, 2);
});
