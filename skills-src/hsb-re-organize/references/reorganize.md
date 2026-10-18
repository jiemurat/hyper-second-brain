# Reorganizing a vault: the rules of this skill

This reference holds the rules that belong to reorganizing a whole vault. The rules that hold for the whole vault are in `HYPER-SECOND-BRAIN.md` and the rules of choosing the place of one item are in the `hsb-place-an-item` skill; this file names them and does not repeat them.

## Contents
- The order of the work
- Signs and what to do about them
- Deciding the structure
- Writing the rows
- Questions to put together
- After the apply

## The order of the work

1. Decide the structure first: which project, area, resource, and archive folders the vault should hold. Take the user's current projects (the Project List, else the folders in Projects) and areas as the anchors; judge every other folder against them.
2. Decide the items next: every file that is not in a folder that already serves its place gets a place.
3. Write the rows in the order the script runs them: the `mkdir` rows, then the moves (a folder before what moves into it), then the `rmfile` and `write` rows for the `_about.md` files, then the `merge` rows, then the `rmdir` rows for the folders the moves left empty. An `_about.md` row describes its folder after the rows applied with it; a later round updates it.

Done when every folder and file is either left in place for a reason you can state or has a row or a question.

## Signs and what to do about them

The script prints the signs that names and layout show. Judge the rest from the cards.

| Sign | What to do |
|---|---|
| `outside-para` (a top-level folder outside the five) | When every file of the folder belongs to one place, move the files (the folder whole when it fits), as `doubt` rows, however many places the files go to. `HYPER-SECOND-BRAIN.md` → "Folders and names" lets such a folder stay until the user says how to treat it: the user asking for this reorganization and saying yes to the table is that decision. When the destination folder exists, a `merge` row moves the whole content and removes the folder; when only some files go, write a row per file. An `rmdir` row follows when the moves empty the folder. When its files belong to several places, place each file by the order of the work; when none of them has a place (a folder whose files all wait for an answer counts too), write no row: leave the folder and put it to the user in the questions. |
| `root-file`, `loose-in-category` | Move each file into the folder of what it serves, else into the Inbox. |
| `empty-folder` | A folder with only its `_about.md` counts as empty: add an `rmfile` row for the file, then an `rmdir` row: flag `ok` when the plan's own moves empty the folder, `doubt` when it was empty before the plan; an empty folder holds nothing, so the user's yes to the table covers its removal. |
| `duplicate` | The sign leaves out notes with no text after their properties, copies of a template, and groups whose every name is listed under "Lasting choices" as ``- Ignore names: `name`, `name` ``. When the user says a group repeats by design, add its names to that line. Otherwise follow "One item, one place" in `placement.md`: write no row, and ask the user in the questions which copy is current, naming both paths. The question lives in your report only; keep it in the questions of each report until the user answers. After the answer, one row moves the other copy into an archive folder (the script has no delete; taking something out of the user's way means moving it to Archives). |
| `same-name` | Two files with one name and different content: write no row for either, and ask which is current, naming both paths (a document is never renamed and nothing is overwritten). A name in three or more folders, or on the `Ignore names` line, repeats by design and is left out; when the user says a pair repeats by design, add the name to that line. |
| `vague-name` | Retitle a note with a `move` row to a clear name (a document keeps its name); an item that waits for an answer keeps its name until then. |
| `name-case` | Write no row for it yet. Ask once, in its own question before you write the plan: each folder as "old name → new name", with the name the sign gives, and whether to rename them. An item that ends with `its path is written in:` names the settings, templates, or instruction files that write the old path: name them in the question and recommend keeping that folder's name. On the yes, write a `move` row of kind `folder` for each, to the new name; on a no, write `- Folder names: keep as they are` under "Lasting choices", and the script leaves the sign out from then on. |
| `bad-name` | Propose a name without the emoji or the reserved character as a `move` row. |
| `project-list` | Update the Project List after the apply (step 8 of SKILL.md). A folder the user keeps off the list (a container or an umbrella of projects) goes under "Lasting choices" as ``- Not projects: `NAME` ``, and the sign leaves it out. |
| `deep-folder` | Look at what the nesting holds; flatten it only when the user asked for subfolders to go. |
| `unresolved-link`, `ambiguous-link` | Leave them as they are and count them in the report. |
| `inbox-size` | Offer the sort in this plan; archiving a whole Inbox is a separate decision of the user. |

Signs only you can judge:
- Material of a current project sits outside the project's folder: move it in.
- An area has active efforts and no project folders: ask the user to confirm the projects, with goal and timeframe, before creating any folder.
- An inactive project, area, or resource sits outside Archives: ask unless the user already called it finished, paused, or cancelled.
- A topic the user is responsible for sits in Resources, or personal details sit in a resource folder: move it to the area (see `placement.md` → "Telling areas from resources").
- A resource now serves a current project: move it into the project's folder (promote); material that no longer serves a project goes to the topic's Resources folder (demote).
- A "project" has no end: it is an area.
- A document whose name and type do not settle its place stays where it is and gets no row: ask the user what it is, in the questions.

## Deciding the structure

- Keep the folders and names that exist when they fit what they serve; a plan with few rows is a good result.
- Merge two folders that serve the same place into the one with the better name; folders in one parent whose names differ only in letter case are one folder.
- Split a folder that serves two places by moving the items that leave; each destination folder is a `mkdir` row first.
- Leave the inside of a project, area, resource, or archive folder as it arrives. An item inside a folder that does not serve it gets a row to its own place; the rest of the folder stays untouched, and no subfolder is created.
- Move a folder whole when all its content serves one place. Give each such move one row, whatever the file count.
- Name a new or renamed folder as `HYPER-SECOND-BRAIN.md` → "Folders and names" says. A renamed folder in Projects, Areas, or Resources gets a row of its own; the five PARA folders are not renamed or moved by the script, and a change in their set is the user's decision.

## Writing the rows

The plan is a JSON array in `<work>/plan.json`. Each row has `op`, `kind`, `reason`, `flag`, and the paths it needs: `from` and `to` for a move and a merge, only `to` for a mkdir, only `from` for an rmdir. Every path is relative to the vault, as the cards print it. In a `write` row `text` holds the whole new file as one JSON string, each line break written as `\n`. The script numbers the rows in file order.

| Situation | Row |
|---|---|
| Create a folder | `op` mkdir, `kind` folder, `to` the new path; `flag` ok for a resource folder, `ask` for a project or area the user has not confirmed |
| Move or rename a note | `op` move, `kind` note, `from` and `to` full paths |
| Move a document | `op` move, `kind` document, same file name in `to` |
| Move a folder whole | `op` move, `kind` folder |
| Archive | `op` move into an archive folder of the Archives folder that is named for what the item served (a `mkdir` row creates it first), the item's own name kept |
| Describe a folder | `op` write, `kind` about, `to` the path of its `_about.md`, `text` the whole new text of the file (create or update; `references/folder-about.md` says what it holds) |
| Remove the `_about.md` of a folder that goes | `op` rmfile, `kind` about, `from` the path of the file, before the `merge` or `rmdir` row of its folder |
| Merge two folders | `op` merge, `kind` folder, `from` the folder to empty, `to` the existing target; first a `write` row for the target's `_about.md` (with the lines of the source's that still hold, when it has one), and an `rmfile` row for the source's when it has one |
| Remove a folder the moves left empty | `op` rmdir, `kind` folder |

