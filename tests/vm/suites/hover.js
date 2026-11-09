import Gio from "gi://Gio";
import { afterAll, assert, sleep, test, waitFor } from "../lib/harness.js";
import { clickAt, pointAt, pointBy } from "../lib/pointer.js";
import {
    addTrayItem,
    closeIndicatorMenu,
    extensionSettings,
    fadeOutTimeouts,
    indicatorCenter,
    itemCenter,
    setTrayRevealed,
    trayRevealed,
    waitForItemVisible,
} from "../lib/shell.js";

const settings = extensionSettings();
const AWAY = [640, 400];
const KEYS = [
    "animation-enabled",
    "animation-duration",
    "interaction-mode",
    "auto-hide-enabled",
    "hover-hide-on-leave",
    "hover-duration",
    "visible-items",
];

function apply(write) {
    write();
    Gio.Settings.sync();
    sleep(150);
}

const moveAway = () => pointAt(...AWAY);

afterAll(() => {
    moveAway();
    for (const key of KEYS) settings.reset(key);
    Gio.Settings.sync();
});

apply(() => {
    settings.set_string("interaction-mode", "click");
    settings.set_boolean("animation-enabled", false);
    settings.set_boolean("auto-hide-enabled", false);
    settings.set_strv("visible-items", []);
});

test("switching to hover while expanded collapses the tray", () => {
    setTrayRevealed(true);
    const item = addTrayItem("hover-switch");
    waitForItemVisible(item, true);
    apply(() => settings.set_string("interaction-mode", "hover"));
    waitFor("tray collapsed", () => !trayRevealed());
    waitForItemVisible(item, false);
    moveAway();
});

test("hovering the indicator shows items without changing the saved state", () => {
    const item = addTrayItem("hover-basic");
    waitForItemVisible(item, false);
    pointAt(...indicatorCenter());
    waitForItemVisible(item, true);
    assert.ok(!trayRevealed(), "hover changed the saved tray state");
});

test("leaving the indicator hides items again", () => {
    const item = addTrayItem("hover-leave");
    pointAt(...indicatorCenter());
    waitForItemVisible(item, true);
    moveAway();
    waitForItemVisible(item, false);
});

test("items in visible-items stay shown after leaving", () => {
    apply(() => settings.set_strv("visible-items", ["hover-kept"]));
    const kept = addTrayItem("hover-kept");
    const hidden = addTrayItem("hover-not-kept");
    pointAt(...indicatorCenter());
    waitForItemVisible(hidden, true);
    moveAway();
    waitForItemVisible(hidden, false);
    assert.ok(kept.state().visible, "a listed item was hidden");
    apply(() => settings.set_strv("visible-items", []));
});

test("moving from the indicator onto a tray item keeps items shown", () => {
    const item = addTrayItem("hover-onto-item");
    const indicator = indicatorCenter();
    pointAt(...indicator);
    waitForItemVisible(item, true);
    sleep(200);

    const [itemX, itemY] = itemCenter(item.role);
    pointBy(itemX - indicator[0], itemY - indicator[1]);
    sleep(400);
    assert.ok(item.state().visible, "item hidden while the pointer was on it");

    moveAway();
    waitForItemVisible(item, false);
});

test("clicking the indicator in hover mode does not toggle the tray", () => {
    const before = trayRevealed();
    clickAt(...indicatorCenter());
    sleep(300);
    assert.equal(trayRevealed(), before, "tray state");
    closeIndicatorMenu();
    moveAway();
});

test("with hide on leave off, items stay until the hover duration passes", () => {
    apply(() => {
        settings.set_boolean("hover-hide-on-leave", false);
        settings.set_int("hover-duration", 1);
    });
    const item = addTrayItem("hover-duration");
    pointAt(...indicatorCenter());
    waitForItemVisible(item, true);
    moveAway();
    sleep(300);
    assert.ok(item.state().visible, "item hidden before the hover duration");
    waitFor(
        "the hover duration to hide the item",
        () => !item.state().visible,
        4000,
    );
});

test("coming back before the duration passes keeps items shown", () => {
    const item = addTrayItem("hover-return");
    const indicator = indicatorCenter();
    pointAt(...indicator);
    waitForItemVisible(item, true);
    moveAway();
    pointAt(...indicator);
    sleep(1800);
    assert.ok(item.state().visible, "item hidden while the pointer was back");

    moveAway();
    waitFor("item hidden after leaving", () => !item.state().visible, 4000);
    apply(() => settings.set_boolean("hover-hide-on-leave", true));
});

test("an animated hover finishes without falling back to the timeout", () => {
    apply(() => {
        settings.set_boolean("animation-enabled", true);
        settings.set_int("animation-duration", 100);
    });
    const item = addTrayItem("hover-animated");
    const timeoutsBefore = fadeOutTimeouts();
    pointAt(...indicatorCenter());
    waitFor("the fade-in to finish", () => {
        const state = item.state();
        return state.visible && state.opacity === 255;
    });
    moveAway();
    waitForItemVisible(item, false);
    sleep(300);
    assert.equal(fadeOutTimeouts(), timeoutsBefore, "fade-out timeouts");
    apply(() => settings.set_boolean("animation-enabled", false));
});
