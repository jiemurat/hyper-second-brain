// Throwaway projects for the scaffold tests. Every note and file is invented.
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// The temporary folders and files a test file makes go when its process exits.
const made = [];
process.on('exit', () => {
  for (const p of made) fs.rmSync(p, { recursive: true, force: true });
});

/** Removes `p` (a folder or a file in the system temporary folder) when the test file's process exits. */
export function removeAtExit(p) {
  made.push(p);
  return p;
}

export const tmp = (prefix = 'hsb-fx-') => removeAtExit(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));

export function write(dir, rel, data) {
  const file = path.join(dir, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, data);
  return file;
}

/** Every file under dir (the .git folder left out): relative path -> SHA-256. */
export function snapshot(dir) {
  const out = {};
  const walk = (rel) => {
    for (const e of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.name === '.git') continue;
      if (e.isDirectory()) walk(r);
      else out[r] = crypto.createHash('sha256').update(fs.readFileSync(path.join(dir, r))).digest('hex');
    }
  };
  walk('');
  return out;
}

/** Every folder under dir, relative, sorted. */
export function folders(dir) {
  const out = [];
  const walk = (rel) => {
    for (const e of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
      if (!e.isDirectory() || e.name === '.git') continue;
      const r = rel ? `${rel}/${e.name}` : e.name;
      out.push(r);
      walk(r);
    }
  };
  walk('');
  return out.sort();
}

export const emptyProject = () => tmp();

/** A vault with numbered PARA folders, a folder outside PARA, an assets folder, and instruction files. */
export function numberedVault({ rootAgents = false } = {}) {
  const dir = tmp();
  const v = (rel, text = 'Invented text.\n') => write(dir, `vault/${rel}`, text);
  v('AGENTS.md', '# Vault\n\nThe vault is organized by PARA.\n');
  v('Home Page.md');
  v('0. INBOX/AGENTS.md', '# 0. INBOX\n');
  v('0. INBOX/Quick idea.md');
  v('0. INBOX/Scan 1.pdf', Buffer.from([37, 80, 68, 70, 45, 1, 2, 3]));
  v('1. PROJECTS/AGENTS.md', '# 1. PROJECTS\n');
  v('1. PROJECTS/ALPHA/Plan.md');
  v('2. AREAS/AGENTS.md', '# 2. AREAS\n');
  v('2. AREAS/WORK/Notes.md');
  v('3. RESOURCES/AGENTS.md', '# 3. RESOURCES\n');
  v('3. RESOURCES/BOOKS/Summary.md');
  v('4. ARCHIVE/AGENTS.md', '# 4. ARCHIVE\n');
  v('5. TOOLS/AGENTS.md', '# 5. TOOLS\n');
  v('5. TOOLS/profiles/Person A.md');
  v('_assets/_images/pic.png', Buffer.from([137, 80, 78, 71, 1, 2, 3]));
  if (rootAgents) write(dir, 'AGENTS.md', '# Project\n\nOwn rules of this project.\n');
  return dir;
}

export const claudeOnly = () => {
  const dir = tmp();
  write(dir, 'CLAUDE.md', '# Claude rules\n\nBe brief.\n');
  fs.mkdirSync(path.join(dir, 'vault'));
  return dir;
};

/** A pan-harness style project: AGENTS.md with a numbered Session start list, PAN-HARNESS.md and pan-harness/. */
export function harnessProject() {
  const dir = tmp();
  write(dir, 'AGENTS.md', [
    '# Project', '', 'Entry point.', '', '## Boundaries', '', '- **Never:** push.', '',
    '## Session start', '',
    '1. Read this file, then `PAN-HARNESS.md`.',
    '2. Look at `git status`.',
    '3. If `pan-harness/handoff.md` says active:',
    '   continue from `Next step`.',
    '4. Read the rest when needed.', '',
    '## Workflow', '', 'Work in steps.', '',
  ].join('\n'));
  write(dir, 'PAN-HARNESS.md', '# PAN-HARNESS\n\nStandard: pan-harness 1.3.1\n');
  write(dir, 'pan-harness/state.md', '# State\n');
  fs.mkdirSync(path.join(dir, 'vault'));
  return dir;
}
