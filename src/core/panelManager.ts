import Clutter from "gi://Clutter";
import type Gio from "gi://Gio";
import GLib from "gi://GLib";
import St from "gi://St";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import * as PanelMenu from "resource:///org/gnome/shell/ui/panelMenu.js";
import type { PopupMenu as ShellPopupMenu } from "resource:///org/gnome/shell/ui/popupMenu.js";
import { MainPanel, type PanelItem } from "../types/index.js";
import { logger } from "../utils/logger.js";
import { readInteractionMode } from "../utils/settings.js";
import { AnimationManager } from "./animationManager.js";
import { shouldOfferRevealForItem } from "./panelRevealRules.js";
import type { StateManager } from "./stateManager.js";

export type HoverInteractionZone = "none" | "indicator" | "panel";

export class PanelManager {
    private settings: Gio.Settings;
    private veilIndicator: PanelMenu.Button;
    private animationManager: AnimationManager;
    private onItemsChangedCallback?: (items: string[]) => void;
    private stateManager: StateManager;
    private initialSetupComplete = false;
    private hoverHideTimerId: number | null = null;
    private onHoverCompleteCallback?: () => void;
    private onPanelLeaveCallback?: () => void;
    private items: PanelItem[] = [];
    private hoverInteractionZone: HoverInteractionZone = "none";
    private pointerDownOnPanelItem = false;
    private connectedApplets: Set<Clutter.Actor> = new Set();
    private nameWatchedApplets: Set<St.Widget> = new Set();
    private containersAwaitingChild: Set<Clutter.Actor> = new Set();
    private readonly nameWatchOwner = {};
    private hiddenByVeil: Set<Clutter.Actor> = new Set();
    private menuCloseIdleSourceIds: Set<number> = new Set();

    constructor(
        settings: Gio.Settings,
        veilIndicator: PanelMenu.Button,
        stateManager: StateManager,
    ) {
        this.settings = settings;
        this.veilIndicator = veilIndicator;
        this.stateManager = stateManager;
        this.animationManager = new AnimationManager(settings);
        this.setupListeners();
        this.updateAllItemsList();
        this.attachHoverHandlersToExistingItems();
    }

    private setupListeners() {
        MainPanel._rightBox.connectObject(
            "child-added",
            this._onItemAdded.bind(this),
            "child-removed",
            this._onItemRemoved.bind(this),
            this,
        );

        logger.debug("Panel listeners setup complete");
    }

    private attachHoverHandlersToExistingItems() {
        const items = MainPanel._rightBox.get_children() as St.Widget[];
        items.forEach((actor) => {
            const child = actor.firstChild;
            if (!child) return;
            if (child === MainPanel.statusArea.quickSettings) return;
            if (child === this.veilIndicator) return;
            this.attachHoverHandlers(child);
        });
    }

    private forgetChild(child: Clutter.Actor) {
        this.connectedApplets.delete(child);
        this.nameWatchedApplets.delete(child as St.Widget);
    }

    private detachHoverHandlersFromChild(child: Clutter.Actor) {
        if (!this.connectedApplets.delete(child)) return;

        child.disconnectObject(this);
        if (child instanceof PanelMenu.Button) {
            child.menu?.disconnectObject(this);
        }
    }

    private stopWatchingName(child: St.Widget) {
        if (this.nameWatchedApplets.delete(child)) {
            child.disconnectObject(this.nameWatchOwner);
        }
    }

    private attachHoverHandlers(child: Clutter.Actor) {
        this.detachHoverHandlersFromChild(child);

        child.connectObject(
            "enter-event",
            () => {
                if (readInteractionMode(this.settings) !== "hover") {
                    return Clutter.EVENT_PROPAGATE;
                }
                this.setHoverInteractionZone("panel");
                return Clutter.EVENT_PROPAGATE;
            },
            "leave-event",
            () => {
                if (readInteractionMode(this.settings) !== "hover") {
                    return Clutter.EVENT_PROPAGATE;
                }
                const shellMenu =
                    child instanceof PanelMenu.Button
                        ? (child.menu as ShellPopupMenu | null)
                        : null;
                if (shellMenu?.isOpen) {
                    return Clutter.EVENT_PROPAGATE;
                }
                if (this.pointerDownOnPanelItem) {
                    return Clutter.EVENT_PROPAGATE;
                }
                this.setHoverInteractionZone("none");
                this.onPanelLeaveCallback?.();
                return Clutter.EVENT_PROPAGATE;
            },
            "button-press-event",
            () => {
                this.pointerDownOnPanelItem = true;
                return Clutter.EVENT_PROPAGATE;
            },
            "button-release-event",
            () => {
                this.pointerDownOnPanelItem = false;
                return Clutter.EVENT_PROPAGATE;
            },
            "destroy",
            () => {
                this.forgetChild(child);
            },
            this,
        );

        this.connectedApplets.add(child);
        this.attachMenuOpenStateHandlerIfNeeded(child);
    }

