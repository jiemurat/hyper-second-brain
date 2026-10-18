---
name: hsb-share
description: Prepares a copy of the user's note that other people can read, leaving out personal details, and advises when work becomes shared with others. Use it when the user wants to share a note or a folder with a colleague, a team, or a client, to make notes clear to someone who lacks their context, wants feedback on a draft they wrote for others before sending it, or starts working on a project, area, or topic together with other people. To show an early version for feedback or keep the feedback that comes back, use hsb-create; to summarize a note for the user, use hsb-distill; to place a note, use hsb-place-an-item.
license: MIT
metadata:
  version: "1.0.0"
  package: "@jiemurat/hyper-second-brain"
---

# hsb-share

hyper-second-brain looks after the user's second brain: a vault of notes and documents (for example an Obsidian vault) in the folder that the Vault line of `hyper-second-brain/project.md` names (`vault/` by default).
This skill helps the user share: it prepares a separate copy of a note for readers who lack the user's context, gives feedback on a draft the user wrote for others, and says what goes where when work becomes shared with other people. The vault is the user's own workspace: its notes stay rough and private, and sharing is a step the user takes on purpose. The rules that hold for the whole vault are in `HYPER-SECOND-BRAIN.md`; `references/sharing.md` holds preparing a note for others, feedback on a draft, and working with others.

## Core rules

1. **Talk in the user's language.** Reports and questions use the user's language, and a line you write into `project.md` is in English. The prepared note is in the readers' language: ask when it is unclear, and without an answer use the language of the original.
2. **Leave the original as it is.** Write what others will read as a new note; change the user's note only with a yes (`HYPER-SECOND-BRAIN.md` → "Notes").
3. **Keep private things private.** An area's notes are private until the user chooses what to share, item by item. Leave out of a note for others the health, finance, family, and credential details, and anything else the user would not want these readers to see; name each kind you left out in the report, and add it back only when the user asks.
4. **Send nothing.** The user sends and shares; you prepare, and you move material only on the user's yes.

## Steps

`<project>` is the folder where the agent was opened (the project root), or the folder the user names.

1. **Context.** Open `<project>/HYPER-SECOND-BRAIN.md`, then `<project>/hyper-second-brain/project.md`; take the vault path, the folder of each category, the instruction files, and the user's lasting choices, among them the lines "Team playbook:" and "Team note form:" when they are there. When `project.md` is missing, tell the user, offer `hsb-init`, and stop. Open the note `Project List.md` in the Projects folder. Done when you hold the folder of each category, the lasting choices, and the Project List, or know that there is none.
2. **Know the request.** Find the notes the request is about: the ones the user names; when the user names a subject rather than notes, find them with the steps of `../hsb-find/SKILL.md`, then come back. Decide the job:
   - a note or a folder to share, or to make clear to someone: `references/sharing.md` → "Preparing a note for others";
   - feedback on a draft the user wrote for others: `references/sharing.md` → "Feedback on a draft";
   - other people starting to work on a project, area, or topic with the user: `references/sharing.md` → "Working with others".

   Done when the request has its notes and a job, or a question to the user.
3. **Do the job** as its section says. Done when the job reached the "Done when" of its section.
4. **Report.** Write in the chat, in the user's language:
   - each note you wrote, with its title and folder, and who it is for;
   - each kind of detail you left out, without quoting it;
   - what the user does next: whom to send it to, what to put on a shared platform, under which name;
   - the questions, together at the end; a review that is due comes on top of them, as `HYPER-SECOND-BRAIN.md` → "What you may do and what you ask first" says.

   Done when the user has the report.

## Files and when to read them

| File | Contents | When to read |
|---|---|---|
| `references/sharing.md` | Preparing a note for others, feedback on a draft, working with others | Step 3 |
| `../hsb-distill/references/layers.md` | The summary that opens a note for others (the skill sits in the folder next to this skill's folder) | Step 3, when you prepare a note |
| `../hsb-find/SKILL.md` | The steps that find the notes on a subject | Step 2, when the user names a subject rather than notes |
| `../hsb-place-an-item/SKILL.md` | The steps that place a new note | Step 3, when you place the note you prepared |
| `<project>/hyper-second-brain/project.md` | The project's settings: the folder of each category, the user's lasting choices | Step 1; a team's playbook and note form are recorded in it |
| `<project>/HYPER-SECOND-BRAIN.md` | The package's general rules for the vault; this skill names its sections | Step 1, and wherever a step names a section |
