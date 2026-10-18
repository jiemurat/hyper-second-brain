---
name: hsb-update
description: Updates hyper-second-brain in a project to the newest version, then runs a full hsb-doctor. Use when a new version of the package is out or the user asks to update the second brain.
compatibility: Requires Node.js 18 or newer and npm.
license: MIT
metadata:
  version: "1.0.0"
  package: "@jiemurat/hyper-second-brain"
---

# hsb-update

hyper-second-brain looks after the user's second brain: a vault of notes and documents (for example an Obsidian vault) in the folder that the Vault line of `hyper-second-brain/project.md` names (`vault/` by default).
When a new version of the package comes out, two things must follow it: the skills in the project, and the pointer line in the agent's instruction files. This skill updates the skills, runs the migration steps of the new versions, refreshes what the package owns, and ends with a full `hsb-doctor`.

## Core rules

1. **Talk in the user's language, write in English.** Reports to the user use the user's language. Every file the skill writes is in English. The one exception is the pointer line in an instruction file that is not in English: it stays in the language of that file (step 4).
2. **Updating the package and migrating the project are one job.** Every run ends with a full `hsb-doctor`.
3. **Replace only what the package owns.** Those are the skill files, the wording of the pointer line, and the manifest (the script writes the new version and the recorded translations into it). Leave `HYPER-SECOND-BRAIN.md`, `project.md`, the user's notes and documents, and the project's own rules as they are. Only a migration step may change `HYPER-SECOND-BRAIN.md` or `project.md`, and only in the way its text says; the full `hsb-doctor` of step 5 offers to refresh a `HYPER-SECOND-BRAIN.md` that an older version wrote, and changes it only on the user's yes.
4. **Ask before any structural step.** Show the step as a short plan and wait for the user's yes.
5. **Show the plan, then apply.** Tell the user the plan in plain words and wait for the user's yes before step 4: the project's own rules may ask for approval, and the user decides.
6. **Leave pan-harness to its own `ph-update`.** If the project has a harness (`PAN-HARNESS.md` or a `pan-harness/` folder in the project root), this skill does not update it.

## Steps

`<skill>` is the folder that holds this SKILL.md.
`<project>` is the folder where the agent was opened (the project root), or the folder the user names.

1. **Versions.** Find three versions: the installed skills (`version` in `.agents/skills/.hyper-second-brain.json` or `.claude/skills/.hyper-second-brain.json` under `<project>`), the newest on npm (`npm view @jiemurat/hyper-second-brain version`; when the machine is offline or the package is not on npm the command fails: say in the plan you tell the user (step 3) that the newest version is unknown, and go on), and the project (`version` in `<project>/hyper-second-brain/.manifest.json`). When the project has no manifest, offer `hsb-init` and stop. Done when you hold three values: the version of the installed skills, the newest version on npm or `unknown`, and the version of the project.
2. **Update the skills.** When npm reports a version newer than the installed skills, run `npx @jiemurat/hyper-second-brain@latest update` in `<project>`; when the newest version is unknown or not newer, skip this step. Exit 3 means skill files were changed by hand: show the user the listed files and, on a yes, run it again with `--yes`. Done when the installed skills carry the newest known version.
3. **Plan and confirm.** Run `node <skill>/scripts/update.mjs --root <project> --plan --json`. Its exit code:
   - 0: the plan is ready (or there is nothing to update).
   - 1: the manifest is unreadable or a migration step failed; the message says which.
   - 2: a usage error; the message says what to fix.
   - 3: hyper-second-brain is not set up here. Offer `hsb-init` and stop.
   - 4: the project is newer than the skills. Go back to step 2.
   - any other code: an unexpected failure. Tell the user the message and stop.

   Read from the plan: the migration steps (each `mechanical`, `structural`, or `by hand`; their text is in `references/changelog.md`) and which instruction files get a new pointer wording. A pointer line that was translated is left as it is; the plan marks it `translate` when the English wording it came from has changed. Tell the user the plan in plain words and wait for the user's yes. Done when the user said yes.
4. **Apply.** Prepare what the plan asks of you, then apply once the user said yes (step 3):
   - A file marked `translate`: translate the new English wording as `references/pointer-translation.md` says.
   - Run `node <skill>/scripts/update.mjs --root <project> --json`, with `--pointer-text` for each translated line.
   - Each `by hand` step the new versions list in `references/changelog.md`: do it.
   - Each `structural` step: do it as a short plan and wait for the user's yes.

   Done when the script exited 0, no file is marked `translate`, and every `by hand` and `structural` step is done or declined by the user.
5. **Full hsb-doctor.** Run the `hsb-doctor` skill: every step, including its repair and its offers. When you cannot load it by name, read `<project>/.claude/skills/hsb-doctor/SKILL.md` (or `.agents/skills/hsb-doctor/SKILL.md`) and follow it. Done when it reports no `fail`, or every remaining `fail` has a decision from the user.
6. **Report.** Tell the user in plain sentences: the versions (old and new), what changed in the project, the steps that wait for the user, any project rule this run could not follow and why, and the doctor's counts. Done when the user has the report.

An agent reads skill text and instruction files when a session starts. When this run replaced the skills or changed an instruction file, tell the user to start the next task in a new session.

## Files and when to read them

| File | Contents | When to read |
|---|---|---|
| `scripts/update.mjs` | Migrates the project to the version of these skills | Run it in steps 3 and 4; do not read it: the steps give you everything you need |
| `scripts/hsb-lib.mjs`, `scripts/migrations.mjs` | The helpers and the migration steps `update.mjs` runs | Never |
| `references/changelog.md` | The versions and their migration steps, each marked `mechanical`, `structural`, or `by hand` | Steps 3 and 4 |
| `references/pointer-translation.md` | How to translate the pointer line and hand it to the script | Step 4, for a file marked `translate` |
