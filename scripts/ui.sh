#!/usr/bin/env bash
set -euo pipefail

cd -- "$(dirname "$0")/../"

if [ -z "${WAYLAND_DISPLAY:-}" ] || [ ! -S "${XDG_RUNTIME_DIR:-}/$WAYLAND_DISPLAY" ]; then
	echo "bun ui opens GNOME Shell as a window on your Wayland desktop, but no Wayland socket was found"
	exit 1
fi

BASE_IMAGE=veil-vm-test:fedora-45
UI_IMAGE=veil-vm-test:fedora-45-ui
CONTAINER=veil-ui

if ! docker image inspect "$BASE_IMAGE" >/dev/null 2>&1; then
	echo "==> Building $BASE_IMAGE (the first build downloads GNOME Shell)"
	docker build -t "$BASE_IMAGE" -f tests/vm/docker/fedora-45.dockerfile tests/vm/docker
fi

echo "==> Building $UI_IMAGE"
docker build -q --build-arg BASE="$BASE_IMAGE" -t "$UI_IMAGE" scripts/ui >/dev/null

echo "==> Building the extension"
./scripts/build.sh --build >/dev/null
ZIP="$PWD/build/$(jq -r .uuid metadata.json).shell-extension-v$(jq -r .version package.json).zip"

GPU=()
[ -e /dev/dri ] && GPU=(--device /dev/dri)
TTY=()
[ -t 0 ] && [ -t 1 ] && TTY=(-it)

docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
echo "==> Opening GNOME Shell (Ctrl+C or docker rm -f $CONTAINER stops it)"
exec docker run --rm "${TTY[@]}" --name "$CONTAINER" --user root --tmpfs /run/systemd "${GPU[@]}" \
	-v "$XDG_RUNTIME_DIR/$WAYLAND_DISPLAY":/run/host-wayland/wayland-0 \
	-v "$ZIP":/ext.zip:ro \
	-e HOST_UID="$(id -u)" -e UI_SIZE="${UI_SIZE:-1440x900}" \
	--entrypoint bash "$UI_IMAGE" -c '
		useradd -m -u "$HOST_UID" viewer 2>/dev/null
		mkdir -p /run/dbus && dbus-daemon --system --fork
		exec runuser -u viewer -- env UI_SIZE="$UI_SIZE" bash -c "
			export XDG_RUNTIME_DIR=/tmp/xdg-run XDG_DATA_HOME=\$HOME/.local/share XDG_CURRENT_DESKTOP=GNOME
			mkdir -p \$XDG_RUNTIME_DIR \$XDG_DATA_HOME && chmod 700 \$XDG_RUNTIME_DIR
			export WAYLAND_DISPLAY=/run/host-wayland/wayland-0 GDK_DEBUG=no-portals
			exec dbus-run-session -- ui-session"'
