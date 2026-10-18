# Tags and links

The standard of this vault for tags, link properties, and maps of content (MOCs). The skill `hsb-connect` keeps it, and every skill that creates or places a note follows it. Add a tag, a prefix, or a link property to its table, with its meaning, before any note uses it. Keep the table headings and the first column as they are: the script `connect.mjs` reads them. Write the meanings in the language of the vault.

## Settings

| Setting | Value |
|---|---|
| Home page | none |
| Excluded | none |
| Documents | with properties |

## Prefixes

| Prefix | Meaning | Per note | Soft limit |
|---|---|---|---|
| `type/` | What the note is: a meeting, a quote, a book note, a map of content | one | 20 |
| `topic/` | What the note is about | any | 60 |
| `status/` | The state of a note when its folder does not say it: a draft, a superseded version, a backup | any | 10 |

## Tags

| Tag | Meaning |
|---|---|
| `type/moc` | A map of content: a note that lists the notes of a section, grouped |

## Old tags

| Old tag | New tag |
|---|---|

## Link properties

| Property | Meaning |
|---|---|
| `up` | The parent: the MOC the note belongs to, or the `_about.md` of its folder when the folder has no MOC |
| `related` | A note with a direct relation: another version, the minutes and the transcript of one meeting, a quote and its author; never a similar topic |
| `source` | Where the note came from: a book, a meeting, a web page |
