import "gi://Gtk?version=4.0";
import Adw from "gi://Adw?version=1";
import Gio from "gi://Gio";
import GLib from "gi://GLib";
import { afterAll, assert, test } from "../lib/harness.js";
import { extensionSettings, UUID } from "../lib/shell.js";

const EXTENSION_DIR = `${GLib.get_user_data_dir()}/gnome-shell/extensions/${UUID}`;
const loadPage = (name) => import(`file://${EXTENSION_DIR}/prefs/${name}.js`);

Adw.init();
const { GeneralPage } = await loadPage("GeneralPage");
const { ItemsPage } = await loadPage("ItemsPage");
const { AboutPage } = await loadPage("AboutPage");

const settings = extensionSettings();
const savedAllItems = settings.get_strv("all-items");
const KEYS = [
    "save-state",
    "default-visibility",
    "interaction-mode",
    "hover-hide-on-leave",
    "hover-duration",
    "auto-hide-enabled",
    "auto-hide-duration",
    "status-area-h-padding",
    "animation-enabled",
    "animation-duration",
    "animate-all-items",
    "logging-level",
    "custom-open-icon",
    "visible-items",
];

afterAll(() => {
    for (const key of KEYS) settings.reset(key);
    settings.set_strv("all-items", savedAllItems);
    Gio.Settings.sync();
});

const general = new GeneralPage();
general.bindSettings(settings);

const sameList = (actual, expected, label) =>
    assert.equal(JSON.stringify(actual), JSON.stringify(expected), label);

test("the save state combo writes save-state", () => {
    general._saveState.set_selected(1);
    assert.equal(settings.get_boolean("save-state"), true, "save-state");
    general._saveState.set_selected(0);
    assert.equal(settings.get_boolean("save-state"), false, "save-state");
});

test("the default visibility combo writes default-visibility", () => {
    general._defaultVisibility.set_selected(1);
    assert.equal(
        settings.get_boolean("default-visibility"),
        false,
        "default-visibility",
    );
    general._defaultVisibility.set_selected(0);
    assert.equal(
        settings.get_boolean("default-visibility"),
        true,
        "default-visibility",
    );
});

test("the interaction mode combo writes the mode and swaps its controls", () => {
    general._interactionMode.set_selected(1);
    assert.equal(
        settings.get_string("interaction-mode"),
        "hover",
        "interaction-mode",
    );
    assert.ok(!general._autoHideEnabled.visible, "auto-hide shown in hover");
    assert.ok(general._hoverHideOnLeave.visible, "hide on leave not shown");

    general._interactionMode.set_selected(0);
    assert.equal(
        settings.get_string("interaction-mode"),
        "click",
        "interaction-mode",
    );
    assert.ok(general._autoHideEnabled.visible, "auto-hide hidden in click");
    assert.ok(!general._hoverHideOnLeave.visible, "hide on leave still shown");
});

test("hide on leave decides whether the hover duration is offered", () => {
    general._interactionMode.set_selected(1);
    general._hoverHideOnLeave.set_active(false);
    assert.equal(
        settings.get_boolean("hover-hide-on-leave"),
        false,
        "hover-hide-on-leave",
    );
    assert.ok(general._hoverDuration.visible, "hover duration not offered");

    general._hoverHideOnLeave.set_active(true);
    assert.ok(!general._hoverDuration.visible, "hover duration still offered");
    general._interactionMode.set_selected(0);
});

test("auto-hide switches its duration on and off", () => {
    general._autoHideEnabled.set_active(true);
    assert.equal(
        settings.get_boolean("auto-hide-enabled"),
        true,
        "auto-hide-enabled",
    );
    assert.ok(general._autoHideDuration.sensitive, "duration not editable");

    general._autoHideEnabled.set_active(false);
    assert.ok(!general._autoHideDuration.sensitive, "duration still editable");
});

for (const [rowName, key, value] of [
    ["_autoHideDuration", "auto-hide-duration", 42],
    ["_hoverDuration", "hover-duration", 7],
    ["_statusAreaHPadding", "status-area-h-padding", 3],
    ["_animationDuration", "animation-duration", 350],
]) {
    test(`the ${key} row writes its value`, () => {
        general[rowName].set_value(value);
        assert.equal(settings.get_int(key), value, key);
    });
}

