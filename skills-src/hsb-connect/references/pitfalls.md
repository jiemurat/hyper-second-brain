# What goes wrong in a real vault

## Contents
- Before the pilot
- During the batches

Each item is a check with the fact of `measure` that answers it. Go through "Before the pilot" in step 2, and keep "During the batches" in view while you plan each batch.

## Before the pilot

1. **The Obsidian vault root.** It may be a folder above the notes (the project folder, with the notes under `vault/`). The script finds it by `.obsidian/` and writes full paths from there; when `measure` finds no `.obsidian/`, tell the user that the links are written from the vault folder.
2. **Automatic link updates.** With `alwaysUpdateLinks` off, Obsidian asks before it updates links on a rename; from Obsidian 1.5.7 on, links in properties are updated the same way as links in the text. Tell the user the setting.
3. **Repeated names.** Names that differ only in letter case or in Unicode form are one name to Obsidian and to a case-insensitive disk. Links to them need the full path; the script writes it. Name the repeats in the plan when they are many.
4. **Unreadable properties.** A note whose properties the script cannot read (a byte order mark, a key written twice, a multi-line value of `tags`, the old `tag` key) is refused: list them and ask the user before you repair a note's properties by hand.
5. **Things that look like tags.** A colour such as `#FFD700` in a table, a heading inside a code block: map only what is a tag of the user.
6. **Tags that queries use.** Each Dataview query and `.base` filter that names a tag or a folder: a tag change or a new file in that folder (a MOC, an `_about.md`) changes what it shows. List them before the pilot.
7. **Canvases** name files by path: move or rename no file a canvas names.
8. **Templates.** The templates folders are left out. A template that includes another template (`tp.file.include`) must get no properties of its own: new notes would get two properties blocks; a script template stays as it is. A plain template (the daily note, a meeting) may carry the standard properties so that new notes arrive tagged: ask the user.
9. **Plugin files and agent files.** Excalidraw drawings keep their own properties; instruction files and hidden agent folders hold rules and state, not notes. `measure` leaves them out.
10. **Uncommitted changes.** When the vault has the user's uncommitted changes, ask the user to commit them first: the body check and the way back then start from a clean commit.
11. **Cost.** `measure` gives the size in tokens. Read cards (the title, the headings, the opening lines) and open a whole note only when its card does not settle it. Give the user an estimate before the first batch when the vault is large.

## During the batches

- **One batch, one commit.** Offer the commit after the batch's `check --scope` shows no fail; compare the text with the commit made before the first batch (`--base`), not with the last batch.
- **Vocabulary drift.** Each batch adds tags. Before the next batch, read the new tags beside the old ones and merge the near-duplicates first.
- **Personal data in MOCs.** A MOC copies titles and aliases into another note: leave out the details the user would not want gathered in one place (health, family, money) unless the user asks for them.
- **Partial paths.** A link that names only the end of a path relies on a resolution Obsidian does not document; `check` warns about it. Give the script a full path or a name instead.
- **A moved note.** After a note moves, its `up` may still name the old folder's `_about.md`: `check` lists it under `up-stale`; give it the new parent.
