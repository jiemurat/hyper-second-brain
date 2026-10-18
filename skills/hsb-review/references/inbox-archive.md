# Archiving the whole Inbox

This reference holds the archiving of the whole Inbox in one move, for an Inbox that has piled up and that the user would rather be done with than sort. Nothing is deleted: the items wait in one dated folder in Archives, exactly as they were.

## Contents
- When
- The steps
- The script's exit codes

## When

Use this when the user asks for it, and when the user chooses it at the first step of the weekly review (`weekly.md` → "The steps").

## The steps

The script runs as `node <skill>/scripts/reorganize.mjs <command> --root <project> --json`.

1. Run `inbox --reason <a short reason in the user's language>`. It scans the vault and writes the plan file that its output names, a JSON array of rows: a folder in Archives named after the Inbox without its leading number, with today's date (created unless it exists), and one row for each file and folder in the Inbox; the Inbox's `_about.md` stays where it is. Append to the array one row for the `_about.md` of the new folder, and one for the `_about.md` of the Archives folder when it has none or the new folder makes it untrue: `{"op": "write", "kind": "about", "to": "<the folder's path in the vault>/_about.md", "text": "<the whole file>", "reason": "<one sentence in the user's language>", "flag": "ok"}`, written as `folder-about.md` says; the purpose of the new folder says that it holds the Inbox items of that day, archived without sorting. Run `plan`, and correct the rows you appended until it reports no error; when it names the Inbox among the touched folders without a row, leave the Inbox's `_about.md` as it is.
2. Tell the user the count of the items, the folder's name exactly as written, that nothing is deleted, that the links to the items are repaired, and the way back that the output names (`clean`: the vault is committed in git). Wait for the yes.
3. Run `apply --rows all`, then `verify`. When `apply` stops with exit 6, ask the user to commit the vault or to confirm a backup, and run it again with `--backup-confirmed` only after the user confirms one.
4. Tell the user that the Inbox is empty, that the items sit in the folder exactly as they were, that you search the folder whenever they need something old, and that any item comes back by moving it out. When the user says to take it back, run `undo`. When the user is content with the result, run `finish`; it removes the script's work folder.

Done when the Inbox holds only its `_about.md`, the dated folder holds every item that was in the Inbox (the count of `inbox` and the files that `apply` moved agree), and the user has been told where the items are.

## The script's exit codes

- 0: done.
- 1: the message says what needs attention: a batch that is not finished (run `finish` once the user is content with it, or `undo`), an item of the same name already in the folder (run `inbox` again with `--name` and another name), or an error in the plan.
- 2: a usage error; the message says what to fix.
- 3: hyper-second-brain is not set up here. Offer `hsb-init`.
- 4: the project is older than these skills. Offer `hsb-update`.
- 5: `hsb-place-an-item` is not installed next to this skill. Tell the user to reinstall the skills with `npx @jiemurat/hyper-second-brain@latest init`.
- 6: the vault has no way back from a mistake (step 3).
