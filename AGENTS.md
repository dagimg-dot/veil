## Cursor Cloud specific instructions

Veil is a GNOME Shell extension written in TypeScript. It compiles to a `.shell-extension.zip` via esbuild. The runtime target is GJS (GNOME JavaScript), not Node.js — the extension runs inside GNOME Shell.

### Quick reference

- **Package manager:** Bun (lockfile: `bun.lock`)
- **Lint/format:** `bun check` (Biome)
- **Type check:** `bun check:types` (tsc --noEmit)
- **Build:** `bun run build` (compiles TS + resources + zip)
- See `DEVELOPMENT.md` and `package.json` scripts for the full list.

### Non-obvious caveats

- `glib-compile-resources` (from `libglib2.0-dev`) must be installed on the system for the build to succeed. The `zip` and `gettext` packages are also needed.
- The build script (`scripts/build.sh`) auto-runs `bun install` if `node_modules/` is missing, but it's better to run `bun install` explicitly first.
- There are no automated tests (unit/integration) in this project. Validation is done through lint, type checking, and building the extension package.
- End-to-end testing requires a running GNOME Shell 46+ desktop (ideally in a Fedora VM on Xorg). This is not available in the cloud agent environment. The build artifact (`.shell-extension.zip`) is the main deliverable.
- `bun build` in `package.json` maps to `./scripts/build.sh --build`, not to `bun`'s native bundler.
