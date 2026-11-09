import * as Main from "resource:///org/gnome/shell/ui/main.js";
import * as PanelMenu from "resource:///org/gnome/shell/ui/panelMenu.js";

const ROLE_PREFIX = "veil-test-";

function describe(container) {
    const child = container.firstChild;
    return {
        name: child?.accessible_name || child?.constructor.name || "",
        visible: container.visible,
        opacity: container.opacity,
        translationX: container.translation_x,
    };
}

function center(actor) {
    const [x, y] = actor.get_transformed_position();
    const [width, height] = actor.get_transformed_size();
    return [Math.round(x + width / 2), Math.round(y + height / 2)];
}

const helper = {
    items: () => Main.panel._rightBox.get_children().map(describe),

    addItem(role, name = "") {
        const button = new PanelMenu.Button(0, name, true);
        button.accessible_name = name;
        Main.panel.addToStatusArea(`${ROLE_PREFIX}${role}`, button, 0, "right");
    },

    renameItem(role, name) {
        Main.panel.statusArea[`${ROLE_PREFIX}${role}`].accessible_name = name;
    },

    setItemVisible(role, visible) {
        Main.panel.statusArea[`${ROLE_PREFIX}${role}`].container.visible =
            visible;
    },

    removeItem(role) {
        Main.panel.statusArea[`${ROLE_PREFIX}${role}`]?.destroy();
    },

    item: (role) =>
        describe(Main.panel.statusArea[`${ROLE_PREFIX}${role}`].container),

    indicatorCenter: () => center(Main.panel.statusArea.veil),

    itemCenter: (role) =>
        center(Main.panel.statusArea[`${ROLE_PREFIX}${role}`]),

    indicatorMenuOpen: () => Main.panel.statusArea.veil.menu.isOpen,

    closeIndicatorMenu: () => Main.panel.statusArea.veil.menu.close(),

    trayRevealed: (uuid) =>
        Main.extensionManager
            .lookup(uuid)
            .stateObj.stateManager.isPanelRevealed(),

    windowClasses: () =>
        global.get_window_actors().map((a) => a.meta_window.get_wm_class()),

    closeWindows(wmClass) {
        for (const actor of global.get_window_actors()) {
            if (actor.meta_window.get_wm_class() === wmClass)
                actor.meta_window.delete(global.get_current_time());
        }
    },
};

export default class VeilTestHelper {
    enable() {
        global.context.unsafe_mode = true;
        globalThis.veilTest = helper;
    }

    disable() {
        delete globalThis.veilTest;
        global.context.unsafe_mode = false;
    }
}
