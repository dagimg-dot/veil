# Veil - GNOME Shell Extension

## Code Quality (run after every change)
- `bun run check` - Lint + format
- `bun run check:types` - TypeScript type checking, then rejects any written `any`/`unknown`
- `bun run test` - Unit tests

Do NOT run build commands on the host. To check behaviour in a real shell, use `bun test:docker` (builds inside a throwaway container).

## Project Structure
- `src/extension.ts` - Main entry point
- `src/core/` - StateManager, PanelManager, AnimationManager
- `src/utils/settings.ts` - Typed readers for settings with a fixed set of values
- `src/components/indicator.ts` - Panel toggle button
- `src/prefs/` - Preferences pages (GeneralPage, ItemsPage, AboutPage)
- `src/schemas/` - GSettings schema (org.gnome.shell.extensions.veil.gschema.xml)
- `tests/unit/` - `bun test` with GNOME modules stubbed (`gi-stubs.js`, `fakes.js`)
- `tests/vm/` - Suites against a real headless GNOME Shell (`bun test:vm`, `bun test:docker`)

## VM Development
- SSH tunnel required: `ssh -f -N -R 2222:localhost:22 user@host`
- Setup with port: `bun setup -- -p 2222 jdev@localhost`
- Generated script: `~/dev-veil.sh` mounts host directory

## Key Patterns
- GSettings keys defined in `src/schemas/org.gnome.shell.extensions.veil.gschema.xml`
- UI built with Adwaita (libadwaita) via `.ui` templates in `src/ui/`
- Panel manipulation via `MainPanel._rightBox` ( GNOME internals)
- Animation uses Clutter transitions (slide + fade)
- No `any` or `unknown`: template children are `declare`d on the class, shell internals get an interface in `src/types/index.ts`
- A known bug gets a `todo()` VM test; it fails once fixed, so promote it to `test()`

## Important Notes
- Visual and feel checks still need a look: `bun ui` opens GNOME Shell in a window
- Build artifacts go to `build/` (gitignored)
- `dist/` is also gitignored (compiled JS)