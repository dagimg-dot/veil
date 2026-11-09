import Gio from "gi://Gio";
import { afterAll, assert, sleep, test, waitFor } from "../lib/harness.js";
import { clickAt } from "../lib/pointer.js";
import {
    addTrayItem,
    extensionSettings,
    itemCenter,
    setTrayRevealed,
    trayRevealed,
    waitForItemVisible,
} from "../lib/shell.js";

const settings = extensionSettings();
const KEYS = [
    "animation-enabled",
    "interaction-mode",
    "auto-hide-enabled",
    "auto-hide-duration",
];

function apply(write) {
    write();
    Gio.Settings.sync();
    sleep(150);
}

afterAll(() => {
    for (const key of KEYS) settings.reset(key);
    Gio.Settings.sync();
});

apply(() => {
    settings.set_string("interaction-mode", "click");
    settings.set_boolean("animation-enabled", false);
    settings.set_boolean("auto-hide-enabled", false);
});

test("expanding collapses the tray again after the delay", () => {
    setTrayRevealed(false);
    apply(() => {
        settings.set_boolean("auto-hide-enabled", true);
        settings.set_int("auto-hide-duration", 1);
    });
    const item = addTrayItem("auto-hide-basic");
    setTrayRevealed(true);
    waitForItemVisible(item, true);
    waitFor("auto-hide to collapse the tray", () => !trayRevealed(), 4000);
    waitForItemVisible(item, false);
});

test("collapsing by hand cancels the running timer", () => {
    apply(() => settings.set_int("auto-hide-duration", 3));
    setTrayRevealed(true);
    setTrayRevealed(false);
    sleep(1000);
    setTrayRevealed(true);
    sleep(2000);
    assert.ok(trayRevealed(), "the first timer collapsed the tray");
    waitFor(
        "the second timer to collapse the tray",
        () => !trayRevealed(),
        4000,
    );
});

test("an open tray menu keeps the tray expanded until it closes", () => {
    apply(() => settings.set_int("auto-hide-duration", 3));
    const item = addTrayItem("auto-hide-menu", { realMenu: true });
    setTrayRevealed(true);
    waitForItemVisible(item, true);
    waitFor("the item's position", () => itemCenter(item.role)[0] > 0);
    clickAt(...itemCenter(item.role));
    waitFor("the item's menu to open", () => item.menuOpen());

    sleep(4000);
    assert.ok(trayRevealed(), "the tray collapsed under an open menu");

    item.closeMenu();
    waitFor("the item's menu to close", () => !item.menuOpen());
    sleep(1500);
    assert.ok(trayRevealed(), "the delay did not start over");
    waitFor("auto-hide after the menu closed", () => !trayRevealed(), 4000);
    waitForItemVisible(item, false);
});

test("nothing collapses the tray while auto-hide is off", () => {
    apply(() => {
        settings.set_boolean("auto-hide-enabled", false);
        settings.set_int("auto-hide-duration", 1);
    });
    setTrayRevealed(true);
    sleep(2000);
    assert.ok(trayRevealed(), "the tray collapsed with auto-hide off");
    setTrayRevealed(false);
});
