---
name: hsb-connect
description: Gives the notes of the user's second-brain vault tags, links to related notes, and maps of content, in their properties, without changing their text. Use it when the user asks to tag the notes or clean up their tags, to link notes to their parent or to related notes, to make maps of content or index notes for sections, to make the vault faster to navigate for people and agents, or to check and refresh the tags and links after notes were added or moved. To find notes on a subject, use hsb-find; to move notes into folders, use hsb-place-an-item or hsb-re-organize; to mark the main points inside a note, use hsb-distill.
compatibility: Requires Node.js 18 or newer.
license: MIT
metadata:
  version: "1.0.1"
  package: "@jiemurat/hyper-second-brain"
---

# hsb-connect

hyper-second-brain looks after the user's second brain: a vault of notes and documents (for example an Obsidian vault) in the folder that the Vault line of `hyper-second-brain/project.md` names (`vault/` by default).
This skill gives every note three things a person and an agent can use without reading the note: what it is (one `type/` tag), what it belongs to and is about (more tags), and where it sits in the vault's map (the link properties `up`, `related`, `source`, and maps of content, MOCs). Each run reviews the whole vault and fills the gaps it finds. The rules that hold for the whole vault are in `HYPER-SECOND-BRAIN.md`; the vault's own standard is `<project>/hyper-second-brain/tags.md`; `references/standard.md` holds how to build and follow it; `references/pitfalls.md` holds what goes wrong in a real vault. The script `scripts/connect.mjs` does the mechanical work: measuring, writing properties, writing MOCs, checking, taking a batch back.

## Core rules

1. **Talk in the user's language.** Reports and questions use the user's language; MOCs, aliases, and the meanings in `tags.md` use the vault's language; a line you write into `project.md` is in English.
2. **The text stays byte for byte.** Tags and links go into the properties, written by the script, which refuses any note whose text after the properties would change. The text changes only in a MOC, in the "Entry points" of an `_about.md`, and in a query the user said yes to.
3. **One standard, written before the first note changes.** Every tag, prefix, and link property stands in `tags.md` with its meaning before a note uses it. When a note needs one the standard lacks, add it to the table with a one-line meaning, use it, and name it in the report.
4. **Keep what the user has.** Map every existing tag to the standard under "Old tags" and drop none; keep the user's existing link properties and their values.
5. **The user decides, you find the facts.** Measure the vault yourself; ask the user only for decisions: the design of the standard on the first run, the documents, each plan before it is applied.
6. **Small steps with a way back.** A pilot on one folder first, then batches; offer a commit after each batch, and commit only on the user's yes.

## Steps

`<skill>` is the folder that holds this SKILL.md.
`<project>` is the folder where the agent was opened (the project root), or the folder the user names.
Every command runs as `node <skill>/scripts/connect.mjs <command> --root <project>`; add `--json` when you read the output yourself. The exit codes of every command:
- 0: done; for `check`, no fail.
- 1: needs attention: `apply` or `moc` refused a file and wrote nothing (the output names each file and the reason), `check` found a fail, or the setup is incomplete (the message says what to fix, usually with `hsb-doctor`).
- 2: a usage error; the message says what to fix.
- 3: hyper-second-brain is not set up here. Offer `hsb-init` and stop.
- 4: the project is older than these skills. Offer `hsb-update` and stop.
- 5: `tags.md` is missing or has errors (the output lists them). Fix the file and run the command again.
- 6: no way back from a mistake; nothing changed. Ask the user to commit the vault, or to confirm a backup and run again with `--backup-confirmed`.

