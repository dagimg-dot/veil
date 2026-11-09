#!/usr/bin/env bash
set -euo pipefail

UUID=$(unzip -p /ext.zip metadata.json | jq -r .uuid)
EXT_DIR="$XDG_DATA_HOME/gnome-shell/extensions/$UUID"
mkdir -p "$EXT_DIR" && unzip -oq /ext.zip -d "$EXT_DIR" && glib-compile-schemas "$EXT_DIR/schemas"
MAJOR=$(gnome-shell --version | awk '{print $3}' | cut -d. -f1)
touch "$XDG_DATA_HOME/gnome-shell/update-check-$MAJOR"

gsettings set org.gnome.shell disable-user-extensions false
gsettings set org.gnome.shell disable-extension-version-validation true
gsettings set org.gnome.shell enabled-extensions "['$UUID']"
gsettings set org.gnome.shell welcome-dialog-last-shown-version '999'

pipewire >/tmp/pipewire.log 2>&1 &
wireplumber >/tmp/wireplumber.log 2>&1 &
sleep 1

echo "==> GNOME Shell $(gnome-shell --version | awk '{print $3}') with $UUID, in a devkit window"
export MUTTER_DEBUG_DUMMY_MODE_SPECS="${UI_SIZE:-1440x900}"
exec gnome-shell --devkit --wayland --no-x11
