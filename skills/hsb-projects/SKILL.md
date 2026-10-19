---
name: hsb-projects
description: Keeps the user's Project List and runs a project's start, changes, and finish in the second-brain vault. Use it when the user starts, changes, finishes, pauses, or reopens a project, asks to build or review their list of projects, or feels their commitments pile up. To file a single note or file, use hsb-place-an-item; for a weekly or monthly review, use hsb-review; to see where a project stands, use hsb-find; to work on a project's content, use hsb-create.
compatibility: Requires Node.js 18 or newer.
license: MIT
metadata:
  version: "1.0.1"
  package: "@jiemurat/hyper-second-brain"
---

# hsb-projects

hyper-second-brain looks after the user's second brain: a vault of notes and documents (for example an Obsidian vault) in the folder that the Vault line of `hyper-second-brain/project.md` names (`vault/` by default).
This skill keeps the Project List and runs the life of a project: building and reviewing the list, starting a project, changing it, finishing it, and reopening it. The rules that hold for the whole vault are in `HYPER-SECOND-BRAIN.md`, the form of the list included; `references/project-list.md` holds the rules of building and reviewing the list, `references/lifecycle.md` the rules of a project's start, change, finish, and reopening, and `references/folder-about.md` the rules of the `_about.md` note that describes a folder. The rules of placing an item are in the `hsb-place-an-item` skill, which you read at run time. The script `scripts/hsb-state.mjs` keeps the questions that wait for the user's answer.

## Core rules

1. **Talk in the user's language.** Reports and questions use the user's language; the list follows `HYPER-SECOND-BRAIN.md` → "Project List", and notes and folder names follow "Language" and "Folders and names". A question you keep with the script and a line you write into `project.md` are in English.
2. **A project records a commitment.** Create, archive, or reopen a project folder, and add or remove an entry, only on the user's words or yes. A project needs a goal and a timeframe; while one of them is missing, it is a project in the making: keep the question and create no folder.
3. **Take the rules of placing from `hsb-place-an-item`.** Telling projects from areas, keeping one item in one place, and placing material that leaves a finished project follow `../hsb-place-an-item/SKILL.md` and `../hsb-place-an-item/references/placement.md`; copy none of them into your notes or questions.
4. **Plan the project, leave its work to the user.** Prepare the folder, the entry, the first note, and the material the goal needs; the project's own work starts when the user asks for it.
5. **Report in the chat.** Keep no log in the vault: the questions that wait go to the script (step 4), and the rest goes into the report.

## Steps

`<skill>` is the folder that holds this SKILL.md.
`<project>` is the folder where the agent was opened (the project root), or the folder the user names.
The script runs as `node <skill>/scripts/hsb-state.mjs <command> --root <project> --json`.

