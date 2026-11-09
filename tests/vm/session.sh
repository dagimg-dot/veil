#!/usr/bin/env bash
set -uo pipefail

export VM_TEST_LOG="$VM_TEST_WORK/gnome-shell.log"
export WAYLAND_DISPLAY="veil-test-0"
export GDK_DISABLE=gl,vulkan GDK_DEBUG=no-portals GTK_A11Y=none
export XDG_CURRENT_DESKTOP=GNOME

gsettings set org.gnome.shell disable-user-extensions false
# Lets the suites run on a shell newer than metadata.json lists
gsettings set org.gnome.shell disable-extension-version-validation true
gsettings set org.gnome.shell enabled-extensions "['$VM_TEST_UUID', '$VM_TEST_HELPER_UUID']"
gsettings set org.gnome.shell welcome-dialog-last-shown-version '999'
gsettings set org.gnome.desktop.interface enable-hot-corners false

if [ "${VM_TEST_DEBUG:-0}" = 1 ]; then
	GSETTINGS_SCHEMA_DIR="$XDG_DATA_HOME/gnome-shell/extensions/$VM_TEST_UUID/schemas" \
		gsettings set "$(jq -r '."settings-schema"' "$VM_TEST_ROOT/metadata.json")" logging-level debug
fi

echo "==> Starting headless GNOME Shell" >&3
gnome-shell --headless --wayland --no-x11 \
	--virtual-monitor 1280x800 \
	--wayland-display "$WAYLAND_DISPLAY" >"$VM_TEST_LOG" 2>&1 &
SHELL_PID=$!
trap 'kill "$SHELL_PID" 2>/dev/null; wait "$SHELL_PID" 2>/dev/null' EXIT

if ! gdbus wait --session --timeout 30 org.gnome.Shell; then
	echo "GNOME Shell did not start:" >&3
	tail -n 40 "$VM_TEST_LOG" >&3
	exit 1
fi

gjs -m "$VM_TEST_ROOT/tests/vm/runner.js" >&3