1. **Context.** Open `<project>/HYPER-SECOND-BRAIN.md`, then `<project>/hyper-second-brain/project.md`; take the vault path, the folder of each category, the instruction files, and the lasting choices. Open `<project>/hyper-second-brain/tags.md` when it exists: then this is a **rerun**; without it, a **first run**. Read `references/standard.md` and `references/pitfalls.md`. Done when you know which kind of run this is and hold the folders and the lasting choices.
2. **Measure.** Run `measure --json`; it changes nothing. It gives the Obsidian vault root and link settings, the plugins and templates folders, the notes per top folder with and without properties, every tag in properties and inline with its count, the property keys, what depends on tags or paths (`.base` filters, Dataview queries, canvases, inline link fields), the names that repeat, the notes it leaves out and why, the notes whose properties it cannot read, the size in tokens, the way back, the work folder, and an unfinished earlier run. Go through `references/pitfalls.md` → "Before the pilot" with these facts. When an unfinished run is there, ask the user whether to keep its batches (`finish`) or take them back (`undo`, once per batch) before you go on. Done when every item of "Before the pilot" has its answer from the facts or a question for the user.
3. **Agree on the standard** (first run only; on a rerun go to step 4). Ask the questions of `references/standard.md` → "The first run" in rounds, each with your recommendation, built on the facts of step 2. Write `tags.md` from `templates/tags.md` with the user's answers: the prefixes, every tag with its meaning, every existing tag mapped under "Old tags", the link properties, the settings. Add the line `- Tags and links: by hyper-second-brain/tags.md` under "Lasting choices" in `project.md`, as `HYPER-SECOND-BRAIN.md` → "What you may do and what you ask first" says. Run `check`: exit code 5 means the file has errors to fix. Done when `check` exits 0 or 1 and the user agreed to the standard.
4. **Plan.** On a first run, plan the pilot: one small folder, then one batch per top folder. On a rerun, run `check --list --json`: its fails are the gaps, and the plan fills them all in one batch. For each note of the batch, and on a rerun each note a fail names, read its card (`cards --scope <folder> --json`; `--missing` lists only the notes without a type tag or `up`; `--from` gives the next 50), and open the note only when the card does not settle what it is. Decide its tags and links as `references/standard.md` → "Tags" and "Links" say, and the MOCs as "Maps of content" says. Write the changes for `apply` and the specs for `moc` as JSON files in the work folder `measure` named (create it when it does not exist yet); the forms are under "The files for the script" in `references/standard.md`. Run `moc --spec <file> --dry-run` and `apply --changes <file> --spec <file> --dry-run` until both exit 0; a dry run counts the new MOCs and the missing `_about.md` files as there, and names the ones it links to. Done when both dry runs exit 0 and every note of the batch is in the changes or has a reason to wait.
5. **Agree on the plan.** Tell the user, per folder, how many notes get which tags and links, the MOCs to create or extend with their groups, the tags and prefixes added to the standard with their meanings, and the queries, filters, or templates that would need a change, each as a question. Done when the user said yes to the plan, or named what to change (then back to step 4).
6. **Apply.** First write the `_about.md` files the batch needs (`references/folder-about.md`): create the missing ones the dry run named, and add each new MOC to the "Entry points" of its folder's file, and to the home page when the standard names one. Then run `moc --spec <file>`, then `apply --changes <file> --spec <file>`. Change the queries and templates the user said yes to. Run `check --scope <folder>` for the batch (with `--base <commit>` when the vault was committed before the run: the commit `git rev-parse HEAD` gave before the first batch) and fix what it lists. After the pilot of a first run, ask the user to open the folder in Obsidian (the properties, Backlinks, the graph) and change the standard before the batches, not after. Offer a commit. Done when `check --scope` shows no fail for the batch and the user has the offer of a commit; then the next batch goes back to step 4.
7. **Check the whole vault.** Run `check --list` (with `--base <commit>` when there is one); every fail is fixed or named in the report with its reason. Look at the `warn` and `info` lines: a prefix over its soft limit (`over-limit`) and the tags only one note carries (`tag-once`) are candidates to merge; propose the merges to the user. Then run the check of `hsb-doctor` (`node <skill>/../hsb-doctor/scripts/hsb-check.mjs --root <project>`). Open ten random notes and three MOCs (all of them in a smaller vault) and grade the result yourself on the scale of `references/standard.md` → "The grade". Done when `check` exits 0 or each remaining fail is in the report, and you have the grade.
8. **Report.** Tell the user in the chat: the counts per folder (notes tagged, links added, MOCs created or extended), the tags, prefixes, and link properties added to the standard, the notes left out and why, the places where you classified by headings or keywords rather than by reading, the proposed merges, the fails left, the grade with one line on what keeps it from the next level, and that `undo` takes the last batch back. Run `undo` when the user asks for it, and `finish` when the user says the result is fine: it removes the work folder, and `undo` can take nothing back after it. Done when the user has the report.

## Files and when to read them

| File | Contents | When to read |
|---|---|---|
| `scripts/connect.mjs` | Measuring, cards, writing properties and MOCs, the check, undo | Run it in the steps; the steps give you everything you need |
| `scripts/hsb-lib.mjs` | The helpers the script uses | Never |
| `references/standard.md` | The first run's questions, tags, links, maps of content, the files for the script, the grade | Steps 1, 3, 4, and 7 |
| `references/pitfalls.md` | What goes wrong in a real vault: Obsidian, templates and plugins, content, the process | Steps 1 and 2 |
| `references/folder-about.md` | The `_about.md` note of a folder: what goes in it, how to update it | Step 6 |
| `templates/tags.md` | The form of the standard | Step 3 |
| `<project>/hyper-second-brain/tags.md` | The vault's standard: prefixes, tags, old tags, link properties, settings | Step 1; steps 3 and 4 add to it |
| `<project>/hyper-second-brain/project.md` | The project's settings: the folder of each category, the lasting choices | Step 1; step 3 writes the lasting choice |
| `<project>/HYPER-SECOND-BRAIN.md` | The package's general rules for the vault; this skill names its sections | Step 1, and wherever a step names a section |
