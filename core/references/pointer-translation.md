# Translating the pointer line

The pointer line leads the agent from an instruction file to `HYPER-SECOND-BRAIN.md`. In a file whose prose is not in English, it is written in the language of that file.

1. Translate the English line that the plan prints into the language of the file. Keep the path `HYPER-SECOND-BRAIN.md` and the skill name `hsb-place-an-item` exactly as they are, keep the meaning of the English line, and keep it on one line, without any marker (`<!-- … -->`): the script adds the markers.
2. Put the line into a quoted here-document, which keeps the backticks and apostrophes in it from needing any escaping:

   ```
   LINE=$(cat <<'EOF'
   <the translated line>
   EOF
   )
   ```

3. Add `--pointer-text "<file>=$LINE"` to the script's command, once per file, with `<file>` as the plan prints it (`AGENTS.md` or `CLAUDE.md`).

Done when each translated line names `HYPER-SECOND-BRAIN.md` and `hsb-place-an-item`, fits on one line, and goes to the script with `--pointer-text`.
