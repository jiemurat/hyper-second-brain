# Starting the vault over

This reference holds starting the vault over: one move of everything in the category folders into a dated folder in Archives, and the rebuild from the user's current projects. Nothing is deleted: the old material waits in that folder exactly as it was.

## Contents
- When
- The steps
- The script's exit codes

## When

Use this when the user asks to start the vault over. When only the Inbox has piled up, archiving the Inbox is enough: point the user to `hsb-review`.

## The steps

1. Run `restart --reason <a short reason in the user's language>`. It writes the plan file that its output names, a JSON array of rows: a new folder in Archives named `Archive YYYY-MM-DD` with today's date; in it one folder for each of the Inbox, Projects, Areas, and Resources folders that holds something, named as that folder; and one row for each file and folder in them. It leaves in place the `_about.md` of each category folder, the note `Project List.md` in Projects (the rebuild in step 5 archives it as the old list), hidden files and folders, what Archives already holds, and everything outside the category folders. Append to the array one row for the `_about.md` of the new folder, and one for the `_about.md` of the Archives folder when it has none or the new folder makes it untrue: `{"op": "write", "kind": "about", "to": "<the folder's path in the vault>/_about.md", "text": "<the whole file>", "reason": "<one sentence in the user's language>", "flag": "ok"}`, written as `folder-about.md` says; the purpose of the new folder says that it holds what the vault held on that day, archived for a fresh start. Write no other row: the category folders keep their `_about.md`, and a moved folder takes its own along. Run `plan`, and correct the rows you appended until it reports no error.
2. Tell the user, in one message: the count of the items in each folder, the new folder's name exactly as written, what stays in place, that nothing is deleted and the links are repaired, and the way back that the output names (`clean`: the vault is committed in git). Wait for the yes, and run nothing more before it.
3. On the yes, run `apply --rows all`, then `verify`. `verify` checks every link too: a link that still finds its note, by its name or the end of its path, works as it is, so when `verify` reports no stale link, edit no note. When `apply` stops with exit 6, ask the user to commit the vault or to confirm a backup, and run it again with `--backup-confirmed` only after the user confirms one.
4. Tell the user that the old material sits in the new folder exactly as it was, that you search it whenever they need something old, and that any item comes back by moving it out; ask whether the result is fine, and wait for the answer: `finish` removes the script's work folder, and with it the way back through `undo`. When the user says to take it back, run `undo`. On the yes, run `finish`; from then on the way back is the vault's own history, so suggest that the user commits the vault now. A moved `_about.md` that now says something untrue (that a project is current, for example) gets the one fix that makes it true, as `HYPER-SECOND-BRAIN.md` → "Categories" says for Archives.
5. Rebuild: build the Project List as `../hsb-projects/references/project-list.md` → "Building the list" says, with the old list as the first source of candidates, and for each confirmed project take steps 1 to 3 of `../hsb-projects/references/lifecycle.md` → "Starting a project", so that it has a folder and an entry. Bring old material into a project only when the project needs it.

Done when `verify` reports nothing missing after the move, the category folders hold only what stays in place and the new project folders, the user knows where the old material is, and every project the user confirmed has a folder and an entry on the list.

## The script's exit codes

- 0: done.
- 1: the message says what needs attention: a batch that is not finished (run `finish` once the user is content with it, or `undo`), a folder of that name already in Archives (run `restart` again with `--name` and another name), or an error in the plan.
- 2: a usage error; the message says what to fix.
- 3: hyper-second-brain is not set up here. Offer `hsb-init`.
- 4: the project is older than these skills. Offer `hsb-update`.
- 5: `hsb-place-an-item` is not installed next to this skill. Tell the user to reinstall the skills with `npx @jiemurat/hyper-second-brain@latest init`.
- 6: the vault has no way back from a mistake (step 3).
