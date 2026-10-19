---
name: hsb-find
description: Finds what the user's second-brain vault holds on a subject and says where it sits, and prepares the user for a meeting or for work that is stuck. Use it when the user asks where a note or file is or what they saved on something, where a project stands, for past work and evidence (a résumé, a promotion, a pitch), for connections or patterns in their material, to prepare a meeting or a decision, or says they are stuck on a piece of work. To decide where a new item goes, use hsb-place-an-item; to review the Project List, use hsb-projects; for the themes of a month, use hsb-review; to judge whether something is worth keeping, use hsb-capture; to mark or summarize a note, use hsb-distill; to pick up or work on a project, or assemble a deliverable, use hsb-create.
compatibility: Requires Node.js 18 or newer.
license: MIT
metadata:
  version: "1.0.1"
  package: "@jiemurat/hyper-second-brain"
---

# hsb-find

hyper-second-brain looks after the user's second brain: a vault of notes and documents (for example an Obsidian vault) in the folder that the Vault line of `hyper-second-brain/project.md` names (`vault/` by default).
This skill finds what the vault holds and says where it sits: it answers questions about saved material, gathers past work and evidence, states where a project stands, offers connections and patterns, prepares the user for a meeting or a decision, and lists the material toward work that is stuck. The rules that hold for the whole vault are in `HYPER-SECOND-BRAIN.md`; `references/finding.md` holds the ways to find and to answer, `references/meeting.md` the preparation for a meeting, and `references/stuck.md` the help with stuck work. The script `scripts/hsb-find.mjs` searches the vault.

## Core rules

1. **Talk in the user's language.** Answers and questions use the user's language; a quote keeps the language of its note.
2. **Answer from the vault, with the place.** Name each note or file by its title and folder, quote the lines that answer instead of retelling them, and say plainly when the vault holds nothing on the subject.
3. **Quote no secret.** When a note holds a password, a PIN, an access key, or a card number, name the note and its folder, quote nothing from it, and suggest an encrypted password manager (`HYPER-SECOND-BRAIN.md` → "Data and secrets").
4. **Leave the vault as it is.** Finding only reads: move, rename, and edit nothing, and write a note only when the user asks for one. The outcome of a meeting that the user reports goes to `hsb-place-an-item` (`references/meeting.md` → "After the meeting"). Offer what you notice as `HYPER-SECOND-BRAIN.md` → "What you may do and what you ask first" says.
5. **Give what the request reaches for.** A request to find something gets what the vault holds, and a request for ideas or links gets connections; a draft is `hsb-create`'s, written only when the user asks for one.

## Steps

`<skill>` is the folder that holds this SKILL.md.
`<project>` is the folder where the agent was opened (the project root), or the folder the user names.
The script runs as `node <skill>/scripts/hsb-find.mjs search --root <project> --terms "<term>|<term>|..." --json`, with `--in <folder>` to search one folder of the vault (a path relative to the vault) and `--limit N` for more than 20 hits. It ignores letter case and the form of the apostrophe, matches a term inside words too (a stem such as `velosip` finds its forms), reads the text, the title, and the file name of every Markdown file and the name of every other file (a Word, Excel, or PDF file is found by its name only), leaves out hidden folders and the `_about.md` files, and ranks the hits by how much they match, never by age. Each hit gives the path, the folder, the category, the title, the kind, the day the file last changed and its age in days, the terms it matches, and up to two matching lines (none when only the title or the file name matches); `secret: true` marks a file that holds a secret; a line that looks like one shows its label only, and a card number is masked. Its exit codes:
- 0: done; the output lists the hits, or says that nothing matches.
- 1: `project.md` or the vault cannot be read. Tell the user and offer `hsb-doctor`.
- 2: a usage error, such as a term shorter than two characters or an `--in` folder outside the vault; the message says what to fix.
- 3: hyper-second-brain is not set up here. Offer `hsb-init` and stop.

1. **Context.** Open `<project>/HYPER-SECOND-BRAIN.md`, then `<project>/hyper-second-brain/project.md`; take the vault path, the folder of each category, the instruction files, and the user's lasting choices. When `project.md` is missing, tell the user, offer `hsb-init`, and stop. When the request is about a project, open the note `Project List.md` in the Projects folder. Done when you hold the folder of each category, and the Project List when the request is about a project.
2. **Know the request.** Decide the job: find (a question about saved material, a note or file to locate, past work and evidence, where a project stands, connections or patterns), prepare a meeting or a decision, or help with stuck work. Ask the user when the subject is unclear. Done when the request has a job, or a question to the user.
3. **Do the job.** Find as `references/finding.md` says, prepare a meeting as `references/meeting.md` says, and help with stuck work as `references/stuck.md` says. Done when the job reached the "Done when" of its section in the reference.
4. **Answer.** Write the answer in the chat, in the user's language:
   - each find with its title and folder, the lines that answer it as quotes, and its age when the age matters;
   - what the vault does not hold, said plainly;
   - at most three improvements you noticed, each tied to the request.

   Done when the user has the answer.

## Files and when to read them

| File | Contents | When to read |
|---|---|---|
| `scripts/hsb-find.mjs` | Searches the vault and ranks what it finds | Run it in step 3; do not read it: the steps give you everything you need |
| `scripts/hsb-lib.mjs` | The helpers the script uses | Never |
| `references/finding.md` | The four ways to find, ranking and age, past work and evidence, where a project stands, connections and patterns | Step 3 |
| `references/meeting.md` | Preparing for a meeting or a decision | Step 3, for a meeting |
| `references/stuck.md` | The material toward work that is stuck | Step 3, for stuck work |
| `../hsb-place-an-item/SKILL.md` | The steps that save the outcome of a meeting (the skill sits in the folder next to this skill's folder) | When the user reports the outcome of a meeting |
| `<project>/hyper-second-brain/project.md` | The project's settings: the folder of each category, the instruction files, the user's decisions and lasting choices | Step 1 |
| `<project>/HYPER-SECOND-BRAIN.md` | The package's general rules for the vault; this skill names its sections | Step 1, and wherever a step names a section |
