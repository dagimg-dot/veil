#!/usr/bin/env bash
set -euo pipefail

# GNOME Shell exits without a system bus. scripts/vm-test.sh also mounts an empty /run/systemd,
# so the shell picks its logind-less login manager instead of asking for logind, which cannot run here.
mkdir -p /run/dbus
dbus-daemon --system --fork

chown -R tester:tester /home/tester/repo
exec runuser -u tester -- bash /home/tester/repo/tests/vm/run.sh
