import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { PanelManager } from "../../src/core/panelManager.ts";
import { StateManager } from "../../src/core/stateManager.ts";
import {
    addPanelItem,
    Button,
    fakeSettings,
    panel,
    resetPanel,
    runSources,
    Signals,
    sources,
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

function rename(child, name) {
    child.accessible_name = name;
    child.emit("notify::accessible-name");
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

describe("items whose owner changes their visibility", () => {
    test("an item its owner hides while expanded is not revealed", () => {
        setup();
        const { container } = addPanelItem("tray");
        container.visible = false;

        collapse();
        expand();

        expect(container.visible).toBe(false);
    });

    test("an item its owner shows again takes part in the tray", () => {
        setup();
        const { container } = addPanelItem("tray");
        container.visible = false;
        collapse();
        expand();

        container.visible = true;
        collapse();
        expect(container.visible).toBe(false);

        expand();
        expect(container.visible).toBe(true);
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

    test("return on expand when named after being hidden", () => {
        setup();
        collapse();
        const { container, child } = addPanelItem("");
        rename(child, "late-named");
        manager.getAllPanelItems();

        expand();

        expect(container.visible).toBe(true);
    });

    test("are listed under the name they get later", () => {
        setup();
        collapse();
        const { child } = addPanelItem("");

        rename(child, "late-named");

        expect(settings.peek("all-items")).toEqual(["late-named"]);
    });

    test("stay shown when listed in visible-items", () => {
        setup({ visibleItems: ["late"] });
        collapse();
        const { container } = addPanelItem("late");
        expect(container.visible).toBe(true);
    });
});

describe("visible-items changing while collapsed", () => {
    const applyList = (names) => {
        settings.set_strv("visible-items", names);
        manager.setPermanentVisibility(false);
    };

    test("an item switched on appears", () => {
        setup();
        const { container } = addPanelItem("tray");
        collapse();

        applyList(["tray"]);

        expect(container.visible).toBe(true);
    });

    test("an item switched off hides", () => {
        setup({ visibleItems: ["tray"] });
        const { container } = addPanelItem("tray");
        collapse();

        applyList([]);

        expect(container.visible).toBe(false);
    });

    test("an item its owner hid stays hidden when switched on", () => {
        const { container } = addPanelItem("tray", { visible: false });
        setup();
        collapse();

        applyList(["tray"]);

        expect(container.visible).toBe(false);
    });

    test("with animations, an item switched on fades in", async () => {
        setup();
        settings.set_boolean("animation-enabled", true);
        const { container } = addPanelItem("tray");
        collapse();
        container.emit("transitions-completed");

        applyList(["tray"]);
        await Bun.sleep(0);

        expect(container.visible).toBe(true);
        expect([...container.transitions.keys()]).toContain("veil-fade-in");
    });

    test("with animations, a listed item already showing is left alone", async () => {
        setup({ visibleItems: ["kept"] });
        settings.set_boolean("animation-enabled", true);
        const { container } = addPanelItem("kept");

        collapse();
        await Bun.sleep(0);

        expect(container.visible).toBe(true);
        expect(container.transitions.size).toBe(0);
    });
});

describe("animated collapse", () => {
    test("does not fade items that are already hidden", () => {
        setup();
        settings.set_boolean("animation-enabled", true);
        const { container } = addPanelItem("tray");

        collapse();
        container.emit("transitions-completed");
        expect(container.visible).toBe(false);

        collapse();
        expect(container.transitions.size).toBe(0);
        expect(sources.size).toBe(0);
    });

    test("an item hidden by the fade returns on expand", () => {
        setup();
        settings.set_boolean("animation-enabled", true);
        const { container } = addPanelItem("tray");

        collapse();
        container.emit("transitions-completed");
        expand();

        expect(container.visible).toBe(true);
    });
});

describe("tray item menus", () => {
    const originalGlobal = globalThis.global;
    let menu;
    let leaves;

    function pointerOver(actor) {
        globalThis.global = {
            get_pointer: () => [640, 400, 0],
            stage: { get_actor_at_pos: () => actor },
        };
    }

    beforeEach(() => {
        setup();
        settings.set_string("interaction-mode", "hover");
        manager.setPermanentVisibility(true);
        menu = new Signals();
        menu.isOpen = false;
        addPanelItem("tray", { menu });
        leaves = 0;
        manager.setOnPanelLeave(() => {
            leaves += 1;
        });
    });

    afterEach(() => {
        globalThis.global = originalGlobal;
    });

    test("closing one away from the panel counts as leaving", () => {
        pointerOver(null);
        menu.emit("open-state-changed");
        runSources();
        expect(leaves).toBe(1);
    });

    test("closing one over the panel does not", () => {
        pointerOver(panel);
        menu.emit("open-state-changed");
        runSources();
        expect(leaves).toBe(0);
    });

    test("opening one does not", () => {
        pointerOver(null);
        menu.isOpen = true;
        menu.emit("open-state-changed");
        runSources();
        expect(leaves).toBe(0);
    });

    test("destroy releases the signal", () => {
        manager.destroy();
        expect(menu.connectedTo("open-state-changed")).toBe(0);
    });
});

describe("auto-hide with tray menus", () => {
    let menu;
    let item;

    const fakeMenu = () => {
        const created = new Signals();
        created.isOpen = false;
        return created;
    };

    function setOpen(target, open) {
        target.isOpen = open;
        target.emit("open-state-changed");
    }

    const timers = () =>
        [...sources.values()].filter((source) => source.delay === 5000).length;

    beforeEach(() => {
        setup();
        settings.set_boolean("auto-hide-enabled", true);
        manager.setPermanentVisibility(true);
        menu = fakeMenu();
        item = addPanelItem("tray", { menu });
        collapse();
        expand();
    });

    test("an open menu stops the timer and closing it starts over", () => {
        expect(timers()).toBe(1);
        setOpen(menu, true);
        expect(timers()).toBe(0);
        setOpen(menu, false);
        expect(timers()).toBe(1);
    });

    test("the timer waits for the last open menu", () => {
        const other = fakeMenu();
        addPanelItem("other", { menu: other });
        setOpen(menu, true);
        setOpen(other, true);
        setOpen(menu, false);
        expect(timers()).toBe(0);
        setOpen(other, false);
        expect(timers()).toBe(1);
    });

    test("an applet destroyed with its menu open releases the hold", () => {
        setOpen(menu, true);
        item.child.emit("destroy");
        expect(timers()).toBe(1);
    });

    test("an item removed with its menu open releases the hold", () => {
        setOpen(menu, true);
        panel._rightBox.children.pop();
        panel._rightBox.emit("child-removed", item.container);
        expect(timers()).toBe(1);
    });

    test("a menu already open when its item arrives holds the timer", () => {
        const open = fakeMenu();
        open.isOpen = true;
        addPanelItem("open", { menu: open });
        expect(timers()).toBe(0);
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

    test("destroy leaves an applet that was destroyed first alone", () => {
        setup();
        manager.setPermanentVisibility(true);
        const { container, child } = addPanelItem("tray");

        child.emit("destroy");
        container.children = [];
        panel._rightBox.children.pop();
        panel._rightBox.emit("child-removed", container);
        child.disconnectObject = () => {
            throw new Error("touched a destroyed applet");
        };

        expect(() => manager.destroy()).not.toThrow();
    });

    test("destroy disconnects pending name watchers", () => {
        setup();
        collapse();
        const { child } = addPanelItem("");

        manager.destroy();

        expect(child.connectedTo("notify::accessible-name")).toBe(0);
    });

    test("showAllItems reveals everything Veil hid", () => {
        setup();
        const { container } = addPanelItem("tray");
        collapse();
        manager.showAllItems();
        expect(container.visible).toBe(true);
    });
});
