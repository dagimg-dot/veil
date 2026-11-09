import Gio from "gi://Gio";
import { afterAll, assert, test, waitFor } from "../lib/harness.js";
import {
    addTrayItem,
    ExtensionState,
    extension,
    extensionSettings,
    panelItems,
} from "../lib/shell.js";

const settings = extensionSettings();
afterAll(() => {
    for (const key of ["animation-enabled", "default-visibility", "save-state"])
        settings.reset(key);
});

const hasIndicator = () => panelItems().some((i) => i.name === "Veil");

test("the indicator is on the panel while enabled", () => {
    waitFor("Veil indicator", hasIndicator);
});

test("disable removes the indicator and shows every item", () => {
    settings.set_boolean("animation-enabled", false);
    settings.set_boolean("default-visibility", false);
    settings.set_boolean("save-state", false);
    Gio.Settings.sync();
    extension.disable();
    extension.waitForState(ExtensionState.INACTIVE);
    extension.enable();
    extension.waitForState(ExtensionState.ACTIVE);

    const item = addTrayItem("lifecycle-item");
    waitFor("item to be collapsed", () => !item.state().visible);

    extension.disable();
    extension.waitForState(ExtensionState.INACTIVE);
    assert.ok(!hasIndicator(), "indicator still on the panel after disable");
    assert.ok(item.state().visible, "item left hidden after disable");

    extension.enable();
    extension.waitForState(ExtensionState.ACTIVE);
    waitFor("Veil indicator after re-enable", hasIndicator);
});

test("disable after a tray app went away touches nothing of it", () => {
    addTrayItem("lifecycle-gone").remove();
    extension.disable();
    extension.waitForState(ExtensionState.INACTIVE);
    extension.enable();
    extension.waitForState(ExtensionState.ACTIVE);
    waitFor("Veil indicator after re-enable", hasIndicator);
});

test("rapid disable/enable toggling leaves the extension active", () => {
    for (let i = 0; i < 5; i++) {
        extension.disable();
        extension.enable();
    }
    extension.waitForState(ExtensionState.ACTIVE);
    waitFor("Veil indicator after toggling", hasIndicator);
});
