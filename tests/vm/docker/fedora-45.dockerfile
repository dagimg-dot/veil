# GNOME Shell 51 for the VM suites, run by `VM_TARGET=docker bun test:vm`.
# Package pins follow ddterm/gnome-shell-image (MIT), which maps one Fedora release to one GNOME version.
FROM quay.io/fedora/fedora:45

ARG GNOME_SHELL_VERSION=51.0-1.fc45
ARG MUTTER_VERSION=51.0-1.fc45
ARG GJS_VERSION=1.90.0-1.fc45
ARG BUN_VERSION=1.4.0

RUN printf 'fastestmirror=True\nmax_parallel_downloads=10\n' >>/etc/dnf/dnf.conf && \
    dnf config-manager setopt updates-testing.enabled=false && \
    dnf install -y --nodocs --setopt install_weak_deps=False \
        "gnome-shell-$GNOME_SHELL_VERSION" "mutter-$MUTTER_VERSION" "gjs-$GJS_VERSION" \
        gtk4 libadwaita dbus-daemon dbus-tools mesa-dri-drivers mesa-libEGL \
        glib2-devel gettext jq zip unzip procps-ng findutils && \
    rpm -q "gnome-shell-$GNOME_SHELL_VERSION" "mutter-$MUTTER_VERSION" "gjs-$GJS_VERSION" && \
    dnf clean all -y

RUN case "$(uname -m)" in aarch64) arch=aarch64 ;; *) arch=x64 ;; esac && \
    curl -fsSLo /tmp/bun.zip "https://github.com/oven-sh/bun/releases/download/bun-v$BUN_VERSION/bun-linux-$arch.zip" && \
    unzip -qj /tmp/bun.zip -d /usr/local/bin && \
    rm /tmp/bun.zip && \
    bun --version

RUN useradd -m tester && \
    install -d -o tester -g tester /home/tester/repo /home/tester/.bun/install/cache

COPY entrypoint.sh /usr/local/bin/vm-test-entrypoint
ENTRYPOINT ["/usr/local/bin/vm-test-entrypoint"]
