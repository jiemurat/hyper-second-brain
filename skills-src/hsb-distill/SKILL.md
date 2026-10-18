---
name: hsb-distill
description: Marks the main points of the user's notes in layers, so that the gist of each shows at a glance, and summarizes a note. Use it when the user asks to distill, condense, or shorten notes, to bold or highlight their main points or key ideas, to summarize a note or give its gist (also a note named by its subject), to mark the decisions and action items in meeting notes, or to prepare notes for learning a subject or for a piece of work. To find where notes on a subject are or what the vault holds, use hsb-find; to keep the key points of a new article or book, use hsb-capture; to place a note, use hsb-place-an-item; to assemble notes into a draft or a deliverable, use hsb-create; to prepare a note for other readers, use hsb-share.
license: MIT
metadata:
  version: "{{version}}"
  package: "@jiemurat/hyper-second-brain"
---

# hsb-distill

<!-- include: skill-parts/intro.md -->
This skill makes notes quick to use: it marks their main points in layers, marks the decisions and action items of meeting notes, gathers passages for learning, and summarizes a note. The rules that hold for the whole vault are in `HYPER-SECOND-BRAIN.md`; `references/layers.md` holds the layers, the marking convention, meeting notes, learning, and the summary.

## Core rules

1. **Talk in the user's language.** Reports and questions use the user's language, and a line you write into `project.md` is in English. A summary written into a note is in the note's language.
2. **Leave the text as written.** Add marks around the existing words, and a summary only as rule 3 allows; change, reorder, move, or delete no word, so that removing the marks gives back the note exactly as it was.
3. **Distill what the user asks for.** A request to distill or mark named notes is the user's yes to add layers 2 and 3 to them. A request to summarize a note gets the summary in the chat and an offer to add it to the note; write it into the note only when the user asks for that or says yes.
4. **Keep each layer small.** Each layer holds about a fifth of the layer before it at most: marking everything marks nothing.

## Steps

<!-- include: skill-parts/project-dir.md -->

1. **Context.** Open `<project>/HYPER-SECOND-BRAIN.md`, then `<project>/hyper-second-brain/project.md`; take the vault path, the folder of each category, the instruction files, and the user's lasting choices, among them the lines "Marking:" and "Favorite problems note:" when they are there. When `project.md` is missing, tell the user, offer `hsb-init`, and stop. Open the note `Project List.md` in the Projects folder, and the favorite problems note when there is one. Done when you hold the folder of each category, the user's projects, and the marking convention or the fact that none is recorded.
2. **Know the request.** Find the notes: the ones the user names; when the user names a subject rather than notes, find them with the steps of `../hsb-find/SKILL.md`, then come back. Decide the job:
   - distill or mark notes: `references/layers.md` → "Distilling a note", and "Meeting notes" for notes of a meeting;
   - summarize a note, or add a summary to it: `references/layers.md` → "The summary";
   - prepare notes for learning a subject: `references/layers.md` → "Learning".

   Done when each note has a job, or the user has a question about which notes.
3. **Do the job** as its section says, one note at a time. Done when each note reached the "Done when" of its section.
4. **Report.** Write in the chat, in the user's language:
   - each note you worked on, with its title and folder, and what you added: how many passages in bold, how many highlighted, a summary;
   - the summary itself when the user asked for one, and the offer to add it to the note;
   - the action items of meeting notes as tasks for the user's to-do list, each with its project or area;
   - at most three improvements you noticed, each tied to the request.

   Done when the user has the report.

## Files and when to read them

| File | Contents | When to read |
|---|---|---|
| `references/layers.md` | The marking convention, the layers, meeting notes, learning, the summary | Step 3 |
| `../hsb-find/SKILL.md` | The steps that find notes on a subject (the skill sits in the folder next to this skill's folder) | Step 2, when the user names a subject rather than notes |
| `../hsb-capture/references/keeping.md` | The questions that decide what is worth keeping | Step 3, to choose the main points |
| `<project>/hyper-second-brain/project.md` | The project's settings: the folder of each category, the user's lasting choices | Step 1; the marking convention is recorded in it |
| `<project>/HYPER-SECOND-BRAIN.md` | The package's general rules for the vault; this skill names its sections | Step 1, and wherever a step names a section |
