/**
 * Panel tray UI: tracks right-box items, animations, and hover interaction.
 *
 * Invariants:
 * - **Permanent visibility** (`setPermanentVisibility`) reflects `StateManager` /
 *   GSettings: the user’s collapsed vs expanded tray preference. It may write
 *   through to `StateManager` only indirectly via extension flows; this layer
 *   applies Clutter visibility to match that state.
 * - **Temporary visibility** (`setTemporaryVisibility` / `scheduleTemporaryHide`)
 *   is hover-only preview: it never updates `StateManager`; teardown restores
 *   via `restoreVisibilityToSavedState` → `setPermanentVisibility(isPanelRevealed())`.
 * - **`originalVisible === false`** means another extension hid the icon while the
 *   tray was expanded — not Veil’s own collapsed hide (see `mergeOriginalVisibleSnapshot`).
 */
import Clutter from "gi://Clutter";
import type Gio from "gi://Gio";
import GLib from "gi://GLib";
import St from "gi://St";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import * as PanelMenu from "resource:///org/gnome/shell/ui/panelMenu.js";
import type { PopupMenu as ShellPopupMenu } from "resource:///org/gnome/shell/ui/popupMenu.js";
import { MainPanel, type PanelItem } from "../types/index.js";
import { logger } from "../utils/logger.js";
import { AnimationManager } from "./animationManager.js";
import { shouldOfferRevealForItem } from "./panelRevealRules.js";
import type { StateManager } from "./stateManager.js";

/**
 * Pointer hover region (interaction-mode hover only).
 * Valid transitions include: none ↔ indicator (Veil), none/indicator ↔ panel
 * (tray items); menu-close sync and leave handlers may set none.
 */
export type HoverInteractionZone = "none" | "indicator" | "panel";

export class PanelManager {
	private settings: Gio.Settings;
	private veilIndicator: PanelMenu.Button;
	private animationManager: AnimationManager;
	private addedHandlerId: number | null = null;
	private removedHandlerId: number | null = null;
	private onItemsChangedCallback?: (items: string[]) => void;
	private stateManager: StateManager;
	private initialSetupComplete = false;
	private hoverHideTimerId: number | null = null;
	private onHoverCompleteCallback?: () => void;
	private onPanelLeaveCallback?: () => void;
	private items: PanelItem[] = [];
	private hoverInteractionZone: HoverInteractionZone = "none";
	/** True between button-press and release on a right-box item (avoids spurious leave on click). */
	private pointerDownOnPanelItem = false;
	/** Per-tray-applet hover/press signals on `actor.firstChild` (enter, leave, press, release). */
	private itemHoverHandlers: Map<Clutter.Actor, number[]> = new Map();
	/** `open-state-changed` on each tray `PanelMenu.Button.menu`, keyed by the button actor */
	private menuOpenStateHandlers: Map<Clutter.Actor, number> = new Map();
	// Watch for late accessible_name changes
	private nameChangeHandlers: Map<St.Widget, number> = new Map();
	private firstChildHandlers: Map<St.Widget, number> = new Map();
	/** Pending `idle_add` from tray menu `open-state-changed` (removed in `destroy()`). */
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
		this.addedHandlerId = MainPanel._rightBox.connect(
			"child-added",
			this._onItemAdded.bind(this),
		);

