import GLib from "gi://GLib";

export class Fatal extends Error {}

export function notYet(detail) {
    throw new Error(detail);
}

export function sleep(ms) {
    const context = GLib.MainContext.default();
    const deadline = Date.now() + ms;
    do {
        while (context.pending()) context.iteration(false);
        GLib.usleep(10 * 1000);
    } while (Date.now() < deadline);
}

export function waitFor(description, predicate, timeoutMs = 5000) {
    const deadline = Date.now() + timeoutMs;
    let last;
    while (Date.now() < deadline) {
        try {
            const value = predicate();
            if (value) return value;
            last = value;
        } catch (e) {
            if (e instanceof Fatal) throw e;
            last = e.message;
        }
        sleep(100);
    }
    throw new Error(`Timed out waiting for ${description} (last: ${last})`);
}

export const assert = {
    ok(condition, message) {
        if (!condition) throw new Error(message);
    },
    equal(actual, expected, label) {
        if (actual !== expected)
            throw new Error(
                `${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
            );
    },
    throws(fn, message) {
        try {
            fn();
        } catch {
            return;
        }
        throw new Error(message);
    },
};

let active = null;

export function setActiveSuite(suite) {
    active = suite;
}

export function test(name, fn) {
    active.tests.push({ name, fn });
}

export function todo(name, reason, fn) {
    active.tests.push({ name, fn, todo: reason });
}

export function afterAll(fn) {
    active.cleanups.push(fn);
}

export function skip(reason) {
    active.skipped = reason;
}

export function allowLogged(pattern) {
    active.allowedLogs.push(pattern);
}
