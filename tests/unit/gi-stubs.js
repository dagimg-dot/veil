import { plugin } from "bun";
import { Button, Clutter, GLib, panel, St } from "./fakes.js";

// Unit tests run under Bun, where gi:// and Shell resource modules do not exist.
// Source files get these stand-ins; anything needing real GNOME belongs in tests/vm.
const stubs = {
    "gi://GLib": { default: GLib },
    "gi://Clutter": { default: Clutter },
    "gi://St": { default: St },
    "resource:///org/gnome/shell/ui/main.js": {
        get panel() {
            return panel;
        },
    },
    "resource:///org/gnome/shell/ui/panelMenu.js": { Button },
};

plugin({
    name: "gi-stubs",
    setup(build) {
        for (const [specifier, exports] of Object.entries(stubs)) {
            build.module(specifier, () => ({ exports, loader: "object" }));
        }
    },
});
