## Development

### Overview

This extension uses a modern TypeScript-based development workflow with Bun and automated build scripts. The recommended setup involves:

- **Host machine**: Edit code, run linting/formatting and unit tests, and manage versions
- **VM environment**: Test the extension in a controlled GNOME session
- **Automated scripts**: Handle building, installation, VM setup, end-to-end tests, and development workflow

### Prerequisites

- **Host**: Bun, OpenSSH client, and Docker if you run the end-to-end tests without a VM
- **VM**: Linux distribution with GNOME 46 or newer on Wayland (I use Fedora)

### Development Scripts

The project includes several automation scripts in the `scripts/` directory:

**Fun fact:** the build uses [`esbuild-preserve-whitespace`](https://github.com/dagimg-dot/esbuild-preserve-whitespace), a plugin I made because I couldn't find an existing solution that keeps whitespace intact when transpiling GNOME Shell extensions. It's on npm if you need it! ☝️🤓

#### `scripts/build.sh` - Build and Package
Handles the complete build process:
- Compiles TypeScript files using esbuild
- Compiles GResource files and translations
- Creates the `.shell-extension.zip` package
- Supports installation, GDM restart, and unsafe reload (legacy)

#### `scripts/log.sh` - Log Monitoring
Monitors GNOME Shell logs for debugging:
- Follows the user journal, which carries both `gnome-shell` and the preferences window
- Supports filtered output showing only extension-related logs
- Automatically extracts extension name from `metadata.json`

#### `scripts/setup.sh` - VM Bootstrap
Automates VM setup for development:
- Generates `dev-{project}.sh` script for SSHFS mounting and VM access
- Copies development script to VM
- Installs `sshfs` and creates mount points
- Sets up proper permissions and SSHFS mounting
- Supports custom SSH ports via `-p/--port` (e.g. for GNOME Boxes port forwarding)

#### `scripts/run-dev-session.sh` - Nested Dev Session
Launches a development GNOME Shell session using `dbus-run-session`:
- Uses `--devkit --wayland` on GNOME 49+
- Falls back to `--nested --wayland` on older versions

#### `scripts/ui.sh` - GNOME Shell in a Window
Builds the extension and opens it in a disposable GNOME Shell 51 that runs in Docker and shows as a window on your Wayland desktop (see [Seeing It in a Window](#seeing-it-in-a-window)).

#### `scripts/vm-test.sh` - End-to-End Tests
Runs the suites in `tests/vm` against a real, headless GNOME Shell, either in a VM over SSH or in a Docker container (see [End-to-End Tests](#end-to-end-tests)).

#### `scripts/bump-version.js` - Version Management
Handles version bumping and releases:
- Updates `package.json` and `metadata.json` versions
- Creates git commits and tags
- Supports semantic versioning

### Development Workflow

#### 1. Host Machine Setup

**Install Dependencies:**
```bash
bun install  # Install all dependencies
```

**Code Quality Tools:**
```bash
bun format         # Format code with Biome
bun lint           # Lint with safe fixes
bun lint:fix       # Lint with unsafe fixes
bun check          # Combined lint + format check
bun check:types    # TypeScript type checking, then rejects any written any/unknown
bun test           # Unit tests
bun shexli         # Review the built dist/ with shexli
```

**Version Management:**
```bash
bun bump 0.5.0    # Bump version to 0.5.0
bun release 0.5.0 # Bump version, commit, and create git tag
```

#### 2. VM Environment Setup

**Initial VM Configuration:**
1. Install Fedora 41+ and log in
2. Enable **auto-login** so the session restarts automatically after GDM reloads:

   **GUI method**: Settings → Users → Automatic Login (ON)

   **Manual method**: edit `/etc/gdm/custom.conf` and add to the `[daemon]` section:
   ```ini
   [daemon]
   AutomaticLoginEnable=True
   AutomaticLogin=your-username
   ```
3. Install required tools:
   ```bash
   sudo dnf install -y fuse-sshfs gnome-extensions-app jq
   ```
4. Install Bun:
   ```bash
   curl -fsSL https://bun.sh/install | bash
   ```
5. Set up autostart for convenient development:
   - Add **GNOME Extensions** (`org.gnome.Extensions.desktop`) to autostart
   - Add a **Terminal** to autostart

**Bootstrap VM environment from Host:**
```bash
bun setup -- user@vm-ip  # Generate dev script, copy to VM, install sshfs
# or with custom port (e.g. GNOME Boxes):
bun setup -- -p 2222 user@localhost
```

**Run generated script in VM:**
```bash
~/dev-veil.sh  # Mount host directory via SSHFS and start shell
```

Once mounted, you are in the project directory at `/mnt/host/veil` with an interactive shell.

#### 3. Development Commands

**Build and Install (GNOME 49+ Wayland):**
```bash
bun build              # Build extension package only
bun build:install      # Build and install extension
bun build:install:gdm  # Build, install, then restart GDM to reload (auto-login required)
```

**Build and Install (Xorg / old workflow):**
```bash
bun dev            # Build, install, and unsafe-reload (Xorg only, legacy)
bun dev:nested     # Build, install, and start nested Wayland session
```

**Without a VM:**
```bash
bun ui             # Build, then open GNOME Shell with the extension in a window
```

**Debugging:**
```bash
bun log            # Monitor extension logs (filtered)
bun log:all        # Monitor all GNOME Shell logs
```

#### Typical Dev Loop (GNOME 49+ on Wayland)

1. Edit code on the **host**
2. On the **VM**, ensure the SSHFS mount is active (`~/dev-veil.sh`)
3. In the mounted directory on the VM:
   ```bash
   bun build:install:gdm
   ```
4. GDM restarts → VM auto-logs back in → extension is installed and active
5. Check logs:
   ```bash
   bun log
   ```

### Seeing It in a Window

`bun ui` is the quickest way to look at a change without a VM. It needs Docker and a Wayland desktop:

1. Builds `veil-vm-test:fedora-45` if it is missing, then `veil-vm-test:fedora-45-ui` on top of it from `scripts/ui/`, which adds Mutter's devkit viewer
2. Builds the extension
3. Starts GNOME Shell 51 with `--devkit` in a container that gets your Wayland socket and GPU, with the extension installed and enabled in a fresh home directory

The panel, the Veil indicator and the preferences window work as in a real session, and the shell's log streams to the terminal. Press Ctrl+C in its terminal, or run `docker rm -f veil-ui`, to stop it; run `bun ui` again after a change. `UI_SIZE=1920x1080 bun ui` sets the screen size (default `1440x900`).

### End-to-End Tests

`bun test:vm` runs the suites in `tests/vm` against a real GNOME Shell, driven entirely from the host:

1. Copies the current checkout to the target (rsync over SSH to `~/.cache/veil-vm-test/<checkout>/`, or into a container)
2. Builds the extension there and installs it into throwaway XDG directories
3. Starts an isolated **headless** GNOME Shell (`--headless --virtual-monitor`) on a private session bus, so your real session, extensions and settings are untouched and no GDM restart is needed
4. Installs a small test-only helper extension next to Veil, runs the suites through GNOME Shell's D-Bus API, the helper and Veil's settings, then fails a suite if the extension logged an error while it ran

**With a VM:** one-time setup:
```bash
# In the VM
sudo systemctl enable --now sshd

# On the host
ssh-copy-id -i ~/.ssh/your_key.pub user@vm-ip
```

Then add to `.env` (gitignored):
```ini
VM_TARGET=user@vm-ip
VM_SSH_KEY=~/.ssh/your_key
VM_SSH_PORT=22
```

**Without a VM (Docker):** `VM_TARGET=docker` runs the same suites in a container built from `tests/vm/docker/fedora-45.dockerfile` (GNOME Shell 51). No privileges or systemd are needed, and the first build downloads about 500 MB.

**Usage:**
```bash
bun test:vm                             # Run every suite on VM_TARGET
bun test:docker                         # Same as VM_TARGET=docker bun test:vm
bun test:docker tray                    # Only the tray suite
bun test:docker collapsed               # Tests whose name contains "collapsed", plus the earlier tests of their suite
VM_TARGET=docker:fedora-45 bun test:vm  # Pick an image from tests/vm/docker by name
VM_TEST_KEEP=1 bun test:vm              # Keep the logs even when everything passes
VM_TEST_DEBUG=1 bun test:vm             # Run the extension with debug logging
```

To test a PR, check it out in a git worktree and run `scripts/vm-test.sh` from there; each checkout gets its own copy on the VM.

The checkout is copied into the container rather than mounted, so `DOCKER_HOST=ssh://user@host` runs it on another machine. Logs from failed or kept runs are copied to `build/vm-test-logs/<image>/`. Extra `docker build` flags go in `VM_DOCKER_BUILD_ARGS`, for example a proxy. `VM_DOCKER_IMAGE=<tag>` skips the build and runs the suites in an existing image.

**Layout:**

| Path | Contents |
| --- | --- |
| `tests/vm/suites/*.js` | One file per area (`lifecycle`, `prefs`, `tray`); every file here is picked up automatically |
| `tests/vm/lib/harness.js` | `test`, `todo` (known gaps that don't fail the run), `skip`, `afterAll`, `allowLogged` (expected extension errors), `assert`, `waitFor`, `sleep` |
| `tests/vm/lib/shell.js` | Extension state and preferences over D-Bus, the extension's `Gio.Settings`, `evalInShell`, and fake tray items through the helper |
| `tests/vm/lib/pointer.js` | `clickAt(x, y)` and `pointAt(x, y)` through Mutter's RemoteDesktop API |
| `tests/vm/helper/` | The test-only extension: turns on unsafe mode for `org.gnome.Shell.Eval` and adds and inspects fake tray items |
| `tests/vm/runner.js` | Waits for the extension, runs the suites, and fails a suite if the extension logs errors while it runs |
| `tests/vm/run.sh`, `tests/vm/session.sh` | Build, isolate and start the headless shell (target side) |
| `tests/vm/docker/` | Container images for `VM_TARGET=docker`, one `<name>.dockerfile` per GNOME version, plus the entrypoint that starts the system bus |

**Adding a test:** create `tests/vm/suites/<area>.js`, or add to an existing one:

```js
import { test, waitFor } from "../lib/harness.js";
import { addTrayItem } from "../lib/shell.js";

test("a new item appears on the panel", () => {
    const item = addTrayItem("example");
    waitFor("the item", () => item.state().visible);
});
```

Tests run in order within a file, so later tests can build on earlier ones. Veil has no D-Bus API of its own, so suites look at the panel through the helper extension. Call `Gio.Settings.sync()` after writing settings the shell must see before the next step. Use `todo(name, reason, fn)` for a known bug: it doesn't fail the run while the bug exists, and fails once the test passes so it gets promoted.

**Unit tests vs end-to-end tests:** `bun test` runs the fast host-side unit tests (`tests/unit/*.test.js`) with `gi://` and Shell modules stubbed by `tests/unit/gi-stubs.js` and `tests/unit/fakes.js`. `bun test:vm` runs the suites against a real shell. Never name a VM suite `*.test.js`: `bun test` would pick it up and fail on its GNOME-only imports.

### Typing Rules

`bun check:types` runs `tsc`, then `scripts/check-no-any.js`, which rejects any written `any` or `unknown` in `src/` and `ambient.d.ts`, including inside a cast. So:

- Template children are declared on the class: `declare _resetButton: Gtk.Button;`
- Shell internals missing from the typings get a small interface in `src/types/index.ts`, such as `GesturePanelButton`
- String settings with a fixed set of values go through a reader in `src/utils/settings.ts`
- A `catch` value handed to the logger is cast to `LogError`

### How Veil Tracks Panel Items

Tray applets live in a **container** on the panel. Other extensions hide their icon either by setting `container.visible` to `false` or by removing the actor altogether.

Veil shows and hides items by changing `container.visible` (plus opacity and translation when animating) on the entries it knows about. It records whether an item was already hidden when it last reconciled the tray (`originalVisible`), so it does not force back on an icon whose own extension hid it.

### Project Structure

- **`src/`**: TypeScript source files
- **`dist/`**: Compiled JavaScript (auto-generated)
- **`build/`**: Build artifacts and packages (gitignored)
- **`scripts/`**: Development automation scripts
- **`tests/`**: Unit tests and end-to-end suites
- **`data/`**: Static resources (icons, UI files)

### Notes

- Build artifacts are automatically placed in `build/` directory
- The `dist/` directory contains compiled JavaScript when using TypeScript
- Biome handles all linting and formatting; `dist/` and `build/` are excluded
- Generated `scripts/dev-*.sh` files are gitignored; each developer or environment generates their own via `bun setup`
- GDM restart (`systemctl restart gdm`) logs out the session, so make sure **auto-login** is enabled in the VM so the session comes back without manual login
