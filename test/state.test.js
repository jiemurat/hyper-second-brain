// The open questions of the skills: hsb-state.mjs keeps them in hyper-second-brain/state.json, outside the vault.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { emptyProject, numberedVault, snapshot } from './fixtures.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCAFFOLD = path.join(ROOT, 'skills', 'hsb-init', 'scripts', 'scaffold.mjs');
const STATE = path.join(ROOT, 'skills', 'hsb-projects', 'scripts', 'hsb-state.mjs');

const run = (script, args) => {
  const r = spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });
  let json = null;
  try {
    json = JSON.parse(r.stdout);
  } catch {
    // text output
  }
  return { code: r.status, json, out: r.stdout + r.stderr };
};
const installed = () => {
  const dir = numberedVault();
  assert.equal(run(SCAFFOLD, ['--root', dir, '--json']).code, 0);
  return dir;
};
const state = (dir, command, ...args) => run(STATE, [command, '--root', dir, '--json', ...args]);
const ask = (dir, about, question, ...more) => state(dir, 'ask', '--skill', 'hsb-projects', '--about', about, '--question', question, ...more);
const file = (dir) => path.join(dir, 'hyper-second-brain', 'state.json');
// a day computed from today, as YYYY-MM-DD: the repository keeps no literal dates
const daysAgo = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

test('ask keeps a question with its date in hyper-second-brain/state.json and nothing in the vault', () => {
  const dir = installed();
  const vaultBefore = snapshot(path.join(dir, 'vault'));
  const day = daysAgo(3);
  const r = ask(dir, 'KITCHEN RENOVATION', 'By when should the kitchen be done?', '--today', day);
  assert.equal(r.code, 0, r.out);
  assert.equal(r.json.question.id, 1);
  const kept = JSON.parse(fs.readFileSync(file(dir), 'utf8'));
  assert.deepEqual(kept.questions, [{ id: 1, asked: day, skill: 'hsb-projects', about: 'KITCHEN RENOVATION', question: 'By when should the kitchen be done?' }]);
  assert.equal(ask(dir, 'B', 'Without a date?').json.question.asked, daysAgo(0)); // the user's local calendar day
  assert.deepEqual(snapshot(path.join(dir, 'vault')), vaultBefore);
});

test('the same question about the same item is kept once; list shows the open ones, of one skill on request', () => {
  const dir = installed();
  assert.equal(ask(dir, 'A', 'First?').json.question.id, 1);
  const again = ask(dir, 'A', 'First?');
  assert.equal(again.json.status, 'open');
  assert.equal(again.json.question.id, 1);
  ask(dir, 'B', 'Second?');
  assert.equal(state(dir, 'ask', '--skill', 'hsb-review', '--about', 'C', '--question', 'Third?').code, 0);
  assert.deepEqual(state(dir, 'list').json.questions.map((q) => q.id), [1, 2, 3]);
  assert.deepEqual(state(dir, 'list', '--skill', 'hsb-projects').json.questions.map((q) => q.about), ['A', 'B']);
  const text = run(STATE, ['list', '--root', dir]);
  assert.match(text.out, /3 open question\(s\)/);
  assert.match(text.out, /#2 \d{4}-\d{2}-\d{2} hsb-projects \| about: B \| Second\?/);
});

test('answer removes a question, and a number is never given twice', () => {
  const dir = installed();
  ask(dir, 'A', 'First?');
  ask(dir, 'B', 'Second?');
  const r = state(dir, 'answer', '--id', '2');
  assert.equal(r.code, 0, r.out);
  assert.equal(r.json.question.about, 'B');
  assert.equal(ask(dir, 'C', 'Third?').json.question.id, 3);
  assert.deepEqual(state(dir, 'list').json.questions.map((q) => q.id), [1, 3]);
  assert.equal(state(dir, 'answer', '--id', '2').code, 1);
});

test('a list without the file is empty and writes nothing', () => {
  const dir = installed();
  const r = state(dir, 'list');
  assert.equal(r.code, 0, r.out);
  assert.deepEqual(r.json.questions, []);
  assert.ok(!fs.existsSync(file(dir)));
});

test('exit 1 on a damaged file, which stays as it is; exit 3 without hyper-second-brain; exit 2 on bad usage', () => {
  const dir = installed();
  fs.writeFileSync(file(dir), '{ not json');
  const r = ask(dir, 'A', 'First?');
  assert.equal(r.code, 1, r.out);
  assert.equal(fs.readFileSync(file(dir), 'utf8'), '{ not json');
  assert.equal(state(emptyProject(), 'list').code, 3);
  assert.equal(run(STATE, ['list']).code, 2);
  assert.equal(run(STATE, ['forget', '--root', dir]).code, 2);
  assert.equal(state(dir, 'ask', '--skill', 'hsb-projects', '--about', 'A').code, 2);
  assert.equal(ask(dir, 'A', 'Two\nlines?').code, 2);
  assert.equal(state(dir, 'answer', '--id', 'x').code, 2);
  assert.equal(ask(dir, 'A', 'First?', '--today', 'today').code, 2);
});

test('reviewed records the date of a review; due says which review is due: weekly after 7 days, monthly after 30, either one never run', () => {
  const dir = installed();
  let r = state(dir, 'due');
  assert.equal(r.code, 0, r.out);
  assert.deepEqual(r.json.reviews.weekly, { last: null, days: null, due: true });
  assert.equal(r.json.reviews.monthly.due, true);
  assert.ok(!fs.existsSync(file(dir)), 'due writes nothing');
  assert.equal(state(dir, 'reviewed', '--kind', 'weekly', '--today', daysAgo(7)).code, 0);
  assert.equal(state(dir, 'reviewed', '--kind', 'monthly', '--today', daysAgo(30)).code, 0);
  r = state(dir, 'due');
  assert.deepEqual(r.json.reviews, { weekly: { last: daysAgo(7), days: 7, due: false }, monthly: { last: daysAgo(30), days: 30, due: false } });
  assert.equal(r.json.message, 'no review is due');
  r = state(dir, 'due', '--today', daysAgo(-1)); // tomorrow
  assert.equal(r.json.reviews.weekly.due, true);
  assert.equal(r.json.reviews.monthly.due, true);
  assert.equal(r.json.message, 'due: weekly, monthly');
  const text = run(STATE, ['due', '--root', dir]);
  assert.match(text.out, /weekly: last \d{4}-\d{2}-\d{2}, 7 day\(s\) ago/);
});

test('questions and review dates live side by side: each command keeps what the other wrote', () => {
  const dir = installed();
  ask(dir, 'A', 'First?');
  state(dir, 'reviewed', '--kind', 'weekly');
  ask(dir, 'B', 'Second?');
  state(dir, 'answer', '--id', '1');
  const kept = JSON.parse(fs.readFileSync(file(dir), 'utf8'));
  assert.deepEqual(kept.questions.map((q) => q.about), ['B']);
  assert.equal(kept.reviews.weekly, daysAgo(0));
  assert.equal(kept.lastId, 2);
});

test('reviewed needs a known kind, and a damaged review date is a damaged file', () => {
  const dir = installed();
  assert.equal(state(dir, 'reviewed').code, 2);
  assert.equal(state(dir, 'reviewed', '--kind', 'daily').code, 2);
  fs.writeFileSync(file(dir), JSON.stringify({ lastId: 0, questions: [], reviews: { weekly: 'last Friday' } }));
  assert.equal(state(dir, 'due').code, 1);
  fs.writeFileSync(file(dir), JSON.stringify({ lastId: 0, questions: [], reviews: [] }));
  assert.equal(state(dir, 'list').code, 1);
});
