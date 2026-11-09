import Gio from "gi://Gio";
import GLib from "gi://GLib";
import {
    afterAll,
    assert,
    notYet,
    sleep,
    test,
    waitFor,
} from "../lib/harness.js";
import { clickAt, clickHere, pointAt, pointBy } from "../lib/pointer.js";
import {
    activateSettingsItem,
    addEmptyContainer,
    addTrayItem,
    closeWindows,
    dropWindowFocus,
    ExtensionState,
    extension,
    extensionSettings,
    focusedWindowClass,
    indicatorCenter,
    indicatorIcon,
    itemCenter,
    setTrayRevealed,
    trayRevealed,
    UUID,
    waitForItemVisible,
    windowClasses,
} from "../lib/shell.js";

const settings = extensionSettings();
const AWAY = [640, 400];
const PREFS_APP_ID = "org.gnome.Shell.Extensions";
const KEYS = [
    "animation-enabled",
    "animation-duration",
    "interaction-mode",
    "auto-hide-enabled",
    "hover-hide-on-leave",
    "save-state",
    "default-visibility",
    "status-area-h-padding",
    "custom-close-icon",
    "visible-items",
];

function apply(write) {
    write();
    Gio.Settings.sync();
    sleep(200);
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
    settings.set_boolean("hover-hide-on-leave", true);
    settings.set_strv("visible-items", []);
});

test("changing the default visibility applies while save-state is off", () => {
    apply(() => settings.set_boolean("save-state", false));
    apply(() => settings.set_boolean("default-visibility", true));
    waitFor("tray expanded", () => trayRevealed());
    apply(() => settings.set_boolean("default-visibility", false));
    waitFor("tray collapsed", () => !trayRevealed());
});

test("turning save-state off goes back to the default visibility", () => {
    apply(() => {
        settings.set_boolean("default-visibility", true);
        settings.set_boolean("save-state", true);
    });
    setTrayRevealed(false);
    apply(() => settings.set_boolean("save-state", false));
    waitFor("tray back to its default", () => trayRevealed());
});

test("changing the padding restyles tray buttons", () => {
    const item = addTrayItem("signals-padding");
    apply(() => settings.set_int("status-area-h-padding", 4));
    waitFor("the new padding", () =>
        item.style().includes("-natural-hpadding: 4px"),
    );
});

test("a style set by someone else keeps the padding", () => {
    const item = addTrayItem("signals-style");
    item.setStyle("color: red");
    waitFor("the padding to come back", () => {
        const style = item.style();
        return (
            style.includes("-natural-hpadding") && style.includes("color: red")
        );
    });
});

test("a custom icon replaces the indicator icon", () => {
    const icon = `${GLib.get_user_data_dir()}/gnome-shell/extensions/${UUID}/assets/icons/arrow-open.svg`;
    setTrayRevealed(false);
    apply(() => settings.set_string("custom-close-icon", icon));
    setTrayRevealed(true);
    waitFor("the custom icon", () => indicatorIcon().includes("arrow-open"));
    apply(() => settings.reset("custom-close-icon"));
});

test("a container that gets its child late follows the tray", () => {
    setTrayRevealed(false);
    const container = addEmptyContainer("signals-late-child");
    container.fill();
    waitForItemVisible(container, false);
    setTrayRevealed(true);
    waitForItemVisible(container, true);
});

test("the indicator's Settings item opens the preferences", () => {
    afterAll(() => closeWindows(PREFS_APP_ID));
    activateSettingsItem();
    waitFor(
        "preferences window",
        () => {
            const list = windowClasses();
            return list.includes(PREFS_APP_ID) || notYet(JSON.stringify(list));
        },
        20000,
    );
    closeWindows(PREFS_APP_ID);
    waitFor(
        "preferences closed",
        () => !windowClasses().includes(PREFS_APP_ID),
    );
});

test("the Settings item raises a preferences window already open", () => {
    afterAll(() => closeWindows(PREFS_APP_ID));
    const prefsWindows = () =>
        windowClasses().filter((name) => name === PREFS_APP_ID);
    activateSettingsItem();
    waitFor("preferences window", () => prefsWindows().length > 0, 20000);
    waitFor("window focused", () => focusedWindowClass() === PREFS_APP_ID);
    dropWindowFocus();
    waitFor("focus dropped", () => focusedWindowClass() !== PREFS_APP_ID);

    activateSettingsItem();
    waitFor("window raised", () => focusedWindowClass() === PREFS_APP_ID);
    assert.equal(prefsWindows().length, 1, "preferences windows");

    closeWindows(PREFS_APP_ID);
    waitFor("preferences closed", () => prefsWindows().length === 0);
});

test("clicking a tray item does not stop leaving from hiding items", () => {
    setTrayRevealed(false);
    apply(() => settings.set_string("interaction-mode", "hover"));
    const item = addTrayItem("signals-clicked");
    const indicator = indicatorCenter();
    pointAt(...indicator);
    waitForItemVisible(item, true);
    sleep(200);
    const [itemX, itemY] = itemCenter(item.role);
    pointBy(itemX - indicator[0], itemY - indicator[1]);
    sleep(200);
    clickHere();
    sleep(200);
    assert.ok(item.state().visible, "item hidden by the click");
    moveAway();
    waitForItemVisible(item, false);
});

test("a tray item with a real menu is connected and released cleanly", () => {
    apply(() => settings.set_string("interaction-mode", "click"));
    const item = addTrayItem("signals-menu", { realMenu: true });
    extension.disable();
    extension.waitForState(ExtensionState.INACTIVE);
    assert.ok(item.state().visible, "item hidden after disable");
    extension.enable();
    extension.waitForState(ExtensionState.ACTIVE);
    waitFor("the indicator's position", () => indicatorCenter()[0] > 0);
    item.remove();
});

test("after disable, nothing reacts to settings or new items", () => {
    setTrayRevealed(false);
    extension.disable();
    extension.waitForState(ExtensionState.INACTIVE);

    apply(() => {
        settings.set_int("status-area-h-padding", 2);
        settings.set_strv("visible-items", ["signals-after-disable"]);
    });
    const item = addTrayItem("signals-after-disable");
    sleep(300);
    assert.ok(item.state().visible, "a new item was hidden after disable");
    assert.ok(
        !item.style().includes("-natural-hpadding"),
        `padding applied after disable: ${item.style()}`,
    );

    apply(() => settings.set_strv("visible-items", []));
    extension.enable();
    extension.waitForState(ExtensionState.ACTIVE);
    waitFor("padding after enable", () =>
        item.style().includes("-natural-hpadding"),
    );
});

test("disabling during a fade leaves items fully drawn", () => {
    apply(() => {
        settings.set_boolean("animation-enabled", true);
        settings.set_int("animation-duration", 1000);
    });
    setTrayRevealed(true);
    const item = addTrayItem("signals-mid-fade");
    sleep(1200);
    clickAt(...indicatorCenter());
    sleep(200);

    extension.disable();
    extension.waitForState(ExtensionState.INACTIVE);
    const state = item.state();
    assert.ok(state.visible, "item left hidden");
    assert.equal(state.opacity, 255, "opacity");
    assert.equal(state.translationX, 0, "translation");

    extension.enable();
    extension.waitForState(ExtensionState.ACTIVE);
    apply(() => settings.set_boolean("animation-enabled", false));
});