Every row, a merge included, takes any flag. Flags: `ok` is a row you are sure of; `doubt` is a row you would apply and report with the alternatives you weighed (name them in `reason`); `ask` is a row that waits for the user and is never applied; `skip` is a row the user declined: it stays in the plan, so that the numbers hold, and is never applied. Write `reason` as one sentence that a person reads in the table. In a move row `to` is the destination path with the file or folder name at its end. A row flagged `ask` keeps the item's current name there, because an item that waits for an answer stays under its name; the new name goes into the row when you set it to `ok`. A `mkdir` row has no current name: write the name you propose. A file that waits as a duplicate gets no row, whatever other signs it has. A sensitive record (`placement.md` → "Doubts and sensitive items") gets no row either: it stays where it is, and the question about it goes into the questions with the choices that section lists. A Markdown file that holds a finished or third-party text is a document: use `kind` document for it.

## Questions to put together

Ask after the table, all at once, about what `HYPER-SECOND-BRAIN.md` → "What you may do and what you ask first" lists, about the sensitive records and the new projects or areas that `placement.md` → "Doubts and sensitive items" asks about, and about every `ask` row. Offer the choices with each question and mark your recommendation. A yes to the whole table answers the rows flagged `ok` and `doubt`; a row flagged `ask` needs its own answer, and a row waits in the plan with that flag until the user gives it.

## After the apply

- Update the list under "Other top-level folders" in `project.md` when a folder on it was removed or emptied.
- Edit the Project List so that it agrees with the folders in Projects (`HYPER-SECOND-BRAIN.md` → "Project List"), here not in the same step but once no row waits and after `verify`: the edit is a change no batch made, so the way back turns `dirty` and the next `apply` waits for a commit. After an `undo`, edit it back.
- Then run `scan` again and compare its signs with the first scan.
- Tell the user about links the script could not repair (inside documents and canvases) and about unresolved and ambiguous links, by note name only.
- Keep the work folder until the user says the result is fine; `finish` removes it, and `undo` takes the last batch back until then.
