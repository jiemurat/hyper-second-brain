---
name: hsb-init
description: Sets up hyper-second-brain in a project, with the vault and its PARA folders. Use when the project has no hyper-second-brain yet, or when the user asks to set up their second brain.
compatibility: Requires Node.js 18 or newer.
license: MIT
metadata:
  version: "{{version}}"
  package: "@jiemurat/hyper-second-brain"
---

# hsb-init

<!-- include: skill-parts/intro.md -->
This skill sets a project up once: it writes `HYPER-SECOND-BRAIN.md`, the package's general rules, into the project root (a file that is already there stays as it is), writes `hyper-second-brain/project.md` (the vault's folders and the project's own rules) and a manifest, connects the rules file to the agent's instruction files, and creates the vault and its PARA folders when they are missing.

## Core rules

1. **Talk in the user's language, write in English.** Questions and reports to the user use the user's language. Every file the skill creates is in English. The one exception is the pointer line in an instruction file that is not in English: it is written in the language of that file (step 4).
2. **Find facts yourself and ask only what you cannot find.** You ask the user only these: where the vault is (only when `scaffold.mjs` exits with 4), which folder is meant when two compete for a category (only on exit 5), the yes to the plan (step 3), a decision on each conflict between a project rule and `HYPER-SECOND-BRAIN.md` (step 5), and the offer of step 7 (`git init`).
3. **Leave the user's content alone.** List names of folders and files only. Never open a note to read it, never rename or delete anything in the vault, and never change an instruction file beyond adding the pointer line. The only files of the user's you open are instruction files such as `AGENTS.md`, in the project root or in the vault (steps 4 and 5): they hold rules, not notes.
4. **Repeat nothing the project already has.** The project's own rules, instruction files, and harness stay as they are; `HYPER-SECOND-BRAIN.md` → "Order of authority" says which rule wins. Add the pointer line and nothing else to an instruction file that exists. Do not take up the project's own unfinished work (for example an active handoff of its harness): tell the user about it.
5. **Show the plan, then write.** Describe what will be created or changed in plain words and wait for the user's yes before step 4.

## Steps

<!-- include: skill-parts/skill-dir.md -->
<!-- include: skill-parts/project-dir.md -->

