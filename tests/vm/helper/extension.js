import * as Main from "resource:///org/gnome/shell/ui/main.js";
import * as PanelMenu from "resource:///org/gnome/shell/ui/panelMenu.js";

// Veil has no D-Bus API, so the suites look at the panel through org.gnome.Shell.Eval.
// Eval needs unsafe mode and has no access to PanelMenu; this extension provides both.
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

const helper = {
    items: () => Main.panel._rightBox.get_children().map(describe),

    // Registers the way a tray applet does. An empty name leaves the accessible
    // name unset, like an AppIndicator before its D-Bus properties arrive.
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

    // Screen rectangle of an item, so tests can click it through the virtual pointer
    indicatorCenter() {
        const button = Main.panel.statusArea.veil;
        const [x, y] = button.get_transformed_position();
        const [width, height] = button.get_transformed_size();
        return [Math.round(x + width / 2), Math.round(y + height / 2)];
    },

    indicatorMenuOpen: () => Main.panel.statusArea.veil.menu.isOpen,

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
