# hsb-check findings

Each finding has an id, a level (`ok`, `fail`, `warn`, `info`), and a message. This table says what each id means and what to tell or offer the user. Level `fail` is a defect of the setup, `warn` is something the user may want to act on, `info` is a fact. The text output lists the findings that are not `ok`; `--json` lists the `ok` ones too. A finding that only reports a problem (such as `readers`) is absent when there is none.

## Contents
- Setup findings
- Adding back a missing section
- Refreshing the rules file
- Vault findings

## Setup findings

| Id | Meaning | What to do |
|---|---|---|
| `manifest` | The manifest in the project's `hyper-second-brain/` folder is readable | Nothing |
| `version` | The project is newer than these skills | Tell the user to update the skills: `npx @jiemurat/hyper-second-brain@latest update` |
| `rules-file` | `HYPER-SECOND-BRAIN.md` in the project root: `fail` when it is missing; `warn` when it lacks one of its sections (Where things are, Order of authority, Notes and documents, Categories, Principles, Folder about files, Folders and names, What you may do and what you ask first, Links, Language, Data and secrets, Project List), names a skill that is not installed (a skill an older version had), or differs from the template of these skills while the manifest does not tie it to that template (`data.template`: `older` when it came from an older template, `unknown` when the manifest records none, as for a file that was there before `hsb-init`); `ok` otherwise: the user's own edits of a file from this template are fine. The message gives names and counts, never the file's text | Missing: `--fix` writes it from the template. The file is the project's: `--fix` never replaces it, and you change it only on the user's yes. Lacking sections: tell the user which, and on a yes follow "Adding back a missing section" below. A skill that is not installed, or a file that differs from the template: tell the user, and on a yes follow "Refreshing the rules file" below |
| `project.md` | The project settings file is missing or lacks the Vault line or a folder row | Ask the user; the script does not repair this |
| `vault` | The vault folder named in `project.md` does not exist | Ask the user where the vault is |
| `folders` | Every folder of the map exists | Nothing |
| `folder:<Category>` | A folder of the map does not exist (an empty PARA folder that git did not keep, or a rename) | `--fix` creates it empty. When the user renamed it, update the table in `project.md` instead |
| `naming` | Some folders are named differently from the package's defaults; the message lists each one | Nothing: do not offer a rename; folders are renamed only when the user asks |
| `top-level` | The vault has top-level folders that `project.md` does not list | Ask whether they belong under "Other top-level folders", then add them. When the vault looks disordered to the user, or the folders hold material that belongs in the PARA folders, offer `hsb-re-organize` as a question |
| `pointer` | Every instruction file the agent reads leads to `HYPER-SECOND-BRAIN.md` | Nothing |
| `pointer:<file>` | An instruction file the agent reads has no pointer line to `HYPER-SECOND-BRAIN.md` | `--fix` adds it: in the recorded translation when the manifest has one, else in English |
| `pointer-wording:<file>` | The pointer line in an instruction file was translated from an older English wording | Info only: `hsb-update` asks for a new translation |
| `pointer-twice:<file>` | The pointer block appears more than once | Remove the extra block by hand after showing the user |
| `project-rules` | `fail`: a path in "Project rules" does not exist. `info`: the project has rule files and "Project rules" records none. `ok`: the paths exist | Broken path: show it and ask whether the file moved (fix the path) or the rule is gone (remove the line). Not recorded: offer to record them, and on a yes follow `references/project-rules.md` |
| `harness` | The project's own pan-harness check reports errors | Report them; the harness is not this package's to repair |
| `skills` | Whether the hsb-* skills are installed in the project | Info only |

## Adding back a missing section

On the user's yes, take the sections the `rules-file` finding names in the order of the template, and for each:
1. Copy the section from `templates/HYPER-SECOND-BRAIN.md.tmpl`, from its heading up to the next heading, exactly as it is there.
2. Replace `{{vault}}` in it with the vault path: the Vault line of `project.md` without its trailing slash (`vault/` gives `vault`).
3. Insert it right after the end of the section that comes before it in the template, so that the user's own lines stay in the section they were in.

Done when the `rules-file` finding of a new check run names no missing section and every line the user wrote is still in the file.

## Refreshing the rules file

1. Read `<project>/HYPER-SECOND-BRAIN.md` and `templates/HYPER-SECOND-BRAIN.md.tmpl`, with `{{vault}}` read as the vault path: the Vault line of `project.md` without its trailing slash (`vault/` gives `vault`), and compare them section by section.
2. Show the user, in the user's language: what each section of the template changes or adds, in a few words; each line of the file that is not in the template (the user's own lines, or the wording of an older version); and each skill the file names that is not installed. When `data.template` of the finding is `unknown` (the manifest records no template), a line that is not in the template may be the user's own or an older wording: show each such line next to the template's text at that place and ask, line by line, whether to keep it. Ask whether to take the new text with the user's own lines carried over, or to keep the file as it is.
3. On "take": write the template's text with the vault path in place of `{{vault}}`, then put each line the user wants to keep back into the section it was in. The lines of an older version go, a line that names a skill that is not installed included: the template's wording replaces them.
4. On "take" and on "keep": run `node <skill>/scripts/hsb-check.mjs --root <project> --record-rules --json`. It records in the manifest that the file was checked against the template of these skills, so that the finding stops; a later version with another template brings it back.

Done when the `rules-file` finding of that run is `ok`, or names only what the user chose to keep, and every line the user wanted is in the file.

## Vault findings

| Id | Meaning | What to offer |
|---|---|---|
| `file-types` | Count of files by type | Mention the total and the main types |
| `readers` | Word, Excel, or PDF files exist and no converter is on the PATH | Tell the user that the agent may not be able to read their text, and ask whether they want to install a converter (pandoc or LibreOffice for Word and Excel, poppler for PDF); the user installs it |
| `inbox` | The number of files in the Inbox, its `_about.md` not counted | Mention the count; nothing to offer |
| `about-files` | How many of the category folders and the folders directly inside them have an `_about.md` (names only) | Mention the count; when some lack one and the user wants the folders described, offer `hsb-re-organize` to describe them (it writes only `_about.md` files then, and moves nothing); when the user wants the vault tidied, offer `hsb-re-organize`; there is nothing to repair |
| `project-list` | Whether the note "Project List" in the Projects folder names each project folder once (a folder that "Lasting choices" names on its ``- Not projects: `NAME` `` line is no project folder): `warn` lists the folders without an entry and the numbers of the entries that name none; `info`: project folders and no list | Show the user the differences, or the missing list, and offer `hsb-projects`. When the user keeps a folder off the list for good (a container or an umbrella of projects), write it on that line, so that the finding stops |
| `reviews` | When the weekly and the monthly review last ran (`hyper-second-brain/state.json`): `info` names a review that is due (the weekly after 7 days, the monthly after 30, either one when it never ran); `warn`: the file is damaged | Offer `hsb-review` for a review that is due; for a damaged file, show the user the file and ask before it is changed |
| `way-back` | What lets the user undo a mistake: git facts (tracked files, last commit age, uncommitted changes); without git, this check cannot see a way back | `warn`: say once that moving many files needs a way back first (git, a backup, or cloud sync with version history), and offer `git init`: on the user's yes run `git init` in `<project>` and commit nothing. A backup or cloud sync the user names needs no record; tell the user that this check cannot see it |
