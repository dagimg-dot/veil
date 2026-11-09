import Gio from "gi://Gio";
import { afterAll, assert, sleep, test, waitFor } from "../lib/harness.js";
import {
    addTrayItem,
    ExtensionState,
    extension,
    extensionSettings,
    fadeOutTimeouts,
    indicatorMenuOpen,
    setTrayRevealed,
    toggleTray,
    trayRevealed,
    waitForItemVisible,
} from "../lib/shell.js";

const settings = extensionSettings();

settings.set_boolean("animation-enabled", false);
settings.set_string("interaction-mode", "click");
settings.set_boolean("auto-hide-enabled", false);
settings.set_strv("visible-items", []);
Gio.Settings.sync();

afterAll(() => {
    for (const key of [
        "animation-enabled",
        "animation-duration",
        "interaction-mode",
        "auto-hide-enabled",
        "visible-items",
    ])
        settings.reset(key);
});

test("clicking the indicator toggles the tray without opening its menu", () => {
    const before = trayRevealed();
    toggleTray();
    waitFor("tray state to flip", () => trayRevealed() !== before);
    assert.ok(!indicatorMenuOpen(), "the indicator menu opened on a click");
    toggleTray();
    waitFor("tray state to flip back", () => trayRevealed() === before);
});

test("collapsing hides items and expanding shows them again", () => {
    setTrayRevealed(true);
    const item = addTrayItem("tray-basic");
    waitForItemVisible(item, true);
    setTrayRevealed(false);
    waitForItemVisible(item, false);
    setTrayRevealed(true);
    waitForItemVisible(item, true);
});

test("items in visible-items stay shown while collapsed", () => {
    setTrayRevealed(true);
    const kept = addTrayItem("tray-kept");
    const hidden = addTrayItem("tray-hidden");
    settings.set_strv("visible-items", ["tray-kept"]);
    setTrayRevealed(false);
    waitForItemVisible(hidden, false);
    waitForItemVisible(kept, true);
    settings.set_strv("visible-items", []);
});

test("an item added while collapsed is hidden, then shown on expand", () => {
    setTrayRevealed(false);
    const item = addTrayItem("tray-late");
    waitForItemVisible(item, false);
    setTrayRevealed(true);
    waitForItemVisible(item, true);
});

test("an item hidden before Veil starts stays hidden on expand", () => {
    setTrayRevealed(true);
    extension.disable();
    extension.waitForState(ExtensionState.INACTIVE);
    const item = addTrayItem("tray-self-hidden");
    item.setVisible(false);
    extension.enable();
    extension.waitForState(ExtensionState.ACTIVE);

    setTrayRevealed(false);
    setTrayRevealed(true);
    sleep(200);
    assert.ok(!item.state().visible, "Veil revealed a self-hidden item");
    item.setVisible(true);
});

test("an animated collapse and expand ends fully visible", () => {
    settings.set_boolean("animation-enabled", true);
    settings.set_int("animation-duration", 100);
    setTrayRevealed(true);
    const item = addTrayItem("tray-animated");
    const timeoutsBefore = fadeOutTimeouts();
    setTrayRevealed(false);
    waitForItemVisible(item, false);
    sleep(300);
    assert.equal(fadeOutTimeouts(), timeoutsBefore, "fade-out timeouts");
    setTrayRevealed(true);
    waitFor("the fade-in to finish", () => {
        const state = item.state();
        return (
            state.visible && state.opacity === 255 && state.translationX === 0
        );
    });
    settings.set_boolean("animation-enabled", false);
});

test("an item named after it was hidden is shown on expand", () => {
    setTrayRevealed(false);
    const item = addTrayItem("");
    waitForItemVisible(item, false);
    item.rename("tray-named-late");
    sleep(100);
    setTrayRevealed(true);
    waitForItemVisible(item, true);
});

test("an item its owner shows again takes part in the tray", () => {
    setTrayRevealed(true);
    const item = addTrayItem("tray-owner-toggled");
    item.setVisible(false);
    setTrayRevealed(false);
    setTrayRevealed(true);
    sleep(200);
    assert.ok(!item.state().visible, "Veil revealed an owner-hidden item");

    item.setVisible(true);
    setTrayRevealed(false);
    waitForItemVisible(item, false);
    setTrayRevealed(true);
    waitForItemVisible(item, true);
});

test("collapsing again does not wait on items already hidden", () => {
    settings.set_boolean("animation-enabled", true);
    settings.set_int("animation-duration", 100);
    Gio.Settings.sync();
    setTrayRevealed(true);
    const item = addTrayItem("tray-hidden-twice");
    setTrayRevealed(false);
    waitForItemVisible(item, false);
    sleep(300);

    const before = fadeOutTimeouts();
    settings.set_strv("visible-items", ["tray-unrelated"]);
    Gio.Settings.sync();
    sleep(500);
    assert.equal(fadeOutTimeouts(), before, "fade-out timeouts");

    settings.set_strv("visible-items", []);
    settings.set_boolean("animation-enabled", false);
    Gio.Settings.sync();
});

test("items added during a collapse animation are shown on expand", () => {
    settings.set_boolean("animation-enabled", true);
    settings.set_int("animation-duration", 100);
    setTrayRevealed(true);
    const first = addTrayItem("tray-race-a");
    toggleTray();
    const second = addTrayItem("tray-race-b");
    waitFor("tray collapsed", () => !trayRevealed());
    sleep(400);
    setTrayRevealed(true);
    for (const item of [first, second]) {
        waitFor(`${item.role} fully shown`, () => {
            const state = item.state();
            return state.visible && state.opacity === 255;
        });
    }
    settings.set_boolean("animation-enabled", false);
});

test("an item switched on while collapsed appears, and hides when switched off", () => {
    setTrayRevealed(false);
    const item = addTrayItem("tray-listed-late");
    waitForItemVisible(item, false);

    settings.set_strv("visible-items", ["tray-listed-late"]);
    Gio.Settings.sync();
    waitForItemVisible(item, true);

    settings.set_strv("visible-items", []);
    Gio.Settings.sync();
    waitForItemVisible(item, false);
});
