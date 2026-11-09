import Gio from "gi://Gio";
import GLib from "gi://GLib";
import { sleep } from "./harness.js";

const BUS_NAME = "org.gnome.Mutter.RemoteDesktop";
const SESSION_IFACE = "org.gnome.Mutter.RemoteDesktop.Session";
const BTN_LEFT = 0x110;
const XK_SHIFT_L = 0xffe1;

let session = null;

function call(path, iface, method, signature = null, args = []) {
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

// The session's virtual keyboard and pointer give the headless seat the input
// devices a real desktop has; it stays up for the whole run
export function startInputDevices() {
    if (session) return session;
    [session] = call(
        "/org/gnome/Mutter/RemoteDesktop",
        BUS_NAME,
        "CreateSession",
    );
    call(session, SESSION_IFACE, "Start");
    // Mutter creates the virtual devices on their first event
    for (const pressed of [true, false])
        call(session, SESSION_IFACE, "NotifyKeyboardKeysym", "(ub)", [
            XK_SHIFT_L,
            pressed,
        ]);
    call(session, SESSION_IFACE, "NotifyPointerMotionRelative", "(dd)", [1, 0]);
    return session;
}

function moveTo(path, x, y) {
    const move = (dx, dy) =>
        call(path, SESSION_IFACE, "NotifyPointerMotionRelative", "(dd)", [
            dx,
            dy,
        ]);
    move(-100000, -100000);
    move(x, y);
    sleep(100);
    move(1, 0);
    move(-1, 0);
    sleep(150);
}

// Absolute motion needs a screencast stream, so move relative from the top-left corner instead
export function pointAt(x, y) {
    moveTo(startInputDevices(), x, y);
}

export function pointBy(dx, dy) {
    call(
        startInputDevices(),
        SESSION_IFACE,
        "NotifyPointerMotionRelative",
        "(dd)",
        [dx, dy],
    );
}

export function clickAt(x, y) {
    const path = startInputDevices();
    moveTo(path, x, y);
    for (const pressed of [true, false]) {
        call(path, SESSION_IFACE, "NotifyPointerButton", "(ib)", [
            BTN_LEFT,
            pressed,
        ]);
        sleep(50);
    }
}
