#!/usr/bin/env node
// hyper-second-brain CLI: installs the hsb-* agent skills into a project and keeps them current.
// The skills do the real work inside the agent (hsb-init, hsb-doctor, hsb-update, hsb-place-an-item, hsb-projects, hsb-review, hsb-find, hsb-capture, hsb-distill, hsb-create, hsb-share, hsb-restart, hsb-re-organize).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { spawnSync } from 'node:child_process';
import { TARGETS, DEFAULT_COMMANDS, parseAgents } from '../lib/agents.js';
import { PKG, install, update, remove, status, changelogSince, LocalChanges } from '../lib/install.js';
import { lookupLatest, compareVersions } from '../lib/registry.js';

const HELP = `hyper-second-brain ${PKG.version} - agent skills that set up and look after a second brain (${PKG.name})

Usage: npx ${PKG.name}@latest <command> [options]

Commands:
  init      install the hsb-* skills into this project (then run /hsb-init in your agent)
  update    replace the installed skills with this version, or files of the same version
            whose content differs (hsb-update runs it);
            with --agents, install them for another set of agents
  remove    delete the installed skills, command files and .gitignore lines
  status    installed version, newest version on npm, files changed by hand

Options:
  --dir <path>       project folder (default: the current folder)
  --agents <list>    where to install, comma separated (default: agents,claude):
                     ${Object.keys(TARGETS).join(', ')}, all; agent names work too (codex, cursor, ...)
  --no-commands      do not write /hsb-* command files for Gemini CLI and OpenCode
  --yes              overwrite or delete files changed by hand without asking
  --dry-run          show what would be written, change nothing
  -v, --version      print the version
  -h, --help         this help

Exit status: 0 done, 1 error, 2 usage error, 3 files changed by hand (rerun with --yes).
The skills are tools, not project knowledge: they go to .gitignore and are installed again with npx.`;

class UsageError extends Error {}

function parse(argv) {
  const opts = { command: null, dir: process.cwd(), agents: null, commands: true, yes: false, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-h' || a === '--help') opts.command = 'help';
    else if (a === '-v' || a === '--version') opts.command = 'version';
    else if (a === '--dir') opts.dir = path.resolve(argv[++i] || '');
    else if (a.startsWith('--dir=')) opts.dir = path.resolve(a.slice(6));
    else if (a === '--agents') opts.agents = argv[++i];
    else if (a.startsWith('--agents=')) opts.agents = a.slice(9);
    else if (a === '--no-commands') opts.commands = false;
    else if (a === '--yes' || a === '-y') opts.yes = true;
    else if (a === '--dry-run') opts.dryRun = true;
    else if (!a.startsWith('-') && !opts.command) opts.command = a;
    else throw new UsageError(`unknown argument '${a}'`);
  }
  if (!fs.existsSync(opts.dir) || !fs.statSync(opts.dir).isDirectory()) {
    throw new UsageError(`no such folder: ${opts.dir} - give an existing project folder with --dir`);
  }
  return opts;
}

/** The top of the git repository dir is in, or null (not a repository, or git is missing). */
function gitTop(dir) {
  const r = spawnSync('git', ['-C', dir, 'rev-parse', '--show-toplevel'], { encoding: 'utf8' });
  return r.status === 0 && r.stdout.trim() ? path.resolve(r.stdout.trim()) : null;
}

// the system's own resolution: case, short names and links do not make one folder look like two
const sameDir = (a, b) => {
  try {
    return fs.realpathSync.native(a) === fs.realpathSync.native(b);
  } catch {
    return path.resolve(a) === path.resolve(b);
  }
};

function ask(question) {
  if (!process.stdin.isTTY) return Promise.resolve(false);
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(`${question} [y/N] `, (answer) => {
    rl.close();
    resolve(/^y(es)?$/i.test(answer.trim()));
  }));
}

/** Run op; when files were changed by hand, list them and ask (or exit 3 without a terminal). */
async function guarded(op, opts, verb) {
  try {
    return op({ ...opts, yes: opts.yes });
  } catch (e) {
    if (!(e instanceof LocalChanges)) throw e;
    console.log(`These files were changed by hand (or are not from hyper-second-brain):`);
    e.files.slice(0, 20).forEach((f) => console.log(`  ${f}`));
    if (e.files.length > 20) console.log(`  … ${e.files.length - 20} more`);
    if (await ask(`${verb} them anyway?`)) return op({ ...opts, yes: true });
    console.log(`Nothing changed. Rerun with --yes to ${verb.toLowerCase()} them.`);
    process.exitCode = 3;
    return null;
  }
}

function where(targets, commands) {
  const lines = targets.map((k) => `  ${TARGETS[k].dir}/  (${TARGETS[k].label})`);
  if (targets.includes('agents') && commands.length) lines.push(`  commands: ${commands.map((c) => (c === 'gemini' ? '.gemini/commands/' : '.opencode/commands/')).join(', ')}`);
  return lines.join('\n');
}

function nextSteps(skill) {
  return `Next: open your agent in this folder and run
  Claude Code, Antigravity, Cursor, GitHub Copilot, Gemini CLI, OpenCode:  /${skill}
  Codex:  $${skill}`;
}

