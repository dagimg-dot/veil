import { describe, expect, test } from "bun:test";
import { shouldOfferRevealForItem } from "../../src/core/panelRevealRules.ts";

describe("shouldOfferRevealForItem", () => {
    for (const [originalVisible, listed, expected] of [
        [true, false, true],
        [true, true, true],
        [undefined, false, true],
        [undefined, true, true],
        [false, false, false],
        [false, true, false],
    ]) {
        test(`originalVisible ${originalVisible}, ${listed ? "listed" : "not listed"} is ${expected}`, () => {
            const visibleItems = listed ? ["item"] : [];
            expect(
                shouldOfferRevealForItem(
                    { name: "item", originalVisible },
                    visibleItems,
                ),
            ).toBe(expected);
        });
    }
});
