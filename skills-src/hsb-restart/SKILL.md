---
name: hsb-restart
description: Archives the whole vault in one dated folder and rebuilds it from the user's current projects, or walks a new user through getting started. Use it when the user wants to archive everything and start the vault over, says the vault is a chaos they cannot face, or, as a new user, asks how to begin with a second brain. To sort the vault item by item and keep it, use hsb-re-organize; to archive only a piled-up Inbox, use hsb-review; to build or review the Project List alone, use hsb-projects.
compatibility: Requires Node.js 18 or newer.
license: MIT
metadata:
  version: "{{version}}"
  package: "@jiemurat/hyper-second-brain"
---

# hsb-restart

<!-- include: skill-parts/intro.md -->
This skill gives the user a fresh start: it moves everything in the vault's category folders into one dated folder in Archives, where all of it stays as it was, and rebuilds the vault from the projects the user works on now; for a new user, it walks through getting started, one stage at a time. Sorting old material item by item costs more attention than the material is worth; starting over keeps it all and asks for none of that. The rules that hold for the whole vault are in `HYPER-SECOND-BRAIN.md`; `references/restart.md` holds starting over, `references/getting-started.md` the stages of getting started, and `references/folder-about.md` the rules of the `_about.md` note that describes a folder. The script `scripts/reorganize.mjs` plans and carries out the move.

## Core rules

1. **Talk in the user's language.** Reports and questions use the user's language; a reason in the script's plan is in the user's language, and a line you write into `project.md` is in English.
2. **Start over only on the user's yes.** Starting the vault over is asked first (`HYPER-SECOND-BRAIN.md` → "What you may do and what you ask first"): show what moves and what stays, and wait for the yes. When the vault already follows PARA and the user does not ask to start over, move nothing, and offer as one of the ways to leave the vault as it is and work from the user's projects. The vault follows PARA when the folder that the "Folders" table of `project.md` gives each of the four categories exists in the vault; how the folders inside are named does not change that.
3. **Keep everything.** The move deletes nothing and changes no file; an item comes back by moving it out. It needs a way back from a mistake first: a committed vault or the user's word that a backup exists.
4. **Rebuild from now, not from the past.** After the move, build the vault from the projects the user works on now; bring old material back only when a project needs it, never in a sweep.

## Steps

<!-- include: skill-parts/skill-dir.md -->
<!-- include: skill-parts/project-dir.md -->
The script runs as `node <skill>/scripts/reorganize.mjs <command> --root <project> --json`.

1. **Context.** Open `<project>/HYPER-SECOND-BRAIN.md`, then `<project>/hyper-second-brain/project.md`; take the vault path, the folder of each category, the instruction files, and the user's lasting choices, among them the line "Getting started:" when it is there. When `project.md` is missing, tell the user, offer `hsb-init`, and stop. List the folders of the vault and open the note `Project List.md` in the Projects folder when it exists. Done when you hold the folder of each category, the lasting choices, and the list of the vault's folders.
2. **Know the request.** Decide the job:
   - starting the vault over: `references/restart.md`;
   - getting started, for a new user or one who asks how to begin: `references/getting-started.md`;
   - the user calls the vault a chaos or a mess, or says they cannot face it, and asks neither to start over nor how to begin: such words alone are no request to start over, so offer the ways in one message, each with what it asks of the user and what it changes in the vault: `hsb-re-organize` sorts every item and keeps it in place, and the user approves its plan and answers a question for each unclear item; starting over archives everything at once after one yes, the user answers the questions of a new Project List, and old material comes back only when a project needs it; for a vault that already follows PARA, also the third way of core rule 2: nothing moves, the user answers the questions of the Project List that `hsb-projects` builds or reviews, and the old material stays where it is. Follow the user's choice; when the user chooses none, change nothing.

   Done when the request has a job, or the user has the choice.
3. **Do the job** as its reference says; when the user chose none, go to step 4. Done when the job reached the "Done when" of its reference, or the user chose none.
4. **Report.** Write in the chat, in the user's language: what moved and where (the folder's name exactly as written, the count), what stayed in place, the projects the list now holds, for getting started the stage taken and the next one, and the questions at the end. When the user chose none of the ways, say that nothing changed and that the user can pick a way later, without listing the ways or asking about them again. A review that is due comes after the questions, as `HYPER-SECOND-BRAIN.md` → "What you may do and what you ask first" says, also when nothing moved. Done when the user has the report.

## Files and when to read them

| File | Contents | When to read |
|---|---|---|
| `scripts/reorganize.mjs` | Plans and carries out the move into the dated archive, verifies it, takes it back | Run it as `references/restart.md` says; do not read it: the reference gives you everything you need |
| `scripts/hsb-lib.mjs` | The helpers the script uses | Never |
| `references/restart.md` | Starting the vault over: the plan, the move, the rebuild, the exit codes | Step 3, to start over |
| `references/getting-started.md` | The eight stages of getting started and the skill that does each | Step 3, for getting started |
| `references/folder-about.md` | The `_about.md` note of a folder | Step 3, for the `_about.md` of the dated folder |
| `../hsb-projects/references/project-list.md` | Building the Project List (the skill sits in the folder next to this skill's folder) | Step 3, in the rebuild |
| `../hsb-projects/references/lifecycle.md` | Starting a project | Step 3, in the rebuild |
| `<project>/hyper-second-brain/project.md` | The project's settings: the folder of each category, the user's lasting choices | Step 1 |
| `<project>/HYPER-SECOND-BRAIN.md` | The package's general rules for the vault; this skill names its sections | Step 1, and wherever a step names a section |
