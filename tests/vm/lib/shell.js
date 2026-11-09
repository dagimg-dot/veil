import Gio from "gi://Gio";
import GLib from "gi://GLib";
import { afterAll, Fatal, notYet, waitFor } from "./harness.js";

export const UUID = GLib.getenv("VM_TEST_UUID");
export const ROOT = GLib.getenv("VM_TEST_ROOT");
export const LOGS = [
    GLib.getenv("VM_TEST_LOG"),
    `${GLib.getenv("VM_TEST_WORK")}/session.log`,
];
export const METADATA = JSON.parse(
    new TextDecoder().decode(
        GLib.file_get_contents(`${ROOT}/metadata.json`)[1],
    ),
);

const BUS_NAME = "org.gnome.Shell";

function callShell(path, iface, method, signature = null, args = []) {
    return Gio.DBus.session
        .call_sync(
            BUS_NAME,
            path,
            iface,
            method,
            signature ? new GLib.Variant(signature, args) : null,
            null,
            Gio.DBusCallFlags.NONE,
            5000,
            null,
        )
        .recursiveUnpack();
}

const callExtensions = (method, signature, args) =>
    callShell(
        "/org/gnome/Shell",
        "org.gnome.Shell.Extensions",
        method,
        signature,
        args,
    )[0];

/** Evaluates `code` inside the shell and returns its JSON-decoded value. */
export function evalInShell(code) {
    const [success, result] = callShell(
        "/org/gnome/Shell",
        "org.gnome.Shell",
        "Eval",
        "(s)",
        [code],
    );
    if (!success) throw new Error(`Eval failed: ${result}\n${code}`);
    return result ? JSON.parse(result) : undefined;
}

const helperCall = (method, ...args) =>
    evalInShell(
        `veilTest.${method}(${args.map((a) => JSON.stringify(a)).join(", ")})`,
    );

export const ExtensionState = {
    ACTIVE: 1,
    INACTIVE: 2,
    ERROR: 3,
    OUT_OF_DATE: 4,
};

export const extension = {
    info: () => callExtensions("GetExtensionInfo", "(s)", [UUID]),
    enable: () => callExtensions("EnableExtension", "(s)", [UUID]),
    disable: () => callExtensions("DisableExtension", "(s)", [UUID]),
    openPrefs: () =>
        callExtensions("OpenExtensionPrefs", "(ssa{sv})", [UUID, "", {}]),
    waitForState(state, timeoutMs = 5000) {
        const seen = [];
        return waitFor(
            `extension state ${state}`,
            () => {
                const info = extension.info();
                if (seen.at(-1) !== info.state) seen.push(info.state);
                // loadExtension() reports ERROR while loading; it is final only once an error is attached
                if (
                    (info.state === ExtensionState.ERROR && info.error) ||
                    info.state === ExtensionState.OUT_OF_DATE
                )
                    throw new Fatal(
                        `extension failed to load (states: ${seen.join(" → ")}): ${info.error}`,
                    );
                return info.state === state
                    ? info
                    : notYet(`state ${info.state}`);
            },
            timeoutMs,
        );
    },
};

// The shell starts in the overview, which covers the panel's input; a real user dismisses it after login
export function leaveOverview() {
    const property = (method, args) =>
        callShell(
            "/org/gnome/Shell",
            "org.freedesktop.DBus.Properties",
            method,
            method === "Set" ? "(ssv)" : "(ss)",
            args,
        );
    property("Set", [
        "org.gnome.Shell",
        "OverviewActive",
        new GLib.Variant("b", false),
    ]);
    return !property("Get", ["org.gnome.Shell", "OverviewActive"])[0];
}

export function extensionSettings() {
    const source = Gio.SettingsSchemaSource.new_from_directory(
        `${GLib.get_user_data_dir()}/gnome-shell/extensions/${UUID}/schemas`,
        Gio.SettingsSchemaSource.get_default(),
        false,
    );
    return new Gio.Settings({
        settings_schema: source.lookup(METADATA["settings-schema"], false),
    });
}

export const helperReady = () => evalInShell("typeof veilTest !== 'undefined'");

let nextRole = 0;

/** A fake tray applet; removed again when the suite ends. */
export function addTrayItem(name = "") {
    const role = `item-${nextRole++}`;
    helperCall("addItem", role, name);
    afterAll(() => helperCall("removeItem", role));
    return {
        role,
        state: () => helperCall("item", role),
        rename: (newName) => helperCall("renameItem", role, newName),
        setVisible: (visible) => helperCall("setItemVisible", role, visible),
        remove: () => helperCall("removeItem", role),
    };
}

export const panelItems = () => helperCall("items");
export const indicatorCenter = () => helperCall("indicatorCenter");
export const indicatorMenuOpen = () => helperCall("indicatorMenuOpen");
export const trayRevealed = () => helperCall("trayRevealed", UUID);
export const windowClasses = () => helperCall("windowClasses");
export const closeWindows = (wmClass) => helperCall("closeWindows", wmClass);
