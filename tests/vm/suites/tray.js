import Gio from "gi://Gio";
import {
    afterAll,
    allowLogged,
    assert,
    sleep,
    test,
    todo,
    waitFor,
} from "../lib/harness.js";
import { clickAt } from "../lib/pointer.js";
import {
    addTrayItem,
    ExtensionState,
    extension,
    extensionSettings,
    indicatorCenter,
    indicatorMenuOpen,
    trayRevealed,
} from "../lib/shell.js";

allowLogged(/has no handler with id/);
allowLogged(/has been already disposed/);

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

const toggle = () => clickAt(...indicatorCenter());
const isRevealed = trayRevealed;

function setRevealed(revealed) {
    if (isRevealed() !== revealed) toggle();
    waitFor(`tray ${revealed ? "expanded" : "collapsed"}`, () => {
        return isRevealed() === revealed;
    });
}

const waitForVisible = (item, visible) =>
    waitFor(
        `${item.role} ${visible ? "shown" : "hidden"}`,
        () => item.state().visible === visible,
    );

test("clicking the indicator toggles the tray without opening its menu", () => {
    const before = isRevealed();
    toggle();
    waitFor("tray state to flip", () => isRevealed() !== before);
    assert.ok(!indicatorMenuOpen(), "the indicator menu opened on a click");
    toggle();
    waitFor("tray state to flip back", () => isRevealed() === before);
});

test("collapsing hides items and expanding shows them again", () => {
    setRevealed(true);
    const item = addTrayItem("tray-basic");
    waitForVisible(item, true);
    setRevealed(false);
    waitForVisible(item, false);
    setRevealed(true);
    waitForVisible(item, true);
});

test("items in visible-items stay shown while collapsed", () => {
    setRevealed(true);
    const kept = addTrayItem("tray-kept");
    const hidden = addTrayItem("tray-hidden");
    settings.set_strv("visible-items", ["tray-kept"]);
    setRevealed(false);
    waitForVisible(hidden, false);
    waitForVisible(kept, true);
    settings.set_strv("visible-items", []);
});

test("an item added while collapsed is hidden, then shown on expand", () => {
    setRevealed(false);
    const item = addTrayItem("tray-late");
    waitForVisible(item, false);
    setRevealed(true);
    waitForVisible(item, true);
});

test("an item hidden before Veil starts stays hidden on expand", () => {
    setRevealed(true);
    extension.disable();
    extension.waitForState(ExtensionState.INACTIVE);
    const item = addTrayItem("tray-self-hidden");
    item.setVisible(false);
    extension.enable();
    extension.waitForState(ExtensionState.ACTIVE);

    setRevealed(false);
    setRevealed(true);
    sleep(200);
    assert.ok(!item.state().visible, "Veil revealed a self-hidden item");
    item.setVisible(true);
});

test("an animated collapse and expand ends fully visible", () => {
    settings.set_boolean("animation-enabled", true);
    settings.set_int("animation-duration", 100);
    setRevealed(true);
    const item = addTrayItem("tray-animated");
    setRevealed(false);
    waitForVisible(item, false);
    setRevealed(true);
    waitFor("the fade-in to finish", () => {
        const state = item.state();
        return (
            state.visible && state.opacity === 255 && state.translationX === 0
        );
    });
    settings.set_boolean("animation-enabled", false);
});

todo(
    "an item named after it was hidden is shown on expand",
    "#19, #20: the hidden state is recorded as the owner's own hide",
    () => {
        setRevealed(false);
        const item = addTrayItem("");
        waitForVisible(item, false);
        item.rename("tray-named-late");
        sleep(100);
        setRevealed(true);
        waitForVisible(item, true);
    },
);

test("items added during a collapse animation are shown on expand", () => {
    settings.set_boolean("animation-enabled", true);
    settings.set_int("animation-duration", 100);
    setRevealed(true);
    const first = addTrayItem("tray-race-a");
    toggle();
    const second = addTrayItem("tray-race-b");
    waitFor("tray collapsed", () => !isRevealed());
    sleep(400);
    setRevealed(true);
    for (const item of [first, second]) {
        waitFor(`${item.role} fully shown`, () => {
            const state = item.state();
            return state.visible && state.opacity === 255;
        });
    }
    settings.set_boolean("animation-enabled", false);
});
