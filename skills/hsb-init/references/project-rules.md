# Project rules: finding them and recording them

The agent that works in this project must follow the project's own rules and the package's rules in `HYPER-SECOND-BRAIN.md` together, with nothing copied from one into the other. `hyper-second-brain/project.md` holds the join: pointers to the project's rules and the user's decisions on conflicts.

## Contents
- Find the rule files
- Pick the rules that touch vault work
- Record them
- Settle conflicts

## Find the rule files

Rule files are the files inside the project that the agents of this project read for rules:
- `AGENTS.md` and `CLAUDE.md` in the project root, and `.claude/CLAUDE.md` and the files in `.claude/rules/` when they exist;
- the harness when there is one: the root `AGENTS.md` (listed above), the `End of task` list in `PAN-HARNESS.md`, and the playbook files under `pan-harness/` that `AGENTS.md` or `PAN-HARNESS.md` names as holding domain rules. The rest of the harness is records, not rule files: the journals (decisions, feedback, lessons, history, archive), the state, plan, and handoff files, the runbook, the system map, and the scripts;
- other agent files: `GEMINI.md`, `.cursor/rules/`, `.github/copilot-instructions.md`;
- the instruction files that `project.md` lists under "Instruction files in the vault".

These instruction files in the vault are rule files, not notes: you open them to read their rules, and no other file of the vault. The user's personal settings and memory outside the project are not project rules. Skill folders (`.claude/skills/`, `.agents/skills/`) and `.gitignore` are not rule files. Skip the pointer line that hyper-second-brain added, skip `HYPER-SECOND-BRAIN.md` (the package's own rules, which this run wrote or found), and skip an instruction file that this run created: it holds only a title, one sentence, and the pointer line. Done when you hold the list of rule files that exist.

## Pick the rules that touch vault work

Read each rule file for rules about:
- the language of chat or of written files;
- commits, pushes, and where changes are saved;
- plans, approvals, or limits on how much to do at once;
- naming, renaming, editing, or converting files;
- deleting, moving, overwriting, or sending something out;
- the style, language, or length of what you tell the user after work (answers and reports): it applies to vault work as well.

Rules about something else (code style, builds, deployment) do not touch vault work.

## Record them

For each such rule (a numbered rule, a bullet, or a checklist item; related rules may share a line) add one line under "Project rules" in `project.md`: the topic in a few words, then where the rule is, as the file path in backticks and the heading or rule number (when the file has neither, its title or the first words of the rule). Never copy the rule's text. Examples:

```
- Commits and pushes: `AGENTS.md`, section "Rules", rule R3.
- Instruction file of the vault: `vault/AGENTS.md`, no vault rules.
```

When a rule file holds nothing that touches vault work, list it with "no vault rules". The entries replace the line "- None recorded."; when the project has no rule file at all, replace it with the line "- None: the project has no rule files." hsb-doctor checks later that each backticked path exists. Done when every rule file appears in the section.

## Settle conflicts

Asking about a conflict records the user's own choice, so that no later session has to guess. A conflict is a project rule that makes a rule of `HYPER-SECOND-BRAIN.md` impossible or changes its meaning. Look for these:
- A rule that names or renames files by a scheme (every attachment, every imported file), against the rule that the agent never changes the name of a document on its own.
- A rule that edits or converts files (for example "convert every Word file to Markdown"), against the rule that the agent never edits, overwrites, or converts a document.
- A rule that forbids reading or changing the vault's notes (or certain folders), against the rules for notes in `HYPER-SECOND-BRAIN.md` (a clearer title, repaired links).
- A rule about folder names in an instruction file of the vault, against the folder names in the "Folders" table of `project.md`.

These are examples; any other rule that makes a rule of `HYPER-SECOND-BRAIN.md` impossible or changes its meaning is a conflict too. Rules about the language, tone, or length of answers, and about the language of written files, are not conflicts: they apply next to the package's rules. To judge a rule that is not on this list, read the sections "Order of authority", "Notes and documents", "Folders and names", and "What you may do and what you ask first" of `<project>/HYPER-SECOND-BRAIN.md`.

When you find conflicts, ask the user in one message, one numbered question per conflict and each in plain words: what the project rule says, what `HYPER-SECOND-BRAIN.md` says, and the choices (follow the project rule everywhere, or follow `HYPER-SECOND-BRAIN.md` for the named files or actions). Ask each conflict only once: the answer is recorded and not asked again. Record the answer under "Decisions on conflicts" in `project.md`, for example: `- Imported PDFs are renamed by the scheme of rule R7 in `AGENTS.md`.` When the user does not decide now, record `- Open: <the project rule and the rule it meets, in a few words>`; the agent reads `project.md` before any vault work and asks about an open line then. Edit no rule file. Done when every conflict has a recorded decision or an open line, and the line "- None recorded." under "Decisions on conflicts" is replaced (by the decisions, or by the line "- None found." when there is no conflict).
