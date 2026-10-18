# Changelog: hyper-second-brain standard

hsb-update reads the version recorded in a project's `hyper-second-brain/.manifest.json`, compares it with the entries below, and runs the steps of every newer version, oldest first. hsb-doctor stops and points to hsb-update when the project's version is older than the installed skills.

Entry format: `## <version>`, one or two sentences on what changed, then numbered steps in the form `<n>. <kind> (<id>): what to do. Done when <condition>.` The kinds are `mechanical` (the update script runs it and it changes no meaning), `structural` (done as a plan with the user's yes), and `by hand` (the agent does it from this text). Every step also has an entry with the same id in the script `migrations.mjs`.

## 1.0.0

First version. No migration steps: hsb-init sets a project up at this standard.
