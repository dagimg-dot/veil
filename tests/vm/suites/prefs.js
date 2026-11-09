import { afterAll, assert, notYet, test, waitFor } from "../lib/harness.js";
import { closeWindows, extension, windowClasses } from "../lib/shell.js";

const PREFS_APP_ID = "org.gnome.Shell.Extensions";

test("the preferences window opens", () => {
    extension.openPrefs();
    afterAll(() => closeWindows(PREFS_APP_ID));
    const classes = waitFor(
        "preferences window",
        () => {
            const list = windowClasses();
            return list.includes(PREFS_APP_ID)
                ? list
                : notYet(JSON.stringify(list));
        },
        20000,
    );
    assert.ok(classes.includes(PREFS_APP_ID), "preferences window missing");
});
