---
name: hsb-review
description: Runs the weekly and monthly reviews of the user's second-brain vault and moves material when the user's roles or interests change. Use it when the user asks for a weekly or monthly review or accepts one you offered, wants a piled-up Inbox archived whole, or says that a role, responsibility, or interest of theirs started or ended (a new job, a duty handed over, a dropped hobby). To sort the Inbox without a review, use hsb-place-an-item; to review only the Project List, use hsb-projects; for the patterns in one project's material, use hsb-find; to bring highlights or notes from another app into the vault outside a review, use hsb-capture; to archive the whole vault and start over, use hsb-restart.
compatibility: Requires Node.js 18 or newer.
license: MIT
metadata:
  version: "1.0.1"
  package: "@jiemurat/hyper-second-brain"
---

# hsb-review

hyper-second-brain looks after the user's second brain: a vault of notes and documents (for example an Obsidian vault) in the folder that the Vault line of `hyper-second-brain/project.md` names (`vault/` by default).
This skill runs the reviews of the vault: the weekly review, which empties the Inbox and brings the Project List up to date, and the monthly review, which steps back to the user's goals, areas, and interests. It also moves material between the categories when the user's roles, responsibilities, or interests change, and archives a piled-up Inbox whole. The rules that hold for the whole vault are in `HYPER-SECOND-BRAIN.md`; `references/weekly.md` holds the weekly review, `references/monthly.md` the monthly review, `references/changes.md` the moving of material after a change and the reflection on areas and resources, `references/inbox-archive.md` the archiving of the whole Inbox, and `references/folder-about.md` the rules of the `_about.md` note that describes a folder. Placing the Inbox items and reviewing the Project List follow the skills `hsb-place-an-item` and `hsb-projects`, which you read at run time. The script `scripts/hsb-state.mjs` keeps the review dates and the questions that wait for the user's answer; `scripts/reorganize.mjs` archives the Inbox.

## Core rules

1. **Talk in the user's language.** Reports and questions use the user's language; notes and folder names follow `HYPER-SECOND-BRAIN.md` → "Language" and "Folders and names". A question you keep with the script and a line you write into `project.md` are in English.
2. **Keep the review lean.** Put all the questions of a step in one message, apply the answers, and go on. A review is done when the vault is ready for the user's next action; leave any deeper tidying for the user to ask for.
3. **Take the rules of placing and of projects from their skills.** Placing an item, telling the categories apart, and keeping one item in one place follow `../hsb-place-an-item/SKILL.md` and `../hsb-place-an-item/references/placement.md`; the Project List and the life of a project follow `../hsb-projects/SKILL.md`, `../hsb-projects/references/project-list.md`, and `../hsb-projects/references/lifecycle.md`. Copy none of them into your notes or questions.
4. **Move material for a change the user names.** Promote or demote material, and create, archive, or reopen an area or a project, only for a change the user named or confirmed.
5. **Report in the chat.** Keep no log in the vault: the review dates and the questions that wait go to the script (step 4), and the rest goes into the report.

## Steps

`<skill>` is the folder that holds this SKILL.md.
`<project>` is the folder where the agent was opened (the project root), or the folder the user names.
The script `hsb-state.mjs` runs as `node <skill>/scripts/hsb-state.mjs <command> --root <project> --json`.

