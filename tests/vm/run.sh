#!/usr/bin/env bash
set -euo pipefail

cd -- "$(dirname "$0")/../.."
ROOT="$PWD"
UUID=$(jq -r .uuid metadata.json)
VERSION=$(jq -r .version package.json)

echo "==> Building in VM ($(gnome-shell --version))"
bun install >/dev/null
./scripts/build.sh --build >/dev/null

WORK=$(mktemp -d /tmp/veil-vm-test.XXXXXX)
for dir in data config cache state runtime; do
	mkdir -p "$WORK/$dir"
done
chmod 700 "$WORK/runtime"
export XDG_DATA_HOME="$WORK/data"
export XDG_CONFIG_HOME="$WORK/config"
export XDG_CACHE_HOME="$WORK/cache"
export XDG_STATE_HOME="$WORK/state"
export XDG_RUNTIME_DIR="$WORK/runtime"

EXT_DIR="$XDG_DATA_HOME/gnome-shell/extensions/$UUID"
mkdir -p "$EXT_DIR"
unzip -q "build/$UUID.shell-extension-v$VERSION.zip" -d "$EXT_DIR"
glib-compile-schemas "$EXT_DIR/schemas"

# Gives the suites access to panel state; see tests/vm/helper/extension.js
HELPER_UUID=$(jq -r .uuid tests/vm/helper/metadata.json)
cp -r tests/vm/helper "$XDG_DATA_HOME/gnome-shell/extensions/$HELPER_UUID"

# Without this marker the shell delays loading extensions on an extensions.gnome.org update check
MAJOR=$(gnome-shell --version | awk '{print $3}' | cut -d. -f1)
touch "$XDG_DATA_HOME/gnome-shell/update-check-$MAJOR"

export VM_TEST_ROOT="$ROOT" VM_TEST_WORK="$WORK" VM_TEST_UUID="$UUID" VM_TEST_HELPER_UUID="$HELPER_UUID"
unset DBUS_SESSION_BUS_ADDRESS WAYLAND_DISPLAY DISPLAY

session_pids() {
	local env
	for env in /proc/[0-9]*/environ; do
		if grep -qzx "VM_TEST_WORK=$WORK" "$env" 2>/dev/null; then
			env=${env#/proc/}
			echo "${env%/environ}"
		fi
	done
}

stop_session_processes() {
	local pids
	pids=$(session_pids)
	[ -n "$pids" ] && kill $pids 2>/dev/null
	for _ in $(seq 1 50); do
		[ -z "$(session_pids)" ] && break
		sleep 0.1
	done
	fusermount -uz "$WORK/runtime/doc" 2>/dev/null || true
}

set +e
dbus-run-session -- bash "$ROOT/tests/vm/session.sh" 3>&1 >>"$WORK/session.log" 2>&1
STATUS=$?
set -e

unset VM_TEST_ROOT VM_TEST_WORK VM_TEST_UUID VM_TEST_HELPER_UUID
stop_session_processes
if [ "$STATUS" -ne 0 ] || [ "${VM_TEST_KEEP:-0}" = 1 ]; then
	echo "Logs kept in $WORK (gnome-shell.log, session.log)"
else
	rm -rf "$WORK"
fi

exit "$STATUS"
