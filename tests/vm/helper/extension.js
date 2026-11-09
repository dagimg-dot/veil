import St from "gi://St";
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

const emptyContainers = new Map();
let markedIndicatorIcon = null;

const helper = {
    items: () => Main.panel._rightBox.get_children().map(describe),

    addItem(role, name = "", realMenu = false) {
        const button = new PanelMenu.Button(0, name, !realMenu);
        button.accessible_name = name;
        if (realMenu) button.menu.addAction("Test action", () => {});
        Main.panel.addToStatusArea(`${ROLE_PREFIX}${role}`, button, 0, "right");
    },

    itemStyle: (role) =>
        Main.panel.statusArea[`${ROLE_PREFIX}${role}`].get_style() ?? "",

    setItemStyle(role, style) {
        Main.panel.statusArea[`${ROLE_PREFIX}${role}`].set_style(style);
    },

    addEmptyContainer(role) {
        const container = new St.Bin();
        emptyContainers.set(role, container);
        Main.panel._rightBox.insert_child_at_index(container, 0);
    },

    fillContainer(role, name) {
        emptyContainers
            .get(role)
            .set_child(new St.Widget({ accessible_name: name }));
    },

    containerState: (role) => describe(emptyContainers.get(role)),

    removeContainer(role) {
        emptyContainers.get(role)?.destroy();
        emptyContainers.delete(role);
    },

    indicatorIcon: () =>
        Main.panel.statusArea.veil.get_first_child()?.gicon?.to_string() ?? "",

    markIndicatorIcon() {
        markedIndicatorIcon = Main.panel.statusArea.veil.get_first_child();
    },

    indicatorIconMarked: () =>
        Main.panel.statusArea.veil.get_first_child() === markedIndicatorIcon,

    dropWindowFocus() {
        global.display.unset_input_focus(global.get_current_time());
    },

    focusedWindowClass: () =>
        global.display.focus_window?.get_wm_class() ?? null,

    activateSettingsItem() {
        Main.panel.statusArea.veil.menu._getMenuItems()[0].activate(null);
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

    itemMenuOpen: (role) =>
        Main.panel.statusArea[`${ROLE_PREFIX}${role}`].menu.isOpen,

    closeItemMenu(role) {
        Main.panel.statusArea[`${ROLE_PREFIX}${role}`].menu.close();
    },

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
