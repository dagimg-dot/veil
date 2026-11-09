import { plugin } from "bun";
import { Button, Clutter, GLib, panel, St } from "./fakes.js";

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
