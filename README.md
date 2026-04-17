<div align="center" style="margin-bottom: 40px;">
  <h1>Veil - A cleaner, quieter GNOME panel</h1>
</div>

<p align="center" style="margin-bottom: 30px;">
<img src="./src/assets/icons/arrow-close.svg" alt="Veil" width="100">
</p>

<!-- download badge -->
  <p align="center" style="margin-bottom: 30px;">
    <a href="https://github.com/dagimg-dot/veil/releases/latest">
      <img src="https://img.shields.io/github/v/release/dagimg-dot/veil?label=Download&style=for-the-badge" alt="Download">
    </a>
    <a href="https://github.com/dagimg-dot/veil/releases">
      <img src="https://img.shields.io/github/downloads/dagimg-dot/veil/total?label=Downloads&style=for-the-badge" alt="Downloads">
    </a>
  </p>

<p align="center" style="margin-bottom: 30px;">
  <img src="./public/preview.gif" alt="Veil" width="400">
</p>

Veil is a GNOME shell extension that allows you to hide items on your GNOME panel. 

It is a modern successor to <a href="https://github.com/fablevi/HideItems">Hide Items</a>, and is designed to make your GNOME panel cleaner and quieter.

## Features

- **Selective tray** — When collapsed, only the status icons you pick stay visible on the right; the rest stay hidden until you open the tray again.
- **Click or hover** — **Click** mode uses the Veil indicator as a toggle. **Hover** mode briefly shows every tray icon while the pointer is over the status area, then restores the collapsed layout when you leave.
- **Auto-hide (click mode)** — Optionally collapse the tray again automatically after a delay so it doesn’t stay open indefinitely.
- **Animations** — Optional fade/slide when hiding and showing items; duration and scope are configurable.
- **Tighter status spacing** — Lower the default horizontal padding between top-bar indicators so the right cluster uses less width, without changing which icons exist.
- **Coexists with other applets** — Remembers icons that were already hidden by their own extension and does not force them back on when the tray expands.

## Installation

1. Download the `.shell-extension.zip` file from the [latest release](https://github.com/dagimg-dot/veil/releases/latest)
2. Install using: `gnome-extensions install --force <filename>`
3. Restart GNOME Shell or log out/in
4. Enable the extension in GNOME Extensions app

## Development

See [DEVELOPMENT.md](./DEVELOPMENT.md) for development instructions.

## Credits

Status-area horizontal spacing is adapted from [Status Area Horizontal Spacing](https://gitlab.com/p91paul/status-area-horizontal-spacing-gnome-shell-extension) (original extension by Amy Chan / mathematical.coffee@gmail.com; maintained on GitLab by p91paul).

## Panel items in the screenshot

Panel icons shown in the preview come from these extensions:

- [Activity Watch](https://activitywatch.net)
- [Net Speed Simplified](https://extensions.gnome.org/extension/3724/net-speed-simplified/)
- [Astra Monitor](https://extensions.gnome.org/extension/6682/astra-monitor/)
- [Pop Shell](https://github.com/pop-os/shell)
- [Power Indicator](https://extensions.gnome.org/extension/1501/power-indicator/)
- [Easy Effects Preset Switcher](https://github.com/wwmm/easyeffects)

### How other extensions hide status icons

Tray applets usually live in a **container** on the panel. Other extensions typically hide their icon in one of two ways:

1. **Visibility** — They keep the actor in the tree and set `container.visible` to `false` (or equivalent), so the slot still exists but nothing is drawn.
2. **Removal** — They **remove or destroy** the tray actor (or never add it), so there is no container for Veil to target until the extension adds it again.

### How Veil works

Veil shows and hides panel items by changing **`container.visible`** (and related presentation like opacity/animation) on tray entries it already knows about. It also records whether an item was **already hidden** when Veil last reconciled the tray (`originalVisible`), so it does not force icons back on that their own extension meant to hide.

### If an icon does not behave as you expect

Some extensions hide their icon in a way Veil does not see as “already hidden” at the moment Veil builds its list (for example, if the ordering or lifecycle differs from a simple `visible = false` on the container Veil tracks).

**Workaround:** Turn **Veil off**, use the **other extension’s own settings** to hide its panel icon, then turn **Veil on** again. Veil will then treat that item as externally hidden and will not reveal it when Veil expands the tray.