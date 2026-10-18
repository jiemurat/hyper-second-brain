# The standard of tags and links

## Contents
- The first run
- Tags
- Links
- Maps of content
- The files for the script
- The grade

The vault's standard lives in `<project>/hyper-second-brain/tags.md`, in the form of `templates/tags.md`. This file says how to build it with the user and how to follow it note by note.

## The first run

Ask these questions in rounds, each with your recommendation and its reason, and only those whose answer the facts of `measure` do not already give. Ask a question that depends on another answer in the next round.

1. **Scope.** Every Markdown note of the vault, the Inbox and the Archives included, except what `measure` leaves out (instruction files, `_about.md`, the Project List, Excalidraw drawings, templates folders). Name the folders you would leave out as well and why; write them under "Excluded" in the settings.
2. **Documents.** A Markdown document (`HYPER-SECOND-BRAIN.md` → "Notes and documents") takes properties without any change to its text: Obsidian's own PDF export leaves the properties out, but the file's bytes change, and another tool that compares files may notice. Recommend yes. Write the answer under "Documents" in the settings (`with properties` or `without properties`); with `without properties`, list the documents under "Excluded".
3. **Where tags and links go.** In the properties (recommended: Obsidian shows them in the properties panel and in Backlinks, updates them when the linked file is renamed, and the text stays as it was).
4. **The language of the tags.** Recommend English: a tag cannot hold an apostrophe, which some languages need inside words; filtering does not depend on the language; English tags read the same in every tool. The meanings in `tags.md`, the MOCs, and their aliases stay in the vault's language.
5. **Prefixes.** `type/` (exactly one per note), `topic/`, `status/` by default; propose another prefix only for a dimension the vault has many notes on (an organization, a person, a client: `org/`, `person/`), each with its meaning and a soft limit.
6. **Link properties.** `up`, `related`, `source` by default; propose another only for a relation the vault holds often that none of these says (an author, a book: keep such properties as the user already has them).
7. **MOCs.** Which sections get a MOC (see "Maps of content"), named `MOC - <topic>` in the vault's language. A home page that lists every MOC only when the vault has one already or the user wants one; write its path under "Home page".
8. **Daily notes and other personal series.** A MOC of daily notes lists the dates only, unless the user wants the headings too: headings copy personal details into another note.
9. **Pace.** A pilot on one small folder that the user opens in Obsidian, then a batch per top folder, a commit offered after each. Ask whether the user wants to see the plan of each batch or only the first one.

## Tags

- **`type/`** says what the note is, from its form: minutes, a transcript, a quotation, a price offer, a book note, a job description, a daily note, a plan, a checklist. Choose it from what the file is, not from what it is about. Prefer a type the standard already has; add a type only when several notes share the form.
- **`topic/`** says what the note is about: two or three per note at most, from the title and the headings; read the text only when these do not settle it. A topic is broader than one note: a topic that fits one note only is a sign to choose a broader one.
- **`status/`** only where the folder does not already say it: `status/draft`, `status/superseded`, `status/backup`. A note in Archives needs no `status/archived`.
- **A new prefix or link property** (core rule 3) enters `tags.md` with its meaning first, and goes into the report.
- **Old tags.** Map each existing tag to one or more tags of the standard under "Old tags", and the script rewrites it when it touches the note. An inline `#tag` in the text stays where it is; give the note the mapped tag in its properties. A Dataview query or a `.base` filter that names an old tag stops matching once the tag changes: list each one in the plan, and change it in the same batch only on the user's yes.
- **Classifying a series by its headings** (daily notes, meeting notes): cheaper than reading each note, and it can mis-tag. Keep the keyword list short, prefer headings to the text, and name each such folder in the report.
- **Merging.** A prefix over its soft limit, two types that say the same thing, a topic only one note carries: propose the merge to the user with the counts. On a yes, update `tags.md` (the old tag goes under "Old tags") and the notes.

## Links

