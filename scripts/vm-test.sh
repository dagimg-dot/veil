#!/usr/bin/env bash
set -euo pipefail

cd -- "$(dirname "$0")/../"

if [ -f .env ]; then
	while IFS='=' read -r key value; do
		if [[ "$key" == VM_* ]] && [ -z "${!key:-}" ]; then
			export "$key=$value"
		fi
	done <.env
fi

if [ -z "${VM_TARGET:-}" ]; then
	echo "Set VM_TARGET in the environment or .env:"
	echo "  VM_TARGET=user@vm-ip         run on a VM over SSH"
	echo "  VM_TARGET=docker[:image]     run in a container (images: tests/vm/docker/*.dockerfile, default fedora-45)"
	echo "Usage: $0 [filter...]  (suite names, or words from test names)"
	exit 1
fi

EXCLUDES=(.git node_modules build dist .DS_Store .env 'scripts/dev-*.sh')

run_docker() {
	local image=${VM_TARGET#docker}
	image=${image#:}
	image=${image:-fedora-45}
	local tag="veil-vm-test:$image"

	if [ -n "${VM_DOCKER_IMAGE:-}" ]; then
		# A prebuilt image, e.g. one built earlier with extra packages
		tag=$VM_DOCKER_IMAGE
		echo "==> Using $tag"
	else
		local dockerfile="tests/vm/docker/$image.dockerfile"
		if [ ! -f "$dockerfile" ]; then
			echo "No $dockerfile (available: $(cd tests/vm/docker && ls -- *.dockerfile | sed 's/\.dockerfile$//' | xargs))"
			exit 1
		fi

		echo "==> Building $tag (the first build downloads GNOME Shell)"
		# VM_DOCKER_BUILD_ARGS adds docker build flags, e.g. a proxy or --add-host for a bad DNS answer
		# shellcheck disable=SC2086
		docker build ${VM_DOCKER_BUILD_ARGS:-} -t "$tag" -f "$dockerfile" tests/vm/docker
	fi

	# Global so the EXIT trap still sees it
	CID=$(docker create --tmpfs /run/systemd \
		-v veil-vm-test-bun-cache:/home/tester/.bun/install/cache \
		-e VM_TEST_KEEP="${VM_TEST_KEEP:-0}" -e VM_TEST_DEBUG="${VM_TEST_DEBUG:-0}" \
		-e VM_TEST_FILTER="$*" "$tag")
	trap 'docker rm -f "$CID" >/dev/null' EXIT

	# The source is copied in rather than bind-mounted, so a remote DOCKER_HOST works too
	echo "==> Copying $(git rev-parse --abbrev-ref HEAD 2>/dev/null || basename "$PWD") into the container"
	tar -c "${EXCLUDES[@]/#/--exclude=}" -f - . | docker cp - "$CID:/home/tester/repo"

	local status=0
	docker start -a "$CID" || status=$?

	if [ "$status" -ne 0 ] || [ "${VM_TEST_KEEP:-0}" = 1 ]; then
		local logs="build/vm-test-logs/$image"
		rm -rf "$logs"
		mkdir -p "$logs"
		docker cp "$CID:/tmp" - 2>/dev/null |
			tar -x -C "$logs" --strip-components=1 --wildcards 'tmp/veil-vm-test.*' 2>/dev/null || true
		echo "Container logs copied to $logs"
	fi
	exit "$status"
}

run_ssh() {
	local ssh_opts=(-o BatchMode=yes -o ConnectTimeout=10 -p "${VM_SSH_PORT:-22}")
	if [ -n "${VM_SSH_KEY:-}" ]; then
		ssh_opts+=(-i "${VM_SSH_KEY/#\~/$HOME}")
	fi

	local remote_dir
	remote_dir=".cache/veil-vm-test/$(basename "$PWD")"

	echo "==> Syncing $(git rev-parse --abbrev-ref HEAD 2>/dev/null || basename "$PWD") to $VM_TARGET"
	ssh "${ssh_opts[@]}" "$VM_TARGET" mkdir -p "$remote_dir"
	rsync -az --delete -e "ssh ${ssh_opts[*]}" \
		"${EXCLUDES[@]/#/--exclude=}" \
		./ "$VM_TARGET:$remote_dir/"

	# The script goes over stdin so the VM's login shell (possibly fish) never parses it
	{
		printf 'export VM_TEST_KEEP=%q VM_TEST_DEBUG=%q VM_TEST_FILTER=%q\n' \
			"${VM_TEST_KEEP:-0}" "${VM_TEST_DEBUG:-0}" "$*"
		printf 'export PATH="$HOME/.bun/bin:$PATH"\n'
		printf 'exec bash "$HOME"/%q/tests/vm/run.sh </dev/null\n' "$remote_dir"
	} | ssh "${ssh_opts[@]}" "$VM_TARGET" bash -s
}

case "$VM_TARGET" in
docker | docker:*) run_docker "$@" ;;
*) run_ssh "$@" ;;
esac
