# veil

A GNOME Shell extension that hides the status icons you don't need and keeps the top panel quiet.

`vicinae-gnome-extension` and `EthCal`, one level up, are sibling extensions on the same scaffold.
They are reference: check them before inventing a pattern and port pieces on purpose. Some files
are newer in one than the other, so check which way each difference goes.

## Stack

- Bun, TypeScript strict and esbuild without bundling, running under GJS on GNOME Shell 46 to 51.
- Types from `@girs/gjs` and `@girs/gnome-shell`. Biome for lint and format.
- Preferences are Adwaita pages built from `.ui` templates in `src/ui`.
- Tests: `bun test` for units, and suites against a real headless GNOME Shell over SSH or Docker.

## Rules

- **Checks.** After every change run `bun run check`, `bun run check:types` and `bun run test`.
- **Building.** Never run build commands on the host. `bun test:docker` builds inside a throwaway
  container and checks behaviour in a real shell. `bun ui` opens GNOME Shell in a window for
  visual and feel checks. `build/` and `dist/` are generated and gitignored.
- **Layout.** `src/extension.ts` wires everything together. `src/core` holds `StateManager`,
  `PanelManager`, `AnimationManager` and the status area spacing, `src/components/indicator.ts`
  the panel button, `src/prefs` the preferences pages and `src/utils` the logger and settings
  readers.
- **Tray state.** `StateManager` owns whether the tray is revealed and saves it through GSettings.
  `PanelManager` applies it to the containers in `MainPanel._rightBox`. Hover is temporary and
  never writes to `StateManager`. Veil records what it hid in `hiddenByVeil`: any other hidden
  container was hidden by its owner, and Veil does not reveal it.
- **Settings.** Every key is defined in `src/schemas/org.gnome.shell.extensions.veil.gschema.xml`;
  keep the keys and the preferences UI in sync. A string setting with a fixed set of values goes
  through a reader in `src/utils/settings.ts`.
- **Typing.** No written `any` or `unknown`, and `check:types` fails on one. Template children are
  `declare`d on the class. Shell internals missing from the typings get an interface in
  `src/types/index.ts`. A `catch` value handed to the logger is cast to `LogError`.
- **Signals and sources.** Everything connected or scheduled in `enable` is released in `disable`.
  Shell-side signals use `connectObject` with an owner and `disconnectObject`; plain `connect` is
  for `src/prefs`, where `connectObject` does not exist.
  An applet can be destroyed before its container leaves the box, so never touch a child after its
  `destroy`.
- **Animation.** Clutter transitions, slide and fade, through `AnimationManager`. Every transition
  sets `remove-on-complete`, or `transitions-completed` never fires. Only mapped actors animate.
- **Tests.** Unit tests live in `tests/unit`, with GNOME modules stubbed by `gi-stubs.js` and
  `fakes.js`. Anything needing real Clutter belongs in `tests/vm`, and a VM suite is never named
  `*.test.js`. A known bug gets a `todo()` VM test, which fails once fixed so it gets promoted to
  `test()`.
- **VM development.** A reverse tunnel gives the VM the host: `ssh -f -N -R 2222:localhost:22
  user@host`. `bun setup -- -p 2222 jdev@localhost` generates `~/dev-veil.sh`, which mounts the
  host directory.

## Code style

- Biome: four spaces from `.editorconfig`, double quotes, organised imports. Imports keep their
  `.js` extensions. TypeScript strict.
- No comments in code. A doc comment only when the code cannot say it itself.
- No code that isn't needed: delete unused helpers, options and fields rather than keep them for
  later.

## Docs

- Documents are Markdown: plain prose and tables, no em-dashes.
- Put decisions to the user as choices, not as open lists inside documents.

## Commits

- Commit only when asked, push only when asked, through the `/commit` skill. Keep each commit
  atomic.
- Present tense, a semantic prefix (`feat:`, `fix:`, `refactor:`, `docs:`, `build:`, `chore:`),
  a body of 2 or 3 sentences at most.
- No `Co-authored-by:` or attribution footers.
- Before committing run `bun run check`, `bun run check:types` and `bun run test`.
