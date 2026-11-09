import { beforeEach, describe, expect, mock, test } from "bun:test";
import { StateManager } from "../../src/core/stateManager.ts";
import { fakeSettings, runSources, sources } from "./fakes.js";

const settingsWith = (overrides = {}) =>
    fakeSettings({
        "save-state": false,
        "saved-visibility": false,
        "default-visibility": false,
        "auto-hide-enabled": false,
        "auto-hide-duration": 5,
        "visible-items": [],
        ...overrides,
    });

beforeEach(() => {
    sources.clear();
});

describe("initial state", () => {
    test("uses default-visibility when save-state is off", () => {
        const state = new StateManager(
            settingsWith({ "default-visibility": true }),
        );
        expect(state.isPanelRevealed()).toBe(true);
    });

    test("uses saved-visibility when save-state is on", () => {
        const state = new StateManager(
            settingsWith({
                "save-state": true,
                "saved-visibility": true,
            }),
        );
        expect(state.isPanelRevealed()).toBe(true);
    });
});

describe("reveal changes", () => {
    test("toggling saves the state and notifies", () => {
        const settings = settingsWith({ "save-state": true });
        const state = new StateManager(settings);
        const changed = mock();
        state.setOnPanelRevealChanged(changed);

        expect(state.togglePanelReveal()).toBe(true);

        expect(settings.peek("saved-visibility")).toBe(true);
        expect(changed).toHaveBeenCalledWith(true);
    });

    test("toggling with save-state off resets the saved key", () => {
        const settings = settingsWith({ "saved-visibility": true });
        new StateManager(settings).togglePanelReveal();
        expect(settings.has("saved-visibility")).toBe(false);
    });

    test("setting the current state does nothing", () => {
        const state = new StateManager(settingsWith());
        const changed = mock();
        state.setOnPanelRevealChanged(changed);

        state.setPanelRevealed(false);

        expect(changed).not.toHaveBeenCalled();
    });

    test("turning save-state off goes back to the default", () => {
        const settings = settingsWith({
            "save-state": true,
            "saved-visibility": true,
        });
        const state = new StateManager(settings);

        settings.change("save-state", false);
        state.onSaveStateChanged();

        expect(state.isPanelRevealed()).toBe(false);
    });
});

describe("auto-hide", () => {
    const autoHide = { "auto-hide-enabled": true };

    test("collapses the tray after the configured delay", () => {
        const state = new StateManager(settingsWith(autoHide));
        state.setPanelRevealed(true);

        expect([...sources.values()][0].delay).toBe(5000);
        runSources();

        expect(state.isPanelRevealed()).toBe(false);
        expect(sources.size).toBe(0);
    });

    test("does not start when disabled", () => {
        new StateManager(settingsWith()).setPanelRevealed(true);
        expect(sources.size).toBe(0);
    });

    test("is cancelled by collapsing by hand", () => {
        const state = new StateManager(settingsWith(autoHide));
        state.setPanelRevealed(true);
        state.setPanelRevealed(false);
        expect(sources.size).toBe(0);
    });

    test("is cancelled by destroy", () => {
        const state = new StateManager(settingsWith(autoHide));
        state.setPanelRevealed(true);
        state.destroy();
        expect(sources.size).toBe(0);
    });
});

describe("visible items", () => {
    test("add ignores duplicates and remove takes one out", () => {
        const state = new StateManager(settingsWith());
        state.addVisibleItem("a");
        state.addVisibleItem("a");
        state.addVisibleItem("b");
        state.removeVisibleItem("a");
        expect(state.getVisibleItems()).toEqual(["b"]);
    });

    test("toggle reports the new membership", () => {
        const state = new StateManager(settingsWith());
        expect(state.toggleVisibleItem("a")).toBe(true);
        expect(state.toggleVisibleItem("a")).toBe(false);
        expect(state.getVisibleItems()).toEqual([]);
    });

    test("cleanOrphanedItems drops names no longer on the panel", () => {
        const state = new StateManager(
            settingsWith({ "visible-items": ["a", "gone"] }),
        );
        expect(state.cleanOrphanedItems(["a", "b"])).toBe(true);
        expect(state.getVisibleItems()).toEqual(["a"]);
        expect(state.cleanOrphanedItems(["a", "b"])).toBe(false);
    });
});