    /**
     * Dismissing a tray menu with an outside click often never delivers
     * `button-release-event` to the applet. Without this reset, the guard stays
     * set and later real leaves are ignored, so hover hide never runs.
     */
    private clearPointerDownHoverGuard() {
        if (!this.pointerDownOnPanelItem) return;
        this.pointerDownOnPanelItem = false;
    }

    private attachMenuOpenStateHandlerIfNeeded(child: Clutter.Actor) {
        if (!(child instanceof PanelMenu.Button)) return;

        const menu = child.menu as ShellPopupMenu;
        if (!menu) return;

        menu.connectObject(
            "open-state-changed",
            () => {
                if (menu.isOpen) {
                    this.clearPointerDownHoverGuard();
                    return undefined;
                }
                this.clearPointerDownHoverGuard();
                this.scheduleSyncHoverAfterMenuCloseIdle();
                return undefined;
            },
            this,
        );
    }

    pointerInHoverSafeZone(): boolean {
        const [x, y] = global.get_pointer();
        let actor: Clutter.Actor | null = global.stage.get_actor_at_pos(
            Clutter.PickMode.REACTIVE,
            x,
            y,
        );

        while (actor) {
            if (actor === Main.panel) return true;
            if (actor instanceof St.Widget) {
                const cls = actor.get_style_class_name() ?? "";
                if (cls.split(/\s+/).includes("popup-menu")) return true;
            }
            actor = actor.get_parent();
        }
        return false;
    }

