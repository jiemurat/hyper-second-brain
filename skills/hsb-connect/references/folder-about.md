# The about file of a folder

This reference holds the rules of the file `_about.md` that describes one folder of the vault. The rules that hold for the whole vault are in `HYPER-SECOND-BRAIN.md`; this file names them and does not repeat them.

## Contents
- What the file is for
- Which folders get one
- What goes in it
- How to write or update it
- What to tell the user

## What the file is for

`_about.md` is a note about the folder it sits in, like the index note of a folder. An agent that is about to work in the folder reads it first and so knows, without opening the notes, what the folder serves, what belongs in it, and where to start. It belongs to the vault: it describes the content of the folder and changes when that content changes.

## Which folders get one

- When you reorganize, a folder whose content changed: an item came in or left, the folder was created, renamed, moved, or merged. The parent of a created or removed folder counts too, and `plan` names every touched folder that has no row yet. The five PARA folders count like any other folder. The top of the vault and hidden folders get none.
- When you place items, only the folders they go into get one, and the parent of a folder the placing creates; the folder an item leaves does not.
- A folder that is removed or merged away loses its file: carry the lines that still hold over to the file of the folder that takes its place, then remove the old file.
- A folder that nothing touched is left as it is, with or without the file, unless the user asks to describe folders: then each folder the user names gets one, or, when the user names none, each category folder and each folder directly inside one that has none (the folders the `about-files` finding of `hsb-doctor` counts). Describing alone moves nothing.

## What goes in it

Start with the folder's name as the title, then these sections in this order. Write a heading for every section, and `None.` under a section that has nothing to say. Write the whole file, the headings and `None.` included, in the main language of the vault: the language most of its notes use, and the user's own language when that does not decide it. A folder whose notes are in another language gets its description in the vault's language all the same, so that every description reads in one language. Copy the headings and `None.` of a vault `_about.md` in that language word for word. An existing file keeps its language and headings when you update it.

1. **Purpose.** One sentence: what the folder serves and which category it is in. For a project: its goal and its timeframe. For an area: the standard the user keeps up. For a resource: the topic and the interest behind it. For an archive: what it holds and why it is inactive. For a catch-all folder with no topic of its own, say that it is a catch-all and what kinds of material it holds.
2. **Belongs here.** The kinds of material that go into this folder, each in a few words.
3. **Not here.** The kinds of material that look like they belong here and go elsewhere, each with the name of the folder it goes to.
4. **Conventions.** How things are named and arranged in this folder (flat or with subfolders, a naming style, documents keep their names), only where the folder differs from the vault's general rules.
5. **Entry points.** The one to three notes to start from (a plan, an overview, a log) as links, and the Project List entry for a project. Name no other files: a list of files goes stale and search finds them.
6. **Agent rules.** What an agent does in this folder without asking, and what needs the user's yes, only where this folder differs from the general rules. Add where the folder's items also live on other platforms (the exact name of the calendar, the to-do list project, or the cloud folder).

Keep it under 40 lines. Leave out the general rules of the vault, secrets and private details, counts, dates that go stale, and anything an agent finds faster by looking at the folder.

## How to write or update it

1. Read the file when it exists, and read enough of the folder to know what it serves now: when you reorganize, the cards of the scan and the notes that the entry points name; when you place items, the file names of the folder and the items (open no other note for them but one `_about.md` of the vault, for its language and headings; with none, take the vault's language from the file names of the vault).
2. Change the file as `HYPER-SECOND-BRAIN.md` → "Folder about files" says; add what is missing, and remove what does not belong in it (see "What goes in it").
3. Write your own lines in the style of the file. A line of the user that names a folder which does not exist stays as it is: create no folder because of it, and put the missing folder into the questions.
4. Check the links in the file against the folder after the change: an entry point must point to a note that exists.

## What to tell the user

Name each file you created, updated, or removed, with one clause for the reason.
