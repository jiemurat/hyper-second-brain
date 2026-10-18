---
name: hsb-doctor
description: Checks a project's hyper-second-brain setup and a few facts about its vault, and repairs the package's own files. Use it when the user asks to check, audit, or repair the second brain, when `HYPER-SECOND-BRAIN.md`, a pointer line, or a PARA folder went missing or broke, when the user asks whether the vault has a way back from mistakes, and for periodic upkeep.
compatibility: Requires Node.js 18 or newer.
license: MIT
metadata:
  version: "1.0.0"
  package: "@jiemurat/hyper-second-brain"
---

# hsb-doctor

hyper-second-brain looks after the user's second brain: a vault of notes and documents (for example an Obsidian vault) in the folder that the Vault line of `hyper-second-brain/project.md` names (`vault/` by default).
This skill checks two things: whether the setup in the project is intact (`HYPER-SECOND-BRAIN.md` in the project root, the pointer line in the agent's instruction files, `project.md`, the folder map), and a few facts about the vault (file counts by type, the Inbox size, whether git gives the vault a way back from mistakes). It repairs the package's own files and reports everything else.

## Core rules

1. **Talk in the user's language, write in English.** Reports to the user use the user's language. Every file the skill writes is in English. The one exception is the pointer line in an instruction file that is not in English: `--fix` writes the line that the manifest records for that file (the translation made at setup), or the English line when the manifest records none.
2. **Read names, counts, and dates only.** Never open a note or a document in the vault, and never quote one. The instruction files that `project.md` lists are rule files, not notes: step 4 may open them. The check script prints no text of the user's files.
3. **Repair only the package's own files.** Those are a missing `HYPER-SECOND-BRAIN.md`, the pointer line, and the folders of the map. Offer what the findings suggest (`git init`, a converter); the user decides.
4. **Change the project's own files only with the user's yes, apart from the repairs of step 3.** `HYPER-SECOND-BRAIN.md` and `project.md` belong to the project: change a `HYPER-SECOND-BRAIN.md` that exists only on the user's yes (add back a missing section, or refresh the file from the template, step 4), and edit the "Project rules" section of `project.md` only on the user's yes (step 4).
5. **Repeat nothing the project already has.** The project's own rules stay as they are; `HYPER-SECOND-BRAIN.md` → "Order of authority" says which rule wins.

## Steps

`<skill>` is the folder that holds this SKILL.md.
`<project>` is the folder where the agent was opened (the project root), or the folder the user names.

1. **Situation.** Run `node <skill>/scripts/hsb-check.mjs --root <project> --json`. Its exit code says what to do:
   - 0: no `fail` finding.
   - 1: at least one `fail` finding is left.
   - 2: a usage error; the message says what to fix.
   - 3: hyper-second-brain is not set up here. Offer `hsb-init` and stop.
   - 4: the project is older than these skills. Offer `hsb-update` and stop.
   - any other code: an unexpected failure. Tell the user the message and stop.

   Done when the script exited 0 or 1 and you hold its findings.
2. **Read the findings.** Use `references/audit.md` to understand each finding id and what to tell the user. Done when every `fail` and `warn` id of the output is matched to its row in `references/audit.md`.
3. **Repair.** When a `fail` carries a `fixable` value, run the same command with `--fix` (keep `--json`): it writes a missing `HYPER-SECOND-BRAIN.md` from the template, adds a missing pointer line, and creates a mapped PARA folder that is missing. Its output already shows the findings after the repair, so no rerun is needed; `fixed` lists what changed. It never replaces a `HYPER-SECOND-BRAIN.md` that exists. Done when the last output shows no `fail` with a `fixable` value; every other `fail` goes to step 4.
4. **What needs the user.** Say what is wrong and what the choices are for: a missing `project.md`, a missing vault, a broken path in "Project rules", a failing harness check, and a `HYPER-SECOND-BRAIN.md` that the `rules-file` finding names: one that lacks a section (on the user's yes follow `references/audit.md` → "Adding back a missing section"), and one that names a skill that is not installed or differs from the template of these skills (on the user's yes follow `references/audit.md` → "Refreshing the rules file"). When the `project-rules` finding says that rule files (the project's instruction files; `references/project-rules.md` lists them) hold rules but `project.md` records none, offer to record them; on a yes follow `references/project-rules.md`. When step 4 changed something, run the step 1 command once more and use its counts in the report. Done when each is either repaired or put to the user as a question with its choices.
5. **Report.** Tell the user in a few plain sentences: the counts of the last output (ok, fail, warn, info), what you repaired, and what needs them. Then list the offers from the findings (`git init`, a converter; `hsb-re-organize` when a `top-level` finding or the user's words show a vault that has drifted from PARA) and the unrecorded project rules, each as a short question to the user, never as work you already did. Done when the user has the report and the offers.

## Files and when to read them

| File | Contents | When to read |
|---|---|---|
| `scripts/hsb-check.mjs` | The check and the repair | Run it in steps 1, 3, and 4; do not read it: the steps give you everything you need |
| `scripts/hsb-lib.mjs` | The helpers the script uses | Never |
| `references/audit.md` | Every finding id: meaning, level, and what to tell or offer | Step 2 |
| `references/project-rules.md` | How to find the project's rule files, what to record, and how to settle conflicts | Step 4, after the user said yes to recording the rules |
| `<project>/hyper-second-brain/project.md` | The project's settings and rules | Step 4: when you record the rules (its "Project rules" and "Decisions on conflicts" sections), and when a section you add back or the file you refresh holds `{{vault}}` (its Vault line) |
| `<project>/HYPER-SECOND-BRAIN.md` | The project's rules file | Step 4, when a section of it has to be added back or the file refreshed, and its "Order of authority" when a project rule meets a rule of this skill |
| `templates/` | The templates the repair uses: the rules file and a minimal instruction file | Step 4, when a section of `HYPER-SECOND-BRAIN.md` has to be added back or the file refreshed; otherwise never: the script uses them |
