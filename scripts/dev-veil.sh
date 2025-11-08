#!/bin/bash
set -euo pipefail

MOUNT_POINT="/mnt/host/veil"
HOST_SPEC="jd@10.242.163.81:/home/jd/JDrive/Projects/TYPESCRIPT/gnome-extensions/veil"

mkdir -p "$MOUNT_POINT"

if ! mountpoint -q "$MOUNT_POINT"; then
	sshfs "$HOST_SPEC" "$MOUNT_POINT" -o follow_symlinks
fi

cd "$MOUNT_POINT" || { echo "Failed to change directory to $MOUNT_POINT"; exit 1; }

# Replace the current process with an interactive shell so the CWD persists
exec "${SHELL:-/bin/bash}" -i
