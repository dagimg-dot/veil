import { beforeEach, describe, expect, test } from "bun:test";
import { PanelManager } from "../../src/core/panelManager.ts";
import { StateManager } from "../../src/core/stateManager.ts";
import {
    addPanelItem,
    Button,
    fakeSettings,
    panel,
    resetPanel,
    Widget,
} from "./fakes.js";

let settings;
let state;
let indicator;
let manager;

function setup({ revealed = true, visibleItems = [] } = {}) {
    settings = fakeSettings({
        "save-state": false,
        "saved-visibility": false,
        "default-visibility": revealed,
        "auto-hide-enabled": false,
        "auto-hide-duration": 5,
        "visible-items": visibleItems,
        "all-items": [],
        "animation-enabled": false,
        "animate-all-items": false,
        "animation-duration": 200,
        "interaction-mode": "click",
        "hover-hide-on-leave": true,
        "hover-duration": 2,
    });
    state = new StateManager(settings);
    indicator = new Button();
    manager = new PanelManager(settings, indicator, state);
}

function collapse() {
    state.setPanelRevealed(false);
    manager.setPermanentVisibility(false);
}

function expand() {
    state.setPanelRevealed(true);
    manager.setPermanentVisibility(true);
}

beforeEach(() => {
    resetPanel();
});

describe("item discovery", () => {
    test("lists tray items by accessible name in all-items", () => {
        setup();
        addPanelItem("first");
        addPanelItem("second");
        expect(settings.peek("all-items")).toEqual(["first", "second"]);
    });

    test("falls back to the constructor name", () => {
        setup();
        addPanelItem("");
        expect(settings.peek("all-items")).toEqual(["Button"]);
    });

    test("skips Quick Settings and Veil's own indicator", () => {
        setup();
        for (const child of [panel.statusArea.quickSettings, indicator]) {
            const container = new Widget();
            container.children = [child];
            panel._rightBox.children.push(container);
        }
        addPanelItem("tray");
        expect(manager.getAllItemNames()).toEqual(["tray"]);
    });

    test("reports changes to the items callback", () => {
        setup();
        const seen = [];
        manager.setOnItemsChanged((items) => seen.push(items));
        addPanelItem("tray");
        expect(seen).toEqual([["tray"]]);
    });
});

describe("permanent visibility without animation", () => {
    test("collapsing hides items and expanding shows them", () => {
        setup();
        const { container } = addPanelItem("tray");

        collapse();
        expect(container.visible).toBe(false);

        expand();
        expect(container.visible).toBe(true);
        expect(container.opacity).toBe(255);
    });

    test("visible-items stay shown while collapsed", () => {
        setup({ visibleItems: ["kept"] });
        const kept = addPanelItem("kept");
        const hidden = addPanelItem("hidden");

        collapse();

        expect(kept.container.visible).toBe(true);
        expect(hidden.container.visible).toBe(false);
    });

    test("an item already hidden when Veil starts is not revealed", () => {
        const { container } = addPanelItem("tray", { visible: false });
        setup();

        collapse();
        expand();

        expect(container.visible).toBe(false);
    });
});

describe("items added later", () => {
    test("are hidden when added to a collapsed tray", () => {
        setup();
        collapse();
        const { container } = addPanelItem("late");
        expect(container.visible).toBe(false);
    });

    test("are shown after expanding", () => {
        setup();
        collapse();
        const { container } = addPanelItem("late");
        expand();
        expect(container.visible).toBe(true);
    });

    test("stay shown when listed in visible-items", () => {
        setup({ visibleItems: ["late"] });
        collapse();
        const { container } = addPanelItem("late");
        expect(container.visible).toBe(true);
    });
});

describe("cleanup", () => {
    test("removing an item drops its signal handlers", () => {
        setup();
        manager.setPermanentVisibility(true);
        const { container, child } = addPanelItem("tray");

        panel._rightBox.children.pop();
        panel._rightBox.emit("child-removed", container);

        expect(child.handlers.size).toBe(0);
        expect(settings.peek("all-items")).toEqual([]);
    });

    test("destroy disconnects from the panel and its items", () => {
        setup();
        manager.setPermanentVisibility(true);
        const { child } = addPanelItem("tray");

        manager.destroy();

        expect(panel._rightBox.handlers.size).toBe(0);
        expect(child.connectedTo("enter-event")).toBe(0);
    });

    test("showAllItems reveals everything Veil hid", () => {
        setup();
        const { container } = addPanelItem("tray");
        collapse();
        manager.showAllItems();
        expect(container.visible).toBe(true);
    });
});