    private scheduleSyncHoverAfterMenuCloseIdle() {
        const id = GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
            this.menuCloseIdleSourceIds.delete(id);
            this.syncHoverAfterPanelMenuClose();
            return GLib.SOURCE_REMOVE;
        });

        this.menuCloseIdleSourceIds.add(id);
    }

    private syncHoverAfterPanelMenuClose() {
        if (readInteractionMode(this.settings) !== "hover") return;
        if (this.pointerInHoverSafeZone()) return;

        this.setHoverInteractionZone("none");
        this.onPanelLeaveCallback?.();
    }

    private _onItemAdded(_container: St.BoxLayout, actor: Clutter.Actor) {
        logger.debug("Panel item added", { actor });

        this.updateAllItemsList();

        if (this.initialSetupComplete) {
            this.applyNewItemVisibility(actor);
        }

        this.onItemsChangedCallback?.(this.getAllItemNames());
    }

    private reconcileOriginalVisible(
        prior: boolean | undefined,
        container: Clutter.Actor,
    ): boolean | undefined {
        if (container.visible) {
            return true;
        }
        return this.hiddenByVeil.has(container) ? prior : false;
    }

    private applyNewItemVisibility(actor: Clutter.Actor) {
        const child = actor.firstChild;

        if (!child) {
            actor.connectObject(
                "notify::first-child",
                () => {
                    actor.disconnectObject(this);
                    this.containersAwaitingChild.delete(actor);
                    this.applyNewItemVisibility(actor);
                },
                this,
            );
            this.containersAwaitingChild.add(actor);
            return;
        }

        if (
            child === MainPanel.statusArea.quickSettings ||
            child === this.veilIndicator
        ) {
            return;
        }

        this.attachHoverHandlers(child);

        const itemName = this.getItemName(child as St.Widget);
        if (itemName) {
            this.handleNewItemVisibility(itemName, actor);
        }

        this.watchForNameChange(child as St.Widget, actor);
    }

    private watchForNameChange(child: St.Widget, actor: Clutter.Actor) {
        if (this.nameWatchedApplets.has(child)) {
            return;
        }

        child.connectObject(
            "notify::accessible-name",
            () => {
                const itemName = this.getItemName(child);
                if (itemName) {
                    this.handleNewItemVisibility(itemName, actor);
                }
                this.stopWatchingName(child);
                this.updateAllItemsList();
                this.onItemsChangedCallback?.(this.getAllItemNames());
            },
            this.nameWatchOwner,
        );
        this.nameWatchedApplets.add(child);
    }

    private _onItemRemoved(_container: St.BoxLayout, actor: Clutter.Actor) {
        logger.debug("Panel item removed", { actor });

        this.animationManager.cancelAnimation(actor);
        this.hiddenByVeil.delete(actor);

        if (this.containersAwaitingChild.delete(actor)) {
            actor.disconnectObject(this);
        }

        const child = actor.firstChild;
        if (child) {
            this.detachHoverHandlersFromChild(child);
            this.stopWatchingName(child as St.Widget);
        }

        this.updateAllItemsList();
        this.onItemsChangedCallback?.(this.getAllItemNames());
    }

    private updateAllItemsList() {
        this.items = this.getAllPanelItems();
        const itemNames = this.getAllItemNames();
        this.settings.set_strv("all-items", itemNames);
        logger.debug("Updated all-items list", { count: itemNames.length });
    }

    getAllItemNames(): string[] {
        const rightBoxItems = MainPanel._rightBox.get_children();
        const itemNames: string[] = [];

        rightBoxItems.forEach(
            (item: Clutter.Actor<Clutter.LayoutManager, Clutter.Content>) => {
                const child = item.firstChild;
                if (!child) return;

                if (
                    child === MainPanel.statusArea.quickSettings ||
                    child === this.veilIndicator
                ) {
                    return;
                }

                const name = this.getItemName(child as St.Widget);

                if (name) {
                    itemNames.push(name);
                }
            },
        );

        return itemNames;
    }

    getAllPanelItems(): PanelItem[] {
        const rightBoxItems = MainPanel._rightBox.get_children();
        const items: PanelItem[] = [];

        rightBoxItems.forEach(
            (item: Clutter.Actor<Clutter.LayoutManager, Clutter.Content>) => {
                const child = item.firstChild;
                if (!child) return;

                if (
                    child === MainPanel.statusArea.quickSettings ||
                    child === this.veilIndicator
                ) {
                    return;
                }

                const name = this.getItemName(child as St.Widget);

                if (name) {
                    const existing = this.items.find(
                        (i) => i.container === item,
                    );

                    items.push({
                        name,
                        actor: child as St.Widget,
                        container: item as St.Widget,
                        originalVisible: this.reconcileOriginalVisible(
                            existing?.originalVisible,
                            item,
                        ),
                    });
                }
            },
        );

        return items;
    }

    getItemName(item: St.Widget): string | null {
        if (item.accessible_name && item.accessible_name !== "") {
            return item.accessible_name;
        }

        if (item.constructor && "name" in item.constructor) {
            return item.constructor.name;
        }

        return null;
    }

    setPermanentVisibility(revealed: boolean) {
        this.initialSetupComplete = true;

        const panelItems = this.getAllPanelItems();
        const visibleItems = this.settings.get_strv("visible-items");
        const animationEnabled = this.settings.get_boolean("animation-enabled");
        const animateAllItems = this.settings.get_boolean("animate-all-items");

        const itemsToAnimate = animateAllItems
            ? panelItems
            : panelItems.filter((item) => !visibleItems.includes(item.name));

        const listedItems = panelItems.filter((item) =>
            visibleItems.includes(item.name),
        );

        if (revealed) {
            if (animationEnabled) {
                this.fadeInItems(itemsToAnimate);
            } else {
                this.showItemsInstantly([...itemsToAnimate, ...listedItems]);
            }
        } else {
            panelItems.forEach((item) => {
                this.watchForNameChange(item.actor, item.container);
            });

            if (animationEnabled) {
                this.fadeOutItemsAndRestore(itemsToAnimate, listedItems);
            } else {
                this.hideItemsInstantly(itemsToAnimate);
                this.showItemsInstantly(listedItems);
            }
        }

        logger.debug("Set permanent panel visibility", {
            revealed,
            totalItems: panelItems.length,
            visibleItemsCount: visibleItems.length,
            animated: animationEnabled,
        });
    }

    private showItemsInstantly(items: PanelItem[]) {
        const visibleItems = this.settings.get_strv("visible-items");

        items.forEach((item) => {
            if (!shouldOfferRevealForItem(item, visibleItems)) {
                return;
            }
            this.hiddenByVeil.delete(item.container);
            item.container.visible = true;
            item.container.opacity = 255;
        });
    }

    private markHiddenByVeil(container: Clutter.Actor) {
        if (container.visible) {
            this.hiddenByVeil.add(container);
        }
    }

    private hideItemsInstantly(items: PanelItem[]) {
        items.forEach((item) => {
            this.markHiddenByVeil(item.container);
            item.container.visible = false;
        });
    }

    private fadeInItems(items: PanelItem[]) {
        const visibleItems = this.settings.get_strv("visible-items");

        items.forEach((item) => {
            if (!shouldOfferRevealForItem(item, visibleItems)) {
                return;
            }
            this.hiddenByVeil.delete(item.container);
            this.animationManager.fadeIn(item.container);
        });
    }

    private fadeOutItemsAndRestore(
        itemsToHide: PanelItem[],
        itemsToRestore: PanelItem[],
    ) {
        const fadeOutPromises = itemsToHide
            .filter((item) => item.container.visible)
            .map((item) => {
                this.markHiddenByVeil(item.container);
                return this.animationManager.fadeOut(item.container);
            });

        Promise.all(fadeOutPromises).then(() => {
            this.fadeInItems(
                itemsToRestore.filter((item) => !item.container.visible),
            );
        });
    }

    showAllItems() {
        const panelItems = this.getAllPanelItems();
        panelItems.forEach((item) => {
            item.container.visible = true;
        });
        logger.debug("Showed all panel items", { count: panelItems.length });
    }

    setOnItemsChanged(callback: (items: string[]) => void) {
        this.onItemsChangedCallback = callback;
    }

    setOnHoverComplete(callback: () => void) {
        this.onHoverCompleteCallback = callback;
    }

    setOnPanelLeave(callback: () => void) {
        this.onPanelLeaveCallback = callback;
    }

    /**
     * Call when switching to hover interaction mode. Tray handlers update the hover
     * zone even in click mode, so stale `panel` can block `scheduleTemporaryHide`;
     * pending hover timers from a previous session should not run after the switch.
     */
    resetHoverStateForModeEntry() {
        this.cancelHoverHideTimer();
        this.setHoverInteractionZone("none");
    }

    setHoverInteractionZone(zone: HoverInteractionZone) {
        this.hoverInteractionZone = zone;
        logger.debug("Hover interaction zone changed", {
            zone: this.hoverInteractionZone,
        });
    }

    setTemporaryVisibility() {
        this.cancelHoverHideTimer();

        const panelItems = this.getAllPanelItems();
        const animationEnabled = this.settings.get_boolean("animation-enabled");

        if (animationEnabled) {
            const itemsNeedingReveal = panelItems.filter(
                (item) => !item.container.visible,
            );
            this.fadeInItems(itemsNeedingReveal);

            const itemsToFix = panelItems.filter(
                (item) =>
                    item.originalVisible !== false &&
                    item.container.visible &&
                    item.container.opacity < 255,
            );
            itemsToFix.forEach((item) => {
                item.container.opacity = 255;
            });
        } else {
            this.showItemsInstantly(panelItems);
            panelItems.forEach((item) => {
                if (item.container.visible) {
                    item.container.set_translation(0, 0, 0);
                }
            });
        }
    }

    scheduleTemporaryHide() {
        if (readInteractionMode(this.settings) !== "hover") {
            return;
        }
        if (this.hoverInteractionZone !== "none") {
            return;
        }

        const hideOnLeave = this.settings.get_boolean("hover-hide-on-leave");

        if (hideOnLeave) {
            this.restoreVisibilityToSavedState();
            this.onHoverCompleteCallback?.();
        } else {
            this.cancelHoverHideTimer();

            const hoverDuration = this.settings.get_int("hover-duration");

            this.hoverHideTimerId = GLib.timeout_add_seconds(
                GLib.PRIORITY_DEFAULT,
                hoverDuration,
                () => {
                    this.hoverHideTimerId = null;
                    if (this.hoverInteractionZone !== "none") {
                        return GLib.SOURCE_REMOVE;
                    }
                    this.restoreVisibilityToSavedState();
                    this.onHoverCompleteCallback?.();
                    return GLib.SOURCE_REMOVE;
                },
            );
        }
    }

    private cancelHoverHideTimer() {
        if (this.hoverHideTimerId !== null) {
            GLib.Source.remove(this.hoverHideTimerId);
            this.hoverHideTimerId = null;
        }
    }

    private restoreVisibilityToSavedState() {
        const revealed = this.stateManager.isPanelRevealed();
        this.setPermanentVisibility(revealed);
        logger.debug("Restored visibility to saved state", {
            revealed,
        });
    }

    private handleNewItemVisibility(
        itemName: string,
        container: Clutter.Actor,
    ) {
        if (!container.visible && !this.hiddenByVeil.has(container)) {
            return;
        }

        this.animationManager.cancelAnimation(container);

        const shouldBeVisible =
            this.stateManager.isPanelRevealed() ||
            this.settings.get_strv("visible-items").includes(itemName);

        if (shouldBeVisible) {
            this.hiddenByVeil.delete(container);
        } else {
            this.markHiddenByVeil(container);
        }
        container.visible = shouldBeVisible;
        container.opacity = 255;
        container.set_translation(0, 0, 0);
        logger.debug("New item visibility set", {
            itemName,
            visible: shouldBeVisible,
        });
    }

    destroy() {
        this.cancelHoverHideTimer();
        for (const id of this.menuCloseIdleSourceIds) {
            GLib.Source.remove(id);
        }
        this.menuCloseIdleSourceIds.clear();
        this.animationManager.destroy();

        for (const child of [...this.connectedApplets]) {
            this.detachHoverHandlersFromChild(child);
        }

        for (const child of [...this.nameWatchedApplets]) {
            this.stopWatchingName(child);
        }

        for (const actor of this.containersAwaitingChild) {
            actor.disconnectObject(this);
        }
        this.containersAwaitingChild.clear();

        this.hiddenByVeil.clear();

        MainPanel._rightBox.disconnectObject(this);

        logger.debug("PanelManager destroyed");
    }
}