1. **Context.**
   - Open `<project>/HYPER-SECOND-BRAIN.md`, then `<project>/hyper-second-brain/project.md`, and take the folder of each category, the instruction files, the project rules, and the user's decisions and lasting choices. When `project.md` is missing, tell the user, offer `hsb-init`, and stop. When a section of `HYPER-SECOND-BRAIN.md` that this skill names is missing, tell the user and offer `hsb-doctor`.
   - Open each instruction file that `project.md` lists and that exists, and the `AGENTS.md` or `CLAUDE.md` in `<project>` when you have not read it in this session.
   - Open the note `Project List.md` in the Projects folder when it exists, and list the folders in Projects and in Archives.
   - Read `../hsb-place-an-item/SKILL.md` and `../hsb-place-an-item/references/placement.md` (the skill `hsb-place-an-item` sits in the folder next to this skill's folder). When either is missing, tell the user to reinstall the skills with `npx @jiemurat/hyper-second-brain@latest init` in `<project>`, and stop.
   - Run `list --skill hsb-projects`. Its exit code says what to do:
     - 0: the output lists the open questions of this skill, each with its number, date, item, and question (none while the file does not exist yet).
     - 1: `hyper-second-brain/state.json` is damaged. Show the user the file, ask before you change it, and go on without it.
     - 2: a usage error; the message says what to fix.
     - 3: hyper-second-brain is not set up here. Offer `hsb-init` and stop.

   Done when you hold the folder of each category, the lasting choices, the list and the project folders as they are, the rules of placing, and the open questions of this skill.
2. **Know the request.** Decide which jobs the user's words ask for: build the list, review the list, start a project, change a project (rename, split, shrink its scope), finish a project (completed, paused, cancelled, or handed over), reopen a project. Efforts the user names that are neither on the list nor in Archives go through `references/lifecycle.md` → "Projects from efforts" first; a project in Archives is reopened. Put an open question that bears on these jobs to the user together with your other questions. Done when every part of the request has a job, or a question to the user.
3. **Do the jobs.** Build and review the list as `references/project-list.md` says; start, change, finish, and reopen a project as `references/lifecycle.md` says. Change an entry in the same step as its folder (`HYPER-SECOND-BRAIN.md` → "Project List"). Done when each job reached the "Done when" of its section in the reference.
4. **Keep the open questions.** For each question the user leaves open that the next run needs (a project in the making, a timeframe too rough to compare with today, a list the user wants built later), run `ask --skill hsb-projects --about <the project or item, as the vault or the user names it> --question <the question in English>`; a question the user answers in this run needs no record. When the user answers an open question, apply the answer and run `answer --id <number>`. The exit codes of `ask` and `answer`:
   - 0: kept, or removed.
   - 1: no open question has that number (run `list` again), or the file is damaged (as in step 1).
   - 2: a usage error, for example a question of two lines.
   - 3: hyper-second-brain is not set up here.

   Done when every question the user left open is kept and every answered one is removed.
5. **Describe the folders.** For each folder this run created, moved material into, archived, or reopened, create or update its `_about.md` and the one of the folder it went into, as `references/folder-about.md` says for placing items; in a folder that went to Archives, the purpose says what it holds and why it is inactive. Done when each of those folders has an `_about.md` that is true.
6. **Report and ask.** Write the report in the chat, in the user's language:
   - each project you created, renamed, split, archived, or reopened, spelled exactly as in the vault, with its place on the list;
   - what you brought into a project and from where, and what left a finished project and where it went;
   - the `_about.md` files you created or updated, each with one clause for the reason;
   - the questions, all together at the end, each with its choices.

   Done when the user has the report.

## Files and when to read them

| File | Contents | When to read |
|---|---|---|
| `scripts/hsb-state.mjs` | Keeps the questions that wait for the user's answer in `hyper-second-brain/state.json` | Run it in steps 1 and 4; do not read it: the steps give you everything you need |
| `scripts/hsb-lib.mjs` | The helpers the script uses | Never |
| `references/project-list.md` | Building and reviewing the Project List | Step 3 |
| `references/lifecycle.md` | Projects from efforts; starting, changing, shrinking, finishing, and reopening a project | Steps 2 and 3 |
| `references/folder-about.md` | The `_about.md` note of a folder: which folders get one, what goes in it, how to write or update it | Step 3 when you place material, and step 5 |
| `../hsb-place-an-item/SKILL.md` | The rules of placing one item and the steps that decide where it goes | Step 1, and when material leaves a finished project |
| `../hsb-place-an-item/references/placement.md` | Telling projects from areas, choosing the folder, one item one place | Steps 1 and 3 |
| `../hsb-create/references/making.md` | The outline at a project's start | Step 3, when a project starts |
| `../hsb-create/references/focus.md` | The final "Where I left off" entry of a project that stops; help with one project at a time | Step 3, when a project is paused, cancelled, or handed over, and after the review of an overwhelmed user |
| `<project>/hyper-second-brain/project.md` | The project's settings: the folder of each category, the instruction files, the project rules, the user's decisions and lasting choices | Step 1 |
| `<project>/HYPER-SECOND-BRAIN.md` | The package's general rules for the vault, the form of the Project List included; this skill names its sections | Step 1, and wherever a step names a section |