		this.removedHandlerId = MainPanel._rightBox.connect(
			"child-removed",
			this._onItemRemoved.bind(this),
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
			this.attachHoverHandlers(actor, child);
		});
	}

	private detachHoverHandlersFromChild(child: Clutter.Actor) {
		const ids = this.itemHoverHandlers.get(child);
		if (!ids) return;

		for (const id of ids) {
			child.disconnect(id);
		}

		this.itemHoverHandlers.delete(child);
	}

	private attachHoverHandlers(_actor: St.Widget, child: Clutter.Actor) {
		this.detachHoverHandlersFromChild(child);

		const ids: number[] = [];

		ids.push(
			child.connect("enter-event", () => {
				if (this.settings.get_string("interaction-mode") !== "hover") {
					return Clutter.EVENT_PROPAGATE;
				}
				this.setHoverInteractionZone("panel");
				return Clutter.EVENT_PROPAGATE;
			}),
		);

		ids.push(
			child.connect("leave-event", () => {
				if (this.settings.get_string("interaction-mode") !== "hover") {
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
			}),
		);

		ids.push(
			child.connect("button-press-event", () => {
				this.pointerDownOnPanelItem = true;
				return Clutter.EVENT_PROPAGATE;
			}),
		);

		ids.push(
			child.connect("button-release-event", () => {
				this.pointerDownOnPanelItem = false;
				return Clutter.EVENT_PROPAGATE;
			}),
		);

		this.itemHoverHandlers.set(child, ids);
		this.attachMenuOpenStateHandlerIfNeeded(child);
	}

	/**
	 * Resets the press guard used to ignore spurious `leave-event` during a click.
	 *
	 * Dismissing a tray menu with an outside click often never delivers
	 * `button-release-event` to the applet. Without this reset, the guard stays
	 * set and later real leaves are ignored, so hover hide never runs.
	 */
	private clearPointerDownHoverGuard() {
		if (!this.pointerDownOnPanelItem) return;
		this.pointerDownOnPanelItem = false;
	}

	private attachMenuOpenStateHandlerIfNeeded(child: Clutter.Actor) {
		if (this.menuOpenStateHandlers.has(child)) return;
		if (!(child instanceof PanelMenu.Button)) return;

		const menu = child.menu as ShellPopupMenu;
		if (!menu) return;

		const handlerId = menu.connect("open-state-changed", () => {
			// isOpen is updated before emit; avoids relying on callback arity.
			if (menu.isOpen) {
				this.clearPointerDownHoverGuard();
				return undefined;
			}
			this.clearPointerDownHoverGuard();
			this.scheduleSyncHoverAfterMenuCloseIdle();
			return undefined;
		});
		this.menuOpenStateHandlers.set(child, handlerId);
	}

	/** Cursor still over the top panel or a Shell popup (e.g. tray menu under uiGroup). */
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
		if (this.settings.get_string("interaction-mode") !== "hover") return;
		if (this.pointerInHoverSafeZone()) return;

		this.setHoverInteractionZone("none");
		this.onPanelLeaveCallback?.();
	}

	private _onItemAdded(_container: St.Widget, actor: St.Widget) {
		logger.debug("Panel item added", { actor });

		const child = actor.firstChild;
		const panelRevealed = this.stateManager.isPanelRevealed();
		if (child) {
			const itemName = this.getItemName(child as St.Widget);
			if (itemName) {
				const existing = this.items.find((i) => i.name === itemName);
				if (existing && existing.originalVisible !== false) {
					existing.originalVisible = this.mergeOriginalVisibleSnapshot(
						existing.originalVisible,
						actor.visible,
						panelRevealed,
					);
				}
			}
		}

		this.updateAllItemsList();

		if (this.initialSetupComplete) {
			this.applyNewItemVisibility(actor);
		}

		this.onItemsChangedCallback?.(this.getAllItemNames());
	}

	/**
	 * `false` = hidden while tray expanded (treat as another extension’s hide).
	 * When collapsed, `container.visible === false` is often Veil’s hide — use `undefined`.
	 */
	private mergeOriginalVisibleSnapshot(
		prior: boolean | undefined,
		containerVisible: boolean,
		panelRevealed: boolean,
	): boolean | undefined {
		if (prior === false) {
			return false;
		}
		if (prior === true) {
			return true;
		}
		if (!containerVisible && !panelRevealed) {
			return undefined;
		}
		if (!containerVisible && panelRevealed) {
			return false;
		}
		return true;
	}

	private applyNewItemVisibility(actor: St.Widget) {
		const child = actor.firstChild;

		if (!child) {
			// Container was added before its child widget; defer until child arrives
			const handlerId = actor.connect("notify::first-child", () => {
				actor.disconnect(handlerId);
				this.firstChildHandlers.delete(actor);
				this.applyNewItemVisibility(actor);
			});
			this.firstChildHandlers.set(actor, handlerId);
			return;
		}

		if (
			child === MainPanel.statusArea.quickSettings ||
			child === this.veilIndicator
		) {
			return;
		}

		this.attachHoverHandlers(actor, child);

		const itemName = this.getItemName(child as St.Widget);
		if (itemName) {
			this.handleNewItemVisibility(itemName, actor);
		}

		this.watchForNameChange(child as St.Widget, actor);
	}

	private watchForNameChange(child: St.Widget, actor: St.Widget) {
		// Skip if we already have a handler for this item
		if (this.nameChangeHandlers.has(child)) {
			return;
		}

		const handlerId = child.connect("notify::accessible-name", () => {
			// Re-apply visibility now that we have a name
			const itemName = this.getItemName(child);
			if (itemName) {
				this.handleNewItemVisibility(itemName, actor);
			}
			// Disconnect after name is set (one-time watcher)
			child.disconnect(handlerId);
			this.nameChangeHandlers.delete(child);
		});
		this.nameChangeHandlers.set(child, handlerId);
	}

	private _onItemRemoved(_container: St.Widget, actor: St.Widget) {
		logger.debug("Panel item removed", { actor });

		// Clean up handlers
		const firstChildHandler = this.firstChildHandlers.get(actor);
		if (firstChildHandler !== undefined) {
			actor.disconnect(firstChildHandler);
			this.firstChildHandlers.delete(actor);
		}

		const child = actor.firstChild;
		if (child) {
			this.detachHoverHandlersFromChild(child);

			const nameHandler = this.nameChangeHandlers.get(child as St.Widget);
			if (nameHandler !== undefined) {
				(child as St.Widget).disconnect(nameHandler);
				this.nameChangeHandlers.delete(child as St.Widget);
			}

			const menuHandlerId = this.menuOpenStateHandlers.get(child);
			if (menuHandlerId !== undefined) {
				const button = child as PanelMenu.Button;
				if (button.menu) button.menu.disconnect(menuHandlerId);
				this.menuOpenStateHandlers.delete(child);
			}
		}

		this.updateAllItemsList();
		this.onItemsChangedCallback?.(this.getAllItemNames());
	}

	private updateAllItemsList() {
		// Track items with their initial visibility
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

				// Skip Quick Settings and Veil indicator
				if (
					child === MainPanel.statusArea.quickSettings ||
					child === this.veilIndicator
				) {
					return;
				}

				// Get item name
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

				// Skip Quick Settings and Veil indicator
				if (
					child === MainPanel.statusArea.quickSettings ||
					child === this.veilIndicator
				) {
					return;
				}

				const name = this.getItemName(child as St.Widget);

				if (name) {
					const existing = this.items.find((i) => i.name === name);
					const panelRevealed = this.stateManager.isPanelRevealed();
					const originalVis = this.mergeOriginalVisibleSnapshot(
						existing?.originalVisible,
						item.visible,
						panelRevealed,
					);

					items.push({
						name,
						actor: child as St.Widget,
						container: item as St.Widget,
						originalVisible: originalVis,
					});
				}
			},
		);

		return items;
	}

	getItemName(item: St.Widget): string | null {
		// Try accessible_name first
		if (item.accessible_name && item.accessible_name !== "") {
			return item.accessible_name;
		}

		// Fall back to constructor type name
		if (item.constructor && "name" in item.constructor) {
			return item.constructor.name;
		}

		return null;
	}

	isItemVisible(item: PanelItem): boolean {
		const visibleItems = this.settings.get_strv("visible-items");
		return visibleItems.includes(item.name);
	}

	setPermanentVisibility(revealed: boolean) {
		this.initialSetupComplete = true;

		const panelItems = this.getAllPanelItems();
		const visibleItems = this.settings.get_strv("visible-items");
		const animationEnabled = this.settings.get_boolean("animation-enabled");
		const animateAllItems = this.settings.get_boolean("animate-all-items");

		// Determine which items to animate vs show instantly
		const itemsToAnimate = animateAllItems
			? panelItems
			: panelItems.filter((item) => !visibleItems.includes(item.name));

		const itemsToShowInstantly = animateAllItems
			? panelItems.filter((item) => visibleItems.includes(item.name))
			: [];

		if (revealed) {
			// Showing: animate affected items
			if (animationEnabled) {
				this.fadeInItems(itemsToAnimate);
			} else {
				this.showItemsInstantly([...itemsToAnimate, ...itemsToShowInstantly]);
			}
		} else {
			// Hiding: animate items being hidden, then restore always-visible
			// Watch for accessible_name changes on existing items so we can
			// re-apply visibility once their real name is available
			panelItems.forEach((item) => {
				this.watchForNameChange(item.actor, item.container);
			});

			if (animationEnabled) {
				this.fadeOutItemsAndRestore(itemsToAnimate, itemsToShowInstantly);
			} else {
				this.hideItemsInstantly(itemsToAnimate);
				this.showItemsInstantly(itemsToShowInstantly);
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
			item.container.visible = true;
			item.container.opacity = 255;
		});
	}

	private hideItemsInstantly(items: PanelItem[]) {
		items.forEach((item) => {
			item.container.visible = false;
		});
	}

	private fadeInItems(items: PanelItem[]) {
		const visibleItems = this.settings.get_strv("visible-items");

		items.forEach((item) => {
			if (!shouldOfferRevealForItem(item, visibleItems)) {
				return;
			}
			this.animationManager.fadeIn(item.container);
		});
	}

	private fadeOutItemsAndRestore(
		itemsToHide: PanelItem[],
		itemsToRestore: PanelItem[],
	) {
		const fadeOutPromises = itemsToHide.map((item) =>
			this.animationManager.fadeOut(item.container),
		);

		Promise.all(fadeOutPromises).then(() => {
			// Fade in the always-visible items (itemsToRestore)
			// itemsToHide stay hidden
			this.fadeInItems(itemsToRestore);
		});
	}

	restoreVisibility() {
		const panelItems = this.getAllPanelItems();
		const visibleItems = this.settings.get_strv("visible-items");

		panelItems.forEach((item) => {
			const shouldBeVisible = visibleItems.includes(item.name);
			item.container.visible = shouldBeVisible;
		});

		logger.debug("Restored panel visibility", {
			totalItems: panelItems.length,
			visibleItemsCount: visibleItems.length,
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
		// Cancel any pending hide timer
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
		if (this.settings.get_string("interaction-mode") !== "hover") {
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

	private handleNewItemVisibility(itemName: string, container: St.Widget) {
		const panelRevealed = this.stateManager.isPanelRevealed();
		const visibleItems = this.settings.get_strv("visible-items");

		if (panelRevealed) {
			// Overall visibility is true (all items shown): show the new item
			container.visible = true;
			container.opacity = 255;
			logger.debug("New item shown (panel revealed)", { itemName });
		} else {
			// Overall visibility is false (items hidden): show only if in visible-items list
			const shouldBeVisible = visibleItems.includes(itemName);
			container.visible = shouldBeVisible;
			container.opacity = 255;
			logger.debug("New item visibility set based on visible-items", {
				itemName,
				visible: shouldBeVisible,
			});
		}
	}

	destroy() {
		this.cancelHoverHideTimer();
		for (const id of this.menuCloseIdleSourceIds) {
			GLib.Source.remove(id);
		}
		this.menuCloseIdleSourceIds.clear();
		this.animationManager.destroy();

		for (const [child, ids] of this.itemHoverHandlers) {
			for (const id of ids) {
				child.disconnect(id);
			}
		}

		this.itemHoverHandlers.clear();

		for (const [child, handlerId] of this.menuOpenStateHandlers) {
			const button = child as PanelMenu.Button;
			if (button.menu) button.menu.disconnect(handlerId);
		}
		this.menuOpenStateHandlers.clear();

		if (this.addedHandlerId !== null) {
			MainPanel._rightBox.disconnect(this.addedHandlerId);
			this.addedHandlerId = null;
		}

		if (this.removedHandlerId !== null) {
			MainPanel._rightBox.disconnect(this.removedHandlerId);
			this.removedHandlerId = null;
		}

		logger.debug("PanelManager destroyed");
	}
}
