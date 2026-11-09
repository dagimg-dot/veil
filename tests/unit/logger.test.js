import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import {
    deinitializeLogger,
    getVerbosity,
    initializeLogger,
    logger,
} from "../../src/utils/logger.ts";
import { fakeSettings } from "./fakes.js";

const levelSettings = (level) => fakeSettings({ "logging-level": level });

let printed;
let consoleLog;

beforeEach(() => {
    consoleLog = spyOn(console, "log").mockImplementation(() => {});
    printed = () => consoleLog.mock.calls.map(([text]) => text).join("\n");
});

afterEach(() => {
    initializeLogger(levelSettings("info"));
    consoleLog.mockRestore();
});

describe("getVerbosity", () => {
    for (const [level, verbosity] of [
        ["error", 0],
        ["warn", 1],
        ["info", 2],
        ["debug", 3],
        ["DEBUG", 3],
        ["verbose", 2],
        ["", 2],
    ]) {
        test(`${JSON.stringify(level)} is ${verbosity}`, () => {
            expect(getVerbosity(level)).toBe(verbosity);
        });
    }
});

describe("logger", () => {
    test("prints only messages at or above the configured level", () => {
        initializeLogger(levelSettings("warn"));
        consoleLog.mockClear();

        logger.debug("debug message");
        logger.info("info message");
        logger.warn("warn message");
        logger.error("error message");

        expect(printed()).not.toContain("debug message");
        expect(printed()).not.toContain("info message");
        expect(printed()).toContain("WARN: warn message");
        expect(printed()).toContain("ERROR: error message");
    });

    test("follows logging-level changes from the settings", () => {
        const settings = levelSettings("info");
        initializeLogger(settings);

        logger.debug("before");
        settings.change("logging-level", "debug");
        logger.debug("after");

        expect(printed()).not.toContain("before");
        expect(printed()).toContain("DEBUG: after");
    });

    test("stops following the settings once deinitialized", () => {
        const settings = levelSettings("info");
        initializeLogger(settings);
        deinitializeLogger(settings);

        expect(settings.signals.handlers.size).toBe(0);
    });

    test("prints an error's message and stack indented under its entry", () => {
        initializeLogger(levelSettings("info"));
        consoleLog.mockClear();

        logger.error("Failed to load", new Error("missing file"));

        const [entry, message, stack] = printed().split("\n");
        expect(entry).toMatch(/ERROR: Failed to load$/);
        // tests/vm/runner.js treats these indented lines as part of the entry
        expect(message).toMatch(/ERROR: {3}Error: missing file$/);
        expect(stack).toMatch(/ERROR: {3}\S/);
    });

    test("prints object details as indented key-value lines", () => {
        initializeLogger(levelSettings("info"));
        consoleLog.mockClear();

        logger.info("Item", { name: "tray", count: 2 });

        expect(printed().split("\n").slice(1)).toEqual([
            expect.stringMatching(/INFO: {3}name: tray$/),
            expect.stringMatching(/INFO: {3}count: 2$/),
        ]);
    });

    test("prints falsy values instead of dropping them", () => {
        initializeLogger(levelSettings("info"));
        consoleLog.mockClear();

        logger.info("Count", 0);

        expect(printed()).toMatch(/INFO: 0$/);
    });
});