async function main() {
  const opts = parse(process.argv.slice(2));
  const commands = opts.commands ? DEFAULT_COMMANDS : [];
  const targets = opts.agents ? parseAgents(opts.agents) : null;
  const dry = opts.dryRun ? ' (dry run, nothing written)' : '';
  switch (opts.command) {
    case null:
    case 'help':
      console.log(HELP);
      return;
    case 'version':
      console.log(PKG.version);
      return;
    case 'init': {
      if (sameDir(opts.dir, os.homedir()) && !opts.yes) {
        throw new UsageError('this is your home folder: skills installed here act as global skills for some agents, '
          + 'and the .gitignore lands in your home - run it in a project folder, or add --yes if you mean it');
      }
      const useTargets = targets || parseAgents(null);
      const r = await guarded((o) => install(opts.dir, { targets: useTargets, commands, dryRun: o.dryRun, yes: o.yes }), opts, 'Overwrite');
      if (!r) return;
      if (r.status === 'present') {
        console.log(`hyper-second-brain ${r.version} skills are already installed here.`);
        if (targets && !(targets.length === r.targets.length && targets.every((k) => r.targets.includes(k)))) {
          console.log(`They are installed for: ${r.targets.join(', ')}. To change that, run: npx ${PKG.name}@latest update --agents ${targets.join(',')}`);
        }
        console.log(nextSteps('hsb-init'));
      } else if (r.status === 'outdated') {
        console.log(`hyper-second-brain ${r.version} skills are installed here; this is ${PKG.version}. Run: npx ${PKG.name}@latest update`);
      } else if (r.status === 'newer') {
        console.log(`hyper-second-brain ${r.version} skills are installed here, newer than this ${PKG.version}. Use the newest: npx ${PKG.name}@latest status`);
      } else {
        console.log(`Installed hyper-second-brain ${r.version} skills${dry}:\n${where(useTargets, commands)}\n.gitignore: the tool files are ignored, they are not project knowledge.\n${nextSteps('hsb-init')}`);
        const top = gitTop(opts.dir);
        if (top && !sameDir(top, opts.dir)) {
          console.log(`\nNote: this folder is inside the git repository ${top}. Agents read project skills from the folder they are opened in, `
            + `usually the repository root; to install there: npx ${PKG.name}@latest init --dir "${top}"`);
        }
      }
      return;
    }
    case 'update': {
      const r = await guarded((o) => update(opts.dir, { targets, commands: opts.commands ? null : [], dryRun: o.dryRun, yes: o.yes }), opts, 'Overwrite');
      if (!r) return;
      if (r.status === 'missing') {
        console.log(`hyper-second-brain skills are not installed here. Run: npx ${PKG.name}@latest init`);
        process.exitCode = 1;
      } else if (r.status === 'newer') {
        console.log(`The skills installed here (${r.version}) are newer than this hyper-second-brain (${PKG.version}); nothing was changed. `
          + `Run: npx ${PKG.name}@latest update (or add --yes to go back to ${PKG.version})`);
        process.exitCode = 1;
      } else if (r.status === 'current') console.log(`hyper-second-brain ${r.version} skills are up to date.`);
      else if (r.from === r.to) {
        console.log(`Reinstalled hyper-second-brain ${r.to} skills${dry} for: ${r.targets.join(', ')}.${r.differ ? ` ${r.differ} file(s) differ from this package.` : ''}`);
        if (!r.dryRun) console.log(where(r.targets, r.commands));
      } else {
        console.log(`Updated hyper-second-brain skills ${r.from} -> ${r.to}${dry}.`);
        const notes = changelogSince(r.from);
        if (notes) console.log(`\n${notes}\n`);
        if (!r.dryRun) console.log(`Migration steps: ${r.skillDir}/hsb-update/references/changelog.md (the agent's hsb-update follows them).`);
      }
      return;
    }
    case 'remove': {
      const r = await guarded((o) => remove(opts.dir, { dryRun: o.dryRun, yes: o.yes }), opts, 'Delete');
      if (!r) return;
      if (r.status === 'missing') console.log('hyper-second-brain skills are not installed here.');
      else console.log(`Removed hyper-second-brain ${r.version} skills${dry}: ${r.files.length} file(s). The project's HYPER-SECOND-BRAIN.md and hyper-second-brain/ folder are untouched.`);
      return;
    }
    case 'status': {
      const s = status(opts.dir);
      const found = await lookupLatest(PKG.name);
      const latest = found.version;
      const newest = `newest on npm: ${{
        found: latest,
        'not-published': 'not published there',
        unreachable: 'unknown (the registry could not be reached)',
        skipped: 'not checked (HSB_OFFLINE=1)',
      }[found.state]}`;
      if (s.status === 'missing') {
        console.log(`hyper-second-brain skills: not installed here (this package: ${s.packageVersion}, ${newest}).`);
        return;
      }
      console.log(`hyper-second-brain skills: ${s.version} installed (${newest}).\n${where(s.targets, s.commands)}`);
      console.log(s.changed.length ? `Changed by hand: ${s.changed.length} file(s), e.g. ${s.changed[0]}` : 'No file changed by hand.');
      if (latest && compareVersions(latest, s.version) > 0) console.log(`Update: npx ${PKG.name}@latest update (or /hsb-update in the agent).`);
      return;
    }
    default:
      console.error(`unknown command '${opts.command}'\n\n${HELP}`);
      process.exitCode = 2;
  }
}

main().catch((e) => {
  console.error(`hyper-second-brain: ${e.message}`);
  process.exitCode = e instanceof UsageError || /unknown (argument|agent|command)/.test(e.message) ? 2 : 1;
});