1. **Situation.** Look for `hyper-second-brain/.manifest.json` in `<project>`. When it exists, hyper-second-brain is already set up: compare `version` in that manifest with `metadata.version` in this SKILL.md, offer `hsb-doctor` (same version) or `hsb-update` (different versions), and stop. The file `.hyper-second-brain.json` next to the installed skills belongs to the npm tool and says nothing about the project. A `hyper-second-brain/` folder without a manifest is not a setup: step 2 handles it. Done when you know the project is new to hyper-second-brain, or the user has the offer.
2. **Plan.** Run `node <skill>/scripts/scaffold.mjs --root <project> --plan`. Its exit code says what to do:
   - 0: the plan is ready.
   - 2: a usage error; the message says what to fix.
   - 3: hyper-second-brain was already set up before this run; go back to step 1. (The same code in step 6, after step 4, is the success signal.)
   - 4: the project root itself looks like a vault. Ask the user where the vault is, then add `--vault <folder>` or `--create-vault` to every later run.
   - 5: two folders compete for a category. Ask which one is meant, then add `--map Category=Folder` to every later run.
   - any other code: an unexpected failure. Tell the user the message and stop.

   Read the plan lines: `vault` (found, or to create: the script creates it, no flag needed); `map` (which folder of the vault stands for Inbox, Projects, Areas, Resources, and Archives; `(to create)` marks a folder that will be created); `outside PARA` (folders that stay as they are, or none); `instruction file in the vault` (one line per file, or `instruction files in the vault: none`; only listed, they get no pointer line); `package` (the rules file in the project root, `project.md`, and the manifest, each marked `create` or `keep`: a file that is already there stays as it is); `entry` (what each instruction file of the project gets; `present` means the file already names `HYPER-SECOND-BRAIN.md`); `pointer line (default)`; and `git` (whether `<project>` is inside a git repository). When `pan-harness/scripts/pan-harness-check.mjs` exists, also run `node pan-harness/scripts/pan-harness-check.mjs` in `<project>` and note its error count (step 6 compares errors only; its warnings are the project's own). Done when you hold a plan that exited 0.
3. **Confirm.** Tell the user the plan in a few plain sentences: what the vault holds now (names only; or that it does not exist yet), what will be created (the vault and PARA folders that are missing, and each package file the `package` line marks `create`) and what is kept (each one it marks `keep`), which instruction file gets the pointer line, and that nothing existing is renamed or rewritten. Wait for the user's yes. On a no, ask what to change, adjust the plan, and ask again; run nothing until the user says yes. Done when the user said yes.
4. **Apply.** Start only when step 3 is done (the user said yes).
   - Read the `entry` lines of the plan: `create` (a new `AGENTS.md`, in English, so the pointer line stays in English), `block` or `list-item` (an existing file gets the line), `present` or `imports` (nothing to add).
   - For each `block` or `list-item` file, open the file and see which language its prose is written in (headings and terms in another language do not count). When that is not English, translate the pointer line as `references/pointer-translation.md` says.
   - Run `node <skill>/scripts/scaffold.mjs --root <project>` (the plan command without `--plan`; add the options from step 2 again), with `--pointer-text` for each translated line. The script puts the line between the markers `<!-- hyper-second-brain:start -->` and `<!-- hyper-second-brain:end -->` (a numbered item of "Session start" ends with `<!-- hsb -->`), so that later runs find it. The output lists what was created, which existing files got the pointer line (`changed`), what was kept, and the line written in each file.

   Done when it exits 0, `<project>/HYPER-SECOND-BRAIN.md` exists, `<project>/hyper-second-brain/` holds `project.md` and `.manifest.json`, and each pointer line is in the language of its file.
5. **Project rules.** Follow `references/project-rules.md`: read the project's rule files and fill the "Project rules" and "Decisions on conflicts" sections of `hyper-second-brain/project.md` with pointers, never copies. Done when every rule file is listed (leave out the instruction file this run created and `HYPER-SECOND-BRAIN.md`), every conflict has a decision the user gave (or an open line), both "None recorded." lines are replaced, and no line copies a rule's text.
6. **Verify.** Run the plan command again: it must now exit 3, which is the success signal here because the project is set up (ignore the message text). Check that each folder in the "Folders" table of `project.md` exists in the vault, and that each instruction file of the project root that got the pointer line holds it once (count the markers `<!-- hyper-second-brain:start -->` and `<!-- hsb -->` in the file; another mention of the file name is not a second line). When you noted an error count in step 2, run `node pan-harness/scripts/pan-harness-check.mjs` in `<project>` again: the count must be the same. Errors that were there before are the project's own; report them and go on, because the harness is not repaired here. Done when all of these pass.
7. **Report and offer.** Send the report and the offer in one message. The report: what was created, what was kept (the output lists it; a `HYPER-SECOND-BRAIN.md` that was already there stays as the user wrote it, and `hsb-doctor` compares it with the template of these skills and offers to refresh it), the PARA map, where the pointer line went, the rule conflicts with the user's decisions, the git state (the `git` line of the plan), any unfinished work of the project's own that you noticed (for example an active handoff of its harness: do not continue it), and any project rule this run could not follow or left to the user (for example a rule that asks for a commit: this skill commits nothing). When the vault was created now or holds no notes yet, offer once to get started in stages (`hsb-restart`). When the `git` line of the plan says `not a git repository`, offer `git init`: git gives the vault a way back from mistakes once the user commits; run it only on the user's yes, and commit nothing. Done when the user has the report (and the offer, when the project is not a git repository), and each yes is carried out (a no needs nothing).

## Files and when to read them

| File | Contents | When to read |
|---|---|---|
| `scripts/scaffold.mjs` | Detects the vault and the PARA folders, creates what is missing, writes `HYPER-SECOND-BRAIN.md`, `project.md`, and the manifest, adds the pointer line | Run it in steps 2, 4, and 6; do not read it: the steps give you everything you need |
| `scripts/hsb-lib.mjs` | The helpers `scaffold.mjs` uses | Never |
| `references/pointer-translation.md` | How to translate the pointer line and hand it to the script | Step 4, for an instruction file that is not in English |
| `references/project-rules.md` | How to find the project's rule files, what to record, and how to settle conflicts | Step 5 |
| `<project>/hyper-second-brain/project.md` | The project's settings and rules, written by the script | Step 5: you fill its "Project rules" and "Decisions on conflicts" sections |
| `<project>/HYPER-SECOND-BRAIN.md` | The package's rules file (the user's own, when it was already there) | Step 5, only to judge a rule that is not on the list of conflicts: its "Order of authority", "Notes and documents", "Folders and names", and "What you may do and what you ask first" sections |
| `templates/` | The templates the script fills: the rules file, `project.md`, and a minimal `AGENTS.md` | Never: the script uses them |
