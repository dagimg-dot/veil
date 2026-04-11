# Veil - GNOME Shell Extension

## Code Quality (run after every change)
- `bun run check` - Lint + format check
- `bun run check:types` - TypeScript type checking only

Do NOT run build commands - testing is done manually.

## Project Structure
- `src/extension.ts` - Main entry point
- `src/core/` - StateManager, PanelManager, AnimationManager
- `src/components/indicator.ts` - Panel toggle button
- `src/prefs/` - Preferences pages (GeneralPage, ItemsPage, AboutPage)
- `src/schemas/` - GSettings schema (org.gnome.shell.extensions.veil.gschema.xml)

## VM Development
- SSH tunnel required: `ssh -f -N -R 2222:localhost:22 user@host`
- Setup with port: `bun setup -- -p 2222 jdev@localhost`
- Generated script: `~/dev-veil.sh` mounts host directory

## Key Patterns
- GSettings keys defined in `src/schemas/org.gnome.shell.extensions.veil.gschema.xml`
- UI built with Adwaita (libadwaita) via `.ui` templates in `src/ui/`
- Panel manipulation via `MainPanel._rightBox` ( GNOME internals)
- Animation uses Clutter transitions (slide + fade)

## Important Notes
- No automated tests - manual testing in VM required
- Build artifacts go to `build/` (gitignored)
- `dist/` is also gitignored (compiled JS)