test("turning animations off also turns off animating every item", () => {
    general._animationEnabled.set_active(true);
    general._animateAllItems.set_active(true);
    assert.equal(
        settings.get_boolean("animate-all-items"),
        true,
        "animate-all-items",
    );

    general._animationEnabled.set_active(false);
    assert.equal(
        settings.get_boolean("animation-enabled"),
        false,
        "animation-enabled",
    );
    assert.equal(
        settings.get_boolean("animate-all-items"),
        false,
        "animate-all-items",
    );
    assert.ok(!general._animationDuration.sensitive, "duration still editable");
});

test("the logging level combo writes the level", () => {
    general._loggingLevel.set_selected(3);
    assert.equal(settings.get_string("logging-level"), "debug", "level");
    general._loggingLevel.set_selected(2);
    assert.equal(settings.get_string("logging-level"), "info", "level");
});

test("the clear button removes a custom icon", () => {
    settings.set_string("custom-open-icon", "/tmp/veil-test-icon.svg");
    general._openIconClearButton.emit("clicked");
    assert.equal(settings.get_string("custom-open-icon"), "", "custom icon");
    assert.equal(
        general._openIconRow.get_subtitle(),
        "Icon shown when items are hidden",
        "subtitle",
    );
});

test("a page opens showing the saved settings", () => {
    settings.set_boolean("save-state", true);
    settings.set_string("interaction-mode", "hover");
    settings.set_string("logging-level", "warn");

    const page = new GeneralPage();
    page.bindSettings(settings);

    assert.equal(page._saveState.get_selected(), 1, "save state");
    assert.equal(page._interactionMode.get_selected(), 1, "interaction mode");
    assert.equal(page._loggingLevel.get_selected(), 1, "logging level");

    settings.reset("save-state");
    settings.reset("interaction-mode");
    settings.reset("logging-level");
});

settings.set_strv("all-items", ["prefs-a", "prefs-b"]);
settings.set_strv("visible-items", []);
const items = new ItemsPage();
items.bindSettings(settings);
const itemRow = (name) => items.itemRows.get(name);

test("every panel item gets a row", () => {
    sameList([...items.itemRows.keys()].sort(), ["prefs-a", "prefs-b"], "rows");
    assert.ok(!itemRow("prefs-a").active, "row on for an unlisted item");
});

test("switching a row on and off writes visible-items", () => {
    itemRow("prefs-a").active = true;
    sameList(settings.get_strv("visible-items"), ["prefs-a"], "visible-items");
    itemRow("prefs-a").active = false;
    sameList(settings.get_strv("visible-items"), [], "visible-items");
});

test("rows follow visible-items changed elsewhere", () => {
    settings.set_strv("visible-items", ["prefs-b"]);
    assert.ok(itemRow("prefs-b").active, "row did not follow the setting");
    settings.set_strv("visible-items", []);
    assert.ok(!itemRow("prefs-b").active, "row did not follow the setting");
});

test("rows follow items appearing and leaving", () => {
    settings.set_strv("all-items", ["prefs-b", "prefs-c"]);
    sameList([...items.itemRows.keys()].sort(), ["prefs-b", "prefs-c"], "rows");
});

test("the reset button clears visible-items", () => {
    settings.set_strv("visible-items", ["prefs-b", "prefs-c"]);
    items._resetButton.emit("clicked");
    sameList(settings.get_strv("visible-items"), [], "visible-items");
});

const METADATA_FIXTURE = {
    path: EXTENSION_DIR,
    name: "Veil",
    "version-name": "1.2.3",
    version: 9,
    url: "https://example.test/veil",
};

test("the about page shows the extension's details", () => {
    const about = new AboutPage();
    about.setMetadata(METADATA_FIXTURE);
    assert.equal(about._extensionName.get_text(), "Veil", "name");
    assert.ok(
        about._extensionVersion.get_text().startsWith("v1.2.3"),
        `version ${about._extensionVersion.get_text()}`,
    );
    assert.ok(about._linkWebsite.visible, "website link hidden");
    assert.ok(
        about._extensionLicense.buffer.text.includes("MIT"),
        "license text missing",
    );
});

test("the about page hides its links without a url", () => {
    const about = new AboutPage();
    about.setMetadata({ ...METADATA_FIXTURE, url: undefined });
    assert.ok(!about._linkWebsite.visible, "website link shown");
    assert.ok(!about._linkIssues.visible, "issues link shown");
});
