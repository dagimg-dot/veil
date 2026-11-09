# The test image plus what a visible session needs: the devkit viewer, matched exactly to mutter.
# Evolution, Online Accounts and the volume monitors are removed so the shell never starts them.
ARG BASE=veil-vm-test:fedora-45
FROM ${BASE}
USER root
RUN key=$(rpm -q gpg-pubkey --qf '%{VERSION}\n' | head -1 | tail -c 9) && \
    set -- $(rpm -q --qf '%{VERSION} %{RELEASE} %{ARCH}' mutter) && \
    rpm -i "https://kojipkgs.fedoraproject.org/packages/mutter/$1/$2/data/signed/$key/$3/mutter-devkit-$1-$2.$3.rpm"
RUN cd /usr/share/dbus-1/services && \
    rm -f org.gnome.evolution.dataserver.*.service org.gnome.OnlineAccounts.service org.gnome.Identity.service \
        org.gtk.vfs.GoaVolumeMonitor.service org.gtk.vfs.UDisks2VolumeMonitor.service
COPY session.sh /usr/local/bin/ui-session
