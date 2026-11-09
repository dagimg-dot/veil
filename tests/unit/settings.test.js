import { describe, expect, test } from "bun:test";
import { pickOption, readInteractionMode } from "../../src/utils/settings.ts";
import { fakeSettings } from "./fakes.js";

describe("pickOption", () => {
    test("returns a value that is one of the options", () => {
        expect(pickOption("hover", ["click", "hover"], "click")).toBe("hover");
    });

    test("falls back when the value is not an option", () => {
        expect(pickOption("drag", ["click", "hover"], "click")).toBe("click");
    });
});

describe("readInteractionMode", () => {
    for (const [stored, expected] of [
        ["click", "click"],
        ["hover", "hover"],
        ["bogus", "click"],
    ]) {
        test(`${stored} reads as ${expected}`, () => {
            const settings = fakeSettings({ "interaction-mode": stored });
            expect(readInteractionMode(settings)).toBe(expected);
        });
    }
});
