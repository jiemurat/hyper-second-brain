// migrations.mjs - the migration steps of the hyper-second-brain standard, one entry per step.
// hsb-update runs the steps of every version after the project's own, oldest first.
// { version, id, kind: 'mechanical' | 'structural' | 'by-hand', description, run(ctx) }
// A `mechanical` step has run(ctx) (ctx: { root, folder, manifest }) and changes no meaning;
// a `structural` or `by-hand` step is described for the agent and done with the user.
// Every version here has an entry in references/changelog.md.
export const MIGRATIONS = [];
