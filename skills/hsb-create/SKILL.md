---
name: hsb-create
description: Turns the user's saved notes into finished work, prepares focused work on a project, and keeps a "Where I left off" note for each project. Use it when the user asks what to work on or is about to focus on a project, goes offline, ends or resumes a work session on a project, wants help producing a report, presentation, proposal, plan, or event, wants an outline of their notes before writing, keeps asking for more material when a piece should be finished, finishes or shares a piece worth reusing, or brings back feedback on their work. To see where a project stands without working on it, or when the user is stuck on a piece of work, use hsb-find; to start, shrink, or finish a project or review the list, use hsb-projects; to mark or summarize a note, use hsb-distill; to prepare a note for other readers, use hsb-share.
license: MIT
metadata:
  version: "1.0.1"
  package: "@jiemurat/hyper-second-brain"
---

# hsb-create

hyper-second-brain looks after the user's second brain: a vault of notes and documents (for example an Obsidian vault) in the folder that the Vault line of `hyper-second-brain/project.md` names (`vault/` by default).
This skill puts the vault to work: it prepares focused work on a project, helps in the user's mode (exploring or finishing), keeps a "Where I left off" note for each project, assembles a deliverable from what the vault already holds, outlines a piece of writing, and keeps the pieces and the feedback worth reusing. The rules that hold for the whole vault are in `HYPER-SECOND-BRAIN.md`; `references/focus.md` holds focused work, the two modes, and the "Where I left off" note, and `references/making.md` holds assembling a deliverable, the outline, the reusable pieces, and feedback.

## Core rules

1. **Talk in the user's language.** Reports and questions use the user's language; a note you write is in the language of the project's notes, its title too; a note that keeps what the user reported (feedback) quotes the user's words as said.
2. **Write a note only on request or yes.** An outline, a draft, a "Where I left off" entry, and a note of feedback are separate notes in the project's folder, written when the user asks for them or says yes to your offer. Change the user's own notes only with a yes (`HYPER-SECOND-BRAIN.md` → "What you may do and what you ask first").
3. **Build on what the vault holds.** Before you propose a component, an outline, or a next step, find what the vault already holds on it with the steps of `../hsb-find/SKILL.md`, and name each find by its title and folder.
4. **Move material only by the rules of placing.** Bring material into a project's folder on the user's yes, with the steps of `../hsb-place-an-item/SKILL.md`: move what serves this project alone, link to what other work still needs.
5. **Leave the work to the user.** Say what is ready and what is missing; the user decides, writes, and sends. Send nothing outside the vault.

## Steps

`<project>` is the folder where the agent was opened (the project root), or the folder the user names.

1. **Context.** Open `<project>/HYPER-SECOND-BRAIN.md`, then `<project>/hyper-second-brain/project.md`; take the vault path, the folder of each category, the instruction files, and the user's lasting choices. When `project.md` is missing, tell the user, offer `hsb-init`, and stop. Open the note `Project List.md` in the Projects folder. Done when you hold the folder of each category and the Project List, or know that there is none.
2. **Know the request.** Name the project or projects the request is about: the ones the user names, or the top of the Project List. Decide the job:
   - what to work on, focus on a project, online or offline, or the return to a project: `references/focus.md` → "Preparing focused work";
   - more material, ideas, or the finishing of a piece: `references/focus.md` → "Exploring or finishing";
   - the end of a work session: `references/focus.md` → "The Where I left off note";
   - help after the Project List review of an overwhelmed user: `references/focus.md` → "One project at a time";
   - a deliverable to produce, or what an event or a piece of work will need: `references/making.md` → "Assembling a deliverable";
   - an outline of the notes before writing: `references/making.md` → "The archipelago of ideas";
   - a finished or shared piece of work, or a piece done a second time: `references/making.md` → "Pieces worth reusing";
   - feedback the user brings back, or an early version to show: `references/making.md` → "Showing early and feedback".

   Ask the user when the project or the job is unclear. Done when the request has a project and a job, or a question to the user.
3. **Do the job.** Open the project's folder, and its "Where I left off" note first when it has one. Do the job as its section says. Done when the job reached the "Done when" of its section.
4. **Report.** Write in the chat, in the user's language:
   - what is ready and what is missing, each note named by its title and folder;
   - each note you wrote, with its title and folder;
   - the reminders of other platforms (a task with the exact name of its project, an appointment with its date, each with the note that holds it), as `../hsb-place-an-item/references/placement.md` → "Other platforms" says;
   - at most three offers, each tied to this work: bringing material into the project's folder, a "Where I left off" entry at the end of a work session, keeping a finished piece for reuse, showing an early version to one person; a review that is due comes on top of them, as `HYPER-SECOND-BRAIN.md` → "What you may do and what you ask first" says.

   Done when the user has the report.

## Files and when to read them

| File | Contents | When to read |
|---|---|---|
| `references/focus.md` | Preparing focused work, offline work, exploring or finishing, the "Where I left off" note, one project at a time, the final entry of a project that stops | Step 3, for these jobs |
| `references/making.md` | Assembling a deliverable, the archipelago of ideas, pieces worth reusing, showing early and feedback, the outline at a project's start | Step 3, for these jobs |
| `../hsb-find/SKILL.md` | The steps that find what the vault holds on a subject (the skill sits in the folder next to this skill's folder) | Step 3, before you propose components, an outline, or next steps |
| `../hsb-place-an-item/SKILL.md` | The steps that place an item and keep one item in one place | Step 3, when material moves into a project's folder |
| `../hsb-place-an-item/references/placement.md` | The rules of placing, other platforms among them | Step 4, for the reminders of other platforms |
| `<project>/hyper-second-brain/project.md` | The project's settings: the folder of each category, the user's lasting choices | Step 1 |
| `<project>/HYPER-SECOND-BRAIN.md` | The package's general rules for the vault; this skill names its sections | Step 1, and wherever a step names a section |