- **`up` is the parent:** the MOC the note belongs to; in a folder without a MOC, the folder's `_about.md`. A MOC points `up` to the MOC above it, to its folder's `_about.md`, or to the home page. Every note has an `up` except the home page. When a note moves to another folder, its `up` moves with it.
- **`related` is a direct relation only:** another version of the same document, the minutes and the transcript of one meeting, a quote and its author's page, a book and the notes on it, the documents of one role, an older version and the current one. A similar topic is no relation: the tags carry it.
- **`source` is where the note came from:** keep every existing value; add one only when the origin is clear from the note and is a note or file of the vault (a book note, a meeting): the script writes links only. An origin outside the vault (a company, a web page) stays in the note's text.
- **A duplicate or an old version** (`-old`, a backup copy, a draft not approved) gets `status/superseded` or `status/backup` and a `related` link to the current one. Choose between them never, and delete nothing.
- **The form of a link** is the script's: give it a path, a note name, or `[[...]]`, and it writes the shortest form Obsidian resolves to that one file (the name when no other file has it, letter case and Unicode form ignored; otherwise the full path from the Obsidian vault root; `_about.md` always by its full path). A name that fits two files is refused: give the path.

## Maps of content

- **Place.** A MOC sits inside the folder it maps, named `MOC - <topic>`, and the folder's `_about.md` lists it under "Entry points". A MOC never stands loose in a category folder or in a folder of its own outside PARA.
- **What gets one.** A section a person browses: each organization or client, meetings, a large project, a series of daily notes, a large cluster of resources. A small folder needs none: its notes point `up` to its `_about.md`.
- **The form.** One opening sentence (what the section holds and where to start), then groups under `##` headings by what helps the reader: by kind of document, by organization, by month for daily notes, by date with the newest last for meetings (the transcript beside its minutes; by name when the notes carry no date), so that a new group joins at the end. A link whose file name is over 60 characters gets a short alias; the script cuts an alias at a word boundary and drops the characters that break a link.
- **Generate, then read.** Write the groups as data for `moc` and read the result: an alias cut badly, a duplicated phrase, a group in the wrong order. A MOC the script made carries `type/moc`; on a rerun `moc` adds the notes it lacks at the end of their groups and a new group at the end, adds the tags and `up` of the spec, and keeps the opening sentence and every line the user added.
- **Members.** A note whose `up` is a MOC must stand in that MOC: `check` lists those that do not, and the rerun adds them.

## The files for the script

The changes for `apply`, paths relative to the vault; tags and links are added to the ones the note has, `remove` takes values out:

```json
{
  "3 Resources/reading/Book notes on habits.md": {
    "tags": ["type/book-note", "topic/habits"],
    "up": ["3 Resources/reading/MOC - Reading.md"],
    "source": ["[[Habits book]]"]
  },
  "2 Areas/Team/Minutes of the kickoff.md": {
    "tags": ["type/minutes"],
    "related": ["2 Areas/Team/Transcript of the kickoff.md"],
    "remove": { "tags": ["topic/misc"] }
  }
}
```

The spec for `moc`, one MOC or a list of them:

```json
{
  "path": "2 Areas/Team/MOC - Team meetings.md",
  "intro": "Team meetings in the order they took place; the transcript stands beside its minutes.",
  "tags": ["topic/team"],
  "up": ["2 Areas/Team/_about.md"],
  "groups": [
    { "heading": "Kickoff", "links": [
      { "to": "2 Areas/Team/Minutes of the kickoff.md", "alias": "Kickoff minutes" },
      { "to": "2 Areas/Team/Transcript of the kickoff.md", "alias": "Kickoff transcript" }
    ] }
  ]
}
```

## The grade

After the last batch, open ten random notes from different folders and three MOCs, and grade the result:
- 4: every opened note has a fitting type, its topics, a working `up`, and a `related` only for a direct relation; every MOC opens from its `_about.md` and reads well.
- 3: useful: at most two notes with a type or topic you would change, the MOCs work.
- 2: partly: several notes mis-tagged, or a MOC hard to read.
- 1: unusable: the tags do not tell the notes apart, or links lead nowhere.

Below 3, find the cause (the vocabulary, the classification, a MOC), fix it, and grade again.
