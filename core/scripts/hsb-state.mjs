#!/usr/bin/env node
/*
hsb-state.mjs - keeps the questions that wait for the user's answer and the dates of the weekly and monthly
reviews, in hyper-second-brain/state.json. Part of hyper-second-brain: it runs from the skill folder and is not
copied into the project. Node 18 or newer, no dependencies.

Usage:
  node <skill>/scripts/hsb-state.mjs ask      --root <project> --skill <name> --about <item> --question <text> [--today YYYY-MM-DD] [--json]
  node <skill>/scripts/hsb-state.mjs list     --root <project> [--skill <name>] [--json]
  node <skill>/scripts/hsb-state.mjs answer   --root <project> --id <n> [--json]
  node <skill>/scripts/hsb-state.mjs reviewed --root <project> --kind weekly|monthly [--today YYYY-MM-DD] [--json]
  node <skill>/scripts/hsb-state.mjs due      --root <project> [--today YYYY-MM-DD] [--json]

ask adds a question with today's date (the user's local calendar day) and prints its number; the same
question about the same item from the same skill is kept once. list prints the open questions, oldest
first. answer removes a question once the user has answered it; a number is never given twice. reviewed
records today as the date of the last weekly or monthly review. due prints each review's last date, the
days since, and whether it is due: the weekly review after 7 days, the monthly review after 30, either
one when it never ran. The file is created on the first ask or reviewed and is never placed in the vault.
Exit codes: 0 done, 1 no question with that number or a damaged state file, 2 usage, 3 hyper-second-brain
is not set up.
*/
import fs from 'node:fs';
import path from 'node:path';
import { FOLDER, STATE, REVIEWS, isDir, readManifest, readState, reviewStatus, localDay } from './hsb-lib.mjs';

const COMMANDS = ['ask', 'list', 'answer', 'reviewed', 'due'];
const USAGE = `usage: node <skill>/scripts/hsb-state.mjs ${COMMANDS.join('|')} --root <project> [--skill <name>] [--about <item>] [--question <text>] [--id <n>] [--kind weekly|monthly] [--today YYYY-MM-DD] [--json]`;

function usage(message) {
  if (message) console.error(`hsb-state: ${message}`);
  console.error(USAGE);
  process.exit(2);
}

const [command, ...argv] = process.argv.slice(2);
if (!COMMANDS.includes(command)) usage(command ? `unknown command ${command}` : 'a command is required');
const args = { root: null, skill: null, about: null, question: null, id: null, kind: null, today: localDay(), json: false };
const VALUED = { '--root': 'root', '--skill': 'skill', '--about': 'about', '--question': 'question', '--id': 'id', '--kind': 'kind', '--today': 'today' };
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
if (!/^\d{4}-\d{2}-\d{2}$/.test(args.today)) usage('--today takes YYYY-MM-DD');
if (command === 'ask') {
  for (const k of ['skill', 'about', 'question']) if (!args[k]?.trim()) usage(`ask needs --${k}`);
  if (/[\r\n]/.test(args.about + args.question)) usage('--about and --question take one line each');
}
if (command === 'answer' && !/^\d+$/.test(args.id ?? '')) usage('answer needs --id <number>');
if (command === 'reviewed' && !Object.hasOwn(REVIEWS, args.kind ?? '')) usage(`reviewed needs --kind ${Object.keys(REVIEWS).join('|')}`);
const root = path.resolve(args.root);
if (!isDir(root)) usage(`no such folder: ${root}`);

const done = (result, code, lines = []) => {
  if (args.json) console.log(JSON.stringify(result, null, 2));
  else {
    console.log(`hsb-state: ${result.message}`);
    for (const l of lines) console.log(`  ${l}`);
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

const file = path.join(root, FOLDER, STATE);
const rel = `${FOLDER}/${STATE}`;
let state;
try {
  state = readState(root);
} catch {
  done({ status: 'error', message: `${rel} is damaged; show the user the file and ask before you change it` }, 1);
}
const save = () => fs.writeFileSync(file, `${JSON.stringify(state, null, 2)}\n`);
const line = (q) => `#${q.id} ${q.asked} ${q.skill} | about: ${q.about} | ${q.question}`;

if (command === 'ask') {
  const same = state.questions.find((q) => q.skill === args.skill && q.about === args.about && q.question === args.question);
  if (same) done({ status: 'open', question: same, message: `#${same.id} is already open` }, 0);
  const q = { id: state.lastId + 1, asked: args.today, skill: args.skill, about: args.about, question: args.question };
  state.lastId = q.id;
  state.questions.push(q);
  save();
  done({ status: 'asked', question: q, message: `asked #${q.id}, about ${q.about}` }, 0);
}

if (command === 'list') {
  const open = state.questions.filter((q) => !args.skill || q.skill === args.skill);
  done({ status: 'ok', questions: open, message: `${open.length} open question(s)${args.skill ? ` of ${args.skill}` : ''}` }, 0, open.map(line));
}

if (command === 'reviewed') {
  state.reviews = { ...state.reviews, [args.kind]: args.today };
  save();
  done({ status: 'reviewed', kind: args.kind, date: args.today, message: `the ${args.kind} review is recorded for ${args.today}` }, 0);
}

if (command === 'due') {
  const reviews = reviewStatus(state, args.today);
  const due = Object.keys(reviews).filter((k) => reviews[k].due);
  const lines = Object.entries(reviews).map(([k, r]) => `${k}: ${r.last === null ? 'never ran' : `last ${r.last}, ${r.days} day(s) ago`}${r.due ? ', due' : ''}`);
  done({ status: 'ok', today: args.today, reviews, message: due.length ? `due: ${due.join(', ')}` : 'no review is due' }, 0, lines);
}

// answer
const id = Number(args.id);
const q = state.questions.find((x) => x.id === id);
if (!q) done({ status: 'unknown', message: `no open question #${id} in ${rel}` }, 1);
state.questions = state.questions.filter((x) => x.id !== id);
save();
done({ status: 'answered', question: q, message: `removed #${id}, about ${q.about}` }, 0);
