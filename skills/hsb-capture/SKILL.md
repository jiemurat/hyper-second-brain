---
name: hsb-capture
description: Decides what is worth keeping in the user's second-brain vault and captures it as a short note. Use it when the user asks what is worth keeping, asks to keep the key points of an article, a book, a transcript, a video, or a podcast, wants to build or change their list of favorite problems, mentions highlights, voice memos, or notes in another app that should reach the vault, or asks what to start capturing. To save an idea or a file the user hands over as it is, use hsb-place-an-item; for a weekly review, use hsb-review; to find what the vault already holds, use hsb-find; to mark or summarize a note already in the vault, use hsb-distill.
compatibility: Requires Node.js 18 or newer.
license: MIT
metadata:
  version: "1.0.2"
  package: "@jiemurat/hyper-second-brain"
---

# hsb-capture

hyper-second-brain looks after the user's second brain: a vault of notes and documents (for example an Obsidian vault) in the folder that the Vault line of `hyper-second-brain/project.md` names (`vault/` by default).
This skill decides what is worth keeping and captures it: it answers whether an item is worth keeping, writes a short note from a source, keeps the user's list of favorite problems, and brings what the user gathered in other apps into the Inbox. The rules that hold for the whole vault are in `HYPER-SECOND-BRAIN.md`; `references/keeping.md` holds the test of what to keep and how to start small, `references/source.md` the note from a source and the findings from other apps, and `references/favorite-problems.md` the list of favorite problems. The script `scripts/hsb-find.mjs` searches the vault.

## Core rules

1. **Talk in the user's language.** Answers and questions use the user's language, and a line you write into `project.md` is in English. Notes and titles follow `HYPER-SECOND-BRAIN.md` → "Language"; a quote keeps the language of its source.
2. **The user judges.** Keep what the user hands over, asks to keep, or says moves them, without a test and without asking why. Use the test of `references/keeping.md` only when the user asks whether something is worth keeping, and when you choose the parts of a source.
3. **Write only what you read.** Build a note from text you opened or the user gave you. When you cannot open a source, ask the user for its text or their highlights, and write nothing from memory.
4. **Keep the user's words.** The user's reason for keeping something, their questions, and their ideas go into a note in their own words; add no reason they did not give.
5. **Save at once, ask little.** Before you save a note from a source or from another app, ask at most one question. A note from one source goes to its place at once with the steps of `../hsb-place-an-item/SKILL.md`; text from other apps goes to the Inbox for the weekly review (`references/source.md`).

## Steps

`<skill>` is the folder that holds this SKILL.md.
`<project>` is the folder where the agent was opened (the project root), or the folder the user names.
The script runs as `node <skill>/scripts/hsb-find.mjs search --root <project> --terms "<term>|<term>|..." --json`, with `--in <folder>` to search one folder of the vault (a path relative to the vault). Search for two to four key terms of an item to see whether the vault already holds it, or holds a note it contradicts. The search ignores letter case and the form of the apostrophe and matches a term inside words; each hit gives the path, the folder, the title, and up to two matching lines, and `secret: true` marks a file that holds a secret. Its exit codes:
- 0: done; the output lists the hits, or says that nothing matches.
- 1: `project.md` or the vault cannot be read. Tell the user and offer `hsb-doctor`.
- 2: a usage error, such as a term shorter than two characters; the message says what to fix.
- 3: hyper-second-brain is not set up here. Offer `hsb-init` and stop.

1. **Context.** Open `<project>/HYPER-SECOND-BRAIN.md`, then `<project>/hyper-second-brain/project.md`; take the vault path, the folder of each category, the instruction files, and the user's lasting choices, among them the lines "Favorite problems note:" and "Kinds of content to capture:" when they are there. When `project.md` is missing, tell the user, offer `hsb-init`, and stop. Open the note `Project List.md` in the Projects folder and the favorite problems note when they exist. Done when you hold the folder of each category, the user's projects, and the favorite problems or the fact that there are none.
2. **Know the request.** Decide the job:
   - whether something is worth keeping, or which of several items to keep: `references/keeping.md` → "Deciding what to keep";
   - the key points of an article, a book, a transcript, a video, a podcast, or a website: `references/source.md` → "A note from a source";
   - the favorite problems list: `references/favorite-problems.md`;
   - highlights, voice-memo transcripts, forwarded emails, or notes from another app: `references/source.md` → "Findings from other apps";
   - what to start capturing: `references/keeping.md` → "Starting small".

   An idea or a file that the user only hands over to save goes to `../hsb-place-an-item/SKILL.md` as it is. Done when the request has a job, or a question to the user.
3. **Do the job** as its section says. Done when the job reached the "Done when" of its section.
4. **Report.** Write in the chat, in the user's language:
   - each note you saved, with its title and folder;
   - each item you left out, with the reason in one line;
   - the reminders of other platforms for the items you saved (`../hsb-place-an-item/references/placement.md` → "Other platforms");
   - when the request was about what to keep and "Lasting choices" has no "Favorite problems note:" line, one offer to build the list;
   - at most three improvements you noticed, each tied to the request.

   Done when the user has the report.

## Files and when to read them

| File | Contents | When to read |
|---|---|---|
| `scripts/hsb-find.mjs` | Searches the vault and ranks what it finds | Run it in step 3; do not read it: the steps give you everything you need |
| `scripts/hsb-lib.mjs` | The helpers the script uses | Never |
| `references/keeping.md` | The test of what to keep, and starting small | Step 3 |
| `references/source.md` | The note from a source, sources you cannot open, and findings from other apps | Step 3 |
| `references/favorite-problems.md` | The favorite problems note: where it is, building it, changing it, using it | Step 3, for the list or when an item is weighed against it |
| `../hsb-place-an-item/SKILL.md` | The steps that place a note (the skill sits in the folder next to this skill's folder) | Step 3, to place a note; step 2, for an item only handed over |
| `../hsb-place-an-item/references/placement.md` | The rules of placing, among them the platforms other than the vault | Step 3, for an item another platform suits |
| `<project>/hyper-second-brain/project.md` | The project's settings: the folder of each category, the instruction files, the user's decisions and lasting choices | Step 1; the favorite problems and the kinds of content are recorded in it |
| `<project>/HYPER-SECOND-BRAIN.md` | The package's general rules for the vault; this skill names its sections | Step 1, and wherever a step names a section |