1. **Context.**
   - Open `<project>/HYPER-SECOND-BRAIN.md`, then `<project>/hyper-second-brain/project.md`, and take the folder of each category, the instruction files, the project rules, and the user's decisions and lasting choices. When `project.md` is missing, tell the user, offer `hsb-init`, and stop. When a section of `HYPER-SECOND-BRAIN.md` that this skill names is missing, tell the user and offer `hsb-doctor`.
   - Open each instruction file that `project.md` lists and that exists, and the `AGENTS.md` or `CLAUDE.md` in `<project>` when you have not read it in this session.
   - Read `../hsb-place-an-item/SKILL.md`, `../hsb-place-an-item/references/placement.md`, `../hsb-projects/SKILL.md`, `../hsb-projects/references/project-list.md`, and `../hsb-projects/references/lifecycle.md` (the two skills sit in the folders next to this skill's folder). When one of them is missing, tell the user to reinstall the skills with `npx @jiemurat/hyper-second-brain@latest init` in `<project>`, and stop.
   - Run `due`, then `list`. Their exit codes:
     - 0: `due` gives each review's last date, the days since, and whether it is due; `list` gives the open questions of every skill, each with its number, date, skill, item, and question (none while the file does not exist yet).
     - 1: `hyper-second-brain/state.json` is damaged. Show the user the file, ask before you change it, and go on without it.
     - 2: a usage error; the message says what to fix.
     - 3: hyper-second-brain is not set up here. Offer `hsb-init` and stop.

   Done when you hold the folder of each category, the lasting choices, the rules of placing and of projects, the review dates, and the open questions.
2. **Know the request.** Decide which jobs the user's words ask for: the weekly review, the monthly review, archiving the whole Inbox, or moving material after a change in the user's roles, responsibilities, or interests. When the user asks for a review without saying which, run the one that is due; when both are due, run the weekly review and then the monthly review, with one review of the Project List (`references/monthly.md` → "The steps"). A change the user names during a review joins that review. Done when every part of the request has a job, or a question to the user.
3. **Do the jobs.** Run the weekly review as `references/weekly.md` says, the monthly review as `references/monthly.md` says, the archiving of the Inbox as `references/inbox-archive.md` says, and the moving of material after a change as `references/changes.md` → "Moving material after a change" says. Done when each job reached the "Done when" of its section in the reference.
4. **Record the reviews and the open questions.**
   - When every step of a review has been put to the user, run `reviewed --kind weekly` or `reviewed --kind monthly`; a review the user stopped halfway gets no date.
   - For each question the user leaves open that the next review needs, run `ask --skill hsb-review --about <the item, as the vault or the user names it> --question <the question in English>`; a question about a project goes as `../hsb-projects/SKILL.md` says. When the user answers an open question, apply the answer and run `answer --id <number>`.

   The exit codes of `reviewed`, `ask`, and `answer`:
   - 0: recorded, kept, or removed.
   - 1: no open question has that number (run `list` again), or the file is damaged (as in step 1).
   - 2: a usage error, for example a question of two lines or a kind other than `weekly` and `monthly`.
   - 3: hyper-second-brain is not set up here.

   Done when each review that ran in full has today's date, every question the user left open is kept, and every answered one is removed.
5. **Describe the folders.** For each folder this run created, moved material into, archived, or reopened, and each area whose standard the user stated, create or update its `_about.md` and the one of the folder it went into, as `references/folder-about.md` says for placing items; the Inbox archive writes its files in its plan (`references/inbox-archive.md`). Done when each of those folders has an `_about.md` that is true.
6. **Report and ask.** Write the report in the chat, in the user's language:
   - what each review step did, in a line or two: the Inbox items as the report of `hsb-place-an-item` lists them (for an archived Inbox, the count and the folder), the projects that changed, the material that moved between categories, each folder spelled exactly as in the vault;
   - the tasks that the Inbox items imply, each with the exact name of its project or area, for the user's to-do list;
   - the `_about.md` files you created or updated, each with one clause for the reason;
   - the review dates you recorded, and an offer of each review that is due and did not run;
   - the questions, all together at the end, each with its choices.

   Done when the user has the report.

## Files and when to read them

| File | Contents | When to read |
|---|---|---|
| `scripts/hsb-state.mjs` | Keeps the review dates and the questions that wait for the user's answer in `hyper-second-brain/state.json` | Run it in steps 1 and 4; do not read it: the steps give you everything you need |
| `scripts/reorganize.mjs` | Archives the whole Inbox in one batch that can be taken back | Run it as `references/inbox-archive.md` says; do not read it |
| `scripts/hsb-lib.mjs` | The helpers the scripts use | Never |
| `references/weekly.md` | The weekly review: the Inbox, the projects, the questions about changes, the additions | Step 3 |
| `references/monthly.md` | The monthly review: goals, projects, areas, ideas kept for later, recurring themes, priorities | Step 3 |
| `references/changes.md` | Moving material after a change in the user's roles, responsibilities, or interests; reflecting on areas and resources | Steps 2 and 3 |
| `references/inbox-archive.md` | Archiving the whole Inbox into one dated folder of Archives | Step 3, when the user chooses it |
| `references/folder-about.md` | The `_about.md` note of a folder: which folders get one, what goes in it, how to write or update it | Step 3 when you move material, and step 5 |
| `../hsb-place-an-item/SKILL.md` | The rules of placing one item and the steps that decide where it goes | Step 1, and for the Inbox items |
| `../hsb-place-an-item/references/placement.md` | Telling the categories apart, choosing the folder, one item one place, the report | Steps 1 and 3 |
| `../hsb-projects/SKILL.md` | The rules of projects and the open questions about them | Step 1 |
| `../hsb-projects/references/project-list.md` | Building and reviewing the Project List | Steps 1 and 3 |
| `../hsb-projects/references/lifecycle.md` | Projects from efforts; starting, changing, shrinking, finishing, and reopening a project | Steps 1 and 3 |
| `<project>/hyper-second-brain/project.md` | The project's settings: the folder of each category, the instruction files, the project rules, the user's decisions and lasting choices | Step 1 |
| `<project>/HYPER-SECOND-BRAIN.md` | The package's general rules for the vault; this skill names its sections | Step 1, and wherever a step names a section |
