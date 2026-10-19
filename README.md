# hyper-second-brain

[![npm](https://img.shields.io/npm/v/@jiemurat/hyper-second-brain)](https://www.npmjs.com/package/@jiemurat/hyper-second-brain) [![downloads](https://img.shields.io/npm/dm/@jiemurat/hyper-second-brain)](https://www.npmjs.com/package/@jiemurat/hyper-second-brain) [![license](https://img.shields.io/npm/l/@jiemurat/hyper-second-brain)](https://github.com/jiemurat/hyper-second-brain/blob/main/LICENSE) [![ci](https://github.com/jiemurat/hyper-second-brain/actions/workflows/ci.yml/badge.svg)](https://github.com/jiemurat/hyper-second-brain/actions/workflows/ci.yml)

Agent skills that set up and look after a second brain: a vault of notes and documents (for example an Obsidian vault) that AI agents keep in order for you. The package writes its general rules for the vault into your project (`HYPER-SECOND-BRAIN.md`), connects them to the agent's instruction files, and its skills set the project up, check it, keep it current, decide where the notes and files that come into the vault go, keep your list of projects, run your weekly and monthly reviews, find what the vault holds, decide what is worth keeping, mark the main points of your notes, turn your notes into finished work, prepare notes for other people, give your notes tags, links and maps of content, and start the vault over when it has become too much.

| Skill | What it does |
|---|---|
| `hsb-init` | Sets hyper-second-brain up in a project: writes `HYPER-SECOND-BRAIN.md`, connects it to the agent's instruction files, and creates the vault and its PARA folders when they are missing |
| `hsb-doctor` | Checks the setup and a few facts about the vault, repairs the package's own files, and reports the rest |
| `hsb-update` | Brings an installed setup to the newest version: skills and instruction-file lines, then a full `hsb-doctor` |
| `hsb-place-an-item` | Decides where a note or a file goes in the vault and puts it there: sorts it as a note or a document, applies the PARA categories, keeps documents under their own names, repairs links |
| `hsb-projects` | Keeps your Project List and runs the life of a project: builds and reviews the list, starts a project (folder, entry, a first note in your words, the material its goal needs), renames, splits or shrinks it, finishes it (a short look back, reusable material moved out, the folder archived), and reopens it |
| `hsb-review` | Runs your weekly review (the Inbox placed, the Project List reviewed, a question about changes in your roles and interests) and your monthly review (goals, areas, ideas kept for later, recurring themes, priorities), archives a piled-up Inbox whole, and moves material between the categories when a role, responsibility or interest of yours starts or ends |
| `hsb-find` | Finds what your vault holds on a subject and says where it sits (title and folder, quoted, its age when it matters), gathers past work and evidence from Archives first, states where a project stands, offers connections and patterns, prepares an agenda for a meeting, and lists the material toward work that is stuck |
| `hsb-capture` | Decides what is worth keeping (your reaction first, then four questions: inspiring, useful, personal, surprising), keeps the key points of an article, a book or a transcript as a short note with its source line and your reason in your words, keeps your list of favorite problems, and brings highlights and notes from other apps into the Inbox |
| `hsb-distill` | Marks the main points of your notes in layers (bold, then highlight, each about a fifth of the layer before) without changing a word, marks the decisions and action items of meeting notes, gathers passages when you want to learn the material yourself, and summarizes a note in the chat, adding the summary to the note only when you ask |
| `hsb-create` | Prepares focused work on a project (next steps, the material they need, offline use), helps you explore or finish a piece, keeps a "Where I left off" note for each project, assembles a deliverable from the notes you already have (each component with its candidate notes, or "to make"), outlines a piece of writing, and keeps reusable pieces and the feedback you get |
| `hsb-share` | Prepares a separate copy of a note for readers who lack your context (a short summary first, terms explained, the reasoning given, personal details left out and named), gives feedback on a draft you wrote for others, and says what goes to a shared platform when work becomes shared; it sends nothing |
| `hsb-restart` | Starts the vault over: after your yes, moves everything in the Inbox, Projects, Areas and Resources into one dated folder in Archives (nothing deleted, with a way back), then rebuilds the Project List and the project folders from what you work on now; for a new user, walks through getting started one stage at a time |
| `hsb-re-organize` | Reorganizes the whole vault into the PARA structure: scans every folder and file, shows a numbered table of every change, and after your yes moves things, repairs links, describes each changed folder in an `_about.md`, verifies the result, and can take the last batch back |
| `hsb-connect` | Gives every note a type and topic tags, a link to its parent (`up`), links to directly related notes and to its source, all in the note's properties without changing its text, makes maps of content for the sections you browse, and on every later run fills the gaps new and moved notes left |

## How a project looks

```
your-project/
├── AGENTS.md or CLAUDE.md     your own instruction file; it gets one pointer line
├── HYPER-SECOND-BRAIN.md      the package's general rules for this project (a file of the project)
├── hyper-second-brain/        project.md (folder map, project rules, your lasting choices) and a manifest
├── vault/                     your notes and files; missing PARA folders are created here
└── .agents/skills/, .claude/skills/   the hsb-* skills (tool files, kept out of git)
```

The project root is the folder where you open your agent. It holds the vault in `vault/` (markdown notes plus any other files: Word, Excel, PDF, images). Nothing of the package goes into the vault except the empty PARA folders that were missing.

## Notes and documents

The rules in `HYPER-SECOND-BRAIN.md` treat the vault's files as notes and documents. A note is a Markdown file with writing of yours or of the agent; the agent may give it a clearer title. A document is any other file (Word, Excel, PDF, images) or a Markdown file you keep as it is, such as a contract. The agent never renames, edits, overwrites, or converts a document on its own. You can name any file as the other kind, and the agent records the exception in `HYPER-SECOND-BRAIN.md`.

## What the general rules cover

`HYPER-SECOND-BRAIN.md` also holds the rules that apply to every vault job: what the Inbox and the four PARA categories mean, how folders are named (projects in capital letters, areas with a capital first letter, resources in lowercase; no emoji, and none of the characters that file systems reserve), what the agent may do without asking and what it asks first, how links are repaired after a move, which language notes and titles are written in, how notes are read as data and secrets are kept out of them, and the form of the Project List. Where your own instruction files or your recorded choices say something different, they win.

## Install

In the project folder (the folder that holds `vault/`):

```bash
npx @jiemurat/hyper-second-brain@latest init
```

It copies the skills to `.agents/skills/` (Codex, Gemini CLI, Antigravity, GitHub Copilot, Cursor, OpenCode, Amp, Cline) and `.claude/skills/` (Claude Code), writes `/hsb-*` command files for Gemini CLI and OpenCode, and adds these tool files to `.gitignore`: the skills are tools, the project's knowledge lives in the project's own files. Then open your agent in the folder and run:

| Agent | Command |
|---|---|
| Claude Code, Antigravity, Cursor, GitHub Copilot, Gemini CLI, OpenCode | `/hsb-init` |
| Codex | `$hsb-init` |

Other agents: `--agents windsurf,kiro,qwen,goose` (or `--agents all`).

The skills have been tried with Claude Code only. The other agents read the same skill folders, which follow the Agent Skills format, but they have not been tried.

## What the skills do

`hsb-init` shows you a short plan and, after your yes:
- creates `vault/` when it is missing, and the PARA folders that are missing. Existing folders are never renamed: it finds `0. INBOX`, `1 Projects` or `Archive` by name and records which folder stands for which PARA category in `hyper-second-brain/project.md`; new folders follow the style of the existing ones;
- writes `HYPER-SECOND-BRAIN.md` in the project root (a file that is already there stays as it is) and `project.md` and a manifest in `hyper-second-brain/`;
- adds one pointer line to your instruction file (`AGENTS.md`, or `CLAUDE.md` when that is what you have), written in the language of that file with only the needed words in English, or writes a minimal English `AGENTS.md` when there is none;
- reads the project's own rules and records pointers to the ones that touch vault work in `project.md`, and asks you, in one message, when a project rule conflicts with `HYPER-SECOND-BRAIN.md`;
- offers `git init` (a way back for the vault) when the project is not a git repository.

`hsb-doctor` runs a check script that only reads. It looks at the manifest, `HYPER-SECOND-BRAIN.md`, the pointer line, `project.md`, the folder map, and at the vault: file counts by type, the Inbox size, and whether git gives a way back. It prints names, counts and dates, never the text of a note. `--fix` repairs only the package's own files: a missing `HYPER-SECOND-BRAIN.md` is written again, one that exists is never replaced. The check also tells when `HYPER-SECOND-BRAIN.md` names a skill that is not installed or differs from the template of the installed version; `hsb-doctor` then shows you the differences and, on your yes, takes the new text and keeps your own lines. When `project.md` records none of the project's rules, `hsb-doctor` offers to record them.

`hsb-place-an-item` decides where an item goes and puts it there. It sorts the item as a note or a document, applies the PARA categories (the folder of a current project first), picks the folder or creates it (a new project or area folder only after your yes), keeps a document under its own name, repairs the links its moves broke, and tells you in the chat where each item went and why. It keeps every item in the vault and reminds you when another platform suits it better (a calendar, a to-do list app, a password manager). Before it files a sensitive document (health, tax, identity) it asks you once, and your answer is written under "Lasting choices" in `project.md`, so that it does not ask twice. It keeps no log in the vault: git and the chat summary are the record.

`hsb-projects` keeps the Project List: a note in your Projects folder that lists every project you are committed to, each with a goal, a timeframe and an area, ranked for the coming week. It builds the list with you, reviews it when you ask or feel stretched thin, and starts, renames, splits, shrinks, finishes and reopens projects, keeping the list and the project folders in step. A project folder is created, archived or reopened only on your word. The questions you leave open (a timeframe you have not set yet, for example) wait in `hyper-second-brain/state.json`, outside the vault, and come back the next time you work on your projects.

`hsb-review` runs the routines that keep the vault in step with your work. The weekly review places what waits in the Inbox, reviews the Project List with you, and asks whether a role, responsibility or interest of yours started or ended, or an area slipped below the standard you keep. The monthly review steps back: your goals for the quarter and the year (in a goals note, when you want one), the full Project List, the areas you choose, the ideas you kept for later, the themes that recurred in your notes, and the priorities for the coming weeks. When a role or an interest changes, it finds the material that change touches and moves it to the category that fits, after your yes. An Inbox that has piled up can be archived whole into one dated folder, with a way back. The dates of the last reviews wait in `hyper-second-brain/state.json`; when a review is due, the agent offers it once at the end of its first vault work in a session.

`hsb-find` answers from the vault: each find with its title and folder and the lines that answer, quoted, and a plain "nothing" when the vault holds nothing. Its search script ignores letter case and the form of the apostrophe (o', oʻ and o’ match each other), ranks by how much an item matches rather than by its age, and finds Word, Excel and PDF files by their names. It never quotes a password, a key or a card number: it names the note and suggests a password manager. It gathers past work and evidence from Archives first, gives a project's goal, timeframe and latest notes, prepares a meeting agenda in which every item names its source note, and, when your work is stuck, lists what the vault holds toward it by kind and what is missing. It changes nothing in the vault; the outcome of a meeting is saved by `hsb-place-an-item`. Before the agent researches, drafts or proposes something, it first looks at what the vault already holds.

`hsb-capture` keeps what you hand over or say moves you without testing it, and tests an item only when you ask whether it is worth keeping or when it chooses the parts of a source: it favors what contradicts your notes and leaves out what the vault already holds. A note from a source stays within about a tenth of it, carries a source line (title, author, date, address) and reads without the source; it is placed at once. A source it cannot open (a video, a paywalled page) it asks you for, and it writes nothing from memory. Highlights and notes from other apps go to the Inbox, one note per source, for the weekly review, which also tests new items against your favorite problems.

`hsb-distill` distills a note only when you ask, and only by adding marks: removing them gives back your text word for word. Bold carries the main points (your own highlights first), a highlight inside the bold carries the best of them, and the convention is recorded once in `project.md`. A summary of a note comes in the chat with an offer to add it at the top; it goes into the note only on your word. The rules file asks every note the agent writes to say what it holds and why, in plain words, and to end with the next step, and the agent shows the most condensed part of a note first.

`hsb-create` puts the vault to work. When you sit down to work, it names the next steps of your top projects from your notes and checks that the project folder holds what those steps need; when you go offline, it reminds you to make the Projects folder available offline. It asks whether you are exploring or finishing: exploring widens the search, finishing works only from the project folder and keeps what you cut in a note of ideas for later. At the end of a work session it offers a dated entry in the project's "Where I left off" note (next steps, status, details you would forget, your intention), and reads it first when you come back. For a report, a presentation or an event it lists the components and the notes that can fill each, and writes a draft only when you ask, as a separate note that links to its sources. It moves material into a project only on your yes and sends nothing anywhere.

`hsb-share` treats the vault as your own workspace: sharing is a step you take on purpose. For a note you want to share, it asks who will read it, writes a new note for those readers (in their language, opening with a short summary, with the terms and the reasoning they need), leaves out health, finance, family and credential details and tells you which kinds it left out, and places the note next to the original, which stays as it was. It never sends anything. When other people start working with you, it tells you which material belongs on the shared platform, under the same name as its vault folder, and records the team's playbook or note form when the team has one.

`hsb-restart` is for a vault you would rather start over than sort. It shows you what moves and what stays (the Project List, each folder's `_about.md`, what Archives already holds, hidden files and the folders outside PARA), and after your yes its script moves everything else into `Archive YYYY-MM-DD` in Archives, one folder per category, repairs the links, verifies the move and can take it back. Then it builds your Project List from the projects you work on now, with the old list as the first source, and brings old material back only when a project needs it. For a new user it offers eight stages, from choosing what to capture to the monthly review, one at a time, and remembers the stage you reached.

`hsb-re-organize` brings the whole vault, every folder and every file, into the PARA structure without starting over. A script scans the vault and prepares a short card for each item; the agent decides where each item belongs with the rules of `hsb-place-an-item`, and shows you a numbered table in which every change is one row (a folder that moves whole is one row). Nothing changes before your yes, and you can answer with row numbers ("1-30 and 33, skip 7"). The script then does the moves, repairs the links in your notes (a full path from an Obsidian vault one folder above the vault included), never edits or renames a document, and checks that nothing was lost. Before a folder moves, it names the Obsidian settings, templates and instruction files that still write its old path, and when git ignores letter case it gives the commands that record a rename of letter case only. It also keeps a short `_about.md` note in every folder it changes (what the folder serves, what belongs in it, where to start): it creates the note, or reads an existing one and edits it, and agents read it before they work in that folder. Ask it to describe your folders, and it writes only the `_about.md` notes and moves nothing. It needs a way back: a committed vault in git, or your word that a backup exists. The last batch can be taken back, and the temporary work files stay outside your project and vault.

`hsb-connect` makes the vault quicker to use for you and for agents: which notes are about X, what belongs to project Y, answered from properties and maps of content instead of a full-text search. On the first run it measures the vault (tags, properties, repeated names, the Obsidian settings, the queries and filters that depend on tags or folders) and agrees with you on a standard, kept in `hyper-second-brain/tags.md`: the tag prefixes (`type/`, `topic/`, `status/` and any the vault needs), every tag with its meaning, how each existing tag maps to the new ones (none is dropped), and the link properties (`up`, `related`, `source` and any the vault needs). Its script writes tags and links into the properties of each note and refuses a note whose text would change; links take the shortest form Obsidian resolves, with the full path when a name repeats (letter case and Unicode form ignored). A map of content sits in the folder it maps, and the folder's `_about.md` points to it. It starts with a pilot on one folder you look at in Obsidian, goes on folder by folder after your yes, needs a way back (a committed vault or your word that a backup exists), and checks every tag, link and map against the standard; a later run fills what new and moved notes lack. Once the standard exists, the other skills give the notes they create or place their tags and links.

`hsb-update` shows you a short plan and, after your yes, updates the skills, refreshes the wording of the pointer line, runs the migration steps of newer versions, and ends with a full `hsb-doctor`. `HYPER-SECOND-BRAIN.md` and `project.md` are your project's files: only a migration step of a newer version may change them, in the way its text says, and the closing `hsb-doctor` offers to refresh a `HYPER-SECOND-BRAIN.md` that an older version wrote.

## Works next to other agent setups

hyper-second-brain does not repeat what the project already has. Next to a pan-harness harness, an `AGENTS.md` or a `CLAUDE.md`, it adds one pointer line to the existing file (in a harness, as the last item of "Session start") and keeps everything else in its own files (`HYPER-SECOND-BRAIN.md` and the `hyper-second-brain/` folder). The project's own rules win over `HYPER-SECOND-BRAIN.md`. Its tool files use their own `hsb-*` names, `.gitignore` block and manifest, so it installs, updates and removes without touching another package's files.

## Credits and sources

The rules and skills of this package are based on two books by Tiago Forte: "The PARA Method: Simplify, Organize, and Master Your Digital Life" (2023) and "Building a Second Brain: A Proven Method to Organize Your Digital Life and Unlock Your Creative Potential" (2022). They restate the methods of those books as working rules for AI agents. They are not the books and do not replace them. This package is not affiliated with or endorsed by Tiago Forte or Forte Labs. All rights in the books belong to their author and publisher, and the license of this package gives no rights in the books or their content. To use this package effectively, we strongly recommend reading both books.

## Commands

```
npx @jiemurat/hyper-second-brain@latest <command> [options]

init      install the hsb-* skills into this project
update    replace the installed skills with this version, or files of the same version
          whose content differs (hsb-update runs it);
          with --agents, install them for another set of agents
remove    delete the installed skills, command files and .gitignore lines
status    installed version, newest version on npm, files changed by hand

--dir <path>     project folder (default: the current folder)
--agents <list>  agents,claude (default), windsurf, kiro, qwen, goose, all
--no-commands    no /hsb-* command files for Gemini CLI and OpenCode
--yes            overwrite or delete files changed by hand without asking
--dry-run        show what would change, write nothing
```

Exit status: 0 done, 1 error, 2 usage error, 3 files changed by hand (rerun with `--yes`).

The CLI writes only inside the skill and command folders it manages (and its block in `.gitignore`), keeps a manifest with a hash of every file, and does not overwrite or delete a file changed by hand without asking. `remove` leaves the project's own files (`HYPER-SECOND-BRAIN.md` and the `hyper-second-brain/` folder) untouched.

## Good to know

- The categories are the five PARA folders: categories of your own (for example only Hot and Cold) are not supported.
- No telemetry. The CLI goes online only for `status` (the npm registry); `HSB_OFFLINE=1` skips it.
- Git is optional. `hsb-doctor` shows whether git gives the vault a way back from mistakes; make sure the vault has one (git, a backup, or cloud sync with version history) before many files are moved.
- Word, Excel and PDF files are counted by `hsb-doctor`; it tells you when no converter (such as pandoc or LibreOffice) is on the PATH, because the agent may not read such files without one.

## Requirements

Node.js 18 or newer.

## Development

`core/` (scripts, templates, references) and `skills-src/` are the sources. `npm run build` writes `skills/`, which is committed; `npm run check-build` fails when it is stale. `npm test` runs the CLI, script and build tests; they pass on macOS with Node 18, 22, 24 and 26.

## License

MIT, for the code of this package and the maintainer's own text.
